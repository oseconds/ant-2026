import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { gzipSync, gunzipSync } from 'node:zlib';
import { decodeStereoFloatWav } from './stratigraphy-audio-overview.js';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntEnvironmentAudioBridge, ANT_BASE_SUBSTRATE_DAMPING, ANT_BASE_SUBSTRATE_OUTPUT_RATIO } from '../src/lib/audio/AntEnvironmentAudioBridge.js';

const root = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/audio');
const out = resolve(root, 'mix-audibility');
const baselineCommit = 'c89a85bf70842da597fef97396810de263b2262c';
const prior = JSON.parse(await readFile(resolve(root, 'audio-ab-report.json'), 'utf8'));
const inputBytes = await readFile(resolve(root, prior.sourceRun.eventStreamFile));
assert.equal(sha(inputBytes), prior.sourceRun.gzipSha256, 'frozen seed input hash');
const frozen = JSON.parse(gunzipSync(inputBytes));
const priorSchedule = prior.sourceEvents.schedules.postbirthBorn;
const oldABaselineBytes = await readFile(resolve(root, 'postbirth-born-only-10s-48khz-f32.wav'));
const oldSubstrateBytes = await readFile(resolve(root, 'postbirth-substrate-only-10s-48khz-f32.wav'));
assert.equal(sha(oldABaselineBytes), prior.outputs['postbirth-born-only-10s-48khz-f32.wav'].sha256);
assert.equal(sha(oldSubstrateBytes), prior.outputs['postbirth-substrate-only-10s-48khz-f32.wav'].sha256);
const oldABaseline = decodeStereoFloatWav(oldABaselineBytes);
const substrate = decodeStereoFloatWav(oldSubstrateBytes);
assert.equal(substrate.sampleCount, 480000);

const aSource = await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');
const bSource = candidatePlateUnscaled(aSource);
assert.equal(sha(aSource), prior.worklets.bornSurfaceSha256, 'A source must match the frozen captured baseline');
assert.equal(sha(bSource), '14c7461f1412f0d6897a6683d46e582dbb80711f2ba74e8ea53e026895eeea5e',
  'B source must match the frozen readout-only candidate transform');
assert.ok(bSource.includes('const mixL = outL * PLATE_PICKUP_MIX + sphereOutL * MIX'));
assert.ok(bSource.includes('this.outputL = mixL / (1 + Math.abs(mixL)); this.outputR = mixR / (1 + Math.abs(mixR));'));

