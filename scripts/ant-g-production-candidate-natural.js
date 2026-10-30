import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

export const DOSE_SCALE = 3969 / 361;
export const DT = 1 / 60;
export const CHECKPOINTS = Object.freeze([30, 60, 120, 300, 600]);
export const ARMS = Object.freeze({
  G: Object.freeze({ width: 316, internalDoseScale: DOSE_SCALE })
});
const MAP_SIZE = 96;
const OCCUPANCY_SIZE = 64;
const CAP = 8;
const CHEMICAL_THRESHOLD = 0.04;
const SPAWN = Object.freeze({ x: 0.5, y: 0.72 });
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = 'docs/ant/evidence/2026-10-25-g-production-candidate-review';
const SOURCE_FILES = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'scripts/ant-founder-evidence.js', 'docs/ant/README.md'
];

function observeProductionField(field, writeStats) {
  const point = field.depositPoint.bind(field);
  field.depositPoint = (position, options = {}) => {
    const requested = options.amount;
    const accepted = point(position, options);
    writeStats.pointWrites += 1;
    writeStats.requestedDose += requested;
    writeStats.acceptedDose += accepted;
    writeStats.boundaryRejectedDose += Math.max(0, requested - accepted);
    writeStats.coefficientRequestedDose += requested * field.sourceDoseScale;
    return accepted;
  };
  const segment = field.depositSegment.bind(field);
  field.depositSegment = (from, to, options = {}) => {
    const rate = options.amountPerUnitDistance ?? 4.5;
    const requested = Math.hypot(to.x - from.x, to.y - from.y) * rate;
    const accepted = segment(from, to, options);
    writeStats.segmentWrites += 1;
    writeStats.requestedDose += requested;
    writeStats.acceptedDose += accepted;
    writeStats.boundaryRejectedDose += Math.max(0, requested - accepted);
    writeStats.coefficientRequestedDose += accepted * field.sourceDoseScale;
    return accepted;
  };
  const brush = field.depositBrush.bind(field);
  field.depositBrush = (x, y, amount, radius, sigma, support) => {
    const updates = brushUpdates(field, x, y, amount, radius, sigma, support);
    brush(x, y, amount, radius, sigma, support);
    for (const [index, before, increment] of updates) {
      const raw = before + increment;
      if (raw >= field.maxValue) writeStats.capTouchCount += 1;
      if (raw > field.maxValue) {
        writeStats.saturatedUpdateCount += 1;
        writeStats.saturationLoss += raw - field.maxValue;
      }
      if (field.values[index] !== Math.fround(Math.min(field.maxValue, raw))) {
        writeStats.writerParityMismatches += 1;
      }
      writeStats.maximumNodeValue = Math.max(writeStats.maximumNodeValue, field.values[index]);
    }
  };
  const decay = field.decay.bind(field);
  field.decay = dtSeconds => {
    decay(dtSeconds);
    if (dtSeconds > 0) {
      writeStats.decayCalls += 1;
      writeStats.decaySeconds += dtSeconds;
    }
  };
  return field;
}

function brushUpdates(field, x, y, amount, radius, sigma, support) {
  const gx = clamp01(x) * (field.width - 1), gy = clamp01(y) * (field.height - 1);
  const radiusX = Math.ceil(support * (field.width - 1));
  const radiusY = Math.ceil(support * (field.height - 1));
  const minX = Math.max(0, Math.floor(gx - radiusX));
  const maxX = Math.min(field.width - 1, Math.ceil(gx + radiusX));
  const minY = Math.max(0, Math.floor(gy - radiusY));
  const maxY = Math.min(field.height - 1, Math.ceil(gy + radiusY));
  const nodes = [];
  let total = 0;
  for (let row = minY; row <= maxY; row += 1) for (let column = minX; column <= maxX; column += 1) {
    const nx = column / (field.width - 1), ny = row / (field.height - 1);
    const distance = Math.hypot(nx - x, ny - y);
    if (distance > radius) continue;
    const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));
    if (weight <= 0) continue;
    nodes.push([row * field.width + column, weight]);
    total += weight;
  }
  if (total === 0) {
    const index = Math.round(gy) * field.width + Math.round(gx);
    return [[index, field.values[index], amount]];
  }
  return nodes.map(([index, weight]) => [index, field.values[index], amount * weight / total]);
}

export function createWriteStats() {
  return { pointWrites: 0, segmentWrites: 0, requestedDose: 0, acceptedDose: 0,
    coefficientRequestedDose: 0,
    boundaryRejectedDose: 0, capTouchCount: 0, saturatedUpdateCount: 0, saturationLoss: 0,
    writerParityMismatches: 0, maximumNodeValue: 0, decayCalls: 0, decaySeconds: 0 };
}

export function createArmField(arm, writeStats = createWriteStats()) {
  const config = typeof arm === 'string' ? ARMS[arm] : arm;
  if (!config) throw new RangeError('Unknown arm.');
  return observeProductionField(new PheromoneField({ width: config.width, height: config.width }), writeStats);
}

export function createController(seed, arm, { observe = true } = {}) {
  let rngState = seed >>> 0, rngCalls = 0;
  const random = () => {
    rngCalls += 1;
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 0x100000000;
  };
  const fieldStats = createWriteStats();
  const config = typeof arm === 'string' ? ARMS[arm] : arm;
  assert.equal(config.width, 316, 'the production candidate uses the field class default dimensions');
  const controller = new AntController({ random, fieldFactory: options =>
    observeProductionField(new PheromoneField(options), fieldStats) });
  return { controller, ledger: observe ? installObservers(controller) : null, fieldStats,
    get rngState() { return rngState; }, get rngCalls() { return rngCalls; } };
}

