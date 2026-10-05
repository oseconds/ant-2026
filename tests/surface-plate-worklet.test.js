import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');

function descriptor(id = 'route') {
  const mask = new Array(96 * 96).fill(0);
  for (let x = 20; x <= 40; x += 1) mask[48 * 96 + x] = 1;
  return { id, grid: { width: 96, height: 96 }, mask, edges: [],
    pickups: [{ x: 0.28, y: 0.5 }, { x: 0.4, y: 0.5 }],
    material: { stiffness: 0.9, density: 1.1, damping: 0.35 } };
}

function instantiate(rate) {
  let Processor;
  const messages = [];
  class AudioWorkletProcessor {
    constructor() { this.port = { onmessage: null, postMessage: (message) => messages.push(message) }; }
  }
  vm.runInNewContext(source, {
    AudioWorkletProcessor, sampleRate: rate, Float32Array, Uint8Array, Int32Array,
    Map, Array, Math, Number, Object, performance: globalThis.performance,
    registerProcessor: (_name, implementation) => { Processor = implementation; }
  });
  const processor = new Processor({ processorOptions: { maxPlates: 12 } });
  return { processor, messages };
}

function run(processor, count = 128) {
  const left = new Float32Array(count), right = new Float32Array(count);
  processor.process([], [[left, right]]);
  return { left, right };
}

function totalEnergy(layer) {
  let kinetic = 0, bending = 0, tension = 0;
  for (let i = 0; i < layer.current.length; i += 1) {
    let lap = -4 * layer.current[i], priorLap = -4 * layer.previous[i];
    const offset = i * 4;
    for (let slot = 0; slot < 4; slot += 1) {
      const neighbor = layer.neighbors[offset + slot];
      if (neighbor >= 0) {
        lap += layer.current[neighbor];
        priorLap += layer.previous[neighbor];
      }
    }
    const velocity = layer.current[i] - layer.previous[i];
    kinetic += 0.5 * layer.density * velocity ** 2;
    bending += 0.5 * layer.density * layer.bending * lap * priorLap;
    tension += -0.5 * layer.tension * layer.current[i] * priorLap;
  }
  return kinetic + bending + tension;
}

test('emits silence before birth, then independently excites stereo pickups with one masked layer', () => {
  const { processor } = instantiate(48000);
  const before = run(processor);
  assert.ok(before.left.every((sample) => sample === 0));
  assert.ok(before.right.every((sample) => sample === 0));
  processor.handleMessage({ type: 'birth', payload: { plate: descriptor() } });
  assert.equal(processor.layers.size, 1);
  processor.handleMessage({ type: 'strike', payload: {
    plateId: 'route', position: { x: 0.3, y: 0.5 }, strength: 0.035,
    footprintRadius: 0.012, hardness: 0.3
  } });
  let leftEnergy = 0, rightEnergy = 0;
  for (let i = 0; i < 8; i += 1) {
    const output = run(processor);
    for (const sample of output.left) leftEnergy += sample * sample;
    for (const sample of output.right) rightEnergy += sample * sample;
  }
  assert.ok(leftEnergy > 0 && rightEnergy > 0);
  assert.notEqual(leftEnergy, rightEnergy, 'pickup coordinates should produce distinct stereo signals');
  assert.equal(processor.telemetry.nonFinite, 0);
});

