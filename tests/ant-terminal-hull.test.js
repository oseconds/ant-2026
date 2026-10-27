import assert from 'node:assert/strict';
import test from 'node:test';
import { terminalHull } from '../scripts/lib/antTerminalHull.js';

const line = (y, x1, x2, size = 20) => Array.from({ length: Math.abs(x2 - x1) + 1 }, (_, i) => y * size + Math.min(x1, x2) + i);

test('keeps root-to-target route and excludes terminal-free spur', () => {
  const route = line(5, 2, 8), spur = [6 * 20 + 9, 7 * 20 + 10, 8 * 20 + 11];
  const result = terminalHull({ cells: [...route, ...spur], root: route[0], targets: [route.at(-1)], size: 20 });
  assert.deepEqual(result.hullCells, route);
  assert.deepEqual(result.pendantComponents, [spur]);
});

test('keeps both unequal reconnection routes and excludes a pendant cycle', () => {
  const size = 24, root = 10 * size + 2, target = 10 * size + 16;
  const shortRoute = line(10, 2, 16, size);
  const longRoute = [...line(6, 2, 16, size), ...Array.from({ length: 3 }, (_, i) => (7 + i) * size + 2), ...Array.from({ length: 3 }, (_, i) => (7 + i) * size + 16)];
  const lobe = [11 * size + 17, 11 * size + 18, 11 * size + 19, 12 * size + 19, 12 * size + 18];
  const cells = [...shortRoute, ...longRoute, ...lobe];
  const result = terminalHull({ cells, root, targets: [target], size });
  assert.ok(shortRoute.every(cell => result.hullCells.includes(cell)));
  assert.ok(longRoute.every(cell => result.hullCells.includes(cell)));
  assert.ok(!lobe.slice(1).some(cell => result.hullCells.includes(cell)));
  assert.deepEqual(result.pendantComponents, [lobe.sort((a, b) => a - b)]);
});

test('supports articulation targets and root-equals-target', () => {
  const cells = [...line(5, 2, 8), ...line(6, 8, 10).slice(1)];
  const target = 5 * 20 + 8;
  assert.deepEqual(terminalHull({ cells, root: 5 * 20 + 2, targets: [target], size: 20 }).hullCells, line(5, 2, 8));
  assert.deepEqual(terminalHull({ cells, root: target, targets: [target], size: 20 }), { hullCells: [target], pendantComponents: [line(5, 2, 7), line(6, 9, 10)] });
});

test('diagonal guard removes a diagonal edge beside either orthogonal cell', () => {
  const cells = [0, 11, 1];
  assert.deepEqual(terminalHull({ cells, root: 0, targets: [11], size: 10 }).hullCells, [0, 1, 11]);
  assert.deepEqual(terminalHull({ cells, root: 0, targets: [11], size: 10, diagonalGuard: true }).hullCells, [0, 1, 11]);
  assert.deepEqual(terminalHull({ cells: [0, 11], root: 0, targets: [11], size: 10, diagonalGuard: true }).hullCells, [0, 11]);
});

test('matches simple-path union on connected tiny graphs with either terminal set and diagonal rule', () => {
  for (let mask = 1; mask < 1 << 9; mask++) {
    const cells = Array.from({ length: 9 }, (_, i) => i).filter(i => mask & (1 << i));
    if (!cells.includes(0) || !cells.includes(8)) continue;
    for (const diagonalGuard of [false, true]) {
      if (!connected(cells, 0, 3, diagonalGuard)) continue;
      for (const targets of [[8], [6, 8]]) {
        if (targets.some(target => !cells.includes(target))) continue;
        const expected = bruteHull(cells, 0, targets, 3, diagonalGuard);
        const result = terminalHull({ cells, root: 0, targets, size: 3, diagonalGuard });
        assert.deepEqual(result.hullCells, [...expected].sort((a, b) => a - b), `mask ${mask}, guard ${diagonalGuard}, targets ${targets}`);
      }
    }
  }
});

test('rejects absent terminals and disconnected inputs', () => {
  assert.throws(() => terminalHull({ cells: [0, 1], root: 0, targets: [2], size: 10 }), /must be present/);
  assert.throws(() => terminalHull({ cells: [0, 99], root: 0, targets: [99], size: 10 }), /connected graph/);
});

function bruteHull(cells, root, targets, size, diagonalGuard) {
  const present = new Set(cells), marked = new Set([root, ...targets]), hull = new Set();
  const adjacent = cell => {
    const x = cell % size, y = Math.floor(cell / size), result = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && nx < size && ny >= 0 && ny < size && present.has(ny * size + nx)
        && !(diagonalGuard && dx && dy && (present.has(y * size + nx) || present.has(ny * size + x)))) result.push(ny * size + nx);
    }
    return result;
  };
  const visit = (cell, path) => {
    if (marked.has(cell) && cell !== root) for (const point of path) hull.add(point);
    for (const next of adjacent(cell)) if (!path.includes(next)) visit(next, [...path, next]);
  };
  visit(root, [root]);
  return hull;
}

function connected(cells, root, size, diagonalGuard) {
  const present = new Set(cells), seen = new Set([root]), pending = [root];
  while (pending.length) {
    const cell = pending.pop(), x = cell % size, y = Math.floor(cell / size);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy, next = ny * size + nx;
      if ((!dx && !dy) || nx < 0 || nx >= size || ny < 0 || ny >= size || !present.has(next) || seen.has(next)) continue;
      if (diagonalGuard && dx && dy && (present.has(y * size + nx) || present.has(ny * size + x))) continue;
      seen.add(next); pending.push(next);
    }
  }
  return seen.size === cells.length;
}
