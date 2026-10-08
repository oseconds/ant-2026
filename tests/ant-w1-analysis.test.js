import test from 'node:test';
import assert from 'node:assert/strict';
import { maskOf, overlapMasks, analyzeSeed } from '../scripts/ant-w1-analysis.js';

test('W1 novelty and mismatch count exact binary intersections', () => {
  const left = maskOf([0, 1, 1, 3], 5), right = maskOf([1, 2], 5);
  assert.deepEqual(overlapMasks(left, right), {
    leftCells: 3, rightCells: 2, intersectionCells: 1, unionCells: 4,
    jaccard: 0.25, mismatch: 0.75, leftOutsideRightFraction: 2 / 3, rightOutsideLeftFraction: 0.5
  });
  assert.equal(overlapMasks(maskOf([], 5), maskOf([], 5)).mismatch, null);
});

test('W1 geometry helpers reject invalid indices and nonbinary masks', () => {
  for (const value of [-1, 5, 1.5, NaN]) assert.throws(() => maskOf([value], 5));
  assert.throws(() => overlapMasks([0, 2], [1, 0]));
  assert.throws(() => overlapMasks([0], [1, 0]));
});

test('W1 stops at first uncharacterizable closure and excludes future predicate changes', () => {
  const frames = Array.from({ length: 60 }, (_, timeSeconds) => ({ timeSeconds, tick: timeSeconds * 60 }));
  const flags = new Uint8Array(frames.length * 9216);
  for (let i = 1; i <= 5; i++) flags[i * 9216 + 4500] = 7;
  const input = { fieldMetadata: { frames }, metadata: { seed: 1, fieldIntervals: frames.length }, flags, feet: [], coverage: {} };
  const baseline = { seed: 1, milestones: [], history: frames.map(f => ({ ...f, production: { occupiedCells: 0 }, shadow: { occupiedCells: 0 } })) };
  const result = analyzeSeed(input, baseline);
  assert.equal(result.status, 'stopped-data-gap');
  assert.equal(result.dataGap.code, 'NO_VALID_DIRECTIONAL_TRAVEL');
  assert.equal(result.episodes.length, 0);
  assert.equal(result.dataGap.episode.status, 'closed-character-unresolved');
  assert.deepEqual(result.dataGap.episode.cellIndices, [4500]);
  assert.ok(result.final.timeSeconds < 59);
  assert.equal(result.final.lateNewFrozenCellsPerSecond, null);
  flags.fill(7, (result.final.timeSeconds + 1) * 9216);
  assert.deepEqual(analyzeSeed(input, baseline), result);
});
