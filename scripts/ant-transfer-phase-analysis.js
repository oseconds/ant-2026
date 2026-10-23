import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_MATRIX_DIR = 'docs/ant/evidence/2026-10-23-natural-field-transfer/capture/matrix-20261023';
const DEFAULT_COHORT_MANIFEST = 'docs/ant/evidence/2026-10-23-natural-field-transfer/phase/phase-cohort-20261023-manifest.json';
const DEFAULT_OUTPUT_DIR = 'docs/ant/evidence/2026-10-23-natural-field-transfer/phase/analysis';
const MATRIX_SCHEMA = 'ant-natural-field-transfer-matrix-manifest/v1';
const COHORT_SCHEMA = 'ant-natural-field-transfer-phase-cohort-manifest/v1';
const PHASE_SCHEMA = 'ant-natural-field-transfer-phase-qualification/v1';
const STATE_SCHEMA = 'ant-natural-field-transfer-state/v1';
const STREAM_SCHEMA = 'ant-natural-field-transfer-write-stream/v1';
const RNG_ALGORITHM = 'lcg-1664525-1013904223-u32';
const MODES = ['production', 'dtFeedback', 'dampingOff'];
const PHASES = ['p00', 'p10', 'p01', 'p11'];
const SECONDS = [30, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600];
const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
const SOURCE_ROOTS = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'scripts/ant-transfer-state.js',
  'scripts/ant-transfer-capture.js', 'scripts/ant-transfer-matrix.js'
];

/** Validate all frozen inputs and summarize the full fixed cohort before writing any output. */
export async function analyzeTransferPhaseCohort({
  matrixDir = DEFAULT_MATRIX_DIR,
  cohortManifestPath = DEFAULT_COHORT_MANIFEST,
  outputDir = DEFAULT_OUTPUT_DIR,
  writeOutputs = true
} = {}) {
  const matrixRoot = resolveInsideProject(matrixDir);
  const cohortPath = resolveInsideProject(cohortManifestPath);
  const outputRoot = resolveInsideProject(outputDir);
  const matrixBytes = await readFile(path.join(matrixRoot, 'matrix-manifest.json'));
  const matrix = JSON.parse(matrixBytes.toString('utf8'));
  assert.equal(matrix.schema, MATRIX_SCHEMA, 'Unsupported matrix manifest.');
  assert.equal(matrix.captures?.length, 66, 'The preregistered matrix must contain exactly 66 captures.');
  const matrixManifestSha256 = sha256(matrixBytes);

  const cohortBytes = await readFile(cohortPath);
  const cohort = JSON.parse(cohortBytes.toString('utf8'));
  assert.equal(cohort.schema, COHORT_SCHEMA, 'Unsupported phase cohort manifest.');
  assert.equal(cohort.captureCount, 66, 'The cohort manifest must declare 66 captures.');
  assert.equal(cohort.receiptCount, 66, 'The cohort manifest must declare 66 receipts.');
  assert.equal(cohort.matrixManifestSha256, matrixManifestSha256,
    'The phase cohort points to a different matrix manifest.');
  assert.equal(cohort.matrixManifestPath,
    path.relative(PROJECT_ROOT, path.join(matrixRoot, 'matrix-manifest.json')).replaceAll(path.sep, '/'),
    'The phase cohort names a different matrix manifest path.');
  assert.equal(cohort.phaseZeroPassedCount, 66, 'Every receipt must pass phase-zero qualification.');
  const expectedIds = new Set(matrix.captures.map(row => row.captureId));
  const receiptById = new Map((cohort.receipts || []).map(row => [row.captureId, row]));
  assert.equal(receiptById.size, 66, 'Cohort receipt capture IDs must be unique.');
  assert.deepEqual([...receiptById.keys()].sort(), [...expectedIds].sort(),
    'The phase cohort must cover the exact preregistered matrix capture set.');
  validateFixedCohort(matrix.captures);

  const runnerHashes = new Set((cohort.runnerRevisions || []).map(row => row.sha256));
  assert.ok(runnerHashes.size > 0, 'Cohort manifest must receipt every phase runner revision.');
  const currentSourceHashes = await hashFiles(SOURCE_ROOTS);
  for (const [relative, expected] of Object.entries(matrix.sources?.sourceHashes || {})) {
    assert.equal(currentSourceHashes[relative], expected,
      `Current source differs from the frozen matrix source: ${relative}`);
  }
  for (const relative of SOURCE_ROOTS) {
    assert.ok(matrix.sources?.sourceHashes?.[relative], `Matrix manifest lacks a source hash for ${relative}.`);
  }
  const phaseHelperHash = sha256(await readFile(path.join(PROJECT_ROOT, 'scripts/ant-transfer-phase.js')));
  const currentRunnerHash = sha256(await readFile(path.join(PROJECT_ROOT, 'scripts/ant-transfer-phase-runs.js')));
  assert.ok(runnerHashes.has(currentRunnerHash), 'Current phase runner is not listed in the cohort runner revisions.');
  await verifyRunnerRevisionSources(cohort.runnerRevisions, cohort.receipts, currentRunnerHash);

  const matrixCaptureById = new Map(matrix.captures.map(row => [row.captureId, row]));
  const stateReceipts = [];
  const phaseResults = [];
  const receiptsByHistory = new Map();
  for (const row of cohort.receipts) {
    const matrixCapture = matrixCaptureById.get(row.captureId);
    const historyReceipt = matrix.histories?.find(item => item.originPolicy === matrixCapture.originPolicy
      && item.seed === matrixCapture.seed);
    assert.ok(historyReceipt, `Matrix history receipt missing for ${row.captureId}.`);
    const historyPath = safeRelative(historyReceipt.path);
    const key = `${historyPath}/${historyReceipt.originPolicy}/${historyReceipt.seed}`;
    if (!receiptsByHistory.has(key)) receiptsByHistory.set(key, { receipt: historyReceipt, rows: [] });
    receiptsByHistory.get(key).rows.push(row);
  }
  for (const { receipt: historyReceipt, rows } of receiptsByHistory.values()) {
    const historyPath = safeRelative(historyReceipt.path);
    const stream = await readGzipJson(path.join(matrixRoot, historyPath), historyReceipt.sha256,
      historyReceipt.compressedBytes, historyReceipt.uncompressedBytes, STREAM_SCHEMA,
      `write stream ${historyPath}`);
    assert.equal(stream.originPolicy, historyReceipt.originPolicy);
    assert.equal(stream.seed, historyReceipt.seed);
    for (const row of rows) {
      const matrixCapture = matrixCaptureById.get(row.captureId);
      const state = await readMatrixState(matrixRoot, matrixCapture, matrix, currentSourceHashes);
      verifyCohortReceiptRow(row, state, matrixCapture, matrixManifestSha256, phaseHelperHash, runnerHashes);
      const run = await readGzipJson(path.join(PROJECT_ROOT, safeRelative(row.outputPath)), row.outputSha256,
        row.compressedBytes, row.uncompressedBytes, PHASE_SCHEMA, `phase receipt ${row.captureId}`);
      verifyPhaseRun(run, row, state, matrix, matrixManifestSha256);
      verifyStateHistory(state, stream, historyReceipt, run);
      stateReceipts.push({ captureId: row.captureId, statePath: matrixCapture.path,
        stateSha256: matrixCapture.sha256, frozenInputSha256: state.frozenInputSha256,
        writeStreamPath: state.writeStream.path, writeStreamSha256: historyReceipt.sha256 });
      phaseResults.push(analyzeCapture(run, state));
    }
  }

  const grouped = summarizeBySeedAndOrigin(phaseResults);
  const result = {
    schema: 'ant-natural-field-transfer-phase-analysis/v1',
    status: 'complete-fixed-cohort-descriptive-analysis',
    scope: 'All 66 preregistered complete states; p00 versus p10/p01/p11 paired within each movement arm and frozen state.',
    limitations: [
      'Conditional one-tick read/write phase contrast; it does not estimate pheromone total contribution or dominance.',
      'A decision or random-draw branch divergence breaks common-random-number interpretation downstream; later per-ant stage contrasts remain conditional observations.',
      'Ant-state observations repeat within six seed/origin histories and are not independent replicates.',
      'Phase translation has finite-boundary, accepted-dose, cap-storage, and raw-snapshot/material-consumer limits recorded below.'
    ],
    inputReceipts: { matrixManifestPath: path.relative(PROJECT_ROOT, path.join(matrixRoot, 'matrix-manifest.json')).replaceAll(path.sep, '/'),
      matrixManifestSha256, cohortManifestPath: path.relative(PROJECT_ROOT, cohortPath).replaceAll(path.sep, '/'),
      cohortManifestSha256: sha256(cohortBytes), cohortManifestSchema: cohort.schema,
      captureCount: phaseResults.length, runnerRevisions: cohort.runnerRevisions,
      frozenSourceHashes: currentSourceHashes, phaseHelperSha256: phaseHelperHash,
      currentRunnerSha256: currentRunnerHash, stateReceipts, receiptHashes: cohort.receipts.map(row => ({
        captureId: row.captureId, path: row.outputPath, sha256: row.outputSha256,
        compressedBytes: row.compressedBytes, uncompressedBytes: row.uncompressedBytes })) },
    qualification: { phaseZeroPassedCount: cohort.phaseZeroPassedCount,
      p00RasterExactCount: phaseResults.filter(row => row.p00RasterExact).length,
      p00ParityCounts: cohort.p00ParityCounts,
      allStateAndHistoryReceiptsVerified: true,
      allFrozenMatrixSourcesMatchCurrentFiles: true,
      allPhaseHelperReceiptsMatchCurrentFile: true,
      allPhaseRunnerRevisionsReceipted: true },
    groups: grouped,
    captures: phaseResults
  };

  result.counterexamples = collectCounterexamples(phaseResults);
  const report = renderReport(result);
  assertReportIntegrity(report, result);
  if (writeOutputs) {
    await mkdir(outputRoot, { recursive: true });
    const jsonBytes = Buffer.from(`${JSON.stringify(result)}\n`);
    const compressed = gzipSync(jsonBytes, { level: 9 });
    assert.ok(compressed.byteLength < MAX_ARTIFACT_BYTES, 'Analysis result exceeds the 100 MiB compressed bound.');
    const resultsPath = path.join(outputRoot, 'results-20261023.json.gz');
    const reportPath = path.join(outputRoot, 'REPORT.md');
    const reportBytes = Buffer.from(report);
    await writeFile(resultsPath, compressed, { flag: 'wx' });
    await writeFile(reportPath, reportBytes, { flag: 'wx' });
    const outputManifest = { schema: 'ant-natural-field-transfer-phase-analysis-output/v1',
      matrixManifestSha256, cohortManifestSha256: sha256(cohortBytes),
      analysisScriptPath: 'scripts/ant-transfer-phase-analysis.js',
      analysisScriptSha256: sha256(await readFile(path.join(PROJECT_ROOT, 'scripts/ant-transfer-phase-analysis.js'))),
      testPath: 'tests/ant-transfer-phase-analysis.test.js',
      testSha256: sha256(await readFile(path.join(PROJECT_ROOT, 'tests/ant-transfer-phase-analysis.test.js'))),
      outputs: [
        { path: path.relative(PROJECT_ROOT, reportPath).replaceAll(path.sep, '/'),
          sha256: sha256(reportBytes), bytes: reportBytes.byteLength },
        { path: path.relative(PROJECT_ROOT, resultsPath).replaceAll(path.sep, '/'),
          sha256: sha256(compressed), compressedBytes: compressed.byteLength,
          uncompressedBytes: jsonBytes.byteLength }
      ] };
    const outputManifestBytes = Buffer.from(`${JSON.stringify(outputManifest, null, 2)}\n`);
    const outputManifestPath = path.join(outputRoot, 'analysis-manifest.json');
    await writeFile(outputManifestPath, outputManifestBytes, { flag: 'wx' });
    result.output = { reportPath: path.relative(PROJECT_ROOT, path.join(outputRoot, 'REPORT.md')).replaceAll(path.sep, '/'),
      reportSha256: sha256(reportBytes),
      resultsPath: path.relative(PROJECT_ROOT, resultsPath).replaceAll(path.sep, '/'),
      resultsSha256: sha256(compressed), compressedBytes: compressed.byteLength,
      uncompressedBytes: jsonBytes.byteLength,
      manifestPath: path.relative(PROJECT_ROOT, outputManifestPath).replaceAll(path.sep, '/'),
      manifestSha256: sha256(outputManifestBytes) };
  }
  return { result, report };
}

