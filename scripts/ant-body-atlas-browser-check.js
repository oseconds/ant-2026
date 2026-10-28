import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const base = resolve('docs/ant/evidence/2026-10-28-plate-body-generation-exploration');
const atlas = JSON.parse(await readFile(resolve(base, 'data/atlas.json')));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1150 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
let pixelsChecked = 0;
try {
  await page.goto(pathToFileURL(resolve(base, 'atlas.html')).href);
  await page.waitForFunction(() => window.__atlasReady === true);
  assert.equal(await page.locator('#candidate option').count(), atlas.definitions.length);
  assert.equal(await page.locator('#field option[value="support"]').count(), 1);
  for (let event = 0; event < atlas.events.length; event++) {
    await page.locator('#event').selectOption(String(event));
    for (const def of atlas.definitions) {
      await page.locator('#candidate').selectOption(def.id);
      const c = atlas.events[event].cases.find(c => c.id === def.id);
      const result = await page.evaluate(({ expected, scaffold }) => {
        const canvas = document.getElementById('panel1-body'), ctx = canvas.getContext('2d');
        const image = ctx.getImageData(0, 0, 640, 640).data, skip = new Set(scaffold);
        let checked = 0, mismatch = 0;
        for (let i = 0; i < 96 * 96; i++) if (!skip.has(i)) {
          const x = Math.floor((i % 96 + .5) * 640 / 96), y = Math.floor((Math.floor(i / 96) + .5) * 640 / 96);
          const k = (y * 640 + x) * 4, value = expected[i] ? 0 : 255;
          if (image[k] !== value || image[k + 1] !== value || image[k + 2] !== value) mismatch++;
          checked++;
        }
        return { checked, mismatch, width: canvas.width, height: canvas.height };
      }, { expected: c.mask, scaffold: c.scaffold });
      assert.equal(result.mismatch, 0, `${event}/${def.id} rendered body support`);
      assert.equal(result.width, 640); assert.equal(result.height, 640);
      pixelsChecked += result.checked;
    }
  }
  await page.locator('#candidate').selectOption('M');
  assert.match(await page.locator('.row').first().locator('.panel h3').nth(1).textContent(), /surface/);
  await page.locator('#field').selectOption('support');
  assert.match(await page.locator('.row').first().locator('.panel h3').nth(1).textContent(), /support/);
  await page.locator('#field').selectOption('chemical');
  const fieldCheck = await page.evaluate(() => {
    const d = JSON.parse(document.getElementById('atlas-data').textContent), event = d.events[Number(document.getElementById('event').value)];
    const c = event.cases.find(c => c.id === 'M'), skip = new Set(c.scaffold);
    const px = document.getElementById('panel1-input').getContext('2d').getImageData(0, 0, 640, 640).data;
    let mismatch = 0;
    for (let i = 0; i < 9216; i++) if (!skip.has(i)) {
      const x = Math.floor((i % 96 + .5) * 640 / 96), y = Math.floor((Math.floor(i / 96) + .5) * 640 / 96);
      const expected = Math.round((1 - event.fields.chemical[i]) * 255);
      if (px[(y * 640 + x) * 4] !== expected) mismatch++;
    }
    return { mismatch };
  });
  assert.equal(fieldCheck.mismatch, 0, 'field scale0white/1black');
  await page.locator('#candidate').selectOption('W');
  await page.locator('#candidate2').selectOption('U');
  await page.locator('#field').selectOption('auto');
  const initial = await page.locator('#panel1-body').evaluate(c => c.toDataURL());
  await page.locator('#production').check(); await page.locator('#c0').check();
  assert.notEqual(await page.locator('#panel1-body').evaluate(c => c.toDataURL()), initial, 'overlay controls draw');
  await page.locator('#production').uncheck(); await page.locator('#c0').uncheck();
  const assets = [];
  for (let event = 0; event < atlas.events.length; event++) {
    await page.locator('#event').selectOption(String(event));
    for (const [id, panel] of [['W', 'panel1-body'], ['U', 'panel2-body']]) {
      const data = await page.locator(`#${panel}`).evaluate(c => c.toDataURL('image/png'));
      const file = `validation/${id}-P${event + 1}-native.png`;
      await writeFile(resolve(base, file), Buffer.from(data.split(',')[1], 'base64')); assets.push(file);
    }
  }
  await page.locator('#event').selectOption('0');
  await page.screenshot({ path: resolve(base, 'validation/atlas-W-U-P1.png'), fullPage: true });
  assert.deepEqual(errors, []);
  const receipt = { browser: browser.version(), events: atlas.events.length, candidates: atlas.definitions.length,
    nativeCanvas: [640, 640], bodyCellCentersChecked: pixelsChecked, mismatch: 0,
    fieldScaleCheck: fieldCheck, overlayControls: true, autoFieldSelection: true, supportSelectable: true,
    pageErrors: errors, atlasHtmlSha256: createHash('sha256').update(await readFile(resolve(base, 'atlas.html'))).digest('hex'),
    assets, scope: 'Display/manipulation checks only; human/artistic judgment pending' };
  await writeFile(resolve(base, 'validation/browser.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
} finally { await browser.close(); }
