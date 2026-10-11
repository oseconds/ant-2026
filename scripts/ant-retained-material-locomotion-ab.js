import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
  AntController, materialLayerCountAtSnapshot, materialLocomotionMultiplier
} from '../src/lib/agents/ant/AntController.js';
import { createMaterialExperienceObserver } from './ant-material-experience-shadow.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DT = 1 / 60;
const GRID = 24;
const CELL_COUNT = GRID * GRID;
const SEEDS = [20261005, 20261006, 20261007];
const WINDOWS = [{ start: 0, end: 200 }, { start: 200, end: 400 }, { start: 400, end: 600 }];
const FIELDS = ['agentTrajectory', 'lifecycle', 'rng', 'pheromone', 'surfaceField', 'gait', 'bodyPose',
  'gasterDeposition', 'colonyActivation', 'localOccupancy', 'footContacts', 'materialBirthEvents',
  'trailPlateBirth', 'materialStratigraphy'];
const UNCHANGED_PATHS = ['package.json', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/GaitController.js',
  'src/lib/agents/ant/BodyPoseController.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/ColonyActivation.js'];
const HASH_PATHS = ['AGENTS.md', 'docs/ant/README.md', 'docs/ant/world-model.md',
  'scripts/ant-material-experience-shadow.js', 'src/lib/agents/ant/AntController.js',
  'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'tests/ant-material-locomotion-resistance.test.js', 'scripts/ant-retained-material-locomotion-ab.js'];
const BASELINE_HASH_PATHS = HASH_PATHS.filter(path =>
  path !== 'tests/ant-material-locomotion-resistance.test.js'
    && path !== 'scripts/ant-retained-material-locomotion-ab.js');
const CLI = new Map(process.argv.slice(2).map(arg => {
  const i = arg.indexOf('=');
  return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
}));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  const baselineRef = String(CLI.get('--baseline') || 'origin/main');
  const baselineCommit = git(['rev-parse', baselineRef + '^{commit}']);
  const requiredBase = 'f09d67f1eab6f13e7466e1f8ea8c05c08145f995';
  assert.equal(baselineCommit, requiredBase, 'run against the verified retained-material shadow baseline');
  git(['merge-base', '--is-ancestor', baselineCommit, 'HEAD']);
  for (const path of UNCHANGED_PATHS) git(['diff', '--exit-code', baselineCommit, '--', path]);

  const seeds = String(CLI.get('--seeds') || SEEDS.join(',')).split(',').map(Number);
  const seconds = Number(CLI.get('--seconds') || 600);
  const outputPath = String(CLI.get('--output')
    || 'docs/ant/evidence/2026-10-11-retained-material-locomotion-ab-final');
  const shadowPath = resolve(ROOT, String(CLI.get('--shadow-evidence')
    || 'docs/ant/evidence/2026-10-11-retained-material-experience-shadow-final'));
  const out = resolve(ROOT, outputPath);
  assert.deepEqual(seeds, SEEDS, 'the paired baseline uses the three specified seeds');
  assert.equal(seconds, 600, 'the paired baseline uses 600 simulated seconds');
  assert.equal(seconds * 60, 36000);
  await mkdir(out, { recursive: true });
  assert.equal((await readdir(out)).length, 0, 'evidence output directory must be empty');

  const shadowManifest = JSON.parse(await readFile(resolve(shadowPath, 'manifest.json'), 'utf8'));
  assert.equal(shadowManifest.baselineCommit, '27d2deab8fe0495c740023793820efd3dd8994a4',
    'authoritative shadow evidence must match the verified production baseline');
  const expectedParity = {};
  for (const seed of seeds) {
    const summary = JSON.parse(await readFile(resolve(shadowPath, 'seed-' + seed + '-summary.json'), 'utf8'));
    expectedParity[seed] = Object.fromEntries(FIELDS.map(field =>
      [field, summary.parity.fields[field].baselineSha256]));
  }

  const baselineHashes = Object.fromEntries(await Promise.all(BASELINE_HASH_PATHS.map(async path =>
    [path, sha256(gitBytes(['show', baselineCommit + ':' + path]))])));
  const workingHashes = Object.fromEntries(await Promise.all(HASH_PATHS.map(async path =>
    [path, sha256(await readFile(resolve(ROOT, path)))])));

  const controls = [];
  for (const seed of seeds) {
    const result = await runOne({ seed, seconds, condition: 'Control' });
    const parity = compareControlToShadow(result.hashes, expectedParity[seed], seed);
    result.summary.controlParity = parity;
    await writeJson(out, 'seed-' + seed + '-Control-summary.json', result.summary);
    await writeJson(out, 'seed-' + seed + '-Control-ants.json', result.experience.ants);
    await writeCsv(out, 'seed-' + seed + '-Control-episodes.csv',
      ['antId', 'index', 'startTimeSeconds', 'endTimeSeconds', 'durationSeconds', 'rightCensored', 'topPlateIds'],
      result.experience.ants.flatMap(ant => ant.episodes.map(episode => ({
        antId: ant.id, ...episode, topPlateIds: episode.topPlateIds.join('|')
      }))));
    controls.push(result);
    if (!parity.exact) {
      await writeJson(out, 'control-parity-failure.json', { seed, parity, expected: expectedParity[seed] });
      throw new Error('Control/explicit-Off hash chain differs from the verified shadow baseline for seed ' + seed);
    }
    console.log(JSON.stringify({ seed, condition: 'Control', baselineParity: 'exact',
      wallSeconds: result.summary.wallSeconds }));
  }

  const treatments = [];
  for (const seed of seeds) {
    const result = await runOne({ seed, seconds, condition: 'Treatment' });
    await writeJson(out, 'seed-' + seed + '-Treatment-summary.json', result.summary);
    await writeJson(out, 'seed-' + seed + '-Treatment-ants.json', result.experience.ants);
    await writeCsv(out, 'seed-' + seed + '-Treatment-episodes.csv',
      ['antId', 'index', 'startTimeSeconds', 'endTimeSeconds', 'durationSeconds', 'rightCensored', 'topPlateIds'],
      result.experience.ants.flatMap(ant => ant.episodes.map(episode => ({
        antId: ant.id, ...episode, topPlateIds: episode.topPlateIds.join('|')
      }))));
    treatments.push(result);
    console.log(JSON.stringify({ seed, condition: 'Treatment',
      exposedMultiplier: result.summary.manipulation.meanAppliedMultiplierWhileExposed,
      wallSeconds: result.summary.wallSeconds }));
  }

  const pairings = seeds.map(seed => ({
    seed, control: controls.find(item => item.summary.seed === seed),
    treatment: treatments.find(item => item.summary.seed === seed)
  }));
  const windowRows = buildWindowRows(pairings);
  const spatial = buildSpatialComparison(pairings);
  const allRuns = [...controls, ...treatments];
  await writeJson(out, 'control-parity.json', controls.map(item => item.summary.controlParity));
  await writeJson(out, 'paired-results.json', {
    baselineCommit, productionBaselineCommit: shadowManifest.baselineCommit, seeds, seconds,
    dtSeconds: DT, candidate: 'm(L) = 1 - 0.10 * (1 - exp(-L / 4))',
    runs: allRuns.map(item => item.summary), pairedWindows: windowRows,
    spatialSummary: spatial.summary
  });
  await writeCsv(out, 'paired-windows.csv', Object.keys(windowRows[0]), windowRows);
  await writeCsv(out, 'population-recruitment-by-second.csv',
    ['seed', 'condition', 'second', 'meanPopulationPreTick', 'population', 'spawned', 'retired',
      'desiredPopulation', 'recruitmentLimit', 'onPlateFraction'],
    allRuns.flatMap(item => item.timeline));
  await writeCsv(out, 'environment-grid-24x24.csv',
    ['seed', 'condition', 'windowEndSeconds', 'cell', 'gridX', 'gridY',
      'pheromoneMean', 'surfaceMean', 'plateCoverageFraction', 'meanLayerCount', 'footContactPoints'],
    allRuns.flatMap(item => item.gridRows));
  await writeCsv(out, 'spatial-control-treatment-difference.csv',
    ['seed', 'windowEndSeconds', 'cell', 'pheromoneMeanDelta', 'surfaceMeanDelta',
      'plateCoverageFractionDelta', 'meanLayerCountDelta', 'footContactPointsDelta'],
    spatial.rows);
  await writeJson(out, 'source-hashes.json', {
    baselineCommit, productionBaselineCommit: shadowManifest.baselineCommit,
    baselineHashes, workingHashes
  });
  const manifest = {
    schemaVersion: 1, baselineRef, baselineCommit, productionBaselineCommit: shadowManifest.baselineCommit,
    passBranch: git(['branch', '--show-current']), startHead: git(['rev-parse', 'HEAD']),
    node: process.version, seeds, seconds, dtSeconds: DT, fixedHz: 60, totalTicks: seconds * 60,
    conditions: {
      control: 'materialLocomotionResistance=false explicitly; no audio bridge or state override.',
      treatment: 'materialLocomotionResistance=true; only current cell public stratigraphy layerCountByCell is read.'
    },
    candidate: {
      equation: 'm(L) = 1 - 0.10 * (1 - exp(-L / 4))',
      values: { L0: materialLocomotionMultiplier(0), L1: materialLocomotionMultiplier(1),
        L4: materialLocomotionMultiplier(4), L10: materialLocomotionMultiplier(10), asymptote: 0.9 },
      integration: 'After steering, turning, crowding, following-speed limiting and hesitation; once before targetSpeed assignment and accelerateToward.',
      timing: 'Treatment captures one public stratigraphy snapshot at tick entry before intention/movement. Same-tick FOOT_CONTACT, Plate birth, nodule birth and topology changes are first visible at the following tick boundary.',
      behaviorBoundary: 'No material input to heading, steering, target position, attraction/avoidance, or direct pheromone gain.'
    },
    rng: 'Same counted deterministic LCG used in the prior shadow/replay harness; no audio bridge; fixed 1/60 second tick.',
    controlParity: 'Each explicit-Off seed SHA-256 hash chain matches every field of the prior shadow baseline chain before any Treatment run starts. Fields cover agents/lifecycle/RNG/pheromone/SurfaceField/gait/pose/deposition/activation/occupancy/contacts/Plate births/stratigraphy.',
    observer: 'Imported read-only material experience observer samples public snapshots before each tick; observer is outside controller behavior.',
    measurements: 'Window metrics aggregate pre-tick ant-time and layer counts, post-tick targetSpeed and realized movement, FOOT_CONTACT points, population/recruitment, retained material and environmental fields. Spatial outputs use a fixed 24x24 grid for every seed/condition/window.',
    sourceHashes: { baseline: baselineHashes, working: workingHashes },
    outputFiles: [...(await readdir(out)), 'manifest.json'].sort(),
    reproduction: 'node scripts/ant-retained-material-locomotion-ab.js --baseline=f09d67f1eab6f13e7466e1f8ea8c05c08145f995 --seeds=20261005,20261006,20261007 --seconds=600 --output=' + outputPath
  };
  await writeJson(out, 'manifest.json', manifest);
}

