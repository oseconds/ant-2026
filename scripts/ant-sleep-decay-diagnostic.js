import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const [snapshotArg, outputArg] = process.argv.slice(2);
assert.ok(snapshotArg && outputArg,
  'Usage: node scripts/ant-sleep-decay-diagnostic.js <snapshot.json.gz> <output.json>');

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
const outputPath = resolve(outputArg);
const snapshot = revive(JSON.parse(gunzipSync(await readFile(snapshotPath)).toString('utf8')));
assert.equal(snapshot.topology?.layerIds?.length, 30, 'Expected the captured 30-Plate milestone snapshot');
assert.ok(snapshot.dynamic?.physicsSteps > 0, 'Snapshot must contain a live processor state');

const RATE = 6000;
const DURATION_SECONDS = 10;
const WINDOW_STEPS = RATE * DURATION_SECONDS;
const SAMPLE_STEPS = RATE;
const snapshotStep = snapshot.dynamic.physicsSteps;
const endStep = snapshotStep + WINDOW_STEPS;
const oldestStart = snapshot.topology.nodeOffsets[0];
const oldestEnd = snapshot.topology.nodeOffsets[1];
const oldestId = snapshot.topology.layerIds[0];
const source = await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');

// Runtime-only, read-only observations at solver points where the worklet has
// already computed these terms. No source file or solver recurrence is changed.
const quietAnchor = 'const quietEnergy = value * value + vel * vel + bendingPotential;';
const recurrenceAnchor = 'this.next[node] = next;';
const contactAnchor = '      if (force !== 0) {';
assert.equal(source.split(quietAnchor).length - 1, 1, 'Expected one sleep-energy calculation');
assert.equal(source.split(recurrenceAnchor).length - 1, 1, 'Expected one recurrence state write');
assert.equal(source.split(contactAnchor).length - 1, 1, 'Expected one contact-pulse application');
let instrumentedSource = source.replace(quietAnchor, `${quietAnchor}
      if (this.decayDiagnostic && node >= this.decayDiagnostic.nodeStart && node < this.decayDiagnostic.nodeEnd)
        this.decayDiagnostic.stepQuietEnergy += quietEnergy;`);
instrumentedSource = instrumentedSource.replace(recurrenceAnchor, `${recurrenceAnchor}
      if (this.decayDiagnostic && node >= this.decayDiagnostic.nodeStart && node < this.decayDiagnostic.nodeEnd) {
        const velocityAfter = next - value;
        const midpointVelocity = (vel + velocityAfter) * 0.5;
        this.decayDiagnostic.zWork += diagnosticZForce * midpointVelocity;
        this.decayDiagnostic.sphereWork += diagnosticSphereForce * midpointVelocity;
        this.decayDiagnostic.dampingWork += (-damping * vel) * midpointVelocity;
      }`);
instrumentedSource = instrumentedSource.replace(contactAnchor, `${contactAnchor}
        if (this.decayDiagnostic && node >= this.decayDiagnostic.nodeStart && node < this.decayDiagnostic.nodeEnd) {
          const velocityBefore = this.current[node] - this.previous[node];
          this.decayDiagnostic.directContactWork += force * (velocityBefore + force * 0.5);
        }`);
assert.notEqual(instrumentedSource, source, 'Diagnostic source injection failed');

let Processor;
class AudioWorkletProcessorStub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
const sandbox = {
  AudioWorkletProcessor: AudioWorkletProcessorStub,
  registerProcessor(_name, constructor) { Processor = constructor; },
  sampleRate: 48000,
  Float32Array, Float64Array, Uint32Array, Int32Array, Uint16Array, Uint8Array, Int16Array,
  Math, Number, Object, Array, Map, Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array, Float64Array
};
vm.runInNewContext(instrumentedSource, sandbox, { filename: 'surface-plate.worklet.decay-diagnostic.js' });
assert.ok(Processor, 'SurfacePlateProcessor did not register');

function copyTopology(condition) {
  const topology = structuredClone(snapshot.topology);
  if (condition.disableZ) {
    topology.adjacentLinkNodes = new Uint32Array(0);
    topology.adjacentLinkCoefficients = new Float32Array(0);
  }
  if (condition.disableSphere) topology.noduleCouplingWeights.fill(0);
  return topology;
}

