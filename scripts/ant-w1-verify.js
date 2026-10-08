import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createW1Crystallizer } from './ant-w1-crystallization.js';
import { loadSeedInputs } from './ant-w1-inputs.js';
import { W1_PACKAGE, W1_CHARACTER_PACKAGE } from './ant-w1-analysis.js';

const BASE = '225757b18f29c706d84a7e639c63d6a3543644b4';
const STOPPED_HEAD = 'afa1653ed4798c4f1de0df1f46995dabe0af621e';
const FORMATION_SHA256 = 'cee5241d663a509bf51b21533b262fde7447f249d81520375be68bd048cc94bf';
const SEEDS = [20261005, 20261006, 20261007];
const EXPECTED_RESULTS = 'test-results/w1-character-reproduction';
const LOOKBACK_PACKAGE = `${W1_CHARACTER_PACKAGE}/comparisons/20s-lookback`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (args, options = {}) => execFileSync('git', args, { maxBuffer: 128 * 1024 * 1024, ...options });
const json = async path => JSON.parse(await readFile(path));
const save = async (name, value) => {
  const path = `${W1_CHARACTER_PACKAGE}/validation/${name}`;
  await mkdir(`${W1_CHARACTER_PACKAGE}/validation`, { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
};
const source = await json(`${W1_PACKAGE}/validation/protected-source.json`);
assert.equal(source.startingHead, BASE);

const blobIds = git(['rev-parse', ...source.files.flatMap(file => [`HEAD:${file.path}`, `${BASE}:${file.path}`])])
  .toString().trim().split('\n');
const protectedFiles = [];
for (const [index, file] of source.files.entries()) {
  const currentSha256 = sha(await readFile(file.path));
  const headBlob = blobIds[index * 2];
  assert.equal(currentSha256, file.workingSha256, `${file.path} working bytes`);
  assert.equal(headBlob, file.gitBlob, `${file.path} stopped-revision blob`);
  assert.equal(blobIds[index * 2 + 1], file.gitBlob, `${file.path} baseline blob`);
  protectedFiles.push({ path: file.path, currentSha256, gitBlob: headBlob });
}

const copies = await json(`${W1_PACKAGE}/validation/baseline-copies.json`);
for (const file of copies.files) {
  const current = await readFile(file.targetPath);
  assert.equal(sha(current), file.sha256, `${file.targetPath} copied SHA-256`);
  assert.ok(current.equals(git(['cat-file', 'blob', `${file.sourceCommit}:${file.sourcePath}`])),
    `${file.targetPath} original Git bytes`);
}
assert.ok((await readFile('scripts/ant-material-morphology-metrics.js')).equals(
  git(['cat-file', 'blob', `${copies.sourceCommit}:${copies.metricsReuse.source}`])), 'original metric Git bytes');

const oldPackagePaths = git(['ls-tree', '-rz', '--name-only', STOPPED_HEAD, '--', W1_PACKAGE])
  .toString().split('\0').filter(Boolean).sort();
assert.ok(oldPackagePaths.length > 0, 'original W1 package exists at the stopped revision');
const oldPackageBlobs = git(['cat-file', '--batch'], { input: oldPackagePaths.map(path => `${STOPPED_HEAD}:${path}`).join('\n') + '\n' });
let offset = 0;
const originalPackageFiles = [];
for (const path of oldPackagePaths) {
  const newline = oldPackageBlobs.indexOf(10, offset);
  const [objectId, type, sizeText] = oldPackageBlobs.toString('utf8', offset, newline).split(' ');
  const size = Number(sizeText), start = newline + 1, end = start + size;
  assert.equal(type, 'blob', `${path} Git object type`);
  const expected = oldPackageBlobs.subarray(start, end), current = await readFile(path);
  assert.ok(current.equals(expected), `${path} remains byte-identical to the stopped W1 package`);
  originalPackageFiles.push({ path, bytes: size, sha256: sha(current), gitBlob: objectId });
  offset = end + 1;
}
assert.equal(oldPackageBlobs.subarray(offset).length, 0, 'all original package blobs consumed');
assert.equal(git(['diff', '--cached', '--name-only', '-z', STOPPED_HEAD, '--', W1_PACKAGE])
  .toString().split('\0').filter(Boolean).length, 0, 'original W1 package has no staged changes');

const fixturePaths = git(['ls-tree', '-rz', '--name-only', STOPPED_HEAD, '--', 'tests/fixtures'])
  .toString().split('\0').filter(Boolean).sort();
assert.ok(fixturePaths.length > 0, 'test fixture baseline exists');
const fixtureBlobs = git(['cat-file', '--batch'], { input: fixturePaths.map(path => `${STOPPED_HEAD}:${path}`).join('\n') + '\n' });
offset = 0;
for (const path of fixturePaths) {
  const newline = fixtureBlobs.indexOf(10, offset);
  const [objectId, type, sizeText] = fixtureBlobs.toString('utf8', offset, newline).split(' ');
  const size = Number(sizeText), start = newline + 1, end = start + size;
  assert.equal(type, 'blob', `${path} Git object type`);
  const current = await readFile(path);
  assert.equal(objectId, git(['rev-parse', `${STOPPED_HEAD}:${path}`]).toString().trim(), `${path} canonical Git object`);
  assert.ok(current.equals(git(['cat-file', '--filters', `--path=${path}`, `${STOPPED_HEAD}:${path}`])),
    `${path} working bytes match Git's canonical checkout`);
  assert.equal(git(['hash-object', `--path=${path}`, '--stdin'], { input: current }).toString().trim(), objectId,
    `${path} working bytes clean to the stopped revision blob`);
  offset = end + 1;
}
assert.equal(fixtureBlobs.subarray(offset).length, 0, 'all fixture blobs consumed');
assert.equal(git(['diff', '--name-only', '-z', STOPPED_HEAD, '--', 'tests/fixtures'])
  .toString().split('\0').filter(Boolean).length, 0, 'no changed fixture files');
assert.equal(git(['diff', '--cached', '--name-only', '-z', STOPPED_HEAD, '--', 'tests/fixtures'])
  .toString().split('\0').filter(Boolean).length, 0, 'no staged fixture files');
assert.equal(git(['ls-files', '--others', '--exclude-standard', '-z', '--', 'tests/fixtures'])
  .toString().split('\0').filter(Boolean).length, 0, 'no new fixture files');

const changedEvidence = git(['diff', '--name-only', '-z', STOPPED_HEAD, '--', 'docs/ant/evidence'])
  .toString().split('\0').filter(Boolean);
assert.ok(changedEvidence.every(path => path.startsWith(`${W1_CHARACTER_PACKAGE}/`)),
  'tracked evidence changes are limited to the new attribution package');
const stagedEvidence = git(['diff', '--cached', '--name-only', '-z', STOPPED_HEAD, '--', 'docs/ant/evidence'])
  .toString().split('\0').filter(Boolean);
assert.ok(stagedEvidence.every(path => path.startsWith(`${W1_CHARACTER_PACKAGE}/`)),
  'staged evidence changes are limited to the new attribution package');
const untrackedEvidence = git(['ls-files', '--others', '--exclude-standard', '-z', '--', 'docs/ant/evidence'])
  .toString().split('\0').filter(Boolean);
assert.ok(untrackedEvidence.every(path => path.startsWith(`${W1_CHARACTER_PACKAGE}/`)),
  'untracked evidence is limited to the new attribution package');
assert.equal(git(['diff', '--name-only', '-z', BASE, '--', 'src', 'static', 'package.json', 'package-lock.json', 'AGENTS.md'])
  .toString().split('\0').filter(Boolean).length, 0, 'production source and dependency configuration unchanged');
assert.equal(git(['diff', '--cached', '--name-only', '-z', BASE, '--', 'src', 'static', 'package.json', 'package-lock.json', 'AGENTS.md'])
  .toString().split('\0').filter(Boolean).length, 0, 'production source has no staged changes');
assert.equal(git(['ls-files', '--others', '--exclude-standard', '-z', '--', 'src', 'static'])
  .toString().split('\0').filter(Boolean).length, 0, 'no untracked production source');
const formationBytes = await readFile('scripts/ant-w1-crystallization.js');
assert.equal(sha(formationBytes), FORMATION_SHA256, 'exact W1 formation source remains unchanged');
assert.ok(formationBytes.equals(git(['cat-file', 'blob', `${STOPPED_HEAD}:scripts/ant-w1-crystallization.js`])),
  'formation source matches the stopped revision');
await save('preservation.json', { startingHead: BASE, stoppedHead: STOPPED_HEAD,
  protectedFileCount: protectedFiles.length, protectedFiles,
  copiedFileCount: copies.files.length, copiedBytesMatchOriginalGit: true,
  metricBytesMatchOriginalGit: true, originalPackageFileCount: originalPackageFiles.length,
  originalPackageFiles, fixtureFileCount: fixturePaths.length,
  historicalEvidenceUnchanged: true, productionSourceUnchanged: true,
  formationSourceSha256: sha(formationBytes) });

async function directoryFiles(path) {
  return (await readdir(path, { withFileTypes: true })).flatMap(entry => {
    assert.ok(entry.isFile(), `${path}/${entry.name} must be a direct file`);
    return [entry.name];
  }).sort();
}

const comparisons = [];
for (const directory of ['results', 'plots']) {
  const originalNames = await directoryFiles(`${W1_CHARACTER_PACKAGE}/${directory}`);
  const rerunNames = await directoryFiles(`${EXPECTED_RESULTS}/${directory}`);
  assert.deepEqual(rerunNames, originalNames, `${directory} complete rerun file set`);
  for (const name of originalNames) {
    const path = `${directory}/${name}`;
    const original = await readFile(`${W1_CHARACTER_PACKAGE}/${path}`);
    const rerun = await readFile(`${EXPECTED_RESULTS}/${path}`);
    assert.ok(rerun.equals(original), `${path} byte reproduction`);
    comparisons.push({ path, bytes: original.length, sha256: sha(original), identical: true });
  }
}

const analysis = JSON.parse(gunzipSync(await readFile(`${W1_CHARACTER_PACKAGE}/results/analysis.json.gz`)));
const lookbackFiles = ['analysis.json.gz', 'DESIGN.md', 'README-draft.md', 'character-source.js.txt'];
const lookbackBytes = new Map(await Promise.all(lookbackFiles.map(async name =>
  [name, await readFile(`${LOOKBACK_PACKAGE}/${name}`)])));
const lookbackHashes = Object.fromEntries([...lookbackBytes].map(([name, bytes]) =>
  [name, { bytes: bytes.length, sha256: sha(bytes) }]));
const lookbackAnalysis = JSON.parse(gunzipSync(lookbackBytes.get('analysis.json.gz')));
assert.equal(lookbackAnalysis.designSha256, sha(lookbackBytes.get('DESIGN.md')),
  'saved 20-second analysis matches its archived design');
assert.deepEqual(lookbackAnalysis.characterAttribution, { preAdmissionSeconds: 20,
  sameCellActualContactsOnly: true,
  consolidationWindow: 'first cell admission through episode closure, unchanged',
  directionalWindow: 'max(0, first cell admission minus 20 seconds) through episode closure' },
'saved comparator is the exact 20-second directional estimator');
function finite(value, path = 'analysis') {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path} finite number`);
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) finite(child, `${path}.${key}`);
  }
}
finite(analysis);
assert.equal(analysis.schemaVersion, 1);
assert.equal(analysis.formationSourceSha256, FORMATION_SHA256);
assert.deepEqual(analysis.characterAttribution, { directionalWindowStartSeconds: 0,
  sameCellActualContactsOnly: true,
  consolidationWindow: 'first cell admission through episode closure, unchanged',
  directionalWindow: 'recorded run start (0 seconds) through episode closure',
  attributionMeaning: 'cumulative local contact-history nematic order; not an exact decomposition of chemical/mechanical or EMA contributions' },
'revised estimator uses same-cell contacts from recorded run start');
assert.ok(['complete', 'complete-with-character-gaps'].includes(analysis.status));
assert.deepEqual(analysis.seeds.map(seed => seed.seed), SEEDS, 'all three seeds replayed in order');
assert.deepEqual(analysis.inputOnlySeeds, [], 'no seed was reduced to input-only verification');
assert.deepEqual(analysis.deterministicChecks.map(check => check.seed), SEEDS);
assert.ok(analysis.deterministicChecks.every(check => check.identicalReplay &&
  check.replayCoverage === 'complete-horizon' && check.filterBoundsValidated && check.validIndices && check.rngCalls === 0));
for (const seed of analysis.seeds) {
  assert.ok(['complete', 'complete-with-character-gaps'].includes(seed.status));
  assert.equal(seed.inputProvenance.fieldIntervals, 599, `seed ${seed.seed} full horizon metadata`);
  assert.equal(seed.history.length, 599, `seed ${seed.seed} full 599-frame mechanism replay`);
  assert.ok(Math.abs(seed.final.timeSeconds - seed.history.at(-1).timeSeconds) < 1e-9);
  assert.equal(seed.characterStatus.gapCount, seed.dataGaps.length);
  assert.equal(seed.characterStatus.resolvedDirectionalCount + seed.characterStatus.gapCount, seed.episodes.length);
  assert.equal(seed.final.frozenEpisodeCount, seed.episodes.length);
  const episodeIds = new Set(seed.episodes.map(episode => episode.id));
  for (const episode of seed.episodes) {
    assert.equal(episode.status, 'frozen');
    assert.ok(Number.isFinite(episode.character.consolidation));
    if (episode.characterStatus === 'direction-unavailable') {
      assert.equal(episode.character.directionalOrder, null);
      assert.equal(episode.characterGap.code, 'NO_VALID_DIRECTIONAL_TRAVEL');
    } else {
      assert.equal(episode.characterStatus, 'complete');
      assert.ok(Number.isFinite(episode.character.directionalOrder));
    }
  }
  for (const episode of seed.rightCensoredEpisodes) {
    assert.equal(episode.status, 'right-censored', `seed ${seed.seed} right-censored episode stays unfrozen`);
    assert.ok(!episodeIds.has(episode.id), `seed ${seed.seed} right-censored episode is not in frozen output`);
  }
  assert.ok(seed.history.every(row => Object.values(row.stateBounds).every(bounds =>
    bounds.every(value => Number.isFinite(value) && value >= 0 && value <= 1))));
}
assert.equal(analysis.status, analysis.seeds.some(seed => seed.status === 'complete-with-character-gaps')
  ? 'complete-with-character-gaps' : 'complete');

assert.deepEqual(lookbackAnalysis.seeds.map(seed => seed.seed), SEEDS, 'saved 20-second run covers all seeds');
assert.deepEqual(lookbackAnalysis.inputOnlySeeds, [], 'saved 20-second run has no input-only seeds');
const comparisonRows = [];
const episodeFields = ['id', 'parentIds', 'ancestryIds', 'mergeCount', 'splitCount', 'birthTimeSeconds',
  'birthFrameIndex', 'lastActiveTimeSeconds', 'lastActiveFrameIndex', 'closeTimeSeconds',
  'persistenceSeconds', 'activeFrameCount', 'status', 'discardReason', 'cellIndices',
  'firstAdmissionTimeSecondsByCell', 'firstAdmissionFrameByCell', 'durationSeconds', 'occupiedCells',
  'areaFraction', 'newCells', 'overlapCells', 'newAreaFraction', 'priorUnionOverlapFraction', 'metrics'];
const episodeInvariant = episode => ({
  formationAndGeometry: Object.fromEntries(episodeFields.map(key => [key, episode[key]])),
  consolidation: episode.character.consolidation,
  qualificationCounts: { nQualifiedSamples: episode.evidence?.nQualifiedSamples ?? null,
    nObservations: episode.evidence?.nObservations ?? null }
});
const characterCoverage = seed => ({ episodes: seed.episodes.length,
  resolvedDirectional: seed.characterStatus.resolvedDirectionalCount,
  missingDirectional: seed.characterStatus.gapCount,
  gapCodes: seed.dataGaps.reduce((counts, gap) => {
    counts[gap.code] = (counts[gap.code] ?? 0) + 1; return counts;
  }, {}),
  directionalOrder: Object.fromEntries(['count', 'missingCount', 'min', 'max', 'mean', 'median']
    .map(key => [key, seed.character.axes.directionalOrder[key] ?? null])),
  maximumObservedContactLookbackSeconds: Math.max(0, ...seed.episodes
    .map(episode => episode.evidence?.maxPreAdmissionContactSeconds ?? 0)) });
for (let index = 0; index < SEEDS.length; index += 1) {
  const seed = analysis.seeds[index], oldSeed = lookbackAnalysis.seeds[index];
  assert.deepEqual(seed.inputProvenance, oldSeed.inputProvenance, `seed ${seed.seed} archived input hashes`);
  assert.deepEqual(seed.contactCoverage, oldSeed.contactCoverage, `seed ${seed.seed} contact reconstruction`);
  assert.deepEqual(seed.history, oldSeed.history, `seed ${seed.seed} complete formation/state history`);
  assert.deepEqual(seed.final, oldSeed.final, `seed ${seed.seed} terminal geometry metrics`);
  assert.deepEqual(seed.rightCensoredEpisodes, oldSeed.rightCensoredEpisodes,
    `seed ${seed.seed} right-censored lineages remain unchanged`);
  assert.deepEqual(seed.discardedEpisodes, oldSeed.discardedEpisodes,
    `seed ${seed.seed} discarded lineages remain unchanged`);
  assert.deepEqual(seed.character.axes.consolidation, oldSeed.character.axes.consolidation,
    `seed ${seed.seed} consolidation summary remains unchanged`);
  assert.deepEqual(seed.episodes.map(episode => episode.id), oldSeed.episodes.map(episode => episode.id),
    `seed ${seed.seed} frozen episode identities`);
  for (let episodeIndex = 0; episodeIndex < seed.episodes.length; episodeIndex += 1) {
    assert.deepEqual(episodeInvariant(seed.episodes[episodeIndex]), episodeInvariant(oldSeed.episodes[episodeIndex]),
      `seed ${seed.seed} episode ${seed.episodes[episodeIndex].id} formation, metrics, novelty and consolidation`);
  }
  comparisonRows.push({ seed: seed.seed,
    invariantFrozenEpisodes: seed.episodes.length,
    rightCensoredUnchanged: seed.rightCensoredEpisodes.length,
    discardedUnchanged: seed.discardedEpisodes.length,
    twentySecondCharacter: characterCoverage(oldSeed),
    runStartCharacter: characterCoverage(seed) });
}
assert.deepEqual(analysis.baselineMilestones, lookbackAnalysis.baselineMilestones,
  'historical formation baseline remains unchanged');
for (const name of lookbackFiles) {
  assert.ok((await readFile(`${LOOKBACK_PACKAGE}/${name}`)).equals(lookbackBytes.get(name)),
    `saved 20-second comparison remains byte-identical: ${name}`);
}

const oldAnalysis = JSON.parse(gunzipSync(await readFile(`${W1_PACKAGE}/results/analysis.json.gz`)));
const stopped = oldAnalysis.seeds.find(seed => seed.seed === 20261005);
const current = analysis.seeds.find(seed => seed.seed === 20261005);
assert.equal(stopped.status, 'stopped-data-gap');
assert.equal(stopped.final.timeSeconds, stopped.dataGap.timeSeconds);
assert.equal(stopped.history.length, 83);
assert.deepEqual(current.inputProvenance.sourceHashes, stopped.inputProvenance.sourceHashes,
  'prefix uses identical archived inputs');

const prefixInput = await loadSeedInputs(20261005, W1_PACKAGE);
const prefixModel = createW1Crystallizer({ width: 96, height: 96 });
let independentlyClosed = [];
for (let index = 0; index < stopped.history.length; index += 1) {
  const frame = prefixInput.fieldMetadata.frames[index];
  const step = prefixModel.advance({ timeSeconds: frame.timeSeconds,
    flags: prefixInput.flags.subarray(index * 96 * 96, (index + 1) * 96 * 96) });
  const oldRow = stopped.history[index], newRow = current.history[index];
  assert.equal(oldRow.timeSeconds, newRow.timeSeconds, `prefix frame ${index} time`);
  for (const key of ['tick', 'pendingCells', 'pendingCellDelta', 'activeCells', 'activeComponents',
    'openEpisodes', 'discardedEpisodeCount', 'productionCells', 'localAccretionCells']) {
    assert.equal(oldRow[key], newRow[key], `prefix frame ${index} ${key}`);
  }
  assert.deepEqual(oldRow.stateBounds, newRow.stateBounds, `prefix frame ${index} state bounds`);
  const snapshot = prefixModel.getSnapshot();
  assert.equal(snapshot.activeCellCount, oldRow.activeCells, `independent prefix frame ${index} active cells`);
  assert.equal(snapshot.activeComponentCount, oldRow.activeComponents, `independent prefix frame ${index} active components`);
  assert.equal(prefixModel.getOpenEpisodes().length, oldRow.openEpisodes, `independent prefix frame ${index} open episodes`);
  assert.equal(prefixModel.getDiscardedEpisodes().length, oldRow.discardedEpisodeCount,
    `independent prefix frame ${index} discarded episodes`);
  if (index < stopped.history.length - 1) {
    for (const key of ['frozenCells', 'newFrozenCells', 'frozenEpisodeCount']) {
      assert.equal(oldRow[key], newRow[key], `prefix frame ${index} ${key}`);
    }
  }
  if (index === stopped.history.length - 1) independentlyClosed = step.closedEpisodes;
}
const stoppedEpisode = stopped.dataGap.episode;
const formationFields = ['id', 'parentIds', 'ancestryIds', 'mergeCount', 'splitCount', 'birthTimeSeconds',
  'birthFrameIndex', 'lastActiveTimeSeconds', 'lastActiveFrameIndex', 'closeTimeSeconds',
  'persistenceSeconds', 'activeFrameCount', 'discardReason', 'cellIndices',
  'firstAdmissionTimeSecondsByCell', 'firstAdmissionFrameByCell'];
const sameFormation = episode => Object.fromEntries(formationFields.map(key => [key, episode[key]]));
const replayedStoppedEpisode = independentlyClosed.find(episode => episode.id === stoppedEpisode.id);
const currentStoppedEpisode = current.episodes.find(episode => episode.id === stoppedEpisode.id);
assert.ok(replayedStoppedEpisode, 'independent crystallizer replay closes original gap episode');
assert.ok(currentStoppedEpisode, 'full analysis retains original prefix episode');
assert.deepEqual(sameFormation(replayedStoppedEpisode), sameFormation(stoppedEpisode),
  'stopped episode ID, closure, admission frames and cell union match independent formation replay');
assert.deepEqual(sameFormation(currentStoppedEpisode), sameFormation(stoppedEpisode),
  'full analysis preserves stopped episode formation');

await save('window-comparison.json', { priorWindow: '20-second pre-admission through closure',
  revisedWindow: 'recorded run start (0 seconds) through closure',
  preservedTwentySecondFiles: lookbackHashes, perSeed: comparisonRows,
  historyAndTerminalGeometryIdentical: true, frozenEpisodeFormationMetricsNoveltyAndConsolidationIdentical: true,
  rightCensoredAndDiscardedLineagesIdentical: true, inputAndContactCoverageIdentical: true });
await save('reproduction.json', { status: analysis.status, seedCount: analysis.seeds.length,
  fullHorizonFramesPerSeed: 599, seeds: analysis.seeds.map(seed => ({ seed: seed.seed, status: seed.status,
    frames: seed.history.length, lastTimeSeconds: seed.final.timeSeconds,
    episodes: seed.episodes.length, characterGaps: seed.dataGaps.length,
    rightCensoredUnfrozen: seed.rightCensoredEpisodes.length })),
  identicalOutputFiles: comparisons.length, comparisons, finiteNumericAnalysis: true,
  noInputOnlySeeds: true, deterministicReplayAndZeroRng: true, prefixStateMatchThroughStoppedFrame: true,
  independentlyReplayedStoppedEpisodeId: stoppedEpisode.id, noNaturalAntRerun: true });
process.stdout.write(JSON.stringify({ protectedFiles: protectedFiles.length, copiedFiles: copies.files.length,
  oldPackageFiles: originalPackageFiles.length, byteIdenticalOutputs: comparisons.length,
  seeds: analysis.seeds.map(seed => ({ seed: seed.seed, status: seed.status, frames: seed.history.length })),
  status: analysis.status }) + '\n');
