import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import {
  TRAIL_PLATE_GRID_SIZE, TRAIL_PLATE_TARGET_EDGE_DISTANCE
} from '../src/lib/agents/ant/TrailPlateBirth.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const AUTHORITY = '1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44';
const BRANCH = 'codex/ant-materialization-research-closure-20261031';
const SEEDS = ['20261005', '20261006', '20261007'];
const SECONDS = 600;
const TICKS = SECONDS * 60;
const DT = 1 / 60;
const GRID = TRAIL_PLATE_GRID_SIZE;
const SCALE = GRID - 1;
const COUNT = GRID * GRID;
const RADIUS = 0.15;
const ENTRY = Object.freeze({ x: 0.5, y: 0.72 });
const EPSILON = 1e-12;
const CAPTURE_SECONDS = new Set([60, 120, 300, 600]);
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-31-materialization-production-shaped-x-shadow');
const DATA = resolve(EVIDENCE, 'analysis');
const SOURCES = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/renderers/AntRenderer.js'
];
const CLI = new Map(process.argv.slice(2).map(arg => {
  const i = arg.indexOf('=');
  return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
}));

async function main() {
  if (CLI.has('--selfcheck')) {
    runSelfChecks();
    console.log(JSON.stringify({ selfcheck: 'passed' }));
    return;
  }
  if (CLI.has('--summarize-existing')) {
    const runs = [];
    for (const seed of SEEDS) {
      const seedPath = resolve(DATA, 'seed-' + seed + '.json.gz');
      const bytes = await readFile(seedPath);
      const run = JSON.parse(gunzipSync(bytes));
      run.transitions = compareTransitions(run.anchors);
      run.selector = summarizeSelector(run.anchors, run.transitions);
      run.births = matchBirthContexts(run.production.plateBirths, run.anchors);
      run.determinismHash = historyFingerprint(run);
      await writeFile(seedPath, gzipSync(Buffer.from(JSON.stringify(run)), { level: 9, mtime: 0 }));
      runs.push(run);
    }
    const sourceHashes = await hashSources();
    assert.deepEqual(runs[0].sourceHashes, sourceHashes, 'production source hashes match saved histories');
    assert.deepEqual(await hashSources(), sourceHashes, 'summary pass leaves production sources unchanged');
    await writeDerivedFiles(runs, sourceHashes);
    console.log(JSON.stringify({ summarized: runs.length, anchors: runs.reduce((sum, run) => sum + run.anchors.length, 0), output: DATA }));
    return;
  }
  assert.equal(CLI.get('--write') ?? true, true, 'use --write to run the locked histories');
  assert.equal(process.env.ANT_MATERIALIZATION_HEAD, AUTHORITY, 'runner starts at current production authority');
  assert.equal(process.env.ANT_MATERIALIZATION_MAIN, AUTHORITY, 'origin/main authority');
  assert.equal(process.env.ANT_MATERIALIZATION_BRANCH, BRANCH, 'use the registered closure branch');
  const sourceHashes = await hashSources();
  assert.equal(sourceHashes['src/lib/agents/ant/TrailPlateBirth.js'].gitBlob,
    '238cc365f2602dc6a22091d69237b88962825a13', 'current production formation source');
  const productionText = await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
  const ops = productionOps(productionText);
  runSelfChecks(ops);
  await mkdir(DATA, { recursive: true });
  const runs = [];
  for (const seed of SEEDS) {
    const run = await runSeed(seed, ops, sourceHashes);
    run.determinismHash = historyFingerprint(run);
    const bytes = gzipSync(Buffer.from(JSON.stringify(run)), { level: 9, mtime: 0 });
    await writeFile(resolve(DATA, 'seed-' + seed + '.json.gz'), bytes);
    runs.push(run);
    console.log(JSON.stringify({
      seed, anchors: run.anchors.length, xAvailable: run.selector.xAvailability.available,
      productionCandidates: run.selector.productionAvailability.available,
      actualPlateBirths: run.production.plateBirths.length,
      acceptedSpawns: run.production.spawns.accepted,
      parityTicks: run.validation.parity.ticks
    }));
  }
  assert.deepEqual(await hashSources(), sourceHashes, 'production and renderer sources unchanged');
  await writeDerivedFiles(runs, sourceHashes);
  const sourceAfter = await hashSources();
  assert.deepEqual(sourceAfter, sourceHashes,
    'production TrailPlateBirth remains byte-identical');
  console.log(JSON.stringify({
    complete: true, seeds: runs.length, analyses: runs.reduce((sum, run) => sum + run.anchors.length, 0),
    sourceHashes, output: DATA
  }));
}

async function writeDerivedFiles(runs, sourceHashes) {
  const summary = summarizeRuns(runs);
  const summaryPath = resolve(DATA, 'summary.json');
  const parityPath = resolve(DATA, 'parity.json');
  const contextsPath = resolve(DATA, 'birth-context.json');
  await writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n');
  await writeFile(parityPath, JSON.stringify({
    schema: 'ant-materialization-production-shadow-parity-v1',
    authority: AUTHORITY,
    seeds: runs.map(run => ({ seed: run.seed, ...run.validation.parity }))
  }, null, 2) + '\n');
  await writeFile(contextsPath, JSON.stringify({
    schema: 'ant-materialization-production-birth-shadow-context-v1',
    authority: AUTHORITY,
    seeds: runs.map(run => ({ seed: run.seed, births: run.births.map(birth => ({
      id: birth.id, timeSeconds: birth.timeSeconds,
      contexts: birth.contexts.map(context => ({
        offsetSeconds: context.offsetSeconds, timeSeconds: context.timeSeconds,
        valid: context.valid,
        productionCandidate: context.productionCandidate,
        x: context.x ? { nucleus: context.x.nucleus, nodes: context.x.nodes,
          centroid: context.x.centroid, priorMaterialOverlap: {
            xPriorMaterialIntersection: context.x.priorMaterialOverlap.xPriorMaterialIntersection,
            xOnly: context.x.priorMaterialOverlap.xOnly,
            overlapFractionOfX: context.x.priorMaterialOverlap.overlapFractionOfX,
            priorMaterialInsideDisk: context.x.priorMaterialOverlap.priorMaterialInsideDisk,
            meanLayerCountUnderX: context.x.priorMaterialOverlap.meanLayerCountUnderX
          } } : null,
        priorMaterial: context.priorMaterial ? {
          plateCount: context.priorMaterial.plateCount,
          unionCoverage: context.priorMaterial.unionCoverage,
          meanLayerCount: context.priorMaterial.meanLayerCount,
          maxLayerCount: context.priorMaterial.maxLayerCount
        } : null,
        bornPlate: context.bornPlate ? {
          id: context.bornPlate.id, structuralCells: context.bornPlate.structuralCells
        } : null
      }))
    })) }))
  }, null, 2) + '\n');
  const entries = [];
  for (const path of [
    ...SEEDS.map(seed => resolve(DATA, 'seed-' + seed + '.json.gz')),
    summaryPath, parityPath, contextsPath
  ]) {
    const bytes = await readFile(path);
    entries.push({ file: path.slice(DATA.length + 1), bytes: bytes.length, sha256: digest(bytes) });
  }
  await writeFile(resolve(DATA, 'manifest.json'), JSON.stringify({
    schema: 'ant-materialization-production-shaped-x-shadow-manifest-v1',
    authority: AUTHORITY, branch: BRANCH,
    seeds: SEEDS, modelSeconds: SECONDS, hz: 60, audio: 'Off',
    deterministicHistoryFingerprints: runs.map(run => ({ seed: run.seed, sha256: run.determinismHash })),
    sourceHashes, files: entries
  }, null, 2) + '\n');
}

function historyFingerprint(run) {
  const anchors = run.anchors.map(row => {
    if (!row.productionCandidateGeometry) return row;
    const { sourceDistanceFromEntry, centroidDistanceFromSource, geodesicLength, ...geometry } = row.productionCandidateGeometry;
    return { ...row, productionCandidateGeometry: geometry };
  });
  return digest(Buffer.from(JSON.stringify({
    anchors, births: run.production.plateBirths, spawns: run.production.spawns.events
  })));
}

