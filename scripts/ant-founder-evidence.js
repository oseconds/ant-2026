import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const args = new Map(process.argv.slice(2).map(arg => {
  const at = arg.indexOf('=');
  return at < 0 ? [arg, true] : [arg.slice(0, at), arg.slice(at + 1)];
}));
const DT = 1 / 60;
const OCCUPANCY_SIZE = 64;
const LOW_EVIDENCE = 0.1;
const CHEMICAL_THRESHOLD = 0.04;
const CHECKPOINTS = [30, 60, 120, 300, 600];

if (args.has('--selfcheck')) selfcheck();
else await main();

async function main() {
  const source = resolve(String(args.get('--source') || fileURLToPath(new URL('..', import.meta.url))));
  const output = resolve(String(args.get('--output') || 'test-results/ant-founder-evidence'));
  const seconds = Number(args.get('--seconds') || 600);
  const seeds = String(args.get('--seeds') || '20261005,20261006,20261007').split(',').map(Number);
  assert.ok(Number.isInteger(seconds) && seconds > 0, '--seconds must be a positive integer');
  assert.ok(seeds.length && seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff),
    '--seeds must contain unsigned 32-bit integers');
  const controllerPath = resolve(source, 'src/lib/agents/ant/AntController.js');
  const { AntController } = await import(pathToFileURL(controllerPath).href);
  await mkdir(output, { recursive: true });
  const report = {
    provenance: {
      source, controllerSha256: digest(await readFile(controllerPath)), seeds, seconds,
      stepSeconds: DT, createdAt: new Date().toISOString(),
      preparation: 'Fresh natural default controllers; only the existing LCG is injected; audio remains Off.',
      observations: 'Existing sensing return values are observed without extra field sampling or RNG calls. Wrappers call original methods once.',
      evidence: 'E is the existing absolute local Hill strength. L/C/R are the existing averaged two-depth profiles. Commitment distributions use the actual committedRemaining countdown in seconds; no inferred A*E variable is introduced.',
      lowEvidenceDose: 'E < 0.1; dose and distance are accrued at GasterDeposition.advance. Deferred mixed dabs are not assigned current-tick evidence.',
      clocks: 'New clock pairs are detected by changed countdowns after updateIntention. Effective scheduled hold is min(decision, committed). Realized-hold distribution contains only intervals completed by another scheduling, including blockage interruptions; it excludes retirement-censored and active unfinished intervals. Their counts and elapsed durations are reported separately.',
      occupancy: '64x64 ant-center samples every simulation tick; counts / 60 are ant-seconds. Recent occupancy retains the last 30 completed one-second buckets.',
      persistence: 'Pheromone cells >= 0.04 in every one-second sample in the previous 30 seconds. Region count uses eight-neighbor components with at least 20 cells; this is a corridor-area proxy, not a branch or social graph.',
      plateBranches: 'Existing frozen Plate graph: degree >= 3 nodes joined by existing edges form junction clusters. Endpoints have degree 1. Grid diagonals/intersections can create junctions; these are graph proxies, not inferred behavior.',
      liveRouteBranches: 'The current birth candidate graph is read through the original pure createDescriptor method without publishing a birth. A live route qualifies after stableSeconds >= 20. BoundaryEndpointBranches counts degree-1 graph endpoints within 0.05 of the observation boundary; junction clusters remain a separate grid-dependent proxy. Missing/unqualified candidates have zero qualifying branches. This graph keeps only the existing source-to-distant-boundary paths.',
      persistentEndpoints: 'At 1 Hz, exact boundary endpoint cell identities from the current qualifying candidate are tracked. Missing/unqualified cells reset their age. Persistent20sEndpointCount requires at least 20 seconds between first and current consecutive observations (21 samples). It is an exact-grid temporal endpoint proxy: cell shifts reset it, and it does not establish a persistent whole branch or social graph.',
      earlyRoute: 'The 30 s pheromone >= 0.04 mask outside radius 0.12 around the entrance is frozen per run. Later dose and contact shares within it measure early-route retention, not individual-founder causality.',
      earlyRouteDose: 'Spatial dose share uses the gaster rear endpoint of each accrued movement chunk, before deferred dabs are emitted; it is an endpoint approximation.',
      maps: 'Raw unchanged 96x96 pheromone/surface and 64x64 occupancy grids; render with identical absolute scales across variants.',
      randomPairing: 'Same seed is an initial-condition pairing. Changed movement/recruitment can diverge RNG call paths; state and call count are recorded.',
      raw: 'Gzip archive contains all natural Plate descriptors/birth records, 1 Hz positions and one actual FOOT_CONTACT sample per occupied simulation-second; all contact events are hashed.'
    }, scenarios: []
  };
  for (const seed of seeds) {
    const scenario = await runScenario(AntController, seed, seconds, output);
    report.scenarios.push(scenario);
    const final = scenario.checkpoints.at(-1);
    console.log(JSON.stringify({ seed, wallSeconds: scenario.wallSeconds,
      population: final.activePopulation, mass: final.pheromoneMass, plates: final.plateCount,
      firstPlateSeconds: final.firstPlateSeconds, doseConservationError: final.dose.conservationError,
      invariants: scenario.invariants }));
  }
  await writeFile(resolve(output, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
}

async function runScenario(AntController, seed, seconds, output) {
  const started = performance.now();
  let rngState = seed >>> 0, rngCalls = 0;
  const controller = new AntController({ materialLocomotionResistance: false, random: () => {
    rngCalls += 1;
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 0x100000000;
  } });
  const local = new Map(), scheduled = new Map(), repeats = new Map(), endpointAges = new Map();
  const statistics = { evidence: histogram(1), coherence: histogram(1), adherence: histogram(1),
    remainingCommitmentSeconds: histogram(2), decisionClock: histogram(2), committedClock: histogram(2),
    scheduledMinimumHold: histogram(2), realizedHold: histogram(2), retirementCensoredHold: histogram(2),
    newClockPairsByEvidence: Array.from({ length: 10 }, () => ({ count: 0, decisionSum: 0, committedSum: 0, minimumHoldSum: 0 })) };
  const dose = { total: 0, distance: 0, lowEvidence: 0, lowEvidenceDistance: 0,
    earlyRoute: 0, post30Dose: 0, generated: 0, retirementFlush: 0, censoredHolds: 0,
    byEvidence: Array.from({ length: 10 }, () => ({ dose: 0, distance: 0, chunks: 0 })) };
  const contacts = { groups: 0, feet: 0, lowEvidenceGroups: 0, earlyRouteFeet: 0, post30Feet: 0 };
  const contactHash = createHash('sha256');
  const cumulative = new Uint32Array(OCCUPANCY_SIZE ** 2);
  const recent = new Uint32Array(cumulative.length), occupancyBuckets = [];
  let currentOccupancy = new Uint32Array(cumulative.length);
  const chemicalMasks = [], raw = { seed, positions: [], contactSamples: [], births: [], clockSamples: [] };
  let sampledContactSecond = -1, earlyMask = null;
  const checkpoints = [], targets = [...CHECKPOINTS.filter(t => t <= seconds)];
  if (!targets.includes(seconds)) targets.push(seconds);
  const invariants = { finiteViolations: 0, speedCapViolations: 0, turnCapViolations: 0,
    overlapViolations: 0, minimumSurfaceGap: Infinity, maximumSpeed: 0, maximumTurnRate: 0,
    populationCeilingViolations: 0, malformedContacts: 0, fieldFiniteViolations: 0 };

  const sense = controller.senseLocalTrail.bind(controller);
  controller.senseLocalTrail = agent => {
    const profile = sense(agent);
    local.set(agent.id, profile);
    return profile;
  };
  const intention = controller.updateIntention.bind(controller);
  controller.updateIntention = (agent, agents, occupancy, dt, profile) => {
    const expectedDecision = agent.decisionRemaining - dt;
    const expectedCommitted = agent.committedRemaining - dt;
    const result = intention(agent, agents, occupancy, dt, profile);
    const E = (profile || local.get(agent.id))?.strength ?? 0;
    add(statistics.evidence, E);
    add(statistics.coherence, (profile || local.get(agent.id))?.coherence ?? 0);
    add(statistics.adherence, agent.trailAdherence);
    add(statistics.remainingCommitmentSeconds, Math.max(0, agent.committedRemaining));
    if (Math.abs(agent.decisionRemaining - expectedDecision) > 1e-9
      || Math.abs(agent.committedRemaining - expectedCommitted) > 1e-9) {
      const now = controller.simulationTimeMs / 1000;
      if (scheduled.has(agent.id)) {
        const previous = scheduled.get(agent.id);
        add(statistics.realizedHold, now - previous.seconds);
        if (previous.sample) previous.sample.realizedHoldSeconds = now - previous.seconds;
      }
      const sample = raw.clockSamples.length < 1024 ? {
        antId: agent.id, seconds: now, E, adherence: agent.trailAdherence,
        decisionClock: agent.decisionRemaining, committedClock: agent.committedRemaining,
        minimumHoldSeconds: Math.min(agent.decisionRemaining, agent.committedRemaining),
        realizedHoldSeconds: null, censoredByRetirement: false
      } : null;
      if (sample) raw.clockSamples.push(sample);
      scheduled.set(agent.id, { seconds: now, sample });
      add(statistics.decisionClock, agent.decisionRemaining);
      add(statistics.committedClock, agent.committedRemaining);
      add(statistics.scheduledMinimumHold, Math.min(agent.decisionRemaining, agent.committedRemaining));
      const pair = statistics.newClockPairsByEvidence[Math.min(9, Math.max(0, Math.floor(E * 10)))];
      pair.count += 1; pair.decisionSum += agent.decisionRemaining;
      pair.committedSum += agent.committedRemaining;
      pair.minimumHoldSum += Math.min(agent.decisionRemaining, agent.committedRemaining);
    }
    return result;
  };
  const deposition = controller.gasterDeposition;
  const advance = deposition.advance.bind(deposition);
  deposition.advance = (...values) => {
    const [id, distance, , toRear, rate] = values;
    const amount = distance * rate, E = local.get(id)?.strength ?? 0;
    dose.total += amount; dose.distance += distance;
    const bin = dose.byEvidence[Math.min(9, Math.max(0, Math.floor(E * 10)))];
    bin.dose += amount; bin.distance += distance; bin.chunks += 1;
    if (E < LOW_EVIDENCE) { dose.lowEvidence += amount; dose.lowEvidenceDistance += distance; }
    if (earlyMask) {
      dose.post30Dose += amount;
      if (insideMask(earlyMask, toRear, controller.field.width)) dose.earlyRoute += amount;
    }
    const result = advance(...values);
    dose.generated += depositAmount(result);
    return result;
  };
  const retire = deposition.retire.bind(deposition);
  deposition.retire = (...values) => {
    const result = retire(...values), amount = depositAmount(result);
    dose.generated += amount; dose.retirementFlush += amount;
    return result;
  };
  const birthSystem = controller.trailPlateBirth;
  const descriptor = birthSystem.createDescriptor.bind(birthSystem);
  birthSystem.createDescriptor = (candidate, time) => {
    const prior = birthSystem.findSameCorridorBirth(candidate);
    const result = descriptor(candidate, time);
    repeats.set(result.id, prior?.id ?? null);
    return result;
  };
  controller.subscribe(event => {
    if (event.type === 'plate-birth') {
      raw.births.push({ repeatOfId: repeats.get(event.payload.id),
        graph: graphSummary(event.payload), descriptor: event.payload });
    }
    if (event.type !== 'foot-contact') return;
    const payload = event.payload;
    contacts.groups += 1;
    if (payload?.type !== 'FOOT_CONTACT' || !Array.isArray(payload.contacts)) {
      invariants.malformedContacts += 1; return;
    }
    contacts.feet += payload.contacts.length;
    if ((local.get(payload.antId)?.strength ?? 0) < LOW_EVIDENCE) contacts.lowEvidenceGroups += 1;
    for (const contact of payload.contacts) {
      if (![contact.position?.x, contact.position?.y].every(Number.isFinite)
        || contact.position.x < 0 || contact.position.x > 1
        || contact.position.y < 0 || contact.position.y > 1) invariants.malformedContacts += 1;
      if (earlyMask) {
        contacts.post30Feet += 1;
        if (insideMask(earlyMask, contact.position, controller.field.width)) contacts.earlyRouteFeet += 1;
      }
    }
    contactHash.update(JSON.stringify(payload));
    const second = Math.floor(payload.simulationTimeMs / 1000);
    if (second !== sampledContactSecond) {
      raw.contactSamples.push(payload); sampledContactSecond = second;
    }
  });
  await controller.init();
  const defaults = controller.getState();
  try {
    for (let tick = 1; tick <= seconds * 60; tick += 1) {
      controller.tick(DT);
      inspect(controller, invariants);
      const active = new Set(controller.agents.map(agent => agent.id));
      for (const id of scheduled.keys()) if (!active.has(id)) {
        const unfinished = scheduled.get(id);
        if (unfinished.sample) unfinished.sample.censoredByRetirement = true;
        add(statistics.retirementCensoredHold, controller.simulationTimeMs / 1000 - unfinished.seconds);
        scheduled.delete(id); local.delete(id); dose.censoredHolds += 1;
      }
      for (const agent of controller.agents) {
        const index = gridIndex(agent.x, agent.y, OCCUPANCY_SIZE);
        cumulative[index] += 1; currentOccupancy[index] += 1;
      }
      if (tick % 60 !== 0) continue;
      const second = tick / 60, snapshot = controller.getSnapshot();
      const candidate = birthSystem.candidate;
      const candidateGraph = candidate ? graphSummary(descriptor(candidate, controller.simulationTimeMs)) : null;
      const liveQualified = Boolean(candidate && candidate.stableSeconds >= 20 - 1e-9);
      const persistentEndpoints = trackPersistentEndpoints(endpointAges,
        liveQualified ? candidateGraph.boundaryEndpointCells : [], second);
      if (!snapshot.pheromone.values.every(Number.isFinite) || !snapshot.surface.values.every(Number.isFinite)) {
        invariants.fieldFiniteViolations += 1;
      }
      raw.positions.push({ seconds: second, rngState, rngCalls,
        agents: snapshot.agents.map(agent => ({ id: agent.id, x: agent.x, y: agent.y,
          vx: agent.vx, vy: agent.vy, heading: agent.heading, adherence: agent.trailAdherence,
          E: local.get(agent.id)?.strength ?? 0, coherence: local.get(agent.id)?.coherence ?? 0,
          localProfile: local.get(agent.id) ?? null,
          decisionRemaining: controller.agents.find(a => a.id === agent.id)?.decisionRemaining,
          committedRemaining: controller.agents.find(a => a.id === agent.id)?.committedRemaining })) });
      occupancyBuckets.push(currentOccupancy);
      for (let i = 0; i < recent.length; i += 1) recent[i] += currentOccupancy[i];
      currentOccupancy = new Uint32Array(cumulative.length);
      if (occupancyBuckets.length > 30) {
        const old = occupancyBuckets.shift();
        for (let i = 0; i < recent.length; i += 1) recent[i] -= old[i];
      }
      chemicalMasks.push(Uint8Array.from(snapshot.pheromone.values, value => value >= CHEMICAL_THRESHOLD ? 1 : 0));
      if (chemicalMasks.length > 30) chemicalMasks.shift();
      if (second === 30) earlyMask = Uint8Array.from(snapshot.pheromone.values, (value, index) => {
        const x = index % snapshot.pheromone.width / (snapshot.pheromone.width - 1);
        const y = Math.floor(index / snapshot.pheromone.width) / (snapshot.pheromone.height - 1);
        return value >= CHEMICAL_THRESHOLD && Math.hypot(x - 0.5, y - 0.72) > 0.12 ? 1 : 0;
      });
      if (!targets.includes(second)) continue;
      const persistent = persistentMask(chemicalMasks);
      const agents = controller.agents;
      const pending = [...deposition.ants.values()].reduce((sum, item) => sum + item.amount, 0);
      const conservationError = dose.total - dose.generated - pending;
      const conservationTolerance = 1e-8 * Math.max(1, dose.total);
      assert.ok(Math.abs(conservationError) <= conservationTolerance, 'accrued dose equals emitted plus pending dose');
      assert.equal(statistics.decisionClock.count,
        statistics.realizedHold.count + dose.censoredHolds + scheduled.size,
        'every scheduled interval is completed, retirement-censored or active unfinished');
      const evidenceValues = agents.map(agent => local.get(agent.id)?.strength ?? 0);
      const adherenceValues = agents.map(agent => agent.trailAdherence);
      const commitmentValues = agents.map(agent => Math.max(0, agent.committedRemaining));
      const mapName = `seed${seed}-${second}s-maps.json`;
      const point = {
        seconds: second, activePopulation: agents.length, spawned: controller.totalSpawned,
        retired: controller.totalRetired, pheromoneMass: snapshot.pheromone.totalMass,
        adherence: distribution(adherenceValues), absoluteEvidence: distribution(evidenceValues),
        commitmentRemainingSeconds: distribution(commitmentValues, 2),
        clockIntervals: { scheduled: statistics.decisionClock.count,
          completedRescheduling: statistics.realizedHold.count,
          retirementCensored: dose.censoredHolds, activeUnfinished: scheduled.size,
          activeUnfinishedElapsedSeconds: distribution([...scheduled.values()].map(interval =>
            controller.simulationTimeMs / 1000 - interval.seconds), 2) },
        highAdherenceLowEvidence: agents.filter((agent, i) => agent.trailAdherence >= 0.5 && evidenceValues[i] < LOW_EVIDENCE).length,
        contacts: { ...contacts }, contactStreamSha256: contactHash.copy().digest('hex'),
        dose: { ...structuredClone(dose), pending, conservationError, conservationTolerance,
          lowEvidenceDosePerDistance: ratio(dose.lowEvidence, dose.lowEvidenceDistance),
          totalDosePerDistance: ratio(dose.total, dose.distance),
          earlyRouteDoseShare: ratio(dose.earlyRoute, dose.post30Dose),
          earlyRouteFootShare: ratio(contacts.earlyRouteFeet, contacts.post30Feet) },
        chemical: { ...concentration(snapshot.pheromone.values),
          coverageAbove004: snapshot.pheromone.values.filter(v => v >= CHEMICAL_THRESHOLD).length / snapshot.pheromone.values.length,
          persistent30sCells: persistent?.reduce((sum, v) => sum + v, 0) ?? null,
          persistent30sRegionCount: persistent ? componentCount(persistent, snapshot.pheromone.width, 20) : null,
          earlyRouteMassShare: earlyMask ? ratio(snapshot.pheromone.values.reduce((sum, v, i) => sum + v * earlyMask[i], 0), snapshot.pheromone.totalMass) : null },
        occupancy: { cumulative: concentration(cumulative), recent30s: concentration(recent),
          cumulativeCoverage: cumulative.filter(v => v > 0).length / cumulative.length,
          recent30sCoverage: recent.filter(v => v > 0).length / recent.length },
        coherentStrongAgentFraction: ratio(agents.filter((agent, i) => evidenceValues[i] >= 0.5 && (local.get(agent.id)?.coherence ?? 0) >= 0.5).length, agents.length),
        plateCount: raw.births.length, firstPlateSeconds: raw.births[0]?.descriptor.bornAtSimulationTimeMs / 1000 ?? null,
        repeatedCorridorBirths: raw.births.filter(birth => birth.repeatOfId).length,
        plateGraphs: raw.births.map(birth => ({ id: birth.descriptor.id, repeatOfId: birth.repeatOfId, ...birth.graph })),
        liveRoute: { present: Boolean(candidate), stableSeconds: candidate?.stableSeconds ?? 0,
          qualified: liveQualified, geodesicLength: candidate?.geodesicLength ?? null,
          source: candidate?.source ?? null, target: candidate?.target ?? null,
          qualifyingBoundaryEndpointBranches: liveQualified ? candidateGraph.boundaryEndpointBranches : 0,
          qualifyingJunctionClusters: liveQualified ? candidateGraph.junctionClusters : 0,
          persistent20sEndpointCount: persistentEndpoints.persistentCells.length,
          exactGridEndpointAges: persistentEndpoints,
          graph: candidateGraph },
        birthLimitReached: snapshot.surfacePlates.limitReached,
        activation: snapshot.analysis.colonyActivation, rngState, rngCalls, maps: mapName,
        statistics: structuredClone(statistics)
      };
      checkpoints.push(point);
      await writeFile(resolve(output, mapName), JSON.stringify({ seed, seconds: second,
        pheromone: grid(snapshot.pheromone), surface: grid(snapshot.surface),
        occupancy: { width: OCCUPANCY_SIZE, height: OCCUPANCY_SIZE,
          cumulativeAntSeconds: Array.from(cumulative, v => v * DT), recent30sAntSeconds: Array.from(recent, v => v * DT) },
        persistent30sChemicalMask: persistent && Array.from(persistent), earlyRouteMask: earlyMask && Array.from(earlyMask),
        liveRoute: candidate ? { stableSeconds: candidate.stableSeconds,
          skeletonIndices: Array.from(candidate.skeletonIndices), principalPath: Array.from(candidate.path),
          qualifyingBoundaryEndpointCells: liveQualified ? candidateGraph.boundaryEndpointCells : [],
          persistent20sEndpointCells: persistentEndpoints.persistentCells } : null }));
    }
    const rawFile = `seed${seed}-raw.json.gz`;
    await writeFile(resolve(output, rawFile), gzipSync(JSON.stringify(raw)));
    const result = { seed, wallSeconds: (performance.now() - started) / 1000, defaults,
      raw: rawFile, checkpoints,
      invariants: { ...invariants, minimumSurfaceGap: finiteOrNull(invariants.minimumSurfaceGap) } };
    assert.equal(invariants.finiteViolations, 0, 'finite natural agent state');
    assert.equal(invariants.speedCapViolations, 0, 'existing speed cap');
    assert.equal(invariants.turnCapViolations, 0, 'existing turn cap');
    assert.equal(invariants.overlapViolations, 0, 'no material body overlap');
    assert.equal(invariants.populationCeilingViolations, 0, 'default population ceiling');
    assert.equal(invariants.malformedContacts, 0, 'real finite in-domain feet');
    assert.equal(invariants.fieldFiniteViolations, 0, 'finite chemical and mechanical fields');
    return result;
  } finally { await controller.destroy(); }
}

function inspect(controller, stats) {
  const agents = controller.agents;
  if (agents.length > controller.state.population.count) stats.populationCeilingViolations += 1;
  for (let i = 0; i < agents.length; i += 1) {
    const agent = agents[i], speed = Math.hypot(agent.vx, agent.vy), turn = Math.abs(agent.angularVelocity);
    stats.maximumSpeed = Math.max(stats.maximumSpeed, speed);
    stats.maximumTurnRate = Math.max(stats.maximumTurnRate, turn);
    if (![agent.x, agent.y, agent.vx, agent.vy, agent.heading, agent.trailAdherence,
      agent.decisionRemaining, agent.committedRemaining].every(Number.isFinite)) stats.finiteViolations += 1;
    if (speed > agent.personality.preferredSpeed * 1.35 + 1e-9) stats.speedCapViolations += 1;
    if (turn > 4.5 + 1e-9) stats.turnCapViolations += 1;
    for (let j = i + 1; j < agents.length; j += 1) {
      const other = agents[j], gap = Math.hypot(agent.x - other.x, agent.y - other.y) - agent.radius - other.radius;
      stats.minimumSurfaceGap = Math.min(stats.minimumSurfaceGap, gap);
      if (gap < -1e-6) stats.overlapViolations += 1;
    }
  }
}

function graphSummary(plate) {
  const adjacent = new Map(plate.centerline.map(node => [node.index, []]));
  for (const [a, b] of plate.edges) { adjacent.get(a)?.push(b); adjacent.get(b)?.push(a); }
  const junctions = new Set([...adjacent].filter(([, edges]) => edges.length >= 3).map(([index]) => index));
  let clusters = 0;
  while (junctions.size) {
    const stack = [junctions.values().next().value]; junctions.delete(stack[0]); clusters += 1;
    while (stack.length) for (const next of adjacent.get(stack.pop()) || []) {
      if (junctions.delete(next)) stack.push(next);
    }
  }
  const width = plate.grid?.width || 96, height = plate.grid?.height || 96;
  const boundaryEndpointCells = [...adjacent].filter(([index, edges]) => {
    const x = index % width / (width - 1), y = Math.floor(index / width) / (height - 1);
    return edges.length === 1 && Math.min(x, 1 - x, y, 1 - y) <= 0.05;
  }).map(([index]) => index);
  return { endpoints: [...adjacent.values()].filter(edges => edges.length === 1).length,
    boundaryEndpointBranches: boundaryEndpointCells.length, boundaryEndpointCells,
    junctionClusters: clusters, centerlineNodes: adjacent.size };
}

function trackPersistentEndpoints(state, cells, second) {
  const present = new Set(cells);
  for (const cell of state.keys()) if (!present.has(cell)) state.delete(cell);
  for (const cell of present) {
    const previous = state.get(cell);
    state.set(cell, { firstSeen: previous?.lastSeen === second - 1 ? previous.firstSeen : second, lastSeen: second });
  }
  const ages = [...state].map(([cell, seen]) => ({ cell, ageSeconds: second - seen.firstSeen }));
  return { ages, persistentCells: ages.filter(item => item.ageSeconds >= 20).map(item => item.cell) };
}

function componentCount(mask, width, minimum) {
  const unseen = new Set(Array.from(mask).flatMap((v, i) => v ? [i] : []));
  let count = 0;
  while (unseen.size) {
    const stack = [unseen.values().next().value]; unseen.delete(stack[0]); let size = 0;
    while (stack.length) {
      const index = stack.pop(), x = index % width, y = Math.floor(index / width); size += 1;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < mask.length / width
          && unseen.delete(ny * width + nx)) stack.push(ny * width + nx);
      }
    }
    if (size >= minimum) count += 1;
  }
  return count;
}

