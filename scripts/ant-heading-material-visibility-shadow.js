import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MAIN = 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292';
const START = '8fc9041dd1fdb9979a23616db175df9a34be978d';
const BRANCH = 'codex/ant-heading-material-visibility-shadow-20261026';
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-26-heading-material-visibility-shadow');
const PRIOR = resolve(ROOT, 'docs/ant/evidence/2026-10-26-material-rediscovery-shadow');
const SOURCE_PATHS = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/BodyPoseController.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/renderers/AntRenderer.js'];
const HEADINGS = [{ id: 'H0', mode: 'production' }, { id: 'H1', mode: 'isotropic-diagnostic' }];
const MATERIALS = [{ id: 'M0', presentation: 'production' }, { id: 'M1', presentation: 'presence-96' }];
const FRAME_TICKS = 6;
const MAX_TICKS = 60 * 60 * 10;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

assert.equal(git('rev-parse', 'HEAD'), START, 'run capture from the registered shadow base');
assert.equal(git('branch', '--show-current'), BRANCH);
assert.equal(git('rev-parse', 'origin/main'), MAIN, 'origin/main must be freshly verified at the registered current-G baseline');
assert.deepEqual((await readdir(OUTPUT)).sort(), ['PLAN.md', 'README.md'], 'refusing to overwrite evidence assets');
assert.ok(await readFile(resolve(PRIOR, 'capture.json')), 'prior capture is required for H0 parity comparison');

