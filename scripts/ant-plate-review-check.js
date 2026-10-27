import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const base = resolve('docs/ant/evidence/2026-10-28-plate-formation-gate');
await mkdir(resolve(base, 'validation'), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(resolve(base, 'review.html')).href);
  assert.equal(await page.locator('canvas').count(), 5);
  const samples = [];
  for (const index of [0, 64, 83, 84, 106, 119]) {
    await page.locator('#time').evaluate((e, i) => { e.value = i; e.dispatchEvent(new Event('input')); }, index);
    const measured = await page.evaluate(() => {
      const f = frames[Number(slider.value)], mismatches = [];
      for (let i = 0; i < 5; i++) {
        const data = document.getElementById('map' + i).getContext('2d').getImageData(0, 0, 640, 640).data;
        const expected = new Map();
        if (i < 4) for (const c of f.maps[i]) expected.set(c, [17, 17, 17]);
        else for (const [name, cells] of Object.entries(f.groups ?? {})) {
          const hex = colors[name];
          const rgb = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
          for (const c of cells) expected.set(c, rgb);
        }
        let n = 0;
        for (let c = 0; c < 9216; c++) {
          const x = Math.round((c % 96) * 639 / 95), y = Math.round(Math.floor(c / 96) * 639 / 95);
          const rgb = expected.get(c) ?? [255, 255, 255], offset = (y * 640 + x) * 4;
          if (rgb.some((v, channel) => data[offset + channel] !== v)) n++;
        }
        mismatches.push(n);
      }
      return { index: Number(slider.value), time: f.t, mismatches, status: document.getElementById('status').textContent };
    });
    assert.deepEqual(measured.mismatches, [0, 0, 0, 0, 0]); samples.push(measured);
  }
  await page.getByRole('button', { name: '첫 birth', exact: true }).click();
  assert.match(await page.locator('#status').textContent(), /84\.016667/);
  await page.screenshot({ path: resolve(base, 'validation/review-first-birth.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(resolve(base, 'validation/browser-review.json'), JSON.stringify({ browser: browser.version(), headless: true,
    channel: 'chrome', canvasCount: 5, nativeCanvas: [640, 640], sampledFrames: samples,
    all96CellCentersMatchAtSampledFrames: true, firstBirthButton: true, pageErrors: errors,
    scope: 'technical review HTML only; no ANT simulation, AV capture, listening or aesthetic judgement' }, null, 2) + '\n');
  console.log('Review check passed: six saved frames × five maps × 9216 cell centers; no page errors.');
} finally { await browser.close(); }
