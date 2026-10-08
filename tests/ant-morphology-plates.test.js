import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCurvatureAtScale, analyzePlate } from '../scripts/ant-morphology-plates.js';

const grid = 96;
const at = (x, y) => y * grid + x;
const point = (x, y, halfWidth = 0.02) => ({ index: at(x, y), x: x / 95, y: y / 95, halfWidth });

function descriptor() {
  const center = point(10, 10, 0.021), left = point(9, 10, 0.012), right = point(11, 10, 0.030);
  const up = point(10, 9, 0.02), down = point(10, 11, 0.02);
  const nodes = [left, center, right, up, down];
  const mask = new Array(grid ** 2).fill(0);
  for (const node of nodes) mask[node.index] = 1;
  return { id: 'test', bornAtSimulationTimeMs: 10, grid: { width: grid, height: grid }, mask,
    centerline: nodes, edges: [[left.index, center.index], [center.index, right.index],
      [up.index, center.index], [center.index, down.index]],
    principalPath: [left.index, center.index, right.index], widths: nodes.map(node => node.halfWidth),
    pickups: [{ x: left.x, y: left.y }, { x: right.x, y: right.y }],
    material: { stiffness: 0.9, density: 1.1, damping: 0.3 } };
}

test('measures principal geometry and flags a pixel-graph junction cluster', () => {
  const result = analyzePlate(descriptor());
  assert.ok(Math.abs(result.measures.principalPathLengthWorldUnits - 2 / 95) < 1e-12);
  assert.equal(result.measures.principalTortuosity, 1);
  assert.equal(result.measures.network.edgeCount, 4);
  assert.equal(result.measures.network.junctionNodeCount, 1);
  assert.equal(result.measures.network.junctionClusterCount, 1);
  assert.equal(result.measures.network.junctionClusters[0].length, 1);
});

test('reports clamp saturation, footprint convention, and overlap without a class threshold', () => {
  const plate = descriptor(), indexes = plate.mask.flatMap((value, index) => value ? [index] : []);
  const result = analyzePlate(plate, new Set([indexes[0]]), [new Set(indexes.slice(0, 2))]);
  assert.equal(result.measures.widths.lowClampCount, 1);
  assert.equal(result.measures.widths.highClampCount, 1);
  assert.equal(result.measures.footprint.normalizedArea, indexes.length / 95 ** 2);
  assert.equal(result.measures.overlap.priorUnionOverlapCells, 1);
  assert.equal(result.measures.overlap.newlyOccupiedCells, indexes.length - 1);
  assert.equal(result.measures.overlap.maxEarlierMaskIoU, 2 / 5);
  assert.equal(result.measures.overlap.exactEarlierMaskMatch, false);
});

test('empty masks and paths outside the archived centerline fail explicitly', () => {
  const empty = descriptor(); empty.mask.fill(0);
  assert.throws(() => analyzePlate(empty), /maskIndices/);
  const invalidPath = descriptor(); invalidPath.principalPath[1] = 0;
  assert.throws(() => analyzePlate(invalidPath), /principal path/);
});

test('arc-length curvature keeps straight paths straight and recovers circular turning', () => {
  const straight = Array.from({ length: 101 }, (_, index) => ({ x: index / 100, y: 0.4 }));
  for (const spacing of [0.03, 0.10]) {
    const result = analyzeCurvatureAtScale(straight, spacing);
    assert.equal(result.absoluteTurnRadians, 0);
    assert.equal(result.angleDistributionRadians.absolute.max, 0);
  }
  const circle = Array.from({ length: 1001 }, (_, index) => {
    const angle = 2 * Math.PI * index / 1000;
    return { x: 0.5 + 0.2 * Math.cos(angle), y: 0.5 + 0.2 * Math.sin(angle) };
  });
  for (const spacing of [0.03, 0.10]) {
    const result = analyzeCurvatureAtScale(circle, spacing);
    assert.ok(result.signedTurnRadians > 5.2 && result.signedTurnRadians < 6.4);
    assert.ok(Math.abs(result.absoluteTurnRadians - result.signedTurnRadians) < 1e-9);
    assert.equal(result.angleDistributionRadians.signed.n, result.sampleCount - 2);
  }
});

test('coarse arc-length spacing reduces staircase turn inflation', () => {
  const staircase = Array.from({ length: 81 }, (_, x) => ({ x: x / 95, y: Math.round(x * 0.4) / 95 }));
  const headings = staircase.slice(1).map((point, index) => Math.atan2(
    point.y - staircase[index].y, point.x - staircase[index].x));
  const rawTurn = headings.slice(1).reduce((sum, heading, index) => sum + Math.abs(Math.atan2(
    Math.sin(heading - headings[index]), Math.cos(heading - headings[index]))), 0);
  const at03 = analyzeCurvatureAtScale(staircase, 0.03).absoluteTurnRadians;
  const at10 = analyzeCurvatureAtScale(staircase, 0.10).absoluteTurnRadians;
  assert.ok(rawTurn > 20);
  assert.ok(at03 < rawTurn);
  assert.ok(at10 < at03);
});
