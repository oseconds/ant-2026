import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMaterialReadoutMask, buildScreenedPheromoneAlpha, mixPheromoneAlpha } from '../src/lib/renderers/materialConditionedPheromone.js';

function rectangularMaterial(size, left, top, right, bottom) {
  const topLayerByCell = new Int32Array(size * size).fill(-1);
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
    topLayerByCell[y * size + x] = 0;
  }
  return { width: size, height: size, topLayerByCell };
}

test('readout mask is deterministic, Euclidean, four-pixel wide, and never leaves support', () => {
  const material = rectangularMaterial(7, 1, 1, 5, 5);
  const first = buildMaterialReadoutMask(material, 7, 7), again = buildMaterialReadoutMask(structuredClone(material), 7, 7);
  assert.deepEqual(first.weights, again.weights);
  assert.equal(first.stats.supportPixels, 25);
  assert.equal(first.stats.boundaryPixels, 16);
  assert.equal(first.weights[3 * 7 + 1], 0, 'raster boundary has baseline-only weight');
  assert.equal(first.insideDistance[3 * 7 + 2], 1);
  assert.equal(first.weights[3 * 7 + 2], 0.15625);
  assert.equal(first.insideDistance[3 * 7 + 3], 2);
  assert.equal(first.weights[3 * 7 + 3], 0.5);
  assert.ok(first.weights.every((weight, index) => first.support[index] || weight === 0));
});

test('empty support produces no blend mask and invalid occupancy is rejected', () => {
  const empty = buildMaterialReadoutMask(rectangularMaterial(4, 1, 1, 0, 0), 12, 12);
  assert.equal(empty.stats.supportPixels, 0);
  assert.ok(empty.weights.every(weight => weight === 0));
  assert.throws(() => buildMaterialReadoutMask({ width: 2, height: 2, topLayerByCell: [0] }, 4, 4), /Invalid material/);
});

test('4×4 ordered screen uses a fixed 8×8 native period and preserves zero alpha', () => {
  const width = 16, height = 16, baseline = new Uint8ClampedArray(width * height).fill(56);
  const first = buildScreenedPheromoneAlpha(baseline, width, height);
  const again = buildScreenedPheromoneAlpha(baseline, width, height);
  assert.deepEqual(first, again);
  assert.ok(first.every(alpha => alpha === 0 || alpha === 112));
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
    assert.equal(first[y * width + x], first[(y + 8) * width + x]);
    assert.equal(first[y * width + x], first[y * width + x + 8]);
    assert.equal(first[y * width + x], first[(y ^ 1) * width + x]);
    assert.equal(first[y * width + x], first[y * width + (x ^ 1)]);
  }
  const screenedPixels = first.reduce((sum, alpha) => sum + Number(alpha === 112), 0);
  assert.equal(screenedPixels, 128, 'constant half alpha covers half of every 8×8 period');
  baseline[0] = 0;
  assert.equal(buildScreenedPheromoneAlpha(baseline, width, height)[0], 0);
});

test('pixel alpha mix changes only active weighted locations and keeps zero-signal pixels identical', () => {
  const baseline = Uint8ClampedArray.from([0, 32, 64, 112]);
  const alternate = Uint8ClampedArray.from([112, 112, 0, 0]);
  const weights = Float32Array.from([1, 0.5, 0.25, 0]);
  const mixed = mixPheromoneAlpha(baseline, alternate, weights);
  assert.deepEqual([...mixed.alpha], [0, 72, 48, 112]);
  assert.deepEqual([...mixed.effectiveWeights], [0, 0.5, 0.25, 0]);
  assert.throws(() => mixPheromoneAlpha(baseline, alternate.subarray(1), weights), /lengths must match/);
});
