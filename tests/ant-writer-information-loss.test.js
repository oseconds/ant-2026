import test from 'node:test';
import assert from 'node:assert/strict';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import {
  CENTER_NODE,
  GRID_SIZE,
  GRID_PITCH,
  PRODUCTION_RADIUS,
  SEGMENT_LENGTHS,
  depositPointObserved,
  rasterFootprintSignature,
  rasterSha256,
  rasterMetrics,
  runSegmentArm,
  rotateRaster90,
  mirrorRasterX,
  verifyProductionSourceHashes
} from '../scripts/ant-writer-information-loss.js';

test('single-point writer output collapses supported and fallback positions to one exact nearest-node footprint', () => {
  const center = { x: CENTER_NODE * GRID_PITCH, y: CENTER_NODE * GRID_PITCH };
  const edge = GRID_PITCH / 2 - 1e-6;
  const fieldA = new PheromoneField({ width: GRID_SIZE, height: GRID_SIZE });
  const fieldB = new PheromoneField({ width: GRID_SIZE, height: GRID_SIZE });

  const supported = depositPointObserved(fieldA, center, 1, PRODUCTION_RADIUS);
  const fallback = depositPointObserved(fieldB, { x: center.x + edge, y: center.y + edge }, 1, PRODUCTION_RADIUS);

  assert.equal(supported.supportNodeIds.length, 1);
  assert.equal(supported.fallback, false);
  assert.equal(fallback.supportNodeIds.length, 0);
  assert.equal(fallback.fallback, true);
  assert.deepEqual(supported.affectedNodeIds, fallback.affectedNodeIds);
  assert.equal(supported.rasterFootprintSignature, fallback.rasterFootprintSignature);
  assert.equal(rasterFootprintSignature(fieldA.values), rasterFootprintSignature(fieldB.values));
  assert.equal(supported.acceptedDose, 1);
  assert.equal(fallback.storedMass, 1);
  assert.equal(supported.centroidDisplacement, 0);
  assert.ok(fallback.centroidDisplacement > 0);
});

test('stored-raster centroid and dose metrics use exact Float32 node values', () => {
  const field = new PheromoneField({ width: GRID_SIZE, height: GRID_SIZE });
  const x = CENTER_NODE * GRID_PITCH;
  const y = CENTER_NODE * GRID_PITCH;
  depositPointObserved(field, { x, y }, 0.25, PRODUCTION_RADIUS);
  depositPointObserved(field, { x, y }, 0.5, PRODUCTION_RADIUS);

  const metrics = rasterMetrics(field.values, GRID_SIZE, GRID_SIZE);
  assert.equal(metrics.totalStoredMass, 0.75);
  assert.equal(metrics.centroid.x, x);
  assert.equal(metrics.centroid.y, y);
  assert.equal(metrics.nonzeroNodeCount, 1);
  assert.ok(Number.isFinite(metrics.maximumCell));
});

test('production segment writer preserves exact 90-degree rotation and mirror transforms for symmetric interior arms', () => {
  const length = SEGMENT_LENGTHS[1];
  const horizontal = runSegmentArm({ length, angleRadians: 0 });
  const vertical = runSegmentArm({ length, angleRadians: Math.PI / 2 });
  const positive = runSegmentArm({ length, angleRadians: Math.PI / 4 });
  const negative = runSegmentArm({ length, angleRadians: -Math.PI / 4 });

  assert.deepEqual(rotateRaster90(horizontal.values, GRID_SIZE, CENTER_NODE), vertical.values);
  assert.deepEqual(mirrorRasterX(positive.values, GRID_SIZE, CENTER_NODE), negative.values);
  assert.equal(horizontal.dabCount, 5);
  assert.equal(horizontal.acceptedDose, horizontal.requestedDose);
  assert.equal(horizontal.cappedCellCount, 0);
  assert.equal(vertical.rasterSha256, rasterSha256(vertical.values));
});

test('principal raster-axis error treats line orientation as pi-periodic', () => {
  const negative45FromHorizontal = runSegmentArm({
    length: SEGMENT_LENGTHS[0],
    angleRadians: -Math.PI / 4,
    phase: { dx: GRID_PITCH / 2, dy: 0 }
  });

  assert.equal(negative45FromHorizontal.metrics.principalOrientationRadians, 0);
  assert.ok(Math.abs(negative45FromHorizontal.principalOrientationErrorRadians - Math.PI / 4) < 1e-12);
});

test('writer study is deterministic and production source hashes remain pinned', () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('RNG must not be consumed'); };
  try {
    const args = { length: SEGMENT_LENGTHS[0], angleRadians: Math.PI / 4 };
    const first = runSegmentArm(args);
    const second = runSegmentArm(args);
    assert.equal(first.rasterSha256, second.rasterSha256);
    assert.equal(first.rasterFootprintSignature, second.rasterFootprintSignature);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(verifyProductionSourceHashes().passed, true);
});
