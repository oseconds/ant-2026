import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import {
  captureControllerState, createSeededRandom, restoreControllerState,
  restoreStateGraph, rngCheckpoint, serializeStateGraph
} from '../scripts/ant-transfer-state.js';

test('state graph restore preserves prototypes, cycles, map aliases and shared typed-array buffers', () => {
  class Knot { value() { return this.label; } }
  const buffer = new ArrayBuffer(24);
  const words = new Uint16Array(buffer, 4, 2);
  const floats = new Float32Array(buffer, 8, 2);
  words.set([23, 41]);
  floats.set([1.25, -2.5]);
  const knot = new Knot();
  knot.label = 'identity';
  knot.self = knot;
  knot.words = words;
  knot.floats = floats;
  knot.index = new Map([[knot, new Set([knot])]]);
  knot.frozen = Object.freeze([1, 2, 3]);

  const graph = serializeStateGraph(knot, { extraTypes: [Knot] });
  const copy = restoreStateGraph(graph, { extraTypes: [Knot] });
  assert.ok(copy instanceof Knot);
  assert.equal(copy.value(), 'identity');
  assert.equal(copy.self, copy);
  assert.equal(copy.index.get(copy).has(copy), true);
  assert.equal(copy.words.buffer, copy.floats.buffer);
  assert.deepEqual([...copy.words], [23, 41]);
  assert.deepEqual([...copy.floats], [1.25, -2.5]);
  assert.equal(Object.isFrozen(copy.frozen), true);
});

test('seeded RNG checkpoint restores the next value and draw count exactly', () => {
  const random = createSeededRandom(20261023);
  for (let index = 0; index < 37; index += 1) random();
  const checkpoint = rngCheckpoint(random);
  const restored = createSeededRandom(checkpoint.seed, checkpoint);
  assert.equal(restored(), random());
  assert.deepEqual(rngCheckpoint(restored), rngCheckpoint(random));
});

test('production controller replays one tick from a complete pre-tick graph', async () => {
  const controller = new AntController({ random: createSeededRandom(20261023),
    state: { population: { count: 8, activationFeedback: false } } });
  await controller.init();
  for (let index = 0; index < 900; index += 1) controller.tick(1 / 60);

  assert.ok(controller.field.getSnapshot().totalMass > 0);
  assert.ok(controller.surfaceField.totalFootContacts > 0);
  assert.ok(controller.trailPlateBirth.footContactCounts.some(count => count > 0));

  const capture = captureControllerState(controller);
  const replay = restoreControllerState(capture);
  assert.deepEqual(captureControllerState(replay), capture);
  controller.tick(1 / 60);
  replay.tick(1 / 60);
  assert.deepEqual(captureControllerState(replay), captureControllerState(controller));

  const sourceSnapshot = controller.getSnapshot();
  const replaySnapshot = replay.getSnapshot();
  assert.deepEqual(replaySnapshot, sourceSnapshot);
  assert.deepEqual(captureControllerState(replay), captureControllerState(controller));
  await controller.destroy();
  await replay.destroy();
});

test('controller capture rejects external observers and non-restorable RNGs', async () => {
  const controller = new AntController({ random: createSeededRandom(12) });
  await controller.init();
  const unsubscribe = controller.subscribe(() => {});
  assert.throws(() => captureControllerState(controller), /no active controller listeners/);
  unsubscribe();
  controller.random = Math.random;
  assert.throws(() => captureControllerState(controller), /restorable RNG/);
  await controller.destroy();
});
