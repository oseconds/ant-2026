const GRID_SIZE = 96;
const CELL_COUNT = GRID_SIZE ** 2;
const MATERIAL = Object.freeze({ stiffness: 0.9, density: 1.1, damping: 0.35 });

export function createResearchLocalPlate(decision, serial) {
  if (!Number.isSafeInteger(serial) || serial < 1) throw new RangeError('serial must be a positive safe integer.');
  if (!decision || !Number.isFinite(decision.timeMs) || decision.timeMs < 0) {
    throw new TypeError('decision.timeMs must be finite and non-negative.');
  }
  if (!Array.isArray(decision.xCells) || !decision.xCells.length) {
    throw new TypeError('decision.xCells must be a non-empty sorted array.');
  }
  let prior = -1;
  for (const index of decision.xCells) {
    if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT || index <= prior) {
      throw new RangeError('decision.xCells must contain sorted unique grid indices.');
    }
    prior = index;
  }
  if (![['B'], ['C'], ['B', 'C']].some(channels => sameValues(decision.provenance, channels))) {
    throw new TypeError('decision.provenance must be B, C, or B then C.');
  }
  if (!Array.isArray(decision.eventIds) || !decision.eventIds.every(id => typeof id === 'string')) {
    throw new TypeError('decision.eventIds must be an array of strings.');
  }
  if (!connected8(decision.xCells)) throw new TypeError('decision.xCells must be 8-neighbor connected.');

  const mask = new Array(CELL_COUNT).fill(0);
  for (const index of decision.xCells) mask[index] = 1;
  const pickup = index => ({ x: (index % GRID_SIZE) / (GRID_SIZE - 1),
    y: Math.floor(index / GRID_SIZE) / (GRID_SIZE - 1) });
  return {
    id: `research-local-X-${String(serial).padStart(4, '0')}`,
    bornAtSimulationTimeMs: decision.timeMs,
    grid: { width: GRID_SIZE, height: GRID_SIZE },
    mask,
    edges: [],
    pickups: [pickup(decision.xCells[0]), pickup(decision.xCells.at(-1))],
    material: { ...MATERIAL },
    provenance: { kind: 'research-local-singleton-X', channels: [...decision.provenance],
      eventIds: [...decision.eventIds] }
  };
}

function sameValues(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function connected8(indices) {
  const remaining = new Set(indices);
  const reached = [remaining.values().next().value];
  remaining.delete(reached[0]);
  for (let cursor = 0; cursor < reached.length; cursor += 1) {
    const index = reached[cursor], x = index % GRID_SIZE, y = Math.floor(index / GRID_SIZE);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
      const neighbor = ny * GRID_SIZE + nx;
      if (remaining.delete(neighbor)) reached.push(neighbor);
    }
  }
  return remaining.size === 0;
}
