import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const PROJECT_ROOT = process.cwd();
const EVIDENCE_ROOT = path.join(PROJECT_ROOT,
  'docs/ant/evidence/2026-10-23-natural-field-transfer');
const MATRIX_DIR = path.join(EVIDENCE_ROOT, 'capture/matrix-20261023');
const PHASE_DIR = path.join(EVIDENCE_ROOT, 'phase');
const RUNS_DIR = path.join(PHASE_DIR, 'runs');
const MATRIX_MANIFEST_PATH = path.join(MATRIX_DIR, 'matrix-manifest.json');
const OUTPUT_PATH = path.join(PHASE_DIR, 'phase-cohort-20261023-manifest.json');
const EXPECTED_MATRIX_SHA256 = '8ea739584be0425ba9e2d166a4af04b4a84d4d3ccb6228ef6745026ad9a4ade3';
const MAX_COMPRESSED_BYTES = 100 * 1024 * 1024;
const MODES = ['production', 'dtFeedback', 'dampingOff'];
const PHASE_IDS = ['p00', 'p10', 'p01', 'p11'];
const REQUIRED_BASELINE_FLAGS = [
  'preStateExact', 'preRngExact', 'preTickPublicSnapshotEqual',
  'instrumentedVsPlainPostStateExact', 'instrumentedVsPlainPostRngExact',
  'instrumentedVsPlainPostSnapshotEqual'
];
const RUNNER_REVISIONS = new Map([
  ['68941ffd288208c8b8c8410d7aa0be757a0b2fa902da9f1d2c3699ea880024b9', {
    sourcePath: 'scripts/ant-transfer-phase-runs.js',
    preservedCopyPath: 'docs/ant/evidence/2026-10-23-natural-field-transfer/phase/runner-revisions/ant-transfer-phase-runs-68941ffd.js',
    scopeNote: 'Initial result-binding correction; 100 MiB cap applied to compressed and uncompressed output JSON.'
  }],
  ['ff6654196ab5fe66a3a8fcf30f600d3be86deee742054a41b6617cb9675c5f06', {
    sourcePath: 'scripts/ant-transfer-phase-runs.js',
    preservedCopyPath: 'docs/ant/evidence/2026-10-23-natural-field-transfer/phase/runner-revisions/ant-transfer-phase-runs-ff665419.js',
    scopeNote: 'Packaging-only output change: retained 100 MiB compressed cap and permitted larger uncompressed output JSON.'
  }],
  ['0a87bf61adc59529c6fe60a588e0d453cd7cf35c7cfc80479e9c0545b36975cb', {
    sourcePath: 'scripts/ant-transfer-phase-runs.js',
    preservedCopyPath: 'docs/ant/evidence/2026-10-23-natural-field-transfer/phase/runner-revisions/ant-transfer-phase-runs-0a87bf61.js',
    scopeNote: 'Packaging-integrity change: compressed cap plus manifest-declared exact input inflation bounds.'
  }]
]);

