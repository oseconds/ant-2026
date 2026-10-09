import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createW1CellHistoryObserver } from './ant-w1-cell-history.js';
import { createW1Crystallizer } from './ant-w1-crystallization.js';
import { createMaxOverlapCrystallizer } from './ant-w1-max-overlap-crystallization.js';
import { analyzeSeed, W1_PACKAGE, maskOf } from './ant-w1-analysis.js';
import { loadSeedInputs } from './ant-w1-inputs.js';
import { loadCandidateAnalyzer, describeValues } from './ant-w1-max-overlap-analysis.js';

export const CELL_PACKAGE = 'docs/ant/evidence/2026-10-09-w1-per-cell-formation-history';
const BASE = '92ba2117b10bd3f559eca9866602ab8d430a649b';
const SPLIT = 'docs/ant/evidence/2026-10-09-w1-max-overlap-split-shadow';
const CONTINUITY = 'docs/ant/evidence/2026-10-09-w1-continuity-diagnostic';
const CHARACTER = 'docs/ant/evidence/2026-10-08-w1-causal-character-attribution';
const SEEDS = [20261005, 20261006, 20261007], WIDTH = 96, HEIGHT = 96, CELLS = WIDTH * HEIGHT;
const TARGETS = [120, 300, 480, 599.25];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readGz = async path => JSON.parse(gunzipSync(await readFile(path)));

export function normalizeHistoryFrame(condition, frame, events = []) {
  assert.ok(['baseline', 'candidate'].includes(condition));
  const operations = [], activeOwners = [];
  for (const component of frame.components) {
    if (condition === 'candidate') {
      for (const sourceId of component.absorbedParentIds) operations.push({ type: 'merge', targetId: component.episodeId, sourceId });
      operations.push({ type: 'directAdmission', identityId: component.episodeId, cells: component.cellIndices });
    } else {
      for (const event of events.filter(e => e.type === 'merge_absorption' && e.componentId === component.componentId))
        operations.push({ type: 'merge', targetId: event.episodeId, sourceId: event.absorbedEpisodeId });
      operations.push({ type: 'directAdmission', identityId: component.processingEpisodeId, cells: component.cellIndices });
    }
    activeOwners.push({ identityId: component.episodeId, cells: component.cellIndices });
  }
  return { operations, activeOwners };
}

function distribution(values) {
  const present = values.filter(value => value !== null && value !== undefined);
  const { valuesSorted, ...stats } = describeValues(present);
  return { ...stats, missingCount: values.length - present.length };
}

