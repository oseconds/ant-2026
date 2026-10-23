import assert from 'node:assert/strict';
import test from 'node:test';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import {
  aggregateLocalSamples,
  aggregateWideSamples,
  brushMetrics,
  fieldPhases,
  hillResponse,
  inspectBrushGeometry
} from '../scripts/ant-field-write-read-isolation.js';
import { decomposeFieldRead, weightedWideSignal } from '../scripts/ant-field-read-sensor-analysis.js';

test('the preregistered offsets are half-cell phases on the requested dimensions', () => {
  assert.deepEqual(fieldPhases(96, 96), [
    { id: 'p00', dx: 0, dy: 0 },
    { id: 'p10', dx: 0.5 / 95, dy: 0 },
    { id: 'p01', dx: 0, dy: 0.5 / 95 },
    { id: 'p11', dx: 0.5 / 95, dy: 0.5 / 95 }
  ]);
});

test('current local aggregate averages production samples and reports no direction on a flat field', () => {
  const result = aggregateLocalSamples(Array(18).fill(1));
  assert.deepEqual(result, {
    left: 1,
    center: 1,
    right: 1,
    strength: hillResponse(1, 0.018),
    coherence: 0,
    steering: 0
  });
  assert.equal(aggregateLocalSamples(Array(18).fill(0)).steering, 0);
  assert.throws(() => aggregateLocalSamples(Array(17).fill(1)), /18 finite samples/);
});

test('current wide aggregate keeps the maximum weighted transverse reading', () => {
  assert.equal(aggregateWideSamples([1, 1, 1, 1, 1]), 1);
  assert.equal(aggregateWideSamples([0, 0, 1, 0, 0]), 1);
  assert.throws(() => aggregateWideSamples([1, 2, 3, 4]), /five finite transverse samples/);
});

test('read and stored-raster contributions reconstruct the translated field read', () => {
  assert.deepEqual(decomposeFieldRead(0.25, 0.75, 1.25), {
    reader: 0.5,
    raster: 0.5,
    total: 1,
    residual: 0
  });
  assert.throws(() => decomposeFieldRead(0, Infinity, 1), /three finite values/);
});

test('recorded wide sensor preserves production weights and max aggregation', () => {
  assert.equal(weightedWideSignal([
    { value: 0.5, offset: -1 },
    { value: 0.1, offset: 0 },
    { value: 0.3, offset: 0.5 }
  ]), Math.max(0.5 * 0.55, 0.1, 0.3 * 0.775));
  assert.equal(weightedWideSignal([]), 0);
  assert.throws(() => weightedWideSignal([{ value: 1, offset: 0.25 }]), /production transverse offsets/);
});

test('default support contains at most one node and nearest fallback writes that same node', () => {
  const field = new PheromoneField();
  const pitch = 1 / 95;
  const supported = inspectBrushGeometry(field, 47 / 95, 47 / 95, 0.01, 0.0045, 0.00225, 0.0045);
  const fallback = inspectBrushGeometry(field, 47.5 / 95, 47.5 / 95, 0.01, 0.0045, 0.00225, 0.0045);
  assert.ok(2 * 0.0045 < pitch);
  assert.equal(supported.supportNodes, 1);
  assert.equal(supported.fallback, false);
  assert.equal(fallback.supportNodes, 0);
  assert.equal(fallback.fallback, true);
  assert.equal(supported.proposals.length, 1);
  assert.equal(fallback.proposals.length, 1);
  assert.equal(supported.proposals[0].index, 47 * 96 + 47);
  assert.equal(fallback.proposals[0].index, 48 * 96 + 48);
});

test('single-node footprint moments remain exactly zero despite weighted-centroid roundoff', () => {
  const metrics = brushMetrics({ x: 0.3141592653589793, y: 0.2718281828459045, amount: 0.1,
    geometry: { supportNodes: 0, fallback: true, nearestDistance: 0.01 },
    cells: [{ index: 1, proposed: 0.1, storedDelta: 0.1, capInteracted: false, capLoss: 0, x: 0.123456789, y: 0.876543219 }] });
  assert.deepEqual(metrics.centroid, { x: 0.123456789, y: 0.876543219 });
  assert.deepEqual(metrics.secondMoment, { xx: 0, yy: 0, xy: 0, anisotropy: 0 });
});
