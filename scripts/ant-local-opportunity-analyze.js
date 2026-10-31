import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRun, sha256, writeRun } from './ant-local-opportunity-io.js';
import { CELL_COUNT, OPPORTUNITY_GRID_SIZE, CHANNELS, REPRESENTATIONS, MATCH_CUTOFFS,
  descriptiveSpacing, distanceBetween, edgeBearingIndices, enumeratePlateauMaxima, findLagAnchor,
  componentOverlapRelations, labelComponents, neighbors8, point, reciprocalNearest, xCapture } from './ant-local-opportunity-core.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASE = 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis';
const WINDOWS = [1, 5, 20];
const FIELDS = ['D', 'B', 'C'];
const pack = value => ({ type: value.constructor.name, length: value.length,
  data: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') });

const ARRAY_TYPES = { Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array, Float64Array };
function unpack(packed, expectedLength = CELL_COUNT) {
  assert.ok(packed && typeof packed === 'object', 'packed array required');
  const Type = ARRAY_TYPES[packed.type];
  assert.ok(Type, `unsupported packed type ${packed.type}`);
  assert.equal(packed.length, expectedLength, `${packed.type} length`);
  const bytes = Buffer.from(packed.data, 'base64'), bytesPerElement = Type.BYTES_PER_ELEMENT;
  assert.equal(bytes.byteLength, packed.length * bytesPerElement, `${packed.type} byte length`);
  if (Type === Uint8Array) return Uint8Array.from(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), values = new Type(packed.length);
  const get = Type === Uint16Array ? 'getUint16' : Type === Uint32Array ? 'getUint32'
    : Type === Int32Array ? 'getInt32' : Type === Float32Array ? 'getFloat32' : 'getFloat64';
  for (let i = 0; i < values.length; i += 1) values[i] = view[get](i * bytesPerElement, true);
  return values;
}

function assertFiniteArray(values, name, { nonnegative = false } = {}) {
  for (let i = 0; i < values.length; i += 1) {
    assert.ok(Number.isFinite(values[i]), `${name}[${i}] must be finite`);
    if (nonnegative) assert.ok(values[i] >= 0, `${name}[${i}] must be nonnegative`);
  }
}

function assertRun(run) {
  assert.equal(run.schema, 'ant-local-opportunity-capture-v1');
  assert.ok(/^\d+$/.test(String(run.seed)), 'integer seed required');
  assert.ok(typeof run.authority === 'string' && run.authority.length >= 40, 'authority commit required');
  assert.equal(run.hz, 60);
  assert.ok(Array.isArray(run.anchors) && run.anchors.length > 0, 'anchors required');
  let priorTime = -Infinity;
  for (const [index, anchor] of run.anchors.entries()) {
    assert.equal(anchor.index, index, `anchor index ${index}`);
    assert.ok(Number.isFinite(anchor.timeMs) && anchor.timeMs > priorTime, `anchor ${index} time must increase`);
    priorTime = anchor.timeMs;
  }
}

function materialStats(cells, layers) {
  const histogram = {}, total = cells.length;
  let overlap = 0, sum = 0, max = 0;
  for (const index of cells) {
    const count = layers[index];
    overlap += Number(count > 0); sum += count; max = Math.max(max, count);
    histogram[count] = (histogram[count] ?? 0) + 1;
  }
  return { overlapFraction: total ? overlap / total : null, meanLayers: total ? sum / total : null,
    maxLayers: total ? max : null, layerHistogram: Object.fromEntries(Object.entries(histogram).sort((a, b) => Number(a[0]) - Number(b[0]))) };
}

function angularSpan(centerIndex, cells) {
  const center = point(centerIndex), angles = cells.map(index => {
    const p = point(index); return (Math.atan2(p.y - center.y, p.x - center.x) + 2 * Math.PI) % (2 * Math.PI);
  }).filter((_, i) => cells[i] !== centerIndex).sort((a, b) => a - b);
  if (angles.length < 2) return 0;
  let largestGap = angles[0] + 2 * Math.PI - angles.at(-1);
  for (let i = 1; i < angles.length; i += 1) largestGap = Math.max(largestGap, angles[i] - angles[i - 1]);
  return 2 * Math.PI - largestGap;
}

function geometry(cells) {
  const coords = cells.map(index => point(index));
  const centroid = { x: coords.reduce((sum, p) => sum + p.x, 0) / cells.length,
    y: coords.reduce((sum, p) => sum + p.y, 0) / cells.length };
  const xs = coords.map(p => p.x), ys = coords.map(p => p.y);
  const xx = coords.reduce((sum, p) => sum + (p.x - centroid.x) ** 2, 0) / cells.length;
  const yy = coords.reduce((sum, p) => sum + (p.y - centroid.y) ** 2, 0) / cells.length;
  const xy = coords.reduce((sum, p) => sum + (p.x - centroid.x) * (p.y - centroid.y), 0) / cells.length;
  const angle = .5 * Math.atan2(2 * xy, xx - yy), major = { x: Math.cos(angle), y: Math.sin(angle) };
  const minor = { x: -major.y, y: major.x };
  const projections = axis => coords.map(p => (p.x - centroid.x) * axis.x + (p.y - centroid.y) * axis.y);
  const range = values => Math.max(...values) - Math.min(...values);
  const majorRange = range(projections(major)), minorRange = range(projections(minor));
  const cellSet = new Set(cells), degree = new Map();
  let edgeCount = 0, endpoints = 0, junctions = 0;
  for (const index of cells) {
    const n = neighbors8(index).filter(adjacent => cellSet.has(adjacent)).length;
    degree.set(index, n); edgeCount += n;
    if (n === 1) endpoints += 1;
    if (n >= 3) junctions += 1;
  }
  edgeCount /= 2;
  return { centroid, extent: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), major: majorRange, minor: minorRange },
    edgeCount, endpoints, junctions, cycleRank: edgeCount - cells.length + 1 };
}