test('single-mode excitation-free dynamics remain within the analytical discrete-time energy bound at 44.1/48/96 kHz', () => {
  for (const rate of [44100, 48000, 96000]) {
    const { processor } = instantiate(rate);
    processor.handleMessage({ type: 'birth', payload: { plate: descriptor() } });
    const layer = processor.layers.get('route');
    const n = layer.gridIndices.length;
    assert.ok(n >= 8);
    for (let i = 0; i < n; i += 1) {
      const displacement = Math.sin(Math.PI * (i + 1) / (n + 1));
      layer.current[i] = displacement;
      layer.previous[i] = displacement;
    }
    const eigenvalue = 4 - 2 * Math.cos(Math.PI / (n + 1));
    const omegaSquared = layer.bending * eigenvalue ** 2
      + layer.tension * eigenvalue / layer.density;
    assert.ok(omegaSquared > 0 && omegaSquared < 4, `unstable mode at ${rate} Hz: ${omegaSquared}`);
    const theoreticalMax = 1 / Math.sqrt(1 - omegaSquared / 4);
    const initialEnergy = totalEnergy(layer);
    let peak = Math.max(...layer.current);
    for (let i = 0; i < Math.ceil(rate / 128); i += 1) {
      run(processor);
      for (const displacement of layer.current) peak = Math.max(peak, Math.abs(displacement));
    }
    assert.ok(peak <= theoreticalMax + 1e-4,
      `${rate} Hz amplitude ${peak} exceeded discrete modal bound ${theoreticalMax}`);
    const currentEnergy = totalEnergy(layer);
    assert.ok(Number.isFinite(currentEnergy) && currentEnergy >= 0);
    assert.ok(currentEnergy < initialEnergy, `${rate} Hz excitation-free energy did not decay`);
    assert.ok(processor.telemetry.nonFinite === 0);
  }
});

test('overlapping layers couple reciprocally, retain their births, and reset vibration on stop', () => {
  const { processor } = instantiate(48000);
  const first = descriptor('first');
  const second = descriptor('second');
  processor.handleMessage({ type: 'birth', payload: { plate: first } });
  processor.handleMessage({ type: 'birth', payload: { plate: second } });
  assert.ok(processor.couplingGroups.length > 0);
  const a = processor.layers.get('first'), b = processor.layers.get('second');
  a.previous[0] = -0.035;
  for (let i = 0; i < 32; i += 1) run(processor);
  assert.ok(a.current.some((value) => value !== 0));
  assert.ok(b.current.some((value) => value !== 0), 'overlap should transmit a small reciprocal response');
  processor.handleMessage({ type: 'stop' });
  assert.ok([...a.current, ...a.previous, ...b.current, ...b.previous].every((value) => value === 0));
  assert.equal(processor.layers.size, 2);
  processor.handleMessage({ type: 'destroy' });
  assert.equal(processor.layers.size, 0);
});

test('rejects invalid masks and pickups before allocating worklet state', () => {
  const { processor } = instantiate(48000);
  const empty = descriptor('empty');
  empty.mask.fill(0);
  const offMaskPickup = descriptor('off-mask-pickup');
  offMaskPickup.pickups[1] = { x: 0.9, y: 0.9 };
  processor.handleMessage({ type: 'birth', payload: { plate: empty } });
  processor.handleMessage({ type: 'birth', payload: { plate: offMaskPickup } });
  assert.equal(processor.layers.size, 0);
  assert.equal(processor.telemetry.dropped, 2);
});

test('twelve maximum-width corridor masks fit the 48 kHz worklet quantum budget', () => {
  const { processor } = instantiate(48000);
  for (let route = 0; route < 12; route += 1) {
    const plate = descriptor(`wide-${route}`);
    plate.mask.fill(0);
    for (let x = 0; x < 96; x += 1) {
      for (let y = 45; y <= 50; y += 1) plate.mask[y * 96 + x] = 1;
    }
    plate.pickups = [{ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }];
    processor.handleMessage({ type: 'birth', payload: { plate } });
  }
  assert.equal(processor.layers.size, 12);
  const buffers = [[new Float32Array(128), new Float32Array(128)]];
  for (let quantum = 0; quantum < 10; quantum += 1) processor.process([], buffers);
  const timings = [];
  for (let quantum = 0; quantum < 100; quantum += 1) {
    const started = performance.now();
    processor.process([], buffers);
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  const p95Ms = timings[Math.floor((timings.length - 1) * 0.95)];
  assert.ok(p95Ms < 2.67,
    `p95 measured 48 kHz quantum was ${p95Ms.toFixed(3)} ms (budget 2.667 ms)`);
});
