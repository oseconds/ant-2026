import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { MATERIAL_CONTOUR_ALPHA, MATERIAL_CONTOUR_TONE, MATERIAL_LOCAL_CONTOUR_RADIUS_PX } from '../src/lib/renderers/materialConditionedPheromone.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const START = 'd057ae1acf9db3f1b44ce2a1dd51a7ed79dafdc2';
const MAIN = 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292';
const BRANCH = 'codex/ant-conditioned-trail-contour-cue-shadow-20261027';
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-27-conditioned-trail-contour-cue-shadow');
const PRIOR = resolve(ROOT, 'docs/ant/evidence/2026-10-27-material-conditioned-pheromone-readout');
const VIEWS = [
  { id: 1, label: 'conditioned-trail-only', material: 'production', readout: 'material-screened', contour: 'none', showMaterial: false },
  { id: 2, label: 'full-faint-contour', material: 'production', readout: 'material-screened', contour: 'full', showMaterial: false },
  { id: 3, label: 'local-activity-contour', material: 'production', readout: 'material-screened', contour: 'local', showMaterial: false }
];
const SOURCE_PATHS = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/renderers/AntRenderer.js', 'src/lib/renderers/antMaterialSubstrate.js',
  'src/lib/renderers/materialConditionedPheromone.js',
  'scripts/ant-conditioned-trail-contour-cue-shadow.js',
  'docs/ant/evidence/2026-10-27-conditioned-trail-contour-cue-shadow/review.html',
  'docs/ant/evidence/2026-10-27-conditioned-trail-contour-cue-shadow/PLAN.md',
  'docs/ant/evidence/2026-10-27-conditioned-trail-contour-cue-shadow/SOURCE-AUDIT.md',
  'docs/ant/evidence/2026-10-27-material-conditioned-pheromone-readout/ARTIST-REVIEW.md'];
