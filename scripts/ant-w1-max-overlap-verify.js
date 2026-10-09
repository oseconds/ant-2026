import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const BASE = '73dac81d29231c40bc5dfecb1cd3f8ff34fc81e8';
const OLD = 'docs/ant/evidence/2026-10-08-w1-episodic-material-shadow';
const CHARACTER = 'docs/ant/evidence/2026-10-08-w1-causal-character-attribution';
const CONTINUITY = 'docs/ant/evidence/2026-10-09-w1-continuity-diagnostic';
const PACKAGE = 'docs/ant/evidence/2026-10-09-w1-max-overlap-split-shadow';
const REPRODUCTION = 'test-results/w1-max-overlap-reproduction';
const SEEDS = [20261005, 20261006, 20261007];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (args, input) => execFileSync('git', args, { input, maxBuffer: 256 * 1024 * 1024 });
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
    assert.ok(Number.isSafeInteger(size) && size >= 0, `${path} has a valid blob size`);
    result.set(path, { bytes: output.subarray(start, end), gitBlob });
    offset = end + 1;
  }
  assert.equal(offset, output.length, 'all Git batch bytes consumed');
  return result;
}

function finite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), 'finite numerical output');
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}

// Historical evidence comparison uses raw objects; checkout filters apply only to protected source files.
const historicalGroups = [
  { name: 'episodicShadow', paths: treePaths(BASE, OLD), expected: 49 },
  { name: 'causalCharacter', paths: treePaths(BASE, CHARACTER), expected: 48 },
  { name: 'continuityDiagnostic', paths: treePaths(BASE, CONTINUITY) }
];
for (const group of historicalGroups) {
  if (group.expected !== undefined) assert.equal(group.paths.length, group.expected, `${group.name} complete file inventory`);
  else assert.ok(group.paths.length > 0, 'continuity package exists in starting commit');
}
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
    if (path.startsWith('scripts/ant-w1-') || path.startsWith('tests/ant-w1-') || path.startsWith('tests/fixtures/')) protectedPaths.add(path);
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
  if (originalHashes.has(path)) assert.equal(sha(current), originalHashes.get(path), `${path} production bytes match original working SHA`);
  assert.equal(git(['hash-object', `--path=${path}`, '--stdin'], current).toString().trim(), gitBlob,
    `${path} unchanged canonical Git object`);
  protectedFiles.push({ path, bytes: current.length, sha256: sha(current), gitBlob,
    checkoutBytesIdentical, onlyLineEndingDifference, canonicalGitObjectUnchanged: true,
    originalProductionWorkingBytesVerified: originalHashes.has(path) });
}
for (const staged of [false, true]) {
  const args = ['diff', ...(staged ? ['--cached'] : []), '--name-only', '-z', BASE, '--', ...historicalPaths, ...protectedPaths];
  assert.equal(git(args).toString().split('\0').filter(Boolean).length, 0, 'no protected working or staged changes');
}

const copies = await json(`${OLD}/validation/baseline-copies.json`);
assert.equal(copies.files.length, 13, 'all 13 source-preserving copied inputs');
const copiedInputs = [];
for (const row of copies.files) {
  const current = await readFile(row.targetPath);
  const original = git(['cat-file', 'blob', `${row.sourceCommit}:${row.sourcePath}`]);
  assert.equal(sha(current), row.sha256, `${row.targetPath} frozen-copy SHA`);
  assert.ok(current.equals(original), `${row.targetPath} copied Git bytes equal source`);
  copiedInputs.push({ path: row.targetPath, sourcePath: row.sourcePath, sourceCommit: row.sourceCommit,
    bytes: current.length, sha256: sha(current), copiedGitBytesIdentical: true });
}

