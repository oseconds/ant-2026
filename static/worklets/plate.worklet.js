class CircularPlateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.sampleRate = sampleRate;
    const config = options.processorOptions || {};
    this.resolution = config.resolution ?? 'normal';
    this.stiffnessControl = Number(config.stiffness ?? 0.92);
    this.dampingControl = Number(config.damping ?? 35);
    const pickup = config.pickup ?? { x: 0.28, y: -0.18 };
    this.pickupPosition = { x: Number(pickup.x ?? 0.28), y: Number(pickup.y ?? -0.18) };
    this.stereoPickupPositions = normalizeStereoPickups(config.stereoPickups);
    this.stereoPickupIndices = null;
    this.active = false;
    this.destroyed = false;
    this.frameClock = 0;
    this.checkClock = 0;
    this.hitQueue = [];
    this.buildGrid(false);
    this.port.onmessage = ({ data }) => this.handleMessage(data);
  }

  handleMessage(message = {}) {
    const payload = message.payload || {};
    switch (message.type) {
      case 'strike':
        if (this.hitQueue.length < 24) this.hitQueue.push(payload);
        break;
      case 'configure': {
        const priorResolution = this.resolution;
        if (['low', 'normal', 'high'].includes(payload.resolution)) this.resolution = payload.resolution;
        if (Number.isFinite(payload.stiffness)) this.stiffnessControl = this.clamp(payload.stiffness, 0.65, 1.15);
        if (Number.isFinite(payload.damping)) this.dampingControl = this.clamp(payload.damping, 0, 100);
        if (payload.pickup) this.setPickup(payload.pickup);
        if (priorResolution !== this.resolution) this.buildGrid(true);
        else this.updateCoefficients();
        break;
      }
      case 'setPickup':
        this.setPickup(payload.position);
        break;
      case 'stop':
        this.clearModel();
        break;
      case 'destroy':
        this.destroyed = true;
        this.hitQueue.length = 0;
        this.port.onmessage = null;
        break;
    }
  }

  clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  setPickup(position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
    let x = this.clamp(position.x, -0.92, 0.92);
    let y = this.clamp(position.y, -0.92, 0.92);
    const length = Math.hypot(x, y);
    if (length > 0.92) { x *= 0.92 / length; y *= 0.92 / length; }
    this.pickupPosition = { x, y };
    this.pickup = this.findNearest(x, y);
  }

  buildGrid(preserve) {
    const old = preserve && this.current ? {
      size: this.size, center: this.center, radius: this.radius,
      current: this.current, previous: this.previous, active: this.active
    } : null;
    const sizeByQuality = { low: 13, normal: 17, high: 21 };
    this.size = sizeByQuality[this.resolution] || sizeByQuality.normal;
    this.center = (this.size - 1) / 2;
    this.radius = this.center - 0.7;
    const length = this.size * this.size;
    this.mask = new Uint8Array(length);
    this.indices = [];
    this.left = new Int32Array(length); this.right = new Int32Array(length);
    this.up = new Int32Array(length); this.down = new Int32Array(length);
    this.left.fill(-1); this.right.fill(-1); this.up.fill(-1); this.down.fill(-1);
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      const dx = x - this.center, dy = y - this.center, index = y * this.size + x;
      if (dx * dx + dy * dy <= this.radius * this.radius) { this.mask[index] = 1; this.indices.push(index); }
    }
    for (const index of this.indices) {
      const x = index % this.size, y = (index / this.size) | 0;
      if (x > 0 && this.mask[index - 1]) this.left[index] = index - 1;
      if (x + 1 < this.size && this.mask[index + 1]) this.right[index] = index + 1;
      if (y > 0 && this.mask[index - this.size]) this.up[index] = index - this.size;
      if (y + 1 < this.size && this.mask[index + this.size]) this.down[index] = index + this.size;
    }
    this.current = new Float32Array(length); this.previous = new Float32Array(length);
    this.next = new Float32Array(length); this.laplacian = new Float32Array(length);
    this.previousLaplacian = new Float32Array(length);
    if (old) {
      for (const index of this.indices) {
        const x = index % this.size, y = (index / this.size) | 0;
        const nx = (x - this.center) / this.radius, ny = (y - this.center) / this.radius;
        if (nx * nx + ny * ny <= 0.96) {
          this.current[index] = this.sampleOld(old.current, old, nx, ny);
          this.previous[index] = this.sampleOld(old.previous, old, nx, ny);
        }
      }
      this.active = old.active;
    } else this.active = false;
    this.pickup = this.findNearest(this.pickupPosition.x, this.pickupPosition.y);
    this.stereoPickupIndices = this.stereoPickupPositions
      ? this.stereoPickupPositions.map(({ x, y }) => this.findNearest(x, y)) : null;
    this.recomputePreviousLaplacian();
    this.updateCoefficients();
    this.post('grid', { size: this.size, nodes: this.indices.length });
    this.sendFrame();
  }

  sampleOld(field, old, nx, ny) {
    const x = nx * old.radius + old.center, y = ny * old.radius + old.center;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const at = (ix, iy) => ix < 0 || iy < 0 || ix >= old.size || iy >= old.size ? 0 : field[iy * old.size + ix];
    const a = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const b = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return a * (1 - fy) + b * fy;
  }

  findNearest(x, y) {
    const px = this.center + x * this.radius, py = this.center + y * this.radius;
    let nearest = this.indices[0], distance = Infinity;
    for (const index of this.indices) {
      const dx = index % this.size - px, dy = ((index / this.size) | 0) - py;
      const candidate = dx * dx + dy * dy;
      if (candidate < distance) { distance = candidate; nearest = index; }
    }
    return nearest;
  }

  updateCoefficients() {
    const rateScale = 48000 / this.sampleRate, radiusRatio = this.radius / 9.3;
    const mu = 0.18 * radiusRatio * radiusRatio * this.stiffnessControl * rateScale;
    const lambda = 0.045 * radiusRatio * rateScale;
    this.stiffnessTerm = mu * mu; this.tensionTerm = lambda * lambda;
    this.loss = (0.000018 + 0.00016 * (this.dampingControl / 100)) * rateScale;
    this.frequencyLoss = 0.0001 * radiusRatio * radiusRatio * (0.2 + 0.8 * (this.dampingControl / 100)) * rateScale;
  }

  recomputePreviousLaplacian() {
    const field = this.previous, lap = this.previousLaplacian;
    for (const i of this.indices) {
      const l = this.left[i], r = this.right[i], u = this.up[i], d = this.down[i];
      lap[i] = (l >= 0 ? field[l] : 0) + (r >= 0 ? field[r] : 0) + (u >= 0 ? field[u] : 0) + (d >= 0 ? field[d] : 0) - 4 * field[i];
    }
  }

  applyStrike({ position = { x: 0, y: 0 }, strength = 0.36 } = {}) {
    const x = this.clamp(Number(position.x) || 0, -0.92, 0.92), y = this.clamp(Number(position.y) || 0, -0.92, 0.92);
    const normalizedStrength = this.clamp(Number(strength) || 0, 0, 1);
    if (normalizedStrength === 0) return;
    const px = this.center + x * this.radius, py = this.center + y * this.radius;
    const centerX = Math.round(px), centerY = Math.round(py), width = 0.72;
    const amplitude = 0.01 + normalizedStrength * 0.24;
    for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
      const gx = centerX + ox, gy = centerY + oy;
      if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) continue;
      const index = gy * this.size + gx;
      if (!this.mask[index]) continue;
      const dx = gx - px, dy = gy - py;
      const weight = Math.exp(-(dx * dx + dy * dy) / (2 * width * width));
      this.previous[index] -= amplitude * weight * (0.92 + Math.random() * 0.16);
    }
    this.recomputePreviousLaplacian();
    this.active = true;
    this.post('activity', { active: true });
  }

  clearModel() {
    this.current.fill(0); this.previous.fill(0); this.next.fill(0);
    this.laplacian.fill(0); this.previousLaplacian.fill(0);
    this.hitQueue.length = 0; this.active = false;
    this.sendFrame(); this.post('activity', { active: false });
  }

  post(type, payload) { this.port.postMessage({ type, payload }); }

  sendFrame() { this.post('frame', { size: this.size, radius: this.radius, values: this.current.slice() }); }

  process(inputs, outputs) {
    if (this.destroyed) return false;
    const channels = outputs[0];
    const output = channels?.[0];
    if (!output) return true;
    if (this.hitQueue.length) for (const hit of this.hitQueue.splice(0)) this.applyStrike(hit);
    if (!this.active) {
      for (const channel of channels) channel.fill(0);
      return true;
    }
    const stereo = this.stereoPickupIndices && channels.length >= 2;
    const rightOutput = stereo ? channels[1] : null;
    const { indices, left, right, up, down } = this;
    for (let frame = 0; frame < output.length; frame++) {
      const current = this.current, previous = this.previous, next = this.next;
      const lap = this.laplacian, previousLaplacian = this.previousLaplacian;
      for (const i of indices) {
        const l = left[i], r = right[i], u = up[i], d = down[i];
        lap[i] = (l >= 0 ? current[l] : 0) + (r >= 0 ? current[r] : 0) + (u >= 0 ? current[u] : 0) + (d >= 0 ? current[d] : 0) - 4 * current[i];
      }
      for (const i of indices) {
        const l = left[i], r = right[i], u = up[i], d = down[i], lapCenter = lap[i];
        const biharmonic = (l >= 0 ? lap[l] : 0) + (r >= 0 ? lap[r] : 0) + (u >= 0 ? lap[u] : 0) + (d >= 0 ? lap[d] : 0) - 4 * lapCenter;
        const velocity = current[i] - previous[i];
        next[i] = 2 * current[i] - previous[i] + this.tensionTerm * lapCenter - this.stiffnessTerm * biharmonic
          - this.loss * velocity + this.frequencyLoss * (lapCenter - previousLaplacian[i]);
      }
      const oldPrevious = this.previous;
      this.previous = this.current; this.current = this.next; this.next = oldPrevious;
      this.laplacian = previousLaplacian; this.previousLaplacian = lap;
      if (stereo) {
        const leftSample = this.current[this.stereoPickupIndices[0]] * 8;
        const rightSample = this.current[this.stereoPickupIndices[1]] * 8;
        output[frame] = leftSample / (1 + Math.abs(leftSample));
        rightOutput[frame] = rightSample / (1 + Math.abs(rightSample));
      } else {
        const sample = this.current[this.pickup] * 8;
        output[frame] = sample / (1 + Math.abs(sample));
      }
    }
    this.frameClock += output.length; this.checkClock += output.length;
    if (this.frameClock >= this.sampleRate / 30) { this.frameClock = 0; this.sendFrame(); }
    if (this.checkClock >= this.sampleRate / 8) {
      this.checkClock = 0;
      let peak = 0;
      for (const i of indices) peak = Math.max(peak, Math.abs(this.current[i]));
      if (peak < 0.000002) this.clearModel();
    }
    return true;
  }
}

function normalizeStereoPickups(positions) {
  if (!Array.isArray(positions) || positions.length !== 2
    || positions.some(position => !position || !Number.isFinite(position.x) || !Number.isFinite(position.y))) return null;
  return positions.map(position => {
    let x = Math.max(-0.92, Math.min(0.92, position.x));
    let y = Math.max(-0.92, Math.min(0.92, position.y));
    const length = Math.hypot(x, y);
    if (length > 0.92) { x *= 0.92 / length; y *= 0.92 / length; }
    return { x, y };
  });
}

registerProcessor('plate-processor', CircularPlateProcessor);
