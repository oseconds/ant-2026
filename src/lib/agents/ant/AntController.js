import { TrajectoryBuffer } from '../../utils/TrajectoryBuffer.js';

const STEP_MS = 1000 / 60;
const MAX_FRAME_GAP_MS = 100;
const DEFAULT_STATE = Object.freeze({
  model: 'ant',
  mode: 'live',
  memory: { historySeconds: 5, sampleRate: 60 },
  colony: { followerCount: 7, firstDelayMs: 120, delayStepMs: 120 },
  behavior: { speed: 0.18, steering: 0.14, variation: 0.003 }
});

/**
 * Framework-independent controller for a leader trajectory and delayed copies.
 * Time enters through update(timestampMs), so renderers can choose their own loop.
 */
export class AntController {
  constructor({ state, random = Math.random } = {}) {
    this.state = normalizeState(state || {});
    this.random = random;
    this.listeners = new Set();
    this.destroyed = false;
    this.initialized = false;
    this.running = false;
    this.mode = 'live';
    this.lastFrameTimestamp = null;
    this.accumulatorMs = 0;
    this.simulationTime = 0;
    this.playbackTime = 0;
    this.position = { x: 0.5, y: 0.5 };
    this.heading = -Math.PI / 2;
    this.seededHeading = false;
    this.buffer = null;
    this.loopBuffer = null;
  }

  async init() {
    this.assertAlive();
    if (this.initialized) return this;
    const capacity = this.bufferCapacity();
    this.buffer = new TrajectoryBuffer({ capacity });
    this.buffer.push({ timestamp: 0, ...this.position });
    this.initialized = true;
    this.running = true;
    this.emit('update');
    return this;
  }

  getState() {
    return { ...clone(this.state), mode: this.mode };
  }

  getSnapshot() {
    if (!this.initialized) {
      return {
        state: this.getState(), mode: this.mode, status: this.mode,
        leader: { ...this.position }, followers: [], trajectory: [],
        analysis: { historyMs: 0, capacity: 0, samples: 0 }
      };
    }
    const source = this.mode === 'loop' ? this.loopBuffer : this.buffer;
    const trajectory = source.toArray();
    const clock = this.mode === 'loop' ? this.playbackTime : this.simulationTime;
    const followers = Array.from({ length: this.state.colony.followerCount }, (_, index) => {
      const delayMs = this.state.colony.firstDelayMs + index * this.state.colony.delayStepMs;
      const base = this.sampleAt(clock - delayMs, source, this.mode === 'loop');
      return {
        id: `follower-${index + 1}`,
        delayMs,
        x: clamp01(base.x + this.variation(index, clock, 'x')),
        y: clamp01(base.y + this.variation(index, clock, 'y'))
      };
    });
    return {
      state: this.getState(),
      mode: this.mode,
      status: this.running ? this.mode : 'stopped',
      leader: { ...this.position },
      followers,
      trajectory,
      analysis: {
        historyMs: source.durationMs,
        capacity: source.capacity,
        samples: source.size,
        loopPeriodMs: this.mode === 'loop' ? source.durationMs + 240 : null,
        simulationTimeMs: this.simulationTime,
        playbackTimeMs: this.mode === 'loop' ? this.playbackTime : null,
        frozen: this.mode === 'loop'
      }
    };
  }

