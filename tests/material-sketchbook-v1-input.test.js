import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityInput } from '../src/sketchbook-v1/input.js';

test('activity is deterministic, bounded and stops at the declared global tick', () => {
  for (const pattern of ['wander', 'stationary', 'none']) {
    const a = new ActivityInput(20261005, pattern), b = new ActivityInput(20261005, pattern);
    for (let tick = 0; tick < 3000; tick++) {
      assert.deepEqual(a.next(tick), b.next(tick));
      assert.ok(a.last.every(value => value >= 0 && value <= 2));
      if (tick >= 2400) assert.ok(a.last.every(value => value === 0));
    }
    assert.deepEqual(a.snapshot(), b.snapshot());
    const total = a.dose.reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(total - (pattern === 'none' ? 0 : 80)) < 1e-10);
  }
});

test('invalid inputs and out-of-order steps reject without advancing state', () => {
  assert.throws(() => new ActivityInput(1, 'unknown'), RangeError);
  assert.throws(() => new ActivityInput(1, 'wander', 0), RangeError);
  const input = new ActivityInput(1), before = input.snapshot();
  assert.throws(() => input.next(5), RangeError);
  assert.deepEqual(input.snapshot(), before);
});
