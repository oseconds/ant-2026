import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRouteCurvature } from '../scripts/ant-route-curvature-metrics.js';

test('route curvature separates straight, turning, and low-displacement windows', () => {
  const samples = [];
  for (let tick = 0; tick <= 4; tick += 1) {
    samples.push({ id: 'straight', tick, x: tick * 0.01, y: 0, heading: 0 });
    const angle = tick * Math.PI / 2;
    samples.push({ id: 'circle', tick, x: Math.cos(angle), y: Math.sin(angle), heading: angle });
    samples.push({ id: 'still', tick, x: 0, y: 0, heading: 0 });
  }
  const result = analyzeRouteCurvature(samples, { hz: 1, windowSeconds: [2], minimumPathLength: 1e-4 })['2s'];
  assert.equal(result.windowCount, 6);
  assert.equal(result.validWindowCount, 4);
  assert.equal(result.lowDisplacementWindowCount, 2);
  assert.ok(result.meanChordToPath > 0.8 && result.meanChordToPath < 0.9);
  assert.ok(result.meanAbsoluteTravelTurnRadians > 0.5);
});
test('rejects malformed samples and uses integer tick windows', () => {
  assert.throws(() => analyzeRouteCurvature([{ id: 'a', tick: 0, x: NaN, y: 0 }]), /finite x\/y/);
  const result = analyzeRouteCurvature([
    { id: 'a', tick: 0, x: 0, y: 0 }, { id: 'a', tick: 1, x: 1, y: 0 },
    { id: 'a', tick: 3, x: 2, y: 0 }
  ], { hz: 1, windowSeconds: [2] })['2s'];
  assert.equal(result.windowCount, 0);
});
