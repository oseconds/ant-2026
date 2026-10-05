const DEFAULT_STEP_LENGTH = 0.018;
const DEFAULT_STRIKE_STRENGTH = 0.035;
const DEFAULT_VARIATION = 0.04;
const DEFAULT_MAX_EVENTS_PER_ADVANCE = 4;
const MAX_NORMALIZED_COORDINATE = 1;

/**
 * Turns measured ant travel distance into position-based STEP events.
 * This class has no audio or simulation dependencies; downstream consumers can
 * route events to any strike system without changing how steps are generated.
 */
export class StepEventGenerator {
  constructor({
    baseStepLength = DEFAULT_STEP_LENGTH,
    baseStrikeStrength = DEFAULT_STRIKE_STRENGTH,
    variation = DEFAULT_VARIATION,
    maxEventsPerAdvance = DEFAULT_MAX_EVENTS_PER_ADVANCE
  } = {}) {
    this.baseStepLength = positive(baseStepLength, DEFAULT_STEP_LENGTH);
    this.baseStrikeStrength = positive(baseStrikeStrength, DEFAULT_STRIKE_STRENGTH);
    this.variation = clamp(finite(variation) ? variation : DEFAULT_VARIATION, 0, 0.25);
    this.maxEventsPerAdvance = Math.max(1, Math.floor(finite(maxEventsPerAdvance)
      ? maxEventsPerAdvance : DEFAULT_MAX_EVENTS_PER_ADVANCE));
    this.ants = new Map();
  }

  /**
   * Add actual normalized distance traveled by one ant and return any STEP events.
   * Distance remainder is retained across calls; event times are the supplied
   * simulation time, not wall-clock time.
   */
  advance(agent, traveledDistance, simulationTimeMs) {
    if (!agent || !validId(agent.id) || !finite(traveledDistance) || traveledDistance <= 0
      || !finite(simulationTimeMs) || !validPosition(agent.x, agent.y)) return [];

    const ant = this.getOrCreate(agent.id);
    const totalDistance = ant.distanceRemainder + traveledDistance;
    if (!finite(totalDistance)) return [];

    const stepCount = Math.floor(totalDistance / ant.stepLength);
    const distanceRemainder = totalDistance % ant.stepLength;
    ant.distanceRemainder = distanceRemainder < ant.stepLength * 1e-12 ? 0 : distanceRemainder;

    const eventCount = Math.min(stepCount, this.maxEventsPerAdvance);
    const position = { x: clamp(agent.x, 0, MAX_NORMALIZED_COORDINATE), y: clamp(agent.y, 0, MAX_NORMALIZED_COORDINATE) };
    const events = [];
    for (let i = 0; i < eventCount; i += 1) {
      events.push({
        type: 'STEP',
        antId: agent.id,
        position: { ...position },
        strength: ant.strikeStrength,
        simulationTimeMs
      });
    }
    return events;
  }

  /** Drop accumulated state for ants no longer present in the simulation. */
  retain(ids) {
    const keep = ids instanceof Set ? ids : new Set(ids || []);
    for (const id of this.ants.keys()) if (!keep.has(id)) this.ants.delete(id);
  }

  /** Clear all per-ant timing and variation state. */
  reset() { this.ants.clear(); }

  getOrCreate(id) {
    let ant = this.ants.get(id);
    if (ant) return ant;
    const hash = hashId(id);
    const stepUnit = hashUnit(hash ^ 0x9e3779b9);
    const strengthUnit = hashUnit(hash ^ 0x85ebca6b);
    ant = {
      stepLength: this.baseStepLength * (1 + (stepUnit * 2 - 1) * this.variation),
      strikeStrength: this.baseStrikeStrength * (1 + (strengthUnit * 2 - 1) * this.variation),
      distanceRemainder: 0
    };
    this.ants.set(id, ant);
    return ant;
  }
}

function hashId(id) {
  const text = String(id);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashUnit(value) {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

function validId(id) { return (typeof id === 'number' && finite(id)) || (typeof id === 'string' && id.length > 0); }
function validPosition(x, y) { return finite(x) && finite(y); }
function positive(value, fallback) { return finite(value) && value > 0 ? value : fallback; }
function finite(value) { return Number.isFinite(value); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
