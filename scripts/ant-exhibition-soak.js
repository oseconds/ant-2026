import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { dirname } from 'node:path';
import { cpus, totalmem, platform, release } from 'node:os';

const ROOT = process.cwd();
const CHROME = process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SECONDS = Number(process.env.ANT_SOAK_SECONDS || 7200);
const SAMPLE_SECONDS = Number(process.env.ANT_SOAK_SAMPLE_SECONDS || 30);
const HEADED = process.env.ANT_SOAK_HEADED !== 'false';
const QUERY = process.env.ANT_SOAK_QUERY || '';
const AUDIO = process.env.ANT_SOAK_AUDIO !== 'off';
const PREGROW = process.env.ANT_SOAK_PREGROW || 'natural';
const TARGET = Number(process.env.ANT_SOAK_TARGET_PLATES || 30);
const HISTORY_CAPACITY = Number(process.env.ANT_SOAK_HISTORY_CAPACITY || 256);
const SCHEDULING = process.env.ANT_SOAK_SCHEDULING || 'native';
const SEED = Number(process.env.ANT_SOAK_SEED || 20261005) >>> 0;
const WIDTH = Number(process.env.ANT_SOAK_WIDTH || 1440), HEIGHT = Number(process.env.ANT_SOAK_HEIGHT || 1100);
const CHECKPOINTS = [0, 900, 1800, 3600, 7200];
const requestedResidents = new URLSearchParams(QUERY.slice(1)).get('antResidents');
const RECENT_VISUAL = new URLSearchParams(QUERY.slice(1)).get('antVisual') === 'recent';
const EXPECTED_RESIDENT_LIMIT = ['1', '2'].includes(requestedResidents) ? Number(requestedResidents) : null;
const THROTTLING_FLAGS = ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding'];
const EXPLICIT_LAUNCH_ARGS = ['--enable-automation'];
const SOURCE_PATHS = ['src/main.js', 'src/lib/renderers/AntRenderer.js', 'src/lib/audio/SurfaceAudioBridge.js',
  'src/lib/audio/AntEnvironmentAudioBridge.js', 'src/lib/audio/compileSurfaceTopology.js', 'src/lib/lab/modelRegistry.js',
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/SurfaceField.js',
  'static/worklets/surface-plate.worklet.js', 'scripts/ant-exhibition-soak.js'];
const OUT = resolve(ROOT, 'docs/ant/evidence/2026-10-21-long-run-exhibition/runtime');

function validateConfig() {
  assert.ok(Number.isFinite(SECONDS) && SECONDS > 0 && SECONDS <= 86400, 'ANT_SOAK_SECONDS must be in (0,86400]');
  assert.ok([10, 30].includes(SAMPLE_SECONDS), 'ANT_SOAK_SAMPLE_SECONDS must be 10 or 30');
  assert.ok(PREGROW === 'natural' || PREGROW === 'none', 'ANT_SOAK_PREGROW must be natural or none');
  assert.ok(Number.isInteger(TARGET) && TARGET >= 0 && TARGET <= HISTORY_CAPACITY,
    'ANT_SOAK_TARGET_PLATES must be within the selected history capacity');
  assert.ok(HISTORY_CAPACITY === 256 || HISTORY_CAPACITY === 1024,
    'ANT_SOAK_HISTORY_CAPACITY must be 256 or 1024');
  assert.ok(['native', 'no-background-throttling'].includes(SCHEDULING), 'unknown scheduling profile');
  assert.ok(Number.isInteger(WIDTH) && WIDTH > 0 && Number.isInteger(HEIGHT) && HEIGHT > 0, 'viewport dimensions must be positive integers');
  assert.ok(QUERY === '' || QUERY.startsWith('?'), 'ANT_SOAK_QUERY must be empty or begin with ?');
  if (HISTORY_CAPACITY === 1024) assert.equal(EXPECTED_RESIDENT_LIMIT, 2,
    '1024-history shadow requires the normal ?antResidents=2 startup query');
}

