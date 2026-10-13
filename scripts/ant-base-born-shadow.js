import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const DEFAULT_GENERIC = new URL('../static/worklets/plate.worklet.js', import.meta.url);
const DEFAULT_FRAMES = 72_000;

function replaceOnce(source, before, after, label) {
  if (source.split(before).length !== 2) throw new Error(`${label} anchor missing or ambiguous`);
  return source.replace(before, after);
}

export function transformSurface(source, { pulseSteps = 18, spatial = 'production', jitterSeed, frequencyLoss } = {}) {
  if (typeof source !== 'string' || !source.includes('class SurfacePlateProcessor'))
    throw new TypeError('source must be the ANT surface worklet');
  if (![1, 6, 18].includes(pulseSteps)) throw new RangeError('pulseSteps must be 1, 6, or 18');
  if (!['production', 'base-grid', 'base-world-width'].includes(spatial)) throw new RangeError('unknown spatial transform');
  if (jitterSeed !== undefined && !Number.isSafeInteger(jitterSeed)) throw new TypeError('jitterSeed must be an integer');
  if (frequencyLoss !== undefined && (!Number.isFinite(frequencyLoss) || frequencyLoss < 0)) throw new RangeError('frequencyLoss must be finite and nonnegative');
  let transformed = source;
  const patches = [];
  const patch = (before, after, name) => { transformed = replaceOnce(transformed, before, after, name); patches.push(name); };
  if (pulseSteps !== 18) patch('const CONTACT_PULSE_STEPS = Math.round(RATE * 0.003);',
    `const CONTACT_PULSE_STEPS = ${pulseSteps};`, 'contact pulse');

  if (spatial !== 'production' || jitterSeed !== undefined) {
    if (spatial !== 'production') {
      const sigma = spatial === 'base-grid' ? '0.72'
        : '(0.72 * 31 / (2 * (0.92 / Math.sqrt(2)) * 7.3))';
      patch('  const sigma = radius * (GRID - 1);', `  const sigma = ${sigma};`, `spatial ${spatial}`);
    }
    patch('  let normSq = 0;\n  for (let node = begin; node < end; node++) {\n    const cell = t.nodeGridIndices[node], gx = cell % GRID, gy = Math.floor(cell / GRID);\n    const w = integratedGaussian(gx, gy, x, y, sigma); normSq += w * w;\n  }',
      '  let normSq = 0;\n  const strikeIndex = proc.telemetry.strikes + 1;\n  proc.__baseBornDraws ||= []; proc.__baseBornDrawMap ||= new Map();\n  for (let node = begin; node < end; node++) {\n    const cell = t.nodeGridIndices[node], gx = cell % GRID, gy = Math.floor(cell / GRID);\n    const w = shadowBornWeight(gx, gy, x, y, sigma, strikeIndex, node, proc); normSq += w * w;\n  }', 'spatial normalization');
    patch('  const reach = 4 * sigma + 0.5;',
      `  const reach = ${spatial === 'base-grid' ? '3.5' : '4 * sigma + 0.5'};`, 'spatial support');
    patch('    const w = integratedGaussian(gx, gy, x, y, sigma);\n    if (w * w < 1e-12 * normSq) continue;',
      '    const w = shadowBornWeight(gx, gy, x, y, sigma, strikeIndex, node, proc);\n    if (w * w < 1e-12 * normSq) continue;', 'spatial injection');
    transformed += `\nconst SHADOW_SPATIAL = ${JSON.stringify(spatial)};\nconst SHADOW_JITTER_SEED = ${Number.isSafeInteger(jitterSeed) ? jitterSeed >>> 0 : 1};\nfunction shadowBornWeight(gx, gy, x, y, sigma, event, node, proc) {\n  if (SHADOW_SPATIAL === 'base-grid' && (Math.abs(gx - Math.round(x)) > 3 || Math.abs(gy - Math.round(y)) > 3)) return 0;\n  const base = SHADOW_SPATIAL === 'base-grid'\n    ? Math.exp(-((gx - x) ** 2 + (gy - y) ** 2) / (2 * sigma * sigma))\n    : integratedGaussian(gx, gy, x, y, sigma);\n  if (${jitterSeed !== undefined}) {\n    const key = event + ':' + node;\n    if (proc.__baseBornDrawMap.has(key)) return base * proc.__baseBornDrawMap.get(key);\n    let h = (SHADOW_JITTER_SEED ^ Math.imul(event, 0x9e3779b1) ^ Math.imul(node + 1, 0x85ebca6b)) >>> 0;\n    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;\n    const draw = (h >>> 0) / 0x100000000, factor = 0.92 + draw * 0.16;\n    proc.__baseBornDrawMap.set(key, factor); proc.__baseBornDraws.push({ event, node, draw, factor });\n    return base * factor;\n  }\n  return base;\n}\n`;
    patches.push('diagnostic spatial helper');
    if (jitterSeed !== undefined) {
      patch('    const result = { ...this.telemetry, layers:',
        '    const result = { ...this.telemetry, baseBornJitterDraws: this.__baseBornDraws || [], layers:', 'jitter receipt');
    }
  }

  if (frequencyLoss) patch('      const next = 2 * value - this.previous[node] - bending * lapOfLap\n        + tension * lap[node] / density - damping * vel + linkForce;',
    `      const previousDisplacement = this.previous[node], previousNeighbors = node * 4;\n      let previousLap = -4 * previousDisplacement;\n      for (let d = 0; d < 4; d++) { const other = neigh[previousNeighbors + d]; if (other >= 0) previousLap += this.previous[other]; }\n      const next = 2 * value - previousDisplacement - bending * lapOfLap\n        + tension * lap[node] / density - damping * vel + linkForce + ${frequencyLoss} * (lap[node] - previousLap);`, 'Born frequency loss');

  return { source: transformed, patches, definition: { pulseSteps, spatial, jitterSeed: jitterSeed ?? null, frequencyLoss: frequencyLoss ?? 0 } };
}

