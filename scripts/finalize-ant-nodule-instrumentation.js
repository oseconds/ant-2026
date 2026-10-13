import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCensoringDecision, reclassifyTargetCells, summarizePairedTargetDifferences,
  summarizePreviousAuditReconciliation } from './ant-zero-ant-nodule-lineage.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SEEDS = [20261005, 20261006, 20261007];
const CLI = new Map(process.argv.slice(2).map(arg => {
  const split = arg.indexOf('=');
  return split < 0 ? [arg, true] : [arg.slice(0, split), arg.slice(split + 1)];
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  const inputArg = CLI.get('--input');
  const outputArg = CLI.get('--output');
  assert.ok(typeof inputArg === 'string' && inputArg, 'pass --input=<complete raw runner directory>');
  assert.ok(typeof outputArg === 'string' && outputArg, 'pass --output=<fresh finalized data directory>');
  const input = resolve(ROOT, inputArg);
  const output = resolve(ROOT, outputArg);
  await mkdir(output, { recursive: true });
  assert.deepEqual(await readdir(output), [], 'output directory must be fresh and empty');
  const manifestPath = resolve(input, 'manifest.json');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  const seeds = [];
  const sourceSha256 = {};
  for (const seed of SEEDS) {
    const name = `seed-${seed}.json`;
    const bytes = await readFile(resolve(input, name));
    const result = JSON.parse(bytes);
    assert.equal(result.seed, seed);
    for (const armName of ['natural', 'timerClear']) {
      const arm = result.arms[armName];
      const originalEvents = arm.targetCells.map(target => target.events);
      reclassifyTargetCells(arm);
      assert.deepEqual(arm.targetCells.map(target => target.events), originalEvents,
        'analysis-only classification must preserve captured events');
      assert.equal(arm.targetCellCount, arm.targetCells.length);
      assert.equal(new Set(arm.targetCells.map(target => target.cell)).size, arm.targetCellCount);
    }
    assert.deepEqual(result.arms.natural.targetCells.map(target => target.cell),
      result.arms.timerClear.targetCells.map(target => target.cell));
    sourceSha256[name] = sha256(bytes);
    seeds.push(result);
    await writeFile(resolve(output, name), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  }
  manifest.decision = classifyCensoringDecision(seeds, 'natural');
  manifest.naturalVsTimerClear = summarizePairedTargetDifferences(seeds);
  manifest.priorCensoringAudit.reconciliation = summarizePreviousAuditReconciliation(seeds);
  manifest.results = seeds.map(seed => ({ seed: seed.seed, gapValidity: seed.validity,
    naturalLineages: countBy(seed.arms.natural.births, 'lineage'),
    timerClearLineages: countBy(seed.arms.timerClear.births, 'lineage'),
    naturalNoduleBirths: seed.arms.natural.births.length,
    timerClearNoduleBirths: seed.arms.timerClear.births.length,
    gapPlateBirths: seed.gapPlateDescriptors.length,
    plateEnabledQualificationCells: seed.arms.natural.plateEffects.qualificationEnabledCellCount,
    targets: { natural: seed.arms.natural.targetSummary, timerClear: seed.arms.timerClear.targetSummary } }));
  manifest.rawReconciliation = { inputDirectory: relativeToRoot(input),
    rawManifestSha256: sha256(manifestBytes), rawSeedSha256: sourceSha256, analysisOnly: true,
    eventHistoriesPreserved: true,
    classificationRule: 'A previously blocked timer that restarted is right-censored at the final evaluation if that current qualified timer is active and under persistence; the historical block remains an event and is counted separately.' };
  manifest.sourceHashes = { ...manifest.sourceHashes,
    'scripts/ant-zero-ant-nodule-lineage.js': await hashFile(resolve(ROOT, 'scripts/ant-zero-ant-nodule-lineage.js')),
    'scripts/finalize-ant-nodule-instrumentation.js': await hashFile(fileURLToPath(import.meta.url)) };
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ complete: true, output: outputArg, decision: manifest.decision.label,
    classificationCounts: manifest.decision.classificationCounts,
    actualNearbyBlockedCells: manifest.decision.actualNearbyBlockedCells }));
}

function countBy(values, key) {
  return Object.fromEntries([...values.reduce((counts, value) => counts.set(value[key],
    (counts.get(value[key]) || 0) + 1), new Map())].sort(([a], [b]) => String(a).localeCompare(String(b))));
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function hashFile(path) { return sha256(await readFile(path)); }
function relativeToRoot(path) { return path.replace(ROOT + '\\', '').replaceAll('\\', '/'); }
