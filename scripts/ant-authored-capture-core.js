import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { TRAIL_PLATE_GRID_SIZE } from '../src/lib/agents/ant/TrailPlateBirth.js';

const SIDE = TRAIL_PLATE_GRID_SIZE;
const CELL_COUNT = SIDE * SIDE;
const SCALE = SIDE - 1;
const SQRT2 = Math.SQRT2;
const TECHNICAL_EPSILON = 1e-12;

export function captureStructuralPackets({ F, nucleus, radius }) {
  if ((!Array.isArray(F) && !(F instanceof Uint8Array)) || F.length !== CELL_COUNT
    || Array.from(F).some(value => value !== 0 && value !== 1)) {
    throw new TypeError(`F must be a ${CELL_COUNT}-cell binary array`);
  }
  if (!Number.isInteger(nucleus) || nucleus < 0 || nucleus >= CELL_COUNT) throw new RangeError('nucleus must be a valid cell index');
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError('radius must be finite and positive');
  if (!F[nucleus]) throw new RangeError('F must contain the nucleus');

  const neighbors = index => {
    const row = Math.floor(index / SIDE), column = index % SIDE, result = [];
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const x = column + dx, y = row + dy;
      if (x >= 0 && x < SIDE && y >= 0 && y < SIDE) result.push(y * SIDE + x);
    }
    return result.sort((a, b) => a - b);
  };
  const physicalDistance = index => {
    const dx = (index % SIDE - nucleus % SIDE) / SCALE;
    const dy = (Math.floor(index / SIDE) - Math.floor(nucleus / SIDE)) / SCALE;
    return Math.hypot(dx, dy);
  };

  // shortcut: sorted frontier targets R=.15 offline captures; use a heap before production-scale runs.
  const distances = new Float64Array(CELL_COUNT).fill(Infinity);
  const parents = new Int32Array(CELL_COUNT).fill(-1);
  const settled = new Uint8Array(CELL_COUNT);
  const frontier = [[0, nucleus]];
  distances[nucleus] = 0;
  while (frontier.length) {
    frontier.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const [distance, index] = frontier.shift();
    if (settled[index] || distance > radius + TECHNICAL_EPSILON) continue;
    settled[index] = 1;
    for (const next of neighbors(index)) {
      if (!F[next] || settled[next]) continue;
      const diagonal = index % SIDE !== next % SIDE && Math.floor(index / SIDE) !== Math.floor(next / SIDE);
      const candidate = distance + (diagonal ? SQRT2 : 1) / SCALE;
      if (candidate > radius + TECHNICAL_EPSILON) continue;
      const previous = distances[next];
      if (candidate < previous - TECHNICAL_EPSILON
        || (Math.abs(candidate - previous) <= TECHNICAL_EPSILON && index < parents[next])) {
        distances[next] = candidate;
        parents[next] = index;
        frontier.push([candidate, next]);
      }
    }
  }

  const G = [];
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (settled[index] && distances[index] <= radius + TECHNICAL_EPSILON) G.push(index);
  }

  const X = [], seen = new Uint8Array(CELL_COUNT), queue = [nucleus];
  seen[nucleus] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    X.push(index);
    for (const next of neighbors(index)) {
      if (!seen[next] && F[next] && physicalDistance(next) <= radius + TECHNICAL_EPSILON) {
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  X.sort((a, b) => a - b);

  let endpoint = nucleus;
  for (const index of G) {
    if (distances[index] > distances[endpoint] + TECHNICAL_EPSILON
      || (Math.abs(distances[index] - distances[endpoint]) <= TECHNICAL_EPSILON && index < endpoint)) endpoint = index;
  }
  const L = [];
  for (let index = endpoint; index !== -1; index = parents[index]) L.push(index);
  L.reverse();
  return {
    G, X, L,
    graphDistances: Object.fromEntries(G.map(index => [index, distances[index]])),
    parentEdges: G.filter(index => index !== nucleus).map(index => [parents[index], index])
  };
}

function selfTest() {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('capture core must not consume RNG'); };
  try {
    runSelfChecks();
  } finally {
    Math.random = originalRandom;
  }
}

