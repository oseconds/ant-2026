import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { readJson, readRun, unpack, writeJson, sha256 } from './ant-local-opportunity-io.js';
import { correlation, distribution } from './ant-local-opportunity-synthesis.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const INPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit');
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-episode-evidence-b-vs-c');
const AUTHORITY = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const SOURCE_COMMIT = 'da599d9f385f53d0bb24df3e737c5ed2e2eb6a23';
const SEEDS = ['20261005', '20261006', '20261007'];
const CHANNELS = ['B', 'C'];
const WINDOWS = [1, 5, 20];
const ENTRY = { x: .5, y: .72 };
const GRID = 96;
const MATCH_CUTOFFS = [.025, .075];

function point(index) {
  return { x: index % GRID / (GRID - 1), y: Math.floor(index / GRID) / (GRID - 1) };
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function setFor(capture, cache) {
  if (!cache.has(capture.id)) cache.set(capture.id, new Set(capture.cells));
  return cache.get(capture.id);
}
function overlap(left, right) {
  const small = left.size <= right.size ? left : right;
  const large = small === left ? right : left;
  let common = 0;
  for (const value of small) if (large.has(value)) common++;
  const union = left.size + right.size - common;
  return { intersection: common, union, jaccard: union ? common / union : 1,
    identical: common === left.size && common === right.size };
}
function recenter(rows, radius) {
  const nearest = (from, to) => from.map(row => {
    const p = point(row.index);
    let best = null;
    for (const candidate of to) {
      if (candidate.component !== row.component) continue;
      const d = distance(p, point(candidate.index));
      if (d <= radius && (!best || d < best.distance || (d === best.distance && candidate.index < best.index))) {
        best = { index: candidate.index, distance: d };
      }
    }
    return best;
  });
  const forward = nearest(rows.left, rows.right), backward = nearest(rows.right, rows.left);
  const rightIndex = new Map(rows.right.map((row, i) => [row.index, i]));
  const pairs = [];
  for (let i = 0; i < rows.left.length; i++) {
    const match = forward[i];
    if (match && backward[rightIndex.get(match.index)]?.index === rows.left[i].index) {
      pairs.push({ a: rows.left[i].index, b: match.index, distance: match.distance });
    }
  }
  return pairs;
}
function directionalNearest(from, to) {
  return from.map(row => {
    const p = point(row.index);
    let best = null;
    for (const candidate of to) {
      if (candidate.component !== row.component) continue;
      const d = distance(p, point(candidate.index));
      if (!best || d < best.distance || (d === best.distance && candidate.index < best.index)) {
        best = { index: candidate.index, distance: d };
      }
    }
    return best;
  });
}
function compareMatchLists(actual, registered) {
  const sort = rows => rows.map(row => ({ a: row.a ?? row.previousIndex, b: row.b ?? row.currentIndex,
    distance: row.distance })).sort((a, b) => a.a - b.a || a.b - b.b);
  assert.deepEqual(sort(actual), sort(registered));
}
function typeOverlap(jaccard, identical) {
  if (identical) return 'same';
  return jaccard === 0 ? 'disjoint' : 'partial';
}
function quantileNearest(values, p) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  return rows.length ? rows[Math.round((rows.length - 1) * p)] : null;
}
function metricRows(values) {
  return {
    n: values.filter(Number.isFinite).length,
    min: quantileNearest(values, 0),
    p10: quantileNearest(values, .1),
    median: quantileNearest(values, .5),
    p90: quantileNearest(values, .9),
    max: quantileNearest(values, 1),
    mean: values.filter(Number.isFinite).length
      ? values.filter(Number.isFinite).reduce((sum, value) => sum + value, 0) / values.filter(Number.isFinite).length : null
  };
}
function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}
function channelValue(track, key) {
  return track.observations.map(row => row[key]);
}
function trackCorrelations(tracks, xKey, yKey) {
  const coefficients = [], pairCounts = [];
  for (const track of tracks) {
    const result = correlation(channelValue(track, xKey), channelValue(track, yKey));
    if (result.n >= 3 && result.spearman !== null) coefficients.push(result.spearman);
    if (result.n >= 3) pairCounts.push(result.n);
  }
  return { tracks: coefficients.length, pairCounts: metricRows(pairCounts), spearman: distribution(coefficients) };
}
function trackClass(track) {
  const distances = track.observations.map(row => row.entryDistance);
  if (distances.every(value => value <= .15)) return 'entry';
  if (distances.every(value => value > .15)) return 'nonentry';
  return 'mixed';
}
function trackDuration(track) {
  const rows = track.observations;
  return rows.length ? (rows.at(-1).timeMs - rows[0].timeMs) / 1000 : 0;
}
function directRankDynamics(previous, current) {
  const oldByTrack = new Map(previous.map(row => [String(row.trackId), row]));
  const matched = current.filter(row => oldByTrack.has(String(row.trackId)))
    .map(row => ({ before: oldByTrack.get(String(row.trackId)).value, after: row.value }));
  let crossings = 0;
  for (let i = 0; i < matched.length; i++) for (let j = i + 1; j < matched.length; j++) {
    const before = matched[i].before - matched[j].before;
    const after = matched[i].after - matched[j].after;
    if (before !== 0 && after !== 0 && before * after < 0) crossings++;
  }
  return { matched: matched.length, crossings };
}
function nearestLagPair(rows, currentIndex, lagMs) {
  const current = rows[currentIndex];
  const target = current.timeMs - lagMs;
  let best = null;
  for (let i = 0; i < currentIndex; i++) {
    const candidate = rows[i];
    const error = Math.abs(candidate.timeMs - target);
    if (!best || error < best.error || (error === best.error && candidate.timeMs < best.timeMs)) {
      best = { index: i, error, timeMs: candidate.timeMs };
    }
  }
  return best && best.timeMs <= current.timeMs ? best.index : null;
}
function lagChangeRows(track, channel) {
  const result = {};
  for (const lag of ['analysis', 5, 20]) {
    const rankPairs = [], valuePairs = [];
    for (let i = 1; i < track.observations.length; i++) {
      const previousIndex = lag === 'analysis'
        ? (track.observations[i].anchorIndex === track.observations[i - 1].anchorIndex + 1 ? i - 1 : null)
        : nearestLagPair(track.observations, i, lag * 1000);
      if (previousIndex === null) continue;
      const before = track.observations[previousIndex], after = track.observations[i];
      rankPairs.push({ before: before.rank, after: after.rank, delta: after.rank - before.rank });
      valuePairs.push({ before: before.value, after: after.value, delta: after.value - before.value });
    }
    const rankCorr = correlation(rankPairs.map(row => row.before), rankPairs.map(row => row.after));
    const stateCorr = correlation(valuePairs.map(row => row.before), valuePairs.map(row => row.after));
    result[String(lag)] = {
      pairCount: rankPairs.length,
      trackId: track.id,
      medianAbsoluteRankShift: distribution(rankPairs.map(row => Math.abs(row.delta))).median,
      p90AbsoluteRankShift: distribution(rankPairs.map(row => Math.abs(row.delta))).p90,
      signedRankShift: distribution(rankPairs.map(row => row.delta)),
      medianAbsoluteStateChange: distribution(valuePairs.map(row => Math.abs(row.delta))).median,
      rankSpearman: rankCorr.spearman, stateSpearman: stateCorr.spearman, statePearson: stateCorr.pearson
    };
  }
  return result;
}
function summarizeLagPersistence(tracks) {
  const output = {};
  for (const lag of ['analysis', '5', '20']) {
    const shifts = [], stateChanges = [], correlations = [], stateCorrelations = [], statePearson = [], pairCounts = [];
    for (const track of tracks) {
      const row = track.rankLag[lag];
      if (!row || !row.pairCount) continue;
      if (Number.isFinite(row.medianAbsoluteRankShift)) shifts.push(row.medianAbsoluteRankShift);
      if (Number.isFinite(row.medianAbsoluteStateChange)) stateChanges.push(row.medianAbsoluteStateChange);
      if (Number.isFinite(row.rankSpearman)) correlations.push(row.rankSpearman);
      if (Number.isFinite(row.stateSpearman)) stateCorrelations.push(row.stateSpearman);
      if (Number.isFinite(row.statePearson)) statePearson.push(row.statePearson);
      pairCounts.push(row.pairCount);
    }
    output[lag] = { trackCount: pairCounts.length, pairsPerTrack: metricRows(pairCounts),
      medianOfTrackMedianAbsoluteRankShift: distribution(shifts),
      medianOfTrackMedianAbsoluteStateChange: distribution(stateChanges),
      perTrackRankSpearman: distribution(correlations),
      perTrackStateSpearman: distribution(stateCorrelations),
      perTrackStatePearson: distribution(statePearson) };
  }
  return output;
}
function regionKey(index) {
  const col = index % GRID, row = Math.floor(index / GRID);
  return String(Math.min(7, Math.floor(col / 12))) + ',' + String(Math.min(7, Math.floor(row / 12)));
}
function longestZeroRun(track, key) {
  let run = [], longest = [];
  for (const row of track.observations) {
    if (row[key] === 0) {
      if (run.length && row.anchorIndex !== run.at(-1).anchorIndex + 1) {
        if (run.length > longest.length) longest = run;
        run = [];
      }
      run.push(row);
    } else if (run.length) {
      if (run.length > longest.length) longest = run;
      run = [];
    }
  }
  if (run.length > longest.length) longest = run;
  return longest.length ? (longest.at(-1).timeMs - longest[0].timeMs) / 1000 : 0;
}
function summarizeChannel(seed, channel, tracks, anchors, uniqueGeometry, previousSummary, xFamily) {
  const subset = [...tracks.values()].filter(track => track.channel === channel);
  const classes = { entry: [], nonentry: [], mixed: [] };
  for (const track of subset) classes[trackClass(track)].push(track);
  const durations = subset.map(trackDuration), observations = subset.flatMap(track => track.observations);
  const ratios = anchors.map(anchor => anchor.channels[channel].bestOutsideToOverall).filter(Number.isFinite);
  const winners = anchors.filter(anchor => anchor.channels[channel].winner);
  const rankDynamics = { matchedCenterTransitions: 0, strictStrengthRankCrossings: 0,
    pairedWinnerBoundaries: 0, winnerTrackChangesAll: 0, winnerNucleusChanges: 0 };
  for (let i = 1; i < anchors.length; i++) {
    const before = anchors[i - 1].channels[channel].rows, after = anchors[i].channels[channel].rows;
    const counts = directRankDynamics(before, after);
    rankDynamics.matchedCenterTransitions += counts.matched;
    rankDynamics.strictStrengthRankCrossings += counts.crossings;
    if (before.length && after.length) {
      rankDynamics.pairedWinnerBoundaries++;
      rankDynamics.winnerTrackChangesAll += Number(String(before[0].trackId) !== String(after[0].trackId));
      rankDynamics.winnerNucleusChanges += Number(before[0].index !== after[0].index);
    }
  }
  const registered = previousSummary.rankDynamics.find(row => row.channel === channel
    && row.representation === 'g15' && row.cutoff === .025);
  for (const key of Object.keys(rankDynamics)) assert.equal(rankDynamics[key], registered[key],
    'independent rank arithmetic ' + seed + ' ' + channel + ' ' + key);
  const centerCounts = anchors.map(anchor => anchor.channels[channel].rows.length);
  const outsideObs = observations.filter(row => row.entryDistance > .15);
  const nonentryWinners = winners.filter(anchor => anchor.channels[channel].winner.entryDistance > .15);
  const regionCounts = {};
  for (const row of observations) regionCounts[regionKey(row.centerIndex)] = (regionCounts[regionKey(row.centerIndex)] ?? 0) + 1;
  const trackDrift = subset.map(track => {
    const rows = track.observations, first = rows[0], last = rows.at(-1);
    let path = 0;
    for (let i = 1; i < rows.length; i++) path += distance(point(rows[i - 1].centerIndex), point(rows[i].centerIndex));
    return { net: distance(point(first.centerIndex), point(last.centerIndex)), path };
  });
  const activityKey = channel === 'B' ? 'xTravel5' : 'xFeet5';
  const zeroObservationRows = observations.filter(row => row[activityKey] === 0);
  const zeroRunDurations = subset.map(track => longestZeroRun(track, activityKey));
  const pairedRows = observations.filter(row => Number.isFinite(row.nearestOtherXJaccard));
  const pairedTrackMedians = subset.map(track => distribution(track.observations
    .map(row => row.nearestOtherXJaccard).filter(Number.isFinite)).median).filter(Number.isFinite);
  const pairedTrackDistances = subset.map(track => distribution(track.observations
    .map(row => row.nearestOtherDistance).filter(Number.isFinite)).median).filter(Number.isFinite);
  const maxEntryTrack = (rows => rows.sort((a, b) => trackDuration(b) - trackDuration(a)
    || a.id - b.id)[0] ?? null)(classes.entry.slice());
  const maxNonentryTrack = (rows => rows.sort((a, b) => trackDuration(b) - trackDuration(a)
    || a.id - b.id)[0] ?? null)(classes.nonentry.slice());
  const maxMixedTrack = (rows => rows.sort((a, b) => trackDuration(b) - trackDuration(a)
    || a.id - b.id)[0] ?? null)(classes.mixed.slice());
  const xMetric = uniqueGeometry[channel];
  const xReference = xFamily.seeds.find(row => row.seed === seed).channels[channel];
  const qcheck = (metric, values) => {
    const ref = xReference.metricQuantiles[metric];
    assert.equal(values.length, ref.n, 'unique X metric count ' + seed + ' ' + channel + ' ' + metric);
    assert.equal(quantileNearest(values, .5), ref.median, 'unique X median ' + seed + ' ' + channel + ' ' + metric);
  };
  qcheck('nodeCount', xMetric.nodeCount);
  qcheck('overlapFraction', xMetric.overlapFraction);
  qcheck('meanLayers', xMetric.meanLayers);
  const correlations = channel === 'B' ? {
    stateVsCenterTravel1: trackCorrelations(subset, 'value', 'centerTravel1'),
    stateVsCenterTravel5: trackCorrelations(subset, 'value', 'centerTravel5'),
    stateVsCenterTravel20: trackCorrelations(subset, 'value', 'centerTravel20'),
    deltaB1VsCenterTravel1: trackCorrelations(subset, 'centerDeltaB1', 'centerTravel1'),
    deltaB5VsCenterTravel5: trackCorrelations(subset, 'centerDeltaB5', 'centerTravel5'),
    deltaB20VsCenterTravel20: trackCorrelations(subset, 'centerDeltaB20', 'centerTravel20'),
    stateVsXTravel1: trackCorrelations(subset, 'xBMean', 'xTravel1'),
    stateVsXTravel5: trackCorrelations(subset, 'xBMean', 'xTravel5'),
    stateVsXTravel20: trackCorrelations(subset, 'xBMean', 'xTravel20'),
    deltaB1VsXTravel1: trackCorrelations(subset, 'xDeltaB1Mean', 'xTravel1'),
    deltaB5VsXTravel5: trackCorrelations(subset, 'xDeltaB5Mean', 'xTravel5'),
    deltaB20VsXTravel20: trackCorrelations(subset, 'xDeltaB20Mean', 'xTravel20'),
    stateVsXTravel5AtCenter: trackCorrelations(subset, 'value', 'xTravel5')
  } : {
    stateVsCenterFeet1: trackCorrelations(subset, 'value', 'centerFeet1'),
    stateVsCenterFeet5: trackCorrelations(subset, 'value', 'centerFeet5'),
    stateVsCenterFeet20: trackCorrelations(subset, 'value', 'centerFeet20'),
    deltaC1VsCenterFeet1: trackCorrelations(subset, 'centerDeltaC1', 'centerFeet1'),
    deltaC5VsCenterFeet5: trackCorrelations(subset, 'centerDeltaC5', 'centerFeet5'),
    deltaC20VsCenterFeet20: trackCorrelations(subset, 'centerDeltaC20', 'centerFeet20'),
    stateVsXFeet1: trackCorrelations(subset, 'xCMean', 'xFeet1'),
    stateVsXFeet5: trackCorrelations(subset, 'xCMean', 'xFeet5'),
    stateVsXFeet20: trackCorrelations(subset, 'xCMean', 'xFeet20'),
    deltaC1VsXFeet1: trackCorrelations(subset, 'xDeltaC1Mean', 'xFeet1'),
    deltaC5VsXFeet5: trackCorrelations(subset, 'xDeltaC5Mean', 'xFeet5'),
    deltaC20VsXFeet20: trackCorrelations(subset, 'xDeltaC20Mean', 'xFeet20'),
    stateVsXFeet5AtCenter: trackCorrelations(subset, 'value', 'xFeet5')
  };
  const metric = key => distribution(observations.map(row => row[key]));
  return {
    seed, channel, responsibility: channel === 'B' ? 'qualified-chemical-history' : 'contact-written-compaction',
    availability: { boundaries: anchors.length, boundariesWithCandidates: winners.length,
      candidateCountPerBoundary: distribution(centerCounts), centerObservations: observations.length,
      outsideCenterObservationFraction: outsideObs.length / observations.length,
      coarse8x8OccupiedRegions: Object.keys(regionCounts).length, coarse8x8ObservationCounts: regionCounts },
    tracks: { total: subset.length, singletons: subset.filter(track => track.observations.length === 1).length,
      durationSeconds: distribution(durations),
      durationByClass: Object.fromEntries(Object.keys(classes).map(name => [name, {
        count: classes[name].length, distribution: distribution(classes[name].map(trackDuration))
      }])),
      longestWhollyEntry: maxEntryTrack ? { id: maxEntryTrack.id, durationSeconds: trackDuration(maxEntryTrack),
        observations: maxEntryTrack.observations.length } : null,
      longestWhollyNonentry: maxNonentryTrack ? { id: maxNonentryTrack.id, durationSeconds: trackDuration(maxNonentryTrack),
        observations: maxNonentryTrack.observations.length } : null,
      longestMixed: maxMixedTrack ? { id: maxMixedTrack.id, durationSeconds: trackDuration(maxMixedTrack),
        observations: maxMixedTrack.observations.length } : null,
      centerNetDrift: distribution(trackDrift.map(row => row.net)),
      centerPathLength: distribution(trackDrift.map(row => row.path)) },
    hierarchy: { strongestNonentryToOverallRatio: distribution(ratios),
      winnerTrackChangesAll: rankDynamics.winnerTrackChangesAll, winnerCenterChanges: rankDynamics.winnerNucleusChanges,
      pairedWinnerBoundaries: rankDynamics.pairedWinnerBoundaries,
      nonentryWinnerBoundaryFraction: nonentryWinners.length / (winners.length || 1),
      distinctNonentryWinnerTracks: new Set(nonentryWinners.map(row => row.channels[channel].winner.trackId)).size,
      strictMatchedTrackRankCrossings: rankDynamics.strictStrengthRankCrossings,
      matchedTrackTransitions: rankDynamics.matchedCenterTransitions,
      independentArithmeticMatchesSavedAudit: true },
    inertia: { oneAnalysisAnd5s20s: summarizeLagPersistence(subset),
      noSubstantialityThresholdUsed: true,
      rawRankDisplacementAtActualLags: 'See track observations; analysis, nearest prior 5 s and nearest prior 20 s rank shifts are retained per track.',
      zeroRecentInputInsideChangingX: { input: channel === 'B' ? 'realized travel5' : 'FOOT_CONTACT individual feet5',
        observations: zeroObservationRows.length, fraction: zeroObservationRows.length / observations.length,
        trackCountWithAnyZero: subset.filter(track => track.observations.some(row => row[activityKey] === 0)).length,
        longestZeroRunSeconds: distribution(zeroRunDurations),
        channelRankDuringZeroInput: distribution(zeroObservationRows.map(row => row.rank)),
        channelValueDuringZeroInput: distribution(zeroObservationRows.map(row => row.value)) } },
    activityRelation: { trackwiseSpearman: correlations,
      recentInputAtCenter: channel === 'B'
        ? Object.fromEntries(WINDOWS.map(window => ['travel' + window, metric('centerTravel' + window)]))
        : Object.fromEntries(WINDOWS.flatMap(window => [['feet' + window, metric('centerFeet' + window)],
          ['distinctAnts' + window, metric('centerFeetAnts' + window)]])),
      recentInputInsideChangingX: channel === 'B'
        ? Object.fromEntries(WINDOWS.map(window => ['travel' + window, metric('xTravel' + window)]))
        : Object.fromEntries(WINDOWS.flatMap(window => [['feet' + window, metric('xFeet' + window)],
          ['antCellIncidences' + window, metric('xFeetAntCellIncidences' + window)]])),
      centerDistinctAntCountsAtFeet1: channel === 'C' ? metric('centerFeetAnts1') : null,
      centerDistinctAntCountsAtFeet5: channel === 'C' ? metric('centerFeetAnts5') : null,
      xAntCellIncidencesAtFeet5: channel === 'C' ? metric('xFeetAntCellIncidences5') : null },
    pairedOppositeChannelTrack: { observationsWithSameComponentNearest: pairedRows.length,
      reciprocalObservationFraction: pairedRows.length
        ? pairedRows.filter(row => row.nearestOtherReciprocal).length / pairedRows.length : null,
      nearestCenterDistance: metricRows(pairedRows.map(row => row.nearestOtherDistance)),
      nearestAssociatedXJaccard: metricRows(pairedRows.map(row => row.nearestOtherXJaccard)),
      exactDisjointFraction: pairedRows.length
        ? pairedRows.filter(row => row.nearestOtherXJaccard === 0).length / pairedRows.length : null,
      exactSameFraction: pairedRows.length
        ? pairedRows.filter(row => row.nearestOtherXJaccard === 1).length / pairedRows.length : null,
      perTrackMedianNearestXJaccard: distribution(pairedTrackMedians),
      perTrackMedianNearestCenterDistance: distribution(pairedTrackDistances) },
    associatedX: { availableObservations: observations.length,
      connectedAndInsideRegisteredRadius: observations.every(row => row.xConnected && row.xRadiusValid),
      nodeCount: metric('xNodeCount'), edgeCount: metric('xEdgeCount'), endpoints: metric('xEndpoints'),
      junctions: metric('xJunctions'), cycleRank: metric('xCycleRank'), maxRadius: metric('xMaxRadius'),
      entryDistanceOfCenter: metric('entryDistance'), centroidDistanceToEntry: metric('xCentroidEntryDistance'),
      adjacentJaccard: metric('xAdjacentJaccard'), priorMaterialOverlap: metric('xMaterialOverlap'),
      localMeanLayers: metric('xMeanLayers'), localMaximumLayers: metric('xMaxLayers'),
      timeSinceLatestPriorLocalBirthSeconds: metric('xLatestBirthAgeSeconds'),
      stateAndInputAtTrackObservation: 'Per-observation X means, rolling FOOT_CONTACT/travel totals and channel changes are in the track receipt.',
      xToMaxDWinnerJaccard: metric('xToMaxDJaccard'),
      xExactlyDisjointFromMaxDWinnerFraction: observations.filter(row => row.xToMaxDJaccard === 0).length / observations.length },
    rawMetricDistributions: {
      state: metric('value'), rank: metric('rank'),
      centerSignedDelta1: metric(channel === 'B' ? 'centerDeltaB1' : 'centerDeltaC1'),
      centerSignedDelta5: metric(channel === 'B' ? 'centerDeltaB5' : 'centerDeltaC5'),
      centerSignedDelta20: metric(channel === 'B' ? 'centerDeltaB20' : 'centerDeltaC20')
    },
    uniqueXGeometryCrosscheck: { uniqueCaptures: xMetric.nodeCount.length,
      nodeCountMedianMatchesFrozenXSummary: true, overlapMedianMatchesFrozenXSummary: true,
      meanLayersMedianMatchesFrozenXSummary: true }
  };
}

