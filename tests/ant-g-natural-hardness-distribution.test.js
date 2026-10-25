import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTimeSvg, quantile, summarizeHardness, summarizeTimeBins } from '../scripts/ant-g-natural-hardness-distribution.js';

test('fixed hardness histogram keeps 1.0 in its final equal-width bin', () => {
  const result = summarizeHardness([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  assert.deepEqual(result.histogram, [1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
  assert.equal(result.quantiles.p50, 0.5);
  assert.equal(result.standardDeviation, Math.sqrt(0.1));
});

test('empty populations return explicit null statistics', () => {
  const result = summarizeHardness([]);
  assert.equal(result.count, 0);
  assert.equal(result.mean, null);
  assert.equal(result.quantiles.p99, null);
});

test('quantiles use linear Type 7 interpolation', () => {
  assert.equal(quantile([0, 1], 0.5), 0.5);
  assert.equal(quantile([0, 0.5, 1], 0.25), 0.25);
});

test('time bins include the 600 second endpoint in the final interval', () => {
  const bins = summarizeTimeBins([{ simulationTimeMs: 0, hardness: 0 },
    { simulationTimeMs: 60000, hardness: 0.5 }, { simulationTimeMs: 600000, hardness: 1 }]);
  assert.deepEqual(bins.map(row => row.count), [1, 1, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(bins.at(-1).quantiles.p50, 1);
});

test('hardness summary rejects non-finite and out-of-range values', () => {
  assert.throws(() => summarizeHardness([Number.NaN]), /outside \[0,1\]/);
  assert.throws(() => summarizeHardness([1.01]), /outside \[0,1\]/);
});

test('time plot renders both registered population series', () => {
  const bins = Array.from({ length: 10 }, (_, index) => ({ startSeconds: index * 60,
    endSeconds: (index + 1) * 60, count: 1, quantiles: { p05: 0.1, p50: 0.5, p95: 0.9 } }));
  const svg = makeTimeSvg({ allValidSurfaceFootResponses: bins, routedStrikes: bins });
  assert.match(svg, /All valid SurfaceField foot responses/);
  assert.match(svg, /Born Surface strikes posted to surface-plate-processor/);
});
