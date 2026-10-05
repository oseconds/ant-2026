import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const options = parseArguments(process.argv.slice(2));
const seconds = positiveNumber(options.get('--seconds'), 120);
const seeds = parseSeeds(options.get('--seeds') || '61,20261005,193');
const requestedSamples = (options.get('--samples') || '30,60,120')
  .split(',').map(value => Number(value)).filter(value => Number.isFinite(value) && value > 0 && value <= seconds);
const sampleTimes = [...new Set([...requestedSamples, seconds])].sort((a, b) => a - b);
const outputPath = resolve(options.get('--output') || 'test-results/ant-deposition-evidence.json');
const activationFeedbackEnabled = false;
const ticks = Math.round(seconds * 60);

const evidence = {
  provenance: {
    purpose: 'Seeded ANT continuous-versus-distance-dab gaster-deposition comparison before population feedback tuning.',
    source: 'AntController and the repository GasterDeposition/PheromoneField implementations.',
    modePairing: 'Each mode starts independently from the same per-seed random sequence; their movement and random call paths can diverge after their pheromone fields differ.',
    populationActivationFeedback: activationFeedbackEnabled,
    populationActivationFeedbackDefault: false,
    sampleCadenceSeconds: sampleTimes,
    durationSeconds: seconds,
    seeds,
    field: { width: 96, height: 96, halfLifeSeconds: 15, radius: 0.0045, amountPerUnitDistance: 4.5, reinforcementGain: 5 },
    dabSpacing: 0.006,
    simulationStepSeconds: 1 / 60
  },
  fixedPathDoseCheck: compareFixedPathDose(),
  scenarios: [],
  pairedSeedComparisons: []
};

for (const seed of seeds) {
  for (const mode of ['continuous', 'dab']) {
    evidence.scenarios.push(await runScenario(seed, mode));
  }
}

evidence.pairedSeedComparisons = compareScenarios(evidence.scenarios);
await mkdir(resolve(outputPath, '..'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ output: outputPath, seeds, seconds, samples: sampleTimes,
  pairedSeedComparisons: evidence.pairedSeedComparisons }, null, 2));

async function runScenario(seed, mode) {
  const counters = {
    intendedDose: 0,
    generatedDose: 0,
    deliveredFieldMass: 0,
    retirementFlushDose: 0,
    actualThoraxDistance: 0,
    contactGroups: 0,
    footContacts: 0,
    speedSum: 0,
    speedSamples: 0,
    maximumSpeed: 0,
    minimumSurfaceGap: Infinity,
    finiteStates: true
  };
  let field;
  const state = {
    pheromone: { depositionMode: mode },
      population: { activationFeedback: activationFeedbackEnabled }
  };
  const controller = new AntController({
    state,
    random: seededRandom(seed),
    fieldFactory: settings => {
      field = new PheromoneField(settings);
      instrumentField(field, counters);
      return field;
    },
    gasterDeposition: new GasterDeposition({ mode })
  });
  instrumentDeposition(controller.gasterDeposition, counters);
  controller.subscribe(event => {
    if (event.type !== 'foot-contact') return;
    counters.contactGroups += 1;
    counters.footContacts += event.payload.contacts?.length || 0;
  });
  await controller.init();

  const samples = [];
  let nextSample = 0;
  for (let tick = 1; tick <= ticks; tick += 1) {
    controller.tick(1 / 60);
    accumulateMotionStats(controller, counters);
    if (tick >= Math.round(sampleTimes[nextSample] * 60)) {
      samples.push(makeSample(controller, counters, sampleTimes[nextSample]));
      nextSample += 1;
    }
  }
  assert.equal(samples.length, sampleTimes.length, `all requested samples recorded for seed ${seed} ${mode}`);

  const scenario = { seed, mode, samples };
  if (seed === seeds[0]) {
    const snapshot = field.getSnapshot();
    scenario.finalField = {
      width: snapshot.width,
      height: snapshot.height,
      values: Array.from(snapshot.values)
    };
  }
  await controller.destroy();
  return scenario;
}

function instrumentDeposition(deposition, counters) {
  const advance = deposition.advance.bind(deposition);
  deposition.advance = (...args) => {
    const [, distance, , , amountPerUnitDistance] = args;
    if (Number.isFinite(distance) && distance > 0 && Number.isFinite(amountPerUnitDistance)) {
      counters.actualThoraxDistance += distance;
      counters.intendedDose += distance * amountPerUnitDistance;
    }
    const deposits = advance(...args);
    counters.generatedDose += sumDepositAmounts(deposits);
    return deposits;
  };

  const retire = deposition.retire.bind(deposition);
  deposition.retire = (...args) => {
    const deposits = retire(...args);
    const flushed = sumDepositAmounts(deposits);
    counters.retirementFlushDose += flushed;
    counters.generatedDose += flushed;
    return deposits;
  };
}

