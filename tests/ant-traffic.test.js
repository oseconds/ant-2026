import test from 'node:test';
import assert from 'node:assert/strict';
import { AntAgent } from '../src/lib/agents/ant/AntAgent.js';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { LocalOccupancy } from '../src/lib/agents/ant/LocalOccupancy.js';

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function ant(id, x, y, heading, vx, vy, random = seededRandom(id.length * 19)) {
  const result = new AntAgent({ id, x, y, heading, random });
  result.vx = vx;
  result.vy = vy;
  return result;
}

function sameFlowPair(gap = 0.04) {
  const follower = ant('follower', 0.4, 0.5, 0, 0.08, 0);
  const leader = ant('leader', 0.4 + gap, 0.5, 0, 0.06, 0);
  return { follower, leader };
}

test('aligned moving ant ahead regulates headway without occupancy steering', () => {
  const occupancy = new LocalOccupancy();
  const { follower, leader } = sameFlowPair();
  const sensed = occupancy.sense(follower, [follower, leader]);
  assert.equal(sensed.frontCrowding, 0);
  assert.equal(sensed.leftCrowding, 0);
  assert.equal(sensed.rightCrowding, 0);
  assert.equal(sensed.separationX, 0);
  assert.equal(sensed.separationY, 0);
  assert.ok(Number.isFinite(sensed.followingSpeedLimit));
  assert.ok(sensed.followingSpeedLimit < Math.hypot(follower.vx, follower.vy));
  assert.equal(occupancy.crowdingInDirection(follower, [follower, leader], 0), 0);
});

test('opposing, crossing, stopped, rear, and adjacent-lane bodies are not classified as same flow', () => {
  const occupancy = new LocalOccupancy();
  const makeObserver = () => ant('observer', 0.4, 0.5, 0, 0.07, 0);
  const cases = [
    ['opposing', (x, y) => ant('opposite', x, y, Math.PI, -0.06, 0)],
    ['crossing', (x, y) => ant('crossing', x, y, Math.PI / 2, 0, 0.06)],
    ['stationary', (x, y) => ant('stopped', x, y, 0, 0, 0)],
    ['near-stationary', (x, y) => ant('slow', x, y, 0, 0.007, 0)],
    ['heading and velocity disagree', (x, y) => ant('disagree', x, y, 0, -0.06, 0)]
  ];
  for (const [label, makeOther] of cases) {
    const observer = makeObserver();
    const other = makeOther(0.44, 0.5);
    const sensed = occupancy.sense(observer, [observer, other]);
    assert.ok(sensed.frontCrowding > 0, label + ' body remains a forward obstacle');
    assert.ok(sensed.separationX < 0, label + ' body retains separation force');
    assert.equal(sensed.followingSpeedLimit, Infinity, label + ' does not set a following pace');
    assert.ok(occupancy.crowdingInDirection(observer, [observer, other], 0) > 0,
      label + ' retains candidate-direction occupancy');
  }

  const observer = makeObserver();
  const rear = ant('rear', 0.36, 0.5, 0, 0.06, 0);
  const rearSense = occupancy.sense(observer, [observer, rear]);
  assert.equal(rearSense.followingSpeedLimit, Infinity);
  assert.equal(occupancy.crowdingInDirection(observer, [observer, rear], 0), 0);

  const parallel = ant('parallel', 0.44, 0.53, 0, 0.06, 0);
  const parallelSense = occupancy.sense(observer, [observer, parallel]);
  assert.equal(parallelSense.followingSpeedLimit, Infinity);
  assert.ok(occupancy.crowdingInDirection(observer, [observer, parallel], 0) > 0,
    'a nearby body in an adjacent lane still costs a candidate path');

  const stoppedObserver = ant('restarting', 0.4, 0.5, 0, 0, 0);
  const movingFrontAnt = ant('moving-front', 0.44, 0.5, 0, 0.06, 0);
  const restartSense = occupancy.sense(stoppedObserver, [stoppedObserver, movingFrontAnt]);
  assert.equal(restartSense.frontCrowding, 0,
    'a stopped observer can recognize a moving same-route ant while restarting');
  assert.ok(Number.isFinite(restartSense.followingSpeedLimit));
});

