import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

// Opt-in sleep-blocker diagnostics for the normal seeded ANT browser run.
const SEED = 20261005;
const BASELINE_HEAD = '3a41e6be6784de71e290ff3f6475416ceaeeb883';
const VOLUME = 0.35;
const SAMPLE_MS = 1000;
const DIAGNOSTICS_INTERVAL_MS = 5000;
const WINDOW_SECONDS = 8;
const MAX_SIMULATION_SECONDS = 600;
const MAX_WALL_SECONDS = 900;
const OUT_DIR = resolve('docs/ant/evidence/2026-10-06-sleep-blockers');
const CHROME = process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = resolve(OUT_DIR, runId);
const startingHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceWorkletPath = resolve('static/worklets/surface-plate.worklet.js');
const sleepSnapshotPath = resolve(runDir, 'worklet-state-snapshot.json.gz');

await mkdir(runDir, { recursive: true });
let server;
let browser;
let globalError = null;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const { readFile } = await import('node:fs/promises');
const sha256 = await readFile(sourceWorkletPath).then(hash);
const rendererCapture = { entryOriginalSha256: null, entryServedSha256: null, workletServedSha256: null,
  workletDiagnosticExtension: null, entryReplacement: null };
const originalWorklet = await readFile(sourceWorkletPath, 'utf8');
assert.equal(await readFile(resolve('dist/worklets/surface-plate.worklet.js')).then(hash), sha256);
const diagnosticExtension = `
const __runtimeOriginalDiagnostics = SurfacePlateProcessor.prototype.getDiagnostics;
SurfacePlateProcessor.prototype.getDiagnostics = function () {
  const result = __runtimeOriginalDiagnostics.call(this);
  const layers = this.topology?.layerIds || [];
  const activeNodesByLayer = new Uint32Array(layers.length);
  for (let i = 0; i < this.activeCount; i++) activeNodesByLayer[this.nodeLayer[this.active[i]]]++;
  result.runtimeLayerActivity = layers.map((id, index) => ({ id,
    totalNodes: this.topology.nodeOffsets[index + 1] - this.topology.nodeOffsets[index],
    activeNodes: activeNodesByLayer[index] }));
  result.runtimeTotalNodes = this.current.length;
  return result;
};
`;
const registration = "registerProcessor('surface-plate-processor', SurfacePlateProcessor);";
assert.equal(originalWorklet.split(registration).length - 1, 1);
const diagnosticWorklet = originalWorklet.replace(registration, diagnosticExtension + registration);
assert.equal(diagnosticWorklet.replace(diagnosticExtension, ''), originalWorklet);
rendererCapture.workletOriginalSha256 = sha256;
rendererCapture.workletServedSha256 = hash(diagnosticWorklet);
rendererCapture.workletDiagnosticExtension = diagnosticExtension;
// Chrome's AudioWorklet module requests bypass page.route on this installation.
// Serve the read-only observer in memory; the disk/public production DSP stays intact.
const diagnosticMiddleware = (request, response, next) => {
  if (request.url?.split('?')[0] !== '/worklets/surface-plate.worklet.js') return next();
  response.setHeader('Content-Type', 'application/javascript');
  response.setHeader('Cache-Control', 'no-store');
  response.end(diagnosticWorklet);
};
server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error',
  plugins: [{ name: 'runtime-evidence-observer', configurePreviewServer(previewServer) {
    previewServer.middlewares.use(diagnosticMiddleware);
  } }] });