/** Compare one phase against p00 within one movement mode and frozen state. */
export function comparePhaseArms(p00, shifted, { interiorAntIds = null } = {}) {
  if (!p00 || !shifted || p00.movementMode !== shifted.movementMode
    || p00.phase?.id !== 'p00' || !PHASES.slice(1).includes(shifted.phase?.id)) {
    throw new TypeError('Expected p00 and a preregistered shifted arm from the same movement mode.');
  }
  const baselineSamples = p00.samples || [], phaseSamples = shifted.samples || [];
  const coordinate = compareSampleCoordinates(baselineSamples, phaseSamples);
  const baseTrace = indexTrace(p00.trace || []), phaseTrace = indexTrace(shifted.trace || []);
  const sampleRows = pairedSampleRows(baselineSamples, phaseSamples);
  const ids = new Set([...baseTrace.keys(), ...phaseTrace.keys(), ...sampleRows.keys()]);
  const antRows = [];
  for (const antId of [...ids].sort((a, b) => String(a).localeCompare(String(b)))) {
    const base = baseTrace.get(antId) || new Map(), phase = phaseTrace.get(antId) || new Map();
    const inputs = pairedEvent(base, phase, 'intention-input');
    const baseTrail = inputs.left?.localTrail || null, phaseTrail = inputs.right?.localTrail || null;
    const localTurn = pairedEvent(base, phase, 'local-turn');
    const target = pairedEvent(base, phase, 'target-turn');
    const body = pairedEvent(base, phase, 'target-turn-applied');
    const travel = pairedEvent(base, phase, 'displacement');
    const baseDue = hasEvent(base, 'wide-options'), phaseDue = hasEvent(phase, 'wide-options');
    const dueStatusChanged = baseDue !== phaseDue;
    const baseOptions = firstEvent(base, 'wide-options')?.options || null;
    const phaseOptions = firstEvent(phase, 'wide-options')?.options || null;
    const baseChoice = firstEvent(base, 'intention-chosen') || null;
    const phaseChoice = firstEvent(phase, 'intention-chosen') || null;
    const localSamples = sampleRows.get(antId) || { leftLocal: [], rightLocal: [], leftWide: [], rightWide: [],
      coordinateExact: null, localCoordinateExact: true, wideCoordinateExact: true };
    const allPhaseLocal = [...localSamples.leftLocal, ...localSamples.rightLocal];
    const interiorEligible = allPhaseLocal.length > 0 && allPhaseLocal.every(row => row.interiorAllPhases === true)
      && localSamples.leftLocal.length > 0 && localSamples.rightLocal.length > 0
      && (!interiorAntIds || interiorAntIds.has(antId));
    const row = {
      antId,
      interiorEligible,
      boundaryExposed: allPhaseLocal.some(sample => sample.boundaryExposed === true),
      localReadCalls: { p00: localSamples.leftLocal.length, phase: localSamples.rightLocal.length,
        interiorAllPhases: allPhaseLocal.filter(sample => sample.interiorAllPhases === true).length,
        totalAcrossComparedArms: allPhaseLocal.length },
      sampleCoordinatesExact: localSamples.coordinateExact,
      sampleValues: compareSampleValues(localSamples.leftLocal, localSamples.rightLocal),
      localTrail: compareObjectNumbers(baseTrail, phaseTrail,
        ['left', 'center', 'right', 'strength', 'coherence', 'steering']),
      decision: { p00Due: baseDue, phaseDue, dueStatusChanged,
        p00Status: classifyDecisionStatus(base, baseDue, Boolean(baseChoice)),
        phaseStatus: classifyDecisionStatus(phase, phaseDue, Boolean(phaseChoice)),
        comparableDueDecision: baseDue && phaseDue,
        optionScores: compareOptions(baseOptions, phaseOptions),
        optionPairs: baseDue && phaseDue ? pairOptions(baseOptions, phaseOptions) : null,
        choiceCompared: baseDue && phaseDue && Boolean(baseChoice) && Boolean(phaseChoice),
        choiceHeadingDeltaRad: baseDue && phaseDue && baseChoice && phaseChoice
          ? angleDelta(phaseChoice.chosenHeading, baseChoice.chosenHeading) : null,
        choiceOffsetChanged: baseDue && phaseDue && baseChoice && phaseChoice
          ? baseChoice.chosenOffset !== phaseChoice.chosenOffset : null,
        choiceScoreDelta: baseDue && phaseDue && baseChoice && phaseChoice
          ? compareScalar(baseChoice.chosenScore, phaseChoice.chosenScore) : null,
        rngDrawsInChoice: choiceDrawCount(base, phase) },
      localCue: compareScalar(localTurn.left?.rawLocalCueU, localTurn.right?.rawLocalCueU),
      feedbackContribution: compareScalar(localTurn.left?.feedbackContributionV, localTurn.right?.feedbackContributionV),
      localTurn: compareScalar(localTurn.left?.clampedLocalTurn, localTurn.right?.clampedLocalTurn),
      targetHeading: compareAngle(target.left?.targetHeadingAfterCrowding, target.right?.targetHeadingAfterCrowding),
      bodyTurn: compareAngle(bodyTurnRadians(target.left, body.left), bodyTurnRadians(target.right, body.right)),
      bodyOmega: compareScalar(body.left?.currentOmega, body.right?.currentOmega),
      collisionScale: compareScalar(collisionScale(p00, antId), collisionScale(shifted, antId)),
      actualTravel: compareTravel(travel.left, travel.right),
      firstDivergence: firstDivergence({ localSamples, baseTrail, phaseTrail, baseDue, phaseDue,
        baseOptions, phaseOptions, baseChoice, phaseChoice, localTurn, target, body, travel,
        localCoordinateExact: localSamples.localCoordinateExact,
        wideCoordinateExact: localSamples.wideCoordinateExact }),
      rngStreamAlignment: rngStreamAlignment(base, phase)
    };
    if (interiorAntIds) row.interiorEligible = interiorAntIds.has(antId) && row.interiorEligible;
    antRows.push(row);
  }
  const summarizeRows = rows => summarizeAntRows(rows);
  const all = summarizeRows(antRows);
  all.decisionStrata = summarizeDecisionStrata(antRows);
  const interiorRows = antRows.filter(row => row.interiorEligible);
  const interior = summarizeRows(interiorRows);
  interior.decisionStrata = summarizeDecisionStrata(interiorRows);
  return {
    phaseId: shifted.phase.id, movementMode: p00.movementMode,
    sampleCalls: { p00: baselineSamples.length, phase: phaseSamples.length,
      sameIndexCoordinatePairs: coordinate.sameIndexCoordinatePairs,
      sameIndexContextPairs: coordinate.sameIndexContextPairs,
      exactGlobalCallSequence: coordinate.exactGlobalCallSequence,
      firstGlobalMismatch: coordinate.firstGlobalMismatch },
    sensorQueryCorrespondence: {
      local: summarizeQueryCallComparison(baselineSamples, phaseSamples, 'local'),
      wide: summarizeQueryCallComparison(baselineSamples, phaseSamples, 'wide')
    },
    localReadQualification: { p00Calls: baselineSamples.filter(row => row.context?.kind === 'local').length,
      phaseCalls: phaseSamples.filter(row => row.context?.kind === 'local').length,
      p00InteriorCalls: baselineSamples.filter(row => row.context?.kind === 'local' && row.interiorAllPhases).length,
      phaseInteriorCalls: phaseSamples.filter(row => row.context?.kind === 'local' && row.interiorAllPhases).length,
      observedAnts: antRows.filter(row => row.localReadCalls.totalAcrossComparedArms > 0).length,
      allLocalReadsInteriorAnts: interiorRows.length,
      boundaryExposedCalls: allPhaseLocalBoundaryCalls(baselineSamples, phaseSamples),
      boundaryExposedAnts: antRows.filter(row => row.boundaryExposed).length,
      exactLocalCallSequences: antRows.filter(row => row.localReadCalls.totalAcrossComparedArms > 0
        && (sampleRows.get(row.antId)?.localCoordinateExact ?? false)).length,
      exactWideCallSequences: antRows.filter(row => (sampleRows.get(row.antId)?.leftWide.length
        || sampleRows.get(row.antId)?.rightWide.length)
        && (sampleRows.get(row.antId)?.wideCoordinateExact ?? false)).length },
    rngUsageAtTick: compareRngCheckpoints(p00.rngAfterTick, shifted.rngAfterTick),
    rngStreamAlignment: summarizeRngStreamAlignment(antRows),
    allAnts: all,
    interiorOnly: interior,
    antRows
  };
}

function analyzeCapture(run, state) {
  const arms = new Map(run.arms.map(arm => [`${arm.movementMode}/${arm.phase.id}`, arm]));
  const comparisons = [];
  for (const movementMode of MODES) {
    const p00 = arms.get(`${movementMode}/p00`);
    const interiorAntIds = allPhaseInteriorAntIds(arms, movementMode);
    for (const phaseId of PHASES.slice(1)) {
      const shifted = arms.get(`${movementMode}/${phaseId}`);
      comparisons.push(comparePhaseArms(p00, shifted, { interiorAntIds }));
    }
  }
  return { captureId: state.captureId, originPolicy: state.originPolicy, seed: state.seed,
    secondsCompleted: state.secondsCompleted, tick: state.tick,
    p00RasterExact: run.historyByPhase.p00.phaseZeroRasterExact === true
      && run.historyByPhase.p00.fieldValuesSha256 === state.validation.reconstructedFieldSha256,
    comparisons,
    dose: summarizeDoseByCapture(run) };
}

function allPhaseInteriorAntIds(arms, movementMode) {
  const samples = new Map();
  for (const phaseId of PHASES) {
    const arm = arms.get(`${movementMode}/${phaseId}`);
    for (const row of arm.samples.filter(sample => sample.context?.kind === 'local'
      && sample.context?.antId !== undefined)) {
      const antId = row.context.antId;
      if (!samples.has(antId)) samples.set(antId, new Map());
      if (!samples.get(antId).has(phaseId)) samples.get(antId).set(phaseId, []);
      samples.get(antId).get(phaseId).push(row);
    }
  }
  return new Set([...samples].filter(([, byPhase]) => PHASES.every(phaseId =>
    byPhase.has(phaseId) && byPhase.get(phaseId).length > 0
      && byPhase.get(phaseId).every(sample => sample.interiorAllPhases === true))).map(([antId]) => antId));
}

function allPhaseLocalBoundaryCalls(p00Samples, phaseSamples) {
  return {
    p00: p00Samples.filter(sample => sample.context?.kind === 'local' && sample.boundaryExposed === true).length,
    phase: phaseSamples.filter(sample => sample.context?.kind === 'local' && sample.boundaryExposed === true).length,
    acrossComparedArms: [...p00Samples, ...phaseSamples].filter(sample =>
      sample.context?.kind === 'local' && sample.boundaryExposed === true).length
  };
}

function summarizeDoseByCapture(run) {
  const historyByPhase = run.historyByPhase;
  const rows = PHASES.map(phaseId => {
    const history = historyByPhase[phaseId];
    const arms = MODES.map(movementMode => {
      const arm = run.arms.find(row => row.phase.id === phaseId && row.movementMode === movementMode);
      return { movementMode, totalAfterTick: selectDose(arm.phaseDoseLedger),
        oneTick: selectDose(arm.oneTickDoseLedger),
        oneTickStorageDelta: { storedMass: arm.phaseDoseLedger.storedMass - history.storedMass,
          uncappedShadowMass: arm.phaseDoseLedger.uncappedShadowMass - history.uncappedShadowMass,
          capStorageLoss: arm.phaseDoseLedger.capStorageLoss - history.capStorageLoss,
          cappedCellCount: arm.phaseDoseLedger.cappedCellCount - history.cappedCellCount } };
    });
    return { phaseId, fixedHistory: selectDose(history), arms };
  });
  const baseline = rows.find(row => row.phaseId === 'p00');
  return rows.map(row => ({ ...row,
    fixedHistoryDeltaVsP00: aggregateDoseDelta(baseline.fixedHistory, row.fixedHistory),
    armDeltaVsP00: row.arms.map(arm => {
      const base = baseline.arms.find(item => item.movementMode === arm.movementMode);
      return { movementMode: arm.movementMode,
        totalAfterTick: aggregateDoseDelta(base.totalAfterTick, arm.totalAfterTick),
        oneTick: aggregateDoseDelta(base.oneTick, arm.oneTick),
        oneTickStorageDelta: aggregateDoseDelta(base.oneTickStorageDelta, arm.oneTickStorageDelta) };
    }) }));
}

function summarizeBySeedAndOrigin(captures) {
  const result = [];
  for (const seed of [...new Set(captures.map(row => row.seed))].sort((a, b) => a - b)) {
    for (const originPolicy of ['production', 'dtFeedback']) {
      const rows = captures.filter(row => row.seed === seed && row.originPolicy === originPolicy)
        .sort((a, b) => a.secondsCompleted - b.secondsCompleted);
      assert.equal(rows.length, SECONDS.length, `${originPolicy}/${seed} does not have all 11 fixed times.`);
      const comparisons = [];
      for (const phaseId of PHASES.slice(1)) for (const movementMode of MODES) {
        const source = rows.flatMap(capture => capture.comparisons.filter(pair =>
          pair.phaseId === phaseId && pair.movementMode === movementMode));
        comparisons.push({ phaseId, movementMode,
          states: source.length,
          allAnts: aggregateComparisons(source, 'allAnts'),
          interiorOnly: aggregateComparisons(source, 'interiorOnly'),
          firstDivergenceCounts: countFirstDivergences(source),
          dose: rows.map(capture => ({ captureId: capture.captureId,
            phase: capture.dose.find(row => row.phaseId === phaseId),
            baseline: capture.dose.find(row => row.phaseId === 'p00') })) });
      }
      result.push({ seed, originPolicy, stateCount: rows.length,
        captures: rows.map(row => row.captureId), comparisons });
    }
  }
  return result;
}

