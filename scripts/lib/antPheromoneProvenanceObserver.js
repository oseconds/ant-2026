const LN_TWO = Math.LN2;
const HISTOGRAM_WIDTH_SECONDS = 0.1;
const HISTOGRAM_MAX_SECONDS = 600;
const ORIGIN = Object.freeze({ x: 0.5, y: 0.72 });
const ORIGIN_BANDS = Object.freeze([
  { label: '0–0.05', max: 0.05 },
  { label: '0.05–0.15', max: 0.15 },
  { label: '0.15–0.30', max: 0.30 },
  { label: '>0.30', max: Infinity }
]);

/** Research-only wrapper. It reads production writes and samples without changing them. */
export class AntPheromoneProvenanceObserver {
  constructor({ spatialGridSize = 32 } = {}) {
    this.spatialGridSize = spatialGridSize;
    this.controller = null;
    this.field = null;
    this.fieldTimeSeconds = 0;
    this.tickNumber = 0;
    this.activeAuthor = null;
    this.sensorContext = null;
    this.authors = new Map();
    this.cellAuthors = new Map();
    this.cellCache = new Map();
    this.depositOwners = new WeakMap();
    this.stats = createStats(spatialGridSize);
  }

  attach(controller) {
    if (!controller || this.controller) throw new TypeError('Observer requires one unattached ANT controller.');
    this.controller = controller;
    this.wrapFieldFactory();
    this.wrapDeposits();
    this.wrapSensors();
    this.wrapSpawnAndRetirement();
    return this;
  }

  wrapFieldFactory() {
    const controller = this.controller;
    const original = controller.fieldFactory;
    controller.fieldFactory = options => {
      const field = original(options);
      this.attachField(field);
      return field;
    };
  }

  attachField(field) {
    this.field = field;
    const originalDecay = field.decay;
    field.decay = dt => {
      const result = originalDecay.call(field, dt);
      this.fieldTimeSeconds += dt;
      this.tickNumber += 1;
      return result;
    };

    const originalSample = field.sample;
    field.sample = (x, y) => {
      const value = originalSample.call(field, x, y);
      if (this.sensorContext) this.recordSample(x, y, value, this.sensorContext);
      return value;
    };

    const originalBrush = field.depositBrush;
    field.depositBrush = (x, y, amount, radius, sigma, support) => {
      const indices = supportIndices(field, x, y, support, radius);
      const before = indices.map(index => field.values[index]);
      const result = originalBrush.call(field, x, y, amount, radius, sigma, support);
      for (let item = 0; item < indices.length; item += 1) {
        const index = indices[item];
        const prior = before[item];
        const next = field.values[index];
        const delta = next - prior;
        if (amount > 0 && next === field.maxValue) this.stats.field.capTouches += 1;
        if (delta < 0) {
          this.stats.validity.negativeFieldWrites += 1;
          continue;
        }
        if (delta === 0) continue;
        this.stats.field.positiveNodeWrites += 1;
        if (!this.activeAuthor) {
          this.stats.validity.unattributedDeposits += 1;
          continue;
        }
        this.addContribution(index, this.activeAuthor, delta);
      }
      return result;
    };

    const originalPoint = field.depositPoint;
    field.depositPoint = (position, options) => {
      this.stats.field.pointRequests += 1;
      const requested = Number.isFinite(options?.amount) ? options.amount : 0;
      const result = originalPoint.call(field, position, options);
      this.stats.field.pointRequestedDose += requested;
      this.stats.field.pointAcceptedDose += result;
      if (result < requested) this.stats.field.rejectedPointDose += requested - result;
      if (Number.isFinite(position?.x) && Number.isFinite(position?.y)
        && (position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1)) {
        this.stats.field.outOfDomainPointRequests += 1;
      }
      return result;
    };

    const originalSegment = field.depositSegment;
    field.depositSegment = (from, to, options) => {
      this.stats.field.segmentRequests += 1;
      const rate = Number.isFinite(options?.amountPerUnitDistance) ? options.amountPerUnitDistance : 0;
      const requested = finitePoint(from) && finitePoint(to)
        ? Math.hypot(to.x - from.x, to.y - from.y) * rate : 0;
      const result = originalSegment.call(field, from, to, options);
      this.stats.field.segmentRequestedDose += requested;
      this.stats.field.segmentAcceptedDose += result;
      if (result < requested) this.stats.field.rejectedSegmentDose += requested - result;
      if (finitePoint(from) && finitePoint(to)
        && (from.x < 0 || from.x > 1 || from.y < 0 || from.y > 1
          || to.x < 0 || to.x > 1 || to.y < 0 || to.y > 1)) {
        this.stats.field.clippedSegmentRequests += 1;
      }
      return result;
    };
  }

