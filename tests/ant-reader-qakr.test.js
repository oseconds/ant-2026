import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { basisSanity, basisWeight, qakrRead } from '../scripts/ant-reader-qakr.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FIXTURE = 'docs/ant/evidence/2026-10-24-ant-raster-backed-fixture';
const H = 1 / 95;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('QAKR basis passes fixed quadrature, symmetry, constant, zero, and node gates', () => {
  const receipt = basisSanity();
  assert.equal(receipt.passed, true);
  assert.equal(receipt.zeroRaster.exactZero, true);
  assert.equal(receipt.gridNode.exact, true);
  assert.ok(receipt.constantRaster.interiorMaxAbsError < 1e-12);
  assert.ok(receipt.constantRaster.boundaryMaxAbsError < 1e-12);
  assert.ok(Math.abs(receipt.quadrature.convergenceProbes.at(-1).diff24To48) < 1e-10);
  assert.ok(Math.abs(receipt.symmetry.rasterXReflectionResidual) < 1e-11);
  assert.ok(Math.abs(receipt.symmetry.rasterYReflectionResidual) < 1e-11);
  assert.ok(Math.abs(receipt.symmetry.rasterRotation90Residual) < 1e-11);
});

test('QAKR keeps positive cell weights and reads outside the observed square as empty', () => {
  assert.equal(basisWeight(0, 0), 1);
  assert.ok(Math.abs(basisWeight(H * 0.5, 0) - 0.5) < 1e-12);
  assert.ok(Math.abs(basisWeight(H * 0.5, H * 0.5) - 0.25) < 1e-12);
  const values = new Float32Array(96 * 96).fill(2);
  assert.equal(qakrRead(values, -Number.EPSILON, 0.5), 0);
  assert.equal(qakrRead(values, 0.5, 1 + Number.EPSILON), 0);
  assert.ok(qakrRead(values, 0.503, 0.507) >= 0);
  assert.throws(() => qakrRead(new Float32Array(95 * 96), 0.5, 0.5), /96x96/);
  values[0] = -1;
  assert.throws(() => qakrRead(values, 0, 0), /negative/);
});

test('QAKR consumes no RNG and leaves the exact shared raster bytes unchanged', () => {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, FIXTURE, 'manifest.json'), 'utf8'));
  const entry = manifest.rasters.find(item => item.id === 'straight|p00');
  const bytes = readFileSync(resolve(ROOT, FIXTURE, entry.file));
  assert.equal(sha256(bytes), entry.rasterSha256);
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Float32Array(entry.nodeCount);
  for (let index = 0; index < values.length; index += 1) values[index] = data.getFloat32(index * 4, true);
  const c = new PheromoneField({ width: entry.width, height: entry.height });
  c.values = values;
  const dRaster = values;
  const originalRandom = Math.random;
  let rngCalls = 0;
  Math.random = () => { rngCalls += 1; throw new Error('QAKR must not use RNG.'); };
  try {
    assert.equal(c.values, dRaster);
    for (const point of [[0.488, 0.497], [0.5, 0.5], [0.512, 0.506]]) {
      c.sample(...point);
      qakrRead(dRaster, ...point);
    }
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(rngCalls, 0);
  assert.equal(sha256(readFileSync(resolve(ROOT, FIXTURE, entry.file))), entry.rasterSha256);
});

test('current bilinear reader exactly reproduces all frozen production C queries', () => {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, FIXTURE, 'manifest.json'), 'utf8'));
  const rows = JSON.parse(gunzipSync(readFileSync(resolve(ROOT, FIXTURE, 'inputs/station-raw.json.gz'))).toString('utf8'));
  const entries = new Map(manifest.rasters.map(entry => [entry.id, entry]));
  const fields = new Map();
  let local = 0;
  let wide = 0;
  for (const row of rows) {
    const id = `${row.shape}|${row.phase}`;
    let field = fields.get(id);
    if (!field) {
      const entry = entries.get(id);
      const bytes = readFileSync(resolve(ROOT, FIXTURE, entry.file));
      assert.equal(sha256(bytes), entry.rasterSha256);
      const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const values = new Float32Array(entry.nodeCount);
      for (let index = 0; index < values.length; index += 1) values[index] = data.getFloat32(index * 4, true);
      field = new PheromoneField({ width: entry.width, height: entry.height });
      field.values = values;
      fields.set(id, field);
    }
    for (let index = 0; index < row.localGeometry.length; index += 1) {
      const point = row.localGeometry[index];
      assert.equal(field.sample(point.x, point.y), row.localProductionRaw[index]);
      local += 1;
    }
    for (let candidate = 0; candidate < row.wideGeometry.length; candidate += 1) {
      const reads = row.wideGeometry[candidate].reads;
      for (let index = 0; index < reads.length; index += 1) {
        assert.equal(field.sample(reads[index].x, reads[index].y), row.wideProduction[candidate].raw[index]);
        wide += 1;
      }
    }
  }
  assert.equal(local, 99_792);
  assert.equal(wide, 138_600);
});
