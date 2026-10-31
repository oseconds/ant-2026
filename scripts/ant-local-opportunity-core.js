export const OPPORTUNITY_GRID_SIZE = 96;
export const CELL_COUNT = OPPORTUNITY_GRID_SIZE ** 2;
export const CHANNELS = ['D', 'B', 'C', 'feet1', 'feet5', 'feet20', 'travel1', 'travel5', 'travel20',
  'deltaD1', 'deltaD5', 'deltaD20', 'deltaB1', 'deltaB5', 'deltaB20', 'deltaC1', 'deltaC5', 'deltaC20'];
export const REPRESENTATIONS = ['raw', 'g15', 'g30'];
export const MATCH_CUTOFFS = [.025, .075];
const ENTRY = { x: .5, y: .72 };

export function neighbors8(index) {
  if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT) throw new RangeError('invalid grid index');
  const x = index % OPPORTUNITY_GRID_SIZE, y = Math.floor(index / OPPORTUNITY_GRID_SIZE), result = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < OPPORTUNITY_GRID_SIZE && ny >= 0 && ny < OPPORTUNITY_GRID_SIZE) result.push(ny * OPPORTUNITY_GRID_SIZE + nx);
  }
  return result;
}

export function point(index) {
  if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT) throw new RangeError('invalid grid index');
  return { x: index % OPPORTUNITY_GRID_SIZE / (OPPORTUNITY_GRID_SIZE - 1),
    y: Math.floor(index / OPPORTUNITY_GRID_SIZE) / (OPPORTUNITY_GRID_SIZE - 1) };
}

export function distanceBetween(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a >= CELL_COUNT || b < 0 || b >= CELL_COUNT) {
    throw new RangeError('invalid grid index');
  }
  return Math.hypot(a % OPPORTUNITY_GRID_SIZE - b % OPPORTUNITY_GRID_SIZE,
    Math.floor(a / OPPORTUNITY_GRID_SIZE) - Math.floor(b / OPPORTUNITY_GRID_SIZE)) / (OPPORTUNITY_GRID_SIZE - 1);
}

export function labelComponents(F) {
  if (!F || F.length !== CELL_COUNT) throw new RangeError(`F must contain ${CELL_COUNT} cells`);
  for (let i = 0; i < CELL_COUNT; i += 1) if (F[i] !== 0 && F[i] !== 1) throw new TypeError(`F[${i}] must be binary`);
  const labels = new Int32Array(CELL_COUNT); labels.fill(-1);
  const sizes = [];
  let id = 0;
  for (let start = 0; start < CELL_COUNT; start += 1) {
    if (!F[start]) continue;
    if (labels[start] >= 0) continue;
    const stack = [start]; labels[start] = id;
    let size = 0;
    while (stack.length) {
      const index = stack.pop(); size += 1;
      for (const adjacent of neighbors8(index)) if (F[adjacent] && labels[adjacent] < 0) {
        labels[adjacent] = id; stack.push(adjacent);
      }
    }
    sizes.push(size); id += 1;
  }
  return { labels, sizes };
}

export function edgeBearingIndices(F) {
  if (!F || F.length !== CELL_COUNT) throw new RangeError(`F must contain ${CELL_COUNT} cells`);
  const result = [];
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (!F[index]) continue;
    if (F[index] !== 1) throw new TypeError(`F[${index}] must be binary`);
    if (neighbors8(index).some(adjacent => F[adjacent])) result.push(index);
  }
  return result;
}

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

/** Exact-equal connected 8-neighbor plateaus maximal within S; zero maxima are counted but omitted. */
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
      const index = stack.pop(); cells.push(index);
      for (const adjacent of neighbors8(index)) {
        if (!S[adjacent]) continue;
        if (values[adjacent] > value) maximum = false;
        if (!seen[adjacent] && values[adjacent] === value) { seen[adjacent] = 1; stack.push(adjacent); }
      }
    }
    if (!maximum) continue;
    cells.sort((a, b) => a - b);
    if (value === 0) zeroMaxContextCount += 1;
    else peaks.push({ index: cells[0], value, cells });
  }
  return { peaks, zeroMaxContextCount };
}