export async function runOne({ seed, seconds, condition }) {
  const start = performance.now(), random = rngFor(seed);
  const treatment = condition === 'Treatment' || condition === 'Default-On';
  const controller = new AntController({ random,
    ...(condition === 'Default-On' ? {} : { materialLocomotionResistance: treatment }) });
  const events = { contacts: [], plates: [], nodules: [], errors: [] };
  const birthDetails = { plates: [], nodules: [] };
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') events.contacts.push(structuredClone(payload));
    else if (type === 'plate-birth') {
      events.plates.push(structuredClone(payload));
      birthDetails.plates.push({ plate: structuredClone(payload),
        repeatOf: controller.trailPlateBirth.candidate?.repeatDiagnostics?.plateId || null });
    } else if (type === 'sphere-birth') {
      events.nodules.push(structuredClone(payload));
      birthDetails.nodules.push(structuredClone(payload));
    } else if (type === 'error') events.errors.push(structuredClone(payload));
  });
  const materialHash = makeMaterialHasher(), birthHash = makeBirthHasher();
  const observer = createMaterialExperienceObserver({ dtSeconds: DT });
  const windows = WINDOWS.map((range, index) => newWindow(range, index));
  const timeline = [], gridRows = [];
  const chains = Object.fromEntries(FIELDS.map(field => [field, createHash('sha256')]));
  let previousHashRow = null, secondPopulationSum = 0, secondExposureShareSum = 0;
  await controller.init();
  try {
    previousHashRow = parityRow(controller, random, events, materialHash, birthHash);
    appendParityRow(chains, previousHashRow);
    const ticks = seconds * 60;
    for (let tick = 0; tick < ticks; tick += 1) {
      const nowSeconds = controller.simulationTimeMs / 1000;
      const windowIndex = Math.min(WINDOWS.length - 1, Math.floor(nowSeconds / 200));
      const window = windows[windowIndex];
      const agentsBefore = controller.agents.map(agent => ({
        agent, id: agent.id, x: agent.x, y: agent.y,
        layerCount: null, appliedMultiplier: 1
      }));
      const stratigraphySnapshot = controller.materialStratigraphy.getSnapshot();
      observer.observe({ simulationTimeMs: controller.simulationTimeMs,
        agents: controller.agents, stratigraphySnapshot });
      const observedHashRow = parityRow(controller, random, events, materialHash, birthHash);
      assert.ok(observedHashRow.equals(previousHashRow),
        condition + ' read-only observer changed state before tick ' + tick + ', seed ' + seed);

      window.populationSum += agentsBefore.length;
      secondPopulationSum += agentsBefore.length;
      if (agentsBefore.length >= controller.recruitmentLimit) window.atRecruitmentLimitTicks += 1;
      let exposedNow = 0;
      for (const item of agentsBefore) {
        item.layerCount = materialLayerCountAtSnapshot(stratigraphySnapshot, item.x, item.y);
        item.appliedMultiplier = treatment ? materialLocomotionMultiplier(item.layerCount) : 1;
        if (item.layerCount === 0) {
          window.layerZeroAntTicks += 1;
          assert.equal(item.appliedMultiplier, 1, 'empty cells must apply exact unit multiplier');
        } else {
          window.exposedAntTicks += 1;
          exposedNow += 1;
          window.exposedMultiplierSum += item.appliedMultiplier;
        }
        window.layerTicks[item.layerCount] = (window.layerTicks[item.layerCount] || 0) + 1;
        window.appliedMultiplierTicks[item.appliedMultiplier] =
          (window.appliedMultiplierTicks[item.appliedMultiplier] || 0) + 1;
        const cell = cellForPosition(item.x, item.y);
        window.positionCells[cell] = 1;
        const topId = topPlateIdAt(stratigraphySnapshot, item.x, item.y);
        if (topId) {
          window.topPlateIds.add(topId);
          if (window.lastTopByAnt.get(item.id) !== topId) {
            window.topPlateBouts += 1;
            if (window.seenTopByAnt.get(item.id)?.has(topId)) window.repeatTopPlateBouts += 1;
            let seen = window.seenTopByAnt.get(item.id);
            if (!seen) { seen = new Set(); window.seenTopByAnt.set(item.id, seen); }
            seen.add(topId);
            window.lastTopByAnt.set(item.id, topId);
          }
        } else {
          window.lastTopByAnt.delete(item.id);
        }
        window.headingBins[headingBin(item.agent.heading)] += 1;
      }
      secondExposureShareSum += agentsBefore.length ? exposedNow / agentsBefore.length : 0;

      clearEvents(events);
      birthDetails.plates.length = 0;
      birthDetails.nodules.length = 0;
      controller.tick(DT);
      window.footContactGroups += events.contacts.length;
      for (const event of events.contacts) for (const contact of event.contacts) {
        const position = contact?.position;
        if (Number.isFinite(position?.x) && Number.isFinite(position?.y)
          && position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1) {
          window.footContactPoints += 1;
          window.contactCells[cellForPosition(position.x, position.y)] += 1;
        }
      }
      for (const detail of birthDetails.plates) {
        window.plateBirths.push({ id: detail.plate.id,
          bornAtSimulationTimeMs: detail.plate.bornAtSimulationTimeMs, repeatOf: detail.repeatOf });
        if (detail.repeatOf) window.repeatPlateBirths += 1;
      }
      for (const nodule of birthDetails.nodules) window.noduleBirths.push({
        id: nodule.id, bornAtSimulationTimeMs: nodule.bornAtSimulationTimeMs
      });

      for (const item of agentsBefore) {
        const end = observedSegmentEnd({ x: item.x, y: item.y }, item.agent);
        const distance = Math.hypot(end.x - item.x, end.y - item.y);
        const realizedSpeed = distance / DT;
        const afterDesired = item.agent.targetSpeed;
        const beforeDesired = afterDesired / item.appliedMultiplier;
        assert.ok(Number.isFinite(beforeDesired) && Number.isFinite(afterDesired));
        window.travelDistance += distance;
        window.realizedSpeeds.push(realizedSpeed);
        window.desiredSpeedsBefore.push(beforeDesired);
        window.desiredSpeedsAfter.push(afterDesired);
        if (distance === 0) window.zeroDisplacementAntTicks += 1;
      }

      previousHashRow = parityRow(controller, random, events, materialHash, birthHash);
      appendParityRow(chains, previousHashRow);
      if ((tick + 1) % 60 === 0) {
        const activation = controller.colonyActivation.getSnapshot();
        timeline.push({
          seed, condition, second: (tick + 1) / 60,
          meanPopulationPreTick: secondPopulationSum / 60, population: controller.agents.length,
          spawned: controller.totalSpawned, retired: controller.totalRetired,
          desiredPopulation: controller.state.population.activationFeedback
            ? activation.desiredPopulation : controller.state.population.count,
          recruitmentLimit: controller.recruitmentLimit,
          onPlateFraction: secondExposureShareSum / 60
        });
        secondPopulationSum = 0;
        secondExposureShareSum = 0;
      }
      if ((tick + 1) % 12000 === 0 || tick + 1 === ticks) {
        const windowEnd = (tick + 1) / 60;
        const windowForEnd = windows[Math.min(windows.length - 1, Math.floor((windowEnd - 1e-9) / 200))];
        const snapshot = controller.materialStratigraphy.getSnapshot();
        windowForEnd.environment = summarizeEnvironment(controller, snapshot);
        gridRows.push(...environmentGridRows(seed, condition, windowEnd, controller, snapshot, windowForEnd));
      }
      if ((tick + 1) % 3600 === 0) console.log(JSON.stringify({ seed, condition,
        seconds: (tick + 1) / 60, population: controller.agents.length,
        wallSeconds: Number(((performance.now() - start) / 1000).toFixed(1)) }));
    }
    observer.finish(seconds * 1000);
    const experience = observer.summarize();
    const activeAntTicks = windows.reduce((n, w) => n + w.layerZeroAntTicks + w.exposedAntTicks, 0);
    const exposedAntTicks = windows.reduce((n, w) => n + w.exposedAntTicks, 0);
    assert.equal(activeAntTicks, experience.metrics.totalActiveAntTicks, 'manual ant-time agrees with shadow observer');
    assert.equal(exposedAntTicks, experience.metrics.totalExposureAntTicks, 'public layer count agrees with exposed material observer');
    const hashes = Object.fromEntries(FIELDS.map(field => [field, chains[field].digest('hex')]));
    const summary = summarizeRun({
      seed, condition, seconds, ticks, controller, random, windows, experience, hashes,
      wallSeconds: (performance.now() - start) / 1000
    });
    return { summary, experience, timeline, gridRows, hashes };
  } finally {
    unsubscribe();
    await controller.destroy();
  }
}

