import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';

function countedRandom(seed = 101) {
  let value = seed >>> 0;
  const random = () => {
    random.calls += 1;
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
  random.calls = 0;
  return random;
}

function freezePopulation(controller) {
  for (const [index, ant] of controller.agents.entries()) {
    ant.x = 0.2 + index * 0.024;
    ant.y = 0.2;
    ant.vx = ant.vy = 0;
    ant.turnToward = () => {};
    ant.accelerateToward = () => {};
    ant.inspectionRemaining = ant.decisionRemaining = ant.committedRemaining = 1000;
    ant.hesitationRemaining = 0;
  }
}

function annularRouteField({ strength = 1, sectors = [0, 1, 2, 3] } = {}) {
  const origin = { x: 0.5, y: 0.72 };
  const radii = [0.06, 0.09, 0.12];
  return { sample(x, y) {
    const dx = x - origin.x, dy = y - origin.y;
    const radius = Math.hypot(dx, dy);
    if (!radii.some(candidate => Math.abs(candidate - radius) < 1e-7)) return 0;
    const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.round(angle / (Math.PI * 2) * 16) % 16;
    return sectors.includes(sector) ? strength : 0;
  } };
}

test('cold colonies recruit gradually to the floor with bounded delays and blocked-entry retries', async () => {
  const controller = new AntController({ random: countedRandom(61) });
  await controller.init();
  assert.equal(controller.getSnapshot().analysis.colonyActivation.recruitmentLimit, 8);
  assert.equal(controller.agents.length, 1, 'initialization still creates only one ant');
  let previousBirth = controller.simulationTimeMs;
  let previousSpawned = controller.totalSpawned;
  const intervals = [];
  for (let tick = 0; tick < 60 * 15 && controller.agents.length < 8; tick += 1) {
    freezePopulation(controller);
    controller.tick(1 / 60);
    assert.ok(controller.agents.length <= 8, 'cold evidence never raises the floor target');
    assert.ok(controller.totalSpawned - previousSpawned <= 1, 'at most one ant is added per tick');
    if (controller.totalSpawned > previousSpawned) {
      intervals.push(controller.simulationTimeMs - previousBirth);
      previousBirth = controller.simulationTimeMs;
      previousSpawned = controller.totalSpawned;
    }
  }
  assert.equal(controller.agents.length, 8);
  assert.ok(intervals.length >= 6);
  assert.ok(intervals.every(interval => interval >= 400 - 1e-9 && interval <= 900 + 1e-9));
  assert.equal(controller.nextSpawnTimeMs, null, 'entry pauses at the cold floor');
  await controller.destroy();

  const blocked = new AntController({ random: countedRandom(71) });
  await blocked.init();
  const blocker = blocked.agents[0];
  blocker.x = 0.5; blocker.y = 0.72; blocker.radius = 0.03;
  blocker.vx = blocker.vy = 0;
  blocker.turnToward = blocker.accelerateToward = () => {};
  blocker.inspectionRemaining = blocker.decisionRemaining = blocker.committedRemaining = 1000;
  blocked.nextSpawnTimeMs = blocked.simulationTimeMs + 400;
  for (let tick = 0; tick < 24; tick += 1) blocked.tick(1 / 60);
  assert.equal(blocked.agents.length, 1);
  assert.ok(Math.abs(blocked.nextSpawnTimeMs - blocked.simulationTimeMs - 120) < 1e-8,
    'an occupied entrance retries after 120 ms');
  for (let tick = 0; tick < 7; tick += 1) blocked.tick(1 / 60);
  assert.equal(blocked.agents.length, 1, 'the retry does not release early');
  blocker.x = 0.8;
  blocked.tick(1 / 60);
  assert.equal(blocked.agents.length, 2);
  assert.equal(blocked.agents[1].id, 'ant-2');
  const nextDelay = blocked.nextSpawnTimeMs - blocked.simulationTimeMs;
  assert.ok(nextDelay >= 400 && nextDelay <= 900);
  await blocked.destroy();
});

test('sustained local evidence raises the limit gradually; decay pauses recruitment without culling living ants', async () => {
  const random = countedRandom(811);
  const controller = new AntController({ random });
  await controller.init();
  const activeRoute = annularRouteField({ strength: 0.04 });
  controller.field.sample = activeRoute.sample.bind(activeRoute);
  let maximumPopulation = controller.agents.length;
  let previousSpawned = controller.totalSpawned;
  let previousBirthTime = controller.simulationTimeMs;
  const scheduledDelays = [];
  for (let tick = 0; tick < 45 * 60; tick += 1) {
    const previousDeadline = controller.nextSpawnTimeMs;
    freezePopulation(controller);
    controller.tick(1 / 60);
    if (previousDeadline === null && controller.nextSpawnTimeMs !== null) {
      const delay = controller.nextSpawnTimeMs - controller.simulationTimeMs;
      assert.ok(delay >= 400 - 1e-9 && delay <= 900 + 1e-9,
        'each resumed recruitment window keeps the existing irregular cadence');
      scheduledDelays.push(delay);
    }
    maximumPopulation = Math.max(maximumPopulation, controller.agents.length);
    assert.ok(controller.totalSpawned - previousSpawned <= 1, 'raised demand still recruits at most one per tick');
    if (controller.totalSpawned > previousSpawned) {
      const interval = controller.simulationTimeMs - previousBirthTime;
      if (previousSpawned === 1) assert.ok(interval >= 400 - 1e-9 && interval <= 900 + 1e-9);
      previousBirthTime = controller.simulationTimeMs;
      previousSpawned = controller.totalSpawned;
    }
  }
  const routeSnapshot = controller.getSnapshot().analysis.colonyActivation;
  assert.ok(routeSnapshot.activation > 0 && routeSnapshot.activation < routeSnapshot.evidence,
    'controller activation responds gradually instead of mirroring instantaneous evidence');
  assert.ok(routeSnapshot.desiredPopulation > 8 && routeSnapshot.desiredPopulation < 28);
  assert.ok(routeSnapshot.recruitmentLimit > 8);
  assert.ok(maximumPopulation > 8 && maximumPopulation < 28,
    'controller ticks gradually recruit above the cold floor, below the configured ceiling');
  assert.ok(scheduledDelays.length > 0);

  controller.field.sample = () => 0;
  const oneDecay = controller.colonyActivation.advance({ sample: () => 0 }, 45);
  assert.ok(oneDecay.activation > 0 && oneDecay.activation < routeSnapshot.activation);
  assert.ok(oneDecay.desiredPopulation > 8, 'one empty interval decays rather than erasing route memory');
  for (let tick = 0; tick < 135 * 60; tick += 1) {
    freezePopulation(controller);
    controller.tick(1 / 60);
  }
  const afterLongDecay = controller.getSnapshot().analysis.colonyActivation;
  assert.equal(afterLongDecay.recruitmentLimit, 8);
  assert.equal(controller.agents.length, maximumPopulation,
    'falling desired population does not instantaneously mirror itself by culling living ants');

  for (const retiring of controller.agents.slice(0, 2)) {
    retiring.x = 0.9999; retiring.y = retiring.id.endsWith('2') ? 0.55 : 0.45;
    retiring.heading = retiring.intentHeading = 0;
    retiring.vx = 0.03; retiring.vy = 0;
    retiring.turnToward = () => {};
    retiring.accelerateToward = () => { retiring.vx = 0.03; retiring.vy = 0; };
  }
  const spawnedBeforeExits = controller.totalSpawned;
  controller.tick(1 / 60);
  assert.equal(controller.agents.length, maximumPopulation - 2,
    'population falls by actual outward exits only');
  assert.ok(controller.agents.length > controller.recruitmentLimit,
    'the remaining colony stays above the cold floor until ants naturally leave');
  assert.equal(controller.totalRetired, 2);
  assert.equal(controller.totalSpawned, spawnedBeforeExits, 'exits do not directly trigger replacement spawns');
  assert.equal(controller.nextSpawnTimeMs, null, 'recruitment stays paused while survivors exceed the cold limit');
  assert.ok(controller.getSnapshot().analysis.colonyActivation.recruitmentLimit >= 8);
  await controller.destroy();
});

test('feedback sampling alone leaves controller randomness untouched and respects ceiling changes', async () => {
  const random = countedRandom(930);
  const controller = new AntController({ random });
  await controller.init();
  const sampleCalls = random.calls;
  for (let index = 0; index < 20; index += 1) {
    controller.colonyActivation.advance(annularRouteField({ strength: index }), 0.25);
  }
  assert.equal(random.calls, sampleCalls);
  const current = controller.colonyActivation.getSnapshot();
  controller.configure({ population: { count: 12 } });
  assert.equal(controller.colonyActivation.getSnapshot().activation, current.activation);
  const expectedLimit = Math.floor(8 + (12 - 8) * current.activation + 1e-9);
  assert.equal(controller.getSnapshot().analysis.colonyActivation.recruitmentLimit,
    expectedLimit);
  await controller.destroy();
});
