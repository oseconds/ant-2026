import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const AUTHORITY = '301f0740c9fe2e0697e31a716f7226cb2112ede7';
const SEEDS = ['20261005', '20261006', '20261007'];
const ARMS = ['isotropic', 'outgoingFlow'];
const SOURCE = 'src/lib/agents/ant/AntController.js';
const SOURCES = [
  SOURCE, 'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/LocalOccupancy.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GaitController.js',
  'src/lib/agents/ant/BodyPoseController.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/ColonyActivation.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/renderers/AntRenderer.js'
];
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-31-recruitment-heading-flow-vs-isotropic/analysis');
const DT = 1 / 60;
const TICKS = 600 * 60;
const CENTER = Object.freeze({ x: 0.5, y: 0.72 });
const INNER = 0.018;
const OUTER = 0.085;
const MIN_SPEED = 0.008;
const MIN_ANTS = 3;
const MIN_RESULTANT = 1e-9;
const PI = Math.PI;
const TAU = 2 * PI;
const TIMES = new Set([60, 120, 300, 600]);
const CLI = new Map(process.argv.slice(2).map(arg => {
  const i = arg.indexOf('=');
  return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  assert.equal(await gitHead(), AUTHORITY, 'run must start at the exact production authority');
  assert.equal(await gitRef('refs/remotes/origin/main'), AUTHORITY, 'origin/main must match the authority');
  await mkdir(OUTPUT, { recursive: true });
  const sourceHashes = await hashSources();
  verifyLockedSource(await readFile(resolve(ROOT, SOURCE), 'utf8'));
  const runs = [];
  for (const seed of SEEDS) {
    for (const arm of ARMS) {
      const run = await runWorld(seed, arm, sourceHashes);
      runs.push(run);
      const out = resolve(OUTPUT, 'seed-' + seed + '-' + arm + '.json');
      await writeFile(out, JSON.stringify(run) + '\n');
      console.log(JSON.stringify({
        seed, arm, accepted: run.spawn.accepted, flowConditioned: run.spawn.flowConditioned,
        flowFraction: run.spawn.flowConditioned / run.spawn.accepted,
        blockedPlacementCalls: run.spawn.blockedPlacementCalls,
        finalPopulation: run.final.population, finalRngCalls: run.rng.calls
      }));
    }
  }
  assert.deepEqual(await hashSources(), sourceHashes, 'locked production and renderer sources changed during the runs');
  const summary = summarizeAll(runs, sourceHashes);
  await writeFile(resolve(OUTPUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ complete: true, runs: runs.length, output: OUTPUT }));
}

async function runWorld(seed, arm, sourceHashes) {
  const { AntController, originalSourceHash, transformedSourceHash } = await makeControllerClass(arm);
  const rng = countedLcg(Number(seed));
  const controller = new AntController({ random: rng.random });
  const ctx = {
    arm, seed, rng, controller, events: [], previousSegments: new Map(), frames: [], captures: [],
    transport: [],
    previousFramePositions: new Map(), pendingHeading: null, retryPending: false,
    lastFrameSpawned: 0, lastFrameRetired: 0,
    measureCurrentFlow() {
      const live = new Set(this.controller.agents.map(agent => agent.id));
      return measureFlow([...this.previousSegments.values()].filter(segment => live.has(segment.id)));
    },
    spawn: {
      initializationCalls: 0, scheduledOpportunities: 0, retryCalls: 0,
      accepted: 0, flowConditioned: 0, isotropicFallback: 0, isotropicControl: 0, blockedPlacementCalls: 0,
      placementAttempts: 0, clearanceRejectedPositions: 0, retryRecoveries: 0,
      capacitySuppressedCalls: 0, retryPendingAt600s: false
    },
    activeAntSeconds: 0, activeAntSecondsByWindow: Array(10).fill(0), sameFlowAntTicks: 0, capacityLimitedTicks: 0,
    contactEvents: 0, contactLegs: 0, plateBirths: [], noduleBirths: [],
    invariants: { nonFiniteAgentTicks: 0, outOfDomainAgentTicks: 0, minimumSampledSeparation: Infinity, sampledPairOverlaps: 0 },
    errors: [], windowCounters: newWindowCounters()
  };
  Object.defineProperty(controller, '__headingResearch', { value: ctx });
  installWorldObservers(controller, ctx);
  const started = performance.now();
  await controller.init();
  ctx.lastFrameSpawned = controller.totalSpawned;
  assert.equal(ctx.events.length, 1, 'initial accepted spawn must be measured');
  assert.equal(ctx.events[0].timeSeconds, 0);
  assert.equal(ctx.events[0].N, 0, 'initial spawn has no completed movement segments');
  assert.equal(ctx.events[0].lawUsed, arm === 'outgoingFlow' ? 'isotropic-fallback' : 'isotropic-control');
  assert.equal(ctx.events[0].heading, isotropic(ctx.events[0].U));

  for (let tick = 1; tick <= TICKS; tick += 1) {
    controller.tick(DT);
    if (tick % 3600 === 0) {
      console.log(JSON.stringify({
        seed, arm, seconds: tick / 60, population: controller.agents.length,
        elapsedWallSeconds: (performance.now() - started) / 1000
      }));
    }
  }
  assert.ok(Math.abs(controller.simulationTimeMs - 600000) < 1e-6, 'exact 600 model seconds');
  assert.equal(controller.materialLocomotionResistance, true, 'production material resistance stays enabled');
  assert.equal(controller.audioBridge, null, 'Audio Off; no audio bridge created');
  assert.equal(ctx.events.length, controller.totalSpawned, 'one event per accepted spawn');
  assert.equal(ctx.spawn.accepted, controller.totalSpawned);
  assert.equal(ctx.spawn.flowConditioned + ctx.spawn.isotropicFallback + ctx.spawn.isotropicControl, ctx.spawn.accepted);
  assert.ok(ctx.events.every(event => event.headingDrawCalls === 1), 'one existing heading draw per accepted spawn');
  assert.ok(ctx.events.every(event => event.positionRadius <= 0.018 + 1e-12), 'all accepted positions stay in the fixed disk');
  assert.ok(ctx.events.every(event => Number.isFinite(event.heading)), 'all applied headings are finite');
  assert.equal(ctx.frames.length, 600, 'one fixed sample per nominal second');
  assert.equal(ctx.captures.length, 4, 'fixed renderer captures at 60, 120, 300, 600 seconds');
  assert.equal(ctx.errors.length, 0, 'no controller errors');
  for (const record of ctx.transport) {
    for (const key of ['0.5s', '1.0s']) {
      if (record.horizons[key]) continue;
      record.horizons[key] = {
        status: record.retirementStatus || 'right-censored-at-600s',
        censoredAtSeconds: record.retiredAtSeconds ?? 600
      };
    }
  }
  const final = summarizeFinal(controller);
  const result = {
    seed, arm, authority: AUTHORITY, seconds: 600, ticks: TICKS, dtSeconds: DT,
    sourceHashes, originalControllerSha256: originalSourceHash,
    transformedControllerSha256: transformedSourceHash,
    spawn: {
      ...ctx.spawn,
      flowConditionedFraction: ctx.spawn.flowConditioned / ctx.spawn.accepted,
      placementCalls: ctx.spawn.initializationCalls + ctx.spawn.scheduledOpportunities + ctx.spawn.retryCalls,
      retryPendingAt600s: ctx.retryPending && controller.nextSpawnTimeMs !== null,
      nextSpawnTimeMsAt600s: controller.nextSpawnTimeMs
    },
    rng: { calls: rng.calls, finalState: rng.state() },
    activity: {
      activeAntSeconds: ctx.activeAntSeconds,
      activeAntSecondsBy60sWindow: ctx.activeAntSecondsByWindow,
      sameFlowAntTicks: ctx.sameFlowAntTicks,
      capacityLimitedTicks: ctx.capacityLimitedTicks,
      footContactEvents: ctx.contactEvents,
      footContactLegs: ctx.contactLegs,
      plateBirthEvents: ctx.plateBirths.length,
      noduleBirthEvents: ctx.noduleBirths.length
    },
    invariants: {
      ...ctx.invariants,
      minimumSampledSeparation: Number.isFinite(ctx.invariants.minimumSampledSeparation)
        ? ctx.invariants.minimumSampledSeparation : null
    },
    spawns: ctx.events,
    treatmentRecruitTransport: ctx.transport,
    frames: ctx.frames,
    windows: summarizeWindows(ctx.frames, ctx.events, ctx.windowCounters),
    captures: ctx.captures,
    plateBirths: ctx.plateBirths,
    noduleBirths: ctx.noduleBirths,
    final,
    wallSeconds: (performance.now() - started) / 1000
  };
  assert.equal(result.spawn.accepted, result.spawns.length);
  assert.equal(result.activity.plateBirthEvents, result.plateBirths.length);
  assert.equal(result.activity.noduleBirthEvents, result.noduleBirths.length);
  await controller.destroy();
  return result;
}

function installWorldObservers(controller, ctx) {
  const originalTick = controller.tick;
  controller.tick = function (dt) {
    const beforeAgents = new Map(this.agents.map(agent => [agent.id, { x: agent.x, y: agent.y }]));
    const populationAtEntry = this.agents.length;
    const recruitmentLimitAtEntry = this.recruitmentLimit;
    const result = originalTick.call(this, dt);
    if (this.agents.some(agent => ![agent.x, agent.y, agent.vx, agent.vy, agent.heading].every(Number.isFinite))) {
      ctx.invariants.nonFiniteAgentTicks += 1;
    }
    if (this.agents.some(agent => agent.x < 0 || agent.x > 1 || agent.y < 0 || agent.y > 1)) {
      ctx.invariants.outOfDomainAgentTicks += 1;
    }
    const tickNumber = Math.round(this.simulationTimeMs / (dt * 1000));
    ctx.activeAntSeconds += populationAtEntry * dt;
    ctx.activeAntSecondsByWindow[tickWindow(this.simulationTimeMs / 1000)] += populationAtEntry * dt;
    ctx.windowCounters[tickWindow(this.simulationTimeMs / 1000)].activeAntSeconds += populationAtEntry * dt;
    if (populationAtEntry >= recruitmentLimitAtEntry) ctx.capacityLimitedTicks += 1;
    ctx.windowCounters.pendingCapacityLimitedTicks += populationAtEntry >= recruitmentLimitAtEntry ? 1 : 0;
    const segments = new Map();
    for (const agent of this.agents) {
      const from = beforeAgents.get(agent.id);
      if (!from) continue;
      segments.set(agent.id, {
        id: agent.id, from, to: { x: agent.x, y: agent.y }, dt,
        dx: agent.x - from.x, dy: agent.y - from.y
      });
    }
    ctx.previousSegments = segments;
    const nowSecond = tickNumber / 60;
    const liveById = new Map(this.agents.map(agent => [agent.id, agent]));
    for (const record of ctx.transport) {
      if (record.retiredAtSeconds !== null) continue;
      const agent = liveById.get(record.id);
      if (!agent) {
        record.retiredAtSeconds = nowSecond;
        record.retirementStatus = 'retired-or-removed-before-horizon';
        continue;
      }
      for (const [key, horizonTicks] of [['0.5s', 30], ['1.0s', 60]]) {
        if (record.horizons[key] || tickNumber - record.birthTick < horizonTicks) continue;
        const dx = agent.x - record.x, dy = agent.y - record.y;
        record.horizons[key] = {
          status: 'observed', dx, dy, euclideanDisplacement: Math.hypot(dx, dy),
          projectedDisplacementAlongBirthQ: dx * Math.cos(record.phi) + dy * Math.sin(record.phi),
          observedAtSeconds: nowSecond
        };
      }
    }
    if (tickNumber % 60 === 0) {
      const flow = measureFlow([...segments.values()]);
      const frame = describeFrame(this, ctx, nowSecond, flow);
      ctx.frames.push(frame);
      ctx.windowCounters[tickWindow(nowSecond)].sameFlowAntTicks += ctx.windowCounters.pendingSameFlowAntTicks;
      ctx.windowCounters.pendingSameFlowAntTicks = 0;
      ctx.windowCounters[tickWindow(nowSecond)].capacityLimitedTicks += ctx.windowCounters.pendingCapacityLimitedTicks;
      ctx.windowCounters.pendingCapacityLimitedTicks = 0;
      if (TIMES.has(nowSecond)) ctx.captures.push(makeRenderCapture(this, nowSecond));
      ctx.previousFramePositions = new Map(this.agents.map(agent => [agent.id, { x: agent.x, y: agent.y }]));
      ctx.lastFrameSpawned = this.totalSpawned;
      ctx.lastFrameRetired = this.totalRetired;
    }
    return result;
  };

  const originalSpawn = controller.spawnNextAnt;
  controller.spawnNextAnt = function (...args) {
    const callTime = this.simulationTimeMs;
    const spawnTimeSeconds = Math.round(callTime / (DT * 1000)) * DT;
    const retry = ctx.retryPending;
    if (callTime === 0 && this.totalSpawned === 0) ctx.spawn.initializationCalls += 1;
    else if (retry) ctx.spawn.retryCalls += 1;
    else ctx.spawn.scheduledOpportunities += 1;
    const agents = this.agents;
    const ownSome = Object.getOwnPropertyDescriptor(agents, 'some');
    const baseSome = agents.some;
    let attempts = 0, rejected = 0;
    Object.defineProperty(agents, 'some', {
      configurable: true, writable: true,
      value: function (...someArgs) {
        attempts += 1;
        const didReject = baseSome.apply(this, someArgs);
        if (didReject) rejected += 1;
        return didReject;
      }
    });
    ctx.pendingHeading = null;
    let accepted;
    try { accepted = originalSpawn.apply(this, args); }
    finally {
      if (ownSome) Object.defineProperty(agents, 'some', ownSome);
      else delete agents.some;
    }
    ctx.spawn.placementAttempts += attempts;
    ctx.spawn.clearanceRejectedPositions += rejected;
    if (accepted) {
      const agent = this.agents.at(-1);
      const pending = ctx.pendingHeading;
      assert.ok(pending, 'accepted spawn must consume exactly one measured heading variate');
      assert.equal(agent.heading, pending.heading);
      const event = {
        id: agent.id, timeSeconds: spawnTimeSeconds, x: agent.x, y: agent.y,
        positionRadius: Math.hypot(agent.x - CENTER.x, agent.y - CENTER.y),
        placementAttempts: attempts, rejectedPositions: rejected,
        trigger: callTime === 0 ? 'initialization' : retry ? 'retry-recovery' : 'scheduled',
        ...pending,
        qAngularError: pending.lawUsed === 'flow-conditioned'
          ? Math.abs(angleDelta(pending.phi, agent.heading)) : null
      };
      const expectedHeading = pending.lawUsed === 'flow-conditioned'
        ? wrap(pending.phi + (2 * pending.U - 1) * pending.appliedHalfSpread)
        : isotropic(pending.U);
      assert.equal(agent.heading, expectedHeading, 'accepted heading must match its locked arm transform');
      ctx.events.push(event);
      ctx.spawn.accepted += 1;
      if (pending.lawUsed === 'flow-conditioned') ctx.spawn.flowConditioned += 1;
      else if (pending.lawUsed === 'isotropic-control') ctx.spawn.isotropicControl += 1;
      else ctx.spawn.isotropicFallback += 1;
      if (retry) ctx.spawn.retryRecoveries += 1;
      ctx.retryPending = false;
      ctx.windowCounters[spawnWindow(spawnTimeSeconds)].acceptedSpawns += 1;
      if (pending.lawUsed === 'flow-conditioned') ctx.windowCounters[spawnWindow(spawnTimeSeconds)].flowConditionedSpawns += 1;
      else if (pending.lawUsed === 'isotropic-control') ctx.windowCounters[spawnWindow(spawnTimeSeconds)].isotropicControlSpawns += 1;
      else ctx.windowCounters[spawnWindow(spawnTimeSeconds)].fallbackSpawns += 1;
      if (pending.lawUsed === 'flow-conditioned') ctx.transport.push({
        id: agent.id, timeSeconds: spawnTimeSeconds, birthTick: Math.round(callTime / (DT * 1000)),
        x: agent.x, y: agent.y, phi: pending.phi,
        horizons: { '0.5s': null, '1.0s': null },
        retiredAtSeconds: null, retirementStatus: null
      });
    } else if (attempts === 12) {
      ctx.spawn.blockedPlacementCalls += 1;
      ctx.retryPending = true;
      ctx.windowCounters[spawnWindow(spawnTimeSeconds)].blockedPlacementCalls += 1;
    } else if (attempts === 0 && this.agents.length >= this.recruitmentLimit) {
      ctx.spawn.capacitySuppressedCalls += 1;
    }
    return accepted;
  };

  const originalSense = controller.occupancy.sense;
  controller.occupancy.sense = function (...args) {
    const sensed = originalSense.apply(this, args);
    if (Number.isFinite(sensed.followingSpeedLimit)) {
      ctx.sameFlowAntTicks += 1;
      ctx.windowCounters.pendingSameFlowAntTicks += 1;
    }
    return sensed;
  };

  controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') {
      ctx.contactEvents += 1;
      ctx.contactLegs += Array.isArray(payload?.contacts) ? payload.contacts.length : 0;
      ctx.windowCounters.pendingFootContactEvents += 1;
      ctx.windowCounters.pendingFootContactLegs += Array.isArray(payload?.contacts) ? payload.contacts.length : 0;
    } else if (type === 'plate-birth') {
      ctx.plateBirths.push({ timeSeconds: payload.bornAtSimulationTimeMs / 1000, id: payload.id });
      ctx.windowCounters.pendingPlateBirths += 1;
    } else if (type === 'sphere-birth') {
      ctx.noduleBirths.push({ timeSeconds: payload.bornAtSimulationTimeMs / 1000, id: payload.id });
      ctx.windowCounters.pendingNoduleBirths += 1;
    } else if (type === 'error') ctx.errors.push(payload);
  });
}