const baselineAnalysis = await gzjson(`${CHARACTER}/results/analysis.json.gz`);
const resultPath = `${PACKAGE}/results/analysis.json.gz`;
const analysis = await gzjson(resultPath);
const reproducedAnalysis = await gzjson(`${REPRODUCTION}/results/analysis.json.gz`);
const summary = await json(`${PACKAGE}/results/summary.json`);
assert.equal(analysis.startingHead, BASE);
assert.equal(summary.startingHead, BASE);
assert.deepEqual(analysis.seeds.map(seed => seed.seed), SEEDS);
assert.equal(summary.status, 'complete');
for (const seed of analysis.seeds) {
  const reproduced = reproducedAnalysis.seeds.find(row => row.seed === seed.seed);
  assert.ok(reproduced, `independent reproduction seed ${seed.seed}`);
  assert.deepEqual(seed.matched.identityFrames, reproduced.matched.identityFrames,
    `independent archived identity diagnostics ${seed.seed}`);
}
const naturalPaths = {
  socialSummary: seed => `docs/ant/evidence/2026-10-07-social-graph/data/seed${seed}-summary.json`,
  trajectory: seed => `docs/ant/evidence/2026-10-07-social-graph/data/seed${seed}-trajectory.f64.gz`,
  rawContacts: seed => `docs/ant/evidence/2026-10-07-social-graph/data/seed${seed}-on-raw-events.json.gz`
};
const naturalArchives = [];
let matchedFrameCount = 0;
for (const seed of analysis.seeds) {
  const seedId = seed.seed;
  assert.equal(seedId, SEEDS[analysis.seeds.indexOf(seed)]);
  const oldSeed = baselineAnalysis.seeds.find(row => row.seed === seedId);
  assert.ok(oldSeed, `committed causal character seed ${seedId}`);
  assert.deepEqual(seed.baseline, oldSeed, `unchanged analyzeSeed baseline ${seedId} deep-equals committed result`);
  assert.equal(seed.baseline.inputProvenance.sourceHashes.socialSummary, oldSeed.inputProvenance.sourceHashes.socialSummary);
  for (const key of ['socialSummary', 'trajectory', 'rawContacts']) {
    const path = naturalPaths[key](seedId), bytes = await readFile(path);
    assert.equal(sha(bytes), oldSeed.inputProvenance.sourceHashes[key], `${path} natural archive source SHA`);
    naturalArchives.push({ path, bytes: bytes.length, sha256: sha(bytes), source: key, seed: seedId });
  }
  assert.equal(seed.matched.frames.length, 599);
  assert.equal(seed.matched.identityFrames.length, 599);
  assert.equal(seed.matched.parity.observations, 599);
  for (const key of ['activeMask', 'qInput', 'emaBounds', 'components', 'candidateAnalysisGeometry', 'oneCurrentComponentPerLiveIdentity']) {
    assert.equal(seed.matched.parity[key], true, `${key} parity for ${seedId}`);
  }
  for (const [index, frame] of seed.matched.frames.entries()) {
    const original = oldSeed.history[index];
    const identity = seed.matched.identityFrames[index];
    assert.equal(frame.frameIndex, index);
    assert.equal(frame.timeSeconds, original.timeSeconds);
    assert.equal(frame.activeCells, original.activeCells, 'active-cell count matches committed baseline history');
    assert.equal(frame.activeComponents, original.activeComponents, 'active-component count matches committed baseline history');
    for (const history of [seed.baseline.history[index], seed.candidate.history[index]]) {
      assert.equal(history.timeSeconds, original.timeSeconds);
      assert.equal(history.activeCells, original.activeCells);
      assert.deepEqual(history.stateBounds, original.stateBounds, '20/90 s EMA bounds match the frozen baseline');
      for (const bounds of Object.values(history.stateBounds)) {
        assert.equal(bounds.length, 2);
        assert.ok(bounds.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
      }
    }
    assert.equal(identity.frameIndex, index);
    assert.equal(identity.activeEntityCount, identity.components.length, 'candidate has one entity per current component');
    assert.equal(identity.activeEntityCount, frame.activeComponents);
    const ids = new Set();
    for (const component of identity.components) {
      assert.ok(Number.isSafeInteger(component.episodeId) && component.episodeId >= 0);
      assert.ok(!ids.has(component.episodeId), 'one current component per live canonical identity');
      ids.add(component.episodeId);
      assert.ok(Array.isArray(component.cellIndices) && component.cellIndices.length > 0);
      for (const cell of component.cellIndices) assert.ok(Number.isSafeInteger(cell) && cell >= 0 && cell < 96 * 96);
    }
    matchedFrameCount += 1;
  }
  const resolvedCharacters = seed.candidate.episodes.filter(episode => Number.isFinite(episode.character.directionalOrder));
  const unresolvedCharacters = seed.candidate.episodes.filter(episode => !Number.isFinite(episode.character.directionalOrder));
  assert.equal(seed.candidate.characterStatus.gapCount, unresolvedCharacters.length);
  assert.equal(seed.candidate.characterStatus.resolvedDirectionalCount, resolvedCharacters.length);
  assert.equal(seed.candidate.dataGaps.length, unresolvedCharacters.length);
  assert.equal(seed.candidate.characterStatus.status,
    unresolvedCharacters.length ? 'directional-coverage-incomplete' : 'complete');
  for (const episode of seed.candidate.episodes) {
    assert.equal(episode.characterSource.directionalOrder.name, 'cumulative-same-cell-foot-contact-nematic-order');
    assert.match(episode.characterSource.directionalOrder.limitation, /stale or reused/);
    for (const value of Object.values(episode.character)) if (value !== null && value !== undefined) {
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, 'character values are finite and bounded');
    }
    if (!Number.isFinite(episode.character.directionalOrder)) {
      assert.equal(episode.characterStatus, 'direction-unavailable');
      assert.ok(episode.characterGap?.code, 'unavailable character has a typed gap');
    } else assert.equal(episode.characterStatus, 'complete');
  }
}
assert.equal(matchedFrameCount, 1797);
finite(analysis); finite(summary);
for (const [path, expected] of Object.entries(summary.sourceSha256)) assert.equal(sha(await readFile(path)), expected, `${path} source SHA`);
for (const [name, expected] of Object.entries(summary.outputSha256)) assert.equal(sha(await readFile(`${PACKAGE}/results/${name}`)), expected, `${name} output SHA`);

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

