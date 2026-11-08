import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProbe } from '../src/sketchbook/response.js';

const graph = overrides => ({
  label: 'test', positions: [[0.25, 0.5], [0.75, 0.5]], masses: [1, 1], ground: [0.6, 0.6],
  damping: [0.5, 0.5], springs: [[0, 1, 1]], ...overrides
});

test('empty and zero-contact graphs are silent', () => {
  const empty = renderProbe({ positions: [], masses: [], ground: [], damping: [], springs: [] });
  assert.ok(empty.left.every(value => value === 0));
  assert.ok(empty.right.every(value => value === 0));
  const silent = renderProbe(graph({ contact: [0, 0] }));
  assert.ok(silent.left.every(value => value === 0));
  assert.ok(silent.right.every(value => value === 0));
});

test('frozen-state mass and stiffness alter response without mutating input', () => {
  const source = graph({ contact: [0.5, 1] });
  const before = structuredClone(source);
  const baseline = renderProbe(source);
  assert.notDeepEqual(baseline.left, renderProbe(graph({ masses: [2, 1], contact: [0.5, 1] })).left);
  assert.notDeepEqual(baseline.left, renderProbe(graph({ springs: [[0, 1, 20]], contact: [0.5, 1] })).left);
  assert.deepEqual(source, before);
  assert.deepEqual([...baseline.left], [...renderProbe(source).left]);
});

test('the 100x clock advances free motion for exactly 100x the recorded duration', () => {
  const free = renderProbe({ positions: [[0.25, 0.5]], masses: [1], ground: [0], damping: [0], springs: [] });
  const heavy = renderProbe({ positions: [[0.25, 0.5]], masses: [2], ground: [0], damping: [0], springs: [] });
  assert.ok(Math.abs(free.left.at(-1) - 1.2) < 1e-5, '0.01 impulse velocity × 120 virtual seconds = 1.2 displacement');
  assert.ok(Math.abs(heavy.left.at(-1) - 0.6) < 1e-5, 'doubling mass halves the fixed impulse response');
});

test('bounded high-stiffness graph stays finite', () => {
  const positions = Array.from({ length: 64 }, (_, i) => [(i % 8 + 0.5) / 8, (Math.floor(i / 8) + 0.5) / 8]);
  const springs = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const i = y * 8 + x;
    if (x < 7) springs.push([i, i + 1, 120]);
    if (y < 7) springs.push([i, i + 8, 120]);
  }
  const result = renderProbe({ positions, masses: Array(64).fill(1), ground: Array(64).fill(0.6), damping: Array(64).fill(0.5), springs }, { sampleRate: 1000 });
  assert.ok([...result.left, ...result.right].every(Number.isFinite));
  assert.ok(result.metrics.substepsPerSample > 1);
});
