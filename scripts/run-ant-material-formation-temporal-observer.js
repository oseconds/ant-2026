import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createTemporalObserver, differenceCounters } from './ant-material-formation-temporal-observer.js';
import {
  TRAIL_PLATE_CHEMICAL_THRESHOLD,
  TRAIL_PLATE_GRID_SIZE,
  TRAIL_PLATE_SUPPORT_RADIUS,
  TRAIL_PLATE_SUPPORT_THRESHOLD
} from '../src/lib/agents/ant/TrailPlateBirth.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DT = 1 / 60;
const TEMPORAL_SEED06_RESULT = '5edc906326bbf01f27dba0dbc264df49f061f95f';
const GRID = TRAIL_PLATE_GRID_SIZE;
const CELL_COUNT = GRID * GRID;
const FIELDS = ['agents', 'lifecycle', 'rng', 'pheromone', 'surfaceField', 'gait', 'bodyPose',
  'gasterDeposition', 'colonyActivation', 'localOccupancy', 'footContacts', 'materialBirthEvents',
  'trailPlateBirth', 'materialStratigraphy'];
const SOURCE_PATHS = ['AGENTS.md', 'docs/ant/README.md',
  'docs/ant/evidence/2026-10-13-material-formation-responsibility/README.md',
  'docs/ant/daily/2026-10-13-material-formation-responsibility.md',
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/MaterialStratigraphy.js'];
const TOOL_PATHS = ['scripts/ant-material-formation-temporal-observer.js',
  'scripts/run-ant-material-formation-temporal-observer.js',
  'tests/ant-material-formation-temporal-observer.test.js'];
const CLI = new Map(process.argv.slice(2).map(arg => {
  const index = arg.indexOf('=');
  return index < 0 ? [arg, true] : [arg.slice(0, index), arg.slice(index + 1)];
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  const seed = Number(CLI.get('--seed') || 20261006);
  const seconds = Number(CLI.get('--seconds') || 600);
  const baselineCommit = String(CLI.get('--baseline') || 'ca0aaac4e1994078758d88bf72511f0203a6c70c');
  const productionRef = String(CLI.get('--production') || 'origin/main');
  const productionCommit = String(CLI.get('--production-commit') || 'd45823d40c9a87c1b333fa9872f3c897ee9ab01b');
  const startCommit = String(CLI.get('--start-commit') || baselineCommit);
  const passBranch = String(CLI.get('--branch') || 'codex/ant-material-formation-responsibility-20261013');
  const dataPath = String(CLI.get('--output') || 'docs/ant/evidence/2026-10-13-material-formation-temporal-observer/data');
  const pairedSeed = CLI.has('--pair-seed') ? Number(CLI.get('--pair-seed')) : null;
  const pairedResultCommit = CLI.has('--pair-result-commit') ? String(CLI.get('--pair-result-commit')) : null;
  const output = resolve(ROOT, dataPath);
  const compact = CLI.has('--compact');
  const rawPath = String(CLI.get('--raw-output') || '');
  assert.ok(!compact || rawPath, '--compact requires --raw-output');
  const rawOutput = compact ? resolve(ROOT, rawPath) : output;
  assert.ok(!compact || rawOutput !== output, 'compact raw and evidence outputs must be separate');
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
  assert.ok(Number.isInteger(seconds) && seconds > 0 && seconds % 1 === 0);
  assert.equal(pairedSeed === null, pairedResultCommit === null,
    '--pair-seed and --pair-result-commit must be supplied together');
  if (pairedSeed !== null) {
    assert.ok(Number.isInteger(pairedSeed) && pairedSeed >= 0 && pairedSeed < seed);
    assert.match(pairedResultCommit, /^[0-9a-f]{40}$/i);
    if (pairedSeed === 20261006) assert.equal(pairedResultCommit, TEMPORAL_SEED06_RESULT);
  }
  const ticks = seconds * 60;
  assert.equal(ticks, seconds / DT, 'duration must align to fixed 60 Hz ticks');
  await mkdir(output, { recursive: true });
  assert.equal((await readdir(output)).length, 0, 'evidence data directory must be empty');
  if (compact) {
    await mkdir(rawOutput, { recursive: true });
    assert.equal((await readdir(rawOutput)).length, 0, 'raw output directory must be empty');
  }

  assert.match(baselineCommit, /^[0-9a-f]{40}$/i);
  assert.match(productionCommit, /^[0-9a-f]{40}$/i);
  assert.match(startCommit, /^[0-9a-f]{40}$/i);
  const sourceHashes = {};
  for (const path of SOURCE_PATHS) {
    const working = await readFile(resolve(ROOT, path));
    sourceHashes[path] = sha256(working);
  }

  const { AntController } = await import(pathToFileURL(resolve(ROOT, 'src/lib/agents/ant/AntController.js')).href);
  const plain = await run({ AntController, seed, seconds, ticks, observe: false });
  const observed = await run({ AntController, seed, seconds, ticks, observe: true });
  const parity = compareRows(plain.rows, observed.rows, seed);
  if (parity.firstMismatch) {
    await writeJson(rawOutput, 'parity-failure.json', compactParityEvidence(seed, seconds,
      plain.run, observed.run, parity));
    throw new Error(`observer parity mismatch at tick ${parity.firstMismatch.tick}: ${parity.firstMismatch.field}`);
  }
  assert.equal(plain.run.rngCalls, observed.run.rngCalls);
  assert.equal(plain.run.rngState, observed.run.rngState);
  assert.deepEqual(plain.run.eventTotals, observed.run.eventTotals);
  assert.deepEqual(plain.run.finalFieldHashes, observed.run.finalFieldHashes);
  assert.equal(plain.run.finalSnapshotSha256, observed.run.finalSnapshotSha256);
  const boundary = observed.temporal.finish(seconds * 1000);
  const records = observed.temporal.records;
  const boundaryTail = makeBoundaryTail(records, observed.run.contactCounts, observed.run.finalMaterialInterval,
    observed.run.tailMaterialEvents, seconds * 1000);
  let summary = summarizeCases(records, observed.temporal.summarize(), boundary, boundaryTail, seed, seconds);
  if (pairedSeed !== null) summary = finalizePairedDecision(summary, pairedSeed, pairedResultCommit);
  const classRows = records.filter(row => row.priorMatch);
  const encodedRows = records.map(encodeValue).map(row => JSON.stringify(row)).join('\n') + '\n';
  const rawFiles = [
    { fileName: 'temporal-records.jsonl.gz', role: 'lossless full-cell temporal observations', schemaVersion: 1,
      bytes: gzipSync(Buffer.from(encodedRows), { level: 9 }) },
    { fileName: 'final-world-snapshot.json.gz', role: 'unabridged final observer-run world snapshot', schemaVersion: 1,
      bytes: gzipSync(stableBytes(observed.finalSnapshot), { level: 9 }) }
  ];
  for (const artifact of rawFiles) await writeFile(resolve(rawOutput, artifact.fileName), artifact.bytes);
  const omittedRawArtifacts = compact ? await Promise.all(rawFiles.map(async artifact => ({
    fileName: artifact.fileName, role: artifact.role, schemaVersion: artifact.schemaVersion,
    seed, seconds, sizeBytes: artifact.bytes.length, sha256: sha256(artifact.bytes),
    generationCommand: `node scripts/run-ant-material-formation-temporal-observer.js --seed=${seed} --seconds=${seconds} --baseline=${baselineCommit} --production=${productionRef} --production-commit=${productionCommit} --start-commit=${startCommit} --branch=${passBranch} --compact --output=${dataPath} --raw-output=${rawPath}`,
    sourceCommit: startCommit
  }))) : [];
  await writeFile(resolve(output, 'analysis-rows.csv'), csvText(classRows));
  await writeJson(output, 'class-lineage-summary.json', summary);
  if (compact) {
    await writeJson(output, 'parity-summary.json', compactParityEvidence(seed, seconds, plain.run, observed.run, parity));
    await writeJson(output, 'strict-comparator-groups.json', comparatorGroupEvidence(records));
  } else {
    await writeJson(output, 'parity.json', {
      seed, seconds, fixedHz: 60, plain: plain.run, observer: observed.run,
      perTick: parity, observerNonmutationChecks: observed.run.readOnlyObservationChecks,
      finalWorldSnapshotMatches: true, finalWorldSnapshotSha256: observed.run.finalSnapshotSha256,
      finalWorldSnapshotFile: 'final-world-snapshot.json.gz'
    });
  }
  const toolHashes = Object.fromEntries(await Promise.all(TOOL_PATHS.map(async path =>
    [path, sha256(await readFile(resolve(ROOT, path)))])));
  const provenance = {
    baseline: { commit: baselineCommit, sourceEqualityPreflight: 'required external preflight; not executed by this runner' },
    production: { ref: productionRef, commit: productionCommit,
      equalityPreflight: 'required external preflight; not executed by this runner' },
    startCommit, passBranch, sourceHashes,
    toolHashes
  };
  await writeJson(output, 'source-tool-hashes.json', provenance);
  const manifest = {
    schemaVersion: 2, seed, seconds, dtSeconds: DT, ticks, analysisCount: records.length,
    baselineCommit, productionRef: { name: productionRef, commit: productionCommit },
    startCommit, passBranch, node: process.version,
    sampling: 'Captured only when TrailPlateBirth.lastAnalysisTimeMs changes during the existing 60 Hz controller tick. The first analysis is the production first tick at 16.666... ms; no formation analysis is synthesized at the run boundary.',
    causalOrdering: 'Each row carries a detached interval-start material snapshot from immediately after the previous analysis tick. Foot-contact counter deltas are measured through the current analysis tick. A Plate born at that ending tick is listed separately in birthsAtEndBoundary and excluded from intervalStart. Same-tick and between-sample nodule births are separately recorded as material events.',
    mechanicalSupport: 'The exact production buildSupportedMask result is sampled read-only after the controller tick. Its support values are retained for chemical-qualified cells; SurfaceField.sampleSupport fills the remaining cells without changing state. The combined mask is asserted equal to the production mask at every analysis.',
    cellEligibility: 'The per-cell eligibility axis is the production combined supported mask. Candidate lineage and cell transitions are classified independently. A local loss-to-return is counted only when both its eligible-to-ineligible and ineligible-to-eligible transitions fall within the previous/current candidate-or-prior territory union for their intervals. First-sample and run-end boundaries are censored; subsecond absence is not inferred.',
    rng: 'Observer run uses the same counted LCG and fresh default AntController as the plain run; no materialLocomotionResistance override or audio bridge is supplied.',
    parity: 'Exact SHA-256 chained per-tick comparisons cover full agents, lifecycle/spawn state, counted RNG state/calls, pheromone, SurfaceField, gait, body pose, deposition, activation, occupancy, FOOT_CONTACT and birth event sequences, TrailPlateBirth internal arrays/candidate/descriptors, and MaterialStratigraphy internal arrays/history. Each observer capture is also bracketed by equal complete production-state hashes.',
    outputFiles: compact
      ? ['analysis-rows.csv', 'class-lineage-summary.json', 'parity-summary.json',
        'strict-comparator-groups.json', 'source-tool-hashes.json', 'manifest.json']
      : ['analysis-rows.csv', 'class-lineage-summary.json', 'final-world-snapshot.json.gz',
        'parity.json', 'source-tool-hashes.json', 'temporal-records.jsonl.gz', 'manifest.json'],
    rawOutput: compact ? rawPath : null,
    pairedSeedResult: pairedSeed === null ? null : { seed: pairedSeed, commit: pairedResultCommit },
    omittedRawArtifacts: omittedRawArtifacts.map(({ fileName, role, schemaVersion, seed: artifactSeed,
      seconds: artifactSeconds, sizeBytes, sha256: digest, generationCommand, sourceCommit }) => ({
      fileName, role, sizeBytes, sha256: digest, schemaVersion,
      seed: artifactSeed, seconds: artifactSeconds, generationCommand, sourceCommit,
      sourceHashes, toolHashes
    })),
    preflightEnforcedByRunner: false,
    preflight: [
      `git ls-remote origin refs/heads/main must resolve to ${productionCommit}`,
      `git diff --exit-code ${baselineCommit} -- ${SOURCE_PATHS.join(' ')}`,
      `git diff --exit-code ${productionCommit} -- src/lib/agents/ant`
    ],
    reproduction: `node scripts/run-ant-material-formation-temporal-observer.js --seed=${seed} --seconds=${seconds} --baseline=${baselineCommit} --production=${productionRef} --production-commit=${productionCommit} --start-commit=${startCommit} --branch=${passBranch}${pairedSeed === null ? '' : ` --pair-seed=${pairedSeed} --pair-result-commit=${pairedResultCommit}`}${compact ? ` --compact --output=${dataPath} --raw-output=${rawPath}` : ` --output=${dataPath}`}`
  };
  await writeJson(output, 'manifest.json', manifest);
  console.log(JSON.stringify({ seed, seconds, analyses: records.length, decision: summary.decision,
    matchedPriorObservations: summary.matchedPriorObservations,
    continued: summary.continuedMatchedObservations, restarted: summary.restartedMatchedObservations,
    localLossReturnObservations: summary.sampledLossReturnMatchedObservations,
    parity: parity.firstMismatch ? 'failed' : 'exact', wallSeconds: {
      plain: plain.run.wallSeconds, observer: observed.run.wallSeconds
    } }));
}

async function run({ AntController, seed, seconds, ticks, observe }) {
  const start = performance.now();
  const random = rngFor(seed);
  const controller = new AntController({ random });
  const events = { contacts: [], plates: [], nodules: [], errors: [] };
  const pendingMaterialEvents = { plates: [], nodules: [] };
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') events.contacts.push(copyValue(payload));
    else if (type === 'plate-birth') { events.plates.push(copyValue(payload)); pendingMaterialEvents.plates.push(copyValue(payload)); }
    else if (type === 'sphere-birth') { events.nodules.push(copyValue(payload)); pendingMaterialEvents.nodules.push(copyValue(payload)); }
    else if (type === 'error') events.errors.push(copyValue(payload));
  });
  const materialHash = makeMaterialHasher(), birthHash = makeBirthHasher();
  const temporal = observe ? createTemporalObserver() : null;
  const rows = [], totals = { footContactGroups: 0, footContactPoints: 0, plateBirths: 0, noduleBirths: 0 };
  let intervalStart = null, ordinal = 0, readOnlyObservationChecks = 0;
  await controller.init();
  try {
    rows.push(parityRow(controller, random, events, materialHash, birthHash));
    if (temporal) intervalStart = materialIntervalSnapshot(controller, 0);
    for (let tick = 0; tick < ticks; tick += 1) {
      clearEvents(events);
      const previousAnalysis = controller.trailPlateBirth.lastAnalysisTimeMs;
      controller.tick(DT);
      const analysisTimeMs = controller.trailPlateBirth.lastAnalysisTimeMs;
      if (temporal && analysisTimeMs !== previousAnalysis) {
        const stateBeforeObservation = parityRow(controller, random, events, materialHash, birthHash);
        const production = controller.trailPlateBirth.buildSupportedMask(controller.surfaceField);
        const chemistry = controller.trailPlateBirth.chemicalMemory;
        const chemicalQualifiedMask = new Uint8Array(CELL_COUNT);
        const mechanicalSupport = new Float32Array(CELL_COUNT);
        const mechanicalQualifiedMask = new Uint8Array(CELL_COUNT);
        for (let index = 0; index < CELL_COUNT; index += 1) {
          const chemicalQualified = chemistry[index] >= TRAIL_PLATE_CHEMICAL_THRESHOLD;
          chemicalQualifiedMask[index] = chemicalQualified ? 1 : 0;
          const support = chemicalQualified ? production.supports[index]
            : controller.surfaceField.sampleSupport(index % GRID / (GRID - 1), Math.floor(index / GRID) / (GRID - 1), TRAIL_PLATE_SUPPORT_RADIUS);
          mechanicalSupport[index] = support;
          mechanicalQualifiedMask[index] = support >= TRAIL_PLATE_SUPPORT_THRESHOLD ? 1 : 0;
          assert.equal(production.mask[index], chemicalQualifiedMask[index] && mechanicalQualifiedMask[index] ? 1 : 0,
            `full-cell observer mask differs from production at cell ${index}`);
        }
        const candidate = makeCandidate(controller.trailPlateBirth);
        const priorMatch = candidate ? makePriorMatch(controller, intervalStart, analysisTimeMs) : null;
        const atBoundary = events.plates.map(plate => ({ id: plate.id,
          bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs, descriptorSha256: sha256(stableBytes(plate)) }));
        const nextOrdinal = ++ordinal;
        temporal.observe({ timeMs: analysisTimeMs, ordinal: nextOrdinal, intervalStart,
          birthsAtEndBoundary: atBoundary,
          materialChangesDuringInterval: copyValue(pendingMaterialEvents),
          chemicalMemory: chemistry, chemicalQualifiedMask, mechanicalSupport, mechanicalQualifiedMask,
          productionSupports: production.supports, supportedMask: production.mask,
          contactCounts: controller.trailPlateBirth.footContactCounts,
          candidate, priorMatch });
        const stateAfterObservation = parityRow(controller, random, events, materialHash, birthHash);
        assert.ok(stateBeforeObservation.equals(stateAfterObservation),
          `observer changed production state at analysis ${nextOrdinal}`);
        readOnlyObservationChecks += 1;
        intervalStart = materialIntervalSnapshot(controller, analysisTimeMs);
        pendingMaterialEvents.plates.length = 0;
        pendingMaterialEvents.nodules.length = 0;
      }
      const state = parityRow(controller, random, events, materialHash, birthHash);
      rows.push(state);
      totals.footContactGroups += events.contacts.length;
      totals.footContactPoints += events.contacts.reduce((sum, event) => sum + (event.contacts?.length || 0), 0);
      totals.plateBirths += events.plates.length;
      totals.noduleBirths += events.nodules.length;
      if ((tick + 1) % 3600 === 0) console.log(JSON.stringify({ seed, mode: observe ? 'observer' : 'plain',
        seconds: (tick + 1) / 60, population: controller.agents.length,
        analyses: ordinal, wallSeconds: (performance.now() - start) / 1000 }));
    }
    const finalMaterialInterval = temporal ? intervalStart : null;
    const finalSnapshot = makeFinalWorldSnapshot(controller, random, events);
    const finalSnapshotSha256 = sha256(stableBytes(finalSnapshot));
    const finalHashes = finalFieldHashes(controller, random, events, materialHash, birthHash);
    return {
      rows, temporal, finalSnapshot,
      run: { seed, observer: observe, seconds, ticks, initialState: controller.getState(),
        finalPopulation: controller.agents.length, totalSpawned: controller.totalSpawned,
        totalRetired: controller.totalRetired, rngState: random.state(), rngCalls: random.calls,
        simulationTimeMs: controller.simulationTimeMs, eventTotals: totals,
        readOnlyObservationChecks, finalFieldHashes: finalHashes, finalSnapshotSha256,
        contactCounts: observe ? controller.trailPlateBirth.footContactCounts.slice() : null,
        finalMaterialInterval, tailMaterialEvents: copyValue(pendingMaterialEvents),
        wallSeconds: (performance.now() - start) / 1000 }
    };
  } finally { unsubscribe(); await controller.destroy(); }
}

function makeCandidate(birth) {
  const candidate = birth.candidate;
  if (!candidate) return null;
  return {
    source: copyValue(candidate.source), target: copyValue(candidate.target),
    path: [...candidate.path], mask: Uint8Array.from(candidate.mask),
    startedAtMs: candidate.startedAtMs, stableSeconds: candidate.stableSeconds,
    similarity: candidate.similarity, geodesicLength: candidate.geodesicLength,
    footContacts: candidate.footContacts, meanChemical: candidate.meanChemical,
    meanSupport: candidate.meanSupport, repeatDiagnostics: copyValue(candidate.repeatDiagnostics),
    publicSummary: copyValue(birth.getSnapshot().candidate)
  };
}

function makePriorMatch(controller, intervalStart, timeMs) {
  const birth = controller.trailPlateBirth;
  const matchedId = birth.candidate?.repeatDiagnostics?.plateId;
  if (!matchedId) return null;
  const record = birth.birthRecords.find(item => item.id === matchedId);
  assert.ok(record && record.bornAtSimulationTimeMs < timeMs,
    'production repeat diagnostics must refer to prior material, never an ending-boundary birth');
  const descriptor = birth.plates.find(plate => plate.id === record.id);
  assert.ok(descriptor, `missing immutable prior descriptor ${record.id}`);
  const layerRelationship = materialRelationship(intervalStart, record.id, record.corridorMask);
  const postBirthFootContacts = Math.max(0, birth.countFootContacts(record.corridorMask) - record.footContactsAtBirth);
  return {
    id: record.id, bornAtSimulationTimeMs: record.bornAtSimulationTimeMs,
    ageMs: Math.max(0, timeMs - record.bornAtSimulationTimeMs),
    mask: Uint8Array.from(record.corridorMask), path: [...record.principalPath],
    maskSha256: sha256(Buffer.from(record.corridorMask)), pathSha256: sha256(stableBytes(record.principalPath)),
    postBirthFootContacts, footContactsAtBirth: record.footContactsAtBirth,
    currentRepeatDiagnostics: copyValue(birth.candidate.repeatDiagnostics),
    layerRelationship, descriptorSha256: sha256(stableBytes(descriptor))
  };
}

function materialIntervalSnapshot(controller, timeMs) {
  const stratigraphy = controller.materialStratigraphy;
  const snapshot = stratigraphy.getSnapshot();
  const columns = stratigraphy.columns;
  const offsets = new Uint32Array(CELL_COUNT + 1);
  let totalLayers = 0;
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    offsets[cell] = totalLayers;
    totalLayers += columns[cell]?.length || 0;
  }
  offsets[CELL_COUNT] = totalLayers;
  const columnPlateIndices = new Uint16Array(totalLayers);
  let cursor = 0;
  for (const column of columns) for (const plateIndex of column || []) columnPlateIndices[cursor++] = plateIndex;
  return {
    timeMs, plateIds: snapshot.plates.map(plate => plate.id),
    columnOffsets: offsets, columnPlateIndices,
    topLayerByCell: snapshot.stratigraphy.topLayerByCell.slice(),
    layerCountByCell: snapshot.stratigraphy.layerCountByCell.slice(),
    totalDepthByCellMeters: snapshot.stratigraphy.totalDepthByCellMeters.slice(),
    layerOrder: [...snapshot.stratigraphy.layerOrder], layers: copyValue(snapshot.layers),
    noduleIds: snapshot.nodules.map(nodule => nodule.id), revision: snapshot.revision,
    noduleRevision: snapshot.noduleRevision
  };
}

