import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadMultiplicitySelectors } from '../scripts/lib/antGeodesicMultiplicity.js';

const SIZE = 96, CELLS = SIZE * SIZE;
const sourceUrl = new URL('../src/lib/agents/ant/TrailPlateBirth.js', import.meta.url);

test('production selector remains identical on root, fork, and merge fixtures', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const selectors = await loadMultiplicitySelectors(source);
  for (const shape of ['root', 'fork', 'merge']) {
    const input = fixture(shape);
    const before = input.mask.slice();
    const production = selectors.production.selectCandidate(...input.args);
    const all = selectors.allShortest.selectCandidate(...input.args);
    assert.ok(production, shape);
    assert.ok(all, shape);
    assert.deepEqual(all.path, production.path, shape);
    assert.deepEqual(all.mask, production.mask, shape);
    for (const index of production.skeletonIndices) assert.ok(all.skeletonIndices.includes(index), shape);
    assert.deepEqual(input.mask, before, shape);
  }
});

test('reversed parent tie changes the chosen principal route on an equal fork', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const selectors = await loadMultiplicitySelectors(source);
  const input = fixture('equal-routes');
  const production = selectors.production.selectCandidate(...input.args);
  const reverse = selectors.reverseTie.selectCandidate(...input.args);
  assert.ok(production && reverse);
  assert.notDeepEqual(production.path, reverse.path);
});

test('all-shortest adds the omitted equal route without changing the principal path', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const selectors = await loadMultiplicitySelectors(source);
  const input = fixture('equal-routes');
  const production = selectors.production.selectCandidate(...input.args);
  const all = selectors.allShortest.selectCandidate(...input.args);
  assert.ok(production && all);
  assert.deepEqual(all.path, production.path);
  assert.ok(all.skeletonIndices.length > production.skeletonIndices.length);
  assert.ok(all.skeletonIndices.includes(40 * SIZE + 28));
  assert.ok(all.skeletonIndices.includes(40 * SIZE + 68));
  assert.notEqual(production.skeletonIndices.includes(40 * SIZE + 28),
    production.skeletonIndices.includes(40 * SIZE + 68));
});

test('all-shortest network excludes a longer reconnecting route, is deterministic, and consumes no RNG', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const original = source.slice();
  const selectors = await loadMultiplicitySelectors(source);
  const input = fixture('equal-fork-spur');
  const rng = Math.random;
  Math.random = () => { throw new Error('selector consumed RNG'); };
  try {
    const production = selectors.production.selectCandidate(...input.args);
    const all = selectors.allShortest.selectCandidate(...input.args);
    const repeat = selectors.allShortest.selectCandidate(...input.args);
    assert.ok(production && all);
    for (const index of production.skeletonIndices) assert.ok(all.skeletonIndices.includes(index));
    for (const index of all.skeletonIndices) assert.ok(input.component[index], `outside H: ${index}`);
    assert.ok(!all.skeletonIndices.includes(input.loop));
    assert.ok(!all.skeletonIndices.includes(20 * SIZE + 60));
    assert.deepEqual(all, repeat);
    assert.equal(source, original);
    assert.equal(selectors.production.sourceHash, selectors.allShortest.sourceHash);
    assert.notEqual(selectors.production.transformedHash, selectors.allShortest.transformedHash);
  } finally {
    Math.random = rng;
  }
});

function fixture(shape) {
  const mask = new Uint8Array(CELLS), supports = new Float32Array(CELLS), chemical = new Float32Array(CELLS);
  const component = new Uint8Array(CELLS);
  const put = (x, y) => { mask[y * SIZE + x] = 1; component[y * SIZE + x] = 1; };
  const line = (x1, y1, x2, y2) => {
    const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
    let x = x1, y = y1;
    for (;;) { put(x, y); if (x === x2 && y === y2) break; x += dx; y += dy; }
  };
  if (shape === 'root') {
    line(48, 58, 48, 3);
  } else if (shape === 'fork' || shape === 'merge') {
    line(48, 58, 48, 40);
    line(48, 40, 28, 40);
    line(48, 40, 68, 40);
    line(28, 40, 28, 3);
    line(68, 40, 68, 3);
    if (shape === 'merge') line(28, 3, 68, 3);
  } else {
    if (shape === 'equal-routes') {
      line(48, 58, 48, 50);
      line(48, 50, 28, 50);
      line(28, 50, 28, 30);
      line(28, 30, 48, 30);
      line(48, 30, 48, 3);
      line(48, 50, 68, 50);
      line(68, 50, 68, 30);
      line(68, 30, 48, 30);
    } else {
      line(48, 58, 48, 40);
      line(48, 40, 28, 40);
      line(48, 40, 68, 40);
      line(28, 40, 28, 3);
      line(68, 40, 68, 3);
      if (shape === 'equal-fork-spur') {
        line(48, 40, 78, 40);
        line(78, 40, 78, 20);
        line(78, 20, 48, 20);
      }
    }
  }
  return { args: [mask, supports, chemical], mask, component,
    loop: shape === 'equal-fork-spur' ? 30 * SIZE + 78 : -1 };
}
