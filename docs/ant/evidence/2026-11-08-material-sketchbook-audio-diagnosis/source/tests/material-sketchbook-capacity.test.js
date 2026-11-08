import test from 'node:test';
import assert from 'node:assert/strict';
import { CapacityWorld } from '../src/sketchbook/capacity.js';
import { DEFAULT_SEED, STEP, stateDigest } from '../src/sketchbook/common.js';

test('capacity world is deterministic and observations leave the source state unchanged', () => {
  const a = new CapacityWorld(DEFAULT_SEED), b = new CapacityWorld(DEFAULT_SEED);
  for (let i = 0; i < 1200; i++) { a.step(); b.step(); }
  const before = stateDigest(a.snapshot());
  const view = a.view(), [graph] = a.mechanics();
  a.snapshot();
  assert.equal(stateDigest(a.snapshot()), before);
  assert.equal(stateDigest(a.snapshot()), stateDigest(b.snapshot()));
  assert.equal(view.kind, 'C');
  assert.equal(view.positions.length, 64);
  assert.equal(view.edges.length, 112);
  assert.equal(graph.springs.length, 112);
  assert.equal(graph.springs[0][2], 120 * view.capacity[0] / (1 + view.capacity[0]));
  assert.ok(JSON.parse(JSON.stringify(a.snapshot())).capacity.every(Number.isFinite));
});

test('seeded local drive redistributes positive capacity without changing the declared budget', () => {
  const world = new CapacityWorld();
  const initial = world.view();
  assert.equal(initial.phase, 'active');
  assert.equal(initial.stats.totalCapacity, initial.edges.length);
  assert.ok(initial.capacity.every(value => value === 1));

  for (let i = 0; i < 2400; i++) world.step();
  const driven = world.view();
  assert.equal(world.tick, 2400);
  assert.equal(driven.phase, 'resting');
  assert.ok(Math.abs(driven.stats.capacityError) < 1e-9);
  assert.ok(driven.capacity.every(value => Number.isFinite(value) && value > 0));
  assert.ok(driven.stats.maxCapacity - driven.stats.minCapacity > 1e-6);
});

test('1000-second run stays finite with fixed geometry and unit masses', () => {
  const world = new CapacityWorld();
  const initial = world.view();
  for (let i = 0; i < 1000 / STEP; i++) world.step();
  const view = world.view(), snapshot = world.snapshot(), [graph] = world.mechanics();

  assert.equal(world.tick, 60000);
  assert.equal(view.phase, 'resting');
  assert.deepEqual(view.positions, initial.positions);
  assert.deepEqual(view.edges, initial.edges);
  assert.ok(view.mass.every(value => value === 1));
  assert.ok(snapshot.displacement.every(Number.isFinite));
  assert.ok(snapshot.velocity.every(Number.isFinite));
  assert.ok(view.capacity.every(value => Number.isFinite(value) && value > 0));
  assert.ok(Math.abs(view.stats.totalCapacity - 112) < 1e-9);
  assert.ok(graph.masses.every(value => value === 1));
  assert.ok(graph.ground.every(value => value === 0.6));
  assert.ok(graph.damping.every(value => value === 0.5));
  assert.ok(graph.springs.every(([, , stiffness]) => Number.isFinite(stiffness) && stiffness > 0 && stiffness < 120));
});
