import assert from 'node:assert/strict';
import { resolve, dirname, basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readRun, readJson, writeJson, unpack, sha256 } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DATA = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis');
const SEEDS = ['20261005', '20261006', '20261007'];
const AUTHORITY = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const FAMILIES = ['D', 'B', 'C', 'feet1', 'feet5', 'feet20', 'travel1', 'travel5', 'travel20',
  'deltaD1', 'deltaD5', 'deltaD20', 'deltaB1', 'deltaB5', 'deltaB20', 'deltaC1', 'deltaC5', 'deltaC20'];
const STRIDES = [-20, -10, -5, -1, 0, 1, 5, 10, 20];
const CASES = ['longest-nonentry-D', 'longest-entry-D', 'integrated-positive-deltaD5', 'integrated-positive-deltaB5'];

export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const quantile = p => { const h = (sorted.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return sorted.length ? sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo) : null; };
  return { n: sorted.length, min: sorted[0] ?? null, p10: quantile(.1), median: quantile(.5), p90: quantile(.9),
    max: sorted.at(-1) ?? null, mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null };
}
export function ranks(values) {
  const order = values.map((value, i) => ({ value, i })).sort((a, b) => a.value - b.value || a.i - b.i), result = [];
  for (let i = 0; i < order.length;) {
    let j = i + 1; while (j < order.length && order[j].value === order[i].value) j++;
    for (let k = i; k < j; k++) result[order[k].i] = (i + j - 1) / 2 + 1;
    i = j;
  }
  return result;
}
export function correlation(left, right) {
  assert.equal(left.length, right.length);
  const pairs = left.map((x, i) => [x, right[i]]).filter(pair => pair.every(Number.isFinite));
  if (pairs.length < 3) return { n: pairs.length, pearson: null, spearman: null };
  const pearson = (x, y) => {
    const mx = x.reduce((a, b) => a + b, 0) / x.length, my = y.reduce((a, b) => a + b, 0) / y.length;
    let xy = 0, xx = 0, yy = 0;
    for (let i = 0; i < x.length; i++) { const a = x[i] - mx, b = y[i] - my; xy += a * b; xx += a * a; yy += b * b; }
    return xx > 0 && yy > 0 ? Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) : null;
  };
  const x = pairs.map(pair => pair[0]), y = pairs.map(pair => pair[1]);
  return { n: pairs.length, pearson: pearson(x, y), spearman: pearson(ranks(x), ranks(y)) };
}
export function contiguousEpisodes(observations, predicate) {
  const episodes = []; let current = [];
  for (const row of observations) {
    if (!predicate(row)) { if (current.length) episodes.push(current); current = []; continue; }
    if (current.length && row.anchorIndex !== current.at(-1).anchorIndex + 1) { episodes.push(current); current = []; }
    current.push(row);
  }
  if (current.length) episodes.push(current);
  return episodes;
}
export function positiveIntegral(observations) {
  let total = 0;
  for (let i = 1; i < observations.length; i++) total += (Math.max(0, observations[i - 1].value)
    + Math.max(0, observations[i].value)) / 2 * (observations[i].timeMs - observations[i - 1].timeMs) / 1000;
  return total;
}
export function gatedChangeCounts(SIndices, deltaD, olderB) {
  let positiveDCells = 0, priorChemicalUnqualifiedCells = 0;
  for (const index of SIndices) if (deltaD[index] > 0) {
    positiveDCells++; if (olderB[index] < .30) priorChemicalUnqualifiedCells++;
  }
  return { positiveDCells, priorChemicalUnqualifiedCells };
}
export function strictRankCrossings(previous, current, cutoff) {
  const old = new Map(previous.map(row => [row.trackIds[String(cutoff)], row]));
  const matched = current.filter(row => old.has(row.trackIds[String(cutoff)]))
    .map(row => ({ before: old.get(row.trackIds[String(cutoff)]).value, after: row.value }));
  const values = [...new Set(matched.map(row => row.after))].sort((a, b) => a - b);
  const positions = new Map(values.map((value, i) => [value, i + 1])), tree = new Uint32Array(values.length + 1);
  const prefix = index => { let n = 0; for (; index > 0; index -= index & -index) n += tree[index]; return n; };
  const insert = index => { for (; index < tree.length; index += index & -index) tree[index]++; };
  matched.sort((a, b) => b.before - a.before);
  let crossings = 0;
  for (let i = 0; i < matched.length;) {
    let j = i + 1; while (j < matched.length && matched[j].before === matched[i].before) j++;
    for (let k = i; k < j; k++) crossings += prefix(positions.get(matched[k].after) - 1);
    for (let k = i; k < j; k++) insert(positions.get(matched[k].after));
    i = j;
  }
  return { matchedCenters: matched.length, crossings };
}
function rankDynamics(anchors) {
  const output = [];
  for (const channel of FAMILIES) for (const representation of ['raw', 'g15', 'g30']) for (const cutoff of [.025, .075]) {
    let crossings = 0, matchedCenterTransitions = 0, winnerTrackChangesAll = 0, winnerNucleusChanges = 0, pairedWinnerBoundaries = 0;
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1].channels[channel]?.[representation] ?? [], b = anchors[i].channels[channel]?.[representation] ?? [];
      const counts = strictRankCrossings(a, b, cutoff); crossings += counts.crossings; matchedCenterTransitions += counts.matchedCenters;
      if (a.length && b.length) {
        pairedWinnerBoundaries++; winnerNucleusChanges += Number(a[0].index !== b[0].index);
        winnerTrackChangesAll += Number(a[0].trackIds[String(cutoff)] !== b[0].trackIds[String(cutoff)]);
      }
    }
    output.push({ channel, representation, cutoff, strictStrengthRankCrossings: crossings,
      matchedCenterTransitions, pairedWinnerBoundaries, winnerTrackChangesAll, winnerNucleusChanges });
  }
  return output;
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function overlap(left, right) {
  if (!left || !right) return null;
  const a = new Set(left.cells), b = new Set(right.cells);
  let intersection = 0; for (const cell of a) if (b.has(cell)) intersection++;
  return { intersection, jaccard: intersection / (a.size + b.size - intersection),
    overlapOfSmaller: intersection / Math.min(a.size, b.size), identical: intersection === a.size && intersection === b.size };
}
function reciprocal(left, right, cutoff) {
  const nearest = (from, to) => from.map(a => {
    let best = null;
    for (const b of to) {
      if (a.component !== b.component) continue;
      const d = distance(a, b);
      if (d <= cutoff && (!best || d < best.distance || d === best.distance && b.index < best.index)) best = { index: b.index, distance: d };
    }
    return best;
  });
  const forward = nearest(left, right), backward = nearest(right, left), rightPosition = new Map(right.map((row, i) => [row.index, i]));
  return forward.flatMap((match, i) => match && backward[rightPosition.get(match.index)]?.index === left[i].index
    ? [{ a: left[i].index, b: match.index, distance: match.distance }] : []);
}
function fieldArrays(source, analysis) {
  const fields = { B: unpack(source.B), C: unpack(source.C), D: unpack(source.D) };
  for (const w of [1, 5, 20]) {
    fields['feet' + w] = unpack(source.feet[w].count);
    fields['travel' + w] = unpack(source.traffic[w].travel);
    for (const q of ['B', 'C', 'D']) fields['delta' + q + w] = unpack(analysis.delta['delta' + q + w]);
  }
  return fields;
}
function sampleFields(fields, index) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value ? value[index] : null]));
}
function pairSummary(rows) {
  const finite = key => distribution(rows.map(row => row[key]));
  return { analyses: rows.length, winnerDistance: finite('winnerDistance'),
    winnerXJaccard: finite('winnerXJaccard'), rankCorrespondence: finite('rankSpearman'),
    reciprocal025FractionOfA: finite('match025FractionOfA'), reciprocal075FractionOfA: finite('match075FractionOfA'),
    sameWinnerX: rows.filter(row => row.sameWinnerX).length,
    bothAvailable: rows.filter(row => row.winnerDistance !== null).length };
}
function bestCases(run) {
  const candidates = [];
  for (const track of run.tracks) {
    if (track.representation !== 'g15' || track.cutoff !== .025 || !['D', 'deltaD5', 'deltaB5'].includes(track.channel)) continue;
    for (const inside of track.channel === 'D' ? [true, false] : [false]) {
      for (const rows of contiguousEpisodes(track.observations, row => inside ? row.entryDistance <= .15 : row.entryDistance > .15)) {
        if (track.channel !== 'D' && rows.length < 2) continue;
        const duration = (rows.at(-1).timeMs - rows[0].timeMs) / 1000;
        candidates.push({ seed: run.seed, category: track.channel === 'D' ? (inside ? CASES[1] : CASES[0])
          : 'integrated-positive-' + track.channel, trackId: track.id, channel: track.channel,
        representation: 'g15', cutoff: .025, anchorIndices: rows.map(row => row.anchorIndex),
        centerIndices: rows.map(row => row.centerIndex), durationSeconds: duration,
        selectionValue: track.channel === 'D' ? duration : positiveIntegral(rows), observations: rows });
      }
    }
  }
  return CASES.flatMap(category => {
    const rows = candidates.filter(row => row.category === category).sort(caseOrder);
    return rows.length ? [rows[0]] : [];
  });
}
function caseOrder(a, b) { return b.selectionValue - a.selectionValue || b.durationSeconds - a.durationSeconds
  || String(a.seed).localeCompare(String(b.seed)) || String(a.trackId).localeCompare(String(b.trackId)); }

