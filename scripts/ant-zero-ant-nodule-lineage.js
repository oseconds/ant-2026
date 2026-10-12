import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { serialize } from 'node:v8';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION as Q } from '../src/lib/agents/ant/MaterialStratigraphy.js';
import { beginZeroAntIntervention } from './ant-zero-ant-continuity-shadow.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASELINE = 'e21d68597808f8b0c64ff360d0382d6b96971921';
const BRANCH = 'research/ant-zero-ant-nodule-continuity-20261013';
const SEEDS = [20261005, 20261006, 20261007];
const DT = 1 / 60;
const PREFIX_TICKS = 400 * 60;
const GAP_TICKS = 3600;
const GAP_START_MS = 400000;
const GAP_END_MS = 460000;
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

export function clearCandidatePersistence(material) {
  assert.ok(material?.candidateSinceMs && ArrayBuffer.isView(material.candidateSinceMs));
  const timers = material.candidateSinceMs;
  const clearedCount = timers.reduce((count, value) => count + Number(value >= 0), 0);
  timers.fill(-1);
  assert.equal(material.candidateSinceMs, timers, 'timer clear must preserve the production array');
  assert.ok(timers.every(value => value === -1), 'all in-progress persistence timers must be cleared');
  return { clearedCount, length: timers.length, sha256After: hash(timers) };
}

export function classifyNoduleLineage({ entryTimerMs, birthTimerMs, gapStartMs = GAP_START_MS,
  timerClearApplied = false, plateChangeBeforeTimerStart = false }) {
  if (!Number.isFinite(birthTimerMs) || birthTimerMs < 0) return 'AMBIGUOUS';
  if (!timerClearApplied && (!Number.isFinite(entryTimerMs) || entryTimerMs < 0)
    && birthTimerMs < gapStartMs) return 'AMBIGUOUS';
  if (!timerClearApplied && Number.isFinite(entryTimerMs) && entryTimerMs >= 0
    && birthTimerMs === entryTimerMs) return 'PRE-GAP TIMER LINEAGE';
  if (birthTimerMs >= gapStartMs && plateChangeBeforeTimerStart) return 'RESET/STACK-CHANGED LINEAGE';
  if (birthTimerMs >= gapStartMs) return 'POST-GAP TIMER LINEAGE';
  return 'AMBIGUOUS';
}

export function qualificationAtCell(material, surface, cell, layerCounts = material.getSnapshot().stratigraphy.layerCountByCell,
  { includeNearbyNodule = false } = {}) {
  const layerCount = layerCounts[cell] || 0;
  const buriedLayerCount = Math.max(0, layerCount - 1);
  const hasFoundation = layerCount >= Q.minimumOverlappingPlates
    && buriedLayerCount >= Q.minimumBuriedLayers;
  const x = (cell % material.width) / (material.width - 1);
  const y = Math.floor(cell / material.width) / (material.height - 1);
  const sampledCompaction = finiteOrZero(surface.sample(x, y));
  const retainedFootLoad = material._localFootLoad(x, y, Q.radiusRange[1]);
  const compactionUsed = hasFoundation ? sampledCompaction : 0;
  const footLoadUsed = hasFoundation ? retainedFootLoad : 0;
  const compactionValueMet = sampledCompaction >= Q.minimumCompaction;
  const footLoadValueMet = retainedFootLoad >= Q.minimumLocalFootLoad;
  const qualified = hasFoundation && compactionValueMet && footLoadValueMet;
  const maxNodulesReached = material.nodules.length >= material.maxNodules;
  return {
    cell, layerCount, buriedLayerCount, hasFoundation,
    topPlateId: layerCount ? material.plates[material.topLayerByCell[cell]]?.id ?? null : null,
    sampledCompaction, compactionUsed, retainedFootLoad, footLoadUsed,
    compactionValueMet, footLoadValueMet,
    meetsCompaction: hasFoundation && compactionValueMet,
    meetsFootLoad: hasFoundation && footLoadValueMet,
    qualified,
    productionEligible: qualified && !maxNodulesReached,
    nearbyExistingNodule: includeNearbyNodule
      ? material._nearExistingNodule(x, y, Q.radiusRange[1]) : null,
    maxNodulesReached
  };
}