function aggregateComparisons(comparisons, scope) {
  const fields = ['localTrailChanged', 'localCueChanged', 'localCueSignChanged',
    'localTurnChanged', 'targetHeadingChanged', 'bodyTurnChanged', 'travelAngleChanged',
    'travelDistanceChanged', 'travelVectorChanged', 'collisionScaleChanged',
    'decisionDueStatusChanged', 'dueOptionsChanged', 'chosenHeadingChanged',
    'cueChangedAndTravelAngleChanged', 'cueChangedAndTravelVectorChanged'];
  const aggregate = { states: comparisons.length };
  for (const field of fields) {
    aggregate[field] = { numerator: 0, denominator: 0 };
  }
  aggregate.antStateDenominator = 0;
  aggregate.localInteriorAntStates = 0;
  aggregate.boundaryExposedAntStates = 0;
  aggregate.localReadAntStates = 0;
  aggregate.coordinateExactAntStates = 0;
  aggregate.magnitudes = { meanAbsLocalCueDelta: null, meanAbsSteeringDelta: null,
    meanAbsTargetHeadingDeltaRad: null, meanAbsBodyTurnDeltaRad: null,
    meanAbsTravelAngleDeltaRad: null, meanAbsTravelDistanceDelta: null,
    meanAbsCollisionScaleDelta: null };
  const magnitudeValues = Object.fromEntries(Object.keys(aggregate.magnitudes).map(key => [key, []]));
  const rngRows = [];
  for (const comparison of comparisons) {
    const candidates = scope === 'interiorOnly'
      ? comparison.antRows.filter(row => row.interiorEligible) : comparison.antRows;
    for (const row of candidates) {
      rngRows.push(row);
      aggregate.antStateDenominator += 1;
      if (row.interiorEligible) aggregate.localInteriorAntStates += 1;
      if (row.boundaryExposed) aggregate.boundaryExposedAntStates += 1;
      if (row.localReadCalls.totalAcrossComparedArms > 0) aggregate.localReadAntStates += 1;
      if (row.sampleCoordinatesExact) aggregate.coordinateExactAntStates += 1;
      const flags = {
        localTrailChanged: row.localTrail.changed,
        localCueChanged: row.localCue.changed,
        localCueSignChanged: row.localCue.signChanged,
        localTurnChanged: row.localTurn.changed,
        targetHeadingChanged: row.targetHeading.changed,
        bodyTurnChanged: row.bodyTurn.changed,
        travelAngleChanged: row.actualTravel.angleChanged,
        travelDistanceChanged: row.actualTravel.distanceChanged,
        travelVectorChanged: row.actualTravel.vectorChanged,
        collisionScaleChanged: row.collisionScale.changed,
        decisionDueStatusChanged: row.decision.dueStatusChanged,
        dueOptionsChanged: row.decision.comparableDueDecision ? row.decision.optionScores.changed : null,
        chosenHeadingChanged: row.decision.choiceHeadingDeltaRad === null
          ? null : row.decision.choiceHeadingDeltaRad !== 0
      };
      for (const [field, changed] of Object.entries(flags)) addIncidence(aggregate[field], changed);
      if (typeof row.localCue.changed === 'boolean' && typeof row.actualTravel.angleChanged === 'boolean') {
        addIncidence(aggregate.cueChangedAndTravelAngleChanged,
          row.localCue.changed && row.actualTravel.angleChanged);
      }
      if (typeof row.localCue.changed === 'boolean' && typeof row.actualTravel.vectorChanged === 'boolean') {
        addIncidence(aggregate.cueChangedAndTravelVectorChanged,
          row.localCue.changed && row.actualTravel.vectorChanged);
      }
      pushMagnitude(magnitudeValues.meanAbsLocalCueDelta, row.localCue.delta);
      pushMagnitude(magnitudeValues.meanAbsSteeringDelta, row.localTrail.fields.steering.delta);
      pushMagnitude(magnitudeValues.meanAbsTargetHeadingDeltaRad, row.targetHeading.deltaRad);
      pushMagnitude(magnitudeValues.meanAbsBodyTurnDeltaRad, row.bodyTurn.deltaRad);
      pushMagnitude(magnitudeValues.meanAbsTravelAngleDeltaRad, row.actualTravel.angleDeltaRad);
      pushMagnitude(magnitudeValues.meanAbsTravelDistanceDelta, row.actualTravel.distanceDelta);
      pushMagnitude(magnitudeValues.meanAbsCollisionScaleDelta, row.collisionScale.delta);
    }
  }
  for (const key of Object.keys(aggregate.magnitudes)) {
    const values = magnitudeValues[key];
    aggregate.magnitudes[key] = { meanAbsolute: values.length ? mean(values) : null,
      medianAbsolute: values.length ? median(values) : null, denominator: values.length };
  }
  aggregate.sampleCalls = comparisons.reduce((sum, row) => sum + row.sampleCalls.p00, 0);
  aggregate.sampleCoordinateMatchedCalls = comparisons.reduce((sum, row) =>
    sum + row.sampleCalls.sameIndexCoordinatePairs, 0);
  aggregate.exactGlobalCallSequences = { numerator: comparisons.filter(row =>
    row.sampleCalls.exactGlobalCallSequence).length, denominator: comparisons.length };
  aggregate.localReadCalls = comparisons.reduce((sum, row) => sum + row.localReadQualification.p00Calls, 0);
  aggregate.localInteriorCalls = comparisons.reduce((sum, row) =>
    sum + row.localReadQualification.p00InteriorCalls, 0);
  aggregate.boundaryExposedLocalCalls = comparisons.reduce((sum, row) =>
    sum + row.localReadQualification.boundaryExposedCalls.p00, 0);
  aggregate.exactLocalCallSequences = { numerator: comparisons.reduce((sum, row) =>
    sum + row.localReadQualification.exactLocalCallSequences, 0),
  denominator: comparisons.reduce((sum, row) => sum + row.localReadQualification.observedAnts, 0) };
  aggregate.sensorQueryCorrespondence = Object.fromEntries(['local', 'wide'].map(kind => {
    const items = comparisons.map(row => row.sensorQueryCorrespondence[kind]);
    const sum = key => items.reduce((total, item) => total + item[key], 0);
    const sumAbsoluteRawDelta = sum('sumAbsoluteRawDeltaAtExactQuery');
    const exactQueryPairs = sum('exactQueryPairs');
    return [kind, { p00Calls: sum('p00Calls'), phaseCalls: sum('phaseCalls'),
      pairedCalls: sum('pairedCalls'), missingCalls: sum('missingCalls'),
      exactQueryPairs: sum('exactQueryPairs'), globalCallIndexEqualPairs: sum('globalCallIndexEqualPairs'),
      semanticContextChangedPairs: sum('semanticContextChangedPairs'),
      headingMetadataChangedPairs: sum('headingMetadataChangedPairs'),
      unmatchedPairedCalls: sum('unmatchedPairedCalls'),
      rawValuesChangedAtExactQuery: sum('rawValuesChangedAtExactQuery'),
      sumAbsoluteRawDeltaAtExactQuery: sumAbsoluteRawDelta,
      meanAbsoluteRawDeltaAtExactQuery: exactQueryPairs ? sumAbsoluteRawDelta / exactQueryPairs : null,
      maxAbsoluteRawDeltaAtExactQuery: items.some(item => Number.isFinite(item.maxAbsoluteRawDeltaAtExactQuery))
        ? Math.max(...items.map(item => item.maxAbsoluteRawDeltaAtExactQuery).filter(Number.isFinite)) : null,
      exactPerAntSequences: { numerator: items.reduce((total, item) => total + item.exactPerAntSequences.numerator, 0),
        denominator: items.reduce((total, item) => total + item.exactPerAntSequences.denominator, 0) },
      unclassifiedP00Calls: sum('unclassifiedP00Calls'), unclassifiedPhaseCalls: sum('unclassifiedPhaseCalls') }];
  }));
  aggregate.rngStreamAlignment = summarizeRngStreamAlignment(rngRows);
  aggregate.decisionStrata = summarizeDecisionStrata(rngRows);
  const rngTicks = comparisons.map(row => row.rngUsageAtTick);
  const tickCallDeltas = rngTicks.map(row => row.callCountDelta).filter(Number.isFinite);
  aggregate.rngUsageAtTick = {
    states: rngTicks.length,
    changedCallCountTicks: { numerator: tickCallDeltas.filter(value => value !== 0).length,
      denominator: tickCallDeltas.length },
    stateDifferentTicks: { numerator: rngTicks.filter(row => row.stateEqual === false).length,
      denominator: rngTicks.length },
    seedDifferentTicks: { numerator: rngTicks.filter(row => row.seedEqual === false).length,
      denominator: rngTicks.length },
    algorithmDifferentTicks: { numerator: rngTicks.filter(row => row.algorithmEqual === false).length,
      denominator: rngTicks.length },
    checkpointDifferentTicks: { numerator: rngTicks.filter(row => row.checkpointEqual === false).length,
      denominator: rngTicks.length },
    meanCallCountDelta: tickCallDeltas.length ? mean(tickCallDeltas) : null,
    minCallCountDelta: tickCallDeltas.length ? Math.min(...tickCallDeltas) : null,
    maxCallCountDelta: tickCallDeltas.length ? Math.max(...tickCallDeltas) : null
  };
  return aggregate;
}

function summarizeAntRows(rows) {
  const denominator = rows.length;
  const incidence = (select, valid = value => typeof value === 'boolean') => {
    const values = rows.map(select).filter(valid);
    return { numerator: values.filter(value => value === true).length, denominator: values.length };
  };
  const cueChanged = row => row.localCue.changed === true;
  const magnitudes = field => rows.map(field).filter(Number.isFinite).map(Math.abs);
  return {
    antStateCount: denominator,
    localTrailChanged: incidence(row => row.localTrail.changed),
    localCueChanged: incidence(row => row.localCue.changed),
    localCueSignChanged: incidence(row => row.localCue.signChanged),
    localTurnChanged: incidence(row => row.localTurn.changed),
    targetHeadingChanged: incidence(row => row.targetHeading.changed),
    bodyTurnChanged: incidence(row => row.bodyTurn.changed),
    travelAngleChanged: incidence(row => row.actualTravel.angleChanged),
    travelDistanceChanged: incidence(row => row.actualTravel.distanceChanged),
    travelVectorChanged: incidence(row => row.actualTravel.vectorChanged),
    collisionScaleChanged: incidence(row => row.collisionScale.changed),
    cueChangedAndTravelAngleChanged: incidence(row => row.localCue.changed === null
      || row.actualTravel.angleChanged === null ? null : cueChanged(row) && row.actualTravel.angleChanged),
    cueChangedAndTravelVectorChanged: incidence(row => row.localCue.changed === null
      || row.actualTravel.vectorChanged === null ? null : cueChanged(row) && row.actualTravel.vectorChanged),
    dueDecisionComparisons: rows.filter(row => row.decision.comparableDueDecision).length,
    decisionDueStatusChanged: incidence(row => row.decision.dueStatusChanged),
    dueOptionsChanged: incidence(row => row.decision.comparableDueDecision
      ? row.decision.optionScores.changed : null),
    chosenHeadingChanged: incidence(row => row.decision.choiceHeadingDeltaRad === null
      ? null : row.decision.choiceHeadingDeltaRad !== 0),
    coordinateExact: incidence(row => row.sampleCoordinatesExact),
    magnitudes: {
      meanAbsLocalCueDelta: magnitudeSummary(magnitudes(row => row.localCue.delta)),
      meanAbsSteeringDelta: magnitudeSummary(magnitudes(row => row.localTrail.fields.steering.delta)),
      meanAbsTargetHeadingDeltaRad: magnitudeSummary(magnitudes(row => row.targetHeading.deltaRad)),
      meanAbsBodyTurnDeltaRad: magnitudeSummary(magnitudes(row => row.bodyTurn.deltaRad)),
      meanAbsTravelAngleDeltaRad: magnitudeSummary(magnitudes(row => row.actualTravel.angleDeltaRad)),
      meanAbsTravelDistanceDelta: magnitudeSummary(magnitudes(row => row.actualTravel.distanceDelta)),
      meanAbsCollisionScaleDelta: magnitudeSummary(magnitudes(row => row.collisionScale.delta))
    }
  };
}

function classifyDecisionStatus(trace, due, choiceOccurred) {
  if (due && choiceOccurred) return 'fresh-choice';
  if (due) return 'due-no-choice';
  if (hasEvent(trace, 'intention-no-choice')) return 'held-no-choice';
  return 'ambiguous/missing';
}

