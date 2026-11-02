import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const QUANTUM = 128;
export const AUDIO_WINDOWS = Object.freeze([[50, 60], [110, 120], [170, 180], [230, 240], [290, 300]]);
// The VM helper returns pre-bridge PCM; browser WAVs include the fixed 0.7 bridge gain.
const finite = value => typeof value === 'number' ? Number.isFinite(value)
  : !value || typeof value !== 'object' || Object.values(value).every(finite);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ANALYSIS = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-audio-reassessment/analysis');
const CACHE = resolve(ROOT, '.cache/local-x-audio-reassessment');
const SHA = value => createHash('sha256').update(value).digest('hex');

function packTyped(value) {
  if (ArrayBuffer.isView(value)) return { __typedArray: value.constructor.name, data: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') };
  if (Array.isArray(value)) return value.map(packTyped);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, packTyped(child)]));
  return value;
}

export function createBrowserParityFixture() {
  const plate = id => {
    const mask = new Array(96 * 96).fill(0);
    for (let y = 24; y <= 72; y++) for (let x = 24; x <= 72; x++) mask[y * 96 + x] = 1;
    return { id, grid: { width: 96, height: 96 }, mask, edges: [],
      pickups: [{ x: .25, y: .5 }, { x: .75, y: .5 }], material: { stiffness: .9, density: 1.1, damping: .35 } };
  };
  const bottom = plate('parity-bottom'), top = plate('parity-top');
  const nodule = { id: 'parity-nodule', position: { x: .5, y: .5 }, physicalRadiusMeters: .03,
    material: { density: 2000, youngModulus: 800000, poisson: .3 }, sourcePlateIDs: ['parity-bottom', 'parity-top'],
    burying: { foundationPlateId: 'parity-bottom' },
    coupling: { plateId: 'parity-bottom', weight: .2, position: { x: .5, y: .5 }, depthMeters: .01 } };
  const topology = plates => compileSurfaceTopology({ plates, nodules: [nodule],
    stratigraphy: { layerOrder: plates.map(item => item.id) } });
  const initialTopology = topology([bottom]);
  const expandedTopology = topology([bottom, top]);
  const strike = id => ({ type: 'strike', payload: { plateId: id, layerId: id,
    position: { x: .5, y: .5 }, strength: .035, footprintRadius: .012 } });
  return { frames: 24_576, sampleRate: 48_000, initialTopology,
    events: [
      { frame: 0, message: strike('parity-bottom') },
      { frame: 16, message: { type: 'topology', payload: initialTopology } },
      { frame: 800, message: { type: 'topology', payload: expandedTopology } },
      { frame: 800, message: strike('parity-top') }
    ] };
}