  wrapDeposits() {
    const controller = this.controller;
    const deposition = controller.gasterDeposition;
    const observer = this;
    for (const method of ['advance', 'retire']) {
      const original = deposition[method];
      deposition[method] = function (...args) {
        const deposits = original.apply(this, args);
        if (deposits.length) observer.depositOwners.set(deposits, args[0]);
        return deposits;
      };
    }

    const originalApply = controller.applyDeposits;
    controller.applyDeposits = deposits => {
      const author = this.depositOwners.get(deposits) || null;
      if (deposits.length && !author) this.stats.validity.unattributedDepositBatches += 1;
      this.activeAuthor = author;
      try { return originalApply.call(controller, deposits); }
      finally { this.activeAuthor = null; }
    };
  }

  wrapSensors() {
    const observer = this;
    for (const [method, kind] of [['senseLocalTrail', 'local'], ['senseTrail', 'wide']]) {
      const original = this.controller[method];
      this.controller[method] = function (agent, ...args) {
        const prior = observer.sensorContext;
        observer.sensorContext = { readerId: agent?.id ?? null, kind };
        try { return original.call(this, agent, ...args); }
        finally { observer.sensorContext = prior; }
      };
    }
  }

  wrapSpawnAndRetirement() {
    const controller = this.controller;
    const originalSpawn = controller.spawnNextAnt;
    controller.spawnNextAnt = (...args) => {
      const previous = new Set(controller.agents.map(agent => agent.id));
      const result = originalSpawn.apply(controller, args);
      for (const agent of controller.agents) {
        if (previous.has(agent.id)) continue;
        this.authors.set(agent.id, { bornAtSeconds: this.fieldTimeSeconds, retiredAtSeconds: null });
        this.stats.lifecycle.authorsBorn += 1;
      }
      return result;
    };

    const originalTick = controller.tick;
    controller.tick = dt => {
      const previous = new Set(controller.agents.map(agent => agent.id));
      const result = originalTick.call(controller, dt);
      const alive = new Set(controller.agents.map(agent => agent.id));
      for (const id of previous) {
        if (alive.has(id)) continue;
        const author = this.authors.get(id);
        if (author && author.retiredAtSeconds === null) {
          author.retiredAtSeconds = controller.simulationTimeMs / 1000;
          this.stats.lifecycle.authorsRetired += 1;
        }
      }
      return result;
    };
  }

  addContribution(index, authorId, amount) {
    let byAuthor = this.cellAuthors.get(index);
    if (!byAuthor) this.cellAuthors.set(index, byAuthor = new Map());
    let state = byAuthor.get(authorId);
    if (!state) byAuthor.set(authorId, state = { value: 0, firstAgeMoment: 0, secondAgeMoment: 0, time: this.fieldTimeSeconds });
    advanceState(state, this.fieldTimeSeconds, this.field.decayHalfLifeSeconds);
    state.value += amount;
    this.cellCache.delete(index);
    this.stats.field.attributedNodeIncrements += 1;
    this.stats.field.attributedStoredSignal += amount;
  }