export function installObservers(controller) {
  const ledger = {
    calls: { local: 0, far: 0, intention: 0 },
    localStrength: histogram(0, 1), localCoherence: histogram(0, 1),
    localSteering: histogram(-0.45, 0.45),
    adherence: histogram(0, 1), confidence: histogram(0, 1),
    farRaw: histogram(0, 8), farHill: histogram(0, 1),
    freshDecision: histogram(0, 1.5), freshCommitment: histogram(0, 1.5),
    localById: new Map(), freshDecisionCount: 0
  };
  const senseLocal = controller.senseLocalTrail.bind(controller);
  controller.senseLocalTrail = agent => {
    const profile = senseLocal(agent);
    ledger.calls.local += 1;
    ledger.localStrength.add(profile.strength);
    ledger.localCoherence.add(profile.coherence);
    ledger.localSteering.add(profile.steering);
    ledger.localById.set(agent.id, profile);
    return profile;
  };
  const senseFar = controller.senseTrail.bind(controller);
  controller.senseTrail = (...args) => {
    const value = senseFar(...args);
    ledger.calls.far += 1;
    ledger.farRaw.add(value);
    ledger.farHill.add(hill(value, 0.035, 3));
    return value;
  };
  const intention = controller.updateIntention.bind(controller);
  controller.updateIntention = (agent, agents, occupancy, dt, profile) => {
    const priorDecision = agent.decisionRemaining, priorCommitment = agent.committedRemaining;
    ledger.calls.intention += 1;
    const result = intention(agent, agents, occupancy, dt, profile);
    if (Math.abs(agent.decisionRemaining - (priorDecision - dt)) > 1e-9
      || Math.abs(agent.committedRemaining - (priorCommitment - dt)) > 1e-9) {
      ledger.freshDecisionCount += 1;
      ledger.freshDecision.add(agent.decisionRemaining);
      ledger.freshCommitment.add(agent.committedRemaining);
    }
    ledger.adherence.add(agent.trailAdherence);
    ledger.confidence.add(agent.trailConfidence);
    return result;
  };
  return ledger;
}

export async function productionFieldParity() {
  const stats = createWriteStats();
  const wrapped = createArmField('G', stats);
  const production = new PheromoneField({ width: 316, height: 316 });
  for (const [x, y, amount] of [[0.5, 0.5, 0.4], [0.481, 0.623, 0.017], [0.02, 0.96, 0.1]]) {
    const position = { x, y }, options = { amount, radius: 0.0045 };
    assert.equal(wrapped.depositPoint(position, options), production.depositPoint(position, options));
  }
  const from = { x: 0.3, y: 0.4 }, to = { x: 0.31, y: 0.405 };
  const segmentOptions = { amountPerUnitDistance: 4.5, radius: 0.0045 };
  assert.equal(wrapped.depositSegment(from, to, segmentOptions), production.depositSegment(from, to, segmentOptions));
  for (let i = 0; i < 60; i += 1) { wrapped.decay(DT); production.decay(DT); }
  assert(Buffer.from(wrapped.values.buffer).equals(Buffer.from(production.values.buffer)));
  assert.equal(stats.writerParityMismatches, 0);
  return { exactBytes: true, writerParityMismatches: stats.writerParityMismatches,
    decayCalls: stats.decayCalls, decaySeconds: stats.decaySeconds };
}

export function initialFingerprint(run) {
  const controller = run.controller;
  return digest(JSON.stringify({ state: controller.getState(), simulationTimeMs: controller.simulationTimeMs,
    nextSpawnTimeMs: controller.nextSpawnTimeMs, totalSpawned: controller.totalSpawned,
    totalRetired: controller.totalRetired, rngState: run.rngState, rngCalls: run.rngCalls,
    agents: controller.agents.map(agent => agentState(agent, controller)),
    fieldEmpty: controller.field.values.every(value => value === 0),
    surfaceContacts: controller.surfaceField.totalFootContacts,
    activation: controller.colonyActivation.getSnapshot() }));
}

export function stateFingerprint(run) {
  const controller = run.controller;
  const material = controller.materialStratigraphy.getSnapshot();
  return digest(JSON.stringify({ state: controller.getState(), simulationTimeMs: controller.simulationTimeMs,
    nextSpawnTimeMs: controller.nextSpawnTimeMs, totalSpawned: controller.totalSpawned,
    totalRetired: controller.totalRetired, rngState: run.rngState, rngCalls: run.rngCalls,
    agents: controller.agents.map(agent => agentState(agent, controller)),
    field: digest(Buffer.from(controller.field.values.buffer, controller.field.values.byteOffset, controller.field.values.byteLength)),
    surface: digest(Buffer.from(controller.surfaceField.values.buffer)),
    surfaceFootContacts: controller.surfaceField.totalFootContacts,
    activation: controller.colonyActivation.getSnapshot(),
    deposition: [...controller.gasterDeposition.ants].map(([id, value]) => [id, value.distance, value.amount]),
    plates: controller.trailPlateBirth.getPlates().map(plate => [plate.id, plate.bornAtSimulationTimeMs]),
    stratigraphy: [material.revision, material.noduleRevision,
      digest(Buffer.from(material.stratigraphy.layerCountByCell.buffer)),
      digest(Buffer.from(material.stratigraphy.totalDepthByCellMeters.buffer))] }));
}

