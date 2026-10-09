import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMilestoneMap, buildTimeline } from '../scripts/ant-w1-supported-spell-shadow-plots.js';

test('milestone map preserves the fixed world extent and renders only observed cell rectangles', () => {
  const milestone = { nominalTargetSeconds: 120, actualTimeSeconds: 120.01, frameIndex: 120, id0Alive: true,
    id0HistoricalCellIndices: [0], currentActiveCellIndices: [1],
    currentEventGeometry: [{ cellIndices: [2, 3], overlapCellIndices: [3], size: 2 }],
    localMaterializedCellIndices: [2, 3], baselineFrozenCellIndices: [], candidateFrozenCellIndices: [5] };
  const svg = buildMilestoneMap(20261005, [milestone, milestone, milestone, milestone]);
  assert.match(svg, /viewBox="0 0 1290 1850"/);
  assert.match(svg, /width="2\.13" height="2\.13" fill="#78d69a"/);
  assert.match(svg, /width="2\.13" height="2\.13" fill="#f0a65b"/);
  assert.doesNotMatch(svg, /<path /, 'map geometry must not be joined or interpolated with lines');
});

test('full timeline ends at the exact final observation time', () => {
  const rows = [0, 599.25].map((timeSeconds, frameIndex) => ({ frameIndex, timeSeconds, id0Alive: true,
    id0CurrentActiveCells: 1, eventCount: frameIndex, eventCellCount: frameIndex,
    newEventCells: frameIndex, repeatedEventCells: 0, id0HistoricalCells: frameIndex,
    baselineFrozenCells: 0, candidateFrozenCells: 0 }));
  const svg = buildTimeline({ seeds: [20261005, 20261006, 20261007].map(seed => ({ seed, timeline: rows })) });
  assert.match(svg, />599\.25<\/text>/);
  assert.doesNotMatch(svg, />600<\/text>/);
});
