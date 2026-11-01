import test from 'node:test';
import assert from 'node:assert/strict';
import { MaterialStratigraphy } from '../src/lib/agents/ant/MaterialStratigraphy.js';
import { materialLayerCountAtSnapshot } from '../src/lib/agents/ant/AntController.js';
import { createResearchLocalPlate } from '../scripts/ant-singleton-real-plate.js';
import { actualPlateCapacityReached, assertArmReplicatesPrior, assertFrozenAuthorityMetadata,
  nativeColumnDepthMeters } from '../scripts/ant-singleton-real-stratigraphy-probe.js';

test('replication projection ignores branch only and rejects evidence changes', () => {
  const prior = { arm: 'control', seed: '20261005', experimentBranch: 'prior', tickStateHashes: ['a'],
    anchors: [{ E: [0, 1], decisions: ['single'] }], tickMetrics: [{ tick: 1 }], checkpoints: [{ timeMs: 60000 }] };
  const actual = structuredClone(prior);
  actual.experimentBranch = 'new';
  assert.deepEqual(assertArmReplicatesPrior(actual, prior), {
    arm: 'control', allRunFieldsExactExceptBranch: true, tickStateHashes: 1, anchors: 1, tickMetrics: 1, checkpoints: 1
  });
  assert.throws(() => assertArmReplicatesPrior({ ...actual, tickMetrics: [{ tick: 2 }] }, prior), /replicate saved seed-05/);
  assert.throws(() => assertArmReplicatesPrior({ ...actual, anchors: [{ E: [1, 0] }] }, prior), /replicate saved seed-05/);
  assert.throws(() => assertArmReplicatesPrior(actual, prior, { tuples: [1] }, { tuples: [2] }), /exposure tuples/);
});

test('a local Plate enters native stratigraphy after completed tick and reads next tick', () => {
  const strata = new MaterialStratigraphy();
  const cell = 48 * 96 + 48, x = 48 / 95, y = 48 / 95;
  const toy = { materialStratigraphy: strata, researchLayerCountProvider: null, timeMs: 0,
    tick() { const count = materialLayerCountAtSnapshot(strata.getSnapshot(), x, y); this.timeMs += 1000 / 60; return count; } };
  assert.equal(toy.tick(), 0);
  const completedTickTimeMs = toy.timeMs;
  const plate = createResearchLocalPlate({ timeMs: completedTickTimeMs, provenance: ['B'],
    eventIds: ['B:T1:I001'], xCells: [cell] }, 1);
  const insertion = strata.addPlate(plate);
  assert.equal(insertion.id, plate.id);
  assert.equal(toy.timeMs, completedTickTimeMs, 'insertion cannot rewind or replay completed movement');
  assert.equal(materialLayerCountAtSnapshot(strata.getSnapshot(), x, y), 1);
  assert.equal(toy.tick(), 1, 'native material count appears at next tick entry');
  assert.equal(toy.researchLayerCountProvider, null);
  assert.equal(strata.candidateSinceMs[cell], -1, 'native addPlate resets its covered-cell qualification timer');
});

test('combined material cap stops at the actual stored Plate count', () => {
  const material = { plates: Array.from({ length: 255 }, (_, index) => ({ id: String(index) })) };
  assert.equal(actualPlateCapacityReached(material), false);
  material.plates.push({ id: '255' });
  assert.equal(actualPlateCapacityReached(material), true);
  assert.equal(actualPlateCapacityReached(material, 257), false);
});

test('frozen authority metadata binds audio, horizon, authority and source hashes', () => {
  const hashes = { 'src/a.js': 'aaa', 'src/b.js': 'bbb' };
  const frozen = { authority: 'bc045dc3caa5954df633ecbee37fbabcb8224f30', audio: 'Off', hz: 60, seconds: 600,
    sourceHashes: hashes, validation: { authorityHead: 'bc045dc3caa5954df633ecbee37fbabcb8224f30' } };
  assert.equal(assertFrozenAuthorityMetadata(frozen, hashes).sourceHashesExact, true);
  assert.throws(() => assertFrozenAuthorityMetadata({ ...frozen, seconds: 300 }, hashes), /horizon/);
  assert.throws(() => assertFrozenAuthorityMetadata(frozen, { ...hashes, 'src/a.js': 'changed' }), /source hashes/);
});

test('native depth excludes bottom Plate and uses descending Float32 accumulation', () => {
  const strata = new MaterialStratigraphy();
  const cell = 48 * 96 + 48, decision = serial => ({ timeMs: serial * 1000,
    provenance: ['B'], eventIds: [`B:T${serial}:I001`], xCells: [cell] });
  const first = createResearchLocalPlate(decision(1), 1); first.thicknessMeters = 0.005;
  strata.addPlate(first);
  assert.equal(strata.totalDepthByCellMeters[cell], 0);
  const second = createResearchLocalPlate(decision(2), 2); second.thicknessMeters = 0.003;
  strata.addPlate(second);
  assert.equal(strata.totalDepthByCellMeters[cell], nativeColumnDepthMeters(strata, strata.columns[cell]));
  const third = createResearchLocalPlate(decision(3), 3); third.thicknessMeters = 0.007;
  strata.addPlate(third);
  assert.equal(strata.totalDepthByCellMeters[cell], nativeColumnDepthMeters(strata, strata.columns[cell]));
  assert.equal(strata.totalDepthByCellMeters[cell], Math.fround(Math.fround(0.007) + 0.003));
});
