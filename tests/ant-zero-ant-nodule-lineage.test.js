import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyNoduleLineage, classifyTargetHistory, clearCandidatePersistence,
  coverageCellsFromMask, reclassifyTargetCells } from '../scripts/ant-zero-ant-nodule-lineage.js';

test('candidate persistence clear mutates only the existing timer array', () => {
  const timers = Float64Array.from([-1, 120000, 399000, -1]);
  const material = { candidateSinceMs: timers, plates: ['kept'], nodules: ['kept'], revision: 7 };
  const result = clearCandidatePersistence(material);

  assert.equal(result.clearedCount, 2);
  assert.equal(result.length, 4);
  assert.equal(material.candidateSinceMs, timers);
  assert.deepEqual([...timers], [-1, -1, -1, -1]);
  assert.deepEqual({ plates: material.plates, nodules: material.nodules, revision: material.revision },
    { plates: ['kept'], nodules: ['kept'], revision: 7 });
});

test('Nodule timer lineage classification preserves pre-gap, reset/stack, post-gap and ambiguous cases', () => {
  assert.equal(classifyNoduleLineage({ entryTimerMs: 390000, birthTimerMs: 390000 }),
    'PRE-GAP TIMER LINEAGE');
  assert.equal(classifyNoduleLineage({ entryTimerMs: 390000, birthTimerMs: 400000,
    plateChangeBeforeTimerStart: true }), 'RESET/STACK-CHANGED LINEAGE');
  assert.equal(classifyNoduleLineage({ entryTimerMs: -1, birthTimerMs: 400000 }),
    'POST-GAP TIMER LINEAGE');
  assert.equal(classifyNoduleLineage({ entryTimerMs: -1, birthTimerMs: -1 }), 'AMBIGUOUS');
  assert.equal(classifyNoduleLineage({ entryTimerMs: -1, birthTimerMs: 399000 }), 'AMBIGUOUS');
});

test('Plate mask coverage indices reconstruct the complete binary mask', () => {
  const mask = [0, 1, 0, 1, 1, 0];
  const coverageCells = coverageCellsFromMask(mask);
  const reconstructed = Array.from({ length: mask.length }, (_, cell) => Number(coverageCells.includes(cell)));
  assert.deepEqual(coverageCells, [1, 3, 4]);
  assert.deepEqual(reconstructed, mask);
  assert.throws(() => coverageCellsFromMask([0, 2]), /zero and one/);
});

test('target history distinguishes timer start, Plate reset, qualification loss, proximity, max count and birth', () => {
  const start = { type: 'TIMER_STARTED', timeMs: 1000, candidateSinceMs: 1000 };
  const final = { timeMs: 12000, qualified: true, candidateSinceMs: 1000,
    timerAgeMs: 11000, maxNodulesReached: false };
  assert.equal(classifyTargetHistory([start], final), 'RIGHT-CENSORED');
  assert.equal(classifyTargetHistory([start, { type: 'TIMER_RESET_BY_PLATE', timeMs: 5000,
    timerBeforeMs: 1000 }, { type: 'TIMER_STARTED', timeMs: 6000, candidateSinceMs: 6000 }],
  { ...final, candidateSinceMs: 6000, persistenceAgeMs: 6000 }), 'PLATE-RESET CENSORED');
  assert.equal(classifyTargetHistory([start, { type: 'TIMER_CLEARED_QUALIFICATION_LOST', timeMs: 8000,
    failedGates: ['COMPACTION'] }], { ...final, candidateSinceMs: -1, persistenceAgeMs: null,
    qualified: false }), 'QUALIFICATION LOST - COMPACTION');
  assert.equal(classifyTargetHistory([start, { type: 'TIMER_MATURED', timeMs: 31000 },
    { type: 'BLOCKED_BY_NEARBY_NODULE', timeMs: 31000, blockingNoduleId: 'n-1',
      timerResetConfirmed: true }], { ...final, candidateSinceMs: -1, persistenceAgeMs: null }),
  'NEARBY-NODULE BLOCKED');
  assert.equal(classifyTargetHistory([start, { type: 'TIMER_MATURED', timeMs: 31000 },
    { type: 'BLOCKED_BY_NEARBY_NODULE', timeMs: 31000, blockingNoduleId: 'n-1',
      timerResetConfirmed: true }, { type: 'TIMER_STARTED', timeMs: 32000, candidateSinceMs: 32000 }],
  { ...final, candidateSinceMs: 32000, persistenceAgeMs: 5000 }), 'RIGHT-CENSORED');
  assert.equal(classifyTargetHistory([{ type: 'BLOCKED_BY_MAX_COUNT', timeMs: 9000 }],
    { ...final, candidateSinceMs: -1, persistenceAgeMs: null, maxNodulesReached: true }), 'MAX-COUNT BLOCKED');
  assert.equal(classifyTargetHistory([{ type: 'NODULE_BIRTH', timeMs: 31000 }], final), 'NODULE BIRTH');
  assert.equal(classifyTargetHistory([], { ...final, candidateSinceMs: -1, persistenceAgeMs: null }),
    'DATA INSUFFICIENT');
});

test('saved evaluation rows reclassify using the recorded timer age without changing event history', () => {
  const finalEvent = { type: 'GAP_END_CENSORED', timeMs: 459900, qualified: true,
    candidateSinceMs: 430900, timerAgeMs: 29000, maxNodulesReachedAfter: false };
  const target = { cell: 8, events: [{ type: 'TIMER_STARTED', timeMs: 430900, candidateSinceMs: 430900 }, finalEvent],
    evaluations: [finalEvent], gapClockEndState: { candidateSinceMs: 430900, qualified: true },
    nominalAtLeast30Seconds: true, classification: 'DATA INSUFFICIENT' };
  const eventsBefore = structuredClone(target.events);
  const arm = { targetCells: [target] };

  reclassifyTargetCells(arm);

  assert.equal(target.classification, 'RIGHT-CENSORED');
  assert.deepEqual(target.events, eventsBefore);
  assert.equal(arm.targetClassificationCounts['RIGHT-CENSORED'], 1);
  assert.equal(arm.targetSummary.activeTimerAt460Seconds, 1);
});