  cellSummary(index) {
    const cached = this.cellCache.get(index);
    if (cached?.tick === this.tickNumber) return cached;
    const byAuthor = this.cellAuthors.get(index);
    let aliveValue = 0, aliveFirst = 0, aliveSecond = 0;
    let retiredValue = 0, retiredFirst = 0, retiredSecond = 0;
    if (byAuthor) {
      for (const [authorId, state] of byAuthor) {
        advanceState(state, this.fieldTimeSeconds, this.field.decayHalfLifeSeconds);
        const lifecycle = this.authors.get(authorId);
        if (lifecycle?.retiredAtSeconds !== null && lifecycle?.retiredAtSeconds < this.fieldTimeSeconds - 1e-12) {
          retiredValue += state.value;
          retiredFirst += state.firstAgeMoment;
          retiredSecond += state.secondAgeMoment;
        } else {
          aliveValue += state.value;
          aliveFirst += state.firstAgeMoment;
          aliveSecond += state.secondAgeMoment;
        }
      }
    }
    const fieldValue = this.field.values[index];
    const summary = {
      tick: this.tickNumber,
      byAuthor,
      aliveValue, aliveFirst, aliveSecond,
      retiredValue, retiredFirst, retiredSecond,
      numericResidual: fieldValue - aliveValue - retiredValue
    };
    this.cellCache.set(index, summary);
    return summary;
  }

  recordSample(x, y, fieldValue, { readerId, kind }) {
    const components = this.interpolateComponents(x, y, readerId, fieldValue);
    const accumulators = [this.stats.reads, this.stats.readsByKind[kind]];
    for (const accumulator of accumulators) accumulateRead(accumulator, components, x, y, this.spatialGridSize);
    this.stats.readCalls += 1;
    const error = Math.abs(components.reconstructed - fieldValue);
    this.stats.validity.reconstructionSamples += 1;
    this.stats.validity.maxSampleReconstructionError = Math.max(
      this.stats.validity.maxSampleReconstructionError, error);
    if (error > Math.max(1e-9, Math.abs(fieldValue) * 1e-6)) {
      this.stats.validity.samplesOutsideReconstructionTolerance += 1;
    }
  }