function makeCapture(centerIndex, captureId, X, labels, layers) {
  const details = geometry(X.cells), centerPoint = point(centerIndex), material = materialStats(X.cells, layers);
  const entryDistance = Math.hypot(centerPoint.x - .5, centerPoint.y - .72);
  const capture = { id: captureId, centerIndex, centers: [], cells: X.cells, nodeCount: X.cells.length, connected: X.connected,
    radiusValid: X.radiusValid, centroid: details.centroid, entryDistance, angularSpan: angularSpan(centerIndex, X.cells),
    maxRadius: X.maxRadius, extent: details.extent, edgeCount: details.edgeCount, endpoints: details.endpoints,
    junctions: details.junctions, cycleRank: details.cycleRank, material, component: labels[centerIndex] };
  return capture;
}

function quantilesWithZeros(positiveValues, zeroCount, total) {
  if (!total) return null;
  const sorted = positiveValues.slice().sort((a, b) => a - b);
  assert.equal(sorted.length, total - zeroCount, 'zero-filled distribution denominator');
  const valueAt = rank => rank < zeroCount ? 0 : sorted[rank - zeroCount];
  return Object.fromEntries([['min', 0], ['p10', .1], ['p25', .25], ['median', .5], ['p75', .75], ['p90', .9], ['max', 1]]
    .map(([key, p]) => [key, valueAt(Math.round((total - 1) * p))]));
}

function captureRelations(captures) {
  const count = captures.length, pairCount = count * (count - 1) / 2, intersections = new Map(), ownersByCell = new Map();
  for (let i = 0; i < count; i += 1) for (const cell of captures[i].cells) {
    let owners = ownersByCell.get(cell);
    if (!owners) { owners = []; ownersByCell.set(cell, owners); }
    for (const prior of owners) {
      const key = prior * count + i;
      intersections.set(key, (intersections.get(key) ?? 0) + 1);
    }
    owners.push(i);
  }
  const relations = [], jaccards = [], overlapRatios = [];
  let nestedCount = 0, sameComponentPairs = 0;
  const perComponent = new Map();
  for (const capture of captures) perComponent.set(capture.component, (perComponent.get(capture.component) ?? 0) + 1);
  for (const size of perComponent.values()) sameComponentPairs += size * (size - 1) / 2;
  const keys = [...intersections.keys()].sort((a, b) => a - b);
  for (const key of keys) {
    const i = Math.floor(key / count), j = key % count, a = captures[i], b = captures[j], intersection = intersections.get(key);
    const union = a.nodeCount + b.nodeCount - intersection, overlapOfSmaller = intersection / Math.min(a.nodeCount, b.nodeCount);
    const nested = intersection === Math.min(a.nodeCount, b.nodeCount);
    jaccards.push(intersection / union); overlapRatios.push(overlapOfSmaller); nestedCount += Number(nested);
    relations.push({ a: a.id, b: b.id, intersection, jaccard: intersection / union, overlapOfSmaller,
      identical: false, disjoint: false, nested, differentComponents: a.component !== b.component });
  }
  const disjointCount = pairCount - relations.length;
  return { relations, summary: { candidateCaptureCount: count, pairCount, overlapPairCount: relations.length,
    disjointPairCount: disjointCount, nestedPairCount: nestedCount,
    differentComponentsPairCount: pairCount - sameComponentPairs,
    jaccard: quantilesWithZeros(jaccards, disjointCount, pairCount),
    overlapOfSmaller: quantilesWithZeros(overlapRatios, disjointCount, pairCount),
    encoding: 'all unordered candidate pairs; only positive intersections listed; omitted pairs have intersection=0, jaccard=0, overlapOfSmaller=0, identical=false, disjoint=true, nested=false; differentComponents follows capture component labels' } };
}

