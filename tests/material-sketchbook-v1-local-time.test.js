import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalTimeWorld } from '../src/sketchbook-v1/local-time.js';
import { STEP, stateDigest } from '../src/sketchbook/common.js';

test('local-time replay is deterministic and observation is inert', () => {
  const a = new LocalTimeWorld(5), b = new LocalTimeWorld(5);
  for (let i = 0; i < 1200; i++) { a.step(); b.step(); }
  const before = stateDigest(a.snapshot());
  a.view(); a.snapshot();
  assert.equal(stateDigest(a.snapshot()), before);
  assert.equal(stateDigest(a.snapshot()), stateDigest(b.snapshot()));
  const exposed = a.snapshot();
  exposed.config.initialPhase[0] = -1;
  assert.deepEqual(a.snapshot().config.initialPhase, [0.4, 0.6]);
});

test('no input makes local and mean-matched uniform worlds exactly equal', () => {
  const world = new LocalTimeWorld(6, { pattern: 'none' });
  for (let i = 0; i < 600; i++) world.step();
  const [local, uniform] = world.view().samples;
  assert.deepEqual(local.phase, uniform.phase);
  assert.deepEqual(local.age, uniform.age);
  assert.ok(local.rate.every(rate => rate === 1));
});

test('input changes local clocks while matching mean elapsed time', () => {
  const world = new LocalTimeWorld(5, { pattern: 'stationary' });
  for (let i = 0; i < 600; i++) world.step();
  const view = world.view();
  const [local, uniform] = view.samples;
  assert.equal(view.kind, 'T');
  assert.equal(view.positions.length, 144);
  assert.equal(view.edges.length, 264);
  assert.equal(local.rate.length, 144);
  assert.ok(view.stats.ageSpread > 0);
  assert.ok(Math.abs(local.stats.meanAge - uniform.stats.meanAge) < 1e-12);
  assert.ok(view.stats.phaseL2 > 0);
  assert.equal(world.snapshot().input.pattern, 'stationary');
  assert.equal(world.snapshot().input.tick, world.tick);
});

test('local-time states stay bounded and coupled energy decreases over a long run', () => {
  const world = new LocalTimeWorld(5, { pattern: 'wander' });
  let energies = world.view().samples.map(sample => sample.stats.energy);
  for (let i = 0; i < 1000 / STEP; i++) {
    world.step();
    const snap = world.snapshot();
    assert.ok(snap.q.every(q => Number.isFinite(q) && q >= 0 && q <= 1));
    for (const sample of snap.samples) assert.ok(sample.phase.every(p => Number.isFinite(p) && p >= 0 && p <= 1));
    for (let sample = 0; sample < snap.samples.length; sample++) {
      const nextEnergy = snap.samples[sample].stats.energy;
      assert.ok(nextEnergy <= energies[sample] + 1e-12, `sample ${sample} energy rose ${energies[sample]} -> ${nextEnergy} at tick ${world.tick}`);
      energies[sample] = nextEnergy;
    }
  }
});

test('coupling changes phase evolution, and condition recovers after input stops', () => {
  const coupled = new LocalTimeWorld(5, { pattern: 'stationary', coupling: true });
  const uncoupled = new LocalTimeWorld(5, { pattern: 'stationary', coupling: false });
  for (let i = 0; i < 41 / STEP; i++) { coupled.step(); uncoupled.step(); }
  const drivenNode = coupled.input.nodes[0];
  const qAfterInput = coupled.condition[drivenNode];
  const phaseAfterInput = coupled.localPhase[drivenNode];
  for (let i = 0; i < 59 / STEP; i++) { coupled.step(); uncoupled.step(); }
  assert.ok(coupled.condition[drivenNode] < qAfterInput);
  assert.notEqual(coupled.localPhase[drivenNode], phaseAfterInput);
  assert.notDeepEqual(coupled.localPhase, uncoupled.localPhase);
  assert.equal(coupled.snapshot().input.tick, coupled.tick);
});
