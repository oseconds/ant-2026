import test from 'node:test';
import assert from 'node:assert/strict';
import { eventWindow, gridIndex, lastBirthMap, rasterizeSegment, summarizeFeet } from '../scripts/ant-local-opportunity-capture.js';

test('rolling window uses (t-w,t] endpoints', () => {
  const events = [{ timeMs: 0 }, { timeMs: 1 }, { timeMs: 2 }, { timeMs: 3 }];
  assert.deepEqual(eventWindow(events, 3, 2), events.slice(2));
});

test('foot capture rejects malformed and out-of-domain positions and counts distinct ants/groups', () => {
  const events = [
    { timeMs: 900, antId: 7, group: 'A', contacts: [{ x: 0.5, y: 0.5 }, { x: -0.1, y: 0.5 }, { x: NaN, y: 0.5 }] },
    { timeMs: 950, antId: 7, group: 'B', contacts: [{ x: 0.5, y: 0.5 }] },
    { timeMs: 1000, antId: 9, group: 'A', contacts: [{ x: 0.5, y: 0.5 }, { x: 1.01, y: 0.5 }] }
  ];
  const latest = new Float64Array(96 * 96).fill(-1), cell = gridIndex(0.5, 0.5);
  latest[cell] = 1000;
  const result = summarizeFeet(events, latest, 1000, 1);
  const unpack = item => {
    const buffer = Buffer.from(item.data, 'base64');
    return new ({ Uint32Array, Uint16Array, Float32Array, Float64Array }[item.type])(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  };
  assert.equal(unpack(result.count)[cell], 3);
  assert.equal(unpack(result.groups)[cell], 3);
  assert.equal(unpack(result.ants)[cell], 2);
  assert.equal(unpack(result.ageSeconds)[cell], 0);
  assert.equal(gridIndex(-0.01, 0.5), -1);
});

test('segment rasterization clips exits and conserves clipped travel and time', () => {
  const from = { x: 0.9, y: 0.5 }, to = { x: 1.1, y: 0.5 };
  const cells = rasterizeSegment(from, to, 0.25);
  assert.ok(cells.length > 0);
  assert.ok(Math.abs(cells.reduce((sum, row) => sum + row.travel, 0) - 0.1) < 1e-12);
  assert.ok(Math.abs(cells.reduce((sum, row) => sum + row.occupancySeconds, 0) - 0.125) < 1e-12);
  assert.ok(cells.every(row => row.cell >= 0 && row.cell < 96 * 96));
});

test('stationary segment contributes full occupancy with zero travel', () => {
  const rows = rasterizeSegment({ x: 0.2, y: 0.3 }, { x: 0.2, y: 0.3 }, 1 / 60);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].travel, 0);
  assert.equal(rows[0].occupancySeconds, 1 / 60);
});

test('last-birth map excludes plates born at the current boundary', () => {
  const cell = gridIndex(0.5, 0.5), oldMask = new Uint8Array(96 * 96), currentMask = new Uint8Array(96 * 96);
  oldMask[cell] = 1; currentMask[cell] = 1;
  const plates = [
    { id: 'old', bornAtSimulationTimeMs: 800, mask: oldMask },
    { id: 'current', bornAtSimulationTimeMs: 1000, mask: currentMask }
  ];
  const last = lastBirthMap(plates, [plates[1]]);
  assert.equal(last[cell], 800);
  assert.equal(last[cell + 1], -1);
});
