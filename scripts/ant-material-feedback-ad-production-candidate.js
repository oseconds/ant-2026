import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { ANT_MAX_TURN_RATE } from '../src/lib/agents/ant/AntAgent.js';
import { materialLayerCountAtSnapshot, materialLocomotionMultiplier,
  materialTurnRateMultiplier, materialFollowingHeadwayMultiplier } from '../src/lib/agents/ant/AntController.js';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';
import { createController, executeScenario, stateFingerprint, DT } from './ant-g-production-candidate-natural.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-30-material-feedback-ad-production-candidate');
const SEED = 20261005;
const SECONDS = 600;
const CLI = new Set(process.argv.slice(2));
const wrappedAgents = new WeakSet();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  verifyRegisteredLaws();
  if (CLI.has('--check')) {
    const observerParity = await verifyObserverParity();
    console.log(JSON.stringify({ laws: 'exact', observerParity }));
    return;
  }
  assert(CLI.has('--run-treatment') || CLI.has('--analyze'), 'Use --check, --run-treatment, or --analyze.');
  const control = await verifyControlArtifacts();
  if (CLI.has('--analyze')) {
    await analyzeMatchedPair(control);
    return;
  }
  const frozenRun = control.controlEvidence.frozenRun;

  const out = resolve(EVIDENCE, 'data/treatment');
  await mkdir(out, { recursive: true });
  assert.deepEqual(await readdir(out), [], 'refusing to overwrite prior treatment artifacts');
  const observations = createObservationLedger();
  const treatment = await executeScenario(SEED, 'G', SECONDS, out, null,
    (controller, run) => {
      observations.rngCallsAtEnd = () => run.rngCalls;
      installCandidateObserver(controller, observations);
    });
  observations.rngCallsAtEnd = observations.rngCallsAtEnd();
  await writeFile(resolve(out, 'seed' + SEED + '-G-summary.json'), JSON.stringify(treatment, null, 2) + '\n');
  assert.equal(treatment.initialStateSha256, frozenRun.initialStateSha256,
    'candidate and production control initial state must match exactly');
  assert.equal(treatment.ticks, frozenRun.ticks);
  assert.equal(treatment.finalRng.calls, observations.rngCallsAtEnd,
    'observer must not perturb candidate RNG');
  assert.equal(observations.accelerationCalls, observations.materialSamples,
    'each active ant tick must have exactly one tick-entry material sample');
  assert.equal(observations.accelerationCalls, observations.sensedCalls,
    'each active ant tick must have exactly one native occupancy read');
  assert.equal(observations.lawAccountingFailures, 0);
  assert.equal(observations.unmatchedSenseCalls, 0);
  await writeFile(resolve(out, 'integration-observations.json'), JSON.stringify(finalizeLedger(observations), null, 2) + '\n');
  console.log(JSON.stringify({ result: 'TREATMENT_COMPLETE', seconds: SECONDS,
    initialStateMatch: true, rngCalls: treatment.finalRng.calls,
    treatmentSummary: resolve(out, 'seed' + SEED + '-G-summary.json'),
    observations: resolve(out, 'integration-observations.json'),
    wallSeconds: treatment.wallSeconds }));
}

async function verifyControlArtifacts() {
  const ref = JSON.parse(await readFile(resolve(EVIDENCE, 'CONTROL-REFERENCE.json'), 'utf8'));
  const frozenRun = ref.controlEvidence.frozenRun;
  assert.equal(ref.productionMain, '15667c73e9f507bf89dea645f966bc7f58301fdc');
  assert.equal(frozenRun.seed, SEED);
  assert.equal(frozenRun.arm, 'G');
  assert.equal(frozenRun.seconds, SECONDS);
  assert.equal(frozenRun.ticks, SECONDS * 60);
  assert.equal(frozenRun.initialStateSha256, 'f480c2fd61e34c4975539e50bdac3c3511aa4b73192473b317d6760e274f02fd');
  assert.match(ref.controlEvidence.status, /10% slowdown on/);
  const controlDir = resolve(EVIDENCE, 'data/control');
  const summaryBytes = await readFile(resolve(controlDir, 'run-summary.json'));
  assert.equal(sha256(summaryBytes), ref.controlEvidence.runSummaryCanonicalLfSha256);
  const summary = JSON.parse(summaryBytes);
  assert.equal(summary.seed, SEED);
  assert.equal(summary.arm, 'G');
  assert.equal(summary.seconds, SECONDS);
  assert.equal(summary.initialStateSha256, frozenRun.initialStateSha256);
  assert.equal(summary.finalRng.calls, frozenRun.rngCallsAt600s);
  assert.equal(summary.events.individualFeet, frozenRun.footContacts);
  const sourceBytes = await readFile(resolve(controlDir, 'SOURCE-HASHES.json'));
  assert.equal(sha256(sourceBytes), ref.receipts.sourceHashManifestCanonicalLfSha256);
  const sourceHashes = JSON.parse(sourceBytes);
  for (const [path, hash] of Object.entries(ref.controlEvidence.sourceHashes)) assert.equal(sourceHashes[path], hash, path);
  const rawBytes = await readFile(resolve(controlDir, 'seed20261005-G-raw.json.gz'));
  assert.equal(sha256(rawBytes), ref.receipts.originalRawSha256);
  for (const [name, hash] of Object.entries(ref.receipts.checkpointSha256)) {
    assert.equal(sha256(await readFile(resolve(controlDir, name))), hash, name);
  }
  return ref;
}

