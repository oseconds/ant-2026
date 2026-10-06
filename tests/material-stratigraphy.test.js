import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MaterialStratigraphy,
  MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION
} from '../src/lib/agents/ant/MaterialStratigraphy.js';

const SIZE = 11;
const CENTER = { x: 0.5, y: 0.5 };
const CENTER_INDEX = Math.round(CENTER.y * (SIZE - 1)) * SIZE + Math.round(CENTER.x * (SIZE - 1));

function plate(id, { bornAtSimulationTimeMs = 0, cells = [CENTER_INDEX], meanHalfWidth = 0.02 } = {}) {
  const mask = new Array(SIZE * SIZE).fill(0);
  for (const cell of cells) mask[cell] = 1;
  return {
    id,
    bornAtSimulationTimeMs,
    grid: { width: SIZE, height: SIZE },
    mask,
    meanHalfWidth,
    material: { stiffness: 0.9, density: 1.1, damping: 0.3 },
    centerline: [],
    edges: [],
    principalPath: [],
    pickups: []
  };
}

function contactEvent(count, position = CENTER) {
  return {
    type: 'FOOT_CONTACT',
    antId: 'ant-1',
    position: { x: 0.99, y: 0.01 }, // Group centroid is deliberately irrelevant.
    strength: 0.8,
    contacts: Array.from({ length: count }, (_, index) => ({
      legId: `leg-${index}`,
      position: { ...position }
    }))
  };
}

function advanceFor(system, surface, fromMs, toMs, stepMs = 1000) {
  const births = [];
  for (let time = fromMs; time <= toMs; time += stepMs) {
    births.push(...system.advance({ surface, simulationTimeMs: time }));
  }
  return births;
}

function supportField(value) {
  return { sample: () => value };
}

function addStack(system, count = 4) {
  for (let index = 0; index < count; index += 1) {
    assert.ok(system.addPlate(plate(`plate-${index + 1}`, { bornAtSimulationTimeMs: index * 1000 })));
  }
}

test('plate descriptors create immutable bottom-to-top cell columns and age never creates depth', () => {
  const system = new MaterialStratigraphy({ width: SIZE, height: SIZE });
  const original = plate('foundation', { bornAtSimulationTimeMs: 0 });
  const stored = system.addPlate(original);
  original.mask[CENTER_INDEX] = 0;
  assert.equal(stored.mask[CENTER_INDEX], 1, 'the historical mask is cloned and frozen');
  assert.equal(Object.isFrozen(stored) && Object.isFrozen(stored.mask), true);

  system.advance({ surface: supportField(0), simulationTimeMs: 120000 });
  let snapshot = system.getSnapshot();
  assert.equal(snapshot.stratigraphy.layerCountByCell[CENTER_INDEX], 1);
  assert.equal(snapshot.stratigraphy.totalDepthByCellMeters[CENTER_INDEX], 0,
    'a single aged layer has no burial depth');
  assert.equal(snapshot.stratigraphy.plateHistory[0].ageMs, 120000);
  assert.equal(snapshot.stratigraphy.plateHistory[0].maxBurialLayerCount, 0);

  const overlay = plate('overlay', { bornAtSimulationTimeMs: 120000, meanHalfWidth: 0.03 });
  const top = system.addPlate(overlay);
  snapshot = system.getSnapshot();
  assert.deepEqual(snapshot.stratigraphy.layerOrder, ['foundation', 'overlay']);
  assert.equal(snapshot.stratigraphy.topLayerByCell[CENTER_INDEX], 1);
  assert.equal(snapshot.stratigraphy.layerCountByCell[CENTER_INDEX], 2);
  assert.ok(Math.abs(snapshot.stratigraphy.totalDepthByCellMeters[CENTER_INDEX] - 0.0025) < 1e-9,
    'depth is the thickness of the later overlay, not elapsed age');
  assert.equal(snapshot.stratigraphy.plateHistory[0].ageMs, 120000);
  assert.equal(snapshot.stratigraphy.plateHistory[0].maxBurialLayerCount, 1);
  assert.equal(system.getTopPlateAt(CENTER.x, CENTER.y).descriptor, top);
  assert.equal(system.getTopPlateAt(-0.1, CENTER.y), null);
  assert.equal(system.getColumnAt(CENTER.x, CENTER.y).map(layer => layer.id).join(','), 'foundation,overlay');
});

