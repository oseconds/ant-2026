import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryWorld } from '../src/sketchbook/memory.js';
import { STEP } from '../src/sketchbook/common.js';

const run = (world, ticks) => { for (let i = 0; i < ticks; i++) world.step(); };

test('paired samples share exact initial geometry, mass, memory, and seed state', () => {
  const snapshot = MemoryWorld(17).snapshot();
  const [ab, ba] = snapshot.samples;
  assert.deepEqual(ab.positions, ba.positions);
  assert.deepEqual(ab.masses, ba.masses);
  assert.deepEqual(ab.memoryX, ba.memoryX);
  assert.deepEqual(ab.memoryY, ba.memoryY);
  assert.equal(ab.initialRandomState, ba.initialRandomState);
  assert.equal(snapshot.step, STEP);
});

test('A and B each receive one equal-duration, equal-dose episode in opposite order', () => {
  const world = MemoryWorld(17);
  run(world, 20 * 60);
  assert.equal(world.view().phase, 'episode 2');
  let { stats } = world.view();
  assert.ok(Math.abs(stats.inputA1 - 1) < 1e-12);
  assert.equal(stats.inputB1, 0);
  assert.equal(stats.inputA2, 0);
  assert.ok(Math.abs(stats.inputB2 - 1) < 1e-12);
  run(world, 20 * 60);
  ({ stats } = world.view());
  for (const value of [stats.inputA1, stats.inputB1, stats.inputA2, stats.inputB2]) assert.ok(Math.abs(value - 1) < 1e-12);
  assert.equal(world.view().phase, 'quiet');
  assert.ok(stats.memoryDistance > 0);
  assert.equal(stats.geometryDistance, 0);
  const memoryAt40s = world.snapshot().samples.flatMap(sample => [...sample.memoryX, ...sample.memoryY]).reduce((sum, value) => sum + value, 0);
  run(world, 20 * 60);
  const memoryAt60s = world.snapshot().samples.flatMap(sample => [...sample.memoryX, ...sample.memoryY]).reduce((sum, value) => sum + value, 0);
  assert.ok(memoryAt60s < memoryAt40s);
  assert.equal(world.view().phase, 'quiet');
});

test('same seed and schedule replay exactly; mechanics reflect memory without mutating it', () => {
  const a = MemoryWorld(23), b = MemoryWorld(23);
  run(a, 3_600); run(b, 3_600);
  assert.deepEqual(a.snapshot(), b.snapshot());
  const before = a.snapshot();
  const graphs = a.mechanics();
  assert.equal(graphs.length, 2);
  assert.notDeepEqual(graphs[0].springs, graphs[1].springs);
  const current = a.snapshot().samples[0];
  assert.equal(graphs[0].springs[0][2], 0.8 + 1.2 * (current.memoryX[0] + current.memoryX[1]) / 2);
  assert.deepEqual(a.snapshot(), before);
});

test('long quiet evolution remains finite and deterministic through 1000 seconds', () => {
  const world = MemoryWorld(42), replay = MemoryWorld(42);
  run(world, 1_000 * 60);
  run(replay, 1_000 * 60);
  const snapshot = world.snapshot();
  assert.equal(snapshot.tick, 1_000 * 60);
  assert.equal(world.view().phase, 'quiet');
  assert.deepEqual(snapshot, replay.snapshot());
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  const numbers = [
    ...snapshot.samples.flatMap(sample => [...sample.positions.flat(), ...sample.masses, ...sample.footprint, ...sample.memoryX, ...sample.memoryY, sample.ledger.A, sample.ledger.B]),
    ...world.mechanics().flatMap(graph => [...graph.masses, ...graph.ground, ...graph.damping, ...graph.springs.flatMap(spring => [spring[2]])])
  ];
  assert.ok(numbers.every(Number.isFinite));
  assert.equal(world.tick, 1_000 * 60);
});
