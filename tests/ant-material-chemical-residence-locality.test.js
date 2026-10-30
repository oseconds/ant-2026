import test from 'node:test';
import assert from 'node:assert/strict';
import { hillResponse, solveMassMatchedNull } from '../scripts/ant-material-chemical-residence-locality.js';

test('mass-matched null preserves shape when scalar matching needs no cap', () => {
  const result = solveMassMatchedNull(Float32Array.from([0, 0.25, 1]), 2.5);
  assert.equal(result.feasible, true);
  assert.equal(result.k, 2);
  assert.deepEqual(Array.from(result.values), [0, 0.5, 2]);
  assert.ok(result.relativeResidual < 1e-7);
});

test('mass-matched null reports cap use and impossible support capacity', () => {
  const result = solveMassMatchedNull(Float32Array.from([10, 1]), 10, 8);
  assert.equal(result.feasible, true);
  assert.equal(result.cappedNodes, 1);
  assert.deepEqual(Array.from(result.values), [8, 2]);
  assert.equal(result.outputSum, 10);
  assert.equal(solveMassMatchedNull(Float32Array.from([1, 1]), 16.01, 8).feasible, false);
});

test('wide sensor response uses the production Hill curve', () => {
  assert.equal(hillResponse(0, 0.035), 0);
  assert.equal(hillResponse(0.035, 0.035), 0.5);
});