  interpolateComponents(x, y, readerId, fieldValue) {
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return { fieldValue, self: 0, aliveOther: 0, retired: 0, residual: fieldValue,
        selfFirst: 0, selfSecond: 0, aliveFirst: 0, aliveSecond: 0,
        retiredFirst: 0, retiredSecond: 0, reconstructed: fieldValue };
    }
    const gx = x * (this.field.width - 1), gy = y * (this.field.height - 1);
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const x1 = Math.min(this.field.width - 1, x0 + 1), y1 = Math.min(this.field.height - 1, y0 + 1);
    const tx = gx - x0, ty = gy - y0;
    const indices = [y0 * this.field.width + x0, y0 * this.field.width + x1,
      y1 * this.field.width + x0, y1 * this.field.width + x1];
    const nodes = indices.map(index => this.cellSummary(index));
    const readSelf = node => {
      const state = node.byAuthor?.get(readerId);
      return state && this.authors.get(readerId)?.retiredAtSeconds === null
        ? [state.value, state.firstAgeMoment, state.secondAgeMoment] : [0, 0, 0];
    };
    const values = nodes.map(node => {
      const [self, selfFirst, selfSecond] = readSelf(node);
      return {
        self,
        aliveOther: node.aliveValue - self,
        retired: node.retiredValue,
        residual: node.numericResidual,
        selfFirst,
        selfSecond,
        aliveFirst: node.aliveFirst - selfFirst,
        aliveSecond: node.aliveSecond - selfSecond,
        retiredFirst: node.retiredFirst,
        retiredSecond: node.retiredSecond
      };
    });
    const interpolate = key => mix(mix(values[0][key], values[1][key], tx),
      mix(values[2][key], values[3][key], tx), ty);
    const result = {
      fieldValue,
      self: interpolate('self'),
      aliveOther: interpolate('aliveOther'),
      retired: interpolate('retired'),
      residual: interpolate('residual'),
      selfFirst: interpolate('selfFirst'),
      selfSecond: interpolate('selfSecond'),
      aliveFirst: interpolate('aliveFirst'),
      aliveSecond: interpolate('aliveSecond'),
      retiredFirst: interpolate('retiredFirst'),
      retiredSecond: interpolate('retiredSecond')
    };
    result.reconstructed = result.self + result.aliveOther + result.retired + result.residual;
    return result;
  }

  auditField() {
    const field = this.field;
    let nodeSum = 0, absoluteResidualSum = 0, maxAbsoluteResidual = 0;
    let nonzeroNodes = 0;
    for (let index = 0; index < field.values.length; index += 1) {
      const summary = this.cellSummary(index);
      const residual = summary.numericResidual;
      nodeSum += field.values[index];
      absoluteResidualSum += Math.abs(residual);
      maxAbsoluteResidual = Math.max(maxAbsoluteResidual, Math.abs(residual));
      if (field.values[index] > 0) nonzeroNodes += 1;
    }
    return { nodeSum, absoluteResidualSum, residualRatio: nodeSum ? absoluteResidualSum / nodeSum : 0,
      maxAbsoluteResidual, nonzeroNodes, cellAuthorPairs: countCellAuthorPairs(this.cellAuthors) };
  }

  receipt() {
    return {
      spatialGridSize: this.spatialGridSize,
      fieldTimeSeconds: this.fieldTimeSeconds,
      lifecycle: { ...this.stats.lifecycle, registeredAuthors: this.authors.size,
        liveAuthorsAtEnd: [...this.authors.values()].filter(author => author.retiredAtSeconds === null).length },
      field: { ...this.stats.field },
      reads: {
        rawSampleCalls: this.stats.readCalls,
        all: summarizeReadAccumulator(this.stats.reads),
        byKind: Object.fromEntries(Object.entries(this.stats.readsByKind)
          .map(([kind, accumulator]) => [kind, summarizeReadAccumulator(accumulator)]))
      },
      spatial: summarizeSpatial(this.stats.reads.spatial, this.stats.reads.radial),
      validity: { ...this.stats.validity,
        ok: this.stats.validity.negativeFieldWrites === 0
          && this.stats.validity.unattributedDeposits === 0
          && this.stats.validity.unattributedDepositBatches === 0
          && this.stats.validity.samplesOutsideReconstructionTolerance === 0
          && this.stats.field.capTouches === 0 }
    };
  }
}

function createStats(gridSize) {
  return {
    readCalls: 0,
    reads: createReadAccumulator(gridSize),
    readsByKind: { local: createReadAccumulator(gridSize), wide: createReadAccumulator(gridSize) },
    lifecycle: { authorsBorn: 0, authorsRetired: 0 },
    field: {
      pointRequests: 0, segmentRequests: 0, pointRequestedDose: 0, pointAcceptedDose: 0,
      segmentRequestedDose: 0, segmentAcceptedDose: 0, rejectedPointDose: 0,
      rejectedSegmentDose: 0, outOfDomainPointRequests: 0, clippedSegmentRequests: 0,
      capTouches: 0, positiveNodeWrites: 0, attributedNodeIncrements: 0,
      attributedStoredSignal: 0
    },
    validity: {
      negativeFieldWrites: 0, unattributedDeposits: 0, unattributedDepositBatches: 0,
      reconstructionSamples: 0, samplesOutsideReconstructionTolerance: 0,
      maxSampleReconstructionError: 0
    }
  };
}

function createReadAccumulator(gridSize) {
  return {
    calls: 0,
    positiveReads: 0,
    fieldSignal: 0,
    numericResidual: 0,
    categories: {
      self: createCategoryAccumulator(),
      aliveOther: createCategoryAccumulator(),
      retired: createCategoryAccumulator()
    },
    retiredPositiveReads: 0,
    retiredFractionHistogram: new Float64Array(1001),
    retiredMagnitudeHistogram: new Float64Array(8001),
    retiredMagnitudeMax: 0,
    spatial: Array.from({ length: gridSize * gridSize }, () => ({ reads: 0, fieldSignal: 0,
      self: 0, aliveOther: 0, retired: 0 })),
    radial: ORIGIN_BANDS.map(band => ({ ...band, reads: 0, fieldSignal: 0,
      self: 0, aliveOther: 0, retired: 0 }))
  };
}