export function summarizeCellSnapshot(snapshot) {
  const rows = snapshot.cells;
  const axes = ['episodeOwnedActiveSampleCount', 'episodeOwnedActiveDuty', 'episodeOwnedReactivationCount',
    'episodeOwnedActiveSpellObservedDurationSeconds', 'episodeOwnedLastActiveAgeSeconds',
    'globalActiveDuty', 'lastActiveAgeSeconds', 'chemicalDuty', 'mechanicalDuty', 'jointSupportDuty',
    'lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds',
    'lastActualSameCellFootContactAgeAtFirstDirectHereSeconds', 'lastActualSameCellFootContactAgeAtFirstImportHereSeconds',
    'directExposureSampleCount', 'firstOwnedSpellObservedDurationSeconds', 'maxOwnedSpellObservedDurationSeconds'];
  const ownedActiveSamples = rows.reduce((n, cell) => n + cell.episodeOwnedActiveSampleCount, 0);
  const ownedQFalse = rows.reduce((n, cell) => n + cell.episodeOwnedQFalseActiveObservations, 0);
  return {
    historicalCells: rows.length, currentOwnedActiveCells: snapshot.currentActiveCellCount,
    inactiveHistoricalCells: snapshot.inactiveHistoricalCellIndices.length,
    inactiveHistoricalFraction: rows.length ? snapshot.inactiveHistoricalCellIndices.length / rows.length : null,
    globalActiveHistoricalCells: snapshot.globalActiveHistoricalCellCount,
    directOnlyCells: snapshot.directCellCount, inheritedOnlyCells: snapshot.inheritedCellCount,
    overlappingCells: snapshot.overlappingCellCount,
    directFirstUnionEntryCells: snapshot.directUnionEntryCellCount,
    mergeFirstUnionEntryCells: snapshot.transferredUnionEntryCellCount,
    mergeFirstUnionEntryFraction: rows.length ? snapshot.transferredUnionEntryCellCount / rows.length : null,
    ambiguousAdmissionCells: rows.filter(c => c.ambiguousAdmission).length,
    sameFrameDirectAndImportCells: rows.filter(c => c.directAndImportedSameFrame).length,
    importedCellsWithLaterLocalExposure: rows.filter(c => c.inheritedHere && c.importedAndLocallyRevisitedSampleCount > 0).length,
    ownedActiveCellSamples: ownedActiveSamples, ownedQTrueCellSamples: ownedActiveSamples - ownedQFalse,
    ownedQFalseCellSamples: ownedQFalse, ownedQFalseActiveFraction: ownedActiveSamples ? ownedQFalse / ownedActiveSamples : null,
    cellsWithReactivation: rows.filter(c => c.episodeOwnedReactivationCount > 0).length,
    ownedLastActiveAgeBeyond20Cells: rows.filter(c => c.episodeOwnedLastActiveAgeSeconds > 20 + 1e-9).length,
    ownedLastActiveAgeBeyond90Cells: rows.filter(c => c.episodeOwnedLastActiveAgeSeconds > 90 + 1e-9).length,
    ownedLastActiveAgeBeyond300Cells: rows.filter(c => c.episodeOwnedLastActiveAgeSeconds > 300 + 1e-9).length,
    cumulativeContactAgeBeyond20Cells: rows.filter(c => c.lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds > 20 + 1e-9).length,
    cumulativeContactAgeBeyond90Cells: rows.filter(c => c.lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds > 90 + 1e-9).length,
    distributions: Object.fromEntries(axes.map(axis => [axis, distribution(rows.map(c => c[axis]))]))
  };
}

export function enrichSnapshot(snapshot, flags, episodeMeta = null) {
  const active = new Set(snapshot.activeCellIndices), offset = snapshot.cutoffFrameIndex * CELLS;
  const cells = snapshot.cells.map(cell => ({ ...cell,
    chemicalDuty: cell.chemicalQualifiedObservations / cell.observationCount,
    mechanicalDuty: cell.mechanicalQualifiedObservations / cell.observationCount,
    jointSupportDuty: cell.jointQualifiedObservations / cell.observationCount,
    firstOwnedSpellObservedDurationSeconds: cell.episodeOwnedActiveSpellObservedDurationsSeconds[0] ?? 0,
    maxOwnedSpellObservedDurationSeconds: Math.max(0, ...cell.episodeOwnedActiveSpellObservedDurationsSeconds),
    currentOwnedActive: active.has(cell.cellIndex), qAtCutoff: Number((flags[offset + cell.cellIndex] & 7) === 7)
  }));
  const { mergeEvents, ...state } = snapshot;
  const enriched = { ...state, actualMergeEventSourceIds: mergeEvents.map(e => e.sourceId), cells,
    ...(episodeMeta ? { episodeMeta } : {}) };
  enriched.summary = summarizeCellSnapshot(enriched);
  return enriched;
}

export function representativeIds(episodes) {
  const multi = episodes.filter(e => e.cellIndices.length > 1).sort((a, b) => b.cellIndices.length - a.cellIndices.length || a.id - b.id);
  const single = episodes.filter(e => e.cellIndices.length === 1).sort((a, b) => a.closeTimeSeconds - b.closeTimeSeconds || a.id - b.id);
  return { largestMultiCell: multi[0]?.id ?? null, firstOneCell: single[0]?.id ?? null,
    zeroConsolidationOneCell: single.find(e => e.character.consolidation === 0)?.id ?? null };
}