function materialRelationship(start, priorId, mask) {
  const index = start.plateIds.indexOf(priorId);
  if (index < 0) return { priorPlateId: priorId, presentInStart: false };
  let maskCells = 0, cellsInColumn = 0, exposedCells = 0, buriedCells = 0, totalLayersAbove = 0;
  const depthHistogram = {};
  for (let cell = 0; cell < mask.length; cell += 1) {
    if (!mask[cell]) continue;
    maskCells += 1;
    const from = start.columnOffsets[cell], to = start.columnOffsets[cell + 1];
    let position = -1;
    for (let offset = from; offset < to; offset += 1) if (start.columnPlateIndices[offset] === index) position = offset;
    if (position < 0) continue;
    cellsInColumn += 1;
    const above = to - position - 1;
    totalLayersAbove += above;
    depthHistogram[above] = (depthHistogram[above] || 0) + 1;
    if (above) buriedCells += 1; else exposedCells += 1;
  }
  return { priorPlateId: priorId, presentInStart: true, maskCells, cellsInColumn,
    exposedCells, buriedCells, meanLayersAbove: cellsInColumn ? totalLayersAbove / cellsInColumn : 0,
    layersAboveHistogram: depthHistogram };
}

function makeBoundaryTail(records, finalCounts, finalMaterialInterval, events, horizonMs) {
  if (!records.length) return { startTimeMs: null, endTimeMs: horizonMs, durationMs: horizonMs,
    contactIncrements: null, intervalStartMaterial: null, materialChanges: events };
  const last = records.at(-1);
  const increments = differenceCounters(last.contactCounts, finalCounts);
  return { startTimeMs: last.timeMs, endTimeMs: horizonMs, durationMs: horizonMs - last.timeMs,
    contactCountsAtLastAnalysis: last.contactCounts, contactCountsAtRunEnd: finalCounts,
    contactIncrements: increments, totalFreshContacts: increments.reduce((sum, value) => sum + value, 0),
    intervalStartMaterial: finalMaterialInterval, materialChanges: events,
    eligibilityObservation: 'none; formation analysis did not sample at this run boundary' };
}