if (process.argv.includes('--self-check')) {
  validateConfig();
  assert.deepEqual(CHECKPOINTS, [0, 900, 1800, 3600, 7200]);
  assert.equal(HEADED, process.env.ANT_SOAK_HEADED !== 'false');
  const store = new Map([['existing', Object.freeze({ id: 'existing' })]]);
  assert.throws(() => storeShadowDescriptors(store, Array.from({ length: 1025 }, (_, id) => ({ id: String(id) })), 1024,
    () => true, value => value), /capacity/);
  assert.deepEqual([...store.keys()], ['existing'], 'overflow rejection must not mutate history');
  assert.throws(() => storeShadowDescriptors(store,
    Array.from({ length: 1024 }, (_, id) => ({ id: `new-${id}` })), 1024, () => true, value => value), /capacity/);
  assert.deepEqual([...store.keys()], ['existing'], 'projected overflow must not partially store descriptors');
  const successfulStore = new Map();
  assert.equal(storeShadowDescriptors(successfulStore, [{ id: 'one' }, { id: 'two' }], 1024,
    () => true, Object.freeze), 2);
  assert.equal(successfulStore.size, 2, 'standalone shadow helper must store successful additions');
  console.log('ant-exhibition-soak config self-check passed');
  process.exit(0);
}
validateConfig();

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = resolve(OUT, `soak-${runId}`);
const jsonl = resolve(runDir, 'telemetry.jsonl');
const head = await gitHead();
await mkdir(runDir, { recursive: true });
const config = { runId, head, browserExecutable: CHROME, headed: HEADED,
  machine: { cpu: cpus()[0]?.model, logicalProcessors: cpus().length, physicalMemoryBytes: totalmem(),
    platform: platform(), release: release(), node: process.version },
  launchArgs: null, explicitLaunchArgs: EXPLICIT_LAUNCH_ARGS,
  ignoredDefaultArgs: SCHEDULING === 'native' ? THROTTLING_FLAGS : [], scheduling: SCHEDULING,
  mute: false, audio: AUDIO,
  historyCapacity: HISTORY_CAPACITY,
  historyCapacityMode: HISTORY_CAPACITY === 1024
    ? 'runtime-harness-only shadow; world qualification unchanged; production cap 256'
    : 'production defaults; no history-capacity shadow',
  outputCondition: 'Browser context mute=false; OS/device output and physical audibility are not observable by this harness.',
  seed: SEED, targetPlates: TARGET, preGrow: PREGROW, measuredSecondsRequested: SECONDS,
  sampleSeconds: SAMPLE_SECONDS, viewport: { width: WIDTH, height: HEIGHT }, startupQuery: QUERY,
  materialReadout: RECENT_VISUAL ? 'recent exposed birth suffix 8' : 'baseline',
  checkpointSeconds: CHECKPOINTS.filter(value => value <= SECONDS), launchedAt: new Date().toISOString() };
await writeFile(resolve(runDir, 'run.json'), JSON.stringify({ schema: 'ant-exhibition-soak-v1', config }, null, 2) + '\n');

