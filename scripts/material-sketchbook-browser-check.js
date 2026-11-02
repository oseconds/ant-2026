import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const seed = 20261005;
const points = [0, 30, 120, 300];
const production = process.argv.includes('--production');
const output = resolve(root, 'docs/ant/evidence/2026-11-02-material-sketchbook-v0/browser', production ? 'production' : 'dev');
if (!process.argv.includes('--record')) {
  console.error('Pass --record to write browser evidence.');
  process.exit(2);
}

await mkdir(resolve(output, 'captures'), { recursive: true });
await mkdir(resolve(output, 'records'), { recursive: true });
const receipt = {
  run: { mode: production ? 'production-preview' : 'vite-dev', seed, simulationSeconds: points, viewport: { width: 1280, height: 1100 }, chromePath },
  checks: {}, errors: [], models: {},
};
let server;
let browser;
const errors = [];
const hashJson = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hashSamples = samples => {
  const pcm = Buffer.allocUnsafe(samples.length * 4);
  samples.forEach((sample, index) => pcm.writeFloatLE(sample, index * 4));
  return createHash('sha256').update(pcm).digest('hex');
};
const finite = value => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  if (value && typeof value === 'object') return Object.values(value).every(finite);
  return true;
};
const json = value => JSON.parse(JSON.stringify(value));
const check = (name, pass, details = null) => {
  receipt.checks[name] = { pass: Boolean(pass), ...(details === null ? {} : { details }) };
  assert.ok(pass, `${name}${details ? `: ${JSON.stringify(details)}` : ''}`);
};

