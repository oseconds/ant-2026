import test from 'node:test';
import assert from 'node:assert/strict';
import { createW1CellHistoryObserver } from '../scripts/ant-w1-cell-history.js';

const WIDTH = 4, HEIGHT = 1;
const flags = values => Uint8Array.from(values);

test('actual merge transfers source admissions and owned active samples, without direct-credit leakage', () => {
  const observer = createW1CellHistoryObserver({ width: WIDTH, height: HEIGHT,
    feet: [{ cellIndex: 1, timeSeconds: 0, contactIndex: 0 }, { cellIndex: 1, timeSeconds: 1, contactIndex: 1 }] });
  observer.advance({ frameIndex: 0, timeSeconds: 0, flags: flags([7, 3, 0, 0]),
    operations: [{ type: 'directAdmission', identityId: 5, cells: [0] }, { type: 'directAdmission', identityId: 9, cells: [1] }],
    activeOwners: [{ identityId: 5, cells: [0] }, { identityId: 9, cells: [1] }] });
  const prefix = observer.snapshot(9);
  observer.advance({ frameIndex: 1, timeSeconds: 1, flags: flags([0, 7, 0, 0]),
    operations: [{ type: 'merge', targetId: 5, sourceId: 9 }, { type: 'directAdmission', identityId: 5, cells: [1] }],
    activeOwners: [{ identityId: 5, cells: [1] }] });
  observer.advance({ frameIndex: 2, timeSeconds: 2, flags: flags([0, 0, 0, 0]),
    operations: [], activeOwners: [] });

  const merged = observer.snapshot(9);
  assert.equal(prefix.canonicalId, 9);
  assert.deepEqual(prefix.historicalCellIndices, [1]);
  assert.equal(prefix.cutoffFrameIndex, 0, 'captured prefix does not acquire later frames');
  assert.equal(merged.canonicalId, 5);
  assert.deepEqual(observer.getUnion(9), { requestedId: 9, canonicalId: 5, cellIndices: [0, 1],
    firstAdmissionFrameByCell: [0, 0], firstAdmissionTimeSecondsByCell: [0, 0] });
  assert.deepEqual(merged.historicalCellIndices, [0, 1]);
  assert.deepEqual(merged.activeCellIndices, []);
  assert.equal(merged.directCellCount, 1);
  assert.equal(merged.inheritedCellCount, 1);
  assert.equal(merged.directUnionEntryCellCount, 1);
  assert.equal(merged.transferredUnionEntryCellCount, 1);
  assert.equal(merged.cells[1].firstUnionEntryRoute, 'inherited');
  assert.deepEqual(merged.cells[1].directSourceIds, [9]);
  assert.deepEqual(merged.cells[1].actualMergeSourceIds, [9]);
  assert.equal(merged.cells[1].directHere, false);
  assert.equal(merged.cells[1].episodeOwnedActiveSampleCount, 2, 'source-owned and target-owned active samples union once per frame');
  assert.equal(merged.cells[1].episodeOwnedActiveSpells, 1);
  assert.equal(merged.cells[1].episodeOwnedQTrueActiveObservations, 1);
  assert.equal(merged.cells[1].episodeOwnedQFalseActiveObservations, 1);
  assert.equal(merged.cells[1].lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds, 0);
});

test('same-frame source admission then transfer preserves operation order and separates direct/import overlap', () => {
  const observer = createW1CellHistoryObserver({ width: WIDTH, height: HEIGHT });
  observer.advance({ frameIndex: 0, timeSeconds: 0, flags: flags([0, 0, 7, 0]),
    operations: [{ type: 'directAdmission', identityId: 7, cells: [2] }, { type: 'merge', targetId: 3, sourceId: 7 }],
    activeOwners: [{ identityId: 3, cells: [2] }] });
  let target = observer.snapshot(3);
  assert.equal(target.cells[0].firstUnionEntryRoute, 'inherited');
  assert.equal(target.cells[0].canonicalFirstAdmissionFrame, 0);
  assert.equal(target.cells[0].firstImportHereFrame, 0);
  assert.equal(target.cells[0].directHere, false);
  assert.equal(target.mergeEvents[0].transferredCellCount, 1);

  observer.advance({ frameIndex: 1, timeSeconds: 1, flags: flags([0, 0, 3, 0]),
    operations: [{ type: 'directAdmission', identityId: 3, cells: [2] }], activeOwners: [{ identityId: 3, cells: [2] }] });
  target = observer.snapshot(3);
  assert.equal(target.cells[0].directHere, false, 'later local activity does not rewrite first-insertion route');
  assert.equal(target.cells[0].directExposureSampleCount, 1);
  assert.equal(target.cells[0].importedAndLocallyRevisitedSampleCount, 1);
});

