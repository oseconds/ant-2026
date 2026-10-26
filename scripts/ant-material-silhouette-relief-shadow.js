import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const START = '01bbef5f5e7a82aaa4774ca866d14312332e9323';
const MAIN = 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292';
const BRANCH = 'codex/ant-material-silhouette-relief-shadow-20261026';
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-26-material-silhouette-relief-shadow');
const PRIOR = resolve(ROOT, 'docs/ant/evidence/2026-10-26-material-identity-decomposition');
const MATERIALS = [
  { id: 1, presentation: 'presence-96' }, { id: 2, presentation: 'presence-96-sharp' },
  { id: 3, presentation: 'presence-20-sharp' }, { id: 4, presentation: 'presence-20-edge' },
  { id: 5, presentation: 'presence-20-directional-edge' }
];
const SOURCE_PATHS = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/renderers/AntRenderer.js', 'src/lib/renderers/antMaterialIdentity.js',
  'src/lib/renderers/antMaterialSurface.js', 'scripts/ant-material-silhouette-relief-shadow.js',
  'docs/ant/evidence/2026-10-26-material-silhouette-relief-shadow/review.html'];
const FRAME_TICKS = 6, MAX_TICKS = 6301, DT = 1 / 60, WIDTH = 640, HEIGHT = 640;
const RECOVERY = process.argv.includes('--recover-existing-media');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const sourceBytes = async path => readFile(resolve(ROOT, path));
const runnerPath = fileURLToPath(import.meta.url);

assert.equal(git('rev-parse', 'HEAD'), START, 'run from the registered parent commit');
assert.equal(git('branch', '--show-current'), BRANCH);
assert.equal(git('rev-parse', 'origin/main'), MAIN);
const existing = await readdir(OUTPUT);
assert.ok(existing.includes('PLAN.md'), 'registered pre-result plan required');
const mediaPaths = MATERIALS.flatMap(({ id }) => [`video/view-${id}.webm`,
  ...['pre-first-plate', 'post-first-plate', 'first-plate-plus-15s', 'first-plate-plus-30s']
    .map(name => `stills/view-${id}-${name}.png`)]);
