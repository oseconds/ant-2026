import test from 'node:test';
import assert from 'node:assert/strict';
import { SubtractiveWorld } from '../src/sketchbook-v1/subtractive.js';
import { DEFAULT_SEED, STEP } from '../src/sketchbook/common.js';

const run = (world, ticks) => { for (let i = 0; i < ticks; i++) world.step(); };

test('same seed replays and view/snapshot are read-only copies', () => {
  const a = new SubtractiveWorld(DEFAULT_SEED), b = new SubtractiveWorld(DEFAULT_SEED);
  run(a, 1200); run(b, 1200);
  const before = a.snapshot();
  const view = a.view();
  view.edges[0][0] = -1; view.samples[0].bond[0] = -1;
  const copy = a.snapshot();
  copy.restOffsets[0] = 999; copy.samples[0].displacement[0] = 999;
  copy.input.last[0] = 999; copy.positions[0][0] = 999;
  assert.deepEqual(a.snapshot(), before);
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.equal(before.step, STEP);
  assert.deepEqual(before.config, {
    size: 12, pattern: 'wander', fatigue: true, fatigueStopTick: null,
    mobility: 0.5, activityDamage: 0.35, fatigueRate: 0.005,
    strainScale: 0.04, restRange: 0.04, restSeedXor: 0x5a17c9e3
  });
  assert.doesNotThrow(() => JSON.stringify(before));
});

test('fixed geometry and mass; damage is irreversible and energy losses balance', () => {
  const world = new SubtractiveWorld(DEFAULT_SEED);
  const initial = world.view();
  assert.equal(initial.kind, 'S');
  assert.equal(initial.size, 12);
  assert.equal(initial.positions.length, 144);
  assert.equal(initial.edges.length, 264);
  assert.equal(initial.samples.length, 2);
  assert.equal(world.step(), world);
  const previousBonds = world.samples.map(sample => [...sample.bond]);
  for (let tick = 0; tick < 1000; tick++) {
    world.step();
    for (let s = 0; s < world.samples.length; s++) {
      const sample = world.samples[s];
      assert.ok(sample.bond.every((value, i) => Number.isFinite(value) && value >= 0 && value <= previousBonds[s][i]));
      previousBonds[s] = [...sample.bond];
    }
  }
  const end = world.view();
  assert.deepEqual(end.positions, initial.positions);
  assert.deepEqual(end.edges, initial.edges);
  assert.ok(end.samples.every(sample => sample.displacement.every(Number.isFinite)));
  assert.ok(end.samples.every(sample => Number.isFinite(sample.stats.energyBalanceError) && Math.abs(sample.stats.energyBalanceError) < 1e-8));
});

test('active sample receives activity and diverges from the no-activity control', () => {
  const world = new SubtractiveWorld(20261005, { pattern: 'wander' });
  run(world, 40 * 60);
  const view = world.view();
  assert.deepEqual(view.samples.map(sample => sample.label), ['activity', 'noactivity']);
  assert.ok(view.samples[0].stats.removedEdges > view.samples[1].stats.removedEdges);
  assert.notDeepEqual(view.samples[0].displacement, view.samples[1].displacement);
});

test('fatigue-stop ablation matches the base world exactly through 40 seconds', () => {
  const base = new SubtractiveWorld(20261005, { pattern: 'wander' });
  const stopped = new SubtractiveWorld(20261005, { pattern: 'wander', fatigueStopTick: 40 * 60 });
  run(base, 40 * 60); run(stopped, 40 * 60);
  for (let s = 0; s < 2; s++) {
    assert.deepEqual(stopped.samples[s].bond, base.samples[s].bond);
    assert.deepEqual(stopped.samples[s].displacement, base.samples[s].displacement);
    assert.deepEqual(stopped.view().samples[s].stats, base.view().samples[s].stats);
  }
  run(base, 20 * 60); run(stopped, 20 * 60);
  assert.notDeepEqual(stopped.samples[0].bond, base.samples[0].bond);
});

test('fatigue-off quiet world only relaxes and retains all bonds', () => {
  const world = new SubtractiveWorld(DEFAULT_SEED, { pattern: 'none', fatigue: false });
  const initial = world.snapshot();
  run(world, 2400);
  const end = world.snapshot();
  for (const sample of end.samples) {
    assert.deepEqual(sample.bond, initial.samples[0].bond);
    assert.ok(sample.stats.energy <= initial.samples[0].stats.energy + 1e-12);
    assert.equal(sample.stats.damageLoss, 0);
  }
});

test('zero-bond edges split exact components; quiet fatigue-off does not remove bonds', () => {
  const world = new SubtractiveWorld(DEFAULT_SEED, { pattern: 'none', fatigue: false });
  const quiet = world.view();
  assert.equal(quiet.samples[0].stats.components, 1);
  assert.equal(quiet.samples[0].stats.largestComponent, 144);
  assert.ok(quiet.samples[0].bond.every(value => value === 1));
  const damaged = new SubtractiveWorld(20261005, { pattern: 'wander' });
  run(damaged, 40 * 60);
  const { edges, samples } = damaged.view();
  for (const sample of samples) {
    const adjacency = Array.from({ length: 144 }, () => []);
    for (let e = 0; e < edges.length; e++) if (sample.bond[e] > 0) {
      const [a, b] = edges[e]; adjacency[a].push(b); adjacency[b].push(a);
    }
    const seen = new Set(); let count = 0, largest = 0;
    for (let start = 0; start < 144; start++) if (!seen.has(start)) {
      count++;
      const stack = [start]; seen.add(start); let size = 0;
      while (stack.length) {
        const node = stack.pop(); size++;
        for (const next of adjacency[node]) if (!seen.has(next)) { seen.add(next); stack.push(next); }
      }
      largest = Math.max(largest, size);
    }
    assert.equal(sample.stats.components, count);
    assert.equal(sample.stats.largestComponent, largest);
  }
});

test('1000-second evolution remains finite at both fixed seeds', () => {
  for (const seed of [20261005, 20261006]) {
    const world = new SubtractiveWorld(seed, { pattern: 'stationary' });
    run(world, 1000 * 60);
    const snapshot = world.snapshot();
    assert.equal(snapshot.tick, 60_000);
    assert.ok(snapshot.samples.every(sample => [...sample.bond, ...sample.displacement, sample.stats.energy, sample.stats.energyBalanceError].every(Number.isFinite)));
    assert.ok(snapshot.samples.every(sample => sample.bond.every(value => value >= 0 && value <= 1)));
  }
});
