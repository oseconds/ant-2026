import test from 'node:test';
import assert from 'node:assert/strict';
import { collectOrderedFootLedger, deriveMatchedRepeatWindows, phaseAt, reconstructChemicalWindow } from '../scripts/lib/antPlateLocalHistoryOwnership.js';

test('chemical window separates anchor-only carry from the post-anchor endpoint effect', () => {
  const alpha = 1 - Math.exp(-1 / 20);
  const first = { simulationTimeMs: 0, maps: { B_memory: [0.5, 0.2, 0.1, 0], A_projection96: [0, 0, 0, 0] } };
  const memory = Float32Array.from(first.maps.B_memory);
  for (const [i, raw] of [0.04, 0.08, 0, 0].entries()) memory[i] += (raw / (raw + 0.04) - memory[i]) * alpha;
  const second = { simulationTimeMs: 1000, maps: { B_memory: Array.from(memory), A_projection96: [0.04, 0.08, 0, 0] } };
  const result = reconstructChemicalWindow([first, second], 0, 1, 2);
  assert.deepEqual(result.sampledProjectionReplay, { compared: 4, mismatches: 0, maxAbsError: 0,
    maxUlpDistance: 0, exactEndpoint: true });
  assert.ok(Math.abs(result.carriedInAtCommit[0] + result.postAnchorEffect[0] - memory[0]) < 1e-12);
  assert.ok(result.postAnchorEffect.some(value => value !== 0));
});

test('foot ledger preserves source order and assigns inclusive commit-time contacts once', () => {
  const packet = { contacts: [
    { type: 'FOOT_CONTACT', simulationTimeMs: 12, contactGroup: 1, contacts: [{ legId: 'FL', position: { x: 1, y: 0 } }] },
    { type: 'FOOT_CONTACT', simulationTimeMs: 10, contactGroup: 2, contacts: [{ legId: 'FR', position: { x: 0, y: 0 } }] },
    { type: 'FOOT_CONTACT', simulationTimeMs: 11, contactGroup: 3, contacts: [
      { legId: 'MR', position: { x: 0.9, y: 0.1 } },
      { legId: '', position: { x: 0.1, y: 0.1 } }
    ] }
  ] };
  const ledger = collectOrderedFootLedger(packet, [{ id: 'P1', anchorMs: 10, commitMs: 12, mask: [0, 1, 0, 0] }], 2);
  assert.deepEqual(ledger.rows.map(row => [row.eventIndex, row.ownership.P1.phase]),
    [[0, 'ownedNew'], [1, 'carriedIn'], [2, 'ownedNew'], [2, 'ownedNew']]);
  assert.equal(ledger.timestampInversions, 1);
  assert.equal(ledger.perCase.P1.phases.ownedNew.individualFeet, 3);
  assert.equal(ledger.perCase.P1.phases.ownedNew.withinFrozenMask, 2);
  assert.equal(ledger.rows.at(-1).surfaceFieldAccepted, false);
});

test('matched repeats anchor each new window at the newest commit without re-owning timestamps', () => {
  const contactTimesSeconds = Array.from({ length: 200 }, (_, i) => i + 1);
  const commits = [20, 110, 200].map((seconds, i) => ({ seconds, lineageStartMs: 0,
    priorMatch: i ? `trail-plate-${i}` : null, committedIds: [`trail-plate-${i + 1}`],
    selectedCandidateRemainsPresent: true, newFeet: i ? 90 : null }));
  const rows = Array.from({ length: 201 }, (_, seconds) => ({ seconds, priorMatch: seconds > 20 ? 'trail-plate-1' : null,
    priorAgeSeconds: seconds - 20, newFeet: seconds - 20, repeatAfter: { refractoryRemainingSeconds: 110 - seconds },
    committedIds: seconds === 20 ? ['trail-plate-1'] : seconds === 110 ? ['trail-plate-2'] : seconds === 200 ? ['trail-plate-3'] : [],
    selectedCandidateRemainsPresent: true }));
  const fixture = { schedule: 'continuous-load', scope: 'logical', commits, rows,
    descriptorsRemainImmutable: true, noCandidateReset: true };
  const result = deriveMatchedRepeatWindows(fixture, contactTimesSeconds, { x: 0.5, y: 0.5 });
  assert.deepEqual(result.windows.map(({ anchorSeconds, commitSeconds, newContactCount }) =>
    [anchorSeconds, commitSeconds, newContactCount]), [[0, 20, 20], [20, 110, 90], [110, 200, 90]]);
  assert.equal(result.windows[1].anchorKind, 'newest-matched-prior-commit');
  assert.equal(result.uniqueOwnedContributionCount, 200);
  assert.equal(phaseAt(20, 20, 110), 'carriedIn');
  assert.equal(phaseAt(110, 20, 110), 'ownedNew');
});
