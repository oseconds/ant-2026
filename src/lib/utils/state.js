/** JSON settings helpers. Runtime objects must never pass through this module. */
export function cloneState(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(cloneState);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneState(entry)]));
  }
  throw new TypeError('Settings must contain only finite numbers, strings, booleans, null, arrays and plain objects.');
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

export function mergeState(current, patch = {}) {
  if (!isPlainObject(patch)) throw new TypeError('A settings patch must be a plain object.');
  const result = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new TypeError('Invalid settings key.');
    if (value === undefined) continue;
    if (value !== null && typeof value === 'object' && !isPlainObject(value) && !Array.isArray(value)) {
      throw new TypeError('Runtime resources cannot be stored in settings.');
    }
    result[key] = isPlainObject(value) ? mergeState(isPlainObject(current[key]) ? current[key] : {}, value)
      : Array.isArray(value) ? value.map(cloneState) : value;
  }
  return result;
}

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, min, max) : fallback;
}

export function normalizePoint2(position, fallback = { x: 0, y: 0 }, radius = 0.92) {
  const x = boundedNumber(Array.isArray(position) ? position[0] : position?.x, -1, 1, fallback.x);
  const y = boundedNumber(Array.isArray(position) ? position[1] : position?.y, -1, 1, fallback.y);
  const scale = Math.max(1, Math.hypot(x, y) / radius);
  return { x: x / scale, y: y / scale };
}

export function normalizePoint3(position, fallback = { x: 0, y: 0, z: 1 }) {
  const point = Array.isArray(position) ? { x: position[0], y: position[1], z: position[2] } : position;
  const x = boundedNumber(point?.x, -1, 1, fallback.x);
  const y = boundedNumber(point?.y, -1, 1, fallback.y);
  const z = boundedNumber(point?.z, -1, 1, fallback.z);
  const length = Math.hypot(x, y, z);
  return length > 1e-12 ? { x: x / length, y: y / length, z: z / length } : normalizePoint3(fallback, { x: 0, y: 0, z: 1 });
}
