import { gunzipSync } from 'node:zlib';

export function decodeXorSnapshots(compressed, descriptors) {
  const bytes = gunzipSync(compressed);
  const expectedLength = descriptors.reduce((max, snapshot) => Math.max(max,
    ...Object.values(snapshot.arrays).map(row => row.offset + row.bytes)), 0);
  if (bytes.length !== expectedLength) throw new Error(`Snapshot stream size mismatch: ${bytes.length} != ${expectedLength}`);
  const previous = new Map();
  return descriptors.map(snapshot => {
    const arrays = {};
    for (const [key, descriptor] of Object.entries(snapshot.arrays)) {
      if (!Number.isInteger(descriptor.offset) || descriptor.offset < 0
        || !Number.isInteger(descriptor.bytes) || descriptor.bytes < 0) throw new RangeError(`Invalid snapshot range for ${key}`);
      const encoded = bytes.subarray(descriptor.offset, descriptor.offset + descriptor.bytes);
      const prior = previous.get(key);
      if (prior && prior.length !== encoded.length) throw new Error(`Snapshot array size changed for ${key}`);
      const decoded = Buffer.allocUnsafe(encoded.length);
      for (let index = 0; index < encoded.length; index += 1) decoded[index] = encoded[index] ^ (prior?.[index] || 0);
      previous.set(key, decoded);
      arrays[key] = decoded;
    }
    return { tick: snapshot.tick, timeSeconds: snapshot.timeSeconds, arrays };
  });
}

export function float32FromBytes(bytes, count) {
  if (bytes.length !== count * 4) throw new RangeError(`Expected ${count * 4} Float32 bytes, got ${bytes.length}`);
  const values = new Float32Array(count);
  for (let index = 0; index < count; index += 1) values[index] = bytes.readFloatLE(index * 4);
  return values;
}

export function uint32FromBytes(bytes, count) {
  if (bytes.length !== count * 4) throw new RangeError(`Expected ${count * 4} Uint32 bytes, got ${bytes.length}`);
  const values = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) values[index] = bytes.readUInt32LE(index * 4);
  return values;
}

export function maskFromIndices(indices, cellCount) {
  const mask = new Uint8Array(cellCount);
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= cellCount) throw new RangeError(`Invalid cell index: ${index}`);
    if (mask[index]) throw new Error(`Duplicate cell index: ${index}`);
    mask[index] = 1;
  }
  return mask;
}

export function connectedComponents(mask, gridSize) {
  const seen = new Uint8Array(mask.length), components = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || seen[index]) continue;
    const queue = [index], component = [];
    seen[index] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      component.push(current);
      for (const next of neighbors(current, gridSize)) if (mask[next] && !seen[next]) {
        seen[next] = 1;
        queue.push(next);
      }
    }
    components.push(component.sort((a, b) => a - b));
  }
  return components;
}

export function gridDistances(gridSize, traversableMask, sourceIndices) {
  const cellCount = gridSize * gridSize, distances = new Float64Array(cellCount);
  distances.fill(Infinity);
  const heap = new MinHeap();
  for (const source of sourceIndices) {
    if (!Number.isInteger(source) || source < 0 || source >= cellCount) throw new RangeError(`Invalid source cell: ${source}`);
    if (traversableMask && !traversableMask[source]) continue;
    if (distances[source] === 0) continue;
    distances[source] = 0;
    heap.push(0, source);
  }
  while (heap.length) {
    const [distance, current] = heap.pop();
    if (distance !== distances[current]) continue;
    for (const next of neighbors(current, gridSize)) {
      if (traversableMask && !traversableMask[next]) continue;
      const step = diagonal(current, next, gridSize) ? Math.SQRT2 : 1;
      const candidate = distance + step;
      if (candidate >= distances[next]) continue;
      distances[next] = candidate;
      heap.push(candidate, next);
    }
  }
  return distances;
}

export function rasterizeRibbon(centerline, gridSize) {
  const mask = new Uint8Array(gridSize * gridSize);
  for (const node of centerline) {
    const radiusCells = node.halfWidth * (gridSize - 1);
    const centerColumn = node.index % gridSize, centerRow = Math.floor(node.index / gridSize);
    const reach = Math.ceil(radiusCells);
    for (let row = Math.max(0, centerRow - reach); row <= Math.min(gridSize - 1, centerRow + reach); row += 1) {
      for (let column = Math.max(0, centerColumn - reach); column <= Math.min(gridSize - 1, centerColumn + reach); column += 1) {
        if (Math.hypot(column - centerColumn, row - centerRow) <= radiusCells + 1e-9) mask[row * gridSize + column] = 1;
      }
    }
  }
  return mask;
}

export function makeCenterline(indices, distances, halfWidthRange, gridSize) {
  return [...indices].sort((a, b) => a - b).map(index => ({ index,
    halfWidth: Math.max(halfWidthRange[0], Math.min(halfWidthRange[1], distances[index] / (gridSize - 1))) }));
}