function agentState(agent, controller) {
  return { ...agent, gait: controller.gaitController.getSnapshot(agent),
    bodyPose: controller.bodyPoseController.getSnapshot(agent) };
}

export async function runObserverParity(arm, seed = 20261005, ticks = 120) {
  const observed = createController(seed, arm, { observe: true });
  const unobserved = createController(seed, arm, { observe: false });
  try {
    await observed.controller.init();
    await unobserved.controller.init();
    assert.equal(initialFingerprint(observed), initialFingerprint(unobserved));
    for (let tick = 0; tick < ticks; tick += 1) {
      observed.controller.tick(DT);
      unobserved.controller.tick(DT);
      assert.equal(stateFingerprint(observed), stateFingerprint(unobserved), arm + ' observer parity tick ' + (tick + 1));
    }
    assert.equal(observed.rngCalls, unobserved.rngCalls);
    assert(observed.ledger.calls.local > 0 && observed.ledger.calls.intention > 0);
    return { arm, seed, ticks, equalEveryTick: true, rngCalls: observed.rngCalls,
      observerCalls: { ...observed.ledger.calls } };
  } finally {
    await observed.controller.destroy();
    await unobserved.controller.destroy();
  }
}

export async function runSelfChecks() {
  assert.equal(DOSE_SCALE, (315 / 95) ** 2);
  const field = await productionFieldParity();
  const observer = [await runObserverParity('G', 20261005, 120)];
  return { scale: DOSE_SCALE, productionFieldParity: field, observerParity: observer };
}

