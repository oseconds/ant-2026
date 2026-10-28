import assert from 'node:assert/strict';
import test from 'node:test';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntPheromoneProvenanceObserver } from '../scripts/lib/antPheromoneProvenanceObserver.js';

test('pheromone provenance observer leaves production state and RNG unchanged', async () => {
  const plainRandom = countedLcg(20261005);
  const observedRandom = countedLcg(20261005);
  const plain = new AntController({ random: plainRandom.next });
  const observed = new AntController({ random: observedRandom.next });
  const observer = new AntPheromoneProvenanceObserver().attach(observed);
  await Promise.all([plain.init(), observed.init()]);

  for (let tick = 0; tick < 600; tick += 1) {
    plain.tick(1 / 60);
    observed.tick(1 / 60);
    assert.equal(JSON.stringify(plain.agents), JSON.stringify(observed.agents));
    assert.deepEqual(plainRandom.snapshot(), observedRandom.snapshot());
  }

  assert.deepEqual(plain.field.values, observed.field.values);
  const receipt = observer.receipt();
  assert.equal(receipt.validity.ok, true);
  assert.equal(receipt.field.capTouches, 0);
  assert.ok(receipt.reads.all.rawSampleCalls > 0);
  assert.equal(receipt.validity.samplesOutsideReconstructionTolerance, 0);
  await Promise.all([plain.destroy(), observed.destroy()]);
});

function countedLcg(seed) {
  let state = seed >>> 0;
  let calls = 0;
  return {
    next() { state = (1664525 * state + 1013904223) >>> 0; calls += 1; return state / 0x100000000; },
    snapshot() { return { state, calls }; }
  };
}
