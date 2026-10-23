const DEFAULT_WIDTH = 96;
const DEFAULT_HEIGHT = 96;
const DEFAULT_HALF_LIFE_SECONDS = 1800;
const DEFAULT_CONTACT_DOSE = 0.025;
const DEFAULT_RADIUS = 0.012;
const MIN_FOOTPRINT_RADIUS = 0.009;
const MAX_FOOTPRINT_RADIUS = 0.014;
const LN_TWO = Math.LN2;
const SUPPORT_DIRECTIONS = 8;

/**
 * Shared, slowly relaxing material memory driven only by individual foot contacts.
 * Values represent normalized compaction/hardness in the observed 0–1 domain.
 */
export class SurfaceField {
  constructor({
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    halfLifeSeconds = DEFAULT_HALF_LIFE_SECONDS,
    contactDose = DEFAULT_CONTACT_DOSE,
    radius = DEFAULT_RADIUS
  } = {}) {
    this.width = integerInRange(width, 2, 512, 'width');
    this.height = integerInRange(height, 2, 512, 'height');
    this.halfLifeSeconds = positiveFinite(halfLifeSeconds, 'halfLifeSeconds');
    this.contactDose = unitInterval(contactDose, 'contactDose', true);
    this.radius = positiveFinite(radius, 'radius');
    this.values = new Float32Array(this.width * this.height);
    this.totalFootContacts = 0;
  }

  clear() {
    this.values.fill(0);
    this.totalFootContacts = 0;
  }

  /** Apply each valid contact point independently; event centroid/strength are ignored. */
  applyFootContact(event) {
    if (event?.type !== 'FOOT_CONTACT' || !Array.isArray(event.contacts)) return [];
    const responses = [];
    for (const contact of event.contacts) {
      if (typeof contact?.legId !== 'string' || !contact.legId || !validPoint(contact.position)) continue;
      const { x, y } = contact.position;
      if (x < 0 || x > 1 || y < 0 || y > 1) continue;

      const compaction = this.sample(x, y);
      responses.push({
        legId: contact.legId,
        position: { x, y },
        compaction,
        hardness: compaction,
        footprintRadius: MAX_FOOTPRINT_RADIUS
          - (MAX_FOOTPRINT_RADIUS - MIN_FOOTPRINT_RADIUS) * compaction,
        strengthTransfer: 0.95 + 0.1 * compaction
      });
      this.depositContact(x, y);
      this.totalFootContacts += 1;
    }
    return responses;
  }

  /** Relax compaction by elapsed simulation time, independent of wall clock. */
  relax(dtSeconds) {
    dtSeconds = nonNegativeFinite(dtSeconds, 'dtSeconds');
    if (dtSeconds === 0) return;
    const multiplier = Math.exp(-LN_TWO * dtSeconds / this.halfLifeSeconds);
    for (let index = 0; index < this.values.length; index += 1) {
      this.values[index] = clamp01(this.values[index] * multiplier);
    }
  }

  /** Bilinear sample of compaction; points outside the observed square are empty. */
  sample(x, y) {
    x = finiteNumber(x, 'x');
    y = finiteNumber(y, 'y');
    if (x < 0 || x > 1 || y < 0 || y > 1) return 0;
    const gx = x * (this.width - 1);
    const gy = y * (this.height - 1);
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const x1 = Math.min(this.width - 1, x0 + 1);
    const y1 = Math.min(this.height - 1, y0 + 1);
    const tx = gx - x0, ty = gy - y0;
    const top = mix(this.values[y0 * this.width + x0], this.values[y0 * this.width + x1], tx);
    const bottom = mix(this.values[y1 * this.width + x0], this.values[y1 * this.width + x1], tx);
    return clamp01(mix(top, bottom, ty));
  }

  /** Center-weighted scalar compaction across a local support disk. */
  sampleSupport(x, y, radius = 0.025) {
    x = finiteNumber(x, 'x');
    y = finiteNumber(y, 'y');
    radius = positiveFinite(radius, 'radius');
    const centerValue = this.sample(x, y);
    const sigma = radius * 0.5;
    let weightedSum = centerValue;
    let totalWeight = 1;
    for (let direction = 0; direction < SUPPORT_DIRECTIONS; direction += 1) {
      const angle = Math.PI * 2 * direction / SUPPORT_DIRECTIONS;
      for (const radialScale of [0.5, 1]) {
        const distance = radius * radialScale;
        const value = this.sample(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance);
        const weight = Math.exp(-0.5 * (distance / sigma) ** 2);
        weightedSum += value * weight;
        totalWeight += weight;
      }
    }
    return clamp01(weightedSum / totalWeight);
  }

  getSnapshot() {
    let maxValue = 0;
    let totalMass = 0;
    for (const value of this.values) {
      maxValue = Math.max(maxValue, value);
      totalMass += value;
    }
    return {
      width: this.width,
      height: this.height,
      values: this.values.slice(),
      maxValue,
      totalMass,
      totalFootContacts: this.totalFootContacts
    };
  }

  depositContact(x, y) {
    const gx = x * (this.width - 1);
    const gy = y * (this.height - 1);
    const radiusX = this.radius * (this.width - 1);
    const radiusY = this.radius * (this.height - 1);
    const minX = Math.max(0, Math.floor(gx - radiusX));
    const maxX = Math.min(this.width - 1, Math.ceil(gx + radiusX));
    const minY = Math.max(0, Math.floor(gy - radiusY));
    const maxY = Math.min(this.height - 1, Math.ceil(gy + radiusY));
    const sigma = this.radius * 0.5;
    let touched = false;
    for (let iy = minY; iy <= maxY; iy += 1) {
      const cellY = iy / (this.height - 1);
      for (let ix = minX; ix <= maxX; ix += 1) {
        const cellX = ix / (this.width - 1);
        const distance = Math.hypot(cellX - x, cellY - y);
        if (distance > this.radius) continue;
        const weight = Math.exp(-0.5 * (distance / sigma) ** 2);
        const index = iy * this.width + ix;
        this.values[index] = clamp01(this.values[index]
          + (1 - this.values[index]) * this.contactDose * weight);
        touched = true;
      }
    }
    // Small custom radii can fall between cell centers; still write to the
    // nearest in-domain cell instead of silently dropping an in-domain foot.
    if (!touched) {
      const ix = Math.max(0, Math.min(this.width - 1, Math.round(gx)));
      const iy = Math.max(0, Math.min(this.height - 1, Math.round(gy)));
      const index = iy * this.width + ix;
      this.values[index] = clamp01(this.values[index]
        + (1 - this.values[index]) * this.contactDose);
    }
  }
}

export default SurfaceField;

function integerInRange(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}
function positiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive.`);
  return value;
}
function nonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative.`);
  return value;
}
function finiteNumber(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
  return value;
}
function unitInterval(value, name, allowZero = false) {
  if (!Number.isFinite(value) || value < (allowZero ? 0 : Number.MIN_VALUE) || value > 1) {
    throw new RangeError(`${name} must be in ${allowZero ? '[0, 1]' : '(0, 1]'}.`);
  }
  return value;
}
function validPoint(point) { return point && Number.isFinite(point.x) && Number.isFinite(point.y); }
function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function mix(a, b, amount) { return a + (b - a) * amount; }