test('union overlap records direct plus imported rows while split provenance alone is not transferred', () => {
  const observer = createW1CellHistoryObserver({ width: WIDTH, height: HEIGHT });
  observer.advance({ frameIndex: 0, timeSeconds: 0, flags: flags([7, 0, 0, 0]),
    operations: [{ type: 'directAdmission', identityId: 1, cells: [0] }], activeOwners: [{ identityId: 1, cells: [0] }] });
  observer.advance({ frameIndex: 1, timeSeconds: 1, flags: flags([3, 0, 0, 0]),
    operations: [{ type: 'directAdmission', identityId: 2, cells: [0] }], activeOwners: [{ identityId: 2, cells: [0] }] });
  const beforeMerge = observer.snapshot(1);
  assert.deepEqual(beforeMerge.activeCellIndices, [], 'episode-owned current geometry excludes another identity at the same coordinate');
  assert.deepEqual(beforeMerge.globalActiveHistoricalCellIndices, [0], 'global same-cell activity is retained as a separate measure');
  observer.advance({ frameIndex: 2, timeSeconds: 2, flags: flags([0, 0, 0, 0]),
    operations: [{ type: 'merge', targetId: 1, sourceId: 2 }], activeOwners: [] });
  const target = observer.snapshot(1);
  assert.equal(target.overlappingCellCount, 1);
  assert.equal(target.directCellCount + target.inheritedCellCount + target.overlappingCellCount, target.historicalCellCount);
  assert.equal(target.cells[0].firstUnionEntryRoute, 'direct');
  assert.equal(target.cells[0].directHere, true);
  assert.equal(target.cells[0].inheritedHere, true);
  assert.equal(target.mergeEvents[0].overlapCellCount, 1);
  assert.deepEqual(target.mergeEvents[0].overlapCellIndices, [0]);

  observer.advance({ frameIndex: 3, timeSeconds: 3, flags: flags([0, 0, 0, 7]),
    operations: [{ type: 'directAdmission', identityId: 4, cells: [3] }], activeOwners: [{ identityId: 4, cells: [3] }] });
  const fresh = observer.snapshot(4);
  assert.equal(fresh.inheritedCellCount, 0, 'ancestry-only split provenance has no merge operation and transfers no geometry');
  assert.deepEqual(fresh.historicalCellIndices, [3]);
});

test('rejects invalid frame order, duplicate cell owners and invalid grid indices', () => {
  const observer = createW1CellHistoryObserver({ width: WIDTH, height: HEIGHT });
  assert.throws(() => observer.advance({ frameIndex: 1, timeSeconds: 0, flags: flags([0, 0, 0, 0]), operations: [], activeOwners: [] }), /contiguous frame index/);
  assert.throws(() => observer.advance({ frameIndex: 0, timeSeconds: 0, flags: flags([0, 0, 0, 0]), operations: [],
    activeOwners: [{ identityId: 1, cells: [4] }] }), /active owner 1 cell is in grid/);
  assert.throws(() => observer.advance({ frameIndex: 0, timeSeconds: 0, flags: flags([0, 0, 0, 0]), operations: [],
    activeOwners: [{ identityId: 1, cells: [0] }, { identityId: 2, cells: [0] }] }), /active cell 0 has one owner/);
});

test('prefix snapshot is identical when future flags and foot events already exist in the input', () => {
  const prefixFeet = [{ cellIndex: 0, timeSeconds: 0.5, contactIndex: 0 }];
  const fullFeet = [...prefixFeet, { cellIndex: 0, timeSeconds: 3, contactIndex: 1 },
    { cellIndex: 1, timeSeconds: 4, contactIndex: 2 }];
  const make = feet => createW1CellHistoryObserver({ width: WIDTH, height: HEIGHT, feet });
  const prefix = make(prefixFeet), withFutureInput = make(fullFeet);
  const replayPrefix = observer => {
    observer.advance({ frameIndex: 0, timeSeconds: 0, flags: flags([0, 0, 0, 0]), operations: [], activeOwners: [] });
    observer.advance({ frameIndex: 1, timeSeconds: 1, flags: flags([7, 0, 0, 0]),
      operations: [{ type: 'directAdmission', identityId: 4, cells: [0] }], activeOwners: [{ identityId: 4, cells: [0] }] });
    return observer.snapshot(4);
  };
  const expected = replayPrefix(prefix), actual = replayPrefix(withFutureInput);
  assert.deepEqual(actual, expected);
  assert.equal(actual.cells[0].lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds, 0.5);
  assert.equal(actual.cells[0].lastActualSameCellFootContactAgeAtFirstImportHereSeconds, null);
  assert.equal(actual.cells[0].lastActualSameCellFootContactAgeAtFirstDirectHereSeconds, 0.5);
  assert.equal(actual.cells[0].chemicalQualifiedObservations, 1);
  assert.equal(actual.cells[0].episodeOwnedActiveSampleCount, 1);
  withFutureInput.advance({ frameIndex: 2, timeSeconds: 2, flags: flags([0, 0, 0, 0]), operations: [], activeOwners: [] });
  withFutureInput.advance({ frameIndex: 3, timeSeconds: 3, flags: flags([7, 0, 0, 0]),
    operations: [{ type: 'directAdmission', identityId: 4, cells: [0] }], activeOwners: [{ identityId: 4, cells: [0] }] });
  assert.equal(actual.cutoffFrameIndex, 1, 'captured prefix retains its original cutoff after future frames arrive');

  const noContact = createW1CellHistoryObserver({ width: WIDTH, height: HEIGHT });
  noContact.advance({ frameIndex: 0, timeSeconds: 0, flags: flags([0, 0, 0, 7]),
    operations: [{ type: 'directAdmission', identityId: 2, cells: [3] }], activeOwners: [{ identityId: 2, cells: [3] }] });
  assert.equal(noContact.snapshot(2).cells[0].lastActualSameCellFootContactAgeAtCanonicalAdmissionSeconds, null);
});