async function main() {
  assert.equal(git(`merge-base ${BASELINE} HEAD`), BASELINE,
    'the verified production/evidence baseline must be an ancestor of the research commit');
  assert.equal(git('branch --show-current'), BRANCH, 'run on the dedicated Nodule research branch');
  assert.equal(git('diff --name-only ' + BASELINE + ' HEAD -- src package.json package-lock.json'), '');
  assert.equal(git('status --porcelain -- src package.json package-lock.json'), '',
    'working tree must not contain production changes');
  const outputArg = CLI.get('--output');
  assert.ok(typeof outputArg === 'string' && outputArg, 'pass --output=<fresh directory>');
  const replayArg = CLI.get('--natural-replay');
  assert.ok(typeof replayArg === 'string' && replayArg, 'pass --natural-replay=<isolated 600 s replay JSON>');
  const output = resolve(ROOT, outputArg);
  await mkdir(output, { recursive: true });
  assert.deepEqual(await readdir(output), [], 'output directory must be fresh and empty');
  const replayPath = resolve(ROOT, replayArg);
  const naturalReplay = JSON.parse(await readFile(replayPath, 'utf8'));
  const canonicalReplayPath = resolve(ROOT,
    'docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.json');
  const canonicalReplay = JSON.parse(await readFile(canonicalReplayPath, 'utf8'));
  assert.deepEqual(naturalReplay.results, canonicalReplay.results,
    'untouched 600 s natural replay must match the committed production baseline');

  const started = performance.now();
  const seeds = [];
  for (const seed of SEEDS) {
    const result = await runSeed(seed);
    seeds.push(result);
    await writeJson(output, `seed-${seed}.json`, result);
    console.log(JSON.stringify({ seed, naturalBirths: result.arms.natural.births.length,
      timerClearBirths: result.arms.timerClear.births.length,
      gapPlates: result.gapPlateDescriptors.length,
      wallSeconds: (performance.now() - started) / 1000 }));
  }
  const decision = classifyDecision(seeds);
  const manifest = {
    title: 'Zero-ant Nodule lineage and timer-clear audit',
    baseline: { commit: BASELINE, branch: git('branch --show-current'), head: git('rev-parse HEAD') },
    conditions: { seeds: SEEDS, hz: 60, naturalUntilSeconds: 400, zeroAntStartSeconds: 400,
      zeroAntEndSeconds: 460, zeroAntTicks: GAP_TICKS, productionMaterialLocomotion: 'default On', audioBridge: false },
    naturalReplay: { path: relativeToRoot(replayPath), sha256: await hashFile(replayPath), exactCanonicalMatch: true,
      canonicalPath: relativeToRoot(canonicalReplayPath), canonicalSha256: await hashFile(canonicalReplayPath) },
    productionLaw: { qualification: Q, persistenceMaximumSampleGapMs: 2000,
      timerField: 'MaterialStratigraphy.candidateSinceMs', clear: 'candidateSinceMs.fill(-1) only',
      addPlateTimerSemantics: 'addPlate resets candidateSinceMs[cell] to -1 for each covered cell before the same tick MaterialStratigraphy.advance()',
      advanceOrder: 'AntController.tick: TrailPlateBirth.advance -> MaterialStratigraphy.addPlate for births -> MaterialStratigraphy.advance -> sphere-birth events',
      surfaceField: { halfLifeSeconds: 1800, gapCompactionChange: 'relax only; no FOOT_CONTACT during the gap' },
      footLoad: 'MaterialStratigraphy.applyFootContact is the only source; retained footLoadByCell does not increase in the gap.' },
    observation: 'At each MaterialStratigraphy nodule evaluation boundary, qualification gates are recomputed read-only from the public layer-count snapshot, SurfaceField.sample(), and the exact production _localFootLoad() helper. candidateSinceMs and timers are read-only except for the single timer-clear arm. Full columns are read only for Nodule birth cells.',
    counterfactual: 'Matched fork after the 400 s removal/retirement flush. Only candidateSinceMs is filled with -1 in timerClear; no reset() and no other MaterialStratigraphy state is changed.',
    decision,
    productionSourceDiffFromBaseline: git('diff --name-only ' + BASELINE + ' HEAD -- src package.json package-lock.json'),
    sourceHashes: await sourceHashes(),
    results: seeds.map(seed => ({ seed: seed.seed, gapValidity: seed.validity,
      naturalLineages: countBy(seed.arms.natural.births, 'lineage'),
      timerClearLineages: countBy(seed.arms.timerClear.births, 'lineage'),
      naturalNoduleBirths: seed.arms.natural.births.length,
      timerClearNoduleBirths: seed.arms.timerClear.births.length,
      gapPlateBirths: seed.gapPlateDescriptors.length,
      plateEnabledQualificationCells: seed.arms.natural.plateEffects.qualificationEnabledCellCount })),
    reproduction: 'node docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs test-results/ant-nodule-lineage-natural-replay-20261013.json; node scripts/ant-zero-ant-nodule-lineage.js --natural-replay=test-results/ant-nodule-lineage-natural-replay-20261013.json --output=test-results/ant-zero-ant-nodule-lineage-20261013',
    wallSeconds: (performance.now() - started) / 1000
  };
  await writeJson(output, 'manifest.json', manifest);
  console.log(JSON.stringify({ complete: true, output: outputArg, decision, wallSeconds: manifest.wallSeconds }));
}

