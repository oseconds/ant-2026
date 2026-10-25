import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const DEFAULT_RATE = 48_000;
const PHYSICS_RATE = 6_000;
const QUANTUM = 128;

function finiteValues(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  return !value || typeof value !== 'object' || Object.values(value).every(finiteValues);
}

export function instrumentSurfaceSchedule(source) {
  if (typeof source !== 'string') throw new TypeError('Worklet source must be a string.');
  const replaceOnce = (before, after) => {
    if (source.split(before).length !== 2) throw new Error(`Surface worklet instrumentation anchor missing or ambiguous: ${before}`);
    source = source.replace(before, after);
  };
  replaceOnce('  constructor() {', '  constructor(options) {');
  replaceOnce('    super();', `    super();
    const evidence = options?.processorOptions?.evidenceSchedule;
    this.__shadowEvents = evidence?.events || [];
    this.__shadowFrame = 0;
    this.__shadowEventCursor = 0;
    this.__shadowReceipts = [];
    this.__hardnessPulseReceipts = [];
    this.__shadowFields = [];
    this.__shadowRawLeft = [];
    this.__shadowRawRight = [];
    this.__shadowPickupWindows = (evidence?.pickupWindows || []).map(window => ({ ...window, left: [], right: [] }));
    this.__shadowPhysicsOutputWindows = (evidence?.physicsOutputWindows || []).map(window => ({ ...window, left: [], right: [] }));
    this.__shadowPhysicsFrame = 0;
    this.__shadowFieldFinite = true;`);
  replaceOnce('    this.port.onmessage = (event) => this.handleMessage(event.data);',
    `    this.port.onmessage = (event) => this.handleMessage(event.data);
    this.handleMessage({ type: 'topology', payload: options?.processorOptions?.evidenceTopology });`);
  replaceOnce('    for (let frame = 0; frame < left.length; frame++) {', `    for (let frame = 0; frame < left.length; frame++) {
      while (this.__shadowEventCursor < this.__shadowEvents.length
        && this.__shadowEvents[this.__shadowEventCursor].frame === this.__shadowFrame) {
        const event = this.__shadowEvents[this.__shadowEventCursor++];
        this.__shadowReceipts.push({ frame: this.__shadowFrame, message: event.message });
        this.handleMessage(event.message);
      }
      this.__shadowFrame++;`);
  replaceOnce('        this.advancePhysics();', `        this.advancePhysics();
        const physicsFrame = this.__shadowPhysicsFrame++;
        for (const window of this.__shadowPhysicsOutputWindows) {
          if (physicsFrame < window.startPhysicsFrame || physicsFrame >= window.endPhysicsFrame) continue;
          window.left.push(this.outputL); window.right.push(this.outputR);
        }
        if (this.__shadowFields) {
          this.__shadowFields.push(Array.from(this.current));
          let pickupL = 0, pickupR = 0;
          for (let layer = 0; layer < (this.topology?.layerIds.length || 0); layer++) {
            pickupL += this.current[this.topology.pickupNodeIndices[layer * 2]];
            pickupR += this.current[this.topology.pickupNodeIndices[layer * 2 + 1]];
          }
          this.__shadowRawLeft.push(pickupL);
          this.__shadowRawRight.push(pickupR);
          if (this.current.some(value => !Number.isFinite(value)) || !Number.isFinite(pickupL) || !Number.isFinite(pickupR)) this.__shadowFieldFinite = false;
        }
        for (const window of this.__shadowPickupWindows) {
          if (this.__shadowFrame < window.startFrame || this.__shadowFrame >= window.endFrame) continue;
          let pickupL = 0, pickupR = 0;
          for (let layer = 0; layer < (this.topology?.layerIds.length || 0); layer++) {
            pickupL += this.current[this.topology.pickupNodeIndices[layer * 2]];
            pickupR += this.current[this.topology.pickupNodeIndices[layer * 2 + 1]];
          }
          window.left.push(pickupL); window.right.push(pickupR);
          if (!Number.isFinite(pickupL) || !Number.isFinite(pickupR)) this.__shadowFieldFinite = false;
        }`);
  return source;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function reconstructSurfaceReadout(physicsOutput, { sourceStartPhysicsFrame = 0, outputStartFrame = 0,
  outputFrames, stride = 8 } = {}) {
  if (!(physicsOutput?.left instanceof Float64Array) || !(physicsOutput?.right instanceof Float64Array)
    || physicsOutput.left.length !== physicsOutput.right.length || !Number.isSafeInteger(sourceStartPhysicsFrame)
    || !Number.isSafeInteger(outputStartFrame) || !Number.isSafeInteger(outputFrames) || outputFrames <= 0
    || !Number.isSafeInteger(stride) || stride <= 0 || outputStartFrame % stride)
    throw new TypeError('Physics output reconstruction requires aligned Float64 stereo samples and valid frame bounds.');
  const left = new Float32Array(outputFrames), right = new Float32Array(outputFrames);
  for (let offset = 0; offset < outputFrames; offset++) {
    const frame = outputStartFrame + offset;
    const outputPhysicsFrame = Math.floor((frame - (stride - 1)) / stride);
    if (outputPhysicsFrame < 0) continue;
    const current = outputPhysicsFrame - sourceStartPhysicsFrame;
    const previous = current - 1;
    if (current < 0 || current >= physicsOutput.left.length
      || (outputPhysicsFrame > 0 && (previous < 0 || previous >= physicsOutput.left.length)))
      throw new RangeError('Captured physics output does not cover the requested readout frames.');
    const alpha = ((frame - (stride - 1 + outputPhysicsFrame * stride)) + 1) / stride;
    const lastL = outputPhysicsFrame === 0 ? 0 : physicsOutput.left[previous];
    const lastR = outputPhysicsFrame === 0 ? 0 : physicsOutput.right[previous];
    left[offset] = lastL + (physicsOutput.left[current] - lastL) * alpha;
    right[offset] = lastR + (physicsOutput.right[current] - lastR) * alpha;
  }
  return { left, right };
}

export function verifySurfaceRateParity({ source, topology, events, frames }) {
  if (!Number.isSafeInteger(frames) || frames <= 0 || frames % 8 !== 0
    || events.some(event => !Number.isSafeInteger(event.frame) || event.frame < 0 || event.frame >= frames))
    throw new RangeError('Rate parity requires a positive 8-frame-aligned duration and in-range events.');
  const full = renderSurface({ source, topology, events, frames, sampleRate: DEFAULT_RATE, captureFields: false });
  const physics = renderSurface({ source, topology, frames: frames / 8, sampleRate: PHYSICS_RATE, captureFields: false,
    events: events.map(event => ({ ...event, frame: Math.floor(event.frame / 8) })),
    physicsOutputWindows: [{ name: 'parity', startPhysicsFrame: 0, endPhysicsFrame: frames / 8 }] });
  const reconstructed = reconstructSurfaceReadout(physics.physicsOutputWindows[0], { outputFrames: frames });
  assert.deepEqual(reconstructed, full.pcm, '6 kHz physics plus production interpolation is exact 48 kHz PCM');
  assert.deepEqual(physics.telemetry, full.telemetry, 'rate parity retains identical solver telemetry');
  assert.deepEqual(physics.current, full.current, 'rate parity retains identical final physics state');
  for (let index = 0; index < events.length; index++) {
    const sourceFrame = full.renderedFrameReceipts[index].frame, physicsFrame = physics.renderedFrameReceipts[index].frame;
    assert.equal(physicsFrame, Math.floor(sourceFrame / 8), `rate parity physics-block assignment ${index}`);
    assert(sourceFrame >= physicsFrame * 8 && sourceFrame < physicsFrame * 8 + 8,
      `rate parity frame phase ${index}`);
  }
  assert.deepEqual(physics.renderedFrameReceipts.map(row => row.message),
    full.renderedFrameReceipts.map(row => row.message), 'rate parity retains message identity/order');
  return { pass: true, fullRate: DEFAULT_RATE, physicsRate: PHYSICS_RATE, stride: 8, frames,
    physicsFrames: frames / 8, eventCount: events.length, bitExactPCM: true, telemetryEqual: true,
    finalStateEqual: true, eventIdentityAndOrderEqual: true, eventPhysicsBlockAssignment: true };
}

export function encodeStereoFloatWav({ left, right }, { sampleRate = DEFAULT_RATE, gain = 1 } = {}) {
  if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length !== right.length || left.length === 0)
    throw new TypeError('Stereo PCM must be equal, non-empty Float32Array channels.');
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be a positive integer.');
  if (!Number.isFinite(gain)) throw new RangeError('gain must be finite.');
  const dataBytes = left.length * 8, bytes = Buffer.allocUnsafe(44 + dataBytes);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + dataBytes, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(3, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 8, 28);
  bytes.writeUInt16LE(8, 32); bytes.writeUInt16LE(32, 34); bytes.write('data', 36); bytes.writeUInt32LE(dataBytes, 40);
  for (let i = 0, offset = 44; i < left.length; i++, offset += 8) {
    bytes.writeFloatLE(left[i] * gain, offset); bytes.writeFloatLE(right[i] * gain, offset + 4);
  }
  return bytes;
}

