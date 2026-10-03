import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';

function makeController(random = () => 0.5) {
  return new AntController({ random });
}

function advance(controller, count, start = 0) {
  controller.update(start);
  for (let frame = 1; frame <= count; frame += 1) {
    controller.update(start + frame * (1000 / 60));
  }
}

test('live controller records a five-second ring and returns seven delayed followers', async () => {
  const controller = makeController();
  await controller.init();
  advance(controller, 360);
  const snapshot = controller.getSnapshot();

  assert.equal(snapshot.analysis.capacity, 301);
  assert.equal(snapshot.analysis.samples, 301);
  assert.ok(snapshot.analysis.historyMs >= 4999 && snapshot.analysis.historyMs <= 5001);
  assert.equal(snapshot.followers.length, 7);
  assert.deepEqual(snapshot.followers.map(ant => ant.delayMs), [120, 240, 360, 480, 600, 720, 840]);

  for (const follower of snapshot.followers) {
    const expected = controller.buffer.sampleDelayed(snapshot.analysis.simulationTimeMs, follower.delayMs);
    assert.ok(Math.hypot(follower.x - expected.x, follower.y - expected.y) <= .0043);
  }
  await controller.destroy();
});

test('fixed-step wandering is deterministic and correlated instead of jumping independently', async () => {
  const first = makeController(() => 0.53);
  const second = makeController(() => 0.53);
  await first.init();
  await second.init();
  advance(first, 30);
  advance(second, 30);
  assert.deepEqual(first.getSnapshot().trajectory, second.getSnapshot().trajectory);

  const positions = first.getSnapshot().trajectory.slice(-12);
  const steps = positions.slice(1).map((point, index) => ({
    x: point.x - positions[index].x,
    y: point.y - positions[index].y
  }));
  assert.ok(steps.every(step => Math.hypot(step.x, step.y) < .01));
  const adjacentDot = steps.slice(1).reduce((sum, step, index) => {
    const previous = steps[index];
    return sum + step.x * previous.x + step.y * previous.y;
  }, 0);
  assert.ok(adjacentDot > 0, 'successive steps retain a common heading');
  await Promise.all([first.destroy(), second.destroy()]);
});

test('memory settings are normalized and resize a live ring while preserving recent samples', async () => {
  const controller = new AntController({
    random: () => .5,
    state: { memory: { historySeconds: 2, sampleRate: 12 }, colony: { followerCount: 2 } }
  });
  await controller.init();
  assert.equal(controller.getState().memory.historySeconds, 2);
  assert.equal(controller.getState().memory.sampleRate, 60);
  assert.equal(controller.getSnapshot().analysis.capacity, 121);
  assert.equal(controller.getSnapshot().followers.length, 7);
  advance(controller, 90);
  const latest = controller.getSnapshot().trajectory.at(-1);
  controller.configure({ memory: { historySeconds: 1 } });
  const resized = controller.getSnapshot();
  assert.equal(resized.analysis.capacity, 61);
  assert.deepEqual(resized.trajectory.at(-1), latest);
  await controller.destroy();
});

test('LOOP freezes and repeatedly samples memory, then RELEASE records from its current point', async () => {
  const controller = makeController(() => 0.5);
  await controller.init();
  advance(controller, 240);
  const live = controller.getSnapshot();
  assert.equal(controller.loop(), true);
  const frozenSnapshot = controller.getSnapshot();
  const frozenTrajectory = structuredClone(frozenSnapshot.trajectory);
  const loopStart = frozenSnapshot.leader;

  advance(controller, 254, 10_000);
  const looped = controller.getSnapshot();
  assert.equal(looped.mode, 'loop');
  assert.equal(looped.analysis.frozen, true);
  assert.equal(looped.analysis.loopPeriodMs, frozenSnapshot.analysis.historyMs + 240);
  assert.deepEqual(looped.trajectory, frozenTrajectory);
  assert.ok(Math.hypot(looped.leader.x - loopStart.x, looped.leader.y - loopStart.y) < .003,
    'one complete cycle returns to the same point');
  advance(controller, 30, 15_000);
  const laterLoop = controller.getSnapshot();
  assert.notDeepEqual(laterLoop.leader, looped.leader, 'playback continues across repeated cycles');

  const replayPoint = laterLoop.leader;
  assert.equal(controller.release(), true);
  const released = controller.getSnapshot();
  assert.equal(released.mode, 'live');
  assert.equal(released.analysis.frozen, false);
  assert.deepEqual(released.leader, replayPoint, 'release starts from the current replay location');
  assert.equal(released.analysis.samples, 1, 'release starts a fresh live recording');
  assert.equal(released.analysis.historyMs, 0);
  const beforeCount = released.analysis.samples;
  advance(controller, 12, 20_000);
  const resumed = controller.getSnapshot();
  assert.ok(resumed.analysis.samples > beforeCount);
  assert.ok(resumed.analysis.historyMs < 250, 'loop time does not inflate the live history window');
  assert.ok(resumed.trajectory.every(sample => sample.timestamp >= released.analysis.simulationTimeMs));
  const firstLiveStep = resumed.trajectory[1];
  assert.ok(Math.hypot(firstLiveStep.x - replayPoint.x, firstLiveStep.y - replayPoint.y) < .004,
    'live wandering continues with the replay heading');
  await controller.destroy();
});

test('stop and destroy halt updates and detach listeners', async () => {
  const controller = makeController();
  await controller.init();
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => { notifications += 1; });
  advance(controller, 5);
  const beforeStop = controller.getSnapshot().analysis.simulationTimeMs;
  controller.stop();
  const afterStopNotifications = notifications;
  advance(controller, 30, 1000);
  assert.equal(controller.getSnapshot().analysis.simulationTimeMs, beforeStop);
  assert.equal(notifications, afterStopNotifications);

  unsubscribe();
  await controller.destroy();
  assert.equal(controller.update(5000), false);
  assert.equal(notifications, afterStopNotifications);
});
