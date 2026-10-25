import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const SEEDS = [9, 52, 240];
const FIELD_ARMS = [{ name: 'C', size: 96 }, { name: 'G', size: 316 }];
const DT = 1 / 60;
const TICKS = 60 * 60;
const WARMUP_LAST_TICK = 60 * 5;
const OUTPUT = 'docs/ant/evidence/2026-10-25-near-stop-fixture-validity';

function countedSeededRandom(seed, onDraw = null) {
  let value = seed >>> 0;
  let calls = 0;
  return {
    random() {
      calls += 1;
      value = (1664525 * value + 1013904223) >>> 0;
      const sample = value / 0x100000000;
      onDraw?.(sample);
      return sample;
    },
    get calls() { return calls; }
  };
}

async function runNaturalFixture(seed, arm) {
  let tickRandomValues = [];
  const rng = countedSeededRandom(seed, value => tickRandomValues.push(value));
  const controller = new AntController({
    random: rng.random,
    state: { population: { activationFeedback: false } },
    fieldFactory: (options) => new PheromoneField({ ...options, width: arm.size, height: arm.size })
  });
  await controller.init();
  controller.syncRecruitment = () => {};
  const ant = controller.agents[0];
  controller.agents = [ant];
  controller.nextSpawnTimeMs = null;
  ant.x = 0.5;
  ant.y = 0.5;
  const initialAgentFingerprint = createHash('sha256').update(JSON.stringify({
    id: ant.id, x: ant.x, y: ant.y, vx: ant.vx, vy: ant.vy,
    heading: ant.heading, angularVelocity: ant.angularVelocity, radius: ant.radius,
    personality: ant.personality, targetSpeed: ant.targetSpeed, speedPhase: ant.speedPhase,
    speedCycle: ant.speedCycle, hesitationRemaining: ant.hesitationRemaining,
    inspectionRemaining: ant.inspectionRemaining, decisionRemaining: ant.decisionRemaining,
    committedRemaining: ant.committedRemaining, trailConfidence: ant.trailConfidence,
    trailAdherence: ant.trailAdherence, rngCalls: rng.calls
  })).digest('hex');
  const initialRngCalls = rng.calls;

  const senseLocalTrail = controller.senseLocalTrail;
  let tickLocal = null;
  controller.senseLocalTrail = function observedSense(agent) {
    const result = senseLocalTrail.call(this, agent);
    if (agent === ant) tickLocal = result;
    return result;
  };

  const rows = [];
  let firstRetirement = null;
  let oldTestNearStops = 0;
  let oldTestMoving = 0;
  let activeNearStops = 0;
  let activeMoving = 0;
  let stalePostWarmup = 0;
  let frozenStalePostWarmup = 0;
  let inspectionOpportunities = 0;
  let hesitationStarts = 0;
  let decisionReschedules = 0;

  for (let tick = 0; tick < TICKS; tick += 1) {
    const activeBefore = controller.agents.includes(ant);
    const before = {
      x: ant.x, y: ant.y, vx: ant.vx, vy: ant.vy,
      heading: ant.heading, angularVelocity: ant.angularVelocity,
      inspectionRemaining: ant.inspectionRemaining,
      hesitationRemaining: ant.hesitationRemaining,
      decisionRemaining: ant.decisionRemaining,
      committedRemaining: ant.committedRemaining,
      trailAdherence: ant.trailAdherence,
      trailConfidence: ant.trailConfidence,
      speedPhase: ant.speedPhase,
      rngCalls: rng.calls
    };
    if (activeBefore && before.inspectionRemaining <= DT) inspectionOpportunities += 1;
    tickLocal = null;
    tickRandomValues = [];
    controller.tick(DT);
    const randomValuesThisTick = tickRandomValues;
    const activeAfter = controller.agents.includes(ant);
    const speed = Math.hypot(ant.vx, ant.vy);
    const postWarmup = tick > WARMUP_LAST_TICK;
    const nearStop = speed < ant.personality.preferredSpeed * 0.15;
    const moving = speed > ant.personality.preferredSpeed * 0.6;
    const hesitationStart = activeBefore
      && before.hesitationRemaining <= DT
      && ant.hesitationRemaining > 0;
    const decisionRescheduled = activeBefore
      && ant.decisionRemaining > Math.max(0, before.decisionRemaining - DT) + 1e-9;
    if (hesitationStart) hesitationStarts += 1;
    if (decisionRescheduled) decisionReschedules += 1;
    if (postWarmup) {
      if (nearStop) oldTestNearStops += 1;
      if (moving) oldTestMoving += 1;
      if (activeAfter) {
        if (nearStop) activeNearStops += 1;
        if (moving) activeMoving += 1;
      } else {
        stalePostWarmup += 1;
        if (!activeBefore) frozenStalePostWarmup += 1;
      }
    }
    if (!activeAfter && firstRetirement === null) {
      firstRetirement = {
        tick,
        tickOneBased: tick + 1,
        timeSeconds: (tick + 1) / 60,
        x: ant.x,
        y: ant.y,
        speed,
        preferredSpeed: ant.personality.preferredSpeed,
        heading: ant.heading,
        angularVelocity: ant.angularVelocity,
        hesitationRemaining: ant.hesitationRemaining
      };
    }
    rows.push({
      tick,
      timeSeconds: (tick + 1) / 60,
      activeBefore,
      activeAfter,
      x: ant.x,
      y: ant.y,
      speed,
      vx: ant.vx,
      vy: ant.vy,
      preferredSpeed: ant.personality.preferredSpeed,
      heading: ant.heading,
      angularVelocity: ant.angularVelocity,
      inspectionRemaining: ant.inspectionRemaining,
      hesitationRemaining: ant.hesitationRemaining,
      decisionRemaining: ant.decisionRemaining,
      committedRemaining: ant.committedRemaining,
      localStrength: tickLocal?.strength ?? null,
      trailAdherence: ant.trailAdherence,
      trailConfidence: ant.trailConfidence,
      nearStop,
      moving,
      hesitationStart,
      inspectionOpportunity: activeBefore && before.inspectionRemaining <= DT,
      decisionRescheduled,
      inspectionProbabilityDraw: activeBefore && before.inspectionRemaining <= DT
        ? randomValuesThisTick[1] ?? null : null,
      rngCalls: rng.calls,
      rngCallsThisTick: rng.calls - before.rngCalls,
      rngValuesThisTick: randomValuesThisTick
    });
  }
  const summary = {
    arm: arm.name,
    fieldSize: arm.size,
    seed,
    ticks: TICKS,
    initialAgentFingerprint,
    initialRngCalls,
    rngCalls: rng.calls,
    firstRetirement,
    activeAtEnd: controller.agents.includes(ant),
    inspectionOpportunities,
    hesitationStarts,
    hesitationStartTicks: rows.filter(row => row.hesitationStart).map(row => row.tick),
    postWarmupHesitationStarts: rows.filter(row => row.hesitationStart && row.tick > WARMUP_LAST_TICK).length,
    postWarmupInspectionOpportunities: rows.filter(row => row.inspectionOpportunity
      && row.tick > WARMUP_LAST_TICK).length,
    decisionReschedules,
    oldTestNearStops,
    oldTestMoving,
    activeNearStops,
    activeMoving,
    stalePostWarmup,
    frozenStalePostWarmup,
    firstPostWarmupActiveTick: rows.find(row => row.tick > WARMUP_LAST_TICK && row.activeAfter)?.tick ?? null,
    lastActiveTick: rows.findLast(row => row.activeAfter)?.tick ?? null
  };
  summary.hesitationEpisodes = rows.filter(row => row.hesitationStart).map(start => {
    const end = rows.findIndex(row => row.tick > start.tick && row.hesitationRemaining === 0);
    const episode = rows.slice(start.tick, end < 0 ? rows.length : end);
    return {
      startTick: start.tick,
      startTimeSeconds: start.timeSeconds,
      startDurationSeconds: start.hesitationRemaining,
      durationTicks: episode.length,
      activeThroughout: episode.every(row => row.activeAfter),
      minimumSpeed: Math.min(...episode.map(row => row.speed)),
      nearStopThreshold: start.preferredSpeed * 0.15,
      reachedNearStop: episode.some(row => row.nearStop),
      postWarmup: start.tick > WARMUP_LAST_TICK
    };
  });
  summary.inspectionDraws = rows.filter(row => row.inspectionOpportunity)
    .map(row => ({ tick: row.tick, timeSeconds: row.timeSeconds,
      postWarmup: row.tick > WARMUP_LAST_TICK, probabilityDraw: row.inspectionProbabilityDraw,
      hesitationStarted: row.hesitationStart }));
  await controller.destroy();
  return { summary, rows };
}

