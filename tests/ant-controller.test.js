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

test('population has equal agents with stable individual personalities and shared pheromone memory', async () => {
  const controller = new AntController({ random: seededRandom(10) });
  await controller.init();
  const initial = controller.getSnapshot();
  assert.equal(initial.agents.length, 64);
  assert.ok(initial.agents.every((agent) => agent.id.startsWith('ant-')));
  assert.ok(initial.agents.every((agent) => Number.isFinite(agent.personality.preferredSpeed)));
  assert.equal('leader' in initial, false);
  assert.equal('followers' in initial, false);
  assert.equal('mode' in initial, false);
  assert.ok(initial.analysis.minSeparation > 0.02);

  const personality = controller.agents.map((agent) => ({ ...agent.personality }));
  runTicks(controller, 60 * 20);
  const updated = controller.getSnapshot();
  assert.ok(updated.analysis.pheromoneMass > 0, 'walking deposits path memory');
  assert.ok(updated.agents.some((agent, index) =>
    Math.hypot(agent.x - initial.agents[index].x, agent.y - initial.agents[index].y) > 0.04));
  assert.deepEqual(controller.agents.map((agent) => agent.personality), personality,
    'individual differences persist rather than changing each frame');
  assert.ok(new Set(personality.map((item) => item.preferredSpeed)).size > 1);
  assert.ok(updated.analysis.meanSpeed > 0.005 && updated.analysis.meanSpeed < 0.16);
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

test('long runs across seeds remain finite, bounded, spread out, and collision stable', async () => {
  for (const seed of [4, 27, 193]) {
    const controller = new AntController({ random: seededRandom(seed) });
    await controller.init();
    let nearest = Infinity;
    let minimumSpeed = Infinity;
    let maximumSpeed = 0;
    for (let tick = 0; tick < 60 * 20; tick += 1) {
      controller.tick(1 / 60);
      nearest = Math.min(nearest, minSeparation(controller.agents));
      for (const agent of controller.agents) {
        const speed = Math.hypot(agent.vx, agent.vy);
        minimumSpeed = Math.min(minimumSpeed, speed);
        maximumSpeed = Math.max(maximumSpeed, speed);
      }
    }
    const state = controller.getSnapshot();
    assert.ok(state.agents.every((agent) =>
      Number.isFinite(agent.x) && Number.isFinite(agent.y)
      && Number.isFinite(agent.vx) && Number.isFinite(agent.vy)));
    assert.ok(state.agents.every((agent) => agent.x >= agent.radius && agent.x <= 1 - agent.radius
      && agent.y >= agent.radius && agent.y <= 1 - agent.radius));
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
  const controller = new AntController({ random: seededRandom(48) });
  await controller.init();
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

test('wall contact constrains movement before the pair collision guard', async () => {
  const controller = new AntController({ random: seededRandom(77) });
  await controller.init();
  const [wallAnt, followingAnt] = controller.agents;
  wallAnt.x = wallAnt.radius + 0.0002;
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
  for (let tick = 0; tick < 600; tick += 1) {
    controller.tick(1 / 60);
    assert.ok(wallAnt.x >= wallAnt.radius && followingAnt.x >= followingAnt.radius);
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
  const afterStopNotifications = notifications;
  controller.update(5000);
  assert.equal(controller.getSnapshot().analysis.simulationTimeMs, beforeStop);
  assert.equal(notifications, afterStopNotifications);
  unsubscribe();
  await controller.destroy();
  assert.equal(controller.update(6000), false);
  assert.equal(notifications, afterStopNotifications);
  assert.equal(controller.agents.length, 0);
  assert.equal(controller.field, null);
});

test('an isolated ant has repeated near-stops after warmup and resumes forward movement', async () => {
  for (const seed of [9, 52, 240]) {
    const controller = new AntController({ random: seededRandom(seed) });
    await controller.init();
    const ant = controller.agents[0];
    controller.agents = [ant];
    ant.x = 0.5;
    ant.y = 0.5;
    let nearStops = 0;
    let moving = 0;
    for (let tick = 0; tick < 60 * 60; tick += 1) {
      const before = { vx: ant.vx, vy: ant.vy };
      controller.tick(1 / 60);
      assert.ok(Math.hypot(ant.vx - before.vx, ant.vy - before.vy)
        <= ant.personality.acceleration / 60 + 1e-9, 'free movement preserves acceleration limits');
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
  const controller = new AntController({ random: seededRandom(17) });
  await controller.init();
  const [a, b] = controller.agents;
  controller.agents = [a, b];
  a.x = 0.4; a.y = 0.5; a.heading = 0;
  b.x = 0.52; b.y = 0.5; b.heading = Math.PI;
  for (const ant of controller.agents) {
    ant.intentHeading = ant.heading;
    ant.vx = Math.cos(ant.heading) * 0.06;
    ant.vy = 0;
    ant.inspectionRemaining = ant.decisionRemaining = ant.committedRemaining = 1000;
    ant.hesitationRemaining = 0;
  }
  for (let tick = 0; tick < 300; tick += 1) {
    const before = controller.agents.map(ant => ({ vx: ant.vx, vy: ant.vy }));
    controller.tick(1 / 60);
    for (const [index, ant] of controller.agents.entries()) {
      assert.ok(Math.hypot(ant.vx - before[index].vx, ant.vy - before[index].vy)
        <= (ant.personality.acceleration + 0.01) / 60,
      'anticipatory braking avoids an abrupt stop at full speed');
    }
    assert.ok(minSeparation(controller.agents) >= a.radius + b.radius - 1e-6);
  }
  await controller.destroy();
});

test('agents retain independent inertia and angular motion is smooth and finite', () => {
  const agent = new AntAgent({ id: 'one', x: 0.5, y: 0.5, heading: 0, random: seededRandom(52) });
  agent.turnToward(Math.PI * 0.9, 1 / 60);
  assert.ok(Math.abs(agent.heading) < 0.1, 'heading responds over time instead of snapping');
  agent.accelerateToward(agent.personality.preferredSpeed, 1 / 60);
  assert.ok(Math.hypot(agent.vx, agent.vy) < agent.personality.acceleration / 30);
});
