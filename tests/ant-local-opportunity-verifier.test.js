import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCapture } from '../scripts/verify-ant-local-opportunity-audit.js';

test('independent X check rejects a connected but incomplete disk component and wrong material arithmetic', () => {
  const F = new Uint8Array(9216), layers = new Uint16Array(9216); F[1000] = F[1001] = 1; layers[1000] = 2;
  const capture = { cells: [1000, 1001], nodeCount: 2, connected: true, radiusValid: true,
    centers: [{ index: 1000 }, { index: 1001 }], material: { overlapFraction: .5, meanLayers: 1, maxLayers: 2 } };
  assert.equal(verifyCapture(capture, F, layers), 2);
  assert.throws(() => verifyCapture({ ...capture, material: { ...capture.material, meanLayers: 0 } }, F, layers));
  assert.throws(() => verifyCapture({ ...capture, cells: [1000], nodeCount: 1, centers: [{ index: 1000 }],
    material: { overlapFraction: 1, meanLayers: 2, maxLayers: 2 } }, F, layers), /maximal/);
});