function runSelfChecks() {
  const idx = (x, y) => y * SIDE + x;
  const full = new Uint8Array(CELL_COUNT).fill(1), original = full.slice();
  const center = idx(48, 48), radius = 0.15;
  const dense = captureStructuralPackets({ F: full, nucleus: center, radius });
  assert.deepEqual(dense.G, dense.G.toSorted((a, b) => a - b));
  assert(dense.G.every(index => dense.X.includes(index)));
  assert(dense.G.length > dense.L.length);
  assert.deepEqual(full, original);
  assert.throws(() => captureStructuralPackets({ F: new Uint8Array(CELL_COUNT), nucleus: center, radius }), /nucleus/);
  assert.throws(() => captureStructuralPackets({ F: new Uint8Array(CELL_COUNT - 1), nucleus: center, radius }), /binary array/);
  const nonbinary = full.slice(); nonbinary[center + 1] = 2;
  assert.throws(() => captureStructuralPackets({ F: nonbinary, nucleus: center, radius }), /binary array/);
  for (const invalidRadius of [0, -1, Infinity, NaN]) {
    assert.throws(() => captureStructuralPackets({ F: full, nucleus: center, radius: invalidRadius }), /radius/);
  }
  assert.throws(() => captureStructuralPackets({ F: full, nucleus: -1, radius }), /nucleus/);
  assert.throws(() => captureStructuralPackets({ F: full, nucleus: CELL_COUNT, radius }), /nucleus/);

  const diagonal = new Uint8Array(CELL_COUNT);
  for (let step = 0; step <= 4; step += 1) { diagonal[idx(48 + step, 48)] = 1; diagonal[idx(52, 48 + step)] = 1; }
  const folded = captureStructuralPackets({ F: diagonal, nucleus: center, radius: 0.07 });
  assert(folded.X.includes(idx(52, 52)));
  assert(!folded.G.includes(idx(52, 52)));
  assert(folded.L.every(index => folded.G.includes(index)));

  const branch = new Uint8Array(CELL_COUNT);
  for (let x = 48; x <= 53; x += 1) { branch[idx(x, 48)] = 1; branch[idx(x, 49)] = 1; }
  const branched = captureStructuralPackets({ F: branch, nucleus: center, radius: 5 / SCALE });
  assert(branched.G.length > branched.L.length);
  assert(branched.X.length > branched.L.length);
  assert.deepEqual(branched, captureStructuralPackets({ F: branch, nucleus: center, radius: 5 / SCALE }));

  const tie = new Uint8Array(CELL_COUNT);
  tie[idx(48, 48)] = tie[idx(48, 47)] = tie[idx(48, 49)] = 1;
  const tied = captureStructuralPackets({ F: tie, nucleus: center, radius: 1 / SCALE });
  assert.deepEqual(tied.L, [center, idx(48, 47)]);
  const exact = new Uint8Array(CELL_COUNT);
  exact[idx(48, 48)] = exact[idx(49, 48)] = 1;
  assert(captureStructuralPackets({ F: exact, nucleus: center, radius: 1 / SCALE }).G.includes(idx(49, 48)));
  assert(!captureStructuralPackets({ F: exact, nucleus: center, radius: 0.999 / SCALE }).G.includes(idx(49, 48)));

  const fourteen = new Uint8Array(CELL_COUNT);
  for (let step = 0; step <= 14; step += 1) fourteen[idx(40 + step, 48)] = 1;
  const boundary = captureStructuralPackets({ F: fourteen, nucleus: idx(40, 48), radius: 14 / SCALE });
  assert(boundary.G.includes(idx(54, 48)));
  assert(Math.abs(boundary.graphDistances[idx(54, 48)] - 14 / SCALE) <= TECHNICAL_EPSILON);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--self-test')) {
  selfTest();
  process.stdout.write('authored capture core self-test passed\n');
}
