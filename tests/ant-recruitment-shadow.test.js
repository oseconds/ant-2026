import assert from 'node:assert/strict';
import test from 'node:test';
import { AntController as ProductionController } from '../src/lib/agents/ant/AntController.js';
import { conditionedHeading, filterPheromoneDirection, makeControllerClass,
  measurePheromoneDirection } from '../scripts/ant-recruitment-shadow.js';

const DT = 1 / 60;

test('dynamic-source baseline matches direct production controller on every fixed tick', async () => {
  const { AntController: ShadowController } = await makeControllerClass('baseline');
  const plain = setup(ProductionController, 901), shadow = setup(ShadowController, 901);
  await plain.controller.init(); await shadow.controller.init();
  try {
    assert.equal(state(plain), state(shadow), 'init including first accepted spawn matches');
    for (let tick = 0; tick < 180; tick += 1) {
      plain.controller.tick(DT); shadow.controller.tick(DT);
      assert.equal(state(plain), state(shadow), `complete controller state diverged at tick ${tick + 1}`);
    }
    assert.deepEqual(plain.events, shadow.events);
    assert.equal(plain.rng.state(), shadow.rng.state());
    assert.equal(plain.rng.calls, shadow.rng.calls);
  } finally {
    await plain.controller.destroy(); await shadow.controller.destroy();
  }
});

test('all static heading variants use one spawn draw and leave production systems intact', async () => {
  const seed = 82, draw = nextDraw(seed, 3);
  const expectations = {
    rotate90: -Math.PI / 2 + Math.PI / 2 + (draw * 2 - 1) * 0.3,
    reverse: -Math.PI / 2 + Math.PI + (draw * 2 - 1) * 0.3,
    isotropic: -Math.PI + draw * Math.PI * 2
  };
  for (const [variant, heading] of Object.entries(expectations)) {
    const { AntController } = await makeControllerClass(variant), run = setup(AntController, seed);
    await run.controller.init();
    try {
      assert.ok(Math.abs(run.controller.agents[0].heading - wrap(heading)) < 1e-12, variant);
      assert.equal(run.rng.calls, 16, 'two disk draws, one heading draw, and unchanged AntAgent draws');
      assert.equal(run.controller.materialLocomotionResistance, true);
      assert.equal(run.controller.state.population.activationFeedback, true);
    } finally { await run.controller.destroy(); }
  }
});

test('pheromone direction is zero for null, uniform, and balanced opposing evidence', () => {
  assert.equal(measurePheromoneDirection(null).R, 0);
  assert.equal(measurePheromoneDirection({ sample: () => 1 }).R, 0);
  const opposing = { sample: (x, y) => Math.abs(x - 0.5) > 0.055 && Math.abs(y - 0.72) < 0.01 ? 1 : 0 };
  assert.equal(measurePheromoneDirection(opposing).R, 0);
});

test('directional heading spread stays bounded and consumes no policy randomness', () => {
  const field = { sample: (x, y) => x > 0.55 && Math.abs(y - 0.72) < 0.01 ? 1 : 0 };
  const q = measurePheromoneDirection(field);
  assert.ok(q.R > 0 && q.R <= 1);
  for (const draw of [0, 0.25, 0.5, 0.75, 1]) {
    const result = conditionedHeading(draw, q), delta = Math.abs(wrap(result.heading - result.angle));
    assert.ok(delta <= 0.3 + 1e-12);
  }
  assert.equal(conditionedHeading(0.125, null).heading, -Math.PI + 0.125 * Math.PI * 2);
  const weak = measurePheromoneDirection({ sample: (x, y) => x > 0.55 && Math.abs(y - 0.72) < 0.01 ? 1e-12 : 0 });
  assert.ok(weak.totalWeight < 1e-9 && weak.R > 0.9, 'normalize directional evidence before its ambiguity gate');
  const old = { x: 0.4, y: 0 }, decayed = filterPheromoneDirection(old, { x: 0, y: 0 }, 1 / 60);
  assert.ok(decayed.x > 0 && decayed.x < old.x && decayed.y === 0);
});

test('conditioned dynamic source keeps the accepted heading draw and completed-tick hook guarded', async () => {
  const controllers = [];
  for (const variant of ['pheromoneDirect', 'pheromoneSlow']) {
    const built = await makeControllerClass(variant);
    assert.equal((built.source.match(/__shadowHeading\(this\.random\(\)/g) || []).length, 1);
    assert.ok(built.source.includes(`__shadowConditionTick(this.field, dt, this, ${JSON.stringify(variant)})`));
    const run = setup(built.AntController, 82);
    controllers.push(run);
    await run.controller.init();
    assert.equal(run.rng.calls, 16);
    assert.equal(run.controller.__conditionState, undefined, 'initial ant is isotropic before first completed tick');
  }
  try {
    for (const run of controllers) run.controller.tick(DT);
    assert.equal(controllers[0].rng.calls, controllers[1].rng.calls, 'filter adds no random draw');
    assert.equal(controllers[0].controller.__conditionState.completedTimeMs, controllers[0].controller.simulationTimeMs);
    assert.equal(controllers[1].controller.__conditionState.completedTimeMs, controllers[1].controller.simulationTimeMs);
  } finally { for (const run of controllers) await run.controller.destroy(); }
});

function setup(Controller, seed) {
  const rng = seeded(seed), controller = new Controller({ random: rng.random });
  const events = [];
  controller.subscribe(({ type, payload }) => {
    if (['foot-contact', 'plate-birth', 'sphere-birth', 'error'].includes(type)) events.push({ type, payload });
  });
  return { controller, rng, events };
}
function state({ controller: c, rng, events }) {
  return stable({ agent: c.agents, simulationTimeMs: c.simulationTimeMs, nextSpawnTimeMs: c.nextSpawnTimeMs,
    nextAgentId: c.nextAgentId, totalSpawned: c.totalSpawned, totalRetired: c.totalRetired,
    state: c.state, field: c.field, occupancy: c.occupancy, gait: c.gaitController,
    bodyPose: c.bodyPoseController, deposition: c.gasterDeposition, activation: c.colonyActivation,
    surface: c.surfaceField, births: c.trailPlateBirth, stratigraphy: c.materialStratigraphy,
    rng: { calls: rng.calls, state: rng.state() }, events });
}
function seeded(seed) {
  let value = seed >>> 0, calls = 0;
  return { random() { calls += 1; value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 0x100000000; },
    state: () => value, get calls() { return calls; } };
}
function nextDraw(seed, index) {
  let state = seed >>> 0;
  for (let i = 0; i < index; i += 1) state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 0x100000000;
}
function wrap(angle) { return ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }
function stable(value) { return JSON.stringify(value, (_key, item) => item instanceof Map
  ? [...item.entries()] : item instanceof Set ? [...item] : ArrayBuffer.isView(item) ? Array.from(item) : item); }