async function runSeed(seed, ops, sourceHashes) {
  const observedRng = countedLcg(Number(seed));
  const plainRng = countedLcg(Number(seed));
  const observed = new AntController({ random: observedRng.random });
  const plain = new AntController({ random: plainRng.random });
  const ctx = {
    seed, controller: observed, rng: observedRng, ops, anchors: [], captures: [], spawnEvents: [],
    plateBirths: [], footContactEvents: 0, footContactLegs: 0, errors: [],
    retryPending: false, pendingHeading: null, observerRandomCalls: 0, travel: 0,
    activeAntSeconds: 0, blockedAgentFrames: 0, newlyBlockedAgentFrames: 0,
    windows: Array.from({ length: 10 }, (_, index) => ({
      startSeconds: index * 60, endSeconds: (index + 1) * 60,
      activeAntSeconds: 0, travel: 0, blockedAgentFrames: 0, newlyBlockedAgentFrames: 0,
      acceptedSpawns: 0, flowConditionedSpawns: 0, isotropicFallbackSpawns: 0,
      placementCalls: 0, blockedPlacementCalls: 0, retryCalls: 0, retryRecoveries: 0,
      clearanceRejectedPositions: 0, placementAttempts: 0, footContactEvents: 0,
      footContactLegs: 0, plateBirths: 0
    })),
    spawns: {
      initializationCalls: 0, scheduledOpportunities: 0, retryCalls: 0, accepted: 0,
      flowConditioned: 0, isotropicFallback: 0, blockedPlacementCalls: 0,
      capacitySuppressedCalls: 0, placementAttempts: 0, clearanceRejectedPositions: 0,
      retryRecoveries: 0, headingCalls: 0
    }
  };
  installShadowObserver(observed, ctx);
  observed.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') {
      ctx.footContactEvents += 1;
      ctx.footContactLegs += Array.isArray(payload?.contacts) ? payload.contacts.length : 0;
      const row = ctx.windows[windowIndex((payload?.simulationTimeMs ?? observed.simulationTimeMs) / 1000)];
      row.footContactEvents += 1;
      row.footContactLegs += Array.isArray(payload?.contacts) ? payload.contacts.length : 0;
    } else if (type === 'plate-birth') {
      ctx.plateBirths.push({ id: payload.id, timeSeconds: payload.bornAtSimulationTimeMs / 1000,
        maskIndices: indices(payload.mask) });
      ctx.windows[windowIndex(observed.simulationTimeMs / 1000)].plateBirths += 1;
    } else if (type === 'error') ctx.errors.push(payload);
  });

  const parity = { ticks: 0, exactEnvironmentBoundaries: 0, equalEveryTick: true,
    equalEveryAnalysisBoundary: true, rngCalls: null, finalRngState: null };
  const start = performance.now();
  await observed.init();
  await plain.init();
  assert.equal(fingerprint(observed, observedRng, false), fingerprint(plain, plainRng, false),
    seed + ' initial observer parity');
  assert.equal(ctx.spawns.accepted, 1, 'initial accepted spawn observed');
  for (let tick = 1; tick <= TICKS; tick += 1) {
    const anchorsBeforeTick = ctx.anchors.length;
    const before = observed.agents.map(agent => ({
      agent, x: agent.x, y: agent.y, wasBlocked: agent.wasBlocked
    }));
    const populationAtEntry = observed.agents.length;
    observed.tick(DT);
    plain.tick(DT);
    parity.ticks += 1;
    assert.equal(fingerprint(observed, observedRng, false), fingerprint(plain, plainRng, false),
      seed + ' observer parity tick ' + tick);
    let tickTravel = 0, tickBlocked = 0, tickNewlyBlocked = 0;
    for (const item of before) {
      const distance = clippedSegmentLength(item.x, item.y, item.agent.x, item.agent.y);
      ctx.travel += distance;
      tickTravel += distance;
      const blocked = !!item.agent.wasBlocked;
      if (blocked) { ctx.blockedAgentFrames += 1; tickBlocked += 1; }
      if (blocked && !item.wasBlocked) { ctx.newlyBlockedAgentFrames += 1; tickNewlyBlocked += 1; }
    }
    const seconds = tick / 60;
    const wi = windowIndex((tick - 1) / 60), window = ctx.windows[wi];
    ctx.activeAntSeconds += populationAtEntry * DT;
    window.activeAntSeconds += populationAtEntry * DT;
    window.travel += tickTravel;
    window.blockedAgentFrames += tickBlocked;
    window.newlyBlockedAgentFrames += tickNewlyBlocked;

    if (ctx.anchors.length > anchorsBeforeTick) {
      assert.equal(ctx.anchors.length, anchorsBeforeTick + 1,
        'at most one production analysis boundary per tick');
      assert.equal(fingerprint(observed, observedRng, true), fingerprint(plain, plainRng, true),
        seed + ' full observer parity at production analysis tick ' + tick);
      parity.exactEnvironmentBoundaries += 1;
      const anchor = ctx.anchors.at(-1);
      anchor.world = summarizeWorldAtAnchor(observed, ctx, anchor.timeSeconds);
    }

    if (tick % 60 === 0) {
      const anchor = ctx.anchors.at(-1);
      const seconds = tick / 60;
      if (CAPTURE_SECONDS.has(seconds)) {
        assert.ok(anchor && anchor.timeMs <= observed.simulationTimeMs,
          'preceding production selector state available for fixed frame at ' + seconds + 's');
        ctx.captures.push({
          seconds, shadowAnalysisTimeMs: anchor.timeMs,
          snapshot: makeRenderSnapshot(observed),
          EIndices: anchor.EIndices, FIndices: anchor.FIndices,
          XIndices: anchor.x.cells, xPriorMaterial: anchor.xMaterial,
          productionCandidate: anchor.productionCandidate,
          nucleus: anchor.x.nucleus,
          priorMaterial: anchor.priorMaterial
        });
      }
      if (tick % 3600 === 0) console.log(JSON.stringify({
        seed, seconds, population: observed.agents.length,
        anchors: ctx.anchors.length, elapsedWallSeconds: (performance.now() - start) / 1000
      }));
    }
  }
  assert.ok(ctx.anchors.length >= SECONDS - 1 && ctx.anchors.length <= SECONDS,
    'record every production boundary reached during the fixed 600 s run');
  assert.equal(parity.exactEnvironmentBoundaries, ctx.anchors.length);
  assert.ok(Math.abs(ctx.anchors[0].timeMs - DT * 1000) < 1e-8,
    'first production analysis occurs on tick one');
  for (let index = 1; index < ctx.anchors.length; index += 1) {
    const interval = ctx.anchors[index].timeMs - ctx.anchors[index - 1].timeMs;
    assert.ok(interval >= 1000 - 1e-6 && interval <= 1000 + DT * 1000 + 1e-6,
      'production analysis follows its >=1000 ms tick-boundary schedule');
  }
  assert.ok(ctx.anchors.at(-1).timeMs <= TICKS * DT * 1000
    && TICKS * DT * 1000 - ctx.anchors.at(-1).timeMs < 1000 + DT * 1000,
  'last recorded analysis is the most recent production boundary before 600 s');
  assert.equal(ctx.observerRandomCalls, 0, 'observer did not call Math.random');
  assert.equal(observedRng.calls, plainRng.calls, 'observer RNG call count parity');
  assert.equal(observedRng.state(), plainRng.state(), 'observer RNG state parity');
  assert.equal(ctx.spawns.headingCalls, ctx.spawns.accepted, 'one existing heading call per accepted spawn');
  assert.equal(ctx.spawns.flowConditioned + ctx.spawns.isotropicFallback, ctx.spawns.accepted);
  assert.equal(ctx.plateBirths.length, observed.trailPlateBirth.getPlates().length);
  assert.deepEqual(ctx.errors, [], 'no simulation errors');
  assert.equal(observed.audioBridge, null, 'Audio Off; no audio bridge constructed');
  assert.equal(observed.materialLocomotionResistance, true, 'production retained-material resistance enabled');
  parity.rngCalls = observedRng.calls;
  parity.finalRngState = observedRng.state();
  const transitions = compareTransitions(ctx.anchors);
  const selector = summarizeSelector(ctx.anchors, transitions);
  const births = matchBirthContexts(ctx.plateBirths, ctx.anchors);
  const finalWorld = summarizeWorldAtAnchor(observed, ctx, SECONDS);
  const production = summarizeProduction(ctx, observed, finalWorld);
  const analysisIntervalsMs = ctx.anchors.slice(1).map((row, index) => row.timeMs - ctx.anchors[index].timeMs);
  const analysisSchedule = {
    count: ctx.anchors.length,
    firstTimeMs: ctx.anchors[0].timeMs,
    lastTimeMs: ctx.anchors.at(-1).timeMs,
    intervalMinMs: Math.min(...analysisIntervalsMs),
    intervalMaxMs: Math.max(...analysisIntervalsMs),
    intervalsOverOneSecond: analysisIntervalsMs.filter(interval => interval > 1000 + 1e-6).length
  };
  await observed.destroy();
  await plain.destroy();
  return {
    schema: 'ant-materialization-production-shaped-x-shadow-seed-v1',
    seed, authority: AUTHORITY, branch: BRANCH, seconds: SECONDS, ticks: TICKS, dtSeconds: DT,
    audio: 'Off; no AudioBridge constructed',
    sourceHashes, analysisSchedule, selector, transitions, births, production, captures: ctx.captures,
    anchors: ctx.anchors,
    validation: { parity, observerRngCalls: 0, errors: 0, productionSourceUnchanged: true,
      noCandidateFeedback: true, noPlateCreatedByShadow: true, noSrcOrStaticChanges: true }
  };
}

