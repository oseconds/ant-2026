import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateMatchesDescriptor, classifyCandidateLineage } from '../scripts/ant-zero-ant-plate-gap-lineage.js';

test('candidate lineage is pre-gap only when the birth retains the entry candidate identity', () => {
  const entry = { startedAtMs: 381000 };
  assert.equal(classifyCandidateLineage({ gapEntryCandidate: entry,
    birthCandidate: { startedAtMs: 381000 }, descriptorMatches: true, gapEntryTimeMs: 400000 }), 'PRE-GAP');
});

test('candidate lineage is post-gap when a new candidate starts after the fork', () => {
  assert.equal(classifyCandidateLineage({ gapEntryCandidate: { startedAtMs: 381000 },
    birthCandidate: { startedAtMs: 401000 }, descriptorMatches: true, gapEntryTimeMs: 400000 }), 'POST-GAP');
});

test('candidate lineage stays ambiguous when geometry does not match the born Plate', () => {
  assert.equal(classifyCandidateLineage({ gapEntryCandidate: { startedAtMs: 381000 },
    birthCandidate: { startedAtMs: 381000 }, descriptorMatches: false, gapEntryTimeMs: 400000 }), 'AMBIGUOUS');
});

test('birth descriptor matching requires exact mask and principal path identity', () => {
  const candidate = { mask: Uint8Array.from([0, 1, 1]), path: [4, 5, 6] };
  assert.equal(candidateMatchesDescriptor(candidate, { mask: [0, 1, 1], principalPath: [4, 5, 6] }), true);
  assert.equal(candidateMatchesDescriptor(candidate, { mask: [0, 1, 0], principalPath: [4, 5, 6] }), false);
  assert.equal(candidateMatchesDescriptor(candidate, { mask: [0, 1, 1], principalPath: [4, 6] }), false);
});