export function rateAwareSurface(source, topology, { baseElastic = false, instant = false } = {}) {
  if (typeof source !== 'string' || !source.includes('class SurfacePlateProcessor'))
    throw new TypeError('source must be the ANT surface worklet');
  if (!topology || topology.solverRateHz !== 6000 || !Array.isArray(topology.layerIds)
    || !(topology.materialCoefficients instanceof Float32Array)
    || topology.materialCoefficients.length !== topology.layerIds.length * 4)
    throw new TypeError('topology must be a compiled 6 kHz ANT surface topology');
  if (typeof baseElastic !== 'boolean' || typeof instant !== 'boolean') throw new TypeError('baseElastic and instant must be booleans');
  let transformed = source;
  const patches = [];
  const patch = (before, after, name) => { transformed = replaceOnce(transformed, before, after, name); patches.push(name); };
  patch('const RATE = 6000;', 'const RATE = 48000;', 'rate 6000 to 48000');
  patch('const CONTACT_REFERENCE_DELTA_V = 0.020;', 'const CONTACT_REFERENCE_DELTA_V = 0.020 / 8;', 'compliance reference velocity');
  patch('const CONTACT_PULSE_STEPS = Math.round(RATE * 0.003);',
    instant ? 'const CONTACT_PULSE_STEPS = 1;' : 'const CONTACT_PULSE_STEPS = Math.round(RATE * 0.003);', 'contact pulse duration');
  patch('const deltaV = impulse * w / norm / Math.sqrt(density);',
    'const deltaV = impulse * w / norm / Math.sqrt(density) / 8;', 'per-step contact velocity');

  const coefficients = Float32Array.from(topology.materialCoefficients);
  for (let layer = 0; layer < topology.layerIds.length; layer++) {
    const offset = layer * 4, density = coefficients[offset + 2];
    const sourceDamping = coefficients[offset + 3], lossPer6kStep = 50 * sourceDamping;
    if (!(lossPer6kStep >= 0 && lossPer6kStep < 1)) throw new RangeError(`layer ${layer} damping is outside the stable rate-map domain`);
    coefficients[offset] = baseElastic ? 0.01041070909374015 : coefficients[offset] / 64;
    coefficients[offset + 1] = baseElastic ? 0.0012476847034339226 * density : coefficients[offset + 1] / 64;
    coefficients[offset + 3] = (1 - (1 - lossPer6kStep) ** (1 / 8)) / 50;
  }
  const mappedTopology = { ...topology, solverRateHz: 48_000, materialCoefficients: coefficients };
  return { source: transformed, topology: mappedTopology, patches,
    sourceSha256: createHash('sha256').update(transformed).digest('hex'),
    inputSourceSha256: createHash('sha256').update(source).digest('hex'),
    topologyCoefficientSha256: createHash('sha256').update(coefficients).digest('hex'),
    definition: { fromRateHz: 6000, toRateHz: 48_000, baseElastic, instant,
      bendingScale: baseElastic ? null : 1 / 64, storedTensionScale: baseElastic ? null : 1 / 64,
      baseElasticBending: baseElastic ? 0.01041070909374015 : null,
      baseElasticTensionPerDensity: baseElastic ? 0.0012476847034339226 : null,
      dampingPoleMap: 'd48 = 1 - (1 - 50*cD)^(1/8); cD48 = d48/50',
      contactVelocityScale: 1 / 8, complianceReferenceVelocityScale: 1 / 8,
      pulseSteps: instant ? 1 : 144, semanticPulseDurationMs: instant ? null : 3,
      dampingMultiplier: 50, recoveryDurationMs: 75,
      approximation: 'local finite-difference rate mapping; not exact forced-response equivalence' } };
}

