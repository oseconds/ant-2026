import test from 'node:test';
import assert from 'node:assert/strict';
import { maskFromCells, components, distances, sleeve, pockets, materialFor, sweptSections } from '../scripts/ant-body-generation-exploration.js';

test('source-bounded sleeve changes contour monotonically without RNG or modifying input', () => {
  const cells = [48 * 96 + 48], d = distances(cells), zero = Array(9216).fill(0), one = Array(9216).fill(1);
  const before = d.slice(), random = Math.random;
  try { Math.random = () => { throw Error('RNG'); };
    const a = sleeve(d, zero), b = sleeve(d, one);
    assert.ok(b.some((v, i) => v && !a[i])); assert.ok(a.every((v, i) => !v || b[i]));
    assert.ok(b.every((v, i) => !v || d[i] <= .030));
    assert.deepEqual(d, before); assert.equal(components(b).length, 1);
  } finally { Math.random = random; }
  assert.throws(() => sleeve(d, Array(9216).fill(NaN)));
});

test('pocket generation preserves all bounded regions rather than choosing a largest island', () => {
  const cells = [];
  for (const left of [20, 40]) for (let y = 20; y <= 24; y++) for (let x = left; x <= left + 4; x++)
    if (x === left || x === left + 4 || y === 20 || y === 24) cells.push(y * 96 + x);
  const p = pockets(cells, false);
  assert.deepEqual(p.sizes, [9, 9]); assert.equal(p.mask.reduce((s, x) => s + x, 0), 18);
  assert.deepEqual(pockets(cells, true).sizes, [9, 9]);
});

test('character-only mapping reuses whole-Plate coefficient limits and changes no mask', () => {
  const m = maskFromCells([100, 101]), before = m.slice();
  assert.deepEqual(materialFor(m, Array(9216).fill(.5), Array(9216).fill(.04)),
    { stiffness: .9, density: 1.1, damping: .35 });
  assert.deepEqual(m, before);
});

test('constructive sections keep variable history on the scaffold without island cleanup', () => {
  const sc = Array.from({ length: 12 }, (_, x) => (40 + x) * 96 + 40 + x);
  const field = Array(9216).fill(0); sc.forEach((i, n) => { field[i] = n / (sc.length - 1); });
  const mask = sweptSections(sc, field);
  assert.ok(sc.every(i => mask[i])); assert.equal(components(mask).length, 1);
  const changed = field.slice(); changed[20] = 1;
  assert.deepEqual(sweptSections(sc, changed), mask, 'off-scaffold value does not silently attach a new disc');
});
