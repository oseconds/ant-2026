import test from 'node:test';
import assert from 'node:assert/strict';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const start = { x: 0.18, y: 0.47 };
const end = { x: 0.82, y: 0.47 };

test('stationary agents deposit no signal while traveled distance deposits finite field mass', () => {
  const field = new PheromoneField({ width: 64, height: 64 });
  assert.equal(field.depositSegment(start, start), 0);
  assert.equal(field.getSnapshot().reconstructedIntegral, 0);

  const amount = field.depositSegment(start, end, { amountPerUnitDistance: 2, radius: 0.025 });
  const snapshot = field.getSnapshot();
  assert.ok(Math.abs(amount - 1.28) < 1e-12);
  assert.ok(Math.abs(snapshot.reconstructedIntegral - amount / 95 ** 2) < 1e-10);
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
  assert.ok(Math.abs(a.reconstructedIntegral - b.reconstructedIntegral) < 1e-10);
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

test('sampling returns no signal outside the observed square and preserves valid edge samples', () => {
  const field = new PheromoneField({ width: 12, height: 12 });
  field.depositSegment({ x: 0, y: 0 }, { x: 0.2, y: 0 }, { radius: 0.03 });
  field.depositSegment({ x: 1, y: 1 }, { x: 0.8, y: 1 }, { radius: 0.03 });
  assert.ok(field.sample(0, 0) > 0);
  assert.ok(field.sample(1, 1) > 0);
  assert.equal(field.sample(-1, 0), 0);
  assert.equal(field.sample(2, 0), 0);
  assert.equal(field.sample(0.5, -0.001), 0);
  assert.equal(field.sample(0.5, 1.001), 0);
  assert.throws(() => field.sample(Number.NaN, 0), /finite/);
  assert.throws(() => field.decay(-1), /non-negative/);
  assert.throws(() => field.depositSegment(start, end, { radius: 0 }), /greater than zero/);
});

test('segments outside the field leave no edge trail while crossing travel deposits only the in-domain length', () => {
  const outside = new PheromoneField({ width: 64, height: 64 });
  assert.equal(outside.depositSegment({ x: -1, y: 0.4 }, { x: -0.2, y: 0.7 }, { amountPerUnitDistance: 2 }), 0);
  assert.equal(outside.depositSegment({ x: 0, y: -0.01 }, { x: 1, y: -0.01 }, { amountPerUnitDistance: 2 }), 0);
  assert.equal(outside.getSnapshot().totalMass, 0);

  const crossing = new PheromoneField({ width: 64, height: 64 });
  const amount = crossing.depositSegment({ x: -0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, {
    amountPerUnitDistance: 2, radius: 0.01
  });
  assert.ok(Math.abs(amount - 1) < 1e-12, `only the 0.5 in-domain path deposits, got ${amount}`);
  assert.ok(crossing.sample(0.25, 0.5) > 0, 'the valid portion is deposited');
  assert.equal(crossing.sample(0.75, 0.5), 0, 'the outside portion cannot form an edge trail');
});

test('point deposition preserves authored dose in the reference-area integral and rejects outside points', () => {
  const field = new PheromoneField({ width: 48, height: 48 });
  assert.equal(field.depositPoint({ x: 0.5, y: 0.5 }, { amount: 0.25, radius: 0.02 }), 0.25);
  assert.ok(Math.abs(field.getSnapshot().reconstructedIntegral - 0.25 / 95 ** 2) < 1e-10);
  assert.ok(field.sample(0.5, 0.5) > field.sample(0.53, 0.5));

  const beforeOutside = field.getSnapshot().reconstructedIntegral;
  assert.equal(field.depositPoint({ x: 1.001, y: 0.5 }, { amount: 0.5, radius: 0.02 }), 0);
  assert.equal(field.getSnapshot().reconstructedIntegral, beforeOutside, 'outside points do not create edge deposits');
  assert.throws(() => field.depositPoint({ x: Number.NaN, y: 0.5 }, { amount: 0.5 }), /finite/);
  assert.throws(() => field.depositPoint({ x: 0.5, y: 0.5 }, { amount: -1 }), /non-negative/);
});

test('default field uses G resolution and distinguishes node sum from bilinear integral', () => {
  const defaultField = new PheromoneField();
  assert.equal(defaultField.width, 316);
  assert.equal(defaultField.height, 316);
  const field = new PheromoneField({ width: 2, height: 2 });
  field.values.set([1, 2, 3, 4]);
  const snapshot = field.getSnapshot();
  assert.equal(snapshot.nodeSum, 10);
  assert.equal(snapshot.totalMass, snapshot.nodeSum, 'legacy totalMass remains a native node-sum alias');
  assert.equal(snapshot.reconstructedIntegral, 2.5);
});

test('316-grid point and segment writers convert authored dose once and keep return values in source units', () => {
  const pointField = new PheromoneField();
  assert.equal(pointField.depositPoint({ x: 0.5, y: 0.5 }, { amount: 0.4 }), 0.4);
  assert.ok(Math.abs(pointField.getSnapshot().reconstructedIntegral - 0.4 / 95 ** 2) < 1e-10);

  const segmentField = new PheromoneField();
  const amount = segmentField.depositSegment({ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }, {
    amountPerUnitDistance: 2
  });
  assert.ok(Math.abs(amount - 0.8) < 1e-12);
  assert.ok(Math.abs(segmentField.getSnapshot().reconstructedIntegral - amount / 95 ** 2) < 1e-10);

  const capped = new PheromoneField({ maxValue: 0.01 });
  assert.equal(capped.depositPoint({ x: 0.5, y: 0.5 }, { amount: 10 }), 10,
    'return remains authored request and does not claim actual stored increment');
  assert.ok(capped.values.some(value => value === Math.fround(0.01)));
  assert.ok(capped.getSnapshot().reconstructedIntegral < 10 / 95 ** 2,
    'cap loss is not hidden by the request return');
});

test('boundary truncation and cap loss remain outside the interior reference-integral guarantee', () => {
  const boundary = new PheromoneField();
  assert.equal(boundary.depositPoint({ x: 0, y: 0.5 }, { amount: 0.4 }), 0.4,
    'an in-domain boundary source retains its authored return');
  assert.ok(boundary.values.some(value => value > 0), 'truncated Gaussian support is renormalized onto in-domain nodes');
  assert.ok(boundary.getSnapshot().reconstructedIntegral < 0.4 / 95 ** 2,
    'edge basis area makes the bilinear integral smaller than the interior convention');

  const capped = new PheromoneField({ maxValue: 0.01 });
  capped.depositPoint({ x: 0.5, y: 0.5 }, { amount: 10 });
  assert.ok(capped.getSnapshot().reconstructedIntegral < 10 / 95 ** 2,
    'per-node saturation loses integral without redistribution');
});

test('default half-life is fifteen seconds and abandoned traces retain one sixteenth after one minute', () => {
  const narrow = new PheromoneField();
  const wide = new PheromoneField();
  assert.equal(narrow.decayHalfLifeSeconds, 15);
  narrow.depositSegment(start, end);
  wide.depositSegment(start, end, { radius: 0.009 });
  const initial = narrow.getSnapshot();
  const occupied = values => values.filter(value => value > 1e-6).length;
  assert.ok(occupied(initial.values) < occupied(wide.getSnapshot().values), 'deposition covers fewer cells');
  narrow.decay(60);
  const faded = narrow.getSnapshot();
  assert.ok(Math.abs(faded.totalMass / initial.totalMass - 1 / 16) < 1e-6,
    'an abandoned trace retains only 6.25% after four half-lives');
});

function interpolate(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
