import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';
import { OPPORTUNITY_GRID_SIZE as N, neighbors8, enumeratePlateauMaxima, descriptiveSpacing, reciprocalNearest } from './ant-opportunity-core.js';

const BASE = 'docs/ant/evidence/2026-10-29-opportunity-landscape-audit', IN = `${BASE}/data/frozen-input.json.gz`;
const OUT = `${BASE}/data/measurements.json.gz`, SUMMARY = `${BASE}/analysis.json`, COUNT = N * N;
const CHANNELS = ['D', 'B', 'C', 'recent'], RADII = [.15, .30], MATCH = [.025, .075];
const sha = b => createHash('sha256').update(b).digest('hex');
const point = i => ({ x: i % N / (N - 1), y: Math.floor(i / N) / (N - 1) });
const dist = (a, b) => Math.hypot(a % N - b % N, Math.floor(a / N) - Math.floor(b / N)) / (N - 1);
const sorted = xs => xs.slice().sort((a, b) => a - b);
const topThreeShareComponent = (reps, componentByCell) => reps.length < 3 ? null
  : reps.slice(0, 3).every(x => componentByCell[x.index] === componentByCell[reps[0].index]);
const quantiles = xs => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? Object.fromEntries([['min', 0], ['p10', .1], ['p25', .25], ['median', .5], ['p75', .75], ['p90', .9], ['max', 1]].map(([k, p]) => [k, a[Math.round((a.length - 1) * p)]])) : null;
};
function components(frame) {
  const label = new Int32Array(COUNT).fill(-1), inside = new Uint8Array(COUNT), sizes = []; frame.F.forEach(i => { inside[i] = 1; }); let id = 0;
  for (const start of frame.F) if (label[start] < 0) {
    const stack = [start]; label[start] = id; let size = 0;
    while (stack.length) { const i = stack.pop(); size += 1; for (const j of neighbors8(i)) if (inside[j] && label[j] < 0) { label[j] = id; stack.push(j); } }
    sizes.push(size);
    id += 1;
  }
  return { label, sizes };
}
function topStats(values) {
  const a = values.slice().sort((x, y) => y - x), v = [a[0] ?? null, a[1] ?? null, a[2] ?? null];
  return { top: v, top2ToTop1: v[0] !== null && v[0] > 0 && v[1] !== null ? v[1] / v[0] : null, top3ToTop1: v[0] !== null && v[0] > 0 && v[2] !== null ? v[2] / v[0] : null,
    top1MinusTop2: v[1] === null ? null : v[0] - v[1], top2MinusTop3: v[1] === null || v[2] === null ? null : v[1] - v[2] };
}
function rankInversionPairs(matched) {
  const pairs = [];
  for (let i = 0; i < matched.length; i++) for (let j = i + 1; j < matched.length; j++) {
    const a = matched[i], b = matched[j];
    if ((a.previous.rank - b.previous.rank) * (a.current.rank - b.current.rank) < 0) pairs.push({ a, b });
  }
  return pairs;
}
function xCapture(frame) {
  const F = new Uint8Array(COUNT); frame.F.forEach(i => { F[i] = 1; });
  const eligible = frame.S.filter(i => neighbors8(i).some(j => F[j]));
  if (!eligible.length) return { nucleus: null, cells: [] };
  const d = new Map(frame.S.map((cell, i) => [cell, frame.channels.D[i]]));
  let nucleus = eligible[0];
  for (const i of eligible.slice(1)) if (d.get(i) > d.get(nucleus) || (d.get(i) === d.get(nucleus) && i < nucleus)) nucleus = i;
  const seen = new Uint8Array(COUNT), stack = [nucleus], cells = []; seen[nucleus] = 1;
  while (stack.length) {
    const i = stack.pop(); if (dist(i, nucleus) > .15 + 1e-12) continue; cells.push(i);
    for (const j of neighbors8(i)) if (F[j] && !seen[j] && dist(j, nucleus) <= .15 + 1e-12) { seen[j] = 1; stack.push(j); }
  }
  return { nucleus, cells: sorted(cells) };
}
function frameAnalysis(frame) {
  const S = new Uint8Array(COUNT); for (const i of frame.S) S[i] = 1;
  const { label: componentsByCell, sizes: componentSizes } = components(frame), channels = {};
  for (const name of CHANNELS) {
    const values = new Float64Array(COUNT); frame.S.forEach((cell, i) => { values[cell] = frame.channels[name][i]; });
    const { peaks, zeroMaxContextCount } = enumeratePlateauMaxima({ S, values });
    const topNode = peaks.slice().sort((a, b) => b.value - a.value || a.index - b.index)[0] ?? null;
    channels[name] = { zeroMaxContextCount, node: topStats(frame.S.map(i => values[i])), topNodeIndex: topNode?.index ?? null,
      topNodeEntryDistance: topNode ? Math.hypot(point(topNode.index).x - .5, point(topNode.index).y - .72) : null,
      peak: topStats(peaks.map(p => p.value)), peaks: peaks.map(p => ({ ...p, point: point(p.index), component: componentsByCell[p.index], componentSize: componentSizes[componentsByCell[p.index]] })),
      spacings: Object.fromEntries(RADII.map(radius => {
        const grouped = descriptiveSpacing(peaks, componentsByCell, radius), reps = grouped.representatives;
        const groups = reps.map((rep, ri) => {
          const memberPeaks = grouped.assignments.filter(a => a.representativeIndex === rep.index).map(a => a.peak);
          const groupDiameter = memberPeaks.length < 2 ? 0 : Math.max(...memberPeaks.map(a => Math.max(...memberPeaks.map(b => dist(a.index, b.index)))));
          const p = point(rep.index);
          const sourceDistance = Math.hypot(p.x - .5, p.y - .72);
          return { representativeIndex: rep.index, point: p, value: rep.value, component: componentsByCell[rep.index], componentSize: componentSizes[componentsByCell[rep.index]],
            peakIndices: memberPeaks.map(x => x.index), memberCells: memberPeaks.map(x => x.cells), groupDiameter,
            distances: { entry: sourceDistance, center: Math.hypot(p.x - .5, p.y - .5), edge: Math.min(p.x, p.y, 1 - p.x, 1 - p.y), sourceAnnulus: sourceDistance,
              insideSourceAnnulus: sourceDistance >= .055 && sourceDistance <= .115 },
            preMaterialLayers: frame.preMaterialLayers[frame.S.indexOf(rep.index)] ?? 0,
            nearbyRecentFeet: frame.channels.recent[frame.S.indexOf(rep.index)] ?? 0,
            exactFeet20s: frame.exactFeet20s[frame.S.indexOf(rep.index)] ?? 0,
            lastNearbyFootAgeSeconds: frame.lastNearbyFootAgeSeconds[frame.S.indexOf(rep.index)] ?? null };
        });
        const byValue = reps.map(x => x.value);
        const winner = groups[0];
        const materialFree = groups.slice(1).filter(g => g.preMaterialLayers === 0)[0] ?? null;
        return [radius, { centers: groups, assignments: grouped.assignments.map(a => ({ peakIndex: a.peak.index, representativeIndex: a.representativeIndex, distance: a.distance })),
          top: topStats(byValue), topCenters: reps.slice(0, 3).map(x => ({ index: x.index, value: x.value, point: point(x.index) })),
          topWinnerEntryDistance: groups[0]?.distances.entry ?? null,
          strongestMaterialFreeNonwinner: materialFree ? { index: materialFree.representativeIndex, value: materialFree.value,
            strengthRatioToWinner: winner?.value ? materialFree.value / winner.value : null,
            distanceToWinner: winner ? dist(materialFree.representativeIndex, winner.representativeIndex) : null } : null,
          crossComponentClosePairs: peaks.flatMap((a, i) => peaks.slice(i + 1).filter(b => componentsByCell[a.index] !== componentsByCell[b.index] && dist(a.index, b.index) <= radius).map(b => [a.index, b.index])),
          top3SameComponent: topThreeShareComponent(reps, componentsByCell), spacedCenterPairDistances: reps.flatMap((a, i) => reps.slice(i + 1).map(b => dist(a.index, b.index))) }];
      })) };
  }
  const maxima = Object.fromEntries(['B', 'C', 'recent'].map(name => [name, frame.globalMaxima[name]]));
  return { ...frame, components: [...new Set([...componentsByCell].filter(x => x >= 0))].length, channels, unconditionedChannelMaxima: maxima };
}
function makeTracks(frames, radius, cutoff) {
  const tracks = [], observations = [], unmatched = [], candidates = [], rankChanges = [], rankCrossovers = [], winnerTransitions = [];
  let previous = [];
  for (let fi = 0; fi < frames.length; fi++) {
    const frame = frames[fi], current = frame.channels[channelName].spacings[radius].centers.map((x, rank) => ({ index: x.representativeIndex, rank: rank + 1, value: x.value, memberPeakIndices: x.peakIndices, members: [...new Set(x.memberCells.flat())] }));
    if (!fi) { current.forEach(o => tracks.push({ id: tracks.length, observations: [obs(frame, o)] })); previous = current.map((o, i) => ({ ...o, track: i })); observations.push(...current.map((o, i) => ({ ...obs(frame, o), trackId: i }))); continue; }
    const pairs = reciprocalNearest(previous, current, cutoff), map = new Map(pairs.pairs.map(p => [p.currentIndex, previous.find(x => x.index === p.previousIndex)]));
    for (const a of previous) for (const b of current) { const d = dist(a.index, b.index); if (d <= .075) candidates.push({ fromTimeMs: frames[fi - 1].timeMs, toTimeMs: frame.timeMs, fromIndex: a.index, toIndex: b.index, distance: d,
      fromMemberPeakIndices: a.memberPeakIndices, toMemberPeakIndices: b.memberPeakIndices, memberPlateauCellOverlap: overlap(a.members, b.members) }); }
    const trackByCell = new Map();
    for (const o of current) {
      const prev = map.get(o.index), trackId = prev ? prev.track : tracks.length;
      if (!prev) tracks.push({ id: trackId, observations: [] });
      trackByCell.set(o.index, trackId);
      const item = { ...obs(frame, o), trackId }; tracks[trackId].observations.push(item); observations.push(item);
      if (prev && prev.rank !== o.rank) rankChanges.push({ fromTimeMs: frames[fi - 1].timeMs, toTimeMs: frame.timeMs, trackId, previousRank: prev.rank, currentRank: o.rank });
    }
    const matchedCurrent = current.filter(o => map.has(o.index)).map(o => ({ current: o, previous: map.get(o.index) }));
    for (const { a, b } of rankInversionPairs(matchedCurrent)) rankCrossovers.push({
      fromTimeMs: frames[fi - 1].timeMs, toTimeMs: frame.timeMs, trackIds: [a.previous.track, b.previous.track],
      previousRanks: [a.previous.rank, b.previous.rank], currentRanks: [a.current.rank, b.current.rank] });
    const oldWinner = previous.find(o => o.rank === 1), newWinner = current.find(o => o.rank === 1), newWinnerPrevious = newWinner ? map.get(newWinner.index) : null;
    const oldWinnerCurrent = oldWinner ? matchedCurrent.find(x => x.previous.track === oldWinner.track)?.current : null;
    const rankCrossing = Boolean(oldWinner && newWinner && newWinnerPrevious && oldWinnerCurrent && newWinnerPrevious.rank > oldWinner.rank
      && newWinner.rank < oldWinnerCurrent.rank);
    winnerTransitions.push({ fromTimeMs: frames[fi - 1].timeMs, toTimeMs: frame.timeMs, oldWinnerTrackId: oldWinner?.track ?? null,
      newWinnerTrackId: newWinner ? trackByCell.get(newWinner.index) : null, oldWinnerMatched: Boolean(oldWinnerCurrent), newWinnerMatched: Boolean(newWinnerPrevious),
      rankCrossing, transition: !oldWinner || !newWinner || !oldWinnerCurrent || !newWinnerPrevious ? 'unmatched-or-absent'
        : rankCrossing ? 'rank-crossing' : oldWinner.track === newWinnerPrevious.track ? 'same-track' : 'other-matched-change' });
    for (const index of pairs.unmatchedPrevious) unmatched.push({ timeMs: frames[fi - 1].timeMs, index, side: 'previous', reason: current.some(o => dist(index, o.index) <= cutoff) ? 'no-reciprocal-partner' : 'no-candidate-inside-cutoff' });
    for (const index of pairs.unmatchedCurrent) unmatched.push({ timeMs: frame.timeMs, index, side: 'current', reason: previous.some(o => dist(index, o.index) <= cutoff) ? 'no-reciprocal-partner' : 'no-candidate-inside-cutoff' });
    previous = current.map(o => ({ ...o, track: trackByCell.get(o.index) }));
  }
  const trackRows = tracks.map(t => ({ id: t.id, observations: t.observations, observedSpanMs: t.observations.at(-1).timeMs - t.observations[0].timeMs }));
  const winnerHistory = frames.map(f => {
    const w = observations.find(o => o.timeMs === f.timeMs && o.rank === 1);
    return { timeMs: f.timeMs, exactCell: w?.cell ?? null, trackId: w?.trackId ?? null };
  });
  return { channel: channelName, spacingRadius: radius, maxDisplacement: cutoff, tracks: trackRows, observations, unmatched,
    candidatePairs: candidates, rankChanges, rankCrossovers, winnerTransitions, winnerHistory,
    exactWinnerCellSwitches: winnerHistory.slice(1).filter((x, i) => x.exactCell !== winnerHistory[i].exactCell).length,
    winnerTrackSwitches: winnerHistory.slice(1).filter((x, i) => x.trackId !== winnerHistory[i].trackId).length,
    winnerChangesDueToRankCrossing: winnerTransitions.filter(x => x.rankCrossing).length };
}
function obs(frame, o) { return { timeMs: frame.timeMs, rank: o.rank, value: o.value, cell: o.index, point: point(o.index), memberPeakIndices: o.memberPeakIndices ?? [], memberCells: o.members ?? [] }; }
function overlap(a, b) { const s = new Set(a); return b.filter(x => s.has(x)).length; }
assert.deepEqual(topStats([5]).top, [5, null, null]);
assert.equal(topStats([5]).top2ToTop1, null);
assert.equal(topThreeShareComponent([{ index: 10 }, { index: 11 }, { index: 12 }], Object.assign(new Int16Array(COUNT), { 10: 1, 11: 1, 12: 2 })), false);
assert.equal(topThreeShareComponent([{ index: 10 }, { index: 11 }], new Int16Array(COUNT)), null);
assert.equal(rankInversionPairs([{ previous: { track: 1, rank: 1 }, current: { rank: 2 } },
  { previous: { track: 2, rank: 2 }, current: { rank: 1 } }]).length, 1);
