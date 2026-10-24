import test from 'node:test';
import assert from 'node:assert/strict';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import {
  SIZE, RADIUS, PITCH, expectedGaussianNodes, pointLatticeAssay, doseAndMomentAssay,
  boundaryAssay, capAndDecayAssay, orientationFixture, transitionCensus, withMathRandomForbidden
} from '../scripts/ant-316-gaussian-fixed-cue-qualification.js';

test('316 Gaussian stencil matches the inherited production writer and stays within R', () => {
  assert.equal(SIZE, 316);
  assert.equal(PITCH, 1 / 315);
  const source = { x: 157.37 * PITCH, y: 157.62 * PITCH };
  const stencil = expectedGaussianNodes(source.x, source.y);
  assert(stencil.nodes.length > 0);
  assert(stencil.nodes.every(node => node.distance <= RADIUS && node.weight > 0));
  assert.equal(stencil.nodes.reduce((sum, node) => sum + node.weight, 0), stencil.weightTotal);

  const field = new PheromoneField({ width: SIZE, height: SIZE });
  assert.equal(field.depositPoint, PheromoneField.prototype.depositPoint);
  assert.equal(field.sample, PheromoneField.prototype.sample);
  assert.equal(field.depositPoint(source, { amount: 1, radius: RADIUS }), 1);
  const written = [...field.values.entries()].filter(([, value]) => value > 0);
  assert.deepEqual(written.map(([index]) => index), stencil.nodes.map(node => node.index));
  assert.deepEqual(written.map(([, value]) => value), stencil.nodes.map(node => Math.fround(node.weight / stencil.weightTotal)));

  const audit = withMathRandomForbidden(() => pointLatticeAssay(17));
  assert.equal(audit.formulaParity.nonExact, 0);
  assert.equal(audit.fallback.emptySupportCount, 0);
  assert(audit.maximumSourceToPositiveNodeDistance <= RADIUS);
});

test('uncapped Gaussian writes conserve dose within derived Float32 bounds across phases', () => {
  const result = doseAndMomentAssay();
  assert.equal(result.pass, true);
  assert.equal(result.writes, 49152);
  assert(result.maximumDerivedBoundRatio <= 1);
  assert(result.centroidError.max > 0);
});

test('boundary, cap, decay, and segment orientation diagnostics are deterministic and finite', () => {
  const boundary = boundaryAssay();
  assert.equal(boundary.cases.length, 12);
  assert.equal(boundary.outside.accepted, 0);
  const capDecay = capAndDecayAssay();
  assert(capDecay.cap.loss > 0);
  assert.equal(capDecay.cap.originalSharesNotRedistributed, true);
  assert.equal(capDecay.decay.passed, true);

  const first = orientationFixture();
  const second = orientationFixture();
  assert.deepEqual(first, second);
  assert.equal(first.CIC96OrthogonalAlias.exactRasterIdentity, true);
  assert(first.arms.F.horizontal.mass > 0);
  assert(Object.values(first.arms.F).every(result => Number.isFinite(result.secondMoment.trace)));
});

test('pairwise fixed-cue transition census keeps recoveries, new errors, and persistent errors separate', () => {
  const rows = [{ source: true, C: true, F: false }, { source: true, C: false, F: true },
    { source: true, C: true, F: true }, { source: false, C: true, F: false }].filter(row => row.source);
  const result = transitionCensus(rows, 'C', 'F', (row, arm) => row[arm]);
  assert.deepEqual(result, { count: 3, from: 'C', to: 'F', fromErrors: 2, toErrors: 2,
    recovered: 1, newErrors: 1, persistentErrors: 1, unchangedCorrect: 0 });
});
