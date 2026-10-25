import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalOccupancy } from '../src/lib/agents/ant/LocalOccupancy.js';
import {
  auditTickOrder, computeTickBudget, observedSegmentEnd, occupancyStats, selfChecks, sourceSecondIndex
} from '../scripts/ant-g-adherence-coupling-control.js';

test('H uniform multiplier preserves the intact reinforcement budget', () => {
  const chunks = [{ distance: 0.02, A: 0.1 }, { distance: 0.03, A: 0.85 },
    { distance: 0.01, A: 0.5 }, { distance: 0, A: 1 }];
  const result = computeTickBudget(chunks);
  const directBudget = chunks.reduce((sum, item) => sum + item.distance * 4.5 * 5 * item.A ** 2, 0);
  const directUniformDelivery = chunks.reduce((sum, item) => sum + item.distance * 4.5 * result.uniform, 0);
  assert.equal(result.budget, directBudget);
  assert(Math.abs(directUniformDelivery - directBudget) <= result.bound);
  assert.equal(result.movingAnts, 3);
});

test('zero travel or zero adherence budget yields no uniform reinforcement', () => {
  assert.equal(computeTickBudget([{ distance: 0, A: 1 }]).uniform, 0);
  assert.equal(computeTickBudget([{ distance: 0.1, A: 0 }]).uniform, 0);
});

test('source ledger assigns ticks 1 through 60 to the first second', () => {
  assert.equal(sourceSecondIndex(1), 0);
  assert.equal(sourceSecondIndex(60), 0);
  assert.equal(sourceSecondIndex(61), 1);
  assert.equal(sourceSecondIndex(36_000), 599);
});

test('collision scaling depends on displacement geometry, not deposition allocation', () => {
  const agents = [{ x: 0.5, y: 0.5, radius: 0.01 }, { x: 0.53, y: 0.5, radius: 0.01 }];
  const makeDisplacements = multiplier => [{ x: 0.02, y: 0, depositionMultiplier: multiplier },
    { x: -0.02, y: 0, depositionMultiplier: multiplier }];
  const first = new LocalOccupancy().constrainDisplacements(agents, makeDisplacements(0));
  const second = new LocalOccupancy().constrainDisplacements(agents, makeDisplacements(1000));
  assert.deepEqual(second, first);
});

test('tick order permits H allocation before unchanged movement/deposition commits', async () => {
  const audit = await auditTickOrder();
  assert.equal(audit.collisionConstraintReadsDepositionMultiplier, false);
  assert.equal(audit.collisionConstraintReadsField, false);
  assert.deepEqual(audit.orderedStages.slice(0, 5), ['all local field reads', 'all intentions/wide reads',
    'all displacements', 'collision scales', 'original movement/deposition/contact loop']);
});

test('exit clipping reproduces the in-domain segment endpoint', () => {
  assert.deepEqual(observedSegmentEnd({ x: 0.9, y: 0.2 }, { x: 1.1, y: 0.2 }), { x: 1, y: 0.2 });
  assert.deepEqual(observedSegmentEnd({ x: 0.8, y: 0.8 }, { x: 1.2, y: 1.2 }), { x: 1, y: 1 });
});

test('corrected occupancy summary has stable empty and concentrated cases', () => {
  assert.equal(occupancyStats(new Uint32Array(16)).coverage, 0);
  const values = new Uint32Array(100); values[0] = 10; values[1] = 1;
  assert.equal(occupancyStats(values).coverage, 0.02);
  assert(occupancyStats(values).top10PercentMassShare > 0.9);
});

test('research helper self-checks pass', async () => {
  const result = await selfChecks();
  assert.equal(result.zeroTravelAndBudget, true);
  assert.equal(result.observerRngCalls, 0);
});