function summarizeCases(records, temporalSummary, boundary, boundaryTail, seed, seconds) {
  const matched = records.filter(row => row.priorMatch);
  const continued = matched.filter(row => row.candidateTransition === 'CONTINUED');
  const restarted = matched.filter(row => row.candidateTransition === 'RESTARTED');
  const localReturnRows = matched.filter(row => row.sampledLocalReturnInsidePriorMask > 0);
  const priorContinuouslyEligible = matched.filter(row => row.priorMaskContinuouslyEligibleCellCount > 0);
  const summaryGroups = groupBy(matched, row => currentSummaryKey(row));
  const temporalVariants = [...summaryGroups.values()].filter(group => group.length > 1
    && new Set(group.map(temporalSignature)).size > 1);
  const candidatePriorGroups = groupBy(matched, row => JSON.stringify([
    row.priorMatch?.id || null, row.candidateIdentity
  ]));
  const comparableGroups = comparableLineageGroups(matched);
  const repeatedSummaryGroups = [...summaryGroups.values()].filter(group => group.length > 1);
  const missingNaturalCases = [];
  if (!continued.length) missingNaturalCases.push('matched-prior continued candidate observations');
  if (!restarted.length) missingNaturalCases.push('matched-prior restarted candidate observations');
  if (!localReturnRows.length) missingNaturalCases.push('sampled local eligibility loss-to-return observations inside prior masks');
  if (!priorContinuouslyEligible.length) missingNaturalCases.push('currently eligible prior-mask cells with no sampled loss since the first observation');
  if (!comparableGroups.length) missingNaturalCases.push('same prior Plate and exact candidate geometry observed with both continued and restarted lineages');
  const hasRequiredCases = continued.length > 0 && restarted.length > 0
    && localReturnRows.length > 0 && priorContinuouslyEligible.length > 0
    && comparableGroups.length > 0;
  const decision = !hasRequiredCases ? 'INSUFFICIENT NATURAL CASES'
    : temporalVariants.length ? 'OMITTED TEMPORAL INFORMATION OBSERVED'
      : repeatedSummaryGroups.length ? 'TEMPORAL INFORMATION NOT SUPPORTED'
        : 'MIXED / INCONCLUSIVE';
  return {
    seed, seconds, analysisCount: records.length,
    matchedPriorObservations: matched.length,
    continuedMatchedObservations: continued.length,
    restartedMatchedObservations: restarted.length,
    absentOrDisappearedMatchedObservations: matched.filter(row => ['ABSENT', 'DISAPPEARED'].includes(row.candidateTransition)).length,
    sampledLossReturnMatchedObservations: localReturnRows.length,
    sampledLocalReturnCellTransitions: localReturnRows.reduce((sum, row) => sum + row.sampledLocalReturnInsidePriorMask, 0),
    sampledEligibilityLossPriorMaskObservations: matched.filter(row => row.eligibilityLossInsidePriorMask > 0).length,
    continuouslyEligibleMatchedObservations: priorContinuouslyEligible.length,
    candidateRestartWithoutLocalLossMatchedObservations: restarted.filter(row => row.candidateRestartWithoutLocalLoss).length,
    localLossOrReturnWithoutCandidateRestartMatchedObservations: matched.filter(row => row.localReturnWithoutCandidateRestart
      || (row.candidateTransition !== 'RESTARTED' && row.eligibilityLossCellCount > 0)).length,
    localReturnInsidePriorMaskWithoutCandidateRestartObservations: matched.filter(row =>
      row.candidateTransition !== 'RESTARTED' && row.sampledLocalReturnInsidePriorMask > 0).length,
    candidateRestartAndLocalReturnSameObservation: restarted.filter(row => row.sampledLocalReturnCellCount > 0).length,
    priorMatchChangesWithinMatchedObservations: matched.filter(row => row.priorMatchChange.kind === 'CHANGED').length,
    matchedPriorPlateIds: [...new Set(matched.map(row => row.priorMatch.id))],
    spatialProfilesByMatchedCandidateTransition: Object.fromEntries(['CONTINUED', 'RESTARTED'].map(kind =>
      [kind, summarizeSpatial(matched.filter(row => row.candidateTransition === kind))])),
    spatialProfilesByMatchedPriorReturn: {
      withSampledReturn: summarizeSpatial(localReturnRows),
      withoutSampledReturn: summarizeSpatial(matched.filter(row => row.sampledLocalReturnInsidePriorMask === 0))
    },
    exactCurrentSummaryGroups: summaryGroups.size,
    repeatedCurrentSummaryGroups: repeatedSummaryGroups.length,
    candidatePriorGeometryGroups: candidatePriorGroups.size,
    comparableContinuedRestartedGeometryPriorGroups: comparableGroups.length,
    groupsWithDifferentTemporalSignatures: temporalVariants.length,
    exactCurrentSummaryComparisons: [...summaryGroups.entries()].filter(([, group]) => group.length > 1)
      .map(([key, group]) => ({ summarySha256: key, observations: group.map(row => ({
        ordinal: row.ordinal, timeMs: row.timeMs, candidateTransition: row.candidateTransition,
        priorPlateId: row.priorMatch.id, temporalSignatureSha256: temporalSignature(row)
      })) })),
    currentSummaryKeyFields: ['candidate identity/mask, stableSeconds, similarity, meanChemical, meanSupport, cumulative candidate contacts, prior Plate ID/age/post-birth contacts/repeat gates, and interval-start ordered material columns'],
    exactCurrentSummaryKeyUse: 'Strict equality is reported as a diagnostic only. It is not used to decide whether natural comparator cases exist because prior age and cumulative fields can make later observations unique.',
    candidatePriorComparisonKeyFields: ['exact candidate source/target/path/mask identity', 'exact matched prior Plate ID'],
    temporalSignatureFields: ['cell-level eligibility transition masks, sampled loss/return, fresh-contact distribution, chemical/mechanical/combined qualification onsets, prior-mask zero-contact durations'],
    missingNaturalCases,
    decision, decisionBasis: decision === 'INSUFFICIENT NATURAL CASES'
      ? `Required natural comparison absent: ${missingNaturalCases.join('; ')}. No further seed was run.`
      : decision === 'OMITTED TEMPORAL INFORMATION OBSERVED'
        ? 'At least one exact current-summary group contains multiple observed temporal signatures. This supports only omitted observability, not a new production mechanism or material outcome.'
        : decision === 'TEMPORAL INFORMATION NOT SUPPORTED'
          ? 'Natural comparisons exist and repeated exact current-summary groups did not show a differing recorded temporal signature.'
          : 'Same-geometry prior comparisons exist, but full current-summary values differ across observations; those differences prevent attributing the temporal variation beyond current summaries.',
    nextPass: decision === 'INSUFFICIENT NATURAL CASES'
      ? 'Run one additional fixed-seed temporal-observer pass, chosen before execution, without pooling it into this seed.'
      : decision === 'OMITTED TEMPORAL INFORMATION OBSERVED'
        ? 'Test one smallest shadow discriminator: whether the recorded local return/contact map predicts a spatial distinction after matching current summaries; keep production unchanged.'
        : decision === 'TEMPORAL INFORMATION NOT SUPPORTED'
          ? 'Park richer history representation; no additional formation state is supported by this observation.'
          : 'Define one production-grounded current-state comparison before any additional seed; keep exact values, add no thresholds, and leave production unchanged.',
    temporalObserver: temporalSummary, runBoundary: boundary, runBoundaryContactTail: boundaryTail,
    continuousEligibilityDefinition: 'A cell is counted continuously eligible within a matched prior mask when it is eligible now and no sampled loss was recorded since the first formation observation. This is left-censored before that first observation.',
    oneSecondSamplingLimit: 'Absence between consecutive formation samples is not observable; all loss/return statements are sampled at the production analysis cadence.'
  };
}