try {
  const address = server.httpServer.address();
  assert.ok(address?.port, 'Vite production preview must bind a port');
  browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  let sleepSnapshotSaved = false;
  await page.exposeFunction('__saveSleepDiagnosticSnapshot', async serialized => {
    await writeFile(sleepSnapshotPath, gzipSync(Buffer.from(serialized, 'utf8')));
    sleepSnapshotSaved = true;
  });
  page.on('pageerror', error => { globalError = String(error); });
  page.on('console', message => { if (message.type() === 'error') void appendFile(resolve(runDir, 'console-errors.jsonl'), `${JSON.stringify({ at: Date.now(), text: message.text() })}\n`); });

  await page.route('**/*.js', async route => {
    const response = await route.fetch();
    const url = new URL(route.request().url());
    let body = await response.text();
    const mount = body.match(/([\w$]+)\(document\.getElementById\("app"\)\);?\s*$/);
    if (/\/assets\/index-[^/]+\.js$/.test(url.pathname) && mount) {
      rendererCapture.entryOriginalSha256 = hash(body);
      const needle = `${mount[1]}(document.getElementById("app"))`;
      assert.equal(body.split(needle).length - 1, 1, 'Expected one minified production app mount');
      body = body.replace(needle, `globalThis.__runtimeApp=${needle}`);
      rendererCapture.entryReplacement = needle;
      rendererCapture.entryServedSha256 = hash(body);
    }
    await route.fulfill({ response, body });
  });

  await page.addInitScript(() => {
    window.__runtimeProbe = { contexts: [], worklets: [], processorErrors: [] };
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) { super(...args); window.__runtimeProbe.contexts.push(this); }
    };
    const NativeWorklet = window.AudioWorkletNode;
    window.AudioWorkletNode = class extends NativeWorklet {
      constructor(audioContext, name, options) {
        super(audioContext, name, options);
        const record = { name, outputChannelCount: options?.outputChannelCount || null, messages: [] };
        this.port.addEventListener('message', event => {
          const timing = { wallMs: Date.now(), performanceMs: performance.now(), audioTime: audioContext.currentTime,
            simulationTimeMs: window.__runtimeApp?.lab?.model?.simulationTimeMs ?? null };
          if (event.data?.type === 'sleep-diagnostic-snapshot') {
            const payload = event.data.payload;
            const serialized = JSON.stringify(payload, (_key, value) => ArrayBuffer.isView(value)
              ? { __typedArray: value.constructor.name, data: Array.from(value) } : value);
            window.__saveSleepDiagnosticSnapshot(serialized).then(() => {
              window.__runtimeProbe.sleepSnapshotSaved = true;
            }).catch(error => { window.__runtimeProbe.snapshotError = String(error); });
            record.messages.push({ ...timing, data: { type: event.data.type, payload: {
              physicsSteps: payload.dynamic?.physicsSteps, diagnostics: payload.diagnostics } } });
            return;
          }
          record.messages.push({ ...timing, data: event.data });
        });
        this.port.start();
        this.addEventListener('processorerror', event => window.__runtimeProbe.processorErrors.push(String(event.message || 'processorerror')));
        record.node = this;
        window.__runtimeProbe.worklets.push(record);
      }
    };
  });

  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__runtimeApp?.lab?.registry?.ant));
  await page.evaluate(async ({ seed, volume }) => {
    const app = window.__runtimeApp;
    await app.ready;
    let state = seed >>> 0;
    const seededRandom = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
    const originalFactory = app.lab.registry.ant;
    app.lab.registry.ant = options => {
      const model = originalFactory(options);
      model.random = seededRandom;
      return model;
    };
    await app.selectModel('ant');
    const model = app.lab.model;
    window.__runtimeRun = { seed, app, startedWallMs: Date.now(), births: [], lastBirthCount: 0 };
    model.subscribe(event => {
      if (event.type === 'plate-birth') {
        const descriptor = event.payload?.descriptor || event.payload;
        window.__runtimeRun.births.push({ kind: 'plate', id: descriptor?.id ?? null,
          simulationTimeMs: descriptor?.bornAtSimulationTimeMs ?? model.simulationTimeMs });
      } else if (event.type === 'sphere-birth') {
        const d = event.payload || {};
        window.__runtimeRun.births.push({ kind: 'sphere', id: d.id ?? null,
          simulationTimeMs: d.bornAtSimulationTimeMs ?? model.simulationTimeMs });
      }
    });
    model.setAudioVolume(volume);
  }, { seed: SEED, volume: VOLUME });
  await page.waitForSelector('#simulation-canvas');
  assert.equal(await page.locator('[data-model="ant"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#ant-volume').evaluate((slider, value) => {
    slider.value = String(value); slider.dispatchEvent(new Event('input', { bubbles: true }));
  }, Math.round(VOLUME * 100));
  await page.locator('[data-action="ant-audio"]').click();
  await page.waitForFunction(() => {
    const bridge = window.__runtimeApp.lab.model.audioBridge;
    return bridge?.enabled && !bridge.loading && bridge.surface?.worklet?.node
      && window.__runtimeProbe.contexts.at(-1)?.state === 'running';
  }, null, { timeout: 30000 });
  await page.evaluate(() => window.__runtimeApp.lab.model.audioBridge.surface.post('sleep-diagnostics', { enabled: true }));

  const audioAtStart = await page.evaluate(() => ({ wallMs: Date.now(), performanceMs: performance.now(),
    simulationTimeMs: window.__runtimeApp.lab.model.simulationTimeMs,
    audioTime: window.__runtimeProbe.contexts.at(-1).currentTime,
    contextState: window.__runtimeProbe.contexts.at(-1).state,
    sampleRate: window.__runtimeProbe.contexts.at(-1).sampleRate,
    volume: window.__runtimeApp.lab.model.audioBridge.volume,
    gain: window.__runtimeApp.lab.model.audioBridge.surface.worklet.gainNode.gain.value,
    mode: window.__runtimeApp.lab.model.state.audioExperiment.mode }));
  assert.equal(audioAtStart.mode, 'bornSurface');
  assert.ok(Math.abs(audioAtStart.volume - VOLUME) < 0.005, `Expected 35% volume; got ${audioAtStart.volume}`);
  const audioAnchor = { simulationTimeMs: audioAtStart.simulationTimeMs, audioTime: audioAtStart.audioTime };
  const pollsPath = resolve(runDir, 'polls.jsonl');
  const windowsPath = resolve(runDir, 'windows.jsonl');
  const rawDiagnosticsPath = resolve(runDir, 'processor-diagnostics.jsonl');
  const captureStatePath = resolve(runDir, 'capture-state.json');
  let messageCursor = 0;
  let diagnosticsRequest = null;
  let pendingMilestoneDiagnostic = null;
  let milestoneDiagnosticInFlight = false;
  let snapshotRequested = false;
  let sleepResultRequested = false;
  let sleepSnapshotStep = null;
  let sleepDiagnosticResult = null;
  const sleepMilestones = [];
  let lastDiagnostics = null;
  let lastDiagnosticsRecord = null;
  const receivedDiagnostics = [];
  let lastRequestPerf = -Infinity;
  let previousPoll = null;
  let nextRegularWindowPerf = audioAtStart.performanceMs;
  let lastProgressSeconds = -30;
  const milestoneDone = new Set();
  const rowsByLayer = [];
  const completedWindows = [];
  let lowRealtimeWindows = 0;
  let stopReason = 'simulation-limit';

  await writeFile(captureStatePath, JSON.stringify({ runId, seed: SEED, head: startingHead,
    chromeVersion: browser.version(),
    chromeExecutable: CHROME, chromeMode: 'headless installed Chrome', volume: VOLUME,
    productionMode: 'Vite preview of built dist', start: audioAtStart,
    originalWorkletSha256: sha256, servedTransform: rendererCapture,
    diagnosticsAreAsynchronous: true,
    baselineHead: BASELINE_HEAD,
    scope: 'Natural bornSurface ANT run with opt-in counters only; production thresholds, forces, routing, behavior, and topology remain unchanged.',
    diagnosticSettings: { sleepSteps: 12000, sleepEnergy: 1e-10, forceThreshold: 1e-8,
      contactPulseMs: 3, contactRecoveryMs: 75, plateDampingMultiplier: 50 } }, null, 2));

  while (true) {
    await page.waitForTimeout(SAMPLE_MS);
    const poll = await page.evaluate(() => {
      const run = window.__runtimeRun, model = run.app.lab.model;
      const audio = model.audioBridge, surface = audio?.surface;
      const context = window.__runtimeProbe.contexts.at(-1);
      const snapshot = model.materialStratigraphy.getSnapshot();
      const messages = window.__runtimeProbe.worklets.at(-1)?.messages || [];
      return { wallMs: Date.now(), performanceMs: performance.now(), simulationTimeMs: model.simulationTimeMs,
        audioTime: context?.currentTime ?? null, contextState: context?.state ?? null,
        population: model.agents.length, activation: model.colonyActivation.activation,
        plates: model.materialStratigraphy.plates.length, nodules: model.materialStratigraphy.nodules.length,
        births: run.births.slice(), totalNodes: surface?.topology?.nodeOffsets?.at(-1) ?? 0,
        topologyGeneration: surface?.topologyGeneration ?? 0, topologyRevision: surface?.materialRevision ?? null,
        couplingLinks: surface?.topology?.adjacentLinkCoefficients?.length ?? null,
        bridgeDiagnostics: surface ? { ...surface.diagnostics } : null,
        plateHistory: snapshot.stratigraphy.plateHistory.map(item => ({ id: item.id,
          bornAtSimulationTimeMs: item.bornAtSimulationTimeMs, exposedCellCount: item.exposedCellCount,
          buriedCellCount: item.buriedCellCount, maxBurialLayerCount: item.maxBurialLayerCount,
          maxBurialDepthMeters: item.maxBurialDepthMeters })),
        diagnosticsMessages: messages.length };
    });

    const messages = await page.evaluate(cursor => (window.__runtimeProbe.worklets.at(-1)?.messages || []).slice(cursor), messageCursor);
    messageCursor += messages.length;
    for (const message of messages) {
      if (message.data?.type === 'sleep-diagnostic-snapshot') {
        sleepSnapshotStep = message.data.payload.physicsSteps;
      }
      if (message.data?.type === 'sleep-diagnostic-result') {
        sleepDiagnosticResult = message.data.payload;
        await writeFile(resolve(runDir, 'snapshot-following-2s.json'), JSON.stringify({ ...message,
          result: sleepDiagnosticResult }, null, 2));
      }
      if (message.data?.type !== 'diagnostics') continue;
      const record = { ...message, latencyFromRequestMs: diagnosticsRequest
        ? message.performanceMs - diagnosticsRequest.performanceMs : null,
        requestSimulationTimeMs: diagnosticsRequest?.simulationTimeMs ?? null,
        requestAudioTime: diagnosticsRequest?.audioTime ?? null };
      await appendFile(rawDiagnosticsPath, `${JSON.stringify(record)}\n`);
      lastDiagnostics = message.data.payload;
      lastDiagnosticsRecord = record;
      receivedDiagnostics.push(record);
      if (diagnosticsRequest) diagnosticsRequest = null;
      if (pendingMilestoneDiagnostic && record.data.payload.layers >= pendingMilestoneDiagnostic.count) {
        const milestone = { label: pendingMilestoneDiagnostic.label, requestedAt: pendingMilestoneDiagnostic.requestedAt,
          receivedAt: { wallMs: record.wallMs, simulationTimeMs: record.simulationTimeMs,
            audioTime: record.audioTime, physicsSteps: record.data.payload.physicsSteps },
          processorLayers: record.data.payload.layers, topologyGeneration: record.data.payload.topologyGeneration,
          sleepDiagnostics: record.data.payload.sleepDiagnostics };
        sleepMilestones.push(milestone);
        await writeFile(resolve(runDir, 'sleep-milestones.json'), JSON.stringify(sleepMilestones, null, 2));
        const isThirty = pendingMilestoneDiagnostic.count === 30;
        pendingMilestoneDiagnostic = null;
        milestoneDiagnosticInFlight = false;
        if (isThirty && !snapshotRequested) {
          snapshotRequested = true;
          await page.evaluate(() => window.__runtimeApp.lab.model.audioBridge.surface.post('sleep-diagnostic-snapshot'));
        }
      } else if (pendingMilestoneDiagnostic) milestoneDiagnosticInFlight = false;
    }

    if (!diagnosticsRequest && pendingMilestoneDiagnostic && !milestoneDiagnosticInFlight) {
      diagnosticsRequest = { wallMs: poll.wallMs, performanceMs: poll.performanceMs,
        simulationTimeMs: poll.simulationTimeMs, audioTime: poll.audioTime };
      lastRequestPerf = poll.performanceMs;
      milestoneDiagnosticInFlight = true;
      await page.evaluate(() => window.__runtimeApp.lab.model.audioBridge.surface.post('diagnostics'));
    } else if (!diagnosticsRequest && snapshotRequested && sleepSnapshotStep === null && !sleepDiagnosticResult) {
      diagnosticsRequest = { wallMs: poll.wallMs, performanceMs: poll.performanceMs,
        simulationTimeMs: poll.simulationTimeMs, audioTime: poll.audioTime };
      lastRequestPerf = poll.performanceMs;
      await page.evaluate(() => window.__runtimeApp.lab.model.audioBridge.surface.post('diagnostics'));
    } else if (!diagnosticsRequest && sleepSnapshotStep !== null && !sleepDiagnosticResult
      && (lastDiagnostics?.physicsSteps ?? 0) < sleepSnapshotStep + 12000) {
      diagnosticsRequest = { wallMs: poll.wallMs, performanceMs: poll.performanceMs,
        simulationTimeMs: poll.simulationTimeMs, audioTime: poll.audioTime };
      lastRequestPerf = poll.performanceMs;
      await page.evaluate(() => window.__runtimeApp.lab.model.audioBridge.surface.post('diagnostics'));
    } else if (!diagnosticsRequest && poll.performanceMs - lastRequestPerf >= DIAGNOSTICS_INTERVAL_MS) {
      diagnosticsRequest = { wallMs: poll.wallMs, performanceMs: poll.performanceMs,
        simulationTimeMs: poll.simulationTimeMs, audioTime: poll.audioTime };
      lastRequestPerf = poll.performanceMs;
      await page.evaluate(() => window.__runtimeApp.lab.model.audioBridge.surface.post('diagnostics'));
    }
    const diagnosticsPendingMs = diagnosticsRequest ? poll.performanceMs - diagnosticsRequest.performanceMs : null;
    const simSeconds = poll.simulationTimeMs / 1000;
    const audioProgress = poll.audioTime === null ? null : poll.audioTime - audioAnchor.audioTime;
    const simProgress = (poll.simulationTimeMs - audioAnchor.simulationTimeMs) / 1000;
    const enriched = { ...poll,
      simSeconds,
      audioLagSeconds: poll.audioTime === null ? null : simSeconds - poll.audioTime,
      offsetAdjustedSimAudioLagSeconds: audioProgress === null ? null : simProgress - audioProgress,
      simDelta: previousPoll ? (poll.simulationTimeMs - previousPoll.simulationTimeMs) / 1000 : null,
      audioDelta: previousPoll && poll.audioTime !== null ? poll.audioTime - previousPoll.audioTime : null,
      wallDelta: previousPoll ? (poll.performanceMs - previousPoll.performanceMs) / 1000 : null,
      diagnosticsPendingMs, diagnostics: lastDiagnostics,
      diagnosticsReceived: lastDiagnosticsRecord ? { performanceMs: lastDiagnosticsRecord.performanceMs,
        simulationTimeMs: lastDiagnosticsRecord.simulationTimeMs, audioTime: lastDiagnosticsRecord.audioTime,
        latencyFromRequestMs: lastDiagnosticsRecord.latencyFromRequestMs,
        ageAtPollMs: poll.performanceMs - lastDiagnosticsRecord.performanceMs } : null,
      perLayerActivity: lastDiagnostics?.runtimeLayerActivity ?? null };
    await appendFile(pollsPath, `${JSON.stringify(enriched)}\n`);
    previousPoll = poll;

    const crossed = [[10, '10-plates'], [20, '20-plates'], [30, '30-plates']]
      .find(([count, label]) => poll.plates >= count && !milestoneDone.has(label));
    if (crossed) {
      milestoneDone.add(crossed[1]);
      if (rowsByLayer.length === 0) rowsByLayer.push({ tag: crossed[1], start: poll, durationSeconds: WINDOW_SECONDS });
      await page.screenshot({ path: resolve(runDir, `${crossed[1]}.png`), fullPage: true });
      pendingMilestoneDiagnostic = { label: crossed[1], count: crossed[0], requestedAt: {
        wallMs: poll.wallMs, simulationTimeMs: poll.simulationTimeMs, plates: poll.plates } };
      milestoneDiagnosticInFlight = Boolean(diagnosticsRequest);
    } else if (rowsByLayer.length === 0 && poll.performanceMs >= nextRegularWindowPerf) {
      rowsByLayer.push({ tag: '5s', start: poll, durationSeconds: 5 });
      nextRegularWindowPerf = poll.performanceMs + DIAGNOSTICS_INTERVAL_MS;
    }

    const pendingWindow = rowsByLayer.at(-1);
    if (pendingWindow && (poll.performanceMs - pendingWindow.start.performanceMs) / 1000 >= pendingWindow.durationSeconds) {
      const elapsedWall = (poll.performanceMs - pendingWindow.start.performanceMs) / 1000;
      const elapsedSim = (poll.simulationTimeMs - pendingWindow.start.simulationTimeMs) / 1000;
      const elapsedAudio = poll.audioTime === null || pendingWindow.start.audioTime === null
        ? null : poll.audioTime - pendingWindow.start.audioTime;
      const result = { label: pendingWindow.tag, start: pendingWindow.start, end: enriched,
        wallDelta: elapsedWall, simDelta: elapsedSim, audioDelta: elapsedAudio,
        simPerWall: elapsedSim / elapsedWall, audioPerWall: elapsedAudio === null ? null : elapsedAudio / elapsedWall,
        diagnosticsTiming: { pendingAtEndMs: diagnosticsPendingMs,
          processorCountersAreAsync: true, latestReceived: enriched.diagnosticsReceived },
        topology: { plateCount: poll.plates, noduleCount: poll.nodules, totalNodes: poll.totalNodes,
          activeNodes: lastDiagnostics?.activeNodes ?? null, awakeLayers: lastDiagnostics?.awakeLayers ?? null,
          sleepingLayers: lastDiagnostics?.sleepingLayers ?? null,
          activeSphereModes: lastDiagnostics?.activeSphereModes ?? null,
          integratedSphereModes: lastDiagnostics?.integratedSphereModes ?? null,
          couplingLinks: lastDiagnostics?.couplingLinks ?? poll.couplingLinks,
          topologyGeneration: lastDiagnostics?.topologyGeneration ?? poll.topologyGeneration },
        processorTopology: { plateCount: lastDiagnostics?.layers ?? null,
          noduleCount: lastDiagnostics?.noduleCount ?? null,
          totalNodes: lastDiagnostics?.runtimeTotalNodes ?? null,
          generation: lastDiagnostics?.topologyGeneration ?? null },
        processor: lastDiagnostics ? Object.fromEntries(['strikes','dropped','droppedRoutes','nonFinite','clipped',
          'wakes','sleeps','maxOutputAbs','deepPlateCouplingTransfers','sphereCouplingTransfers']
          .map(key => [key, lastDiagnostics[key] ?? null])) : null,
        audioContextState: poll.contextState };
      completedWindows.push(result);
      await appendFile(windowsPath, `${JSON.stringify(result)}\n`);
      rowsByLayer.pop();
      if (result.topology.plateCount >= 30 && result.audioPerWall !== null && result.audioPerWall < 0.9) lowRealtimeWindows += 1;
      else if (result.topology.plateCount >= 30) lowRealtimeWindows = 0;
      if (result.topology.plateCount >= 30 && lowRealtimeWindows >= 2 && milestoneDone.has('30-plates')
        && completedWindows.some(item => item.label === '30-plates')) {
        if (sleepDiagnosticResult) { stopReason = 'diagnostic-window-complete'; break; }
      }
    }

    if (sleepSnapshotStep !== null && !sleepDiagnosticResult && !sleepResultRequested && !diagnosticsRequest
      && (lastDiagnostics?.physicsSteps ?? 0) >= sleepSnapshotStep + 12000) {
      sleepResultRequested = true;
      await page.evaluate(() => window.__runtimeApp.lab.model.audioBridge.surface.post('sleep-diagnostic-result'));
    }
    if (sleepDiagnosticResult) { stopReason = 'diagnostic-window-complete'; break; }

    if (simSeconds - lastProgressSeconds >= 30) {
      lastProgressSeconds = simSeconds;
      console.log(JSON.stringify({ simSeconds, plates: poll.plates, nodules: poll.nodules,
        activeNodes: lastDiagnostics?.activeNodes, sleepingLayers: lastDiagnostics?.sleepingLayers,
        audioLagSeconds: enriched.offsetAdjustedSimAudioLagSeconds,
        latestAudioPerWall: completedWindows.at(-1)?.audioPerWall }));
    }
    if (simSeconds >= MAX_SIMULATION_SECONDS) { stopReason = '600-simulation-seconds'; break; }
    if ((poll.performanceMs - audioAtStart.performanceMs) / 1000 >= MAX_WALL_SECONDS) {
      stopReason = '900-wall-second-watchdog'; break;
    }
    if (globalError) { stopReason = 'page-error'; break; }
  }

  const finalState = await page.evaluate(() => {
    const model = window.__runtimeApp.lab.model, context = window.__runtimeProbe.contexts.at(-1);
    const run = window.__runtimeRun;
    return { wallMs: Date.now(), performanceMs: performance.now(), simulationTimeMs: model.simulationTimeMs, audioTime: context?.currentTime ?? null,
      audioContextState: context?.state ?? null, mode: model.state.audioExperiment.mode,
      volume: model.audioBridge.volume, gain: model.audioBridge.surface.worklet?.gainNode?.gain.value ?? null,
      plateCount: model.materialStratigraphy.plates.length, noduleCount: model.materialStratigraphy.nodules.length,
      plateBirths: run.births.filter(item => item.kind === 'plate'), noduleBirths: run.births.filter(item => item.kind === 'sphere'),
      processorErrors: window.__runtimeProbe.processorErrors,
      topologyGeneration: model.audioBridge.surface.topologyGeneration,
      bridgeDiagnostics: { ...model.audioBridge.surface.diagnostics } };
  });
  if (snapshotRequested) {
    await page.waitForFunction(() => window.__runtimeProbe.sleepSnapshotSaved === true, null, { timeout: 30000 });
    assert.ok(sleepSnapshotSaved, 'The captured processor state must be saved before evidence is finalized');
  }
  await page.screenshot({ path: resolve(runDir, 'final.png'), fullPage: true });
  const requestWasAlreadyPending = Boolean(diagnosticsRequest);
  if (!diagnosticsRequest) {
    diagnosticsRequest = finalState;
    await page.evaluate(() => window.__runtimeApp.lab.model.audioBridge.surface.post('diagnostics'));
  }
  if (diagnosticsRequest) {
    await page.waitForFunction(cursor => (window.__runtimeProbe.worklets.at(-1)?.messages || []).slice(cursor)
      .some(message => message.data?.type === 'diagnostics'), messageCursor, { timeout: 3000 }).catch(() => {});
    const tail = await page.evaluate(cursor => (window.__runtimeProbe.worklets.at(-1)?.messages || []).slice(cursor), messageCursor);
    for (const message of tail.filter(item => item.data?.type === 'diagnostics')) {
      const record = { ...message, tailResponse: true, finalBoundedRequest: !requestWasAlreadyPending,
        requestSimulationTimeMs: diagnosticsRequest?.simulationTimeMs ?? null,
        requestAudioTime: diagnosticsRequest?.audioTime ?? null,
        latencyFromRequestMs: diagnosticsRequest ? message.performanceMs - diagnosticsRequest.performanceMs : null };
      await appendFile(rawDiagnosticsPath, `${JSON.stringify(record)}\n`);
      receivedDiagnostics.push(record);
      lastDiagnostics = message.data.payload;
      lastDiagnosticsRecord = record;
    }
  }
  assert.equal(await readFile(sourceWorkletPath).then(hash), sha256, 'Production DSP source must remain unchanged');
  assert.equal(rendererCapture.workletOriginalSha256, sha256, 'Built worklet must match current production source');
  assert.ok(lastDiagnostics?.runtimeLayerActivity, 'Per-layer diagnostic observer must reach Chrome');
  await writeFile(resolve(runDir, 'summary.json'), JSON.stringify({ runId, seed: SEED,
    baselineHead: BASELINE_HEAD, diagnosticCommitHead: startingHead,
    chromeVersion: browser.version(), stopReason, start: audioAtStart, final: finalState,
    windows: completedWindows, worstAudioPerWall: completedWindows.filter(item => item.audioPerWall !== null)
      .reduce((min, item) => Math.min(min, item.audioPerWall), Infinity),
    maximumActiveNodes: Math.max(0, ...receivedDiagnostics.map(item => item.data.payload.activeNodes || 0)),
    maximumAwakeLayers: Math.max(0, ...receivedDiagnostics.map(item => item.data.payload.awakeLayers || 0)),
    anySleepingLayers: receivedDiagnostics.some(item => (item.data.payload.sleepingLayers || 0) > 0),
    sleepMilestones, sleepSnapshot: snapshotRequested ? { path: 'worklet-state-snapshot.json.gz', step: sleepSnapshotStep,
      saved: sleepSnapshotSaved, followingWindowResult: sleepDiagnosticResult } : null,
    finalProcessorDiagnostics: lastDiagnostics, finalProcessorReceived: lastDiagnosticsRecord,
    pageError: globalError,
    rendererCapture, originalWorkletSha256: sha256 }, null, 2));
  await page.close();
  await context.close();
  console.log(JSON.stringify({ output: runDir, stopReason, simSeconds: finalState.simulationTimeMs / 1000,
    plateCount: finalState.plateCount, noduleCount: finalState.noduleCount,
    diagnosticSnapshots: sleepMilestones.length, sleepSnapshotSaved,
    windows: completedWindows.length, worstAudioPerWall: completedWindows.filter(item => item.audioPerWall !== null)
      .reduce((min, item) => Math.min(min, item.audioPerWall), Infinity) }, null, 2));
} catch (error) {
  globalError = error?.stack || String(error);
  await writeFile(resolve(runDir, 'fatal-error.txt'), globalError);
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}
