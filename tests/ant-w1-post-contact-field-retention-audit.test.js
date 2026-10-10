import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';
import { TRAIL_PLATE_CHEMICAL_THRESHOLD } from '../src/lib/agents/ant/TrailPlateBirth.js';
import { gridIndex } from '../scripts/ant-w1-raw-field-contact-audit.js';
import { causalContactAge, contactAgeBand, contactExposure, fillConditionalSupport, fixedMagnitudeBin,
  groupContactsByTick, surfaceFootprintCellIndices } from '../scripts/ant-w1-post-contact-field-retention-audit.js';

test('contact-age bands have exact non-overlapping boundary semantics and remain causal', () => {
  assert.equal(contactAgeBand(null), 'never');
  assert.equal(contactAgeBand(0), '0-20');
  assert.equal(contactAgeBand(20), '0-20');
  assert.equal(contactAgeBand(20.000001), '20-90');
  assert.equal(contactAgeBand(90), '20-90');
  assert.equal(contactAgeBand(90.000001), '>90');
  assert.equal(causalContactAge(30, 10), 20);
  assert.equal(causalContactAge(30, null), null);
  assert.throws(() => causalContactAge(10, 11), /no future contact/);
});

test('archived contact tick boundaries and final cutoff are inclusive without future leakage', () => {
  const tick1End = 1000 / 60;
  const contacts = [
    { id: 'start', simulationTimeMs: 0 },
    { id: 'tick1-end', simulationTimeMs: tick1End },
    { id: 'tick2-start', simulationTimeMs: tick1End + 1e-6 },
    { id: 'cutoff', simulationTimeMs: 50 },
    { id: 'future', simulationTimeMs: 50.0001 }
  ];
  const result = groupContactsByTick(contacts, 3, 0.05);
  assert.deepEqual(result.buckets[1].map(event => event.id), ['start', 'tick1-end']);
  assert.deepEqual(result.buckets[2].map(event => event.id), ['tick2-start']);
  assert.deepEqual(result.buckets[3].map(event => event.id), ['cutoff']);
  assert.equal(result.throughCutoff, 4);
  assert.equal(result.afterCutoff, 1);
});

test('same-cell mapping rounds exact grid half-cell boundaries and clamps to valid arena cells', () => {
  assert.equal(gridIndex({ x: 0, y: 0 }), 0);
  assert.equal(gridIndex({ x: (7.5 - 1e-6) / 95, y: 10 / 95 }), 10 * 96 + 7);
  assert.equal(gridIndex({ x: 7.5 / 95, y: 10 / 95 }), 10 * 96 + 8);
  assert.equal(gridIndex({ x: 1, y: 1 }), 96 * 96 - 1);
});

test('SurfaceField footprint cell accounting matches the actual deposit kernel at interior and arena edges', () => {
  for (const position of [{ x: 0.5, y: 0.5 }, { x: 0, y: 0 }, { x: 1, y: 0.5 }]) {
    const field = new SurfaceField();
    field.applyFootContact({ type: 'FOOT_CONTACT', contacts: [{ legId: 'FL', position }] });
    const actual = [...field.values].flatMap((value, index) => value > 0 ? [index] : []);
    assert.deepEqual(surfaceFootprintCellIndices(position), actual);
  }
});

test('same-cell and neighbor-only exposure use the archived SurfaceField footprint', () => {
  assert.equal(contactExposure(1, 1), 'same-cell');
  assert.equal(contactExposure(0, 1), 'neighbor-footprint-only');
  assert.equal(contactExposure(0, 0), 'no-surface-footprint');
});

test('support reconstruction samples only chemical-qualified cells and preserves conditional zeros', () => {
  const field = new SurfaceField();
  field.values[48 * 96 + 48] = 0.5;
  const chemical = new Float32Array(96 * 96);
  const target = 48 * 96 + 48;
  chemical[target] = TRAIL_PLATE_CHEMICAL_THRESHOLD;
  chemical[target + 1] = TRAIL_PLATE_CHEMICAL_THRESHOLD - 1e-6;
  const support = fillConditionalSupport(field, chemical, new Float32Array(96 * 96));
  assert.ok(support[target] > 0);
  assert.equal(support[target + 1], 0);
});

test('magnitude bins use one fixed field scale across checkpoint comparisons', () => {
  assert.equal(fixedMagnitudeBin(0, 'surface'), 0);
  assert.equal(fixedMagnitudeBin(0.9761037, 'surface'), 7);
});
