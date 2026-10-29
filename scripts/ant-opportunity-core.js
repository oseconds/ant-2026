export const OPPORTUNITY_GRID_SIZE = 96;
const CELL_COUNT = OPPORTUNITY_GRID_SIZE ** 2;

function validateLandscape(S, values) {
  if (!S || S.length !== CELL_COUNT || !values || values.length !== CELL_COUNT) {
    throw new RangeError(`S and values must each contain ${CELL_COUNT} cells`);
  }
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (S[i] !== 0 && S[i] !== 1) throw new TypeError(`S[${i}] must be binary`);
    if (S[i] && (!Number.isFinite(values[i]) || values[i] < 0)) {
      throw new TypeError(`values[${i}] must be finite and nonnegative inside S`);
    }
  }
}

export function neighbors8(index) {
  const x = index % OPPORTUNITY_GRID_SIZE, y = Math.floor(index / OPPORTUNITY_GRID_SIZE), result = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < OPPORTUNITY_GRID_SIZE && ny >= 0 && ny < OPPORTUNITY_GRID_SIZE) {
      result.push(ny * OPPORTUNITY_GRID_SIZE + nx);
    }
  }
  return result;
}

/** Exact-equal connected 8-neighbor plateaus that are maximal within S. */
export function enumeratePlateauMaxima({ S, values }) {
  validateLandscape(S, values);
  const seen = new Uint8Array(CELL_COUNT), peaks = [];
  let zeroMaxContextCount = 0;
  for (let start = 0; start < CELL_COUNT; start += 1) {
    if (!S[start] || seen[start]) continue;
    const value = values[start], stack = [start], cells = [];
    seen[start] = 1;
    let maximum = true;
    while (stack.length) {
      const index = stack.pop();
      cells.push(index);
      for (const adjacent of neighbors8(index)) {
        if (!S[adjacent]) continue;
        if (values[adjacent] > value) maximum = false;
        if (!seen[adjacent] && values[adjacent] === value) {
          seen[adjacent] = 1;
          stack.push(adjacent);
        }
      }
    }
    if (!maximum) continue;
    cells.sort((a, b) => a - b);
    if (value === 0) zeroMaxContextCount += 1;
    else peaks.push({ index: cells[0], value, cells });
  }
  return { peaks, zeroMaxContextCount };
}

function point(index) {
  return { x: (index % OPPORTUNITY_GRID_SIZE) / (OPPORTUNITY_GRID_SIZE - 1),
    y: Math.floor(index / OPPORTUNITY_GRID_SIZE) / (OPPORTUNITY_GRID_SIZE - 1) };
}

function distanceBetween(left, right) {
  const dx = left % OPPORTUNITY_GRID_SIZE - right % OPPORTUNITY_GRID_SIZE;
  const dy = Math.floor(left / OPPORTUNITY_GRID_SIZE) - Math.floor(right / OPPORTUNITY_GRID_SIZE);
  return Math.hypot(dx, dy) / (OPPORTUNITY_GRID_SIZE - 1);
}

/** Descriptive greedy grouping; every input peak remains in assignments. */
export function descriptiveSpacing(peaks, componentByCell, separation) {
  if (!Array.isArray(peaks) || !componentByCell || componentByCell.length !== CELL_COUNT
    || !Number.isFinite(separation) || separation < 0) throw new TypeError('invalid spacing inputs');
  const ordered = peaks.slice().sort((a, b) => b.value - a.value || a.index - b.index);
  const representatives = [], counts = [], assignments = [];
  for (const peak of ordered) {
    if (!Number.isInteger(peak?.index) || peak.index < 0 || peak.index >= CELL_COUNT
      || !Number.isFinite(peak.value) || peak.value <= 0) throw new TypeError('invalid positive peak');
    const component = componentByCell[peak.index];
    if (!Number.isInteger(component)) throw new TypeError(`componentByCell[${peak.index}] must be an integer`);
    let match = -1, matchDistance = 0;
    for (let i = 0; i < representatives.length; i += 1) {
      const representative = representatives[i];
      if (componentByCell[representative.index] !== component) continue;
      const distance = distanceBetween(peak.index, representative.index);
      if (distance <= separation) { match = i; matchDistance = distance; break; }
    }
    if (match >= 0) {
      counts[match] += 1;
      assignments.push({ peak, representativeIndex: representatives[match].index, distance: matchDistance });
    } else {
      representatives.push(peak);
      counts.push(1);
      assignments.push({ peak, representativeIndex: peak.index, distance: 0 });
    }
  }
  return { representatives, counts, assignments };
}