export async function executeScenario(seed, arm, seconds, output, earlyMask = null, controllerObserver = null) {
  const started = performance.now(), ticks = seconds * 60;
  const run = createController(seed, arm);
  const { controller, ledger, fieldStats } = run;
  const movement = { totalDistance: 0, activeAntSeconds: 0, blockedFrames: 0, newlyBlockedFrames: 0,
    retired: 0, recruited: 0, finiteViolations: 0, speedCapViolations: 0, turnCapViolations: 0,
    overlapViolations: 0, populationCeilingViolations: 0, minimumSurfaceGap: Infinity,
    maximumSpeed: 0, maximumTurnRate: 0, maximumNodeValue: 0 };
  const movementHists = { speed: histogram(0, 0.1755), heading: histogram(0, Math.PI * 2),
    angularVelocity: histogram(-4.5, 4.5), displacement1s: histogram(0, 0.5) };
  const cumulative = new Uint32Array(OCCUPANCY_SIZE ** 2), recent = new Uint32Array(cumulative.length);
  const occupancyBuckets = [];
  const persistentCounts = new Uint8Array(MAP_SIZE ** 2), chemicalBuckets = [];
  let currentOccupancy = new Uint32Array(cumulative.length);
  let currentContacts = { groups: 0, feet: 0 }, currentBirths = 0;
  const cumulativeContacts = { groups: 0, feet: 0, malformed: 0, outOfOrderTimestamps: 0 };
  const post30Contacts = { groups: 0, feet: 0 };
  let earlyRouteFeet = 0, frozenEarlyMask = earlyMask ? Uint8Array.from(earlyMask) : null;
  const contactHash = createHash('sha256'), birthHash = createHash('sha256');
  const raw = { seed, arm, positions: [], contactsBySecond: [], births: [], nodules: [],
    events: { contactStreamSha256: null, plateBirthStreamSha256: null },
    earlyRouteMask: frozenEarlyMask ? Array.from(frozenEarlyMask) : null };
  const timeline = [], checkpoints = [];
  const invariants = { fieldNonfiniteSeconds: 0, surfaceNonfiniteSeconds: 0, monotonicTimeFailures: 0,
    plateBirthCountFailures: 0, contactCountFailures: 0 };
  let previousTime = 0, lastContactTimeMs = 0, previousPositions = new Map();

  controller.subscribe(event => {
    if (event.type === 'foot-contact') {
      const payload = event.payload;
      cumulativeContacts.groups += 1; currentContacts.groups += 1;
      if (payload?.type !== 'FOOT_CONTACT' || !Array.isArray(payload.contacts)) {
        cumulativeContacts.malformed += 1; return;
      }
      cumulativeContacts.feet += payload.contacts.length; currentContacts.feet += payload.contacts.length;
      const timeMs = payload.simulationTimeMs;
      if (!Number.isFinite(timeMs) || timeMs < 0
        || timeMs > controller.simulationTimeMs + DT * 1000 + 1e-6) cumulativeContacts.malformed += 1;
      if (Number.isFinite(timeMs) && timeMs < lastContactTimeMs) cumulativeContacts.outOfOrderTimestamps += 1;
      if (Number.isFinite(timeMs)) lastContactTimeMs = timeMs;
      contactHash.update(JSON.stringify(payload) + String.fromCharCode(10));
      if (timeMs >= 30000) {
        post30Contacts.groups += 1; post30Contacts.feet += payload.contacts.length;
        if (frozenEarlyMask) for (const contact of payload.contacts) {
          if (insideMask(frozenEarlyMask, contact.position)) earlyRouteFeet += 1;
        }
      }
    } else if (event.type === 'plate-birth') {
      const plate = event.payload;
      const item = { id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
        source: plate.source, target: plate.target, geodesicLength: plate.geodesicLength,
        grid: plate.grid ? { width: plate.grid.width, height: plate.grid.height } : null,
        maskSha256: plate.mask ? digest(byteView(plate.mask)) : null };
      raw.births.push(item); currentBirths += 1; birthHash.update(JSON.stringify(item) + String.fromCharCode(10));
    } else if (event.type === 'sphere-birth') {
      const nodule = event.payload;
      raw.nodules.push({ id: nodule.id, bornAtSimulationTimeMs: nodule.bornAtSimulationTimeMs,
        position: nodule.position, coupledPlateId: nodule.coupledPlateId });
    }
  });

  await controller.init();
  const initial = initialFingerprint(run), defaults = controller.getState();
  let previousSpawned = controller.totalSpawned;
  assert.equal(defaults.pheromone.halfLifeSeconds, 15);
  assert.equal(defaults.pheromone.radius, 0.0045);
  assert.equal(defaults.population.activationFeedback, true);
  assert.equal(defaults.audioExperiment.baseSubstrate, false);
  assert.equal(controller.field.width, ARMS[arm].width);
  assert.equal(controller.field.height, ARMS[arm].width);
  assert.equal(controller.field.maxValue, CAP);
  try {
    controllerObserver?.(controller, run);
    for (let tick = 1; tick <= ticks; tick += 1) {
      const spawnedBefore = controller.totalSpawned, retiredBefore = controller.totalRetired;
      const before = controller.agents.map(agent => ({ agent, x: agent.x, y: agent.y,
        wasBlocked: agent.wasBlocked, preferredSpeed: agent.personality.preferredSpeed }));
      movement.activeAntSeconds += before.length * DT;
      controller.tick(DT);
      movement.recruited += controller.totalSpawned - spawnedBefore;
      movement.retired += controller.totalRetired - retiredBefore;
      for (const item of before) {
        const agent = item.agent;
        movement.totalDistance += clippedSegmentLength(item.x, item.y, agent.x, agent.y);
        const speed = Math.hypot(agent.vx, agent.vy), turn = Math.abs(agent.angularVelocity);
        movement.maximumSpeed = Math.max(movement.maximumSpeed, speed);
        movement.maximumTurnRate = Math.max(movement.maximumTurnRate, turn);
        movementHists.speed.add(speed); movementHists.heading.add(wrapPositive(agent.heading));
        movementHists.angularVelocity.add(agent.angularVelocity);
        if (![agent.x, agent.y, agent.vx, agent.vy, agent.heading, agent.angularVelocity,
          agent.trailAdherence, agent.trailConfidence].every(Number.isFinite)) movement.finiteViolations += 1;
        if (speed > item.preferredSpeed * 1.35 + 1e-9) movement.speedCapViolations += 1;
        if (turn > 4.5 + 1e-9) movement.turnCapViolations += 1;
        if (agent.wasBlocked) movement.blockedFrames += 1;
        if (!item.wasBlocked && agent.wasBlocked) movement.newlyBlockedFrames += 1;
      }
      if (controller.agents.length > controller.state.population.count) movement.populationCeilingViolations += 1;
      checkCollisions(controller.agents, movement);
      for (const agent of controller.agents) {
        const index = gridIndex(agent.x, agent.y, OCCUPANCY_SIZE);
        cumulative[index] += 1; currentOccupancy[index] += 1;
      }
      if (tick % 60 !== 0) continue;
      const second = tick / 60, simulationSeconds = controller.simulationTimeMs / 1000;
      if (simulationSeconds <= previousTime) invariants.monotonicTimeFailures += 1;
      previousTime = simulationSeconds;
      const fieldMap = resampleField(controller.field), fieldNow = scanField(controller.field);
      movement.maximumNodeValue = Math.max(movement.maximumNodeValue, fieldNow.max, fieldStats.maximumNodeValue);
      if (!fieldNow.finite) invariants.fieldNonfiniteSeconds += 1;
      const surface = controller.surfaceField.getSnapshot(), surfaceNow = scanValues(surface.values);
      if (!surfaceNow.finite) invariants.surfaceNonfiniteSeconds += 1;
      const thresholdMask = Uint8Array.from(fieldMap, value => value >= CHEMICAL_THRESHOLD ? 1 : 0);
      const slot = (second - 1) % 30;
      const oldMask = second > 30 ? chemicalBuckets[slot] : null;
      if (oldMask) for (let i = 0; i < persistentCounts.length; i += 1) persistentCounts[i] -= oldMask[i];
      chemicalBuckets[slot] = thresholdMask;
      for (let i = 0; i < persistentCounts.length; i += 1) persistentCounts[i] += thresholdMask[i];
      const persistentMask = second >= 30
        ? Uint8Array.from(persistentCounts, count => count === 30 ? 1 : 0) : null;
      if (second === 30 && arm === 'C') {
        frozenEarlyMask = Uint8Array.from(fieldMap, (value, index) => {
          const x = index % MAP_SIZE / (MAP_SIZE - 1), y = Math.floor(index / MAP_SIZE) / (MAP_SIZE - 1);
          return value >= CHEMICAL_THRESHOLD && Math.hypot(x - SPAWN.x, y - SPAWN.y) > 0.12 ? 1 : 0;
        });
        raw.earlyRouteMask = Array.from(frozenEarlyMask);
      }
      const massInMask = frozenEarlyMask ? sumMasked(fieldMap, frozenEarlyMask) : null;
      occupancyBuckets.push(currentOccupancy);
      for (let i = 0; i < recent.length; i += 1) recent[i] += currentOccupancy[i];
      if (occupancyBuckets.length > 30) {
        const expired = occupancyBuckets.shift();
        for (let i = 0; i < recent.length; i += 1) recent[i] -= expired[i];
      }
      const active = controller.agents, byId = new Map(active.map(agent => [agent.id, agent]));
      for (const [id, old] of previousPositions) {
        const current = byId.get(id);
        if (current) movementHists.displacement1s.add(Math.hypot(current.x - old.x, current.y - old.y));
      }
      const agents = active.map(agent => ({ id: agent.id, x: agent.x, y: agent.y,
        vx: agent.vx, vy: agent.vy, heading: agent.heading, angularVelocity: agent.angularVelocity,
        adherence: agent.trailAdherence, confidence: agent.trailConfidence,
        local: ledger.localById.get(agent.id) || null, decisionRemaining: agent.decisionRemaining,
        committedRemaining: agent.committedRemaining, blocked: agent.wasBlocked }));
      previousPositions = new Map(active.map(agent => [agent.id, { x: agent.x, y: agent.y }]));
      raw.positions.push({ seconds: second, simulationTimeSeconds: simulationSeconds, agents });
      raw.contactsBySecond.push({ seconds: second, ...currentContacts });
      const plates = controller.trailPlateBirth.getPlates();
      if (plates.length !== raw.births.length) invariants.plateBirthCountFailures += 1;
      if (surface.totalFootContacts !== cumulativeContacts.feet) invariants.contactCountFailures += 1;
      const material = controller.materialStratigraphy.getSnapshot(), activation = controller.colonyActivation.getSnapshot();
      const persistentCells = persistentMask ? persistentMask.reduce((sum, value) => sum + value, 0) : null;
      const persistentRegions = persistentMask ? componentCount(persistentMask, MAP_SIZE, 20) : null;
      const row = { seconds: second, simulationTimeSeconds: simulationSeconds, population: active.length,
        totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
        recruitedThisSecond: controller.totalSpawned - previousSpawned,
        activeAntSeconds: movement.activeAntSeconds, totalRealizedTravel: movement.totalDistance,
        travelPerActiveAntSecond: ratio(movement.totalDistance, movement.activeAntSeconds),
        blockedFrames: movement.blockedFrames, newlyBlockedFrames: movement.newlyBlockedFrames,
        localStrengthMean: ledger.localStrength.mean, localCoherenceMean: ledger.localCoherence.mean,
        localSteeringMean: ledger.localSteering.mean, adherenceMean: ledger.adherence.mean,
        confidenceMean: ledger.confidence.mean, farRawMean: ledger.farRaw.mean, farHillMean: ledger.farHill.mean,
        freshDecisionCount: ledger.freshDecisionCount, contactGroupsThisSecond: currentContacts.groups,
        individualFeetThisSecond: currentContacts.feet, cumulativeFootContacts: cumulativeContacts.feet,
        plateBirthsThisSecond: currentBirths, plateCount: raw.births.length,
        activation: activation.activation, activationEvidence: activation.evidence,
        pheromoneNodeSum: fieldNow.sum, pheromoneMaxNode: fieldNow.max,
        reconstructedIntegral: fieldNow.bilinearIntegral,
        pheromoneCoverageAt004: thresholdMask.reduce((sum, value) => sum + value, 0) / thresholdMask.length,
        persistent30sCells: persistentCells, persistent30sRegions: persistentRegions,
        earlyRouteMassShare: massInMask === null ? null : ratio(massInMask, fieldMap.reduce((sum, value) => sum + value, 0)),
        earlyRouteFootShare: post30Contacts.feet ? earlyRouteFeet / post30Contacts.feet : null,
        capTouches: fieldStats.capTouchCount, saturatedUpdates: fieldStats.saturatedUpdateCount,
        saturationLoss: fieldStats.saturationLoss, plateCountFromMaterial: material.plates.length };
      timeline.push(row);
      currentOccupancy = new Uint32Array(currentOccupancy.length);
      previousSpawned = controller.totalSpawned;
      currentContacts = { groups: 0, feet: 0 }; currentBirths = 0;
      if (!CHECKPOINTS.includes(second)) continue;

      const fieldQuantiles = quantiles(controller.field.values), surfaceQuantiles = quantiles(surface.values);
      const layerCounts = material.stratigraphy.layerCountByCell;
      let exposedCells = 0, buriedLayerCells = 0, maxLocalLayerCount = 0;
      for (const count of layerCounts) {
        if (count > 0) exposedCells += 1;
        if (count > 1) buriedLayerCells += count - 1;
        maxLocalLayerCount = Math.max(maxLocalLayerCount, count);
      }
      const mapName = 'seed' + seed + '-' + arm + '-' + second + 's.json.gz';
      await writeGzipJson(resolve(output, mapName), {
        seed, arm, seconds: second,
        pheromone: { width: MAP_SIZE, height: MAP_SIZE, values: fieldMap },
        surface: { width: surface.width, height: surface.height, values: Array.from(surface.values) },
        occupancy: { width: OCCUPANCY_SIZE, height: OCCUPANCY_SIZE,
          cumulativeAntSeconds: Array.from(cumulative, value => value * DT),
          recent30sAntSeconds: Array.from(recent, value => value * DT) },
        persistent30sChemicalMask: persistentMask ? Array.from(persistentMask) : null,
        earlyRouteMask: frozenEarlyMask ? Array.from(frozenEarlyMask) : null
      });
      checkpoints.push({ seconds: second, activePopulation: active.length,
        totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
        recruitedThisSecond: row.recruitedThisSecond, activeAntSeconds: movement.activeAntSeconds,
        totalRealizedTravel: movement.totalDistance, travelPerActiveAntSecond: row.travelPerActiveAntSecond,
        speed: movementHists.speed.snapshot(), heading: movementHists.heading.snapshot(),
        angularVelocity: movementHists.angularVelocity.snapshot(),
        oneSecondDisplacement: movementHists.displacement1s.snapshot(),
        blockedFrames: movement.blockedFrames, newlyBlockedFrames: movement.newlyBlockedFrames,
        localStrength: ledger.localStrength.snapshot(), localCoherence: ledger.localCoherence.snapshot(),
        localSteering: ledger.localSteering.snapshot(), adherence: ledger.adherence.snapshot(),
        trailConfidence: ledger.confidence.snapshot(), farRaw: ledger.farRaw.snapshot(), farHill: ledger.farHill.snapshot(),
        freshDecisionCount: ledger.freshDecisionCount, decisionInterval: ledger.freshDecision.snapshot(),
        commitmentInterval: ledger.freshCommitment.snapshot(),
        contacts: { ...cumulativeContacts, post30: { ...post30Contacts }, earlyRouteFeet },
        contactStreamSha256: contactHash.copy().digest('hex'), plateCount: raw.births.length,
        plateBirthTimesSeconds: raw.births.map(birth => birth.bornAtSimulationTimeMs / 1000),
        sphereCount: raw.nodules.length, field: { ...fieldNow, quantiles: fieldQuantiles,
          maxNodeValueEver: movement.maximumNodeValue, cap: controller.field.maxValue,
          writer: { ...fieldStats },
          unitNote: 'node sums vary with raster size; bilinear integral is the exact interior piecewise-bilinear integral on the unit square' },
        surface: { ...surfaceNow, quantiles: surfaceQuantiles, totalFootContacts: surface.totalFootContacts },
        material: { plateCount: material.plates.length, noduleCount: material.nodules.length,
          exposedCells, buriedLayerCells, maxLocalLayerCount,
          totalAcceptedFootContacts: material.diagnostics.totalAcceptedFootContacts,
          rejectedFootContacts: material.diagnostics.rejectedFootContacts },
        occupancy: { cumulativeCoverage: coverage(cumulative), cumulative: concentration(cumulative),
          recent30sCoverage: occupancyBuckets.length === 30 ? coverage(recent) : null,
          recent30s: occupancyBuckets.length === 30 ? concentration(recent) : null },
        earlyRouteMassShare: row.earlyRouteMassShare, earlyRouteFootShare: row.earlyRouteFootShare,
        persistent30sCells: persistentCells, persistent30sRegions: persistentRegions,
        activation, rngState: run.rngState, rngCalls: run.rngCalls, maps: mapName });
    }
    raw.events.contactStreamSha256 = contactHash.digest('hex');
    raw.events.plateBirthStreamSha256 = birthHash.digest('hex');
    const timelineFile = 'seed' + seed + '-' + arm + '-raw.json.gz';
    await writeGzipJson(resolve(output, timelineFile), raw);
    assert.equal(invariants.monotonicTimeFailures, 0, 'simulation time increases');
    assert.equal(invariants.plateBirthCountFailures, 0, 'Plate count matches births');
    assert.equal(invariants.contactCountFailures, 0, 'FOOT_CONTACT stream matches SurfaceField count');
    assert.equal(cumulativeContacts.malformed, 0, 'valid ordered FOOT_CONTACT events');
    assert.equal(movement.finiteViolations, 0, 'finite agent state');
    assert.equal(movement.speedCapViolations, 0, 'speed cap');
    assert.equal(movement.turnCapViolations, 0, 'turn cap');
    assert.equal(movement.overlapViolations, 0, 'collision separation');
    assert.equal(movement.populationCeilingViolations, 0, 'population ceiling');
    assert.equal(invariants.fieldNonfiniteSeconds, 0, 'finite pheromone field');
    assert.equal(invariants.surfaceNonfiniteSeconds, 0, 'finite SurfaceField');
    assert.equal(fieldStats.writerParityMismatches, 0, 'observed production writer arithmetic');
    assert.equal(fieldStats.decayCalls, ticks, 'one unchanged decay call per simulation tick');
    assert(Math.abs(fieldStats.decaySeconds - seconds) < 1e-8, 'decay time equals simulated time');
    return { seed, arm, seconds, ticks, initialStateSha256: initial, sourceConfig: { ...ARMS[arm] }, defaults,
      movement: { ...movement, minimumSurfaceGap: finiteOrNull(movement.minimumSurfaceGap),
        travelPerActiveAntSecond: ratio(movement.totalDistance, movement.activeAntSeconds),
        speed: movementHists.speed.snapshot(), heading: movementHists.heading.snapshot(),
        angularVelocity: movementHists.angularVelocity.snapshot(),
        oneSecondDisplacement: movementHists.displacement1s.snapshot() },
      trail: { calls: { ...ledger.calls }, localStrength: ledger.localStrength.snapshot(),
        localCoherence: ledger.localCoherence.snapshot(), localSteering: ledger.localSteering.snapshot(),
        adherence: ledger.adherence.snapshot(),
        confidence: ledger.confidence.snapshot(), farRaw: ledger.farRaw.snapshot(), farHill: ledger.farHill.snapshot(),
        freshDecisionCount: ledger.freshDecisionCount, decisionInterval: ledger.freshDecision.snapshot(),
        commitmentInterval: ledger.freshCommitment.snapshot() },
      events: { contactGroups: cumulativeContacts.groups, individualFeet: cumulativeContacts.feet,
        contactStreamSha256: raw.events.contactStreamSha256, plateBirths: raw.births.length,
        firstPlateSeconds: raw.births[0]?.bornAtSimulationTimeMs / 1000 ?? null,
        plateIntervalsSeconds: raw.births.slice(1).map((birth, index) =>
          (birth.bornAtSimulationTimeMs - raw.births[index].bornAtSimulationTimeMs) / 1000),
        plateBirthStreamSha256: raw.events.plateBirthStreamSha256, sphereBirths: raw.nodules.length },
      fieldWrites: { ...fieldStats }, checkpoints, timeline, timelineFile,
      checkpointMapFiles: checkpoints.map(point => point.maps), invariants,
      earlyRouteMaskSha256: frozenEarlyMask ? digest(Buffer.from(frozenEarlyMask)) : null,
      finalRng: { state: run.rngState, calls: run.rngCalls },
      wallSeconds: (performance.now() - started) / 1000 };
  } finally {
    await controller.destroy();
  }
}

