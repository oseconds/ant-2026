import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { descriptiveSpacing, enumeratePlateauMaxima, neighbors8, reciprocalNearest } from './ant-opportunity-core.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-29-late-qualified-opportunity-capture';
const INPUT = `${PACKAGE}/data/late-input.json.gz`;
const MEASUREMENTS = `${PACKAGE}/data/measurements.json.gz`;
const SUMMARY = `${PACKAGE}/analysis.json`;
const N = 96, COUNT = N * N, CHANNELS = ['D', 'B', 'C', 'recent'], RADII = [0.15, 0.30], MATCHES = [0.025, 0.075];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const point = i => ({ x: (i % N) / 95, y: Math.floor(i / N) / 95 });
const distance = (a, b) => Math.hypot(a % N - b % N, Math.floor(a / N) - Math.floor(b / N)) / 95;
const sorted = values => values.slice().sort((a, b) => a - b);

function quantiles(values) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const at = p => rows[Math.round((rows.length - 1) * p)];
  return { n: rows.length, min: rows[0], p10: at(0.1), p25: at(0.25), median: at(0.5),
    p75: at(0.75), p90: at(0.9), p95: at(0.95), p99: at(0.99), max: rows.at(-1) };
}

function topStats(values) {
  const rows = values.slice().sort((a, b) => b - a), top = [rows[0] ?? null, rows[1] ?? null, rows[2] ?? null];
  return { top, top2ToTop1: top[0] > 0 && top[1] !== null ? top[1] / top[0] : null,
    top3ToTop1: top[0] > 0 && top[2] !== null ? top[2] / top[0] : null,
    top1MinusTop2: top[1] === null ? null : top[0] - top[1],
    top2MinusTop3: top[1] === null || top[2] === null ? null : top[1] - top[2] };
}

function components(F) {
  const present = new Uint8Array(COUNT), label = new Int32Array(COUNT).fill(-1), sizes = [];
  F.forEach(i => { present[i] = 1; });
  let id = 0;
  for (const start of F) if (label[start] < 0) {
    const queue = [start]; label[start] = id;
    for (let head = 0; head < queue.length; head += 1) {
      for (const next of neighbors8(queue[head])) if (present[next] && label[next] < 0) {
        label[next] = id; queue.push(next);
      }
    }
    sizes.push(queue.length); id += 1;
  }
  return { label, sizes };
}

function maximum(values, mask = null, predicate = null) {
  let index = null, value = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    if ((mask && !mask[i]) || (predicate && !predicate(i)) || !Number.isFinite(values[i])) continue;
    if (values[i] > value) { index = i; value = values[i]; }
  }
  return index === null ? { index: null, value: null } : { index, value };
}

function centersAt(frame, peaks, componentByCell, radius) {
  const grouped = descriptiveSpacing(peaks, componentByCell, radius);
  const centers = grouped.representatives.map((rep, rank) => {
    const memberPeaks = grouped.assignments.filter(row => row.representativeIndex === rep.index).map(row => row.peak);
    const p = point(rep.index), nearby = frame.channels.recent[rep.index];
    const age = frame.lastNearbyFootAgeSeconds[rep.index];
    return { rank: rank + 1, representativeIndex: rep.index, point: p, value: rep.value,
      component: componentByCell[rep.index], componentSize: componentByCell[rep.index] >= 0
        ? frame.componentSizes[componentByCell[rep.index]] : null,
      peakIndices: memberPeaks.map(row => row.index), memberCells: memberPeaks.map(row => row.cells),
      groupDiameter: memberPeaks.length < 2 ? 0 : Math.max(...memberPeaks.flatMap(a =>
        memberPeaks.map(b => distance(a.index, b.index)))),
      entryDistance: Math.hypot(p.x - 0.5, p.y - 0.72),
      preMaterialLayers: frame.preMaterialLayers[rep.index],
      nearbyRecentFeet20: nearby,
      exactFeet20: frame.exactFeet20s[rep.index],
      lastNearbyFootAgeSeconds: Number.isFinite(age) ? age : null };
  });
  const outside = centers.find(row => row.entryDistance > 0.15);
  return { centers, assignments: grouped.assignments.map(row => ({ peakIndex: row.peak.index,
    representativeIndex: row.representativeIndex, distance: row.distance })),
    top: topStats(centers.map(row => row.value)),
    topWinnerEntryDistance: centers[0]?.entryDistance ?? null,
    strongestOutsideEntry: outside ? { index: outside.representativeIndex, value: outside.value,
      ratioToWinner: centers[0]?.value ? outside.value / centers[0].value : null,
      entryDistance: outside.entryDistance } : null,
    top2SameFComponent: centers.length < 2 ? null : centers[0].component === centers[1].component,
    top3SameFComponent: centers.length < 3 ? null : centers.slice(0, 3).every(row => row.component === centers[0].component),
    topCenterDistances: centers.slice(0, 3).flatMap((row, i, top) => top.slice(i + 1).map(other => ({
      fromRank: row.rank, toRank: other.rank, distance: distance(row.representativeIndex, other.representativeIndex) }))) };
}