async function analyzeMatchedPair(controlRef) {
  const controlDir = resolve(EVIDENCE, 'data/control');
  const treatmentDir = resolve(EVIDENCE, 'data/treatment');
  const control = JSON.parse(await readFile(resolve(controlDir, 'run-summary.json'), 'utf8'));
  const treatment = JSON.parse(await readFile(resolve(treatmentDir, 'seed' + SEED + '-G-summary.json'), 'utf8'));
  const observations = JSON.parse(await readFile(resolve(treatmentDir, 'integration-observations.json'), 'utf8'));
  assert.equal(control.initialStateSha256, treatment.initialStateSha256);
  assert.equal(treatment.initialStateSha256, controlRef.controlEvidence.frozenRun.initialStateSha256);
  assert.equal(control.ticks, SECONDS * 60);
  assert.equal(treatment.ticks, SECONDS * 60);
  assert.equal(observations.ticks, SECONDS * 60);
  assert.equal(observations.lawAccountingFailures, 0);
  assert.equal(observations.unmatchedSenseCalls, 0);
  assert.equal(observations.accelerationCalls, observations.sensedCalls);
  assert.equal(observations.accelerationCalls, observations.materialSamples);

  const checkpoints = pairCheckpoints(control, treatment);
  const timeline = pairTimeline(control, treatment);
  const endpointMotion = await compareSavedMotion(controlDir, treatmentDir);
  const spatial = await compareCheckpointMaps(controlDir, treatmentDir);
  const signatures = directSignatures(observations);
  const world = pairWorldEndpoints(control, treatment);
  const candidateBehaviorSourcePaths = [
    'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/AntController.js',
    'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
    'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
    'scripts/ant-g-production-candidate-natural.js'
  ];
  const behaviorSourceHashes = Object.fromEntries(await Promise.all(candidateBehaviorSourcePaths.map(async path =>
    [path, sha256(await readFile(resolve(ROOT, path)))])));
  const analysisTools = Object.fromEntries(await Promise.all([
    'scripts/ant-material-feedback-ad-production-candidate.js',
    'tests/ant-material-feedback-ad-production-candidate.test.js'
  ].map(async path => [path, sha256(await readFile(resolve(ROOT, path)))])));
  const result = {
    schemaVersion: 1,
    interpretation: 'One matched seed and one 600 s world pair; serial seconds and ant-ticks are descriptive observations, not independent runs.',
    control: { branchCommit: controlRef.controlEvidence.commit, configuration: 'Production 10% slowdown only; A/D and residence off.',
      seed: control.seed, arm: control.arm, seconds: control.seconds, initialStateSha256: control.initialStateSha256,
      sourceHashes: controlRef.controlEvidence.sourceHashes,
      frozenReceipts: controlRef.receipts },
    treatment: { seed: treatment.seed, arm: treatment.arm, seconds: treatment.seconds,
      initialStateSha256: treatment.initialStateSha256, finalRng: treatment.finalRng,
      behaviorSourceHashes,
      observer: { readOnly: true, lawAccountingFailures: observations.lawAccountingFailures,
        unmatchedSenseCalls: observations.unmatchedSenseCalls, accelerationCalls: observations.accelerationCalls,
        materialSamples: observations.materialSamples, sensedCalls: observations.sensedCalls,
        parity: 'same-state observed/unobserved candidate was exact for 120 ticks; RNG calls equal' } },
    laws: {
      slowdown: 'm(L)=1-0.10*(1-exp(-L/4)); after same-flow cap and hesitation, once on desiredSpeed',
      A: 'qA(L)=1-0.50*(1-exp(-L/4)); effective turn cap=4.5*qA(L) rad/s',
      D: 'hD(L)=1+0.50*(1-exp(-L/4)); native same-flow 0.4 s headway term multiplied by hD(L)',
      commonInput: 'one tick-entry layerCountByCell sample per active ant; no direction or route cue' },
    signatures,
    world,
    checkpoints,
    zeroMovementAndProximity: endpointMotion,
    spatialCheckpointDifferences: spatial,
    sourceRunSummaryHashes: {
      control: sha256(await readFile(resolve(controlDir, 'run-summary.json'))),
      treatment: sha256(await readFile(resolve(treatmentDir, 'seed' + SEED + '-G-summary.json'))),
      controlRaw: sha256(await readFile(resolve(controlDir, 'seed' + SEED + '-G-raw.json.gz'))),
      treatmentRaw: sha256(await readFile(resolve(treatmentDir, 'seed' + SEED + '-G-raw.json.gz')))
    }
  };

  await writeFile(resolve(EVIDENCE, 'SOURCE-HASHES.json'), JSON.stringify({
    productionMain: controlRef.productionMain,
    behavioralProductionPin: controlRef.behavioralProductionPin,
    controlSourceHashes: controlRef.controlEvidence.sourceHashes,
    candidateBehaviorSourceHashes: behaviorSourceHashes,
    analysisToolSourceHashes: analysisTools
  }, null, 2) + '\n');
  await writeFile(resolve(EVIDENCE, 'paired-analysis.json'), JSON.stringify(result, null, 2) + '\n');
  await writeFile(resolve(EVIDENCE, 'paired-checkpoints.csv'), csv(checkpoints));
  await writeFile(resolve(EVIDENCE, 'paired-timeline.csv'), csv(timeline));
  await writeFile(resolve(EVIDENCE, 'direct-signatures.json'), JSON.stringify(signatures, null, 2) + '\n');
  await writeFile(resolve(EVIDENCE, 'spatial-checkpoint-differences.json'), JSON.stringify(spatial, null, 2) + '\n');
  await writeFile(resolve(EVIDENCE, 'saved-motion-diagnostics.json'), JSON.stringify(endpointMotion, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'ANALYSIS_COMPLETE', world, signatures: signatures.overall,
    checkpoints: checkpoints.length, timelineRows: timeline.length }));
}

