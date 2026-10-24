import test from 'node:test';
import assert from 'node:assert/strict';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { CicPheromoneField } from '../scripts/ant-cic-writer.js';

test('CIC stores the exact four-node barycentric dose and centroid on a binary fixture', () => {
  const field = new CicPheromoneField({ width: 5, height: 5 });
  assert.equal(field.depositPoint({ x: 0.3125, y: 0.4375 }, { amount: 0.5 }), 0.5);
  const occupied = [...field.values.entries()].filter(([, value]) => value !== 0);
  assert.deepEqual(occupied, [[6, 0.09375], [7, 0.03125], [11, 0.28125], [12, 0.09375]]);
  const mass = occupied.reduce((sum, [, v]) => sum + v, 0);
  assert.equal(mass, 0.5);
  assert.equal(occupied.reduce((sum, [i, v]) => sum + (i % 5) / 4 * v, 0) / mass, 0.3125);
  assert.equal(occupied.reduce((sum, [i, v]) => sum + Math.floor(i / 5) / 4 * v, 0) / mass, 0.4375);
});

test('domain edges collapse zero-weight neighbours without duplicate deposits', () => {
  const field = new CicPheromoneField({ width: 5, height: 5 });
  field.depositPoint({ x: 1, y: 0.4375 }, { amount: 1 });
  assert.deepEqual([...field.values.entries()].filter(([, v]) => v !== 0), [[9, 0.25], [14, 0.75]]);
  field.clear();
  field.depositPoint({ x: 1, y: 1 }, { amount: 1 });
  assert.equal(field.values[24], 1);
  assert.equal(field.getSnapshot().totalMass, 1);
});

test('per-node saturation loses dose without redistribution or false accepted-dose reporting', () => {
  const field = new CicPheromoneField({ width: 5, height: 5 });
  field.values[6] = 7.99;
  const before = field.getSnapshot().totalMass;
  assert.equal(field.depositPoint({ x: 0.375, y: 0.375 }, { amount: 1 }), 1);
  assert.equal(field.values[6], 8);
  assert.equal(field.values[7], 0.25);
  assert.equal(field.values[11], 0.25);
  assert.equal(field.values[12], 0.25);
  assert.ok(field.getSnapshot().totalMass - before < 1);
});

test('validation, sampling, decay and outside-domain rejection retain production methods', () => {
  const field = new CicPheromoneField();
  for (const name of ['depositPoint', 'depositSegment', 'sample', 'decay', 'getSnapshot']) {
    assert.equal(field[name], PheromoneField.prototype[name]);
  }
  assert.equal(field.depositPoint({ x: -1e-10, y: 0.5 }, { amount: 1 }), 0);
  assert.equal(field.getSnapshot().totalMass, 0);
  assert.throws(() => field.depositPoint({ x: NaN, y: 0.5 }, { amount: 1 }), /finite/);
  assert.throws(() => field.depositPoint({ x: 0.5, y: 0.5 }, { amount: -1 }), /non-negative/);
  assert.throws(() => field.depositPoint({ x: 0.5, y: 0.5 }, { amount: 1, radius: 0 }), /greater than zero/);
});
