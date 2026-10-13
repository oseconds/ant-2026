import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { loadGenericPlateSource, q4MatchedFlatLossTopology, rateAwareSurface, renderGenericReference, transformSurface } from '../scripts/ant-base-born-shadow.js';

const bornSource = readFileSync(new URL('../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');
const genericSource = readFileSync(new URL('../static/worklets/plate.worklet.js', import.meta.url), 'utf8');

function instantiate(source, processorOptions = {}) {
  let Processor;
  class Stub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(source, { AudioWorkletProcessor: Stub, sampleRate: 48_000,
    Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Array, Math, Number, Object, Map, performance: globalThis.performance,
    registerProcessor(_name, constructor) { Processor = constructor; } });
  return new Processor({ processorOptions });
}

function renderGenericUninstrumented({ source, events, frames, seed }) {
  let Processor, state = seed >>> 0;
  const seededMath = Object.create(Math);
  seededMath.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  class Stub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(source, { AudioWorkletProcessor: Stub, sampleRate: 48_000, Float32Array, Float64Array,
    Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Array, Math: seededMath,
    Number, Object, Map, performance: globalThis.performance, registerProcessor(_name, processor) { Processor = processor; } });
  const processor = new Processor({ processorOptions: { stereoPickups: [{ x: -.32, y: -.18 }, { x: .32, y: -.18 }] } });
  const left = new Float32Array(frames), right = new Float32Array(frames);
  let frame = 0;
  const processTo = end => {
    while (frame < end) {
      const count = Math.min(128, end - frame), l = new Float32Array(count), r = new Float32Array(count);
      processor.process([], [[l, r]]); left.set(l, frame); right.set(r, frame); frame += count;
    }
  };
  for (const event of [...events].sort((a, b) => a.frame - b.frame)) {
    processTo(event.frame); processor.handleMessage(event.message);
  }
  processTo(frames);
  return { left, right };
}

function plate(id = 'p') {
  const mask = new Array(96 * 96).fill(0);
  for (let y = 42; y <= 54; y++) for (let x = 42; x <= 54; x++) mask[y * 96 + x] = 1;
  return { id, grid: { width: 96, height: 96 }, mask, edges: [],
    pickups: [{ x: 42 / 95, y: 48 / 95 }, { x: 54 / 95, y: 48 / 95 }],
    material: { stiffness: .9, density: 1.1, damping: .35 } };
}

test('surface transform is identity by default, fail-closed, and pulse-only changes one anchor', () => {
  assert.equal(transformSurface(bornSource).source, bornSource);
  const result = transformSurface(bornSource, { pulseSteps: 6 });
  assert.deepEqual(result.patches, ['contact pulse']);
  assert.equal(result.source, bornSource.replace('const CONTACT_PULSE_STEPS = Math.round(RATE * 0.003);', 'const CONTACT_PULSE_STEPS = 6;'));
  assert.match(result.source, /CONTACT_MAX_COMPLIANCE_LOSS = 0\.25/);
  const topology = compileSurfaceTopology({ plates: [plate()], stratigraphy: { layerOrder: ['p'] } });
  const impulse = steps => {
    const processor = instantiate(transformSurface(bornSource, { pulseSteps: steps }).source);
    processor.handleMessage({ type: 'topology', payload: topology });
    processor.handleMessage({ type: 'strike', payload: { plateId: 'p', position: { x: .5, y: .5 }, strength: .035 } });
    return processor;
  };
  const baseline = impulse(18), short = impulse(6);
  assert.equal(short.getDiagnostics().contactPulseSteps, 6);
  assert.equal(short.getDiagnostics().contactMaximumComplianceLoss, baseline.getDiagnostics().contactMaximumComplianceLoss);
  assert.ok(Math.abs(short.telemetry.requestedContactImpulseSquared - baseline.telemetry.requestedContactImpulseSquared) < 1e-12);
  for (let node = 0; node < baseline.current.length; node++) {
    const sum = (processor, steps) => {
      let total = 0;
      for (let step = 0; step < steps; step++) total += processor.contactForces[step * processor.current.length + node];
      return total;
    };
    assert.ok(Math.abs(sum(short, 6) - sum(baseline, 18)) < 1e-7, `pulse impulse at node ${node}`);
  }
  assert.throws(() => transformSurface(genericSource), /ANT surface worklet/);
  assert.throws(() => transformSurface(bornSource.replace('CONTACT_PULSE_STEPS = Math.round(RATE * 0.003)', 'CONTACT_PULSE_STEPS = 99'), { pulseSteps: 6 }), /anchor missing or ambiguous/);
});

test('point Gaussian uses the exact rounded +/-3 support and normalized deterministic texture', () => {
  const result = transformSurface(bornSource, { spatial: 'base-grid', jitterSeed: 42 });
  assert.match(result.source, /Math\.abs\(gx - Math\.round\(x\)\) > 3/);
  assert.match(result.source, /Math\.abs\(gy - Math\.round\(y\)\) > 3/);
  assert.equal((result.source.match(/shadowBornWeight\(gx, gy, x, y, sigma, strikeIndex, node, proc\)/g) || []).length, 2);
  assert.match(result.source, /const sigma = 0\.72;/);
  assert.match(result.source, /SHADOW_JITTER_SEED = 42/);
  const topology = compileSurfaceTopology({ plates: [plate()], stratigraphy: { layerOrder: ['p'] } });
  const make = () => {
    const processor = instantiate(result.source); processor.handleMessage({ type: 'topology', payload: topology });
    processor.handleMessage({ type: 'strike', payload: { plateId: 'p', position: { x: .5, y: .5 }, strength: .035, footprintRadius: .01 } });
    return processor;
  };
  const a = make(), b = make();
  assert.deepEqual(a.contactForces, b.contactForces);
  const draws = a.getDiagnostics().baseBornJitterDraws;
  assert.equal(draws.length, b.getDiagnostics().baseBornJitterDraws.length);
  assert.ok(draws.length > 0);
  assert.equal(new Set(draws.map(draw => `${draw.event}:${draw.node}`)).size, draws.length,
    'the normalization and injection passes reuse one draw per event/node');
  assert.equal(a.telemetry.strikes, 1);
  assert.ok(a.telemetry.compliantContactImpulseSquared <= a.telemetry.requestedContactImpulseSquared);
});

test('Born frequency-loss term uses the prior four-neighbor Laplacian and coefficient zero is exact identity', () => {
  assert.equal(transformSurface(bornSource, { frequencyLoss: 0 }).source, bornSource);
  const result = transformSurface(bornSource, { frequencyLoss: .125 });
  assert.match(result.source, /previousLap \+= this\.previous\[other\]/);
  assert.match(result.source, /0\.125 \* \(lap\[node\] - previousLap\)/);
  assert.equal((result.source.match(/for \(let d = 0; d < 4; d\+\+\)/g) || []).length,
    (bornSource.match(/for \(let d = 0; d < 4; d\+\+\)/g) || []).length + 1);
  const topology = compileSurfaceTopology({ plates: [plate()], stratigraphy: { layerOrder: ['p'] } });
  const make = source => {
    const processor = instantiate(source); processor.handleMessage({ type: 'topology', payload: topology });
    for (let index = 0; index < processor.current.length; index++) {
      processor.current[index] = (index % 5) * .01;
      processor.previous[index] = (index % 3) * .002;
    }
    const node = topology.pickupNodeIndices[0]; processor.wakeNode(node);
    return { processor, node };
  };
  const a = make(bornSource), b = make(result.source), n = a.node, neighbors = topology.neighborIndices;
  let currentLap = -4 * a.processor.current[n], previousLap = -4 * a.processor.previous[n];
  for (let d = 0; d < 4; d++) {
    const other = neighbors[n * 4 + d];
    if (other >= 0) { currentLap += a.processor.current[other]; previousLap += a.processor.previous[other]; }
  }
  a.processor.advancePhysics(); b.processor.advancePhysics();
  const measuredDelta = b.processor.current[n] - a.processor.current[n];
  assert.ok(Math.abs(measuredDelta - .125 * (currentLap - previousLap)) < 1e-7,
    `measured ${measuredDelta}, predicted ${.125 * (currentLap - previousLap)}`);
});

test('q=4 flat-loss control preserves the Born topology and matches frequency-loss pole and input gain', () => {
  const topology = compileSurfaceTopology({ plates: [plate()], stratigraphy: { layerOrder: ['p'] } });
  const gamma = 8 * .0000616140594288357;
  const flat = q4MatchedFlatLossTopology(topology, gamma);
  const frequency = transformSurface(bornSource, { frequencyLoss: gamma });
  assert.equal(frequency.definition.frequencyLoss, gamma);
  assert.equal(frequency.source.includes(`${gamma} * (lap[node] - previousLap)`), true);
  assert.notEqual(flat, topology);
  assert.notEqual(flat.materialCoefficients, topology.materialCoefficients);
  for (const key of ['nodeOffsets', 'nodeGridIndices', 'neighborIndices', 'pickupNodeIndices', 'layerIds'])
    assert.equal(flat[key], topology[key], `${key} stays identical`);
  assert.deepEqual(topology.materialCoefficients, compileSurfaceTopology({ plates: [plate()], stratigraphy: { layerOrder: ['p'] } }).materialCoefficients,
    'the source topology remains unchanged');

  const dBorn = 50 * topology.materialCoefficients[3];
  const dFlatReal = dBorn + 4 * gamma;
  const dFlatStored = 50 * flat.materialCoefficients[3];
  const q = 4, b = topology.materialCoefficients[0], tau = topology.materialCoefficients[1] / topology.materialCoefficients[2];
  const flatAReal = 2 - dFlatReal - b * q * q - tau * q;
  const frequencyAReal = 2 - dBorn - gamma * q - b * q * q - tau * q;
  const flatGainReal = 1 - dFlatReal;
  const frequencyGainReal = 1 - dBorn - gamma * q;
  assert.ok(Math.abs(flatAReal - frequencyAReal) <= Number.EPSILON);
  assert.ok(Math.abs(flatGainReal - frequencyGainReal) <= Number.EPSILON);
  assert.ok(Math.abs((1 - dFlatStored) - frequencyGainReal) < 1e-8,
    'Float32 coefficient storage leaves only a small q=4 input-gain residual');
  assert.ok(Math.abs((2 - dFlatStored - b * q * q - tau * q) - frequencyAReal) < 1e-8,
    'Float32 coefficient storage leaves only a small q=4 pole residual');
  assert.throws(() => q4MatchedFlatLossTopology(topology, -1), /finite and nonnegative/);
  assert.throws(() => q4MatchedFlatLossTopology({ ...topology, solverRateHz: 48000 }, gamma), /compiled 6 kHz/);
});

test('48 kHz rate mapping scales the solver, coefficients, contact input and compliance reference on a copied topology', () => {
  const topology = compileSurfaceTopology({ plates: [plate()], stratigraphy: { layerOrder: ['p'] } });
  const originalSource = bornSource, originalCoefficients = topology.materialCoefficients.slice();
  const mapped = rateAwareSurface(bornSource, topology);
  assert.equal(mapped.source, bornSource.replace('const RATE = 6000;', 'const RATE = 48000;')
    .replace('const CONTACT_REFERENCE_DELTA_V = 0.020;', 'const CONTACT_REFERENCE_DELTA_V = 0.020 / 8;')
    .replace('const deltaV = impulse * w / norm / Math.sqrt(density);', 'const deltaV = impulse * w / norm / Math.sqrt(density) / 8;'));
  assert.deepEqual(mapped.patches, ['rate 6000 to 48000', 'compliance reference velocity', 'contact pulse duration', 'per-step contact velocity']);
  assert.equal(mapped.topology.solverRateHz, 48_000);
  assert.notEqual(mapped.topology, topology);
  assert.notEqual(mapped.topology.materialCoefficients, topology.materialCoefficients);
  for (const key of ['nodeOffsets', 'nodeGridIndices', 'neighborIndices', 'pickupNodeIndices', 'routingTopLayerByCell96'])
    assert.equal(mapped.topology[key], topology[key], `${key} remains identical`);
  assert.deepEqual(topology.materialCoefficients, originalCoefficients);
  assert.equal(bornSource, originalSource);
  const before = topology.materialCoefficients, after = mapped.topology.materialCoefficients;
  for (let layer = 0; layer < topology.layerIds.length; layer++) {
    const i = layer * 4, pole6 = 1 - 50 * before[i + 3], pole48 = 1 - 50 * after[i + 3];
    assert.ok(Math.abs(after[i] - before[i] / 64) < 1e-8);
    assert.ok(Math.abs(after[i + 1] - before[i + 1] / 64) < 1e-8);
    assert.equal(after[i + 2], before[i + 2]);
    assert.ok(Math.abs(pole48 ** 8 - pole6) < 1e-7, `constant loss pole ${pole6} -> ${pole48}`);
  }
  assert.equal(mapped.definition.pulseSteps, 144);
  assert.equal(mapped.definition.contactVelocityScale, 1 / 8);
  assert.equal(mapped.definition.complianceReferenceVelocityScale, 1 / 8);
  assert.equal(mapped.definition.recoveryDurationMs, 75);
  const originalProcessor = instantiate(bornSource), mappedProcessor = instantiate(mapped.source);
  for (const processor of [originalProcessor, mappedProcessor]) {
    processor.handleMessage({ type: 'topology', payload: processor === originalProcessor ? topology : mapped.topology });
    processor.handleMessage({ type: 'strike', payload: { plateId: 'p', position: { x: .5, y: .5 }, strength: .035 } });
  }
  assert.ok(Math.abs(mappedProcessor.telemetry.requestedContactImpulseSquared * 64
    - originalProcessor.telemetry.requestedContactImpulseSquared) < 1e-9);
  assert.ok(Math.abs(mappedProcessor.telemetry.compliantContactImpulseSquared * 64
    - originalProcessor.telemetry.compliantContactImpulseSquared) < 1e-9);
  const node = topology.pickupNodeIndices[0];
  const total = (processor, steps) => {
    let sum = 0;
    for (let step = 0; step < steps; step++) sum += processor.contactForces[step * processor.current.length + node];
    return sum;
  };
  assert.ok(Math.abs(total(mappedProcessor, 144) * 8 - total(originalProcessor, 18)) < 1e-7,
    'same total velocity impulse across the 8x step rate');
});

test('48 kHz Base elastic constants and instantaneous pulse are an explicit separate map', () => {
  const topology = compileSurfaceTopology({ plates: [plate()], stratigraphy: { layerOrder: ['p'] } });
  const mapped = rateAwareSurface(bornSource, topology, { baseElastic: true, instant: true });
  const c = mapped.topology.materialCoefficients, density = topology.materialCoefficients[2];
  assert.equal(c[0], Math.fround(.01041070909374015));
  assert.equal(c[1], Math.fround(.0012476847034339226 * density));
  assert.equal(c[2], topology.materialCoefficients[2]);
  assert.match(mapped.source, /const RATE = 48000/);
  assert.match(mapped.source, /const CONTACT_PULSE_STEPS = 1/);
  assert.match(mapped.source, /CONTACT_RECOVERY_STEPS = RATE \* 0\.075/);
  assert.equal(mapped.definition.semanticPulseDurationMs, null);
  assert.throws(() => rateAwareSurface(genericSource, topology), /ANT surface worklet/);
});

test('48 kHz short shadow render stays finite through 1.5 s, before the two-second sleep threshold', () => {
  const topology = compileSurfaceTopology({ plates: [plate()], stratigraphy: { layerOrder: ['p'] } });
  const mapped = rateAwareSurface(bornSource, topology);
  const processor = instantiate(mapped.source);
  processor.handleMessage({ type: 'topology', payload: mapped.topology });
  processor.handleMessage({ type: 'strike', payload: { plateId: 'p', position: { x: .5, y: .5 }, strength: .035 } });
  let frames = 0;
  while (frames < 72_000) {
    const count = Math.min(128, 72_000 - frames), left = new Float32Array(count), right = new Float32Array(count);
    processor.process([], [[left, right]]);
    assert.ok([...left, ...right].every(Number.isFinite));
    frames += count;
  }
  const diagnostics = processor.getDiagnostics();
  assert.equal(diagnostics.physicsSteps, frames);
  assert.equal(diagnostics.contactPulseSteps, 144);
  assert.equal(diagnostics.contactPulseDurationMs, 3);
  assert.equal(diagnostics.contactRecoveryTimeMs, 75);
  assert.equal(diagnostics.nonFinite, 0);
});

test('generic reference captures exact event frames, finite fields and repeatable seeded PCM', async () => {
  assert.equal(await loadGenericPlateSource(), genericSource);
  const input = { source: genericSource, frames: 2048, seed: 123,
    events: [{ frame: 0, message: { type: 'strike', payload: { position: { x: 0, y: 0 }, strength: .36 } } },
      { frame: 511, message: { type: 'strike', payload: { position: { x: .2, y: -.1 }, strength: .2 } } }] };
  const a = renderGenericReference(input), b = renderGenericReference(input);
  assert.deepEqual(a.pcm, b.pcm);
  assert.deepEqual(a.pcm, renderGenericUninstrumented(input), 'observer instrumentation preserves output with identical random draws');
  assert.deepEqual(a.fields, b.fields);
  assert.deepEqual(a.draws, b.draws);
  assert.deepEqual(a.receipts.map(row => row.frame), [0, 511]);
  assert.equal(a.fields.frames, input.frames);
  assert.equal(a.fields.values.length, input.frames * a.fields.nodeCount);
  assert.equal(a.rawPickup.left.length, input.frames);
  assert.equal(a.preLimiter.right.length, input.frames);
  assert.ok(a.draws.length > 0);
  assert.ok(a.fields.values.every(Number.isFinite));
  assert.ok([...a.pcm.left, ...a.pcm.right, ...a.rawPickup.left, ...a.rawPickup.right].every(Number.isFinite));
  assert.equal(a.telemetry.nonFinite, 0);
  assert.deepEqual(a.grid, { size: 17, center: 8, radius: 7.3 });
});

test('generic reference preserves its actual frequency loss by default and can disable it', () => {
  const events = [{ frame: 0, message: { type: 'strike', payload: { position: { x: 0, y: 0 }, strength: .25 } } }];
  const base = renderGenericReference({ source: genericSource, events, frames: 512, seed: 9 });
  const same = renderGenericReference({ source: genericSource, events, frames: 512, seed: 9 });
  const disabled = renderGenericReference({ source: genericSource, events, frames: 512, seed: 9, disableFrequencyLoss: true });
  assert.deepEqual(base.pcm, same.pcm);
  assert.notDeepEqual(base.pcm, disabled.pcm);
  assert.equal(disabled.coefficients.frequencyLoss, 0);
  assert.throws(() => renderGenericReference({ source: genericSource, frames: 128,
    events: [{ frame: 128, message: { type: 'strike' } }] }), /outside render/);
});
