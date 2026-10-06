import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const [snapshotArg, resultArg, outputArg] = process.argv.slice(2);
const benchmark = process.argv.includes('--benchmark');
assert.ok(snapshotArg && resultArg && outputArg,
  'Usage: node scripts/ant-sleep-ablation.js <snapshot.json.gz> <snapshot-following-2s.json> <output.json>');

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

const snapshot = revive(JSON.parse(gunzipSync(await readFile(resolve(snapshotArg))).toString('utf8')));
const following = JSON.parse(await readFile(resolve(resultArg), 'utf8'));
const futureEvents = following.result?.futureEvents || following.futureEvents;
assert.ok(snapshot.topology?.layerIds?.length >= (benchmark ? 10 : 30),
  `Snapshot must contain at least ${benchmark ? 10 : 30} Plate layers`);
assert.ok(snapshot.dynamic?.physicsSteps > 0, 'Snapshot must contain a live processor state');
assert.ok(Array.isArray(futureEvents), 'The natural follow-up worklet message stream is missing');

let Processor;
class AudioWorkletProcessorStub {
  constructor() { this.port = { onmessage: null, postMessage() {} }; }
}
const source = await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');
const sandbox = {
  AudioWorkletProcessor: AudioWorkletProcessorStub,
  registerProcessor(_name, constructor) { Processor = constructor; },
  sampleRate: 48000,
  Float32Array, Float64Array, Uint32Array, Int32Array, Uint16Array, Uint8Array, Int16Array,
  Math, Number, Object, Array, Map, Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array, Float64Array
};
vm.runInNewContext(source, sandbox, { filename: 'surface-plate.worklet.js' });
assert.ok(Processor, 'SurfacePlateProcessor did not register');

function copyTopology(topology, condition) {
  const copy = structuredClone(topology);
  if (condition === 'sphere-off') copy.noduleCouplingWeights.fill(0);
  if (condition === 'z-off') {
    copy.adjacentLinkNodes = new Uint32Array(0);
    copy.adjacentLinkCoefficients = new Float32Array(0);
  }
  return copy;
}

function makeProcessor(condition, diagnosticsEnabled = true) {
  const processor = new Processor();
  processor.setSleepDiagnostics(diagnosticsEnabled);
  processor.installTopology(copyTopology(snapshot.topology, condition));
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
  if (diagnosticsEnabled) processor.clearSleepDiagnosticCounters();
  return processor;
}