function createCategoryAccumulator() {
  return { signal: 0, firstAgeMoment: 0, secondAgeMoment: 0, positiveReads: 0,
    meanAgeByReadHistogram: new Float64Array(Math.floor(HISTOGRAM_MAX_SECONDS / HISTOGRAM_WIDTH_SECONDS) + 1) };
}

function accumulateRead(accumulator, values, x, y, gridSize) {
  accumulator.calls += 1;
  const signal = values.fieldValue;
  accumulator.fieldSignal += signal;
  accumulator.numericResidual += values.residual;
  if (signal > 0) accumulator.positiveReads += 1;
  for (const name of ['self', 'aliveOther', 'retired']) {
    const amount = Math.max(0, values[name]);
    const first = Math.max(0, values[`${name === 'aliveOther' ? 'alive' : name}First`]);
    const second = Math.max(0, values[`${name === 'aliveOther' ? 'alive' : name}Second`]);
    const category = accumulator.categories[name];
    category.signal += amount;
    category.firstAgeMoment += first;
    category.secondAgeMoment += second;
    if (amount > 0) {
      category.positiveReads += 1;
      const age = first / amount;
      category.meanAgeByReadHistogram[ageHistogramIndex(age)] += amount;
    }
  }
  if (values.retired > 0) accumulator.retiredPositiveReads += 1;
  if (values.retired > 0) {
    accumulator.retiredMagnitudeMax = Math.max(accumulator.retiredMagnitudeMax, values.retired);
    accumulator.retiredMagnitudeHistogram[Math.min(8000, Math.floor(values.retired * 1000))] += 1;
  }
  if (signal > 0) {
    const share = Math.max(0, Math.min(1, values.retired / signal));
    accumulator.retiredFractionHistogram[Math.min(1000, Math.floor(share * 1000))] += 1;
  }
  const xCell = Math.min(gridSize - 1, Math.max(0, Math.floor(x * gridSize)));
  const yCell = Math.min(gridSize - 1, Math.max(0, Math.floor(y * gridSize)));
  addSpatial(accumulator.spatial[yCell * gridSize + xCell], values);
  const distance = Math.hypot(x - ORIGIN.x, y - ORIGIN.y);
  const radial = accumulator.radial.find(band => distance <= band.max);
  addSpatial(radial, values);
}

function addSpatial(bin, values) {
  bin.reads += 1;
  bin.fieldSignal += values.fieldValue;
  bin.self += values.self;
  bin.aliveOther += values.aliveOther;
  bin.retired += values.retired;
}

function summarizeReadAccumulator(accumulator) {
  const signal = accumulator.fieldSignal;
  const categories = Object.fromEntries(Object.entries(accumulator.categories).map(([name, value]) => {
    const meanAgeSeconds = value.signal ? value.firstAgeMoment / value.signal : null;
    const variance = value.signal
      ? Math.max(0, value.secondAgeMoment / value.signal - meanAgeSeconds ** 2) : null;
    return [name, {
      sampledSignal: value.signal,
      fractionOfProductionSamples: signal ? value.signal / signal : null,
      positiveReadCount: value.positiveReads,
      signalWeightedMeanAgeSeconds: meanAgeSeconds,
      signalWeightedAgeSdSeconds: variance === null ? null : Math.sqrt(variance),
      perReadMeanAgeQuantilesSeconds: histogramQuantiles(value.meanAgeByReadHistogram,
        HISTOGRAM_WIDTH_SECONDS, [0.25, 0.5, 0.75], HISTOGRAM_MAX_SECONDS)
    }];
  }));
  return {
    rawSampleCalls: accumulator.calls,
    positiveProductionSampleReads: accumulator.positiveReads,
    sampledProductionSignal: signal,
    signedNumericResidual: accumulator.numericResidual,
    categories,
    retiredAuthorReadFrequency: accumulator.positiveReads
      ? accumulator.retiredPositiveReads / accumulator.positiveReads : null,
    retiredAuthorReadCount: accumulator.retiredPositiveReads,
    retiredContributionMagnitudeQuantiles: histogramQuantiles(accumulator.retiredMagnitudeHistogram,
      0.001, [0.25, 0.5, 0.75, 0.9], 8),
    maximumRetiredContributionPerRead: accumulator.retiredMagnitudeMax,
    retiredShareQuantilesOfPositiveReads: histogramQuantiles(accumulator.retiredFractionHistogram,
      0.001, [0.25, 0.5, 0.75, 0.9], 1)
  };
}

