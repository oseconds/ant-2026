import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AntController } from '../src/lib/agents/ant/AntController.js';

const args = parseArguments(process.argv.slice(2));
const seeds = parseSeeds(args.get('--seeds') || '61,20261005,193');
const durationSeconds = positiveNumber(args.get('--seconds'), 600);
const requestedSnapshots = (args.get('--samples') || '0,15,30,60,120,180,300,600')
  .split(',').map(Number).filter(value => Number.isFinite(value) && value >= 0 && value <= durationSeconds);
const snapshotTimes = [...new Set([...requestedSnapshots, durationSeconds])].sort((a, b) => a - b);
const outputPath = resolve(args.get('--output') || 'test-results/ant-long-run-evidence.json');
const depositionMode = args.get('--deposition') === 'continuous' ? 'continuous' : 'dab';
const feedbackModes = args.get('--feedback') === 'both' ? [true, false]
  : args.get('--feedback') === 'off' ? [false] : [true];
const ticks = Math.round(durationSeconds * 60);

const evidence = {
  provenance: {
    purpose: 'Long seeded ANT run measuring dab deposition and colony activation feedback without parameter tuning.',
    source: 'AntController public snapshots and FOOT_CONTACT events.',
    seeds,
    durationSeconds,
    snapshotTimesSeconds: snapshotTimes,
    feedbackModes: feedbackModes.map(enabled => enabled ? 'on' : 'off'),
    baselineSeedLimit: args.get('--feedback') === 'both' ? 1 : null,
    populationFeedbackSetting: 'population.activationFeedback',
    field: { width: 96, height: 96, halfLifeSeconds: 15 },
    depositionMode,
    simulationStepSeconds: 1 / 60
  },
  scenarios: []
};

for (const feedbackEnabled of feedbackModes) {
  const scenarioSeeds = !feedbackEnabled && args.get('--feedback') === 'both'
    ? seeds.slice(0, 1) : seeds;
  for (const seed of scenarioSeeds) {
    evidence.scenarios.push(await runScenario(seed, feedbackEnabled));
  }
}

await mkdir(resolve(outputPath, '..'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ output: outputPath, durationSeconds, snapshotTimes,
  scenarios: evidence.scenarios.map(scenario => ({ seed: scenario.seed,
    feedback: scenario.activationFeedback,
    final: compactSample(scenario.snapshots.at(-1)),
    runwide: compactRunwide(scenario.runwide) })) }, null, 2));

