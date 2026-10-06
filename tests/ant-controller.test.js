import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntAgent } from '../src/lib/agents/ant/AntAgent.js';
import { LocalOccupancy } from '../src/lib/agents/ant/LocalOccupancy.js';

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function runTicks(controller, count, dt = 1000 / 60) {
  for (let index = 0; index < count; index += 1) controller.tick(dt / 1000);
}

// Movement stress cases supply their own bodies so they test the unchanged
// movement rules independently of the demonstration's gradual entry.
function movementFixture(controller, count, random = seededRandom(17)) {
  controller.configure({ population: { activationFeedback: false } });
  // This fixture deliberately controls the active set rather than testing the
  // now-independent recruitment scheduler.
  controller.syncRecruitment = () => {};
  controller.agents = Array.from({ length: count }, (_, index) => new AntAgent({
    id: 'fixture-' + index, x: 0.5, y: 0.5, random,
    radius: controller.state.behavior.bodyRadius
  }));
  controller.nextSpawnTimeMs = null;
  return controller.agents;
}

function spread(agents) {
  const meanX = agents.reduce((sum, agent) => sum + agent.x, 0) / agents.length;
  const meanY = agents.reduce((sum, agent) => sum + agent.y, 0) / agents.length;
  return Math.sqrt(agents.reduce((sum, agent) => sum
    + (agent.x - meanX) ** 2 + (agent.y - meanY) ** 2, 0) / agents.length);
}

function minSeparation(agents) {
  let minimum = Infinity;
  for (let i = 0; i < agents.length; i += 1) {
    for (let j = i + 1; j < agents.length; j += 1) {
      minimum = Math.min(minimum, Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y));
    }
  }
  return minimum;
}

function freezeAgents(controller) {
  for (const [index, ant] of controller.agents.entries()) {
    // Spawn cadence is the subject of these fixtures. Move each entrant clear
    // of the small entrance disk before the next simulation tick.
    ant.x = 0.2 + index * 0.02;
    ant.y = 0.2;
    ant.vx = 0;
    ant.vy = 0;
    ant.turnToward = () => {};
    ant.accelerateToward = () => {};
  }
}

function runFrozenTicks(controller, count, dt = 1000 / 60) {
  for (let index = 0; index < count; index += 1) {
    freezeAgents(controller);
    controller.tick(dt / 1000);
  }
}

async function captureOneDeposit({ adherence, rawSignal = 0, amountPerUnitDistance = 4.5,
  reinforcementGain = 5, stationary = false } = {}) {
  const controller = new AntController({
    random: seededRandom(75),
    state: { pheromone: { amountPerUnitDistance, reinforcementGain, depositionMode: 'continuous' } }
  });
  await controller.init();
  const agent = controller.agents[0];
  controller.agents = [agent];
  controller.nextSpawnTimeMs = null;
  agent.x = 0.5;
  agent.y = 0.5;
  agent.heading = 0;
  agent.intentHeading = 0;
  agent.vx = stationary ? 0 : 0.04;
  agent.vy = 0;
  agent.trailAdherence = adherence;
  agent.hesitationRemaining = 0;
  agent.inspectionRemaining = 100;
  agent.decisionRemaining = 100;
  agent.committedRemaining = 100;
  if (stationary) agent.accelerateToward = () => {};
  controller.senseLocalTrail = () => ({ strength: adherence, coherence: 1, steering: 0 });
  controller.field.sample = () => rawSignal;

  const deposits = [];
  const depositSegment = controller.field.depositSegment.bind(controller.field);
  controller.field.depositSegment = (from, to, options) => {
    deposits.push({
      distance: Math.hypot(to.x - from.x, to.y - from.y),
      amountPerUnitDistance: options.amountPerUnitDistance,
      radius: options.radius
    });
    return depositSegment(from, to, options);
  };
  controller.tick(1 / 60);
  const pheromoneMass = controller.field.getSnapshot().totalMass;
  await controller.destroy();
  return { deposits, pheromoneMass };
}