const fresh = await captureFreshRun();
let browser;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
try {
  const { recording, firstBirthEvent, audioBridge, topology } = fresh;
  const generatedInput = gzipSync(Buffer.from(JSON.stringify(recording)));
  assert.equal(sha(generatedInput), prior.sourceRun.gzipSha256, 'fresh run must regenerate the frozen input byte-for-byte');
  assert.deepEqual(recording, frozen, 'fresh run must match the frozen event stream');
  assert.equal(sha(JSON.stringify(firstBirthEvent)), prior.sourceRun.firstPlateDescriptorSha256);
  assert.equal(firstBirthEvent.id, 'trail-plate-1');
  assert.equal(firstBirthEvent.bornAtSimulationTimeMs / 1000, 103.01666666667376);
  assert.equal(topology.layerIds.length, 1);
  assert.equal(topology.layerIds[0], firstBirthEvent.id);

  const startMs = firstBirthEvent.bornAtSimulationTimeMs;
  const endMs = startMs + 10000;
  const events = recording.bornStrikes.filter(row => row.simulationTimeMs >= startMs && row.simulationTimeMs < endMs)
    .map(row => ({ frame: toFrame(row.simulationTimeMs, startMs), payload: row.payload }))
    .sort((a, b) => a.frame - b.frame);
  assert.equal(events.length, 63);
  assert.deepEqual(events, priorSchedule, 'freshly accepted P1 schedule must match the frozen schedule exactly');
  assert.ok(events.every(event => event.payload.plateId === firstBirthEvent.id));

  const surfaceGain = audioBridge.surface.worklet.gainNode.gain.value;
  await server.listen();
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, { waitUntil: 'domcontentloaded' });
  const captured = await page.evaluate(async input => {
    const rate = 48000, frames = rate * 10;
    const context = new OfflineAudioContext(4, frames, rate);
    const merger = context.createChannelMerger(4);
    merger.connect(context.destination);
    const eventSchedule = { endFrame: frames, events: input.events.map(event => ({ frame: event.frame,
      message: { type: 'strike', payload: event.payload } })) };
    const monitors = [];
    const makeTrack = async (source, processorName, firstChannel, label) => {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      await context.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(context, processorName, { numberOfInputs: 0, numberOfOutputs: 1,
        outputChannelCount: [2], processorOptions: { evidenceTopology: { ...input.topology, maxLayers: 256 },
          evidenceSchedule: eventSchedule } });
      const gain = context.createGain(); gain.gain.value = input.gain;
      const splitter = context.createChannelSplitter(2);
      node.connect(gain); gain.connect(splitter);
      splitter.connect(merger, 0, firstChannel); splitter.connect(merger, 1, firstChannel + 1);
      let resolveReady, resolveDone, rejectRun;
      const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} scheduler ready timeout`)), 10000);
        resolveReady = value => { clearTimeout(timer); resolve(value); };
        rejectRun = error => { clearTimeout(timer); reject(error); };
      });
      const done = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} PCM render timeout`)), 90000);
        resolveDone = value => { clearTimeout(timer); resolve(value); };
        const fail = error => { clearTimeout(timer); reject(error); };
        node.addEventListener('processorerror', () => fail(new Error(`${label} AudioWorklet processor error`)), { once: true });
      });
      node.port.onmessage = event => {
        if (event.data?.type === 'evidence-ready') resolveReady(event.data);
        if (event.data?.type === 'evidence-done') resolveDone(event.data);
      };
      monitors.push({ ready, done });
      return node;
    };
    const a = await makeTrack(input.aSource, 'surface-plate-a', 0, 'A baseline');
    const b = await makeTrack(input.bSource, 'surface-plate-processor', 2, 'B candidate');
    const rendering = context.startRendering();
    const [buffer, ready, reports] = await Promise.all([rendering,
      Promise.all(monitors.map(monitor => monitor.ready)), Promise.all(monitors.map(monitor => monitor.done))]);
    if (ready.some(row => row.frame !== 0 || row.endFrame !== frames || row.scheduled !== input.events.length)) {
      throw new Error('A/B scheduler handshakes do not match the shared frozen schedule.');
    }
    if (reports.some(row => row.renderedFrames !== frames || row.scheduled !== input.events.length
      || row.strikes !== input.events.length || row.diagnostics?.strikes !== input.events.length)) {
      throw new Error(`A/B accepted-strike counts differ: ${JSON.stringify(reports.map(row => ({ scheduled: row.scheduled, strikes: row.strikes, diagnostics: row.diagnostics?.strikes, renderedFrames: row.renderedFrames })))}`);
    }
    const makeWavBase64 = (left, right) => {
      const bytes = new Uint8Array(44 + frames * 8), view = new DataView(bytes.buffer);
      bytes.set([82, 73, 70, 70]); view.setUint32(4, bytes.length - 8, true);
      bytes.set([87, 65, 86, 69, 102, 109, 116, 32], 8); view.setUint32(16, 16, true);
      view.setUint16(20, 3, true); view.setUint16(22, 2, true); view.setUint32(24, rate, true);
      view.setUint32(28, rate * 8, true); view.setUint16(32, 8, true); view.setUint16(34, 32, true);
      bytes.set([100, 97, 116, 97], 36); view.setUint32(40, frames * 8, true);
      for (let i = 0, offset = 44; i < frames; i++, offset += 8) {
        view.setFloat32(offset, left[i], true); view.setFloat32(offset + 4, right[i], true);
      }
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    };
    const aWav = makeWavBase64(buffer.getChannelData(0), buffer.getChannelData(1));
    const bWav = makeWavBase64(buffer.getChannelData(2), buffer.getChannelData(3));
    for (const node of [a, b]) { node.disconnect(); node.port.close(); }
    return { aWav, bWav, ready, reports };
  }, { aSource: instrumentSurface(aSource, 'surface-plate-a'), bSource: instrumentSurface(bSource, 'surface-plate-processor'),
    topology, events, gain: surfaceGain });

  const aBytes = Buffer.from(captured.aWav, 'base64'), bBytes = Buffer.from(captured.bWav, 'base64');
  const a = decodeStereoFloatWav(aBytes), b = decodeStereoFloatWav(bBytes);
  assert.equal(a.sampleRate, 48000); assert.equal(b.sampleRate, 48000);
  assert.equal(a.sampleCount, 480000); assert.equal(b.sampleCount, 480000);
  const { maxOutputAbs: _aOutput, clipped: _aClipped, mix: _aMix,
    platePickupMix: _aPlateMix, sphereModeMix: _aSphereMix, ...aPhysicsDiagnostics } = captured.reports[0].diagnostics;
  const { maxOutputAbs: _bOutput, clipped: _bClipped, mix: _bMix,
    platePickupMix: _bPlateMix, sphereModeMix: _bSphereMix, ...bPhysicsDiagnostics } = captured.reports[1].diagnostics;
  assert.deepEqual(aPhysicsDiagnostics, bPhysicsDiagnostics, 'the readout split must leave Plate/Sphere state diagnostics identical');
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'A-baseline-born-only-10s-48khz-f32.wav'), aBytes);
  await writeFile(resolve(out, 'B-plate-unscaled-born-only-10s-48khz-f32.wav'), bBytes);
  const aMetrics = measure(a.channels.left, a.channels.right), bMetrics = measure(b.channels.left, b.channels.right);
  const substrateMetrics = prior.outputs['postbirth-substrate-only-10s-48khz-f32.wav'];
  const oldAMatches = exactPcm(aBytes, oldABaselineBytes);
  const substrateAfter = await readFile(resolve(root, 'postbirth-substrate-only-10s-48khz-f32.wav'));
  const oldAAfter = await readFile(resolve(root, 'postbirth-born-only-10s-48khz-f32.wav'));
  assert.equal(sha(substrateAfter), sha(oldSubstrateBytes), 'unchanged substrate stem must remain byte-identical');
  assert.equal(sha(oldAAfter), sha(oldABaselineBytes), 'existing A PCM must remain byte-identical');

  const eventAlignedRms = [100, 250, 500].map(durationMs => {
    const length = durationMs * 48;
    const summarize = pcm => {
      const values = events.filter(event => event.frame + length <= pcm.channels.left.length)
        .map(event => ({ frame: event.frame, rms: pooledRms(pcm.channels.left, pcm.channels.right, event.frame, length) }));
      const sorted = values.map(row => row.rms).sort((x, y) => x - y);
      return { eligibleStrikes: values.length, excludedIncompleteTailStrikes: events.length - values.length,
        meanRms: mean(values.map(row => row.rms)), medianRms: median(sorted), perStrike: values };
    };
    const aRows = summarize(a), bRows = summarize(b);
    return { durationMs, samplesPerChannel: length, interval: '[strike frame, strike frame + duration)',
      a: aRows, b: bRows, medianChangeDb: dbRatio(bRows.medianRms, aRows.medianRms) };
  });
  const report = {
    status: 'frozen-input-born-Plate-readout-A-B',
    decisionScope: 'One readout-mix pass only; no Plate/material/birth/routing/substrate/simulation/limiter/master-gain changes.',
    sourceRun: { seed: recording.seed, inputFile: prior.sourceRun.eventStreamFile, inputGzipSha256: sha(generatedInput),
      inputDeepEqualToFrozen: true, firstPlateId: firstBirthEvent.id, firstPlateBirthSeconds: startMs / 1000,
      firstPlateDescriptorSha256: sha(JSON.stringify(firstBirthEvent)), acceptedP1Strikes: events.length,
      firstPlateTopologyLayerIds: topology.layerIds },
    comparison: { A: { formula: '(Plate pickup + Sphere modes) * 1/sqrt(12)', baselineCommit,
        workletSha256: sha(aSource), pcm: 'A-baseline-born-only-10s-48khz-f32.wav', pcmSha256: sha(aBytes), ...aMetrics,
        exactPcmMatchToPriorFrozenA: oldAMatches, priorFrozenAPcmSha256: sha(oldABaselineBytes) },
      B: { formula: 'Plate pickup * 1 + Sphere modes * 1/sqrt(12), then existing soft limiter',
        workletSha256: sha(bSource), pcm: 'B-plate-unscaled-born-only-10s-48khz-f32.wav', pcmSha256: sha(bBytes), ...bMetrics },
      substrate: { stem: '../postbirth-substrate-only-10s-48khz-f32.wav', pcmSha256: sha(oldSubstrateBytes),
        exactOriginalStemPreserved: sha(substrateAfter) === sha(oldSubstrateBytes), ...substrateMetrics },
      pooledRmsChangeDbAtoB: dbRatio(bMetrics.rms, aMetrics.rms),
      pooledRmsBToSubstrateDb: dbRatio(bMetrics.rms, substrateMetrics.rms),
      pooledRmsSubstrateToBDb: dbRatio(substrateMetrics.rms, bMetrics.rms) },
    channelComparison: { leftRmsChangeDb: dbRatio(bMetrics.left.rms, aMetrics.left.rms),
      rightRmsChangeDb: dbRatio(bMetrics.right.rms, aMetrics.right.rms) },
    eventAlignedRms, scheduleEquality: { exact: true, scheduleSha256: sha(JSON.stringify(events)),
      eventCountA: captured.reports[0].strikes, eventCountB: captured.reports[1].strikes,
      requestedFrames: events.map(event => event.frame), note: 'Both processors received the same frozen topology and one identical serialized 63-event schedule.' },
    pcmChecks: { outputClippingThreshold: '|sample| >= 1', internalSimulationDiagnosticsEqual: true,
      comparedDiagnosticFields: Object.keys(aPhysicsDiagnostics), a: { clippingSamples: aMetrics.clippingSamples,
        nonFiniteSamples: aMetrics.nonFiniteSamples }, b: { clippingSamples: bMetrics.clippingSamples,
        nonFiniteSamples: bMetrics.nonFiniteSamples },
      preLimiterProcessor: { A: captured.reports[0].diagnostics, B: captured.reports[1].diagnostics },
      processorErrors: 0 },
    settings: { unchanged: true, surfaceGain: audioBridge.surface.worklet.gainNode.gain.value,
      substrateOutputRatio: ANT_BASE_SUBSTRATE_OUTPUT_RATIO, substrateDamping: ANT_BASE_SUBSTRATE_DAMPING,
      contactPulseMs: 3, recoveryMs: 75, plateDampingMultiplier: 50,
      existingSoftLimiterVerifiedUnchanged: true },
    render: { chrome: browser.version(), sampleRate: 48000, samplesPerChannel: 480000,
      audioStartSimulationSeconds: startMs / 1000, audioEndSimulationSeconds: endMs / 1000,
      clockMapping: 'requestedFrame = round((simulationTimeMs - firstPlateBirthMs) * 48)',
      schedulerReady: captured.ready, workletReports: captured.reports },
    visuals: await renderVisuals({ browser, page, events: recording.contacts
      .filter(event => event.simulationTimeMs >= startMs && event.simulationTimeMs < endMs)
      .map((event, index) => ({ type: 'FOOT_CONTACT', simulationTimeMs: event.simulationTimeMs - startMs,
        payload: event.payload, groupIndex: index }))
      .concat([{ type: 'PLATE_BIRTH', simulationTimeMs: 0, payload: { id: firstBirthEvent.id }, label: 'P1' }]),
      startMs, tracks: [
        { label: 'A · baseline frozen P1', bytes: aBytes },
        { label: 'B · Plate pickup unscaled', bytes: bBytes },
        { label: 'unchanged substrate stem', bytes: oldSubstrateBytes }
      ] })
  };
  await writeFile(resolve(out, 'mix-ab-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ out, A: { peakL: aMetrics.left.peak, peakR: aMetrics.right.peak, peakMax: aMetrics.peak, rms: aMetrics.rms },
    B: { peakL: bMetrics.left.peak, peakR: bMetrics.right.peak, peakMax: bMetrics.peak, rms: bMetrics.rms },
    rmsChangeDbAtoB: report.comparison.pooledRmsChangeDbAtoB,
    rmsBToSubstrateDb: report.comparison.pooledRmsBToSubstrateDb, exactInput: report.scheduleEquality.exact,
    exactPriorA: oldAMatches, visuals: report.visuals.images.map(image => image.file) }, null, 2));
} finally {
  await fresh.controller.destroy();
  await browser?.close();
  await server.close();
}

