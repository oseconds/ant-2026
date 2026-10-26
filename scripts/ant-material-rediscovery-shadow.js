import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASELINE = 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292';
const BRANCH = 'codex/ant-material-rediscovery-shadow-20261026';
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-26-material-rediscovery-shadow');
const SOURCE_PATHS = ['src/lib/renderers/AntRenderer.js', 'src/lib/agents/ant/AntController.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/TrailPlateBirth.js'];
const CANDIDATES = ['A', 'B', 'C'];
const FRAME_TICKS = 6;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

assert.equal(git('rev-parse', 'HEAD'), BASELINE, 'runner must start at the preregistered origin/main commit');
assert.equal(git('branch', '--show-current'), BRANCH);
assert.deepEqual((await readdir(OUTPUT)).sort(), ['PLAN.md', 'README.md'], 'refusing to overwrite prior capture assets');

const ffmpeg = execFileSync('where.exe', ['ffmpeg'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
const ffprobe = resolve(dirname(ffmpeg), 'ffprobe.exe');
const encoderCheck = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
assert.equal(encoderCheck.status, 0, encoderCheck.stderr);
assert.match(encoderCheck.stdout, /libvpx-vp9/, 'lossless VP9 encoder is required for review video');

const videoDir = resolve(OUTPUT, 'video');
const stillDir = resolve(OUTPUT, 'stills');
await mkdir(videoDir);
await mkdir(stillDir);
const writers = Object.fromEntries(CANDIDATES.map(candidate => [candidate,
  createVideoWriter(ffmpeg, resolve(videoDir, `candidate-${candidate.toLowerCase()}.webm`))]));
const frameMap = [];
let endpointMeasurements = null;
let submittedFrames = 0;

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
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.route('**/__ant_material_rediscovery_shadow', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><html><body><script>/* p5 sketch context */</script></body></html>'
  }));
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}/__ant_material_rediscovery_shadow`, { waitUntil: 'domcontentloaded' });
  await page.exposeFunction('__submitAntRediscoveryFrame', async packet => {
    if (packet.videoFrameIndex !== null) {
      frameMap.push({ frameIndex: packet.videoFrameIndex, videoTimeSeconds: packet.videoFrameIndex / 10,
        tick: packet.tick, simulationTimeSeconds: packet.simulationTimeMs / 1000,
        simulationTimeMs: packet.simulationTimeMs, sourceStateSha256: packet.fingerprints[0],
        unchangedAfterA: packet.fingerprints[0] === packet.fingerprints[1],
        unchangedAfterB: packet.fingerprints[1] === packet.fingerprints[2],
        unchangedAfterC: packet.fingerprints[2] === packet.fingerprints[3] });
      await Promise.all(CANDIDATES.map((candidate, index) =>
        writers[candidate].write(dataUrlBuffer(packet.pngs[index]))));
      submittedFrames += 1;
      if (submittedFrames % 100 === 0) process.stdout.write(`captured ${submittedFrames} motion frames\n`);
    }
    if (packet.stillName) {
      for (let index = 0; index < CANDIDATES.length; index += 1) {
        const path = resolve(stillDir, `candidate-${CANDIDATES[index].toLowerCase()}-${packet.stillName}.png`);
        await writeFile(path, dataUrlBuffer(packet.pngs[index]));
      }
    }
    if (packet.measurements) endpointMeasurements = packet.measurements;
  });

  const result = await page.evaluate(async () => {
    const [{ AntController }, { AntRenderer }] = await Promise.all([
      import('/src/lib/agents/ant/AntController.js'), import('/src/lib/renderers/AntRenderer.js')
    ]);
    const enc = new TextEncoder();
    const DT = 1 / 60, FRAME_TICKS = 6, MAX_TICKS = 180 * 60;
    let rngState = 20261005 >>> 0;
    const random = () => { random.calls += 1; rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 0x100000000; };
    random.calls = 0;
    random.state = () => rngState;

    const canvases = ['A', 'B', 'C'].map(candidate => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 640;
      canvas.setAttribute('aria-label', `Candidate ${candidate}`);
      document.body.appendChild(canvas);
      return canvas;
    });
    const renderers = [new AntRenderer(canvases[0]),
      new AntRenderer(canvases[1], { materialPresentation: 'surface' }),
      new AntRenderer(canvases[2], { materialPresentation: 'textured' })];
    for (const renderer of renderers) {
      if (!await renderer.init({ width: 640, height: 640, pixelRatio: 1 })) throw new Error('AntRenderer failed to initialize');
    }
    const controller = new AntController({ random });
    if (controller.audioBridge !== null || !controller.materialLocomotionResistance) {
      throw new Error('Expected production movement defaults with no audio bridge');
    }
    const counts = { footContact: 0, plateBirth: 0, noduleBirth: 0, error: 0 };
    let firstPlate = null;
    const unsubscribe = controller.subscribe(({ type, payload }) => {
      if (type === 'foot-contact') counts.footContact += 1;
      else if (type === 'plate-birth') { counts.plateBirth += 1; firstPlate ||= payload; }
      else if (type === 'sphere-birth') counts.noduleBirth += 1;
      else if (type === 'error') counts.error += 1;
    });
    await controller.init();
    let tick = 0, frameIndex = 0, preBirthSnapshot = null, preBirthRng = null;
    const keyframes = [];

    function typedBytes(view) {
      return ArrayBuffer.isView(view)
        ? new Uint8Array(view.buffer, view.byteOffset, view.byteLength) : new Uint8Array();
    }
    async function stateFingerprint(snapshot, rng) {
      const material = snapshot.stratigraphy;
      const topology = material.stratigraphy;
      const plateViews = [...(material.plates || []), ...(snapshot.surfacePlates.plates || [])];
      const metadata = enc.encode(JSON.stringify({ state: snapshot.state, status: snapshot.status,
        agents: snapshot.agents, audio: snapshot.audio, analysis: snapshot.analysis,
        rng, material: { revision: material.revision, layerOrder: topology.layerOrder,
          plates: (material.plates || []).map(plate => ({ id: plate.id,
            bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs, grid: plate.grid,
            material: plate.material, centerline: plate.centerline, edges: plate.edges })) },
        surfacePlates: (snapshot.surfacePlates.plates || []).map(plate => ({ id: plate.id,
          bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs, grid: plate.grid })) }));
      const arrays = [snapshot.pheromone.values, snapshot.surface.values,
        topology.topLayerByCell, topology.layerCountByCell, topology.totalDepthByCellMeters,
        ...plateViews.map(plate => plate.mask).filter(ArrayBuffer.isView)];
      const parts = [metadata, ...arrays.map(typedBytes)];
      const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
    }
    function materialImageStats(renderer, snapshot) {
      const pixels = renderer.materialImage.pixels;
      const top = snapshot.stratigraphy.stratigraphy.topLayerByCell;
      const alpha = [];
      let texturedCount = 0;
      for (let index = 0; index < top.length; index += 1) if (top[index] >= 0) {
        alpha.push(pixels[index * 4 + 3]);
        if (renderer.materialPresentation === 'textured' && pixels[index * 4 + 3]
          === Math.max(0, Math.min(30, 18 + (snapshot.stratigraphy.stratigraphy.layerCountByCell[index] || 1)) - 8)) texturedCount += 1;
      }
      return { materialCellCount: alpha.length, meanAlpha: alpha.reduce((sum, value) => sum + value, 0) / (alpha.length || 1),
        textureCellCount: texturedCount };
    }
    function textureAt(x, y) {
      let hash = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0;
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
      hash = (hash ^ (hash >>> 16)) >>> 0;
      return (hash & 15) === 0;
    }
    function pixelDiffs(snapshot) {
      const arrays = canvases.map(canvas => canvas.getContext('2d').getImageData(0, 0, 640, 640).data);
      const material = snapshot.stratigraphy.stratigraphy;
      const gridWidth = snapshot.stratigraphy.width, gridHeight = snapshot.stratigraphy.height;
      const mask = index => material.topLayerByCell[index] >= 0;
      const texture = index => mask(index) && textureAt(index % gridWidth, Math.floor(index / gridWidth));
      const inSupport = (x, y, predicate, radius) => {
        const cellX = Math.floor(x * gridWidth / 640), cellY = Math.floor(y * gridHeight / 640);
        for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = cellX + dx, ny = cellY + dy;
          if (nx >= 0 && ny >= 0 && nx < gridWidth && ny < gridHeight
            && predicate(ny * gridWidth + nx)) return true;
        }
        return false;
      };
      const result = {};
      for (const [label, left, right, support] of [
        ['A-B', arrays[0], arrays[1], mask], ['B-C', arrays[1], arrays[2], texture]
      ]) {
        let changed = 0, changedInMask = 0, changedInOneCellBand = 0, changedOutsideOneCellBand = 0;
        let changedInTwoCellBand = 0, changedOutsideTwoCellBand = 0;
        for (let y = 0; y < 640; y += 1) for (let x = 0; x < 640; x += 1) {
          const offset = (y * 640 + x) * 4;
          if (left[offset] === right[offset] && left[offset + 1] === right[offset + 1]
            && left[offset + 2] === right[offset + 2] && left[offset + 3] === right[offset + 3]) continue;
          changed += 1;
          const cell = Math.floor(y * gridHeight / 640) * gridWidth + Math.floor(x * gridWidth / 640);
          if (support(cell)) changedInMask += 1;
          if (inSupport(x, y, support, 1)) changedInOneCellBand += 1;
          else changedOutsideOneCellBand += 1;
          if (inSupport(x, y, support, 2)) changedInTwoCellBand += 1;
          else changedOutsideTwoCellBand += 1;
        }
        result[label] = { changedPixels: changed, changedInSourceMask: changedInMask,
          changedWithinOneCellBand: changedInOneCellBand, changedOutsideOneCellBand,
          changedWithinTwoCellBand: changedInTwoCellBand, changedOutsideTwoCellBand };
      }
      return result;
    }
    async function capture(snapshot, { stillName = null, video = false, rng = null, tick: atTick = tick,
      isEndpoint = false } = {}) {
      const rngState = rng || { state: random.state(), calls: random.calls };
      const before = await stateFingerprint(snapshot, rngState);
      const fingerprints = [before], pngs = [];
      const countsBefore = JSON.stringify(counts);
      for (const renderer of renderers) {
        renderer.render(snapshot);
        fingerprints.push(await stateFingerprint(snapshot, rngState));
        if (fingerprints.at(-1) !== before || JSON.stringify(counts) !== countsBefore) {
          throw new Error(`Renderer changed state/event stream at model ${snapshot.analysis.simulationTimeMs} ms`);
        }
        pngs.push(canvases[pngs.length].toDataURL('image/png'));
      }
      const measurements = isEndpoint ? {
        nativeCanvas: canvases.map(canvas => ({ width: canvas.width, height: canvas.height })),
        materialImages: renderers.map(renderer => materialImageStats(renderer, snapshot)),
        finalPixelDiffs: pixelDiffs(snapshot)
      } : null;
      await window.__submitAntRediscoveryFrame({ videoFrameIndex: video ? frameIndex : null,
        tick: atTick, simulationTimeMs: snapshot.analysis.simulationTimeMs, fingerprints,
        pngs, stillName, measurements });
      if (video) frameIndex += 1;
      if (stillName) keyframes.push({ name: stillName, tick: atTick,
        simulationTimeMs: snapshot.analysis.simulationTimeMs, stateSha256: before });
      return before;
    }

    try {
      await capture(controller.getSnapshot(), { stillName: 'initial', video: true, rng: { state: random.state(), calls: random.calls }, tick: 0 });
      let endTick = null, birthTimeMs = null, firstBirthTick = null;
      while (tick < MAX_TICKS) {
        if (!firstPlate && controller.trailPlateBirth.candidate?.stableSeconds >= 19) {
          preBirthSnapshot = controller.getSnapshot();
          preBirthRng = { state: random.state(), calls: random.calls };
        }
        controller.tick(DT);
        tick += 1;
        if (firstPlate && birthTimeMs === null) {
          birthTimeMs = firstPlate.bornAtSimulationTimeMs;
          firstBirthTick = tick;
          if (!Number.isFinite(birthTimeMs) || !preBirthSnapshot) throw new Error('First Plate birth lacked an exact pre-state');
          if (preBirthSnapshot.stratigraphy.plates.length !== 0) throw new Error('Pre-Plate snapshot already contains material');
          const afterBirth = controller.getSnapshot();
          if (afterBirth.stratigraphy.plates.length !== 1) throw new Error('First Plate event did not add exactly one material Plate');
          if (Math.abs(afterBirth.analysis.simulationTimeMs - birthTimeMs) >= 1e-6) throw new Error('First Plate event time differs from the snapshot');
          if (Math.abs(birthTimeMs - preBirthSnapshot.analysis.simulationTimeMs - DT * 1000) >= 1e-6) {
            throw new Error('Pre-Plate snapshot is not the immediately preceding 60 Hz tick');
          }
          await capture(preBirthSnapshot, { stillName: 'pre-first-plate', rng: preBirthRng, tick: tick - 1 });
          await capture(afterBirth, { stillName: 'post-first-plate', rng: { state: random.state(), calls: random.calls }, tick });
          endTick = tick + 30 * 60;
        }
        if (firstBirthTick !== null && tick === firstBirthTick + 15 * 60) {
          await capture(controller.getSnapshot(), { stillName: 'retained-plus-15s',
            rng: { state: random.state(), calls: random.calls }, tick });
        }
        if (tick % FRAME_TICKS === 0) {
          const snapshot = controller.getSnapshot();
          await capture(snapshot, { video: true, rng: { state: random.state(), calls: random.calls }, tick });
        }
        if (endTick !== null && tick >= endTick) break;
      }
      if (endTick === null || tick !== endTick) throw new Error('First Plate was not followed to the registered +30 model-second stop');
      const endSnapshot = controller.getSnapshot();
      if (tick % FRAME_TICKS !== 0) await capture(endSnapshot, { video: true,
        rng: { state: random.state(), calls: random.calls }, tick, isEndpoint: true });
      else await capture(endSnapshot, { stillName: 'endpoint', rng: { state: random.state(), calls: random.calls }, tick, isEndpoint: true });
      if (!keyframes.some(frame => frame.name === 'endpoint')) {
        await capture(endSnapshot, { stillName: 'endpoint', rng: { state: random.state(), calls: random.calls }, tick, isEndpoint: true });
      }
      return { seed: 20261005, tickCount: tick, firstPlateTimeMs: birthTimeMs,
        endTimeMs: endSnapshot.analysis.simulationTimeMs, rng: { state: random.state(), calls: random.calls },
        eventCounts: counts, controllerDefaults: { materialLocomotionResistance: controller.materialLocomotionResistance,
          audioBridgeAttached: controller.audioBridge !== null, audioEnabled: endSnapshot.audio.enabled },
        finalSnapshotSha256: await stateFingerprint(endSnapshot, { state: random.state(), calls: random.calls }),
        keyframes };
    } finally {
      unsubscribe();
      await Promise.all(renderers.map(renderer => renderer.destroy()));
      await controller.destroy();
    }
  });
  assert.deepEqual(pageErrors, []);
  assert.equal(result.keyframes.length, 5, 'initial, pre, post, retained and endpoint stills required');
  assert.equal(result.keyframes[0].name, 'initial');
  assert.equal(result.keyframes[1].name, 'pre-first-plate');
  assert.equal(result.keyframes[2].name, 'post-first-plate');
  assert.equal(result.keyframes[3].name, 'retained-plus-15s');
  assert.equal(result.keyframes[4].name, 'endpoint');
  await page.close();

  const videoResults = {};
  for (const candidate of CANDIDATES) videoResults[candidate] = await writers[candidate].close();
  assert.ok(frameMap.length > 100, 'motion capture must contain the full early window');
  assert.ok(frameMap.every(frame => frame.unchangedAfterA && frame.unchangedAfterB && frame.unchangedAfterC));
  assert.ok(frameMap.every(frame => /^[a-f0-9]{64}$/.test(frame.sourceStateSha256)));
  assert.ok(Math.abs(result.endTimeMs - result.firstPlateTimeMs - 30000) < 1e-6);
  assert.ok(endpointMeasurements);
  const probedVideos = Object.fromEntries(await Promise.all(CANDIDATES.map(async candidate => [candidate,
    await probeVideo(ffprobe, resolve(videoDir, `candidate-${candidate.toLowerCase()}.webm`))])));
  assert.deepEqual(new Set(Object.values(probedVideos).map(video => `${video.width}x${video.height}:${video.nb_read_frames}`)).size, 1,
    'all variants need the same native frame dimensions and frame count');
  assert.ok(Object.values(probedVideos).every(video => video.width === 640 && video.height === 640));
  assert.ok(Object.values(endpointMeasurements.finalPixelDiffs).every(value => value.changedOutsideTwoCellBand === 0),
    'candidate pixel differences must stay inside material/texture resampling support');

  const frameMapCsv = ['frameIndex,videoTimeSeconds,tick,simulationTimeSeconds,simulationTimeMs,sourceStateSha256,unchangedAfterA,unchangedAfterB,unchangedAfterC',
    ...frameMap.map(frame => [frame.frameIndex, frame.videoTimeSeconds, frame.tick, frame.simulationTimeSeconds,
      frame.simulationTimeMs, frame.sourceStateSha256, frame.unchangedAfterA, frame.unchangedAfterB, frame.unchangedAfterC].join(','))].join('\n') + '\n';
  await writeFile(resolve(OUTPUT, 'frame-map.csv'), frameMapCsv);
  const baselineSourceHashes = Object.fromEntries(SOURCE_PATHS.map(path => [path,
    sha256(execFileSync('git', ['show', `${BASELINE}:${path}`], { cwd: ROOT }))]));
  const liveSourceHashes = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, sha256(await readFile(resolve(ROOT, path)))])));
  const capture = { schemaVersion: 1, baselineCommit: BASELINE, branch: BRANCH, seed: result.seed,
    productionDefaults: true, output: { width: 640, height: 640, pixelRatio: 1 },
    rendererCandidates: ['A uses AntRenderer default production presentation',
      'B uses materialPresentation=surface', 'C uses materialPresentation=textured'],
    sample: { frameTicks: FRAME_TICKS, frameRate: 10, totalTicks: result.tickCount,
      firstPlateTimeMs: result.firstPlateTimeMs, stopTimeMs: result.endTimeMs,
      stopRule: 'exactly 30 model seconds after the first controller plate-birth event',
      firstPlateAndEndpointSnapshots: result.keyframes },
    parity: { oneControllerRun: true, sameDetachedSnapshotRenderedByAThenBThenC: true,
      rendererStateMutationChecks: frameMap.every(frame => frame.unchangedAfterA && frame.unchangedAfterB && frame.unchangedAfterC),
      uniqueFrameStateSha256Count: new Set(frameMap.map(frame => frame.sourceStateSha256)).size,
      rngFinal: result.rng, eventCounts: result.eventCounts, finalSnapshotSha256: result.finalSnapshotSha256 },
    audio: { audioBridgeAttached: result.controllerDefaults.audioBridgeAttached,
      enabled: result.controllerDefaults.audioEnabled,
      boundary: 'AntController has no audio input path; its optional AudioBridge receives emitted contact/material updates. No AudioBridge, AudioEngine, worklet, or DSP capture was instantiated.' },
    measurements: endpointMeasurements,
    videoEncoding: { command: 'ffmpeg image2pipe PNG at 10 fps to libvpx-vp9 lossless WebM; no audio', videos: probedVideos },
    baselineSourceHashes, liveSourceHashes,
    tools: { node: process.version, chromium: browser.version(), ffmpeg: spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0] },
    runnerSha256: sha256(await readFile(fileURLToPath(import.meta.url))) };
  await writeFile(resolve(OUTPUT, 'capture.json'), JSON.stringify(capture, null, 2) + '\n');
  await writeFile(resolve(OUTPUT, 'pixel-measurements.json'), JSON.stringify(endpointMeasurements, null, 2) + '\n');
  await writeFile(resolve(OUTPUT, 'review.html'), reviewHtml());
  console.log(JSON.stringify({ status: 'CAPTURED', frames: frameMap.length, firstPlateTimeMs: result.firstPlateTimeMs,
    stopTimeMs: result.endTimeMs, videos: probedVideos, measurements: endpointMeasurements }, null, 2));
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
    async close() {
      child.stdin.end();
      await exited;
      return { outputPath, bytes: (await readFile(outputPath)).byteLength };
    },
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

function reviewHtml() {
  const candidates = CANDIDATES.map(candidate => {
    const lower = candidate.toLowerCase();
    return `<section><h2>${candidate}</h2><video id="video-${lower}" muted playsinline preload="metadata" src="video/candidate-${lower}.webm"></video></section>`;
  }).join('');
  const rows = [
    ['initial', 'Initial state'], ['pre-first-plate', 'Immediately before first Plate'],
    ['post-first-plate', 'Immediately after first Plate'], ['retained-plus-15s', 'First Plate +15 model seconds'],
    ['endpoint', 'First Plate +30 model seconds']
  ].map(([name, label]) => `<tr><th>${label}</th>${CANDIDATES.map(candidate =>
    `<td><img width="640" height="640" src="stills/candidate-${candidate.toLowerCase()}-${name}.png" alt="Candidate ${candidate}, ${label}"></td>`).join('')}</tr>`).join('');
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANT material rediscovery shadow — A/B/C review</title>
<style>
body{font:16px/1.4 system-ui,sans-serif;margin:24px;color:#222}main{max-width:100%;overflow-x:auto}.videos,.still-row{display:grid;grid-template-columns:repeat(3,minmax(640px,1fr));gap:16px}.videos section{min-width:640px}video{width:640px;height:640px;background:#eee}table{border-collapse:collapse;margin-top:24px}th,td{border:1px solid #bbb;padding:8px;vertical-align:top}th{position:sticky;left:0;background:#fff}img{display:block;max-width:none;height:auto}button,input{font:inherit;margin:8px 8px 8px 0}#time{width:360px}
</style>
<body><h1>Material rediscovery shadow</h1>
<p>Same production run and model-time frame map. Labels A/B/C are neutral; use the still rows for exact milestone states.</p>
<div><button id="play">Play all</button><button id="pause">Pause all</button><label>Shared seek <input id="time" type="range" min="0" max="114.2" step="0.1" value="0"></label><output id="clock">0.0 s</output></div>
<main><div class="videos">${candidates}</div>
<table><thead><tr><th>State</th>${CANDIDATES.map(candidate => `<th>${candidate}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></main>
<script>
const videos=[...document.querySelectorAll('video')],seek=document.querySelector('#time'),clock=document.querySelector('#clock');let sync=false;
document.querySelector('#play').onclick=async()=>{for(const v of videos)v.currentTime=Number(seek.value);await Promise.all(videos.map(v=>v.play()))};
document.querySelector('#pause').onclick=()=>videos.forEach(v=>v.pause());
seek.oninput=()=>{const t=Number(seek.value);for(const v of videos)v.currentTime=t;clock.value=t.toFixed(1)+' s'};
for(const v of videos)v.ontimeupdate=()=>{if(sync)return;sync=true;const t=v.currentTime;for(const other of videos)if(other!==v&&Math.abs(other.currentTime-t)>.08)other.currentTime=t;seek.value=t;clock.value=t.toFixed(1)+' s';sync=false};
</script></body></html>`;
}
