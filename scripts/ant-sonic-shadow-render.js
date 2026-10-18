import { createHash } from 'node:crypto';
import vm from 'node:vm';

const DEFAULT_RATE = 48_000;
const PHYSICS_RATE = 6_000;
const QUANTUM = 128;
const MAX_PICKUP_STEM_BYTES = 256 * 1024 * 1024;

function finiteValues(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  return !value || typeof value !== 'object' || Object.values(value).every(finiteValues);
}

export function instrumentSurfaceSchedule(source, pickupCapture = null, pickupStemFrameRange = null,
  boundarySchedule = false) {
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
    this.__shadowFields = [];
    this.__shadowRawLeft = [];
    this.__shadowRawRight = [];
    this.__shadowFieldFinite = true;`);
  if (pickupCapture && pickupStemFrameRange) {
    replaceOnce('    this.__shadowFieldFinite = true;', `    this.__shadowFieldFinite = true;
    this.__shadowPickupFrameRange = ${JSON.stringify(pickupStemFrameRange)};`);
    replaceOnce('      this.queueHead = (this.queueHead + 1) & 63; this.queueLength--;', `      this.queueHead = (this.queueHead + 1) & 63; this.queueLength--;
      if (this.__shadowPickupCapture && this.__shadowFrame === this.__shadowPickupFrameRange.startFrame)
        this.__shadowPickupCapture.interpolationStart = { phase: this.phase, samplesSinceStep: this.samplesSinceStep,
          lastL: this.lastL, lastR: this.lastR, queueHead: this.queueHead, queueLength: this.queueLength,
          queueL: this.queueL.slice(), queueR: this.queueR.slice() };`);
  }
  replaceOnce('    this.port.onmessage = (event) => this.handleMessage(event.data);',
    `    this.port.onmessage = (event) => this.handleMessage(event.data);
    this.handleMessage({ type: 'topology', payload: options?.processorOptions?.evidenceTopology });`);
  const dispatchAtBoundary = `      while (this.__shadowEventCursor < this.__shadowEvents.length
        && this.__shadowEvents[this.__shadowEventCursor].frame === this.__shadowFrame) {
        const event = this.__shadowEvents[this.__shadowEventCursor++];
        this.__shadowReceipts.push({ frame: this.__shadowFrame, message: event.message });
        this.handleMessage(event.message);
      }`;
  replaceOnce('    for (let frame = 0; frame < left.length; frame++) {', `${boundarySchedule ? dispatchAtBoundary + '\n' : ''}    for (let frame = 0; frame < left.length; frame++) {
${boundarySchedule ? '' : dispatchAtBoundary + '\n'}      this.__shadowFrame++;`);
  replaceOnce('        this.advancePhysics();', `        this.advancePhysics();
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
        }`);
  if (pickupCapture) {
    replaceOnce('    this.__shadowFieldFinite = true;', `    this.__shadowFieldFinite = true;
    const stemIds = ${JSON.stringify(pickupCapture.layerIds)};
    this.__shadowPickupCapture = {
      layerIds: stemIds, idToSlot: new Map(stemIds.map((id, index) => [id, index])), layerSlots: [],
      maxPhysicsSteps: ${pickupCapture.maxPhysicsSteps}, maxLayers: ${pickupCapture.maxLayers},
      startFrame: ${pickupCapture.startFrame}, endFrame: ${pickupCapture.endFrame},
      allocatedBytes: ${pickupCapture.allocatedBytes}, steps: 0,
      plates: stemIds.map(id => ({ id, left: new Float64Array(${pickupCapture.maxPhysicsSteps}), right: new Float64Array(${pickupCapture.maxPhysicsSteps}) })),
      sphere: { left: new Float64Array(${pickupCapture.maxPhysicsSteps}), right: new Float64Array(${pickupCapture.maxPhysicsSteps}) },
      preLimiter: { left: new Float64Array(${pickupCapture.maxPhysicsSteps}), right: new Float64Array(${pickupCapture.maxPhysicsSteps}) },
      topologyGeneration: new Uint32Array(${pickupCapture.maxPhysicsSteps}),
      order: {
        left: new Uint16Array(${pickupCapture.maxPhysicsSteps * pickupCapture.maxLayers}),
        right: new Uint16Array(${pickupCapture.maxPhysicsSteps * pickupCapture.maxLayers}),
        leftCount: new Uint16Array(${pickupCapture.maxPhysicsSteps}),
        rightCount: new Uint16Array(${pickupCapture.maxPhysicsSteps})
      }
    };`);
    replaceOnce('    this.topology = t;', `    this.topology = t;
    if (this.__shadowPickupCapture) this.__shadowPickupCapture.layerSlots = t.layerIds.map(id => {
      const slot = this.__shadowPickupCapture.idToSlot.get(id);
      if (slot === undefined) throw new Error('Pickup stem topology contains an unregistered Plate ID.');
      return slot;
    });`);
    replaceOnce('        this.advancePhysics();', `        const pickupCaptureStep = this.__shadowPickupCapture
          && this.__shadowFrame > this.__shadowPickupCapture.startFrame
          && this.__shadowFrame <= this.__shadowPickupCapture.endFrame;
        if (pickupCaptureStep && this.__shadowPickupCapture.steps >= this.__shadowPickupCapture.maxPhysicsSteps)
          throw new Error('Pickup stem capture exceeded its preallocated physics-step capacity.');
        this.__shadowPickupCaptureStep = Boolean(pickupCaptureStep);
        if (pickupCaptureStep)
          this.__shadowPickupCapture.topologyGeneration[this.__shadowPickupCapture.steps] = this.topology?.generation || 0;
        this.advancePhysics();
        this.__shadowPickupCaptureStep = false;
        if (pickupCaptureStep) this.__shadowPickupCapture.steps++;`);
    replaceOnce('      if (node === t.pickupNodeIndices[layer * 2]) outL += next;', `      if (node === t.pickupNodeIndices[layer * 2]) {
        outL += next;
        if (this.__shadowPickupCaptureStep) {
          const capture = this.__shadowPickupCapture, step = capture.steps;
          const slot = capture.layerSlots[layer];
          capture.plates[slot].left[step] = next * PLATE_PICKUP_MIX;
          capture.order.left[step * capture.maxLayers + capture.order.leftCount[step]++] = slot;
        }
      }`);
    replaceOnce('      if (node === t.pickupNodeIndices[layer * 2 + 1]) outR += next;', `      if (node === t.pickupNodeIndices[layer * 2 + 1]) {
        outR += next;
        if (this.__shadowPickupCaptureStep) {
          const capture = this.__shadowPickupCapture, step = capture.steps;
          const slot = capture.layerSlots[layer];
          capture.plates[slot].right[step] = next * PLATE_PICKUP_MIX;
          capture.order.right[step * capture.maxLayers + capture.order.rightCount[step]++] = slot;
        }
      }`);
    replaceOnce(`      sphereOutR += this.sphereCurrent[i] * this.spherePickupR[i];
    }
    for (let a = 0; a < steppingCount; ) {`, `      sphereOutR += this.sphereCurrent[i] * this.spherePickupR[i];
    }
    if (this.__shadowPickupCaptureStep) {
      const capture = this.__shadowPickupCapture, step = capture.steps;
      capture.sphere.left[step] = sphereOutL * MIX;
      capture.sphere.right[step] = sphereOutR * MIX;
    }
    for (let a = 0; a < steppingCount; ) {`);
    replaceOnce(`    const mixR = outR * PLATE_PICKUP_MIX + sphereOutR * MIX;
    this.telemetry.maxOutputAbs`, `    const mixR = outR * PLATE_PICKUP_MIX + sphereOutR * MIX;
    if (this.__shadowPickupCaptureStep) {
      const capture = this.__shadowPickupCapture, step = capture.steps;
      capture.preLimiter.left[step] = mixL;
      capture.preLimiter.right[step] = mixR;
      capture.topologyGeneration[step] = t.generation;
    }
    this.telemetry.maxOutputAbs`);
  }
  return source;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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
  captureFields = true, capturePickupStems = false, captureState = false, captureStateHashes = false,
  outputFrameRange = null, pickupStemFrameRange = null }) {
  if (typeof source !== 'string') throw new TypeError('source must be a string.');
  if (!topology || typeof topology !== 'object') throw new TypeError('topology must be compiled surface topology.');
  if (!Number.isSafeInteger(frames) || frames <= 0) throw new RangeError('frames must be a positive safe integer.');
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be a positive integer.');
  if (!Array.isArray(events)) throw new TypeError('events must be an array.');
  if (typeof capturePickupStems !== 'boolean') throw new TypeError('capturePickupStems must be a boolean.');
  if (typeof captureState !== 'boolean') throw new TypeError('captureState must be a boolean.');
  if (typeof captureStateHashes !== 'boolean') throw new TypeError('captureStateHashes must be a boolean.');
  const outputRange = normalizeFrameRange(outputFrameRange, frames, 'outputFrameRange');
  const pickupRange = pickupStemFrameRange === null
    ? { startFrame: 0, endFrame: frames }
    : normalizeFrameRange(pickupStemFrameRange, frames, 'pickupStemFrameRange');
  if (pickupStemFrameRange !== null && !capturePickupStems)
    throw new TypeError('pickupStemFrameRange requires capturePickupStems.');
  if (capturePickupStems && (pickupRange.startFrame * PHYSICS_RATE % sampleRate !== 0
    || pickupRange.endFrame * PHYSICS_RATE % sampleRate !== 0))
    throw new RangeError('pickupStemFrameRange boundaries must align with physics steps.');
  const scheduled = events.map((event, index) => {
    if (!Number.isSafeInteger(event?.frame) || event.frame < 0 || event.frame >= frames)
      throw new RangeError(`events[${index}].frame must be an integer within the render.`);
    if (!event.message || typeof event.message !== 'object' || typeof event.message.type !== 'string')
      throw new TypeError(`events[${index}].message must have a string type.`);
    return { frame: event.frame, message: event.message, index };
  }).sort((a, b) => a.frame - b.frame || a.index - b.index);

  const pickupCapture = capturePickupStems
    ? buildPickupCapture(topology, scheduled, pickupRange, sampleRate) : null;
  const instrumented = instrumentSurfaceSchedule(source, pickupCapture, capturePickupStems ? pickupRange : null, true);
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
  const processor = new Processor({ processorOptions: { evidenceSchedule: { events: scheduled }, evidenceTopology: topology } });
  if (!captureFields) processor.__shadowFields = null;
  const stateHashes = captureStateHashes ? observePhysicsSteps(processor) : null;
  const left = new Float32Array(outputRange.endFrame - outputRange.startFrame);
  const right = new Float32Array(left.length);
  let frame = 0, eventCursor = 0;
  while (frame < frames) {
    let count = Math.min(QUANTUM, frames - frame);
    while (eventCursor < scheduled.length && scheduled[eventCursor].frame <= frame) eventCursor++;
    const nextEvent = scheduled[eventCursor];
    if (nextEvent) count = Math.min(count, nextEvent.frame - frame);
    if (!count) count = Math.min(QUANTUM, frames - frame);
    const outL = new Float32Array(count), outR = new Float32Array(count);
    processor.process([], [[outL, outR]]);
    const copyStart = Math.max(frame, outputRange.startFrame), copyEnd = Math.min(frame + count, outputRange.endFrame);
    if (copyEnd > copyStart) {
      left.set(outL.subarray(copyStart - frame, copyEnd - frame), copyStart - outputRange.startFrame);
      right.set(outR.subarray(copyStart - frame, copyEnd - frame), copyStart - outputRange.startFrame);
    }
    frame += count;
  }
  const telemetry = JSON.parse(JSON.stringify(processor.getDiagnostics()));
  if (telemetry.nonFinite !== 0 || !finiteValues(telemetry) || processor.current.some(value => !Number.isFinite(value))
    || left.some(value => !Number.isFinite(value)) || right.some(value => !Number.isFinite(value)))
    throw new Error('Surface shadow render produced non-finite PCM, state, or solver telemetry.');
  const result = { pcm: { left, right }, pcmFrameRange: outputRange, telemetry,
    renderedFrameReceipts: Array.from(processor.__shadowReceipts, receipt => ({ ...receipt })),
    nodeCount: processor.current.length, sourceSha256: sha256(source) };
  if (captureState) result.finalState = snapshotSolverState(processor);
  if (captureStateHashes) result.stateHashes = stateHashes;
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
  if (capturePickupStems) result.pickupStems = snapshotPickupStems(processor.__shadowPickupCapture);
  return result;
}

export function renderProductionSurface({ source, topology, events = [], frames,
  sampleRate = DEFAULT_RATE, captureState = false, captureStateHashes = false, outputFrameRange = null }) {
  if (typeof source !== 'string') throw new TypeError('source must be a string.');
  if (!topology || typeof topology !== 'object') throw new TypeError('topology must be compiled surface topology.');
  if (!Number.isSafeInteger(frames) || frames <= 0) throw new RangeError('frames must be a positive safe integer.');
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be a positive integer.');
  if (!Array.isArray(events)) throw new TypeError('events must be an array.');
  if (typeof captureState !== 'boolean') throw new TypeError('captureState must be a boolean.');
  if (typeof captureStateHashes !== 'boolean') throw new TypeError('captureStateHashes must be a boolean.');
  const outputRange = normalizeFrameRange(outputFrameRange, frames, 'outputFrameRange');
  const scheduled = events.map((event, index) => {
    if (!Number.isSafeInteger(event?.frame) || event.frame < 0 || event.frame >= frames)
      throw new RangeError(`events[${index}].frame must be an integer within the render.`);
    if (!event.message || typeof event.message !== 'object' || typeof event.message.type !== 'string')
      throw new TypeError(`events[${index}].message must have a string type.`);
    return { ...event, index };
  }).sort((a, b) => a.frame - b.frame || a.index - b.index);
  let Processor;
  class AudioWorkletProcessorStub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(source, {
    AudioWorkletProcessor: AudioWorkletProcessorStub, sampleRate,
    Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array,
    Int8Array, Int16Array, Int32Array, Array, Math, Number, Object, Map,
    performance: globalThis.performance,
    registerProcessor(_name, processor) { Processor = processor; }
  }, { filename: 'surface-plate.worklet.production-render.js' });
  if (!Processor) throw new Error('Surface worklet did not register a processor.');
  const processor = new Processor(), left = new Float32Array(outputRange.endFrame - outputRange.startFrame),
    right = new Float32Array(outputRange.endFrame - outputRange.startFrame);
  const stateHashes = captureStateHashes ? observePhysicsSteps(processor) : null;
  let frame = 0;
  const processTo = end => {
    while (frame < end) {
      const count = Math.min(QUANTUM, end - frame), outL = new Float32Array(count), outR = new Float32Array(count);
      processor.process([], [[outL, outR]]);
      const copyStart = Math.max(frame, outputRange.startFrame), copyEnd = Math.min(end, outputRange.endFrame);
      if (copyEnd > copyStart) {
        left.set(outL.subarray(copyStart - frame, copyEnd - frame), copyStart - outputRange.startFrame);
        right.set(outR.subarray(copyStart - frame, copyEnd - frame), copyStart - outputRange.startFrame);
      }
      frame += count;
    }
  };
  processor.handleMessage({ type: 'topology', payload: topology });
  const receipts = [];
  for (const event of scheduled) {
    processTo(event.frame);
    processor.handleMessage(event.message);
    receipts.push({ frame: event.frame, message: event.message });
  }
  processTo(frames);
  const telemetry = JSON.parse(JSON.stringify(processor.getDiagnostics()));
  if (telemetry.nonFinite !== 0 || !finiteValues(telemetry) || processor.current.some(value => !Number.isFinite(value))
    || left.some(value => !Number.isFinite(value)) || right.some(value => !Number.isFinite(value)))
    throw new Error('Production render produced non-finite PCM, state, or solver telemetry.');
  const result = { pcm: { left, right }, pcmFrameRange: outputRange, telemetry, renderedFrameReceipts: receipts,
    nodeCount: processor.current.length, sourceSha256: sha256(source) };
  if (captureState) result.finalState = snapshotSolverState(processor);
  if (captureStateHashes) result.stateHashes = stateHashes;
  return result;
}

export function reconstructPickupStemMix(stems) {
  if (!stems || !Array.isArray(stems.plates) || !Number.isSafeInteger(stems.frames)
    || !(stems.order?.left instanceof Uint16Array) || !(stems.order?.right instanceof Uint16Array)
    || !(stems.order?.leftCount instanceof Uint16Array) || !(stems.order?.rightCount instanceof Uint16Array))
    throw new TypeError('Pickup stems must be a captured stereo stem package.');
  const left = new Float64Array(stems.frames), right = new Float64Array(stems.frames);
  for (let step = 0; step < stems.frames; step++) {
    let l = 0, r = 0;
    for (let i = 0, count = stems.order.leftCount[step]; i < count; i++)
      l += stems.plates[stems.order.left[step * stems.order.stride + i]].left[step];
    for (let i = 0, count = stems.order.rightCount[step]; i < count; i++)
      r += stems.plates[stems.order.right[step * stems.order.stride + i]].right[step];
    left[step] = l + stems.sphere.left[step];
    right[step] = r + stems.sphere.right[step];
  }
  return { left, right };
}

export function reconstructSurfacePcm(stems, { frames, sampleRate = DEFAULT_RATE } = {}) {
  if (!Number.isSafeInteger(frames) || frames <= 0) throw new RangeError('frames must be a positive safe integer.');
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be a positive integer.');
  const mix = reconstructPickupStemMix(stems);
  if (Number.isSafeInteger(stems.startFrame) && Number.isSafeInteger(stems.endFrame)
    && stems.endFrame - stems.startFrame !== frames)
    throw new RangeError('PCM frame count must match the captured pickup stem range.');
  const left = new Float32Array(frames), right = new Float32Array(frames);
  const initial = stems.interpolationStart;
  const queueL = initial ? Float32Array.from(initial.queueL) : new Float32Array(64);
  const queueR = initial ? Float32Array.from(initial.queueR) : new Float32Array(64);
  if (queueL.length !== 64 || queueR.length !== 64)
    throw new TypeError('Captured interpolation boundary must contain 64 stereo queue entries.');
  let phase = initial?.phase ?? 0, samplesSinceStep = initial?.samplesSinceStep ?? 0;
  let lastL = initial?.lastL ?? 0, lastR = initial?.lastR ?? 0;
  let queueHead = initial?.queueHead ?? 0, queueLength = initial?.queueLength ?? 0, step = 0;
  for (let frame = 0; frame < frames; frame++) {
    phase += PHYSICS_RATE;
    samplesSinceStep++;
    if (phase >= sampleRate) {
      phase -= sampleRate;
      if (step >= mix.left.length) throw new Error('Captured pickup stems ended before PCM interpolation.');
      const outputL = mix.left[step] / (1 + Math.abs(mix.left[step]));
      const outputR = mix.right[step] / (1 + Math.abs(mix.right[step]));
      const count = samplesSinceStep;
      for (let sample = 1; sample <= count; sample++) {
        const tail = (queueHead + queueLength) & 63, amount = sample / count;
        queueL[tail] = lastL + (outputL - lastL) * amount;
        queueR[tail] = lastR + (outputR - lastR) * amount;
        queueLength++;
      }
      lastL = outputL; lastR = outputR; samplesSinceStep = 0; step++;
    }
    if (queueLength) {
      left[frame] = queueL[queueHead]; right[frame] = queueR[queueHead];
      queueHead = (queueHead + 1) & 63; queueLength--;
    }
  }
  if (step !== stems.frames) throw new Error(`PCM interpolation consumed ${step} of ${stems.frames} pickup steps.`);
  return { left, right };
}

function normalizeFrameRange(value, frames, name) {
  if (value === null) return { startFrame: 0, endFrame: frames };
  if (!value || typeof value !== 'object' || !Number.isSafeInteger(value.startFrame)
    || !Number.isSafeInteger(value.endFrame) || value.startFrame < 0
    || value.endFrame <= value.startFrame || value.endFrame > frames)
    throw new RangeError(`${name} must be a non-empty frame range within the render.`);
  return { startFrame: value.startFrame, endFrame: value.endFrame };
}

function buildPickupCapture(topology, events, range, sampleRate) {
  const maxPhysicsSteps = (range.endFrame - range.startFrame) * PHYSICS_RATE / sampleRate;
  if (!Number.isSafeInteger(maxPhysicsSteps)) throw new RangeError('Pickup stem physics-step capacity is too large.');
  const topologies = [topology, ...events.filter(event => event.message.type === 'topology')
    .map(event => event.message.payload)];
  const layerIds = [...new Set(topologies.flatMap(item => Array.isArray(item?.layerIds) ? item.layerIds : []))];
  const maxLayers = topologies.reduce((maximum, item) => Math.max(maximum, item?.layerIds?.length || 0), 0);
  const allocatedBytes = maxPhysicsSteps * (layerIds.length * 16 + maxLayers * 4 + 40);
  if (!Number.isSafeInteger(allocatedBytes) || allocatedBytes > MAX_PICKUP_STEM_BYTES) {
    throw new RangeError(`Pickup stem capture needs ${allocatedBytes} bytes; limit is ${MAX_PICKUP_STEM_BYTES}.`);
  }
  return { layerIds, maxPhysicsSteps, maxLayers, allocatedBytes,
    startFrame: range.startFrame, endFrame: range.endFrame };
}

function snapshotPickupStems(capture) {
  if (!capture) throw new Error('Pickup stem capture was not initialized.');
  const frames = capture.steps;
  return {
    sampleRate: PHYSICS_RATE, frames, allocatedBytes: capture.allocatedBytes,
    startFrame: capture.startFrame, endFrame: capture.endFrame,
    interpolationStart: capture.interpolationStart,
    layerIds: Array.from(capture.layerIds), maxPhysicsSteps: capture.maxPhysicsSteps,
    plates: Array.from(capture.plates, ({ id, left, right }) => ({ id,
      left: left.subarray(0, frames), right: right.subarray(0, frames) })),
    sphere: { left: capture.sphere.left.subarray(0, frames), right: capture.sphere.right.subarray(0, frames) },
    preLimiter: { left: capture.preLimiter.left.subarray(0, frames), right: capture.preLimiter.right.subarray(0, frames) },
    topologyGeneration: capture.topologyGeneration.subarray(0, frames),
    order: {
      stride: capture.maxLayers,
      left: capture.order.left.subarray(0, frames * capture.maxLayers),
      right: capture.order.right.subarray(0, frames * capture.maxLayers),
      leftCount: capture.order.leftCount.subarray(0, frames),
      rightCount: capture.order.rightCount.subarray(0, frames)
    }
  };
}

function snapshotSolverState(processor) {
  const copy = value => value ? value.slice() : new Float32Array(0);
  return {
    current: copy(processor.current), previous: copy(processor.previous), next: copy(processor.next),
    lap: copy(processor.lap), lapStamp: copy(processor.lapStamp), nodeLayer: copy(processor.nodeLayer),
    awake: copy(processor.awake), energyQuiet: copy(processor.energyQuiet),
    pendingWake: copy(processor.pendingWake), pendingWakeReason: copy(processor.pendingWakeReason),
    pendingNodes: copy(processor.pendingNodes), pendingCount: processor.pendingCount, epoch: processor.epoch,
    contactMemory: copy(processor.contactMemory), lastContactStep: copy(processor.lastContactStep),
    contactForces: copy(processor.contactForces), contactCursor: processor.contactCursor,
    active: processor.active.slice(0, processor.activeCount), activeCount: processor.activeCount,
    sphereCurrent: copy(processor.sphereCurrent), spherePrevious: copy(processor.spherePrevious),
    topologyGeneration: processor.topology?.generation ?? null,
    phase: processor.phase, samplesSinceStep: processor.samplesSinceStep,
    lastL: processor.lastL, lastR: processor.lastR, outputL: processor.outputL, outputR: processor.outputR,
    queueHead: processor.queueHead, queueLength: processor.queueLength,
    queueL: processor.queueL.slice(), queueR: processor.queueR.slice()
  };
}

function observePhysicsSteps(processor) {
  const hashes = [], advance = processor.advancePhysics;
  processor.advancePhysics = function () {
    const result = advance.call(this);
    const hash = createHash('sha256');
    for (const key of ['current', 'previous', 'next', 'lap', 'lapStamp', 'nodeLayer', 'awake', 'energyQuiet',
      'pendingWake', 'pendingWakeReason', 'pendingNodes', 'contactForces', 'contactMemory', 'lastContactStep',
      'sphereCurrent', 'spherePrevious']) {
      const value = this[key];
      if (value?.length) hash.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
    if (this.activeCount) hash.update(Buffer.from(this.active.buffer, this.active.byteOffset, this.activeCount * this.active.BYTES_PER_ELEMENT));
    hash.update(JSON.stringify({ activeCount: this.activeCount, pendingCount: this.pendingCount, epoch: this.epoch,
      contactCursor: this.contactCursor,
      generation: this.topology?.generation ?? null, layerIds: this.topology?.layerIds ?? [],
      outputL: this.outputL, outputR: this.outputR, telemetry: this.telemetry }));
    hashes.push(hash.digest('hex'));
    return result;
  };
  return hashes;
}
