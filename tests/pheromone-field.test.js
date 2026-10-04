import test from 'node:test';
import assert from 'node:assert/strict';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const start = { x: 0.18, y: 0.47 };
const end = { x: 0.82, y: 0.47 };

test('stationary agents deposit no signal while traveled distance deposits finite field mass', () => {
  const field = new PheromoneField({ width: 64, height: 64 });
  assert.equal(field.depositSegment(start, start), 0);
  assert.equal(field.getSnapshot().totalMass, 0);

  const amount = field.depositSegment(start, end, { amountPerUnitDistance: 2, radius: 0.025 });
  const snapshot = field.getSnapshot();
  assert.ok(Math.abs(amount - 1.28) < 1e-12);
  assert.ok(Math.abs(snapshot.totalMass - amount) < 1e-4);
  assert.ok(field.sample(0.5, 0.47) > 0);
  assert.ok(field.sample(0.5, 0.7) < field.sample(0.5, 0.47));
});

test('segment deposition is approximately stable under path subdivision', () => {
  const whole = new PheromoneField({ width: 72, height: 72 });
  const subdivided = new PheromoneField({ width: 72, height: 72 });
  whole.depositSegment(start, end, { amountPerUnitDistance: 1, radius: 0.04 });
  for (let step = 0; step < 32; step += 1) {
    const t0 = step / 32;
    const t1 = (step + 1) / 32;
    subdivided.depositSegment(interpolate(start, end, t0), interpolate(start, end, t1), {
      amountPerUnitDistance: 1,
      radius: 0.04
    });
  }

  const a = whole.getSnapshot();
  const b = subdivided.getSnapshot();
  assert.ok(Math.abs(a.totalMass - b.totalMass) < 1e-4);
  const meanAbsoluteDifference = a.values.reduce((sum, value, index) => sum + Math.abs(value - b.values[index]), 0) / a.values.length;
  assert.ok(meanAbsoluteDifference < 0.00002, `mean field difference was ${meanAbsoluteDifference}`);
});

test('exponential decay honors half-life and composes over elapsed time', () => {
  const once = new PheromoneField({ width: 32, height: 32, decayHalfLifeSeconds: 10 });
  const inParts = new PheromoneField({ width: 32, height: 32, decayHalfLifeSeconds: 10 });
  for (const field of [once, inParts]) {
    field.depositSegment({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5001 }, { amountPerUnitDistance: 1000, radius: 0.1 });
  }

  const initial = once.sample(0.5, 0.5);
  once.decay(10);
  inParts.decay(3);
  inParts.decay(7);
  assert.ok(Math.abs(once.sample(0.5, 0.5) - initial / 2) < 1e-6);
  assert.ok(Math.abs(once.sample(0.5, 0.5) - inParts.sample(0.5, 0.5)) < 1e-6);
});

test('reinforcement is bounded and snapshots do not expose live field storage', () => {
  const field = new PheromoneField({ width: 24, height: 24, maxValue: 0.7 });
  for (let index = 0; index < 100; index += 1) {
    field.depositSegment({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.5 }, { amountPerUnitDistance: 100, radius: 0.1 });
  }
  const snapshot = field.getSnapshot();
  assert.ok(snapshot.values.every(Number.isFinite));
  assert.ok(snapshot.values.every((value) => value <= 0.7));
  snapshot.values.fill(0);
  assert.ok(field.sample(0.505, 0.5) > 0);
});

test('sampling clamps coordinates and invalid values fail clearly', () => {
  const field = new PheromoneField({ width: 12, height: 12 });
  field.depositSegment({ x: 0, y: 0 }, { x: 0.2, y: 0 }, { radius: 0.03 });
  assert.equal(field.sample(-1, 0), field.sample(0, 0));
  assert.equal(field.sample(2, 0), field.sample(1, 0));
  assert.throws(() => field.sample(Number.NaN, 0), /finite/);
  assert.throws(() => field.decay(-1), /non-negative/);
  assert.throws(() => field.depositSegment(start, end, { radius: 0 }), /greater than zero/);
});

function interpolate(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