export async function makeControllerClass(arm) {
  const file = resolve(ROOT, SOURCE);
  const original = await readFile(file, 'utf8');
  const exact = 'SPAWN_HEADING + signed(this.random) * SPAWN_HEADING_SPREAD';
  assert.equal(original.split(exact).length - 1, 1, 'production accepted-heading expression must occur exactly once');
  const replacement = '__researchHeading(this, SPAWN_HEADING, SPAWN_HEADING_SPREAD, () => this.random())';
  const imports = original.replace(/from\s+(['"])(\.\/[^'"]+)\1/g,
    (_all, quote, specifier) => 'from ' + quote + pathToFileURL(resolve(dirname(file), specifier)).href + quote);
  const transformed = imports.replace(exact, replacement);
  const helper = [
    'const __researchArm = ' + JSON.stringify(arm) + ';',
    'function wrap(value) { return ((value + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; }',
    'function __researchHeading(controller, center, spread, drawNext) {',
    '  const context = controller.__headingResearch;',
    '  if (!context || context.pendingHeading) throw new Error(\"missing or duplicate heading context\");',
    '  const flow = context.measureCurrentFlow();',
    '  const rngStateBefore = context.rng.state();',
    '  const rngCallsBefore = context.rng.calls;',
    '  const U = drawNext();',
    '  if (context.rng.calls !== rngCallsBefore + 1) throw new Error(\"heading must consume exactly one existing uniform draw\");',
    '  let heading, appliedHalfSpread, lawUsed;',
    '  if (__researchArm === \"outgoingFlow\" && flow.available) {',
    '    appliedHalfSpread = Math.PI - (Math.PI - spread) * flow.R;',
    '    heading = wrap(flow.phi + (2 * U - 1) * appliedHalfSpread);',
    '    lawUsed = \"flow-conditioned\";',
    '  } else {',
    '    appliedHalfSpread = Math.PI;',
    '    heading = -Math.PI + 2 * Math.PI * U;',
    '    lawUsed = __researchArm === \"outgoingFlow\" ? \"isotropic-fallback\" : \"isotropic-control\";',
    '  }',
    '  context.pendingHeading = { N: flow.N, qx: flow.qx, qy: flow.qy, R: flow.R, phi: flow.phi,',
    '    diagnosticW: flow.w, available: flow.available, U, heading, appliedHalfSpread, lawUsed,',
    '    rngStateBeforeHeading: rngStateBefore, rngStateAfterHeading: context.rng.state(),',
    '    rngCallsBeforeHeading: rngCallsBefore, rngCallsAfterHeading: context.rng.calls, headingDrawCalls: 1 };',
    '  return heading;',
    '}'
  ].join('\n') + '\n';
  const module = await import('data:text/javascript;base64,' + Buffer.from(helper + transformed).toString('base64'));
  return {
    AntController: module.AntController,
    originalSourceHash: sha256(original),
    transformedSourceHash: sha256(helper + transformed)
  };
}

function measureFlow(segments) {
  const eligible = [];
  for (const segment of segments) {
    const dx = segment.dx, dy = segment.dy;
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    const midpointX = (segment.from.x + segment.to.x) * 0.5;
    const midpointY = (segment.from.y + segment.to.y) * 0.5;
    const rx = midpointX - CENTER.x, ry = midpointY - CENTER.y;
    const radius = Math.hypot(rx, ry);
    const speed = length / segment.dt;
    if (!(radius > INNER && radius <= OUTER && speed >= MIN_SPEED && rx * dx + ry * dy > 0)) continue;
    eligible.push({ id: segment.id, ux: dx / length, uy: dy / length, speed, midpointRadius: radius });
  }
  const N = eligible.length;
  if (N < MIN_ANTS) return { N, qx: null, qy: null, R: null, phi: null, w: null, available: false };
  const qx = eligible.reduce((sum, item) => sum + item.ux, 0) / N;
  const qy = eligible.reduce((sum, item) => sum + item.uy, 0) / N;
  const R = Math.hypot(qx, qy);
  const available = R > MIN_RESULTANT;
  return {
    N, qx, qy, R, phi: available ? Math.atan2(qy, qx) : null,
    w: PI - (PI - 0.3) * R, available
  };
}

function describeFrame(controller, ctx, timeSeconds, flow) {
  const agents = controller.agents.map(agent => ({ id: agent.id, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy }));
  const count = agents.length;
  const centroid = count ? {
    x: agents.reduce((sum, item) => sum + item.x, 0) / count,
    y: agents.reduce((sum, item) => sum + item.y, 0) / count
  } : null;
  const covariance = count && centroid ? agents.reduce((out, item) => {
    const x = item.x - centroid.x, y = item.y - centroid.y;
    out.xx += x * x / count; out.xy += x * y / count; out.yy += y * y / count;
    return out;
  }, { xx: 0, xy: 0, yy: 0 }) : null;
  const radialCounts = [0, 0, 0, 0], sectors = Array(16).fill(0), space = Array(64).fill(0);
  let south = 0, travel = 0, movementN = 0, px = 0, py = 0, speed = 0;
  for (const agent of agents) {
    if (agent.y > CENTER.y) south += 1;
    const r = Math.hypot(agent.x - CENTER.x, agent.y - CENTER.y);
    radialCounts[r <= 0.06 ? 0 : r <= 0.09 ? 1 : r <= 0.12 ? 2 : 3] += 1;
    const angle = (Math.atan2(agent.y - CENTER.y, agent.x - CENTER.x) + TAU) % TAU;
    sectors[Math.floor(angle / TAU * 16) % 16] += 1;
    const cellX = Math.min(7, Math.floor(agent.x * 8)), cellY = Math.min(7, Math.floor(agent.y * 8));
    space[cellY * 8 + cellX] += 1;
    const previous = ctx.previousFramePositions.get(agent.id);
    if (previous) {
      const dx = agent.x - previous.x, dy = agent.y - previous.y, distance = Math.hypot(dx, dy);
      travel += distance; movementN += 1; speed += distance;
      if (distance > 0) { px += dx / distance; py += dy / distance; }
    }
  }
  const pheromone = pheromoneSummary(controller.field);
  const signal = { ...flow };
  const row = {
    timeSeconds, population: count, totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
    admissionsThisSecond: controller.totalSpawned - ctx.lastFrameSpawned,
    retirementsThisSecond: controller.totalRetired - ctx.lastFrameRetired,
    centroid, covariance, dispersion: covariance ? Math.sqrt(covariance.xx + covariance.yy) : null,
    fractionSouthOfEntrance: count ? south / count : null,
    angularOccupancy: sectors.map(value => count ? value / count : 0),
    radialOccupancy: radialCounts.map(value => count ? value / count : 0),
    spatialOccupancy8x8: space.map(value => count ? value / count : 0),
    velocityPolarization: movementN ? { x: px / movementN, y: py / movementN,
      magnitude: Math.hypot(px, py) / movementN, angle: Math.hypot(px, py) > 1e-12 ? Math.atan2(py, px) : null } : null,
    realizedTravelPerAntSecond: movementN ? travel / movementN : null,
    meanRealizedSpeed: movementN ? speed / movementN : null,
    stationaryFraction: count ? agents.filter(agent => Math.hypot(agent.vx, agent.vy) < 0.008).length / count : null,
    minimumSeparation: minimumSeparation(agents),
    pairsBelowBodyDiameter: overlappingPairs(agents),
    diagnosticOutgoingFlow: signal,
    pheromone, sameFlowAntTicks: ctx.windowCounters.pendingSameFlowAntTicks,
    capacityLimitedTicks: ctx.windowCounters.pendingCapacityLimitedTicks,
    capacityLimited: count >= controller.recruitmentLimit,
    footContactEvents: ctx.windowCounters.pendingFootContactEvents,
    footContactLegs: ctx.windowCounters.pendingFootContactLegs,
    plateBirths: ctx.windowCounters.pendingPlateBirths,
    noduleBirths: ctx.windowCounters.pendingNoduleBirths
  };
  if (Number.isFinite(row.minimumSeparation)) {
    ctx.invariants.minimumSampledSeparation = Math.min(ctx.invariants.minimumSampledSeparation, row.minimumSeparation);
  }
  ctx.invariants.sampledPairOverlaps += row.pairsBelowBodyDiameter;
  const window = tickWindow(timeSeconds);
  ctx.windowCounters[window].flowFrames += 1;
  ctx.windowCounters[window].availableFlowFrames += Number(flow.available);
  ctx.windowCounters[window].eligibleN[flow.N] = (ctx.windowCounters[window].eligibleN[flow.N] || 0) + 1;
  ctx.windowCounters[window].flowSamples.push(flow);
  ctx.windowCounters[window].pheromoneTotal += pheromone.sampledSectorTotal;
  ctx.windowCounters[window].pheromoneConcentration += pheromone.directionalConcentration;
  ctx.windowCounters[window].populationSum += count;
  ctx.windowCounters[window].populationFrames += 1;
  if (timeSeconds % 60 === 0) {
    row.material = materialSummary(controller);
    row.surface = surfaceSummary(controller.surfaceField);
    row.pheromone.nodeSum = arraySum(controller.field.values);
    row.pheromone.reconstructedIntegral = trapezoidIntegral(controller.field.values, controller.field.width, controller.field.height);
    row.buriedLayerHistory = {
      buriedLayerCellCount: row.material.buriedLayerCellCount,
      maxColumnLayerCount: row.material.maxColumnLayerCount,
      exposedCellCount: row.material.exposedCellCount,
      totalPlateCount: row.material.plateCount,
      noduleCount: row.material.noduleCount
    };
  }
  ctx.windowCounters.pendingFootContactEvents = 0;
  ctx.windowCounters.pendingFootContactLegs = 0;
  ctx.windowCounters.pendingPlateBirths = 0;
  ctx.windowCounters.pendingNoduleBirths = 0;
  return row;
}

function pheromoneSummary(field) {
  const radii = [0.06, 0.09, 0.12], sectors = Array(16).fill(0);
  let vectorX = 0, vectorY = 0, total = 0;
  for (let sector = 0; sector < 16; sector += 1) {
    const angle = TAU * sector / 16;
    let value = 0;
    for (const radius of radii) value += field.sample(CENTER.x + Math.cos(angle) * radius,
      CENTER.y + Math.sin(angle) * radius);
    sectors[sector] = value;
    total += value;
    vectorX += value * Math.cos(angle);
    vectorY += value * Math.sin(angle);
  }
  const magnitude = Math.hypot(vectorX, vectorY);
  return { sampledSectorTotal: total, sampledSectorMean: total / 48,
    directionalConcentration: total ? magnitude / total : null,
    direction: magnitude > 0 ? Math.atan2(vectorY, vectorX) : null, sectors };
}

function materialSummary(controller) {
  const snapshot = controller.materialStratigraphy.getSnapshot();
  const layers = snapshot.stratigraphy.layerCountByCell;
  let occupied = 0, buried = 0, maxLayers = 0, xSum = 0, ySum = 0;
  const width = snapshot.width, height = snapshot.height;
  for (let index = 0; index < layers.length; index += 1) {
    const value = layers[index];
    if (!value) continue;
    occupied += 1; buried += value - 1; maxLayers = Math.max(maxLayers, value);
    xSum += (index % width) / (width - 1);
    ySum += Math.floor(index / width) / (height - 1);
  }
  return {
    width, height, plateCount: snapshot.layers.plateCount, noduleCount: snapshot.layers.noduleCount,
    occupiedCells: occupied, unionCoverage: occupied / layers.length,
    unionCentroid: occupied ? { x: xSum / occupied, y: ySum / occupied } : null,
    exposedCellCount: snapshot.layers.exposedCellCount,
    buriedLayerCellCount: snapshot.layers.buriedLayerCellCount,
    maxColumnLayerCount: snapshot.layers.maxColumnLayerCount,
    platesWithBuriedHistory: snapshot.stratigraphy.plateHistory.filter(item => item.buriedCellCount > 0).length,
    plateHistory: snapshot.stratigraphy.plateHistory.map(item => ({
      id: item.id, ageSeconds: item.ageMs / 1000, exposedCellCount: item.exposedCellCount,
      buriedCellCount: item.buriedCellCount, maxBurialLayerCount: item.maxBurialLayerCount
    }))
  };
}

function surfaceSummary(surface) {
  const values = surface.values;
  let sum = 0, max = 0, occupied = 0, xSum = 0, ySum = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]; sum += value; max = Math.max(max, value);
    if (value > 0) {
      occupied += 1; xSum += (index % surface.width) / (surface.width - 1);
      ySum += Math.floor(index / surface.width) / (surface.height - 1);
    }
  }
  return {
    width: surface.width, height: surface.height, totalFootContacts: surface.totalFootContacts,
    sum, mean: sum / values.length, max, occupiedCells: occupied, coverage: occupied / values.length,
    centroid: occupied ? { x: xSum / occupied, y: ySum / occupied } : null
  };
}

