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
const BASELINE = 'b14de91b91db5e818a8128090e7c442259ddd257';
const BRANCH = 'research/ant-zero-ant-nodule-instrumentation-20261013';
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

export function coverageCellsFromMask(mask) {
  assert.ok(Array.isArray(mask) || ArrayBuffer.isView(mask), 'plate mask must be an indexed sequence');
  const cells = [];
  for (let cell = 0; cell < mask.length; cell += 1) {
    assert.ok(mask[cell] === 0 || mask[cell] === 1, 'plate mask must contain only zero and one');
    if (mask[cell] === 1) cells.push(cell);
  }
  return cells;
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

export function classifyTargetHistory(events, finalState) {
  if (events.some(event => event.type === 'NODULE_BIRTH')) return 'NODULE BIRTH';
  const interruptions = events.filter(event => ['BLOCKED_BY_NEARBY_NODULE', 'BLOCKED_BY_MAX_COUNT',
    'TIMER_CLEARED_QUALIFICATION_LOST', 'TIMER_RESET_BY_PLATE', 'TIMER_RESET_OTHER'].includes(event.type))
    .sort((a, b) => a.timeMs - b.timeMs);
  const latestTimerStart = [...events].reverse().find(event => event.type === 'TIMER_STARTED'
    && event.candidateSinceMs === finalState.candidateSinceMs);
  const latestInterruptionBeforeFinalTimer = latestTimerStart
    ? [...interruptions].reverse().find(event => event.timeMs <= latestTimerStart.timeMs) : null;
  const lastInterruption = interruptions.at(-1);
  const finalCause = finalState.candidateSinceMs >= 0 ? latestInterruptionBeforeFinalTimer : lastInterruption;
  const persistenceAgeMs = finalState.persistenceAgeMs ?? finalState.timerAgeMs;
  if (finalState.qualified && finalState.candidateSinceMs >= 0
    && persistenceAgeMs < Q.persistenceMs) {
    return finalCause?.type === 'TIMER_RESET_BY_PLATE' ? 'PLATE-RESET CENSORED' : 'RIGHT-CENSORED';
  }
  if (finalCause?.type === 'BLOCKED_BY_MAX_COUNT') return 'MAX-COUNT BLOCKED';
  if (finalCause?.type === 'BLOCKED_BY_NEARBY_NODULE') return 'NEARBY-NODULE BLOCKED';
  if (finalCause?.type === 'TIMER_CLEARED_QUALIFICATION_LOST') {
    return `QUALIFICATION LOST - ${finalCause.failedGates.join(', ').toUpperCase()}`;
  }
  if (finalCause?.type === 'TIMER_RESET_BY_PLATE') return 'PLATE-RESET CENSORED';
  if (finalCause?.type === 'TIMER_RESET_OTHER') return `OTHER EXPLAINED - ${finalCause.reason}`;
  return 'DATA INSUFFICIENT';
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
  const priorAuditPath = resolve(ROOT,
    'docs/ant/evidence/2026-10-13-nodule-lineage-censoring/data/censoring-ledger.json');
  const canonicalReplay = JSON.parse(await readFile(canonicalReplayPath, 'utf8'));
  const priorAudit = JSON.parse(await readFile(priorAuditPath, 'utf8'));
  assert.deepEqual(naturalReplay.results, canonicalReplay.results,
    'untouched 600 s natural replay must match the committed production baseline');

  const started = performance.now();
  const seeds = [];
  for (const seed of SEEDS) {
    const result = await runSeed(seed);
    reconcilePreviousAudit(result, priorAudit);
    seeds.push(result);
    await writeJson(output, `seed-${seed}.json`, result);
    console.log(JSON.stringify({ seed, naturalBirths: result.arms.natural.births.length,
      timerClearBirths: result.arms.timerClear.births.length,
      gapPlates: result.gapPlateDescriptors.length,
      targets: { natural: result.arms.natural.targetCellCount, timerClear: result.arms.timerClear.targetCellCount },
      naturalClassification: result.arms.natural.targetClassificationCounts,
      timerClearClassification: result.arms.timerClear.targetClassificationCounts,
      wallSeconds: (performance.now() - started) / 1000 }));
  }
  const decision = classifyCensoringDecision(seeds, 'natural');
  const pairedComparison = summarizePairedTargetDifferences(seeds);
  const previousAuditReconciliation = summarizePreviousAuditReconciliation(seeds);
  const manifest = {
    title: 'Zero-ant Nodule target-cell instrumentation reproduction',
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
    observation: 'The research runner dynamically adds each cell when a gap Plate causes qualification false-to-true. From that exact Plate addition through the 459900 ms final evaluation, it stores every per-target MaterialStratigraphy evaluation row, timer event, actual proximity-gate call/blocker, and every gap Plate mask coverage relation. Diagnostic qualification reads use the public layer-count snapshot, SurfaceField.sample(), and exact production _localFootLoad() helper. No production state is written by instrumentation.',
    counterfactual: 'Matched fork after the 400 s removal/retirement flush. Only candidateSinceMs is filled with -1 in timerClear; no reset() and no other MaterialStratigraphy state is changed.',
    decision,
    priorCensoringAudit: { commit: 'b14de91b91db5e818a8128090e7c442259ddd257',
      path: relativeToRoot(priorAuditPath), reconciliation: previousAuditReconciliation },
    naturalVsTimerClear: pairedComparison,
    previousGapBirthLineageDecision: classifyDecision(seeds),
    productionSourceDiffFromBaseline: git('diff --name-only ' + BASELINE + ' HEAD -- src package.json package-lock.json'),
    sourceHashes: await sourceHashes(),
    results: seeds.map(seed => ({ seed: seed.seed, gapValidity: seed.validity,
      naturalLineages: countBy(seed.arms.natural.births, 'lineage'),
      timerClearLineages: countBy(seed.arms.timerClear.births, 'lineage'),
      naturalNoduleBirths: seed.arms.natural.births.length,
      timerClearNoduleBirths: seed.arms.timerClear.births.length,
      gapPlateBirths: seed.gapPlateDescriptors.length,
      plateEnabledQualificationCells: seed.arms.natural.plateEffects.qualificationEnabledCellCount,
      targets: { natural: seed.arms.natural.targetSummary, timerClear: seed.arms.timerClear.targetSummary } })),
    reproduction: 'node docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs test-results/ant-nodule-instrumentation-natural-replay-20261013.json; node scripts/ant-zero-ant-nodule-lineage.js --natural-replay=test-results/ant-nodule-instrumentation-natural-replay-20261013.json --output=test-results/ant-nodule-instrumentation-20261013',
    wallSeconds: (performance.now() - started) / 1000
  };
  await writeJson(output, 'manifest.json', manifest);
  console.log(JSON.stringify({ complete: true, output: outputArg, decision, wallSeconds: manifest.wallSeconds }));
}

async function runSeed(seed) {
  const arms = ['natural', 'timerClear'].map(name => {
    const random = countedLcg(seed);
    const controller = new AntController({ random });
    return { name, random, controller, observerEnabled: true };
  });
  const controls = ['natural', 'timerClear'].map(name => {
    const random = countedLcg(seed);
    const controller = new AntController({ random });
    return { name, random, controller, observerEnabled: false };
  });
  const allArms = arms.flatMap((arm, index) => [arm, controls[index]]);
  for (const arm of allArms) {
    await arm.controller.init();
    assert.equal(arm.controller.materialLocomotionResistance, true);
    assert.equal(arm.controller.audioBridge, null);
  }
  for (let index = 0; index < arms.length; index += 1) {
    assert.deepEqual(controllerComparableState(arms[index].controller, arms[index].random),
      controllerComparableState(controls[index].controller, controls[index].random),
      `${arms[index].name} observer ON/OFF controllers differ at tick 0`);
  }
  assert.deepEqual(controllerComparableState(arms[0].controller, arms[0].random),
    controllerComparableState(arms[1].controller, arms[1].random), 'paired controllers differ at tick 0');
  let prefixCheckpoints = 0;
  for (let tick = 0; tick < PREFIX_TICKS; tick += 1) {
    for (const arm of allArms) arm.controller.tick(DT);
    if ((tick + 1) % 60 === 0) {
      assert.deepEqual(controllerComparableState(arms[0].controller, arms[0].random),
        controllerComparableState(arms[1].controller, arms[1].random), `paired prefix diverged at tick ${tick + 1}`);
      for (let index = 0; index < arms.length; index += 1) {
        assert.deepEqual(controllerComparableState(arms[index].controller, arms[index].random),
          controllerComparableState(controls[index].controller, controls[index].random),
          `${arms[index].name} observer ON/OFF diverged at prefix tick ${tick + 1}`);
      }
      prefixCheckpoints += 1;
    }
  }
  assert.equal(prefixCheckpoints, 400);
  assert.ok(Math.abs(arms[0].controller.simulationTimeMs - GAP_START_MS) < 1e-5);

  const preRemoval = allArms.map(({ controller }) => captureEntryState(controller));
  for (let index = 0; index < arms.length; index += 1) {
    assert.deepEqual(preRemoval[index * 2], preRemoval[index * 2 + 1]);
  }
  assert.deepEqual(preRemoval[0], preRemoval[2]);
  const interventions = allArms.map(({ controller }) => beginZeroAntIntervention(controller));
  assert.ok(interventions.every(value => JSON.stringify(interventionBrief(value))
    === JSON.stringify(interventionBrief(interventions[0]))));
  allArms.forEach(({ controller }) => assertZeroAntState(controller));
  assert.deepEqual(controllerComparableState(arms[0].controller, arms[0].random),
    controllerComparableState(arms[1].controller, arms[1].random), 'matched arms differ before timer clear');
  for (let index = 0; index < arms.length; index += 1) {
    assert.deepEqual(controllerComparableState(arms[index].controller, arms[index].random),
      controllerComparableState(controls[index].controller, controls[index].random),
      `${arms[index].name} observer ON/OFF differs before timer clear`);
  }

  const entryState = arms.map(({ controller }) => captureGapEntry(controller));
  assert.deepEqual(entryState[0].nonTimerState, entryState[1].nonTimerState);
  assert.deepEqual(entryState[0].candidateSinceMs, entryState[1].candidateSinceMs);
  assert.deepEqual(entryState[0].qualifiedGatesByCell, entryState[1].qualifiedGatesByCell);
  for (let index = 0; index < arms.length; index += 1) {
    const observed = captureGapEntry(arms[index].controller);
    const unobserved = captureGapEntry(controls[index].controller);
    assert.deepEqual(observed, unobserved, `${arms[index].name} observer ON/OFF gap-entry state differs`);
  }
  const timerClear = clearCandidatePersistence(arms[1].controller.materialStratigraphy);
  timerClear.activeBeforeClear = entryState[1].activeCandidateTimers.length;
  assert.equal(timerClear.clearedCount, timerClear.activeBeforeClear,
    'timer-only intervention must clear every and only active persistence timer');
  timerClear.beforeTimerSha256 = hash(entryState[1].candidateSinceMs);
  timerClear.afterTimerSha256 = hash(arms[1].controller.materialStratigraphy.candidateSinceMs);
  timerClear.matchedNonTimerStateExact = true;
  timerClear.onlyCandidateSinceMsChanged = true;
  assertOnlyCandidateTimersDiffer(arms[0].controller, arms[1].controller, arms[0].random, arms[1].random);
  const controlTimerClear = clearCandidatePersistence(controls[1].controller.materialStratigraphy);
  assert.equal(controlTimerClear.clearedCount, timerClear.clearedCount);
  assert.deepEqual([...controls[1].controller.materialStratigraphy.candidateSinceMs],
    [...arms[1].controller.materialStratigraphy.candidateSinceMs]);
  assert.deepEqual(captureGapEntry(arms[0].controller).nonTimerState,
    captureGapEntry(arms[1].controller).nonTimerState, 'timer clear changed retained non-timer state');
  assert.ok(arms[1].controller.materialStratigraphy.candidateSinceMs.every(value => value === -1));
  for (let index = 0; index < arms.length; index += 1) {
    assert.deepEqual(controllerComparableState(arms[index].controller, arms[index].random),
      controllerComparableState(controls[index].controller, controls[index].random),
      `${arms[index].name} observer ON/OFF differs after timer-clear intervention`);
  }

  const trackers = arms.map(({ controller, random }, index) => createGapTracker(controller, random,
    index === 0 ? 'natural' : 'timerClear', entryState[index]));
  const watchers = allArms.map(({ controller }) => watchGap(controller));
  const gapStartClock = arms[0].controller.simulationTimeMs;
  const rngAtEntry = allArms.map(({ random }) => [random.state(), random.calls]);
  const countsAtEntry = allArms.map(({ controller }) => [controller.totalSpawned, controller.totalRetired]);
  const contactsAtEntry = allArms.map(({ controller }) => ({
    materialAccepted: controller.materialStratigraphy.totalAcceptedFootContacts,
    surface: controller.surfaceField.totalFootContacts,
    footLoadSha256: hash(controller.materialStratigraphy.footLoadByCell)
  }));

  for (let tick = 0; tick < GAP_TICKS; tick += 1) {
    for (let index = 0; index < allArms.length; index += 1) {
      const { controller, random } = allArms[index];
      assertZeroAntState(controller);
      watchers[index].clearTick();
      const clockBefore = controller.simulationTimeMs;
      controller.tick(DT);
      assert.equal(controller.agents.length, 0, `ant appeared in ${allArms[index].name} gap at tick ${tick}`);
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
      if (index % 2 === 1) {
        const observed = arms[Math.floor(index / 2)];
        assert.deepEqual(controllerComparableState(observed.controller, observed.random),
          controllerComparableState(controller, random),
          `${observed.name} observer ON/OFF diverged at gap tick ${tick + 1}`);
      }
    }
  }

  const gapDelta = allArms.map(({ controller }) => controller.simulationTimeMs - gapStartClock);
  assert.equal(GAP_TICKS, 3600);
  gapDelta.forEach(value => assert.ok(Math.abs(value - 60000) < 1e-5));
  allArms.forEach(({ controller }) => assertZeroAntState(controller));
  trackers.forEach((tracker, index) => {
    assert.equal(tracker.boundaries.length, 60, 'expected one Nodule evaluation per simulated second');
    assert.equal(watchers[index * 2].plateBirthEvents, tracker.gapPlateEvents.length,
      'every gap Plate birth event must have a matching MaterialStratigraphy addition');
    assert.equal(watchers[index * 2].sphereBirthEvents, tracker.births.length,
      'every gap Nodule birth must match its controller sphere-birth event');
  });
  watchers.forEach((watcher, index) => watcher.restore(allArms[index].controller));
  for (const tracker of trackers) tracker.restore();

  const results = arms.map((arm, index) => finalizeArm(arm.controller, arm.random, trackers[index], watchers[index * 2]));
  const expectedTargets = { 20261005: 12, 20261006: 18, 20261007: 2 }[seed];
  for (const result of results) {
    assert.equal(result.arm.targetCellCount, expectedTargets, `${result.arm.arm} target count changed for seed ${seed}`);
    assert.equal(new Set(result.arm.targetCells.map(target => target.cell)).size, expectedTargets,
      `${result.arm.arm} target set contains duplicate cells for seed ${seed}`);
    assert.equal(result.arm.qualificationEnabledTransitions.length, expectedTargets,
      `${result.arm.arm} Plate-enabled qualification transitions changed for seed ${seed}`);
  }
  assert.deepEqual(results[0].gapPlateDescriptors.map(plateComparable),
    results[1].gapPlateDescriptors.map(plateComparable), 'timer clear changed TrailPlateBirth Plate additions');
  const validity = {
    prefixCheckpoints: prefixCheckpoints + 1,
    pairedProductionValueDeepCompare: true,
    observerOnOffExact: { exact: true, prefixCheckpoints: prefixCheckpoints + 1,
      gapTicksPerArm: GAP_TICKS, matchedPairs: ['natural', 'timerClear'] },
    gapTicks: GAP_TICKS,
    gapClockDeltaMs: gapDelta,
    allTicksZeroAnt: true,
    noSpawn: watchers.every(value => value.spawnCalls === 0),
    noMovementOrPerAntState: true,
    noDeposition: watchers.every(value => value.depositCalls === 0),
    noFootContact: watchers.every(value => value.totalFootContactEvents === 0),
    noAntOriginOrUnknownEvents: watchers.every(value => value.totalUnexpectedEvents === 0),
    noRngConsumption: allArms.every(({ random }, index) => random.state() === rngAtEntry[index][0]
      && random.calls === rngAtEntry[index][1]),
    retainedFootLoadUnchanged: contactsAtEntry.every((value, index) =>
      value.footLoadSha256 === hash(allArms[index].controller.materialStratigraphy.footLoadByCell)),
    identicalGapPlateBirthsAcrossArms: true,
    timerClear: { ...timerClear, changedOnlyCandidateSinceMs: true }
  };
  const enriched = results.map(result => enrichArmBirths(result));
  const decisionInput = { seed, validity, gapPlateDescriptors: enriched[0].gapPlateDescriptors,
    arms: { natural: enriched[0].arm, timerClear: enriched[1].arm } };
  for (const { controller } of allArms) await controller.destroy();
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
    targetCellsByCell: new Map(), nearbyGateCalls: [], observerPurityChecks: { addPlate: 0, advance: 0, proximity: 0 },
    qualificationEnabledTransitions: [], entryQualifiedGatesByCell: entryState.qualifiedGatesByCell,
    originalEntryTimers: Float64Array.from(entryState.candidateSinceMs),
    entryQualifiedFlags: entryState.qualifiedFlags.slice(),
    previousQualifiedAtEntry: entryState.qualifiedFlags.slice(),
    previousQualified: entryState.qualifiedFlags.slice(), previousEvaluationTimeMs: material.lastNoduleEvaluationTimeMs,
    rngStateAtEntry: random.state(), rngCallsAtEntry: random.calls,
    plateEffects: { count: 0, coveredCells: 0, timerResetCellCount: 0,
      foundationThresholdCrossingCount: 0, qualificationEnabledCellCount: 0 },
    originalAdvance: material.advance, originalAddPlate: material.addPlate,
    originalNearDescriptor: Object.getOwnPropertyDescriptor(material, '_nearExistingNodule'),
    originalNearExistingNodule: material._nearExistingNodule
  };
  material.addPlate = function (descriptor) {
    return observePlateAddition(tracker, controller, random, descriptor);
  };
  material.advance = function (args) { return observeNoduleAdvance(tracker, controller, random, args); };
  Object.defineProperty(material, '_nearExistingNodule', { configurable: true, enumerable: false, writable: true,
    value: function (x, y, radius) { return observeNearbyNoduleGate(tracker, controller, random, x, y, radius); } });
  tracker.restore = () => {
    material.advance = tracker.originalAdvance;
    material.addPlate = tracker.originalAddPlate;
    restoreMethod(material, '_nearExistingNodule', tracker.originalNearDescriptor);
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
    coverageCells: coverageCellsFromMask(mask),
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
    if (enabled) {
      tracker.qualificationEnabledTransitions.push(row);
      let target = tracker.targetCellsByCell.get(item.cell);
      if (!target) {
        target = { cell: item.cell, firstEnabledAtMs: descriptor.bornAtSimulationTimeMs,
          enablingPlateId: descriptor.id, events: [], evaluations: [], plateCoverage: [], lastQualified: true };
        tracker.targetCellsByCell.set(item.cell, target);
      }
      target.events.push({ type: 'QUALIFICATION_ENABLED', timeMs: descriptor.bornAtSimulationTimeMs,
        enablingPlateId: descriptor.id, cell: item.cell, layerCountBefore: item.layerCount,
        layerCountAfter: afterLayerCount, compaction: afterGates.sampledCompaction,
        localFootLoad: afterGates.retainedFootLoad, nearbyNoduleStatusBefore: nearbyNodulesAtCell(material, item.cell),
        nearbyNoduleStatusAfter: nearbyNodulesAtCell(material, item.cell),
        maxCountStatusBefore: { count: material.nodules.length, maximum: material.maxNodules,
          reached: item.gates.maxNodulesReached },
        maxCountStatusAfter: { count: material.nodules.length, maximum: material.maxNodules,
          reached: afterGates.maxNodulesReached }, ...row });
    }
    const target = tracker.targetCellsByCell.get(item.cell);
    if (target && reset) target.events.push({ type: 'TIMER_RESET_BY_PLATE', timeMs: descriptor.bornAtSimulationTimeMs,
      plateId: descriptor.id, cell: item.cell, plateCoveredCell: true,
      timerBeforeMs: item.timerBefore, timerAfterMs: timerAfter,
      layerCountBefore: item.layerCount, layerCountAfter: afterLayerCount });
    const history = tracker.plateInteractionsByCell.get(item.cell) || [];
    history.push(row);
    tracker.plateInteractionsByCell.set(item.cell, history);
  });
  assert.equal(controllerStateHash(controller, random), stateAfterBirth,
    'read-only Plate-addition observer changed state beyond production addPlate');
  tracker.observerPurityChecks.addPlate += 1;
  return result;
}

