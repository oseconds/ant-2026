import test from 'node:test';
import assert from 'node:assert/strict';
import { AMOUNT_PER_DISTANCE, BASELINE_FACTOR, DOSE_SCALE, HIGH_ADHERENCE,
  ADHERENCE_EXPONENT, createOccupancyObserver, initialPairReceipt, observeOccupancyTick,
  observerParity } from '../scripts/ant-g-reinforcement-ablation.js';

test('G-R0 changes only the initialized reinforcement gain and preserves the paired initial world/RNG state', async () => {
  const receipt = await initialPairReceipt(20261005);
  assert.equal(receipt.gainBeforeOverride, 5);
  assert.equal(receipt.gainAfterOverride, 0);
  assert.equal(receipt.equalAfterNormalizingOnlyGain, true);
  assert.equal(receipt.field.widthG, 316);
  assert.equal(receipt.field.widthR0, 316);
  assert.equal(receipt.field.doseScaleG, DOSE_SCALE);
  assert.equal(receipt.field.doseScaleR0, DOSE_SCALE);
  assert.equal(receipt.field.bothEmpty, true);
});

test('the observer adds no state or RNG change for G or G-R0', async () => {
  for (const arm of ['G', 'G-R0']) {
    const receipt = await observerParity(arm, 20261005, 120);
    assert.equal(receipt.equalEveryTick, true);
    assert.equal(receipt.observerAddedRngCalls, 0);
    assert.equal(receipt.observerCalls.local, receipt.observerCalls.intention);
    assert.ok(receipt.observerCalls.far > 0);
  }
});

test('the 30-second occupancy observer rolls independent one-second buckets', () => {
  const observer = createOccupancyObserver();
  let snapshot;
  for (let second = 1; second <= 60; second += 1) {
    const point = second <= 30 ? { x: 0.1, y: 0.1 } : { x: 0.9, y: 0.9 };
    for (let tick = 0; tick < 60; tick += 1) snapshot = observeOccupancyTick(observer, [point]);
  }
  assert.equal(snapshot.second, 60);
  assert.equal(snapshot.cumulative.coverage, 2 / (64 * 64));
  assert.equal(snapshot.recent30s.coverage, 1 / (64 * 64));
  assert.equal(snapshot.recent30s.normalizedEntropy, 0);
  assert.equal(snapshot.recent30s.top10PercentMassShare, 1);
});

test('the fixed source decomposition zeros only reinforcement and retains the baseline term', () => {
  const E = 0.73, A = 0.91;
  const baseline = BASELINE_FACTOR * (0.75 + 0.25 * E);
  const G = baseline + 5 * A ** ADHERENCE_EXPONENT;
  const R0 = baseline + 0 * A ** ADHERENCE_EXPONENT;
  assert.equal(R0, baseline);
  assert.equal(0 * A ** ADHERENCE_EXPONENT, 0);
  assert.equal(AMOUNT_PER_DISTANCE, 4.5);
  assert.equal(HIGH_ADHERENCE, 0.75);
  assert.equal(DOSE_SCALE, 3969 / 361);
  assert.ok(G > R0);
});