function pairCheckpoints(control, treatment) {
  assert.deepEqual(control.checkpoints.map(item => item.seconds), treatment.checkpoints.map(item => item.seconds));
  return control.checkpoints.map((c, index) => {
    const t = treatment.checkpoints[index];
    return { seconds: c.seconds,
      controlPopulation: c.activePopulation, treatmentPopulation: t.activePopulation,
      controlTotalSpawned: c.totalSpawned, treatmentTotalSpawned: t.totalSpawned,
      controlTotalRetired: c.totalRetired, treatmentTotalRetired: t.totalRetired,
      controlAdmissionsAfterInitial: c.totalSpawned - 1, treatmentAdmissionsAfterInitial: t.totalSpawned - 1,
      controlRetirements: c.totalRetired, treatmentRetirements: t.totalRetired,
      controlRecruitmentLimit: c.activation.recruitmentLimit, treatmentRecruitmentLimit: t.activation.recruitmentLimit,
      controlActivation: c.activation.activation, treatmentActivation: t.activation.activation,
      controlActiveAntSeconds: c.activeAntSeconds, treatmentActiveAntSeconds: t.activeAntSeconds,
      controlTravel: c.totalRealizedTravel, treatmentTravel: t.totalRealizedTravel,
      controlTravelPerActiveAntSecond: c.travelPerActiveAntSecond,
      treatmentTravelPerActiveAntSecond: t.travelPerActiveAntSecond,
      controlSpeedMean: c.speed.mean, treatmentSpeedMean: t.speed.mean,
      controlBlockedFrames: c.blockedFrames, treatmentBlockedFrames: t.blockedFrames,
      controlNewlyBlockedFrames: c.newlyBlockedFrames, treatmentNewlyBlockedFrames: t.newlyBlockedFrames,
      controlAngularRateAbsMax: Math.max(Math.abs(c.angularVelocity.observedMin), Math.abs(c.angularVelocity.observedMax)),
      treatmentAngularRateAbsMax: Math.max(Math.abs(t.angularVelocity.observedMin), Math.abs(t.angularVelocity.observedMax)),
      controlFootContacts: c.contacts.feet, treatmentFootContacts: t.contacts.feet,
      controlContactGroups: c.contacts.groups, treatmentContactGroups: t.contacts.groups,
      controlFieldNodeSum: c.field.sum, treatmentFieldNodeSum: t.field.sum,
      controlFieldMax: c.field.max, treatmentFieldMax: t.field.max,
      controlSurfaceFieldSum: c.surface.sum, treatmentSurfaceFieldSum: t.surface.sum,
      controlSurfaceContactCount: c.surface.totalFootContacts, treatmentSurfaceContactCount: t.surface.totalFootContacts,
      controlPlateBirths: c.plateCount, treatmentPlateBirths: t.plateCount,
      controlNoduleCount: c.sphereCount, treatmentNoduleCount: t.sphereCount,
      controlExposedCells: c.material.exposedCells, treatmentExposedCells: t.material.exposedCells,
      controlBuriedLayerCells: c.material.buriedLayerCells, treatmentBuriedLayerCells: t.material.buriedLayerCells,
      controlMaxLocalLayerCount: c.material.maxLocalLayerCount, treatmentMaxLocalLayerCount: t.material.maxLocalLayerCount,
      controlRngCalls: c.rngCalls, treatmentRngCalls: t.rngCalls };
  });
}

function pairTimeline(control, treatment) {
  assert.equal(control.timeline.length, SECONDS);
  assert.equal(treatment.timeline.length, SECONDS);
  return control.timeline.map((c, index) => {
    const t = treatment.timeline[index];
    assert.equal(c.seconds, t.seconds);
    return { seconds: c.seconds,
      controlPopulation: c.population, treatmentPopulation: t.population,
      controlSpawned: c.totalSpawned, treatmentSpawned: t.totalSpawned,
      controlRetired: c.totalRetired, treatmentRetired: t.totalRetired,
      controlRecruitedThisSecond: c.recruitedThisSecond, treatmentRecruitedThisSecond: t.recruitedThisSecond,
      controlActiveAntSeconds: c.activeAntSeconds, treatmentActiveAntSeconds: t.activeAntSeconds,
      controlTotalTravel: c.totalRealizedTravel, treatmentTotalTravel: t.totalRealizedTravel,
      controlTravelPerActiveAntSecond: c.travelPerActiveAntSecond,
      treatmentTravelPerActiveAntSecond: t.travelPerActiveAntSecond,
      controlBlockedFrames: c.blockedFrames, treatmentBlockedFrames: t.blockedFrames,
      controlNewlyBlockedFrames: c.newlyBlockedFrames, treatmentNewlyBlockedFrames: t.newlyBlockedFrames,
      controlContactGroups: c.contactGroupsThisSecond, treatmentContactGroups: t.contactGroupsThisSecond,
      controlIndividualFeet: c.individualFeetThisSecond, treatmentIndividualFeet: t.individualFeetThisSecond,
      controlCumulativeFeet: c.cumulativeFootContacts, treatmentCumulativeFeet: t.cumulativeFootContacts,
      controlPlateBirthsThisSecond: c.plateBirthsThisSecond, treatmentPlateBirthsThisSecond: t.plateBirthsThisSecond,
      controlPlateCount: c.plateCount, treatmentPlateCount: t.plateCount,
      controlActivation: c.activation, treatmentActivation: t.activation,
      controlPheromoneNodeSum: c.pheromoneNodeSum, treatmentPheromoneNodeSum: t.pheromoneNodeSum,
      controlPheromoneMax: c.pheromoneMaxNode, treatmentPheromoneMax: t.pheromoneMaxNode };
  });
}