function addTrackObservation(trackMap, row, channel, anchorIndex, timeMs, capture, xSet, previous) {
  const trackId = row.trackIds?.['0.025'];
  assert.ok(Number.isInteger(trackId), 'registered .025 grouped track id');
  const key = channel + ':' + trackId;
  const track = trackMap.get(key) ?? { id: trackId, channel, observations: [] };
  const prior = previous.get(key);
  const xJaccard = prior && prior.anchorIndex === anchorIndex - 1
    ? overlap(prior.xSet, xSet).jaccard : null;
  const observation = {
    anchorIndex, timeMs, centerIndex: row.index, entryDistance: row.entryDistance,
    value: row.value, rank: row.rank, component: row.component, captureId: row.captureId,
    xNodeCount: capture.nodeCount, xEdgeCount: capture.edgeCount, xEndpoints: capture.endpoints,
    xJunctions: capture.junctions, xCycleRank: capture.cycleRank, xConnected: capture.connected,
    xRadiusValid: capture.radiusValid, xMaxRadius: capture.maxRadius,
    xCentroid: capture.centroid, xCentroidEntryDistance: Math.hypot(capture.centroid.x - ENTRY.x, capture.centroid.y - ENTRY.y),
    xAdjacentJaccard: xJaccard,
    xMaterialOverlap: capture.material.overlapFraction, xMeanLayers: capture.material.meanLayers,
    xMaxLayers: capture.material.maxLayers,
    xLatestBirthAgeSeconds: capture.material.latestBirthAgeSeconds ?? null,
    xToMaxDJaccard: capture.xToMaxDJaccard,
    ...capture.sampledSignals
  };
  track.observations.push(observation);
  trackMap.set(key, track);
  return { key, observation };
}

