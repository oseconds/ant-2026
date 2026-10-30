import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-31-recruitment-heading-flow-vs-isotropic');
const VISUAL = resolve(EVIDENCE, 'visual');
const SEEDS = ['20261005', '20261006', '20261007'];
const ARMS = ['isotropic', 'outgoingFlow'];
const TIMES = [60, 120, 300, 600];
const PAGE_URL_PATH = '/__recruitment_heading_visual';
const BROWSER_EXE = process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

await mkdir(VISUAL, { recursive: true });
const server = await createServer({
  configFile: false, base: '/',
  server: { host: '127.0.0.1', port: 0, strictPort: true },
  logLevel: 'error'
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXE });
  const port = server.httpServer.address().port;
  const url = 'http://127.0.0.1:' + port + PAGE_URL_PATH;
  const manifest = {
    renderer: 'src/lib/renderers/AntRenderer.js; unchanged production renderer',
    rendererSha256: sha256(await readFile(resolve(ROOT, 'src/lib/renderers/AntRenderer.js'))),
    viewport: { width: 752, height: 824, deviceScaleFactor: 1, rendererWidth: 720, rendererHeight: 720 },
    presentation: { pheromone: false, material: true, surface: false, candidate: false },
    images: [], sheets: []
  };
  for (const seed of SEEDS) {
    const imagesByArm = new Map();
    for (const arm of ARMS) {
      const runPath = resolve(EVIDENCE, 'analysis', 'seed-' + seed + '-' + arm + '.json');
      const run = JSON.parse(await readFile(runPath, 'utf8'));
      const errors = [];
      const page = await browser.newPage({ viewport: { width: 752, height: 824 }, deviceScaleFactor: 1 });
      page.on('pageerror', error => errors.push(error.stack || String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.route(url, route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><head><meta charset=\"utf-8\"><link rel=\"icon\" href=\"data:,\"><style>body{margin:0;padding:16px;background:#fff;color:#17202b;font:15px Arial,sans-serif}h1{font-size:21px;margin:0 0 8px}p{margin:0 0 10px}#frame{width:720px;height:720px}#render-canvas{display:block}</style></head><body><h1 id=\"title\"></h1><p id=\"state\"></p><div id=\"frame\"><canvas id=\"render-canvas\"></canvas></div><script></script></body></html>'
      }));
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.evaluate(async ({ seed, arm }) => {
        const { AntRenderer } = await import('/src/lib/renderers/AntRenderer.js');
        const renderer = new AntRenderer(document.querySelector('#render-canvas'));
        await renderer.init({ width: 720, height: 720, pixelRatio: 1 });
        renderer.setDebugOptions({ pheromone: false, material: true, surface: false, candidate: false,
          source: false, exposure: false, plateIds: false, plateOutlines: false, plateCenterlines: false, platePickups: false });
        window.__recruitmentRenderer = renderer;
        document.querySelector('#title').textContent = arm + ' · seed ' + seed + ' · ANT';
      }, { seed, arm });
      const files = [];
      try {
        for (const seconds of TIMES) {
          const capture = run.captures.find(item => item.seconds === seconds);
          assert.ok(capture, 'missing fixed snapshot at ' + seconds + 's for ' + seed + ' ' + arm);
          const captured = await page.evaluate(async ({ snapshot, seconds }) => {
            window.__recruitmentRenderer.render(snapshot);
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            document.querySelector('#state').textContent = seconds + ' simulated seconds · '
              + snapshot.agents.length + ' ants · Audio Off · pheromone Off · material On';
            return {
              canvasCount: document.querySelectorAll('#frame canvas').length,
              canvasWidth: document.querySelector('#frame canvas')?.width ?? null,
              canvasHeight: document.querySelector('#frame canvas')?.height ?? null,
              visibleAnts: snapshot.agents.length
            };
          }, { snapshot: capture, seconds });
          assert.ok(captured.canvasCount >= 1, 'renderer canvas exists');
          const name = 'seed-' + seed + '-' + arm + '-' + seconds + 's.png';
          const path = resolve(VISUAL, name);
          const bytes = await page.screenshot({ path, fullPage: true });
          const dimensions = pngDimensions(bytes);
          assert.deepEqual(dimensions, { width: 752, height: 824 });
          const row = { seed, arm, seconds, file: name, sha256: sha256(bytes), bytes: bytes.length, dimensions, visibleAnts: captured.visibleAnts };
          manifest.images.push(row);
          files.push({ seconds, file: name, bytes });
          console.log(JSON.stringify({ rendered: name, ants: row.visibleAnts, pngBytes: bytes.length }));
        }
        assert.deepEqual(errors, [], 'Chrome console/page errors');
      } finally {
        await page.evaluate(() => window.__recruitmentRenderer?.destroy()).catch(() => {});
        await page.close();
      }
      imagesByArm.set(arm, files);
    }
    const sheet = await composeSeedSheet(browser, seed, imagesByArm);
    manifest.sheets.push(sheet);
  }
  const overview = await composeOverviewSheet(browser, manifest.images);
  manifest.sheets.push(overview);
  await writeFile(resolve(VISUAL, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ images: manifest.images.length, sheets: manifest.sheets.length, output: VISUAL }));
} finally {
  await browser?.close();
  await server.close();
}

