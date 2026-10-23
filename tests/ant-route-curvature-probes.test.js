import test from 'node:test';
import assert from 'node:assert/strict';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { makeRoutePoints, measureFieldRidge, projectRoute, routeAt, routeTangent } from '../scripts/ant-route-curvature-probes.js';

test('route fixtures preserve the requested entry and circle radii', () => {
  for (const shape of ['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve']) {
    const start = routeAt(shape, 0);
    assert.ok(Math.abs(start.x - 0.35) < 1e-9);
    assert.ok(Math.abs(start.y - 0.5) < 1e-9);
  }
  for (const [shape, radius, orientation] of [
    ['gentle', 0.25, 1], ['tight', 0.1, 1], ['gentleMirror', 0.25, -1], ['tightMirror', 0.1, -1]
  ]) {
    for (const station of [-0.1, 0, 0.1, 0.25]) {
      const point = routeAt(shape, station);
      assert.ok(Math.abs(Math.hypot(point.x - 0.35, point.y - (0.5 + orientation * radius)) - radius) < 1e-9);
      assert.ok(Math.abs(routeTangent(shape, station) - orientation * station / radius) < 1e-9);
    }
  }
});

test('route projection returns signed offset and recovers station', () => {
  for (const shape of ['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve']) {
    const station = 0.08, point = routeAt(shape, station), tangent = routeTangent(shape, station);
    const offset = 0.004;
    const projected = projectRoute(shape, point.x - Math.sin(tangent) * offset,
      point.y + Math.cos(tangent) * offset);
    assert.ok(Math.abs(projected.station - station) < 2e-5, `${shape} station`);
    assert.ok(Math.abs(projected.crossTrack - offset) < 2e-5, `${shape} signed cross-track`);
  }
});

test('field ridge extraction resolves a fixed Gaussian corridor', () => {
  const sample = (x, y) => x < 0.02 || x > 0.98 ? 0
    : 0.5 * Math.exp(-((y - 0.5) ** 2) / (2 * 0.0025 ** 2));
  const result = measureFieldRidge(sample, 'straight');
  assert.equal(result.threshold, 0.018);
  assert.ok(result.ridgeCoverageFraction > 0.99);
  assert.ok(result.centerlineCoverageFraction > 0.99);
  assert.ok(result.meanAbsoluteRidgeOffset <= 0.001);
  assert.equal(result.longestBelowThresholdGap, 0);
});

test('real deposited field fixture keeps production grid and corridor source geometry', () => {
  const field = new PheromoneField();
  const points = makeRoutePoints('gentle', -0.12, 0.34);
  for (let index = 1; index < points.length; index += 1) {
    field.depositSegment(points[index - 1], points[index], { amountPerUnitDistance: 4.5, radius: 0.0045 });
  }
  assert.equal(field.width, 96);
  assert.equal(field.height, 96);
  assert.ok(field.getSnapshot().totalMass > 0);
  const ridge = measureFieldRidge(field.sample.bind(field), 'gentle');
  assert.ok(ridge.ridgeCoverageFraction > 0);
  assert.ok(Number.isFinite(ridge.meanAbsoluteRidgeOffset));
});
