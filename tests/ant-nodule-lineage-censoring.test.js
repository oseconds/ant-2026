import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditNoduleCensoring } from '../scripts/audit-ant-nodule-censoring.js';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(REPO_ROOT,
  'docs/ant/evidence/2026-10-13-nodule-zero-gap-lineage/data');
const seedEvidence = [20261005, 20261006, 20261007].map((seed) => JSON.parse(fs.readFileSync(
  path.join(DATA_DIR, `seed-${seed}.json`), 'utf8')));

test('censoring audit accounts for all paired Plate-enabled cells without duplicate births', () => {
  const ledger = auditNoduleCensoring(seedEvidence);
  assert.equal(ledger.cells.length, 64);
  assert.equal(ledger.summaries.natural.cellCount, 32);
  assert.equal(ledger.summaries.timerClear.cellCount, 32);
  assert.deepEqual(ledger.pairedClassificationDifferences, []);

  for (const [seed, expectedCount] of [[20261005, 12], [20261006, 18], [20261007, 2]]) {
    const natural = ledger.cells.filter((row) => row.seed === seed && row.arm === 'natural');
    const timerClear = ledger.cells.filter((row) => row.seed === seed && row.arm === 'timerClear');
    assert.equal(natural.length, expectedCount);
    assert.equal(timerClear.length, expectedCount);
    assert.equal(natural.length, timerClear.length);
    assert.deepEqual(natural.map((row) => row.cell).sort((a, b) => a - b),
      timerClear.map((row) => row.cell).sort((a, b) => a - b));
  }
  for (const arm of ['natural', 'timerClear']) {
    assert.deepEqual(ledger.summaries[arm].classificationCounts, {
      'RIGHT-CENSORED': 8,
      'PLATE-RESET CENSORED': 0,
      'QUALIFICATION LOST': 3,
      'NEARBY-NODULE BLOCKED': 1,
      'MAX-COUNT BLOCKED': 0,
      'OTHER EXPLAINED': 0,
      'DATA INSUFFICIENT': 20
    });
    assert.equal(ledger.summaries[arm].nominalNoResetOpportunityUnder30Seconds, 15);
    assert.equal(ledger.summaries[arm].nominalNoResetOpportunityAtLeast30Seconds, 17);
    assert.equal(ledger.summaries[arm].projectedCompactionBelowThresholdAtEarliestMaturity, 3);
    assert.equal(ledger.summaries[arm].projectedCompactionBelowThresholdByGapEnd, 5);
    assert.equal(ledger.summaries[arm].maxCountBlockedAtAnySavedBoundary, false);
  }

  const targetRows = ledger.cells.filter((row) => row.primaryClassification !== 'DATA INSUFFICIENT');
  assert.equal(targetRows.length, 24);
  assert.equal(targetRows.filter((row) => row.primaryClassification === 'NEARBY-NODULE BLOCKED'
    && row.seed === 20261007 && row.cell === 6388).length, 2);
});

test('censoring audit is deterministic over committed raw evidence', () => {
  const first = auditNoduleCensoring(seedEvidence);
  const second = auditNoduleCensoring(seedEvidence);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});