function instrumentGeneric(source, { seed, disableFrequencyLoss }) {
  if (!source.includes('class CircularPlateProcessor')) throw new Error('generic Plate source is not recognized');
  let out = source;
  if (disableFrequencyLoss) out = replaceOnce(out,
    '    this.frequencyLoss = 0.0001 * radiusRatio * radiusRatio * (0.2 + 0.8 * (this.dampingControl / 100)) * rateScale;',
    '    this.frequencyLoss = 0;', 'generic frequency loss');
  out = replaceOnce(out, '    this.resolution = config.resolution ?? \'normal\';',
    `    this.resolution = config.resolution ?? 'normal';\n    this.__shadowSeed = ${seed >>> 0}; this.__shadowState = ${seed >>> 0}; this.__shadowDraws = []; this.__shadowEvent = 0;\n    this.__shadowFields = []; this.__shadowRawPickup = [];`, 'generic capture setup');
  out = replaceOnce(out, '      this.previous[index] -= amplitude * weight * (0.92 + Math.random() * 0.16);',
    '      this.__shadowState = (Math.imul(this.__shadowState, 1664525) + 1013904223) >>> 0;\n      const draw = this.__shadowState / 0x100000000;\n      this.__shadowDraws.push({ event: this.__shadowEvent, node: index, draw });\n      this.previous[index] -= amplitude * weight * (0.92 + draw * 0.16);', 'generic draw observer');
  out = replaceOnce(out, '  applyStrike({ position = { x: 0, y: 0 }, strength = 0.36 } = {}) {',
    '  applyStrike({ position = { x: 0, y: 0 }, strength = 0.36 } = {}) {\n    this.__shadowEvent++;', 'generic strike receipt');
  out = replaceOnce(out, '      this.laplacian = previousLaplacian; this.previousLaplacian = lap;',
    '      this.laplacian = previousLaplacian; this.previousLaplacian = lap;\n      this.__shadowFields.push(this.indices.map(index => this.current[index]));\n      this.__shadowRawPickup.push(this.current[this.stereoPickupIndices[0]], this.current[this.stereoPickupIndices[1]]);', 'generic field capture');
  out = replaceOnce(out, '    if (!this.active) {\n      for (const channel of channels) channel.fill(0);\n      return true;\n    }',
    '    if (!this.active) {\n      for (const channel of channels) channel.fill(0);\n      for (let frame = 0; frame < output.length; frame++) { this.__shadowFields.push(this.indices.map(index => this.current[index])); this.__shadowRawPickup.push(this.current[this.stereoPickupIndices[0]], this.current[this.stereoPickupIndices[1]]); }\n      return true;\n    }', 'generic idle capture');
  return out;
}

