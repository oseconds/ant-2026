import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-audio-reassessment');
const MANIFEST = resolve(PACKAGE, 'manifest.json'), SUMS = resolve(PACKAGE, 'SHA256SUMS');
const REPLACEMENT = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-material-replacement');
const SEEDS = ['20261005', '20261006', '20261007'];
const WORLDS = SEEDS.flatMap(seed => ['control', 'replacement'].map(arm => `${seed}-${arm}`));
const ALLOWED_ARCHIVE = new Set([
  'docs/ant/archive/2026-10-11-plate-deposit-material-boundary.md',
  'docs/ant/archive/2026-10-11-individual-time-and-sedimentary-circulation.md',
  'docs/ant/archive/2026-10-26-independent-review-argon-high-astra-high.md'
]);
const posix = path => relative(ROOT, path).replaceAll('\\', '/');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const isAllowedArchivePath = path => ALLOWED_ARCHIVE.has(path);
export const isPackageFile = path => path.startsWith(PACKAGE + sep) || path.startsWith(`${posix(PACKAGE)}/`);
const safePath = path => {
  assert.ok(typeof path === 'string' && !path.includes('..') && !path.startsWith('/') && !path.includes('\\'));
  assert.ok(!path.includes('/archive/') || isAllowedArchivePath(path), `unapproved archive path: ${path}`);
  const absolute = resolve(ROOT, path);
  assert.ok(absolute.startsWith(ROOT + sep), 'manifest path stays inside repository');
  return absolute;
};

export function canonicalBytes(path, bytes) {
  return /\.(?:js|py|md|json|svg|txt|html|csv)$/.test(path) || path.endsWith('SHA256SUMS')
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n')) : bytes;
}

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile() && !entry.name.endsWith('.log') && !/\.pcm(?:\.|$)/i.test(entry.name)) files.push(path);
  }
  return files.sort();
}

async function receipt(path) {
  const bytes = canonicalBytes(path, await readFile(path));
  return { path: posix(path), bytes: bytes.length, sha256: hash(bytes) };
}

async function linkedDocs() {
  const docs = [resolve(ROOT, 'docs/ant/README.md'), resolve(ROOT, 'docs/ant/daily/README.md'),
    resolve(ROOT, 'docs/ant/daily/2026-11-01-local-x-audio-reassessment.md')];
  for (const md of (await filesUnder(PACKAGE)).filter(path => path.endsWith('.md'))) {
    const source = await readFile(md, 'utf8');
    for (const [, target] of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = target.split('#')[0];
      if (!link || /^[a-z]+:/i.test(link) || link.startsWith('#')) continue;
      const path = resolve(dirname(md), decodeURIComponent(link));
      if (path.startsWith(ROOT + sep) && !isPackageFile(path) &&
        (!path.includes(`${sep}archive${sep}`) || (md === resolve(PACKAGE, 'HISTORICAL-CHALLENGE.md') && isAllowedArchivePath(posix(path))))) docs.push(path);
    }
  }
  return [...new Set(docs)].sort();
}

async function inputPaths() {
  const paths = [resolve(REPLACEMENT, 'manifest.json'), resolve(REPLACEMENT, 'SHA256SUMS'),
    resolve(REPLACEMENT, 'analysis/authority-receipts.json'),
    resolve(ROOT, 'docs/ant/evidence/2026-11-01-singleton-real-stratigraphy-probe/analysis/authority.json'),
    resolve(PACKAGE, 'analysis/receipts.json')];
  for (const world of WORLDS) {
    const header = resolve(REPLACEMENT, `analysis/runs/seed-${world}.signals.json.gz`);
    const run = await readJson(header);
    paths.push(header, ...(run.anchorsFiles ?? []).map(file => resolve(dirname(header), file)));
  }
  return [...new Set(paths)].sort();
}

const toolPaths = async () => (await readdir(resolve(ROOT, 'scripts')))
  .filter(name => /^ant-local-x-audio-.*\.(?:js|py)$/.test(name)).map(name => `scripts/${name}`)
  .concat(['scripts/ant-local-x-material-replacement.js']);
const testPaths = async () => (await readdir(resolve(ROOT, 'tests')))
  .filter(name => /^ant-local-x-audio.*\.test\.js$/.test(name)).map(name => `tests/${name}`);
const sharedTools = ['scripts/ant-singleton-feedback-observer.js', 'scripts/ant-singleton-real-plate.js',
  'scripts/ant-local-opportunity-core.js', 'scripts/ant-local-opportunity-capture.js',
  'scripts/ant-local-opportunity-io.js'];