function summarizeSpatial(rows) {
  const contacts = rows.map(row => row.freshContactsInsidePriorMask).filter(Number.isFinite).sort((a, b) => a - b);
  const durations = rows.flatMap(row => row.zeroIncrementDurationMs || []).filter(Number.isFinite).sort((a, b) => a - b);
  const total = key => rows.reduce((sum, row) => sum + (Number.isFinite(row[key]) ? row[key] : 0), 0);
  return {
    observations: rows.length,
    priorMaskFreshContactTotal: total('freshContactsInsidePriorMask'),
    priorMaskFreshContactsPerObservation: numericDistribution(contacts),
    priorMaskOnsetCellTotals: {
      chemical: total('chemicalQualificationOnsetInsidePriorMask'),
      mechanicalSupport: total('mechanicalSupportOnsetInsidePriorMask'),
      combined: total('combinedQualificationOnsetInsidePriorMask')
    },
    priorMaskEligibilityTransitionCellTotals: {
      loss: total('eligibilityLossInsidePriorMask'),
      sampledReturn: total('sampledLocalReturnInsidePriorMask')
    },
    priorMaskZeroIncrementDurationsMs: numericDistribution(durations),
    candidateGeometryCount: new Set(rows.map(row => row.candidateIdentity).filter(Boolean)).size,
    priorPlateCount: new Set(rows.map(row => row.priorMatch?.id).filter(Boolean)).size
  };
}
function numericDistribution(sorted) {
  if (!sorted.length) return { count: 0, min: null, median: null, max: null, mean: null };
  return { count: sorted.length, min: sorted[0], median: sorted[Math.floor((sorted.length - 1) / 2)],
    max: sorted.at(-1), mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length };
}

