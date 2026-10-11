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

function evolvingStratigraphy() {
  const snapshot = { width: 2, height: 2, plates: [], stratigraphy: {
    layerCountByCell: new Uint16Array(4)
  } };
  return {
    revision: 0,
    getSnapshot: () => snapshot,
    applyFootContact() {},
    advance() { snapshot.stratigraphy.layerCountByCell.fill(10); return []; },
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

test('production default enables resistance; explicit Off and On preserve candidate semantics', async () => {
  const baseline = new AntController({ random: countedRandom(20261005), materialStratigraphy: testStratigraphy(),
    materialLocomotionResistance: false });
  const defaultOn = new AntController({ random: countedRandom(20261005), materialStratigraphy: testStratigraphy() });
  const explicitOn = new AntController({ random: countedRandom(20261005), materialStratigraphy: testStratigraphy(),
    materialLocomotionResistance: true });
  assert.equal(baseline.materialLocomotionResistance, false);
  assert.equal(defaultOn.materialLocomotionResistance, true);
  assert.equal(explicitOn.materialLocomotionResistance, true);
  try {
    await baseline.init();
    await defaultOn.init();
    await explicitOn.init();
    const layerCount = materialLayerCountAtSnapshot(defaultOn.materialStratigraphy.getSnapshot(),
      defaultOn.agents[0].x, defaultOn.agents[0].y);
    baseline.tick(DT);
    defaultOn.tick(DT);
    explicitOn.tick(DT);
    const controlAnt = baseline.agents[0];
    const defaultAnt = defaultOn.agents[0];
    const explicitAnt = explicitOn.agents[0];
    assert.equal(controlAnt.intentHeading, defaultAnt.intentHeading);
    assert.equal(controlAnt.heading, defaultAnt.heading);
    assert.equal(controlAnt.angularVelocity, defaultAnt.angularVelocity);
    assert.equal(defaultAnt.targetSpeed, explicitAnt.targetSpeed);
    assert.equal(defaultAnt.targetSpeed,
      controlAnt.targetSpeed * materialLocomotionMultiplier(layerCount));
    assert.ok(defaultAnt.targetSpeed < controlAnt.targetSpeed);
  } finally {
    await baseline.destroy();
    await defaultOn.destroy();
    await explicitOn.destroy();
  }
});

test('same-tick stratigraphy changes affect locomotion starting with the next tick', async () => {
  const baseline = new AntController({ random: countedRandom(20261005), materialStratigraphy: testStratigraphy(),
    materialLocomotionResistance: false });
  const treatment = new AntController({ random: countedRandom(20261005), materialStratigraphy: evolvingStratigraphy() });
  try {
    await baseline.init();
    await treatment.init();
    baseline.tick(DT);
    treatment.tick(DT);
    assert.equal(treatment.agents[0].targetSpeed, baseline.agents[0].targetSpeed,
      'the layer count added by end-of-tick advance must not affect this tick');

    baseline.tick(DT);
    treatment.tick(DT);
    assert.equal(treatment.agents[0].targetSpeed,
      baseline.agents[0].targetSpeed * materialLocomotionMultiplier(10),
      'the same layer count is read at the following tick boundary');
  } finally {
    await baseline.destroy();
    await treatment.destroy();
  }
});