function xCapture(frame) {
  const F = new Uint8Array(COUNT); frame.F.forEach(i => { F[i] = 1; });
  const eligible = frame.S.filter(i => neighbors8(i).some(j => F[j]));
  if (!eligible.length) return { nucleus: null, cells: [] };
  const eligibleMask = new Uint8Array(COUNT); eligible.forEach(i => { eligibleMask[i] = 1; });
  const nucleus = maximum(frame.channels.D, eligibleMask).index;
  const seen = new Uint8Array(COUNT), queue = [nucleus]; seen[nucleus] = 1;
  for (let head = 0; head < queue.length; head += 1) for (const next of neighbors8(queue[head])) {
    if (F[next] && !seen[next] && distance(next, nucleus) <= 0.15 + 1e-12) { seen[next] = 1; queue.push(next); }
  }
  return { nucleus, cells: sorted(queue) };
}

function analyzeFrame(input) {
  const frame = { ...input, componentSizes: [], channels: Object.fromEntries(CHANNELS.map(name =>
    [name, Float64Array.from(input.channels[name])])), preMaterialLayers: Uint8Array.from(input.preMaterialLayers),
    exactFeet20s: Uint32Array.from(input.exactFeet20s),
    lastNearbyFootAgeSeconds: Float32Array.from(input.lastNearbyFootAgeSeconds, value => value ?? NaN) };
  const S = new Uint8Array(COUNT); frame.S.forEach(i => { S[i] = 1; });
  const { label: componentByCell, sizes } = components(frame.F); frame.componentSizes = sizes;
  const channels = {};
  for (const name of CHANNELS) {
    const result = enumeratePlateauMaxima({ S, values: frame.channels[name] });
    const peaks = result.peaks.map(peak => ({ ...peak, point: point(peak.index),
      component: componentByCell[peak.index], componentSize: sizes[componentByCell[peak.index]] }));
    channels[name] = { zeroMaxContextCount: result.zeroMaxContextCount,
      node: topStats(frame.S.map(i => frame.channels[name][i])),
      peak: topStats(peaks.map(row => row.value)),
      peaks,
      spacings: Object.fromEntries(RADII.map(radius => [radius, centersAt(frame, peaks, componentByCell, radius)])),
      globalMaximum: maximum(frame.channels[name]),
      qualifiedMaximum: maximum(frame.channels[name], S) };
  }
  const Doutside = maximum(frame.channels.D, null, i => distanceToEntry(i) > 0.15);
  const Dglobal = channels.D.globalMaximum.value;
  const existing = new Uint8Array(COUNT);
  for (let i = 0; i < COUNT; i += 1) existing[i] = frame.preMaterialLayers[i] > 0 ? 1 : 0;
  const capture = xCapture(frame), overlapCells = capture.cells.filter(i => existing[i]);
  const dCenters = channels.D.spacings[0.15].centers;
  const ranked = dCenters.slice(0, 3).map(row => ({ rank: row.rank, index: row.representativeIndex,
    value: row.value, entryDistance: row.entryDistance, preMaterialLayers: row.preMaterialLayers,
    materialStatus: row.preMaterialLayers ? 'existing-material' : 'material-free',
    nearbyRecentFeet20: row.nearbyRecentFeet20, lastNearbyFootAgeSeconds: row.lastNearbyFootAgeSeconds }));
  const materialFreeNonwinner = dCenters.slice(1).find(row => row.preMaterialLayers === 0) ?? null;
  return { timeMs: frame.timeMs, tick: frame.tick, window: frame.timeMs < 300000 ? '300s' : '600s',
    sizes: { E: frame.E.length, F: frame.F.length, S: frame.S.length, FComponents: sizes.length,
      FComponentSizes: sizes },
    channels, qualifiedSpatialContext: { SEntryDistance: quantiles(frame.S.map(i => distanceToEntry(i))),
      unconditionedDOutsideEntryMaximum: Doutside,
      unconditionedDOutsideEntryToGlobalMaximum: Dglobal > 0 ? Doutside.value / Dglobal : null,
      SconditionedDStrongestOutsideEntryRatioToWinner: channels.D.spacings[0.15].strongestOutsideEntry?.ratioToWinner ?? null },
    material: { preexistingPlateCount: frame.preexistingPlateIds.length,
      preexistingMaterialCells: existing.reduce((a, b) => a + b, 0),
      DQualifiedNodeMaximum: maximum(frame.channels.D, S),
      DQualifiedNodeMaximumLayerCount: frame.preMaterialLayers[maximum(frame.channels.D, S).index] ?? null,
      DRankedCenters: ranked,
      strongestMaterialFreeNonwinner: materialFreeNonwinner ? { rank: materialFreeNonwinner.rank,
        index: materialFreeNonwinner.representativeIndex, value: materialFreeNonwinner.value,
        strengthRatioToWinner: dCenters[0]?.value ? materialFreeNonwinner.value / dCenters[0].value : null,
        distanceToWinner: distance(materialFreeNonwinner.representativeIndex, dCenters[0].representativeIndex),
        entryDistance: materialFreeNonwinner.entryDistance } : null,
      Xnucleus: capture.nucleus, XcellCount: capture.cells.length,
      Xcells: capture.cells,
      XpreexistingMaterialCells: overlapCells.length,
      XpreexistingMaterialFraction: capture.cells.length ? overlapCells.length / capture.cells.length : null },
    footContext: { windowFeet: frame.footWindowCount, windowSeconds: frame.exposureSeconds } };
}