function installShadowObserver(controller, ctx) {
  const birth = controller.trailPlateBirth;
  const originalBuild = birth.buildSupportedMask;
  const originalAdvance = birth.advance;
  birth.buildSupportedMask = function (...args) {
    const result = originalBuild.apply(this, args);
    ctx.lastBuilt = { E: result.mask.slice(), D: result.supports.slice(),
      diagnostics: { ...result.diagnostics } };
    return result;
  };
  birth.advance = function (...args) {
    const priorTime = this.lastAnalysisTimeMs;
    ctx.lastBuilt = null;
    const callsBeforeObserver = ctx.rng.calls;
    const newborns = originalAdvance.apply(this, args);
    if (this.lastAnalysisTimeMs === priorTime) return newborns;
    assert.ok(ctx.lastBuilt, 'production built E/D at each actual analysis boundary');
    const mathRandomCalls = withMathRandomForbidden(() => {
      const row = analyzeBoundary(this.lastAnalysisTimeMs, ctx.lastBuilt, this.candidate,
        newborns, controller.materialStratigraphy, ctx.ops);
      ctx.anchors.push(row);
    });
    ctx.observerRandomCalls += mathRandomCalls;
    assert.equal(ctx.rng.calls, callsBeforeObserver, 'shadow analysis consumed no controller RNG');
    return newborns;
  };

  const originalHeading = controller.spawnHeading;
  controller.spawnHeading = function (uniform) {
    const liveIds = new Set(this.agents.map(agent => agent.id));
    const flow = measureOutgoingSpawnFlow(this.completedMovementSegments
      .filter(segment => liveIds.has(segment.id)));
    const heading = originalHeading.call(this, uniform);
    ctx.pendingHeading = {
      flowAvailable: flow.available, N: flow.N, R: flow.R, phi: flow.phi,
      heading, uniform, sourceTimeSeconds: this.simulationTimeMs / 1000
    };
    ctx.spawns.headingCalls += 1;
    return heading;
  };
  const originalSpawn = controller.spawnNextAnt;
  controller.spawnNextAnt = function (...args) {
    const callTime = this.simulationTimeMs;
    const retry = ctx.retryPending;
    const window = ctx.windows[windowIndex(callTime / 1000)];
    if (callTime === 0 && this.totalSpawned === 0) ctx.spawns.initializationCalls += 1;
    else if (retry) { ctx.spawns.retryCalls += 1; window.retryCalls += 1; }
    else ctx.spawns.scheduledOpportunities += 1;
    window.placementCalls += 1;
    const agents = this.agents;
    const ownSome = Object.getOwnPropertyDescriptor(agents, 'some');
    const baseSome = agents.some;
    let attempts = 0, rejected = 0;
    Object.defineProperty(agents, 'some', {
      configurable: true, writable: true,
      value: function (...someArgs) {
        attempts += 1;
        const result = baseSome.apply(this, someArgs);
        if (result) rejected += 1;
        return result;
      }
    });
    ctx.pendingHeading = null;
    let accepted;
    try { accepted = originalSpawn.apply(this, args); }
    finally {
      if (ownSome) Object.defineProperty(agents, 'some', ownSome);
      else delete agents.some;
    }
    ctx.spawns.placementAttempts += attempts;
    ctx.spawns.clearanceRejectedPositions += rejected;
    window.placementAttempts += attempts;
    window.clearanceRejectedPositions += rejected;
    if (accepted) {
      const agent = this.agents.at(-1), pending = ctx.pendingHeading;
      assert.ok(pending, 'accepted spawn measured at the heading call');
      const record = {
        id: agent.id, timeSeconds: callTime / 1000, x: agent.x, y: agent.y,
        flowConditioned: pending.flowAvailable, N: pending.N, R: pending.R, phi: pending.phi,
        heading: pending.heading, headingUniform: pending.uniform,
        placementAttempts: attempts, clearanceRejectedPositions: rejected,
        trigger: callTime === 0 ? 'initialization' : retry ? 'retry-recovery' : 'scheduled'
      };
      ctx.spawnEvents.push(record);
      ctx.spawns.accepted += 1;
      window.acceptedSpawns += 1;
      if (pending.flowAvailable) {
        ctx.spawns.flowConditioned += 1;
        window.flowConditionedSpawns += 1;
      } else {
        ctx.spawns.isotropicFallback += 1;
        window.isotropicFallbackSpawns += 1;
      }
      if (retry) { ctx.spawns.retryRecoveries += 1; window.retryRecoveries += 1; }
      ctx.retryPending = false;
    } else if (attempts === 12) {
      ctx.spawns.blockedPlacementCalls += 1;
      window.blockedPlacementCalls += 1;
      ctx.retryPending = true;
    } else if (attempts === 0 && this.agents.length >= this.recruitmentLimit) {
      ctx.spawns.capacitySuppressedCalls += 1;
    }
    return accepted;
  };
}

function analyzeBoundary(timeMs, built, candidate, newborns, materialController, ops) {
  const E = built.E, D = built.D;
  assert.equal(E.length, COUNT); assert.equal(D.length, COUNT);
  const inputHashes = [digest(bytes(E)), digest(bytes(D))];
  const candidateMaskHash = candidate ? digest(bytes(candidate.mask)) : null;
  const F = ops.zhangSuen(E);
  for (let i = 0; i < COUNT; i += 1) assert.ok(!F[i] || E[i], 'production thinning F stays within E');
  const X = computeX(E, F, D, ops);
  const material = materialController.getSnapshot();
  const materialCounts = material.stratigraphy.layerCountByCell;
  const materialTop = material.stratigraphy.topLayerByCell;
  const priorMaterialIndices = [];
  for (let i = 0; i < COUNT; i += 1) if ((materialCounts?.[i] || 0) > 0) priorMaterialIndices.push(i);
  const candidateState = candidate ? {
    source: { ...candidate.source }, target: { ...candidate.target },
    geodesicLength: candidate.geodesicLength, stableSeconds: candidate.stableSeconds,
    similarity: candidate.similarity, footContacts: candidate.footContacts,
    meanSupport: candidate.meanSupport, meanChemical: candidate.meanChemical,
    path: candidate.path.slice(), skeletonIndices: candidate.skeletonIndices.slice(),
    maskIndices: indices(candidate.mask), supportedIndices: indices(candidate.supportedMask)
  } : null;
  if (candidateState) {
    for (const cell of candidateState.skeletonIndices) assert.ok(F[cell], 'production selected skeleton is in F');
    for (const cell of candidateState.supportedIndices) assert.ok(E[cell], 'production supported corridor is in E');
  }
  let productionGeometry = candidateState
    ? measureGeometry(candidateState.skeletonIndices, ENTRY, candidateState.source.index, null, ops) : null;
  if (productionGeometry) productionGeometry = completeProductionGeometry(productionGeometry, candidateState);
  const productionMaskOverlap = candidateState && X
    ? setCompare(candidateState.skeletonIndices, X.cells) : null;
  const xMaterial = X ? materialOverlap(X.cells, X.nucleus, materialCounts, materialTop) : null;
  assert.deepEqual([digest(bytes(E)), digest(bytes(D))], inputHashes, 'shadow leaves current production E/D untouched');
  assert.equal(candidate ? digest(bytes(candidate.mask)) : null, candidateMaskHash,
    'shadow leaves current production candidate untouched');
  const born = (newborns || []).map(plate => ({
    id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
    maskIndices: indices(plate.mask), centerlineIndices: plate.centerline.map(point => point.index),
    source: plate.source, target: plate.target, geodesicLength: plate.metrics?.geodesicLength ?? null
  }));
  for (const plate of born) {
    assert.ok(candidateState, 'production Plate birth has a selected production candidate');
    assert.deepEqual(plate.maskIndices, candidateState.maskIndices,
      'actual Plate body matches its production candidate mask');
  }
  return {
    timeMs, timeSeconds: timeMs / 1000,
    EIndices: indices(E), FIndices: indices(F), DEntries: X?.eligible ?? [],
    productionCandidate: candidateState,
    productionCandidateGeometry: productionGeometry,
    productionVsX: productionMaskOverlap,
    x: X ? {
      available: true, nucleus: X.nucleus, nucleusSupport: X.nucleusSupport,
      eligibleNodeCount: X.eligibleCount, rank2Support: X.rank2Support,
      topSupportRatio: X.topSupportRatio, topSupportGap: X.topSupportGap,
      tiedTopCount: X.tiedTopCount, alternativeCountWithin90Percent: X.alternativeCountWithin90Percent,
      cells: X.cells, geometry: X.geometry
    } : { available: false, nucleus: null, eligibleNodeCount: 0, cells: [], geometry: null },
    priorMaterial: materialSummary(material, priorMaterialIndices),
    xMaterial,
    birthsAtBoundary: born,
    productionBoundary: {
      candidateAvailable: !!candidateState,
      candidateCount: candidateState ? candidateState.skeletonIndices.length : 0,
      lastAnalysisTimeMs: timeMs, EDiagnostics: built.diagnostics,
      birthCount: born.length
    }
  };
}

