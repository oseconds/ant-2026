import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { RuntimeGField, G_DOSE_SCALE } from '../scripts/ant-g-runtime-field.js';
import { ObservedPheromoneField, stateFingerprint } from '../scripts/ant-316-gaussian-dose-unit-movement-shadow.js';

test('browser G field matches the operational G writer, cap, boundary, and inherited operations', () => {
  const runtime = new RuntimeGField({ width: 316, height: 316 });
  const reference = new ObservedPheromoneField({ width: 316, height: 316, doseScale: G_DOSE_SCALE, writeStats: null });
  for (let i = 0; i < 24; i += 1) {
    const position = i === 23 ? { x: 0.999, y: 0.002 } : { x: 0.47 + i * 0.0007, y: 0.61 };
    const options = { amount: i < 8 ? 2 : 0.007 + i * 0.001, radius: 0.0045 };
    assert.equal(runtime.depositPoint(position, options), reference.depositPoint(position, options));
  }
  const from = { x: -0.05, y: 0.2 }, to = { x: 0.08, y: 0.24 };
  const segmentOptions = { amountPerUnitDistance: 4.5, radius: 0.0045 };
  assert.equal(runtime.depositSegment(from, to, segmentOptions), reference.depositSegment(from, to, segmentOptions));
  for (let i = 0; i < 120; i += 1) { runtime.decay(1 / 60); reference.decay(1 / 60); }
  assert.equal(runtime.sample(0.5, 0.5), reference.sample(0.5, 0.5));
  assert.equal(runtime.getSnapshot().totalMass, reference.getSnapshot().totalMass);
  assert.deepEqual(Buffer.from(runtime.values.buffer), Buffer.from(reference.values.buffer));
});

test('120-tick G controller replay preserves RNG and complete state with the browser writer', () => {
  const make = fieldClass => {
    let state = 20261005, calls = 0;
    const random = () => { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
    const controller = new AntController({ random, fieldFactory: options => new fieldClass({ ...options, width: 316, height: 316,
      ...(fieldClass === ObservedPheromoneField ? { doseScale: G_DOSE_SCALE, writeStats: null } : {}) }) });
    return { controller, get rng() { return [state, calls]; } };
  };
  const runtime = make(RuntimeGField), reference = make(ObservedPheromoneField);
  const run = async () => {
    await runtime.controller.init(); await reference.controller.init();
    for (let i = 0; i < 120; i += 1) {
      runtime.controller.tick(1 / 60); reference.controller.tick(1 / 60);
      assert.equal(stateFingerprint({ controller: runtime.controller, rngState: runtime.rng[0], rngCalls: runtime.rng[1] }),
        stateFingerprint({ controller: reference.controller, rngState: reference.rng[0], rngCalls: reference.rng[1] }), `tick ${i + 1}`);
    }
  };
  return run();
});
