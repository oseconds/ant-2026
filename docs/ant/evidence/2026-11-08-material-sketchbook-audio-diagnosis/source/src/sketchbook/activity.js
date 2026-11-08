import { DEFAULT_SEED, STEP, lattice, randomStream, seedValue } from './common.js';

const SIZE = 24;
const SOURCE_COUNT = 4;
const INPUT_TICKS = 30 * 60;
const SOURCE_MOVE_TICKS = 45;
const MASS_RATE = 0.08;
const AGITATION_DOSE = 0.006;
const AGITATION_DECAY = Math.exp(-STEP / 2.5);
const DIFFUSION = 0.10;
const BOND_MOBILITY_REDUCTION = 0.9;
const BOND_FORMATION = 0.06;
const BOND_BREAKING = 0.18;

export class ActivityWorld {
  constructor(seed = DEFAULT_SEED) {
    this.seed = seedValue(seed);
    this.tick = 0;
    this.random = randomStream(this.seed);
    this.lattice = lattice(SIZE);
    this.mass = new Float64Array(SIZE * SIZE);
    this.agitation = new Float64Array(SIZE * SIZE);
    this.bond = new Float64Array(SIZE * SIZE);
    this.sources = Array.from({ length: SOURCE_COUNT }, () => ({
      x: Math.floor(this.random.next() * SIZE),
      y: Math.floor(this.random.next() * SIZE)
    }));
  }

  step() {
    if (this.tick % SOURCE_MOVE_TICKS === 0 && this.tick > 0) {
      for (const source of this.sources) {
        const neighbors = [];
        if (source.x > 0) neighbors.push([source.x - 1, source.y]);
        if (source.x + 1 < SIZE) neighbors.push([source.x + 1, source.y]);
        if (source.y > 0) neighbors.push([source.x, source.y - 1]);
        if (source.y + 1 < SIZE) neighbors.push([source.x, source.y + 1]);
        [source.x, source.y] = neighbors[Math.floor(this.random.next() * neighbors.length)];
      }
    }

    if (this.tick < INPUT_TICKS) {
      for (const { x, y } of this.sources) {
        const i = y * SIZE + x;
        this.mass[i] += MASS_RATE * STEP;
        this.agitation[i] = Math.min(2, this.agitation[i] + AGITATION_DOSE);
      }
    }

    for (let i = 0; i < this.agitation.length; i++) this.agitation[i] *= AGITATION_DECAY;

    const delta = new Float64Array(this.mass.length);
    for (const [i, j] of this.lattice.edges) {
      const meanAgitation = (this.agitation[i] + this.agitation[j]) / 2;
      const meanBond = (this.bond[i] + this.bond[j]) / 2;
      const mobility = DIFFUSION * (1 + 0.5 * meanAgitation) * (1 - BOND_MOBILITY_REDUCTION * meanBond);
      const flux = STEP * mobility * (this.mass[i] - this.mass[j]);
      delta[i] -= flux;
      delta[j] += flux;
    }
    for (let i = 0; i < this.mass.length; i++) {
      this.mass[i] = Math.max(0, this.mass[i] + delta[i]);
      this.bond[i] = Math.max(0, Math.min(1, this.bond[i] + STEP * (
        BOND_FORMATION * this.mass[i] * (1 - this.bond[i]) -
        BOND_BREAKING * this.agitation[i] * this.bond[i]
      )));
    }
    this.tick++;
    return this;
  }

  view() {
    let totalMass = 0, suppliedMass = 0, totalAgitation = 0, totalBond = 0, bondedMass = 0;
    for (let i = 0; i < this.mass.length; i++) {
      totalMass += this.mass[i];
      totalAgitation += this.agitation[i];
      totalBond += this.bond[i];
      bondedMass += this.mass[i] * this.bond[i];
    }
    suppliedMass = Math.min(this.tick, INPUT_TICKS) * STEP * MASS_RATE * SOURCE_COUNT;
    return {
      kind: 'A', size: SIZE,
      mass: Array.from(this.mass), agitation: Array.from(this.agitation), bond: Array.from(this.bond),
      phase: this.tick < INPUT_TICKS ? 'active' : 'resting',
      stats: {
        totalMass, suppliedMass, meanAgitation: totalAgitation / this.mass.length,
        meanBond: totalBond / this.bond.length, bondedMass
      }
    };
  }

  snapshot() {
    return {
      model: 'activity-v0', version: 1, seed: this.seed, tick: this.tick, step: STEP,
      config: {
        size: SIZE, sourceCount: SOURCE_COUNT, inputTicks: INPUT_TICKS,
        sourceMoveTicks: SOURCE_MOVE_TICKS, massRate: MASS_RATE, agitationDose: AGITATION_DOSE,
        agitationDecay: AGITATION_DECAY, diffusion: DIFFUSION,
        bondMobilityReduction: BOND_MOBILITY_REDUCTION,
        bondFormation: BOND_FORMATION, bondBreaking: BOND_BREAKING
      },
      randomState: this.random.state(), sources: this.sources.map(({ x, y }) => ({ x, y })),
      mass: Array.from(this.mass), agitation: Array.from(this.agitation), bond: Array.from(this.bond)
    };
  }

  mechanics() {
    const blockSize = 3, blockCount = SIZE / blockSize;
    const positions = [], masses = [], ground = [], damping = [], contact = [], blockBond = [];
    for (let by = 0; by < blockCount; by++) for (let bx = 0; bx < blockCount; bx++) {
      let blockMass = 0, bondSum = 0;
      for (let y = by * blockSize; y < (by + 1) * blockSize; y++) {
        for (let x = bx * blockSize; x < (bx + 1) * blockSize; x++) {
          const i = y * SIZE + x;
          blockMass += this.mass[i];
          bondSum += this.bond[i];
        }
      }
      const meanBond = bondSum / (blockSize * blockSize);
      const weight = blockMass / (0.25 + blockMass);
      positions.push([(bx + 0.5) / blockCount, (by + 0.5) / blockCount]);
      masses.push(0.25 + blockMass);
      ground.push((0.04 + 0.8 * meanBond) * weight);
      damping.push(0.08 + 0.12 * meanBond);
      contact.push(weight);
      blockBond.push(meanBond);
    }
    const springs = [];
    for (let y = 0; y < blockCount; y++) for (let x = 0; x < blockCount; x++) {
      const i = y * blockCount + x;
      if (x + 1 < blockCount) springs.push([i, i + 1, (0.015 + 0.15 * Math.min(blockBond[i], blockBond[i + 1])) * contact[i] * contact[i + 1]]);
      if (y + 1 < blockCount) springs.push([i, i + blockCount, (0.015 + 0.15 * Math.min(blockBond[i], blockBond[i + blockCount])) * contact[i] * contact[i + blockCount]]);
    }
    return [{ label: 'activity-film', positions, masses, ground, damping, springs, contact }];
  }
}
