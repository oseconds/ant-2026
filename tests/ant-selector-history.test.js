import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { angularMetrics, connectedComponents, decodeXorSnapshots, float32FromBytes, gridDistances,
  makeCenterline, maskFromIndices, maskOverlap, orInto, pearsonCorrelation, rasterizeRibbon,
  summarizeValues, uint32FromBytes } from '../scripts/ant-selector-history-analysis.js';

test('XOR birth snapshots decode exact per-array bytes and reject truncation', () => {
  const first = Buffer.from([1, 2, 3, 4]), second = Buffer.from([1, 7, 3, 9]);
  const delta = Buffer.from(second.map((value, index) => value ^ first[index]));
  const compressed = gzipSync(Buffer.concat([first, delta]));
  const descriptors = [
    { tick: 1, timeSeconds: 1 / 60, arrays: { input: { offset: 0, bytes: 4 } } },
    { tick: 2, timeSeconds: 2 / 60, arrays: { input: { offset: 4, bytes: 4 } } }
  ];
  assert.deepEqual(decodeXorSnapshots(compressed, descriptors).map(row => row.arrays.input), [first, second]);
  assert.throws(() => decodeXorSnapshots(gzipSync(first), descriptors), /size mismatch/);
});

test('typed snapshot readers preserve little-endian values and enforce dimensions', () => {
  const floats = Buffer.alloc(8); floats.writeFloatLE(0.25); floats.writeFloatLE(1.5, 4);
  const integers = Buffer.alloc(8); integers.writeUInt32LE(4); integers.writeUInt32LE(900, 4);
  assert.deepEqual(Array.from(float32FromBytes(floats, 2)), [0.25, 1.5]);
  assert.deepEqual(Array.from(uint32FromBytes(integers, 2)), [4, 900]);
  assert.throws(() => float32FromBytes(floats, 1), /Expected/);
});

test('discarded remnants use deterministic eight-neighbor connected components', () => {
  const mask = maskFromIndices([0, 6, 12, 4], 25);
  assert.deepEqual(connectedComponents(mask, 5), [[0, 6, 12], [4]]);
});

test('geodesic distances use cardinal and diagonal grid costs', () => {
  const open = new Uint8Array(16).fill(1);
  assert.equal(gridDistances(4, open, [0])[5], Math.SQRT2);
  const constrained = new Uint8Array(16); constrained[0] = constrained[1] = constrained[2] = 1;
  assert.equal(gridDistances(4, constrained, [0])[2], 2);
});

test('production-width ribbon rasterization and overlap accounting conserve area', () => {
  const centerline = makeCenterline([12], new Float64Array(25).fill(0.5), [0.25, 0.5], 5);
  const footprint = rasterizeRibbon(centerline, 5), prior = new Uint8Array(25);
  prior[12] = prior[7] = 1;
  assert.equal(footprint.reduce((sum, value) => sum + value, 0), 5);
  const overlap = maskOverlap(footprint, prior);
  assert.deepEqual(overlap, { areaCells: 5, priorOverlapCells: 2, newAreaCells: 3,
    priorOverlapFraction: 0.4, newAreaFraction: 0.6 });
  assert.deepEqual(Array.from(orInto(new Uint8Array(25), footprint)), Array.from(footprint));
});

test('angular metrics and distribution summaries stay finite and descriptive', () => {
  const values = [0, 0.5, 1], result = angularMetrics([11, 12], 5, { x: 0.5, y: 0.5 });
  assert.ok(result.angularSpanRad >= 0 && result.angularSpanRad <= Math.PI * 2);
  assert.ok(Number.isFinite(result.meanRadius));
  assert.ok(Number.isFinite(result.radialAlignment));
  assert.deepEqual(summarizeValues(values), { count: 3, min: 0, p10: 0.1, median: 0.5, p90: 0.9, max: 1, mean: 0.5 });
  assert.equal(pearsonCorrelation([0, 1, 2], [0, 2, 4]), 1);
});
