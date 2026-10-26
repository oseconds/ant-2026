import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve('docs/ant/evidence/2026-10-26-material-identity-decomposition');
const capture = JSON.parse(await readFile(resolve(root, 'capture.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ffmpeg = execFileSync('where.exe', ['ffmpeg'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
const ids = ['A', 'B', 'C', 'D', 'E'];
const decoded = {};
for (const id of ids) {
  const png = execFileSync(ffmpeg, ['-v', 'error', '-i', resolve(root, `stills/${id}-first-plate-plus-30s.png`),
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 2_000_000 });
  const video = execFileSync(ffmpeg, ['-v', 'error', '-i', resolve(root, `video/${id}.webm`),
    '-vf', `select='eq(n,${capture.world.frameCount - 1})'`, '-fps_mode', 'passthrough',
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 2_000_000 });
  assert.equal(png.length, 640 * 640 * 3);
  assert.equal(video.length, png.length);
  decoded[id] = { lastFrameIndex: capture.world.frameCount - 1, pngRgbSha256: hash(png),
    videoRgbSha256: hash(video), bytesExact: png.equals(video) };
}
await writeFile(resolve(root, 'MEDIA-FFMPEG.json'), JSON.stringify(decoded, null, 2) + '\n');
const server = await createServer({ logLevel: 'error', appType: 'mpa', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  assert.equal(browser.version(), capture.toolVersions.chromium);
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const base = '/docs/ant/evidence/2026-10-26-material-identity-decomposition';
  const response = await page.goto(origin + base + '/review.html');
  assert.ok(response?.ok(), 'review HTML must be served successfully');
  assert.equal(await page.evaluate(() => typeof window.reviewReady?.then === 'function'), true, 'review script must initialize');
  await page.evaluate(() => window.reviewReady);
  assert.equal(await page.locator('#error').textContent(), '');
  assert.equal(await page.locator('#play').isEnabled(), true);
  const initial = await page.evaluate(() => ({
    times: [...document.querySelectorAll('#leftVideo,#rightVideo')].map(v => v.currentTime),
    displayedWidths: [...document.querySelectorAll('#leftVideo,#rightVideo')].map(v => v.getBoundingClientRect().width),
    stillsHidden: [...document.querySelectorAll('#leftStill,#rightStill')].every(v => getComputedStyle(v).display === 'none')
  }));
  assert.deepEqual(initial.displayedWidths, [640, 640]);
  assert.ok(initial.times.every(t => Math.abs(t - capture.firstPlateVideoOffsetSeconds - 15) < .001));
  assert.equal(initial.stillsHidden, false, 'initial exact +15 s stills are intentionally visible');
  for (const [left, right] of [['0', '1'], ['1', '2'], ['2', '3'], ['2', '4']]) {
    await page.selectOption('#left', left);
    await page.waitForFunction(() => !document.querySelector('#play').disabled);
    await page.selectOption('#right', right);
    await page.waitForFunction(() => !document.querySelector('#play').disabled);
    await page.locator('[data-milestone="15"]').click();
    await page.waitForFunction(({left,right}) => [document.querySelector('#leftStill'),document.querySelector('#rightStill')]
      .every((image,index) => image.complete && image.naturalWidth === 640
        && image.getAttribute('src').includes(`${String.fromCharCode(65 + Number(index ? right : left))}-first-plate-plus-15s.png`)), {left,right});
  }
  await page.locator('#play').click();
  await page.waitForFunction(() => !document.querySelector('#leftVideo').paused && !document.querySelector('#rightVideo').paused);
  await page.locator('#pause').click();
  await page.waitForFunction(() => document.querySelector('#leftVideo').paused && document.querySelector('#rightVideo').paused);
  await page.route('**/__identity_decode', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto(origin + '/__identity_decode');
  const chrome = await page.evaluate(async ({ ids, base, frameCount }) => {
    const result = {};
    for (const id of ids) {
      const img = new Image(); img.src = `${base}/stills/${id}-first-plate-plus-30s.png`; await img.decode();
      const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.src = `${base}/video/${id}.webm`;
      video.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px';
      document.body.append(video);
      await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(Error(`${id} decode failed`)); });
      const seeked = new Promise(resolve => video.onseeked = resolve);
      const presented = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error(`${id} decoded frame was not presented`)), 10000);
        const onFrame = (_now, metadata) => {
          if (metadata.mediaTime < (frameCount - 1) / 10 - 1e-6) { video.requestVideoFrameCallback(onFrame); return; }
          clearTimeout(timer); resolve(metadata);
        };
        video.requestVideoFrameCallback(onFrame);
      });
      video.currentTime = video.duration - .05;
      const [, frameMetadata] = await Promise.all([seeked, presented]);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 640;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0); const expected = ctx.getImageData(0, 0, 640, 640).data;
      ctx.clearRect(0, 0, 640, 640); ctx.drawImage(video, 0, 0);
      const actual = ctx.getImageData(0, 0, 640, 640).data;
      let maxDifference = 0, differentPixels = 0, absoluteDifference = 0;
      for (let i = 0; i < actual.length; i += 4) {
        let different = false;
        for (let c = 0; c < 3; c++) { const delta = Math.abs(actual[i + c] - expected[i + c]);
          maxDifference = Math.max(maxDifference, delta); absoluteDifference += delta; different ||= delta !== 0; }
        if (different) differentPixels++;
      }
      result[id] = { width: video.videoWidth, height: video.videoHeight, duration: video.duration,
        sampledCurrentTime: video.currentTime, decodedMediaTime: frameMetadata.mediaTime,
        readyState: video.readyState, maxChannelDifference: maxDifference,
        differentPixels, meanAbsoluteChannelDifference: absoluteDifference / (640 * 640 * 3) };
      video.removeAttribute('src'); video.load(); video.remove();
    }
    return result;
  }, { ids, base, frameCount: capture.world.frameCount });
  const report = { browser: browser.version(), scope: 'final encoded frame compared with exact endpoint PNG for all five videos; no resampling, no audio',
    ffmpeg: decoded, chrome, reviewPage: { initial, pairSelectorsAndStills: true, playbackAndPause: true, pauseStateAsserted: true, pageErrors: errors },
    noArtisticJudgment: true };
  await writeFile(resolve(root, 'MEDIA-VALIDATION.json'), JSON.stringify(report, null, 2) + '\n');
  assert.ok(ids.every(id => decoded[id].bytesExact), 'ffmpeg decoded RGB must equal endpoint PNG');
  assert.ok(ids.every(id => chrome[id].maxChannelDifference === 0), 'Chrome decoded RGB must equal endpoint PNG');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ffmpegRgbExact: ids.every(id => decoded[id].bytesExact),
    chromeRgbExact: ids.every(id => chrome[id].maxChannelDifference === 0), nativeReviewSmoke: true }));
} finally { await browser?.close(); await server.close(); }