function computeX(E, F, D, ops) {
  const eligible = [];
  for (let index = 0; index < COUNT; index += 1) {
    if (F[index] && ops.neighbors(index).some(next => F[next])) {
      eligible.push([index, D[index]]);
    }
  }
  eligible.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if (!eligible.length) return null;
  const nucleus = eligible[0][0], n0 = point(nucleus), disk = new Uint8Array(COUNT);
  for (let index = 0; index < COUNT; index += 1) {
    if (F[index] && withinDisk(index, nucleus)) disk[index] = 1;
  }
  const component = new Uint8Array(COUNT), queue = [nucleus];
  component[nucleus] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of ops.neighbors(queue[head])) {
      if (disk[next] && !component[next]) { component[next] = 1; queue.push(next); }
    }
  }
  const cells = indices(component);
  const diskCellCount = indices(makeDiskMask(nucleus)).length;
  const geometry = measureGeometry(cells, ENTRY, nucleus, diskCellCount, ops);
  assert.ok(cells.includes(nucleus), 'X contains its selected nucleus');
  assert.equal(geometry.connected, true, 'X remains 8-connected');
  assert.ok(geometry.maxEuclideanRadius <= RADIUS + EPSILON, 'X stays within R=.15');
  const best = eligible[0][1], second = eligible.length > 1 ? eligible[1][1] : null;
  return {
    nucleus: { index: nucleus, ...n0 }, nucleusSupport: best, eligibleCount: eligible.length,
    rank2Support: second, topSupportRatio: best > 0 && second !== null ? second / best : null,
    topSupportGap: second === null ? null : best - second,
    tiedTopCount: eligible.filter(item => item[1] === best).length,
    alternativeCountWithin90Percent: best > 0 ? eligible.filter(item => item[1] >= best * 0.9).length - 1 : 0,
    eligible, cells, geometry
  };
}

function materialOverlap(cells, nucleus, layerCounts, topLayer) {
  const xSet = new Set(cells), diskIndices = [], hist = {};
  let intersection = 0, multilayer = 0, maxLayers = 0, sumLayers = 0;
  for (let index = 0; index < COUNT; index += 1) {
    if (!withinDisk(index, nucleus.index)) continue;
    diskIndices.push(index);
  }
  for (const cell of cells) {
    const layers = layerCounts?.[cell] || 0;
    hist[String(layers)] = (hist[String(layers)] || 0) + 1;
    sumLayers += layers;
    maxLayers = Math.max(maxLayers, layers);
    if (layers > 0 || (topLayer && topLayer[cell] >= 0)) intersection += 1;
    if (layers > 1) multilayer += 1;
  }
  const localMaterial = diskIndices.filter(index => (layerCounts?.[index] || 0) > 0);
  return {
    xCount: cells.length, diskCellCount: diskIndices.length,
    xPriorMaterialIntersection: intersection, xOnly: cells.length - intersection,
    priorMaterialOnlyInsideDisk: localMaterial.filter(index => !xSet.has(index)).length,
    priorMaterialInsideDisk: localMaterial.length,
    overlapFractionOfX: cells.length ? intersection / cells.length : null,
    overlapFractionOfPriorMaterialInsideDisk: localMaterial.length ? intersection / localMaterial.length : null,
    localLayerCountHistogramUnderX: hist, meanLayerCountUnderX: cells.length ? sumLayers / cells.length : null,
    multilayerCellCountUnderX: multilayer, maximumLayerCountUnderX: maxLayers,
    localPriorMaterialIndices: localMaterial,
    layerCountByXCell: cells.map(cell => [cell, layerCounts?.[cell] || 0])
  };
}

function materialSummary(snapshot, priorMaterialIndices) {
  const layers = snapshot.stratigraphy.layerCountByCell;
  const depth = snapshot.stratigraphy.totalDepthByCellMeters;
  const counts = {};
  let sum = 0, buried = 0, max = 0, depthSum = 0;
  for (let index = 0; index < layers.length; index += 1) {
    const count = layers[index] || 0;
    counts[String(count)] = (counts[String(count)] || 0) + 1;
    sum += count; max = Math.max(max, count); if (count > 1) buried += 1;
    depthSum += depth?.[index] || 0;
  }
  return {
    width: snapshot.width, height: snapshot.height, revision: snapshot.revision,
    noduleRevision: snapshot.noduleRevision, plateCount: snapshot.layers.plateCount,
    noduleCount: snapshot.layers.noduleCount, exposedCellCount: snapshot.layers.exposedCellCount,
    buriedLayerCellCount: snapshot.layers.buriedLayerCellCount,
    unionCellCount: priorMaterialIndices.length,
    unionCoverage: priorMaterialIndices.length / layers.length,
    meanLayerCount: layers.length ? sum / layers.length : 0,
    maxLayerCount: max, layerCountHistogram: counts, cellsWithLayerCountGt1: buried,
    totalDepthMeters: depthSum
  };
}

function summarizeWorldAtAnchor(controller, ctx, seconds) {
  const field = summarizeScalarField(controller.field.values, controller.field.width, controller.field.height);
  const surface = summarizeScalarField(controller.surfaceField.values, controller.surfaceField.width,
    controller.surfaceField.height);
  const materialSnapshot = controller.materialStratigraphy.getSnapshot();
  const material = materialSummary(materialSnapshot, materialUnionIndices(materialSnapshot));
  const spawnsAtAnchor = ctx.spawnEvents.filter(row => row.timeSeconds > seconds - 1
    && row.timeSeconds <= seconds + EPSILON);
  const window = ctx.windows[windowIndex(seconds)];
  return {
    timeSeconds: seconds, population: controller.agents.length,
    totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
    recruitmentLimit: controller.recruitmentLimit,
    acceptedSpawnsAtBoundary: spawnsAtAnchor.length,
    flowConditionedFractionCumulative: ctx.spawns.accepted
      ? ctx.spawns.flowConditioned / ctx.spawns.accepted : 0,
    pheromone: field,
    surfaceField: { ...surface, totalFootContacts: controller.surfaceField.totalFootContacts },
    material, blockedAgentFramesCumulative: ctx.blockedAgentFrames,
    newlyBlockedAgentFramesCumulative: ctx.newlyBlockedAgentFrames,
    cumulativeTravel: ctx.travel, activeAntSeconds: ctx.activeAntSeconds,
    window: { startSeconds: window.startSeconds, endSeconds: window.endSeconds,
      acceptedSpawns: window.acceptedSpawns, flowConditionedSpawns: window.flowConditionedSpawns,
      blockedPlacementCalls: window.blockedPlacementCalls, retryCalls: window.retryCalls }
  };
}

function compareTransitions(anchors) {
  const result = { adjacent: [], fixedWindows: {} };
  const valid = anchors.filter(row => row.x.available);
  for (let i = 1; i < anchors.length; i += 1) {
    const previous = anchors[i - 1], current = anchors[i];
    result.adjacent.push(transitionRow(previous, current, 1));
  }
  for (const seconds of [1, 5, 10, 20]) {
    const rows = [];
    for (let end = seconds; end < anchors.length; end += seconds) {
      const previous = anchors[end - seconds], current = anchors[end];
      rows.push(transitionRow(previous, current, seconds));
    }
    result.fixedWindows[String(seconds) + 's'] = rows;
  }
  result.validXAnchors = valid.length;
  return result;
}

function transitionRow(previous, current, seconds) {
  const x = setCompare(previous.x.available ? previous.x.cells : null,
    current.x.available ? current.x.cells : null);
  const p = setCompare(previous.productionCandidate ? previous.productionCandidate.skeletonIndices : null,
    current.productionCandidate ? current.productionCandidate.skeletonIndices : null);
  const nucleusDistance = previous.x.available && current.x.available
    ? Math.hypot(previous.x.nucleus.x - current.x.nucleus.x, previous.x.nucleus.y - current.x.nucleus.y) : null;
  return {
    fromSeconds: previous.timeSeconds, toSeconds: current.timeSeconds, spanSeconds: seconds,
    actualSpanSeconds: current.timeSeconds - previous.timeSeconds,
    previousNucleus: previous.x.available ? previous.x.nucleus : null,
    currentNucleus: current.x.available ? current.x.nucleus : null,
    nucleusExactCellSwitch: previous.x.available && current.x.available
      ? previous.x.nucleus.index !== current.x.nucleus.index : null,
    nucleusDisplacement: nucleusDistance,
    x: x.status === 'available' ? x : null,
    productionI: p.status === 'available' ? p : null,
    productionCandidateAvailability: {
      previous: !!previous.productionCandidate, current: !!current.productionCandidate
    },
    xAvailability: { previous: previous.x.available, current: current.x.available }
  };
}

