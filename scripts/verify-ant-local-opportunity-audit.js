import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRun, readJson, writeJson, sha256, unpack } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit');
const DATA = resolve(EVIDENCE, 'analysis');
const SEEDS = ['20261005', '20261006', '20261007'];
const AUTHORITY = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const posix = value => value.replaceAll('\\', '/');
const textArtifact = path => /\.(?:md|js|json|svg|html|txt)$/.test(path);
const canonicalBytes = (path, bytes) => textArtifact(path) ? Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n')) : bytes;
async function filesIn(dir) {
  const rows = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) rows.push(...await filesIn(path)); else rows.push(path);
  }
  return rows.sort();
}
function adjacent(index) {
  const rows = [], x = index % 96, y = Math.floor(index / 96);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || x + dx < 0 || x + dx >= 96 || y + dy < 0 || y + dy >= 96) continue;
    rows.push((y + dy) * 96 + x + dx);
  }
  return rows;
}
const NEIGHBORS = Array.from({ length: 9216 }, (_, i) => adjacent(i));
const squaredDistance = (a, b) => ((a % 96 - b % 96) ** 2 + (Math.floor(a / 96) - Math.floor(b / 96)) ** 2) / 95 ** 2;

export function verifyCapture(capture, F, layers) {
  const members = new Set(capture.cells);
  assert.equal(members.size, capture.cells.length, 'unique X cells');
  assert.equal(capture.nodeCount, members.size, 'X node count');
  assert.ok(members.size && capture.connected && capture.radiusValid);
  let covered = 0, totalLayers = 0, maxLayers = 0;
  for (const cell of members) { assert.equal(F[cell], 1); covered += Number(layers[cell] > 0);
    totalLayers += layers[cell]; maxLayers = Math.max(maxLayers, layers[cell]); }
  assert.equal(capture.material.overlapFraction, covered / members.size);
  assert.equal(capture.material.meanLayers, totalLayers / members.size);
  assert.equal(capture.material.maxLayers, maxLayers);
  const visited = new Set(), pending = [capture.cells[0]];
  while (pending.length) {
    const cell = pending.pop(); if (visited.has(cell)) continue; visited.add(cell);
    for (const other of NEIGHBORS[cell]) if (members.has(other) && !visited.has(other)) pending.push(other);
  }
  assert.equal(visited.size, members.size, 'independent 8-connectedness');
  const centers = [...new Set(capture.centers.map(row => row.index))];
  for (const center of centers) {
    assert.ok(members.has(center), 'every duplicate capture retains its nucleus');
    for (const cell of members) {
      assert.ok(squaredDistance(cell, center) <= .15 ** 2 + 1e-12, 'R=.15 for every nucleus');
      for (const other of NEIGHBORS[cell]) if (F[other] && squaredDistance(other, center) <= .15 ** 2 + 1e-12)
        assert.ok(members.has(other), 'X is maximal within F intersect disk');
    }
  }
  return centers.length;
}
async function validateSeed(seed) {
  const signals = await readRun(resolve(DATA, 'seed-' + seed + '.signals.json.gz'));
  const opportunities = await readRun(resolve(DATA, 'seed-' + seed + '.opportunities.json.gz'));
  assert.equal(signals.authority, AUTHORITY); assert.equal(opportunities.authority, AUTHORITY);
  assert.equal(signals.seconds, 600); assert.equal(signals.hz, 60); assert.equal(signals.audio, 'Off');
  assert.equal(signals.validation.parity.ticks, 36000); assert.equal(signals.validation.observerRandomCalls, 0);
  assert.ok(signals.validation.parity.equalEveryTick && signals.validation.parity.equalEveryAnalysisBoundary);
  assert.equal(signals.anchors.length, 599); assert.equal(opportunities.anchors.length, 599);
  assert.equal(signals.validation.parity.exactEnvironmentBoundaries, 599);
  for (const [path, hash] of Object.entries(signals.sourceHashes)) {
    const source = (await readFile(resolve(ROOT, path), 'utf8')).replace(/\r\n?/g, '\n');
    assert.equal(sha256(Buffer.from(source)), hash, 'production source ' + path);
  }
  let captures = 0, nuclei = 0;
  for (let k = 0; k < signals.anchors.length; k++) {
    const s = signals.anchors[k], a = opportunities.anchors[k]; assert.equal(s.timeMs, a.timeMs);
    const E = unpack(s.E), F = unpack(s.F), layers = unpack(s.material.layers);
    const S = new Set(a.SIndices);
    for (let i = 0; i < 9216; i++) {
      assert.ok(!F[i] || E[i]);
      assert.equal(S.has(i), !!F[i] && NEIGHBORS[i].some(j => F[j]), 'exact edge-bearing S');
    }
    for (const capture of a.captures) { nuclei += verifyCapture(capture, F, layers); captures++; }
    const known = new Set(a.captures.map(capture => capture.id));
    for (const channel of Object.values(a.channels)) {
      if (!channel) continue;
      for (const representation of ['raw', 'g15', 'g30']) for (const center of channel[representation]) {
        assert.ok(S.has(center.index)); assert.ok(center.value > 0); assert.ok(known.has(center.captureId));
      }
    }
    for (const [window, lag] of Object.entries(a.deltaLags)) {
      if (!lag) continue;
      assert.ok(lag.priorIndex < k);
      assert.equal(lag.elapsedSeconds, (a.timeMs - signals.anchors[lag.priorIndex].timeMs) / 1000);
      const target = a.timeMs - Number(window) * 1000;
      const best = signals.anchors.slice(0, k).map((row, index) => ({ index, distance: Math.abs(row.timeMs - target) }))
        .sort((x, y) => x.distance - y.distance || x.index - y.index)[0];
      assert.equal(lag.priorIndex, best.index, 'nearest exact lag');
      for (const field of ['B', 'C', 'D']) {
        const before = unpack(signals.anchors[lag.priorIndex][field]), after = unpack(s[field]), delta = unpack(a.delta['delta' + field + window]);
        for (let i = 0; i < 9216; i++) assert.equal(delta[i], after[i] - before[i], 'signed full-grid change');
      }
    }
  }
  return { seed, ticks: 36000, analyses: 599, uniqueCaptures: captures, uniqueNuclei: nuclei,
    independentXValidity: true, signedLagArithmetic: true, sourceHashesVerified: true };
}
async function manifest(write) {
  const path = resolve(EVIDENCE, 'manifest.json');
  if (!write) {
    const saved = await readJson(path);
    for (const entry of saved.files) {
      const bytes = canonicalBytes(entry.file, await readFile(resolve(EVIDENCE, entry.file))); assert.equal(bytes.length, entry.bytes);
      assert.equal(sha256(bytes), entry.sha256, entry.file);
    }
    for (const [file, hash] of Object.entries(saved.toolHashes)) assert.equal(sha256(canonicalBytes(file, await readFile(resolve(ROOT, file)))), hash, file);
    for (const [file, hash] of Object.entries(saved.documentationHashes ?? {})) assert.equal(sha256(canonicalBytes(file, await readFile(resolve(ROOT, file)))), hash, file);
    console.log(JSON.stringify({ manifestVerified: saved.files.length, toolsVerified: Object.keys(saved.toolHashes).length,
      documentationVerified: Object.keys(saved.documentationHashes ?? {}).length })); return;
  }
  const files = [];
  for (const file of await filesIn(EVIDENCE)) {
    if (file === path || file.endsWith('.log')) continue;
    const bytes = canonicalBytes(file, await readFile(file)); files.push({ file: posix(relative(EVIDENCE, file)),
      hashMode: textArtifact(file) ? 'LF-normalized UTF-8' : 'raw bytes', bytes: bytes.length, sha256: sha256(bytes) });
  }
  const toolFiles = [...(await filesIn(resolve(ROOT, 'scripts'))), ...(await filesIn(resolve(ROOT, 'tests')))]
    .filter(path => /(?:ant-local-opportunity-|verify-ant-local-opportunity-audit)/.test(path));
  const toolHashes = {};
  for (const file of toolFiles) toolHashes[posix(relative(ROOT, file))] = sha256(canonicalBytes(file, await readFile(file)));
  const documentationHashes = {};
  for (const file of ['docs/ant/README.md', 'docs/ant/daily/README.md', 'docs/ant/daily/2026-10-31-local-opportunity-competition-audit.md'])
    documentationHashes[file] = sha256(canonicalBytes(file, await readFile(resolve(ROOT, file))));
  await writeJson(path, { schema: 'ant-local-opportunity-manifest-v1', authority: AUTHORITY,
    branch: 'codex/ant-local-opportunity-competition-audit-20261031', seeds: SEEDS, hz: 60, modelSeconds: 600, audio: 'Off',
    files, toolHashes, documentationHashes, toolHashMode: 'LF-normalized UTF-8' });
  console.log(JSON.stringify({ manifestWritten: files.length, tools: toolFiles.length }));
}
async function main() {
  const compare = process.argv.find(arg => arg.startsWith('--compare='));
  if (compare) {
    const other = resolve(compare.slice(10)), rows = [];
    for (const path of await filesIn(DATA)) {
      const file = relative(DATA, path); if (!/\.json(?:\.gz)?$/.test(file)) continue;
      const left = await readFile(path), right = await readFile(resolve(other, file));
      assert.equal(sha256(left), sha256(right), 'deterministic rerun ' + file);
      rows.push({ file: posix(file), bytes: left.length, sha256: sha256(left) });
    }
    await writeJson(resolve(EVIDENCE, 'validation/determinism.json'), { schema: 'ant-local-opportunity-rerun-v1',
      authority: AUTHORITY, equal: true, files: rows });
    console.log(JSON.stringify({ rerunEqual: true, files: rows.length })); return;
  }
  if (process.argv.includes('--validate')) {
    const rows = []; for (const seed of SEEDS) { const row = await validateSeed(seed); rows.push(row); console.log(JSON.stringify(row)); }
    await writeJson(resolve(EVIDENCE, 'validation/independent-array-checks.json'), { authority: AUTHORITY, seeds: rows }); return;
  }
  await manifest(process.argv.includes('--write-manifest'));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
