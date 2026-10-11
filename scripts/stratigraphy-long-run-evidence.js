import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { MATERIAL_STRATIGRAPHY_MAX_NODULES, MATERIAL_STRATIGRAPHY_MAX_PLATES }
  from '../src/lib/agents/ant/MaterialStratigraphy.js';
import { TRAIL_PLATE_GRID_SIZE, TRAIL_PLATE_MAX_BIRTHS } from '../src/lib/agents/ant/TrailPlateBirth.js';

const options = parseArgs(process.argv.slice(2));
const seeds = parseSeeds(options.get('--seeds') || '20261005,20261006,20261007');
const durationSeconds = positiveNumber(options.get('--seconds') || '600', '--seconds');
const extendedSeconds = positiveNumber(options.get('--extended-seconds') || '1200', '--extended-seconds');
const intervalSeconds = positiveNumber(options.get('--interval') || '10', '--interval');
const skipParity = options.has('--skip-parity');
const skipExtended = options.has('--skip-extended');
const outputPath = resolve(options.get('--output')
  || 'docs/ant/evidence/2026-10-06-stratigraphy-runtime/natural-runs.json');

const report = {
  provenance: {
    purpose: 'Natural ANT material stratigraphy lifecycle, exposure, burial, nodules and behavior parity.',
    startRevision: 'd281d341f5abe68ff98ca4cbf837838c7b7b45a2',
    seeds,
    durationSeconds,
    extendedSeed: seeds[0] ?? null,
    extendedSeconds,
    intervalSeconds,
    stepSeconds: 1 / 60,
    technicalCeilings: { trailPlateBirths: TRAIL_PLATE_MAX_BIRTHS,
      materialPlates: MATERIAL_STRATIGRAPHY_MAX_PLATES,
      nodules: MATERIAL_STRATIGRAPHY_MAX_NODULES, eviction: false },
    preparation: 'Fresh default AntController instances; deterministic LCG; audio remains Off; no forced births or contacts.',
    behaviorParity: 'Same seed/controller with MaterialStratigraphy lifecycle replaced by a no-op. TrailPlateBirth, surface, pheromone, gait and controller are unchanged.'
  },
  scenarios: [],
  extendedScenario: null,
  behaviorParity: null
};

  for (const seed of seeds) report.scenarios.push(await runScenario(seed, durationSeconds));
if (seeds.length) {
  const seed = seeds[0];
  if (!skipParity) {
    const actual = report.scenarios.find(item => item.seed === seed);
    const noOp = await runScenario(seed, durationSeconds, { materialEnabled: false });
    report.behaviorParity = compareParity(actual, noOp);
  }
  if (!skipExtended) report.extendedScenario = await runScenario(seed, extendedSeconds);
}