function newWindow(range, index) {
  return { ...range, index, populationSum: 0, layerZeroAntTicks: 0, exposedAntTicks: 0,
    layerTicks: {}, appliedMultiplierTicks: {}, exposedMultiplierSum: 0, travelDistance: 0,
    realizedSpeeds: [], desiredSpeedsBefore: [], desiredSpeedsAfter: [], zeroDisplacementAntTicks: 0,
    atRecruitmentLimitTicks: 0, footContactGroups: 0, footContactPoints: 0,
    contactCells: new Uint32Array(CELL_COUNT), positionCells: new Uint8Array(CELL_COUNT),
    headingBins: new Uint32Array(16), topPlateIds: new Set(), topPlateBouts: 0,
    repeatTopPlateBouts: 0, lastTopByAnt: new Map(), seenTopByAnt: new Map(),
    plateBirths: [], repeatPlateBirths: 0, noduleBirths: [], environment: null };
}

function summarizeRun({ seed, condition, seconds, ticks, controller, random, windows, experience, hashes, wallSeconds }) {
  const activeAntTicks = windows.reduce((n, w) => n + w.layerZeroAntTicks + w.exposedAntTicks, 0);
  const exposedAntTicks = windows.reduce((n, w) => n + w.exposedAntTicks, 0);
  const multiplierSum = windows.reduce((n, w) => n + Object.entries(w.appliedMultiplierTicks)
    .reduce((total, [multiplier, count]) => total + Number(multiplier) * count, 0), 0);
  const exposedMultiplierSum = windows.reduce((n, w) => n + w.exposedMultiplierSum, 0);
  const travelDistance = windows.reduce((n, w) => n + w.travelDistance, 0);
  const desiredSpeedsBefore = windows.flatMap(w => w.desiredSpeedsBefore);
  const desiredSpeedsAfter = windows.flatMap(w => w.desiredSpeedsAfter);
  const realizedSpeeds = windows.flatMap(w => w.realizedSpeeds);
  const episodes = experience.ants.flatMap(ant => ant.episodes);
  const episodeWindows = WINDOWS.map((range, index) => ({
    window: index, startSeconds: range.start, endSeconds: range.end,
    ...durationDistribution(episodes.filter(ep => ep.startTimeSeconds >= range.start
      && ep.startTimeSeconds < range.end), DT)
  }));
  return {
    seed, condition, seconds, ticks, dtSeconds: DT, fixedHz: 60,
    initialState: controller.getState(), totalSpawned: controller.totalSpawned,
    totalRetired: controller.totalRetired, finalPopulation: controller.agents.length,
    rngState: random.state(), rngCalls: random.calls,
    eventTotals: {
      footContactGroups: windows.reduce((n, w) => n + w.footContactGroups, 0),
      footContactPoints: windows.reduce((n, w) => n + w.footContactPoints, 0),
      plateBirths: windows.reduce((n, w) => n + w.plateBirths.length, 0),
      repeatPlateBirths: windows.reduce((n, w) => n + w.repeatPlateBirths, 0),
      noduleBirths: windows.reduce((n, w) => n + w.noduleBirths.length, 0)
    },
    manipulation: {
      activeAntTicks, layerZeroAntTicks: windows.reduce((n, w) => n + w.layerZeroAntTicks, 0),
      exposedAntTicks, layerZeroFraction: activeAntTicks ? (activeAntTicks - exposedAntTicks) / activeAntTicks : 0,
      exposedFraction: activeAntTicks ? exposedAntTicks / activeAntTicks : 0,
      meanAppliedMultiplierAllActive: activeAntTicks ? multiplierSum / activeAntTicks : null,
      meanAppliedMultiplierWhileExposed: exposedAntTicks ? exposedMultiplierSum / exposedAntTicks : null,
      appliedMultiplierByLayer: aggregateLayerMultipliers(windows, condition),
      meanDesiredSpeedBeforeMultiplier: mean(desiredSpeedsBefore),
      meanDesiredSpeedAfterMultiplier: mean(desiredSpeedsAfter),
      desiredSpeedDistributionBefore: quantiles(desiredSpeedsBefore),
      desiredSpeedDistributionAfter: quantiles(desiredSpeedsAfter)
    },
    movement: {
      activeAntTimeSeconds: activeAntTicks * DT, travelledDistance: travelDistance,
      meanRealizedSpeed: activeAntTicks ? travelDistance / (activeAntTicks * DT) : null,
      realizedSpeedDistribution: quantiles(realizedSpeeds),
      zeroDisplacementAntTicks: windows.reduce((n, w) => n + w.zeroDisplacementAntTicks, 0),
      zeroDisplacementFraction: activeAntTicks
        ? windows.reduce((n, w) => n + w.zeroDisplacementAntTicks, 0) / activeAntTicks : 0
    },
    experience: {
      ...experience.metrics, episodeDurationDistribution: experience.episodeDurationDistribution,
      episodeDurationByStartWindow: episodeWindows,
      layerCountDistribution: experience.layerCountDistribution,
      lifetimeDistribution: quantiles(experience.ants.map(ant => ant.activeTimeSeconds)),
      rightCensoredAntCount: experience.ants.filter(ant => ant.retiredAtTimeSeconds === null).length
    },
    windows: windows.map(w => summarizeWindow(w, experience)),
    finalEnvironment: windows.at(-1).environment,
    hashChains: hashes, wallSeconds: Number(wallSeconds.toFixed(2))
  };
}

