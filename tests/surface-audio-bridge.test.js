import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceAudioBridge } from '../src/lib/audio/SurfaceAudioBridge.js';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

function descriptor(id, { x = 0.5, y = 0.5, halfWidth = 2 } = {}) {
  const mask = new Array(96 * 96).fill(0);
  for (let row = Math.max(0, Math.round(y * 95) - halfWidth); row <= Math.min(95, Math.round(y * 95) + halfWidth); row += 1) {
    for (let column = Math.max(0, Math.round(x * 95) - halfWidth); column <= Math.min(95, Math.round(x * 95) + halfWidth); column += 1) {
      mask[row * 96 + column] = 1;
    }
  }
  return { id, bornAtSimulationTimeMs: 0, grid: { width: 96, height: 96 }, mask,
    edges: [], pickups: [{ x, y }, { x, y }],
    material: { stiffness: 0.9, density: 1.1, damping: 0.35 } };
}

function workletHarness() {
  const messages = [];
  const gain = { value: 0.7, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(value) { this.value = value; } };
  const handle = { node: { port: { postMessage: (message) => messages.push(message) } }, gainNode: { gain }, disconnectCount: 0,
    disconnect() { this.disconnectCount += 1; } };
  const audioEngine = { context: { currentTime: 0 }, createWorklet: async (...args) => {
    assert.equal(args[0], 'surface-plate-processor');
    assert.equal(args[2].maxLayers, 256);
    assert.equal(args[5].channels, 2);
    assert.equal(args[5].gain, 0.7);
    return handle;
  } };
  return { audioEngine, handle, messages };
}

test('stores bounded immutable birth descriptors and recreates surfaces without replaying contacts', async () => {
  const harness = workletHarness();
  const bridge = new SurfaceAudioBridge({ audioEngine: harness.audioEngine });
  const plates = Array.from({ length: 257 }, (_, index) => descriptor(`route-${index}`));
  assert.equal(bridge.syncPlates(plates), 256);
  assert.equal(bridge.plates.size, 256);
  assert.equal(bridge.diagnostics.capacityRejectedLayers, 1);
  assert.equal(Object.isFrozen(bridge.plates.get('route-0')), true);
  assert.equal(bridge.syncPlates([plates[0]]), 0);
  await bridge.setEnabled(true);
  assert.equal(harness.messages.filter((message) => message.type === 'topology').length, 1);
  assert.equal(harness.messages[0].payload.maxLayers, 256);
  assert.equal(bridge.enabled, true);
  await bridge.setEnabled(false);
  assert.equal(bridge.enabled, false);
  assert.equal(harness.handle.disconnectCount, 1);
  assert.equal(bridge.plates.size, 256);
  await bridge.setEnabled(true);
  assert.equal(harness.messages.filter((message) => message.type === 'topology').length, 2);
  assert.equal(harness.messages.some((message) => message.type === 'strike'), false);
  await bridge.destroy();
  assert.equal(harness.handle.disconnectCount, 2);
  assert.equal(bridge.audioEngine.destroyed, undefined);
});

test('routes each foot only to the uppermost overlapping plate and leaves unsupported energy unused', async () => {
  const harness = workletHarness();
  const bridge = new SurfaceAudioBridge({ audioEngine: harness.audioEngine });
  const center = descriptor('center', { x: 0.5, y: 0.5 });
  const overlap = descriptor('overlap', { x: 0.51, y: 0.5 });
  bridge.syncPlates([center, overlap]);
  await bridge.setEnabled(true);
  harness.messages.length = 0;
  const event = { type: 'FOOT_CONTACT', strength: 0.04,
    contacts: [{ legId: 'FL' }, { legId: 'MR' }] };
  const responses = [
    { legId: 'FL', position: { x: 0.5, y: 0.5 }, hardness: 0.5, footprintRadius: 0.01, strengthTransfer: 1.05 },
    // This valid foot has no route and its share must remain unused.
    { legId: 'MR', position: { x: 0.15, y: 0.2 }, hardness: 0.1, footprintRadius: 0.014, strengthTransfer: 0.95 }
  ];
  assert.equal(bridge.handleFootContact(event, { responses }), true);
  const strikes = harness.messages.filter((message) => message.type === 'strike');
  assert.equal(strikes.length, 1);
  assert.deepEqual(new Set(strikes.map((message) => message.payload.plateId)), new Set(['overlap']));
  const energy = strikes.reduce((sum, message) => sum + message.payload.strength ** 2, 0);
  assert.ok(energy <= event.strength ** 2 + 1e-12, `event energy ${energy} exceeded budget`);
  assert.ok(energy < event.strength ** 2 * 0.75, 'unserved foot energy should not be redistributed');
  assert.ok(strikes.every((message) => message.payload.position.x >= 0 && message.payload.strength <= 0.05));
  assert.equal(bridge.diagnostics.supportedFeet, 1);
  assert.equal(bridge.diagnostics.unsupportedFeet, 1);
  assert.equal(bridge.diagnostics.directExposedStrikes, 1);
  assert.ok(bridge.diagnostics.injectedImpulseEnergy <= event.strength ** 2 + 1e-12);
  await bridge.destroy();
});