function summarizePairJaccards(rows, captures, setCache) {
  const values = [], counts = { same: 0, disjoint: 0, partial: 0 };
  for (const left of rows.left) for (const right of rows.right) {
    const ov = overlap(setFor(captures.get(left.captureId), setCache), setFor(captures.get(right.captureId), setCache));
    counts[typeOverlap(ov.jaccard, ov.identical)]++;
    values.push(ov.jaccard);
  }
  return { n: values.length, counts, mean: mean(values), median: distribution(values).median, p10: distribution(values).p10,
    p90: distribution(values).p90, exactDisjointFraction: values.length ? counts.disjoint / values.length : null,
    exactSameFraction: values.length ? counts.same / values.length : null };
}
function matchOverlapSummary(pairs, leftByIndex, rightByIndex, captures, setCache) {
  const rows = pairs.map(pair => {
    const a = leftByIndex.get(pair.a), b = rightByIndex.get(pair.b);
    const ov = overlap(setFor(captures.get(a.captureId), setCache), setFor(captures.get(b.captureId), setCache));
    return { ...pair, jaccard: ov.jaccard, identical: ov.identical, type: typeOverlap(ov.jaccard, ov.identical) };
  });
  const counts = { same: 0, disjoint: 0, partial: 0 };
  for (const row of rows) counts[row.type]++;
  const values = rows.map(row => row.jaccard);
  return { pairs: rows.length, counts, jaccard: distribution(values),
    exactDisjointFraction: rows.length ? counts.disjoint / rows.length : null,
    exactSameFraction: rows.length ? counts.same / rows.length : null, rows };
}
async function sampleXForCases(candidates, perSeed) {
  const wanted = new Map();
  for (const candidate of candidates) {
    const points = [candidate.observations[0], candidate.observations[Math.floor((candidate.observations.length - 1) / 2)],
      candidate.observations.at(-1)];
    for (const row of points) {
      if (!wanted.has(candidate.seed)) wanted.set(candidate.seed, new Set());
      wanted.get(candidate.seed).add(row.anchorIndex);
    }
  }
  const snapshots = new Map();
  for (const [seed, indices] of wanted) {
    const index = perSeed.get(seed).opportunityIndex;
    for (const anchorIndex of indices) {
      const fileIndex = Math.floor(anchorIndex / 10);
      const file = index.anchorsFiles[fileIndex];
      const bytes = await readFile(resolve(INPUT, 'analysis', file));
      assert.equal(sha256(bytes), index.chunkHashes[file], 'case anchor chunk hash ' + file);
      const chunk = JSON.parse(gunzipSync(bytes).toString('utf8'));
      const anchor = chunk.anchors.find(row => row.index === anchorIndex);
      assert.ok(anchor, 'case anchor in frozen packet');
      const captures = new Map(anchor.captures.map(row => [row.id, row]));
      const dWinner = anchor.channels.D?.g15?.[0] ?? null;
      const dCapture = dWinner ? captures.get(dWinner.captureId) : null;
      snapshots.set(seed + ':' + anchorIndex, { anchorIndex, timeMs: anchor.timeMs,
        maxD: dWinner && dCapture ? { centerIndex: dWinner.index, cells: dCapture.cells } : null });
      for (const candidate of candidates.filter(row => row.seed === seed)) {
        for (const pointRow of candidate.observations.filter(row => row.anchorIndex === anchorIndex)) {
          const capture = captures.get(pointRow.captureId);
          assert.ok(capture, 'case X exists in original frozen anchor');
          snapshots.get(seed + ':' + anchorIndex)[candidate.channel + ':' + candidate.trackId] = {
            centerIndex: pointRow.centerIndex, cells: capture.cells, material: capture.material,
            centroid: capture.centroid, nodeCount: capture.nodeCount
          };
        }
      }
    }
  }
  for (const candidate of candidates) {
    const n = candidate.observations.length;
    const uniquePositions = [0, Math.floor((n - 1) / 2), n - 1];
    candidate.xSnapshots = uniquePositions.map(position => {
      const row = candidate.observations[position];
      return snapshots.get(candidate.seed + ':' + row.anchorIndex);
    });
  }
  return candidates;
}
function selectLocalCases(seed, tracks) {
  const subset = [...tracks.values()].filter(track => track.observations.length);
  const selectDuration = (channel, klass, category) => {
    const choices = subset.filter(track => track.channel === channel && trackClass(track) === klass);
    choices.sort((a, b) => trackDuration(b) - trackDuration(a) || a.id - b.id);
    return choices[0] ? caseRecord(seed, category, choices[0]) : null;
  };
  const selectStrength = channel => {
    const choices = subset.filter(track => track.channel === channel && trackClass(track) === 'nonentry'
      && track.observations.length >= 2);
    choices.sort((a, b) => mean(a.observations.map(row => row.rank)) - mean(b.observations.map(row => row.rank))
      || trackDuration(b) - trackDuration(a) || a.id - b.id);
    return choices[0] ? caseRecord(seed, 'strongest-sustained-nonentry-' + channel, choices[0]) : null;
  };
  return [
    selectDuration('B', 'nonentry', 'longest-nonentry-B'),
    selectDuration('C', 'nonentry', 'longest-nonentry-C'),
    selectDuration('B', 'entry', 'longest-entry-B'),
    selectDuration('C', 'entry', 'longest-entry-C'),
    selectStrength('B'), selectStrength('C')
  ].filter(Boolean);
}
function caseRecord(seed, category, track) {
  return { seed, category, channel: track.channel, trackId: track.id,
    locationClass: trackClass(track), durationSeconds: trackDuration(track),
    observationCount: track.observations.length,
    meanWithinChannelRank: mean(track.observations.map(row => row.rank)),
    medianWithinChannelRank: distribution(track.observations.map(row => row.rank)).median,
    observations: track.observations };
}
function makeActivity(arrays, cells) {
  const result = {};
  for (const window of WINDOWS) {
    const w = String(window);
    const sum = key => cells.reduce((total, cell) => total + arrays[key][cell], 0);
    result['xFeet' + window] = sum('feetCount' + w);
    result['xFeetAntCellIncidences' + window] = sum('feetAnts' + w);
    result['xTravel' + window] = sum('travel' + w);
  }
  return result;
}
function captureSignalSummary(capture, arrays) {
  const cells = capture.cells, n = cells.length;
  const avg = key => arrays[key] ? cells.reduce((total, cell) => total + arrays[key][cell], 0) / n : null;
  const sums = makeActivity(arrays, cells);
  let latestBirthMs = -1;
  for (const cell of cells) if (arrays.lastBirthMs[cell] >= 0) latestBirthMs = Math.max(latestBirthMs, arrays.lastBirthMs[cell]);
  return {
    sampledSignals: {
      xBMean: avg('B'), xCMean: avg('C'),
      xDeltaB1Mean: avg('deltaB1'), xDeltaB5Mean: avg('deltaB5'), xDeltaB20Mean: avg('deltaB20'),
      xDeltaC1Mean: avg('deltaC1'), xDeltaC5Mean: avg('deltaC5'), xDeltaC20Mean: avg('deltaC20'),
      xLatestBirthAgeSeconds: latestBirthMs < 0 ? null : (arrays.timeMs - latestBirthMs) / 1000,
      ...sums
    }
  };
}
function channelArrays(signal, anchor) {
  const arrays = { B: unpack(signal.B), C: unpack(signal.C), lastBirthMs: unpack(signal.material.lastBirthMs),
    timeMs: signal.timeMs };
  for (const window of WINDOWS) {
    const w = String(window);
    arrays['deltaB' + w] = unpack(anchor.delta['deltaB' + w]);
    arrays['deltaC' + w] = unpack(anchor.delta['deltaC' + w]);
    arrays['feetCount' + w] = unpack(signal.feet[w].count);
    arrays['feetAnts' + w] = unpack(signal.feet[w].ants);
    arrays['travel' + w] = unpack(signal.traffic[w].travel);
    arrays['travelAnts' + w] = unpack(signal.traffic[w].ants);
  }
  return arrays;
}
function sampleAtCenter(arrays, index) {
  const result = {};
  for (const channel of CHANNELS) result['center' + channel] = arrays[channel][index];
  for (const channel of CHANNELS) for (const window of WINDOWS) {
    const values = arrays['delta' + channel + window];
    result['centerDelta' + channel + window] = values ? values[index] : null;
  }
  for (const window of WINDOWS) {
    result['centerFeet' + window] = arrays['feetCount' + window][index];
    result['centerFeetAnts' + window] = arrays['feetAnts' + window][index];
    result['centerTravel' + window] = arrays['travel' + window][index];
  }
  return result;
}
function compareOldRankDynamics(summary, seed, channel, row) {
  const old = summary.seeds.find(item => item.seed === seed).rankDynamics.find(item =>
    item.channel === channel && item.representation === 'g15' && item.cutoff === .025);
  for (const key of ['matchedCenterTransitions', 'strictStrengthRankCrossings', 'pairedWinnerBoundaries',
    'winnerTrackChangesAll', 'winnerNucleusChanges']) assert.equal(row[key], old[key], 'saved aggregate ' + key);
}
async function analyzeSeed(seed, originalSummary, xFamily) {
  const opportunityPath = resolve(INPUT, 'analysis', 'seed-' + seed + '.opportunities.json.gz');
  const signalPath = resolve(INPUT, 'analysis', 'seed-' + seed + '.signals.json.gz');
  const crossPath = resolve(INPUT, 'analysis', 'seed-' + seed + '.cross-channel.json.gz');
  const opportunityBytes = await readFile(opportunityPath), signalBytes = await readFile(signalPath), crossBytes = await readFile(crossPath);
  const opportunityIndex = JSON.parse(gunzipSync(opportunityBytes).toString('utf8'));
  const signalIndex = JSON.parse(gunzipSync(signalBytes).toString('utf8'));
  assert.equal(opportunityIndex.authority, AUTHORITY); assert.equal(signalIndex.authority, AUTHORITY);
  assert.equal(opportunityIndex.seed, seed); assert.equal(signalIndex.seed, seed);
  const signals = await readRun(signalPath);
  assert.equal(signals.anchors.length, 599);
  const cross = JSON.parse(gunzipSync(crossBytes).toString('utf8'));
  const crossRows = new Map(cross.rows.filter(row => row.a === 'B' && row.b === 'C').map(row => [row.anchorIndex, row]));
  assert.equal(crossRows.size, 599);
  const inputChunks = [];
  const tracks = new Map(), prev = new Map(), anchors = [];
  const uniqueGeometry = { B: { nodeCount: [], overlapFraction: [], meanLayers: [] },
    C: { nodeCount: [], overlapFraction: [], meanLayers: [] } };
  for (const file of opportunityIndex.anchorsFiles) {
    const bytes = await readFile(resolve(INPUT, 'analysis', file));
    assert.equal(sha256(bytes), opportunityIndex.chunkHashes[file], 'opportunity anchor hash ' + file);
    inputChunks.push({ kind: 'opportunity-anchor', file, sha256: sha256(bytes) });
    const pack = JSON.parse(gunzipSync(bytes).toString('utf8'));
    for (const anchor of pack.anchors) {
      const signal = signals.anchors[anchor.index];
      assert.equal(signal.index, anchor.index); assert.equal(signal.timeMs, anchor.timeMs);
      const arrays = channelArrays(signal, anchor);
      const captures = new Map(anchor.captures.map(capture => [capture.id, capture]));
      const setCache = new Map();
      const rows = {};
      for (const channel of CHANNELS) {
        const candidates = anchor.channels[channel]?.g15 ?? [];
        rows[channel] = candidates;
        const unique = new Set();
        for (const row of candidates) {
          assert.ok(row.value > 0 && row.trackIds?.['0.025'] !== undefined);
          assert.equal(arrays[channel][row.index], row.value, channel + ' candidate equals native state');
          const capture = captures.get(row.captureId); assert.ok(capture);
          assert.ok(capture.connected && capture.radiusValid && capture.cells.includes(row.index));
          const dWinner = anchor.channels.D?.g15?.[0] ?? null;
          const dCapture = dWinner ? captures.get(dWinner.captureId) : null;
          const xToMaxDJaccard = dCapture
            ? overlap(setFor(capture, setCache), setFor(dCapture, setCache)).jaccard : null;
          capture.sampledSignals = captureSignalSummary(capture, arrays).sampledSignals;
          capture.xToMaxDJaccard = xToMaxDJaccard;
          const centerSamples = sampleAtCenter(arrays, row.index);
          const trackKey = channel + ':' + row.trackIds['0.025'];
          const prior = prev.get(trackKey);
          const localCapture = { ...capture, sampledSignals: { ...capture.sampledSignals, ...centerSamples,
            xToMaxDJaccard }, xToMaxDJaccard };
          addTrackObservation(tracks, row, channel, anchor.index, anchor.timeMs, localCapture,
            setFor(capture, setCache), prev);
          if (!unique.has(row.captureId)) {
            unique.add(row.captureId);
            uniqueGeometry[channel].nodeCount.push(capture.nodeCount);
            uniqueGeometry[channel].overlapFraction.push(capture.material.overlapFraction);
            uniqueGeometry[channel].meanLayers.push(capture.material.meanLayers);
          }
          if (prior) assert.equal(prior.anchorIndex, anchor.index - 1, 'track correspondence is adjacent only');
        }
      }
      const left = rows.B, right = rows.C;
      const allPairOverlap = summarizePairJaccards({ left, right }, captures, setCache);
      const actual025 = recenter({ left, right }, .025), actual075 = recenter({ left, right }, .075);
      const registered = crossRows.get(anchor.index);
      compareMatchLists(actual025, registered.matches025);
      compareMatchLists(actual075, registered.matches075);
      const byB = new Map(left.map(row => [row.index, row])), byC = new Map(right.map(row => [row.index, row]));
      const nearestB = directionalNearest(left, right), nearestC = directionalNearest(right, left);
      const reverseB = new Map(nearestC.filter(Boolean).map((row, i) => [row.index, right[i].index]));
      const reverseC = new Map(nearestB.filter(Boolean).map((row, i) => [row.index, left[i].index]));
      const reciprocalNoCutoff = [];
      for (let i = 0; i < left.length; i++) if (nearestB[i] && reverseB.get(nearestB[i].index) === left[i].index) {
        reciprocalNoCutoff.push({ a: left[i].index, b: nearestB[i].index, distance: nearestB[i].distance });
      }
      const match025 = matchOverlapSummary(actual025, byB, byC, captures, setCache);
      const match075 = matchOverlapSummary(actual075, byB, byC, captures, setCache);
      const matchNoCutoff = matchOverlapSummary(reciprocalNoCutoff, byB, byC, captures, setCache);
      const bNearestRows = left.map((row, i) => {
        const near = nearestB[i];
        if (!near) return { index: row.index, otherIndex: null, distance: null, reciprocal: false, jaccard: null };
        const other = byC.get(near.index), ov = overlap(setFor(captures.get(row.captureId), setCache),
          setFor(captures.get(other.captureId), setCache));
        return { index: row.index, otherIndex: near.index, distance: near.distance,
          reciprocal: reverseB.get(near.index) === row.index, jaccard: ov.jaccard, identical: ov.identical };
      });
      const cNearestRows = right.map((row, i) => {
        const near = nearestC[i];
        if (!near) return { index: row.index, otherIndex: null, distance: null, reciprocal: false, jaccard: null };
        const other = byB.get(near.index), ov = overlap(setFor(captures.get(row.captureId), setCache),
          setFor(captures.get(other.captureId), setCache));
        return { index: row.index, otherIndex: near.index, distance: near.distance,
          reciprocal: reverseC.get(near.index) === row.index, jaccard: ov.jaccard, identical: ov.identical };
      });
      for (const [channel, nearestRows] of [['B', bNearestRows], ['C', cNearestRows]]) {
        for (const near of nearestRows) {
          const row = (channel === 'B' ? byB : byC).get(near.index);
          const key = channel + ':' + row.trackIds['0.025'];
          const track = tracks.get(key), observation = track.observations.at(-1);
          observation.nearestOtherCenterIndex = near.otherIndex;
          observation.nearestOtherDistance = near.distance;
          observation.nearestOtherReciprocal = near.reciprocal;
          observation.nearestOtherXJaccard = near.jaccard;
        }
      }
      const pairBoundary = {
        anchorIndex: anchor.index, timeMs: anchor.timeMs, centersB: left.length, centersC: right.length,
        allCandidatePairs: allPairOverlap,
        sameComponentReciprocalNoCutoff: matchNoCutoff,
        reciprocal025: match025,
        reciprocal075: match075,
        nearestBToC: { observations: bNearestRows.length,
          reciprocalFraction: bNearestRows.length ? bNearestRows.filter(row => row.reciprocal).length / bNearestRows.length : null,
          distance: distribution(bNearestRows.map(row => row.distance)),
          jaccard: distribution(bNearestRows.map(row => row.jaccard)) },
        nearestCToB: { observations: cNearestRows.length,
          reciprocalFraction: cNearestRows.length ? cNearestRows.filter(row => row.reciprocal).length / cNearestRows.length : null,
          distance: distribution(cNearestRows.map(row => row.distance)),
          jaccard: distribution(cNearestRows.map(row => row.jaccard)) },
        winners: { centerDistance: registered.winnerDistance, xJaccard: registered.winnerXJaccard,
          identicalX: registered.sameWinnerX, rankSpearman: registered.rankSpearman,
          reciprocal025Count: registered.matches025.length, reciprocal075Count: registered.matches075.length }
      };
      const nextPrev = new Map();
      for (const channel of CHANNELS) for (const row of rows[channel]) {
        const key = channel + ':' + row.trackIds['0.025'];
        nextPrev.set(key, { anchorIndex: anchor.index, xSet: setFor(captures.get(row.captureId), setCache) });
      }
      prev.clear(); for (const [key, value] of nextPrev) prev.set(key, value);
      anchors.push({ index: anchor.index, timeMs: anchor.timeMs, channels: Object.fromEntries(CHANNELS.map(channel => {
        const candidates = rows[channel], best = candidates[0] ?? null;
        const outside = candidates.find(row => row.entryDistance > .15) ?? null;
        return [channel, { rows: candidates.map(row => ({ index: row.index, component: row.component, value: row.value,
          rank: row.rank, entryDistance: row.entryDistance, trackId: row.trackIds['0.025'], captureId: row.captureId })),
          winner: best ? { index: best.index, trackId: best.trackIds['0.025'], entryDistance: best.entryDistance,
            value: best.value } : null,
          bestOutsideToOverall: outside && best?.value > 0 ? outside.value / best.value : null }];
      })), pairBoundary });
    }
  }
  assert.equal(anchors.length, 599);
  const previousSummary = originalSummary.seeds.find(row => row.seed === seed);
  for (const track of tracks.values()) track.rankLag = lagChangeRows(track, track.channel);
  const channels = Object.fromEntries(CHANNELS.map(channel => [channel,
    summarizeChannel(seed, channel, tracks, anchors, uniqueGeometry, previousSummary, xFamily)]));
  const boundaryRows = anchors.map(row => row.pairBoundary);
  const allPairs = boundaryRows.map(row => row.allCandidatePairs);
  const matches = name => boundaryRows.map(row => row[name]);
  const pairSynthesis = {
    bothAvailableBoundaries: boundaryRows.filter(row => row.centersB && row.centersC).length,
    allCandidatePairCount: allPairs.reduce((sum, row) => sum + row.n, 0),
    allCandidatePairJaccardByBoundaryMedian: distribution(allPairs.map(row => row.median)),
    allCandidatePairExactDisjointFractionByBoundary: distribution(allPairs.map(row => row.exactDisjointFraction)),
    allCandidatePairExactSameFractionByBoundary: distribution(allPairs.map(row => row.exactSameFraction)),
    reciprocalNoCutoff: {
      matchedPairs: matches('sameComponentReciprocalNoCutoff').reduce((sum, row) => sum + row.pairs, 0),
      exactDisjointFractionByBoundary: distribution(matches('sameComponentReciprocalNoCutoff').map(row => row.exactDisjointFraction)),
      exactSameFractionByBoundary: distribution(matches('sameComponentReciprocalNoCutoff').map(row => row.exactSameFraction)),
      xJaccardByPair: distribution(matches('sameComponentReciprocalNoCutoff').flatMap(row => row.rows.map(pair => pair.jaccard)))
    },
    reciprocal025: {
      matchedPairs: matches('reciprocal025').reduce((sum, row) => sum + row.pairs, 0),
      exactDisjointFractionByBoundary: distribution(matches('reciprocal025').map(row => row.exactDisjointFraction)),
      exactSameFractionByBoundary: distribution(matches('reciprocal025').map(row => row.exactSameFraction)),
      xJaccardByPair: distribution(matches('reciprocal025').flatMap(row => row.rows.map(pair => pair.jaccard)))
    },
    reciprocal075: {
      matchedPairs: matches('reciprocal075').reduce((sum, row) => sum + row.pairs, 0),
      exactDisjointFractionByBoundary: distribution(matches('reciprocal075').map(row => row.exactDisjointFraction)),
      exactSameFractionByBoundary: distribution(matches('reciprocal075').map(row => row.exactSameFraction)),
      xJaccardByPair: distribution(matches('reciprocal075').flatMap(row => row.rows.map(pair => pair.jaccard)))
    },
    winnerRelationFromRegisteredCrossReceipt: {
      centerDistance: distribution(boundaryRows.map(row => row.winners.centerDistance)),
      xJaccard: distribution(boundaryRows.map(row => row.winners.xJaccard)),
      sameXFraction: boundaryRows.filter(row => row.winners.identicalX).length / boundaryRows.filter(row => row.centersB && row.centersC).length,
      rankSpearman: distribution(boundaryRows.map(row => row.winners.rankSpearman))
    },
    perBoundary: boundaryRows
  };
  const localCases = selectLocalCases(seed, tracks);
  const trackCorrelationsAndDetails = [...tracks.values()].map(track => {
    track.rankLag ??= lagChangeRows(track, track.channel);
    return track;
  });
  return {
    seed, authority: AUTHORITY, analyses: anchors.length,
    sourceIndices: {
      opportunityIndexSha256: sha256(opportunityBytes), signalIndexSha256: sha256(signalBytes),
      crossChannelSha256: sha256(crossBytes), opportunityChunks: inputChunks,
      signalChunks: signalIndex.anchorsFiles.map(file => ({ file, sha256: signalIndex.chunkHashes[file] })),
      sourceHashes: signalIndex.sourceHashes
    },
    channels, pairedBC: pairSynthesis, cases: localCases,
    observations: trackCorrelationsAndDetails,
    validation: { signalRowsEqualNativeValues: true, savedCrossChannelReciprocalMatchesReproduced: true,
      rankArithmeticMatchesPriorSummary: true, uniqueXGeometryMediansMatchPriorSummary: true,
      noSimulation: true, noRng: true }
  };
}