function summarizeWindow(w, experience) {
  const totalAntTicks = w.layerZeroAntTicks + w.exposedAntTicks;
  const antSeconds = totalAntTicks * DT;
  const episodes = experience.ants.flatMap(ant => ant.episodes)
    .filter(ep => ep.startTimeSeconds >= w.start && ep.startTimeSeconds < w.end);
  return {
    startSeconds: w.start, endSeconds: w.end,
    meanPopulation: w.populationSum / ((w.end - w.start) * 60),
    recruitmentAtLimitTickFraction: w.atRecruitmentLimitTicks / ((w.end - w.start) * 60),
    activeAntTicks: totalAntTicks, exposedAntTicks: w.exposedAntTicks,
    layerZeroFraction: totalAntTicks ? w.layerZeroAntTicks / totalAntTicks : 0,
    plateExposureFraction: totalAntTicks ? w.exposedAntTicks / totalAntTicks : 0,
    layerCountTicks: sortedCounts(w.layerTicks),
    appliedMultiplierCounts: sortedCounts(w.appliedMultiplierTicks),
    meanAppliedMultiplierWhileExposed: w.exposedAntTicks ? w.exposedMultiplierSum / w.exposedAntTicks : null,
    meanDesiredSpeedBeforeMultiplier: mean(w.desiredSpeedsBefore),
    meanDesiredSpeedAfterMultiplier: mean(w.desiredSpeedsAfter),
    totalTravelledDistance: w.travelDistance,
    meanRealizedSpeed: antSeconds ? w.travelDistance / antSeconds : null,
    realizedSpeedDistribution: quantiles(w.realizedSpeeds),
    zeroDisplacementAntTicks: w.zeroDisplacementAntTicks,
    zeroDisplacementFraction: totalAntTicks ? w.zeroDisplacementAntTicks / totalAntTicks : 0,
    distinctTopPlateEncountered: w.topPlateIds.size,
    topPlateBouts: w.topPlateBouts, repeatedTopPlateBouts: w.repeatTopPlateBouts,
    uniqueAntPositionCells24x24: w.positionCells.reduce((n, value) => n + value, 0),
    occupiedHeadingBins16: w.headingBins.reduce((n, value) => n + (value > 0 ? 1 : 0), 0),
    footContactGroups: w.footContactGroups, footContactPoints: w.footContactPoints,
    plateBirths: w.plateBirths.length, repeatPlateBirths: w.repeatPlateBirths,
    noduleBirths: w.noduleBirths.length,
    episodeCountByStart: episodes.length,
    episodeDurationDistribution: durationDistribution(episodes, DT),
    environment: w.environment
  };
}