function centerRow(peak, rank, labels, members = null, memberValues = null) {
  const p = point(peak.index);
  return { index: peak.index, x: p.x, y: p.y, component: labels[peak.index], value: peak.value, rank,
    ...(peak.cells ? { plateauCells: peak.cells } : {}), ...(members ? { members, memberValues } : {}),
    entryDistance: Math.hypot(p.x - .5, p.y - .72), captureId: null, trackIds: {} };
}

function channelRows(name, values, S, labels) {
  const dense = values.length === CELL_COUNT ? values : (() => {
    const result = new Float64Array(CELL_COUNT);
    for (let i = 0; i < S.indices.length; i += 1) result[S.indices[i]] = values[i];
    return result;
  })();
  const { peaks, zeroMaxContextCount } = enumeratePlateauMaxima({ S: S.mask, values: dense });
  const raw = peaks.slice().sort((a, b) => b.value - a.value || a.index - b.index)
    .map((peak, index) => centerRow(peak, index + 1, labels));
  const grouped = Object.fromEntries([[.15, 'g15'], [.30, 'g30']].map(([radius, key]) => {
    const result = descriptiveSpacing(peaks, labels, radius), members = new Map();
    for (const assignment of result.assignments) {
      const list = members.get(assignment.representativeIndex) ?? [];
      list.push(assignment.peak); members.set(assignment.representativeIndex, list);
    }
    const rows = result.representatives.map((peak, index) => {
      const group = members.get(peak.index);
      return centerRow(peak, index + 1, labels, group.map(member => member.index), group.map(member => member.value));
    });
    return [key, rows];
  }));
  return { name, zeroMaxContextCount, raw, ...grouped };
}

function packedSeries(anchor, field, path = []) {
  let value = anchor[field];
  for (const key of path) value = value?.[key];
  return unpack(value);
}

function channelSpecifications(anchor, lagRows, previousFields, S, currentFields) {
  for (const [field, values] of Object.entries(currentFields)) assertFiniteArray(values, field, { nonnegative: true });
  const values = { D: currentFields.D, B: currentFields.B, C: currentFields.C };
  for (const window of WINDOWS) {
    const feet = packedSeries(anchor, 'feet', [String(window), 'count']);
    const travel = packedSeries(anchor, 'traffic', [String(window), 'travel']);
    assertFiniteArray(travel, `travel${window}`, { nonnegative: true });
    values[`feet${window}`] = feet;
    values[`travel${window}`] = travel;
  }
  const delta = {};
  for (const field of FIELDS) for (const window of WINDOWS) {
    const key = `delta${field}${window}`, lag = lagRows[String(window)];
    if (!lag) { delta[key] = null; values[key] = null; continue; }
    const older = previousFields.get(lag.priorIndex);
    assert.ok(older, `lag field cache missing anchor ${lag.priorIndex}`);
    const signed = new Float64Array(CELL_COUNT), positive = new Float64Array(CELL_COUNT), prior = older[field], current = currentFields[field];
    for (let i = 0; i < CELL_COUNT; i += 1) { signed[i] = current[i] - prior[i]; positive[i] = Math.max(0, signed[i]); }
    delta[key] = pack(signed); values[key] = positive;
  }
  return { values, delta, currentFields };
}

