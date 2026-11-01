import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CELL_COUNT, componentOverlapRelations,
  descriptiveSpacing, edgeBearingIndices, enumeratePlateauMaxima, labelComponents,
  point, reciprocalNearest, xCapture, captureKey } from './ant-local-opportunity-core.js';

const PERSISTENCE_MS = 20_000;
const X_SIMILARITY = 0.60;
const GROUPING_RADIUS = 0.15;
const TRACK_DISTANCE = 0.025;
const ENTRY = { x: 0.5, y: 0.72 };

export function createSingletonLayerOverlay() {
  return new Uint16Array(CELL_COUNT);
}

function cellSetJaccard(left, right) {
  let i = 0, j = 0, intersection = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { intersection++; i++; j++; }
    else if (left[i] < right[j]) i++;
    else j++;
  }
  const union = left.length + right.length - intersection;
  return union ? intersection / union : 1;
}

function intersectionCount(left, right) {
  let i = 0, j = 0, intersection = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { intersection++; i++; j++; }
    else if (left[i] < right[j]) i++;
    else j++;
  }
  return intersection;
}

function shaCells(cells) {
  return createHash('sha256').update(cells.join(',')).digest('hex');
}

function assertField(values, name) {
  assert.ok(values && values.length === CELL_COUNT, `${name} must be a ${CELL_COUNT}-cell grid`);
  for (let i = 0; i < CELL_COUNT; i++) assert.ok(Number.isFinite(values[i]) && values[i] >= 0, `${name}[${i}] is finite and nonnegative`);
}

function currentRows(channel, values, F, labels, skeleton) {
  const peaks = enumeratePlateauMaxima({ S: skeleton, values }).peaks;
  const representatives = descriptiveSpacing(peaks, labels, GROUPING_RADIUS).representatives;
  return representatives.map((peak, rank) => {
    const center = point(peak.index), X = xCapture(F, peak.index, GROUPING_RADIUS);
    return { channel, index: peak.index, value: peak.value, rank: rank + 1,
      x: center.x, y: center.y, component: labels[peak.index],
      entryDistance: Math.hypot(center.x - ENTRY.x, center.y - ENTRY.y),
      xCells: X.cells, xSha256: shaCells(X.cells) };
  });
}

function makeTrack(seed, channel, id, observation) {
  const track = { seed, id, channel, trackStartTimeMs: observation.timeMs, intervalNumber: 0,
    lastObservation: null, intervalStart: null, intervalChain: [], maturationEvent: null };
  resetInterval(track, observation, 'track-start');
  return track;
}

function resetInterval(track, observation, reason) {
  track.intervalNumber++;
  track.intervalStart = observation;
  track.intervalChain = [observation];
  track.maturationEvent = null;
  track.resetReason = reason;
}

function eventFor(track, observation) {
  const stabilityStart = track.intervalStart;
  const intervalId = `${track.seed}:${track.channel}:${track.id}:I${String(track.intervalNumber).padStart(3, '0')}`;
  return { eventId: intervalId, intervalId, channel: track.channel, trackId: track.id,
    intervalNumber: track.intervalNumber, anchorIndex: observation.anchorIndex, timeMs: observation.timeMs,
    stabilityStartAnchor: stabilityStart.anchorIndex, stabilityStartTimeMs: stabilityStart.timeMs,
    stableElapsedMs: observation.timeMs - stabilityStart.timeMs,
    trackStartTimeMs: track.trackStartTimeMs,
    trackAgeAtMaturationMs: observation.timeMs - track.trackStartTimeMs,
    centerIndex: observation.centerIndex, center: point(observation.centerIndex),
    entryDistance: observation.entryDistance,
    entryClass: observation.entryDistance > GROUPING_RADIUS ? 'non-entry' : 'entry',
    component: observation.component, xSha256: observation.xSha256,
    xNodeCount: observation.xCells.length, xCells: observation.xCells,
    resetReason: track.resetReason,
    stabilityChain: track.intervalChain.map(row => ({ anchorIndex: row.anchorIndex,
      timeMs: row.timeMs, centerIndex: row.centerIndex, component: row.component,
      xSha256: row.xSha256, xNodeCount: row.xCells.length })) };
}

function provenanceName(channels) {
  if (channels.has('B') && channels.has('C')) return '{B,C}';
  return channels.has('B') ? 'B-only' : 'C-only';
}