/** Greedy strongest-first grouping from the frozen landscape method; deliberately nontransitive. */
export function descriptiveSpacing(peaks, componentByCell, separation) {
  if (!Array.isArray(peaks) || !componentByCell || componentByCell.length !== CELL_COUNT
    || !Number.isFinite(separation) || separation < 0) throw new TypeError('invalid spacing inputs');
  const ordered = peaks.slice().sort((a, b) => b.value - a.value || a.index - b.index);
  const representatives = [], counts = [], assignments = [];
  for (const peak of ordered) {
    if (!Number.isInteger(peak?.index) || peak.index < 0 || peak.index >= CELL_COUNT
      || !Number.isFinite(peak.value) || peak.value <= 0) throw new TypeError('invalid positive peak');
    const component = componentByCell[peak.index];
    if (!Number.isInteger(component) || component < 0) throw new TypeError(`componentByCell[${peak.index}] must be a component`);
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
      representatives.push(peak); counts.push(1);
      assignments.push({ peak, representativeIndex: peak.index, distance: 0 });
    }
  }
  return { representatives, counts, assignments };
}

/** Reciprocal nearest matching with lower-index tie breaks and an optional pair eligibility rule. */
export function reciprocalNearest(previous, current, maxDistance, eligible = () => true) {
  if (!Array.isArray(previous) || !Array.isArray(current) || !Number.isFinite(maxDistance) || maxDistance < 0
    || typeof eligible !== 'function') throw new TypeError('invalid correspondence inputs');
  for (const rows of [previous, current]) {
    const indices = new Set();
    for (const row of rows) {
      if (!Number.isInteger(row?.index) || row.index < 0 || row.index >= CELL_COUNT || indices.has(row.index)) {
        throw new TypeError('correspondence rows need unique valid cell indices');
      }
      indices.add(row.index);
    }
  }
  const nearest = (from, to, reverse = false) => from.map(row => {
    let best = null;
    for (const candidate of to) {
      if (!(reverse ? eligible(candidate, row) : eligible(row, candidate))) continue;
      const distance = distanceBetween(row.index, candidate.index);
      if (distance > maxDistance) continue;
      if (!best || distance < best.distance || (distance === best.distance && candidate.index < best.index)) {
        best = { index: candidate.index, distance };
      }
    }
    return best;
  });
  const forward = nearest(previous, current), backward = nearest(current, previous, true), pairs = [];
  for (let i = 0; i < previous.length; i += 1) {
    const match = forward[i];
    if (!match) continue;
    const j = current.findIndex(row => row.index === match.index);
    if (backward[j]?.index === previous[i].index) pairs.push({ previousIndex: previous[i].index,
      currentIndex: match.index, distance: match.distance });
  }
  const matchedPrevious = new Set(pairs.map(pair => pair.previousIndex));
  const matchedCurrent = new Set(pairs.map(pair => pair.currentIndex));
  return { pairs,
    unmatchedPrevious: previous.map(row => row.index).filter(index => !matchedPrevious.has(index)),
    unmatchedCurrent: current.map(row => row.index).filter(index => !matchedCurrent.has(index)) };
}

/** Component labels are ordinal per frame; only shared F cells establish adjacent-frame continuity. */
export function overlappingComponentPairs(previousLabels, currentLabels) {
  return componentOverlapRelations(previousLabels, currentLabels).pairs;
}

