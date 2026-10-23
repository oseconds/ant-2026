import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const folder = dirname(fileURLToPath(import.meta.url));
const evidence = resolve(folder, '..');

async function load(relative) {
  return JSON.parse(await readFile(resolve(evidence, relative), 'utf8'));
}

function firstDifference(a, b, path = '$') {
  if (Object.is(a, b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return { path, expected: a, actual: b };
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const key of keys) {
    if (!(key in a) || !(key in b)) return { path: `${path}.${key}`, expected: a[key], actual: b[key] };
    const difference = firstDifference(a[key], b[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

async function compare(label, longPath, shortPath) {
  const [longRun, shortRun] = await Promise.all([load(longPath), load(shortPath)]);
  assert.ok(longRun.seconds >= shortRun.seconds, `${label}: long run shorter than reference`);
  const ticks = shortRun.seconds * 60;
  const longCheckpoint = longRun.checkpoints.filter(item => item.second <= shortRun.seconds);
  const shortCheckpoint = shortRun.checkpoints;
  const longFrames = longRun.frames.filter(item => item.second <= shortRun.seconds);
  const longTrajectory = longRun.trajectory10Hz.filter(item => item.tick <= ticks);
  const longSpawns = longRun.spawnObservations.filter(item => item.tick <= ticks);
  const comparisons = {
    checkpoints: { expected: shortCheckpoint.length, actual: longCheckpoint.length,
      firstDifference: firstDifference(shortCheckpoint, longCheckpoint) },
    oneSecondFrames: { expected: shortRun.frames.length, actual: longFrames.length,
      firstDifference: firstDifference(shortRun.frames, longFrames) },
    tenHzTrajectory: { expected: shortRun.trajectory10Hz.length, actual: longTrajectory.length,
      firstDifference: firstDifference(shortRun.trajectory10Hz, longTrajectory) },
    acceptedSpawns: { expected: shortRun.spawnObservations.length, actual: longSpawns.length,
      firstDifference: firstDifference(shortRun.spawnObservations, longSpawns) }
  };
  for (const [name, result] of Object.entries(comparisons)) {
    result.exactMatch = result.expected === result.actual && result.firstDifference === null;
  }
  return { label, longRun: longPath, referenceRun: shortPath, prefixModelSeconds: shortRun.seconds,
    comparedPrefixTicks: ticks, comparedPrefixSeconds: shortRun.seconds, comparisons,
    allComparedStreamsMatch: Object.values(comparisons).every(value => value.exactMatch),
    excludedMetadata: ['wallSeconds', 'sourceHashes', 'whole-run curvature and flow aggregates', 'whole-run final state'] };
}

const results = [
  await compare('production 7200s prefix vs 600s baseline', 'long-run/production-20261005/result.json',
    'baseline/seed-20261005/result.json'),
  await compare('dtFeedback 7200s prefix vs 600s natural run', 'long-run/dtFeedback-20261005/result.json',
    'movement/natural/dtFeedback-20261005/result.json')
];
const report = { schemaVersion: 1, method: 'Exact JSON equality over checkpoints, one-second frames, ten-Hz active-ant trajectories, and accepted-spawn records with tick <= 600*60. Metadata and whole-run summaries excluded.',
  runs: results };
const output = process.argv[2] ? resolve(process.argv[2]) : resolve(folder, 'long-prefix-parity.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output, results: results.map(({ label, allComparedStreamsMatch, comparisons }) =>
  ({ label, allComparedStreamsMatch, comparisons })) }));
