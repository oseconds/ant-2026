import assert from 'node:assert/strict';
import test from 'node:test';
import { measureBinaryMask } from '../scripts/ant-material-morphology-metrics.js';

test('straight corridor reports exact area and two skeleton endpoints', () => {
  const mask = makeMask(7, 5);
  for (let x = 1; x <= 5; x += 1) set(mask, 7, x, 2);

  const result = measureBinaryMask({ width: 7, height: 5, mask });

  assert.equal(result.occupiedCellCount, 5);
  assert.equal(result.areaFraction, 5 / 35);
  assert.equal(result.foreground.componentCount, 1);
  assert.deepEqual(result.foreground.componentAreasDescending, [5]);
  assert.equal(result.foreground.components[0].boundingBoxFillFraction, 1);
  assert.equal(result.holes.beta1, 0);
  assert.equal(result.skeleton.cellCount, 5);
  assert.equal(result.skeleton.endpointCount, 2);
  assert.equal(result.skeleton.junctionNodeCount, 0);
  assert.equal(result.skeleton.graphCycleRank, 0);
  assertSkeletonTopology(result);
});

test('T corridor reports three endpoints and a junction proxy', () => {
  const mask = makeMask(7, 7);
  for (let x = 1; x <= 5; x += 1) set(mask, 7, x, 3);
  for (let y = 1; y <= 3; y += 1) set(mask, 7, 3, y);

  const result = measureBinaryMask({ width: 7, height: 7, mask });

  assert.equal(result.occupiedCellCount, 7);
  assert.equal(result.skeleton.endpointCount, 3);
  assert.equal(result.skeleton.junctionNodeCount, 1);
  assert.equal(result.skeleton.graphCycleRank, 0);
  assertSkeletonTopology(result);
});

test('closed ring has one true hole and one skeleton graph cycle', () => {
  const mask = makeMask(5, 5);
  for (let x = 1; x <= 3; x += 1) {
    set(mask, 5, x, 1);
    set(mask, 5, x, 3);
  }
  set(mask, 5, 1, 2);
  set(mask, 5, 3, 2);

  const result = measureBinaryMask({ width: 5, height: 5, mask });

  assert.equal(result.foreground.componentCount, 1);
  assert.equal(result.holes.beta1, 1);
  assert.deepEqual(result.holes.areasDescending, [1]);
  assert.equal(result.skeleton.endpointCount, 0);
  assert.equal(result.skeleton.graphCycleRank, 1);
  assertSkeletonTopology(result);
});

test('diagonal contact joins foreground without adding graph cycles', () => {
  const mask = makeMask(5, 5);
  for (let i = 0; i < 5; i += 1) set(mask, 5, i, i);

  const result = measureBinaryMask({ width: 5, height: 5, mask });

  assert.equal(result.foreground.connectivity, 8);
  assert.equal(result.foreground.componentCount, 1);
  assert.equal(result.holes.beta1, 0);
  assert.equal(result.skeleton.endpointCount, 2);
  assert.equal(result.skeleton.graphCycleRank, 0);
  assertSkeletonTopology(result);
});

test('filled 2x2 patch has no fake hole or skeleton graph cycle', () => {
  const mask = makeMask(4, 4);
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) set(mask, 4, x, y);
  const original = Uint8Array.from(mask);

  const result = measureBinaryMask({ width: 4, height: 4, mask });

  assert.equal(result.foreground.componentCount, 1);
  assert.equal(result.holes.beta1, 0);
  assert.equal(result.skeleton.graphCycleRank, 0);
  assert.ok(result.skeleton.cellCount >= 1);
  assert.equal(result.skeleton.graphComponentCount, 1);
  assert.ok(result.foreground.components[0].skeletonCellCount >= 1);
  assertSkeletonTopology(result);
  assert.deepEqual(mask, original);
});

test('isolated pixel remains one skeleton node and one graph component', () => {
  const mask = makeMask(3, 3);
  set(mask, 3, 1, 1);

  const result = measureBinaryMask({ width: 3, height: 3, mask });

  assert.equal(result.foreground.componentCount, 1);
  assert.equal(result.holes.beta1, 0);
  assert.equal(result.skeleton.cellCount, 1);
  assert.equal(result.skeleton.graphComponentCount, 1);
  assert.equal(result.skeleton.isolatedNodeCount, 1);
  assertSkeletonTopology(result);
});

