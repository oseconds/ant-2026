import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createW1CellHistoryObserver } from './ant-w1-cell-history.js';

const BASE = '92ba2117b10bd3f559eca9866602ab8d430a649b';
const OLD = 'docs/ant/evidence/2026-10-08-w1-episodic-material-shadow';
const CHARACTER = 'docs/ant/evidence/2026-10-08-w1-causal-character-attribution';
const CONTINUITY = 'docs/ant/evidence/2026-10-09-w1-continuity-diagnostic';
const MAX_OVERLAP = 'docs/ant/evidence/2026-10-09-w1-max-overlap-split-shadow';
const PACKAGE = 'docs/ant/evidence/2026-10-09-w1-per-cell-formation-history';
const REPRODUCTION = 'test-results/w1-cell-history-reproduction';
const SEEDS = [20261005, 20261006, 20261007];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (args, input) => execFileSync('git.exe', args, { input, maxBuffer: 256 * 1024 * 1024 });
const json = async path => JSON.parse(await readFile(path));
const gzjson = async path => JSON.parse(gunzipSync(await readFile(path)));
const save = async (name, value) => writeFile(`${PACKAGE}/validation/${name}`, JSON.stringify(value, null, 2) + '\n');

async function inventory(root, prefix = '') {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    assert.ok(entry.isDirectory() || entry.isFile(), 'regular evidence files only');
    if (entry.isDirectory()) paths.push(...await inventory(`${root}/${entry.name}`, `${prefix}${entry.name}/`));
    else paths.push(prefix + entry.name);
  }
  return paths.sort();
}

function treePaths(commit, pathspec) {
  return git(['ls-tree', '-rz', '--name-only', commit, '--', pathspec]).toString().split('\0').filter(Boolean).sort();
}

function rawBlobs(commit, paths) {
  const output = git(['cat-file', '--batch'], paths.map(path => `${commit}:${path}`).join('\n') + '\n');
  const result = new Map();
  let offset = 0;
  for (const path of paths) {
    const newline = output.indexOf(10, offset);
    assert.ok(newline > offset, `Git batch header: ${path}`);
    const [gitBlob, type, sizeText] = output.toString('utf8', offset, newline).split(' ');
    const size = Number(sizeText), start = newline + 1, end = start + size;
    assert.equal(type, 'blob', `${path} is a blob`);
    assert.ok(Number.isSafeInteger(size) && size >= 0, `${path} has a valid Git blob size`);
    result.set(path, { bytes: output.subarray(start, end), gitBlob });
    offset = end + 1;
  }
  assert.equal(offset, output.length, 'all Git batch bytes consumed');
  return result;
}

function verifyObserverSelfCheck() {
  const observer = createW1CellHistoryObserver({ width: 2, height: 2, feet: [
    { timeSeconds: 0.5, cellIndex: 2, contactIndex: 0 }
  ] });
  observer.advance({ frameIndex: 0, timeSeconds: 0, flags: [7, 7, 0, 0], operations: [
    { type: 'directAdmission', identityId: 0, cells: [0, 1] }
  ], activeOwners: [{ identityId: 0, cells: [0, 1] }] });
  observer.advance({ frameIndex: 1, timeSeconds: 1, flags: [0, 0, 7, 0], operations: [
    { type: 'directAdmission', identityId: 1, cells: [1, 2] },
    { type: 'merge', targetId: 0, sourceId: 1 }
  ], activeOwners: [{ identityId: 0, cells: [0, 1, 2] }] });
  const merged = observer.snapshot(0);
  assert.deepEqual([merged.directCellCount, merged.inheritedCellCount, merged.overlappingCellCount], [1, 1, 1]);
  assert.equal(merged.historicalCellCount, merged.directCellCount + merged.inheritedCellCount + merged.overlappingCellCount);
  assert.deepEqual(merged.cells.map(row => row.provenanceClass), ['direct', 'overlapping', 'inherited']);
  assert.equal(merged.cells.find(row => row.cellIndex === 2).lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds, 0.5);
  observer.advance({ frameIndex: 2, timeSeconds: 2, flags: [0, 0, 0, 0], operations: [
    { type: 'directAdmission', identityId: 0, cells: [0] }
  ], activeOwners: [{ identityId: 0, cells: [0] }] });
  const final = observer.snapshot(0);
  assert.equal(final.repeatedExistingUnionCellObservations, 1);
  assert.equal(final.cells[0].observationCount, 3);
  assert.equal(final.cells[0].globalQFalseActiveObservations, 2);
  assert.equal(final.cells[0].lastActiveAgeSeconds, 0);
}

