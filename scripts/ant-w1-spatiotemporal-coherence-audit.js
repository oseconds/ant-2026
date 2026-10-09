import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createW1Crystallizer } from './ant-w1-crystallization.js';
import { createMaxOverlapCrystallizer } from './ant-w1-max-overlap-crystallization.js';
import { analyzeSeed, W1_PACKAGE } from './ant-w1-analysis.js';
import { loadSeedInputs } from './ant-w1-inputs.js';
import { loadCandidateAnalyzer, replayMatched } from './ant-w1-max-overlap-analysis.js';
import { createW1SupportedSpellObserver } from './ant-w1-supported-spell-shadow.js';
import { csv } from './ant-w1-supported-spell-shadow-analysis.js';

export const PACKAGE = 'docs/ant/evidence/2026-10-09-w1-spatiotemporal-local-coherence-audit';
const STARTING_HEAD = '5a2afd2ae8ea21929fe2b0430b3b0a1462f616da';
const LOCAL = 'docs/ant/evidence/2026-10-09-w1-cell-local-supported-formation-shadow';
const CHARACTER = 'docs/ant/evidence/2026-10-08-w1-causal-character-attribution';
const CONTINUITY = 'docs/ant/evidence/2026-10-09-w1-continuity-diagnostic';
const SPLIT = 'docs/ant/evidence/2026-10-09-w1-max-overlap-split-shadow';
const CELL_HISTORY = 'docs/ant/evidence/2026-10-09-w1-per-cell-formation-history';
const SEEDS = [20261005, 20261006, 20261007], WIDTH = 96, HEIGHT = 96, CELLS = WIDTH * HEIGHT;
const TARGETS = [120, 300, 480, 599.25], sha = value => createHash('sha256').update(value).digest('hex');
const readGzJson = async path => JSON.parse(gunzipSync(await readFile(path)));

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  assert.equal(quoted, false, 'CSV ends outside a quoted field');
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const [header, ...body] = rows;
  assert.ok(header?.length, 'CSV has a header');
  return body.map(values => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

export function neighbors8(cell, width = WIDTH, height = HEIGHT) {
  assert.ok(Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0);
  assert.ok(Number.isSafeInteger(cell) && cell >= 0 && cell < width * height);
  const x = cell % width, y = Math.floor(cell / width), result = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) result.push(ny * width + nx);
  }
  return result.sort((a, b) => a - b);
}

export function closestFrames(frames, targets = TARGETS) {
  return targets.map(target => {
    const frameIndex = frames.map((frame, index) => ({ index, delta: Math.abs(frame.timeSeconds - target) }))
      .sort((a, b) => a.delta - b.delta || a.index - b.index)[0].index;
    return { nominalTargetSeconds: target, frameIndex, actualTimeSeconds: frames[frameIndex].timeSeconds };
  });
}

export function observedConcurrentOverlap(left, right, width = WIDTH, height = HEIGHT) {
  if (left.cellIndex === right.cellIndex || !neighbors8(left.cellIndex, width, height).includes(right.cellIndex)) return null;
  const firstFrameIndex = Math.max(left.startFrameIndex, right.startFrameIndex);
  const lastFrameIndex = Math.min(left.lastSupportedFrameIndex, right.lastSupportedFrameIndex);
  return firstFrameIndex > lastFrameIndex ? null : { firstFrameIndex, lastFrameIndex,
    observationCount: lastFrameIndex - firstFrameIndex + 1 };
}

export function eligibleTerminatedBy(spell, cutoffFrameIndex) {
  return Boolean(spell.eligible) && spell.terminationFrameIndex <= cutoffFrameIndex;
}

export function edgeAvailableBy(edge, cutoffFrameIndex) {
  return edge.availableAtFrameIndex <= cutoffFrameIndex;
}

export function observedSpellDuration(spell, frames) {
  assert.ok(Number.isSafeInteger(spell.startFrameIndex) && spell.startFrameIndex >= 0);
  assert.ok(Number.isSafeInteger(spell.lastSupportedFrameIndex) && spell.lastSupportedFrameIndex >= spell.startFrameIndex);
  assert.ok(Number.isSafeInteger(spell.terminationFrameIndex) && spell.terminationFrameIndex > spell.lastSupportedFrameIndex);
  assert.ok(spell.terminationFrameIndex < frames.length, 'termination lies inside the observed prefix');
  assert.equal(spell.startTimeSeconds, frames[spell.startFrameIndex].timeSeconds);
  assert.equal(spell.lastSupportedTimeSeconds, frames[spell.lastSupportedFrameIndex].timeSeconds);
  assert.equal(spell.terminationTimeSeconds, frames[spell.terminationFrameIndex].timeSeconds);
  const duration = spell.lastSupportedTimeSeconds - spell.startTimeSeconds;
  assert.ok(Math.abs(spell.observedDurationSeconds - duration) <= 1e-9, 'duration uses observed endpoints only');
  return duration;
}

function json(value) { return value === '' ? null : JSON.parse(value); }
function number(value) { return Number(value); }
function bool(value) { return value === 'true'; }
function qAt(flags, offset, cell) { return (flags[offset + cell] & 7) === 7; }
function finite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), 'finite result');
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >>> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function distribution(values) {
  return { count: values.length, minimum: values.length ? Math.min(...values) : null,
    median: median(values), mean: mean(values), maximum: values.length ? Math.max(...values) : null };
}
function histogram(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([a], [b]) => a - b));
}

export function selectRepresentativeGroups(groups) {
  const orderSmall = (a, b) => a.uniqueCellCount - b.uniqueCellCount || a.spellCount - b.spellCount ||
    a.firstTerminationFrameIndex - b.firstTerminationFrameIndex || a.groupId - b.groupId;
  const small = [...groups].filter(group => group.uniqueCellCount > 1).sort(orderSmall)[0] ?? [...groups].sort(orderSmall)[0] ?? null;
  const largest = [...groups].sort((a, b) => b.uniqueCellCount - a.uniqueCellCount || b.spellCount - a.spellCount ||
    a.firstTerminationFrameIndex - b.firstTerminationFrameIndex || a.groupId - b.groupId)[0] ?? null;
  const describe = group => group && Object.fromEntries(['groupId', 'spellCount', 'uniqueCellCount', 'edgeCount',
    'terminationTimeCount', 'startTimeSeconds', 'firstTerminationTimeSeconds', 'lastTerminationTimeSeconds',
    'spatialXMin', 'spatialXMax', 'spatialYMin', 'spatialYMax', 'id0HistoricalOverlapCellCount',
    'id0HistoricalOverlapFraction'].map(key => [key, group[key]]));
  return { selectionRule: { small: 'smallest non-single-cell group; ties by spell count, first termination frame, group ID',
    largest: 'largest unique-cell group; ties by spell count, earliest termination frame, group ID' },
    small: describe(small), largest: describe(largest) };
}

export function normalizeStoredSpells(rows) {
  return rows.map(row => ({ seed: number(row.seed), cellIndex: number(row.cellIndex),
    startFrameIndex: number(row.startFrameIndex), startTimeSeconds: number(row.startTimeSeconds),
    lastSupportedFrameIndex: number(row.lastSupportedFrameIndex), lastSupportedTimeSeconds: number(row.lastSupportedTimeSeconds),
    terminationFrameIndex: number(row.terminationFrameIndex), terminationTimeSeconds: number(row.terminationTimeSeconds),
    observedDurationSeconds: number(row.observedDurationSeconds), eligible: bool(row.eligible),
    terminationReason: row.terminationReason }));
}

