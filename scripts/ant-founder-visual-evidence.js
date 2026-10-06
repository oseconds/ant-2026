import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const args = new Map(process.argv.slice(2).map(value => {
  const at = value.indexOf('=');
  return at < 0 ? [value, true] : [value.slice(0, at), value.slice(at + 1)];
}));
const TIMES = [30, 60, 120, 300, 600];
const SEEDS = [20261005, 20261006, 20261007];
const SCALES = {
  pheromone: { maximum: 0.18, ticks: [0, 0.04, 0.08, 0.12, 0.18], unit: 'raw concentration', transform: 'linear' },
  occupancy: { maximum: 5, knee: 0.05, ticks: [0, 0.05, 0.1, 0.5, 1, 5], unit: 'ant-seconds / cell, last 30 s', transform: 'log1p(value / 0.05)' },
  coverage: { unit: 'ever visited, ant center', transform: 'binary cumulative ant-seconds > 0' }
};
const out = resolve(String(args.get('--output') || 'docs/ant/evidence/2026-10-07-founder-effect-refinement'));
const before = resolve(String(args.get('--before') || resolve(out, 'before')));
const after = resolve(String(args.get('--after') || resolve(out, 'after')));

if (args.has('--selfcheck')) {
  assert.equal(fixedUnit(0, SCALES.pheromone), 0);
  assert.equal(fixedUnit(0.09, SCALES.pheromone), 0.5);
  assert.equal(fixedUnit(0.36, SCALES.pheromone), 1);
  assert.equal(fixedUnit(5, SCALES.occupancy), 1);
  assert.ok(fixedUnit(0.5, SCALES.occupancy) > fixedUnit(0.1, SCALES.occupancy));
  validateGrid({ width: 2, height: 2, values: [0, 0.004, 0.18, 1] });
  assert.throws(() => validateGrid({ width: 2, height: 2, values: [0, 1] }));
  console.log('Founder visual evidence fixed-scale and grid selfcheck passed.');
} else {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  try {
    if (!args.has('--maps-only')) await browserRuns(browser);
    if (!args.has('--browser-only')) await renderMaps(browser);
  } finally { await browser.close(); }
}

