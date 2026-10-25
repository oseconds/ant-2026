import test from 'node:test';
import assert from 'node:assert/strict';
import { eventSchedule } from '../scripts/ant-g-hardness-pulse-shadow.js';

test('hardness shadow schedules by actual monotonic post time while retaining source event order', () => {
  const first = { type: 'strike', payload: { plateId: 'p1', hardness: 0.2 } };
  const second = { type: 'strike', payload: { plateId: 'p1', hardness: 0.8 } };
  const capture = { messages: [
    { sequence: 0, simulationTimeMs: 0, postSimulationTimeMs: 0,
      message: { type: 'topology', payload: { version: 1 } } },
    { sequence: 1, simulationTimeMs: 33, postSimulationTimeMs: 1000 / 60, message: first },
    { sequence: 2, simulationTimeMs: 16, postSimulationTimeMs: 2000 / 60, message: second }
  ] };
  const schedule = eventSchedule(capture, 1, 6000);
  assert.deepEqual(schedule.events.map(row => row.frame), [100, 200]);
  assert.deepEqual(schedule.events.map(row => row.sequence), [1, 2]);
  assert.deepEqual(schedule.events.map(row => row.message), [first, second]);
  assert.equal(schedule.expectedCount, 2);
  assert.equal(schedule.sourceEventTimeBacksteps, 1);
  assert.equal(schedule.maxSourceEventTimeBackstepMs, 17);
});

test('hardness shadow rejects nonmonotonic actual port-post timestamps', () => {
  const capture = { messages: [
    { sequence: 0, simulationTimeMs: 0, postSimulationTimeMs: 0,
      message: { type: 'topology', payload: { version: 1 } } },
    { sequence: 1, simulationTimeMs: 20, postSimulationTimeMs: 20,
      message: { type: 'strike', payload: {} } },
    { sequence: 2, simulationTimeMs: 30, postSimulationTimeMs: 10,
      message: { type: 'strike', payload: {} } }
  ] };
  assert.throws(() => eventSchedule(capture, 1, 6000), /nondecreasing in captured message order/);
});