test('same-flow classification is independent of neighbor order and restores emergency separation at close range', () => {
  const occupancy = new LocalOccupancy();
  const { follower, leader } = sameFlowPair(0.05);
  const slowerLeader = ant('slower', 0.46, 0.5, 0, 0.05, 0);
  const first = occupancy.sense(follower, [follower, leader, slowerLeader]);
  const reversed = occupancy.sense(follower, [slowerLeader, leader, follower]);
  assert.equal(first.frontCrowding, 0);
  assert.equal(first.separationX, 0);
  assert.equal(first.followingSpeedLimit, reversed.followingSpeedLimit);
  assert.equal(first.frontCrowding, reversed.frontCrowding);
  assert.equal(first.separationX, reversed.separationX);

  const closeLeader = ant('close', follower.x + 0.014, follower.y, 0, 0.07, 0);
  const close = occupancy.sense(follower, [follower, closeLeader]);
  assert.ok(close.frontCrowding > 0, 'dangerously close aligned bodies use obstacle braking');
  assert.ok(close.separationX < 0, 'dangerously close aligned bodies retain physical separation');
  assert.equal(close.followingSpeedLimit, Infinity);

  const rapidFollower = ant('rapid', 0.4, 0.5, 0, 0.14, 0);
  const rapidFrontAnt = ant('rapid-front', 0.43, 0.5, 0, 0.02, 0);
  const clearance = Math.hypot(rapidFrontAnt.x - rapidFollower.x, rapidFrontAnt.y - rapidFollower.y)
    - rapidFollower.radius - rapidFrontAnt.radius;
  assert.ok(clearance > rapidFollower.personality.personalSpacing * 0.2,
    'rapid-closing case begins outside the danger-distance threshold');
  const rapid = occupancy.sense(rapidFollower, [rapidFollower, rapidFrontAnt]);
  assert.ok(rapid.frontCrowding > 0, 'short predicted contact time restores obstacle braking');
  assert.ok(rapid.separationX < 0, 'short predicted contact time restores avoidance');
  assert.equal(rapid.followingSpeedLimit, Infinity);
});

test('strong-trail procession advances with headway, low lateral drift, and no swept overlap', async () => {
  const controller = new AntController({ random: seededRandom(707) });
  await controller.init();
  const random = seededRandom(718);
  const positions = [0.32, 0.38, 0.44, 0.50];
  controller.agents = positions.map((x, index) => {
    const speed = index === 0 ? 0.12 : 0.06;
    const y = index === 2 ? 0.502 : 0.5;
    const agent = ant('line-' + index, x, y, 0, speed, 0, random);
    agent.intentHeading = 0;
    agent.trailAdherence = 1;
    agent.trailConfidence = 1;
    agent.inspectionRemaining = 100;
    agent.decisionRemaining = 100;
    agent.committedRemaining = 100;
    agent.hesitationRemaining = 0;
    agent.speedPhase = -Math.PI / 2;
    return agent;
  });
  controller.nextSpawnTimeMs = null;
  for (let pass = 0; pass < 12; pass += 1) {
    controller.field.depositSegment({ x: 0.12, y: 0.5 }, { x: 0.9, y: 0.5 }, {
      amountPerUnitDistance: controller.state.pheromone.amountPerUnitDistance,
      radius: controller.state.pheromone.radius
    });
  }

  const initialX = controller.agents.map(agent => agent.x);
  let minimumGap = Infinity;
  let maximumLateralOffset = Math.max(...controller.agents.map(agent => Math.abs(agent.y - 0.5)));
  for (let tick = 0; tick < 240; tick += 1) {
    const before = controller.agents.map(agent => ({ x: agent.x, y: agent.y }));
    controller.tick(1 / 60);
    for (let index = 0; index < controller.agents.length - 1; index += 1) {
      const rear = controller.agents[index], front = controller.agents[index + 1];
      const dx = front.x - rear.x;
      const dy = front.y - rear.y;
      minimumGap = Math.min(minimumGap, Math.hypot(dx, dy));
      maximumLateralOffset = Math.max(maximumLateralOffset, Math.abs(rear.y - 0.5), Math.abs(front.y - 0.5));
      assert.ok(dx > 0, 'ants preserve their sequence along the route');
      assert.ok(Math.hypot(dx, dy) >= rear.radius + front.radius - 1e-6,
        'body clearance is maintained');

      // Exact closest approach for linear relative motion during this tick.
      const rx = before[index + 1].x - before[index].x;
      const ry = before[index + 1].y - before[index].y;
      const relativeX = (front.x - before[index + 1].x) - (rear.x - before[index].x);
      const relativeY = (front.y - before[index + 1].y) - (rear.y - before[index].y);
      const relativeLengthSquared = relativeX * relativeX + relativeY * relativeY;
      const closestT = Math.max(0, Math.min(1,
        -(rx * relativeX + ry * relativeY) / (relativeLengthSquared || 1)));
      const sweptDistance = Math.hypot(rx + relativeX * closestT, ry + relativeY * closestT);
      assert.ok(sweptDistance >= rear.radius + front.radius - 1e-6,
        'exact swept closest approach stays outside combined radii');
    }
    assert.ok(controller.agents.every(agent => Number.isFinite(agent.x + agent.y + agent.vx + agent.vy)));
    assert.ok(controller.agents.every(agent => Math.hypot(agent.vx, agent.vy)
      < agent.personality.preferredSpeed * 1.35 + 1e-9),
      'velocity remains within each ant speed bound');
  }

  assert.ok(controller.agents.every((agent, index) => agent.x > initialX[index] + 0.03),
    'all ants make sustained progress along the strong pheromone route');
  assert.ok(maximumLateralOffset < 0.015, 'the sequence stays near the pheromone centerline');
  assert.ok(minimumGap >= 0.012 - 1e-6, 'following never permits body overlap');
  assert.ok(controller.agents[0].vx < 0.12, 'the faster rear ant regulates its pace');
  await controller.destroy();
});
