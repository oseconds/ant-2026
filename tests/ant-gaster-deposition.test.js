import test from 'node:test';
import assert from 'node:assert/strict';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

test('continuous mode preserves thorax-distance dose when the gaster point travels a different distance', () => {
  const deposition = new GasterDeposition();
  const [segment] = deposition.advance('ant-1', 0.01,
    { x: 0.2, y: 0.4 }, { x: 0.22, y: 0.4 }, 7);
  assert.equal(segment.type, 'segment');
  assert.equal(segment.from.x, 0.2);
  assert.equal(segment.to.x, 0.22);
  assert.ok(Math.abs(segment.amountPerUnitDistance - 3.5) < 1e-12,
    'the returned rate compensates for rear-point length to preserve 0.01 × 7 dose');

  const [point] = deposition.advance('ant-1', 0.01,
    { x: 0.3, y: 0.4 }, { x: 0.3, y: 0.4 }, 7);
  assert.deepEqual(point, { type: 'point', position: { x: 0.3, y: 0.4 }, amount: 0.07 },
    'a stationary rear point still receives dose from actual thorax travel');
  assert.deepEqual(deposition.ants, new Map(), 'continuous mode keeps no dab accumulator state');
});

test('dab thresholds follow traveled distance, ignore pure gaster rotation, and interpolate the rear point', () => {
  const deposition = new GasterDeposition({ mode: 'dab', spacing: 0.006 });
  assert.deepEqual(deposition.advance('ant-1', 0.002,
    { x: 0.2, y: 0.3 }, { x: 0.202, y: 0.3 }, 2), []);
  assert.deepEqual(deposition.advance('ant-1', 0,
    { x: 0.202, y: 0.3 }, { x: 0.202, y: 0.32 }, 100), [],
  'rotation changes the secretion point but no thorax travel means no dab distance');

  const [dab] = deposition.advance('ant-1', 0.004,
    { x: 0.202, y: 0.3 }, { x: 0.206, y: 0.3 }, 3);
  assert.equal(dab.type, 'point');
  assert.deepEqual(dab.position, { x: 0.206, y: 0.3 });
  assert.ok(Math.abs(dab.amount - 0.016) < 1e-12,
    'one dab includes the weighted dose from both sides of the distance threshold');
});

test('large movement emits every crossed dab boundary and retirement flushes the final partial dose', () => {
  const deposition = new GasterDeposition({ mode: 'dab', spacing: 0.006 });
  const from = { x: 0.2, y: 0.5 }, to = { x: 0.221, y: 0.5 };
  const dabs = deposition.advance('ant-2', 0.021, from, to, 4);
  assert.equal(dabs.length, 3);
  for (let index = 0; index < 3; index += 1) {
    assert.ok(Math.abs(dabs[index].position.x - (0.206 + index * 0.006)) < 1e-12);
    assert.ok(Math.abs(dabs[index].amount - 0.024) < 1e-12);
  }

  const [final] = deposition.retire('ant-2', to);
  assert.ok(Math.abs(final.amount - 0.012) < 1e-12);
  assert.deepEqual(final.position, to);
  assert.equal(deposition.ants.has('ant-2'), false);
  assert.deepEqual(deposition.retire('ant-2', to), []);
});

