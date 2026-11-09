import { ActivityInput } from './input.js';
import { DEFAULT_SEED, STEP, lattice, randomStream, seedValue } from '../sketchbook/common.js';

const SIZE = 12;
const DIFFUSION = 0.05;
const REACTION = 0.4;
const RECOVERY = 1 / 20;
const COUPLING_SEED_XOR = 0xa381de17;

function stats(phase, rate, age, edges, diffusion) {
  let energy = 0, meanPhase = 0, minPhase = Infinity, maxPhase = -Infinity;
  let meanAge = 0, minAge = Infinity, maxAge = -Infinity, minRate = Infinity, maxRate = -Infinity;
  for (let i = 0; i < phase.length; i++) {
    const p = phase[i], a = age[i], r = rate[i];
    meanPhase += p; minPhase = Math.min(minPhase, p); maxPhase = Math.max(maxPhase, p);
    meanAge += a; minAge = Math.min(minAge, a); maxAge = Math.max(maxAge, a);
    minRate = Math.min(minRate, r); maxRate = Math.max(maxRate, r);
  }
  for (const [i, j] of edges) energy += 0.5 * diffusion * (phase[i] - phase[j]) ** 2;
  for (const p of phase) energy += (REACTION / 4) * p * p * (1 - p) ** 2;
  return {
    energy, meanPhase: meanPhase / phase.length, minPhase, maxPhase,
    meanAge: meanAge / age.length, minAge, maxAge, minRate, maxRate
  };
}

export class LocalTimeWorld {
  constructor(seed = DEFAULT_SEED, { pattern = 'wander', coupling = true } = {}) {
    this.seed = seedValue(seed);
    this.config = { size: SIZE, pattern, coupling: Boolean(coupling), diffusion: DIFFUSION, reaction: REACTION, recovery: RECOVERY, clockGain: 4, initialPhase: [0.4, 0.6], seedXor: COUPLING_SEED_XOR };
    this.tick = 0;
    this.lattice = lattice(SIZE);
    this.input = new ActivityInput(this.seed, pattern, SIZE);
    this.condition = new Float64Array(SIZE * SIZE);
    this.initialRandom = randomStream((this.seed ^ COUPLING_SEED_XOR) >>> 0);
    const initial = Array.from({ length: SIZE * SIZE }, () => 0.5 + 0.1 * (2 * this.initialRandom.next() - 1));
    this.initialRNGstate = this.initialRandom.state();
    this.localPhase = Float64Array.from(initial);
    this.uniformPhase = Float64Array.from(initial);
    this.localAge = new Float64Array(SIZE * SIZE);
    this.uniformAge = new Float64Array(SIZE * SIZE);
    this.meanRate = 1;
    this.activity = new Float64Array(SIZE * SIZE);
  }

  step() {
    const activity = this.input.next(this.tick);
    if (!activity || activity.length !== this.condition.length) throw new RangeError('Activity input must match the lattice size.');
    this.activity.set(activity);
    const localRate = new Float64Array(this.condition.length);
    const uniformRate = new Float64Array(this.condition.length);
    let rateSum = 0;
    for (let i = 0; i < this.condition.length; i++) {
      const a = this.activity[i];
      this.condition[i] += STEP * (a * (1 - this.condition[i]) - this.condition[i] * RECOVERY);
      localRate[i] = 1 / (1 + 4 * this.condition[i]);
      rateSum += localRate[i];
    }
    const meanRate = rateSum / this.condition.length;
    uniformRate.fill(meanRate);
    this.meanRate = meanRate;
    this._advance(this.localPhase, this.localAge, localRate);
    this._advance(this.uniformPhase, this.uniformAge, uniformRate);
    this.tick++;
    return this;
  }

  _advance(phase, age, rate) {
    const delta = new Float64Array(phase.length);
    if (this.config.coupling) for (const [i, j] of this.lattice.edges) {
      const flux = DIFFUSION * (phase[j] - phase[i]);
      delta[i] += flux;
      delta[j] -= flux;
    }
    for (let i = 0; i < phase.length; i++) {
      const p = phase[i];
      delta[i] = STEP * rate[i] * (delta[i] + REACTION * p * (1 - p) * (p - 0.5));
      age[i] += STEP * rate[i];
    }
    for (let i = 0; i < phase.length; i++) phase[i] += delta[i];
  }

  view() {
    const localRate = Array.from(this.condition, q => 1 / (1 + 4 * q));
    const uniformRate = Array(this.condition.length).fill(this.meanRate);
    const edges = this.config.coupling ? this.lattice.edges : [];
    const diffusion = this.config.coupling ? DIFFUSION : 0;
    const localStats = stats(this.localPhase, localRate, this.localAge, edges, diffusion);
    const uniformStats = stats(this.uniformPhase, uniformRate, this.uniformAge, edges, diffusion);
    let phaseL2 = 0, minAge = Infinity, maxAge = -Infinity;
    for (let i = 0; i < this.localPhase.length; i++) {
      phaseL2 += (this.localPhase[i] - this.uniformPhase[i]) ** 2;
      minAge = Math.min(minAge, this.localAge[i]); maxAge = Math.max(maxAge, this.localAge[i]);
    }
    return {
      kind: 'T', size: SIZE, positions: this.lattice.positions.map(point => [...point]), edges: this.lattice.edges.map(edge => [...edge]),
      activity: Array.from(this.activity), condition: Array.from(this.condition),
      samples: [
        { label: 'local-clock', phase: Array.from(this.localPhase), rate: localRate, age: Array.from(this.localAge), stats: localStats },
      { label: 'mean-matched uniform', phase: Array.from(this.uniformPhase), rate: uniformRate, age: Array.from(this.uniformAge), stats: uniformStats }
      ],
      stats: { phaseL2: Math.sqrt(phaseL2), ageSpread: maxAge - minAge, minAge, maxAge }
    };
  }

  snapshot() {
    return {
      model: 'local-time-v1', version: 1, seed: this.seed, tick: this.tick, step: STEP,
      config: { ...this.config, initialPhase: [...this.config.initialPhase] }, input: this.input.snapshot(),
      samples: this.view().samples, q: Array.from(this.condition), initialRNGstate: this.initialRNGstate
    };
  }
}