function makeRenderCapture(controller, seconds) {
  const agents = controller.agents.map(agent => ({
    ...agent.getSnapshot(),
    gait: controller.gaitController.getSnapshot(agent),
    bodyPose: controller.bodyPoseController.getSnapshot(agent)
  }));
  const material = controller.materialStratigraphy.getSnapshot();
  return {
    seconds,
    agents,
    stratigraphy: {
      width: material.width, height: material.height, revision: material.revision,
      stratigraphy: {
        topLayerByCell: Array.from(material.stratigraphy.topLayerByCell),
        layerCountByCell: Array.from(material.stratigraphy.layerCountByCell)
      }
    }
  };
}

function summarizeWindows(frames, spawns, counters) {
  return Array.from({ length: 10 }, (_, index) => {
    const windowFrames = frames.filter(frame => tickWindow(frame.timeSeconds) === index);
    const flowSpawns = spawns.filter(event => spawnWindow(event.timeSeconds) === index);
    const flows = windowFrames.map(frame => frame.diagnosticOutgoingFlow);
    const available = flows.filter(flow => flow.available);
    const availableSpawns = flowSpawns.filter(event => event.available);
    const conditionedSpawns = flowSpawns.filter(event => event.lawUsed === 'flow-conditioned');
    const frameAngles = available.map(flow => flow.phi);
    const spawnAngles = availableSpawns.map(event => event.phi);
    const key = Object.keys(counters).find(item => item === String(index));
    const materialFrames = windowFrames.filter(frame => frame.material);
    return {
      startSeconds: index * 60, endSeconds: (index + 1) * 60,
      oneHzFrames: windowFrames.length,
      availableFlowFrames: available.length,
      flowFrameAvailability: windowFrames.length ? available.length / windowFrames.length : null,
      meanEligibleN: mean(flows.map(flow => flow.N)),
      eligibleNDistribution: distribution(flows.map(flow => flow.N)),
      RDistributionWhenNAtLeast3: distribution(flows.filter(flow => flow.R !== null).map(flow => flow.R)),
      hypotheticalWDistribution: distribution(flows.filter(flow => flow.w !== null).map(flow => flow.w)),
      circularMeanPhi: circularSummary(frameAngles),
      spawnEvents: flowSpawns.length,
      admissions: flowSpawns.length,
      retirements: windowFrames.reduce((sum, frame) => sum + frame.retirementsThisSecond, 0),
      availableAtAcceptedSpawns: availableSpawns.length,
      flowConditionedSpawns: conditionedSpawns.length,
      flowConditionedSpawnFraction: flowSpawns.length ? conditionedSpawns.length / flowSpawns.length : null,
      spawnCircularMeanPhi: circularSummary(spawnAngles),
      appliedWDistribution: distribution(flowSpawns.map(event => event.appliedHalfSpread)),
      fallbackSpawns: flowSpawns.filter(event => event.lawUsed === 'isotropic-fallback').length,
      isotropicControlSpawns: flowSpawns.filter(event => event.lawUsed === 'isotropic-control').length,
      blockedPlacementCalls: counters[index]?.blockedPlacementCalls || 0,
      activeAntSeconds: counters[index]?.activeAntSeconds || 0,
      populationMean: windowFrames.length ? mean(windowFrames.map(frame => frame.population)) : null,
      capacityLimitedTicks: counters[index]?.capacityLimitedTicks || 0,
      sameFlowAntTicks: counters[index]?.sameFlowAntTicks || 0,
      footContactEvents: windowFrames.reduce((sum, frame) => sum + frame.footContactEvents, 0),
      footContactLegs: windowFrames.reduce((sum, frame) => sum + frame.footContactLegs, 0),
      plateBirths: windowFrames.reduce((sum, frame) => sum + frame.plateBirths, 0),
      noduleBirths: windowFrames.reduce((sum, frame) => sum + frame.noduleBirths, 0),
      pheromoneMeanSampledSectorTotal: windowFrames.length ? mean(windowFrames.map(frame => frame.pheromone.sampledSectorTotal)) : null,
      pheromoneMeanDirectionalConcentration: windowFrames.length ? mean(windowFrames.map(frame => frame.pheromone.directionalConcentration ?? 0)) : null,
      materialAtWindowEnd: materialFrames.at(-1)?.material || null,
      surfaceAtWindowEnd: materialFrames.at(-1)?.surface || null,
      counterWindowKey: key
    };
  });
}

