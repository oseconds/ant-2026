import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createServer, preview } from 'vite';
import { chromium } from 'playwright';

const production = process.argv.includes('--production');
const mode = production ? 'production' : 'dev';
const directory = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/browser', mode);
const seed = 20261005;
const server = production
  ? await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
  : await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
if (!production) await server.listen();
let browser;
const errors = [], stages = [], overlays = [];
const fields = ['plate-count', 'plate-exposure', 'nodule-count', 'birth-times', 'substrate-events',
  'audio-layers', 'audio-wall', 'candidate-chemical', 'candidate-support', 'candidate-persistence',
  'candidate-length', 'candidate-contacts', 'candidate-refractory', 'candidate-gap', 'candidate-ready'];
const overlayKeys = ['surface', 'candidate', 'source', 'exposure', 'plateIds', 'pheromone', 'material'];
try {
  await mkdir(directory, { recursive: true });
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  if (production) await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const mount = source.match(/([\w$]+)\(document\.getElementById\("app"\)\);?\s*$/);
    assert.ok(mount, 'production mount is observable without changing implementation');
    const call = `${mount[1]}(document.getElementById("app"))`;
    await route.fulfill({ response, body: source.replace(call, `globalThis.__debugEvidenceApp=${call}`) });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, { waitUntil: 'networkidle' });
  await page.evaluate(async production => {
    const app = production ? window.__debugEvidenceApp : (await import('/src/main.js')).app;
    await app.ready;
    window.__debugEvidenceApp = app;
  }, production);
  assert.equal(await page.locator('#ant-plate-debug').evaluate(node => node.open), false);
  assert.equal(await page.locator('[data-action="ant-substrate"]').getAttribute('aria-pressed'), 'false');
  await page.screenshot({ path: resolve(directory, 'collapsed-default.png'), fullPage: true });
  await page.evaluate(async seed => {
    const app = window.__debugEvidenceApp;
    let randomState = seed >>> 0;
    const factory = app.lab.registry.ant;
    app.lab.registry.ant = options => {
      const model = factory(options);
      model.random = () => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return randomState / 0x100000000;
      };
      return model;
    };
    await app.selectModel('ant');
    // Evidence scheduling only: fixed natural ticks, with RAF continuing to draw snapshots.
    app.lab.model.update = () => false;
    app.lab.model.setAudioVolume(0.35);
  }, seed);
  await page.locator('#ant-plate-debug summary').click();
  assert.deepEqual(await page.locator('[data-ant-overlay]').evaluateAll(nodes => nodes.map(node => node.dataset.antOverlay)), overlayKeys);
  assert.deepEqual(await page.locator('[data-ant-debug]').evaluateAll(nodes => nodes.map(node => node.dataset.antDebug)), fields);

  async function advanceTo(condition) {
    return page.evaluate(condition => {
      const model = window.__debugEvidenceApp.lab.model;
      const matches = () => condition === 'candidate' ? Boolean(model.trailPlateBirth.candidate)
        : condition === 'birth' ? model.trailPlateBirth.plates.length > 0
        : condition === 'overlap' ? model.materialStratigraphy.layerCountByCell.some(count => count > 1)
        : condition === 'repeat' ? Boolean(model.trailPlateBirth.candidate?.repeatDiagnostics)
        : model.materialStratigraphy.nodules.length > 0;
      while (!matches() && model.simulationTimeMs < 600000) model.tick(1 / 60);
      model.emit('update');
      return { found: matches(), simulationSeconds: model.simulationTimeMs / 1000 };
    }, condition);
  }
  async function capture(label) {
    await page.evaluate(() => window.__debugEvidenceApp.lab.model.emit('update'));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await page.evaluate(() => {
      const snapshot = window.__debugEvidenceApp.lab.model.getSnapshot();
      return {
        simulationSeconds: snapshot.analysis.simulationTimeMs / 1000,
        plateCount: snapshot.stratigraphy.layers.plateCount,
        noduleCount: snapshot.stratigraphy.layers.noduleCount,
        history: snapshot.stratigraphy.stratigraphy.plateHistory,
        candidate: snapshot.surfacePlates.candidate,
        audio: snapshot.audio.diagnostics,
        fields: Object.fromEntries([...document.querySelectorAll('[data-ant-debug]')].map(node => [node.dataset.antDebug, node.textContent]))
      };
    });
    assert.equal(result.fields['plate-count'], String(result.plateCount));
    assert.equal(result.fields['nodule-count'], String(result.noduleCount));
    const exposed = result.history.filter(plate => plate.exposedCellCount > 0).length;
    assert.equal(result.fields['plate-exposure'], `${exposed} / ${result.plateCount - exposed}`);
    assert.ok(!result.fields['candidate-chemical'].includes('undefined'));
    if (result.candidate) {
      for (const key of fields.filter(key => key.startsWith('candidate-'))) assert.notEqual(result.fields[key], '—', key);
    }
    stages.push({ label, ...result });
    await page.screenshot({ path: resolve(directory, `${label}.png`), fullPage: true });
  }
  async function checkOverlay(key) {
    for (const option of overlayKeys) await page.locator(`[data-ant-overlay="${option}"]`).uncheck();
    const canvasHash = async () => createHash('sha256').update(await page.locator('#simulation-canvas').screenshot()).digest('hex');
    const before = await canvasHash();
    await page.locator(`[data-ant-overlay="${key}"]`).check();
    const after = await canvasHash();
    assert.notEqual(after, before, `${key} changes actual browser canvas when natural data exists`);
    overlays.push({ key, before, after, simulationSeconds: await page.evaluate(() => window.__debugEvidenceApp.lab.model.simulationTimeMs / 1000) });
    await page.screenshot({ path: resolve(directory, `overlay-${key}.png`), fullPage: true });
  }
  async function liveContacts() {
    await page.evaluate(async () => {
      const model = window.__debugEvidenceApp.lab.model;
      for (let tick = 0; tick < 120; tick++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        model.tick(1 / 60);
      }
      model.requestAudioDiagnostics();
    });
    await page.waitForFunction(() => window.__debugEvidenceApp.lab.model.audioBridge.surface.processorDiagnostics?.physicsSteps > 0);
  }
  await capture('pre-candidate');
  assert.equal((await advanceTo('candidate')).found, true);
  await capture('natural-candidate');
  for (const key of ['surface', 'candidate', 'source', 'pheromone']) await checkOverlay(key);
  assert.equal((await advanceTo('birth')).found, true);
  await checkOverlay('plateIds');
  await checkOverlay('material');
  await page.locator('[data-action="ant-audio"]').click();
  await page.waitForFunction(() => {
    const audio = window.__debugEvidenceApp.lab.model.audioBridge;
    return audio.enabled && !audio.loading;
  });
  await page.evaluate(() => window.__debugEvidenceApp.lab.model.requestAudioDiagnostics());
  await page.waitForFunction(() => Boolean(window.__debugEvidenceApp.lab.model.audioBridge.surface.processorDiagnostics));
  await capture('first-birth-installed-sleeping');
  await liveContacts();
  await capture('first-birth-audio');
  assert.notEqual(stages.at(-1).fields['audio-layers'], '—');
  assert.notEqual(stages.at(-1).fields['audio-wall'], '—');
  await page.locator('[data-action="ant-substrate"]').click();
  await page.waitForFunction(() => Boolean(window.__debugEvidenceApp.lab.model.audioBridge.basePlate?.worklet));
  await liveContacts();
  await capture('first-birth-substrate-on');
  assert.ok(stages.at(-1).audio.baseSubstrate.deliveredGroups > 0);
  await page.locator('[data-action="ant-substrate"]').click();
  assert.equal(await page.locator('[data-action="ant-substrate"]').getAttribute('aria-pressed'), 'false');
  await page.locator('[data-action="ant-audio"]').click();
  assert.equal((await advanceTo('overlap')).found, true);
  await checkOverlay('exposure');
  await capture('natural-overlap');
  const repeat = await advanceTo('repeat');
  await capture(repeat.found ? 'natural-repeat-candidate' : 'no-repeat-at-limit');
  const nodule = await advanceTo('nodule');
  await capture(nodule.found ? 'natural-nodule' : 'no-nodule-at-limit');
  for (const key of overlayKeys) await page.locator(`[data-ant-overlay="${key}"]`).setChecked(['material'].includes(key));
  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(layout.document <= layout.viewport, 'expanded mobile debug panel fits viewport');
  await page.screenshot({ path: resolve(directory, 'expanded-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(resolve(directory, 'summary.json'), JSON.stringify({ status: 'pass', mode, seed,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), chrome: browser.version(),
    scheduling: 'Fixed natural 60 Hz ticks; original update bypassed only to freeze stages. No behavior/qualification tuning. Audio diagnostics observed live; this is not a realtime stress test.',
    fields, overlays, stages, layout, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'pass', mode, overlays: overlays.map(item => item.key), stages: stages.map(item => ({ label: item.label, simulationSeconds: item.simulationSeconds, plates: item.plateCount, nodules: item.noduleCount })), directory }));
} finally {
  await browser?.close();
  if (production) await new Promise(resolve => server.httpServer.close(resolve));
  else await server.close();
}