const windowSteps = benchmark ? 2500 : 12000;
const snapshotStep = snapshot.dynamic.physicsSteps;
const endStep = snapshotStep + windowSteps;
function hashFinalState(processor) {
  const digest = createHash('sha256');
  for (const key of ['current', 'previous', 'next', 'energyQuiet', 'awake', 'contactForces',
    'contactMemory', 'lastContactStep', 'sphereCurrent', 'spherePrevious']) {
    const value = processor[key];
    digest.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  digest.update(JSON.stringify({ active: [...processor.active.subarray(0, processor.activeCount)],
    activeCount: processor.activeCount, physicsSteps: processor.telemetry.physicsSteps,
    topology: processor.topology.layerIds }));
  return digest.digest('hex');
}

function runWindow(condition, diagnosticsEnabled, replayStrikes = true) {
  const processor = makeProcessor(condition, diagnosticsEnabled);
  let eventIndex = 0, deliveredStrikes = 0, deliveredTopologies = 0;
  const events = futureEvents.filter(event => event.physicsStep <= endStep);
  const started = process.hrtime.bigint();
  while (processor.telemetry.physicsSteps < endStep) {
    while (eventIndex < events.length && events[eventIndex].physicsStep <= processor.telemetry.physicsSteps) {
      const event = events[eventIndex++];
      if (event.type === 'topology') {
        processor.handleMessage({ type: event.type, payload: copyTopology(event.payload, condition) });
        deliveredTopologies++;
      } else if (event.type === 'strike' && replayStrikes) {
        processor.handleMessage({ type: event.type, payload: event.payload });
        deliveredStrikes++;
      }
    }
    processor.advancePhysics();
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  return { processor, elapsedMs, events, deliveredStrikes, deliveredTopologies,
    finalStateSha256: hashFinalState(processor) };
}

const variants = [
  { id: 'A', name: 'full system', condition: 'full', replayStrikes: true },
  { id: 'B', name: 'Sphere coupling disabled', condition: 'sphere-off', replayStrikes: true },
  { id: 'C', name: 'Z coupling disabled', condition: 'z-off', replayStrikes: true },
  { id: 'D', name: 'direct strikes disabled after snapshot', condition: 'full', replayStrikes: false }
];
const results = [];
if (benchmark) {
  // One OFF warmup, then two short paired passes against the same snapshot and event stream.
  const warmOff = runWindow('full', false);
  const samples = { off: [], on: [] };
  let referenceState = warmOff.finalStateSha256;
  for (let repeat = 0; repeat < 2; repeat++) {
    const order = repeat % 2 ? ['on', 'off'] : ['off', 'on'];
    for (const mode of order) {
      const run = runWindow('full', mode === 'on');
      assert.equal(run.finalStateSha256, referenceState,
        `Diagnostics ${mode.toUpperCase()} changed solver state across matched runs`);
      samples[mode].push(run.elapsedMs);
    }
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const offMedianMs = median(samples.off), onMedianMs = median(samples.on);
  const output = { source: 'Exact natural 10-Plate Chrome worklet snapshot plus its recorded next-2500-step message stream',
    benchmark: 'Approximate Node AudioWorkletProcessor sanity check; one OFF warmup and two paired OFF/ON runs, processor setup excluded',
    snapshotStep, endStep, simulatedSeconds: windowSteps / 6000, topologyLayers: snapshot.topology.layerIds.length,
    topologyNodes: snapshot.topology.nodeGridIndices.length,
    recordedTopologyMessages: futureEvents.filter(event => event.type === 'topology' && event.physicsStep <= endStep).length,
    recordedStrikeMessages: futureEvents.filter(event => event.type === 'strike' && event.physicsStep <= endStep).length,
    warmupMs: { off: warmOff.elapsedMs }, samplesMs: samples,
    medianMs: { off: offMedianMs, on: onMedianMs },
    stepsPerSecond: { off: windowSteps / (offMedianMs / 1000), on: windowSteps / (onMedianMs / 1000) },
    equivalentAudioRealtimeRatio: { off: windowSteps / (offMedianMs / 1000) / 6000,
      on: windowSteps / (onMedianMs / 1000) / 6000 },
    relativeOverheadPercent: 100 * (onMedianMs / offMedianMs - 1),
    finalSolverStateIdentical: true, smallOverheadThresholdPercent: 5 };
  await writeFile(resolve(outputArg), JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ output: resolve(outputArg), relativeOverheadPercent: output.relativeOverheadPercent,
    samplesMs: output.samplesMs, finalSolverStateIdentical: output.finalSolverStateIdentical }, null, 2));
} else {
  for (const variant of variants) {
    const run = runWindow(variant.condition, true, variant.replayStrikes);
    const { processor, events, deliveredStrikes, deliveredTopologies } = run;
    const diagnostics = processor.getDiagnostics();
    const sleep = diagnostics.sleepDiagnostics;
    results.push({ ...variant, startStep: snapshotStep, endStep: processor.telemetry.physicsSteps,
      simulatedSeconds: windowSteps / 6000,
      recordedTopologyMessages: events.filter(event => event.type === 'topology').length,
      replayedTopologyMessages: deliveredTopologies, replayedStrikeMessages: deliveredStrikes,
      recordedStrikeMessages: events.filter(event => event.type === 'strike').length,
      acceptedStrikes: processor.telemetry.strikes,
      global: { sleeps: diagnostics.sleeps, activeNodes: diagnostics.activeNodes,
        wakeReasons: sleep.wakeReasons, blockers: sleep.blockers,
        zLinkBranchTriggers: sleep.zLinkBranchTriggers,
        sphereAssistedZLinkBranchTriggers: sleep.sphereAssistedZLinkBranchTriggers },
      oldestPlate: sleep.selectedLayers.find(layer => layer.role === 'oldest') });
    console.log(JSON.stringify({ variant: variant.id, steps: processor.telemetry.physicsSteps,
      oldestMaxQuiet: results.at(-1).oldestPlate.maxEnergyQuietReached,
      oldestSleeps: results.at(-1).oldestPlate.sleeps }));
  }

  const output = { source: 'Exact 30-Plate Chrome worklet snapshot plus its recorded next-12000-step message stream',
    snapshotStep, endStep, simulatedSeconds: 2, conditionsAreDiagnosticHarnessOnly: true, variants: results };
  await writeFile(resolve(outputArg), JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ output: resolve(outputArg), variants: results.map(result => ({
    id: result.id, oldestMaxQuiet: result.oldestPlate.maxEnergyQuietReached,
    oldestSleeps: result.oldestPlate.sleeps, oldestResets: result.oldestPlate.wakeReasons
  })) }, null, 2));
}
