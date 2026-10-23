const MIN_RADIUS = 0.018;
const MAX_RADIUS = 0.085;
const MIN_SPEED = 0.008;
const MIN_ANTS = 3;
const MIN_RESULTANT = 1e-9;
const SPAWN_HEADING_SPREAD = 0.3;
const TAU = Math.PI * 2;

export function measureOutgoingFlow(segments, { dt = 1 / 60, origin = { x: 0.5, y: 0.72 } } = {}) {
  if (!Array.isArray(segments) || !Number.isFinite(dt) || dt <= 0
    || !Number.isFinite(origin?.x) || !Number.isFinite(origin?.y)) return invalidFlow(0, 'invalid-input');

  let x = 0, y = 0, count = 0;
  const seen = new Set();
  for (const segment of segments) {
    const id = segment?.id;
    if (!validId(id) || seen.has(id)) continue;
    seen.add(id);
    const { from, to } = segment;
    if (!validPoint(from) || !validPoint(to)) continue;

    const dx = to.x - from.x, dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const midpointX = (from.x + to.x) * 0.5 - origin.x;
    const midpointY = (from.y + to.y) * 0.5 - origin.y;
    const radius = Math.hypot(midpointX, midpointY);
    if (!(radius > MIN_RADIUS && radius <= MAX_RADIUS)
      || distance / dt < MIN_SPEED || midpointX * dx + midpointY * dy <= 0) continue;

    x += dx / distance;
    y += dy / distance;
    count += 1;
  }

  if (count < MIN_ANTS) return invalidFlow(count, 'insufficient-count');
  const q = { x: x / count, y: y / count };
  const R = Math.min(1, Math.hypot(q.x, q.y));
  if (R <= MIN_RESULTANT) return invalidFlow(count, 'zero-resultant');
  return { valid: true, count, q, R, phi: Math.atan2(q.y, q.x), reason: null };
}

export function flowRecruitHeading(flow, U) {
  if (!Number.isFinite(U) || U < 0 || U >= 1) throw new RangeError('U must be in [0, 1).');
  if (flow?.valid !== true || !Number.isFinite(flow.R) || flow.R <= MIN_RESULTANT
    || flow.R > 1 || !Number.isFinite(flow.phi)) return -Math.PI + TAU * U;

  const spread = Math.PI - (Math.PI - SPAWN_HEADING_SPREAD) * flow.R;
  return wrapAngle(flow.phi + (2 * U - 1) * spread);
}

function invalidFlow(count, reason) {
  return { valid: false, count, q: { x: 0, y: 0 }, R: 0, phi: null, reason };
}

function validId(value) {
  return (typeof value === 'string' && value.length > 0)
    || (typeof value === 'number' && Number.isFinite(value));
}

function validPoint(value) {
  return Number.isFinite(value?.x) && Number.isFinite(value?.y);
}

function wrapAngle(value) {
  return ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
}