function distanceToEntry(index) {
  const p = point(index); return Math.hypot(p.x - 0.5, p.y - 0.72);
}

function makeTracks(frames, channel, radius, cutoff) {
  const tracks = [], transitions = [], unmatched = [], rankChanges = [], rankCrossovers = [];
  let previous = [];
  for (let fi = 0; fi < frames.length; fi += 1) {
    const frame = frames[fi];
    const current = frame.channels[channel].spacings[radius].centers.map(row => ({
      index: row.representativeIndex, rank: row.rank, value: row.value,
      memberPeakIndices: row.peakIndices, members: [...new Set(row.memberCells.flat())]
    }));
    if (!fi) {
      for (const row of current) tracks.push({ id: tracks.length, observations: [] });
      current.forEach((row, i) => {
        row.trackId = i;
        tracks[i].observations.push({ timeMs: frame.timeMs, rank: row.rank, value: row.value,
          cell: row.index, point: point(row.index), memberPeakIndices: row.memberPeakIndices, memberCells: row.members });
      });
      previous = current;
      continue;
    }
    const matching = reciprocalNearest(previous, current, cutoff);
    const priorByIndex = new Map(previous.map(row => [row.index, row]));
    const matchedPriorByCurrent = new Map(matching.pairs.map(pair => [pair.currentIndex, priorByIndex.get(pair.previousIndex)]));
    const currentByIndex = new Map(current.map(row => [row.index, row]));
    current.forEach(row => {
      const prior = matchedPriorByCurrent.get(row.index);
      row.trackId = prior ? prior.trackId : tracks.length;
      if (!prior) tracks.push({ id: row.trackId, observations: [] });
      const observation = { timeMs: frame.timeMs, rank: row.rank, value: row.value,
        cell: row.index, point: point(row.index), memberPeakIndices: row.memberPeakIndices, memberCells: row.members };
      tracks[row.trackId].observations.push(observation);
      if (prior && prior.rank !== row.rank) rankChanges.push({ fromTimeMs: frames[fi - 1].timeMs,
        toTimeMs: frame.timeMs, trackId: row.trackId, previousRank: prior.rank, currentRank: row.rank });
    });
    const paired = matching.pairs.map(pair => ({ previous: priorByIndex.get(pair.previousIndex),
      current: currentByIndex.get(pair.currentIndex), distance: pair.distance }));
    for (let i = 0; i < paired.length; i += 1) for (let j = i + 1; j < paired.length; j += 1) {
      const a = paired[i], b = paired[j];
      if ((a.previous.rank - b.previous.rank) * (a.current.rank - b.current.rank) < 0) {
        rankCrossovers.push({ fromTimeMs: frames[fi - 1].timeMs, toTimeMs: frame.timeMs,
          trackIds: [a.previous.trackId, b.previous.trackId], previousRanks: [a.previous.rank, b.previous.rank],
          currentRanks: [a.current.rank, b.current.rank] });
      }
    }
    const oldWinner = previous.find(row => row.rank === 1), newWinner = current.find(row => row.rank === 1);
    const newWinnerPrior = newWinner ? matchedPriorByCurrent.get(newWinner.index) : null;
    const oldWinnerCurrent = oldWinner ? paired.find(pair => pair.previous.trackId === oldWinner.trackId)?.current : null;
    const rankCrossing = Boolean(oldWinner && newWinner && newWinnerPrior && oldWinnerCurrent
      && newWinnerPrior.rank > oldWinner.rank && newWinner.rank < oldWinnerCurrent.rank);
    transitions.push({ fromTimeMs: frames[fi - 1].timeMs, toTimeMs: frame.timeMs,
      reciprocalBestPairs: matching.pairs,
      unmatchedPrevious: matching.unmatchedPrevious.map(index => ({ index,
        reason: current.some(row => distance(index, row.index) <= cutoff) ? 'no-reciprocal-partner' : 'no-candidate-inside-cutoff' })),
      unmatchedCurrent: matching.unmatchedCurrent.map(index => ({ index,
        reason: previous.some(row => distance(index, row.index) <= cutoff) ? 'no-reciprocal-partner' : 'no-candidate-inside-cutoff' })),
      oldWinnerTrackId: oldWinner?.trackId ?? null, newWinnerTrackId: newWinner?.trackId ?? null,
      oldWinnerMatched: Boolean(oldWinnerCurrent), newWinnerMatched: Boolean(newWinnerPrior), rankCrossing,
      winnerTransition: !oldWinner || !newWinner || !oldWinnerCurrent || !newWinnerPrior ? 'unmatched-or-absent'
        : rankCrossing ? 'rank-crossing' : oldWinner.trackId === newWinnerPrior.trackId ? 'same-track' : 'other-matched-change' });
    for (const index of matching.unmatchedPrevious) unmatched.push({ timeMs: frames[fi - 1].timeMs, index, side: 'previous' });
    for (const index of matching.unmatchedCurrent) unmatched.push({ timeMs: frame.timeMs, index, side: 'current' });
    previous = current;
  }
  const winnerHistory = frames.map(frame => {
    const winner = frame.channels[channel].spacings[radius].centers[0];
    const track = winner && tracks.find(row => row.observations.some(o => o.timeMs === frame.timeMs && o.cell === winner.representativeIndex));
    return { timeMs: frame.timeMs, exactCell: winner?.representativeIndex ?? null, trackId: track?.id ?? null };
  });
  const trackRows = tracks.map(row => ({ id: row.id, observations: row.observations,
    observedSpanMs: row.observations.length > 1 ? row.observations.at(-1).timeMs - row.observations[0].timeMs : 0 }));
  const rankOccupancy = Object.fromEntries([1, 2, 3].map(rank => {
    const rows = trackRows.map(track => ({ id: track.id,
      observations: track.observations.filter(observation => observation.rank === rank) })).filter(row => row.observations.length);
    return [rank, { observations: rows.reduce((sum, row) => sum + row.observations.length, 0),
      correspondenceFamilies: rows.length,
      familiesObservedAtMultipleAnchors: rows.filter(row => row.observations.length > 1).length,
      familiesAtFinalAnchor: rows.filter(row => row.observations.at(-1).timeMs === frames.at(-1).timeMs).length,
      anchorOccupancyPerFamily: quantiles(rows.map(row => row.observations.length)) }];
  }));
  return { channel, spacingRadius: radius, maxDisplacement: cutoff, tracks: trackRows, transitions, unmatched, rankChanges,
    rankCrossovers, winnerHistory,
    summary: { states: frames.length, tracks: tracks.length, rankOccupancy,
      singleAnchorTracks: tracks.filter(row => row.observations.length === 1).length,
      multipleAnchorTracks: tracks.filter(row => row.observations.length > 1).length,
      observedAnchorCount: quantiles(tracks.map(row => row.observations.length)),
      observedSpanSeconds: quantiles(trackRows.map(row => row.observedSpanMs / 1000)),
      longestObservedSpanSeconds: Math.max(0, ...trackRows.map(row => row.observedSpanMs / 1000)),
      tracksPresentAtFinalAnchor: tracks.filter(row => row.observations.at(-1)?.timeMs === frames.at(-1).timeMs).length,
      matchedPairs: transitions.reduce((sum, row) => sum + row.reciprocalBestPairs.length, 0),
      unmatchedCenterObservations: unmatched.length, rankChanges: rankChanges.length, rankCrossovers: rankCrossovers.length,
      winnerTrackChanges: winnerHistory.slice(1).filter((row, i) => row.trackId !== winnerHistory[i].trackId).length,
      exactWinnerCellChanges: winnerHistory.slice(1).filter((row, i) => row.exactCell !== winnerHistory[i].exactCell).length,
      winnerTransitions: transitions.map(row => row.winnerTransition) } };
}

