import test from 'node:test';
import assert from 'node:assert/strict';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { CicPheromoneField } from '../scripts/ant-cic-writer.js';
import { geometryAudit, PITCH, RADIUS, SIZE } from '../scripts/ant-cic-316-grid-qualification.js';

test('316 is the derived four-corner CIC write-support grid and dense fractional points stay inside R', () => {
  assert.equal(Math.ceil(1 + Math.SQRT2 / RADIUS), 316);
  assert.equal(SIZE, 316);
  assert.equal(PITCH, 1 / 315);
  const audit = geometryAudit(129);
  assert.equal(audit.check, 'PASS');
  assert(audit.construction.maximumPositiveNodeDistance <= RADIUS);
  assert.equal(audit.construction.cornerNearAllFourSupportChecked, true);
  assert.equal(audit.construction.bilinearReadSupport.exceedsWriterRadius, true);
});

test('316 CIC keeps uncapped dose and nodal first moment while using at most four nonnegative writes', () => {
  const field = new CicPheromoneField({ width: SIZE, height: SIZE });
  const point = { x: 10.25 / 315, y: 20.75 / 315 };
  assert.equal(field.depositPoint(point, { amount: 1, radius: RADIUS }), 1);
  const active = [...field.values.entries()].filter(([, value]) => value !== 0);
  assert.equal(active.length, 4);
  assert(active.every(([, value]) => value > 0 && Number.isFinite(value)));
  const mass = active.reduce((sum, [, value]) => sum + value, 0);
  const xMoment = active.reduce((sum, [index, value]) => sum + value * ((index % SIZE) / 315), 0);
  const yMoment = active.reduce((sum, [index, value]) => sum + value * (Math.floor(index / SIZE) / 315), 0);
  assert.equal(mass, 1);
  assert(Math.abs(xMoment / mass - point.x) < 1e-15);
  assert(Math.abs(yMoment / mass - point.y) < 1e-15);
  assert(active.every(([index]) => {
    const x = (index % SIZE) / 315, y = Math.floor(index / SIZE) / 315;
    return Math.hypot(x - point.x, y - point.y) <= RADIUS;
  }));
});

test('cap loss is not redistributed, bilinear reads and decay stay inherited, and writes consume no RNG', () => {
  const field = new CicPheromoneField({ width: SIZE, height: SIZE });
  const x = 118.5 / 315, y = x;
  field.values[(118 * SIZE) + 118] = 7.99;
  const before = field.getSnapshot().totalMass;
  const originalRandom = Math.random;
  try {
    Math.random = () => { throw new Error('CIC deposit consumed RNG'); };
    assert.equal(field.depositPoint({ x, y }, { amount: 1, radius: RADIUS }), 1);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(field.values[(118 * SIZE) + 118], 8);
  assert.equal(field.values[(118 * SIZE) + 119], 0.25);
  assert.equal(field.values[(119 * SIZE) + 118], 0.25);
  assert.equal(field.values[(119 * SIZE) + 119], 0.25);
  assert(field.getSnapshot().totalMass - before < 1);
  assert.equal(field.sample, PheromoneField.prototype.sample);
  assert.equal(field.decay, PheromoneField.prototype.decay);
  const control = new PheromoneField({ width: SIZE, height: SIZE });
  for (let index = 0; index < field.values.length; index += 1) control.values[index] = field.values[index];
  field.decay(3.75); control.decay(3.75);
  assert(Buffer.from(field.values.buffer).equals(Buffer.from(control.values.buffer)));
});