function aggregateLayerMultipliers(windows, condition) {
  const rows = {};
  for (const window of windows) for (const [layer, ticks] of Object.entries(window.layerTicks)) {
    if (!rows[layer]) rows[layer] = { ticks: 0 };
    rows[layer].ticks += ticks;
  }
  const total = windows.reduce((sum, window) =>
    sum + window.layerZeroAntTicks + window.exposedAntTicks, 0);
  return Object.fromEntries(Object.entries(sortedCounts(rows)).map(([layer, row]) => {
    const candidateMultiplier = materialLocomotionMultiplier(Number(layer));
    return [layer, {
      ticks: row.ticks, fractionOfActiveAntTicks: total ? row.ticks / total : 0,
      candidateMultiplier, appliedMultiplier: condition === 'Treatment' || condition === 'Default-On'
        ? candidateMultiplier : 1
    }];
  }));
}

function buildWindowRows(pairings) {
  const fields = ['meanPopulation', 'recruitmentAtLimitTickFraction', 'plateExposureFraction',
    'meanAppliedMultiplierWhileExposed', 'meanDesiredSpeedBeforeMultiplier',
    'meanDesiredSpeedAfterMultiplier', 'totalTravelledDistance', 'meanRealizedSpeed',
    'zeroDisplacementFraction', 'distinctTopPlateEncountered', 'repeatedTopPlateBouts',
    'footContactPoints', 'plateBirths', 'repeatPlateBirths', 'noduleBirths',
    'environment.pheromone.totalMass', 'environment.surface.totalMass',
    'environment.material.exposedCellFraction', 'environment.material.meanLayerCount',
    'environment.material.maxLayerCount', 'uniqueAntPositionCells24x24', 'occupiedHeadingBins16'];
  return pairings.flatMap(({ seed, control, treatment }) => control.summary.windows.map((c, index) => {
    const t = treatment.summary.windows[index];
    const row = { seed, startSeconds: c.startSeconds, endSeconds: c.endSeconds };
    for (const field of fields) {
      const label = field.replaceAll('.', '_');
      const controlValue = fieldValue(c, field), treatmentValue = fieldValue(t, field);
      row[label + '_control'] = controlValue;
      row[label + '_treatment'] = treatmentValue;
      row[label + '_delta'] = Number.isFinite(controlValue) && Number.isFinite(treatmentValue)
        ? treatmentValue - controlValue : null;
    }
    row.control_layerCountTicks = JSON.stringify(c.layerCountTicks);
    row.treatment_layerCountTicks = JSON.stringify(t.layerCountTicks);
    row.control_appliedMultiplierCounts = JSON.stringify(c.appliedMultiplierCounts);
    row.treatment_appliedMultiplierCounts = JSON.stringify(t.appliedMultiplierCounts);
    row.control_episodeDuration = JSON.stringify(c.episodeDurationDistribution);
    row.treatment_episodeDuration = JSON.stringify(t.episodeDurationDistribution);
    return row;
  }));
}