async function runScenario(seed, activationFeedback) {
  const controller = new AntController({
    materialLocomotionResistance: false,
    state: {
      pheromone: { depositionMode },
      population: { activationFeedback }
    },
    random: seededRandom(seed)
  });
  const contact = {
    count: 0,
    malformed: 0,
    outOfBounds: 0,
    outOfBoundsFootPoints: 0,
    centroidMismatch: 0,
    positionSamples: []
  };
  controller.subscribe(event => {
    if (event.type !== 'foot-contact') return;
    contact.count += 1;
    const payload = event.payload;
    const valid = payload && payload.type === 'FOOT_CONTACT'
      && typeof payload.antId === 'string'
      && ['A', 'B'].includes(payload.contactGroup)
      && Array.isArray(payload.contacts) && payload.contacts.length > 0
      && payload.contacts.every(item => typeof item?.legId === 'string' && finitePoint(item.position))
      && Number.isFinite(payload.simulationTimeMs) && Number.isFinite(payload.strength)
      && finitePoint(payload.position);
    if (!valid) contact.malformed += 1;
    if (payload && finitePoint(payload.position)
      && (payload.position.x < 0 || payload.position.x > 1 || payload.position.y < 0 || payload.position.y > 1)) {
      contact.outOfBounds += 1;
    }
    if (payload && Array.isArray(payload.contacts) && payload.contacts.length) {
      const validPoints = payload.contacts.map(item => item?.position).filter(finitePoint);
      if (validPoints.length !== payload.contacts.length) contact.malformed += 1;
      for (const point of validPoints) {
        if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) contact.outOfBoundsFootPoints += 1;
      }
      if (validPoints.length) {
        const centroid = {
          x: validPoints.reduce((sum, point) => sum + point.x, 0) / validPoints.length,
          y: validPoints.reduce((sum, point) => sum + point.y, 0) / validPoints.length
        };
        if (!finitePoint(payload.position)
          || Math.hypot(centroid.x - payload.position.x, centroid.y - payload.position.y) > 1e-9) {
          contact.centroidMismatch += 1;
        }
      }
    }
    if (contact.positionSamples.length < 12 && payload) {
      contact.positionSamples.push({ antId: payload.antId, contactGroup: payload.contactGroup,
        position: payload.position,
        contacts: payload.contacts?.map(item => ({ legId: item.legId, position: item.position })) || [],
        simulationTimeMs: payload.simulationTimeMs });
    }
  });
  await controller.init();

  const snapshots = [];
  let nextSnapshot = 0;
  let spawnTimeSumMs = 0;
  let spawnIntervals = 0;
  let minSpawnIntervalMs = Infinity;
  let maxSpawnIntervalMs = 0;
  let maxSpawnsInTick = 0;
  let lastSpawnTimeMs = 0;
  let lastSpawnCount = controller.totalSpawned;
  let lastRetiredCount = controller.totalRetired;
  let previousActivation = controller.colonyActivation.getSnapshot().activation;
  const runwide = createRunwide();
  const tenSecondPopulation = [{ simulationTimeSeconds: 0, population: controller.agents.length }];
  let lastTenSecondBucket = 0;
  for (let tick = 0; tick <= ticks; tick += 1) {
    const beforeAgents = controller.agents.map(agent => ({ agent, x: agent.x, y: agent.y,
      radius: agent.radius, id: agent.id }));
    const beforeSpawned = controller.totalSpawned;
    const beforeRetired = controller.totalRetired;
    if (tick > 0) controller.tick(1 / 60);
    if (tick > 0) {
      updateRunwide(runwide, controller, beforeAgents, activationFeedback, previousActivation,
        controller.simulationTimeMs / 1000);
      previousActivation = controller.colonyActivation.getSnapshot().activation;
      const retiredDelta = controller.totalRetired - beforeRetired;
      const spawnedDelta = controller.totalSpawned - beforeSpawned;
      runwide.retirements += retiredDelta;
      runwide.spawns += spawnedDelta;
      if (retiredDelta > 0 && spawnedDelta === 0) runwide.ticksWithRetirementWithoutBirth += 1;
      runwide.retirementsWithoutSameTickBirth += Math.max(0, retiredDelta - spawnedDelta);
    }
    const newlySpawned = controller.totalSpawned - lastSpawnCount;
    if (newlySpawned > 0) {
      maxSpawnsInTick = Math.max(maxSpawnsInTick, newlySpawned);
      for (let spawned = 0; spawned < newlySpawned; spawned += 1) {
        const spawnTime = controller.simulationTimeMs;
        if (lastSpawnCount > 0 || spawned > 0) {
          const interval = spawnTime - lastSpawnTimeMs;
          spawnTimeSumMs += interval;
          spawnIntervals += 1;
          minSpawnIntervalMs = Math.min(minSpawnIntervalMs, interval);
          maxSpawnIntervalMs = Math.max(maxSpawnIntervalMs, interval);
        }
        lastSpawnTimeMs = spawnTime;
      }
      lastSpawnCount = controller.totalSpawned;
    }
    const bucket = Math.floor(controller.simulationTimeMs / 10000);
    if (tick > 0 && bucket > lastTenSecondBucket) {
      tenSecondPopulation.push({ simulationTimeSeconds: controller.simulationTimeMs / 1000,
        population: controller.agents.length });
      lastTenSecondBucket = bucket;
    }
    while (nextSnapshot < snapshotTimes.length
      && controller.simulationTimeMs + 1e-6 >= snapshotTimes[nextSnapshot] * 1000) {
      const snapshot = controller.getSnapshot();
      const activation = snapshot.analysis?.colonyActivation ?? null;
      if (activationFeedback && activation === null) {
        throw new Error('Expected analysis.colonyActivation for an activation-feedback run.');
      }
      const metrics = captureSnapshot(controller, snapshot, activation, contact,
        nextSnapshot === 0 ? null : spawnSummary(spawnTimeSumMs, spawnIntervals,
          minSpawnIntervalMs, maxSpawnIntervalMs, maxSpawnsInTick));
      assert.ok(metrics.finiteAgentStates && metrics.bodyPoseFinite && metrics.pheromoneFinite,
        `finite simulation state at ${metrics.simulationTimeSeconds}s`);
      assert.ok(metrics.maximumLiveSpeed < 1, `bounded speed at ${metrics.simulationTimeSeconds}s`);
      assert.ok(metrics.minimumPhysicalSurfaceGap === null
        || Number.isFinite(metrics.minimumPhysicalSurfaceGap),
      `finite surface gap at ${metrics.simulationTimeSeconds}s`);
      assert.equal(metrics.malformedFootContacts, 0, 'valid FOOT_CONTACT records');
      assert.equal(metrics.outOfBoundsFootContacts, 0, 'FOOT_CONTACT positions stay in domain');
      assert.equal(metrics.outOfBoundsFootPoints, 0, 'individual foot points stay in domain');
      assert.equal(metrics.footContactCentroidMismatches, 0, 'FOOT_CONTACT positions match their contacts');
      assert.ok(!metrics.spawnCadence || metrics.spawnCadence.maxSpawnsInOneTick <= 1,
        'at most one ant spawns per simulation tick');
      if (activationFeedback) {
        assert.ok(Number.isFinite(metrics.localEvidence) && metrics.localEvidence >= 0
          && metrics.localEvidence <= 1, 'finite bounded colony local evidence');
        assert.ok(Number.isFinite(metrics.activation?.activation) && metrics.activation.activation >= 0
          && metrics.activation.activation <= 1, 'finite bounded colony activation');
        assert.ok(Number.isFinite(metrics.desiredPopulation)
          && metrics.desiredPopulation >= 8 && metrics.desiredPopulation <= metrics.populationTarget,
        'desired population remains bounded by population target');
        assert.ok(Number.isInteger(metrics.recruitmentLimit)
          && metrics.recruitmentLimit >= 8 && metrics.recruitmentLimit <= metrics.populationTarget,
        'recruitment limit remains bounded by population target');
      }
      snapshots.push(metrics);
      nextSnapshot += 1;
    }
  }
  assert.equal(snapshots.length, snapshotTimes.length, 'all requested snapshots recorded');
  for (let index = 1; index < tenSecondPopulation.length; index += 1) {
    const change = tenSecondPopulation[index].population - tenSecondPopulation[index - 1].population;
    if (change > 0) runwide.populationRiseBins += 1;
    if (change < 0) runwide.populationFallBins += 1;
  }
  const idSets = currentMapIdAudit(controller);
  runwide.orphanMapIdsAtEnd = idSets.orphanIds;
  assert.equal(runwide.centerPassThroughEvents, 0, 'no pair centers pass through one another');
  assert.equal(runwide.relativeDirectionFlipEvents, 0, 'no penetrating pair changes sides in a swept tick');
  assert.equal(runwide.velocityLimitViolations, 0, 'speed stays within preferred speed plus separation allowance');
  assert.ok(runwide.maxTurnRate <= 4.5 + 1e-8, 'turn rate stays within controller limit');
  assert.equal(runwide.activationBoundViolations, 0, 'activation remains within [0, 1] and recruitment ceiling');
  assert.equal(runwide.mapOrphanIdCount, 0, 'system maps retain only active ant ids');
  assert.equal(runwide.orphanMapIdsAtEnd, 0, 'system maps contain no retired ids at end');
  if (activationFeedback) assert.ok(contact.count > 0, 'FOOT_CONTACT activity observed');
  const scenario = { seed, activationFeedback, snapshots, runwide, tenSecondPopulation, footContact: contact };
  await controller.destroy();
  return scenario;
}