async function runSeed(seed) {
  const arms = ['natural', 'timerClear'].map(name => {
    const random = countedLcg(seed);
    const controller = new AntController({ random });
    return { name, random, controller };
  });
  for (const arm of arms) {
    await arm.controller.init();
    assert.equal(arm.controller.materialLocomotionResistance, true);
    assert.equal(arm.controller.audioBridge, null);
  }
  assert.deepEqual(controllerComparableState(arms[0].controller, arms[0].random),
    controllerComparableState(arms[1].controller, arms[1].random), 'paired controllers differ at tick 0');
  let prefixCheckpoints = 0;
  for (let tick = 0; tick < PREFIX_TICKS; tick += 1) {
    for (const arm of arms) arm.controller.tick(DT);
    if ((tick + 1) % 60 === 0) {
      assert.deepEqual(controllerComparableState(arms[0].controller, arms[0].random),
        controllerComparableState(arms[1].controller, arms[1].random), `paired prefix diverged at tick ${tick + 1}`);
      prefixCheckpoints += 1;
    }
  }
  assert.equal(prefixCheckpoints, 400);
  assert.ok(Math.abs(arms[0].controller.simulationTimeMs - GAP_START_MS) < 1e-5);

  const preRemoval = arms.map(({ controller }) => captureEntryState(controller));
  assert.deepEqual(preRemoval[0], preRemoval[1]);
  const interventions = arms.map(({ controller }) => beginZeroAntIntervention(controller));
  assert.deepEqual(interventionBrief(interventions[0]), interventionBrief(interventions[1]));
  arms.forEach(({ controller }) => assertZeroAntState(controller));
  assert.deepEqual(controllerComparableState(arms[0].controller, arms[0].random),
    controllerComparableState(arms[1].controller, arms[1].random), 'matched arms differ before timer clear');

  const entryState = arms.map(({ controller }) => captureGapEntry(controller));
  assert.deepEqual(entryState[0].nonTimerState, entryState[1].nonTimerState);
  assert.deepEqual(entryState[0].candidateSinceMs, entryState[1].candidateSinceMs);
  assert.deepEqual(entryState[0].qualifiedGatesByCell, entryState[1].qualifiedGatesByCell);
  const timerClear = clearCandidatePersistence(arms[1].controller.materialStratigraphy);
  timerClear.activeBeforeClear = entryState[1].activeCandidateTimers.length;
  assert.equal(timerClear.clearedCount, timerClear.activeBeforeClear,
    'timer-only intervention must clear every and only active persistence timer');
  timerClear.beforeTimerSha256 = hash(entryState[1].candidateSinceMs);
  timerClear.afterTimerSha256 = hash(arms[1].controller.materialStratigraphy.candidateSinceMs);
  timerClear.matchedNonTimerStateExact = true;
  timerClear.onlyCandidateSinceMsChanged = true;
  assertOnlyCandidateTimersDiffer(arms[0].controller, arms[1].controller, arms[0].random, arms[1].random);
  assert.deepEqual(captureGapEntry(arms[0].controller).nonTimerState,
    captureGapEntry(arms[1].controller).nonTimerState, 'timer clear changed retained non-timer state');
  assert.ok(arms[1].controller.materialStratigraphy.candidateSinceMs.every(value => value === -1));

  const trackers = arms.map(({ controller, random }, index) => createGapTracker(controller, random,
    index === 0 ? 'natural' : 'timerClear', entryState[index]));
  const watchers = arms.map(({ controller }) => watchGap(controller));
  const gapStartClock = arms[0].controller.simulationTimeMs;
  const rngAtEntry = arms.map(({ random }) => [random.state(), random.calls]);
  const countsAtEntry = arms.map(({ controller }) => [controller.totalSpawned, controller.totalRetired]);
  const contactsAtEntry = arms.map(({ controller }) => ({
    materialAccepted: controller.materialStratigraphy.totalAcceptedFootContacts,
    surface: controller.surfaceField.totalFootContacts,
    footLoadSha256: hash(controller.materialStratigraphy.footLoadByCell)
  }));

  for (let tick = 0; tick < GAP_TICKS; tick += 1) {
    for (let index = 0; index < arms.length; index += 1) {
      const { controller, random } = arms[index];
      assertZeroAntState(controller);
      watchers[index].clearTick();
      const clockBefore = controller.simulationTimeMs;
      controller.tick(DT);
      assert.equal(controller.agents.length, 0, `ant appeared in ${arms[index].name} gap at tick ${tick}`);
      assert.deepEqual([controller.totalSpawned, controller.totalRetired], countsAtEntry[index]);
      assert.ok(controller.simulationTimeMs > clockBefore);
      assert.deepEqual([random.state(), random.calls], rngAtEntry[index], 'RNG changed during zero-ant gap');
      assert.equal(watchers[index].spawnCalls, 0, 'spawn path called during zero-ant gap');
      assert.equal(watchers[index].depositCalls, 0, 'pheromone deposited during zero-ant gap');
      assert.equal(watchers[index].events.filter(([type]) => type === 'foot-contact').length, 0,
        'FOOT_CONTACT occurred during zero-ant gap');
      assert.deepEqual(watchers[index].events.filter(([type]) => type !== 'plate-birth' && type !== 'sphere-birth'), [],
        'ant-origin or unclassified event occurred during zero-ant gap');
      assertZeroAntState(controller);
      assert.equal(controller.materialStratigraphy.totalAcceptedFootContacts,
        contactsAtEntry[index].materialAccepted, 'material foot load source changed during gap');
      assert.equal(controller.surfaceField.totalFootContacts, contactsAtEntry[index].surface,
        'SurfaceField contact count changed during gap');
      assert.equal(hash(controller.materialStratigraphy.footLoadByCell), contactsAtEntry[index].footLoadSha256,
        'retained foot-load map changed during gap');
    }
  }

  const gapDelta = arms.map(({ controller }) => controller.simulationTimeMs - gapStartClock);
  assert.equal(GAP_TICKS, 3600);
  gapDelta.forEach(value => assert.ok(Math.abs(value - 60000) < 1e-5));
  arms.forEach(({ controller }) => assertZeroAntState(controller));
  trackers.forEach((tracker, index) => {
    assert.equal(tracker.boundaries.length, 60, 'expected one Nodule evaluation per simulated second');
    assert.equal(watchers[index].plateBirthEvents, tracker.gapPlateEvents.length,
      'every gap Plate birth event must have a matching MaterialStratigraphy addition');
    assert.equal(watchers[index].sphereBirthEvents, tracker.births.length,
      'every gap Nodule birth must match its controller sphere-birth event');
  });
  watchers.forEach((watcher, index) => watcher.restore(arms[index].controller));
  for (const tracker of trackers) tracker.restore();

  const results = arms.map((arm, index) => finalizeArm(arm.controller, arm.random, trackers[index], watchers[index]));
  assert.deepEqual(results[0].gapPlateDescriptors.map(plateComparable),
    results[1].gapPlateDescriptors.map(plateComparable), 'timer clear changed TrailPlateBirth Plate additions');
  const validity = {
    prefixCheckpoints: prefixCheckpoints + 1,
    pairedProductionValueDeepCompare: true,
    gapTicks: GAP_TICKS,
    gapClockDeltaMs: gapDelta,
    allTicksZeroAnt: true,
    noSpawn: watchers.every(value => value.spawnCalls === 0),
    noMovementOrPerAntState: true,
    noDeposition: watchers.every(value => value.depositCalls === 0),
    noFootContact: watchers.every(value => value.totalFootContactEvents === 0),
    noAntOriginOrUnknownEvents: watchers.every(value => value.totalUnexpectedEvents === 0),
    noRngConsumption: arms.every(({ random }, index) => random.state() === rngAtEntry[index][0]
      && random.calls === rngAtEntry[index][1]),
    retainedFootLoadUnchanged: contactsAtEntry.every((value, index) =>
      value.footLoadSha256 === hash(arms[index].controller.materialStratigraphy.footLoadByCell)),
    identicalGapPlateBirthsAcrossArms: true,
    timerClear: { ...timerClear, changedOnlyCandidateSinceMs: true }
  };
  const enriched = results.map(result => enrichArmBirths(result));
  const decisionInput = { seed, validity, gapPlateDescriptors: enriched[0].gapPlateDescriptors,
    arms: { natural: enriched[0].arm, timerClear: enriched[1].arm } };
  for (const { controller } of arms) await controller.destroy();
  return decisionInput;
}

function createGapTracker(controller, random, arm, entryState) {
  const material = controller.materialStratigraphy;
  const tracker = {
    arm, gapStartTimeMs: entryState.nonTimerState.clockMs,
    boundaries: [], births: [], timerStartStats: { total: 0, previouslyQualifiedAtGapEntry: 0,
      newlyQualifiedAtGapEntry: 0, afterGapPlateAtCell: 0 },
    cellQualificationTransitions: new Map(),
    candidateTimelineByCell: new Map(), cellTimerEvents: new Map(), gapPlateEvents: [], plateInteractionsByCell: new Map(),
    qualificationEnabledTransitions: [], entryQualifiedGatesByCell: entryState.qualifiedGatesByCell,
    originalEntryTimers: Float64Array.from(entryState.candidateSinceMs),
    entryQualifiedFlags: entryState.qualifiedFlags.slice(),
    previousQualifiedAtEntry: entryState.qualifiedFlags.slice(),
    previousQualified: entryState.qualifiedFlags.slice(), previousEvaluationTimeMs: material.lastNoduleEvaluationTimeMs,
    rngStateAtEntry: random.state(), rngCallsAtEntry: random.calls,
    plateEffects: { count: 0, coveredCells: 0, timerResetCellCount: 0,
      foundationThresholdCrossingCount: 0, qualificationEnabledCellCount: 0 },
    originalAdvance: material.advance, originalAddPlate: material.addPlate
  };
  material.addPlate = function (descriptor) {
    return observePlateAddition(tracker, controller, random, descriptor);
  };
  material.advance = function (args) { return observeNoduleAdvance(tracker, controller, random, args); };
  tracker.restore = () => {
    material.advance = tracker.originalAdvance;
    material.addPlate = tracker.originalAddPlate;
  };
  return tracker;
}

