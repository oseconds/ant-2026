import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { runNaturalCase } from './ant-route-curvature-natural.js';
import { makeCurvatureController } from './ant-route-curvature-shadows.js';
import { immediateDiagnostics, analyzeFlow } from './ant-route-curvature-readout.js';

async function main() {
  const variant = process.argv[2], seed = Number(process.argv[3] || 20261005);
  const output = resolve(process.argv[4] || `docs/ant/evidence/2026-10-22-route-curvature-survey/shadows/${variant}-${seed}`);
  assert.ok(['scoreOff', 'blendOff', 'dampingOff'].includes(variant));
  await assert.rejects(access(output), 'Refuse to overwrite an existing evidence case.');
  const sourceFiles = ['scripts/ant-route-curvature-natural-shadows.js', 'scripts/ant-route-curvature-natural.js',
    'scripts/ant-route-curvature-metrics.js', 'scripts/ant-route-curvature-readout.js', 'scripts/ant-route-curvature-shadows.js'];
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const sources = Object.fromEntries(await Promise.all(sourceFiles.map(async name => [name, sha(await readFile(name))])));
  const { Controller, ...shadow } = await makeCurvatureController(variant);
  const started = performance.now();
  const { summary, samples, checkpoints } = await runNaturalCase({ Controller, seed });
  const tracks = new Map(), hash = createHash('sha256');
  for (const row of samples) {
    hash.update(JSON.stringify(row) + '\n');
    const track = tracks.get(row.id) || []; track.push(row); tracks.set(row.id, track);
  }
  const flow = analyzeFlow(tracks);
  const record = { ...shadow, seed, node: process.version, wallSeconds: (performance.now() - started) / 1000,
    summary, toolSourceSha256: sources, orderedSamplesSha256: hash.digest('hex'), immediate: immediateDiagnostics(samples),
    flow: { ...flow, cells: undefined },
    caveat: 'One guarded expression changed from identical initial seed. Full coupled natural feedback diverges; no common post-divergence RNG stream claim. Raw 60 Hz replay is reproducible from frozen sources; only 10 Hz late trajectories are retained for visual inspection.' };
  const visualRows = samples.filter(row => row.tick >= 18000 && row.tick % 6 === 0)
    .map(({ id, tick, x, y }) => ({ id, tick, x, y }));
  for (const [name, expected] of Object.entries(sources)) assert.equal(sha(await readFile(name)), expected,
    `Executed tooling changed: ${name}`);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(record, null, 2) + '\n');
  await writeFile(resolve(output, 'visual-trajectories.json.gz'), gzipSync(JSON.stringify(visualRows)));
  await writeFile(resolve(output, 'snapshots.json.gz'), gzipSync(JSON.stringify(checkpoints, (_key, value) =>
    ArrayBuffer.isView(value) ? Array.from(value) : value)));
  console.log(JSON.stringify({ variant, seed, wallSeconds: record.wallSeconds, summary: summary.routeCurvature,
    immediate: record.immediate }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
