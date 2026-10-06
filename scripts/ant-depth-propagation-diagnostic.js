import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const [snapshotArg, followupArg, strikeOutputArg, csvOutputArg] = process.argv.slice(2);
assert.ok(snapshotArg && followupArg && strikeOutputArg && csvOutputArg,
  'Usage: node scripts/ant-depth-propagation-diagnostic.js <snapshot.json.gz> <followup.json> <result.json> <profile.csv>');

const arrayTypes = new Map(['Float32Array', 'Float64Array', 'Uint32Array', 'Int32Array',
  'Uint16Array', 'Uint8Array', 'Int16Array'].map(name => [name, globalThis[name]]));
function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.__typedArray === 'string' && Array.isArray(value.data)) {
    const Type = arrayTypes.get(value.__typedArray);
    assert.ok(Type, `Unsupported diagnostic typed array: ${value.__typedArray}`);
    return Type.from(value.data);
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, revive(entry)]));
}

const snapshotPath = resolve(snapshotArg);
const followupPath = resolve(followupArg);
const strikeOutputPath = resolve(strikeOutputArg);
const csvOutputPath = resolve(csvOutputArg);
const snapshot = revive(JSON.parse(gunzipSync(await readFile(snapshotPath)).toString('utf8')));
const followup = JSON.parse(await readFile(followupPath, 'utf8'));
const futureEvents = followup.result?.futureEvents || followup.futureEvents;
assert.ok(snapshot.topology?.layerIds?.length === 30, 'Expected the exact captured 30-Plate snapshot');
assert.ok(snapshot.dynamic?.physicsSteps > 0, 'Snapshot must contain live processor state');
assert.ok(Array.isArray(futureEvents), 'Missing captured production strike payloads');

const RATE = 6000;
const SLEEP_ENERGY = 1e-10;
const QUIET_STABLE_STEPS = Math.round(RATE * 0.1);
const SAMPLE_STEPS = Math.round(RATE * 0.25);
const MAX_DECAY_STEPS = RATE * 30;
const MAX_RESPONSE_STEPS = RATE * 12;
const snapshotStep = snapshot.dynamic.physicsSteps;
const layerCount = snapshot.topology.layerIds.length;
const nodeCount = snapshot.topology.nodeGridIndices.length;
const layerIds = snapshot.topology.layerIds;
const nodeOffsets = snapshot.topology.nodeOffsets;
const source = await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');

function hashTyped(value) {
  const digest = createHash('sha256');
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    digest.update(key);
    if (ArrayBuffer.isView(item)) digest.update(Buffer.from(item.buffer, item.byteOffset, item.byteLength));
    else digest.update(JSON.stringify(item));
  }
  return digest.digest('hex');
}

