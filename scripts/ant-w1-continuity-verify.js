import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const BASE = 'f1068204968cdbf0da4188ad9e10df51a5cce43c';
const OLD = 'docs/ant/evidence/2026-10-08-w1-episodic-material-shadow';
const CHARACTER = 'docs/ant/evidence/2026-10-08-w1-causal-character-attribution';
const PACKAGE = 'docs/ant/evidence/2026-10-09-w1-continuity-diagnostic';
const REPRODUCTION = 'test-results/w1-continuity-reproduction';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (args, input) => execFileSync('git', args, { input, maxBuffer: 128 * 1024 * 1024 });
const json = async path => JSON.parse(await readFile(path));
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

// Existing evidence packages disable normalization; compare their raw Git bytes.
const historicalPaths = git(['ls-tree', '-rz', '--name-only', BASE, '--', OLD, CHARACTER])
  .toString().split('\0').filter(Boolean).sort();
assert.equal(historicalPaths.length, 97, 'complete 49 + 48 file historical packages');
const batch = git(['cat-file', '--batch'], historicalPaths.map(path => `${BASE}:${path}`).join('\n') + '\n');
const historicalFiles = [];
let offset = 0;
for (const path of historicalPaths) {
  const newline = batch.indexOf(10, offset);
  assert.ok(newline > offset, 'Git batch header');
  const [gitBlob, type, sizeText] = batch.toString('utf8', offset, newline).split(' ');
  const size = Number(sizeText), start = newline + 1, end = start + size;
  assert.equal(type, 'blob'); assert.ok(Number.isSafeInteger(size) && size >= 0);
  const current = await readFile(path);
  assert.ok(current.equals(batch.subarray(start, end)), `${path} historical working bytes`);
  historicalFiles.push({ path, bytes: size, sha256: sha(current), gitBlob });
  offset = end + 1;
}
assert.equal(offset, batch.length, 'all historical batch bytes consumed');

const protectedSource = await json(`${OLD}/validation/protected-source.json`);
const originalWorkingHashes = new Map(protectedSource.files.map(file => [file.path, file.workingSha256]));
const sourcePaths = new Set(protectedSource.files.map(file => file.path));
for (const path of git(['ls-tree', '-rz', '--name-only', BASE, '--', 'scripts', 'tests'])
  .toString().split('\0').filter(path => path.startsWith('scripts/ant-w1-') ||
    path.startsWith('tests/ant-w1-') || path.startsWith('tests/fixtures/'))) sourcePaths.add(path);
const protectedFiles = [];
for (const path of [...sourcePaths].sort()) {
  const current = await readFile(path), gitBlob = git(['rev-parse', `${BASE}:${path}`]).toString().trim();
  const checkout = git(['cat-file', '--filters', `--path=${path}`, `${BASE}:${path}`]);
  const checkoutBytesIdentical = current.equals(checkout);
  const onlyLineEndingDifference = !checkoutBytesIdentical &&
    current.toString('utf8').replaceAll('\r\n', '\n') === checkout.toString('utf8').replaceAll('\r\n', '\n');
  assert.ok(checkoutBytesIdentical || onlyLineEndingDifference, `${path} canonical checkout content`);
  if (originalWorkingHashes.has(path)) assert.equal(sha(current), originalWorkingHashes.get(path), `${path} original production bytes`);
  assert.equal(git(['hash-object', `--path=${path}`, '--stdin'], current).toString().trim(), gitBlob,
    `${path} unchanged clean Git object`);
  protectedFiles.push({ path, bytes: current.length, sha256: sha(current), gitBlob,
    checkoutBytesIdentical, onlyLineEndingDifference, canonicalGitObjectUnchanged: true,
    originalWorkingBytesVerified: originalWorkingHashes.has(path) });
}
for (const staged of [false, true]) {
  const args = ['diff', ...(staged ? ['--cached'] : []), '--name-only', '-z', BASE, '--',
    ...historicalPaths, ...sourcePaths];
  assert.equal(git(args).toString().split('\0').filter(Boolean).length, 0, 'no protected working/staged changes');
}