function buildMatureOptions(currentByChannel) {
  const byKey = new Map();
  for (const channel of ['B', 'C']) for (const row of currentByChannel[channel]) {
    const track = row.track;
    if (!track.maturationEvent) continue;
    const key = captureKey(row.xCells);
    let option = byKey.get(key);
    if (!option) {
      option = { optionId: `X-${shaCells(row.xCells).slice(0, 16)}`, key,
        xSha256: row.xSha256, xCells: row.xCells, candidates: [] };
      byKey.set(key, option);
    }
    option.candidates.push({ channel, trackId: track.id,
      eventId: track.maturationEvent.eventId, maturationTimeMs: track.maturationEvent.timeMs,
      centerIndex: row.index, x: row.x, y: row.y, entryDistance: row.entryDistance,
      entryClass: row.entryDistance > GROUPING_RADIUS ? 'non-entry' : 'entry',
      fComponent: row.component });
  }
  return [...byKey.values()].map(option => {
    const channels = new Set(option.candidates.map(candidate => candidate.channel));
    const entryClasses = new Set(option.candidates.map(candidate => candidate.entryClass));
    return { ...option, provenance: provenanceName(channels),
      entryClass: entryClasses.size === 1 ? [...entryClasses][0] : 'mixed',
      fComponents: [...new Set(option.candidates.map(candidate => candidate.fComponent))].sort((a, b) => a - b) };
  });
}

function overlapGraph(options) {
  const adjacency = options.map(() => new Set()), edges = [];
  for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) {
    const intersection = intersectionCount(options[i].xCells, options[j].xCells);
    if (!intersection) continue;
    adjacency[i].add(j); adjacency[j].add(i);
    edges.push({ a: i, b: j, intersection });
  }
  const seen = new Set(), components = [];
  for (let start = 0; start < options.length; start++) {
    if (seen.has(start)) continue;
    const stack = [start], members = [];
    seen.add(start);
    while (stack.length) {
      const index = stack.pop(); members.push(index);
      for (const adjacent of adjacency[index]) if (!seen.has(adjacent)) { seen.add(adjacent); stack.push(adjacent); }
    }
    components.push(members.sort((a, b) => a - b));
  }
  return { adjacency, edges, components };
}

export function resolveSingletonMaturations({ events, matureOptions, overlay = null, materialize = false }) {
  if (!Array.isArray(events) || !Array.isArray(matureOptions)) throw new TypeError('event and mature-option arrays required');
  if (materialize && (!(overlay instanceof Uint16Array) || overlay.length !== CELL_COUNT)) {
    throw new TypeError('materialization requires a fresh 96x96 Uint16Array overlay');
  }
  const optionsByKey = new Map(matureOptions.map(option => [option.key ?? captureKey(option.xCells), option]));
  const newByKey = new Map();
  for (const event of events) {
    assert.ok(Array.isArray(event.xCells), 'mature event X cells required');
    const key = captureKey(event.xCells), group = newByKey.get(key) ?? [];
    group.push(event); newByKey.set(key, group);
  }
  const decisions = [];
  for (const [key, group] of newByKey) {
    const option = optionsByKey.get(key);
    assert.ok(option, 'new maturation must appear in the current mature unique-X set');
    const competitors = matureOptions.filter(other => (other.key ?? captureKey(other.xCells)) !== key
      && intersectionCount(option.xCells, other.xCells) > 0);
    const provenance = [...new Set(group.map(event => event.channel))].sort();
    let disposition = competitors.length ? 'contested-no-commit'
      : materialize ? 'singleton-overlay-layer' : 'singleton-control-observation';
    if (!competitors.length && materialize) for (const cell of option.xCells) {
      if (overlay[cell] === 0xffff) throw new RangeError(`singleton layer overlay overflow at cell ${cell}`);
      overlay[cell] += 1;
    }
    decisions.push({ timeMs: group[0].timeMs, xSha256: option.xSha256 ?? shaCells(option.xCells),
      xCells: option.xCells, provenance, eventIds: group.map(event => event.eventId).sort(),
      competitorOptionIds: competitors.map(item => item.optionId).sort(), disposition,
      overlayIncrement: disposition === 'singleton-overlay-layer' ? 1 : 0 });
  }
  return decisions;
}

/** Streaming implementation of the registered g15/.025 B/C track and X-maturation semantics. */
export class SingletonFeedbackObserver {
  constructor(seed) {
    this.seed = String(seed);
    this.anchorIndex = -1;
    this.previousLabels = null;
    this.channels = Object.fromEntries(['B', 'C'].map(channel => [channel,
      { previousRows: [], nextTrackId: 1 }]));
  }