test('population has equal agents with stable individual personalities and shared pheromone memory', async () => {
  const controller = new AntController({ random: seededRandom(10) });
  await controller.init();
  const initial = controller.getSnapshot();
  assert.equal(initial.agents.length, 1);
  assert.equal(initial.state.population.count, 28);
  assert.equal(initial.state.pheromone.halfLifeSeconds, 15);
  assert.equal(initial.state.pheromone.radius, 0.0045);
  assert.ok(initial.state.behavior.sensorWidth > initial.state.pheromone.radius);
  assert.ok(initial.agents.every((agent) => agent.id.startsWith('ant-')));
  assert.ok(initial.agents.every((agent) => Number.isFinite(agent.personality.preferredSpeed)));
  assert.equal('leader' in initial, false);
  assert.equal('followers' in initial, false);
  assert.equal('mode' in initial, false);
  assert.equal(initial.analysis.minSeparation, null);

  const personality = new Map();
  for (let tick = 0; tick < 60 * 60; tick += 1) {
    for (const agent of controller.agents) {
      if (!personality.has(agent.id)) personality.set(agent.id, { ...agent.personality });
      assert.deepEqual(agent.personality, personality.get(agent.id));
    }
    controller.tick(1 / 60);
  }
  const updated = controller.getSnapshot();
  assert.ok(updated.agents.length <= 28);
  assert.equal(updated.analysis.totalSpawned, updated.analysis.totalRetired + updated.agents.length);
  assert.ok(updated.analysis.totalRetired > 0, 'individuals can leave the observed field');
  assert.ok(updated.analysis.pheromoneMass > 0, 'walking deposits path memory');
  assert.ok(Math.hypot(updated.agents[0].x - initial.agents[0].x,
    updated.agents[0].y - initial.agents[0].y) > 0.04);
  assert.ok(controller.agents.every((agent) =>
    JSON.stringify(agent.personality) === JSON.stringify(personality.get(agent.id))),
  'surviving individual differences persist rather than changing each frame');
  assert.ok(new Set([...personality.values()].map((item) => item.preferredSpeed)).size > 1);
  assert.ok(updated.analysis.meanSpeed > 0.005 && updated.analysis.meanSpeed < 0.16);
  await controller.destroy();
});

test('ants enter one at a time from a common region with irregular delays and distinct headings', async () => {
  const controller = new AntController({ random: seededRandom(61),
    state: { population: { activationFeedback: false } } });
  await controller.init();
  await controller.init();
  assert.equal(controller.agents.length, 1, 'repeated init does not add an ant');
  let previousBirth = 0;
  const intervals = [];
  const headings = [];
  let observedSpawned = controller.totalSpawned;
  const observedIds = new Set(controller.agents.map(ant => ant.id));
  const recordBirth = () => {
    const ant = controller.agents.at(-1);
    assert.ok(Math.hypot(ant.x - 0.5, ant.y - 0.72) <= 0.018 + 1e-12);
    assert.ok(Math.abs(ant.heading + Math.PI / 2) <= 0.3);
    for (const other of controller.agents.slice(0, -1)) {
      assert.ok(Math.hypot(ant.x - other.x, ant.y - other.y)
        >= ant.radius + other.radius + 0.004 - 1e-12);
    }
    headings.push(ant.heading);
    if (controller.nextSpawnTimeMs !== null) {
      const scheduledDelay = controller.nextSpawnTimeMs - controller.simulationTimeMs;
      assert.ok(scheduledDelay >= 400 && scheduledDelay <= 900);
    }
  };
  recordBirth();
  freezeAgents(controller);
  for (let tick = 0; tick < 60 * 60 && controller.totalSpawned < 28; tick += 1) {
    freezeAgents(controller);
    controller.tick(1 / 60);
    assert.ok(controller.totalSpawned - observedSpawned <= 1, 'no batch release');
    if (controller.totalSpawned === observedSpawned) continue;
    observedSpawned = controller.totalSpawned;
    const interval = controller.simulationTimeMs - previousBirth;
    assert.ok(interval >= 400 - 1e-9);
    intervals.push(interval);
    previousBirth = controller.simulationTimeMs;
    const added = controller.agents.find(ant => !observedIds.has(ant.id));
    assert.ok(added, 'a replacement or initial entrant is observable');
    observedIds.add(added.id);
    const ant = added;
    assert.ok(Math.hypot(ant.x - 0.5, ant.y - 0.72) <= 0.018 + 1e-12);
    assert.ok(Math.abs(ant.heading + Math.PI / 2) <= 0.3);
    for (const other of controller.agents) {
      if (other === ant) continue;
      assert.ok(Math.hypot(ant.x - other.x, ant.y - other.y)
        >= ant.radius + other.radius + 0.004 - 1e-12);
    }
    headings.push(ant.heading);
    if (controller.nextSpawnTimeMs !== null) {
      const scheduledDelay = controller.nextSpawnTimeMs - controller.simulationTimeMs;
      assert.ok(scheduledDelay >= 400 && scheduledDelay <= 900);
    }
  }
  assert.equal(controller.totalSpawned, 28);
  assert.equal(controller.agents.length, 28);
  assert.equal(new Set(controller.agents.map(ant => ant.id)).size, 28);
  assert.equal(new Set(headings).size, 28);
  assert.ok(new Set(intervals.map(value => Math.round(value))).size > 5);
  assert.equal(controller.nextSpawnTimeMs, null, 'entry ends when this non-exiting fixture reaches the target');
  await controller.destroy();
});