function validateUnion(observer, episode) {
  const actual = observer.getUnion(episode.id);
  assert.equal(actual.canonicalId, episode.id);
  for (const key of ['cellIndices', 'firstAdmissionFrameByCell', 'firstAdmissionTimeSecondsByCell'])
    assert.deepEqual(actual[key], episode[key], `${key} unchanged for episode ${episode.id}`);
}

function rawModelParity(model, reference) {
  for (const [get, expected] of [['getClosedEpisodes', reference.episodes], ['getDiscardedEpisodes', reference.discardedEpisodes],
    ['getOpenEpisodes', reference.rightCensoredEpisodes]]) {
    const actual = model[get]();
    assert.equal(actual.length, expected.length, `${get} population unchanged`);
    const projected = expected.map((e, index) => Object.fromEntries(Object.keys(actual[index]).map(key => [key, e[key]])));
    assert.deepEqual(actual, projected, `${get} complete original result`);
  }
}

export function auditCondition({ condition, input, reference, continuitySeed, identityFrames }) {
  const observer = createW1CellHistoryObserver({ width: WIDTH, height: HEIGHT, feet: input.feet });
  const model = condition === 'candidate' ? createMaxOverlapCrystallizer({ width: WIDTH, height: HEIGHT })
    : createW1Crystallizer({ width: WIDTH, height: HEIGHT });
  const sources = condition === 'candidate' ? identityFrames : continuitySeed.frames;
  const eventsByFrame = new Map();
  for (const event of continuitySeed.events) {
    if (!eventsByFrame.has(event.frameIndex)) eventsByFrame.set(event.frameIndex, []);
    eventsByFrame.get(event.frameIndex).push(event);
  }
  const selectedFrames = new Map(TARGETS.map(target => {
    const nearest = input.fieldMetadata.frames.map((f, i) => ({ i, delta: Math.abs(f.timeSeconds - target) }))
      .sort((a, b) => a.delta - b.delta || a.i - b.i)[0].i;
    return [nearest, target];
  }));
  const frozenByFrame = new Map();
  for (const episode of reference.episodes) {
    const index = input.fieldMetadata.frames.findIndex(f => Math.abs(f.timeSeconds - episode.closeTimeSeconds) < 1e-9);
    assert.ok(index >= 0, 'actual frozen closure has an archived frame');
    if (!frozenByFrame.has(index)) frozenByFrame.set(index, []);
    frozenByFrame.get(index).push(episode);
  }
  const dominantSnapshots = [], frozenEpisodes = [], frameSummaries = [];
  for (const [frameIndex, frame] of input.fieldMetadata.frames.entries()) {
    const flags = input.flags.subarray(frameIndex * CELLS, (frameIndex + 1) * CELLS), source = sources[frameIndex];
    assert.equal(source.frameIndex, frameIndex); assert.equal(source.timeSeconds, frame.timeSeconds);
    model.advance({ timeSeconds: frame.timeSeconds, flags });
    const snapshot = model.getSnapshot();
    assert.deepEqual(snapshot.activeMask, [...maskOf(source.components.flatMap(c => c.cellIndices))], 'unchanged archived active mask');
    assert.deepEqual(snapshot.stateBounds, reference.history[frameIndex].stateBounds, 'unchanged EMA bounds');
    if (condition === 'candidate') assert.deepEqual(model.getLastIdentityDiagnostics(), source, 'entire archived identity diagnostics');
    const normalized = normalizeHistoryFrame(condition, source, eventsByFrame.get(frameIndex) ?? []);
    const observation = observer.advance({ frameIndex, timeSeconds: frame.timeSeconds, flags, ...normalized });
    const open = model.getOpenEpisodes();
    for (const episode of open) validateUnion(observer, episode);
    if (condition === 'baseline') assert.deepEqual(source.openLineages.map(e => ({
      id: e.id, birthFrameIndex: e.birthFrameIndex, birthTimeSeconds: e.birthTimeSeconds,
      lastActiveFrameIndex: e.lastActiveFrameIndex, lastActiveTimeSeconds: e.lastActiveTimeSeconds,
      cumulativeArea: e.cumulativeArea, ancestryCount: e.ancestryCount, activeFrameCount: e.activeFrameCount
    })), open.map(e => ({ id: e.id, birthFrameIndex: e.birthFrameIndex, birthTimeSeconds: e.birthTimeSeconds,
      lastActiveFrameIndex: e.lastActiveFrameIndex, lastActiveTimeSeconds: e.lastActiveTimeSeconds,
      cumulativeArea: e.cellIndices.length, ancestryCount: e.ancestryIds.length, activeFrameCount: e.activeFrameCount
    })), 'baseline archived canonical identity/clock/union snapshots');
    assert.deepEqual([...new Set(normalized.activeOwners.map(c => c.identityId))].sort((a, b) => a - b),
      open.map(e => e.id), 'all canonical owners equal live model identity set');
    for (const episode of [...model.getClosedEpisodes(), ...model.getDiscardedEpisodes()].filter(e => e.closeTimeSeconds === frame.timeSeconds))
      validateUnion(observer, episode);
    const root = open.find(e => e.id === 0);
    const rootCells = root?.cellIndices ?? [], rootOwned = normalized.activeOwners.filter(c => c.identityId === 0);
    const rootUnion = root ? observer.getUnion(0) : null;
    frameSummaries.push({ frameIndex, timeSeconds: frame.timeSeconds, activeCells: snapshot.activeCellCount,
      rootHistoricalCells: rootCells.length, rootCurrentActiveCells: rootOwned.reduce((n, c) => n + c.cells.length, 0),
      rootMergeNewCellsThisFrame: observation.mergeEvents.filter(e => e.targetId === 0).reduce((n, e) => n + e.transferredCellCount, 0),
      rootMergeOverlapCellsThisFrame: observation.mergeEvents.filter(e => e.targetId === 0).reduce((n, e) => n + e.overlapCellCount, 0),
      rootCanonicalFirstAdmissionMinFrame: rootUnion ? Math.min(...rootUnion.firstAdmissionFrameByCell) : null });
    if (selectedFrames.has(frameIndex)) {
      assert.ok(root, 'ID 0 exists at requested actual milestone');
      const view = enrichSnapshot(observer.snapshot(0), input.flags);
      view.nominalTargetSeconds = selectedFrames.get(frameIndex);
      dominantSnapshots.push(view);
    }
    for (const episode of frozenByFrame.get(frameIndex) ?? []) {
      const meta = { id: episode.id, status: episode.status, birthTimeSeconds: episode.birthTimeSeconds,
        closeTimeSeconds: episode.closeTimeSeconds, persistenceSeconds: episode.persistenceSeconds,
        ancestryIds: episode.ancestryIds, splitProvenanceIds: episode.splitProvenanceIds ?? [],
        character: episode.character, newAreaFraction: episode.newAreaFraction };
      const view = enrichSnapshot(observer.snapshot(episode.id), input.flags, meta);
      const observedConsolidation = view.cells.reduce((n, c) => n + c.jointSupportDuty, 0) / view.cells.length;
      assert.equal(observedConsolidation, episode.character.consolidation, 'unchanged consolidation reproduced by cell duties');
      frozenEpisodes.push(view);
    }
  }
  rawModelParity(model, reference);
  assert.equal(frozenEpisodes.length, reference.episodes.length);
  return { parity: { observations: sources.length, activeMask: true, identity: true, geometry: true, admissions: true,
    closure: true, character: true, originalAnalysisDeepEqual: true, sourceHistoryDeepEqual: true },
    representativeIds: representativeIds(reference.episodes), dominantSnapshots, frozenEpisodes, frameSummaries,
    mergeEvents: observer.mergeEvents };
}

