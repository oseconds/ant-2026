import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

/** Research-only: the containing cell replaces the production compact brush. */
export class CicPheromoneField extends PheromoneField {
  depositBrush(x, y, amount) {
    const gx = Math.max(0, Math.min(1, x)) * (this.width - 1);
    const gy = Math.max(0, Math.min(1, y)) * (this.height - 1);
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const x1 = Math.min(this.width - 1, x0 + 1), y1 = Math.min(this.height - 1, y0 + 1);
    const tx = gx - x0, ty = gy - y0;
    for (const [column, row, weight] of [
      [x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)],
      [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]
    ]) {
      if (weight === 0) continue;
      const index = row * this.width + column;
      this.values[index] = Math.min(this.maxValue, this.values[index] + amount * weight);
    }
  }
}