export function normalizeStoredEvents(rows) {
  return rows.map(row => ({ seed: number(row.seed), eventId: number(row.eventId), frameIndex: number(row.frameIndex),
    timeSeconds: number(row.timeSeconds), size: number(row.size), cellIndices: json(row.cellIndices) }));
}

export function connectedCellGroupsByFrame(events, width = WIDTH, height = HEIGHT) {
  const byFrame = new Map();
  for (const event of events) {
    if (!byFrame.has(event.frameIndex)) byFrame.set(event.frameIndex, new Set());
    const frameCells = byFrame.get(event.frameIndex);
    for (const cell of event.cellIndices) frameCells.add(cell);
  }
  const output = [];
  for (const [frameIndex, cellSet] of [...byFrame].sort(([a], [b]) => a - b)) {
    const unseen = new Set(cellSet);
    while (unseen.size) {
      const start = Math.min(...unseen), queue = [start], group = [];
      unseen.delete(start);
      for (let head = 0; head < queue.length; head += 1) {
        const cell = queue[head]; group.push(cell);
        for (const next of neighbors8(cell, width, height)) if (unseen.delete(next)) queue.push(next);
      }
      group.sort((a, b) => a - b); output.push({ frameIndex, cellIndices: group });
    }
  }
  return output;
}

function verifyBaselineEvents(oldEvents, rebuiltEvents, seed) {
  const expected = oldEvents.filter(event => event.seed === seed).map(event => ({ frameIndex: event.frameIndex,
    cellIndices: [...event.cellIndices].sort((a, b) => a - b) }));
  const actual = rebuiltEvents.map(event => ({ frameIndex: event.frameIndex, cellIndices: [...event.cellIndices].sort((a, b) => a - b) }));
  assert.deepEqual(actual, expected, `seed ${seed} same-frame event grouping exact reproduction`);
  const groups = connectedCellGroupsByFrame(actual);
  assert.deepEqual(groups, actual, `seed ${seed} same-frame events are deterministic 8-connected groups`);
}

function makeEventCellMap(events) {
  const result = new Map();
  for (const event of events) for (const cell of event.cellIndices) {
    const key = `${event.frameIndex}:${cell}`;
    assert.ok(!result.has(key), `one baseline event owns frame/cell ${key}`);
    result.set(key, event.eventId);
  }
  return result;
}

function verifySpellRows(actual, stored, frames, seed) {
  const normalized = normalizeStoredSpells(stored.filter(row => number(row.seed) === seed));
  assert.equal(actual.length, normalized.length, `seed ${seed} old spell count`);
  const byKey = new Map(normalized.map(row => [`${row.cellIndex}:${row.terminationFrameIndex}`, row]));
  for (const spell of actual) {
    const old = byKey.get(`${spell.cellIndex}:${spell.terminationFrameIndex}`);
    assert.ok(old, `seed ${seed} archived spell exists`);
    for (const key of ['startFrameIndex', 'lastSupportedFrameIndex', 'terminationFrameIndex', 'eligible', 'terminationReason'])
      assert.equal(spell[key], old[key], `seed ${seed} spell ${key}`);
    for (const key of ['startTimeSeconds', 'lastSupportedTimeSeconds', 'terminationTimeSeconds', 'observedDurationSeconds'])
      assert.ok(Math.abs(spell[key] - old[key]) <= 1e-9, `seed ${seed} spell ${key}`);
    assert.equal(spell.observedDurationSeconds, observedSpellDuration(spell, frames));
  }
  assert.equal(new Set(actual.map(spell => `${spell.cellIndex}:${spell.terminationFrameIndex}`)).size, actual.length,
    `seed ${seed} no duplicate cell/termination spells`);
  return normalized;
}

function normalizeEventRows(rows, seed) {
  return rows.filter(row => number(row.seed) === seed).map(row => ({ ...row, seed: number(row.seed), eventId: number(row.eventId),
    frameIndex: number(row.frameIndex), timeSeconds: number(row.timeSeconds), size: number(row.size),
    cellIndices: json(row.cellIndices), newCellIndices: json(row.newCellIndices), overlapCellIndices: json(row.overlapCellIndices),
    terminationReasonCounts: json(row.terminationReasonCounts), relatedEpisodeIds: json(row.relatedEpisodeIds),
    terminationEpisodeIds: json(row.terminationEpisodeIds) }));
}

function loadPriorSummaries(prior) {
  return new Map(prior.seeds.map(seed => [seed.seed, seed]));
}

function verifyFrozen(historyCondition, episodes, label) {
  assert.equal(historyCondition.frozenEpisodes.length, episodes.length, `${label} episode count`);
  const expected = new Map(episodes.map(episode => [episode.id, episode]));
  for (const view of historyCondition.frozenEpisodes) {
    const episode = expected.get(view.episodeMeta.id);
    assert.ok(episode, `${label} stored episode ${view.episodeMeta.id}`);
    assert.deepEqual(view.historicalCellIndices, episode.cellIndices, `${label} frozen geometry ${episode.id}`);
    assert.deepEqual(view.episodeMeta.character, episode.character, `${label} frozen character ${episode.id}`);
    assert.equal(view.episodeMeta.closeTimeSeconds, episode.closeTimeSeconds, `${label} closure time ${episode.id}`);
  }
}

function id0Snapshots(priorSeed, targetFrames) {
  return targetFrames.map(target => {
    const match = priorSeed.milestones.find(item => item.nominalTargetSeconds === target.nominalTargetSeconds);
    assert.ok(match, `prior local audit has ${target.nominalTargetSeconds}s snapshot`);
    assert.equal(match.frameIndex, target.frameIndex, 'causal nearest frame unchanged');
    return new Set(match.id0HistoricalCellIndices);
  });
}

