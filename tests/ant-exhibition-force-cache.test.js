import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { forceCacheSource, instrumentSleepForceWork, transformSleepForceCache } from '../scripts/ant-exhibition-force-cache.js';

const baseSource = readFileSync(new URL('../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');

function plate(id, x0 = 40, x1 = 56) {
  const mask = new Array(96 * 96).fill(0);
  for (let y = 44; y <= 52; y++) for (let x = x0; x <= x1; x++) mask[y * 96 + x] = 1;
  return { id, grid: { width: 96, height: 96 }, mask, edges: [],
    pickups: [{ x: x0 / 95, y: 48 / 95 }, { x: x1 / 95, y: 48 / 95 }],
    material: { stiffness: 0.9, density: 1.1, damping: 0.35 } };
}

function fixture(zCouplingEnabled = true, withSphere = true) {
  const plates = [plate('lower'), plate('upper')];
  const nodules = withSphere ? [{ id: 'sphere', position: { x: 0.5, y: 0.5 }, physicalRadiusMeters: 0.024,
    material: { density: 2000, youngModulus: 800000, poisson: 0.3, damping: 0.35 },
    burial: { buriedDepthMeters: 0.04 },
    coupling: { plateId: 'lower', position: { x: 0.5, y: 0.5 }, weight: 0.2 } }] : [];
  return compileSurfaceTopology({ plates, nodules, zCouplingEnabled, stratigraphy: { layerOrder: ['lower', 'upper'] } });
}

function instantiate(source, topology, diagnosticsEnabled = false) {
  let Processor;
  class Stub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(source, { AudioWorkletProcessor: Stub, sampleRate: 48_000,
    Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Array, Math, Number, Object, Map, performance: globalThis.performance,
    registerProcessor(_name, value) { Processor = value; } });
  const processor = new Processor();
  processor.setSleepDiagnostics(diagnosticsEnabled);
  processor.handleMessage({ type: 'topology', payload: topology });
  return processor;
}

function seedRenderedCase(source, topology, diagnosticsEnabled) {
  const processor = instantiate(source, topology, diagnosticsEnabled);
  for (let node = 0; node < processor.current.length; node++) {
    processor.current[node] = ((node * 13) % 9 - 4) * 0.00003;
    processor.previous[node] = ((node * 7) % 7 - 3) * 0.00002;
  }
  for (const node of [topology.pickupNodeIndices[0], topology.pickupNodeIndices[1],
    topology.pickupNodeIndices[topology.pickupNodeIndices.length - 2], topology.pickupNodeIndices.at(-1),
    topology.noduleCouplingNodeIndices[0]]) if (node !== 0xffffffff) processor.wakeNode(node);
  for (let mode = 0; mode < processor.sphereCurrent.length; mode++) {
    processor.sphereCurrent[mode] = (mode % 5 - 2) * 0.0008;
    processor.spherePrevious[mode] = (mode % 3 - 1) * 0.0004;
  }
  processor.handleMessage({ type: 'strike', payload: { plateId: 'lower',
    position: { x: 0.5, y: 0.5 }, strength: 0.00035, footprintRadius: 0.01 } });
  return processor;
}

function bytes(array) {
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

function solverState(processor) {
  const arrays = ['current', 'previous', 'next', 'energyQuiet', 'awake', 'active', 'pendingWake',
    'pendingWakeReason', 'pendingNodes', 'contactForces', 'contactMemory', 'lastContactStep',
    'sphereCurrent', 'spherePrevious'];
  return { arrays: Object.fromEntries(arrays.map(key => [key, bytes(processor[key]).toString('hex')])),
    scalars: { activeCount: processor.activeCount, pendingCount: processor.pendingCount,
      contactCursor: processor.contactCursor, phase: processor.phase, samplesSinceStep: processor.samplesSinceStep,
      outputL: processor.outputL, outputR: processor.outputR, telemetry: JSON.stringify(processor.telemetry) } };
}

function render(processor, frames = 4096) {
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (let offset = 0; offset < frames; offset += 128) {
    const count = Math.min(128, frames - offset), l = new Float32Array(count), r = new Float32Array(count);
    processor.process([], [[l, r]]);
    left.set(l, offset); right.set(r, offset);
  }
  return { left: bytes(left).toString('hex'), right: bytes(right).toString('hex') };
}

function runSequentialZ(source, diagnosticsEnabled = false) {
  const topology = fixture(true, false), processor = instantiate(source, topology, diagnosticsEnabled);
  const [a, b] = topology.adjacentLinkNodes;
  const findLink = (node, other) => {
    for (let q = processor.linkOffsets[node]; q < processor.linkOffsets[node + 1]; q++)
      if (processor.linkNodes[q] === other) return q;
    assert.fail(`missing directed Z link ${node} -> ${other}`);
  };
  processor.linkCoefficients[findLink(a, b)] = Math.fround(0.01);
  processor.linkCoefficients[findLink(b, a)] = Math.fround(0.01);
  processor.current[a] = processor.previous[a] = processor.current[b] = processor.previous[b] = 0;
  processor.previous[a] = -2e-6;
  processor.awake[a] = processor.awake[b] = 1;
  processor.active[0] = a; processor.active[1] = b; processor.activeCount = 2;
  processor.energyQuiet[a] = 0; processor.energyQuiet[b] = 11999;
  const sampled = [];
  const original = processor.localLinkForce;
  processor.localLinkForce = function (node) {
    const value = original.call(this, node);
    sampled.push({ node, value });
    return value;
  };
  const preAdvanceB = original.call(processor, b);
  processor.advancePhysics();
  return { processor, a, b, preAdvanceB, sampled };
}

function runSequentialZOff(source) {
  const topology = fixture(false, false), processor = instantiate(source, topology);
  const a = topology.pickupNodeIndices[0], b = topology.pickupNodeIndices[1];
  processor.previous[a] = -2e-6;
  processor.awake[a] = processor.awake[b] = 1;
  processor.active[0] = a; processor.active[1] = b; processor.activeCount = 2;
  processor.energyQuiet[a] = 0; processor.energyQuiet[b] = 11999;
  processor.advancePhysics();
  return { processor, a, b };
}

test('force-cache transform is identity by default, anchored, and refuses unsafe Z reuse', () => {
  assert.equal(transformSleepForceCache(baseSource).source, baseSource);
  assert.deepEqual(transformSleepForceCache(baseSource, { plateCache: true, sphereCache: true }).patches,
    ['Plate Lap-of-Lap cache', 'post-advance Sphere force cache']);
  assert.equal(forceCacheSource(baseSource), transformSleepForceCache(baseSource,
    { plateCache: true, sphereCache: true }).source);
  assert.throws(() => transformSleepForceCache('unrelated worklet'), /ANT surface Plate worklet/);
  assert.throws(() => transformSleepForceCache(baseSource.replace('let lapOfLap = -4 * lap[node]', 'let other = -4 * lap[node]'),
    { plateCache: true }), /anchor missing or ambiguous: Plate recurrence declaration/);
  assert.throws(() => transformSleepForceCache(baseSource, { zCache: true }), /not exact.*sequential/i);
});

test('Plate and post-advance Sphere caches preserve complete solver state and PCM with diagnostics and Z toggles', () => {
  const variants = [baseSource,
    transformSleepForceCache(baseSource, { plateCache: true }).source,
    transformSleepForceCache(baseSource, { sphereCache: true }).source,
    transformSleepForceCache(baseSource, { plateCache: true, sphereCache: true }).source];
  for (const zCouplingEnabled of [false, true]) for (const diagnosticsEnabled of [false, true]) {
    const topology = fixture(zCouplingEnabled, true);
    const baseline = seedRenderedCase(variants[0], topology, diagnosticsEnabled);
    const baselinePcm = render(baseline);
    const baselineState = solverState(baseline);
    for (let variant = 1; variant < variants.length; variant++) {
      const candidate = seedRenderedCase(variants[variant], topology, diagnosticsEnabled);
      assert.deepEqual(render(candidate), baselinePcm, `PCM variant=${variant}, z=${zCouplingEnabled}, diagnostics=${diagnosticsEnabled}`);
      assert.deepEqual(solverState(candidate), baselineState,
        `solver state variant=${variant}, z=${zCouplingEnabled}, diagnostics=${diagnosticsEnabled}`);
    }
  }
});

test('Sphere reuse uses the exact post-advance modal state', () => {
  const topology = fixture(false, true), foundation = topology.noduleCouplingNodeIndices[0];
  const baseline = instantiate(baseSource, topology), candidate = instantiate(
    transformSleepForceCache(baseSource, { sphereCache: true }).source, topology);
  for (const processor of [baseline, candidate]) {
    processor.awake[foundation] = 1;
    processor.current[foundation] = 0.02;
    processor.previous[foundation] = 0.019;
    for (let mode = 0; mode < 12; mode++) {
      processor.sphereCurrent[mode] = (mode + 1) * 0.001;
      processor.spherePrevious[mode] = -mode * 0.0003;
    }
  }
  const before = baseline.localSphereForce(foundation);
  baseline.advanceNodules(); candidate.advanceNodules();
  const expected = baseline.localSphereForce(foundation);
  const reused = candidate.localSphereForce(foundation);
  assert.notEqual(expected, before, 'fixture must distinguish pre-advance and post-advance modal state');
  assert.equal(reused, expected);
});

test('Z recurrence force is not a valid sleep cache under sequential current[] commits', () => {
  const base = runSequentialZ(baseSource), cached = runSequentialZ(
    transformSleepForceCache(baseSource, { plateCache: true, sphereCache: true }).source);
  for (const run of [base, cached]) {
    const { a, b, preAdvanceB, sampled, processor } = run;
    const bSleepRead = sampled.find(value => value.node === b);
    assert.equal(preAdvanceB, 0);
    assert.ok(processor.current[a] > 0);
    assert.ok(bSleepRead?.value > 1e-8, `sequential sleep read=${bSleepRead?.value}`);
    assert.equal(processor.energyQuiet[b], 0, 'updated neighbor force resets the near-threshold quiet timer');
    assert.equal(processor.awake[b], 1);
  }
  assert.deepEqual(solverState(cached.processor), solverState(base.processor));
  const diagnosticBase = runSequentialZ(baseSource, true), diagnosticCached = runSequentialZ(forceCacheSource(baseSource), true);
  assert.equal(diagnosticBase.sampled.some(value => value.node === diagnosticBase.b), false,
    'tracked diagnostics use the recurrence sample instead of the sequential localLinkForce call');
  assert.equal(diagnosticBase.processor.awake[diagnosticBase.b], 0,
    'the diagnostic pre-state Z value lets this fixture reach sleep');
  assert.deepEqual(solverState(diagnosticCached.processor), solverState(diagnosticBase.processor));
  const zOff = instantiate(transformSleepForceCache(baseSource, { plateCache: true, sphereCache: true }).source,
    fixture(false, false));
  assert.equal(zOff.linkNodes.length, 0, 'Z-off remains an explicit topology condition');
});

test('Z-off lets a near-threshold quiet node sleep and cache state stays exact', () => {
  const base = runSequentialZOff(baseSource), cached = runSequentialZOff(forceCacheSource(baseSource));
  for (const { processor, b } of [base, cached]) {
    assert.equal(processor.energyQuiet[b], 0, 'sleep clears the quiet counter');
    assert.equal(processor.awake[b], 0);
    assert.equal(processor.telemetry.sleeps, 1);
  }
  assert.deepEqual(solverState(cached.processor), solverState(base.processor));
});

test('work instrumentation separates recurrence-cache work from sleep force reads', () => {
  const topology = fixture(false, true), foundation = topology.noduleCouplingNodeIndices[0];
  const run = source => {
    const processor = instantiate(source, topology);
    processor.awake[foundation] = 1; processor.active[0] = foundation; processor.activeCount = 1;
    processor.energyQuiet[foundation] = 11999;
    const monitor = instrumentSleepForceWork(processor);
    processor.advancePhysics();
    monitor.restore();
    return { counts: monitor.counts, state: solverState(processor) };
  };
  const baseline = run(baseSource), cached = run(forceCacheSource(baseSource));
  assert.deepEqual(cached.state, baseline.state);
  assert.equal(JSON.parse(cached.state.scalars.telemetry).sleeps, 1, 'near-threshold state reaches the actual sleep transition');
  const { counts: baseCounts } = baseline, { counts: cachedCounts } = cached;
  assert.ok(baseCounts.localPlateStencilVisits > 0);
  assert.equal(cachedCounts.localPlateStencilVisits, 0);
  assert.equal(cachedCounts.cachedPlateCalls, cachedCounts.localPlateCalls);
  assert.equal(cachedCounts.plateCacheWrites, 1);
  assert.equal(baseCounts.localSphereModeTerms, 12);
  assert.equal(cachedCounts.localSphereModeTerms, 0);
  assert.equal(cachedCounts.spherePostAdvanceCacheModeTerms, 12,
    'post-advance modal products are moved into the cache path and must count toward cost');
  assert.equal(cachedCounts.cachedSphereCalls, cachedCounts.localSphereCalls);
});
