import test from 'node:test';
import assert from 'node:assert/strict';
import { _coherenceAuditTest as audit } from '../scripts/ant-w1-spatiotemporal-coherence-audit.js';

test('8-neighbor grid edges stay within rows and world boundaries', () => {
  assert.deepEqual(audit.neighbors8(0), [1, 96, 97]);
  assert.deepEqual(audit.neighbors8(95), [94, 190, 191]);
  assert.deepEqual(audit.neighbors8(9215), [9118, 9119, 9214]);
  assert.equal(audit.neighbors8(95).includes(96), false, 'adjacent flat indices across row boundary are not neighbors');
  assert.equal(audit.neighbors8(0).includes(9215), false, 'grid does not wrap');
});

test('edge requires distinct neighboring cells and one exact shared supported frame', () => {
  const a = { cellIndex: 10, startFrameIndex: 2, lastSupportedFrameIndex: 8, terminationFrameIndex: 9 };
  const b = { cellIndex: 11, startFrameIndex: 8, lastSupportedFrameIndex: 12, terminationFrameIndex: 13 };
  assert.deepEqual(audit.observedConcurrentOverlap(a, b), { firstFrameIndex: 8, lastFrameIndex: 8, observationCount: 1 });
  assert.equal(audit.observedConcurrentOverlap(a, { ...b, startFrameIndex: 9 }), null, 'different passage times do not connect');
  assert.equal(audit.observedConcurrentOverlap(a, { ...b, cellIndex: 10 }), null, 'same-cell reactivation is never an edge');
  assert.equal(audit.observedConcurrentOverlap({ ...a, cellIndex: 95 }, { ...b, cellIndex: 96 }), null,
    'row-boundary flat-index adjacency is rejected');
});

test('prefix membership waits for the observed spell termination and edge availability frame', () => {
  const spell = { eligible: true, terminationFrameIndex: 12 };
  assert.equal(audit.eligibleTerminatedBy(spell, 11), false);
  assert.equal(audit.eligibleTerminatedBy(spell, 12), true);
  assert.equal(audit.eligibleTerminatedBy({ ...spell, eligible: false }, 99), false);
  const edge = { availableAtFrameIndex: 14 };
  assert.equal(audit.edgeAvailableBy(edge, 13), false);
  assert.equal(audit.edgeAvailableBy(edge, 14), true);
});

test('spell span uses its observed start and last-supported frames before termination', () => {
  const frames = [{ timeSeconds: 0 }, { timeSeconds: 1.01 }, { timeSeconds: 2.02 }, { timeSeconds: 3.03 }];
  const spell = { startFrameIndex: 1, startTimeSeconds: 1.01, lastSupportedFrameIndex: 2,
    lastSupportedTimeSeconds: 2.02, terminationFrameIndex: 3, terminationTimeSeconds: 3.03,
    observedDurationSeconds: 1.01 };
  assert.equal(audit.observedSpellDuration(spell, frames), 1.01);
  assert.throws(() => audit.observedSpellDuration({ ...spell, observedDurationSeconds: 2.02 }, frames), /observed endpoints/);
  assert.throws(() => audit.observedSpellDuration({ ...spell, terminationFrameIndex: 2 }, frames), /terminationFrameIndex/);
});

test('archived CSV parsing preserves quoted commas, escaped quotes and exact cell arrays', () => {
  assert.deepEqual(audit.parseCsv('seed,cells,note\r\n1,"[3798,3893]","{ ""q-off"": 2 }"\r\n'), [
    { seed: '1', cells: '[3798,3893]', note: '{ "q-off": 2 }' }
  ]);
  assert.deepEqual(audit.normalizeStoredEvents([{ seed: '20261005', eventId: '2', frameIndex: '9', timeSeconds: '9.25',
    size: '2', cellIndices: '[1,2]' }]), [{ seed: 20261005, eventId: 2, frameIndex: 9, timeSeconds: 9.25,
    size: 2, cellIndices: [1, 2] }]);
});

test('same-frame event reconstruction is deterministic and keeps separate frames apart', () => {
  const events = [{ frameIndex: 1, cellIndices: [0] }, { frameIndex: 1, cellIndices: [97] },
    { frameIndex: 2, cellIndices: [95, 96] }];
  const expected = [{ frameIndex: 1, cellIndices: [0, 97] }, { frameIndex: 2, cellIndices: [95] },
    { frameIndex: 2, cellIndices: [96] }];
  assert.deepEqual(audit.connectedCellGroupsByFrame(events), expected);
  assert.deepEqual(audit.connectedCellGroupsByFrame(events), expected);
});

test('representative group selection uses deterministic size and time tie breaks', () => {
  const groups = [
    { groupId: 9, uniqueCellCount: 2, spellCount: 4, firstTerminationFrameIndex: 8 },
    { groupId: 4, uniqueCellCount: 2, spellCount: 2, firstTerminationFrameIndex: 9 },
    { groupId: 2, uniqueCellCount: 1, spellCount: 1, firstTerminationFrameIndex: 1 },
    { groupId: 6, uniqueCellCount: 5, spellCount: 6, firstTerminationFrameIndex: 30 },
    { groupId: 5, uniqueCellCount: 5, spellCount: 6, firstTerminationFrameIndex: 20 }
  ];
  const selection = audit.selectRepresentativeGroups(groups);
  assert.equal(selection.small.groupId, 4);
  assert.equal(selection.largest.groupId, 5);
});
