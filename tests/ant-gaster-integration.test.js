import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { gasterRearPoint } from '../src/lib/agents/ant/BodyPoseController.js';

function seededRandom(seed = 41) {
  let value = seed >>> 0;
  return () => ((value = (1664525 * value + 1013904223) >>> 0) / 0x100000000);
}

async function oneAnt(mode = 'continuous') {
  const controller = new AntController({ random: seededRandom(),
    state: { population: { activationFeedback: false }, pheromone: { depositionMode: mode } } });
  await controller.init();
  controller.syncRecruitment = () => {};
  const ant = controller.agents[0];
  ant.x = 0.5; ant.y = 0.5; ant.heading = 0; ant.intentHeading = 0;
  ant.vx = 0.04; ant.vy = 0;
  ant.trailAdherence = 0.6; ant.hesitationRemaining = 0;
  ant.inspectionRemaining = ant.decisionRemaining = ant.committedRemaining = 100;
  ant.turnToward = () => {};
  controller.nextSpawnTimeMs = null;
  return { controller, ant };
}

test('controller deposits continuous dose between pose-specific rear endpoints using existing LCR samples', async () => {
  const { controller, ant } = await oneAnt();
  const samples = [];
  const localSense = controller.senseLocalTrail.bind(controller);
  controller.senseLocalTrail = (...args) => {
    const trail = localSense(...args);
    samples.push(trail);
    return trail;
  };
  const calls = [];
  const originalSample = controller.field.sample.bind(controller.field);
  controller.field.sample = (...args) => { calls.push(args); return originalSample(...args); };
  const deposits = [];
  const originalSegment = controller.field.depositSegment.bind(controller.field);
  controller.field.depositSegment = (from, to, options) => {
    deposits.push({ from: { ...from }, to: { ...to }, ...options });
    return originalSegment(from, to, options);
  };

  const previous = gasterRearPoint(ant);
  const before = { x: ant.x, y: ant.y };
  controller.tick(1 / 60);
  const after = { x: ant.x, y: ant.y };
  const pose = controller.bodyPoseController.getSnapshot(ant);
  const thoraxTravel = Math.hypot(after.x - before.x, after.y - before.y);

  assert.equal(deposits.length, 1);
  assert.deepEqual(deposits[0].from, previous);
  assert.deepEqual(deposits[0].to, pose.gasterRear);
  assert.ok(Math.hypot(deposits[0].to.x - deposits[0].from.x,
    deposits[0].to.y - deposits[0].from.y) > 0);
  const depositedDose = Math.hypot(deposits[0].to.x - deposits[0].from.x,
    deposits[0].to.y - deposits[0].from.y) * deposits[0].amountPerUnitDistance;
  const expectedDose = thoraxTravel * controller.state.pheromone.amountPerUnitDistance
    * (0.375 + 5 * ant.trailAdherence ** 2);
  assert.ok(Math.abs(depositedDose - expectedDose) < 1e-10,
    'rear geometry changes the segment rate while dose remains weighted by thorax distance');
  assert.equal(samples.length, 1, 'body pose reuses the single already-computed local trail observation');
  assert.equal(calls.length, 18, 'the two local bands make 18 samples; pose adds none');
  assert.deepEqual(pose.localPheromone, {
    left: samples[0].left, center: samples[0].center, right: samples[0].right
  });
  await controller.destroy();
});

test('zero thorax travel and rotation create no gaster dose; retiring an ant flushes dab remainder and clears its state', async () => {
  const { controller, ant } = await oneAnt('dab');
  // Seed an actual sub-threshold dose, then move the body to the boundary while
  // preserving that accumulator. The boundary tick supplies the final partial.
  controller.gasterDeposition.advance(ant.id, 0.002,
    { x: 0.5, y: 0.5 }, { x: 0.502, y: 0.5 }, 2);
  const fieldDeposits = [];
  const originalPoint = controller.field.depositPoint.bind(controller.field);
  controller.field.depositPoint = (position, options) => {
    fieldDeposits.push({ position: { ...position }, ...options });
    return originalPoint(position, options);
  };

  ant.vx = ant.vy = 0;
  ant.accelerateToward = () => {};
  ant.turnToward = (_heading, dt) => { ant.heading += 0.3 * dt; ant.angularVelocity = 0.3; };
  controller.tick(1 / 60);
  assert.equal(fieldDeposits.length, 0, 'pure rotation has no travel distance to deposit');
  assert.equal(controller.gasterDeposition.ants.get(ant.id).distance, 0.002);
  assert.equal(controller.gasterDeposition.ants.get(ant.id).amount, 0.004);

  ant.x = 0.9999; ant.y = 0.5; ant.heading = 0; ant.vx = 0.03; ant.vy = 0;
  ant.turnToward = () => {};
  ant.accelerateToward = () => { ant.vx = 0.03; ant.vy = 0; };
  controller.tick(1 / 60);
  assert.equal(controller.agents.includes(ant), false);
  assert.equal(controller.gasterDeposition.ants.has(ant.id), false);
  assert.ok(fieldDeposits.length >= 1, 'the retirement flush reaches the field');
  const flush = fieldDeposits.at(-1);
  assert.ok(flush.position.x <= 1 && flush.position.x > 0.95,
    'the flushed dab is clipped to the observed in-field gaster endpoint');
  assert.ok(flush.amount > 0 && Number.isFinite(flush.amount));
  await controller.destroy();
});

test('same pose preserves traveled-distance quantity for continuous deposition', async () => {
  const { controller, ant } = await oneAnt();
  ant.heading = 0; ant.intentHeading = 0; ant.angularVelocity = 0;
  const segments = [];
  const original = controller.field.depositSegment.bind(controller.field);
  controller.field.depositSegment = (from, to, options) => {
    segments.push({ from: { ...from }, to: { ...to }, ...options });
    return original(from, to, options);
  };
  const start = { x: ant.x, y: ant.y };
  controller.tick(1 / 60);
  assert.equal(segments.length, 1);
  const thoraxDistance = Math.hypot(ant.x - start.x, ant.y - start.y);
  const rearDistance = Math.hypot(segments[0].to.x - segments[0].from.x,
    segments[0].to.y - segments[0].from.y);
  const dose = rearDistance * segments[0].amountPerUnitDistance;
  assert.ok(Math.abs(rearDistance - thoraxDistance) < 1e-10,
    'straight motion with unchanged pose gives matching rear and thorax travel');
  assert.ok(Math.abs(dose - thoraxDistance * controller.state.pheromone.amountPerUnitDistance
    * (0.375 + 5 * ant.trailAdherence ** 2)) < 1e-10);
  await controller.destroy();
});
