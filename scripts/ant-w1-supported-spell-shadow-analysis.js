import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createW1SupportedSpellObserver } from './ant-w1-supported-spell-shadow.js';
import { createMaxOverlapCrystallizer } from './ant-w1-max-overlap-crystallization.js';
import { analyzeSeed, W1_PACKAGE } from './ant-w1-analysis.js';
import { loadSeedInputs } from './ant-w1-inputs.js';
import { loadCandidateAnalyzer, replayMatched } from './ant-w1-max-overlap-analysis.js';

export const LOCAL_PACKAGE = 'docs/ant/evidence/2026-10-09-w1-cell-local-supported-formation-shadow';
const STARTING_HEAD = '9c838039b614685a8f639958188486a447a04724';
const CHARACTER = 'docs/ant/evidence/2026-10-08-w1-causal-character-attribution';
const CONTINUITY = 'docs/ant/evidence/2026-10-09-w1-continuity-diagnostic';
const SPLIT = 'docs/ant/evidence/2026-10-09-w1-max-overlap-split-shadow';
const CELL_HISTORY = 'docs/ant/evidence/2026-10-09-w1-per-cell-formation-history';
const SEEDS = [20261005, 20261006, 20261007], WIDTH = 96, HEIGHT = 96, CELLS = WIDTH * HEIGHT;
const TARGETS = [120, 300, 480, 599.25], sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readGz = async path => JSON.parse(gunzipSync(await readFile(path)));

export function latestContactAt(feetByCell, cellIndex, timeSeconds) {
  const rows = feetByCell[cellIndex];
  let low = 0, high = rows.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (rows[mid].timeSeconds <= timeSeconds) low = mid + 1;
    else high = mid;
  }
  const contact = rows[low - 1];
  return contact ? { timeSeconds: contact.timeSeconds, ageSeconds: timeSeconds - contact.timeSeconds,
    antId: contact.antId ?? null, contactIndex: contact.contactIndex } : null;
}

function indexFeet(feet) {
  const byCell = Array.from({ length: CELLS }, () => []);
  for (const foot of feet) {
    assert.ok(Number.isSafeInteger(foot.cellIndex) && foot.cellIndex >= 0 && foot.cellIndex < CELLS);
    assert.ok(Number.isFinite(foot.timeSeconds) && foot.timeSeconds >= 0);
    byCell[foot.cellIndex].push(foot);
  }
  for (const rows of byCell) rows.sort((a, b) => a.timeSeconds - b.timeSeconds || a.contactIndex - b.contactIndex);
  return byCell;
}

