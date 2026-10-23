import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const DEFAULT_RADIUS = 0.0045;
const DEFAULT_AMOUNT_PER_UNIT_DISTANCE = 4.5;

export function phaseOffsets(width = 96, height = 96) {
  if (!Number.isInteger(width) || width < 2 || !Number.isInteger(height) || height < 2) {
    throw new RangeError('Field dimensions must be integers greater than one.');
  }
  const halfPitchX = 0.5 / (width - 1);
  const halfPitchY = 0.5 / (height - 1);
  return [
    { id: 'p00', dx: 0, dy: 0 },
    { id: 'p10', dx: halfPitchX, dy: 0 },
    { id: 'p01', dx: 0, dy: halfPitchY },
    { id: 'p11', dx: halfPitchX, dy: halfPitchY }
  ];
}

/** Add a read/write phase view without changing the field's grid or the world coordinates. */
export function createTranslatedFieldView(field, phase, {
  samples = [], writes = [], uncappedValues = null, initialLedger = null
} = {}) {
  if (!field || typeof field.sample !== 'function'
    || typeof field.depositPoint !== 'function' || typeof field.depositSegment !== 'function'
    || typeof field.decay !== 'function' || !(field.values instanceof Float32Array)) {
    throw new TypeError('Expected a PheromoneField-compatible instance.');
  }
  if (!phase || typeof phase.id !== 'string' || !Number.isFinite(phase.dx) || !Number.isFinite(phase.dy)) {
    throw new TypeError('Phase needs a string id and finite dx/dy.');
  }
  if (!Array.isArray(samples) || !Array.isArray(writes)) throw new TypeError('Sample and write logs must be arrays.');
  assertFiniteRaster(field.values, 'initial phase raster');

  const uncapped = new PheromoneField({ width: field.width, height: field.height,
    decayHalfLifeSeconds: field.decayHalfLifeSeconds, maxValue: Number.MAX_VALUE });
  if (uncappedValues !== null && (!(uncappedValues instanceof Float32Array)
    || uncappedValues.length !== field.values.length || !uncappedValues.every(Number.isFinite))) {
    throw new TypeError('Uncapped starting raster must be a finite Float32Array matching the field.');
  }
  uncapped.values.set(uncappedValues ?? field.values);
  const ledger = { requestedDose: 0, acceptedDose: 0, boundaryClippedDose: 0,
    acceptedAboveRequestDose: 0, elapsedDecaySeconds: 0, ...(initialLedger ?? {}) };
  if (!Object.values(ledger).every(value => Number.isFinite(value) && value >= 0)) {
    throw new RangeError('Initial dose ledger must contain finite non-negative values.');
  }
  let sampleContext = null;
  const shift = value => {
    if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
      throw new TypeError('Translated points need finite x and y coordinates.');
    }
    const shifted = { x: value.x + phase.dx, y: value.y + phase.dy };
    if (!Number.isFinite(shifted.x) || !Number.isFinite(shifted.y)) {
      throw new RangeError('Translated coordinates must remain finite.');
    }
    return shifted;
  };
  const fieldView = new Proxy(field, {
    get(target, property, receiver) {
      if (property === 'sample') return (x, y) => {
        const shifted = shift({ x, y });
        const value = target.sample(shifted.x, shifted.y);
        if (!Number.isFinite(value)) throw new RangeError('Phase sample returned a non-finite value.');
        samples.push({ callIndex: samples.length, phaseId: phase.id, x, y,
          fieldX: shifted.x, fieldY: shifted.y, value,
          context: sampleContext ? { ...sampleContext } : null });
        return value;
      };
      if (property === 'depositPoint') return (position, options = {}) => {
        const shifted = shift(position);
        const amount = options.amount ?? 0;
        const radius = options.radius ?? DEFAULT_RADIUS;
        const returnedDose = target.depositPoint(shifted, options);
        if (!Number.isFinite(returnedDose)) throw new RangeError('Point write returned a non-finite dose.');
        uncapped.depositPoint(shifted, { amount, radius });
        const requestedDose = amount;
        ledger.requestedDose += requestedDose;
        ledger.acceptedDose += returnedDose;
        ledger.boundaryClippedDose += Math.max(0, requestedDose - returnedDose);
        ledger.acceptedAboveRequestDose += Math.max(0, returnedDose - requestedDose);
        writes.push({ callIndex: writes.length, phaseId: phase.id, type: 'point',
          position: { x: position.x, y: position.y }, fieldPosition: shifted,
          requestedDose, returnedDose, radius });
        return returnedDose;
      };
      if (property === 'depositSegment') return (from, to, options = {}) => {
        const shiftedFrom = shift(from), shiftedTo = shift(to);
        const rate = options.amountPerUnitDistance ?? DEFAULT_AMOUNT_PER_UNIT_DISTANCE;
        const radius = options.radius ?? DEFAULT_RADIUS;
        const returnedDose = target.depositSegment(shiftedFrom, shiftedTo, options);
        if (!Number.isFinite(returnedDose)) throw new RangeError('Segment write returned a non-finite dose.');
        uncapped.depositSegment(shiftedFrom, shiftedTo, { ...options, amountPerUnitDistance: rate, radius });
        const requestedDose = Math.hypot(to.x - from.x, to.y - from.y) * rate;
        ledger.requestedDose += requestedDose;
        ledger.acceptedDose += returnedDose;
        ledger.boundaryClippedDose += Math.max(0, requestedDose - returnedDose);
        ledger.acceptedAboveRequestDose += Math.max(0, returnedDose - requestedDose);
        writes.push({ callIndex: writes.length, phaseId: phase.id, type: 'segment',
          from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y },
          fieldFrom: shiftedFrom, fieldTo: shiftedTo,
          requestedDose, returnedDose, rate, radius });
        return returnedDose;
      };
      if (property === 'decay') return dtSeconds => {
        const result = target.decay(dtSeconds);
        uncapped.decay(dtSeconds);
        ledger.elapsedDecaySeconds += dtSeconds;
        return result;
      };
      return Reflect.get(target, property, receiver);
    }
  });

  return {
    field: fieldView,
    samples,
    writes,
    doseLedger: ledger,
    uncappedField: uncapped,
    withSampleContext(context, callback) {
      if (!context || typeof context.kind !== 'string' || typeof callback !== 'function') {
        throw new TypeError('Sample context needs a string kind and a callback.');
      }
      const prior = sampleContext;
      sampleContext = { ...context };
      try { return callback(); }
      finally { sampleContext = prior; }
    },
    summarize() {
      let storedMass = 0, uncappedMass = 0, cappedCells = 0, peak = 0;
      for (let index = 0; index < field.values.length; index += 1) {
        const value = field.values[index];
        if (!Number.isFinite(value) || !Number.isFinite(uncapped.values[index])) {
          throw new RangeError('Phase replay produced a non-finite raster value.');
        }
        storedMass += value;
        uncappedMass += uncapped.values[index];
        if (value >= field.maxValue) cappedCells += 1;
        if (value > peak) peak = value;
      }
      if (![...Object.values(ledger), storedMass, uncappedMass].every(Number.isFinite)) {
        throw new RangeError('Phase dose ledger contains a non-finite value.');
      }
      return { ...ledger, storedMass, uncappedShadowMass: uncappedMass,
        capStorageLoss: uncappedMass - storedMass, cappedCellCount: cappedCells, peak };
    }
  };
}