let server, browser, context, page, stopping = false, fatal = null;
let priorSample = null, windowStart = { simulationTimeMs: 0, audioTime: null }, measuredStartPerf = null;
const stop = () => { stopping = true; };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
const writeRecord = async record => appendFile(jsonl, JSON.stringify({ recordedAt: new Date().toISOString(), ...record }) + '\n');
try {
  const serverOptions = { configFile: false, root: ROOT, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' };
  server = await preview(serverOptions);
  browser = await chromium.launch({ headless: !HEADED, executablePath: CHROME,
    args: EXPLICIT_LAUNCH_ARGS, ignoreDefaultArgs: SCHEDULING === 'native' ? THROTTLING_FLAGS : [] });
  const browserCdp = await browser.newBrowserCDPSession();
  await browserCdp.send('Browser.getVersion').then(result => { config.chromeVersion = result.product; });
  await browserCdp.send('Browser.getBrowserCommandLine').then(result => { config.launchArgs = result.arguments; })
    .catch(error => { config.launchArgs = { unavailable: String(error) }; });
  config.muteAudioFlag = Array.isArray(config.launchArgs) ? config.launchArgs.some(arg => /--mute-audio(?:$|=)/i.test(arg)) : null;
  config.backgroundThrottleFlags = Array.isArray(config.launchArgs) ? config.launchArgs.filter(arg => /background|throttl/i.test(arg)) : null;
  if (SCHEDULING === 'no-background-throttling') for (const flag of THROTTLING_FLAGS)
    assert.ok(config.launchArgs?.includes(flag), `missing requested scheduling flag ${flag}`);
  config.sourceProvenance = await hashSources(SOURCE_PATHS);
  config.servedDistProvenance = await hashTree(resolve(ROOT, 'dist')).catch(error => ({ unavailable: String(error) }));
  await browserCdp.send('SystemInfo.getProcessInfo').then(result => {
    config.processInfoAtStart = result.processInfo.map(({ type, id, cpuTime }) => ({ type, id, cpuTime }));
  }).catch(error => { config.processInfoAtStart = { unavailable: String(error) }; });
  await writeFile(resolve(runDir, 'run.json'), JSON.stringify({ schema: 'ant-exhibition-soak-v1', config }, null, 2) + '\n');
  context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  page = await context.newPage();
  await page.bringToFront();
  const errors = [];
  page.on('pageerror', error => { errors.push({ type: 'pageerror', message: String(error), at: new Date().toISOString() }); });
  page.on('console', message => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text(), at: new Date().toISOString() }); });
  page.on('crash', () => errors.push({ type: 'pagecrash', at: new Date().toISOString() }));
  page.on('requestfailed', request => errors.push({ type: 'requestfailed', url: request.url(), message: request.failure()?.errorText }));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Performance.enable');
  await cdp.send('WebAudio.enable');
  const audioContexts = [];
  cdp.on('WebAudio.contextCreated', event => audioContexts.push(event.context.contextId));
  await page.route('**/*.js', async route => {
    const response = await route.fetch();
    const url = new URL(route.request().url());
    let body = await response.text();
    const mount = body.match(/([\w$]+)\(document\.getElementById\("app"\)\);?\s*$/);
    if (/\/assets\/index-[^/]+\.js$/.test(url.pathname) && mount) {
      const needle = `${mount[1]}(document.getElementById("app"))`;
      assert.equal(body.split(needle).length - 1, 1);
      body = body.replace(needle, `globalThis.__exhibitionApp=${needle}`);
    }
    await route.fulfill({ response, body });
  });
  await page.addInitScript(() => {
    window.__exhibitionProbe = { contexts: [], messages: [], totalMessages: 0, processorErrors: [], totalProcessorErrors: 0 };
    const AudioContext0 = window.AudioContext;
    window.AudioContext = class extends AudioContext0 {
      constructor(...args) { super(...args); window.__exhibitionProbe.contexts.push(this); }
    };
    const Worklet0 = window.AudioWorkletNode;
    window.AudioWorkletNode = class extends Worklet0 {
      constructor(context, name, options) {
        super(context, name, options);
        this.port.addEventListener('message', event => {
          const probe = window.__exhibitionProbe;
          probe.totalMessages++;
          probe.messages.push({ wallMs: Date.now(), data: event.data });
          if (probe.messages.length > 32) probe.messages.shift();
        });
        this.port.start();
        this.addEventListener('processorerror', event => {
          const probe = window.__exhibitionProbe;
          probe.totalProcessorErrors++;
          probe.processorErrors.push(String(event));
          if (probe.processorErrors.length > 16) probe.processorErrors.shift();
        });
      }
    };
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${QUERY}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__exhibitionApp?.lab?.registry?.ant));
  const initial = await page.evaluate(async ({ seed, pregrow, target, historyCapacity,
    storeShadowDescriptors, validShadowPlate, cloneFreezeDescriptor }) => {
    storeShadowDescriptors = (0, eval)(`(${storeShadowDescriptors})`);
    validShadowPlate = (0, eval)(`(${validShadowPlate})`);
    cloneFreezeDescriptor = (0, eval)(`(${cloneFreezeDescriptor})`);
    const app = window.__exhibitionApp; await app.ready;
    let rng = seed >>> 0, rngCalls = 0;
    const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; rngCalls++; return rng / 2 ** 32; };
    const factory = app.lab.registry.ant;
    app.lab.registry.ant = options => { const native = Math.random; Math.random = random; try { return factory(options); } finally { Math.random = native; } };
    await app.selectModel('ant');
    const model = app.lab.model;
    if (historyCapacity === 1024) {
      model.trailPlateBirth.maxBirths = 1024;
      model.materialStratigraphy.maxPlates = 1024;
      const surface = model.audioBridge?.surface;
      if (!surface) throw Error('1024-history shadow requires the existing SurfaceAudioBridge');
      const originalStore = surface.storePlates.bind(surface);
      surface.storePlates = function (sources) {
        if (!Array.isArray(sources)) return originalStore(sources);
        return storeShadowDescriptors(this.plates, sources, 1024, validShadowPlate, cloneFreezeDescriptor,
          this, originalStore);
      };
      let label = document.querySelector('#ant-audio-mode-label');
      if (!label) { label = document.createElement('p'); label.id = 'ant-audio-mode-label';
        document.querySelector('#model-description')?.after(label); }
      label.textContent += ' · SHADOW history capacity 1024; world qualification unchanged; production cap 256';
    }
    if (model.random !== random || rngCalls === 0) throw Error('seeded RNG was not captured');
    let ticks = 0; const started = performance.now();
    while (pregrow === 'natural' && model.materialStratigraphy.plates.length < target && ticks < 432000) {
      model.tick(1 / 60); ticks++;
      if (performance.now() - started > 240000) throw Error('natural pre-growth exceeded 240 seconds');
    }
    if (pregrow === 'natural' && model.materialStratigraphy.plates.length < target) throw Error(`seed ${seed} did not reach ${target} Plates`);
    model.resetFrameClock?.();
    window.__exhibition = { model, seed, rng, rngCalls, prerollTicks: ticks, prerollWallMs: performance.now() - started };
    return { prerollTicks: ticks, prerollWallMs: performance.now() - started, rngState: rng, rngCalls,
      simulationTimeMs: model.simulationTimeMs, plates: model.materialStratigraphy.plates.length,
      residentLimit: model.audioBridge?.surface?.residentPlateLimit ?? null,
      residentLayers: model.audioBridge?.surface?.topology?.layerIds?.length ?? 0,
      modeLabel: document.querySelector('#ant-audio-mode-label')?.textContent ?? null,
      visualModeLabel: document.querySelector('#ant-visual-mode-label')?.textContent ?? null,
      world: { population: model.agents.length, historyMaskCells: model.materialStratigraphy.plates.reduce((sum, plate) => {
        let cells = 0; for (let i = 0; i < plate.mask.length; i++) cells += plate.mask[i] === 1;
        return sum + cells;
      }, 0) },
      historyCapacityShadow: { capacity: historyCapacity, mode: historyCapacity === 1024 ? 'harness-only shadow' : 'default',
        status: historyCapacity === 1024 ? 'qualification unchanged; production cap 256' : 'production defaults',
        birthCapacity: model.trailPlateBirth.maxBirths, materialCapacity: model.materialStratigraphy.maxPlates,
        storedAudioHistory: model.audioBridge?.surface?.plates?.size ?? 0 } };
  }, { seed: SEED, pregrow: PREGROW, target: TARGET, historyCapacity: HISTORY_CAPACITY,
    storeShadowDescriptors: storeShadowDescriptors.toString(), validShadowPlate: validShadowPlate.toString(),
    cloneFreezeDescriptor: cloneFreezeDescriptor.toString() });
  if (EXPECTED_RESIDENT_LIMIT !== null) {
    assert.equal(initial.residentLimit, EXPECTED_RESIDENT_LIMIT, 'startup query must configure the bridge resident limit');
    assert.ok(initial.residentLayers <= EXPECTED_RESIDENT_LIMIT, 'startup topology exceeds resident Plate limit');
    if (HISTORY_CAPACITY === 1024) assert.ok(initial.modeLabel?.includes(
      'SHADOW history capacity 1024; world qualification unchanged; production cap 256'));
    else assert.ok(initial.modeLabel?.includes(`newest ${EXPECTED_RESIDENT_LIMIT} acoustic Plate`), 'visible mode label must identify resident mode');
  }
  if (RECENT_VISUAL) assert.ok(initial.visualModeLabel?.includes('newest 8 exposed material layers'),
    'visible startup label must identify the selected recent-material readout');

  let activation = 'Audio Off configured';
  if (AUDIO) {
    await page.locator('[data-action="ant-audio"]').click();
    await page.waitForFunction(() => {
      const model = window.__exhibition?.model;
      const context = model?.audioBridge?.surface?.audioEngine?.context;
      return model?.audioBridge?.enabled && !model.audioBridge.loading && model.audioBridge.surface?.worklet?.node && context?.state === 'running';
    }, null, { timeout: 30000 });
    activation = 'Audio On via Playwright click; verified running AudioContext and worklet';
  }
  const start = await page.evaluate(() => {
    const model = window.__exhibition.model, canvas = document.querySelector('#simulation-canvas');
    return { wallTime: new Date().toISOString(), perfMs: performance.now(), simulationTimeMs: model.simulationTimeMs,
      audioTime: model.audioBridge.surface.audioEngine.context?.currentTime ?? null,
      audioState: model.audioBridge.surface.audioEngine.context?.state ?? null,
      plates: model.materialStratigraphy.plates.length, nodules: model.materialStratigraphy.nodules.length,
      population: model.agents.length, canvas: { width: canvas?.width, height: canvas?.height } };
  });
  if (AUDIO) await page.evaluate(() => {
    const surface = window.__exhibition.model.audioBridge.surface;
    const context = surface.audioEngine.context;
    const analyser = context.createAnalyser(); analyser.fftSize = 2048;
    const silent = context.createGain(); silent.gain.value = 0;
    (surface.worklet.gainNode || surface.worklet.node).connect(analyser);
    analyser.connect(silent); silent.connect(context.destination);
    window.__soakPcmProbe = { analyser, silent, samples: new Float32Array(2048) };
  });
  if (EXPECTED_RESIDENT_LIMIT !== null && AUDIO) {
    const diagnostics = await page.evaluate(async () => {
      const model = window.__exhibition.model; model.requestAudioDiagnostics?.();
      await new Promise(resolve => setTimeout(resolve, 250));
      return model.getSnapshot().audio.diagnostics?.surface?.bridge?.residency;
    });
    assert.equal(diagnostics?.limit, EXPECTED_RESIDENT_LIMIT, 'runtime diagnostic resident limit mismatch');
    assert.ok(diagnostics?.residentPlateCount <= EXPECTED_RESIDENT_LIMIT, 'compiled topology exceeds resident cap');
  }
  windowStart = { simulationTimeMs: start.simulationTimeMs, audioTime: start.audioTime };
  await page.screenshot({ path: resolve(runDir, 'checkpoint-0000s.png') });
  await page.evaluate(() => {
    const { model } = window.__exhibition;
    const stats = window.__soakStats = { rafCount: 0, updateCount: 0, tickCount: 0, tickErrors: [], frameIntervals: [], lastRaf: null };
    const request = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => request.call(window, timestamp => {
      stats.rafCount++;
      if (stats.lastRaf !== null) stats.frameIntervals.push(timestamp - stats.lastRaf);
      stats.lastRaf = timestamp;
      callback(timestamp);
    });
    const update = model.update.bind(model);
    model.update = timestamp => { stats.updateCount++; return update(timestamp); };
    const tick = model.tick.bind(model);
    model.tick = (...args) => { stats.tickCount++; try { return tick(...args); }
      catch (error) { stats.tickErrors.push(String(error)); throw error; } };
    window.__exhibitionMeasuredStart = performance.now();
  });
  const measuredStart = await page.evaluate(() => {
    const model = window.__exhibition.model;
    return { perfMs: window.__exhibitionMeasuredStart, wallTime: new Date().toISOString(),
      simulationTimeMs: model.simulationTimeMs, audioTime: model.audioBridge?.surface?.audioEngine?.context?.currentTime ?? null,
      audioState: model.audioBridge?.surface?.audioEngine?.context?.state ?? null };
  });
  windowStart = { simulationTimeMs: measuredStart.simulationTimeMs, audioTime: measuredStart.audioTime };
  measuredStartPerf = measuredStart.perfMs;
  await saveWorldCheckpoint(0);
  await writeRecord({ type: 'start', initial, activation, start, measuredStart });
  await updateSummary({ status: 'running', elapsedSeconds: 0 });

  let nextCheckpoint = CHECKPOINTS.findIndex(value => value > 0);
  let nextSample = SAMPLE_SECONDS;
  const startedPerf = measuredStart.perfMs;
  while (!stopping) {
    const stopRequest = await readFile(resolve(runDir, 'STOP'), 'utf8').catch(() => null);
    if (stopRequest !== null) { stopping = true; config.stopReason = stopRequest.trim() || 'external STOP file'; break; }
    const now = await page.evaluate(() => performance.now());
    const elapsed = (now - startedPerf) / 1000;
    if (elapsed >= SECONDS) break;
    const nextEvent = Math.min(nextSample, nextCheckpoint >= 0 ? CHECKPOINTS[nextCheckpoint] : Infinity, SECONDS);
    await page.waitForTimeout(Math.max(100, Math.min(5000, (nextEvent - elapsed) * 1000)));
    const perfNow = await page.evaluate(() => performance.now());
    const elapsedNow = (perfNow - startedPerf) / 1000;
    if (elapsedNow >= nextSample - .25 || elapsedNow >= SECONDS) {
      const sample = await collectSample(cdp, browserCdp, audioContexts, errors, elapsedNow);
      await writeRecord({ type: 'sample', elapsedSeconds: elapsedNow, ...sample });
      await updateSummary({ status: 'running', elapsedSeconds: elapsedNow, latest: sample });
      nextSample += SAMPLE_SECONDS;
    }
    if (nextCheckpoint >= 0 && elapsedNow >= CHECKPOINTS[nextCheckpoint] - 1) {
      const checkpoint = CHECKPOINTS[nextCheckpoint];
      await saveWorldCheckpoint(checkpoint);
      await page.screenshot({ path: resolve(runDir, `checkpoint-${String(checkpoint).padStart(4, '0')}s.png`) });
      await writeRecord({ type: 'checkpoint', checkpointSeconds: checkpoint, elapsedSeconds: elapsedNow });
      nextCheckpoint++;
      if (nextCheckpoint >= CHECKPOINTS.length || CHECKPOINTS[nextCheckpoint] > SECONDS) nextCheckpoint = -1;
    }
    if (errors.length) await writeRecord({ type: 'errors', errors: errors.splice(0) });
  }
  const elapsedFinal = await page.evaluate(() => (performance.now() - window.__exhibitionMeasuredStart) / 1000).catch(() => null);
  await saveWorldCheckpoint(Math.round(elapsedFinal ?? 0), 'final');
  await page.screenshot({ path: resolve(runDir, 'checkpoint-final.png') });
  const final = { status: stopping ? 'interrupted' : 'complete', elapsedSeconds: elapsedFinal,
    stopReason: config.stopReason ?? null, finishedAt: new Date().toISOString() };
  await writeRecord({ type: 'end', ...final, errors });
  await updateSummary(final);
} catch (error) {
  fatal = error?.stack || String(error);
  await writeFile(resolve(runDir, 'fatal-error.txt'), fatal);
  await writeRecord({ type: 'fatal', message: fatal });
  await updateSummary({ status: 'failed', fatal });
  throw error;
} finally {
  await page?.close().catch(() => {});
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}

