import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNaturalCase, readNaturalCapture } from './ant-route-curvature-natural.js';

// The original JSONL writer represented an unbounded following limit as null.
const serialized = value => typeof value === 'number' && !Number.isFinite(value) ? null : value;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function main() {
  const seed = Number(process.argv[2]);
  assert.ok([20261005, 20261006, 20261007].includes(seed));
  const root = 'docs/ant/evidence/2026-10-22-route-curvature-survey';
  const output = `${root}/validation/replay-${seed}.json`;
  await assert.rejects(access(output), 'Refuse to overwrite validation evidence.');
  const started = performance.now();
  const hashes = Object.fromEntries(await Promise.all([
    'scripts/ant-route-curvature-natural.js', 'scripts/ant-route-curvature-metrics.js',
    'scripts/ant-route-curvature-verify.js'
  ].map(async path => [path, sha(await readFile(path))])));
  const expectedSummary = JSON.parse(await readFile(`${root}/natural/seed-${seed}-summary.json`, 'utf8'));
  const replay = await runNaturalCase({ seed, snapshots: false });
  assert.deepEqual(replay.summary, expectedSummary, 'Current writer reproduces the recorded summary exactly.');
  const expected = await readNaturalCapture(`${root}/natural/seed-${seed}-trajectory.f64.gz`);
  assert.equal(replay.samples.length, expected.length);
  let comparisons = 0;
  const rolling = createHash('sha256');
  for (let i = 0; i < expected.length; i += 1) {
    for (const key of Object.keys(expected[i])) {
      assert.ok(Object.is(serialized(replay.samples[i][key]), expected[i][key]),
        `Serialized capture differs at row ${i}, field ${key}`);
      comparisons += 1;
    }
    rolling.update(JSON.stringify(expected[i]) + '\n');
  }
  for (const [path, expectedHash] of Object.entries(hashes)) assert.equal(sha(await readFile(path)), expectedHash);
  const receipt = { seed, ticks: 36000, node: process.version, wallSeconds: (performance.now() - started) / 1000,
    currentSourceSha256: hashes, exactSummaryParity: true, exactSerializedSampleParity: true,
    sampleCount: expected.length, fieldComparisons: comparisons, serializedSamplesSha256: rolling.digest('hex'),
    scope: 'Replays current capture/codec source against the original serialized data; nonfinite following-speed limit is compared as JSON null. Finite recorded numbers use Object.is. This verifies every captured sample and endpoint summary, not every internal world variable at every tick.' };
  await writeFile(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