function summarizeDecisionStrata(rows) {
  const statuses = ['fresh-choice', 'held-no-choice', 'due-no-choice', 'ambiguous/missing'];
  const incidence = (subset, select) => {
    const values = subset.map(select).filter(value => typeof value === 'boolean');
    return { numerator: values.filter(Boolean).length, denominator: values.length };
  };
  const summarize = subset => ({
    antStates: subset.length,
    localReadAntStates: subset.filter(row => row.localReadCalls.totalAcrossComparedArms > 0).length,
    phaseStatusChanged: incidence(subset, row => row.decision.p00Status !== row.decision.phaseStatus),
    localCueChanged: incidence(subset, row => row.localCue.changed),
    targetHeadingChanged: incidence(subset, row => row.targetHeading.changed),
    bodyTurnChanged: incidence(subset, row => row.bodyTurn.changed),
    travelAngleChanged: incidence(subset, row => row.actualTravel.angleChanged),
    travelVectorChanged: incidence(subset, row => row.actualTravel.vectorChanged)
  });
  const byP00Status = Object.fromEntries(statuses.map(status => [status,
    summarize(rows.filter(row => row.decision.p00Status === status))]));
  const p00StatusCounts = Object.fromEntries(statuses.map(status => [status,
    { numerator: byP00Status[status].antStates, denominator: rows.length }]));
  const phaseStatusCounts = Object.fromEntries(statuses.map(status => [status,
    { numerator: rows.filter(row => row.decision.phaseStatus === status).length, denominator: rows.length }]));
  const transitions = {};
  for (const row of rows) {
    const key = `${row.decision.p00Status}->${row.decision.phaseStatus}`;
    transitions[key] = (transitions[key] || 0) + 1;
  }
  const bothFreshRows = rows.filter(row => row.decision.p00Status === 'fresh-choice'
    && row.decision.phaseStatus === 'fresh-choice');
  const optionChanges = incidence(bothFreshRows, row => row.decision.optionScores.changed);
  const headingChanges = incidence(bothFreshRows, row => row.decision.choiceHeadingDeltaRad === null
    ? null : row.decision.choiceHeadingDeltaRad !== 0);
  const headingDeltas = bothFreshRows.map(row => row.decision.choiceHeadingDeltaRad)
    .filter(Number.isFinite).map(Math.abs);
  return { p00StatusCounts, phaseStatusCounts, byP00Status, transitions,
    bothFresh: { antStates: bothFreshRows.length, optionScoresChanged: optionChanges,
      choiceHeadingChanged: headingChanges,
      meanAbsoluteChoiceHeadingDeltaRad: headingDeltas.length ? mean(headingDeltas) : null,
      choiceHeadingDeltaDenominator: headingDeltas.length } };
}

function addIncidence(target, changed) {
  if (typeof changed !== 'boolean') return;
  target.denominator += 1;
  if (changed) target.numerator += 1;
}

function countFirstDivergences(comparisons) {
  const counts = {};
  for (const comparison of comparisons) for (const row of comparison.antRows) {
    const value = row.firstDivergence || {};
    const stage = value.kind && ['sensor-read', 'sample-call-correspondence', 'sample-call-coordinate', 'sample-call-sequence'].includes(value.stage)
      ? `${value.stage}-${value.kind}` : value.stage || 'none-observed';
    counts[stage] = (counts[stage] || 0) + 1;
  }
  return counts;
}

function collectCounterexamples(captures) {
  let largestTravelAngleDelta = null;
  let cueChangedButTravelVectorUnchanged = null;
  let travelVectorChangedWithoutLocalCueChange = null;
  let boundaryExposedCueChange = null;
  for (const capture of captures) for (const comparison of capture.comparisons) for (const row of comparison.antRows) {
    const item = { captureId: capture.captureId, seed: capture.seed,
      originPolicy: capture.originPolicy, phaseId: comparison.phaseId,
      movementMode: comparison.movementMode, ...row };
    if (Number.isFinite(row.actualTravel.angleDeltaRad)
      && (!largestTravelAngleDelta || Math.abs(row.actualTravel.angleDeltaRad)
        > Math.abs(largestTravelAngleDelta.actualTravel.angleDeltaRad))) largestTravelAngleDelta = item;
    if (!cueChangedButTravelVectorUnchanged && row.localCue.changed === true
      && row.actualTravel.vectorChanged === false) cueChangedButTravelVectorUnchanged = item;
    if (!travelVectorChangedWithoutLocalCueChange && row.localCue.changed === false
      && row.actualTravel.vectorChanged === true) travelVectorChangedWithoutLocalCueChange = item;
    if (!boundaryExposedCueChange && row.boundaryExposed && row.localCue.changed === true) boundaryExposedCueChange = item;
  }
  const compact = row => row && ({ captureId: row.captureId, seed: row.seed, originPolicy: row.originPolicy,
    phaseId: row.phaseId, movementMode: row.movementMode, antId: row.antId,
    interiorEligible: row.interiorEligible, boundaryExposed: row.boundaryExposed,
    firstDivergence: row.firstDivergence,
    localCue: row.localCue, targetHeading: row.targetHeading, bodyTurn: row.bodyTurn,
    actualTravel: row.actualTravel, rngStreamAlignment: row.rngStreamAlignment });
  return {
    largestObservedTravelAngleDelta: compact(largestTravelAngleDelta),
    cueChangedButTravelVectorUnchanged: compact(cueChangedButTravelVectorUnchanged),
    travelVectorChangedWithoutLocalCueChange: compact(travelVectorChangedWithoutLocalCueChange),
    boundaryExposedCueChange: compact(boundaryExposedCueChange)
  };
}

function verifyCohortReceiptRow(row, state, matrixCapture, manifestSha, helperHash, runnerHashes) {
  assert.equal(row.schema, PHASE_SCHEMA);
  assert.equal(row.status, 'qualified-for-conditional-phase-observation');
  assert.equal(row.captureId, state.captureId);
  assert.equal(row.originPolicy, state.originPolicy);
  assert.equal(row.seed, state.seed);
  assert.equal(row.secondsCompleted, state.secondsCompleted);
  assert.match(String(row.outputPath).replaceAll('\\', '/'), /(^|\/)phase\/runs\//);
  assert.match(row.outputSha256, /^[a-f0-9]{64}$/i);
  if (row.matrixCaptureSha256 !== undefined) assert.equal(row.matrixCaptureSha256, matrixCapture.sha256);
  assert.deepEqual(row.matrixSourceHashes, state.sourceHashes);
  assert.equal(row.phaseSourceHashes?.['scripts/ant-transfer-phase.js'], helperHash,
    'Phase helper hash differs from the frozen current helper.');
  const runnerHash = row.phaseSourceHashes?.['scripts/ant-transfer-phase-runs.js'];
  assert.ok(runnerHashes.has(runnerHash), 'Phase runner hash is not receipted by a preserved runner revision.');
}

async function verifyRunnerRevisionSources(revisions, receipts, currentRunnerHash) {
  const seenCaptureIds = new Set();
  for (const revision of revisions) {
    assert.match(revision.sha256 || '', /^[a-f0-9]{64}$/i);
    assert.equal(revision.sourcePath, 'scripts/ant-transfer-phase-runs.js');
    const source = revision.sha256 === currentRunnerHash
      ? path.join(PROJECT_ROOT, revision.sourcePath)
      : path.join(PROJECT_ROOT, safeRelative(revision.preservedCopyPath || ''));
    assert.equal(sha256(await readFile(source)), revision.sha256,
      `Runner source bytes do not match revision ${revision.sha256}.`);
    const matching = receipts.filter(row => row.phaseSourceHashes?.[revision.sourcePath] === revision.sha256);
    assert.equal(matching.length, revision.receiptCount,
      `Runner revision ${revision.sha256} receipt count differs from the manifest.`);
    assert.deepEqual(matching.map(row => row.captureId).sort(), [...revision.captureIds].sort(),
      `Runner revision ${revision.sha256} capture IDs differ from the manifest.`);
    for (const row of matching) {
      assert.ok(!seenCaptureIds.has(row.captureId), `Capture ${row.captureId} appears in multiple runner revisions.`);
      seenCaptureIds.add(row.captureId);
    }
  }
  assert.equal(seenCaptureIds.size, receipts.length, 'Some phase receipts have no runner-source revision.');
}

function verifyPhaseRun(run, manifestRow, state, matrix, matrixSha) {
  assert.equal(run.schema, PHASE_SCHEMA);
  assert.equal(run.status, 'qualified-for-conditional-phase-observation');
  assert.equal(run.phaseZeroPassed, true, `${state.captureId} failed phase-zero qualification.`);
  assert.equal(run.sourceAndCapture.captureId, state.captureId);
  assert.equal(run.sourceAndCapture.matrixManifestSha256, matrixSha);
  assert.equal(run.sourceAndCapture.frozenInputSha256, state.frozenInputSha256);
  assert.equal(run.sourceAndCapture.writeStreamPath, state.writeStream.path);
  const historyReceipt = matrix.histories?.find(item => item.path === state.writeStream.path
    && item.originPolicy === state.originPolicy && item.seed === state.seed);
  assert.ok(historyReceipt, `Missing matrix history receipt for ${state.captureId}.`);
  assert.equal(run.sourceAndCapture.writeStreamSha256, historyReceipt.sha256);
  assert.equal(run.sourceAndCapture.writeEventCount, state.writeStream.eventCountThroughTick);
  assert.equal(run.sourceAndCapture.eventCountThroughTick, state.writeStream.eventCountThroughTick);
  assert.equal(run.sourceAndCapture.lastSequenceThroughTick, state.writeStream.lastSequenceThroughTick);
  assert.deepEqual(run.sourceAndCapture.sourceHashes, state.sourceHashes);
  assert.deepEqual(run.sourceAndCapture.phaseSourceHashes, manifestRow.phaseSourceHashes);
  assert.deepEqual(run.protocol.phases.map(row => row.id), PHASES);
  assert.deepEqual(Object.keys(run.historyByPhase).sort(), [...PHASES].sort());
  assert.ok(Number.isFinite(run.protocol.fixedHistoryRequestedDose));
  assert.ok(Number.isFinite(run.protocol.fixedHistoryElapsedDecaySeconds));
  assert.deepEqual(run.historyByPhase.p00?.phaseZeroRasterExact, true);
  assert.equal(run.historyByPhase.p00.fieldValuesSha256, state.validation.reconstructedFieldSha256,
    'p00 full raster hash does not match the frozen captured raster.');
  assert.equal(run.historyByPhase.p00.captureFieldValuesSha256, state.validation.reconstructedFieldSha256);
  assert.equal(run.arms.length, 12, `${state.captureId} must have 3 movement modes × 4 phases.`);
  const arms = new Map();
  for (const arm of run.arms) {
    assert.ok(MODES.includes(arm.movementMode));
    assert.ok(PHASES.includes(arm.phase?.id));
    assert.equal(arm.sameFrozenInputSha256, state.frozenInputSha256);
    assert.equal(arm.preStateSha256, state.frozenInputSha256);
    assert.equal(arm.preSnapshotSha256, state.preTickPublicSnapshotSha256);
    assert.deepEqual(arm.rngBeforeTick, state.rngBeforeTick);
    assert.ok(isValidRngCheckpoint(arm.rngAfterTick),
      `${state.captureId} ${arm.movementMode}/${arm.phase.id} must carry a complete end-tick RNG checkpoint.`);
    assert.ok(Array.isArray(arm.trace) && Array.isArray(arm.samples) && Array.isArray(arm.oneTickWrites));
    assert.ok(arm.phaseDoseLedger && arm.oneTickDoseLedger);
    const key = `${arm.movementMode}/${arm.phase.id}`;
    verifyDoseLedger(arm.phaseDoseLedger, `${state.captureId} ${key} phase dose ledger`);
    verifyDoseDelta(arm.oneTickDoseLedger, `${state.captureId} ${key} one-tick dose delta`);
    assert.ok(!arms.has(key), `Duplicate phase arm ${key} in ${state.captureId}.`);
    arms.set(key, arm);
    verifyArmCoordinatesAndSamples(arm, run.protocol.phases);
  }
  for (const mode of MODES) {
    const baseline = arms.get(`${mode}/p00`);
    assert.ok(baseline, `${state.captureId} lacks ${mode}/p00.`);
    const parity = baseline.phaseZeroComparison;
    assert.equal(parity?.passed, true, `${state.captureId} ${mode} p00 gate failed.`);
    for (const key of ['traceExactIgnoringSequence', 'postStateExact', 'postRngExact', 'postSnapshotExact']) {
      assert.equal(parity[key], true, `${state.captureId} ${mode} p00 ${key} failed.`);
    }
    for (const key of ['preStateExact', 'preRngExact', 'preTickPublicSnapshotEqual',
      'instrumentedVsPlainPostStateExact', 'instrumentedVsPlainPostRngExact',
      'instrumentedVsPlainPostSnapshotEqual']) {
      assert.equal(parity.matrixBaselineValidation?.[key], true,
        `${state.captureId} ${mode} p00 matrix baseline ${key} failed.`);
    }
    for (const phase of PHASES.slice(1)) assert.ok(arms.has(`${mode}/${phase}`),
      `${state.captureId} lacks ${mode}/${phase}.`);
  }
  assert.ok(matrix.histories?.some(row => row.originPolicy === state.originPolicy && row.seed === state.seed
    && row.path === state.writeStream.path));
  for (const phaseId of PHASES) {
    const history = run.historyByPhase[phaseId];
    assert.equal(history.phaseId, phaseId);
    verifyDoseLedger(history, `${state.captureId} ${phaseId} fixed-history dose ledger`);
    assert.equal(history.requestedDose, run.protocol.fixedHistoryRequestedDose);
    assert.equal(history.elapsedDecaySeconds, run.protocol.fixedHistoryElapsedDecaySeconds);
  }
  assert.equal(manifestRow.phaseZeroPassed, true);
}

function verifyDoseLedger(value, label) {
  const keys = ['requestedDose', 'acceptedDose', 'boundaryClippedDose', 'acceptedAboveRequestDose',
    'elapsedDecaySeconds', 'storedMass', 'uncappedShadowMass', 'capStorageLoss', 'cappedCellCount', 'peak'];
  for (const key of keys) assert.ok(Number.isFinite(value[key]), `${label} lacks finite ${key}.`);
  for (const key of ['requestedDose', 'acceptedDose', 'boundaryClippedDose', 'acceptedAboveRequestDose',
    'elapsedDecaySeconds', 'storedMass', 'uncappedShadowMass', 'capStorageLoss', 'cappedCellCount', 'peak']) {
    assert.ok(value[key] >= 0, `${label} has negative ${key}.`);
  }
  assert.ok(Number.isSafeInteger(value.cappedCellCount), `${label} cappedCellCount must be an integer.`);
}

function verifyDoseDelta(value, label) {
  for (const key of ['requestedDose', 'acceptedDose', 'boundaryClippedDose',
    'acceptedAboveRequestDose', 'elapsedDecaySeconds']) {
    assert.ok(Number.isFinite(value[key]), `${label} lacks finite ${key}.`);
  }
}

function verifyArmCoordinatesAndSamples(arm, phases) {
  const { dx, dy } = arm.phase;
  for (let index = 0; index < arm.samples.length; index += 1) {
    const sample = arm.samples[index];
    assert.equal(sample.callIndex, index);
    assert.equal(sample.phaseId, arm.phase.id);
    assert.ok(Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.value));
    assert.equal(sample.fieldX, sample.x + dx);
    assert.equal(sample.fieldY, sample.y + dy);
    assert.deepEqual(sample.phaseChecks.map(row => row.phaseId), PHASES);
    for (const check of sample.phaseChecks) {
      const phase = phases.find(row => row.id === check.phaseId);
      assert.equal(check.fieldX, sample.x + phase.dx);
      assert.equal(check.fieldY, sample.y + phase.dy);
    }
    assert.equal(sample.interiorAllPhases, sample.phaseChecks.every(row => row.interior === true));
    assert.equal(sample.boundaryExposed, !sample.interiorAllPhases);
  }
  assert.deepEqual(phases.map(row => row.id), PHASES);
  for (const write of arm.oneTickWrites) {
    if (write.type === 'point') {
      assert.equal(write.fieldPosition.x, write.position.x + dx);
      assert.equal(write.fieldPosition.y, write.position.y + dy);
    } else {
      for (const [sourceKey, fieldKey] of [['from', 'fieldFrom'], ['to', 'fieldTo']]) {
        assert.equal(write[fieldKey].x, write[sourceKey].x + dx);
        assert.equal(write[fieldKey].y, write[sourceKey].y + dy);
      }
    }
  }
}