function buildSpatialComparison(pairings) {
  const rows = [], summary = [];
  for (const { seed, control, treatment } of pairings) for (let window = 0; window < WINDOWS.length; window += 1) {
    const end = WINDOWS[window].end;
    const cRows = control.gridRows.filter(row => row.windowEndSeconds === end);
    const tRows = treatment.gridRows.filter(row => row.windowEndSeconds === end);
    assert.equal(cRows.length, CELL_COUNT);
    assert.equal(tRows.length, CELL_COUNT);
    let pheromoneAbs = 0, surfaceAbs = 0, coverageAbs = 0, layersAbs = 0, contactsAbs = 0;
    for (let cell = 0; cell < CELL_COUNT; cell += 1) {
      const c = cRows[cell], t = tRows[cell];
      const row = {
        seed, windowEndSeconds: end, cell,
        pheromoneMeanDelta: t.pheromoneMean - c.pheromoneMean,
        surfaceMeanDelta: t.surfaceMean - c.surfaceMean,
        plateCoverageFractionDelta: t.plateCoverageFraction - c.plateCoverageFraction,
        meanLayerCountDelta: t.meanLayerCount - c.meanLayerCount,
        footContactPointsDelta: t.footContactPoints - c.footContactPoints
      };
      rows.push(row);
      pheromoneAbs += Math.abs(row.pheromoneMeanDelta);
      surfaceAbs += Math.abs(row.surfaceMeanDelta);
      coverageAbs += Math.abs(row.plateCoverageFractionDelta);
      layersAbs += Math.abs(row.meanLayerCountDelta);
      contactsAbs += Math.abs(row.footContactPointsDelta);
    }
    summary.push({ seed, windowEndSeconds: end, l1PheromoneMean: pheromoneAbs,
      l1SurfaceMean: surfaceAbs, l1PlateCoverageFraction: coverageAbs,
      l1MeanLayerCount: layersAbs, l1FootContactPoints: contactsAbs });
  }
  return { rows, summary };
}

function compareControlToShadow(actual, expected, seed) {
  const fields = Object.fromEntries(FIELDS.map(name => [name, {
    expectedBaselineSha256: expected[name], actualSha256: actual[name], match: actual[name] === expected[name]
  }]));
  return { seed, exact: Object.values(fields).every(field => field.match), comparedTicks: 36001, fields };
}

