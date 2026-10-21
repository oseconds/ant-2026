import test from 'node:test';
import assert from 'node:assert/strict';
import { compareStrikeGates, filterStrikeEvents } from '../scripts/ant-exhibition-excitation.js';

const strike = (frame, layerId, x = .5, y = .5, strength = .04) => ({ frame,
  message: { type: 'strike', payload: { layerId, position: { x, y }, strength, footprintRadius: .012 } } });

test('plate and local-cell candidates use 75 ms at 48 kHz and preserve independent routes', () => {
  const a = strike(0, 'a');
  const b = strike(3599, 'a');
  const c = strike(3600, 'a');
  const adjacent = strike(3601, 'a', .5 + 1 / 31);
  const otherPlate = strike(3602, 'b');
  const topology = { frame: 3603, message: { type: 'topology', payload: { layerId: 'a' } } };
  const source = [a, b, c, adjacent, otherPlate, topology];
  const result = compareStrikeGates(source);

  assert.deepEqual(result.plate.events, [a, c, otherPlate, topology]);
  assert.deepEqual(result.cell.events, [a, c, adjacent, otherPlate, topology]);
  assert.equal(result.plate.report.deliveredStrikes, 3);
  assert.equal(result.cell.report.deliveredStrikes, 4);
  assert.deepEqual(result.plate.events[0].message, a.message);
  assert.equal(a.message.payload.strength, .04);
  assert.equal(source.length, 6);
  assert.equal(result.cell.report.byPlateOrCell.filter((row) => row.layerId === 'a')
    .reduce((sum, row) => sum + row.delivered, 0), 3);
});

test('exact boundary is inclusive, and malformed strikes pass through unchanged', () => {
  const first = strike(100, 'p');
  const boundary = strike(3700, 'p');
  const malformed = { frame: 4000, message: { type: 'strike', payload: { layerId: 'p', position: { x: 2, y: .5 }, strength: .9 } } };
  const result = filterStrikeEvents([first, boundary, malformed]);
  assert.deepEqual(result.events, [first, boundary, malformed]);
  assert.equal(result.report.inputStrikes, 2);
  assert.equal(result.report.deliveryRate, 1);
  assert.deepEqual(result.report.observedStrengthSpan, { min: .04, max: .04 });
  assert.throws(() => filterStrikeEvents([boundary, first]), /nonnegative, nondecreasing/);
  assert.throws(() => filterStrikeEvents([{ ...first, frame: -1 }]), /nonnegative, nondecreasing/);
});