const existingMediaHashes = {};
for (const path of ['capture.json', 'manipulation.json', 'frame-map-H1.csv', 'MEDIA-SHA256.txt', 'MEDIA-VALIDATION.json', ...mediaPaths]) {
  if (RECOVERY && /\.(webm|png)$/.test(path)) {
    existingMediaHashes[path] = sha256(await readFile(resolve(OUTPUT, path)));
    continue;
  }
  try { await readFile(resolve(OUTPUT, path)); throw new Error(`Refusing to overwrite ${path}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

const ffmpeg = execFileSync('where.exe', ['ffmpeg'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
const ffprobe = resolve(dirname(ffmpeg), 'ffprobe.exe');
const encoder = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
assert.equal(encoder.status, 0, encoder.stderr); assert.match(encoder.stdout, /libvpx-vp9/);
const videoDir = resolve(OUTPUT, 'video'), stillDir = resolve(OUTPUT, 'stills');
await mkdir(videoDir, { recursive: true }); await mkdir(stillDir, { recursive: true });
const writers = RECOVERY ? {} : Object.fromEntries(MATERIALS.map(({ id }) => [id,
  createVideoWriter(ffmpeg, resolve(videoDir, `view-${id}.webm`))]));
const sourceHashesAtBaseline = Object.fromEntries(SOURCE_PATHS.map(path => {
  if (spawnSync('git', ['cat-file', '-e', `${START}:${path}`], { cwd: ROOT, stdio: 'ignore' }).status !== 0) return [path, null];
  return [path, sha256(execFileSync('git', ['show', `${START}:${path}`], { cwd: ROOT }))];
}));
const sourceHashesAtStart = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path => [path, sha256(await sourceBytes(path))])));
const runnerSha256AtStart = sha256(await readFile(runnerPath));
const frames = [], measurements = [];
const server = await createServer({ logLevel: 'error', appType: 'custom', server: { host: '127.0.0.1', port: 0, strictPort: true } });
let browser;
const watchdog = setTimeout(() => { for (const writer of Object.values(writers)) writer.abort(); void browser?.close(); void server.close(); process.exitCode = 124; }, 15 * 60 * 1000);
try {
  await server.listen();
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 720 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(0);
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  await page.route('**/__ant_material_silhouette', route => route.fulfill({ status: 200, contentType: 'text/html',
    body: '<!doctype html><html><body><script>/* p5 sketch context */</script></body></html>' }));
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}/__ant_material_silhouette`, { waitUntil: 'domcontentloaded' });
  await page.exposeFunction('__assertSetupValid', () => assert.deepEqual(pageErrors, [], 'p5 setup must be error-free before world initialization'));
  await page.exposeFunction('__submitPacket', async packet => {
    if (packet.frameIndex !== null) {
      if (!RECOVERY) for (const { id } of MATERIALS) await writers[id].write(dataUrlBuffer(packet.pngs[id]));
      frames.push({ frameIndex: packet.frameIndex, tick: packet.tick, simulationTimeMs: packet.simulationTimeMs,
        rngState: packet.rng.state, rngCalls: packet.rng.calls, stateSha256: packet.before,
        afterStateSha256: packet.after, fullStateSha256: packet.fullBefore,
        fullStateUnchanged: packet.fullBefore === packet.fullAfter, eventCountsUnchanged: packet.eventCountsUnchanged });
    }
    if (packet.milestone) {
      for (const { id } of MATERIALS) {
        const path = resolve(stillDir, `view-${id}-${packet.milestone}.png`), bytes = dataUrlBuffer(packet.pngs[id]);
        if (RECOVERY) assert.ok(bytes.equals(await readFile(path)), `replayed View ${id}/${packet.milestone} PNG bytes match`);
        else await writeFile(path, bytes);
      }
      console.log(JSON.stringify({ phase: 'milestone', name: packet.milestone, tick: packet.tick }));
    }
    if (packet.measurement) measurements.push(packet.measurement);
  });

  const captured = await page.evaluate(async ({ MATERIALS, FRAME_TICKS, MAX_TICKS, DT, WIDTH, HEIGHT, RECOVERY }) => {
    const [{ AntController }, { AntRenderer }] = await Promise.all([
      import('/src/lib/agents/ant/AntController.js'), import('/src/lib/renderers/AntRenderer.js')]);
    const enc = new TextEncoder();
    function ensure(condition, message) { if (!condition) throw new Error(message); }
    function makeRandom() { let state = 20261005 >>> 0, calls = 0;
      const random = () => { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
      random.state = () => state; random.calls = () => calls; return random; }
    function typedBytes(view) { return ArrayBuffer.isView(view) ? new Uint8Array(view.buffer, view.byteOffset, view.byteLength) : new Uint8Array(); }
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
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    }
    async function fullFingerprint(snapshot) {
      const chunks = [], json = JSON.stringify(snapshot, (_key, value) => {
        if (!ArrayBuffer.isView(value)) return value;
        const chunk = chunks.push(typedBytes(value)) - 1; return { typedArray: value.constructor.name, byteLength: value.byteLength, chunk };
      });
      const metadata = enc.encode(json), bytes = new Uint8Array(metadata.byteLength + chunks.reduce((n, chunk) => n + chunk.byteLength, 0));
      bytes.set(metadata); let offset = metadata.byteLength;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    }
    function rasterPixels(renderer, smoothing) {
      if (!renderer.materialImage) return new Uint8ClampedArray(WIDTH * HEIGHT * 4);
      if (renderer.materialSurface) return renderer.materialSurface.fillPixels;
      const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
      const context = canvas.getContext('2d'); context.imageSmoothingEnabled = smoothing; context.imageSmoothingQuality = 'high';
      context.drawImage(renderer.materialImage.canvas || renderer.materialImage.elt, 0, 0, WIDTH, HEIGHT);
      return context.getImageData(0, 0, WIDTH, HEIGHT).data;
    }
    function canonicalSupport(snapshot) {
      const top = snapshot.stratigraphy.stratigraphy.topLayerByCell, gridWidth = snapshot.stratigraphy.width,
        gridHeight = snapshot.stratigraphy.height, support = new Uint8Array(WIDTH * HEIGHT);
      for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
        const gx = Math.floor((x + .5) * gridWidth / WIDTH), gy = Math.floor((y + .5) * gridHeight / HEIGHT);
        support[y * WIDTH + x] = top[gy * gridWidth + gx] >= 0 ? 1 : 0;
      }
      return support;
    }
    function summarize(renderer, snapshot, pixels) {
      const support = canonicalSupport(snapshot), supportPixels = support.reduce((sum, value) => sum + value, 0);
      if (!renderer.materialSurface) return { sourceBitmapPixelCount: renderer.materialImage?.pixels.length || 0,
        supportPixels, offSupportPixels: null };
      let alphaMismatch = 0, offSupport = 0;
      for (let pixel = 0; pixel < support.length; pixel++) {
        const alpha = pixels[pixel * 4 + 3];
        if (support[pixel] && alpha !== 20 || !support[pixel] && alpha !== 0) alphaMismatch++;
        if (!support[pixel] && alpha) offSupport++;
      }
      return { ...renderer.materialSurface.stats, alphaMismatch, offSupportPixels: offSupport, supportPixels };
    }
    function canvasBytes(canvas) { return new Uint8ClampedArray(canvas.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT).data); }
    const canvases = MATERIALS.map(({ id }) => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = WIDTH; canvas.dataset.view = id; document.body.append(canvas); return canvas; });
    const renderers = MATERIALS.map(({ presentation }, index) => new AntRenderer(canvases[index], { materialPresentation: presentation }));
    const random = makeRandom(), controller = new AntController({ random, acceptedHeadingMode: 'isotropic-diagnostic' });
    if (controller.audioBridge !== null || !controller.materialLocomotionResistance) throw new Error('Unexpected controller default or audio bridge');
    for (const renderer of renderers) if (!await renderer.init({ width: WIDTH, height: HEIGHT, pixelRatio: 1 })) throw new Error('renderer init failed');
    await window.__assertSetupValid();
    const eventCounts = { footContact: 0, plateBirth: 0, noduleBirth: 0, error: 0 }; let firstPlate = null;
    const unsubscribe = controller.subscribe(({ type, payload }) => {
      if (type === 'foot-contact') eventCounts.footContact++; else if (type === 'plate-birth') { eventCounts.plateBirth++; firstPlate ||= payload; }
      else if (type === 'sphere-birth') eventCounts.noduleBirth++; else if (type === 'error') eventCounts.error++;
    });
    await controller.init(); let tick = 0, frameIndex = 0, pre = null, preRng = null, birthTick = null, endTick = null;
    const milestones = [], rerenderChecks = [];
    async function render(snapshot, atTick, milestone, { video = false, rngState = null } = {}) {
      const rng = rngState || { state: random.state(), calls: random.calls() }, liveRng = { state: random.state(), calls: random.calls() };
      const before = await stateFingerprint(snapshot, rng), fullBefore = await fullFingerprint(snapshot), events = JSON.stringify(eventCounts);
      let after = before, fullAfter = fullBefore;
      const pngs = {}, views = [], finalCanvases = [], cacheRefs = [];
      for (let index = 0; index < renderers.length; index++) {
        const renderer = renderers[index]; await renderer.render(snapshot);
        const id = MATERIALS[index].id;
        if (milestone || (video && !RECOVERY)) pngs[id] = canvases[index].toDataURL('image/png');
        if (milestone) {
          const fill = rasterPixels(renderer, index === 0), edge = renderer.materialEdgeImage?.pixels || new Uint8ClampedArray(0);
          views.push({ fill, edge, stats: summarize(renderer, snapshot, fill), support: renderer.materialSurface?.support || canonicalSupport(snapshot),
            band: renderer.materialSurface?.band || new Uint8Array(WIDTH * HEIGHT), surfaceStats: renderer.materialSurface?.stats || null });
          finalCanvases.push(canvasBytes(canvases[index])); cacheRefs.push([renderer.materialImage, renderer.materialEdgeImage, renderer.materialSurface]);
        }
        after = await stateFingerprint(snapshot, rng); fullAfter = await fullFingerprint(snapshot);
        if (after !== before || fullAfter !== fullBefore || JSON.stringify(eventCounts) !== events
          || random.state() !== liveRng.state || random.calls() !== liveRng.calls) throw new Error(`renderer changed world/RNG/events at tick ${atTick}`);
      }
      if (milestone) {
        const aPixels = renderers[0].materialImage.pixels, bPixels = renderers[1].materialImage.pixels;
        ensure(aPixels.length === bPixels.length && aPixels.every((value, index) => value === bPixels[index]), 'Views 1/2 source bitmap parity');
        const canonical = canonicalSupport(snapshot), nearest = views[1].fill, faint = views[2].fill;
        for (let pixel = 0; pixel < canonical.length; pixel++) {
          ensure((nearest[pixel * 4 + 3] > 0 ? 1 : 0) === canonical[pixel], 'View 2 canonical nearest support');
          ensure(views[2].support[pixel] === canonical[pixel], 'View 3 canonical nearest support');
          ensure(faint[pixel * 4 + 3] === (canonical[pixel] ? 20 : 0), 'View 3 fixed alpha and support');
          for (const viewIndex of [2, 3, 4]) {
            const view = views[viewIndex];
            if (viewIndex >= 3) {
              const edgeAlpha = view.edge[pixel * 4 + 3];
              ensure(canonical[pixel] || edgeAlpha === 0, 'edge image has no off-support pixel');
              ensure(edgeAlpha === (view.band[pixel] ? 64 : 0), 'fixed edge alpha and boundary support');
            }
          }
          ensure(views[3].band[pixel] === views[4].band[pixel], 'Views 4/5 boundary support equality');
          if (!canonical[pixel]) for (let channel = 0; channel < 4; channel++)
            ensure(finalCanvases[2][pixel * 4 + channel] === finalCanvases[3][pixel * 4 + channel], 'View 3/4 off-support composite parity');
          if (!canonical[pixel]) for (let channel = 0; channel < 4; channel++)
            ensure(finalCanvases[2][pixel * 4 + channel] === finalCanvases[4][pixel * 4 + channel], 'View 3/5 off-support composite parity');
        }
        for (let index = 0; index < renderers.length; index++) {
          await renderers[index].render(snapshot);
          ensure(canvases[index].toDataURL('image/png') === pngs[MATERIALS[index].id], `deterministic rerender View ${index + 1}`);
          ensure(renderers[index].materialImage === cacheRefs[index][0], 'material fill cache stable');
          ensure(renderers[index].materialEdgeImage === cacheRefs[index][1], 'edge cache stable');
          ensure(renderers[index].materialSurface === cacheRefs[index][2], 'surface cache stable');
        }
        const eStats = views[4].surfaceStats, dStats = views[3].surfaceStats;
        rerenderChecks.push({ milestone, allFiveCanvasPngBytesStable: true, materialAndEdgeCacheStable: true });
        const measurement = { milestone, tick: atTick, views: Object.fromEntries(views.map((view, index) => [index + 1, {
          ...view.stats, boundaryPixels: view.surfaceStats?.bandPixels ?? 0,
          boundaryMeanWhiteDarkness: view.surfaceStats?.whiteCompositeMeanBoundaryDarkness ?? null,
          boundaryMeanRgb: view.surfaceStats?.meanEdgeRgb ?? null,
          minEdgeRgb: view.surfaceStats?.minEdgeRgb ?? null, maxEdgeRgb: view.surfaceStats?.maxEdgeRgb ?? null
        }])),
          exactNearestSupportParity23: true, exactBoundarySupportParity45: true,
          dEMeanWhiteBoundaryDarknessMismatch: dStats && eStats
            ? eStats.whiteCompositeMeanBoundaryDarkness - dStats.whiteCompositeMeanBoundaryDarkness : null,
          offSupportCompositePixelChanges34: 0, offSupportCompositePixelChanges35: 0 };
        await window.__submitPacket({ frameIndex: video ? frameIndex : null, tick: atTick, simulationTimeMs: snapshot.analysis.simulationTimeMs,
          rng, before, after: before, fullBefore, fullAfter: fullBefore, eventCountsUnchanged: true, pngs, milestone, measurement });
        milestones.push({ name: milestone, tick: atTick, simulationTimeMs: snapshot.analysis.simulationTimeMs,
          stateSha256: before, fullStateSha256: fullBefore, rng, eventCounts: { ...eventCounts }, plateCount: snapshot.stratigraphy.plates.length,
          occupiedMaterialCells: snapshot.stratigraphy.stratigraphy.topLayerByCell.reduce((sum, value) => sum + Number(value >= 0), 0),
          pheromone: { width: snapshot.pheromone.width, height: snapshot.pheromone.height,
            nonzeroCells: snapshot.pheromone.values.reduce((sum, value) => sum + Number(value > 0), 0),
            max: snapshot.pheromone.values.reduce((maximum, value) => Math.max(maximum, value), -Infinity),
            sum: snapshot.pheromone.values.reduce((sum, value) => sum + value, 0) } });
      } else if (video) {
        await window.__submitPacket({ frameIndex, tick: atTick, simulationTimeMs: snapshot.analysis.simulationTimeMs,
          rng, before, after: before, fullBefore, fullAfter, eventCountsUnchanged: true, pngs, milestone: null, measurement: null });
      }
      if (video) frameIndex++;
      return before;
    }
    const initialStateSha256 = await render(controller.getSnapshot(), 0, null, { video: true });
    try {
      while (tick < MAX_TICKS) {
        if (!firstPlate && controller.trailPlateBirth.candidate?.stableSeconds >= 19) { pre = controller.getSnapshot(); preRng = { state: random.state(), calls: random.calls() }; }
        controller.tick(DT); tick++;
        if (firstPlate && birthTick === null) {
          birthTick = tick; const after = controller.getSnapshot();
          if (!pre || pre.stratigraphy.plates.length || after.stratigraphy.plates.length !== 1) throw new Error('first Plate pre/post state invalid');
          await render(pre, tick - 1, 'pre-first-plate', { rngState: preRng }); await render(after, tick, 'post-first-plate'); endTick = tick + 1800;
        }
        if (birthTick !== null && tick === birthTick + 900) await render(controller.getSnapshot(), tick, 'first-plate-plus-15s');
        if (tick % FRAME_TICKS === 0) await render(controller.getSnapshot(), tick, null, { video: true });
        if (endTick !== null && tick >= endTick) break;
      }
      if (tick !== MAX_TICKS || !birthTick || tick - birthTick !== 1800) throw new Error(`registered endpoint mismatch tick=${tick}, birth=${birthTick}`);
      const endpoint = controller.getSnapshot();
      if (tick % FRAME_TICKS !== 0) await render(endpoint, tick, null, { video: true });
      await render(endpoint, tick, 'first-plate-plus-30s');
      return { initialStateSha256,
        milestones, rerenderChecks, tickCount: tick, firstPlateTick: birthTick, firstPlateTimeMs: firstPlate.bornAtSimulationTimeMs,
        firstPlateVideoOffsetSeconds: Math.ceil(birthTick / FRAME_TICKS) / 10, endTimeMs: endpoint.analysis.simulationTimeMs,
        rngFinal: { state: random.state(), calls: random.calls() }, eventCounts: { ...eventCounts },
        materialLocomotionResistance: controller.materialLocomotionResistance, audioBridgeAttached: controller.audioBridge !== null,
        audioEnabled: endpoint.audio.enabled, finalSnapshotSha256: await stateFingerprint(endpoint, { state: random.state(), calls: random.calls() }), frameCount: frameIndex,
        finalPlateCount: endpoint.stratigraphy.plates.length, finalOccupiedMaterialCells: endpoint.stratigraphy.stratigraphy.topLayerByCell.reduce((sum, value) => sum + Number(value >= 0), 0),
        finalPheromone: { nonzeroCells: endpoint.pheromone.values.reduce((sum, value) => sum + Number(value > 0), 0),
          max: endpoint.pheromone.values.reduce((maximum, value) => Math.max(maximum, value), -Infinity),
          sum: endpoint.pheromone.values.reduce((sum, value) => sum + value, 0) } };
    } finally { unsubscribe(); await Promise.all(renderers.map(renderer => renderer.destroy())); await controller.destroy(); canvases.forEach(canvas => canvas.remove()); }
  }, { MATERIALS, FRAME_TICKS, MAX_TICKS, DT, WIDTH, HEIGHT, RECOVERY });

  assert.deepEqual(pageErrors, []); assert.equal(captured.tickCount, MAX_TICKS); assert.equal(captured.firstPlateTick, 4501);
  assert.equal(captured.firstPlateTimeMs, 75016.66666666561); assert.equal(captured.audioBridgeAttached, false); assert.equal(captured.audioEnabled, false);
  assert.equal(captured.frameCount, 1052);
  const priorCapture = JSON.parse(await readFile(resolve(PRIOR, 'capture.json'), 'utf8'));
  const priorRows = (await readFile(resolve(PRIOR, 'frame-map-H1.csv'), 'utf8')).trim().split(/\r?\n/).slice(1);
  assert.deepEqual(frames.map(frame => frame.stateSha256), priorRows.map(row => row.split(',')[6]), 'same H1 frame states as parent');
  assert.deepEqual(frames.map(frame => [frame.rngState, frame.rngCalls]), priorRows.map(row => row.split(',').slice(4, 6).map(Number)), 'same H1 frame RNG trace as parent');
  assert.ok(frames.every(frame => frame.fullStateUnchanged && frame.eventCountsUnchanged));
  assert.deepEqual(captured.rngFinal, priorCapture.world.rngFinal, 'final world RNG matches parent');
  assert.deepEqual(captured.eventCounts, priorCapture.world.eventCounts, 'world event counts match parent');
  assert.equal(captured.firstPlateTimeMs, priorCapture.world.firstPlateTimeMs);
  const names = ['pre-first-plate', 'post-first-plate', 'first-plate-plus-15s', 'first-plate-plus-30s'];
  for (const name of names) {
    const previous = priorCapture.world.milestones.find(item => item.name === name);
    const current = captured.milestones.find(item => item.name === name);
    assert.equal(current.stateSha256, previous.stateSha256, `H1 ${name} state parity`);
    assert.deepEqual(current.rng, previous.rng, `H1 ${name} RNG parity`);
    for (const id of [1, 2]) assert.ok((await readFile(resolve(OUTPUT, `stills/view-${id}-${name}.png`)))
      .equals(await readFile(resolve(PRIOR, `stills/${id === 1 ? 'A' : 'B'}-${name}.png`))), `View ${id} ${name} checkpoint parity`);
  }
  await page.close();
  for (const writer of Object.values(writers)) await writer.close();

  const videos = Object.fromEntries(await Promise.all(MATERIALS.map(async ({ id }) => [id,
    await probeVideo(ffprobe, resolve(videoDir, `view-${id}.webm`))])));
  const reference = videos[1];
  for (const [id, video] of Object.entries(videos)) {
    assert.equal(video.width, WIDTH); assert.equal(video.height, HEIGHT); assert.equal(video.nb_read_frames, String(captured.frameCount));
    assert.equal(video.duration, reference.duration); assert.equal(video.pix_fmt, 'gbrp'); assert.equal(video.audioStreams, 0);
    const videoRgb = execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-sseof', '-0.1', '-i', resolve(videoDir, `view-${id}.webm`),
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 4 * 1024 * 1024 });
    const stillRgb = execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', resolve(stillDir, `view-${id}-first-plate-plus-30s.png`),
      '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 4 * 1024 * 1024 });
    assert.ok(videoRgb.equals(stillRgb), `View ${id} encoded endpoint RGB matches native endpoint still`);
  }
  const manipulation = { priorH1FrameStatesAndRngMatch: true, firstPlateAndFinalRngEventsMatchParent: true,
    views12CheckpointPngsByteExact: true, sequentialRendererStateRngEventParity: true,
    deterministicSameSnapshotPngAndCacheRerender: captured.rerenderChecks,
    exactNearestSupportAndNoOffSupportForViews345: true, exactBoundarySupportAndAlphaViews45: true,
    offSupportCompositeChanges: 0, dEMeanBoundaryDarknessByMilestone: measurements.map(x => ({ milestone: x.milestone,
      mismatch: x.dEMeanWhiteBoundaryDarknessMismatch, view4: x.views[4].boundaryMeanWhiteDarkness,
      view5: x.views[5].boundaryMeanWhiteDarkness, view4BandPixels: x.views[4].boundaryPixels, view5BandPixels: x.views[5].boundaryPixels })),
    measurements };
  await writeFile(resolve(OUTPUT, 'frame-map-H1.csv'), ['frameIndex,videoTimeSeconds,tick,simulationTimeMs,rngState,rngCalls,stateSha256,afterStateSha256,fullStateSha256,fullStateUnchanged,eventCountsUnchanged',
    ...frames.map(frame => [frame.frameIndex, frame.frameIndex / 10, frame.tick, frame.simulationTimeMs, frame.rngState, frame.rngCalls,
      frame.stateSha256, frame.afterStateSha256, frame.fullStateSha256, frame.fullStateUnchanged, frame.eventCountsUnchanged].join(','))].join('\n') + '\n');
  await writeFile(resolve(OUTPUT, 'manipulation.json'), JSON.stringify(manipulation, null, 2) + '\n');
  const sourceHashesAtEnd = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path => [path, sha256(await sourceBytes(path))])));
  assert.deepEqual(sourceHashesAtStart, sourceHashesAtEnd, 'source/viewer files stable during capture');
  assert.equal(runnerSha256AtStart, sha256(await readFile(runnerPath)), 'runner stable during capture');
  if (RECOVERY) for (const [path, hash] of Object.entries(existingMediaHashes))
    assert.equal(sha256(await readFile(resolve(OUTPUT, path))), hash, `metadata replay left ${path} unchanged`);
  const capture = { schemaVersion: 1, branch: BRANCH, startCommit: START, currentMainCommit: MAIN, seed: 20261005,
    headingMode: 'isotropic-diagnostic', canvas: { width: WIDTH, height: HEIGHT, pixelRatio: 1, browserDpr: 1 },
    frameRate: 10, frameTicks: FRAME_TICKS, maxTick: MAX_TICKS, firstPlateVideoOffsetSeconds: captured.firstPlateVideoOffsetSeconds,
    world: captured, conditions: Object.fromEntries(MATERIALS.map(({ id, presentation }) => [id, presentation])),
    materialRegistration: { fillRgb: 100, fillAlphaView3: 20, edgeRgbView4: 80, edgeAlphaViews4and5: 64,
      interiorBandRadiusNativePixels: 2, view5WorldLight: [-Math.SQRT1_2, -Math.SQRT1_2], view5ShadeCoefficient: 24 },
    measurements, videos, audio: { bridgeAttached: false, enabled: false, captured: false },
    metadataCollection: RECOVERY ? 'deterministic H1 metadata replay; all 20 milestone PNGs byte-equal saved media; no video encoding' : 'native acquisition',
    mediaAcquisition: RECOVERY ? 'attempt-04 native media; existing files hash-verified unchanged' : 'current run',
    mediaSourceRunnerSha256: RECOVERY
      ? sha256(await readFile(resolve(OUTPUT, 'attempt-04', 'executed-runner.js.txt'))) : runnerSha256AtStart,
    existingMediaHashes: RECOVERY ? existingMediaHashes : null,
    sourceHashesAtBaseline, sourceHashesAtStart, sourceHashesAtEnd, sourceFilesUnchangedDuringCapture: true,
    reviewSurface: null,
    toolVersions: { node: process.version, chromium: browser.version(), ffmpeg: spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0] },
    runnerSha256: runnerSha256AtStart };
  await writeFile(resolve(OUTPUT, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');
  const reviewPage = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  reviewPage.setDefaultTimeout(0);
  const reviewErrors = []; reviewPage.on('pageerror', error => reviewErrors.push(String(error?.stack || error)));
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
    nativeStills: ['#leftStill', '#rightStill'].every(selector => { const image = document.querySelector(selector); return image.naturalWidth === 640 && image.naturalHeight === 640; }),
    videosLazyUntilPlay: ['#leftVideo', '#rightVideo'].every(selector => document.querySelector(selector).preload === 'none')
  }));
  assert.deepEqual(neutralReview.labels, ['View 1','View 2','View 3','View 4','View 5','View 1','View 2','View 3','View 4','View 5']);
  assert.equal(neutralReview.questionsHidden, true); assert.equal(neutralReview.recordDisabled, true);
  assert.equal(neutralReview.downloadDisabled, true); assert.equal(neutralReview.nativeStills, true);
  assert.equal(neutralReview.videosLazyUntilPlay, true);
  assert.match(neutralReview.prompt, /무엇이 달라 보였고/);
  assert.doesNotMatch(neutralReview.initialText.toLowerCase(), /silhouette|relief|depth|material|better|texture/);
  await reviewPage.locator('#memo').fill('first free description smoke check');
  await reviewPage.locator('#record').click();
  await reviewPage.waitForFunction(() => !document.querySelector('#questions').hidden);
  assert.deepEqual(reviewErrors, []);
  await reviewPage.close();
  capture.reviewSurface = { neutralLabels: true, firstPromptOnlyBeforeResponse: true, native640Videos: true,
      additionalQuestionsAppearAfterFirstNote: true, initialNeutralScreen: neutralReview, pageErrors: reviewErrors };
  await writeFile(resolve(OUTPUT, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');
  const media = [...MATERIALS.map(({ id }) => `video/view-${id}.webm`), ...MATERIALS.flatMap(({ id }) => names.map(name => `stills/view-${id}-${name}.png`))];
  await writeFile(resolve(OUTPUT, 'MEDIA-SHA256.txt'), (await Promise.all(media.map(async path =>
    `${sha256(await readFile(resolve(OUTPUT, path)))}  ${path}`))).join('\n') + '\n');
  await writeFile(resolve(OUTPUT, 'MEDIA-VALIDATION.json'), JSON.stringify({ allViews640x640: true,
    frameCount: captured.frameCount, videoProbe: videos, ffmpegDecodedEndpointRgbEqualsStill: true,
    neutralReviewSurface: capture.reviewSurface }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'CAPTURED', captured, videos, manipulation }, null, 2));
} catch (error) { for (const writer of Object.values(writers)) writer.abort(); throw error; }
finally { clearTimeout(watchdog); await browser?.close(); await server.close(); }

function dataUrlBuffer(value) { assert.match(value, /^data:image\/png;base64,/); return Buffer.from(value.slice(value.indexOf(',') + 1), 'base64'); }
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
