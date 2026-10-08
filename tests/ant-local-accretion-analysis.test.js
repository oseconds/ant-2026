import assert from 'node:assert/strict';
import test from 'node:test';
import { appendEpisode, recentTrafficMask, spatialMismatch, eventSummary } from '../scripts/ant-local-accretion-analysis.js';

test('episode novelty compares prior union and preserves first material time', () => {
  const union = new Uint8Array(4), first = new Float64Array(4).fill(-1);
  const one = appendEpisode({ timeSeconds: 1, cellIndices: [0, 1] }, union, first);
  const two = appendEpisode({ timeSeconds: 2, cellIndices: [1, 2] }, union, first);
  assert.equal(one.newCells, 2);
  assert.deepEqual({ newCells: two.newCells, overlap: two.overlapCells, fraction: two.priorOverlapFraction },
    { newCells: 1, overlap: 1, fraction: 0.5 });
  assert.deepEqual([...first], [1, 1, 2, -1]);
  assert.throws(() => appendEpisode({ timeSeconds: 3, cellIndices: [4] }, union, first));
  assert.throws(() => appendEpisode({ timeSeconds: 3, cellIndices: [3, 4] }, union, first));
  assert.throws(() => appendEpisode({ timeSeconds: 3, cellIndices: [3, 3] }, union, first));
  assert.deepEqual([...union], [1, 1, 1, 0]);
  assert.deepEqual([...first], [1, 1, 2, -1]);
});

test('traffic mask uses only recent past in-domain individual feet', () => {
  const contacts = [
    { simulationTimeMs: 1000, contacts: [{ position: { x: 0, y: 0 } }] },
    { simulationTimeMs: 22000, contacts: [{ position: { x: 1, y: 1 } }, { position: { x: 1.01, y: 0 } }] },
    { simulationTimeMs: 24000, contacts: [{ position: { x: 0.5, y: 0.5 } }] }
  ];
  assert.deepEqual([...recentTrafficMask(contacts, 23, 2, 2)], [0, 0, 0, 1]);
});

test('material-traffic mismatch and weighted overlap use stated denominators', () => {
  const mismatch = spatialMismatch([1, 1, 0, 0], [0, 1, 1, 1]);
  assert.equal(mismatch.jaccard, 1 / 4);
  assert.equal(mismatch.frozenOnlyFraction, 1 / 2);
  assert.equal(mismatch.trafficUnrepresentedFraction, 2 / 3);
  const summary = eventSummary([{ cells: 10, newCells: 10, priorOverlapFraction: 0 },
    { cells: 2, newCells: 0, priorOverlapFraction: 1 }]);
  assert.equal(summary.weightedOverlapFraction, 2 / 12);
  assert.equal(summary.medianPriorOverlapFraction, 0.5);
});