function captureSnapshot(controller, snapshot, activation, contact, spawnStats) {
  const agents = controller.agents;
  const radii = agents.map(agent => agent.radius);
  const minCenterDistance = minimumPairDistance(agents);
  const maxSpeed = Math.max(0, ...agents.map(agent => Math.hypot(agent.vx, agent.vy)));
  let bodyPoseFinite = true;
  for (const agent of snapshot.agents) {
    const pose = agent.bodyPose;
    bodyPoseFinite &&= [pose?.headYaw, pose?.gasterYaw, pose?.gasterRear?.x,
      pose?.gasterRear?.y].every(Number.isFinite);
  }
  const pheromone = snapshot.pheromone;
  const cellCounts = { positive: 0, above0004: 0, above002: 0, above005: 0, above018: 0, nonFinite: 0 };
  for (const value of pheromone.values) {
    if (!Number.isFinite(value)) cellCounts.nonFinite += 1;
    else {
      if (value > 0) cellCounts.positive += 1;
      if (value > 0.004) cellCounts.above0004 += 1;
      if (value > 0.02) cellCounts.above002 += 1;
      if (value > 0.05) cellCounts.above005 += 1;
      if (value > 0.18) cellCounts.above018 += 1;
    }
  }
  const activationFields = activation && typeof activation === 'object'
    ? Object.fromEntries(Object.entries(activation).filter(([key]) =>
      /activation|local|evidence|desired|recruit|limit/i.test(key))) : null;
  const finiteAgentStates = agents.every(agent => [agent.x, agent.y, agent.vx, agent.vy,
    agent.heading, agent.trailAdherence].every(Number.isFinite));
  return {
    simulationTimeSeconds: snapshot.analysis.simulationTimeMs / 1000,
    activePopulation: snapshot.analysis.population,
    populationTarget: snapshot.state.population.count,
    totalSpawned: snapshot.analysis.totalSpawned,
    totalRetired: snapshot.analysis.totalRetired,
    pheromoneMass: snapshot.analysis.pheromoneMass,
    meanTrailAdherence: agents.length
      ? agents.reduce((sum, agent) => sum + agent.trailAdherence, 0) / agents.length : 0,
    meanSpeed: snapshot.analysis.meanSpeed,
    maximumLiveSpeed: maxSpeed,
    maximumCenterDistancePenetration: Number.isFinite(minCenterDistance)
      ? Math.max(0, Math.max(...radii.map(radius => radius * 2)) - minCenterDistance) : 0,
    minimumPhysicalSurfaceGap: Number.isFinite(minCenterDistance)
      ? minCenterDistance - Math.max(0, ...radii) * 2 : null,
    bodyPoseFinite,
    finiteAgentStates,
    pheromoneFinite: cellCounts.nonFinite === 0,
    pheromoneMap: { width: pheromone.width, height: pheromone.height, cells: pheromone.values.length,
      countsByThreshold: cellCounts },
    activation: activation && typeof activation === 'object' ? activation : null,
    activationSignals: activationFields,
    desiredPopulation: activation?.desiredPopulation ?? activation?.desired ?? null,
    localEvidence: activation?.localEvidence ?? activation?.evidence ?? null,
    recruitmentLimit: activation?.recruitmentLimit ?? activation?.limit ?? null,
    footContactGroups: contact.count,
    malformedFootContacts: contact.malformed,
    outOfBoundsFootContacts: contact.outOfBounds,
    outOfBoundsFootPoints: contact.outOfBoundsFootPoints,
    footContactCentroidMismatches: contact.centroidMismatch,
    spawnCadence: spawnStats
  };
}