async function captureFreshRun() {
  const seed = 20261005;
  let rngState = seed >>> 0, rngCalls = 0, currentMs = 0, firstBirthEvent = null;
  const contacts = [], legacyStrikes = [], bornStrikes = [];
  const audioEngine = { context: { currentTime: 0 }, async createWorklet(name, _url, _config, _onMessage, _onError, output = {}) {
    const gain = { value: output.gain ?? 1, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; },
      linearRampToValueAtTime(value) { this.value = value; } };
    return { node: { port: { onmessage: null, postMessage(message) {
      if (name === 'surface-plate-processor' && message?.type === 'strike') bornStrikes.push({ simulationTimeMs: currentMs, payload: message.payload });
    }, close() {} }, addEventListener() {}, removeEventListener() {} }, gainNode: { gain }, disconnect() {} };
  } };
  const audioBridge = new AntEnvironmentAudioBridge({ audioEngine });
  const controller = new AntController({ materialLocomotionResistance: false, random: () => {
    rngCalls++; rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 0x100000000;
  }, audioBridge, state: { audioExperiment: { mode: 'bornSurface', baseSubstrate: true } } });
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'plate-birth' && !firstBirthEvent) firstBirthEvent = payload;
  });
  try {
    await controller.init(); controller.setAudioVolume(0.35); await controller.setAudioEnabled(true);
    if (!audioBridge.legacy.plate || !audioBridge.surface.worklet) throw new Error('Audio bridges did not initialize.');
    const originalHandle = audioBridge.handleFootContact.bind(audioBridge);
    audioBridge.handleFootContact = (event, context) => {
      currentMs = event.simulationTimeMs;
      contacts.push({ simulationTimeMs: currentMs, payload: event, responses: context.responses });
      return originalHandle(event, context);
    };
    audioBridge.legacy.plate.strike = async payload => { legacyStrikes.push({ simulationTimeMs: currentMs, payload }); return true; };
    const step = 1 / 60;
    while (controller.simulationTimeMs < 120000 && (!firstBirthEvent
      || controller.simulationTimeMs < firstBirthEvent.bornAtSimulationTimeMs + 10000)) {
      controller.tick(step);
    }
    if (!firstBirthEvent || controller.simulationTimeMs < firstBirthEvent.bornAtSimulationTimeMs + 9999) {
      throw new Error('Fresh natural run missed first birth plus ten seconds.');
    }
    return { controller, audioBridge, firstBirthEvent, topology: structuredClone(audioBridge.surface.topology),
      recording: { seed, simulationDurationSeconds: controller.simulationTimeMs / 1000, rngCalls,
        finalRngState: rngState, contacts, legacyStrikes, bornStrikes } };
  } catch (error) { unsubscribe(); await controller.destroy(); throw error; }
  finally { unsubscribe(); }
}