assert.deepEqual(xCapture({ F: [10, 11, 20], S: [10, 11, 20], channels: { D: [3, 2, 1] } }).cells, [10, 11]);
let channelName;
function materialContext(frames, births) {
  let previousIndex = null, exactSwitches = 0, winnerHistory = [];
  const rows = frames.map(f => {
    const cell = frameArgmaxD(f), p = cell === null ? null : point(cell), x = xCapture(f);
    if (cell !== null && previousIndex !== null && cell !== previousIndex) exactSwitches++;
    previousIndex = cell;
    const prior = births.filter(b => b.timeMs < f.timeMs), after = births.filter(b => b.timeMs <= f.timeMs);
    const existing = new Set(prior.flatMap(b => b.cells)), union = new Set(after.flatMap(b => b.cells));
    const layersAtMax = cell === null ? null : prior.reduce((n, b) => n + (b.cells.includes(cell) ? 1 : 0), 0);
    const xExisting = x.cells.filter(i => existing.has(i)), disk = cell === null ? [] : Array.from({ length: COUNT }, (_, i) => i).filter(i => dist(i, cell) <= .15);
    return { timeMs: f.timeMs, currentMaxDIndex: cell, value: cell === null ? null : f.channels.D[f.S.indexOf(cell)], currentMaxDEntryDistance: p ? Math.hypot(p.x - .5, p.y - .72) : null,
      preexistingLayerCountAtPeak: layersAtMax, preexistingMaterialCells: existing.size, postAnchorMaterialCells: union.size,
      nearbyFeet20AtCurrentMaxD: cell === null ? null : f.channels.recent[f.S.indexOf(cell)],
      lastNearbyFootAgeSecondsAtCurrentMaxD: cell === null ? null : f.lastNearbyFootAgeSeconds[f.S.indexOf(cell)],
      xCaptureNucleus: x.nucleus, xCaptureCells: x.cells, xCaptureCellCount: x.cells.length,
      preexistingXMaterialCells: xExisting, preexistingXMaterialCellCount: xExisting.length,
      preexistingXMaterialFraction: x.cells.length ? xExisting.length / x.cells.length : null,
      diskContextMaterialCellCount: disk.filter(i => existing.has(i)).length, diskContextCellCount: disk.length,
      diskContextMaterialFraction: disk.length ? disk.filter(i => existing.has(i)).length / disk.length : null,
      exactBirthAnchor: births.filter(b => b.timeMs === f.timeMs).map(b => b.id) };
  });
  winnerHistory = rows.map(x => ({ timeMs: x.timeMs, index: x.currentMaxDIndex, value: x.value }));
  return { currentMaxD: rows, exactNodeWinnerSwitches: exactSwitches, winnerHistory, firstActualPlateBirthTimeMs: Math.min(...births.map(b => b.timeMs)) };
}
function frameArgmaxD(frame) {
  if (!frame.S.length) return null;
  let winner = frame.S[0], value = frame.channels.D[0];
  for (let i = 1; i < frame.S.length; i++) if (frame.channels.D[i] > value || (frame.channels.D[i] === value && frame.S[i] < winner)) { winner = frame.S[i]; value = frame.channels.D[i]; }
  return winner;
}
function xAnchorParity(input, materialRows) {
  const saved = JSON.parse(readFileSync('docs/ant/evidence/2026-10-29-authored-materialization-law-synthesis/analysis.json', 'utf8'));
  const anchors = input.frames.filter(f => saved.events.some(e => e.anchors.some(a => Math.abs(a.timeMs - f.timeMs) <= 1e-6))).map(frame => {
    const expected = saved.events.flatMap(e => e.anchors).find(a => Math.abs(a.timeMs - frame.timeMs) <= 1e-6);
    const actualRow = materialRows.find(r => Math.abs(r.timeMs - frame.timeMs) <= 1e-6);
    const nucleus = actualRow.xCaptureNucleus, actual = actualRow.xCaptureCells, prior = sorted(expected.candidates.X.cells);
    assert.equal(frame.timeMs, expected.timeMs);
    assert.equal(nucleus, expected.nucleus.index, `X nucleus mismatch at ${frame.timeMs}`);
    assert.deepEqual(actual, prior, `saved X cell set mismatch at ${frame.timeMs}`);
    return { timeMs: frame.timeMs, nucleus, cells: actual.length, exactCellSetMatch: true };
  });
  assert.equal(anchors.length, 10);
  return { reference: '5b9cd6b authored materialization analysis', toleranceMs: 1e-6, radius: .15, anchors };
}
function secondaryActualMaterial(input, seed, seconds, maxIndex) {
  const source = input.secondary.actualMaterial;
  if (!source || seed !== source.seed || source.seed !== 20261005) return null;
  const t = seconds * 1000, prior = source.births.filter(b => b.timeMs < t), cells = new Set(prior.flatMap(b => b.cells));
  return { seed: source.seed, asOfTimeMs: t, preexistingDescriptorCount: prior.length, preexistingMaterialCellCount: cells.size,
    preexistingLayerCountAtGlobalMaxD: prior.reduce((n, b) => n + (b.cells.includes(maxIndex) ? 1 : 0), 0),
    sourcePath: source.path, sourceSha256: source.sha256, receiptPath: source.receiptPath, receiptSha256: source.receiptSha256,
    verification: source.verification, caveat: source.caveat };
}
function summarize(frames, tracks, material) {
  const usable = frames.filter(f => f.S.length), out = { frames: frames.length, usableFrames: usable.length, excludedNoSFrames: frames.length - usable.length, channels: {},
    baselineSEntryDistance: quantiles(usable.flatMap(f => f.S.map(i => { const p = point(i); return Math.hypot(p.x - .5, p.y - .72); }))),
    globalSWinnerEntryDistance: quantiles(material.currentMaxD.map(x => x.currentMaxDEntryDistance)) };
  for (const c of CHANNELS) out.channels[c] = Object.fromEntries(RADII.map(r => {
    const gs = usable.flatMap(f => f.channels[c].spacings[r].centers), peakCounts = usable.map(f => f.channels[c].peaks.length), centerCounts = usable.map(f => f.channels[c].spacings[r].centers.length);
    const nonwinner = usable.map(f => f.channels[c].spacings[r].strongestMaterialFreeNonwinner).filter(Boolean);
    return [r, { peakCount: quantiles(peakCounts), spacedCenterCount: quantiles(centerCounts),
      nodeTop2StrengthRatio: quantiles(usable.map(f => f.channels[c].node.top2ToTop1)), peakTop2StrengthRatio: quantiles(usable.map(f => f.channels[c].peak.top2ToTop1)),
      top2StrengthRatio: quantiles(usable.map(f => f.channels[c].spacings[r].top.top2ToTop1)), entryDistance: quantiles(gs.map(x => x.distances.entry)),
      topSNodeWinnerEntryDistance: quantiles(usable.map(f => f.channels[c].topNodeEntryDistance)),
      spacedCenterWinnerEntryDistance: quantiles(usable.map(f => f.channels[c].spacings[r].topWinnerEntryDistance)),
      materialLayersAtGroups: quantiles(gs.map(x => x.preMaterialLayers)), strongestMaterialFreeNonwinnerStrengthRatio: quantiles(nonwinner.map(x => x.strengthRatioToWinner)),
      strongestMaterialFreeNonwinnerDistanceToWinner: quantiles(nonwinner.map(x => x.distanceToWinner)),
      top3SameComponentFrameCount: usable.filter(f => f.channels[c].spacings[r].top3SameComponent === true).length,
      top3SameComponentFrameDenominator: usable.filter(f => f.channels[c].spacings[r].centers.length >= 3).length,
      top3SameComponentFrameFraction: usable.filter(f => f.channels[c].spacings[r].centers.length >= 3).length
        ? usable.filter(f => f.channels[c].spacings[r].top3SameComponent === true).length / usable.filter(f => f.channels[c].spacings[r].centers.length >= 3).length : null,
      crossComponentClosePairCount: usable.reduce((n, f) => n + f.channels[c].spacings[r].crossComponentClosePairs.length, 0) }];
  }));
  out.fullFieldMaximumQualificationContext = Object.fromEntries(CHANNELS.map(c => {
    const categories = { inS: 0, inFnotS: 0, inEnotF: 0, outsideE: 0 }, ratios = [];
    let rawGlobalEqualsSNodeMaxCount = 0, positiveFrames = 0;
    for (const f of usable) {
      const maximum = f.globalMaxima[c];
      if (!(maximum.value > 0)) continue;
      positiveFrames += 1;
      const inS = f.S.includes(maximum.index), inF = f.F.includes(maximum.index), inE = f.E.includes(maximum.index);
      categories[inS ? 'inS' : inF ? 'inFnotS' : inE ? 'inEnotF' : 'outsideE'] += 1;
      const sMaximum = f.channels[c].node.top[0];
      if (maximum.value === sMaximum) rawGlobalEqualsSNodeMaxCount += 1;
      ratios.push(sMaximum / maximum.value);
    }
    assert.equal(positiveFrames, usable.length, `${c} expected a positive full-field maximum in every usable frame`);
    assert.equal(Object.values(categories).reduce((a, b) => a + b, 0), 109, `${c} full-field maximum classification must cover all 109 usable frames`);
    return [c, { source: 'stored full-field globalMaxima; E/F/S membership from frozen frame arrays', positiveFrames, categories,
      rawGlobalEqualsSNodeMaxCount, sNodeMaxToGlobalMaxRatio: quantiles(ratios) }];
  }));
  out.temporal = tracks.map(t => ({ channel: t.channel, radius: t.spacingRadius, cutoff: t.maxDisplacement, matchedTracks: t.tracks.length,
    observedSpanSeconds: quantiles(t.tracks.map(x => x.observedSpanMs / 1000)), longestTrackSeconds: Math.max(0, ...t.tracks.map(x => x.observedSpanMs / 1000)),
    unmatched: t.unmatched.length, noCandidate: t.unmatched.filter(x => x.reason === 'no-candidate-inside-cutoff').length,
    nonReciprocal: t.unmatched.filter(x => x.reason === 'no-reciprocal-partner').length, rankChanges: t.rankChanges.length, rankCrossovers: t.rankCrossovers.length,
    exactWinnerCellSwitches: t.exactWinnerCellSwitches, winnerTrackSwitches: t.winnerTrackSwitches,
    winnerChangesDueToRankCrossing: t.winnerChangesDueToRankCrossing,
    withinUsableAdjacentPairs: (() => {
      const adjacent = frames.slice(1).map((f, i) => ({ previous: frames[i], current: f, priorWinner: t.winnerHistory[i], nextWinner: t.winnerHistory[i + 1] }))
        .filter(p => p.previous.S.length && p.current.S.length);
      const transitions = t.winnerTransitions.filter(x => adjacent.some(p => p.previous.timeMs === x.fromTimeMs && p.current.timeMs === x.toTimeMs));
      return { pairCount: adjacent.length,
        exactIndexSwitches: adjacent.filter(p => p.priorWinner.exactCell !== p.nextWinner.exactCell).length,
        trackChanges: adjacent.filter(p => p.priorWinner.trackId !== p.nextWinner.trackId).length,
        winnerRankCrossings: transitions.filter(x => x.rankCrossing).length };
    })(),
    initialAppearanceCount: t.winnerHistory.slice(1).filter((x, i) => t.winnerHistory[i].exactCell === null && x.exactCell !== null).length }));
  out.material = { currentMaxDPreexistingLayers: quantiles(material.currentMaxD.map(x => x.preexistingLayerCountAtPeak)),
    xCapturePreexistingMaterialFraction: quantiles(material.currentMaxD.map(x => x.preexistingXMaterialFraction)),
    diskContextPreexistingMaterialFraction: quantiles(material.currentMaxD.map(x => x.diskContextMaterialFraction)) };
  const full20 = usable.filter(f => f.exposureSeconds >= 20);
  out.recentFull20SecondsOnly = { includedFrames: full20.length, leftCensoredFramesExcluded: frames.filter(f => f.exposureSeconds < 20).length,
    channels: Object.fromEntries(['D', 'B', 'recent'].map(c => [c, {
      nodeTop2StrengthRatio: quantiles(full20.map(f => f.channels[c].node.top2ToTop1)),
      peakTop2StrengthRatio: quantiles(full20.map(f => f.channels[c].peak.top2ToTop1)),
      spacedWinnerTop2StrengthRatio: quantiles(full20.map(f => f.channels[c].spacings[.15].top.top2ToTop1))
    }])) };
  const firstBirth = material.firstActualPlateBirthTimeMs;
  const postBirthFrames = frames.filter(f => f.timeMs > firstBirth), postBirthMaterial = material.currentMaxD.filter(x => x.timeMs > firstBirth);
  out.afterFirstActualPlate = { firstBirthTimeMs: firstBirth, strictLaterFrameCount: postBirthFrames.length,
    DCurrentWinnerNearbyFeet20: quantiles(postBirthMaterial.map(x => x.nearbyFeet20AtCurrentMaxD)),
    DCurrentWinnerLastNearbyFootAgeSeconds: quantiles(postBirthMaterial.map(x => x.lastNearbyFootAgeSecondsAtCurrentMaxD)),
    DCurrentWinnerPeakLayerZeroFrames: postBirthMaterial.filter(x => x.preexistingLayerCountAtPeak === 0).length,
    DCurrentWinnerXPreexistingMaterialFraction: quantiles(postBirthMaterial.map(x => x.preexistingXMaterialFraction)),
    strongestMaterialFreeNonwinner: Object.fromEntries(CHANNELS.map(c => [c, {
      strengthRatio: quantiles(postBirthFrames.map(f => f.channels[c].spacings[.15].strongestMaterialFreeNonwinner?.strengthRatioToWinner)),
      distanceToWinner: quantiles(postBirthFrames.map(f => f.channels[c].spacings[.15].strongestMaterialFreeNonwinner?.distanceToWinner)),
      observedFrames: postBirthFrames.filter(f => f.channels[c].spacings[.15].strongestMaterialFreeNonwinner).length
    }])) };
  return out;
}

