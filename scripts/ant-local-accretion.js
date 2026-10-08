import {
  TRAIL_PLATE_CHEMICAL_THRESHOLD,
  TRAIL_PLATE_GRID_SIZE,
  TRAIL_PLATE_PERSISTENCE_SECONDS,
  TRAIL_PLATE_SUPPORT_THRESHOLD
} from '../src/lib/agents/ant/TrailPlateBirth.js';

// Input-integrity bound for archived 1 Hz rows plus one 60 Hz tick; not formation tuning.
const MAX_SAMPLE_GAP_SECONDS = 1 + 1 / 60 + 1e-9;

export class AntLocalAccretion {
  constructor({ width = TRAIL_PLATE_GRID_SIZE, height = TRAIL_PLATE_GRID_SIZE } = {}) {
    if (!Number.isSafeInteger(width) || width < 2 || width > 512
      || !Number.isSafeInteger(height) || height < 2 || height > 512) {
      throw new RangeError('width and height must be integers from 2 through 512');
    }
    this.width = width;
    this.height = height;
    this.state = new Float64Array(width * height);
    this.state.fill(-1);
    this.lastTimeSeconds = null;
    this.episodes = [];
  }

  advance({ chemicalMemory, mechanicalSupport, countDistinctContactTimes, timeSeconds } = {}) {
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0
      || (this.lastTimeSeconds !== null && timeSeconds < this.lastTimeSeconds)) {
      throw new RangeError('timeSeconds must be finite, nonnegative, and nondecreasing');
    }
    if (this.lastTimeSeconds !== null && timeSeconds - this.lastTimeSeconds > MAX_SAMPLE_GAP_SECONDS) {
      throw new RangeError(`sample gap must not exceed ${MAX_SAMPLE_GAP_SECONDS} seconds`);
    }
    const count = this.state.length;
    validateSamples(chemicalMemory, count, 'chemicalMemory', 0, 1);
    validateSamples(mechanicalSupport, count, 'mechanicalSupport', 0, 1);
    validateSamples(countDistinctContactTimes, count, 'countDistinctContactTimes', 0, 2, true);

    const elapsed = this.lastTimeSeconds === null ? 0 : timeSeconds - this.lastTimeSeconds;
    const matured = [];
    for (let index = 0; index < count; index += 1) {
      if (chemicalMemory[index] < TRAIL_PLATE_CHEMICAL_THRESHOLD
        || mechanicalSupport[index] < TRAIL_PLATE_SUPPORT_THRESHOLD
        || countDistinctContactTimes[index] < 2) {
        this.state[index] = -1;
        continue;
      }
      if (this.state[index] < 0) this.state[index] = 0;
      else if (this.state[index] < TRAIL_PLATE_PERSISTENCE_SECONDS) {
        this.state[index] = Math.min(TRAIL_PLATE_PERSISTENCE_SECONDS, this.state[index] + elapsed);
        if (this.state[index] === TRAIL_PLATE_PERSISTENCE_SECONDS) matured.push(index);
      }
    }
    this.lastTimeSeconds = timeSeconds;
    if (!matured.length) return null;

    const episode = Object.freeze({ timeSeconds, cellIndices: Object.freeze(matured) });
    this.episodes.push(episode);
    return episode;
  }

  getSnapshot() {
    return Object.freeze({
      width: this.width,
      height: this.height,
      lastTimeSeconds: this.lastTimeSeconds,
      state: Object.freeze(Array.from(this.state)),
      episodes: Object.freeze(this.episodes.slice())
    });
  }
}

function validateSamples(values, expectedLength, name, minimum, maximum, integer = false) {
  if (!values || !Number.isSafeInteger(values.length) || values.length !== expectedLength) {
    throw new RangeError(`${name} length must equal width * height (${expectedLength})`);
  }
  for (let index = 0; index < expectedLength; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
      throw new RangeError(`${name}[${index}] must be ${integer ? 'an integer ' : ''}from ${minimum} through ${maximum}`);
    }
  }
}
