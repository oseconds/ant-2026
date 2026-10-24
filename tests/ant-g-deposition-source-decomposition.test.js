import test from 'node:test';
import assert from 'node:assert/strict';
import { ARMS_ORDER, HIGH_ADHERENCE, HISTOGRAM_BINS, decomposeDose,
  runObserverParity } from '../scripts/ant-g-deposition-source-decomposition.js';
import { DOSE_SCALE } from '../scripts/ant-316-gaussian-dose-unit-movement-shadow.js';

test('production source terms sum to the passed per-distance rate and G scales both terms equally', () => {
  const trailStrength = 0.4, adherence = 0.8, travelled = 0.003;
  const baseline = 0.5 * (0.75 + 0.25 * trailStrength);
  const reinforcement = 5 * adherence ** 2;
  const amountPerUnitDistance = 4.5 * (baseline + reinforcement);
  const result = decomposeDose({ travelled, amountPerUnitDistance, trailStrength, adherence,
    amount: 4.5, gain: 5, scale: DOSE_SCALE });
  assert.equal(result.expectedRate, amountPerUnitDistance);
  assert.equal(result.sourceResidual, 0);
  assert.equal(result.baselineDose + result.reinforcementDose, result.totalDose);
  assert.ok(Math.abs(result.normalized.baseline - result.baselineDose)
    <= Number.EPSILON * Math.max(1, result.baselineDose));
  assert.ok(Math.abs(result.normalized.reinforcement - result.reinforcementDose)
    <= Number.EPSILON * Math.max(1, result.reinforcementDose));
  assert.ok(Math.abs(result.normalized.total - result.totalDose) <= Number.EPSILON * Math.max(1, result.totalDose));
  assert.deepEqual(ARMS_ORDER, ['C', 'F', 'G']);
  assert.equal(HIGH_ADHERENCE, 0.75);
  assert.equal(HISTOGRAM_BINS, 40);
});

test('read-only source observer preserves every short-run state and RNG state', async () => {
  for (const arm of ARMS_ORDER) {
    const result = await runObserverParity(arm, 20261005, 120);
    assert.equal(result.stateAndRngEqualEveryTick, true);
    assert.equal(result.sourceRateMismatches, 0);
    assert.equal(result.missingTrailStateCount, 0);
    assert.ok(result.observerChunks > 0);
  }
});