const inputBytes = readFileSync(IN), inputText = gunzipSync(inputBytes).toString();
assert.equal(sha(inputBytes), 'e823394144b164b25de03beef3b1497442533463c120b6109338a3659a41643e');
const input = JSON.parse(inputText); assert.equal(input.frames.length, 120);
const inputBefore = JSON.stringify(input);
const oldRandom = Math.random; Math.random = () => { throw new Error('RNG forbidden in descriptive analysis'); };
let frames, tracks, material;
try {
  frames = input.frames.map(frameAnalysis);
  tracks = [];
  for (channelName of CHANNELS) for (const cutoff of MATCH) tracks.push(makeTracks(frames, .15, cutoff));
  material = materialContext(input.frames, input.births);
} finally { Math.random = oldRandom; }
for (const analyzed of frames.filter(f => f.S.length)) {
  const reference = material.currentMaxD.find(row => row.timeMs === analyzed.timeMs);
  assert.equal(reference.currentMaxDIndex, analyzed.channels.D.spacings[.15].centers[0].representativeIndex,
    `material D reference index mismatch at ${analyzed.timeMs}`);
  assert.equal(reference.value, analyzed.channels.D.node.top[0], `material D reference value mismatch at ${analyzed.timeMs}`);
}
const surfaceSource = readFileSync('src/lib/agents/ant/SurfaceField.js');
assert.equal(sha(surfaceSource.toString().replace(/\r\n?/g, '\n')), input.sourceSha256LF.SurfaceField);
const checkpoints = input.secondary.checkpoints.map(c => {
  const bytes = readFileSync(`docs/ant/evidence/2026-10-25-g-production-candidate-review/data/${c.path.split('/').at(-1)}`);
  assert.equal(sha(bytes), c.sha256); const d = JSON.parse(gunzipSync(bytes));
  const sf = new SurfaceField(); sf.values.set(d.surface.values);
  const values = new Float32Array(COUNT); for (let i = 0; i < COUNT; i++) values[i] = Math.fround(sf.sampleSupport(i % N / 95, Math.floor(i / N) / 95, .025));
  const max = Math.max(...values), index = values.indexOf(max), p = point(index), entryD = Math.hypot(p.x - .5, p.y - .72);
  const inside = [], outside = []; for (let i = 0; i < COUNT; i++) (Math.hypot(point(i).x - .5, point(i).y - .72) <= .15 ? inside : outside).push(values[i]);
  const maxOutside = Math.max(...outside), maxAll = Math.max(...values);
  return { seed: c.seed, seconds: c.seconds, sha256: c.sha256, derivedD: true, globalMaxD: { index, value: max, entryDistance: entryD },
    DDistribution: quantiles([...values]), maxOutsideEntryDiskR015ToGlobalMax: maxAll ? maxOutside / maxAll : null,
    meanDInsideEntryDiskR015: inside.reduce((a, b) => a + b, 0) / inside.length, meanDOutsideEntryDiskR015: outside.reduce((a, b) => a + b, 0) / outside.length,
    actualMaterialContext: secondaryActualMaterial(input, c.seed, c.seconds, index) };
});
const parity = xAnchorParity(input, material.currentMaxD);
assert.equal(JSON.stringify(input), inputBefore, 'descriptive analysis must not mutate frozen input');
const measurements = { schema: 'ant-opportunity-landscape-measurements-v1', inputSha256: sha(inputBytes), sourceCommit: input.main,
  frames, temporalTracks: tracks, materialContext: material, secondaryCheckpoints: checkpoints, savedXAnchorParity: parity };
