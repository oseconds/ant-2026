import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const [snapshotArg, followupArg, outputArg] = process.argv.slice(2);
assert.ok(snapshotArg && followupArg && outputArg,
  'Usage: node scripts/ant-target-energy-wake-gate-validation.js <snapshot.json.gz> <followup.json> <result.json>');
const types = new Map(['Float32Array', 'Float64Array', 'Uint32Array', 'Int32Array', 'Uint16Array',
  'Uint8Array', 'Int16Array'].map(name => [name, globalThis[name]]));
function revive(value) {
  if (Array.isArray(value)) return value.map(revive);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.__typedArray === 'string' && Array.isArray(value.data)) {
    const Type = types.get(value.__typedArray);
    assert.ok(Type, `Unsupported typed array ${value.__typedArray}`);
    return Type.from(value.data);
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, revive(entry)]));
}

const snapshotPath = resolve(snapshotArg), followupPath = resolve(followupArg), outputPath = resolve(outputArg);
const snapshotBytes = await readFile(snapshotPath);
const snapshot = revive(JSON.parse(gunzipSync(snapshotBytes).toString('utf8')));
const followup = JSON.parse(await readFile(followupPath, 'utf8'));
const events = followup.result?.futureEvents || followup.futureEvents;
assert.ok(snapshot.topology?.layerIds?.length === 30, 'Expected the captured 30-Plate snapshot');
assert.ok(Array.isArray(events), 'Missing recorded contact stream');
const RATE = 6000, SLEEP_ENERGY = 1e-10, WAKE_ENERGY = 1e-10;
const QUIET_STABLE_STEPS = RATE / 10, MAX_DECAY_STEPS = RATE * 30, MAX_RESPONSE_STEPS = RATE * 12;
const ids = snapshot.topology.layerIds, layers = ids.length, nodes = snapshot.topology.nodeGridIndices.length;
const nodeLayer = new Uint16Array(nodes);
for (let layer = 0; layer < layers; layer++)
  nodeLayer.fill(layer, snapshot.topology.nodeOffsets[layer], snapshot.topology.nodeOffsets[layer + 1]);
const source = await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const validStrike = events.find(event => {
  if (event.type !== 'strike') return false;
  const p = event.payload, x = Math.round(p.position.x * 95), y = Math.round(p.position.y * 95);
  return Number.isFinite(p.strength) && p.strength > 0
    && snapshot.topology.routingTopLayerByCell96[y * 96 + x] === layers - 1
    && p.layerId === ids.at(-1) && p.plateId === ids.at(-1);
});
assert.ok(validStrike, 'No recorded valid surface strike found');

// Diagnostic-only target-energy estimate: reciprocal Z force is calculated
// from the already-computed link delta. Intra-Plate propagation already has
// its WAKE_ENERGY source guard, so its existing energy value passes through.
const zWake = `for (let q = from; q < to; q++) this.wakeNode(this.linkNodes[q], WAKE_REASON.Z_ADJACENT, Math.abs(linkForce), {
          zComponent: diagnosticZForce, sphereComponent: diagnosticSphereForce,
          sphereAssisted: Math.abs(diagnosticZForce) <= 1e-8
        });`;
const zWakeDiagnostic = `for (let q = from; q < to; q++) {
          const target = this.linkNodes[q], targetValue = cur[target];
          const targetForce = this.linkCoefficients[q] * (value - targetValue)
            / mats[this.nodeLayer[target] * 4 + 2];
          const targetNext = 2 * targetValue - this.previous[target] + targetForce;
          const predictedTargetQuietEnergy = targetNext * targetNext + (targetNext - targetValue) ** 2;
          this.wakeNode(target, WAKE_REASON.Z_ADJACENT, Math.abs(linkForce), {
            zComponent: diagnosticZForce, sphereComponent: diagnosticSphereForce,
            sphereAssisted: Math.abs(diagnosticZForce) <= 1e-8, predictedTargetQuietEnergy
          });
        }`;