export async function buildPhaseCohortManifest() {
  const matrixManifestBytes = await readFile(MATRIX_MANIFEST_PATH);
  const matrixManifestSha256 = sha256(matrixManifestBytes);
  assert.equal(matrixManifestSha256, EXPECTED_MATRIX_SHA256,
    'The frozen Stage A matrix manifest changed.');
  const matrixManifest = JSON.parse(matrixManifestBytes.toString('utf8'));
  assert.equal(matrixManifest.schema, 'ant-natural-field-transfer-matrix-manifest/v1');
  assert.equal(matrixManifest.captures.length, 66, 'Expected the complete 66-state matrix.');

  const runFiles = (await readdir(RUNS_DIR)).filter(name =>
    name.endsWith('-default-gaussian-phase-qualification.json.gz'));
  assert.equal(runFiles.length, matrixManifest.captures.length,
    'Phase run directory must contain exactly one receipt for each matrix capture.');

  const receipts = [];
  const runnerGroups = new Map([...RUNNER_REVISIONS].map(([hash]) => [hash, []]));
  const modeParityCounts = Object.fromEntries(MODES.map(mode => [mode,
    { gatePassed: 0, traceExact: 0, stateExact: 0, snapshotExact: 0, rngExact: 0 }]));
  const phaseIdsPresentCounts = Object.fromEntries(PHASE_IDS.map(id => [id, 0]));
  const phaseArmCounts = Object.fromEntries(PHASE_IDS.map(id => [id, 0]));
  const sampleCountsByPhase = Object.fromEntries(PHASE_IDS.map(id => [id,
    { total: 0, interiorAllPhases: 0, boundaryExposed: 0 }]));
  let matrixSourceHashes = null;
  let phaseHelperSha256 = null;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;
  let maxCompressedBytes = 0;
  let maxUncompressedBytes = 0;

  for (const stateReceipt of matrixManifest.captures) {
    const captureId = stateReceipt.captureId;
    const outputPath = path.join(RUNS_DIR,
      `${captureId}-default-gaussian-phase-qualification.json.gz`);
    const relativeOutputPath = path.relative(PROJECT_ROOT, outputPath).replaceAll(path.sep, '/');
    const row = await inspectReceipt({ captureId, outputPath, relativeOutputPath,
      stateReceipt, matrixManifestSha256, runnerGroups });

    if (!matrixSourceHashes) matrixSourceHashes = row.matrixSourceHashes;
    else assert.deepEqual(row.matrixSourceHashes, matrixSourceHashes,
      `${captureId}: frozen matrix source hashes changed within the cohort.`);
    if (!phaseHelperSha256) phaseHelperSha256 = row.phaseHelperSha256;
    assert.equal(row.phaseHelperSha256, phaseHelperSha256,
      `${captureId}: phase helper source changed within the cohort.`);
    assert.equal(row.matrixGitHead, matrixManifest.protocol.gitHead,
      `${captureId}: matrix Git HEAD differs from the frozen protocol.`);
    assert.equal(row.matrixManifestSha256, matrixManifestSha256);
    assert.equal(row.phaseZeroPassed, true, `${captureId}: phase-zero gate did not pass.`);
    assert.equal(row.p00RasterExact, true, `${captureId}: phase-zero raster was not exact.`);
    assert.equal(row.armCount, 12, `${captureId}: expected three movement modes across four phases.`);
    assert.deepEqual(row.phaseIds, PHASE_IDS);

    for (const mode of MODES) {
      const comparison = row.p00Comparisons[mode];
      assert.ok(comparison, `${captureId}: missing phase-zero comparison for ${mode}.`);
      for (const key of ['gatePassed', 'traceExact', 'stateExact', 'snapshotExact', 'rngExact']) {
        assert.equal(comparison[key], true, `${captureId}/${mode}: ${key} did not pass.`);
        modeParityCounts[mode][key === 'gatePassed' ? 'gatePassed'
          : key === 'traceExact' ? 'traceExact'
            : key === 'stateExact' ? 'stateExact'
              : key === 'snapshotExact' ? 'snapshotExact' : 'rngExact'] += 1;
      }
    }

    for (const phaseId of row.phaseIds) {
      phaseIdsPresentCounts[phaseId] += 1;
      phaseArmCounts[phaseId] += row.phaseArmCounts[phaseId];
      for (const key of ['total', 'interiorAllPhases', 'boundaryExposed']) {
        sampleCountsByPhase[phaseId][key] += row.sampleCountsByPhase[phaseId][key];
      }
    }
    totalCompressedBytes += row.compressedBytes;
    totalUncompressedBytes += row.uncompressedBytes;
    maxCompressedBytes = Math.max(maxCompressedBytes, row.compressedBytes);
    maxUncompressedBytes = Math.max(maxUncompressedBytes, row.uncompressedBytes);
    receipts.push(row);
    if (typeof globalThis.gc === 'function') globalThis.gc();
  }

  const runnerRevisions = [...runnerGroups.entries()].map(([hash, captureIds]) => {
    const revision = RUNNER_REVISIONS.get(hash);
    return { sha256: hash, ...revision, receiptCount: captureIds.length, captureIds };
  });
  const expectedRevisionCounts = new Map([
    ['68941ffd288208c8b8c8410d7aa0be757a0b2fa902da9f1d2c3699ea880024b9', 9],
    ['ff6654196ab5fe66a3a8fcf30f600d3be86deee742054a41b6617cb9675c5f06', 12],
    ['0a87bf61adc59529c6fe60a588e0d453cd7cf35c7cfc80479e9c0545b36975cb', 45]
  ]);
  for (const revision of runnerRevisions) {
    assert.equal(revision.receiptCount, expectedRevisionCounts.get(revision.sha256),
      `Unexpected number of receipts using runner ${revision.sha256}.`);
    assert.equal(sha256(await readFile(path.join(PROJECT_ROOT, revision.preservedCopyPath))), revision.sha256,
      `Preserved runner copy hash mismatch for ${revision.sha256}.`);
  }
  assert.equal(sha256(await readFile(path.join(PROJECT_ROOT,
    'scripts/ant-transfer-phase-runs.js'))), '0a87bf61adc59529c6fe60a588e0d453cd7cf35c7cfc80479e9c0545b36975cb',
  'Current runner source hash differs from revision three.');
  assert.equal(sha256(await readFile(path.join(PROJECT_ROOT, 'scripts/ant-transfer-phase.js'))),
    phaseHelperSha256, 'Current phase helper differs from the source used by the cohort.');

  return {
    schema: 'ant-natural-field-transfer-phase-cohort-manifest/v1',
    createdAtUtc: new Date().toISOString(),
    scope: 'Qualification and receipt-integrity summary only; nonzero phase outcomes are not interpreted here.',
    matrixManifestPath: 'docs/ant/evidence/2026-10-23-natural-field-transfer/capture/matrix-20261023/matrix-manifest.json',
    matrixManifestSha256,
    captureCount: matrixManifest.captures.length,
    receiptCount: receipts.length,
    phaseZeroPassedCount: receipts.filter(row => row.phaseZeroPassed).length,
    p00RasterExactCount: receipts.filter(row => row.p00RasterExact).length,
    p00ParityCounts: modeParityCounts,
    phaseIdsPresentCounts,
    phaseArmCounts,
    sampleCountsByPhase,
    runnerRevisions,
    matrixSourceHashes: receipts[0].matrixSourceHashes,
    phaseHelperSha256,
    outputSizeSummary: { totalCompressedBytes, maxCompressedBytes,
      totalUncompressedBytes, maxUncompressedBytes },
    receipts
  };
}

