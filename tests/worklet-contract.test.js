import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadProcessor(relativePath, processorName, rate, processorOptions = {}, { stableRandom = false } = {}) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  let Processor;
  const messages = [];
  const math = Object.create(Math);
  if (stableRandom) math.random = () => 0.5;
  class AudioWorkletProcessor {
    constructor() { this.port = { onmessage: null, postMessage: message => messages.push(message) }; }
  }
  vm.runInNewContext(source, {
    AudioWorkletProcessor,
    sampleRate: rate,
    registerProcessor(name, ProcessorClass) {
      assert.equal(name, processorName);
      Processor = ProcessorClass;
    },
    Math: math, Number, Float32Array, Int32Array, Uint8Array, Map
  }, { filename: relativePath });
  assert.equal(typeof Processor, 'function', `${processorName} was registered`);
  return { processor: new Processor({ processorOptions }), messages };
}

test('plate worklet keeps pickup independent from strike and resolution changes', async () => {
  const { processor } = await loadProcessor('static/worklets/plate.worklet.js', 'plate-processor', 48000,
    { pickup: { x: 0.42, y: -0.12 } });
  const pickup = { ...processor.pickupPosition };
  const pickupIndex = processor.pickup;
  processor.handleMessage({ type: 'strike', payload: { position: { x: -0.4, y: 0.3 }, strength: 0.8 } });
  assert.deepEqual({ ...processor.pickupPosition }, pickup);
  assert.equal(processor.pickup, pickupIndex);
  processor.handleMessage({ type: 'configure', payload: { resolution: 'high' } });
  assert.deepEqual({ ...processor.pickupPosition }, pickup);
  assert.equal(processor.size, 21);
  processor.handleMessage({ type: 'setPickup', payload: { position: { x: 0, y: 0 } } });
  assert.deepEqual({ ...processor.pickupPosition }, { x: 0, y: 0 });
});

test('plate worklet renders finite audio at common sample rates and honors zero damping', async () => {
  for (const rate of [44100, 48000, 96000]) {
    const { processor } = await loadProcessor('static/worklets/plate.worklet.js', 'plate-processor', rate,
      { damping: 0, pickup: { x: 0, y: 0 } });
    assert.equal(processor.dampingControl, 0);
    processor.handleMessage({ type: 'strike', payload: { position: { x: 0, y: 0 }, strength: 0.7 } });
    const samples = new Float32Array(512);
    assert.equal(processor.process([], [[samples]]), true);
    assert.ok(samples.every(Number.isFinite), `finite output at ${rate} Hz`);
    assert.ok(samples.some(value => Math.abs(value) > 1e-8), `nonzero output at ${rate} Hz`);
  }
});

test('worklet protocol envelopes responses and destroyed processors stop rendering', async () => {
  for (const [file, name] of [
    ['static/worklets/plate.worklet.js', 'plate-processor'],
    ['static/worklets/sphere.worklet.js', 'sphere-processor']
  ]) {
    const instance = await loadProcessor(file, name, 48000, { quality: 'normal' });
    assert.ok(instance.messages.every(message => typeof message.type === 'string' && 'payload' in message),
      `${name} uses the shared response envelope`);
    instance.processor.handleMessage?.({ type: 'destroy', payload: {} });
    if (!instance.processor.handleMessage) instance.processor.port.onmessage?.({ data: { type: 'destroy', payload: {} } });
    assert.equal(instance.processor.process([], [[new Float32Array(16)]]), false, `${name} stops after destroy`);
  }
});

test('sphere pickup changes modal output coefficients without resetting modal state', async () => {
  const { processor } = await loadProcessor('static/worklets/sphere.worklet.js', 'sphere-processor', 48000,
    { quality: 'high', pickup: { x: 0, y: 0, z: 1 } });
  assert.ok(processor.modes.length > 0);
  const mode = processor.modes.find(item => item.degree === 1 && item.m === 0);
  assert.ok(mode);
  mode.current = 0.125;
  mode.previous = -0.25;
  const beforeCoefficient = mode.coefficient;
  processor.port.onmessage({ data: { type: 'configure', payload: { pickup: { x: 1, y: 0, z: 0 } } } });
  assert.equal(mode.current, 0.125);
  assert.equal(mode.previous, -0.25);
  assert.notEqual(mode.coefficient, beforeCoefficient);
});

test('sphere partial damping configure refreshes modal decay without rebuilding state', async () => {
  const { processor } = await loadProcessor('static/worklets/sphere.worklet.js', 'sphere-processor', 48000,
    { quality: 'normal', damping: 34 });
  const modes = processor.modes;
  const mode = modes.find(item => item.frequency > 0);
  mode.current = .125;
  mode.previous = -.25;
  const oldRadius = mode.radius;
  processor.port.onmessage({ data: { type: 'configure', payload: { damping: 82 } } });
  assert.ok(processor.modes === modes, 'a damping-only update does not rebuild the modes');
  assert.notEqual(mode.radius, oldRadius, 'damping changes modal decay');
  assert.equal(mode.current, .125);
  assert.equal(mode.previous, -.25);
});

test('sphere setPickup envelope updates coefficients while preserving modal runtime', async () => {
  const { processor } = await loadProcessor('static/worklets/sphere.worklet.js', 'sphere-processor', 48000,
    { quality: 'high', pickup: { x: 0, y: 0, z: 1 } });
  const modes = processor.modes;
  const mode = modes.find(item => item.degree === 1 && item.m === 0);
  assert.ok(mode);
  mode.current = .2;
  mode.previous = -.1;
  const oldCoefficient = mode.coefficient;
  processor.port.onmessage({ data: { type: 'setPickup', payload: { position: { x: 1, y: 0, z: 0 } } } });
  assert.ok(processor.modes === modes);
  assert.notEqual(mode.coefficient, oldCoefficient);
  assert.equal(mode.current, .2);
  assert.equal(mode.previous, -.1);
});

