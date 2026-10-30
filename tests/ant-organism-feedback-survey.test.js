import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, selfTest } from '../scripts/ant-organism-feedback-survey.js';

test('survey aggregates material opportunity separately from global call counts', () => {
  const b = {};
  aggregate(b, { layers: 0, binding: true, delta: 2, finiteOnly: Infinity });
  aggregate(b, { layers: 4, binding: false, delta: 3 });
  assert.equal(b.calls, 2); assert.equal(b.materialCalls, 1);
  assert.deepEqual(b.flags.binding, { true: 1, materialTrue: 0 });
  assert.equal(b.numeric.delta.sum, 5); assert.equal(b.numeric.delta.materialSum, 3);
  assert.equal(b.numeric.finiteOnly, undefined);
});

test('all-disabled survey keeps native pre-init world and RNG unchanged', async () => {
  const receipt = await selfTest();
  assert(receipt.neutralNoRng && receipt.preinit && receipt.positiveCountdownNativeExact);
});
