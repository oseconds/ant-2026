import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { PACKAGE, runDeterministicDiagnostic } from '../scripts/ant-cic-sample-profile-substitution.js';

test('CIC sample substitutions are isolated, parity checked, and deterministic', () => {
  const receipt = runDeterministicDiagnostic();
  assert.equal(JSON.parse(readFileSync(`${PACKAGE}/determinism.json`, 'utf8')).identical, true);
  const rows = JSON.parse(gunzipSync(readFileSync(`${PACKAGE}/substitution-rows.json.gz`))).rows;
  const census = JSON.parse(readFileSync(`${PACKAGE}/arm-census.json`, 'utf8'));
  assert.equal(rows.length, 26);
  assert.deepEqual(Object.keys(census.arms), [
    'D', 'D[target←C]', 'D[rival←C]', 'D[target+rival←C]',
    'D[target←A]', 'D[rival←A]', 'D[target+rival←A]'
  ]);

  for (const row of rows) {
    const d = row.sourceVectors.D;
    for (const [label, spec] of Object.entries({
      'D': { source: null, ids: [] },
      'D[target←C]': { source: 'C', ids: [row.targetIndex] },
      'D[rival←C]': { source: 'C', ids: [row.frozenDRivalIndex] },
      'D[target+rival←C]': { source: 'C', ids: [row.targetIndex, row.frozenDRivalIndex] },
      'D[target←A]': { source: 'A', ids: [row.targetIndex] },
      'D[rival←A]': { source: 'A', ids: [row.frozenDRivalIndex] },
      'D[target+rival←A]': { source: 'A', ids: [row.targetIndex, row.frozenDRivalIndex] }
    })) {
      const arm = row.arms[label];
      assert.equal(arm.rawSamples.length, 5);
      for (let candidate = 0; candidate < 5; candidate++) {
        const replaced = spec.ids.includes(candidate);
        const expected = replaced ? row.sourceVectors[spec.source][candidate] : d[candidate];
        assert.deepEqual(arm.rawSamples[candidate], expected, `${row.rowKey}/${label}/${candidate}`);
        assert.equal(arm.vectorAudit[candidate].declaredChanged, replaced);
      }
      assert.equal(row.geometry.length, 5);
      assert.equal(arm.outcome.thirdWeightedWinnerIndex, null);
      assert.equal(arm.outcome.thirdFinalWinnerIndex, null);
    }
    assert.equal(row.arms.D.outcome.targetWeightedWinner, false);
    assert.equal(row.arms.D.outcome.targetFinalWinner, false);
  }

  assert.equal(census.arms['D[target←C]'].weightedTargetWins, 12);
  assert.equal(census.arms['D[target←C]'].finalTargetWins, 16);
  assert.equal(census.arms['D[rival←C]'].weightedTargetWins, 18);
  assert.equal(census.arms['D[rival←C]'].finalTargetWins, 20);
  assert.equal(census.arms['D[target+rival←C]'].weightedTargetWins, 26);
  assert.equal(census.arms['D[target+rival←C]'].finalTargetWins, 26);
  assert.equal(census.arms['D[target←A]'].weightedTargetWins, 26);
  assert.equal(census.arms['D[rival←A]'].weightedTargetWins, 26);
  assert.equal(census.sufficiencyPatterns.C.weighted.jointOnlyRestores, 6);
  assert.equal(census.sufficiencyPatterns.C.final.jointOnlyRestores, 2);
  for (const arm of Object.values(census.arms)) {
    assert.deepEqual(arm.exactTopTieRows, { rawMaximum: [], weightedMaximum: [], finalFieldOnlyScore: [] });
  }
  assert.equal(receipt.generationHashes['substitution-rows.json.gz'],
    JSON.parse(readFileSync(`${PACKAGE}/manifest.json`, 'utf8')).files['substitution-rows.json.gz'].sha256);
});
