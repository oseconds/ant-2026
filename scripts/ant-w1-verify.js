import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { W1_PACKAGE } from './ant-w1-analysis.js';

const base = '225757b18f29c706d84a7e639c63d6a3543644b4';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { maxBuffer: 16 * 1024 * 1024 });
const json = async path => JSON.parse(await readFile(path));
const save = (name, value) => writeFile(`${W1_PACKAGE}/${name}`, JSON.stringify(value, null, 2) + '\n');
const source = await json(`${W1_PACKAGE}/validation/protected-source.json`);
assert.equal(source.startingHead, base);
const blobIds = git('rev-parse', ...source.files.flatMap(file => [`HEAD:${file.path}`, `${base}:${file.path}`])).toString().trim().split('\n');
const protectedFiles = [];
for (const [index, file] of source.files.entries()) {
  const currentSha256 = sha(await readFile(file.path));
  const gitBlob = blobIds[index * 2];
  assert.equal(currentSha256, file.workingSha256, `${file.path} working bytes`);
  assert.equal(gitBlob, file.gitBlob, `${file.path} Git blob`);
  assert.equal(blobIds[index * 2 + 1], file.gitBlob);
  protectedFiles.push({ path: file.path, currentSha256, gitBlob });
}
assert.equal(git('diff', '--name-only', base, '--', 'src', 'static', 'package.json', 'package-lock.json', 'AGENTS.md').toString().trim(), '');
const copies = await json(`${W1_PACKAGE}/validation/baseline-copies.json`);
for (const file of copies.files) {
  const current = await readFile(file.targetPath);
  assert.equal(sha(current), file.sha256);
  assert.ok(current.equals(git('cat-file', 'blob', `${file.sourceCommit}:${file.sourcePath}`)), `${file.targetPath} original Git bytes`);
}
assert.ok((await readFile('scripts/ant-material-morphology-metrics.js')).equals(
  git('cat-file', 'blob', `${copies.sourceCommit}:${copies.metricsReuse.source}`)), 'original metric Git bytes');
const changedEvidence = git('diff', '--name-only', base, '--', 'docs/ant/evidence').toString().trim().split('\n').filter(Boolean);
assert.ok(changedEvidence.every(path => path.startsWith(`${W1_PACKAGE}/`)), 'historical evidence is untouched');
await save('validation/preservation.json', { startingHead: base, protectedFileCount: protectedFiles.length,
  protectedFiles, copiedFileCount: copies.files.length, copiedBytesMatchOriginalGit: true,
  metricBytesMatchOriginalGit: true, historicalEvidenceUnchanged: true });

const comparisons = [];
for (const directory of ['results', 'plots']) {
  for (const name of (await readdir(`${W1_PACKAGE}/${directory}`)).sort()) {
    const original = await readFile(`${W1_PACKAGE}/${directory}/${name}`);
    const rerun = await readFile(`test-results/w1-episodic-reproduction/${directory}/${name}`);
    assert.ok(rerun.equals(original), `${directory}/${name} byte reproduction`);
    comparisons.push({ path: `${directory}/${name}`, bytes: original.length, sha256: sha(original), identical: true });
  }
}
const analysis = JSON.parse(gunzipSync(await readFile(`${W1_PACKAGE}/results/analysis.json.gz`)));
function finite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  if (value && typeof value === 'object') Object.values(value).forEach(finite);
}
finite(analysis);
assert.equal(analysis.status, 'stopped-data-gap');
assert.equal(analysis.seeds.length, 1);
assert.deepEqual(analysis.inputOnlySeeds.map(s => s.seed), [20261006, 20261007]);
assert.equal(analysis.seeds[0].episodes.length, 0);
assert.equal(analysis.seeds[0].dataGap.code, 'NO_VALID_DIRECTIONAL_TRAVEL');
assert.ok(analysis.seeds[0].final.timeSeconds < 120);
await save('validation/reproduction.json', { status: analysis.status, identicalOutputFiles: comparisons.length,
  comparisons, finiteNumericAnalysis: true, verifiedInputOnlySeeds: [20261006, 20261007],
  mechanismSeedPrefixOnly: 20261005, mechanismStopSeconds: analysis.seeds[0].final.timeSeconds,
  noNaturalAntRerun: true, noCharacterFallback: true });
process.stdout.write(JSON.stringify({ protectedFiles: protectedFiles.length, copiedFiles: copies.files.length,
  byteIdenticalOutputs: comparisons.length, status: analysis.status }) + '\n');