export function renderSurface({ source, topology, events = [], frames, sampleRate = DEFAULT_RATE,
  captureFields = true, pickupWindows = [], physicsOutputWindows = [] }) {
  if (typeof source !== 'string') throw new TypeError('source must be a string.');
  if (!topology || typeof topology !== 'object') throw new TypeError('topology must be compiled surface topology.');
  if (!Number.isSafeInteger(frames) || frames <= 0) throw new RangeError('frames must be a positive safe integer.');
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be a positive integer.');
  if (!Array.isArray(events)) throw new TypeError('events must be an array.');
  if (!Array.isArray(pickupWindows)) throw new TypeError('pickupWindows must be an array.');
  if (!Array.isArray(physicsOutputWindows)) throw new TypeError('physicsOutputWindows must be an array.');
  if (sampleRate % PHYSICS_RATE !== 0) throw new RangeError('sampleRate must be an integer multiple of the physics rate.');
  const physicsStride = sampleRate / PHYSICS_RATE;
  for (const window of pickupWindows) {
    if (!Number.isSafeInteger(window.startFrame) || !Number.isSafeInteger(window.endFrame)
      || window.startFrame < 0 || window.endFrame > frames || window.endFrame <= window.startFrame
      || window.startFrame % physicsStride || window.endFrame % physicsStride || typeof window.name !== 'string')
      throw new RangeError('pickup windows must be named, increasing, in-range physics-aligned intervals.');
  }
  const physicsFrameCount = frames / physicsStride;
  for (const window of physicsOutputWindows) {
    if (!Number.isSafeInteger(window.startPhysicsFrame) || !Number.isSafeInteger(window.endPhysicsFrame)
      || window.startPhysicsFrame < 0 || window.endPhysicsFrame > physicsFrameCount
      || window.endPhysicsFrame <= window.startPhysicsFrame || typeof window.name !== 'string')
      throw new RangeError('physics output windows must be named, increasing, in-range intervals.');
  }
  const scheduled = events.map((event, index) => {
    if (!Number.isSafeInteger(event?.frame) || event.frame < 0 || event.frame >= frames)
      throw new RangeError(`events[${index}].frame must be an integer within the render.`);
    if (!event.message || typeof event.message !== 'object' || typeof event.message.type !== 'string')
      throw new TypeError(`events[${index}].message must have a string type.`);
    return { frame: event.frame, message: event.message, index };
  }).sort((a, b) => a.frame - b.frame || a.index - b.index);

  const instrumented = instrumentSurfaceSchedule(source);
  let Processor;
  class AudioWorkletProcessorStub {
    constructor() { this.port = { onmessage: null, postMessage() {} }; }
  }
  vm.runInNewContext(instrumented, {
    AudioWorkletProcessor: AudioWorkletProcessorStub, sampleRate,
    Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array,
    Int8Array, Int16Array, Int32Array, Array, Math, Number, Object, Map,
    performance: globalThis.performance,
    registerProcessor(_name, processor) { Processor = processor; }
  }, { filename: 'surface-plate.worklet.shadow-render.js' });
  if (!Processor) throw new Error('Surface worklet did not register a processor.');
  const processor = new Processor({ processorOptions: { evidenceSchedule: { events: scheduled, pickupWindows, physicsOutputWindows }, evidenceTopology: topology } });
  if (!captureFields) processor.__shadowFields = null;
  const left = new Float32Array(frames), right = new Float32Array(frames);
  let frame = 0, eventCursor = 0;
  while (frame < frames) {
    let count = Math.min(QUANTUM, frames - frame);
    while (eventCursor < scheduled.length && scheduled[eventCursor].frame <= frame) eventCursor++;
    const nextEvent = scheduled[eventCursor];
    if (nextEvent) count = Math.min(count, nextEvent.frame - frame);
    if (!count) count = Math.min(QUANTUM, frames - frame);
    const outL = new Float32Array(count), outR = new Float32Array(count);
    processor.process([], [[outL, outR]]);
    left.set(outL, frame); right.set(outR, frame); frame += count;
  }
  const telemetry = JSON.parse(JSON.stringify(processor.getDiagnostics()));
  if (telemetry.nonFinite !== 0 || !finiteValues(telemetry) || processor.current.some(value => !Number.isFinite(value))
    || left.some(value => !Number.isFinite(value)) || right.some(value => !Number.isFinite(value)))
    throw new Error('Surface shadow render produced non-finite PCM, state, or solver telemetry.');
  const result = { pcm: { left, right }, telemetry,
    renderedFrameReceipts: Array.from(processor.__shadowReceipts, receipt => ({ ...receipt })),
    hardnessPulseReceipts: Array.from(processor.__hardnessPulseReceipts || [], receipt => ({ ...receipt })),
    nodeCount: processor.current.length, sourceSha256: sha256(source) };
  if (captureFields) {
    const fieldCount = processor.__shadowFields.length;
    const fields = new Float32Array(fieldCount * result.nodeCount);
    for (let step = 0; step < fieldCount; step++) fields.set(processor.__shadowFields[step], step * result.nodeCount);
    result.fields = { frames: fieldCount, sampleRate: PHYSICS_RATE, nodeCount: result.nodeCount, values: fields };
    result.rawPickup = { sampleRate: PHYSICS_RATE, left: Float32Array.from(processor.__shadowRawLeft),
      right: Float32Array.from(processor.__shadowRawRight) };
    result.fieldsFinite = processor.__shadowFieldFinite;
    if (!result.fieldsFinite || result.fields.values.some(value => !Number.isFinite(value))
      || result.rawPickup.left.some(value => !Number.isFinite(value))
      || result.rawPickup.right.some(value => !Number.isFinite(value)))
      throw new Error('Surface shadow render produced non-finite field or pickup observations.');
  }
  if (pickupWindows.length) {
    result.pickupWindows = processor.__shadowPickupWindows.map(window => ({
      name: window.name, startFrame: window.startFrame, endFrame: window.endFrame,
      sampleRate: PHYSICS_RATE, left: Float32Array.from(window.left), right: Float32Array.from(window.right) }));
    if (!processor.__shadowFieldFinite || result.pickupWindows.some(window =>
      window.left.some(value => !Number.isFinite(value)) || window.right.some(value => !Number.isFinite(value))))
      throw new Error('Surface shadow render produced non-finite windowed pickup observations.');
  }
  if (physicsOutputWindows.length) {
    result.physicsOutputWindows = processor.__shadowPhysicsOutputWindows.map(window => ({
      name: window.name, startPhysicsFrame: window.startPhysicsFrame, endPhysicsFrame: window.endPhysicsFrame,
      sampleRate: PHYSICS_RATE, left: Float64Array.from(window.left), right: Float64Array.from(window.right) }));
    if (result.physicsOutputWindows.some(window => window.left.some(value => !Number.isFinite(value))
      || window.right.some(value => !Number.isFinite(value))))
      throw new Error('Surface shadow render produced non-finite physics output observations.');
  }
  return result;
}