const FRAME_TICKS = 6, VIDEO_START_TICK = 4201, MAX_TICK = 6301, DT = 1 / 60, WIDTH = 640, HEIGHT = 640;
const MILESTONES = ['pre-first-plate', 'post-first-plate', 'first-plate-plus-15s', 'first-plate-plus-30s'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const sourceBytes = path => readFile(resolve(ROOT, path));
const runnerPath = fileURLToPath(import.meta.url);

assert.equal(git('rev-parse', 'HEAD'), START, 'run from registered research parent');
assert.equal(git('branch', '--show-current'), BRANCH);
assert.equal(git('rev-parse', 'origin/main'), MAIN);
const existing = await readdir(OUTPUT);
assert.ok(existing.includes('PLAN.md') && existing.includes('SOURCE-AUDIT.md'), 'registered audit required');
const mediaPaths = VIEWS.flatMap(({ id }) => [`video/view-${id}.webm`,
  ...MILESTONES.map(name => `stills/view-${id}-${name}.png`)]);
const priorCheckpointDataUrls = Object.fromEntries(await Promise.all(MILESTONES.map(async name => [name,
  `data:image/png;base64,${(await readFile(resolve(PRIOR, `stills/view-4-${name}.png`))).toString('base64')}`])));
const retainedFirstAttemptStills = new Map();
const retryComparableStills = new Set(VIEWS.map(({ id }) => `stills/view-${id}-pre-first-plate.png`));
for (const path of ['capture.json', 'manipulation.json', 'frame-map-H1.csv', 'MEDIA-SHA256.txt',
  'MEDIA-VALIDATION.json', ...mediaPaths]) {
  try {
    const bytes = await readFile(resolve(OUTPUT, path));
    if (!retryComparableStills.has(path)) throw new Error(`Refusing to overwrite ${path}`);
    retainedFirstAttemptStills.set(path, bytes);
  }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

const ffmpeg = execFileSync('where.exe', ['ffmpeg'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
const ffprobe = resolve(dirname(ffmpeg), 'ffprobe.exe');
const encoder = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
assert.equal(encoder.status, 0, encoder.stderr); assert.match(encoder.stdout, /libvpx-vp9/);
const videoDir = resolve(OUTPUT, 'video'), stillDir = resolve(OUTPUT, 'stills');
await mkdir(videoDir, { recursive: true }); await mkdir(stillDir, { recursive: true });
const writers = Object.fromEntries(VIEWS.map(({ id }) => [id, createVideoWriter(ffmpeg, resolve(videoDir, `view-${id}.webm`))]));
const sourceHashesAtBaseline = Object.fromEntries(SOURCE_PATHS.map(path => {
  if (spawnSync('git', ['cat-file', '-e', `${START}:${path}`], { cwd: ROOT, stdio: 'ignore' }).status !== 0) return [path, null];
  return [path, sha256(execFileSync('git', ['show', `${START}:${path}`], { cwd: ROOT }))];
}));
const sourceHashesAtStart = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path => [path, sha256(await sourceBytes(path))])));
const runnerSha256AtStart = sha256(await readFile(runnerPath));
const frames = [], measurements = [];
const server = await createServer({ logLevel: 'error', appType: 'custom', server: { host: '127.0.0.1', port: 0, strictPort: true } });
let browser;
const watchdog = setTimeout(() => {
  for (const writer of Object.values(writers)) writer.abort();
  void browser?.close(); void server.close(); process.exitCode = 124;
}, 15 * 60 * 1000);

try {
  await server.listen();
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 720 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(0);
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  await page.route('**/__ant_material_conditioned_readout', route => route.fulfill({ status: 200, contentType: 'text/html',
    body: '<!doctype html><html><body><script>/* p5 sketch context */</script></body></html>' }));
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}/__ant_material_conditioned_readout`, { waitUntil: 'domcontentloaded' });
  await page.exposeFunction('__assertSetupValid', () => assert.deepEqual(pageErrors, [], 'p5 setup must be error-free before world initialization'));
  await page.exposeFunction('__submitPacket', async packet => {
    if (packet.frameIndex !== null) {
      for (const { id } of VIEWS) await writers[id].write(dataUrlBuffer(packet.pngs[id]));
      frames.push({ frameIndex: packet.frameIndex, tick: packet.tick, simulationTimeMs: packet.simulationTimeMs,
        rngState: packet.rng.state, rngCalls: packet.rng.calls, stateSha256: packet.before,
        fullStateSha256: packet.fullBefore, fullStateUnchanged: packet.fullBefore === packet.fullAfter,
        eventCountsUnchanged: packet.eventCountsUnchanged });
    }
    if (packet.milestone) {
      for (const { id } of VIEWS) {
        const path = `stills/view-${id}-${packet.milestone}.png`, bytes = dataUrlBuffer(packet.pngs[id]);
        if (retainedFirstAttemptStills.has(path)) assert.ok(bytes.equals(retainedFirstAttemptStills.get(path)), `${path} retry byte parity`);
        else await writeFile(resolve(OUTPUT, path), bytes);
      }
      measurements.push(packet.measurement);
      console.log(JSON.stringify({ phase: 'milestone', name: packet.milestone, tick: packet.tick }));
    }
  });

  const captured = await page.evaluate(async ({ VIEWS, FRAME_TICKS, VIDEO_START_TICK, MAX_TICK, DT, WIDTH, HEIGHT, MILESTONES, PRIOR_CHECKPOINTS }) => {
    const [{ AntController }, { AntRenderer, pheromoneValueToAlpha }, { buildLocalMaterialContourMask,
      buildScreenedPheromoneAlpha, MATERIAL_CONTOUR_ALPHA, MATERIAL_CONTOUR_TONE,
      MATERIAL_LOCAL_CONTOUR_RADIUS_PX }] = await Promise.all([
      import('/src/lib/agents/ant/AntController.js'), import('/src/lib/renderers/AntRenderer.js'),
      import('/src/lib/renderers/materialConditionedPheromone.js')]);
    const enc = new TextEncoder(), size = WIDTH * HEIGHT;
    function ensure(condition, message) { if (!condition) throw new Error(message); }
    function makeRandom() { let state = 20261005 >>> 0, calls = 0;
      const random = () => { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
      random.state = () => state; random.calls = () => calls; return random; }
    function typedBytes(view) { return ArrayBuffer.isView(view) ? new Uint8Array(view.buffer, view.byteOffset, view.byteLength) : new Uint8Array(); }
    async function digest(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(value => value.toString(16).padStart(2, '0')).join(''); }
    async function stateFingerprint(snapshot, rng) {
      const material = snapshot.stratigraphy, topology = material.stratigraphy;
      const plates = [...(material.plates || []), ...(snapshot.surfacePlates.plates || [])];
      const metadata = enc.encode(JSON.stringify({ state: snapshot.state, status: snapshot.status, agents: snapshot.agents,
        audio: snapshot.audio, analysis: snapshot.analysis, rng, material: { revision: material.revision,
          layerOrder: topology.layerOrder, plates: (material.plates || []).map(plate => ({ id: plate.id,
            bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs, grid: plate.grid, material: plate.material,
            centerline: plate.centerline, edges: plate.edges })) }, surfacePlates: (snapshot.surfacePlates.plates || []).map(plate =>
          ({ id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs, grid: plate.grid })) }));
      const arrays = [snapshot.pheromone.values, snapshot.surface.values, topology.topLayerByCell,
        topology.layerCountByCell, topology.totalDepthByCellMeters, ...plates.map(plate => plate.mask).filter(ArrayBuffer.isView)];
      const parts = [metadata, ...arrays.map(typedBytes)], bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
      let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      return digest(bytes);
    }
    async function fullFingerprint(snapshot) {
      const chunks = [], json = JSON.stringify(snapshot, (_key, value) => {
        if (!ArrayBuffer.isView(value)) return value;
        const chunk = chunks.push(typedBytes(value)) - 1; return { typedArray: value.constructor.name, byteLength: value.byteLength, chunk };
      });
      const metadata = enc.encode(json), bytes = new Uint8Array(metadata.byteLength + chunks.reduce((n, chunk) => n + chunk.byteLength, 0));
      bytes.set(metadata); let offset = metadata.byteLength;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return digest(bytes);
    }
    function equalBytes(a, b) {
      if (!a || !b || a.length !== b.length) return false;
      for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
      return true;
    }
    function canvasBytes(canvas) { return new Uint8ClampedArray(canvas.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT).data); }
    async function imageDataUrlBytes(dataUrl) {
      const image = new Image(); image.src = dataUrl; await image.decode();
      const source = document.createElement('canvas'); source.width = WIDTH; source.height = HEIGHT;
      const context = source.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
      return new Uint8ClampedArray(context.getImageData(0, 0, WIDTH, HEIGHT).data);
    }
    function canonicalSupport(snapshot) {
      const top = snapshot.stratigraphy.stratigraphy.topLayerByCell, gridWidth = snapshot.stratigraphy.width,
        gridHeight = snapshot.stratigraphy.height, support = new Uint8Array(size);
      for (let y = 0; y < HEIGHT; y += 1) for (let x = 0; x < WIDTH; x += 1) {
        const gx = Math.floor((x + 0.5) * gridWidth / WIDTH), gy = Math.floor((y + 0.5) * gridHeight / HEIGHT);
        support[y * WIDTH + x] = top[gy * gridWidth + gx] >= 0 ? 1 : 0;
      }
      return support;
    }
    function distribution(values) {
      if (!values.length) return { count: 0, mean: null, standardDeviation: null, min: null, p10: null, p50: null, p90: null, max: null };
      let sum = 0, square = 0, min = Infinity, max = -Infinity;
      for (const value of values) { sum += value; square += value * value; min = Math.min(min, value); max = Math.max(max, value); }
      const sorted = [...values].sort((a, b) => a - b), quantile = q => sorted[Math.floor((sorted.length - 1) * q)];
      return { count: values.length, mean: sum / values.length,
        standardDeviation: Math.sqrt(Math.max(0, square / values.length - (sum / values.length) ** 2)),
        min, p10: quantile(0.1), p50: quantile(0.5), p90: quantile(0.9), max };
    }
    function collectReadoutValues(audit, support, predicate) {
      const base = [], alternate = [], mixed = [], alternateDelta = [], mixedDelta = [];
      for (let index = 0; index < size; index += 1) {
        if (!predicate(index, audit, support)) continue;
        const b = audit.baselineAlpha[index], a = audit.alternateAlpha[index], m = audit.mixedAlpha[index];
        base.push(b); alternate.push(a); mixed.push(m); alternateDelta.push(a - b); mixedDelta.push(m - b);
      }
      return { count: base.length, baselineDarkness: distribution(base), alternateDarkness: distribution(alternate),
        mixedDarkness: distribution(mixed), alternateMinusBaseline: distribution(alternateDelta),
        mixedMinusBaseline: distribution(mixedDelta) };
    }
    function compareComposite(base, candidate, support, readout, antMask) {
      let changedPixels = 0, outsideChangedPixels = 0, zeroSignalChangedPixels = 0, antRasterChangedPixels = 0;
      let fullDarknessDeltaSum = 0, sampledPixels = 0;
      const activeFullDelta = [], overlapFullDelta = [];
      for (let index = 0; index < size; index += 1) {
        const offset = index * 4;
        let changed = false, darknessBase = 0, darknessCandidate = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          changed ||= base[offset + channel] !== candidate[offset + channel];
          darknessBase += 255 - base[offset + channel]; darknessCandidate += 255 - candidate[offset + channel];
        }
        if (changed) {
          if (antMask[index]) { antRasterChangedPixels += 1; continue; }
          changedPixels += 1;
          if (!support[index]) outsideChangedPixels += 1;
          if (support[index] && readout.baselineAlpha[index] === 0) zeroSignalChangedPixels += 1;
        }
        if (antMask[index]) continue;
        sampledPixels += 1;
        const delta = (darknessCandidate - darknessBase) / 3;
        fullDarknessDeltaSum += delta;
        if (readout.effectiveWeights[index] > 0 && readout.baselineAlpha[index] > 0) activeFullDelta.push(delta);
        if (support[index] && readout.baselineAlpha[index] > 0) overlapFullDelta.push(delta);
      }
      return { changedPixels, outsideChangedPixels, zeroSignalChangedPixels, antRasterChangedPixels,
        sampledNonAntPixels: sampledPixels, fullCanvasMeanDarknessDelta: fullDarknessDeltaSum / Math.max(1, sampledPixels),
        affectedActivePixelMeanDarknessDelta: distribution(activeFullDelta),
        materialPheromoneOverlapMeanDarknessDelta: distribution(overlapFullDelta) };
    }
    function verifyCompositeLocality(base, candidate, support, readout, antMask, viewName, atTick, strict = true) {
      let outsideChangedPixels = 0, outsideAntMaskChangedPixels = 0, zeroSignalChangedPixels = 0, antRasterChangedPixels = 0;
      const examples = [];
      for (let pixel = 0; pixel < size; pixel += 1) {
        const offset = pixel * 4, changed = base[offset] !== candidate[offset]
          || base[offset + 1] !== candidate[offset + 1] || base[offset + 2] !== candidate[offset + 2];
        if (!changed) continue;
        if (antMask[pixel]) { antRasterChangedPixels += 1; continue; }
        outsideAntMaskChangedPixels += 1;
        if (!support[pixel]) {
          outsideChangedPixels += 1;
          if (examples.length < 8) examples.push({ pixel, x: pixel % WIDTH, y: Math.floor(pixel / WIDTH),
            baseline: [...base.subarray(offset, offset + 4)], candidate: [...candidate.subarray(offset, offset + 4)] });
        }
        if (support[pixel] && readout.baselineAlpha[pixel] === 0) zeroSignalChangedPixels += 1;
      }
      if (strict) ensure(outsideChangedPixels === 0 && zeroSignalChangedPixels === 0,
        `${viewName} changed ${outsideChangedPixels} non-ant composite pixels outside material and ${zeroSignalChangedPixels} zero-signal pixels at tick ${atTick}: ${JSON.stringify({ examples, supportPixels: support.reduce((sum, value) => sum + value, 0), positiveWeights: readout.effectiveWeights.reduce((sum, value) => sum + Number(value > 0), 0) })}`);
      return { outsideChangedPixels, outsideAntMaskChangedPixels, zeroSignalChangedPixels, antRasterChangedPixels };
    }
    function validateConditioned(audit, expectedSupport, viewName) {
      ensure(audit && audit.baselineAlpha.length === size, viewName + ' readout audit present');
      let outsideWeight = 0, zeroSignalChange = 0, badMix = 0;
      for (let index = 0; index < size; index += 1) {
        const weight = audit.effectiveWeights[index], baseline = audit.baselineAlpha[index];
        if (!expectedSupport[index]) outsideWeight += Number(weight !== 0);
        if (baseline === 0) zeroSignalChange += Number(audit.mixedAlpha[index] !== baseline);
        const expected = new Uint8ClampedArray([baseline + (audit.alternateAlpha[index] - baseline) * weight])[0];
        if (expected !== audit.mixedAlpha[index]) badMix += 1;
      }
      ensure(outsideWeight === 0, viewName + ' no conditioned weight outside material support');
      ensure(zeroSignalChange === 0, viewName + ' zero production-alpha pixels remain identical');
      ensure(badMix === 0, viewName + ' alpha is blended once using registered weight');
      return { outsideWeightPixels: outsideWeight, zeroSignalChangedPixels: zeroSignalChange, badMixPixels: badMix };
    }
    function copyAudit(audit) {
      return { ...audit, baselineAlpha: new Uint8ClampedArray(audit.baselineAlpha),
        alternateAlpha: new Uint8ClampedArray(audit.alternateAlpha), mixedAlpha: new Uint8ClampedArray(audit.mixedAlpha),
        effectiveWeights: new Float32Array(audit.effectiveWeights), materialSupport: new Uint8Array(audit.materialSupport),
        maskStats: { ...audit.maskStats } };
    }
    function copyContourAudit(audit) {
      return { ...audit, contourMask: new Uint8Array(audit.contourMask) };
    }
    function milestoneMeasurements(snapshot, composites, support, audits, contours, renderer, antMask) {
      const reports = {};
      for (const index of [1, 2]) {
        const audit = audits[index], contour = contours[index];
        const comparison = compareComposite(composites[0], composites[index], support, audit, antMask);
        reports[VIEWS[index].id] = { mode: VIEWS[index].label, blendMask: audit.maskStats,
          contour: { mode: contour.mode, pixels: contour.contourPixels, boundaryPixels: contour.boundaryPixels,
            activeConditionedPixels: contour.activeConditionedPixels, boundaryCoverage: contour.boundaryCoverage,
            changedPixels: contour.changedPixels, meanAddedDarkness: contour.meanAddedDarkness,
            tone: contour.tone ?? null, alpha: contour.alpha ?? null },
          conditionedSignal: collectReadoutValues(audit, support, (pixel, value) => value.effectiveWeights[pixel] > 0 && value.baselineAlpha[pixel] > 0),
          materialPheromoneOverlap: collectReadoutValues(audit, support, (pixel, value, mask) => mask[pixel] > 0 && value.baselineAlpha[pixel] > 0),
          compositeComparisonToView1: comparison, invariantAudit: validateConditioned(audit, support, VIEWS[index].label) };
      }
      return { materialSupportPixels: support.reduce((sum, value) => sum + value, 0),
        sourcePheromone: { width: snapshot.pheromone.width, height: snapshot.pheromone.height,
          nonzeroCells: snapshot.pheromone.values.reduce((sum, value) => sum + Number(value > 0), 0),
          mappedAlphaBytes: renderer.fieldImage.pixels.length }, views: reports };
    }

    const canvas = document.createElement('canvas'); canvas.width = canvas.height = WIDTH; document.body.append(canvas);
    const renderer = new AntRenderer(canvas, { materialPresentation: VIEWS[0].material,
      pheromoneReadout: VIEWS[0].readout, materialContour: VIEWS[0].contour });
    const canvases = VIEWS.map(() => canvas), renderers = VIEWS.map(() => renderer);
    function configureView(index) {
      const view = VIEWS[index];
      renderer.materialPresentation = view.material;
      renderer.pheromoneReadout = view.readout;
      renderer.materialContour = view.contour;
      renderer.debugOptions.material = view.showMaterial;
      renderer.debugOptions.materialRasterPlaceholder = !view.showMaterial;
      renderer.debugOptions.pheromone = true;
    }
    const random = makeRandom(), controller = new AntController({ random, acceptedHeadingMode: 'isotropic-diagnostic' });
    if (controller.audioBridge !== null || !controller.materialLocomotionResistance) throw new Error('Unexpected H1 controller default or audio bridge');
    if (!await renderer.init({ width: WIDTH, height: HEIGHT, pixelRatio: 1 })) throw new Error('renderer init failed');
    await window.__assertSetupValid();
    const events = { footContact: 0, plateBirth: 0, noduleBirth: 0, error: 0 }; let firstPlate = null;
    const unsubscribe = controller.subscribe(({ type, payload }) => {
      if (type === 'foot-contact') events.footContact++;
      else if (type === 'plate-birth') { events.plateBirth++; firstPlate ||= payload; }
      else if (type === 'sphere-birth') events.noduleBirth++;
      else if (type === 'error') events.error++;
    });
    let tick = 0, frameIndex = 0, prePlate = null, preRng = null, birthTick = null, endpointTick = null;
    const milestones = [], checkpointRasterParity = [], noMaterialRasterParity = [], rerenderChecks = [], contourFrames = [], frameIntegrity = { outsideSupportChangedPixels: 0,
      localZeroActivityContourPixels: 0, contourMaskOutsideSupportPixels: 0, antRasterChangedPixels: 0,
      compositeOutsideAntMaskChangedPixels: 0, localityFramesValidated: 0, mismatchedSourceFieldFrames: 0,
      mixedEquationFailures: 0, readoutParityFailures: 0, localBoundaryCoverageMax: 0 };
    let previousGrid = null, previousMaskKey = null;
    let initialStateSha256;

    async function render(snapshot, atTick, milestone, { video = false, rngAtSnapshot = null } = {}) {
      const rng = rngAtSnapshot || { state: random.state(), calls: random.calls() };
      const liveRng = { state: random.state(), calls: random.calls() }, eventBytes = JSON.stringify(events);
      const before = await stateFingerprint(snapshot, rng), fullBefore = await fullFingerprint(snapshot);
      const support = canonicalSupport(snapshot), pngs = {}, composites = [], audits = [], contours = [];
      let referenceReadout = null;
      let referenceField = null, referenceFieldPixels = null;
      for (let index = 0; index < renderers.length; index += 1) {
        configureView(index);
        const renderer = renderers[index];
        await renderer.render(snapshot);
        ensure(await stateFingerprint(snapshot, rng) === before, 'snapshot state changed in View ' + (index + 1));
        ensure(await fullFingerprint(snapshot) === fullBefore, 'full snapshot changed in View ' + (index + 1));
        ensure(JSON.stringify(events) === eventBytes && random.state() === liveRng.state && random.calls() === liveRng.calls,
          'renderer changed RNG/events in View ' + (index + 1));
        ensure(renderer.debugOptions.material === false, 'all views suppress direct material rendering');
        ensure(renderer.debugOptions.materialRasterPlaceholder, 'all views use the hidden-material placeholder path');
        ensure(renderer.materialRasterPlaceholderImage?.pixels?.every((value, offset) => offset % 4 !== 3 || value === 0),
          'material placeholder alpha remains zero');
        if (!referenceField) { referenceField = renderer.fieldImage; referenceFieldPixels = new Uint8ClampedArray(renderer.fieldImage.pixels); }
        else ensure(equalBytes(renderer.fieldImage.pixels, referenceFieldPixels), 'all views share mapped pheromone source image');
        const audit = renderer.pheromoneReadoutAudit, contour = renderer.materialContourAudit;
        ensure(equalBytes(audit.materialSupport, support), 'conditioned readout mask uses canonical material support');
        const check = validateConditioned(audit, support, `View ${index + 1}`);
        frameIntegrity.mixedEquationFailures += check.badMixPixels;
        ensure(equalBytes(buildScreenedPheromoneAlpha(audit.baselineAlpha, WIDTH, HEIGHT), audit.alternateAlpha),
          `View ${index + 1} fixed Bayer screen is deterministic`);
        if (!referenceReadout) referenceReadout = copyAudit(audit);
        else {
          const sameReadout = equalBytes(referenceReadout.baselineAlpha, audit.baselineAlpha)
            && equalBytes(referenceReadout.alternateAlpha, audit.alternateAlpha)
            && equalBytes(referenceReadout.mixedAlpha, audit.mixedAlpha)
            && equalBytes(referenceReadout.effectiveWeights, audit.effectiveWeights);
          frameIntegrity.readoutParityFailures += Number(!sameReadout);
          const mismatch = sameReadout ? null : Object.fromEntries(['baselineAlpha','alternateAlpha','mixedAlpha','effectiveWeights']
            .map(key => { const a = referenceReadout[key], b = audit[key];
              const at = Array.from(a).findIndex((value, pixel) => value !== b[pixel]);
              return [key, at < 0 ? null : { pixel: at, view1: a[at], candidate: b[at] }]; }));
          ensure(sameReadout, `View ${index + 1} changes only contour over View 1 readout at tick ${atTick}: ${JSON.stringify(mismatch)}`);
        }
        ensure(contour?.mode === VIEWS[index].contour, `View ${index + 1} contour mode configured`);
        if (VIEWS[index].contour !== 'none') ensure(contour.tone === MATERIAL_CONTOUR_TONE
          && contour.alpha === MATERIAL_CONTOUR_ALPHA,
        `View ${index + 1} registered contour tone and alpha: ${JSON.stringify({ mode: contour.mode,
          tone: contour.tone, alpha: contour.alpha, contourPixels: contour.contourPixels })}`);
        let activeConditionedPixels = contour.activeConditionedPixels;
        if (VIEWS[index].contour === 'none') ensure(contour.contourPixels === 0, 'View 1 has no contour cue');
        if (VIEWS[index].contour === 'full') ensure(equalBytes(contour.contourMask, renderer.materialReadoutMask.boundary),
          'View 2 uses exactly the one-pixel inner boundary');
        if (VIEWS[index].contour === 'local') {
          if (milestone) {
            const expectedContour = buildLocalMaterialContourMask(renderer.materialReadoutMask.boundary,
              audit.baselineAlpha, audit.effectiveWeights, WIDTH, HEIGHT, MATERIAL_LOCAL_CONTOUR_RADIUS_PX);
            ensure(equalBytes(contour.contourMask, expectedContour), 'View 3 gate matches the registered Euclidean radius at each milestone');
          }
          if (!activeConditionedPixels) frameIntegrity.localZeroActivityContourPixels += contour.contourPixels;
          ensure(activeConditionedPixels || contour.contourPixels === 0, 'local contour is absent without conditioned activity');
          frameIntegrity.localBoundaryCoverageMax = Math.max(frameIntegrity.localBoundaryCoverageMax, contour.boundaryCoverage);
        }
        if (milestone) {
          let outsideContour = 0;
          for (let pixel = 0; pixel < size; pixel += 1) outsideContour += Number(contour.contourMask[pixel]
            && (!support[pixel] || !renderer.materialReadoutMask.boundary[pixel]));
          frameIntegrity.contourMaskOutsideSupportPixels += outsideContour;
          ensure(outsideContour === 0, `View ${index + 1} contour stays on the one-pixel inner boundary`);
        }
        audits[index] = video || milestone ? copyAudit(audit) : null;
        contours[index] = video || milestone ? copyContourAudit(contour) : null;
        if (milestone || video) pngs[VIEWS[index].id] = canvases[index].toDataURL('image/png');
        if (milestone || video) composites[index] = canvasBytes(canvases[index]);
      }
      for (let index = 0; index < snapshot.pheromone.values.length; index += 1) {
        const offset = index * 4, expected = pheromoneValueToAlpha(snapshot.pheromone.values[index]);
        ensure(referenceField.pixels[offset] === 0 && referenceField.pixels[offset + 1] === 0
          && referenceField.pixels[offset + 2] === 0 && referenceField.pixels[offset + 3] === expected,
        'existing black pheromone mapping preserved');
      }
      ensure(VIEWS.every(view => !view.showMaterial), 'all views suppress direct material rendering');
      let antMask = null;
      if (video || milestone) {
        renderer.debugOptions.material = false; renderer.debugOptions.materialRasterPlaceholder = false;
        renderer.debugOptions.pheromone = false;
        await renderer.render(snapshot);
        const antOnly = canvasBytes(canvas); antMask = new Uint8Array(size);
        for (let pixel = 0; pixel < size; pixel += 1) {
          const offset = pixel * 4;
          antMask[pixel] = Number(antOnly[offset] < 255 || antOnly[offset + 1] < 255 || antOnly[offset + 2] < 255);
        }
        configureView(0); await renderer.render(snapshot);
        ensure(await stateFingerprint(snapshot, rng) === before && JSON.stringify(events) === eventBytes
          && random.state() === liveRng.state && random.calls() === liveRng.calls, 'ant-only raster audit preserves state/RNG/events');
      }
      if (milestone) {
        if (support.every(value => value === 0)) {
          let changedPixels = 0, changedInsideAntRaster = 0, changedOutsideAntRaster = 0;
          for (let pixel = 0; pixel < size; pixel += 1) {
            const offset = pixel * 4, changed = composites[0][offset] !== composites[1][offset]
              || composites[0][offset + 1] !== composites[1][offset + 1] || composites[0][offset + 2] !== composites[1][offset + 2];
            if (!changed) continue;
            changedPixels += 1;
            if (antMask[pixel]) changedInsideAntRaster += 1; else changedOutsideAntRaster += 1;
          }
          ensure(changedPixels === 0, `Empty-support View 1 and View 2 differ: ${changedPixels}`);
          noMaterialRasterParity.push({ milestone, fullRgbPixelExact: changedPixels === 0, changedRgbPixels: changedPixels,
            changedPixelsInsideAntRaster: changedInsideAntRaster, changedPixelsOutsideAntRaster: changedOutsideAntRaster });
        }
        const priorPixels = await imageDataUrlBytes(PRIOR_CHECKPOINTS[milestone]), currentPixels = composites[0];
        let changedPixels = 0, changedInsideAntMask = 0, changedOutsideAntMask = 0, changedChannels = 0, maxChannelDelta = 0;
        for (let pixel = 0; pixel < size; pixel += 1) {
          const offset = pixel * 4; let changed = false;
          for (let channel = 0; channel < 3; channel += 1) {
            const delta = Math.abs(currentPixels[offset + channel] - priorPixels[offset + channel]);
            if (delta) { changed = true; changedChannels += 1; maxChannelDelta = Math.max(maxChannelDelta, delta); }
          }
          if (!changed) continue;
          changedPixels += 1;
          if (antMask[pixel]) changedInsideAntMask += 1; else changedOutsideAntMask += 1;
        }
        checkpointRasterParity.push({ milestone, fullRgbPixelExact: changedPixels === 0, changedRgbPixels: changedPixels,
          changedRgbChannelBytes: changedChannels, changedPixelsInsideAntRaster: changedInsideAntMask,
          changedPixelsOutsideAntRaster: changedOutsideAntMask, antRasterPixels: antMask.reduce((sum, value) => sum + value, 0), maxChannelDelta });
        configureView(0); await renderer.render(snapshot);
      }
      if (video) for (const index of [1, 2]) {
        const rasterDelta = verifyCompositeLocality(composites[0], composites[index], support,
          audits[index], antMask, VIEWS[index].label, atTick, false);
        ensure(rasterDelta.outsideChangedPixels === 0, VIEWS[index].label + ' composite has zero change outside material support');
        const noAntSnapshot = { ...snapshot, agents: [] }, layerBytes = [];
        for (const viewIndex of [0, index]) {
          configureView(viewIndex); await renderer.render(noAntSnapshot);
          ensure(await stateFingerprint(snapshot, rng) === before && JSON.stringify(events) === eventBytes
            && random.state() === liveRng.state && random.calls() === liveRng.calls, 'no-ant field audit preserves simulation state');
          layerBytes[viewIndex] = canvasBytes(canvas);
        }
        const locality = verifyCompositeLocality(layerBytes[0], layerBytes[index], support,
          audits[index], new Uint8Array(size), VIEWS[index].label + ' pheromone layer', atTick, false);
        ensure(locality.outsideChangedPixels === 0, VIEWS[index].label + ' pheromone layer has zero change outside material support');
        const activeConditionedPixels = contours[index].activeConditionedPixels;
        if (VIEWS[index].contour === 'local' && activeConditionedPixels === 0) {
          ensure(contours[index].contourPixels === 0 && locality.zeroSignalChangedPixels === 0,
            'local contour and pixels remain unchanged when conditioned activity is absent');
        }
        frameIntegrity.outsideSupportChangedPixels += locality.outsideChangedPixels;
        frameIntegrity.antRasterChangedPixels += locality.antRasterChangedPixels;
        frameIntegrity.compositeOutsideAntMaskChangedPixels += rasterDelta.outsideAntMaskChangedPixels;
        frameIntegrity.localityFramesValidated += 1;
        contourFrames.push({ frameIndex, tick: atTick, view: VIEWS[index].id,
          contourPixels: contours[index].contourPixels, boundaryPixels: contours[index].boundaryPixels,
          activeConditionedPixels, boundaryCoverage: contours[index].boundaryCoverage,
          changedPixels: contours[index].changedPixels, meanAddedDarkness: contours[index].meanAddedDarkness,
          tone: contours[index].tone ?? null, alpha: contours[index].alpha ?? null,
          zeroSignalChangedPixels: locality.zeroSignalChangedPixels });
      }

      const currentGrid = Uint8Array.from(snapshot.stratigraphy.stratigraphy.topLayerByCell, value => Number(value >= 0));
      const gridUnchanged = previousGrid && equalBytes(previousGrid, currentGrid);
      if (gridUnchanged && previousMaskKey) ensure(renderers[0].materialReadoutMaskKey === previousMaskKey,
        'mask cache stable when exposed topology is unchanged');
      previousMaskKey = renderers[0].materialReadoutMaskKey; previousGrid = currentGrid;
      if (milestone) {
        const locality = milestoneMeasurements(snapshot, composites, support, audits, contours, renderer, antMask);
        const stablePngs = { ...pngs };
        for (let index = 0; index < renderers.length; index += 1) {
          configureView(index);
          await renderers[index].render(snapshot);
          const repeatedPixels = canvasBytes(canvases[index]), originalPixels = composites[index];
          let changedPixels = 0, minX = WIDTH, minY = HEIGHT, maxX = -1, maxY = -1;
          for (let pixel = 0; pixel < size; pixel += 1) {
            const offset = pixel * 4;
            if (originalPixels[offset] === repeatedPixels[offset] && originalPixels[offset + 1] === repeatedPixels[offset + 1]
              && originalPixels[offset + 2] === repeatedPixels[offset + 2] && originalPixels[offset + 3] === repeatedPixels[offset + 3]) continue;
            changedPixels += 1; const x = pixel % WIDTH, y = Math.floor(pixel / WIDTH);
            minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          }
          ensure(changedPixels === 0, `repeat-render pixel delta at ${milestone} View ${index + 1}: ${JSON.stringify({ changedPixels, minX, minY, maxX, maxY })}`);
          ensure(canvases[index].toDataURL('image/png') === stablePngs[VIEWS[index].id],
            'deterministic repeat PNG bytes at ' + milestone + ' View ' + (index + 1));
        }
        ensure(await stateFingerprint(snapshot, rng) === before && JSON.stringify(events) === eventBytes,
          'repeat render preserves state and events');
        rerenderChecks.push({ milestone, allThreePngBytesStable: true, readoutMaskStable: true,
          contourGateRecomputedFromCurrentSnapshot: true });
        const measurement = { milestone, tick: atTick, views: locality.views,
          mask: { supportPixels: locality.materialSupportPixels, ...audits[0].maskStats },
          sourcePheromone: locality.sourcePheromone,
          outsideSupportChangedPixels: Object.fromEntries([2, 3].map(id => [id, locality.views[id].compositeComparisonToView1.outsideChangedPixels])),
          zeroSignalChangedPixels: Object.fromEntries([2, 3].map(id => [id, locality.views[id].compositeComparisonToView1.zeroSignalChangedPixels])) };
        await window.__submitPacket({ frameIndex: video ? frameIndex : null, tick: atTick,
          simulationTimeMs: snapshot.analysis.simulationTimeMs, rng, before, after: before,
          fullBefore, fullAfter: fullBefore, eventCountsUnchanged: true, pngs, milestone, measurement });
        milestones.push({ name: milestone, tick: atTick, simulationTimeMs: snapshot.analysis.simulationTimeMs,
          stateSha256: before, fullStateSha256: fullBefore, rng, eventCounts: { ...events },
          plateCount: snapshot.stratigraphy.plates.length,
          occupiedMaterialCells: snapshot.stratigraphy.stratigraphy.topLayerByCell.reduce((sum, value) => sum + Number(value >= 0), 0),
          pheromone: { width: snapshot.pheromone.width, height: snapshot.pheromone.height,
            nonzeroCells: snapshot.pheromone.values.reduce((sum, value) => sum + Number(value > 0), 0),
            max: snapshot.pheromone.values.reduce((maximum, value) => Math.max(maximum, value), -Infinity),
            sum: snapshot.pheromone.values.reduce((sum, value) => sum + value, 0) } });
      } else if (video) {
        await window.__submitPacket({ frameIndex, tick: atTick, simulationTimeMs: snapshot.analysis.simulationTimeMs,
          rng, before, after: before, fullBefore, fullAfter: fullBefore, eventCountsUnchanged: true,
          pngs, milestone: null, measurement: null });
      }
      if (video) frameIndex += 1;
      return before;
    }
    try {
      await controller.init();
      initialStateSha256 = await render(controller.getSnapshot(), 0, null);
      while (tick < MAX_TICK) {
        if (!firstPlate && controller.trailPlateBirth.candidate?.stableSeconds >= 19) {
          prePlate = controller.getSnapshot(); preRng = { state: random.state(), calls: random.calls() };
        }
        controller.tick(DT); tick++;
        const video = tick >= VIDEO_START_TICK && (tick - VIDEO_START_TICK) % FRAME_TICKS === 0;
        if (firstPlate && birthTick === null) {
          birthTick = tick; const after = controller.getSnapshot();
          if (!prePlate || prePlate.stratigraphy.plates.length || after.stratigraphy.plates.length !== 1) throw new Error('first Plate pre/post state invalid');
          await render(prePlate, tick - 1, 'pre-first-plate', { rngAtSnapshot: preRng });
          await render(after, tick, 'post-first-plate', { video }); endpointTick = tick + 1800;
        } else if (birthTick !== null && tick === birthTick + 900) {
          await render(controller.getSnapshot(), tick, 'first-plate-plus-15s', { video });
        } else if (video && !(endpointTick !== null && tick === endpointTick)) {
          await render(controller.getSnapshot(), tick, null, { video: true });
        }
        if (endpointTick !== null && tick >= endpointTick) break;
      }
      if (tick !== MAX_TICK || !birthTick || tick - birthTick !== 1800) throw new Error(`registered endpoint mismatch tick=${tick}, birth=${birthTick}`);
      const endpoint = controller.getSnapshot();
      await render(endpoint, tick, 'first-plate-plus-30s', { video: true });
      return { initialStateSha256, milestones, checkpointRasterParity, noMaterialRasterParity, rerenderChecks, frameIntegrity, contourFrames,
        tickCount: tick, firstPlateTick: birthTick, firstPlateTimeMs: firstPlate.bornAtSimulationTimeMs,
        firstPlateVideoOffsetSeconds: 5, videoStartTick: VIDEO_START_TICK, endTimeMs: endpoint.analysis.simulationTimeMs,
        rngFinal: { state: random.state(), calls: random.calls() }, eventCounts: { ...events },
        materialLocomotionResistance: controller.materialLocomotionResistance, audioBridgeAttached: controller.audioBridge !== null,
        audioEnabled: endpoint.audio.enabled, finalSnapshotSha256: await stateFingerprint(endpoint,
          { state: random.state(), calls: random.calls() }), frameCount: frameIndex,
        finalPlateCount: endpoint.stratigraphy.plates.length,
        finalOccupiedMaterialCells: endpoint.stratigraphy.stratigraphy.topLayerByCell.reduce((sum, value) => sum + Number(value >= 0), 0),
        finalPheromone: { nonzeroCells: endpoint.pheromone.values.reduce((sum, value) => sum + Number(value > 0), 0),
          max: endpoint.pheromone.values.reduce((maximum, value) => Math.max(maximum, value), -Infinity),
          sum: endpoint.pheromone.values.reduce((sum, value) => sum + value, 0) } };
    } finally { unsubscribe(); await renderer.destroy(); await controller.destroy(); canvas.remove(); }
  }, { VIEWS, FRAME_TICKS, VIDEO_START_TICK, MAX_TICK, DT, WIDTH, HEIGHT, MILESTONES, PRIOR_CHECKPOINTS: priorCheckpointDataUrls });

  await page.close();
  for (const writer of Object.values(writers)) await writer.close();
  assert.deepEqual(pageErrors, []); assert.equal(captured.tickCount, MAX_TICK); assert.equal(captured.firstPlateTick, 4501);
  assert.equal(captured.firstPlateTimeMs, 75016.66666666561); assert.equal(captured.audioBridgeAttached, false);
  assert.equal(captured.audioEnabled, false); assert.equal(captured.frameCount, 351);
  const priorCapture = JSON.parse(await readFile(resolve(PRIOR, 'capture.json'), 'utf8'));
  const priorFrames = (await readFile(resolve(PRIOR, 'frame-map-H1.csv'), 'utf8')).trim().split(/\r?\n/).slice(1)
    .map(line => line.split(','));
  assert.deepEqual(frames.map(frame => frame.tick), Array.from({ length: 351 }, (_, index) => VIDEO_START_TICK + index * FRAME_TICKS));
  assert.ok(frames.every(frame => frame.fullStateUnchanged && frame.eventCountsUnchanged));
  assert.equal(priorFrames.length, frames.length, 'prior bounded frame map has the same number of samples');
  for (let index = 0; index < frames.length; index += 1) {
    const previous = priorFrames[index], current = frames[index];
    assert.equal(current.tick, Number(previous[2]), `H1 frame ${index} tick parity`);
    assert.equal(current.rngState, Number(previous[4]), `H1 frame ${index} RNG state parity`);
    assert.equal(current.rngCalls, Number(previous[5]), `H1 frame ${index} RNG call parity`);
    assert.equal(current.stateSha256, previous[6], `H1 frame ${index} snapshot parity`);
    assert.equal(current.fullStateSha256, previous[7], `H1 frame ${index} full snapshot parity`);
  }
  assert.deepEqual(captured.rngFinal, priorCapture.world.rngFinal, 'final H1 RNG matches parent');
  assert.deepEqual(captured.eventCounts, priorCapture.world.eventCounts, 'H1 events match parent');
  assert.equal(captured.finalSnapshotSha256, priorCapture.world.finalSnapshotSha256, 'H1 endpoint state matches parent');
  const names = MILESTONES;
  for (const name of names) {
    const previous = priorCapture.world.milestones.find(item => item.name === name);
    const current = captured.milestones.find(item => item.name === name);
    assert.equal(current.stateSha256, previous.stateSha256, `H1 ${name} state parity`);
    assert.deepEqual(current.rng, previous.rng, `H1 ${name} RNG parity`);
    const raster = captured.checkpointRasterParity.find(item => item.milestone === name);
    assert.ok(raster, `View 1 ${name} raster comparison recorded`);
  }
  const videos = Object.fromEntries(await Promise.all(VIEWS.map(async ({ id }) => [id,
    await probeVideo(ffprobe, resolve(videoDir, `view-${id}.webm`))])));
  const reference = videos[1];
  for (const [id, video] of Object.entries(videos)) {
    assert.equal(video.width, WIDTH); assert.equal(video.height, HEIGHT); assert.equal(video.nb_read_frames, String(captured.frameCount));
    assert.equal(video.duration, reference.duration); assert.equal(video.pix_fmt, 'gbrp'); assert.equal(video.audioStreams, 0);
    const videoRgb = execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-sseof', '-0.1', '-i', resolve(videoDir, `view-${id}.webm`),
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 4 * 1024 * 1024 });
    const stillRgb = execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', resolve(stillDir, `view-${id}-first-plate-plus-30s.png`),
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 4 * 1024 * 1024 });
    assert.ok(videoRgb.equals(stillRgb), `View ${id} lossless video endpoint matches native PNG`);
  }
  const sourceHashesAtEnd = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path => [path, sha256(await sourceBytes(path))])));
  assert.deepEqual(sourceHashesAtStart, sourceHashesAtEnd, 'source/viewer stable during capture');
  assert.equal(runnerSha256AtStart, sha256(await readFile(runnerPath)), 'capture runner stable during capture');
  const localFrames = captured.contourFrames.filter(item => item.view === 3 && item.tick >= 4501),
    nearFullLocalFrames = localFrames.filter(item => item.boundaryCoverage >= 0.75).length;
  const manipulation = { priorView1UsesPreviousView4Semantics: true,
    priorView4RasterCheckpointComparison: captured.checkpointRasterParity, noMaterialRasterParity: captured.noMaterialRasterParity,
    productionDefaultsUnchanged: true, H1ResearchOnly: true, sequentialRendererStateRngEventParity: true,
    sameMappedPheromoneImageAndReadoutAcrossViews: true, productionFieldMappingRecomputed: true,
    allViewsNoDirectMaterialPixels: true, transparentRasterPlaceholderAlphaZero: true,
    zeroProductionAlphaIdenticalForConditionedReadout: true, readoutParityFailures: captured.frameIntegrity.readoutParityFailures,
    noConditionedReadoutEffectOutsideSupport: captured.frameIntegrity.outsideSupportChangedPixels === 0,
    contourPixelsInsideOnePixelBoundaryOnly: captured.frameIntegrity.contourMaskOutsideSupportPixels === 0,
    fullCueAlwaysOn: true, localActivityRule: 'baselineAlpha > 0 && effectiveWeight > 0',
    localRadiusPx: MATERIAL_LOCAL_CONTOUR_RADIUS_PX, localTemporalSmoothingFrames: 0,
    localCueAbsentWithNoConditionedActivity: captured.frameIntegrity.localZeroActivityContourPixels === 0,
    localContourCoverage: { sampledFrames: localFrames.length, framesAtOrAbove75Percent: nearFullLocalFrames,
      fractionAtOrAbove75Percent: localFrames.length ? nearFullLocalFrames / localFrames.length : 0,
      maximumBoundaryCoverage: captured.frameIntegrity.localBoundaryCoverageMax,
      nearFullGateCriterion: 'more than 75% of boundary in more than half of sampled post-birth frames' },
    contourFrames: captured.contourFrames, milestoneMeasurements: measurements, perFrameIntegrity: captured.frameIntegrity };
  await writeFile(resolve(OUTPUT, 'frame-map-H1.csv'), ['frameIndex,videoTimeSeconds,tick,simulationTimeMs,rngState,rngCalls,stateSha256,fullStateSha256,fullStateUnchanged,eventCountsUnchanged',
    ...frames.map(frame => [frame.frameIndex, frame.frameIndex / 10, frame.tick, frame.simulationTimeMs, frame.rngState, frame.rngCalls,
      frame.stateSha256, frame.fullStateSha256, frame.fullStateUnchanged, frame.eventCountsUnchanged].join(','))].join('\n') + '\n');
  await writeFile(resolve(OUTPUT, 'manipulation.json'), JSON.stringify(manipulation, null, 2) + '\n');
  const capture = { schemaVersion: 1, branch: BRANCH, startCommit: START, currentMainCommit: MAIN, seed: 20261005,
    headingMode: 'isotropic-diagnostic', canvas: { width: WIDTH, height: HEIGHT, pixelRatio: 1, browserDpr: 1 },
    frameRate: 10, frameTicks: FRAME_TICKS, maxTick: MAX_TICK, videoStartTick: VIDEO_START_TICK,
    videoStartTimeSeconds: VIDEO_START_TICK / 60, firstPlateVideoOffsetSeconds: captured.firstPlateVideoOffsetSeconds,
    modelTimeMapping: 'frameIndex n maps to tick 4201 + 6n and modelTime 70.016666667 + n/10 seconds',
    world: captured, conditions: Object.fromEntries(VIEWS.map(({ id, label }) => [id, label])),
    measurements, videos, audio: { bridgeAttached: false, enabled: false, captured: false },
    sourceHashesAtBaseline, sourceHashesAtStart, sourceHashesAtEnd, sourceFilesUnchangedDuringCapture: true,
    registration: { materialMask: { boundary: '8-neighbor canonical support pixels; boundary weight 0', transitionWidthPx: 4,
        outsideWeight: 0, mapping: 'smoothstep(0,4,distance to nearest native boundary pixel)' },
      sharedReadout: 'prior View 4: production smooth baseline mixed with fixed 4x4 Bayer screen under the same 4 px material mask',
      contour: { support: '8-neighbor 1 px inner boundary from canonical 640x640 exposed material support',
        toneRgb: [MATERIAL_CONTOUR_TONE, MATERIAL_CONTOUR_TONE, MATERIAL_CONTOUR_TONE], alpha: MATERIAL_CONTOUR_ALPHA,
        compositeOrder: 'under black pheromone and before ants', maximumWhiteBackgroundDarkness:
          (255 - MATERIAL_CONTOUR_TONE) * MATERIAL_CONTOUR_ALPHA / 255 },
      localGate: { active: 'baselineAlpha > 0 && effectiveWeight > 0', radiusPx: MATERIAL_LOCAL_CONTOUR_RADIUS_PX,
        distance: 'Euclidean nearest active pixel', temporalSmoothingFrames: 0 } },
    metadataCollection: 'same-state H1 renderer-only diagnostic and bounded native acquisition',
    toolVersions: { node: process.version, chromium: browser.version(),
      ffmpeg: spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0] },
    runnerSha256: runnerSha256AtStart };
  await writeFile(resolve(OUTPUT, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');

  const reviewPage = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  reviewPage.setDefaultTimeout(0); const reviewErrors = [];
  reviewPage.on('pageerror', error => reviewErrors.push(String(error?.stack || error)));
  await reviewPage.goto(pathToFileURL(resolve(OUTPUT, 'review.html')).href, { waitUntil: 'domcontentloaded' });
  await reviewPage.evaluate(() => window.reviewReady);
  await reviewPage.waitForFunction(() => document.querySelector('#status')?.textContent.includes('준비됐습니다'));
  await reviewPage.waitForFunction(() => ['#leftStill','#rightStill'].every(selector => {
    const image = document.querySelector(selector); return !image.hidden && image.naturalWidth === 640 && image.naturalHeight === 640;
  }));
  const neutralReview = await reviewPage.evaluate(() => ({
    labels: [...document.querySelectorAll('#left option, #right option')].map(option => option.textContent),
    initialText: document.body.innerText, prompt: document.querySelector('label[for="memo"]').textContent,
    questionsHidden: document.querySelector('#questions').hidden, recordDisabled: document.querySelector('#record').disabled,
    downloadDisabled: document.querySelector('#download').disabled,
    nativeStills: ['#leftStill','#rightStill'].every(selector => { const image = document.querySelector(selector); return image.naturalWidth === 640 && image.naturalHeight === 640; }),
    videosLazyUntilPlay: ['#leftVideo','#rightVideo'].every(selector => document.querySelector(selector).preload === 'none') }));
  assert.deepEqual(neutralReview.labels, ['View 1','View 2','View 3','View 1','View 2','View 3']);
  assert.equal(neutralReview.questionsHidden, true); assert.equal(neutralReview.recordDisabled, true);
  assert.equal(neutralReview.downloadDisabled, true); assert.equal(neutralReview.nativeStills, true);
  assert.equal(neutralReview.videosLazyUntilPlay, true);
  assert.equal(neutralReview.prompt.trim(), '무엇이 달라 보였고, 어떤 것이 자연스럽거나 이상하게 느껴졌는지 자유롭게 적어 주세요.');
  assert.doesNotMatch(neutralReview.initialText.toLowerCase(), /material|crisp|screen|dither|substrate|retained|better|pheromone/);
  await reviewPage.locator('#memo').fill('first free description smoke check');
  await reviewPage.locator('#record').click(); await reviewPage.waitForFunction(() => !document.querySelector('#questions').hidden);
  assert.deepEqual(reviewErrors, []); await reviewPage.close();
  capture.reviewSurface = { neutralLabels: true, firstPromptOnlyBeforeResponse: true,
    native640Videos: true, followupQuestionsDeferred: true, initialNeutralScreen: neutralReview, pageErrors: reviewErrors };
  await writeFile(resolve(OUTPUT, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');
  const media = [...VIEWS.map(({ id }) => `video/view-${id}.webm`), ...VIEWS.flatMap(({ id }) => MILESTONES.map(name => `stills/view-${id}-${name}.png`))];
  await writeFile(resolve(OUTPUT, 'MEDIA-SHA256.txt'), (await Promise.all(media.map(async path =>
    `${sha256(await readFile(resolve(OUTPUT, path)))}  ${path}`))).join('\n') + '\n');
  await writeFile(resolve(OUTPUT, 'MEDIA-VALIDATION.json'), JSON.stringify({ native640Views: true, frameCount: captured.frameCount,
    videoProbe: videos, ffmpegDecodedEndpointRgbEqualsStill: true, neutralReviewSurface: capture.reviewSurface }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'CAPTURED', world: captured, videos, manipulation }, null, 2));
} catch (error) {
  for (const writer of Object.values(writers)) writer.abort();
  throw error;
} finally { clearTimeout(watchdog); await browser?.close(); await server.close(); }

function dataUrlBuffer(value) { assert.match(value, /^data:image\/png;base64,/); return Buffer.from(value.slice(value.indexOf(',' ) + 1), 'base64'); }
function createVideoWriter(ffmpegPath, outputPath) {
  const args = ['-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '10', '-vcodec', 'png', '-i', 'pipe:0',
    '-an', '-c:v', 'libvpx-vp9', '-threads', '2', '-lossless', '1', '-deadline', 'realtime', '-cpu-used', '4', '-pix_fmt', 'gbrp',
    '-colorspace', 'rgb', '-r', '10', '-f', 'webm', outputPath];
  const child = spawn(ffmpegPath, args, { cwd: ROOT, stdio: ['pipe', 'ignore', 'pipe'] }); let stderr = '', aborted = false;
  child.stderr.setEncoding('utf8'); child.stderr.on('data', value => { stderr += value; });
  const exited = new Promise((resolveExit, rejectExit) => {
    child.once('error', error => aborted ? resolveExit() : rejectExit(error));
    child.once('close', code => aborted || code === 0 ? resolveExit() : rejectExit(new Error(`ffmpeg ${code}: ${stderr}`)));
  });
  return { async write(buffer) { if (child.exitCode !== null) throw new Error(`ffmpeg stopped: ${stderr}`); if (!child.stdin.write(buffer)) await once(child.stdin, 'drain'); },
    async close() { child.stdin.end(); await exited; }, abort() { aborted = true; child.stdin.destroy(); child.kill(); } };
}
function probeVideo(ffprobePath, path) {
  const result = spawnSync(ffprobePath, ['-v', 'error', '-count_frames', '-show_entries',
    'stream=codec_type,width,height,nb_read_frames,pix_fmt,duration:format=duration', '-of', 'json', path], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout), streams = data.streams || [], stream = streams.find(item => item.codec_type === 'video'); assert.ok(stream);
  return { width: stream.width, height: stream.height, nb_read_frames: stream.nb_read_frames, pix_fmt: stream.pix_fmt,
    duration: stream.duration, formatDuration: data.format?.duration, audioStreams: streams.filter(item => item.codec_type === 'audio').length };
}