assert.equal(source.split(zWake).length - 1, 1, 'Z wake anchor changed');
let instrumented = source.replace(zWake, zWakeDiagnostic);
const sphereWake = 'if (foundation !== NO_NODE && Math.abs(coupling) > 1e-8)\n          this.wakeNode(foundation, WAKE_REASON.SPHERE_FOUNDATION, Math.abs(coupling));';
const sphereWakeDiagnostic = `if (foundation !== NO_NODE && Math.abs(coupling) > 1e-8) {
        const targetValue = this.current[foundation];
        const targetForce = weights[n] * 0.000025 * (modalContact - targetValue)
          / this.topology.materialCoefficients[this.nodeLayer[foundation] * 4 + 2];
        const targetNext = 2 * targetValue - this.previous[foundation] + targetForce;
        const predictedTargetQuietEnergy = targetNext * targetNext + (targetNext - targetValue) ** 2;
        this.wakeNode(foundation, WAKE_REASON.SPHERE_FOUNDATION, Math.abs(coupling),
          { predictedTargetQuietEnergy });
      }`;
assert.equal(instrumented.split(sphereWake).length - 1, 1, 'Sphere wake anchor changed');
instrumented = instrumented.replace(sphereWake, sphereWakeDiagnostic);
const quietAnchor = 'const quietEnergy = value * value + vel * vel + bendingPotential;';
assert.equal(instrumented.split(quietAnchor).length - 1, 1, 'Quiet-energy anchor changed');
instrumented = instrumented.replace(quietAnchor, `${quietAnchor}
      if (this.wakeGateTrial?.enabled) {
        const d = this.wakeGateTrial, layer = this.nodeLayer[node];
        d.stepQuietEnergy[layer] += quietEnergy;
        if (quietEnergy > d.peakNodeQuietEnergy[node]) d.peakNodeQuietEnergy[node] = quietEnergy;
        if (quietEnergy >= SLEEP_ENERGY) d.everAboveSleepEnergy[node] = 1;
      }`);

let Processor;
class AudioWorkletProcessorStub { constructor() { this.port = { onmessage() {}, postMessage() {} }; } }
const sandbox = { AudioWorkletProcessor: AudioWorkletProcessorStub,
  registerProcessor(_name, constructor) { Processor = constructor; }, sampleRate: 48000,
  Float32Array, Float64Array, Uint32Array, Int32Array, Uint16Array, Uint8Array, Int16Array,
  Math, Number, Object, Array, Map };
vm.runInNewContext(instrumented, sandbox, { filename: 'surface-plate.wake-gate-diagnostic.js' });
assert.ok(Processor);
const processor = new Processor();
processor.installTopology(snapshot.topology);
const state = snapshot.dynamic;
for (const key of ['current', 'previous', 'next', 'energyQuiet', 'awake', 'contactForces',
  'contactMemory', 'lastContactStep', 'sphereCurrent', 'spherePrevious']) processor[key].set(state[key]);
processor.active.set(state.active); processor.activeCount = state.activeCount;
if (state.pendingWake) processor.pendingWake.set(state.pendingWake);
if (state.pendingWakeReason) processor.pendingWakeReason.set(state.pendingWakeReason);
if (state.pendingNodes) processor.pendingNodes.set(state.pendingNodes);
processor.pendingCount = state.pendingCount || 0; processor.contactCursor = state.contactCursor;
processor.telemetry = { ...state.telemetry }; processor.telemetry.physicsSteps = state.physicsSteps;
const sourceStateHash = hash(Buffer.concat([Buffer.from(processor.current.buffer), Buffer.from(processor.previous.buffer),
  Buffer.from(processor.awake.buffer), Buffer.from(processor.energyQuiet.buffer)]));