function pairWorldEndpoints(control, treatment) {
  const c = control.checkpoints.at(-1), t = treatment.checkpoints.at(-1);
  const cMove = control.movement, tMove = treatment.movement;
  const cEvents = control.events, tEvents = treatment.events;
  const pct = (a, b) => a === 0 ? null : 100 * (b / a - 1);
  return {
    seconds: SECONDS, seed: SEED,
    movement: { controlTravel: cMove.totalDistance, treatmentTravel: tMove.totalDistance,
      travelPercentChange: pct(cMove.totalDistance, tMove.totalDistance),
      controlActiveAntSeconds: cMove.activeAntSeconds, treatmentActiveAntSeconds: tMove.activeAntSeconds,
      activeAntSecondsPercentChange: pct(cMove.activeAntSeconds, tMove.activeAntSeconds),
      controlMeanRealizedSpeed: cMove.travelPerActiveAntSecond, treatmentMeanRealizedSpeed: tMove.travelPerActiveAntSecond,
      controlSpeedMean: cMove.speed.mean, treatmentSpeedMean: tMove.speed.mean,
      speedDistribution: { control: cMove.speed, treatment: tMove.speed },
      angularVelocityDistribution: { control: cMove.angularVelocity, treatment: tMove.angularVelocity },
      controlAngularRateAbsMax: cMove.maximumTurnRate, treatmentAngularRateAbsMax: tMove.maximumTurnRate,
      controlBlockedFrames: cMove.blockedFrames, treatmentBlockedFrames: tMove.blockedFrames,
      blockedFramesPercentChange: pct(cMove.blockedFrames, tMove.blockedFrames),
      controlNewlyBlockedFrames: cMove.newlyBlockedFrames, treatmentNewlyBlockedFrames: tMove.newlyBlockedFrames,
      controlZeroTickViolations: cMove.finiteViolations, treatmentZeroTickViolations: tMove.finiteViolations },
    population: { controlAdmissions: cMove.recruited, treatmentAdmissions: tMove.recruited,
      admissionsPercentChange: pct(cMove.recruited, tMove.recruited),
      controlRetirements: cMove.retired, treatmentRetirements: tMove.retired,
      controlFinalPopulation: c.activePopulation, treatmentFinalPopulation: t.activePopulation,
      controlRecruitmentLimit: c.activation.recruitmentLimit, treatmentRecruitmentLimit: t.activation.recruitmentLimit,
      controlFinalActivation: c.activation.activation, treatmentFinalActivation: t.activation.activation,
      controlPopulationCeilingViolations: cMove.populationCeilingViolations,
      treatmentPopulationCeilingViolations: tMove.populationCeilingViolations },
    contacts: { controlGroups: cEvents.contactGroups, treatmentGroups: tEvents.contactGroups,
      controlIndividualFeet: cEvents.individualFeet, treatmentIndividualFeet: tEvents.individualFeet,
      feetPercentChange: pct(cEvents.individualFeet, tEvents.individualFeet),
      controlStreamSha256: cEvents.contactStreamSha256, treatmentStreamSha256: tEvents.contactStreamSha256 },
    material: { controlPlateBirths: cEvents.plateBirths, treatmentPlateBirths: tEvents.plateBirths,
      controlFirstPlateSeconds: cEvents.firstPlateSeconds, treatmentFirstPlateSeconds: tEvents.firstPlateSeconds,
      controlNoduleBirths: cEvents.sphereBirths, treatmentNoduleBirths: tEvents.sphereBirths,
      control600sNoduleCount: c.sphereCount, treatment600sNoduleCount: t.sphereCount,
      controlExposedCells: c.material.exposedCells, treatmentExposedCells: t.material.exposedCells,
      controlBuriedLayerCells: c.material.buriedLayerCells, treatmentBuriedLayerCells: t.material.buriedLayerCells,
      controlMaxLocalLayerCount: c.material.maxLocalLayerCount, treatmentMaxLocalLayerCount: t.material.maxLocalLayerCount },
    chemistryAndMechanical: { controlPheromoneNodeSum: c.field.sum, treatmentPheromoneNodeSum: t.field.sum,
      pheromoneNodeSumPercentChange: pct(c.field.sum, t.field.sum),
      controlSurfaceFieldSum: c.surface.sum, treatmentSurfaceFieldSum: t.surface.sum,
      surfaceFieldSumPercentChange: pct(c.surface.sum, t.surface.sum),
      controlFootContactReceipt: c.surface.totalFootContacts, treatmentFootContactReceipt: t.surface.totalFootContacts },
    rng: { controlFinal: control.finalRng, treatmentFinal: treatment.finalRng,
      sameInitialState: control.initialStateSha256 === treatment.initialStateSha256,
      note: 'Later RNG-call totals differ after the trajectories diverge; A/D and the observer draw no random values.' },
    invariants: { treatment: treatment.invariants, finiteViolations: tMove.finiteViolations,
      speedCapViolations: tMove.speedCapViolations, turnCapViolations: tMove.turnCapViolations,
      overlapViolations: tMove.overlapViolations, populationCeilingViolations: tMove.populationCeilingViolations,
      fieldNonfiniteSeconds: treatment.invariants.fieldNonfiniteSeconds,
      surfaceNonfiniteSeconds: treatment.invariants.surfaceNonfiniteSeconds }
  };
}

