import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const [snapshotArg, resultArg, outputArg] = process.argv.slice(2);
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
const futureStrikes = following.result?.futureStrikes || following.futureStrikes;
assert.ok(snapshot.topology?.layerIds?.length >= 30, 'Snapshot must contain at least 30 Plate layers');
assert.ok(snapshot.dynamic?.physicsSteps > 0, 'Snapshot must contain a live processor state');
assert.ok(Array.isArray(futureStrikes), 'The natural follow-up FOOT_CONTACT strike stream is missing');

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

function makeProcessor(condition) {
  const processor = new Processor();
  processor.setSleepDiagnostics(true);
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
  processor.clearSleepDiagnosticCounters();
  return processor;
}

const windowSteps = 12000;
const snapshotStep = snapshot.dynamic.physicsSteps;
const endStep = snapshotStep + windowSteps;
const variants = [
  { id: 'A', name: 'full system', condition: 'full', replayStrikes: true },
  { id: 'B', name: 'Sphere coupling disabled', condition: 'sphere-off', replayStrikes: true },
  { id: 'C', name: 'Z coupling disabled', condition: 'z-off', replayStrikes: true },
  { id: 'D', name: 'direct strikes disabled after snapshot', condition: 'full', replayStrikes: false }
];
const results = [];
for (const variant of variants) {
  const processor = makeProcessor(variant.condition);
  let strikeIndex = 0, deliveredStrikes = 0;
  const strikes = futureStrikes.filter(event => event.physicsStep <= endStep);
  while (processor.telemetry.physicsSteps < endStep) {
    if (variant.replayStrikes) {
      while (strikeIndex < strikes.length && strikes[strikeIndex].physicsStep <= processor.telemetry.physicsSteps) {
        processor.handleMessage({ type: 'strike', payload: strikes[strikeIndex].payload });
        strikeIndex++; deliveredStrikes++;
      }
    }
    processor.advancePhysics();
  }
  const diagnostics = processor.getDiagnostics();
  const sleep = diagnostics.sleepDiagnostics;
  results.push({ ...variant, startStep: snapshotStep, endStep: processor.telemetry.physicsSteps,
    simulatedSeconds: windowSteps / 6000, recordedStrikeMessages: strikes.length,
    replayedStrikeMessages: deliveredStrikes, acceptedStrikes: processor.telemetry.strikes,
    global: { sleeps: diagnostics.sleeps, activeNodes: diagnostics.activeNodes,
      wakeReasons: sleep.wakeReasons, blockers: sleep.blockers,
      zLinkBranchTriggers: sleep.zLinkBranchTriggers,
      sphereAssistedZLinkBranchTriggers: sleep.sphereAssistedZLinkBranchTriggers },
    oldestPlate: sleep.selectedLayers.find(layer => layer.role === 'oldest') });
  console.log(JSON.stringify({ variant: variant.id, steps: processor.telemetry.physicsSteps,
    oldestMaxQuiet: results.at(-1).oldestPlate.maxEnergyQuietReached,
    oldestSleeps: results.at(-1).oldestPlate.sleeps }));
}

const output = { source: 'Exact 30-Plate Chrome worklet snapshot plus its recorded next-12000-step strike stream',
  snapshotStep, endStep, simulatedSeconds: 2, conditionsAreDiagnosticHarnessOnly: true, variants: results };
await writeFile(resolve(outputArg), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ output: resolve(outputArg), variants: results.map(result => ({
  id: result.id, oldestMaxQuiet: result.oldestPlate.maxEnergyQuietReached,
  oldestSleeps: result.oldestPlate.sleeps, oldestResets: result.oldestPlate.wakeReasons
})) }, null, 2));
