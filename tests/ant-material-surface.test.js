import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMaterialSurface } from '../src/lib/renderers/antMaterialSurface.js';

function material() {
  const topLayerByCell = new Int32Array(96 * 96).fill(-1);
  for (let y = 30; y <= 65; y += 1) for (let x = 20; x <= 75; x += 1) topLayerByCell[y * 96 + x] = 0;
  return { width: 96, height: 96, stratigraphy: { topLayerByCell } };
}

test('surface controls keep canonical nearest support, fixed fill, and a deterministic interior edge band', () => {
  const input = material(), random = Math.random;
  Math.random = () => { throw new Error('unexpected random call'); };
  try {
    const c = buildMaterialSurface(input, 640, 640, 'presence-20-sharp');
    const d = buildMaterialSurface(input, 640, 640, 'presence-20-edge');
    const e = buildMaterialSurface(input, 640, 640, 'presence-20-directional-edge');
    assert.deepEqual(e, buildMaterialSurface(input, 640, 640, 'presence-20-directional-edge'));
    assert.deepEqual([...d.support], [...c.support]);
    assert.deepEqual([...e.support], [...c.support]);
    assert.equal(c.stats.supportPixels, d.stats.supportPixels);
    assert.equal(d.stats.bandWidthPixels, 2);
    assert.ok(d.stats.bandPixels > 0 && d.stats.bandPixels < d.stats.supportPixels);
    for (let pixel = 0; pixel < c.support.length; pixel += 1) {
      const p = pixel * 4, occupied = c.support[pixel] === 1;
      assert.equal(c.fillPixels[p + 3], occupied ? 20 : 0);
      assert.equal(c.fillPixels[p], occupied ? 100 : 0);
      assert.equal(d.edgePixels[p + 3], d.band[pixel] ? 64 : 0);
      assert.equal(e.edgePixels[p + 3], d.edgePixels[p + 3]);
      assert.ok(!d.band[pixel] || occupied, 'edge stays inside support');
      assert.ok(occupied || (!d.edgePixels[p + 3] && !e.edgePixels[p + 3]), 'no edge pixels outside support');
    }
    assert.equal(d.stats.meanEdgeRgb, 80);
    assert.ok(e.stats.minEdgeRgb < 80 && e.stats.maxEdgeRgb > 80);
    assert.ok(Math.abs(e.stats.whiteCompositeMeanBoundaryDarkness - d.stats.whiteCompositeMeanBoundaryDarkness) < 0.1);
  } finally { Math.random = random; }
});
