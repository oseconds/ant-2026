import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { denseLapSource, fastWakeSource } from './ant-exhibition-variants.js';

// Real installed-Chrome runtime capture. Synchronous pre-growth uses current
// controller.tick() with audio disabled; the measured interval is live rAF + audio.
const ROOT = process.cwd();
const OUT = resolve(ROOT, 'docs/ant/evidence/2026-10-21-exhibition-audio-runtime');
const CHROME = process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET = Number(process.env.ANT_TARGET_PLATES || 8);
const SECONDS = Number(process.env.ANT_RUNTIME_SECONDS || 20);
const AUDIO = process.env.ANT_AUDIO !== 'off';
const VARIANT = process.env.ANT_WORKLET_VARIANT || 'full';
assert.ok([0, 8, 20, 30].includes(TARGET), 'ANT_TARGET_PLATES must be 0 (silent control), 8, 20, or 30');
assert.ok(Number.isFinite(SECONDS) && SECONDS > 0 && SECONDS <= 120, 'ANT_RUNTIME_SECONDS must be in (0,120]');
assert.ok(['full', 'fast-wake', 'dense-lap', 'z-off', 'z-off-dense-lap'].includes(VARIANT), 'Unknown worklet variant');
const SEED = 20261005, DT = 1 / 60;
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = resolve(OUT, `runtime-${runId}-${TARGET}-${AUDIO ? VARIANT : 'audio-off'}`);
const hash = value => createHash('sha256').update(value).digest('hex');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const workletPath = resolve(ROOT, 'static/worklets/surface-plate.worklet.js');
const productionWorklet = await readFile(workletPath, 'utf8');
const workletHash = hash(productionWorklet);
const inMemoryWorklet = VARIANT === 'fast-wake' ? fastWakeSource(productionWorklet)
  : VARIANT === 'dense-lap' || VARIANT === 'z-off-dense-lap' ? denseLapSource(productionWorklet) : productionWorklet;
await mkdir(runDir, { recursive: true });

