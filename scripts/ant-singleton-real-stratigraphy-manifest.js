import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-singleton-real-stratigraphy-probe');
const MANIFEST = resolve(PACKAGE, 'manifest.json'), SUMS = resolve(PACKAGE, 'SHA256SUMS');
const posix = path => relative(ROOT, path).replaceAll('\\', '/');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonicalBytes(path, bytes) {
  return /\.(?:js|md|json|svg|txt|html)$/.test(path) || path.endsWith('SHA256SUMS')
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n')) : bytes;
}
export function checkReceipt(receipt, bytes) {
  const canonical = canonicalBytes(receipt.path, bytes);
  assert.equal(canonical.length, receipt.bytes, `size ${receipt.path}`);
  assert.equal(hash(canonical), receipt.sha256, `SHA-256 ${receipt.path}`);
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
async function toolPaths() {
  const paths = [];
  for (const directory of ['scripts', 'tests']) for (const entry of await readdir(resolve(ROOT, directory))) {
    if (entry.startsWith('ant-singleton-real-') && entry.endsWith('.js')) paths.push(resolve(ROOT, directory, entry));
  }
  for (const path of [
    'scripts/ant-singleton-feedback-observer.js', 'scripts/ant-local-opportunity-core.js',
    'scripts/ant-local-opportunity-io.js', 'scripts/ant-local-opportunity-capture.js',
    'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
    'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
    'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/SurfaceField.js',
    'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GaitController.js',
    'src/lib/agents/ant/BodyPoseController.js', 'src/lib/agents/ant/GasterDeposition.js',
    'src/lib/agents/ant/ColonyActivation.js', 'src/lib/audio/SurfaceAudioBridge.js',
    'src/lib/audio/compileSurfaceTopology.js'
  ]) paths.push(resolve(ROOT, path));
  return paths.sort();
}
export async function main(write = false) {
  if (write) {
    const files = [];
    for (const path of await filesUnder(PACKAGE)) if (path !== MANIFEST && path !== SUMS) files.push(await receipt(path));
    const tools = [];
    for (const path of await toolPaths()) tools.push(await receipt(path));
    const documentation = [];
    for (const path of ['docs/ant/README.md', 'docs/ant/daily/README.md',
      'docs/ant/daily/2026-11-01-singleton-real-stratigraphy-probe.md']) documentation.push(await receipt(resolve(ROOT, path)));
    await writeFile(MANIFEST, JSON.stringify({ schema: 'ant-singleton-real-stratigraphy-manifest-v1',
      productionAuthority: 'bc045dc3caa5954df633ecbee37fbabcb8224f30',
      parent: '9b03a392588429643cf43b386706d58bbfb66418',
      overlayAuthority: 'f462d7b0f684afea1bb6868b6045524360e05f2e',
      seed: '20261005', horizonSeconds: 300, hz: 60, audio: 'Off',
      hashConvention: 'Text UTF-8 with CRLF/CR normalized to LF; gzip/PNG raw bytes. Runtime .log files excluded.',
      recursion: 'Manifest excludes itself and SHA256SUMS; SHA256SUMS includes manifest and excludes itself.',
      files, tools, documentation }, null, 2) + '\n');
    const rows = [...files, ...tools, ...documentation, await receipt(MANIFEST)].sort((a, b) => a.path.localeCompare(b.path));
    await writeFile(SUMS, '# SHA-256; text uses LF-normalized UTF-8, binary uses raw bytes; paths relative to repository root.\n'
      + rows.map(row => `${row.sha256}  ${row.path}`).join('\n') + '\n');
  }
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  for (const row of [...manifest.files, ...manifest.tools, ...manifest.documentation]) {
    assert.ok(!row.path.includes('..') && !row.path.includes('/archive/'));
    const path = resolve(ROOT, row.path);
    assert.ok(path.startsWith(ROOT + sep), 'manifest path stays inside repository');
    checkReceipt(row, await readFile(path));
  }
  const actual = (await filesUnder(PACKAGE)).filter(path => path !== MANIFEST && path !== SUMS).map(posix).sort();
  assert.deepEqual(actual, manifest.files.map(row => row.path).sort(), 'complete package inventory');
  const rows = [...manifest.files, ...manifest.tools, ...manifest.documentation, await receipt(MANIFEST)]
    .sort((a, b) => a.path.localeCompare(b.path));
  const expected = '# SHA-256; text uses LF-normalized UTF-8, binary uses raw bytes; paths relative to repository root.\n'
    + rows.map(row => `${row.sha256}  ${row.path}`).join('\n') + '\n';
  assert.equal(canonicalBytes(SUMS, await readFile(SUMS)).toString('utf8'), expected, 'SHA256SUMS');
  console.log(JSON.stringify({ verifiedFiles: manifest.files.length, verifiedTools: manifest.tools.length,
    verifiedDocumentation: manifest.documentation.length, sumsEntries: rows.length,
    manifestSha256: hash(canonicalBytes(MANIFEST, await readFile(MANIFEST))) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.includes('--write'));