function observeNearbyNoduleGate(tracker, controller, random, x, y, radius) {
  const material = controller.materialStratigraphy;
  const cell = cellFromPosition(material, { x, y });
  const timerBeforeMs = material.candidateSinceMs[cell];
  const beforeHash = controllerStateHash(controller, random);
  const result = tracker.originalNearExistingNodule.call(material, x, y, radius);
  const afterHash = controllerStateHash(controller, random);
  assert.equal(afterHash, beforeHash, 'proximity observer changed state around the production gate');
  const blocker = material.nodules.find(nodule => {
    const distance = Math.hypot(nodule.position.x - x, nodule.position.y - y);
    return distance < nodule.radius + radius;
  }) ?? null;
  assert.equal(Boolean(blocker), result, 'diagnostic blocker must match the production proximity result');
  const call = { timeMs: material.simulationTimeMs, cell, x, y, radius, blocked: result,
    timerBeforeMs, blockingNodule: blocker ? { id: blocker.id, position: blocker.position,
      distance: Math.hypot(blocker.position.x - x, blocker.position.y - y),
      exclusionDistance: blocker.radius + radius } : null };
  if (tracker.targetCellsByCell.has(cell)) {
    tracker.nearbyGateCalls.push(call);
    const target = tracker.targetCellsByCell.get(cell);
    assert.ok(call.timeMs - timerBeforeMs >= Q.persistenceMs,
      'production proximity gate is called only after the full persistence interval');
    const key = `${cell}:${timerBeforeMs}`;
    if (!target.events.some(event => event.type === 'TIMER_MATURED' && event.timerKey === key)) {
      target.events.push({ type: 'TIMER_MATURED', timeMs: call.timeMs, cell,
        candidateSinceMs: timerBeforeMs, persistenceAgeMs: call.timeMs - timerBeforeMs, timerKey: key });
    }
    if (result) target.pendingNearbyBlocks = [...(target.pendingNearbyBlocks || []), call];
  }
  tracker.observerPurityChecks.proximity += 1;
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
  const lastAdvanceBefore = material.lastAdvanceTimeMs;
  const surfaceAvailable = typeof args.surface?.sample === 'function';
  const earlyExitReason = !surfaceAvailable ? 'NO_SURFACE'
    : !material.plates.length ? 'NO_PLATES'
      : material.maxNodules === 0 ? 'MAXIMUM_DISABLED'
        : material.nodules.length >= material.maxNodules ? 'MAX_NODULE_COUNT' : null;
  const gapReset = material.lastAdvanceTimeMs !== null
    && nowMs - material.lastAdvanceTimeMs > Q.maximumGapForPersistenceMs;
  const nearbyCallStart = tracker.nearbyGateCalls.length;
  const born = tracker.originalAdvance.call(material, args);
  const evaluated = material.lastNoduleEvaluationTimeMs !== beforeEvaluation;
  if (!evaluated) return born;
  assert.ok(timersBefore && nodulesBefore);
  const productionStateHash = controllerStateHash(controller, random);
  const nearbyCalls = tracker.nearbyGateCalls.slice(nearbyCallStart);
  for (const call of nearbyCalls.filter(value => value.blocked)) {
    const target = tracker.targetCellsByCell.get(call.cell);
    if (!target) continue;
    const timerAfterMs = material.candidateSinceMs[call.cell];
    assert.ok(timerAfterMs < 0, 'a production proximity rejection must clear its candidate timer');
    target.events.push({ type: 'BLOCKED_BY_NEARBY_NODULE', timeMs: call.timeMs, cell: call.cell,
      blockingNoduleId: call.blockingNodule.id, blockingNodulePosition: call.blockingNodule.position,
      distance: call.blockingNodule.distance, exclusionDistance: call.blockingNodule.exclusionDistance,
      timerBeforeMs: call.timerBeforeMs, timerAfterMs, timerResetConfirmed: true });
  }
  const boundary = observeEvaluationBoundary(tracker, controller, args, timersBefore, born, nodulesBefore,
    { lastAdvanceBefore, earlyExitReason, gapReset, nearbyCalls });
  tracker.boundaries.push(boundary.summary);
  tracker.births.push(...boundary.births);
  tracker.previousQualified = boundary.qualifiedFlags;
  tracker.previousEvaluationTimeMs = material.lastNoduleEvaluationTimeMs;
  assert.equal(controllerStateHash(controller, random), productionStateHash,
    'read-only Nodule boundary observer changed state beyond production advance');
  tracker.observerPurityChecks.advance += 1;
  return born;
}