test('multi-hop actual transfers preserve earliest admission and do not mark ordinary earlier history ambiguous', () => {
  const observer = createW1CellHistoryObserver({ width: WIDTH, height: HEIGHT });
  observer.advance({ frameIndex: 0, timeSeconds: 0, flags: flags([7, 0, 0, 0]),
    operations: [{ type: 'directAdmission', identityId: 30, cells: [0] }], activeOwners: [{ identityId: 30, cells: [0] }] });
  observer.advance({ frameIndex: 1, timeSeconds: 1.25, flags: flags([0, 3, 0, 0]),
    operations: [{ type: 'directAdmission', identityId: 20, cells: [1] }], activeOwners: [{ identityId: 20, cells: [1] }] });
  observer.advance({ frameIndex: 2, timeSeconds: 4.5, flags: flags([0, 0, 3, 0]),
    operations: [{ type: 'merge', targetId: 20, sourceId: 30 }, { type: 'directAdmission', identityId: 10, cells: [2] }],
    activeOwners: [{ identityId: 20, cells: [0, 1] }, { identityId: 10, cells: [2] }] });
  observer.advance({ frameIndex: 3, timeSeconds: 8, flags: flags([0, 0, 0, 0]),
    operations: [{ type: 'merge', targetId: 10, sourceId: 20 }], activeOwners: [] });
  const snapshot = observer.snapshot(10), cell0 = snapshot.cells.find(row => row.cellIndex === 0);
  assert.equal(cell0.canonicalFirstAdmissionFrame, 0);
  assert.equal(cell0.canonicalFirstAdmissionTimeSeconds, 0);
  assert.equal(cell0.firstUnionEntryRoute, 'inherited');
  assert.equal(cell0.ambiguousAdmission, false, 'earlier source admission is a resolved minimum');
  assert.deepEqual(cell0.actualMergeSourceIds, [20, 30]);
  assert.deepEqual(snapshot.mergeEvents.map(event => [event.targetId, event.sourceId]), [[20, 30], [10, 20]]);
  assert.deepEqual(observer.getUnion(10).cellIndices, [0, 1, 2]);
  assert.equal(snapshot.transferredUnionEntryCellCount, 2);
});

test('owned and global spells use archived timestamps and remain separate under another identity reactivation', () => {
  const observer = createW1CellHistoryObserver({ width: WIDTH, height: HEIGHT });
  const priorRandom = Math.random;
  Math.random = () => { throw new Error('observer must not use RNG'); };
  try {
    observer.advance({ frameIndex: 0, timeSeconds: 0, flags: flags([7, 0, 0, 0]),
      operations: [{ type: 'directAdmission', identityId: 1, cells: [0] }], activeOwners: [{ identityId: 1, cells: [0] }] });
    observer.advance({ frameIndex: 1, timeSeconds: 2.5, flags: flags([0, 0, 0, 0]), operations: [], activeOwners: [] });
    observer.advance({ frameIndex: 2, timeSeconds: 10, flags: flags([3, 0, 0, 0]),
      operations: [{ type: 'directAdmission', identityId: 1, cells: [0] }], activeOwners: [{ identityId: 1, cells: [0] }] });
    observer.advance({ frameIndex: 3, timeSeconds: 11.5, flags: flags([0, 0, 0, 0]),
      operations: [{ type: 'directAdmission', identityId: 2, cells: [0] }], activeOwners: [{ identityId: 2, cells: [0] }] });
    const cell = observer.snapshot(1).cells[0];
    assert.equal(cell.episodeOwnedActiveSampleCount, 2);
    assert.equal(cell.episodeOwnedActiveSpells, 2);
    assert.equal(cell.episodeOwnedReactivationCount, 1);
    assert.deepEqual(cell.episodeOwnedActiveSpellObservedDurationsSeconds, [0, 0]);
    assert.equal(cell.episodeOwnedObservedActiveSpanSeconds, 10);
    assert.equal(cell.episodeOwnedLastActiveAgeSeconds, 1.5);
    assert.equal(cell.globalActiveSampleCount, 3);
    assert.equal(cell.globalActiveSpells, 2);
    assert.deepEqual(cell.activeSpellObservedDurationsSeconds, [0, 1.5]);
    assert.equal(cell.globalQFalseActiveObservations, 2);
  } finally { Math.random = priorRandom; }
});
