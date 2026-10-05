import test from 'node:test';
import assert from 'node:assert/strict';
import { StepEventGenerator } from '../src/lib/agents/ant/StepEventGenerator.js';

const agent = (id = 1, x = 0.25, y = 0.75) => ({ id, x, y });

test('step events follow actual distance and preserve the fractional remainder', () => {
  const generator = new StepEventGenerator({ variation: 0 });
  assert.deepEqual(generator.advance(agent(), 0.01, 16), []);
  const first = generator.advance(agent(1, 0.4, 0.6), 0.01, 32);
  assert.equal(first.length, 1);
  assert.deepEqual(first[0], {
    type: 'STEP', antId: 1, position: { x: 0.4, y: 0.6 }, strength: 0.035, simulationTimeMs: 32
  });
});

test('one long movement emits each crossed step threshold without discarding distance', () => {
  const generator = new StepEventGenerator({ variation: 0, maxEventsPerAdvance: 10 });
  const first = generator.advance(agent(), 0.058, 100);
  assert.equal(first.length, 3);
  assert.ok(first.every((event) => event.simulationTimeMs === 100));
  assert.equal(generator.advance(agent(), 0.014, 116).length, 1);
});

test('stationary, stopped, and invalid movement produces no STEP events', () => {
  const generator = new StepEventGenerator();
  assert.deepEqual(generator.advance(agent(), 0, 10), []);
  assert.deepEqual(generator.advance(agent(), -0.01, 20), []);
  assert.deepEqual(generator.advance(agent(), Number.NaN, 30), []);
  assert.deepEqual(generator.advance(agent(1, Number.NaN, 0.5), 0.2, 40), []);
  assert.deepEqual(generator.advance(agent(), 0.01, Number.NaN), []);
  assert.equal(generator.ants.size, 0);
});

test('distance rate alone determines event rate, so hesitation is sparse and faster travel is frequent', () => {
  const slow = new StepEventGenerator({ variation: 0 });
  const fast = new StepEventGenerator({ variation: 0 });
  let slowCount = 0;
  let fastCount = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    slowCount += slow.advance(agent(1), 0.0002, frame * 16).length;
    fastCount += fast.advance(agent(1), 0.002, frame * 16).length;
  }
  assert.equal(slowCount, 0);
  assert.equal(fastCount, 6);
});

test('per-ant step and strike variation is stable, deterministic, and restrained', () => {
  const first = new StepEventGenerator();
  const second = new StepEventGenerator();
  const firstState = first.getOrCreate(42);
  const laterState = first.getOrCreate(42);
  const sameAntState = second.getOrCreate(42);
  const otherAntState = first.getOrCreate(43);

  assert.strictEqual(firstState, laterState);
  assert.deepEqual(firstState, sameAntState);
  assert.notDeepEqual(firstState, otherAntState);
  assert.ok(firstState.stepLength >= 0.018 * 0.96 && firstState.stepLength <= 0.018 * 1.04);
  assert.ok(firstState.strikeStrength >= 0.035 * 0.96 && firstState.strikeStrength <= 0.035 * 1.04);
});

test('normalized event positions are clamped to the Plate coordinate space', () => {
  const generator = new StepEventGenerator({ variation: 0 });
  const [event] = generator.advance(agent(8, -0.1, 1.2), 0.02, 88);
  assert.deepEqual(event.position, { x: 0, y: 1 });
});

test('burst guard limits events per update and discards excess whole steps without deferred bursts', () => {
  const generator = new StepEventGenerator({ variation: 0, maxEventsPerAdvance: 2 });
  assert.equal(generator.advance(agent(), 0.1, 10).length, 2);
  assert.equal(generator.advance(agent(), 0, 20).length, 0);
  assert.equal(generator.advance(agent(), 0.007, 30).length, 0);
  assert.equal(generator.advance(agent(), 0.002, 40).length, 1);
});

test('retain and reset release stale per-ant accumulators', () => {
  const generator = new StepEventGenerator({ variation: 0 });
  generator.advance(agent(1), 0.01, 10);
  generator.advance(agent(2), 0.01, 10);
  generator.retain(new Set([2]));
  assert.deepEqual([...generator.ants.keys()], [2]);
  generator.reset();
  assert.equal(generator.ants.size, 0);
  assert.deepEqual(generator.advance(agent(2), 0.01, 20), []);
});