function observeEvaluationBoundary(tracker, controller, args, timersBefore, born, nodulesBefore, advanceMeta) {
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
      const nearbyCall = advanceMeta.nearbyCalls.find(call => call.cell === cell && call.blocked);
      const reason = birthCells.has(cell) ? 'nodule-birth'
        : advanceMeta.earlyExitReason === 'MAX_NODULE_COUNT' ? 'maximum-nodule-count'
          : !qualified ? 'qualification-lost'
            : nearbyCall ? 'nearby-existing-nodule' : advanceMeta.gapReset
              ? 'persistence-sample-gap' : 'other-production-reset';
      const reset = { cell, timeMs: nowMs, timerBeforeMs, reason,
        qualification: gates, gapBornPlateIdsCoveringCell: coveringPlateEvents(tracker, cell, nowMs).map(event => event.id) };
      timerResets.push(reset);
      const events = tracker.cellTimerEvents.get(cell) || [];
      events.push({ type: 'reset', ...reset });
      tracker.cellTimerEvents.set(cell, events);
    }
    const target = tracker.targetCellsByCell.get(cell);
    if (target) {
      const nearbyBefore = nearbyNodulesFromList(material, cell, nodulesBefore);
      const nearbyAfter = nearbyNodulesAtCell(material, cell);
      const nearbyCall = advanceMeta.nearbyCalls.find(call => call.cell === cell);
      const noduleAtCellBefore = nodulesBefore.find(nodule => cellFromPosition(material, nodule.position) === cell);
      const noduleAtCellAfter = material.noduleByCell.get(cell);
      const failedGates = [];
      if (!gates.hasFoundation) failedGates.push('FOUNDATION');
      if (!gates.compactionValueMet) failedGates.push('COMPACTION');
      if (!gates.footLoadValueMet) failedGates.push('FOOT LOAD');
      const maxBefore = nodulesBefore.length >= material.maxNodules;
      const timerAfterAtCell = material.candidateSinceMs[cell];
      if (advanceMeta.gapReset && timerBeforeMs >= 0) {
        target.events.push({ type: 'TIMER_RESET_OTHER', timeMs: nowMs, cell,
          reason: 'PERSISTENCE_SAMPLE_GAP', timerBeforeMs,
          timerAfterResetMs: gates.qualified ? nowMs : -1,
          restartedAtSameEvaluation: gates.qualified });
      }
      if (advanceMeta.earlyExitReason === 'MAX_NODULE_COUNT' && !birthCells.has(cell)) {
        if (timerBeforeMs >= 0) assert.ok(timerAfterAtCell < 0, 'max-count early exit must clear active target timers');
        target.events.push({ type: 'BLOCKED_BY_MAX_COUNT', timeMs: nowMs, cell,
          noduleCount: nodulesBefore.length, maxNodules: material.maxNodules,
          timerBeforeMs, timerAfterMs: timerAfterAtCell, timerResetConfirmed: timerBeforeMs < 0 || timerAfterAtCell < 0 });
      } else if (timerBeforeMs >= 0 && timerAfterAtCell < 0 && !birthCells.has(cell)
        && !nearbyCall?.blocked && advanceMeta.earlyExitReason) {
        target.events.push({ type: 'TIMER_RESET_OTHER', timeMs: nowMs, cell,
          reason: advanceMeta.earlyExitReason, timerBeforeMs, timerAfterMs: timerAfterAtCell });
      } else if (timerBeforeMs >= 0 && timerAfterAtCell < 0 && !gates.qualified
        && !birthCells.has(cell) && !nearbyCall?.blocked && !advanceMeta.gapReset) {
        target.events.push({ type: 'TIMER_CLEARED_QUALIFICATION_LOST', timeMs: nowMs, cell,
          failedGates, layerCount: gates.layerCount, buriedLayerCount: gates.buriedLayerCount,
          compaction: gates.sampledCompaction, minimumCompaction: Q.minimumCompaction,
          localFootLoad: gates.retainedFootLoad, minimumLocalFootLoad: Q.minimumLocalFootLoad,
          timerBeforeMs, timerAfterMs: timerAfterAtCell });
      }
      if (timerBeforeMs < 0 && timerAfterAtCell >= 0) {
        target.events.push({ type: 'TIMER_STARTED', timeMs: nowMs, cell,
          candidateSinceMs: timerAfterAtCell, layerCount: gates.layerCount,
          compaction: gates.sampledCompaction, localFootLoad: gates.retainedFootLoad,
          nearbyNoduleIds: nearbyBefore.map(value => value.id), maxCountStatus: {
            count: nodulesBefore.length, maximum: material.maxNodules, reached: maxBefore } });
      }
      const evaluation = { timeMs: nowMs, cell, layerCount: gates.layerCount,
        buriedLayerCount: gates.buriedLayerCount, topPlateId: gates.topPlateId,
        compaction: gates.sampledCompaction, localFootLoad: gates.retainedFootLoad,
        qualified: gates.qualified, candidateSinceMsBefore: timerBeforeMs,
        candidateSinceMs: timerAfterAtCell,
        timerAgeMs: timerAfterAtCell >= 0 ? nowMs - timerAfterAtCell : null,
        nearbyExistingNodule: nearbyBefore.length > 0,
        nearbyNoduleIds: nearbyBefore.map(value => value.id),
        blockingNoduleId: nearbyCall?.blockingNodule?.id ?? null,
        maxNodulesReached: maxBefore, noduleCount: nodulesBefore.length,
        noduleExistsAtCellBefore: Boolean(noduleAtCellBefore),
        noduleAtCellIdBefore: noduleAtCellBefore?.id ?? null,
        noduleExistsAtCellAfter: Boolean(noduleAtCellAfter),
        noduleAtCellIdAfter: noduleAtCellAfter?.id ?? null,
        noduleExistsNearCellBefore: nearbyBefore.length > 0,
        noduleExistsNearCellAfter: nearbyAfter.length > 0,
        nearbyNoduleIdsAfter: nearbyAfter.map(value => value.id),
        noduleCountAfter: material.nodules.length,
        maxNodulesReachedAfter: material.nodules.length >= material.maxNodules,
        productionEarlyExitReason: advanceMeta.earlyExitReason,
        timerMaturedAtEvaluation: Boolean(nearbyCall) };
      target.evaluations.push(evaluation);
      if (target.lastQualified === true && !gates.qualified) {
        target.events.push({ type: 'QUALIFICATION_LOST', timeMs: nowMs, cell, failedGates,
          layerCount: gates.layerCount, compaction: gates.sampledCompaction,
          localFootLoad: gates.retainedFootLoad });
      }
      target.lastQualified = gates.qualified;
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
    descriptor: nodule,
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
  for (const birth of birthRows) {
    const target = tracker.targetCellsByCell.get(birth.cell);
    if (target) target.events.push({ type: 'NODULE_BIRTH', timeMs: birth.bornAtSimulationTimeMs,
      cell: birth.cell, noduleId: birth.id, descriptor: birth.descriptor,
      candidateSinceMs: birth.candidateSinceMsAtBirth, persistenceAgeMs: birth.persistenceAgeMs,
      lineage: birth.lineage });
  }
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
  const targetCells = [...tracker.targetCellsByCell.values()].sort((a, b) => a.cell - b.cell).map(target => {
    const lastEvaluation = target.evaluations.at(-1);
    assert.ok(lastEvaluation, `target cell ${target.cell} needs at least one evaluation row`);
    assert.ok(Math.abs(lastEvaluation.timeMs - 459900) < 0.01,
      `target cell ${target.cell} must end at the final in-gap evaluation boundary`);
    const gateAtClockEnd = qualificationAtCell(material, controller.surfaceField, target.cell);
    const timerAtClockEnd = material.candidateSinceMs[target.cell];
    const clockEndState = { timeMs: controller.simulationTimeMs, cell: target.cell,
      qualified: gateAtClockEnd.qualified, layerCount: gateAtClockEnd.layerCount,
      buriedLayerCount: gateAtClockEnd.buriedLayerCount, compaction: gateAtClockEnd.sampledCompaction,
      localFootLoad: gateAtClockEnd.retainedFootLoad, candidateSinceMs: timerAtClockEnd,
      persistenceAgeMs: timerAtClockEnd >= 0 ? controller.simulationTimeMs - timerAtClockEnd : null,
      nearbyExistingNodule: nearbyNodulesAtCell(material, target.cell).length > 0,
      nearbyNoduleIds: nearbyNodulesAtCell(material, target.cell).map(value => value.id),
      noduleCount: material.nodules.length, maxNodules: material.maxNodules,
      maxNodulesReached: material.nodules.length >= material.maxNodules };
    target.events.push({ type: 'GAP_END_CENSORED', timeMs: lastEvaluation.timeMs, ...lastEvaluation });
    target.events.push({ type: 'GAP_CLOCK_END_STATE', ...clockEndState });
    target.nominalNoResetOpportunityMs = lastEvaluation.timeMs - target.evaluations[0].timeMs;
    target.nominalAtLeast30Seconds = target.nominalNoResetOpportunityMs >= Q.persistenceMs;
    target.plateCoverage = tracker.gapPlateEvents.map(plate => ({ plateId: plate.id,
      bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs, covered: plate.mask[target.cell] === 1,
      maskSha256: plate.maskSha256 }));
    target.classification = classifyTargetHistory(target.events, {
      ...lastEvaluation, persistenceAgeMs: lastEvaluation.timerAgeMs,
      maxNodulesReached: lastEvaluation.maxNodulesReachedAfter });
    target.gapClockEndState = clockEndState;
    delete target.lastQualified;
    delete target.pendingNearbyBlocks;
    return target;
  });
  const gapPlateDescriptors = tracker.gapPlateEvents.map(({ mask, sourceDescriptor, ...plate }) => {
    const { mask: _mask, ...descriptor } = sourceDescriptor;
    return { ...plate, sourceDescriptor: descriptor, cellCount: material.cellCount,
      maskWidth: material.width, maskHeight: material.height,
      coverageEncoding: 'coverageCells is the exact list of set mask indices; all other cells are zero',
      targetCellCoverage: targetCells.map(target => ({ cell: target.cell, covered: mask[target.cell] === 1 })) };
  });
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
    targetCellCount: targetCells.length,
    targetCells,
    targetClassificationCounts: countBy(targetCells, 'classification'),
    targetSummary: summarizeTargets(targetCells),
    observerPurityChecks: tracker.observerPurityChecks,
    births: tracker.births,
    gapValidity: { spawnCalls: watcher.spawnCalls, depositCalls: watcher.depositCalls,
      totalEvents: watcher.totalEvents, footContactEvents: watcher.totalFootContactEvents,
      unexpectedEvents: watcher.totalUnexpectedEvents,
      allTicksZeroAnt: true, rngUnchanged: random.calls === tracker.rngCallsAtEntry
        && random.state() === tracker.rngStateAtEntry }
  };
  reclassifyTargetCells(result);
  return { arm: result, births: tracker.births, gapPlateDescriptors: tracker.gapPlateEvents };
}