function buildAnchor(source, lagRows, previousFields, currentFields) {
  const E = unpack(source.E), F = unpack(source.F), labelsResult = labelComponents(F), labels = labelsResult.labels;
  assert.equal(E.length, CELL_COUNT); assert.equal(F.length, CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i += 1) assert.ok(!F[i] || E[i], `F must be a subset of E at cell ${i}`);
  const SIndices = edgeBearingIndices(F), S = { indices: SIndices, mask: new Uint8Array(CELL_COUNT) };
  for (const index of SIndices) S.mask[index] = 1;
  const layers = packedSeries(source, 'material', ['layers']);
  const specs = channelSpecifications(source, lagRows, previousFields, S, currentFields);
  const channels = {};
  for (const name of CHANNELS) {
    const channelValues = specs.values[name];
    channels[name] = channelValues === null ? null : channelRows(name, channelValues, S, labels);
  }
  const output = { index: source.index, timeMs: source.timeMs,
    components: { labels: pack(labels), sizes: labelsResult.sizes }, SIndices, deltaLags: lagRows, delta: specs.delta,
    channels, captures: [], relations: [] };
  const capturesBySet = new Map(), centerMetricsByIndex = new Map();
  for (const channel of CHANNELS) for (const representation of REPRESENTATIONS) {
    const rows = channels[channel]?.[representation] ?? [];
    for (const row of rows) {
      const ref = { channel, representation, index: row.index };
      let metrics = centerMetricsByIndex.get(row.index);
      if (!metrics) {
        const X = xCapture(F, row.index), key = X.cells.join(','), existing = capturesBySet.get(key);
        let capture = existing;
        if (!capture) {
          const id = `X${String(output.captures.length + 1).padStart(5, '0')}`;
          capture = makeCapture(row.index, id, X, labels, layers);
          capturesBySet.set(key, capture); output.captures.push(capture);
        }
        metrics = { capture, angularSpan: angularSpan(row.index, X.cells), maxRadius: X.maxRadius };
        centerMetricsByIndex.set(row.index, metrics);
      }
      const capture = metrics.capture;
      capture.centers.push({ ...ref, entryDistance: row.entryDistance,
        angularSpan: metrics.angularSpan, maxRadius: metrics.maxRadius });
      row.captureId = capture.id;
    }
  }
  assert.ok(output.captures.every(capture => capture.nodeCount > 0 && capture.cells.includes(capture.centerIndex)
    && capture.connected && capture.radiusValid), 'all locked X captures must be nonempty, connected, centered and radius-valid');
  const centerRows = CHANNELS.flatMap(channel => REPRESENTATIONS.flatMap(representation => channels[channel]?.[representation] ?? []));
  const candidateRows = CHANNELS.flatMap(channel => ['g15', 'g30'].flatMap(representation => channels[channel]?.[representation] ?? []));
  const candidateIndices = new Set(candidateRows.map(row => row.index));
  const candidateCaptureIds = [...new Set(candidateRows.map(row => row.captureId))];
  const captureById = new Map(output.captures.map(capture => [capture.id, capture]));
  const candidateCaptures = candidateCaptureIds.map(id => captureById.get(id));
  const relationReceipt = captureRelations(candidateCaptures);
  output.relations = relationReceipt.relations;
  output.relationSummary = relationReceipt.summary;
  output.relationDomain = { captureIds: candidateCaptureIds, pairCount: relationReceipt.summary.pairCount,
    omittedDisjointPairCount: relationReceipt.summary.disjointPairCount, scope: 'unique X captures referenced by g15 and g30 centers',
    omittedPairDefaults: { intersection: 0, jaccard: 0, overlapOfSmaller: 0, identical: false, disjoint: true,
      nested: false, differentComponents: 'compare capture component labels' } };
  output.captureAccounting = { centerRefs: centerRows.length, groupedCenterRefs: candidateRows.length,
    computedCenters: centerMetricsByIndex.size, uniqueXCaptures: output.captures.length,
    exactSetDeduplications: centerMetricsByIndex.size - output.captures.length,
    reusedSameCenterRefs: centerRows.length - centerMetricsByIndex.size,
    groupedUniqueCenters: candidateIndices.size, groupedUniqueXCaptures: candidateCaptureIds.length,
    groupedExactSetDeduplications: candidateIndices.size - candidateCaptureIds.length };
  const captureSets = new Map(output.captures.map(capture => [capture.id, capture.cells]));
  return { output, labels, captureSets, captureById };
}

function getRows(state, channel, representation) { return state.output.channels[channel]?.[representation] ?? []; }

function captureJaccard(previousCells, currentCells) {
  let i = 0, j = 0, intersection = 0;
  while (i < previousCells.length && j < currentCells.length) {
    if (previousCells[i] === currentCells[j]) { intersection += 1; i += 1; j += 1; }
    else if (previousCells[i] < currentCells[j]) i += 1;
    else j += 1;
  }
  const union = previousCells.length + currentCells.length - intersection;
  return union ? intersection / union : null;
}

function appendObservation(track, state, row, previousRow, xJaccard) {
  const displacement = previousRow ? distanceBetween(previousRow.index, row.index) : null;
  const material = state.captureById.get(row.captureId).material;
  const observation = { anchorIndex: state.output.index, timeMs: state.output.timeMs, centerIndex: row.index,
    value: row.value, rank: row.rank, entryDistance: row.entryDistance, captureId: row.captureId,
    displacementFromPrevious: displacement, xJaccard,
    material: { overlapFraction: material.overlapFraction, meanLayers: material.meanLayers, maxLayers: material.maxLayers } };
  if (displacement !== null) track.pathLength += displacement;
  if (track.observations.length && track.observations.at(-1).rank !== row.rank) track.rankChanges += 1;
  track.observations.push(observation);
}

function createTrack(id, channel, representation, cutoff) {
  return { id, channel, representation, cutoff, observations: [], pathLength: 0, rankChanges: 0 };
}

function quantiles(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return Object.fromEntries([['min', 0], ['p10', .1], ['p25', .25], ['median', .5], ['p75', .75], ['p90', .9], ['max', 1]]
    .map(([key, p]) => [key, sorted[Math.round((sorted.length - 1) * p)]]));
}