export function maskOverlap(mask, priorUnion) {
  if (mask.length !== priorUnion.length) throw new RangeError('Masks must have equal lengths');
  let area = 0, overlap = 0;
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) {
    area += 1;
    if (priorUnion[index]) overlap += 1;
  }
  return { areaCells: area, priorOverlapCells: overlap, newAreaCells: area - overlap,
    priorOverlapFraction: area ? overlap / area : null, newAreaFraction: area ? (area - overlap) / area : null };
}

export function angularMetrics(indices, gridSize, origin) {
  if (!indices.length) return { angularSpanRad: null, meanRadius: null, radialAlignment: null };
  const TAU = Math.PI * 2;
  const angles = indices.map(index => {
    const x = (index % gridSize) / (gridSize - 1), y = Math.floor(index / gridSize) / (gridSize - 1);
    return (Math.atan2(y - origin.y, x - origin.x) + TAU) % TAU;
  }).sort((a, b) => a - b);
  let largestGap = angles[0] + TAU - angles.at(-1);
  for (let index = 1; index < angles.length; index += 1) largestGap = Math.max(largestGap, angles[index] - angles[index - 1]);
  const radii = indices.map(index => Math.hypot(index % gridSize / (gridSize - 1) - origin.x,
    Math.floor(index / gridSize) / (gridSize - 1) - origin.y));
  const selected = new Uint8Array(gridSize * gridSize);
  for (const index of indices) selected[index] = 1;
  let aligned = 0, edges = 0;
  for (const index of indices) {
    const x = index % gridSize, y = Math.floor(index / gridSize);
    for (const [dx, dy] of [[-1, 1], [0, 1], [1, 1], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize || !selected[ny * gridSize + nx]) continue;
      const edgeLength = Math.hypot(dx, dy), mx = (x + nx) / 2 / (gridSize - 1) - origin.x;
      const my = (y + ny) / 2 / (gridSize - 1) - origin.y, radius = Math.hypot(mx, my);
      if (radius) aligned += Math.abs((dx * mx + dy * my) / (edgeLength * radius));
      edges += 1;
    }
  }
  return { angularSpanRad: angles.length < 2 ? 0 : TAU - largestGap,
    meanRadius: radii.reduce((sum, value) => sum + value, 0) / radii.length,
    radialAlignment: edges ? aligned / edges : null };
}

export function summarizeValues(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, min: null, p10: null, median: null, p90: null, max: null, mean: null };
  const quantile = q => {
    const position = q * (sorted.length - 1), lower = Math.floor(position), upper = Math.ceil(position);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return { count: sorted.length, min: sorted[0], p10: quantile(0.1), median: quantile(0.5),
    p90: quantile(0.9), max: sorted.at(-1), mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length };
}

export function pearsonCorrelation(left, right) {
  if (left.length !== right.length || left.length < 2) return null;
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;
  let cross = 0, leftSquare = 0, rightSquare = 0;
  for (let index = 0; index < left.length; index += 1) {
    const dx = left[index] - meanLeft, dy = right[index] - meanRight;
    cross += dx * dy; leftSquare += dx * dx; rightSquare += dy * dy;
  }
  return leftSquare && rightSquare ? cross / Math.sqrt(leftSquare * rightSquare) : null;
}

export function assertFiniteTree(value, path = 'root') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite value at ${path}`);
  } else if (ArrayBuffer.isView(value)) {
    for (let index = 0; index < value.length; index += 1) assertFiniteTree(value[index], `${path}[${index}]`);
  } else if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) assertFiniteTree(value[index], `${path}[${index}]`);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) assertFiniteTree(child, `${path}.${key}`);
  }
}

export function orInto(target, source) {
  if (target.length !== source.length) throw new RangeError('Masks must have equal lengths');
  for (let index = 0; index < target.length; index += 1) if (source[index]) target[index] = 1;
  return target;
}

function neighbors(index, gridSize) {
  const x = index % gridSize, y = Math.floor(index / gridSize), result = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) result.push(ny * gridSize + nx);
  }
  return result;
}

function diagonal(left, right, gridSize) {
  return Math.abs(left % gridSize - right % gridSize) === 1
    && Math.abs(Math.floor(left / gridSize) - Math.floor(right / gridSize)) === 1;
}

class MinHeap {
  items = [];
  get length() { return this.items.length; }
  push(distance, index) {
    const item = [distance, index];
    this.items.push(item);
    let child = this.items.length - 1;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (compare(this.items[parent], item) <= 0) break;
      this.items[child] = this.items[parent]; child = parent;
    }
    this.items[child] = item;
  }
  pop() {
    const first = this.items[0], tail = this.items.pop();
    if (this.items.length) {
      let parent = 0;
      while (true) {
        const left = parent * 2 + 1, right = left + 1;
        if (left >= this.items.length) break;
        const child = right < this.items.length && compare(this.items[right], this.items[left]) < 0 ? right : left;
        if (compare(this.items[child], tail) >= 0) break;
        this.items[parent] = this.items[child]; parent = child;
      }
      this.items[parent] = tail;
    }
    return first;
  }
}

function compare(left, right) { return left[0] - right[0] || left[1] - right[1]; }
