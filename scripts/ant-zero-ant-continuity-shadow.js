import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { serialize } from 'node:v8';
import { AntController, materialLayerCountAtSnapshot, materialLocomotionMultiplier } from '../src/lib/agents/ant/AntController.js';
import { gasterRearPoint } from '../src/lib/agents/ant/BodyPoseController.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASELINE = '214c59cbc31684aa5c1f3fd70dd1d21533c48ab2';
const NATURAL_BASELINE = '37131e0c408a9692ecc364ef7298a71c5e7182ad';
const SEEDS = [20261005, 20261006, 20261007];
const DT = 1 / 60;
const TICKS_PER_SECOND = 60;
const GAP_START_TICK = 400 * TICKS_PER_SECOND;
const GAP_END_TICK = 460 * TICKS_PER_SECOND;
const END_TICK = 600 * TICKS_PER_SECOND;
const GAP_START_MS = 400000;
const GAP_END_MS = 460000;
const EXPECTED_NATURAL = [[755, 734, 104222, 29], [689, 668, 102250, 33], [736, 717, 101772, 38]];
const PRODUCTION_PATHS = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js',
  'package.json', 'package-lock.json'
];
const CLI = new Map(process.argv.slice(2).map(arg => {
  const split = arg.indexOf('=');
  return split < 0 ? [arg, true] : [arg.slice(0, split), arg.slice(split + 1)];
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export function countPreGapLayers(column, gapStartMs = GAP_START_MS) {
  assert.ok(Array.isArray(column) && Number.isFinite(gapStartMs));
  return column.filter(layer => Number.isFinite(layer?.descriptor?.bornAtSimulationTimeMs)
    && layer.descriptor.bornAtSimulationTimeMs < gapStartMs).length;
}

export function beginZeroAntIntervention(controller) {
  assert.ok(controller && Array.isArray(controller.agents));
  const removedAgents = controller.agents.slice();
  let flushedDeposits = 0, flushedDose = 0, pendingDoseBeforeRemoval = 0;
  for (const [id, accumulator] of controller.gasterDeposition.ants) {
    void id;
    pendingDoseBeforeRemoval += Number.isFinite(accumulator.amount) ? accumulator.amount : 0;
  }
  for (const agent of removedAgents) {
    const rear = controller.bodyPoseController.getSnapshot(agent)?.gasterRear || gasterRearPoint(agent);
    const deposits = controller.gasterDeposition.retire(agent.id, rear);
    flushedDeposits += deposits.length;
    flushedDose += deposits.reduce((sum, deposit) => sum + (deposit.type === 'point'
      ? deposit.amount : deposit.amountPerUnitDistance * Math.hypot(deposit.to.x - deposit.from.x,
        deposit.to.y - deposit.from.y)), 0);
    controller.applyDeposits(deposits);
  }
  controller.agents = [];
  controller.totalRetired += removedAgents.length;
  controller.gaitController.retain([]);
  controller.bodyPoseController.retain([]);
  controller.gasterDeposition.retain([]);
  controller.nextSpawnTimeMs = Infinity;
  return { removedIds: removedAgents.map(agent => agent.id), removedObjects: removedAgents,
    pendingDoseBeforeRemoval, flushedDeposits, flushedDose, totalRetiredAfterIntervention: controller.totalRetired };
}

export function resumeRecruitmentAtGapEnd(controller) {
  assert.ok(controller && controller.agents.length === 0 && Number.isFinite(controller.simulationTimeMs));
  controller.nextSpawnTimeMs = controller.simulationTimeMs;
  return controller.nextSpawnTimeMs;
}

async function main() {
  assertNaturalBaselineAndProductionSources();
  const outputArg = CLI.get('--output');
  assert.ok(typeof outputArg === 'string' && outputArg.length > 0, 'pass --output=<fresh directory>');
  const output = resolve(ROOT, outputArg);
  await mkdir(output, { recursive: true });
  assert.deepEqual(await readdir(output), [], 'output directory must be empty');
  const naturalReplayPath = resolve(ROOT, CLI.get('--natural-replay')
    || 'docs/ant/evidence/2026-10-12-zero-ant-continuity/data/unobserved-natural-replay-current.json');
  const naturalReplay = JSON.parse(await readFile(naturalReplayPath, 'utf8'));
  const baselineNatural = JSON.parse(await readFile(resolve(ROOT,
    'docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.json'), 'utf8'));
  assert.deepEqual(naturalReplay.results, baselineNatural.results,
    'unobserved 600 s natural replay must exactly match the committed baseline');

  const started = performance.now();
  const results = [];
  for (let index = 0; index < SEEDS.length; index += 1) {
    results.push(await runSeed(SEEDS[index], EXPECTED_NATURAL[index], baselineNatural.results[index]));
    await writeJson(output, 'seed-' + SEEDS[index] + '-summary.json', results.at(-1).summary);
    await writeJson(output, 'seed-' + SEEDS[index] + '-post-gap-ants.json', results.at(-1).ants);
    await writeJson(output, 'seed-' + SEEDS[index] + '-post-gap-episodes.json', results.at(-1).episodes);
    console.log(JSON.stringify({ seed: SEEDS[index], decisionMeasurements: results.at(-1).summary.postGap,
      wallSeconds: (performance.now() - started) / 1000 }));
  }

  const aggregate = aggregateResults(results);
  await writeJson(output, 'aggregate-summary.json', aggregate);
  await writeJson(output, 'natural-prefix-observer-state-chains.json', results.map(result => result.naturalPrefixChain));
  await writeJson(output, 'natural-control-final.json', results.map(result => result.naturalControl));
  await writeJson(output, 'zero-ant-gap-world-state.json', results.map(result => result.worldTransition));
  await writeCsv(output, 'world-gap-by-second.csv', ['seed', 'simulationTimeSeconds', 'pheromoneMass',
    'pheromoneNonzeroCells', 'pheromoneSha256', 'surfaceMass', 'surfaceNonzeroCells', 'surfaceFootContacts',
    'surfaceSha256', 'trailPlateCount', 'trailBirthLastAnalysisTimeMs', 'trailBirthLastBirthTimeMs',
    'trailChemicalMemorySha256', 'materialPlateCount', 'noduleCount', 'materialRevision', 'noduleRevision',
    'materialClockMs', 'lastAdvanceTimeMs', 'lastNoduleEvaluationTimeMs', 'activationEvidence',
    'activation', 'recruitmentLimit', 'publicWorldSha256'], results.flatMap(result => result.gapTimeline));
  await writeCsv(output, 'post-gap-population-by-second.csv', ['seed', 'simulationSecond', 'liveAntTicks',
    'preGapMaterialAntTicks', 'populationShareOnPreGapMaterial', 'topPreGapAntTicks',
    'buriedOnlyPreGapAntTicks', 'meanMultiplierOnPreGapMaterial', 'meanDeltaGap'],
  results.flatMap(result => result.populationTimeline));
  await writeCsv(output, 'post-gap-episodes.csv', ['seed', 'antId', 'startTimeMs', 'endTimeMs',
    'durationSeconds', 'ticks', 'rightCensored'], results.flatMap(result => result.episodes));

  const manifest = {
    schemaVersion: 1,
    baselineCommit: BASELINE,
    naturalReplayBaselineCommit: NATURAL_BASELINE,
    branch: git(['branch', '--show-current']),
    node: process.version,
    seeds: SEEDS,
    durationSeconds: 600,
    hz: 60,
    gap: { startTick: GAP_START_TICK, endTick: GAP_END_TICK, durationTicks: GAP_END_TICK - GAP_START_TICK,
      startBoundarySeconds: 400, endBoundarySeconds: 460, durationSeconds: 60 },
    productionConditions: 'Fresh default AntController; default-On material locomotion law; counted production LCG; no audio bridge; no state overrides.',
    intervention: 'At the 400 s tick boundary, retire all current ants using the existing gaster retirement flush, clear per-ant gait/body-pose/deposition maps, set nextSpawnTimeMs to Infinity, then run production tick(dt) for exactly 3600 ticks. At 460 s set nextSpawnTimeMs to the current simulation clock; the production scheduler spawns on the next tick if recruitment allows.',
    gapSuppression: 'No living ant, movement, FOOT_CONTACT, post-boundary pheromone deposition, or spawn. A defensive harness-only spawn wrapper counts and refuses any unexpected gap spawn before RNG use. The production controller tick remains active; no production source is patched.',
    gapBoundaryRemoval: 'Forced removal is research-only. Existing gaster partial doses are flushed at the 400 s boundary with the same retire/applyDeposits path used by controller retirement, before the zero-ant clock interval begins. Forced removals are counted separately in the intervention record.',
    continuingWorldProcesses: ['PheromoneField.decay', 'SurfaceField.relax', 'TrailPlateBirth.advance', 'MaterialStratigraphy.advance', 'ColonyActivation.advance', 'controller simulation clock'],
    entryTime: 'A research-only wrapper records successful post-gap spawnNextAnt calls at the existing controller simulation clock; it adds no AntAgent state and consumes no RNG.',
    preGapMaterialDefinition: 'A layer is pre-gap iff descriptor.bornAtSimulationTimeMs < 400000. Material born exactly at the 400 s boundary is separately counted, not classified as pre-gap.',
    postGapObserverTiming: 'At each fixed tick entry before AntController.tick, read public stratigraphy snapshot for production L and public getColumnAt descriptors for G. Same-tick births/topology changes first appear at the next sample.',
    counterfactual: 'm(L-G) and deltaGap = m(L-G)-m(L) are arithmetic diagnostics only; no material removal or behavior counterfactual is run.',
    observer: 'Only detached/public environment snapshots and public columns are read. Reader purity is checked around captured boundary/second samples; no callbacks into production systems.',
    naturalReplay: { source: 'docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs',
      currentOutput: CLI.get('--natural-replay') || 'docs/ant/evidence/2026-10-12-zero-ant-continuity/data/unobserved-natural-replay-current.json',
      currentOutputSha256: await hashFile(naturalReplayPath), exactBaselineMatch: true },
    productionSourceDiffFromBaseline: git(['diff', '--name-only', BASELINE, 'HEAD', '--', 'src', 'package.json', 'package-lock.json']),
    reproduction: 'node docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs test-results/zero-ant-natural-replay.json; node scripts/ant-zero-ant-continuity-shadow.js --natural-replay=test-results/zero-ant-natural-replay.json --output=test-results/zero-ant-continuity-replay',
    sourceHashes: await sourceHashes(),
    outputFiles: [...(await readdir(output)), 'manifest.json'].sort()
  };
  await writeJson(output, 'manifest.json', manifest);
  console.log(JSON.stringify({ complete: true, output: outputArg, decision: aggregate.decision,
    wallSeconds: (performance.now() - started) / 1000 }));
}

async function runSeed(seed, expectedNatural, baselineNatural) {
  const started = performance.now();
  assert.deepEqual([baselineNatural.spawned, baselineNatural.retired, baselineNatural.contacts,
    baselineNatural.plateCount], expectedNatural, 'stored natural baseline counters differ from seed contract');
  const shadowRng = countedLcg(seed);
  const shadow = new AntController({ random: shadowRng });
  const shadowEvents = watchEvents(shadow);
  await shadow.init();
  assert.equal(shadow.materialLocomotionResistance, true);
  let prefixSamples = 0;
  const prefixChain = createHash('sha256');
  const recordObservedPrefix = tick => {
    const stateHash = controllerStateHash(shadow, shadowRng);
    prefixChain.update(String(tick) + ':' + stateHash + '\n');
    prefixSamples += 1;
  };
  recordObservedPrefix(0);
  for (let tick = 0; tick < GAP_START_TICK; tick += 1) {
    shadowEvents.clearTick();
    shadow.tick(DT);
    if ((tick + 1) % TICKS_PER_SECOND === 0) recordObservedPrefix(tick + 1);
    if ((tick + 1) % 6000 === 0) console.log(JSON.stringify({ seed, phase: 'natural-pre-gap-observation',
      seconds: (tick + 1) / 60, wallSeconds: (performance.now() - started) / 1000 }));
  }
  assert.equal(prefixSamples, 401);
  assert.ok(Math.abs(shadow.simulationTimeMs - GAP_START_MS) < 1e-5);

  const beforeRemovalHash = controllerStateHash(shadow, shadowRng);
  const beforeRemoval = captureWorld(shadow, GAP_START_MS, true);
  assert.equal(controllerStateHash(shadow, shadowRng), beforeRemovalHash,
    'pre-removal world observer changed state');
  const intervention = beginZeroAntIntervention(shadow);
  assert.ok(controllerStateHash(shadow, shadowRng) !== beforeRemovalHash,
    'the explicit agent-removal intervention should change controller state');
  assert.equal(shadow.agents.length, 0);
  assert.equal(shadow.gaitController.ants.size, 0);
  assert.equal(shadow.bodyPoseController.ants.size, 0);
  assert.equal(shadow.gasterDeposition.ants.size, 0);
  const gapEntryHash = controllerStateHash(shadow, shadowRng);
  const gapEntry = captureWorld(shadow, GAP_START_MS, true);
  assert.equal(controllerStateHash(shadow, shadowRng), gapEntryHash, 'gap-entry observer changed state');

  let gapActive = true, gapSpawnCalls = 0, pointDepositCalls = 0, segmentDepositCalls = 0;
  let gapUnexpectedEventCount = 0;
  const originalSpawn = shadow.spawnNextAnt;
  shadow.spawnNextAnt = function (...args) {
    if (gapActive) { gapSpawnCalls += 1; return false; }
    const spawned = originalSpawn.apply(this, args);
    if (spawned) {
      const ant = this.agents.at(-1);
      assert.ok(!intervention.removedIds.includes(ant.id), 'post-gap ant reused a removed ID');
      assert.ok(!intervention.removedObjects.includes(ant), 'post-gap ant reused a removed object');
      assert.ok(!postGapEntries.has(ant.id), 'duplicate post-gap ant ID');
      postGapEntries.set(ant.id, this.simulationTimeMs);
    }
    return spawned;
  };
  const field = shadow.field;
  const originalPoint = field.depositPoint, originalSegment = field.depositSegment;
  const originalOwnPoint = Object.getOwnPropertyDescriptor(field, 'depositPoint');
  const originalOwnSegment = Object.getOwnPropertyDescriptor(field, 'depositSegment');
  field.depositPoint = function (...args) {
    if (gapActive) pointDepositCalls += 1;
    return originalPoint.apply(this, args);
  };
  field.depositSegment = function (...args) {
    if (gapActive) segmentDepositCalls += 1;
    return originalSegment.apply(this, args);
  };

  const gapTimeline = [worldTimelineRow(seed, gapEntry)];
  const gapStartClock = shadow.simulationTimeMs;
  const gapRngState = shadowRng.state(), gapRngCalls = shadowRng.calls;
  const gapSpawned = shadow.totalSpawned, gapRetired = shadow.totalRetired;
  const gapPlateBirths = [], gapNoduleBirths = [];
  for (let tick = GAP_START_TICK; tick < GAP_END_TICK; tick += 1) {
    assert.equal(shadow.agents.length, 0, 'living ant appeared during zero-ant gap at tick ' + tick);
    assert.equal(shadow.gaitController.ants.size + shadow.bodyPoseController.ants.size
      + shadow.gasterDeposition.ants.size, 0, 'per-ant state reappeared during gap');
    shadowEvents.clearTick();
    const previousClock = shadow.simulationTimeMs;
    shadow.tick(DT);
    assert.equal(shadow.agents.length, 0, 'production tick spawned an ant during the gap');
    assert.equal(shadow.totalSpawned, gapSpawned, 'spawn counter changed during gap');
    assert.equal(shadow.totalRetired, gapRetired, 'retirement counter changed during gap');
    assert.equal(shadow.simulationTimeMs > previousClock, true, 'world clock did not advance');
    assert.equal(shadowRng.state(), gapRngState, 'RNG state changed during zero-ant gap');
    assert.equal(shadowRng.calls, gapRngCalls, 'RNG was consumed during zero-ant gap');
    assert.equal(gapSpawnCalls, 0, 'spawn path was called during zero-ant gap');
    assert.equal(pointDepositCalls + segmentDepositCalls, 0, 'pheromone deposition occurred during gap');
    assert.equal(shadowEvents.currentCounts.footContactPoints, 0, 'FOOT_CONTACT occurred during gap');
    const unexpectedEvents = shadowEvents.current.filter(([type]) =>
      type !== 'plate-birth' && type !== 'sphere-birth');
    gapUnexpectedEventCount += unexpectedEvents.length;
    assert.deepEqual(unexpectedEvents, [], 'ant-origin or unclassified event occurred during gap');
    assert.equal(shadow.gaitController.ants.size + shadow.bodyPoseController.ants.size
      + shadow.gasterDeposition.ants.size, 0, 'ghost per-ant state exists during gap');
    gapPlateBirths.push(...shadowEvents.currentPlateIds);
    gapNoduleBirths.push(...shadowEvents.currentNoduleIds);
    const elapsedTicks = tick - GAP_START_TICK + 1;
    if (elapsedTicks % TICKS_PER_SECOND === 0) {
      const purityBefore = controllerStateHash(shadow, shadowRng);
      const checkpoint = captureWorld(shadow, GAP_START_MS, false);
      assert.equal(controllerStateHash(shadow, shadowRng), purityBefore,
        'gap checkpoint observer changed production state');
      gapTimeline.push(worldTimelineRow(seed, checkpoint));
    }
    if (elapsedTicks % 1200 === 0) console.log(JSON.stringify({ seed, phase: 'zero-ant-gap',
      seconds: elapsedTicks / 60, wallSeconds: (performance.now() - started) / 1000 }));
  }
  const gapTicks = GAP_END_TICK - GAP_START_TICK;
  const gapEndClock = shadow.simulationTimeMs;
  assert.equal(gapTicks, 3600);
  assert.ok(Math.abs((gapEndClock - gapStartClock) - 60000) < 1e-5,
    'world simulation clock did not advance exactly 60 seconds within floating-point tolerance');
  assert.equal(shadow.agents.length, 0);
  assert.equal(shadowRng.state(), gapRngState);
  assert.equal(shadowRng.calls, gapRngCalls);
  assert.equal(shadow.totalSpawned, gapSpawned);
  assert.equal(shadow.totalRetired, gapRetired);
  assert.equal(shadow.gaitController.ants.size + shadow.bodyPoseController.ants.size
    + shadow.gasterDeposition.ants.size, 0);
  const perAntStateMapSizesAtGapExit = { gait: shadow.gaitController.ants.size,
    bodyPose: shadow.bodyPoseController.ants.size, gasterDeposition: shadow.gasterDeposition.ants.size };
  const gapExitHash = controllerStateHash(shadow, shadowRng);
  const gapExit = captureWorld(shadow, GAP_START_MS, true);
  assert.equal(controllerStateHash(shadow, shadowRng), gapExitHash, 'gap-exit observer changed state');

  gapActive = false;
  restoreMethod(field, 'depositPoint', originalOwnPoint);
  restoreMethod(field, 'depositSegment', originalOwnSegment);
  resumeRecruitmentAtGapEnd(shadow);
  const gapExitSchedule = shadow.nextSpawnTimeMs;
  assert.equal(gapExitSchedule, shadow.simulationTimeMs);

  const postGapEntries = new Map();
  const records = new Map();
  const episodes = [], populationTimeline = [];
  const aggregate = createExposureCounters(seed);
  for (let tick = GAP_END_TICK; tick < END_TICK; tick += 1) {
    shadowEvents.clearTick();
    const atTickEntry = shadow.simulationTimeMs;
    const purityBefore = (tick - GAP_END_TICK) % TICKS_PER_SECOND === 0
      ? controllerStateHash(shadow, shadowRng) : null;
    const snapshot = shadow.materialStratigraphy.getSnapshot();
    if ((tick - GAP_END_TICK) % TICKS_PER_SECOND === 0) {
      samplePostGapAnts(shadow, snapshot, atTickEntry, postGapEntries, records, episodes, aggregate,
        populationTimeline, true);
      assert.equal(controllerStateHash(shadow, shadowRng), purityBefore,
        'post-gap one-second observer check changed production state');
    } else {
      samplePostGapAnts(shadow, snapshot, atTickEntry, postGapEntries, records, episodes, aggregate,
        populationTimeline, false);
    }
    shadow.tick(DT);
    closeRetiredRecords(shadow, records, episodes);
    if ((tick + 1) % 6000 === 0) console.log(JSON.stringify({ seed, phase: 'post-gap-natural',
      seconds: (tick + 1) / 60, population: shadow.agents.length,
      wallSeconds: (performance.now() - started) / 1000 }));
  }
  const finalClock = shadow.simulationTimeMs;
  assert.ok(Math.abs(finalClock - 600000) < 1e-4);
  closeOpenEpisodes(records, episodes, finalClock, true);
  for (const row of aggregate.seconds.values()) populationTimeline.push({
    seed: row.seed, simulationSecond: row.simulationSecond, liveAntTicks: row.liveAntTicks,
    preGapMaterialAntTicks: row.preGapMaterialAntTicks,
    populationShareOnPreGapMaterial: row.liveAntTicks ? row.preGapMaterialAntTicks / row.liveAntTicks : 0,
    topPreGapAntTicks: row.topPreGapAntTicks, buriedOnlyPreGapAntTicks: row.buriedOnlyPreGapAntTicks,
    meanMultiplierOnPreGapMaterial: row.preGapMaterialAntTicks
      ? row.multiplierSum / row.preGapMaterialAntTicks : null,
    meanDeltaGap: row.preGapMaterialAntTicks ? row.deltaSum / row.preGapMaterialAntTicks : null
  });
  populationTimeline.sort((a, b) => a.simulationSecond - b.simulationSecond);
  const finalWorldHash = controllerStateHash(shadow, shadowRng);
  const finalWorld = captureWorld(shadow, GAP_START_MS, true);
  assert.equal(controllerStateHash(shadow, shadowRng), finalWorldHash,
    'final world observer changed state');
  const preGapPlateIds = new Set(beforeRemoval.material.plateDescriptors
    .filter(plate => plate.bornAtSimulationTimeMs < GAP_START_MS).map(plate => plate.id));
  const gapTransition = describeWorldTransition(beforeRemoval, gapEntry, gapExit, finalWorld,
    intervention, gapPlateBirths, gapNoduleBirths, preGapPlateIds, pointDepositCalls + segmentDepositCalls);
  const postGapMetrics = summarizeExposure(aggregate, records, episodes, postGapEntries, finalClock);
  const naturalControl = baselineNatural;
  await shadow.destroy();

  const summary = { seed, conditions: { durationSeconds: 600, hz: 60, productionMaterialLaw: 'default-on',
    audioBridge: false, gapStartSeconds: 400, gapEndSeconds: 460, gapDurationSeconds: 60,
    gapTicks, firstReentryTimeMs: postGapMetrics.firstReentryTimeMs },
  naturalPrefix: { observedWorldCheckpoints: prefixSamples,
    observedStateChainSha256: prefixChain.digest('hex'),
    canonicalNaturalReplayExactMatch: true },
  naturalControl, gapIntervention: { ...intervention, removedObjects: undefined,
    gapSpawnCalls, pointDepositCalls, segmentDepositCalls, gapClockStartMs: gapStartClock,
    gapClockEndMs: gapEndClock, gapClockAdvanceMs: gapEndClock - gapStartClock,
    gapRngStateUnchanged: true, gapRngCallsUnchanged: true, exactZeroPopulationTicks: gapTicks,
    gapUnexpectedEventCount,
    perAntStateMapSizesAtGapExit,
    gapPlateBirthIds: gapPlateBirths, gapNoduleBirthIds: gapNoduleBirths,
    reentryScheduleMs: gapExitSchedule },
  worldTransition: gapTransition, postGap: postGapMetrics,
  finalPopulation: finalWorld.population, finalSimulationTimeMs: finalClock,
  rngAtEnd: { state: shadowRng.state(), calls: shadowRng.calls } };
  return { summary, naturalControl, naturalPrefixChain: { seed, observedWorldCheckpoints: prefixSamples,
    observedStateChainSha256: summary.naturalPrefix.observedStateChainSha256,
    canonicalNaturalReplayExactMatch: true },
  worldTransition: gapTransition, gapTimeline, populationTimeline, ants: [...records.values()].map(record => {
    const { currentEpisode, ...saved } = record;
    return saved;
  }), episodes, wallSeconds: (performance.now() - started) / 1000 };
}

function samplePostGapAnts(controller, snapshot, timeMs, entryTimes, records, episodes, totals,
  populationTimeline, purityCheck) {
  void purityCheck;
  const currentIds = new Set();
  const second = Math.floor(timeMs / 1000 + 1e-9);
  let liveAntTicks = 0, preGapAntTicks = 0, topPreGapAntTicks = 0, buriedOnlyAntTicks = 0;
  let multiplierTotal = 0, deltaTotal = 0;
  const secondRow = totals.seconds.get(second) || { seed: totals.seed, simulationSecond: second,
    liveAntTicks: 0, preGapMaterialAntTicks: 0, topPreGapAntTicks: 0, buriedOnlyPreGapAntTicks: 0,
    multiplierSum: 0, deltaSum: 0 };
  totals.seconds.set(second, secondRow);
  for (const ant of controller.agents) {
    currentIds.add(ant.id);
    const entryTimeMs = entryTimes.get(ant.id);
    assert.ok(Number.isFinite(entryTimeMs) && entryTimeMs <= timeMs,
      'post-gap ant missing or future entry provenance: ' + ant.id);
    let record = records.get(ant.id);
    if (!record) {
      record = { seed: totals.seed, antId: ant.id, entryTimeMs, activeTicks: 0,
        preGapMaterialTicks: 0, topPreGapTicks: 0, buriedOnlyPreGapTicks: 0,
        layerCountHistogram: {}, preGapLayerCountHistogram: {}, currentEpisode: null,
        episodes: [], retiredAtMs: null, firstPreGapEncounterMs: null };
      records.set(ant.id, record);
    }
    record.activeTicks += 1;
    liveAntTicks += 1;
    const layerCount = materialLayerCountAtSnapshot(snapshot, ant.x, ant.y);
    const column = controller.materialStratigraphy.getColumnAt(ant.x, ant.y);
    assert.equal(column.length, layerCount, 'production L differs from public column at ' + ant.id);
    const preGapCount = countPreGapLayers(column);
    const topPreGap = preGapCount > 0
      && column.at(-1).descriptor.bornAtSimulationTimeMs < GAP_START_MS;
    const buriedOnly = preGapCount > 0 && !topPreGap;
    const multiplier = materialLocomotionMultiplier(layerCount);
    const withoutPreGap = materialLocomotionMultiplier(layerCount - preGapCount);
    const deltaGap = withoutPreGap - multiplier;
    record.layerCountHistogram[layerCount] = (record.layerCountHistogram[layerCount] || 0) + 1;
    record.preGapLayerCountHistogram[preGapCount] = (record.preGapLayerCountHistogram[preGapCount] || 0) + 1;
    if (preGapCount > 0) {
      record.preGapMaterialTicks += 1;
      record.topPreGapTicks += Number(topPreGap);
      record.buriedOnlyPreGapTicks += Number(buriedOnly);
      if (record.firstPreGapEncounterMs === null) record.firstPreGapEncounterMs = timeMs;
      preGapAntTicks += 1;
      if (topPreGap) topPreGapAntTicks += 1;
      if (buriedOnly) buriedOnlyAntTicks += 1;
      totals.preGapMultipliers.push(multiplier);
      totals.preGapDeltas.push(deltaGap);
      totals.preGapLCounts[layerCount] = (totals.preGapLCounts[layerCount] || 0) + 1;
      totals.preGapGCounts[preGapCount] = (totals.preGapGCounts[preGapCount] || 0) + 1;
      const pair = layerCount + ':' + preGapCount;
      totals.preGapLGCounts[pair] = (totals.preGapLGCounts[pair] || 0) + 1;
      if (!record.currentEpisode) record.currentEpisode = { startTimeMs: timeMs, ticks: 0 };
      record.currentEpisode.ticks += 1;
      multiplierTotal += multiplier;
      deltaTotal += deltaGap;
    } else if (record.currentEpisode) {
      closeEpisode(record, timeMs, false, episodes);
    }
  }
  for (const record of records.values()) {
    if (record.retiredAtMs === null && !currentIds.has(record.antId) && record.activeTicks > 0) {
      record.retiredAtMs = timeMs;
      if (record.currentEpisode) closeEpisode(record, timeMs, false, episodes);
    }
  }
  secondRow.liveAntTicks += liveAntTicks;
  secondRow.preGapMaterialAntTicks += preGapAntTicks;
  secondRow.topPreGapAntTicks += topPreGapAntTicks;
  secondRow.buriedOnlyPreGapAntTicks += buriedOnlyAntTicks;
  secondRow.multiplierSum += multiplierTotal;
  secondRow.deltaSum += deltaTotal;
  totals.activeAntTicks += liveAntTicks;
  totals.preGapMaterialAntTicks += preGapAntTicks;
  totals.topPreGapAntTicks += topPreGapAntTicks;
  totals.buriedOnlyPreGapAntTicks += buriedOnlyAntTicks;
}

function closeRetiredRecords(controller, records, episodes) {
  const live = new Set(controller.agents.map(agent => agent.id));
  for (const record of records.values()) {
    if (record.retiredAtMs === null && !live.has(record.antId) && record.activeTicks > 0) {
      record.retiredAtMs = controller.simulationTimeMs;
      if (record.currentEpisode) closeEpisode(record, controller.simulationTimeMs, false, episodes);
    }
  }
}

function closeOpenEpisodes(records, episodes, endTimeMs, rightCensored) {
  for (const record of records.values()) {
    if (record.currentEpisode) closeEpisode(record, endTimeMs, rightCensored, episodes);
  }
}

function closeEpisode(record, endTimeMs, rightCensored, allEpisodes) {
  const episode = record.currentEpisode;
  const saved = { seed: record.seed, antId: record.antId, startTimeMs: episode.startTimeMs,
    endTimeMs, ticks: episode.ticks, durationSeconds: episode.ticks * DT, rightCensored };
  record.episodes.push(saved);
  allEpisodes.push(saved);
  record.currentEpisode = null;
}

function createExposureCounters(seed) {
  return { seed, activeAntTicks: 0, preGapMaterialAntTicks: 0, topPreGapAntTicks: 0,
    buriedOnlyPreGapAntTicks: 0, preGapMultipliers: [], preGapDeltas: [], preGapLCounts: {},
    preGapGCounts: {}, preGapLGCounts: {}, seconds: new Map() };
}

function summarizeExposure(totals, records, episodes, entries, finalClockMs) {
  const ants = [...records.values()];
  const durations = episodes.map(episode => episode.durationSeconds).sort((a, b) => a - b);
  const firstReentryTimeMs = entries.size ? Math.min(...entries.values()) : null;
  const activeTicks = totals.activeAntTicks;
  const preTicks = totals.preGapMaterialAntTicks;
  return {
    firstReentryTimeMs, firstReentryTimeSeconds: firstReentryTimeMs === null ? null : firstReentryTimeMs / 1000,
    postGapSpawnedAntCount: entries.size,
    postGapAntsWithPreGapMaterial: ants.filter(ant => ant.preGapMaterialTicks > 0).length,
    activeAntTicks: activeTicks, activeAntTimeSeconds: activeTicks * DT,
    preGapMaterialAntTicks: preTicks, preGapMaterialAntTimeSeconds: preTicks * DT,
    preGapMaterialFractionOfActiveAntTime: activeTicks ? preTicks / activeTicks : 0,
    topPreGapAntTicks: totals.topPreGapAntTicks,
    topPreGapFractionOfPreGapAntTime: preTicks ? totals.topPreGapAntTicks / preTicks : 0,
    buriedOnlyPreGapAntTicks: totals.buriedOnlyPreGapAntTicks,
    buriedOnlyFractionOfPreGapAntTime: preTicks ? totals.buriedOnlyPreGapAntTicks / preTicks : 0,
    encounterEpisodeCount: episodes.length,
    episodeDurationSeconds: quantiles(durations),
    actualProductionMultiplierWhenPreGapPresent: quantiles(totals.preGapMultipliers),
    multiplierWithoutPreGapDiagnostic: quantiles(totals.preGapDeltas.map((delta, index) =>
      totals.preGapMultipliers[index] + delta)),
    deltaGapDiagnostic: quantiles(totals.preGapDeltas),
    preGapLayerCountDistribution: totals.preGapGCounts,
    currentLayerCountWhenPreGapPresent: totals.preGapLCounts,
    jointLayerCountsLAndG: totals.preGapLGCounts,
    antRecords: ants.length, retiredByEnd: ants.filter(ant => ant.retiredAtMs !== null).length,
    rightCensoredAt600Seconds: ants.filter(ant => ant.retiredAtMs === null).length,
    finalClockMs
  };
}

function aggregateResults(results) {
  const summaries = results.map(result => result.summary.postGap);
  const active = summaries.reduce((sum, row) => sum + row.activeAntTicks, 0);
  const old = summaries.reduce((sum, row) => sum + row.preGapMaterialAntTicks, 0);
  const top = summaries.reduce((sum, row) => sum + row.topPreGapAntTicks, 0);
  const buried = summaries.reduce((sum, row) => sum + row.buriedOnlyPreGapAntTicks, 0);
  const episodes = results.flatMap(result => result.episodes).map(row => row.durationSeconds).sort((a, b) => a - b);
  const lCounts = mergeCountObjects(summaries.map(row => row.currentLayerCountWhenPreGapPresent));
  const gCounts = mergeCountObjects(summaries.map(row => row.preGapLayerCountDistribution));
  const joint = mergeCountObjects(summaries.map(row => row.jointLayerCountsLAndG));
  const multiplierDistribution = weightedMetricSummary(Object.entries(lCounts).map(([layerCount, count]) =>
    [materialLocomotionMultiplier(Number(layerCount)), count]));
  const deltaDistribution = weightedMetricSummary(Object.entries(joint).map(([pair, count]) => {
    const [layerCount, preGapCount] = pair.split(':').map(Number);
    return [materialLocomotionMultiplier(layerCount - preGapCount)
      - materialLocomotionMultiplier(layerCount), count];
  }));
  const withoutPreGapDistribution = weightedMetricSummary(Object.entries(joint).map(([pair, count]) => {
    const [layerCount, preGapCount] = pair.split(':').map(Number);
    return [materialLocomotionMultiplier(layerCount - preGapCount), count];
  }));
  return { decision: decide(results), seedCount: results.length, simulatedSeconds: results.length * 600,
    activeAntTicks: active, activeAntTimeSeconds: active * DT,
    preGapMaterialAntTicks: old, preGapMaterialAntTimeSeconds: old * DT,
    preGapMaterialFractionOfActiveAntTime: active ? old / active : 0,
    antsWithPreGapMaterial: summaries.reduce((sum, row) => sum + row.postGapAntsWithPreGapMaterial, 0),
    postGapSpawnedAnts: summaries.reduce((sum, row) => sum + row.postGapSpawnedAntCount, 0),
    topPreGapAntTicks: top, topPreGapFraction: old ? top / old : 0,
    buriedOnlyPreGapAntTicks: buried, buriedOnlyFraction: old ? buried / old : 0,
    encounterEpisodeCount: results.reduce((sum, row) => sum + row.episodes.length, 0),
    episodeDurationSeconds: quantiles(episodes),
    actualProductionMultiplierWhenPreGapPresent: multiplierDistribution,
    multiplierWithoutPreGapDiagnostic: withoutPreGapDistribution,
    currentLayerCountWhenPreGapPresent: lCounts, preGapLayerCountDistribution: gCounts,
    jointLayerCountsLAndG: joint,
    deltaGapDiagnostic: deltaDistribution,
    seeds: summaries.map((row, index) => ({ seed: SEEDS[index], ...row })) };
}

function decide(results) {
  const valid = results.every(result => result.summary.gapIntervention.exactZeroPopulationTicks === 3600
    && result.summary.gapIntervention.gapRngCallsUnchanged
    && result.summary.gapIntervention.gapSpawnCalls === 0
    && result.summary.gapIntervention.gapUnexpectedEventCount === 0
    && result.summary.gapIntervention.pointDepositCalls + result.summary.gapIntervention.segmentDepositCalls === 0);
  if (!valid) return 'INCONCLUSIVE';
  const supported = results.every(result => result.worldTransition.material.preGapPlateDescriptorsPersisted
    && result.worldTransition.material.preGapColumnPlacementPersisted
    && result.summary.postGap.postGapAntsWithPreGapMaterial > 0
    && result.summary.postGap.preGapMaterialAntTicks > 0
    && result.summary.postGap.deltaGapDiagnostic.max > 0);
  return supported ? 'SHADOW ZERO-ANT CONTINUITY SUPPORTED' : 'PARTIAL';
}

function describeWorldTransition(beforeRemoval, gapEntry, gapExit, finalWorld, intervention,
  gapPlateBirthIds, gapNoduleBirthIds, preGapPlateIds, gapDepositCalls) {
  const preDescriptors = gapEntry.material.plateDescriptors.filter(plate => preGapPlateIds.has(plate.id));
  const exitById = new Map(gapExit.material.plateDescriptors.map(plate => [plate.id, plate]));
  const preGapRetained = preDescriptors.filter(plate => exitById.has(plate.id));
  const preGapDescriptorsUnchanged = preGapRetained.every(plate =>
    hashValue(plate) === hashValue(exitById.get(plate.id)));
  const oldNoduleIds = new Set(gapEntry.material.noduleDescriptors.map(nodule => nodule.id));
  const exitNoduleIds = new Set(gapExit.material.noduleDescriptors.map(nodule => nodule.id));
  const preGapOldPlacementPersisted = gapEntry.material.columnSummary.oldLayerPlacementSha256
    === gapExit.material.columnSummary.oldLayerPlacementSha256;
  const entryTrail = gapEntry.trailPlateBirth;
  const exitTrail = gapExit.trailPlateBirth;
  return {
    boundaryRemoval: { removedAntCount: intervention.removedIds.length,
      removedIds: intervention.removedIds, bufferedDoseBeforeRemoval: intervention.pendingDoseBeforeRemoval,
      flushedDepositCountAt400s: intervention.flushedDeposits, flushedDoseAt400s: intervention.flushedDose,
      totalRetiredAfterForcedRemoval: intervention.totalRetiredAfterIntervention,
      treatmentBeginsAfterThisBoundaryFlush: true },
    pheromone: { classification: gapEntry.pheromone.sha256 === gapExit.pheromone.sha256
      ? 'persisted unchanged' : 'evolved/decayed', entry: gapEntry.pheromone, exit: gapExit.pheromone,
      massChangeDuringGap: gapExit.pheromone.totalMass - gapEntry.pheromone.totalMass,
      gapDepositCalls: gapDepositCalls },
    surfaceField: { classification: gapEntry.surface.sha256 === gapExit.surface.sha256
      ? 'persisted unchanged' : 'evolved/decayed', entry: gapEntry.surface, exit: gapExit.surface,
      massChangeDuringGap: gapExit.surface.totalMass - gapEntry.surface.totalMass,
      contactCountChange: gapExit.surface.totalFootContacts - gapEntry.surface.totalFootContacts },
    plates: { entryCount: gapEntry.material.plateDescriptors.length,
      exitCount: gapExit.material.plateDescriptors.length,
      preGapPlateCount: preDescriptors.length, preGapPlateDescriptorsPersisted: preGapRetained.length === preDescriptors.length,
      preGapDescriptorsUnchanged, newPlateIdsDuringGap: [...new Set(gapPlateBirthIds)],
      platesBornAt400Boundary: gapEntry.material.plateDescriptors.filter(plate =>
        plate.bornAtSimulationTimeMs === GAP_START_MS).map(plate => plate.id),
      allEntryPlateIdsPersist: gapEntry.material.plateDescriptors.every(plate =>
        exitById.has(plate.id)) },
    material: { entryRevision: gapEntry.material.revision, exitRevision: gapExit.material.revision,
      entryNoduleRevision: gapEntry.material.noduleRevision, exitNoduleRevision: gapExit.material.noduleRevision,
      entryClockMs: gapEntry.material.simulationTimeMs, exitClockMs: gapExit.material.simulationTimeMs,
      lastAdvanceTimeMs: { entry: gapEntry.material.lastAdvanceTimeMs, exit: gapExit.material.lastAdvanceTimeMs },
      lastNoduleEvaluationTimeMs: { entry: gapEntry.material.lastNoduleEvaluationTimeMs,
        exit: gapExit.material.lastNoduleEvaluationTimeMs },
      publicSnapshotSha256: { entry: gapEntry.material.publicSha256, exit: gapExit.material.publicSha256 },
      preGapPlateDescriptorsPersisted: preGapRetained.length === preDescriptors.length,
      preGapColumnPlacementPersisted: preGapOldPlacementPersisted,
      entryColumns: gapEntry.material.columnSummary, exitColumns: gapExit.material.columnSummary,
      noduleIdsPersisted: [...oldNoduleIds].every(id => exitNoduleIds.has(id)),
      newNoduleIdsDuringGap: [...new Set(gapNoduleBirthIds)],
      candidateSinceValidCells: { entry: gapEntry.material.validNoduleCandidateCells,
        exit: gapExit.material.validNoduleCandidateCells },
      resetOrLostPreGapPlateIds: preDescriptors.filter(plate => !exitById.has(plate.id)).map(plate => plate.id) },
    trailPlateBirth: { publicSnapshotSha256: { entry: entryTrail.publicSha256, exit: exitTrail.publicSha256 },
      lastAnalysisTimeMs: { entry: entryTrail.lastAnalysisTimeMs, exit: exitTrail.lastAnalysisTimeMs },
      lastBirthTimeMs: { entry: entryTrail.lastBirthTimeMs, exit: exitTrail.lastBirthTimeMs },
      chemicalMemorySha256: { entry: entryTrail.chemicalMemorySha256, exit: exitTrail.chemicalMemorySha256 },
      footContactCountsSha256: { entry: entryTrail.footContactCountsSha256, exit: exitTrail.footContactCountsSha256 },
      candidate: { entry: entryTrail.candidate, exit: exitTrail.candidate } },
    colonyActivation: { entry: gapEntry.colonyActivation, exit: gapExit.colonyActivation,
      classification: hashValue(gapEntry.colonyActivation) === hashValue(gapExit.colonyActivation)
        ? 'persisted unchanged' : 'evolved with environmental evidence' },
    beforeRemovalClockMs: beforeRemoval.simulationTimeMs,
    gapEntryClockMs: gapEntry.simulationTimeMs,
    gapExitClockMs: gapExit.simulationTimeMs,
    postGapFinalClockMs: finalWorld.simulationTimeMs,
    postGapFinalPopulation: finalWorld.population
  };
}

function captureWorld(controller, gapStartMs, includeColumns) {
  const pheromone = controller.field.getSnapshot();
  const surface = controller.surfaceField.getSnapshot();
  const material = controller.materialStratigraphy;
  const materialSnapshot = material.getSnapshot();
  const trailBirth = controller.trailPlateBirth;
  const trailSnapshot = trailBirth.getSnapshot();
  const trailPlates = trailBirth.getPlates();
  const materialPlates = material.getPlates();
  const nodules = material.getNodules();
  const candidate = trailBirth.candidate;
  const columnSummary = includeColumns ? summarizeColumns(material, materialSnapshot, gapStartMs) : null;
  return { simulationTimeMs: controller.simulationTimeMs, population: controller.agents.length,
    nextSpawnTimeMs: Number.isFinite(controller.nextSpawnTimeMs) ? controller.nextSpawnTimeMs : 'Infinity',
    totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
    pheromone: fieldSummary(pheromone.values, pheromone.totalMass, pheromone.width, pheromone.height),
    surface: { ...fieldSummary(surface.values, surface.totalMass, surface.width, surface.height),
      totalFootContacts: surface.totalFootContacts },
    trailPlateBirth: { publicSha256: hashValue(trailSnapshot), plateCount: trailPlates.length,
      plateDescriptors: trailPlates.map(plateBrief), lastAnalysisTimeMs: trailBirth.lastAnalysisTimeMs,
      lastBirthTimeMs: Number.isFinite(trailBirth.lastBirthTimeMs) ? trailBirth.lastBirthTimeMs : null,
      chemicalMemorySha256: hashValue(trailBirth.chemicalMemory),
      footContactCountsSha256: hashValue(trailBirth.footContactCounts),
      candidate: candidate ? { startedAtMs: candidate.startedAtMs, stableSeconds: candidate.stableSeconds,
        footContacts: candidate.footContacts, similarity: candidate.similarity } : null },
    material: { publicSha256: hashValue(materialSnapshot), revision: material.revision,
      noduleRevision: material.noduleRevision, simulationTimeMs: material.simulationTimeMs,
      lastAdvanceTimeMs: material.lastAdvanceTimeMs,
      lastNoduleEvaluationTimeMs: material.lastNoduleEvaluationTimeMs,
      totalAcceptedFootContacts: material.totalAcceptedFootContacts,
      rejectedFootContacts: material.rejectedFootContacts,
      qualifiedNoduleCandidateCount: material.qualifiedNoduleCandidateCount,
      validNoduleCandidateCells: material.candidateSinceMs.reduce((count, value) => count + (value >= 0 ? 1 : 0), 0),
      footLoadSha256: hashValue(material.footLoadByCell),
      plateDescriptors: materialPlates.map(plateBrief),
      noduleDescriptors: nodules.map(noduleBrief), columnSummary },
    colonyActivation: controller.colonyActivation.getSnapshot() };
}

function summarizeColumns(material, snapshot, gapStartMs) {
  const lCounts = {}, gCounts = {};
  const oldIdCells = [];
  let coveredCells = 0, preGapCells = 0, oldLayerCellOccurrences = 0;
  let topPreGapCells = 0, buriedOnlyPreGapCells = 0;
  for (let row = 0; row < snapshot.height; row += 1) for (let col = 0; col < snapshot.width; col += 1) {
    const cell = row * snapshot.width + col;
    const x = col / (snapshot.width - 1), y = row / (snapshot.height - 1);
    const column = material.getColumnAt(x, y);
    const layerCount = column.length;
    assert.equal(layerCount, snapshot.stratigraphy.layerCountByCell[cell]);
    lCounts[layerCount] = (lCounts[layerCount] || 0) + 1;
    if (layerCount > 0) coveredCells += 1;
    const oldIds = column.filter(layer => layer.descriptor.bornAtSimulationTimeMs < gapStartMs)
      .map(layer => layer.id);
    const oldCount = oldIds.length;
    gCounts[oldCount] = (gCounts[oldCount] || 0) + 1;
    oldLayerCellOccurrences += oldCount;
    if (oldCount) {
      preGapCells += 1;
      if (column.at(-1).descriptor.bornAtSimulationTimeMs < gapStartMs) topPreGapCells += 1;
      else buriedOnlyPreGapCells += 1;
    }
    oldIdCells.push(oldIds);
  }
  return { gridCellCount: snapshot.width * snapshot.height, coveredCells,
    preGapCells, oldLayerCellOccurrences, topPreGapCells, buriedOnlyPreGapCells,
    totalLayerCountHistogram: lCounts, preGapLayerCountPerCellHistogram: gCounts,
    oldLayerPlacementSha256: createHash('sha256').update(JSON.stringify(oldIdCells)).digest('hex') };
}

function worldTimelineRow(seed, world) {
  return { seed, simulationTimeSeconds: world.simulationTimeMs / 1000,
    pheromoneMass: world.pheromone.totalMass, pheromoneNonzeroCells: world.pheromone.nonzeroCells,
    pheromoneSha256: world.pheromone.sha256,
    surfaceMass: world.surface.totalMass, surfaceNonzeroCells: world.surface.nonzeroCells,
    surfaceFootContacts: world.surface.totalFootContacts, surfaceSha256: world.surface.sha256,
    trailPlateCount: world.trailPlateBirth.plateCount,
    trailBirthLastAnalysisTimeMs: world.trailPlateBirth.lastAnalysisTimeMs,
    trailBirthLastBirthTimeMs: world.trailPlateBirth.lastBirthTimeMs,
    trailChemicalMemorySha256: world.trailPlateBirth.chemicalMemorySha256,
    materialPlateCount: world.material.plateDescriptors.length, noduleCount: world.material.noduleDescriptors.length,
    materialRevision: world.material.revision, noduleRevision: world.material.noduleRevision,
    materialClockMs: world.material.simulationTimeMs, lastAdvanceTimeMs: world.material.lastAdvanceTimeMs,
    lastNoduleEvaluationTimeMs: world.material.lastNoduleEvaluationTimeMs,
    activationEvidence: world.colonyActivation.evidence, activation: world.colonyActivation.activation,
    recruitmentLimit: Math.floor(world.colonyActivation.desiredPopulation + 1e-9),
    publicWorldSha256: hashValue({ trail: world.trailPlateBirth.publicSha256, material: world.material.publicSha256,
      colony: world.colonyActivation }) };
}

function fieldSummary(values, totalMass, width, height) {
  let max = 0, nonzeroCells = 0;
  for (const value of values) { max = Math.max(max, value); nonzeroCells += Number(value !== 0); }
  return { width, height, totalMass, maxValueObserved: max, nonzeroCells, sha256: hashValue(values) };
}

function plateBrief(plate) {
  return { id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
    position: plate.position, target: plate.target, source: plate.source,
    geodesicLength: plate.geodesicLength, maskCellCount: plate.mask?.reduce?.((sum, value) => sum + value, 0) ?? null,
    descriptorSha256: hashValue(plate) };
}

function noduleBrief(nodule) {
  return { id: nodule.id, bornAtSimulationTimeMs: nodule.bornAtSimulationTimeMs,
    position: nodule.position, sourcePlateIDs: nodule.sourcePlateIDs, coupledPlateId: nodule.coupledPlateId,
    descriptorSha256: hashValue(nodule) };
}

function watchEvents(controller) {
  const result = { total: { footContactGroups: 0, footContactPoints: 0, plateBirths: 0,
    noduleBirths: 0, errors: 0 }, current: [], currentCounts: { footContactPoints: 0 },
    currentPlateIds: [], currentNoduleIds: [] };
  controller.subscribe(event => {
    const payload = event.payload;
    result.current.push([event.type, payload]);
    if (event.type === 'foot-contact') {
      const count = payload.contacts.length;
      result.total.footContactGroups += 1;
      result.total.footContactPoints += count;
      result.currentCounts.footContactPoints += count;
    } else if (event.type === 'plate-birth') {
      result.total.plateBirths += 1;
      result.currentPlateIds.push(payload.id);
    } else if (event.type === 'sphere-birth') {
      result.total.noduleBirths += 1;
      result.currentNoduleIds.push(payload.id);
    } else if (event.type === 'error') result.total.errors += 1;
  });
  result.clearTick = () => { result.current = []; result.currentCounts = { footContactPoints: 0 };
    result.currentPlateIds = []; result.currentNoduleIds = []; };
  return result;
}

function controllerStateHash(controller, rng) {
  const owned = { ...controller, listeners: null, random: { value: rng.state(), calls: rng.calls },
    fieldFactory: null, audioBridge: null };
  if (Object.hasOwn(owned, 'spawnNextAnt')) delete owned.spawnNextAnt;
  if (Object.hasOwn(controller.field, 'depositPoint') || Object.hasOwn(controller.field, 'depositSegment')) {
    owned.field = { ...controller.field };
    delete owned.field.depositPoint;
    delete owned.field.depositSegment;
  }
  return createHash('sha256').update(serialize(owned)).digest('hex');
}

function countedLcg(seed) {
  let state = seed >>> 0, calls = 0;
  const random = () => { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  random.state = () => state;
  Object.defineProperty(random, 'calls', { get: () => calls });
  Object.defineProperty(random, 'seed', { value: seed });
  return random;
}

function restoreMethod(target, name, originalDescriptor) {
  if (originalDescriptor) Object.defineProperty(target, name, originalDescriptor);
  else delete target[name];
}

function quantiles(values) {
  if (!values.length) return { count: 0, min: null, mean: null, median: null, p90: null, p95: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, min: sorted[0], mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9), p95: quantile(sorted, 0.95), max: sorted.at(-1) };
}

function summarizeValues(values) { return quantiles(values); }
function weightedMetricSummary(pairs) {
  const sorted = pairs.filter(([, count]) => count > 0).sort((a, b) => a[0] - b[0]);
  const count = sorted.reduce((sum, [, weight]) => sum + weight, 0);
  if (!count) return { count: 0, min: null, mean: null, median: null, p90: null, p95: null, max: null };
  const weightedQuantile = q => {
    const target = Math.max(1, Math.ceil(q * count));
    let cumulative = 0;
    for (const [value, weight] of sorted) {
      cumulative += weight;
      if (cumulative >= target) return value;
    }
    return sorted.at(-1)[0];
  };
  return { count, min: sorted[0][0], mean: sorted.reduce((sum, [value, weight]) => sum + value * weight, 0) / count,
    median: weightedQuantile(0.5), p90: weightedQuantile(0.9), p95: weightedQuantile(0.95),
    max: sorted.at(-1)[0] };
}
function quantile(sorted, q) { return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)]; }
function mergeCountObjects(objects) {
  const merged = {};
  for (const object of objects) for (const [key, value] of Object.entries(object)) merged[key] = (merged[key] || 0) + value;
  return Object.fromEntries(Object.entries(merged).sort((a, b) => Number(a[0]) - Number(b[0])));
}
function hashValue(value) { return createHash('sha256').update(serialize(value)).digest('hex'); }
async function hashFile(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
async function sourceHashes() {
  const paths = [...PRODUCTION_PATHS, 'scripts/ant-zero-ant-continuity-shadow.js',
    'tests/ant-zero-ant-continuity.test.js',
    'docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs'];
  const result = {};
  for (const path of paths) result[path] = await hashFile(resolve(ROOT, path));
  return result;
}
function assertNaturalBaselineAndProductionSources() {
  execFileSync('git', ['merge-base', '--is-ancestor', BASELINE, 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  const changed = execFileSync('git', ['diff', '--name-only', BASELINE, 'HEAD', '--', 'src', 'package.json', 'package-lock.json'],
    { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(changed, '', 'production source/package/lockfile changed from baseline');
  const worktree = execFileSync('git', ['status', '--short', '--', 'src', 'package.json', 'package-lock.json'],
    { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(worktree, '', 'production source/package/lockfile has staged, unstaged, or untracked changes');
}
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
async function writeJson(directory, name, value) {
  await writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + '\n');
}
async function writeCsv(directory, name, headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(key => csvCell(row[key])).join(','));
  await writeFile(resolve(directory, name), lines.join('\n') + '\n');
}
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let output = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (output.includes(',') || output.includes('"') || output.includes('\n')) output = '"' + output.replaceAll('"', '""') + '"';
  return output;
}