const summary = { schema: 'ant-opportunity-landscape-summary-v1', inputSha256: sha(inputBytes), sourceSha256LF: input.sourceSha256LF,
  provenance: { main: input.main, researchParent: input.researchParent, primaryRawRef: input.primaryRawRef, primaryGzipSha256: input.primaryGzipSha256, seed: input.seed, audio: input.audio },
  protocol: { channels: CHANNELS, domain: 'edge-bearing F (S)', peakTerm: 'S-restricted signal peaks', spacings: RADII, matchingDisplacements: MATCH,
    materialPhase: 'birth time strictly earlier than sampled time', noThresholdsOrAllocationLaw: true, noSignificanceTests: true },
  summary: summarize(frames, tracks, material), secondaryCheckpoints: checkpoints, savedXAnchorParity: parity };
const outBytes = gzipSync(JSON.stringify(measurements) + '\n', { level: 9 }), summaryText = JSON.stringify(summary, null, 2) + '\n';
if (process.argv.includes('--check')) {
  assert.equal(gunzipSync(readFileSync(OUT)).toString(), gunzipSync(outBytes).toString());
  assert.equal(readFileSync(SUMMARY, 'utf8').replace(/\r\n?/g, '\n'), summaryText);
} else {
  mkdirSync(`${BASE}/data`, { recursive: true }); writeFileSync(OUT, outBytes); writeFileSync(SUMMARY, summaryText);
}
console.log(`Opportunity landscape ${process.argv.includes('--check') ? 'check passed' : 'written'}: ${frames.length} frames, ${tracks.length} temporal summaries`);
