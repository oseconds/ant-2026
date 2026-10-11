import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { buildAudioSnapshot, renderAudioSnapshot } from './audio-snapshot-renderer.js';

const seed = 20261005;
const recordSeconds = 10;
const volumePercent = 35;
const stepSeconds = 1 / 60;
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = resolve('test-results', `surface-pass-${runId}`);
await mkdir(outDir, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const port = server.httpServer.address()?.port;
  assert.ok(port, 'Vite should bind to a local port');
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });

  async function openModel(mode) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.addInitScript(({ initialSeed }) => {
      let value = initialSeed >>> 0;
      Math.random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 0x100000000; };
      window.__surfaceProbe = { contexts: [], worklets: [], processorErrors: [], graph: [] };
      const OriginalContext = window.AudioContext;
      window.AudioContext = class extends OriginalContext {
        constructor(...args) { super(...args); window.__surfaceProbe.contexts.push(this); }
      };
      const OriginalWorklet = window.AudioWorkletNode;
      window.AudioWorkletNode = class extends OriginalWorklet {
        constructor(context, name, options) {
          super(context, name, options);
          const entry = { name, outputChannelCount: options?.outputChannelCount || null, messages: [], node: this };
          this.port.addEventListener('message', event => entry.messages.push({ at: performance.now(), data: event.data }));
          this.port.start();
          this.addEventListener('processorerror', event => window.__surfaceProbe.processorErrors.push({ name, message: event.message || '' }));
          window.__surfaceProbe.worklets.push(entry);
        }
      };
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function(destination, ...args) {
        window.__surfaceProbe.graph.push({ from: this.constructor?.name, to: destination?.constructor?.name, time: performance.now() });
        return connect.call(this, destination, ...args);
      };
    }, { initialSeed: seed });
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
    await page.evaluate(async (audioMode) => {
      const { app } = await import('/src/main.js');
      await app.ready;
      const [{ AntController }, { AntEnvironmentAudioBridge }] = await Promise.all([
        import('/src/lib/agents/ant/AntController.js'), import('/src/lib/audio/AntEnvironmentAudioBridge.js')
      ]);
      let rng = 20261005 >>> 0;
      const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 0x100000000; };
      app.lab.registry.ant = options => new AntController({ ...options, materialLocomotionResistance: false, random,
        audioBridge: new AntEnvironmentAudioBridge({ audioEngine: options.audioEngine, workletBaseUrl: options.workletBaseUrl }) });
      await app.selectModel('ant');
      window.__surfaceEvidence = { app, contacts: [], births: [], updates: [], rngSeed: 20261005 };
      const model = app.lab.model;
      model.configure({ audioExperiment: { mode: audioMode } });
      const realUpdate = model.update.bind(model);
      model.__surfacePerf = { calls: 0, totalMs: 0, maxMs: 0, clipMaxMs: 0 };
      model.__surfaceOriginalUpdate = (timestamp) => {
        const start = performance.now();
        const result = realUpdate(timestamp);
        const elapsed = performance.now() - start;
        model.__surfacePerf.calls += 1; model.__surfacePerf.totalMs += elapsed;
        model.__surfacePerf.maxMs = Math.max(model.__surfacePerf.maxMs, elapsed);
        model.__surfacePerf.clipMaxMs = Math.max(model.__surfacePerf.clipMaxMs, elapsed);
        return result;
      };
      model.update = () => false;
      model.subscribe(event => {
        if (event.type === 'foot-contact') window.__surfaceEvidence.contacts.push({ time: model.simulationTimeMs, payload: event.payload });
        if (event.type === 'plate-birth') {
          window.__surfaceEvidence.births.push({ time: model.simulationTimeMs, payload: event.payload });
          if (!window.__surfaceEvidence.birthDebugSample) {
            const candidate = model.trailPlateBirth.candidate;
            window.__surfaceEvidence.birthDebugSample = {
              timeMs: model.simulationTimeMs,
              snapshot: model.getSnapshot(),
              candidate: candidate ? { ...candidate, mask: candidate.mask?.slice(),
                skeletonIndices: candidate.skeletonIndices?.slice(), path: candidate.path?.slice() } : null,
              plate: event.payload
            };
          }
        }
      });
      const slider = document.querySelector('#ant-volume');
      if (slider) { slider.value = '35'; slider.dispatchEvent(new Event('input', { bubbles: true })); slider.dispatchEvent(new Event('change', { bubbles: true })); }
    }, mode);
    await page.waitForSelector('#simulation-canvas');
    return { page, context };
  }

  async function tickPage(page, seconds) {
    const count = Math.round(seconds / stepSeconds);
    for (let start = 0; start < count; start += 120) {
      await page.evaluate((batch) => {
        const model = window.__surfaceEvidence.app.lab.model;
        for (let i = 0; i < batch; i += 1) model.tick(1 / 60);
        model.emit('update');
      }, Math.min(120, count - start));
      await page.waitForTimeout(0);
    }
  }

  async function state(page) {
    return page.evaluate(() => {
      const { app, contacts, births } = window.__surfaceEvidence;
      const model = app.lab.model;
      const snapshot = model.getSnapshot();
      const plates = model.trailPlateBirth?.getPlates?.() || [];
      const bridge = model.audioBridge;
      const audioWorklet = bridge?.worklet;
      const ages = plates.map(plate => (snapshot.analysis.simulationTimeMs - plate.bornAtSimulationTimeMs) / 1000);
      const hashFloat32 = values => {
        if (!values?.buffer || values.length === undefined) return null;
        const bytes = new Uint8Array(values.buffer, values.byteOffset || 0, values.byteLength);
        let hash = 2166136261;
        for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 16777619) >>> 0; }
        return hash.toString(16).padStart(8, '0');
      };
      return {
        simulationTimeMs: snapshot.analysis.simulationTimeMs,
        population: snapshot.analysis.population,
        activeAnts: snapshot.agents.length,
        activation: snapshot.analysis.colonyActivation,
        surface: { width: snapshot.surface?.width, height: snapshot.surface?.height,
          totalMass: snapshot.surface?.totalMass, maxValue: snapshot.surface?.maxValue,
          totalFootContacts: snapshot.surface?.totalFootContacts },
        pheromoneMass: snapshot.pheromone?.totalMass ?? snapshot.analysis.pheromoneMass,
        pheromoneHash: hashFloat32(snapshot.pheromone?.values), surfaceHash: hashFloat32(snapshot.surface?.values),
        plates: plates.map(p => p), plateAgesSeconds: ages,
        footContactEvents: contacts.length, birthEvents: births.length,
        diagnostics: bridge?.surface?.diagnostics || bridge?.legacy?.diagnostics || {},
        workletName: window.__surfaceProbe.worklets.at(-1)?.name || null,
        outputChannelCount: window.__surfaceProbe.worklets.at(-1)?.outputChannelCount || null,
        finalGain: audioWorklet?.gainNode?.gain?.value ?? null,
        volume: bridge?.volume ?? null,
        contextState: window.__surfaceProbe.contexts.at(-1)?.state || 'not-created',
        ants: snapshot.agents.map(ant => ({ id: ant.id, x: ant.x, y: ant.y, vx: ant.vx, vy: ant.vy,
          heading: ant.heading, trailAdherence: ant.trailAdherence,
          gait: ant.gait && { strideDistance: ant.gait.strideDistance, phase: ant.gait.phase,
            contacts: ant.gait.legs?.map(leg => ({ id: leg.id, contact: leg.contact, phase: leg.phase })) },
          bodyPose: ant.bodyPose }))
      };
    });
  }

  async function captureBirthDebug(page, name) {
    const result = await page.evaluate(() => {
      const model = window.__surfaceEvidence.app.lab.model;
      const birthSample = window.__surfaceEvidence.birthDebugSample;
      const snapshot = birthSample?.snapshot || model.getSnapshot();
      const plate = birthSample?.plate || model.trailPlateBirth.getPlates().at(-1);
      const candidate = birthSample?.candidate || model.trailPlateBirth.candidate;
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 440;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      const panels = [
        { x: 20, title: 'Pheromone · raw field, grayscale scaled to snapshot maximum', data: snapshot.pheromone.values, max: snapshot.pheromone.maxValue },
        { x: 410, title: 'SurfaceField · support grid at natural birth', data: snapshot.surface.values, max: snapshot.surface.maxValue },
        { x: 800, title: 'Candidate + frozen plate · 96×96', data: null }
      ];
      for (const panel of panels) {
        context.fillStyle = '#222'; context.font = '13px sans-serif'; context.fillText(panel.title, panel.x, 18);
        const side = 360, cell = side / 96, top = 38;
        context.fillStyle = '#fafafa'; context.fillRect(panel.x, top, side, side);
        if (panel.data) {
          const values = panel.data;
          for (let index = 0; index < values.length; index += 1) {
            const value = Number(values[index]) || 0;
            if (value <= 0) continue;
            const gray = Math.round(255 * (1 - Math.max(0, Math.min(1, value / (panel.max || 1)))));
            context.fillStyle = `rgb(${gray},${gray},${gray})`;
            context.fillRect(panel.x + (index % 96) * cell, top + Math.floor(index / 96) * cell, Math.ceil(cell), Math.ceil(cell));
          }
        }
        if (panel.x === 800) {
          const candidateMask = candidate?.mask || [];
          const frozenMask = plate?.mask || [];
          for (let index = 0; index < 96 * 96; index += 1) {
            if (candidateMask[index]) {
              context.fillStyle = 'rgba(255,145,0,.38)';
              context.fillRect(panel.x + (index % 96) * cell, top + Math.floor(index / 96) * cell, Math.ceil(cell), Math.ceil(cell));
            }
            if (frozenMask[index]) {
              context.fillStyle = 'rgba(0,90,210,.52)';
              context.fillRect(panel.x + (index % 96) * cell, top + Math.floor(index / 96) * cell, Math.ceil(cell), Math.ceil(cell));
            }
          }
          const skeleton = candidate?.skeletonIndices || candidate?.path || plate?.principalPath || [];
          context.fillStyle = '#9c1212';
          for (const index of skeleton) {
            const x = panel.x + (index % 96 + .5) * cell;
            const y = top + (Math.floor(index / 96) + .5) * cell;
            context.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
          }
          context.fillStyle = '#111';
          for (const pickup of plate?.pickups || []) {
            const x = panel.x + pickup.x * side, y = top + pickup.y * side;
            context.beginPath(); context.arc(x, y, 7, 0, Math.PI * 2); context.fill();
            context.fillStyle = '#fff'; context.font = '10px sans-serif'; context.fillText('P', x - 3, y + 3); context.fillStyle = '#111';
          }
          context.fillStyle = '#222'; context.font = '11px sans-serif';
          context.fillText('candidate orange · frozen plate blue · skeleton red · pickups black', panel.x, 418);
        }
      }
      return { png: canvas.toDataURL('image/png').split(',')[1], timeMs: birthSample?.timeMs ?? snapshot.analysis.simulationTimeMs,
        candidateCells: candidate?.mask?.reduce?.((a, value) => a + (value ? 1 : 0), 0) || 0,
        frozenCells: plate?.mask?.reduce?.((a, value) => a + (value ? 1 : 0), 0) || 0,
        candidateSkeletonPoints: candidate?.skeletonIndices?.length || candidate?.path?.length || 0,
        pickups: plate?.pickups || [] };
    });
    const file = `${name}-birth-debug.png`;
    await writeFile(resolve(outDir, file), Buffer.from(result.png, 'base64'));
    return { file, simulationTimeMs: result.timeMs, candidateCells: result.candidateCells,
      frozenCells: result.frozenCells, candidateSkeletonPoints: result.candidateSkeletonPoints, pickups: result.pickups,
      visualization: 'QA diagnostic only: pheromone and surface normalized independently to their snapshot maxima; candidate orange, frozen plate blue, skeleton red, pickups black' };
  }

  async function enableAudio(page) {
    await page.locator('[data-action="ant-audio"]').click();
    await page.waitForFunction(() => {
      const model = window.__surfaceEvidence?.app?.lab?.model;
      return model?.audioBridge?.enabled === true && !model.audioBridge.loading;
    }, null, { timeout: 12000 });
    await page.waitForTimeout(120);
  }

  async function recordClip({ name, mode, prepSeconds, expectBirth = 'any', expectedSilence = false }) {
    const { page, context } = await openModel(mode);
    let partial = { label: name, mode, seed: `0x${seed.toString(16)}`, status: 'preparing', preparationSimulationSeconds: prepSeconds };
    let clipMetadata = null;
    try {
      if (prepSeconds > 0) await tickPage(page, prepSeconds);
      const pre = await state(page);
      partial = { ...partial, status: 'ready', stateAtStart: pre, recordingTargetSeconds: recordSeconds, volumePercent };
      await writeFile(resolve(outDir, `${name}.json`), JSON.stringify(partial, null, 2));
      assert.equal(await page.locator('#ant-volume').inputValue(), String(volumePercent));
      await enableAudio(page);
      // Capture the populated Audio-On UI before starting MediaRecorder so a large scene
      // cannot stretch the measured recording window while Chromium rasterizes the screenshot.
      await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage: true });
      const started = await page.evaluate((durationSeconds) => {
        const model = window.__surfaceEvidence.app.lab.model;
        const bridge = model.audioBridge;
        model.update = model.__surfaceOriginalUpdate;
        const node = bridge.worklet;
        const gain = node?.gainNode;
        const audioContext = window.__surfaceProbe.contexts.at(-1);
        if (!gain || !audioContext) throw new Error('Audio On should create the selected worklet and shared context');
        const destination = audioContext.createMediaStreamDestination();
        gain.connect(destination);
        const channels = audioContext.createChannelSplitter(2);
        gain.connect(channels);
        const analyserL = audioContext.createAnalyser(), analyserR = audioContext.createAnalyser();
        channels.connect(analyserL, 0); channels.connect(analyserR, 1);
        const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' });
        model.__surfacePerf.clipMaxMs = 0;
        const chunks = [];
        recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
        recorder.start(100);
        window.__surfaceEvidence.capture = { recorder, chunks, destination, analyserL, analyserR, gain, audioContext,
          startedAt: performance.now(), contactStart: window.__surfaceEvidence.contacts.length,
          diagnosticsAtStart: { ...(bridge.surface?.diagnostics || bridge.legacy?.diagnostics || {}) },
          perfAtStart: { calls: model.__surfacePerf.calls, totalMs: model.__surfacePerf.totalMs } };
        const capture = window.__surfaceEvidence.capture;
        capture.stopped = new Promise(resolve => recorder.addEventListener('stop', () => {
          capture.stoppedAt = performance.now();
          capture.simulationTimeMsAtStop = model.simulationTimeMs;
          model.update = () => false;
          resolve();
        }, { once: true }));
        // Bound the recording in Chrome itself; controller polling or Node serialization
        // must not delay the end of this common-duration acoustic window.
        setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, durationSeconds * 1000);
        return { at: performance.now(), simulationTimeMs: model.simulationTimeMs, contextState: audioContext.state,
          sampleRate: audioContext.sampleRate, recorderMimeType: recorder.mimeType,
          contextCount: window.__surfaceProbe.contexts.length,
          diagnosticsAtStart: { ...(bridge.surface?.diagnostics || bridge.legacy?.diagnostics || {}) },
          originalDestinationConnections: window.__surfaceProbe.graph.filter(edge => edge.from === gain.constructor.name && edge.to === 'AudioDestinationNode').length,
          finalGain: gain.gain.value, volume: bridge.volume,
          };
      }, recordSeconds);
      partial = { ...partial, status: 'recording', recordingStarted: started };
      await writeFile(resolve(outDir, `${name}.json`), JSON.stringify(partial, null, 2));
      const samples = [];
      const sampleTimer = setInterval(async () => {
        try {
          const compact = await page.evaluate(() => {
            const model = window.__surfaceEvidence.app.lab.model;
            const activation = model.colonyActivation.getSnapshot();
            return { simulationTimeMs: model.simulationTimeMs, activeAnts: model.agents.length,
              population: model.agents.length, activation,
              plateCount: model.trailPlateBirth.getPlates().length };
          });
          samples.push({ wallMs: Date.now(), ...compact });
        } catch { /* teardown race only */ }
      }, 250);
      await page.waitForTimeout(recordSeconds * 1000);
      clearInterval(sampleTimer);
      const recorded = await page.evaluate(async () => {
        const capture = window.__surfaceEvidence.capture;
        const { recorder, chunks, audioContext, analyserL, analyserR, gain, contactStart } = capture;
        await capture.stopped;
        const recorderStoppedAt = capture.stoppedAt;
        const modelAtStop = window.__surfaceEvidence.app.lab.model;
        const simulationTimeMsAtStop = capture.simulationTimeMsAtStop;
        modelAtStop.update = () => false;
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const bytes = await blob.arrayBuffer();
        const decoded = await audioContext.decodeAudioData(bytes.slice(0));
        const count = Math.min(decoded.numberOfChannels, 2);
        const data = Array.from({ length: count }, (_, channel) => Array.from(decoded.getChannelData(channel)));
        const analyserRead = analyser => { const values = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(values); return values; };
        const raw = new Uint8Array(bytes);
        let binary = '';
        for (let index = 0; index < raw.length; index += 0x8000) binary += String.fromCharCode(...raw.subarray(index, Math.min(raw.length, index + 0x8000)));
        const bridge = window.__surfaceEvidence.app.lab.model.audioBridge;
        bridge.surface?.post?.('diagnostics');
        await new Promise(resolve => setTimeout(resolve, 50));
        const diagnostics = bridge.surface?.diagnostics || bridge.legacy?.diagnostics || {};
        const diagnosticsAtStart = capture.diagnosticsAtStart;
        const delta = key => (diagnostics[key] ?? 0) - (diagnosticsAtStart[key] ?? 0);
        const perf = window.__surfaceEvidence.app.lab.model.__surfacePerf;
        return { bytesBase64: btoa(binary), mimeType: recorder.mimeType, wallDurationMs: recorderStoppedAt - capture.startedAt,
          simulationTimeMsAtStop,
          decoded: { sampleRate: decoded.sampleRate,
          channels: decoded.numberOfChannels, length: decoded.length, duration: decoded.duration, data },
          analyserL: Array.from(analyserRead(analyserL)), analyserR: Array.from(analyserRead(analyserR)),
          bridgeDiagnostics: { ...diagnostics }, processorErrors: window.__surfaceProbe.processorErrors,
          worklet: window.__surfaceProbe.worklets.map(item => ({ name: item.name, outputChannelCount: item.outputChannelCount,
            messages: item.messages.map(message => message.data) })),
          gain: gain.gain.value, contextState: audioContext.state,
          simulationTimeMs: window.__surfaceEvidence.app.lab.model.simulationTimeMs,
          contacts: window.__surfaceEvidence.contacts.length,
          contactStart,
          contactFeet: window.__surfaceEvidence.contacts.slice(contactStart)
            .filter(event => event.time <= simulationTimeMsAtStop)
            .reduce((sum, event) => sum + (event.payload?.contacts?.length || 0), 0),
          routedFeet: delta('routedFeet'), routedFootEvents: delta('routedFootEvents'), strikeRoutes: delta('strikeRoutes'),
          dropped: delta('dropped'), queued: diagnostics.queued ?? null,
          processorDiagnostics: bridge.surface?.processorDiagnostics || bridge.legacy?.plate?.worklet?.processorDiagnostics || null,
          realtimeCpuMs: { calls: perf.calls - capture.perfAtStart.calls,
            total: perf.totalMs - capture.perfAtStart.totalMs, maxFrame: perf.clipMaxMs },
          births: window.__surfaceEvidence.births.map(x => ({ timeMs: x.time, descriptor: x.payload?.descriptor || x.payload })),
          finalStateSimulationTimeMs: window.__surfaceEvidence.app.lab.model.simulationTimeMs };
      });
      await writeFile(resolve(outDir, `${name}.webm`), Buffer.from(recorded.bytesBase64, 'base64'));
      const left = recorded.decoded.data[0] || [];
      const right = recorded.decoded.data[1] || [];
      const signalStats = values => {
        let sum = 0, peak = 0, clips = 0, invalid = 0;
        for (const sample of values) { if (!Number.isFinite(sample)) { invalid += 1; continue; }
          sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); if (Math.abs(sample) >= 0.999) clips += 1; }
        return { rms: values.length ? Math.sqrt(sum / values.length) : 0, peak, clippedSamples: clips, nonFiniteSamples: invalid,
          samples: values.length };
      };
      const pcmDiagnostics = values => {
        const windowSamples = Math.max(1, Math.round(recorded.decoded.sampleRate * 0.1));
        const windows = [];
        let longestZeroRun = 0, zeroRun = 0;
        for (let index = 0; index < values.length; index += 1) {
          if (values[index] === 0) { zeroRun += 1; longestZeroRun = Math.max(longestZeroRun, zeroRun); }
          else zeroRun = 0;
        }
        for (let start = 0; start < values.length; start += windowSamples) {
          const end = Math.min(values.length, start + windowSamples);
          let sum = 0;
          for (let index = start; index < end; index += 1) sum += values[index] * values[index];
          windows.push(Math.sqrt(sum / Math.max(1, end - start)));
        }
        return { longestExactZeroRunSamples: longestZeroRun,
          longestExactZeroRunMs: longestZeroRun / recorded.decoded.sampleRate * 1000,
          rmsPer100Ms: windows, rmsPer100MsMin: Math.min(...windows), rmsPer100MsMax: Math.max(...windows) };
      };
      const plotLength = Math.round(recordSeconds * recorded.decoded.sampleRate);
      const combined = Array.from({ length: plotLength }, (_, i) => (((left[i] || 0) + (right[i] || 0)) * 0.5));
      const snapshot = buildAudioSnapshot(combined, { sampleRate: recorded.decoded.sampleRate,
        fftSize: 1024, hopSize: 256, maxFrequencyHz: 8000, minDbfs: -100, maxDbfs: 0 });
      const simpleSnapshot = { ...snapshot,
        waveformLabel: 'mono average of decoded L/R',
        waveform: { ...snapshot.waveform, bins: snapshot.waveform.bins },
        spectrogram: { ...snapshot.spectrogram, dbfs: Array.from(snapshot.spectrogram.dbfs) } };
      const snapshotPng = await page.evaluate(async ({ audioSnapshot }) => {
        const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 600;
        const { renderAudioSnapshot } = await import('/scripts/audio-snapshot-renderer.js');
        renderAudioSnapshot(canvas, audioSnapshot);
        return canvas.toDataURL('image/png').split(',')[1];
      }, { audioSnapshot: simpleSnapshot });
      await writeFile(resolve(outDir, `${name}-waveform-spectrogram.png`), Buffer.from(snapshotPng, 'base64'));
      const post = await state(page);
      assert.ok(started.originalDestinationConnections >= 1, `${name}: original final-gain-to-output connection remains present`);
      assert.ok(Math.abs(recorded.gain - 0.245) < 0.01, `${name}: selected final gain should be 0.7 × 35%`);
      const metadata = {
        label: name, mode, seed: `0x${seed.toString(16)}`, preparation: { simulationSeconds: prepSeconds,
          naturalUnconstrainedTicks: true, audioOffDuringPreparation: true },
        recording: { durationSeconds: recorded.decoded.duration, wallDurationSeconds: recorded.wallDurationMs / 1000, mimeType: recorded.mimeType,
          simulationStartMs: started.simulationTimeMs, simulationEndMs: recorded.simulationTimeMsAtStop,
          activeAntMin: Math.min(...samples.map(s => s.activeAnts), pre.activeAnts, post.activeAnts),
          activeAntMax: Math.max(...samples.map(s => s.activeAnts), pre.activeAnts, post.activeAnts),
          colonyActivationMin: Math.min(...samples.map(s => s.activation?.activation ?? 0), pre.activation?.activation ?? 0, post.activation?.activation ?? 0),
          colonyActivationMax: Math.max(...samples.map(s => s.activation?.activation ?? 0), pre.activation?.activation ?? 0, post.activation?.activation ?? 0),
          volume: volumePercent / 100, finalGain: recorded.gain, sampleRate: recorded.decoded.sampleRate,
          audioContextState: recorded.contextState, workletName: recorded.worklet.at(-1)?.name || null,
          sharedAudioContextCount: started.contextCount,
          workletOutputChannelCount: recorded.worklet.at(-1)?.outputChannelCount || null,
          left: signalStats(left), right: signalStats(right), silence: Math.max(signalStats(left).rms, signalStats(right).rms) < 1e-5,
          pcmStability: { left: pcmDiagnostics(left), right: pcmDiagnostics(right) },
          silenceExpected: expectedSilence, expectedSilenceObserved: expectedSilence && Math.max(signalStats(left).rms, signalStats(right).rms) < 1e-5,
          footContactEvents: recorded.contacts - recorded.contactStart, footContacts: recorded.contactFeet,
          actualRoutedFootExcitations: recorded.strikeRoutes, actualRoutedFootEvents: recorded.routedFootEvents,
          actualRoutedFeet: recorded.routedFeet, strikeRoutes: recorded.strikeRoutes,
          numberBornPlates: Math.max(0, post.plates.length - pre.plates.length),
          plateBirthTimesMs: recorded.births.map(entry => entry.timeMs),
          droppedOrQueued: { dropped: recorded.dropped, queued: recorded.queued },
          processorErrors: recorded.processorErrors, nanCount: signalStats(left).nonFiniteSamples + signalStats(right).nonFiniteSamples,
          clippingCount: signalStats(left).clippedSamples + signalStats(right).clippedSamples,
          realtimeCpuMs: recorded.realtimeCpuMs },
        stateAtStart: pre, stateAtEnd: post, surfaceField: { start: pre.surface, end: post.surface },
        plateOverlapAndCoupling: plateOverlap(post.plates),
        processorDiagnostics: recorded.processorDiagnostics,
        platesAtStart: { count: pre.plates.length, agesSeconds: pre.plateAgesSeconds },
        platesAtEnd: { count: post.plates.length, agesSeconds: post.plateAgesSeconds },
        birthDescriptors: recorded.births.map(entry => descriptorMetadata(entry.descriptor)),
        samples: samples.map(s => ({ simulationTimeMs: s.simulationTimeMs, population: s.population,
          activation: s.activation?.activation, plateCount: s.plateCount })),
        provenance: { renderer: 'Web Audio MediaRecorder captured a parallel tap from the selected final gain; the existing output path and gain were unchanged',
          analysis: 'Decoded PCM; waveform is explicitly the arithmetic mono average of L/R on a common 10.00-second axis at fixed ±1 full scale; FFT 1024 Hann, hop 256, 0–8000 Hz, fixed −100..0 dBFS; no peak normalization',
          screenshot: `${name}.png` }
      };
      clipMetadata = metadata;
      const simulatedDurationSeconds = (recorded.simulationTimeMsAtStop - started.simulationTimeMs) / 1000;
      const sampledDurationSeconds = samples.length >= 2 ? (samples.at(-1).wallMs - samples[0].wallMs) / 1000 : 0;
      assert.ok(recorded.wallDurationMs >= 9500 && recorded.wallDurationMs <= 10500,
        `${name}: expected a real 10-second wall recording, got ${(recorded.wallDurationMs / 1000).toFixed(2)}s`);
      assert.ok(recorded.decoded.duration >= 9.8 && recorded.decoded.duration <= 10.3,
        `${name}: decoded recording duration outside the 10-second window`);
      assert.ok(simulatedDurationSeconds >= 6 && simulatedDurationSeconds <= 12,
        `${name}: simulation did not advance naturally during recording (${simulatedDurationSeconds.toFixed(2)}s)`);
      assert.ok(samples.length >= 25 && sampledDurationSeconds >= 8,
        `${name}: snapshot samples do not span the real recording`);
      assert.equal(metadata.recording.nanCount, 0, `${name} PCM must stay finite`);
      assert.equal(metadata.recording.clippingCount, 0, `${name} output should not clip`);
      if (expectedSilence) assert.ok(metadata.recording.expectedSilenceObserved, `${name} expected pre-birth silence`);
      assert.ok(metadata.recording.footContactEvents > 0, `${name}: natural RAF should produce FOOT_CONTACT events`);
      if (mode === 'legacy' && recorded.contactFeet > 0) {
        assert.ok(Math.max(metadata.recording.left.rms, metadata.recording.right.rms) > 1e-6,
          `${name}: legacy audio should be non-silent when locomotion contacts occur`);
      }
      if (mode === 'bornSurface' && recorded.strikeRoutes > 0) {
        assert.ok(Math.max(metadata.recording.left.rms, metadata.recording.right.rms) > 1e-6,
          `${name}: routed surface strikes should produce measurable PCM`);
      }
      if (mode === 'bornSurface' && pre.plates.length > 0) {
        assert.ok(recorded.routedFeet > 0, `${name}: existing natural plate should receive routed feet`);
        assert.ok(Math.max(metadata.recording.left.rms, metadata.recording.right.rms) > 1e-6,
          `${name}: naturally routed surface feet should produce measurable PCM`);
      }
      if (expectBirth === 'yes') assert.ok(recorded.births.length > 0 || post.plates.length > pre.plates.length, `${name} should contain natural plate birth`);
      await writeFile(resolve(outDir, `${name}.json`), JSON.stringify(metadata, null, 2));
      await page.locator('[data-action="ant-audio"]').click().catch(() => {});
      return metadata;
    } catch (error) {
      const failureRecord = { ...(clipMetadata || partial), status: 'failed', failure: String(error?.stack || error) };
      await writeFile(resolve(outDir, `${name}.json`), JSON.stringify(failureRecord, null, 2));
      throw error;
    } finally { await context.close(); }
  }

  function descriptorMetadata(d) {
    if (!d) return null;
    const mask = Array.isArray(d.mask) ? d.mask : [];
    return { id: d.id, bornAtSimulationTimeMs: d.bornAtSimulationTimeMs, source: d.source, target: d.target,
      geodesicLength: d.metrics?.geodesicLength ?? d.provenance?.geodesicLength ?? null,
      maskCells: mask.reduce((sum, cell) => sum + (cell ? 1 : 0), 0),
      meanHalfWidth: d.metrics?.meanHalfWidth ?? d.meanHalfWidth ?? mean(d.centerline?.map(point => point.halfWidth) || []),
      maxHalfWidth: d.metrics?.maxHalfWidth ?? d.maxHalfWidth ?? Math.max(0, ...(d.centerline || []).map(point => point.halfWidth)),
      chemicalEvidence: d.metrics?.meanChemical ?? null,
      mechanicalEvidence: d.metrics?.meanSupport ?? null,
      footContacts: d.metrics?.footContacts ?? d.provenance?.footContacts ?? null,
      material: d.material || null, pickups: d.pickups || null, centerline: d.centerline || null,
      edges: d.edges || null, principalPath: d.principalPath || null, grid: d.grid || null,
      overlapAndCoupling: d.metrics?.overlapAndCoupling || d.overlapAndCoupling || null,
      provenance: d.provenance || null };
  }

  if (process.argv.includes('--max-layer-only')) {
    const result = await recordClip({ name: 'bornsurface-600s-max-natural-layers', mode: 'bornSurface', prepSeconds: 600 });
    await writeFile(resolve(outDir, 'max-layer-summary.json'), JSON.stringify({
      seed: `0x${seed.toString(16)}`, volume: volumePercent / 100,
      clip: result.label, simulationStartMs: result.recording.simulationStartMs,
      simulationEndMs: result.recording.simulationEndMs,
      platesAtStart: result.platesAtStart, platesAtEnd: result.platesAtEnd,
      surfaceField: result.surfaceField, birthDescriptors: result.birthDescriptors,
      plateOverlapAndCoupling: result.plateOverlapAndCoupling,
      safety: { nonFinitePcmSamples: result.recording.nanCount, clippedPcmSamples: result.recording.clippingCount,
        dropped: result.recording.droppedOrQueued.dropped, processorErrors: result.recording.processorErrors },
      processorDiagnostics: result.processorDiagnostics, realtimeCpuMs: result.recording.realtimeCpuMs
    }, null, 2));
    console.log(`Max-layer-only evidence saved: ${outDir}`);
  } else {
  // Natural milestone discovery uses the exact seeded, default population and model tick.
  const calibration = await openModel('bornSurface');
  let milestone;
  try {
    let firstBirthSeconds = null, secondBirthSeconds = null, birthDebug = null;
    const totalSeconds = 360;
    for (let second = 0; second < totalSeconds; second += 1) {
      await tickPage(calibration.page, 1);
      const info = await state(calibration.page);
      if (info.plates.length && firstBirthSeconds === null) {
        firstBirthSeconds = info.simulationTimeMs / 1000;
        birthDebug = await captureBirthDebug(calibration.page, 'bornsurface-first-natural');
      }
      if (info.plates.length >= 2 && secondBirthSeconds === null) secondBirthSeconds = info.simulationTimeMs / 1000;
      if (second % 5 === 0) console.log(`calibration t=${(info.simulationTimeMs / 1000).toFixed(0)}s ants=${info.population} plates=${info.plates.length}`);
      if (secondBirthSeconds !== null && info.simulationTimeMs / 1000 > 180) break;
    }
    milestone = await state(calibration.page);
    await writeFile(resolve(outDir, 'natural-milestone-discovery.json'), JSON.stringify({ seed, mode: 'bornSurface',
      limitSeconds: totalSeconds, firstBirthSeconds, secondBirthSeconds, firstBirthDebug: birthDebug, final: milestone,
      provenance: 'Natural direct AntController.tick(1/60) catch-up, seeded RNG, original spawning/population/gait/deposition; no forced plate.' }, null, 2));
  } finally { await calibration.context.close(); }

  const firstBirth = milestone.plates.length ? Math.min(...milestone.plates.map(p => p.bornAtSimulationTimeMs)) / 1000 : null;
  const twoBirths = milestone.plates.length >= 2 ? milestone.plates.map(p => p.bornAtSimulationTimeMs / 1000).sort((a, b) => a - b)[1] : null;
  const results = [];
  results.push(await recordClip({ name: 'legacy-early-control', mode: 'legacy', prepSeconds: 20, expectedSilence: false }));
  results.push(await recordClip({ name: 'legacy-comparison-180s', mode: 'legacy', prepSeconds: 180, expectedSilence: false }));
  const prebirthSeconds = firstBirth === null ? 20 : Math.max(0, Math.min(20, firstBirth - 12));
  results.push(await recordClip({ name: 'bornsurface-prebirth-silence', mode: 'bornSurface', prepSeconds: prebirthSeconds, expectedSilence: true }));
  if (firstBirth !== null) {
    results.push(await recordClip({ name: 'bornsurface-first-birth', mode: 'bornSurface', prepSeconds: Math.max(0, firstBirth - 1), expectBirth: 'yes' }));
    if (twoBirths !== null && twoBirths - (firstBirth + 0.25) >= 10.5) {
      results.push(await recordClip({ name: 'bornsurface-early-single', mode: 'bornSurface', prepSeconds: firstBirth + 0.25 }));
    } else {
      await writeFile(resolve(outDir, 'bornsurface-early-single-unavailable.json'), JSON.stringify({
        result: 'Natural first-to-second birth interval is too short for a full 10-second single-plate clip.', firstBirth, secondBirth: twoBirths
      }, null, 2));
    }
    const matureTime = Math.min(180, firstBirth + 30);
    const matureName = twoBirths !== null && twoBirths <= matureTime
      ? 'bornsurface-mature-multilayer' : 'bornsurface-mature-single';
    results.push(await recordClip({ name: matureName, mode: 'bornSurface', prepSeconds: matureTime }));
  } else {
    await writeFile(resolve(outDir, 'bornsurface-first-birth-unavailable.json'), JSON.stringify({ result: 'No natural plate born within calibration horizon', firstBirth: null }, null, 2));
  }
  if (twoBirths !== null) results.push(await recordClip({ name: 'bornsurface-natural-multilayer', mode: 'bornSurface', prepSeconds: Math.max(0, twoBirths - 1) }));
  else await writeFile(resolve(outDir, 'bornsurface-natural-multilayer-unavailable.json'), JSON.stringify({ result: 'No second natural plate in calibration horizon' }, null, 2));
  results.push(await recordClip({ name: 'bornsurface-late-180s', mode: 'bornSurface', prepSeconds: 180 }));
  const matchedLegacy = results.find(result => result.label === 'legacy-comparison-180s');
  const matchedBorn = results.find(result => result.label === 'bornsurface-late-180s');
  const fingerprint = result => JSON.stringify({ ants: result.stateAtStart.ants,
    surface: result.stateAtStart.surface, pheromoneMass: result.stateAtStart.pheromoneMass });
  await writeFile(resolve(outDir, 'run-summary.json'), JSON.stringify({ seed, volumePercent, recordSeconds,
    discovered: { firstBirth, secondBirth: twoBirths }, clips: results.map(result => ({ label: result.label,
      simulationStartMs: result.recording.simulationStartMs, simulationEndMs: result.recording.simulationEndMs,
      rmsLeft: result.recording.left.rms, rmsRight: result.recording.right.rms,
      plateCount: result.platesAtEnd.count, births: result.birthDescriptors.length,
      expectedSilenceObserved: result.recording.expectedSilenceObserved })),
    matchedModeComparison: matchedLegacy && matchedBorn ? { simulationStartMs: matchedLegacy.recording.simulationStartMs,
      legacyStartMs: matchedLegacy.recording.simulationStartMs, bornSurfaceStartMs: matchedBorn.recording.simulationStartMs,
      sameAntState: fingerprint(matchedLegacy) === fingerprint(matchedBorn),
      legacyMode: matchedLegacy.mode, bornSurfaceMode: matchedBorn.mode } : null }, null, 2));
  assert.ok(matchedLegacy && matchedBorn, 'matched legacy and bornSurface 180s windows should exist');
  assert.equal(matchedLegacy.recording.simulationStartMs, matchedBorn.recording.simulationStartMs,
    'legacy and bornSurface windows should start at the same simulation time');
  assert.equal(fingerprint(matchedLegacy), fingerprint(matchedBorn),
    'matched audio modes should preserve identical ANT, gait, pheromone, and surface state at start');
  console.log(`Surface audio evidence saved: ${outDir}`);
  }
} finally {
  await browser?.close();
  await server.close();
}

function assertSafe(condition, message) { if (!condition) throw new Error(message); }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function plateOverlap(plates) {
  const result = [];
  for (let first = 0; first < plates.length; first += 1) for (let second = first + 1; second < plates.length; second += 1) {
    const a = plates[first].mask || [], b = plates[second].mask || [];
    let cellsA = 0, cellsB = 0, intersection = 0;
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      if (a[index]) cellsA += 1;
      if (b[index]) cellsB += 1;
      if (a[index] && b[index]) intersection += 1;
    }
    result.push({ firstId: plates[first].id, secondId: plates[second].id, cellsA, cellsB, intersection,
      overlapFractionOfSmallerPlate: intersection / Math.max(1, Math.min(cellsA, cellsB)),
      physicalCoupling: plates[first].metrics?.coupling?.[plates[second].id] ?? null });
  }
  return result;
}