await mkdir(resolve(outputPath, '..'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report)}\n`);
const summaryPath = resolve(outputPath, '..', 'natural-summary.json');
const milestones = [60, 120, 180, 300, 600, extendedSeconds];
const summary = {
  source: outputPath,
  technicalCeilings: report.provenance.technicalCeilings,
  scenarios: [...report.scenarios, ...(report.extendedScenario ? [report.extendedScenario] : [])]
    .map(scenario => ({ seed: scenario.seed, durationSeconds: scenario.durationSeconds,
      birthCountsAtSeconds: Object.fromEntries(milestones.filter(second => second <= scenario.durationSeconds)
        .map(second => [second, scenario.timeline.find(point => Math.abs(point.seconds - second) < 0.02)?.birthCount ?? null])),
      firstPlateSeconds: scenario.births[0]?.bornAtSimulationTimeMs / 1000 ?? null,
      firstNoduleSeconds: scenario.stratigraphy.nodules[0]?.bornAtSimulationTimeMs / 1000 ?? null,
      plateCount: scenario.stratigraphy.layerCount, noduleCount: scenario.stratigraphy.nodules.length,
      layerDepth: scenario.stratigraphy.depth,
      maxQualifiedNoduleCandidates: Math.max(0, ...scenario.timeline
        .map(point => point.noduleQualification.qualifiedCandidateCount || 0)),
      maxPlatesReached: scenario.stratigraphy.noduleQualification.maxPlatesReached,
      maxNodulesReached: scenario.stratigraphy.noduleQualification.maxNodulesReached,
      descriptorValidity: scenario.birthValidity.reduce((counts, item) => {
        counts[item.valid ? 'valid' : 'invalid'] += 1; return counts;
      }, { valid: 0, invalid: 0 }),
      loads: scenario.loads, runwide: scenario.runwide }))
};
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ output: outputPath, summary: summaryPath,
  scenarios: report.scenarios.map(compactSummary),
  extendedScenario: report.extendedScenario && compactSummary(report.extendedScenario),
  behaviorParity: report.behaviorParity }, null, 2));

async function runScenario(seed, seconds, { materialEnabled = true } = {}) {
  const rng = createSeededRandom(seed);
  const controller = new AntController({ random: rng.random, materialLocomotionResistance: false,
    ...(materialEnabled ? {} : { materialStratigraphy: noOpStratigraphy() })
  });
  await controller.init();
  const start = performance.now();
  const ticks = Math.round(seconds * 60);
  const intervalTicks = Math.max(1, Math.round(intervalSeconds * 60));
  const timeline = [];
  const births = [];
  const nodules = [];
  const loads = { footEvents: 0, individualContacts: 0, invalidContactEvents: 0 };
  const footLoadsByPlate = new Map();
  const checkpoints = [];
  let maximumSpeed = 0;
  let minimumSeparation = Infinity;
  let finiteViolations = 0;
  let maxSurfaceValue = 0;
  let maxSurfaceNonFinite = 0;
  let maxPheromoneNonFinite = 0;
  let previousBirthCount = 0;
  let previousNoduleCount = 0;

  controller.subscribe(event => {
    if (event.type === 'plate-birth') births.push(compactBirth(event.payload));
    if (event.type === 'sphere-birth') nodules.push(structuredClone(event.payload));
    if (event.type === 'foot-contact') {
      loads.footEvents += 1;
      if (event.payload?.type !== 'FOOT_CONTACT' || !Array.isArray(event.payload.contacts)) {
        loads.invalidContactEvents += 1;
      } else {
        loads.individualContacts += event.payload.contacts.length;
        for (const contact of event.payload.contacts) {
          const top = controller.materialStratigraphy.getTopPlateAt?.(contact?.position?.x, contact?.position?.y);
          if (top?.id) footLoadsByPlate.set(top.id, (footLoadsByPlate.get(top.id) || 0) + 1);
        }
      }
    }
  });

  for (let tick = 1; tick <= ticks; tick += 1) {
    controller.tick(1 / 60);
    const agents = controller.agents;
    for (const agent of agents) {
      const speed = Math.hypot(agent.vx, agent.vy);
      maximumSpeed = Math.max(maximumSpeed, speed);
      const pose = controller.bodyPoseController.getSnapshot(agent);
      if (![agent.x, agent.y, agent.vx, agent.vy, agent.heading, agent.trailAdherence,
        speed, pose?.headYaw, pose?.gasterYaw, pose?.gasterRear?.x, pose?.gasterRear?.y].every(Number.isFinite)) {
        finiteViolations += 1;
      }
    }
    minimumSeparation = Math.min(minimumSeparation, minPhysicalGap(agents));
    if (tick % intervalTicks !== 0 && tick !== ticks) continue;

    const snapshot = controller.getSnapshot();
    const surface = summarize(snapshot.surface.values);
    const pheromone = summarize(snapshot.pheromone.values);
    maxSurfaceValue = Math.max(maxSurfaceValue, surface.maximum || 0);
    maxSurfaceNonFinite = Math.max(maxSurfaceNonFinite, surface.nonFiniteCount);
    maxPheromoneNonFinite = Math.max(maxPheromoneNonFinite, pheromone.nonFiniteCount);
    const birthSystem = controller.trailPlateBirth;
    const descriptors = birthSystem.getPlates();
    const material = snapshot.stratigraphy || {};
    const history = material.stratigraphy?.plateHistory || [];
    const state = parityState(controller, rng.state());
    checkpoints.push({ seconds: snapshot.analysis.simulationTimeMs / 1000, hash: digest(state) });
    timeline.push({
      seconds: snapshot.analysis.simulationTimeMs / 1000,
      activePopulation: snapshot.analysis.population,
      spawned: snapshot.analysis.totalSpawned,
      retired: snapshot.analysis.totalRetired,
      maxSpeed: maximumSpeed,
      minimumPhysicalSeparation: finiteOrNull(minimumSeparation),
      footEvents: loads.footEvents,
      individualFootContacts: loads.individualContacts,
      surface: { totalFootContacts: snapshot.surface.totalFootContacts,
        maximum: surface.maximum, totalMass: snapshot.surface.totalMass,
        nonFiniteCount: surface.nonFiniteCount },
      pheromone: { totalMass: snapshot.analysis.pheromoneMass, hash: digest(snapshot.pheromone.values),
        nonFiniteCount: pheromone.nonFiniteCount },
      activation: snapshot.analysis.colonyActivation,
      birthCount: descriptors.length,
      birthsThisInterval: descriptors.length - previousBirthCount,
      noduleCount: material.nodules?.length ?? 0,
      nodulesThisInterval: (material.nodules?.length ?? 0) - previousNoduleCount,
      layers: compactLayerSummary(history, descriptors, footLoadsByPlate),
      layerCoverage: material.layers || null,
      depth: depthSummary(material.stratigraphy),
      noduleQualification: { qualifiedCandidateCount: material.diagnostics?.qualifiedNoduleCandidateCount ?? null,
        maxNodulesReached: material.diagnostics?.maxNodulesReached ?? null,
        maxPlatesReached: material.diagnostics?.maxPlatesReached ?? null },
      randomState: rng.state(),
      stateHash: checkpoints.at(-1).hash
    });
    previousBirthCount = descriptors.length;
    previousNoduleCount = material.nodules?.length ?? 0;
  }

  const finalSnapshot = controller.getSnapshot();
  const finalMaterial = finalSnapshot.stratigraphy || {};
  const allDescriptors = controller.trailPlateBirth.getPlates();
  const report = {
    seed,
    durationSeconds: seconds,
    materialEnabled,
    wallSeconds: (performance.now() - start) / 1000,
    population: { current: controller.agents.length, spawned: controller.totalSpawned,
      retired: controller.totalRetired },
    loads,
    runwide: { maxSpeed: finiteOrNull(maximumSpeed), minimumPhysicalSeparation: finiteOrNull(minimumSeparation),
      finiteViolations, maxSurfaceValue, maxSurfaceNonFinite, maxPheromoneNonFinite,
      randomState: rng.state() },
    timeline,
    births: allDescriptors.map(compactBirth),
    birthValidity: allDescriptors.map(validateBirth),
    stratigraphy: { layerCount: finalMaterial.plates?.length ?? 0,
      layers: compactLayerSummary(finalMaterial.stratigraphy?.plateHistory || [], allDescriptors, footLoadsByPlate),
      layerCoverage: finalMaterial.layers || null,
      depth: depthSummary(finalMaterial.stratigraphy),
      nodules: finalMaterial.nodules || [],
      noduleQualification: { qualifiedCandidateCount: finalMaterial.diagnostics?.qualifiedNoduleCandidateCount ?? null,
        maxNodulesReached: finalMaterial.diagnostics?.maxNodulesReached ?? null },
      diagnostics: finalMaterial.diagnostics || null },
    checkpoints
  };
  await controller.destroy();
  return report;
}

function compactSummary(item) {
  return { seed: item.seed, durationSeconds: item.durationSeconds, wallSeconds: item.wallSeconds,
    spawned: item.population.spawned, retired: item.population.retired,
    contacts: item.loads.individualContacts, births: item.births.length,
    layers: item.stratigraphy.layerCount, nodules: item.stratigraphy.nodules.length,
    finiteViolations: item.runwide.finiteViolations,
    maxSurfaceNonFinite: item.runwide.maxSurfaceNonFinite,
    maxSpeed: item.runwide.maxSpeed,
    minimumPhysicalSeparation: item.runwide.minimumPhysicalSeparation };
}

function compareParity(actual, noOp) {
  const rightByTime = new Map(noOp.checkpoints.map(checkpoint => [checkpoint.seconds, checkpoint]));
  const mismatches = actual.checkpoints.filter(checkpoint => rightByTime.get(checkpoint.seconds)?.hash !== checkpoint.hash)
    .map(checkpoint => checkpoint.seconds);
  return { seed: actual.seed, comparedCheckpoints: actual.checkpoints.length,
    sameMovementPheromoneGaitActivationAndRng: mismatches.length === 0,
    mismatchedSeconds: mismatches,
    actualFinalRngState: actual.runwide.randomState,
    noOpFinalRngState: noOp.runwide.randomState };
}

function parityState(controller, rngState) {
  const snapshot = controller.getSnapshot();
  return {
    time: snapshot.analysis.simulationTimeMs,
    agents: snapshot.agents,
    pheromone: digest(snapshot.pheromone.values),
    surface: digest(snapshot.surface.values),
    activation: snapshot.analysis.colonyActivation,
    recruitmentLimit: controller.recruitmentLimit,
    spawned: snapshot.analysis.totalSpawned,
    retired: snapshot.analysis.totalRetired,
    rngState
  };
}

function compactLayerSummary(history, descriptors = [], footLoadsByPlate = new Map()) {
  const descriptorById = new Map(descriptors.map(plate => [plate.id, plate]));
  return history.map((layer, index) => ({ id: layer.id, zOrder: index, ageMs: layer.ageMs,
    thicknessMeters: layer.thicknessMeters, exposedCellCount: layer.exposedCellCount,
    buriedCellCount: layer.buriedCellCount, maxBurialLayerCount: layer.maxBurialLayerCount,
    individualTopFootLoads: footLoadsByPlate.get(layer.id) || 0,
    material: descriptorById.get(layer.id)?.material || null }));
}

function depthSummary(grid) {
  if (!grid || !ArrayBuffer.isView(grid.layerCountByCell)) return null;
  const counts = grid.layerCountByCell;
  let maxDepth = 0, maxDepthMeters = 0, exposedCells = 0, buriedCells = 0, occupiedCells = 0;
  for (const value of counts) {
    maxDepth = Math.max(maxDepth, value);
    if (value > 0) { occupiedCells += 1; exposedCells += 1; }
    if (value > 1) buriedCells += value - 1;
  }
  if (ArrayBuffer.isView(grid.totalDepthByCellMeters)) {
    for (const depth of grid.totalDepthByCellMeters) if (Number.isFinite(depth)) maxDepthMeters = Math.max(maxDepthMeters, depth);
  }
  return { cellCount: counts.length, maxDepth, maxDepthMeters, occupiedCells, exposedCells, buriedCellLayers: buriedCells,
    layerOrderBottomToTop: grid.layerOrder || [] };
}

function compactBirth(plate) {
  return structuredClone(plate);
}

function validateBirth(plate) {
  const size = plate?.grid?.width || TRAIL_PLATE_GRID_SIZE;
  const cells = size * (plate?.grid?.height || size);
  const mask = plate?.mask;
  const maskValid = Array.isArray(mask) && mask.length === cells && mask.every(v => v === 0 || v === 1);
  const ids = new Set((plate?.centerline || []).map(node => node.index));
  const pathValid = Array.isArray(plate?.principalPath) && plate.principalPath.length > 1
    && plate.principalPath.every(id => ids.has(id));
  const graphValid = Array.isArray(plate?.edges) && plate.edges.length > 0
    && plate.edges.every(edge => Array.isArray(edge) && edge.length === 2 && edge.every(id => ids.has(id)));
  const pickupsValid = Array.isArray(plate?.pickups) && plate.pickups.length === 2
    && plate.pickups.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)
      && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1);
  const frozen = Object.isFrozen(plate) && Object.isFrozen(plate?.mask)
    && Object.isFrozen(plate?.centerline) && Object.isFrozen(plate?.edges)
    && Object.isFrozen(plate?.principalPath) && Object.isFrozen(plate?.pickups)
    && Object.isFrozen(plate?.material);
  return { id: plate.id, maskValid, pathValid, graphValid, pickupsValid, frozen,
    finiteBirthTime: Number.isFinite(plate.bornAtSimulationTimeMs),
    valid: maskValid && pathValid && graphValid && pickupsValid && frozen
      && Number.isFinite(plate.bornAtSimulationTimeMs) };
}

function noOpStratigraphy() {
  return { revision: 0, applyFootContact: () => {}, addPlate: () => {}, advance: () => [], reset() {},
    getTopPlateAt: () => null, getAudioState: () => ({}), getSnapshot: () => ({ width: 96, height: 96, revision: 0, noduleRevision: 0,
      version: 1, plates: [], nodules: [], layers: { plateCount: 0, exposedCellCount: 0,
        buriedLayerCellCount: 0, maxColumnLayerCount: 0, noduleCount: 0 }, stratigraphy: { version: 1,
        revision: 0, layerOrder: [], plateHistory: [], topLayerByCell: new Int32Array(96 * 96),
        layerCountByCell: new Uint16Array(96 * 96), totalDepthByCellMeters: new Float32Array(96 * 96) }, diagnostics: {} }) };
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return { random: () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; },
    state: () => state };
}

function summarize(values) {
  let minimum = Infinity, maximum = -Infinity, totalMass = 0, nonFiniteCount = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) { nonFiniteCount += 1; continue; }
    minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); totalMass += value;
  }
  return { minimum: Number.isFinite(minimum) ? minimum : null, maximum: Number.isFinite(maximum) ? maximum : null,
    totalMass, nonFiniteCount };
}

function minPhysicalGap(agents) {
  let min = Infinity;
  for (let i = 0; i < agents.length; i += 1) for (let j = i + 1; j < agents.length; j += 1) {
    const gap = Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y)
      - agents[i].radius - agents[j].radius;
    min = Math.min(min, gap);
  }
  return min;
}

function digest(value) {
  const hash = createHash('sha256');
  if (ArrayBuffer.isView(value)) hash.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  else hash.update(JSON.stringify(value));
  return hash.digest('hex');
}
function finiteOrNull(value) { return Number.isFinite(value) ? value : null; }
function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}
function parseSeeds(value) {
  const seeds = value.split(',').map(Number);
  if (!seeds.length || seeds.some(seed => !Number.isSafeInteger(seed) || seed < 0)) throw new Error('--seeds must be comma-separated non-negative integers.');
  return seeds;
}
function parseArgs(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    const [key, inline] = argv[index].split('=', 2);
    if (key === '--skip-parity' || key === '--skip-extended') {
      result.set(key, true);
      continue;
    }
    const value = inline ?? argv[index + 1];
    if (inline === undefined) index += 1;
    result.set(key, value);
  }
  return result;
}
