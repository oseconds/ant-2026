import { STEP, DEFAULT_SEED, lattice, randomStream, seedValue } from '../sketchbook/common.js';
import { ActivityInput } from './input.js';

const SIZE = 12;
const REST_SEED = 0x5a17c9e3;
const MOBILITY = 0.5;
const ACTIVITY_DAMAGE = 0.35;
const FATIGUE_RATE = 0.005;
const STRAIN_SCALE = 0.04;
const REST_RANGE = 0.04;
const labels = ['activity', 'noactivity'];

function components(edges, bonds, nodeCount) {
  const adjacency = Array.from({ length: nodeCount }, () => []);
  for (let e = 0; e < edges.length; e++) if (bonds[e] > 0) {
    const [a, b] = edges[e]; adjacency[a].push(b); adjacency[b].push(a);
  }
  const seen = new Uint8Array(nodeCount);
  let count = 0, largest = 0;
  for (let start = 0; start < nodeCount; start++) if (!seen[start]) {
    count++;
    const stack = [start]; seen[start] = 1;
    let size = 0;
    while (stack.length) {
      const node = stack.pop(); size++;
      for (const next of adjacency[node]) if (!seen[next]) { seen[next] = 1; stack.push(next); }
    }
    largest = Math.max(largest, size);
  }
  return { components: count, largestComponent: largest };
}

function sampleState(label, edges, offsets) {
  return { label, bond: new Array(edges.length).fill(1), displacement: new Array(SIZE * SIZE).fill(0), initialEnergy: offsets.reduce((sum, rest) => sum + 0.5 * rest * rest, 0), relaxationLoss: 0, damageLoss: 0 };
}

function energy(edges, bonds, displacement, offsets) {
  let total = 0;
  for (let e = 0; e < edges.length; e++) {
    const [a, b] = edges[e], strain = displacement[b] - displacement[a] - offsets[e];
    total += 0.5 * bonds[e] * strain * strain;
  }
  return total;
}

function stats(sample, edges, offsets) {
  const current = energy(edges, sample.bond, sample.displacement, offsets);
  const graph = components(edges, sample.bond, sample.displacement.length);
  return {
    meanBond: sample.bond.reduce((a, b) => a + b, 0) / sample.bond.length,
    removedEdges: sample.bond.reduce((n, value) => n + Number(value === 0), 0),
    ...graph,
    energy: current,
    energyBalanceError: current - sample.initialEnergy + sample.relaxationLoss + sample.damageLoss,
    relaxationLoss: sample.relaxationLoss,
    damageLoss: sample.damageLoss
  };
}

export class SubtractiveWorld {
  constructor(seed = DEFAULT_SEED, { pattern = 'wander', fatigue = true, fatigueStopTick = null } = {}) {
    if (fatigueStopTick !== null && (!Number.isInteger(fatigueStopTick) || fatigueStopTick < 0)) throw new RangeError('fatigueStopTick must be null or a nonnegative integer');
    this.seed = seedValue(seed);
    this.stepSize = STEP;
    this.pattern = pattern;
    this.fatigue = Boolean(fatigue);
    this.fatigueStopTick = fatigueStopTick;
    const { positions, edges } = lattice(SIZE);
    this.positions = positions;
    this.edges = edges;
    this.input = new ActivityInput(this.seed, pattern, SIZE);
    this.restRandom = randomStream((this.seed ^ REST_SEED) >>> 0);
    this.restOffsets = edges.map(() => (this.restRandom.next() * 2 - 1) * REST_RANGE);
    this.samples = labels.map(label => sampleState(label, edges, this.restOffsets));
    this.activity = new Array(SIZE * SIZE).fill(0);
    this.tick = 0;
  }

  step() {
    const input = this.input.next(this.tick);
    for (let s = 0; s < this.samples.length; s++) {
      const sample = this.samples[s], active = s === 0;
      const before = energy(this.edges, sample.bond, sample.displacement, this.restOffsets);
      const force = new Float64Array(sample.displacement.length);
      for (let e = 0; e < this.edges.length; e++) {
        const [a, b] = this.edges[e], strain = sample.displacement[b] - sample.displacement[a] - this.restOffsets[e];
        const value = MOBILITY * sample.bond[e] * strain;
        force[a] += value; force[b] -= value;
      }
      for (let i = 0; i < force.length; i++) sample.displacement[i] += this.stepSize * force[i];
      const relaxed = energy(this.edges, sample.bond, sample.displacement, this.restOffsets);
      sample.relaxationLoss += before - relaxed;
      for (let e = 0; e < this.edges.length; e++) {
        const [a, b] = this.edges[e], strain = sample.displacement[b] - sample.displacement[a] - this.restOffsets[e];
        const exposure = active ? ACTIVITY_DAMAGE * (input[a] + input[b]) / 2 : 0;
        const fatigue = this.fatigue && (this.fatigueStopTick === null || this.tick < this.fatigueStopTick)
          ? FATIGUE_RATE * strain * strain / (STRAIN_SCALE * STRAIN_SCALE + strain * strain) : 0;
        const old = sample.bond[e];
        sample.bond[e] = Math.max(0, old - this.stepSize * (exposure + fatigue));
        sample.damageLoss += 0.5 * (old - sample.bond[e]) * strain * strain;
      }
    }
    this.activity = [...input];
    this.tick++;
    return this;
  }

  view() {
    const samples = this.samples.map(sample => ({
      label: sample.label, bond: [...sample.bond], displacement: [...sample.displacement],
      stats: stats(sample, this.edges, this.restOffsets)
    }));
    return {
      kind: 'S', size: SIZE, positions: this.positions.map(point => [...point]),
      edges: this.edges.map(edge => [...edge]), activity: [...this.activity], samples,
      stats: { pairDistance: Math.sqrt(samples[0].displacement.reduce((sum, value, i) => sum + (value - samples[1].displacement[i]) ** 2, 0)) }
    };
  }

  snapshot() {
    return {
      version: 1, model: 'subtractive-v1', seed: this.seed, tick: this.tick, step: this.stepSize,
      config: {
        size: SIZE, pattern: this.pattern, fatigue: this.fatigue, fatigueStopTick: this.fatigueStopTick,
        mobility: MOBILITY, activityDamage: ACTIVITY_DAMAGE, fatigueRate: FATIGUE_RATE,
        strainScale: STRAIN_SCALE, restRange: REST_RANGE, restSeedXor: REST_SEED
      },
      positions: this.positions.map(point => [...point]), edges: this.edges.map(edge => [...edge]),
      restOffsets: [...this.restOffsets], restRandomState: this.restRandom.state(),
      input: this.input.snapshot(), activity: [...this.activity],
      samples: this.samples.map(sample => ({ ...sample, bond: [...sample.bond], displacement: [...sample.displacement], stats: stats(sample, this.edges, this.restOffsets) }))
    };
  }
}
