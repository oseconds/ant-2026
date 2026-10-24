import test from 'node:test';
import assert from 'node:assert/strict';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import {
  DOSE_SCALE, SCALE_DENOMINATOR, SCALE_NUMERATOR, bilinearIntegral,
  doseUnitSanity, assertUncappedAudit
} from '../scripts/ant-316-gaussian-dose-unit-qualification.js';
import { expectedGaussianNodes, RADIUS, SIZE } from '../scripts/ant-316-gaussian-fixed-cue-qualification.js';

test('dose factor exactly preserves the interior bilinear integral convention', () => {
  assert.equal(DOSE_SCALE, (315 / 95) ** 2);
  assert.equal(DOSE_SCALE, SCALE_NUMERATOR / SCALE_DENOMINATOR);
  const receipt = doseUnitSanity();
  assert.equal(receipt.scale.value, DOSE_SCALE);
  assert(Math.abs(receipt.singleInteriorNode.residual) <= 1e-9);
  assert(Math.abs(receipt.genericInteriorNodes.residual) <= receipt.genericInteriorNodes.derivedFloat32Bound
    + receipt.genericInteriorNodes.arithmeticGuard);

  const interior = new Float32Array(SIZE * SIZE);
  interior[157 * SIZE + 158] = 3.25;
  const edge = new Float32Array(SIZE * SIZE);
  edge[157 * SIZE] = 3.25;
  assert.equal(bilinearIntegral(interior, SIZE), 3.25 / 315 ** 2);
  assert.equal(bilinearIntegral(edge, SIZE), 3.25 / (2 * 315 ** 2));
});

test('G keeps F Gaussian support and normalized node proportions before cap', () => {
  const source = { x: 157.37 / 315, y: 157.62 / 315 };
  const stencil = expectedGaussianNodes(source.x, source.y, SIZE, SIZE, RADIUS);
  const f = new PheromoneField({ width: SIZE, height: SIZE });
  const g = new PheromoneField({ width: SIZE, height: SIZE });
  f.depositPoint(source, { amount: 0.02, radius: RADIUS });
  g.depositPoint(source, { amount: 0.02 * DOSE_SCALE, radius: RADIUS });

  assert(stencil.nodes.length > 1);
  assert(stencil.nodes.every(node => node.distance <= RADIUS));
  for (let index = 0; index < f.values.length; index += 1) {
    assert.equal(f.values[index] > 0, g.values[index] > 0);
    if (f.values[index] > 0) {
      const bound = 2 ** -24 * Math.abs(g.values[index]) + 2 ** -150
        + 64 * Number.EPSILON * Math.max(1, Math.abs(f.values[index] * DOSE_SCALE));
      assert(Math.abs(g.values[index] - f.values[index] * DOSE_SCALE) <= bound);
    }
  }
});

test('G cue gate is blocked by any cap hit', () => {
  assert.doesNotThrow(() => assertUncappedAudit({ status: 'PASS', capAudit: {
    anyHit: false, hitWriteNodeCount: 0, cappedNodeCount: 0
  } }));
  assert.throws(() => assertUncappedAudit({ status: 'INCONCLUSIVE — SATURATION', capAudit: {
    anyHit: true, hitWriteNodeCount: 1, cappedNodeCount: 1
  } }), /Candidate G stops before cue evaluation/);
});
