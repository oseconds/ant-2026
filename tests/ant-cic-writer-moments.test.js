import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { CicPheromoneField } from '../scripts/ant-cic-writer.js';
import { runMomentGate } from '../scripts/ant-cic-writer-moments.js';

test('Gate 1 preserves CIC dose and physical first moments within derived Float32 bounds', async () => {
  const root = process.cwd();
  const streams = JSON.parse(await readFile(join(root, 'docs/ant/evidence/2026-10-24-ant-cic-writer-qualification/inputs/raster-fixture/validation/write-streams-preflight.json'), 'utf8'));
  const outputDir = await mkdtemp(join(tmpdir(), 'ant-cic-gate1-'));
  try {
    const result = await runMomentGate({ streams, outputDir });
    assert.equal(result.gate, 'Gate 1');
    assert.equal(result.status, 'PASS');
    assert.equal(result.pointWrites, 49152);
    assert.equal(result.routeArms, 24);
    assert.equal(result.routeWriteCount, 1848);
    assert.equal(result.cappedTargetArms, 0);
    assert.equal(result.passed, true);
    assert.equal(result.capStress.passed, true);
    assert.ok(result.checks.every((check) => check.passed));
    assert.ok(result.maxima.storedMassResidualWithinBound);
    assert.ok(result.maxima.rawXMomentResidualWithinBound);
    assert.ok(result.maxima.rawYMomentResidualWithinBound);
    assert.ok(result.maxima.centroidXResidualWithinBound);
    assert.ok(result.maxima.centroidYResidualWithinBound);
    const phases = { p00: [0, 0], p10: [0.5 / 95, 0], p01: [0, 0.5 / 95], p11: [0.5 / 95, 0.5 / 95] };
    for (const cell of result.point.cases) {
      assert.equal(cell.writes, 4096);
      assert.equal(cell.acceptedWrites, 4096);
      assert.equal(cell.failedWrites, 0);
      assert.ok(cell.gridPitchSpanX < 1);
      assert.ok(cell.gridPitchSpanY < 1);
      const [dx, dy] = phases[cell.phase];
      assert.equal(cell.xRange[0], (48 + 0.5 / 64 - 0.5) / 95 + dx);
      assert.equal(cell.xRange[1], (48 + 63.5 / 64 - 0.5) / 95 + dx);
      assert.equal(cell.yRange[0], (48 + 0.5 / 64 - 0.5) / 95 + dy);
      assert.equal(cell.yRange[1], (48 + 63.5 / 64 - 0.5) / 95 + dy);
      assert.ok(Number.isFinite(cell.maxima.maxCentroidXResidual));
      assert.ok(Number.isFinite(cell.maxima.maxCentroidYResidual));
    }
    const artifact = gunzipSync(await readFile(join(outputDir, 'gate1.json.gz'))).toString('utf8');
    assert.equal(JSON.parse(artifact).elapsedMs, undefined);
    assert.ok(Number.isFinite(JSON.parse(await readFile(join(outputDir, 'run-metadata.json'), 'utf8')).elapsedMs));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('Gate 1 detects the production brush as a negative control', async () => {
  const root = process.cwd();
  const streams = JSON.parse(await readFile(join(root, 'docs/ant/evidence/2026-10-24-ant-cic-writer-qualification/inputs/raster-fixture/validation/write-streams-preflight.json'), 'utf8'));
  const outputDir = await mkdtemp(join(tmpdir(), 'ant-cic-gate1-negative-'));
  const cicBrush = CicPheromoneField.prototype.depositBrush;
  try {
    CicPheromoneField.prototype.depositBrush = PheromoneField.prototype.depositBrush;
    const result = await runMomentGate({ streams, outputDir });
    assert.equal(result.passed, false);
    assert.equal(result.checks.find((check) => check.id.startsWith('49,152 point writes')).passed, false);
    assert.ok(result.point.cases.some((cell) => cell.failedWrites > 0));
  } finally {
    CicPheromoneField.prototype.depositBrush = cicBrush;
    await rm(outputDir, { recursive: true, force: true });
  }
});