function mergeCases(seedResults) {
  const categories = [
    'longest-nonentry-B', 'longest-nonentry-C', 'longest-entry-B', 'longest-entry-C',
    'strongest-sustained-nonentry-B', 'strongest-sustained-nonentry-C'
  ];
  const all = seedResults.flatMap(result => result.cases);
  const selected = categories.map(category => {
    const choices = all.filter(row => row.category === category);
    assert.ok(choices.length, 'objective category exists: ' + category);
    choices.sort((a, b) => {
      if (category.startsWith('strongest')) return a.meanWithinChannelRank - b.meanWithinChannelRank
        || b.durationSeconds - a.durationSeconds || a.seed.localeCompare(b.seed) || a.trackId - b.trackId;
      return b.durationSeconds - a.durationSeconds || a.seed.localeCompare(b.seed) || a.trackId - b.trackId;
    });
    return choices[0];
  });
  return selected;
}
function formatNumber(value) {
  return Number.isFinite(value) ? Number(value).toFixed(5) : 'NA';
}
function svgEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
function polyline(rows, x, y, width, height, key, invert = false) {
  const values = rows.map(row => row[key]).filter(Number.isFinite);
  if (values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const t0 = rows[0].timeMs, dt = rows.at(-1).timeMs - t0 || 1;
  const points = rows.map(row => {
    if (!Number.isFinite(row[key])) return null;
    const xx = x + (row.timeMs - t0) / dt * width;
    const norm = (row[key] - min) / span;
    return [xx, y + (invert ? norm : 1 - norm) * height];
  }).filter(Boolean);
  return points.length < 2 ? '' : 'M' + points.map(point => formatNumber(point[0]) + ',' + formatNumber(point[1])).join(' L');
}
function caseSvg(cases) {
  const W = 1720, rowH = 205, H = 95 + cases.length * rowH;
  let body = '<rect width="' + W + '" height="' + H + '" fill="#f7f7f4"/>';
  body += '<text x="36" y="32" font-size="22" font-family="Arial" font-weight="700">B vs C — six objective track cases</text>';
  body += '<text x="36" y="58" font-size="13" font-family="Arial" fill="#444">Each native-state and activity panel uses its own axis. X snapshots show selected capture and simultaneous max-D X.</text>';
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i], top = 78 + i * rowH, color = item.channel === 'B' ? '#168b69' : '#8755a1';
    const obs = item.observations;
    const x = 55, plotWidth = 805, stateY = top + 34, stateH = 55, rankY = top + 105, rankH = 28;
    const activityKey = item.channel === 'B' ? 'xTravel5' : 'xFeet5';
    const activityY = top + 151, activityH = 24;
    body += '<rect x="24" y="' + top + '" width="' + (W - 48) + '" height="' + (rowH - 8) + '" rx="4" fill="#fff" stroke="#c8c8c2"/>';
    body += '<text x="40" y="' + (top + 20) + '" font-size="14" font-family="Arial" font-weight="700">'
      + svgEscape(item.category + ' · seed ' + item.seed + ' · track ' + item.trackId
        + ' · ' + item.durationSeconds.toFixed(2) + ' s · ' + item.observationCount + ' analyses') + '</text>';
    body += '<text x="' + x + '" y="' + (stateY - 5) + '" font-size="10" font-family="Arial" fill="#444">'
      + item.channel + ' native value (' + formatNumber(Math.min(...obs.map(row => row.value))) + '–'
      + formatNumber(Math.max(...obs.map(row => row.value))) + ')</text>';
    body += '<path d="' + polyline(obs, x, stateY, plotWidth, stateH, 'value') + '" fill="none" stroke="' + color + '" stroke-width="1.6"/>';
    body += '<text x="' + x + '" y="' + (rankY - 5) + '" font-size="10" font-family="Arial" fill="#444">within-channel rank (1 is strongest)</text>';
    body += '<path d="' + polyline(obs, x, rankY, plotWidth, rankH, 'rank', true) + '" fill="none" stroke="#424242" stroke-width="1.2"/>';
    body += '<text x="' + x + '" y="' + (activityY - 5) + '" font-size="10" font-family="Arial" fill="#444">'
      + (item.channel === 'B' ? 'X total realized travel, rolling 5 s' : 'X total individual FOOT_CONTACT count, rolling 5 s') + '</text>';
    body += '<path d="' + polyline(obs, x, activityY, plotWidth, activityH, activityKey) + '" fill="none" stroke="#d07a23" stroke-width="1.2"/>';
    const samples = item.xSnapshots ?? [];
    for (let j = 0; j < samples.length; j++) {
      const snap = samples[j], key = item.channel + ':' + item.trackId, selected = snap[key];
      if (!selected) continue;
      const sx = 945 + j * 245, sy = top + 43, size = 144, scale = size / 96;
      body += '<text x="' + sx + '" y="' + (top + 30) + '" font-size="10" font-family="Arial">'
        + (snap.timeMs / 1000).toFixed(2) + ' s (anchor ' + snap.anchorIndex + ')</text>';
      body += '<rect x="' + sx + '" y="' + sy + '" width="' + size + '" height="' + size + '" fill="#fbfbf7" stroke="#777"/>';
      body += '<path d="' + (snap.maxD?.cells ?? []).map(cell => {
        const col = cell % GRID, row = Math.floor(cell / GRID);
        return 'M' + (sx + col * scale).toFixed(2) + ' ' + (sy + row * scale).toFixed(2) + 'h'
          + (scale + .1).toFixed(2) + 'v' + (scale + .1).toFixed(2) + 'h-' + (scale + .1).toFixed(2) + 'z';
      }).join('') + '" fill="none" stroke="#4581bd" stroke-width=".36"/>';
      body += '<path d="' + selected.cells.map(cell => {
        const col = cell % GRID, row = Math.floor(cell / GRID);
        return 'M' + (sx + col * scale).toFixed(2) + ' ' + (sy + row * scale).toFixed(2) + 'h'
          + (scale + .1).toFixed(2) + 'v' + (scale + .1).toFixed(2) + 'h-' + (scale + .1).toFixed(2) + 'z';
      }).join('') + '" fill="' + color + '" fill-opacity=".75"/>';
      body += '<circle cx="' + (sx + selected.centerIndex % GRID * scale + scale / 2).toFixed(2) + '" cy="'
        + (sy + Math.floor(selected.centerIndex / GRID) * scale + scale / 2).toFixed(2) + '" r="2.3" fill="#111"/>';
      body += '<text x="' + sx + '" y="' + (sy + size + 14) + '" font-size="9" font-family="Arial" fill="#555">'
        + 'B/C X=' + selected.nodeCount + ' cells; blue outline=max-D X</text>';
    }
    body += '<line x1="40" y1="' + (top + rowH - 7) + '" x2="' + (W - 40) + '" y2="' + (top + rowH - 7) + '" stroke="#ddd"/>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">'
    + '<title>Objective B and C local episode cases</title>' + body + '</svg>';
}
async function listFiles(dir) {
  const rows = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) rows.push(...await listFiles(path)); else rows.push(path);
  }
  return rows.sort();
}
function canonicalText(path, bytes) {
  return /\.(?:md|js|json|svg|html|txt)$/.test(path)
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n')) : bytes;
}
async function writeManifest() {
  const manifestPath = resolve(OUTPUT, 'analysis/manifest.json');
  const files = [];
  for (const path of await listFiles(OUTPUT)) {
    if (path === manifestPath) continue;
    const bytes = canonicalText(path, await readFile(path));
    files.push({ file: relative(OUTPUT, path).replaceAll('\\', '/'),
      bytes: bytes.length, sha256: sha256(bytes) });
  }
  const toolPath = resolve(ROOT, 'scripts/ant-local-episode-evidence-b-vs-c.js');
  const reviewToolPath = resolve(ROOT, 'scripts/verify-ant-local-episode-evidence-b-vs-c.js');
  await writeJson(manifestPath, {
    schema: 'ant-local-episode-evidence-b-vs-c-manifest-v1',
    authority: AUTHORITY, sourcePacketCommit: SOURCE_COMMIT,
    sourcePacketManifestSha256: sha256(await readFile(resolve(INPUT, 'manifest.json'))),
    toolSha256: sha256(canonicalText(toolPath, await readFile(toolPath))),
    independentReviewToolSha256: sha256(canonicalText(reviewToolPath, await readFile(reviewToolPath))),
    files
  });
  console.log(JSON.stringify({ manifestFiles: files.length, toolSha256: sha256(canonicalText(toolPath, await readFile(toolPath))) }));
}
function selfcheck() {
  assert.equal(overlap(new Set([1, 2]), new Set([2, 3])).jaccard, 1 / 3);
  const left = [{ index: 0, component: 1 }, { index: 96, component: 1 }];
  const right = [{ index: 1, component: 1 }, { index: 97, component: 1 }];
  assert.deepEqual(recenter({ left, right }, .025).map(row => [row.a, row.b]), [[0, 1], [96, 97]]);
  const crossings = directRankDynamics([{ trackId: 1, value: 3 }, { trackId: 2, value: 2 }, { trackId: 3, value: 1 }],
    [{ trackId: 1, value: 1 }, { trackId: 2, value: 3 }, { trackId: 3, value: 2 }]);
  assert.equal(crossings.crossings, 2);
  assert.equal(trackClass({ observations: [{ entryDistance: .1 }, { entryDistance: .12 }] }), 'entry');
  assert.equal(trackClass({ observations: [{ entryDistance: .2 }, { entryDistance: .12 }] }), 'mixed');
  assert.equal(trackClass({ observations: [{ entryDistance: .2 }, { entryDistance: .3 }] }), 'nonentry');
  console.log(JSON.stringify({ selfcheck: 'passed' }));
}

