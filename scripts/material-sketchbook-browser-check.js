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
const output = resolve(process.env.SKETCHBOOK_BROWSER_OUTPUT || resolve(root, 'docs/ant/evidence/2026-11-02-material-sketchbook-v0/browser'), production ? 'production' : 'dev');
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
const skip = (name, reason, details = null) => {
  receipt.checks[name] = { skipped: true, reason, ...(details === null ? {} : { details }) };
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
    window.__sketchbookAudioNodes = { gains: [], analysers: [], splitters: [], sources: [], connections: [], gainTargets: [] };
    const audioNodeConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function(destination, ...args) {
      window.__sketchbookAudioNodes.connections.push({ source: this, destination, output: args[0] ?? 0, input: args[1] ?? 0 });
      return audioNodeConnect.call(this, destination, ...args);
    };
    if (NativeAudioContext) window.AudioContext = new Proxy(NativeAudioContext, {
      construct(target, args) {
        const audioContext = Reflect.construct(target, args, target);
        window.__sketchbookAudioContexts.push(audioContext);
        for (const [method, key] of [['createGain', 'gains'], ['createAnalyser', 'analysers'], ['createChannelSplitter', 'splitters']]) {
          const create = audioContext[method].bind(audioContext);
          audioContext[method] = (...createArgs) => {
            const node = create(...createArgs); window.__sketchbookAudioNodes[key].push(node);
            if (key === 'gains') {
              const setTarget = node.gain.setTargetAtTime.bind(node.gain);
              node.gain.setTargetAtTime = (value, startTime, timeConstant) => {
                window.__sketchbookAudioNodes.gainTargets.push({ value, startTime, timeConstant });
                return setTarget(value, startTime, timeConstant);
              };
            }
            return node;
          };
        }
        const createSource = audioContext.createBufferSource.bind(audioContext);
        audioContext.createBufferSource = () => {
          const source = createSource();
          window.__sketchbookAudioNodes.sources.push(source);
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
  const ready = await page.evaluate(() => ({ api: Boolean(window.materialSketchbook), seed: Number(document.querySelector('#seed').value), model: document.querySelector('#model').value, audioCreated: window.materialSketchbook?.audioCreated(),
    monitor: { min: Number(document.querySelector('#monitor-gain').min), max: Number(document.querySelector('#monitor-gain').max), value: Number(document.querySelector('#monitor-gain').value), label: document.querySelector('#monitor-gain-value').textContent,
      vertical: getComputedStyle(document.querySelector('#monitor-gain')).writingMode } }));
  check('sketchbook_initialization', ready.api && ready.seed === seed && ready.model === 'A' && ready.audioCreated === false, ready);
  check('monitor_gain_defaults_and_vertical_control', ready.monitor.min === 0 && ready.monitor.max === 54 && ready.monitor.value === 36
    && ready.monitor.label === '+36 dB' && ready.monitor.vertical === 'vertical-lr', ready.monitor);
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

  // AudioContext remains lazy until Listen; the gain and meter stay outside Probe and world state.
  const beforeProbeAudio = await page.evaluate(() => JSON.stringify(window.materialSketchbook.state()));
  await page.locator('#probe').click();
  check('audio_context_still_absent_before_listen', !(await page.evaluate(() => window.materialSketchbook.audioCreated())));
  const probePcmHash = await page.evaluate(() => {
    const response = window.materialSketchbook.response(0);
    return { left: Array.from(response.left), right: Array.from(response.right), sampleRate: response.sampleRate };
  }).then(response => hashSamples([...response.left, ...response.right]));
  await page.locator('#monitor-gain').evaluate(input => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  const zeroDbWarning = await page.evaluate(() => ({ label: document.querySelector('#monitor-gain-value').textContent,
    peak: window.materialSketchbook.response(0).metrics.peak,
    visible: !document.querySelector('#clip-warning').hidden,
    predictedClip: window.materialSketchbook.response(0).metrics.peak > 1 }));
  check('zero_db_readout_and_clip_prediction', zeroDbWarning.label === '0 dB' && zeroDbWarning.visible === zeroDbWarning.predictedClip, zeroDbWarning);
  await page.locator('#listen').click();
  await page.waitForTimeout(120);
  const zeroDbAudio = await page.evaluate(() => {
    const probe = window.__sketchbookAudioNodes, context = window.__sketchbookAudioContexts[0];
    const source = probe.sources[0], gain = probe.gains[0], analyser = probe.analysers[0];
    const hasConnection = (from, to) => probe.connections.some(edge => edge.source === from && edge.destination === to);
    const leftMeterAnalyser = probe.analysers[1], rightMeterAnalyser = probe.analysers[2], splitter = probe.splitters[0];
    return { contextState: context?.state, contextTime: context?.currentTime, gainValue: gain?.gain.value,
      graph: Boolean(source && gain && analyser && hasConnection(source, gain) && hasConnection(gain, analyser) && hasConnection(analyser, context.destination)),
      stereoMeterTaps: Boolean(splitter && leftMeterAnalyser && rightMeterAnalyser
        && hasConnection(gain, splitter)
        && probe.connections.some(edge => edge.source === splitter && edge.destination === leftMeterAnalyser && edge.output === 0)
        && probe.connections.some(edge => edge.source === splitter && edge.destination === rightMeterAnalyser && edge.output === 1)),
      buffer: source?.buffer && { left: Array.from(source.buffer.getChannelData(0)), right: Array.from(source.buffer.getChannelData(1)), sampleRate: source.buffer.sampleRate },
      meter: { text: document.querySelector('#peak-meter-value').textContent, height: parseFloat(document.querySelector('#peak-meter-fill').style.height) },
      audioCreated: window.materialSketchbook.audioCreated() };
  });
  const zeroDbPcmHash = zeroDbAudio.buffer && hashSamples([...zeroDbAudio.buffer.left, ...zeroDbAudio.buffer.right]);
  check('unity_gain_routes_pcm_through_gain_and_analyser', zeroDbAudio.contextState === 'running' && zeroDbAudio.gainValue === 1
    && zeroDbAudio.graph && zeroDbAudio.stereoMeterTaps && zeroDbPcmHash === probePcmHash,
  { contextState: zeroDbAudio.contextState, gainValue: zeroDbAudio.gainValue, graph: zeroDbAudio.graph, stereoMeterTaps: zeroDbAudio.stereoMeterTaps,
    pcmHash: zeroDbPcmHash, probePcmHash });
  const zeroDbWorld = await page.evaluate(() => JSON.stringify(window.materialSketchbook.state()));
  check('monitor_does_not_change_probe_or_world', beforeProbeAudio === zeroDbWorld);
  await page.waitForTimeout(1220);
  const heldZeroDbPeak = await page.locator('#peak-meter-value').textContent();
  const zeroDbClock = await page.evaluate(() => window.__sketchbookAudioContexts[0]?.currentTime || 0);
  if (zeroDbClock === 0) {
    skip('output_meter_moves_on_post_gain_signal', 'headless AudioContext clock did not advance', { heldZeroDbPeak, zeroDbClock });
    skip('peak_hold_keeps_short_probe_readable', 'headless AudioContext clock did not advance', { heldZeroDbPeak, zeroDbClock });
  } else {
    check('output_meter_moves_on_post_gain_signal', heldZeroDbPeak !== '−∞ dBFS', { heldZeroDbPeak, zeroDbClock });
    check('peak_hold_keeps_short_probe_readable', heldZeroDbPeak !== '−∞ dBFS', { heldZeroDbPeak, zeroDbClock });
  }

  await page.locator('#monitor-gain').evaluate(input => { input.value = '20'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  check('twenty_db_slider_displays_scheduled_gain', await page.evaluate(() => {
    const input = document.querySelector('#monitor-gain'), gain = window.__sketchbookAudioNodes.gains[0];
    const target = window.__sketchbookAudioNodes.gainTargets.at(-1);
    return input.value === '20' && document.querySelector('#monitor-gain-value').textContent === '+20 dB'
      && Boolean(gain) && target?.value === 10 && Math.abs(target.timeConstant - 0.01) < 1e-12
      && Math.abs(10 ** (Number(input.value) / 20) / 10 - 1) < 1e-12;
  }), await page.evaluate(() => ({ label: document.querySelector('#monitor-gain-value').textContent,
    gainValue: window.__sketchbookAudioNodes.gains[0].gain.value, target: window.__sketchbookAudioNodes.gainTargets.at(-1) })));
  await page.locator('#listen').click(); await page.waitForTimeout(1250);
  const twentyDbAudio = await page.evaluate(() => ({ peak: document.querySelector('#peak-meter-value').textContent,
    warning: !document.querySelector('#clip-warning').hidden,
    metricsPeak: window.materialSketchbook.response(0).metrics.peak,
    label: document.querySelector('#monitor-gain-value').textContent,
    setting: Number(document.querySelector('#monitor-gain').value),
    contextTime: window.__sketchbookAudioContexts[0]?.currentTime,
    buffer: { left: Array.from(window.__sketchbookAudioNodes.sources.at(-1).buffer.getChannelData(0)),
      right: Array.from(window.__sketchbookAudioNodes.sources.at(-1).buffer.getChannelData(1)) },
    gainValue: window.__sketchbookAudioNodes.gains[0].gain.value }));
  await page.screenshot({ path: resolve(output, 'captures', 'monitor-output-20db.png'), fullPage: false, animations: 'disabled' });
  const twentyDbPcmHash = hashSamples([...twentyDbAudio.buffer.left, ...twentyDbAudio.buffer.right]);
  const inputPeak = Math.max(...twentyDbAudio.buffer.left.map(Math.abs), ...twentyDbAudio.buffer.right.map(Math.abs));
  const outputPeak = inputPeak * twentyDbAudio.gainValue;
  const worldUnchangedAfterGain = beforeProbeAudio === await page.evaluate(() => JSON.stringify(window.materialSketchbook.state()));
  check('twenty_db_gainnode_applies_tenfold_pcm_amplitude', twentyDbAudio.label === '+20 dB' && twentyDbAudio.setting === 20
    && Math.abs(twentyDbAudio.gainValue - 10) < 1e-6
    && inputPeak > 0 && Math.abs(outputPeak / inputPeak - 10) < 1e-12,
  { label: twentyDbAudio.label, setting: twentyDbAudio.setting, inputPeak, gainValue: twentyDbAudio.gainValue, outputPeak, amplitudeRatio: outputPeak / inputPeak });
  check('twenty_db_clip_warning_and_unmodified_probe_pcm', twentyDbAudio.warning === (twentyDbAudio.metricsPeak * 10 > 1)
    && twentyDbAudio.peak !== '−∞ dBFS' && twentyDbPcmHash === probePcmHash && worldUnchangedAfterGain,
  { warning: twentyDbAudio.warning, predictedClip: twentyDbAudio.metricsPeak * 10 > 1, probePcmHash, twentyDbPcmHash, worldUnchangedAfterGain });
  await page.waitForTimeout(1250);
  if (twentyDbAudio.contextTime === 0) skip('playback_end_resets_peak_meter', 'headless AudioContext clock did not advance', { value: await page.locator('#peak-meter-value').textContent() });
  else check('playback_end_resets_peak_meter', await page.locator('#peak-meter-value').textContent() === '−∞ dBFS'
    && await page.locator('#peak-meter-fill').evaluate(fill => fill.style.height) === '0%', { value: await page.locator('#peak-meter-value').textContent() });

  for (const [model, samples] of [['A', [0]], ['B', [0, 1]], ['C', [0]]]) {
    await page.locator('#model').selectOption(model); await page.locator('#probe').click();
    for (const sampleIndex of samples) {
      await page.locator('#sample').selectOption(String(sampleIndex));
      const modelState = await page.evaluate(() => JSON.stringify(window.materialSketchbook.state()));
      await page.locator('#listen').click(); await page.waitForTimeout(60);
      const playback = await page.evaluate(() => {
        const nodes = window.__sketchbookAudioNodes, source = nodes.sources.at(-1), context = window.__sketchbookAudioContexts[0];
        const index = Number(document.querySelector('#sample').value), response = window.materialSketchbook.response(index);
        return { model: document.querySelector('#model').value, index, label: document.querySelector('#monitor-gain-value').textContent,
          gainSetting: Number(document.querySelector('#monitor-gain').value), gainValue: nodes.gains[0]?.gain.value,
          gainCount: nodes.gains.length, contextCount: window.__sketchbookAudioContexts.length,
          routed: nodes.connections.some(edge => edge.source === source && edge.destination === nodes.gains[0]),
          pcm: { left: Array.from(source.buffer.getChannelData(0)), right: Array.from(source.buffer.getChannelData(1)) },
          response: { left: Array.from(response.left), right: Array.from(response.right) }, state: JSON.stringify(window.materialSketchbook.state()),
          contextRunning: context?.state === 'running' };
      });
      const samePcm = hashSamples([...playback.pcm.left, ...playback.pcm.right]) === hashSamples([...playback.response.left, ...playback.response.right]);
      check(`${model}_sample${sampleIndex}_uses_shared_monitor_gain`, playback.model === model && playback.index === sampleIndex && playback.label === '+20 dB'
        && playback.gainSetting === 20 && playback.gainCount === 1 && playback.contextCount === 1
        && playback.routed && playback.contextRunning && samePcm && playback.state === modelState,
      { model: playback.model, sampleIndex: playback.index, gain: playback.label, gainValue: playback.gainValue,
        gainCount: playback.gainCount, contextCount: playback.contextCount, routed: playback.routed, samePcm, worldUnchanged: playback.state === modelState });
    }
  }

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

const failed = Object.entries(receipt.checks).filter(([, result]) => result.pass === false);
const skipped = Object.entries(receipt.checks).filter(([, result]) => result.skipped);
console.log(JSON.stringify({ output, checks: Object.keys(receipt.checks).length, skipped, failed, errors: receipt.errors.length }, null, 2));
if (failed.length || receipt.errors.length) process.exitCode = 1;