test('thin branch adjacent to filled patch stays connected through thinning', () => {
  const width = 8, height = 6;
  const mask = makeMask(width, height);
  for (const [x, y] of [[1, 2], [2, 2], [1, 3], [2, 3], [3, 2], [4, 2], [5, 2], [6, 2]]) {
    set(mask, width, x, y);
  }

  const result = measureBinaryMask({ width, height, mask });

  assert.equal(result.foreground.componentCount, 1);
  assert.equal(result.holes.beta1, 0);
  assert.equal(result.skeleton.graphComponentCount, result.foreground.componentCount);
  assert.equal(result.skeleton.graphCycleRank, result.holes.beta1);
  assert.equal(result.skeleton.endpointCount, 2);
  assert.ok(result.skeleton.cellCount >= 5);
  assertSkeletonTopology(result);
});

test('thick ring retains one cycle while equally bounded filled blob has none', () => {
  const width = 9, height = 9, ring = makeMask(width, height), blob = makeMask(width, height);
  for (let y = 1; y <= 7; y += 1) for (let x = 1; x <= 7; x += 1) {
    set(blob, width, x, y);
    if (x < 3 || x > 5 || y < 3 || y > 5) set(ring, width, x, y);
  }

  const ringResult = measureBinaryMask({ width, height, mask: ring });
  const blobResult = measureBinaryMask({ width, height, mask: blob });

  assert.equal(ringResult.foreground.componentCount, 1);
  assert.equal(ringResult.holes.beta1, 1);
  assert.equal(ringResult.skeleton.graphComponentCount, 1);
  assert.equal(ringResult.skeleton.graphCycleRank, 1);
  assert.equal(blobResult.foreground.componentCount, 1);
  assert.equal(blobResult.holes.beta1, 0);
  assert.equal(blobResult.skeleton.graphComponentCount, 1);
  assert.equal(blobResult.skeleton.graphCycleRank, 0);
  assertSkeletonTopology(ringResult);
  assertSkeletonTopology(blobResult);
});

test('separated islands classify annulus adjacency and raster-boundary contact', () => {
  const width = 8, height = 7;
  const mask = makeMask(width, height), annulusMask = makeMask(width, height);
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) set(mask, width, x, y);
  set(mask, width, 5, 2);
  set(mask, width, 0, 5);
  set(annulusMask, width, 6, 2);

  const result = measureBinaryMask({ width, height, mask, annulusMask });

  assert.equal(result.foreground.componentCount, 3);
  assert.deepEqual(result.foreground.componentAreasDescending, [4, 1, 1]);
  assert.equal(result.foreground.boundaryTouchingComponentCount, 1);
  assert.equal(result.foreground.interiorComponentCount, 2);
  assert.equal(result.foreground.annulusAdjacentComponentCount, 1);
  assert.equal(result.foreground.isolatedComponentCount, 1);
  assert.equal(result.foreground.components[1].touchesAnnulus, true);
  assert.equal(result.foreground.components[2].touchesBoundary, true);
  assert.equal(result.skeleton.graphComponentCount, result.foreground.componentCount);
});

test('background opening to raster edge is not a hole', () => {
  const mask = makeMask(5, 5);
  mask.fill(1);
  set(mask, 5, 2, 2, 0);
  set(mask, 5, 1, 2, 0);
  set(mask, 5, 0, 2, 0);

  const result = measureBinaryMask({ width: 5, height: 5, mask });

  assert.equal(result.foreground.componentCount, 1);
  assert.equal(result.holes.beta1, 0);
  assertSkeletonTopology(result);
});

test('rejects malformed dimensions and masks', () => {
  assert.throws(() => measureBinaryMask({ width: 0, height: 2, mask: new Uint8Array(0) }), /positive safe integers/);
  assert.throws(() => measureBinaryMask({ width: 2, height: 2, mask: new Uint8Array(3) }), /length must equal/);
  assert.throws(() => measureBinaryMask({ width: 1, height: 1, mask: [2] }), /only 0 and 1/);
});

function makeMask(width, height) {
  return new Uint8Array(width * height);
}

function set(mask, width, x, y, value = 1) {
  mask[y * width + x] = value;
}

function assertSkeletonTopology(result) {
  assert.equal(result.skeleton.graphComponentCount, result.foreground.componentCount);
  assert.equal(result.skeleton.graphCycleRank, result.holes.beta1);
  assert.ok(result.foreground.components.every(component => component.skeletonCellCount >= 1));
}