async function processSeed({ seed, input, comparison, splitSeed, historySeed, continuitySeed, priorSeed,
  oldStoredSpells, oldStoredEvents, sourceSupport }) {
  const baseline = analyzeSeed(input, comparison), candidate = sourceSupport.adapter.analyzeSeed(input, comparison);
  assert.deepEqual(baseline, splitSeed.baseline, `seed ${seed} original W1 geometry/character deep-equal`);
  assert.deepEqual(candidate, splitSeed.candidate, `seed ${seed} max-overlap geometry/character deep-equal`);
  verifyFrozen(historySeed.baseline, baseline.episodes, `seed ${seed} original W1`);
  verifyFrozen(historySeed.candidate, candidate.episodes, `seed ${seed} max-overlap`);
  assert.deepEqual(input.metadata.sourceHashes, splitSeed.candidate.inputProvenance.sourceHashes, `seed ${seed} frozen inputs`);
  const matched = replayMatched(input, continuitySeed, candidate);
  const frames = input.fieldMetadata.frames, targets = closestFrames(frames);
  const targetByFrame = new Map(targets.map(target => [target.frameIndex, target]));
  const times = frames.map(frame => frame.timeSeconds), originalModel = createW1Crystallizer({ width: WIDTH, height: HEIGHT });
  const candidateModel = createMaxOverlapCrystallizer({ width: WIDTH, height: HEIGHT });
  const observer = createW1SupportedSpellObserver({ width: WIDTH, height: HEIGHT });
  const flags = input.flags, active = new Uint8Array(frames.length * CELLS);
  const oldTimeline = parseCsv(await readFile(`${LOCAL}/results/timeline.csv`, 'utf8')).filter(row => number(row.seed) === seed);
  assert.equal(oldTimeline.length, frames.length, `seed ${seed} archived per-observation timeline`);
  const allSpells = [], rebuiltEvents = [], supportByFrame = Array.from({ length: frames.length }, () => []);
  const id0AliveByFrame = [];
  const eventRowsByFrame = Array.from({ length: frames.length }, () => []);
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex], offset = frameIndex * CELLS, row = oldTimeline[frameIndex];
    assert.equal(number(row.frameIndex), frameIndex); assert.equal(number(row.timeSeconds), frame.timeSeconds);
    const frameFlags = flags.subarray(offset, offset + CELLS);
    originalModel.advance({ timeSeconds: frame.timeSeconds, flags: frameFlags });
    candidateModel.advance({ timeSeconds: frame.timeSeconds, flags: frameFlags });
    const original = originalModel.getSnapshot(), candidateSnapshot = candidateModel.getSnapshot();
    assert.deepEqual(candidateSnapshot.activeMask, original.activeMask, `seed ${seed} active mask frame ${frameIndex}`);
    assert.deepEqual(candidateSnapshot.stateBounds, original.stateBounds, `seed ${seed} EMA bounds frame ${frameIndex}`);
    const diagnostics = candidateModel.getLastIdentityDiagnostics();
    assert.deepEqual(diagnostics, matched.identityFrames[frameIndex], `seed ${seed} identity frame ${frameIndex}`);
    assert.equal(frameFlags.reduce((sum, value) => sum + Number((value & 7) === 7), 0), number(row.qCells),
      `seed ${seed} q input frame ${frameIndex}`);
    assert.equal(original.activeCellCount, number(row.activeCells), `seed ${seed} active count frame ${frameIndex}`);
    const currentSupport = [];
    for (let cell = 0; cell < CELLS; cell += 1) {
      const supported = qAt(flags, offset, cell) && original.activeMask[cell] === 1;
      if (supported) { active[offset + cell] = 1; currentSupport.push(cell); }
    }
    supportByFrame[frameIndex] = currentSupport;
    const openId0 = candidateModel.getOpenEpisodes().find(episode => episode.id === 0);
    id0AliveByFrame.push(Boolean(openId0));
    assert.equal(Boolean(openId0), bool(row.id0Alive), `seed ${seed} ID 0 alive at prefix ${frameIndex}`);
    if (targetByFrame.has(frameIndex)) {
      const target = targetByFrame.get(frameIndex), stored = priorSeed.milestones.find(item => item.nominalTargetSeconds === target.nominalTargetSeconds);
      assert.ok(stored, `seed ${seed} preserved ID 0 milestone ${target.nominalTargetSeconds}`);
      assert.deepEqual([...openId0.cellIndices].sort((a, b) => a - b),
        [...stored.id0HistoricalCellIndices].sort((a, b) => a - b), `seed ${seed} ID 0 union at ${target.nominalTargetSeconds}s`);
    }
    const observed = observer.advance({ frameIndex, timeSeconds: frame.timeSeconds, flags: frameFlags,
      activeMask: original.activeMask,
      activeOwners: diagnostics.components.map(component => ({ identityId: component.episodeId, cellIndices: component.cellIndices })),
      id0HistoricalCellIndices: openId0?.cellIndices ?? [], id0Alive: Boolean(openId0) });
    allSpells.push(...observed.terminatedSpells);
    const eventRows = observed.events.map(event => ({ ...event, seed }));
    rebuiltEvents.push(...eventRows); eventRowsByFrame[frameIndex] = eventRows;
  }
  const previousEventRows = normalizeEventRows(oldStoredEvents, seed);
  assert.equal(previousEventRows.length, priorSeed.localSummary.eventCount, `seed ${seed} archived local event count`);
  verifySpellRows(allSpells, oldStoredSpells, frames, seed);
  const oldFullSpells = new Map(oldStoredSpells.filter(row => number(row.seed) === seed).map(row =>
    [`${number(row.cellIndex)}:${number(row.terminationFrameIndex)}`, row]));
  const observerEligibleEvents = rebuiltEvents.filter(event => event.size > 0);
  verifyBaselineEvents(previousEventRows, observerEligibleEvents, seed);
  const eventIdByFrameCell = makeEventCellMap(previousEventRows);
  const eligible = allSpells.filter(spell => spell.eligible);
  assert.equal(eligible.length, priorSeed.localSummary.eligibleSpellCount, `seed ${seed} eligible count matches Negative`);
  assert.equal(rebuiltEvents.length, priorSeed.localSummary.eventCount, `seed ${seed} same-frame event count matches Negative`);
  for (const [key, eventId] of eventIdByFrameCell) assert.ok(Number.isSafeInteger(eventId), `event map ${key}`);
  const openStarts = new Int32Array(CELLS).fill(-1), openTimes = new Float64Array(CELLS);
  const eligibleByTermination = Array.from({ length: frames.length }, () => []);
  for (const spell of eligible) eligibleByTermination[spell.terminationFrameIndex].push(spell);
  // Build each exact prefix in observation order. Censored records are taken only from this prefix's open spell state.
  const graphNodes = [], graphEdges = [], timeline = [], snapshots = new Map();
  const targetMap = new Map(targets.map(target => [target.frameIndex, target]));
  const priorId0 = id0Snapshots(priorSeed, targets);
  const parent = [], componentSpellCounts = [], componentCellSets = [], componentTermSets = [], componentEvents = [], componentEdgeCounts = [];
  const find = id => { let root = id; while (parent[root] !== root) root = parent[root];
    while (parent[id] !== id) { const next = parent[id]; parent[id] = root; id = next; } return root; };
  const addNode = node => { const id = parent.length; parent.push(id); componentSpellCounts.push(1);
    componentCellSets.push(new Set([node.cellIndex])); componentTermSets.push(new Set([node.terminationFrameIndex]));
    componentEvents.push(new Set([node.baselineEventId])); componentEdgeCounts.push(0); return id; };
  const connect = (aId, bId) => {
    let a = find(aId), b = find(bId);
    if (a === b) { componentEdgeCounts[a] += 1; return; }
    if (componentSpellCounts[a] < componentSpellCounts[b] ||
      (componentSpellCounts[a] === componentSpellCounts[b] && a > b)) [a, b] = [b, a];
    parent[b] = a; componentSpellCounts[a] += componentSpellCounts[b];
    for (const cell of componentCellSets[b]) componentCellSets[a].add(cell);
    for (const frameIndex of componentTermSets[b]) componentTermSets[a].add(frameIndex);
    for (const eventId of componentEvents[b]) componentEvents[a].add(eventId);
    componentEdgeCounts[a] += componentEdgeCounts[b] + 1;
    componentCellSets[b] = componentTermSets[b] = componentEvents[b] = null; componentEdgeCounts[b] = 0;
  };
  const byCell = Array.from({ length: CELLS }, () => []);
  const snapshotsRows = [];
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const timeSeconds = times[frameIndex];
    for (let cell = 0; cell < CELLS; cell += 1) {
      const supported = active[frameIndex * CELLS + cell] === 1;
      if (supported && openStarts[cell] < 0) { openStarts[cell] = frameIndex; openTimes[cell] = timeSeconds; }
      else if (!supported && openStarts[cell] >= 0) { openStarts[cell] = -1; openTimes[cell] = 0; }
    }
    const frameNodes = eligibleByTermination[frameIndex].map(spell => ({ ...spell, seed, nodeId: -1,
      baselineEventId: eventIdByFrameCell.get(`${frameIndex}:${spell.cellIndex}`) }));
    frameNodes.sort((a, b) => a.cellIndex - b.cellIndex || a.startFrameIndex - b.startFrameIndex);
    for (const node of frameNodes) {
      assert.ok(Number.isSafeInteger(node.baselineEventId), 'eligible node belongs to baseline event');
      node.nodeId = addNode(node); graphNodes.push(node); byCell[node.cellIndex].push(node);
      for (const neighbor of neighbors8(node.cellIndex, WIDTH, HEIGHT)) for (const prior of byCell[neighbor]) {
        if (prior.nodeId >= node.nodeId) continue;
        const overlap = observedConcurrentOverlap(prior, node);
        if (!overlap) continue;
        const { firstFrameIndex, lastFrameIndex, observationCount: concurrentObservationCount } = overlap;
        for (let shared = firstFrameIndex; shared <= lastFrameIndex; shared += 1) {
          const offset = shared * CELLS;
          assert.equal(qAt(flags, offset, prior.cellIndex), true);
          assert.equal(qAt(flags, offset, node.cellIndex), true);
          assert.equal(active[offset + prior.cellIndex], 1); assert.equal(active[offset + node.cellIndex], 1);
        }
        const edge = { seed, edgeId: graphEdges.length, nodeA: prior.nodeId, nodeB: node.nodeId,
          cellA: prior.cellIndex, cellB: node.cellIndex, firstConcurrentFrameIndex: firstFrameIndex,
          lastConcurrentFrameIndex: lastFrameIndex, firstConcurrentTimeSeconds: times[firstFrameIndex],
          lastConcurrentTimeSeconds: times[lastFrameIndex], concurrentObservationCount,
          concurrentObservedSpanSeconds: times[lastFrameIndex] - times[firstFrameIndex],
          availableAtFrameIndex: frameIndex, terminationFrameA: prior.terminationFrameIndex,
          terminationFrameB: node.terminationFrameIndex, baselineEventA: prior.baselineEventId,
          baselineEventB: node.baselineEventId };
        connect(prior.nodeId, node.nodeId); graphEdges.push(edge);
      }
    }
    const pending = [];
    if (targetMap.has(frameIndex)) {
      for (let cell = 0; cell < CELLS; cell += 1) if (openStarts[cell] >= 0) {
        const observedDurationSeconds = timeSeconds - openTimes[cell]; let potentialLinks = 0;
        for (const neighbor of neighbors8(cell, WIDTH, HEIGHT)) for (const node of byCell[neighbor]) {
          if (Math.max(openStarts[cell], node.startFrameIndex) <= Math.min(frameIndex, node.lastSupportedFrameIndex)) potentialLinks += 1;
        }
        pending.push({ cellIndex: cell, startFrameIndex: openStarts[cell], startTimeSeconds: openTimes[cell],
          lastSupportedFrameIndex: frameIndex, lastSupportedTimeSeconds: timeSeconds, observedDurationSeconds,
          eligibleAtCutoff: observedDurationSeconds >= 20, observedConcurrentTerminatedNeighborPairs: potentialLinks,
          currentlySupported: true });
      }
    }
    const roots = [];
    for (let id = 0; id < graphNodes.length; id += 1) if (find(id) === id) roots.push(id);
    const uniqueArea = new Set(graphNodes.map(node => node.cellIndex));
    const rootMetrics = roots.map(root => ({ root, spellCount: componentSpellCounts[root], uniqueCellCount: componentCellSets[root].size,
      termCount: componentTermSets[root].size }));
    const largest = [...rootMetrics].sort((a, b) => b.uniqueCellCount - a.uniqueCellCount || b.spellCount - a.spellCount || a.root - b.root)[0];
    const profile = { seed, frameIndex, timeSeconds, id0Alive: id0AliveByFrame[frameIndex],
      eligibleSpellCount: graphNodes.length, edgeCount: graphEdges.length, componentCount: roots.length,
      uniqueCellCount: uniqueArea.size, largestComponentUniqueCells: largest?.uniqueCellCount ?? 0,
      largestComponentSpells: largest?.spellCount ?? 0,
      largestComponentSpellFraction: graphNodes.length ? largest.spellCount / graphNodes.length : 0,
      largestComponentUniqueCellFraction: uniqueArea.size ? largest.uniqueCellCount / uniqueArea.size : 0,
      multiTerminationTimeGroupCount: rootMetrics.filter(row => row.termCount > 1).length,
      baselineEventCountAtFrame: eventRowsByFrame[frameIndex].length,
      rightCensoredSpellCount: pending.length,
      rightCensoredDurationEligibleCount: pending.filter(spell => spell.eligibleAtCutoff).length,
      rightCensoredSupportedCellCount: new Set(pending.map(spell => spell.cellIndex)).size };
    timeline.push(profile);
    if (targetMap.has(frameIndex)) {
      const target = targetMap.get(frameIndex), id0Cells = priorId0.find((_, i) => targets[i].frameIndex === frameIndex);
      const rootsAtCutoff = roots.map(root => {
        const cells = [...componentCellSets[root]].sort((a, b) => a - b), termFrames = [...componentTermSets[root]].sort((a, b) => a - b);
        const members = [];
        for (let id = 0; id < graphNodes.length; id += 1) if (find(id) === root) members.push(graphNodes[id]);
        const cols = cells.map(cell => cell % WIDTH), rows = cells.map(cell => Math.floor(cell / WIDTH));
        const overlap = cells.filter(cell => id0Cells.has(cell)).length;
        const eventIds = [...componentEvents[root]].sort((a, b) => a - b);
        return { seed, cutoffFrameIndex: frameIndex, cutoffTimeSeconds: target.actualTimeSeconds, groupId: root,
          spellCount: members.length, uniqueCellCount: cells.length, edgeCount: componentEdgeCounts[root],
          firstStartFrameIndex: Math.min(...members.map(row => row.startFrameIndex)),
          lastSupportedFrameIndex: Math.max(...members.map(row => row.lastSupportedFrameIndex)),
          firstTerminationFrameIndex: Math.min(...members.map(row => row.terminationFrameIndex)),
          lastTerminationFrameIndex: Math.max(...members.map(row => row.terminationFrameIndex)),
          terminationTimeCount: termFrames.length,
          startTimeSeconds: Math.min(...members.map(row => row.startTimeSeconds)),
          lastSupportedTimeSeconds: Math.max(...members.map(row => row.lastSupportedTimeSeconds)),
          firstTerminationTimeSeconds: Math.min(...members.map(row => row.terminationTimeSeconds)),
          lastTerminationTimeSeconds: Math.max(...members.map(row => row.terminationTimeSeconds)),
          observedStartToLastTerminationSeconds: Math.max(...members.map(row => row.terminationTimeSeconds)) -
            Math.min(...members.map(row => row.startTimeSeconds)),
          spatialXMin: Math.min(...cols), spatialXMax: Math.max(...cols), spatialYMin: Math.min(...rows), spatialYMax: Math.max(...rows),
          baselineEventCount: eventIds.length, baselineEventIds: eventIds,
          id0HistoricalOverlapCellCount: overlap, id0HistoricalOverlapFraction: overlap / cells.length,
          cellIndices: cells, spellIds: members.map(row => row.nodeId).sort((a, b) => a - b) };
      }).sort((a, b) => a.groupId - b.groupId);
      const largestGroup = [...rootsAtCutoff].sort((a, b) => b.uniqueCellCount - a.uniqueCellCount || b.spellCount - a.spellCount ||
        a.firstTerminationFrameIndex - b.firstTerminationFrameIndex || a.groupId - b.groupId)[0] ?? null;
      assert.ok(graphNodes.every(node => eligibleTerminatedBy(node, frameIndex)), 'prefix contains only terminated eligible spells');
      const edgePrefix = graphEdges.filter(edge => edgeAvailableBy(edge, frameIndex));
      assert.equal(edgePrefix.length, graphEdges.length, 'only edges observed by current causal prefix');
      const completedEvents = new Set(graphNodes.map(node => node.baselineEventId));
      const uniqueCells = new Set(graphNodes.map(node => node.cellIndex));
      const edgeCounts = graphEdges.map(edge => edge.concurrentObservationCount);
      const multiTimes = rootsAtCutoff.filter(group => group.terminationTimeCount > 1);
      const mergedEvents = rootsAtCutoff.filter(group => group.baselineEventCount > 1);
      const eligiblePending = pending.filter(spell => spell.eligibleAtCutoff);
      const localRows = oldStoredEvents.filter(event => number(event.seed) === seed && number(event.frameIndex) <= frameIndex);
      const summary = { nominalTargetSeconds: target.nominalTargetSeconds, cutoffFrameIndex: frameIndex,
        cutoffTimeSeconds: target.actualTimeSeconds, id0Alive: id0AliveByFrame[frameIndex],
        completedEligibleSpellCount: graphNodes.length, completedSameFrameEventCount: completedEvents.size,
        sameFrameEventsAtCutoffObservationCount: eventRowsByFrame[frameIndex].length,
        sameFrameEventCellSamples: graphNodes.length, sameFrameEventCountFromArchive: localRows.length,
        groupCount: rootsAtCutoff.length, uniqueCellCount: uniqueCells.size, worldFraction: uniqueCells.size / CELLS,
        singleCellGroupCount: rootsAtCutoff.filter(group => group.uniqueCellCount === 1).length,
        singleCellGroupFraction: rootsAtCutoff.filter(group => group.uniqueCellCount === 1).length / rootsAtCutoff.length,
        singleSpellGroupCount: rootsAtCutoff.filter(group => group.spellCount === 1).length,
        singleSpellGroupFraction: rootsAtCutoff.filter(group => group.spellCount === 1).length / rootsAtCutoff.length,
        multipleTerminationTimeGroupCount: multiTimes.length,
        multipleTerminationTimeGroupFraction: multiTimes.length / rootsAtCutoff.length,
        spellsInMultipleTerminationTimeGroups: multiTimes.reduce((sum, group) => sum + group.spellCount, 0),
        mergedSameFrameEventGroupCount: mergedEvents.length,
        baselineEventsInMergedGroups: mergedEvents.reduce((sum, group) => sum + group.baselineEventCount, 0),
        largestComponent: largestGroup ? { groupId: largestGroup.groupId, spellCount: largestGroup.spellCount,
          uniqueCellCount: largestGroup.uniqueCellCount, edgeCount: largestGroup.edgeCount,
          spellFraction: largestGroup.spellCount / graphNodes.length,
          uniqueCellFraction: largestGroup.uniqueCellCount / uniqueCells.size,
          baselineEventCount: largestGroup.baselineEventCount,
          terminationTimeCount: largestGroup.terminationTimeCount,
          startTimeSeconds: largestGroup.startTimeSeconds, firstTerminationTimeSeconds: largestGroup.firstTerminationTimeSeconds,
          lastTerminationTimeSeconds: largestGroup.lastTerminationTimeSeconds,
          observedStartToLastTerminationSeconds: largestGroup.observedStartToLastTerminationSeconds,
          spatialBounds: { xMin: largestGroup.spatialXMin, xMax: largestGroup.spatialXMax,
            yMin: largestGroup.spatialYMin, yMax: largestGroup.spatialYMax },
          id0HistoricalOverlapCellCount: largestGroup.id0HistoricalOverlapCellCount,
          id0HistoricalOverlapFraction: largestGroup.id0HistoricalOverlapFraction } : null,
        uniqueCellUnionEqualsSameFrameBaseline: uniqueCells.size === new Set(localRows.flatMap(row => json(row.cellIndices))).size,
        uniqueCellUnionEqualsSameFrameRebuild: uniqueCells.size === new Set(graphNodes.map(node => node.cellIndex)).size,
        id0HistoricalUnionCellCount: id0Cells.size,
        id0HistoricalOverlapCellCount: [...uniqueCells].filter(cell => id0Cells.has(cell)).length,
        id0HistoricalOverlapFractionOfGraphUnion: [...uniqueCells].filter(cell => id0Cells.has(cell)).length / uniqueCells.size,
        graphUnionAsFractionOfId0History: [...uniqueCells].filter(cell => id0Cells.has(cell)).length / id0Cells.size,
        newUniqueCellArea: uniqueCells.size,
        reInscribedEventCellSamples: graphNodes.length - uniqueCells.size,
        reInscriptionFraction: (graphNodes.length - uniqueCells.size) / graphNodes.length,
        edgeCount: graphEdges.length, singleObservationEdgeCount: edgeCounts.filter(count => count === 1).length,
        singleObservationEdgeFraction: graphEdges.length ? edgeCounts.filter(count => count === 1).length / graphEdges.length : null,
        edgeConcurrentObservationCount: distribution(edgeCounts), meanConcurrentObservationsPerEdge: mean(edgeCounts),
        rightCensoredSpellCount: pending.length, rightCensoredUniqueCellCount: new Set(pending.map(spell => spell.cellIndex)).size,
        rightCensoredDurationEligibleCount: eligiblePending.length,
        rightCensoredObservedDurationSeconds: distribution(pending.map(spell => spell.observedDurationSeconds)),
        rightCensoredPotentialEligibleNeighborPairCount: eligiblePending.reduce((sum, spell) =>
          sum + spell.observedConcurrentTerminatedNeighborPairs, 0),
        componentUniqueCellSizeCounts: histogram(rootsAtCutoff.map(group => group.uniqueCellCount)),
        componentSpellSizeCounts: histogram(rootsAtCutoff.map(group => group.spellCount)),
        componentTerminationTimeCounts: histogram(rootsAtCutoff.map(group => group.terminationTimeCount)),
        activeSupportedCellCount: supportByFrame[frameIndex].length,
        cumulativeSameFrameEventUniqueCellCount: new Set(localRows.flatMap(row => json(row.cellIndices))).size,
        cumulativeSameFrameEventCellSamples: localRows.reduce((sum, row) => sum + number(row.size), 0) };
      assert.equal(summary.uniqueCellUnionEqualsSameFrameBaseline, true, 'graph nodes preserve same-frame materialized union');
      assert.equal(summary.uniqueCellCount, summary.cumulativeSameFrameEventUniqueCellCount, 'graph does not change union area');
      assert.equal(summary.cumulativeSameFrameEventCellSamples, graphNodes.length, 'one event cell per eligible spell');
      assert.equal(summary.reInscribedEventCellSamples,
        summary.cumulativeSameFrameEventCellSamples - summary.cumulativeSameFrameEventUniqueCellCount,
        'event-cell sample overlap accounting');
      snapshots.set(target.nominalTargetSeconds, { target, summary, groups: rootsAtCutoff, id0Cells,
        currentSupportedCellIndices: supportByFrame[frameIndex], currentEventGeometry: eventRowsByFrame[frameIndex],
        cumulativeLocalCells: [...uniqueCells].sort((a, b) => a - b), rightCensored: pending });
      snapshotsRows.push(...rootsAtCutoff);
    }
  }
  assert.equal(graphNodes.length, eligible.length);
  assert.equal(graphEdges.length, graphEdges.filter(edge => edge.cellA !== edge.cellB).length, 'same-cell spells never have direct edges');
  assert.equal(new Set(graphEdges.map(edge => `${edge.nodeA}:${edge.nodeB}`)).size, graphEdges.length, 'no duplicate spell-pair edges');
  for (const edge of graphEdges) assert.ok(neighbors8(edge.cellA).includes(edge.cellB), 'every edge is between grid neighbors');
  const terminationReasons = { 'q-off': 0, 'active-off': 0, both: 0 };
  const eligibleContactAges = [];
  for (const spell of eligible) {
    terminationReasons[spell.terminationReason] += 1;
    const oldFull = oldFullSpells.get(`${spell.cellIndex}:${spell.terminationFrameIndex}`);
    assert.ok(oldFull, 'eligible spell has archived full record');
    assert.equal(json(oldFull.missingQualificationBits).includes(4), false, 'cumulative contact bit remains qualified');
    if (oldFull.lastActualFootContactAgeAtLastSupportSeconds !== '')
      eligibleContactAges.push(number(oldFull.lastActualFootContactAgeAtLastSupportSeconds));
  }
  const risk = { eligibleTerminationReasonCounts: terminationReasons,
    eligibleTerminationReasonFractions: Object.fromEntries(Object.entries(terminationReasons).map(([key, value]) => [key, value / eligible.length])),
    eligibleSpellsWithCumulativeContactQualified: eligible.length,
    activeCarryoverAtTerminationCount: eligible.filter(spell => spell.activeCarryoverAtTermination).length,
    startedWithActiveCarryoverCount: eligible.filter(spell => spell.startedWithActiveCarryover).length,
    contactAgeAtLastSupportedFrameSeconds: distribution(eligibleContactAges),
    contactAgeBeyond20SecondsCount: eligibleContactAges.filter(age => age > 20 + 1e-9).length,
    contactAgeBeyond90SecondsCount: eligibleContactAges.filter(age => age > 90 + 1e-9).length,
    eligibleSpellCount: eligible.length };
  const finalSnapshot = snapshots.get(TARGETS.at(-1));
  const representatives = selectRepresentativeGroups(finalSnapshot.groups);
  return { seed, inputSourceHashes: input.metadata.sourceHashes, inputPacketFileHashes: input.metadata.packetFileHashes,
    targets, summaryByTarget: targets.map(target => snapshots.get(target.nominalTargetSeconds).summary),
    snapshots: [...snapshots.values()], groups: snapshotsRows, edges: graphEdges, timeline, eventRows: previousEventRows,
    representatives,
    spells: allSpells, eligibleSpells: eligible, risk, finalId0Cells: priorId0.at(-1), parity: {
      observations: frames.length, qInput: true, emaBounds: true, activeMask: true,
      originalW1DeepEqual: true, maxOverlapDeepEqual: true, existingSpellRecordsDeepEqual: true,
      sameFrameEventGroupingDeepEqual: true, edgeSharedFramesVerified: true, noRandomness: true } };
}

