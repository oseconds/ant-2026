import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const DEFAULT_INPUT = 'docs/ant/evidence/2026-10-21-long-run-exhibition/visual';
const INPUT = resolve(ROOT, process.env.ANT_VISUAL_INPUT || DEFAULT_INPUT);
const SHADOW_INPUT = INPUT !== resolve(ROOT, DEFAULT_INPUT);
const CAP_REFERENCE = SHADOW_INPUT
  ? resolve(ROOT, 'docs/ant/evidence/2026-10-21-long-run-exhibition/visual/snapshot-cap-0256.json') : null;
const OUTPUT = resolve(INPUT, 'stills-verified');
const TIMES = [0, 60, 300, 900, 1800, 3600, 7200];
const WIDTH = 640, HEIGHT = 640, TOP_BIRTH_SUFFIX = 8;
const SOURCE_PATHS = ['src/lib/renderers/AntRenderer.js', 'scripts/ant-exhibition-visual-compare.js'];

if (process.argv.includes('--self-check')) {
  selfCheck();
  console.log('self-check passed');
} else {
  await run();
}

async function run() {
  await mkdir(OUTPUT, { recursive: true });
  const priorOutputs = await readdir(OUTPUT);
  assert.ok(!priorOutputs.includes('manifest.json'), 'refusing to overwrite a completed visual comparison');
  for (const file of priorOutputs) assert.match(file, /^(?:compare-(?:\d{5}s|default-cap-reference-0256)|time-series-(?:baseline|latest8-top|burial-depth))\.png$/,
    `refusing to overwrite unexpected prior output ${file}`);
  const captureManifestBytes = await readFile(resolve(INPUT, 'run-manifest.json'));
  const captureManifest = JSON.parse(captureManifestBytes);
  assert.equal(captureManifest.provenance?.reachedTarget, true, 'natural capture must be complete before rendering');
  const snapshots = [];
  for (const seconds of TIMES) {
    const file = `snapshot-${String(seconds).padStart(5, '0')}s.json`;
    const bytes = await readFile(resolve(INPUT, file));
    const recorded = captureManifest.snapshots?.find(entry => entry.file === file);
    assert.ok(recorded, `capture manifest must record ${file}`);
    assert.equal(sha(bytes), recorded.sha256, `${file} must match the natural capture manifest`);
    const completeSnapshot = JSON.parse(bytes);
    validateSnapshot(completeSnapshot, seconds);
    const metrics = summarizeSnapshot(completeSnapshot);
    snapshots.push({ seconds, label: SHADOW_INPUT ? `capacity shadow · ${seconds}s` : `${seconds}s`, file, bytes,
      snapshot: renderInputSnapshot(completeSnapshot), metrics, sha256: sha(bytes) });
  }
  const capRecord = SHADOW_INPUT
    ? { file: CAP_REFERENCE, sha256: sha(await readFile(CAP_REFERENCE)), seconds: 3814.783333321243, plateCount: 256 }
    : captureManifest.capSnapshot;
  assert.ok(capRecord?.file && capRecord?.sha256, 'capture manifest must include the exact cap snapshot');
  const capBytes = await readFile(SHADOW_INPUT ? CAP_REFERENCE : resolve(INPUT, capRecord.file));
  assert.equal(sha(capBytes), capRecord.sha256, 'cap reference must match its recorded source hash');
  const completeCapSnapshot = JSON.parse(capBytes);
  validateSnapshot(completeCapSnapshot, capRecord.seconds);
  const capMetrics = summarizeSnapshot(completeCapSnapshot);
  const capSnapshot = renderInputSnapshot(completeCapSnapshot);
  const capLabel = SHADOW_INPUT ? 'default-cap reference · 256 Plates · 63m35s' : `cap ${capRecord.seconds}s`;
  snapshots.push({ seconds: capRecord.seconds, label: capLabel, file: capRecord.file,
    bytes: capBytes, snapshot: capSnapshot, metrics: capMetrics, sha256: capRecord.sha256, timeColumn: -1,
    outputName: SHADOW_INPUT ? 'compare-default-cap-reference-0256.png' : 'compare-cap-0256.png' });

  const finalMetrics = snapshots.find(entry => entry.seconds === 7200).metrics;
  assert.equal(capMetrics.plateCount, capRecord.plateCount || 256, 'reference must have the expected capacity');
  if (!SHADOW_INPUT) {
    assert.equal(capMetrics.stratigraphyCellStateSha256, finalMetrics.stratigraphyCellStateSha256,
      'cell top/depth state should remain unchanged from cap to 120 minutes');
    assert.equal(capMetrics.latest8TopMaskSha256, finalMetrics.latest8TopMaskSha256,
      'latest-birth top overlay should remain unchanged from cap to 120 minutes');
    assert.equal(capMetrics.burialDepthAlphaSha256, finalMetrics.burialDepthAlphaSha256,
      'burial-depth overlay should remain unchanged from cap to 120 minutes');
  }

  const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, sha(await readFile(resolve(ROOT, path)))])));
  const server = await createServer({ configFile: false, root: ROOT, appType: 'custom',
    server: { host: '127.0.0.1', port: 0, strictPort: false } });
  let browser;
  try {
    server.middlewares.use('/__ant_visual_compare__', (_req, res) => {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end('<!doctype html><html><body style="margin:0"><main id="stage"></main></body></html>');
    });
    await server.listen();
    const port = server.httpServer.address().port;
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/__ant_visual_compare__`);
    await page.evaluate(async ({ width, height, times }) => {
      const { AntRenderer } = await import('/src/lib/renderers/AntRenderer.js');
      const stage = document.querySelector('#stage');
      stage.style.cssText = `position:relative;width:${width}px;height:${height}px`;
      const canvas = document.createElement('canvas');
      const overlay = document.createElement('canvas');
      for (const element of [canvas, overlay]) element.style.cssText = `position:absolute;inset:0;width:${width}px;height:${height}px`;
      overlay.style.pointerEvents = 'none';
      stage.append(canvas, overlay);
      window.visualCompare = { renderer: new AntRenderer(canvas), canvas, overlay };
      window.visualCompare.sheets = Object.fromEntries(['baseline', 'latest8-top', 'burial-depth'].map(mode => {
        const sheet = document.createElement('canvas');
        sheet.width = width * times.length;
        sheet.height = height + 26;
        return [mode, sheet];
      }));
      if (!await window.visualCompare.renderer.init({ width, height, pixelRatio: 1 })) throw new Error('AntRenderer initialization failed');
    }, { width: WIDTH, height: HEIGHT, times: TIMES });

    const tiles = [];
    const composites = new Map();
    for (const entry of snapshots) {
      const serialized = JSON.stringify(entry.snapshot);
      const tileData = await page.evaluate(async ({ serialized, seconds, label, timeColumn, width, height, topBirthSuffix, expectedUnionCells,
        paintLatestBirthSuffixSource, latestPlateIndexesSource, paintBurialDepthSource }) => {
        const { renderer, canvas, overlay, sheets } = window.visualCompare;
        const paintLatest = eval(`(() => { const latestPlateIndexes = ${latestPlateIndexesSource}; return ${paintLatestBirthSuffixSource}; })()`);
        const paintDepth = eval(`(${paintBurialDepthSource})`);
        const settleFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const snapshot = JSON.parse(serialized);
        const before = JSON.stringify(snapshot);
        const modes = ['baseline', 'latest8-top', 'burial-depth'];
        const tile = document.createElement('canvas');
        tile.width = width * modes.length;
        tile.height = height + 26;
        const ctx = tile.getContext('2d');

        renderer.setDebugOptions({ material: true, pheromone: false });
        renderer.render({ ...snapshot, agents: [] });
        await settleFrame();
        const materialPixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
        let materialOnlyNonwhitePixels = 0;
        for (let offset = 0; offset < materialPixels.length; offset += 4) {
          if (materialPixels[offset] < 254 && materialPixels[offset + 1] < 254 && materialPixels[offset + 2] < 254) materialOnlyNonwhitePixels += 1;
        }
        if ((expectedUnionCells === 0) !== (materialOnlyNonwhitePixels === 0)) {
          throw new Error(`material-only pixel count ${materialOnlyNonwhitePixels} disagrees with unionCells ${expectedUnionCells} at ${label}`);
        }
        renderer.setDebugOptions({ pheromone: true });
        for (let modeIndex = 0; modeIndex < modes.length; modeIndex += 1) {
          const mode = modes[modeIndex];
          renderer.render(snapshot);
          await settleFrame();
          const overlayCtx = overlay.getContext('2d');
          overlayCtx.clearRect(0, 0, width, height);
          if (mode === 'latest8-top') paintLatest(overlayCtx, snapshot, width, height, topBirthSuffix);
          if (mode === 'burial-depth') paintDepth(overlayCtx, snapshot, width, height);
          ctx.fillStyle = '#fff';
          ctx.fillRect(modeIndex * width, 0, width, height + 26);
          ctx.drawImage(canvas, modeIndex * width, 26, width, height);
          ctx.drawImage(overlay, modeIndex * width, 26, width, height);
          ctx.fillStyle = '#111';
          ctx.font = '14px sans-serif';
          ctx.fillText(`${label} · ${mode}`, modeIndex * width + 8, 18);
          if (timeColumn >= 0) {
            const sheetCtx = sheets[mode].getContext('2d');
            sheetCtx.fillStyle = '#fff';
            sheetCtx.fillRect(timeColumn * width, 0, width, height + 26);
            sheetCtx.drawImage(canvas, timeColumn * width, 26, width, height);
            sheetCtx.drawImage(overlay, timeColumn * width, 26, width, height);
            sheetCtx.fillStyle = '#111';
            sheetCtx.font = '14px sans-serif';
            sheetCtx.fillText(`${label} · ${mode}`, timeColumn * width + 8, 18);
          }
        }
        const after = JSON.stringify(snapshot);
        if (before !== after) throw new Error(`snapshot mutated at ${seconds}s`);
        return { dataUrl: tile.toDataURL('image/png'), snapshotUnmutated: true, materialOnlyNonwhitePixels };
      }, { serialized, seconds: entry.seconds, timeColumn: TIMES.indexOf(entry.seconds),
        label: entry.label || `${entry.seconds}s`, expectedUnionCells: entry.metrics.unionCells,
        width: WIDTH, height: HEIGHT, topBirthSuffix: TOP_BIRTH_SUFFIX,
        paintLatestBirthSuffixSource: paintLatestBirthSuffix.toString(),
        latestPlateIndexesSource: latestPlateIndexes.toString(),
        paintBurialDepthSource: paintBurialDepth.toString() });
      const png = Buffer.from(tileData.dataUrl.split(',')[1], 'base64');
      const file = entry.outputName || `compare-${String(entry.seconds).padStart(5, '0')}s.png`;
      await writeOutput(file, png);
      composites.set(file, tileData.dataUrl);
      tiles.push({ seconds: entry.seconds, source: entry.file, sourceSha256: entry.sha256,
        file, sha256: sha(png), bytes: png.length, dimensions: `${WIDTH * 3}x${HEIGHT + 26}`,
        modes: ['baseline', 'latest8-top', 'burial-depth'], snapshotUnmutated: tileData.snapshotUnmutated,
        materialOnlyNonwhitePixels: tileData.materialOnlyNonwhitePixels,
        descriptiveMetrics: entry.metrics });
    }
    const timeSeriesData = await page.evaluate(() => Object.fromEntries(Object.entries(window.visualCompare.sheets)
      .map(([mode, canvas]) => [mode, canvas.toDataURL('image/png')])));
    const timeSeriesSheets = [];
    for (const [mode, dataUrl] of Object.entries(timeSeriesData)) {
      const png = Buffer.from(dataUrl.split(',')[1], 'base64');
      const file = `time-series-${mode}.png`;
      await writeOutput(file, png);
      timeSeriesSheets.push({ mode, file, sha256: sha(png), bytes: png.length,
        layout: `${TIMES.length} columns, time left-to-right`, dimensions: `${WIDTH * TIMES.length}x${HEIGHT + 26}` });
    }
    // Release large time-series canvases before rendering two full snapshots together.
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__ant_visual_compare__`);
    await page.evaluate(async ({ width, height }) => {
      const { AntRenderer } = await import('/src/lib/renderers/AntRenderer.js');
      const stage = document.querySelector('#stage'); stage.style.cssText = `position:relative;width:${width}px;height:${height}px`;
      const canvas = document.createElement('canvas'), overlay = document.createElement('canvas');
      for (const element of [canvas, overlay]) element.style.cssText = `position:absolute;inset:0;width:${width}px;height:${height}px`;
      overlay.style.pointerEvents = 'none'; stage.append(canvas, overlay);
      window.visualCompare = { renderer: new AntRenderer(canvas), canvas, overlay };
      if (!await window.visualCompare.renderer.init({ width, height, pixelRatio: 1 })) throw new Error('AntRenderer initialization failed');
    }, { width: WIDTH, height: HEIGHT });
    const capEntry = snapshots.find(entry => entry.file === capRecord.file);
    const finalEntry = snapshots.find(entry => entry.seconds === 7200);
    const materialOnlyData = await page.evaluate(async ({ capSerialized, finalSerialized, capLabel, shadowInput,
      width, height, topBirthSuffix, paintLatestBirthSuffixSource, latestPlateIndexesSource, paintBurialDepthSource }) => {
      const { renderer, canvas, overlay } = window.visualCompare;
      const paintLatest = eval(`(() => { const latestPlateIndexes = ${latestPlateIndexesSource}; return ${paintLatestBirthSuffixSource}; })()`);
      const paintDepth = eval(`(${paintBurialDepthSource})`);
      const settleFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const modes = ['baseline', 'latest8-top', 'burial-depth'];
      const result = document.createElement('canvas');
      result.width = width * modes.length; result.height = (height + 26) * 2;
      const ctx = result.getContext('2d');
      const hashes = {};
      const finalLabel = shadowInput ? 'capacity shadow · 120m' : '7200s';
      for (const [row, [label, serialized]] of [[capLabel, capSerialized], [finalLabel, finalSerialized]].entries()) {
        const snapshot = JSON.parse(serialized);
        const rowLabel = row === 0 ? capLabel : label;
        renderer.setDebugOptions({ material: true, pheromone: false });
        renderer.render({ ...snapshot, agents: [] });
        await settleFrame();
        for (let column = 0; column < modes.length; column += 1) {
          const mode = modes[column];
          const overlayCtx = overlay.getContext('2d');
          overlayCtx.clearRect(0, 0, width, height);
          if (mode === 'latest8-top') paintLatest(overlayCtx, snapshot, width, height, topBirthSuffix);
          if (mode === 'burial-depth') paintDepth(overlayCtx, snapshot, width, height);
          const pixels = document.createElement('canvas');
          pixels.width = width; pixels.height = height;
          const pixelCtx = pixels.getContext('2d');
          pixelCtx.drawImage(canvas, 0, 0); pixelCtx.drawImage(overlay, 0, 0);
          const pixelBytes = pixelCtx.getImageData(0, 0, width, height).data;
          const digest = await crypto.subtle.digest('SHA-256', pixelBytes);
          hashes[`${rowLabel}/${mode}`] = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
          const y = row * (height + 26), x = column * width;
          ctx.fillStyle = '#fff'; ctx.fillRect(x, y, width, height + 26);
          ctx.drawImage(pixels, x, y + 26);
          ctx.fillStyle = '#111'; ctx.font = '14px sans-serif';
          ctx.fillText(`${rowLabel} · ${mode} · material only`, x + 8, y + 18);
        }
      }
      return { dataUrl: result.toDataURL('image/png'), hashes };
    }, { capSerialized: JSON.stringify(capEntry.snapshot), finalSerialized: JSON.stringify(finalEntry.snapshot), shadowInput: SHADOW_INPUT,
      capLabel, width: WIDTH, height: HEIGHT, topBirthSuffix: TOP_BIRTH_SUFFIX,
      paintLatestBirthSuffixSource: paintLatestBirthSuffix.toString(), latestPlateIndexesSource: latestPlateIndexes.toString(),
      paintBurialDepthSource: paintBurialDepth.toString() });
    if (!SHADOW_INPUT) for (const mode of ['baseline', 'latest8-top', 'burial-depth']) {
      assert.equal(materialOnlyData.hashes[`${capLabel}/${mode}`], materialOnlyData.hashes[`7200s/${mode}`],
        `${mode} material-only render must match exactly at cap and 120 minutes`);
    }
    const materialOnlyPng = Buffer.from(materialOnlyData.dataUrl.split(',')[1], 'base64');
    const materialComparisonFile = SHADOW_INPUT ? 'material-only-default-cap-reference-vs-capacity-shadow-120m.png' : 'postcap-material-only-cap-vs-120m.png';
    await writeOutput(materialComparisonFile, materialOnlyPng);
    const afterHashes = await Promise.all(snapshots.map(async ({ file }) => sha(await readFile(resolve(INPUT, file)))));
    assert.deepEqual(afterHashes, snapshots.map(({ sha256 }) => sha256), 'source snapshots must remain byte-identical');
    const capTile = tiles.find(entry => entry.source === capRecord.file);
    const finalTile = tiles.find(entry => entry.seconds === 7200);
    const pairedData = await page.evaluate(async ({ capUrl, finalUrl, width, height }) => {
      const decode = url => new Promise((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url;
      });
      const [cap, final] = await Promise.all([decode(capUrl), decode(finalUrl)]);
      const canvas = document.createElement('canvas');
      canvas.width = width * 3; canvas.height = (height + 26) * 2;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(cap, 0, 0); ctx.drawImage(final, 0, height + 26);
      return canvas.toDataURL('image/png');
    }, { capUrl: composites.get(capTile.file), finalUrl: composites.get(finalTile.file), width: WIDTH, height: HEIGHT });
    const pairedPng = Buffer.from(pairedData.split(',')[1], 'base64');
    const comparisonFile = SHADOW_INPUT ? 'default-cap-reference-vs-capacity-shadow-120m.png' : 'postcap-cap-vs-120m.png';
    await writeOutput(comparisonFile, pairedPng);
    let latest2Comparison = null;
    if (SHADOW_INPUT) {
      const latest2 = await page.evaluate(async ({ reference, final, width, height, latestPlateIndexesSource, paintLatestBirthSuffixSource }) => {
        const { renderer, canvas, overlay } = window.visualCompare;
        const paintLatest = eval(`(() => { const latestPlateIndexes = ${latestPlateIndexesSource}; return ${paintLatestBirthSuffixSource}; })()`);
        const settleFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rows = [['default-cap reference · 256 Plates · 63m35s', reference], ['capacity shadow · 1024 limit · 120m', final]];
        const result = document.createElement('canvas'); result.width = width; result.height = (height + 26) * rows.length;
        const ctx = result.getContext('2d'), pixelSha256 = [];
        renderer.setDebugOptions({ material: true, pheromone: true });
        for (const [row, [label, serialized]] of rows.entries()) {
          const snapshot = JSON.parse(serialized);
          renderer.render(snapshot); await settleFrame();
          overlay.getContext('2d').clearRect(0, 0, width, height);
          paintLatest(overlay.getContext('2d'), snapshot, width, height, 2);
          const pixels = document.createElement('canvas'); pixels.width = width; pixels.height = height;
          const pixelCtx = pixels.getContext('2d'); pixelCtx.drawImage(canvas, 0, 0); pixelCtx.drawImage(overlay, 0, 0);
          const digest = await crypto.subtle.digest('SHA-256', pixelCtx.getImageData(0, 0, width, height).data);
          pixelSha256.push([...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''));
          ctx.fillStyle = '#fff'; ctx.fillRect(0, row * (height + 26), width, height + 26);
          ctx.drawImage(pixels, 0, row * (height + 26) + 26);
          ctx.fillStyle = '#111'; ctx.font = '14px sans-serif'; ctx.fillText(`${label} · latest 2 top births`, 8, row * (height + 26) + 18);
        }
        return { dataUrl: result.toDataURL('image/png'), pixelSha256 };
      }, { reference: JSON.stringify(capEntry.snapshot), final: JSON.stringify(finalEntry.snapshot), width: WIDTH, height: HEIGHT,
        latestPlateIndexesSource: latestPlateIndexes.toString(), paintLatestBirthSuffixSource: paintLatestBirthSuffix.toString() });
      const png = Buffer.from(latest2.dataUrl.split(',')[1], 'base64');
      latest2Comparison = { file: 'latest2-top-default-cap-reference-vs-capacity-shadow-120m.png', sha256: sha(png), bytes: png.length,
        dimensions: `${WIDTH}x${(HEIGHT + 26) * 2}`, pixelSha256: latest2.pixelSha256 };
      await writeOutput(latest2Comparison.file, png);
    }
    const manifest = { schemaVersion: 1,
      purpose: SHADOW_INPUT
        ? 'Descriptive capacity-shadow comparison against a default-cap reference from a separate run; worlds are not matched and no human-preference or artistic claim is made.'
        : 'Descriptive comparison of the current AntRenderer view and two detached, snapshot-derived overlays; no human-preference or artistic claim.',
      provenance: { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        sourceHashes, browserVersion: browser.version(), viewport: { width: WIDTH, height: HEIGHT, pixelRatio: 1 },
        p5: 'AntRenderer loaded through Vite from the current workspace; same renderer and dimensions for all modes.',
        captureManifestSha256: sha(captureManifestBytes), input: process.env.ANT_VISUAL_INPUT || DEFAULT_INPUT,
        ...(SHADOW_INPUT ? { capacityShadow: true, reference: { source: CAP_REFERENCE.replace(`${ROOT}\\`, ''), sha256: capRecord.sha256,
          relation: 'separate default-cap run; not a matched-world continuation' } } : {}),
        snapshotsUnmutated: true, inputFilesByteIdenticalAfterCapture: true,
        postCapReadoutStable: !SHADOW_INPUT },
      captions: { comparison: SHADOW_INPUT
        ? 'Capacity shadow (1024 Plate limit, 120-minute run) is compared with a default-cap reference (256 Plates, about 63m35s); separate runs, not the same world.'
        : 'Natural 256-Plate cap and 120-minute post-cap readout from one run.' },
      formulations: { baseline: 'Current AntRenderer defaults: restrained union/depth material, pheromone, ants.',
        'latest8-top': `Baseline plus a fixed tint only where topLayerByCell points to one of the final ${TOP_BIRTH_SUFFIX} birth-order descriptors; no age-driven animation or timed fade.`,
        'burial-depth': 'Baseline plus a fixed alpha overlay on cells with layerCountByCell >= 2; opacity increases with depth, capped at 70. This encodes actual burial depth, not age.' },
      tiles, timeSeriesSheets, postCapComparison: { capSeconds: capRecord.seconds, finalSeconds: 7200,
        file: comparisonFile, sha256: sha(pairedPng), bytes: pairedPng.length,
        capTopologySha256: capMetrics.stratigraphyCellStateSha256, finalTopologySha256: finalMetrics.stratigraphyCellStateSha256 },
      postCapMaterialOnlyComparison: { file: materialComparisonFile,
        sha256: sha(materialOnlyPng), bytes: materialOnlyPng.length,
        pixelSha256: materialOnlyData.hashes, ...(SHADOW_INPUT ? { separateWorlds: true } : { exactPerModePixelMatch: true }) },
      ...(latest2Comparison ? { latest2TopBirthComparison: { ...latest2Comparison,
        method: 'Fixed tint over actual topLayerByCell cells belonging to each run’s latest two birth-order Plate descriptors; separate runs.' } } : {}) };
    await writeFile(resolve(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await browser.close();
    browser = null;
    console.log(JSON.stringify({ output: OUTPUT, tiles: tiles.length, browserVersion: manifest.provenance.browserVersion }));
  } finally {
    await browser?.close();
    await server.close();
  }
}