function instrumentSurface(source, processorName) {
  source = source.replace(/\r\n/g, '\n');
  source = source.replace("registerProcessor('surface-plate-processor', SurfacePlateProcessor);",
    `registerProcessor('${processorName}', SurfacePlateProcessor);`);
  source = source.replace('  constructor() {', '  constructor(options) {');
  source = source.replace('    super();', '    super(); const schedule=options.processorOptions.evidenceSchedule; this.__evFrame=0; this.__evEnd=schedule.endFrame; this.__evEvents=schedule.events; this.__evCursor=0; this.__evDone=false; this.__evReady=false;');
  source = source.replace('    this.port.onmessage = (event) => this.handleMessage(event.data);', "    this.port.onmessage = (event) => this.handleMessage(event.data);\n    this.handleMessage({type:'topology',payload:options.processorOptions.evidenceTopology});");
  source = source.replace('    if (this.destroyed) return false;', "    if (this.destroyed) return false;\n    if (!this.__evReady) { this.__evReady=true; this.port.postMessage({type:'evidence-ready',frame:this.__evFrame,endFrame:this.__evEnd,scheduled:this.__evEvents.length}); }");
  source = source.replace('    if (!this.topology) return true;', "    if (!this.topology) { this.__evFrame += left.length; if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',strikes:this.telemetry.strikes,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,diagnostics:this.getDiagnostics?.()||null}); } return true; }");
  source = source.replace('    for (let frame = 0; frame < left.length; frame++) {', "    for (let frame = 0; frame < left.length; frame++) {\n      while(this.__evCursor<this.__evEvents.length && this.__evEvents[this.__evCursor].frame<=this.__evFrame)this.handleMessage(this.__evEvents[this.__evCursor++].message); this.__evFrame++;");
  source = source.replace('    return true;\n  }\n\n  advancePhysics()', "    if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',strikes:this.telemetry.strikes,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,diagnostics:this.getDiagnostics?.()||null}); }\n    return true;\n  }\n\n  advancePhysics()");
  if (!source.includes("type:'evidence-ready',frame:") || !source.includes('payload:options.processorOptions.evidenceTopology')
    || !source.includes("type:'evidence-done'")) throw new Error(`Could not instrument ${processorName} for the repaired PCM scheduler.`);
  return source;
}

