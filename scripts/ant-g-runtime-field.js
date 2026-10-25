import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

export const G_DOSE_SCALE = 3969 / 361;

/** Research-only browser-compatible G writer; inherited field behavior stays production-identical. */
export class RuntimeGField extends PheromoneField {
  depositPoint(position, options = {}) {
    return super.depositPoint(position, { ...options, amount: options.amount * G_DOSE_SCALE });
  }

  depositSegment(from, to, options = {}) {
    return super.depositSegment(from, to, {
      ...options,
      amountPerUnitDistance: (options.amountPerUnitDistance ?? 4.5) * G_DOSE_SCALE
    });
  }
}
