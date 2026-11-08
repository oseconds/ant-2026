export const STEP = 1 / 60;
export const DEFAULT_SEED = 20261005;

export function seedValue(value) {
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Seed must be an integer between 0 and 4294967295.');
  }
  return seed;
}

export function randomStream(seed) {
  let state = seedValue(seed) >>> 0;
  return {
    next() { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; },
    state() { return state; }
  };
}

export function lattice(size) {
  const positions = [], edges = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    positions.push([(x + 0.5) / size, (y + 0.5) / size]);
    if (x + 1 < size) edges.push([i, i + 1]);
    if (y + 1 < size) edges.push([i, i + size]);
  }
  return { positions, edges };
}

export function stateDigest(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash.toString(16).padStart(8, '0');
}