function summarize(frames, tracks) {
  const channels = {};
  for (const name of CHANNELS) {
    channels[name] = Object.fromEntries(RADII.map(radius => {
      const stateRows = frames.map(frame => frame.channels[name]);
      const centers = stateRows.flatMap(row => row.spacings[radius].centers);
      return [radius, { rawPeakCount: quantiles(stateRows.map(row => row.peaks.length)),
        zeroPlateauContextCount: quantiles(stateRows.map(row => row.zeroMaxContextCount)),
        spacedCenterCount: quantiles(stateRows.map(row => row.spacings[radius].centers.length)),
        nodeTop2ToTop1: quantiles(stateRows.map(row => row.node.top2ToTop1)),
        peakTop2ToTop1: quantiles(stateRows.map(row => row.peak.top2ToTop1)),
        separatedCenterTop2ToTop1: quantiles(stateRows.map(row => row.spacings[radius].top.top2ToTop1)),
        separatedCenterTop3ToTop1: quantiles(stateRows.map(row => row.spacings[radius].top.top3ToTop1)),
        winnerEntryDistance: quantiles(stateRows.map(row => row.spacings[radius].topWinnerEntryDistance)),
        separatedCenterEntryDistance: quantiles(centers.map(row => row.entryDistance)),
        strongestOutsideEntryRatioToWinner: quantiles(stateRows.map(row => row.spacings[radius].strongestOutsideEntry?.ratioToWinner)),
        top2SameFComponentCount: stateRows.filter(row => row.spacings[radius].top2SameFComponent === true).length,
        top2DifferentFComponentCount: stateRows.filter(row => row.spacings[radius].top2SameFComponent === false).length,
        top2UnavailableCount: stateRows.filter(row => row.spacings[radius].top2SameFComponent === null).length }];
    }));
  }
  const materialFreeByState = frames.map(frame => frame.material.strongestMaterialFreeNonwinner);
  return { frameCount: frames.length, noSFrames: frames.filter(frame => !frame.sizes.S).length,
    exactModelTimesMs: frames.map(frame => frame.timeMs), channels,
    hierarchy: { unconditionedDOutsideEntryToGlobalMaximum: quantiles(frames.map(frame =>
      frame.qualifiedSpatialContext.unconditionedDOutsideEntryToGlobalMaximum)),
      DwinnerEntryDistance: quantiles(frames.map(frame => frame.channels.D.spacings[0.15].topWinnerEntryDistance)),
      SconditionedDStrongestOutsideEntryRatioToWinner: quantiles(frames.map(frame =>
        frame.qualifiedSpatialContext.SconditionedDStrongestOutsideEntryRatioToWinner)),
      DspacedTop2ToTop1: quantiles(frames.map(frame => frame.channels.D.spacings[0.15].top.top2ToTop1)),
      DspacedTop3ToTop1: quantiles(frames.map(frame => frame.channels.D.spacings[0.15].top.top3ToTop1)),
      DwinnerOutsideEntryCount: frames.filter(frame => (frame.channels.D.spacings[0.15].topWinnerEntryDistance ?? 0) > 0.15).length,
      Dtop2SameFComponentCount: frames.filter(frame => frame.channels.D.spacings[0.15].top2SameFComponent === true).length,
      Dtop2DifferentFComponentCount: frames.filter(frame => frame.channels.D.spacings[0.15].top2SameFComponent === false).length },
    temporal: tracks.map(row => ({ channel: row.channel, spacingRadius: row.spacingRadius,
      maxDisplacement: row.maxDisplacement, ...row.summary })),
    material: { preexistingPlateCount: quantiles(frames.map(frame => frame.material.preexistingPlateCount)),
      preexistingMaterialCells: quantiles(frames.map(frame => frame.material.preexistingMaterialCells)),
      DqualifiedWinnerLayerCount: quantiles(frames.map(frame => frame.material.DQualifiedNodeMaximumLayerCount)),
      XpreexistingMaterialFraction: quantiles(frames.map(frame => frame.material.XpreexistingMaterialFraction)),
      strongestMaterialFreeDNonwinner: { observedFrames: materialFreeByState.filter(Boolean).length,
        strengthRatioToWinner: quantiles(materialFreeByState.filter(Boolean).map(row => row.strengthRatioToWinner)),
        distanceToWinner: quantiles(materialFreeByState.filter(Boolean).map(row => row.distanceToWinner)),
        entryDistance: quantiles(materialFreeByState.filter(Boolean).map(row => row.entryDistance)) },
      DcenterRankMaterialStatus: Object.fromEntries([1, 2, 3].map(rank => [rank, {
        existingMaterialFrames: frames.filter(frame => frame.material.DRankedCenters.find(row => row.rank === rank)?.preMaterialLayers > 0).length,
        materialFreeFrames: frames.filter(frame => frame.material.DRankedCenters.find(row => row.rank === rank)?.preMaterialLayers === 0).length,
        absentFrames: frames.filter(frame => !frame.material.DRankedCenters.some(row => row.rank === rank)).length }])),
      DcenterRecentFeet20: quantiles(frames.flatMap(frame => frame.material.DRankedCenters.map(row => row.nearbyRecentFeet20))),
      DcenterLatestFootAgeSeconds: quantiles(frames.flatMap(frame => frame.material.DRankedCenters.map(row => row.lastNearbyFootAgeSeconds))) },
    structure: { ECells: quantiles(frames.map(frame => frame.sizes.E)), FNodes: quantiles(frames.map(frame => frame.sizes.F)),
      SNodes: quantiles(frames.map(frame => frame.sizes.S)), FComponents: quantiles(frames.map(frame => frame.sizes.FComponents)),
      footCountsInTrailing20s: quantiles(frames.map(frame => frame.footContext.windowFeet)) } };
}

