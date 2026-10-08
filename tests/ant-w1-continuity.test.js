import assert from 'node:assert/strict';
import test from 'node:test';
import { replayContinuity, canonicalComponentEpisodeIds, summarizeComponentLinkage, summarizeDiagnostics,
  _w1ContinuityTest } from '../scripts/ant-w1-continuity.js';

test('W1 continuity observer preserves source geometry through a merge then split', () => {
  const width = 5, height = 1, frames = [], flags = new Uint8Array(480 * width);
  for (let frame = 0; frame < 480; frame += 1) {
    frames.push({ timeSeconds: frame });
    const q = frame < 30 ? [0, 4]
      : frame < 60 ? [0, 1, 2, 3, 4]
        : frame < 430 ? [0, 1, 3, 4] : frame < 450 ? [0, 4] : [0, 1, 2, 3, 4];
    for (const cell of q) flags[frame * width + cell] = 7;
  }
  const result = replayContinuity({ frames, flags, width, height });
  assert.ok(result.events.some(event => event.type === 'merge_absorption'));
  assert.ok(result.events.some(event => event.type === 'split'));
  assert.ok(result.frames.some(frame => frame.maxDisconnectedComponentsOnOneCanonicalLineage > 1));
  assert.ok(result.frameDetails.every(frame => frame.activeCellCount === frame.components.reduce((sum, component) => sum + component.instantaneousArea, 0)));
  assert.ok(result.frameDetails.every(frame => frame.components.every(component => Number.isSafeInteger(component.episodeId))));
});

test('W1 component labels resolve aliases created by a later merge in the same frame', () => {
  const episodeOne = { id: 1, redirect: { id: 0, redirect: null } };
  assert.deepEqual(canonicalComponentEpisodeIds([{ episode: episodeOne }]), [0]);
});

test('W1 merge counter distinguishes split siblings from distinct parent episodes', () => {
  assert.deepEqual(summarizeComponentLinkage([3, 4], [{ id: 7 }, { id: 7 }]), {
    previousComponentCount: 2, distinctCanonicalParentEpisodeIds: [7], distinctCanonicalParentCount: 1
  });
  assert.deepEqual(summarizeComponentLinkage([3, 4], [{ id: 2 }, { id: 7 }]), {
    previousComponentCount: 2, distinctCanonicalParentEpisodeIds: [2, 7], distinctCanonicalParentCount: 2
  });
});