function seriesMetadata(states, channel, representation) {
  let coexistenceAnchors = 0, entryAnchors = 0, outsideAnchors = 0;
  const ratios = [];
  for (const state of states) {
    const rows = getRows(state, channel, representation);
    const hasEntry = rows.some(row => row.entryDistance <= .15), hasOutside = rows.some(row => row.entryDistance > .15);
    entryAnchors += Number(hasEntry); outsideAnchors += Number(hasOutside); coexistenceAnchors += Number(hasEntry && hasOutside);
    const allMaximum = Math.max(0, ...rows.map(row => row.value));
    const outsideMaximum = Math.max(0, ...rows.filter(row => row.entryDistance > .15).map(row => row.value));
    ratios.push(allMaximum > 0 && hasOutside ? outsideMaximum / allMaximum : null);
  }
  return { entryAnchors, outsideAnchors, coexistenceAnchors, strongestOutsideToOverallRatio: quantiles(ratios) };
}

function centerCensus(states, channel, representation) {
  const counts = [], entryDistances = [], winnerEntryDistances = [], secondaryRatios = [], values = [], nodeCounts = [], materialOverlap = [];
  let totalCenters = 0, outsideCenters = 0, anchorsWithCenters = 0, anchorsWithTwoCenters = 0;
  for (const state of states) {
    const rows = getRows(state, channel, representation);
    counts.push(rows.length);
    if (rows.length) { anchorsWithCenters += 1; winnerEntryDistances.push(rows[0].entryDistance); }
    if (rows.length >= 2) { anchorsWithTwoCenters += 1; secondaryRatios.push(rows[1].value / rows[0].value); }
    totalCenters += rows.length;
    for (const row of rows) {
      entryDistances.push(row.entryDistance); values.push(row.value);
      outsideCenters += Number(row.entryDistance > .15);
      const capture = state.captureById.get(row.captureId);
      nodeCounts.push(capture.nodeCount); materialOverlap.push(capture.material.overlapFraction);
    }
  }
  return { totalCenters, anchorsWithCenters, anchorsWithTwoCenters,
    centersPerAnchor: quantiles(counts), centersPerAvailableAnchor: quantiles(counts.filter(count => count > 0)),
    outsideCenters, outsideObservationFraction: totalCenters ? outsideCenters / totalCenters : null,
    entryDistance: quantiles(entryDistances), winnerEntryDistance: quantiles(winnerEntryDistances),
    secondaryToFirstStrengthRatio: quantiles(secondaryRatios), value: quantiles(values),
    xNodeCount: quantiles(nodeCounts), xMaterialOverlapFraction: quantiles(materialOverlap) };
}

