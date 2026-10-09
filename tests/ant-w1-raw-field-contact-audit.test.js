import test from 'node:test';
import assert from 'node:assert/strict';
import { archivedFootPoints, createContactHistoryState, gridIndex, inObservationInterval, recordFootContact, reconstructFlags } from '../scripts/ant-w1-raw-field-contact-audit.js';

test('raw field thresholds and two distinct contact timestamps reconstruct q flags exactly', () => {
  const chemicalMemory = new Float32Array(96 * 96), support = new Float32Array(96 * 96);
  const distinct = new Uint32Array(96 * 96), index = 1234;
  chemicalMemory[index] = 0.30; support[index] = Math.fround(0.015); distinct[index] = 2;
  assert.equal(reconstructFlags({ chemicalMemory, support, distinctContactTimestamps: distinct })[index], 5);
  support[index] = 0.015625;
  assert.equal(reconstructFlags({ chemicalMemory, support, distinctContactTimestamps: distinct })[index], 7);
  distinct[index] = 1;
  assert.equal(reconstructFlags({ chemicalMemory, support, distinctContactTimestamps: distinct })[index], 3);
  support[index] = 0.014999;
  assert.equal(reconstructFlags({ chemicalMemory, support, distinctContactTimestamps: distinct })[index], 1);
});

test('contact point counts and distinct timestamp qualification remain separate', () => {
  const state = createContactHistoryState(), cellIndex = 17;
  assert.equal(recordFootContact(state, { cellIndex, timestampMs: 1250 }), true);
  assert.equal(recordFootContact(state, { cellIndex, timestampMs: 1250 }), false);
  assert.equal(state.individualCounts[cellIndex], 2);
  assert.equal(state.distinctTimestamps[cellIndex], 1);
  assert.equal(recordFootContact(state, { cellIndex, timestampMs: 2250 }), true);
  assert.equal(state.individualCounts[cellIndex], 3);
  assert.equal(state.distinctTimestamps[cellIndex], 2);
});

test('observation interval includes current boundary and excludes previous and future samples', () => {
  assert.equal(inObservationInterval(10, 10, 11), false);
  assert.equal(inObservationInterval(11, 10, 11), true);
  assert.equal(inObservationInterval(11.0001, 10, 11), false);
  assert.equal(inObservationInterval(0, null, 0.016666666666666666), true);
});

test('contact positions use the archived 96 by 96 row-major rounding', () => {
  assert.equal(gridIndex({ x: 0, y: 0 }), 0);
  assert.equal(gridIndex({ x: 1, y: 1 }), 96 * 96 - 1);
  assert.equal(gridIndex({ x: 0.5, y: 0.5 }), 48 * 96 + 48);
  assert.throws(() => gridIndex({ x: 1.01, y: 0.5 }));
});

test('archived FOOT_CONTACT points retain exact simulationTimeMs and same-cell positions', () => {
  const feet = archivedFootPoints([
    { type: 'FOOT_CONTACT', simulationTimeMs: 2250, contacts: [{ position: { x: 0.5, y: 0.5 } }] },
    { type: 'FOOT_CONTACT', simulationTimeMs: 1250, contacts: [{ position: { x: 0.5, y: 0.5 } }] }
  ]);
  assert.deepEqual(feet.map(row => [row.cellIndex, row.timestampMs, row.timeSeconds]), [
    [48 * 96 + 48, 1250, 1.25], [48 * 96 + 48, 2250, 2.25]
  ]);
});
