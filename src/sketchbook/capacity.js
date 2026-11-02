import { DEFAULT_SEED, STEP, lattice, randomStream, seedValue } from './common.js';

const SIZE = 8;
const NODE_COUNT = SIZE * SIZE;
const INPUT_TICKS = 40 * 60;
const DRIVE_AMPLITUDE = 0.4;
const DRIVE_FREQUENCY_MIN = 0.65;
const DRIVE_FREQUENCY_MAX = 1.15;
const GROUND = 0.6;
const DAMPING = 0.5;
const SPRING_SCALE = 120;
const STRAIN_SCALE = 0.01;
const REDISTRIBUTION_RATE = 0.25;

export class CapacityWorld {
  constructor(seed = DEFAULT_SEED) {
    this.seed = seedValue(seed);
    this.tick = 0;
    this.random = randomStream(this.seed);
    this.lattice = lattice(SIZE);
    this.mass = new Float64Array(NODE_COUNT).fill(1);
    this.displacement = new Float64Array(NODE_COUNT);
    this.velocity = new Float64Array(NODE_COUNT);
    this.capacity = new Float64Array(this.lattice.edges.length).fill(1);
    this.incidentEdges = Array.from({ length: NODE_COUNT }, () => []);
    for (let edge = 0; edge < this.lattice.edges.length; edge++) {
      const [i, j] = this.lattice.edges[edge];
      this.incidentEdges[i].push(edge);
      this.incidentEdges[j].push(edge);
    }
    this.drive = {
      node: Math.floor(this.random.next() * NODE_COUNT),
      frequency: DRIVE_FREQUENCY_MIN + this.random.next() * (DRIVE_FREQUENCY_MAX - DRIVE_FREQUENCY_MIN),
      phase: this.random.next() * Math.PI * 2
    };
  }

  step() {
    const acceleration = new Float64Array(NODE_COUNT);
    const time = this.tick * STEP;
    for (let i = 0; i < NODE_COUNT; i++) {
      acceleration[i] = -GROUND * this.displacement[i] - DAMPING * this.velocity[i];
    }
    if (this.tick < INPUT_TICKS) {
      acceleration[this.drive.node] += DRIVE_AMPLITUDE * Math.sin(
        2 * Math.PI * this.drive.frequency * time + this.drive.phase
      );
    }
    for (let edge = 0; edge < this.lattice.edges.length; edge++) {
      const [i, j] = this.lattice.edges[edge];
      const capacity = this.capacity[edge];
      const stiffness = SPRING_SCALE * capacity / (1 + capacity);
      const force = stiffness * (this.displacement[j] - this.displacement[i]);
      acceleration[i] += force;
      acceleration[j] -= force;
    }
    for (let i = 0; i < NODE_COUNT; i++) {
      this.velocity[i] += STEP * acceleration[i];
      this.displacement[i] += STEP * this.velocity[i];
    }
    this.redistributeCapacity();
    this.tick++;
    return this;
  }

  redistributeCapacity() {
    const strain = new Float64Array(this.lattice.edges.length);
    for (let edge = 0; edge < this.lattice.edges.length; edge++) {
      const [i, j] = this.lattice.edges[edge];
      strain[edge] = Math.tanh(Math.abs(this.displacement[i] - this.displacement[j]) / STRAIN_SCALE);
    }

    // Overlapping incident stars are applied in row-major node order.
    for (const edges of this.incidentEdges) {
      let mean = 0, total = 0;
      for (const edge of edges) {
        mean += strain[edge];
        total += this.capacity[edge];
      }
      mean /= edges.length;
      const weights = edges.map(edge => this.capacity[edge] * Math.exp(
        REDISTRIBUTION_RATE * STEP * (strain[edge] - mean)
      ));
      const weightTotal = weights.reduce((sum, value) => sum + value, 0);
      const scale = total / weightTotal;
      for (let n = 0; n < edges.length; n++) this.capacity[edges[n]] = weights[n] * scale;
    }
  }

  view() {
    let totalCapacity = 0, minCapacity = Infinity, maxCapacity = -Infinity, displacementSquares = 0;
    for (let i = 0; i < this.capacity.length; i++) {
      const value = this.capacity[i];
      totalCapacity += value;
      minCapacity = Math.min(minCapacity, value);
      maxCapacity = Math.max(maxCapacity, value);
    }
    for (const value of this.displacement) displacementSquares += value * value;
    const capacityBudget = this.lattice.edges.length;
    return {
      kind: 'C', size: SIZE,
      positions: this.lattice.positions.map(([x, y]) => [x, y]),
      edges: this.lattice.edges.map(([i, j]) => [i, j]),
      capacity: Array.from(this.capacity),
      mass: Array.from(this.mass),
      displacement: Array.from(this.displacement),
      phase: this.tick < INPUT_TICKS ? 'active' : 'resting',
      stats: {
        totalCapacity, capacityError: totalCapacity - capacityBudget,
        minCapacity, maxCapacity,
        displacementRms: Math.sqrt(displacementSquares / NODE_COUNT)
      }
    };
  }

  snapshot() {
    return {
      model: 'capacity-v0', version: 1, seed: this.seed, tick: this.tick, step: STEP,
      config: {
        size: SIZE, inputTicks: INPUT_TICKS, driveAmplitude: DRIVE_AMPLITUDE,
        driveFrequencyMin: DRIVE_FREQUENCY_MIN, driveFrequencyMax: DRIVE_FREQUENCY_MAX,
        ground: GROUND, damping: DAMPING, springScale: SPRING_SCALE,
        strainScale: STRAIN_SCALE, redistributionRate: REDISTRIBUTION_RATE,
        integrator: 'semi-implicit-euler', redistributionOrder: 'row-major'
      },
      randomState: this.random.state(), drive: { ...this.drive },
      positions: this.lattice.positions.map(([x, y]) => [x, y]),
      edges: this.lattice.edges.map(([i, j]) => [i, j]),
      mass: Array.from(this.mass), displacement: Array.from(this.displacement),
      velocity: Array.from(this.velocity), capacity: Array.from(this.capacity)
    };
  }

  mechanics() {
    return [{
      label: 'capacity-lattice',
      positions: this.lattice.positions.map(([x, y]) => [x, y]),
      masses: Array.from(this.mass),
      ground: Array(NODE_COUNT).fill(GROUND),
      damping: Array(NODE_COUNT).fill(DAMPING),
      springs: this.lattice.edges.map(([i, j], edge) => [
        i, j, SPRING_SCALE * this.capacity[edge] / (1 + this.capacity[edge])
      ])
    }];
  }
}
