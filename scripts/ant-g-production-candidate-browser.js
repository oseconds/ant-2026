import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright';

const SEED = 20261005;
const smoke = process.argv.includes('--smoke');
const SCREEN_SECONDS = smoke ? 2 : 60;
const SOAK_SECONDS = smoke ? 2 : 180;
const WARMUP_SIM_SECONDS = smoke ? 2 : 600;
const OUTPUT = resolve(process.env.ANT_G_BROWSER_OUTPUT || 'docs/ant/evidence/2026-10-25-g-production-candidate-review');
const CHROME = process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const hash = value => createHash('sha256').update(value).digest('hex');
const probe = `(() => {
  const p = window.__gBrowser = { intervals: [], callbackMs: [], audioContexts: 0, last: null };
  const NativeAudioContext = window.AudioContext;
  if (NativeAudioContext) window.AudioContext = class extends NativeAudioContext {
    constructor(...args) { super(...args); p.audioContexts++; }
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(timestamp => {
    const start = performance.now();
    if (p.last !== null) p.intervals.push({ at: timestamp, ms: timestamp - p.last });
    p.last = timestamp;
    callback(timestamp);
    p.callbackMs.push({ at: timestamp, ms: performance.now() - start });
  });
})();`;

let server, browser;
const pageErrors = [], consoleErrors = [], failedRequests = [];
const runtime = { samples: [], phase: 'warmup', sourceHashes: {} };