async function collectSample(cdp, browserCdp, audioContexts, errors, requestedElapsedSeconds) {
  const app = await page.evaluate(async () => {
    const { model } = window.__exhibition, canvas = document.querySelector('#simulation-canvas');
    if (model.audioBridge?.enabled) {
      model.requestAudioDiagnostics?.();
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const diagnostics = model.getSnapshot().audio?.diagnostics ?? null;
    const processor = diagnostics?.surface?.processor ?? null;
    const residency = diagnostics?.surface?.bridge?.residency ?? null;
    const stats = window.__soakStats;
    const interval = { rafCount: stats.rafCount, updateCount: stats.updateCount, tickCount: stats.tickCount,
      frameIntervalsMs: stats.frameIntervals.splice(0), tickErrors: stats.tickErrors.splice(0) };
    stats.rafCount = 0; stats.updateCount = 0; stats.tickCount = 0;
    let pcmObservation = null;
    if (window.__soakPcmProbe) {
      const { analyser, samples } = window.__soakPcmProbe;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0, peak = 0, nonFinite = 0, atOrAboveUnity = 0;
      for (const value of samples) {
        if (!Number.isFinite(value)) nonFinite++;
        else { sum += value * value; peak = Math.max(peak, Math.abs(value)); if (Math.abs(value) >= 1) atOrAboveUnity++; }
      }
      pcmObservation = { domain: 'post bridge gain; parallel muted analyser, mono downmix; one 2048-frame window per sample, not continuous clipping coverage',
        frames: samples.length, rms: Math.sqrt(sum / samples.length), peak, nonFinite, atOrAboveUnity };
    }
    return { wallTime: new Date().toISOString(), perfMs: performance.now(), simulationTimeMs: model.simulationTimeMs,
      audioTime: model.audioBridge?.surface?.audioEngine?.context?.currentTime ?? null,
      audioState: model.audioBridge?.surface?.audioEngine?.context?.state ?? null,
      audioEnabled: model.audioBridge?.enabled ?? false,
      plates: model.materialStratigraphy.plates.length, nodules: model.materialStratigraphy.nodules.length,
      population: model.agents.length,
      historyMaskCells: model.materialStratigraphy.plates.reduce((sum, plate) => {
        let cells = 0; for (let i = 0; i < plate.mask.length; i++) cells += plate.mask[i] === 1;
        return sum + cells;
      }, 0),
      zCouplingEnabled: model.audioBridge?.surface?.zCouplingEnabled ?? null,
      zLinks: model.audioBridge?.surface?.topology?.adjacentLinkCoefficients?.length ?? null,
      historyNodes: model.audioBridge?.surface?.topology?.nodeOffsets?.at(-1) ?? null,
      residency, residentTotalDof: residency ? residency.residentNodeCount + residency.residentNoduleDofCount : null,
      residentSphereDof: residency?.residentNoduleDofCount ?? null,
      deepPlateCouplingTransfers: processor?.deepPlateCouplingTransfers ?? null,
      activeNodes: processor?.activeNodes ?? null, awakeLayers: processor?.awakeLayers ?? null,
      sleepingLayers: processor?.sleepingLayers ?? null, wakes: processor?.wakes ?? null, sleeps: processor?.sleeps ?? null,
      nonFinite: processor?.nonFinite ?? null, clipped: processor?.clipped ?? null,
      bridgeDiagnostics: diagnostics?.surface?.bridge ?? null, processorDiagnostics: processor, pcmObservation,
      audioError: model.audioBridge?.error ?? null, visibilityState: document.visibilityState, hasFocus: document.hasFocus(),
      canvas: { width: canvas?.width, height: canvas?.height }, interval,
      processorMessagesTotal: window.__exhibitionProbe.totalMessages,
      processorErrorsTotal: window.__exhibitionProbe.totalProcessorErrors,
      processorErrors: window.__exhibitionProbe.processorErrors.slice() };
  });
  const runtime = await cdp.send('Runtime.getHeapUsage').catch(error => ({ error: String(error) }));
  const memory = await cdp.send('Memory.getDOMCounters').catch(error => ({ error: String(error) }));
  const performance = await cdp.send('Performance.getMetrics').catch(error => ({ error: String(error) }));
  const contextId = audioContexts.at(-1);
  const realtimeAudio = !AUDIO || !contextId ? null
    : await cdp.send('WebAudio.getRealtimeData', { contextId }).catch(error => ({ error: String(error) }));
  const processInfo = await browserCdp.send('SystemInfo.getProcessInfo').catch(error => ({ error: String(error) }));
  const info = processInfo.processInfo?.map(({ type, id, cpuTime }) => ({ type, id, cpuTime })) ?? processInfo;
  if (AUDIO && (!app.audioEnabled || app.audioState !== 'running'))
    throw Error(`continuous audio condition lost at ${requestedElapsedSeconds}s (enabled=${app.audioEnabled}, state=${app.audioState})`);
  const elapsedSeconds = (app.perfMs - measuredStartPerf) / 1000;
  const delta = priorSample ? { wallSeconds: elapsedSeconds - priorSample.elapsedSeconds,
    simulationSeconds: (app.simulationTimeMs - priorSample.simulationTimeMs) / 1000,
    audioSeconds: app.audioTime === null || priorSample.audioTime === null ? null : app.audioTime - priorSample.audioTime }
    : { wallSeconds: null, simulationSeconds: null, audioSeconds: null };
  priorSample = { elapsedSeconds, simulationTimeMs: app.simulationTimeMs, audioTime: app.audioTime };
  delta.simulationPerWall = delta.wallSeconds ? delta.simulationSeconds / delta.wallSeconds : null;
  delta.audioPerWall = delta.wallSeconds && delta.audioSeconds !== null ? delta.audioSeconds / delta.wallSeconds : null;
  return { elapsedSeconds, requestedElapsedSeconds, app, delta, cumulative: { simulationPerWall: (app.simulationTimeMs - windowStart.simulationTimeMs) / (elapsedSeconds * 1000),
    audioPerWall: app.audioTime === null || windowStart.audioTime === null ? null : (app.audioTime - windowStart.audioTime) / elapsedSeconds },
    jsHeap: runtime, domCounters: memory, performanceMetrics: performance, processes: info, realtimeAudio, pageErrors: errors.length };
}

async function saveWorldCheckpoint(second, label = String(second).padStart(4, '0')) {
  const serialized = await page.evaluate(() => {
    const snapshot = window.__exhibition.model.getSnapshot();
    delete snapshot.audio;
    return JSON.stringify(snapshot);
  });
  const raw = Buffer.from(serialized), compressed = gzipSync(raw, { level: 6 });
  const file = `world-${label}.json.gz`;
  await writeFile(resolve(runDir, file), compressed);
  await writeRecord({ type: 'world-checkpoint', checkpointSeconds: second, file,
    sha256: createHash('sha256').update(compressed).digest('hex'), uncompressedBytes: raw.length, compressedBytes: compressed.length });
}

async function updateSummary(status) {
  await writeFile(resolve(runDir, 'heartbeat.json'), JSON.stringify({ schema: 'ant-exhibition-soak-heartbeat-v1',
    updatedAt: new Date().toISOString(), ...status }, null, 2) + '\n');
}

async function hashSources(paths) {
  return Object.fromEntries(await Promise.all(paths.map(async path => {
    const bytes = await readFile(resolve(ROOT, path));
    return [path, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }];
  })));
}