function candidatePlateUnscaled(source) {
  const replacements = [
    ['const MIX = 1 / Math.sqrt(12);', 'const MIX = 1 / Math.sqrt(12);\nconst PLATE_PICKUP_MIX = 1;'],
    ['let energyBefore = 0, energyAfter = 0, outL = 0, outR = 0;',
      'let energyBefore = 0, energyAfter = 0, outL = 0, outR = 0, sphereOutL = 0, sphereOutR = 0;'],
    ['const i = n * 12 + m; outL += this.sphereCurrent[i] * this.spherePickupL[i];\n      outR += this.sphereCurrent[i] * this.spherePickupR[i];',
      'const i = n * 12 + m; sphereOutL += this.sphereCurrent[i] * this.spherePickupL[i];\n      sphereOutR += this.sphereCurrent[i] * this.spherePickupR[i];'],
    ['const mixL = outL * MIX, mixR = outR * MIX;',
      'const mixL = outL * PLATE_PICKUP_MIX + sphereOutL * MIX;\n    const mixR = outR * PLATE_PICKUP_MIX + sphereOutR * MIX;'],
    ['noduleCount: this.noduleIds?.length || 0, activeSphereModes, integratedSphereModes, mix: MIX,',
      'noduleCount: this.noduleIds?.length || 0, activeSphereModes, integratedSphereModes,\n      mix: MIX, platePickupMix: PLATE_PICKUP_MIX, sphereModeMix: MIX,']
  ];
  for (const [before, after] of replacements) {
    if (!source.includes(before)) throw new Error(`Candidate B transform anchor missing: ${before.slice(0, 48)}`);
    source = source.replace(before, after);
  }
  return source;
}

