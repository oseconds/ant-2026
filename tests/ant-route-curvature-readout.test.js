import test from 'node:test';
import assert from 'node:assert/strict';
import { resamplePath, analyzeFlow, immediateDiagnostics } from '../scripts/ant-route-curvature-readout.js';

test('flow readout requires repeated ants and keeps straight travel at zero turn', () => {
  const path = Array.from({ length: 101 }, (_, tick) => ({ x: tick / 100, y: 0.5, tick }));
  assert.equal(resamplePath(path, 0.1).length, 11);
  const tracks = new Map(['a', 'b', 'c'].map(id => [id, path]));
  const result = analyzeFlow(tracks, { startTick: 0, endTick: 100 });
  assert.ok(result.directedCoherentReusedCells > 0);
  assert.equal(result.coherentAbsoluteTurn.p50, 0);
  assert.equal(analyzeFlow(new Map([['a', path]]), { startTick: 0, endTick: 100 }).reusedCells, 0);
});

test('single-step reversal readout never bridges a missing tick', () => {
  const row = (tick, angularVelocity) => ({ id: 'a', tick, angularVelocity, trailAdherence: 0.9, collisionScale: 1 });
  const result = immediateDiagnostics([row(1, 4.5), row(2, -4.5), row(4, 4.5)]).at(-1);
  assert.equal(result.nonzeroPairs, 1);
  assert.equal(result.reversalFraction, 1);
});