function summarizeAll(runs, sourceHashes) {
  const byKey = new Map(runs.map(run => [run.seed + ':' + run.arm, run]));
  const paired = SEEDS.map(seed => {
    const control = byKey.get(seed + ':isotropic');
    const treatment = byKey.get(seed + ':outgoingFlow');
    return {
      seed,
      isotropic: summarizeLate(control),
      outgoingFlow: summarizeLate(treatment),
      deltaFlowMinusIsotropic: compareLate(control, treatment),
      treatmentActivation: {
        accepted: treatment.spawn.accepted,
        flowConditioned: treatment.spawn.flowConditioned,
        fractionFlowConditioned: treatment.spawn.flowConditionedFraction,
        fallback: treatment.spawn.isotropicFallback,
        shortHorizonTransport: summarizeTransport(treatment.treatmentRecruitTransport)
      },
      treatmentWindows: treatment.windows.map(window => ({
        startSeconds: window.startSeconds, flowFrames: window.availableFlowFrames,
        oneHzFrames: window.oneHzFrames, flowFraction: window.flowFrameAvailability,
        flowConditionedSpawns: window.flowConditionedSpawns,
        spawnEvents: window.spawnEvents, circularMeanPhi: window.circularMeanPhi
      }))
    };
  });
  return {
    authority: AUTHORITY,
    arms: {
      CONTROL: 'isotropic accepted-spawn heading: theta = -pi + 2*pi*U',
      TREATMENT: 'outgoing-flow q when available; exact isotropic fallback otherwise; q is measured in this treatment world'
    },
    conditions: {
      seeds: SEEDS, seconds: 600, ticks: TICKS, dtSeconds: DT, audio: 'Off; no audio bridge constructed',
      production: 'retained-material desired-speed resistance + A turn ceiling + D same-flow headway + G pheromone + current movement, recruitment, TrailPlateBirth, stratigraphy',
      fixedSpawn: { center: CENTER, radius: INNER, interval: 'production default', placementAttempts: 12, clearance: 0.004 },
      flowDefinition: {
        segment: 'previous completed 1/60-second tick, from actual post-collision positions, one per existing live ant',
        midpointAnnulus: '0.018 < r <= 0.085',
        realizedSpeedMinimum: 0.008,
        outward: 'strictly increasing distance from SPAWN_CENTER; midpoint radial dot segment displacement > 0',
        minimumN: MIN_ANTS, q: 'equal-weight mean of eligible realized segment unit directions',
        unavailable: 'N < 3 or R <= 1e-9',
        treatmentW: 'pi - (pi - 0.3) * R',
        treatmentHeading: 'wrap(phi + (2U - 1) * w)',
        fallback: 'exact same isotropic transform as control'
      },
      rngAndPlacement: 'Runtime transform changes only the accepted heading expression; q is measured before calling the existing heading draw; drawNext forwards the original RNG exactly once. Placement source remains byte-locked.'
    },
    sourceHashes,
    runs: runs.map(run => ({
      seed: run.seed, arm: run.arm, spawn: run.spawn, rng: run.rng,
      acceptedSpawnSignal: summarizeSpawnSignals(run.spawns),
      treatmentRecruitTransport: summarizeTransport(run.treatmentRecruitTransport),
      activity: run.activity, windows: run.windows, late300to600: summarizeLate(run),
      invariants: run.invariants,
      final: run.final, wallSeconds: run.wallSeconds
    })),
    paired,
    measures: {
      serialDependence: 'Within-run time samples are descriptive; seeds are the replication units.',
      lateWindow: 'Nominal one-second samples from 300 through 600 seconds inclusive; 301 observations per run.',
      comparison: 'No outcome threshold was added. Report differences descriptively; visual assets remain for author review.'
    },
    nextDecision: null
  };
}