function scriptedRandom(values) {
  let calls = 0;
  return {
    random() { return values[calls++] ?? 0.5; },
    get calls() { return calls; }
  };
}

async function runControlledProbes(arm) {
  const state = { population: { activationFeedback: false } };
  const controller = new AntController({
    random: () => 0.5,
    state,
    fieldFactory: (options) => new PheromoneField({ ...options, width: arm.size, height: arm.size })
  });
  await controller.init();
  controller.syncRecruitment = () => {};
  const ant = controller.agents[0];
  controller.agents = [ant];
  controller.nextSpawnTimeMs = null;
  ant.x = 0.5;
  ant.y = 0.5;
  ant.heading = 0;
  ant.intentHeading = 0;
  ant.vx = ant.personality.preferredSpeed * 0.8;
  ant.vy = 0;
  ant.inspectionRemaining = DT;
  ant.hesitationRemaining = 0;
  ant.decisionRemaining = 10;
  ant.committedRemaining = 10;
  const schedulerRng = scriptedRandom([0.5, 0, 0.5, 0.25]);
  controller.random = schedulerRng.random;
  controller.tick(DT);
  const scheduler = {
    fieldSize: arm.size,
    inspectionEvent: true,
    nextInspectionSeconds: ant.inspectionRemaining,
    hesitationSeconds: ant.hesitationRemaining,
    expectedHesitationSeconds: 0.7 + 0.25 * 0.8,
    rngCalls: schedulerRng.calls,
    targetSpeedDuringHesitation: ant.targetSpeed,
    preferredSpeed: ant.personality.preferredSpeed
  };
  const schedulerStart = ant.hesitationRemaining;
  const schedulerPass = Math.abs(scheduler.nextInspectionSeconds - 2.4) < 1e-12
    && Math.abs(schedulerStart - scheduler.expectedHesitationSeconds) < 1e-12
    && schedulerRng.calls === 4;
  await controller.destroy();

  const brakeController = new AntController({
    random: () => 0.5,
    state,
    fieldFactory: (options) => new PheromoneField({ ...options, width: arm.size, height: arm.size })
  });
  await brakeController.init();
  brakeController.syncRecruitment = () => {};
  const brakeAnt = brakeController.agents[0];
  brakeController.agents = [brakeAnt];
  brakeController.nextSpawnTimeMs = null;
  brakeAnt.x = 0.5;
  brakeAnt.y = 0.5;
  brakeAnt.heading = 0;
  brakeAnt.intentHeading = 0;
  brakeAnt.speedPhase = 0;
  brakeAnt.vx = brakeAnt.personality.preferredSpeed * 0.8;
  brakeAnt.vy = 0;
  brakeAnt.inspectionRemaining = 100;
  brakeAnt.decisionRemaining = 100;
  brakeAnt.committedRemaining = 100;
  brakeAnt.hesitationRemaining = 0.9;
  let minimumEpisodeSpeed = Infinity;
  let maxResumedSpeed = 0;
  let targetRatioError = null;
  let targetRatioObserved = null;
  let targetRatioExpected = null;
  let episodeEndedAtTick = null;
  for (let tick = 0; tick < 120; tick += 1) {
    const phase = brakeAnt.speedPhase;
    const expectedRatio = (0.58 + 0.34 * (Math.sin(phase) + 1) * 0.5)
      * (brakeAnt.hesitationRemaining > 0 ? 0.05 : 1);
    brakeController.tick(DT);
    const speed = Math.hypot(brakeAnt.vx, brakeAnt.vy);
    if (tick === 0) {
      targetRatioObserved = brakeAnt.targetSpeed / brakeAnt.personality.preferredSpeed;
      targetRatioExpected = expectedRatio;
      targetRatioError = Math.abs(targetRatioObserved - expectedRatio);
    }
    if (brakeAnt.hesitationRemaining > 0) minimumEpisodeSpeed = Math.min(minimumEpisodeSpeed, speed);
    else {
      episodeEndedAtTick ??= tick;
      maxResumedSpeed = Math.max(maxResumedSpeed, speed);
    }
  }
  const braking = {
    fieldSize: arm.size,
    authoredHesitationSeconds: 0.9,
    targetRatioObserved,
    targetRatioExpected,
    targetRatioError,
    minimumSpeedDuringEpisode: minimumEpisodeSpeed,
    nearStopThreshold: brakeAnt.personality.preferredSpeed * 0.15,
    episodeEndedAtTick,
    resumedSpeedMaximum: maxResumedSpeed,
    movingThreshold: brakeAnt.personality.preferredSpeed * 0.6,
    nearStopReached: minimumEpisodeSpeed < brakeAnt.personality.preferredSpeed * 0.15,
    movementResumed: maxResumedSpeed > brakeAnt.personality.preferredSpeed * 0.6
  };
  await brakeController.destroy();
  return { scheduler, schedulerPass, braking };
}

