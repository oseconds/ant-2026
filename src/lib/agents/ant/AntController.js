import { AntAgent } from './AntAgent.js';
import { LocalOccupancy } from './LocalOccupancy.js';
import { PheromoneField } from './PheromoneField.js';

const STEP_MS = 1000 / 60;
const MAX_FRAME_GAP_MS = 100;
// Cell values from fresh distance-based trails are much smaller than the
// storage cap. This response scale keeps sparse trails perceptible to agents.
const TRAIL_HALF_SATURATION = 0.012;
const DECISION_TEMPERATURE = 0.85;
const SEPARATION_ACCELERATION = 0.003;
const HESITATION_SPEED_RATIO = 0.05;
const HESITATION_MIN_SECONDS = 0.7;
const HESITATION_RANGE_SECONDS = 0.8;
const TAU = Math.PI * 2;
const DEFAULT_STATE = Object.freeze({
  model: 'ant',
  population: { count: 64 },
  pheromone: { halfLifeSeconds: 14, amountPerUnitDistance: 6, radius: 0.009 },
  behavior: { sensorDistance: 0.042, bodyRadius: 0.006 }
});

/** Framework independent population and shared-environment simulation. */
export class AntController {
  constructor({ state, random = Math.random, fieldFactory = (options) => new PheromoneField(options) } = {}) {
    this.state = normalizeState(state || {});
    this.random = random;
    this.fieldFactory = fieldFactory;
    this.listeners = new Set();
    this.destroyed = false;
    this.initialized = false;
    this.running = false;
    this.lastFrameTimestamp = null;
    this.accumulatorMs = 0;
    this.simulationTimeMs = 0;
    this.agents = [];
    this.field = null;
    this.occupancy = new LocalOccupancy();
  }

  async init() {
    this.assertAlive();
    if (this.initialized) return this;
    this.field = this.fieldFactory({ decayHalfLifeSeconds: this.state.pheromone.halfLifeSeconds });
    this.agents = createPopulation(this.state.population.count, this.random, this.state.behavior.bodyRadius);
    this.initialized = true;
    this.running = true;
    this.emit('update');
    return this;
  }

  getState() { return clone(this.state); }

  getSnapshot() {
    const agents = this.agents.map((agent) => agent.getSnapshot());
    const field = this.field?.getSnapshot() || { width: 0, height: 0, values: new Float32Array(), maxValue: 0, totalMass: 0 };
    let speedTotal = 0;
    for (const agent of agents) speedTotal += Math.hypot(agent.vx, agent.vy);
    return {
      state: this.getState(),
      status: this.running ? 'active' : 'stopped',
      agents,
      pheromone: field,
      analysis: {
        population: agents.length,
        meanSpeed: agents.length ? speedTotal / agents.length : 0,
        pheromoneMass: field.totalMass,
        simulationTimeMs: this.simulationTimeMs,
        minSeparation: minimumSeparation(agents)
      }
    };
  }