test('cached topology lookup and stable plate index mapping expose only the uppermost material', () => {
  const system = new MaterialStratigraphy({ width: SIZE, height: SIZE });
  const emptySnapshot = system.getSnapshot();
  assert.equal(emptySnapshot.stratigraphy.topLayerByCell[CENTER_INDEX], -1);
  const first = system.addPlate(plate('first'));
  const firstSnapshot = system.getSnapshot();
  const cachedTop = firstSnapshot.stratigraphy.topLayerByCell;
  assert.equal(cachedTop[CENTER_INDEX], 0);
  assert.equal(firstSnapshot.stratigraphy.layerOrder[0], first.id);
  const second = system.addPlate(plate('second'));
  const secondSnapshot = system.getSnapshot();
  assert.equal(secondSnapshot.revision, firstSnapshot.revision + 1);
  assert.equal(secondSnapshot.stratigraphy.topLayerByCell[CENTER_INDEX], 1);
  assert.equal(secondSnapshot.stratigraphy.layerOrder[1], second.id);
  assert.equal(system.getTopPlateAt(CENTER.x, CENTER.y).id, 'second');
  assert.equal(emptySnapshot.stratigraphy.topLayerByCell[CENTER_INDEX], -1,
    'an earlier snapshot retains its cached exposure map');
});

test('FOOT_CONTACT counts each in-domain foot and ignores centroid, strength, malformed and out-of-domain data', () => {
  const system = new MaterialStratigraphy({ width: SIZE, height: SIZE });
  const event = contactEvent(3);
  event.contacts.push({ legId: 'outside', position: { x: 1.01, y: 0.5 } });
  event.contacts.push({ legId: 'nan', position: { x: Number.NaN, y: 0.5 } });
  event.contacts.push({ legId: '', position: CENTER });
  assert.equal(system.applyFootContact(event, supportField(1)), 3);
  assert.equal(system.getFootLoadAt(CENTER.x, CENTER.y), 3);
  assert.equal(system.getSnapshot().diagnostics.totalAcceptedFootContacts, 3);
  assert.equal(system.getSnapshot().diagnostics.rejectedFootContacts, 3);
  assert.equal(system.applyFootContact({ type: 'not-contact', contacts: [] }), 0);
  assert.equal(system.getSnapshot().diagnostics.rejectedFootContacts, 4);
});

test('a nodule requires four overlapping plates, three buried layers, compaction, actual foot load and persistence', () => {
  const system = new MaterialStratigraphy({ width: SIZE, height: SIZE });
  addStack(system, 4);
  const threshold = MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION;
  assert.equal(system.applyFootContact(contactEvent(threshold.minimumLocalFootLoad), supportField(1)), 200);
  const born = advanceFor(system, supportField(threshold.minimumCompaction), 0, threshold.persistenceMs);
  assert.equal(born.length, 1);
  const [nodule] = born;
  assert.equal(nodule.modalCount, 12);
  assert.deepEqual(nodule.sourcePlateIDs, ['plate-1', 'plate-2', 'plate-3', 'plate-4']);
  assert.equal(nodule.burial.layerCount, 4);
  assert.equal(nodule.burial.buriedLayerCount, 3);
  assert.equal(nodule.burial.foundationPlateId, 'plate-1');
  assert.equal(nodule.coupling.plateId, 'plate-1', 'the sphere couples to the deepest buried plate');
  assert.equal(nodule.coupling.type, 'buried-foundation');
  assert.equal(nodule.support.compaction, threshold.minimumCompaction);
  assert.equal(nodule.support.localFootLoad, threshold.minimumLocalFootLoad);
  assert.ok(nodule.radius >= 0.018 && nodule.radius <= 0.028);
  assert.equal(nodule.physicalRadiusMeters, nodule.radius);
  assert.ok(nodule.material.density >= 1800 && nodule.material.density <= 2200);
  assert.ok(nodule.material.youngModulus >= 0.3e6 && nodule.material.youngModulus <= 1.2e6);
  assert.ok(nodule.material.poisson >= 0.25 && nodule.material.poisson <= 0.35);
  assert.ok(nodule.material.damping >= 0.2 && nodule.material.damping <= 0.6);
  assert.ok(Object.isFrozen(nodule) && Object.isFrozen(nodule.material));
  assert.equal(system.getNodules()[0], nodule);
  assert.equal(system.getSnapshot().noduleRevision, 1);
});

