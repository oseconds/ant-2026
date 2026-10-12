import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { serialize } from 'node:v8';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { beginZeroAntIntervention } from './ant-zero-ant-continuity-shadow.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASELINE = 'd729072b16dd44c1c4d8b245394d02c278556da8';
const SEEDS = [20261005, 20261006, 20261007];
const DT = 1 / 60;
const GAP_TICKS = 3600;
const GAP_START_SECONDS = 400;
const GAP_END_SECONDS = 460;
const CLI = new Map(process.argv.slice(2).map(arg => {
  const split = arg.indexOf('=');
  return split < 0 ? [arg, true] : [arg.slice(0, split), arg.slice(split + 1)];
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export function candidateMatchesDescriptor(candidate, descriptor) {
  return Boolean(candidate && descriptor
    && sameArray(candidate.mask, descriptor.mask)
    && sameArray(candidate.path, descriptor.principalPath));
}

export function classifyCandidateLineage({ gapEntryCandidate, birthCandidate, descriptorMatches, gapEntryTimeMs }) {
  if (!birthCandidate || !descriptorMatches) return 'AMBIGUOUS';
  if (gapEntryCandidate && birthCandidate.startedAtMs === gapEntryCandidate.startedAtMs) return 'PRE-GAP';
  if (Number.isFinite(gapEntryTimeMs) && birthCandidate.startedAtMs > gapEntryTimeMs) return 'POST-GAP';
  return 'AMBIGUOUS';
}

async function main() {
  assert.equal(git('rev-parse HEAD'), BASELINE, 'run from the expected zero-ant continuity baseline');
  assert.deepEqual(git('diff --name-only ' + BASELINE + ' HEAD -- src package.json package-lock.json'), '',
    'production source differs from the expected baseline');
  const outputArg = CLI.get('--output');
  assert.ok(typeof outputArg === 'string' && outputArg, 'pass --output=<fresh directory>');
  const output = resolve(ROOT, outputArg);
  await mkdir(output, { recursive: true });
  assert.deepEqual(await readdir(output), [], 'output directory must be empty');
  const replayPath = resolve(ROOT, CLI.get('--natural-replay')
    || 'docs/ant/evidence/2026-10-12-zero-ant-continuity/data/unobserved-natural-replay-current.json');
  const naturalReplay = JSON.parse(await readFile(replayPath, 'utf8'));
  const canonicalReplayPath = resolve(ROOT,
    'docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.json');
  const canonicalReplay = JSON.parse(await readFile(canonicalReplayPath, 'utf8'));
  assert.deepEqual(naturalReplay, canonicalReplay, 'fresh natural replay must exactly match stored baseline');

  const started = performance.now();
  const seeds = [];
  for (const seed of SEEDS) {
    const result = await runSeed(seed);
    seeds.push(result);
    await writeJson(output, `seed-${seed}.json`, result);
    console.log(JSON.stringify({ seed, births: {
      natural: result.arms.natural.births.map(birth => [birth.timeSeconds, birth.lineage]),
      candidateReset: result.arms.candidateReset.births.map(birth => [birth.timeSeconds, birth.lineage])
    }, wallSeconds: (performance.now() - started) / 1000 }));
  }
  const allNaturalBirths = seeds.flatMap(seed => seed.arms.natural.births);
  const resetBirths = seeds.flatMap(seed => seed.arms.candidateReset.births);
  const naturalClasses = allNaturalBirths.map(birth => birth.lineage);
  const hasPreGap = naturalClasses.includes('PRE-GAP');
  const hasPostGap = naturalClasses.includes('POST-GAP') || resetBirths.some(birth => birth.lineage === 'POST-GAP');
  const decision = hasPreGap && hasPostGap ? 'MIXED'
    : hasPostGap ? 'RETAINED ENVIRONMENT REGENERATES FORMATION'
      : naturalClasses.length > 0 && naturalClasses.every(value => value === 'PRE-GAP') && resetBirths.length === 0
        ? 'LATENT COMPLETION ONLY' : 'INCONCLUSIVE';
  const manifest = {
    title: 'TrailPlateBirth zero-ant gap candidate-lineage audit',
    baseline: { commit: BASELINE, branchAtRun: git('branch --show-current'), headAtRun: git('rev-parse HEAD') },
    conditions: { seeds: SEEDS, hz: 60, naturalUntilSeconds: 400, zeroAntStartSeconds: 400,
      zeroAntEndSeconds: 460, zeroAntTicks: GAP_TICKS, audioBridge: false, productionMaterialLaw: 'default On' },
    naturalReplay: { path: relativeToRoot(replayPath), sha256: await hashFile(replayPath), exactCanonicalMatch: true,
      canonicalPath: relativeToRoot(canonicalReplayPath), canonicalSha256: await hashFile(canonicalReplayPath) },
    timing: 'AntController.tick(1/60) remains unchanged. The 400 s arrival tick completes before agent removal; the gap begins after that tick and each subsequent 1 s TrailPlateBirth analysis boundary is sampled after production advance.',
    pairedPrefixCheck: 'At tick 0 and every 60 ticks through 400 s, both controllers are deeply compared across all controller-owned values with callback/listener/factory references normalized and RNG state/call count included. The fresh isolated 600 s natural replay exactly matches its canonical output. V8 whole-object hashes are used only for before/after purity on one instance; across two live instances those hashes differed despite value-deep-equal state, so they are not used as cross-arm equality evidence.',
    candidateContinuity: 'Lineage continuity uses production TrailPlateBirth.startedAtMs, which is retained only when adjacent selected corridors meet the implementation similarity threshold (mask/path max similarity >= 0.6). Candidate geometry hashes and birth descriptor mask/path are recorded; unmatched identity remains AMBIGUOUS.',
    counterfactual: 'Matched controller fork; after the existing zero-ant boundary removal/flush, only candidate is set to null in candidateReset. All other controller and TrailPlateBirth fields, including environmental memory, Plates, birthRecords, clocks and RNG, are compared before the gap.',
    gapSemantics: 'Research-only forced removal via beginZeroAntIntervention; nextSpawnTimeMs is set to Infinity. Production tick continues for exactly 3,600 fixed ticks. No production code is modified.',
    decision,
    productionSourceDiffFromBaseline: git('diff --name-only ' + BASELINE + ' HEAD -- src package.json package-lock.json'),
    sourceHashes: await sourceHashes(),
    results: seeds.map(seed => ({ seed: seed.seed, pairedPrefixCheckpoints: seed.prefix.checkpoints,
      gapValidity: seed.validity, naturalBirths: seed.arms.natural.births.length,
      candidateResetBirths: seed.arms.candidateReset.births.length })),
    reproduction: 'node docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs test-results/ant-plate-gap-lineage-natural-replay-repro-20261013.json; node scripts/ant-zero-ant-plate-gap-lineage.js --natural-replay=test-results/ant-plate-gap-lineage-natural-replay-repro-20261013.json --output=test-results/ant-plate-gap-lineage-repro-20261013',
    wallSeconds: (performance.now() - started) / 1000
  };
  await writeJson(output, 'manifest.json', manifest);
  console.log(JSON.stringify({ complete: true, output: outputArg, decision, wallSeconds: manifest.wallSeconds }));
}

async function runSeed(seed) {
  const arms = ['natural', 'candidateReset'].map(name => {
    const random = countedLcg(seed);
    const controller = new AntController({ random });
    return { name, random, controller };
  });
  for (const arm of arms) {
    await arm.controller.init();
    assert.equal(arm.controller.materialLocomotionResistance, true);
    assert.equal(arm.controller.audioBridge, null);
  }

  let samples = 0;
  const recordPrefix = tick => {
    assert.deepEqual(controllerComparableState(arms[0].controller, arms[0].random),
      controllerComparableState(arms[1].controller, arms[1].random), `paired prefix diverged at tick ${tick}`);
    samples += 1;
  };
  recordPrefix(0);
  for (let tick = 0; tick < GAP_START_SECONDS * 60; tick += 1) {
    for (const arm of arms) arm.controller.tick(DT);
    if ((tick + 1) % 60 === 0) recordPrefix(tick + 1);
  }
  assert.equal(samples, 401);
  assert.ok(Math.abs(arms[0].controller.simulationTimeMs - 400000) < 1e-5);

  const entryCandidates = arms.map(arm => cloneCandidate(arm.controller.trailPlateBirth.candidate));
  const entryClockMs = arms[0].controller.simulationTimeMs;
  assert.deepEqual(controllerComparableState(arms[0].controller, arms[0].random),
    controllerComparableState(arms[1].controller, arms[1].random));
  const interventions = arms.map(arm => beginZeroAntIntervention(arm.controller));
  assert.deepEqual(interventionBrief(interventions[0]), interventionBrief(interventions[1]));
  for (const arm of arms) assertZeroAgentState(arm.controller);
  const gapEntryHashes = arms.map(({ controller, random }) => controllerStateHash(controller, random));
  assert.deepEqual(controllerComparableState(arms[0].controller, arms[0].random),
    controllerComparableState(arms[1].controller, arms[1].random), 'arms differ before candidate-only intervention');
  const retainedStateBeforeClear = arms.map(({ controller, random }) => observeRetainedState(controller, random));
  assert.deepEqual(retainedStateBeforeClear[0], retainedStateBeforeClear[1]);
  for (let index = 0; index < arms.length; index += 1) {
    assert.equal(controllerStateHash(arms[index].controller, arms[index].random), gapEntryHashes[index],
      'gap-entry observer changed controller state');
  }

  arms[1].controller.trailPlateBirth.candidate = null;
  assertOnlyCandidateDiffers(arms[0].controller, arms[1].controller, arms[0].random, arms[1].random);
  const gapStartState = arms.map(({ controller, random }) => observeRetainedState(controller, random));
  assert.deepEqual(gapStartState[0], gapStartState[1], 'candidate reset changed retained non-candidate state');

  const watchers = arms.map(arm => watchGap(arm.controller));
  const observations = arms.map(() => []);
  const births = arms.map(() => []);
  const gapStartRng = arms.map(({ random }) => [random.state(), random.calls]);
  const spawnedRetired = arms.map(({ controller }) => [controller.totalSpawned, controller.totalRetired]);
  const footContactEntry = arms.map(({ controller }) => hash(controller.trailPlateBirth.footContactCounts));
  const surfaceContactEntry = arms.map(({ controller }) => controller.surfaceField.getSnapshot().totalFootContacts);
  let previousAnalysis = arms.map(({ controller }) => controller.trailPlateBirth.lastAnalysisTimeMs);
  let previousPlateCount = arms.map(({ controller }) => controller.trailPlateBirth.plates.length);

  for (let tick = 0; tick < GAP_TICKS; tick += 1) {
    for (let index = 0; index < arms.length; index += 1) {
      const { controller, random } = arms[index];
      assertZeroAgentState(controller);
      const priorLastBirth = controller.trailPlateBirth.lastBirthTimeMs;
      const priorSimulationTime = controller.simulationTimeMs;
      watchers[index].clearTick();
      controller.tick(DT);
      assert.equal(controller.agents.length, 0, `ant exists in gap arm ${arms[index].name}, tick ${tick}`);
      assert.equal(controller.totalSpawned, spawnedRetired[index][0]);
      assert.equal(controller.totalRetired, spawnedRetired[index][1]);
      assert.equal(controller.simulationTimeMs > priorSimulationTime, true);
      assert.deepEqual([random.state(), random.calls], gapStartRng[index], 'gap consumed RNG');
      assert.equal(watchers[index].spawnCalls, 0, 'spawn method was called during gap');
      assert.equal(watchers[index].depositionCalls, 0, 'pheromone deposition occurred during gap');
      assert.equal(watchers[index].events.filter(([type]) => type === 'foot-contact').length, 0,
        'FOOT_CONTACT occurred during gap');
      assert.deepEqual(watchers[index].events.filter(([type]) => type !== 'plate-birth' && type !== 'sphere-birth'), [],
        'ant-origin or unclassified event occurred during gap');
      assertZeroAgentState(controller);
      assert.equal(hash(controller.trailPlateBirth.footContactCounts), footContactEntry[index],
        'footContactCounts changed during gap');
      assert.equal(controller.surfaceField.getSnapshot().totalFootContacts, surfaceContactEntry[index],
        'SurfaceField contact count changed during gap');

      const trail = controller.trailPlateBirth;
      if (trail.lastAnalysisTimeMs !== previousAnalysis[index]) {
        const purityHash = controllerStateHash(controller, random);
        const row = observeAnalysisBoundary(controller, arms[index].name, entryCandidates[index], entryClockMs);
        assert.equal(controllerStateHash(controller, random), purityHash, 'boundary observer changed controller state');
        observations[index].push(row);
        previousAnalysis[index] = trail.lastAnalysisTimeMs;
        const newPlates = trail.plates.slice(previousPlateCount[index]);
        for (const descriptor of newPlates) {
          const candidate = trail.candidate;
          const exactMatch = candidateMatchesDescriptor(candidate, descriptor);
          const birth = {
            id: descriptor.id,
            bornAtSimulationTimeMs: descriptor.bornAtSimulationTimeMs,
            timeSeconds: descriptor.bornAtSimulationTimeMs / 1000,
            lineage: classifyCandidateLineage({ gapEntryCandidate: entryCandidates[index],
              birthCandidate: candidate, descriptorMatches: exactMatch, gapEntryTimeMs: entryClockMs }),
            candidateAtBirth: candidateBrief(candidate),
            descriptorCandidateMatch: { exactMaskAndPath: exactMatch,
              maskSha256: hash(descriptor.mask), principalPathSha256: hash(descriptor.principalPath) },
            gates: gateSnapshot({ candidate, priorLastBirth, nowMs: descriptor.bornAtSimulationTimeMs,
              newFootContactsDuringGap: watchers[index].events.filter(([type]) => type === 'foot-contact').length,
              footContactCountsUnchanged: hash(trail.footContactCounts) === footContactEntry[index] }),
            descriptor: { provenance: descriptor.provenance, metrics: descriptor.metrics,
              geometrySha256: hash({ mask: descriptor.mask, path: descriptor.principalPath,
                source: descriptor.source, target: descriptor.target }) },
            gapEntryContactCountsSha256: footContactEntry[index],
            birthRecord: serializableRecord(trail.birthRecords.at(-1))
          };
          births[index].push(birth);
        }
        previousPlateCount[index] = trail.plates.length;
      }
    }
  }

  for (const watcher of watchers) watcher.restore();
  const armsResult = arms.map((arm, index) => {
    const controller = arm.controller;
    assert.ok(Math.abs((controller.simulationTimeMs - entryClockMs) - 60000) < 1e-5);
    assert.equal(controller.agents.length, 0);
    assert.equal(watchers[index].spawnCalls, 0);
    assert.equal(watchers[index].depositionCalls, 0);
    assert.equal(hash(controller.trailPlateBirth.footContactCounts), footContactEntry[index]);
    assert.equal(controller.surfaceField.getSnapshot().totalFootContacts, surfaceContactEntry[index]);
    assert.ok(controller.trailPlateBirth.lastAnalysisTimeMs >= (GAP_END_SECONDS - 1) * 1000 - 1e-5);
    return {
      name: arm.name,
      candidateAtGapEntry: candidateBrief(entryCandidates[index]),
      candidateAtGapExit: candidateBrief(controller.trailPlateBirth.candidate),
      birthCountAtEntry: gapStartState[index].plateCount,
      birthCountAtExit: controller.trailPlateBirth.plates.length,
      observations: observations[index],
      births: births[index],
      gapCounters: { spawnCalls: watchers[index].spawnCalls, pheromoneDepositionCalls: watchers[index].depositionCalls,
        footContactEvents: watchers[index].events.filter(([type]) => type === 'foot-contact').length,
        totalSpawnedUnchanged: controller.totalSpawned === spawnedRetired[index][0],
        totalRetiredUnchanged: controller.totalRetired === spawnedRetired[index][1],
        rngUnchanged: randomStateEquals(arm.random, gapStartRng[index]),
        footContactCountsUnchanged: hash(controller.trailPlateBirth.footContactCounts) === footContactEntry[index],
        surfaceFootContactsUnchanged: controller.surfaceField.getSnapshot().totalFootContacts === surfaceContactEntry[index] }
    };
  });
  const gapTicks = GAP_TICKS;
  const result = {
    seed,
    prefix: { checkpoints: samples, pairedProductionValueDeepCompare: true,
      externalCanonicalNaturalReplayExactMatch: true },
    intervention: { atSimulationTimeMs: entryClockMs, durationTicks: gapTicks, durationSeconds: gapTicks / 60,
      naturalCandidateAtEntry: candidateBrief(entryCandidates[0]),
      candidateResetWasOnlyStateChangeAtFork: true, removedAntIds: interventions[0].removedIds,
      forcedRemovedAntCount: interventions[0].removedIds.length,
      boundaryRetirementFlush: interventionBrief(interventions[0]),
      retainedNonCandidateStateSha256: hash(gapStartState[0]),
      candidateOnlyProjectionVerified: true },
    validity: { allGapTicksZeroAnt: armsResult.every(arm => arm.gapCounters.totalSpawnedUnchanged
        && arm.gapCounters.totalRetiredUnchanged), gapTicks,
      clockDeltaMs: arms.map(({ controller }) => controller.simulationTimeMs - entryClockMs),
      noSpawn: armsResult.every(arm => arm.gapCounters.spawnCalls === 0),
      noPheromoneDeposition: armsResult.every(arm => arm.gapCounters.pheromoneDepositionCalls === 0),
      noFootContact: armsResult.every(arm => arm.gapCounters.footContactEvents === 0),
      noPerAntStateAtExit: arms.every(({ controller }) => assertZeroAgentState(controller)),
      noRngConsumption: armsResult.every(arm => arm.gapCounters.rngUnchanged),
      noContactCountGrowth: armsResult.every(arm => arm.gapCounters.footContactCountsUnchanged
        && arm.gapCounters.surfaceFootContactsUnchanged) },
    arms: { natural: armsResult[0], candidateReset: armsResult[1] }
  };
  for (const arm of arms) await arm.controller.destroy();
  return result;
}

function observeAnalysisBoundary(controller, armName, gapEntryCandidate, gapEntryTimeMs) {
  const trail = controller.trailPlateBirth;
  const candidate = trail.candidate;
  const trailSnapshot = trail.getSnapshot();
  const pheromone = controller.field.getSnapshot();
  const surface = controller.surfaceField.getSnapshot();
  return {
    arm: armName,
    simulationTimeMs: controller.simulationTimeMs,
    analysisTimeMs: trail.lastAnalysisTimeMs,
    candidate: candidateBrief(candidate),
    lineageFromGapEntry: candidate && gapEntryCandidate
      ? (candidate.startedAtMs === gapEntryCandidate.startedAtMs ? 'same-entry-lineage' : 'different-lineage')
      : candidate ? 'post-entry-candidate' : 'none',
    candidateAtEntryGeometrySha256: gapEntryCandidate ? candidateGeometryHash(gapEntryCandidate) : null,
    candidateAtCurrentGeometrySha256: candidate ? candidateGeometryHash(candidate) : null,
    input: { ...trailSnapshot.inputDiagnostics,
      chemicalMemory: arraySummary(trail.chemicalMemory),
      footContactCounts: arraySummary(trail.footContactCounts),
      pheromone: arraySummary(pheromone.values), surface: arraySummary(surface.values),
      surfaceFootContacts: surface.totalFootContacts },
    priorBirthAndGates: { lastBirthTimeMs: Number.isFinite(trail.lastBirthTimeMs) ? trail.lastBirthTimeMs : null,
      globalBirthGapRemainingSeconds: Number.isFinite(trail.lastBirthTimeMs)
        ? Math.max(0, 10000 - (trail.lastAnalysisTimeMs - trail.lastBirthTimeMs)) / 1000 : 0,
      birthRecordCount: trail.birthRecords.length, plateCount: trail.plates.length },
    gapEntryTimeMs
  };
}

function candidateBrief(candidate) {
  if (!candidate) return null;
  return { startedAtMs: candidate.startedAtMs, stableSeconds: candidate.stableSeconds,
    similarity: candidate.similarity, source: candidate.source, target: candidate.target,
    geodesicLength: candidate.geodesicLength, meanChemical: candidate.meanChemical,
    meanSupport: candidate.meanSupport, footContacts: candidate.footContacts,
    repeatDiagnostics: candidate.repeatDiagnostics,
    path: { length: candidate.path.length, sha256: hash(candidate.path) },
    ribbonMaskSha256: hash(candidate.mask), supportedMaskSha256: hash(candidate.supportedMask),
    geometrySha256: candidateGeometryHash(candidate) };
}

function candidateGeometryHash(candidate) {
  return hash({ mask: Array.from(candidate.mask), supportedMask: Array.from(candidate.supportedMask),
    path: candidate.path, source: candidate.source, target: candidate.target });
}

function gateSnapshot({ candidate, priorLastBirth, nowMs, newFootContactsDuringGap, footContactCountsUnchanged }) {
  const repeat = candidate.repeatDiagnostics;
  const globalRemaining = Number.isFinite(priorLastBirth)
    ? Math.max(0, 10000 - (nowMs - priorLastBirth)) / 1000 : 0;
  return { stableSeconds: candidate.stableSeconds, persistenceRequiredSeconds: 20,
    persistenceSatisfied: candidate.stableSeconds >= 20,
    lastBirthTimeMsBeforeBirth: Number.isFinite(priorLastBirth) ? priorLastBirth : null,
    globalBirthGapRemainingSecondsBeforeBirth: globalRemaining,
    globalBirthGapSatisfied: globalRemaining <= 1e-9,
    sameCorridorPriorBirthId: repeat?.plateId ?? null,
    repeatNewFootContacts: repeat?.newFootContacts ?? null,
    repeatRequiredNewFootContacts: repeat ? 30 : null,
    repeatContactGateSatisfied: repeat ? repeat.newFootContacts >= 30 : null,
    repeatRefractoryRemainingSeconds: repeat?.refractoryRemainingSeconds ?? null,
    repeatRefractorySatisfied: repeat ? repeat.refractoryRemainingSeconds <= 1e-9 : null,
    actualNewFootContactEventsInBirthTick: newFootContactsDuringGap,
    footContactCountsUnchangedThroughoutGap: footContactCountsUnchanged,
    contactCountsInterpretation: repeat
      ? 'repeat evidence is accumulated contact count retained from before the gap; no gap FOOT_CONTACT occurred'
      : 'no same-corridor prior-birth repeat gate applied' };
}

function observeRetainedState(controller, random) {
  const trail = controller.trailPlateBirth;
  return { clockMs: controller.simulationTimeMs, rngState: random.state(), rngCalls: random.calls,
    pheromoneSha256: hash(controller.field.getSnapshot().values),
    surfaceSha256: hash(controller.surfaceField.getSnapshot().values),
    chemicalMemorySha256: hash(trail.chemicalMemory), footContactCountsSha256: hash(trail.footContactCounts),
    platesSha256: hash(trail.plates), birthRecordsSha256: hash(trail.birthRecords),
    materialSha256: hash(controller.materialStratigraphy.getSnapshot()),
    lastAnalysisTimeMs: trail.lastAnalysisTimeMs,
    lastBirthTimeMs: Number.isFinite(trail.lastBirthTimeMs) ? trail.lastBirthTimeMs : null,
    plateCount: trail.plates.length, birthRecordCount: trail.birthRecords.length,
    totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired };
}

function assertOnlyCandidateDiffers(a, b, rngA, rngB) {
  assert.deepEqual([rngA.state(), rngA.calls], [rngB.state(), rngB.calls]);
  const ignored = new Set(['listeners', 'random', 'trailPlateBirth', 'audioBridge', 'fieldFactory']);
  assert.deepEqual(Object.keys(a).filter(key => !ignored.has(key)).sort(),
    Object.keys(b).filter(key => !ignored.has(key)).sort());
  for (const key of Object.keys(a)) if (!ignored.has(key)) assert.deepEqual(a[key], b[key], `fork differs at ${key}`);
  const trailA = { ...a.trailPlateBirth }, trailB = { ...b.trailPlateBirth };
  delete trailA.candidate;
  delete trailB.candidate;
  assert.deepEqual(trailA, trailB, 'candidate reset changed non-candidate TrailPlateBirth state');
  assert.equal(b.trailPlateBirth.candidate, null);
}

function assertZeroAgentState(controller) {
  assert.equal(controller.agents.length, 0);
  assert.equal(controller.gaitController.ants.size, 0);
  assert.equal(controller.bodyPoseController.ants.size, 0);
  assert.equal(controller.gasterDeposition.ants.size, 0);
  return true;
}

function watchGap(controller) {
  const result = { events: [], spawnCalls: 0, depositionCalls: 0, restore() {} };
  const unsubscribe = controller.subscribe(event => result.events.push([event.type, event.payload]));
  const originalSpawn = controller.spawnNextAnt;
  controller.spawnNextAnt = function (...args) { result.spawnCalls += 1; return originalSpawn.apply(this, args); };
  const field = controller.field;
  const pointDescriptor = Object.getOwnPropertyDescriptor(field, 'depositPoint');
  const segmentDescriptor = Object.getOwnPropertyDescriptor(field, 'depositSegment');
  const originalPoint = field.depositPoint, originalSegment = field.depositSegment;
  field.depositPoint = function (...args) { result.depositionCalls += 1; return originalPoint.apply(this, args); };
  field.depositSegment = function (...args) { result.depositionCalls += 1; return originalSegment.apply(this, args); };
  result.clearTick = () => { result.events = []; };
  result.restore = () => {
    unsubscribe?.();
    delete controller.spawnNextAnt;
    restoreFieldMethod(field, 'depositPoint', pointDescriptor);
    restoreFieldMethod(field, 'depositSegment', segmentDescriptor);
  };
  return result;
}

function restoreFieldMethod(field, name, descriptor) {
  if (descriptor) Object.defineProperty(field, name, descriptor);
  else delete field[name];
}

function controllerStateHash(controller, random) {
  return createHash('sha256').update(serialize(controllerComparableState(controller, random))).digest('hex');
}

function controllerComparableState(controller, random) {
  const owned = { ...controller, listeners: null, random: { value: random.state(), calls: random.calls },
    fieldFactory: null, audioBridge: null };
  if (Object.hasOwn(owned, 'spawnNextAnt')) delete owned.spawnNextAnt;
  if (Object.hasOwn(controller.field, 'depositPoint') || Object.hasOwn(controller.field, 'depositSegment')) {
    owned.field = { ...controller.field };
    delete owned.field.depositPoint;
    delete owned.field.depositSegment;
  }
  return owned;
}

function interventionBrief(value) {
  return { removedIds: value.removedIds, pendingDoseBeforeRemoval: value.pendingDoseBeforeRemoval,
    flushedDeposits: value.flushedDeposits, flushedDose: value.flushedDose,
    totalRetiredAfterIntervention: value.totalRetiredAfterIntervention };
}

function serializableRecord(record) {
  return record ? { id: record.id, bornAtSimulationTimeMs: record.bornAtSimulationTimeMs,
    footContactsAtBirth: record.footContactsAtBirth, corridorMaskSha256: hash(record.corridorMask),
    principalPathSha256: hash(record.principalPath) } : null;
}

function cloneCandidate(candidate) {
  if (!candidate) return null;
  return { ...candidate, source: { ...candidate.source }, target: { ...candidate.target },
    mask: new Uint8Array(candidate.mask), supportedMask: new Uint8Array(candidate.supportedMask),
    path: [...candidate.path], repeatDiagnostics: candidate.repeatDiagnostics ? { ...candidate.repeatDiagnostics } : null };
}

function arraySummary(values) {
  let sum = 0, max = 0, nonzero = 0;
  for (const value of values) { sum += value; max = Math.max(max, value); nonzero += Number(value !== 0); }
  return { length: values.length, sum, max, nonzero, sha256: hash(values) };
}

function sameArray(a, b) {
  const sequence = value => Array.isArray(value) || ArrayBuffer.isView(value);
  return sequence(a) && sequence(b) && a.length === b.length && Array.from(a).every((value, index) => value === b[index]);
}

function randomStateEquals(random, expected) { return random.state() === expected[0] && random.calls === expected[1]; }
function hash(value) { return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex'); }
function stableValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (ArrayBuffer.isView(value)) return { type: value.constructor.name, values: Array.from(value, stableValue) };
  if (Array.isArray(value)) return value.map(stableValue);
  if (value instanceof Map) return { type: 'Map', entries: [...value].map(([key, item]) => [stableValue(key), stableValue(item)]) };
  if (value instanceof Set) return { type: 'Set', values: [...value].map(stableValue) };
  if (typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, stableValue(value[key])]));
  return String(value);
}
async function hashFile(path) { return createHash('sha256').update(await readFile(path)).digest('hex'); }
async function writeJson(directory, name, value) {
  await writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
function relativeToRoot(path) { return path.replace(ROOT + '\\', '').replaceAll('\\', '/'); }
function git(args) {
  return execFileSync('git', args.split(' '), { cwd: ROOT, encoding: 'utf8' }).trim();
}

function countedLcg(seed) {
  let state = seed >>> 0, calls = 0;
  const random = () => { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  random.state = () => state;
  Object.defineProperty(random, 'calls', { get: () => calls });
  return random;
}

async function sourceHashes() {
  const paths = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/TrailPlateBirth.js',
    'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/PheromoneField.js',
    'src/lib/agents/ant/SurfaceField.js', 'scripts/ant-zero-ant-continuity-shadow.js',
    'scripts/ant-zero-ant-plate-gap-lineage.js',
    'docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs'];
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, await hashFile(resolve(ROOT, path))])));
}
