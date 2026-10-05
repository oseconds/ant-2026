import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { BodyPoseController } from '../src/lib/agents/ant/BodyPoseController.js';

function ant(overrides = {}) {
  return {
    id: 'body-pose-ant',
    x: 0.43,
    y: 0.61,
    heading: 0.37,
    angularVelocity: 0,
    radius: 0.006,
    ...overrides
  };
}

function advanceFor(controller, agent, angularVelocity, seconds, dt = 1 / 60, localTrail) {
  agent.angularVelocity = angularVelocity;
  const count = Math.round(seconds / dt);
  for (let index = 0; index < count; index += 1) controller.advance(agent, dt, localTrail);
  return controller.getSnapshot(agent);
}

function expectedGasterRear(agent, gasterYaw) {
  const radius = agent.radius * 2;
  const localX = -0.9 * radius - 1.25 * radius * Math.cos(gasterYaw);
  const localY = -1.25 * radius * Math.sin(gasterYaw);
  const cos = Math.cos(agent.heading), sin = Math.sin(agent.heading);
  return {
    x: agent.x + localX * cos - localY * sin,
    y: agent.y + localX * sin + localY * cos
  };
}

function trackedRandom(seed) {
  let value = seed >>> 0;
  let calls = 0;
  const random = () => {
    calls += 1;
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
  random.callCount = () => calls;
  return random;
}

function withoutBodyPose(snapshot) {
  return snapshot.agents.map(({ bodyPose, ...agent }) => agent);
}

test('alternating maximum turn input is smoothed without pose snaps', () => {
  const pose = new BodyPoseController();
  const body = ant();
  let previous = pose.getSnapshot(body);
  let maximumHeadStep = 0;
  let maximumGasterStep = 0;
  let maximumHead = 0;
  let maximumGaster = 0;

  for (let index = 0; index < 240; index += 1) {
    body.angularVelocity = index % 2 === 0 ? 4.5 : -4.5;
    pose.advance(body, 1 / 60);
    const current = pose.getSnapshot(body);
    maximumHeadStep = Math.max(maximumHeadStep, Math.abs(current.headYaw - previous.headYaw));
    maximumGasterStep = Math.max(maximumGasterStep, Math.abs(current.gasterYaw - previous.gasterYaw));
    maximumHead = Math.max(maximumHead, Math.abs(current.headYaw));
    maximumGaster = Math.max(maximumGaster, Math.abs(current.gasterYaw));
    assert.ok(Number.isFinite(current.turnSignal));
    assert.ok(Math.abs(current.headYaw) <= 0.12 + 1e-12);
    assert.ok(Math.abs(current.gasterYaw) <= 0.08 + 1e-12);
    previous = current;
  }

  assert.ok(maximumHeadStep < 0.03, 'rapid sign changes do not snap the head');
  assert.ok(maximumGasterStep < 0.015, 'rapid sign changes do not snap the gaster');
  assert.ok(maximumHead < 0.06 && maximumGaster < 0.04,
    'brief alternating inputs stay well below full articulation');
});

test('sustained turns articulate smoothly within bounds and straight travel relaxes to neutral', () => {
  const pose = new BodyPoseController();
  const body = ant();
  const snapshots = [];
  for (let index = 0; index < 180; index += 1) {
    body.angularVelocity = 4.5;
    pose.advance(body, 1 / 60);
    const snapshot = pose.getSnapshot(body);
    snapshots.push(snapshot);
    assert.ok(Math.abs(snapshot.headYaw) <= 0.12 + 1e-12);
    assert.ok(Math.abs(snapshot.gasterYaw) <= 0.08 + 1e-12);
    if (index > 0) {
      assert.ok(Math.abs(snapshot.headYaw - snapshots[index - 1].headYaw) < 0.03);
      assert.ok(Math.abs(snapshot.gasterYaw - snapshots[index - 1].gasterYaw) < 0.01);
    }
  }
  const sustained = pose.getSnapshot(body);
  assert.ok(Math.abs(sustained.headYaw) > 0.03, 'the head follows a sustained turn');
  assert.ok(Math.abs(sustained.gasterYaw) > 0.01, 'the gaster follows with a slower lag');

  body.angularVelocity = 0;
  for (let index = 0; index < 240; index += 1) pose.advance(body, 1 / 60);
  const settled = pose.getSnapshot(body);
  assert.ok(Math.abs(settled.headYaw) < 0.003);
  assert.ok(Math.abs(settled.gasterYaw) < 0.003);
  assert.ok(Math.abs(settled.turnSignal) < 0.01);
});

test('left and right sustained turns produce mirrored bounded articulation', () => {
  const leftPose = new BodyPoseController();
  const rightPose = new BodyPoseController();
  const leftAnt = ant({ id: 'left' });
  const rightAnt = ant({ id: 'right' });
  const left = advanceFor(leftPose, leftAnt, -4.5, 2);
  const right = advanceFor(rightPose, rightAnt, 4.5, 2);

  assert.ok(Math.abs(left.turnSignal + right.turnSignal) < 1e-12);
  assert.ok(Math.abs(left.headYaw + right.headYaw) < 1e-12);
  assert.ok(Math.abs(left.gasterYaw + right.gasterYaw) < 1e-12);
});

test('antenna posture follows existing left/right trail signals without mutating the ant', () => {
  const pose = new BodyPoseController();
  const body = ant();
  const before = structuredClone(body);
  const leftBiased = { left: 0.8, center: 0.1, right: 0.1, strength: 0.8, coherence: 0.8, steering: 0.4 };
  const asymmetric = advanceFor(pose, body, 0, 2, 1 / 60, leftBiased);
  assert.ok(asymmetric.antennae.left > asymmetric.antennae.right,
    'stronger existing left sensing produces stronger left exploratory posture');

  const weakPose = new BodyPoseController();
  const weakBody = ant({ id: 'weak' });
  const weak = advanceFor(weakPose, weakBody, 0, 2, 1 / 60,
    { left: 0.1, center: 0.1, right: 0.1, strength: 0.1, coherence: 0.1, steering: 0 });
  const strongPose = new BodyPoseController();
  const strongBody = ant({ id: 'strong' });
  const strong = advanceFor(strongPose, strongBody, 0, 2, 1 / 60,
    { left: 0.8, center: 0.8, right: 0.8, strength: 0.8, coherence: 0.8, steering: 0 });
  assert.ok(strong.antennae.left > weak.antennae.left);
  assert.ok(strong.antennae.right > weak.antennae.right);
  assert.deepEqual(body, before, 'visual posture never feeds back into ant behavior state');
});

test('gaster secretion point matches articulated rear geometry and stays finite', () => {
  const pose = new BodyPoseController();
  const body = ant({ heading: -1.2, radius: 0.009 });
  advanceFor(pose, body, 3.7, 1.8);
  const snapshot = pose.getSnapshot(body);
  const expected = expectedGasterRear(body, snapshot.gasterYaw);
  assert.ok(Number.isFinite(snapshot.gasterRear.x) && Number.isFinite(snapshot.gasterRear.y));
  assert.ok(Math.abs(snapshot.gasterRear.x - expected.x) < 1e-12);
  assert.ok(Math.abs(snapshot.gasterRear.y - expected.y) < 1e-12);
});

test('pose filtering is deterministic, simulation-time based, and has retain/reset lifecycle', () => {
  const first = new BodyPoseController();
  const second = new BodyPoseController();
  const body = ant();
  const sameBody = ant();
  for (let index = 0; index < 60; index += 1) {
    body.angularVelocity = sameBody.angularVelocity = index < 30 ? 3.5 : -1.5;
    const trail = { left: 0.4, center: 0.6, right: 0.2, strength: 0.5, coherence: 0.7, steering: 0.1 };
    first.advance(body, 1 / 60, trail);
    second.advance(sameBody, 1 / 60, trail);
  }
  assert.deepEqual(first.getSnapshot(body), second.getSnapshot(sameBody));
  const fresh = new BodyPoseController();
  const defaultSnapshot = fresh.getSnapshot(body);
  first.retain([]);
  assert.deepEqual(first.getSnapshot(body), defaultSnapshot, 'retaining no IDs releases all pose history');

  first.advance(body, 1 / 60, { left: 1, center: 0, right: 0, strength: 1, coherence: 1, steering: 1 });
  first.reset();
  assert.deepEqual(first.getSnapshot(body), defaultSnapshot, 'reset clears smoothing history');

  const beforeZeroStep = first.getSnapshot(body);
  first.advance(body, 0);
  assert.deepEqual(first.getSnapshot(body), beforeZeroStep, 'zero simulation time does not advance filters');

  const fine = new BodyPoseController();
  const coarse = new BodyPoseController();
  const fineAnt = ant({ id: 'fine-time-step' });
  const coarseAnt = ant({ id: 'coarse-time-step' });
  advanceFor(fine, fineAnt, 4.5, 1, 1 / 120);
  advanceFor(coarse, coarseAnt, 4.5, 1, 1 / 30);
  const finePose = fine.getSnapshot(fineAnt), coarsePose = coarse.getSnapshot(coarseAnt);
  assert.ok(Math.abs(finePose.turnSignal - coarsePose.turnSignal) < 1e-12);
  assert.ok(Math.abs(finePose.headYaw - coarsePose.headYaw) < 0.002);
  assert.ok(Math.abs(finePose.gasterYaw - coarsePose.gasterYaw) < 0.002);
});

test('body-pose observation cannot change movement, pheromone, gait contacts, or RNG consumption', async () => {
  const withPoseRandom = trackedRandom(1917);
  const withoutPoseRandom = trackedRandom(1917);
  const noOpBodyPose = {
    advance() {},
    getSnapshot() { return null; },
    retain() {},
    reset() {}
  };
  const options = { state: { population: { count: 8 } } };
  const withPose = new AntController({ ...options, random: withPoseRandom,
    bodyPoseController: new BodyPoseController() });
  const withoutPose = new AntController({ ...options, random: withoutPoseRandom,
    bodyPoseController: noOpBodyPose });
  await Promise.all([withPose.init(), withoutPose.init()]);
  const poseContacts = [], noPoseContacts = [];
  withPose.subscribe(event => { if (event.type === 'foot-contact') poseContacts.push(event.payload); });
  withoutPose.subscribe(event => { if (event.type === 'foot-contact') noPoseContacts.push(event.payload); });

  for (let tick = 1; tick <= 20 * 60; tick += 1) {
    withPose.tick(1 / 60);
    withoutPose.tick(1 / 60);
    if (tick % 60 === 0) {
      const poseSnapshot = withPose.getSnapshot();
      const noPoseSnapshot = withoutPose.getSnapshot();
      assert.deepEqual(withoutBodyPose(poseSnapshot), withoutBodyPose(noPoseSnapshot),
        'all agent movement and gait snapshots remain identical at each second');
      assert.deepEqual(poseSnapshot.pheromone.values, noPoseSnapshot.pheromone.values,
        'the shared pheromone field is unchanged by pose observation');
      assert.equal(withPoseRandom.callCount(), withoutPoseRandom.callCount(),
        'body pose consumes no behavior randomness');
    }
  }

  assert.ok(poseContacts.length > 0, 'the comparison includes actual FOOT_CONTACT events');
  assert.deepEqual(poseContacts, noPoseContacts, 'FOOT_CONTACT payloads and timing stay unchanged');
  assert.deepEqual(withPose.getSnapshot().pheromone.values, withoutPose.getSnapshot().pheromone.values);
  assert.equal(withPoseRandom.callCount(), withoutPoseRandom.callCount());
  await Promise.all([withPose.destroy(), withoutPose.destroy()]);
});