test('occupied spawn space delays entry without allocating an overlapping agent or skipping an ID', async () => {
  const controller = new AntController({ random: seededRandom(71) });
  await controller.init();
  const blocker = controller.agents[0];
  blocker.x = 0.5; blocker.y = 0.72;
  blocker.radius = 0.03; // Covers the entire small entry disk.
  blocker.inspectionRemaining = blocker.decisionRemaining = blocker.committedRemaining = 1000;
  blocker.hesitationRemaining = 1000;
  controller.nextSpawnTimeMs = 0;
  controller.tick(1 / 60);
  assert.equal(controller.agents.length, 1);
  assert.equal(controller.nextAgentId, 2);
  assert.ok(Math.abs(controller.nextSpawnTimeMs - controller.simulationTimeMs - 120) < 1e-9);
  runTicks(controller, 7);
  assert.equal(controller.agents.length, 1, 'retry waits for its short delay');
  blocker.x = 0.8;
  controller.tick(1 / 60);
  assert.equal(controller.agents.length, 2);
  assert.equal(controller.agents[1].id, 'ant-2');
  await controller.destroy();
});

test('changing the target preserves shared history and introduces additional ants gradually', async () => {
  const controller = new AntController({ random: seededRandom(11),
    state: { population: { count: 8, activationFeedback: false } } });
  await controller.init();
  freezeAgents(controller);
  runFrozenTicks(controller, 60 * 15);
  freezeAgents(controller);
  assert.equal(controller.agents.length, 8);
  const survivors = controller.agents.slice();
  controller.field.depositSegment({ x: 0.3, y: 0.4 }, { x: 0.4, y: 0.4 });
  const before = controller.field.getSnapshot();
  assert.ok(before.totalMass > 0, 'the target-change fixture contains shared environmental history');
  controller.configure({ population: { count: 12 } });
  assert.deepEqual(controller.agents, survivors, 'configuration does not release a batch or replace agents');
  assert.deepEqual(controller.field.getSnapshot().values, before.values, 'memory survives a changed target');
  runFrozenTicks(controller, 60 * 10);
  freezeAgents(controller);
  assert.equal(controller.agents.length, 12);
  controller.configure({ population: { count: 8 } });
  assert.deepEqual(controller.agents, survivors);
  assert.equal(controller.nextSpawnTimeMs, null);
  controller.configure({ population: { count: 12 } });
  runFrozenTicks(controller, 60 * 10);
  assert.equal(new Set(controller.agents.map(ant => ant.id)).size, 12);
  await controller.destroy();
});

test('swept occupancy guard prevents direct pass-through in head-on and crossing encounters', () => {
  const occupancy = new LocalOccupancy();
  const agents = [
    { x: 0.4, y: 0.5, radius: 0.01 },
    { x: 0.6, y: 0.5, radius: 0.01 },
    { x: 0.5, y: 0.3, radius: 0.01 },
    { x: 0.5, y: 0.7, radius: 0.01 },
    { x: 0.3, y: 0.82, radius: 0.01 },
    { x: 0.4, y: 0.82, radius: 0.01 }
  ];
  const moves = [
    { x: 0.22, y: 0 },
    { x: -0.22, y: 0 },
    { x: 0, y: 0.22 },
    { x: 0, y: -0.22 },
    { x: 0.14, y: 0 },
    { x: 0.03, y: 0 }
  ];
  const scales = occupancy.constrainDisplacements(agents, moves);
  const final = agents.map((agent, index) => ({
    x: agent.x + moves[index].x * scales[index],
    y: agent.y + moves[index].y * scales[index]
  }));
  for (let i = 0; i < final.length; i += 1) {
    for (let j = i + 1; j < final.length; j += 1) {
      const distance = Math.hypot(final[i].x - final[j].x, final[i].y - final[j].y);
      assert.ok(distance >= agents[i].radius + agents[j].radius - 1e-5,
        'agents ' + i + ' and ' + j + ' stay apart (' + distance + ')');
    }
  }
  // Checking only the endpoints would allow two ants to swap places by
  // passing through each other. Verify the intervening movement as well.
  for (let sample = 0; sample <= 100; sample += 1) {
    const fraction = sample / 100;
    const positions = agents.map((agent, index) => ({
      x: agent.x + moves[index].x * scales[index] * fraction,
      y: agent.y + moves[index].y * scales[index] * fraction
    }));
    assert.ok(minSeparation(positions) >= 0.02 - 1e-6);
  }
});

