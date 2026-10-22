import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSnapshot, PHEROMONE_RADII, DESCRIPTOR_SECTOR_COUNT } from '../scripts/ant-recruitment-descriptors.js';

const nest = { x: 0.5, y: 0.72 };
const agent = (x, y, dx = 0, dy = 0) => ({ x, y, dx, dy });
const close = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);

test('empty and missing movement states are explicit', () => {
  const empty = describeSnapshot([]);
  assert.equal(empty.ants.centroid, null);
  assert.equal(empty.ants.majorAxisAngle, null);
  assert.equal(empty.ants.nestNearFraction, null);
  assert.equal(empty.ants.velocityPolarization, null);
  assert.equal(empty.ants.angularMomentum, null);
  assert.equal(empty.pheromone.centroid, null);
  assert.equal(empty.pheromone.activation, null);
  const withoutDelta = describeSnapshot([{ x: .6, y: .72 }]);
  assert.equal(withoutDelta.ants.velocityPolarization, null);
  assert.equal(withoutDelta.ants.movementSampleCount, 0);
});

test('isotropic and cancelled angular samples have undefined orientations', () => {
  const cardinal = [agent(.6, .72), agent(.4, .72), agent(.5, .82), agent(.5, .62)];
  const ants = describeSnapshot(cardinal).ants;
  assert.equal(ants.majorAxisAngle, null);
  const width = 101, height = 101, values = new Float32Array(width * height);
  for (const [x, y] of [[56, 72], [44, 72], [50, 78], [50, 66]]) values[y * width + x] = 1;
  const pheromone = describeSnapshot([], { pheromone: { width, height, values } }).pheromone;
  assert.equal(pheromone.orientation, null);
  assert.equal(pheromone.sectors.length, DESCRIPTOR_SECTOR_COUNT);
});

test('northward pheromone sector has bounded activation and north orientation', () => {
  const width = 101, height = 101, values = new Float32Array(width * height);
  for (const r of PHEROMONE_RADII) {
    const x = Math.round(nest.x * (width - 1));
    const y = Math.round((nest.y - r) * (height - 1));
    values[y * width + x] = 0.04;
  }
  const p = describeSnapshot([], { pheromone: { width, height, values } }).pheromone;
  assert.ok(p.activation > 0 && p.activation <= 1);
  assert.ok(p.orientation);
  close(p.orientation.angle, -Math.PI / 2, 0.08);
});

test('translation and rotation preserve ant shape moments and rotate its axis', () => {
  const pair = [agent(.6, .72), agent(.4, .72)];
  const first = describeSnapshot(pair).ants;
  close(first.centroid.x, nest.x); close(first.centroid.y, nest.y);
  close(first.gyrationRadius, .1); close(first.covarianceEigenvalues.major, .01);
  const rotated = describeSnapshot([agent(.5, .82), agent(.5, .62)]).ants;
  close(rotated.gyrationRadius, first.gyrationRadius);
  close(rotated.covarianceEigenvalues.major, first.covarianceEigenvalues.major);
  close(rotated.majorAxisAngle, Math.PI / 2);
  const translatedCluster = describeSnapshot([agent(.8, .72), agent(.8, .72)]).ants;
  close(translatedCluster.gyrationRadius, 0);
  close(translatedCluster.rmsRadiusFromNest, .3);
});

test('stationary agents have no polarization; actual displacements set flow and angular momentum', () => {
  const stationary = describeSnapshot([agent(.6, .72)]).ants;
  assert.equal(stationary.velocityPolarization, null);
  const clockwise = describeSnapshot([agent(.6, .72, 0, 0.01)]).ants;
  close(clockwise.velocityPolarization.magnitude, 1);
  close(clockwise.angularMomentum.signed, 1);
  close(clockwise.angularMomentum.absolute, 1);
  close(clockwise.meanSpeed, .01);
  const outward = describeSnapshot([agent(.6, .72, .01, 0)]);
  close(outward.flow[2].outwardFraction, 1);
  close(outward.flow[2].meanRadialSpeed, .01);
  const noVelocityFallback = describeSnapshot([{ x: .6, y: .72, vx: 0, vy: 1, heading: Math.PI / 2 }]).ants;
  assert.equal(noVelocityFallback.velocityPolarization, null);
});