export function instrumentLocalAudioSource(source) {
  if (typeof source !== 'string') throw new TypeError('Worklet source must be a string.');
  source = source.replace(/\r\n/g, '\n');
  const replaceOnce = (before, after) => {
    if (source.split(before).length !== 2) throw new Error(`Local audio instrumentation anchor missing or ambiguous: ${before}`);
    source = source.replace(before, after);
  };
  replaceOnce('  constructor() {', '  constructor(options) {');
  replaceOnce('    super();', `    super();
    const evidence = options?.processorOptions?.evidenceSchedule || {};
    this.__evFrame = 0; this.__evEnd = evidence.endFrame || 0; this.__evEvents = evidence.events || []; this.__evCursor = 0; this.__evDone = false;
    this.__evReceipts = []; this.__evCompactReceipts = Boolean(evidence.compactReceipts); this.__evInvalidTopologies = 0;
    this.__evObserver = evidence.observe ? { windows: evidence.windows, rows: [] } : null;
    this.__evSleepById = new Map(); this.__evWakeById = new Map(); this.__evWindowBases = new Map(); this.__evDirectByWindow = new Map();`);
  replaceOnce('    this.port.onmessage = (event) => this.handleMessage(event.data);',
    `    this.port.onmessage = (event) => this.handleMessage(event.data);
    this.handleMessage({ type: 'topology', payload: options?.processorOptions?.evidenceTopology });`);
  replaceOnce('      if (!validTopology(p)) { this.telemetry.dropped++; return; }',
    `      if (!validTopology(p)) { this.__evInvalidTopologies++; this.telemetry.dropped++; return; }`);
  replaceOnce('    for (let frame = 0; frame < left.length; frame++) {',
    `    for (let frame = 0; frame < left.length; frame++) {
      if (this.__evObserver) {
        const wi = this.__evObserver.windows.findIndex(([a]) => this.__evFrame === a * sampleRate);
        if (wi >= 0) this.__evWindowBases.set(wi, { sleep: new Map(this.__evSleepById), wake: new Map(this.__evWakeById) });
      }
      while (this.__evCursor < this.__evEvents.length && this.__evEvents[this.__evCursor].frame === this.__evFrame) {
        const event = this.__evEvents[this.__evCursor++], droppedBefore = this.telemetry.droppedRoutes;
        if (this.__evObserver && event.message.type === 'strike') {
          const second = Math.floor(this.__evFrame / sampleRate), wi = this.__evObserver.windows.findIndex(([a, b]) => second >= a && second < b);
          const id = event.message.payload?.layerId ?? event.message.payload?.plateId, key = wi + ':' + id;
          this.handleMessage(event.message);
          if (wi >= 0 && this.telemetry.droppedRoutes === droppedBefore) this.__evDirectByWindow.set(key, (this.__evDirectByWindow.get(key) || 0) + 1);
        } else {
          this.handleMessage(event.message);
        }
        this.__evReceipts.push({ requestedFrame: event.frame, actualFrame: this.__evFrame, type: event.message.type,
          accepted: event.message.type === 'strike' ? this.telemetry.droppedRoutes === droppedBefore : undefined,
          layerId: event.message.type === 'strike' ? event.message.payload?.layerId ?? event.message.payload?.plateId ?? null : null });
      }
      this.__evFrame++;`);
  replaceOnce('    return true;\n  }\n\n  advancePhysics()', `    if (!this.__evDone && this.__evEnd && this.__evFrame >= this.__evEnd) {
      this.__evDone = true; let stateFinite = true;
      for (const key of Object.keys(this)) if (ArrayBuffer.isView(this[key]))
        for (let i = 0; i < this[key].length; i++) if (!Number.isFinite(this[key][i])) stateFinite = false;
      const eventSummary = {};
      for (const receipt of this.__evReceipts) {
        const stat = eventSummary[receipt.type] || (eventSummary[receipt.type] = { count: 0, exactFrameCount: 0, maxLagFrames: 0, rejected: 0 });
        const lag = receipt.actualFrame - receipt.requestedFrame; stat.count++; stat.exactFrameCount += Number(lag === 0);
        stat.maxLagFrames = Math.max(stat.maxLagFrames, lag); stat.rejected += Number(receipt.accepted === false);
      }
      this.port.postMessage({ type: 'local-audio-done', renderedFrames: this.__evFrame, stateFinite,
        invalidTopologies: this.__evInvalidTopologies, receivedEvents: this.__evCursor,
        receipts: this.__evCompactReceipts ? undefined : this.__evReceipts, eventSummary, diagnostics: this.getDiagnostics(),
        observer: this.__evObserver?.rows || null });
    }
    return true;\n  }\n\n  advancePhysics()`);
  replaceOnce('        this.advancePhysics();', `        this.advancePhysics();
        if (this.__evObserver) {
          const second = Math.floor((this.__evFrame - 1) / sampleRate), wi = this.__evObserver.windows.findIndex(([a, b]) => second >= a && second < b);
          if (wi >= 0) {
            let row = this.__evObserver.rows[wi];
            if (!row) row = this.__evObserver.rows[wi] = { start: this.__evObserver.windows[wi][0], end: this.__evObserver.windows[wi][1], layers: [], stateSamples: 0, stateEnergySum: 0 };
            const t = this.topology;
            if (t) for (let layer = 0; layer < t.layerIds.length; layer++) {
              let s = row.layers[layer];
              if (!s) s = row.layers[layer] = { layerId: t.layerIds[layer], pickupSumSq: 0, pickupPeak: 0, pickupSamples: 0, activeSamples: 0, awakeSamples: 0,
                directStrikes: 0, activeSamplesCount: 0, awakeSamplesCount: 0 };
              const l = this.current[t.pickupNodeIndices[layer * 2]], r = this.current[t.pickupNodeIndices[layer * 2 + 1]];
              s.pickupSumSq += l * l + r * r; s.pickupPeak = Math.max(s.pickupPeak, Math.abs(l), Math.abs(r)); s.pickupSamples++;
              const base = this.__evWindowBases.get(wi);
              s.sleepTransitions = (this.__evSleepById.get(t.layerIds[layer]) || 0) - (base?.sleep.get(t.layerIds[layer]) || 0);
              s.wakeTransitions = (this.__evWakeById.get(t.layerIds[layer]) || 0) - (base?.wake.get(t.layerIds[layer]) || 0);
              s.directStrikes = this.__evDirectByWindow.get(wi + ':' + t.layerIds[layer]) || 0;
            }
            if (this.telemetry.physicsSteps % 100 === 0) {
              if (t) {
                const activeByLayer = new Uint32Array(t.layerIds.length), awakeByLayer = new Uint32Array(t.layerIds.length);
                for (let node = 0; node < this.awake.length; node++) awakeByLayer[this.nodeLayer[node]] += this.awake[node];
                for (let i = 0; i < this.activeCount; i++) activeByLayer[this.nodeLayer[this.active[i]]]++;
                for (let layer = 0; layer < t.layerIds.length; layer++) {
                  const s = row.layers[layer], count = t.nodeOffsets[layer + 1] - t.nodeOffsets[layer];
                  s.awakeSamples += awakeByLayer[layer] / Math.max(1, count); s.activeSamples += activeByLayer[layer] / Math.max(1, count);
                  s.awakeSamplesCount++; s.activeSamplesCount++;
                }
              }
              let energy = 0; for (let n = 0; n < this.current.length; n++) { const v = this.current[n] - this.previous[n]; energy += this.current[n] ** 2 + v ** 2; }
              row.stateSamples++; row.stateEnergySum += energy;
            }
          }
        }`);
  const sleepAnchor = 'this.awake[node] = 0; this.energyQuiet[node] = 0;';
  if (source.split(sleepAnchor).length !== 3) throw new Error('Local audio sleep transition anchors missing or ambiguous.');
  source = source.replaceAll(sleepAnchor, `${sleepAnchor} { const id = this.topology.layerIds[this.nodeLayer[node]]; this.__evSleepById.set(id, (this.__evSleepById.get(id) || 0) + 1); }`);
  replaceOnce('        this.awake[node] = 1; this.energyQuiet[node] = 0;\n        this.active[this.activeCount++] = node; this.telemetry.wakes++;',
    '        this.awake[node] = 1; this.energyQuiet[node] = 0;\n        { const id = this.topology.layerIds[this.nodeLayer[node]]; this.__evWakeById.set(id, (this.__evWakeById.get(id) || 0) + 1); }\n        this.active[this.activeCount++] = node; this.telemetry.wakes++;');
  replaceOnce('    this.awake[node] = 1;\n    this.active[this.activeCount++] = node; this.telemetry.wakes++;',
    '    this.awake[node] = 1;\n    { const id = this.topology.layerIds[this.nodeLayer[node]]; this.__evWakeById.set(id, (this.__evWakeById.get(id) || 0) + 1); }\n    this.active[this.activeCount++] = node; this.telemetry.wakes++;');
  return source;
}

