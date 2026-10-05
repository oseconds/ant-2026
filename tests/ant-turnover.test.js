import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntAgent } from '../src/lib/agents/ant/AntAgent.js';

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function setMotion(agent, vx, vy) {
  agent.heading = Math.atan2(vy, vx);
  agent.intentHeading = agent.heading;
  agent.angularVelocity = 0;
  agent.vx = vx;
  agent.vy = vy;
  agent.inspectionRemaining = 1000;
  agent.decisionRemaining = 1000;
  agent.committedRemaining = 1000;
  agent.hesitationRemaining = 0;
  agent.turnToward = () => {};
  agent.accelerateToward = () => { agent.vx = vx; agent.vy = vy; };
}

function nearBoundaryAgent(controller, start = { x: 0.9998, y: 0.5 }, velocity = { x: 0.012, y: 0 }) {
  const ant = controller.agents[0];
  ant.x = start.x;
  ant.y = start.y;
  setMotion(ant, velocity.x, velocity.y);
  return ant;
}

test('outward exits on every side and a corner deposit and emit STEP only to the first boundary hit', async () => {
  const cases = [
    { name: 'right', start: { x: 0.9998, y: 0.5 }, velocity: { x: 0.018, y: 0 }, end: { x: 1, y: 0.5 } },
    { name: 'left', start: { x: 0.0002, y: 0.5 }, velocity: { x: -0.018, y: 0 }, end: { x: 0, y: 0.5 } },
    { name: 'bottom', start: { x: 0.5, y: 0.0002 }, velocity: { x: 0, y: -0.018 }, end: { x: 0.5, y: 0 } },
    { name: 'top', start: { x: 0.5, y: 0.9998 }, velocity: { x: 0, y: 0.018 }, end: { x: 0.5, y: 1 } },
    { name: 'corner', start: { x: 0.9999, y: 0.9998 }, velocity: { x: 0.018, y: 0.018 }, end: { x: 1, y: 0.9999 } }
  ];

  for (const [index, scenario] of cases.entries()) {
    const events = [];
    const controller = new AntController({ random: seededRandom(101 + index), state: { population: { count: 1 } } });
    await controller.init();
    const ant = nearBoundaryAgent(controller, scenario.start, scenario.velocity);
    const stepState = controller.stepEventGenerator.getOrCreate(ant.id);
    stepState.stepLength = 0.00005;
    stepState.distanceRemainder = 0;
    let stepDistance;
    const advanceStep = controller.stepEventGenerator.advance.bind(controller.stepEventGenerator);
    controller.stepEventGenerator.advance = (agent, distance, time) => {
      stepDistance = distance;
      return advanceStep(agent, distance, time);
    };
    controller.subscribe((event) => { if (event.type === 'step') events.push(event.payload); });

    const field = controller.field;
    field.depositSegment({ x: 0.35, y: 0.35 }, { x: 0.45, y: 0.35 });
    const priorSignal = field.sample(0.4, 0.35);
    let depositedSegment;
    const deposit = field.depositSegment.bind(field);
    field.depositSegment = (from, to, options) => {
      if (!depositedSegment) depositedSegment = { from: { ...from }, to: { ...to } };
      return deposit(from, to, options);
    };

    controller.tick(1 / 60);
    assert.equal(controller.agents.length, 0, scenario.name + ': the body leaves instead of stopping at the edge');
    assert.equal(controller.totalSpawned, 1);
    assert.equal(controller.totalRetired, 1);
    assert.ok(ant.x < 0 || ant.x > 1 || ant.y < 0 || ant.y > 1,
      scenario.name + ': the retired body continued outward without a final position clamp');
    assert.ok(depositedSegment);
    assert.deepEqual(depositedSegment.to, scenario.end, scenario.name + ': accounting stops at first boundary intersection');
    const observedDistance = Math.hypot(depositedSegment.to.x - depositedSegment.from.x,
      depositedSegment.to.y - depositedSegment.from.y);
    const expectedDistance = Math.hypot(scenario.end.x - scenario.start.x,
      scenario.end.y - scenario.start.y);
    assert.ok(Math.abs(observedDistance - expectedDistance) < 1e-12,
      scenario.name + ': deposition and STEP accounting use only observed distance');
    assert.ok(Math.abs(stepDistance - expectedDistance) < 1e-12,
      scenario.name + ': STEP receives only the in-domain travel rather than the full outward displacement');
    assert.ok(events.length > 0);
    assert.ok(events.every(event => event.antId === ant.id
      && event.position.x >= 0 && event.position.x <= 1 && event.position.y >= 0 && event.position.y <= 1));
    assert.ok(events.every(event => event.position.x === scenario.end.x && event.position.y === scenario.end.y));
    assert.equal(controller.stepEventGenerator.ants.has(ant.id), false,
      'retirement clears the per-ant STEP remainder');
    assert.equal(controller.field, field);
    assert.ok(controller.field.sample(0.4, 0.35) > 0 && controller.field.sample(0.4, 0.35) <= priorSignal,
      'previous environmental memory remains after its depositing ant is removed');
    assert.ok(controller.nextSpawnTimeMs - controller.simulationTimeMs >= 400 - 1e-9);
    assert.ok(controller.nextSpawnTimeMs - controller.simulationTimeMs <= 900 + 1e-9);
    await controller.destroy();
  }
});