function directSignatures(observations) {
  const layers = Object.entries(observations.byLayer).map(([layer, row]) => ({ layer: Number(layer), row }))
    .sort((a, b) => a.layer - b.layer);
  const material = layers.filter(item => item.layer > 0);
  const sum = fn => material.reduce((total, item) => total + fn(item.row), 0);
  const weightedMean = (fn, countFn) => {
    const count = sum(countFn);
    return count ? material.reduce((total, item) => total + fn(item.row) * countFn(item.row), 0) / count : null;
  };
  const exposedTicks = sum(row => row.antTicks);
  const turnCalls = sum(row => row.A.turnCalls);
  const nativeFlow = sum(row => row.D.nativeSameFlowOpportunities);
  const targetCalls = sum(row => row.D.finalTargetOpportunityCalls);
  const changedTargets = sum(row => row.D.changedFinalTargetCalls);
  const antTicksByLayerCount = Object.fromEntries(layers.map(({ layer, row }) => [layer, row.antTicks]));
  const layerQuantile = p => {
    const target = Math.ceil(observations.accelerationCalls * p);
    let cumulative = 0;
    for (const [layer, count] of Object.entries(antTicksByLayerCount)) {
      cumulative += count;
      if (cumulative >= target) return Number(layer);
    }
    return null;
  };
  return { overall: { activeAntTicks: observations.accelerationCalls,
      materialExposedAntTicks: exposedTicks, materialExposedAntSeconds: exposedTicks / 60,
      materialExposureFraction: exposedTicks / observations.accelerationCalls,
      layerCountByAntTick: { min: Number(Object.keys(antTicksByLayerCount)[0]),
        p50: layerQuantile(0.5), p90: layerQuantile(0.9), p99: layerQuantile(0.99),
        max: Number(Object.keys(antTicksByLayerCount).at(-1)) },
      mean10PercentSlowdownMultiplierOnExposedTicks: weightedMean(row => row.locomotionMultiplier.mean,
        row => row.locomotionMultiplier.count),
      meanDesiredSpeedBeforeProductionSlowdown: weightedMean(row => row.preSlowTarget.mean,
        row => row.preSlowTarget.count),
      meanIntegratedFinalDesiredSpeed: weightedMean(row => row.finalTarget.mean,
        row => row.finalTarget.count),
      meanDesiredSpeedReductionFromProductionLaw: weightedMean(row => row.slowdownTargetReduction.mean,
        row => row.slowdownTargetReduction.count),
      A: { materialTurnCalls: turnCalls,
        nativeTurnCapBindings: sum(row => row.A.nativeTurnCapBinding),
        conditionedTurnCapBindings: sum(row => row.A.conditionedTurnCapBinding),
        changedTurnCalls: sum(row => row.A.changedTurnCalls),
        changedTurnCallFraction: turnCalls ? sum(row => row.A.changedTurnCalls) / turnCalls : null,
        meanAngularSuppressionRateRadiansPerSecond: weightedMean(row => row.A.angularSuppressionRate.mean,
          row => row.A.angularSuppressionRate.count) },
      D: { allNativeSameFlowOpportunities: layers.reduce((n, item) => n + item.row.D.nativeSameFlowOpportunities, 0),
        materialExposedSameFlowOpportunities: nativeFlow,
        nativeAndConditionedOpportunityCountsEqual: layers.reduce((ok, item) => ok
          && item.row.D.nativeSameFlowOpportunities === item.row.D.conditionedSameFlowOpportunities, true),
        finalTargetOpportunityCalls: targetCalls, changedFinalTargetCalls: changedTargets,
        changedFinalTargetFraction: targetCalls ? changedTargets / targetCalls : null,
        meanFinalTargetDeltaCandidateMinusNativeAfterProductionSlowdown: weightedMean(
          row => row.D.finalTargetDeltaCandidateMinusNative.mean,
          row => row.D.finalTargetDeltaCandidateMinusNative.count) } },
    antTicksByLayerCount: Object.fromEntries(layers.map(({ layer, row }) => [layer, row.antTicks])),
    byLayer: Object.fromEntries(layers.map(({ layer, row }) => [layer, {
      antTicks: row.antTicks, slowdownMultiplier: row.locomotionMultiplier,
      desiredSpeedReduction: row.slowdownTargetReduction,
      A: row.A, D: row.D, meanNeighborCount: row.neighbors.mean, meanFrontCrowding: row.frontCrowding.mean
    }])),
    byWindow: observations.byWindow,
    interpretation: 'A and D activation contexts may overlap; this is a same-state direct-consumer ledger, not evidence of phase-space separation or independent feedback weights.' };
}

async function compareSavedMotion(controlDir, treatmentDir) {
  const control = JSON.parse(gunzipSync(await readFile(resolve(controlDir, 'seed' + SEED + '-G-raw.json.gz'))));
  const treatment = JSON.parse(gunzipSync(await readFile(resolve(treatmentDir, 'seed' + SEED + '-G-raw.json.gz'))));
  const c = savedMotionSummary(control.positions), t = savedMotionSummary(treatment.positions);
  return { sampling: 'saved one-second post-tick positions; exact zero means equal x and y between adjacent saved anchors',
    control: c, treatment: t,
    treatmentTickLevel: { zeroMovementTicks: JSON.parse(await readFile(resolve(treatmentDir, 'integration-observations.json'), 'utf8')).zeroMovementTicks,
      movementTicks: JSON.parse(await readFile(resolve(treatmentDir, 'integration-observations.json'), 'utf8')).movementTicks,
      longestZeroMovementTicks: JSON.parse(await readFile(resolve(treatmentDir, 'integration-observations.json'), 'utf8')).longestZeroMovementTicks },
    endpointZeroDelta: t.exactZeroIntervals - c.exactZeroIntervals,
    meanNearestCenterDistanceDelta: t.nearestAntCenterDistance.mean - c.nearestAntCenterDistance.mean };
}

function savedMotionSummary(positions) {
  const zeroById = new Map(), nearest = [];
  let intervals = 0, exactZeros = 0, longestZeroSeconds = 0;
  for (let index = 1; index < positions.length; index += 1) {
    const previous = new Map(positions[index - 1].agents.map(agent => [agent.id, agent]));
    for (const agent of positions[index].agents) {
      const old = previous.get(agent.id);
      if (old) {
        intervals += 1;
        if (agent.x === old.x && agent.y === old.y) {
          exactZeros += 1;
          const streak = (zeroById.get(agent.id) || 0) + 1;
          zeroById.set(agent.id, streak);
          longestZeroSeconds = Math.max(longestZeroSeconds, streak);
        } else zeroById.set(agent.id, 0);
      } else zeroById.set(agent.id, 0);
    }
  }
  for (const frame of positions) for (const agent of frame.agents) {
    let closest = Infinity;
    for (const other of frame.agents) if (other !== agent) closest = Math.min(closest,
      Math.hypot(agent.x - other.x, agent.y - other.y));
    if (Number.isFinite(closest)) nearest.push(closest);
  }
  return { savedPositionCount: positions.length, matchedOneSecondIntervals: intervals,
    exactZeroIntervals: exactZeros, exactZeroFraction: intervals ? exactZeros / intervals : null, longestConsecutiveZeroSeconds: longestZeroSeconds,
    nearestAntCenterDistance: distribution(nearest) };
}