function trackSeries(states, channel, representation, cutoff, tracks, nextId, xJaccardCache) {
  const localTracks = [], winnerHistory = [], transitions = [];
  const trackById = new Map();
  let previous = [];
  for (let anchorIndex = 0; anchorIndex < states.length; anchorIndex += 1) {
    const state = states[anchorIndex], current = getRows(state, channel, representation);
    const cutoffKey = String(cutoff);
    if (anchorIndex === 0 || !previous.length || !current.length) {
      const currentTracked = [];
      for (const row of current) {
        const track = createTrack(nextId.value++, channel, representation, cutoff);
        tracks.push(track); localTracks.push(track); trackById.set(track.id, track);
        row.trackIds[cutoffKey] = track.id;
        appendObservation(track, state, row, null, null);
        currentTracked.push({ ...row, trackId: track.id });
      }
      if (previous.length || current.length) transitions.push({ fromAnchorIndex: anchorIndex - 1, toAnchorIndex: anchorIndex,
        fromTimeMs: states[anchorIndex - 1]?.output.timeMs ?? null, toTimeMs: state.output.timeMs,
        previousWinnerTrackId: previous.find(row => row.rank === 1)?.trackId ?? null,
        currentWinnerTrackId: currentTracked.find(row => row.rank === 1)?.trackId ?? null,
        transition: anchorIndex === 0 ? 'initial' : 'unmatched-or-absent', rankCrossing: false });
      winnerHistory.push({ anchorIndex, timeMs: state.output.timeMs, centerIndex: current[0]?.index ?? null,
        trackId: currentTracked.find(row => row.rank === 1)?.trackId ?? null, value: current[0]?.value ?? null });
      previous = currentTracked;
      continue;
    }
    const allowedComponents = state.componentPairsFromPrevious;
    const correspondence = reciprocalNearest(previous, current, cutoff,
      (a, b) => allowedComponents.has(`${a.component}:${b.component}`));
    const previousByIndex = new Map(previous.map(row => [row.index, row]));
    const currentByIndex = new Map(current.map(row => [row.index, row]));
    const pairs = correspondence.pairs.map(pair => ({ previous: previousByIndex.get(pair.previousIndex), current: currentByIndex.get(pair.currentIndex) }));
    const pairByCurrent = new Map(pairs.map(pair => [pair.current.index, pair.previous]));
    const currentTracked = [];
    for (const row of current) {
      const prior = pairByCurrent.get(row.index), trackId = prior?.trackId ?? nextId.value++;
      let track = prior ? trackById.get(trackId) : null;
      if (!track) { track = createTrack(trackId, channel, representation, cutoff); tracks.push(track); localTracks.push(track); trackById.set(track.id, track); }
      row.trackIds[cutoffKey] = trackId;
      let xJaccard = null;
      if (prior) {
        const previousAnchor = anchorIndex - 1, key = `${previousAnchor}:${prior.captureId}>${anchorIndex}:${row.captureId}`;
        if (!xJaccardCache.has(key)) xJaccardCache.set(key,
          captureJaccard(states[previousAnchor].captureSets.get(prior.captureId), state.captureSets.get(row.captureId)));
        xJaccard = xJaccardCache.get(key);
      }
      appendObservation(track, state, row, prior ?? null, xJaccard);
      currentTracked.push({ ...row, trackId });
    }
    const previousWinner = previous.find(row => row.rank === 1), currentWinner = current.find(row => row.rank === 1);
    const previousWinnerNow = previousWinner ? currentTracked.find(row => row.trackId === previousWinner.trackId) : null;
    const currentWinnerPrior = currentWinner ? pairByCurrent.get(currentWinner.index) : null;
    const winnerRankCrossing = Boolean(previousWinner && currentWinner && previousWinnerNow && currentWinnerPrior
      && currentWinnerPrior.rank > previousWinner.rank && currentWinner.rank < previousWinnerNow.rank);
    transitions.push({ fromAnchorIndex: anchorIndex - 1, toAnchorIndex: anchorIndex,
      fromTimeMs: states[anchorIndex - 1].output.timeMs, toTimeMs: state.output.timeMs,
      previousWinnerTrackId: previousWinner?.trackId ?? null, currentWinnerTrackId: currentWinner ? currentTracked.find(row => row.index === currentWinner.index)?.trackId ?? null : null,
      transition: !previousWinner || !currentWinner || !previousWinnerNow || !currentWinnerPrior ? 'unmatched-or-absent'
        : previousWinner.trackId === currentWinnerPrior.trackId ? 'same-track' : 'other-matched-change',
      rankCrossing: winnerRankCrossing });
    winnerHistory.push({ anchorIndex, timeMs: state.output.timeMs, centerIndex: currentWinner?.index ?? null,
      trackId: currentWinner ? currentTracked.find(row => row.index === currentWinner.index)?.trackId ?? null : null,
      value: currentWinner?.value ?? null });
    previous = currentTracked;
  }
  const seriesTracks = localTracks.map(track => {
    const first = track.observations[0], last = track.observations.at(-1);
    const dx = last.centerIndex % OPPORTUNITY_GRID_SIZE / (OPPORTUNITY_GRID_SIZE - 1) - first.centerIndex % OPPORTUNITY_GRID_SIZE / (OPPORTUNITY_GRID_SIZE - 1);
    const dy = Math.floor(last.centerIndex / OPPORTUNITY_GRID_SIZE) / (OPPORTUNITY_GRID_SIZE - 1)
      - Math.floor(first.centerIndex / OPPORTUNITY_GRID_SIZE) / (OPPORTUNITY_GRID_SIZE - 1);
    track.startTimeMs = first.timeMs; track.endTimeMs = last.timeMs; track.durationSeconds = (last.timeMs - first.timeMs) / 1000;
    track.leftCensored = first.anchorIndex === 0;
    track.rightCensored = last.anchorIndex === states.length - 1;
    track.startObservation = { anchorIndex: first.anchorIndex, timeMs: first.timeMs,
      previousAnchorIndex: track.leftCensored ? null : first.anchorIndex - 1,
      reason: track.leftCensored ? 'left-censored-at-source-boundary' : 'first-observed-after-no-adjacent-reciprocal-match' };
    track.endObservation = { anchorIndex: last.anchorIndex, timeMs: last.timeMs,
      nextAnchorIndex: track.rightCensored ? null : last.anchorIndex + 1,
      nextTimeMs: track.rightCensored ? null : states[last.anchorIndex + 1].output.timeMs,
      reason: track.rightCensored ? 'right-censored-at-source-boundary' : 'no-adjacent-reciprocal-match-at-next-anchor',
      biologicalTerminationInferred: false };
    track.spatialDrift = { dx, dy, distance: Math.hypot(dx, dy) }; track.pathLength = track.pathLength;
    track.materialTrajectory = track.observations.map(({ anchorIndex, timeMs, material }) => ({ anchorIndex, timeMs, ...material }));
    return track;
  });
  const values = seriesTracks.map(track => track.durationSeconds);
  const entryOutside = seriesMetadata(states, channel, representation);
  const nonEntry = seriesTracks.filter(track => track.observations.every(row => row.entryDistance > .15));
  return { channel, representation, cutoff, trackCount: seriesTracks.length,
    singletonTracks: seriesTracks.filter(track => track.observations.length === 1).length,
    leftCensoredTracks: seriesTracks.filter(track => track.leftCensored).length,
    rightCensoredTracks: seriesTracks.filter(track => track.rightCensored).length,
    observerClosedTracks: seriesTracks.filter(track => !track.rightCensored).length,
    durationSeconds: quantiles(values), nonEntryTrackCount: nonEntry.length,
    nonEntryPersistenceSeconds: quantiles(nonEntry.map(track => track.durationSeconds)),
    rankChangeCount: seriesTracks.reduce((sum, track) => sum + track.rankChanges, 0),
    winnerTransitions: transitions, winnerHistory,
    winnerChanges: transitions.filter(transition => transition.transition === 'other-matched-change').length,
    winnerRankCrossings: transitions.filter(transition => transition.rankCrossing).length, ...entryOutside };
}

