import test from 'node:test';
import assert from 'node:assert/strict';
import { ranks, correlation, distribution, contiguousEpisodes, positiveIntegral, gatedChangeCounts, strictRankCrossings, regionSignals } from '../scripts/ant-local-opportunity-synthesis.js';

test('correlations preserve ties and reject constant/insufficient samples', () => {
  assert.deepEqual(ranks([4, 1, 1, 2]), [4, 1.5, 1.5, 3]);
  assert.equal(correlation([1, 2, 3], [6, 4, 2]).pearson, -1);
  assert.equal(correlation([1, 2, 3], [6, 4, 2]).spearman, -1);
  assert.equal(correlation([1, 1, 1], [1, 2, 3]).pearson, null);
  assert.equal(correlation([1, 2], [1, 2]).spearman, null);
  assert.equal(distribution([1, 3]).median, 2);
});
test('objective episodes never bridge a missing analysis or a diagnostic partition change', () => {
  const rows = [{ anchorIndex: 0, timeMs: 0, value: 1, entryDistance: .2 },
    { anchorIndex: 1, timeMs: 1100, value: 3, entryDistance: .2 },
    { anchorIndex: 2, timeMs: 2100, value: 8, entryDistance: .1 },
    { anchorIndex: 3, timeMs: 3100, value: 1, entryDistance: .3 },
    { anchorIndex: 5, timeMs: 5100, value: 1, entryDistance: .3 }];
  const episodes = contiguousEpisodes(rows, row => row.entryDistance > .15);
  assert.deepEqual(episodes.map(group => group.map(row => row.anchorIndex)), [[0, 1], [3], [5]]);
  assert.equal(positiveIntegral(episodes[0]), 2.2);
});
test('positive D changes retain chemical gate context without changing opportunity eligibility', () => {
  assert.deepEqual(gatedChangeCounts([0, 1, 2], [1, 2, -1], [.29, .30, .1]),
    { positiveDCells: 2, priorChemicalUnqualifiedCells: 1 });
});
test('strict rank crossings exclude ties and unmatched centers', () => {
  const row = (id, value) => ({ value, trackIds: { '0.025': id } });
  assert.deepEqual(strictRankCrossings([row('a', 3), row('b', 2), row('c', 1)],
    [row('a', 1), row('b', 2), row('c', 3), row('new', 9)], .025), { matchedCenters: 3, crossings: 3 });
  assert.equal(strictRankCrossings([row('a', 3), row('b', 3), row('c', 1)],
    [row('a', 1), row('b', 1), row('c', 3)], .025).crossings, 2);
  assert.equal(strictRankCrossings([row('a', 3), row('b', 2)], [row('a', 1), row('b', 1)], .025).crossings, 0);
});
test('regional context keeps separate spatial means and activity totals', () => {
  assert.deepEqual(regionSignals({ D: [1, 3, 99], feet5: [2, 4, 99], travel5: [.1, .2, 99], deltaB5: [-1, 1, 99], deltaD20: null }, [0, 1]),
    { D: 2, feet5: 6, travel5: .30000000000000004, deltaB5: 0, deltaD20: null });
});
