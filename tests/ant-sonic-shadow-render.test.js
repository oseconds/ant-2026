import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { encodeStereoFloatWav, instrumentSurfaceSchedule, reconstructPickupStemMix,
  reconstructSurfacePcm, renderProductionSurface, renderSurface, sha256 } from '../scripts/ant-sonic-shadow-render.js';

const source = readFileSync(new URL('../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');
function plate(id = 'route') {
  const mask = new Array(96 * 96).fill(0);
  for (let y = 45; y <= 51; y++) for (let x = 42; x <= 54; x++) mask[y * 96 + x] = 1;
  return { id, grid: { width: 96, height: 96 }, mask, edges: [],
    pickups: [{ x: 42 / 95, y: 48 / 95 }, { x: 54 / 95, y: 48 / 95 }],
    material: { stiffness: .9, density: 1.1, damping: .35 } };
}
const topology = (...plates) => compileSurfaceTopology({ plates, stratigraphy: { layerOrder: plates.map(item => item.id) } });
const strike = { type: 'strike', payload: { plateId: 'route', position: { x: .5, y: 48 / 95 }, strength: .035, footprintRadius: .012 } };
function renderInOneBlock({ compiledTopology, events, frames }) {
  let Processor;
  class AudioWorkletProcessorStub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(instrumentSurfaceSchedule(source), {
    AudioWorkletProcessor: AudioWorkletProcessorStub, sampleRate: 48_000,
    Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Array, Math, Number, Object, Map, performance: globalThis.performance,
    registerProcessor(_name, constructor) { Processor = constructor; }
  });
  const processor = new Processor({ processorOptions: { evidenceTopology: compiledTopology,
    evidenceSchedule: { events: events.map((event, index) => ({ ...event, index })) } } });
  const left = new Float32Array(frames), right = new Float32Array(frames);
  processor.process([], [[left, right]]);
  return { left, right };
}
function renderProductionSource({ compiledTopology, events, frames }) {
  let Processor;
  class AudioWorkletProcessorStub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(source, {
    AudioWorkletProcessor: AudioWorkletProcessorStub, sampleRate: 48_000,
    Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Array, Math, Number, Object, Map, performance: globalThis.performance,
    registerProcessor(_name, constructor) { Processor = constructor; }
  });
  const processor = new Processor(), left = new Float32Array(frames), right = new Float32Array(frames);
  let frame = 0;
  const processTo = end => {
    while (frame < end) {
      const count = Math.min(128, end - frame), outL = new Float32Array(count), outR = new Float32Array(count);
      processor.process([], [[outL, outR]]); left.set(outL, frame); right.set(outR, frame); frame += count;
    }
  };
  processor.handleMessage({ type: 'topology', payload: compiledTopology });
  for (const event of [...events].sort((a, b) => a.frame - b.frame)) {
    processTo(event.frame);
    processor.handleMessage(event.message);
  }
  processTo(frames);
  return { pcm: { left, right }, telemetry: JSON.parse(JSON.stringify(processor.getDiagnostics())),
    current: Float32Array.from(processor.current) };
}

test('shadow renderer schedules events at their exact frames and returns repeatable PCM and fields', () => {
  const input = { source, topology: topology(plate()), events: [{ frame: 137, message: strike }, { frame: 511, message: strike }], frames: 2048 };
  const a = renderSurface(input), b = renderSurface(input);
  const stemmed = renderSurface({ ...input, capturePickupStems: true, captureState: true, captureStateHashes: true });
  const unmodified = renderProductionSurface({ ...input, captureState: true, captureStateHashes: true });
  assert.deepEqual(a.pcm, b.pcm);
  assert.deepEqual(unmodified.pcm, a.pcm, 'event scheduling preserves the uninstrumented production PCM');
  assert.deepEqual(unmodified.telemetry, a.telemetry);
  assert.deepEqual(stemmed.pcm, a.pcm, 'stem observation leaves production PCM unchanged');
  assert.deepEqual(stemmed.telemetry, a.telemetry, 'stem observation leaves solver telemetry unchanged');
  assert.deepEqual(stemmed.finalState, renderSurface({ ...input, captureState: true }).finalState,
    'stem observation leaves final coupled solver state unchanged');
  assert.deepEqual(stemmed.stateHashes, unmodified.stateHashes,
    'stem observation leaves solver state unchanged at every physics step');
  const reconstructed = reconstructPickupStemMix(stemmed.pickupStems);
  assert.deepEqual(reconstructed, stemmed.pickupStems.preLimiter,
    'per-layer plus Sphere contributions reconstruct every pre-limiter physics step exactly');
  assert.deepEqual(reconstructSurfacePcm(stemmed.pickupStems, { frames: input.frames }), a.pcm,
    'unchanged soft limiter and output interpolation reconstruct every PCM sample exactly');
  assert.deepEqual(stemmed.pickupStems.layerIds, ['route']);
  assert.ok(stemmed.pickupStems.plates[0].left.some(value => value !== 0));
  assert.ok(stemmed.pickupStems.sphere.left.every(value => value === 0));
  assert.ok(stemmed.pickupStems.allocatedBytes > 0);
  const production = renderProductionSource({ compiledTopology: input.topology, events: input.events, frames: input.frames });
  assert.deepEqual(a.pcm, production.pcm, 'instrumentation leaves uninstrumented production PCM unchanged');
  assert.deepEqual(a.telemetry, production.telemetry, 'instrumentation leaves physics telemetry unchanged');
  assert.deepEqual(a.telemetry, renderSurface({ ...input, captureFields: false }).telemetry);
  assert.deepEqual(a.fields.values.slice(-a.nodeCount), production.current,
    'post-step field snapshot matches the uninstrumented final node state');
  const wholeBlock = renderInOneBlock({ compiledTopology: input.topology, events: input.events, frames: input.frames });
  assert.deepEqual(a.pcm, wholeBlock, 'splitting process() at event frames preserves sample-exact PCM');
  assert.deepEqual(a.fields, b.fields);
  assert.deepEqual(a.renderedFrameReceipts.map(receipt => receipt.frame), [137, 511]);
  assert.equal(a.telemetry.strikes, 2);
  assert.equal(a.telemetry.droppedRoutes, 0);
  assert.equal(a.fields.sampleRate, 6000);
  assert.equal(a.fields.frames, 256);
  assert.equal(a.fields.nodeCount, a.nodeCount);
  assert.equal(a.rawPickup.left.length, 256);
  assert.equal(a.fieldsFinite, true);
  assert.ok([...a.pcm.left, ...a.pcm.right, ...a.fields.values, ...a.rawPickup.left, ...a.rawPickup.right]
    .every(Number.isFinite), 'PCM, fields and pickup sums are finite');
  assert.equal(a.sourceSha256, sha256(source));
});

test('coupled multi-Plate Z and Sphere readouts remain passive stem observations', () => {
  const makePlate = (id, x0, x1) => {
    const mask = new Array(96 * 96).fill(0);
    for (let y = 44; y <= 50; y++) for (let x = x0; x <= x1; x++) mask[y * 96 + x] = 1;
    return { id, grid: { width: 96, height: 96 }, mask, edges: [],
      pickups: [{ x: x0 / 95, y: 47 / 95 }, { x: x1 / 95, y: 47 / 95 }],
      material: { stiffness: .9, density: 1.1, damping: .35 } };
  };
  const lower = makePlate('lower', 30, 62), upper = makePlate('upper', 46, 76);
  const lowerUpper = compileSurfaceTopology({ plates: [lower, upper], stratigraphy: { layerOrder: ['lower', 'upper'] } });
  assert.ok(lowerUpper.adjacentLinkNodes.length > 0, 'fixture has reciprocal Z links');
  const zEvents = [{ frame: 480, message: { type: 'strike', payload: { plateId: 'lower', layerId: 'lower',
    position: { x: 35 / 95, y: 47 / 95 }, strength: .035, footprintRadius: .012 } } }];
  const zInput = { source, topology: lowerUpper, events: zEvents, frames: 9600, captureFields: true };
  const zBase = renderSurface(zInput), zStemmed = renderSurface({ ...zInput, capturePickupStems: true, captureState: true });
  const zProduction = renderProductionSurface({ ...zInput, captureState: true });
  assert.deepEqual(zStemmed.pickupStems.layerIds, ['lower', 'upper']);
  assert.ok(zBase.telemetry.deepPlateCouplingTransfers > 0);
  assert.deepEqual(zStemmed.pcm, zBase.pcm);
  assert.deepEqual(zBase.pcm, zProduction.pcm);
  assert.deepEqual(zStemmed.finalState, zProduction.finalState);
  assert.deepEqual(zStemmed.fields, zBase.fields, 'all coupled Plate states match at every physics step');
  assert.deepEqual(zStemmed.telemetry, zBase.telemetry);
  assert.deepEqual(reconstructPickupStemMix(zStemmed.pickupStems), zStemmed.pickupStems.preLimiter);
  assert.deepEqual(reconstructSurfacePcm(zStemmed.pickupStems, { frames: zInput.frames }), zBase.pcm);

  const nodule = { id: 'sphere', position: { x: .5, y: .5 }, physicalRadiusMeters: .024,
    material: { density: 2000, youngModulus: 800000, poisson: .3, damping: .35 },
    burial: { buriedDepthMeters: .04 }, coupling: { plateId: 'lower', weight: .2, position: { x: .5, y: .5 } } };
  const withSphere = compileSurfaceTopology({ plates: [lower, upper], nodules: [nodule],
    stratigraphy: { layerOrder: ['lower', 'upper'] } });
  const sphereInput = { source, topology: withSphere, events: zEvents, frames: 9600, captureFields: true };
  const sphereBase = renderSurface(sphereInput), sphereStemmed = renderSurface({ ...sphereInput,
    capturePickupStems: true, captureState: true });
  const sphereProduction = renderProductionSurface({ ...sphereInput, captureState: true });
  assert.ok(sphereBase.telemetry.activeSphereModes > 0, 'fixture excites current Sphere modes');
  assert.ok(sphereStemmed.pickupStems.sphere.left.some(value => value !== 0), 'Sphere readout contributes');
  assert.ok(sphereStemmed.pickupStems.sphere.right.some(value => value !== 0), 'stereo Sphere readout contributes');
  assert.deepEqual(sphereStemmed.pcm, sphereBase.pcm);
  assert.deepEqual(sphereBase.pcm, sphereProduction.pcm);
  assert.deepEqual(sphereStemmed.finalState, sphereProduction.finalState);
  assert.deepEqual(sphereStemmed.fields, sphereBase.fields, 'Plate and Sphere coupled states match at every physics step');
  assert.deepEqual(sphereStemmed.telemetry, sphereBase.telemetry);
  assert.deepEqual(reconstructPickupStemMix(sphereStemmed.pickupStems), sphereStemmed.pickupStems.preLimiter);
  assert.deepEqual(reconstructSurfacePcm(sphereStemmed.pickupStems, { frames: sphereInput.frames }), sphereBase.pcm);
});

test('pickup stems preserve Plate ID slots across topology installations', () => {
  const a = plate('a'), b = plate('b');
  const first = compileSurfaceTopology({ plates: [a], generation: 1, stratigraphy: { layerOrder: ['a'] } });
  const second = compileSurfaceTopology({ plates: [a, b], generation: 2, stratigraphy: { layerOrder: ['a', 'b'] } });
  const events = [
    { frame: 0, message: { type: 'strike', payload: { plateId: 'a', position: { x: .5, y: 48 / 95 }, strength: .035, footprintRadius: .012 } } },
    { frame: 640, message: { type: 'topology', payload: second } },
    { frame: 672, message: { type: 'strike', payload: { plateId: 'b', position: { x: .5, y: 48 / 95 }, strength: .035, footprintRadius: .012 } } }
  ];
  const input = { source, topology: first, events, frames: 2048, captureFields: true };
  const baseline = renderProductionSurface({ ...input, captureState: true, captureStateHashes: true });
  const observed = renderSurface({ ...input, capturePickupStems: true, captureState: true, captureStateHashes: true });
  assert.deepEqual(observed.pickupStems.layerIds, ['a', 'b']);
  assert.deepEqual(observed.pickupStems.topologyGeneration,
    Uint32Array.from({ length: observed.pickupStems.frames }, (_, step) => step < 80 ? 1 : 2));
  assert.equal(observed.telemetry.topologies, 2);
  assert.equal(observed.telemetry.strikes, 2);
  assert.deepEqual(observed.pcm, baseline.pcm);
  assert.deepEqual(observed.finalState, baseline.finalState);
  assert.deepEqual(observed.telemetry, baseline.telemetry);
  assert.deepEqual(observed.stateHashes, baseline.stateHashes);
  assert.deepEqual(reconstructPickupStemMix(observed.pickupStems), observed.pickupStems.preLimiter);
  assert.deepEqual(reconstructSurfacePcm(observed.pickupStems, { frames: input.frames }), baseline.pcm);
});

test('field observation does not change rendered PCM and empty topology remains finite and silent', () => {
  const input = { source, topology: topology(plate()), events: [{ frame: 0, message: strike }], frames: 1024 };
  const observed = renderSurface(input), unobserved = renderSurface({ ...input, captureFields: false });
  assert.deepEqual(observed.pcm, unobserved.pcm);
  assert.equal('fields' in unobserved, false);
  assert.equal('rawPickup' in unobserved, false);
  const empty = renderSurface({ source, topology: topology(), frames: 512 });
  assert.equal(empty.nodeCount, 0);
  assert.equal(empty.fields.frames, 64);
  assert.equal(empty.fieldsFinite, true);
  assert.ok([...empty.pcm.left, ...empty.pcm.right].every(value => value === 0));
});

test('worklet instrumentation fails closed when a production anchor changes', () => {
  assert.throws(() => instrumentSurfaceSchedule(source.replace('  constructor() {', '  constructor(config) {')),
    /anchor missing or ambiguous/);
  assert.equal(typeof instrumentSurfaceSchedule(source), 'string');
});

test('schedule validation rejects out-of-range frames and malformed messages', () => {
  const common = { source, topology: topology(plate()), frames: 128 };
  assert.throws(() => renderSurface({ ...common, events: [{ frame: 128, message: strike }] }), /within the render/);
  assert.throws(() => renderSurface({ ...common, events: [{ frame: 0, message: {} }] }), /string type/);
  assert.throws(() => renderSurface({ ...common, sampleRate: 0 }), /sampleRate/);
  assert.throws(() => renderSurface({ ...common, frames: 1_000_000_000, capturePickupStems: true }), /limit is/);
});

test('stereo float WAV encoding applies export gain only', () => {
  const pcm = { left: Float32Array.from([.25, -.5]), right: Float32Array.from([-.125, .75]) };
  const wav = encodeStereoFloatWav(pcm, { sampleRate: 48_000, gain: 2 });
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt16LE(20), 3);
  assert.equal(wav.readFloatLE(44), .5);
  assert.equal(wav.readFloatLE(48), -.25);
  assert.equal(wav.readFloatLE(52), -1);
  assert.equal(wav.readFloatLE(56), 1.5);
});