function currentSummaryKey(row) {
  const c = row.candidate, p = row.priorMatch;
  const summary = { candidateIdentity: row.candidateIdentity, stableSeconds: c?.stableSeconds,
    similarity: c?.similarity, meanChemical: c?.meanChemical, meanSupport: c?.meanSupport,
    candidateContacts: c?.footContacts, priorId: p?.id, priorAgeMs: p?.ageMs,
    postBirthFootContacts: p?.postBirthFootContacts, repeat: c?.repeatDiagnostics,
    currentRepeat: p?.currentRepeatDiagnostics,
    birthReadiness: c?.publicSummary && { qualified: c.publicSummary.qualified,
      birthReady: c.publicSummary.birthReady, globalGapRemainingSeconds: c.publicSummary.globalGapRemainingSeconds,
      repeat: c.publicSummary.repeat },
    priorLayerRelationship: p?.layerRelationship,
    intervalStartPlateIds: row.plateIdsAtIntervalStart,
    columnOffsets: row.intervalStart.columnOffsets, columnPlateIndices: row.intervalStart.columnPlateIndices
  };
  return sha256(stableBytes(summary));
}
export function comparableLineageGroups(rows) {
  const groups = groupBy(rows.filter(row => row.priorMatch?.id && row.candidateIdentity
    && ['CONTINUED', 'RESTARTED'].includes(row.candidateTransition)), row =>
    JSON.stringify([row.priorMatch.id, row.candidateIdentity]));
  return [...groups.values()].filter(group => group.some(row => row.candidateTransition === 'CONTINUED')
    && group.some(row => row.candidateTransition === 'RESTARTED'));
}
export function comparatorGroupEvidence(records) {
  const groups = comparableLineageGroups(records);
  return {
    schemaVersion: 1,
    comparisonKeyFields: ['exact matched prior Plate ID', 'exact candidate source/target/path/mask identity'],
    comparatorGroupCount: groups.length,
    groups: groups.map(rows => ({
      priorPlateId: rows[0].priorMatch.id,
      candidateIdentity: rows[0].candidateIdentity,
      continuedObservationCount: rows.filter(row => row.candidateTransition === 'CONTINUED').length,
      restartedObservationCount: rows.filter(row => row.candidateTransition === 'RESTARTED').length,
      observations: rows
    }))
  };
}
export function finalizePairedDecision(summary, pairedSeed, pairedResultCommit) {
  if (summary.comparableContinuedRestartedGeometryPriorGroups > 0) return summary;
  return {
    ...summary,
    withinSeedDecision: summary.decision,
    decision: 'TEMPORAL HISTORY PARK — CURRENT PRIORITY',
    decisionBasis: `The bounded results at seeds ${pairedSeed} (commit ${pairedResultCommit}) and ${summary.seed} contain no strict same-prior, same-geometry continued/restarted comparator. Stop seed hunting; this absence does not show temporal history never matters.`,
    nextPass: 'Return to the previously parked Plate sonic-individuality/audio investigation.'
  };
}
function temporalSignature(row) {
  return sha256(Buffer.concat([
    typedBytes(row.contactIncrements), typedBytes(row.chemicalQualificationOnsetMask),
    typedBytes(row.mechanicalSupportOnsetMask), typedBytes(row.combinedQualificationOnsetMask),
    typedBytes(row.eligibilityLossMask), typedBytes(row.sampledLocalReturnMask),
    stableBytes(row.zeroIncrementDurationMs)
  ]));
}
function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row), group = groups.get(key) || [];
    group.push(row); groups.set(key, group);
  }
  return groups;
}
function csvText(rows) {
  const columns = ['ordinal', 'timeMs', 'intervalDurationMs', 'priorPlateId', 'priorAgeMs', 'candidateTransition',
    'candidateIdentity', 'candidateSwitch', 'stableSeconds', 'similarity', 'meanChemical', 'meanSupport',
    'candidateContacts', 'postBirthFootContacts', 'freshContactsInsidePriorMask', 'freshContactsInsideCandidateMask',
    'priorMaskCellCount', 'priorMaskContinuouslyEligibleCellCount', 'eligibilityLossInsidePriorMask',
    'sampledLocalReturnInsidePriorMask', 'candidateTerritoryLossCellCount', 'candidateTerritoryReturnCellCount',
    'candidateRestartWithoutLocalLoss', 'localReturnWithoutCandidateRestart',
    'chemicalQualificationOnsetInsidePriorMask', 'mechanicalSupportOnsetInsidePriorMask',
    'combinedQualificationOnsetInsidePriorMask', 'priorMatchChange', 'columnRelationship'];
  const lines = [columns.join(',')];
  for (const row of rows) {
    const values = [row.ordinal, row.timeMs, row.intervalDurationMs, row.priorMatch.id, row.priorMatch.ageMs,
      row.candidateTransition, row.candidateIdentity, row.candidateSwitch, row.candidate?.stableSeconds,
      row.candidate?.similarity, row.candidate?.meanChemical, row.candidate?.meanSupport,
      row.candidate?.footContacts, row.priorMatch.postBirthFootContacts,
      row.freshContactsInsidePriorMask, row.freshContactsInsideCandidateMask,
      row.priorMaskCellCount, row.priorMaskContinuouslyEligibleCellCount, row.eligibilityLossInsidePriorMask,
      row.sampledLocalReturnInsidePriorMask, row.candidateTerritoryLossCellCount, row.candidateTerritoryReturnCellCount,
      row.candidateRestartWithoutLocalLoss, row.localReturnWithoutCandidateRestart,
      row.chemicalQualificationOnsetInsidePriorMask, row.mechanicalSupportOnsetInsidePriorMask,
      row.combinedQualificationOnsetInsidePriorMask, row.priorMatchChange.kind,
      JSON.stringify(row.priorMatch.layerRelationship)];
    lines.push(values.map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

function parityRow(c, random, events, materialHash, birthHash) {
  const lifecycle = { state: c.state, simulationTimeMs: c.simulationTimeMs, nextSpawnTimeMs: c.nextSpawnTimeMs,
    nextAgentId: c.nextAgentId, totalSpawned: c.totalSpawned, totalRetired: c.totalRetired,
    accumulatorMs: c.accumulatorMs, initialized: c.initialized, running: c.running };
  const value = {
    agents: JSON.stringify(c.agents), lifecycle, rng: { state: random.state(), calls: random.calls },
    pheromone: c.field, surfaceField: c.surfaceField, gait: c.gaitController.ants,
    bodyPose: c.bodyPoseController.ants, gasterDeposition: c.gasterDeposition,
    colonyActivation: c.colonyActivation, localOccupancy: c.occupancy, footContacts: events.contacts,
    materialBirthEvents: { plates: events.plates, nodules: events.nodules, errors: events.errors },
    trailPlateBirth: birthHash(c.trailPlateBirth), materialStratigraphy: materialHash(c.materialStratigraphy)
  };
  return Buffer.concat(FIELDS.map(name => hashValue(value[name])));
}
function makeMaterialHasher() {
  const dynamic = new Set(['simulationTimeMs', 'lastAdvanceTimeMs', 'lastNoduleEvaluationTimeMs',
    'totalAcceptedFootContacts', 'rejectedFootContacts', 'qualifiedNoduleCandidateCount',
    'footLoadByCell', 'candidateSinceMs', '_plateHistory']);
  let key = null, structure = null;
  return material => {
    const revision = material.revision + ':' + material.noduleRevision;
    if (revision !== key) {
      const stable = {};
      for (const name of Object.keys(material).sort()) if (!dynamic.has(name)) stable[name] = material[name];
      structure = hashValue(stable); key = revision;
    }
    const changing = {};
    for (const name of [...dynamic].sort()) if (Object.hasOwn(material, name)) changing[name] = material[name];
    return hashValue({ structure, changing });
  };
}
function makeBirthHasher() {
  let key = null, descriptors = null;
  return birth => {
    const counts = birth.plates.length + ':' + birth.birthRecords.length;
    if (counts !== key) { descriptors = hashValue({ plates: birth.plates, birthRecords: birth.birthRecords }); key = counts; }
    const candidate = birth.candidate;
    const scalars = candidate ? { ...candidate, mask: undefined, supportedMask: undefined,
      component: undefined, skeletonIndices: undefined, path: undefined } : null;
    return hashValue({ descriptors, scalars, arrays: candidate
      ? [candidate.mask, candidate.supportedMask, candidate.component, candidate.path, candidate.skeletonIndices] : [],
      chemicalMemory: birth.chemicalMemory, footContactCounts: birth.footContactCounts,
      lastInputDiagnostics: birth.lastInputDiagnostics, lastAnalysisTimeMs: birth.lastAnalysisTimeMs,
      lastBirthTimeMs: birth.lastBirthTimeMs });
  };
}
function compareRows(plain, observed, seed) {
  if (plain.length !== observed.length) return { seed, comparedTicks: Math.min(plain.length, observed.length),
    firstMismatch: { tick: null, field: 'rowCount' }, fields: {} };
  const chains = Object.fromEntries(FIELDS.map(name => [name,
    { plain: createHash('sha256'), observer: createHash('sha256'), match: true }]));
  let firstMismatch = null;
  for (let tick = 0; tick < plain.length; tick += 1) {
    for (let fieldIndex = 0; fieldIndex < FIELDS.length; fieldIndex += 1) {
      const name = FIELDS[fieldIndex], offset = fieldIndex * 32;
      const plainHash = plain[tick].subarray(offset, offset + 32);
      const observerHash = observed[tick].subarray(offset, offset + 32);
      chains[name].plain.update(plainHash); chains[name].observer.update(observerHash);
      if (!plainHash.equals(observerHash)) {
        chains[name].match = false;
        if (!firstMismatch) firstMismatch = { tick, field: name, simulationTimeSeconds: tick / 60,
          plainSha256: plainHash.toString('hex'), observerSha256: observerHash.toString('hex') };
      }
    }
  }
  return { seed, comparedTicks: plain.length, firstMismatch,
    fields: Object.fromEntries(FIELDS.map(name => [name, {
      plainSha256: chains[name].plain.digest('hex'), observerSha256: chains[name].observer.digest('hex'),
      match: chains[name].match
    }])) };
}
export function compactParityEvidence(seed, seconds, plain, observer, parity) {
  const domains = Object.fromEntries(Object.entries(parity.fields).map(([name, hashes]) => [name, {
    plainSha256: hashes.plainSha256, observerSha256: hashes.observerSha256, match: hashes.match
  }]));
  const domainsMatch = Object.values(domains).every(domain => domain.match);
  const rng = {
    plainState: plain.rngState, observerState: observer.rngState,
    plainCalls: plain.rngCalls, observerCalls: observer.rngCalls,
    stateMatch: plain.rngState === observer.rngState,
    callsMatch: plain.rngCalls === observer.rngCalls
  };
  const finalWorld = {
    plainSha256: plain.finalSnapshotSha256, observerSha256: observer.finalSnapshotSha256,
    match: plain.finalSnapshotSha256 === observer.finalSnapshotSha256
  };
  const finalFieldHashesMatch = stableBytes(plain.finalFieldHashes).equals(stableBytes(observer.finalFieldHashes));
  const eventTotalsMatch = stableBytes(plain.eventTotals).equals(stableBytes(observer.eventTotals));
  return {
    schemaVersion: 1, seed, seconds, fixedHz: 60, ticksCompared: parity.comparedTicks,
    domains, domainsMatch, firstMismatch: parity.firstMismatch,
    rng, finalFieldHashesMatch, eventTotalsMatch,
    finalWorld, observerNonmutationChecks: observer.readOnlyObservationChecks,
    match: !parity.firstMismatch && domainsMatch && rng.stateMatch && rng.callsMatch
      && finalFieldHashesMatch && eventTotalsMatch && finalWorld.match
  };
}
function finalFieldHashes(c, random, events, materialHash, birthHash) {
  const row = parityRow(c, random, events, materialHash, birthHash);
  return Object.fromEntries(FIELDS.map((name, index) => [name, row.subarray(index * 32, index * 32 + 32).toString('hex')]));
}
function makeFinalWorldSnapshot(c, random, events) {
  const lifecycle = { state: c.state, simulationTimeMs: c.simulationTimeMs, nextSpawnTimeMs: c.nextSpawnTimeMs,
    nextAgentId: c.nextAgentId, totalSpawned: c.totalSpawned, totalRetired: c.totalRetired,
    accumulatorMs: c.accumulatorMs, initialized: c.initialized, running: c.running };
  return {
    agents: copyValue(c.agents), lifecycle, rng: { state: random.state(), calls: random.calls },
    pheromone: c.field.getSnapshot(), surfaceField: c.surfaceField.getSnapshot(),
    gait: copyValue(c.gaitController.ants), bodyPose: copyValue(c.bodyPoseController.ants),
    gasterDeposition: copyValue(c.gasterDeposition), colonyActivation: copyValue(c.colonyActivation),
    localOccupancy: copyValue(c.occupancy), finalTickEvents: copyValue(events),
    trailPlateBirth: copyValue(c.trailPlateBirth), materialStratigraphy: copyValue(c.materialStratigraphy)
  };
}
function rngFor(seed) {
  let state = seed >>> 0;
  const random = () => { random.calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  random.calls = 0; random.state = () => state;
  return random;
}
function clearEvents(events) {
  events.contacts.length = 0; events.plates.length = 0; events.nodules.length = 0; events.errors.length = 0;
}
function copyValue(value) {
  if (ArrayBuffer.isView(value)) return new value.constructor(value);
  if (value instanceof Map) return { $map: [...value].map(([key, item]) => [copyValue(key), copyValue(item)]) };
  if (value instanceof Set) return { $set: [...value].map(copyValue) };
  if (Array.isArray(value)) return value.map(copyValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyValue(item)]));
  return value;
}
function encodeValue(value) {
  if (ArrayBuffer.isView(value)) return { encoding: 'base64', type: value.constructor.name,
    length: value.length, data: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') };
  if (value instanceof Map) return { encoding: 'entries', type: 'Map', data: [...value].map(([key, item]) => [encodeValue(key), encodeValue(item)]) };
  if (value instanceof Set) return { encoding: 'values', type: 'Set', data: [...value].map(encodeValue) };
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
  return value;
}
function stableBytes(value) { return Buffer.from(JSON.stringify(encodeValue(value))); }
function typedBytes(value) { return ArrayBuffer.isView(value)
  ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : Buffer.alloc(0); }
function hashValue(value) {
  const hash = createHash('sha256');
  appendValue(hash, value, new WeakSet());
  return hash.digest();
}
function appendValue(hash, value, parents) {
  if (value === null) { hash.update('null;'); return; }
  if (value === undefined) { hash.update('undefined;'); return; }
  if (typeof value === 'string') { hash.update(`s${value.length}:${value}`); return; }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') { hash.update(`${typeof value}:${String(value)};`); return; }
  if (typeof value === 'function') { hash.update(`fn:${value.name || ''};`); return; }
  if (ArrayBuffer.isView(value)) { hash.update(`${value.constructor.name}:${value.byteLength}:`).update(typedBytes(value)); return; }
  if (value instanceof ArrayBuffer) { hash.update(`ab:${value.byteLength}:`).update(Buffer.from(value)); return; }
  if (parents.has(value)) { hash.update('[cycle];'); return; }
  parents.add(value);
  if (Array.isArray(value)) {
    hash.update(`array:${value.length}[`); for (const item of value) appendValue(hash, item, parents); hash.update('];');
  } else if (value instanceof Map) {
    const entries = [...value.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    hash.update(`map:${entries.length}{`);
    for (const [key, item] of entries) { appendValue(hash, key, parents); appendValue(hash, item, parents); }
    hash.update('};');
  } else if (value instanceof Set) {
    const entries = [...value].sort((a, b) => String(a).localeCompare(String(b)));
    hash.update(`set:${entries.length}{`); for (const item of entries) appendValue(hash, item, parents); hash.update('};');
  } else {
    const keys = Object.keys(value).sort();
    hash.update(`object:${keys.length}{`);
    for (const key of keys) { hash.update(`key:${key.length}:${key}`); appendValue(hash, value[key], parents); }
    hash.update('};');
  }
  parents.delete(value);
}
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(Number(value.toFixed(6))) : String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
async function writeJson(dir, name, value) { await writeFile(resolve(dir, name), `${JSON.stringify(encodeValue(value), null, 2)}\n`); }
