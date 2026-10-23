import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSpatialController } from './ant-spatial-core.js';
import { runSpatialCase } from './ant-spatial-run.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DRIVER_PATH = fileURLToPath(import.meta.url);
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-22-spatial-dynamics/recruitment/natural');
const SEEDS = [20261005, 20261006, 20261007];
const POLICIES = ['isotropic', 'flow'];
const SECONDS = 600;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Run the preregistered, production-movement flow vs isotropic comparison once. */
export async function runRecruitmentSuite({ outputRoot = EVIDENCE } = {}) {
  const driverBytes = await readFile(DRIVER_PATH);
  const driverHash = sha256(driverBytes);
  const results = [];
  let commonSourceHashes = null;

  for (const seed of SEEDS) {
    for (const recruitment of POLICIES) {
      const label = `production-movement-${recruitment}-recruitment`;
      const output = resolve(outputRoot, `${recruitment}-${seed}`, 'result.json');
      await freezeDriver(dirname(output), driverBytes, driverHash);
      const { Controller, receipt: controllerReceipt } = await makeSpatialController({ recruitment });
      const receipt = { ...controllerReceipt, runDriverSha256: driverHash };
      const result = await runSpatialCase({ Controller, receipt, seed, seconds: SECONDS, label, output });
      assert.equal(sha256(await readFile(DRIVER_PATH)), driverHash, 'run driver changed during the suite');
      if (commonSourceHashes === null) commonSourceHashes = result.sourceHashes;
      else assert.deepEqual(result.sourceHashes, commonSourceHashes, 'research sources changed between cases');
      assert.equal(result.receipt.productionControllerSha256, controllerReceipt.productionControllerSha256);
      assert.equal(result.sourceHashes['scripts/ant-spatial-field.js'],
        'fb6d5caeafcbc009b1b373edb681d9e8505454d05924284822c4682fea261364',
        'spatial field source does not match the frozen pre-run receipt');
      results.push({ seed, recruitment, label, output, result });
      console.log(JSON.stringify({ status: 'complete', seed, recruitment,
        wallSeconds: result.wallSeconds, rngCalls: result.rngCalls,
        spawnFlowStats: result.spawnFlowStats, output }));
    }
  }

  const manifest = {
    schemaVersion: 1,
    createdBy: 'scripts/ant-spatial-recruitment-runs.js',
    runDriverSha256: driverHash,
    sourceHashes: commonSourceHashes,
    seconds: SECONDS,
    dtSeconds: 1 / 60,
    seeds: SEEDS,
    policies: POLICIES,
    cases: results.map(({ seed, recruitment, label, output, result }) => ({
      seed, recruitment, label, output: output.replace(`${ROOT}\\`, '').replaceAll('\\', '/'),
      wallSeconds: result.wallSeconds, modelSeconds: result.modelSeconds,
      rngCalls: result.rngCalls, final: result.final,
      spawnFlowStats: result.spawnFlowStats,
      flowStats: result.flowStats
    }))
  };
  const manifestPath = resolve(outputRoot, 'run-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  assert.equal(sha256(await readFile(DRIVER_PATH)), driverHash, 'run driver changed before manifest write');
  console.log(JSON.stringify({ status: 'suite-complete', manifest: manifestPath, runDriverSha256: driverHash }));
  return manifest;
}

async function freezeDriver(caseDirectory, bytes, expectedHash) {
  await mkdir(caseDirectory, { recursive: true });
  const snapshotDirectory = resolve(caseDirectory, 'source-snapshot');
  await mkdir(snapshotDirectory, { recursive: true });
  const target = resolve(snapshotDirectory, 'scripts__ant-spatial-recruitment-runs.js');
  await writeFile(target, bytes, { flag: 'wx' });
  assert.equal(sha256(await readFile(target)), expectedHash, 'frozen driver copy differs from executed bytes');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map(process.argv.slice(2).map(value => {
    const at = value.indexOf('=');
    return at < 0 ? [value, true] : [value.slice(0, at), value.slice(at + 1)];
  }));
  if (args.has('--help')) {
    console.log('Runs isotropic then flow recruitment for seeds 20261005/06/07 at 600 seconds. Outputs under recruitment/natural; refuses existing outputs.');
  } else {
    const outputRoot = args.has('--output-root')
      ? resolve(String(args.get('--output-root'))) : EVIDENCE;
    await runRecruitmentSuite({ outputRoot });
  }
}
