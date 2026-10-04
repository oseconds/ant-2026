const DEFAULT_WIDTH = 96;
const DEFAULT_HEIGHT = 96;
const DEFAULT_HALF_LIFE_SECONDS = 14;
const DEFAULT_MAX_VALUE = 8;
const DEFAULT_AMOUNT_PER_UNIT_DISTANCE = 6;
const DEFAULT_RADIUS = 0.009;
const LN_TWO = Math.LN2;

/**
 * A framework-independent, normalized 2D field for shared environmental memory.
 * Time is explicit: callers decide when and how much the field decays.
 */
export class PheromoneField {
  constructor({
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    decayHalfLifeSeconds = DEFAULT_HALF_LIFE_SECONDS,
    maxValue = DEFAULT_MAX_VALUE
  } = {}) {
    this.width = integerInRange(width, 2, 512, 'width');
    this.height = integerInRange(height, 2, 512, 'height');
    this.decayHalfLifeSeconds = positiveFinite(decayHalfLifeSeconds, 'decayHalfLifeSeconds');
    this.maxValue = positiveFinite(maxValue, 'maxValue');
    this.values = new Float32Array(this.width * this.height);
  }

  clear() {
    this.values.fill(0);
  }

  /** Bilinear sample in normalized coordinates, clamped at field edges. */
  sample(x, y) {
    x = coordinate(x, 'x');
    y = coordinate(y, 'y');
    const gx = clamp01(x) * (this.width - 1);
    const gy = clamp01(y) * (this.height - 1);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = Math.min(this.width - 1, x0 + 1);
    const y1 = Math.min(this.height - 1, y0 + 1);
    const tx = gx - x0;
    const ty = gy - y0;
    const top = mix(this.at(x0, y0), this.at(x1, y0), tx);
    const bottom = mix(this.at(x0, y1), this.at(x1, y1), tx);
    return mix(top, bottom, ty);
  }

  /**
   * Deposit along a traveled segment. Amount is proportional to distance,
   * independent of elapsed time and approximately independent of frame rate.
   * The Gaussian brush distributes each length slice across nearby cells.
   */
  depositSegment(from, to, {
    amountPerUnitDistance = DEFAULT_AMOUNT_PER_UNIT_DISTANCE,
    radius = DEFAULT_RADIUS
  } = {}) {
    const start = point(from, 'from');
    const end = point(to, 'to');
    amountPerUnitDistance = nonNegativeFinite(amountPerUnitDistance, 'amountPerUnitDistance');
    radius = positiveFinite(radius, 'radius');

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || amountPerUnitDistance === 0) return 0;

    // Midpoint integration with a step no larger than half a grid cell.
    const cellSize = Math.min(1 / (this.width - 1), 1 / (this.height - 1));
    const stepSize = cellSize * 0.5;
    const sampleCount = Math.max(1, Math.ceil(distance / stepSize));
    const totalAmount = distance * amountPerUnitDistance;
    const sliceAmount = totalAmount / sampleCount;
    const sigma = radius * 0.5;
    const support = radius;

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const t = (sampleIndex + 0.5) / sampleCount;
      this.depositBrush(start.x + dx * t, start.y + dy * t, sliceAmount, radius, sigma, support);
    }
    return totalAmount;
  }

  /** Exponential decay; equal elapsed time produces equal remaining signal. */
  decay(dtSeconds) {
    dtSeconds = nonNegativeFinite(dtSeconds, 'dtSeconds');
    if (dtSeconds === 0) return;
    const factor = Math.exp(-LN_TWO * dtSeconds / this.decayHalfLifeSeconds);
    for (let index = 0; index < this.values.length; index += 1) {
      this.values[index] = Math.min(this.maxValue, this.values[index] * factor);
    }
  }

  /** Returns detached typed data for renderers or diagnostics. */
  getSnapshot() {
    const values = this.values.slice();
    let totalMass = 0;
    for (let index = 0; index < values.length; index += 1) totalMass += values[index];
    return {
      width: this.width,
      height: this.height,
      values,
      maxValue: this.maxValue,
      totalMass
    };
  }

  depositBrush(x, y, amount, radius, sigma, support) {
    const gx = clamp01(x) * (this.width - 1);
    const gy = clamp01(y) * (this.height - 1);
    const radiusX = Math.ceil(support * (this.width - 1));
    const radiusY = Math.ceil(support * (this.height - 1));
    const minX = Math.max(0, Math.floor(gx - radiusX));
    const maxX = Math.min(this.width - 1, Math.ceil(gx + radiusX));
    const minY = Math.max(0, Math.floor(gy - radiusY));
    const maxY = Math.min(this.height - 1, Math.ceil(gy + radiusY));
    const sigmaSquared = sigma * sigma;
    const weights = [];
    let weightTotal = 0;

    for (let row = minY; row <= maxY; row += 1) {
      const ny = row / (this.height - 1);
      for (let column = minX; column <= maxX; column += 1) {
        const nx = column / (this.width - 1);
        const distance = Math.hypot(nx - x, ny - y);
        if (distance > radius) continue;
        const weight = Math.exp(-(distance * distance) / (2 * sigmaSquared));
        if (weight <= 0) continue;
        weights.push([row * this.width + column, weight]);
        weightTotal += weight;
      }
    }

    // The nearest grid cell is always within half a diagonal cell from the
    // clamped point, but retain a fallback for very small requested radii.
    if (weightTotal === 0) {
      const index = Math.round(gy) * this.width + Math.round(gx);
      this.values[index] = Math.min(this.maxValue, this.values[index] + amount);
      return;
    }

    for (const [index, weight] of weights) {
      this.values[index] = Math.min(this.maxValue, this.values[index] + amount * weight / weightTotal);
    }
  }

  at(x, y) {
    return this.values[y * this.width + x];
  }
}

function point(value, name) {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} must contain finite x and y coordinates.`);
  return { x: clamp01(coordinate(value.x, `${name}.x`)), y: clamp01(coordinate(value.y, `${name}.y`)) };
}

function coordinate(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
  return value;
}

function positiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and greater than zero.`);
  return value;
}

function nonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative.`);
  return value;
}

function integerInRange(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}
