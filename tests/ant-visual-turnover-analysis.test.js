import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTopPartitions, identityTurnover, maskIoU, unionChange } from '../scripts/ant-visual-turnover-analysis.js';
import { largestEmptyComponent } from '../scripts/ant-visual-geometry-supplement.js';

test('mask geometry is identity independent and IoU handles identical and disjoint masks', () => {
  const a = Uint8Array.from([1, 1, 0, 0]);
  const renamed = Uint8Array.from([1, 1, 0, 0]);
  const disjoint = Uint8Array.from([0, 0, 1, 1]);
  assert.equal(maskIoU(a, renamed), 1);
  assert.equal(maskIoU(a, disjoint), 0);
  assert.deepEqual(identityTurnover(['old-1'], ['new-1']), {
    retainedIds: [], newIds: ['new-1'], retiredIds: ['old-1'],
  });
});

test('union change distinguishes replacement from actual new area', () => {
  assert.deepEqual(unionChange([1, 1, 0, 0], [0, 0, 1, 1]), {
    retainedCells: 0, newCells: 2, lostCells: 2, netAreaChange: 0,
  });
  assert.deepEqual(unionChange([1, 1, 0, 0], [1, 1, 1, 0]), {
    retainedCells: 2, newCells: 1, lostCells: 0, netAreaChange: 1,
  });
});

test('top partition comparison ignores pure Plate ID renaming', () => {
  const a = ['a', 'a', 'b', 'a', 'a', 'b'];
  const renamed = ['x', 'x', 'y', 'x', 'x', 'y'];
  const result = compareTopPartitions(a, renamed, 3, 2);
  assert.equal(result.identityAgreementFraction, 0);
  assert.equal(result.boundaryIoU, 1);
  assert.equal(result.adjustedRandIndex, 1);
});

test('top partition comparison detects a changed partition and defines empty common support', () => {
  const vertical = ['a', 'b', 'a', 'b'];
  const horizontal = ['x', 'x', 'y', 'y'];
  const changed = compareTopPartitions(vertical, horizontal, 2, 2);
  assert.equal(changed.boundaryIoU, 0);
  assert.ok(Math.abs(changed.adjustedRandIndex + 0.5) < 1e-12);
  const empty = compareTopPartitions([null, null], [null, null], 2, 1);
  assert.equal(empty.commonOccupiedCells, 0);
  assert.equal(empty.boundaryIoU, null);
  assert.equal(empty.adjustedRandIndex, null);
});

test('negative-space component uses four-neighbor connectivity and grid-point centroids', () => {
  const material = Uint8Array.from([0, 0, 0, 1, 1, 1, 0, 0, 0]);
  assert.deepEqual(largestEmptyComponent(material, 3, 3), {
    emptyComponentCount: 2,
    largestEmptyComponent: { areaCells: 3, centroid: { x: 0.5, y: 0 } },
  });
});