/** Mutual nearest-neighbor correspondence of representative grid coordinates. */
export function reciprocalNearest(previous, current, maxDistance) {
  if (!Array.isArray(previous) || !Array.isArray(current) || !Number.isFinite(maxDistance) || maxDistance < 0) {
    throw new TypeError('invalid correspondence inputs');
  }
  const validate = peaks => {
    const indices = new Set();
    for (const peak of peaks) {
      if (!Number.isInteger(peak?.index) || peak.index < 0 || peak.index >= CELL_COUNT || indices.has(peak.index)) {
        throw new TypeError('representatives need unique valid cell indices');
      }
      indices.add(peak.index);
    }
  };
  validate(previous); validate(current);
  const nearest = (from, to) => from.map(peak => {
    let best = null;
    for (const candidate of to) {
      const distance = distanceBetween(peak.index, candidate.index);
      if (distance > maxDistance) continue;
      if (!best || distance < best.distance || (distance === best.distance && candidate.index < best.index)) {
        best = { index: candidate.index, distance };
      }
    }
    return best;
  });
  const forward = nearest(previous, current), backward = nearest(current, previous), pairs = [];
  for (let i = 0; i < previous.length; i += 1) {
    const match = forward[i];
    if (!match) continue;
    const j = current.findIndex(peak => peak.index === match.index);
    if (backward[j]?.index === previous[i].index) pairs.push({
      previousIndex: previous[i].index, currentIndex: match.index, distance: match.distance
    });
  }
  const matchedPrevious = new Set(pairs.map(pair => pair.previousIndex));
  const matchedCurrent = new Set(pairs.map(pair => pair.currentIndex));
  return { pairs,
    unmatchedPrevious: previous.map(peak => peak.index).filter(index => !matchedPrevious.has(index)),
    unmatchedCurrent: current.map(peak => peak.index).filter(index => !matchedCurrent.has(index)) };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/scripts/ant-opportunity-core.js')
  && process.argv.includes('--self-test')) {
  const assert = await import('node:assert/strict');
  const empty = () => new Uint8Array(CELL_COUNT), values = () => new Float32Array(CELL_COUNT);
  const S = empty(), V = values();
  S[0] = S[1] = S[96] = S[97] = 1; V[0] = V[1] = V[96] = 2; V[97] = 1;
  S[95] = S[96 * 95] = 1; V[95] = V[96 * 95] = 1; // row-edge cells do not wrap together
  const flatS = empty(), flatV = values(); flatS[200] = flatS[201] = 1;
  const snapshot = [S.slice(), V.slice()];
  const found = enumeratePlateauMaxima({ S, values: V });
  assert.deepEqual(found.peaks, [{ index: 0, value: 2, cells: [0, 1, 96] },
    { index: 95, value: 1, cells: [95] }, { index: 9120, value: 1, cells: [9120] }]);
  assert.equal(found.zeroMaxContextCount, 0);
  assert.equal(enumeratePlateauMaxima({ S: flatS, values: flatV }).zeroMaxContextCount, 1);
  const comps = new Int16Array(CELL_COUNT); comps.fill(1); comps[3] = 2;
  const spacingInput = [{ index: 2, value: 4 }, { index: 3, value: 3 }, { index: 1, value: 2 }];
  const spacingBefore = JSON.stringify(spacingInput), spaced = descriptiveSpacing(spacingInput, comps, 1 / 95);
  assert.equal(JSON.stringify(spacingInput), spacingBefore);
  assert.deepEqual(spaced.representatives.map(p => p.index), [2, 3]);
  assert.deepEqual(spaced.counts, [2, 1]);
  assert.equal(descriptiveSpacing([{ index: 2, value: 1 }, { index: 3, value: 1 }], comps, 0).representatives.length, 2);
  assert.equal(descriptiveSpacing([{ index: 2, value: 2 }, { index: 1, value: 1 }], comps, 1 / 95).representatives.length, 1);
  const ties = descriptiveSpacing([{ index: 1, value: 4 }, { index: 3, value: 3 }, { index: 2, value: 2 }], comps, 1 / 95);
  assert.equal(ties.assignments[2].representativeIndex, 1);
  assert.deepEqual(reciprocalNearest([], [{ index: 1 }], 1), { pairs: [], unmatchedPrevious: [], unmatchedCurrent: [1] });
  const previous = [{ index: 10 }, { index: 12 }], current = [{ index: 11 }];
  const correspondenceBefore = JSON.stringify([previous, current]);
  assert.deepEqual(reciprocalNearest(previous, current, 0.02), {
    pairs: [{ previousIndex: 10, currentIndex: 11, distance: 1 / 95 }], unmatchedPrevious: [12], unmatchedCurrent: []
  });
  assert.deepEqual(reciprocalNearest([{ index: 10 }], [{ index: 11 }, { index: 9 }], 0.02).pairs,
    [{ previousIndex: 10, currentIndex: 9, distance: 1 / 95 }]);
  assert.equal(JSON.stringify([previous, current]), correspondenceBefore);
  assert.deepEqual(S, snapshot[0]); assert.deepEqual(V, snapshot[1]);
  const oldRandom = Math.random; Math.random = () => { throw new Error('RNG forbidden'); };
  try { enumeratePlateauMaxima({ S, values: V }); descriptiveSpacing([], comps, 0); reciprocalNearest([], [], 0); }
  finally { Math.random = oldRandom; }
  console.log('ant-opportunity-core self-test passed');
}