  subscribe(listener) {
    this.assertAlive();
    if (typeof listener !== 'function') throw new TypeError('Listener must be a function.');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(timestampMs) {
    if (this.destroyed || !this.initialized || !this.running || !Number.isFinite(timestampMs)) return false;
    if (this.lastFrameTimestamp === null) {
      this.lastFrameTimestamp = timestampMs;
      return false;
    }
    const elapsed = Math.max(0, Math.min(MAX_FRAME_GAP_MS, timestampMs - this.lastFrameTimestamp));
    this.lastFrameTimestamp = timestampMs;
    this.accumulatorMs += elapsed;
    let steps = 0;
    while (this.accumulatorMs + 1e-9 >= STEP_MS) {
      this.accumulatorMs -= STEP_MS;
      this.tick(STEP_MS / 1000);
      steps += 1;
    }
    if (steps) this.emit('update');
    return steps > 0;
  }

  configure(patch = {}) {
    this.assertAlive();
    const previousCount = this.state.population.count;
    this.state = normalizeState(mergeState(this.state, patch));
    if (this.field) this.field.decayHalfLifeSeconds = this.state.pheromone.halfLifeSeconds;
    if (this.initialized && this.state.population.count !== previousCount) {
      this.agents = createPopulation(this.state.population.count, this.random, this.state.behavior.bodyRadius);
      this.field.clear();
    } else {
      for (const agent of this.agents) agent.radius = this.state.behavior.bodyRadius;
    }
    this.emit('update');
    return this.getState();
  }

  stop() {
    if (this.destroyed || !this.initialized || !this.running) return false;
    this.running = false;
    this.resetFrameClock();
    this.emit('update');
    return true;
  }

  strike() { return false; }
  setPickup() { return false; }

  async destroy() {
    if (this.destroyed) return;
    this.running = false;
    this.destroyed = true;
    this.initialized = false;
    this.listeners.clear();
    this.agents = [];
    this.field?.clear();
    this.field = null;
    this.lastFrameTimestamp = null;
    this.accumulatorMs = 0;
  }

  tick(dt) {
    const current = this.agents;
    const sensed = current.map((agent) => this.occupancy.sense(agent, current));
    this.field.decay(dt);
    for (let index = 0; index < current.length; index += 1) {
      this.updateIntention(current[index], current, sensed[index], dt);
    }

    const displacements = current.map((agent, index) => {
      const info = sensed[index];
      const separationMagnitude = Math.hypot(info.separationX, info.separationY);
      let targetHeading = agent.intentHeading;
      if (separationMagnitude > 0.03) {
        const awayHeading = Math.atan2(info.separationY, info.separationX);
        targetHeading = blendAngle(targetHeading, awayHeading, Math.min(0.66, separationMagnitude * 0.34));
      }
      if (info.frontCrowding > 0.12 && Math.abs(info.leftCrowding - info.rightCrowding) > 0.02) {
        const side = info.leftCrowding < info.rightCrowding ? -1 : 1;
        targetHeading = blendAngle(targetHeading, agent.heading + side * 0.42,
          Math.min(0.58, info.frontCrowding * 0.6));
      }
      const edge = boundarySteering(agent);
      if (edge.strength > 0) targetHeading = blendAngle(targetHeading, edge.heading, Math.min(0.8, edge.strength * 0.7));

      agent.turnToward(targetHeading, dt);
      const cycle = Math.sin(agent.speedPhase);
      let desiredSpeed = agent.personality.preferredSpeed * (0.58 + 0.34 * (cycle + 1) * 0.5);
      // Inertia limits braking; the swept contact guard is a final safeguard.
      desiredSpeed *= (1 - info.frontCrowding) ** 2;
      desiredSpeed *= 1 - Math.min(0.45, separationMagnitude * 0.1);
      if (agent.hesitationRemaining > 0) desiredSpeed *= HESITATION_SPEED_RATIO;
      if (edge.strength > 0.65) desiredSpeed *= 0.78;
      agent.targetSpeed = desiredSpeed;
      agent.accelerateToward(desiredSpeed, dt);
      agent.vx += info.separationX * SEPARATION_ACCELERATION * dt;
      agent.vy += info.separationY * SEPARATION_ACCELERATION * dt;
      const movement = {
        x: clamp(agent.vx * dt, -0.008, 0.008),
        y: clamp(agent.vy * dt, -0.008, 0.008)
      };
      const edgeScale = boundaryScale(agent, movement);
      movement.x *= edgeScale;
      movement.y *= edgeScale;
      return movement;
    });

    const collisionScales = this.occupancy.constrainDisplacements(current, displacements);
    for (let index = 0; index < current.length; index += 1) {
      const agent = current[index];
      const displacement = displacements[index];
      const scale = collisionScales[index];
      const from = { x: agent.x, y: agent.y };
      agent.x = clamp(agent.x + displacement.x * scale, agent.radius, 1 - agent.radius);
      agent.y = clamp(agent.y + displacement.y * scale, agent.radius, 1 - agent.radius);
      if (scale < 0.999) {
        agent.vx *= scale;
        agent.vy *= scale;
      }
      const travelled = Math.hypot(agent.x - from.x, agent.y - from.y);
      if (travelled > 1e-8) this.field.depositSegment(from, { x: agent.x, y: agent.y }, {
        amountPerUnitDistance: this.state.pheromone.amountPerUnitDistance,
        radius: this.state.pheromone.radius
      });
      this.advanceBehaviorClocks(agent, dt);
    }
    this.simulationTimeMs += dt * 1000;
  }

  updateIntention(agent, agents, occupancy, dt) {
    agent.decisionRemaining -= dt;
    agent.committedRemaining -= dt;
    agent.inspectionRemaining -= dt;
    agent.hesitationRemaining -= dt;
    if (agent.hesitationRemaining <= 0) agent.hesitationRemaining = 0;
    if (agent.inspectionRemaining <= 0) {
      agent.inspectionRemaining = 1.2 + this.random() * 2.4;
      if (this.random() < 0.23) {
        agent.intentHeading = wrapAngle(agent.intentHeading + signed(this.random) * 0.24);
        // Leave enough time for inertial deceleration to produce a near-stop,
        // rather than a barely visible dip in an otherwise constant pace.
        agent.hesitationRemaining = Math.max(agent.hesitationRemaining,
          HESITATION_MIN_SECONDS + this.random() * HESITATION_RANGE_SECONDS);
      }
    }

    const blocked = occupancy.frontCrowding > 0.25;
    const newlyBlocked = blocked && !agent.wasBlocked;
    agent.wasBlocked = blocked;
    if (agent.decisionRemaining > 0 && agent.committedRemaining > 0 && !newlyBlocked) return;
    agent.decisionRemaining = 0.25 + this.random() * 0.42;
    agent.committedRemaining = 0.3 + this.random() * 0.9;
    const offsets = [-0.92, -0.47, 0, 0.47, 0.92];
    const options = offsets.map((offset) => {
      const heading = wrapAngle(agent.heading + offset + (this.random() - 0.5) * 0.12);
      const distance = this.state.behavior.sensorDistance;
      const x = agent.x + Math.cos(heading) * distance;
      const y = agent.y + Math.sin(heading) * distance;
      const trailAmount = this.field.sample(x, y);
      // Realistic distance deposits remain far below maxValue=8. Compress
      // that useful low range while keeping the pheromone influence bounded.
      const trail = trailAmount / (trailAmount + TRAIL_HALF_SATURATION);
      const crowding = this.occupancy.crowdingInDirection(agent, agents, heading, distance * 1.45);
      const wall = boundaryPenalty(x, y);
      const score = trail * agent.personality.pheromoneSensitivity * 1.8
        - crowding * 3.2 - wall * 2.4 + (this.random() - 0.5) * 0.42;
      return { heading, score };
    });
    const chosen = this.random() < agent.personality.exploration
      ? options[Math.floor(this.random() * options.length)]
      : weightedChoice(options, this.random, DECISION_TEMPERATURE);
    agent.intentHeading = chosen.heading;
  }

  advanceBehaviorClocks(agent, dt) {
    agent.speedPhase = wrapAngle(agent.speedPhase + dt * TAU / agent.speedCycle);
  }

  resetFrameClock() { this.lastFrameTimestamp = null; this.accumulatorMs = 0; }
  assertAlive() { if (this.destroyed) throw new Error('AntController has been destroyed.'); }
  emit(type) {
    if (this.destroyed || this.listeners.size === 0) return;
    const event = { type, payload: this.getSnapshot() };
    for (const listener of [...this.listeners]) listener(event);
  }
}

function createPopulation(count, random, radius) {
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const cells = Array.from({ length: columns * rows }, (_, index) => index);
  for (let index = cells.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [cells[index], cells[swap]] = [cells[swap], cells[index]];
  }
  return Array.from({ length: count }, (_, id) => {
    const cell = cells[id];
    const column = cell % columns;
    const row = Math.floor(cell / columns);
    const cellWidth = 0.84 / columns;
    const cellHeight = 0.84 / rows;
    const x = 0.08 + (column + 0.2 + random() * 0.6) * cellWidth;
    const y = 0.08 + (row + 0.2 + random() * 0.6) * cellHeight;
    return new AntAgent({ id: 'ant-' + (id + 1), x, y, random, radius });
  });
}

function normalizeState(input) {
  const state = mergeState(DEFAULT_STATE, input);
  state.model = 'ant';
  state.population.count = Math.round(clampFinite(state.population.count, 8, 100, 64));
  state.pheromone.halfLifeSeconds = clampFinite(state.pheromone.halfLifeSeconds, 2, 120, 14);
  state.pheromone.amountPerUnitDistance = clampFinite(state.pheromone.amountPerUnitDistance, 0.1, 30, 6);
  state.pheromone.radius = clampFinite(state.pheromone.radius, 0.002, 0.04, 0.009);
  state.behavior.sensorDistance = clampFinite(state.behavior.sensorDistance, 0.012, 0.1, 0.042);
  state.behavior.bodyRadius = clampFinite(state.behavior.bodyRadius, 0.003, 0.015, 0.006);
  return state;
}
function mergeState(base, patch) {
  return {
    ...clone(base), ...clone(patch),
    population: { ...clone(base.population), ...clone(patch.population || {}) },
    pheromone: { ...clone(base.pheromone), ...clone(patch.pheromone || {}) },
    behavior: { ...clone(base.behavior), ...clone(patch.behavior || {}) }
  };
}
function clone(value) { return structuredClone(value); }
function clampFinite(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, min, max) : fallback;
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function signed(random) { return random() * 2 - 1; }
function wrapAngle(value) { return ((value + Math.PI) % TAU + TAU) % TAU - Math.PI; }
function blendAngle(from, to, amount) { return from + wrapAngle(to - from) * amount; }
function boundaryPenalty(x, y) {
  const edge = Math.min(x, y, 1 - x, 1 - y);
  return edge >= 0.09 ? 0 : (0.09 - edge) / 0.09;
}
function boundarySteering(agent) {
  const margin = 0.09;
  let x = 0, y = 0;
  if (agent.x < margin) x += (margin - agent.x) / margin;
  if (agent.x > 1 - margin) x -= (agent.x - (1 - margin)) / margin;
  if (agent.y < margin) y += (margin - agent.y) / margin;
  if (agent.y > 1 - margin) y -= (agent.y - (1 - margin)) / margin;
  const strength = Math.hypot(x, y);
  return { heading: Math.atan2(y, x), strength: Math.min(1, strength) };
}
function boundaryScale(agent, displacement) {
  let scale = 1;
  if (displacement.x < 0 && agent.x + displacement.x < agent.radius) scale = Math.min(scale, (agent.x - agent.radius) / -displacement.x);
  else if (displacement.x > 0 && agent.x + displacement.x > 1 - agent.radius) scale = Math.min(scale, (1 - agent.radius - agent.x) / displacement.x);
  if (displacement.y < 0 && agent.y + displacement.y < agent.radius) scale = Math.min(scale, (agent.y - agent.radius) / -displacement.y);
  else if (displacement.y > 0 && agent.y + displacement.y > 1 - agent.radius) scale = Math.min(scale, (1 - agent.radius - agent.y) / displacement.y);
  return clamp(scale, 0, 1);
}
function weightedChoice(options, random, temperature) {
  const max = Math.max(...options.map((option) => option.score));
  const weights = options.map((option) => Math.exp((option.score - max) / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let choice = random() * total;
  for (let index = 0; index < options.length; index += 1) {
    choice -= weights[index];
    if (choice <= 0) return options[index];
  }
  return options.at(-1);
}
function minimumSeparation(agents) {
  let minimum = Infinity;
  for (let i = 0; i < agents.length; i += 1) {
    for (let j = i + 1; j < agents.length; j += 1) {
      minimum = Math.min(minimum, Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y));
    }
  }
  return Number.isFinite(minimum) ? minimum : null;
}