function observePlateAddition(tracker, controller, random, descriptor) {
  const material = controller.materialStratigraphy;
  const mask = descriptor.mask;
  const beforeSnapshot = material.getSnapshot().stratigraphy;
  const layerCountsBefore = beforeSnapshot.layerCountByCell;
  const topBefore = beforeSnapshot.topLayerByCell;
  const before = [];
  for (let cell = 0; cell < material.cellCount; cell += 1) {
    if (mask[cell] !== 1) continue;
    const layerCount = layerCountsBefore[cell] || 0;
    const timerBefore = material.candidateSinceMs[cell];
    before.push({ cell, layerCount, timerBefore, topPlateIndex: topBefore[cell],
      gates: qualificationAtCell(material, controller.surfaceField, cell, layerCountsBefore) });
  }
  const result = tracker.originalAddPlate.call(material, descriptor);
  if (!result) return result;
  const afterSnapshot = material.getSnapshot().stratigraphy;
  const layerCountsAfter = afterSnapshot.layerCountByCell;
  const topAfter = afterSnapshot.topLayerByCell;
  const stateAfterBirth = controllerStateHash(controller, random);
  const event = { id: descriptor.id, bornAtSimulationTimeMs: descriptor.bornAtSimulationTimeMs,
    sourceDescriptor: descriptor,
    descriptorSha256: createHash('sha256').update(JSON.stringify({ ...descriptor, mask: Array.from(mask) })).digest('hex'),
    maskSha256: hash(mask), coveredCellCount: mask.reduce((sum, value) => sum + Number(value === 1), 0),
    timerResetCellCount: 0, foundationThresholdCrossingCount: 0,
    qualificationEnabledCellCount: 0, mask };
  tracker.gapPlateEvents.push(event);
  tracker.plateEffects.count += 1;
  tracker.plateEffects.coveredCells += event.coveredCellCount;
  before.forEach(item => {
    const afterLayerCount = layerCountsAfter[item.cell] || 0;
    const timerAfter = material.candidateSinceMs[item.cell];
    const afterGates = qualificationAtCell(material, controller.surfaceField, item.cell, layerCountsAfter);
    const reset = item.timerBefore >= 0 && timerAfter < 0;
    const foundationCrossed = !item.gates.hasFoundation && afterGates.hasFoundation;
    const enabled = !item.gates.qualified && afterGates.qualified;
    if (reset) { event.timerResetCellCount += 1; tracker.plateEffects.timerResetCellCount += 1; }
    if (foundationCrossed) {
      event.foundationThresholdCrossingCount += 1;
      tracker.plateEffects.foundationThresholdCrossingCount += 1;
    }
    if (enabled) {
      event.qualificationEnabledCellCount += 1;
      tracker.plateEffects.qualificationEnabledCellCount += 1;
    }
    const row = { plateId: descriptor.id, timeMs: descriptor.bornAtSimulationTimeMs, cell: item.cell,
      timerBeforeMs: item.timerBefore >= 0 ? item.timerBefore : null, timerAfterMs: timerAfter >= 0 ? timerAfter : null,
      timerReset: reset, layerCountBefore: item.layerCount, layerCountAfter: afterLayerCount,
      topPlateIdBefore: item.topPlateIndex >= 0 ? material.plates[item.topPlateIndex]?.id ?? null : null,
      topPlateIdAfter: topAfter[item.cell] >= 0 ? material.plates[topAfter[item.cell]]?.id ?? null : null,
      foundationBefore: item.gates.hasFoundation, foundationAfter: afterGates.hasFoundation,
      qualifiedBefore: item.gates.qualified, qualifiedAfter: afterGates.qualified,
      compactionThresholdMetBefore: item.gates.meetsCompaction,
      footLoadThresholdMetBefore: item.gates.meetsFootLoad,
      compactionThresholdMetAfter: afterGates.meetsCompaction,
      footLoadThresholdMetAfter: afterGates.meetsFootLoad,
      sampledCompactionBefore: item.gates.sampledCompaction,
      sampledCompactionAfter: afterGates.sampledCompaction,
      compactionValueMetBefore: item.gates.compactionValueMet,
      compactionValueMetAfter: afterGates.compactionValueMet,
      retainedFootLoadBefore: item.gates.retainedFootLoad,
      retainedFootLoadAfter: afterGates.retainedFootLoad,
      footLoadValueMetBefore: item.gates.footLoadValueMet,
      footLoadValueMetAfter: afterGates.footLoadValueMet,
      sampledCompaction: afterGates.sampledCompaction, retainedFootLoad: afterGates.retainedFootLoad,
      localFootLoadUsedBefore: item.gates.footLoadUsed, localFootLoadUsedAfter: afterGates.footLoadUsed };
    if (enabled) tracker.qualificationEnabledTransitions.push(row);
    const history = tracker.plateInteractionsByCell.get(item.cell) || [];
    history.push(row);
    tracker.plateInteractionsByCell.set(item.cell, history);
  });
  assert.equal(controllerStateHash(controller, random), stateAfterBirth,
    'read-only Plate-addition observer changed state beyond production addPlate');
  return result;
}

function observeNoduleAdvance(tracker, controller, random, args) {
  const material = controller.materialStratigraphy;
  const beforeEvaluation = material.lastNoduleEvaluationTimeMs;
  const nowMs = args.simulationTimeMs;
  const due = beforeEvaluation === null
    || nowMs - beforeEvaluation >= Q.minimumSampleIntervalMs;
  const timersBefore = due ? material.candidateSinceMs.slice() : null;
  const nodulesBefore = due ? material.nodules.slice() : null;
  const born = tracker.originalAdvance.call(material, args);
  const evaluated = material.lastNoduleEvaluationTimeMs !== beforeEvaluation;
  if (!evaluated) return born;
  assert.ok(timersBefore && nodulesBefore);
  const productionStateHash = controllerStateHash(controller, random);
  const boundary = observeEvaluationBoundary(tracker, controller, args, timersBefore, born, nodulesBefore);
  tracker.boundaries.push(boundary.summary);
  tracker.births.push(...boundary.births);
  tracker.previousQualified = boundary.qualifiedFlags;
  tracker.previousEvaluationTimeMs = material.lastNoduleEvaluationTimeMs;
  assert.equal(controllerStateHash(controller, random), productionStateHash,
    'read-only Nodule boundary observer changed state beyond production advance');
  return born;
}