async function readMatrixState(matrixRoot, receipt, matrix, currentSourceHashes) {
  const state = await readGzipJson(path.join(matrixRoot, safeRelative(receipt.path)), receipt.sha256,
    receipt.compressedBytes, receipt.uncompressedBytes, STATE_SCHEMA, `matrix state ${receipt.captureId}`);
  assert.equal(state.captureId, receipt.captureId);
  assert.equal(state.schema, STATE_SCHEMA);
  assert.equal(state.frozenInputSha256, sha256(Buffer.from(JSON.stringify(state.frozenInput))));
  assert.deepEqual(state.sourceHashes, matrix.sources.sourceHashes,
    'Capture source hashes differ from the matrix manifest.');
  assert.equal(state.originPolicy, receipt.originPolicy);
  assert.equal(state.seed, receipt.seed);
  assert.equal(state.secondsCompleted, receipt.secondsCompleted);
  assert.equal(state.frozenInputSha256, receipt.frozenInputSha256);
  assert.equal(state.validation?.reconstructedFieldExact, true);
  for (const key of ['naturalPlainInstrumentedStateExact', 'naturalPlainInstrumentedRngExact',
    'naturalPlainInstrumentedPublicSnapshotEqual', 'allReplayArmsPreStateAndRngExact']) {
    assert.equal(state.validation?.[key], true, `${state.captureId} matrix state gate ${key} failed.`);
  }
  for (const [relative, hash] of Object.entries(state.sourceHashes)) {
    assert.equal(currentSourceHashes[relative], hash, `Frozen source mismatch ${relative}.`);
  }
  return state;
}

function verifyStateHistory(state, stream, historyReceipt, run) {
  assert.equal(stream.schema, STREAM_SCHEMA);
  assert.equal(stream.originPolicy, state.originPolicy);
  assert.equal(stream.seed, state.seed);
  assert.equal(state.writeStream.path, historyReceipt.path);
  assert.equal(state.writeStream.eventCountThroughTick,
    stream.events.filter(row => row.tick <= state.tick).length);
  const throughTick = stream.events.filter(row => row.tick <= state.tick);
  assert.equal(state.writeStream.lastSequenceThroughTick, throughTick.at(-1)?.sequence ?? null);
  const check = stream.captureChecks?.find(row => row.tick === state.tick
    && row.secondsCompleted === state.secondsCompleted);
  assert.ok(check, `Missing fixed-history field checkpoint for ${state.captureId}.`);
  assert.equal(check.valuesSha256, state.validation.reconstructedFieldSha256);
  assert.equal(run.sourceAndCapture.writeEventCount, throughTick.length);
  const expectedDecayCount = throughTick.filter(row => row.type === 'field-decay').length;
  const expectedDepositCount = throughTick.filter(row => row.type === 'field-deposit-write').length;
  for (const phaseId of PHASES) {
    const phase = run.historyByPhase[phaseId];
    assert.equal(phase.eventCount, throughTick.length);
    assert.equal(phase.decayCount, expectedDecayCount);
    assert.equal(phase.depositWriteCount, expectedDepositCount);
  }
}

async function readGzipJson(file, expectedSha, compressedBytes, uncompressedBytes, schema, label) {
  assert.match(expectedSha || '', /^[a-f0-9]{64}$/i, `${label} has malformed SHA-256 receipt.`);
  assert.ok(Number.isSafeInteger(compressedBytes) && compressedBytes > 0, `${label} compressed size receipt is invalid.`);
  assert.ok(Number.isSafeInteger(uncompressedBytes) && uncompressedBytes > 0,
    `${label} uncompressed size receipt is invalid.`);
  const compressed = await readFile(file);
  assert.equal(compressed.byteLength, compressedBytes, `${label} compressed size mismatch.`);
  assert.equal(sha256(compressed), expectedSha, `${label} compressed hash mismatch.`);
  const decompressed = gunzipSync(compressed, { maxOutputLength: uncompressedBytes });
  assert.equal(decompressed.byteLength, uncompressedBytes, `${label} uncompressed size mismatch.`);
  const value = JSON.parse(decompressed.toString('utf8'));
  assert.equal(value.schema, schema, `${label} schema mismatch.`);
  return value;
}

function validateFixedCohort(captures) {
  const expected = new Set();
  for (const origin of ['production', 'dtFeedback']) for (const seed of [20261005, 20261006, 20261007]) {
    for (const seconds of SECONDS) expected.add(`${origin}-seed-${seed}-${seconds}s`);
  }
  assert.deepEqual(new Set(captures.map(row => row.captureId)), expected,
    'Matrix capture IDs differ from the preregistered 2 origins × 3 seeds × 11 times.');
}

function compareSampleCoordinates(left, right) {
  const count = Math.min(left.length, right.length);
  let sameIndexCoordinatePairs = 0, sameIndexContextPairs = 0, firstGlobalMismatch = null;
  for (let index = 0; index < count; index += 1) {
    const sameCoordinate = left[index].x === right[index].x && left[index].y === right[index].y;
    const sameContext = JSON.stringify(left[index].context) === JSON.stringify(right[index].context);
    if (sameCoordinate) sameIndexCoordinatePairs += 1;
    if (sameContext) sameIndexContextPairs += 1;
    if ((!sameCoordinate || !sameContext || left[index].callIndex !== right[index].callIndex) && firstGlobalMismatch === null) {
      firstGlobalMismatch = { pairedIndex: index, p00Context: left[index].context,
        phaseContext: right[index].context, p00X: left[index].x, p00Y: left[index].y,
        phaseX: right[index].x, phaseY: right[index].y };
    }
  }
  if (left.length !== right.length && firstGlobalMismatch === null) {
    firstGlobalMismatch = { pairedIndex: count, p00Length: left.length, phaseLength: right.length };
  }
  return { sameIndexCoordinatePairs, sameIndexContextPairs,
    exactGlobalCallSequence: left.length === right.length && sameIndexCoordinatePairs === count
      && sameIndexContextPairs === count && firstGlobalMismatch === null,
    firstGlobalMismatch };
}

function pairedSampleRows(left, right) {
  const group = rows => {
    const map = new Map();
    for (const row of rows) {
      const antId = row.context?.antId;
      if (antId === undefined) continue;
      if (!map.has(antId)) map.set(antId, { local: [], wide: [] });
      const kind = row.context.kind === 'wide' ? 'wide' : 'local';
      map.get(antId)[kind].push(row);
    }
    return map;
  };
  const a = group(left), b = group(right), result = new Map();
  for (const antId of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(antId) || { local: [], wide: [] }, y = b.get(antId) || { local: [], wide: [] };
    const localExact = exactCoordinateList(x.local, y.local);
    const wideExact = exactCoordinateList(x.wide, y.wide);
    result.set(antId, { leftLocal: x.local, rightLocal: y.local,
      leftWide: x.wide, rightWide: y.wide,
      coordinateExact: localExact.exact && wideExact.exact,
      localCoordinateExact: localExact.exact, wideCoordinateExact: wideExact.exact });
  }
  return result;
}

function exactCoordinateList(left, right) {
  const count = Math.min(left.length, right.length);
  let matched = 0;
  for (; matched < count; matched += 1) {
    const a = left[matched], b = right[matched];
    if (!samePhysicalSampleQuery(a, b)) break;
  }
  return { exact: left.length === right.length && matched === count, matched, count };
}

function compareSampleValues(left, right) {
  const count = Math.min(left.length, right.length);
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const coordinatesExact = samePhysicalSampleQuery(left[i], right[i]);
    rows.push({ p00: left[i].value, phase: right[i].value,
      delta: right[i].value - left[i].value, changed: right[i].value !== left[i].value,
      coordinatesExact, globalCallIndexEqual: left[i].callIndex === right[i].callIndex,
      semanticContextEqual: JSON.stringify(left[i].context) === JSON.stringify(right[i].context),
      kind: left[i].context?.kind || null });
  }
  return { p00Calls: left.length, phaseCalls: right.length, pairedCalls: count,
    coordinateMatchedCalls: rows.filter(row => row.coordinatesExact).length,
    changedCalls: rows.filter(row => row.coordinatesExact && row.changed).length,
    meanAbsoluteDelta: rows.some(row => row.coordinatesExact)
      ? mean(rows.filter(row => row.coordinatesExact).map(row => Math.abs(row.delta))) : null,
    maximumAbsoluteDelta: rows.some(row => row.coordinatesExact)
      ? Math.max(...rows.filter(row => row.coordinatesExact).map(row => Math.abs(row.delta))) : null,
    pairedValues: rows };
}

function summarizeQueryCallComparison(leftSamples, rightSamples, kind) {
  const group = rows => {
    const map = new Map();
    for (const row of rows.filter(sample => sample.context?.kind === kind
      && sample.context?.antId !== undefined)) {
      const id = row.context.antId;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(row);
    }
    return map;
  };
  const left = group(leftSamples), right = group(rightSamples);
  const antIds = new Set([...left.keys(), ...right.keys()]);
  let pairedCalls = 0, exactQueryPairs = 0, globalCallIndexEqualPairs = 0;
  let semanticContextChangedPairs = 0, headingMetadataChangedPairs = 0;
  let unmatchedPairedCalls = 0, missingCalls = 0;
  let exactSequenceAnts = 0;
  const deltas = [];
  for (const antId of antIds) {
    const a = left.get(antId) || [], b = right.get(antId) || [];
    const count = Math.min(a.length, b.length);
    if (exactCoordinateList(a, b).exact) exactSequenceAnts += 1;
    missingCalls += Math.abs(a.length - b.length);
    for (let index = 0; index < count; index += 1) {
      pairedCalls += 1;
      const exactQuery = samePhysicalSampleQuery(a[index], b[index]);
      if (exactQuery) {
        exactQueryPairs += 1;
        deltas.push(b[index].value - a[index].value);
        if (a[index].callIndex === b[index].callIndex) globalCallIndexEqualPairs += 1;
        if (JSON.stringify(a[index].context) !== JSON.stringify(b[index].context)) {
          semanticContextChangedPairs += 1;
        }
        if (Number.isFinite(a[index].context?.heading) && Number.isFinite(b[index].context?.heading)
          && a[index].context.heading !== b[index].context.heading) headingMetadataChangedPairs += 1;
      } else unmatchedPairedCalls += 1;
    }
  }
  const p00Calls = leftSamples.filter(row => row.context?.kind === kind).length;
  const phaseCalls = rightSamples.filter(row => row.context?.kind === kind).length;
  const unclassifiedP00Calls = leftSamples.filter(row => row.context?.kind == null).length;
  const unclassifiedPhaseCalls = rightSamples.filter(row => row.context?.kind == null).length;
  return { p00Calls, phaseCalls, pairedCalls, missingCalls,
    exactQueryPairs, globalCallIndexEqualPairs, semanticContextChangedPairs,
    headingMetadataChangedPairs, unmatchedPairedCalls,
    rawValuesChangedAtExactQuery: deltas.filter(value => value !== 0).length,
    meanAbsoluteRawDeltaAtExactQuery: deltas.length ? mean(deltas.map(Math.abs)) : null,
    maxAbsoluteRawDeltaAtExactQuery: deltas.length ? Math.max(...deltas.map(Math.abs)) : null,
    sumAbsoluteRawDeltaAtExactQuery: deltas.reduce((sum, value) => sum + Math.abs(value), 0),
    exactPerAntSequences: { numerator: exactSequenceAnts, denominator: antIds.size },
    unclassifiedP00Calls, unclassifiedPhaseCalls };
}

