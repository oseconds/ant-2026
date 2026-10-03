// Regression reference copied from the pre-refactor html/circular-plate/circular-plate-processor.js.
// Keep this original DSP implementation for sample-equivalence tests; intentional pickup behavior is excluded.
class CircularPlateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.sampleRate = sampleRate;
    this.resolution = options.processorOptions.resolution || "normal";
    this.stiffnessControl = Number(options.processorOptions.stiffness || 0.92);
    this.dampingControl = Number(options.processorOptions.damping || 35);
    this.sensorX = Number(options.processorOptions.sensorX || 0.28);
    this.sensorY = Number(options.processorOptions.sensorY || -0.18);
    this.active = false;
    this.frameClock = 0;
    this.checkClock = 0;
    this.hitQueue = [];
    this.buildGrid(false);
    this.port.onmessage = (event) => {
      const message = event.data;
      if (message.type === "strike") {
        if (this.hitQueue.length < 24) this.hitQueue.push(message);
      } else if (message.type === "resolution") {
        this.resolution = message.value;
        this.buildGrid(true);
      } else if (message.type === "settings") {
        this.stiffnessControl = message.stiffness;
        this.dampingControl = message.damping;
        this.updateCoefficients();
      } else if (message.type === "stop") {
        this.clearModel();
      }
    };
  }

  buildGrid(preserve) {
    const old = preserve && this.current ? {
      size: this.size,
      center: this.center,
      radius: this.radius,
      current: this.current,
      previous: this.previous,
      active: this.active
    } : null;
    const sizeByQuality = { low: 13, normal: 17, high: 21 };
    this.size = sizeByQuality[this.resolution] || sizeByQuality.normal;
    this.center = (this.size - 1) / 2;
    this.radius = this.center - 0.7;
    const length = this.size * this.size;
    this.mask = new Uint8Array(length);
    this.indices = [];
    this.left = new Int32Array(length);
    this.right = new Int32Array(length);
    this.up = new Int32Array(length);
    this.down = new Int32Array(length);
    this.left.fill(-1);
    this.right.fill(-1);
    this.up.fill(-1);
    this.down.fill(-1);

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const dx = x - this.center;
        const dy = y - this.center;
        const index = y * this.size + x;
        if (dx * dx + dy * dy <= this.radius * this.radius) {
          this.mask[index] = 1;
          this.indices.push(index);
        }
      }
    }
    for (let k = 0; k < this.indices.length; k++) {
      const index = this.indices[k];
      const x = index % this.size;
      const y = (index / this.size) | 0;
      if (x > 0 && this.mask[index - 1]) this.left[index] = index - 1;
      if (x + 1 < this.size && this.mask[index + 1]) this.right[index] = index + 1;
      if (y > 0 && this.mask[index - this.size]) this.up[index] = index - this.size;
      if (y + 1 < this.size && this.mask[index + this.size]) this.down[index] = index + this.size;
    }

    this.current = new Float32Array(length);
    this.previous = new Float32Array(length);
    this.next = new Float32Array(length);
    this.laplacian = new Float32Array(length);
    this.previousLaplacian = new Float32Array(length);
    if (old) {
      for (let k = 0; k < this.indices.length; k++) {
        const index = this.indices[k];
        const x = index % this.size;
        const y = (index / this.size) | 0;
        const nx = (x - this.center) / this.radius;
        const ny = (y - this.center) / this.radius;
        if (nx * nx + ny * ny <= 0.96) {
          this.current[index] = this.sampleOld(old.current, old, nx, ny);
          this.previous[index] = this.sampleOld(old.previous, old, nx, ny);
        }
      }
      this.active = old.active;
    } else {
      this.active = false;
    }
    this.recomputePreviousLaplacian();
    this.pickup = this.findNearest(this.sensorX, this.sensorY);
    this.updateCoefficients();
    this.port.postMessage({ type: "grid", size: this.size, nodes: this.indices.length });
    this.sendFrame();
  }

  sampleOld(field, old, nx, ny) {
    const x = (nx * old.radius + old.center);
    const y = (ny * old.radius + old.center);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const at = (ix, iy) => (ix < 0 || iy < 0 || ix >= old.size || iy >= old.size) ? 0 : field[iy * old.size + ix];
    const a = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const b = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return a * (1 - fy) + b * fy;
  }

  findNearest(x, y) {
    const px = this.center + x * this.radius;
    const py = this.center + y * this.radius;
    let nearest = this.indices[0];
    let nearestDistance = Infinity;
    for (let k = 0; k < this.indices.length; k++) {
      const index = this.indices[k];
      const dx = index % this.size - px;
      const dy = ((index / this.size) | 0) - py;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    }
    return nearest;
  }

  updateCoefficients() {
    const maxRadius = 9.3;
    const rateScale = 48000 / this.sampleRate;
    const radiusRatio = this.radius / maxRadius;
    const mu = 0.18 * radiusRatio * radiusRatio * this.stiffnessControl * rateScale;
    const lambda = 0.045 * radiusRatio * rateScale;
    this.stiffnessTerm = mu * mu;
    this.tensionTerm = lambda * lambda;
    this.loss = (0.000018 + 0.00016 * (this.dampingControl / 100)) * rateScale;
    this.frequencyLoss = 0.0001 * radiusRatio * radiusRatio
      * (0.2 + 0.8 * (this.dampingControl / 100)) * rateScale;
  }

  recomputePreviousLaplacian() {
    const field = this.previous;
    const lap = this.previousLaplacian;
    for (let k = 0; k < this.indices.length; k++) {
      const i = this.indices[k];
      const l = this.left[i], r = this.right[i], u = this.up[i], d = this.down[i];
      lap[i] = (l >= 0 ? field[l] : 0) + (r >= 0 ? field[r] : 0)
        + (u >= 0 ? field[u] : 0) + (d >= 0 ? field[d] : 0) - 4 * field[i];
    }
  }

  applyStrike(message) {
    const x = Math.max(-0.92, Math.min(0.92, message.x));
    const y = Math.max(-0.92, Math.min(0.92, message.y));
    this.pickup = this.findNearest(x, y);
    const px = this.center + x * this.radius;
    const py = this.center + y * this.radius;
    const centerX = Math.round(px);
    const centerY = Math.round(py);
    const width = 0.72;
    const amplitude = Math.max(0.01, Math.min(0.25, message.strength || 0.09));
    for (let oy = -3; oy <= 3; oy++) {
      for (let ox = -3; ox <= 3; ox++) {
        const gx = centerX + ox;
        const gy = centerY + oy;
        if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) continue;
        const index = gy * this.size + gx;
        if (!this.mask[index]) continue;
        const dx = gx - px;
        const dy = gy - py;
        const weight = Math.exp(-(dx * dx + dy * dy) / (2 * width * width));
        this.previous[index] -= amplitude * weight * (0.92 + Math.random() * 0.16);
      }
    }
    this.recomputePreviousLaplacian();
    this.active = true;
  }

  clearModel() {
    this.current.fill(0);
    this.previous.fill(0);
    this.next.fill(0);
    this.laplacian.fill(0);
    this.previousLaplacian.fill(0);
    this.hitQueue.length = 0;
    this.active = false;
    this.sendFrame();
  }

  sendFrame() {
    this.port.postMessage({
      type: "frame",
      size: this.size,
      radius: this.radius,
      values: this.current.slice()
    });
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;
    if (this.hitQueue.length) {
      const hits = this.hitQueue.splice(0);
      for (let i = 0; i < hits.length; i++) this.applyStrike(hits[i]);
    }
    if (!this.active) {
      output.fill(0);
      return true;
    }

    const indices = this.indices;
    const left = this.left;
    const right = this.right;
    const up = this.up;
    const down = this.down;
    const wave = this.tensionTerm;
    const bend = this.stiffnessTerm;
    const loss = this.loss;
    const frequencyLoss = this.frequencyLoss;

    for (let frame = 0; frame < output.length; frame++) {
      // Refresh these after every swap so each audio sample advances the model.
      const current = this.current;
      const previous = this.previous;
      const next = this.next;
      const lap = this.laplacian;
      const previousLaplacian = this.previousLaplacian;
      for (let k = 0; k < indices.length; k++) {
        const i = indices[k];
        const l = left[i], r = right[i], u = up[i], d = down[i];
        lap[i] = (l >= 0 ? current[l] : 0) + (r >= 0 ? current[r] : 0)
          + (u >= 0 ? current[u] : 0) + (d >= 0 ? current[d] : 0) - 4 * current[i];
      }
      for (let k = 0; k < indices.length; k++) {
        const i = indices[k];
        const l = left[i], r = right[i], u = up[i], d = down[i];
        const lapCenter = lap[i];
        const biharmonic = (l >= 0 ? lap[l] : 0) + (r >= 0 ? lap[r] : 0)
          + (u >= 0 ? lap[u] : 0) + (d >= 0 ? lap[d] : 0) - 4 * lapCenter;
        const velocity = current[i] - previous[i];
        next[i] = 2 * current[i] - previous[i] + wave * lapCenter - bend * biharmonic
          - loss * velocity + frequencyLoss * (lapCenter - previousLaplacian[i]);
      }
      const oldPrevious = this.previous;
      this.previous = this.current;
      this.current = this.next;
      this.next = oldPrevious;
      this.laplacian = previousLaplacian;
      this.previousLaplacian = lap;
      const sample = this.current[this.pickup] * 8;
      output[frame] = sample / (1 + Math.abs(sample));
    }

    this.frameClock += output.length;
    this.checkClock += output.length;
    if (this.frameClock >= this.sampleRate / 30) {
      this.frameClock = 0;
      this.sendFrame();
    }
    if (this.checkClock >= this.sampleRate / 8) {
      this.checkClock = 0;
      let peak = 0;
      for (let k = 0; k < indices.length; k++) {
        const magnitude = Math.abs(this.current[indices[k]]);
        if (magnitude > peak) peak = magnitude;
      }
      if (peak < 0.000002) this.clearModel();
    }
    return true;
  }
}
registerProcessor("circular-plate-processor", CircularPlateProcessor);
