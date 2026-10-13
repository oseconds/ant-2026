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

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASELINE = '5b77f5707418a45001214321258fa2580c5fdc0c';
const BRANCH = 'research/ant-natural-nodule-opportunity-20261013';
const SEEDS = [20261005, 20261006, 20261007];
const HZ = 60;
const DT = 1 / HZ;
const TICKS = 600 * HZ;
const NODULE_RADIUS = Q.radiusRange[1];
const CANONICAL_REPLAY = 'docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.json';
const PRODUCTION_PATHS = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js'
];
const CLI = new Map(process.argv.slice(2).map(arg => {
  const split = arg.indexOf('=');
  return split < 0 ? [arg, true] : [arg.slice(0, split), arg.slice(split + 1)];
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export function censusNoduleOpportunity(material, surface, {
  nearbyPredicate = material._nearExistingNodule
} = {}) {
  const qCellIds = [];
  const aCellIds = [];
  const blockedCellIds = [];
  let predicateComparedQualifiedCells = 0;

  for (let cell = 0; cell < material.cellCount; cell += 1) {
    const gates = cellQualification(material, surface, cell);
    if (!gates.qualified) continue;
    qCellIds.push(cell);
    const { x, y } = cellPosition(material, cell);
    const productionNear = nearbyPredicate.call(material, x, y, NODULE_RADIUS);
    const diagnosticNear = material.nodules.some(nodule =>
      Math.hypot(nodule.position.x - x, nodule.position.y - y) < nodule.radius + NODULE_RADIUS);
    assert.equal(diagnosticNear, productionNear,
      'diagnostic proximity must equal MaterialStratigraphy._nearExistingNodule');
    predicateComparedQualifiedCells += 1;
    if (productionNear) blockedCellIds.push(cell);
    else aCellIds.push(cell);
  }

  return {
    qCellIds,
    aCellIds,
    blockedCellIds,
    qCount: qCellIds.length,
    aCount: aCellIds.length,
    qNotACount: blockedCellIds.length,
    blockedAmongQ: qCellIds.length ? blockedCellIds.length / qCellIds.length : null,
    predicateComparedQualifiedCells,
    predicateMismatches: 0,
  };
}

function cellQualification(material, surface, cell) {
  const column = material.columns[cell];
  const layerCount = column?.length || 0;
  const hasFoundation = layerCount >= Q.minimumOverlappingPlates
    && layerCount - 1 >= Q.minimumBuriedLayers;
  const { x, y } = cellPosition(material, cell);
  const sampledCompaction = hasFoundation ? finiteSurfaceSample(surface, x, y) : 0;
  const localFootLoad = hasFoundation ? material._localFootLoad(x, y, NODULE_RADIUS) : 0;
  const failedGates = [];
  if (!hasFoundation) failedGates.push('FOUNDATION');
  else {
    if (sampledCompaction < Q.minimumCompaction) failedGates.push('COMPACTION');
    if (localFootLoad < Q.minimumLocalFootLoad) failedGates.push('FOOT_LOAD');
  }
  return {
    cell, layerCount, buriedLayerCount: Math.max(0, layerCount - 1),
    hasFoundation, sampledCompaction, localFootLoad,
    qualified: failedGates.length === 0, failedGates
  };
}

export function installNoduleOpportunityObserver(controller) {
  const material = controller.materialStratigraphy;
  const surface = controller.surfaceField;
  const originals = Object.fromEntries(['addPlate', 'advance', '_nearExistingNodule'].map(name => [
    name, { descriptor: Object.getOwnPropertyDescriptor(material, name), method: material[name] }
  ]));
  const observer = { rows: [], pendingPlateResets: [], context: null, restored: false };

  Object.defineProperty(material, 'addPlate', {
    configurable: true, enumerable: false, writable: true,
    value: function (descriptor) {
      const priorTimers = [];
      const mask = descriptor?.mask;
      if (material.nodules.length < material.maxNodules
        && (Array.isArray(mask) || ArrayBuffer.isView(mask))) {
        for (let cell = 0; cell < Math.min(mask.length, material.cellCount); cell += 1) {
          if (mask[cell] === 1 && material.candidateSinceMs[cell] >= 0) {
            priorTimers.push([cell, material.candidateSinceMs[cell]]);
          }
        }
      }
      const added = originals.addPlate.method.call(this, descriptor);
      if (added) {
        for (const [cell, candidateSinceMs] of priorTimers) {
          if (material.candidateSinceMs[cell] === -1) {
            observer.pendingPlateResets.push({
              type: 'PLATE_RESET', timeMs: descriptor.bornAtSimulationTimeMs,
              cell, plateId: descriptor.id, candidateSinceMs
            });
          }
        }
      }
      return added;
    }
  });

  Object.defineProperty(material, '_nearExistingNodule', {
    configurable: true, enumerable: false, writable: true,
    value: function (x, y, radius) {
      const near = originals._nearExistingNodule.method.call(this, x, y, radius);
      const context = observer.context;
      if (context) {
        const cell = cellIndex(material, x, y);
        const candidateSinceMs = material.candidateSinceMs[cell];
        const nearbyNoduleIds = material.nodules.filter(nodule =>
          Math.hypot(nodule.position.x - x, nodule.position.y - y) < nodule.radius + radius)
          .map(nodule => nodule.id);
        assert.equal(near, nearbyNoduleIds.length > 0,
          'recorded production maturity predicate must equal its exact distance expansion');
        context.maturities.push({
          timeMs: context.timeMs, cell, candidateSinceMs,
          persistenceAgeMs: context.timeMs - candidateSinceMs,
          nearby: near, nearbyNoduleIds
        });
        if (!near && material.nodules.length === material.maxNodules - 1
          && !context.capCrossingPreBirth) {
          context.capCrossingPreBirth = {
            noduleCount: material.nodules.length,
            maxNodules: material.maxNodules,
            ...censusNoduleOpportunity(material, surface, {
              nearbyPredicate: originals._nearExistingNodule.method
            })
          };
        }
      }
      return near;
    }
  });

  Object.defineProperty(material, 'advance', {
    configurable: true, enumerable: false, writable: true,
    value: function (options) {
      const timeMs = options?.simulationTimeMs;
      const lastEvaluationTimeMs = material.lastNoduleEvaluationTimeMs;
      const noduleCountBefore = material.nodules.length;
      const capBefore = noduleCountBefore >= material.maxNodules;
      const willEvaluate = Number.isFinite(timeMs) && timeMs >= 0
        && (material.lastAdvanceTimeMs === null || timeMs >= material.lastAdvanceTimeMs)
        && (material.lastAdvanceTimeMs === null
          || timeMs - material.lastNoduleEvaluationTimeMs >= Q.minimumSampleIntervalMs);
      const timersBefore = willEvaluate && !capBefore ? material.candidateSinceMs.slice() : null;
      const activeTimerCountBefore = willEvaluate && capBefore
        ? countActiveTimers(material.candidateSinceMs) : null;
      const preEvaluationCensus = willEvaluate
        ? censusNoduleOpportunity(material, surface, {
          nearbyPredicate: originals._nearExistingNodule.method
        }) : null;
      const gapReset = willEvaluate && !capBefore && material.lastAdvanceTimeMs !== null
        && timeMs - material.lastAdvanceTimeMs > Q.maximumGapForPersistenceMs;
      const previousContext = observer.context;
      const callContext = willEvaluate ? { timeMs, maturities: [], capCrossingPreBirth: null } : null;
      observer.context = callContext;
      let born;
      try {
        born = originals.advance.method.call(this, options);
      } finally {
        observer.context = previousContext;
      }
      if (material.lastNoduleEvaluationTimeMs === lastEvaluationTimeMs) return born;
      assert.ok(willEvaluate, 'production evaluation boundary must match the observer boundary');

      const capAfter = material.nodules.length >= material.maxNodules;
      const capEarlyReturn = capBefore && capAfter;
      const postEvaluationCensus = censusNoduleOpportunity(material, surface, {
        nearbyPredicate: originals._nearExistingNodule.method
      });
      const census = preEvaluationCensus || postEvaluationCensus;
      const row = {
        timeMs: material.lastNoduleEvaluationTimeMs,
        noduleCountBefore: noduleCountBefore,
        noduleCount: material.nodules.length,
        maxNodules: material.maxNodules,
        capReached: capAfter,
        qCellIds: census.qCellIds,
        aCellIds: census.aCellIds,
        blockedCellIds: census.blockedCellIds,
        qCount: census.qCount,
        aCount: census.aCount,
        qNotACount: census.qNotACount,
        blockedAmongQ: census.blockedAmongQ,
        predicateComparedQualifiedCells: census.predicateComparedQualifiedCells,
        predicateMismatches: census.predicateMismatches
      };
      if (!sameOpportunityCensus(census, postEvaluationCensus)) {
        row.postEvaluationCensus = censusRecord(postEvaluationCensus);
      }

      if (capEarlyReturn) {
        const activeTimerCountAfter = countActiveTimers(material.candidateSinceMs);
        assert.equal(activeTimerCountAfter, 0,
          'production cap early return must leave no candidate timers');
        row.mode = 'post-cap-census-only';
        row.productionCapEarlyReturn = {
          actual: true,
          activeTimerCountBefore,
          activeTimerCountAfter,
          clearedTimerCount: activeTimerCountBefore - activeTimerCountAfter
        };
      } else {
        row.mode = capAfter ? 'cap-crossing-evaluation' : 'pre-cap-evaluation';
        row.activeTimers = activeTimerRows(material.candidateSinceMs);
        row.timerEvents = buildTimerEvents({
          material, surface, timersBefore, timeMs: row.timeMs,
          gapReset, maturities: callContext?.maturities || [],
          births: born || [], plateResets: observer.pendingPlateResets.splice(0)
        });
        if (capAfter) {
          assert.ok(callContext?.capCrossingPreBirth,
            'cap crossing must preserve the actual pre-birth Q/A census');
          row.capCrossingPreBirth = {
            timeMs: row.timeMs, ...callContext.capCrossingPreBirth
          };
        }
      }
      observer.rows.push(row);
      return born;
    }
  });

  return {
    rows: observer.rows,
    restore() {
      if (observer.restored) return;
      for (const name of ['addPlate', 'advance', '_nearExistingNodule']) {
        const descriptor = originals[name].descriptor;
        if (descriptor) Object.defineProperty(material, name, descriptor);
        else delete material[name];
      }
      observer.restored = true;
    }
  };
}

function buildTimerEvents({ material, surface, timersBefore, timeMs, gapReset, maturities,
  births, plateResets }) {
  const birthByCell = new Map(births.map(nodule => [
    cellIndex(material, nodule.position.x, nodule.position.y), nodule
  ]));
  const maturityCells = new Set(maturities.map(event => event.cell));
  const timerStarts = [];
  const qualificationLosses = [];
  const gapResets = [];
  for (let cell = 0; cell < material.cellCount; cell += 1) {
    const before = timersBefore[cell];
    const after = material.candidateSinceMs[cell];
    if (before < 0 && after >= 0) timerStarts.push({ cell, candidateSinceMs: after });
    if (before >= 0 && gapReset) {
      gapResets.push({ cell, candidateSinceMs: before, resetAtMs: timeMs });
      continue;
    }
    if (before >= 0 && after < 0 && !maturityCells.has(cell)) {
      const gate = cellQualification(material, surface, cell);
      if (!gate.qualified) {
        qualificationLosses.push({
          cell, candidateSinceMs: before, failedGates: gate.failedGates,
          layerCount: gate.layerCount, compaction: gate.sampledCompaction,
          localFootLoad: gate.localFootLoad
        });
      } else {
        assert.ok(gapReset, 'qualified timer clear must match a production maturity or long-gap reset');
      }
    }
  }
  const maturityEvents = maturities.map(event => {
    const nodule = birthByCell.get(event.cell);
    if (!event.nearby) assert.ok(nodule, 'non-nearby production maturity must produce a Nodule');
    return {
      ...event,
      outcome: event.nearby ? 'ACTUAL_NEARBY_REJECTION' : 'ACTUAL_BIRTH',
      noduleId: nodule?.id ?? null
    };
  });
  return {
    timerStarts,
    plateResets,
    qualificationLosses,
    gapResets,
    maturities: maturityEvents,
    actualNearbyRejections: maturityEvents.filter(event => event.nearby),
    births: births.map(nodule => ({
      id: nodule.id, cell: cellIndex(material, nodule.position.x, nodule.position.y),
      timeMs: nodule.bornAtSimulationTimeMs, position: nodule.position, radius: nodule.radius,
      persistenceAgeMs: nodule.bornAtSimulationTimeMs
        - timersBefore[cellIndex(material, nodule.position.x, nodule.position.y)]
    }))
  };
}

function summarizeNaturalRun(rows, terminalClockEndCensus) {
  const firstQ = rows.find(row => row.qCount > 0);
  const firstA = rows.find(row => row.aCount > 0);
  const births = rows.flatMap(row => row.timerEvents?.births || []);
  const capCrossing = rows.find(row => row.mode === 'cap-crossing-evaluation');
  const capClear = rows.find(row => row.productionCapEarlyReturn);
  const postCap = rows.filter(row => row.mode === 'post-cap-census-only');
  const afterEvaluation = row => row.postEvaluationCensus || row;
  const qTotal = rows.reduce((sum, row) => sum + row.qCount, 0);
  const blockedTotal = rows.reduce((sum, row) => sum + row.qNotACount, 0);
  const nonNullRatios = rows.map(row => row.blockedAmongQ).filter(value => value !== null);
  const actualMaturities = rows.flatMap(row => row.timerEvents?.maturities || []);
  const actualNearbyRejections = rows.flatMap(row => row.timerEvents?.actualNearbyRejections || []);
  const qualificationLosses = rows.flatMap(row => row.timerEvents?.qualificationLosses || []);
  const plateResets = rows.flatMap(row => row.timerEvents?.plateResets || []);
  return {
    firstQAppearanceMs: firstQ?.timeMs ?? null,
    firstACellAppearanceMs: firstA?.timeMs ?? null,
    births,
    firstCapCrossing: capCrossing ? {
      timeMs: capCrossing.timeMs, countBefore: capCrossing.noduleCountBefore,
      countAfter: capCrossing.noduleCount, maxNodules: capCrossing.maxNodules,
      qCountAfterBirth: afterEvaluation(capCrossing).qCount,
      aCountAfterBirth: afterEvaluation(capCrossing).aCount,
      qNotAAfterBirth: afterEvaluation(capCrossing).qNotACount,
      qCountBeforeBirth: capCrossing.capCrossingPreBirth.qCount,
      aCountBeforeBirth: capCrossing.capCrossingPreBirth.aCount,
      qNotABeforeBirth: capCrossing.capCrossingPreBirth.qNotACount,
      qCellIdsBeforeBirth: capCrossing.capCrossingPreBirth.qCellIds,
      aCellIdsBeforeBirth: capCrossing.capCrossingPreBirth.aCellIds,
      blockedCellIdsBeforeBirth: capCrossing.capCrossingPreBirth.blockedCellIds,
      qCellIdsAfterBirth: afterEvaluation(capCrossing).qCellIds,
      aCellIdsAfterBirth: afterEvaluation(capCrossing).aCellIds
    } : null,
    firstProductionCapEarlyReturn: capClear ? {
      timeMs: capClear.timeMs, ...capClear.productionCapEarlyReturn
    } : null,
    capAfterCensus: {
      evaluationCountThrough600Seconds: postCap.length,
      firstEvaluationMs: postCap[0]?.timeMs ?? null,
      lastEvaluationMs: postCap.at(-1)?.timeMs ?? null,
      qCountAtFirst: postCap[0] ? afterEvaluation(postCap[0]).qCount : null,
      aCountAtFirst: postCap[0] ? afterEvaluation(postCap[0]).aCount : null,
      qCountAtLast: postCap.length ? afterEvaluation(postCap.at(-1)).qCount : null,
      aCountAtLast: postCap.length ? afterEvaluation(postCap.at(-1)).aCount : null,
      qCountAt600Seconds: terminalClockEndCensus?.qCount ?? null,
      aCountAt600Seconds: terminalClockEndCensus?.aCount ?? null,
      qNotAAt600Seconds: terminalClockEndCensus?.qNotACount ?? null,
      qCellIdsAt600Seconds: terminalClockEndCensus?.qCellIds ?? [],
      aCellIdsAt600Seconds: terminalClockEndCensus?.aCellIds ?? [],
      blockedCellIdsAt600Seconds: terminalClockEndCensus?.blockedCellIds ?? [],
      anyQualifiedCellAfterCap: postCap.some(row => afterEvaluation(row).qCount > 0)
        || (terminalClockEndCensus?.qCount ?? 0) > 0,
      anySpatiallyUnblockedQCellAfterCap: postCap.some(row => row.aCount > 0)
        || (terminalClockEndCensus?.aCount ?? 0) > 0,
      evaluationsWithSpatiallyUnblockedQCells: postCap.filter(row => afterEvaluation(row).aCount > 0)
        .map(row => ({ timeMs: row.timeMs, qCount: afterEvaluation(row).qCount,
          aCount: afterEvaluation(row).aCount, qNotACount: afterEvaluation(row).qNotACount,
          aCellIds: afterEvaluation(row).aCellIds }))
    },
    exclusionAmongQualifiedCellEvaluations: {
      qCellEvaluations: qTotal,
      qNotACellEvaluations: blockedTotal,
      proportion: qTotal ? blockedTotal / qTotal : null,
      minimumPerEvaluation: nonNullRatios.length ? Math.min(...nonNullRatios) : null,
      meanPerEvaluation: nonNullRatios.length
        ? nonNullRatios.reduce((sum, value) => sum + value, 0) / nonNullRatios.length : null,
      maximumPerEvaluation: nonNullRatios.length ? Math.max(...nonNullRatios) : null
    },
    actualSequenceCounts: {
      maturedProductionTimerCalls: actualMaturities.length,
      actualNearbyRejections: actualNearbyRejections.length,
      actualBirths: births.length,
      qualificationLosses: qualificationLosses.length,
      plateTimerResets: plateResets.length,
      resetsByGate: countBy(qualificationLosses, loss => loss.failedGates.join('+'))
    }
  };
}

async function main() {
  assert.equal(git('branch --show-current'), BRANCH, 'run only on the named research branch');
  assert.equal(git('merge-base ' + BASELINE + ' HEAD'), BASELINE,
    'research branch must descend from the verified current-main commit');
  assert.equal(git('status --porcelain -- src package.json package-lock.json'), '',
    'production sources and dependencies must be unchanged');
  assert.equal(git('diff --name-only ' + BASELINE + ' HEAD -- src package.json package-lock.json'), '',
    'research pass must not change production sources or dependencies');
  const outputArg = CLI.get('--output');
  assert.ok(typeof outputArg === 'string' && outputArg, 'pass --output=<fresh directory>');
  const output = resolve(ROOT, outputArg);
  await mkdir(output, { recursive: true });
  assert.deepEqual(await readdir(output), [], 'output directory must be fresh and empty');
  const canonicalPath = resolve(ROOT, CANONICAL_REPLAY);
  const canonical = JSON.parse(await readFile(canonicalPath, 'utf8'));
  assert.deepEqual(canonical.results.map(value => value.seed), SEEDS);

  const started = performance.now();
  const seeds = [];
  for (const seed of SEEDS) {
    const result = await runSeed(seed, canonical);
    seeds.push(result);
    await writeJson(output, 'seed-' + seed + '.json', result);
    console.log(JSON.stringify({
      seed, evaluations: result.observations.length,
      firstQ: result.summary.firstQAppearanceMs, firstA: result.summary.firstACellAppearanceMs,
      births: result.summary.births.length,
      cap: result.summary.firstCapCrossing?.timeMs ?? null,
      postCapA: result.summary.capAfterCensus.anySpatiallyUnblockedQCellAfterCap,
      wallSeconds: (performance.now() - started) / 1000
    }));
  }

  const productionDiff = git('diff --name-only ' + BASELINE + ' HEAD -- src package.json package-lock.json');
  assert.equal(productionDiff, '');
  const manifest = {
    title: 'Natural 600 s Nodule qualification, admissibility, maturity, and cap census',
    baseline: { commit: BASELINE, branch: BRANCH, head: git('rev-parse HEAD') },
    contract: {
      seeds: SEEDS, hz: HZ, seconds: 600, ticksPerSeed: TICKS,
      materialLocomotionResistance: 'default On',
      audioBridge: false,
      productionSourceDiff: productionDiff,
      noduleQualification: Q,
      q: 'Foundation, compaction >= threshold, and production local FOOT_CONTACT load >= threshold.',
      a: 'Q cell for which MaterialStratigraphy._nearExistingNodule is false using production radius and strict distance comparison.',
      m: 'Actual production candidate timer reaching persistenceMs and the actual proximity rejection or Nodule birth.',
      k: 'Actual nodules.length and maxNodules; post-cap timer census is not reconstructed.'
    },
    canonicalReplay: {
      path: CANONICAL_REPLAY,
      sha256: await hashFile(canonicalPath),
      productionOnlyReferenceRunEquality: 'all canonical summary fields except ownStateV8Sha256 match',
      observerRunEquality: 'all non-V8 summary fields match; complete state matches the production-only reference by stableStateHash',
      serializerNote: 'V8 own-state serialization hashes differ from the separate canonical runner despite equal normalized state digests and all other canonical fields; the byte-level cause is not isolated and the hash is not used as state-parity evidence',
      equalityFields: ['population', 'spawned', 'retired', 'contacts', 'plateCount', 'noduleCount',
        'rngState', 'rngCalls', 'pheromoneSha256', 'surfaceSha256', 'agentsJsonSha256'],
      completeStateEquality: 'stableStateHash sorts object keys, preserves array and Map order, and matches among canonical reference, observer-off, and observer-on runs'
    },
    validity: {
      observerOnOffProductionStateParity: 'canonical stable full-state digest equal at every actual Nodule evaluation boundary and final state',
      randomStateAndCallParity: 'per-tick RNG trace digests equal',
      proximityPredicateEquality: 'production method compared with the exact strict-distance expansion for every Q cell',
      postCapTimerPolicy: 'no timer ages or hypothetical maturities recorded after production cap early-return',
      naturalReplayEquality: 'production-only control and observer-off/on summaries match every canonical replay field except serializer-sensitive ownStateV8Sha256; normalized complete state, per-tick RNG trace, and evaluation times match'
    },
    sourceHashes: await sourceHashes(canonicalPath),
    seeds: seeds.map(seed => ({
      seed: seed.seed,
      observerParity: seed.observerParity,
      summary: seed.summary,
      evaluationCount: seed.observations.length
    })),
    reproduction: 'node scripts/ant-natural-nodule-opportunity.js --output=test-results/ant-natural-nodule-opportunity-20261013',
    wallSeconds: (performance.now() - started) / 1000
  };
  await writeJson(output, 'manifest.json', manifest);
  console.log(JSON.stringify({ complete: true, output: outputArg,
    results: seeds.map(value => ({ seed: value.seed,
      firstQMs: value.summary.firstQAppearanceMs,
      firstAMs: value.summary.firstACellAppearanceMs,
      birthCount: value.summary.births.length,
      capMs: value.summary.firstCapCrossing?.timeMs ?? null,
      capPreBirthA: value.summary.firstCapCrossing?.aCountBeforeBirth ?? null,
      capPostBirthA: value.summary.firstCapCrossing?.aCountAfterBirth ?? null,
      postCapEvaluationCount: value.summary.capAfterCensus.evaluationCountThrough600Seconds,
      terminalQ: value.summary.capAfterCensus.qCountAt600Seconds,
      terminalA: value.summary.capAfterCensus.aCountAt600Seconds,
      exclusionProportion: value.summary.exclusionAmongQualifiedCellEvaluations.proportion,
      actualSequenceCounts: value.summary.actualSequenceCounts })),
    wallSeconds: manifest.wallSeconds }));
}

async function runSeed(seed, canonical) {
  const canonicalControl = await runController(seed, false, false);
  const observerOff = await runController(seed, false, true);
  const observerOn = await runController(seed, true, true);
  const canonicalResult = canonical.results.find(value => value.seed === seed);
  assert.deepEqual(canonicalComparableSummary(canonicalControl.summary), canonicalComparableSummary(canonicalResult),
    'unobserved production control must match every canonical field except serializer-sensitive ownStateV8Sha256');
  assert.deepEqual(canonicalComparableSummary(observerOff.summary), canonicalComparableSummary(canonicalResult),
    'observer-off run must equal canonical natural replay');
  assert.deepEqual(canonicalComparableSummary(observerOn.summary), canonicalComparableSummary(canonicalResult),
    'observer-on run must equal canonical natural replay');
  assert.equal(canonicalControl.finalProductionStateHash, observerOff.finalProductionStateHash,
    'observer-off final complete production state must equal the canonical control');
  assert.equal(canonicalControl.finalProductionStateHash, observerOn.finalProductionStateHash,
    'observer-on final complete production state must equal the canonical control');
  assert.deepEqual(observerOff.evaluationStateHashes, observerOn.evaluationStateHashes,
    'observer changed production state at an actual Nodule evaluation boundary');
  assert.equal(observerOff.finalProductionStateHash, observerOn.finalProductionStateHash,
    'observer changed final complete production state');
  assert.equal(observerOff.rngTraceSha256, observerOn.rngTraceSha256,
    'observer changed per-tick RNG state or call count');
  assert.deepEqual(observerOff.evaluationTimesMs, observerOn.evaluationTimesMs,
    'observer changed actual Nodule evaluation boundaries');
  return {
    seed, observations: observerOn.observations,
    terminalClockEndCensus: observerOn.terminalClockEndCensus,
    summary: summarizeNaturalRun(observerOn.observations, observerOn.terminalClockEndCensus),
    observerParity: {
      productionStateEveryEvaluation: true,
      productionStateEvaluationCount: observerOff.evaluationStateHashes.length,
      productionStateEvaluationHashes: observerOff.evaluationStateHashes,
      randomStateAndCallEveryTick: true,
      randomParityTickCount: TICKS,
      randomTraceSha256: observerOff.rngTraceSha256,
      canonicalControlFinalProductionStateHash: canonicalControl.finalProductionStateHash,
      observerOffFinalProductionStateHash: observerOff.finalProductionStateHash,
      observerOnFinalProductionStateHash: observerOn.finalProductionStateHash,
      canonicalControlNonSerializerEquality: true,
      canonicalObserverOffNonSerializerEquality: true,
      canonicalObserverOnNonSerializerEquality: true,
      finalCompleteProductionStateHash: observerOn.finalProductionStateHash,
      canonicalOwnStateV8Sha256: canonicalResult.ownStateV8Sha256,
      observerOnOwnStateV8Sha256: observerOn.summary.ownStateV8Sha256,
      observerOffOwnStateV8Sha256: observerOff.summary.ownStateV8Sha256
    },
    naturalReplay: { observerOff: observerOff.summary, observerOn: observerOn.summary }
  };
}

async function runController(seed, observerEnabled, trackParity) {
  const lcg = countedLcg(seed);
  const controller = new AntController({ random: lcg.random });
  let contacts = 0;
  controller.subscribe(event => {
    if (event.type === 'foot-contact') contacts += event.payload.contacts.length;
  });
  await controller.init();
  assert.equal(controller.materialLocomotionResistance, true);
  assert.equal(controller.audioBridge, null);
  const observer = observerEnabled ? installNoduleOpportunityObserver(controller) : null;
  const observations = observer?.rows || [];
  const evaluationStateHashes = [];
  const evaluationTimesMs = [];
  const rngTrace = createHash('sha256');
  let lastEvaluationTimeMs = null;
  let terminalClockEndCensus = null;

  try {
    for (let tick = 0; tick < TICKS; tick += 1) {
      controller.tick(DT);
      if (trackParity) rngTrace.update(lcg.state() + ',' + lcg.calls() + '\\n');
      const evaluationTimeMs = trackParity
        ? controller.materialStratigraphy.lastNoduleEvaluationTimeMs : null;
      if (trackParity && evaluationTimeMs !== lastEvaluationTimeMs) {
        if (observer) assert.equal(observations.at(-1)?.timeMs, evaluationTimeMs);
        evaluationTimesMs.push(evaluationTimeMs);
        evaluationStateHashes.push({
          timeMs: evaluationTimeMs,
          sha256: stableStateHash(controllerComparableState(controller, lcg))
        });
        lastEvaluationTimeMs = evaluationTimeMs;
      }
    }
    if (observer && controller.materialStratigraphy.nodules.length
      >= controller.materialStratigraphy.maxNodules) {
      const census = censusNoduleOpportunity(controller.materialStratigraphy, controller.surfaceField);
      terminalClockEndCensus = {
        timeMs: controller.simulationTimeMs, qCellIds: census.qCellIds,
        aCellIds: census.aCellIds, blockedCellIds: census.blockedCellIds,
        qCount: census.qCount, aCount: census.aCount, qNotACount: census.qNotACount,
        blockedAmongQ: census.blockedAmongQ,
        predicateComparedQualifiedCells: census.predicateComparedQualifiedCells,
        predicateMismatches: census.predicateMismatches,
        productionEvaluation: false, hypotheticalTimer: false
      };
    }
    observer?.restore();
    const summary = naturalSummary(seed, controller, lcg, contacts);
    return {
      summary, observations, terminalClockEndCensus, evaluationTimesMs,
      evaluationStateHashes, rngTraceSha256: rngTrace.digest('hex'),
      finalProductionStateHash: stableStateHash(controllerComparableState(controller, lcg))
    };
  } finally {
    observer?.restore();
    await controller.destroy();
  }
}

function canonicalComparableSummary(summary) {
  const { ownStateV8Sha256, ...comparable } = summary;
  return comparable;
}

function naturalSummary(seed, controller, lcg, contacts) {
  const hash = value => createHash('sha256').update(value).digest('hex');
  const owned = { ...controller, listeners: null,
    random: { value: lcg.state(), calls: lcg.calls() }, fieldFactory: null, audioBridge: null };
  return {
    seed, seconds: 600, hz: HZ, population: controller.agents.length,
    spawned: controller.totalSpawned, retired: controller.totalRetired, contacts,
    plateCount: controller.trailPlateBirth.plates.length,
    noduleCount: controller.materialStratigraphy.nodules.length,
    rngState: lcg.state(), rngCalls: lcg.calls(),
    pheromoneSha256: hash(Buffer.from(controller.field.values.buffer)),
    surfaceSha256: hash(Buffer.from(controller.surfaceField.values.buffer)),
    agentsJsonSha256: hash(Buffer.from(JSON.stringify(controller.agents))),
    ownStateV8Sha256: hash(serialize(owned))
  };
}

function controllerComparableState(controller, lcg) {
  const value = { ...controller, listeners: null,
    random: { state: lcg.state(), calls: lcg.calls() }, fieldFactory: null, audioBridge: null };
  value.field = { ...controller.field };
  delete value.field.depositPoint;
  delete value.field.depositSegment;
  value.materialStratigraphy = { ...controller.materialStratigraphy };
  delete value.materialStratigraphy.advance;
  delete value.materialStratigraphy.addPlate;
  delete value.materialStratigraphy._nearExistingNodule;
  return value;
}

export function stableStateHash(value) {
  const seen = new Map();
  let nextReference = 0;
  const normalize = item => {
    if (item === null || typeof item !== 'object') {
      if (typeof item === 'undefined') return { undefined: true };
      if (typeof item === 'number' && !Number.isFinite(item)) return { number: String(item) };
      if (typeof item === 'number' && Object.is(item, -0)) return { number: '-0' };
      if (typeof item === 'bigint') return { bigint: String(item) };
      if (typeof item === 'symbol') return { symbol: item.description ?? '' };
      if (typeof item === 'function') return { function: item.name };
      return item;
    }
    if (seen.has(item)) return { reference: seen.get(item) };
    const reference = nextReference++;
    seen.set(item, reference);
    if (ArrayBuffer.isView(item)) {
      const values = item instanceof DataView
        ? Array.from(new Uint8Array(item.buffer, item.byteOffset, item.byteLength))
        : Array.from(item);
      return { reference, type: item.constructor.name, values };
    }
    if (item instanceof ArrayBuffer) {
      return { reference, type: 'ArrayBuffer', values: Array.from(new Uint8Array(item)) };
    }
    if (Array.isArray(item)) return { reference, type: 'Array', values: item.map(normalize) };
    if (item instanceof Map) {
      return { reference, type: 'Map', entries: [...item].map(([key, value]) => [normalize(key), normalize(value)]) };
    }
    if (item instanceof Set) {
      return { reference, type: 'Set', values: [...item].map(normalize) };
    }
    const keys = Reflect.ownKeys(item).sort((left, right) => String(left).localeCompare(String(right)));
    return {
      reference,
      type: Object.getPrototypeOf(item)?.constructor?.name ?? null,
      entries: keys.map(key => [String(key), normalize(item[key])])
    };
  };
  return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
}

function cellPosition(material, cell) {
  return {
    x: (cell % material.width) / (material.width - 1),
    y: Math.floor(cell / material.width) / (material.height - 1)
  };
}

function cellIndex(material, x, y) {
  return Math.round(y * (material.height - 1)) * material.width
    + Math.round(x * (material.width - 1));
}

function finiteSurfaceSample(surface, x, y) {
  try {
    const sample = surface.sample(x, y);
    return Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0;
  } catch { return 0; }
}

function activeTimerRows(timers) {
  const rows = [];
  for (let cell = 0; cell < timers.length; cell += 1) {
    if (timers[cell] >= 0) rows.push([cell, timers[cell]]);
  }
  return rows;
}

function countActiveTimers(timers) {
  let count = 0;
  for (const value of timers) if (value >= 0) count += 1;
  return count;
}

function sameOpportunityCensus(left, right) {
  return left.qCount === right.qCount
    && left.aCount === right.aCount
    && left.qCellIds.every((cell, index) => cell === right.qCellIds[index])
    && left.aCellIds.every((cell, index) => cell === right.aCellIds[index]);
}

function censusRecord(census) {
  return {
    qCellIds: census.qCellIds, aCellIds: census.aCellIds,
    blockedCellIds: census.blockedCellIds,
    qCount: census.qCount, aCount: census.aCount, qNotACount: census.qNotACount,
    blockedAmongQ: census.blockedAmongQ
  };
}

function countBy(values, keyOf) {
  const result = {};
  for (const value of values) {
    const key = keyOf(value);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function countedLcg(seed) {
  let value = seed >>> 0;
  let calls = 0;
  const random = () => {
    calls += 1;
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
  return { random, state: () => value, calls: () => calls };
}

async function sourceHashes(canonicalPath) {
  const paths = [...PRODUCTION_PATHS, 'scripts/ant-natural-nodule-opportunity.js', CANONICAL_REPLAY];
  return Object.fromEntries(await Promise.all(paths.map(async path => [
    path, await hashFile(path === CANONICAL_REPLAY ? canonicalPath : resolve(ROOT, path))
  ])));
}

async function hashFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function writeJson(directory, name, value) {
  await writeFile(resolve(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}

function git(args) {
  return execFileSync('git', args.split(' '), { cwd: ROOT, encoding: 'utf8' }).trim();
}
