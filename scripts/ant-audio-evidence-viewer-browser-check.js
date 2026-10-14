import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const playwrightVersion = require('playwright/package.json').version;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'docs/ant/evidence/2026-10-14-base-born-natural-event-erb');
const htmlPath = path.join(evidence, 'listening.html');
const checkScriptPath = fileURLToPath(import.meta.url);
const htmlBytes = await readFile(htmlPath);
const checkScriptBytes = await readFile(checkScriptPath);
const remoteRequests = [];
const pageErrors = [];
const localServerRequests = [];
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const target = path.resolve(evidence, '.' + pathname);
    if (!target.startsWith(evidence + path.sep)) { response.writeHead(403).end(); return; }
    const bytes = await readFile(target);
    const ext = path.extname(target).toLowerCase();
    const contentType = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.wav' ? 'audio/wav' : 'application/octet-stream';
    localServerRequests.push(pathname);
    response.writeHead(200, { 'Content-Type': contentType }); response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
const browser = await chromium.launch({ headless: true });
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const localUrl = 'http://127.0.0.1:' + server.address().port;
  const page = await browser.newPage({ acceptDownloads: true });
  page.on('request', request => {
    if (/^https?:/i.test(request.url()) && !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/i.test(request.url()))
      remoteRequests.push(request.url());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  assert.equal(await page.locator('.pair-card').count(), 3, 'three natural-event pairs load');
  assert.equal(await page.locator('input[name="listening-mode"][value="rms-matched-listening-only"]').isChecked(), true,
    'RMS-matched listening mode is default');

  const first = page.locator('.pair-card').first();
  const a = first.locator('audio').nth(0), b = first.locator('audio').nth(1);
  assert.equal(await first.locator('.erb-details').evaluate(node => node.open), false, 'ERB starts hidden');
  assert.equal(await first.locator('.measurement-details').evaluate(node => node.open), false,
    'measurement metadata starts hidden');
  await first.locator('[data-testid="restart-a"]').click();
  await page.waitForFunction(() => {
    const audio = document.querySelector('.pair-card audio');
    return audio && !audio.paused && audio.currentTime > 0.02;
  }, null, { timeout: 5000 });
  assert.match(await a.getAttribute('src'), /rms-matched-listening-only\.wav$/,
    'A starts from the RMS-matched listening-only file');
  const aTimeBeforeRestart = await a.evaluate(audio => audio.currentTime);
  await first.locator('[data-testid="restart-a"]').click();
  const aTimeAfterRestart = await a.evaluate(audio => audio.currentTime);
  assert.ok(aTimeBeforeRestart > 0.02 && aTimeAfterRestart < 0.1,
    'pressing A again restarts the clip from its beginning');

  await first.locator('[data-testid="restart-b"]').click();
  await page.waitForFunction(() => {
    const audio = document.querySelectorAll('.pair-card audio');
    return audio.length >= 2 && audio[0].paused && !audio[1].paused && audio[1].currentTime > 0.02;
  }, null, { timeout: 5000 });
  assert.match(await b.getAttribute('src'), /rms-matched-listening-only\.wav$/,
    'B starts in the same RMS-matched mode');
  assert.equal(await a.evaluate(audio => audio.paused), true, 'playing B pauses A in the same pair');

  await page.locator('input[name="listening-mode"][value="fixed-gain"]').check();
  assert.match(await page.locator('#mode-status').textContent(), /amplitude \/ transfer context/);
  await first.locator('[data-testid="restart-a"]').click();
  await page.waitForFunction(() => {
    const audio = document.querySelector('.pair-card audio');
    return audio && !audio.paused && audio.currentTime > 0.02;
  }, null, { timeout: 5000 });
  assert.match(await a.getAttribute('src'), /fixed-gain\.wav$/, 'fixed-gain mode selects the fixed-gain WAV');

  const erb = first.locator('.erb-details');
  await erb.locator('summary').click();
  assert.equal(await erb.evaluate(node => node.open), true, 'ERB details expand');
  assert.match(await erb.textContent(), /30 equal ERB-rate bands over 0–8 kHz/);
  assert.match(await erb.textContent(), /No per-pair autoscale/);
  assert.equal(await erb.locator('canvas').count(), 3, 'A, B and difference share one revealed region');
  const plotted = await erb.locator('canvas').first().evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(36, 12, 1, 1).data;
    return pixels.some((value, index) => index < 3 && value !== 255);
  });
  assert.equal(plotted, true, 'revealed ERB canvas contains plotted cells');
  await erb.locator('summary').click();
  assert.equal(await erb.evaluate(node => node.open), false, 'ERB details collapse');

  await page.locator('input[name="listening-mode"][value="fixed-gain"]').check();
  await first.locator('[data-field="different"]').selectOption('yes');
  await first.locator('[data-field="note"]').fill('Local-only browser test note');
  await first.locator('[data-action="save-note"]').click();
  assert.match(await first.locator('.save-status').textContent(), /Saved locally/);
  await page.reload({ waitUntil: 'load' });
  const reloaded = page.locator('.pair-card').first();
  assert.equal(await reloaded.locator('[data-field="different"]').inputValue(), 'yes', 'judgment reloads from localStorage');
  assert.equal(await reloaded.locator('[data-field="note"]').inputValue(), 'Local-only browser test note',
    'free note reloads from localStorage');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-notes').click();
  const download = await downloadPromise;
  const exportPayload = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exportPayload.viewerId, 'ant-base-born-natural-event-erb');
  assert.equal(exportPayload.evidenceId, '2026-10-14-base-born-natural-event-erb');
  assert.deepEqual(exportPayload.pairs[0], { pairId: 'q25', listeningMode: 'fixed-gain', different: 'yes',
    note: 'Local-only browser test note' });
  assert.equal(exportPayload.pairs.length, 3, 'export contains all pair records');
  assert.deepEqual(remoteRequests, [], 'page and playback use no remote network requests');
  assert.deepEqual(pageErrors, [], 'page has no uncaught browser errors');

  const serverPage = await browser.newPage();
  serverPage.on('request', request => {
    if (/^https?:/i.test(request.url()) && !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/i.test(request.url()))
      remoteRequests.push(request.url());
  });
  await serverPage.goto(localUrl + '/listening.html', { waitUntil: 'load' });
  assert.equal(await serverPage.locator('.pair-card').count(), 3, 'viewer also loads from a simple local server');
  await serverPage.locator('.pair-card').first().locator('[data-testid="restart-a"]').click();
  await serverPage.waitForFunction(() => {
    const audio = document.querySelector('.pair-card audio');
    return audio && !audio.paused && audio.currentTime > 0.02;
  }, null, { timeout: 5000 });
  assert.ok(localServerRequests.includes('/listening.html'), 'local server serves the HTML');
  assert.ok(localServerRequests.some(url => url.endsWith('q25-base-rms-matched-listening-only.wav')),
    'local server serves the evidence-relative WAV path');
  assert.deepEqual(remoteRequests, [], 'local server mode has no remote network requests');

  const browserValidation = {
    browser: 'Chromium', browserVersion: browser.version(), playwrightVersion, headless: true,
    pageProtocol: 'file:// and local http://127.0.0.1', htmlSha256: createHash('sha256').update(htmlBytes).digest('hex'),
    checkScriptSha256: createHash('sha256').update(checkScriptBytes).digest('hex'),
    checks: { pageLoad: true, defaultRmsMatchedPlaybackA: true, defaultRmsMatchedPlaybackB: true,
      replayStartsFromBeginning: true,
      localServerPageAndAudio: true,
      fixedGainToggleAndPlayback: true, samePairExclusivePlayback: true, erbRevealAndCollapse: true,
      noteLocalStorageSaveAndReload: true, subjectiveJsonExportPayload: true, remoteNetworkRequests: 0,
      uncaughtPageErrors: 0 }, localServerRequests: localServerRequests.length
  };
  console.log(JSON.stringify(browserValidation, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
