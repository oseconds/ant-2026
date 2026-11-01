import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, readRun, writeJson } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-singleton-feedback-replication-seed06');
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

const sum = values => values.reduce((total, value) => total + value, 0);
const mean = values => values.length ? sum(values) / values.length : 0;

function candidateIdentity(candidate) {
  return JSON.stringify([candidate.source?.index, candidate.target?.index,
    candidate.maskSha256, candidate.supportedMaskSha256]);
}

function armSummary(comparison, windows, run, arm) {
  const rows = windows.flatMap(row => row[arm].uniqueMatureX.map((mature, index) => ({
    mature, singleton: row[arm].singletonOptions[index], contested: row[arm].contestedOptions[index]
  })));
  const optionAppearances = sum(rows.map(row => row.mature));
  const contestedAppearances = sum(rows.map(row => row.contested));
  const pairedAnchors = run.anchors;
  const candidateAvailable = pairedAnchors.filter(row => row.productionCandidateAvailable);
  const births = run.births.map(row => ({ timeSeconds: row.timeMs / 1000,
    id: row.id, maskCellCount: row.maskIndices.length }));
  return {
    feedbackExposure: arm === 'treatment' ? comparison.treatmentExposure : null,
    matureXMean: mean(rows.map(row => row.mature)),
    singletonOptionsMean: mean(rows.map(row => row.singleton)),
    contestedOptionsMean: mean(rows.map(row => row.contested)),
    contestedOptionShare: optionAppearances ? contestedAppearances / optionAppearances : 0,
    maturationCount: comparison[`${arm}Maturations`],
    productionPlateCount: run.births.length,
    productionBirths: births,
    productionCandidate: { availableAnchors: candidateAvailable.length,
      jointlyAvailableAnchors: 0, identityMatchesAtJointlyAvailable: 0,
      fullRecordMatchesAtJointlyAvailable: 0 },
    windows: windows.map(row => {
      const values = row[arm], matureTotal = sum(values.uniqueMatureX), contestedTotal = sum(values.contestedOptions);
      return { startSeconds: row.startSeconds, endSeconds: row.endSeconds,
        matureXMean: mean(values.uniqueMatureX), singletonOptionsMean: mean(values.singletonOptions),
        contestedOptionsMean: mean(values.contestedOptions),
        contestedOptionShare: matureTotal ? contestedTotal / matureTotal : 0,
        newB: sum(values.newB), newC: sum(values.newC),
        acceptedSingletonOverlayEpisodes: values.singletonOverlayEpisodes };
    })
  };
}

function compareCandidateReceipts(control, treatment, summaries) {
  let jointlyAvailable = 0, identityMatches = 0, fullRecordMatches = 0;
  for (let index = 0; index < control.anchors.length; index++) {
    const left = control.anchors[index], right = treatment.anchors[index];
    if (!left.productionCandidateAvailable || !right.productionCandidateAvailable) continue;
    jointlyAvailable++;
    if (candidateIdentity(left.productionCandidate) === candidateIdentity(right.productionCandidate)) identityMatches++;
    if (JSON.stringify(left.productionCandidate) === JSON.stringify(right.productionCandidate)) fullRecordMatches++;
  }
  for (const summary of summaries) summary.productionCandidate = {
    availableAnchors: summary.productionCandidate.availableAnchors,
    jointlyAvailableAnchors: jointlyAvailable,
    identityMatchesAtJointlyAvailable: identityMatches,
    fullRecordMatchesAtJointlyAvailable: fullRecordMatches
  };
}

function compactCheckpoint(row) {
  const field = value => ({ sha256: value.sha256, sum: value.sum, mean: value.mean,
    nonzero: value.nonzero, max: value.max });
  return { timeMs: row.timeMs, livingPopulation: row.livingPopulation,
    cumulativeSpawned: row.cumulativeSpawned, cumulativeRetired: row.cumulativeRetired,
    realizedTravel: row.realizedTravel, blockedAntTicks: row.blockedAntTicks,
    ticksWithBlockedAnts: row.ticksWithBlockedAnts,
    pheromone: field(row.pheromone), surfaceField: field(row.surfaceField),
    chemicalMemoryB: field(row.chemicalMemoryB), agentOccupancy: field(row.agentOccupancy),
    productionPlateCount: row.productionPlateCount,
    productionPlateBirthTimesMs: row.productionPlateBirthTimesMs,
    productionMaterial: { revision: row.productionMaterial.revision,
      noduleRevision: row.productionMaterial.noduleRevision,
      coverageCells: row.productionMaterial.coverageCells,
      layers: field(row.productionMaterial.layers),
      topPlateIdentitySha256: row.productionMaterial.topPlateIdentity.sha256 },
    researchOverlay: { coverageCells: row.researchOverlay.coverageCells,
      layerCellIncidences: row.researchOverlay.sum,
      maxLayerCount: row.researchOverlay.max,
      sha256: row.researchOverlay.sha256 } };
}

