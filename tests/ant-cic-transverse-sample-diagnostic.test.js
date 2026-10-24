import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { argmaxIndices, classifyTransition, runDeterministicDiagnostic } from '../scripts/ant-cic-transverse-sample-diagnostic.js';

const readJson = bytes => JSON.parse(bytes.toString('utf8'));

test('argmax retains exact co-maximizing sample identities', () => {
  assert.deepEqual(argmaxIndices([0.4, 0.1, 0.4]), [0, 2]);
  assert.deepEqual(argmaxIndices([0, 0, 0]), [0, 1, 2]);
  assert.throws(() => argmaxIndices([]), TypeError);
  assert.throws(() => argmaxIndices([0, Number.NaN]), TypeError);
});

test('transition tags distinguish target sample switch, rival restoration, and stable reordering', () => {
  const lostAfterTargetSwitch = classifyTransition({
    targetRawSet: [4], targetWeightedSet: [3], rivalRawSet: [1], rivalWeightedSet: [1], rawLead: 0.003, weightedLead: -0.001
  });
  assert.equal(lostAfterTargetSwitch.type, 'target-sample-switch');
  assert.equal(lostAfterTargetSwitch.targetLost, true);

  const restoredAfterRivalSwitch = classifyTransition({
    targetRawSet: [3], targetWeightedSet: [3], rivalRawSet: [0], rivalWeightedSet: [1], rawLead: -0.001, weightedLead: 0.002
  });
  assert.equal(restoredAfterRivalSwitch.type, 'rival-sample-switch');
  assert.equal(restoredAfterRivalSwitch.targetRestored, true);

  const stableReordering = classifyTransition({
    targetRawSet: [2], targetWeightedSet: [2], rivalRawSet: [1], rivalWeightedSet: [1], rawLead: 0.001, weightedLead: -0.001
  });
  assert.equal(stableReordering.type, 'stable-sample-weighting-reorder');
  assert.equal(stableReordering.stableReordering, true);
});

test('saved CIC cohorts, sample weighting/maxima, and deterministic artifact reproduce exactly', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'ant-cic-transverse-test-'));
  try {
    const { files, receipt } = runDeterministicDiagnostic(outputDir);
    assert.equal(receipt.identical, true);

    const summary = readJson(files.get('summary.json'));
    assert.equal(summary.inputs.rowJoin.strictUnique, 5072);
    assert.deepEqual(summary.inputs.previousGlobalCounts, {
      productionErrors: 2378,
      cicErrors: 2378,
      recovered: 92,
      newErrors: 92
    });
    assert.equal(summary.cohorts.primary.count, 26);
    assert.equal(summary.cohorts.recoveredWeightRestored.count, 14);
    assert.equal(summary.cohorts.recoveredHeld.count, 68);
    assert.equal(summary.cohorts.recoveredScoreRestored.count, 10);
    assert.equal(summary.cohorts.allRecovered.count, 92);
    assert.equal(summary.transition.classification.rawToWeightedTargetLosses, 26);
    assert.equal(summary.transition.classification.targetSampleSetChanged, 26);
    assert.equal(summary.transition.classification.rivalSampleSetChanged, 0);
    assert.equal(summary.transition.classification.exactMaxSampleTieRows, 0);

    const rows = readJson(gunzipSync(files.get('row-decomposition.json.gz'))).rows;
    assert.equal(rows.length, 118);
    const expectedWeights = [0.55, 0.775, 1, 0.775, 0.55];
    for (const row of rows) {
      assert.ok(['harmful', 'weight-restored', 'held', 'score-restored'].includes(row.cohort));
      for (const arm of ['A', 'C', 'D']) {
        for (const candidate of row.arms[arm].candidates) {
          assert.equal(candidate.samples.length, 5);
          assert.deepEqual(candidate.rawArgmaxSampleIndices,
            candidate.samples.map(sample => sample.raw).flatMap((value, index, values) => value === Math.max(...values) ? [index] : []));
          assert.deepEqual(candidate.weightedArgmaxSampleIndices,
            candidate.samples.map(sample => sample.weighted).flatMap((value, index, values) => value === Math.max(...values) ? [index] : []));
          for (let index = 0; index < 5; index += 1) {
            const sample = candidate.samples[index];
            assert.equal(sample.weight, expectedWeights[index]);
            assert.equal(sample.weighted, sample.raw * expectedWeights[index]);
          }
          assert.equal(candidate.rawMaximum, Math.max(...candidate.samples.map(sample => sample.raw)));
          assert.equal(candidate.weightedMaximum, Math.max(...candidate.samples.map(sample => sample.weighted)));
        }
      }
    }

    const census = readJson(files.get('transition-census.json'));
    assert.equal(census.transition.rawToWeightedTargetLosses, 26);
    assert.equal(census.transition.exactMaxSampleTieRows, 0);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});