async function renderVisuals({ browser, page, events, startMs, tracks }) {
  const render = await page.evaluate(async inputs => {
    const { decodeStereoFloatWav, buildStratigraphyAudioOverview, renderStratigraphyAudioOverview,
      renderStratigraphyAudioZooms } = await import('/scripts/stratigraphy-audio-overview.js');
    const { buildStratigraphyAudioSnapshot, renderStratigraphyAudioComparison } = await import('/scripts/audio-snapshot-renderer.js');
    const dataUrl = canvas => canvas.toDataURL('image/png').split(',')[1];
    const result = { images: [], renderer: { preset: 'ant-surface-stratigraphy-v1', overviewPreset: 'ant-stratigraphy-audio-overview-v1',
      waveformAmplitude: [-1, 1], fftSize: 1024, window: 'Hann', hopSize: 256, frequencyHz: [0, 8000],
      dbfs: [-100, 0], grayscaleGamma: 1, normalization: 'none; fixed-scale' } };
    const snapshots = [];
    for (const track of inputs.tracks) {
      const raw = atob(track.base64), bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
      const pcm = decodeStereoFloatWav(bytes);
      const overview = buildStratigraphyAudioOverview({ channels: pcm.channels, sampleRate: pcm.sampleRate,
        simulationDurationSeconds: 10, clockAnchors: [{ simulationTimeMs: 0, audioSampleIndex: 0 },
          { simulationTimeMs: 10000, audioSampleIndex: pcm.sampleCount }], events: inputs.events });
      const snapshot = buildStratigraphyAudioSnapshot(pcm.channels, { sampleRate: pcm.sampleRate, sourceDurationSeconds: 10 });
      snapshot.label = track.label; snapshots.push({ label: track.label, snapshot });
      for (const [suffix, canvas] of [['overview', document.createElement('canvas')], ['detail', document.createElement('canvas')]]) {
        if (suffix === 'overview') renderStratigraphyAudioOverview(canvas, overview);
        else renderStratigraphyAudioZooms(canvas, overview, [0]);
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, 34);
        ctx.fillStyle = '#111'; ctx.font = '15px sans-serif'; ctx.fillText(`${track.label} · P1 birth ${inputs.startMs.toFixed(3)} ms · audio 0–10 s`, 14, 23);
        result.images.push({ file: `${track.key}-${suffix}.png`, png: dataUrl(canvas) });
      }
    }
    const comparison = document.createElement('canvas'); renderStratigraphyAudioComparison(comparison, snapshots);
    result.images.push({ file: 'A-B-substrate-fixed-waveform-comparison.png', png: dataUrl(comparison) });
    return result;
  }, { tracks: tracks.map(track => ({ key: track.label.startsWith('A') ? 'A-baseline'
      : track.label.startsWith('B') ? 'B-candidate' : 'unchanged-substrate', label: track.label,
    base64: Buffer.from(track.bytes).toString('base64') })), events, startMs });
  const images = [];
  for (const image of render.images) {
    const bytes = Buffer.from(image.png, 'base64'); await writeFile(resolve(out, image.file), bytes);
    images.push({ file: image.file, sha256: sha(bytes), bytes: bytes.length });
  }
  return { sourceEvents: { footContactGroups: events.filter(event => event.type === 'FOOT_CONTACT').length,
      plateBirthMarkers: events.filter(event => event.type === 'PLATE_BIRTH').length,
      bornStrikeFrames: priorSchedule.map(event => event.frame) },
    clockMapping: { simulationAnchorsMs: [startMs, startMs + 10000], audioSampleAnchors: [0, 480000],
      requestedBornStrikeFrame: 'round((simulationTimeMs - firstPlateBirthMs) * 48)' },
    renderer: render.renderer, images };
}