function observeEvaluationBoundary(tracker, controller, args, timersBefore, born, nodulesBefore) {
  const material = controller.materialStratigraphy;
  const surface = controller.surfaceField;
  const nowMs = args.simulationTimeMs;
  const layerCounts = material.getSnapshot().stratigraphy.layerCountByCell;
  const qualifiedFlags = new Uint8Array(material.cellCount);
  const timerStarts = [], timerResets = [], qualificationTransitions = [];
  let timerStartsPreviouslyQualifiedAtEntry = 0, timerStartsNewlyQualifiedAtEntry = 0;
  let timerStartsAfterGapPlateAtCell = 0;
  const birthCells = new Set(born.map(nodule => cellFromPosition(material, nodule.position)));
  let qualifiedCount = 0, productionEligibleCount = 0, activeTimerCount = 0;
  for (let cell = 0; cell < material.cellCount; cell += 1) {
    const gates = qualificationAtCell(material, surface, cell, layerCounts);
    const qualified = gates.productionEligible;
    if (gates.qualified) qualifiedCount += 1;
    if (qualified) { qualifiedFlags[cell] = 1; productionEligibleCount += 1; }
    const timerBeforeMs = timersBefore[cell];
    const timerAfterMs = material.candidateSinceMs[cell];
    const wasQualified = tracker.previousQualified[cell] === 1;
    if (wasQualified !== qualified) {
      const transition = { cell, timeMs: nowMs, fromQualified: wasQualified, toQualified: qualified, ...gates,
        plateEventsSinceGapEntry: coveringPlateEvents(tracker, cell, nowMs) };
      qualificationTransitions.push(transition);
      const history = tracker.cellQualificationTransitions.get(cell) || [];
      history.push(transition);
      tracker.cellQualificationTransitions.set(cell, history);
    }
    if (timerBeforeMs < 0 && timerAfterMs >= 0) {
      const start = { cell, startedAtMs: timerAfterMs, timeMs: nowMs,
        qualificationAtStart: gates, previouslyQualifiedAtGapEntry: tracker.previousQualifiedAtEntry?.[cell] === 1,
        timerClearArm: tracker.arm === 'timerClear',
        plateInteractionsBeforeStart: (tracker.plateInteractionsByCell.get(cell) || [])
          .filter(event => event.timeMs <= timerAfterMs),
        gapBornPlateIdsCoveringCellAtStart: coveringPlateEvents(tracker, cell, timerAfterMs).map(event => event.id) };
      timerStarts.push(start);
      tracker.timerStartStats.total += 1;
      if (start.previouslyQualifiedAtGapEntry) {
        timerStartsPreviouslyQualifiedAtEntry += 1;
        tracker.timerStartStats.previouslyQualifiedAtGapEntry += 1;
      } else {
        timerStartsNewlyQualifiedAtEntry += 1;
        tracker.timerStartStats.newlyQualifiedAtGapEntry += 1;
      }
      if (start.plateInteractionsBeforeStart.length) {
        timerStartsAfterGapPlateAtCell += 1;
        tracker.timerStartStats.afterGapPlateAtCell += 1;
      }
      const events = tracker.cellTimerEvents.get(cell) || [];
      events.push({ type: 'start', ...start });
      tracker.cellTimerEvents.set(cell, events);
    }
    if (timerBeforeMs >= 0 && timerAfterMs < 0) {
      const reason = birthCells.has(cell) ? 'nodule-birth'
        : material.nodules.length >= material.maxNodules ? 'maximum-nodule-count'
          : !qualified ? 'qualification-lost'
            : nowMs - timerBeforeMs >= Q.persistenceMs
              && material._nearExistingNodule((cell % material.width) / (material.width - 1),
                Math.floor(cell / material.width) / (material.height - 1), Q.radiusRange[1])
                ? 'nearby-existing-nodule' : 'other-production-reset';
      const reset = { cell, timeMs: nowMs, timerBeforeMs, reason,
        qualification: gates, gapBornPlateIdsCoveringCell: coveringPlateEvents(tracker, cell, nowMs).map(event => event.id) };
      timerResets.push(reset);
      const events = tracker.cellTimerEvents.get(cell) || [];
      events.push({ type: 'reset', ...reset });
      tracker.cellTimerEvents.set(cell, events);
    }
    if (timerAfterMs >= 0) {
      activeTimerCount += 1;
      if (tracker.originalEntryTimers[cell] >= 0 || tracker.cellTimerEvents.has(cell)
        || tracker.plateInteractionsByCell.has(cell)) {
        const row = { timeMs: nowMs, startedAtMs: timerAfterMs, persistenceAgeMs: nowMs - timerAfterMs,
        qualified: gates.qualified, productionEligible: gates.productionEligible,
        hasFoundation: gates.hasFoundation, layerCount: gates.layerCount,
        buriedLayerCount: gates.buriedLayerCount, topPlateId: gates.topPlateId,
        compactionUsed: gates.compactionUsed, sampledCompaction: gates.sampledCompaction,
        footLoadUsed: gates.footLoadUsed, retainedFootLoad: gates.retainedFootLoad,
        nearbyExistingNodule: gates.nearbyExistingNodule, maxNodulesReached: gates.maxNodulesReached };
        const series = tracker.candidateTimelineByCell.get(cell) || [];
        series.push(row);
        tracker.candidateTimelineByCell.set(cell, series);
      }
    }
  }
  if (nodulesBefore.length + born.length < material.maxNodules) {
    assert.equal(material.qualifiedNoduleCandidateCount, qualifiedCount,
      'read-only qualification gates must match MaterialStratigraphy candidate count');
  }

  const birthRows = born.map((nodule, index) => {
    const cell = cellFromPosition(material, nodule.position);
    const candidateSinceAtBirthMs = timersBefore[cell];
    const gate = qualificationAtCell(material, surface, cell, layerCounts);
    const precedingNodules = [...nodulesBefore, ...born.slice(0, index)];
    const nearbyExistingNoduleIds = precedingNodules.filter(existing =>
      Math.hypot(existing.position.x - nodule.position.x, existing.position.y - nodule.position.y)
        < (existing.radius + Q.radiusRange[1])).map(existing => existing.id);
    const column = material.getColumnAt(nodule.position.x, nodule.position.y);
    const birthTimeMs = nodule.bornAtSimulationTimeMs;
    const timerEvents = tracker.cellTimerEvents.get(cell) || [];
    const startEvents = timerEvents.filter(event => event.type === 'start' && event.timeMs <= birthTimeMs);
    const timerStartedAtMs = candidateSinceAtBirthMs;
    const relevantPlateEffects = tracker.plateInteractionsByCell.get(cell) || [];
    const plateChangeBeforeTimerStart = relevantPlateEffects.some(event => event.timeMs <= timerStartedAtMs
      && (event.timerReset || event.foundationBefore !== event.foundationAfter
        || event.layerCountBefore !== event.layerCountAfter));
    return {
      id: nodule.id, cell, bornAtSimulationTimeMs: birthTimeMs,
      candidateSinceMsAtBirth: candidateSinceAtBirthMs,
      persistenceAgeMs: birthTimeMs - candidateSinceAtBirthMs,
      gateAtGapEntry: tracker.entryQualifiedGatesByCell[cell] ?? null,
      gateAtBirth: { qualified: gate.qualified,
        hasFoundation: gate.hasFoundation,
        layerCount: gate.layerCount, buriedLayerCount: gate.buriedLayerCount,
        topPlateId: column.at(-1)?.id ?? null, plateIdsBottomToTop: column.map(layer => layer.id),
        compactionUsed: nodule.support.compaction, retainedFootLoadUsed: nodule.support.localFootLoad,
        compactionThresholdMet: nodule.support.compaction >= Q.minimumCompaction,
        footLoadThresholdMet: nodule.support.localFootLoad >= Q.minimumLocalFootLoad,
        productionEligible: gate.qualified && precedingNodules.length < material.maxNodules,
        nearbyExistingNodule: nearbyExistingNoduleIds.length > 0,
        nearbyExistingNoduleIds, nearbyNoduleGatePassed: nearbyExistingNoduleIds.length === 0,
        maxNodulesGatePassed: precedingNodules.length < material.maxNodules },
      candidateStartAtBirth: startEvents.at(-1)?.startedAtMs ?? null,
      preGapCandidateTimerAtEntry: tracker.originalEntryTimers[cell] >= 0
        ? tracker.originalEntryTimers[cell] : null,
      qualifiedAtGapEntry: tracker.entryQualifiedFlags[cell] === 1,
      gapPlateEffectsAtCell: [...(tracker.plateInteractionsByCell.get(cell) || [])],
      gapBornPlatesCoveringCell: coveringPlateEvents(tracker, cell, birthTimeMs)
        .map(event => ({ id: event.id, bornAtSimulationTimeMs: event.bornAtSimulationTimeMs,
          beforeBirth: event.bornAtSimulationTimeMs <= birthTimeMs,
          timerResetAtCell: (tracker.plateInteractionsByCell.get(cell) || []).some(effect =>
            effect.plateId === event.id && effect.timerReset),
          foundationCrossedAtCell: (tracker.plateInteractionsByCell.get(cell) || []).some(effect =>
            effect.plateId === event.id && effect.foundationBefore !== effect.foundationAfter),
          qualificationEnabledAtCell: (tracker.plateInteractionsByCell.get(cell) || []).some(effect =>
            effect.plateId === event.id && effect.qualifiedBefore === false && effect.qualifiedAfter === true) })),
      lineage: classifyNoduleLineage({ entryTimerMs: tracker.originalEntryTimers[cell],
        birthTimerMs: candidateSinceAtBirthMs, timerClearApplied: tracker.arm === 'timerClear',
        plateChangeBeforeTimerStart }),
      descriptorSha256: hash(nodule)
    };
  });
  const boundary = {
    timeMs: nowMs, materialLastAdvanceTimeMs: material.lastAdvanceTimeMs,
    noduleCount: material.nodules.length, plateCount: material.plates.length,
    maxNodulesReached: material.nodules.length >= material.maxNodules,
    qualifiedNoduleCandidateCount: material.qualifiedNoduleCandidateCount,
    diagnosticQualifiedCellCount: qualifiedCount, productionEligibleCellCount: productionEligibleCount,
    activeTimerCount, recordedActiveTimerCount: [...tracker.candidateTimelineByCell.values()]
      .filter(rows => rows.at(-1)?.timeMs === nowMs).length,
    timerStartCount: timerStarts.length, timerResetCount: timerResets.length,
    qualificationTransitionCount: qualificationTransitions.length,
    qualificationEnabledCount: qualificationTransitions.filter(row => row.toQualified).length,
    qualificationLostCount: qualificationTransitions.filter(row => !row.toQualified).length,
    timerStartsPreviouslyQualifiedAtEntry, timerStartsNewlyQualifiedAtEntry,
    timerStartsAfterGapPlateAtCell
  };
  return { summary: boundary, births: birthRows, timerStarts, timerResets,
    qualificationTransitions, qualifiedFlags };
}