test('W1 summary separates raw cohort admissions from canonical first admissions and event classes', () => {
  const replay = {
    retrospectiveFinalDominant: { id: 0, cumulativeArea: 3, ancestryIds: [0, 1], birthTimeSeconds: 1,
      lastActiveTimeSeconds: 3, activeFrameCount: 3 },
    finalOpen: [{ id: 0, ancestryIds: [0, 1], mergeCount: 2, cellIndices: [4, 8, 9],
      firstAdmissionTimeSecondsByCell: [1, 3, 3] }],
    admissions: [
      { episodeId: 0, cellIndex: 4, timeSeconds: 1, lastActualPointContactAgeSeconds: 25, qAtAdmission: 1 },
      { episodeId: 1, cellIndex: 4, timeSeconds: 2, lastActualPointContactAgeSeconds: 5, qAtAdmission: 0 },
      { episodeId: 1, cellIndex: 8, timeSeconds: 3, lastActualPointContactAgeSeconds: null, qAtAdmission: 0 },
      { episodeId: 1, cellIndex: 9, timeSeconds: 3, lastActualPointContactAgeSeconds: null, qAtAdmission: 0 }
    ],
    checkpoints: [{ requestedSeconds: 120, sampledSeconds: 1, frameIndex: 0 }],
    frames: [{ activeCellCount: 2, activeQFalseCellCount: 1 }, { activeCellCount: 2, activeQFalseCellCount: 2 }],
    frameDetails: [
      { frameIndex: 0, timeSeconds: 1, components: [{ componentId: 0, episodeId: 0, cellIndices: [4], instantaneousArea: 1 }],
        openLineages: [{ id: 0, ancestryIds: [0], cellIndices: [4] }], qFalseActiveFilterWitnesses: [],
        thenCurrentCanonicalDominantId: 0, thenCurrentCanonicalDominantCumulativeArea: 1,
        retrospectiveFinalCohortActiveCellCount: 1, retrospectiveFinalCohortContinuousAnchorCellCount: 1,
        retrospectiveFinalCohortContinuousAnchorCells: [4], overlapEdges: [] },
      { frameIndex: 1, timeSeconds: 2, components: [
          { componentId: 0, episodeId: 0, cellIndices: [8], instantaneousArea: 1 },
          { componentId: 1, episodeId: 0, cellIndices: [9], instantaneousArea: 1 }
        ], openLineages: [{ id: 0, ancestryIds: [0, 1], cellIndices: [4, 8, 9] }],
        qFalseActiveFilterWitnesses: [{ cellIndex: 8 }, { cellIndex: 9 }],
        thenCurrentCanonicalDominantId: 0, thenCurrentCanonicalDominantCumulativeArea: 2,
        retrospectiveFinalCohortActiveCellCount: 2, retrospectiveFinalCohortContinuousAnchorCellCount: 0,
        retrospectiveFinalCohortContinuousAnchorCells: [], overlapEdges: [
          { previousComponentId: 0, previousCanonicalEpisodeId: 0, currentCanonicalEpisodeId: 0, overlapCellCount: 1 }
        ] }
    ],
    events: [
      { type: 'merge', episodeId: 0, previousComponentCount: 2, distinctCanonicalParentCount: 1 },
      { type: 'merge', episodeId: 0, previousComponentCount: 2, distinctCanonicalParentCount: 2 },
      { type: 'merge_absorption', episodeId: 0, absorbedEpisodeId: 1 },
      { type: 'split', episodeId: 0, frameIndex: 1, timeSeconds: 2, previousComponentId: 0, descendantComponentIds: [0, 1] },
      { type: 'cell-active-spell-end', cellIndex: 4, observedDurationSeconds: 1 },
      { type: 'cell-active-spell-right-censored', cellIndex: 8, observedDurationSeconds: 2 }
    ]
  };
  const summary = summarizeDiagnostics(replay);
  assert.equal(summary.canonicalFirstAdmissions.rawCohortAdmissionEventCount, 4);
  assert.equal(summary.canonicalFirstAdmissions.distinctCohortAdmissionCellCount, 3);
  assert.equal(summary.canonicalFirstAdmissions.duplicateCohortAdmissionEventCount, 1);
  assert.equal(summary.canonicalFirstAdmissions.canonicalFirstAdmissionCount, 3);
  assert.equal(summary.canonicalFirstAdmissions.qFalseAtAdmissionCount, 2);
  assert.equal(summary.canonicalFirstAdmissions.noPriorSameCellContactCount, 2);
  assert.equal(summary.canonicalFirstAdmissions.fractionOlderThan20Seconds, 1);
  assert.equal(summary.canonicalFirstAdmissions.canonicalFirstAdmissionTable.length, 3);
  assert.equal(summary.canonicalFirstAdmissions.fractionOlderThan90Seconds, 0);
  assert.equal(summary.continuity.cohortMergeLabelEventCount, 2);
  assert.equal(summary.continuity.sameParentSiblingRejoinCount, 1);
  assert.equal(summary.continuity.distinctParentMergeEventCount, 1);
  assert.equal(summary.continuity.distinctParentAbsorptionEventCount, 1);
  assert.equal(summary.continuity.earliestAnchorIntersectionZero.timeSeconds, 2);
  assert.deepEqual(summary.continuity.splitSharingWitness.descendants.map(row => row.cellIndices), [[8], [9]]);
  assert.equal(summary.activeSpells.allCells.completedObservedSeconds.max, 1);
  assert.equal(summary.activeSpells.allCells.rightCensoredObservedSeconds.max, 2);
});