async function crossSeedSummary(currentComparison, currentWindows) {
  const firstPackage = resolve(ROOT, 'docs/ant/evidence/2026-11-01-singleton-feedback-sensitivity');
  const firstComparison = await readJson(resolve(firstPackage, 'analysis/paired-comparison.json.gz'));
  const firstWindows = await readJson(resolve(firstPackage, 'analysis/paired-windows.json'));
  const rows = [];
  for (const [seed, pkg, comparison, windows] of [
    ['20261005', firstPackage, firstComparison, firstWindows],
    ['20261006', PACKAGE, currentComparison, currentWindows]
  ]) {
    const control = await readRun(resolve(pkg, 'analysis/control.signals.json.gz'));
    const treatment = await readRun(resolve(pkg, 'analysis/treatment.signals.json.gz'));
    const arms = { control: armSummary(comparison, windows, control, 'control'),
      treatment: armSummary(comparison, windows, treatment, 'treatment') };
    compareCandidateReceipts(control, treatment, [arms.control, arms.treatment]);
    for (const arm of ['control', 'treatment']) {
      arms[arm].maturationsByChannel = Object.fromEntries(['B', 'C'].map(channel => [channel,
        (arm === 'control' ? control : treatment).events.filter(event => event.channel === channel).length]));
      arms[arm].checkpoints = (arm === 'control' ? control : treatment).checkpoints.map(compactCheckpoint);
    }
    rows.push({ seed, feedbackExposureFraction: comparison.treatmentExposure.exposedAntTicks
      / comparison.treatmentExposure.antTicks,
      exposedAntTicks: comparison.treatmentExposure.exposedAntTicks,
      livingAntTicks: comparison.treatmentExposure.antTicks,
      uniqueExposedAnts: comparison.treatmentExposure.uniqueAntsExposed,
      arms,
      change: {
        matureXMean: arms.treatment.matureXMean - arms.control.matureXMean,
        contestedOptionShare: arms.treatment.contestedOptionShare - arms.control.contestedOptionShare,
        maturationCount: arms.treatment.maturationCount - arms.control.maturationCount,
        productionPlateCount: arms.treatment.productionPlateCount - arms.control.productionPlateCount
      },
      windowDirection: arms.control.windows.map((controlWindow, index) => {
        const treatmentWindow = arms.treatment.windows[index];
        return { startSeconds: controlWindow.startSeconds, endSeconds: controlWindow.endSeconds,
          matureXMean: treatmentWindow.matureXMean - controlWindow.matureXMean,
          singletonOptionsMean: treatmentWindow.singletonOptionsMean - controlWindow.singletonOptionsMean,
          contestedOptionsMean: treatmentWindow.contestedOptionsMean - controlWindow.contestedOptionsMean,
          newMaturations: treatmentWindow.newB + treatmentWindow.newC - controlWindow.newB - controlWindow.newC };
      })
    });
  }
  const summary = { schema: 'ant-singleton-feedback-cross-seed-summary-v1',
    interpretation: 'Two individually matched seeds; trajectories are not pooled. The comparison is descriptive, not a population estimate.',
    seeds: rows };
  await writeJson(resolve(PACKAGE, 'analysis/cross-seed-summary.json'), summary);
  return summary;
}

async function main() {
  const analysis = resolve(PACKAGE, 'analysis');
  const paired = await readJson(resolve(analysis, 'paired-comparison.json.gz'));
  const windows = await readJson(resolve(analysis, 'paired-windows.json'));
  const independent = await readJson(resolve(analysis, 'independent-checks.json'));
  const crossSeed = await crossSeedSummary(paired, windows);
  const firstPackage = resolve(ROOT, 'docs/ant/evidence/2026-11-01-singleton-feedback-sensitivity');
  const crossSeedInputs = [];
  for (const path of [
    resolve(firstPackage, 'manifest.json'), resolve(firstPackage, 'SHA256SUMS.txt'),
    resolve(firstPackage, 'analysis/paired-comparison.json.gz'),
    resolve(firstPackage, 'analysis/paired-windows.json'),
    resolve(firstPackage, 'analysis/control.signals.json.gz'),
    resolve(firstPackage, 'analysis/treatment.signals.json.gz')
  ]) crossSeedInputs.push(await fileReceipt(path));
  const opportunityPath = resolve(ROOT,
    'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis/seed-20261006.opportunities.json.gz');
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
    resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis/seed-20261006.signals.json.gz'),
    resolve(ROOT, 'docs/ant/evidence/2026-10-31-bc-dual-material-shadow/analysis/events-20261006.json.gz')
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
    schema: 'ant-singleton-feedback-replication-seed06-manifest-v1',
    productionAuthority: 'main@bc045dc3caa5954df633ecbee37fbabcb8224f30',
    researchParent: '2cfe9cbab78df2af9e77d9df450c67fb603aa22c',
    branch: 'codex/ant-singleton-feedback-replication-seed06-20261101',
    scope: 'strict matched 300 s seed 20261006 CONTROL and singleton-only research-overlay TREATMENT replication; no production law adoption',
    classification: 'SEED-DEPENDENT FEEDBACK SENSITIVITY',
    runs: { seed: '20261006', hz: 60, durationSeconds: 300, controlAnchors: paired.controlAnchors,
      treatmentAnchors: paired.treatmentAnchors, controlMaturations: paired.controlMaturations,
      treatmentMaturations: paired.treatmentMaturations, firstOverlayTimeMs: paired.firstOverlayTimeMs,
      preFirstOverlayParityTicks: paired.preFirstOverlayParityTicks,
      acceptedTreatmentSingletonLayers: paired.treatmentSingletonOverlayLayers,
      researchOverlayCoverageCells: paired.treatmentOverlayCoverageCells,
      exposedAntTicks: paired.treatmentExposure.exposedAntTicks },
    frozenInputs, crossSeedInputs, registeredOpportunityChunks: opportunityChunks,
    productionSourceChanges: ['src/lib/agents/ant/AntController.js'],
    staticSourceChanges: [], implementationFiles: implementation,
    independentCheck: independent, crossSeedSummary: crossSeed, packageFiles: []
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
