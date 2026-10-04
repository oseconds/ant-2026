import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';

function seededRandom(seed = 19) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

async function fixture() {
  const controller = new AntController({ random: seededRandom() });
  await controller.init();
  controller.nextSpawnTimeMs = null;
  const ant = controller.agents[0];
  ant.x = 0.5;
  ant.y = 0.5;
  ant.heading = 0;
  ant.intentHeading = 0;
  ant.vx = 0.08;
  ant.vy = 0;
  ant.trailAdherence = 0;
  return { controller, ant };
}

function installStraightTrail(controller, ant, lateralOffset) {
  // Heading zero points right. In canvas coordinates, local left is negative y.
  controller.field.sample = (x, y) => {
    if (x < ant.x || x > ant.x + 0.06) return 0;
    const distance = y - (ant.y + lateralOffset);
    return 0.35 * Math.exp(-(distance * distance) / (2 * 0.0025 ** 2));
  };
}

test('short-range sensing gives mirrored, continuous centering corrections without changing the field', async (t) => {
  const { controller, ant } = await fixture();
  t.after(() => controller.destroy());
  const before = controller.field.getSnapshot().values;

  installStraightTrail(controller, ant, -0.006);
  const left = controller.senseLocalTrail(ant);
  installStraightTrail(controller, ant, 0.006);
  const right = controller.senseLocalTrail(ant);
  installStraightTrail(controller, ant, 0);
  const centered = controller.senseLocalTrail(ant);

  for (const signal of [left, right, centered]) {
    assert.ok(Number.isFinite(signal.strength) && signal.strength >= 0 && signal.strength <= 1);
    assert.ok(Number.isFinite(signal.coherence) && signal.coherence >= 0 && signal.coherence <= 1);
    assert.ok(Number.isFinite(signal.steering));
  }
  assert.ok(left.steering < 0, 'left-of-center trail steers toward local left');
  assert.ok(right.steering > 0, 'right-of-center trail steers toward local right');
  assert.ok(Math.abs(left.steering + right.steering) < 0.02, 'mirrored trails produce mirrored corrections');
  assert.ok(Math.abs(centered.steering) < 0.02, 'centered trail does not snap to one sensor');
  assert.ok(Math.abs(centered.steering) < Math.abs(left.steering) + 1e-9);

  const oldHeading = ant.heading;
  ant.turnToward(oldHeading + left.steering, 1 / 60);
  assert.ok(Math.abs(ant.heading - oldHeading) < Math.abs(left.steering), 'normal turn inertia smooths the correction');
  assert.ok(ant.vx > 0, 'a steering cue preserves forward motion');
  assert.deepEqual(controller.field.getSnapshot().values, before, 'sensing is read-only');
});

test('trail adherence rises on a coherent trail and fades gradually through a temporary gap', async (t) => {
  const { controller, ant } = await fixture();
  t.after(() => controller.destroy());
  const signal = { strength: 0.9, coherence: 0.95, steering: 0 };
  for (let index = 0; index < 24; index += 1) controller.updateTrailAdherence(ant, signal, 1 / 60);
  const established = ant.trailAdherence;
  assert.ok(established > 0.5 && established <= 1, 'coherent trail quickly builds bounded adherence');

  for (let index = 0; index < 6; index += 1) controller.updateTrailAdherence(ant,
    { strength: 0, coherence: 0, steering: 0 }, 1 / 60);
  assert.ok(ant.trailAdherence < established, 'a missing cue reduces adherence');
  assert.ok(ant.trailAdherence > established * 0.5, 'a brief gap does not erase sensory persistence');
  for (let index = 0; index < 60 * 6; index += 1) controller.updateTrailAdherence(ant,
    { strength: 0, coherence: 0, steering: 0 }, 1 / 60);
  assert.ok(ant.trailAdherence >= 0 && ant.trailAdherence < 0.05, 'adherence eventually fades to baseline');
});

test('uniform pheromone is ambiguous and does not build trail adherence', async (t) => {
  const { controller, ant } = await fixture();
  t.after(() => controller.destroy());
  controller.field.sample = () => 0.4;
  const signal = controller.senseLocalTrail(ant);
  assert.ok(signal.strength > 0, 'sensors detect that pheromone is present');
  assert.equal(signal.coherence, 0, 'a flat profile has no clear centered route');
  assert.ok(Math.abs(signal.steering) < 1e-9, 'a flat profile creates no lateral correction');
  for (let index = 0; index < 120; index += 1) controller.updateTrailAdherence(ant, signal, 1 / 60);
  assert.equal(ant.trailAdherence, 0);
});