function caseCorrelations(example) {
  const rows = example.jointHistory, pairs = [['feet5', 'deltaC5'], ['feet5', 'deltaD5'], ['deltaD5', 'D'],
    ['travel5', 'deltaB5'], ['deltaB5', 'B'], ['feet5', 'travel5']];
  const associations = [];
  for (const [a, b] of pairs) for (const stride of STRIDES) {
    const x = [], y = [], elapsed = [];
    for (let i = 0; i < rows.length; i++) {
      const j = i + stride;
      if (j < 0 || j >= rows.length || rows[j].anchorIndex - rows[i].anchorIndex !== stride) continue;
      if (!Number.isFinite(rows[i].signals[a]) || !Number.isFinite(rows[j].signals[b])) continue;
      x.push(rows[i].signals[a]); y.push(rows[j].signals[b]); elapsed.push((rows[j].timeMs - rows[i].timeMs) / 1000);
    }
    associations.push({ a, b, stride, elapsedSeconds: distribution(elapsed), ...correlation(x, y) });
  }
  const autocorrelation = [];
  for (const channel of ['feet5', 'travel5', 'deltaD5', 'deltaB5', 'D', 'B']) {
    for (const stride of [1, 5, 10, 20]) {
      const x = rows.slice(0, -stride).map(row => row.signals[channel]);
      const y = rows.slice(stride).map(row => row.signals[channel]);
      autocorrelation.push({ channel, stride, ...correlation(x, y) });
    }
  }
  return { associations, autocorrelation };
}
export function regionSignals(fields, cells) {
  return Object.fromEntries(Object.entries(fields).map(([key, values]) => [key, !values ? null
    : cells.reduce((sum, index) => sum + values[index], 0) / (key.startsWith('feet') || key.startsWith('travel') ? 1 : cells.length)]));
}
async function anchorSubset(path, wanted) {
  const index = await readJson(path), output = new Map();
  const firstBytes = await readFile(resolve(dirname(path), index.anchorsFiles[0]));
  assert.equal(sha256(firstBytes), index.chunkHashes[index.anchorsFiles[0]]);
  const first = JSON.parse(gunzipSync(firstBytes)).anchors, chunkSize = first.length;
  for (const chunkIndex of [...new Set(wanted.map(value => Math.floor(value / chunkSize)))]) {
    const name = index.anchorsFiles[chunkIndex]; assert.equal(name, basename(name));
    const bytes = chunkIndex === 0 ? firstBytes : await readFile(resolve(dirname(path), name));
    assert.equal(sha256(bytes), index.chunkHashes[name]);
    const rows = chunkIndex === 0 ? first : JSON.parse(gunzipSync(bytes)).anchors;
    for (const row of rows) if (wanted.includes(row.index)) output.set(row.index, row);
  }
  assert.equal(output.size, new Set(wanted).size);
  return output;
}
export async function enrichCaseRegions(data = DATA) {
  const packagePath = resolve(data, 'cases.json'), saved = await readJson(packagePath);
  for (const seed of SEEDS) {
    const examples = saved.cases.filter(row => row.seed === seed && !row.none); if (!examples.length) continue;
    const wanted = examples.flatMap(row => row.anchorIndices);
    const signals = await anchorSubset(resolve(data, 'seed-' + seed + '.signals.json.gz'), wanted);
    const opportunities = await anchorSubset(resolve(data, 'seed-' + seed + '.opportunities.json.gz'), wanted);
    for (const example of examples) {
      for (const row of example.jointHistory) {
        const source = signals.get(row.anchorIndex), analysis = opportunities.get(row.anchorIndex);
        const capture = analysis.captures.find(item => item.id === row.captureId); assert.ok(capture);
        row.xNodeCount = capture.nodeCount; row.xCentroid = capture.centroid;
        const maxD = analysis.channels.D.g15[0], maxDCapture = analysis.captures.find(item => item.id === maxD.captureId);
        row.xVsMaxD = { maxDNucleus: maxD.index, maxDNodeCount: maxDCapture.nodeCount, ...overlap(capture, maxDCapture) };
        row.xGeometry = { angularSpanRadians: capture.angularSpan, extent: capture.extent,
          edgeCount: capture.edgeCount, endpoints: capture.endpoints, junctions: capture.junctions, cycleRank: capture.cycleRank };
        row.xRegionSignals = regionSignals(fieldArrays(source, analysis), capture.cells);
        const age = unpack(source.feet[1].ageSeconds), ages = capture.cells.map(i => age[i]).filter(v => v >= 0);
        row.xTimeSinceLatestContactSeconds = ages.length ? Math.min(...ages) : null;
      }
      example.xRegionTemporal = caseCorrelations({ jointHistory: example.jointHistory.map(row => ({ ...row, signals: row.xRegionSignals })) });
    }
  }
  saved.xRegionSignalDefinitions = 'On exact current X F cells: B/C/D and signed changes are spatial means; feet and realized travel are separate spatial totals. No channel fusion. Moving/changing region and shared ancestry remain confounds.';
  await writeJson(packagePath, saved);
}