let quietRun = 0, decaySteps = 0;
while (decaySteps < MAX_DECAY_STEPS) {
  processor.advancePhysics(); decaySteps++;
  if (processor.activeCount === 0 && processor.telemetry.activeSphereModes === 0) quietRun++;
  else quietRun = 0;
  if (quietRun >= QUIET_STABLE_STEPS) break;
}
assert.ok(quietRun >= QUIET_STABLE_STEPS, 'Captured state failed to decay to stable quiet');
assert.equal(processor.topology.layerIds.length, 30);

const dynamicKeys = ['current', 'previous', 'next', 'energyQuiet', 'awake', 'contactForces', 'contactMemory',
  'lastContactStep', 'sphereCurrent', 'spherePrevious', 'pendingWake', 'pendingWakeReason', 'active', 'pendingNodes'];
function saveQuietState(p) {
  return { arrays: Object.fromEntries(dynamicKeys.map(key => [key, p[key].slice()])), activeCount: p.activeCount,
    pendingCount: p.pendingCount, contactCursor: p.contactCursor, telemetry: structuredClone(p.telemetry),
    outputL: p.outputL, outputR: p.outputR, lastL: p.lastL, lastR: p.lastR,
    phase: p.phase, samplesSinceStep: p.samplesSinceStep, queueHead: p.queueHead, queueLength: p.queueLength,
    queueL: p.queueL.slice(), queueR: p.queueR.slice() };
}
function restoreQuietState(p, saved) {
  for (const key of dynamicKeys) p[key].set(saved.arrays[key]);
  for (const key of ['activeCount', 'pendingCount', 'contactCursor', 'outputL', 'outputR', 'lastL', 'lastR',
    'phase', 'samplesSinceStep', 'queueHead', 'queueLength']) p[key] = saved[key];
  p.telemetry = structuredClone(saved.telemetry); p.queueL.set(saved.queueL); p.queueR.set(saved.queueR);
}
const quietState = saveQuietState(processor), quietHash = hash(Buffer.concat([
  Buffer.from(quietState.arrays.current.buffer), Buffer.from(quietState.arrays.previous.buffer),
  Buffer.from(quietState.arrays.awake.buffer), Buffer.from(quietState.arrays.energyQuiet.buffer)]));
const topologyDigest = createHash('sha256');
for (const key of Object.keys(snapshot.topology).sort()) {
  const value = snapshot.topology[key]; topologyDigest.update(key);
  if (ArrayBuffer.isView(value)) topologyDigest.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  else topologyDigest.update(JSON.stringify(value));
}
const topologyHash = topologyDigest.digest('hex');

const reasonNames = ['unknown', 'directFootContact', 'intraPlatePropagation', 'zAdjacentCoupling',
  'sphereFoundationCoupling', 'topologyReinstall'];
const originalWake = processor.wakeNode.bind(processor);
processor.wakeNode = function (node, reason = 0, magnitude = 0, options = null) {
  const d = this.wakeGateTrial, name = reasonNames[reason] || 'unknown';
  if (d?.enabled && reason > 0) d.requests[name]++;
  if (d?.enabled && d.gate && reason > 1 && reason < 5) {
    const predicted = reason === 2 ? magnitude : options?.predictedTargetQuietEnergy ?? 0;
    if (predicted < WAKE_ENERGY) {
      d.suppressed[name]++;
      d.suppressedByNode[node]++;
      return;
    }
  }
  if (d?.enabled && node >= 0 && node < this.awake.length && !this.awake[node] && !this.pendingWake[node]) {
    d.wakeTransitions++; d.wakeByReason[name]++;
    if (!d.wokeNodes[node]) { d.wokeNodes[node] = 1; d.uniqueWokeByLayer[this.nodeLayer[node]]++; }
  }
  return originalWake(node, reason, magnitude, options);
};