test('local occupancy reads front and sides more strongly than the rear', () => {
  const occupancy = new LocalOccupancy();
  const ant = new AntAgent({ id: 'test', x: 0.5, y: 0.5, heading: 0, random: seededRandom(1) });
  const ahead = { id: 'ahead', x: 0.52, y: 0.5, radius: 0.006, personality: ant.personality };
  const behind = { id: 'behind', x: 0.48, y: 0.5, radius: 0.006, personality: ant.personality };
  const forward = occupancy.sense(ant, [ant, ahead]);
  const rear = occupancy.sense(ant, [ant, behind]);
  assert.ok(forward.frontCrowding > rear.frontCrowding);
  assert.ok(Math.hypot(forward.separationX, forward.separationY)
    > Math.hypot(rear.separationX, rear.separationY));

  const left = { id: 'left', x: 0.5, y: 0.52, radius: 0.006, personality: ant.personality };
  const right = { id: 'right', x: 0.5, y: 0.48, radius: 0.006, personality: ant.personality };
  const leftBlocked = occupancy.sense(ant, [ant, left]);
  const rightBlocked = occupancy.sense(ant, [ant, right]);
  assert.notEqual(leftBlocked.leftCrowding, leftBlocked.rightCrowding);
  assert.notEqual(rightBlocked.leftCrowding, rightBlocked.rightCrowding);

  ant.vx = 0.08;
  const near = { ...ahead, x: 0.53, vx: 0, vy: 0 };
  const far = { ...ahead, id: 'far', x: 0.57, y: 0.51, vx: 0, vy: 0 };
  assert.ok(Math.abs(occupancy.sense(ant, [ant, near, far]).frontCrowding
    - occupancy.sense(ant, [ant, far, near]).frontCrowding) < 1e-12,
  'neighbor iteration order does not change forward congestion');
});

test('probabilistic trail choice increases attraction while exploration can still choose away', async () => {
  async function sampleChoices(withTrail, seed) {
    const controller = new AntController({ random: seededRandom(seed), state: { population: { count: 8 } } });
    await controller.init();
    const ant = controller.agents[0];
    ant.x = 0.4;
    ant.y = 0.5;
    ant.heading = 0;
    ant.intentHeading = 0;
    ant.decisionRemaining = 0;
    ant.committedRemaining = 0;
    ant.inspectionRemaining = 10;
    ant.hesitationRemaining = 0;
    controller.agents = [ant];
    if (withTrail) controller.field.depositSegment(
      { x: 0.44, y: 0.5 }, { x: 0.46, y: 0.5 },
      { amountPerUnitDistance: 30, radius: 0.009 }
    );
    const headings = [];
    for (let index = 0; index < 100; index += 1) {
      ant.decisionRemaining = 0;
      ant.committedRemaining = 0;
      controller.updateIntention(ant, controller.agents, controller.occupancy.sense(ant, controller.agents), 1 / 60);
      headings.push(ant.intentHeading);
    }
    await controller.destroy();
    return headings;
  }

  const baseline = await sampleChoices(false, 32);
  const biased = await sampleChoices(true, 32);
  const forwardShare = (headings) => headings.filter((heading) => Math.abs(heading) < 0.35).length / headings.length;
  assert.ok(forwardShare(biased) > forwardShare(baseline) + 0.2,
    'a stronger trail raises the chance of choosing its direction');

  const exploring = await sampleChoices(true, 81);
  assert.ok(exploring.some((heading) => Math.abs(heading) > 0.45),
    'an exploratory ant can leave even a strong trail');
});

