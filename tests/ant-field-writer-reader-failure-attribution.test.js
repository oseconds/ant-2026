import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  analyze,
  loadFrozenRows,
  SOURCE_HASHES
} from '../scripts/ant-field-writer-reader-failure-attribution.js';

const INPUT = resolve('docs/ant/evidence/2026-10-24-ant-field-writer-reader-failure-attribution/inputs/station-raw.json.gz');
const rows = loadFrozenRows(INPUT);

let result;
test('frozen A/C sensor stages replay exactly and all five wide candidates retain rank parity', () => {
  result = analyze(rows, { mainSha: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2' });
  assert.deepEqual(result.provenance.sourceHashes, SOURCE_HASHES);
  assert.equal(result.rowCount, 5544);
  assert.deepEqual(result.replayParity.local, { comparisons: 77616, nonExact: 0, maxAbsError: 0 });
  assert.deepEqual(result.replayParity.wide, { comparisons: 166320, nonExact: 0, maxAbsError: 0 });
  assert.deepEqual(result.replayParity.weightedSamples, { comparisons: 277200, nonExact: 0 });
  assert.deepEqual(result.replayParity.candidateRanks, { comparisons: 55440, nonExact: 0 });
  assert.deepEqual(result.replayParity.finalWinners, { comparisons: 11088, nonExact: 0 });
});

test('A/B/C reconstruction records round-trip precision without hiding it', () => {
  const recovery = result.provenance.BRecovery;
  assert.equal(recovery.localPairs, 99792);
  assert.equal(recovery.widePairs, 138600);
  assert.equal(recovery.bMinusAReaderNonExact, 0);
  assert.equal(recovery.totalNonExact, 0);
  assert.equal(recovery.cMinusBWriterNonExact, 67807);
  assert.equal(recovery.maxCMinusBWriter, 2.7755575615628914e-17);
  assert.equal(recovery.maxDecompositionResidual, 2.7755575615628914e-17);
  const sensitivity = result.provenance.precisionSensitivityBetweenAPlusC2AndCMinusC1;
  assert.equal(sensitivity.localSignChanges, 0);
  assert.equal(sensitivity.maxLocalSteeringDifference, 9.71445146547012e-17);
  assert.equal(sensitivity.rawWinnerChanges, 0);
  assert.equal(sensitivity.rawRankChanges, 0);
  assert.equal(sensitivity.weightedWinnerChanges, 0);
  assert.equal(sensitivity.weightedRankChanges, 0);
  assert.equal(sensitivity.finalWinnerChanges, 0);
  assert.equal(sensitivity.finalRankChanges, 0);
});

test('local stable sign failures separate into reader-sufficient and writer-sufficient cases', () => {
  assert.equal(result.local.exactSignMismatchCount, 549);
  assert.equal(result.local.stableSignFailures.count, 546);
  assert.equal(result.local.nearZeroCases.count, 3);
  assert.equal(result.local.controlRows, 4995);
  assert.deepEqual(result.local.stableSignFailures.classes, {
    'READER-SUFFICIENT': 335,
    'WRITER/STORAGE-SUFFICIENT': 211,
    'READER-FAILURE PARTLY RESTORED BY WRITER': 0,
    'MIXED / COMPOUND': 0,
    'B TOP TIE / AMBIGUOUS': 0
  });
  assert.deepEqual(result.local.allAnalyticDirectionalRows.classes, {
    'READER-SUFFICIENT': 335,
    'WRITER/STORAGE-SUFFICIENT': 211,
    'READER-FAILURE PARTLY RESTORED BY WRITER': 125,
    'MIXED / COMPOUND': 152,
    'B TOP TIE / AMBIGUOUS': 0,
    'NO QUALITATIVE FAILURE': 3189
  });
});

test('wide raw-max and weighted-max cohorts reconstruct all A/B/C winner classes', () => {
  assert.equal(result.wide.strictUniqueAnalyticRows, 5072);
  assert.equal(result.wide.finalWinnerMismatches, 2378);
  assert.equal(result.wide.rawMaximumFirstWrong.count, 1380);
  assert.deepEqual(result.wide.rawMaximumFirstWrong.classes, {
    'READER-SUFFICIENT': 993,
    'WRITER/STORAGE-SUFFICIENT': 328,
    'READER-FAILURE PARTLY RESTORED BY WRITER': 0,
    'MIXED / COMPOUND': 3,
    'B TOP TIE / AMBIGUOUS': 56
  });
  assert.equal(result.wide.weightedMaximumFirstWrong.count, 998);
  assert.deepEqual(result.wide.weightedMaximumFirstWrong.classes, {
    'READER-SUFFICIENT': 841,
    'WRITER/STORAGE-SUFFICIENT': 123,
    'READER-FAILURE PARTLY RESTORED BY WRITER': 0,
    'MIXED / COMPOUND': 0,
    'B TOP TIE / AMBIGUOUS': 34
  });
  assert.deepEqual(result.wide.allStrictUniqueOutcomes.finalWinner.classes, {
    'READER-SUFFICIENT': 2039,
    'WRITER/STORAGE-SUFFICIENT': 249,
    'READER-FAILURE PARTLY RESTORED BY WRITER': 598,
    'MIXED / COMPOUND': 0,
    'B TOP TIE / AMBIGUOUS': 90,
    'NO QUALITATIVE FAILURE': 2096
  });
  assert.equal(result.wide.allStrictUniqueOutcomes.rawMaximum.classes[
    'READER-FAILURE PARTLY RESTORED BY WRITER'], 546);
  assert.equal(result.wide.allStrictUniqueOutcomes.weightedMaximum.classes[
    'READER-FAILURE PARTLY RESTORED BY WRITER'], 609);
  assert.equal(result.wide.allStrictUniqueOutcomes.finalWinner.classes[
    'READER-FAILURE PARTLY RESTORED BY WRITER'], 598);
  const highMarginDecile = result.wide.allMismatchMargins.equalCountDecilesAscending.at(-1);
  assert.deepEqual(highMarginDecile.attribution, {
    'READER-SUFFICIENT': 151,
    'WRITER/STORAGE-SUFFICIENT': 78,
    'B TOP TIE / AMBIGUOUS': 9
  });
  const rows = result.rows;
  const rawTieRows = rows.filter(row => row.wide.winnerMismatch
    && row.wide.firstProductionWrongStage === 'rawMaximum'
    && row.wide.raw.class === 'B TOP TIE / AMBIGUOUS');
  assert.equal(rawTieRows.length, 56);
  assert.ok(rawTieRows.every(row => row.wide.raw.B.targetInTopTie && row.wide.raw.B.topTie.length > 1));
  const weightedTieRows = rows.filter(row => row.wide.winnerMismatch
    && row.wide.firstProductionWrongStage === 'maximum'
    && row.wide.weighted.class === 'B TOP TIE / AMBIGUOUS');
  assert.equal(weightedTieRows.length, 34);
  assert.ok(weightedTieRows.every(row => row.wide.weighted.B.targetInTopTie
    && row.wide.weighted.B.topTie.length > 1));
  const [rawExample, weightedExample] = result.wide.representatives;
  assert.equal(rawExample.raw.class, 'READER-SUFFICIENT');
  assert.equal(weightedExample.weighted.class, 'WRITER/STORAGE-SUFFICIENT');
});

test('straight symmetry and mirrored routes remain explicit across A/B/C', () => {
  const straight = result.local.straightControl;
  assert.equal(straight.analyticSteeringExactlyZero, true);
  const p00 = straight.p00p01Station0122.find(row => row.phase === 'p00');
  const p01 = straight.p00p01Station0122.find(row => row.phase === 'p01');
  assert.equal(p00.steering.A, 0);
  assert.equal(p00.steering.B, 0);
  assert.ok(Math.abs(p00.steering.C - 0.19708966205049175) < 1e-15);
  assert.equal(p01.steering.A, 0);
  assert.ok(Math.abs(p01.steering.B) < 2e-14);
  assert.ok(Math.abs(p01.steering.C) < 2e-14);
  assert.ok(result.local.mirror.gentle.C.maxAbsMirrorSum < 1e-14);
  assert.ok(result.local.mirror.tight.C.maxAbsMirrorSum < 1e-14);
});

test('frozen physical query coordinates preserve the four declared phase translations', () => {
  assert.equal(result.phaseGeometry.comparisons, 357588);
  assert.ok(result.phaseGeometry.maxTranslationResidual < 1e-14);
});

test('analysis is deterministic and consumes no RNG', () => {
  const originalRandom = Math.random;
  let first;
  try {
    Math.random = () => { throw new Error('Unexpected RNG use in fixed-geometry analysis.'); };
    first = analyze(rows, { mainSha: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2' });
  } finally {
    Math.random = originalRandom;
  }
  const second = analyze(rows, { mainSha: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2' });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});
