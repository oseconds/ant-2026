const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_DURATION = 1.2;
const TIME_SCALE = 100;
const IMPULSE = 0.01;
const GAUSSIAN_WIDTH = 0.08;

function gaussianWeights(positions, center) {
  const weights = positions.map(([x, y]) => Math.exp(-((x - center[0]) ** 2 + (y - center[1]) ** 2) / (2 * GAUSSIAN_WIDTH ** 2)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map(value => value / total);
}

export function renderProbe(graph, { sampleRate = DEFAULT_SAMPLE_RATE, duration = DEFAULT_DURATION } = {}) {
  const { positions, masses, ground, damping, springs, contact } = graph;
  const count = positions?.length;
  if (!Array.isArray(positions) || !Array.isArray(masses) || !Array.isArray(ground) || !Array.isArray(damping)
    || !Array.isArray(springs) || masses.length !== count || ground.length !== count || damping.length !== count
    || (contact !== undefined && (!Array.isArray(contact) || contact.length !== count))) {
    throw new TypeError('Probe graph arrays must have matching node counts.');
  }
  if (!Number.isFinite(sampleRate) || sampleRate < 1 || !Number.isFinite(duration) || duration <= 0) {
    throw new RangeError('Probe sample rate and duration must be finite and positive.');
  }
  if (count === 0) {
    const size = Math.ceil(sampleRate * duration);
    return { sampleRate, timeScale: TIME_SCALE, left: new Float32Array(size), right: new Float32Array(size),
      metrics: { peak: 0, displacementRms: 0, substepsPerSample: 0 } };
  }
  for (let i = 0; i < count; i++) {
    const point = positions[i];
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)
      || !Number.isFinite(masses[i]) || masses[i] <= 0
      || !Number.isFinite(ground[i]) || ground[i] < 0
      || !Number.isFinite(damping[i]) || damping[i] < 0
      || (contact && (!Number.isFinite(contact[i]) || contact[i] < 0 || contact[i] > 1))) {
      throw new RangeError('Probe graph nodes must contain finite positions, positive masses, nonnegative coefficients, and contact in [0,1].');
    }
  }
  for (const spring of springs) {
    if (!Array.isArray(spring) || spring.length !== 3 || !Number.isInteger(spring[0]) || !Number.isInteger(spring[1])
      || spring[0] < 0 || spring[0] >= count || spring[1] < 0 || spring[1] >= count || spring[0] === spring[1]
      || !Number.isFinite(spring[2]) || spring[2] < 0) throw new RangeError('Probe springs must be [validNode, validNode, nonnegativeStiffness].');
  }

  const size = Math.ceil(sampleRate * duration);
  const left = new Float32Array(size), right = new Float32Array(size);
  const velocity = new Float64Array(count), displacement = new Float64Array(count), force = new Float64Array(count);
  const leftPickup = gaussianWeights(positions, [0.25, 0.5]), rightPickup = gaussianWeights(positions, [0.75, 0.5]);
  const contactAt = i => contact?.[i] ?? 1;
  const impulseWeights = gaussianWeights(positions, [0.22, 0.52]);
  const rowBound = new Float64Array(count);
  for (let i = 0; i < count; i++) rowBound[i] = ground[i];
  for (const [i, j, stiffness] of springs) { rowBound[i] += 2 * stiffness; rowBound[j] += 2 * stiffness; }
  const omegaBound = Math.sqrt(Math.max(...rowBound.map((value, i) => value / masses[i])));
  const dampingBound = Math.max(...damping.map((value, i) => value / masses[i]));
  const stepLimit = TIME_SCALE / sampleRate / 0.25;
  const substeps = Math.max(1, Math.ceil(omegaBound * stepLimit), Math.ceil(dampingBound * stepLimit));
  const dt = TIME_SCALE / sampleRate / substeps;
  for (let i = 0; i < count; i++) velocity[i] = IMPULSE * impulseWeights[i] * contactAt(i) / masses[i];

  let displacementEnergy = 0, peak = 0;
  for (let sample = 0; sample < size; sample++) {
    for (let step = 0; step < substeps; step++) {
      for (let i = 0; i < count; i++) force[i] = -(ground[i] * displacement[i] + damping[i] * velocity[i]);
      for (const [i, j, stiffness] of springs) {
        const f = stiffness * (displacement[j] - displacement[i]);
        force[i] += f;
        force[j] -= f;
      }
      for (let i = 0; i < count; i++) {
        velocity[i] += dt * force[i] / masses[i];
        displacement[i] += dt * velocity[i];
      }
    }
    let l = 0, r = 0;
    for (let i = 0; i < count; i++) {
      const pickup = displacement[i] * contactAt(i);
      l += leftPickup[i] * pickup;
      r += rightPickup[i] * pickup;
      displacementEnergy += displacement[i] * displacement[i];
    }
    left[sample] = l;
    right[sample] = r;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  return {
    sampleRate, timeScale: TIME_SCALE, left, right,
    metrics: { peak, displacementRms: Math.sqrt(displacementEnergy / (size * count)), substepsPerSample: substeps }
  };
}