const ffmpeg = execFileSync('where.exe', ['ffmpeg'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
const ffprobe = resolve(dirname(ffmpeg), 'ffprobe.exe');
const encoderCheck = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
assert.equal(encoderCheck.status, 0, encoderCheck.stderr);
assert.match(encoderCheck.stdout, /libvpx-vp9/, 'VP9 encoder required for native review videos');

const videoDir = resolve(OUTPUT, 'video');
const stillDir = resolve(OUTPUT, 'stills');
await mkdir(videoDir);
await mkdir(stillDir);
const conditions = HEADINGS.flatMap(heading => MATERIALS.map(material => `${heading.id}-${material.id}`));
const writers = Object.fromEntries(conditions.map(condition => [condition,
  createVideoWriter(ffmpeg, resolve(videoDir, `${condition}.webm`))]));
const frameMaps = { H0: [], H1: [] };
const endpointMeasurementsByHeading = {};

const server = await createServer({ logLevel: 'error', appType: 'custom',
  server: { host: '127.0.0.1', port: 0, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 720 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(0);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  await page.route('**/__ant_heading_material_shadow', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><html><body><script>/* p5 sketch context */</script></body></html>'
  }));
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}/__ant_heading_material_shadow`, { waitUntil: 'domcontentloaded' });
  await page.exposeFunction('__submitAntHeadingMaterialFrame', async packet => {
    if (packet.videoFrameIndex !== null) {
      const rows = frameMaps[packet.heading];
      rows.push({ frameIndex: packet.videoFrameIndex, videoTimeSeconds: packet.videoFrameIndex / 10,
        tick: packet.tick, simulationTimeMs: packet.simulationTimeMs,
        rngState: packet.rng.state, rngCalls: packet.rng.calls,
        sourceStateSha256: packet.before, afterM0: packet.afterM0, afterM1: packet.afterM1,
        sameStateAfterBoth: packet.before === packet.afterM0 && packet.before === packet.afterM1,
        eventCountsUnchanged: packet.eventCountsUnchanged });
      await Promise.all(MATERIALS.map((material, index) =>
        writers[`${packet.heading}-${material.id}`].write(dataUrlBuffer(packet.pngs[index]))));
    }
    if (packet.stillName) {
      for (let index = 0; index < MATERIALS.length; index += 1) {
        await writeFile(resolve(stillDir, `${packet.heading}-${MATERIALS[index].id}-${packet.stillName}.png`),
          dataUrlBuffer(packet.pngs[index]));
      }
    }
    if (packet.measurements) endpointMeasurementsByHeading[packet.heading] = packet.measurements;
  });

  const captured = await page.evaluate(async () => {
    const [{ AntController }, { AntRenderer }] = await Promise.all([
      import('/src/lib/agents/ant/AntController.js'), import('/src/lib/renderers/AntRenderer.js')
    ]);
    const HEADINGS = [{ id: 'H0', mode: 'production' }, { id: 'H1', mode: 'isotropic-diagnostic' }];
    const MATERIALS = [{ id: 'M0', presentation: 'production' }, { id: 'M1', presentation: 'presence-96' }];
    const DT = 1 / 60, FRAME_TICKS = 6, MAX_TICKS = 60 * 60 * 10, TAU = Math.PI * 2;
    const enc = new TextEncoder();
    const worlds = {};

    function makeRandom() {
      let state = 20261005 >>> 0, calls = 0;
      const random = () => { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
      random.state = () => state;
      random.calls = () => calls;
      return random;
    }
    function typedBytes(view) {
      return ArrayBuffer.isView(view) ? new Uint8Array(view.buffer, view.byteOffset, view.byteLength) : new Uint8Array();
    }
    async function stateFingerprint(snapshot, rng) {
      const material = snapshot.stratigraphy, topology = material.stratigraphy;
      const plates = [...(material.plates || []), ...(snapshot.surfacePlates.plates || [])];
      const metadata = enc.encode(JSON.stringify({ state: snapshot.state, status: snapshot.status,
        agents: snapshot.agents, audio: snapshot.audio, analysis: snapshot.analysis, rng,
        material: { revision: material.revision, layerOrder: topology.layerOrder,
          plates: (material.plates || []).map(plate => ({ id: plate.id,
            bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs, grid: plate.grid,
            material: plate.material, centerline: plate.centerline, edges: plate.edges })) },
        surfacePlates: (snapshot.surfacePlates.plates || []).map(plate => ({ id: plate.id,
          bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs, grid: plate.grid })) }));
      const arrays = [snapshot.pheromone.values, snapshot.surface.values,
        topology.topLayerByCell, topology.layerCountByCell, topology.totalDepthByCellMeters,
        ...plates.map(plate => plate.mask).filter(ArrayBuffer.isView)];
      const parts = [metadata, ...arrays.map(typedBytes)];
      const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
      let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
    }
    function pheromoneStats(snapshot) {
      const field = snapshot.pheromone, values = Array.from(field.values);
      const sorted = values.toSorted((a, b) => a - b), positive = values.filter(value => value > 0);
      const quantile = fraction => sorted[Math.floor((sorted.length - 1) * fraction)];
      return { width: field.width, height: field.height, positiveCells: positive.length,
        maximum: sorted.at(-1) || 0, mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        q50: quantile(0.5), q90: quantile(0.9), q99: quantile(0.99),
        nodeSum: field.nodeSum, reconstructedIntegral: field.reconstructedIntegral };
    }
    function materialStats(renderer, snapshot) {
      const pixels = renderer.materialImage.pixels, top = snapshot.stratigraphy.stratigraphy.topLayerByCell;
      const occupied = [], offMaskNonzero = [];
      for (let index = 0; index < top.length; index += 1) {
        const offset = index * 4;
        if (top[index] >= 0) occupied.push({ alpha: pixels[offset + 3], rgb: [pixels[offset], pixels[offset + 1], pixels[offset + 2]] });
        else if (pixels[offset + 3] !== 0) offMaskNonzero.push(index);
      }
      return { occupiedCells: occupied.length,
        meanAlpha: occupied.reduce((sum, pixel) => sum + pixel.alpha, 0) / (occupied.length || 1),
        alphaValues: [...new Set(occupied.map(pixel => pixel.alpha))].sort((a, b) => a - b),
        rgbValues: [...new Set(occupied.map(pixel => pixel.rgb.join(',')))], offMaskNonzeroCount: offMaskNonzero.length };
    }
    function pixelDiffs(canvases, snapshot) {
      const left = canvases[0].getContext('2d').getImageData(0, 0, 640, 640).data;
      const right = canvases[1].getContext('2d').getImageData(0, 0, 640, 640).data;
      const topology = snapshot.stratigraphy.stratigraphy, gridWidth = snapshot.stratigraphy.width;
      const gridHeight = snapshot.stratigraphy.height;
      const inBand = (x, y, radius) => {
        const cellX = Math.floor(x * gridWidth / 640), cellY = Math.floor(y * gridHeight / 640);
        for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = cellX + dx, ny = cellY + dy;
          if (nx >= 0 && ny >= 0 && nx < gridWidth && ny < gridHeight
            && topology.topLayerByCell[ny * gridWidth + nx] >= 0) return true;
        }
        return false;
      };
      let changed = 0, insideOne = 0, insideTwo = 0;
      for (let y = 0; y < 640; y += 1) for (let x = 0; x < 640; x += 1) {
        const index = (y * 640 + x) * 4;
        if (left[index] === right[index] && left[index + 1] === right[index + 1]
          && left[index + 2] === right[index + 2] && left[index + 3] === right[index + 3]) continue;
        changed += 1;
        if (inBand(x, y, 1)) insideOne += 1;
        if (inBand(x, y, 2)) insideTwo += 1;
      }
      return { changedPixels: changed, withinOneCellBand: insideOne, outsideOneCellBand: changed - insideOne,
        withinTwoCellBand: insideTwo, outsideTwoCellBand: changed - insideTwo };
    }
    function milestoneFacts(snapshot, tick, rng, stateSha256) {
      const topology = snapshot.stratigraphy.stratigraphy;
      let occupiedMaterialCells = 0;
      for (const layer of topology.topLayerByCell) if (layer >= 0) occupiedMaterialCells += 1;
      return { tick, simulationTimeMs: snapshot.analysis.simulationTimeMs, stateSha256, rng,
        antCount: snapshot.agents.length, plateCount: snapshot.stratigraphy.plates.length,
        occupiedMaterialCells, pheromone: pheromoneStats(snapshot) };
    }

    for (const heading of HEADINGS) {
      const canvases = MATERIALS.map(material => {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 640;
        canvas.setAttribute('aria-label', `${heading.id} ${material.id}`);
        document.body.appendChild(canvas);
        return canvas;
      });
      const renderers = [new AntRenderer(canvases[0]), new AntRenderer(canvases[1], { materialPresentation: 'presence-96' })];
      const random = makeRandom();
      const controller = new AntController({ random, acceptedHeadingMode: heading.mode });
      if (controller.audioBridge !== null || !controller.materialLocomotionResistance) {
        throw new Error('Expected current production defaults with no audio bridge');
      }
      for (const renderer of renderers) if (!await renderer.init({ width: 640, height: 640, pixelRatio: 1 })) {
        throw new Error(`${heading.id} AntRenderer failed to initialize`);
      }
      const eventCounts = { footContact: 0, plateBirth: 0, noduleBirth: 0, error: 0 };
      let firstPlate = null;
      const unsubscribe = controller.subscribe(({ type, payload }) => {
        if (type === 'foot-contact') eventCounts.footContact += 1;
        else if (type === 'plate-birth') { eventCounts.plateBirth += 1; firstPlate ||= payload; }
        else if (type === 'sphere-birth') eventCounts.noduleBirth += 1;
        else if (type === 'error') eventCounts.error += 1;
      });
      await controller.init();
      const seenAgentIds = new Set(), acceptedHeadings = [];
      function recordNewAgents(tick) {
        for (const agent of controller.agents) if (!seenAgentIds.has(agent.id)) {
          seenAgentIds.add(agent.id);
          acceptedHeadings.push({ id: agent.id, tick, heading: agent.heading });
        }
      }
      recordNewAgents(0);
      let tick = 0, frameIndex = 0, preBirthSnapshot = null, preBirthRng = null;
      const tickRngTrace = [{ tick: 0, state: random.state(), calls: random.calls() }];
      const milestones = [];
      async function capture(snapshot, { name = null, video = false, rngState = null, atTick = tick,
        endpoint = false } = {}) {
        const rng = rngState || { state: random.state(), calls: random.calls() };
        const before = await stateFingerprint(snapshot, rng), beforeEvents = JSON.stringify(eventCounts);
        const fingerprints = [];
        const pngs = [];
        for (const renderer of renderers) {
          renderer.render(snapshot);
          fingerprints.push(await stateFingerprint(snapshot, rng));
          if (fingerprints.at(-1) !== before || JSON.stringify(eventCounts) !== beforeEvents) {
            throw new Error(`${heading.id} renderer changed state/RNG/events at tick ${atTick}`);
          }
          pngs.push(canvases[pngs.length].toDataURL('image/png'));
        }
        const measurements = endpoint ? {
          nativeCanvas: canvases.map(canvas => ({ width: canvas.width, height: canvas.height })),
          materials: renderers.map(renderer => materialStats(renderer, snapshot)),
          materialPixelDiffs: pixelDiffs(canvases, snapshot)
        } : null;
        await window.__submitAntHeadingMaterialFrame({ heading: heading.id,
          videoFrameIndex: video ? frameIndex : null, tick: atTick,
          simulationTimeMs: snapshot.analysis.simulationTimeMs, before, rng,
          afterM0: fingerprints[0], afterM1: fingerprints[1],
          eventCountsUnchanged: JSON.stringify(eventCounts) === beforeEvents,
          pngs, stillName: name, measurements });
        if (video) frameIndex += 1;
        if (name) milestones.push({ name, ...milestoneFacts(snapshot, atTick, rng, before) });
        return before;
      }

      try {
        const initialStateSha256 = await capture(controller.getSnapshot(), { video: true,
          rngState: { state: random.state(), calls: random.calls() }, atTick: 0 });
        let firstBirthTick = null, endTick = null, birthTimeMs = null;
        while (tick < MAX_TICKS) {
          if (!firstPlate && controller.trailPlateBirth.candidate?.stableSeconds >= 19) {
            preBirthSnapshot = controller.getSnapshot();
            preBirthRng = { state: random.state(), calls: random.calls() };
          }
          controller.tick(DT);
          tick += 1;
          tickRngTrace.push({ tick, state: random.state(), calls: random.calls() });
          recordNewAgents(tick);
          if (firstPlate && birthTimeMs === null) {
            birthTimeMs = firstPlate.bornAtSimulationTimeMs;
            firstBirthTick = tick;
            if (!Number.isFinite(birthTimeMs) || !preBirthSnapshot) throw new Error(`${heading.id} first Plate lacks exact pre-state`);
            if (preBirthSnapshot.stratigraphy.plates.length !== 0) throw new Error(`${heading.id} pre-Plate state already has material`);
            const afterBirth = controller.getSnapshot();
            if (afterBirth.stratigraphy.plates.length !== 1) throw new Error(`${heading.id} first Plate did not add exactly one Plate`);
            if (Math.abs(afterBirth.analysis.simulationTimeMs - birthTimeMs) >= 1e-6) throw new Error(`${heading.id} Plate event clock mismatch`);
            if (Math.abs(birthTimeMs - preBirthSnapshot.analysis.simulationTimeMs - DT * 1000) >= 1e-6) {
              throw new Error(`${heading.id} pre-Plate state is not the immediately previous tick`);
            }
            await capture(preBirthSnapshot, { name: 'pre-first-plate', rngState: preBirthRng, atTick: tick - 1 });
            await capture(afterBirth, { name: 'post-first-plate', rngState: { state: random.state(), calls: random.calls() }, atTick: tick });
            endTick = tick + 30 * 60;
          }
          if (firstBirthTick !== null && tick === firstBirthTick + 15 * 60) {
            await capture(controller.getSnapshot(), { name: 'first-plate-plus-15s',
              rngState: { state: random.state(), calls: random.calls() }, atTick: tick });
          }
          if (tick % FRAME_TICKS === 0) await capture(controller.getSnapshot(), { video: true,
            rngState: { state: random.state(), calls: random.calls() }, atTick: tick });
          if (endTick !== null && tick >= endTick) break;
        }
        if (endTick === null || tick !== endTick) throw new Error(`${heading.id} first Plate was not followed through +30 seconds`);
        const endSnapshot = controller.getSnapshot();
        if (tick % FRAME_TICKS !== 0) await capture(endSnapshot, { video: true,
          rngState: { state: random.state(), calls: random.calls() }, atTick: tick });
        await capture(endSnapshot, { name: 'first-plate-plus-30s',
          rngState: { state: random.state(), calls: random.calls() }, atTick: tick, endpoint: true });
        const result = { heading: heading.id, headingMode: heading.mode, seed: 20261005,
          tickCount: tick, firstPlateTick: firstBirthTick, firstPlateTimeMs: birthTimeMs,
          endTimeMs: endSnapshot.analysis.simulationTimeMs,
          firstPlateVideoOffsetSeconds: Math.ceil(firstBirthTick / FRAME_TICKS) / 10,
          rngFinal: { state: random.state(), calls: random.calls() }, eventCounts,
          controllerDefaults: { materialLocomotionResistance: controller.materialLocomotionResistance,
            audioBridgeAttached: controller.audioBridge !== null, audioEnabled: endSnapshot.audio.enabled },
          finalSnapshotSha256: await stateFingerprint(endSnapshot, { state: random.state(), calls: random.calls() }),
          initialStateSha256, rngAfterInit: tickRngTrace[0], tickRngTrace,
          acceptedHeadings, milestones, frameCount: frameIndex };
        worlds[heading.id] = result;
      } finally {
        unsubscribe();
        await Promise.all(renderers.map(renderer => renderer.destroy()));
        await controller.destroy();
        for (const canvas of canvases) canvas.remove();
      }
    }
    return worlds;
  });
  assert.deepEqual(pageErrors, []);
  await page.close();

  for (const heading of HEADINGS) {
    const world = captured[heading.id];
    assert.equal(world.milestones.length, 4);
    assert.deepEqual(world.milestones.map(item => item.name), [
      'pre-first-plate', 'post-first-plate', 'first-plate-plus-15s', 'first-plate-plus-30s'
    ]);
    assert.equal(world.tickCount - world.firstPlateTick, 1800);
    assert.ok(Math.abs(world.endTimeMs - world.firstPlateTimeMs - 30000) < 1e-6);
    assert.equal(world.controllerDefaults.audioBridgeAttached, false);
    assert.equal(world.controllerDefaults.materialLocomotionResistance, true);
    assert.ok(frameMaps[heading.id].length > 100);
    assert.ok(frameMaps[heading.id].every(frame => frame.sameStateAfterBoth && frame.eventCountsUnchanged));
    assert.ok(frameMaps[heading.id].every(frame => /^[a-f0-9]{64}$/.test(frame.sourceStateSha256)));
    const measurements = endpointMeasurementsByHeading[heading.id];
    assert.ok(measurements);
    assert.ok(measurements.nativeCanvas.every(canvas => canvas.width === 640 && canvas.height === 640));
    assert.ok(measurements.materials[1].alphaValues.length === 1 && measurements.materials[1].alphaValues[0] === 96);
    assert.deepEqual(measurements.materials[1].rgbValues, ['100,100,100']);
    assert.equal(measurements.materials[1].offMaskNonzeroCount, 0);
    assert.equal(measurements.materialPixelDiffs.outsideTwoCellBand, 0);
  }

  const oldCapture = JSON.parse(await readFile(resolve(PRIOR, 'capture.json'), 'utf8'));
  const oldFrameRows = (await readFile(resolve(PRIOR, 'frame-map.csv'), 'utf8')).trim().split(/\r?\n/).slice(1);
  const oldFrameStateHashes = oldFrameRows.map(row => row.split(',')[5]);
  const oldStillNames = { 'pre-first-plate': 'pre-first-plate', 'post-first-plate': 'post-first-plate',
    'first-plate-plus-15s': 'retained-plus-15s', 'first-plate-plus-30s': 'endpoint' };
  const oldMilestones = Object.fromEntries(oldCapture.sample.firstPlateAndEndpointSnapshots.map(frame => [frame.name, frame]));
  assert.deepEqual(frameMaps.H0.map(frame => frame.sourceStateSha256), oldFrameStateHashes,
    'H0 source-state stream must reproduce the prior current-G production run');
  assert.deepEqual(captured.H0.rngFinal, oldCapture.parity.rngFinal);
  assert.deepEqual(captured.H0.eventCounts, oldCapture.parity.eventCounts);
  assert.equal(captured.H0.firstPlateTimeMs, oldCapture.sample.firstPlateTimeMs);
  for (const milestone of captured.H0.milestones) {
    const priorName = oldStillNames[milestone.name];
    assert.equal(milestone.stateSha256, oldMilestones[priorName].stateSha256, `H0 ${milestone.name} state parity`);
    const oldPng = await readFile(resolve(PRIOR, 'stills', `candidate-a-${priorName}.png`));
    const newPng = await readFile(resolve(stillDir, `H0-M0-${milestone.name}.png`));
    assert.ok(oldPng.equals(newPng), `H0/M0 ${milestone.name} must reproduce prior production pixels`);
  }
  const firstRngDivergenceIndex = captured.H0.tickRngTrace.findIndex((sample, index) => {
    const other = captured.H1.tickRngTrace[index];
    return !other || sample.state !== other.state || sample.calls !== other.calls;
  });
  const firstWorldStateDivergence = frameMaps.H0.findIndex((frame, index) =>
    frame.sourceStateSha256 !== frameMaps.H1[index]?.sourceStateSha256);
  assert.equal(captured.H0.rngAfterInit.state, captured.H1.rngAfterInit.state);
  assert.equal(captured.H0.rngAfterInit.calls, captured.H1.rngAfterInit.calls);
  assert.equal(captured.H0.initialStateSha256 === captured.H1.initialStateSha256, false,
    'heading intervention should be present in the initial accepted-heading state');
  assert.ok(firstWorldStateDivergence >= 0, 'heading intervention must be visible in matched-seed state hashes');
  const crossHeadingDivergence = {
    firstStateDivergentVideoFrame: frameMaps.H0[firstWorldStateDivergence].frameIndex,
    firstStateDivergentTick: frameMaps.H0[firstWorldStateDivergence].tick,
    firstStateDivergentTimeMs: frameMaps.H0[firstWorldStateDivergence].simulationTimeMs,
    firstRngDivergentTick: firstRngDivergenceIndex < 0 ? null : captured.H0.tickRngTrace[firstRngDivergenceIndex].tick,
    rngSameAtInit: true,
    sameStateClaim: false
  };
  await writeFile(resolve(OUTPUT, 'cross-heading-divergence.json'), JSON.stringify(crossHeadingDivergence, null, 2) + '\n');

  for (const condition of conditions) await writers[condition].close();
  const probedVideos = Object.fromEntries(await Promise.all(conditions.map(async condition => [condition,
    await probeVideo(ffprobe, resolve(videoDir, `${condition}.webm`))])));
  for (const heading of HEADINGS) {
    const pair = MATERIALS.map(material => probedVideos[`${heading.id}-${material.id}`]);
    assert.ok(pair.every(video => video.width === 640 && video.height === 640));
    assert.equal(pair[0].nb_read_frames, pair[1].nb_read_frames);
    assert.equal(captured[heading.id].frameCount, Number(pair[0].nb_read_frames));
  }

  const summarizeHeading = headingId => {
    const samples = captured[headingId].acceptedHeadings;
    const bins = Array(12).fill(0);
    let x = 0, y = 0;
    for (const sample of samples) {
      const angle = sample.heading;
      x += Math.cos(angle); y += Math.sin(angle);
      bins[Math.min(11, Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 12))] += 1;
    }
    if (headingId === 'H0') assert.ok(samples.every(sample => Math.abs(wrapForCheck(sample.heading + Math.PI / 2)) <= 0.3 + 1e-12));
    else {
      assert.ok(samples.every(sample => sample.heading >= -Math.PI && sample.heading < Math.PI));
      assert.ok(bins.filter(count => count > 0).length >= 8, 'H1 sample should cover at least eight of twelve angular bins');
    }
    return { acceptedCount: samples.length, bins12: bins,
      circularResultant: Math.hypot(x, y) / samples.length,
      minHeadingRadians: Math.min(...samples.map(sample => sample.heading)),
      maxHeadingRadians: Math.max(...samples.map(sample => sample.heading)) };
  };
  const headingDistributions = { H0: summarizeHeading('H0'), H1: summarizeHeading('H1') };
  function wrapForCheck(value) { return ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }

  const baselineSourceHashes = Object.fromEntries(SOURCE_PATHS.map(path => [path,
    sha256(execFileSync('git', ['show', `${START}:${path}`], { cwd: ROOT }))]));
  const liveSourceHashes = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, sha256(await readFile(resolve(ROOT, path)))])));
  for (const heading of HEADINGS) {
    const rows = frameMaps[heading.id];
    const csv = ['frameIndex,videoTimeSeconds,tick,simulationTimeMs,rngState,rngCalls,sourceStateSha256,afterM0,afterM1,sameStateAfterBoth,eventCountsUnchanged',
      ...rows.map(frame => [frame.frameIndex, frame.videoTimeSeconds, frame.tick, frame.simulationTimeMs, frame.rngState, frame.rngCalls,
        frame.sourceStateSha256, frame.afterM0, frame.afterM1, frame.sameStateAfterBoth, frame.eventCountsUnchanged].join(','))].join('\n') + '\n';
    await writeFile(resolve(OUTPUT, `frame-map-${heading.id}.csv`), csv);
  }
  const frameSummary = Object.fromEntries(HEADINGS.map(heading => [heading.id, {
    frameCount: frameMaps[heading.id].length,
    distinctSourceStates: new Set(frameMaps[heading.id].map(frame => frame.sourceStateSha256)).size,
    sameSnapshotAfterM0M1: frameMaps[heading.id].every(frame => frame.sameStateAfterBoth),
    eventCountsStableDuringRender: frameMaps[heading.id].every(frame => frame.eventCountsUnchanged)
  }]));
  const endpointMeasurements = endpointMeasurementsByHeading;
  const capture = { schemaVersion: 1, branch: BRANCH, startCommit: START, currentMainCommit: MAIN,
    seed: 20261005, productionDefaultsExceptRegisteredHeadingDiagnostic: true,
    canvas: { width: 640, height: 640, pixelRatio: 1 }, frameRate: 10, frameTicks: FRAME_TICKS,
    conditions: { H0: 'production accepted heading', H1: 'isotropic diagnostic accepted heading wrap(-pi + 2*pi*U)',
      M0: 'production material renderer', M1: 'RGB 100,100,100 fixed alpha 96 on occupied cells' },
    worlds: captured,
    manipulationChecks: { acceptedHeadingDistributions: headingDistributions,
      sameMaterialStateWithinHeading: frameSummary,
      crossHeading: crossHeadingDivergence,
      crossHeadingSameStateClaim: false,
      priorH0: { stateFrameHashesMatch: true, milestoneStateHashesMatch: true,
        M0NativePngBytesMatch: true, rngFinalMatches: true, eventCountsMatch: true,
        firstPlateTimeMatches: true } },
    endpointRendererMeasurements: endpointMeasurements,
    videoEncoding: { command: 'ffmpeg PNG image2pipe at 10 fps to libvpx-vp9; no audio', videos: probedVideos },
    audio: { bridgeAttached: false, DSPCaptured: false },
    priorArtistReview: { path: '../2026-10-26-material-rediscovery-shadow/ARTIST-REVIEW.md',
      quote: '음 B뿐만 아니라 다 그렇긴 한거같은데 보기에 일단 차이 모르겠어 잘' },
    sourceHashesAtStart: baselineSourceHashes, liveSourceHashes,
    toolVersions: { node: process.version, chromium: browser.version(),
      ffmpeg: spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0] },
    runnerSha256: sha256(await readFile(fileURLToPath(import.meta.url))) };
  await writeFile(resolve(OUTPUT, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');
  await writeFile(resolve(OUTPUT, 'pixel-measurements.json'), JSON.stringify(endpointMeasurements, null, 2) + '\n');
  await writeFile(resolve(OUTPUT, 'heading-distributions.json'), JSON.stringify(headingDistributions, null, 2) + '\n');
  await writeFile(resolve(OUTPUT, 'review.html'), reviewHtml(captured));
  const mediaPaths = [...conditions.map(condition => `video/${condition}.webm`),
    ...HEADINGS.flatMap(heading => MATERIALS.flatMap(material => captured[heading.id].milestones.map(milestone =>
      `stills/${heading.id}-${material.id}-${milestone.name}.png`)))];
  const receipts = await Promise.all(mediaPaths.map(async path => `${sha256(await readFile(resolve(OUTPUT, path)))}  ${path}`));
  await writeFile(resolve(OUTPUT, 'MEDIA-SHA256.txt'), receipts.join('\n') + '\n');
  console.log(JSON.stringify({ status: 'CAPTURED', worlds: Object.fromEntries(HEADINGS.map(heading => [heading.id, {
    firstPlateTick: captured[heading.id].firstPlateTick, firstPlateTimeMs: captured[heading.id].firstPlateTimeMs,
    endTimeMs: captured[heading.id].endTimeMs, tickCount: captured[heading.id].tickCount,
    eventCounts: captured[heading.id].eventCounts, rngFinal: captured[heading.id].rngFinal
  }])), videos: probedVideos, headingDistributions, endpointMeasurements }, null, 2));
} catch (error) {
  for (const writer of Object.values(writers)) writer.abort();
  throw error;
} finally {
  await browser?.close();
  await server.close();
}

function createVideoWriter(ffmpegPath, outputPath) {
  const args = ['-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '10', '-vcodec', 'png',
    '-i', 'pipe:0', '-an', '-c:v', 'libvpx-vp9', '-lossless', '1', '-deadline', 'realtime', '-cpu-used', '4',
    '-pix_fmt', 'yuv420p', '-r', '10', '-f', 'webm', outputPath];
  const child = spawn(ffmpegPath, args, { cwd: ROOT, stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  let aborted = false;
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise((resolveExit, rejectExit) => {
    child.once('error', error => aborted ? resolveExit() : rejectExit(error));
    child.once('close', code => aborted || code === 0 ? resolveExit()
      : rejectExit(new Error(`ffmpeg exited ${code}: ${stderr}`)));
  });
  return {
    async write(buffer) {
      if (child.exitCode !== null) throw new Error(`ffmpeg stopped early: ${stderr}`);
      if (!child.stdin.write(buffer)) await once(child.stdin, 'drain');
    },
    async close() { child.stdin.end(); await exited; return { outputPath, bytes: (await readFile(outputPath)).byteLength }; },
    abort() { aborted = true; child.stdin.destroy(); child.kill(); }
  };
}

function dataUrlBuffer(value) {
  assert.match(value, /^data:image\/png;base64,/);
  return Buffer.from(value.slice(value.indexOf(',') + 1), 'base64');
}

async function probeVideo(ffprobePath, path) {
  const output = execFileSync(ffprobePath, ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,nb_read_frames,duration', '-of', 'json', path],
  { encoding: 'utf8' });
  const stream = JSON.parse(output).streams?.[0];
  assert.ok(stream, `No video stream: ${path}`);
  return { ...stream, bytes: (await readFile(path)).byteLength };
}

function reviewHtml(worlds) {
  const rows = MATERIALS.map(material => `<tr><th>${material.id === 'M0' ? 'Production material' : 'Strong material'}</th>${HEADINGS.map(heading => {
    const id = `${heading.id}-${material.id}`, offset = worlds[heading.id].firstPlateVideoOffsetSeconds;
    return `<td><video data-offset="${offset}" muted playsinline preload="metadata" src="video/${id}.webm" aria-label="${heading.id} ${material.id}"></video></td>`;
  }).join('')}</tr>`).join('');
  const milestoneNames = ['pre-first-plate', 'post-first-plate', 'first-plate-plus-15s', 'first-plate-plus-30s'];
  const stillRows = milestoneNames.map((name, index) => {
    const label = ['Immediately before first Plate', 'Immediately after first Plate', 'First Plate +15 model seconds',
      'First Plate +30 model seconds'][index];
    return `<tr><th>${label}</th>${HEADINGS.flatMap(heading => MATERIALS.map(material => {
      const id = `${heading.id}-${material.id}`;
      return `<td><img width="640" height="640" src="stills/${id}-${name}.png" alt="${heading.id}, ${material.id}, ${label}"></td>`;
    })).map((cell, cellIndex) => cell.replace('<td>', `<td data-condition="${conditions[cellIndex]}">`)).join('')}</tr>`;
  }).join('');
  const offsets = JSON.stringify(Object.fromEntries(HEADINGS.map(heading => [heading.id,
    worlds[heading.id].firstPlateVideoOffsetSeconds])));
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANT heading × material visibility shadow</title>
<style>
body{font:16px/1.4 system-ui,sans-serif;margin:24px;color:#222}main{max-width:100%;overflow:auto}.matrix{border-collapse:collapse}.matrix th,.matrix td{border:1px solid #bbb;padding:8px;vertical-align:top}.matrix>thead th{position:sticky;top:0;background:#fff}.matrix>tbody th{position:sticky;left:0;background:#fff}video{display:block;width:640px;height:640px;background:#eee}img{display:block;width:640px;height:640px;max-width:none}button,input{font:inherit;margin:8px 8px 8px 0}#seek{width:min(640px,70vw)}.section-title{margin-top:32px}
</style><body><h1>ANT heading × material visibility shadow</h1>
<p>Same seed and current-G laws, with one natural run per heading. Within each column, both material views use the same world snapshots. Cross-column worlds are matched-seed interventions.</p>
<p>Material rows show production mapping and strong presence. Heading columns show production heading and isotropic diagnostic. No alpha values are shown on this review surface.</p>
<div><button id="play">Play aligned views</button><button id="pause">Pause</button><label>Seek from first Plate <input id="seek" type="range" min="0" max="30" step="0.1" value="0"></label><output id="time">Plate +0.0 s</output></div>
<main><table class="matrix"><thead><tr><th>Material × heading</th><th>H0 · Production heading<br>First Plate ${ (worlds.H0.firstPlateTimeMs / 1000).toFixed(3) } s</th><th>H1 · Isotropic diagnostic<br>First Plate ${ (worlds.H1.firstPlateTimeMs / 1000).toFixed(3) } s</th></tr></thead><tbody>${rows}</tbody></table>
<h2 class="section-title">Native 640×640 milestone stills</h2><table class="matrix"><thead><tr><th>Milestone</th><th>H0/M0</th><th>H0/M1</th><th>H1/M0</th><th>H1/M1</th></tr></thead><tbody>${stillRows}</tbody></table></main>
<script>
const videos=[...document.querySelectorAll('video')],seek=document.querySelector('#seek'),clock=document.querySelector('#time');
const offsets=${offsets};
function seekAll(relative){for(const video of videos){const heading=video.getAttribute('aria-label').split(' ')[0];const target=offsets[heading]+relative;if(video.readyState>=1)video.currentTime=Math.min(target,video.duration||target)}}
document.querySelector('#play').onclick=async()=>{seekAll(Number(seek.value));await Promise.all(videos.map(video=>video.play()))};
document.querySelector('#pause').onclick=()=>videos.forEach(video=>video.pause());
seek.oninput=()=>{seekAll(Number(seek.value));clock.value='Plate +'+Number(seek.value).toFixed(1)+' s'};
for(const video of videos){video.onloadedmetadata=()=>{if(video.paused)seekAll(Number(seek.value))};video.ontimeupdate=()=>{if(!videos.some(other=>!other.paused))return;const heading=video.getAttribute('aria-label').split(' ')[0];const relative=Math.max(0,Math.min(30,video.currentTime-offsets[heading]));seek.value=relative;clock.value='Plate +'+relative.toFixed(1)+' s'}}
</script></body></html>`;
}