function relationCensus(states) {
  const rowValuesJaccard = [], rowValuesOverlap = [];
  let pairCount = 0, disjointPairCount = 0, nestedPairCount = 0, differentComponentsPairCount = 0, overlapPairCount = 0;
  for (const state of states) {
    const receipt = state.output.relationSummary;
    pairCount += receipt.pairCount; disjointPairCount += receipt.disjointPairCount;
    nestedPairCount += receipt.nestedPairCount; differentComponentsPairCount += receipt.differentComponentsPairCount;
    overlapPairCount += receipt.overlapPairCount;
    for (const relation of state.output.relations) {
      rowValuesJaccard.push(relation.jaccard); rowValuesOverlap.push(relation.overlapOfSmaller);
    }
  }
  return { pairCount, overlapPairCount, disjointPairCount, nestedPairCount, differentComponentsPairCount,
    jaccard: quantilesWithZeros(rowValuesJaccard, disjointPairCount, pairCount),
    overlapOfSmaller: quantilesWithZeros(rowValuesOverlap, disjointPairCount, pairCount),
    encoding: 'per-anchor relationDomain defines the denominator; listed rows are positive intersections, omitted pairs are exact disjoint pairs' };
}

function componentTransitionCensus(states) {
  const transitions = states.slice(1).map(state => state.output.componentRelationFromPrevious);
  return { adjacentBoundaries: transitions.length,
    overlapPairs: transitions.reduce((sum, row) => sum + row.relations.length, 0),
    splitEvents: transitions.reduce((sum, row) => sum + row.splitCount, 0),
    mergeEvents: transitions.reduce((sum, row) => sum + row.mergeCount, 0),
    boundariesWithSplits: transitions.filter(row => row.splitCount > 0).length,
    boundariesWithMerges: transitions.filter(row => row.mergeCount > 0).length };
}

function summarize(states, tracks, series) {
  const captureCount = states.reduce((sum, state) => sum + state.output.captures.length, 0);
  const relationCount = states.reduce((sum, state) => sum + state.output.relationSummary.pairCount, 0);
  const centerRefs = states.reduce((sum, state) => sum + state.output.captureAccounting.centerRefs, 0);
  const groupedCenterRefs = states.reduce((sum, state) => sum + state.output.captureAccounting.groupedCenterRefs, 0);
  const computedCenters = states.reduce((sum, state) => sum + state.output.captureAccounting.computedCenters, 0);
  const groupedUniqueCenters = states.reduce((sum, state) => sum + state.output.captureAccounting.groupedUniqueCenters, 0);
  const groupedUniqueXCaptures = states.reduce((sum, state) => sum + state.output.captureAccounting.groupedUniqueXCaptures, 0);
  const centerCounts = Object.fromEntries(CHANNELS.map(channel => [channel,
    Object.fromEntries(REPRESENTATIONS.map(representation => [representation, centerCensus(states, channel, representation)]))]));
  const allTrackJaccards = tracks.flatMap(track => track.observations.map(row => row.xJaccard).filter(Number.isFinite));
  return { anchors: states.length, channelCount: CHANNELS.length, channels: CHANNELS,
    captures: { uniquePerAnchor: quantiles(states.map(state => state.output.captures.length)), total: captureCount,
      allCenterRefs: centerRefs, groupedCenterRefs, computedCenters, uniqueXCaptures: captureCount,
      exactSetDeduplications: computedCenters - captureCount, reusedSameCenterRefs: centerRefs - computedCenters,
      groupedUniqueCenters, groupedUniqueXCaptures, groupedExactSetDeduplications: groupedUniqueCenters - groupedUniqueXCaptures,
      groupedPairCount: relationCount, groupedPairDisjointCount: states.reduce((sum, state) => sum + state.output.relationSummary.disjointPairCount, 0) },
    centerCensus: centerCounts, capturePairRelations: relationCensus(states),
    componentTransitions: componentTransitionCensus(states),
    temporalXJaccard: quantiles(allTrackJaccards),
    trackCount: tracks.length, singletons: tracks.filter(track => track.observations.length === 1).length,
    series };
}