function compareEarly(early, late) {
  const rows = [];
  for (const channel of CHANNELS) {
    const base = early.summary.channels[channel]['0.15'];
    const current = late.channels[channel][0.15];
    rows.push({ channel, early0to120: { rawPeakCount: base.peakCount, spacedCenterCount: base.spacedCenterCount,
      top2ToTop1: base.top2StrengthRatio, winnerEntryDistance: base.spacedCenterWinnerEntryDistance },
    lateWindow: { rawPeakCount: current.rawPeakCount, spacedCenterCount: current.spacedCenterCount,
      top2ToTop1: current.separatedCenterTop2ToTop1, winnerEntryDistance: current.winnerEntryDistance } });
  }
  return rows;
}

const inputBytes = await readFile(resolve(ROOT, INPUT));
const input = JSON.parse(gunzipSync(inputBytes));
assert.equal(input.schema, 'ant-late-qualified-opportunity-input-v1');
assert.equal(input.provenance.parity.actualAnalysisAnchorCounts['300s'], 20);
assert.equal(input.provenance.parity.actualAnalysisAnchorCounts['600s'], 20);
assert.equal(input.frames.length, 40);
assert.equal(new Set(input.frames.map(row => row.timeMs)).size, 40);
for (const frame of input.frames) {
  assert.equal(frame.B.length, COUNT); assert.equal(frame.C.length, COUNT); assert.equal(frame.D.length, COUNT);
  assert.equal(frame.preMaterialLayers.length, COUNT);
  const E = new Uint8Array(COUNT), F = new Uint8Array(COUNT), S = new Uint8Array(COUNT);
  frame.E.forEach(i => { E[i] = 1; }); frame.F.forEach(i => { F[i] = 1; }); frame.S.forEach(i => { S[i] = 1; });
  assert(frame.F.every(i => E[i]), 'F is contained in E');
  assert(frame.S.every(i => F[i] && neighbors8(i).some(j => F[j])), 'S contains only edge-bearing F');
  assert.deepEqual(Array.from(frame.channels.D.filter((_, i) => S[i])), frame.S.map(i => frame.D[i]), 'D channel maps S values');
}
const oldRandom = Math.random; Math.random = () => { throw new Error('RNG is forbidden during descriptive analysis.'); };
let frameRows, tracks;
try {
  frameRows = input.frames.map(analyzeFrame);
  tracks = [];
  for (const window of ['300s', '600s']) {
    const rows = frameRows.filter(frame => frame.window === window);
    assert.equal(rows.length, 20);
    for (const channel of CHANNELS) for (const cutoff of MATCHES) tracks.push(makeTracks(rows, channel, 0.15, cutoff));
  }
} finally { Math.random = oldRandom; }
assert.equal(jsonSafe(input), jsonSafe(JSON.parse(gunzipSync(inputBytes))), 'frozen input remains unchanged');