test('sphere zero-strength strike is inert and small positive strength excites modes', async () => {
  const { processor, messages } = await loadProcessor('static/worklets/sphere.worklet.js', 'sphere-processor', 48000,
    { quality: 'normal' });
  processor.port.onmessage({ data: { type: 'strike', payload: {
    position: { x: 0, y: 0, z: 1 }, strength: 0
  } } });
  const silent = new Float32Array(64);
  assert.equal(processor.process([], [[silent]]), true);
  assert.ok(silent.every(sample => sample === 0));
  assert.equal(processor.active, false);
  assert.equal(messages.some(message => message.type === 'activity' && message.payload?.active), false);

  processor.port.onmessage({ data: { type: 'strike', payload: {
    position: { x: 0, y: 0, z: 1 }, strength: .01
  } } });
  processor.process([], [[new Float32Array(1)]]);
  assert.ok(processor.modes.some(mode => Math.abs(mode.current) > 0));
  assert.equal(processor.active, true);
});

test('sphere worklet ignores legacy unwrapped protocol messages', async () => {
  const { processor } = await loadProcessor('static/worklets/sphere.worklet.js', 'sphere-processor', 48000,
    { quality: 'normal', damping: 34 });
  const modes = processor.modes;
  const originalDamping = processor.damping;
  const originalQuality = processor.quality;
  processor.port.onmessage({ data: { type: 'configure', damping: 0, quality: 'high' } });
  processor.port.onmessage({ data: { type: 'quality', value: 'high' } });
  processor.port.onmessage({ data: { type: 'settings', damping: 0, strength: 0 } });
  assert.equal(processor.damping, originalDamping);
  assert.equal(processor.quality, originalQuality);
  assert.ok(processor.modes === modes);
});

test('sphere renders finite nonzero audio at all supported qualities and sample rates', async () => {
  for (const rate of [44100, 48000, 96000]) {
    for (const quality of ['low', 'normal', 'high']) {
      const { processor } = await loadProcessor('static/worklets/sphere.worklet.js', 'sphere-processor', rate,
        { quality, damping: 0, pickup: { x: 0, y: 0, z: 1 } });
      processor.port.onmessage({ data: { type: 'strike', payload: { position: { x: 0, y: 0, z: 1 }, strength: 0.8 } } });
      const samples = new Float32Array(512);
      assert.equal(processor.process([], [[samples]]), true);
      assert.ok(samples.every(Number.isFinite), `${quality} at ${rate} Hz is finite`);
      assert.ok(samples.some(value => Math.abs(value) > 1e-8), `${quality} at ${rate} Hz has output`);
    }
  }
});

test('refactored plate and sphere preserve the original DSP for matching settings', async () => {
  const oldPlate = await loadProcessor('tests/fixtures/plate.original.js',
    'circular-plate-processor', 48000,
    { resolution: 'normal', stiffness: .92, damping: 35, sensorX: .28, sensorY: -.18 },
    { stableRandom: true });
  const newPlate = await loadProcessor('static/worklets/plate.worklet.js', 'plate-processor', 48000,
    { resolution: 'normal', stiffness: .92, damping: 35, pickup: { x: .28, y: -.18 } },
    { stableRandom: true });
  oldPlate.processor.port.onmessage({ data: { type: 'strike', x: .28, y: -.18, strength: .1 } });
  newPlate.processor.handleMessage({ type: 'strike', payload: {
    position: { x: .28, y: -.18 }, strength: .375
  } });
  const oldPlateOutput = new Float32Array(128), newPlateOutput = new Float32Array(128);
  oldPlate.processor.process([], [[oldPlateOutput]]);
  newPlate.processor.process([], [[newPlateOutput]]);
  assert.deepEqual([...newPlateOutput], [...oldPlateOutput]);

  const material = { name: '304', density: 8000, youngModulus: 193e9, poisson: .29 };
  const oldSphere = await loadProcessor('tests/fixtures/sphere.original.js',
    'steel-sphere-processor', 48000,
    { quality: 'low', diameter: 2, material, damping: 34, strength: 62,
      pickup: { x: .72, y: 0, z: Math.sqrt(1 - .72 ** 2) } });
  const newSphere = await loadProcessor('static/worklets/sphere.worklet.js', 'sphere-processor', 48000,
    { quality: 'low', diameter: 2, material, damping: 34, strength: 62,
      pickup: { x: .72, y: 0, z: Math.sqrt(1 - .72 ** 2) } });
  const strike = { x: .15, y: -.2, z: Math.sqrt(1 - .15 ** 2 - .2 ** 2), strength: 62 };
  oldSphere.processor.port.onmessage({ data: { type: 'strike', ...strike } });
  newSphere.processor.port.onmessage({ data: { type: 'strike', payload: {
    position: { x: strike.x, y: strike.y, z: strike.z }, strength: strike.strength
  } } });
  const oldSphereOutput = new Float32Array(128), newSphereOutput = new Float32Array(128);
  oldSphere.processor.process([], [[oldSphereOutput]]);
  newSphere.processor.process([], [[newSphereOutput]]);
  assert.deepEqual([...newSphereOutput], [...oldSphereOutput]);
});