function createEntryQualificationFlags(material, surface) {
  const layerCounts = material.getSnapshot().stratigraphy.layerCountByCell;
  const flags = new Uint8Array(material.cellCount);
  const gatesByCell = {};
  let qualifiedCount = 0;
  for (let cell = 0; cell < material.cellCount; cell += 1) {
    const gates = qualificationAtCell(material, surface, cell, layerCounts);
    if (gates.productionEligible) {
      flags[cell] = 1;
      qualifiedCount += 1;
      gatesByCell[cell] = gates;
    }
  }
  return { flags, qualifiedCount, gatesByCell };
}

function captureEntryState(controller) {
  const material = controller.materialStratigraphy;
  return {
    timeMs: controller.simulationTimeMs,
    candidateSinceMs: [...material.candidateSinceMs],
    activeCandidateTimers: [...material.candidateSinceMs]
      .flatMap((value, cell) => value >= 0 ? [{ cell, candidateSinceMs: value }] : []),
    material: { plateIds: material.plates.map(plate => plate.id), noduleIds: material.nodules.map(nodule => nodule.id),
      layerCounts: hash(material.getSnapshot().stratigraphy.layerCountByCell),
      topLayer: hash(material.getSnapshot().stratigraphy.topLayerByCell),
      footLoad: hash(material.footLoadByCell), noduleRevision: material.noduleRevision,
      lastAdvanceTimeMs: material.lastAdvanceTimeMs, lastNoduleEvaluationTimeMs: material.lastNoduleEvaluationTimeMs },
    surfaceCompaction: hash(controller.surfaceField.values),
    pheromone: hash(controller.field.values),
    clockMs: controller.simulationTimeMs
  };
}