function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b), middle = ordered.length >>> 1;
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function distribution(values) {
  return { count: values.length, minimum: values.length ? Math.min(...values) : null,
    median: median(values), maximum: values.length ? Math.max(...values) : null,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
}

function terminationSummary(spells) {
  const counts = { 'q-off': 0, 'active-off': 0, both: 0 };
  for (const spell of spells) counts[spell.terminationReason] += 1;
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}

function missingBitSummary(spells) {
  const counts = { chemical: 0, mechanical: 0, cumulativeContact: 0 };
  for (const spell of spells) {
    counts.chemical += Number(spell.missingQualificationBits.includes(1));
    counts.mechanical += Number(spell.missingQualificationBits.includes(2));
    counts.cumulativeContact += Number(spell.missingQualificationBits.includes(4));
  }
  return counts;
}

function frozenEpisodeSummary(episodes) {
  const sizes = episodes.map(episode => episode.cellIndices.length);
  const durations = episodes.map(episode => episode.persistenceSeconds);
  return { count: episodes.length, oneCellCount: sizes.filter(size => size === 1).length,
    oneCellFraction: sizes.length ? sizes.filter(size => size === 1).length / sizes.length : null,
    multiCellCount: sizes.filter(size => size > 1).length, medianSize: median(sizes), maximumSize: Math.max(0, ...sizes),
    medianPersistenceSeconds: median(durations), unionCellCount: new Set(episodes.flatMap(episode => episode.cellIndices)).size };
}

function postTerminationCarryover(spell, frames, flags, frameCount) {
  if (!spell.activeCarryoverAtTermination) return { qFalseActiveCarryoverFrames: 0,
    qFalseActiveCarryoverObservedSeconds: 0, qFalseActiveCarryoverRightCensored: false };
  let count = 0, lastTime = spell.terminationTimeSeconds;
  for (let frame = spell.terminationFrameIndex; frame < frameCount; frame += 1) {
    const offset = frame * CELLS, q = (flags[offset + spell.cellIndex] & 7) === 7;
    if (q || !frames[frame].activeMask[spell.cellIndex]) break;
    count += 1; lastTime = frames[frame].timeSeconds;
  }
  const nextFrame = spell.terminationFrameIndex + count;
  const censored = nextFrame >= frameCount;
  return { qFalseActiveCarryoverFrames: count,
    qFalseActiveCarryoverObservedSeconds: lastTime - spell.terminationTimeSeconds,
    qFalseActiveCarryoverRightCensored: censored };
}

function closestFrames(input) {
  return TARGETS.map(target => input.fieldMetadata.frames.map((row, frameIndex) => ({ frameIndex,
    delta: Math.abs(row.timeSeconds - target) })).sort((a, b) => a.delta - b.delta || a.frameIndex - b.frameIndex)[0]);
}

function closureFrames(episodes, frames) {
  const byFrame = new Map();
  for (const episode of episodes) {
    const index = frames.findIndex(frame => Math.abs(frame.timeSeconds - episode.episodeMeta.closeTimeSeconds) <= 1e-9);
    assert.ok(index >= 0, `frozen closure ${episode.episodeMeta.id} matches an observed frame`);
    if (!byFrame.has(index)) byFrame.set(index, []);
    byFrame.get(index).push(episode.historicalCellIndices);
  }
  return byFrame;
}

function unionAt(set, groups) {
  for (const cells of groups ?? []) for (const cell of cells) set.add(cell);
}

function verifyStoredFrozenResults(historyCondition, episodes, label) {
  assert.equal(historyCondition.frozenEpisodes.length, episodes.length, `${label} episode count`);
  const expected = new Map(episodes.map(episode => [episode.id, episode]));
  for (const view of historyCondition.frozenEpisodes) {
    const episode = expected.get(view.episodeMeta.id);
    assert.ok(episode, `${label} stored episode ${view.episodeMeta.id}`);
    assert.deepEqual(view.historicalCellIndices, episode.cellIndices, `${label} geometry ${episode.id}`);
    assert.deepEqual(view.episodeMeta.character, episode.character, `${label} character ${episode.id}`);
    assert.equal(view.episodeMeta.closeTimeSeconds, episode.closeTimeSeconds, `${label} closure ${episode.id}`);
  }
}

function summarizeLocal({ spells, events, observerSnapshot, frames, frozenBaseline, frozenCandidate, finalId0History }) {
  const eligible = spells.filter(spell => spell.eligible), sizes = events.map(event => event.size);
  const candidateCellSamples = events.reduce((sum, event) => sum + event.size, 0);
  const overlapCellSamples = events.reduce((sum, event) => sum + event.overlapCellCount, 0);
  const contactAges = eligible.map(spell => spell.lastActualFootContactAgeAtLastSupportSeconds)
    .filter(value => value !== null);
  const eventsDuringId0Open = events.filter(event => event.id0AliveAtCompletion);
  const id0RelatedAlive = events.filter(event => event.id0AliveAtCompletion &&
    (event.id0RelatedCellIndices.length || event.id0HistoricalOverlapCellIndices.length));
  return {
    terminatedSpellCount: spells.length, eligibleSpellCount: eligible.length,
    eligibleTerminationFraction: spells.length ? eligible.length / spells.length : null,
    terminationReasonCounts: terminationSummary(spells), eligibleTerminationReasonCounts: terminationSummary(eligible),
    missingQualificationBitsAtTermination: missingBitSummary(spells),
    eligibleMissingQualificationBitsAtTermination: missingBitSummary(eligible),
    contactQualificationMissingAtTerminationCount: spells.filter(spell => spell.contactQualificationMissingAtTermination).length,
    eligibleContactQualificationMissingAtTerminationCount: eligible.filter(spell => spell.contactQualificationMissingAtTermination).length,
    eligibleStartedWithActiveCarryoverCount: eligible.filter(spell => spell.startedWithActiveCarryover).length,
    eligibleActiveCarryoverAtTerminationCount: eligible.filter(spell => spell.activeCarryoverAtTermination).length,
    eligibleCarryoverRightCensoredCount: eligible.filter(spell => spell.qFalseActiveCarryoverRightCensored).length,
    eligibleCarryoverFrameCount: eligible.reduce((sum, spell) => sum + spell.qFalseActiveCarryoverFrames, 0),
    id0OpenObservationCount: frames.filter(frame => frame.id0Alive).length,
    id0CurrentActiveObservationCount: frames.filter(frame => frame.id0CurrentActiveCells > 0).length,
    id0ZeroCurrentActiveObservationCount: frames.filter(frame => frame.id0CurrentActiveCells === 0).length,
    eventsDuringId0Open: eventsDuringId0Open.length,
    eventsDuringId0OpenWithCurrentActiveCells: eventsDuringId0Open.filter(event =>
      frames[event.frameIndex].id0CurrentActiveCells > 0).length,
    eventsDuringId0OpenWithNoCurrentActiveCells: eventsDuringId0Open.filter(event =>
      frames[event.frameIndex].id0CurrentActiveCells === 0).length,
    eligibleContactAge: { count: contactAges.length, missingCount: eligible.length - contactAges.length,
      medianSeconds: median(contactAges), maximumSeconds: contactAges.length ? Math.max(...contactAges) : null,
      beyond20Seconds: contactAges.filter(age => age > 20 + 1e-9).length,
      beyond90Seconds: contactAges.filter(age => age > 90 + 1e-9).length },
    eligibleObservedSpellDurationSeconds: distribution(eligible.map(spell => spell.observedDurationSeconds)),
    eventCount: events.length, oneCellEventCount: sizes.filter(size => size === 1).length,
    oneCellEventFraction: sizes.length ? sizes.filter(size => size === 1).length / sizes.length : null,
    multiCellEventCount: sizes.filter(size => size > 1).length,
    medianEventSize: median(sizes), maximumEventSize: Math.max(0, ...sizes),
    eventsAtLeast18Cells: sizes.filter(size => size >= 18).length,
    eventSizeCounts: Object.fromEntries([...new Set(sizes)].sort((a, b) => a - b).map(size => [size, sizes.filter(value => value === size).length])),
    eventCellSamples: candidateCellSamples, repeatedCellSamples: overlapCellSamples,
    localReinscriptionFraction: candidateCellSamples ? overlapCellSamples / candidateCellSamples : null,
    priorBaselineFrozenOverlapCellSamples: events.reduce((sum, event) => sum + event.priorBaselineFrozenOverlapCellIndices.length, 0),
    priorCandidateFrozenOverlapCellSamples: events.reduce((sum, event) => sum + event.priorCandidateFrozenOverlapCellIndices.length, 0),
    uniqueLocalMaterializedCells: observerSnapshot.materializedCellIndices.length,
    localWorldFraction: observerSnapshot.materializedCellIndices.length / CELLS,
    pendingLocalSpellCount: observerSnapshot.pendingSpells.length,
    eligiblePendingLocalSpellCount: observerSnapshot.pendingSpells.filter(spell => spell.eligibleAtCutoff).length,
    id0AliveAtFinalObservation: frames.at(-1).id0Alive,
    id0HistoryCellsAtFinalObservation: frames.at(-1).id0HistoricalCells,
    localMaterializedInsideFinalId0HistoryCells: observerSnapshot.materializedCellIndices.filter(cell => finalId0History.has(cell)).length,
    localToId0HistoryAreaRatio: finalId0History.size ? observerSnapshot.materializedCellIndices.length / finalId0History.size : null,
    id0RelatedEventsWhileAlive: id0RelatedAlive.length,
    id0RelatedCellsWhileAlive: id0RelatedAlive.reduce((sum, event) => sum +
      new Set([...event.id0RelatedCellIndices, ...event.id0HistoricalOverlapCellIndices]).size, 0),
    finalBaselineFrozenUnionCells: frozenBaseline.size, finalCandidateFrozenUnionCells: frozenCandidate.size,
    baselineFrozenEpisodeSummary: null, candidateFrozenEpisodeSummary: null
  };
}

function summarizePooled(seeds) {
  const summaries = seeds.map(seed => seed.localSummary), events = seeds.flatMap(seed => seed.events);
  const spells = seeds.flatMap(seed => seed.spells), sizes = events.map(event => event.size);
  const reasonCounts = { 'q-off': 0, 'active-off': 0, both: 0 };
  for (const spell of spells) reasonCounts[spell.terminationReason] += 1;
  const uniqueCells = summaries.reduce((sum, row) => sum + row.uniqueLocalMaterializedCells, 0);
  return { seedCount: seeds.length, terminatedSpellCount: spells.length,
    eligibleSpellCount: spells.filter(spell => spell.eligible).length,
    terminationReasonCounts: Object.fromEntries(Object.entries(reasonCounts).filter(([, count]) => count > 0)),
    eligibleMissingQualificationBitsAtTermination: missingBitSummary(spells.filter(spell => spell.eligible)),
    eventCount: events.length, oneCellEventCount: sizes.filter(size => size === 1).length,
    oneCellEventFraction: sizes.length ? sizes.filter(size => size === 1).length / sizes.length : null,
    multiCellEventCount: sizes.filter(size => size > 1).length, medianEventSize: median(sizes),
    maximumEventSize: Math.max(0, ...sizes),
    eventCellSamples: events.reduce((sum, event) => sum + event.size, 0),
    repeatedCellSamples: events.reduce((sum, event) => sum + event.overlapCellCount, 0),
    priorBaselineFrozenOverlapCellSamples: events.reduce((sum, event) => sum + event.priorBaselineFrozenOverlapCellIndices.length, 0),
    priorCandidateFrozenOverlapCellSamples: events.reduce((sum, event) => sum + event.priorCandidateFrozenOverlapCellIndices.length, 0),
    localReinscriptionFraction: events.length ? events.reduce((sum, event) => sum + event.overlapCellCount, 0) /
      events.reduce((sum, event) => sum + event.size, 0) : null,
    uniqueLocalMaterializedCells: uniqueCells, meanWorldFractionAcrossSeeds: uniqueCells / (seeds.length * CELLS),
    id0AliveAtFinalObservation: summaries.every(row => row.id0AliveAtFinalObservation),
    id0HistoryCellsAtFinalObservation: summaries.reduce((sum, row) => sum + row.id0HistoryCellsAtFinalObservation, 0),
    id0RelatedEventsWhileAlive: summaries.reduce((sum, row) => sum + row.id0RelatedEventsWhileAlive, 0),
    baselineFrozenUnionCells: summaries.reduce((sum, row) => sum + row.finalBaselineFrozenUnionCells, 0),
    candidateFrozenUnionCells: summaries.reduce((sum, row) => sum + row.finalCandidateFrozenUnionCells, 0) };
}

function historyMaskAt(condition, timeSeconds) {
  const view = condition.dominantSnapshots.find(snapshot => snapshot.cutoffTimeSeconds === timeSeconds);
  assert.ok(view, `fixed ID 0 snapshot at ${timeSeconds}`);
  return view.historicalCellIndices;
}

function liveReplay({ input, candidateAnalysis, matched, historySeed }) {
  const model = createMaxOverlapCrystallizer({ width: WIDTH, height: HEIGHT });
  const observer = createW1SupportedSpellObserver({ width: WIDTH, height: HEIGHT });
  const frameRows = [], activeMasks = [], allSpells = [], allEvents = [];
  const snapshots = closestFrames(input), snapshotByFrame = new Map(snapshots.map((item, i) => [item.frameIndex, TARGETS[i]]));
  const frozenBaselineAtFrame = closureFrames(historySeed.baseline.frozenEpisodes, input.fieldMetadata.frames);
  const frozenCandidateAtFrame = closureFrames(historySeed.candidate.frozenEpisodes, input.fieldMetadata.frames);
  const baselineFrozen = new Set(), candidateFrozen = new Set(), milestones = [];
  let finalId0HistoricalCellIndices = [];
  const feetByCell = indexFeet(input.feet), id0Frozen = [...candidateAnalysis.episodes, ...candidateAnalysis.discardedEpisodes,
    ...candidateAnalysis.rightCensoredEpisodes].find(episode => episode.id === 0);
  assert.ok(id0Frozen, 'candidate ID 0 has a terminal or right-censored record');

  for (const [frameIndex, frame] of input.fieldMetadata.frames.entries()) {
    const flags = input.flags.subarray(frameIndex * CELLS, (frameIndex + 1) * CELLS);
    const result = model.advance({ timeSeconds: frame.timeSeconds, flags });
    const snapshot = model.getSnapshot(), diagnostics = model.getLastIdentityDiagnostics();
    assert.deepEqual(diagnostics, matched.identityFrames[frameIndex], `max-overlap identity parity ${frameIndex}`);
    assert.deepEqual(snapshot.stateBounds, candidateAnalysis.history[frameIndex].stateBounds, `EMA parity ${frameIndex}`);
    const activeMask = Uint8Array.from(snapshot.activeMask), activeCellIndices = [];
    for (let cell = 0; cell < CELLS; cell += 1) if (activeMask[cell]) activeCellIndices.push(cell);
    assert.deepEqual(activeCellIndices, diagnostics.components.flatMap(component => component.cellIndices).sort((a, b) => a - b));
    const open = model.getOpenEpisodes(), id0Open = open.find(episode => episode.id === 0);
    const closedAtFrame = [...result.closedEpisodes, ...result.discardedEpisodes].find(episode => episode.id === 0);
    const id0Episode = id0Open ?? closedAtFrame ?? model.getClosedEpisodes().find(episode => episode.id === 0);
    const id0HistoricalCellIndices = id0Episode ? [...id0Episode.cellIndices] : [];
    finalId0HistoricalCellIndices = id0HistoricalCellIndices;
    const id0CurrentActiveCells = diagnostics.components.filter(component => component.episodeId === 0)
      .flatMap(component => component.cellIndices).sort((a, b) => a - b);
    const id0Alive = Boolean(id0Open);
    activeMasks.push(activeMask);
    const observed = observer.advance({ frameIndex, timeSeconds: frame.timeSeconds, flags, activeMask,
      activeOwners: diagnostics.components.map(component => ({ identityId: component.episodeId, cellIndices: component.cellIndices })),
      id0HistoricalCellIndices, id0Alive });

    for (const spell of observed.terminatedSpells) {
      const contact = latestContactAt(feetByCell, spell.cellIndex, spell.lastSupportedTimeSeconds);
      const enriched = { ...spell, lastActualFootContactTimeSeconds: contact?.timeSeconds ?? null,
        lastActualFootContactAgeAtLastSupportSeconds: contact?.ageSeconds ?? null,
        lastActualFootContactAntId: contact?.antId ?? null, lastActualFootContactIndex: contact?.contactIndex ?? null,
        qFalseActiveCarryoverFrames: 0, qFalseActiveCarryoverObservedSeconds: 0,
        qFalseActiveCarryoverRightCensored: false };
      allSpells.push(enriched);
    }

    const basePrior = new Set(baselineFrozen), candidatePrior = new Set(candidateFrozen);
    const eventsThisFrame = [];
    for (const event of observed.events) {
      const enriched = Object.freeze({ ...event,
        priorBaselineFrozenOverlapCellIndices: Object.freeze(event.cellIndices.filter(cell => basePrior.has(cell))),
        priorCandidateFrozenOverlapCellIndices: Object.freeze(event.cellIndices.filter(cell => candidatePrior.has(cell))) });
      allEvents.push(enriched); eventsThisFrame.push(enriched);
    }
    unionAt(baselineFrozen, frozenBaselineAtFrame.get(frameIndex));
    unionAt(candidateFrozen, frozenCandidateAtFrame.get(frameIndex));
    const localMaterializedCells = eventsThisFrame.reduce((sum, event) => sum + event.newCellCount, 0) +
      (frameRows.at(-1)?.localMaterializedCells ?? 0);
    const id0OwnedActiveCells = id0CurrentActiveCells.length;
    const frameSummary = { frameIndex, timeSeconds: frame.timeSeconds,
      qCells: flags.reduce((sum, value) => sum + Number((value & 7) === 7), 0), activeCells: snapshot.activeCellCount,
      id0Alive, id0HistoricalCells: id0HistoricalCellIndices.length, id0CurrentActiveCells: id0OwnedActiveCells,
      terminatedSpells: observed.terminatedSpells.length,
      eligibleSpells: observed.terminatedSpells.filter(spell => spell.eligible).length,
      eventCount: eventsThisFrame.length, eventCellCount: eventsThisFrame.reduce((sum, event) => sum + event.size, 0),
      newEventCells: eventsThisFrame.reduce((sum, event) => sum + event.newCellCount, 0),
      repeatedEventCells: eventsThisFrame.reduce((sum, event) => sum + event.overlapCellCount, 0),
      localMaterializedCells,
      baselineFrozenCells: baselineFrozen.size, candidateFrozenCells: candidateFrozen.size };
    frameRows.push({ ...frameSummary, activeMask });

    if (snapshotByFrame.has(frameIndex)) {
      const nominalTargetSeconds = snapshotByFrame.get(frameIndex);
      const savedHistory = historyMaskAt(historySeed.candidate, frame.timeSeconds);
      assert.deepEqual(id0HistoricalCellIndices, savedHistory, `ID 0 historical union at ${frame.timeSeconds}`);
      const localSnapshot = observer.snapshot();
      milestones.push({ nominalTargetSeconds, frameIndex, actualTimeSeconds: frame.timeSeconds,
        id0Alive, id0HistoricalCellIndices, id0CurrentActiveCellIndices: id0CurrentActiveCells,
        currentActiveCellIndices: activeCellIndices, currentEventGeometry: eventsThisFrame,
        localMaterializedCellIndices: localSnapshot.materializedCellIndices,
        baselineFrozenCellIndices: [...baselineFrozen].sort((a, b) => a - b),
        candidateFrozenCellIndices: [...candidateFrozen].sort((a, b) => a - b) });
    }
  }

  const projectArchive = (archive, actual) => actual.map((episode, index) =>
    Object.fromEntries(Object.keys(episode).map(key => [key, archive[index][key]])));
  assert.deepEqual(model.getClosedEpisodes(), projectArchive(candidateAnalysis.episodes, model.getClosedEpisodes()),
    'max-overlap frozen geometry');
  assert.deepEqual(model.getDiscardedEpisodes(), projectArchive(candidateAnalysis.discardedEpisodes, model.getDiscardedEpisodes()),
    'max-overlap discarded geometry');
  assert.deepEqual(model.getOpenEpisodes(), projectArchive(candidateAnalysis.rightCensoredEpisodes, model.getOpenEpisodes()),
    'max-overlap pending geometry');
  const id0EverAlive = frameRows.some(frame => frame.id0Alive);
  assert.ok(id0EverAlive && frameRows.at(-1).id0Alive, 'ID 0 remains alive through final observation');
  assert.equal(milestones.length, TARGETS.length);

  for (let index = 0; index < allSpells.length; index += 1) {
    const spell = allSpells[index];
    if (spell.activeCarryoverAtTermination) Object.assign(spell,
      postTerminationCarryover(spell, frameRows, input.flags, frameRows.length));
  }
  const spellByCellEnd = new Map(allSpells.map(spell => [`${spell.terminationFrameIndex}:${spell.cellIndex}`, spell]));
  const eventCellRows = allEvents.flatMap(event => event.cellIndices.map(cell => {
    const spell = spellByCellEnd.get(`${event.frameIndex}:${cell}`);
    assert.ok(spell?.eligible, `event cell ${cell} has one eligible ended spell`);
    return { eventId: event.eventId, frameIndex: event.frameIndex, timeSeconds: event.timeSeconds,
      cellIndex: cell, size: event.size, newCell: event.newCellIndices.includes(cell), overlappedLocalMaterial: event.overlapCellIndices.includes(cell),
      priorBaselineFrozen: event.priorBaselineFrozenOverlapCellIndices.includes(cell),
      priorCandidateFrozen: event.priorCandidateFrozenOverlapCellIndices.includes(cell),
      ...spell };
  }));
  const enrichedFrames = frameRows.map(({ activeMask, ...row }) => row);
  return { frames: enrichedFrames, spells: allSpells, events: allEvents, eventCellRows,
    milestones, final: observer.snapshot(), finalBaselineFrozen: [...baselineFrozen].sort((a, b) => a - b),
    finalCandidateFrozen: [...candidateFrozen].sort((a, b) => a - b),
    finalId0History: finalId0HistoricalCellIndices };
}

export function csv(rows, columns) {
  const cell = value => {
    if (value === undefined || value === null) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\n') + '\n';
}

function finite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), 'finite analysis value');
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}

