import test from 'node:test';
import assert from 'node:assert/strict';
import { observationTick, runSyntheticFixtures } from '../scripts/ant-w1-repeat-birth-contact-locality-audit.js';

test('repeat-birth locality controls catch identical masks and prior-only counterexamples', () => {
  const result = runSyntheticFixtures();
  assert.equal(result.identicalMaskControl.priorCount, result.identicalMaskControl.newCount);
  assert.equal(result.oldOnlyContactCounterexample.priorMaskCount, 30);
  assert.equal(result.oldOnlyContactCounterexample.newMaskCount, 0);
  assert.equal(result.gridBoundaryNoWrap, true);
});

test('archive event milliseconds map to the first saved trajectory frame at or after the event', () => {
  const frames = [{ timeSeconds: 0 }, { timeSeconds: 1 }, { timeSeconds: 2 }];
  assert.equal(observationTick(frames, 1000), 1);
  assert.equal(observationTick(frames, 1000.1), 2);
  assert.throws(() => observationTick(frames, 2001), /saved trajectory observation/);
});
