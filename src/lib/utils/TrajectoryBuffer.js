/**
 * Timestamped, normalized 2D trajectory history backed by a fixed-size ring.
 * Coordinates are clamped to [0, 1]. Timestamps are milliseconds and must be
 * monotonic; pushing the latest timestamp again replaces that sample.
 */
export class TrajectoryBuffer {
  #samples;
  #start = 0;
  #size = 0;
  #frozen = false;

  constructor({ capacity = 301 } = {}) {
    if (!Number.isInteger(capacity) || capacity < 2) {
      throw new RangeError('TrajectoryBuffer capacity must be an integer of at least 2.');
    }
    this.#samples = new Array(capacity);
  }

  get capacity() { return this.#samples.length; }
  get size() { return this.#size; }
  get durationMs() {
    if (this.#size < 2) return 0;
    return this.latest.timestamp - this.oldest.timestamp;
  }
  get oldest() { return this.#size ? this.#at(0) : null; }
  get latest() { return this.#size ? this.#at(this.#size - 1) : null; }

  push({ timestamp, x, y } = {}) {
    this.#assertMutable();
    if (![timestamp, x, y].every(Number.isFinite)) {
      throw new TypeError('A trajectory sample requires finite timestamp, x and y values.');
    }
    const latest = this.latest;
    if (latest && timestamp < latest.timestamp) {
      throw new RangeError('Trajectory timestamps must be monotonic.');
    }
    const sample = { timestamp, x: clamp01(x), y: clamp01(y) };
    if (latest && timestamp === latest.timestamp) {
      this.#samples[this.#index(this.#size - 1)] = sample;
      return { ...sample };
    }
    if (this.#size < this.capacity) {
      this.#samples[this.#index(this.#size)] = sample;
      this.#size += 1;
    } else {
      this.#samples[this.#start] = sample;
      this.#start = (this.#start + 1) % this.capacity;
    }
    return { ...sample };
  }

  /** Sample history at an absolute timestamp, linearly interpolating neighbors. */
  sample(timestamp, { loop = false } = {}) {
    if (!Number.isFinite(timestamp)) throw new TypeError('Sample timestamp must be finite.');
    if (!this.#size) return null;
    if (this.#size === 1) return this.oldest;

    const first = this.#at(0);
    const last = this.#at(this.#size - 1);
    let target = timestamp;
    if (loop) {
      const period = this.durationMs + this.#nominalInterval();
      if (period > 0) {
        target = first.timestamp + positiveModulo(timestamp - first.timestamp, period);
        if (target > last.timestamp) {
          const amount = (target - last.timestamp) / (first.timestamp + period - last.timestamp);
          return interpolate(last, first, amount, target);
        }
      }
    } else {
      if (target <= first.timestamp) return { ...first };
      if (target >= last.timestamp) return { ...last };
    }

    if (target <= first.timestamp) return { ...first };
    if (target >= last.timestamp) return { ...last };

    let low = 0;
    let high = this.#size - 1;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (this.#at(mid).timestamp <= target) low = mid;
      else high = mid;
    }
    const before = this.#at(low);
    const after = this.#at(high);
    const amount = (target - before.timestamp) / (after.timestamp - before.timestamp);
    return interpolate(before, after, amount, target);
  }

  sampleDelayed(now, delayMs, options) {
    if (!Number.isFinite(now) || !Number.isFinite(delayMs) || delayMs < 0) {
      throw new TypeError('Delayed sampling requires a finite time and a non-negative finite delay.');
    }
    return this.sample(now - delayMs, options);
  }

  /** Return chronological, detached plain samples. */
  toArray() {
    return Array.from({ length: this.#size }, (_, index) => this.#at(index));
  }

  /** Create an independent, read-only copy suitable for frozen playback. */
  snapshot() {
    const copy = new TrajectoryBuffer({ capacity: Math.max(2, this.#size) });
    for (const sample of this.toArray()) copy.push(sample);
    copy.#frozen = true;
    Object.freeze(copy.#samples);
    Object.freeze(copy);
    return copy;
  }

  clear() {
    this.#assertMutable();
    this.#samples = new Array(this.capacity);
    this.#start = 0;
    this.#size = 0;
  }

  #index(chronologicalIndex) { return (this.#start + chronologicalIndex) % this.capacity; }
  #at(index) { return { ...this.#samples[this.#index(index)] }; }
  #nominalInterval() {
    if (this.#size < 2) return 0;
    const last = this.#at(this.#size - 1).timestamp;
    const previous = this.#at(this.#size - 2).timestamp;
    return last - previous;
  }
  #assertMutable() {
    if (this.#frozen) throw new TypeError('A trajectory snapshot is read-only.');
  }
}

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function positiveModulo(value, modulus) { return ((value % modulus) + modulus) % modulus; }
function interpolate(from, to, amount, timestamp) {
  return {
    timestamp,
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount
  };
}
