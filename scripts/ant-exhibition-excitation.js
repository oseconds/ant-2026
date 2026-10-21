const SAMPLE_RATE = 48_000;
const DEFAULT_REFRACTORY_MS = 75;
const GRID_SIZE = 32;

export function filterStrikeEvents(events, { mode = 'cell', refractoryMs = DEFAULT_REFRACTORY_MS } = {}) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  if (!['plate', 'cell'].includes(mode)) throw new RangeError('mode must be plate or cell');
  if (!Number.isFinite(refractoryMs) || refractoryMs < 0) throw new RangeError('refractoryMs must be nonnegative');

  const refractoryFrames = Math.round(refractoryMs * SAMPLE_RATE / 1000);
  let previousFrame = -1;
  for (const event of events) {
    if (!Number.isSafeInteger(event?.frame) || event.frame < 0 || event.frame < previousFrame) {
      throw new RangeError('events must have nonnegative, nondecreasing integer frames');
    }
    previousFrame = event.frame;
  }
  const lastByKey = new Map();
  const countsByKey = new Map();
  const output = [];
  let strikes = 0;
  let dropped = 0;
  let minStrength = Infinity;
  let maxStrength = -Infinity;
  let minFrame = Infinity;
  let maxFrame = -Infinity;
  for (const event of events) if (Number.isSafeInteger(event?.frame)) {
    minFrame = Math.min(minFrame, event.frame);
    maxFrame = Math.max(maxFrame, event.frame);
  }
  const durationSeconds = Number.isFinite(minFrame) ? (maxFrame - minFrame) / SAMPLE_RATE : 0;
  for (const event of events) {
    const payload = event?.message?.type === 'strike' ? event.message.payload : null;
    if (!payload || !Number.isSafeInteger(event.frame) || typeof payload.layerId !== 'string') {
      output.push(event);
      continue;
    }
    const { x, y } = payload.position || {};
    if (mode === 'cell' && (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)) {
      output.push(event);
      continue;
    }
    strikes += 1;
    if (Number.isFinite(payload.strength)) {
      minStrength = Math.min(minStrength, payload.strength);
      maxStrength = Math.max(maxStrength, payload.strength);
    }
    const cell = mode === 'cell' ? `${Math.round(y * (GRID_SIZE - 1)) * GRID_SIZE + Math.round(x * (GRID_SIZE - 1))}` : '';
    const key = `${payload.layerId}:${cell}`;
    const counts = countsByKey.get(key) || { layerId: payload.layerId, cell: mode === 'cell' ? Number(cell) : null,
      input: 0, delivered: 0 };
    counts.input += 1;
    countsByKey.set(key, counts);
    const previous = lastByKey.get(key);
    if (previous !== undefined && event.frame - previous < refractoryFrames) {
      dropped += 1;
      continue;
    }
    lastByKey.set(key, event.frame);
    counts.delivered += 1;
    output.push(event);
  }
  return { events: output, report: { mode, refractoryMs, inputStrikes: strikes, deliveredStrikes: strikes - dropped,
    droppedStrikes: dropped, deliveryRate: strikes ? (strikes - dropped) / strikes : 1,
    observedStrengthSpan: Number.isFinite(minStrength) ? { min: minStrength, max: maxStrength } : null,
    deliveryRatePerSecond: durationSeconds ? (strikes - dropped) / durationSeconds : null,
    byPlateOrCell: [...countsByKey.values()].map(({ layerId, cell, input, delivered }) => ({ layerId, cell, input,
      delivered, dropped: input - delivered, deliveryRate: input ? delivered / input : 1,
      deliveryRatePerSecond: durationSeconds ? delivered / durationSeconds : null })) } };
}

export function compareStrikeGates(events, options = {}) {
  const plate = filterStrikeEvents(events, { ...options, mode: 'plate' });
  const cell = filterStrikeEvents(events, { ...options, mode: 'cell' });
  return { plate, cell };
}
