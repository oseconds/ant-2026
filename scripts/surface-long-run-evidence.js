import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import {
  TRAIL_PLATE_CHEMICAL_THRESHOLD,
  TRAIL_PLATE_GRID_SIZE,
  TRAIL_PLATE_MIN_GEODESIC_LENGTH,
  TRAIL_PLATE_SOURCE_ORIGIN,
  TRAIL_PLATE_SOURCE_RADII,
  TRAIL_PLATE_SUPPORT_RADIUS,
  TRAIL_PLATE_SUPPORT_THRESHOLD,
  TRAIL_PLATE_TARGET_EDGE_DISTANCE
} from '../src/lib/agents/ant/TrailPlateBirth.js';

const args = parseArguments(process.argv.slice(2));
const seeds = parseSeeds(args.get('--seeds') || '20261005,20261006,20261007');
const durationSeconds = positiveNumber(args.get('--seconds'), 600);
const sampleIntervalSeconds = positiveNumber(args.get('--interval'), 10);
const outputPath = resolve(args.get('--output')
  || 'docs/ant/evidence/2026-10-05-surface-plates/long-run-evidence.json');
const ticks = Math.round(durationSeconds * 60);
const sampleIntervalTicks = Math.max(1, Math.round(sampleIntervalSeconds * 60));

const report = {
  provenance: {
    purpose: 'Seeded natural ANT surface compaction and trail-supported Plate birth evidence.',
    rng: 'LCG state = (state * 1664525 + 1013904223) >>> 0; matches the existing ANT evidence harness.',
    seeds,
    durationSeconds,
    sampleIntervalSeconds,
    simulationStepSeconds: 1 / 60,
    pheromone: { width: 96, height: 96, halfLifeSeconds: 15 },
    surface: { width: 96, height: 96, halfLifeSeconds: 1800, contactDose: 0.025, radius: 0.012 },
    plateBirthThresholds: {
      chemical: TRAIL_PLATE_CHEMICAL_THRESHOLD,
      support: TRAIL_PLATE_SUPPORT_THRESHOLD,
      supportRadius: TRAIL_PLATE_SUPPORT_RADIUS,
      sourceOrigin: TRAIL_PLATE_SOURCE_ORIGIN,
      sourceRadii: TRAIL_PLATE_SOURCE_RADII,
      targetEdgeDistance: TRAIL_PLATE_TARGET_EDGE_DISTANCE,
      minimumGeodesicLength: TRAIL_PLATE_MIN_GEODESIC_LENGTH
    },
    baseline: 'Same-seed run with TrailPlateBirth analysis replaced by a no-op; movement checkpoints compared.'
  },
  scenarios: [],
  invariantBaseline: null
};

for (const seed of seeds) report.scenarios.push(await runScenario(seed, { birthAnalysis: true }));
if (seeds.length) {
  const baselineSeed = seeds[0];
  const withBirth = report.scenarios.find(item => item.seed === baselineSeed);
  const noBirthAnalysis = await runScenario(baselineSeed, { birthAnalysis: false });
  report.invariantBaseline = compareInvariantRuns(withBirth, noBirthAnalysis);
}