test('boundary proximity alone does not turn or brake an ant inward', async () => {
  const makeController = async (x) => {
    const controller = new AntController({ random: seededRandom(202) });
    await controller.init();
    const ant = controller.agents[0];
    ant.x = x;
    ant.y = 0.5;
    ant.heading = 0;
    ant.intentHeading = 0;
    ant.vx = 0.04;
    ant.vy = 0;
    ant.inspectionRemaining = ant.decisionRemaining = ant.committedRemaining = 1000;
    ant.hesitationRemaining = 0;
    let requestedHeading;
    ant.turnToward = (heading) => { requestedHeading = heading; };
    ant.accelerateToward = () => {};
    return { controller, ant, getRequestedHeading: () => requestedHeading };
  };
  const edge = await makeController(0.99);
  const center = await makeController(0.5);
  edge.controller.tick(1 / 60);
  center.controller.tick(1 / 60);
  assert.ok(Math.abs(edge.getRequestedHeading()) < 1e-9,
    'heading target stays on the outward route near the boundary');
  assert.equal(edge.ant.targetSpeed, center.ant.targetSpeed,
    'the boundary itself adds no speed penalty');
  await Promise.all([edge.controller.destroy(), center.controller.destroy()]);
});

test('exits are replaced one at a time with fresh individuals while audio toggles leave turnover unchanged', async () => {
  const createBridge = () => ({
    enabled: false,
    setEnabled(enabled) { this.enabled = enabled; return Promise.resolve(true); },
    setVolume() { return true; },
    handleStep() { return undefined; },
    stop() {},
    destroy() {}
  });
  const quietBridge = createBridge();
  const audibleBridge = createBridge();
  const quiet = new AntController({ random: seededRandom(303), audioBridge: quietBridge,
    state: { population: { count: 1 } } });
  const audible = new AntController({ random: seededRandom(303), audioBridge: audibleBridge,
    state: { population: { count: 1 } } });
  await Promise.all([quiet.init(), audible.init()]);
  const oldQuiet = nearBoundaryAgent(quiet);
  const oldAudible = nearBoundaryAgent(audible);
  const sharedField = quiet.field;
  const oldStepState = quiet.stepEventGenerator.getOrCreate(oldQuiet.id);
  oldStepState.distanceRemainder = 0.009;
  const retiredStepValues = { ...oldStepState };
  audible.stepEventGenerator.getOrCreate(oldAudible.id).distanceRemainder = 0.009;
  await Promise.all([quiet.setAudioEnabled(false), audible.setAudioEnabled(true)]);

  for (let tick = 0; tick < 100; tick += 1) {
    quiet.tick(1 / 60);
    audible.tick(1 / 60);
    assert.ok(quiet.totalSpawned - (quiet.totalRetired + quiet.agents.length) === 0);
    assert.ok(audible.totalSpawned - (audible.totalRetired + audible.agents.length) === 0);
    assert.deepEqual(quiet.getSnapshot().agents, audible.getSnapshot().agents,
      'audio state does not affect simulation, random stream, or replacement timing');
    assert.equal(quiet.totalSpawned, audible.totalSpawned);
    assert.equal(quiet.totalRetired, audible.totalRetired);
    if (quiet.totalSpawned === 2) break;
  }

  assert.equal(quiet.agents.length, 1);
  assert.equal(quiet.totalSpawned, 2);
  assert.equal(quiet.totalRetired, 1);
  const replacement = quiet.agents[0];
  assert.equal(replacement.id, 'ant-2');
  assert.notStrictEqual(replacement.personality, oldQuiet.personality);
  assert.notDeepEqual(replacement.personality, oldQuiet.personality);
  assert.equal(replacement.trailAdherence, 0);
  assert.ok(replacement.inspectionRemaining < 2 && replacement.decisionRemaining < 1
    && replacement.committedRemaining === 0,
  'behavior clocks start from a new agent constructor');
  assert.ok(replacement.hesitationRemaining >= 0 && replacement.hesitationRemaining <= 0.8);
  assert.equal(quiet.stepEventGenerator.ants.has(oldQuiet.id), false);
  const freshStep = quiet.stepEventGenerator.getOrCreate(replacement.id);
  assert.equal(freshStep.distanceRemainder, 0, 'the replacement starts with a fresh distance remainder');
  assert.notEqual(freshStep.stepLength, retiredStepValues.stepLength, 'step variation follows its new unique identity');
  assert.notEqual(freshStep.strikeStrength, retiredStepValues.strikeStrength,
    'strike variation follows its new unique identity');
  assert.equal(quiet.field, sharedField, 'replacement does not replace the shared field');
  assert.equal(quiet.getSnapshot().analysis.totalSpawned,
    quiet.getSnapshot().analysis.totalRetired + quiet.agents.length);
  await Promise.all([quiet.destroy(), audible.destroy()]);
});

