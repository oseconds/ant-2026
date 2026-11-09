import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright';

const recording = process.argv.includes('--record');
const output = resolve(process.env.SKETCHBOOK_V1_BROWSER_OUTPUT || 'docs/ant/evidence/2026-11-09-material-sketchbook-v1/browser');
const checkpoints = [0, 1200, 2400, 7200, 18000];
const browserErrors = [];
let server, browser;
const audioProbe = `(() => { const Native = window.AudioContext; window.__audioConstructed = 0; window.AudioContext = class extends Native { constructor(...args) { window.__audioConstructed++; super(...args); } }; })()`;
async function port() {
  const s = createServer(); await new Promise((ok, no) => { s.once('error', no); s.listen(0, '127.0.0.1', ok); });
  const p = s.address().port; await new Promise((ok, no) => s.close(e => e ? no(e) : ok())); return p;
}
async function upload(page, file) {
  await page.locator('#replay').setInputFiles({ name: 'record.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
}
async function state(page) { return page.evaluate(() => window.materialSketchbookV1.state()); }
async function visibleTick(page, tick) {
  await page.waitForFunction(expected => {
    const shown = Number(document.querySelector('#time').textContent.match(/[0-9.]+/)?.[0]);
    return window.materialSketchbookV1.state().tick === expected && shown === Number((expected / 60).toFixed(3));
  }, tick);
  const checked = await page.evaluate(() => ({ tick: window.materialSketchbookV1.state().tick, time: document.querySelector('#time').textContent }));
  assert.equal(checked.tick, tick); assert.equal(Number(checked.time.match(/[0-9.]+/)?.[0]), Number((tick / 60).toFixed(3)));
}
async function capture(page, name) {
  if (recording) {
    const capture = await page.locator('#world').evaluate(canvas => ({
      png: canvas.toDataURL('image/png').split(',')[1],
      corner: [...canvas.getContext('2d').getImageData(0, 0, 1, 1).data]
    }));
    assert.deepEqual(capture.corner, [246, 245, 239, 255], 'canvas renderer fills the fixed #f6f5ef background');
    await writeFile(resolve(output, `${name}.png`), Buffer.from(capture.png, 'base64'));
  }
}
try {
  if (recording) await mkdir(output, { recursive: true });
  const previewPort = await port(); server = await preview({ preview: { host: '127.0.0.1', port: previewPort, strictPort: true }, logLevel: 'error' });
  const url = `http://127.0.0.1:${previewPort}/ant-2026/`;
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1120 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.addInitScript({ content: audioProbe });
  await page.goto(`${url}material-sketchbook-v1.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.materialSketchbookV1);
  const api = await page.evaluate(() => ({ names: Object.keys(window.materialSketchbookV1).sort(), audio: window.__audioConstructed }));
  assert.deepEqual(api.names, ['advance', 'record', 'restore', 'running', 'select', 'state', 'view']); assert.equal(api.audio, 0, 'v1 must not construct AudioContext');
  const frames = [];
  for (const model of ['S', 'T']) {
    await page.evaluate(({ model }) => window.materialSketchbookV1.select(model, 20261005, 'wander'), { model });
    for (const tick of checkpoints) {
      await page.evaluate(tick => window.materialSketchbookV1.advance(tick - window.materialSketchbookV1.state().tick), tick);
      await visibleTick(page, tick);
      const saved = await page.evaluate(() => window.materialSketchbookV1.record());
      assert.equal(saved.tick, tick); assert.equal(saved.digest.length, 8);
      const replay = await page.evaluate(async saved => window.materialSketchbookV1.restore(saved), saved);
      assert.equal(replay.digest, saved.digest, `same-seed full-state replay ${model}@${tick}`);
      assert.equal(JSON.stringify(replay.state), JSON.stringify(saved.state), `full-state bytes/order-equivalent replay ${model}@${tick}`);
      await visibleTick(page, tick);
      await capture(page, `default-${model}-${tick}`);
      frames.push({ model, tick, digest: saved.digest, stateTick: (await state(page)).tick, visibleTime: await page.locator('#time').textContent() });
    }
  }
  await page.evaluate(() => window.materialSketchbookV1.select('S', 20261005, 'wander'));
  await page.locator('#diagnostic').check();
  await page.evaluate(() => window.materialSketchbookV1.advance(7200)); await visibleTick(page, 7200);
  await capture(page, 'diagnostic-S-120');
  await page.evaluate(() => window.materialSketchbookV1.select('T', 20261005, 'wander'));
  await page.evaluate(() => window.materialSketchbookV1.advance(7200)); await visibleTick(page, 7200);
  for (const field of ['rate', 'age']) {
    await page.locator('#field').selectOption(field);
    await visibleTick(page, 7200);
    await capture(page, `diagnostic-T-${field}-120`);
  }
  // Actual run/pause and reset/UI controls.
  await page.locator('#run').click(); await page.waitForFunction(() => window.materialSketchbookV1.running());
  const beforeRun = (await state(page)).tick;
  await page.waitForFunction(tick => window.materialSketchbookV1.state().tick >= tick + 3, beforeRun);
  await page.locator('#run').click(); await page.waitForFunction(() => !window.materialSketchbookV1.running());
  const runTick = (await state(page)).tick; assert.ok(runTick >= beforeRun + 3);
  await page.waitForTimeout(150); assert.equal((await state(page)).tick, runTick, 'paused simulation stays stopped');
  await page.locator('#seed').fill('12345'); await page.locator('#pattern').selectOption('stationary');
  await page.waitForFunction(() => window.materialSketchbookV1.state().tick === 0);
  assert.equal(await page.locator('#seed').inputValue(), '12345'); assert.equal(await page.locator('#pattern').inputValue(), 'stationary');
  await page.locator('#reset').click(); await page.waitForFunction(() => window.materialSketchbookV1.state().tick === 0);
  await page.evaluate(() => window.materialSketchbookV1.advance(20));
  await page.locator('#record').click();
  await page.waitForFunction(() => document.querySelector('#receipt').textContent.includes('Recorded'));
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#record').click()]);
  const downloadedPath = await download.path(); assert.ok(download.suggestedFilename().endsWith('-20.json'));
  await page.locator('#replay').setInputFiles(downloadedPath);
  await page.waitForFunction(() => document.querySelector('#receipt').textContent.includes('Full-state verified'));
  assert.equal((await state(page)).tick, 20);
  const blobRecord = await page.evaluate(() => window.materialSketchbookV1.record());
  const preserved = await state(page);
  const malformed = { schema: 'wrong', tick: 0 };
  await upload(page, malformed);
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Invalid record'));
  assert.deepEqual(await state(page), preserved, 'malformed upload preserves current state');
  const tampered = structuredClone(blobRecord); tampered.state.samples[0].energy = 999; tampered.digest = '00000000';
  await upload(page, tampered);
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Full-state replay mismatch'));
  assert.deepEqual(await state(page), preserved, 'tampered replay preserves current state');
  await page.evaluate(() => window.materialSketchbookV1.select('S', 20261005, 'wander'));
  const s20 = await page.evaluate(() => window.materialSketchbookV1.advance(20));
  await page.evaluate(() => window.materialSketchbookV1.select('T', 20261005, 'wander'));
  const t20 = await page.evaluate(() => window.materialSketchbookV1.advance(20));
  assert.notDeepEqual(s20.state, t20.state, 'models hold isolated state');
  await page.evaluate(() => window.materialSketchbookV1.select('T', 20261005, 'none'));
  await page.evaluate(() => window.materialSketchbookV1.advance(216000), { timeout: 120000 }); await visibleTick(page, 216000);
  let capRejected = false; try { await page.evaluate(() => window.materialSketchbookV1.advance(1)); } catch (error) { capRejected = /Observation limit/.test(error.message); }
  assert.ok(capRejected, 'advance beyond the accepted one-hour limit is rejected');
  const v1Audio = await page.evaluate(() => window.__audioConstructed); assert.equal(v1Audio, 0);

  // Fresh v0 page regression smoke: controls/probe route work and PCM inputs remain bit-identical.
  const old = await browser.newPage({ viewport: { width: 1440, height: 1120 } });
  old.on('pageerror', error => browserErrors.push(`v0: ${error.message}`));
  old.on('console', message => { if (message.type() === 'error') browserErrors.push(`v0: ${message.text()}`); });
  await old.addInitScript({ content: `(() => { const create = AudioBuffer.prototype.getChannelData; window.__pcm = []; AudioBuffer.prototype.getChannelData = function(channel) { const values = create.call(this, channel); if (this.length) window.__pcm.push({ channel, bytes: Array.from(new Uint8Array(values.buffer, values.byteOffset, values.byteLength)) }); return values; }; })()` });
  await old.goto(`${url}material-sketchbook.html`, { waitUntil: 'networkidle' }); await old.waitForFunction(() => !!window.materialSketchbook);
  await old.evaluate(() => window.materialSketchbook.advance(2400));
  await old.locator('#diagnostic').check(); await old.locator('#field').selectOption('mass');
  await old.locator('#monitor-gain').fill('20'); await old.waitForFunction(() => document.querySelector('#monitor-gain-value').textContent === '+20 dB');
  await old.locator('#probe').click(); await old.waitForFunction(() => !document.querySelector('#listen').disabled);
  const beforePcm = await old.evaluate(() => window.materialSketchbook.response(0).left.slice());
  await old.locator('#listen').click(); await old.waitForFunction(() => window.materialSketchbook.audioCreated());
  const afterPcm = await old.evaluate(() => window.materialSketchbook.response(0).left.slice());
  assert.deepEqual(afterPcm, beforePcm, 'v0 monitor playback leaves probe PCM unchanged');
  const v0 = await old.evaluate(() => ({ models: [...document.querySelector('#model').options].map(x => x.value), gain: document.querySelector('#monitor-gain-value').textContent, peak: !!document.querySelector('#peak-meter'), tick: window.materialSketchbook.state().tick }));
  assert.deepEqual(v0.models, ['A', 'B', 'C']); assert.equal(v0.gain, '+20 dB'); assert.ok(v0.peak); assert.equal(v0.tick, 2400);
  await old.close();

  const v0ProbeModels = [];
  const probePage = await browser.newPage();
  probePage.on('pageerror', error => browserErrors.push(`v0 probe: ${error.message}`));
  await probePage.goto(`${url}material-sketchbook.html`, { waitUntil: 'networkidle' }); await probePage.waitForFunction(() => !!window.materialSketchbook);
  for (const model of ['B', 'C']) {
    await probePage.evaluate(model => window.materialSketchbook.select(model, 20261005), model);
    const result = await probePage.evaluate(() => { window.materialSketchbook.advance(2400); const before = JSON.stringify(window.materialSketchbook.state()); const metrics = window.materialSketchbook.probe(); return { tick: window.materialSketchbook.state().tick, sameState: before === JSON.stringify(window.materialSketchbook.state()), metrics }; });
    assert.equal(result.tick, 2400); assert.ok(result.sameState); assert.ok(result.metrics.length > 0);
    v0ProbeModels.push({ model, tick: result.tick, samples: result.metrics.length, probeLeavesStateUnchanged: result.sameState });
  }
  await probePage.close();

  const production = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  production.on('pageerror', error => browserErrors.push(`production: ${error.message}`));
  production.on('console', message => { if (message.type() === 'error') browserErrors.push(`production: ${message.text()}`); });
  await production.goto(url, { waitUntil: 'networkidle' });
  await production.waitForFunction(() => document.querySelectorAll('nav button[data-model]').length === 4 && document.querySelector('#experiment [id="model-title"]'));
  const productionEntry = await production.evaluate(() => ({ models: [...document.querySelectorAll('nav button[data-model]')].map(button => button.dataset.model), selected: document.querySelector('#experiment').dataset.modelView, title: document.querySelector('#model-title').textContent }));
  assert.deepEqual(productionEntry.models, ['ant', 'string', 'plate', 'sphere']); assert.equal(productionEntry.selected, 'ant');
  await production.close();
  assert.deepEqual(browserErrors, [], 'no browser console/page errors');
  const viewport = { width: 1440, height: 1120, canvas: { width: 1200, height: 520 }, seed: 20261005, pattern: 'wander' };
  const receipt = { url, browser: await browser.version(), viewport, capture: { method: 'native canvas.toDataURL(image/png)', width: 1200, height: 520, backgroundRGB: [246, 245, 239] }, v1: { api: api.names, audioContexts: v1Audio, checkpoints: frames, diagnostics: ['S/120s', 'T/rate/120s', 'T/age/120s'], runPauseReset: true, seedPatternReset: true, uiRecordReplay: true, malformedPreservesState: true, tamperedPreservesState: true, modelIsolation: true, hourCap: '216000 ticks accepted; tick 216001 rejected' }, v0: { ...v0, gainControl: true, peakMeterPresent: true, probePcmUnchangedAfterListenGesture: true, probeModels: v0ProbeModels }, productionEntry, browserErrors };
  if (recording) await writeFile(resolve(output, 'browser-check.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) await server.httpServer.close();
}