async function gitHead() {
  let gitDir = resolve(ROOT, '.git');
  const marker = await readFile(gitDir, 'utf8').catch(() => null);
  if (marker?.startsWith('gitdir:')) gitDir = resolve(ROOT, marker.slice(7).trim());
  const headPath = resolve(gitDir, 'HEAD');
  const head = (await readFile(headPath, 'utf8')).trim();
  if (/^[a-f\d]{40}$/i.test(head)) return head;
  const refPath = resolve(gitDir, head.slice(5));
  const ref = await readFile(refPath, 'utf8').catch(async () => {
    const packed = await readFile(resolve(gitDir, 'packed-refs'), 'utf8');
    return packed.split(/\r?\n/).find(line => line.endsWith(` ${head.slice(5)}`))?.split(' ')[0] ?? '';
  });
  const commit = ref.trim();
  assert.match(commit, /^[a-f\d]{40}$/i, 'unable to resolve current Git HEAD');
  return commit;
}

async function hashTree(root, relative = '') {
  const entries = await readdir(resolve(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await hashTree(root, path));
    else if (entry.isFile()) {
      const bytes = await readFile(resolve(root, path));
      files.push({ path: path.replaceAll('\\', '/'), bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  return files;
}

function storeShadowDescriptors(store, sources, capacity, validate, freeze, receiver = null, originalStore = null) {
  if (sources.length > capacity) throw new RangeError(`history capacity ${capacity} exceeded`);
  const additions = [], seen = new Set(store.keys());
  for (const source of sources) {
    if (seen.has(source?.id)) continue;
    if (!validate(source)) throw new TypeError(`invalid immutable Plate descriptor: ${source?.id}`);
    seen.add(source.id);
    additions.push(source);
  }
  if (store.size + additions.length > capacity) throw new RangeError(`history capacity ${capacity} exceeded`);
  const nativeCount = originalStore ? Math.max(0, Math.min(additions.length, 256 - store.size)) : 0;
  const nativeAdded = nativeCount && originalStore
    ? originalStore(additions.slice(0, nativeCount)) : 0;
  for (const source of additions.slice(nativeCount)) {
    const descriptor = freeze(source);
    store.set(descriptor.id, descriptor);
    if (receiver?.diagnostics) receiver.diagnostics.births += 1;
  }
  return nativeAdded + additions.length - nativeCount;
}

function validShadowPlate(plate) {
  if (!plate || typeof plate.id !== 'string' || !plate.id.length
    || plate.grid?.width !== 96 || plate.grid?.height !== 96
    || !(Array.isArray(plate.mask) || ArrayBuffer.isView(plate.mask)) || plate.mask.length !== 96 ** 2
    || plate.pickups?.length !== 2 || !plate.pickups.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y)
      && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
    || !Number.isFinite(plate.material?.stiffness) || plate.material.stiffness < 0.65 || plate.material.stiffness > 1.15
    || !Number.isFinite(plate.material?.density) || plate.material.density < 1 || plate.material.density > 1.2
    || !Number.isFinite(plate.material?.damping) || plate.material.damping < 0.25 || plate.material.damping > 0.45
    || !Array.isArray(plate.edges ?? [])) return false;
  let occupied = false;
  for (const value of plate.mask) {
    if (value !== 0 && value !== 1) return false;
    occupied ||= value === 1;
  }
  return occupied && plate.pickups.every(point => plate.mask[
    Math.round(point.y * 95) * 96 + Math.round(point.x * 95)
  ] === 1) && (plate.edges ?? []).every(edge => Array.isArray(edge) && edge.length === 2
    && edge.every(index => Number.isInteger(index) && index >= 0 && index < 96 ** 2));
}

function cloneFreezeDescriptor(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneFreezeDescriptor));
  if (ArrayBuffer.isView(value)) return Object.freeze(Array.from(value, cloneFreezeDescriptor));
  if (!value || typeof value !== 'object') return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneFreezeDescriptor(child)])));
}