const existingEarly = JSON.parse(await readFile(resolve(ROOT,
  'docs/ant/evidence/2026-10-29-opportunity-landscape-audit/analysis.json'), 'utf8'));
const summaries = Object.fromEntries(['300s', '600s'].map(window => {
  const rows = frameRows.filter(frame => frame.window === window);
  const localTracks = tracks.filter(row => rows.some(frame => frame.timeMs === row.winnerHistory[0]?.timeMs));
  return [window, { summary: summarize(rows, localTracks), frames: rows }];
}));
const output = { schema: 'ant-late-qualified-opportunity-measurements-v1',
  inputSha256: sha(inputBytes), provenance: input.provenance, conventions: input.protocol,
  earlyReference: { path: 'docs/ant/evidence/2026-10-29-opportunity-landscape-audit/analysis.json',
    inputSha256: existingEarly.inputSha256, decision: 'early hierarchy remains a descriptive comparator' },
  windows: summaries, temporalTracks: tracks };
const summary = { schema: 'ant-late-qualified-opportunity-summary-v1', inputSha256: sha(inputBytes),
  provenance: { main: input.provenance.main, researchParent: input.provenance.researchParent,
    branch: input.provenance.branch, seed: 20261005, tickRate: 60, audio: 'Off' },
  earlyComparison: { source: 'existing early Opportunity Landscape Audit; no early evidence rewritten',
    byChannel: Object.fromEntries(Object.keys(summaries).map(window => [window,
      compareEarly(existingEarly, summaries[window].summary)])) },
  windows: Object.fromEntries(Object.keys(summaries).map(window => [window, summaries[window].summary])),
  protocols: { noNewGroupingOrMatchingThresholds: true, noCompositeScore: true, noAllocationLaw: true,
    windowsAreNotConnectedTracks: true, measurementOnly: true } };