test('long runs across seeds remain finite, spread out, and collision stable', async () => {
  for (const seed of [4, 27, 193]) {
    const controller = new AntController({ random: seededRandom(seed) });
    await controller.init();
    let nearest = Infinity;
    let minimumSpeed = Infinity;
    let maximumSpeed = 0;
    for (let tick = 0; tick < 60 * 60; tick += 1) {
      controller.tick(1 / 60);
      nearest = Math.min(nearest, minSeparation(controller.agents));
      for (const agent of controller.agents) {
        const speed = Math.hypot(agent.vx, agent.vy);
        minimumSpeed = Math.min(minimumSpeed, speed);
        maximumSpeed = Math.max(maximumSpeed, speed);
      }
    }
    const state = controller.getSnapshot();
    assert.ok(state.agents.length <= state.state.population.count);
    assert.equal(state.analysis.totalSpawned, state.analysis.totalRetired + state.agents.length);
    assert.ok(state.agents.every((agent) =>
      Number.isFinite(agent.x) && Number.isFinite(agent.y)
      && Number.isFinite(agent.vx) && Number.isFinite(agent.vy)));
    assert.ok(state.agents.every((agent) => agent.x >= 0 && agent.x <= 1
      && agent.y >= 0 && agent.y <= 1), 'active ants remain in the observed field');
    assert.ok(maximumSpeed < 0.18);
    assert.ok(minimumSpeed < 0.003, 'occasional near-stops are part of the gait');
    assert.ok(maximumSpeed - minimumSpeed > 0.04, 'ants accelerate and decelerate at different rates');
    assert.ok(spread(state.agents) > 0.18, 'agents do not collapse into a point');
    assert.ok(nearest >= state.agents[0].radius * 2 - 1e-6,
      'no timestep permits body pass-through; minimum was ' + nearest);
    assert.ok(state.analysis.pheromoneMass > 0);
    await controller.destroy();
  }
});

test('a dense equal-agent cluster disperses without body overlap or unstable velocity', async () => {
  // Keep the larger stress case even though the demonstration defaults to 28.
  const controller = new AntController({ random: seededRandom(48), state: { population: { count: 64 } } });
  await controller.init();
  movementFixture(controller, 64, seededRandom(48));
  for (let index = 0; index < controller.agents.length; index += 1) {
    const agent = controller.agents[index];
    agent.x = 0.44 + (index % 8) * 0.017;
    agent.y = 0.44 + Math.floor(index / 8) * 0.017;
    agent.heading = Math.atan2(0.5 - agent.y, 0.5 - agent.x);
    agent.intentHeading = agent.heading;
    agent.vx = Math.cos(agent.heading) * agent.personality.preferredSpeed;
    agent.vy = Math.sin(agent.heading) * agent.personality.preferredSpeed;
    agent.decisionRemaining = 0.3;
    agent.committedRemaining = 0.5;
  }

  let nearest = Infinity;
  for (let tick = 0; tick < 60 * 20; tick += 1) {
    controller.tick(1 / 60);
    nearest = Math.min(nearest, minSeparation(controller.agents));
    assert.ok(controller.agents.every((agent) => Number.isFinite(agent.x + agent.y + agent.vx + agent.vy)));
  }
  assert.ok(nearest >= 0.012 - 1e-6);
  assert.ok(spread(controller.agents) > 0.05, 'the cluster opens into available space');
  await controller.destroy();
});

test('near-boundary body collisions still prevent overlap', async () => {
  const controller = new AntController({ random: seededRandom(77) });
  await controller.init();
  const [wallAnt, followingAnt] = movementFixture(controller, 2, seededRandom(77));
  wallAnt.x = 0.02;
  wallAnt.y = 0.5;
  wallAnt.heading = Math.PI;
  wallAnt.intentHeading = Math.PI;
  wallAnt.vx = -0.08;
  wallAnt.vy = 0;
  followingAnt.x = wallAnt.x + 0.035;
  followingAnt.y = 0.5;
  followingAnt.heading = Math.PI;
  followingAnt.intentHeading = Math.PI;
  followingAnt.vx = -0.08;
  followingAnt.vy = 0;
  for (let tick = 0; tick < 10; tick += 1) {
    controller.tick(1 / 60);
    assert.ok(controller.agents.includes(wallAnt) && controller.agents.includes(followingAnt));
    assert.ok(Math.hypot(wallAnt.x - followingAnt.x, wallAnt.y - followingAnt.y)
      >= wallAnt.radius + followingAnt.radius - 1e-6);
  }
  await controller.destroy();
});