function createRunwide() {
  return {
    maxSpeed: 0,
    maxSpeedLimitExcess: 0,
    velocityLimitViolations: 0,
    maxTurnRate: 0,
    maxTurnRateLimit: 4.5,
    minSweptSurfaceGap: Infinity,
    minCurrentSurfaceGap: Infinity,
    sweptPairChecks: 0,
    sweptOverlapViolations: 0,
    sweptMaterialPenetrations: 0,
    sweptGrazingSamples: 0,
    sweptOverlapExamples: [],
    worstSweptPair: null,
    minSweptCenterDistance: Infinity,
    centerPassThroughEvents: 0,
    relativeDirectionFlipEvents: 0,
    currentOverlapViolations: 0,
    currentMaterialPenetrations: 0,
    currentGrazingSamples: 0,
    worstCurrentPair: null,
    finiteStateViolations: 0,
    bodyPoseFiniteViolations: 0,
    mapOrphanIdCount: 0,
    maxActivation: 0,
    maxLocalEvidence: 0,
    maxActivationStepDelta: 0,
    maxDesiredPopulation: 0,
    maxRecruitmentLimit: 0,
    activationBoundViolations: 0,
    populationMin: Infinity,
    populationMax: 0,
    populationRiseBins: 0,
    populationFallBins: 0,
    ticksWithRetirementWithoutBirth: 0,
    retirementsWithoutSameTickBirth: 0,
    retirements: 0,
    spawns: 0,
    orphanMapIdsAtEnd: 0
  };
}