async function main() {
  if (process.argv.includes('--selfcheck')) return selfcheck();
  if (process.argv.includes('--manifest')) return writeManifest();
  const packetManifest = await readJson(resolve(INPUT, 'manifest.json'));
  assert.equal(packetManifest.authority, AUTHORITY);
  assert.equal(packetManifest.branch, 'codex/ant-local-opportunity-competition-audit-20261031');
  const packetManifestBytes = await readFile(resolve(INPUT, 'manifest.json'));
  const originalSummary = await readJson(resolve(INPUT, 'analysis/summary.json'));
  const xFamily = await readJson(resolve(INPUT, 'analysis/x-family-geometry.json'));
  const seeds = [];
  for (const seed of SEEDS) {
    const result = await analyzeSeed(seed, originalSummary, xFamily);
    seeds.push(result);
    console.log(JSON.stringify({ seed, analyses: result.analyses,
      BTracks: result.channels.B.tracks.total, CTracks: result.channels.C.tracks.total,
      BRankCrossings: result.channels.B.hierarchy.strictMatchedTrackRankCrossings,
      CRankCrossings: result.channels.C.hierarchy.strictMatchedTrackRankCrossings }));
    if (global.gc) global.gc();
  }
  const cases = mergeCases(seeds);
  const packetIndexes = new Map();
  for (const row of seeds) packetIndexes.set(row.seed, { opportunityIndex:
    await readJson(resolve(INPUT, 'analysis/seed-' + row.seed + '.opportunities.json.gz')) });
  const casesWithSnapshots = await sampleXForCases(cases, packetIndexes);
  await mkdir(resolve(OUTPUT, 'analysis'), { recursive: true });
  await mkdir(resolve(OUTPUT, 'visual'), { recursive: true });
  const inputReceipt = {
    schema: 'ant-local-episode-evidence-inputs-v1',
    sourcePacketCommit: SOURCE_COMMIT, sourcePacketBranch: packetManifest.branch,
    authority: AUTHORITY, seeds: SEEDS, hz: 60, modelSeconds: 600, audio: 'Off',
    noNewSimulation: true, sourcePacketManifestSha256: sha256(packetManifestBytes),
    sourcePacketManifestEntryCount: packetManifest.files.length,
    sourceManifestWasVerifiedBeforeFollowupDocumentation: true,
    seedReceipts: seeds.map(row => ({ seed: row.seed, sourceIndices: row.sourceIndices,
      boundaryCount: row.analyses, observerParityInherited: true, noRngInherited: true }))
  };
  const summary = {
    schema: 'ant-local-episode-evidence-b-vs-c-v1',
    authority: AUTHORITY, sourcePacketCommit: SOURCE_COMMIT,
    definitions: {
      B: 'native TrailPlateBirth.chemicalMemory: current p transformed as p/(p+.04), EMA tau 20 s; qualified chemical history.',
      C: 'native SurfaceField.sample(x,y): normalized contact-written compaction readout, half-life 1800 s; not force or pressure.',
      opportunity: 'Existing positive local maxima on edge-bearing F, exact plateau/grouping conventions .15/.30 unchanged.',
      primary: 'g15 groups with registered reciprocal-nearest .025 tracks; F component guard and row-major tie handling preserved.',
      X: 'Existing associated capture, 8-neighbor component in F intersect EuclideanDisk(center,.15).',
      noFusion: true, noThreshold: true, noAllocation: true
    },
    independentArithmeticReview: { directBruteForceRankCrossingsMatchSavedSynthesis: true,
      directReciprocalCenterMatchesMatchSavedCrossChannelReceipts: true,
      uniqueXGeometryCountsAndMediansMatchSavedXFamily: true,
      candidateCenterValuesMatchNativeBAndCArrays: true },
    seeds: seeds.map(({ observations, cases: localCases, ...row }) => {
      const { perBoundary, ...pairedBC } = row.pairedBC;
      return { ...row, pairedBC };
    })
  };
  await writeJson(resolve(OUTPUT, 'analysis/inputs.json'), inputReceipt);
  await writeJson(resolve(OUTPUT, 'analysis/summary.json'), summary);
  await writeJson(resolve(OUTPUT, 'analysis/cases.json'), {
    schema: 'ant-local-episode-evidence-objective-cases-v1',
    selection: 'Longest classes use elapsed time then seed/track ID. Strongest sustained non-entry uses lowest arithmetic mean within-channel rank among tracks with at least two observations; ties use longer duration then seed/track ID. No cross-channel score or duration threshold.',
    cases: casesWithSnapshots
  });
  for (const seed of seeds) {
    await writeJson(resolve(OUTPUT, 'analysis/track-observations-' + seed.seed + '.json.gz'), {
      schema: 'ant-local-episode-b-c-track-observations-v1', seed: seed.seed, authority: AUTHORITY,
      representation: 'g15', correspondence: .025,
      channels: seed.observations
    });
    await writeJson(resolve(OUTPUT, 'analysis/paired-bc-boundaries-' + seed.seed + '.json.gz'), {
      schema: 'ant-local-episode-bc-paired-boundaries-v1', seed: seed.seed,
      boundaries: seed.pairedBC.perBoundary
    });
  }
  await writeFile(resolve(OUTPUT, 'visual/objective-cases.svg'), caseSvg(casesWithSnapshots), 'utf8');
  await writeManifest();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