function makeProcessor(source, sampleRate, options) {
  let Processor;
  class Stub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(source, { AudioWorkletProcessor: Stub, sampleRate, Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array,
    Int8Array, Int16Array, Int32Array, Array, Math, Number, Object, Map, performance: globalThis.performance,
    registerProcessor(_name, constructor) { Processor = constructor; } }, { filename: 'surface-plate.local-x-replay.js' });
  if (!Processor) throw new Error('Surface worklet did not register a processor.');
  return new Processor(options);
}

export function renderLocalAudio({ source, initialTopology, events = [], frames = 14_400_000, sampleRate = 48_000,
  captureObserver = true, instrumented = true, quantumFrames = QUANTUM, onChunk = null } = {}) {
  if (!initialTopology || typeof initialTopology !== 'object') throw new TypeError('initialTopology must be compiled, including an empty topology.');
  if (!Number.isSafeInteger(frames) || frames <= 0) throw new RangeError('frames must be a positive safe integer.');
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be a positive integer.');
  if (!Number.isSafeInteger(quantumFrames) || quantumFrames <= 0) throw new RangeError('quantumFrames must be a positive integer.');
  if (!Array.isArray(events)) throw new TypeError('events must be an array.');
  const scheduled = events.map((event, index) => {
    if (!Number.isSafeInteger(event?.frame) || event.frame < 0 || event.frame >= frames) throw new RangeError(`events[${index}].frame outside render.`);
    if (typeof event?.message?.type !== 'string') throw new TypeError(`events[${index}].message requires a type.`);
    return { frame: event.frame, message: event.message, index };
  }).sort((a, b) => a.frame - b.frame || a.index - b.index);
  const processor = makeProcessor(instrumented ? instrumentLocalAudioSource(source) : source, sampleRate,
    { processorOptions: { evidenceTopology: initialTopology, evidenceSchedule: { events: instrumented ? scheduled : [],
      observe: instrumented && captureObserver, windows: AUDIO_WINDOWS } } });
  const left = new Float32Array(frames), right = new Float32Array(frames);
  let frame = 0, cursor = 0;
  while (frame < frames) {
    if (!instrumented) {
      if (frame === 0) processor.handleMessage({ type: 'topology', payload: initialTopology });
      while (cursor < scheduled.length && scheduled[cursor].frame === frame) processor.handleMessage(scheduled[cursor++].message);
    }
    let count = Math.min(quantumFrames, frames - frame);
    while (instrumented && cursor < scheduled.length && scheduled[cursor].frame <= frame) cursor++;
    if (scheduled[cursor]) count = Math.min(count, scheduled[cursor].frame - frame);
    if (!count) count = Math.min(quantumFrames, frames - frame);
    const l = new Float32Array(count), r = new Float32Array(count);
    processor.process([], [[l, r]]); left.set(l, frame); right.set(r, frame); frame += count; onChunk?.(frame, processor);
  }
  const telemetry = JSON.parse(JSON.stringify(processor.getDiagnostics()));
  const state = Object.fromEntries(Object.entries(processor)
    .filter(([key, value]) => !key.startsWith('__ev') && (ArrayBuffer.isView(value) || typeof value === 'number' || typeof value === 'boolean'))
    .map(([key, value]) => [key, ArrayBuffer.isView(value) ? value.slice() : value]));
  if (processor.__evCursor !== undefined && processor.__evCursor !== scheduled.length) throw new Error('Not all scheduled events were received.');
  if (processor.__evReceipts?.some(row => row.requestedFrame !== row.actualFrame)) throw new Error('Event dispatch was not sample-exact.');
  if (telemetry.droppedRoutes !== 0 || (processor.__evInvalidTopologies ?? 0) !== 0) throw new Error(`Render dropped a route or rejected a topology (${telemetry.droppedRoutes}/${processor.__evInvalidTopologies ?? 0}).`);
  const arraysFinite = arrays => Object.values(arrays).every(value => !ArrayBuffer.isView(value) || value.every(Number.isFinite));
  if (!finite(telemetry) || !arraysFinite(state) || left.some(value => !Number.isFinite(value)) || right.some(value => !Number.isFinite(value)))
    throw new Error('Render produced non-finite PCM or state.');
  const observer = processor.__evObserver?.rows ? JSON.parse(JSON.stringify(processor.__evObserver.rows)) : null;
  if (observer) for (const row of observer) {
    row.stateEnergyDefinition = 'sum(current displacement squared + one-step displacement difference squared), sampled at 60 Hz; descriptive state proxy, not physical energy.';
    row.stateEnergyMean = row.stateSamples ? row.stateEnergySum / row.stateSamples : null;
    row.rawPickupDefinition = 'Per-layer native pickup-node L/R state before layer summation, output soft limiter and bridge gain; sumsq values are not additive energies.';
    for (const layer of row.layers) {
      layer.awakeFraction = layer.awakeSamplesCount ? layer.awakeSamples / layer.awakeSamplesCount : null;
      layer.activeFraction = layer.activeSamplesCount ? layer.activeSamples / layer.activeSamplesCount : null;
    }
  }
  return { pcm: { left, right }, telemetry, state, events: Array.from(processor.__evReceipts || [], row => ({ ...row })), observer,
    sourceSha256: createHash('sha256').update(source).digest('hex'), frames, sampleRate };
}