  subscribe(listener) {
    this.assertAlive();
    if (typeof listener !== 'function') throw new TypeError('Listener must be a function.');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Advance from an external monotonic frame clock, using fixed 60 Hz steps. */
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
      this.tick();
      steps += 1;
    }
    if (steps) this.emit('update');
    return steps > 0;
  }

  configure(patch = {}) {
    this.assertAlive();
    const next = normalizeState(mergeState(this.state, patch));
    next.mode = this.mode;
    const nextCapacity = Math.round(next.memory.historySeconds * next.memory.sampleRate) + 1;
    if (this.initialized && nextCapacity !== this.buffer.capacity) this.resizeBuffer(nextCapacity);
    this.state = next;
    this.emit('update');
    return this.getState();
  }

  loop() {
    this.assertReady();
    if (this.mode === 'loop') return false;
    this.loopBuffer = this.buffer.snapshot();
    this.mode = 'loop';
    this.state.mode = 'loop';
    this.playbackTime = this.loopBuffer.latest.timestamp;
    this.position = this.sampleAt(this.playbackTime, this.loopBuffer, true);
    this.running = true;
    this.resetFrameClock();
    this.emit('update');
    return true;
  }

  release() {
    this.assertReady();
    if (this.mode === 'live') return false;
    // Start a fresh live record at the replayed point; old memory is retained by its own frozen snapshot.
    const before = this.sampleAt(this.playbackTime - STEP_MS, this.loopBuffer, true);
    const dx = this.position.x - before.x;
    const dy = this.position.y - before.y;
    if (Math.hypot(dx, dy) > 1e-6) this.heading = Math.atan2(dy, dx);
    this.mode = 'live';
    this.state.mode = 'live';
    this.loopBuffer = null;
    this.buffer = new TrajectoryBuffer({ capacity: this.bufferCapacity() });
    this.buffer.push({ timestamp: this.simulationTime, ...this.position });
    this.running = true;
    this.resetFrameClock();
    this.emit('update');
    return true;
  }

  stop() {
    if (this.destroyed || !this.initialized || !this.running) return false;
    this.running = false;
    this.resetFrameClock();
    this.emit('update');
    return true;
  }

  // The generic Lab interaction methods are intentionally silent for this visual experiment.
  strike() { return false; }
  setPickup() { return false; }

  async destroy() {
    if (this.destroyed) return;
    this.running = false;
    this.destroyed = true;
    this.initialized = false;
    this.listeners.clear();
    this.buffer = null;
    this.loopBuffer = null;
    this.lastFrameTimestamp = null;
  }

  tick() {
    this.simulationTime += STEP_MS;
    if (this.mode === 'loop') {
      this.playbackTime += STEP_MS;
      this.position = this.sampleAt(this.playbackTime, this.loopBuffer, true);
      return;
    }
    this.walk(STEP_MS / 1000);
    this.buffer.push({ timestamp: this.simulationTime, ...this.position });
  }

  walk(dt) {
    // A correlated heading plus a mild inward bias gives smooth wandering and avoids sticking at the edge.
    this.heading += (this.random() * 2 - 1) * this.state.behavior.steering;
    const { x, y } = this.position;
    const edgeX = x < 0.14 ? (0.14 - x) * 2 : x > 0.86 ? -(x - 0.86) * 2 : 0;
    const edgeY = y < 0.14 ? (0.14 - y) * 2 : y > 0.86 ? -(y - 0.86) * 2 : 0;
    if (edgeX || edgeY) this.heading = blendAngle(this.heading, Math.atan2(edgeY, edgeX), Math.min(.22, Math.hypot(edgeX, edgeY)));
    if (!this.seededHeading) { this.heading = this.random() * Math.PI * 2; this.seededHeading = true; }
    const speed = this.state.behavior.speed;
    const nextX = x + Math.cos(this.heading) * speed * dt;
    const nextY = y + Math.sin(this.heading) * speed * dt;
    if (nextX < .02 || nextX > .98) this.heading = Math.PI - this.heading;
    if (nextY < .02 || nextY > .98) this.heading = -this.heading;
    this.position = { x: clampRange(nextX, .02, .98, .5), y: clampRange(nextY, .02, .98, .5) };
  }

  sampleAt(timestamp, buffer, loop) {
    if (!buffer?.size) return { ...this.position };
    if (loop && buffer.size > 1) {
      const first = buffer.oldest;
      const last = buffer.latest;
      const bridgeDuration = 240;
      const period = buffer.durationMs + bridgeDuration;
      const phase = ((timestamp - first.timestamp) % period + period) % period;
      if (phase <= buffer.durationMs) {
        const sample = buffer.sample(first.timestamp + phase);
        return { x: sample.x, y: sample.y };
      }
      const amount = smoothstep((phase - buffer.durationMs) / bridgeDuration);
      return {
        x: last.x + (first.x - last.x) * amount,
        y: last.y + (first.y - last.y) * amount
      };
    }
    const sample = buffer.sample(timestamp, { loop });
    return { x: sample.x, y: sample.y };
  }

  variation(index, time, axis) {
    const phase = index * 1.71 + (axis === 'y' ? 1.3 : 0);
    return Math.sin(time * .0011 + phase) * this.state.behavior.variation;
  }

  bufferCapacity() { return Math.round(this.state.memory.historySeconds * this.state.memory.sampleRate) + 1; }
  resizeBuffer(capacity) {
    const replacement = new TrajectoryBuffer({ capacity });
    for (const sample of this.buffer.toArray().slice(-capacity)) replacement.push(sample);
    this.buffer = replacement;
  }
  resetFrameClock() { this.lastFrameTimestamp = null; this.accumulatorMs = 0; }
  assertAlive() { if (this.destroyed) throw new Error('AntController has been destroyed.'); }
  assertReady() { this.assertAlive(); if (!this.initialized) throw new Error('AntController has not been initialized.'); }
  emit(type) {
    if (this.destroyed) return;
    const event = { type, payload: this.getSnapshot() };
    for (const listener of [...this.listeners]) listener(event);
  }
}

function mergeState(base, patch) {
  return {
    ...clone(base),
    ...clone(patch),
    memory: { ...clone(base.memory), ...clone(patch.memory || {}) },
    colony: { ...clone(base.colony), ...clone(patch.colony || {}) },
    behavior: { ...clone(base.behavior), ...clone(patch.behavior || {}) }
  };
}
function normalizeState(input) {
  const state = mergeState(DEFAULT_STATE, input);
  state.model = 'ant';
  state.mode = 'live';
  state.memory.historySeconds = clampRange(state.memory.historySeconds, 1, 30, 5);
  state.memory.sampleRate = 60;
  state.colony.followerCount = 7;
  state.colony.firstDelayMs = clampRange(state.colony.firstDelayMs, 20, 1000, 120);
  state.colony.delayStepMs = clampRange(state.colony.delayStepMs, 20, 1000, 120);
  state.behavior.speed = clampRange(state.behavior.speed, 0.02, 0.5, 0.18);
  state.behavior.steering = clampRange(state.behavior.steering, 0.01, 1, 0.14);
  state.behavior.variation = clampRange(state.behavior.variation, 0, 0.006, 0.003);
  return state;
}
function clone(value) { return structuredClone(value); }
function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function clampRange(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}
function blendAngle(from, to, amount) {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference * amount;
}
function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
