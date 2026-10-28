import test from 'node:test';
import assert from 'node:assert/strict';
import { residualFreeRead, selectEarliestChangedChoice } from '../scripts/ant-retired-pheromone-recursive-inscription.js';

test('earliest changed-choice selection uses numeric ant ID only for timestamp ties', () => {
  const selected = selectEarliestChangedChoice([
    { timestamp: 2, antId: 'ant-9', fullOption: 1, noRetiredOption: 0 },
    { timestamp: 1, antId: 'ant-10', fullOption: 2, noRetiredOption: 1 },
    { timestamp: 1, antId: 'ant-2', fullOption: 3, noRetiredOption: 4 },
    { timestamp: 0, antId: 'ant-1', fullOption: 2, noRetiredOption: 2 }
  ]);
  assert.equal(selected.antId, 'ant-2');
  assert.equal(selected.timestamp, 1);
});

test('residual-free pair excludes residual without clamping or reassigning it', () => {
  const pair = residualFreeRead({ self: 0.01, aliveOther: 0.02, retired: 0.03, residual: -0.000001 });
  assert.equal(pair.fullAuthorSum, 0.06);
  assert.equal(pair.noRetired, pair.fullAuthorSum - 0.03);
  assert.ok(pair.noRetired >= 0);
});
