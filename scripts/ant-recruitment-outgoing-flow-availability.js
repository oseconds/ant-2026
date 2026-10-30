import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AntController } from '../src/lib/agents/ant/AntController.js';

const AUTHORITY = '301f0740c9fe2e0697e31a716f7226cb2112ede7';
const SEEDS = ['20261005', '20261006', '20261007'];
const DT = 1 / 60;
const TICKS = 600 * 60;
const CENTER = Object.freeze({ x: 0.5, y: 0.72 });
const INNER_RADIUS = 0.018;
const OUTER_RADIUS = 0.085;
const MIN_SPEED = 0.008;
const MIN_ANTS = 3;
const MIN_RESULTANT = 1e-9;
const PI = Math.PI;
const OUTPUT = resolve('docs/ant/evidence/2026-10-31-recruitment-outgoing-flow-availability/analysis');

assert.equal(SEEDS.length, 3);
assert.equal(TICKS, 36000);
await mkdir(OUTPUT, { recursive: true });
await verifySourceLock();
verifySignalSelfChecks();

const runs = [];
for (let index = 0; index < SEEDS.length; index += 1) {
  const seed = SEEDS[index];
  const result = await runSeed(seed, index === 0);
  runs.push(result);
  await writeFile(resolve(OUTPUT, 'seed-' + seed + '-events.json'), JSON.stringify({
    seed, authority: AUTHORITY, parameters: parameters(), events: result.events
  }, null, 2) + '\n');
  console.log(JSON.stringify({
    seed, acceptedSpawns: result.summary.acceptedSpawns,
    available: result.summary.availableSpawns,
    availabilityPercent: result.summary.availabilityPercent,
    supportWindows: result.summary.availableWindowCount,
    placement: result.spawn
  }));
}

const gate = runs.map(({ seed, summary }) => ({
  seed,
  availabilityPass: summary.availabilityPercent >= 10,
  supportWindowsPass: summary.availableWindowCount >= 8,
  pass: summary.availabilityPercent >= 10 && summary.availableWindowCount >= 8,
  availabilityPercent: summary.availabilityPercent,
  availableWindows: summary.availableWindowCount
}));
const decision = gate.every(row => row.pass) ? 'GO' : 'STOP';
const summary = {
  authority: AUTHORITY,
  conditions: {
    seeds: SEEDS, ticks: TICKS, stepSeconds: DT, modelSeconds: 600,
    audio: 'Off; no audio bridge or renderer',
    production: 'exact authority source; default materialLocomotionResistance=true',
    observer: 'read-only instance wrappers; original heading draw and all other random calls forwarded once'
  },
  signal: parameters(),
  runs: runs.map(({ seed, summary: row, spawn }) => ({ seed, ...row, spawn })),
  parity: runs[0].parity,
  authoredGate: {
    perSeedMinimumAvailabilityPercent: 10,
    perSeedMinimumSupportedWindows: 8,
    decision,
    perSeed: gate
  },
  nextComparison: decision === 'GO'
    ? 'CONTROL: isotropic accepted-spawn heading; TREATMENT: outgoing-flow q when available, isotropic fallback otherwise.'
    : 'STOP this outgoing-flow family. Next production question: whether isotropic accepted-spawn heading should replace the authored north-biased law.'
};
await writeFile(resolve(OUTPUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ decision, parity: runs[0].parity, output: OUTPUT }));

function parameters() {
  return {
    center: CENTER, acceptedSpawnPositionRadius: 0.018,
    segmentMidpointAnnulus: { innerExclusive: INNER_RADIUS, outerInclusive: OUTER_RADIUS },
    realizedSpeedMinimumWorldUnitsPerSecond: MIN_SPEED,
    radialOutwardCriterion: 'strictly increasing distance from center; equivalently midpoint radial dot segment displacement > 0',
    eligibleAntMinimum: MIN_ANTS,
    q: 'equal-weight mean of eligible realized unit segment directions, one per live ant',
    unavailable: 'N < 3 or R <= 1e-9',
    hypotheticalHalfSpread: 'pi - (pi - 0.3) * R; diagnostics only'
  };
}