function summarizeSelector(anchors, transitions) {
  const enrichedAnchors = anchors.map(row => row.productionCandidateGeometry && row.productionCandidate
    ? { ...row, productionCandidateGeometry: completeProductionGeometry(
      row.productionCandidateGeometry, row.productionCandidate) } : row);
  const availableX = enrichedAnchors.filter(row => row.x.available);
  const availableProduction = enrichedAnchors.filter(row => row.productionCandidate);
  const transitionSet = rows => rows.filter(row => row.x).map(row => row.x.jaccard);
  const nucleusSteps = transitions.adjacent.filter(row => row.nucleusDisplacement !== null);
  const distances = availableX.map(row => Math.hypot(row.x.nucleus.x - ENTRY.x, row.x.nucleus.y - ENTRY.y));
  const angleValues = availableX.map(row => Math.atan2(row.x.nucleus.y - ENTRY.y,
    row.x.nucleus.x - ENTRY.x)).filter(Number.isFinite);
  const coarse8 = regionOccupancy(availableX, 8), coarse16 = regionOccupancy(availableX, 16);
  const validPair = enrichedAnchors.filter(row => row.x.available && row.productionCandidate);
  const overlaps = validPair.map(row => row.productionVsX.jaccard);
  const geom = field => distribution(availableX.map(row => row.x.geometry[field]).filter(Number.isFinite));
  const prodGeom = field => distribution(availableProduction.map(row =>
    row.productionCandidateGeometry?.[field]).filter(Number.isFinite));
  const angleSummary = circularSummary(angleValues);
  return {
    xAvailability: { available: availableX.length, unavailable: anchors.length - availableX.length,
      fraction: anchors.length ? availableX.length / anchors.length : 0 },
    productionAvailability: { available: availableProduction.length,
      unavailable: anchors.length - availableProduction.length,
      fraction: anchors.length ? availableProduction.length / anchors.length : 0 },
    allocation: {
      entryDistance: distribution(distances),
      angleAroundEntry: { ...angleSummary, histogram12: angleHistogram(angleValues, 12) },
      exactDistinctNuclei: new Set(availableX.map(row => row.x.nucleus.index)).size,
      exactCellSwitches: nucleusSteps.filter(row => row.nucleusExactCellSwitch).length,
      exactCellRepeatFrames: repeatCount(availableX.map(row => row.x.nucleus.index)),
      tolerantDisplacementPerAdjacentAvailableAnchor: distribution(nucleusSteps.map(row => row.nucleusDisplacement)),
      distinctCoarseRegions8x8: Object.keys(coarse8).length,
      coarseRegions8x8: coarse8,
      distinctCoarseRegions16x16: Object.keys(coarse16).length,
      coarseRegions16x16: coarse16,
      rank1Support: distribution(availableX.map(row => row.x.nucleusSupport)),
      rank2Support: distribution(availableX.map(row => row.x.rank2Support).filter(Number.isFinite)),
      rank2OverRank1: distribution(availableX.map(row => row.x.topSupportRatio).filter(Number.isFinite)),
      rank1MinusRank2: distribution(availableX.map(row => row.x.topSupportGap).filter(Number.isFinite)),
      tiedTopCount: distribution(availableX.map(row => row.x.tiedTopCount)),
      alternativesWithin90PercentOfWinner: distribution(availableX.map(row => row.x.alternativeCountWithin90Percent))
    },
    xGeometry: {
      nodes: geom('nodes'), inducedEdges: geom('inducedEdges'),
      euclideanDiameter: geom('euclideanDiameter'),
      centroidDistanceFromEntry: geom('centroidDistanceFromEntry'),
      minRadialDistanceFromEntry: geom('minRadialDistanceFromEntry'),
      maxRadialDistanceFromEntry: geom('maxRadialDistanceFromEntry'),
      angularSpanAroundEntry: geom('angularSpanAroundEntry'),
      maxEuclideanRadiusFromNucleus: geom('maxEuclideanRadius'),
      maxWeightedGraphDistanceFromNucleus: geom('maxWeightedGraphDistance'),
      endpoints: geom('endpoints'), junctionNodes: geom('junctionNodes'),
      cycleRank: geom('cycleRank'), diskDensity: geom('densityDiskArea'),
      majorAxisRadians: geom('majorAxisRadians'), aspectRatio: geom('aspectRatio'),
      radialAlignment: geom('meanRadialEdgeAlignment'),
      nearWorldBoundaryFraction: geom('nearBoundaryFraction'),
      edgeOrientationHistogram12: aggregateHistogram(availableX, row => row.x.geometry.edgeOrientationHistogram12),
      branchEdgeOrientationHistogram12: aggregateHistogram(availableX,
        row => row.x.geometry.branchEdgeOrientationHistogram12)
    },
    xTemporal: {
      adjacent1sJaccard: distribution(transitionSet(transitions.adjacent)),
      fixedWindowJaccard: Object.fromEntries(Object.entries(transitions.fixedWindows).map(([key, rows]) =>
        [key, distribution(rows.filter(row => row.x).map(row => row.x.jaccard))])),
      fixedWindowActualSpanSeconds: Object.fromEntries(Object.entries(transitions.fixedWindows).map(([key, rows]) =>
        [key, distribution(rows.filter(row => row.x).map(row => row.actualSpanSeconds))])),
      adjacent1sLost: distribution(transitions.adjacent.filter(row => row.x).map(row => row.x.lost)),
      adjacent1sGained: distribution(transitions.adjacent.filter(row => row.x).map(row => row.x.gained)),
      adjacentNucleusDisplacement: distribution(nucleusSteps.map(row => row.nucleusDisplacement)),
      adjacentNucleusExactSwitches: nucleusSteps.filter(row => row.nucleusExactCellSwitch).length
    },
    productionComparison: {
      sameAnchorSkeletonOverlap: { pairedAnchors: validPair.length, jaccard: distribution(overlaps),
        meanXOnly: mean(validPair.map(row => row.productionVsX.gained)),
        meanProductionOnly: mean(validPair.map(row => row.productionVsX.lost)) },
      productionGeometry: {
        nodes: prodGeom('nodes'), inducedEdges: prodGeom('inducedEdges'),
        euclideanDiameter: prodGeom('euclideanDiameter'), centroidDistanceFromEntry: prodGeom('centroidDistanceFromEntry'),
        minRadialDistanceFromEntry: prodGeom('minRadialDistanceFromEntry'),
        maxRadialDistanceFromEntry: prodGeom('maxRadialDistanceFromEntry'),
        angularSpan: prodGeom('angularSpanAroundEntry'), boundaryFraction: prodGeom('nearBoundaryFraction'),
        radialAlignment: prodGeom('meanRadialEdgeAlignment'), majorAxisRadians: prodGeom('majorAxisRadians'),
        aspectRatio: prodGeom('aspectRatio'), sourceDistanceFromEntry: prodGeom('sourceDistanceFromEntry'),
        centroidDistanceFromSource: prodGeom('centroidDistanceFromSource'),
        sourceBoundaryDistance: prodGeom('sourceBoundaryDistance'),
        targetBoundaryDistance: prodGeom('targetBoundaryDistance'),
        geodesicLength: prodGeom('geodesicLength'),
        edgeOrientationHistogram12: aggregateHistogram(availableProduction,
          row => row.productionCandidateGeometry?.edgeOrientationHistogram12),
        branchEdgeOrientationHistogram12: aggregateHistogram(availableProduction,
          row => row.productionCandidateGeometry?.branchEdgeOrientationHistogram12)
      },
      productionTemporalJaccard: {
        adjacent1s: distribution(transitions.adjacent.filter(row => row.productionI)
          .map(row => row.productionI.jaccard)),
        fixedWindows: Object.fromEntries(Object.entries(transitions.fixedWindows).map(([key, rows]) =>
          [key, distribution(rows.filter(row => row.productionI).map(row => row.productionI.jaccard))]))
      },
      productionTemporalActualSpanSeconds: {
        adjacent1s: distribution(transitions.adjacent.filter(row => row.productionI).map(row => row.actualSpanSeconds)),
        fixedWindows: Object.fromEntries(Object.entries(transitions.fixedWindows).map(([key, rows]) =>
          [key, distribution(rows.filter(row => row.productionI).map(row => row.actualSpanSeconds))]))
      },
      productionToXCentroidDistance: distribution(validPair.map(row => row.productionCandidateGeometry
        && row.x.geometry ? Math.hypot(
          row.productionCandidateGeometry.centroid.x - row.x.geometry.centroid.x,
          row.productionCandidateGeometry.centroid.y - row.x.geometry.centroid.y
        ) : null).filter(Number.isFinite)),
      productionTargetBoundaryDistance: distribution(availableProduction.map(row =>
        row.productionCandidateGeometry.targetBoundaryDistance).filter(Number.isFinite))
    },
    materialOverlap: {
      xOverlapFractionOfX: distribution(availableX.map(row => row.xMaterial.overlapFractionOfX)),
      xOnlyCells: distribution(availableX.map(row => row.xMaterial.xOnly)),
      priorMaterialOnlyInsideDisk: distribution(availableX.map(row => row.xMaterial.priorMaterialOnlyInsideDisk)),
      multilayerCellsUnderX: distribution(availableX.map(row => row.xMaterial.multilayerCellCountUnderX)),
      meanLayerCountUnderX: distribution(availableX.map(row => row.xMaterial.meanLayerCountUnderX))
    }
  };
}

function completeProductionGeometry(geometry, candidate) {
  return {
    ...geometry,
    sourceDistanceFromEntry: Math.hypot(candidate.source.x - ENTRY.x, candidate.source.y - ENTRY.y),
    centroidDistanceFromSource: Math.hypot(geometry.centroid.x - candidate.source.x,
      geometry.centroid.y - candidate.source.y),
    geodesicLength: candidate.geodesicLength,
    sourceBoundaryDistance: Math.min(candidate.source.x, candidate.source.y,
      1 - candidate.source.x, 1 - candidate.source.y),
    targetBoundaryDistance: Math.min(candidate.target.x, candidate.target.y,
      1 - candidate.target.x, 1 - candidate.target.y)
  };
}

function aggregateHistogram(rows, select) {
  const counts = Array(12).fill(0);
  for (const row of rows) {
    const values = select(row);
    if (!values) continue;
    for (let index = 0; index < counts.length; index += 1) counts[index] += values[index] || 0;
  }
  const total = counts.reduce((sum, value) => sum + value, 0);
  return { counts, fractions: total ? counts.map(value => value / total) : counts.map(() => 0), total };
}

