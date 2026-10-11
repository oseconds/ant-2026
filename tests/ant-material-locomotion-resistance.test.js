import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AntController, materialLayerCountAtSnapshot, materialLocomotionMultiplier
} from '../src/lib/agents/ant/AntController.js';

const DT = 1 / 60;

function countedRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function materialSnapshot() {
  return { width: 2, height: 2, plates: [], stratigraphy: {
    layerCountByCell: new Uint16Array([1, 0, 4, 10])
  } };
}

function testStratigraphy() {
  const snapshot = materialSnapshot();
  return {
    revision: 0,
    getSnapshot: () => snapshot,
    applyFootContact() {},
    advance() { return []; },
    reset() {}
  };
}

test('fixed material multiplier follows the selected equation and bound', () => {
  assert.equal(materialLocomotionMultiplier(0), 1);
  assert.equal(materialLocomotionMultiplier(1), 1 - 0.10 * (1 - Math.exp(-1 / 4)));
  assert.equal(materialLocomotionMultiplier(4), 1 - 0.10 * (1 - Math.exp(-1)));
  assert.equal(materialLocomotionMultiplier(10), 1 - 0.10 * (1 - Math.exp(-10 / 4)));
  assert.equal(materialLocomotionMultiplier(10000), 0.9);
  assert.ok(materialLocomotionMultiplier(10000) < 1);
});

test('public snapshot lookup reads only layer count and treats empty/outside cells as L=0', () => {
  const snapshot = materialSnapshot();
  assert.equal(materialLayerCountAtSnapshot(snapshot, 0, 0), 1);
  assert.equal(materialLayerCountAtSnapshot(snapshot, 1, 0), 0);
  assert.equal(materialLayerCountAtSnapshot(snapshot, 0, 1), 4);
  assert.equal(materialLayerCountAtSnapshot(snapshot, 1, 1), 10);
  assert.equal(materialLayerCountAtSnapshot(snapshot, -0.01, 1), 0);
});

test('default is Off; Treatment slows targetSpeed after heading is already resolved', async () => {
  const baseline = new AntController({ random: countedRandom(20261005), materialStratigraphy: testStratigraphy() });
  const treatment = new AntController({ random: countedRandom(20261005), materialStratigraphy: testStratigraphy(),
    materialLocomotionResistance: true });
  assert.equal(baseline.materialLocomotionResistance, false);
  assert.equal(new AntController().materialLocomotionResistance, false);
  try {
    await baseline.init();
    await treatment.init();
    const layerCount = materialLayerCountAtSnapshot(treatment.materialStratigraphy.getSnapshot(),
      treatment.agents[0].x, treatment.agents[0].y);
    baseline.tick(DT);
    treatment.tick(DT);
    const controlAnt = baseline.agents[0];
    const treatmentAnt = treatment.agents[0];
    assert.equal(controlAnt.intentHeading, treatmentAnt.intentHeading);
    assert.equal(controlAnt.heading, treatmentAnt.heading);
    assert.equal(controlAnt.angularVelocity, treatmentAnt.angularVelocity);
    assert.equal(treatmentAnt.targetSpeed,
      controlAnt.targetSpeed * materialLocomotionMultiplier(layerCount));
    assert.ok(treatmentAnt.targetSpeed < controlAnt.targetSpeed);
  } finally {
    await baseline.destroy();
    await treatment.destroy();
  }
});