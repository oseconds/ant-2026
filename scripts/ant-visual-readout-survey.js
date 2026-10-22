import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { buildReadoutRgba, READOUT_ALPHA, TENURE_SCALE_MS } from './ant-visual-readout-recipes.js';

const ROOT = process.cwd();
const INPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-21-long-run-exhibition/visual-capacity-1024');
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-22-visual-turnover-survey/visual/final-v2');
const TIMES = [0, 900, 1800, 3600, 7200];
const WIDTH = 640, HEIGHT = 640, HEADER = 26;
const SOURCE_PATHS = ['src/lib/renderers/AntRenderer.js', 'src/lib/agents/ant/MaterialStratigraphy.js', 'scripts/ant-visual-readout-recipes.js'];

if (process.argv.includes('--self-check')) {
  selfCheck();
  console.log('self-check passed');
} else await run();

async function run() {
  assert.deepEqual((await readdir(OUTPUT).catch(e => e.code === 'ENOENT' ? [] : Promise.reject(e))).filter(name => name !== 'README.md'), [],
    `refusing to use non-empty output directory ${OUTPUT}`);
  await mkdir(OUTPUT, { recursive: true });
  const captureBytes = await readFile(resolve(INPUT, 'run-manifest.json'));
  const capture = JSON.parse(captureBytes);
  assert.equal(capture.provenance?.reachedTarget, true);
  const entries = [];
  for (const seconds of TIMES) {
    const file = `snapshot-${String(seconds).padStart(5, '0')}s.json`;
    const bytes = await readFile(resolve(INPUT, file));
    assert.equal(sha(bytes), capture.snapshots?.find(item => item.file === file)?.sha256, `${file} input hash`);
    const source = JSON.parse(bytes);
    validate(source, seconds);
    const before = sha(Buffer.from(JSON.stringify(source)));
    const snapshot = project(source);
    assert.equal(sha(Buffer.from(JSON.stringify(source))), before, `${file} source mutated`);
    entries.push({ seconds, file, sourceSha256: sha(bytes), projectionSha256: sha(Buffer.from(JSON.stringify(snapshot))),
      serialized: JSON.stringify(snapshot), stats: materialStats(source) });
  }
  const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async p => [p, sha(await readFile(resolve(ROOT, p)))])));
  const server = await createServer({ configFile: false, root: ROOT, appType: 'custom', server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    server.middlewares.use('/__ant_visual_survey__', (_req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><body style="margin:0"><main id="stage"></main></body></html>');
    });
    await server.listen();
    browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage({ viewport: { width: WIDTH * 5, height: HEIGHT + HEADER }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__ant_visual_survey__`);
    await page.evaluate(async ({ width, height }) => {
      const { AntRenderer } = await import('/src/lib/renderers/AntRenderer.js');
      const stage = document.querySelector('#stage'); stage.style.cssText = `position:relative;width:${width * 5}px;height:${height}px`;
      window.survey = {};
      for (const [index, mode] of ['baseline', 'recent', 'materialOnly'].entries()) {
        const holder = document.createElement('div'); holder.style.cssText = `position:absolute;left:${index * width}px;top:0;width:${width}px;height:${height}px`;
        const canvas = document.createElement('canvas'); canvas.style.cssText = `display:block;width:${width}px;height:${height}px`; holder.append(canvas); stage.append(holder);
        const renderer = new AntRenderer(canvas, mode === 'recent' ? { materialReadout: 'recent' } : {});
        if (mode === 'materialOnly') renderer.setDebugOptions({ pheromone: false });
        if (!await renderer.init({ width, height, pixelRatio: 1 })) throw Error(`${mode} init failed`);
        window.survey[mode] = { canvas, renderer };
      }
      window.survey.extra = {};
      for (const [index, mode] of ['identity', 'age', 'boundaries'].entries()) {
        const holder = document.createElement('div'); holder.style.cssText = `position:absolute;left:${(index + 3) * width}px;top:0;width:${width}px;height:${height}px`;
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; canvas.style.cssText = `display:block;width:${width}px;height:${height}px`;
        holder.append(canvas); stage.append(holder); window.survey.extra[mode] = canvas;
      }
    }, { width: WIDTH, height: HEIGHT });
    const outputs = [], timeSeries = Object.fromEntries(['baseline', 'recent', 'identity', 'tenure', 'boundaries', 'materialOnly'].map(k => [k, []]));
    for (const entry of entries) {
      const rendered = await page.evaluate(async ({ serialized, width, height, header }) => {
        const { buildReadoutRgba } = await import('/scripts/ant-visual-readout-recipes.js');
        const snapshot = JSON.parse(serialized), before = JSON.stringify(snapshot), s = window.survey;
        const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const png = {};
        for (const mode of ['baseline', 'recent']) { s[mode].renderer.render(snapshot); await settle(); png[mode] = s[mode].canvas.toDataURL('image/png'); }
        s.materialOnly.renderer.render({ ...snapshot, agents: [] }); await settle(); png.materialOnly = s.materialOnly.canvas.toDataURL('image/png');
        const mat = snapshot.stratigraphy, top = mat.stratigraphy.topLayerByCell, order = mat.stratigraphy.layerOrder;
        const birthTimes = order.map(id => mat.plates.find(plate => plate.id === id).bornAtSimulationTimeMs);
        for (const [mode, canvas] of Object.entries(s.extra)) {
          const mask = document.createElement('canvas'); mask.width = mat.width; mask.height = mat.height;
          const maskContext = mask.getContext('2d'), image = maskContext.createImageData(mat.width, mat.height);
          image.data.set(buildReadoutRgba(top, mat.width, mat.height, order, birthTimes, snapshot.analysis.simulationTimeMs,
            mode === 'age' ? 'tenure' : mode));
          maskContext.putImageData(image, 0, 0);
          const ctx = canvas.getContext('2d'), base = new Image(); base.src = png.baseline; await base.decode();
          ctx.clearRect(0, 0, width, height); ctx.drawImage(base, 0, 0, width, height);
          ctx.imageSmoothingEnabled = false; ctx.drawImage(mask, 0, 0, width, height);
          png[mode === 'age' ? 'tenure' : mode] = canvas.toDataURL('image/png');
        }
        if (JSON.stringify(snapshot) !== before) throw Error('renderer mutated snapshot');
        const tiles = document.createElement('canvas'); tiles.width = width * 5; tiles.height = height + header;
        const ctx = tiles.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, tiles.width, tiles.height); ctx.fillStyle = '#111'; ctx.font = '14px sans-serif';
        const modes = [['baseline', 'renderer default'], ['recent', 'renderer recent8'], ['identity', 'top identity palette'], ['tenure', 'current exposed-top tenure'], ['boundaries', 'exposed top-ID boundaries']];
        for (let i = 0; i < modes.length; i++) { const [key, label] = modes[i]; ctx.fillText(label, i * width + 8, 18); const img = new Image(); img.src = png[key]; await img.decode(); ctx.drawImage(img, i * width, header); }
        return { data: tiles.toDataURL('image/png'), panels: png, snapshotUnmutated: true };
      }, { serialized: entry.serialized, width: WIDTH, height: HEIGHT, header: HEADER });
      const bytes = dataUrlBytes(rendered.data), name = `contact-${String(Math.round(entry.seconds / 60)).padStart(3, '0')}m.png`;
      await writeFile(resolve(OUTPUT, name), bytes, { flag: 'wx' });
      const panelSourceHashes = Object.fromEntries(Object.entries(rendered.panels).map(([mode, dataUrl]) => [mode, panelSha(dataUrl)]));
      outputs.push({ seconds: entry.seconds, file: name, sha256: sha(bytes), bytes: bytes.length, dimensions: `${WIDTH * 5}x${HEIGHT + HEADER}`, panelSourceHashes, ...entry.stats });
      for (const [mode, dataUrl] of Object.entries(rendered.panels)) timeSeries[mode].push({ seconds: entry.seconds, dataUrl, sha256: panelSourceHashes[mode] });
    }
    for (const [mode, items] of Object.entries(timeSeries)) {
      for (const item of items) {
        const contact = outputs.find(output => output.seconds === item.seconds);
        assert.equal(item.sha256, contact?.panelSourceHashes?.[mode], `${mode} time-series source must match same-time contact panel bytes`);
      }
      const label = mode === 'tenure' ? 'current exposed-top tenure' : mode;
      const bytes = dataUrlBytes(await page.evaluate(async ({ items, width, height, header, label }) => { const c=document.createElement('canvas');c.width=width*items.length;c.height=height+header;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#111';x.font='14px sans-serif';for(let i=0;i<items.length;i++){const img=new Image();img.src=items[i].dataUrl;await img.decode();x.fillText(`${items[i].seconds/60}m · ${label}`,i*width+8,18);x.drawImage(img,i*width,header)}return c.toDataURL('image/png')},{items,width:WIDTH,height:HEIGHT,header:HEADER,label}));
      const file = `timeseries-${mode}.png`; await writeFile(resolve(OUTPUT,file),bytes,{flag:'wx'}); outputs.push({file,sha256:sha(bytes),bytes:bytes.length,dimensions:`${WIDTH*items.length}x${HEIGHT+HEADER}`,recipe:mode,
        sourcePanels: items.map(({ seconds, sha256 }) => ({ seconds, sha256 }))});
    }
    const manifest = { schemaVersion: 2, purpose: 'Fixed same-snapshot comparison at 0, 15, 30, 60, and 120 minutes, with per-recipe time series and a material-only view.',
      source: { captureManifestSha256: sha(captureBytes), sourceCommit: capture.provenance.sourceCommit, inputDirectory: '2026-10-21-long-run-exhibition/visual-capacity-1024', sourceHashes,
        snapshots: entries.map(({ seconds, file, sourceSha256, projectionSha256 }) => ({ seconds, file, sourceSha256, projectedSnapshotSha256: projectionSha256 })) },
      rendering: { browserVersion: browser.version(), surveyScriptSha256: sha(await readFile(resolve(ROOT, 'scripts/ant-visual-readout-survey.js'))), viewport: { width: WIDTH * 5, height: HEIGHT + HEADER }, canvas: `${WIDTH}x${HEIGHT}`, deviceScaleFactor: 1, pixelRatio: 1,
        readoutOverlayAlpha: READOUT_ALPHA,
        settle: 'two requestAnimationFrame callbacks', recipes: ['AntRenderer baseline', 'AntRenderer materialReadout recent8',
          `actual exposed top Plate index, fixed golden-angle hue palette; diagnostic identity ceiling; alpha ${READOUT_ALPHA}`, `current exposed-top tenure = simulation time minus actual top Plate bornAtSimulationTimeMs; fixed ${TENURE_SCALE_MS / 60000}min saturating map; alpha ${READOUT_ALPHA}`, `monochrome boundary between adjacent actual exposed top Plate identities; alpha ${READOUT_ALPHA}`],
        antsAndPheromone: true, materialOnly: 'AntRenderer with agents removed and pheromone debug disabled; native material map retained and scaled to 640x640', simulationAudio: false, maskReadout: '96x96 raster cells, displayed with nearest-neighbor scaling; not an exhibition rendering' }, outputs, completed: true };
    await writeFile(resolve(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ output: OUTPUT, contactsheets: outputs.length, browserVersion: manifest.rendering.browserVersion }));
  } finally { await browser?.close(); await server.close(); }
}

function validate(s, seconds) {
  const m = s.stratigraphy, t = m?.stratigraphy;
  assert.ok(Array.isArray(s.agents) && m?.plates && Array.isArray(t?.layerOrder), `${seconds}s world data`);
  assert.equal(t.layerOrder.length, m.plates.length);
  assert.equal(t.topLayerByCell.length, m.width * m.height);
  for (const x of t.topLayerByCell) assert.ok(Number.isInteger(x) && x >= -1 && x < t.layerOrder.length);
  for (const id of t.layerOrder) assert.ok(m.plates.some(p => p.id === id), 'complete top identity map must resolve to Plate descriptor');
  assert.ok(Number.isFinite(s.analysis?.simulationTimeMs));
}
function project(s) {
  const { width, height, revision, plates } = s.stratigraphy, t = s.stratigraphy.stratigraphy;
  return { agents: s.agents, pheromone: s.pheromone, analysis: { simulationTimeMs: s.analysis.simulationTimeMs },
    stratigraphy: { width, height, revision, plates: plates.map(({ id, bornAtSimulationTimeMs }) => ({ id, bornAtSimulationTimeMs })),
      stratigraphy: { layerOrder: t.layerOrder, topLayerByCell: t.topLayerByCell, layerCountByCell: t.layerCountByCell } } };
}
function materialStats(s) {
  const m=s.stratigraphy, t=m.stratigraphy; let exposed=0, overlap=0, unique=0; const seen=new Set();
  for (let i=0;i<t.topLayerByCell.length;i++) if (t.topLayerByCell[i]>=0) { exposed++; if ((t.layerCountByCell[i]||0)>1) overlap++; seen.add(t.topLayerByCell[i]); }
  unique=seen.size; return { topCells: exposed, overlappingCells: overlap, exposedPlateIdentities: unique, retainedPlates: m.plates.length };
}
function selfCheck() {
  const fake={agents:[],pheromone:{},analysis:{simulationTimeMs:1000},stratigraphy:{width:2,height:1,plates:[{id:'a',bornAtSimulationTimeMs:0}],stratigraphy:{layerOrder:['a'],topLayerByCell:[-1,0],layerCountByCell:[0,1]}}};
  validate(fake,0); const copy=project(fake); assert.deepEqual(copy.stratigraphy.stratigraphy.topLayerByCell,[-1,0]); assert.equal(materialStats(fake).topCells,1);
  fake.stratigraphy.stratigraphy.topLayerByCell[1]=9; assert.throws(()=>validate(fake,0));
  const top = [0, 0, 1, 1], order = ['a', 'b'], births = [0, 0];
  const idBefore = buildReadoutRgba(top, 2, 2, order, births, 0, 'identity');
  const idAfter = buildReadoutRgba(top, 2, 2, order, births, 1_000_000, 'identity');
  const edgeBefore = buildReadoutRgba(top, 2, 2, order, births, 0, 'boundaries');
  const edgeAfter = buildReadoutRgba(top, 2, 2, order, births, 1_000_000, 'boundaries');
  assert.deepEqual(idAfter, idBefore, 'clock advance without new births preserves identity colors');
  assert.deepEqual(edgeAfter, edgeBefore, 'clock advance without geometry/top changes preserves boundary pixels');
  const tenureBefore = buildReadoutRgba(top, 2, 2, order, births, 0, 'tenure');
  const tenureAfter = buildReadoutRgba(top, 2, 2, order, births, 1_000_000, 'tenure');
  assert.notDeepEqual(tenureAfter, tenureBefore, 'clock advance changes tenure color without implying a birth or geometry change');
  assert.deepEqual(buildReadoutRgba(top, 2, 2, order, births, TENURE_SCALE_MS * 2, 'tenure'),
    buildReadoutRgba(top, 2, 2, order, births, TENURE_SCALE_MS * 3, 'tenure'), 'tenure scale saturates at 120 minutes');
  const samplePng = `data:image/png;base64,${Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64')}`;
  assertSamePanelSource(samplePng, samplePng);
}
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function panelSha(dataUrl) { return sha(dataUrlBytes(dataUrl)); }
function assertSamePanelSource(contactDataUrl, seriesDataUrl) {
  assert.equal(panelSha(contactDataUrl), panelSha(seriesDataUrl), 'contact and time-series panels must use identical PNG bytes');
}
function dataUrlBytes(value) { const m=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value); assert.ok(m); const b=Buffer.from(m[1],'base64'); assert.deepEqual(b.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10])); return b; }
