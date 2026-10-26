import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { preview } from 'vite';
import { chromium } from 'playwright';
const out = resolve('docs/ant/evidence/2026-10-26-g-native-av-observation/attempt-02');
const capture = JSON.parse(await readFile(resolve(out, 'capture.json')));
let replayBundleSha256;
const final = JSON.parse(gunzipSync(await readFile(resolve(out, 'world-final.json.gz'))));
const observed = JSON.parse(gunzipSync(await readFile(resolve(out, 'sidecar.json.gz'))));
const server = await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  // This is a synchronous world-only control, not another AV run or DSP replay.
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  assert.equal(browser.version(), capture.browser);
  const page = await browser.newPage();
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(), original = await response.text();
    replayBundleSha256 = createHash('sha256').update(original).digest('hex');
    assert.equal(replayBundleSha256, capture.bundleExposure.originalSha256, 'Captured and replayed production bundle must match');
    const needle = capture.bundleExposure.needle;
    assert.equal(original.split(needle).length - 1, 1);
    await route.fulfill({ response, body: original.replace(needle, `globalThis.__controlApp=${needle}`) });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, { waitUntil: 'networkidle' });
  const control = await page.evaluate(async ({ ticks, seed }) => {
    const app = __controlApp; await app.ready;
    const factory = app.lab.registry.ant, strikes = [], contacts = [];
    let state = seed >>> 0, calls = 0;
    app.lab.registry.ant = options => {
      const model = factory(options);
      model.random = () => { calls++; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
      model.update = () => false;
      model.audioBridge.surface.workletFactory = () => ({ node: { port: { postMessage(message) {
        if (message.type === 'strike') strikes.push(structuredClone(message.payload));
      } } }, disconnect() {} });
      return model;
    };
    await app.selectModel('ant');
    const model = app.lab.model;
    await model.setAudioEnabled(true);
    model.subscribe(event => {
      if (event.type !== 'foot-contact') return;
      const p = event.payload;
      for (const contact of p.contacts) {
        const { x, y } = contact.position;
        if (x < 0 || x > 1 || y < 0 || y > 1) continue;
        contacts.push({ simulationTimeMs: p.simulationTimeMs, antId: p.antId, contactGroup: p.contactGroup, legId: contact.legId, x, y });
      }
    });
    for (let tick = 0; tick < ticks; tick++) model.tick((1000 / 60) / 1000);
    const snapshot = model.getSnapshot(); snapshot.audio.diagnostics = null;
    return { fingerprint: { simulationTimeMs: model.simulationTimeMs, snapshot }, rng: { state, calls }, strikes, contacts };
  }, { ticks: final.ticks, seed: capture.seed });
  const exact = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const footRows = observed.events.map(({ simulationTimeMs, antId, contactGroup, legId, x, y }) => ({ simulationTimeMs, antId, contactGroup, legId, x, y }));
  const result = { sameChromeVersion: true, browser: browser.version(), sameCompiledBundle: true, replayBundleSha256,
    worldFingerprintExact: exact(control.fingerprint, final.fingerprint), rngExact: exact(control.rng, final.rng),
    contactOrderAndValuesExact: exact(control.contacts, footRows),
    actualStrikePayloadOrderExact: exact(control.strikes, observed.posts.map(p => p.payload)),
    ticks: final.ticks, footResponses: footRows.length, actualStrikes: control.strikes.length,
    audioDspOrPcmReplay: false, newNaturalAvCapture: false };
  await writeFile(resolve(out, 'BROWSER-PARITY.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  assert.ok(result.worldFingerprintExact && result.rngExact && result.contactOrderAndValuesExact && result.actualStrikePayloadOrderExact,
    'Same-engine world/observer parity failed; see bounded receipt instead of dumping large state');
} finally { await browser?.close(); await server.httpServer.close(); }