function parityRow(c, random, events, materialHash, birthHash) {
  const lifecycle = { state: c.state, simulationTimeMs: c.simulationTimeMs, nextSpawnTimeMs: c.nextSpawnTimeMs,
    nextAgentId: c.nextAgentId, totalSpawned: c.totalSpawned, totalRetired: c.totalRetired,
    accumulatorMs: c.accumulatorMs, initialized: c.initialized, running: c.running };
  const value = {
    agentTrajectory: JSON.stringify(c.agents), lifecycle, rng: { state: random.state(), calls: random.calls },
    pheromone: c.field, surfaceField: c.surfaceField, gait: c.gaitController.ants,
    bodyPose: c.bodyPoseController.ants, gasterDeposition: c.gasterDeposition,
    colonyActivation: c.colonyActivation, localOccupancy: c.occupancy, footContacts: events.contacts,
    materialBirthEvents: { plates: events.plates, nodules: events.nodules, errors: events.errors },
    trailPlateBirth: birthHash(c.trailPlateBirth), materialStratigraphy: materialHash(c.materialStratigraphy)
  };
  return Buffer.concat(FIELDS.map(name => hashValue(value[name])));
}
function appendParityRow(chains, row) {
  for (let index = 0; index < FIELDS.length; index += 1)
    chains[FIELDS[index]].update(row.subarray(index * 32, index * 32 + 32));
}
function makeMaterialHasher() {
  const dynamic = new Set(['simulationTimeMs', 'lastAdvanceTimeMs', 'lastNoduleEvaluationTimeMs',
    'totalAcceptedFootContacts', 'rejectedFootContacts', 'qualifiedNoduleCandidateCount',
    'footLoadByCell', 'candidateSinceMs', '_plateHistory']);
  let key = null, structure = null;
  return m => {
    const revision = m.revision + ':' + m.noduleRevision;
    if (revision !== key) {
      const stable = {};
      for (const name of Object.keys(m).sort()) if (!dynamic.has(name)) stable[name] = m[name];
      structure = hashValue(stable);
      key = revision;
    }
    const changing = {};
    for (const name of [...dynamic].sort()) if (Object.hasOwn(m, name)) changing[name] = m[name];
    return hashValue({ structure, changing });
  };
}
function makeBirthHasher() {
  let key = null, descriptors = null;
  return b => {
    const counts = b.plates.length + ':' + b.birthRecords.length;
    if (counts !== key) { descriptors = hashValue({ plates: b.plates, birthRecords: b.birthRecords }); key = counts; }
    const c = b.candidate;
    const scalars = c ? { ...c, mask: undefined, supportedMask: undefined, component: undefined,
      skeletonIndices: undefined, path: undefined } : null;
    return hashValue({ descriptors, scalars, arrays: c ? [c.mask, c.supportedMask, c.component, c.path, c.skeletonIndices] : [],
      chemicalMemory: b.chemicalMemory, footContactCounts: b.footContactCounts,
      lastInputDiagnostics: b.lastInputDiagnostics, lastAnalysisTimeMs: b.lastAnalysisTimeMs,
      lastBirthTimeMs: b.lastBirthTimeMs });
  };
}
function hashValue(value) {
  const h = createHash('sha256');
  appendValue(h, value, new WeakSet());
  return h.digest();
}
function appendValue(h, v, parents) {
  if (v === null) { h.update('null;'); return; }
  if (v === undefined) { h.update('undefined;'); return; }
  if (typeof v === 'string') { h.update('s' + v.length + ':' + v); return; }
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') {
    h.update(typeof v + ':' + String(v) + ';'); return;
  }
  if (typeof v === 'function') { h.update('fn:' + (v.name || '') + ';'); return; }
  if (ArrayBuffer.isView(v)) {
    h.update(v.constructor.name + ':' + v.byteLength + ':').update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); return;
  }
  if (v instanceof ArrayBuffer) { h.update('ab:' + v.byteLength + ':').update(Buffer.from(v)); return; }
  if (parents.has(v)) { h.update('[cycle];'); return; }
  parents.add(v);
  if (Array.isArray(v)) {
    h.update('array:' + v.length + '['); for (const item of v) appendValue(h, item, parents); h.update('];');
  } else if (v instanceof Map) {
    const entries = [...v.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    h.update('map:' + entries.length + '{');
    for (const [key, item] of entries) { appendValue(h, key, parents); appendValue(h, item, parents); }
    h.update('};');
  } else if (v instanceof Set) {
    const entries = [...v].sort((a, b) => String(a).localeCompare(String(b)));
    h.update('set:' + entries.length + '{'); for (const item of entries) appendValue(h, item, parents); h.update('};');
  } else {
    const keys = Object.keys(v).sort();
    h.update('object:' + keys.length + '{');
    for (const key of keys) { h.update('key:' + key.length + ':' + key); appendValue(h, v[key], parents); }
    h.update('};');
  }
  parents.delete(v);
}