function histogram(min, max, bins = 40) {
  return { min, max, count: 0, sum: 0, observedMin: null, observedMax: null,
    underflow: 0, overflow: 0, bins: new Uint32Array(bins),
    add(value) {
      if (!Number.isFinite(value)) throw new Error('Nonfinite observation.');
      this.count += 1; this.sum += value;
      this.observedMin = this.observedMin === null ? value : Math.min(this.observedMin, value);
      this.observedMax = this.observedMax === null ? value : Math.max(this.observedMax, value);
      if (value < min) this.underflow += 1;
      else if (value > max) this.overflow += 1;
      else this.bins[Math.min(this.bins.length - 1, Math.floor((value - min) / (max - min) * this.bins.length))] += 1;
    },
    snapshot() { return { min, max, count: this.count, mean: this.count ? this.sum / this.count : null,
      observedMin: this.observedMin, observedMax: this.observedMax, underflow: this.underflow,
      overflow: this.overflow, bins: Array.from(this.bins) }; }
  };
}

function scanValues(values) {
  let sum = 0, max = 0, finite = true;
  for (const value of values) { sum += value; max = Math.max(max, value); if (!Number.isFinite(value)) finite = false; }
  return { sum, max, finite };
}
function scanField(field) {
  return { ...scanValues(field.values), bilinearIntegral: bilinearIntegral(field.values, field.width, field.height) };
}
function bilinearIntegral(values, width, height) {
  const hx = 1 / (width - 1), hy = 1 / (height - 1);
  let sum = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const weight = (x === 0 || x === width - 1 ? 0.5 : 1) * (y === 0 || y === height - 1 ? 0.5 : 1);
    sum += values[y * width + x] * weight;
  }
  return sum * hx * hy;
}
function quantiles(values) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const at = p => sorted[Math.floor((sorted.length - 1) * p)];
  return { p00: sorted[0], p50: at(0.5), p90: at(0.9), p99: at(0.99), p999: at(0.999), p100: sorted.at(-1) };
}
function resampleField(field) {
  if (field.width === MAP_SIZE && field.height === MAP_SIZE) return Array.from(field.values);
  const values = new Array(MAP_SIZE * MAP_SIZE);
  for (let y = 0; y < MAP_SIZE; y += 1) for (let x = 0; x < MAP_SIZE; x += 1) {
    values[y * MAP_SIZE + x] = field.sample(x / (MAP_SIZE - 1), y / (MAP_SIZE - 1));
  }
  return values;
}
function concentration(values) {
  let total = 0, entropy = 0, occupied = 0;
  for (const value of values) { total += value; if (value > 0) occupied += 1; }
  if (total > 0) for (const value of values) if (value > 0) { const p = value / total; entropy -= p * Math.log(p); }
  return { total, occupied, normalizedEntropy: total > 0 ? entropy / Math.log(values.length) : null,
    top10PercentMassShare: topShare(values, total) };
}
function topShare(values, total) {
  if (total <= 0) return null;
  const sorted = Array.from(values).sort((a, b) => b - a);
  let mass = 0;
  for (let i = 0; i < Math.ceil(sorted.length * 0.1); i += 1) mass += sorted[i];
  return mass / total;
}
function coverage(values) { let count = 0; for (const value of values) if (value > 0) count += 1; return count / values.length; }
function sumMasked(values, mask) { let sum = 0; for (let i = 0; i < values.length; i += 1) if (mask[i]) sum += values[i]; return sum; }
function gridIndex(x, y, size) { return Math.round(y * (size - 1)) * size + Math.round(x * (size - 1)); }
function insideMask(mask, point) {
  return point && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    && Boolean(mask[gridIndex(point.x, point.y, MAP_SIZE)]);
}
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
function checkCollisions(agents, stats) {
  for (let i = 0; i < agents.length; i += 1) for (let j = i + 1; j < agents.length; j += 1) {
    const a = agents[i], b = agents[j];
    const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
    stats.minimumSurfaceGap = Math.min(stats.minimumSurfaceGap, gap);
    if (gap < -1e-6) stats.overlapViolations += 1;
  }
}
function componentCount(mask, width, minimum) {
  const seen = new Uint8Array(mask.length), queue = new Int32Array(mask.length);
  let count = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let head = 0, tail = 0, size = 0; queue[tail++] = start; seen[start] = 1;
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width); size += 1;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= mask.length / width) continue;
        const next = ny * width + nx;
        if (mask[next] && !seen[next]) { seen[next] = 1; queue[tail++] = next; }
      }
    }
    if (size >= minimum) count += 1;
  }
  return count;
}
function hill(value, half, exponent) {
  const power = Math.max(0, value) ** exponent, base = half ** exponent;
  return power / (power + base);
}
function wrapPositive(angle) { return (angle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); }
function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function ratio(a, b) { return b > 0 ? a / b : null; }
function finiteOrNull(value) { return Number.isFinite(value) ? value : null; }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function byteView(value) {
  return ArrayBuffer.isView(value) ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : Buffer.from(value);
}
async function writeGzipJson(path, value) {
  await writeFile(path, gzipSync(JSON.stringify(value), { level: 6, mtime: 0 }));
}

