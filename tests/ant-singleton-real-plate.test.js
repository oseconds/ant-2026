import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchLocalPlate } from '../scripts/ant-singleton-real-plate.js';
import { MaterialStratigraphy } from '../src/lib/agents/ant/MaterialStratigraphy.js';
import { SurfaceAudioBridge } from '../src/lib/audio/SurfaceAudioBridge.js';

const at = (x, y) => y * 96 + x;
const decision = (xCells, overrides = {}) => ({ timeMs: 12.5, xCells,
  provenance: ['B', 'C'], eventIds: ['event-b', 'event-c'], ...overrides });

test('builds exact connected X masks with no inferred corridor fields or RNG use', () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('constructor consumed RNG'); };
  try {
    const xCells = [at(40, 40), at(41, 40), at(42, 40), at(41, 41), at(42, 41)];
    const plate = createResearchLocalPlate(decision(xCells), 1);
    assert.equal(plate.id, 'research-local-X-0001');
    assert.equal(plate.bornAtSimulationTimeMs, 12.5);
    assert.equal(plate.mask.length, 96 ** 2);
    assert.deepEqual(plate.mask.flatMap((value, index) => value ? [index] : []), xCells);
    assert.deepEqual(plate.pickups, [
      { x: 40 / 95, y: 40 / 95 }, { x: 42 / 95, y: 41 / 95 }
    ]);
    assert.deepEqual(plate.material, { stiffness: 0.9, density: 1.1, damping: 0.35 });
    assert.deepEqual(plate.provenance, { kind: 'research-local-singleton-X', channels: ['B', 'C'],
      eventIds: ['event-b', 'event-c'] });
    for (const field of ['source', 'target', 'centerline', 'principalPath', 'widths', 'meanHalfWidth']) {
      assert.equal(field in plate, false, `${field} must not be invented`);
    }
  } finally { Math.random = originalRandom; }
});

test('accepts a two-cell X and keeps B, C, and BC on the same neutral material baseline', () => {
  const xCells = [at(0, 0), at(1, 0)];
  const plates = [['B'], ['C'], ['B', 'C']].map((provenance, index) =>
    createResearchLocalPlate(decision(xCells, { provenance, eventIds: [provenance.join('+')] }), index + 1));
  assert.deepEqual(plates.map(plate => plate.material), Array(3).fill({ stiffness: 0.9, density: 1.1, damping: 0.35 }));
  assert.deepEqual(plates.map(plate => plate.provenance.channels), [['B'], ['C'], ['B', 'C']]);
  assert.deepEqual(plates[0].mask, plates[2].mask);
});

test('validates IDs, xCells geometry, time, provenance, and event IDs', () => {
  const valid = decision([at(10, 10), at(11, 10)]);
  for (const serial of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createResearchLocalPlate(valid, serial), RangeError);
  }
  for (const bad of [
    decision([], {}), decision([at(10, 10), at(9, 10)]), decision([at(10, 10), at(10, 10)]),
    decision([at(10, 10), at(12, 10)]), decision([at(10, 10), 96 ** 2]),
    decision([at(10, 10)], { timeMs: -1 }), decision([at(10, 10)], { timeMs: Infinity }),
    decision([at(10, 10)], { provenance: ['C', 'B'] }), decision([at(10, 10)], { provenance: ['B', 'B'] }),
    decision([at(10, 10)], { eventIds: ['ok', 3] })
  ]) assert.throws(() => createResearchLocalPlate(bad, 1));
});

test('MaterialStratigraphy freezes exact mask and copied provenance in birth order', () => {
  const model = new MaterialStratigraphy({ maxPlates: 2 });
  const firstInput = decision([at(30, 30), at(31, 30)], { timeMs: 10, provenance: ['B'], eventIds: ['b1'] });
  const first = createResearchLocalPlate(firstInput, 1);
  firstInput.xCells[0] = at(29, 30);
  firstInput.eventIds[0] = 'changed';
  assert.ok(model.addPlate(first));
  assert.ok(model.addPlate(createResearchLocalPlate(decision([at(30, 30)], { timeMs: 20, provenance: ['C'], eventIds: ['c1'] }), 2)));
  const snapshot = model.getSnapshot();
  assert.deepEqual(snapshot.plates.map(plate => plate.id), ['research-local-X-0001', 'research-local-X-0002']);
  assert.deepEqual(snapshot.plates.map(plate => plate.bornAtSimulationTimeMs), [10, 20]);
  assert.deepEqual(snapshot.plates[0].provenance.eventIds, ['b1']);
  assert.equal(Object.isFrozen(snapshot.plates[0].mask), true);
  assert.equal(snapshot.plates[0].mask[at(30, 30)], 1);
  assert.deepEqual(model.getColumnAt(30 / 95, 30 / 95).map(layer => layer.thicknessMeters), [0.002, 0.002]);
  assert.equal(model.getColumnAt(30 / 95, 30 / 95)[0].buriedDepthMeters, 0.002);
  assert.throws(() => model.addPlate(createResearchLocalPlate(decision([at(40, 40)]), 1)), /already exists/);
  assert.equal(model.addPlate(createResearchLocalPlate(decision([at(40, 40)]), 3)), false);
});

test('two-cell and branched masks pass bridge storage and material topology compilation unchanged', () => {
  const bridge = new SurfaceAudioBridge({ audioEngine: {} });
  const cells = [
    [at(0, 0), at(1, 0)],
    [at(40, 40), at(41, 40), at(42, 40), at(41, 41), at(42, 41)]
  ];
  const plates = cells.map((xCells, index) => createResearchLocalPlate(decision(xCells), index + 1));
  assert.equal(bridge.storePlates(plates), 2);
  const material = new MaterialStratigraphy({ maxPlates: 2 });
  plates.forEach(plate => material.addPlate(plate));
  const snapshot = material.getSnapshot();
  assert.equal(bridge.syncMaterial(snapshot), true);
  assert.equal(bridge.topology.sourceGrid, 96);
  for (const plate of plates) {
    assert.deepEqual(bridge.plates.get(plate.id).mask, plate.mask);
    assert.deepEqual([...bridge.topology.routingTopLayerByCell96]
      .flatMap((layer, index) => layer >= 0 && snapshot.plates[layer].id === plate.id && plate.mask[index] ? [index] : []),
    [...plate.mask.flatMap((value, index) => value ? [index] : [])]);
  }
  bridge.destroy();
});