export function reclassifyTargetCells(arm) {
  for (const target of arm.targetCells) {
    const finalEvaluation = target.events.findLast(event => event.type === 'GAP_END_CENSORED');
    assert.ok(finalEvaluation, `target cell ${target.cell} is missing GAP_END_CENSORED`);
    target.classification = classifyTargetHistory(target.events, {
      ...finalEvaluation, persistenceAgeMs: finalEvaluation.timerAgeMs,
      maxNodulesReached: finalEvaluation.maxNodulesReachedAfter
    });
  }
  arm.targetClassificationCounts = countBy(arm.targetCells, 'classification');
  arm.targetSummary = summarizeTargets(arm.targetCells);
  return arm;
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

function nearbyNodulesAtCell(material, cell) {
  return nearbyNodulesFromList(material, cell, material.nodules);
}

function nearbyNodulesFromList(material, cell, nodules) {
  const x = (cell % material.width) / (material.width - 1);
  const y = Math.floor(cell / material.width) / (material.height - 1);
  const radius = Q.radiusRange[1];
  return nodules.flatMap(nodule => {
    const distance = Math.hypot(nodule.position.x - x, nodule.position.y - y);
    return distance < nodule.radius + radius
      ? [{ id: nodule.id, position: nodule.position, distance, exclusionDistance: nodule.radius + radius }]
      : [];
  });
}

export function summarizeTargets(targets) {
  const typeCount = type => targets.reduce((sum, target) => sum
    + target.events.filter(event => event.type === type).length, 0);
  const anyType = type => targets.filter(target => target.events.some(event => event.type === type)).length;
  const qualificationLosses = targets.flatMap(target => target.events
    .filter(event => event.type === 'TIMER_CLEARED_QUALIFICATION_LOST'));
  return {
    targetCells: targets.length,
    classificationCounts: countBy(targets, 'classification'),
    nominalNoResetOpportunityAtLeast30Seconds: targets.filter(target => target.nominalAtLeast30Seconds).length,
    uninterruptedPersistenceAtLeast30Seconds: anyType('TIMER_MATURED'),
    timerMaturedEventCount: typeCount('TIMER_MATURED'),
    plateResetCellCount: anyType('TIMER_RESET_BY_PLATE'),
    plateResetEventCount: typeCount('TIMER_RESET_BY_PLATE'),
    qualificationLossCellCount: anyType('TIMER_CLEARED_QUALIFICATION_LOST'),
    qualificationLossEventCount: typeCount('TIMER_CLEARED_QUALIFICATION_LOST'),
    qualificationLossCountsByGate: Object.fromEntries(['FOUNDATION', 'COMPACTION', 'FOOT LOAD'].map(gate =>
      [gate, qualificationLosses.filter(event => event.failedGates.includes(gate)).length])),
    nearbyBlockedCellCount: anyType('BLOCKED_BY_NEARBY_NODULE'),
    nearbyBlockEventCount: typeCount('BLOCKED_BY_NEARBY_NODULE'),
    maxCountBlockedCellCount: anyType('BLOCKED_BY_MAX_COUNT'),
    maxCountBlockEventCount: typeCount('BLOCKED_BY_MAX_COUNT'),
    activeTimerAtFinalEvaluation: targets.filter(target => target.events.findLast(event =>
      event.type === 'GAP_END_CENSORED')?.candidateSinceMs >= 0).length,
    activeTimerAt460Seconds: targets.filter(target => target.gapClockEndState.candidateSinceMs >= 0).length,
    qualifiedAt460Seconds: targets.filter(target => target.gapClockEndState.qualified).length
  };
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

function reconcilePreviousAudit(seedResult, priorAudit) {
  const prior = new Map(priorAudit.cells.map(row => [`${row.seed}:${row.arm}:${row.cell}`, row]));
  for (const armName of ['natural', 'timerClear']) {
    const arm = seedResult.arms[armName];
    const seen = new Set();
    for (const target of arm.targetCells) {
      const key = `${seedResult.seed}:${armName}:${target.cell}`;
      assert.ok(!seen.has(target.cell), `duplicate target cell ${key}`);
      seen.add(target.cell);
      const previous = prior.get(key);
      assert.ok(previous, `target ${key} is missing from the committed censoring audit`);
      assert.ok(Math.abs(previous.nominalNoResetOpportunityMs - target.nominalNoResetOpportunityMs) < 0.01,
        `target ${key} nominal opportunity no longer matches the prior audit`);
      target.previousAuditClassification = previous.primaryClassification;
      target.previousNominalNoResetOpportunityMs = previous.nominalNoResetOpportunityMs;
      target.previousAuditCellMatched = true;
    }
    const expected = priorAudit.cells.filter(row => row.seed === seedResult.seed && row.arm === armName).length;
    assert.equal(seen.size, expected, `${armName} target set changed from the saved 32-cell audit`);
  }
  assert.deepEqual(seedResult.arms.natural.targetCells.map(target => target.cell),
    seedResult.arms.timerClear.targetCells.map(target => target.cell),
    'natural and timer-clear target cells must match exactly');
}

export function summarizePreviousAuditReconciliation(seeds) {
  return Object.fromEntries(['natural', 'timerClear'].map(armName => {
    const targets = seeds.flatMap(seed => seed.arms[armName].targetCells);
    const unresolved = targets.filter(target => target.previousAuditClassification === 'DATA INSUFFICIENT');
    return [armName, {
      previousClassificationCounts: countBy(targets, 'previousAuditClassification'),
      previousNominalAtLeast30Seconds: targets.filter(target => target.previousNominalNoResetOpportunityMs >= Q.persistenceMs).length,
      previousUnresolvedCells: unresolved.length,
      unresolvedCellsWithActualPlateReset: unresolved.filter(target => target.events.some(event =>
        event.type === 'TIMER_RESET_BY_PLATE')).length,
      unresolvedCellsWithActualQualificationLoss: unresolved.filter(target => target.events.some(event =>
        event.type === 'TIMER_CLEARED_QUALIFICATION_LOST')).length,
      unresolvedCellsWithActualNearbyBlock: unresolved.filter(target => target.events.some(event =>
        event.type === 'BLOCKED_BY_NEARBY_NODULE')).length,
      unresolvedCellsWithActualMaxCountBlock: unresolved.filter(target => target.events.some(event =>
        event.type === 'BLOCKED_BY_MAX_COUNT')).length
    }];
  }));
}

export function summarizePairedTargetDifferences(seeds) {
  return seeds.map(seed => {
    const natural = new Map(seed.arms.natural.targetCells.map(target => [target.cell, target]));
    const timerClear = new Map(seed.arms.timerClear.targetCells.map(target => [target.cell, target]));
    assert.deepEqual([...natural.keys()].sort((a, b) => a - b), [...timerClear.keys()].sort((a, b) => a - b));
    const classificationDifferences = [];
    for (const [cell, left] of natural) {
      const right = timerClear.get(cell);
      if (left.classification !== right.classification) classificationDifferences.push({ cell,
        natural: left.classification, timerClear: right.classification });
    }
    return { seed: seed.seed, targetCellCount: natural.size,
      classificationDifferenceCount: classificationDifferences.length,
      classificationDifferences,
      natural: seed.arms.natural.targetSummary,
      timerClear: seed.arms.timerClear.targetSummary };
  });
}

export function classifyCensoringDecision(seeds, armName) {
  const targets = seeds.flatMap(seed => seed.arms[armName].targetCells);
  const categories = targets.reduce((counts, target) => {
    const category = target.classification.startsWith('QUALIFICATION LOST') ? 'QUALIFICATION LOST'
      : target.classification.startsWith('OTHER EXPLAINED') ? 'OTHER EXPLAINED' : target.classification;
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
  const windowCensored = (categories['RIGHT-CENSORED'] || 0) + (categories['PLATE-RESET CENSORED'] || 0);
  const formationBarriers = (categories['QUALIFICATION LOST'] || 0) + (categories['NEARBY-NODULE BLOCKED'] || 0)
    + (categories['MAX-COUNT BLOCKED'] || 0) + (categories['OTHER EXPLAINED'] || 0);
  let label = 'MIXED';
  if ((categories['DATA INSUFFICIENT'] || 0) > 0) label = 'DATA INSUFFICIENT';
  else if (windowCensored > formationBarriers) label = 'WINDOW CENSORING DOMINANT';
  else if (formationBarriers > windowCensored) label = 'FORMATION BARRIERS DOMINANT';
  return { label, primaryArm: armName, targetCellCount: targets.length,
    classificationCounts: categories, windowCensored, formationBarriers,
    nominalAtLeast30Seconds: targets.filter(target => target.previousNominalNoResetOpportunityMs >= Q.persistenceMs).length,
    nominalLongCellsWithActualUninterrupted30Seconds: targets.filter(target =>
      target.previousNominalNoResetOpportunityMs >= Q.persistenceMs
      && target.events.some(event => event.type === 'TIMER_MATURED')).length,
    activeTimersAtFinalEvaluation: targets.filter(target => target.evaluations.at(-1)?.candidateSinceMs >= 0).length,
    activeTimersAt460Seconds: targets.filter(target => target.gapClockEndState.candidateSinceMs >= 0).length,
    exactQualificationLossCountsByGate: targets.reduce((counts, target) => {
      for (const event of target.events.filter(value => value.type === 'TIMER_CLEARED_QUALIFICATION_LOST')) {
        for (const gate of event.failedGates) counts[gate] = (counts[gate] || 0) + 1;
      }
      return counts;
    }, {}),
    actualPlateResetCells: targets.filter(target => target.events.some(event => event.type === 'TIMER_RESET_BY_PLATE')).length,
    actualNearbyBlockedCells: targets.filter(target => target.events.some(event => event.type === 'BLOCKED_BY_NEARBY_NODULE')).length,
    actualMaxCountBlockedCells: targets.filter(target => target.events.some(event => event.type === 'BLOCKED_BY_MAX_COUNT')).length
  };
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