async function main() {
  const args = new Map(process.argv.slice(2).map(arg => {
    const index = arg.indexOf('='); return index < 0 ? [arg, true] : [arg.slice(0, index), arg.slice(index + 1)];
  }));
  if (args.has('--selfcheck')) {
    console.log(JSON.stringify(await runSelfChecks(), null, 2));
    return;
  }
  const seconds = Number(args.get('--seconds') || 600);
  const seeds = String(args.get('--seeds') || '20261005,20261006,20261007').split(',').map(Number);
  const arms = String(args.get('--arms') || 'G').split(',');
  assert.deepEqual(arms, ['G'], 'this production review runner executes only Candidate G');
  const output = resolve(String(args.get('--output') || resolve(ROOT, EVIDENCE, 'data')));
  assert(Number.isInteger(seconds) && seconds > 0);
  assert(seeds.length && seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff));
  assert(arms.length && arms.every(arm => Object.hasOwn(ARMS, arm)));
  await mkdir(output, { recursive: true });
  const sourceHashes = {};
  for (const source of SOURCE_FILES) sourceHashes[source] = digest(await readFile(resolve(ROOT, source)));
  const preregPath = resolve(ROOT, EVIDENCE, 'PREREGISTRATION.md');
  const provenance = { schemaVersion: 1, freshMain: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2',
    branchPoint: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2',
    researchDecision: 'c45e1845bd86a5a6f1082b5c67ef6f521cd860c1',
    qualifiedG: '336e8dc6e680ff5de3c256e50596581797ce0907',
    preregistrationSha256: digest(await readFile(preregPath)),
    researchToolHashes: {
      script: digest(await readFile(resolve(ROOT, 'scripts/ant-g-production-candidate-natural.js'))),
      fixedCueParity: digest(await readFile(resolve(ROOT, 'scripts/ant-g-production-candidate-parity.js')))
    }, sourceHashes,
    arms, seeds, seconds, tickRate: 60, doseScale: DOSE_SCALE,
    observationRngCalls: 0, audioBridge: null, materialLocomotionResistance: true };
  await writeFile(resolve(output, 'PROVENANCE.json'), JSON.stringify(provenance, null, 2) + String.fromCharCode(10));
  const scenarios = [];
  for (const seed of seeds) {
    let commonInit = null, earlyMask = null;
    const scenario = { seed, arms: [] };
    for (const arm of arms) {
      const result = await executeScenario(seed, arm, seconds, output, arm === 'C' ? null : earlyMask);
      if (commonInit === null) commonInit = result.initialStateSha256;
      assert.equal(result.initialStateSha256, commonInit, seed + ' identical initial state');
      if (arm === 'C' && seconds >= 30) {
        const raw = JSON.parse(gunzipSync(await readFile(resolve(output, result.timelineFile))));
        assert(raw.earlyRouteMask, 'C arm freezes early route mask');
        earlyMask = Uint8Array.from(raw.earlyRouteMask);
      }
      scenario.arms.push(result);
      console.log(JSON.stringify({ seed, arm, wallSeconds: result.wallSeconds,
        active: result.checkpoints.at(-1)?.activePopulation, travel: result.movement.totalDistance,
        travelPerActiveAntSecond: result.movement.travelPerActiveAntSecond,
        maxNode: result.checkpoints.at(-1)?.field.max, capUpdates: result.fieldWrites.saturatedUpdateCount,
        contacts: result.events.contactGroups, plates: result.events.plateBirths }));
    }
    scenario.initialStateSha256 = commonInit;
    scenarios.push(scenario);
  }
  const scientific = { ...provenance, scenarios: scenarios.map(item => ({ seed: item.seed,
    initialStateSha256: item.initialStateSha256, arms: item.arms.map(({ wallSeconds, ...arm }) => arm) })) };
  await writeFile(resolve(output, 'SUMMARY.json'), JSON.stringify(scientific, null, 2) + String.fromCharCode(10));
  const manifest = {};
  for (const file of await readdir(output)) {
    if (file === 'SHA256SUMS.json' || file === 'RUNTIME.json') continue;
    manifest[file] = digest(await readFile(resolve(output, file)));
  }
  await writeFile(resolve(output, 'SHA256SUMS.json'), JSON.stringify(manifest, null, 2) + String.fromCharCode(10));
  await writeFile(resolve(output, 'RUNTIME.json'), JSON.stringify({
    scenarios: scenarios.map(item => ({ seed: item.seed,
      arms: item.arms.map(arm => ({ arm: arm.arm, wallSeconds: arm.wallSeconds })) }))
  }, null, 2) + String.fromCharCode(10));
  console.log(JSON.stringify({ output, scenarios: scenarios.length, artifactCount: Object.keys(manifest).length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