export async function renderLocalAudioOffline({ page, source, initialTopology, events = [], frames, sampleRate = 48_000, gain = 0.7 }) {
  if (!page?.evaluate) throw new TypeError('A Playwright page is required.');
  if (!Number.isSafeInteger(frames) || frames < 1 || frames > sampleRate * 10) throw new RangeError('Offline parity render is limited to 10 seconds.');
  if (frames % QUANTUM) throw new RangeError(`OfflineAudioContext frame length must align to ${QUANTUM}-frame worklet quanta.`);
  return page.evaluate(async ({ source, topology, events, frames, sampleRate, gain }) => {
    const Types = { Float32Array, Float64Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array };
    const revive = value => {
      if (Array.isArray(value)) return value.map(revive);
      if (!value || typeof value !== 'object') return value;
      if (value.__typedArray) {
        const Type = Types[value.__typedArray]; if (!Type) throw new Error(`Unknown packed type ${value.__typedArray}`);
        const binary = atob(value.data), bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Type(bytes.buffer);
      }
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, revive(child)]));
    };
    topology = revive(topology); events = revive(events);
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const context = new OfflineAudioContext(2, frames, sampleRate); await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    const sorted = events.map((event, index) => ({ ...event, index })).sort((a, b) => a.frame - b.frame || a.index - b.index);
    const node = new AudioWorkletNode(context, 'surface-plate-processor', { numberOfInputs: 0, numberOfOutputs: 1,
      outputChannelCount: [2], processorOptions: { evidenceTopology: topology, evidenceSchedule: { endFrame: frames, events: sorted } } });
    const output = context.createGain(); output.gain.value = gain; node.connect(output); output.connect(context.destination);
    const done = new Promise((resolve, reject) => {
      node.port.onmessage = event => { if (event.data?.type === 'local-audio-done') resolve(event.data); };
      node.addEventListener('processorerror', () => reject(new Error('Surface AudioWorklet processorerror.')));
    });
    const buffer = await context.startRendering();
    const receipt = await done;
    if (receipt.renderedFrames !== frames || receipt.receipts.length !== events.length
      || receipt.receipts.some((row, i) => row.requestedFrame !== row.actualFrame || row.requestedFrame !== sorted[i].frame))
      throw new Error(`OfflineAudioContext event/frame receipt mismatch: rendered ${receipt.renderedFrames}/${frames}; events ${receipt.receipts.length}/${events.length}; receipts ${JSON.stringify(receipt.receipts)}.`);
    if (receipt.diagnostics.droppedRoutes !== 0 || receipt.receipts.some(row => row.accepted === false)) throw new Error('OfflineAudioContext dropped a strike route.');
    if (!receipt.stateFinite || receipt.invalidTopologies !== 0) throw new Error('OfflineAudioContext produced invalid state or topology.');
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
    if (left.some(value => !Number.isFinite(value)) || right.some(value => !Number.isFinite(value))) throw new Error('OfflineAudioContext produced non-finite PCM.');
    return { left: Array.from(left), right: Array.from(right), sampleRate, frames, receipts: receipt.receipts,
      diagnostics: receipt.diagnostics, stateFinite: receipt.stateFinite, invalidTopologies: receipt.invalidTopologies };
  }, { source: instrumentLocalAudioSource(source), topology: packTyped(initialTopology), events: packTyped(events), frames, sampleRate, gain });
}

