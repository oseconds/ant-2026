import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntAgent } from '../src/lib/agents/ant/AntAgent.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { countedLcg } from '../scripts/ant-material-causal-tail.js';
import { freezeWorld, makeAuthorSampler, thawWorld } from '../scripts/lib/antMotorFrozenWorld.js';

const DT = 1 / 60;

test('frozen initialized world thaws and repeats with exact state and RNG', async () => {
  const source = new AntController({ random: countedLcg(20261005) });
  await source.init();
  try {
    for (let i = 0; i < 8; i += 1) source.tick(DT);
    const bytes = freezeWorld(source);
    const frozenBytes = Buffer.from(bytes);
    const copy = thawWorld(bytes);
    try {
      assert.ok(copy.agents[0] instanceof AntAgent);
      assert.ok(copy.field instanceof PheromoneField);
      assert.equal(copy.listeners.size, 0);
      assert.equal(copy.audioBridge, null);
      for (let i = 0; i < 12; i += 1) {
        source.tick(DT); copy.tick(DT);
        assert.deepEqual(copy.getSnapshot(), source.getSnapshot());
        assert.equal(copy.random.state(), source.random.state());
        assert.equal(copy.random.calls, source.random.calls);
        assert.equal(Buffer.compare(bytes, frozenBytes), 0, 'thawing and ticking must not mutate frozen bytes');
      }
    } finally { await copy.destroy(); }
  } finally { await source.destroy(); }
});

test('author sum uses production bilinear sampling, stays non-negative, and does not mutate inputs', () => {
  const alive = new Float64Array([0, 2, 4, 6, 8, 10, 12, 14, 16]);
  const retired = new Float64Array([16, 14, 12, 10, 8, 6, 4, 2, 0]);
  const beforeAlive = alive.slice(), beforeRetired = retired.slice();
  const aliveBytes = Buffer.from(alive.buffer), retiredBytes = Buffer.from(retired.buffer);
  const full = makeAuthorSampler({ width: 3, height: 3, alive, retired }, 'fullAuthorSum');
  const current = makeAuthorSampler({ width: 3, height: 3, alive, retired }, 'noRetired');
  const originalRandom = Math.random;
  let randomCalls = 0;
  Math.random = () => { randomCalls += 1; return originalRandom(); };
  try {
    for (const [x, y] of [[0, 0], [0.5, 0.5], [1, 1], [0.2, 0.7]]) {
      assert.ok(full.sample(x, y) >= 0);
      assert.ok(current.sample(x, y) >= 0);
      assert.equal(full.sample(x, y), 16);
    }
    assert.equal(current.sample(-0.1, 0.5), 0);
    assert.equal(Object.is(current.sample(-0, 0), -0), false);
  } finally { Math.random = originalRandom; }
  assert.equal(randomCalls, 0, 'sampling must not consume Math.random');
  assert.deepEqual(alive, beforeAlive);
  assert.deepEqual(retired, beforeRetired);
  assert.deepEqual(Buffer.from(alive.buffer), aliveBytes);
  assert.deepEqual(Buffer.from(retired.buffer), retiredBytes);
  assert.throws(() => makeAuthorSampler({ width: 3, height: 3, alive, retired }, 'unknown'), /unsupported/);
  assert.throws(() => makeAuthorSampler({ width: 3, height: 3,
    alive: new Float64Array([0, 0, 0, 0, -1, 0, 0, 0, 0]) }, 'noRetired'), /non-negative/);
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const invalidAlive = new Float64Array(9); invalidAlive[4] = invalid;
    assert.throws(() => makeAuthorSampler({ width: 3, height: 3, alive: invalidAlive }, 'noRetired'), /finite/);
    const invalidRetired = new Float64Array(9); invalidRetired[4] = invalid;
    assert.throws(() => makeAuthorSampler({ width: 3, height: 3, alive, retired: invalidRetired }, 'fullAuthorSum'), /finite/);
  }
});