function trial(gate) {
  restoreQuietState(processor, quietState);
  const d = { enabled: true, gate, stepQuietEnergy: new Float64Array(layers), peakLayerQuietEnergy: new Float64Array(layers),
    peakNodeQuietEnergy: new Float32Array(nodes), everAboveSleepEnergy: new Uint8Array(nodes),
    activeByLayer: new Uint32Array(layers), maxActiveByLayer: new Uint32Array(layers), activeNodeSteps: new Float64Array(layers),
    requests: Object.fromEntries(reasonNames.slice(1).map(name => [name, 0])),
    suppressed: Object.fromEntries(reasonNames.slice(1).map(name => [name, 0])),
    wakeByReason: Object.fromEntries(reasonNames.slice(1).map(name => [name, 0])),
    suppressedByNode: new Uint32Array(nodes), wokeNodes: new Uint8Array(nodes), uniqueWokeByLayer: new Uint32Array(layers),
    wakeTransitions: 0, audioL: new Float32Array(MAX_RESPONSE_STEPS * 8), audioR: new Float32Array(MAX_RESPONSE_STEPS * 8),
    audioCount: 0, audioPreviousL: 0, audioPreviousR: 0, responseSteps: 0, maxActiveNodes: 0 };
  processor.wakeGateTrial = d;
  const before = { strikes: processor.telemetry.strikes, droppedRoutes: processor.telemetry.droppedRoutes,
    nonFinite: processor.telemetry.nonFinite, dropped: processor.telemetry.dropped };
  processor.handleMessage({ type: 'strike', payload: structuredClone(validStrike.payload) });
  assert.equal(processor.telemetry.strikes - before.strikes, 1);
  assert.equal(processor.telemetry.droppedRoutes - before.droppedRoutes, 0);
  let stable = 0;
  while (d.responseSteps < MAX_RESPONSE_STEPS) {
    d.stepQuietEnergy.fill(0);
    processor.advancePhysics(); d.responseSteps++;
    for (let layer = 0; layer < layers; layer++) {
      if (d.stepQuietEnergy[layer] > d.peakLayerQuietEnergy[layer]) d.peakLayerQuietEnergy[layer] = d.stepQuietEnergy[layer];
      d.activeByLayer[layer] = 0;
    }
    for (let a = 0; a < processor.activeCount; a++) d.activeByLayer[nodeLayer[processor.active[a]]]++;
    for (let layer = 0; layer < layers; layer++) {
      if (d.activeByLayer[layer] > d.maxActiveByLayer[layer]) d.maxActiveByLayer[layer] = d.activeByLayer[layer];
      d.activeNodeSteps[layer] += d.activeByLayer[layer];
    }
    const activeNow = processor.activeCount;
    d.maxActiveNodes = Math.max(d.maxActiveNodes, activeNow);
    const left = processor.outputL, right = processor.outputR;
    for (let s = 1; s <= 8; s++) {
      const alpha = s / 8;
      d.audioL[d.audioCount] = d.audioPreviousL + (left - d.audioPreviousL) * alpha;
      d.audioR[d.audioCount] = d.audioPreviousR + (right - d.audioPreviousR) * alpha;
      d.audioCount++;
    }
    d.audioPreviousL = left; d.audioPreviousR = right;
    if (activeNow === 0 && processor.telemetry.activeSphereModes === 0) stable++;
    else stable = 0;
    if (stable >= RATE) break;
  }
  const surfaceIndex = layers - 1;
  const surfacePeak = d.peakLayerQuietEnergy[surfaceIndex];
  const profile = ids.map((plateId, layer) => {
    const peak = d.peakLayerQuietEnergy[layer], start = snapshot.topology.nodeOffsets[layer], end = snapshot.topology.nodeOffsets[layer + 1];
    let meaningfulNodes = 0, suppressedTargets = 0;
    for (let node = start; node < end; node++) {
      meaningfulNodes += d.everAboveSleepEnergy[node];
      suppressedTargets += d.suppressedByNode[node] > 0;
    }
    const db = peak && surfacePeak ? 10 * Math.log10(Math.max(peak, surfacePeak * 1e-12) / surfacePeak) : -120;
    return { plateId, depth: layers - 1 - layer, nodeCount: end - start, maxActiveNodes: d.maxActiveByLayer[layer],
      peakQuietEnergy: peak, relativePeakEnergyDb: db, nodesEverAboveSleepEnergy: meaningfulNodes,
      suppressedTargetNodes: suppressedTargets, activeNodeSteps: d.activeNodeSteps[layer] };
  });
  const audioMetrics = (values, count) => {
    let square = 0, peak = 0;
    const fixedSamples = MAX_RESPONSE_STEPS * 8;
    for (let i = 0; i < count; i++) { const value = values[i]; square += value * value; peak = Math.max(peak, Math.abs(value)); }
    return { samples: fixedSamples, capturedSamples: count, rms: Math.sqrt(square / fixedSamples), peak };
  };
  const suppressedNodes = Array.from(d.suppressedByNode).reduce((sum, count) => sum + (count > 0), 0);
  const maximumRepeatedSuppressedEvents = Math.max(0, ...d.suppressedByNode);
  return { gate, durationMs: d.responseSteps * 1000 / RATE, strikeCount: processor.telemetry.strikes - before.strikes,
    droppedRouteDelta: processor.telemetry.droppedRoutes - before.droppedRoutes,
    nonFiniteDelta: processor.telemetry.nonFinite - before.nonFinite, droppedDelta: processor.telemetry.dropped - before.dropped,
    wakeTransitions: d.wakeTransitions, uniqueWokeNodes: d.uniqueWokeByLayer.reduce((a, b) => a + b, 0),
    uniqueWokeByLayer: Array.from(d.uniqueWokeByLayer), maxActiveNodes: d.maxActiveNodes,
    maxActiveByLayer: Array.from(d.maxActiveByLayer), activeNodeSteps: Array.from(d.activeNodeSteps),
    requests: d.requests, suppressed: d.suppressed, suppressedTargetNodes: suppressedNodes,
    maximumRepeatedSuppressedEventsPerNode: maximumRepeatedSuppressedEvents,
    audio: { left: audioMetrics(d.audioL, d.audioCount), right: audioMetrics(d.audioR, d.audioCount),
      samplesCaptured: d.audioCount, sampleRate: 48000 }, profile,
    everAboveSleepEnergy: Array.from(d.everAboveSleepEnergy), suppressedByNode: Array.from(d.suppressedByNode),
    waveformL: Array.from(d.audioL.subarray(0, d.audioCount)), waveformR: Array.from(d.audioR.subarray(0, d.audioCount)),
    finalActiveNodes: processor.activeCount, activeSphereModes: processor.telemetry.activeSphereModes };
}

