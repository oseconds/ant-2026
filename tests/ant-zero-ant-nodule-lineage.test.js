import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyNoduleLineage, clearCandidatePersistence } from '../scripts/ant-zero-ant-nodule-lineage.js';

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