async function run() {
  const output = resolve(process.argv[2] ?? `${LOCAL_PACKAGE}/results`);
  for (const protectedRoot of [W1_PACKAGE, CHARACTER, CONTINUITY, SPLIT, CELL_HISTORY]) {
    const path = relative(resolve(protectedRoot), output);
    assert.ok(path.startsWith('..') && path !== '.', 'write only outside preserved evidence');
  }
  const originalPackage = await readGz(`${W1_PACKAGE}/inputs/baselines/local-accretion-analysis.json.gz`);
  const splitAnalysis = await readGz(`${SPLIT}/results/analysis.json.gz`);
  const cellHistory = await readGz(`${CELL_HISTORY}/results/analysis.json.gz`);
  const continuity = await readGz(`${CONTINUITY}/results/analysis.json.gz`);
  const adapter = await loadCandidateAnalyzer(), seeds = [], priorRandom = Math.random;
  Math.random = () => { throw new Error('W1 local formation shadow must not consume RNG'); };
  try {
    for (const seed of SEEDS) {
      const input = await loadSeedInputs(seed, W1_PACKAGE), splitSeed = splitAnalysis.seeds.find(row => row.seed === seed);
      const historySeed = cellHistory.seeds.find(row => row.seed === seed), continuitySeed = continuity.seeds.find(row => row.seed === seed);
      const comparison = originalPackage.seeds.find(row => row.seed === seed);
      assert.ok(splitSeed && historySeed && continuitySeed && comparison, `frozen references exist for ${seed}`);
      const baseline = analyzeSeed(input, comparison);
      const candidate = adapter.analyzeSeed(input, comparison);
      assert.deepEqual(baseline, splitSeed.baseline, `${seed} original W1 geometry / character deep-equal`);
      assert.deepEqual(candidate, splitSeed.candidate, `${seed} max-overlap geometry / character deep-equal`);
      verifyStoredFrozenResults(historySeed.baseline, baseline.episodes, `${seed} original W1`);
      verifyStoredFrozenResults(historySeed.candidate, candidate.episodes, `${seed} max-overlap`);
      assert.deepEqual(input.metadata.sourceHashes, splitSeed.candidate.inputProvenance.sourceHashes, `${seed} frozen input provenance`);
      const matched = replayMatched(input, continuitySeed, candidate);
      const local = liveReplay({ input, candidateAnalysis: candidate, matched, historySeed });
      const existingFrozen = { baseline: frozenEpisodeSummary(baseline.episodes), candidate: frozenEpisodeSummary(candidate.episodes) };
      const existingFrozenDistributions = Object.fromEntries([['baseline', baseline], ['candidate', candidate]].map(([name, result]) =>
        [name, { sizes: result.episodes.map(episode => episode.cellIndices.length),
          persistenceSeconds: result.episodes.map(episode => episode.persistenceSeconds) }]));
      const localSummary = summarizeLocal({ ...local, observerSnapshot: local.final, frames: local.frames,
        frozenBaseline: new Set(local.finalBaselineFrozen), frozenCandidate: new Set(local.finalCandidateFrozen),
        finalId0History: new Set(local.finalId0History) });
      localSummary.baselineFrozenEpisodeSummary = existingFrozen.baseline;
      localSummary.candidateFrozenEpisodeSummary = existingFrozen.candidate;
      const row = { seed, inputProvenance: splitSeed.candidate.inputProvenance,
        parity: { observations: matched.frames.length, qInput: true, emaBounds: true, activeMask: true,
          candidateIdentityFrames: true, originalW1DeepEqual: true, maxOverlapDeepEqual: true },
        localSummary, timeline: local.frames, milestones: local.milestones,
        eventSizes: local.events.map(event => event.size), localMaterializedCellIndices: local.final.materializedCellIndices,
        pendingSpells: local.final.pendingSpells,
        eventDurationsSeconds: local.eventCellRows.map(row => row.observedDurationSeconds),
        eventContactAgesSeconds: local.eventCellRows.map(row => row.lastActualFootContactAgeAtLastSupportSeconds),
        existingFrozen: Object.fromEntries(Object.entries(existingFrozen).map(([name, summary]) => [name, summary])),
        existingFrozenDistributions,
        eventCount: local.events.length, spellCount: local.spells.length,
        events: local.events, spells: local.spells, eventCellRows: local.eventCellRows };
      finite(row); seeds.push(row);
      process.stdout.write(JSON.stringify({ seed, observations: matched.frames.length,
        local: localSummary, maxOverlapFrozen: existingFrozen.candidate }) + '\n');
    }
  } finally { Math.random = priorRandom; }

  const sourcePaths = ['scripts/ant-w1-supported-spell-shadow.js', 'scripts/ant-w1-supported-spell-shadow-analysis.js',
    'scripts/ant-w1-supported-spell-shadow-plots.js',
    'scripts/ant-w1-crystallization.js', 'scripts/ant-w1-max-overlap-crystallization.js',
    'scripts/ant-w1-max-overlap-analysis.js', 'scripts/ant-w1-cell-history-analysis.js',
    'scripts/ant-w1-analysis.js', 'scripts/ant-w1-inputs.js'];
  const sourceSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, sha(await readFile(path))])));
  const evidencePaths = [`${W1_PACKAGE}/inputs/baselines/local-accretion-analysis.json.gz`,
    `${CHARACTER}/results/analysis.json.gz`, `${CONTINUITY}/results/analysis.json.gz`,
    `${SPLIT}/results/analysis.json.gz`, `${CELL_HISTORY}/results/analysis.json.gz`];
  const sourceEvidenceSha256 = Object.fromEntries(await Promise.all(evidencePaths.map(async path => [path, sha(await readFile(path))])));
  const analysis = { schemaVersion: 1, startingHead: STARTING_HEAD,
    kind: 'W1 cell-local supported-spell completion shadow', seedOrder: SEEDS,
    parameters: { grid: [WIDTH, HEIGHT], qFlagsMask: 7, recentSeconds: 20, establishedSeconds: 90,
      persistenceSeconds: 20, connectivity: 8, maximumAdjacentObservationGapSeconds: 1 + 1 / 60 + 1e-9,
      interpolationBetweenObservations: false, formationRuleChanged: false },
    sourceSha256, sourceEvidenceSha256, seeds };
  const summary = { status: 'complete', startingHead: STARTING_HEAD, seedCount: seeds.length, observationsPerSeed: 599,
    matchedObservations: seeds.reduce((sum, seed) => sum + seed.parity.observations, 0),
    noRandomness: true, noNaturalRerun: true, productionUnchanged: true,
    seedResults: seeds.map(seed => ({ seed: seed.seed, parity: seed.parity, ...seed.localSummary })),
    pooled: summarizePooled(seeds),
    sourceSha256, sourceEvidenceSha256 };
  const compact = { schemaVersion: analysis.schemaVersion, startingHead: analysis.startingHead, kind: analysis.kind,
    seedOrder: analysis.seedOrder, parameters: analysis.parameters, sourceSha256, sourceEvidenceSha256,
    seeds: seeds.map(seed => ({ seed: seed.seed, inputProvenance: seed.inputProvenance, parity: seed.parity,
      localSummary: seed.localSummary, timeline: seed.timeline, milestones: seed.milestones,
      eventSizes: seed.eventSizes, localMaterializedCellIndices: seed.localMaterializedCellIndices,
      eventDurationsSeconds: seed.eventDurationsSeconds, eventContactAgesSeconds: seed.eventContactAgesSeconds,
      existingFrozen: seed.existingFrozen, existingFrozenDistributions: seed.existingFrozenDistributions })) };
  const spellRows = seeds.flatMap(seed => seed.spells.map(spell => ({ seed: seed.seed, ...spell })));
  const eventRows = seeds.flatMap(seed => seed.events.map(event => ({ seed: seed.seed, ...event })));
  const eventCellRows = seeds.flatMap(seed => seed.eventCellRows.map(row => ({ seed: seed.seed, ...row })));
  const timelineRows = seeds.flatMap(seed => seed.timeline.map(row => ({ seed: seed.seed, ...row })));
  const outputs = {
    'analysis.json.gz': gzipSync(Buffer.from(JSON.stringify(compact)), { level: 9, mtime: 0 }),
    'spells.csv.gz': gzipSync(Buffer.from(csv(spellRows, ['seed', 'cellIndex', 'startFrameIndex', 'startTimeSeconds',
      'lastSupportedFrameIndex', 'lastSupportedTimeSeconds', 'terminationFrameIndex', 'terminationTimeSeconds',
      'observedDurationSeconds', 'eligible', 'terminationReason', 'qAtTermination', 'activeAtTermination',
      'missingQualificationBits', 'contactQualificationMissingAtTermination', 'activeCarryoverAtTermination',
      'startedWithActiveCarryover', 'startOwnerEpisodeId', 'lastSupportedOwnerEpisodeId', 'ownerAtTerminationEpisodeId',
      'relatedEpisodeIds', 'lastActualFootContactTimeSeconds', 'lastActualFootContactAgeAtLastSupportSeconds',
      'qFalseActiveCarryoverFrames', 'qFalseActiveCarryoverObservedSeconds', 'qFalseActiveCarryoverRightCensored'])),
      { level: 9, mtime: 0 }),
    'events.csv': Buffer.from(csv(eventRows, ['seed', 'eventId', 'frameIndex', 'timeSeconds', 'size', 'cellIndices',
      'newCellIndices', 'overlapCellIndices', 'newCellCount', 'overlapCellCount', 'terminationReasonCounts',
      'relatedEpisodeIds', 'terminationEpisodeIds', 'id0RelatedCellIndices', 'id0HistoricalOverlapCellIndices',
      'id0AliveAtCompletion', 'priorBaselineFrozenOverlapCellIndices', 'priorCandidateFrozenOverlapCellIndices'])),
    'event-cells.csv.gz': gzipSync(Buffer.from(csv(eventCellRows, ['seed', 'eventId', 'frameIndex', 'timeSeconds',
      'cellIndex', 'size', 'newCell', 'overlappedLocalMaterial', 'priorBaselineFrozen', 'priorCandidateFrozen',
      'startFrameIndex', 'startTimeSeconds', 'lastSupportedFrameIndex', 'lastSupportedTimeSeconds',
      'observedDurationSeconds', 'terminationTimeSeconds', 'terminationReason', 'missingQualificationBits',
      'activeCarryoverAtTermination', 'startedWithActiveCarryover', 'relatedEpisodeIds',
      'lastActualFootContactTimeSeconds', 'lastActualFootContactAgeAtLastSupportSeconds',
      'qFalseActiveCarryoverFrames', 'qFalseActiveCarryoverObservedSeconds', 'qFalseActiveCarryoverRightCensored'])),
      { level: 9, mtime: 0 }),
    'pending-spells.csv': Buffer.from(csv(seeds.flatMap(seed => seed.pendingSpells.map(spell => ({ seed: seed.seed, ...spell }))),
      ['seed', 'cellIndex', 'startFrameIndex', 'startTimeSeconds', 'lastSupportedFrameIndex', 'lastSupportedTimeSeconds',
        'observedDurationSeconds', 'eligibleAtCutoff', 'relatedEpisodeIds'])),
    'timeline.csv': Buffer.from(csv(timelineRows, ['seed', 'frameIndex', 'timeSeconds', 'qCells', 'activeCells',
      'id0Alive', 'id0HistoricalCells', 'id0CurrentActiveCells', 'terminatedSpells', 'eligibleSpells',
      'eventCount', 'eventCellCount', 'newEventCells', 'repeatedEventCells', 'localMaterializedCells',
      'baselineFrozenCells', 'candidateFrozenCells']))
  };
  summary.outputSha256 = Object.fromEntries(Object.entries(outputs).map(([name, bytes]) => [name, sha(bytes)]));
  outputs['summary.json'] = Buffer.from(JSON.stringify(summary, null, 2) + '\n');
  finite(analysis); finite(summary);
  await mkdir(output, { recursive: true });
  for (const [name, bytes] of Object.entries(outputs)) await writeFile(resolve(output, name), bytes);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();

export const _supportedSpellAnalysisTest = { frozenEpisodeSummary, latestContactAt, median, postTerminationCarryover, terminationSummary };