await mkdir(resolve(outputPath, '..'), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report)}\n`);
console.log(JSON.stringify({ output: outputPath, durationSeconds, sampleIntervalSeconds,
  scenarios: report.scenarios.map(scenario => ({ seed: scenario.seed,
    activePopulationAtEnd: scenario.timeline.at(-1)?.activePopulation,
    totalFootContactGroups: scenario.runwide.footContactGroups,
    totalIndividualContacts: scenario.runwide.individualFootContacts,
    totalPlates: scenario.plates.length,
    firstBirthTimeSeconds: scenario.births[0]?.bornAtSimulationTimeMs / 1000 ?? null,
    allDescriptorsValid: scenario.descriptorValidity.every(item => item.valid),
    minSurfaceGap: scenario.runwide.minimumPhysicalSurfaceGap,
    finiteStateViolations: scenario.runwide.finiteStateViolations,
    maxSpeed: scenario.runwide.maxSpeed,
    cpuSeconds: scenario.runwide.cpuSeconds,
    noBirthQualificationFrontier: scenario.plates.length ? null : scenario.noBirthQualificationFrontier })) },
null, 2));

async function runScenario(seed, { birthAnalysis }) {
  const controller = new AntController({
    random: seededRandom(seed),
    ...(birthAnalysis ? {} : { trailPlateBirth: noOpBirthSystem() })
  });
  await controller.init();
  const birthSystem = controller.trailPlateBirth;
  const runwide = createRunwide();
  const timeline = [];
  const births = [];
  const birthCounts = { groups: 0, individualContacts: 0, valid: 0, malformed: 0,
    outOfBoundsPoints: 0, centroidMismatches: 0, samples: [] };
  const movementCheckpoints = [];
  const initialAgents = controller.agents;
  movementCheckpoints.push({ seconds: 0, hash: hashMovement(initialAgents) });

  if (birthAnalysis) {
    const observe = birthSystem.observeFootContact.bind(birthSystem);
    birthSystem.observeFootContact = event => {
      const accepted = observe(event);
      birthCounts.valid += accepted;
      return accepted;
    };
  }
  controller.subscribe(event => {
    if (event.type === 'foot-contact') {
      birthCounts.groups += 1;
      recordFootContact(event.payload, birthCounts);
    } else if (event.type === 'plate-birth') {
      const descriptor = event.payload;
      births.push({
        id: descriptor?.id,
        bornAtSimulationTimeMs: descriptor?.bornAtSimulationTimeMs,
        descriptor
      });
    }
  });

  const wallStart = performance.now();
  let nextSampleTick = sampleIntervalTicks;
  let lastActivation = controller.colonyActivation.getSnapshot().activation;
  for (let tick = 1; tick <= ticks; tick += 1) {
    controller.tick(1 / 60);
    updateRunwide(controller, runwide, lastActivation);
    lastActivation = controller.colonyActivation.getSnapshot().activation;
    if (tick % sampleIntervalTicks === 0 || tick === ticks) {
      const simulationTimeSeconds = controller.simulationTimeMs / 1000;
      const captured = captureTimeline(controller, birthCounts, simulationTimeSeconds, birthAnalysis);
      runwide.maxSurfaceValue = Math.max(runwide.maxSurfaceValue, captured.surface.maximum ?? 0);
      runwide.surfaceNonFiniteSamples += captured.surface.nonFiniteCount;
      timeline.push(captured);
      movementCheckpoints.push({ seconds: simulationTimeSeconds, hash: hashMovement(controller.agents) });
      if (birthAnalysis) birthCounts.samples.push({
        simulationTimeSeconds,
        groups: birthCounts.groups,
        individualContacts: birthCounts.individualContacts,
        acceptedIndividualContacts: birthCounts.valid,
        byCorridor: repeatCorridorSnapshot(birthSystem)
      });
      nextSampleTick += sampleIntervalTicks;
    }
    if (tick >= nextSampleTick && tick !== ticks) {
      // No catch-up burst: a requested sample advances only after it was recorded.
      nextSampleTick = tick + sampleIntervalTicks;
    }
  }
  runwide.cpuSeconds = (performance.now() - wallStart) / 1000;
  runwide.footContactGroups = birthCounts.groups;
  runwide.individualFootContacts = birthCounts.individualContacts;
  const plates = birthAnalysis ? birthSystem.getPlates() : [];
  const descriptorValidity = plates.map(validateDescriptor);
  const finalSnapshot = birthSystem.getSnapshot();
  const noBirthQualificationFrontier = birthAnalysis && plates.length === 0
    ? measureQualificationFrontier(birthSystem, controller.surfaceField) : null;
  const output = {
    seed,
    birthAnalysis,
    durationSeconds,
    runwide: finalizeRunwide(runwide),
    timeline,
    births,
    plates,
    plateRelationshipSummary: summarizePlateRelationships(plates),
    descriptorValidity,
    birthCounts,
    finalCandidate: finalSnapshot.candidate,
    noBirthQualificationFrontier,
    movementCheckpoints
  };
  await controller.destroy();
  return output;
}

function createRunwide() {
  return {
    maxSpeed: 0,
    maxTurnRate: 0,
    minimumPhysicalSurfaceGap: Infinity,
    footContactGroups: 0,
    individualFootContacts: 0,
    finiteStateViolations: 0,
    bodyPoseFiniteViolations: 0,
    surfaceNonFiniteSamples: 0,
    maxSurfaceValue: 0,
    maximumActivation: 0,
    maximumDesiredPopulation: 0,
    maximumRecruitmentLimit: 0,
    cpuSeconds: 0
  };
}

function updateRunwide(controller, runwide, previousActivation) {
  const agents = controller.agents;
  for (const agent of agents) {
    const speed = Math.hypot(agent.vx, agent.vy);
    runwide.maxSpeed = Math.max(runwide.maxSpeed, speed);
    runwide.maxTurnRate = Math.max(runwide.maxTurnRate, Math.abs(agent.angularVelocity));
    if (![agent.x, agent.y, agent.vx, agent.vy, agent.heading, agent.trailAdherence, speed].every(Number.isFinite)) {
      runwide.finiteStateViolations += 1;
    }
    const pose = controller.bodyPoseController.ants.get(agent.id);
    if (pose && ![pose.turnSignal, pose.headYaw, pose.gasterYaw,
      pose.antennae.left, pose.antennae.right].every(Number.isFinite)) runwide.bodyPoseFiniteViolations += 1;
  }
  const separation = minimumSurfaceGap(agents);
  if (Number.isFinite(separation)) runwide.minimumPhysicalSurfaceGap = Math.min(runwide.minimumPhysicalSurfaceGap, separation);
  const activation = controller.colonyActivation.getSnapshot();
  runwide.maximumActivation = Math.max(runwide.maximumActivation, activation.activation);
  runwide.maximumDesiredPopulation = Math.max(runwide.maximumDesiredPopulation,
    controller.state.population.activationFeedback ? activation.desiredPopulation : controller.state.population.count);
  runwide.maximumRecruitmentLimit = Math.max(runwide.maximumRecruitmentLimit, controller.recruitmentLimit);
  runwide.maxActivationStepDelta = Math.max(runwide.maxActivationStepDelta || 0,
    Math.abs(activation.activation - previousActivation));
}

function finalizeRunwide(runwide) {
  return { ...runwide,
    minimumPhysicalSurfaceGap: Number.isFinite(runwide.minimumPhysicalSurfaceGap)
      ? runwide.minimumPhysicalSurfaceGap : null };
}

function captureTimeline(controller, contacts, simulationTimeSeconds, birthAnalysis) {
  const snapshot = controller.getSnapshot();
  const surface = snapshot.surface;
  const surfaceStats = summarizeField(surface.values);
  const pheromoneStats = summarizeField(snapshot.pheromone.values);
  const candidate = birthAnalysis ? controller.trailPlateBirth.getSnapshot().candidate : null;
  const frontier = birthAnalysis ? measureQualificationFrontier(controller.trailPlateBirth, controller.surfaceField) : null;
  const activation = snapshot.analysis.colonyActivation;
  const birthSystem = controller.trailPlateBirth;
  return {
    simulationTimeSeconds,
    activePopulation: snapshot.analysis.population,
    totalSpawned: snapshot.analysis.totalSpawned,
    totalRetired: snapshot.analysis.totalRetired,
    meanTrailAdherence: snapshot.agents.length
      ? snapshot.agents.reduce((sum, ant) => sum + ant.trailAdherence, 0) / snapshot.agents.length : 0,
    meanSpeed: snapshot.analysis.meanSpeed,
    minimumPhysicalSurfaceGap: snapshot.analysis.minSeparation,
    pheromone: { totalMass: snapshot.analysis.pheromoneMass, ...pheromoneStats },
    surface: { totalFootContacts: surface.totalFootContacts, ...surfaceStats },
    activation,
    footContactGroups: contacts.groups,
    individualFootContacts: contacts.individualContacts,
    acceptedIndividualContacts: contacts.valid,
    plateCount: birthAnalysis ? birthSystem.getPlates().length : 0,
    candidate: candidate ? compactCandidate(birthSystem.candidate) : null,
    qualificationFrontier: frontier,
    finite: snapshot.agents.every(ant => [ant.x, ant.y, ant.vx, ant.vy, ant.heading,
      ant.trailAdherence, ant.bodyPose?.headYaw, ant.bodyPose?.gasterYaw,
      ant.bodyPose?.gasterRear?.x, ant.bodyPose?.gasterRear?.y].every(Number.isFinite))
      && surfaceStats.nonFiniteCount === 0 && pheromoneStats.nonFiniteCount === 0
  };
}

function compactCandidate(candidate) {
  if (!candidate) return null;
  return {
    source: candidate.source,
    target: candidate.target,
    geodesicLength: candidate.geodesicLength,
    meanChemical: candidate.meanChemical,
    meanSupport: candidate.meanSupport,
    stableSeconds: candidate.stableSeconds,
    similarity: candidate.similarity,
    footContacts: candidate.footContacts
  };
}

function recordFootContact(event, counts) {
  if (!event || event.type !== 'FOOT_CONTACT' || !Array.isArray(event.contacts)) {
    counts.malformed += 1;
    return;
  }
  const points = event.contacts.map(contact => contact?.position);
  if (points.some(point => !finitePoint(point))) counts.malformed += 1;
  for (const point of points.filter(finitePoint)) {
    counts.individualContacts += 1;
    if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) counts.outOfBoundsPoints += 1;
  }
  if (points.length && points.every(finitePoint) && finitePoint(event.position)) {
    const centroid = {
      x: points.reduce((sum, point) => sum + point.x / points.length, 0),
      y: points.reduce((sum, point) => sum + point.y / points.length, 0)
    };
    if (Math.hypot(centroid.x - event.position.x, centroid.y - event.position.y) > 1e-9) {
      counts.centroidMismatches += 1;
    }
  }
  if (counts.samples.length < 12) counts.samples.push({ antId: event.antId,
    simulationTimeMs: event.simulationTimeMs, position: event.position,
    contacts: event.contacts.map(contact => ({ legId: contact.legId, position: contact.position })) });
}

function repeatCorridorSnapshot(birthSystem) {
  return birthSystem.birthRecords.map(record => {
    const currentContacts = birthSystem.countFootContacts(record.corridorMask);
    return {
      id: record.id,
      bornAtSimulationTimeMs: record.bornAtSimulationTimeMs,
      contactsAtBirth: record.footContactsAtBirth,
      currentContacts,
      newContacts: Math.max(0, currentContacts - record.footContactsAtBirth)
    };
  });
}

function summarizeField(values) {
  let minimum = Infinity, maximum = -Infinity, totalMass = 0, nonFiniteCount = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) { nonFiniteCount += 1; continue; }
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    totalMass += value;
  }
  return { minimum: Number.isFinite(minimum) ? minimum : null,
    maximum: Number.isFinite(maximum) ? maximum : null, totalMass, nonFiniteCount };
}

function measureQualificationFrontier(birthSystem, surfaceField) {
  const size = TRAIL_PLATE_GRID_SIZE;
  const cellCount = size * size;
  const supported = new Uint8Array(cellCount);
  const chemical = birthSystem.chemicalMemory;
  const frontier = {
    maximumChemical: 0,
    maximumSourceAnnulusChemical: 0,
    maximumBoundaryChemical: 0,
    maximumSupportedChemical: 0,
    maximumSupportedSourceChemical: 0,
    maximumSupportedBoundaryChemical: 0,
    maximumSourceSupportAtChemicalThreshold: 0,
    maximumBoundarySupportAtChemicalThreshold: 0,
    sourceChemicalGap: TRAIL_PLATE_CHEMICAL_THRESHOLD,
    boundaryChemicalGap: TRAIL_PLATE_CHEMICAL_THRESHOLD,
    sourceSupportGapAtChemicalThreshold: TRAIL_PLATE_SUPPORT_THRESHOLD,
    boundarySupportGapAtChemicalThreshold: TRAIL_PLATE_SUPPORT_THRESHOLD,
    nearestSupportedSourceAnnulusGap: Infinity,
    nearestSupportedBoundaryGap: Infinity,
    connectedSupportedComponentCount: 0,
    maximumSupportedSourceToBoundaryLength: 0,
    sourceToBoundaryLengthGap: TRAIL_PLATE_MIN_GEODESIC_LENGTH,
    hasSupportedSourceToBoundaryPath: false
  };
  for (let index = 0; index < cellCount; index += 1) {
    const x = index % size / (size - 1);
    const y = Math.floor(index / size) / (size - 1);
    const chem = Number.isFinite(chemical[index]) ? chemical[index] : 0;
    const support = chem >= TRAIL_PLATE_CHEMICAL_THRESHOLD
      ? surfaceField.sampleSupport(x, y, TRAIL_PLATE_SUPPORT_RADIUS) : 0;
    const radial = Math.hypot(x - TRAIL_PLATE_SOURCE_ORIGIN.x, y - TRAIL_PLATE_SOURCE_ORIGIN.y);
    const inSource = radial >= TRAIL_PLATE_SOURCE_RADII[0] && radial <= TRAIL_PLATE_SOURCE_RADII[1];
    const edgeDistance = Math.min(x, y, 1 - x, 1 - y);
    const nearBoundary = edgeDistance <= TRAIL_PLATE_TARGET_EDGE_DISTANCE;
    frontier.maximumChemical = Math.max(frontier.maximumChemical, chem);
    if (inSource) frontier.maximumSourceAnnulusChemical = Math.max(frontier.maximumSourceAnnulusChemical, chem);
    if (nearBoundary) frontier.maximumBoundaryChemical = Math.max(frontier.maximumBoundaryChemical, chem);
    if (chem >= TRAIL_PLATE_CHEMICAL_THRESHOLD) {
      if (inSource) frontier.maximumSourceSupportAtChemicalThreshold = Math.max(
        frontier.maximumSourceSupportAtChemicalThreshold, support);
      if (nearBoundary) frontier.maximumBoundarySupportAtChemicalThreshold = Math.max(
        frontier.maximumBoundarySupportAtChemicalThreshold, support);
      if (support >= TRAIL_PLATE_SUPPORT_THRESHOLD) {
        supported[index] = 1;
        frontier.nearestSupportedSourceAnnulusGap = Math.min(frontier.nearestSupportedSourceAnnulusGap,
          radial < TRAIL_PLATE_SOURCE_RADII[0] ? TRAIL_PLATE_SOURCE_RADII[0] - radial
            : radial > TRAIL_PLATE_SOURCE_RADII[1] ? radial - TRAIL_PLATE_SOURCE_RADII[1] : 0);
        frontier.nearestSupportedBoundaryGap = Math.min(frontier.nearestSupportedBoundaryGap,
          Math.max(0, edgeDistance - TRAIL_PLATE_TARGET_EDGE_DISTANCE));
        frontier.maximumSupportedChemical = Math.max(frontier.maximumSupportedChemical, chem);
        if (inSource) frontier.maximumSupportedSourceChemical = Math.max(frontier.maximumSupportedSourceChemical, chem);
        if (nearBoundary) frontier.maximumSupportedBoundaryChemical = Math.max(frontier.maximumSupportedBoundaryChemical, chem);
      }
    }
  }
  frontier.sourceChemicalGap = Math.max(0, TRAIL_PLATE_CHEMICAL_THRESHOLD - frontier.maximumSourceAnnulusChemical);
  frontier.boundaryChemicalGap = Math.max(0, TRAIL_PLATE_CHEMICAL_THRESHOLD - frontier.maximumBoundaryChemical);
  frontier.sourceSupportGapAtChemicalThreshold = Math.max(0,
    TRAIL_PLATE_SUPPORT_THRESHOLD - frontier.maximumSourceSupportAtChemicalThreshold);
  frontier.boundarySupportGapAtChemicalThreshold = Math.max(0,
    TRAIL_PLATE_SUPPORT_THRESHOLD - frontier.maximumBoundarySupportAtChemicalThreshold);
  frontier.nearestSupportedSourceAnnulusGap = Number.isFinite(frontier.nearestSupportedSourceAnnulusGap)
    ? frontier.nearestSupportedSourceAnnulusGap : null;
  frontier.nearestSupportedBoundaryGap = Number.isFinite(frontier.nearestSupportedBoundaryGap)
    ? frontier.nearestSupportedBoundaryGap : null;

  const components = connectedComponents(supported, size);
  frontier.connectedSupportedComponentCount = components.length;
  for (const component of components) {
    const sourceCells = component.filter(index => {
      const x = index % size / (size - 1), y = Math.floor(index / size) / (size - 1);
      const radius = Math.hypot(x - TRAIL_PLATE_SOURCE_ORIGIN.x, y - TRAIL_PLATE_SOURCE_ORIGIN.y);
      return radius >= TRAIL_PLATE_SOURCE_RADII[0] && radius <= TRAIL_PLATE_SOURCE_RADII[1];
    });
    const boundaryCells = component.filter(index => {
      const x = index % size / (size - 1), y = Math.floor(index / size) / (size - 1);
      return Math.min(x, y, 1 - x, 1 - y) <= TRAIL_PLATE_TARGET_EDGE_DISTANCE;
    });
    if (!sourceCells.length || !boundaryCells.length) continue;
    const distances = new Int32Array(cellCount); distances.fill(-1);
    const queue = [];
    for (const index of sourceCells) { distances[index] = 0; queue.push(index); }
    const componentSet = new Uint8Array(cellCount);
    for (const index of component) componentSet[index] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      for (const adjacent of gridNeighbors(current, size)) {
        if (!componentSet[adjacent] || distances[adjacent] >= 0) continue;
        distances[adjacent] = distances[current] + 1;
        queue.push(adjacent);
      }
    }
    const steps = Math.max(...boundaryCells.map(index => distances[index]));
    const length = steps / (size - 1);
    frontier.hasSupportedSourceToBoundaryPath = true;
    frontier.maximumSupportedSourceToBoundaryLength = Math.max(
      frontier.maximumSupportedSourceToBoundaryLength, length);
  }
  frontier.sourceToBoundaryLengthGap = Math.max(0,
    TRAIL_PLATE_MIN_GEODESIC_LENGTH - frontier.maximumSupportedSourceToBoundaryLength);
  return frontier;
}

function connectedComponents(mask, size) {
  const seen = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const component = [], queue = [start]; seen[start] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head]; component.push(current);
      for (const adjacent of gridNeighbors(current, size)) {
        if (mask[adjacent] && !seen[adjacent]) { seen[adjacent] = 1; queue.push(adjacent); }
      }
    }
    components.push(component);
  }
  return components;
}

function gridNeighbors(index, size) {
  const row = Math.floor(index / size), column = index % size;
  const result = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const x = column + dx, y = row + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) result.push(y * size + x);
    }
  }
  return result;
}

function validateDescriptor(descriptor) {
  const size = descriptor?.grid?.width || TRAIL_PLATE_GRID_SIZE;
  const count = size * (descriptor?.grid?.height || size);
  const mask = descriptor?.mask;
  const maskValid = Array.isArray(mask) && mask.length === count
    && mask.every(value => value === 0 || value === 1);
  const maskComponents = maskValid ? connectedComponents(Uint8Array.from(mask), size).length : null;
  const nodes = descriptor?.centerline || [];
  const nodeIds = new Set(nodes.map(node => node.index));
  const centerlineFinite = nodes.length > 0 && nodes.every(node =>
    Number.isInteger(node.index) && node.index >= 0 && node.index < count
    && finitePoint(node) && Number.isFinite(node.halfWidth)
    && node.halfWidth >= 0.012 - 1e-9 && node.halfWidth <= 0.030 + 1e-9);
  const edgesValid = Array.isArray(descriptor?.edges) && descriptor.edges.every(([a, b]) =>
    nodeIds.has(a) && nodeIds.has(b) && gridAdjacent(a, b, size));
  const graphConnected = centerlineFinite && edgesValid
    && graphComponentCount(nodes, descriptor.edges) === 1;
  const principalPath = descriptor?.principalPath || [];
  const principalPathConnected = principalPath.length > 0
    && principalPath.every(index => nodeIds.has(index))
    && principalPath.slice(1).every((index, offset) => gridAdjacent(principalPath[offset], index, size));
  const pickups = descriptor?.pickups || [];
  const pickupsValid = pickups.length === 2 && pickups.every(point => finitePoint(point)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    && maskValid && mask[gridIndex(point.x, point.y, size)] === 1);
  const source = descriptor?.source, target = descriptor?.target;
  const sourceValid = finitePoint(source) && radialSourceGap(source) <= 1 / (size - 1);
  const targetValid = finitePoint(target)
    && Math.min(target.x, target.y, 1 - target.x, 1 - target.y)
      <= TRAIL_PLATE_TARGET_EDGE_DISTANCE + 1 / (size - 1);
  const finiteDescriptor = Number.isFinite(descriptor?.bornAtSimulationTimeMs)
    && Number.isFinite(descriptor?.metrics?.geodesicLength)
    && Number.isFinite(descriptor?.metrics?.meanChemical)
    && Number.isFinite(descriptor?.metrics?.meanSupport)
    && Array.isArray(descriptor?.centerline) && Array.isArray(descriptor?.edges)
    && Array.isArray(descriptor?.principalPath) && Array.isArray(pickups);
  const validity = { id: descriptor?.id, bornAtSimulationTimeMs: descriptor?.bornAtSimulationTimeMs,
    maskValid, maskComponents, centerlineFinite, edgesValid, centerlineGraphConnected: graphConnected,
    principalPathConnected, pickupsValid, sourceInAnnulus: sourceValid, targetNearBoundary: targetValid,
    finiteDescriptor };
  validity.valid = Object.entries(validity).filter(([key]) => key !== 'id'
    && key !== 'bornAtSimulationTimeMs').every(([, value]) => value === true || value === 1);
  return validity;
}

function summarizePlateRelationships(plates) {
  const pairs = [];
  for (let first = 0; first < plates.length; first += 1) {
    const a = plates[first];
    const maskA = new Uint8Array(a.mask);
    const pathA = new Set(a.principalPath || []);
    for (let second = first + 1; second < plates.length; second += 1) {
      const b = plates[second];
      let intersection = 0, union = 0;
      for (let index = 0; index < maskA.length; index += 1) {
        const inA = maskA[index] === 1, inB = b.mask?.[index] === 1;
        if (inA && inB) intersection += 1;
        if (inA || inB) union += 1;
      }
      const pathB = new Set(b.principalPath || []);
      let pathIntersection = 0;
      for (const index of pathA) if (pathB.has(index)) pathIntersection += 1;
      pairs.push({
        firstId: a.id,
        secondId: b.id,
        maskPairCells: intersection,
        maskJaccard: union ? intersection / union : 0,
        principalPathPairCells: pathIntersection,
        principalPathJaccard: jaccard(pathA, pathB),
        principalPathNearCoverage: (pathNearCoverage(pathA, pathB) + pathNearCoverage(pathB, pathA)) * 0.5
      });
    }
  }
  const repeatedPairs = pairs.filter(pair => pair.principalPathNearCoverage >= 0.6);
  return {
    grid: { width: TRAIL_PLATE_GRID_SIZE, height: TRAIL_PLATE_GRID_SIZE },
    pairCount: pairs.length,
    pairs,
    repeatedPrincipalPathPairCount: repeatedPairs.length,
    meanPrincipalPathJaccard: mean(pairs.map(pair => pair.principalPathJaccard)),
    maximumPrincipalPathJaccard: pairs.length ? Math.max(...pairs.map(pair => pair.principalPathJaccard)) : 0,
    meanPrincipalPathNearCoverage: mean(pairs.map(pair => pair.principalPathNearCoverage)),
    maximumPrincipalPathNearCoverage: pairs.length ? Math.max(...pairs.map(pair => pair.principalPathNearCoverage)) : 0
  };
}

function pathNearCoverage(source, target) {
  if (!source.size || !target.size) return 0;
  let covered = 0;
  for (const index of source) {
    const x = index % TRAIL_PLATE_GRID_SIZE, y = Math.floor(index / TRAIL_PLATE_GRID_SIZE);
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < TRAIL_PLATE_GRID_SIZE && ny >= 0 && ny < TRAIL_PLATE_GRID_SIZE
        && target.has(ny * TRAIL_PLATE_GRID_SIZE + nx)) { near = true; break; }
    }
    if (near) covered += 1;
  }
  return covered / source.size;
}

function jaccard(a, b) {
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }

function graphComponentCount(nodes, edges) {
  if (!nodes.length) return 0;
  const adjacency = new Map(nodes.map(node => [node.index, []]));
  for (const [a, b] of edges) {
    adjacency.get(a)?.push(b);
    adjacency.get(b)?.push(a);
  }
  const seen = new Set();
  let count = 0;
  for (const node of nodes) {
    if (seen.has(node.index)) continue;
    count += 1;
    const queue = [node.index]; seen.add(node.index);
    for (let head = 0; head < queue.length; head += 1) {
      for (const neighbor of adjacency.get(queue[head]) || []) {
        if (!seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor); }
      }
    }
  }
  return count;
}

function gridAdjacent(a, b, size) {
  return a !== b && Math.abs(a % size - b % size) <= 1
    && Math.abs(Math.floor(a / size) - Math.floor(b / size)) <= 1;
}

function gridIndex(x, y, size) {
  const col = Math.max(0, Math.min(size - 1, Math.round(x * (size - 1))));
  const row = Math.max(0, Math.min(size - 1, Math.round(y * (size - 1))));
  return row * size + col;
}

function radialSourceGap(point) {
  const radius = Math.hypot(point.x - TRAIL_PLATE_SOURCE_ORIGIN.x,
    point.y - TRAIL_PLATE_SOURCE_ORIGIN.y);
  return radius < TRAIL_PLATE_SOURCE_RADII[0] ? TRAIL_PLATE_SOURCE_RADII[0] - radius
    : radius > TRAIL_PLATE_SOURCE_RADII[1] ? radius - TRAIL_PLATE_SOURCE_RADII[1] : 0;
}

function minimumSurfaceGap(agents) {
  let minimum = Infinity;
  for (let first = 0; first < agents.length; first += 1) {
    for (let second = first + 1; second < agents.length; second += 1) {
      const a = agents[first], b = agents[second];
      minimum = Math.min(minimum, Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius);
    }
  }
  return minimum;
}

function hashMovement(agents) {
  const values = agents.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).map(agent => ({
    id: agent.id, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy,
    heading: agent.heading, angularVelocity: agent.angularVelocity, targetSpeed: agent.targetSpeed,
    trailAdherence: agent.trailAdherence, hesitationRemaining: agent.hesitationRemaining,
    intentHeading: agent.intentHeading, speedPhase: agent.speedPhase
  }));
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

function compareInvariantRuns(active, baseline) {
  const baselineByTime = new Map(baseline.movementCheckpoints.map(item => [item.seconds, item.hash]));
  const comparisons = active.movementCheckpoints.map(item => ({
    seconds: item.seconds,
    baselineHash: baselineByTime.get(item.seconds) || null,
    integratedHash: item.hash,
    identical: baselineByTime.get(item.seconds) === item.hash
  }));
  return { seed: active.seed, baselineMode: 'TrailPlateBirth no-op; pheromone, surface, controller and RNG unchanged',
    checkpoints: comparisons, allIdentical: comparisons.length > 0 && comparisons.every(item => item.identical) };
}

function noOpBirthSystem() {
  return {
    observeFootContact() { return 0; },
    advance() { return []; },
    getPlates() { return []; },
    getSnapshot() { return { plates: [], candidate: null, limitReached: false }; },
    reset() { return this.getSnapshot(); }
  };
}

function finitePoint(point) { return point && Number.isFinite(point.x) && Number.isFinite(point.y); }
function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (1664525 * value + 1013904223) >>> 0; return value / 0x100000000; };
}
function parseSeeds(text) {
  const values = text.split(',').map(value => Number(value.trim()));
  if (!values.length || values.some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new TypeError('--seeds must be comma-separated non-negative integers.');
  }
  return values;
}
function parseArguments(values) {
  const result = new Map();
  for (const value of values) {
    const split = value.indexOf('=');
    if (split > 0) result.set(value.slice(0, split), value.slice(split + 1));
  }
  return result;
}
function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
