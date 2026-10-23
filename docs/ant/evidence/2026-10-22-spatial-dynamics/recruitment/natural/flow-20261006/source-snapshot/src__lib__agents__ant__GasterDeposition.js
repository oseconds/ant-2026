const DEFAULT_DAB_SPACING = 0.006;
const MAX_DABS_PER_ADVANCE = 256;
const VALID_MODES = new Set(['continuous', 'dab']);

/**
 * Produces field-agnostic pheromone deposits along the gaster's rear secretion
 * point. Distance is the ant's measured thorax travel; rear points determine
 * only where the shared environment receives that dose.
 */
export class GasterDeposition {
  constructor({ mode = 'continuous', spacing = DEFAULT_DAB_SPACING } = {}) {
    if (!VALID_MODES.has(mode)) throw new RangeError('mode must be continuous or dab.');
    this.mode = mode;
    this.spacing = positiveFinite(spacing, 'spacing');
    this.ants = new Map();
  }

  /**
   * Return continuous segment deposits or distance-threshold point dabs.
   * `amountPerUnitDistance` is the effective rate for this movement chunk,
   * including any adherence-based reinforcement already chosen by the caller.
   */
  advance(antId, travelledDistance, fromRear, toRear, amountPerUnitDistance) {
    if (!validId(antId) || !Number.isFinite(travelledDistance) || travelledDistance <= 0
      || !validPoint(fromRear) || !validPoint(toRear)
      || !Number.isFinite(amountPerUnitDistance) || amountPerUnitDistance < 0) return [];

    const dose = travelledDistance * amountPerUnitDistance;
    if (!Number.isFinite(dose)) return [];
    if (this.mode === 'continuous') return this.continuousDeposit(fromRear, toRear, dose);
    if (dose === 0) return this.advanceWithoutDose(antId, travelledDistance, fromRear, toRear);
    return this.advanceDabs(antId, travelledDistance, fromRear, toRear, amountPerUnitDistance);
  }

  continuousDeposit(fromRear, toRear, dose) {
    if (dose === 0) return [];
    const from = copyPoint(fromRear), to = copyPoint(toRear);
    const rearDistance = Math.hypot(to.x - from.x, to.y - from.y);
    if (rearDistance > 0) {
      const amountPerUnitDistance = dose / rearDistance;
      if (Number.isFinite(amountPerUnitDistance)) {
        return [{ type: 'segment', from, to, amountPerUnitDistance }];
      }
    }
    return [{ type: 'point', position: to, amount: dose }];
  }

  advanceWithoutDose(antId, travelledDistance, fromRear, toRear) {
    const ant = this.getOrCreate(antId);
    return this.consumeDistance(ant, travelledDistance, fromRear, toRear, 0);
  }

  advanceDabs(antId, travelledDistance, fromRear, toRear, amountPerUnitDistance) {
    const ant = this.getOrCreate(antId);
    return this.consumeDistance(ant, travelledDistance, fromRear, toRear, amountPerUnitDistance);
  }

  consumeDistance(ant, travelledDistance, fromRear, toRear, amountPerUnitDistance) {
    const deposits = [];
    let consumed = 0;
    let remaining = travelledDistance;
    const dx = toRear.x - fromRear.x;
    const dy = toRear.y - fromRear.y;
    const epsilon = this.spacing * 1e-12;
    let crossedDabs = 0;

    while (remaining > 0) {
      if (crossedDabs >= MAX_DABS_PER_ADVANCE) {
        const deferredDose = ant.amount + remaining * amountPerUnitDistance;
        const leftoverDistance = ant.distance + remaining;
        ant.distance = leftoverDistance % this.spacing;
        ant.amount = 0;
        if (Number.isFinite(deferredDose) && deferredDose > 0) {
          deposits.push({ type: 'point', position: copyPoint(toRear), amount: deferredDose });
        }
        break;
      }
      const needed = this.spacing - ant.distance;
      const chunk = Math.min(remaining, needed);
      ant.distance += chunk;
      ant.amount += chunk * amountPerUnitDistance;
      consumed += chunk;
      remaining -= chunk;

      if (ant.distance + epsilon < this.spacing) break;
      const fraction = Math.max(0, Math.min(1, consumed / travelledDistance));
      if (ant.amount > 0) {
        deposits.push({ type: 'point', position: { x: fromRear.x + dx * fraction, y: fromRear.y + dy * fraction }, amount: ant.amount });
      }
      ant.distance = 0;
      ant.amount = 0;
      crossedDabs += 1;
      if (remaining <= epsilon) remaining = 0;
    }

    return deposits;
  }

  /** Flush the final partial dose and forget all per-ant accumulator state. */
  retire(antId, finalRear) {
    const ant = this.ants.get(antId);
    if (!ant) return [];
    this.ants.delete(antId);
    if (ant.amount <= 0 || !validPoint(finalRear)) return [];
    return [{ type: 'point', position: copyPoint(finalRear), amount: ant.amount }];
  }

  /** Forget state for agents that are no longer active. */
  retain(ids) {
    const keep = ids instanceof Set ? ids : new Set(ids || []);
    for (const id of this.ants.keys()) if (!keep.has(id)) this.ants.delete(id);
  }

  reset() { this.ants.clear(); }

  getOrCreate(id) {
    let ant = this.ants.get(id);
    if (!ant) {
      ant = { distance: 0, amount: 0 };
      this.ants.set(id, ant);
    }
    return ant;
  }
}

function validId(id) { return (typeof id === 'number' && Number.isFinite(id)) || (typeof id === 'string' && id.length > 0); }
function validPoint(point) { return Number.isFinite(point?.x) && Number.isFinite(point?.y); }
function copyPoint(point) { return { x: point.x, y: point.y }; }
function positiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and greater than zero.`);
  return value;
}
