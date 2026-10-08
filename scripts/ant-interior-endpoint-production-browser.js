import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-08-interior-endpoint-production/visual');
const SEED = 20261005;
const CHROME = process.env.BROWSER_EXECUTABLE_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MILESTONES = [120, 300, 600];
let server, browser;

try {
  await mkdir(OUTPUT, { recursive: true });
  server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object');
  browser = await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    await app.ready;
    await app.destroy();
    document.body.innerHTML = `<main style="max-width:1160px;margin:24px auto;font:16px system-ui;color:#222">
      <h1>ANT interior-endpoint production candidate</h1>
      <p id="milestone"></p><div id="scene" style="width:1100px;height:1100px"></div></main>`;
    const canvas = document.createElement('canvas');
    canvas.id = 'simulation-canvas';
    document.querySelector('#scene').append(canvas);
    const [{ AntController }, { AntRenderer }] = await Promise.all([
      import('/src/lib/agents/ant/AntController.js'), import('/src/lib/renderers/AntRenderer.js')
    ]);
    let state = 20261005 >>> 0;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const model = new AntController({ random });
    await model.init();
    const renderer = new AntRenderer(canvas);
    await renderer.init({ width: 1100, height: 1100, pixelRatio: 1 });
    renderer.setDebugOptions({ pheromone: true, material: true, plateOutlines: true,
      plateCenterlines: true, platePickups: true, plateIds: false });
    let ticks = 0;
    window.__candidateVisualAdvance = ({ seconds, targetTicks }) => {
      for (; ticks < targetTicks; ticks += 1) model.tick(1 / 60);
      const snapshot = model.getSnapshot();
      document.querySelector('#milestone').textContent =
        `${seconds} s · ${snapshot.surfacePlates.plates.length} born Plates · ${snapshot.analysis.population} active ants · Plate outlines / centerlines / pickups`;
      renderer.render(snapshot);
      return { simulationTimeMs: model.simulationTimeMs, population: snapshot.analysis.population,
        totalSpawned: snapshot.analysis.totalSpawned, totalRetired: snapshot.analysis.totalRetired,
        plateCount: snapshot.surfacePlates.plates.length,
        surfacePlates: snapshot.surfacePlates.plates.map(plate => ({ id: plate.id,
          centerlineCells: plate.centerline.length, maskCells: plate.mask.reduce((sum, value) => sum + value, 0),
          pickupCount: plate.pickups.length })) };
    };
  });

  const captures = [];
  for (const seconds of MILESTONES) {
    const targetTicks = seconds * 60;
    const metrics = await page.evaluate(({ seconds, targetTicks }) =>
      window.__candidateVisualAdvance({ seconds, targetTicks }), { seconds, targetTicks });
    assert.equal(Math.round(metrics.simulationTimeMs * 60 / 1000), targetTicks);
    assert.ok(metrics.plateCount > 0, `natural candidate has born Plates by ${seconds} s`);
    const path = resolve(OUTPUT, `chrome-candidate-${seconds}s.png`);
    await page.screenshot({ path, fullPage: true });
    captures.push({ seconds, ...metrics, screenshot: path });
    console.log(JSON.stringify({ seconds, plateCount: metrics.plateCount,
      totalSpawned: metrics.totalSpawned, totalRetired: metrics.totalRetired }));
  }
  assert.deepEqual(pageErrors, [], `Chrome page errors: ${pageErrors.join('; ')}`);
  const manifest = { browser: existsSync(CHROME) ? 'Google Chrome' : 'Playwright Chromium',
    browserExecutable: existsSync(CHROME) ? CHROME : null, browserVersion: browser.version(),
    mode: 'Vite development; framework-independent natural AntController; AudioBridge absent; existing AntRenderer Plate overlays',
    seed: SEED, dtSeconds: 1 / 60, captures };
  await writeFile(resolve(OUTPUT, 'chrome-visual-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
} finally {
  await browser?.close().catch(() => {});
  if (server) await server.close().catch(() => {});
}
