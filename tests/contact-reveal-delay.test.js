import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_REVEAL_DELAY_CANDIDATES, selectContactRevealDelay, selectContactRevealEvents } from '../scripts/lib/contactRevealDelay.js';

const row = (seconds, ticks, away, total = 100) => ({ seconds, ticks, eligibleCount: total,
  availableCount: total, atLeast12PxCount: away });

test('selects the shortest registered delay meeting the 75 percent gate', () => {
  assert.equal(selectContactRevealDelay([
    row(0.5, 30, 74), row(1, 60, 75), row(2, 120, 90), row(3, 180, 95)
  ]).seconds, 1);
});

test('unavailable ants stay in the denominator and no qualifying candidate returns null', () => {
  const measurements = [row(0.5, 30, 74), row(1, 60, 70), row(2, 120, 60), row(3, 180, 50)];
  measurements[0].availableCount = 90;
  assert.equal(selectContactRevealDelay(measurements), null);
  assert.equal(CONTACT_REVEAL_DELAY_CANDIDATES.length, 4);
});

test('common event subset excludes events whose delayed reveal misses the endpoint', () => {
  const events = [{ id: 'a', tick: 6240 }, { id: 'b', tick: 6270 }, { id: 'c', tick: 6300 }];
  assert.deepEqual(selectContactRevealEvents(events, 6301, 30), events.slice(0, 2));
});