export function renderGenericReference({ source, config = {}, events = [], frames = DEFAULT_FRAMES, seed = 1,
  disableFrequencyLoss = false, sampleRate = 48_000 } = {}) {
  if (typeof source !== 'string') throw new TypeError('source must be the generic Plate worklet text');
  if (!Number.isSafeInteger(frames) || frames <= 0) throw new RangeError('frames must be a positive integer');
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be a positive integer');
  if (!Number.isSafeInteger(seed)) throw new TypeError('seed must be an integer');
  const scheduled = events.map((event, index) => {
    if (!Number.isSafeInteger(event?.frame) || event.frame < 0 || event.frame >= frames) throw new RangeError(`events[${index}].frame outside render`);
    if (!event.message || typeof event.message.type !== 'string') throw new TypeError(`events[${index}].message.type is required`);
    return { ...event, index };
  }).sort((a, b) => a.frame - b.frame || a.index - b.index);
  let Processor;
  class Stub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(instrumentGeneric(source, { seed, disableFrequencyLoss }), {
    AudioWorkletProcessor: Stub, sampleRate, Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array,
    Int8Array, Int16Array, Int32Array, Array, Math, Number, Object, Map, performance: globalThis.performance,
    registerProcessor(_name, processor) { Processor = processor; } }, { filename: 'plate.worklet.shadow.js' });
  if (!Processor) throw new Error('generic Plate did not register a processor');
  const finalConfig = { stereoPickups: [{ x: -0.32, y: -0.18 }, { x: 0.32, y: -0.18 }], ...config };
  const processor = new Processor({ processorOptions: finalConfig });
  if (!processor.stereoPickupIndices) throw new Error('reference requires two stereo pickup positions');
  const left = new Float32Array(frames), right = new Float32Array(frames), receipts = [];
  let frame = 0;
  const processTo = end => {
    while (frame < end) {
      const count = Math.min(128, end - frame), l = new Float32Array(count), r = new Float32Array(count);
      processor.process([], [[l, r]]); left.set(l, frame); right.set(r, frame); frame += count;
    }
  };
  for (const event of scheduled) {
    processTo(event.frame); processor.handleMessage(event.message);
    receipts.push({ frame: event.frame, index: event.index, message: event.message });
  }
  processTo(frames);
  const nodeCount = processor.indices.length, values = new Float32Array(frames * nodeCount);
  processor.__shadowFields.forEach((row, index) => values.set(row, index * nodeCount));
  const pickup = Float32Array.from(processor.__shadowRawPickup), pre = Float32Array.from(pickup, value => value * 8);
  const split = values => ({ left: Float32Array.from(values.filter((_, i) => i % 2 === 0)), right: Float32Array.from(values.filter((_, i) => i % 2 === 1)) });
  const telemetry = { frames, strikes: processor.__shadowEvent, nonFinite: 0, active: processor.active,
    limiter: { inputPeak: 0, outputPeak: 0, clipped: 0 } };
  for (const value of [...left, ...right, ...values, ...pickup, ...pre]) if (!Number.isFinite(value)) telemetry.nonFinite++;
  for (const value of [...left, ...right]) {
    telemetry.limiter.outputPeak = Math.max(telemetry.limiter.outputPeak, Math.abs(value));
    if (Math.abs(value) >= 1) telemetry.limiter.clipped++;
  }
  for (const value of pre) telemetry.limiter.inputPeak = Math.max(telemetry.limiter.inputPeak, Math.abs(value));
  if (telemetry.nonFinite) throw new Error('generic reference produced non-finite data');
  return { pcm: { left, right }, fields: { values, frames, nodeCount, sampleRate, nodes: Uint32Array.from(processor.indices) },
    rawPickup: { ...split(pickup), sampleRate }, preLimiter: { ...split(pre), sampleRate }, telemetry,
    draws: JSON.parse(JSON.stringify(processor.__shadowDraws)), receipts, grid: { size: processor.size, center: processor.center, radius: processor.radius },
    coefficients: { stiffness: processor.stiffnessTerm, tension: processor.tensionTerm, loss: processor.loss,
      frequencyLoss: processor.frequencyLoss }, sourceSha256: createHash('sha256').update(source).digest('hex'), seed: seed >>> 0 };
}

export async function loadGenericPlateSource() { return readFile(DEFAULT_GENERIC, 'utf8'); }