// Audit canonical ID 0 from the stored post-frame identity snapshots only.
// This checks continuity of the selected final owner; it never reselects the dominant lineage per frame.
const expectedCore = new Map([[20261005, { directMergeFrames: 398, absorbedSources: 794, largerOtherParentEvents: 1 }],
  [20261006, { directMergeFrames: 416, absorbedSources: 840, largerOtherParentEvents: 1 }],
  [20261007, { directMergeFrames: 396, absorbedSources: 817, largerOtherParentEvents: 2 }]]);
const coreAuditSeeds = analysis.seeds.map(seed => {
  const targetEpisodeId = 0;
  const frames = seed.matched.identityFrames;
  const owningFrames = [];
  const directMergeEvents = [];
  for (const frame of frames) {
    const owners = frame.components.filter(component => component.episodeId === targetEpisodeId);
    assert.ok(owners.length <= 1, `seed ${seed.seed} frame ${frame.frameIndex} has at most one ID-0 owner`);
    if (!owners.length) continue;
    const component = owners[0];
    owningFrames.push(frame.frameIndex);
    if (component.absorbedParentIds.length === 0) continue;
    const routedIncoming = component.sourceParentIds.map(parentId => {
      const edge = frame.overlapEdges.find(row => row.currentComponentLabel === component.componentLabel &&
        row.preFrameParentId === parentId && row.winner);
      assert.ok(edge && Number.isSafeInteger(edge.overlapCount) && edge.overlapCount > 0,
        `seed ${seed.seed} frame ${frame.frameIndex} routed overlap for parent ${parentId}`);
      return { parentId, exactOverlapCells: edge.overlapCount };
    });
    assert.ok(routedIncoming.some(row => row.parentId === targetEpisodeId), 'ID 0 is a routed parent at its merge');
    const targetOverlapCells = routedIncoming.find(row => row.parentId === targetEpisodeId).exactOverlapCells;
    const larger = routedIncoming.filter(row => row.parentId !== targetEpisodeId && row.exactOverlapCells > targetOverlapCells)
      .sort((a, b) => b.exactOverlapCells - a.exactOverlapCells || a.parentId - b.parentId);
    directMergeEvents.push({ frameIndex: frame.frameIndex, timeSeconds: frame.timeSeconds,
      targetEpisodeId, componentLabel: component.componentLabel,
      absorbedSourceIds: [...component.absorbedParentIds], routedIncoming,
      targetOverlapCells, targetOverlapSmallerThanAnotherParent: larger.length > 0,
      largerParentWitness: larger[0] ?? null });
  }
  const firstOwnedFrame = owningFrames[0];
  assert.ok(Number.isSafeInteger(firstOwnedFrame), `seed ${seed.seed} has archived ID-0 ownership`);
  const ownershipSpan = frames.length - firstOwnedFrame;
  const ownedFromBirth = owningFrames.filter(frameIndex => frameIndex >= firstOwnedFrame).length;
  const absentFromBirth = ownershipSpan - ownedFromBirth;
  assert.equal(ownedFromBirth + absentFromBirth, ownershipSpan, `seed ${seed.seed} ownership observations account for every frame`);
  const absorbedSourceIds = directMergeEvents.flatMap(event => event.absorbedSourceIds);
  const largerOtherParentWitnesses = directMergeEvents.filter(event => event.targetOverlapSmallerThanAnotherParent);
  const expected = expectedCore.get(seed.seed);
  assert.equal(directMergeEvents.length, expected.directMergeFrames, `seed ${seed.seed} ID-0 direct merge frames`);
  assert.equal(absorbedSourceIds.length, expected.absorbedSources, `seed ${seed.seed} absorbed IDs`);
  assert.equal(largerOtherParentWitnesses.length, expected.largerOtherParentEvents,
    `seed ${seed.seed} smaller target-overlap witnesses`);
  return { seed: seed.seed, targetEpisodeId, source: 'candidate.matched.identityFrames',
    frameCount: frames.length, firstOwnedFrameIndex: firstOwnedFrame,
    firstOwnedTimeSeconds: frames[firstOwnedFrame].timeSeconds,
    ownedFramesFromBirthThroughLastObservation: ownedFromBirth,
    absentFramesBeforeBirth: firstOwnedFrame,
    absentFramesFromBirthThroughLastObservation: absentFromBirth,
    directMergeFrameCount: directMergeEvents.length,
    absorbedSourceIdCount: absorbedSourceIds.length,
    absorbedSourceIds: [...absorbedSourceIds].sort((a, b) => a - b),
    targetOverlapSmallerThanAnotherParentEventCount: largerOtherParentWitnesses.length,
    firstFiveDirectMergeEvents: directMergeEvents.slice(0, 5),
    largerOtherParentWitnesses,
    directMergeEvents };
});
await mkdir(`${PACKAGE}/validation`, { recursive: true });
await save('merge-core-audit.json', { method: 'Fixed final dominant canonical ID 0 per seed, as specified for this audit. Read each archived candidate identityFrames post-frame snapshot. Ownership uses component.episodeId; direct merge frames require absorbedParentIds. Routed exact overlap comes from winner overlapEdges into that same currentComponentLabel. No per-frame largest-lineage reselection.',
  independentReproductionIdentityFramesDeepEqual: true, seeds: coreAuditSeeds });

