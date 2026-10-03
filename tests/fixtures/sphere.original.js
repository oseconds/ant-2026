// Regression reference copied from the pre-refactor html/steel-sphere/steel-sphere-processor.js.
// Keep this original DSP implementation for sample-equivalence tests.
class SteelSphereProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.sampleRate = sampleRate;
    this.quality = options.processorOptions.quality || "low";
    this.diameter = Number(options.processorOptions.diameter || 2);
    this.material = options.processorOptions.material || {
      name: "304 스테인리스",
      density: 8000,
      youngModulus: 193e9,
      poisson: 0.29
    };
    this.damping = Number(options.processorOptions.damping ?? 34);
    this.strength = Number(options.processorOptions.strength ?? 62);
    this.hitQueue = [];
    this.active = false;
    this.outputGain = 2.2;
    this.pickup = options.processorOptions.pickup || {
      x: 0.72,
      y: 0,
      z: Math.sqrt(1 - 0.72 * 0.72)
    };
    this.buildModes();
    this.port.onmessage = (event) => {
      const message = event.data;
      if (message.type === "strike") {
        if (this.hitQueue.length < 32) this.hitQueue.push(message);
      } else if (message.type === "quality") {
        this.quality = message.value;
        this.buildModes();
      } else if (message.type === "configure") {
        this.diameter = message.diameter;
        this.material = message.material;
        this.buildModes();
      } else if (message.type === "settings") {
        this.damping = message.damping;
        this.strength = message.strength;
        this.updateDecay();
      } else if (message.type === "stop") {
        this.clearModel();
      }
    };
  }

  buildModes() {
    const oldModes = new Map((this.modes || []).map((mode) => [mode.key, mode]));
    const alphaByDegree = [
      [4.4934, 7.7253, 10.9041, 14.0662],
      [2.0816, 5.9404, 9.2058, 12.4044],
      [3.3421, 7.2899, 10.6139, 13.8461],
      [4.5141, 8.5838, 11.9727, 15.2441],
      [5.6467, 9.8404, 13.2956, 16.6210],
      [6.7565, 11.0700, 14.5900, 17.9660],
      [7.8511, 12.2847, 15.8632, 19.2860]
    ];
    const density = this.material.density;
    const youngModulus = this.material.youngModulus;
    const poisson = this.material.poisson;
    const shearModulus = youngModulus / (2 * (1 + poisson));
    const lameLambda = youngModulus * poisson / ((1 + poisson) * (1 - 2 * poisson));
    const longitudinalSpeed = Math.sqrt((lameLambda + 2 * shearModulus) / density);
    const shearSpeed = Math.sqrt(shearModulus / density);
    const radius = this.diameter / 2;
    const qualityLimit = { low: 48, normal: 96, high: 160 }[this.quality] || 48;
    const families = [];

    for (let degree = 0; degree < alphaByDegree.length; degree++) {
      for (let radial = 0; radial < alphaByDegree[degree].length; radial++) {
        const alpha = alphaByDegree[degree][radial];
        const longitudinalFrequency = longitudinalSpeed * alpha / (2 * Math.PI * radius);
        const shearFrequency = shearSpeed * alpha / (2 * Math.PI * radius);
        const maxFrequency = this.sampleRate * 0.46;
        const hasLongitudinal = longitudinalFrequency < maxFrequency;
        const hasShear = shearFrequency < maxFrequency;
        const components = (2 * degree + 1) * (Number(hasLongitudinal) + Number(hasShear));
        if (components > 0) {
          families.push({
            degree,
            radial,
            alpha,
            components,
            hasLongitudinal,
            hasShear,
            longitudinalFrequency,
            shearFrequency
          });
        }
      }
    }

    families.sort((a, b) => Math.min(a.longitudinalFrequency, a.shearFrequency)
      - Math.min(b.longitudinalFrequency, b.shearFrequency));
    const selected = [];
    let componentCount = 0;
    for (const family of families) {
      if (componentCount && componentCount + family.components > qualityLimit) continue;
      selected.push(family);
      componentCount += family.components;
      if (componentCount >= qualityLimit) break;
    }

    this.modes = [];
    for (const family of selected) {
      const angularWeight = 1 / Math.sqrt(2 * family.degree + 1);
      for (let m = -family.degree; m <= family.degree; m++) {
        if (family.hasLongitudinal) {
          this.restoreMode(this.makeMode(family, m, family.longitudinalFrequency, 0.78 * angularWeight, "P"), oldModes);
        }
        if (family.hasShear) {
          this.restoreMode(this.makeMode(family, m, family.shearFrequency, 0.32 * angularWeight, "S"), oldModes);
        }
      }
    }
    this.updateDecay();
    this.active = this.modes.some((mode) => Math.abs(mode.current) + Math.abs(mode.previous) > 1e-9);
    this.port.postMessage({
      type: "model",
      modes: this.modes.length,
      families: selected.length,
      longitudinalSpeed: Math.round(longitudinalSpeed),
      shearSpeed: Math.round(shearSpeed),
      mass: density * (4 / 3) * Math.PI * radius ** 3
    });
  }

  makeMode(family, m, frequency, branchGain, branch) {
    return {
      key: [family.degree, family.radial, m, branch].join(":"),
      degree: family.degree,
      m,
      frequency,
      branchGain,
      current: 0,
      previous: 0,
      coefficient: this.sphericalHarmonic(family.degree, m, this.pickup) * branchGain,
      radius: 0,
      cosine: 0,
      active: false
    };
  }

  restoreMode(mode, oldModes) {
    const old = oldModes.get(mode.key);
    if (old) {
      mode.current = old.current;
      mode.previous = old.previous;
      mode.active = old.active;
    }
    this.modes.push(mode);
  }

  updateDecay() {
    const dampingAmount = Math.max(0, Math.min(100, Number(this.damping))) / 100;
    for (const mode of this.modes) {
      const frequency = mode.frequency;
      const seconds = (5.2 / (1 + frequency / 7800)) / (0.52 + 3.1 * dampingAmount);
      mode.radius = Math.exp(-1 / (Math.max(0.18, seconds) * this.sampleRate));
      mode.cosine = 2 * mode.radius * Math.cos(2 * Math.PI * frequency / this.sampleRate);
    }
  }

  associatedLegendre(degree, order, z) {
    let pmm = 1;
    if (order > 0) {
      const root = Math.sqrt(Math.max(0, 1 - z * z));
      let factor = 1;
      for (let i = 1; i <= order; i++) {
        pmm *= -factor * root;
        factor += 2;
      }
    }
    if (degree === order) return pmm;
    let previousPrevious = pmm;
    let previous = z * (2 * order + 1) * pmm;
    if (degree === order + 1) return previous;
    for (let n = order + 2; n <= degree; n++) {
      const current = ((2 * n - 1) * z * previous - (n + order - 1) * previousPrevious) / (n - order);
      previousPrevious = previous;
      previous = current;
    }
    return previous;
  }

  factorial(value) {
    let result = 1;
    for (let i = 2; i <= value; i++) result *= i;
    return result;
  }

  sphericalHarmonic(degree, m, point) {
    const order = Math.abs(m);
    const normalization = Math.sqrt(((2 * degree + 1) / (4 * Math.PI))
      * this.factorial(degree - order) / this.factorial(degree + order));
    const legendre = this.associatedLegendre(degree, order, point.z);
    if (m === 0) return normalization * legendre;
    const phi = Math.atan2(point.y, point.x);
    const scale = Math.SQRT2 * normalization * legendre;
    return m > 0 ? scale * Math.cos(order * phi) : scale * Math.sin(order * phi);
  }

  applyStrike(message) {
    const x = Number(message.x) || 0;
    const y = Number(message.y) || 0;
    const fallbackZ = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    const z = Number.isFinite(Number(message.z)) ? Number(message.z) : fallbackZ;
    const length = Math.hypot(x, y, z) || 1;
    const point = { x: x / length, y: y / length, z: z / length };
    const strength = Math.max(0, Math.min(1, Number(message.strength ?? this.strength) / 100));
    for (const mode of this.modes) {
      const hitShape = this.sphericalHarmonic(mode.degree, mode.m, point);
      const contactWeight = 1 / (1 + (mode.frequency / 13500) ** 2);
      mode.previous -= strength * 0.48 * hitShape * contactWeight;
      mode.active = true;
    }
    this.active = true;
  }

  clearModel() {
    for (const mode of this.modes) {
      mode.current = 0;
      mode.previous = 0;
      mode.active = false;
    }
    this.hitQueue.length = 0;
    this.active = false;
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;
    if (this.hitQueue.length) {
      const hits = this.hitQueue.splice(0);
      for (const hit of hits) this.applyStrike(hit);
    }
    if (!this.active) {
      output.fill(0);
      return true;
    }

    const modes = this.modes;
    for (let frame = 0; frame < output.length; frame++) {
      let sum = 0;
      let energy = 0;
      for (const mode of modes) {
        if (!mode.active) continue;
        const next = mode.cosine * mode.current - mode.radius * mode.radius * mode.previous;
        mode.previous = mode.current;
        mode.current = next;
        sum += next * mode.coefficient;
        energy += Math.abs(next * mode.coefficient);
      }
      const normalized = sum * this.outputGain;
      output[frame] = normalized / Math.sqrt(1 + normalized * normalized);
      if (energy < 1e-9) this.active = false;
    }
    return true;
  }
}

registerProcessor("steel-sphere-processor", SteelSphereProcessor);
