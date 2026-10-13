import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceAntClock } from '../src/demo/antClock.js';

test('ANT UI clock scales elapsed frames and preserves the existing 1x timestamps', () => {
  for (const [speed, expected] of [[0.5, 50], [1, 100], [2, 200]]) {
    const clock = { wallTimeMs: null, simulationTimeMs: null };
    advanceAntClock(clock, 1000, speed, false);
    const timestamps = advanceAntClock(clock, 1100, speed, false);
    const timestamp = timestamps.at(-1);
    assert.equal(timestamp, 1000 + expected);
    if (speed === 1) assert.equal(timestamp, 1100, '1x keeps the browser frame timestamp');
  }
});

test('pause advances only the wall baseline and resume has no catch-up burst', () => {
  const clock = { wallTimeMs: null, simulationTimeMs: null };
  advanceAntClock(clock, 1000, 1, false);
  assert.deepEqual(advanceAntClock(clock, 1100, 1, false), [1100]);
  assert.deepEqual(advanceAntClock(clock, 2100, 1, true), []);
  assert.equal(clock.simulationTimeMs, 1100);
  assert.deepEqual(advanceAntClock(clock, 2120, 1, false), [1120]);
});

test('faster UI rates split long frames at the controller frame-gap limit', () => {
  const clock = { wallTimeMs: null, simulationTimeMs: null };
  advanceAntClock(clock, 1000, 4, false);
  assert.deepEqual(advanceAntClock(clock, 1050, 4, false), [1100, 1200]);
});

test('faster UI rates bound background frame catch-up to the controller frame-gap limit', () => {
  const clock = { wallTimeMs: null, simulationTimeMs: null };
  advanceAntClock(clock, 1000, 4, false);
  assert.deepEqual(advanceAntClock(clock, 11000, 4, false), [1100, 1200, 1300, 1400]);
});