/** Replay with the transfer harness's writer implementation, retaining one matched phase log. */
export function replayPhaseHistory({ field, events, phase, replayFieldWrites, samples = [], writes = [] }) {
  if (!Array.isArray(events) || typeof replayFieldWrites !== 'function') {
    throw new TypeError('Expected ordered field events and the transfer harness replayFieldWrites function.');
  }
  if (!field || !(field.values instanceof Float32Array) || field.values.some(value => value !== 0)) {
    throw new RangeError('Phase history must begin from the zero field captured at initialization.');
  }
  validateFieldEvents(events);
  const view = createTranslatedFieldView(field, phase, { samples, writes });
  replayFieldWrites(view.field, events);
  if (phase.dx === 0 && phase.dy === 0) {
    let writeIndex = 0;
    for (const event of events) {
      if (event.type !== 'field-deposit-write') continue;
      if (event.returnedDose !== undefined && event.returnedDose !== view.writes[writeIndex]?.returnedDose) {
        throw new Error(`Phase zero changed returned dose for deposit event ${writeIndex}.`);
      }
      writeIndex += 1;
    }
  }
  return view;
}

/** Tag only the controller's local and wide sensor calls; restore the methods after one replay. */
export function instrumentControllerSensorSamples(controller, view) {
  if (typeof controller?.senseLocalTrail !== 'function' || typeof controller?.senseTrail !== 'function'
    || typeof view?.withSampleContext !== 'function') {
    throw new TypeError('Expected a controller with local/wide sensors and a translated field view.');
  }
  const senseLocalTrail = controller.senseLocalTrail;
  const senseTrail = controller.senseTrail;
  const localDescriptor = Object.getOwnPropertyDescriptor(controller, 'senseLocalTrail');
  const wideDescriptor = Object.getOwnPropertyDescriptor(controller, 'senseTrail');
  controller.senseLocalTrail = function (agent, ...args) {
    return view.withSampleContext({ kind: 'local', antId: agent.id },
      () => senseLocalTrail.call(this, agent, ...args));
  };
  controller.senseTrail = function (agent, heading, ...args) {
    return view.withSampleContext({ kind: 'wide', antId: agent.id, heading },
      () => senseTrail.call(this, agent, heading, ...args));
  };
  let restored = false;
  return () => {
    if (restored) return;
    restoreOwnMethod(controller, 'senseLocalTrail', localDescriptor);
    restoreOwnMethod(controller, 'senseTrail', wideDescriptor);
    restored = true;
  };
}