function indexTrace(trace) {
  const map = new Map();
  for (const event of trace) {
    if (event.agentId === undefined) continue;
    if (!map.has(event.agentId)) map.set(event.agentId, new Map());
    const events = map.get(event.agentId);
    if (!events.has(event.type)) events.set(event.type, []);
    events.get(event.type).push(event);
  }
  return map;
}

function firstEvent(map, type) { return map.get(type)?.[0] || null; }
function hasEvent(map, type) { return Boolean(firstEvent(map, type)); }
function pairedEvent(left, right, type) { return { left: firstEvent(left, type), right: firstEvent(right, type) }; }

function compareObjectNumbers(left, right, fields) {
  const deltas = {};
  for (const field of fields) deltas[field] = compareScalar(left?.[field], right?.[field]);
  return { changed: Object.values(deltas).some(row => row.changed), fields: deltas };
}

function compareOptions(left, right) {
  if (!left || !right) return { p00Count: left?.length || 0, phaseCount: right?.length || 0,
    comparable: false, changed: null, maxAbsoluteTrailDelta: null,
    maxAbsoluteScoreDelta: null };
  const count = Math.min(left.length, right.length);
  const trailDeltas = [], scoreDeltas = [], headingDeltas = [], offsetDeltas = [], crowdingDeltas = [];
  for (let index = 0; index < count; index += 1) {
    trailDeltas.push(numberDelta(left[index].trail, right[index].trail));
    scoreDeltas.push(numberDelta(left[index].score, right[index].score));
    headingDeltas.push(Number.isFinite(left[index].heading) && Number.isFinite(right[index].heading)
      ? angleDelta(right[index].heading, left[index].heading) : null);
    offsetDeltas.push(numberDelta(left[index].offset, right[index].offset));
    crowdingDeltas.push(numberDelta(left[index].crowding, right[index].crowding));
  }
  return { p00Count: left.length, phaseCount: right.length,
    comparable: left.length === right.length,
    changed: left.length !== right.length || trailDeltas.some(value => value !== 0)
      || scoreDeltas.some(value => value !== 0) || headingDeltas.some(value => value !== 0)
      || offsetDeltas.some(value => value !== 0) || crowdingDeltas.some(value => value !== 0),
    maxAbsoluteTrailDelta: trailDeltas.length ? Math.max(...trailDeltas.map(Math.abs)) : null,
    maxAbsoluteScoreDelta: scoreDeltas.length ? Math.max(...scoreDeltas.map(Math.abs)) : null,
    maxAbsoluteHeadingDeltaRad: maxAbs(headingDeltas),
    maxAbsoluteOffsetDelta: maxAbs(offsetDeltas),
    maxAbsoluteCrowdingDelta: maxAbs(crowdingDeltas) };
}

function pairOptions(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return null;
  const count = Math.min(left.length, right.length);
  return { p00Count: left.length, phaseCount: right.length,
    pairs: Array.from({ length: count }, (_, index) => ({ index,
      p00: { heading: left[index].heading, offset: left[index].offset, trail: left[index].trail,
        crowding: left[index].crowding, score: left[index].score },
      phase: { heading: right[index].heading, offset: right[index].offset, trail: right[index].trail,
        crowding: right[index].crowding, score: right[index].score } })) };
}

function maxAbs(values) {
  const finite = values.filter(Number.isFinite).map(Math.abs);
  return finite.length ? Math.max(...finite) : null;
}

function compareScalar(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return { p00: left ?? null, phase: right ?? null,
    delta: null, changed: null, signChanged: null };
  const delta = right - left;
  return { p00: left, phase: right, delta, changed: delta !== 0,
    signChanged: left !== 0 && right !== 0 && Math.sign(left) !== Math.sign(right) };
}

function compareAngle(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return { p00: left ?? null, phase: right ?? null,
    deltaRad: null, changed: null, signChanged: null };
  const deltaRad = angleDelta(right, left);
  return { p00: left, phase: right, deltaRad, changed: deltaRad !== 0,
    signChanged: left !== 0 && right !== 0 && Math.sign(left) !== Math.sign(right) };
}

function compareTravel(left, right) {
  if (!left || !right) return { comparable: false, angleChanged: null, vectorChanged: null,
    distanceChanged: null, angleDeltaRad: null, distanceDelta: null, deltaX: null, deltaY: null };
  const leftX = left.to.x - left.from.x, leftY = left.to.y - left.from.y;
  const rightX = right.to.x - right.from.x, rightY = right.to.y - right.from.y;
  const leftDistance = Math.hypot(leftX, leftY), rightDistance = Math.hypot(rightX, rightY);
  const leftAngle = leftDistance > 0 ? Math.atan2(leftY, leftX) : null;
  const rightAngle = rightDistance > 0 ? Math.atan2(rightY, rightX) : null;
  const angleDeltaRad = Number.isFinite(leftAngle) && Number.isFinite(rightAngle)
    ? angleDelta(rightAngle, leftAngle) : null;
  const deltaX = rightX - leftX, deltaY = rightY - leftY;
  return { comparable: true, p00AngleRad: leftAngle, phaseAngleRad: rightAngle,
    angleDeltaRad, angleChanged: angleDeltaRad === null ? null : angleDeltaRad !== 0,
    p00Distance: leftDistance, phaseDistance: rightDistance, distanceDelta: rightDistance - leftDistance,
    distanceChanged: rightDistance !== leftDistance, deltaX, deltaY,
    vectorChanged: deltaX !== 0 || deltaY !== 0,
    p00Scale: left.scale ?? null, phaseScale: right.scale ?? null };
}

function bodyTurnRadians(targetEvent, bodyEvent) {
  if (!targetEvent || !bodyEvent) return null;
  return angleDelta(bodyEvent.headingAfterTurn, targetEvent.headingBeforeTurn);
}

function collisionScale(arm, antId) {
  const event = (arm.trace || []).find(row => row.type === 'collision-scales');
  return event?.displacements?.find(row => row.agentId === antId)?.scale;
}

function choiceDrawCount(left, right) {
  const leftOptions = firstEvent(left, 'wide-options'), rightOptions = firstEvent(right, 'wide-options');
  const leftChoice = firstEvent(left, 'intention-chosen'), rightChoice = firstEvent(right, 'intention-chosen');
  return { p00: leftOptions && leftChoice ? leftChoice.rngCallsAfterChoice - leftOptions.rngCallsBeforeChoice : null,
    phase: rightOptions && rightChoice ? rightChoice.rngCallsAfterChoice - rightOptions.rngCallsBeforeChoice : null };
}

function firstDivergence({ localSamples, baseTrail, phaseTrail, baseDue, phaseDue,
  baseOptions, phaseOptions, baseChoice, phaseChoice, localTurn, target, body, travel,
  localCoordinateExact, wideCoordinateExact }) {
  const localMismatch = firstSampleMismatch(localSamples.leftLocal, localSamples.rightLocal, 'local');
  if (localMismatch) return localMismatch;
  if (!localCoordinateExact) return { stage: 'sample-call-correspondence', kind: 'local' };
  if (baseTrail && phaseTrail && ['left', 'center', 'right', 'strength', 'coherence', 'steering']
    .some(key => baseTrail[key] !== phaseTrail[key])) return { stage: 'sensor-derived-local-trail' };
  if (baseDue !== phaseDue) return { stage: 'decision-due-branch', p00Due: baseDue, phaseDue };
  if (baseDue && phaseDue) {
    const wideMismatch = firstSampleMismatch(localSamples.leftWide, localSamples.rightWide, 'wide');
    if (wideMismatch) return wideMismatch;
    if (!wideCoordinateExact) return { stage: 'sample-call-correspondence', kind: 'wide' };
    if (compareOptions(baseOptions, phaseOptions).changed
      || baseChoice?.chosenHeading !== phaseChoice?.chosenHeading
      || baseChoice?.chosenOffset !== phaseChoice?.chosenOffset
      || baseChoice?.chosenScore !== phaseChoice?.chosenScore) return { stage: 'due-decision-output' };
  }
  if (localTurn.left?.rawLocalCueU !== localTurn.right?.rawLocalCueU) return { stage: 'local-cue' };
  if (localTurn.left?.feedbackContributionV !== localTurn.right?.feedbackContributionV
    || localTurn.left?.clampedLocalTurn !== localTurn.right?.clampedLocalTurn) return { stage: 'local-turn' };
  if (target.left?.targetHeadingAfterCrowding !== target.right?.targetHeadingAfterCrowding) return { stage: 'target-heading' };
  if (body.left?.headingAfterTurn !== body.right?.headingAfterTurn) return { stage: 'body-turn' };
  if (travel.left?.to?.x !== travel.right?.to?.x || travel.left?.to?.y !== travel.right?.to?.y) return { stage: 'actual-travel' };
  return { stage: 'none-observed' };
}

function firstSampleMismatch(left, right, kind) {
  const count = Math.min(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    const a = left[index], b = right[index];
    if (!samePhysicalSampleQuery(a, b)) {
      return { stage: 'sample-call-correspondence', kind, p00CallIndex: a.callIndex,
        phaseCallIndex: b.callIndex, p00X: a.x, p00Y: a.y, phaseX: b.x, phaseY: b.y };
    }
    if (a.value !== b.value) return { stage: 'sensor-read', kind, antId: a.context?.antId,
      callIndex: a.callIndex, p00Value: a.value, phaseValue: b.value };
  }
  if (left.length !== right.length) return { stage: 'sample-call-sequence', kind,
    p00Calls: left.length, phaseCalls: right.length };
  return null;
}

function samePhysicalSampleQuery(left, right) {
  return left?.x === right?.x && left?.y === right?.y
    && left?.context?.kind === right?.context?.kind
    && left?.context?.antId === right?.context?.antId;
}

function rngStreamAlignment(left, right) {
  const stages = ['intention-input', 'intention-updated', 'intention-no-choice', 'wide-options', 'intention-chosen'];
  let branchMismatch = false, absoluteCounterOffsetExposure = false, firstDifference = null;
  for (const type of stages) {
    const a = firstEvent(left, type), b = firstEvent(right, type);
    if (Boolean(a) !== Boolean(b)) {
      branchMismatch = true;
      firstDifference ??= { stage: `${type}-event-presence`, p00Present: Boolean(a), phasePresent: Boolean(b) };
    }
    const p00Calls = rngCalls(a), phaseCalls = rngCalls(b);
    if (a && b && Number.isFinite(p00Calls) && Number.isFinite(phaseCalls) && p00Calls !== phaseCalls) {
      absoluteCounterOffsetExposure = true;
      firstDifference ??= { stage: `${type}-absolute-global-counter`, p00Calls, phaseCalls };
    }
  }
  return { branchMismatch, absoluteCounterOffsetExposure, firstDifference,
    drawsComparableAfter: !branchMismatch && !absoluteCounterOffsetExposure };
}

function summarizeRngStreamAlignment(rows) {
  const stages = {};
  let branchMismatches = 0, absoluteCounterOffsetExposures = 0;
  for (const row of rows) {
    const alignment = row.rngStreamAlignment;
    const first = alignment?.firstDifference;
    if (first) stages[first.stage] = (stages[first.stage] || 0) + 1;
    if (alignment?.branchMismatch) branchMismatches += 1;
    if (alignment?.absoluteCounterOffsetExposure) absoluteCounterOffsetExposures += 1;
  }
  return { branchMismatches, absoluteCounterOffsetExposures,
    antStates: rows.length, firstDifferenceByStage: stages };
}

function compareRngCheckpoints(left, right) {
  if (!isValidRngCheckpoint(left) || !isValidRngCheckpoint(right)) return { comparable: false, p00Calls: left?.calls ?? null,
    phaseCalls: right?.calls ?? null, callCountDelta: null, callCountEqual: null, stateEqual: null,
    seedEqual: null, algorithmEqual: null, checkpointEqual: null };
  const callCountEqual = left.calls === right.calls;
  const stateEqual = left.state === right.state;
  const seedEqual = left.seed === right.seed;
  const algorithmEqual = left.algorithm === right.algorithm;
  return { comparable: true, p00Calls: left.calls, phaseCalls: right.calls,
    callCountDelta: right.calls - left.calls, callCountEqual,
    stateEqual, algorithmEqual, seedEqual,
    checkpointEqual: callCountEqual && stateEqual && seedEqual && algorithmEqual };
}

function isValidRngCheckpoint(value) {
  return Boolean(value && value.algorithm === RNG_ALGORITHM
    && Number.isSafeInteger(value.calls) && value.calls >= 0
    && Number.isInteger(value.state) && value.state >= 0 && value.state <= 0xffffffff
    && Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 0xffffffff);
}

function rngCalls(event) {
  if (!event) return null;
  return event.rngCallsAfterChoice ?? event.rngCallsBeforeChoice ?? event.rngCalls ?? null;
}

function selectDose(value) {
  const keys = ['requestedDose', 'acceptedDose', 'boundaryClippedDose', 'acceptedAboveRequestDose',
    'elapsedDecaySeconds', 'storedMass', 'uncappedShadowMass', 'capStorageLoss', 'cappedCellCount', 'peak'];
  return Object.fromEntries(keys.filter(key => Number.isFinite(value?.[key])).map(key => [key, value[key]]));
}

