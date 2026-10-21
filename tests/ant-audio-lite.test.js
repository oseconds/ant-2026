import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { SurfaceAudioBridge } from '../src/lib/audio/SurfaceAudioBridge.js';

const workletSource = readFileSync(new URL('../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');

function fixtures() {
  const mask = new Array(96 * 96).fill(0);
  for (let y = 44; y <= 52; y++) for (let x = 40; x <= 56; x++) mask[y * 96 + x] = 1;
  const plate = (id) => ({ id, grid: { width: 96, height: 96 }, mask, edges: [],
    pickups: [{ x: 40 / 95, y: 48 / 95 }, { x: 56 / 95, y: 48 / 95 }],
    material: { stiffness: 0.9, density: 1.1, damping: 0.35 } });
  const lower = plate('lower'), upper = plate('upper');
  const sphere = { id: 'sphere', position: { x: 0.5, y: 0.5 }, physicalRadiusMeters: 0.04,
    material: { density: 2700, youngModulus: 70e9, poisson: 0.33, damping: 0.35 },
    coupling: { plateId: 'lower', position: { x: 0.5, y: 0.5 }, weight: 0.3 } };
  const options = { plates: [lower, upper], nodules: [sphere], stratigraphy: { layerOrder: ['lower', 'upper'] } };
  return { options, plate };
}

function makeProcessor(topology) {
  let Processor;
  class Stub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(workletSource, { AudioWorkletProcessor: Stub, sampleRate: 48_000,
    Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Array, Math, Number, Object, performance: globalThis.performance,
    registerProcessor: (_name, value) => { Processor = value; } });
  const processor = new Processor();
  processor.handleMessage({ type: 'topology', payload: topology });
  return processor;
}

test('default and explicit full topology stay identical; Audio Lite removes only adjacent Z links', () => {
  const { options } = fixtures();
  const full = compileSurfaceTopology(options);
  assert.deepEqual(compileSurfaceTopology({ ...options, zCouplingEnabled: true }), full);
  const lite = compileSurfaceTopology({ ...options, zCouplingEnabled: false });
  assert.ok(full.adjacentLinkNodes.length > 0);
  assert.equal(lite.adjacentLinkNodes.length, 0);
  assert.equal(lite.adjacentLinkCoefficients.length, 0);
  assert.equal(lite.adjacentLinkOffsets.length, full.adjacentLinkOffsets.length);
  assert.ok(lite.adjacentLinkOffsets.every((offset) => offset === 0));
  for (const key of ['version', 'generation', 'revision', 'sourceGrid', 'solverGrid', 'solverRateHz', 'maxLayers',
    'maxNodules', 'layerIds', 'nodeOffsets', 'nodeGridIndices', 'neighborIndices', 'pickupNodeIndices',
    'materialCoefficients', 'routingTopLayerByCell96', 'sourceColumnOffsets', 'sourceColumnLayerIndices',
    'sourceLayerCountByCell96', 'columnOffsets', 'columnLayerIndices', 'columnNodeIndices', 'noduleIds',
    'nodules', 'noduleFoundationLayerIndices', 'noduleCouplingNodeIndices', 'nodulePositionsXY',
    'nodulePhysicalRadiiMeters', 'noduleMaterials', 'noduleCouplingWeights']) assert.deepEqual(lite[key], full[key], key);
  assert.throws(() => compileSurfaceTopology({ ...options, zCouplingEnabled: 0 }), /must be a boolean/);
});

test('bridge keeps startup mode read-only and reports Z coupling state', () => {
  const { options } = fixtures();
  const bridge = new SurfaceAudioBridge({ audioEngine: {}, zCouplingEnabled: false });
  assert.equal(bridge.compileTopology(options), true);
  assert.equal(bridge.zCouplingEnabled, false);
  assert.equal(bridge.topology.adjacentLinkNodes.length, 0);
  assert.equal(bridge.getDiagnostics().bridge.zCouplingEnabled, false);
  assert.throws(() => { bridge.zCouplingEnabled = true; }, TypeError);
});

test('zero adjacent pairs build empty Z links while retaining Sphere foundation links', () => {
  const { options } = fixtures();
  const topology = compileSurfaceTopology({ ...options, zCouplingEnabled: false });
  const processor = makeProcessor(topology);
  assert.equal(processor.linkNodes.length, 0);
  assert.equal(processor.sphereCurrent.length, 12);
  assert.notEqual(processor.sphereFoundation[0], 0xffffffff);
  assert.ok(processor.sphereLinkOffsets[processor.sphereFoundation[0] + 1]
    > processor.sphereLinkOffsets[processor.sphereFoundation[0]]);
  assert.equal(processor.telemetry.nonFinite, 0);
});