function captureGapEntry(controller) {
  const material = controller.materialStratigraphy;
  const stratigraphy = material.getSnapshot().stratigraphy;
  const { flags, qualifiedCount, gatesByCell } = createEntryQualificationFlags(material, controller.surfaceField);
  return {
    candidateSinceMs: [...material.candidateSinceMs],
    activeCandidateTimers: [...material.candidateSinceMs]
      .flatMap((value, cell) => value >= 0 ? [{ cell, candidateSinceMs: value }] : []),
    qualifiedFlags: flags, qualifiedGatesByCell: gatesByCell,
    nonTimerState: {
      clockMs: controller.simulationTimeMs,
      plateIds: material.plates.map(plate => plate.id),
      noduleIds: material.nodules.map(nodule => nodule.id),
      layerCountsSha256: hash(stratigraphy.layerCountByCell),
      topLayerSha256: hash(stratigraphy.topLayerByCell),
      plateDescriptorsSha256: hash(material.plates),
      noduleDescriptorsSha256: hash(material.nodules),
      footLoadSha256: hash(material.footLoadByCell),
      surfaceFieldSha256: hash(controller.surfaceField.values),
      surfaceFootContacts: controller.surfaceField.totalFootContacts,
      pheromoneSha256: hash(controller.field.values),
      trailPlateBirth: controller.trailPlateBirth,
      lastAdvanceTimeMs: material.lastAdvanceTimeMs,
      lastNoduleEvaluationTimeMs: material.lastNoduleEvaluationTimeMs,
      qualifiedNoduleCandidateCount: material.qualifiedNoduleCandidateCount,
      qualifiedCellCount: qualifiedCount,
      rng: null
    },
  };
}

function finalizeArm(controller, random, tracker, watcher) {
  const material = controller.materialStratigraphy;
  const birthCells = new Set(tracker.births.map(birth => birth.cell));
  const candidateTimelines = Object.fromEntries([...tracker.candidateTimelineByCell]
    .filter(([cell]) => birthCells.has(cell)).map(([cell, rows]) => [cell, rows]));
  const timerEvents = Object.fromEntries([...tracker.cellTimerEvents]
    .filter(([cell]) => birthCells.has(cell)).map(([cell, rows]) => [cell, rows]));
  const qualificationTransitions = Object.fromEntries([...tracker.cellQualificationTransitions]
    .filter(([cell]) => birthCells.has(cell)).map(([cell, rows]) => [cell, rows]));
  const gapPlateDescriptors = tracker.gapPlateEvents.map(({ mask, sourceDescriptor, ...plate }) => plate);
  const result = {
    arm: tracker.arm,
    gapStartTimeMs: tracker.gapStartTimeMs,
    gapClockEndMs: controller.simulationTimeMs,
    evaluationBoundaries: tracker.boundaries,
    timerStartStats: tracker.timerStartStats,
    qualificationTransitionsForBirthCells: qualificationTransitions,
    candidateTimelinesForBirthCells: candidateTimelines,
    timerEventsForBirthCells: timerEvents,
    qualificationEnabledTransitions: tracker.qualificationEnabledTransitions,
    plateEffects: tracker.plateEffects,
    gapPlateDescriptors,
    births: tracker.births,
    gapValidity: { spawnCalls: watcher.spawnCalls, depositCalls: watcher.depositCalls,
      totalEvents: watcher.totalEvents, footContactEvents: watcher.totalFootContactEvents,
      unexpectedEvents: watcher.totalUnexpectedEvents,
      allTicksZeroAnt: true, rngUnchanged: random.calls === tracker.rngCallsAtEntry
        && random.state() === tracker.rngStateAtEntry }
  };
  return { arm: result, births: tracker.births, gapPlateDescriptors: tracker.gapPlateEvents };
}

function enrichArmBirths(result) {
  const plateEvents = result.gapPlateDescriptors;
  const arm = { ...result.arm, births: result.arm.births.map(birth => {
    const platesAtBirth = coveringPlateEventsFrom(plateEvents, birth.cell)
      .filter(event => event.bornAtSimulationTimeMs <= birth.bornAtSimulationTimeMs);
    assert.ok(platesAtBirth.every(event => event.bornAtSimulationTimeMs <= birth.bornAtSimulationTimeMs),
      'Nodule birth ledger must not include future Plate additions');
    return {
    ...birth,
    gapBornPlatesCoveringCell: platesAtBirth
      .map(event => ({ id: event.id, bornAtSimulationTimeMs: event.bornAtSimulationTimeMs,
        beforeBirth: event.bornAtSimulationTimeMs <= birth.bornAtSimulationTimeMs,
        timerResetAtCell: birth.gapPlateEffectsAtCell.some(effect => effect.plateId === event.id && effect.timerReset),
        foundationCrossedAtCell: birth.gapPlateEffectsAtCell.some(effect => effect.plateId === event.id
          && effect.foundationBefore !== effect.foundationAfter),
        qualificationEnabledAtCell: birth.gapPlateEffectsAtCell.some(effect => effect.plateId === event.id
          && !effect.qualifiedBefore && effect.qualifiedAfter) }))
    };
  }) };
  return { arm, gapPlateDescriptors: result.arm.gapPlateDescriptors };
}

function coveringPlateEvents(tracker, cell, timeMs) {
  return coveringPlateEventsFrom(tracker.gapPlateEvents, cell)
    .filter(event => event.bornAtSimulationTimeMs <= timeMs)
    .map(({ mask, ...event }) => event);
}

function coveringPlateEventsFrom(events, cell) {
  return events.filter(event => event.mask[cell] === 1);
}