async function runObserverParity(arm, observe) {
  const rng = countedSeededRandom(240);
  const controller = new AntController({
    random: rng.random,
    state: { population: { activationFeedback: false } },
    fieldFactory: (options) => new PheromoneField({ ...options, width: arm.size, height: arm.size })
  });
  await controller.init();
  controller.syncRecruitment = () => {};
  const ant = controller.agents[0];
  controller.agents = [ant];
  controller.nextSpawnTimeMs = null;
  ant.x = ant.y = 0.5;
  let observedReads = 0;
  if (observe) {
    const original = controller.senseLocalTrail;
    controller.senseLocalTrail = function observedSense(agent) {
      const result = original.call(this, agent);
      if (agent === ant) observedReads += 1;
      return result;
    };
  }
  const hash = createHash('sha256');
  for (let tick = 0; tick < 120; tick += 1) {
    controller.tick(DT);
    const state = {
      x: ant.x, y: ant.y, vx: ant.vx, vy: ant.vy, heading: ant.heading,
      angularVelocity: ant.angularVelocity, targetSpeed: ant.targetSpeed,
      speedPhase: ant.speedPhase, trailAdherence: ant.trailAdherence,
      trailConfidence: ant.trailConfidence, inspectionRemaining: ant.inspectionRemaining,
      hesitationRemaining: ant.hesitationRemaining, decisionRemaining: ant.decisionRemaining,
      committedRemaining: ant.committedRemaining, active: controller.agents.includes(ant),
      simulationTimeMs: controller.simulationTimeMs, rngCalls: rng.calls
    };
    hash.update(JSON.stringify(state));
    hash.update(Buffer.from(controller.field.values.buffer,
      controller.field.values.byteOffset, controller.field.values.byteLength));
  }
  const result = { fieldSize: arm.size, observerEnabled: observe, observedReads, rngCalls: rng.calls,
    stateAndRasterSha256: hash.digest('hex') };
  await controller.destroy();
  return result;
}