const copies = await json(`${OLD}/validation/baseline-copies.json`);
for (const row of copies.files) {
  const current = await readFile(row.targetPath);
  assert.equal(sha(current), row.sha256, `${row.targetPath} frozen copied input`);
  assert.ok(current.equals(git(['cat-file', 'blob', `${row.sourceCommit}:${row.sourcePath}`])), 'original input Git bytes');
}
const diagnostic = JSON.parse(gunzipSync(await readFile(`${PACKAGE}/results/analysis.json.gz`)));
const summary = await json(`${PACKAGE}/results/summary.json`);
assert.equal(summary.status, 'complete');
assert.deepEqual(diagnostic.seeds.map(seed => seed.seed), [20261005, 20261006, 20261007]);
const baseline = JSON.parse(gunzipSync(await readFile(`${CHARACTER}/results/analysis.json.gz`)));
const naturalArchives = [];
for (const seed of diagnostic.seeds) {
  assert.equal(seed.frames.length, 599);
  for (const key of ['activeMaskAndComponents', 'openAdmissionsAncestryMergeSplit', 'closureDiscardGeometry',
    'analyzeSeedFullGeometryAndCharacter', 'analyzeSeedHistory']) assert.equal(seed.parity[key], true, key);
  const original = baseline.seeds.find(row => row.seed === seed.seed);
  assert.deepEqual(seed.inputProvenance, original.inputProvenance, 'identical full source provenance');
  const names = { socialSummary: `seed${seed.seed}-summary.json`, trajectory: `seed${seed.seed}-trajectory.f64.gz`,
    rawContacts: `seed${seed.seed}-on-raw-events.json.gz` };
  for (const [key, name] of Object.entries(names)) {
    const path = `docs/ant/evidence/2026-10-07-social-graph/data/${name}`, bytes = await readFile(path);
    assert.equal(sha(bytes), original.inputProvenance.sourceHashes[key], `${path} natural archive bytes`);
    naturalArchives.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  }
  for (const frame of seed.frames) {
    assert.equal(frame.activeCellCount, original.history[frame.frameIndex].activeCells);
    assert.equal(frame.timeSeconds, original.history[frame.frameIndex].timeSeconds);
    for (const node of frame.components) for (const cell of node.cellIndices)
      assert.ok(Number.isSafeInteger(cell) && cell >= 0 && cell < 96 * 96);
  }
}
function finite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), 'finite numerical output');
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}
finite(diagnostic); finite(summary);
for (const [path, expected] of Object.entries(summary.sourceSha256)) assert.equal(sha(await readFile(path)), expected);
for (const [name, expected] of Object.entries(summary.outputSha256)) assert.equal(sha(await readFile(`${PACKAGE}/results/${name}`)), expected);
const comparisons = [];
for (const directory of ['results', 'plots']) {
  const names = await inventory(`${PACKAGE}/${directory}`);
  assert.ok(names.length > 0); assert.deepEqual(names, await inventory(`${REPRODUCTION}/${directory}`));
  for (const name of names) {
    const bytes = await readFile(`${PACKAGE}/${directory}/${name}`);
    assert.ok(bytes.equals(await readFile(`${REPRODUCTION}/${directory}/${name}`)), `${directory}/${name} exact reproduction`);
    comparisons.push({ path: `${directory}/${name}`, bytes: bytes.length, sha256: sha(bytes), identical: true });
  }
}
await mkdir(`${PACKAGE}/validation`, { recursive: true });
await save('preservation.json', { startingHead: BASE, historicalFiles, protectedFiles,
  copiedInputCount: copies.files.length, naturalArchives, noHistoricalWrites: true, noProductionChanges: true });
await save('reproduction.json', { status: 'pass', comparisons, byteIdenticalOutputCount: comparisons.length,
  originalFrameParityCount: 599 * 3, completeOriginalGeometryAndCharacterParity: true, finiteAnalysis: true,
  noNaturalBehaviorRerun: true, seeds: summary.frameCountPerSeed });
process.stdout.write(JSON.stringify({ status: 'pass', historicalFiles: historicalFiles.length,
  protectedFiles: protectedFiles.length, copiedInputs: copies.files.length, naturalArchives: naturalArchives.length,
  originalFrameParityCount: 1797, byteIdenticalOutputs: comparisons.length }) + '\n');
