import test from 'node:test';
import assert from 'node:assert/strict';
import { flowRecruitHeading, measureOutgoingFlow } from '../scripts/ant-spatial-recruitment.js';

const origin = { x: 0.5, y: 0.72 };
const segment = (id, x, y, dx, dy) => ({ id,
  from: { x: origin.x + x, y: origin.y + y },
  to: { x: origin.x + x + dx, y: origin.y + y + dy } });

test('outgoing flow equally weights actual eligible ant directions', () => {
  const flow = measureOutgoingFlow([
    segment('a', 0.04, 0, 0.001, 0),
    segment('b', 0.04, 0, 0, 0.002),
    segment('c', 0.04, 0, 0, 0.003)
  ], { dt: 1 / 60, origin });
  assert.equal(flow.valid, true);
  assert.equal(flow.count, 3);
  assert.ok(Math.abs(flow.q.x - 1 / 3) < 1e-12);
  assert.ok(Math.abs(flow.q.y - 2 / 3) < 1e-12);
  assert.ok(Math.abs(flow.R - Math.sqrt(5) / 3) < 1e-12);
  assert.ok(Math.abs(flow.phi - Math.atan2(2, 1)) < 1e-12);
});

test('flow gate uses midpoint annulus, actual speed, outward radial motion, and distinct IDs', () => {
  const centeredAtZero = (id, x, y, dx, dy) => ({ id,
    from: { x, y }, to: { x: x + dx, y: y + dy } });
  const innerRadius = 0.018;
  const dt = 1 / 60;
  const aboveMinimumTravel = 0.008001 * dt;
  const flow = measureOutgoingFlow([
    centeredAtZero('inner-boundary', innerRadius - 0.0005, 0, 0.001, 0),
    centeredAtZero('slow', 0.04, 0, 0.0001, 0),
    centeredAtZero('inward', 0.04, 0, -0.001, 0),
    centeredAtZero('outer-boundary', 0.0845, 0, 0.001, 0),
    centeredAtZero('above-minimum-speed', 0.04 - aboveMinimumTravel / 2, 0, aboveMinimumTravel, 0),
    centeredAtZero('eligible-a', 0.04, 0, 0.001, 0),
    centeredAtZero('eligible-a', 0.04, 0, 0.001, 0),
    centeredAtZero('eligible-b', 0, 0.04, 0, 0.001),
    centeredAtZero('eligible-c', -0.04, 0, -0.001, 0)
  ], { dt, origin: { x: 0, y: 0 } });
  assert.equal(flow.valid, true);
  assert.equal(flow.count, 5);
  assert.ok(Math.abs(flow.q.x - 0.4) < 1e-12);
  assert.ok(Math.abs(flow.q.y - 0.2) < 1e-12);
});

test('N below three or a zero resultant is invalid and uses exact isotropic heading', () => {
  const two = measureOutgoingFlow([
    segment('a', 0.04, 0, 0.001, 0), segment('b', 0.04, 0, 0.001, 0)
  ], { origin });
  assert.equal(two.reason, 'insufficient-count');
  assert.equal(flowRecruitHeading(two, 0.25), -Math.PI / 2);

  const balanced = measureOutgoingFlow([
    segment('a', 0.04, 0, 0.001, 0),
    segment('b', -0.04, 0, -0.001, 0),
    segment('c', 0, 0.04, 0, 0.001),
    segment('d', 0, -0.04, 0, -0.001)
  ], { origin });
  assert.equal(balanced.reason, 'zero-resultant');
  assert.equal(flowRecruitHeading(balanced, 0.75), Math.PI / 2);
});

test('valid flow applies the preregistered concentration-dependent spread', () => {
  const heading = flowRecruitHeading({ valid: true, R: 1, phi: 0.7 }, 0.75);
  assert.ok(Math.abs(heading - 0.85) < 1e-12);
});

test('heading variate must match one existing uniform draw', () => {
  assert.throws(() => flowRecruitHeading(null, 1), /U must be in/);
});