function persistentMask(masks) {
  if (masks.length < 30) return null;
  return Uint8Array.from(masks[0], (value, i) => value && masks.every(mask => mask[i]) ? 1 : 0);
}
function concentration(values) {
  const sorted = Array.from(values).sort((a, b) => b - a), mass = sorted.reduce((sum, v) => sum + v, 0);
  let entropy = 0;
  if (mass > 0) for (const value of sorted) if (value > 0) { const p = value / mass; entropy -= p * Math.log(p); }
  return { total: mass, normalizedEntropy: mass > 0 ? entropy / Math.log(values.length) : null,
    top10PercentMassShare: mass > 0 ? sorted.slice(0, Math.ceil(values.length * 0.1)).reduce((sum, v) => sum + v, 0) / mass : null };
}
function histogram(maximum) { return { count: 0, sum: 0, minimum: null, maximum: null, range: [0, maximum], bins: Array(20).fill(0), overflow: 0 }; }
function add(stats, value) {
  if (!Number.isFinite(value)) throw new Error('Nonfinite observation');
  stats.count += 1; stats.sum += value;
  stats.minimum = stats.minimum === null ? value : Math.min(stats.minimum, value);
  stats.maximum = stats.maximum === null ? value : Math.max(stats.maximum, value);
  if (value < 0 || value > stats.range[1]) stats.overflow += 1;
  else stats.bins[Math.min(19, Math.floor(value / stats.range[1] * 20))] += 1;
}
function distribution(values, maximum = 1) {
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = p => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
  const bins = Array(10).fill(0);
  for (const value of sorted) bins[Math.min(9, Math.max(0, Math.floor(value / maximum * 10)))] += 1;
  return { count: values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    p10: quantile(0.1), p50: quantile(0.5), p90: quantile(0.9), range: [0, maximum], bins };
}
function grid(snapshot) { return { width: snapshot.width, height: snapshot.height, values: Array.from(snapshot.values) }; }
function gridIndex(x, y, size) { return Math.round(y * (size - 1)) * size + Math.round(x * (size - 1)); }
function insideMask(mask, point, width) { return point && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 && Boolean(mask[gridIndex(point.x, point.y, width)]); }
function depositAmount(deposits) { return deposits.reduce((sum, d) => sum + (d.type === 'segment' ? Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) * d.amountPerUnitDistance : d.amount), 0); }
function ratio(numerator, denominator) { return denominator > 0 ? numerator / denominator : null; }
function finiteOrNull(value) { return Number.isFinite(value) ? value : null; }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }

