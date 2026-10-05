import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntController } from '../src/lib/agents/ant/AntController.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(SCRIPT_DIR, '..');
const DT_SECONDS = 1 / 60;
const CHECKPOINT_SECONDS = [0, 15, 30, 60, 120, 180, 300, 420, 480, 540, 600];
const EXIT_FOLLOWUP_MS = 1000;
const MINIMUM_EXIT_COUNT = 2;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function totalMass(values) {
  let mass = 0;
  for (let index = 0; index < values.length; index += 1) mass += values[index];
  return mass;
}

function activeIds(agents) {
  return new Set(agents.map((agent) => agent.id));
}

function inspectPopulation(controller, target, seenIds, lastIdNumber) {
  const ids = activeIds(controller.agents);
  assert.equal(ids.size, controller.agents.length, 'active ant IDs must be unique');
  assert.ok(ids.size <= target, `active population ${ids.size} exceeds target ${target}`);
  const newIds = [];
  let maximumSpeed = 0;
  for (const agent of controller.agents) {
    assert.ok(Number.isFinite(agent.x) && Number.isFinite(agent.y), `${agent.id} position must be finite`);
    assert.ok(Number.isFinite(agent.vx) && Number.isFinite(agent.vy), `${agent.id} velocity must be finite`);
    const speed = Math.hypot(agent.vx, agent.vy);
    maximumSpeed = Math.max(maximumSpeed, speed);
    assert.ok(speed <= agent.personality.preferredSpeed * 1.35 + 1e-12,
      `${agent.id} speed ${speed} must stay within its existing acceleration cap`);
    assert.ok(agent.x >= 0 && agent.x <= 1 && agent.y >= 0 && agent.y <= 1,
      `${agent.id} must be inside the observed field while active`);
    if (!seenIds.has(agent.id)) newIds.push(agent.id);
  }

  newIds.sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
  for (const id of newIds) {
    const match = /^ant-(\d+)$/.exec(id);
    assert.ok(match, `unexpected ant ID format: ${id}`);
    const number = Number(match[1]);
    assert.ok(number > lastIdNumber, `new ant ID ${id} must increase monotonically`);
    lastIdNumber = number;
    seenIds.add(id);
  }

  let minimumSurfaceGap = Infinity;
  for (let first = 0; first < controller.agents.length; first += 1) {
    const a = controller.agents[first];
    for (let second = first + 1; second < controller.agents.length; second += 1) {
      const b = controller.agents[second];
      const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
      minimumSurfaceGap = Math.min(minimumSurfaceGap, gap);
      assert.ok(gap >= -1e-7, `active bodies overlap: ${a.id}/${b.id}, surface gap ${gap}`);
    }
  }

  const gaitStates = controller.gaitController?.ants;
  if (gaitStates instanceof Map) {
    for (const id of gaitStates.keys()) assert.ok(ids.has(id), `retired ant ${id} retained gait state`);
  }
  return { ids, lastIdNumber, minimumSurfaceGap, maximumSpeed };
}

function readDiagnostics(controller, target) {
  const snapshot = controller.getSnapshot();
  const analysis = snapshot.analysis;
  for (const key of ['totalSpawned', 'totalRetired', 'population', 'simulationTimeMs', 'pheromoneMass']) {
    assert.ok(Number.isFinite(analysis[key]), `snapshot.analysis.${key} must be available and finite`);
  }
  assert.equal(analysis.population, snapshot.agents.length);
  assert.ok(analysis.population <= target);
  assert.equal(analysis.totalSpawned - analysis.totalRetired, analysis.population,
    'cumulative births minus exits must match the active population');
  const meanTrailAdherence = snapshot.agents.length
    ? snapshot.agents.reduce((sum, ant) => sum + ant.trailAdherence, 0) / snapshot.agents.length
    : 0;
  assert.ok(Number.isFinite(meanTrailAdherence));
  return {
    simulationTimeSeconds: analysis.simulationTimeMs / 1000,
    population: analysis.population,
    totalSpawned: analysis.totalSpawned,
    totalRetired: analysis.totalRetired,
    pheromoneMass: analysis.pheromoneMass,
    meanTrailAdherence
  };
}

