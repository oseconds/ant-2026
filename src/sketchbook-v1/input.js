import { STEP, randomStream, seedValue } from '../sketchbook/common.js';

export const INPUT_SECONDS = 40;
export const INPUT_PATTERNS = ['wander', 'stationary', 'none'];

export class ActivityInput {
  constructor(seed, pattern = 'wander', size = 12) {
    this.seed = seedValue(seed);
    if (!INPUT_PATTERNS.includes(pattern)) throw new RangeError('Unknown activity pattern');
    if (!Number.isInteger(size) || size < 2 || size > 64) throw new RangeError('Activity grid size must be 2…64');
    this.pattern = pattern; this.size = size; this.tick = 0;
    this.random = randomStream(this.seed);
    this.nodes = Array.from({ length: 2 }, () => Math.floor(this.random.next() * size * size));
    this.last = new Float64Array(size * size);
    this.dose = new Float64Array(size * size);
  }

  next(tick) {
    if (tick !== this.tick) throw new RangeError('Activity input must advance one global tick at a time');
    const counts = new Float64Array(this.size * this.size);
    if (tick < INPUT_SECONDS / STEP && this.pattern !== 'none') {
      if (this.pattern === 'wander' && tick > 0 && tick % 30 === 0) {
        this.nodes = this.nodes.map(node => {
          const x = node % this.size, y = Math.floor(node / this.size), neighbors = [];
          if (x > 0) neighbors.push(node - 1);
          if (x + 1 < this.size) neighbors.push(node + 1);
          if (y > 0) neighbors.push(node - this.size);
          if (y + 1 < this.size) neighbors.push(node + this.size);
          return neighbors[Math.floor(this.random.next() * neighbors.length)];
        });
      }
      for (const node of this.nodes) counts[node]++;
    }
    for (let i = 0; i < counts.length; i++) this.dose[i] += counts[i] * STEP;
    this.last = counts; this.tick++;
    return counts;
  }

  snapshot() {
    return { seed: this.seed, pattern: this.pattern, size: this.size, tick: this.tick,
      sourceCount: 2, stopTick: INPUT_SECONDS / STEP, moveTicks: 30,
      randomState: this.random.state(), nodes: [...this.nodes], last: [...this.last], dose: [...this.dose] };
  }
}