export async function runFullBrowserRender({ seed, arm, schedulePath, workletSource, browser, baseUrl,
  wavPath = resolve(CACHE, 'pcm', `seed-${seed}-${arm}.wav`) }) {
  const path = resolve(schedulePath), compressed = await readFile(path), schedule = JSON.parse(gunzipSync(compressed));
  if (schedule.schema !== 'ant-local-x-audio-world-schedule-v1' || schedule.world?.sampleRate !== 48_000
    || schedule.world.frames !== 14_400_000 || !Array.isArray(schedule.events)) throw new Error(`Invalid 300 s schedule: ${path}`);
  const first = schedule.events[0];
  if (first?.frame !== 0 || first.message?.type !== 'topology' || first.message.payload?.layerIds?.length !== 0)
    throw new Error('Schedule must begin with the compiled empty topology at frame zero.');
  const endpoint = schedule.events.filter(event => event.frame === schedule.world.frames);
  if (schedule.events.some(event => !Number.isSafeInteger(event.frame) || event.frame < 0 || event.frame > schedule.world.frames))
    throw new Error('Schedule contains an event outside [0, endpoint].');
  const events = schedule.events.filter((event, index) => index !== 0 && event.frame < schedule.world.frames);
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await mkdir(resolve(CACHE, 'pcm'), { recursive: true });
  const downloadPromise = page.waitForEvent('download', { timeout: 1_200_000 });
  // Preserve an earlier render error when browser cleanup also rejects the download wait.
  void downloadPromise.catch(() => {});
  const receipt = await page.evaluate(async ({ scheduleUrl, moduleText, filename, seed, arm }) => {
    const response = await fetch(scheduleUrl);
    if (!response.ok) throw new Error(`schedule HTTP ${response.status}`);
    const body = new Uint8Array(await response.arrayBuffer());
    const packed = body[0] === 0x1f && body[1] === 0x8b;
    const text = packed
      ? await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
      : new TextDecoder().decode(body);
    const schedule = JSON.parse(text);
    const Types = { Float32Array, Float64Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array };
    const revive = value => {
      if (Array.isArray(value)) return value.map(revive);
      if (!value || typeof value !== 'object') return value;
      if (value.__typedArray) {
        const Type = Types[value.__typedArray]; if (!Type) throw new Error(`unsupported packed array ${value.__typedArray}`);
        const binary = atob(value.data), bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        if (bytes.byteLength !== value.length * Type.BYTES_PER_ELEMENT) throw new Error('packed array length mismatch');
        return new Type(bytes.buffer);
      }
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, revive(child)]));
    };
    const frames = schedule.world.frames, rate = schedule.world.sampleRate, initial = revive(schedule.events[0].message.payload);
    const events = revive(schedule.events.filter((event, index) => index !== 0 && event.frame < frames));
    const url = URL.createObjectURL(new Blob([moduleText], { type: 'text/javascript' }));
    const context = new OfflineAudioContext(2, frames, rate); await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(context, 'surface-plate-processor', { numberOfInputs: 0, numberOfOutputs: 1,
      outputChannelCount: [2], processorOptions: { evidenceTopology: initial,
        evidenceSchedule: { endFrame: frames, events, observe: true, compactReceipts: true,
          windows: [[50,60],[110,120],[170,180],[230,240],[290,300]] } } });
    const gain = context.createGain(); gain.gain.value = 0.7; node.connect(gain); gain.connect(context.destination);
    const done = new Promise((resolve, reject) => {
      node.port.onmessage = event => { if (event.data?.type === 'local-audio-done') resolve(event.data); };
      node.addEventListener('processorerror', () => reject(new Error('surface AudioWorklet processorerror')));
    });
    const buffer = await context.startRendering(), ack = await done;
    if (ack.renderedFrames !== frames || ack.receivedEvents !== events.length) throw new Error(`schedule receipt mismatch ${ack.receivedEvents}/${events.length}, ${ack.renderedFrames}/${frames}`);
    const diagnosticsFinite = value => typeof value === 'number' ? Number.isFinite(value)
      : !value || typeof value !== 'object' || Object.values(value).every(diagnosticsFinite);
    if (!ack.stateFinite || ack.invalidTopologies !== 0 || ack.diagnostics.droppedRoutes !== 0
      || ack.diagnostics.nonFinite !== 0 || !diagnosticsFinite(ack.diagnostics)
      || Object.values(ack.eventSummary).some(row => row.count !== row.exactFrameCount || row.maxLagFrames !== 0 || row.rejected))
      throw new Error('render failed finite-state, topology, route or exact-dispatch gate');
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
    let sumL = 0, sumR = 0, peak = 0, nonFinite = 0;
    const bytes = new Uint8Array(44 + frames * 8), view = new DataView(bytes.buffer);
    const ascii = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
    ascii(0, 'RIFF'); view.setUint32(4, 36 + frames * 8, true); ascii(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, 2, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 8, true); view.setUint16(32, 8, true); view.setUint16(34, 32, true);
    ascii(36, 'data'); view.setUint32(40, frames * 8, true);
    for (let i = 0, offset = 44; i < frames; i++, offset += 8) {
      const l = left[i], r = right[i];
      if (!Number.isFinite(l) || !Number.isFinite(r)) { nonFinite++; continue; }
      sumL += l * l; sumR += r * r; peak = Math.max(peak, Math.abs(l), Math.abs(r));
      view.setFloat32(offset, l, true); view.setFloat32(offset + 4, r, true);
    }
    if (nonFinite) throw new Error(`non-finite output samples: ${nonFinite}`);
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    const link = document.createElement('a'); link.href = blobUrl; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    node.disconnect(); gain.disconnect(); node.port.close();
    return { seed, arm, frames, sampleRate: rate, gain: 0.7, renderedFrames: ack.renderedFrames,
      scheduledEvents: events.length, receivedEvents: ack.receivedEvents, eventSummary: ack.eventSummary,
      invalidTopologies: ack.invalidTopologies, diagnostics: ack.diagnostics, stateFinite: ack.stateFinite,
      nonFiniteSamples: nonFinite, rmsLeft: Math.sqrt(sumL / frames), rmsRight: Math.sqrt(sumR / frames), peak,
      observer: ack.observer };
  }, { scheduleUrl: new URL(relativePath(path), baseUrl).href, moduleText: instrumentLocalAudioSource(workletSource),
    filename: wavPath.split(/[\\/]/).at(-1), seed, arm });
  const download = await downloadPromise; await download.saveAs(wavPath); await page.close();
  const wav = await readFile(wavPath);
  return { ...receipt, scheduleSha256: SHA(compressed), renderedEventSha256: SHA(Buffer.from(JSON.stringify(events))),
    endpointEvents: endpoint.length, endpointEventSha256: SHA(Buffer.from(JSON.stringify(endpoint))),
    workletSourceSha256: SHA(workletSource), wavSha256: SHA(wav), wavBytes: wav.byteLength,
    wavPath: wavPath.slice(ROOT.length + 1).replaceAll('\\', '/') };
}