async function compareCheckpointMaps(controlDir, treatmentDir) {
  const outputs = [];
  const controlRaw = JSON.parse(gunzipSync(await readFile(resolve(controlDir, 'seed' + SEED + '-G-raw.json.gz'))));
  const treatmentRaw = JSON.parse(gunzipSync(await readFile(resolve(treatmentDir, 'seed' + SEED + '-G-raw.json.gz'))));
  for (const seconds of [30, 60, 120, 300, 600]) {
    const [c, t] = await Promise.all([
      readGzip(resolve(controlDir, `seed${SEED}-G-${seconds}s.json.gz`)),
      readGzip(resolve(treatmentDir, `seed${SEED}-G-${seconds}s.json.gz`))
    ]);
    const controlSupport = sampleSupportField(c.surface);
    const treatmentSupport = sampleSupportField(t.surface);
    const controlPoseSamples = sampleSupportAtAgents(c.surface, controlRaw.positions[seconds - 1].agents);
    const treatmentPoseSamples = sampleSupportAtAgents(t.surface, treatmentRaw.positions[seconds - 1].agents);
    outputs.push({ seconds,
      pheromone: compareArrays(c.pheromone.values, t.pheromone.values),
      SurfaceField: compareArrays(c.surface.values, t.surface.values),
      SurfaceFieldC: { control: distribution(c.surface.values), treatment: distribution(t.surface.values),
        mapDifference: compareArrays(c.surface.values, t.surface.values) },
      sampledSupportD: { meaning: 'Production SurfaceField.sampleSupport at the authored default radius 0.025, read-only.',
        gridCenters: { control: distribution(controlSupport), treatment: distribution(treatmentSupport),
          mapDifference: compareArrays(controlSupport, treatmentSupport) },
        savedAntPoses: { control: distribution(controlPoseSamples), treatment: distribution(treatmentPoseSamples) } },
      cumulativeOccupancy: compareArrays(c.occupancy.cumulativeAntSeconds, t.occupancy.cumulativeAntSeconds),
      recent30sOccupancy: compareArrays(c.occupancy.recent30sAntSeconds, t.occupancy.recent30sAntSeconds),
      persistent30sMaskDifferentCells: differenceCount(c.persistent30sChemicalMask, t.persistent30sChemicalMask) });
  }
  return outputs;
}

function sampleSupportField(surface) {
  const field = new SurfaceField({ width: surface.width, height: surface.height });
  field.values.set(surface.values);
  const values = new Float32Array(surface.width * surface.height);
  for (let iy = 0; iy < surface.height; iy += 1) for (let ix = 0; ix < surface.width; ix += 1) {
    const index = iy * surface.width + ix;
    values[index] = field.sampleSupport(ix / (surface.width - 1), iy / (surface.height - 1));
  }
  return values;
}

function sampleSupportAtAgents(surface, agents) {
  const field = new SurfaceField({ width: surface.width, height: surface.height });
  field.values.set(surface.values);
  return agents.map(agent => field.sampleSupport(agent.x, agent.y));
}

function compareArrays(a, b) {
  assert.equal(a.length, b.length);
  let sumA = 0, sumB = 0, absolute = 0, changed = 0;
  for (let index = 0; index < a.length; index += 1) {
    const x = a[index], y = b[index];
    sumA += Math.abs(x); sumB += Math.abs(y); absolute += Math.abs(x - y);
    if (x !== y) changed += 1;
  }
  return { values: a.length, controlAbsoluteSum: sumA, treatmentAbsoluteSum: sumB,
    absoluteL1Difference: absolute, l1RelativeToControl: sumA ? absolute / sumA : null,
    totalRelativeChange: sumA ? (sumB / sumA - 1) : null, changedCells: changed };
}

function differenceCount(a, b) {
  if (a === null || b === null) return null;
  assert.equal(a.length, b.length);
  let count = 0;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) count += 1;
  return count;
}