function updateRunwide(runwide, controller, beforeAgents, activationEnabled, previousActivation, timeSeconds) {
  const agents = controller.agents;
  const activeIds = new Set(agents.map(agent => agent.id));
  const moved = beforeAgents.map(previous => ({ ...previous,
    endX: previous.agent.x, endY: previous.agent.y }));
  for (let first = 0; first < moved.length; first += 1) {
    for (let second = first + 1; second < moved.length; second += 1) {
      const a = moved[first], b = moved[second];
      const gap = sweptSurfaceGap(a, b);
      const distance = sweptCenterDistance(a, b);
      runwide.minSweptSurfaceGap = Math.min(runwide.minSweptSurfaceGap, gap);
      runwide.minSweptCenterDistance = Math.min(runwide.minSweptCenterDistance, distance);
      runwide.sweptPairChecks += 1;
      if (gap < 0) {
        runwide.sweptOverlapViolations += 1;
        if (gap < -1e-6) runwide.sweptMaterialPenetrations += 1;
        else runwide.sweptGrazingSamples += 1;
        const overlap = {
          timeSeconds,
          firstId: a.id,
          secondId: b.id,
          gap,
          centerDistance: distance,
          summedRadius: a.radius + b.radius,
          firstStart: { x: a.x, y: a.y },
          firstEnd: { x: a.endX, y: a.endY },
          secondStart: { x: b.x, y: b.y },
          secondEnd: { x: b.endX, y: b.endY }
        };
        if (!runwide.worstSweptPair || gap < runwide.worstSweptPair.gap) runwide.worstSweptPair = overlap;
        if (runwide.sweptOverlapExamples.length < 8) runwide.sweptOverlapExamples.push(overlap);
        const startRx = a.x - b.x, startRy = a.y - b.y;
        const endRx = a.endX - b.endX, endRy = a.endY - b.endY;
        if (startRx * endRx + startRy * endRy < 0) runwide.relativeDirectionFlipEvents += 1;
      }
      if (distance < Math.min((a.radius + b.radius) * 0.5, 1e-6)) runwide.centerPassThroughEvents += 1;
    }
  }

  let minCurrentGap = Infinity;
  const allObservedAgents = new Map(beforeAgents.map(previous => [previous.id, previous.agent]));
  for (const agent of agents) allObservedAgents.set(agent.id, agent);
  for (const agent of allObservedAgents.values()) {
    const speed = Math.hypot(agent.vx, agent.vy);
    const preferredLimit = agent.personality.preferredSpeed * 1.35 + 0.001;
    runwide.maxSpeed = Math.max(runwide.maxSpeed, speed);
    runwide.maxSpeedLimitExcess = Math.max(runwide.maxSpeedLimitExcess, speed - preferredLimit);
    if (speed > preferredLimit + 1e-9) runwide.velocityLimitViolations += 1;
    runwide.maxTurnRate = Math.max(runwide.maxTurnRate, Math.abs(agent.angularVelocity));
    if (Math.abs(agent.angularVelocity) > runwide.maxTurnRateLimit + 1e-8) {
      runwide.finiteStateViolations += 1;
    }
    if (![agent.x, agent.y, agent.vx, agent.vy, agent.heading, agent.trailAdherence,
      agent.angularVelocity, speed].every(Number.isFinite)) runwide.finiteStateViolations += 1;
  }
  for (let first = 0; first < agents.length; first += 1) {
    const agent = agents[first];
    const pose = controller.bodyPoseController.getSnapshot(agent);
    if (![pose?.headYaw, pose?.gasterYaw, pose?.gasterRear?.x, pose?.gasterRear?.y].every(Number.isFinite)) {
      runwide.bodyPoseFiniteViolations += 1;
    }
    for (let second = first + 1; second < agents.length; second += 1) {
      const neighbor = agents[second];
      const gap = Math.hypot(agent.x - neighbor.x, agent.y - neighbor.y) - agent.radius - neighbor.radius;
      minCurrentGap = Math.min(minCurrentGap, gap);
      if (gap < 0) {
        runwide.currentOverlapViolations += 1;
        if (gap < -1e-6) runwide.currentMaterialPenetrations += 1;
        else runwide.currentGrazingSamples += 1;
        if (!runwide.worstCurrentPair || gap < runwide.worstCurrentPair.gap) {
          runwide.worstCurrentPair = { gap, firstId: agent.id, secondId: neighbor.id,
            centerDistance: gap + agent.radius + neighbor.radius,
            summedRadius: agent.radius + neighbor.radius };
        }
      }
    }
  }
  runwide.minCurrentSurfaceGap = Math.min(runwide.minCurrentSurfaceGap, minCurrentGap);
  runwide.populationMin = Math.min(runwide.populationMin, agents.length);
  runwide.populationMax = Math.max(runwide.populationMax, agents.length);

  for (const map of [controller.gaitController.ants, controller.bodyPoseController.ants,
    controller.gasterDeposition.ants]) {
    if (!(map instanceof Map)) continue;
    for (const id of map.keys()) if (!activeIds.has(id)) runwide.mapOrphanIdCount += 1;
  }

  const activation = controller.colonyActivation.getSnapshot();
  const desiredPopulation = activationEnabled ? activation.desiredPopulation : controller.state.population.count;
  const recruitmentLimit = controller.recruitmentLimit;
  runwide.maxActivation = Math.max(runwide.maxActivation, activation.activation);
  runwide.maxLocalEvidence = Math.max(runwide.maxLocalEvidence, activation.evidence);
  runwide.maxActivationStepDelta = Math.max(runwide.maxActivationStepDelta,
    Math.abs(activation.activation - previousActivation));
  runwide.maxDesiredPopulation = Math.max(runwide.maxDesiredPopulation, desiredPopulation);
  runwide.maxRecruitmentLimit = Math.max(runwide.maxRecruitmentLimit, recruitmentLimit);
  const ceiling = controller.colonyActivation.ceiling;
  const floor = controller.colonyActivation.floor;
  if (![activation.evidence, activation.activation, activation.desiredPopulation,
    activation.recruitmentLimit].every(Number.isFinite)
    || activation.evidence < 0 || activation.evidence > 1
    || activation.activation < 0 || activation.activation > 1
    || desiredPopulation < floor || desiredPopulation > ceiling
    || recruitmentLimit < floor || recruitmentLimit > ceiling) {
    runwide.activationBoundViolations += 1;
  }
  if (!activationEnabled && activation.activation !== 0) {
    // The disabled branch intentionally holds activation at zero while the
    // analysis ceiling/limit remain observable as a baseline reference.
    runwide.activationBoundViolations += 1;
  }
}