async function renderMaps(browser) {
  const page = await browser.newPage();
  const chrome = new Map();
  for (const variant of ['before', 'after']) {
    try { chrome.set(variant.toUpperCase(), JSON.parse(await readFile(resolve(out, `chrome-${variant}-seed20261005-metadata.json`), 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (chrome.has(variant.toUpperCase())) {
      const summary = JSON.parse(await readFile(resolve(variant === 'before' ? before : after, 'summary.json'), 'utf8'));
      assert.equal(chrome.get(variant.toUpperCase()).controllerSha256, summary.provenance.controllerSha256, 'Chrome and Node use identical controller source');
    }
  }
  const report = { scales: SCALES, seeds: [], normalization: 'No frame, seed, variant or clip maximum is used.',
    chromeCrosscheck: [],
    crossEngineLimit: 'Node maps and Chrome snapshots are independent natural runs using the same controller source, initial seed and 60 Hz defaults. Small numerical differences can diverge routes and RNG scheduling; exact grid equality is reported, not assumed.',
    coordinates: 'Pheromone nodes x=column/95,y=row/95. Occupancy ant-center samples use round(x*63),round(y*63). x right, y down; square normalized domain [0,1].',
    occupancy: 'Recent 30 completed one-second buckets, each containing every 60 Hz ant-center sample. Cumulative coverage is the fraction of cells with cumulativeAntSeconds > 0.' };
  try {
    for (const seed of SEEDS) {
      const pairs = [];
      for (const seconds of TIMES) {
        const maps = [];
        for (const [variant, directory] of [['BEFORE', before], ['AFTER', after]]) {
          const name = `seed${seed}-${seconds}s-maps.json`;
          const bytes = await readFile(resolve(directory, name));
          const map = JSON.parse(bytes);
          assert.equal(map.seed, seed); assert.equal(map.seconds, seconds);
          validateGrid(map.pheromone);
          validateGrid({ ...map.occupancy, values: map.occupancy.recent30sAntSeconds });
          validateGrid({ ...map.occupancy, values: map.occupancy.cumulativeAntSeconds });
          const observed = seed === 20261005 && chrome.get(variant)?.checkpoints.find(item => Math.abs(item.seconds - seconds) < 1e-5);
          if (observed) {
            const hash = digest(JSON.stringify(map.pheromone.values));
            report.chromeCrosscheck.push({ variant, seed, seconds, nodePheromoneValuesSha256: hash,
              chromePheromoneValuesSha256: observed.pheromoneSha256, equal: observed.pheromoneSha256 === hash });
          }
          maps.push({ ...map, variant, source: resolve(directory, name), sourceSha256: digest(bytes),
            concentrationsAboveScale: map.pheromone.values.filter(value => value > SCALES.pheromone.maximum).length,
            occupancyAboveScale: map.occupancy.recent30sAntSeconds.filter(value => value > SCALES.occupancy.maximum).length,
            coverage: map.occupancy.cumulativeAntSeconds.filter(value => value > 0).length / map.occupancy.cumulativeAntSeconds.length });
        }
        pairs.push({ seconds, maps });
      }
      const overviewName = `seed${seed}-maps-overview.png`;
      const detailName = `seed${seed}-120s-600s-maps-detail.png`;
      await savePNG(page, overviewName, { seed, pairs, scales: SCALES, detail: false });
      await savePNG(page, detailName, { seed, pairs: pairs.filter(pair => [120, 600].includes(pair.seconds)), scales: SCALES, detail: true });
      report.seeds.push({ seed, overview: overviewName, detail: detailName,
        checkpoints: pairs.flatMap(pair => pair.maps.map(map => ({ variant: map.variant, seconds: pair.seconds,
          source: map.source, sourceSha256: map.sourceSha256, pheromoneValuesSha256: digest(JSON.stringify(map.pheromone.values)),
          concentrationsAboveScale: map.concentrationsAboveScale, occupancyAboveScale: map.occupancyAboveScale,
          cumulativeCoverage: map.coverage }))) });
      console.log(`Rendered fixed-scale maps for seed ${seed}.`);
    }
    if (chrome.size === 2) {
      const frames = [];
      for (const seconds of [120, 600]) for (const variant of ['before', 'after']) frames.push({ seconds, variant,
        image: `data:image/png;base64,${(await readFile(resolve(out, `chrome-${variant}-seed20261005-${seconds}s.png`))).toString('base64')}` });
      const png = await page.evaluate(async frames => {
        const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 1280;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#17202b'; ctx.font = '23px sans-serif'; ctx.fillText('Chrome natural seed 20261005 · unchanged AntRenderer', 18, 30);
        ctx.font = '15px sans-serif'; ctx.fillText('Independent Chrome runs; exact 60 Hz checkpoints. Original render, no field/image normalization.', 18, 56);
        for (let i = 0; i < frames.length; i++) {
          const frame = frames[i], image = new Image(); image.src = frame.image; await image.decode();
          const x = 18 + (i % 2) * 544, y = 88 + Math.floor(i / 2) * 590;
          ctx.fillStyle = '#17202b'; ctx.font = '18px sans-serif'; ctx.fillText(`${frame.variant.toUpperCase()} · ${frame.seconds} s`, x, y);
          ctx.drawImage(image, x, y + 10, 520, image.height * 520 / image.width);
        }
        return canvas.toDataURL('image/png').split(',')[1];
      }, frames);
      report.chromeRendererComparison = 'chrome-seed20261005-120s-600s-comparison.png';
      await writeFile(resolve(out, report.chromeRendererComparison), Buffer.from(png, 'base64'));
    }
    await writeFile(resolve(out, 'visual-map-metadata.json'), `${JSON.stringify(report, null, 2)}\n`);
  } finally { await page.close(); }
}

async function savePNG(page, name, payload) {
  const png = await page.evaluate(({ seed, pairs, scales, detail }) => {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    const size = detail ? 320 : 152, gap = detail ? 32 : 12;
    const cellWidth = size + (detail ? 26 : 12), labelHeight = detail ? 62 : 48;
    const header = detail ? 100 : 108, rowHeight = size + labelHeight + 26;
    canvas.width = detail ? 3 * (cellWidth + gap) + 28 : 2 * pairs.length * (cellWidth + gap) + 28;
    canvas.height = header + (detail ? pairs.length * 2 : 3) * rowHeight + 96;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#171b24'; ctx.font = `${detail ? 23 : 21}px sans-serif`;
    ctx.fillText(`ANT founder refinement · seed ${seed} · matched BEFORE / AFTER`, 18, 30);
    ctx.font = '14px sans-serif';
    ctx.fillText('Same natural initial seed, exact 60 Hz defaults. x → right, y → down. No per-map normalization.', 18, 56);
    ctx.fillText('Pheromone: fixed 0–0.18 raw units. Occupancy: fixed 0–5 ant-seconds, log1p(v / 0.05).', 18, 78);
    const metrics = ['pheromone', 'occupancy', 'coverage'];
    function unit(value, scale) {
      const v = Math.max(0, Math.min(scale.maximum, value));
      return scale.knee ? Math.log1p(v / scale.knee) / Math.log1p(scale.maximum / scale.knee) : v / scale.maximum;
    }
    function grid(map, metric, x, y) {
      const source = metric === 'pheromone' ? map.pheromone : map.occupancy;
      const values = metric === 'pheromone' ? source.values : metric === 'occupancy' ? source.recent30sAntSeconds : source.cumulativeAntSeconds;
      const native = document.createElement('canvas'); native.width = source.width; native.height = source.height;
      const pixels = native.getContext('2d').createImageData(source.width, source.height);
      const target = metric === 'pheromone' ? [23, 66, 118] : metric === 'occupancy' ? [174, 50, 15] : [40, 104, 69];
      for (let i = 0; i < values.length; i++) {
        const fraction = metric === 'coverage' ? Number(values[i] > 0) : unit(values[i], scales[metric]);
        for (let c = 0; c < 3; c++) pixels.data[i * 4 + c] = Math.round(255 + (target[c] - 255) * fraction);
        pixels.data[i * 4 + 3] = 255;
      }
      native.getContext('2d').putImageData(pixels, 0, 0);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(native, x, y, size, size);
      ctx.strokeStyle = '#b8c2ce'; ctx.lineWidth = 1; ctx.strokeRect(x, y, size, size);
      // A shared entrance cross is a coordinate guide; it does not alter the data.
      ctx.strokeStyle = '#4e4e4e'; ctx.beginPath();
      ctx.moveTo(x + size * .5 - 3, y + size * .72); ctx.lineTo(x + size * .5 + 3, y + size * .72);
      ctx.moveTo(x + size * .5, y + size * .72 - 3); ctx.lineTo(x + size * .5, y + size * .72 + 3); ctx.stroke();
      ctx.fillStyle = '#243145'; ctx.font = `${detail ? 15 : 12}px sans-serif`;
      const above = metric === 'pheromone' ? map.concentrationsAboveScale : map.occupancyAboveScale;
      const footer = metric === 'coverage' ? `coverage ${(100 * map.coverage).toFixed(1)}%` : `${source.width}×${source.height} · >scale ${above} cells`;
      ctx.fillText(footer, x, y + size + 18);
    }
    function panel(map, seconds, metric, column, row) {
      const x = 18 + column * (cellWidth + gap), y = header + row * rowHeight;
      ctx.fillStyle = '#171b24'; ctx.font = `${detail ? 19 : 13}px sans-serif`;
      ctx.fillText(`${map.variant} · ${seconds} s`, x, y + 16);
      ctx.font = `${detail ? 15 : 12}px sans-serif`;
      ctx.fillText(metric === 'pheromone' ? 'Pheromone' : metric === 'occupancy' ? 'Recent 30 s occupancy' : 'Cumulative coverage', x, y + 36);
      grid(map, metric, x, y + labelHeight);
    }
    if (detail) pairs.forEach((pair, t) => pair.maps.forEach((map, v) => metrics.forEach((metric, m) => panel(map, pair.seconds, metric, m, t * 2 + v))));
    else metrics.forEach((metric, m) => pairs.forEach((pair, t) => pair.maps.forEach((map, v) => panel(map, pair.seconds, metric, t * 2 + v, m))));
    const legendY = canvas.height - 70;
    ctx.fillStyle = '#243145'; ctx.font = '14px sans-serif';
    ctx.fillText('Fixed legends (upper values clip; count shown under each map). + = entrance (0.5,0.72).', 18, legendY - 8);
    [['pheromone', [23,66,118]], ['occupancy', [174,50,15]]].forEach(([metric, color], index) => {
      const x = 18 + index * Math.floor(canvas.width / 2), y = legendY + 6, width = Math.min(340, canvas.width / 2 - 70);
      for (let i = 0; i < width; i++) { const f = i / (width - 1); ctx.fillStyle = `rgb(${color.map(c => Math.round(255 + (c - 255) * f)).join(',')})`; ctx.fillRect(x + i, y, 1, 12); }
      ctx.fillStyle = '#243145'; ctx.font = '12px sans-serif';
      for (const value of scales[metric].ticks) ctx.fillText(String(value), x + unit(value, scales[metric]) * width - 3, y + 28);
      ctx.fillText(`${metric}: ${scales[metric].unit}`, x, y + 45);
    });
    return canvas.toDataURL('image/png').split(',')[1];
  }, payload);
  await writeFile(resolve(out, name), Buffer.from(png, 'base64'));
}

async function browserRuns(browser) {
  const rendererSha256 = digest(await readFile(resolve('src/lib/renderers/AntRenderer.js')));
  assert.equal(rendererSha256, digest(await readFile(resolve('test-results/founder-baseline/src/lib/renderers/AntRenderer.js'))), 'Renderer is unchanged from BEFORE');
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  try {
    await server.listen();
    const url = `http://127.0.0.1:${server.httpServer.address().port}/__founder_visual`;
    const requested = args.get('--variant');
    const variants = requested ? [String(requested)] : ['before', 'after'];
    for (const variant of variants) {
      assert.ok(['before', 'after'].includes(variant), '--variant must be before or after');
      const sourceRoot = variant === 'before' ? 'test-results/founder-baseline/src' : 'src';
      const controllerSource = `${sourceRoot}/lib/agents/ant/AntController.js`;
      const seed = 20261005, errors = [], page = await browser.newPage({ viewport: { width: 752, height: 824 }, deviceScaleFactor: 1 });
      page.on('pageerror', error => errors.push(error.stack || String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const metadata = { variant, seed, browser: await browser.version(), controllerSource,
        controllerSha256: digest(await readFile(resolve(controllerSource))),
        rendererSource: 'src/lib/renderers/AntRenderer.js', rendererSha256, rendererIdenticalToBefore: true,
        preparation: 'Fresh natural default AntController, injected LCG only. 1/60 s ticks; unchanged AntRenderer. No AudioContext or audio bridge.', checkpoints: [] };
      try {
        await page.route(url, route => route.fulfill({ contentType: 'text/html', body:
          '<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;padding:16px;background:white;font:16px Arial;color:#17202b}h1{font-size:23px;margin:0 0 12px}p{margin:0 0 10px}canvas{display:block}</style><script type="module">/* Models are imported by the evidence harness. */</script></head><body><h1 id="label"></h1><p id="state"></p><div><canvas id="ant-evidence-canvas" aria-label="Unchanged ANT renderer"></canvas></div></body></html>' }));
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.evaluate(async ({ controllerSource, variant, seed }) => {
          const { AntController } = await import(`/${controllerSource}`);
          const { AntRenderer } = await import('/src/lib/renderers/AntRenderer.js');
          let rngState = seed >>> 0, rngCalls = 0, contacts = 0;
          const model = new AntController({ random: () => { rngCalls++; rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 0x100000000; } });
          model.subscribe(event => { if (event.type === 'foot-contact') contacts++; });
          await model.init();
          const renderer = new AntRenderer(document.querySelector('#ant-evidence-canvas'));
          await renderer.init({ width: 720, height: 720, pixelRatio: 1 });
          window.__founderVisual = { model, renderer, state: () => ({ rngState, rngCalls, contacts }) };
          document.querySelector('#label').textContent = `${variant.toUpperCase()} · natural seed ${seed} · ANT`;
          renderer.render(model.getSnapshot());
        }, { controllerSource, variant, seed });
        let current = 0;
        for (const seconds of TIMES) {
          for (; current < seconds; current += 5) await page.evaluate(() => {
            for (let i = 0; i < 300; i++) window.__founderVisual.model.tick(1 / 60);
          });
          const captured = await page.evaluate(async () => {
            const { model, renderer, state } = window.__founderVisual, snapshot = model.getSnapshot();
            const data = { seconds: snapshot.analysis.simulationTimeMs / 1000, ...state(),
              population: snapshot.analysis.population, spawned: snapshot.analysis.totalSpawned, retired: snapshot.analysis.totalRetired,
              plateCount: snapshot.surfacePlates.plates.length, pheromoneMass: snapshot.pheromone.totalMass,
              audioEnabled: snapshot.audio.enabled, pheromone: Array.from(snapshot.pheromone.values),
              agents: snapshot.agents.map(ant => ({ id: ant.id, x: ant.x, y: ant.y, vx: ant.vx, vy: ant.vy, heading: ant.heading, adherence: ant.trailAdherence })) };
            document.querySelector('#state').textContent = `${data.seconds.toFixed(2)} simulated seconds · ${data.population} ants · ${data.plateCount} natural Plates · audio Off`;
            renderer.render(snapshot);
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return data;
          });
          assert.ok(Math.abs(captured.seconds - seconds) < 1e-5);
          assert.equal(captured.audioEnabled, false);
          const filename = `chrome-${variant}-seed${seed}-${seconds}s.png`;
          await page.screenshot({ path: resolve(out, filename), fullPage: true });
          captured.pheromoneSha256 = digest(JSON.stringify(captured.pheromone));
          delete captured.pheromone;
          metadata.checkpoints.push({ ...captured, image: filename });
          console.log(`Chrome ${variant} seed ${seed}: ${seconds} s, ${captured.population} ants, ${captured.plateCount} natural Plates.`);
        }
        if (!args.has('--no-motion')) {
          const clip = await page.evaluate(async () => {
            const probe = window.__founderVisual, stream = document.querySelector('#ant-evidence-canvas').captureStream(30);
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }), chunks = [];
            recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
            const startMs = probe.model.simulationTimeMs, wallStart = performance.now();
            let frames = 0, handle, stopped = false;
            probe.model.resetFrameClock();
            const render = timestamp => {
              if (stopped) return;
              probe.model.update(timestamp); probe.renderer.render(probe.model.getSnapshot()); frames++;
              handle = requestAnimationFrame(render);
            };
            recorder.start(500); handle = requestAnimationFrame(render);
            await new Promise(resolve => setTimeout(resolve, 15000));
            stopped = true; cancelAnimationFrame(handle);
            const wallMs = performance.now() - wallStart, endMs = probe.model.simulationTimeMs;
            await new Promise(resolve => { recorder.onstop = resolve; recorder.stop(); });
            const bytes = new Uint8Array(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer());
            let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            stream.getTracks().forEach(track => track.stop());
            return { base64: btoa(binary), frames, wallSeconds: wallMs / 1000, startSeconds: startMs / 1000, endSeconds: endMs / 1000,
              audioTracks: stream.getAudioTracks().length, mimeType: recorder.mimeType, bytes: bytes.length, final: probe.state() };
          });
          const filename = `chrome-${variant}-seed${seed}-600s-silent-motion.webm`;
          await writeFile(resolve(out, filename), Buffer.from(clip.base64, 'base64')); delete clip.base64;
          metadata.motion = { ...clip, file: filename, timing: 'Real Chrome requestAnimationFrame and original controller.update; wall and simulation duration are recorded separately. Video-only capture, no audio tracks.' };
          assert.ok(clip.frames > 0 && clip.endSeconds > clip.startSeconds); assert.equal(clip.audioTracks, 0);
        }
        assert.deepEqual(errors, [], 'No Chrome page/console errors');
        metadata.errors = errors;
        await writeFile(resolve(out, `chrome-${variant}-seed${seed}-metadata.json`), `${JSON.stringify(metadata, null, 2)}\n`);
      } finally {
        await page.evaluate(async () => { const p = window.__founderVisual; if (p) { await p.renderer.destroy(); await p.model.destroy(); } }).catch(() => {});
        await page.close();
      }
    }
  } finally { await server.close(); }
}

function fixedUnit(value, scale) {
  const v = Math.max(0, Math.min(scale.maximum, value));
  return scale.knee ? Math.log1p(v / scale.knee) / Math.log1p(scale.maximum / scale.knee) : v / scale.maximum;
}
function validateGrid(grid) {
  assert.ok(Number.isInteger(grid.width) && grid.width > 0 && Number.isInteger(grid.height) && grid.height > 0);
  assert.equal(grid.values.length, grid.width * grid.height);
  assert.ok(grid.values.every(value => Number.isFinite(value) && value >= 0), 'Finite nonnegative raw grid values');
}
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