function parseDuration(argv) {
  const argument = argv.find((value) => value.startsWith('--duration='));
  const duration = argument ? Number(argument.slice('--duration='.length)) : 600;
  assert.ok([300, 600].includes(duration), 'Use --duration=300 or --duration=600.');
  return duration;
}

async function run() {
  const durationSeconds = parseDuration(process.argv.slice(2));
  const seed = 61;
  const controller = new AntController({ random: seededRandom(seed) });
  await controller.init();
  const targetPopulation = controller.state.population.count;
  const halfLifeSeconds = controller.state.pheromone.halfLifeSeconds;
  assert.equal(targetPopulation, 28, 'evidence uses the default population');
  assert.equal(halfLifeSeconds, 15, 'evidence uses the requested default field lifetime');

  const field = controller.field;
  assert.ok(field, 'controller should own one initialized shared pheromone field');
  let fieldClearCount = 0;
  const clearField = field.clear.bind(field);
  field.clear = () => { fieldClearCount += 1; return clearField(); };

  const seenIds = new Set();
  let lastIdNumber = 0;
  let previousRetired = 0;
  let lastMass = totalMass(field.values);
  const checkpoints = [];
  const exits = [];
  const postExitSamples = [];
  const maximumPopulation = { value: 0 };
  let minimumSurfaceGap = Infinity;
  let maximumSpeed = 0;
  let checkpointIndex = 0;
  let nextExitSample = 0;
  const checkpointTimes = CHECKPOINT_SECONDS.filter((time) => time <= durationSeconds);

  checkpoints.push({ label: 'start', ...readDiagnostics(controller, targetPopulation) });
  checkpointIndex = 1;
  let currentTimeMs = 0;
  const endTimeMs = durationSeconds * 1000;
  const halfLifeFactor = Math.exp(-Math.LN2 * DT_SECONDS / halfLifeSeconds);

  try {
    while (currentTimeMs + 1e-7 < endTimeMs) {
      assert.equal(controller.field, field, 'retirement must preserve the same shared pheromone field object');
      const idsBefore = activeIds(controller.agents);
      const massBefore = lastMass;
      controller.tick(DT_SECONDS);
      currentTimeMs = controller.simulationTimeMs;

      const population = inspectPopulation(controller, targetPopulation, seenIds, lastIdNumber);
      lastIdNumber = population.lastIdNumber;
      maximumPopulation.value = Math.max(maximumPopulation.value, population.ids.size);
      minimumSurfaceGap = Math.min(minimumSurfaceGap, population.minimumSurfaceGap);
      maximumSpeed = Math.max(maximumSpeed, population.maximumSpeed);
      assert.equal(controller.field, field, 'the shared pheromone field must not be replaced during turnover');
      assert.ok(controller.gaitController?.ants instanceof Map,
        'turnover evidence expects the active GaitController state map');

      const exitedIds = [...idsBefore].filter((id) => !population.ids.has(id));
      if (exitedIds.length) {
        assert.ok(controller.totalRetired >= previousRetired + exitedIds.length,
          'retirement diagnostics should count each ant removed from the active set');
        const massAfter = totalMass(field.values);
        assert.ok(massBefore > 0, 'the shared pheromone field should contain trace history before the observed exit');
        assert.ok(massAfter + 1e-8 >= massBefore * halfLifeFactor,
          'an exit must not clear the field; existing mass can decay and receive new deposits');
        exits.push({
          simulationTimeSeconds: currentTimeMs / 1000,
          retiredIds: exitedIds,
          totalRetired: controller.totalRetired,
          population: population.ids.size,
          pheromoneMassBeforeTick: massBefore,
          pheromoneMassAfterTick: massAfter
        });
        nextExitSample = Math.max(nextExitSample, currentTimeMs + EXIT_FOLLOWUP_MS);
      }

      const diagnosticRetired = controller.totalRetired;
      assert.ok(Number.isInteger(diagnosticRetired) && diagnosticRetired >= previousRetired,
        'totalRetired must be a monotonic integer');
      previousRetired = diagnosticRetired;
      lastMass = totalMass(field.values);

      if (exits.length && currentTimeMs + 1e-7 >= nextExitSample) {
        postExitSamples.push({
          simulationTimeSeconds: currentTimeMs / 1000,
          millisecondsAfterLastRecordedExit: currentTimeMs - nextExitSample + EXIT_FOLLOWUP_MS,
          totalRetired: diagnosticRetired,
          pheromoneMass: lastMass,
          sameFieldObject: controller.field === field,
          fieldClearCallsDuringRun: fieldClearCount
        });
        nextExitSample = Infinity;
      }

      while (checkpointIndex < checkpointTimes.length
        && currentTimeMs + 1e-7 >= checkpointTimes[checkpointIndex] * 1000) {
        const record = readDiagnostics(controller, targetPopulation);
        checkpoints.push({ label: 'scheduled', ...record });
        checkpointIndex += 1;
      }
    }

    assert.equal(fieldClearCount, 0, 'the shared pheromone field was cleared during the run');
    const finalDiagnostics = readDiagnostics(controller, targetPopulation);
    assert.ok(exits.length >= MINIMUM_EXIT_COUNT,
      `need multiple exits/replacements; observed only ${exits.length} exits at ${durationSeconds}s`);
    assert.ok(finalDiagnostics.totalSpawned > targetPopulation,
      'cumulative births should exceed the initial population after replacement');
    assert.ok(finalDiagnostics.totalRetired >= MINIMUM_EXIT_COUNT);
    assert.ok(postExitSamples.length > 0, 'capture shared field mass after at least one exit');

    const report = {
      kind: 'ANT deterministic turnover long-run evidence',
      seed,
      randomSource: 'same 32-bit LCG used by ant-controller deterministic tests',
      durationSeconds,
      timestepSeconds: DT_SECONDS,
      defaultConfiguration: { targetPopulation, pheromoneHalfLifeSeconds: halfLifeSeconds },
      checks: {
        sharedFieldObjectPreserved: controller.field === field,
        fieldClearCallsDuringRun: fieldClearCount,
        uniqueMonotonicAntIds: true,
        activePopulationNeverExceededTarget: true,
        gaitStateContainsOnlyActiveAntIds: true,
        finiteCoordinatesAndVelocitiesEveryStep: true,
        noBodyOverlapEveryStep: true,
        minimumSurfaceGap: Number.isFinite(minimumSurfaceGap) ? minimumSurfaceGap : null,
        speedWithinExistingPerAntCapEveryStep: true,
        maximumObservedSpeed: maximumSpeed
      },
      checkpoints,
      exitObservations: exits,
      exitEventCount: exits.length,
      exitedAntCount: exits.reduce((sum, event) => sum + event.retiredIds.length, 0),
      postExitFieldSamples: postExitSamples,
      final: finalDiagnostics,
      observedUniqueAntIds: seenIds.size,
      maximumObservedPopulation: maximumPopulation.value
    };

    const outputDirectory = path.join(REPO_DIR, 'test-results');
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = path.join(outputDirectory, `ant-turnover-seed${seed}-${durationSeconds}s.json`);
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({
      outputPath,
      durationSeconds,
      checkpoints,
      exitEventCount: exits.length,
      exitedAntCount: exits.reduce((sum, event) => sum + event.retiredIds.length, 0),
      postExitFieldSamples: postExitSamples,
      checks: report.checks,
      maximumObservedSpeed: report.checks.maximumObservedSpeed,
      final: finalDiagnostics,
      observedUniqueAntIds: seenIds.size
    }, null, 2)}\n`);
  } finally {
    await controller.destroy();
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