function aggregateDoseDelta(a, b) {
  return Object.fromEntries(Object.keys(a).filter(key => Number.isFinite(a[key]) && Number.isFinite(b?.[key]))
    .map(key => [key, b[key] - a[key]]));
}

function pushMagnitude(target, value) { if (Number.isFinite(value)) target.push(Math.abs(value)); }
function magnitudeSummary(values) { return { meanAbsolute: values.length ? mean(values) : null,
  medianAbsolute: values.length ? median(values) : null, denominator: values.length }; }
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values) { const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; }
function angleDelta(a, b) { return ((a - b + Math.PI) % (2 * Math.PI) + (2 * Math.PI)) % (2 * Math.PI) - Math.PI; }
function numberDelta(a, b) { return Number.isFinite(a) && Number.isFinite(b) ? b - a : null; }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function resolveInsideProject(value) {
  const target = path.resolve(PROJECT_ROOT, value);
  const relative = path.relative(PROJECT_ROOT, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    if (!relative) return target;
    throw new RangeError('Analysis paths must remain inside the repository.');
  }
  return target;
}
function safeRelative(value) {
  const normalized = String(value || '').replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new RangeError('Receipt path must remain within its evidence directory.');
  }
  return normalized;
}
async function hashFiles(paths) {
  return Object.fromEntries(await Promise.all(paths.map(async relative => [relative,
    sha256(await readFile(path.join(PROJECT_ROOT, relative)))])));
}

export function renderReport(result) {
  const lines = [
    '# Fixed-history field-phase analysis', '',
    `Generated from ${result.qualification.phaseZeroPassedCount}/66 phase-zero-qualified receipts and ${result.inputReceipts.captureCount} preregistered states.`, '',
    `Matrix manifest SHA-256: \`${result.inputReceipts.matrixManifestSha256}\`. Cohort manifest SHA-256: \`${result.inputReceipts.cohortManifestSha256}\`.`, '',
    '## Source hashes', '',
    `Phase helper SHA-256: \`${result.inputReceipts.phaseHelperSha256}\`. Current phase-runner SHA-256: \`${result.inputReceipts.currentRunnerSha256}\`.`, '',
    '| Frozen matrix source | SHA-256 |', '|---|---|',
    ...Object.entries(result.inputReceipts.frozenSourceHashes).sort(([a], [b]) => a.localeCompare(b))
      .map(([file, hash]) => `| \`${file}\` | \`${hash}\` |`),
    '',
    '| Runner revision | Receipts | SHA-256 | Preserved source |', '|---|---:|---|---|',
    ...result.inputReceipts.runnerRevisions.map(row => `| ${row.scopeNote} | ${row.receiptCount} | \`${row.sha256}\` | \`${row.preservedCopyPath || row.sourcePath}\` |`), '',
    '## Qualification', '',
    `All 66 compressed phase receipts, compressed states and write-history receipts, frozen source hashes, p00 full-raster hashes, and p00 per-mode trace/state/snapshot/RNG comparisons passed analyzer gates.`, '',
    '## Per-capture outcomes', '',
    'These rows retain every capture time before seed/origin aggregation. Incidence fields are numerator/valid denominator. Each pair compares p00 with the named phase inside the same captured state and movement arm.', '',
    '| Origin | Capture ID | Seed | Seconds | Phase | Movement arm | All-phase-interior local ants / observed local ants | Boundary p00 local calls / p00 local calls | Exact global sample-call sequence | Exact per-ant local physical query sequences / local-read ants | Local physical query pairs / paired; global-index equal / exact; raw changed / exact | Wide physical query pairs / paired; global-index equal / exact; heading metadata changed; raw changed / exact | Wide unmatched paired + missing calls | Local cue changed | Interior-only cue changed | Target changed | Body turn changed | Travel angle changed | Interior-only travel angle changed | Travel vector changed | Due status changed | Options changed when both due | Trace branch mismatches / absolute cumulative RNG-counter offsets / ant states | End-tick whole-arm RNG checkpoint: Δcalls; state/seed/algorithm/all equal | Mean abs cue Δ (n) | Mean abs steering Δ (n) | Mean abs target Δ (n) | Mean abs body turn Δ (n) | Mean abs travel angle Δ (n) | Mean abs travel distance Δ (n) | Δaccepted dose | Δclipped dose | Δstored mass | Δcap loss |',
    '|---|---|---:|---:|---|---|---:|---:|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
  ];
  const captureRows = [...result.captures].sort((a, b) => a.originPolicy.localeCompare(b.originPolicy)
    || a.seed - b.seed || a.secondsCompleted - b.secondsCompleted);
  for (const capture of captureRows) for (const comparison of capture.comparisons) {
    const x = comparison.allAnts, magnitude = x.magnitudes;
    const dose = capture.dose.find(row => row.phaseId === comparison.phaseId)
      .armDeltaVsP00.find(row => row.movementMode === comparison.movementMode);
    const localQueries = comparison.sensorQueryCorrespondence.local;
    const wideQueries = comparison.sensorQueryCorrespondence.wide;
    const textMagnitude = item => `${fmt(item.meanAbsolute)} (n=${item.denominator})`;
    const checkpoint = comparison.rngUsageAtTick;
    lines.push(`| ${capture.originPolicy} | ${capture.captureId} | ${capture.seed} | ${capture.secondsCompleted} | ${comparison.phaseId} | ${comparison.movementMode} | ${comparison.localReadQualification.allLocalReadsInteriorAnts}/${comparison.localReadQualification.observedAnts} | ${comparison.localReadQualification.boundaryExposedCalls.p00}/${comparison.localReadQualification.p00Calls} | ${comparison.sampleCalls.exactGlobalCallSequence ? 'yes' : 'no'} | ${comparison.localReadQualification.exactLocalCallSequences}/${comparison.localReadQualification.observedAnts} | ${localQueries.exactQueryPairs}/${localQueries.pairedCalls}; ${localQueries.globalCallIndexEqualPairs}/${localQueries.exactQueryPairs}; ${localQueries.rawValuesChangedAtExactQuery}/${localQueries.exactQueryPairs} | ${wideQueries.exactQueryPairs}/${wideQueries.pairedCalls}; ${wideQueries.globalCallIndexEqualPairs}/${wideQueries.exactQueryPairs}; ${wideQueries.headingMetadataChangedPairs}; ${wideQueries.rawValuesChangedAtExactQuery}/${wideQueries.exactQueryPairs} | ${wideQueries.unmatchedPairedCalls}+${wideQueries.missingCalls} | ${ratio(x.localCueChanged)} | ${ratio(comparison.interiorOnly.localCueChanged)} | ${ratio(x.targetHeadingChanged)} | ${ratio(x.bodyTurnChanged)} | ${ratio(x.travelAngleChanged)} | ${ratio(comparison.interiorOnly.travelAngleChanged)} | ${ratio(x.travelVectorChanged)} | ${ratio(x.decisionDueStatusChanged)} | ${ratio(x.dueOptionsChanged)} | ${comparison.rngStreamAlignment.branchMismatches}/${comparison.rngStreamAlignment.absoluteCounterOffsetExposures}/${comparison.rngStreamAlignment.antStates} | ${checkpoint.callCountDelta}; ${checkpoint.stateEqual}/${checkpoint.seedEqual}/${checkpoint.algorithmEqual}/${checkpoint.checkpointEqual} | ${textMagnitude(magnitude.meanAbsLocalCueDelta)} | ${textMagnitude(magnitude.meanAbsSteeringDelta)} | ${textMagnitude(magnitude.meanAbsTargetHeadingDeltaRad)} | ${textMagnitude(magnitude.meanAbsBodyTurnDeltaRad)} | ${textMagnitude(magnitude.meanAbsTravelAngleDeltaRad)} | ${textMagnitude(magnitude.meanAbsTravelDistanceDelta)} | ${fmt(dose.oneTick.acceptedDose)} | ${fmt(dose.oneTick.boundaryClippedDose)} | ${fmt(dose.oneTickStorageDelta.storedMass)} | ${fmt(dose.oneTickStorageDelta.capStorageLoss)} |`);
  }
  lines.push('',
    '## Seed and origin summaries', '',
    '| Origin | Seed | Phase | Movement arm | States | All-phase-interior local ants / local-read ants | Boundary-exposed local ants / local-read ants | p00 boundary local calls / local calls | Exact global sample-call sequences / states | Exact per-ant local physical query sequences / local-read ants | Local physical query pairs / paired; global-index equal / exact; raw changed / exact | Wide physical query pairs / paired; global-index equal / exact; heading metadata changed; raw changed / exact | Wide unmatched paired + missing calls | Local cue changed | Interior-only cue changed | Due status changed | Options changed when both due | Choice heading changed when both due | Target changed | Body turn changed | Collision scale changed | Travel angle changed | Interior-only travel angle changed | Travel distance changed | Cue changed and travel vector changed | Trace branch mismatches / absolute cumulative RNG-counter offsets / ant states | End-tick whole-arm checkpoint differences / states; calls / state / seed / algorithm changed; mean Δcalls |',
    '|---|---:|---|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|'
  );
  for (const group of result.groups) for (const comparison of group.comparisons) {
    const x = comparison.allAnts;
    const interior = comparison.interiorOnly;
    const localQueries = x.sensorQueryCorrespondence.local;
    const wideQueries = x.sensorQueryCorrespondence.wide;
    const tick = x.rngUsageAtTick;
    lines.push(`| ${group.originPolicy} | ${group.seed} | ${comparison.phaseId} | ${comparison.movementMode} | ${comparison.states} | ${x.localInteriorAntStates}/${x.localReadAntStates} | ${x.boundaryExposedAntStates}/${x.localReadAntStates} | ${x.boundaryExposedLocalCalls}/${x.localReadCalls} | ${ratio(x.exactGlobalCallSequences)} | ${ratio(x.exactLocalCallSequences)} | ${localQueries.exactQueryPairs}/${localQueries.pairedCalls}; ${localQueries.globalCallIndexEqualPairs}/${localQueries.exactQueryPairs}; ${localQueries.rawValuesChangedAtExactQuery}/${localQueries.exactQueryPairs} | ${wideQueries.exactQueryPairs}/${wideQueries.pairedCalls}; ${wideQueries.globalCallIndexEqualPairs}/${wideQueries.exactQueryPairs}; ${wideQueries.headingMetadataChangedPairs}; ${wideQueries.rawValuesChangedAtExactQuery}/${wideQueries.exactQueryPairs} | ${wideQueries.unmatchedPairedCalls}+${wideQueries.missingCalls} | ${ratio(x.localCueChanged)} | ${ratio(interior.localCueChanged)} | ${ratio(x.decisionDueStatusChanged)} | ${ratio(x.dueOptionsChanged)} | ${ratio(x.chosenHeadingChanged)} | ${ratio(x.targetHeadingChanged)} | ${ratio(x.bodyTurnChanged)} | ${ratio(x.collisionScaleChanged)} | ${ratio(x.travelAngleChanged)} | ${ratio(interior.travelAngleChanged)} | ${ratio(x.travelDistanceChanged)} | ${ratio(x.cueChangedAndTravelVectorChanged)} | ${x.rngStreamAlignment.branchMismatches}/${x.rngStreamAlignment.absoluteCounterOffsetExposures}/${x.rngStreamAlignment.antStates} | ${ratio(tick.checkpointDifferentTicks)}; ${ratio(tick.changedCallCountTicks)}/${ratio(tick.stateDifferentTicks)}/${ratio(tick.seedDifferentTicks)}/${ratio(tick.algorithmDifferentTicks)}; ${fmt(tick.meanCallCountDelta)} |`);
  }
  lines.push('',
    '## Fresh-choice and held/no-choice strata', '',
    'Status is classified separately in p00 and the shifted arm: fresh-choice means wide options plus an intention choice; held/no-choice means an explicit no-choice event with no wide-options event; due/no-choice and ambiguous/missing remain separate. Status-transition counts are distinct from option-score and chosen-heading changes, which are summarized only when both arms made a fresh choice.', '',
    '| Origin | Seed | Phase | Movement arm | p00 status | Ant-state count / all states | Local-read ant states | Status changed | Local cue changed | Target changed | Body turn changed | Travel angle changed | Travel vector changed |',
    '|---|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|'
  );
  const decisionStatuses = ['fresh-choice', 'held-no-choice', 'due-no-choice', 'ambiguous/missing'];
  for (const group of result.groups) for (const comparison of group.comparisons) {
    const strata = comparison.allAnts.decisionStrata;
    for (const status of decisionStatuses) {
      const row = strata.byP00Status[status];
      lines.push(`| ${group.originPolicy} | ${group.seed} | ${comparison.phaseId} | ${comparison.movementMode} | ${status} | ${strata.p00StatusCounts[status].numerator}/${strata.p00StatusCounts[status].denominator} | ${row.localReadAntStates} | ${ratio(row.phaseStatusChanged)} | ${ratio(row.localCueChanged)} | ${ratio(row.targetHeadingChanged)} | ${ratio(row.bodyTurnChanged)} | ${ratio(row.travelAngleChanged)} | ${ratio(row.travelVectorChanged)} |`);
    }
  }
  lines.push('',
    '| Origin | Seed | Phase | Movement arm | Both-fresh-choice states | Option scores changed / both fresh | Chosen heading changed / both fresh | Mean absolute chosen-heading delta (rad; n) | p00→phase status transitions |',
    '|---|---:|---|---|---:|---:|---:|---:|---|'
  );
  for (const group of result.groups) for (const comparison of group.comparisons) {
    const strata = comparison.allAnts.decisionStrata;
    const transitions = Object.entries(strata.transitions).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => `${key}=${count}`).join('; ') || 'none';
    lines.push(`| ${group.originPolicy} | ${group.seed} | ${comparison.phaseId} | ${comparison.movementMode} | ${strata.bothFresh.antStates} | ${ratio(strata.bothFresh.optionScoresChanged)} | ${ratio(strata.bothFresh.choiceHeadingChanged)} | ${fmt(strata.bothFresh.meanAbsoluteChoiceHeadingDeltaRad)} (n=${strata.bothFresh.choiceHeadingDeltaDenominator}) | ${transitions} |`);
  }
  lines.push('',
    'Every row is one fixed seed × origin history across all 11 preregistered times; each incidence is shown as numerator/valid denominator. The interior-only subset requires every local read by that ant in all four phases to qualify interior. Per-call interior status remains in the compressed results. Repeated ants and times are not independent replicates. Comparisons are paired by frozen capture and movement arm; a due/no-choice branch difference or random-call-count difference makes downstream draw matching unavailable.', '',
    '## First divergence and RNG boundary', '',
    '| Origin | Seed | Phase | Movement arm | Ant-states | First local raw-read difference | First local-call correspondence difference | First due-status difference | First wide raw-read difference | Due-option/choice difference | Local cue/turn/target/body/travel first difference | No difference observed | Per-ant trace branch mismatch / absolute global RNG counter offset exposure | End-tick whole-arm checkpoint different / states |',
    '|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
  );
  for (const group of result.groups) for (const comparison of group.comparisons) {
    const first = comparison.firstDivergenceCounts;
    const rng = comparison.allAnts.rngStreamAlignment;
    const localReadFirst = (first['sensor-read-local'] || 0) + (first['sensor-derived-local-trail'] || 0);
    const localCoordinateFirst = (first['sample-call-coordinate-local'] || 0) + (first['sample-call-sequence-local'] || 0);
    const wideCoordinateFirst = (first['sample-call-coordinate-wide'] || 0) + (first['sample-call-sequence-wide'] || 0);
    lines.push(`| ${group.originPolicy} | ${group.seed} | ${comparison.phaseId} | ${comparison.movementMode} | ${comparison.allAnts.antStateDenominator} | ${localReadFirst} | ${localCoordinateFirst} | ${first['decision-due-branch'] || 0} | ${first['sensor-read-wide'] || 0} + ${wideCoordinateFirst} correspondence | ${first['due-decision-output'] || 0} | ${(first['local-cue'] || 0) + (first['local-turn'] || 0) + (first['target-heading'] || 0) + (first['body-turn'] || 0) + (first['actual-travel'] || 0)} | ${first['none-observed'] || 0} | ${rng.branchMismatches}/${rng.absoluteCounterOffsetExposures} | ${ratio(comparison.allAnts.rngUsageAtTick.checkpointDifferentTicks)} / ${comparison.allAnts.rngUsageAtTick.checkpointDifferentTicks.denominator} |`);
  }
  lines.push('',
    'Per-ant trace RNG rows report traced branch/event-presence mismatches and absolute cumulative RNG-counter offsets visible at that ant’s events. These absolute counters include draws consumed before that ant, so a later ant’s offset is stream-alignment exposure and does not establish that the ant caused extra draws. The exact end-tick RNG checkpoint remains a separate whole-arm comparison of state, calls, seed and algorithm. A checkpoint difference without a corresponding intention-trace difference is downstream/post-intention or otherwise world-level; it cannot be attributed to a specific ant.', '',
    '## Transfer magnitudes', '',
    '| Origin | Seed | Phase | Movement arm | Mean absolute local cue delta (rad) | Mean absolute sensor steering delta | Mean absolute target heading delta (rad) | Mean absolute body turn delta (rad) | Mean absolute collision-scale delta | Mean absolute travel angle delta (rad) | Mean absolute travel distance delta | Denominators cue / steering / target / body / scale / angle / distance |',
    '|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|'
  );
  for (const group of result.groups) for (const comparison of group.comparisons) {
    const m = comparison.allAnts.magnitudes;
    lines.push(`| ${group.originPolicy} | ${group.seed} | ${comparison.phaseId} | ${comparison.movementMode} | ${fmt(m.meanAbsLocalCueDelta.meanAbsolute)} | ${fmt(m.meanAbsSteeringDelta.meanAbsolute)} | ${fmt(m.meanAbsTargetHeadingDeltaRad.meanAbsolute)} | ${fmt(m.meanAbsBodyTurnDeltaRad.meanAbsolute)} | ${fmt(m.meanAbsCollisionScaleDelta.meanAbsolute)} | ${fmt(m.meanAbsTravelAngleDeltaRad.meanAbsolute)} | ${fmt(m.meanAbsTravelDistanceDelta.meanAbsolute)} | ${[m.meanAbsLocalCueDelta.denominator, m.meanAbsSteeringDelta.denominator, m.meanAbsTargetHeadingDeltaRad.denominator, m.meanAbsBodyTurnDeltaRad.denominator, m.meanAbsCollisionScaleDelta.denominator, m.meanAbsTravelAngleDeltaRad.denominator, m.meanAbsTravelDistanceDelta.denominator].join(' / ')} |`);
  }
  lines.push('',
    '## Dose and boundary accounting', '',
    'The compressed result retains each capture × phase × movement arm ledger: requested and accepted API dose, boundary-clipped dose, accepted-above-request discrepancy, decay, stored raster mass, uncapped-shadow mass, cap-storage loss, capped cells and peak cell. It also retains phase-history totals and one-tick increments/differences. These measures are reported as outputs of the finite translated raster, not normalized to force equal dose.', '',
    'Per-call and per-ant all-local-reads-interior eligibility, boundary-exposed calls/ants, exact physical sample-call correspondence, raw sample deltas, and phase dose ledgers are in the compressed result. A paired raw query requires the same ant, sensor kind, physical x/y and per-ant call order; arm-global callIndex and wide heading metadata are reported separately. Changed wide x/y and calls with no partner remain unmatched; heading changes at identical x/y do not by themselves break a raw raster-read match. No boundary-exposed call is relabeled interior.', '',
    '| Origin | Seed | Phase | Movement arm | Fixed history Δrequested | Δaccepted | Δclipped | Δabove request | Δstored | Δcap loss | One-tick Δrequested | Δaccepted | Δclipped | Δabove request | Δstored | Δcap loss | N states |',
    '|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
  );
  for (const group of result.groups) for (const comparison of group.comparisons) {
    const doseRows = comparison.dose;
    const field = (measure, key) => meanRange(doseRows.map(row => measure(row)[key]).filter(Number.isFinite));
    const history = (_row) => _row.phase.fixedHistoryDeltaVsP00;
    const oneTick = row => row.phase.armDeltaVsP00.find(item => item.movementMode === comparison.movementMode).oneTick;
    const stored = row => row.phase.armDeltaVsP00.find(item => item.movementMode === comparison.movementMode).oneTickStorageDelta;
    lines.push(`| ${group.originPolicy} | ${group.seed} | ${comparison.phaseId} | ${comparison.movementMode} | ${field(history, 'requestedDose')} | ${field(history, 'acceptedDose')} | ${field(history, 'boundaryClippedDose')} | ${field(history, 'acceptedAboveRequestDose')} | ${field(history, 'storedMass')} | ${field(history, 'capStorageLoss')} | ${field(oneTick, 'requestedDose')} | ${field(oneTick, 'acceptedDose')} | ${field(oneTick, 'boundaryClippedDose')} | ${field(oneTick, 'acceptedAboveRequestDose')} | ${field(stored, 'storedMass')} | ${field(stored, 'capStorageLoss')} | ${doseRows.length} |`);
  }
  lines.push('',
    '## Counterexamples from the complete fixed sample', '',
    `Largest observed travel-angle change: ${formatExample(result.counterexamples.largestObservedTravelAngleDelta)}.`,
    `Local cue changed while travel vector stayed the same: ${formatExample(result.counterexamples.cueChangedButTravelVectorUnchanged)}.`,
    `Travel vector changed with no local cue change: ${formatExample(result.counterexamples.travelVectorChangedWithoutLocalCueChange)}.`,
    `Boundary-exposed local cue change: ${formatExample(result.counterexamples.boundaryExposedCueChange)}.`, '',
    '## Interpretation limits', '',
    '- This measures incidence and the stages at which a default-Gaussian half-cell phase alteration reaches realized one-tick travel under a fixed captured history. It cannot prove pheromone total contribution or field dominance.',
    '- Raw field-phase sensitivity is counted only at equal physical x/y queries for the same ant, sensor kind and per-ant order. Wide x/y changes are downstream query geometry or controller-branch outcomes, not evidence of a direct raster-value difference. Wide option and heading contrasts are conditional on both arms making a fresh choice; later draw identity is not claimed after a branch mismatch or cumulative RNG-counter offset.',
    '- The translated view covers controller sample and write methods. Direct raster snapshots and later `TrailPlateBirth`/material consumers are not phase-equivariant, so post-tick material state is not interpreted as a consistent alternate world.',
    '- The phase challenge does not compare kernels, grid sizes, diffusion, dose settings, or an alternative field law.'
  );
  return `${lines.join('\n')}\n`;
}