try {
  const viteConfig = { configFile: false, root, base: '/ant-2026/', publicDir: 'static' };
  if (production) server = await preview({ ...viteConfig, preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  else server = await createServer({ ...viteConfig, server: { host: '127.0.0.1', port: 0, strictPort: false } });
  if (!production) await server.listen();
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}/ant-2026/`;
  browser = await chromium.launch({ headless: true, executablePath: chromePath });
  receipt.run.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1, acceptDownloads: true });
  await context.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.__sketchbookAudioContexts = [];
    if (NativeAudioContext) window.AudioContext = new Proxy(NativeAudioContext, {
      construct(target, args) {
        const audioContext = Reflect.construct(target, args, target);
        window.__sketchbookAudioContexts.push(audioContext);
        const createSource = audioContext.createBufferSource.bind(audioContext);
        audioContext.createBufferSource = () => {
          const source = createSource();
          const start = source.start.bind(source);
          source.start = (...startArgs) => {
            window.__sketchbookAudioStarts.push({ state: audioContext.state, buffer: source.buffer });
            return start(...startArgs);
          };
          return source;
        };
        return audioContext;
      },
    });
    window.__sketchbookAudioStarts = [];
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ type: 'console', page: 'sketchbook', message: message.text(), location: message.location() }); });
  page.on('response', response => { if (response.status() >= 400) errors.push({ type: 'http-response', page: 'sketchbook', status: response.status(), url: response.url() }); });
  await page.goto(`${base}material-sketchbook.html`, { waitUntil: 'networkidle' });
  await page.locator('#world').waitFor();
  const api = page.locator('body');
  const ready = await page.evaluate(() => ({ api: Boolean(window.materialSketchbook), seed: Number(document.querySelector('#seed').value), model: document.querySelector('#model').value, audioCreated: window.materialSketchbook?.audioCreated() }));
  check('sketchbook_initialization', ready.api && ready.seed === seed && ready.model === 'A' && ready.audioCreated === false, ready);
  const initialCanvas = await page.locator('#world').evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
  check('fixed_canvas_dimensions', initialCanvas.width === 1200 && initialCanvas.height === 520, initialCanvas);

  // Exercise the real run/pause loop before using the deterministic fixed-step API.
  await page.locator('#run').click();
  await page.waitForTimeout(180);
  await page.locator('#run').click();
  const paused = await page.evaluate(() => ({ running: window.materialSketchbook.running(), tick: window.materialSketchbook.state().tick }));
  await page.waitForTimeout(150);
  const pausedLater = await page.evaluate(() => window.materialSketchbook.state().tick);
  check('run_pause_holds_tick', !paused.running && paused.tick === pausedLater && paused.tick > 0, { paused, pausedLater });
  await page.locator('#reset').click();
  check('reset_returns_to_initial_tick', await page.evaluate(() => window.materialSketchbook.state().tick === 0));

  for (const model of ['A', 'B', 'C']) {
    await page.locator('#model').selectOption(model);
    await page.locator('#diagnostic').uncheck();
    await page.locator('#seed').fill(String(seed));
    await page.locator('#reset').click();
    check(`switch_${model}_fresh_world`, await page.evaluate(() => window.materialSketchbook.state().tick === 0 && window.materialSketchbook.state().seed === 20261005));
    const modelEvidence = { checkpoints: {}, diagnosticsAt120: null };
    let priorTick = 0;
    for (const second of model === 'B' ? [0, 30, 40, 120, 300] : points) {
      const targetTick = second * 60;
      const record = await page.evaluate(ticks => window.materialSketchbook.advance(ticks), targetTick - priorTick);
      priorTick = targetTick;
      const displayedTime = await page.locator('#time').textContent();
      check(`${model}_${second}s_exact_checkpoint`, record.tick === targetTick && displayedTime === `${second.toFixed(3)} s`, { expectedTick: targetTick, recordTick: record.tick, displayedTime });
      const observation = await page.evaluate(() => {
        const before = JSON.stringify(window.materialSketchbook.state());
        const metrics = window.materialSketchbook.probe();
        const after = JSON.stringify(window.materialSketchbook.state());
        const responses = [0, 1].map(index => {
          const response = window.materialSketchbook.response(index);
          if (!response) return null;
          return { sampleRate: response.sampleRate, timeScale: response.timeScale, left: Array.from(response.left), right: Array.from(response.right), metrics: response.metrics };
        }).filter(Boolean);
        return { state: window.materialSketchbook.state(), view: window.materialSketchbook.view(), metrics, probeUnchanged: before === after, responses };
      });
      check(`${model}_${second}s_probe_is_observer`, observation.probeUnchanged, { model, second });
      check(`${model}_${second}s_finite`, finite(observation.state) && finite(observation.view) && finite(observation.metrics) && observation.responses.every(finite));
      const responseMetrics = observation.responses.map((response, index) => {
        const peak = Math.max(response.metrics.peak, ...response.left.map(Math.abs), ...response.right.map(Math.abs));
        check(`${model}_${second}s_response${index}_finite_bounded`, Number.isFinite(peak) && peak <= 1, { peak, responseMetrics: response.metrics });
        return { sampleRate: response.sampleRate, timeScale: response.timeScale, sampleCount: response.left.length, metrics: response.metrics, pcmSha256: hashSamples([...response.left, ...response.right]) };
      });
      if (model === 'B') {
        const geometry = await page.evaluate(() => window.materialSketchbook.graphs().map(graph => ({ positions: graph.positions, masses: graph.masses })));
        check(`B_${second}s_two_samples_same_geometry`, geometry.length === 2 && hashJson(geometry[0]) === hashJson(geometry[1]), { geometryEqual: geometry.length === 2 && hashJson(geometry[0]) === hashJson(geometry[1]) });
        if (second === 40) {
          const differences = ['left', 'right'].flatMap(channel => observation.responses[0][channel].map((value, index) => value - observation.responses[1][channel][index]));
          const rms = Math.sqrt(differences.reduce((sum, value) => sum + value * value, 0) / differences.length);
          const maxAbs = Math.max(...differences.map(Math.abs));
          modelEvidence.B40sComparison = { samples: ['AB', 'BA'], equalGeometry: true, stereoPcmRmsDifference: rms, stereoPcmMaxAbsDifference: maxAbs };
        }
      }
      const pointName = `${String(second).padStart(3, '0')}s`;
      const checkpoint = { model, seconds: second, tick: record.tick, displayedTime, stateSha256: hashJson(observation.state), view: observation.view, probe: responseMetrics, state: observation.state };
      modelEvidence.checkpoints[pointName] = checkpoint;
      await writeFile(resolve(output, 'captures', `${model}-${pointName}.json`), `${JSON.stringify(checkpoint, null, 2)}\n`);
      await page.screenshot({ path: resolve(output, 'captures', `${model}-${pointName}.png`), fullPage: false, animations: 'disabled' });
      if (second === 120) {
        await page.locator('#diagnostic').check();
        await page.screenshot({ path: resolve(output, 'captures', `${model}-${pointName}-diagnostic.png`), fullPage: false, animations: 'disabled' });
        await page.locator('#diagnostic').uncheck();
        modelEvidence.diagnosticsAt120 = 'captured';
      }
    }
    receipt.models[model] = modelEvidence;
  }

  // Rebuild every declared checkpoint from a fresh instance and compare full state and probe PCM hashes.
  receipt.deterministicReruns = {};
  for (const model of ['A', 'B', 'C']) {
    receipt.deterministicReruns[model] = {};
    const modelPoints = model === 'B' ? [0, 30, 40, 120, 300] : points;
    for (const second of modelPoints) {
      await page.evaluate(({ modelId, runSeed, ticks }) => {
        window.materialSketchbook.select(modelId, runSeed);
        window.materialSketchbook.advance(ticks);
      }, { modelId: model, runSeed: seed, ticks: second * 60 });
      const rerun = await page.evaluate(() => {
        const state = window.materialSketchbook.state();
        const responses = window.materialSketchbook.probe().map((metrics, index) => {
          const response = window.materialSketchbook.response(index);
          return { metrics, left: Array.from(response.left), right: Array.from(response.right) };
        });
        return { state, responses };
      });
      const stateSha256 = hashJson(rerun.state);
      const pcmSha256 = rerun.responses.map(response => hashSamples([...response.left, ...response.right]));
      const expected = receipt.models[model].checkpoints[`${String(second).padStart(3, '0')}s`];
      const expectedPcm = expected.probe.map(item => item.pcmSha256);
      const stateMatch = stateSha256 === expected.stateSha256;
      const pcmMatch = JSON.stringify(pcmSha256) === JSON.stringify(expectedPcm);
      receipt.deterministicReruns[model][`${second}s`] = { stateSha256, pcmSha256, stateMatch, pcmMatch };
      check(`${model}_${second}s_fresh_seed_rerun_matches`, stateMatch && pcmMatch, { stateMatch, pcmMatch, stateSha256, pcmSha256, expectedStateSha256: expected.stateSha256, expectedPcm });
    }
  }

  // Seed reset must reproduce the identical initial state after prior evolution.
  await page.locator('#model').selectOption('A');
  await page.locator('#seed').fill(String(seed));
  await page.locator('#reset').click();
  const baseline = await page.evaluate(() => window.materialSketchbook.state());
  await page.evaluate(() => window.materialSketchbook.advance(90));
  await page.locator('#reset').click();
  const resetState = await page.evaluate(() => window.materialSketchbook.state());
  check('seed_reset_reproduces_initial_state', hashJson(baseline) === hashJson(resetState), { sha256: hashJson(resetState) });

  await page.evaluate(() => window.materialSketchbook.select('B', 20261005));
  const capRecord = await page.evaluate(() => window.materialSketchbook.advance(216000));
  const atCapHash = hashJson(capRecord.state);
  let overCapRejected = false;
  try { await page.evaluate(() => window.materialSketchbook.advance(216001)); } catch (error) { overCapRejected = /Observation limit: one hour/.test(error.message); }
  const postCapState = await page.evaluate(() => window.materialSketchbook.state());
  check('one_hour_limit_accepts_boundary_and_rejects_overrun', capRecord.tick === 216000 && overCapRejected && postCapState.tick === 216000 && hashJson(postCapState) === atCapHash, { capTick: capRecord.tick, overCapRejected, postTick: postCapState.tick, stateSha256: atCapHash });

  // Validate exact record restore, actual download and actual file input upload.
  await page.locator('#model').selectOption('B');
  await page.locator('#seed').fill(String(seed));
  await page.locator('#reset').click();
  await page.evaluate(() => window.materialSketchbook.advance(1800));
  const expected = await page.evaluate(() => window.materialSketchbook.record());
  await page.evaluate(() => window.materialSketchbook.select('C', 20261005));
  await page.evaluate(() => window.materialSketchbook.advance(10));
  const restored = await page.evaluate(record => window.materialSketchbook.restore(record), expected);
  check('api_record_restore_full_state', hashJson(restored.state) === hashJson(expected.state), { stateSha256: hashJson(restored.state) });
  const currentBeforeTamper = await page.evaluate(() => window.materialSketchbook.state());
  const tampered = json(expected); tampered.digest = tampered.digest === '00000000' ? '00000001' : '00000000';
  let rejected = false;
  try { await page.evaluate(record => window.materialSketchbook.restore(record), tampered); } catch (error) { rejected = /Full-state replay mismatch/.test(error.message); }
  const currentAfterTamper = await page.evaluate(() => window.materialSketchbook.state());
  check('tampered_record_rejected_preserves_world', rejected && hashJson(currentBeforeTamper) === hashJson(currentAfterTamper), { rejected, stateSha256: hashJson(currentAfterTamper) });
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#record').click()]);
  const recordPath = resolve(output, 'records', download.suggestedFilename());
  await download.saveAs(recordPath);
  const downloadedText = await (await import('node:fs/promises')).readFile(recordPath, 'utf8');
  const downloaded = JSON.parse(downloadedText);
  check('actual_record_download', downloaded.schema === expected.schema && hashJson(downloaded.state) === hashJson(expected.state), { file: `records/${download.suggestedFilename()}`, stateSha256: hashJson(downloaded.state) });
  await page.evaluate(() => window.materialSketchbook.select('A', 99));
  await page.evaluate(() => window.materialSketchbook.advance(2));
  await page.locator('#replay').setInputFiles(recordPath);
  await page.getByText(/Full-state verified/).waitFor();
  const uploadedState = await page.evaluate(() => window.materialSketchbook.state());
  check('actual_file_upload_restore', hashJson(uploadedState) === hashJson(expected.state), { stateSha256: hashJson(uploadedState) });

  // AudioContext must remain absent until this real user-gesture click.
  await page.locator('#probe').click();
  check('audio_context_still_absent_before_listen', !(await page.evaluate(() => window.materialSketchbook.audioCreated())));
  await page.locator('#listen').click();
  await page.waitForTimeout(100);
  const audio = await page.evaluate(() => {
    const started = window.__sketchbookAudioStarts[0], response = window.materialSketchbook.response(0);
    return {
      created: window.materialSketchbook.audioCreated(),
      states: window.__sketchbookAudioContexts.map(audioContext => audioContext.state),
      started: Boolean(started),
      startContextState: started?.state,
      buffer: started && { channels: started.buffer.numberOfChannels, length: started.buffer.length, sampleRate: started.buffer.sampleRate,
        left: Array.from(started.buffer.getChannelData(0)), right: Array.from(started.buffer.getChannelData(1)) },
      response: response && { sampleRate: response.sampleRate, left: Array.from(response.left), right: Array.from(response.right) },
    };
  });
  const audioBufferMatches = audio.started && audio.buffer.channels === 2 && audio.buffer.length === audio.response.left.length
    && audio.buffer.sampleRate === audio.response.sampleRate
    && hashSamples([...audio.buffer.left, ...audio.buffer.right]) === hashSamples([...audio.response.left, ...audio.response.right]);
  check('audio_context_running_and_matching_pcm_started_after_gesture', audio.created && audio.states.length === 1 && audio.states[0] === 'running'
    && audio.started && audio.startContextState === 'running' && audioBufferMatches,
  { created: audio.created, states: audio.states, started: audio.started, startContextState: audio.startContextState,
    buffer: audio.buffer && { channels: audio.buffer.channels, length: audio.buffer.length, sampleRate: audio.buffer.sampleRate },
    response: audio.response && { sampleRate: audio.response.sampleRate, length: audio.response.left.length }, audioBufferMatches,
    pcmSha256: audio.buffer && hashSamples([...audio.buffer.left, ...audio.buffer.right]), status: await page.locator('#status').textContent() });

  // The old ANT entry only gets a load check here, not behavior review.
  const oldPage = await context.newPage();
  oldPage.on('pageerror', error => errors.push({ type: 'old-entry-pageerror', message: error.message }));
  oldPage.on('console', message => { if (message.type() === 'error') errors.push({ type: 'old-entry-console', message: message.text(), location: message.location() }); });
  oldPage.on('response', response => { if (response.status() >= 400) errors.push({ type: 'http-response', page: 'original-ant', status: response.status(), url: response.url() }); });
  await oldPage.goto(base, { waitUntil: 'networkidle' });
  check('original_ant_entry_loads', await oldPage.locator('body').evaluate(body => body.innerText.length > 0 && document.readyState === 'complete'));
  receipt.errors = errors;
  check('no_browser_errors', errors.length === 0, errors);
} catch (error) {
  receipt.errors = [...errors, { type: 'check-failure', message: error.stack || error.message }];
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  await writeFile(resolve(output, 'summary.json'), `${JSON.stringify(receipt, null, 2)}\n`);
}

const failed = Object.entries(receipt.checks).filter(([, result]) => !result.pass);
console.log(JSON.stringify({ output: `docs/ant/evidence/2026-11-02-material-sketchbook-v0/browser/${production ? 'production' : 'dev'}`, checks: Object.keys(receipt.checks).length, failed, errors: receipt.errors.length }, null, 2));
if (failed.length || receipt.errors.length) process.exitCode = 1;