const sourcePaths = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/audio/compileSurfaceTopology.js',
  'src/lib/audio/SurfaceAudioBridge.js', 'src/lib/audio/AudioEngine.js',
  'src/lib/audio/AntAudioBridge.js', 'src/lib/audio/AntEnvironmentAudioBridge.js', 'static/worklets/surface-plate.worklet.js',
  'static/worklets/sphere.worklet.js'];

function verifyReceipt(item, bytes) {
  safePath(item.path);
  const canonical = canonicalBytes(item.path, bytes);
  assert.equal(canonical.length, item.bytes, `size ${item.path}`);
  assert.equal(hash(canonical), item.sha256, `SHA-256 ${item.path}`);
}

export async function main(write = false) {
  const tools = await Promise.all([...new Set([...(await toolPaths()), ...sharedTools])].map(path => receipt(resolve(ROOT, path))));
  const tests = await Promise.all((await testPaths()).map(path => receipt(resolve(ROOT, path))));
  const source = await Promise.all(sourcePaths.map(path => receipt(resolve(ROOT, path))));
  const documentation = await Promise.all((await linkedDocs()).map(receipt));
  const inputs = await Promise.all((await inputPaths()).map(receipt));
  if (write) {
    const files = [];
    for (const path of await filesUnder(PACKAGE)) if (path !== MANIFEST && path !== SUMS) files.push(await receipt(path));
    assert.equal(files.filter(item => /\.wav$/i.test(item.path)).length, 0, 'Git evidence package contains no WAV');
    await writeFile(MANIFEST, JSON.stringify({ schema: 'ant-local-x-audio-reassessment-manifest-v1',
      productionAuthority: 'bc045dc3caa5954df633ecbee37fbabcb8224f30', replacementEvidence: 'd0481760fd44052acbeaaf88c3b171ab2a625601',
      branch: 'codex/ant-local-x-audio-reassessment-20261101', seeds: SEEDS, horizonSeconds: 300, hz: 60,
      hashConvention: 'Text UTF-8 with CRLF/CR normalized to LF; gzip, PNG, and other binary files use raw bytes; runtime .log and raw PCM files are excluded.',
      recursion: 'manifest.json is excluded from its own file list; SHA256SUMS includes manifest.json and excludes itself.',
      files, tools, tests, source, documentation, inputs }, null, 2) + '\n');
    const rows = [...files, ...tools, ...tests, ...source, ...documentation, ...inputs, await receipt(MANIFEST)]
      .sort((a, b) => a.path.localeCompare(b.path));
    await writeFile(SUMS, '# SHA-256; text uses LF-normalized UTF-8, binary uses raw bytes; paths relative to repository root.\n'
      + rows.map(row => `${row.sha256}  ${row.path}`).join('\n') + '\n');
  }
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  for (const item of [...manifest.files, ...manifest.tools, ...manifest.tests, ...manifest.source,
    ...manifest.documentation, ...manifest.inputs]) verifyReceipt(item, await readFile(safePath(item.path)));
  const actual = (await filesUnder(PACKAGE)).filter(path => path !== MANIFEST && path !== SUMS).map(posix).sort();
  assert.deepEqual(actual, manifest.files.map(item => item.path).sort(), 'complete package inventory');
  assert.equal(actual.filter(path => /\.wav$/i.test(path)).length, 0, 'Git evidence package contains no WAV');
  const rows = [...manifest.files, ...manifest.tools, ...manifest.tests, ...manifest.source,
    ...manifest.documentation, ...manifest.inputs, await receipt(MANIFEST)].sort((a, b) => a.path.localeCompare(b.path));
  const expected = '# SHA-256; text uses LF-normalized UTF-8, binary uses raw bytes; paths relative to repository root.\n'
    + rows.map(row => `${row.sha256}  ${row.path}`).join('\n') + '\n';
  assert.equal(canonicalBytes(SUMS, await readFile(SUMS)).toString('utf8'), expected, 'SHA256SUMS');
  console.log(JSON.stringify({ evidenceFiles: manifest.files.length, tools: manifest.tools.length,
    tests: manifest.tests.length, source: manifest.source.length, documentation: manifest.documentation.length,
    inputs: manifest.inputs.length, sumsEntries: rows.length, manifestSha256: hash(canonicalBytes(MANIFEST, await readFile(MANIFEST))) }));
}

export { safePath, verifyReceipt };
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.includes('--write'));
