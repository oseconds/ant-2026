import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityWorld } from '../src/sketchbook/activity.js';
import { DEFAULT_SEED, STEP, stateDigest } from '../src/sketchbook/common.js';

test('activity world is deterministic and observations do not advance it', () => {
  const a = new ActivityWorld(DEFAULT_SEED), b = new ActivityWorld(DEFAULT_SEED);
  for (let i = 0; i < 1800; i++) { a.step(); b.step(); }
  const before = stateDigest(a.snapshot());
  a.view(); a.mechanics(); a.snapshot();
  assert.equal(stateDigest(a.snapshot()), before);
  assert.equal(stateDigest(a.snapshot()), stateDigest(b.snapshot()));
  assert.ok(Math.abs(a.view().stats.totalMass - a.view().stats.suppliedMass) < 1e-10);
  assert.equal(a.view().stats.suppliedMass, 4 * 0.08 * 30);
});

test('activity supply ends at 30 s while conservative transport continues', () => {
  const world = new ActivityWorld();
  for (let i = 0; i < 1800; i++) world.step();
  const atInputEnd = world.snapshot();
  const massAtInputEnd = atInputEnd.mass;
  for (let i = 0; i < 600; i++) world.step();
  const after = world.snapshot();
  assert.equal(world.tick, 2400);
  assert.ok(Math.abs(after.mass.reduce((s, x) => s + x, 0) - 9.6) < 1e-10);
  assert.notDeepEqual(after.mass, massAtInputEnd);
  assert.ok(after.agitation.every(Number.isFinite) && after.agitation.every(x => x >= 0 && x <= 2));
  assert.ok(after.bond.every(Number.isFinite) && after.bond.every(x => x >= 0 && x <= 1));
});

test('bond slows transport and empty material has no probe contact', () => {
  const free = new ActivityWorld(), bonded = new ActivityWorld();
  free.tick = bonded.tick = 1800;
  free.mass[12 * 24 + 12] = bonded.mass[12 * 24 + 12] = 1;
  bonded.bond.fill(1);
  free.step(); bonded.step();
  const neighbor = 12 * 24 + 13;
  assert.ok(free.mass[neighbor] > bonded.mass[neighbor]);

  const empty = new ActivityWorld().mechanics()[0];
  assert.ok(empty.contact.every(x => x === 0));
  assert.ok(empty.ground.every(x => x === 0));
  assert.ok(empty.springs.every(([, , k]) => k === 0));
  assert.ok(empty.masses.every(x => x === 0.25));
});

test('extended run stays finite and emits a positive 8 by 8 graph', () => {
  const world = new ActivityWorld();
  for (let i = 0; i < 1000 / STEP; i++) world.step();
  const [graph] = world.mechanics();
  assert.equal(world.tick, 60000);
  assert.ok(Math.abs(world.view().stats.totalMass - 9.6) < 1e-9);
  assert.equal(graph.positions.length, 64);
  assert.equal(graph.springs.length, 112);
  assert.ok(graph.masses.every(x => Number.isFinite(x) && x > 0));
  assert.ok(graph.ground.every(x => Number.isFinite(x) && x > 0));
  assert.ok(graph.damping.every(x => Number.isFinite(x) && x > 0));
  assert.ok(graph.springs.every(([, , k]) => Number.isFinite(k) && k > 0));
  assert.ok(graph.contact.every(x => Number.isFinite(x) && x > 0 && x <= 1));
});