function currentMapIdAudit(controller) {
  const active = new Set(controller.agents.map(agent => agent.id));
  let orphanIds = 0;
  for (const map of [controller.gaitController.ants, controller.bodyPoseController.ants,
    controller.gasterDeposition.ants]) {
    if (!(map instanceof Map)) continue;
    for (const id of map.keys()) if (!active.has(id)) orphanIds += 1;
  }
  return { orphanIds };
}

function sweptSurfaceGap(first, second) {
  return sweptCenterDistance(first, second) - first.radius - second.radius;
}

function sweptCenterDistance(first, second) {
  const px = first.x - second.x;
  const py = first.y - second.y;
  const firstDx = first.endX - first.x;
  const firstDy = first.endY - first.y;
  const secondDx = second.endX - second.x;
  const secondDy = second.endY - second.y;
  const dx = firstDx - secondDx;
  const dy = firstDy - secondDy;
  const denominator = dx * dx + dy * dy;
  const t = denominator > 0 ? Math.max(0, Math.min(1, -(px * dx + py * dy) / denominator)) : 0;
  return Math.hypot(px + dx * t, py + dy * t);
}

function spawnSummary(sum, count, minimum, maximum, maxPerTick) {
  return { intervalCount: count, meanIntervalMs: count ? sum / count : null,
    minIntervalMs: Number.isFinite(minimum) ? minimum : null,
    maxIntervalMs: maximum || null, maxSpawnsInOneTick: maxPerTick };
}

