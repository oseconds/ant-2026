import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController, materialLayerCountAtSnapshot } from '../src/lib/agents/ant/AntController.js';
import { MaterialStratigraphy } from '../src/lib/agents/ant/MaterialStratigraphy.js';
import { auditState, countedLcg, forkController, installAccelerationProbe } from '../scripts/ant-material-causal-tail.js';

const DT = 1 / 60;

function plate(id, width, height, bornAtSimulationTimeMs = 0) {
  return { id, bornAtSimulationTimeMs, grid: { width, height }, mask: Array(width * height).fill(1),
    meanHalfWidth: 0.02, material: { stiffness: 0.9, density: 1.1, damping: 0.3 },
    centerline: [], edges: [], principalPath: [], pickups: [] };
}

function recording(controller) {
  const events = [];
  const unsubscribe = controller.subscribe(event => events.push(structuredClone(event)));
  return { events, unsubscribe, clear: () => { events.length = 0; } };
}

async function matureController(seed = 20261005) {
  const controller = new AntController({ random: countedLcg(seed) });
  await controller.init();
  const material = controller.materialStratigraphy;
  material.addPlate(plate('causal-layer-1', material.width, material.height));
  material.addPlate(plate('causal-layer-2', material.width, material.height, 1000));
  for (let i = 0; i < 60; i += 1) controller.tick(DT);
  return controller;
}

test('mature material fork and no-op speed probe preserve full state and RNG across ticks', async () => {
  const source = await matureController();
  const copy = forkController(source);
  const sourceEvents = recording(source), copyEvents = recording(copy);
  try {
    assert.ok(copy.materialStratigraphy instanceof MaterialStratigraphy);
    assert.notEqual(copy.materialStratigraphy, source.materialStratigraphy);
    assert.notEqual(copy.materialStratigraphy.layerCountByCell, source.materialStratigraphy.layerCountByCell);
    assert.ok(copy.materialStratigraphy.layerCountByCell.some(count => count >= 2));
    assert.equal(copy.materialStratigraphy.plates[0], copy.materialStratigraphy.plateById.get('causal-layer-1'),
      'cross-reference aliases inside the fork must remain shared');
    assert.notEqual(copy.materialStratigraphy.plates[0], source.materialStratigraphy.plates[0]);
    const focalId = source.agents[0].id;
    const removeProbe = installAccelerationProbe(copy, focalId, { factor: 1 });
    for (let tick = 0; tick < 12; tick += 1) {
      sourceEvents.clear(); copyEvents.clear();
      source.tick(DT); copy.tick(DT);
      if (tick === 0) removeProbe();
      assert.deepEqual(auditState(copy), auditState(source));
      assert.deepEqual(copyEvents.events, sourceEvents.events);
      assert.equal(copy.random.state(), source.random.state());
      assert.equal(copy.random.calls, source.random.calls);
    }
    assert.equal(Object.hasOwn(copy.agents.find(a => a.id === focalId), 'accelerateToward'), false,
      'probe restoration must return to the inherited production method');
  } finally {
    sourceEvents.unsubscribe(); copyEvents.unsubscribe();
    await copy.destroy(); await source.destroy();
  }
});

test('one-tick inverse-m(L) impulse updates target speed, preserves intent and RNG; full restore replays exactly', async () => {
  const source = await matureController(20261006);
  const control = forkController(source), treatment = forkController(source);
  const focalId = source.agents[0].id;
  const controlAnt = control.agents.find(a => a.id === focalId);
  const treatmentAnt = treatment.agents.find(a => a.id === focalId);
  const layerCount = 2, m = 1 - 0.10 * (1 - Math.exp(-layerCount / 4));
  const cEvents = recording(control), tEvents = recording(treatment);
  try {
    let controlAtAcceleration, treatmentAtAcceleration;
    const sham = installAccelerationProbe(control, focalId, { onCall: info => {
      controlAtAcceleration = { heading: info.ant.heading, intentHeading: info.ant.intentHeading };
    } });
    const remove = installAccelerationProbe(treatment, focalId, { divisor: m, onCall: info => {
      treatmentAtAcceleration = { heading: info.ant.heading, intentHeading: info.ant.intentHeading };
    } });
    control.tick(DT); treatment.tick(DT);
    sham(); remove();
    assert.equal(controlAnt.heading, treatmentAnt.heading);
    assert.equal(controlAnt.intentHeading, treatmentAnt.intentHeading);
    assert.deepEqual(treatmentAtAcceleration, controlAtAcceleration);
    assert.ok(Math.abs(treatmentAnt.targetSpeed - controlAnt.targetSpeed / m) < 1e-12);
    assert.equal(control.random.state(), treatment.random.state());
    assert.equal(control.random.calls, treatment.random.calls);
    assert.equal(Object.hasOwn(treatmentAnt, 'accelerateToward'), false);

    const restored = forkController(control), rEvents = recording(restored);
    try {
      for (let tick = 0; tick < 60; tick += 1) {
        cEvents.clear(); rEvents.clear();
        control.tick(DT); restored.tick(DT);
        assert.deepEqual(auditState(restored), auditState(control));
        assert.deepEqual(rEvents.events, cEvents.events);
      }
    } finally { rEvents.unsubscribe(); await restored.destroy(); }
  } finally {
    cEvents.unsubscribe(); tEvents.unsubscribe();
    await treatment.destroy(); await control.destroy(); await source.destroy();
  }
});

test('real seed 20261005 first eligible checkpoint at or after 200s forks and sham-replays exactly', { timeout: 180_000 }, async () => {
  const source = new AntController({ random: countedLcg(20261005) });
  await source.init();
  let focal = null;
  try {
    for (let tick = 0; tick <= 600 * 60; tick += 1) {
      if (tick >= 200 * 60) {
        const snapshot = source.materialStratigraphy.getSnapshot();
        focal = source.agents.map(ant => ({ ant, L: materialLayerCountAtSnapshot(snapshot, ant.x, ant.y) }))
          .filter(item => item.L > 0).sort((a, b) => Number(a.ant.id.replace(/^ant-/, '')) - Number(b.ant.id.replace(/^ant-/, '')))[0] || null;
        if (focal) break;
      }
      source.tick(DT);
    }
    assert.ok(focal, 'real default-On seed must have eligible retained material at or after the 200s gate');
    const copy = forkController(source), sourceEvents = recording(source), copyEvents = recording(copy);
    try {
      assert.equal(copy.simulationTimeMs, source.simulationTimeMs);
      assert.ok(focal.L > 0);
      assert.notEqual(copy.materialStratigraphy.layerCountByCell, source.materialStratigraphy.layerCountByCell);
      for (let tick = 0; tick < 30; tick += 1) {
        sourceEvents.clear(); copyEvents.clear();
        source.tick(DT); copy.tick(DT);
        assert.deepEqual(auditState(copy), auditState(source), `mature checkpoint parity at tick ${tick}`);
        assert.deepEqual(copyEvents.events, sourceEvents.events);
      }
    } finally {
      sourceEvents.unsubscribe(); copyEvents.unsubscribe(); await copy.destroy();
    }
  } finally { await source.destroy(); }
});