function restoreOwnMethod(target, key, descriptor) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else delete target[key];
}

/** Retain every sample and mark rows whose reads can be exposed to finite-domain clipping. */
export function qualifyPhaseSamples(samples, phases, { width = 96, height = 96, radius = DEFAULT_RADIUS } = {}) {
  if (!Array.isArray(samples) || !Array.isArray(phases) || !phases.length) {
    throw new TypeError('Expected sample rows and at least one phase.');
  }
  if (!Number.isInteger(width) || width < 2 || !Number.isInteger(height) || height < 2
    || !Number.isFinite(radius) || radius <= 0) throw new RangeError('Invalid field dimensions or kernel radius.');
  const margin = radius + Math.max(1 / (width - 1), 1 / (height - 1));
  return samples.map(sample => {
    if (!Number.isFinite(sample?.x) || !Number.isFinite(sample?.y)) {
      throw new TypeError('Every phase sample needs finite physical x and y coordinates.');
    }
    const phaseChecks = phases.map(phase => {
      if (!phase || !Number.isFinite(phase.dx) || !Number.isFinite(phase.dy)) {
        throw new TypeError('Every phase needs finite dx and dy.');
      }
      const fieldX = sample.x + phase.dx, fieldY = sample.y + phase.dy;
      if (!Number.isFinite(fieldX) || !Number.isFinite(fieldY)) {
        throw new RangeError('Translated sample coordinates must remain finite.');
      }
      const interior = [sample.x, sample.y, fieldX, fieldY].every(value =>
        value >= margin && value <= 1 - margin);
      return { phaseId: phase.id, fieldX, fieldY, interior };
    });
    const interiorAllPhases = phaseChecks.every(check => check.interior);
    return { ...sample, phaseChecks, interiorAllPhases, boundaryExposed: !interiorAllPhases, margin };
  });
}

export function phaseRasterMatches(field, expectedValues) {
  if (!(field?.values instanceof Float32Array) || !(expectedValues instanceof Float32Array)
    || field.values.length !== expectedValues.length
    || !field.values.every(Number.isFinite) || !expectedValues.every(Number.isFinite)) return false;
  return Buffer.compare(Buffer.from(field.values.buffer, field.values.byteOffset, field.values.byteLength),
    Buffer.from(expectedValues.buffer, expectedValues.byteOffset, expectedValues.byteLength)) === 0;
}

function validateFieldEvents(events) {
  let priorSequence = -1;
  for (const event of events) {
    if (!event || (event.type !== 'field-decay' && event.type !== 'field-deposit-write')) {
      throw new TypeError('Phase history contains an unsupported event.');
    }
    if (event.sequence !== undefined) {
      if (!Number.isInteger(event.sequence) || event.sequence <= priorSequence) {
        throw new RangeError('Phase history event sequence must increase strictly.');
      }
      priorSequence = event.sequence;
    }
    if (event.type === 'field-decay') {
      if (!Number.isFinite(event.dt) || event.dt < 0) throw new RangeError('Decay events need finite non-negative dt.');
      continue;
    }
    const { deposit, radius } = event;
    if (!Number.isFinite(radius) || radius <= 0 || !deposit) throw new TypeError('Deposit event is malformed.');
    if (deposit.type === 'point') {
      if (!Number.isFinite(deposit.position?.x) || !Number.isFinite(deposit.position?.y)
        || !Number.isFinite(deposit.amount) || deposit.amount < 0) throw new TypeError('Point deposit is malformed.');
    } else if (deposit.type === 'segment') {
      if (!Number.isFinite(deposit.from?.x) || !Number.isFinite(deposit.from?.y)
        || !Number.isFinite(deposit.to?.x) || !Number.isFinite(deposit.to?.y)
        || !Number.isFinite(deposit.amountPerUnitDistance) || deposit.amountPerUnitDistance < 0) {
        throw new TypeError('Segment deposit is malformed.');
      }
    } else throw new TypeError('Deposit event has an unsupported type.');
    if (event.returnedDose !== undefined && !Number.isFinite(event.returnedDose)) {
      throw new RangeError('Captured deposit return must be finite.');
    }
  }
}

function assertFiniteRaster(values, name) {
  if (!values.every(Number.isFinite)) throw new RangeError(`${name} contains a non-finite value.`);
}