test('elapsed simulation time alone cannot create a nodule without contact load or enough material history', () => {
  const underloaded = new MaterialStratigraphy({ width: SIZE, height: SIZE });
  addStack(underloaded, 4);
  underloaded.applyFootContact(contactEvent(199));
  assert.deepEqual(advanceFor(underloaded, supportField(1), 0, 60000), []);

  const underlayered = new MaterialStratigraphy({ width: SIZE, height: SIZE });
  addStack(underlayered, 3);
  underlayered.applyFootContact(contactEvent(500));
  assert.deepEqual(advanceFor(underlayered, supportField(1), 0, 60000), []);

  const uncompacted = new MaterialStratigraphy({ width: SIZE, height: SIZE });
  addStack(uncompacted, 4);
  uncompacted.applyFootContact(contactEvent(500));
  assert.deepEqual(advanceFor(uncompacted, supportField(0.549), 0, 60000), []);
});

test('loss of a qualification condition resets persistence instead of banking old elapsed time', () => {
  const system = new MaterialStratigraphy({ width: SIZE, height: SIZE });
  addStack(system, 4);
  system.applyFootContact(contactEvent(200));
  const surface = { sample: () => 0.8 };
  advanceFor(system, surface, 0, 20000);
  surface.sample = () => 0.54;
  system.advance({ surface, simulationTimeMs: 21000 });
  surface.sample = () => 0.8;
  assert.deepEqual(advanceFor(system, surface, 22000, 51000), []);
  assert.equal(advanceFor(system, surface, 52000, 52000).length, 1);
});

test('metadata cap, read-only topology reuse and reset retain deterministic bounded state', () => {
  const system = new MaterialStratigraphy({ width: SIZE, height: SIZE, maxPlates: 1 });
  system.addPlate(plate('one'));
  const snapshot = system.getSnapshot();
  assert.equal(snapshot.plates.length, 1, 'new frozen descriptors are immediately visible to audio sync');
  const top = snapshot.stratigraphy.topLayerByCell;
  assert.equal(system.addPlate(plate('two')), false);
  assert.equal(system.getPlates().length, 1);
  assert.equal(system.getSnapshot().stratigraphy.topLayerByCell, top,
    'a rejected birth does not rebuild or replace cached topology');
  system.reset();
  assert.equal(system.getPlates().length, 0);
  assert.equal(system.getNodules().length, 0);
  assert.equal(system.getFootLoadAt(CENTER.x, CENTER.y), 0);
  assert.equal(system.getSnapshot().stratigraphy.topLayerByCell[CENTER_INDEX], -1);
});

test('default metadata ceiling preserves more than the previous twelve plate limit without eviction', () => {
  const system = new MaterialStratigraphy({ width: SIZE, height: SIZE });
  for (let index = 0; index < 13; index += 1) {
    assert.ok(system.addPlate(plate(`layer-${index + 1}`, { bornAtSimulationTimeMs: index * 1000 })));
  }
  const snapshot = system.getSnapshot();
  assert.equal(snapshot.plates.length, 13);
  assert.equal(snapshot.stratigraphy.layerOrder.length, 13);
  assert.equal(snapshot.stratigraphy.layerCountByCell[CENTER_INDEX], 13);
  assert.equal(snapshot.stratigraphy.topLayerByCell[CENTER_INDEX], 12);
  assert.equal(snapshot.stratigraphy.plateHistory[0].maxBurialLayerCount, 12);
  assert.ok(Math.abs(snapshot.stratigraphy.plateHistory[0].maxBurialDepthMeters
    - snapshot.stratigraphy.totalDepthByCellMeters[CENTER_INDEX]) < 1e-8);
});
