import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { encodeStereoFloatWav, instrumentSurfaceSchedule, reconstructSurfaceReadout, renderSurface, sha256 } from '../scripts/ant-sonic-shadow-render.js';

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
  assert.deepEqual(a.pcm, b.pcm);
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

test('aligned pickup windows retain only requested continuous-replay physics samples', () => {
  const input = { source, topology: topology(plate()), events: [{ frame: 137, message: strike }], frames: 2048,
    pickupWindows: [{ name: 'middle', startFrame: 512, endFrame: 1024 }] };
  const full = renderSurface(input), withoutFields = renderSurface({ ...input, captureFields: false });
  const window = withoutFields.pickupWindows[0];
  assert.equal(window.left.length, 64);
  assert.equal(window.right.length, 64);
  assert.deepEqual(window.left, full.rawPickup.left.slice(63, 127));
  assert.deepEqual(window.right, full.rawPickup.right.slice(63, 127));
  assert.deepEqual(withoutFields.pcm, full.pcm);
  assert.equal('fields' in withoutFields, false);
  assert.throws(() => renderSurface({ ...input, pickupWindows: [{ name: 'unaligned', startFrame: 1, endFrame: 8 }] }), /physics-aligned/);
});

test('6 kHz continuous replay reconstructs the exact 48 kHz production readout', () => {
  const events = [{ frame: 0, message: strike }, { frame: 137, message: strike },
    { frame: 511, message: strike }, { frame: 2048, message: strike }];
  const full = renderSurface({ source, topology: topology(plate()), events, frames: 4096, sampleRate: 48_000,
    pickupWindows: [{ name: 'middle', startFrame: 512, endFrame: 1024 }] });
  const physics = renderSurface({ source, topology: topology(plate()),
    events: events.map(event => ({ ...event, frame: Math.floor(event.frame / 8) })), frames: 512, sampleRate: 6_000,
    pickupWindows: [{ name: 'middle', startFrame: 64, endFrame: 128 }],
    physicsOutputWindows: [{ name: 'all', startPhysicsFrame: 0, endPhysicsFrame: 512 }] });
  const reconstructed = reconstructSurfaceReadout(physics.physicsOutputWindows[0], { outputFrames: 4096 });
  assert.deepEqual(reconstructed, full.pcm);
  assert.deepEqual(physics.pickupWindows[0].left, full.pickupWindows[0].left);
  assert.deepEqual(physics.pickupWindows[0].right, full.pickupWindows[0].right);
  assert.deepEqual(physics.telemetry, full.telemetry);
  for (let index = 0; index < events.length; index++) {
    const sampleFrame = full.renderedFrameReceipts[index].frame, physicsFrame = physics.renderedFrameReceipts[index].frame;
    assert.equal(physicsFrame, Math.floor(sampleFrame / 8));
    assert(sampleFrame >= physicsFrame * 8 && sampleFrame < physicsFrame * 8 + 8);
  }
  assert.deepEqual(physics.renderedFrameReceipts.map(row => row.message),
    full.renderedFrameReceipts.map(row => row.message));
  assert.deepEqual(physics.current, full.current);
  assert.throws(() => reconstructSurfaceReadout(physics.physicsOutputWindows[0], {
    outputStartFrame: 1, outputFrames: 8 }), /aligned/);
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