function summarizeLate(run) {
  const rows = run.frames.filter(row => row.timeSeconds >= 300 && row.timeSeconds <= 600);
  const validCentroid = rows.filter(row => row.centroid);
  const meanAngles = rows.map(row => row.diagnosticOutgoingFlow).filter(item => item.available).map(item => item.phi);
  return {
    nominalSamples: rows.length,
    meanPopulation: mean(rows.map(row => row.population)),
    meanCentroid: validCentroid.length ? {
      x: mean(validCentroid.map(row => row.centroid.x)),
      y: mean(validCentroid.map(row => row.centroid.y))
    } : null,
    meanDispersion: mean(rows.map(row => row.dispersion).filter(Number.isFinite)),
    meanFractionSouthOfEntrance: mean(rows.map(row => row.fractionSouthOfEntrance).filter(Number.isFinite)),
    meanAngularOccupancy: vectorMean(rows.map(row => row.angularOccupancy)),
    meanSpatialOccupancy8x8: vectorMean(rows.map(row => row.spatialOccupancy8x8)),
    meanVelocityPolarizationMagnitude: mean(rows.map(row => row.velocityPolarization?.magnitude).filter(Number.isFinite)),
    meanRealizedTravelPerAntSecond: mean(rows.map(row => row.realizedTravelPerAntSecond).filter(Number.isFinite)),
    meanRealizedSpeed: mean(rows.map(row => row.meanRealizedSpeed).filter(Number.isFinite)),
    meanStationaryFraction: mean(rows.map(row => row.stationaryFraction).filter(Number.isFinite)),
    activeAntSeconds: run.activity.activeAntSecondsBy60sWindow.slice(5).reduce((sum, value) => sum + value, 0),
    meanFlowFrameAvailability: mean(rows.map(row => Number(row.diagnosticOutgoingFlow.available))),
    circularMeanFlowPhi: circularSummary(meanAngles),
    meanPheromoneSampledSectorTotal: mean(rows.map(row => row.pheromone.sampledSectorTotal)),
    meanPheromoneDirectionalConcentration: mean(rows.map(row => row.pheromone.directionalConcentration ?? 0)),
    meanSameFlowAntTicksPerSecond: mean(run.windows.slice(5).map(window => window.sameFlowAntTicks / 60)),
    meanCapacityLimitedSeconds: mean(run.windows.slice(5).map(window => window.capacityLimitedTicks / 60)),
    materialAt600: rows.at(-1)?.material || null,
    surfaceAt600: rows.at(-1)?.surface || null
  };
}