function hashDynamicParts(parts, topology) {
  const digest = createHash('sha256');
  for (const key of ['current', 'previous', 'next', 'energyQuiet', 'awake', 'contactForces',
    'contactMemory', 'lastContactStep', 'sphereCurrent', 'spherePrevious', 'pendingWake', 'pendingWakeReason']) {
    const value = parts[key];
    digest.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  const active = parts.active.subarray ? parts.active.subarray(0, parts.activeCount) : parts.active;
  const pendingNodes = parts.pendingNodes.subarray
    ? parts.pendingNodes.subarray(0, parts.pendingCount) : parts.pendingNodes;
  digest.update(Buffer.from(active.buffer, active.byteOffset, active.byteLength));
  digest.update(Buffer.from(pendingNodes.buffer, pendingNodes.byteOffset, pendingNodes.byteLength));
  digest.update(JSON.stringify({ activeCount: parts.activeCount, pendingCount: parts.pendingCount,
    contactCursor: parts.contactCursor, physicsSteps: parts.physicsSteps, topology: topology.layerIds }));
  return digest.digest('hex');
}
function hashDynamic(processor) {
  return hashDynamicParts({ current: processor.current, previous: processor.previous, next: processor.next,
    energyQuiet: processor.energyQuiet, awake: processor.awake, contactForces: processor.contactForces,
    contactMemory: processor.contactMemory, lastContactStep: processor.lastContactStep,
    sphereCurrent: processor.sphereCurrent, spherePrevious: processor.spherePrevious,
    pendingWake: processor.pendingWake, pendingWakeReason: processor.pendingWakeReason,
    active: processor.active, activeCount: processor.activeCount, pendingNodes: processor.pendingNodes,
    pendingCount: processor.pendingCount, contactCursor: processor.contactCursor,
    physicsSteps: processor.telemetry.physicsSteps }, processor.topology);
}

function exposureSummary(topology) {
  const supported = new Uint32Array(layerCount), exposed = new Uint32Array(layerCount);
  const offsets = topology.sourceColumnOffsets, indices = topology.sourceColumnLayerIndices;
  const route = topology.routingTopLayerByCell96;
  for (let cell = 0; cell < route.length; cell++) {
    for (let q = offsets[cell]; q < offsets[cell + 1]; q++) {
      const layer = indices[q];
      supported[layer]++;
      if (route[cell] === layer) exposed[layer]++;
    }
  }
  return layerIds.map((id, layer) => ({ layerId: id, supportedSourceCells: supported[layer],
    exposedSourceCells: exposed[layer], coveredSourceCells: supported[layer] - exposed[layer] }));
}

function strikeColumnSummary(topology, position, topLayer) {
  const x = Math.round(position.x * 95), y = Math.round(position.y * 95), cell = y * 96 + x;
  const stack = [];
  for (let q = topology.sourceColumnOffsets[cell]; q < topology.sourceColumnOffsets[cell + 1]; q++)
    stack.push(topology.layerIds[topology.sourceColumnLayerIndices[q]]);
  const deepestLayerIndex = stack.length ? topology.layerIds.indexOf(stack[0]) : -1;
  return { sourceGrid: { x, y }, sourceCell: cell, routedPlateId: topology.layerIds[topLayer],
    supportedPlateIdsOldestToNewest: stack, deepestCoLocatedPlateId: stack[0] ?? null,
    deepestCoLocatedDepth: deepestLayerIndex >= 0 ? topLayer - deepestLayerIndex : null };
}

function chooseRecordedTopStrike(topology) {
  const topLayer = layerCount - 1;
  const route = topology.routingTopLayerByCell96;
  const strikeEvents = futureEvents.filter(event => event.type === 'strike');
  const valid = strikeEvents.find(event => {
    const p = event.payload;
    if (!p?.position || !Number.isFinite(p.strength) || p.strength <= 0) return false;
    const x = Math.round(p.position.x * 95), y = Math.round(p.position.y * 95);
    return route[y * 96 + x] === topLayer && p.layerId === layerIds[topLayer]
      && p.plateId === layerIds[topLayer];
  });
  assert.ok(valid, `No recorded valid surface strike routes to ${layerIds[topLayer]}`);
  return { eventPhysicsStep: valid.physicsStep, payload: structuredClone(valid.payload),
    routedLayer: route[Math.round(valid.payload.position.y * 95) * 96
      + Math.round(valid.payload.position.x * 95)] };
}

const selectedStrike = chooseRecordedTopStrike(snapshot.topology);

// In-memory observers reuse the recurrence's existing force/energy values.
// The on-disk worklet and its update equations remain untouched.
const anchors = [
  ['const diagnosticCoupling = this.sleepDiagnosticsEnabled && this.sleepDiagnosticCouplingNodes[node] !== 0;', 'couplingMask'],
  ['const quietEnergy = value * value + vel * vel + bendingPotential;', 'quietEnergy'],
  ['this.next[node] = next;', 'next'],
  ['        this.previous[node] -= force;', 'contact'],
  ['    for (let a = 0; a < steppingCount; a++) if (this.awake[this.active[a]]) this.active[write++] = this.active[a];', 'activeCompact'],
  ['        this.active[this.activeCount++] = node; this.telemetry.wakes++;', 'pendingWake']
];
for (const [needle, name] of anchors)
  assert.equal(source.split(needle).length - 1, 1, `Expected one ${name} instrumentation anchor`);

let instrumentedSource = source.replace(anchors[0][0], `const diagnosticCoupling = (this.sleepDiagnosticsEnabled && this.sleepDiagnosticCouplingNodes[node] !== 0)
        || Boolean(this.depthPropagationDiagnostic?.enabled);`);
instrumentedSource = instrumentedSource.replace(anchors[1][0], `const stateEnergyProxy = value * value + vel * vel;
      const quietEnergy = stateEnergyProxy + bendingPotential;
  if (this.depthPropagationDiagnostic?.enabled) {
        const d = this.depthPropagationDiagnostic, energyLayer = this.nodeLayer[node];
        d.stepEnergy[energyLayer] += stateEnergyProxy;
        d.stepQuietEnergy[energyLayer] += quietEnergy;
        if (stateEnergyProxy > d.peakNodeEnergy[node]) d.peakNodeEnergy[node] = stateEnergyProxy;
        if (Math.abs(value) > d.peakAbsDisplacement[energyLayer]) d.peakAbsDisplacement[energyLayer] = Math.abs(value);
        if (Math.abs(vel) > d.peakAbsVelocity[energyLayer]) d.peakAbsVelocity[energyLayer] = Math.abs(vel);
        if (quietEnergy >= SLEEP_ENERGY) {
          d.nodeTimeAboveEnergySteps[node]++;
          if (!d.affectedNodes[node]) { d.affectedNodes[node] = 1; d.affectedNodeCount[energyLayer]++; }
          if (d.firstArrivalStep[energyLayer] < 0) d.firstArrivalStep[energyLayer] = this.telemetry.physicsSteps + 1;
        }
      }`);
instrumentedSource = instrumentedSource.replace(anchors[2][0], `${anchors[2][0]}
      if (this.depthPropagationDiagnostic?.enabled) {
        const d = this.depthPropagationDiagnostic;
        const midpointVelocity = (vel + (next - value)) * 0.5;
        d.zWork[this.nodeLayer[node]] += diagnosticZForce * midpointVelocity;
        d.sphereWork[this.nodeLayer[node]] += diagnosticSphereForce * midpointVelocity;
        d.dampingWork[this.nodeLayer[node]] += (-damping * vel) * midpointVelocity;
      }`);
instrumentedSource = instrumentedSource.replace(anchors[3][0], `        if (this.depthPropagationDiagnostic?.enabled) {
          const d = this.depthPropagationDiagnostic, layer = this.nodeLayer[node];
          const velocityBefore = this.current[node] - this.previous[node];
          d.directContactWork[layer] += force * (velocityBefore + force * 0.5);
        }
${anchors[3][0]}`);
instrumentedSource = instrumentedSource.replace(anchors[4][0], `    for (let a = 0; a < steppingCount; a++) if (this.awake[this.active[a]]) {
      this.active[write++] = this.active[a];
      if (this.depthPropagationDiagnostic?.enabled)
        this.depthPropagationDiagnostic.stepActiveNodes[this.nodeLayer[this.active[a]]]++;
    }`);
instrumentedSource = instrumentedSource.replace(anchors[5][0], `${anchors[5][0]}
        if (this.depthPropagationDiagnostic?.enabled)
          this.depthPropagationDiagnostic.stepActiveNodes[this.nodeLayer[node]]++;`);

let Processor;
class AudioWorkletProcessorStub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
const sandbox = { AudioWorkletProcessor: AudioWorkletProcessorStub,
  registerProcessor(_name, constructor) { Processor = constructor; }, sampleRate: 48000,
  Float32Array, Float64Array, Uint32Array, Int32Array, Uint16Array, Uint8Array, Int16Array,
  Math, Number, Object, Array, Map };
vm.runInNewContext(instrumentedSource, sandbox, { filename: 'surface-plate.worklet.depth-diagnostic.js' });
assert.ok(Processor, 'SurfacePlateProcessor did not register');

const processor = new Processor();
processor.installTopology(snapshot.topology);
const state = snapshot.dynamic;
for (const key of ['current', 'previous', 'next', 'energyQuiet', 'awake', 'contactForces',
  'contactMemory', 'lastContactStep', 'sphereCurrent', 'spherePrevious']) processor[key].set(state[key]);
processor.active.set(state.active);
processor.activeCount = state.activeCount;
if (state.pendingWake) processor.pendingWake.set(state.pendingWake);
if (state.pendingWakeReason) processor.pendingWakeReason.set(state.pendingWakeReason);
if (state.pendingNodes) processor.pendingNodes.set(state.pendingNodes);
processor.pendingCount = state.pendingCount || 0;
processor.contactCursor = state.contactCursor;
processor.telemetry = { ...state.telemetry };
processor.telemetry.physicsSteps = state.physicsSteps;

const topologyHashAtStart = hashTyped(snapshot.topology);
const sourceSnapshotDynamicHash = hashDynamicParts(state, snapshot.topology);
const loadedSnapshotDynamicHash = hashDynamic(processor);
assert.equal(loadedSnapshotDynamicHash, sourceSnapshotDynamicHash,
  'Processor restore did not preserve the captured dynamic-state hash');
const initialTelemetry = { strikes: processor.telemetry.strikes, dropped: processor.telemetry.dropped,
  droppedRoutes: processor.telemetry.droppedRoutes, nonFinite: processor.telemetry.nonFinite };
const decayStartStep = processor.telemetry.physicsSteps;
let quietRun = 0;
let baselineQuiescentStep = null;
while (processor.telemetry.physicsSteps - decayStartStep < MAX_DECAY_STEPS) {
  processor.advancePhysics();
  const decaySteps = processor.telemetry.physicsSteps - decayStartStep;
  if (decaySteps > 0 && decaySteps % RATE === 0)
    console.log(JSON.stringify({ phase: 'baseline-decay', simulatedSeconds: decaySteps / RATE,
      activePlateNodes: processor.activeCount, activeSphereModes: processor.telemetry.activeSphereModes }));
  if (processor.activeCount === 0 && processor.telemetry.activeSphereModes === 0) quietRun++;
  else quietRun = 0;
  if (quietRun >= QUIET_STABLE_STEPS) {
    baselineQuiescentStep = processor.telemetry.physicsSteps - QUIET_STABLE_STEPS + 1;
    break;
  }
}
assert.ok(baselineQuiescentStep !== null,
  'Captured Plate/Sphere state did not reach 100 ms of full-network quiet within 15 physics seconds');

const baselineStateHash = hashDynamic(processor);
const baselineTopologyHash = hashTyped(processor.topology);
assert.equal(baselineTopologyHash, topologyHashAtStart, 'Topology changed during the frozen decay phase');
assert.equal(processor.activeCount, 0, 'Baseline must have no active Plate nodes before the strike');
assert.equal(processor.telemetry.activeSphereModes, 0, 'Baseline must have no active Sphere modes before the strike');

const exposure = exposureSummary(processor.topology);
const diag = {
  enabled: false,
  stepEnergy: new Float64Array(layerCount), stepQuietEnergy: new Float64Array(layerCount),
  stepActiveNodes: new Uint32Array(layerCount),
  peakEnergy: new Float64Array(layerCount), peakAbsDisplacement: new Float64Array(layerCount),
  peakAbsVelocity: new Float64Array(layerCount), peakNodeEnergy: new Float32Array(nodeCount),
  nodeTimeAboveEnergySteps: new Uint32Array(nodeCount), affectedNodes: new Uint8Array(nodeCount),
  affectedNodeCount: new Uint32Array(layerCount), firstArrivalStep: new Int32Array(layerCount),
  firstWakeStep: new Int32Array(layerCount), wakeTransitions: new Uint32Array(layerCount),
  uniqueWokeNodes: new Uint32Array(layerCount), wakeSeen: new Uint8Array(nodeCount),
  zWork: new Float64Array(layerCount), sphereWork: new Float64Array(layerCount),
  dampingWork: new Float64Array(layerCount), directContactWork: new Float64Array(layerCount),
  layerAboveSteps: new Uint32Array(layerCount), activeNodeSteps: new Float64Array(layerCount),
  inactiveSinceStep: new Int32Array(layerCount), stableSleepAgainStep: new Int32Array(layerCount),
  reawakenedAfterStableSleep: new Uint8Array(layerCount),
  timeSeries: [], strikeStep: processor.telemetry.physicsSteps
};
diag.firstArrivalStep.fill(-1);
diag.firstWakeStep.fill(-1);
diag.inactiveSinceStep.fill(-1);
diag.stableSleepAgainStep.fill(-1);
processor.depthPropagationDiagnostic = diag;

const originalWakeNode = processor.wakeNode.bind(processor);
processor.wakeNode = function (node, reason = 0, magnitude = 0, options = null) {
  const d = this.depthPropagationDiagnostic;
  const isNewTransition = d?.enabled && node >= 0 && node < this.awake.length
    && !this.awake[node] && !this.pendingWake[node];
  if (isNewTransition) {
    const layer = this.nodeLayer[node];
    d.wakeTransitions[layer]++;
    if (!d.wakeSeen[node]) { d.wakeSeen[node] = 1; d.uniqueWokeNodes[layer]++; }
    if (d.firstWakeStep[layer] < 0) d.firstWakeStep[layer] = this.telemetry.physicsSteps;
  }
  return originalWakeNode(node, reason, magnitude, options);
};

const originalAdvance = processor.advancePhysics.bind(processor);
processor.advancePhysics = function () {
  const d = this.depthPropagationDiagnostic;
  if (d?.enabled) { d.stepEnergy.fill(0); d.stepQuietEnergy.fill(0); d.stepActiveNodes.fill(0); }
  originalAdvance();
  if (!d?.enabled || this.telemetry.physicsSteps <= d.strikeStep) return;
  const step = this.telemetry.physicsSteps;
  const elapsedSteps = step - d.strikeStep;
  for (let layer = 0; layer < layerCount; layer++) {
    if (d.stepEnergy[layer] > d.peakEnergy[layer]) d.peakEnergy[layer] = d.stepEnergy[layer];
    if (d.stepQuietEnergy[layer] >= SLEEP_ENERGY) d.layerAboveSteps[layer]++;
    d.activeNodeSteps[layer] += d.stepActiveNodes[layer];
    if (d.firstWakeStep[layer] >= 0 && d.stepActiveNodes[layer] === 0) {
      if (d.inactiveSinceStep[layer] < 0) d.inactiveSinceStep[layer] = step;
      if (d.stableSleepAgainStep[layer] < 0
        && step - d.inactiveSinceStep[layer] + 1 >= QUIET_STABLE_STEPS)
        d.stableSleepAgainStep[layer] = d.inactiveSinceStep[layer];
    } else if (d.firstWakeStep[layer] >= 0) {
      if (d.stableSleepAgainStep[layer] >= 0) d.reawakenedAfterStableSleep[layer] = 1;
      d.inactiveSinceStep[layer] = -1;
    }
  }
  if (elapsedSteps % SAMPLE_STEPS === 0) {
    d.timeSeries.push({ elapsedMs: elapsedSteps * 1000 / RATE,
      globalActivePlateNodes: this.activeCount, activeSphereModes: this.telemetry.activeSphereModes,
      layers: layerIds.map((id, layer) => ({ plateId: id, depth: layerCount - 1 - layer,
        stateEnergyProxy: d.stepEnergy[layer], activeNodes: d.stepActiveNodes[layer],
        quietEnergyProxy: d.stepQuietEnergy[layer],
        cumulativeSignedZWork: d.zWork[layer], cumulativeSignedSphereWork: d.sphereWork[layer],
        cumulativeDampingDissipationProxy: -d.dampingWork[layer] })) });
  }
  if (elapsedSteps > 0 && elapsedSteps % RATE === 0)
    console.log(JSON.stringify({ phase: 'single-strike-response', simulatedSeconds: elapsedSteps / RATE,
      activePlateNodes: this.activeCount, activeSphereModes: this.telemetry.activeSphereModes }));
};

const startStrikeTelemetry = { ...processor.telemetry };
diag.enabled = true;
processor.handleMessage({ type: 'strike', payload: selectedStrike.payload });
const acceptedStrikeCount = processor.telemetry.strikes - startStrikeTelemetry.strikes;
const strikePhysicsStep = processor.telemetry.physicsSteps;
assert.equal(acceptedStrikeCount, 1, 'Production strike path did not accept exactly one strike');
assert.equal(processor.telemetry.droppedRoutes - startStrikeTelemetry.droppedRoutes, 0, 'Strike was dropped by routing');

let stableQuietSteps = 0;
const maxEndStep = strikePhysicsStep + MAX_RESPONSE_STEPS;
while (processor.telemetry.physicsSteps < maxEndStep) {
  processor.advancePhysics();
  if (processor.activeCount === 0 && processor.telemetry.activeSphereModes === 0) stableQuietSteps++;
  else stableQuietSteps = 0;
  if (stableQuietSteps >= RATE) break;
}
if (diag.timeSeries.at(-1)?.elapsedMs !== (processor.telemetry.physicsSteps - strikePhysicsStep) * 1000 / RATE) {
  const elapsedSteps = processor.telemetry.physicsSteps - strikePhysicsStep;
  diag.timeSeries.push({ elapsedMs: elapsedSteps * 1000 / RATE,
    globalActivePlateNodes: processor.activeCount, activeSphereModes: processor.telemetry.activeSphereModes,
    layers: layerIds.map((id, layer) => ({ plateId: id, depth: layerCount - 1 - layer,
      stateEnergyProxy: diag.stepEnergy[layer], activeNodes: diag.stepActiveNodes[layer],
      quietEnergyProxy: diag.stepQuietEnergy[layer],
      cumulativeSignedZWork: diag.zWork[layer], cumulativeSignedSphereWork: diag.sphereWork[layer],
      cumulativeDampingDissipationProxy: -diag.dampingWork[layer] })) });
}

const finalStep = processor.telemetry.physicsSteps;
const durationSteps = finalStep - strikePhysicsStep;
const durationMs = durationSteps * 1000 / RATE;
const struckLayerIndex = selectedStrike.routedLayer;
const surfacePeakEnergy = diag.peakEnergy[struckLayerIndex];
assert.ok(surfacePeakEnergy > 0, 'Strike did not produce measurable state energy on the routed surface Plate');
const relativeEnergyFloor = Math.max(surfacePeakEnergy * 1e-12, 1e-30);

const profile = layerIds.map((plateId, layer) => {
  const start = nodeOffsets[layer], end = nodeOffsets[layer + 1], count = end - start;
  let sumNodeAboveSteps = 0, maxNodeAboveSteps = 0;
  for (let node = start; node < end; node++) {
    const above = diag.nodeTimeAboveEnergySteps[node];
    sumNodeAboveSteps += above; maxNodeAboveSteps = Math.max(maxNodeAboveSteps, above);
  }
  const peakEnergy = diag.peakEnergy[layer];
  const depth = struckLayerIndex - layer;
  const exposureRow = exposure[layer];
  const firstArrivalMs = diag.firstArrivalStep[layer] >= 0
    ? (diag.firstArrivalStep[layer] - strikePhysicsStep) * 1000 / RATE : null;
  const firstWakeMs = diag.firstWakeStep[layer] >= 0
    ? (diag.firstWakeStep[layer] - strikePhysicsStep) * 1000 / RATE : null;
  const firstSleepMs = diag.stableSleepAgainStep[layer] >= 0
    ? (diag.stableSleepAgainStep[layer] - strikePhysicsStep) * 1000 / RATE : null;
  const awakeDurationMs = count ? diag.activeNodeSteps[layer] * 1000 / RATE / count : 0;
  const layerEnergyAboveSleepMs = diag.layerAboveSteps[layer] * 1000 / RATE;
  const meanNodeAboveMs = count ? sumNodeAboveSteps * 1000 / RATE / count : 0;
  const maxNodeAboveMs = maxNodeAboveSteps * 1000 / RATE;
  const woke = diag.uniqueWokeNodes[layer] > 0;
  return {
    depth, layerIndex: layer, plateId, nodeCount: count,
    burialExposureSummary: `supported=${exposureRow.supportedSourceCells}; exposed=${exposureRow.exposedSourceCells}; covered=${exposureRow.coveredSourceCells}`,
    supportedSourceCells: exposureRow.supportedSourceCells,
    exposedSourceCells: exposureRow.exposedSourceCells,
    coveredSourceCells: exposureRow.coveredSourceCells,
    peakEnergy, relativePeakEnergyToSurfaceDb: 10 * Math.log10(Math.max(peakEnergy, relativeEnergyFloor) / surfacePeakEnergy),
    peakAbsDisplacement: diag.peakAbsDisplacement[layer], peakAbsVelocity: diag.peakAbsVelocity[layer],
    signedZWork: diag.zWork[layer], signedSphereWork: diag.sphereWork[layer],
    dampingDissipationProxy: -diag.dampingWork[layer], directContactInjectedEnergy: diag.directContactWork[layer],
    firstArrivalMs, firstWakeMs, woke, wakeNodeCount: diag.uniqueWokeNodes[layer],
    wakeTransitions: diag.wakeTransitions[layer],
    affectedNodeCount: diag.affectedNodeCount[layer], affectedNodeFraction: count ? diag.affectedNodeCount[layer] / count : 0,
    layerTimeAboveSleepEnergyMs: layerEnergyAboveSleepMs,
    meanNodeTimeAboveSleepEnergyMs: meanNodeAboveMs, maxNodeTimeAboveSleepEnergyMs: maxNodeAboveMs,
    meanNodeAwakeDurationMs: awakeDurationMs, sleptAgain: firstSleepMs !== null,
    reawakenedAfterStableSleep: Boolean(diag.reawakenedAfterStableSleep[layer]),
    sleepAgainMs: firstSleepMs, finalActiveNodes: diag.timeSeries.at(-1)?.layers[layer].activeNodes ?? null
  };
});

const directLayer = profile.find(row => row.layerIndex === struckLayerIndex);
const oldestLayer = profile[0];
const dB20Count = profile.filter(row => row.relativePeakEnergyToSurfaceDb > -20).length;
const dB40Count = profile.filter(row => row.relativePeakEnergyToSurfaceDb > -40).length;
const layersWoke = profile.filter(row => row.woke).length;
const result = {
  purpose: 'One-strike depth-propagation diagnosis from the captured natural 30-Plate state',
  sourceSnapshot: snapshotPath, sourceSnapshotStep: snapshotStep,
  sourceSnapshotDynamicStateSha256: sourceSnapshotDynamicHash,
  decayPhase: { frozenTopology: true, strikeMessages: 0, topologyMessages: 0,
    maxSeconds: MAX_DECAY_STEPS / RATE,
    elapsedSeconds: (strikePhysicsStep - decayStartStep) / RATE,
    requiredStableQuietMs: QUIET_STABLE_STEPS * 1000 / RATE,
    baselinePhysicsStep: processor.telemetry.physicsSteps, baselineDynamicStateSha256: baselineStateHash,
    baselineTopologySha256: baselineTopologyHash,
    activePlateNodesAtStrike: processor.activeCount, activeSphereModesAtStrike: processor.telemetry.activeSphereModes },
  strike: { productionPath: 'SurfacePlateProcessor.handleMessage({type:"strike"}) -> applyStrike',
    recordedEventPhysicsStep: selectedStrike.eventPhysicsStep, physicsStep: strikePhysicsStep,
    acceptedStrikeCount: acceptedStrikeCount, totalStrikeMessagesSent: 1, droppedRouteDelta: 0,
    layerId: layerIds[struckLayerIndex], layerIndex: struckLayerIndex,
    position: selectedStrike.payload.position, strength: selectedStrike.payload.strength,
    footprintRadius: selectedStrike.payload.footprintRadius,
    routeConfirmedAtCapturedTopology: layerIds[selectedStrike.routedLayer],
    pulseDurationMs: 1000 * Math.round(RATE * 0.003) / RATE,
    localRecoveryMs: 1000 * RATE * 0.075 / RATE,
    dampingMultiplier: 50, topologyFrozen: true },
  strikeColumn: strikeColumnSummary(processor.topology, selectedStrike.payload.position, struckLayerIndex),
  response: { elapsedSeconds: durationMs / 1000, maximumSeconds: MAX_RESPONSE_STEPS / RATE,
    quietStableStopMs: 1000 * RATE / RATE, globalActivePlateNodesAtEnd: processor.activeCount,
    activeSphereModesAtEnd: processor.telemetry.activeSphereModes,
    globalQuietAtEnd: processor.activeCount === 0 && processor.telemetry.activeSphereModes === 0,
    initialTopologySha256: topologyHashAtStart, finalTopologySha256: hashTyped(processor.topology),
    topologyUnchanged: topologyHashAtStart === hashTyped(processor.topology),
    strikeDelta: processor.telemetry.strikes - initialTelemetry.strikes,
    extraStrikeMessages: 0,
    nonFiniteDelta: processor.telemetry.nonFinite - initialTelemetry.nonFinite,
    droppedDelta: processor.telemetry.dropped - initialTelemetry.dropped,
    droppedRouteDelta: processor.telemetry.droppedRoutes - initialTelemetry.droppedRoutes },
  workDefinition: 'Signed solver-space work proxy per Plate layer: sum(applied force * midpoint velocity), midpoint=(vBefore+vAfter)/2. Direct contact uses the exact discrete impulse increment force*(vBefore+force/2). Values are recurrence units, not joules.',
  energyDefinition: 'Plate state-energy proxy is sum over layer nodes of current^2 + velocity^2, with velocity=current-previous. Arrival/affected/time-above use the exact sleep quietEnergy (state proxy plus the solver bending-potential term) crossing SLEEP_ENERGY=1e-10.',
  dBDefinition: `relativePeakEnergyDb=10*log10(max(layerPeakEnergy,floor)/surfacePeakEnergy); floor=max(surfacePeakEnergy*1e-12,1e-30), giving a -120 dB relative floor.`,
  surfaceLayerPeakEnergyProxy: surfacePeakEnergy, relativeEnergyFloor,
  counts: { layerCount, layersAboveMinus20Db: dB20Count, layersAboveMinus40Db: dB40Count,
    layersThatWoke: layersWoke, oldestPlateId: oldestLayer.plateId,
    oldestPlatePeakEnergyProxy: oldestLayer.peakEnergy, oldestPlateRelativeDb: oldestLayer.relativePeakEnergyToSurfaceDb,
    oldestPlateWoke: oldestLayer.woke, oldestPlateFirstArrivalMs: oldestLayer.firstArrivalMs,
    oldestPlateSignedZWork: oldestLayer.signedZWork, oldestPlateSignedSphereWork: oldestLayer.signedSphereWork,
    oldestPlateAffectedNodeFraction: oldestLayer.affectedNodeFraction },
  selectedRepresentativeLayers: [directLayer, profile[Math.floor(layerCount / 2)], oldestLayer],
  profile, timeSeries: diag.timeSeries,
  sourceWorkletSha256: createHash('sha256').update(source).digest('hex'),
  runtimeObservedWorkletSha256: createHash('sha256').update(instrumentedSource).digest('hex'),
  snapshotRestoreStateHashVerified: loadedSnapshotDynamicHash === sourceSnapshotDynamicHash,
  workletOnDiskUnchanged: true,
  sourceStreamStrikeCount: futureEvents.filter(event => event.type === 'strike').length,
  sourceStreamUsedOnlyAsPayload: true
};

assert.equal(result.response.strikeDelta, 1, 'Expected exactly one accepted strike in the complete run');
assert.equal(result.response.nonFiniteDelta, 0, 'A non-finite value occurred during the run');
assert.equal(result.response.droppedRouteDelta, 0, 'The direct strike route was dropped');
assert.equal(result.response.topologyUnchanged, true, 'Frozen topology hash changed');
assert.ok(profile.length === layerCount && directLayer.plateId === layerIds.at(-1), 'Profile does not cover all layers');

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
const columns = ['depth', 'plateId', 'nodeCount', 'burialExposureSummary', 'peakEnergy',
  'relativePeakEnergyToSurface_dB', 'peakAbsDisplacement', 'peakAbsVelocity', 'signedZWork',
  'signedSphereWork', 'directContactInjectedEnergy', 'dampingDissipationProxy', 'firstArrivalMs',
  'firstWakeMs', 'woke', 'wakeNodeCount', 'affectedNodeCount', 'affectedNodeFraction',
  'layerTimeAboveSleepEnergyMs', 'meanNodeTimeAboveSleepEnergyMs', 'maxNodeTimeAboveSleepEnergyMs',
  'meanNodeAwakeDurationMs', 'sleepAgainMs', 'sleptAgain', 'finalActiveNodes'];
const csv = [columns.join(','), ...profile.map(row => columns.map(column => csvCell(
  column === 'relativePeakEnergyToSurface_dB' ? row.relativePeakEnergyToSurfaceDb : row[column])).join(','))].join('\n') + '\n';
await mkdir(dirname(strikeOutputPath), { recursive: true });
await writeFile(strikeOutputPath, JSON.stringify(result, null, 2));
await writeFile(csvOutputPath, csv);
console.log(JSON.stringify({ result: strikeOutputPath, csv: csvOutputPath,
  strike: result.strike, baselineSeconds: result.decayPhase.elapsedSeconds,
  firstArrivalOldestMs: oldestLayer.firstArrivalMs, oldestPeakDb: oldestLayer.relativePeakEnergyToSurfaceDb,
  layersAboveMinus20Db: dB20Count, layersAboveMinus40Db: dB40Count, layersThatWoke: layersWoke,
  finite: result.response.nonFiniteDelta === 0, strikeDelta: result.response.strikeDelta,
  globalQuietAtEnd: result.response.globalQuietAtEnd }, null, 2));
