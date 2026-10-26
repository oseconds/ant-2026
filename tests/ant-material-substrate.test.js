import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMaterialSubstrate, MATERIAL_SUBSTRATE_PARAMETERS } from '../src/lib/renderers/antMaterialSubstrate.js';

function makeMaterial(width = 96, height = 96, rectangles = [[20, 25, 65, 70]]) {
  const topLayerByCell = new Int32Array(width * height).fill(-1);
  for (const [x0, y0, x1, y1] of rectangles) for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) topLayerByCell[y * width + x] = 0;
  }
  return { width, height, stratigraphy: { topLayerByCell } };
}

test('substrate field is deterministic, continuous, bounded, and independent of RNG or physical depth', () => {
  const input = makeMaterial(), random = Math.random;
  input.stratigraphy.totalDepthByCellMeters = new Float32Array(96 * 96).fill(9000);
  Math.random = () => { throw new Error('unexpected renderer random call'); };
  try {
    const a = buildMaterialSubstrate(input, 640, 640, 'substrate-relief-subtle');
    const b = buildMaterialSubstrate(input, 640, 640, 'substrate-relief-subtle');
    assert.deepEqual(a.signedDistance, b.signedDistance);
    assert.deepEqual(a.coverage, b.coverage);
    assert.deepEqual(a.directionalResponse, b.directionalResponse);
    assert.deepEqual(a.pixels, b.pixels);
    assert.ok(a.stats.influencePixels >= a.stats.nativeSupportPixels);
    assert.ok(a.stats.nonzeroInfluenceOutsideSupportPixels > 0);
    assert.ok(a.stats.gaussianDiscreteGainAt96GridCellPeriod.x < 0.04);
    assert.ok(a.stats.boundarySecondDifferenceRms.filteredLaplacianRms
      < a.stats.boundarySecondDifferenceRms.rawLaplacianRms);
    const empty = buildMaterialSubstrate(makeMaterial(96, 96, []), 640, 640, 'substrate-flat');
    assert.equal(empty.stats.nativeSupportPixels, 0);
    assert.equal(empty.stats.nonzeroAlphaPixels, 0);
    assert.equal(empty.stats.boundarySecondDifferenceRms.boundaryPixels, 0);
    assert.equal(empty.stats.boundarySecondDifferenceRms.rawLaplacianRms, 0);
    assert.equal(empty.stats.boundarySecondDifferenceRms.filteredLaplacianRms, 0);
  } finally { Math.random = random; }
});

test('Views 2–4 share one scalar field and differ only by fixed directional amplitude', () => {
  const input = makeMaterial(48, 48, [[10, 12, 37, 35]]);
  const flat = buildMaterialSubstrate(input, 192, 192, 'substrate-flat');
  const subtle = buildMaterialSubstrate(input, 192, 192, 'substrate-relief-subtle');
  const strong = buildMaterialSubstrate(input, 192, 192, 'substrate-relief-strong');
  for (const view of [subtle, strong]) {
    assert.deepEqual(view.support, flat.support);
    assert.deepEqual(view.rawSignedDistance, flat.rawSignedDistance);
    assert.deepEqual(view.signedDistance, flat.signedDistance);
    assert.deepEqual(view.coverage, flat.coverage);
    assert.deepEqual(view.directionalResponse, flat.directionalResponse);
  }
  assert.ok(subtle.stats.directionResponseMin < -0.5 && subtle.stats.directionResponseMax > 0.5);
  assert.ok(strong.stats.affectedPixelsVsFlat > subtle.stats.affectedPixelsVsFlat);
  assert.ok(Math.abs(subtle.stats.meanAlphaInfluence - flat.stats.meanAlphaInfluence) < 0.25);
  assert.ok(Math.abs(strong.stats.meanAlphaInfluence - flat.stats.meanAlphaInfluence) < 0.5);
  assert.equal(MATERIAL_SUBSTRATE_PARAMETERS.baseAlpha, 32);
  assert.equal(MATERIAL_SUBSTRATE_PARAMETERS.softAmplitude, 10);
  assert.equal(MATERIAL_SUBSTRATE_PARAMETERS.strongAmplitude, 24);
  assert.deepEqual(MATERIAL_SUBSTRATE_PARAMETERS.light, [Math.SQRT1_2, Math.SQRT1_2]);
  for (let pixel = 0; pixel < flat.support.length; pixel += 1) {
    const alpha = strong.pixels[pixel * 4 + 3];
    assert.ok(alpha <= 56 && alpha >= 0);
  }
  assert.ok(flat.stats.supportExpansionPixels + flat.stats.supportShrinkagePixels
    < flat.stats.influencePixels * 0.25, 'soft contour stays bounded relative to filled area');
});

test('a distant new material island leaves old field pixels byte-identical outside the registered influence radius', () => {
  const before = makeMaterial(96, 96, [[8, 25, 22, 42]]);
  const after = makeMaterial(96, 96, [[8, 25, 22, 42], [69, 25, 83, 42]]);
  const a = buildMaterialSubstrate(before, 640, 640, 'substrate-relief-strong');
  const b = buildMaterialSubstrate(after, 640, 640, 'substrate-relief-strong');
  for (let y = 0; y < 640; y += 1) for (let x = 0; x < 640; x += 1) {
    if (x > 200) continue;
    const pixel = y * 640 + x;
    assert.equal(b.pixels[pixel * 4 + 3], a.pixels[pixel * 4 + 3]);
    assert.equal(b.signedDistance[pixel], a.signedDistance[pixel]);
  }
});