function classifyDecision(seeds) {
  const natural = seeds.flatMap(seed => seed.arms.natural.births);
  const cleared = seeds.flatMap(seed => seed.arms.timerClear.births);
  const validShadow = seeds.every(seed => seed.validity.allTicksZeroAnt && seed.validity.noSpawn
    && seed.validity.noMovementOrPerAntState && seed.validity.noDeposition
    && seed.validity.noFootContact && seed.validity.noAntOriginOrUnknownEvents
    && seed.validity.noRngConsumption && seed.validity.retainedFootLoadUnchanged
    && seed.validity.identicalGapPlateBirthsAcrossArms
    && seed.validity.timerClear.onlyCandidateSinceMsChanged);
  const naturalPre = natural.some(birth => birth.lineage === 'PRE-GAP TIMER LINEAGE');
  const anyAmbiguous = [...natural, ...cleared].some(birth => birth.lineage === 'AMBIGUOUS');
  const naturalNonPre = natural.some(birth => birth.lineage !== 'PRE-GAP TIMER LINEAGE');
  const clearValid = cleared.every(birth => birth.lineage !== 'AMBIGUOUS'
    && birth.gateAtBirth.qualified && birth.persistenceAgeMs >= Q.persistenceMs
    && birth.gateAtBirth.nearbyNoduleGatePassed && birth.gateAtBirth.maxNodulesGatePassed);
  const clearMechanisms = new Set(cleared.map(birth => birth.lineage));
  const mixedClearPaths = clearMechanisms.has('RESET/STACK-CHANGED LINEAGE')
    && clearMechanisms.has('POST-GAP TIMER LINEAGE');
  if (!validShadow || anyAmbiguous) return 'INCONCLUSIVE';
  if (naturalPre && naturalNonPre || mixedClearPaths) return 'MIXED';
  if (cleared.length > 0 && clearValid) return 'RETAINED QUALIFICATION REGENERATES NODULES';
  if (natural.length > 0 && natural.every(birth => birth.lineage === 'PRE-GAP TIMER LINEAGE')
    && cleared.length === 0) return 'LATENT COMPLETION ONLY';
  return 'INCONCLUSIVE';
}

function assertOnlyCandidateTimersDiffer(natural, cleared, randomNatural, randomCleared) {
  const left = controllerComparableState(natural, randomNatural);
  const right = controllerComparableState(cleared, randomCleared);
  const leftTimers = left.materialStratigraphy.candidateSinceMs;
  const rightTimers = right.materialStratigraphy.candidateSinceMs;
  delete left.materialStratigraphy.candidateSinceMs;
  delete right.materialStratigraphy.candidateSinceMs;
  assert.deepEqual(left, right, 'timer-clear arm changed state other than candidateSinceMs');
  assert.ok(rightTimers.every(value => value === -1));
}

function controllerComparableState(controller, random) {
  const value = { ...controller, listeners: null, random: { state: random.state(), calls: random.calls },
    fieldFactory: null, audioBridge: null };
  if (Object.hasOwn(value, 'spawnNextAnt')) delete value.spawnNextAnt;
  value.field = { ...controller.field };
  delete value.field.depositPoint;
  delete value.field.depositSegment;
  value.materialStratigraphy = { ...controller.materialStratigraphy };
  delete value.materialStratigraphy.advance;
  delete value.materialStratigraphy.addPlate;
  return value;
}

function controllerStateHash(controller, random) {
  return createHash('sha256').update(serialize(controllerComparableState(controller, random))).digest('hex');
}

function watchGap(controller) {
  const result = { events: [], spawnCalls: 0, depositCalls: 0, totalEvents: 0,
    totalFootContactEvents: 0, totalUnexpectedEvents: 0, plateBirthEvents: 0, sphereBirthEvents: 0 };
  const allowedEvents = new Set(['plate-birth', 'sphere-birth']);
  const unsubscribe = controller.subscribe(event => {
    result.events.push([event.type, event.payload]);
    result.totalEvents += 1;
    if (event.type === 'foot-contact') result.totalFootContactEvents += 1;
    if (event.type === 'plate-birth') result.plateBirthEvents += 1;
    if (event.type === 'sphere-birth') result.sphereBirthEvents += 1;
    if (!allowedEvents.has(event.type)) result.totalUnexpectedEvents += 1;
  });
  const originalSpawn = controller.spawnNextAnt;
  controller.spawnNextAnt = function (...args) { result.spawnCalls += 1; return originalSpawn.apply(this, args); };
  const field = controller.field;
  const pointDescriptor = Object.getOwnPropertyDescriptor(field, 'depositPoint');
  const segmentDescriptor = Object.getOwnPropertyDescriptor(field, 'depositSegment');
  const originalPoint = field.depositPoint, originalSegment = field.depositSegment;
  field.depositPoint = function (...args) { result.depositCalls += 1; return originalPoint.apply(this, args); };
  field.depositSegment = function (...args) { result.depositCalls += 1; return originalSegment.apply(this, args); };
  result.clearTick = () => { result.events = []; };
  result.restore = target => {
    unsubscribe?.();
    delete target.spawnNextAnt;
    restoreMethod(field, 'depositPoint', pointDescriptor);
    restoreMethod(field, 'depositSegment', segmentDescriptor);
  };
  return result;
}

function assertZeroAntState(controller) {
  assert.equal(controller.agents.length, 0);
  assert.equal(controller.gaitController.ants.size, 0);
  assert.equal(controller.bodyPoseController.ants.size, 0);
  assert.equal(controller.gasterDeposition.ants.size, 0);
}

function interventionBrief(value) {
  return { removedIds: value.removedIds, pendingDoseBeforeRemoval: value.pendingDoseBeforeRemoval,
    flushedDeposits: value.flushedDeposits, flushedDose: value.flushedDose,
    totalRetiredAfterIntervention: value.totalRetiredAfterIntervention };
}

function cellFromPosition(material, position) {
  const column = Math.round(position.x * (material.width - 1));
  const row = Math.round(position.y * (material.height - 1));
  return row * material.width + column;
}

function countBy(values, key) {
  return Object.fromEntries([...values.reduce((counts, value) => counts.set(value[key],
    (counts.get(value[key]) || 0) + 1), new Map())].sort(([a], [b]) => String(a).localeCompare(String(b))));
}

function plateComparable(plate) {
  return { ...plate.sourceDescriptor, mask: Array.from(plate.sourceDescriptor.mask) };
}

function finiteOrZero(value) { return Number.isFinite(value) ? value : 0; }
function restoreMethod(target, name, descriptor) {
  if (descriptor) Object.defineProperty(target, name, descriptor);
  else delete target[name];
}
function countedLcg(seed) {
  let state = seed >>> 0, calls = 0;
  const random = () => { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  random.state = () => state;
  Object.defineProperty(random, 'calls', { get: () => calls });
  return random;
}
function hash(value) { return createHash('sha256').update(serialize(value)).digest('hex'); }
async function hashFile(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
async function writeJson(directory, name, value) {
  await writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
function relativeToRoot(path) { return path.replace(ROOT + '\\', '').replaceAll('\\', '/'); }
function git(args) { return execFileSync('git', args.split(' '), { cwd: ROOT, encoding: 'utf8' }).trim(); }
async function sourceHashes() {
  const paths = [...PRODUCTION_PATHS, 'scripts/ant-zero-ant-continuity-shadow.js',
    'scripts/ant-zero-ant-nodule-lineage.js',
    'docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs'];
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, await hashFile(resolve(ROOT, path))])));
}
