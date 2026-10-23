import test from 'node:test';
import assert from 'node:assert/strict';
import { runSpatialCase } from '../scripts/ant-spatial-run.js';

test('spatial runner captures fixed checkpoints and completed gait endpoints without changing RNG use', async () => {
  const result = await runSpatialCase({ seed: 12345, seconds: 2 });
  assert.ok(Math.abs(result.modelSeconds - 2) < 1e-9);
  assert.deepEqual(result.checkpoints, []);
  assert.equal(result.frames.length, 2);
  assert.ok(result.frames.every(frame => frame.ants.count > 0 && Number.isFinite(frame.ants.meanSpeed)));
  assert.ok(result.frames.every(frame => frame.ants.angularOccupancy.sectors
    .reduce((sum, value) => sum + value, 0) === 1));
  assert.ok(result.frames.every(frame => Number.isFinite(frame.pheromone.mass)
    && Number.isFinite(frame.material.unionAreaFraction)));
  assert.ok(Number.isInteger(result.rngCalls) && result.rngCalls > 0);
  assert.deepEqual(Object.keys(result.curvature), ['1s', '2s', '5s']);
});

test('spatial runner refuses fractional simulation duration', async () => {
  await assert.rejects(runSpatialCase({ seconds: 0.5 }), /positive integer/);
});