export function componentOverlapRelations(previousLabels, currentLabels) {
  if (!previousLabels || !currentLabels || previousLabels.length !== CELL_COUNT || currentLabels.length !== CELL_COUNT) {
    throw new RangeError(`component labels must each contain ${CELL_COUNT} cells`);
  }
  const counts = new Map(), children = new Map(), parents = new Map();
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const previous = previousLabels[i], current = currentLabels[i];
    if (previous < 0 || current < 0) continue;
    const key = `${previous}:${current}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!children.has(previous)) children.set(previous, new Set());
    if (!parents.has(current)) parents.set(current, new Set());
    children.get(previous).add(current); parents.get(current).add(previous);
  }
  const relations = [...counts].map(([key, sharedFCells]) => {
    const [previousComponent, currentComponent] = key.split(':').map(Number);
    return { previousComponent, currentComponent, sharedFCells };
  }).sort((a, b) => a.previousComponent - b.previousComponent || a.currentComponent - b.currentComponent);
  const splitComponentIds = [...children].filter(([, set]) => set.size > 1).map(([id]) => id).sort((a, b) => a - b);
  const mergeComponentIds = [...parents].filter(([, set]) => set.size > 1).map(([id]) => id).sort((a, b) => a - b);
  return { pairs: new Set(relations.map(row => `${row.previousComponent}:${row.currentComponent}`)), relations,
    splitComponentIds, mergeComponentIds, splitCount: splitComponentIds.length, mergeCount: mergeComponentIds.length };
}

/** Nearest recorded analysis to t-window, among strictly older anchors; ties select the older timestamp. */
export function findLagAnchor(anchors, currentIndex, windowSeconds) {
  if (!Array.isArray(anchors) || !Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= anchors.length
    || !Number.isFinite(windowSeconds) || windowSeconds <= 0) throw new TypeError('invalid lag inputs');
  const currentTimeMs = anchors[currentIndex].timeMs, targetTimeMs = currentTimeMs - windowSeconds * 1000;
  if (targetTimeMs < anchors[0].timeMs) return null;
  let priorIndex = -1, bestDistance = Infinity;
  for (let i = 0; i < currentIndex; i += 1) {
    const timeMs = anchors[i].timeMs, distance = Math.abs(timeMs - targetTimeMs);
    if (distance < bestDistance || (distance === bestDistance && (priorIndex < 0 || timeMs < anchors[priorIndex].timeMs))) {
      priorIndex = i; bestDistance = distance;
    }
  }
  if (priorIndex < 0) return null;
  return { priorIndex, priorTimeMs: anchors[priorIndex].timeMs, targetTimeMs,
    elapsedSeconds: (currentTimeMs - anchors[priorIndex].timeMs) / 1000 };
}

/** Flood F from an S/F center, restricted to the center's radius disk. */
export function xCapture(F, centerIndex, radius = .15) {
  if (!F || F.length !== CELL_COUNT || !Number.isInteger(centerIndex) || centerIndex < 0 || centerIndex >= CELL_COUNT
    || !Number.isFinite(radius) || radius < 0) throw new TypeError('invalid X capture inputs');
  if (F[centerIndex] !== 1) throw new RangeError('X center must be in F');
  const seen = new Uint8Array(CELL_COUNT), stack = [centerIndex], cells = [];
  seen[centerIndex] = 1;
  while (stack.length) {
    const index = stack.pop();
    cells.push(index);
    for (const adjacent of neighbors8(index)) if (F[adjacent] && !seen[adjacent]
      && distanceBetween(adjacent, centerIndex) <= radius + 1e-12) {
      seen[adjacent] = 1; stack.push(adjacent);
    }
  }
  cells.sort((a, b) => a - b);
  const maxRadius = Math.max(...cells.map(index => distanceBetween(index, centerIndex)));
  if (!cells.includes(centerIndex) || !cells.length || maxRadius > radius + 1e-12) throw new Error('invalid X capture');
  return { cells, maxRadius, connected: true, radiusValid: true };
}

export function captureKey(cells) {
  if (!Array.isArray(cells) || cells.some((cell, i) => !Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT
    || (i > 0 && cells[i - 1] >= cell))) throw new TypeError('capture cells must be sorted unique grid indices');
  return cells.join(',');
}

export function compareCaptureSets(a, b) {
  const setA = new Set(a), setB = new Set(b);
  const intersection = a.reduce((count, cell) => count + Number(setB.has(cell)), 0), smaller = Math.min(a.length, b.length);
  const union = a.length + b.length - intersection;
  return { intersection, jaccard: union ? intersection / union : null,
    overlapOfSmaller: smaller ? intersection / smaller : null, identical: a.length === b.length && intersection === a.length,
    disjoint: intersection === 0, nested: intersection === smaller };
}