function matchBirthContexts(plateBirths, anchors) {
  const byTime = new Map(anchors.map(row => [roundTime(row.timeSeconds), row]));
  return plateBirths.map(birth => ({
    id: birth.id, timeSeconds: birth.timeSeconds,
    contexts: [-20, -10, 0, 10].map(offset => {
      const row = byTime.get(roundTime(birth.timeSeconds + offset));
      return {
        offsetSeconds: offset, timeSeconds: birth.timeSeconds + offset,
        valid: !!row,
        productionCandidate: row?.productionCandidate ? {
          source: row.productionCandidate.source, target: row.productionCandidate.target,
          nodeCount: row.productionCandidate.skeletonIndices.length,
          maskCount: row.productionCandidate.maskIndices.length
        } : null,
        x: row?.x.available ? {
          nucleus: row.x.nucleus, nodes: row.x.geometry.nodes,
          centroid: row.x.geometry.centroid, priorMaterialOverlap: row.xMaterial
        } : null,
        priorMaterial: row?.priorMaterial ?? null,
        bornPlate: offset === 0 ? {
          id: birth.id, structuralCells: birth.maskIndices.length,
          maskIndices: birth.maskIndices
        } : null
      };
    })
  }));
}

function summarizeProduction(ctx, controller, finalWorld) {
  const anchors = ctx.anchors;
  const frames = anchors.map(row => row.world);
  const flow = ctx.spawnEvents.filter(row => row.flowConditioned);
  const finalMaterial = finalWorld.material;
  const totalTravel = ctx.travel;
  const windows = ctx.windows.map((window, index) => {
    const rows = frames.filter(row => windowIndex(row.timeSeconds) === index);
    return {
      ...window,
      populationMean: mean(rows.map(row => row.population)),
      finalPopulation: rows.at(-1)?.population ?? null,
      pheromone: summarizeDistributionRows(rows.map(row => row.pheromone)),
      surfaceField: summarizeDistributionRows(rows.map(row => row.surfaceField)),
      materialAtEnd: rows.at(-1)?.material ?? null
    };
  });
  return {
    population: { initial: 1, final: controller.agents.length,
      totalAcceptedSpawns: ctx.spawns.accepted, totalRetired: controller.totalRetired,
      recruitmentLimit: controller.recruitmentLimit,
      oneSecondPopulation: distribution(frames.map(row => row.population)) },
    spawns: {
      ...ctx.spawns,
      flowConditionedFraction: ctx.spawns.accepted ? ctx.spawns.flowConditioned / ctx.spawns.accepted : 0,
      fallbackFraction: ctx.spawns.accepted ? ctx.spawns.isotropicFallback / ctx.spawns.accepted : 0,
      flowEligibleN: distribution(flow.map(row => row.N)),
      flowResultant: distribution(flow.map(row => row.R)),
      blockedPlacementContext: {
        successfulAcceptedSpawns: ctx.spawns.accepted,
        blockedPlacementCalls: ctx.spawns.blockedPlacementCalls,
        scheduledOpportunities: ctx.spawns.scheduledOpportunities,
        retryCalls: ctx.spawns.retryCalls,
        retryRecoveries: ctx.spawns.retryRecoveries,
        capacitySuppressedCalls: ctx.spawns.capacitySuppressedCalls,
        retryPendingAt600s: ctx.retryPending
      },
      events: ctx.spawnEvents
    },
    movement: {
      totalRealizedTravel: totalTravel, activeAntSeconds: ctx.activeAntSeconds,
      meanRealizedSpeed: ctx.activeAntSeconds ? totalTravel / ctx.activeAntSeconds : null,
      blockedAgentFrames: ctx.blockedAgentFrames,
      newlyBlockedAgentFrames: ctx.newlyBlockedAgentFrames,
      footContactEvents: ctx.footContactEvents,
      footContactLegs: ctx.footContactLegs
    },
    pheromone: summarizeDistributionRows(frames.map(row => row.pheromone)),
    surfaceField: summarizeDistributionRows(frames.map(row => row.surfaceField)),
    worldAt600: finalWorld,
    materialAt600: finalMaterial,
    plateBirths: ctx.plateBirths.map(({ maskIndices, ...row }) => ({
      ...row, structuralCellCount: maskIndices.length, maskIndices
    })),
    windows
  };
}

function summarizeRuns(runs) {
  return {
    schema: 'ant-materialization-production-shaped-x-shadow-summary-v1',
    authority: AUTHORITY, branch: BRANCH,
    exactQuestion: 'Does stateless max-D -> X remain a finite, coherent, visually/materially distinct local capture alternative to source->boundary selection on current production histories?',
    seeds: runs.map(run => ({
      seed: run.seed, determinismHash: run.determinismHash, analysisSchedule: run.analysisSchedule,
      xAvailability: run.selector.xAvailability,
      productionAvailability: run.selector.productionAvailability,
      allocation: run.selector.allocation, xTemporal: run.selector.xTemporal,
      xGeometry: run.selector.xGeometry, productionComparison: run.selector.productionComparison,
      materialOverlap: run.selector.materialOverlap, production: {
        population: run.production.population,
        spawns: {
          accepted: run.production.spawns.accepted,
          flowConditioned: run.production.spawns.flowConditioned,
          isotropicFallback: run.production.spawns.isotropicFallback,
          flowConditionedFraction: run.production.spawns.flowConditionedFraction,
          scheduledOpportunities: run.production.spawns.scheduledOpportunities,
          retryCalls: run.production.spawns.retryCalls,
          retryRecoveries: run.production.spawns.retryRecoveries,
          blockedPlacementCalls: run.production.spawns.blockedPlacementCalls,
          capacitySuppressedCalls: run.production.spawns.capacitySuppressedCalls,
          placementAttempts: run.production.spawns.placementAttempts,
          clearanceRejectedPositions: run.production.spawns.clearanceRejectedPositions
        },
        movement: run.production.movement, worldAt600: run.production.worldAt600,
        materialAt600: run.production.materialAt600,
        plateBirths: run.production.plateBirths.map(({ maskIndices, ...row }) => row)
      },
      birthContextCount: run.births.length,
      parity: run.validation.parity
    })),
    serialDependence: '1 s anchors are repeated observations from three deterministic histories; seeds are the replication units.',
    interpretationBoundary: 'Observer-only selection evidence. No X maturation, commit, BODY, descriptor, Plate, audio, Residence, artistic acceptance, or production adoption.'
  };
}

function makeRenderSnapshot(controller) {
  const state = controller.getSnapshot();
  const material = state.stratigraphy;
  return {
    agents: state.agents,
    stratigraphy: {
      width: material.width, height: material.height, revision: material.revision,
      plates: [],
      stratigraphy: {
        topLayerByCell: Array.from(material.stratigraphy.topLayerByCell),
        layerCountByCell: Array.from(material.stratigraphy.layerCountByCell)
      }
    }
  };
}

function fingerprint(controller, rng, full) {
  const material = full ? controller.materialStratigraphy.getSnapshot() : null;
  const candidate = controller.trailPlateBirth.candidate;
  const basic = {
    simulationTimeMs: controller.simulationTimeMs, nextSpawnTimeMs: controller.nextSpawnTimeMs,
    totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
    recruitmentLimit: controller.recruitmentLimit, rngCalls: rng.calls, rngState: rng.state(),
    lastAnalysisTimeMs: controller.trailPlateBirth.lastAnalysisTimeMs,
    agents: controller.agents.map(agent => ({
      ...agent, gait: controller.gaitController.getSnapshot(agent),
      bodyPose: controller.bodyPoseController.getSnapshot(agent)
    })),
    candidate: candidate ? {
      startedAtMs: candidate.startedAtMs, stableSeconds: candidate.stableSeconds,
      similarity: candidate.similarity, source: candidate.source, target: candidate.target,
      path: candidate.path, skeletonIndices: candidate.skeletonIndices,
      mask: digest(Buffer.from(candidate.mask)), supportedMask: digest(Buffer.from(candidate.supportedMask))
    } : null,
    plates: controller.trailPlateBirth.getPlates().map(plate => [plate.id, plate.bornAtSimulationTimeMs]),
    activation: controller.colonyActivation.getSnapshot()
  };
  if (!full) return digest(JSON.stringify(basic));
  basic.field = digest(bytes(controller.field.values));
  basic.surface = digest(bytes(controller.surfaceField.values));
  basic.surfaceFootContacts = controller.surfaceField.totalFootContacts;
  basic.chemicalMemory = digest(bytes(controller.trailPlateBirth.chemicalMemory));
  basic.footContactCounts = digest(bytes(controller.trailPlateBirth.footContactCounts));
  basic.material = [
    material.revision, material.noduleRevision,
    digest(bytes(material.stratigraphy.topLayerByCell)),
    digest(bytes(material.stratigraphy.layerCountByCell)),
    digest(bytes(material.stratigraphy.totalDepthByCellMeters))
  ];
  basic.deposition = [...controller.gasterDeposition.ants].map(([id, value]) =>
    [id, value.distance, value.amount]);
  return digest(JSON.stringify(basic));
}

