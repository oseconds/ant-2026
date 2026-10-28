import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const base = resolve('docs/ant/evidence/2026-10-28-event-scoped-material-support');
await mkdir(resolve(base, 'validation'), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(resolve(base, 'atlas.html')).href);
  assert.equal(await page.locator('canvas').count(), 6);
  const checks = [];
  for (const event of ['0', '1']) {
    await page.selectOption('#event', event);
    const result = await page.evaluate(() => {
      const d = atlasData[Number(choose.value)], expected = Array.from({ length: 6 }, () => new Map());
      for (const c of d.cells) {
        expected[0].set(c.cell, c.occupancy); expected[1].set(c.cell, Number(c.carryIn));
        expected[2].set(c.cell, c.mechanicalIncrementShare ?? 0); if (c.finalRibbon) expected[3].set(c.cell, 1);
      }
      for (const c of d.controls.core) expected[4].set(c, 1);
      for (const c of d.controls.closing) expected[5].set(c, 1);
      const mismatches = expected.map((map, i) => {
        const canvas = document.getElementById('map' + i), data = canvas.getContext('2d').getImageData(0, 0, 640, 640).data;
        let n = 0;
        for (let c = 0; c < 9216; c++) {
          const value = map.get(c), gray = value === undefined ? (i < 3 ? 238 : 255) : 255 - Math.round(255 * Math.max(0, Math.min(1, value)));
          const x = Math.round(c % 96 * 639 / 95), y = Math.round(Math.floor(c / 96) * 639 / 95), at = (y * 640 + x) * 4;
          if (data[at] !== gray || data[at + 1] !== gray || data[at + 2] !== gray) n++;
        }
        return n;
      });
      return { event: Number(choose.value), census: d.cells.length, mismatches,
        histogramBins: document.querySelectorAll('#histogram rect').length, status: document.getElementById('status').textContent };
    });
    assert.deepEqual(result.mismatches, [0, 0, 0, 0, 0, 0]); assert.equal(result.histogramBins, 22); checks.push(result);
  }
  const cell = await page.evaluate(() => atlasData[1].cells[0].cell);
  const box = await page.locator('#map0').boundingBox();
  await page.mouse.click(box.x + (cell % 96) / 95 * box.width, box.y + Math.floor(cell / 96) / 95 * box.height);
  assert.equal(JSON.parse(await page.locator('#detail').textContent()).cell, cell);
  await page.selectOption('#event', '0'); assert.match(await page.locator('#detail').textContent(), /클릭/);
  await page.screenshot({ path: resolve(base, 'validation/atlas-event-1.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(resolve(base, 'validation/browser.json'), JSON.stringify({ browser: browser.version(), headless: true,
    events: checks, canvas: [640, 640], sixMapsPerEvent: true, all9216CellCentersMatch: true,
    cellInspector: true, inspectorClearsOnEventChange: true, pageErrors: errors,
    scope: 'technical atlas only; no ANT world, native AV or artistic judgement' }, null, 2) + '\n');
  console.log('Atlas browser check passed: two events × six maps × 9216 source-cell centers.');
} finally { await browser.close(); }
