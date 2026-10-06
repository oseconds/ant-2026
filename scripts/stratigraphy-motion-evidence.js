import assert from 'node:assert/strict';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { STRATIGRAPHY_AUDIO_PRESET } from './audio-snapshot-renderer.js';

// Read-only evidence harness. It uses normal AntController ticks for catch-up and
// restores the application's real RAF update before each synchronized capture.
const seed = 20261005;
const step = 1 / 60;
const clipSeconds = 20;
const detailSeconds = STRATIGRAPHY_AUDIO_PRESET.durationSeconds;
const volume = 0.35;
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = resolve('test-results', `stratigraphy-motion-${runId}`);
await mkdir(outDir, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
let browser;

try {
  await server.listen();
  const port = server.httpServer.address()?.port;
  assert.ok(port, 'Vite server must bind a local port');
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });

  async function openDefault() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__stratProbe = { contexts: [], worklets: [], processorErrors: [] };
      const NativeAudioContext = window.AudioContext;
      window.AudioContext = class extends NativeAudioContext {
        constructor(...args) { super(...args); window.__stratProbe.contexts.push(this); }
      };
      const NativeWorklet = window.AudioWorkletNode;
      window.AudioWorkletNode = class extends NativeWorklet {
        constructor(context, name, options) {
          super(context, name, options);
          const entry = { name, outputChannelCount: options?.outputChannelCount || null, node: this, messages: [] };
          this.port.addEventListener('message', event => entry.messages.push({ at: performance.now(), data: event.data }));
          this.port.start();
          this.addEventListener('processorerror', event => window.__stratProbe.processorErrors.push(String(event.message || 'processorerror')));
          window.__stratProbe.worklets.push(entry);
        }
      };
    });
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
    await page.evaluate(async initialSeed => {
      const { app } = await import('/src/main.js');
      await app.ready;
      const { AntController } = await import('/src/lib/agents/ant/AntController.js');
      const { AntEnvironmentAudioBridge } = await import('/src/lib/audio/AntEnvironmentAudioBridge.js');
      let rng = initialSeed >>> 0;
      const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 0x100000000; };
      app.lab.registry.ant = options => new AntController({ ...options, random,
        audioBridge: new AntEnvironmentAudioBridge({ audioEngine: options.audioEngine, workletBaseUrl: options.workletBaseUrl }) });
      await app.selectModel('ant');
      const model = app.lab.model;
      const realUpdate = model.update.bind(model);
      model.__stratigraphyPerf = { calls: 0, totalMs: 0, maxMs: 0 };
      model.__stratigraphyOriginalUpdate = timestamp => {
        const start = performance.now();
        const result = realUpdate(timestamp);
        const elapsed = performance.now() - start;
        model.__stratigraphyPerf.calls += 1;
        model.__stratigraphyPerf.totalMs += elapsed;
        model.__stratigraphyPerf.maxMs = Math.max(model.__stratigraphyPerf.maxMs, elapsed);
        if (model.__stratigraphyPerf.recording) model.__stratigraphyPerf.recording.maxMs =
          Math.max(model.__stratigraphyPerf.recording.maxMs, elapsed);
        return result;
      };
      model.update = () => false;
      window.__stratEvidence = { app, seed: initialSeed, events: [], birthEvents: [], contactCount: 0 };
      model.subscribe(event => {
        if (event.type === 'plate-birth') {
          const descriptor = event.payload?.descriptor || event.payload;
          const eventRecord = { type: 'plate-birth', simulationTimeMs: descriptor?.bornAtSimulationTimeMs ?? model.simulationTimeMs,
            payload: descriptor };
          window.__stratEvidence.birthEvents.push({ timeMs: eventRecord.simulationTimeMs, descriptor });
          window.__stratEvidence.events.push(eventRecord);
        }
        if (event.type === 'sphere-birth') {
          const descriptor = event.payload;
          window.__stratEvidence.events.push({ type: 'sphere-birth',
            simulationTimeMs: descriptor?.bornAtSimulationTimeMs ?? model.simulationTimeMs, payload: descriptor });
        }
        if (event.type === 'foot-contact') {
          window.__stratEvidence.contactCount += event.payload?.contacts?.length || 0;
          window.__stratEvidence.events.push({ type: event.payload?.type || 'FOOT_CONTACT',
            simulationTimeMs: event.payload?.simulationTimeMs ?? model.simulationTimeMs, payload: event.payload });
        }
      });
      model.setAudioVolume?.(0.35);
    }, seed);
    await page.waitForSelector('#simulation-canvas');
    await page.evaluate(() => {
      if (window.__stratProbe.contexts.length !== 0 || window.__stratProbe.worklets.length !== 0) {
        throw new Error('ANT must not initialize audio before Audio On.');
      }
    });
    return { context, page };
  }

  async function advance(page, seconds, onSecond = null) {
    const count = Math.round(seconds / step);
    for (let offset = 0; offset < count; offset += 120) {
      const batch = Math.min(120, count - offset);
      await page.evaluate(n => {
        const model = window.__stratEvidence.app.lab.model;
        for (let i = 0; i < n; i += 1) model.tick(1 / 60);
        model.emit('update');
      }, batch);
      if ((offset + batch) % 60 === 0 && onSecond) await onSecond();
      await page.waitForTimeout(0);
    }
  }

  function hashFloats(values) {
    if (!values) return null;
    const bytes = new Uint8Array(values.buffer, values.byteOffset || 0, values.byteLength);
    let hash = 2166136261;
    for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 16777619) >>> 0; }
    return hash.toString(16).padStart(8, '0');
  }

  async function readState(page) {
    return page.evaluate(() => {
      const model = window.__stratEvidence.app.lab.model;
      const snapshot = model.getSnapshot();
      const stratigraphy = snapshot.stratigraphy || {};
      const topology = stratigraphy.stratigraphy || {};
      const plates = model.trailPlateBirth?.getPlates?.() || [];
      const layers = stratigraphy.layers || { plateCount: 0 };
      const nodules = stratigraphy.nodules || [];
      const diagnostics = stratigraphy.diagnostics || {};
      const finiteSummary = array => {
        if (!array?.length) return { count: 0, nonFinite: 0, mean: null, max: null };
        let sum = 0, max = -Infinity, count = 0, nonFinite = 0;
        for (const value of array) {
          if (!Number.isFinite(value)) { nonFinite += 1; continue; }
          sum += value; max = Math.max(max, value); count += 1;
        }
        return { count: array.length, nonFinite, mean: count ? sum / count : null, max: count ? max : null };
      };
      const countFinite = array => {
        if (!array) return { count: 0, nonFinite: 0, min: null, max: null };
        let min = Infinity, max = -Infinity, nonFinite = 0;
        for (const rawValue of array) {
          const value = Number(rawValue);
          if (!Number.isFinite(value)) { nonFinite += 1; continue; }
          min = Math.min(min, value); max = Math.max(max, value);
        }
        return { count: array.length, nonFinite, min: Number.isFinite(min) ? min : null, max: Number.isFinite(max) ? max : null };
      };
      return {
        simulationTimeMs: snapshot.analysis.simulationTimeMs,
        population: snapshot.analysis.population,
        totalSpawned: snapshot.analysis.totalSpawned,
        totalRetired: snapshot.analysis.totalRetired,
        activation: snapshot.analysis.colonyActivation,
        field: { totalFootContacts: snapshot.surface?.totalFootContacts, totalMass: snapshot.surface?.totalMass,
          maxValue: snapshot.surface?.maxValue, finite: countFinite(snapshot.surface?.values) },
        pheromone: { totalMass: snapshot.pheromone?.totalMass, maxValue: snapshot.pheromone?.maxValue,
          hash: (() => { const a = snapshot.pheromone?.values; if (!a) return null;
            let h = 2166136261; const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
            for (const v of b) { h ^= v; h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); })() },
        plateCount: plates.length,
        plates: plates.map(plate => ({ id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
          maskCells: plate.mask?.reduce?.((sum, value) => sum + (value ? 1 : 0), 0) || 0,
          pathLength: plate.principalPath?.length || 0, pickups: plate.pickups, source: plate.source, target: plate.target })),
        layerCount: layers.plateCount || 0,
        layerState: topology.plateHistory || [],
        layerSummary: layers,
        nodules: nodules.map(nodule => ({ id: nodule.id, bornAtSimulationTimeMs: nodule.bornAtSimulationTimeMs,
          position: nodule.position, radius: nodule.radius, physicalRadiusMeters: nodule.physicalRadiusMeters,
          support: nodule.support, burial: nodule.burial, coupling: nodule.coupling })),
        depth: finiteSummary(topology.totalDepthByCellMeters),
        stratigraphyDiagnostics: diagnostics,
        audio: snapshot.audio,
        ants: snapshot.agents.map(ant => ({ id: ant.id, x: ant.x, y: ant.y, vx: ant.vx, vy: ant.vy,
          heading: ant.heading, gaitPhase: ant.gait?.phase,
          footContacts: ant.gait?.legs?.filter(leg => leg.contact).length || 0 })),
        totalContactFeet: window.__stratEvidence.contactCount
      };
    });
  }

  async function capturePNG(page, path) { await page.screenshot({ path, fullPage: true }); }

  async function recordClip({ page, name, label, targetSeconds }) {
    const before = await readState(page);
    const previousTime = before.simulationTimeMs / 1000;
    assert.ok(Math.abs(previousTime - targetSeconds) < 2, `${name} preparation drifted from the natural milestone`);
    await writeFile(resolve(outDir, `${name}.json`), JSON.stringify({ label, seed, clipName: name,
      status: 'preparing', targetSeconds, stateAtStart: before,
      provenance: 'A naturally prepared default-model checkpoint; measurement has not yet run.' }, null, 2));
    await page.locator('#ant-volume').evaluate((slider, value) => {
      slider.value = String(value); slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    }, Math.round(volume * 100));
    await page.locator('[data-action="ant-audio"]').click();
    await page.waitForFunction(() => {
      const bridge = window.__stratEvidence.app.lab.model.audioBridge;
      return bridge?.enabled && !bridge.loading && bridge.worklet;
    }, null, { timeout: 15000 });
    const imagePath = resolve(outDir, `${name}.png`);
    await capturePNG(page, imagePath);

    const started = await page.evaluate(async seconds => {
      const model = window.__stratEvidence.app.lab.model;
      const audio = model.audioBridge;
      const canvas = document.querySelector('#simulation-canvas');
      const context = window.__stratProbe.contexts.at(-1);
      const gainNode = audio.worklet?.gainNode;
      if (!context || !gainNode || !canvas?.captureStream) throw new Error('Missing canvas capture or selected final audio gain');
      const videoStream = canvas.captureStream(30);
      const audioStream = context.createMediaStreamDestination();
      gainNode.connect(audioStream);
      const videoRecorder = new MediaRecorder(videoStream, { mimeType: 'video/webm;codecs=vp8' });
      const audioRecorder = new MediaRecorder(audioStream.stream, { mimeType: 'audio/webm;codecs=opus' });
      const videoChunks = [], audioChunks = [];
      videoRecorder.addEventListener('dataavailable', event => { if (event.data.size) videoChunks.push(event.data); });
      audioRecorder.addEventListener('dataavailable', event => { if (event.data.size) audioChunks.push(event.data); });
      model.update = model.__stratigraphyOriginalUpdate;
      model.__stratigraphyPerf.recording = { maxMs: 0 };
      audio.surface?.post?.('diagnostics');
      await new Promise(resolve => setTimeout(resolve, 50));
      const diagnostics = audio.surface?.diagnostics || {};
      const capture = window.__stratEvidence.capture = { videoStream, audioStream, videoRecorder, audioRecorder,
        videoChunks, audioChunks, context, gainNode, startedAt: performance.now(), startTimeMs: model.simulationTimeMs,
        startContacts: window.__stratEvidence.contactCount, diagnosticsStart: { ...diagnostics },
        bridgeMode: audio.mode, sampleRate: context.sampleRate,
        perfAtStart: { ...model.__stratigraphyPerf },
        processorDiagnosticsAtStart: audio.surface?.processorDiagnostics || null,
        workletMessagesAtStart: window.__stratProbe.worklets.at(-1)?.messages.length || 0,
        stoppedPromise: null };
      capture.stoppedPromise = Promise.all([
        new Promise(resolve => videoRecorder.addEventListener('stop', resolve, { once: true })),
        new Promise(resolve => audioRecorder.addEventListener('stop', resolve, { once: true }))
      ]);
      videoRecorder.start(500); audioRecorder.start(500);
      setTimeout(() => {
        capture.stoppedAt = performance.now();
        capture.endTimeMs = model.simulationTimeMs;
        capture.endContacts = window.__stratEvidence.contactCount;
        capture.diagnosticsEnd = { ...(audio.surface?.diagnostics || {}) };
        capture.perfAtStop = { calls: model.__stratigraphyPerf.calls, totalMs: model.__stratigraphyPerf.totalMs,
          maxMs: model.__stratigraphyPerf.recording?.maxMs || 0 };
        model.update = () => false;
        if (videoRecorder.state !== 'inactive') videoRecorder.stop();
        if (audioRecorder.state !== 'inactive') audioRecorder.stop();
      }, seconds * 1000);
      return { wallStartPerformanceMs: capture.startedAt, simulationStartMs: capture.startTimeMs,
        sampleRate: context.sampleRate, contextState: context.state, finalGain: gainNode.gain.value,
        volume: audio.volume, audioMode: audio.mode, workletChannelCount: window.__stratProbe.worklets.at(-1)?.outputChannelCount };
    }, clipSeconds);

    const pulse = setInterval(async () => {
      try {
        const state = await readState(page);
        const listPath = resolve(outDir, `${name}-live-state.jsonl`);
        await writeFile(listPath, `${JSON.stringify({ wallMs: Date.now(), simulationTimeMs: state.simulationTimeMs,
          population: state.population, plateCount: state.plateCount, layerCount: state.layerCount,
          noduleCount: state.nodules.length, fieldMass: state.field.totalMass })}\n`, { flag: 'a' });
      } catch { /* page teardown only */ }
    }, 1000);

    await page.waitForTimeout(clipSeconds * 1000 + 100);
    clearInterval(pulse);
    const payload = await page.evaluate(async () => {
      const capture = window.__stratEvidence.capture;
      await capture.stoppedPromise;
      const audioBlob = new Blob(capture.audioChunks, { type: capture.audioRecorder.mimeType });
      const videoBlob = new Blob(capture.videoChunks, { type: capture.videoRecorder.mimeType });
      const audioBytes = await audioBlob.arrayBuffer();
      const videoBytes = await videoBlob.arrayBuffer();
      const decoded = await capture.context.decodeAudioData(audioBytes.slice(0));
      const decodedChannels = [0, 1].map(channel => decoded.getChannelData(Math.min(channel, decoded.numberOfChannels - 1)));
      const { buildStratigraphyAudioSnapshot, renderStratigraphyAudioSnapshot } = await import('/scripts/audio-snapshot-renderer.js');
      const audioSnapshot = buildStratigraphyAudioSnapshot({ left: decodedChannels[0], right: decodedChannels[1] },
        { sampleRate: decoded.sampleRate, sourceDurationSeconds: decoded.duration });
      const analysisCanvas = document.createElement('canvas'); renderStratigraphyAudioSnapshot(analysisCanvas, audioSnapshot);
      const toBase64 = bytes => {
        const view = new Uint8Array(bytes); let binary = '';
        for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, Math.min(view.length, i + 0x8000)));
        return btoa(binary);
      };
      const stats = values => {
        let energy = 0, peak = 0, clipping = 0, nonFinite = 0, zeroRun = 0, longestZeroRun = 0;
        const rmsPer100ms = [], width = Math.max(1, Math.round(decoded.sampleRate / 10));
        for (let start = 0; start < values.length; start += width) {
          const end = Math.min(values.length, start + width); let frameEnergy = 0;
          for (let i = start; i < end; i += 1) {
            const value = values[i];
            if (!Number.isFinite(value)) { nonFinite += 1; continue; }
            energy += value * value; frameEnergy += value * value;
            peak = Math.max(peak, Math.abs(value)); if (Math.abs(value) >= .999) clipping += 1;
            if (value === 0) { zeroRun += 1; longestZeroRun = Math.max(longestZeroRun, zeroRun); } else zeroRun = 0;
          }
          rmsPer100ms.push(Math.sqrt(frameEnergy / Math.max(1, end - start)));
        }
        return { rms: Math.sqrt(energy / Math.max(1, values.length)), peak, clippingCount: clipping,
          nonFiniteCount: nonFinite, longestExactZeroRunSamples: longestZeroRun,
          longestExactZeroRunMs: 1000 * longestZeroRun / decoded.sampleRate, rmsPer100ms };
      };
      const leftStats = stats(decodedChannels[0]), rightStats = stats(decodedChannels[1]);
      const pcmEnergy = (decodedChannels[0].reduce((sum, value) => sum + value * value, 0)
        + decodedChannels[1].reduce((sum, value) => sum + value * value, 0)) / decoded.sampleRate;
      const model = window.__stratEvidence.app.lab.model;
      const audio = model.audioBridge;
      audio.surface?.post?.('diagnostics');
      await new Promise(resolve => setTimeout(resolve, 50));
      return { audioBase64: toBase64(audioBytes), videoBase64: toBase64(videoBytes),
        audioMime: capture.audioRecorder.mimeType, videoMime: capture.videoRecorder.mimeType,
        wallDurationMs: capture.stoppedAt - capture.startedAt, simulationStartMs: capture.startTimeMs,
        simulationEndMs: capture.endTimeMs, sampleRate: decoded.sampleRate,
        decodedDurationSeconds: decoded.duration, channelCount: decoded.numberOfChannels,
        left: leftStats, right: rightStats, pcmEnergy,
        audioAnalysisPngBase64: analysisCanvas.toDataURL('image/png').split(',')[1],
        contacts: capture.endContacts - capture.startContacts,
        processorMessages: window.__stratProbe.worklets.at(-1)?.messages.slice(capture.workletMessagesAtStart).map(entry => entry.data) || [],
        diagnosticDelta: Object.fromEntries(Array.from(new Set([...Object.keys(capture.diagnosticsStart), ...Object.keys(capture.diagnosticsEnd)]),
          key => [key, (capture.diagnosticsEnd[key] || 0) - (capture.diagnosticsStart[key] || 0)])),
        diagnostics: audio.surface?.diagnostics || {}, processorDiagnostics: audio.surface?.worklet?.processorDiagnostics || null,
        processorDiagnosticsAtStart: capture.processorDiagnosticsAtStart,
        processorDiagnosticsAtEnd: audio.surface?.processorDiagnostics || null,
        processorErrors: window.__stratProbe.processorErrors, contextState: capture.context.state,
        gain: capture.gainNode.gain.value, mode: audio.mode,
        worklets: window.__stratProbe.worklets.map(item => ({ name: item.name, outputChannelCount: item.outputChannelCount })),
        perf: { calls: capture.perfAtStop.calls - capture.perfAtStart.calls,
          totalMs: capture.perfAtStop.totalMs - capture.perfAtStart.totalMs,
          maxFrameMs: capture.perfAtStop.maxMs } };
    });
    await writeFile(resolve(outDir, `${name}-audio.webm`), Buffer.from(payload.audioBase64, 'base64'));
    await writeFile(resolve(outDir, `${name}-video.webm`), Buffer.from(payload.videoBase64, 'base64'));
    await writeFile(resolve(outDir, `${name}-audio-analysis.png`), Buffer.from(payload.audioAnalysisPngBase64, 'base64'));
    const after = await readState(page);
    const metadata = { label, seed, clipName: name, requestedSimulationTimeSeconds: targetSeconds,
      simulation: { startMs: payload.simulationStartMs, endMs: payload.simulationEndMs,
        advancedSeconds: (payload.simulationEndMs - payload.simulationStartMs) / 1000,
        activePopulation: { start: before.population, end: after.population },
        colonyActivation: { start: before.activation, end: after.activation } },
      media: { targetDurationSeconds: clipSeconds, browserWallDurationSeconds: payload.wallDurationMs / 1000,
        decodedAudioDurationSeconds: payload.decodedDurationSeconds, videoMimeType: payload.videoMime,
        audioMimeType: payload.audioMime, sampleRate: payload.sampleRate, audioChannels: payload.channelCount,
        outputGain: payload.gain, volume: payload.gain / 0.7, audioContextState: payload.contextState,
        workletChannelCount: payload.worklets.at(-1)?.outputChannelCount,
        processorErrors: payload.processorErrors, contacts: payload.contacts,
        actualRoutedFeet: payload.diagnosticDelta.routedFeet ?? null,
        actualRoutedFootEvents: payload.diagnosticDelta.routedFootEvents ?? null,
        supportedFeet: payload.diagnosticDelta.supportedFeet ?? null,
        unsupportedFeet: payload.diagnosticDelta.unsupportedFeet ?? null,
        injectedImpulseEnergy: payload.diagnosticDelta.injectedImpulseEnergy ?? null,
        dropped: payload.diagnosticDelta.dropped ?? null,
        queued: payload.diagnosticDelta.queued ?? null,
        realtimeProcessorDiagnostics: { start: payload.processorDiagnosticsAtStart,
          end: payload.processorDiagnosticsAtEnd },
        left: payload.left, right: payload.right, pcmEnergy: payload.pcmEnergy,
        pcmEnergyPerSupportedIndividualFoot: payload.diagnosticDelta.supportedFeet > 0
          ? payload.pcmEnergy / payload.diagnosticDelta.supportedFeet : null,
        peakMemoryOrCPUDiagnostic: payload.perf },
      material: { surfaceStart: before.field, surfaceEnd: after.field,
        plateCountStart: before.plateCount, plateCountEnd: after.plateCount,
        platesStart: before.plates, platesEnd: after.plates, layersStart: before.layerState, layersEnd: after.layerState,
        depthStart: before.depth, depthEnd: after.depth, nodulesStart: before.nodules, nodulesEnd: after.nodules,
        birthEvents: await page.evaluate(() => window.__stratEvidence.birthEvents.map(e => ({ timeMs: e.timeMs,
          id: e.descriptor?.id, source: e.descriptor?.source, target: e.descriptor?.target,
          geodesicLength: e.descriptor?.metrics?.geodesicLength, maskCells: e.descriptor?.mask?.filter?.(x => x === 1).length,
          meanHalfWidth: e.descriptor?.metrics?.meanHalfWidth, maxHalfWidth: e.descriptor?.metrics?.maxHalfWidth,
          chemicalEvidence: e.descriptor?.metrics?.meanChemical, mechanicalEvidence: e.descriptor?.metrics?.meanSupport,
          footContacts: e.descriptor?.metrics?.footContacts, material: e.descriptor?.material,
          pickups: e.descriptor?.pickups, overlapAndCoupling: e.descriptor?.metrics?.overlapAndCoupling }))) },
      artifacts: { screenshot: `${name}.png`, video: `${name}-video.webm`, audio: `${name}-audio.webm`,
        audioAnalysis: `${name}-audio-analysis.png` },
      provenance: { preparation: 'Seeded natural default ANT simulation, direct AntController.tick(1/60), audio Off; no hand-placed agents, plates, or nodules.',
        recording: 'Real Chrome requestAnimationFrame simulation and renderer; separate video/audio MediaRecorders started/stopped from one browser-owned timer. A parallel recorder tap was attached to the selected final gain; the original output connection remained.',
        audioAnalysis: `Frozen ${STRATIGRAPHY_AUDIO_PRESET.id}: stereo L/R separate; exact ${STRATIGRAPHY_AUDIO_PRESET.durationSeconds.toFixed(2)}-second axis; zero-pad short sources at end and trim longer sources from the end; waveform ±1 full scale; FFT ${STRATIGRAPHY_AUDIO_PRESET.fftSize} ${STRATIGRAPHY_AUDIO_PRESET.window}, hop ${STRATIGRAPHY_AUDIO_PRESET.hopSize}, ${STRATIGRAPHY_AUDIO_PRESET.frequencyMinHz}–${STRATIGRAPHY_AUDIO_PRESET.frequencyMaxHz} Hz, fixed ${STRATIGRAPHY_AUDIO_PRESET.spectrogramMinDb} to ${STRATIGRAPHY_AUDIO_PRESET.spectrogramMaxDb} dBFS, gamma ${STRATIGRAPHY_AUDIO_PRESET.spectrogramGamma}, grayscale luminance, no normalization.`,
        rendererPreset: STRATIGRAPHY_AUDIO_PRESET } };
    await writeFile(resolve(outDir, `${name}.json`), JSON.stringify(metadata, null, 2));
    await page.locator('[data-action="ant-audio"]').click().catch(() => {});
    return metadata;
  }

  async function recordContinuousRun({ targetSeconds = 600, watchdogSeconds = 2400,
    name = 'continuous-natural-0-600s' } = {}) {
    const { page, context } = await openDefault();
    const audioWebmPath = resolve(outDir, `${name}-audio.webm`);
    const videoPath = resolve(outDir, `${name}-video.webm`);
    const sidecarPath = resolve(outDir, `${name}.json`);
    await writeFile(audioWebmPath, Buffer.alloc(0));
    await writeFile(videoPath, Buffer.alloc(0));
    try {
      const startState = await readState(page);
      await page.locator('#ant-volume').evaluate((slider, value) => {
        slider.value = String(value); slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }, Math.round(volume * 100));
      await page.locator('[data-action="ant-audio"]').click();
      await page.waitForFunction(() => {
        const bridge = window.__stratEvidence.app.lab.model.audioBridge;
        return bridge?.enabled && !bridge.loading && bridge.worklet;
      }, null, { timeout: 15000 });
      await page.screenshot({ path: resolve(outDir, `${name}-start.png`), fullPage: true });
      const setup = await page.evaluate(async ({ targetMs, watchdogMs }) => {
        const model = window.__stratEvidence.app.lab.model;
        const audio = model.audioBridge;
        const canvas = document.querySelector('#simulation-canvas');
        const audioContext = window.__stratProbe.contexts.at(-1);
        const gainNode = audio.worklet?.gainNode;
        if (!audioContext || !gainNode || !canvas?.captureStream) throw new Error('Missing real canvas/audio final-gain capture source');
        audio.surface?.post?.('diagnostics');
        await new Promise(resolve => setTimeout(resolve, 50));
        const videoStream = canvas.captureStream(30);
        const audioDestination = audioContext.createMediaStreamDestination();
        gainNode.connect(audioDestination);
        const videoRecorder = new MediaRecorder(videoStream, { mimeType: 'video/webm;codecs=vp8' });
        const audioRecorder = new MediaRecorder(audioDestination.stream, { mimeType: 'audio/webm;codecs=opus' });
        const capture = window.__stratEvidence.longCapture = {
          videoStream, audioDestination, videoRecorder, audioRecorder,
          pendingVideo: [], pendingAudio: [], anchors: [], timeline: [],
          anchorCursor: 0, timelineCursor: 0, eventCursor: window.__stratEvidence.events.length,
          startedAt: performance.now(), startSimulationTimeMs: model.simulationTimeMs,
          startAudioContextTime: audioContext.currentTime, startContacts: window.__stratEvidence.contactCount,
          startDiagnostics: { ...(audio.surface?.diagnostics || {}) },
          startProcessorDiagnostics: audio.surface?.processorDiagnostics || null,
          startPerf: { ...model.__stratigraphyPerf }, workletChannelCount: window.__stratProbe.worklets.at(-1)?.outputChannelCount,
          completed: false, stopReason: null, timer: null };
        videoRecorder.addEventListener('dataavailable', event => { if (event.data?.size) capture.pendingVideo.push(event.data); });
        audioRecorder.addEventListener('dataavailable', event => { if (event.data?.size) capture.pendingAudio.push(event.data); });
        capture.stoppedPromise = Promise.all([
          new Promise(resolve => videoRecorder.addEventListener('stop', resolve, { once: true })),
          new Promise(resolve => audioRecorder.addEventListener('stop', resolve, { once: true }))
        ]);
        const sampleAnchor = () => {
          const audioSampleIndex = Math.max(0, Math.round((audioContext.currentTime - capture.startAudioContextTime) * audioContext.sampleRate));
          const previous = capture.anchors.at(-1);
          const record = { simulationTimeMs: model.simulationTimeMs, audioSampleIndex,
            audioContextTimeSeconds: audioContext.currentTime - capture.startAudioContextTime };
          if (!previous || record.simulationTimeMs > previous.simulationTimeMs) capture.anchors.push(record);
        };
        capture.anchors.push({ simulationTimeMs: model.simulationTimeMs, audioSampleIndex: 0, audioContextTimeSeconds: 0 });
        let lastTimeline = model.simulationTimeMs;
        const stop = reason => {
          if (capture.completed) return;
          capture.completed = true; capture.stopReason = reason; capture.stoppedAt = performance.now();
          capture.endSimulationTimeMs = model.simulationTimeMs;
          capture.endAudioContextTime = audioContext.currentTime;
          capture.endContacts = window.__stratEvidence.contactCount;
          capture.endDiagnostics = { ...(audio.surface?.diagnostics || {}) };
          capture.endProcessorDiagnostics = audio.surface?.processorDiagnostics || null;
          capture.endPerf = { ...model.__stratigraphyPerf };
          sampleAnchor();
          model.update = () => false;
          if (capture.timer) clearInterval(capture.timer);
          if (videoRecorder.state !== 'inactive') videoRecorder.stop();
          if (audioRecorder.state !== 'inactive') audioRecorder.stop();
        };
        model.update = model.__stratigraphyOriginalUpdate;
        model.__stratigraphyPerf.recording = { maxMs: 0 };
        videoRecorder.start(1000); audioRecorder.start(1000);
        capture.timer = setInterval(() => {
          sampleAnchor();
          if (model.simulationTimeMs - lastTimeline >= 10000) {
            const state = model.getSnapshot();
            capture.timeline.push({ simulationTimeMs: state.analysis.simulationTimeMs,
              audioSampleIndex: Math.max(0, Math.round((audioContext.currentTime - capture.startAudioContextTime) * audioContext.sampleRate)),
              population: state.analysis.population, totalSpawned: state.analysis.totalSpawned,
              totalRetired: state.analysis.totalRetired, activation: state.analysis.colonyActivation?.activation ?? null,
              plateCount: state.stratigraphy?.layers?.plateCount || 0,
              exposedCellCount: state.stratigraphy?.layers?.exposedCellCount || 0,
              buriedLayerCellCount: state.stratigraphy?.layers?.buriedLayerCellCount || 0,
              noduleCount: state.stratigraphy?.nodules?.length || 0,
              maxColumnLayerCount: state.stratigraphy?.layers?.maxColumnLayerCount || 0,
              depth: (() => { const values = state.stratigraphy?.stratigraphy?.totalDepthByCellMeters;
                if (!values?.length) return { mean: 0, max: 0 }; let sum = 0, max = 0;
                for (const value of values) if (Number.isFinite(value)) { sum += value; max = Math.max(max, value); }
                return { mean: sum / values.length, max }; })(),
              surfaceMass: state.surface?.totalMass, surfaceMaximum: state.surface?.maxValue,
              contactFootCount: window.__stratEvidence.contactCount,
              bridgeDiagnostics: { ...(audio.surface?.diagnostics || {}) },
              processorDiagnosticsObserved: audio.surface?.processorDiagnostics || null,
              processorDiagnosticsRequestedAt: audioContext.currentTime });
            lastTimeline = state.analysis.simulationTimeMs;
            audio.surface?.post?.('diagnostics');
          }
          if (model.simulationTimeMs >= targetMs) stop('target-simulation-time');
          else if (performance.now() - capture.startedAt >= watchdogMs) stop('wall-watchdog');
        }, 250);
        return { startedAt: capture.startedAt, simulationTimeMs: capture.startSimulationTimeMs,
          startAudioContextTime: capture.startAudioContextTime, sampleRate: audioContext.sampleRate,
          contextState: audioContext.state, outputGain: gainNode.gain.value, volume: audio.volume,
          mode: audio.mode, workletName: window.__stratProbe.worklets.at(-1)?.name,
          workletChannelCount: capture.workletChannelCount,
          processorDiagnosticsStart: capture.startProcessorDiagnostics,
          processorDiagnosticsInitial: audio.surface?.diagnostics || {},
          connectedContextCount: window.__stratProbe.contexts.length };
      }, { targetMs: targetSeconds * 1000, watchdogMs: watchdogSeconds * 1000 });
      await writeFile(sidecarPath, JSON.stringify({ status: 'recording', seed, targetSimulationTimeMs: targetSeconds * 1000,
        setup, startState, artifacts: { audioWebm: `${name}-audio.webm`, video: `${name}-video.webm`,
          startScreenshot: `${name}-start.png` }, note: `The browser-owned timer stops at ${targetSeconds} seconds of simulation time or after ${watchdogSeconds} wall seconds.` }, null, 2));

      const anchors = [], events = [], timeline = [];
      let lastProgress = -1;
      while (true) {
        await page.waitForTimeout(2000);
        const batch = await page.evaluate(async () => {
          const capture = window.__stratEvidence.longCapture;
          const model = window.__stratEvidence.app.lab.model;
          const encode = async blobs => Promise.all(blobs.map(async blob => {
            const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
            return btoa(binary);
          }));
          const anchors = capture.anchors.slice(capture.anchorCursor); capture.anchorCursor = capture.anchors.length;
          const timeline = capture.timeline.slice(capture.timelineCursor); capture.timelineCursor = capture.timeline.length;
          const evidence = window.__stratEvidence.events.slice(capture.eventCursor); capture.eventCursor = window.__stratEvidence.events.length;
          const videoBlobs = capture.pendingVideo.splice(0), audioBlobs = capture.pendingAudio.splice(0);
          const [videoChunks, audioChunks] = await Promise.all([encode(videoBlobs), encode(audioBlobs)]);
          return { videoChunks, audioChunks,
            simulationTimeMs: model.simulationTimeMs, completed: capture.completed, stopReason: capture.stopReason,
            anchors, timeline, events: evidence };
        });
        const videoChunks = await batch.videoChunks; const audioChunks = await batch.audioChunks;
        if (videoChunks.length) await appendFile(videoPath, Buffer.concat(videoChunks.map(value => Buffer.from(value, 'base64'))));
        if (audioChunks.length) await appendFile(audioWebmPath, Buffer.concat(audioChunks.map(value => Buffer.from(value, 'base64'))));
        anchors.push(...batch.anchors); timeline.push(...batch.timeline); events.push(...batch.events);
        const elapsedSeconds = batch.simulationTimeMs / 1000;
        if (Math.floor(elapsedSeconds / 30) !== lastProgress) {
          lastProgress = Math.floor(elapsedSeconds / 30);
          console.log(`continuous capture simulation=${elapsedSeconds.toFixed(1)}s anchors=${anchors.length} contacts=${events.filter(item => item.type === 'FOOT_CONTACT').length}`);
        }
        if (batch.completed) {
          await page.evaluate(() => window.__stratEvidence.longCapture.stoppedPromise);
          const finalBatch = await page.evaluate(async () => {
            const capture = window.__stratEvidence.longCapture;
            const encode = async blobs => Promise.all(blobs.map(async blob => {
              const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
              for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
              return btoa(binary);
            }));
            const videoBlobs = capture.pendingVideo.splice(0), audioBlobs = capture.pendingAudio.splice(0);
            const [videoChunks, audioChunks] = await Promise.all([encode(videoBlobs), encode(audioBlobs)]);
            const anchors = capture.anchors.slice(capture.anchorCursor); capture.anchorCursor = capture.anchors.length;
            const timeline = capture.timeline.slice(capture.timelineCursor); capture.timelineCursor = capture.timeline.length;
            const events = window.__stratEvidence.events.slice(capture.eventCursor); capture.eventCursor = window.__stratEvidence.events.length;
            return { videoChunks, audioChunks, anchors, timeline, events };
          });
          if (finalBatch.videoChunks.length) await appendFile(videoPath, Buffer.concat(finalBatch.videoChunks.map(value => Buffer.from(value, 'base64'))));
          if (finalBatch.audioChunks.length) await appendFile(audioWebmPath, Buffer.concat(finalBatch.audioChunks.map(value => Buffer.from(value, 'base64'))));
          anchors.push(...finalBatch.anchors); timeline.push(...finalBatch.timeline); events.push(...finalBatch.events);
          break;
        }
      }

      const finalBrowser = await page.evaluate(() => {
        const capture = window.__stratEvidence.longCapture;
        const model = window.__stratEvidence.app.lab.model;
        return { wallDurationMs: capture.stoppedAt - capture.startedAt,
          simulationStartMs: capture.startSimulationTimeMs, simulationEndMs: capture.endSimulationTimeMs,
          audioContextDurationSeconds: capture.endAudioContextTime - capture.startAudioContextTime,
          contacts: capture.endContacts - capture.startContacts,
          startDiagnostics: capture.startDiagnostics, endDiagnostics: capture.endDiagnostics,
          processorDiagnosticsStart: capture.startProcessorDiagnostics,
          processorDiagnosticsEnd: capture.endProcessorDiagnostics,
          perf: { calls: capture.endPerf.calls - capture.startPerf.calls,
            totalMs: capture.endPerf.totalMs - capture.startPerf.totalMs,
            maxUpdateMs: model.__stratigraphyPerf.recording?.maxMs ?? null },
          finalState: model.getSnapshot().analysis, mode: model.audioBridge.mode,
          volume: model.audioBridge.volume, outputGain: model.audioBridge.worklet?.gainNode?.gain?.value ?? null,
          sampleRate: window.__stratProbe.contexts.at(-1)?.sampleRate ?? null,
          processorErrors: window.__stratProbe.processorErrors,
          workletMessages: window.__stratProbe.worklets.at(-1)?.messages.map(message => ({ atPerformanceMs: message.at, ...message.data })) || [] };
      });
      await page.screenshot({ path: resolve(outDir, `${name}-end.png`), fullPage: true });
      const finalState = await readState(page);
      const footGroups = events.filter(event => event.type === 'FOOT_CONTACT');
      const individualFeet = footGroups.reduce((sum, event) => sum + (Array.isArray(event.payload?.contacts) ? event.payload.contacts.length : 0), 0);
      const eventCounts = { total: events.length, footContactGroups: footGroups.length, individualFootContacts: individualFeet,
        plateBirths: events.filter(event => event.type === 'plate-birth').length,
        noduleBirths: events.filter(event => event.type === 'sphere-birth').length };
      const browserEvidencePath = resolve(outDir, `${name}-browser-evidence.json`);
      await writeFile(browserEvidencePath, JSON.stringify({ status: 'captured-awaiting-audio-conversion', seed,
        targetSimulationTimeMs: targetSeconds * 1000, setup, startState, end: finalBrowser, finalState,
        simulationDurationSeconds: (finalBrowser.simulationEndMs - finalBrowser.simulationStartMs) / 1000,
        wallDurationSeconds: finalBrowser.wallDurationMs / 1000, clockAnchorIntervalMs: 250,
        clockAnchors: anchors, events, timeline, eventCounts,
        provenance: { capture: 'Real Chrome synchronized Canvas/WebM and final-gain stereo WebM; browser evidence is persisted before PCM conversion.',
          audio: 'The final-gain stereo WebM is the source for float32 WAV conversion; UI gain was 35 percent.',
          clockMap: '250 ms timer anchors map simulation time to AudioContext sample index. FOOT_CONTACT events retain gait payload timestamps.',
          processorDiagnostics: 'Processor telemetry is requested at 10-second timeline checkpoints and arrives asynchronously; message timestamps use performance.now.' } }, null, 2));
      const lifecyclePath = resolve(outDir, `${name}-paused-audio-lifecycle.json`);
      const beforeLifecycle = await page.evaluate(() => {
        const model = window.__stratEvidence.app.lab.model, bridge = model.audioBridge;
        const oldHandle = bridge.surface.worklet;
        window.__stratEvidence.lifecycleRefs = { context: window.__stratProbe.contexts.at(-1), oldHandle,
          oldPort: oldHandle?.node?.port, eventCursor: window.__stratEvidence.events.length };
        return { simulationTimeMs: model.simulationTimeMs,
          plateIds: model.trailPlateBirth.getPlates().map(plate => plate.id),
          materialRevision: model.materialStratigraphy.revision,
          bridgeMaterialRevision: bridge.surface.materialRevision,
          contextCount: window.__stratProbe.contexts.length, audioEnabled: bridge.enabled,
          workletCount: bridge.surface.audioEngine.worklets.size, oldWorkletPresent: Boolean(oldHandle) };
      });
      await page.locator('[data-action="ant-audio"]').click();
      await page.waitForFunction(() => !window.__stratEvidence.app.lab.model.audioBridge.enabled);
      const afterOff = await page.evaluate(() => {
        const { app } = window.__stratEvidence, model = app.lab.model, bridge = model.audioBridge;
        const refs = window.__stratEvidence.lifecycleRefs;
        return { audioEnabled: bridge.enabled, contextCount: window.__stratProbe.contexts.length,
          sameContext: window.__stratProbe.contexts.at(-1) === refs.context,
          oldWorkletRemoved: !bridge.surface.audioEngine.worklets.has(refs.oldHandle),
          oldPortHandlerReleased: refs.oldPort?.onmessage === null,
          materialRevision: model.materialStratigraphy.revision,
          bridgeMaterialRevision: bridge.surface.materialRevision,
          plateIds: model.trailPlateBirth.getPlates().map(plate => plate.id) };
      });
      await page.locator('[data-action="ant-audio"]').click();
      await page.waitForFunction(() => {
        const bridge = window.__stratEvidence.app.lab.model.audioBridge;
        return bridge.enabled && !bridge.loading && bridge.worklet;
      }, null, { timeout: 15000 });
      await page.evaluate(() => {
        const bridge = window.__stratEvidence.app.lab.model.audioBridge;
        const entry = window.__stratProbe.worklets.at(-1);
        bridge.surface.post('diagnostics');
        window.__stratEvidence.lifecycleRefs.newEntry = entry;
      });
      await page.waitForFunction(() => window.__stratEvidence.lifecycleRefs.newEntry.messages
        .some(message => message.data?.type === 'diagnostics'), null, { timeout: 5000 });
      const noReplay = await page.evaluate(() => {
        const { app } = window.__stratEvidence, model = app.lab.model, bridge = model.audioBridge;
        const refs = window.__stratEvidence.lifecycleRefs;
        const diagnostic = refs.newEntry.messages.filter(message => message.data?.type === 'diagnostics').at(-1)?.data?.payload || null;
        return { audioEnabled: bridge.enabled, contextCount: window.__stratProbe.contexts.length,
          sameContext: window.__stratProbe.contexts.at(-1) === refs.context,
          newWorklet: refs.newEntry.node === bridge.surface.worklet?.node,
          newWorkletName: refs.newEntry.name, outputChannelCount: refs.newEntry.outputChannelCount,
          volume: bridge.volume, outputGain: bridge.worklet?.gainNode?.gain?.value ?? null,
          materialRevision: model.materialStratigraphy.revision,
          bridgeMaterialRevision: bridge.surface.materialRevision,
          plateIds: model.trailPlateBirth.getPlates().map(plate => plate.id),
          diagnostics: diagnostic, eventCountBeforeResume: window.__stratEvidence.events.length };
      });
      await page.evaluate(() => { window.__stratEvidence.app.lab.model.update = window.__stratEvidence.app.lab.model.__stratigraphyOriginalUpdate; });
      await page.waitForTimeout(1000);
      await page.evaluate(() => {
        const model = window.__stratEvidence.app.lab.model;
        model.update = () => false;
        model.audioBridge.surface.post('diagnostics');
      });
      await page.waitForFunction(() => window.__stratEvidence.lifecycleRefs.newEntry.messages
        .filter(message => message.data?.type === 'diagnostics').length >= 2, null, { timeout: 5000 });
      const afterResume = await page.evaluate(() => {
        const refs = window.__stratEvidence.lifecycleRefs;
        const events = window.__stratEvidence.events.slice(refs.eventCursor);
        const diagnostics = refs.newEntry.messages.filter(message => message.data?.type === 'diagnostics').at(-1)?.data?.payload || null;
        return { simulationTimeMs: window.__stratEvidence.app.lab.model.simulationTimeMs,
          newFootContactGroups: events.filter(event => event.type === 'FOOT_CONTACT').length,
          newIndividualFootContacts: events.filter(event => event.type === 'FOOT_CONTACT')
            .reduce((sum, event) => sum + (event.payload?.contacts?.length || 0), 0),
          newContactEvents: events, diagnostics };
      });
      const lifecycle = { before: beforeLifecycle, afterOff, afterOnBeforeResume: noReplay, afterResume,
        checks: { pausedAtEnd: Math.abs(beforeLifecycle.simulationTimeMs - finalBrowser.simulationEndMs) < 1,
          sameContextAcrossToggle: afterOff.sameContext && noReplay.sameContext && noReplay.contextCount === beforeLifecycle.contextCount,
          historyPreserved: JSON.stringify(beforeLifecycle.plateIds) === JSON.stringify(afterOff.plateIds)
            && JSON.stringify(beforeLifecycle.plateIds) === JSON.stringify(noReplay.plateIds)
            && beforeLifecycle.materialRevision === afterOff.materialRevision
            && beforeLifecycle.materialRevision === noReplay.materialRevision
            && beforeLifecycle.bridgeMaterialRevision === afterOff.bridgeMaterialRevision
            && beforeLifecycle.bridgeMaterialRevision === noReplay.bridgeMaterialRevision,
          oldWorkletReleased: afterOff.oldWorkletRemoved && afterOff.oldPortHandlerReleased,
          freshWorkletHasNoHistoricalReplay: noReplay.newWorklet && noReplay.diagnostics?.strikes === 0
            && noReplay.diagnostics?.activeNodes === 0,
          freshContactsOnlyAfterResume: afterResume.newFootContactGroups > 0,
          freshWorkletStrikeCount: afterResume.diagnostics?.strikes ?? null } };
      await writeFile(lifecyclePath, JSON.stringify(lifecycle, null, 2));
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
      const runExecFile = promisify(execFile);
      const wavPath = resolve(outDir, `${name}.wav`);
      const ffmpegResult = await runExecFile(ffmpegPath, ['-y', '-i', audioWebmPath, '-map', '0:a:0', '-vn',
        '-ac', '2', '-ar', String(finalBrowser.sampleRate || setup.sampleRate), '-c:a', 'pcm_f32le', wavPath],
      { maxBuffer: 8 * 1024 * 1024 });
      const wavBytes = await readFile(wavPath);
      const wavHeader = { riff: wavBytes.toString('ascii', 0, 4), wave: wavBytes.toString('ascii', 8, 12),
        formatTag: wavBytes.readUInt16LE(20), channels: wavBytes.readUInt16LE(22), sampleRate: wavBytes.readUInt32LE(24),
        bitsPerSample: wavBytes.readUInt16LE(34), bytes: wavBytes.length };
      await writeFile(sidecarPath, JSON.stringify({ status: finalBrowser.simulationEndMs >= targetSeconds * 1000 ? 'completed' : 'watchdog-stopped',
        seed, targetSimulationTimeMs: targetSeconds * 1000, setup, startState, end: finalBrowser,
        simulationDurationSeconds: (finalBrowser.simulationEndMs - finalBrowser.simulationStartMs) / 1000,
        wallDurationSeconds: finalBrowser.wallDurationMs / 1000,
        clockAnchorIntervalMs: 250,
        browserSampleRate: finalBrowser.sampleRate, wav: { path: `${name}.wav`, header: wavHeader,
          ffmpeg: `${ffmpegPath} ... -c:a pcm_f32le`, conversionStdout: ffmpegResult.stdout.trim() },
        clockAnchors: anchors, events, timeline,
        eventCounts,
        provenance: { simulation: 'Real system Chrome requestAnimationFrame from time zero; seeded RNG and original ANT defaults; no hand-placed agents, material, or contact events.',
          capture: `Audio and canvas video MediaRecorders started together and stopped by an in-page browser timer when model.simulationTimeMs reached ${targetSeconds * 1000}; ${watchdogSeconds}s wall watchdog.`,
          audio: 'Float32 stereo WAV decoded from actual WebM audio captured as a parallel tap on the selected final gain; gain and original output path remained unchanged.',
          clockMap: 'Browser anchors are sampled by a 250 ms timer and map model simulationTimeMs to AudioContext sample index; exact FOOT_CONTACT event timestamps use gait payload simulationTimeMs.',
          limit: 'Audio timing anchors include codec/recorder offset uncertainty; raw PCM is actual recorded signal with no synthesis or stitching.' } }, null, 2));
      return { sidecarPath, browserEvidencePath, lifecyclePath, audioWebmPath, videoPath, wavPath,
        status: finalBrowser.simulationEndMs >= targetSeconds * 1000 ? 'completed' : 'watchdog-stopped' };
    } finally { await context.close(); }
  }

  if (process.argv.includes('--continuous-smoke')) {
    await recordContinuousRun({ targetSeconds: 5, watchdogSeconds: 30, name: 'continuous-transport-smoke' });
    console.log(`Continuous transport smoke saved to ${outDir}`);
  } else if (process.argv.includes('--continuous')) {
    await recordContinuousRun();
    console.log(`Continuous stratigraphy capture saved to ${outDir}`);
  } else if (process.argv.includes('--smoke')) {
    const smoke = await openDefault();
    try {
      await advance(smoke.page, 2);
      const state = await readState(smoke.page);
      assert.ok(Number.isFinite(state.simulationTimeMs));
      assert.ok(Number.isFinite(state.layerCount));
      assert.equal(state.nodules.length, 0, 'no natural nodule should be synthesized during smoke setup');
      await smoke.page.locator('#ant-volume').evaluate(slider => {
        slider.value = '35'; slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await smoke.page.locator('[data-action="ant-audio"]').click();
      await smoke.page.waitForFunction(() => {
        const bridge = window.__stratEvidence.app.lab.model.audioBridge;
        return bridge?.enabled && !bridge.loading && bridge.worklet;
      }, null, { timeout: 15000 });
      const audioSmoke = await smoke.page.evaluate(() => {
        const model = window.__stratEvidence.app.lab.model;
        const bridge = model.audioBridge;
        return { name: bridge.worklet?.node?.constructor?.name || null,
          outputChannels: window.__stratProbe.worklets.at(-1)?.outputChannelCount || null,
          gain: bridge.worklet?.gainNode?.gain?.value ?? null,
          contextCount: window.__stratProbe.contexts.length,
          layerCount: model.getSnapshot().stratigraphy.layers?.plateCount ?? null };
      });
      assert.deepEqual(audioSmoke.outputChannels, [2]);
      assert.equal(audioSmoke.contextCount, 1);
      await smoke.page.screenshot({ path: resolve(outDir, 'harness-smoke-ant.png'), fullPage: true });
      await writeFile(resolve(outDir, 'harness-smoke.json'), JSON.stringify({ seed, state, audioSmoke,
        status: 'passed', note: 'Short default ANT browser smoke only; no milestone recording or event injection.' }, null, 2));
      await smoke.page.locator('[data-action="ant-audio"]').click();
      console.log(`Harness smoke passed: ${outDir}`);
    } finally { await smoke.context.close(); }
  } else {
  // Calibration discovers milestones without forcing a material event. It is saved
  // even if no nodule or large population appears during the bounded observation.
  const calibration = await openDefault();
  const milestoneRows = [];
  try {
    let prevPlates = 0, prevNodules = 0, prevPopulation = 0;
    for (let second = 0; second <= 600; second += 1) {
      if (second > 0) await advance(calibration.page, 1);
      const s = await readState(calibration.page);
      if (s.plateCount !== prevPlates || s.nodules.length !== prevNodules || s.population !== prevPopulation
        || second === 0 || second % 30 === 0) {
        milestoneRows.push({ second: s.simulationTimeMs / 1000, population: s.population,
          spawned: s.totalSpawned, retired: s.totalRetired, activation: s.activation?.activation ?? null,
          plates: s.plateCount, layers: s.layerCount, nodules: s.nodules.length,
          surfaceMass: s.field.totalMass, maxSurface: s.field.maxValue,
          finiteSurfaceCells: s.field.finite?.count, surfaceNonFinite: s.field.finite?.nonFinite });
        prevPlates = s.plateCount; prevNodules = s.nodules.length; prevPopulation = s.population;
      }
    }
    const end = await readState(calibration.page);
    await writeFile(resolve(outDir, 'natural-milestone-discovery.json'), JSON.stringify({ seed,
      calibrationLimitSeconds: 600, finalState: end, milestones: milestoneRows,
      events: await calibration.page.evaluate(() => ({ plates: window.__stratEvidence.birthEvents.map(e => ({ timeMs: e.timeMs, id: e.descriptor?.id })),
        nodules: window.__stratEvidence.events })),
      provenance: 'Direct normal-step AntController ticks on unmodified defaults and deterministic injected RNG. Milestones are observations only.' }, null, 2));
  } finally { await calibration.context.close(); }

  const observed = milestoneRows;
  const firstPlate = observed.find(row => row.plates > 0)?.second ?? null;
  const firstMultiPlate = observed.find(row => row.plates > 1)?.second ?? null;
  const firstNodule = observed.find(row => row.nodules > 0)?.second ?? null;
  const firstPlate24 = observed.find(row => row.plates >= 24)?.second ?? null;
  const matureSingleTarget = firstPlate !== null
    && (firstMultiPlate === null || firstMultiPlate > firstPlate + 50) ? firstPlate + 30 : null;
  const targetCandidates = [
    { target: 0, name: 'prebirth-natural-default', label: 'Pre-birth default ANT' },
    firstPlate === null ? null : { target: firstPlate + 0.1, name: 'first-natural-surface', label: 'First natural plate' },
    matureSingleTarget === null ? null : { target: matureSingleTarget, name: 'mature-single-natural-surface',
      label: 'First plate age 30 s; check remains single in recorded window' },
    firstMultiPlate === null ? null : { target: firstMultiPlate + 0.1, name: 'first-natural-multilayer',
      label: 'First natural multi-plate material' },
    { target: 300, name: 'developed-300s', label: 'Natural default at 300 s' },
    { target: 600, name: 'depth-600s', label: 'Natural default at 600 s' },
    firstNodule === null ? null : { target: firstNodule + 0.1, name: 'first-natural-nodule', label: 'First natural nodule' },
    firstPlate24 === null ? null : { target: firstPlate24 + 0.1, name: 'natural-plate-24plus', label: 'At least 24 natural material plates' }
  ].filter(Boolean);
  // Keep distinct checkpoints, and avoid describing a later multi-layer state as a
  // single-layer sample. Exact natural milestones are retained in the discovery log.
  const uniqueTargets = [];
  for (const candidate of targetCandidates) {
    if (!uniqueTargets.some(existing => Math.abs(existing.target - candidate.target) < 3)) uniqueTargets.push(candidate);
  }
  const results = [];
  for (const candidate of uniqueTargets) {
    const run = await openDefault();
    try {
      if (candidate.target > 0) await advance(run.page, candidate.target);
      results.push(await recordClip({ page: run.page, ...candidate, targetSeconds: candidate.target }));
    } finally { await run.context.close(); }
  }

  if (results.length) {
    const comparisonRows = [];
    for (const item of results.slice(0, STRATIGRAPHY_AUDIO_PRESET.comparisonMaxRows)) {
      const audio = await (await import('node:fs/promises')).readFile(resolve(outDir, item.artifacts.audio));
      comparisonRows.push({ label: item.label, audioBase64: audio.toString('base64') });
    }
    // Renderer is exercised in the browser for a native PNG canvas output.
    const comparePage = await browser.newPage();
    try {
      await comparePage.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
      const png = await comparePage.evaluate(async rows => {
        const { buildStratigraphyAudioSnapshot, renderStratigraphyAudioComparison } = await import('/scripts/audio-snapshot-renderer.js');
        const audioContext = new AudioContext();
        const snapshots = [];
        for (const row of rows) {
          const bytes = Uint8Array.from(atob(row.audioBase64), char => char.charCodeAt(0));
          const buffer = await audioContext.decodeAudioData(bytes.buffer);
          snapshots.push({ label: row.label, snapshot: buildStratigraphyAudioSnapshot({
            left: buffer.getChannelData(0), right: buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1)) },
          { sampleRate: buffer.sampleRate, sourceDurationSeconds: buffer.duration }) });
        }
        await audioContext.close();
        const canvas = document.createElement('canvas'); renderStratigraphyAudioComparison(canvas, snapshots);
        return canvas.toDataURL('image/png').split(',')[1];
      }, comparisonRows);
      await writeFile(resolve(outDir, 'natural-audio-comparison.png'), Buffer.from(png, 'base64'));
    } finally { await comparePage.close(); }
  }

  // Re-decode the untouched historical 10-second control with the fixed 10-second renderer.
  const historicalPath = resolve('docs/ant/evidence/2026-10-05-surface-plates/bornsurface-mature-single.webm');
  try {
    const historicalBytes = await (await import('node:fs/promises')).readFile(historicalPath);
    const historicalMetaPath = historicalPath.replace(/\.webm$/i, '.json');
    let oldMetadata = null;
    try { oldMetadata = JSON.parse(await (await import('node:fs/promises')).readFile(historicalMetaPath, 'utf8')); } catch { /* old metadata may be unavailable */ }
    const currentReference = results.find(item => item.clipName === 'first-natural-surface') || results.find(item => item.clipName !== 'prebirth-natural-default');
    const currentAudioBase64 = currentReference
      ? (await (await import('node:fs/promises')).readFile(resolve(outDir, currentReference.artifacts.audio))).toString('base64') : null;
    const historyPage = await browser.newPage();
    try {
      await historyPage.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
      const rendered = await historyPage.evaluate(async base64 => {
        const { buildStratigraphyAudioSnapshot, renderStratigraphyAudioSnapshot } = await import('/scripts/audio-snapshot-renderer.js');
        const context = new AudioContext();
        const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
        const decoded = await context.decodeAudioData(bytes.buffer);
        const snapshot = buildStratigraphyAudioSnapshot({ left: decoded.getChannelData(0),
          right: decoded.getChannelData(Math.min(1, decoded.numberOfChannels - 1)) },
        { sampleRate: decoded.sampleRate, sourceDurationSeconds: decoded.duration });
        const canvas = document.createElement('canvas'); renderStratigraphyAudioSnapshot(canvas, snapshot);
        await context.close();
        return { png: canvas.toDataURL('image/png').split(',')[1], sampleRate: decoded.sampleRate,
          durationSeconds: decoded.duration, channels: decoded.numberOfChannels,
          paddingSeconds: snapshot.paddingSeconds, preset: snapshot.rendering };
      }, historicalBytes.toString('base64'));
      const pngName = 'historical-mature-single-10s-audio-analysis.png';
      const metaName = 'historical-mature-single-10s-audio-analysis.json';
      await writeFile(resolve(outDir, pngName), Buffer.from(rendered.png, 'base64'));
      let comparisonName = null;
      if (currentAudioBase64) {
        const comparisonPng = await historyPage.evaluate(async ({ historyBase64, currentBase64, currentLabel }) => {
          const { buildStratigraphyAudioSnapshot, renderStratigraphyAudioComparison } = await import('/scripts/audio-snapshot-renderer.js');
          const context = new AudioContext();
          const decode = async base64 => {
            const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
            const buffer = await context.decodeAudioData(bytes.buffer);
            return buildStratigraphyAudioSnapshot({ left: buffer.getChannelData(0),
              right: buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1)) },
            { sampleRate: buffer.sampleRate, sourceDurationSeconds: buffer.duration });
          };
          const rows = [
            { label: 'Historical mature-single · 10 s source', snapshot: await decode(historyBase64) },
            { label: `${currentLabel} · first 10 s of 20 s recording`, snapshot: await decode(currentBase64) }
          ];
          await context.close();
          const canvas = document.createElement('canvas'); renderStratigraphyAudioComparison(canvas, rows);
          return canvas.toDataURL('image/png').split(',')[1];
        }, { historyBase64: historicalBytes.toString('base64'), currentBase64, currentLabel: currentReference.label });
        comparisonName = 'historical-vs-first-natural-surface-fixed-comparison.png';
        await writeFile(resolve(outDir, comparisonName), Buffer.from(comparisonPng, 'base64'));
      }
      await writeFile(resolve(outDir, metaName), JSON.stringify({ label: 'Historical mature-single 10-second control; re-decoded and padded for the locked comparison preset',
        sourceArtifact: historicalPath.replaceAll('\\', '/'), sourceMetadata: oldMetadata,
        decoded: { sampleRate: rendered.sampleRate, channels: rendered.channels,
          sourceDurationSeconds: rendered.durationSeconds, includedDurationSeconds: Math.min(STRATIGRAPHY_AUDIO_PRESET.durationSeconds, rendered.durationSeconds),
          explicitZeroPaddingSeconds: rendered.paddingSeconds },
        artifact: pngName, comparisonArtifact: comparisonName,
        comparisonCurrentClip: currentReference ? { name: currentReference.clipName, label: currentReference.label,
          sourceArtifact: currentReference.artifacts.audio, durationSeconds: currentReference.media.decodedAudioDurationSeconds } : null,
        preset: rendered.preset,
        provenance: 'Historical WebM was read only and not overwritten. New PNG is a fresh decode and fixed-scale 10-second render.' }, null, 2));
    } finally { await historyPage.close(); }
  } catch (error) {
    await writeFile(resolve(outDir, 'historical-baseline-unavailable.json'), JSON.stringify({ sourceArtifact: historicalPath,
      reason: String(error?.message || error) }, null, 2));
  }

  await writeFile(resolve(outDir, 'run-summary.json'), JSON.stringify({ seed, runId, outDir,
    clipSeconds, volume, preset: STRATIGRAPHY_AUDIO_PRESET, calibrationLimitSeconds: 600,
    observations: milestoneRows, capturedClips: results.map(result => ({ name: result.clipName,
      label: result.label, simulation: result.simulation, material: { plateCountStart: result.material.plateCountStart,
        plateCountEnd: result.material.plateCountEnd, layersStart: result.material.layersStart?.length,
        layersEnd: result.material.layersEnd?.length, nodulesStart: result.material.nodulesStart?.length,
        nodulesEnd: result.material.nodulesEnd?.length }, media: result.media })),
    limitations: { nodules: firstNodule === null ? 'No natural nodule observed within the 600-second calibration limit; no nodule clip fabricated.' : 'Natural event captured.',
      materialPlate24: firstPlate24 === null ? 'Material plate count did not naturally reach 24 within the 600-second calibration limit.' : 'Natural 24-plate material milestone observed.',
      crossEngine: 'Chrome timing is a separate environment observation from Node/controller-only evidence; do not assume identical birth times across engines.' } }, null, 2));
  console.log(`Stratigraphy motion evidence saved to ${outDir}`);
  }
} finally {
  await browser?.close();
  await server.close();
}
