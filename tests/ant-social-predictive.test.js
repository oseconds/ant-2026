import test from 'node:test';
import assert from 'node:assert/strict';
import { trajectoryHeader, encodeFrame, densityMetrics } from '../scripts/ant-social-evidence.js';
import { indexTrajectory } from '../scripts/ant-social-null.js';
import { DynamicSocialGraph } from '../src/lib/agents/ant/DynamicSocialGraph.js';
import { TemporalSocialTopology } from '../src/lib/agents/ant/TemporalSocialTopology.js';
import { SEEDS, futureMergeLabels, extractSamples, fold, controlTraining, fitLogistic, predict, metrics } from '../scripts/ant-social-predictive.js';

function fixture(changedFuture = false) {
  const ids = ['A', 'B'], graph = new DynamicSocialGraph({ distanceMultiplier: 2 });
  const states = [1, 0.25].map(windowSeconds => ({ windowSeconds, topology: new TemporalSocialTopology({ windowSeconds }) }));
  const frames = [], timeline = [];
  for (let tick = 0; tick <= 180; tick += 1) {
    const agents = ids.map((id, idIndex) => ({ id, idIndex, x: idIndex ? (changedFuture && tick > 60 ? 0.8 : 0.02) : 0,
      y: 0, vx: idIndex ? (changedFuture && tick > 60 ? 2 : 0.1) : 0, vy: 0, heading: 0, radius: 0.006 }));
    const timeSeconds = tick / 60;
    frames.push(encodeFrame({ timeSeconds, agents })); graph.observe(timeSeconds, agents);
    if (tick % 3 === 0) for (const state of states) state.topology.observe(graph.getSnapshot(state.windowSeconds));
    if (tick && tick % 60 === 0) timeline.push({ seconds: timeSeconds, population: agents.length,
      instant: [{ distanceMultiplier: 2, edgeCount: graph.activeEncounters.size, ...densityMetrics(agents) }],
      topologies: states.map(s => ({ distanceMultiplier: 2, windowSeconds: s.windowSeconds, topology: s.topology.getSnapshot() })) });
  }
  return { source: indexTrajectory(Buffer.concat([trajectoryHeader(), ...frames]), ids), timeline };
}

test('future merge labels preserve the open lower/closed upper horizon and reject incomplete horizons', () => {
  const merge = timeSeconds => ({ type: 'COMPONENT_MERGE', timeSeconds });
  assert.deepEqual(futureMergeLabels([60], [merge(1)], 120), [0]);
  assert.deepEqual(futureMergeLabels([60], [merge(2 + 1e-12)], 120), [1]);
  assert.deepEqual(futureMergeLabels([60], [merge(2.05)], 123), [0]);
  assert.deepEqual(futureMergeLabels([60, 120], [merge(1.05), merge(2.05)], 180), [1, 1]);
  assert.deepEqual(futureMergeLabels([60], [{ type: 'COMPONENT_SPLIT', timeSeconds: 1.05 }], 120), [0]);
  assert.throws(() => futureMergeLabels([120], [], 179));
  assert.throws(() => futureMergeLabels([60], [merge(1.01)], 120));
});

test('feature extraction is deterministic and future trajectory/snapshot changes cannot affect earlier predictors', () => {
  const a = fixture(), b = fixture(true), before = Buffer.from(a.source.bytes);
  const saved = Math.random; Math.random = () => { throw new Error('no randomness'); };
  try {
    const first = extractSamples(a.source, a.timeline);
    assert.deepEqual(extractSamples(a.source, a.timeline), first);
    assert.equal(first.length, 2);
    assert.deepEqual(first[0], extractSamples(b.source, b.timeline)[0]);
    assert.notDeepEqual(first[1], extractSamples(b.source, b.timeline)[1]);
    assert.deepEqual(a.source.bytes, before);
    assert.ok(first.every(row => row.availableThroughTick === row.tick));
    const altered = structuredClone(a.timeline);
    altered[0].topologies.forEach(t => { t.topology.finished = true; t.stability = { completedLifetime: 999 }; t.eventsSinceLastSecond = { CONNECTOR_END: 999 }; });
    assert.deepEqual(extractSamples(a.source, altered), first, 'retrospective fields are never read');
  } finally { Math.random = saved; }
});

test('leave-one-seed-out folds and training-only control preserve baseline/target and cannot reach held-out data', () => {
  const packets = SEEDS.map(seed => ({ seed, samples: [60, 120, 180, 240].map((tick, i) =>
    ({ tick, baseline: [i, seed], social: { 1: [i, i + 1, i + 2], 0.25: [i + 3, i + 4, i + 5] }, target: i % 2 })) }));
  const original = structuredClone(packets), f = fold(packets, SEEDS[0]);
  assert.deepEqual(fold(packets, SEEDS[0]), f);
  assert.ok(f.training.every(r => r.seed !== SEEDS[0]) && f.evaluation.every(r => r.seed === SEEDS[0]));
  const control = controlTraining(f.training, SEEDS[0], 1);
  assert.deepEqual(controlTraining(f.training, SEEDS[0], 1), control);
  control.rows.forEach((row, i) => { assert.deepEqual(row.baseline, f.training[i].baseline); assert.equal(row.target, f.training[i].target); });
  for (const seed of f.trainingSeeds) assert.deepEqual(control.rows.filter(r => r.seed === seed).map(r => r.social[1]).sort(),
    f.training.filter(r => r.seed === seed).map(r => r.social[1]).sort());
  assert.throws(() => controlTraining(f.evaluation, SEEDS[0], 1));
  assert.deepEqual(packets, original);
});

test('metrics group ties correctly, match hand calculations and retain single-class limitations', () => {
  const m = metrics([1, 0, 1, 0], [0.9, 0.8, 0.7, 0.1]);
  assert.equal(m.rocAuc, 0.75); assert.ok(Math.abs(m.averagePrecision - 5 / 6) < 1e-12);
  assert.ok(Math.abs(m.brier - 0.1875) < 1e-12);
  const tied = metrics([1, 0, 1, 0], [0.5, 0.5, 0.5, 0.5]);
  assert.equal(tied.rocAuc, 0.5); assert.equal(tied.averagePrecision, 0.5); assert.equal(tied.brier, 0.25);
  assert.equal(tied.calibration[5].n, 4);
  assert.equal(metrics([0, 1], [0, 1]).brier, 0);
  assert.equal(metrics([0, 0], [0.1, 0.2]).rocAuc, null);
  assert.equal(metrics([0, 0], [0.1, 0.2]).averagePrecision, null);
});

test('regularized logistic fit is deterministic, uses training-only scales and handles constant predictors', () => {
  const x = [[-2, 7], [-1, 7], [1, 7], [2, 7]], y = [0, 0, 1, 1];
  const model = fitLogistic(x, y), original = structuredClone(model);
  assert.deepEqual(fitLogistic(x, y), model);
  assert.deepEqual(model.mean, [0, 7]); assert.equal(model.scale[1], 1);
  const p = predict(model, x); assert.ok(p[0] < p[1] && p[1] < 0.5 && p[2] > 0.5 && p[2] < p[3]);
  assert.ok(Math.abs(p[0] + p[3] - 1) < 1e-12);
  predict(model, [[9999, -9999]]); assert.deepEqual(model, original, 'evaluation cannot refit scaler');
  assert.throws(() => fitLogistic(x, [0, 0, 0, 0]));
});
