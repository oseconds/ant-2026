import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const EVIDENCE = 'docs/ant/evidence/2026-10-22-recruitment-founder-survey';
const OUTPUT = resolve(ROOT, EVIDENCE, 'visual', 'final');
const VARIANTS = ['baseline', 'rotate90', 'reverse', 'isotropic'];
const SEED = 20261005, TIMES = [30, 60, 120, 300, 600], WIDTH = 640, HEIGHT = 640, LABEL = 28;
const RENDERER = 'src/lib/renderers/AntRenderer.js';

if (process.argv.includes('--self-check')) {
  assert.equal(sha(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(frameAt([{ timeSeconds: 0 }, { timeSeconds: 2 }], 2).timeSeconds, 2);
  const values = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [i, i + 1]));
  assert.deepEqual(numericArray(values, 4, 'self-check'), [1, 2, 3, 4]);
  console.log('self-check passed');
} else await run();

async function run() {
  const old = await readdir(OUTPUT).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
  assert.equal(old.length, 0, `refusing to use non-empty output directory ${OUTPUT}`);
  const cases = [];
  for (const variant of VARIANTS) {
    const dir = resolve(ROOT, EVIDENCE, 'controls', `${variant}-${SEED}`);
    const manifestBytes = await readFile(resolve(dir, 'manifest.json'));
    const sourceManifest = JSON.parse(manifestBytes);
    assert.equal(sourceManifest.seed, SEED);
    assert.equal(sourceManifest.variant, variant);
    const snapshotBytes = await readFile(resolve(dir, 'snapshots.json.gz'));
    const frameBytes = await readFile(resolve(dir, 'frames.jsonl.gz'));
    const snapshots = JSON.parse(gunzipSync(snapshotBytes));
    const frames = gunzipSync(frameBytes).toString('utf8').trimEnd().split('\n').map(JSON.parse);
    for (const seconds of TIMES) {
      const saved = snapshots.find(item => Math.round(item.timeSeconds) === seconds);
      assert.ok(saved, `${variant} missing renderer snapshot at ${seconds}s`);
      assert.ok(Array.isArray(saved.snapshot.agents), `${variant} ${seconds}s snapshot lacks agents`);
      saved.renderSnapshot = projectRenderSnapshot(saved.snapshot, `${variant} ${seconds}s`);
    }
    cases.push({ variant, dir, sourceManifest, manifestBytes, snapshotBytes, frameBytes, snapshots, frames });
  }

  await mkdir(OUTPUT, { recursive: true });
  const sourceHashes = { [RENDERER]: sha(await readFile(resolve(ROOT, RENDERER))),
    'scripts/ant-recruitment-visuals.js': sha(await readFile(new URL(import.meta.url))) };
  const server = await createServer({ configFile: false, root: ROOT, appType: 'custom',
    server: { host: '127.0.0.1', port: 0, strictPort: false } });
  let browser;
  try {
    server.middlewares.use('/__ant_recruitment_visuals__', (_req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end('<!doctype html><html><body style="margin:0"></body></html>');
    });
    await server.listen();
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage({ viewport: { width: WIDTH * 2, height: (HEIGHT + LABEL) * 2 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__ant_recruitment_visuals__`);
    await page.evaluate(async ({ width, height, label }) => {
      const { AntRenderer } = await import('/src/lib/renderers/AntRenderer.js');
      const items = [];
      for (let i = 0; i < 4; i++) {
        const cell = document.createElement('div');
        cell.style.cssText = `position:absolute;left:${i % 2 * width}px;top:${Math.floor(i / 2) * (height + label)}px;width:${width}px;height:${height + label}px`;
        const canvas = document.createElement('canvas'); canvas.style.cssText = `display:block;width:${width}px;height:${height}px`;
        cell.append(canvas); document.body.append(cell);
        const renderer = new AntRenderer(canvas);
        renderer.setDebugOptions({ material: true, pheromone: true, surface: false, candidate: false,
          source: false, exposure: false, plateIds: false, plateOutlines: false, plateCenterlines: false, platePickups: false });
        if (!await renderer.init({ width, height, pixelRatio: 1 })) throw Error('AntRenderer initialization failed');
        items.push({ canvas, renderer });
      }
      window.captureRenderers = items;
    }, { width: WIDTH, height: HEIGHT, label: LABEL });

    const renders = [];
    for (const seconds of TIMES) {
      const payload = cases.map(item => ({ variant: item.variant,
        snapshot: item.snapshots.find(row => Math.round(row.timeSeconds) === seconds).renderSnapshot }));
      const dataUrl = await page.evaluate(async ({ payload, width, height, label, seconds }) => {
        const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = (height + label) * 2;
        const out = canvas.getContext('2d'); out.fillStyle = '#fff'; out.fillRect(0, 0, canvas.width, canvas.height);
        for (const [i, row] of payload.entries()) {
          const item = window.captureRenderers[i]; item.renderer.render(JSON.parse(row.snapshot)); await settle();
          const x = i % 2 * width, y = Math.floor(i / 2) * (height + label);
          out.fillStyle = '#111'; out.font = '14px sans-serif'; out.fillText(`${seconds}s · ${row.variant}`, x + 8, y + 19);
          out.drawImage(item.canvas, x, y + label);
        }
        return canvas.toDataURL('image/png');
      }, { payload: payload.map(({ variant, snapshot }) => ({ variant, snapshot: JSON.stringify(snapshot) })), width: WIDTH, height: HEIGHT, label: LABEL, seconds });
      // Keep transfer data small and parse snapshots only once in the page.
      // JSON serialization is intentionally outside rendering and does not step the model.
      const bytes = decodePng(dataUrl), file = `comparison-${seconds}s.png`;
      await writeFile(resolve(OUTPUT, file), bytes, { flag: 'wx' });
      renders.push({ seconds, file, sha256: sha(bytes), bytes: bytes.length, dimensions: `${WIDTH * 2}x${(HEIGHT + LABEL) * 2}` });
    }
    const series = cases.map(item => ({ variant: item.variant,
      frames: item.frames.map(frame => ({ timeSeconds: frame.timeSeconds, population: frame.population, descriptors: frame.descriptors })) }));
    const metricsSvg = makeMetricsSvg(series);
    const metricsBytes = Buffer.from(metricsSvg);
    await writeFile(resolve(OUTPUT, 'descriptors.svg'), metricsBytes, { flag: 'wx' });
    const csvBytes = Buffer.from(makeMetricsCsv(series));
    await writeFile(resolve(OUTPUT, 'descriptors.csv'), csvBytes, { flag: 'wx' });
    const manifest = { schemaVersion: 1, purpose: 'Fixed-time rendered comparison and continuous descriptive plots for Stage A seed 20261005.',
      source: { sourceCommit: cases[0].sourceManifest.commit, sourceHashes,
        inputs: cases.map(item => ({ variant: item.variant, seed: SEED,
          manifestSha256: sha(item.manifestBytes), snapshotsSha256: sha(item.snapshotBytes), framesSha256: sha(item.frameBytes),
          snapshotSeconds: item.sourceManifest.capture.snapshotSeconds })) },
      renderer: { name: 'AntRenderer', viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, pixelRatio: 1,
        material: true, pheromone: true, overlays: false, simulationSteps: 0, audioResources: false },
      snapshotProjection: 'The runner JSON encodes typed arrays as numeric-key objects. Renderer-only projection validates contiguous keys and exact width×height, then converts pheromone.values, topLayerByCell, and layerCountByCell to arrays without changing simulation data.',
      browserVersion: browser.version(), comparisons: renders,
      descriptors: { file: 'descriptors.svg', sha256: sha(metricsBytes), bytes: metricsBytes.length,
        dimensions: '1440x960', plotted: ['ant centroid x/y', 'south fraction', 'covariance-trace RMS radius', 'movement polarization magnitude',
          'movement polarization direction', 'pheromone angular direction and concentration', 'radial outward flow fraction'],
        flowDefinition: 'fraction of sampled ant displacements with positive radial velocity from nest, pooled by 1 Hz frame',
        plottingFallback: 'Matplotlib and chart packages were unavailable; SVG uses fixed axes. CSV retains every plotted sample for standard replotting.',
        csv: { file: 'descriptors.csv', sha256: sha(csvBytes), bytes: csvBytes.length },
        gaps: 'Null values create gaps; direction traces break across wrap discontinuities.' },
      completed: true };
    await writeFile(resolve(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  } finally { await browser?.close(); await server.close(); }
}

function frameAt(frames, seconds) { return frames.find(frame => frame.timeSeconds === seconds); }
function numericArray(value, length, label) {
  if (Array.isArray(value)) {
    assert.equal(value.length, length, `${label} length mismatch`);
    return value;
  }
  assert.ok(value && typeof value === 'object', `${label} must be an array or serialized numeric-key object`);
  const keys = Object.keys(value);
  assert.equal(keys.length, length, `${label} key count mismatch`);
  for (let i = 0; i < length; i++) assert.ok(Object.hasOwn(value, i), `${label} missing index ${i}`);
  return Array.from({ length }, (_, i) => value[i]);
}
function projectRenderSnapshot(snapshot, label) {
  const pheromone = snapshot.pheromone;
  assert.ok(Number.isInteger(pheromone?.width) && Number.isInteger(pheromone?.height), `${label} pheromone dimensions missing`);
  const cells = pheromone.width * pheromone.height;
  const material = snapshot.stratigraphy;
  assert.ok(Number.isInteger(material?.width) && Number.isInteger(material?.height), `${label} material dimensions missing`);
  const materialCells = material.width * material.height;
  const topology = material.stratigraphy;
  return { ...snapshot,
    pheromone: { ...pheromone, values: numericArray(pheromone.values, cells, `${label} pheromone values`) },
    stratigraphy: { ...material, stratigraphy: { ...topology,
      topLayerByCell: numericArray(topology?.topLayerByCell, materialCells, `${label} topLayerByCell`),
      layerCountByCell: numericArray(topology?.layerCountByCell, materialCells, `${label} layerCountByCell`) } } };
}
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function decodePng(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  assert.ok(match, 'browser output must be PNG'); return Buffer.from(match[1], 'base64');
}

function makeMetricsSvg(series) {
  const W = 1440, H = 960, cols = 3, rows = 3, pw = 440, ph = 258, left = 72, top = 52, gapX = 22, gapY = 28;
  const specs = [
    ['Ant centroid x', f => f.descriptors.ants.centroid?.x, [0, 1]],
    ['Ant centroid y', f => f.descriptors.ants.centroid?.y, [0, 1]],
    ['South fraction', f => f.descriptors.ants.angularOccupancy?.south, [0, 1]],
    ['Dispersion · RMS radius about centroid', f => { const c = f.descriptors.ants.covariance; return c ? Math.sqrt(c.xx + c.yy) : null; }, null],
    ['Movement polarization · magnitude', f => f.descriptors.ants.velocityPolarization?.magnitude, [0, 1]],
    ['Movement polarization · direction (rad)', f => f.descriptors.ants.velocityPolarization?.angle, [-Math.PI, Math.PI], true],
    ['Pheromone direction (rad)', f => f.descriptors.pheromone.orientation?.angle, [-Math.PI, Math.PI], true],
    ['Pheromone directional concentration', f => f.descriptors.pheromone.orientation?.concentration, [0, 1]],
    ['Radial outward flow fraction', f => f.descriptors.flow?.[0]?.outwardFraction, [0, 1]]
  ];
  const colors = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd'];
  let body = `<rect width="${W}" height="${H}" fill="white"/><text x="${W / 2}" y="25" text-anchor="middle" font-family="sans-serif" font-size="16">Stage A · seed ${SEED} · descriptors from sampled frames</text>`;
  for (let p = 0; p < specs.length; p++) {
    const [title, get, fixed, wrapped] = specs[p], cx = p % cols, cy = Math.floor(p / cols), x0 = left + cx * (pw + gapX), y0 = top + cy * (ph + gapY);
    const values = series.flatMap(s => s.frames.map(get).filter(Number.isFinite));
    let ymin = fixed?.[0] ?? Math.min(...values), ymax = fixed?.[1] ?? Math.max(...values);
    if (!Number.isFinite(ymin) || !Number.isFinite(ymax)) ymin = 0, ymax = 1;
    if (ymax - ymin < 1e-9) ymax = ymin + 1;
    if (!fixed) { const pad = (ymax - ymin) * 0.05; ymin = Math.max(0, ymin - pad); ymax += pad; }
    const X = t => x0 + 46 + t / 600 * (pw - 58), Y = v => y0 + 25 + (ymax - v) / (ymax - ymin) * (ph - 57);
    body += `<text x="${x0 + pw / 2}" y="${y0 + 13}" text-anchor="middle" font-family="sans-serif" font-size="13">${esc(title)}</text>`;
    for (let n = 0; n <= 4; n++) { const v = ymin + (ymax - ymin) * n / 4, yy = Y(v); body += `<path d="M${x0 + 43} ${yy}H${x0 + pw - 8}" stroke="#ddd"/><text x="${x0 + 38}" y="${yy + 4}" text-anchor="end" font-family="sans-serif" font-size="10">${v.toFixed(2)}</text>`; }
    for (const t of [0, 120, 240, 360, 480, 600]) body += `<text x="${X(t)}" y="${y0 + ph - 14}" text-anchor="middle" font-family="sans-serif" font-size="10">${t}</text>`;
    body += `<text x="${x0 + pw / 2}" y="${y0 + ph - 1}" text-anchor="middle" font-family="sans-serif" font-size="10">simulation seconds</text>`;
    series.forEach((s, i) => {
      let d = '', pen = false, previous;
      for (const f of s.frames) { const v = get(f); if (!Number.isFinite(v) || (wrapped && Number.isFinite(previous) && Math.abs(v - previous) > Math.PI)) pen = false;
        if (Number.isFinite(v)) { d += `${pen ? 'L' : 'M'}${X(f.timeSeconds).toFixed(1)},${Y(v).toFixed(1)} `; pen = true; } previous = v; }
      body += `<path d="${d}" fill="none" stroke="${colors[i]}" stroke-width="1.2"/>`;
    });
    body += `<rect x="${x0 + 43}" y="${y0 + 25}" width="${pw - 51}" height="${ph - 57}" fill="none" stroke="#555"/>`;
  }
  const legend = series.map((s, i) => `<g transform="translate(${W / 2 - 190 + i * 125},${H - 7})"><path d="M0 0h20" stroke="${colors[i]}" stroke-width="2"/><text x="25" y="4" font-family="sans-serif" font-size="11">${esc(s.variant)}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}${legend}</svg>`;
}
function esc(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]); }
function makeMetricsCsv(series) {
  const rows = [['variant','timeSeconds','population','centroidX','centroidY','southFraction','rmsRadius','polarizationMagnitude','polarizationAngleRad','pheromoneDirectionRad','pheromoneConcentration','radialOutwardFraction'].join(',')];
  for (const s of series) for (const f of s.frames) {
    const a = f.descriptors.ants, p = f.descriptors.pheromone, flow = f.descriptors.flow?.[0];
    const radius = a.covariance ? Math.sqrt(a.covariance.xx + a.covariance.yy) : null;
    const values = [s.variant, f.timeSeconds, f.population, a.centroid?.x, a.centroid?.y, a.angularOccupancy?.south, radius,
      a.velocityPolarization?.magnitude, a.velocityPolarization?.angle, p.orientation?.angle, p.orientation?.concentration, flow?.outwardFraction];
    rows.push(values.map(value => value == null || (typeof value === 'number' && !Number.isFinite(value)) ? '' : String(value)).join(','));
  }
  return `${rows.join('\n')}\n`;
}
