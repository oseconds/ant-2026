import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-material-replacement');
const MANIFEST = resolve(PACKAGE, 'manifest.json'), SUMS = resolve(PACKAGE, 'SHA256SUMS');
const SEEDS = ['20261005', '20261006', '20261007'];
const FROZEN = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis');
const EVENTS = resolve(ROOT, 'docs/ant/evidence/2026-10-31-bc-dual-material-shadow/analysis');
const posix = path => relative(ROOT, path).replaceAll('\\', '/');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePaths = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js'
];
const toolPaths = [
  'scripts/ant-local-x-material-replacement.js', 'scripts/ant-local-x-material-replacement-results.js',
  'scripts/ant-local-x-material-replacement-manifest.js', 'scripts/ant-singleton-feedback-observer.js',
  'scripts/ant-singleton-real-plate.js', 'scripts/ant-local-opportunity-core.js',
  'scripts/ant-local-opportunity-capture.js', 'scripts/ant-local-opportunity-io.js',
  'src/lib/audio/compileSurfaceTopology.js', ...sourcePaths
];
const documentationPaths = ['docs/ant/README.md', 'docs/ant/daily/README.md',
  'docs/ant/daily/2026-11-01-local-x-material-replacement.md'];

function canonicalBytes(path, bytes) {
  return /\.(?:js|md|json|svg|txt|html)$/.test(path) || path.endsWith('SHA256SUMS')
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n')) : bytes;
}

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile() && !entry.name.endsWith('.log')) files.push(path);
  }
  return files.sort();
}

async function receipt(path) {
  const bytes = canonicalBytes(path, await readFile(path));
  return { path: posix(path), bytes: bytes.length, sha256: hash(bytes) };
}

async function inputPaths() {
  const paths = [resolve(ROOT, 'docs/ant/evidence/2026-11-01-singleton-real-stratigraphy-probe/analysis/authority.json')];
  for (const seed of SEEDS) {
    const signal = resolve(FROZEN, 'seed-' + seed + '.signals.json.gz');
    const signalMeta = await readJson(signal);
    paths.push(signal, ...[...(signalMeta.anchorsFiles ?? []), ...(signalMeta.tracksFiles ?? [])]
      .map(file => resolve(dirname(signal), file)));
    const opportunities = resolve(FROZEN, 'seed-' + seed + '.opportunities.json.gz');
    const opportunityMeta = await readJson(opportunities);
    paths.push(opportunities, ...opportunityMeta.anchorsFiles.map(file => resolve(FROZEN, file)));
    paths.push(resolve(EVENTS, 'events-' + seed + '.json.gz'));
  }
  return [...new Set(paths)].sort();
}

function checkReceipt(item, bytes) {
  const canonical = canonicalBytes(item.path, bytes);
  assert.equal(canonical.length, item.bytes, 'size ' + item.path);
  assert.equal(hash(canonical), item.sha256, 'SHA-256 ' + item.path);
}

export async function main(write = false) {
  const inputs = await Promise.all((await inputPaths()).map(receipt));
  if (write) {
    const files = [];
    for (const path of await filesUnder(PACKAGE)) if (path !== MANIFEST && path !== SUMS) files.push(await receipt(path));
    const tools = await Promise.all(toolPaths.map(path => receipt(resolve(ROOT, path))));
    const documentation = await Promise.all(documentationPaths.map(path => receipt(resolve(ROOT, path))));
    const campaign = await readJson(resolve(PACKAGE, 'analysis/campaign-runs.json'));
    await writeFile(MANIFEST, JSON.stringify({ schema: 'ant-local-x-material-replacement-manifest-v1',
      productionAuthority: 'bc045dc3caa5954df633ecbee37fbabcb8224f30',
      experimentBase: '7c96c128bd32bea33f69d8a1c1d08cf85d4421f8',
      frozenFormationClosure: '2cfe9cbab78df2af9e77d9df450c67fb603aa22c',
      feedbackProbes: ['f462d7b0f684afea1bb6868b6045524360e05f2e', '9b03a392588429643cf43b386706d58bbfb66418'],
      realStratigraphyProbe: '7c96c128bd32bea33f69d8a1c1d08cf85d4421f8',
      branch: 'codex/ant-local-x-replacement-20261101', seeds: SEEDS, horizonSeconds: 300,
      hz: 60, dt: 1 / 60, audio: 'Off', campaign: campaign.map(row => ({ seed: row.seed,
        status: row.status, control: row.control?.status, replacement: row.replacement?.status })),
      hashConvention: 'Text UTF-8 with CRLF/CR normalized to LF; gzip and other binary files use raw bytes; runtime .log files are excluded.',
      recursion: 'manifest.json is excluded from its own file list; SHA256SUMS includes manifest.json and excludes itself.',
      files, tools, documentation, inputs }, null, 2) + '\n');
    const rows = [...files, ...tools, ...documentation, ...inputs, await receipt(MANIFEST)]
      .sort((a, b) => a.path.localeCompare(b.path));
    await writeFile(SUMS, '# SHA-256; text uses LF-normalized UTF-8, binary uses raw bytes; paths relative to repository root.\n'
      + rows.map(row => `${row.sha256}  ${row.path}`).join('\n') + '\n');
  }

  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  for (const item of [...manifest.files, ...manifest.tools, ...manifest.documentation, ...manifest.inputs]) {
    assert.ok(!item.path.includes('..') && !item.path.includes('/archive/'));
    const path = resolve(ROOT, item.path);
    assert.ok(path.startsWith(ROOT + sep), 'manifest path stays inside repository');
    checkReceipt(item, await readFile(path));
  }
  const actual = (await filesUnder(PACKAGE)).filter(path => path !== MANIFEST && path !== SUMS).map(posix).sort();
  assert.deepEqual(actual, manifest.files.map(item => item.path).sort(), 'complete package inventory');
  const rows = [...manifest.files, ...manifest.tools, ...manifest.documentation, ...manifest.inputs,
    await receipt(MANIFEST)].sort((a, b) => a.path.localeCompare(b.path));
  const expected = '# SHA-256; text uses LF-normalized UTF-8, binary uses raw bytes; paths relative to repository root.\n'
    + rows.map(row => `${row.sha256}  ${row.path}`).join('\n') + '\n';
  assert.equal(canonicalBytes(SUMS, await readFile(SUMS)).toString('utf8'), expected, 'SHA256SUMS');
  console.log(JSON.stringify({ evidenceFiles: manifest.files.length, tools: manifest.tools.length,
    documentation: manifest.documentation.length, frozenInputs: manifest.inputs.length,
    sumsEntries: rows.length, manifestSha256: hash(canonicalBytes(MANIFEST, await readFile(MANIFEST))) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main(process.argv.includes('--write'));
