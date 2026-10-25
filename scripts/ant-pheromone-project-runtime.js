import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const arm = process.argv[process.argv.indexOf('--arm') + 1];
assert(['C', 'G'].includes(arm), 'Usage: node scripts/ant-pheromone-project-runtime.js --arm C|G');
const root = resolve(import.meta.dirname, '..');
const outputDir = resolve(root, 'docs/ant/evidence/2026-10-25-pheromone-project-decision/runtime');
const sourcePaths = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/renderers/AntRenderer.js',
  'scripts/ant-g-runtime-field.js', 'scripts/ant-pheromone-project-runtime.js'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
  [path, sha256(await readFile(resolve(root, path)))])));
let server, browser;
try {
  await mkdir(outputDir, { recursive: true });
  const before = await sourceHashes();
  server = await createServer({ configFile: resolve(root, 'vite.config.js'), server: { host: '127.0.0.1', port: 4174, strictPort: true } });
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle' });
  const result = await page.evaluate(async ({ arm }) => {
    const main = await import('/src/main.js');
    await main.app.destroy();
    document.body.replaceChildren();
    document.body.style.cssText = 'margin:0;width:900px;height:900px;overflow:hidden';
    const mount = document.createElement('div'); mount.style.cssText = 'width:900px;height:900px';
    const canvas = document.createElement('canvas'); canvas.id = 'simulation-canvas'; canvas.width = 900; canvas.height = 900;
    mount.append(canvas); document.body.append(mount);
    const [{ AntController }, { AntRenderer }, fieldModule] = await Promise.all([
      import('/src/lib/agents/ant/AntController.js'), import('/src/lib/renderers/AntRenderer.js'),
      arm === 'G' ? import('/scripts/ant-g-runtime-field.js') : import('/src/lib/agents/ant/PheromoneField.js')
    ]);
    let rngState = 20261005, rngCalls = 0;
    const random = () => { rngCalls += 1; rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 0x100000000; };
    const controller = new AntController({ random, fieldFactory: options => arm === 'G'
      ? new fieldModule.RuntimeGField({ ...options, width: 316, height: 316 })
      : new fieldModule.PheromoneField({ ...options, width: 96, height: 96 }) });
    const controllerInitStart = performance.now();
    await controller.init();
    const controllerInitMs = performance.now() - controllerInitStart;
    const renderer = new AntRenderer(canvas);
    const initStart = performance.now();
    await renderer.init({ width: 900, height: 900, pixelRatio: 1 });
    const rendererInitMs = performance.now() - initStart;
    const warmStart = performance.now();
    for (let tick = 0; tick < 36000; tick += 1) controller.tick(1 / 60);
    const warmupWallMs = performance.now() - warmStart;
    const initialAgents = controller.agents.length;
    const initialPlates = controller.trailPlateBirth.getPlates().length;
    const startSimulationTimeMs = controller.simulationTimeMs;
    controller.lastFrameTimestamp = null; controller.accumulatorMs = 0;

    const metric = () => ({ count: 0, totalMs: 0, maxMs: 0 });
    const timings = { update: metric(), snapshot: metric(), fieldSnapshot: metric(), decay: metric(),
      pointWriter: metric(), segmentWriter: metric(), renderCall: metric(), drawCompletion: metric() };
    const wrap = (object, key, target) => {
      const original = object[key];
      object[key] = function(...args) {
        const start = performance.now();
        try { return original.apply(this, args); }
        finally { const ms = performance.now() - start; target.count++; target.totalMs += ms; target.maxMs = Math.max(target.maxMs, ms); }
      };
    };
    wrap(controller, 'getSnapshot', timings.snapshot);
    wrap(controller.field, 'getSnapshot', timings.fieldSnapshot);
    wrap(controller.field, 'decay', timings.decay);
    wrap(controller.field, 'depositPoint', timings.pointWriter);
    wrap(controller.field, 'depositSegment', timings.segmentWriter);
    const draw = renderer.instance.draw;
    renderer.instance.draw = function(...args) {
      const start = performance.now();
      try { return draw.apply(this, args); }
      finally { const ms = performance.now() - start; timings.drawCompletion.count++; timings.drawCompletion.totalMs += ms; timings.drawCompletion.maxMs = Math.max(timings.drawCompletion.maxMs, ms); }
    };
    const frames = [], heap = [], errors = [], start = performance.now();
    let last = null, first = true;
    const sampleHeap = () => {
      if (performance.memory) heap.push({ wallMs: performance.now() - start, usedBytes: performance.memory.usedJSHeapSize,
        totalBytes: performance.memory.totalJSHeapSize, limitBytes: performance.memory.jsHeapSizeLimit });
    };
    const frame = timestamp => {
      if (first) { first = false; last = timestamp; requestAnimationFrame(frame); return; }
      const interval = timestamp - last; last = timestamp;
      const updateStart = performance.now(); controller.update(timestamp); const updateMs = performance.now() - updateStart;
      timings.update.count++; timings.update.totalMs += updateMs; timings.update.maxMs = Math.max(timings.update.maxMs, updateMs);
      const snapshotStart = performance.now(); const snapshot = controller.getSnapshot(); const snapshotMs = performance.now() - snapshotStart;
      const renderStart = performance.now(); renderer.render(snapshot, { time: timestamp }); const renderMs = performance.now() - renderStart;
      frames.push({ timestamp, intervalMs: interval, updateMs, snapshotMs, renderCallMs: renderMs,
        simulationTimeMs: controller.simulationTimeMs, clampedFrame: interval > 100 });
      if (timestamp - start >= 1000 && Math.floor((timestamp - start) / 1000) !== Math.floor((timestamp - start - interval) / 1000)) sampleHeap();
      if (timestamp - start < 60000) requestAnimationFrame(frame);
      else finish();
    };
    let resolveDone;
    const done = new Promise(resolve => { resolveDone = resolve; });
    const finish = () => {
      const end = performance.now();
      resolveDone({ arm, seed: 20261005, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        visible: document.visibilityState, controllerInitMs, rendererInitMs, warmupWallMs, measuredWallMs: end - start,
        simulationAdvanceMs: controller.simulationTimeMs - startSimulationTimeMs,
        discardedByClampMs: Math.max(0, (end - start) - (controller.simulationTimeMs - startSimulationTimeMs)),
        initialAgents, finalAgents: controller.agents.length, spawned: controller.totalSpawned, retired: controller.totalRetired,
        initialPlates, finalPlates: controller.trailPlateBirth.getPlates().length,
        rngCalls, rngState, timings, frames, heap, errors });
    };
    requestAnimationFrame(frame);
    const output = await done;
    await renderer.destroy(); await controller.destroy();
    return output;
  }, { arm });
  const after = await sourceHashes();
  assert.deepEqual(after, before, 'source hashes changed during browser run');
  const metrics = result.frames.map(frame => frame.intervalMs).sort((a,b) => a-b);
  const percentile = p => metrics.length ? metrics[Math.min(metrics.length - 1, Math.floor((metrics.length - 1) * p))] : null;
  result.raf = { frames: result.frames.length, fps: result.frames.length / (result.measuredWallMs / 1000),
    intervalP50Ms: percentile(.5), intervalP95Ms: percentile(.95), intervalP99Ms: percentile(.99) };
  result.chromeVersion = browser.version(); result.sourceHashes = before; result.runnerHash = before['scripts/ant-pheromone-project-runtime.js'];
  result.errors = [...result.errors, ...pageErrors];
  assert.equal(result.visible, 'visible', 'benchmark page lost foreground visibility');
  assert(result.measuredWallMs >= 60000, 'measured wall period shorter than preregistered 60 s');
  const path = resolve(outputDir, `runtime-${arm}.json`);
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ path, arm, chromeVersion: result.chromeVersion, fps: result.raf.fps,
    simulationAdvanceMs: result.simulationAdvanceMs, measuredWallMs: result.measuredWallMs, sourceHashes: result.sourceHashes }));
} catch (error) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, `runtime-${arm}-failure.txt`), `${error.stack || error}\n`);
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}