  observe({ anchorIndex, timeMs, E, F, B, C, overlay = null, materialize = false }) {
    if (!Number.isInteger(anchorIndex) || anchorIndex !== this.anchorIndex + 1 || !Number.isFinite(timeMs)) {
      throw new TypeError('analysis anchors must be sequential and use actual finite timestamps');
    }
    for (const [name, mask] of [['E', E], ['F', F]]) {
      assert.ok(mask && mask.length === CELL_COUNT, `${name} mask size`);
      for (let i = 0; i < CELL_COUNT; i++) assert.ok(mask[i] === 0 || mask[i] === 1, `${name}[${i}] is binary`);
    }
    for (let i = 0; i < CELL_COUNT; i++) assert.ok(!F[i] || E[i], `F is a subset of E at cell ${i}`);
    assertField(B, 'B'); assertField(C, 'C');
    const { labels } = labelComponents(F), skeleton = new Uint8Array(CELL_COUNT);
    for (const index of edgeBearingIndices(F)) skeleton[index] = 1;
    const componentPairs = this.previousLabels
      ? componentOverlapRelations(this.previousLabels, labels).pairs : new Set();
    const currentByChannel = {
      B: currentRows('B', B, F, labels, skeleton),
      C: currentRows('C', C, F, labels, skeleton)
    };
    const newEvents = [];
    for (const channel of ['B', 'C']) {
      const state = this.channels[channel], current = currentByChannel[channel];
      let pairByCurrent = new Map();
      if (state.previousRows.length && current.length) {
        const matched = reciprocalNearest(state.previousRows, current, TRACK_DISTANCE,
          (prior, now) => componentPairs.has(`${prior.component}:${now.component}`));
        const previousByIndex = new Map(state.previousRows.map(row => [row.index, row]));
        pairByCurrent = new Map(matched.pairs.map(pair => [pair.currentIndex, previousByIndex.get(pair.previousIndex)]));
      }
      const currentTracked = [];
      for (const row of current) {
        const prior = pairByCurrent.get(row.index);
        let track = prior?.track ?? null;
        if (!track) {
          const id = state.nextTrackId++;
          const observation = { anchorIndex, timeMs, centerIndex: row.index, entryDistance: row.entryDistance,
            component: row.component, xCells: row.xCells, xSha256: row.xSha256 };
          track = makeTrack(this.seed, channel, id, observation);
          row.trackId = id;
        } else {
          const similarity = cellSetJaccard(prior.xCells, row.xCells);
          const observation = { anchorIndex, timeMs, centerIndex: row.index, entryDistance: row.entryDistance,
            component: row.component, xCells: row.xCells, xSha256: row.xSha256 };
          if (anchorIndex !== prior.anchorIndex + 1) resetInterval(track, observation, 'anchor-gap');
          else if (similarity < X_SIMILARITY) resetInterval(track, observation, 'x-similarity-below-0.60');
          else if (!track.maturationEvent) track.intervalChain.push(observation);
          row.trackId = track.id;
        }
        const observation = { anchorIndex, timeMs, centerIndex: row.index, entryDistance: row.entryDistance,
          component: row.component, xCells: row.xCells, xSha256: row.xSha256 };
        if (!track.maturationEvent && timeMs - track.intervalStart.timeMs >= PERSISTENCE_MS) {
          track.maturationEvent = eventFor(track, observation);
          newEvents.push(track.maturationEvent);
        }
        track.lastObservation = observation;
        row.track = track; row.anchorIndex = anchorIndex; row.timeMs = timeMs;
        currentTracked.push(row);
      }
      state.previousRows = currentTracked;
    }
    const matureOptions = buildMatureOptions(currentByChannel);
    const graph = overlapGraph(matureOptions);
    const decisions = resolveSingletonMaturations({ events: newEvents, matureOptions, overlay, materialize });
    const provenanceCounts = { 'B-only': 0, 'C-only': 0, '{B,C}': 0 };
    const entryCounts = { entry: 0, nonEntry: 0, mixed: 0 };
    for (const option of matureOptions) {
      provenanceCounts[option.provenance]++;
      entryCounts[option.entryClass === 'entry' ? 'entry' : option.entryClass === 'non-entry' ? 'nonEntry' : 'mixed']++;
    }
    const rowCounts = { B: currentByChannel.B.length, C: currentByChannel.C.length };
    const result = { anchorIndex, timeMs, activeOpportunities: rowCounts,
      newMaturations: { B: newEvents.filter(event => event.channel === 'B').length,
        C: newEvents.filter(event => event.channel === 'C').length },
      uniqueMatureXOptions: matureOptions.length, singletonOptions: graph.adjacency.filter(row => row.size === 0).length,
      contestedOptions: graph.adjacency.filter(row => row.size > 0).length,
      overlapEdges: graph.edges.length, overlapComponents: graph.components.length,
      contestedComponents: graph.components.filter(component => component.length > 1).length,
      componentSizes: graph.components.map(component => component.length), provenanceCounts, entryCounts,
      events: newEvents, decisions,
      opportunities: Object.fromEntries(['B', 'C'].map(channel => [channel, currentByChannel[channel].map(row => ({
        index: row.index, value: row.value, rank: row.rank, trackId: row.trackId,
        x: row.x, y: row.y, entryDistance: row.entryDistance, component: row.component,
        xSha256: row.xSha256, xCells: row.xCells
      }))])),
      matureOptions: matureOptions.map((option, index) => ({ ...option,
        degree: graph.adjacency[index].size,
        overlapOptionIds: [...graph.adjacency[index]].map(adjacent => matureOptions[adjacent].optionId).sort() })) };
    this.anchorIndex = anchorIndex;
    this.previousLabels = labels;
    return result;
  }
}