test('several simultaneous exits preserve a pending timer and replacement remains gradual', async () => {
  const controller = new AntController({ random: seededRandom(404) });
  await controller.init();
  const original = controller.agents[0];
  const others = [
    new AntAgent({ id: 'ant-2', x: 0.0002, y: 0.5, heading: Math.PI, random: seededRandom(2) }),
    new AntAgent({ id: 'ant-3', x: 0.5, y: 0.9998, heading: Math.PI / 2, random: seededRandom(3) })
  ];
  setMotion(original, 0.018, 0);
  original.x = 0.9998; original.y = 0.25;
  setMotion(others[0], -0.018, 0);
  setMotion(others[1], 0, 0.018);
  controller.agents.push(...others);
  controller.totalSpawned = 3;
  controller.nextAgentId = 4;
  controller.nextSpawnTimeMs = 500;

  controller.tick(1 / 60);
  assert.equal(controller.agents.length, 0, 'all three independently exiting bodies retire');
  assert.equal(controller.totalRetired, 3);
  assert.equal(controller.nextSpawnTimeMs, 500, 'an already scheduled simulation-clock spawn is preserved');
  while (controller.simulationTimeMs < 500) {
    const before = controller.totalSpawned;
    controller.tick(1 / 60);
    assert.ok(controller.totalSpawned - before <= 1, 'at most one replacement enters per simulation tick');
  }
  assert.equal(controller.totalSpawned, 4);
  assert.equal(controller.agents.length, 1);
  assert.ok(controller.nextSpawnTimeMs - controller.simulationTimeMs >= 400 - 1e-9);
  assert.ok(controller.nextSpawnTimeMs - controller.simulationTimeMs <= 900 + 1e-9);
  await controller.destroy();
});
