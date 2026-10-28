import { SurfaceField } from '../../src/lib/agents/ant/SurfaceField.js';

const DEFAULT_HALF_LIFE_SECONDS = 1800;
const TIME_EPSILON_TICKS = 1e-9;

/** Replay only the archived SurfaceField contacts inside one saved analysis window. */
export function replayMechanicalWindow(packet, { startIndex, endIndex, stepMs = 1000 / 60 } = {}) {
  const frames = packet?.analyses;
  if (!Array.isArray(frames) || !frames.length) throw new TypeError('packet.analyses must be nonempty');
  if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) || startIndex < 0 || endIndex < startIndex || endIndex >= frames.length)
    throw new RangeError('startIndex and endIndex must select an ordered analysis window');
  if (!Number.isFinite(stepMs) || stepMs <= 0) throw new RangeError('stepMs must be finite and positive');

  const start = frames[startIndex], end = frames[endIndex];
  if (!Number.isInteger(start?.tick) || !Number.isInteger(end?.tick) || end.tick < start.tick)
    throw new Error('window analysis frames must have ordered integer ticks');
  if (!Number.isFinite(start?.simulationTimeMs) || !Number.isFinite(end?.simulationTimeMs))
    throw new Error('window analysis frames must have finite simulationTimeMs');
  const initial = start.maps?.C_surface;
  if ((!Array.isArray(initial) && !(initial instanceof Float32Array)) || !initial.length)
    throw new Error('starting C_surface must be a nonempty array or Float32Array');
  validateFieldValues(initial, initial.length, `analysis ${startIndex} C_surface`);
  const size = Math.sqrt(initial.length);
  if (!Number.isInteger(size)) throw new Error('starting C_surface must be square');

  const field = new SurfaceField({ width: size, height: size, halfLifeSeconds: DEFAULT_HALF_LIFE_SECONDS });
  const decayOnly = new SurfaceField({ width: size, height: size, halfLifeSeconds: field.halfLifeSeconds });
  field.values.set(initial);
  decayOnly.values.set(initial);

  const ticks = end.tick - start.tick;
  const groupsByTick = Array.from({ length: ticks + 1 }, () => []);
  let originalContactGroups = 0, originalFeet = 0;
  for (const event of packet.contacts ?? []) {
    if (event?.type !== 'FOOT_CONTACT') continue;
    const time = event.simulationTimeMs;
    if (!Number.isFinite(time)) throw new Error('FOOT_CONTACT simulationTimeMs must be finite');
    if (time <= start.simulationTimeMs || time > end.simulationTimeMs) continue;
    const tickOffset = Math.ceil((time - start.simulationTimeMs) / stepMs - TIME_EPSILON_TICKS);
    if (tickOffset < 1 || tickOffset > ticks) continue;
    groupsByTick[tickOffset].push(event);
    originalContactGroups += 1;
    originalFeet += Array.isArray(event.contacts) ? event.contacts.length : 0;
  }

  let firstMismatch = null, exactAnchorCount = 0;
  const anchorsByTick = new Map();
  for (let index = startIndex; index <= endIndex; index += 1) {
    const tick = frames[index]?.tick;
    if (!Number.isInteger(tick) || tick < start.tick || tick > end.tick || anchorsByTick.has(tick))
      throw new Error(`analysis ${index} must have a unique integer tick inside the selected window`);
    anchorsByTick.set(tick, index);
  }
  const compareAnchor = (index, values) => {
    const expected = frames[index]?.maps?.C_surface;
    if ((!Array.isArray(expected) && !(expected instanceof Float32Array)) || expected.length !== values.length) {
      firstMismatch ??= { analysisIndex: index, tick: frames[index]?.tick, reason: 'invalid C_surface anchor' };
      return;
    }
    try { validateFieldValues(expected, values.length, `analysis ${index} C_surface`); }
    catch { firstMismatch ??= { analysisIndex: index, tick: frames[index]?.tick, reason: 'invalid C_surface anchor values' }; return; }
    for (let cell = 0; cell < values.length; cell += 1) {
      if (!Object.is(values[cell], expected[cell])) {
        firstMismatch ??= { analysisIndex: index, tick: frames[index].tick, cell,
          actual: values[cell], expected: expected[cell], reason: 'Float32 value mismatch' };
        return;
      }
    }
    exactAnchorCount += 1;
  };

  compareAnchor(startIndex, field.values);
  for (let offset = 1; offset <= ticks; offset += 1) {
    field.relax(stepMs / 1000);
    decayOnly.relax(stepMs / 1000);
    for (const event of groupsByTick[offset]) field.applyFootContact(event);
    const index = anchorsByTick.get(start.tick + offset);
    if (index !== undefined) compareAnchor(index, field.values);
  }

  const observed = field.values.slice(), decay = decayOnly.values.slice();
  const retainedIncrementValues = firstMismatch ? null : Float32Array.from(observed, (value, cell) => value - decay[cell]);
  return { validity: { exact: firstMismatch === null, matchedAnchors: exactAnchorCount,
      expectedAnchors: anchorsByTick.size, firstMismatch },
    startIndex, endIndex, startTick: start.tick, endTick: end.tick, stepMs,
    sourceField: { width: size, height: size, halfLifeSeconds: field.halfLifeSeconds },
    originalContactGroups, originalFeet, observedEndValues: observed,
    decayOnlyValues: decay, retainedIncrementValues };
}

function validateFieldValues(values, length, label) {
  if (values.length !== length) throw new Error(`${label} must contain ${length} values`);
  for (const value of values) if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error(`${label} must contain finite [0,1] values`);
}