export function analyzeSignals(run, inputSha = null) {
  assertRun(run);
  const times = run.anchors.map(anchor => ({ timeMs: anchor.timeMs }));
  const lastUse = new Int32Array(run.anchors.length); lastUse.fill(-1);
  const lagRowsByAnchor = run.anchors.map((_, index) => Object.fromEntries(WINDOWS.map(window => {
    const lag = findLagAnchor(times, index, window);
    if (lag) lastUse[lag.priorIndex] = Math.max(lastUse[lag.priorIndex], index);
    return [String(window), lag];
  })));
  const previousFields = new Map(), states = [], tracks = [], series = [], xJaccardCache = new Map();
  const nextId = { value: 0 };
  for (const [index, source] of run.anchors.entries()) {
    const fields = Object.fromEntries(FIELDS.map(field => [field, packedSeries(source, field)]));
    for (const [field, values] of Object.entries(fields)) assertFiniteArray(values, `${field} at anchor ${index}`, { nonnegative: true });
    previousFields.set(index, fields);
    const state = buildAnchor(source, lagRowsByAnchor[index], previousFields, fields);
    states.push(state);
    for (const usedIndex of [...previousFields.keys()]) if (lastUse[usedIndex] <= index) previousFields.delete(usedIndex);
    // Keep the current fields while any later anchor selects them as its lag source.
    if (lastUse[index] > index) previousFields.set(index, fields);
  }
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index];
    if (!index) {
      state.componentPairsFromPrevious = new Set();
      state.output.componentRelationFromPrevious = null;
      continue;
    }
    const relation = componentOverlapRelations(states[index - 1].labels, state.labels);
    state.componentPairsFromPrevious = relation.pairs;
    const { pairs, ...receipt } = relation;
    state.output.componentRelationFromPrevious = { fromAnchorIndex: index - 1, ...receipt };
  }
  for (const channel of CHANNELS) for (const representation of REPRESENTATIONS) for (const cutoff of MATCH_CUTOFFS) {
    series.push(trackSeries(states, channel, representation, cutoff, tracks, nextId, xJaccardCache));
  }
  const anchors = states.map(state => state.output);
  return { schema: 'ant-local-opportunity-analysis-v1', seed: run.seed, authority: run.authority,
    channels: CHANNELS, anchors, tracks, summary: summarize(states, tracks, series),
    provenance: { inputSha256: inputSha, inputSchema: run.schema, sourceHashes: run.sourceHashes ?? null,
      protocol: { grid: OPPORTUNITY_GRID_SIZE, S: 'F cells with at least one 8-neighbor in F', maxima: 'positive exact-equal 8-neighbor plateau maxima, no prominence or magnitude threshold',
        grouping: 'strongest-first greedy representative assignment within same current F component; nontransitive',
        matching: 'reciprocal nearest, lower index tie break, adjacent anchors only, and shared-F-cell component overlap required; component continuity is a correspondence guard, not physical identity',
        componentTransitions: 'adjacent-frame label overlap and split/merge degrees are descriptive, not persistent component identities',
        X: '8-connected F component from every center, clipped to Euclidean radius 0.15; exact cell-set deduplication',
        relations: 'candidate domain is unique X sets referenced by g15/g30; only positive intersections listed and omitted pairs are exact disjoint pairs; no overlap threshold',
        delta: 'signed Float64 differences over the full 96x96 grid; positive parts form delta channels; nearest recorded anchor to t-window, strictly earlier, no interpolation; require target at or after first analysis',
        quantiles: 'nearest observed order statistic at round((n-1)*p), with zeros included where pair encoding omits disjoint relations' } } };
}

export function parseArgs(args) {
  const values = new Map(args.map(arg => { const split = arg.indexOf('='); return split < 0 ? [arg, true] : [arg.slice(0, split), arg.slice(split + 1)]; }));
  const seed = String(values.get('--seed') ?? '20261005'), out = resolve(ROOT, String(values.get('--out') ?? BASE));
  assert.ok(/^\d+$/.test(seed), '--seed must be an integer');
  return { seed, out, selfcheck: Boolean(values.get('--selfcheck')) };
}

export async function runSeed(seed, out) {
  const inputPath = resolve(out, `seed-${seed}.signals.json.gz`), outputPath = resolve(out, `seed-${seed}.opportunities.json.gz`);
  const inputSha256 = sha256(await readFile(inputPath)), run = await readRun(inputPath);
  assert.equal(String(run.seed), seed, 'requested seed matches signals receipt');
  const result = analyzeSignals(run, inputSha256);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeRun(outputPath, result, 10);
  const bytes = await readFile(outputPath);
  return { outputPath, inputSha256, outputSha256: sha256(bytes), anchors: result.anchors.length, tracks: result.tracks.length };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfcheck) {
    const { runSelfcheck } = await import('../tests/ant-local-opportunity-core.test.js');
    await runSelfcheck();
    console.log('ANT local opportunity analyzer selfcheck passed');
    return;
  }
  const result = await runSeed(options.seed, options.out);
  console.log(JSON.stringify({ complete: true, seed: options.seed, ...result }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