test('an isolated strong point does not become a route-following target', async (t) => {
  const { controller, ant } = await fixture();
  t.after(() => controller.destroy());
  controller.field.sample = (x, y) => 0.6 * Math.exp(-((x - 0.516) ** 2
    + (y - 0.509) ** 2) / (2 * 0.0015 ** 2));
  const local = controller.senseLocalTrail(ant);
  assert.ok(local.right > local.left, 'a strong point is present beside the near sensor');
  assert.ok(local.strength < 0.001, 'the second short cross-section does not corroborate a route');
  assert.ok(Math.abs(local.steering) < 0.001, 'the ant does not aim at the strongest point');
  for (let index = 0; index < 60; index += 1) controller.updateTrailAdherence(ant, local, 1 / 60);
  assert.ok(ant.trailAdherence < 0.001);
});

test('local adherence senses continue updating during a committed movement interval', async (t) => {
  const { controller, ant } = await fixture();
  t.after(() => controller.destroy());
  installStraightTrail(controller, ant, 0);
  ant.decisionRemaining = 10;
  ant.committedRemaining = 10;
  controller.tick(1 / 60);
  assert.ok(ant.trailAdherence > 0, 'committed ants continue sampling local trail persistence');
});

test('an ant stays near a narrow straight trail over several seconds with smooth finite motion', async (t) => {
  const { controller, ant } = await fixture();
  t.after(() => controller.destroy());
  ant.x = 0.35;
  ant.y = 0.507;
  ant.heading = 0;
  ant.intentHeading = 0;
  ant.vx = 0.08;
  ant.vy = 0;
  ant.decisionRemaining = 0;
  ant.committedRemaining = 0;
  controller.field.sample = (x, y) => {
    if (x < 0.02 || x > 0.98) return 0;
    return 0.5 * Math.exp(-((y - 0.5) ** 2) / (2 * 0.0025 ** 2));
  };
  const startX = ant.x;
  let largestTurn = 0;
  let previousHeading = ant.heading;
  for (let index = 0; index < 5 * 60; index += 1) {
    controller.tick(1 / 60);
    const turn = Math.atan2(Math.sin(ant.heading - previousHeading), Math.cos(ant.heading - previousHeading));
    largestTurn = Math.max(largestTurn, Math.abs(turn));
    previousHeading = ant.heading;
    assert.ok(Number.isFinite(ant.x) && Number.isFinite(ant.y));
    assert.ok(Number.isFinite(ant.vx) && Number.isFinite(ant.vy));
    assert.ok(Math.hypot(ant.vx, ant.vy) < 0.2);
  }
  assert.ok(ant.x > startX + 0.08, 'forward inertia keeps the ant progressing along the route');
  assert.ok(Math.abs(ant.y - 0.5) < 0.016,
    `local steering centers the ant near the narrow trail (y=${ant.y.toFixed(3)}, x=${ant.x.toFixed(3)})`);
  assert.ok(ant.trailAdherence > 0.2, 'a coherent trail maintains sensory persistence');
  assert.ok(largestTurn < 0.04, 'local corrections remain smooth over each simulation step');
});

test('high adherence reduces exploration while leaving occasional stochastic departures', async (t) => {
  async function countDepartures(adherence, seed) {
    const controller = new AntController({ random: seededRandom(seed) });
    await controller.init();
    controller.agents = [controller.agents[0]];
    controller.nextSpawnTimeMs = null;
    controller.field.sample = () => 0;
    const ant = controller.agents[0];
    ant.x = 0.5;
    ant.y = 0.5;
    ant.heading = 0;
    ant.intentHeading = 0;
    ant.trailAdherence = adherence;
    ant.inspectionRemaining = 100;
    let departures = 0;
    for (let index = 0; index < 240; index += 1) {
      ant.decisionRemaining = 0;
      ant.committedRemaining = 0;
      controller.updateIntention(ant, controller.agents,
        controller.occupancy.sense(ant, controller.agents), 1 / 60,
        adherence > 0
          ? { strength: adherence, coherence: 1, steering: 0 }
          : { strength: 0, coherence: 0, steering: 0 });
      if (Math.abs(ant.intentHeading) > 0.2) departures += 1;
    }
    await controller.destroy();
    return departures;
  }
  const lowAdherence = await countDepartures(0, 1201);
  const highAdherence = await countDepartures(0.98, 1201);
  assert.ok(highAdherence > 0, 'even an ant with high adherence can leave the current heading');
  assert.ok(highAdherence < lowAdherence,
    `high adherence makes departures less frequent (${highAdherence} versus ${lowAdherence})`);
});

test('adherence response is bounded and independent of update step size', async (t) => {
  const first = await fixture();
  const second = await fixture();
  t.after(() => Promise.all([first.controller.destroy(), second.controller.destroy()]));
  const signal = { strength: 0.7, coherence: 0.85, steering: 0 };
  for (let index = 0; index < 30; index += 1) first.controller.updateTrailAdherence(first.ant, signal, 1 / 60);
  for (let index = 0; index < 10; index += 1) second.controller.updateTrailAdherence(second.ant, signal, 1 / 20);
  assert.ok(first.ant.trailAdherence >= 0 && first.ant.trailAdherence <= 1);
  assert.ok(Math.abs(first.ant.trailAdherence - second.ant.trailAdherence) < 1e-10,
    'equal elapsed time produces the same adherence');
});
