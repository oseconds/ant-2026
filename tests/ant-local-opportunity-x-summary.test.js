import test from 'node:test';
import assert from 'node:assert/strict';
import { addAnchor } from '../scripts/ant-local-opportunity-x-summary.js';

test('g15 X observations deduplicate per boundary/channel and keep the lowest-index nucleus metrics', () => {
  const channels = Object.fromEntries(['D', 'B', 'C', 'feet1', 'feet5', 'feet20', 'travel1', 'travel5', 'travel20',
    'deltaD1', 'deltaD5', 'deltaD20', 'deltaB1', 'deltaB5', 'deltaB20', 'deltaC1', 'deltaC5', 'deltaC20']
    .map(name => [name, { g15: name === 'D' ? [
      { index: 8, captureId: 'X1' }, { index: 4, captureId: 'X1' }
    ] : null }]));
  const center = (index, angularSpan, maxRadius, entryDistance) => ({
    channel: 'D', representation: 'g15', index, angularSpan, maxRadius, entryDistance
  });
  const capture = { id: 'X1', nodeCount: 4, centroid: { x: .5, y: .72 },
    extent: { width: .2, height: .1, major: .24, minor: .08 }, edgeCount: 3, endpoints: 2,
    junctions: 0, cycleRank: 0, material: { overlapFraction: .25, meanLayers: .5, maxLayers: 2,
      layerHistogram: { 0: 3, 2: 1 } }, centers: [center(8, 3, .14, .09), center(4, 1.5, .04, .03)] };
  const accumulators = Object.fromEntries(Object.keys(channels).map(name => [name, {
    boundaryCount: 0, observedBoundaryCount: 0, centerObservationCount: 0, uniqueCaptureObservationCount: 0,
    materialLayerCellObservations: {}, metrics: { nodeCount: [], centroidDistanceToEntry: [], chosenCenterEntryDistance: [],
      angularSpan: [], maxRadius: [], width: [], height: [], major: [], minor: [], edgeCount: [], endpoints: [],
      junctions: [], cycleRank: [], overlapFraction: [], meanLayers: [], maxLayers: [] }
  }]));

  addAnchor({ index: 0, channels, captures: [capture] }, accumulators);
  const d = accumulators.D;
  assert.equal(d.centerObservationCount, 2);
  assert.equal(d.uniqueCaptureObservationCount, 1);
  assert.deepEqual(d.materialLayerCellObservations, { 0: 3, 2: 1 });
  assert.deepEqual(d.metrics.angularSpan, [1.5]);
  assert.deepEqual(d.metrics.maxRadius, [.04]);
  assert.deepEqual(d.metrics.chosenCenterEntryDistance, [.03]);
});