function instrumentField(field, counters) {
  const depositBrush = field.depositBrush.bind(field);
  field.depositBrush = (x, y, amount, radius, sigma, support) => {
    const bounds = brushBounds(field, x, y, support);
    const before = sumRegion(field, bounds);
    const result = depositBrush(x, y, amount, radius, sigma, support);
    const after = sumRegion(field, bounds);
    counters.deliveredFieldMass += Math.max(0, after - before);
    return result;
  };
}

function accumulateMotionStats(controller, counters) {
  const agents = controller.agents;
  for (const agent of agents) {
    const speed = Math.hypot(agent.vx, agent.vy);
    counters.speedSum += speed;
    counters.speedSamples += 1;
    counters.maximumSpeed = Math.max(counters.maximumSpeed, speed);
    const pose = controller.bodyPoseController.getSnapshot(agent);
    counters.finiteStates &&= [agent.x, agent.y, agent.vx, agent.vy, agent.heading,
      agent.trailAdherence, pose?.headYaw, pose?.gasterYaw, pose?.gasterRear?.x,
      pose?.gasterRear?.y].every(Number.isFinite);
  }
}

function makeSample(controller, counters, requestedSeconds) {
  const agents = controller.agents;
  let adherence = 0;
  let liveMaxSpeed = 0;
  for (const agent of agents) {
    adherence += agent.trailAdherence;
    liveMaxSpeed = Math.max(liveMaxSpeed, Math.hypot(agent.vx, agent.vy));
  }
  const snapshot = controller.field.getSnapshot();
  const pendingDose = [...controller.gasterDeposition.ants.values()]
    .reduce((sum, ant) => sum + ant.amount, 0);
  const minimumCenterDistance = minimumPairDistance(agents);
  const radius = controller.state.behavior.bodyRadius;
  return {
    requestedSimulationSeconds: requestedSeconds,
    simulationTimeMs: controller.simulationTimeMs,
    activePopulation: agents.length,
    totalSpawned: controller.totalSpawned,
    totalRetired: controller.totalRetired,
    pheromoneTotalMass: snapshot.totalMass,
    meanTrailAdherence: agents.length ? adherence / agents.length : 0,
    meanSpeed: counters.speedSamples ? counters.speedSum / counters.speedSamples : 0,
    maxSpeedObserved: counters.maximumSpeed,
    liveMaxSpeed: liveMaxSpeed,
    minimumCenterDistance: Number.isFinite(minimumCenterDistance) ? minimumCenterDistance : null,
    minimumBodySurfaceGap: Number.isFinite(minimumCenterDistance) ? minimumCenterDistance - 2 * radius : null,
    footContactGroups: counters.contactGroups,
    individualFootContacts: counters.footContacts,
    actualThoraxDistance: counters.actualThoraxDistance,
    intendedWeightedDose: counters.intendedDose,
    generatedDepositDose: counters.generatedDose,
    deliveredFieldMassIncrease: counters.deliveredFieldMass,
    pendingDose,
    retirementFlushDose: counters.retirementFlushDose,
    deliveredPerIntendedDose: counters.intendedDose > 0
      ? counters.deliveredFieldMass / counters.intendedDose : 0,
    finiteStates: counters.finiteStates && snapshot.values.every(Number.isFinite)
  };
}

function compareFixedPathDose() {
  const spacing = 0.006;
  const radius = 0.0045;
  const totalDistance = 0.036;
  const rateAt = distance => {
    // trailAdherence² rises linearly, so midpoint integration is exact for both chunkings.
    const adherenceSquared = 0.02 + 0.7 * distance / totalDistance;
    return 4.5 * (0.5 + 5 * adherenceSquared);
  };
  const expectedDose = 4.5 * (0.5 + 5 * 0.02 + 5 * 0.7 / 2) * totalDistance;
  const continuous = new GasterDeposition({ mode: 'continuous', spacing });
  const dab = new GasterDeposition({ mode: 'dab', spacing });
  const continuousField = new PheromoneField({ width: 96, height: 96, decayHalfLifeSeconds: 15 });
  const dabField = new PheromoneField({ width: 96, height: 96, decayHalfLifeSeconds: 15 });
  const apply = (field, deposits) => {
    for (const deposit of deposits) {
      if (deposit.type === 'segment') field.depositSegment(deposit.from, deposit.to, {
        amountPerUnitDistance: deposit.amountPerUnitDistance, radius
      });
      else field.depositPoint(deposit.position, { amount: deposit.amount, radius });
    }
  };

  for (let index = 0; index < 18; index += 1) {
    const fromDistance = index * 0.002;
    const toDistance = fromDistance + 0.002;
    const rate = rateAt((fromDistance + toDistance) / 2);
    apply(continuousField, continuous.advance('fixed', 0.002,
      { x: 0.2 + fromDistance, y: 0.5 }, { x: 0.2 + toDistance, y: 0.5 }, rate));
  }
  for (let index = 0; index < 12; index += 1) {
    const fromDistance = index * 0.003;
    const toDistance = fromDistance + 0.003;
    const rate = rateAt((fromDistance + toDistance) / 2);
    apply(dabField, dab.advance('fixed', 0.003,
      { x: 0.2 + fromDistance, y: 0.5 }, { x: 0.2 + toDistance, y: 0.5 }, rate));
  }
  for (const deposit of dab.retire('fixed', { x: 0.236, y: 0.5 })) {
    dabField.depositPoint(deposit.position, { amount: deposit.amount, radius });
  }

  const continuousMass = continuousField.getSnapshot().totalMass;
  const dabMass = dabField.getSnapshot().totalMass;
  const relativeDifference = Math.abs(continuousMass - dabMass) / expectedDose;
  assert.ok(relativeDifference < 1e-5, `fixed-path dose mismatch ${relativeDifference}`);
  return {
    totalThoraxDistance: totalDistance,
    continuousMovementChunk: 0.002,
    dabMovementChunk: 0.003,
    weightProfile: 'adherence² increases linearly from 0.02 to 0.72 over the fixed path',
    expectedWeightedDose: expectedDose,
    continuousFieldMass: continuousMass,
    dabFieldMass: dabMass,
    relativeMassDifference: relativeDifference,
    passed: true
  };
}