function summarizeSpawnSignals(events) {
  const available = events.filter(event => event.available);
  const conditioned = events.filter(event => event.lawUsed === 'flow-conditioned');
  return {
    acceptedCount: events.length,
    availabilityAtAcceptedSpawns: available.length,
    availableFraction: events.length ? available.length / events.length : null,
    eligibleN: distribution(events.map(event => event.N)),
    RWhenNAtLeast3: distribution(events.filter(event => event.R !== null).map(event => event.R)),
    diagnosticW: distribution(events.filter(event => event.diagnosticW !== null).map(event => event.diagnosticW)),
    appliedHalfSpread: distribution(events.map(event => event.appliedHalfSpread)),
    availableQDirection: circularSummary(available.map(event => event.phi)),
    flowConditionedHeadingQError: distribution(conditioned.map(event => event.qAngularError))
  };
}

function summarizeTransport(records) {
  if (!records?.length) return { recruitCount: 0 };
  const horizon = key => {
    const observed = records.map(record => record.horizons[key]).filter(row => row?.status === 'observed');
    const censored = records.length - observed.length;
    return {
      recruitCount: records.length,
      observed: observed.length,
      censored,
      projectedDisplacementAlongBirthQ: distribution(observed.map(row => row.projectedDisplacementAlongBirthQ)),
      positiveProjectionFraction: observed.length
        ? observed.filter(row => row.projectedDisplacementAlongBirthQ > 0).length / observed.length : null,
      censorStatus: records.reduce((counts, record) => {
        const status = record.horizons[key]?.status || 'missing';
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {})
    };
  };
  return { recruitCount: records.length, '0.5s': horizon('0.5s'), '1.0s': horizon('1.0s') };
}

function compareLate(control, treatment) {
  const c = summarizeLate(control), t = summarizeLate(treatment);
  return {
    centroidDelta: c.meanCentroid && t.meanCentroid ? { x: t.meanCentroid.x - c.meanCentroid.x, y: t.meanCentroid.y - c.meanCentroid.y } : null,
    dispersionDelta: t.meanDispersion - c.meanDispersion,
    southFractionDelta: t.meanFractionSouthOfEntrance - c.meanFractionSouthOfEntrance,
    angularOccupancyL1: vectorL1(t.meanAngularOccupancy, c.meanAngularOccupancy),
    spatialOccupancy8x8L1: vectorL1(t.meanSpatialOccupancy8x8, c.meanSpatialOccupancy8x8),
    velocityPolarizationDelta: t.meanVelocityPolarizationMagnitude - c.meanVelocityPolarizationMagnitude,
    realizedTravelDelta: t.meanRealizedTravelPerAntSecond - c.meanRealizedTravelPerAntSecond,
    realizedSpeedDelta: t.meanRealizedSpeed - c.meanRealizedSpeed,
    stationaryFractionDelta: t.meanStationaryFraction - c.meanStationaryFraction,
    activeAntSecondsDelta: t.activeAntSeconds - c.activeAntSeconds,
    flowAvailabilityDelta: t.meanFlowFrameAvailability - c.meanFlowFrameAvailability,
    materialCoverageDelta: (t.materialAt600?.unionCoverage ?? 0) - (c.materialAt600?.unionCoverage ?? 0),
    plateCountDelta: (t.materialAt600?.plateCount ?? 0) - (c.materialAt600?.plateCount ?? 0),
    buriedLayerCellDelta: (t.materialAt600?.buriedLayerCellCount ?? 0) - (c.materialAt600?.buriedLayerCellCount ?? 0)
  };
}

function summarizeFinal(controller) {
  const field = controller.field;
  const material = materialSummary(controller);
  const surface = surfaceSummary(controller.surfaceField);
  return {
    population: controller.agents.length, totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
    recruitmentLimit: controller.recruitmentLimit, minSeparation: minimumSeparation(controller.agents),
    nonFiniteAgents: controller.agents.filter(agent => ![agent.x, agent.y, agent.vx, agent.vy, agent.heading].every(Number.isFinite)).length,
    outOfDomainAgents: controller.agents.filter(agent => agent.x < 0 || agent.x > 1 || agent.y < 0 || agent.y > 1).length,
    pheromone: { width: field.width, height: field.height, nodeSum: arraySum(field.values),
      reconstructedIntegral: trapezoidIntegral(field.values, field.width, field.height) },
    material, surface, simulationTimeMs: controller.simulationTimeMs
  };
}

function newWindowCounters() {
  return Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index), {
    acceptedSpawns: 0, flowConditionedSpawns: 0, fallbackSpawns: 0, isotropicControlSpawns: 0, blockedPlacementCalls: 0,
    activeAntSeconds: 0,
    flowFrames: 0, availableFlowFrames: 0, eligibleN: {}, flowSamples: [], populationSum: 0,
    populationFrames: 0, pheromoneTotal: 0, pheromoneConcentration: 0,
    sameFlowAntTicks: 0, capacityLimitedTicks: 0
  }]).concat([['pendingSameFlowAntTicks', 0], ['pendingCapacityLimitedTicks', 0],
    ['pendingFootContactEvents', 0], ['pendingFootContactLegs', 0],
    ['pendingPlateBirths', 0], ['pendingNoduleBirths', 0]]));
}