function finite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), 'finite analysis value');
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}

export function csv(rows, columns) {
  const cell = value => {
    if (value === undefined || value === null) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\n') + '\n';
}

async function run() {
  const output = resolve(process.argv[2] ?? `${CELL_PACKAGE}/results`);
  for (const protectedRoot of [W1_PACKAGE, CHARACTER, CONTINUITY, SPLIT]) {
    const path = relative(resolve(protectedRoot), output);
    assert.ok(path.startsWith('..') && path !== '.', 'write only outside preserved evidence');
  }
  const splitPath = `${SPLIT}/results/analysis.json.gz`, continuityPath = `${CONTINUITY}/results/analysis.json.gz`;
  const oldSplit = await readGz(splitPath), oldContinuity = await readGz(continuityPath);
  const comparison = await readGz(`${W1_PACKAGE}/inputs/baselines/local-accretion-analysis.json.gz`);
  const adapter = await loadCandidateAnalyzer(), seeds = [], priorRandom = Math.random;
  Math.random = () => { throw new Error('read-only per-cell audit must not consume RNG'); };
  try {
    for (const seed of SEEDS) {
      const input = await loadSeedInputs(seed, W1_PACKAGE), archived = oldSplit.seeds.find(s => s.seed === seed);
      const comparisonSeed = comparison.seeds.find(s => s.seed === seed), continuitySeed = oldContinuity.seeds.find(s => s.seed === seed);
      assert.deepEqual(analyzeSeed(input, comparisonSeed), archived.baseline, 'complete archived baseline geometry/closure/character');
      assert.deepEqual(adapter.analyzeSeed(input, comparisonSeed), archived.candidate, 'complete archived candidate geometry/closure/character');
      const baseline = auditCondition({ condition: 'baseline', input, reference: archived.baseline, continuitySeed });
      const candidate = auditCondition({ condition: 'candidate', input, reference: archived.candidate, continuitySeed,
        identityFrames: archived.matched.identityFrames });
      const row = { seed, inputProvenance: archived.candidate.inputProvenance, baseline, candidate };
      finite(row); seeds.push(row);
      process.stdout.write(JSON.stringify({ seed, candidateFinal: candidate.dominantSnapshots.at(-1).summary,
        representativeIds: candidate.representativeIds }) + '\n');
    }
  } finally { Math.random = priorRandom; }
  const sourcePaths = ['scripts/ant-w1-cell-history.js', 'scripts/ant-w1-cell-history-analysis.js',
    'scripts/ant-w1-crystallization.js', 'scripts/ant-w1-max-overlap-crystallization.js',
    'scripts/ant-w1-analysis.js', 'scripts/ant-w1-character.js', 'scripts/ant-w1-inputs.js'];
  const sourceSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, sha(await readFile(path))])));
  const sourceEvidenceSha256 = Object.fromEntries(await Promise.all([splitPath, continuityPath,
    `${CHARACTER}/results/analysis.json.gz`].map(async path => [path, sha(await readFile(path))])));
  const rows = seeds.flatMap(s => ['baseline', 'candidate'].flatMap(condition => [
    ...s[condition].dominantSnapshots.map(view => ({ seed: s.seed, condition, selection: 'fixed-canonical-ID-0', ...view })),
    ...s[condition].frozenEpisodes.map(view => ({ seed: s.seed, condition, selection: 'retrospective-all-frozen', ...view }))
  ]));
  const summary = { status: 'complete', startingHead: BASE, modelOrder: ['baseline', 'candidate'], seedCount: seeds.length,
    observationsPerSeed: 599, noRandomness: true, readOnlyObserver: true, sourceSha256, sourceEvidenceSha256,
    seeds: seeds.map(s => ({ seed: s.seed, ...Object.fromEntries(['baseline', 'candidate'].map(condition => [condition, {
      parity: s[condition].parity, representativeIds: s[condition].representativeIds,
      milestones: s[condition].dominantSnapshots.map(v => ({ nominalTargetSeconds: v.nominalTargetSeconds,
        actualTimeSeconds: v.cutoffTimeSeconds, ...v.summary })),
      frozenEpisodes: s[condition].frozenEpisodes.map(v => ({ id: v.canonicalId, ...v.episodeMeta, ...v.summary })),
      mergeEventCount: s[condition].mergeEvents.length
    }])) })) };
  const analysis = { schemaVersion: 1, startingHead: BASE, kind: 'read-only per-cell W1 formation-history audit',
    seedOrder: SEEDS, parametersChanged: false, sourceSha256, sourceEvidenceSha256, adapter: adapter.provenance, seeds };
  const cellRows = rows.flatMap(view => view.cells.map(c => ({ seed: view.seed, condition: view.condition, selection: view.selection,
    episodeId: view.canonicalId, cutoffTimeSeconds: view.cutoffTimeSeconds, nominalTargetSeconds: view.nominalTargetSeconds, ...c })));
  const mergeRows = seeds.flatMap(s => ['baseline', 'candidate'].flatMap(condition => s[condition].mergeEvents.map(e => ({ seed: s.seed, condition, ...e }))));
  const summaryRows = rows.map(v => ({ seed: v.seed, condition: v.condition, selection: v.selection,
    episodeId: v.canonicalId, cutoffTimeSeconds: v.cutoffTimeSeconds, nominalTargetSeconds: v.nominalTargetSeconds,
    ...v.episodeMeta, ...v.summary, summary: v.summary }));
  const outputs = {
    'analysis.json.gz': gzipSync(Buffer.from(JSON.stringify(analysis)), { level: 9, mtime: 0 }),
    'cells.csv.gz': gzipSync(Buffer.from(csv(cellRows, Object.keys(cellRows[0]))), { level: 9, mtime: 0 }),
    'merges.csv': Buffer.from(csv(mergeRows, ['seed', 'condition', 'frameIndex', 'timeSeconds', 'targetId', 'sourceId',
      'sourceCellCount', 'targetCellCountBefore', 'transferredCellCount', 'overlapCellCount', 'transferredCellIndices', 'overlapCellIndices'])),
    'episodes.csv': Buffer.from(csv(summaryRows.filter(r => r.selection === 'retrospective-all-frozen'),
      ['seed', 'condition', 'episodeId', 'birthTimeSeconds', 'closeTimeSeconds', 'persistenceSeconds', 'historicalCells',
        'directOnlyCells', 'inheritedOnlyCells', 'overlappingCells', 'directFirstUnionEntryCells', 'mergeFirstUnionEntryCells',
        'currentOwnedActiveCells', 'inactiveHistoricalFraction', 'ownedQFalseActiveFraction', 'cellsWithReactivation', 'character', 'summary'])),
    'milestones.csv': Buffer.from(csv(summaryRows.filter(r => r.selection === 'fixed-canonical-ID-0'),
      ['seed', 'condition', 'episodeId', 'nominalTargetSeconds', 'cutoffTimeSeconds', 'historicalCells',
        'currentOwnedActiveCells', 'directOnlyCells', 'inheritedOnlyCells', 'overlappingCells',
        'directFirstUnionEntryCells', 'mergeFirstUnionEntryCells', 'ownedQFalseActiveFraction', 'summary']))
  };
  summary.outputSha256 = Object.fromEntries(Object.entries(outputs).map(([name, bytes]) => [name, sha(bytes)]));
  outputs['summary.json'] = Buffer.from(JSON.stringify(summary, null, 2) + '\n');
  finite(analysis); finite(summary);
  await mkdir(output, { recursive: true });
  for (const [name, bytes] of Object.entries(outputs)) await writeFile(resolve(output, name), bytes);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