async function run() {
  const output = resolve(process.argv[2] ?? `${PACKAGE}/results`);
  for (const protectedRoot of [LOCAL, CHARACTER, CONTINUITY, SPLIT, CELL_HISTORY, W1_PACKAGE]) {
    const rel = relative(resolve(protectedRoot), output);
    assert.ok(rel.startsWith('..') && rel !== '.', `write output outside preserved ${protectedRoot}`);
  }
  const [originalPackage, splitAnalysis, cellHistory, continuity, priorAnalysis, priorSummary,
    priorEventsBytes, priorSpellsBytes, priorPreservation] = await Promise.all([
    readGzJson(`${W1_PACKAGE}/inputs/baselines/local-accretion-analysis.json.gz`),
    readGzJson(`${SPLIT}/results/analysis.json.gz`), readGzJson(`${CELL_HISTORY}/results/analysis.json.gz`),
    readGzJson(`${CONTINUITY}/results/analysis.json.gz`), readGzJson(`${LOCAL}/results/analysis.json.gz`),
    readFile(`${LOCAL}/results/summary.json`, 'utf8').then(JSON.parse),
    readFile(`${LOCAL}/results/events.csv`), readFile(`${LOCAL}/results/spells.csv.gz`),
    readFile(`${LOCAL}/validation/preservation.json`, 'utf8').then(JSON.parse)
  ]);
  assert.equal(priorSummary.startingHead, '9c838039b614685a8f639958188486a447a04724');
  assert.equal(priorSummary.pooled.eventCount, 30828); assert.equal(priorSummary.pooled.eligibleSpellCount, 32252);
  assert.equal(priorAnalysis.startingHead, priorSummary.startingHead);
  const oldStoredEvents = parseCsv(priorEventsBytes.toString('utf8'));
  const oldStoredSpells = parseCsv(gunzipSync(priorSpellsBytes).toString('utf8'));
  const adapter = await loadCandidateAnalyzer(), priorSeeds = loadPriorSummaries(priorAnalysis), seeds = [];
  const priorRandom = Math.random; Math.random = () => { throw new Error('read-only W1 audit must not consume RNG'); };
  try {
    for (const seed of SEEDS) {
      const input = await loadSeedInputs(seed, W1_PACKAGE), splitSeed = splitAnalysis.seeds.find(row => row.seed === seed),
        historySeed = cellHistory.seeds.find(row => row.seed === seed), continuitySeed = continuity.seeds.find(row => row.seed === seed),
        comparison = originalPackage.seeds.find(row => row.seed === seed), priorSeed = priorSeeds.get(seed);
      assert.ok(splitSeed && historySeed && continuitySeed && comparison && priorSeed, `seed ${seed} references`);
      const result = await processSeed({ seed, input, comparison, splitSeed, historySeed, continuitySeed, priorSeed,
        oldStoredSpells, oldStoredEvents, sourceSupport: { adapter } });
      seeds.push(result);
      process.stdout.write(JSON.stringify({ seed, cutoffs: result.summaryByTarget.map(row => ({
        timeSeconds: row.cutoffTimeSeconds, spells: row.completedEligibleSpellCount, groups: row.groupCount,
        uniqueCells: row.uniqueCellCount, largestSpellShare: row.largestComponent.spellFraction,
        multiTimeGroups: row.multipleTerminationTimeGroupCount, edges: row.edgeCount,
        oneObservationEdgeFraction: row.singleObservationEdgeFraction,
        rightCensored: row.rightCensoredSpellCount, rightCensoredEligible: row.rightCensoredDurationEligibleCount })) }) + '\n');
    }
  } finally { Math.random = priorRandom; }

  const sourcePaths = ['scripts/ant-w1-spatiotemporal-coherence-audit.js', 'scripts/ant-w1-supported-spell-shadow.js',
    'scripts/ant-w1-spatiotemporal-coherence-plots.js',
    'scripts/ant-w1-supported-spell-shadow-analysis.js', 'scripts/ant-w1-max-overlap-analysis.js',
    'scripts/ant-w1-max-overlap-crystallization.js', 'scripts/ant-w1-crystallization.js',
    'scripts/ant-w1-analysis.js', 'scripts/ant-w1-inputs.js'];
  const evidencePaths = [`${LOCAL}/results/analysis.json.gz`, `${LOCAL}/results/summary.json`, `${LOCAL}/results/events.csv`,
    `${LOCAL}/results/spells.csv.gz`, `${LOCAL}/results/event-cells.csv.gz`, `${SPLIT}/results/analysis.json.gz`,
    `${CELL_HISTORY}/results/analysis.json.gz`, `${CONTINUITY}/results/analysis.json.gz`,
    `${W1_PACKAGE}/inputs/baselines/local-accretion-analysis.json.gz`];
  const sourceSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, sha(await readFile(path))])));
  const sourceEvidenceSha256 = Object.fromEntries(await Promise.all(evidencePaths.map(async path => [path, sha(await readFile(path))])));
  assert.equal(priorPreservation.checks.originalW1AndMaxOverlapDeepEqual, true);
  assert.equal(priorPreservation.checks.perCellGeometryAndCharacterDeepEqual, true);
  for (const [path, expected] of Object.entries(priorAnalysis.sourceSha256))
    assert.equal(sha(await readFile(path)), expected, `preserved prior analysis source ${path}`);
  for (const [path, expected] of Object.entries(priorAnalysis.sourceEvidenceSha256))
    assert.equal(sha(await readFile(path)), expected, `preserved prior analysis evidence ${path}`);
  for (const [name, path] of Object.entries({ 'analysis.json.gz': `${LOCAL}/results/analysis.json.gz`,
    'events.csv': `${LOCAL}/results/events.csv`, 'spells.csv.gz': `${LOCAL}/results/spells.csv.gz`,
    'event-cells.csv.gz': `${LOCAL}/results/event-cells.csv.gz` }))
    assert.equal(sourceEvidenceSha256[path], priorSummary.outputSha256[name], `preserved previous output ${name}`);
  const summary = { status: 'complete', startingHead: STARTING_HEAD, branch: 'ant-w1-episodic-material-shadow',
    seedOrder: SEEDS, observationsPerSeed: 599, finalObservedTimeSeconds: 599.25,
    method: { node: 'existing eligible terminated q===1 && active===1 spells', edge:
      'different 8-neighbor cells with at least one identical archived supported observation',
      concurrentObservationCount: 'exact shared frame-index count; no gap tolerance or interpolation',
      sameCellSpellConnections: false, graphMeaning: 'retrospective activity-history group only; not material or a birth event',
      persistenceSeconds: 20, cutoffGraphConstruction: 'causal frame-by-frame prefix; future terminations are not added backward' },
    preservation: { previousCellLocalEvents: 30828, previousEligibleSpellRecords: 32252,
      originalW1AndMaxOverlapDeepEqual: true, cellHistoryGeometryAndCharacterDeepEqual: true,
      sourceAndInputHashesRecorded: true, newGraphChangesNoExistingUnion: true },
    seedResults: seeds.map(seed => ({ seed: seed.seed, inputSourceHashes: seed.inputSourceHashes,
      inputPacketFileHashes: seed.inputPacketFileHashes, parity: seed.parity, risk: seed.risk,
      cutoffs: seed.summaryByTarget, eligibleTerminatedSpells: seed.eligibleSpells.length,
      edgeCount: seed.edges.length, sameFrameEvents: seed.eventRows.length, representatives: seed.representatives,
      existingFrozenReference: priorSeeds.get(seed.seed).existingFrozenDistributions })),
    sourceSha256, sourceEvidenceSha256 };
  const pooled = TARGETS.map(target => {
    const rows = seeds.map(seed => seed.summaryByTarget.find(row => row.nominalTargetSeconds === target));
    const sum = key => rows.reduce((total, row) => total + row[key], 0);
    const edgeSamples = seeds.flatMap(seed => seed.edges.filter(edge => edgeAvailableBy(edge,
      seed.targets.find(row => row.nominalTargetSeconds === target).frameIndex)).map(edge => edge.concurrentObservationCount));
    return { nominalTargetSeconds: target, completedEligibleSpellCount: sum('completedEligibleSpellCount'),
      groupCount: sum('groupCount'), uniqueCellCount: sum('uniqueCellCount'),
      singleCellGroupCount: sum('singleCellGroupCount'), multipleTerminationTimeGroupCount: sum('multipleTerminationTimeGroupCount'),
      edgeCount: sum('edgeCount'), singleObservationEdgeCount: edgeSamples.filter(count => count === 1).length,
      singleObservationEdgeFraction: edgeSamples.length ? edgeSamples.filter(count => count === 1).length / edgeSamples.length : null,
      largestComponentSpellFractionBySeed: rows.map(row => row.largestComponent.spellFraction),
      largestComponentUniqueCellFractionBySeed: rows.map(row => row.largestComponent.uniqueCellFraction),
      rightCensoredSpellCount: sum('rightCensoredSpellCount'),
      rightCensoredDurationEligibleCount: sum('rightCensoredDurationEligibleCount') };
  });
  const totalEligible = seeds.reduce((sum, row) => sum + row.eligibleSpells.length, 0);
  const eligibleArchiveRows = oldStoredSpells.filter(row => bool(row.eligible));
  const pooledTerminationReasons = { 'q-off': 0, 'active-off': 0, both: 0 };
  for (const row of eligibleArchiveRows) pooledTerminationReasons[row.terminationReason] += 1;
  const pooledContactAges = eligibleArchiveRows.map(row => number(row.lastActualFootContactAgeAtLastSupportSeconds));
  const finalFrameBySeed = new Map(seeds.map(seed => [seed.seed, seed.targets.at(-1).frameIndex]));
  const finalGroups = seeds.flatMap(seed => seed.groups.filter(group => group.cutoffFrameIndex === finalFrameBySeed.get(seed.seed)));
  const finalUniqueSizes = finalGroups.map(group => group.uniqueCellCount);
  const finalLargestFractions = seeds.map(seed => seed.summaryByTarget.at(-1).largestComponent.spellFraction);
  const joinedEventFractions = seeds.map(seed => {
    const final = seed.summaryByTarget.at(-1);
    return final.baselineEventsInMergedGroups / final.completedSameFrameEventCount;
  });
  const classification = finalLargestFractions.every(value => value > .5) && joinedEventFractions.every(value => value > .5)
    ? 'Mixed — A fragmentation and B giant chaining both present'
    : finalLargestFractions.every(value => value > .5) ? 'B — Giant chaining'
      : seeds.every(seed => seed.summaryByTarget.at(-1).edgeCount === 0) ? 'C — Limited coherence'
        : 'A — Fragmentation supported';
  summary.pooled = { eligibleTerminatedSpellCount: totalEligible, existingSameFrameEventCount: seeds.reduce((sum, row) => sum + row.eventRows.length, 0),
    cutoffs: pooled, finalUniqueCellGroupSizeDistribution: distribution(finalUniqueSizes),
    finalUniqueCellGroupSizeCounts: histogram(finalUniqueSizes), finalLargestComponentSpellFractionBySeed: finalLargestFractions,
    baselineEventsInMultiEventGroupsFractionBySeed: joinedEventFractions, classification,
    supportInterpretationRisk: { eligibleTerminationReasonCounts: pooledTerminationReasons,
      eligibleQOffFraction: pooledTerminationReasons['q-off'] / totalEligible,
      activeCarryoverAtTerminationCount: eligibleArchiveRows.filter(row => bool(row.activeCarryoverAtTermination)).length,
      startedWithActiveCarryoverCount: eligibleArchiveRows.filter(row => bool(row.startedWithActiveCarryover)).length,
      cumulativeContactQualificationMissingCount: eligibleArchiveRows.filter(row =>
        json(row.missingQualificationBits).includes(4)).length,
      actualFootContactAgeAtLastSupportedFrameSeconds: distribution(pooledContactAges),
      contactAgeBeyond20SecondsCount: pooledContactAges.filter(age => age > 20 + 1e-9).length,
      contactAgeBeyond90SecondsCount: pooledContactAges.filter(age => age > 90 + 1e-9).length },
    classificationBasis: 'Across all three seeds, each largest component contains a majority of eligible spells and more than half of same-frame events belong to groups containing multiple baseline events.' };
  const edgeRows = seeds.flatMap(seed => seed.edges);
  const groupRows = seeds.flatMap(seed => seed.groups);
  const censorRows = seeds.flatMap(seed => seed.snapshots.flatMap(snapshot => snapshot.rightCensored.map(row => ({
    seed: seed.seed, nominalTargetSeconds: snapshot.target.nominalTargetSeconds, cutoffFrameIndex: snapshot.target.frameIndex,
    cutoffTimeSeconds: snapshot.target.actualTimeSeconds, ...row }))));
  const timelineRows = seeds.flatMap(seed => seed.timeline);
  const edgeColumns = ['seed', 'edgeId', 'nodeA', 'nodeB', 'cellA', 'cellB', 'firstConcurrentFrameIndex',
    'lastConcurrentFrameIndex', 'firstConcurrentTimeSeconds', 'lastConcurrentTimeSeconds', 'concurrentObservationCount',
    'concurrentObservedSpanSeconds', 'availableAtFrameIndex', 'terminationFrameA', 'terminationFrameB', 'baselineEventA', 'baselineEventB'];
  const groupColumns = ['seed', 'cutoffFrameIndex', 'cutoffTimeSeconds', 'groupId', 'spellCount', 'uniqueCellCount', 'edgeCount',
    'firstStartFrameIndex', 'lastSupportedFrameIndex', 'firstTerminationFrameIndex', 'lastTerminationFrameIndex',
    'terminationTimeCount', 'startTimeSeconds', 'lastSupportedTimeSeconds', 'firstTerminationTimeSeconds', 'lastTerminationTimeSeconds',
    'observedStartToLastTerminationSeconds', 'spatialXMin', 'spatialXMax', 'spatialYMin', 'spatialYMax',
    'baselineEventCount', 'baselineEventIds', 'id0HistoricalOverlapCellCount', 'id0HistoricalOverlapFraction', 'cellIndices', 'spellIds'];
  const censorColumns = ['seed', 'nominalTargetSeconds', 'cutoffFrameIndex', 'cutoffTimeSeconds', 'cellIndex', 'startFrameIndex',
    'startTimeSeconds', 'lastSupportedFrameIndex', 'lastSupportedTimeSeconds', 'observedDurationSeconds', 'eligibleAtCutoff',
    'observedConcurrentTerminatedNeighborPairs', 'currentlySupported'];
  const outputs = {
    'concurrent-edges.csv.gz': gzipSync(Buffer.from(csv(edgeRows, edgeColumns)), { level: 9, mtime: 0 }),
    'groups.csv.gz': gzipSync(Buffer.from(csv(groupRows, groupColumns)), { level: 9, mtime: 0 }),
    'right-censored.csv.gz': gzipSync(Buffer.from(csv(censorRows, censorColumns)), { level: 9, mtime: 0 }),
    'timeline.csv': Buffer.from(csv(timelineRows, ['seed', 'frameIndex', 'timeSeconds', 'id0Alive', 'eligibleSpellCount',
      'edgeCount', 'componentCount', 'uniqueCellCount', 'largestComponentUniqueCells', 'largestComponentSpells',
      'largestComponentSpellFraction', 'largestComponentUniqueCellFraction', 'multiTerminationTimeGroupCount',
      'baselineEventCountAtFrame', 'rightCensoredSpellCount', 'rightCensoredDurationEligibleCount', 'rightCensoredSupportedCellCount']))
  };
  summary.outputSha256 = Object.fromEntries(Object.entries(outputs).map(([name, bytes]) => [name, sha(bytes)]));
  const compact = { schemaVersion: 1, ...summary, seeds: seeds.map(seed => ({ seed: seed.seed,
    parity: seed.parity, risk: seed.risk, representatives: seed.representatives,
    summaryByTarget: seed.summaryByTarget, timeline: seed.timeline, targetFrames: seed.targets,
    milestones: seed.snapshots.map(snapshot => ({ nominalTargetSeconds: snapshot.target.nominalTargetSeconds,
      cutoffFrameIndex: snapshot.target.frameIndex, cutoffTimeSeconds: snapshot.target.actualTimeSeconds,
      id0Alive: snapshot.summary.id0Alive, id0HistoricalCellIndices: [...snapshot.id0Cells].sort((a, b) => a - b),
      currentSupportedCellIndices: snapshot.currentSupportedCellIndices,
      currentEventGeometry: snapshot.currentEventGeometry.map(event => ({ eventId: event.eventId,
        frameIndex: event.frameIndex, timeSeconds: event.timeSeconds, size: event.size, cellIndices: event.cellIndices,
        newCellIndices: event.newCellIndices, overlapCellIndices: event.overlapCellIndices })),
      cumulativeLocalCellIndices: snapshot.cumulativeLocalCells })),
    finalId0CellIndices: [...seed.finalId0Cells].sort((a, b) => a - b) })) };
  outputs['analysis.json.gz'] = gzipSync(Buffer.from(JSON.stringify(compact)), { level: 9, mtime: 0 });
  outputs['summary.json'] = Buffer.from(JSON.stringify(summary, null, 2) + '\n');
  finite(compact); finite(summary);
  await mkdir(output, { recursive: true });
  for (const [name, bytes] of Object.entries(outputs)) await writeFile(resolve(output, name), bytes);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();

export const _coherenceAuditTest = { connectedCellGroupsByFrame, closestFrames, normalizeStoredEvents,
  normalizeStoredSpells, parseCsv, neighbors8, observedConcurrentOverlap, eligibleTerminatedBy, edgeAvailableBy,
  observedSpellDuration, selectRepresentativeGroups };