function measure(left, right) {
  let peak = 0, sum = 0, nonFiniteSamples = 0, clippingSamples = 0;
  for (const [i, value] of left.entries()) for (const sample of [value, right[i]]) {
    if (!Number.isFinite(sample)) { nonFiniteSamples++; continue; }
    peak = Math.max(peak, Math.abs(sample)); sum += sample * sample;
    if (Math.abs(sample) >= 1) clippingSamples++;
  }
  const channel = values => {
    let channelPeak = 0, squareSum = 0;
    for (const value of values) { channelPeak = Math.max(channelPeak, Math.abs(value)); squareSum += value * value; }
    const rms = Math.sqrt(squareSum / values.length);
    return { peak: channelPeak, peakDbfs: dbfs(channelPeak), rms, rmsDbfs: dbfs(rms) };
  };
  const rms = Math.sqrt(sum / (left.length * 2));
  return { sampleRate: 48000, samplesPerChannel: left.length, durationSeconds: left.length / 48000,
    peak, peakDbfs: dbfs(peak), rms, rmsDbfs: dbfs(rms), left: channel(left), right: channel(right),
    nonFiniteSamples, clippingSamples };
}
function pooledRms(left, right, start, length) {
  let sum = 0;
  for (let i = start; i < start + length; i++) sum += left[i] * left[i] + right[i] * right[i];
  return Math.sqrt(sum / (length * 2));
}
function exactPcm(a, b) { return a.length === b.length && a.equals(b); }
function toFrame(timeMs, startMs) { return Math.max(0, Math.min(480000 - 1, Math.round((timeMs - startMs) * 48))); }
function dbfs(value) { return 20 * Math.log10(Math.max(1e-30, value)); }
function dbRatio(a, b) { return 20 * Math.log10(a / b); }
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(sorted) { return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2; }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