async function verifySourceLock() {
  const source = await readFile(resolve('src/lib/agents/ant/AntController.js'), 'utf8');
  const locked = [
    ['spawn center', /const SPAWN_CENTER = \{ x: 0\.5, y: 0\.72 \};/],
    ['spawn radius', /const SPAWN_RADIUS = 0\.018;/],
    ['north heading center', /const SPAWN_HEADING = -Math\.PI \/ 2;/],
    ['heading half-spread', /const SPAWN_HEADING_SPREAD = 0\.3;/],
    ['placement attempts', /const SPAWN_PLACEMENT_ATTEMPTS = 12;/],
    ['placement clearance', /const SPAWN_CLEARANCE = 0\.004;/],
    ['pre-heading draw boundary', /heading: SPAWN_HEADING \+ signed\(this\.random\) \* SPAWN_HEADING_SPREAD/],
    ['post-collision positions', /agent\.x \+= displacement\.x \* scale;[\s\S]*?agent\.y \+= displacement\.y \* scale;/],
    ['material turn ceiling', /ANT_MAX_TURN_RATE \* materialTurnRateMultiplier\(materialLayers\[index\]\)/],
    ['material same-flow headway', /materialFollowingHeadwayMultiplier\(materialLayers\[index\]\)/]
  ];
  for (const [name, expression] of locked) assert.match(source, expression, name);
  const digest = createHash('sha256').update(source).digest('hex');
  await writeFile(resolve(OUTPUT, 'source-lock.json'), JSON.stringify({
    authority: AUTHORITY,
    checkedSource: 'src/lib/agents/ant/AntController.js',
    sha256: digest,
    lockedChecks: locked.map(([name]) => name),
    note: 'Runtime hash and exact authority commit recorded separately in SOURCE-HASHES.json.'
  }, null, 2) + '\n');
}