function summarizeEnvironment(controller, snapshot) {
  const material = snapshot.stratigraphy, layerCounts = material.layerCountByCell;
  const topIds = new Set(), histogram = {};
  let exposedCellCount = 0, maxLayerCount = 0, sumLayerCount = 0;
  for (let cell = 0; cell < layerCounts.length; cell += 1) {
    const count = layerCounts[cell];
    histogram[count] = (histogram[count] || 0) + 1;
    sumLayerCount += count;
    if (count > maxLayerCount) maxLayerCount = count;
    if (count > 0) {
      exposedCellCount += 1;
      const top = material.topLayerByCell[cell];
      if (top >= 0 && snapshot.plates[top]) topIds.add(snapshot.plates[top].id);
    }
  }
  return {
    pheromone: summarizeField(controller.field.values),
    surface: summarizeField(controller.surfaceField.values),
    surfaceTotalFootContacts: controller.surfaceField.totalFootContacts,
    material: {
      plateCount: snapshot.plates.length, noduleCount: snapshot.nodules.length,
      exposedCellCount, exposedCellFraction: exposedCellCount / layerCounts.length,
      distinctExposedTopPlateCount: topIds.size, meanLayerCount: sumLayerCount / layerCounts.length,
      maxLayerCount, layerCountCellDistribution: sortedCounts(histogram)
    },
    trailPlateBirthCount: controller.trailPlateBirth.birthRecords.length,
    materialRevision: snapshot.revision, noduleRevision: snapshot.noduleRevision
  };
}
function summarizeField(values) {
  let totalMass = 0, maxValue = 0, nonzeroCells = 0;
  for (const value of values) {
    totalMass += value;
    maxValue = Math.max(maxValue, value);
    if (value > 0) nonzeroCells += 1;
  }
  return { totalMass, meanValue: values.length ? totalMass / values.length : 0,
    maxValue, nonzeroCells, cellCount: values.length };
}
function environmentGridRows(seed, condition, end, controller, snapshot, window) {
  const pheromone = coarsen(controller.field.values, controller.field.width, controller.field.height);
  const surface = coarsen(controller.surfaceField.values, controller.surfaceField.width, controller.surfaceField.height);
  const layers = snapshot.stratigraphy.layerCountByCell;
  const layerMap = coarsen(layers, snapshot.width, snapshot.height);
  const coverage = coarsen(layers, snapshot.width, snapshot.height, value => value > 0 ? 1 : 0);
  const rows = [];
  for (let cell = 0; cell < CELL_COUNT; cell += 1) rows.push({
    seed, condition, windowEndSeconds: end, cell,
    gridX: cell % GRID, gridY: Math.floor(cell / GRID),
    pheromoneMean: pheromone[cell], surfaceMean: surface[cell],
    plateCoverageFraction: coverage[cell], meanLayerCount: layerMap[cell],
    footContactPoints: window.contactCells[cell]
  });
  return rows;
}
function coarsen(values, width, height, transform = value => value) {
  const total = new Float64Array(CELL_COUNT), counts = new Uint32Array(CELL_COUNT);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const cell = Math.min(GRID - 1, Math.floor(x * GRID / width))
      + GRID * Math.min(GRID - 1, Math.floor(y * GRID / height));
    total[cell] += transform(values[y * width + x]);
    counts[cell] += 1;
  }
  for (let cell = 0; cell < CELL_COUNT; cell += 1) total[cell] /= counts[cell];
  return total;
}
function topPlateIdAt(snapshot, x, y) {
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  const cell = Math.round(y * (snapshot.height - 1)) * snapshot.width
    + Math.round(x * (snapshot.width - 1));
  const index = snapshot.stratigraphy.topLayerByCell[cell];
  return index < 0 ? null : snapshot.plates[index]?.id || null;
}
function cellForPosition(x, y) {
  const col = Math.min(GRID - 1, Math.max(0, Math.floor(x * GRID)));
  const row = Math.min(GRID - 1, Math.max(0, Math.floor(y * GRID)));
  return row * GRID + col;
}
function headingBin(heading) {
  return Math.min(15, Math.max(0, Math.floor(((heading + Math.PI) / (2 * Math.PI)) * 16)));
}
function observedSegmentEnd(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  let fraction = 1;
  if (to.x < 0) fraction = Math.min(fraction, -from.x / dx);
  else if (to.x > 1) fraction = Math.min(fraction, (1 - from.x) / dx);
  if (to.y < 0) fraction = Math.min(fraction, -from.y / dy);
  else if (to.y > 1) fraction = Math.min(fraction, (1 - from.y) / dy);
  return { x: clamp(from.x + dx * fraction, 0, 1), y: clamp(from.y + dy * fraction, 0, 1) };
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function rngFor(seed) {
  let state = seed >>> 0;
  const random = () => {
    random.calls += 1;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  random.calls = 0;
  random.state = () => state;
  return random;
}
function durationDistribution(episodes, dtSeconds) {
  const values = episodes.map(ep => ep.sampledTicks * dtSeconds).sort((a, b) => a - b);
  if (!values.length) return { count: 0, rightCensoredCount: 0, minSeconds: null, medianSeconds: null,
    p90Seconds: null, p95Seconds: null, maxSeconds: null, meanSeconds: null };
  const middle = Math.floor(values.length / 2);
  return { count: values.length, rightCensoredCount: episodes.filter(ep => ep.rightCensored).length,
    minSeconds: values[0], medianSeconds: values.length % 2
      ? values[middle] : (values[middle - 1] + values[middle]) / 2,
    p90Seconds: values[Math.max(0, Math.ceil(values.length * 0.9) - 1)],
    p95Seconds: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)],
    maxSeconds: values.at(-1), meanSeconds: mean(values) };
}
function quantiles(input) {
  if (!input.length) return { count: 0, mean: null, min: null, p01: null, p10: null,
    median: null, p90: null, p99: null, max: null };
  const values = input.slice().sort((a, b) => a - b);
  const q = p => values[Math.max(0, Math.ceil(values.length * p) - 1)];
  return { count: values.length, mean: mean(values), min: values[0], p01: q(0.01),
    p10: q(0.10), median: q(0.50), p90: q(0.90), p99: q(0.99), max: values.at(-1) };
}
function fieldValue(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}
function mean(values) { return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null; }
function sortedCounts(value) {
  return Object.fromEntries(Object.entries(value).sort((a, b) => Number(a[0]) - Number(b[0])));
}
function clearEvents(events) {
  events.contacts.length = 0; events.plates.length = 0;
  events.nodules.length = 0; events.errors.length = 0;
}
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
function gitBytes(args) { return execFileSync('git', args, { cwd: ROOT }); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
async function writeJson(dir, name, value) {
  await writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n');
}
async function writeCsv(dir, name, headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(key => csvCell(row[key])).join(','));
  await writeFile(resolve(dir, name), lines.join('\n') + '\n');
}
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(Number(value.toFixed(9))) : String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) text = '"' + text.replaceAll('"', '""') + '"';
  return text;
}