function relativePath(path) { return path.slice(ROOT.length).replaceAll('\\', '/').replace(/^\//, ''); }

export async function runAudioRenderCli(args = process.argv.slice(2)) {
  const parityOnly = args.includes('--parity-only');
  const seeds = ['20261005', '20261006', '20261007'], arms = ['control', 'replacement'];
  const schedulePath = (seed, arm) => resolve(ANALYSIS, `seed-${seed}-${arm}-schedule.json.gz`);
  const workletSource = await readFile(resolve(ROOT, 'static/worklets/surface-plate.worklet.js'), 'utf8');
  await mkdir(resolve(CACHE, 'pcm'), { recursive: true });
  const server = await createServer({ root: ROOT, configFile: false, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const address = server.httpServer.address(), baseUrl = `http://127.0.0.1:${address.port}/`;
  let browser;
  try {
    browser = await chromium.launch();
    if (parityOnly) {
      const { frames, sampleRate, initialTopology, events } = createBrowserParityFixture();
      const node = renderLocalAudio({ source: workletSource, initialTopology, events, frames, sampleRate,
        captureObserver: false, instrumented: false });
      const page = await browser.newPage(); await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      const chrome = await renderLocalAudioOffline({ page, source: workletSource, initialTopology, events, frames, sampleRate, gain: 0.7 });
      await page.close();
      let maxAbsDiff = 0, exact = true;
      const nodeBytes = Buffer.allocUnsafe(frames * 8), browserBytes = Buffer.allocUnsafe(frames * 8);
      for (let i = 0, offset = 0; i < frames; i++, offset += 8) for (const [a, b, position] of [
        [Math.fround(node.pcm.left[i] * 0.7), chrome.left[i], offset], [Math.fround(node.pcm.right[i] * 0.7), chrome.right[i], offset + 4]]) {
        maxAbsDiff = Math.max(maxAbsDiff, Math.abs(a - b)); if (a !== b) exact = false;
        nodeBytes.writeFloatLE(a, position); browserBytes.writeFloatLE(b, position);
      }
      const maxAllowedDiff = 1e-8;
      const result = { status: maxAbsDiff <= maxAllowedDiff ? 'PASS' : 'FAIL', browserVersion: browser.version(),
        fixture: { description: 'compiled overlapping Plates with a native Nodule; frame-0 strike, topology reinstall at frame 16 during pending contact force, overlapping second Plate plus frame-tied strike at frame 800',
          frames, sampleRate, events: events.map(event => ({ frame: event.frame, type: event.message.type,
            layerId: event.message.payload?.layerId ?? null, topologyLayers: event.message.type === 'topology' ? event.message.payload.layerIds : undefined })) },
        gain: 0.7, workletSourceSha256: SHA(workletSource), nodePcmSha256: SHA(nodeBytes), browserPcmSha256: SHA(browserBytes),
        exactFloatEquality: exact, maxAbsDiff, maxAllowedDiff,
        parityScope: 'Whole interleaved Float32 PCM after Float32-rounded 0.7 gain; numerical parity permits at most 1e-8 absolute difference.',
        browserReceipts: chrome.receipts, allEventsReceived: chrome.receipts.length === events.length,
        allEventsExactFrame: chrome.receipts.every(row => row.requestedFrame === row.actualFrame),
        allStrikesAccepted: chrome.receipts.filter(row => row.type === 'strike').every(row => row.accepted),
        noDroppedRoutes: chrome.diagnostics.droppedRoutes === 0, noInvalidTopologies: chrome.invalidTopologies === 0,
        finiteState: chrome.stateFinite, finitePcm: [...chrome.left, ...chrome.right].every(Number.isFinite),
        diagnostics: chrome.diagnostics };
      if (!result.allEventsReceived || !result.allEventsExactFrame || !result.allStrikesAccepted || !result.noDroppedRoutes
        || !result.noInvalidTopologies || !result.finiteState || !result.finitePcm || result.status !== 'PASS')
        throw new Error(`Browser parity failed: ${JSON.stringify({ ...result, browserReceipts: result.browserReceipts.length })}`);
      const validationDir = resolve(ANALYSIS, 'validation'); await mkdir(validationDir, { recursive: true });
      const validationPath = resolve(validationDir, 'browser-parity.json');
      await writeFile(validationPath, JSON.stringify(result, null, 2) + '\n');
      console.log(JSON.stringify({ ...result, validationPath: relativePath(validationPath) }));
      return result;
    }
    const receipts = [];
    for (const seed of seeds) for (const arm of arms) {
      const result = await runFullBrowserRender({ seed, arm, schedulePath: schedulePath(seed, arm), workletSource, browser, baseUrl });
      receipts.push(result); console.log(JSON.stringify({ seed, arm, status: 'RENDERED', wavSha256: result.wavSha256 }));
    }
    const receiptPath = resolve(ANALYSIS, 'audio-render-receipts.json');
    await writeFile(receiptPath, JSON.stringify({ schema: 'ant-local-x-audio-render-receipts-v1', gain: 0.7, receipts }, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'PASS', receiptPath: relativePath(receiptPath), worlds: receipts.length }));
    return receipts;
  } finally {
    await browser?.close(); await server.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runAudioRenderCli();