function compareScenarios(scenarios) {
  const comparisons = [];
  for (const seed of seeds) {
    const continuous = scenarios.find(item => item.seed === seed && item.mode === 'continuous');
    const dab = scenarios.find(item => item.seed === seed && item.mode === 'dab');
    for (let index = 0; index < continuous.samples.length; index += 1) {
      const a = continuous.samples[index], b = dab.samples[index];
      comparisons.push({
        seed,
        requestedSimulationSeconds: a.requestedSimulationSeconds,
        continuous: modeSummary(a),
        dab: modeSummary(b),
        relativeDifference: {
          pheromoneMass: relativeDifference(a.pheromoneTotalMass, b.pheromoneTotalMass),
          intendedDosePerDistance: relativeDifference(
            a.actualThoraxDistance ? a.intendedWeightedDose / a.actualThoraxDistance : 0,
            b.actualThoraxDistance ? b.intendedWeightedDose / b.actualThoraxDistance : 0),
          activePopulation: relativeDifference(a.activePopulation, b.activePopulation),
          meanSpeed: relativeDifference(a.meanSpeed, b.meanSpeed)
        }
      });
    }
  }
  return comparisons;
}

function modeSummary(sample) {
  return {
    activePopulation: sample.activePopulation,
    totalSpawned: sample.totalSpawned,
    totalRetired: sample.totalRetired,
    pheromoneTotalMass: sample.pheromoneTotalMass,
    intendedWeightedDose: sample.intendedWeightedDose,
    deliveredFieldMassIncrease: sample.deliveredFieldMassIncrease,
    deliveredPerIntendedDose: sample.deliveredPerIntendedDose,
    actualThoraxDistance: sample.actualThoraxDistance,
    intendedDosePerDistance: sample.actualThoraxDistance
      ? sample.intendedWeightedDose / sample.actualThoraxDistance : 0,
    pendingDose: sample.pendingDose,
    retirementFlushDose: sample.retirementFlushDose,
    meanTrailAdherence: sample.meanTrailAdherence,
    meanSpeed: sample.meanSpeed,
    maxSpeedObserved: sample.maxSpeedObserved,
    minimumBodySurfaceGap: sample.minimumBodySurfaceGap,
    footContactGroups: sample.footContactGroups,
    individualFootContacts: sample.individualFootContacts,
    finiteStates: sample.finiteStates
  };
}

function brushBounds(field, x, y, support) {
  const gx = Math.max(0, Math.min(1, x)) * (field.width - 1);
  const gy = Math.max(0, Math.min(1, y)) * (field.height - 1);
  const radiusX = Math.ceil(support * (field.width - 1));
  const radiusY = Math.ceil(support * (field.height - 1));
  return {
    minX: Math.max(0, Math.floor(gx - radiusX)),
    maxX: Math.min(field.width - 1, Math.ceil(gx + radiusX)),
    minY: Math.max(0, Math.floor(gy - radiusY)),
    maxY: Math.min(field.height - 1, Math.ceil(gy + radiusY))
  };
}

function sumRegion(field, bounds) {
  let total = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    const row = y * field.width;
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) total += field.values[row + x];
  }
  return total;
}

function sumDepositAmounts(deposits) {
  return deposits.reduce((sum, deposit) => sum + (deposit.type === 'point'
    ? deposit.amount
    : Math.hypot(deposit.to.x - deposit.from.x, deposit.to.y - deposit.from.y) * deposit.amountPerUnitDistance), 0);
}

function minimumPairDistance(agents) {
  let minimum = Infinity;
  for (let first = 0; first < agents.length; first += 1) {
    for (let second = first + 1; second < agents.length; second += 1) {
      minimum = Math.min(minimum, Math.hypot(agents[first].x - agents[second].x,
        agents[first].y - agents[second].y));
    }
  }
  return minimum;
}

function relativeDifference(a, b) {
  const denominator = Math.max(Math.abs(a), Math.abs(b));
  return denominator > 0 ? Math.abs(a - b) / denominator : 0;
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
