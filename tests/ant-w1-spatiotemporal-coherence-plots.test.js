import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMilestoneMapForTest } from '../scripts/ant-w1-spatiotemporal-coherence-plots.js';

test('milestone maps render only archived cells on the same 96×96 scale', () => {
  const milestones = [120, 300, 480, 599.25].map((nominalTargetSeconds, index) => ({
    nominalTargetSeconds, cutoffFrameIndex: index, cutoffTimeSeconds: nominalTargetSeconds,
    id0Alive: true, id0HistoricalCellIndices: [0, 1], currentSupportedCellIndices: [1, 2],
    currentEventGeometry: [{ eventId: index, frameIndex: index, timeSeconds: nominalTargetSeconds, size: 1,
      cellIndices: [2], newCellIndices: [2], overlapCellIndices: [] }],
    cumulativeLocalCellIndices: [2, 3], summary: { groupCount: 2, singleCellGroupCount: 1,
      largestComponent: { uniqueCellCount: 2, spellCount: 2, terminationTimeCount: 2 } }
  }));
  const groups = milestones.flatMap((milestone, index) => [
    { seed: 20261005, cutoffFrameIndex: index, groupId: 0, uniqueCellCount: 2, spellCount: 2,
      firstTerminationFrameIndex: index, cellIndices: [2, 3] },
    { seed: 20261005, cutoffFrameIndex: index, groupId: 1, uniqueCellCount: 1, spellCount: 1,
      firstTerminationFrameIndex: index, cellIndices: [4] }
  ]);
  const first = buildMilestoneMapForTest(20261005, milestones, groups);
  const second = buildMilestoneMapForTest(20261005, milestones, groups);
  assert.equal(first, second, 'plot source is byte deterministic');
  assert.match(first, /96×96/);
  assert.match(first, /Spatiotemporal groups by component area/);
  assert.equal(first.includes('<path '), false, 'map creates no connecting path or interpolated geometry');
  assert.equal((first.match(/<rect /g) ?? []).length > 40, true, 'geometry uses individual cell rectangles');
});