test('pathological dab bursts are bounded while their weighted amount is conserved', () => {
  const deposition = new GasterDeposition({ mode: 'dab', spacing: 0.006 });
  const dabs = deposition.advance('ant-burst', 10,
    { x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, 2);
  assert.equal(dabs.length, 257, 'emit 256 spaced dabs and aggregate only the pathological remainder');
  assert.ok(Math.abs(dabs.reduce((sum, dab) => sum + dab.amount, 0) - 20) < 1e-10,
    'the output cap does not discard any weighted traveled-distance amount');
});

test('continuous and dab modes preserve adherence-weighted dose across different movement subdivisions', () => {
  const radius = 0.0045;
  const continuous = new GasterDeposition({ mode: 'continuous' });
  const dab = new GasterDeposition({ mode: 'dab', spacing: 0.006 });
  const continuousField = new PheromoneField({ width: 128, height: 128, decayHalfLifeSeconds: 15 });
  const dabField = new PheromoneField({ width: 128, height: 128, decayHalfLifeSeconds: 15 });
  const rateAt = distance => 2.5 + 80 * distance;
  const totalDistance = 0.036;
  const expectedDose = 2.5 * totalDistance + 40 * totalDistance ** 2;
  const applyDeposits = (field, deposits) => {
    for (const deposit of deposits) {
      if (deposit.type === 'segment') {
        field.depositSegment(deposit.from, deposit.to, {
          amountPerUnitDistance: deposit.amountPerUnitDistance, radius
        });
      } else field.depositPoint(deposit.position, { amount: deposit.amount, radius });
    }
  };

  // Continuous baseline is advanced in 0.002-distance chunks.
  for (let index = 0; index < 18; index += 1) {
    const fromDistance = index * 0.002;
    const toDistance = fromDistance + 0.002;
    const from = { x: 0.2 + fromDistance, y: 0.5 };
    const to = { x: 0.2 + toDistance, y: 0.5 };
    const rate = rateAt((fromDistance + toDistance) * 0.5);
    applyDeposits(continuousField,
      continuous.advance('ant-3', 0.002, from, to, rate));
  }

  // Dab experiment is updated on different 0.003-distance chunks.
  for (let index = 0; index < 12; index += 1) {
    const fromDistance = index * 0.003;
    const toDistance = fromDistance + 0.003;
    const from = { x: 0.2 + fromDistance, y: 0.5 };
    const to = { x: 0.2 + toDistance, y: 0.5 };
    const rate = rateAt((fromDistance + toDistance) * 0.5);
    for (const deposit of dab.advance('ant-3', 0.003, from, to, rate)) {
      dabField.depositPoint(deposit.position, { amount: deposit.amount, radius });
    }
  }
  for (const deposit of dab.retire('ant-3', { x: 0.236, y: 0.5 })) {
    dabField.depositPoint(deposit.position, { amount: deposit.amount, radius });
  }

  const continuousIntegral = continuousField.getSnapshot().reconstructedIntegral;
  const dabIntegral = dabField.getSnapshot().reconstructedIntegral;
  const expectedReferenceIntegral = expectedDose / 95 ** 2;
  assert.ok(Math.abs(continuousIntegral - expectedReferenceIntegral) < 1e-9,
    `continuous reference integral ${continuousIntegral} should match authored dose ${expectedDose}`);
  assert.ok(Math.abs(dabIntegral - expectedReferenceIntegral) < 1e-9,
    `dab reference integral ${dabIntegral} should match authored dose ${expectedDose}`);
  assert.ok(Math.abs(continuousIntegral - dabIntegral) / expectedReferenceIntegral < 1e-5,
    `continuous ${continuousIntegral} and dab ${dabIntegral} integrals should agree`);
  assert.notDeepEqual([...continuousField.values], [...dabField.values],
    'the experiment changes the spatial distribution while preserving total weighted dose');
});

test('dab remainder is flushed and cleared on retirement; retain and reset release transient state', () => {
  const deposition = new GasterDeposition({ mode: 'dab', spacing: 0.006 });
  assert.deepEqual(deposition.advance('ant-exit', 0,
    { x: 0.99, y: 0.5 }, { x: 1.02, y: 0.5 }, 10), []);
  assert.equal(deposition.ants.size, 0, 'standing and rotating does not allocate or advance dab state');

  deposition.advance('ant-exit', 0.002, { x: 0.99, y: 0.5 }, { x: 1.01, y: 0.5 }, 5);
  const [outsideFlush] = deposition.retire('ant-exit', { x: 1.01, y: 0.5 });
  assert.deepEqual(outsideFlush, { type: 'point', position: { x: 1.01, y: 0.5 }, amount: 0.01 },
    'retirement reports the intended pending dose even when it is outside the field');
  assert.equal(deposition.ants.size, 0);

  deposition.advance('ant-keep', 0.002, { x: 0.4, y: 0.4 }, { x: 0.402, y: 0.4 }, 5);
  deposition.advance('ant-drop', 0.002, { x: 0.5, y: 0.5 }, { x: 0.502, y: 0.5 }, 5);
  deposition.retain(new Set(['ant-keep']));
  assert.deepEqual([...deposition.ants.keys()], ['ant-keep']);
  deposition.reset();
  assert.equal(deposition.ants.size, 0);
});