function assertReportIntegrity(report, result) {
  assert.doesNotMatch(report, /\b(?:undefined|NaN)\b/, 'Rendered report contains an undefined or NaN value.');
  const lines = report.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith('|') || !/^\|\s*:?-{3}/.test(lines[index + 1] || '')) continue;
    const columns = lines[index].split('|').length - 2;
    assert.equal(lines[index + 1].split('|').length - 2, columns,
      `Markdown table separator has the wrong column count at report line ${index + 2}.`);
    for (let row = index + 2; row < lines.length && lines[row].startsWith('|'); row += 1) {
      assert.equal(lines[row].split('|').length - 2, columns,
        `Markdown table row has the wrong column count at report line ${row + 1}.`);
    }
  }

  assert.equal(result.captures.length, result.inputReceipts.captureCount,
    'Rendered report inputs do not contain every preregistered capture.');
  const captureIds = new Set(result.captures.map(row => row.captureId));
  assert.equal(captureIds.size, result.inputReceipts.captureCount,
    'Rendered report capture IDs must be complete and unique.');
  const start = report.indexOf('## Per-capture outcomes');
  const end = report.indexOf('## Seed and origin summaries');
  assert.ok(start >= 0 && end > start, 'Per-capture outcome table is missing.');
  const table = report.slice(start, end).split('\n').filter(line => line.startsWith('|'));
  const headings = table[0]?.split('|').slice(1, -1).map(cell => cell.trim());
  assert.equal(headings?.[1], 'Capture ID', 'Per-capture table must identify each capture explicitly.');
  const renderedKeys = table.slice(2).map(line => {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    return `${cells[1]}/${cells[4]}/${cells[5]}`;
  }).sort();
  const expectedKeys = result.captures.flatMap(capture => capture.comparisons.map(comparison =>
    `${capture.captureId}/${comparison.phaseId}/${comparison.movementMode}`)).sort();
  assert.deepEqual(renderedKeys, expectedKeys,
    'Per-capture report rows must include each capture × phase × movement comparison exactly once.');
}

function ratio(value) { return `${value.numerator}/${value.denominator}`; }
function fmt(value) { return Number.isFinite(value) ? value.toExponential(3) : 'n/a'; }
function meanRange(values) {
  if (!values.length) return 'n/a';
  const average = mean(values), low = Math.min(...values), high = Math.max(...values);
  return `${average.toExponential(2)} [${low.toExponential(2)}, ${high.toExponential(2)}]`;
}
function formatExample(row) {
  if (!row) return 'none observed';
  const angle = row.actualTravel?.angleDeltaRad;
  const cue = row.localCue?.delta;
  return `${row.captureId} ${row.movementMode}/${row.phaseId} ${row.antId}, ${row.interiorEligible ? 'interior' : 'boundary-exposed or unqualified'}, cue Δ ${fmt(cue)} rad, travel-angle Δ ${fmt(angle)} rad, first ${row.firstDivergence?.stage || 'unknown'}, RNG trace ${row.rngStreamAlignment?.firstDifference?.stage || 'no branch/counter mismatch observed'}`;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--help' || key === '-h') return { help: true };
    if (!['--matrix-dir', '--cohort-manifest', '--output-dir'].includes(key)) throw new Error(`Unknown argument: ${key}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    values[key.slice(2).replaceAll('-', '')] = value;
  }
  return { matrixDir: values.matrixdir || DEFAULT_MATRIX_DIR,
    cohortManifestPath: values.cohortmanifest || DEFAULT_COHORT_MANIFEST,
    outputDir: values.outputdir || DEFAULT_OUTPUT_DIR };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) process.stdout.write('Analyze all 66 verified fixed-history phase receipts.\n'
      + 'node scripts/ant-transfer-phase-analysis.js [--matrix-dir <dir>] '
      + '[--cohort-manifest <file>] [--output-dir <dir>]\n');
    else {
      const { result } = await analyzeTransferPhaseCohort(args);
      process.stdout.write(`phase analysis: ${result.inputReceipts.captureCount} captures; `
        + `${result.output.resultsPath}; ${result.output.reportPath}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}
