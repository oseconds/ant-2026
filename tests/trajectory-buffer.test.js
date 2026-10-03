import test from 'node:test';
import assert from 'node:assert/strict';
import { TrajectoryBuffer } from '../src/lib/utils/TrajectoryBuffer.js';

test('ring overwrites oldest samples while retaining chronological detached values', () => {
  const history = new TrajectoryBuffer({ capacity: 3 });
  history.push({ timestamp: 0, x: 0, y: 0 });
  history.push({ timestamp: 10, x: 0.2, y: 0.4 });
  const oldView = history.toArray();
  history.push({ timestamp: 20, x: 0.4, y: 0.8 });
  history.push({ timestamp: 30, x: 0.6, y: 1.2 });

  assert.equal(history.size, 3);
  assert.equal(history.capacity, 3);
  assert.equal(history.durationMs, 20);
  assert.deepEqual(history.oldest, { timestamp: 10, x: 0.2, y: 0.4 });
  assert.deepEqual(history.latest, { timestamp: 30, x: 0.6, y: 1 });
  assert.deepEqual(history.toArray().map(({ timestamp }) => timestamp), [10, 20, 30]);
  assert.deepEqual(oldView.map(({ timestamp }) => timestamp), [0, 10]);
});

test('samples interpolate in time and delayed sampling resolves the same point', () => {
  const history = new TrajectoryBuffer();
  history.push({ timestamp: 100, x: 0, y: 1 });
  history.push({ timestamp: 200, x: 1, y: 0 });

  assert.deepEqual(history.sample(150), { timestamp: 150, x: 0.5, y: 0.5 });
  assert.deepEqual(history.sampleDelayed(250, 100), { timestamp: 150, x: 0.5, y: 0.5 });
  assert.deepEqual(history.sample(10), { timestamp: 100, x: 0, y: 1 });
  assert.deepEqual(history.sample(500), { timestamp: 200, x: 1, y: 0 });
});

test('loop sampling wraps both directions and interpolates through its seam', () => {
  const history = new TrajectoryBuffer();
  history.push({ timestamp: 0, x: 0, y: 0 });
  history.push({ timestamp: 10, x: 1, y: 1 });

  assert.deepEqual(history.sample(20, { loop: true }), { timestamp: 0, x: 0, y: 0 });
  assert.deepEqual(history.sample(-5, { loop: true }), { timestamp: 15, x: 0.5, y: 0.5 });
  assert.deepEqual(history.sample(17.5, { loop: true }), { timestamp: 17.5, x: 0.25, y: 0.25 });
});

test('snapshots preserve readable history and reject mutation independently', () => {
  const live = new TrajectoryBuffer({ capacity: 4 });
  live.push({ timestamp: 0, x: 0.25, y: 0.5 });
  live.push({ timestamp: 10, x: 0.75, y: 0.5 });
  const frozen = live.snapshot();

  live.push({ timestamp: 20, x: 1, y: 1 });
  assert.equal(frozen.size, 2);
  assert.equal(frozen.sample(5).x, 0.5);
  assert.throws(() => frozen.push({ timestamp: 20, x: 0, y: 0 }), /read-only/);
  assert.throws(() => frozen.clear(), /read-only/);
});

test('empty histories, duplicate timestamps, and invalid time input have defined behavior', () => {
  const history = new TrajectoryBuffer({ capacity: 2 });
  assert.equal(history.sample(0), null);
  history.push({ timestamp: 1, x: 0.1, y: 0.2 });
  history.push({ timestamp: 1, x: 0.8, y: 0.9 });
  assert.equal(history.size, 1);
  assert.deepEqual(history.sample(1), { timestamp: 1, x: 0.8, y: 0.9 });
  assert.throws(() => history.push({ timestamp: 0, x: 0, y: 0 }), /monotonic/);
  assert.throws(() => history.push({ timestamp: 2, x: NaN, y: 0 }), /finite/);
  assert.throws(() => history.sampleDelayed(10, -1), /non-negative/);
});
