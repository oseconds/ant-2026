import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c/analysis');
const SEEDS = ['20261005', '20261006', '20261007'];
const CHANNELS = ['B', 'C'];
const quantile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
};
const median = values => quantile(values, .5);
const unpack = async path => JSON.parse(gunzipSync(await readFile(path)));
const compare = (actual, expected, label) => assert.equal(actual, expected, label);

async function main() {
  const summary = JSON.parse(await readFile(resolve(OUT, 'summary.json'), 'utf8'));
  const caseFile = JSON.parse(await readFile(resolve(OUT, 'cases.json'), 'utf8'));
  const result = { schema: 'ant-local-episode-b-vs-c-independent-arithmetic-v1', checks: [] };
  for (const seed of SEEDS) {
    const raw = await unpack(resolve(OUT, 'track-observations-' + seed + '.json.gz'));
    const savedSeed = summary.seeds.find(row => row.seed === seed);
    const byChannel = Object.fromEntries(CHANNELS.map(channel => [channel,
      raw.channels.filter(track => track.channel === channel)]));
    const seedResult = { seed, channels: {} };
    for (const channel of CHANNELS) {
      const tracks = byChannel[channel];
      const atAnchor = new Map();
      const duration = track => (track.observations.at(-1).timeMs - track.observations[0].timeMs) / 1000;
      const isEntry = track => track.observations.every(row => row.entryDistance <= .15);
      const isNonentry = track => track.observations.every(row => row.entryDistance > .15);
      for (const track of tracks) for (const row of track.observations) {
        if (!atAnchor.has(row.anchorIndex)) atAnchor.set(row.anchorIndex, []);
        atAnchor.get(row.anchorIndex).push({ ...row, trackId: track.id });
      }
      const anchors = [...atAnchor.keys()].sort((a, b) => a - b);
      let crossings = 0, winnerChanges = 0, winnerCenters = 0, paired = 0;
      for (let i = 1; i < anchors.length; i++) {
        if (anchors[i] !== anchors[i - 1] + 1) continue;
        const before = atAnchor.get(anchors[i - 1]), after = atAnchor.get(anchors[i]);
        const oldById = new Map(before.map(row => [String(row.trackId), row]));
        const matched = after.filter(row => oldById.has(String(row.trackId)))
          .map(row => [oldById.get(String(row.trackId)).value, row.value]);
        for (let a = 0; a < matched.length; a++) for (let b = a + 1; b < matched.length; b++) {
          const x = matched[a][0] - matched[b][0], y = matched[a][1] - matched[b][1];
          if (x !== 0 && y !== 0 && x * y < 0) crossings++;
        }
        const rankedBefore = before.slice().sort((a, b) => a.rank - b.rank)[0];
        const rankedAfter = after.slice().sort((a, b) => a.rank - b.rank)[0];
        if (rankedBefore && rankedAfter) {
          paired++;
          winnerChanges += Number(String(rankedBefore.trackId) !== String(rankedAfter.trackId));
          winnerCenters += Number(rankedBefore.centerIndex !== rankedAfter.centerIndex);
        }
      }
      const nonentryMaxRatio = [];
      for (const rows of atAnchor.values()) {
        const winner = rows.slice().sort((a, b) => a.rank - b.rank)[0];
        const outside = rows.filter(row => row.entryDistance > .15).sort((a, b) => a.rank - b.rank)[0];
        if (outside && winner.value > 0) nonentryMaxRatio.push(outside.value / winner.value);
      }
      const check = savedSeed.channels[channel];
      const entryTracks = tracks.filter(isEntry), nonentryTracks = tracks.filter(isNonentry);
      compare(tracks.length, check.tracks.total, seed + ' ' + channel + ' tracks');
      compare(tracks.filter(track => track.observations.length === 1).length, check.tracks.singletons,
        seed + ' ' + channel + ' singleton tracks');
      compare(entryTracks.length, check.tracks.durationByClass.entry.count, seed + ' ' + channel + ' entry tracks');
      compare(nonentryTracks.length, check.tracks.durationByClass.nonentry.count,
        seed + ' ' + channel + ' non-entry tracks');
      compare(quantile(nonentryTracks.map(duration), .5), check.tracks.durationByClass.nonentry.distribution.median,
        seed + ' ' + channel + ' non-entry duration median');
      compare(median(nonentryMaxRatio), check.hierarchy.strongestNonentryToOverallRatio.median,
        seed + ' ' + channel + ' non-entry hierarchy');
      compare(crossings, check.hierarchy.strictMatchedTrackRankCrossings, seed + ' ' + channel + ' rank crossings');
      compare(winnerChanges, check.hierarchy.winnerTrackChangesAll, seed + ' ' + channel + ' winner track changes');
      compare(winnerCenters, check.hierarchy.winnerCenterChanges, seed + ' ' + channel + ' winner center changes');
      compare(paired, check.hierarchy.pairedWinnerBoundaries, seed + ' ' + channel + ' paired winner boundaries');
      compare(Math.max(...nonentryTracks.map(duration)),
        check.tracks.longestWhollyNonentry.durationSeconds, seed + ' ' + channel + ' longest non-entry track');
      compare(Math.max(...entryTracks.map(duration)), check.tracks.longestWhollyEntry.durationSeconds,
        seed + ' ' + channel + ' longest entry track');
      seedResult.channels[channel] = { trackCount: tracks.length, singletons: tracks.filter(t => t.observations.length === 1).length,
        strictRankCrossings: crossings, winnerTrackChanges: winnerChanges, winnerCenterChanges: winnerCenters,
        medianStrongestNonentryToOverall: median(nonentryMaxRatio), longestNonentrySeconds: Math.max(...nonentryTracks.map(duration)),
        longestEntrySeconds: Math.max(...entryTracks.map(duration)) };
      result.checks.push(seed + ' ' + channel + ' raw-track arithmetic matched summary');
    }
    const pairFile = await unpack(resolve(OUT, 'paired-bc-boundaries-' + seed + '.json.gz'));
    const pairs = pairFile.boundaries;
    const pairedSummary = savedSeed.pairedBC;
    const allJ = pairs.filter(row => row.allCandidatePairs.n).map(row => row.allCandidatePairs.median);
    const allDisjoint = pairs.filter(row => row.allCandidatePairs.n).map(row => row.allCandidatePairs.exactDisjointFraction);
    compare(median(allJ), pairedSummary.allCandidatePairJaccardByBoundaryMedian.median, seed + ' all-pair median J');
    compare(median(allDisjoint), pairedSummary.allCandidatePairExactDisjointFractionByBoundary.median,
      seed + ' all-pair disjoint fraction');
    for (const [name, summaryKey] of [['reciprocal025', 'reciprocal025'], ['reciprocal075', 'reciprocal075']]) {
      const boundaryRows = pairs.map(row => row[name]).filter(row => row.pairs > 0);
      const jaccards = boundaryRows.flatMap(row => row.rows.map(pair => pair.jaccard));
      const same = boundaryRows.map(row => row.exactSameFraction);
      compare(median(jaccards), pairedSummary[summaryKey].xJaccardByPair.median,
        seed + ' ' + name + ' pair J median');
      compare(median(same), pairedSummary[summaryKey].exactSameFractionByBoundary.median,
        seed + ' ' + name + ' exact same median');
    }
    seedResult.paired = { bothAvailableBoundaries: pairs.filter(row => row.centersB && row.centersC).length,
      medianAllCandidatePairJaccard: median(allJ), medianAllCandidatePairDisjointFraction: median(allDisjoint) };
    result.seeds ??= [];
    result.seeds.push(seedResult);
    result.checks.push(seed + ' paired B/C per-boundary arithmetic matched summary');
  }
  const expectedCategories = ['longest-nonentry-B', 'longest-nonentry-C', 'longest-entry-B', 'longest-entry-C',
    'strongest-sustained-nonentry-B', 'strongest-sustained-nonentry-C'];
  assert.deepEqual(caseFile.cases.map(row => row.category), expectedCategories);
  const allTracks = [];
  for (const seed of SEEDS) {
    const raw = await unpack(resolve(OUT, 'track-observations-' + seed + '.json.gz'));
    allTracks.push(...raw.channels.map(track => ({ ...track, seed,
      duration: (track.observations.at(-1).timeMs - track.observations[0].timeMs) / 1000,
      entry: track.observations.every(row => row.entryDistance <= .15),
      nonentry: track.observations.every(row => row.entryDistance > .15),
      meanRank: track.observations.reduce((sum, row) => sum + row.rank, 0) / track.observations.length })));
  }
  const selected = category => {
    const channel = category.endsWith('-B') ? 'B' : 'C';
    let rows = allTracks.filter(track => track.channel === channel && (category.includes('nonentry') ? track.nonentry : track.entry));
    if (category.startsWith('strongest')) rows = rows.filter(track => track.observations.length >= 2);
    rows.sort((a, b) => category.startsWith('strongest')
      ? a.meanRank - b.meanRank || b.duration - a.duration || a.seed.localeCompare(b.seed) || a.id - b.id
      : b.duration - a.duration || a.seed.localeCompare(b.seed) || a.id - b.id);
    return rows[0];
  };
  for (const item of caseFile.cases) {
    const expected = selected(item.category);
    compare(item.seed, expected.seed, item.category + ' selected seed');
    compare(item.trackId, expected.id, item.category + ' selected track');
    assert.equal(item.xSnapshots.length, 3, item.category + ' X snapshot count');
    for (const snapshot of item.xSnapshots) {
      const x = snapshot[item.channel + ':' + item.trackId];
      assert.ok(x, item.category + ' selected X snapshot');
      compare(x.cells.length, x.nodeCount, item.category + ' selected X node count');
    }
  }
  result.checks.push('six objective categories retained in registered order');
  result.checks.push('six objective selections independently reproduced from track receipts');
  result.checks.push('18 selected X snapshots contain correctly keyed captured cells');
  await writeFile(resolve(OUT, 'independent-review.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ checks: result.checks.length, passed: true,
    files: ['analysis/summary.json', 'analysis/cases.json', 'analysis/track-observations-*.json.gz',
      'analysis/paired-bc-boundaries-*.json.gz'] }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