async function readGzip(path) { return JSON.parse(gunzipSync(await readFile(path))); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function csv(rows) {
  assert(rows.length > 0);
  const fields = Object.keys(rows[0]);
  return [fields.join(','), ...rows.map(row => fields.map(key => row[key] === null || row[key] === undefined
    ? '' : typeof row[key] === 'string' ? '"' + row[key].replaceAll('"', '""') + '"' : String(row[key])).join(','))].join('\n') + '\n';
}

function verifyRegisteredLaws() {
  assert.equal(materialLocomotionMultiplier(0), 1);
  assert.equal(materialTurnRateMultiplier(0), 1);
  assert.equal(materialFollowingHeadwayMultiplier(0), 1);
  assert.equal(materialLocomotionMultiplier(1), 1 - 0.10 * (1 - Math.exp(-1 / 4)));
  assert.equal(materialTurnRateMultiplier(1), 1 - 0.50 * (1 - Math.exp(-1 / 4)));
  assert.equal(materialFollowingHeadwayMultiplier(1), 1 + 0.50 * (1 - Math.exp(-1 / 4)));
  assert.ok(materialLocomotionMultiplier(1000) >= 0.9);
  assert.ok(materialTurnRateMultiplier(1000) >= 0.5);
  assert.ok(materialFollowingHeadwayMultiplier(1000) <= 1.5);
}

async function verifyObserverParity() {
  const observed = createController(SEED, 'G');
  const plain = createController(SEED, 'G', { observe: false });
  const ledger = createObservationLedger();
  try {
    await observed.controller.init();
    await plain.controller.init();
    assert.equal(stateFingerprint(observed), stateFingerprint(plain));
    installCandidateObserver(observed.controller, ledger);
    for (let tick = 0; tick < 120; tick += 1) {
      observed.controller.tick(DT);
      plain.controller.tick(DT);
      assert.equal(stateFingerprint(observed), stateFingerprint(plain), 'observer parity tick ' + (tick + 1));
    }
    assert.equal(observed.rngCalls, plain.rngCalls);
    assert.equal(ledger.lawAccountingFailures, 0);
    return { ticks: 120, exactStateEveryTick: true, rngCalls: observed.rngCalls,
      measuredTurnCalls: ledger.turnCalls, measuredAccelerationCalls: ledger.accelerationCalls };
  } finally {
    await observed.controller.destroy();
    await plain.controller.destroy();
  }
}

function createObservationLedger() {
  return { ticks: 0, accelerationCalls: 0, materialSamples: 0, sensedCalls: 0, turnCalls: 0,
    unmatchedSenseCalls: 0, lawAccountingFailures: 0, rngCallsAtEnd: null,
    longestZeroMovementTicks: 0, zeroMovementTicks: 0, movementTicks: 0,
    byWindow: {}, byLayer: {} };
}

function installCandidateObserver(controller, ledger) {
  assert.equal(controller.materialLocomotionResistance, true, 'production 10% law remains enabled');
  const context = { active: false, layers: new WeakMap(), senses: new WeakMap(), window: null, dt: DT };
  const group = (window, layer) => {
    const table = window === 'all' ? ledger.byLayer : (ledger.byWindow[window] ||= {});
    return table[layer] ||= freshLayer();
  };
  const recordRows = layer => [group('all', layer), group(context.window, layer)];
  const originalSense = controller.occupancy.sense.bind(controller.occupancy);
  controller.occupancy.sense = (agent, agents, headwayMultiplier = 1) => {
    const conditioned = originalSense(agent, agents, headwayMultiplier);
    if (!context.active) return conditioned;
    const layer = context.layers.get(agent) ?? 0;
    const native = headwayMultiplier === 1 ? conditioned : originalSense(agent, agents, 1);
    const expectedHeadway = materialFollowingHeadwayMultiplier(layer);
    if (Math.abs(headwayMultiplier - expectedHeadway) > 1e-12) ledger.lawAccountingFailures += 1;
    for (const key of ['separationX', 'separationY', 'frontCrowding', 'leftCrowding', 'rightCrowding', 'neighbors']) {
      if (conditioned[key] !== native[key]) ledger.lawAccountingFailures += 1;
    }
    if (Number.isFinite(conditioned.followingSpeedLimit) !== Number.isFinite(native.followingSpeedLimit)) {
      ledger.lawAccountingFailures += 1;
    }
    context.senses.set(agent, { native, conditioned, layer });
    ledger.sensedCalls += 1;
    for (const row of recordRows(layer)) {
      row.sensedCalls += 1;
      row.neighbors.push(conditioned.neighbors);
      row.frontCrowding.push(conditioned.frontCrowding);
      if (Number.isFinite(native.followingSpeedLimit)) row.nativeSameFlowOpportunities += 1;
      if (Number.isFinite(conditioned.followingSpeedLimit)) row.conditionedSameFlowOpportunities += 1;
      if (Number.isFinite(native.followingSpeedLimit) && Number.isFinite(conditioned.followingSpeedLimit)) {
        row.nativeFollowingLimits.push(native.followingSpeedLimit);
        row.conditionedFollowingLimits.push(conditioned.followingSpeedLimit);
      }
    }
    return conditioned;
  };

  const originalTick = controller.tick.bind(controller);
  controller.tick = dt => {
    const agents = [...controller.agents];
    const positions = new Map(agents.map(agent => [agent, [agent.x, agent.y]]));
    const snapshot = controller.materialStratigraphy.getSnapshot();
    const seconds = controller.simulationTimeMs / 1000;
    context.window = seconds < 120 ? '0-120' : seconds < 300 ? '120-300' : '300-600';
    context.dt = dt;
    context.layers = new WeakMap();
    context.senses = new WeakMap();
    for (const agent of agents) {
      context.layers.set(agent, materialLayerCountAtSnapshot(snapshot, agent.x, agent.y));
      ledger.materialSamples += 1;
      wrapAgent(agent);
    }
    context.active = true;
    try {
      return originalTick(dt);
    } finally {
      context.active = false;
      ledger.ticks += 1;
      for (const agent of agents) {
        if (!controller.agents.includes(agent)) continue;
        const [x, y] = positions.get(agent);
        ledger.movementTicks += 1;
        if (Math.hypot(agent.x - x, agent.y - y) <= 1e-14) {
          ledger.zeroMovementTicks += 1;
          agentZeroStreak.set(agent, (agentZeroStreak.get(agent) || 0) + 1);
          ledger.longestZeroMovementTicks = Math.max(ledger.longestZeroMovementTicks, agentZeroStreak.get(agent));
        } else agentZeroStreak.set(agent, 0);
      }
    }
  };

  const agentZeroStreak = new WeakMap();
  function wrapAgent(agent) {
    if (wrappedAgents.has(agent)) return;
    wrappedAgents.add(agent);
    const turn = agent.turnToward.bind(agent);
    agent.turnToward = (targetHeading, dt, suppliedRate) => {
      if (!context.active) return turn(targetHeading, dt, suppliedRate);
      const layer = context.layers.get(agent) ?? 0;
      const requestedRate = ANT_MAX_TURN_RATE * materialTurnRateMultiplier(layer);
      const before = agent.heading;
      const error = angleDelta(before, targetHeading);
      const nativeDelta = clamp(error, -ANT_MAX_TURN_RATE * dt, ANT_MAX_TURN_RATE * dt);
      const expectedDelta = clamp(error, -requestedRate * dt, requestedRate * dt);
      if (Math.abs(suppliedRate - requestedRate) > 1e-12) ledger.lawAccountingFailures += 1;
      turn(targetHeading, dt, suppliedRate);
      const actualDelta = angleDelta(before, agent.heading);
      if (Math.abs(actualDelta - expectedDelta) > 1e-10) ledger.lawAccountingFailures += 1;
      ledger.turnCalls += 1;
      for (const row of recordRows(layer)) {
        row.turnCalls += 1;
        row.nativeTurnRate.push(nativeDelta / dt);
        row.conditionedTurnRate.push(actualDelta / dt);
        row.turnSuppression.push((Math.abs(nativeDelta) - Math.abs(actualDelta)) / dt);
        if (Math.abs(error) > ANT_MAX_TURN_RATE * dt + 1e-12) row.nativeTurnCapBinding += 1;
        if (Math.abs(error) > requestedRate * dt + 1e-12) row.conditionedTurnCapBinding += 1;
        if (Math.abs(nativeDelta - actualDelta) > 1e-12) row.changedTurnCalls += 1;
      }
    };

    const accelerate = agent.accelerateToward.bind(agent);
    agent.accelerateToward = (finalTarget, dt) => {
      if (!context.active) return accelerate(finalTarget, dt);
      const sample = context.senses.get(agent);
      if (!sample) {
        ledger.unmatchedSenseCalls += 1;
        return accelerate(finalTarget, dt);
      }
      const { layer, native, conditioned } = sample;
      const preFollow = agent.personality.preferredSpeed
        * (0.58 + 0.34 * (Math.sin(agent.speedPhase) + 1) * 0.5)
        * (1 - conditioned.frontCrowding) ** 2
        * (1 - Math.min(0.45, Math.hypot(conditioned.separationX, conditioned.separationY) * 0.1));
      let nativePreSlow = Math.min(preFollow, native.followingSpeedLimit);
      let candidatePreSlow = Math.min(preFollow, conditioned.followingSpeedLimit);
      if (agent.hesitationRemaining > 0) {
        nativePreSlow *= 0.05;
        candidatePreSlow *= 0.05;
      }
      const multiplier = materialLocomotionMultiplier(layer);
      const expectedCandidate = candidatePreSlow * multiplier;
      const expectedNative = nativePreSlow * multiplier;
      if (Math.abs(finalTarget - expectedCandidate) > 1e-10) ledger.lawAccountingFailures += 1;
      if (agent.targetSpeed !== finalTarget) ledger.lawAccountingFailures += 1;
      const changed = Math.abs(expectedCandidate - expectedNative) > 1e-12;
      for (const row of recordRows(layer)) {
        row.antTicks += 1;
        row.locomotionMultiplier.push(multiplier);
        row.preSlowTarget.push(candidatePreSlow);
        row.finalTarget.push(finalTarget);
        row.slowdownTargetReduction.push(candidatePreSlow - finalTarget);
        if (layer > 0) row.materialExposedTicks += 1;
        if (Number.isFinite(native.followingSpeedLimit)) {
          row.sameFlowTargetCalls += 1;
          row.sameFlowTargetReduction.push(expectedCandidate - expectedNative);
          if (changed) row.sameFlowTargetChanged += 1;
        }
      }
      ledger.accelerationCalls += 1;
      accelerate(finalTarget, dt);
    };
  }

}

function freshLayer() {
  return { sensedCalls: 0, antTicks: 0, materialExposedTicks: 0,
    nativeSameFlowOpportunities: 0, conditionedSameFlowOpportunities: 0,
    turnCalls: 0, nativeTurnCapBinding: 0, conditionedTurnCapBinding: 0, changedTurnCalls: 0,
    sameFlowTargetCalls: 0, sameFlowTargetChanged: 0,
    neighbors: [], frontCrowding: [], locomotionMultiplier: [], preSlowTarget: [], finalTarget: [], slowdownTargetReduction: [],
    nativeTurnRate: [], conditionedTurnRate: [], turnSuppression: [],
    nativeFollowingLimits: [], conditionedFollowingLimits: [], sameFlowTargetReduction: [] };
}

function finalizeLedger(ledger) {
  return { schemaVersion: 1, readOnly: true, ticks: ledger.ticks,
    observerStateParity: 'validated separately for 120 ticks; no RNG calls by observer',
    lawAccountingFailures: ledger.lawAccountingFailures, unmatchedSenseCalls: ledger.unmatchedSenseCalls,
    accelerationCalls: ledger.accelerationCalls, materialSamples: ledger.materialSamples,
    sensedCalls: ledger.sensedCalls,
    zeroMovementTicks: ledger.zeroMovementTicks, movementTicks: ledger.movementTicks,
    zeroMovementTickFraction: ledger.movementTicks ? ledger.zeroMovementTicks / ledger.movementTicks : null,
    longestZeroMovementTicks: ledger.longestZeroMovementTicks,
    byLayer: summarizeTable(ledger.byLayer),
    byWindow: Object.fromEntries(Object.entries(ledger.byWindow).map(([window, table]) => [window, summarizeTable(table)])) };
}

function summarizeTable(table) {
  return Object.fromEntries(Object.entries(table).sort((a, b) => Number(a[0]) - Number(b[0])).map(([layer, row]) => [layer, {
    sensedCalls: row.sensedCalls, antTicks: row.antTicks, materialExposedTicks: row.materialExposedTicks,
    neighbors: distribution(row.neighbors), frontCrowding: distribution(row.frontCrowding),
    locomotionMultiplier: distribution(row.locomotionMultiplier),
    preSlowTarget: distribution(row.preSlowTarget), finalTarget: distribution(row.finalTarget),
    slowdownTargetReduction: distribution(row.slowdownTargetReduction),
    A: { turnCalls: row.turnCalls, nativeTurnCapBinding: row.nativeTurnCapBinding,
      conditionedTurnCapBinding: row.conditionedTurnCapBinding, changedTurnCalls: row.changedTurnCalls,
      nativeTurnRate: distribution(row.nativeTurnRate), conditionedTurnRate: distribution(row.conditionedTurnRate),
      angularSuppressionRate: distribution(row.turnSuppression) },
    D: { nativeSameFlowOpportunities: row.nativeSameFlowOpportunities,
      conditionedSameFlowOpportunities: row.conditionedSameFlowOpportunities,
      nativeFollowingLimit: distribution(row.nativeFollowingLimits),
      conditionedFollowingLimit: distribution(row.conditionedFollowingLimits),
      finalTargetOpportunityCalls: row.sameFlowTargetCalls,
      changedFinalTargetCalls: row.sameFlowTargetChanged,
      finalTargetDeltaCandidateMinusNative: distribution(row.sameFlowTargetReduction) }
  }]));
}

function distribution(values) {
  if (!values.length) return { count: 0, min: null, p10: null, p50: null, p90: null, p99: null, max: null, mean: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = p => sorted[Math.floor((sorted.length - 1) * p)];
  return { count: sorted.length, min: sorted[0], p10: at(0.1), p50: at(0.5), p90: at(0.9), p99: at(0.99),
    max: sorted.at(-1), mean: values.reduce((sum, value) => sum + value, 0) / values.length };
}

function angleDelta(from, to) { return ((to - from + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
