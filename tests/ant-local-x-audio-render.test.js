import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { createBrowserParityFixture, instrumentLocalAudioSource, renderLocalAudio, renderLocalAudioOffline } from '../scripts/ant-local-x-audio-render.js';

const source = readFileSync(new URL('../static/worklets/surface-plate.worklet.js', import.meta.url), 'utf8');
function plate(id = 'route') {
  const mask = new Array(96 * 96).fill(0);
  for (let y = 45; y <= 51; y++) for (let x = 42; x <= 54; x++) mask[y * 96 + x] = 1;
  return { id, grid: { width: 96, height: 96 }, mask, edges: [],
    pickups: [{ x: 42 / 95, y: 48 / 95 }, { x: 54 / 95, y: 48 / 95 }],
    material: { stiffness: .9, density: 1.1, damping: .35 } };
}
const topology = (...plates) => compileSurfaceTopology({ plates, stratigraphy: { layerOrder: plates.map(p => p.id) } });
const hit = { type: 'strike', payload: { plateId: 'route', layerId: 'route', position: { x: .5, y: 48 / 95 }, strength: .035, footprintRadius: .012 } };

test('a strike exactly at a fixed-window start belongs to that half-open window', () => {
  const frame = 50 * 48_000;
  const rendered = renderLocalAudio({ source, initialTopology: topology(plate()),
    events: [{ frame, message: hit }], frames: frame + 128, captureObserver: true });
  assert.equal(rendered.observer[0].layers[0].directStrikes, 1);
});

test('local audio replay preserves native PCM and dynamic state across chunk boundaries and topology reinstall', () => {
  const initialTopology = topology(plate());
  const events = [
    { frame: 137, message: hit }, { frame: 137, message: hit },
    { frame: 505, message: hit }, { frame: 511, message: { type: 'topology', payload: topology(plate(), plate('new')) } },
    { frame: 700, message: { ...hit, payload: { ...hit.payload, plateId: 'new', layerId: 'new' } } }
  ];
  const input = { source, initialTopology, events, frames: 2048, captureObserver: false };
  let forcesAfterTopology = false;
  const measured = renderLocalAudio({ ...input, onChunk(frame, processor) {
    if (frame >= 639 && frame < 700) forcesAfterTopology ||= processor.contactForces.some(value => value !== 0);
  } });
  const native = renderLocalAudio({ ...input, instrumented: false });
  assert.deepEqual(measured.pcm, native.pcm);
  assert.deepEqual(measured.telemetry, native.telemetry);
  assert.deepEqual(measured.state, native.state);
  assert.deepEqual(measured.events.map(e => e.actualFrame), [137, 137, 505, 511, 700]);
  assert.equal(forcesAfterTopology, true, 'topology reinstall preserves still-pending contact ring forces');
  const chunked = renderLocalAudio({ ...input, quantumFrames: 64 });
  assert.deepEqual(chunked.pcm, measured.pcm, 'process chunking at scheduler boundaries does not change output');
  assert.equal(measured.telemetry.droppedRoutes, 0);
  assert.equal(measured.telemetry.topologies, 2);
});

test('empty initial topology is explicitly installed and no route may be dropped', () => {
  const empty = topology();
  const silent = renderLocalAudio({ source, initialTopology: empty, frames: 256, events: [], captureObserver: false });
  assert.deepEqual([...silent.pcm.left, ...silent.pcm.right], new Array(512).fill(0));
  assert.equal(silent.telemetry.topologies, 1);
  assert.throws(() => renderLocalAudio({ source, initialTopology: empty, frames: 256,
    events: [{ frame: 0, message: hit }] }), /dropped a route/);
});

test('instrumentation is fail-closed on native source anchors and event frame bounds', () => {
  assert.throws(() => instrumentLocalAudioSource(source.replace('  constructor() {', '  constructor(options) {')),
    /anchor missing or ambiguous/);
  assert.throws(() => renderLocalAudio({ source, initialTopology: topology(), frames: 128,
    events: [{ frame: 128, message: hit }] }), /outside render/);
});

test('browser parity fixture covers aligned quantum rendering, pending forces, overlap topology and a native nodule', async () => {
  const fixture = createBrowserParityFixture();
  assert.equal(fixture.frames % 128, 0);
  assert.deepEqual(fixture.events.map(event => event.frame), [0, 16, 800, 800]);
  assert.equal(fixture.initialTopology.noduleIds.length, 1);
  assert.deepEqual(fixture.events[2].message.payload.layerIds, ['parity-bottom', 'parity-top']);
  const result = renderLocalAudio({ source, ...fixture, captureObserver: false, instrumented: false });
  assert.equal(result.telemetry.strikes, 2);
  assert.equal(result.telemetry.topologies, 3);
  assert.equal(result.telemetry.droppedRoutes, 0);
  assert.ok([...result.pcm.left, ...result.pcm.right].every(Number.isFinite));
  await assert.rejects(renderLocalAudioOffline({ page: { evaluate() {} }, source,
    initialTopology: fixture.initialTopology, events: fixture.events, frames: 24_000 }), /align to 128-frame/);
});
