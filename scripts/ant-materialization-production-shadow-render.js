import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-31-materialization-production-shaped-x-shadow');
const ANALYSIS = resolve(EVIDENCE, 'analysis');
const VISUAL = resolve(EVIDENCE, 'visual');
const SEEDS = ['20261005', '20261006', '20261007'];
const TIMES = [60, 120, 300, 600];
const GRID = 96;
const GRID_SCALE = GRID - 1;
const BROWSER_EXE = process.env.BROWSER_EXECUTABLE_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sha256 = value => createHash('sha256').update(value).digest('hex');

await mkdir(VISUAL, { recursive: true });
const server = await createServer({ configFile: false, base: '/',
  server: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXE });
  const url = 'http://127.0.0.1:' + server.httpServer.address().port + '/__materialization_shadow_visual';
  const manifest = {
    authority: '1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44',
    renderer: 'src/lib/renderers/AntRenderer.js; unchanged production renderer',
    rendererSha256: sha256(await readFile(resolve(ROOT, 'src/lib/renderers/AntRenderer.js'))),
    worldPanel: { rendererWidth: 720, rendererHeight: 720, pixelRatio: 1,
      material: true, pheromone: false, surface: false, candidateOverlay: false },
    selectorState: 'latest actual TrailPlateBirth analysis at or before fixed world frame; timestamps labeled per frame',
    images: [], sheets: []
  };
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 2240, height: 850 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.stack || String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{margin:0;background:#fff}#offscreen{position:absolute;left:-10000px;top:0;width:720px;height:720px}canvas{display:block}</style></head><body><div id="offscreen"><canvas id="world"></canvas></div><script></script></body></html>' }));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { AntRenderer } = await import('/src/lib/renderers/AntRenderer.js');
    const renderer = new AntRenderer(document.querySelector('#world'));
    await renderer.init({ width: 720, height: 720, pixelRatio: 1 });
    renderer.setDebugOptions({ pheromone: false, material: true, surface: false, candidate: false,
      source: false, exposure: false, plateIds: false, plateOutlines: false,
      plateCenterlines: false, platePickups: false });
    window.__materialRenderer = renderer;
  });

  const displayed = [];
  for (const seed of SEEDS) {
    const run = JSON.parse(gunzipSync(await readFile(resolve(ANALYSIS, 'seed-' + seed + '.json.gz'))));
    for (const seconds of TIMES) {
      const capture = run.captures.find(item => item.seconds === seconds);
      assert.ok(capture, 'missing fixed world snapshot');
      const anchor = run.anchors.find(row => Math.abs(row.timeMs - capture.shadowAnalysisTimeMs) < 1e-7);
      assert.ok(anchor, 'capture joins exact production analysis state');
      assert.deepEqual(capture.XIndices, anchor.x.cells, 'captured X matches exact analysis membership');
      assert.deepEqual(capture.EIndices, anchor.EIndices);
      assert.deepEqual(capture.FIndices, anchor.FIndices);
      const dataUrl = await page.evaluate(async ({ capture, anchor, seconds, seed }) => {
        const renderer = window.__materialRenderer;
        renderer.render(capture.snapshot);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const source = document.querySelector('#world');
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        const panelWidth = 720, panelHeight = 720, gap = 18, margin = 20, head = 78, foot = 34;
        canvas.width = margin * 2 + panelWidth * 3 + gap * 2;
        canvas.height = head + panelHeight + foot + 20;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#17202b'; ctx.font = 'bold 22px Arial';
        ctx.fillText('Seed ' + seed + ' · fixed world frame ' + seconds + ' s', margin, 30);
        ctx.font = '14px Arial';
        ctx.fillText('Actual world is identical in all panels · selector state at '
          + (capture.shadowAnalysisTimeMs / 1000).toFixed(3) + ' s', margin, 55);
        const labels = ['Actual production world', 'Production source→boundary selector', 'Max-D → X shadow'];
        const x0 = [margin, margin + panelWidth + gap, margin + 2 * (panelWidth + gap)];
        for (let i = 0; i < 3; i += 1) {
          ctx.fillStyle = '#17202b'; ctx.font = 'bold 16px Arial'; ctx.fillText(labels[i], x0[i], head - 8);
          ctx.drawImage(source, x0[i], head, panelWidth, panelHeight);
          ctx.strokeStyle = '#aab5c2'; ctx.lineWidth = 1; ctx.strokeRect(x0[i], head, panelWidth, panelHeight);
        }
        const grid = 96, scale = panelWidth / (grid - 1);
        const drawEdges = (indices, x, color, width) => {
          const cells = new Set(indices);
          ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width;
          for (const cell of cells) {
            const cx = cell % grid, cy = Math.floor(cell / grid);
            for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
              const nx = cx + dx, ny = cy + dy, next = ny * grid + nx;
              if ((dx || dy) && nx >= 0 && nx < grid && ny >= 0 && ny < grid
                && next > cell && cells.has(next)) {
                ctx.moveTo(x + cx * scale, head + cy * scale);
                ctx.lineTo(x + nx * scale, head + ny * scale);
              }
            }
          }
          ctx.stroke();
        };
        const prod = capture.productionCandidate;
        if (prod) {
          ctx.fillStyle = 'rgba(39,126,193,0.10)';
          for (const cell of prod.maskIndices) {
            ctx.fillRect(x0[1] + (cell % grid) * scale - 2, head + Math.floor(cell / grid) * scale - 2, 4, 4);
          }
          drawEdges(prod.skeletonIndices, x0[1], 'rgba(15,105,175,0.94)', 1.45);
          for (const [point, color] of [[prod.source, '#18a36b'], [prod.target, '#d63a58']]) {
            ctx.beginPath(); ctx.fillStyle = color;
            ctx.arc(x0[1] + point.x * panelWidth, head + point.y * panelHeight, 7, 0, 2 * Math.PI); ctx.fill();
          }
        } else {
          ctx.fillStyle = '#a22'; ctx.font = 'bold 16px Arial'; ctx.fillText('No production candidate', x0[1] + 18, head + 30);
        }
        if (anchor.x.available) {
          drawEdges(anchor.x.cells, x0[2], 'rgba(219,92,28,0.95)', 1.35);
          ctx.beginPath(); ctx.fillStyle = '#ffe238'; ctx.strokeStyle = '#17202b'; ctx.lineWidth = 2;
          ctx.arc(x0[2] + anchor.x.nucleus.x * panelWidth, head + anchor.x.nucleus.y * panelHeight, 8, 0, 2 * Math.PI);
          ctx.fill(); ctx.stroke();
        } else {
          ctx.fillStyle = '#a22'; ctx.font = 'bold 16px Arial'; ctx.fillText('X unavailable', x0[2] + 18, head + 30);
        }
        ctx.fillStyle = '#4b5867'; ctx.font = '13px Arial';
        ctx.fillText(capture.snapshot.agents.length + ' ants · material On · pheromone Off', margin, canvas.height - 12);
        return canvas.toDataURL('image/png');
      }, { capture, anchor, seconds, seed });
      const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
      const file = 'seed-' + seed + '-' + seconds + 's.png';
      await writeFile(resolve(VISUAL, file), bytes);
      const row = { seed, seconds, selectorTimeSeconds: capture.shadowAnalysisTimeMs / 1000,
        file, bytes: bytes.length, sha256: sha256(bytes), dimensions: pngDimensions(bytes),
        antCount: capture.snapshot.agents.length, XAvailable: anchor.x.available,
        productionCandidateAvailable: !!capture.productionCandidate };
      manifest.images.push(row); displayed.push(row);
      console.log(JSON.stringify({ rendered: file, bytes: row.bytes }));
    }
  }
  const sheet = await page.evaluate(async images => {
    const columns = 4, tileW = 520, tileH = 184, gap = 14, margin = 20, header = 74;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = margin * 2 + columns * tileW + (columns - 1) * gap;
    c.height = header + margin + 3 * tileH + 2 * gap + margin;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#17202b'; g.font = 'bold 22px Arial'; g.fillText('Max-D → X production shadow · all seeds / fixed times', margin, 30);
    g.font = '13px Arial'; g.fillText('Each tile: actual world · production selector · X shadow; identical native renderer and scale', margin, 54);
    for (let i = 0; i < images.length; i += 1) {
      const image = new Image(); image.src = images[i].data; await image.decode();
      const x = margin + (i % columns) * (tileW + gap), y = header + margin + Math.floor(i / columns) * (tileH + gap);
      g.fillStyle = '#17202b'; g.font = 'bold 13px Arial'; g.fillText(images[i].label, x, y + 13);
      g.drawImage(image, x, y + 19, tileW, tileH - 19);
      g.strokeStyle = '#aab5c2'; g.lineWidth = 1; g.strokeRect(x, y + 19, tileW, tileH - 19);
    }
    return c.toDataURL('image/png');
  }, await Promise.all(displayed.map(async row => ({
    label: row.seed + ' · ' + row.seconds + ' s',
    data: 'data:image/png;base64,' + (await readFile(resolve(VISUAL, row.file))).toString('base64')
  }))));
  const sheetBytes = Buffer.from(sheet.split(',')[1], 'base64');
  await writeFile(resolve(VISUAL, 'all-seeds-time-comparison.png'), sheetBytes);
  manifest.sheets.push({ file: 'all-seeds-time-comparison.png', bytes: sheetBytes.length,
    sha256: sha256(sheetBytes), dimensions: pngDimensions(sheetBytes) });

  const technicalData = [];
  for (const seed of SEEDS) {
    const run = JSON.parse(gunzipSync(await readFile(resolve(ANALYSIS, 'seed-' + seed + '.json.gz'))));
    for (const seconds of TIMES) {
      const capture = run.captures.find(item => item.seconds === seconds);
      const anchor = run.anchors.find(row => Math.abs(row.timeMs - capture.shadowAnalysisTimeMs) < 1e-7);
      technicalData.push({ seed, seconds, time: capture.shadowAnalysisTimeMs / 1000,
        E: capture.EIndices, F: capture.FIndices,
        productionMask: capture.productionCandidate?.maskIndices || [],
        productionSkeleton: capture.productionCandidate?.skeletonIndices || [],
        X: anchor.x.cells, nucleus: anchor.x.nucleus, unavailable: !anchor.x.available });
    }
  }
  const atlas = await page.evaluate(async items => {
    const grid = 96, cols = items.length, tile = 138, left = 132, top = 58, gap = 7, rowGap = 9, rows = 4;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = left + cols * (tile + gap) + 10; c.height = top + rows * (tile + rowGap) + 16;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#17202b'; g.font = 'bold 19px Arial'; g.fillText('Technical overlay atlas · E / F / production / X', 12, 25);
    const labels = ['E qualified', 'F thinned', 'Production candidate', 'X capture'];
    const rowColors = ['#41a6c8', '#335570', '#8666b4', '#df6c32'];
    const pixel = tile / grid;
    const paint = (indices, ox, oy, color) => {
      g.fillStyle = color;
      for (const cell of indices) g.fillRect(ox + cell % grid * pixel, oy + Math.floor(cell / grid) * pixel, pixel + .3, pixel + .3);
    };
    for (let col = 0; col < cols; col += 1) {
      const item = items[col], x = left + col * (tile + gap);
      g.fillStyle = '#25313d'; g.font = '10px Arial';
      g.fillText(item.seed.slice(-2) + ' · ' + item.seconds + 's', x, top - 10);
      for (let row = 0; row < rows; row += 1) {
        const y = top + row * (tile + rowGap);
        g.fillStyle = '#f4f6f8'; g.fillRect(x, y, tile, tile);
        if (row === 0) paint(item.E, x, y, rowColors[row]);
        if (row === 1) paint(item.F, x, y, rowColors[row]);
        if (row === 2) {
          paint(item.productionMask, x, y, 'rgba(134,102,180,.22)');
          paint(item.productionSkeleton, x, y, rowColors[row]);
        }
        if (row === 3 && !item.unavailable) {
          paint(item.X, x, y, rowColors[row]);
          g.beginPath(); g.fillStyle = '#f2cf32';
          g.arc(x + item.nucleus.x * tile, y + item.nucleus.y * tile, 3, 0, 2 * Math.PI); g.fill();
        }
        g.strokeStyle = '#b7c0ca'; g.lineWidth = 1; g.strokeRect(x, y, tile, tile);
      }
    }
    for (let row = 0; row < rows; row += 1) {
      g.fillStyle = rowColors[row]; g.font = 'bold 13px Arial';
      g.fillText(labels[row], 12, top + row * (tile + rowGap) + tile / 2);
    }
    return c.toDataURL('image/png');
  }, technicalData);
  const atlasBytes = Buffer.from(atlas.split(',')[1], 'base64');
  await writeFile(resolve(VISUAL, 'technical-overlay-atlas.png'), atlasBytes);
  manifest.sheets.push({ file: 'technical-overlay-atlas.png', bytes: atlasBytes.length,
    sha256: sha256(atlasBytes), dimensions: pngDimensions(atlasBytes), layers: ['E', 'F', 'production selector', 'X'] });
  assert.deepEqual(errors, [], 'renderer browser console and page errors');
  await page.evaluate(() => window.__materialRenderer?.destroy());
  await writeFile(resolve(VISUAL, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ images: manifest.images.length, sheets: manifest.sheets.length,
    output: VISUAL, rendererSha256: manifest.rendererSha256 }));
} finally {
  await browser?.close();
  await server.close();
}

function pngDimensions(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