function verifySignalSelfChecks() {
  const two = signalForUnits([[1, 0], [1, 0]]);
  assert.equal(two.N, 2);
  assert.equal(two.available, false);
  const aligned = signalForUnits([[1, 0], [1, 0], [1, 0]]);
  assert.equal(aligned.available, true);
  assert.equal(aligned.R, 1);
  assert.ok(Math.abs(aligned.w - 0.3) < 1e-12);
  const balanced = signalForUnits([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  assert.equal(balanced.R, 0);
  assert.equal(balanced.available, false);
  assert.equal(balanced.w, PI);
}

function signalForUnits(units) {
  const N = units.length;
  if (N < MIN_ANTS) return { N, available: false, R: null, phi: null, w: null };
  const qx = units.reduce((sum, unit) => sum + unit[0], 0) / N;
  const qy = units.reduce((sum, unit) => sum + unit[1], 0) / N;
  const R = Math.hypot(qx, qy);
  return {
    N, qx, qy, R,
    phi: R > 0 ? Math.atan2(qy, qx) : null,
    w: PI - (PI - 0.3) * R,
    available: R > MIN_RESULTANT
  };
}

async function runSeed(seed, validateParity) {
  const observed = makeWorld(seed);
  const observer = installObserver(observed.controller, seed);
  let control = null;
  if (validateParity) control = makeWorld(seed);
  await observed.controller.init();
  if (control) await control.controller.init();
  if (control) compareBoundary(control, observed, 0, true);

  for (let tick = 1; tick <= TICKS; tick += 1) {
    if (control) control.controller.tick(DT);
    observed.controller.tick(DT);
    if (control) compareBoundary(control, observed, tick, tick % 60 === 0);
    if (tick % 3600 === 0) console.log('progress seed=' + seed + ' seconds=' + tick / 60);
  }

  assert.equal(observer.events.length, observed.controller.totalSpawned,
    'one pre-heading observer record per accepted spawn');
  assert.ok(Math.abs(observed.controller.simulationTimeMs - 600000) < 1e-6,
    'exact 600 model seconds');
  assert.equal(observed.controller.materialLocomotionResistance, true,
    'production retained-material resistance stays on');
  const spawn = {
    ...observer.spawn,
    pendingRetryAt600s: observer.awaitingRetry,
    nextSpawnTimeMsAt600s: observed.controller.nextSpawnTimeMs
  };
  const result = {
    seed,
    events: observer.events,
    summary: summarize(observer.events, spawn),
    spawn,
    parity: control ? observer.parity : null
  };
  if (control) {
    observer.parity = {
      seed,
      result: 'PASS',
      comparedTicks: TICKS,
      comparedRngBoundaries: TICKS,
      comparedPerTickAgentStates: TICKS,
      fullPublicSnapshotChecks: TICKS / 60,
      initialPublicSnapshotCheck: true,
      finalRngCalls: observed.random.calls(),
      observerRandomForwardCalls: observer.randomForwardCalls,
      observedAcceptedSpawns: observed.controller.totalSpawned,
      note: 'Plain production controller vs observer-wrapped controller, same seed, lockstep 1/60-second ticks.'
    };
    result.parity = observer.parity;
  }
  observer.restore();
  await observed.controller.destroy();
  if (control) await control.controller.destroy();
  return result;
}

function makeWorld(seed) {
  const random = countedLcg(Number(seed));
  const controller = new AntController({ random });
  return { controller, random };
}

function installObserver(controller, seed) {
  const events = [];
  const state = {
    events,
    tickCount: 0,
    activeTick: null,
    spawnCall: null,
    awaitingRetry: false,
    randomForwardCalls: 0,
    spawn: {
      initialCalls: 0,
      scheduledOpportunities: 0,
      nonRetryScheduledOpportunities: 0,
      blockedPlacementCalls: 0,
      retryCalls: 0,
      retryRecoveredSpawns: 0,
      capacitySuppressedCalls: 0,
      placementAttempts: 0,
      clearanceRejectedPositions: 0,
      acceptedSpawnCalls: 0,
      regularScheduleWrites: 0,
      retryScheduleWrites: 0
    }
  };
  const originalTick = controller.tick;
  const originalSpawn = controller.spawnNextAnt;
  const originalSchedule = controller.scheduleNextSpawn;

  controller.tick = function (dt) {
    state.tickCount += 1;
    state.activeTick = {
      index: state.tickCount,
      dt,
      from: new Map(this.agents.map(agent => [agent.id, { x: agent.x, y: agent.y }]))
    };
    try { return originalTick.call(this, dt); }
    finally { state.activeTick = null; }
  };

  controller.scheduleNextSpawn = function () {
    state.spawn.regularScheduleWrites += 1;
    return originalSchedule.call(this);
  };

  controller.spawnNextAnt = function () {
    const initial = state.spawn.initialCalls === 0 && this.totalSpawned === 0;
    const scheduled = this.nextSpawnTimeMs !== null
      && this.simulationTimeMs + 1e-9 >= this.nextSpawnTimeMs;
    const retry = state.awaitingRetry && scheduled;
    const call = { phase: 'angle', placements: 0, candidate: null, event: null };
    if (initial) state.spawn.initialCalls += 1;
    else if (scheduled) {
      state.spawn.scheduledOpportunities += 1;
      if (!retry) state.spawn.nonRetryScheduledOpportunities += 1;
    }
    if (retry) state.spawn.retryCalls += 1;

    const originalRandom = this.random;
    const beforeSpawned = this.totalSpawned;
    state.spawnCall = call;
    this.random = function () {
      state.randomForwardCalls += 1;
      if (call.phase === 'between') {
        // The next RNG call follows production clearance and is the accepted heading draw.
        if (call.candidate.clear) {
          call.event = captureEvent(controller, seed, state.activeTick, call.candidate.position);
          events.push(call.event);
          call.phase = 'after-heading';
        } else {
          call.phase = 'angle';
        }
      }
      if (call.phase === 'after-heading') return originalRandom();
      if (call.phase === 'angle') {
        call.angleDraw = originalRandom();
        call.phase = 'distance';
        return call.angleDraw;
      }
      if (call.phase === 'distance') {
        const distanceDraw = originalRandom();
        call.placements += 1;
        state.spawn.placementAttempts += 1;
        const distance = Math.sqrt(distanceDraw) * INNER_RADIUS;
        const position = {
          x: CENTER.x + Math.cos(call.angleDraw * 2 * PI) * distance,
          y: CENTER.y + Math.sin(call.angleDraw * 2 * PI) * distance
        };
        const radius = controller.state.behavior.bodyRadius;
        const clear = controller.agents.every(agent => Math.hypot(
          position.x - agent.x, position.y - agent.y
        ) >= radius + agent.radius + 0.004);
        if (!clear) state.spawn.clearanceRejectedPositions += 1;
        call.candidate = { position, clear };
        call.phase = 'between';
        return distanceDraw;
      }
      return originalRandom();
    };

    try {
      const accepted = originalSpawn.call(this);
      if (accepted) {
        assert.equal(this.totalSpawned, beforeSpawned + 1);
        assert.ok(call.event, 'accepted position must be sampled before its heading draw');
        const ant = this.agents.at(-1);
        assert.equal(ant.x, call.candidate.position.x);
        assert.equal(ant.y, call.candidate.position.y);
        call.event.accepted = true;
        call.event.spawnIndex = this.totalSpawned;
        state.spawn.acceptedSpawnCalls += 1;
        if (retry) state.spawn.retryRecoveredSpawns += 1;
        state.awaitingRetry = false;
      } else if (call.placements === 12) {
        state.spawn.blockedPlacementCalls += 1;
        state.spawn.retryScheduleWrites += 1;
        state.awaitingRetry = true;
      } else {
        state.spawn.capacitySuppressedCalls += 1;
        state.awaitingRetry = false;
      }
      assert.ok(!call.event || accepted, 'only accepted placements can have heading samples');
      return accepted;
    } finally {
      this.random = originalRandom;
      state.spawnCall = null;
    }
  };

  state.restore = () => {
    controller.tick = originalTick;
    controller.spawnNextAnt = originalSpawn;
    controller.scheduleNextSpawn = originalSchedule;
  };
  return state;
}

function captureEvent(controller, seed, activeTick, spawnPosition) {
  const eligible = [];
  if (activeTick) {
    for (const agent of controller.agents) {
      const from = activeTick.from.get(agent.id);
      assert.ok(from, 'live ant at accepted-spawn boundary must have tick-entry position');
      const to = { x: agent.x, y: agent.y };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      const midpointRadius = Math.hypot(midpoint.x - CENTER.x, midpoint.y - CENTER.y);
      if (!(midpointRadius > INNER_RADIUS && midpointRadius <= OUTER_RADIUS)) continue;
      const realizedSpeed = length / activeTick.dt;
      if (realizedSpeed < MIN_SPEED) continue;
      const radialDot = dx * (midpoint.x - CENTER.x) + dy * (midpoint.y - CENTER.y);
      if (!(radialDot > 0)) continue;
      eligible.push({
        id: agent.id,
        from, to,
        midpointRadius,
        realizedSpeed,
        radialDot,
        unitX: dx / length,
        unitY: dy / length
      });
    }
  }
  const signal = signalForUnits(eligible.map(segment => [segment.unitX, segment.unitY]));
  return {
    seed,
    timeSeconds: controller.simulationTimeMs / 1000,
    completedTick: activeTick?.index ?? 0,
    liveAntsAtBoundary: controller.agents.length,
    spawnPosition,
    N: signal.N,
    qx: signal.qx ?? null,
    qy: signal.qy ?? null,
    R: signal.R,
    phi: signal.phi,
    w: signal.w,
    available: signal.available,
    accepted: false,
    eligibleSegments: eligible
  };
}

function summarize(events, spawn) {
  const nValues = events.map(event => event.N);
  const defined = events.filter(event => event.N >= MIN_ANTS);
  const available = events.filter(event => event.available);
  const rValues = defined.map(event => event.R);
  const wValues = defined.map(event => event.w);
  const phis = available.map(event => event.phi);
  const windows = Array.from({ length: 10 }, (_, index) => {
    const start = index * 60;
    const end = start + 60;
    const rows = events.filter(event => event.timeSeconds >= start
      && (event.timeSeconds < end || index === 9 && event.timeSeconds <= 600));
    const support = rows.filter(event => event.available).length;
    return {
      window: start + '-' + end,
      acceptedSpawns: rows.length,
      availableSpawns: support,
      availabilityPercent: rows.length ? 100 * support / rows.length : 0
    };
  });
  const cos = phis.reduce((sum, phi) => sum + Math.cos(phi), 0);
  const sin = phis.reduce((sum, phi) => sum + Math.sin(phi), 0);
  return {
    acceptedSpawns: events.length,
    acceptedWithNAtLeast3: defined.length,
    availableSpawns: available.length,
    availabilityPercent: 100 * available.length / events.length,
    eligibleN: { distribution: frequency(nValues), statistics: distribution(nValues) },
    R: { statistics: distribution(rValues), histogram: histogram(rValues,
      [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1], true) },
    hypotheticalW: { statistics: distribution(wValues), histogram: histogram(wValues,
      [0.3, 0.7, 1.2, 1.8, 2.4, PI], true) },
    availableQDirection: {
      count: phis.length,
      meanDirectionRadians: phis.length && Math.hypot(cos, sin) > 1e-12
        ? Math.atan2(sin, cos) : null,
      circularConcentration: phis.length ? Math.hypot(cos, sin) / phis.length : null
    },
    windows,
    availableWindowCount: windows.filter(window => window.availableSpawns > 0).length,
    spawnContext: spawn
  };
}

function frequency(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, count }));
}