test('fixed-step controller is deterministic across equivalent frame schedules', async () => {
  const first = new AntController({ random: seededRandom(902) });
  const second = new AntController({ random: seededRandom(902) });
  await Promise.all([first.init(), second.init()]);
  first.update(0);
  second.update(0);
  for (let frame = 1; frame <= 120; frame += 1) first.update(frame * (1000 / 60));
  for (let frame = 1; frame <= 60; frame += 1) second.update(frame * (1000 / 30));
  const a = first.getSnapshot();
  const b = second.getSnapshot();
  assert.equal(a.analysis.simulationTimeMs, b.analysis.simulationTimeMs);
  assert.deepEqual(a.agents, b.agents);
  assert.deepEqual(a.pheromone.values, b.pheromone.values);
  await Promise.all([first.destroy(), second.destroy()]);
});

test('stop and destroy halt simulation and detach listeners', async () => {
  const controller = new AntController({ random: seededRandom(3) });
  await controller.init();
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => { notifications += 1; });
  controller.update(0);
  controller.update(1000 / 60);
  const beforeStop = controller.getSnapshot().analysis.simulationTimeMs;
  assert.equal(controller.stop(), true);
  assert.equal(controller.nextSpawnTimeMs, null);
  const afterStopNotifications = notifications;
  controller.update(5000);
  controller.tick(5);
  assert.equal(controller.agents.length, 1, 'stopped entry cannot release pending ants');
  assert.equal(controller.getSnapshot().analysis.simulationTimeMs, beforeStop);
  assert.equal(notifications, afterStopNotifications);
  unsubscribe();
  await controller.destroy();
  assert.equal(controller.update(6000), false);
  assert.equal(notifications, afterStopNotifications);
  assert.equal(controller.agents.length, 0);
  assert.equal(controller.field, null);
  controller.tick(5);
  assert.equal(controller.nextSpawnTimeMs, null);
  assert.equal(controller.agents.length, 0);
});

test('an isolated ant has repeated near-stops after warmup and resumes forward movement', async () => {
  for (const seed of [9, 52, 240]) {
    const controller = new AntController({ random: seededRandom(seed),
      state: { population: { activationFeedback: false } } });
    await controller.init();
    controller.syncRecruitment = () => {};
    const ant = controller.agents[0];
    controller.agents = [ant];
    controller.nextSpawnTimeMs = null;
    ant.x = 0.5;
    ant.y = 0.5;
    let nearStops = 0;
    let moving = 0;
    for (let tick = 0; tick < 60 * 60; tick += 1) {
      const before = { vx: ant.vx, vy: ant.vy };
      controller.tick(1 / 60);
      assert.ok(Number.isFinite(ant.vx) && Number.isFinite(ant.vy), 'velocity remains finite');
      assert.ok(Math.hypot(ant.vx, ant.vy) <= ant.personality.preferredSpeed * 1.35 + 1e-9,
        'the current kinematic speed cap remains enforced');
      assert.ok(Math.abs(ant.angularVelocity) <= 4.5 + 1e-9,
        'heading response respects the approved maximum turn rate');
      if (tick <= 60 * 5) continue;
      const speed = Math.hypot(ant.vx, ant.vy);
      if (speed < ant.personality.preferredSpeed * 0.15) nearStops += 1;
      if (speed > ant.personality.preferredSpeed * 0.6) moving += 1;
    }
    assert.ok(nearStops > 10, 'near-stops occur without body congestion or startup inertia');
    assert.ok(moving > 100, 'the ant resumes committed movement between hesitations');
    await controller.destroy();
  }
});