function makeProcessor(condition) {
  const processor = new Processor();
  processor.setSleepDiagnostics(true);
  processor.installTopology(copyTopology(condition));
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
  processor.clearSleepDiagnosticCounters();

  // Detailed sleep tracking is limited to the oldest Plate. Split coupling
  // sums are enabled there for all of its nodes, including Sphere-only nodes.
  processor.sleepDiagnosticTrackedNodes.fill(0);
  processor.sleepDiagnosticTrackedNodes.fill(1, oldestStart, oldestEnd);
  processor.sleepDiagnosticLayerByIndex.fill(null);
  const oldestStats = processor.sleepDiagnosticLayers.get(oldestId);
  processor.sleepDiagnosticLayerByIndex[0] = oldestStats;
  processor.sleepDiagnosticCouplingNodes.fill(0);
  processor.sleepDiagnosticCouplingNodes.fill(1, oldestStart, oldestEnd);
  processor.decayDiagnostic = { nodeStart: oldestStart, nodeEnd: oldestEnd,
    stepQuietEnergy: 0, zWork: 0, sphereWork: 0, dampingWork: 0, directContactWork: 0 };
  return { processor, oldestStats };
}

function sha256State(processor) {
  const digest = createHash('sha256');
  for (const key of ['current', 'previous', 'next', 'energyQuiet', 'awake', 'contactForces',
    'contactMemory', 'lastContactStep', 'sphereCurrent', 'spherePrevious']) {
    const value = processor[key];
    digest.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  digest.update(JSON.stringify({ active: [...processor.active.subarray(0, processor.activeCount)],
    activeCount: processor.activeCount, physicsSteps: processor.telemetry.physicsSteps }));
  return digest.digest('hex');
}

function activeOldestCount(processor) {
  let count = 0;
  for (let i = 0; i < processor.activeCount; i++)
    if (processor.nodeLayer[processor.active[i]] === 0) count++;
  return count;
}

function stateEnergyProxy(processor) {
  let energy = 0;
  for (let node = oldestStart; node < oldestEnd; node++) {
    const value = processor.current[node], velocity = value - processor.previous[node];
    energy += value * value + velocity * velocity;
  }
  return energy;
}

const conditions = [
  { id: 'A', label: 'Full network; no new direct strikes', disableZ: false, disableSphere: false },
  { id: 'B', label: 'No new direct strikes; Z coupling off', disableZ: true, disableSphere: false },
  { id: 'C', label: 'No new direct strikes; Sphere coupling off', disableZ: false, disableSphere: true },
  { id: 'D', label: 'No new direct strikes; Z and Sphere off; topology frozen', disableZ: true, disableSphere: true }
];

const results = [];
for (const condition of conditions) {
  const { processor, oldestStats } = makeProcessor(condition);
  const diag = processor.decayDiagnostic;
  const samples = [{ elapsedSeconds: 0, physicsStep: snapshotStep,
    totalPlateStateEnergyProxy: stateEnergyProxy(processor), quietEnergyProxy: null,
    dampingDissipationProxy: 0, signedZCouplingWork: 0, signedSphereCouplingWork: 0,
    directContactInjectedEnergy: 0, maxQuietStreak: Math.max(...processor.sleepDiagnosticMaxQuiet.subarray(oldestStart, oldestEnd)),
    firstSleepSeconds: oldestStats.sleeps > 0 ? 0 : null, activeNodeCount: activeOldestCount(processor),
    asleepNodeCount: oldestEnd - oldestStart - activeOldestCount(processor) }];
  const lastWork = { dampingWork: 0, zWork: 0, sphereWork: 0, directContactWork: 0 };
  let firstSleepSeconds = oldestStats.sleeps > 0 ? 0 : null;
  const originalAdvance = processor.advancePhysics.bind(processor);
  processor.advancePhysics = function () {
    diag.stepQuietEnergy = 0;
    const sleepCountBefore = oldestStats.sleeps;
    originalAdvance();
    if (firstSleepSeconds === null && oldestStats.sleeps > sleepCountBefore)
      firstSleepSeconds = (this.telemetry.physicsSteps - snapshotStep) / RATE;
    const elapsedSteps = this.telemetry.physicsSteps - snapshotStep;
    if (elapsedSteps > 0 && elapsedSteps % SAMPLE_STEPS === 0) {
      const activeCount = activeOldestCount(this);
      const maxQuietStreak = Math.max(...this.sleepDiagnosticMaxQuiet.subarray(oldestStart, oldestEnd));
      samples.push({ elapsedSeconds: elapsedSteps / RATE, physicsStep: this.telemetry.physicsSteps,
        totalPlateStateEnergyProxy: stateEnergyProxy(this), quietEnergyProxy: diag.stepQuietEnergy,
        dampingDissipationProxy: -(diag.dampingWork - lastWork.dampingWork),
        cumulativeDampingDissipationProxy: -diag.dampingWork,
        signedZCouplingWork: diag.zWork - lastWork.zWork,
        cumulativeSignedZCouplingWork: diag.zWork,
        signedSphereCouplingWork: diag.sphereWork - lastWork.sphereWork,
        cumulativeSignedSphereCouplingWork: diag.sphereWork,
        directContactInjectedEnergy: diag.directContactWork - lastWork.directContactWork,
        cumulativeDirectContactInjectedEnergy: diag.directContactWork,
        maxQuietStreak: maxQuietStreak, firstSleepSeconds,
        activeNodeCount: activeCount, asleepNodeCount: oldestEnd - oldestStart - activeCount });
      lastWork.dampingWork = diag.dampingWork;
      lastWork.zWork = diag.zWork;
      lastWork.sphereWork = diag.sphereWork;
      lastWork.directContactWork = diag.directContactWork;
    }
  };

  const initialSha256 = sha256State(processor);
  while (processor.telemetry.physicsSteps < endStep) processor.advancePhysics();
  assert.equal(processor.telemetry.physicsSteps, endStep, `${condition.id} did not finish the 10 second window`);
  const finalSample = samples.at(-1);
  results.push({ ...condition, topologyFrozen: true, newStrikeMessages: 0, topologyMessages: 0,
    residualSnapshotContactPulsePreserved: true, oldestPlate: oldestId, nodeCount: oldestEnd - oldestStart,
    startStep: snapshotStep, endStep, simulatedSeconds: DURATION_SECONDS,
    initialStateSha256: initialSha256, finalStateSha256: sha256State(processor),
    sleepCount: oldestStats.sleeps, firstSleepSeconds, maxQuietStreak: finalSample.maxQuietStreak,
    cumulativeSignedZCouplingWork: diag.zWork,
    cumulativeSignedSphereCouplingWork: diag.sphereWork,
    cumulativeDampingWork: diag.dampingWork,
    cumulativeDampingDissipationProxy: -diag.dampingWork,
    cumulativeDirectContactInjectedEnergy: diag.directContactWork,
    finalActiveNodeCount: finalSample.activeNodeCount, samples });
  console.log(JSON.stringify({ condition: condition.id, seconds: DURATION_SECONDS,
    sleeps: oldestStats.sleeps, firstSleepSeconds, maxQuietStreak: finalSample.maxQuietStreak,
    finalActiveNodes: finalSample.activeNodeCount, zWork: diag.zWork,
    sphereWork: diag.sphereWork, dampingWork: diag.dampingWork }));
}

const output = { purpose: 'Diagnostic-only 10 second decay replay from the captured 30-Plate snapshot',
  sourceSnapshot: snapshotPath, sourceSnapshotStep: snapshotStep, sourceSnapshotTopologyLayers: snapshot.topology.layerIds.length,
  oldestPlate: oldestId, oldestPlateNodeCount: oldestEnd - oldestStart,
  physicsRateHz: RATE, secondsPerReplay: DURATION_SECONDS, stepsPerReplay: WINDOW_STEPS,
  topologyPolicy: 'All four replays keep the captured topology fixed; no topology messages are applied. D explicitly disables topology changes as requested.',
  strikePolicy: 'No strike messages are replayed. Any in-flight contact pulse already present in the captured state is preserved and its signed injected energy is measured.',
  workDefinition: 'Solver-space discrete work proxy: per-node applied coupling/damping force times midpoint velocity (v_before + v_after)/2. Direct impulse uses force * (v_before + force/2). These are relative recurrence units, not joules.',
  energyDefinition: 'Total Plate state proxy is sum(current^2 + velocity^2); quietEnergyProxy is the sum of the solver quietEnergy evaluated across oldest-Plate active nodes on the sampled step.',
  sourceWorkletSha256: createHash('sha256').update(source).digest('hex'),
  replayInstrumentedWorkletSha256: createHash('sha256').update(instrumentedSource).digest('hex'),
  recurrenceSourceUnchanged: true, conditions: results };
await writeFile(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ output: outputPath, conditions: results.map(result => ({ id: result.id,
  sleepCount: result.sleepCount, firstSleepSeconds: result.firstSleepSeconds,
  maxQuietStreak: result.maxQuietStreak, zWork: result.cumulativeSignedZCouplingWork,
  sphereWork: result.cumulativeSignedSphereCouplingWork })) }, null, 2));
