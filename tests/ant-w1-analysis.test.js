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

test('W1 preserves full episode geometry across character gaps and keeps attribution causal', () => {
  const frames = Array.from({ length: 60 }, (_, timeSeconds) => ({ timeSeconds, tick: timeSeconds * 60 }));
  const flags = new Uint8Array(frames.length * 9216);
  for (let i = 1; i <= 5; i++) flags[i * 9216 + 4500] = 7;
  const input = { fieldMetadata: { frames }, metadata: { seed: 1, fieldIntervals: frames.length }, flags, feet: [], coverage: {} };
  const baseline = { seed: 1, milestones: [], history: frames.map(f => ({ ...f, production: { occupiedCells: 0 }, shadow: { occupiedCells: 0 } })) };
  const result = analyzeSeed(input, baseline);
  assert.equal(result.status, 'complete-with-character-gaps');
  assert.equal(result.dataGap.code, 'NO_VALID_DIRECTIONAL_TRAVEL');
  assert.equal(result.characterStatus.status, 'directional-coverage-incomplete');
  assert.equal(result.dataGaps.length, 1);
  const unresolved = result.episodes.find(e => e.id === result.dataGap.episodeId);
  assert.ok(unresolved);
  assert.deepEqual(unresolved.cellIndices, [4500]);
  assert.equal(unresolved.characterStatus, 'direction-unavailable');
  assert.equal(unresolved.characterGap.code, 'NO_VALID_DIRECTIONAL_TRAVEL');
  assert.equal(unresolved.character.directionalOrder, null);
  assert.ok(Number.isFinite(unresolved.character.consolidation));
  assert.equal(result.character.axes.consolidation.count, 1);
  assert.equal(result.character.axes.directionalOrder.count, 0);
  assert.equal(result.character.axes.directionalOrder.missingCount, 1);
  assert.equal(result.character.correlations['directionalOrder:occupiedCells'].count, 0);
  assert.equal(result.final.timeSeconds, 59);
  assert.equal(result.final.lateRangeSeconds, null);

  const gapFrame = frames.findIndex(f => f.timeSeconds >= result.dataGap.timeSeconds);
  const changedFuture = { ...input, flags: Uint8Array.from(flags) };
  changedFuture.flags.fill(7, (gapFrame + 1) * 9216);
  const replay = analyzeSeed(changedFuture, baseline);
  const replayEpisode = replay.episodes.find(e => e.id === unresolved.id);
  assert.equal(replayEpisode.character.consolidation, unresolved.character.consolidation);
  assert.equal(replayEpisode.character.directionalOrder, null);
  assert.deepEqual(replayEpisode.cellIndices, unresolved.cellIndices);

  const attributed = { ...input, feet: [{ timeSeconds: 0.5, antId: 'A', cellIndex: 4500,
    directionAvailable: true, nematicX: 1, nematicY: 0, segmentStartSeconds: 0.5 - 1 / 60,
    segmentEndSeconds: 0.5, travelDistance: 1 }] };
  const resolved = analyzeSeed(attributed, baseline);
  const resolvedEpisode = resolved.episodes.find(e => e.id === unresolved.id);
  assert.deepEqual(resolvedEpisode.cellIndices, unresolved.cellIndices);
  assert.equal(resolvedEpisode.character.consolidation, unresolved.character.consolidation);
  assert.ok(Number.isFinite(resolvedEpisode.character.directionalOrder));
  assert.equal(resolved.character.axes.directionalOrder.count, resolved.episodes.length);
});