test('approaching bodies brake smoothly before a head-on contact', async () => {
  for (const count of [28, 64]) {
    const controller = new AntController({ random: seededRandom(17), state: { population: { count } } });
    await controller.init();
    const [a, b] = movementFixture(controller, 2, () => 0.5);
    a.x = 0.4; a.y = 0.5; a.heading = 0;
    b.x = 0.52; b.y = 0.5; b.heading = Math.PI;
    for (const ant of controller.agents) {
      ant.intentHeading = ant.heading;
      ant.vx = Math.cos(ant.heading) * 0.06;
      ant.vy = 0;
      ant.inspectionRemaining = ant.decisionRemaining = ant.committedRemaining = 1000;
      ant.hesitationRemaining = 0;
    }
    let minimumSpeed = Infinity;
    const initialHeadOnSpeed = 0.06;
    for (let tick = 0; tick < 300; tick += 1) {
      controller.tick(1 / 60);
      for (const ant of controller.agents) {
        const speed = Math.hypot(ant.vx, ant.vy);
        assert.ok(Number.isFinite(speed), 'head-on avoidance keeps velocity finite');
        assert.ok(speed <= ant.personality.preferredSpeed * 1.35 + 1e-9,
          'head-on avoidance respects the current kinematic speed cap');
        assert.ok(Math.abs(ant.angularVelocity) <= 4.5 + 1e-9,
          'avoidance turns remain within the current turn-rate limit');
        minimumSpeed = Math.min(minimumSpeed, speed);
      }
      assert.ok(minSeparation(controller.agents) >= a.radius + b.radius - 1e-6);
    }
    assert.ok(minimumSpeed < initialHeadOnSpeed * 0.75,
      'anticipatory braking reduces speed before contact');
    await controller.destroy();
  }
});

test('agents use bounded turn rate and exponential velocity response', () => {
  const agent = new AntAgent({ id: 'one', x: 0.5, y: 0.5, heading: 0, random: seededRandom(52) });
  agent.turnToward(Math.PI * 0.9, 1 / 60);
  assert.ok(Math.abs(agent.heading) <= 4.5 / 60 + 1e-12, 'turn is bounded by 4.5 radians per second');
  assert.ok(Math.abs(agent.angularVelocity - 4.5) < 1e-12);
  const preferredSpeed = agent.personality.preferredSpeed;
  const response = 1 - Math.exp(-32 / 60);
  agent.accelerateToward(agent.personality.preferredSpeed, 1 / 60);
  assert.ok(Math.abs(Math.hypot(agent.vx, agent.vy) - preferredSpeed * response) < 1e-12,
    'from rest, speed follows the configured exponential acceleration response');
  assert.ok(Math.hypot(agent.vx, agent.vy) <= preferredSpeed * 1.35);
});

test('long-range discovery ignores weak residue and favors reinforced trails probabilistically', async () => {
  async function choices(signal) {
    const controller = new AntController({ random: seededRandom(305) });
    await controller.init();
    const ant = controller.agents[0];
    controller.agents = [ant];
    ant.x = 0.4; ant.y = 0.5; ant.heading = 0;
    ant.inspectionRemaining = 1000;
    ant.hesitationRemaining = 0;
    // A thin local trail in front of the ant; the rest of the environment is empty.
    controller.field.sample = (_x, y) => Math.abs(y - 0.5) < 0.004 ? signal : 0;
    let forward = 0;
    for (let trial = 0; trial < 2000; trial += 1) {
      ant.decisionRemaining = ant.committedRemaining = 0;
      // Keep this regression focused on discovery; local sensory persistence
      // has separate coverage and can already hold a moderately strong route.
      controller.updateIntention(ant, [ant], controller.occupancy.sense(ant, [ant]), 1 / 60,
        { strength: 0, coherence: 0 });
      if (Math.abs(ant.intentHeading) < 0.2) forward += 1;
    }
    const confidence = ant.trailConfidence;
    await controller.destroy();
    return { forward: forward / 2000, confidence };
  }
  const empty = await choices(0);
  const weak = await choices(0.005);
  const middle = await choices(0.025);
  const strong = await choices(0.14);
  assert.ok(Math.abs(weak.forward - empty.forward) < 0.03, 'weak directional haze is almost ignored');
  assert.ok(weak.confidence < 0.01);
  assert.ok(middle.forward > weak.forward + 0.15);
  assert.ok(strong.forward > middle.forward + 0.25, 'reinforcement produces a steep attraction response');
  assert.ok(strong.forward > 0.85 && strong.forward < 0.99, 'clear trails reduce wandering without eliminating it');
  assert.ok(strong.confidence > 0.9);
});