const measurementBytes = gzipSync(JSON.stringify(output) + '\n', { level: 9, mtime: 0 });
const summaryText = JSON.stringify(summary, null, 2) + '\n';
if (process.argv.includes('--check')) {
  assert.equal(gunzipSync(await readFile(resolve(ROOT, MEASUREMENTS))).toString(), gunzipSync(measurementBytes).toString());
  assert.equal(await readFile(resolve(ROOT, SUMMARY), 'utf8'), summaryText);
} else {
  await writeFile(resolve(ROOT, MEASUREMENTS), measurementBytes);
  await writeFile(resolve(ROOT, SUMMARY), summaryText);
}
console.log(JSON.stringify({ status: process.argv.includes('--check') ? 'MEASUREMENT-RERUN-EXACT' : 'MEASUREMENT-WRITTEN',
  inputSha256: sha(inputBytes), measurementsSha256: sha(measurementBytes), summarySha256: sha(Buffer.from(summaryText)),
  windows: Object.fromEntries(Object.entries(summaries).map(([window, row]) => [window,
    { states: row.frames.length, DSpacedTop2ToTop1: row.summary.hierarchy.DspacedTop2ToTop1,
      DWinnerEntryDistance: row.summary.hierarchy.DwinnerEntryDistance,
      DOutsideEntryRatio: row.summary.hierarchy.unconditionedDOutsideEntryToGlobalMaximum }])) }));

function jsonSafe(value) { return JSON.stringify(value); }
