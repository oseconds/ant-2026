import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-singleton-feedback-sensitivity');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const repoPath = path => relative(ROOT, path).split(sep).join('/');

async function filesUnder(directory) {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await filesUnder(target));
    else if (entry.isFile()) rows.push(target);
  }
  return rows.sort((a, b) => repoPath(a).localeCompare(repoPath(b)));
}

async function fileReceipt(path) {
  const data = await readFile(path);
  return { path: repoPath(path), bytes: data.byteLength, sha256: sha256(data) };
}

async function main() {
  const analysis = resolve(PACKAGE, 'analysis');
  const paired = await readJson(resolve(analysis, 'paired-comparison.json.gz'));
  const independent = await readJson(resolve(analysis, 'independent-checks.json'));
  const opportunityPath = resolve(ROOT,
    'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis/seed-20261005.opportunities.json.gz');
  const opportunityMeta = await readJson(opportunityPath);
  const opportunityChunks = [];
  for (const name of opportunityMeta.anchorsFiles) {
    const path = resolve(dirname(opportunityPath), name), receipt = await fileReceipt(path);
    assert.equal(receipt.sha256, opportunityMeta.chunkHashes[name], `registered opportunity chunk ${name}`);
    opportunityChunks.push(receipt);
  }
  const frozenInputs = [];
  for (const path of [
    opportunityPath,
    resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis/seed-20261005.signals.json.gz'),
    resolve(ROOT, 'docs/ant/evidence/2026-10-31-bc-dual-material-shadow/analysis/events-20261005.json.gz')
  ]) frozenInputs.push(await fileReceipt(path));
  const implementationPaths = [
    'src/lib/agents/ant/AntController.js',
    'scripts/ant-local-opportunity-capture.js',
    'scripts/ant-singleton-feedback-observer.js',
    'scripts/ant-singleton-feedback-sensitivity.js',
    'scripts/ant-singleton-feedback-verify.js',
    'scripts/ant-singleton-feedback-manifest.js',
    'tests/ant-material-locomotion-resistance.test.js',
    'tests/ant-singleton-feedback-observer.test.js'
  ];
  const implementation = [];
  for (const path of implementationPaths) implementation.push(await fileReceipt(resolve(ROOT, path)));
  const packageFiles = (await filesUnder(PACKAGE))
    .filter(path => !['manifest.json', 'SHA256SUMS.txt'].includes(path.split(sep).at(-1)));
  const manifest = {
    schema: 'ant-singleton-feedback-sensitivity-manifest-v1',
    productionAuthority: 'main@bc045dc3caa5954df633ecbee37fbabcb8224f30',
    researchParent: '2cfe9cbab78df2af9e77d9df450c67fb603aa22c',
    branch: 'codex/ant-singleton-feedback-sensitivity-20261101',
    scope: 'one matched 300 s seed 20261005 CONTROL and singleton-only research-overlay TREATMENT; no production law adoption',
    classification: 'LIMITED / MIXED FEEDBACK SENSITIVITY',
    runs: { seed: '20261005', hz: 60, durationSeconds: 300, controlAnchors: paired.controlAnchors,
      treatmentAnchors: paired.treatmentAnchors, controlMaturations: paired.controlMaturations,
      treatmentMaturations: paired.treatmentMaturations, firstOverlayTimeMs: paired.firstOverlayTimeMs,
      preFirstOverlayParityTicks: paired.preFirstOverlayParityTicks,
      acceptedTreatmentSingletonLayers: paired.treatmentSingletonOverlayLayers,
      researchOverlayCoverageCells: paired.treatmentOverlayCoverageCells,
      exposedAntTicks: paired.treatmentExposure.exposedAntTicks },
    frozenInputs, registeredOpportunityChunks: opportunityChunks,
    productionSourceChanges: ['src/lib/agents/ant/AntController.js'],
    staticSourceChanges: [], implementationFiles: implementation,
    independentCheck: independent, packageFiles: []
  };
  for (const path of packageFiles) manifest.packageFiles.push(await fileReceipt(path));
  const manifestPath = resolve(PACKAGE, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const checksumFiles = [...packageFiles, manifestPath].sort((a, b) => repoPath(a).localeCompare(repoPath(b)));
  const checksumLines = [];
  for (const path of checksumFiles) checksumLines.push(`${sha256(await readFile(path))}  ${repoPath(path)}`);
  await writeFile(resolve(PACKAGE, 'SHA256SUMS.txt'), `${checksumLines.join('\n')}\n`);
  console.log(JSON.stringify({ manifest: repoPath(manifestPath), packageFiles: checksumFiles.length,
    registeredOpportunityChunks: opportunityChunks.length,
    sha256s: repoPath(resolve(PACKAGE, 'SHA256SUMS.txt')) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