function selfcheck() {
  assert.equal(concentration([1, 1, 1, 1]).normalizedEntropy, 1);
  assert.equal(concentration([4, 0, 0, 0]).normalizedEntropy, 0);
  assert.equal(componentCount(Uint8Array.from([1, 0, 0, 1]), 2, 2), 1);
  assert.equal(componentCount(Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 1]), 3, 1), 2);
  assert.deepEqual(Array.from(persistentMask(Array.from({ length: 30 }, () => Uint8Array.from([1, 0])))), [1, 0]);
  assert.equal(persistentMask(Array(29).fill(Uint8Array.from([1]))), null);
  assert.deepEqual(graphSummary({ centerline: [0, 1, 2, 3].map(index => ({ index })), edges: [[0, 1], [1, 2], [1, 3]] }),
    { endpoints: 3, boundaryEndpointBranches: 3, boundaryEndpointCells: [0, 2, 3], junctionClusters: 1, centerlineNodes: 4 });
  const ages = new Map();
  for (let second = 1; second <= 20; second += 1) {
    assert.deepEqual(trackPersistentEndpoints(ages, [7], second).persistentCells, []);
  }
  assert.deepEqual(trackPersistentEndpoints(ages, [7], 21).persistentCells, [7]);
  assert.deepEqual(trackPersistentEndpoints(ages, [], 22), { ages: [], persistentCells: [] });
  assert.deepEqual(trackPersistentEndpoints(ages, [7], 23), { ages: [{ cell: 7, ageSeconds: 0 }], persistentCells: [] });
  assert.deepEqual(trackPersistentEndpoints(ages, [7], 25), { ages: [{ cell: 7, ageSeconds: 0 }], persistentCells: [] });
  console.log('ant-founder-evidence selfcheck passed');
}
