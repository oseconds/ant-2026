import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer, preview } from 'vite';
import { chromium } from 'playwright';

const production = process.argv.includes('--production');
const mode = production ? 'production' : 'dev';
const directory = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/plate-geometry', mode);
const seed = 20261005;
const defaults = { surface: false, candidate: false, source: false, exposure: false,
  plateIds: false, plateOutlines: false, plateCenterlines: false, platePickups: false,
  pheromone: true, material: true };
const server = production
  ? await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
  : await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
if (!production) await server.listen();
let browser;
const errors = [], stages = [];
try {
  await mkdir(directory, { recursive: true });
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  if (production) await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const mount = source.match(/([\w$]+)\(document\.getElementById\("app"\)\);?\s*$/);
    assert.ok(mount, 'production mount can be observed');
    const call = `${mount[1]}(document.getElementById("app"))`;
    await route.fulfill({ response, body: source.replace(call, `globalThis.__plateGeometryApp=${call}`) });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, { waitUntil: 'networkidle' });
  await page.evaluate(async ({ production, seed }) => {
    const app = production ? window.__plateGeometryApp : (await import('/src/main.js')).app;
    await app.ready;
    window.__plateGeometryApp = app;
    let state = seed >>> 0;
    const factory = app.lab.registry.ant;
    app.lab.registry.ant = options => {
      const model = factory(options);
      model.random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
      return model;
    };
    await app.selectModel('ant');
    // Freeze only display scheduling; natural ticks retain the existing model rules.
    app.lab.model.update = () => false;
    window.__plateGeometryState = () => {
      const model = app.lab.model;
      return JSON.stringify({ agents: model.getSnapshot().agents,
        surface: model.surfaceField.getSnapshot(), pheromone: model.field.getSnapshot(),
        plates: model.trailPlateBirth.plates, material: model.materialStratigraphy.getSnapshot() },
      (_key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value);
    };
  }, { production, seed });
  assert.equal(await page.locator('#ant-plate-debug').evaluate(node => node.open), false);
  assert.equal(await page.locator('[data-action="ant-substrate"]').getAttribute('aria-pressed'), 'false');
  await page.locator('#ant-plate-debug summary').click();
  assert.deepEqual(await page.locator('[data-ant-overlay]').evaluateAll(nodes =>
    Object.fromEntries(nodes.map(node => [node.dataset.antOverlay, node.checked]))), defaults);

  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const canvasHash = async () => createHash('sha256').update(await page.locator('#simulation-canvas').screenshot()).digest('hex');
  async function capture(label, count, overlap = false) {
    const geometry = await page.evaluate(({ count, overlap }) => {
      const model = window.__plateGeometryApp.lab.model;
      const found = () => model.trailPlateBirth.plates.length >= count
        && (!overlap || model.materialStratigraphy.layerCountByCell.some(value => value > 1));
      while (!found() && model.simulationTimeMs < 600000) model.tick(1 / 60);
      if (!found()) throw new Error('Natural geometry milestone missing');
      model.emit('update');
      const material = model.materialStratigraphy.getSnapshot();
      const topology = model.audioBridge.surface.topology;
      return { simulationSeconds: model.simulationTimeMs / 1000,
        plates: model.trailPlateBirth.plates.map((plate, layer) => {
          const nodes = new Map(plate.centerline.map(node => [node.index, node]));
          const reached = new Set([plate.centerline[0].index]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const [a, b] of plate.edges) if (reached.has(a) || reached.has(b)) {
              if (!reached.has(a) || !reached.has(b)) changed = true;
              reached.add(a); reached.add(b);
            }
          }
          const audioLayer = topology.layerIds.indexOf(plate.id);
          const pickups = [0, 1].map(index => {
            const node = topology.pickupNodeIndices[audioLayer * 2 + index];
            const cell = topology.nodeGridIndices[node], grid = topology.solverGrid;
            return { node, cell, x: (cell % grid) / (grid - 1), y: Math.floor(cell / grid) / (grid - 1) };
          });
          const occupied = plate.mask.reduce((sum, value) => sum + Boolean(value), 0);
          const exposed = plate.mask.reduce((sum, value, cell) => sum
            + Boolean(value && material.stratigraphy.topLayerByCell[cell] === layer), 0);
          return { id: plate.id, nodeCount: nodes.size, edgeCount: plate.edges.length,
            connected: reached.size === nodes.size, occupied, exposed, buried: occupied - exposed,
            frozenTargets: plate.pickups, pickups };
        }) };
    }, { count, overlap });
    for (const plate of geometry.plates) {
      assert.equal(plate.connected, true, `${plate.id} frozen centerline is one connected graph`);
      assert.equal(plate.pickups.length, 2);
      assert.ok(plate.pickups.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
    }
    if (overlap) assert.ok(geometry.plates.some(plate => plate.buried > 0));
    await settle();
    const state = await page.evaluate(() => window.__plateGeometryState());
    const baseline = await canvasHash();
    const toggles = {};
    for (const key of ['plateOutlines', 'plateCenterlines', 'platePickups']) {
      await page.locator(`[data-ant-overlay="${key}"]`).check(); await settle();
      const rendered = await canvasHash();
      assert.notEqual(rendered, baseline, `${key} paints geometry`);
      toggles[key] = rendered;
      await page.locator(`[data-ant-overlay="${key}"]`).uncheck();
    }
    for (const key of ['plateIds', 'plateOutlines', 'plateCenterlines', 'platePickups', 'source'])
      await page.locator(`[data-ant-overlay="${key}"]`).check();
    await settle();
    assert.equal(await page.evaluate(() => window.__plateGeometryState()), state,
      'debug overlays leave agents, fields, frozen descriptors and stratigraphy unchanged');
    await page.screenshot({ path: resolve(directory, `${label}.png`), fullPage: true });
    await page.locator('#simulation-canvas').screenshot({ path: resolve(directory, `${label}-canvas.png`) });
    for (const [key, checked] of Object.entries(defaults))
      await page.locator(`[data-ant-overlay="${key}"]`).setChecked(checked);
    await settle();
    assert.equal(await canvasHash(), baseline, 'restoring defaults exactly restores production canvas');
    stages.push({ label, ...geometry, toggles, readOnly: true, defaultCanvasRestored: true });
  }
  await capture('first-birth', 1);
  await capture('natural-overlap', 2, true);
  await capture('three-plates', 3, true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(directory, 'expanded-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  const sources = ['src/lib/renderers/AntRenderer.js', 'src/main.js', 'src/demo/documentViews.js'];
  const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async path =>
    [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
  await writeFile(resolve(directory, 'summary.json'), JSON.stringify({ status: 'pass', mode, seed,
    chrome: browser.version(), sources: sourceHashes, defaults, stages, errors,
    method: 'Fresh matched seed with natural fixed 60 Hz ticks. No audio enabled. Existing compiled topology supplies actual pickup positions. Display scheduling alone is frozen. PCM and invariance harnesses remain unchanged.' }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'pass', mode, stages: stages.map(({ label, simulationSeconds, plates }) =>
    ({ label, simulationSeconds, plateIds: plates.map(plate => plate.id) })), directory }));
} finally {
  await browser?.close();
  if (production) await new Promise(resolve => server.httpServer.close(resolve));
  else await server.close();
}