const results = [];
for (const arm of FIELD_ARMS) {
  for (const seed of SEEDS) results.push(await runNaturalFixture(seed, arm));
}
const probes = [];
for (const arm of FIELD_ARMS) probes.push(await runControlledProbes(arm));
const observerParity = [];
for (const arm of FIELD_ARMS) {
  const off = await runObserverParity(arm, false);
  const on = await runObserverParity(arm, true);
  observerParity.push({ fieldSize: arm.size, off, on,
    stateAndRasterParity: off.stateAndRasterSha256 === on.stateAndRasterSha256,
    rngParity: off.rngCalls === on.rngCalls,
    observerReadCount: on.observedReads });
}

const summaries = results.map(result => result.summary);
const series = { schema: 1, dtSeconds: DT, warmupLastTick: WARMUP_LAST_TICK, rows: results };
const seriesBytes = gzipSync(Buffer.from(JSON.stringify(series)));
const summary = {
  schema: 1,
  parent: '2df9fbfcaf6563157af0b3266b1089a9d8424c7a',
  main: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2',
  fixture: { seeds: SEEDS, ticks: TICKS, dtSeconds: DT, warmupLastTick: WARMUP_LAST_TICK },
  lifecycle: summaries,
  controlledProbes: probes,
  observerParity,
  timelineSha256: createHash('sha256').update(seriesBytes).digest('hex'),
  timelineGzipBytes: seriesBytes.length
};
await mkdir(OUTPUT, { recursive: true });
await writeFile(`${OUTPUT}/lifecycle-timeline.json.gz`, seriesBytes);
await writeFile(`${OUTPUT}/diagnostic-summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
const source = await readFile(new URL(import.meta.url));
summary.runnerSha256 = createHash('sha256').update(source).digest('hex');
await writeFile(`${OUTPUT}/diagnostic-summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