function tickWindow(seconds) { return Math.max(0, Math.min(9, Math.ceil(seconds / 60) - 1)); }
function spawnWindow(seconds) { return Math.max(0, Math.min(9, Math.floor(seconds / 60))); }
function isotropic(U) { return -PI + 2 * PI * U; }
function wrap(value) { return ((value + PI) % TAU + TAU) % TAU - PI; }
function angleDelta(from, to) { return wrap(to - from); }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function distribution(values) {
  if (!values.length) return { count: 0, min: null, p10: null, median: null, mean: null, p90: null, max: null };
  const sorted = values.slice().sort((a, b) => a - b);
  const quantile = p => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  return { count: values.length, min: sorted[0], p10: quantile(0.1), median: quantile(0.5),
    mean: mean(values), p90: quantile(0.9), max: sorted.at(-1) };
}
function circularSummary(angles) {
  if (!angles.length) return { count: 0, meanAngle: null, concentration: null };
  const x = angles.reduce((sum, angle) => sum + Math.cos(angle), 0) / angles.length;
  const y = angles.reduce((sum, angle) => sum + Math.sin(angle), 0) / angles.length;
  return { count: angles.length, meanAngle: Math.atan2(y, x), concentration: Math.hypot(x, y) };
}
function vectorMean(vectors) {
  if (!vectors.length) return null;
  return Array.from({ length: vectors[0].length }, (_, index) => mean(vectors.map(vector => vector[index])));
}
function vectorL1(a, b) {
  return a && b ? a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) : null;
}
function arraySum(values) { let sum = 0; for (const value of values) sum += value; return sum; }
function trapezoidIntegral(values, width, height) {
  let sum = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    sum += values[y * width + x] * ((x === 0 || x === width - 1) ? 0.5 : 1)
      * ((y === 0 || y === height - 1) ? 0.5 : 1);
  }
  return sum / ((width - 1) * (height - 1));
}
function minimumSeparation(agents) {
  let min = Infinity;
  for (let i = 0; i < agents.length; i += 1) for (let j = i + 1; j < agents.length; j += 1) {
    min = Math.min(min, Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y));
  }
  return Number.isFinite(min) ? min : null;
}
function overlappingPairs(agents) {
  let count = 0;
  for (let i = 0; i < agents.length; i += 1) for (let j = i + 1; j < agents.length; j += 1) {
    if (Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y) < agents[i].radius + agents[j].radius) count += 1;
  }
  return count;
}
function countedLcg(seed) {
  let state = seed >>> 0, calls = 0;
  return {
    random() { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; },
    state: () => state, get calls() { return calls; }
  };
}
async function hashSources() {
  return Object.fromEntries(await Promise.all(SOURCES.map(async path =>
    [path, sha256(await readFile(resolve(ROOT, path)))])));
}
function verifyLockedSource(source) {
  const checks = [
    ['spawn center', 'const SPAWN_CENTER = { x: 0.5, y: 0.72 };'],
    ['spawn radius', 'const SPAWN_RADIUS = 0.018;'],
    ['north production expression', 'SPAWN_HEADING + signed(this.random) * SPAWN_HEADING_SPREAD'],
    ['interval minimum', 'SPAWN_INTERVAL_MIN_MS = 400;'],
    ['interval range', 'SPAWN_INTERVAL_RANGE_MS = 500;'],
    ['placement attempts', 'SPAWN_PLACEMENT_ATTEMPTS = 12;'],
    ['clearance', 'SPAWN_CLEARANCE = 0.004;'],
    ['retry', 'SPAWN_RETRY_MS = 120;'],
    ['post-collision movement x', 'agent.x += displacement.x * scale;'],
    ['post-collision movement y', 'agent.y += displacement.y * scale;'],
    ['retained resistance', 'materialLocomotionMultiplier(materialLayers[index])'],
    ['A turn ceiling', 'ANT_MAX_TURN_RATE * materialTurnRateMultiplier(materialLayers[index])'],
    ['D same-flow headway', 'materialFollowingHeadwayMultiplier(materialLayers[index])']
  ];
  for (const [name, snippet] of checks) assert.ok(source.includes(snippet), name);
  assert.equal(source.split('SPAWN_HEADING + signed(this.random) * SPAWN_HEADING_SPREAD').length - 1, 1);
  selfCheck();
}
function selfCheck() {
  assert.equal(isotropic(0), -PI);
  assert.ok(Math.abs(isotropic(0.5)) < 1e-12);
  assert.ok(isotropic(1 - Number.EPSILON) < PI);
  assert.equal(measureFlow([]).available, false);
  const valid = measureFlow([
    { id: '1', from: { x: 0.55, y: 0.72 }, to: { x: 0.551, y: 0.72 }, dt: 1 / 60, dx: 0.001, dy: 0 },
    { id: '2', from: { x: 0.55, y: 0.721 }, to: { x: 0.551, y: 0.721 }, dt: 1 / 60, dx: 0.001, dy: 0 },
    { id: '3', from: { x: 0.55, y: 0.719 }, to: { x: 0.551, y: 0.719 }, dt: 1 / 60, dx: 0.001, dy: 0 }
  ]);
  assert.equal(valid.N, 3); assert.equal(valid.available, true); assert.ok(Math.abs(valid.R - 1) < 1e-12);
  assert.equal(measureFlow([
    ...[0, 1, 2].map(i => ({ id: String(i), from: { x: 0.55, y: 0.72 }, to: { x: 0.549, y: 0.72 },
      dt: 1 / 60, dx: -0.001, dy: 0 }))
  ]).available, false, 'inward movement must not qualify');
}
async function gitHead() {
  const head = (await readFile(resolve(ROOT, '.git/HEAD'), 'utf8')).trim();
  return head.startsWith('ref: ') ? gitRef(head.slice(5)) : head;
}
async function gitRef(ref) {
  try { return (await readFile(resolve(ROOT, '.git', ref), 'utf8')).trim(); }
  catch {
    const packed = await readFile(resolve(ROOT, '.git/packed-refs'), 'utf8').catch(() => '');
    return packed.split(/\r?\n/).find(line => line.endsWith(' ' + ref))?.split(' ')[0] ?? null;
  }
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
