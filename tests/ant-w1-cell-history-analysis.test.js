import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHistoryFrame, summarizeCellSnapshot, representativeIds, csv } from '../scripts/ant-w1-cell-history-analysis.js';

test('baseline normalizer preserves processing IDs, component order and later same-frame redirect', () => {
  const frame = { components: [{ componentId: 0, processingEpisodeId: 7, episodeId: 3, cellIndices: [2] },
    { componentId: 1, processingEpisodeId: 3, episodeId: 3, cellIndices: [0] }] };
  const normalized = normalizeHistoryFrame('baseline', frame, [
    { type: 'merge_absorption', componentId: 1, episodeId: 3, absorbedEpisodeId: 7 }]);
  assert.deepEqual(normalized.operations, [{ type: 'directAdmission', identityId: 7, cells: [2] },
    { type: 'merge', targetId: 3, sourceId: 7 }, { type: 'directAdmission', identityId: 3, cells: [0] }]);
  assert.deepEqual(normalized.activeOwners.map(e => e.identityId), [3, 3]);
});

test('candidate normalizer transfers actual merges only, excluding split provenance', () => {
  const frame = { components: [{ componentLabel: 0, episodeId: 0, absorbedParentIds: [7, 9], cellIndices: [1, 2] },
    { componentLabel: 1, episodeId: 10, absorbedParentIds: [], forkSourceParentIds: [0], cellIndices: [4] }] };
  assert.deepEqual(normalizeHistoryFrame('candidate', frame).operations, [
    { type: 'merge', targetId: 0, sourceId: 7 }, { type: 'merge', targetId: 0, sourceId: 9 },
    { type: 'directAdmission', identityId: 0, cells: [1, 2] }, { type: 'directAdmission', identityId: 10, cells: [4] }]);
});

test('representative selection uses recorded largest multi-cell and earliest actual one-cell only', () => {
  const episodes = [{ id: 5, cellIndices: [0, 1], closeTimeSeconds: 5, character: { consolidation: 1 } },
    { id: 4, cellIndices: [2, 3], closeTimeSeconds: 8, character: { consolidation: .5 } },
    { id: 7, cellIndices: [5], closeTimeSeconds: 2, character: { consolidation: .3 } },
    { id: 9, cellIndices: [6], closeTimeSeconds: 3, character: { consolidation: 0 } }];
  assert.deepEqual(representativeIds(episodes), { largestMultiCell: 4, firstOneCell: 7, zeroConsolidationOneCell: 9 });
  assert.deepEqual(representativeIds([]), { largestMultiCell: null, firstOneCell: null, zeroConsolidationOneCell: null });
});

test('summary separates cell unions from sample denominators and reports unavailable ages', () => {
  const rows = [{ episodeOwnedActiveSampleCount: 2, episodeOwnedQFalseActiveObservations: 1,
    episodeOwnedReactivationCount: 1, episodeOwnedLastActiveAgeSeconds: 100,
    lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds: null }];
  const summary = summarizeCellSnapshot({ cells: rows, currentActiveCellCount: 0,
    inactiveHistoricalCellIndices: [1], globalActiveHistoricalCellCount: 0, directCellCount: 0,
    inheritedCellCount: 1, overlappingCellCount: 0, directUnionEntryCellCount: 0, transferredUnionEntryCellCount: 1 });
  assert.equal(summary.mergeFirstUnionEntryFraction, 1);
  assert.equal(summary.ownedQFalseActiveFraction, .5);
  assert.equal(summary.ownedLastActiveAgeBeyond90Cells, 1);
  assert.equal(summary.distributions.lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds.missingCount, 1);
  assert.equal(summary.distributions.lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds.mean, null);
  assert.equal(csv([{ text: 'a,b', object: { c: 1 } }], ['text', 'object']), 'text,object\n"a,b","{""c"":1}"\n');
});
