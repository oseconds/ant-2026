import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createW1CharacterContext, W1CharacterDataGapError,
  summarizeValues, pearsonCorrelation, spearmanCorrelation
} from '../scripts/ant-w1-character.js';

const frames = (...times) => times.map(timeSeconds => ({ timeSeconds }));
const episode = (closeTimeSeconds = 1, cellIndices = [0], firstAdmissionFrameByCell = cellIndices.map(() => 0)) => ({
  id: 1, status: 'frozen', closeTimeSeconds, cellIndices, firstAdmissionFrameByCell
});
const foot = (antId, timeSeconds, nematicX, nematicY, overrides = {}) => ({
  timeSeconds, antId, cellIndex: 0, nematicX, nematicY, directionAvailable: true,
  segmentStartSeconds: timeSeconds - 1 / 60, segmentEndSeconds: timeSeconds,
  travelDistance: 1, ...overrides
});
const context = (times, flagRows, feet = [], width = 1, height = 1) => createW1CharacterContext({
  frames: frames(...times), flags: Uint8Array.from(flagRows.flat()), feet, width, height
});

test('nematic order is one for reversed travel, zero for perpendicular travel, near zero when isotropic', () => {
  const opposite = context([0, 1], [[3], [3]], [foot('A', 0.5, 1, 0), foot('B', 0.5, 1, 0)]).measure(episode());
  assert.equal(opposite.character.directionalOrder, 1);
  const perpendicular = context([0, 1], [[3], [3]], [foot('A', 0.5, 1, 0), foot('B', 0.5, -1, 0)]).measure(episode());
  assert.equal(perpendicular.character.directionalOrder, 0);
  const isotropic = context([0, 1], [[3], [3]], [
    foot('A', 0.5, 1, 0), foot('B', 0.5, -0.5, Math.sqrt(3) / 2),
    foot('C', 0.5, -0.5, -Math.sqrt(3) / 2)
  ]).measure(episode());
  assert.ok(isotropic.character.directionalOrder < 1e-12);
});

test('consolidation averages each cell fraction, independent of cell area and interval length', () => {
  const result = context([0, 1, 2], [[3, 1], [3, 1], [3, 1]], [foot('A', 1, 1, 0)], 2).measure(episode(2, [0, 1], [0, 0]));
  assert.equal(result.character.consolidation, 0.5);
  assert.equal(result.evidence.nQualifiedSamples, 3);
  assert.equal(result.evidence.nObservations, 6);
  const intermittent = context([0, 1, 2], [[3], [1], [3]], [foot('A', 1, 1, 0)]).measure(episode(2));
  assert.equal(intermittent.character.consolidation, 2 / 3);
});

test('initial admission and closure observations count in consolidation', () => {
  const result = context([0, 1, 2], [[3], [1], [3]], [foot('A', 0.5, 1, 0)]).measure(episode(1));
  assert.equal(result.evidence.nObservations, 2);
  assert.equal(result.evidence.nQualifiedSamples, 1);
  assert.equal(result.character.consolidation, 0.5);
});

test('duplicate feet in one ant movement segment contribute once and retain source-time evidence', () => {
  const duplicate = foot('A', 1, 1, 0, { segmentStartSeconds: 0.99 });
  const result = context([0, 1], [[3], [3]], [duplicate, { ...duplicate }]).measure(episode(1, [0], [1]));
  assert.equal(result.evidence.uniqueDirectionalSegments, 1);
  assert.equal(result.evidence.uniqueAnts, 1);
  assert.equal(result.evidence.travelWeight, 1);
  assert.equal(result.evidence.segmentsStartingBeforeAdmission, 1);
});

test('future frames cannot change a closed episode character', () => {
  const feet = [foot('A', 0.25, 1, 0)];
  const before = context([0, 0.5], [[3], [1]], feet).measure(episode(0.5));
  const withFuture = context([0, 0.5, 1], [[3], [1], [3]], feet).measure(episode(0.5));
  assert.deepEqual(withFuture, before);
});

test('invalid cell indices and nonfinite inputs fail, and missing travel is a typed data gap', () => {
  assert.throws(() => context([0], [[3]], [foot('A', 0, 1, 0, { cellIndex: 1 })]), /invalid foot row/);
  assert.throws(() => context([0], [[3]], [foot('A', 0, NaN, 0)]), /invalid directed foot row/);
  assert.throws(() => context([0, 1], [[3], [3]]).measure(episode(1)), error =>
    error instanceof W1CharacterDataGapError && error.code === 'NO_VALID_DIRECTIONAL_TRAVEL');
  assert.throws(() => context([0], [[3]]).measure(episode(1, [1], [0])), /valid grid indices/);
});

test('summary and rank correlations report descriptive values without p-values', () => {
  assert.deepEqual(summarizeValues([0, 0.5, 1]), {
    count: 3, min: 0, max: 1, mean: 0.5, median: 0.5, q1: 0.25, q3: 0.75,
    histogram10: [1, 0, 0, 0, 0, 1, 0, 0, 0, 1]
  });
  assert.equal(pearsonCorrelation([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(spearmanCorrelation([1, 2, 2, 4], [10, 20, 20, 40]), 1);
});