function compactSample(sample) {
  return Object.fromEntries(['simulationTimeSeconds', 'activePopulation', 'totalSpawned', 'totalRetired',
    'pheromoneMass', 'meanTrailAdherence', 'maximumLiveSpeed', 'minimumPhysicalSurfaceGap',
    'desiredPopulation', 'localEvidence', 'recruitmentLimit', 'footContactGroups',
    'malformedFootContacts', 'outOfBoundsFootContacts', 'outOfBoundsFootPoints',
    'footContactCentroidMismatches'].map(key => [key, sample[key]]));
}

function compactRunwide(runwide) {
  return Object.fromEntries(['maxSpeed', 'maxSpeedLimitExcess', 'velocityLimitViolations', 'maxTurnRate',
    'minSweptSurfaceGap', 'minCurrentSurfaceGap', 'sweptOverlapViolations',
    'sweptMaterialPenetrations', 'sweptGrazingSamples', 'worstSweptPair',
    'centerPassThroughEvents', 'relativeDirectionFlipEvents', 'currentOverlapViolations',
    'currentMaterialPenetrations', 'finiteStateViolations', 'bodyPoseFiniteViolations',
    'mapOrphanIdCount', 'maxActivationStepDelta', 'maxDesiredPopulation',
    'maxRecruitmentLimit', 'activationBoundViolations', 'populationMin', 'populationMax',
    'populationRiseBins', 'populationFallBins', 'ticksWithRetirementWithoutBirth',
    'retirementsWithoutSameTickBirth', 'orphanMapIdsAtEnd'].map(key => [key, runwide[key]]));
}

function minimumPairDistance(agents) {
  let minimum = Infinity;
  for (let i = 0; i < agents.length; i += 1) {
    for (let j = i + 1; j < agents.length; j += 1) {
      minimum = Math.min(minimum, Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y));
    }
  }
  return minimum;
}

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function parseSeeds(text) {
  const parsed = text.split(',').map(value => Number(value.trim()));
  if (!parsed.length || parsed.some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new TypeError('--seeds must be comma-separated non-negative integers.');
  }
  return parsed;
}

function parseArguments(args) {
  const parsed = new Map();
  for (const argument of args) {
    const separator = argument.indexOf('=');
    if (separator > 0) parsed.set(argument.slice(0, separator), argument.slice(separator + 1));
  }
  return parsed;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