function verifySnapshot(snapshot, label) {
  const cellCount = 96 * 96;
  assert.equal(snapshot.historicalCellCount, snapshot.cells.length, `${label} union cell count`);
  assert.equal(snapshot.historicalCellCount, snapshot.historicalCellIndices.length, `${label} historical index count`);
  assert.equal(new Set(snapshot.historicalCellIndices).size, snapshot.historicalCellIndices.length, `${label} unique union`);
  assert.deepEqual(snapshot.cells.map(row => row.cellIndex), snapshot.historicalCellIndices, `${label} sorted rows match union`);
  assert.ok(snapshot.historicalCellIndices.every(cell => Number.isSafeInteger(cell) && cell >= 0 && cell < cellCount),
    `${label} valid union indices`);
  const active = new Set(snapshot.activeCellIndices);
  assert.equal(active.size, snapshot.activeCellIndices.length, `${label} unique active cells`);
  assert.ok(snapshot.activeCellIndices.every(cell => snapshot.historicalCellIndices.includes(cell)), `${label} active subset of union`);
  assert.deepEqual(snapshot.inactiveHistoricalCellIndices,
    snapshot.historicalCellIndices.filter(cell => !active.has(cell)), `${label} inactive historical complement`);
  assert.equal(snapshot.currentActiveCellCount, active.size, `${label} active cell count`);
  const counts = Object.fromEntries(['direct', 'inherited', 'overlapping'].map(kind => [kind,
    snapshot.cells.filter(row => row.provenanceClass === kind).length]));
  assert.deepEqual([snapshot.directCellCount, snapshot.inheritedCellCount, snapshot.overlappingCellCount],
    [counts.direct, counts.inherited, counts.overlapping], `${label} provenance class counts`);
  assert.equal(counts.direct + counts.inherited + counts.overlapping, snapshot.historicalCellCount,
    `${label} disjoint accounting partition`);
  for (const row of snapshot.cells) {
    const rowLabel = `${label} cell ${row.cellIndex}`;
    assert.ok(row.directHere || row.inheritedHere, `${rowLabel} has known origin`);
    assert.equal(row.provenanceClass, row.directHere && row.inheritedHere ? 'overlapping' :
      row.directHere ? 'direct' : 'inherited', `${rowLabel} explicit overlap classification`);
    assert.ok(row.observationCount > 0 && row.canonicalFirstAdmissionFrame <= snapshot.cutoffFrameIndex,
      `${rowLabel} has observable post-admission window`);
    assert.equal(row.observationCount, snapshot.cutoffFrameIndex - row.canonicalFirstAdmissionFrame + 1,
      `${rowLabel} observation denominator`);
    assert.ok(row.chemicalQualifiedObservations >= row.jointQualifiedObservations &&
      row.mechanicalQualifiedObservations >= row.jointQualifiedObservations &&
      row.jointQualifiedObservations <= row.observationCount, `${rowLabel} support numerators`);
    assert.ok(row.globalActiveSampleCount <= row.observationCount, `${rowLabel} active numerator`);
    assert.equal(row.globalQTrueActiveObservations + row.globalQFalseActiveObservations,
      row.globalActiveSampleCount, `${rowLabel} q-active partition`);
    assert.equal(row.globalActiveDuty, row.globalActiveSampleCount / row.observationCount, `${rowLabel} active duty`);
    assert.equal(row.globalActiveSpells, row.globalReactivationCount + Number(row.globalActiveSpells > 0),
      `${rowLabel} global spell/reactivation count`);
    assert.equal(row.episodeOwnedActiveSpells, row.episodeOwnedReactivationCount + Number(row.episodeOwnedActiveSpells > 0),
      `${rowLabel} episode-owned spell/reactivation count`);
    assert.ok(row.episodeOwnedActiveSampleCount <= row.globalActiveSampleCount, `${rowLabel} episode-owned activity is sampled activity`);
    for (const value of [row.globalActiveDuty, row.episodeOwnedActiveDuty])
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${rowLabel} finite duty`);
    if (row.globalLastActiveTimeSeconds === null) assert.equal(row.lastActiveAgeSeconds, null, `${rowLabel} inactive age is null`);
    else {
      assert.ok(row.globalLastActiveTimeSeconds <= snapshot.cutoffTimeSeconds, `${rowLabel} active time is causal`);
      assert.equal(row.lastActiveAgeSeconds, snapshot.cutoffTimeSeconds - row.globalLastActiveTimeSeconds,
        `${rowLabel} last-active age`);
    }
    if (row.episodeOwnedLastActiveTimeSeconds === null)
      assert.equal(row.episodeOwnedLastActiveAgeSeconds, null, `${rowLabel} episode-owned inactive age is null`);
    else assert.equal(row.episodeOwnedLastActiveAgeSeconds,
      snapshot.cutoffTimeSeconds - row.episodeOwnedLastActiveTimeSeconds, `${rowLabel} episode-owned last-active age`);
    assert.equal(row.currentOwnedActive, snapshot.activeCellIndices.includes(row.cellIndex), `${rowLabel} cutoff ownership`);
    assert.ok(row.qAtCutoff === 0 || row.qAtCutoff === 1, `${rowLabel} q bit is binary`);
    const contact = row.lastActualSameCellFootContact;
    if (contact === null) assert.equal(row.lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds, null,
      `${rowLabel} absent prior contact remains null`);
    else {
      assert.ok(contact.timeSeconds <= row.canonicalFirstAdmissionTimeSeconds, `${rowLabel} contact precedes admission`);
      assert.equal(row.lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds,
        row.canonicalFirstAdmissionTimeSeconds - contact.timeSeconds, `${rowLabel} admission contact age`);
    }
  }
}

function verifyMergeEvents(events, label) {
  const seenSources = new Set();
  for (const [index, event] of events.entries()) {
    const eventLabel = `${label} merge ${index}`;
    assert.equal(event.transferredCellCount, event.transferredCellIndices.length, `${eventLabel} transferred cardinality`);
    assert.equal(event.overlapCellCount, event.overlapCellIndices.length, `${eventLabel} overlap cardinality`);
    assert.equal(event.sourceCellCount, event.transferredCellCount + event.overlapCellCount, `${eventLabel} source partition`);
    assert.equal(new Set(event.transferredCellIndices).size, event.transferredCellIndices.length, `${eventLabel} unique transfers`);
    assert.equal(new Set(event.overlapCellIndices).size, event.overlapCellIndices.length, `${eventLabel} unique overlap`);
    assert.ok(event.transferredCellIndices.every(cell => !event.overlapCellIndices.includes(cell)), `${eventLabel} transfer/overlap disjoint`);
    assert.ok([...event.transferredCellIndices, ...event.overlapCellIndices].every(cell =>
      Number.isSafeInteger(cell) && cell >= 0 && cell < 96 * 96), `${eventLabel} valid cell indices`);
    assert.ok(Number.isSafeInteger(event.frameIndex) && Number.isFinite(event.timeSeconds), `${eventLabel} finite frame/time`);
    assert.ok(Number.isSafeInteger(event.targetCellCountBefore) && event.targetCellCountBefore >= 0,
      `${eventLabel} target pre-merge union size`);
    assert.ok(!seenSources.has(event.sourceId), `${eventLabel} source identity transferred at most once`);
    seenSources.add(event.sourceId);
  }
}

function verifySnapshotMergeReferences(snapshot, events, label) {
  assert.ok(!Object.hasOwn(snapshot, 'mergeEvents'), `${label} omits repeated merge-event bodies`);
  const references = snapshot.actualMergeEventSourceIds;
  assert.ok(Array.isArray(references), `${label} stores actual merge source references`);
  assert.equal(new Set(references).size, references.length, `${label} merge references are unique`);
  const cellSources = new Set(snapshot.cells.flatMap(cell => cell.actualMergeSourceIds));
  const expected = events.filter(event => event.timeSeconds <= snapshot.cutoffTimeSeconds && cellSources.has(event.sourceId))
    .map(event => event.sourceId);
  assert.deepEqual(references, expected, `${label} merge references match actual geometry-transfer ledger prefix`);
  for (const sourceId of references) {
    const event = events.find(row => row.sourceId === sourceId);
    assert.ok(event && event.timeSeconds <= snapshot.cutoffTimeSeconds, `${label} merge source ${sourceId} exists by cutoff`);
    assert.ok(snapshot.cells.some(cell => cell.actualMergeSourceIds.includes(sourceId)),
      `${label} merge source ${sourceId} transferred into at least one union cell`);
  }
}

verifyObserverSelfCheck();

// Historical evidence is compared to raw Git objects; checkout line-ending rules do not apply.
const historicalGroups = [
  { name: 'episodicShadow', path: OLD },
  { name: 'causalCharacter', path: CHARACTER },
  { name: 'continuityDiagnostic', path: CONTINUITY },
  { name: 'maxOverlapSplitShadow', path: MAX_OVERLAP }
].map(group => ({ ...group, paths: treePaths(BASE, group.path) }));
for (const group of historicalGroups) assert.ok(group.paths.length > 0, `${group.name} exists at starting HEAD`);
const historicalPaths = [...new Set(historicalGroups.flatMap(group => group.paths))].sort();
const historicalBlobs = rawBlobs(BASE, historicalPaths);
const historicalFiles = [];
for (const path of historicalPaths) {
  const { bytes: original, gitBlob } = historicalBlobs.get(path);
  const current = await readFile(path);
  assert.ok(current.equals(original), `${path} raw historical bytes`);
  historicalFiles.push({ path, bytes: current.length, sha256: sha(current), gitBlob });
}

const originalSources = await json(`${OLD}/validation/protected-source.json`);
const originalHashes = new Map(originalSources.files.map(file => [file.path, file.workingSha256]));
const protectedPaths = new Set(originalHashes.keys());
for (const pathspec of ['scripts', 'tests']) {
  for (const path of treePaths(BASE, pathspec)) {
    if (path.startsWith('scripts/ant-w1-') || path.startsWith('tests/ant-w1-') || path.startsWith('tests/fixtures/'))
      protectedPaths.add(path);
  }
}
const protectedFiles = [];
for (const path of [...protectedPaths].sort()) {
  const current = await readFile(path), gitBlob = git(['rev-parse', `${BASE}:${path}`]).toString().trim();
  const checkout = git(['cat-file', '--filters', `--path=${path}`, `${BASE}:${path}`]);
  const checkoutBytesIdentical = current.equals(checkout);
  const onlyLineEndingDifference = !checkoutBytesIdentical &&
    current.toString('utf8').replaceAll('\r\n', '\n') === checkout.toString('utf8').replaceAll('\r\n', '\n');
  assert.ok(checkoutBytesIdentical || onlyLineEndingDifference, `${path} canonical checkout content`);
  if (originalHashes.has(path)) assert.equal(sha(current), originalHashes.get(path), `${path} original production working SHA`);
  assert.equal(git(['hash-object', `--path=${path}`, '--stdin'], current).toString().trim(), gitBlob,
    `${path} unchanged canonical Git object`);
  protectedFiles.push({ path, bytes: current.length, sha256: sha(current), gitBlob, checkoutBytesIdentical,
    onlyLineEndingDifference, canonicalGitObjectUnchanged: true,
    originalProductionWorkingBytesVerified: originalHashes.has(path) });
}
for (const staged of [false, true]) {
  const args = ['diff', ...(staged ? ['--cached'] : []), '--name-only', '-z', BASE, '--', ...historicalPaths, ...protectedPaths];
  assert.equal(git(args).toString().split('\0').filter(Boolean).length, 0,
    'historical evidence and protected source/tests unchanged in index and worktree');
}
for (const pathspec of ['src', 'static', 'package.json', 'package-lock.json']) {
  for (const cached of [false, true]) {
    const args = ['diff', ...(cached ? ['--cached'] : []), '--name-only', '-z', BASE, '--', pathspec];
    assert.equal(git(args).toString().split('\0').filter(Boolean).length, 0, `${pathspec} production unchanged`);
  }
}

const copies = await json(`${OLD}/validation/baseline-copies.json`);
assert.equal(copies.files.length, 13, '13 source-preserving frozen input copies');
const copiedInputs = [];
for (const row of copies.files) {
  const current = await readFile(row.targetPath);
  const original = git(['cat-file', 'blob', `${row.sourceCommit}:${row.sourcePath}`]);
  assert.equal(sha(current), row.sha256, `${row.targetPath} frozen-copy SHA`);
  assert.ok(current.equals(original), `${row.targetPath} equals source Git bytes`);
  copiedInputs.push({ path: row.targetPath, sourcePath: row.sourcePath, sourceCommit: row.sourceCommit,
    bytes: current.length, sha256: sha(current), copiedGitBytesIdentical: true });
}

const baselineAnalysis = await gzjson(`${CHARACTER}/results/analysis.json.gz`);
const candidateAnalysis = await gzjson(`${MAX_OVERLAP}/results/analysis.json.gz`);
const continuityAnalysis = await gzjson(`${CONTINUITY}/results/analysis.json.gz`);
const analysis = await gzjson(`${PACKAGE}/results/analysis.json.gz`);
const reproducedAnalysis = await gzjson(`${REPRODUCTION}/results/analysis.json.gz`);
const summary = await json(`${PACKAGE}/results/summary.json`);
const reproducedSummary = await json(`${REPRODUCTION}/results/summary.json`);
assert.equal(analysis.startingHead, BASE);
assert.equal(analysis.kind, 'read-only per-cell W1 formation-history audit');
assert.equal(analysis.parametersChanged, false);
assert.equal(summary.startingHead, BASE);
assert.equal(analysis.schemaVersion, 1);
assert.deepEqual(analysis.seedOrder, SEEDS);
assert.equal(summary.status, 'complete');
  assert.deepEqual(analysis, reproducedAnalysis, 'independent process analysis archive deep equality');
assert.deepEqual(summary, reproducedSummary, 'independent process summary deep equality');
assert.equal(analysis.seeds.length, SEEDS.length);

const naturalPaths = {
  socialSummary: seed => `docs/ant/evidence/2026-10-07-social-graph/data/seed${seed}-summary.json`,
  trajectory: seed => `docs/ant/evidence/2026-10-07-social-graph/data/seed${seed}-trajectory.f64.gz`,
  rawContacts: seed => `docs/ant/evidence/2026-10-07-social-graph/data/seed${seed}-on-raw-events.json.gz`
};
const naturalArchives = [];
for (const [index, seed] of analysis.seeds.entries()) {
  assert.equal(seed.seed, SEEDS[index]);
  const oldBaseline = baselineAnalysis.seeds.find(row => row.seed === seed.seed);
  const priorModels = candidateAnalysis.seeds.find(row => row.seed === seed.seed);
  const oldCandidate = priorModels?.candidate;
  const continuitySeed = continuityAnalysis.seeds.find(row => row.seed === seed.seed);
  assert.ok(oldBaseline && oldCandidate && continuitySeed, `frozen W1 comparison archives for ${seed.seed}`);
  assert.deepEqual(seed.inputProvenance, oldCandidate.inputProvenance, `${seed.seed} input provenance unchanged`);
  for (const key of ['socialSummary', 'trajectory', 'rawContacts']) {
    const path = naturalPaths[key](seed.seed), bytes = await readFile(path);
    assert.equal(sha(bytes), oldBaseline.inputProvenance.sourceHashes[key], `${path} original frozen archive SHA`);
    assert.equal(sha(bytes), oldCandidate.inputProvenance.sourceHashes[key], `${path} candidate package source SHA`);
    naturalArchives.push({ path, bytes: bytes.length, sha256: sha(bytes), source: key, seed: seed.seed });
  }
  const references = { baseline: oldBaseline, candidate: oldCandidate };
  for (const modelName of ['baseline', 'candidate']) {
    const model = seed[modelName];
    assert.equal(model.parity.observations, 599, `${seed.seed} ${modelName} full input observation count`);
    for (const key of ['activeMask', 'identity', 'geometry', 'admissions', 'closure', 'character',
      'originalAnalysisDeepEqual', 'sourceHistoryDeepEqual'])
      assert.equal(model.parity[key], true, `${seed.seed} ${modelName} ${key} parity`);
    assert.ok(Array.isArray(model.frameSummaries) && model.frameSummaries.length === 599,
      `${seed.seed} ${modelName} causal frame summaries`);
    const referenceHistory = modelName === 'baseline' ? oldBaseline.history : oldCandidate.history;
    for (const [frameIndex, row] of model.frameSummaries.entries()) {
      const reference = referenceHistory[frameIndex];
      assert.ok(Number.isSafeInteger(row.frameIndex) && row.frameIndex >= 0 && row.frameIndex < 599,
        `${seed.seed} ${modelName} valid causal frame index`);
      assert.equal(row.frameIndex, frameIndex);
      assert.equal(row.timeSeconds, reference.timeSeconds, `${seed.seed} ${modelName} frame time`);
      assert.equal(row.activeCells, reference.activeCells, `${seed.seed} ${modelName} active cell parity`);
    }
    verifyMergeEvents(model.mergeEvents, `${seed.seed} ${modelName}`);
    for (const event of model.mergeEvents)
      assert.equal(event.timeSeconds, model.frameSummaries[event.frameIndex].timeSeconds,
        `${seed.seed} ${modelName} merge time aligns with causal observation`);
    for (const snapshot of [...model.dominantSnapshots, ...model.frozenEpisodes]) {
      verifySnapshot(snapshot, `${seed.seed} ${modelName} snapshot ${snapshot.requestedId}`);
      verifySnapshotMergeReferences(snapshot, model.mergeEvents,
        `${seed.seed} ${modelName} snapshot ${snapshot.requestedId} at ${snapshot.cutoffFrameIndex}`);
    }
    for (const snapshot of model.dominantSnapshots)
      assert.ok(snapshot.componentCellObservations >= snapshot.historicalCellCount &&
        snapshot.repeatedExistingUnionCellObservations <= snapshot.componentCellObservations,
      `${seed.seed} ${modelName} repeated admission counters do not inflate union size`);
    const representative = model.representativeIds;
    assert.ok(Number.isSafeInteger(representative.largestMultiCell) && Number.isSafeInteger(representative.firstOneCell),
      `${seed.seed} ${modelName} representative multi-cell and one-cell episodes`);
    if (representative.zeroConsolidationOneCell !== null)
      assert.ok(Number.isSafeInteger(representative.zeroConsolidationOneCell), `${seed.seed} ${modelName} zero-consolidation ID`);
    const episodesById = new Map(references[modelName].episodes.map(episode => [episode.id, episode]));
    assert.ok(episodesById.get(representative.largestMultiCell)?.cellIndices.length > 1,
      `${seed.seed} ${modelName} representative is multi-cell`);
    assert.equal(episodesById.get(representative.firstOneCell)?.cellIndices.length, 1,
      `${seed.seed} ${modelName} representative is one-cell`);
    if (representative.zeroConsolidationOneCell !== null) {
      const episode = episodesById.get(representative.zeroConsolidationOneCell);
      assert.equal(episode?.cellIndices.length, 1);
      assert.equal(episode?.character.consolidation, 0);
    }
    assert.deepEqual(model.dominantSnapshots.map(view => view.nominalTargetSeconds), [120, 300, 480, 599.25],
      `${seed.seed} ${modelName} fixed ID-0 milestones`);
    for (const view of model.dominantSnapshots) {
      const frameIndex = view.cutoffFrameIndex;
      const nearest = model.frameSummaries.reduce((best, row) =>
        Math.abs(row.timeSeconds - view.nominalTargetSeconds) < Math.abs(model.frameSummaries[best].timeSeconds - view.nominalTargetSeconds) ?
          row.frameIndex : best, 0);
      assert.equal(frameIndex, nearest, `${seed.seed} ${modelName} milestone uses nearest archived observation only`);
      const archivedComponents = modelName === 'baseline' ? continuitySeed.frames[frameIndex].components :
        priorModels.matched.identityFrames[frameIndex].components;
      const archivedActive = archivedComponents.filter(component => component.episodeId === 0)
        .flatMap(component => component.cellIndices).sort((a, b) => a - b);
      assert.deepEqual(view.activeCellIndices, archivedActive,
        `${seed.seed} ${modelName} ID-0 current mask at frame ${frameIndex}`);
      assert.equal(view.cutoffTimeSeconds, model.frameSummaries[frameIndex].timeSeconds,
        `${seed.seed} ${modelName} snapshot uses causal frame ${frameIndex}`);
    }
    const finalUnion = references[modelName].rightCensoredEpisodes.find(episode => episode.id === 0);
    assert.ok(finalUnion, `${seed.seed} ${modelName} final pending ID 0 remains open`);
    assert.deepEqual(model.dominantSnapshots.at(-1).historicalCellIndices, finalUnion.cellIndices,
      `${seed.seed} ${modelName} final ID-0 historical geometry`);
  }
  assert.equal(seed.baseline.frozenEpisodes.length, oldBaseline.episodes.length,
    `${seed.seed} original baseline closures`);
  assert.equal(seed.candidate.frozenEpisodes.length, oldCandidate.episodes.length,
    `${seed.seed} candidate closures`);
  for (const modelName of ['baseline', 'candidate']) {
    const model = seed[modelName], reference = modelName === 'baseline' ? oldBaseline : oldCandidate;
    const byId = new Map(reference.episodes.map(episode => [episode.id, episode]));
    for (const view of model.frozenEpisodes) {
      const episode = byId.get(view.episodeMeta.id);
      assert.ok(episode, `${seed.seed} ${modelName} archived frozen episode ${view.episodeMeta.id}`);
      assert.deepEqual(view.historicalCellIndices, episode.cellIndices,
        `${seed.seed} ${modelName} episode ${episode.id} exact frozen geometry`);
      for (const key of ['status', 'birthTimeSeconds', 'closeTimeSeconds', 'persistenceSeconds', 'ancestryIds', 'character', 'newAreaFraction'])
        assert.deepEqual(view.episodeMeta[key], episode[key], `${seed.seed} ${modelName} episode ${episode.id} ${key}`);
      assert.deepEqual(view.episodeMeta.splitProvenanceIds, episode.splitProvenanceIds ?? [],
        `${seed.seed} ${modelName} episode ${episode.id} split provenance`);
      const admissions = new Map(episode.cellIndices.map((cell, i) => [cell,
        [episode.firstAdmissionFrameByCell[i], episode.firstAdmissionTimeSecondsByCell[i]]]));
      for (const cell of view.cells) {
        const [firstFrame, firstTime] = admissions.get(cell.cellIndex);
        assert.equal(cell.canonicalFirstAdmissionFrame, firstFrame, `${seed.seed} ${modelName} episode ${episode.id} cell ${cell.cellIndex} admission frame`);
        assert.equal(cell.canonicalFirstAdmissionTimeSeconds, firstTime,
          `${seed.seed} ${modelName} episode ${episode.id} cell ${cell.cellIndex} admission time`);
      }
      assert.equal(view.cutoffTimeSeconds, episode.closeTimeSeconds,
        `${seed.seed} ${modelName} frozen episode snapshot is at observed closure`);
    }
  }
}

const comparisons = [];
for (const directory of ['results', 'plots']) {
  const originalNames = await inventory(`${PACKAGE}/${directory}`);
  const reproducedNames = await inventory(`${REPRODUCTION}/${directory}`);
  assert.ok(originalNames.length > 0, `${directory} outputs exist`);
  assert.deepEqual(reproducedNames, originalNames, `${directory} complete output inventory`);
  for (const name of originalNames) {
    const path = `${directory}/${name}`, bytes = await readFile(`${PACKAGE}/${path}`);
    assert.ok(bytes.equals(await readFile(`${REPRODUCTION}/${path}`)), `${path} exact independent-process reproduction`);
    comparisons.push({ path, bytes: bytes.length, sha256: sha(bytes), byteIdentical: true });
  }
}

assert.deepEqual(summary.modelOrder, ['baseline', 'candidate']);
assert.equal(summary.seedCount, SEEDS.length);
assert.equal(summary.observationsPerSeed, 599);
assert.equal(summary.noRandomness, true);
assert.equal(summary.readOnlyObserver, true);
for (const [path, expected] of Object.entries(analysis.sourceSha256))
  assert.equal(sha(await readFile(path)), expected, `${path} analysis source hash`);
for (const [path, expected] of Object.entries(analysis.sourceEvidenceSha256))
  assert.equal(sha(await readFile(path)), expected, `${path} source evidence hash`);
for (const [name, expected] of Object.entries(summary.outputSha256))
  assert.equal(sha(await readFile(`${PACKAGE}/results/${name}`)), expected, `${name} declared output SHA`);
const plotManifest = await json(`${PACKAGE}/plots/plot-manifest.json`);
assert.equal(plotManifest.inputSha256, sha(await readFile(`${PACKAGE}/results/analysis.json.gz`)),
  'plot manifest is derived from the committed analysis archive');
assert.deepEqual(plotManifest.fixedScales, { duty: [0, 1], lastActiveAgeSeconds: [0, 600] },
  'plot scales remain fixed across models and milestones');
assert.deepEqual(plotManifest.worldLimits, [0, 1], 'arena geometry uses fixed full-world limits');
assert.equal(plotManifest.plotterSha256, sha(await readFile('scripts/ant-w1-cell-history-plots.py')),
  'plotter source hash');
for (const [path, expected] of Object.entries(plotManifest.sourceSha256))
  assert.equal(sha(await readFile(path)), expected, `${path} plot source hash`);
for (const [path, expected] of Object.entries(plotManifest.sourceEvidenceSha256))
  assert.equal(sha(await readFile(path)), expected, `${path} plot evidence source hash`);
const plotPaths = (await inventory(`${PACKAGE}/plots`)).filter(path => path !== 'plot-manifest.json');
assert.deepEqual(Object.keys(plotManifest.outputs).sort(), plotPaths,
  'plot manifest lists every plot and no absent output');
for (const path of plotPaths)
  assert.equal(sha(await readFile(`${PACKAGE}/plots/${path}`)), plotManifest.outputs[path], `${path} plot output hash`);

await mkdir(`${PACKAGE}/validation`, { recursive: true });
await save('preservation.json', { startingHead: BASE, historicalPackages: historicalGroups.map(group => ({
  name: group.name, path: group.path, fileCount: group.paths.length, rawGitBytesVerified: true
})), historicalFiles, protectedFiles, productionOriginalFileCount: originalHashes.size,
  productionOriginalWorkingBytesVerified: originalHashes.size, copiedInputs, naturalArchives,
  noHistoricalWrites: true, noProductionChanges: true });
await save('reproduction.json', { status: 'pass', comparisons, byteIdenticalOutputCount: comparisons.length,
  independentAnalysisDeepEqual: true, independentSummaryDeepEqual: true,
  modelParityVerified: true, observationsPerSeed: 599, seeds: SEEDS,
  noNaturalAntRerun: true, noRngUse: true });
process.stdout.write(JSON.stringify({ status: 'pass', historicalFiles: historicalFiles.length,
  protectedFiles: protectedFiles.length, productionOriginalFiles: originalHashes.size,
  copiedInputs: copiedInputs.length, naturalArchives: naturalArchives.length,
  seeds: SEEDS.length, outputFiles: comparisons.length }) + '\n');