try {
  await mkdir(OUTPUT, { recursive: true });
  for (const path of ['src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/AntController.js',
    'src/main.js', 'dist/assets/index.css']) {
    try { runtime.sourceHashes[path] = hash(await readFile(resolve(path))); }
    catch { if (path !== 'dist/assets/index.css') throw new Error('missing runtime provenance source: ' + path); }
  }
  server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
  const address = server.httpServer.address();
  assert.ok(address?.port, 'production preview binds a port');
  browser = await chromium.launch({ headless: false, executablePath: CHROME,
    args: ['--enable-precise-memory-info', '--disable-background-timer-throttling'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.addInitScript(probe);
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch();
    let body = await response.text();
    const match = body.match(/([\w$]+)\(document\.getElementById\("app"\)\);?\s*$/);
    assert(match, 'built entry exposes the application mount call for read-only observation');
    const call = `${match[1]}(document.getElementById("app"))`;
    assert.equal(body.split(call).length - 1, 1);
    body = body.replace(call, `globalThis.__gApp=${call}`);
    await route.fulfill({ response, body });
  });
  const startedWall = Date.now();
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__gApp?.lab));
  await page.evaluate(async seed => {
    const app = window.__gApp;
    await app.ready;
    let state = seed >>> 0;
    let calls = 0;
    const seeded = () => { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
    const factory = app.lab.registry.ant;
    app.lab.registry.ant = options => { const model = factory(options); model.random = seeded; return model; };
    await app.selectModel('ant');
    const model = app.lab.model;
    const p = window.__gBrowser;
    p.seed = seed;
    p.startWall = Date.now();
    p.startPerf = performance.now();
    p.initialRngState = state;
    p.rngCallsAtStart = calls;
    p.initialState = { sim: model.simulationTimeMs, population: model.agents.length,
      fieldSize: model.field.values.length, width: model.field.width, height: model.field.height,
      audioEnabled: model.audioBridge?.enabled ?? false };
    p.costs = { update: [], snapshot: [], decay: [] };
    const update = model.update.bind(model);
    model.update = timestamp => { const t = performance.now(); const result = update(timestamp); p.costs.update.push(performance.now() - t); return result; };
    const snapshot = model.getSnapshot.bind(model);
    model.getSnapshot = (...args) => { const t = performance.now(); const result = snapshot(...args); p.costs.snapshot.push(performance.now() - t); return result; };
    const decay = model.field.decay.bind(model.field);
    model.field.decay = (...args) => { const t = performance.now(); const result = decay(...args); p.costs.decay.push(performance.now() - t); return result; };
  }, SEED);
  await page.bringToFront();
  await page.locator('#simulation-canvas').waitFor({ state: 'visible' });
  const initial = await page.evaluate(() => ({ ...window.__gBrowser.initialState,
    audioContexts: window.__gBrowser.audioContexts, model: window.__gApp.lab.model.constructor.name }));
  assert.equal(initial.width, 316);
  assert.equal(initial.height, 316);
  assert.equal(initial.audioEnabled, false);
  assert.equal(initial.audioContexts, 0);
  runtime.initial = initial;

  const maxWallSeconds = WARMUP_SIM_SECONDS + SCREEN_SECONDS + SOAK_SECONDS + 240;
  const startedPerf = await page.evaluate(() => performance.now());
  let nextProgress = 30;
  let phase = 'warmup';
  let screenStartPerf = null, soakStartPerf = null;
  while (true) {
    await page.waitForTimeout(1000);
    const sample = await page.evaluate(() => {
      const model = window.__gApp.lab.model;
      const fields = model.field.values;
      let maxNode = 0, nodeSum = 0, finite = true;
      for (const value of fields) { maxNode = Math.max(maxNode, value); nodeSum += value; finite &&= Number.isFinite(value); }
      const plates = model.trailPlateBirth.getPlates();
      const memory = performance.memory?.usedJSHeapSize ?? null;
      return { wallMs: Date.now(), perfMs: performance.now(), simMs: model.simulationTimeMs,
        population: model.agents.length, spawned: model.totalSpawned, retired: model.totalRetired,
        plates: plates.length, firstPlateMs: plates[0]?.bornAtSimulationTimeMs ?? null,
        contacts: model.surfaceField.totalFootContacts, maxNode, nodeSum, finite, heapBytes: memory,
        activation: model.colonyActivation.activation, modelRunning: model.running };
    });
    const elapsed = (sample.perfMs - startedPerf) / 1000;
    if (phase === 'warmup' && sample.simMs >= WARMUP_SIM_SECONDS * 1000) {
      phase = 'screen'; screenStartPerf = sample.perfMs;
      await page.evaluate(value => { window.__gBrowser.screenStartPerf = value; }, screenStartPerf);
      runtime.screenStart = sample;
      await page.screenshot({ path: resolve(OUTPUT, 'production-candidate-600s.png') });
    } else if (phase === 'screen' && sample.perfMs - screenStartPerf >= SCREEN_SECONDS * 1000) {
      phase = 'soak'; soakStartPerf = sample.perfMs;
      await page.evaluate(value => { window.__gBrowser.soakStartPerf = value; }, soakStartPerf);
      runtime.soakStart = sample;
    }
    sample.phase = phase;
    runtime.samples.push(sample);
    if (Math.floor(elapsed) >= nextProgress) {
      console.log(JSON.stringify({ elapsedWallSeconds: Math.floor(elapsed), simulationSeconds: sample.simMs / 1000,
        phase, population: sample.population, plates: sample.plates, maxNode: sample.maxNode }));
      nextProgress += 30;
    }
    if (!sample.finite) throw new Error('nonfinite pheromone field during browser run');
    if (elapsed > maxWallSeconds) throw new Error('simulation clock did not reach the bounded runtime endpoint');
    if (phase === 'soak' && sample.perfMs - soakStartPerf >= SOAK_SECONDS * 1000) break;
  }
  const end = await page.evaluate(() => {
    const p = window.__gBrowser;
    const model = window.__gApp.lab.model;
    const summarize = values => {
      const sorted = [...values].sort((a, b) => a - b);
      const at = q => sorted[Math.floor((sorted.length - 1) * q)] ?? null;
      return { count: sorted.length, p50: at(.5), p95: at(.95), p99: at(.99), max: sorted.at(-1) ?? null };
    };
    const intervals = p.intervals.filter(item => item.at >= p.startPerf);
    const callbacks = p.callbackMs.filter(item => item.at >= p.startPerf);
    const screen = callbacks.filter(item => item.at >= p.screenStartPerf && item.at < p.soakStartPerf);
    const screenGaps = intervals.filter(item => item.at >= p.screenStartPerf && item.at < p.soakStartPerf);
    const soak = callbacks.filter(item => item.at >= p.soakStartPerf);
    const soakGaps = intervals.filter(item => item.at >= p.soakStartPerf);
    const clampLoss = list => list.reduce((sum, item) => sum + Math.max(0, item.ms - 100), 0);
    const longGaps = list => list.filter(item => item.ms > 100).length;
    return { endWallMs: Date.now(), endPerfMs: performance.now(), simulationTimeMs: model.simulationTimeMs,
      population: model.agents.length, plates: model.trailPlateBirth.getPlates().length,
      field: { width: model.field.width, height: model.field.height, max: model.field.values.reduce((max, value) => Math.max(max, value), 0),
        finite: model.field.values.every(Number.isFinite), nodeSum: model.field.getSnapshot().nodeSum,
        reconstructedIntegral: model.field.getSnapshot().reconstructedIntegral },
      audioContexts: p.audioContexts, updateCostMs: summarize(p.costs.update), snapshotCostMs: summarize(p.costs.snapshot),
      decayCostMs: summarize(p.costs.decay), screen: { frames: screen.length, callbackCostMs: summarize(screen.map(x => x.ms)),
        rafIntervalMs: summarize(screenGaps.map(x => x.ms)), longGaps: longGaps(screenGaps), clampLossMs: clampLoss(screenGaps) },
      soak: { frames: soak.length, callbackCostMs: summarize(soak.map(x => x.ms)),
        rafIntervalMs: summarize(soakGaps.map(x => x.ms)), longGaps: longGaps(soakGaps), clampLossMs: clampLoss(soakGaps) },
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
      rngCallsAtStart: p.rngCallsAtStart };
  });
  runtime.end = end;
  runtime.wallElapsedSeconds = (Date.now() - startedWall) / 1000;
  const sampleAt = perfMs => runtime.samples.reduce((best, item) =>
    Math.abs(item.perfMs - perfMs) < Math.abs(best.perfMs - perfMs) ? item : best);
  const heapValues = runtime.samples.map(item => item.heapBytes).filter(Number.isFinite);
  runtime.heapTrend = { first: runtime.samples[0]?.heapBytes ?? null,
    atScreenStart: runtime.screenStart?.heapBytes ?? null,
    atSoakStart: runtime.soakStart?.heapBytes ?? null,
    last: runtime.samples.at(-1)?.heapBytes ?? null,
    max: heapValues.length ? Math.max(...heapValues) : null };
  runtime.runWindow = { startSimulationMs: runtime.samples[0]?.simMs ?? null,
    endSimulationMs: runtime.samples.at(-1)?.simMs ?? null,
    wallSecondsFromSamples: runtime.samples.length > 1
      ? (runtime.samples.at(-1).perfMs - runtime.samples[0].perfMs) / 1000 : null,
    simulatedSecondsFromSamples: runtime.samples.length > 1
      ? (runtime.samples.at(-1).simMs - runtime.samples[0].simMs) / 1000 : null,
    sampledMaxNodeValue: runtime.samples.reduce((max, item) => Math.max(max, item.maxNode), 0),
    sampledPlateRange: { min: Math.min(...runtime.samples.map(item => item.plates)),
      max: Math.max(...runtime.samples.map(item => item.plates)) } };
  runtime.pageErrors = pageErrors;
  runtime.consoleErrors = consoleErrors;
  runtime.failedRequests = failedRequests;
  runtime.browser = { version: browser.version(), executablePath: CHROME, headless: false,
    renderer: 'production Vite preview of npm build output', audio: 'Off' };
  await writeFile(resolve(OUTPUT, 'BROWSER-RUNTIME.json'), JSON.stringify(runtime, null, 2) + '\n');
  console.log(JSON.stringify({ output: resolve(OUTPUT, 'BROWSER-RUNTIME.json'), initial, end,
    pageErrors: pageErrors.length, consoleErrors: consoleErrors.length, failedRequests: failedRequests.length }));
} finally {
  await browser?.close();
  await server?.close();
}
