export const COLONY_ORIGIN = Object.freeze({ x: 0.5, y: 0.72 });
export const ACTIVATION_RADII = Object.freeze([0.06, 0.09, 0.12]);
export const ACTIVATION_SECTOR_COUNT = 16;
export const ACTIVATION_HALF_SATURATION = 0.04;
export const ACTIVATION_FLOOR = 8;
export const ACTIVATION_CEILING = 28;
export const ACTIVATION_TIME_CONSTANT_SECONDS = 45;

const TAU = Math.PI * 2;

/** Measures sustained pheromone activity around the entry region. */
export class ColonyActivation {
  constructor({ floor = ACTIVATION_FLOOR, ceiling = ACTIVATION_CEILING,
    timeConstantSeconds = ACTIVATION_TIME_CONSTANT_SECONDS, origin = COLONY_ORIGIN } = {}) {
    this.floor = finiteNumber(floor) ? Math.max(0, Math.floor(floor)) : ACTIVATION_FLOOR;
    this.ceiling = normalizeCeiling(ceiling);
    this.floor = Math.min(this.floor, this.ceiling);
    this.timeConstantSeconds = finiteNumber(timeConstantSeconds) && timeConstantSeconds > 0
      ? timeConstantSeconds : ACTIVATION_TIME_CONSTANT_SECONDS;
    this.origin = validPoint(origin) ? { x: origin.x, y: origin.y } : { ...COLONY_ORIGIN };
    this.reset();
  }

  /** Sample spatial evidence and smoothly track it using simulation time. */
  advance(field, dtSeconds) {
    if (finiteNumber(dtSeconds) && dtSeconds > 0) {
      this.evidence = measureEvidence(field, this.origin);
      const alpha = 1 - Math.exp(-dtSeconds / this.timeConstantSeconds);
      this.activation = clamp(this.activation + (this.evidence - this.activation) * alpha, 0, 1);
    }
    return this.getSnapshot();
  }

  configure({ ceiling } = {}) {
    if (ceiling !== undefined) this.ceiling = normalizeCeiling(ceiling);
    this.floor = Math.min(this.floor, this.ceiling);
    return this.getSnapshot();
  }

  getSnapshot() {
    const desiredPopulation = this.floor + (this.ceiling - this.floor) * this.activation;
    return {
      evidence: this.evidence,
      activation: this.activation,
      desiredPopulation,
      recruitmentLimit: Math.floor(desiredPopulation + 1e-9)
    };
  }

  reset() {
    this.evidence = 0;
    this.activation = 0;
    return this.getSnapshot();
  }
}

function measureEvidence(field, origin) {
  if (!field || typeof field.sample !== 'function') return 0;
  const sectors = [];
  for (let sector = 0; sector < ACTIVATION_SECTOR_COUNT; sector += 1) {
    const angle = TAU * sector / ACTIVATION_SECTOR_COUNT;
    let total = 0;
    for (const radius of ACTIVATION_RADII) {
      const value = field.sample(origin.x + Math.cos(angle) * radius,
        origin.y + Math.sin(angle) * radius);
      const positive = finiteNumber(value) ? Math.max(0, value) : 0;
      total += positive / (positive + ACTIVATION_HALF_SATURATION);
    }
    sectors.push(total / ACTIVATION_RADII.length);
  }
  sectors.sort((a, b) => b - a);
  return clamp(sectors.slice(0, 4).reduce((sum, value) => sum + value, 0) / 4, 0, 1);
}

function normalizeCeiling(value) {
  const integer = finiteNumber(value) ? Math.floor(value) : ACTIVATION_CEILING;
  return Math.min(100, Math.max(ACTIVATION_FLOOR, integer));
}
function validPoint(point) { return finiteNumber(point?.x) && finiteNumber(point?.y); }
function finiteNumber(value) { return Number.isFinite(value); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