function productionOps(sourceText) {
  const math = Object.create(Math);
  math.random = () => { throw new Error('shadow analysis attempted Math.random'); };
  const neighborStart = sourceText.indexOf('function neighborValues(');
  const neighborEnd = sourceText.indexOf('function createPheromoneSampler(', neighborStart);
  const thinStart = sourceText.indexOf('function zhangSuen(');
  const thinEnd = sourceText.indexOf('function skeletonComponents(', thinStart);
  assert.ok(neighborStart >= 0 && neighborEnd > neighborStart);
  assert.ok(thinStart >= 0 && thinEnd > thinStart);
  const code = 'const TRAIL_PLATE_GRID_SIZE=' + GRID + ';\n'
    + sourceText.slice(neighborStart, neighborEnd) + '\n'
    + sourceText.slice(thinStart, thinEnd) + '\n'
    + '({neighbors,zhangSuen})';
  return runInNewContext(code, { Math: math });
}

function measureGeometry(cells, origin, rootIndex, diskCellCount, ops) {
  if (!cells.length) return null;
  const set = new Set(cells), degree = new Map();
  let edgeCount = 0, endpoints = 0, junctions = 0;
  const edges = [];
  for (const cell of cells) {
    const adjacent = ops.neighbors(cell).filter(next => set.has(next));
    degree.set(cell, adjacent.length);
    if (adjacent.length === 1) endpoints += 1;
    if (adjacent.length >= 3) junctions += 1;
    for (const next of adjacent) if (next > cell) {
      edgeCount += 1;
      edges.push([cell, next]);
    }
  }
  let componentCount = 0;
  const seen = new Set();
  for (const start of cells) {
    if (seen.has(start)) continue;
    componentCount += 1;
    const queue = [start]; seen.add(start);
    for (let head = 0; head < queue.length; head += 1) {
      for (const next of ops.neighbors(queue[head])) {
        if (set.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
  }
  const points = cells.map(index => point(index));
  let xSum = 0, ySum = 0, minX = 1, maxX = 0, minY = 1, maxY = 0;
  let minRadius = Infinity, maxRadius = 0, nearBoundary = 0;
  const angles = [];
  for (const p of points) {
    xSum += p.x; ySum += p.y;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    const radius = Math.hypot(p.x - origin.x, p.y - origin.y);
    minRadius = Math.min(minRadius, radius); maxRadius = Math.max(maxRadius, radius);
    if (Math.min(p.x, p.y, 1 - p.x, 1 - p.y) <= TRAIL_PLATE_TARGET_EDGE_DISTANCE) nearBoundary += 1;
    if (radius > EPSILON) angles.push(Math.atan2(p.y - origin.y, p.x - origin.x));
  }
  const centroid = { x: xSum / points.length, y: ySum / points.length };
  const covariance = covarianceOf(points, centroid);
  const majorAxisRadians = 0.5 * Math.atan2(2 * covariance.xy, covariance.xx - covariance.yy);
  const discriminant = Math.hypot(covariance.xx - covariance.yy, 2 * covariance.xy);
  const majorEigenvalue = Math.max(0, (covariance.xx + covariance.yy + discriminant) * 0.5);
  const minorEigenvalue = Math.max(0, (covariance.xx + covariance.yy - discriminant) * 0.5);
  const aspectRatio = minorEigenvalue > 1e-15 ? Math.sqrt(majorEigenvalue / minorEigenvalue)
    : majorEigenvalue > 0 ? null : 1;
  let radialAlignmentSum = 0, radialAlignmentCount = 0;
  const orientationBins = Array(12).fill(0), branchOrientationBins = Array(12).fill(0);
  for (const [a, b] of edges) {
    const pa = point(a), pb = point(b), dx = pb.x - pa.x, dy = pb.y - pa.y;
    const theta = undirectedAngle(Math.atan2(dy, dx));
    orientationBins[Math.min(11, Math.floor(theta / Math.PI * 12))] += 1;
    if (degree.get(a) >= 3 || degree.get(b) >= 3) {
      branchOrientationBins[Math.min(11, Math.floor(theta / Math.PI * 12))] += 1;
    }
    const mx = (pa.x + pb.x) * 0.5 - origin.x, my = (pa.y + pb.y) * 0.5 - origin.y;
    const radius = Math.hypot(mx, my), length = Math.hypot(dx, dy);
    if (radius > EPSILON && length > 0) {
      radialAlignmentSum += Math.abs((dx * mx + dy * my) / (length * radius));
      radialAlignmentCount += 1;
    }
  }
  const graph = rootIndex !== null && rootIndex !== undefined && set.has(rootIndex)
    ? weightedGraphDistances(rootIndex, set, ops) : { connected: componentCount === 1,
      maximumDistance: null, reached: null };
  const entryDistance = Math.hypot(centroid.x - origin.x, centroid.y - origin.y);
  let targetBoundaryDistance = null;
  if (rootIndex !== null && rootIndex !== undefined) {
    const root = point(rootIndex);
    targetBoundaryDistance = Math.min(root.x, root.y, 1 - root.x, 1 - root.y);
  }
  return {
    nodes: cells.length, inducedEdges: edgeCount, components: componentCount,
    connected: componentCount === 1 && (graph.reached === null || graph.reached === cells.length),
    endpoints, junctionNodes: junctions, cycleRank: edgeCount - cells.length + componentCount,
    centroid, centroidDistanceFromEntry: entryDistance,
    bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
    euclideanDiameter: diameter(points), minRadialDistanceFromEntry: minRadius,
    maxRadialDistanceFromEntry: maxRadius,
    angularSpanAroundEntry: angularSpan(angles),
    majorAxisRadians, aspectRatio,
    nearBoundaryNodes: nearBoundary,
    nearBoundaryFraction: nearBoundary / cells.length,
    meanRadialEdgeAlignment: radialAlignmentCount ? radialAlignmentSum / radialAlignmentCount : null,
    edgeOrientationHistogram12: orientationBins,
    branchEdgeOrientationHistogram12: branchOrientationBins,
    maxEuclideanRadius: rootIndex !== null && rootIndex !== undefined
      ? maximumRadius(cells, rootIndex) : null,
    maxWeightedGraphDistance: graph.maximumDistance,
    densityDiskArea: diskCellCount ? cells.length / diskCellCount : null,
    targetBoundaryDistance
  };
}

function weightedGraphDistances(root, set, ops) {
  const distances = new Map([[root, 0]]), heap = new MinHeap();
  heap.push(0, root);
  while (heap.length) {
    const [distance, cell] = heap.pop();
    if (distance !== distances.get(cell)) continue;
    for (const next of ops.neighbors(cell)) {
      if (!set.has(next)) continue;
      const step = Math.abs(next % GRID - cell % GRID) === 1
        && Math.abs(Math.floor(next / GRID) - Math.floor(cell / GRID)) === 1
        ? Math.SQRT2 / SCALE : 1 / SCALE;
      const candidate = distance + step;
      if (candidate < (distances.get(next) ?? Infinity)) {
        distances.set(next, candidate); heap.push(candidate, next);
      }
    }
  }
  let maximumDistance = 0;
  for (const distance of distances.values()) maximumDistance = Math.max(maximumDistance, distance);
  return { connected: distances.size === set.size, maximumDistance, reached: distances.size };
}

function diameter(points) {
  if (points.length < 2) return 0;
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of sorted.slice().reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  const hull = lower.concat(upper);
  let max = 0;
  for (let i = 0; i < hull.length; i += 1) for (let j = i + 1; j < hull.length; j += 1) {
    max = Math.max(max, Math.hypot(hull[i].x - hull[j].x, hull[i].y - hull[j].y));
  }
  return max;
}

function angularSpan(values) {
  if (values.length <= 1) return 0;
  const sorted = values.map(angle => (angle + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
  let largestGap = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + Math.PI * 2;
    largestGap = Math.max(largestGap, next - sorted[i]);
  }
  return Math.PI * 2 - largestGap;
}

function covarianceOf(points, center) {
  let xx = 0, yy = 0, xy = 0;
  for (const p of points) {
    const x = p.x - center.x, y = p.y - center.y;
    xx += x * x; yy += y * y; xy += x * y;
  }
  const n = points.length || 1;
  return { xx: xx / n, yy: yy / n, xy: xy / n };
}
function maximumRadius(cells, root) {
  const center = point(root);
  let max = 0;
  for (const cell of cells) {
    const p = point(cell);
    max = Math.max(max, Math.hypot(p.x - center.x, p.y - center.y));
  }
  return max;
}

function regionOccupancy(rows, bins) {
  const out = {};
  for (const row of rows) {
    const key = Math.min(bins - 1, Math.floor(row.x.nucleus.x * bins)) + ','
      + Math.min(bins - 1, Math.floor(row.x.nucleus.y * bins));
    out[key] = (out[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, frames]) => [key, { frames, fraction: rows.length ? frames / rows.length : 0 }]));
}

function angleHistogram(angles, bins) {
  const counts = Array(bins).fill(0);
  for (const angle of angles) {
    const normalized = ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    counts[Math.min(bins - 1, Math.floor(normalized / (2 * Math.PI) * bins))] += 1;
  }
  return counts;
}

function summarizeScalarField(values, width, height) {
  let sum = 0, max = 0, occupied = 0, xsum = 0, ysum = 0, entropy = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    sum += value; max = Math.max(max, value);
    if (value > 0) {
      occupied += 1; xsum += (i % width) / (width - 1);
      ysum += Math.floor(i / width) / (height - 1);
    }
  }
  if (sum > 0) for (const value of values) if (value > 0) {
    const p = value / sum; entropy -= p * Math.log(p);
  }
  return {
    width, height, sum, mean: values.length ? sum / values.length : 0, max,
    occupiedCells: occupied, coverage: values.length ? occupied / values.length : 0,
    centroid: occupied ? { x: xsum / occupied, y: ysum / occupied } : null,
    normalizedEntropy: sum > 0 && values.length > 1 ? entropy / Math.log(values.length) : null
  };
}

function summarizeDistributionRows(rows) {
  if (!rows.length) return null;
  return {
    sum: distribution(rows.map(row => row.sum)), max: distribution(rows.map(row => row.max)),
    coverage: distribution(rows.map(row => row.coverage)),
    occupiedCells: distribution(rows.map(row => row.occupiedCells)),
    normalizedEntropy: distribution(rows.map(row => row.normalizedEntropy).filter(Number.isFinite))
  };
}

function setCompare(previous, current) {
  if (previous === null || current === null) return { status: 'unavailable' };
  const left = new Set(previous), right = new Set(current);
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return {
    status: 'available', previousSize: left.size, currentSize: right.size, intersection,
    lost: left.size - intersection, gained: right.size - intersection, union,
    jaccard: union ? intersection / union : 1
  };
}

function measureOutgoingSpawnFlow(segments) {
  const eligible = [];
  for (const segment of segments || []) {
    const dx = segment?.dx, dy = segment?.dy, dt = segment?.dt;
    const length = Math.hypot(dx, dy);
    if (!(length > 0) || !(dt > 0)) continue;
    const midpointX = (segment.from.x + segment.to.x) * 0.5;
    const midpointY = (segment.from.y + segment.to.y) * 0.5;
    const rx = midpointX - ENTRY.x, ry = midpointY - ENTRY.y;
    const radius = Math.hypot(rx, ry), speed = length / dt;
    if (!(radius > 0.018 && radius <= 0.085 && speed >= 0.008 && rx * dx + ry * dy > 0)) continue;
    eligible.push({ x: dx / length, y: dy / length });
  }
  if (eligible.length < 3) return { available: false, N: eligible.length, R: null, phi: null };
  const x = eligible.reduce((sum, item) => sum + item.x, 0) / eligible.length;
  const y = eligible.reduce((sum, item) => sum + item.y, 0) / eligible.length;
  const R = Math.hypot(x, y);
  return R > 1e-9 ? { available: true, N: eligible.length, R, phi: Math.atan2(y, x) }
    : { available: false, N: eligible.length, R, phi: null };
}

function summarizeWorldAtAnchorPlaceholder() {}

function productionOpsSelfCheck(ops) {
  const mask = new Uint8Array(COUNT);
  for (let x = 35; x <= 55; x += 1) for (let y = 40; y <= 45; y += 1) mask[y * GRID + x] = 1;
  const F = ops.zhangSuen(mask);
  const D = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i += 1) if (F[i]) D[i] = 1;
  const q = computeX(mask, F, D, ops);
  assert.ok(q && q.cells.includes(q.nucleus.index));
  assert.equal(q.geometry.connected, true);
  assert.ok(q.geometry.maxEuclideanRadius <= RADIUS + EPSILON);
  const d = diameter([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
  assert.equal(d, Math.SQRT2);
  assert.equal(angularSpan([Math.PI - 0.1, -Math.PI + 0.1]) < 0.21, true);
}

function runSelfChecks(ops = null) {
  if (ops) productionOpsSelfCheck(ops);
  assert.deepEqual(setCompare([1, 2, 3], [2, 3, 4]), {
    status: 'available', previousSize: 3, currentSize: 3, intersection: 2,
    lost: 1, gained: 1, union: 4, jaccard: 0.5
  });
  const flow = measureOutgoingSpawnFlow([
    { from: { x: 0.5, y: 0.74 }, to: { x: 0.5, y: 0.75 }, dx: 0, dy: 0.01, dt: 1 },
    { from: { x: 0.51, y: 0.74 }, to: { x: 0.51, y: 0.75 }, dx: 0, dy: 0.01, dt: 1 },
    { from: { x: 0.49, y: 0.74 }, to: { x: 0.49, y: 0.75 }, dx: 0, dy: 0.01, dt: 1 }
  ]);
  assert.equal(flow.available, true);
  assert.equal(flow.N, 3);
  assert.equal(flow.R, 1);
}

function withMathRandomForbidden(callback) {
  const original = Math.random;
  let calls = 0;
  Math.random = () => { calls += 1; throw new Error('observer attempted Math.random'); };
  try { callback(); }
  finally { Math.random = original; }
  return calls;
}

function countedLcg(seed) {
  let state = seed >>> 0, calls = 0;
  return {
    random() { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; },
    get calls() { return calls; },
    state() { return state; }
  };
}

class MinHeap {
  constructor() { this.items = []; }
  push(distance, index) {
    const item = [distance, index]; this.items.push(item);
    let child = this.items.length - 1;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (this.items[parent][0] < distance
        || (this.items[parent][0] === distance && this.items[parent][1] <= index)) break;
      this.items[child] = this.items[parent]; child = parent;
    }
    this.items[child] = item;
  }
  pop() {
    const first = this.items[0], tail = this.items.pop();
    if (this.items.length) {
      let parent = 0;
      while (true) {
        const left = parent * 2 + 1, right = left + 1;
        if (left >= this.items.length) break;
        const child = right < this.items.length
          && (this.items[right][0] < this.items[left][0]
            || (this.items[right][0] === this.items[left][0] && this.items[right][1] < this.items[left][1]))
          ? right : left;
        if (this.items[child][0] > tail[0]
          || (this.items[child][0] === tail[0] && this.items[child][1] >= tail[1])) break;
        this.items[parent] = this.items[child]; parent = child;
      }
      this.items[parent] = tail;
    }
    return first;
  }
  get length() { return this.items.length; }
}

function withinDisk(index, nucleus) {
  const dx = ((index % GRID) - (nucleus % GRID)) / SCALE;
  const dy = (Math.floor(index / GRID) - Math.floor(nucleus / GRID)) / SCALE;
  return Math.hypot(dx, dy) <= RADIUS + EPSILON;
}
function makeDiskMask(nucleus) {
  const mask = new Uint8Array(COUNT);
  for (let i = 0; i < COUNT; i += 1) if (withinDisk(i, nucleus)) mask[i] = 1;
  return mask;
}
function point(index) { return { x: (index % GRID) / SCALE, y: Math.floor(index / GRID) / SCALE }; }
function indices(mask) {
  const result = [];
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) result.push(i);
  return result;
}
function materialUnionIndices(snapshot) {
  const layers = snapshot.stratigraphy.layerCountByCell, result = [];
  for (let i = 0; i < layers.length; i += 1) if (layers[i] > 0) result.push(i);
  return result;
}
function undirectedAngle(value) { return ((value % Math.PI) + Math.PI) % Math.PI; }
function distribution(values) {
  const numbers = values.filter(Number.isFinite);
  if (!numbers.length) return { count: 0, min: null, p10: null, median: null, mean: null, p90: null, max: null };
  const sorted = numbers.slice().sort((a, b) => a - b);
  const q = p => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  return { count: sorted.length, min: sorted[0], p10: q(0.1), median: q(0.5),
    mean: mean(sorted), p90: q(0.9), max: sorted.at(-1) };
}
function circularSummary(angles) {
  if (!angles.length) return { count: 0, meanAngle: null, concentration: null };
  const x = mean(angles.map(angle => Math.cos(angle))), y = mean(angles.map(angle => Math.sin(angle)));
  return { count: angles.length, meanAngle: Math.atan2(y, x), concentration: Math.hypot(x, y) };
}
function repeatCount(values) {
  const seen = new Set(); let repeated = 0;
  for (const value of values) { if (seen.has(value)) repeated += 1; else seen.add(value); }
  return repeated;
}
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function windowIndex(seconds) { return Math.max(0, Math.min(9, Math.floor(seconds / 60))); }
function clippedSegmentLength(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, x0], [dx, 1 - x0], [-dy, y0], [dy, 1 - y0]]) {
    if (p === 0) { if (q < 0) return 0; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return 0;
  }
  return Math.hypot(dx, dy) * Math.max(0, t1 - t0);
}
function bytes(value) {
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function shaText(value) { return digest(Buffer.from(value.replace(/\r\n?/g, '\n'), 'utf8')); }
function roundTime(seconds) { return Math.round(seconds * 1000) / 1000; }

async function hashSources() {
  const hashes = {};
  for (const path of SOURCES) {
    const raw = await readFile(resolve(ROOT, path));
    const normalized = Buffer.from(raw.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8');
    hashes[path] = {
      rawSha256: digest(raw), lfSha256: shaText(raw.toString('utf8')),
      gitBlob: gitBlobHash(normalized)
    };
  }
  return hashes;
}
function gitBlobHash(content) {
  return createHash('sha1').update('blob ' + content.length + '\0').update(content).digest('hex');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
