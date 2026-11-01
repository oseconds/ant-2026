import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(ROOT, 'docs/ant/evidence/2026-11-01-bc-commit-slot-ambiguity-audit');
const { makeBrowser } = await import('./ant-b-vs-c-author-review.js');
const svg = await readFile(resolve(OUT, 'visual/objective-slot-atlas.svg'));
const html = `<html><body style="margin:0"><img id="atlas" src="data:image/svg+xml;base64,${svg.toString('base64')}"/></body></html>`;
const { server, browser, page } = await makeBrowser();
try {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.setContent(html);
  const image = page.locator('#atlas');
  const dimensions = await image.evaluate(async element => {
    await element.decode();
    return { width: element.naturalWidth, height: element.naturalHeight };
  });
  assert.equal(dimensions.width, 1280, 'SVG atlas width');
  const png = await image.screenshot({ type: 'png', animations: 'disabled' });
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a', 'PNG signature');
  assert.equal(png.readUInt32BE(16), dimensions.width, 'PNG width matches SVG');
  assert.equal(png.readUInt32BE(20), dimensions.height, 'PNG height matches SVG');
  await writeFile(resolve(OUT, 'visual/objective-slot-atlas.png'), png);
  await writeFile(resolve(OUT, 'analysis/objective-slot-atlas-render.json'), JSON.stringify({
    schema: 'ant-bc-commit-slot-atlas-render-v1', svgSha256: (await import('node:crypto'))
      .createHash('sha256').update(svg).digest('hex'), pngBytes: png.length,
    pngDimensions: dimensions, browserErrors: [] }, null, 2) + '\n');
  console.log(JSON.stringify({ complete: true, bytes: png.length, dimensions }));
} finally {
  await page.evaluate(() => window.__reviewRenderer?.destroy());
  await browser.close();
  await server.close();
}
