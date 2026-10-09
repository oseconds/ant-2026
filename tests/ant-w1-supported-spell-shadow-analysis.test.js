import test from 'node:test';
import assert from 'node:assert/strict';
import { _supportedSpellAnalysisTest as analysis } from '../scripts/ant-w1-supported-spell-shadow-analysis.js';

test('actual point-contact age uses only the latest recorded contact at or before the observed endpoint', () => {
  const feet = [[], [{ timeSeconds: 1, antId: 2, contactIndex: 5 },
    { timeSeconds: 3.5, antId: 4, contactIndex: 8 }, { timeSeconds: 3.5000000005, antId: 4, contactIndex: 10 },
    { timeSeconds: 8, antId: 4, contactIndex: 9 }]];
  assert.deepEqual(analysis.latestContactAt(feet, 1, 3.5),
    { timeSeconds: 3.5, ageSeconds: 0, antId: 4, contactIndex: 8 });
  assert.equal(analysis.latestContactAt(feet, 1, 3.25).ageSeconds, 2.25);
  assert.equal(analysis.latestContactAt(feet, 0, 10), null);
});

test('EMA carry-over is counted only while q is false and active remains true', () => {
  const spell = { cellIndex: 3, terminationFrameIndex: 0, terminationTimeSeconds: 0, activeCarryoverAtTermination: true };
  const frames = [{ timeSeconds: 0, activeMask: Uint8Array.from([0, 0, 0, 1]) },
    { timeSeconds: 1.25, activeMask: Uint8Array.from([0, 0, 0, 1]) },
    { timeSeconds: 2.5, activeMask: Uint8Array.from([0, 0, 0, 0]) }];
  const flags = new Uint8Array(3 * 9216);
  assert.deepEqual(analysis.postTerminationCarryover(spell, frames, flags, frames.length), {
    qFalseActiveCarryoverFrames: 2, qFalseActiveCarryoverObservedSeconds: 1.25,
    qFalseActiveCarryoverRightCensored: false });
  const censored = analysis.postTerminationCarryover(spell, frames.slice(0, 2), flags, 2);
  assert.equal(censored.qFalseActiveCarryoverFrames, 2);
  assert.equal(censored.qFalseActiveCarryoverRightCensored, true);
});

test('existing episode summary keeps geometry and observed persistence separate', () => {
  assert.deepEqual(analysis.frozenEpisodeSummary([
    { cellIndices: [0], persistenceSeconds: 20 }, { cellIndices: [1, 2], persistenceSeconds: 31 }
  ]), { count: 2, oneCellCount: 1, oneCellFraction: .5, multiCellCount: 1,
    medianSize: 1.5, maximumSize: 2, medianPersistenceSeconds: 25.5, unionCellCount: 3 });
  assert.deepEqual(analysis.terminationSummary([
    { terminationReason: 'q-off' }, { terminationReason: 'both' }, { terminationReason: 'active-off' }
  ]), { 'q-off': 1, 'active-off': 1, both: 1 });
});
