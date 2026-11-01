import test from 'node:test';
import assert from 'node:assert/strict';
import { MaterialStratigraphy } from '../src/lib/agents/ant/MaterialStratigraphy.js';
import { deriveResults } from '../scripts/ant-singleton-real-stratigraphy-results.js';

const anchor = (timeMs, mature, single, contested, decision = []) => ({ timeMs,
  activeOpportunities: { B: 2, C: 3 }, newMaturations: { B: 1, C: 0 },
  uniqueMatureXOptions: mature, singletonOptions: single, contestedOptions: contested,
  formation: { decisions: decision }, productionBirthIds: [] });
const pack = values => { const typed = values; return { type: typed.constructor.name, length: typed.length,
  data: Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64') }; };
const emptyArm = arm => ({ testFixture: true, arm, anchors: [], births: [], checkpoints: [] });
function emptyRealArm() {
  return { ...emptyArm('real-stratigraphy'), actualMaterial: { plates: [], plateCount: 0, productionPlateCount: 0,
    researchPlateCount: 0, coverageCells: 0, layerCounts: pack(new Uint16Array(9216)),
    topPlateIdentity: pack(Int32Array.from({ length: 9216 }, () => -1)), depthMeters: pack(new Float32Array(9216)),
    provenance: { production: { maskIncidences: 0, topCells: 0, buriedIncidences: 0 },
      research: { maskIncidences: 0, topCells: 0, buriedIncidences: 0 } },
    layerDistribution: { 0: 9216 }, layerQuantiles: { q50: 0, q90: 0, max: 0 } },
    plateChronology: [], localBirthLedger: [], localInsertions: [], noduleLineage: [], events: [], decisions: [] };
}
const mask = cells => Array.from({ length: 9216 }, (_, i) => cells.includes(i) ? 1 : 0);

test('60-second windows use actual anchor times and exact half-open boundaries', () => {
  const runs = { control: { ...emptyArm('control'), anchors: [anchor(1, 1, 1, 0), anchor(60_000, 3, 2, 1)] },
    overlay: emptyArm('overlay'), realStratigraphy: emptyRealArm() };
  runs.control.checkpoints = [{ requestedSeconds: 60, timeMs: 60_000, livingPopulation: 2 }];
  const result = deriveResults(runs);
  assert.equal(result.summary.arms.control.windows[0].anchorCount, 1);
  assert.equal(result.summary.arms.control.windows[0].matureXMean, 1);
  assert.equal(result.summary.arms.control.windows[1].anchorCount, 1);
  assert.equal(result.summary.arms.control.windows[1].bOpportunities, 2);
  assert.equal(result.checkpointWorldComparison.nominal[0].control.livingPopulation, 2);
  assert.equal(result.checkpointWorldComparison.nominal[1].control, null, 'missing nominal checkpoint is preserved as missing');
});

test('material chronology rebuilds exact masks, pair overlaps and full-grid quantiles', () => {
  const strata = new MaterialStratigraphy();
  const plates = [
    { id: 'trail-plate-1', bornAtSimulationTimeMs: 5, grid: { width: 96, height: 96 }, mask: mask([1, 2, 3]) },
    { id: 'research-local-X-1', bornAtSimulationTimeMs: 10, grid: { width: 96, height: 96 }, mask: mask([2, 3, 4]), provenance: { kind: 'research-local-singleton-X' } },
    { id: 'research-local-X-2', bornAtSimulationTimeMs: 11, grid: { width: 96, height: 96 }, mask: mask([3, 4]), provenance: { kind: 'research-local-singleton-X' } }
  ].map(plate => strata.addPlate(plate));
  const snapshot = strata.getSnapshot();
  const { layerCountByCell: layerCounts, topLayerByCell: top, totalDepthByCellMeters: depth } = snapshot.stratigraphy;
  const provenance = { production: { maskIncidences: 3, topCells: 1, buriedIncidences: 2 },
    research: { maskIncidences: 5, topCells: 3, buriedIncidences: 2 } };
  const layerDistribution = { 0: 9212, 1: 1, 2: 2, 3: 1 };
  const layerQuantiles = { q50: 0, q90: 0, max: 3 };
  const actualMaterial = { plates: plates.map(plate => ({ ...plate, mask: pack(Uint8Array.from(plate.mask)) })),
    plateCount: 3, productionPlateCount: 1, researchPlateCount: 2,
    coverageCells: layerCounts.reduce((sum, value) => sum + Number(value > 0), 0), layerCounts: pack(layerCounts),
    topPlateIdentity: pack(top), depthMeters: pack(depth), provenance, layerDistribution, layerQuantiles };
  const runs = { control: emptyArm('control'), overlay: emptyArm('overlay'), realStratigraphy: { ...emptyRealArm(),
    actualMaterial, plateChronology: plates.map((plate, sequence) => ({ sequence, id: plate.id, timeMs: plate.bornAtSimulationTimeMs })),
    localBirthLedger: [], localInsertions: [], noduleLineage: [] } };
  const material = deriveResults(runs).material;
  assert.deepEqual([material.productionCoverageCells, material.researchCoverageCells, material.combinedCoverageCells], [3, 3, 4]);
  assert.equal(material.productionResearchIntersectionCells, 2);
  assert.equal(material.layerCellIncidences, 8);
  assert.equal(material.layerCountQuantiles.denominatorCells, 9216);
  assert.deepEqual(material.layerCountQuantiles, { denominatorCells: 9216, q50NearestObserved: 0, q90NearestObserved: 0, max: 3 });
  assert.deepEqual(material.pairOverlaps.map(row => [row.earlierPlateId, row.laterPlateId, row.intersectionCellCount]), [
    ['trail-plate-1', 'research-local-X-1', 2], ['trail-plate-1', 'research-local-X-2', 1], ['research-local-X-1', 'research-local-X-2', 2]
  ]);
  assert.equal(material.earliestOverlapExamples['production->research'].exampleCell, 2);
});

test('nodule lineage stays unclassified without source plate receipts', () => {
  const runs = { control: emptyArm('control'), overlay: emptyArm('overlay'), realStratigraphy: { ...emptyRealArm(),
    noduleLineage: [{ id: 'n1', timeMs: 1, sourcePlateIDs: [], researchSourcePlateIDs: [], sourcePlateProvenance: [] },
      { id: 'n2', timeMs: 2, foundationPlateId: 'trail-plate-1', sourcePlateIDs: ['trail-plate-1'], researchSourcePlateIDs: [],
        sourcePlateProvenance: [{ id: 'trail-plate-1', kind: 'production' }] },
      { id: 'n3', timeMs: 3, foundationPlateId: 'trail-plate-1', sourcePlateIDs: ['trail-plate-1', 'research-local-X-1'],
        researchSourcePlateIDs: ['research-local-X-1'], sourcePlateProvenance: [{ id: 'trail-plate-1', kind: 'production' },
          { id: 'research-local-X-1', kind: 'research' }] }] } };
  const rows = deriveResults(runs).noduleLineage;
  assert.deepEqual(rows.map(row => row.classification), [null, 'production-only', 'research-involving']);
});

test('native qualification predicate changes and candidate timer resets remain separate', () => {
  const runs = { control: emptyArm('control'), overlay: emptyArm('overlay'), realStratigraphy: emptyRealArm() };
  runs.realStratigraphy.lineageValidationFixture = true;
  runs.realStratigraphy.localInsertions = [{ xCells: [7, 8], qualificationBefore: [
    { cell: 7, predicate: true }, { cell: 8, predicate: false }], qualificationAfter: [
    { cell: 7, predicate: false }, { cell: 8, predicate: true }],
  candidateSinceBefore: [1000, -1], candidateSinceAfter: [-1, -1],
  noduleEngineBefore: { lastAdvanceTimeMs: 2 }, noduleEngineAfter: { lastAdvanceTimeMs: 2 } }];
  const receipt = deriveResults(runs).qualification;
  assert.equal(receipt.predicateTrueToFalse, 1);
  assert.equal(receipt.predicateFalseToTrue, 1);
  assert.equal(receipt.candidateTimerCleared, 1);
  assert.equal(receipt.candidateTimerChanged, 1);
  assert.equal(receipt.nativeNoduleEngineStateChanged, 0);
});

test('a capacity-stop checkpoint preserves its tick and is not used as a later nominal point', () => {
  const runs = { control: emptyArm('control'), overlay: emptyArm('overlay'), realStratigraphy: emptyRealArm() };
  const tick = 16_201;
  runs.realStratigraphy.checkpoints = [
    { requestedSeconds: 240, checkpointType: 'nominal', timeMs: 240_000 },
    { requestedSeconds: tick / 60, checkpointType: 'capacity-stop', tick, timeMs: tick * 1000 / 60 }
  ];
  const checkpoints = deriveResults(runs).checkpointWorldComparison;
  assert.equal(checkpoints.nominal[3].realStratigraphy.requestedSeconds, 240);
  assert.equal(checkpoints.nominal[4].realStratigraphy, null);
  assert.equal(checkpoints.realCapacityStops[0].tick, tick);
  assert.equal(checkpoints.realCapacityStops[0].timeMs, tick * 1000 / 60);
});

test('real insertion lineage round-trips decision X through mask, descriptor, and birth receipt', () => {
  const cell = 4321, eventId = '20261005:B:17:I002', descriptorId = 'research-local-X-0001';
  const strata = new MaterialStratigraphy();
  const plate = strata.addPlate({ id: descriptorId, bornAtSimulationTimeMs: 1000, grid: { width: 96, height: 96 },
    mask: mask([cell]), provenance: { kind: 'research-local-singleton-X', channels: ['B'], eventIds: [eventId] } });
  const snapshot = strata.getSnapshot(), layers = snapshot.stratigraphy.layerCountByCell;
  const receipt = { id: descriptorId, timeMs: 1000, sequence: 0, maskIndices: [cell], maskCells: 1,
    eventIds: [eventId], channels: ['B'], provenance: plate.provenance };
  const actualMaterial = { plates: [{ ...plate, mask: pack(Uint8Array.from(plate.mask)) }], plateCount: 1,
    productionPlateCount: 0, researchPlateCount: 1, coverageCells: 1,
    layerCounts: pack(layers), topPlateIdentity: pack(snapshot.stratigraphy.topLayerByCell),
    depthMeters: pack(snapshot.stratigraphy.totalDepthByCellMeters),
    provenance: { production: { maskIncidences: 0, topCells: 0, buriedIncidences: 0 },
      research: { maskIncidences: 1, topCells: 1, buriedIncidences: 0 } },
    layerDistribution: { 0: 9215, 1: 1 }, layerQuantiles: { q50: 0, q90: 0, max: 1 } };
  const insertion = { decisionTimeMs: 1000, descriptorId, eventIds: [eventId], provenance: plate.provenance,
    xCells: [cell], qualificationBefore: [{ cell, predicate: false }], qualificationAfter: [{ cell, predicate: false }],
    candidateSinceBefore: [-1], candidateSinceAfter: [-1], noduleEngineBefore: {}, noduleEngineAfter: {} };
  const runs = { control: emptyArm('control'), overlay: emptyArm('overlay'), realStratigraphy: {
    ...emptyRealArm(), events: [{ eventId, channel: 'B' }],
    decisions: [{ timeMs: 1000, eventIds: [eventId], provenance: ['B'], xCells: [cell], disposition: 'singleton-control-observation' }],
    localInsertions: [insertion], localBirthLedger: [receipt], plateChronology: [receipt], actualMaterial
  } };
  assert.equal(deriveResults(runs).material.researchMaskSizes[0].cellCount, 1);
  runs.realStratigraphy.localInsertions[0].xCells = [cell + 1];
  assert.throws(() => deriveResults(runs), /exactly match source decision X/);
});
