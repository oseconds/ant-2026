import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL_COUNT } from '../scripts/ant-local-opportunity-core.js';
import { createSingletonLayerOverlay, resolveSingletonMaturations,
  SingletonFeedbackObserver } from '../scripts/ant-singleton-feedback-observer.js';

function mask(cells) {
  const value = new Uint8Array(CELL_COUNT);
  for (const cell of cells) value[cell] = 1;
  return value;
}

function fieldsForCells(cells, peaks) {
  const E = mask(cells), F = E.slice(), B = new Float32Array(CELL_COUNT), C = new Float32Array(CELL_COUNT);
  for (const [cell, value] of peaks) B[cell] = value;
  for (const [cell, value] of peaks) C[cell] = value;
  return { E, F, B, C };
}

function squareCells(cx = 48, cy = 48) {
  const cells = [];
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) cells.push(y * 96 + x);
  return cells;
}

test('fresh overlays are independent and start empty', () => {
  const first = createSingletonLayerOverlay(), second = createSingletonLayerOverlay();
  assert.equal(first.length, CELL_COUNT);
  assert.equal(first.reduce((sum, value) => sum + value, 0), 0);
  first[100] = 1;
  assert.equal(second[100], 0);
});

test('coeval exact-X B/C maturation increments one layer per cell', () => {
  const cells = squareCells(), overlay = createSingletonLayerOverlay();
  const events = ['B', 'C'].map(channel => ({ channel, eventId: channel + '-same', timeMs: 20_000, xCells: cells }));
  const options = [{ optionId: 'same-X', xCells: cells }];
  const decisions = resolveSingletonMaturations({ events, matureOptions: options, overlay, materialize: true });
  assert.equal(decisions.length, 1);
  assert.deepEqual(decisions[0].provenance, ['B', 'C']);
  assert.equal(decisions[0].overlayIncrement, 1);
  assert.equal(cells.reduce((sum, cell) => sum + overlay[cell], 0), cells.length);
});

test('a contested maturation receives no overlay and a singleton receives exactly one layer', () => {
  const left = squareCells(48, 48), right = squareCells(50, 48), overlay = createSingletonLayerOverlay();
  const contested = resolveSingletonMaturations({
    events: [{ channel: 'B', eventId: 'B-1', timeMs: 20_000, xCells: left }],
    matureOptions: [{ optionId: 'left', xCells: left }, { optionId: 'right', xCells: right }], overlay, materialize: true
  });
  assert.equal(contested[0].disposition, 'contested-no-commit');
  assert.equal(overlay.reduce((sum, value) => sum + value, 0), 0);
  const accepted = resolveSingletonMaturations({
    events: [{ channel: 'B', eventId: 'B-2', timeMs: 21_000, xCells: left }],
    matureOptions: [{ optionId: 'left', xCells: left }], overlay, materialize: true
  });
  assert.equal(accepted[0].disposition, 'singleton-overlay-layer');
  assert.ok(left.every(cell => overlay[cell] === 1));
});

test('live observer uses actual elapsed time, locked X stability, exact grouping and no RNG', () => {
  const cells = squareCells(), center = 48 * 96 + 48, input = fieldsForCells(cells, [[center, 1]]);
  const overlay = createSingletonLayerOverlay(), observer = new SingletonFeedbackObserver('20261005');
  const priorRandom = Math.random;
  Math.random = () => { throw new Error('observer must not consume RNG'); };
  try {
    let result;
    for (let anchorIndex = 0; anchorIndex <= 20; anchorIndex++) {
      result = observer.observe({ anchorIndex, timeMs: anchorIndex * 1000,
        ...input, overlay, materialize: true });
    }
    assert.deepEqual(result.newMaturations, { B: 1, C: 1 });
    assert.equal(result.uniqueMatureXOptions, 1);
    assert.equal(result.provenanceCounts['{B,C}'], 1);
    assert.equal(result.decisions.length, 1);
    assert.equal(result.decisions[0].overlayIncrement, 1);
    assert.equal(cells.reduce((sum, cell) => sum + overlay[cell], 0), cells.length);
    assert.equal(observer.channels.B.previousRows[0].track.maturationEvent.stableElapsedMs, 20_000);
  } finally {
    Math.random = priorRandom;
  }
});