function summarizeSpatial(spatial, radial) {
  return {
    origin: ORIGIN,
    distanceBands: radial.map(({ label, reads, fieldSignal, self, aliveOther, retired }) => ({
      label, reads, sampledSignal: fieldSignal, self, aliveOther, retired,
      retiredFraction: fieldSignal ? retired / fieldSignal : null
    })),
    grid: spatial.map(bin => ({ reads: bin.reads, fieldSignal: bin.fieldSignal,
      self: bin.self, aliveOther: bin.aliveOther, retired: bin.retired }))
  };
}

function histogramQuantiles(histogram, binWidth, probabilities, maximum = Infinity) {
  let total = 0;
  for (const count of histogram) total += count;
  if (!total) return Object.fromEntries(probabilities.map(p => [`p${Math.round(p * 100)}`, null]));
  const result = {};
  for (const probability of probabilities) {
    const target = total * probability;
    let cumulative = 0, index = 0;
    for (; index < histogram.length; index += 1) {
      cumulative += histogram[index];
      if (cumulative >= target) break;
    }
    result[`p${Math.round(probability * 100)}`] = Math.min(maximum, index * binWidth + binWidth / 2);
  }
  return result;
}

function ageHistogramIndex(age) {
  if (!Number.isFinite(age) || age >= HISTOGRAM_MAX_SECONDS) return Math.floor(HISTOGRAM_MAX_SECONDS / HISTOGRAM_WIDTH_SECONDS);
  return Math.max(0, Math.floor(age / HISTOGRAM_WIDTH_SECONDS));
}

function advanceState(state, now, halfLifeSeconds) {
  const elapsed = now - state.time;
  if (elapsed <= 0) return;
  const value = state.value;
  const first = state.firstAgeMoment;
  const factor = Math.exp(-LN_TWO * elapsed / halfLifeSeconds);
  state.value = value * factor;
  state.firstAgeMoment = (first + value * elapsed) * factor;
  state.secondAgeMoment = (state.secondAgeMoment + 2 * first * elapsed + value * elapsed * elapsed) * factor;
  state.time = now;
}

function supportIndices(field, x, y, support, radius) {
  const gx = Math.max(0, Math.min(1, x)) * (field.width - 1);
  const gy = Math.max(0, Math.min(1, y)) * (field.height - 1);
  const radiusX = Math.ceil(support * (field.width - 1));
  const radiusY = Math.ceil(support * (field.height - 1));
  const minX = Math.max(0, Math.floor(gx - radiusX));
  const maxX = Math.min(field.width - 1, Math.ceil(gx + radiusX));
  const minY = Math.max(0, Math.floor(gy - radiusY));
  const maxY = Math.min(field.height - 1, Math.ceil(gy + radiusY));
  const indices = [];
  for (let row = minY; row <= maxY; row += 1) {
    for (let column = minX; column <= maxX; column += 1) {
      const distance = Math.hypot(column / (field.width - 1) - x, row / (field.height - 1) - y);
      if (distance <= radius) indices.push(row * field.width + column);
    }
  }
  return indices;
}

function countCellAuthorPairs(cells) {
  let count = 0;
  for (const authors of cells.values()) count += authors.size;
  return count;
}

function finitePoint(point) { return Number.isFinite(point?.x) && Number.isFinite(point?.y); }
function mix(a, b, t) { return a + (b - a) * t; }