const baseline = trial(false);
const candidate = trial(true);
const layersAbove = (run, limit) => run.profile.filter(row => row.relativePeakEnergyDb > limit).length;
const baselineMeaningful = baseline.everAboveSleepEnergy;
const candidateMeaningful = candidate.everAboveSleepEnergy;
let baselineMeaningfulNodesSuppressed = 0, missedMeaningfulNodes = 0;
for (let node = 0; node < nodes; node++) {
  if (candidate.suppressedByNode[node] > 0 && baselineMeaningful[node]) baselineMeaningfulNodesSuppressed++;
  if (baselineMeaningful[node] && !candidateMeaningful[node]) missedMeaningfulNodes++;
}
let maxWaveDiff = 0, squaredWaveDiff = 0, waveSamples = 0;
const commonSamples = Math.max(baseline.waveformL.length, candidate.waveformL.length);
for (let i = 0; i < commonSamples; i++) {
  const dl = (candidate.waveformL[i] || 0) - (baseline.waveformL[i] || 0);
  const dr = (candidate.waveformR[i] || 0) - (baseline.waveformR[i] || 0);
  maxWaveDiff = Math.max(maxWaveDiff, Math.abs(dl), Math.abs(dr)); squaredWaveDiff += dl * dl + dr * dr; waveSamples += 2;
}
const result = { purpose: 'Single-strike Candidate A validation from the captured 30-Plate snapshot',
  sourceSnapshot: snapshotPath, sourceSnapshotSha256: hash(snapshotBytes),
  snapshotRestored: true, sourceStateHash, quietStateHash: quietHash, topologyHash,
  decaySeconds: decaySteps / RATE, selectedStrike: { layerId: ids.at(-1), eventStep: validStrike.physicsStep,
    payload: validStrike.payload },
  candidateDefinition: 'Direct FOOT_CONTACT is unconditional. Intra-Plate retains its existing source quiet-energy gate. Z and Sphere requests pass only when a contribution-only predicted target quiet energy (predicted x^2 + predicted delta-v^2) reaches WAKE_ENERGY. No pending-energy accumulator is added.',
  baseline: { ...baseline, everAboveSleepEnergy: undefined, suppressedByNode: undefined,
    waveformL: undefined, waveformR: undefined },
  candidate: { ...candidate, everAboveSleepEnergy: undefined, suppressedByNode: undefined,
    waveformL: undefined, waveformR: undefined },
  comparison: { maxActiveNodeReduction: baseline.maxActiveNodes - candidate.maxActiveNodes,
    activeNodeStepReduction: baseline.activeNodeSteps.reduce((a, b) => a + b, 0)
      ? 1 - candidate.activeNodeSteps.reduce((a, b) => a + b, 0) / baseline.activeNodeSteps.reduce((a, b) => a + b, 0) : 0,
    baselineLayersAboveMinus20Db: layersAbove(baseline, -20), candidateLayersAboveMinus20Db: layersAbove(candidate, -20),
    baselineLayersAboveMinus40Db: layersAbove(baseline, -40), candidateLayersAboveMinus40Db: layersAbove(candidate, -40),
    baselineMeaningfulNodes: baselineMeaningful.reduce((a, b) => a + b, 0),
    candidateMeaningfulNodes: candidateMeaningful.reduce((a, b) => a + b, 0),
    baselineMeaningfulNodesSuppressed, missedMeaningfulNodes,
    audioWaveformComparison: { sampleRate: 48000, samples: commonSamples,
      maxAbsoluteDifference: maxWaveDiff, rmsDifference: waveSamples ? Math.sqrt(squaredWaveDiff / waveSamples) : 0,
      baselineLeft: baseline.audio.left, candidateLeft: candidate.audio.left,
      baselineRight: baseline.audio.right, candidateRight: candidate.audio.right } },
  checks: { exactlyOneStrikeEach: baseline.strikeCount === 1 && candidate.strikeCount === 1,
    noDroppedRoutes: baseline.droppedRouteDelta === 0 && candidate.droppedRouteDelta === 0,
    finite: baseline.nonFiniteDelta === 0 && candidate.nonFiniteDelta === 0,
    topologyFrozen: true, sourceWorkletSha256: hash(source), instrumentedWorkletSha256: hash(instrumented),
    sourceWorkletUnchanged: true, naturalWindowReused: 'Existing 2,500-step natural capture starts with all Plate nodes awake; no new natural replay run.' } };
assert.equal(result.checks.exactlyOneStrikeEach, true);
assert.equal(result.checks.noDroppedRoutes, true);
assert.equal(result.checks.finite, true);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output: outputPath, decaySeconds: result.decaySeconds,
  baselineWakes: baseline.uniqueWokeNodes, candidateWakes: candidate.uniqueWokeNodes,
  suppressedNodes: candidate.suppressedTargetNodes, missedMeaningfulNodes,
  baselineRms: baseline.audio, candidateRms: candidate.audio,
  maxActiveNodeReduction: result.comparison.maxActiveNodeReduction,
  activeNodeStepReduction: result.comparison.activeNodeStepReduction,
  candidateResponseSeconds: candidate.durationMs / 1000 }, null, 2));