async function composeSeedSheet(browser, seed, byArm) {
  const panels = [];
  for (const seconds of TIMES) for (const arm of ARMS) {
    const item = byArm.get(arm).find(row => row.seconds === seconds);
    panels.push({ label: arm + ' · ' + seconds + ' s', data: 'data:image/png;base64,' + item.bytes.toString('base64') });
  }
  const bytes = await compose(browser, {
    title: 'Current production recruitment heading · seed ' + seed,
    subtitle: 'Isotropic CONTROL vs endogenous outgoing-flow TREATMENT · same 720×720 AntRenderer · pheromone Off · material On',
    mode: 'seed', panels
  });
  const file = 'seed-' + seed + '-comparison.png';
  await writeFile(resolve(VISUAL, file), bytes);
  return { file, sha256: sha256(bytes), bytes: bytes.length, dimensions: pngDimensions(bytes) };
}

async function composeOverviewSheet(browser, images) {
  const panels = [];
  for (const seed of SEEDS) for (const seconds of TIMES) for (const arm of ARMS) {
    const image = images.find(row => row.seed === seed && row.seconds === seconds && row.arm === arm);
    panels.push({ label: seed + ' · ' + seconds + ' s · ' + arm, data: 'data:image/png;base64,'
      + (await readFile(resolve(VISUAL, image.file))).toString('base64') });
  }
  const bytes = await compose(browser, {
    title: 'Recruitment heading comparison · all seeds and times',
    subtitle: 'Current production world · unchanged AntRenderer · matched presentation · no per-panel normalization',
    mode: 'overview', panels
  });
  const file = 'all-seeds-time-comparison.png';
  await writeFile(resolve(VISUAL, file), bytes);
  return { file, sha256: sha256(bytes), bytes: bytes.length, dimensions: pngDimensions(bytes) };
}

async function compose(browser, payload) {
  const page = await browser.newPage({ viewport: { width: 2048, height: 1400 }, deviceScaleFactor: 1 });
  try {
    await page.setContent('<!doctype html><html><body style=\"margin:0\"></body></html>');
    const base64 = await page.evaluate(async ({ title, subtitle, mode, panels }) => {
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      const panelWidth = mode === 'seed' ? 384 : 218;
      const panelHeight = mode === 'seed' ? 421 : 238;
      const columns = mode === 'seed' ? 2 : 8;
      const rows = Math.ceil(panels.length / columns);
      const gap = mode === 'seed' ? 20 : 12;
      const margin = 20, header = 82;
      canvas.width = margin * 2 + columns * panelWidth + (columns - 1) * gap;
      canvas.height = header + margin + rows * panelHeight + Math.max(0, rows - 1) * gap + margin;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#17202b'; ctx.font = 'bold 23px Arial'; ctx.fillText(title, margin, 30);
      ctx.font = '14px Arial'; ctx.fillText(subtitle, margin, 55);
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i], image = new Image();
        image.src = panel.data; await image.decode();
        const x = margin + (i % columns) * (panelWidth + gap);
        const y = header + Math.floor(i / columns) * (panelHeight + gap);
        ctx.fillStyle = '#17202b'; ctx.font = mode === 'seed' ? 'bold 16px Arial' : '12px Arial';
        ctx.fillText(panel.label, x, y + 15);
        ctx.drawImage(image, x, y + 22, panelWidth, panelHeight - 22);
        ctx.strokeStyle = '#aab5c2'; ctx.lineWidth = 1; ctx.strokeRect(x, y + 22, panelWidth, panelHeight - 22);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, payload);
    return Buffer.from(base64, 'base64');
  } finally { await page.close(); }
}

function pngDimensions(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'valid PNG signature');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