test('W1 persisted frame compaction drops repeated lineage geometry without mutating replay state', () => {
  const full = { frameIndex: 0, openLineages: [{ id: 1, cellIndices: [2], ancestryIds: [1], parentIds: [],
    firstAdmissionTimeSecondsByCell: [1], firstAdmissionFrameByCell: [0],
    birthTimeSeconds: 1, birthFrameIndex: 0, lastActiveTimeSeconds: 1, lastActiveFrameIndex: 0,
    status: 'right-censored', mergeCount: 0, splitCount: 0, activeFrameCount: 1 }], components: [{ componentId: 0, cellIndices: [2], overlapEdges: [],
    cellFlags: [7], qCellIndices: [2], newCells: [2], survivingCells: [] }], qFalseActiveFilterWitnesses: [],
    closedEpisodes: [], discardedEpisodes: [] };
  const compact = _w1ContinuityTest.compactFrameDetail(full);
  assert.deepEqual(full.openLineages[0].cellIndices, [2]);
  assert.deepEqual(compact.openLineages[0], { id: 1,
    birthTimeSeconds: 1, birthFrameIndex: 0, lastActiveTimeSeconds: 1, lastActiveFrameIndex: 0,
    status: 'right-censored', mergeCount: 0, splitCount: 0, activeFrameCount: 1,
    cumulativeArea: 1, ancestryCount: 1 });
  assert.deepEqual(compact.components[0], { componentId: 0, cellIndices: [2] });
  assert.equal(compact.qFalseActiveFilterWitnessCount, 0);
});

test('W1 admission contact lookback is same-cell and never reads a future event', () => {
  const frames = Array.from({ length: 6 }, (_, timeSeconds) => ({ timeSeconds }));
  const flags = new Uint8Array(frames.length * 4);
  for (let frame = 0; frame < frames.length; frame += 1) { flags[frame * 4] = 7; flags[frame * 4 + 2] = 7; }
  const feet = [{ timeSeconds: 0, antId: 'past', contactIndex: 0, cellIndex: 0 },
    { timeSeconds: 5, antId: 'future', contactIndex: 1, cellIndex: 2 }];
  const result = replayContinuity({ frames, flags, feet, width: 2, height: 2 });
  const cellZero = result.admissions.find(row => row.cellIndex === 0);
  assert.ok(cellZero);
  assert.equal(cellZero.lastActualPointContactAgeSeconds, cellZero.timeSeconds);
  const cellTwo = result.admissions.find(row => row.cellIndex === 2);
  assert.ok(cellTwo);
  assert.equal(cellTwo.lastActualPointContactSeconds, null);
  assert.equal(cellTwo.lastActualPointContactAgeSeconds, null);
  assert.equal(cellTwo.priorSameCellPointContactCount, 0);
});

test('W1 active-cell q=false rows expose EMA carry-over without changing activation', () => {
  const frames = Array.from({ length: 400 }, (_, timeSeconds) => ({ timeSeconds }));
  const flags = new Uint8Array(frames.length);
  for (let frame = 0; frame < 30; frame += 1) flags[frame] = 7;
  const result = replayContinuity({ frames, flags, width: 1, height: 1 });
  assert.ok(result.frames.some(frame => frame.activeQFalseCellCount > 0));
  assert.ok(result.frames.some(frame => frame.qCellCount === 0));
});

test('W1 input validation rejects invalid time, flags, and out-of-grid contacts', () => {
  assert.throws(() => replayContinuity({ frames: [{ timeSeconds: 0 }, { timeSeconds: 2 }], flags: new Uint8Array(2), width: 1, height: 1 }), /valid source interval/);
  assert.throws(() => replayContinuity({ frames: [{ timeSeconds: 0 }], flags: Uint8Array.of(8), width: 1, height: 1 }), /valid flags/);
  assert.throws(() => replayContinuity({ frames: [{ timeSeconds: 0 }], flags: new Uint8Array(1), width: 1, height: 1,
    feet: [{ timeSeconds: 0, antId: 'A', contactIndex: 0, cellIndex: 1 }] }), /inside dimensions/);
});

test('W1 observer replay is deterministic and consumes no random values', () => {
  const frames = Array.from({ length: 8 }, (_, timeSeconds) => ({ timeSeconds }));
  const flags = new Uint8Array(8);
  flags.fill(7, 1, 6);
  const random = Math.random;
  Math.random = () => { throw new Error('unexpected RNG'); };
  try {
    assert.deepEqual(replayContinuity({ frames, flags, width: 1, height: 1 }), replayContinuity({ frames, flags, width: 1, height: 1 }));
  } finally { Math.random = random; }
});
