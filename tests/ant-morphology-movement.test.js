import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFrame, trajectoryHeader } from '../scripts/ant-social-evidence.js';
import { analyzeSource, analyzeWindow, classifyWindow } from '../scripts/ant-morphology-movement.js';
import { indexTrajectory } from '../scripts/ant-social-null.js';

const line = (x, y = 0, heading = 0) => ({ x, y, heading });

test('straight motion has unit tortuosity and no turning', () => {
  const result = analyzeWindow([line(0), line(1), line(2)]);
  assert.equal(result.pathLength, 2);
  assert.equal(result.netDisplacement, 2);
  assert.equal(result.tortuosity, 1);
  assert.equal(result.bodyHeadingTurning.absoluteAccumulatedRadians, 0);
  assert.equal(result.bodyHeadingTurning.coherence, null);
  assert.equal(result.pathTurning.absoluteAccumulatedRadians, 0);
  assert.equal(classifyWindow(result), 'straight-gentle');
});

test('closed arc keeps finite path but guards zero net displacement', () => {
  const points = Array.from({ length: 121 }, (_, i) => {
    const angle = (2 * Math.PI * i) / 120;
    return line(Math.cos(angle), Math.sin(angle), angle + Math.PI / 2);
  });
  const result = analyzeWindow(points);
  assert.ok(result.pathLength > 6.2 && result.pathLength < 6.4);
  assert.ok(result.netDisplacement < 1e-12);
  assert.equal(result.tortuosity, null);
  assert.ok(result.bodyHeadingTurning.coherence > 0.99);
  assert.ok(result.pathTurning.coherence > 0.99);
});

test('local return is counted after an intervening cell and one-second gap', () => {
  const points = [0, 0.04, 0.08, 0.04, 0].map(x => line(x));
  const result = analyzeWindow(points, 1, 0.03);
  assert.ok(result.grid.revisitedCells >= 2);
  assert.ok(result.grid.approximateReturns >= 2);
  assert.equal(classifyWindow(result), 'confined-local-return');
});

test('unclassified movement retains continuous excursion and turning measures', () => {
  const points = [[0, 0, 0], [0.04, 0.01, 0.2], [0.03, 0.07, 1.1], [-0.02, 0.03, -2.8], [0.08, -0.01, 2.7]]
    .map(([x, y, heading]) => line(x, y, heading));
  const result = analyzeWindow(points, 1, 0.03);
  assert.ok(result.pathLength > result.netDisplacement);
  assert.ok(result.maxExcursion > 0.07);
  assert.ok(result.bodyHeadingTurning.absoluteAccumulatedRadians > 0);
  assert.ok(result.grid.uniqueCells > 1);
  assert.equal(classifyWindow(result), 'unclassified-remainder');
});

test('visit-run revisits exclude ordinary residence and distinguish heading from travel curvature', () => {
  const stationary = Array.from({ length: 61 }, (_, i) => line(0, 0, i / 60));
  const result = analyzeWindow(stationary);
  assert.equal(result.grid.longestResidenceSeconds, 1);
  assert.equal(result.grid.revisitedCells, 0);
  assert.equal(result.grid.sampleFractionInRevisitedCells, 0);
  assert.equal(result.grid.approximateReturns, 0);
  assert.ok(result.bodyHeadingTurning.absoluteAccumulatedRadians > 0);
  assert.equal(result.pathTurning.absoluteAccumulatedRadians, 0);
});

test('broad sustained path turn category uses geometry and stated body-scale cutoff', () => {
  const points = Array.from({ length: 61 }, (_, i) => {
    const angle = 2 * i / 60;
    return line(Math.cos(angle), Math.sin(angle), angle + Math.PI / 2);
  });
  const result = analyzeWindow(points);
  assert.ok(result.pathTurning.longestSameSignRunSeconds >= result.durationSeconds / 2);
  assert.equal(classifyWindow(result), 'broad-sustained-turn');
});

test('non-finite trajectory fields are rejected', () => {
  assert.throws(() => analyzeWindow([line(0), line(Number.NaN)]));
});

test('partial lifecycle windows are censored and omitted from completed metrics', () => {
  const frames = Array.from({ length: 121 }, (_, tick) => encodeFrame({ timeSeconds: tick / 60,
    agents: tick >= 30 && tick <= 90 ? [{ id: 'A', idIndex: 0, x: tick / 60, y: 0,
      vx: 1, vy: 0, heading: 0, radius: 0.006 }] : [] }));
  const source = indexTrajectory(Buffer.concat([trajectoryHeader(), ...frames]), ['A']);
  const result = analyzeSource(source, 7).windows[0];
  assert.equal(result.completeWindowCount, 0);
  assert.equal(result.lifecycleCensoring.leftCensoredWindowCount, 1);
  assert.equal(result.lifecycleCensoring.rightCensoredWindowCount, 1);
  assert.equal(result.aggregates.pathLength.n, 0);
  assert.equal(result.categoryPrevalence['unclassified-remainder'].count, 0);
  assert.equal(result.representativeWindows.medianTortuosity, null);
  assert.equal(result.representativeWindows.maximumTortuosity, null);
});
