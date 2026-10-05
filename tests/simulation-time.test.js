import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSimulationTime } from '../src/lib/utils/simulationTime.js';

test('simulation elapsed time is formatted as mm:ss and hh:mm:ss after an hour', () => {
  assert.equal(formatSimulationTime(0), '00:00');
  assert.equal(formatSimulationTime(61_999), '01:01');
  assert.equal(formatSimulationTime(3_599_999), '59:59');
  assert.equal(formatSimulationTime(3_600_000), '01:00:00');
  assert.equal(formatSimulationTime(3_661_000), '01:01:01');
});

test('invalid and negative simulation times format safely as zero', () => {
  assert.equal(formatSimulationTime(-1), '00:00');
  assert.equal(formatSimulationTime(Number.NaN), '00:00');
  assert.equal(formatSimulationTime(Infinity), '00:00');
});
