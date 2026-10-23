import test from 'node:test';
import assert from 'node:assert/strict';
import { gasterRearPoint } from '../src/lib/agents/ant/BodyPoseController.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { gasterPath, routePoint, routeTangent, sourcePath } from '../scripts/ant-spatial-field.js';

test('default Gaussian support falls back at the preregistered half-cell phase; sampling stays bilinear', () => {
  class CountFallbackField extends PheromoneField {
    fallbackCalls = 0;
    depositBrush(x, y, amount, radius, sigma, support) {
      const gridX = Math.round(Math.max(0, Math.min(1, x)) * (this.width - 1));
      const gridY = Math.round(Math.max(0, Math.min(1, y)) * (this.height - 1));
      const nearestDistance = Math.hypot(gridX / (this.width - 1) - x, gridY / (this.height - 1) - y);
      if (nearestDistance > support) this.fallbackCalls += 1;
      super.depositBrush(x, y, amount, radius, sigma, support);
    }
  }
  const field = new CountFallbackField({ width: 96, height: 96 });
  const pitch = 1 / 95;
  assert.equal(field.depositPoint({ x: 32 * pitch, y: 48 * pitch }, { amount: 0.25, radius: 0.0045 }), 0.25);
  assert.equal(field.fallbackCalls, 0);
  const nodeValue = field.sample(32 * pitch, 48 * pitch);
  assert.ok(Math.abs(field.sample(32.5 * pitch, 48 * pitch) - nodeValue * 0.5) < 1e-6,
    'the unchanged read interpolates between the deposited node and its empty neighbor');

  const half = new CountFallbackField({ width: 96, height: 96 });
  assert.equal(half.depositPoint({ x: 32.5 * pitch, y: 48.5 * pitch }, { amount: 0.25, radius: 0.0045 }), 0.25);
  assert.equal(half.fallbackCalls, 1);
  assert.ok(Math.abs(half.getSnapshot().totalMass - 0.25) < 1e-6,
    'nearest-cell fallback stores the requested point dose');
  half.decay(15);
  assert.ok(Math.abs(half.getSnapshot().totalMass - 0.125) < 1e-6,
    'the default field keeps its configured 15-second half-life');
});

test('fixed path fixtures retain exact phase translation and prescribed curvature', () => {
  const straight = { name: 'straight-x', family: 'straight', kind: 'line', angle: 0 };
  const straightY = { ...straight, name: 'straight-y', angle: Math.PI / 2 };
  const circle = { name: 'gentle', family: 'gentle', kind: 'circle', radius: 0.25, orientation: 1 };
  const start = routePoint(straight, 0);
  assert.deepEqual(start, routePoint(straightY, 0));
  assert.deepEqual(routePoint(straight, 0, { x: 0.5 / 95, y: 0.5 / 95 }),
    { x: start.x + 0.5 / 95, y: start.y + 0.5 / 95 });
  for (const station of [-0.1, 0, 0.1, 0.25]) {
    const point = routePoint(circle, station);
    assert.ok(Math.abs(Math.hypot(point.x - start.x, point.y - (start.y + 0.25)) - 0.25) < 1e-9);
    assert.ok(Math.abs(routeTangent(circle, station) - station / 0.25) < 1e-9);
  }
  const points = sourcePath(straight);
  assert.equal(points.length, 231);
  assert.ok(Math.abs(points[0].station + 0.12) < 1e-12);
  assert.ok(Math.abs(points.at(-1).station - 0.34) < 1e-12);
});

test('gaster path uses the production rear-tip geometry under the fixed initial pose', () => {
  const geometry = { name: 'straight-x', family: 'straight', kind: 'line', angle: 0 };
  const thorax = sourcePath(geometry)[0];
  const ant = { id: 1, radius: 0.006, x: thorax.x, y: thorax.y, heading: 0, angularVelocity: 0 };
  const rear = gasterPath(geometry)[0];
  assert.deepEqual(rear, gasterRearPoint(ant));
  assert.ok(rear.x < thorax.x);
  assert.equal(rear.y, thorax.y);
});