export async function synthesizeSeed(seed, data = DATA) {
  const signals = await readRun(resolve(data, 'seed-' + seed + '.signals.json.gz'));
  const run = await readRun(resolve(data, 'seed-' + seed + '.opportunities.json.gz'));
  assert.equal(signals.authority, AUTHORITY); assert.equal(run.authority, AUTHORITY);
  assert.equal(signals.anchors.length, run.anchors.length);
  const examples = bestCases(run), caseSamples = new Map(examples.map(example => [example.category, []]));
  const pairReceipts = [], pairRows = new Map(), joint = [], deltaSummary = [], redundancy = [], materialRows = [], gatedDChanges = [];
  const jointByChannel = Object.fromEntries(FAMILIES.map(channel => [channel, []]));
  const birthContexts = signals.births.map(birth => ({ id: birth.id, timeMs: birth.timeMs,
    contexts: [-20, -10, 0, 10, 20].map(offsetSeconds => ({ offsetSeconds,
      targetTimeMs: birth.timeMs + offsetSeconds * 1000, valid: false })) }));
  const signedParts = {};
  for (let k = 0; k < run.anchors.length; k++) {
    const a = run.anchors[k], s = signals.anchors[k]; assert.equal(a.timeMs, s.timeMs);
    const fields = fieldArrays(s, a), captures = new Map(a.captures.map(capture => [capture.id, capture]));
    for (const channel of FAMILIES) {
      const rows = a.channels[channel]?.g15 ?? [];
      for (const row of rows) {
        const capture = captures.get(row.captureId), values = sampleFields(fields, row.index);
        const record = { anchorIndex: k, timeMs: a.timeMs, channel, centerIndex: row.index,
          trackId: row.trackIds['0.025'], rank: row.rank, entryDistance: row.entryDistance,
          signals: values, captureId: row.captureId, material: capture.material };
        joint.push(record); jointByChannel[channel].push(record);
        materialRows.push({ channel, inside: row.entryDistance <= .15, feet5: values.feet5,
          travel5: values.travel5, deltaD5: values.deltaD5, deltaB5: values.deltaB5,
          overlap: capture.material.overlapFraction, layers: capture.material.meanLayers });
      }
    }
    for (const name of Object.keys(a.delta)) {
      const values = fields[name]; if (!values) continue;
      const domain = a.SIndices.map(i => values[i]), pos = domain.map(v => Math.max(v, 0)), neg = domain.map(v => Math.min(v, 0));
      const row = { anchorIndex: k, channel: name, timeMs: a.timeMs, signed: distribution(domain),
        positivePart: distribution(pos), negativePart: distribution(neg),
        positiveCells: domain.filter(v => v > 0).length, negativeCells: domain.filter(v => v < 0).length };
      deltaSummary.push(row);
      signedParts[name] ??= []; signedParts[name].push(row);
    }
    for (const w of [1, 5, 20]) {
      const lag = a.deltaLags[w]; if (!lag) continue;
      const olderB = unpack(signals.anchors[lag.priorIndex].B), deltaD = fields['deltaD' + w];
      gatedDChanges.push({ anchorIndex: k, windowSeconds: w, ...gatedChangeCounts(a.SIndices, deltaD, olderB) });
    }
    for (let i = 0; i < FAMILIES.length; i++) for (let j = i + 1; j < FAMILIES.length; j++) {
      const ca = FAMILIES[i], cb = FAMILIES[j], left = a.channels[ca]?.g15 ?? [], right = a.channels[cb]?.g15 ?? [];
      const indices = [...new Set([...left, ...right].map(row => row.index))];
      const fa = fields[ca], fb = fields[cb];
      const corr = fa && fb ? correlation(indices.map(index => fa[index]), indices.map(index => fb[index]))
        : { n: 0, pearson: null, spearman: null };
      const aa = left[0], bb = right[0], captureOverlap = aa && bb ? overlap(captures.get(aa.captureId), captures.get(bb.captureId)) : null;
      const matches025 = reciprocal(left, right, .025), matches075 = reciprocal(left, right, .075);
      const row = { anchorIndex: k, timeMs: a.timeMs, a: ca, b: cb, centersA: left.length, centersB: right.length,
        winnerDistance: aa && bb ? distance(aa, bb) : null,
        winnerAEntryDistance: aa?.entryDistance ?? null, winnerBEntryDistance: bb?.entryDistance ?? null,
        winnerXJaccard: captureOverlap?.jaccard ?? null, sameWinnerX: captureOverlap?.identical ?? false,
        valueCorrelationOnUnionCenters: corr, rankSpearman: corr.spearman,
        matches025, matches075, match025FractionOfA: left.length ? matches025.length / left.length : null,
        match075FractionOfA: left.length ? matches075.length / left.length : null };
      pairReceipts.push(row); const key = ca + '|' + cb; if (!pairRows.has(key)) pairRows.set(key, []); pairRows.get(key).push(row);
    }
    for (const w of [1, 5, 20]) redundancy.push({ anchorIndex: k, timeMs: a.timeMs, windowSeconds: w,
      ...correlation(a.SIndices.map(i => fields['feet' + w][i]), a.SIndices.map(i => fields['travel' + w][i])) });
    for (const example of examples) {
      const p = example.anchorIndices.indexOf(k); if (p < 0) continue;
      const index = example.centerIndices[p], observation = example.observations[p];
      caseSamples.get(example.category).push({ ...observation, signals: sampleFields(fields, index),
        localMaterial: { layerCount: unpack(s.material.layers)[index],
          timeSinceLatestBirthSeconds: unpack(s.material.lastBirthMs)[index] < 0 ? null : (s.timeMs - unpack(s.material.lastBirthMs)[index]) / 1000 } });
    }
    for (const birth of birthContexts) for (const context of birth.contexts) {
      if (Math.abs(a.timeMs - context.targetTimeMs) > 1e-6) continue;
      context.valid = true; context.anchorIndex = k; context.actualTimeMs = a.timeMs;
      context.channels = Object.fromEntries(FAMILIES.map(channel => [channel, (a.channels[channel]?.g15 ?? []).map(row => ({
        centerIndex: row.index, trackId: row.trackIds['0.025'], value: row.value, rank: row.rank,
        entryDistance: row.entryDistance, signals: sampleFields(fields, row.index), captureId: row.captureId,
        xNodeCount: captures.get(row.captureId).nodeCount, material: captures.get(row.captureId).material }))]));
    }
  }
  for (const example of examples) {
    example.jointHistory = caseSamples.get(example.category);
    example.temporal = caseCorrelations(example);
  }
  const material = {};
  for (const channel of FAMILIES) for (const inside of [true, false]) {
    const rows = materialRows.filter(row => row.channel === channel && row.inside === inside);
    material[channel + (inside ? '|entry' : '|outside')] = { observations: rows.length,
      overlap: distribution(rows.map(row => row.overlap)), meanLayers: distribution(rows.map(row => row.layers)),
      feetVsOverlap: correlation(rows.map(row => row.feet5), rows.map(row => row.overlap)),
      travelVsOverlap: correlation(rows.map(row => row.travel5), rows.map(row => row.overlap)),
      deltaDVsOverlap: correlation(rows.map(row => row.deltaD5), rows.map(row => row.overlap)),
      deltaBVsOverlap: correlation(rows.map(row => row.deltaB5), rows.map(row => row.overlap)) };
  }
  const stateRecent = {};
  for (const channel of FAMILIES) {
    const rows = jointByChannel[channel];
    stateRecent[channel] = Object.fromEntries([['D', 'deltaD5'], ['D', 'feet5'], ['D', 'travel5'],
      ['B', 'deltaB5'], ['B', 'travel5'], ['deltaD5', 'feet5'], ['deltaB5', 'travel5']].map(([a, b]) => [a + '|' + b,
        correlation(rows.map(row => row.signals[a]), rows.map(row => row.signals[b]))]));
  }
  const compactOpportunities = { ...run.summary, series: run.summary.series.map(series => {
    const { winnerTransitions, winnerHistory, ...metrics } = series; return metrics;
  }) };
  const summary = { seed, authority: AUTHORITY, analyses: run.anchors.length, actualBirths: signals.births.length,
    validation: signals.validation, opportunities: compactOpportunities, accumulatedVsRecent: stateRecent,
    rankDynamics: rankDynamics(run.anchors),
    crossChannel: Object.fromEntries([...pairRows].map(([key, rows]) => [key, pairSummary(rows)])), material,
    footTravelRedundancy: Object.fromEntries([1, 5, 20].map(w => [w, { pearson: distribution(redundancy.filter(row => row.windowSeconds === w).map(row => row.pearson)),
      spearman: distribution(redundancy.filter(row => row.windowSeconds === w).map(row => row.spearman)) }])),
    signedChanges: Object.fromEntries(Object.entries(signedParts).map(([key, rows]) => [key, {
      positiveCellFractions: distribution(rows.filter(row => row.signed.n).map(row => row.positiveCells / row.signed.n)),
      negativeCellFractions: distribution(rows.filter(row => row.signed.n).map(row => row.negativeCells / row.signed.n)),
      anchorSignedMeans: distribution(rows.map(row => row.signed.mean)) }])),
    gatedDChanges: Object.fromEntries([1, 5, 20].map(w => {
      const rows = gatedDChanges.filter(row => row.windowSeconds === w);
      const positive = rows.reduce((sum, row) => sum + row.positiveDCells, 0);
      const priorUnqualified = rows.reduce((sum, row) => sum + row.priorChemicalUnqualifiedCells, 0);
      return [w, { positiveDCellObservations: positive, priorChemicalUnqualifiedCellObservations: priorUnqualified,
        fraction: positive ? priorUnqualified / positive : null }];
    })),
    birthContextCoverage: Object.fromEntries([-20, -10, 0, 10, 20].map(offset => [offset,
      { valid: birthContexts.filter(birth => birth.contexts.find(row => row.offsetSeconds === offset).valid).length, total: birthContexts.length }])) };
  await writeJson(resolve(data, 'seed-' + seed + '.joint-histories.json.gz'), { schema: 'ant-local-opportunity-joint-histories-v1', seed,
    representation: 'g15', cutoff: .025, observations: joint, deltaSummary, redundancy, gatedDChanges });
  await writeJson(resolve(data, 'seed-' + seed + '.cross-channel.json.gz'), { seed, representation: 'g15', rows: pairReceipts });
  await writeJson(resolve(data, 'seed-' + seed + '.birth-context.json.gz'), { seed, births: birthContexts });
  await writeJson(resolve(data, 'seed-' + seed + '.synthesis.json'), summary);
  await writeJson(resolve(data, 'seed-' + seed + '.cases.json'), { seed, cases: examples });
  return { summary, cases: examples };
}
export async function finalizeSynthesis(data = DATA) {
  const summaries = [], candidates = [];
  for (const seed of SEEDS) {
    summaries.push(await readJson(resolve(data, 'seed-' + seed + '.synthesis.json')));
    candidates.push(...(await readJson(resolve(data, 'seed-' + seed + '.cases.json'))).cases);
  }
  const cases = CASES.map(category => candidates.filter(row => row.category === category).sort(caseOrder)[0] ?? { category, none: true });
  await writeJson(resolve(data, 'cases.json'), { schema: 'ant-local-opportunity-cases-v1', authority: AUTHORITY, cases });
  await writeJson(resolve(data, 'summary.json'), { schema: 'ant-local-opportunity-synthesis-v1', authority: AUTHORITY,
    quantiles: 'linear interpolation h=(n-1)p; ties use average ranks; correlations require at least 3 nonconstant finite pairs',
    crossChannelDomain: 'g15 center-union values, within current F component for reciprocal spatial correspondence',
    temporal: 'case moving-center series; positive analysis stride means second signal later; actual elapsed times retained; no inferential significance',
    seeds: summaries });
  await enrichCaseRegions(data);
}
async function main() {
  const outArg = process.argv.find(arg => arg.startsWith('--out=')), data = outArg ? resolve(outArg.slice(6)) : DATA;
  for (const seed of SEEDS) {
    const result = await synthesizeSeed(seed, data);
    console.log(JSON.stringify({ synthesized: seed, analyses: result.summary.analyses }));
  }
  await finalizeSynthesis(data);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