await save('preservation.json', { startingHead: BASE, historicalPackages: historicalGroups.map(group => ({
  name: group.name, fileCount: group.paths.length, rawGitBytesVerified: true
})), historicalFiles, protectedFiles, productionOriginalFileCount: originalHashes.size,
  productionOriginalWorkingBytesVerified: originalHashes.size, copiedInputs, naturalArchives,
  noHistoricalWrites: true, noProductionChanges: true });
await save('reproduction.json', { status: 'pass', comparisons, byteIdenticalOutputCount: comparisons.length,
  originalBaselineSeedDeepEqualCount: SEEDS.length, matchedFrameCount, activeMaskAndQInputParity: true,
  emaBoundsAndComponentCountParity: true, candidateOneCurrentComponentPerLiveIdentity: true,
  validCellIndicesAndFiniteBoundedCharacters: true, characterGapsAccuratelyRepresented: true,
  noNaturalAntRerun: true, seeds: SEEDS });
process.stdout.write(JSON.stringify({ status: 'pass', historicalFiles: historicalFiles.length,
  protectedFiles: protectedFiles.length, productionOriginalFiles: originalHashes.size,
  copiedInputs: copiedInputs.length, naturalArchives: naturalArchives.length,
  matchedFrames: matchedFrameCount, byteIdenticalOutputs: comparisons.length }) + '\n');