async function inspectReceipt({ captureId, outputPath, relativeOutputPath, stateReceipt,
  matrixManifestSha256, runnerGroups }) {
  const compressed = await readFile(outputPath);
  assert.ok(compressed.byteLength > 0 && compressed.byteLength < MAX_COMPRESSED_BYTES,
    `${captureId}: compressed receipt must be smaller than 100 MiB.`);
  assert.ok(compressed.byteLength >= 18, `${captureId}: gzip receipt is truncated.`);
  const uncompressedBytes = compressed.readUInt32LE(compressed.byteLength - 4);
  assert.ok(uncompressedBytes > 0, `${captureId}: gzip trailer declares an empty receipt.`);
  const outputSha256 = sha256(compressed);
  const jsonBytes = gunzipSync(compressed, { maxOutputLength: uncompressedBytes });
  assert.equal(jsonBytes.byteLength, uncompressedBytes,
    `${captureId}: gzip trailer and inflated byte count differ.`);
  const result = JSON.parse(jsonBytes.toString('utf8'));

  assert.equal(result.schema, 'ant-natural-field-transfer-phase-qualification/v1');
  assert.equal(result.sourceAndCapture.captureId, captureId);
  assert.equal(result.sourceAndCapture.originPolicy, stateReceipt.originPolicy);
  assert.equal(result.sourceAndCapture.seed, stateReceipt.seed);
  assert.equal(result.sourceAndCapture.secondsCompleted, stateReceipt.secondsCompleted);
  assert.equal(result.sourceAndCapture.matrixManifestSha256, matrixManifestSha256);
  assert.equal(result.status, 'qualified-for-conditional-phase-observation');

  const runnerSourceSha256 = result.sourceAndCapture.phaseSourceHashes?.['scripts/ant-transfer-phase-runs.js'];
  const phaseHelperSha256 = result.sourceAndCapture.phaseSourceHashes?.['scripts/ant-transfer-phase.js'];
  assert.ok(RUNNER_REVISIONS.has(runnerSourceSha256),
    `${captureId}: unrecognized phase-runner source hash ${runnerSourceSha256}.`);
  runnerGroups.get(runnerSourceSha256).push(captureId);
  assert.match(phaseHelperSha256 || '', /^[a-f0-9]{64}$/,
    `${captureId}: missing phase helper source hash.`);

  const phaseCounts = Object.fromEntries(PHASE_IDS.map(id => [id, 0]));
  const sampleCountsByPhase = Object.fromEntries(PHASE_IDS.map(id => [id,
    { total: 0, interiorAllPhases: 0, boundaryExposed: 0 }]));
  const p00Comparisons = {};
  for (const arm of result.arms) {
    assert.ok(PHASE_IDS.includes(arm.phase?.id), `${captureId}: unknown phase arm.`);
    assert.ok(MODES.includes(arm.movementMode), `${captureId}: unknown movement mode.`);
    phaseCounts[arm.phase.id] += 1;
    assert.ok(Array.isArray(arm.samples), `${captureId}/${arm.phase.id}: samples missing.`);
    sampleCountsByPhase[arm.phase.id].total += arm.samples.length;
    sampleCountsByPhase[arm.phase.id].interiorAllPhases += arm.samples.filter(sample =>
      sample.interiorAllPhases === true).length;
    sampleCountsByPhase[arm.phase.id].boundaryExposed += arm.samples.filter(sample =>
      sample.boundaryExposed === true).length;

    if (arm.phase.id === 'p00') {
      const comparison = arm.phaseZeroComparison;
      assert.ok(comparison, `${captureId}/${arm.movementMode}: phase-zero comparison missing.`);
      const baseline = comparison.matrixBaselineValidation || {};
      for (const key of REQUIRED_BASELINE_FLAGS) {
        assert.equal(baseline[key], true, `${captureId}/${arm.movementMode}: baseline ${key} failed.`);
      }
      p00Comparisons[arm.movementMode] = {
        gatePassed: comparison.passed === true,
        traceExact: comparison.traceExactIgnoringSequence === true,
        stateExact: comparison.postStateExact === true,
        snapshotExact: comparison.postSnapshotExact === true,
        rngExact: comparison.postRngExact === true
      };
    }
  }
  assert.deepEqual(phaseCounts, { p00: 3, p10: 3, p01: 3, p11: 3 },
    `${captureId}: phase/mode arm coverage is incomplete.`);
  assert.deepEqual(Object.keys(p00Comparisons).sort(), [...MODES].sort());
  assert.equal(result.phaseZeroPassed, true);
  assert.equal(result.historyByPhase?.p00?.phaseZeroRasterExact, true);

  return {
    captureId,
    originPolicy: stateReceipt.originPolicy,
    seed: stateReceipt.seed,
    secondsCompleted: stateReceipt.secondsCompleted,
    tick: result.sourceAndCapture.tick,
    outputPath: relativeOutputPath,
    outputSha256,
    compressedBytes: compressed.byteLength,
    uncompressedBytes: jsonBytes.byteLength,
    schema: result.schema,
    status: result.status,
    phaseZeroPassed: result.phaseZeroPassed,
    p00RasterExact: result.historyByPhase.p00.phaseZeroRasterExact,
    p00Comparisons,
    phaseIds: PHASE_IDS,
    phaseArmCounts: phaseCounts,
    armCount: result.arms.length,
    sampleCountsByPhase,
    matrixManifestSha256: result.sourceAndCapture.matrixManifestSha256,
    matrixGitHead: result.sourceAndCapture.matrixGitHead,
    frozenInputSha256: result.sourceAndCapture.frozenInputSha256,
    writeStreamPath: result.sourceAndCapture.writeStreamPath,
    writeStreamSha256: result.sourceAndCapture.writeStreamSha256,
    matrixSourceHashes: result.sourceAndCapture.sourceHashes,
    phaseSourceHashes: result.sourceAndCapture.phaseSourceHashes,
    phaseHelperSha256
  };
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const manifest = await buildPhaseCohortManifest();
    const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(OUTPUT_PATH, bytes, { flag: 'wx' });
    process.stdout.write(`validated ${manifest.receiptCount}/${manifest.captureCount} phase receipts; `
      + `p00 passed ${manifest.phaseZeroPassedCount}/${manifest.captureCount}; `
      + `manifest ${path.relative(PROJECT_ROOT, OUTPUT_PATH).replaceAll(path.sep, '/')} `
      + `(${sha256(bytes)})\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}