test('syncMaterial compiles exposure routing so buried overlapping layers receive no direct foot strikes', async () => {
  const harness = workletHarness();
  const bridge = new SurfaceAudioBridge({ audioEngine: harness.audioEngine });
  const bottom = descriptor('bottom', { x: 0.5, y: 0.5 });
  const top = descriptor('top', { x: 0.5, y: 0.5 });
  const topLayerByCell = new Int32Array(96 * 96).fill(-1);
  const layerCountByCell = new Uint16Array(96 * 96);
  for (let y = 0; y < 96; y += 1) for (let x = 0; x < 96; x += 1) {
    const index = y * 96 + x;
    layerCountByCell[index] = Number(Boolean(bottom.mask[index])) + Number(Boolean(top.mask[index]));
    if (bottom.mask[index]) topLayerByCell[index] = 0;
    if (top.mask[index]) topLayerByCell[index] = 1;
  }
  const snapshot = { width: 96, height: 96, revision: 1, noduleRevision: 0,
    plates: [bottom, top], nodules: [], stratigraphy: { version: 1, revision: 1,
      layerOrder: ['bottom', 'top'], topLayerByCell, layerCountByCell } };
  assert.equal(bridge.syncMaterial(snapshot), true);
  assert.equal(bridge.topology.version, 1);
  assert.equal(bridge.syncMaterial(snapshot), true, 'unchanged material revisions do not recompile or repost');
  const expected = compileSurfaceTopology({ plates: [...bridge.plates.values()], nodules: [],
    stratigraphy: snapshot.stratigraphy, generation: bridge.topologyGeneration + 1, maxLayers: 256 });
  assert.deepEqual(bridge.topology.routingTopLayerByCell96, expected.routingTopLayerByCell96);
  await bridge.setEnabled(true);
  harness.messages.length = 0;
  const result = bridge.handleFootContact({ type: 'FOOT_CONTACT', strength: 0.03,
    contacts: [{ legId: 'FL' }] }, { responses: [
    { legId: 'FL', position: { x: 0.5, y: 0.5 }, hardness: 0.5,
      footprintRadius: 0.01, strengthTransfer: 1 }
  ] });
  assert.equal(result, true);
  const strikes = harness.messages.filter((message) => message.type === 'strike');
  assert.equal(strikes.length, 1);
  assert.equal(strikes[0].payload.plateId, 'top');
  assert.equal(strikes[0].payload.layerId, 'top');
  await bridge.destroy();
});

test('syncPlates fallback compiles once per topology change and Off/On sends topology without replaying impacts', async () => {
  const harness = workletHarness();
  const bridge = new SurfaceAudioBridge({ audioEngine: harness.audioEngine });
  const route = descriptor('route');
  assert.equal(bridge.syncPlates([route]), 1);
  const generation = bridge.topology.generation;
  await bridge.setEnabled(true);
  assert.equal(harness.messages.filter(message => message.type === 'topology').length, 1);
  const event = { type: 'FOOT_CONTACT', strength: 0.03, contacts: [{ legId: 'FL' }] };
  const responses = [{ legId: 'FL', position: { x: 0.5, y: 0.5 }, hardness: 0.5,
    footprintRadius: 0.01, strengthTransfer: 1 }];
  assert.equal(bridge.handleFootContact(event, { responses }), true);
  await bridge.setEnabled(false);
  await bridge.setEnabled(true);
  assert.equal(bridge.topology.generation, generation);
  assert.equal(harness.messages.filter(message => message.type === 'topology').length, 2);
  assert.equal(harness.messages.filter(message => message.type === 'strike').length, 1,
    'Off/On does not replay historical impacts');
  await bridge.destroy();
});

test('does not backlog contacts during load and Off cancels a pending enable without destroying AudioEngine', async () => {
  let finish;
  const messages = [];
  const handle = { node: { port: { postMessage: (message) => messages.push(message) } }, disconnectCount: 0, disconnect() { this.disconnectCount += 1; } };
  const audioEngine = { createWorklet: () => new Promise((resolve) => { finish = () => resolve(handle); }) };
  const bridge = new SurfaceAudioBridge({ audioEngine });
  bridge.syncPlates([descriptor('route')]);
  const enabling = bridge.setEnabled(true);
  assert.equal(bridge.loading, true);
  assert.equal(bridge.handleFootContact({ type: 'FOOT_CONTACT', strength: 0.03, contacts: [] }, { responses: [] }), false);
  await bridge.setEnabled(false);
  finish();
  assert.equal(await enabling, false);
  assert.equal(handle.disconnectCount, 1);
  assert.equal(messages.some((message) => message.type === 'strike'), false);
  await bridge.destroy();
  assert.equal(audioEngine.destroyed, undefined);
});

test('a processor error disables and disconnects only the surface worklet', async () => {
  let reportError;
  const handle = { node: { port: { postMessage() {} } }, disconnectCount: 0, disconnect() { this.disconnectCount += 1; } };
  const audioEngine = { createWorklet: async (_name, _url, _options, _message, onError) => { reportError = onError; return handle; } };
  const bridge = new SurfaceAudioBridge({ audioEngine });
  await bridge.setEnabled(true);
  reportError(new Error('processor failure'));
  assert.equal(bridge.enabled, false);
  assert.match(bridge.error, /processor failure/);
  assert.equal(bridge.diagnostics.processorErrors, 1);
  assert.equal(handle.disconnectCount, 1);
  await bridge.destroy();
});

test('rejects empty or off-mask frozen surfaces before allocating worklet layers', async () => {
  const harness = workletHarness();
  const bridge = new SurfaceAudioBridge({ audioEngine: harness.audioEngine });
  const empty = descriptor('empty');
  empty.mask.fill(0);
  const invalidPickup = descriptor('invalid-pickup');
  invalidPickup.pickups[0] = { x: 0, y: 0 };
  assert.equal(bridge.syncPlates([empty, invalidPickup]), 0);
  assert.equal(bridge.plates.size, 0);
  await bridge.destroy();
});
