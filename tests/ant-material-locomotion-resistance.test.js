import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AntController, materialLayerCountAtSnapshot, materialLocomotionMultiplier,
  materialTurnRateMultiplier, materialFollowingHeadwayMultiplier
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

test('absent research provider preserves the shared production layer count', async () => {
  let providerCalls = 0;
  const production = new AntController({ random: countedRandom(81), materialStratigraphy: testStratigraphy() });
  const zeroOverlay = new AntController({ random: countedRandom(81), materialStratigraphy: testStratigraphy(),
    researchLayerCountProvider: () => { providerCalls++; return 0; } });
  try {
    await production.init(); await zeroOverlay.init();
    for (let i = 0; i < 12; i++) {
      production.tick(DT); zeroOverlay.tick(DT);
      assert.deepEqual(zeroOverlay.getSnapshot(), production.getSnapshot());
    }
    assert.equal(providerCalls, 12, 'the opt-in provider is read once per living ant per tick');
  } finally {
    await production.destroy(); await zeroOverlay.destroy();
  }
});

test('one research layer is added once and the same effective L reaches speed, A, and D', async () => {
  const plain = new AntController({ random: countedRandom(91), materialStratigraphy: testStratigraphy() });
  const observed = [];
  const treatment = new AntController({ random: countedRandom(91), materialStratigraphy: testStratigraphy(),
    researchLayerCountProvider: (agent, productionLayers, timeMs) => {
      observed.push({ antId: agent.id, productionLayers, timeMs });
      return 1;
    } });
  const senses = [plain, treatment].map(controller => {
    const original = controller.occupancy.sense.bind(controller.occupancy), values = [];
    controller.occupancy.sense = (agent, agents, multiplier) => {
      values.push(multiplier);
      return original(agent, agents, multiplier);
    };
    return values;
  });
  const turnRates = [];
  try {
    await plain.init(); await treatment.init();
    for (const [index, controller] of [plain, treatment].entries()) {
      const agent = controller.agents[0], turnToward = agent.turnToward.bind(agent);
      agent.turnToward = (heading, dt, maxRate) => {
        turnRates[index] = maxRate;
        return turnToward(heading, dt, maxRate);
      };
    }
    const productionLayers = materialLayerCountAtSnapshot(plain.materialStratigraphy.getSnapshot(),
      plain.agents[0].x, plain.agents[0].y);
    plain.tick(DT); treatment.tick(DT);
    assert.deepEqual(observed, [{ antId: treatment.agents[0].id, productionLayers, timeMs: 0 }]);
    assert.equal(senses[0][0], materialFollowingHeadwayMultiplier(productionLayers));
    assert.equal(senses[1][0], materialFollowingHeadwayMultiplier(productionLayers + 1));
    assert.ok(Math.abs(turnRates[1] / turnRates[0] - materialTurnRateMultiplier(productionLayers + 1)
      / materialTurnRateMultiplier(productionLayers)) < 1e-12);
    assert.ok(Math.abs(treatment.agents[0].targetSpeed / plain.agents[0].targetSpeed
      - materialLocomotionMultiplier(productionLayers + 1) / materialLocomotionMultiplier(productionLayers)) < 1e-12);
  } finally {
    await plain.destroy(); await treatment.destroy();
  }
});

test('an end-of-tick overlay increment first reaches movement on the next tick', async () => {
  const overlay = { layers: 0 }, seen = [];
  const controller = new AntController({ random: countedRandom(101), materialStratigraphy: testStratigraphy(),
    researchLayerCountProvider: () => { seen.push(overlay.layers); return overlay.layers; } });
  try {
    await controller.init();
    controller.tick(DT);
    overlay.layers = 1;
    controller.tick(DT);
    assert.deepEqual(seen, [0, 1]);
  } finally {
    await controller.destroy();
  }
});
