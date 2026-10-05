import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonyActivation, ACTIVATION_RADII, ACTIVATION_SECTOR_COUNT,
  ACTIVATION_TIME_CONSTANT_SECONDS } from '../src/lib/agents/ant/ColonyActivation.js';

const ORIGIN = { x: 0.5, y: 0.72 };
const TAU = Math.PI * 2;

function routedField(sectors = [0, 1, 2, 3], value = 0.04) {
  return { sample(x, y) {
    const dx = x - ORIGIN.x, dy = y - ORIGIN.y;
    const radius = Math.hypot(dx, dy);
    if (!ACTIVATION_RADII.some(candidate => Math.abs(candidate - radius) < 1e-8)) return 0;
    const angle = (Math.atan2(dy, dx) + TAU) % TAU;
    const sector = Math.round(angle / TAU * ACTIVATION_SECTOR_COUNT) % ACTIVATION_SECTOR_COUNT;
    return sectors.includes(sector) ? value : 0;
  } };
}

test('isolates annular local route evidence from the spawn pixel and remote field activity', () => {
  const activation = new ColonyActivation();
  let sampleCount = 0;
  const spawnHotPixel = { sample(x, y) {
    sampleCount += 1;
    return x === ORIGIN.x && y === ORIGIN.y ? 1 : 0;
  } };
  assert.equal(activation.advance(spawnHotPixel, 45).evidence, 0);
  assert.equal(sampleCount, 48, 'three annulus radii are sampled in each of sixteen sectors');

  const remoteField = { sample(x, y) {
    return x > 0.85 && y < 0.3 ? 1 : 0;
  } };
  assert.equal(activation.advance(remoteField, 45).evidence, 0);
});

test('uses the mean of the four strongest sector means with per-sample saturation', () => {
  const activation = new ColonyActivation();
  const snapshot = activation.advance(routedField([0, 1, 2, 3], 0.04), 1);
  assert.ok(Math.abs(snapshot.evidence - 0.5) < 1e-12);
  assert.equal(snapshot.recruitmentLimit, 8, 'short-lived evidence does not instantly raise recruitment');
});

test('activation rises and decays continuously, with equivalent elapsed-time response across step sizes', () => {
  const route = routedField([0, 1, 2, 3], 0.04);
  const empty = { sample: () => 0 };
  const fine = new ColonyActivation();
  const coarse = new ColonyActivation();
  let rising = fine.getSnapshot();
  for (let i = 0; i < 90; i += 1) rising = fine.advance(route, 0.5);
  const coarseRise = coarse.advance(route, 45);
  assert.ok(rising.activation > 0.3 && rising.activation < 0.5);
  assert.ok(Math.abs(rising.activation - coarseRise.activation) < 1e-12);
  assert.ok(rising.desiredPopulation > 8 && rising.desiredPopulation < 28);

  for (let i = 0; i < 90; i += 1) rising = fine.advance(empty, 0.5);
  const decayed = coarse.advance(empty, 45);
  assert.ok(rising.activation < 0.2);
  assert.ok(Math.abs(rising.activation - decayed.activation) < 1e-12);
  assert.ok(rising.recruitmentLimit >= 8 && rising.recruitmentLimit <= 28);
});

test('configuration clamps the ceiling to 8–100 without changing evidence or activation', () => {
  const activation = new ColonyActivation({ ceiling: 42 });
  activation.advance(routedField([0, 1, 2, 3], 0.04), ACTIVATION_TIME_CONSTANT_SECONDS);
  const before = activation.getSnapshot();
  const high = activation.configure({ ceiling: 1000 });
  assert.equal(high.activation, before.activation);
  assert.equal(high.evidence, before.evidence);
  assert.equal(high.desiredPopulation, 8 + 92 * before.activation);
  assert.ok(high.recruitmentLimit <= 100);
  const low = activation.configure({ ceiling: 1 });
  assert.equal(low.desiredPopulation, 8);
  assert.equal(low.recruitmentLimit, 8);
});

test('invalid time steps do not advance activation and reset clears its evidence history', () => {
  const activation = new ColonyActivation();
  activation.advance(routedField(), 12);
  const before = activation.getSnapshot();
  for (const dt of [0, -1, NaN, Infinity]) assert.deepEqual(activation.advance(routedField(), dt), before);
  assert.deepEqual(activation.reset(), {
    evidence: 0, activation: 0, desiredPopulation: 8, recruitmentLimit: 8
  });
});