const middleware = (req, res, next) => {
  if (req.url?.split('?')[0] !== '/worklets/surface-plate.worklet.js') return next();
  res.setHeader('content-type', 'application/javascript');
  res.setHeader('cache-control', 'no-store');
  res.end(inMemoryWorklet);
};
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
  plugins: [{ name: 'exhibition-runtime-worklet-variant', configurePreviewServer(s) { s.middlewares.use(middleware); } }] });
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  let pageError = null;
  page.on('pageerror', e => { pageError = String(e); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAudio.enable');
  const contexts = [];
  cdp.on('WebAudio.contextCreated', e => contexts.push(e.context.contextId));

  // The existing app entry mount is exposed in memory for the harness only.
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
    window.__exhibitionProbe = { contexts: [], messages: [], processorErrors: [] };
    const AudioContext0 = window.AudioContext;
    window.AudioContext = class extends AudioContext0 {
      constructor(...args) { super(...args); window.__exhibitionProbe.contexts.push(this); }
    };
    const Worklet0 = window.AudioWorkletNode;
    window.AudioWorkletNode = class extends Worklet0 {
      constructor(context, name, options) {
        super(context, name, options);
        this.port.addEventListener('message', event => window.__exhibitionProbe.messages.push({
          wallMs: Date.now(), perfMs: performance.now(), audioTime: context.currentTime, data: event.data }));
        this.port.start();
        this.addEventListener('processorerror', event => window.__exhibitionProbe.processorErrors.push(String(event)));
      }
    };
  });
  const liteQuery = VARIANT.startsWith('z-off') ? '?antAudio=lite' : '';
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${liteQuery}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__exhibitionApp?.lab?.registry?.ant));
  const preroll = await page.evaluate(async ({ seed, target }) => {
    const app = window.__exhibitionApp;
    await app.ready;
    let rng = seed >>> 0, rngCalls = 0;
    const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; rngCalls++; return rng / 2 ** 32; };
    const factory = app.lab.registry.ant;
    app.lab.registry.ant = options => {
      const nativeRandom = Math.random;
      Math.random = random;
      try { return factory(options); }
      finally { Math.random = nativeRandom; }
    };
    await app.selectModel('ant');
    const model = app.lab.model;
    if (model.random !== random || rngCalls === 0) throw Error('Seeded RNG was not captured by the controller constructor');
    const count = () => model.materialStratigraphy.plates.length;
    const started = performance.now();
    let ticks = 0;
    while (count() < target && ticks < 3600 * 60) {
      model.tick(1 / 60); ticks++;
      if (performance.now() - started > 120000) throw Error(`natural pre-growth exceeded 120 seconds at ${count()} Plates`);
    }
    if (count() < target) throw Error(`seed ${seed} did not reach ${target} Plates`);
    model.resetFrameClock?.();
    const worldSnapshot = model.getSnapshot();
    delete worldSnapshot.audio;
    window.__exhibition = { model, seed, target, prerollTicks: ticks,
      prerollWallMs: performance.now() - started, prerollSimulationTimeMs: model.simulationTimeMs };
    return { ticks, wallMs: performance.now() - started, simulationTimeMs: model.simulationTimeMs,
      plates: count(), nodules: model.materialStratigraphy.nodules.length,
      population: model.agents.length, rngState: rng, rngCalls, initialAgentIds: model.agents.map(agent => agent.id),
      worldSnapshotJson: JSON.stringify(worldSnapshot),
      topology: { couplingLinks: model.audioBridge?.surface?.topology?.adjacentLinkCoefficients?.length ?? null,
        zCouplingEnabled: model.audioBridge?.surface?.zCouplingEnabled ?? null }, startupQuery: location.search };
  }, { seed: SEED, target: TARGET });
  preroll.prerollWorldSha256 = hash(preroll.worldSnapshotJson);
  delete preroll.worldSnapshotJson;

  await page.waitForTimeout(250);
  if (AUDIO) {
    await page.locator('[data-action="ant-audio"]').click();
    await page.waitForFunction(() => {
      const model = window.__exhibition.model;
      return model.audioBridge?.enabled && !model.audioBridge.loading && model.audioBridge.surface?.worklet?.node;
    }, null, { timeout: 30000 });
  }
  const start = await page.evaluate(() => ({ wallTime: new Date().toISOString(), perfMs: performance.now(),
    simulationTimeMs: window.__exhibition.model.simulationTimeMs,
    audioTime: window.__exhibition.model.audioBridge?.surface?.audioEngine?.context?.currentTime ?? null,
    contextState: window.__exhibition.model.audioBridge?.surface?.audioEngine?.context?.state ?? null,
    plates: window.__exhibition.model.materialStratigraphy.plates.length,
    nodules: window.__exhibition.model.materialStratigraphy.nodules.length,
    population: window.__exhibition.model.agents.length,
    topology: { zCouplingEnabled: window.__exhibition.model.audioBridge?.surface?.zCouplingEnabled ?? null,
      couplingLinks: window.__exhibition.model.audioBridge?.surface?.topology?.adjacentLinkCoefficients?.length ?? null },
    canvas: (() => { const c = document.querySelector('#simulation-canvas'); return {width:c?.width,height:c?.height, pixels:c?.toDataURL()}; })() }));
  if (VARIANT.startsWith('z-off')) {
    assert.equal(start.topology.zCouplingEnabled, false, 'lite startup must disable Z coupling');
    if (AUDIO) assert.equal(start.topology.couplingLinks, 0, 'lite topology must omit Z coupling links');
  }
  await page.evaluate(() => {
    const e = window.__exhibition, model = e.model;
    let rafCount = 0, lastFrame = null, frameIntervals = [], modelUpdates = 0;
    const unsubscribe = model.subscribe(({ type }) => { if (type === 'update') modelUpdates++; });
    const original = requestAnimationFrame;
    const hook = cb => original.call(window, time => { rafCount++; if (lastFrame !== null) frameIntervals.push(time - lastFrame); lastFrame = time; cb(time); });
    window.__exhibitionRafRestore = () => { window.requestAnimationFrame = original; };
    window.requestAnimationFrame = hook;
    const canvas = document.querySelector('#simulation-canvas');
    window.__exhibitionSample = { start: { perfMs: performance.now(), wallTime: Date.now(), sim: model.simulationTimeMs,
      audio: model.audioBridge?.surface?.audioEngine?.context?.currentTime ?? null },
      poll() { return { perfMs: performance.now(), wallTime: Date.now(), simulationTimeMs: model.simulationTimeMs,
        audioTime: model.audioBridge?.surface?.audioEngine?.context?.currentTime ?? null,
        plates: model.materialStratigraphy.plates.length, nodules: model.materialStratigraphy.nodules.length,
        population: model.agents.length, canvasDataUrl: canvas.toDataURL() }; },
      finish() { unsubscribe(); window.__exhibitionRafRestore(); return { end: { perfMs: performance.now(), wallTime: Date.now(), sim: model.simulationTimeMs,
      audio: model.audioBridge?.surface?.audioEngine?.context?.currentTime ?? null }, rafCount, frameIntervals,
      modelUpdates,
      canvas: { width: canvas.width, height: canvas.height }, plates: model.materialStratigraphy.plates.length,
      nodules: model.materialStratigraphy.nodules.length, population: model.agents.length,
      simulationErrors: model.error ?? null, topology: { couplingLinks: model.audioBridge?.surface?.topology?.adjacentLinkCoefficients?.length ?? null,
        zCouplingEnabled: model.audioBridge?.surface?.zCouplingEnabled ?? null } }; } };
  });
  const sampleMeta = await page.evaluate(() => window.__exhibitionSample.start);
  const samples = [], realtimeSamples = [];
  while ((await page.evaluate(() => performance.now())) - sampleMeta.perfMs < SECONDS * 1000) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const poll = await page.evaluate(() => window.__exhibitionSample.poll());
    const canvasDataUrl = poll.canvasDataUrl; delete poll.canvasDataUrl;
    samples.push({ ...poll, canvasPixelSha256: hash(canvasDataUrl) });
    const id = contexts.at(-1);
    if (!id) { realtimeSamples.push({ at: poll.wallTime, unavailable: 'No WebAudio context was observed' }); continue; }
    try { realtimeSamples.push({ at: poll.wallTime,
      ...(await cdp.send('WebAudio.getRealtimeData', { contextId: id })) }); }
    catch (error) { realtimeSamples.push({ at: poll.wallTime, unavailable: String(error) }); }
  }
  const measured = await page.evaluate(() => window.__exhibitionSample.finish());
  const sample = { start: sampleMeta, end: measured.end, rafCount: measured.rafCount,
    frameIntervals: measured.frameIntervals, modelUpdates: measured.modelUpdates,
    samples, canvas: measured.canvas, plates: measured.plates, nodules: measured.nodules,
    population: measured.population, simulationErrors: measured.simulationErrors, topology: measured.topology };
  const processorDiagnostics = await page.evaluate(async () => {
    const model = window.__exhibition.model;
    const before = window.__exhibitionProbe.messages.length;
    model.requestAudioDiagnostics?.();
    await new Promise(resolve => setTimeout(resolve, 200));
    return { bridge: model.audioBridge?.surface?.diagnostics ?? null,
      messages: window.__exhibitionProbe.messages.slice(before),
      processorErrors: window.__exhibitionProbe.processorErrors };
  });
  await page.screenshot({ path: resolve(runDir, 'runtime.png'), fullPage: true });
  const result = { schema: 'ant-exhibition-real-chrome-runtime-v1', runId, head,
    browser: { executable: CHROME, version: browser.version(), mode: 'headless installed Chrome' },
    configuration: { seed: SEED, targetPlates: TARGET, measuredSecondsRequested: SECONDS,
      audio: AUDIO, workletVariant: VARIANT, preGrowth: 'natural AntController.tick(1/60), audio disabled; measured interval begins after audio start',
      seedComparison: 'Compare prerollWorldSha256, tick count, RNG state, and RNG calls only across runs in the same Chrome runtime; Node capture milestone ticks are a different runtime workload.',
      startupQuery: liteQuery, simulation: 'current production model source and rAF-driven AntController.update; current production renderer' },
    source: { workletPath: 'static/worklets/surface-plate.worklet.js', productionSha256: workletHash,
      servedSha256: hash(inMemoryWorklet), variant: VARIANT }, preroll, start, sample,
    cdpRealtime: realtimeSamples, processorDiagnostics, pageError,
    derived: { wallSeconds: (sample.end.perfMs - sample.start.perfMs) / 1000,
      simulationSeconds: (sample.end.sim - sample.start.sim) / 1000,
      simulationPerWall: (sample.end.sim - sample.start.sim) / (sample.end.perfMs - sample.start.perfMs),
      audioSeconds: sample.end.audio === null || sample.start.audio === null ? null : sample.end.audio - sample.start.audio,
      audioPerWall: sample.end.audio === null || sample.start.audio === null ? null
        : (sample.end.audio - sample.start.audio) / ((sample.end.perfMs - sample.start.perfMs) / 1000),
      meanRafHz: sample.rafCount / ((sample.end.perfMs - sample.start.perfMs) / 1000),
      modelUpdateEvents: sample.modelUpdates,
      canvasPixelSha256: { start: hash(start.canvas.pixels), end: sample.samples.at(-1)?.canvasPixelSha256 ?? null },
      canvasPixelsChanged: Boolean(sample.samples.length && hash(start.canvas.pixels) !== sample.samples.at(-1).canvasPixelSha256),
      frameIntervalP95Ms: percentile(sample.frameIntervals, .95),
      canvasResolution: sample.canvas },
    scope: 'A cold audio start after natural synchronous model pre-growth. Not a long continuous mature-world soak.' };
  assert.equal(pageError, null, pageError || undefined);
  await writeFile(resolve(runDir, 'runtime.json'), JSON.stringify(result, null, 2) + '\n');
  await page.close(); await context.close();
  console.log(JSON.stringify({ output: runDir, targetPlates: TARGET, audio: AUDIO, variant: VARIANT,
    prerollTicks: preroll.ticks, simPerWall: result.derived.simulationPerWall,
    audioPerWall: result.derived.audioPerWall, meanRafHz: result.derived.meanRafHz }, null, 2));
} catch (error) {
  await writeFile(resolve(runDir, 'fatal-error.txt'), error?.stack || String(error));
  throw error;
} finally { await browser?.close(); await server.close(); }

function percentile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}