function validateSnapshot(snapshot, seconds) {
  assert.ok(snapshot && Array.isArray(snapshot.agents), `snapshot ${seconds}s must contain agents`);
  assert.ok(snapshot.stratigraphy?.stratigraphy?.topLayerByCell, `snapshot ${seconds}s must contain stratigraphy`);
  assert.ok(snapshot.stratigraphy?.plates, `snapshot ${seconds}s must contain plates`);
}

function renderInputSnapshot(snapshot) {
  const material = snapshot.stratigraphy;
  return { agents: snapshot.agents, pheromone: snapshot.pheromone, stratigraphy: {
    width: material.width, height: material.height, revision: material.revision,
    plates: material.plates.map(({ id, bornAtSimulationTimeMs }) => ({ id, bornAtSimulationTimeMs })),
    stratigraphy: { topLayerByCell: material.stratigraphy.topLayerByCell,
      layerCountByCell: material.stratigraphy.layerCountByCell }
  } };
}

function summarizeSnapshot(snapshot) {
  const material = snapshot.stratigraphy;
  const { topLayerByCell: top, layerCountByCell: depth } = material.stratigraphy;
  const latest = latestPlateIndexes(material.plates, TOP_BIRTH_SUFFIX);
  const latestTopMask = top.map(plateIndex => Number(latest.has(plateIndex)));
  const burialDepthAlpha = depth.map(count => count < 2 ? 0 : Math.min(70, 14 + (count - 1) * 10));
  const depthHistogram = {};
  let unionCells = 0, topCells = 0, latest8TopCells = 0, buriedCells = 0;
  for (let index = 0; index < depth.length; index += 1) {
    if (depth[index] > 0) unionCells += 1;
    if (depth[index] > 1) buriedCells += 1;
    depthHistogram[depth[index]] = (depthHistogram[depth[index]] || 0) + 1;
    const plateIndex = top[index];
    if (plateIndex >= 0) {
      topCells += 1;
      if (latest.has(plateIndex)) latest8TopCells += 1;
    }
  }
  return { plateCount: material.plates.length, unionCells, topCells, latest8TopCells, buriedCells, depthHistogram,
    stratigraphyCellStateSha256: sha(Buffer.from(JSON.stringify({ top, depth }))),
    latest8TopMaskSha256: sha(Buffer.from(JSON.stringify(latestTopMask))),
    burialDepthAlphaSha256: sha(Buffer.from(JSON.stringify(burialDepthAlpha))) };
}