function distribution(values) {
  if (!values.length) return { count: 0, min: null, p10: null, p25: null, median: null,
    mean: null, p75: null, p90: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const nearestRank = fraction => sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
  return {
    count: values.length,
    min: sorted[0], p10: nearestRank(0.10), p25: nearestRank(0.25),
    median: nearestRank(0.50), mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p75: nearestRank(0.75), p90: nearestRank(0.90), max: sorted.at(-1)
  };
}

function histogram(values, edges, includeLast) {
  const bins = edges.slice(0, -1).map((lower, index) => ({
    lower, upper: edges[index + 1], count: 0
  }));
  for (const value of values) {
    let index = edges.findIndex((edge, i) => i < edges.length - 1
      && value >= edge && (value < edges[i + 1] || includeLast && i === edges.length - 2 && value <= edges[i + 1]));
    if (index < 0 && includeLast && value === edges.at(-1)) index = bins.length - 1;
    if (index >= 0) bins[index].count += 1;
  }
  return bins;
}

function compareBoundary(control, observed, tick, compareWorld) {
  const a = control.controller, b = observed.controller;
  assert.equal(control.random.state(), observed.random.state(), 'RNG state at tick ' + tick);
  assert.equal(control.random.calls(), observed.random.calls(), 'RNG calls at tick ' + tick);
  assert.equal(a.simulationTimeMs, b.simulationTimeMs, 'clock at tick ' + tick);
  assert.equal(a.totalSpawned, b.totalSpawned, 'accepted-spawn count at tick ' + tick);
  assert.equal(a.totalRetired, b.totalRetired, 'retirement count at tick ' + tick);
  assert.equal(a.nextAgentId, b.nextAgentId, 'next ID at tick ' + tick);
  assert.equal(a.nextSpawnTimeMs, b.nextSpawnTimeMs, 'spawn schedule at tick ' + tick);
  assert.equal(JSON.stringify(a.agents), JSON.stringify(b.agents), 'complete agent state at tick ' + tick);
  if (compareWorld) {
    assert.equal(JSON.stringify(a.getSnapshot()), JSON.stringify(b.getSnapshot()),
      'complete public world snapshot at tick ' + tick);
  }
}

function countedLcg(seed) {
  let value = seed >>> 0;
  let calls = 0;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    calls += 1;
    return value / 0x100000000;
  };
  random.state = () => value;
  random.calls = () => calls;
  return random;
}