test('a wide sensor discovers a thin adjacent trail without broadening the pheromone field', async () => {
  const controller = new AntController({ random: seededRandom(20) });
  await controller.init();
  const ant = controller.agents[0];
  ant.x = 0.4; ant.y = 0.5; ant.heading = 0;
  controller.field.depositSegment({ x: 0.43, y: 0.514 }, { x: 0.7, y: 0.514 });
  const before = controller.field.getSnapshot();
  const pointSignal = controller.field.sample(ant.x + controller.state.behavior.sensorDistance, ant.y);
  assert.equal(pointSignal, 0, 'the ant is outside the narrow deposit');
  assert.ok(controller.senseTrail(ant, 0) > 0.005, 'the nearby trail is still discoverable');
  assert.deepEqual(controller.field.getSnapshot().values, before.values, 'sensing does not diffuse the field');
  await controller.destroy();
});

test('distance deposition keeps convex adherence reinforcement above the evidence baseline', async () => {
  const adherenceLevels = [0, 0.1, 0.5, 0.9, 1];
  const captures = await Promise.all(adherenceLevels.map(adherence =>
    captureOneDeposit({ adherence })));
  const rates = captures.map(({ deposits }) => {
    assert.equal(deposits.length, 1, 'each moving ant deposits one traveled segment');
    return deposits[0].amountPerUnitDistance;
  });
  const expectedMultipliers = adherenceLevels.map(value => 0.375 + 0.125 * value + 5 * value ** 2);
  for (let index = 0; index < rates.length; index += 1) {
    assert.ok(Math.abs(rates[index] / 4.5 - expectedMultipliers[index]) < 1e-12,
      'adherence ' + adherenceLevels[index] + ' uses the configured quadratic multiplier');
  }
  const slopes = rates.slice(1).map((rate, index) =>
    (rate - rates[index]) / (adherenceLevels[index + 1] - adherenceLevels[index]));
  assert.ok(slopes.every((slope, index) => index === 0 || slope > slopes[index - 1]),
    'successive slopes increase as adherence strengthens');
  assert.ok(rates[0] > 0 && rates[0] < 4.5, 'weakly adherent exploration still leaves a trace');
  assert.ok(rates.at(-1) >= rates[0] * 11, 'a coherent path receives a substantial reinforcement');
  assert.ok(captures.every(({ deposits }) => deposits[0].radius === 0.0045),
    'the reinforcement change preserves the configured deposition radius');
});

test('far pheromone concentration does not add to deposition at fixed local evidence', async () => {
  const emptyField = await captureOneDeposit({ adherence: 0.7, rawSignal: 0 });
  const strongField = await captureOneDeposit({ adherence: 0.7, rawSignal: 0.14 });
  assert.equal(emptyField.deposits.length, 1);
  assert.equal(strongField.deposits.length, 1);
  assert.equal(emptyField.deposits[0].amountPerUnitDistance,
    strongField.deposits[0].amountPerUnitDistance);
  assert.equal(emptyField.deposits[0].distance, strongField.deposits[0].distance);
});

test('configured base amount and bounded reinforcement gain scale real deposits', async () => {
  const baseAmount = 2.5;
  const noGain = await captureOneDeposit({ adherence: 1, amountPerUnitDistance: baseAmount, reinforcementGain: 0 });
  const aboveMaximum = await captureOneDeposit({ adherence: 1, amountPerUnitDistance: baseAmount, reinforcementGain: 7 });
  const negativeGain = await captureOneDeposit({ adherence: 0.5, amountPerUnitDistance: baseAmount, reinforcementGain: -2 });
  assert.equal(noGain.deposits[0].amountPerUnitDistance, baseAmount * 0.5,
    'zero configurable gain retains the weak baseline trace');
  assert.equal(aboveMaximum.deposits[0].amountPerUnitDistance, baseAmount * 5.5,
    'the normalized gain clamps at 5');
  assert.equal(negativeGain.deposits[0].amountPerUnitDistance, baseAmount * 0.4375,
    'negative gain clamps at 0');
  assert.ok(noGain.pheromoneMass > 0 && aboveMaximum.pheromoneMass > noGain.pheromoneMass,
    'the configured base and reinforcement affect the actual shared field');

  const defaultController = new AntController({ random: seededRandom(75) });
  assert.equal(defaultController.getState().pheromone.reinforcementGain, 5);
  await defaultController.destroy();
});

test('a stationary ant adds no pheromone despite the nonzero deposition baseline', async () => {
  const stopped = await captureOneDeposit({ adherence: 1, stationary: true });
  assert.equal(stopped.deposits.length, 0);
  assert.equal(stopped.pheromoneMass, 0);
});