function paintLatestBirthSuffix(ctx, snapshot, width, height, suffixCount) {
  const material = snapshot.stratigraphy;
  const top = material.stratigraphy.topLayerByCell;
  const latest = latestPlateIndexes(material.plates, suffixCount);
  const cellW = width / material.width, cellH = height / material.height;
  for (let index = 0; index < top.length; index += 1) {
    const plateIndex = top[index];
    const x = (index % material.width) * cellW, y = Math.floor(index / material.width) * cellH;
    if (latest.has(plateIndex)) {
      ctx.fillStyle = 'rgba(194, 112, 39, 0.30)';
      ctx.fillRect(x, y, cellW + 0.2, cellH + 0.2);
    }
  }
}

function latestPlateIndexes(plates, count) {
  return new Set(plates.map((plate, index) => ({ index, bornAt: plate.bornAtSimulationTimeMs }))
    .sort((a, b) => a.bornAt - b.bornAt || a.index - b.index)
    .slice(-count).map(({ index }) => index));
}

function paintBurialDepth(ctx, snapshot, width, height) {
  const material = snapshot.stratigraphy;
  const depth = material.stratigraphy.layerCountByCell;
  const cellW = width / material.width, cellH = height / material.height;
  for (let index = 0; index < depth.length; index += 1) {
    if (depth[index] < 2) continue;
    const alpha = Math.min(70, 14 + (depth[index] - 1) * 10);
    ctx.fillStyle = `rgba(90, 69, 138, ${alpha / 255})`;
    ctx.fillRect((index % material.width) * cellW, Math.floor(index / material.width) * cellH, cellW + 0.2, cellH + 0.2);
  }
}

function selfCheck() {
  const canvas = { calls: [], fillStyle: '', fillRect(...args) { this.calls.push([this.fillStyle, ...args]); } };
  const snapshot = { stratigraphy: { width: 2, height: 1, plates: [
    { bornAtSimulationTimeMs: 60000 }, { bornAtSimulationTimeMs: 0 }], stratigraphy: {
      topLayerByCell: [0, 1], layerCountByCell: [1, 2] } } };
  paintLatestBirthSuffix(canvas, snapshot, 20, 10, 1);
  assert.equal(canvas.calls.filter(([style]) => style.includes('194, 112, 39')).length, 1);
  assert.ok(canvas.calls.some(([, x]) => x === 0), 'birth timestamps define the latest cohort, not array position');
  canvas.calls.length = 0;
  paintBurialDepth(canvas, snapshot, 20, 10);
  assert.equal(canvas.calls.length, 1);
  assert.ok(canvas.calls[0][0].includes('90, 69, 138'));
}

function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function writeOutput(file, bytes) {
  const path = resolve(OUTPUT, file);
  try {
    const prior = await readFile(path);
    assert.equal(sha(prior), sha(bytes), `refusing to replace different existing output ${file}`);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeFile(path, bytes, { flag: 'wx' });
}
