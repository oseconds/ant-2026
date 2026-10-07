import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { gunzipSync, gzipSync } from 'node:zlib';
import { decodeStereoFloatWav } from './stratigraphy-audio-overview.js';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';
import { SURFACE_SOURCE_GRID, SURFACE_SOLVER_GRID } from '../src/lib/audio/compileSurfaceTopology.js';

const audioRoot = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/audio');
const prior = JSON.parse(await readFile(resolve(audioRoot, 'audio-ab-report.json')));
const priorMix = JSON.parse(await readFile(resolve(audioRoot, 'mix-audibility/mix-ab-report.json')));
const frozenBytes = await readFile(resolve(audioRoot, prior.sourceRun.eventStreamFile));
assert.equal(sha(frozenBytes), prior.sourceRun.gzipSha256, 'frozen seed input hash');
const frozen = JSON.parse(gunzipSync(frozenBytes));
const baselinePcmPath = resolve(audioRoot, 'mix-audibility/A-baseline-born-only-10s-48khz-f32.wav');
const baselinePcmBytes = await readFile(baselinePcmPath);
assert.equal(sha(baselinePcmBytes), priorMix.comparison.A.pcmSha256, 'baseline PCM hash');
assert.equal(priorMix.comparison.A.exactPcmMatchToPriorFrozenA, true, 'baseline PCM matches frozen capture');
const baselinePcm = decodeStereoFloatWav(baselinePcmBytes);
assert.equal(baselinePcm.sampleRate, 48000);
assert.equal(baselinePcm.sampleCount, 480000);

const fresh = await captureFrozenGeometry();
let browser, server;
try {
  const { recording, firstBirth, plate, topology, surfaceGain } = fresh;
  const regenerated = gzipSync(Buffer.from(JSON.stringify(recording)));
  assert.equal(sha(regenerated), prior.sourceRun.gzipSha256, 'regenerated first-birth input hash');
  assert.deepEqual(recording, frozen, 'regenerated event input equals the frozen source');
  assert.equal(sha(JSON.stringify(firstBirth)), prior.sourceRun.firstPlateDescriptorSha256, 'frozen P1 descriptor');
  assert.equal(firstBirth.id, 'trail-plate-1');
  assert.equal(firstBirth.bornAtSimulationTimeMs / 1000, 103.01666666667376);
  assert.deepEqual(topology.layerIds, ['trail-plate-1']);
  assert.equal((topology.noduleIds || []).length, 0, 'P1 topology has no Sphere/nodule readout');
  assert.equal(surfaceGain, priorMix.settings.surfaceGain, 'frozen born-Plate output gain');

  const startMs = firstBirth.bornAtSimulationTimeMs;
  const naturalStrikes = recording.bornStrikes
    .filter(row => row.simulationTimeMs >= startMs && row.simulationTimeMs < startMs + 10000)
    .map(row => ({ frame: toFrame(row.simulationTimeMs, startMs), simulationTimeMs: row.simulationTimeMs,
      payload: row.payload }))
    .sort((a, b) => a.frame - b.frame);
  const frozenSchedule = prior.sourceEvents.schedules.postbirthBorn;
  assert.equal(naturalStrikes.length, 63);
  assert.deepEqual(naturalStrikes.map(({ frame, payload }) => ({ frame, payload })), frozenSchedule,
    'all 63 accepted P1 strikes match the frozen schedule');

  const compiledPickups = [0, 1].map(side => {
    const node = topology.pickupNodeIndices[side], cell = topology.nodeGridIndices[node];
    return { node, cell, x: (cell % SURFACE_SOLVER_GRID) / (SURFACE_SOLVER_GRID - 1),
      y: Math.floor(cell / SURFACE_SOLVER_GRID) / (SURFACE_SOLVER_GRID - 1) };
  });
  const testPoints = makeTestPoints(plate, topology, compiledPickups);
  for (const point of testPoints) assert.equal(routeLayer(topology, point.position), 0, `${point.label} must route to P1`);

  const strikeRows = naturalStrikes.map((strike, index) => {
    const distanceL = distance(strike.payload.position, compiledPickups[0]);
    const distanceR = distance(strike.payload.position, compiledPickups[1]);
    return { index: index + 1, frame: strike.frame, simulationTimeMs: strike.simulationTimeMs,
      position: strike.payload.position, strength: strike.payload.strength,
      distanceToPickupL: distanceRecord(distanceL), distanceToPickupR: distanceRecord(distanceR),
      windows: Object.fromEntries([100, 250, 500].map(durationMs => [durationMs,
        strike.frame + durationMs * 48 <= baselinePcm.sampleCount
          ? measureWindow(baselinePcm, strike.frame, durationMs * 48) : null])) };
  });
  const distanceCorrelations = summarizeCorrelations(strikeRows);
  const controlTemplate = naturalStrikes[0].payload;
  const controlReports = [];

  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end('<!doctype html><title>ANT PCM evidence</title>'); return;
      }
      const file = resolve(process.cwd(), `.${pathname}`), rel = relative(process.cwd(), file);
      if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) { response.writeHead(403); response.end(); return; }
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream' });
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen);
  });
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
  const workletSource = await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');
  assert.equal(sha(workletSource), priorMix.comparison.A.workletSha256, 'current production A worklet hash');
  const instrumentedSource = instrumentSurface(workletSource);

  for (const point of testPoints) {
    const payload = { ...controlTemplate, plateId: firstBirth.id, layerId: firstBirth.id,
      position: point.position };
    const captured = await captureOne(page, { source: instrumentedSource, topology, payload, surfaceGain });
    const bytes = Buffer.from(captured.wav, 'base64');
    const pcm = decodeStereoFloatWav(bytes);
    assert.equal(pcm.sampleRate, 48000);
    assert.equal(pcm.sampleCount, 480000);
    const metrics = measureWindow(pcm, 0, pcm.sampleCount);
    const windows = Object.fromEntries([100, 250, 500].map(durationMs => [durationMs,
      measureWindow(pcm, 480, durationMs * 48)]));
    const file = `${point.key}-10s-48khz-f32.wav`;
    assert.equal(metrics.nonFiniteSamples, 0, `${point.label} PCM finite`);
    assert.ok(metrics.peakMax < 1, `${point.label} PCM remains below full scale`);
    assert.equal(captured.done.diagnostics?.dropped, 0, `${point.label} has no dropped messages`);
    controlReports.push({ ...point, payload: { plateId: payload.plateId, layerId: payload.layerId,
      strength: payload.strength, footprintRadius: payload.footprintRadius, hardness: payload.hardness },
      distanceToPickupL: distanceRecord(distance(point.position, compiledPickups[0])),
      distanceToPickupR: distanceRecord(distance(point.position, compiledPickups[1])),
      requestedFrame: 480, requestedSimulationTimeMs: startMs + 10,
      acceptedStrikeCount: captured.done.strikes, diagnostics: captured.done.diagnostics,
      windows, fullWindow: metrics, pcm: { file, sha256: sha(bytes), bytes: bytes.length },
      wav: captured.wav });
    await writeFile(resolve(await ensureOut(), file), bytes);
  }

  const equalControlInputs = controlReports.every(row => row.payload.strength === controlTemplate.strength
    && row.payload.footprintRadius === controlTemplate.footprintRadius
    && row.payload.hardness === controlTemplate.hardness);
  assert.ok(equalControlInputs, 'all six controls must share exact strength, footprint and hardness');
  const visualRows = await renderControls({ page, rows: controlReports, startMs });
  const report = {
    status: 'frozen-P1-pickup-distance-readout-diagnostic',
    decisionScope: 'Measure frozen pickup distances/readout only. No production DSP, strike, material, routing, substrate or simulation changes.',
    source: { seed: recording.seed, inputFile: prior.sourceRun.eventStreamFile,
      inputGzipSha256: sha(regenerated), inputDeepEqualToFrozen: true,
      firstPlateId: firstBirth.id, firstPlateBirthSeconds: startMs / 1000,
      firstPlateDescriptorSha256: sha(JSON.stringify(firstBirth)), acceptedP1Strikes: naturalStrikes.length,
      frozenScheduleSha256: sha(JSON.stringify(frozenSchedule)), baselinePcm: {
        file: 'mix-audibility/A-baseline-born-only-10s-48khz-f32.wav', sha256: sha(baselinePcmBytes),
        exactPriorFrozenCapture: true, workletSha256: sha(workletSource), surfaceGain } },
    topology: { grid: { source: SURFACE_SOURCE_GRID, solver: SURFACE_SOLVER_GRID },
      layerIds: topology.layerIds, p1NodeCount: topology.nodeOffsets[1] - topology.nodeOffsets[0],
      compiledPickups: compiledPickups.map((pickup, index) => ({ label: index === 0 ? 'L' : 'R', ...pickup })),
      controlStrike: { strength: controlTemplate.strength, footprintRadius: controlTemplate.footprintRadius,
        hardness: controlTemplate.hardness, referenceStrikeSimulationTimeMs: naturalStrikes[0].simulationTimeMs,
        allSixEqualStrengthFootprintAndHardness: equalControlInputs } },
    natural63StrikeReadout: { pcm: 'unchanged frozen A baseline PCM; 48 kHz / 10 s',
      windows: '[strike frame, strike frame + duration), incomplete tail windows excluded',
      note: 'These windows are output measurements of the original overlapping 63-strike run; they are not isolated single-strike responses.',
      strikes: strikeRows, correlations: distanceCorrelations },
    controlledEqualStrengthStrikes: controlReports.map(({ wav, ...row }) => row),
    clockMapping: { naturalAudioStartSimulationMs: startMs, naturalAudioEndSimulationMs: startMs + 10000,
      naturalRequestedFrame: 'round((strikeSimulationTimeMs - firstPlateBirthMs) * 48)',
      controlBirthMarkerSimulationMs: startMs, controlStrikeSimulationMs: startMs + 10,
      controlStrikeAudioFrame: 480, sampleRate: 48000, samplesPerChannel: 480000 },
    capture: { browser: browser.version(), engine: 'OfflineAudioContext with the unchanged production-A AudioWorklet source' },
    renderer: { source: 'existing ANT fixed-scale stratigraphy overview and audio snapshot renderers',
      waveformAmplitude: [-1, 1], channelMode: 'separate L/R', fftSize: 1024, window: 'Hann', hopSize: 256,
      frequencyHz: [0, 8000], dbfs: [-100, 0], grayscaleGamma: 1, normalization: 'none; fixed-scale',
      birthMarker: 'P1 at simulation start', contactMarker: 'one synthetic control-strike FOOT_CONTACT marker at +10 ms',
      images: visualRows },
    productionState: { unchanged: true, workletSha256: sha(workletSource),
      sourceDiff: false, contactPulseMs: 3, recoveryMs: 75, plateDampingMultiplier: 50,
      substrateSettingsChanged: false }
  };
  const out = await ensureOut();
  for (const row of controlReports) delete row.wav;
  await writeFile(resolve(out, 'pickup-distance-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ out, frozenSchedule: naturalStrikes.length,
    naturalCorrelations: distanceCorrelations.map(row => ({ windowMs: row.windowMs,
      pickupLToLeftRms: row.pickupL.distanceVsLeftRms.spearmanRho,
      pickupRToRightRms: row.pickupR.distanceVsRightRms.spearmanRho,
      nearestToPooledRms: row.nearest.distanceVsPooledRms.spearmanRho })),
    controls: report.controlledEqualStrengthStrikes.map(row => ({ label: row.label,
      dLCells: row.distanceToPickupL.solverGridCells, dRCells: row.distanceToPickupR.solverGridCells,
      rms100ms: row.windows[100].pooledRms, rms250ms: row.windows[250].pooledRms,
      rms500ms: row.windows[500].pooledRms, peak: row.fullWindow.peakMax })),
    images: visualRows.map(image => image.file) }, null, 2));
} finally {
  await fresh.controller.destroy();
  await browser?.close();
  await server?.close();
}

async function captureFrozenGeometry() {
  const seed = 20261005;
  let rngState = seed >>> 0, rngCalls = 0, currentMs = 0, firstBirth = null;
  const contacts = [], legacyStrikes = [], bornStrikes = [];
  const audioEngine = { context: { currentTime: 0 }, async createWorklet(name, _url, _config, _onMessage, _onError, output = {}) {
    const gain = { value: output.gain ?? 1, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; },
      linearRampToValueAtTime(value) { this.value = value; } };
    return { node: { port: { onmessage: null, postMessage(message) {
      if (name === 'surface-plate-processor' && message?.type === 'strike') bornStrikes.push({ simulationTimeMs: currentMs, payload: message.payload });
    }, close() {} }, addEventListener() {}, removeEventListener() {} }, gainNode: { gain }, disconnect() {} };
  } };
  const audioBridge = new AntEnvironmentAudioBridge({ audioEngine });
  const controller = new AntController({ random: () => {
    rngCalls++; rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 0x100000000;
  }, audioBridge, state: { audioExperiment: { mode: 'bornSurface', baseSubstrate: true } } });
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'plate-birth' && !firstBirth) firstBirth = payload;
  });
  try {
    await controller.init(); controller.setAudioVolume(0.35); await controller.setAudioEnabled(true);
    assert.ok(audioBridge.legacy.plate && audioBridge.surface.worklet);
    const originalHandle = audioBridge.handleFootContact.bind(audioBridge);
    audioBridge.handleFootContact = (event, context) => {
      currentMs = event.simulationTimeMs;
      contacts.push({ simulationTimeMs: currentMs, payload: event, responses: context.responses });
      return originalHandle(event, context);
    };
    audioBridge.legacy.plate.strike = async payload => { legacyStrikes.push({ simulationTimeMs: currentMs, payload }); return true; };
    while (controller.simulationTimeMs < 120000 && (!firstBirth
      || controller.simulationTimeMs < firstBirth.bornAtSimulationTimeMs + 10000)) controller.tick(1 / 60);
    assert.ok(firstBirth && controller.simulationTimeMs >= firstBirth.bornAtSimulationTimeMs + 9999);
    const plate = controller.trailPlateBirth.getPlates()[0];
    assert.equal(plate.id, firstBirth.id);
    return { controller, firstBirth, plate, topology: structuredClone(audioBridge.surface.topology),
      surfaceGain: audioBridge.surface.worklet.gainNode.gain.value,
      recording: { seed, simulationDurationSeconds: controller.simulationTimeMs / 1000, rngCalls,
        finalRngState: rngState, contacts, legacyStrikes, bornStrikes } };
  } catch (error) { unsubscribe(); await controller.destroy(); throw error; }
  finally { unsubscribe(); }
}

function makeTestPoints(plate, topology, pickups) {
  const midpoint = { x: (pickups[0].x + pickups[1].x) / 2, y: (pickups[0].y + pickups[1].y) / 2 };
  const branchDegrees = new Map();
  for (const [a, b] of plate.edges) {
    branchDegrees.set(a, (branchDegrees.get(a) || 0) + 1);
    branchDegrees.set(b, (branchDegrees.get(b) || 0) + 1);
  }
  const branches = [...branchDegrees].filter(([, degree]) => degree > 2).map(([index, degree]) => {
    const position = sourceGridPosition(index);
    return { index, degree, position,
      nearestPickupDistance: Math.min(...pickups.map(pickup => distance(position, pickup))) };
  }).sort((a, b) => b.nearestPickupDistance - a.nearestPickupDistance || a.index - b.index);
  assert.ok(branches.length, 'P1 has a graph branch point');
  const points = [
    { key: 'pickup-L', label: 'Directly on compiled pickup L', position: { x: pickups[0].x, y: pickups[0].y } },
    { key: 'pickup-R', label: 'Directly on compiled pickup R', position: { x: pickups[1].x, y: pickups[1].y } },
    { key: 'pickup-midpoint', label: 'Midpoint between compiled pickups', position: midpoint },
    { key: 'near-source', label: 'Near P1 source (descriptor source)', position: { x: plate.source.x, y: plate.source.y } },
    { key: 'near-target', label: 'Near P1 target (descriptor target)', position: { x: plate.target.x, y: plate.target.y } },
    { key: 'farthest-branch', label: 'Valid P1 branch farthest from both pickups',
      position: branches[0].position, branchIndex: branches[0].index, branchDegree: branches[0].degree }
  ];
  for (const point of points) assert.equal(routeLayer(topology, point.position), 0,
    `${point.label} must be inside the frozen P1 routed mask`);
  return points;
}

function instrumentSurface(source) {
  source = source.replace(/\r\n/g, '\n');
  const replaceOnce = (before, after) => {
    assert.equal(source.split(before).length - 1, 1, `one instrumentation anchor: ${before.slice(0, 50)}`);
    source = source.replace(before, after);
  };
  replaceOnce('  constructor() {', '  constructor(options) {');
  replaceOnce('    super();', '    super(); const schedule=options.processorOptions.evidenceSchedule; this.__evFrame=0; this.__evEnd=schedule.endFrame; this.__evEvents=schedule.events; this.__evCursor=0; this.__evDone=false; this.__evReady=false;');
  replaceOnce('    this.port.onmessage = (event) => this.handleMessage(event.data);',
    '    this.port.onmessage = (event) => this.handleMessage(event.data);\n    this.handleMessage({type:\'topology\',payload:options.processorOptions.evidenceTopology});');
  replaceOnce('    if (this.destroyed) return false;',
    "    if (this.destroyed) return false;\n    if (!this.__evReady) { this.__evReady=true; this.port.postMessage({type:'evidence-ready',frame:this.__evFrame,endFrame:this.__evEnd,scheduled:this.__evEvents.length}); }");
  replaceOnce('    for (let frame = 0; frame < left.length; frame++) {',
    "    for (let frame = 0; frame < left.length; frame++) {\n      while(this.__evCursor<this.__evEvents.length && this.__evEvents[this.__evCursor].frame<=this.__evFrame)this.handleMessage(this.__evEvents[this.__evCursor++].message); this.__evFrame++;");
  replaceOnce('    return true;\n  }\n\n  advancePhysics()',
    "    if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',strikes:this.telemetry.strikes,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,diagnostics:this.getDiagnostics?.()||null}); }\n    return true;\n  }\n\n  advancePhysics()");
  assert.ok(source.includes("type:'evidence-ready',frame:"));
  assert.ok(source.includes("payload:options.processorOptions.evidenceTopology"));
  assert.ok(source.includes("type:'evidence-done'"));
  return source;
}

async function captureOne(page, input) {
  return page.evaluate(async ({ source, topology, payload, surfaceGain }) => {
    const rate = 48000, frames = rate * 10, schedule = { endFrame: frames,
      events: [{ frame: 480, message: { type: 'strike', payload } }] };
    const context = new OfflineAudioContext(2, frames, rate);
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(context, 'surface-plate-processor', { numberOfInputs: 0,
      numberOfOutputs: 1, outputChannelCount: [2], processorOptions: {
        evidenceTopology: { ...topology, maxLayers: 256 }, evidenceSchedule: schedule } });
    const gain = context.createGain(); gain.gain.value = surfaceGain;
    node.connect(gain); gain.connect(context.destination);
    let resolveReady, resolveDone, rejectRun;
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('controlled strike scheduler readiness timeout')), 10000);
      resolveReady = value => { clearTimeout(timer); resolve(value); };
      rejectRun = error => { clearTimeout(timer); reject(error); };
    });
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('controlled strike PCM render timeout')), 90000);
      resolveDone = value => { clearTimeout(timer); resolve(value); };
      node.addEventListener('processorerror', () => { clearTimeout(timer); reject(new Error('AudioWorklet processor error')); }, { once: true });
    });
    node.port.onmessage = event => {
      if (event.data?.type === 'evidence-ready') resolveReady(event.data);
      if (event.data?.type === 'evidence-done') resolveDone(event.data);
    };
    let buffer;
    try { [buffer] = await Promise.all([context.startRendering(), ready, done]); }
    catch (error) { rejectRun(error); throw error; }
    const readyReport = await ready, doneReport = await done;
    if (readyReport.frame !== 0 || readyReport.endFrame !== frames || readyReport.scheduled !== 1
      || doneReport.renderedFrames !== frames || doneReport.scheduled !== 1 || doneReport.strikes !== 1
      || doneReport.diagnostics?.strikes !== 1 || doneReport.diagnostics?.droppedRoutes !== 0) {
      throw new Error(`controlled strike handshake/count mismatch: ${JSON.stringify({ readyReport, doneReport })}`);
    }
    const bytes = new Uint8Array(44 + frames * 8), view = new DataView(bytes.buffer);
    bytes.set([82, 73, 70, 70]); view.setUint32(4, bytes.length - 8, true);
    bytes.set([87, 65, 86, 69, 102, 109, 116, 32], 8); view.setUint32(16, 16, true);
    view.setUint16(20, 3, true); view.setUint16(22, 2, true); view.setUint32(24, rate, true);
    view.setUint32(28, rate * 8, true); view.setUint16(32, 8, true); view.setUint16(34, 32, true);
    bytes.set([100, 97, 116, 97], 36); view.setUint32(40, frames * 8, true);
    for (let i = 0, offset = 44; i < frames; i++, offset += 8) {
      view.setFloat32(offset, buffer.getChannelData(0)[i], true);
      view.setFloat32(offset + 4, buffer.getChannelData(1)[i], true);
    }
    node.disconnect(); node.port.close();
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { wav: btoa(binary), ready: readyReport, done: doneReport };
  }, input);
}

async function renderControls({ page, rows, startMs }) {
  const rendered = await page.evaluate(async ({ rows, startMs }) => {
    const { decodeStereoFloatWav, buildStratigraphyAudioOverview, renderStratigraphyAudioOverview } =
      await import('/scripts/stratigraphy-audio-overview.js');
    const { buildStratigraphyAudioSnapshot, renderStratigraphyAudioComparison } =
      await import('/scripts/audio-snapshot-renderer.js');
    const images = [], snapshots = [];
    for (const row of rows) {
      const raw = atob(row.wav), bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
      const pcm = decodeStereoFloatWav(bytes);
      const events = [
        { type: 'PLATE_BIRTH', simulationTimeMs: 0, payload: { id: 'trail-plate-1' }, label: 'P1' },
        { type: 'FOOT_CONTACT', simulationTimeMs: 10, payload: { contactCount: 1 }, label: 'synthetic control strike' }
      ];
      const overview = buildStratigraphyAudioOverview({ channels: pcm.channels, sampleRate: pcm.sampleRate,
        simulationDurationSeconds: 10, clockAnchors: [{ simulationTimeMs: 0, audioSampleIndex: 0 },
          { simulationTimeMs: 10000, audioSampleIndex: pcm.sampleCount }], events });
      const canvas = document.createElement('canvas'); renderStratigraphyAudioOverview(canvas, overview);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, 34);
      ctx.fillStyle = '#111'; ctx.font = '15px sans-serif';
      ctx.fillText(`${row.label} · P1 birth ${startMs.toFixed(3)} ms · control strike +10 ms · fixed ANT scale`, 14, 23);
      images.push({ file: `${row.key}-fixed-overview.png`, png: canvas.toDataURL('image/png').split(',')[1] });
      const snapshot = buildStratigraphyAudioSnapshot(pcm.channels, { sampleRate: pcm.sampleRate, sourceDurationSeconds: 10 });
      snapshot.label = row.label; snapshots.push({ label: row.label, snapshot });
    }
    const comparison = document.createElement('canvas'); renderStratigraphyAudioComparison(comparison, snapshots);
    images.push({ file: 'six-control-strikes-fixed-comparison.png', png: comparison.toDataURL('image/png').split(',')[1] });
    return images;
  }, { rows: rows.map(({ wav, ...row }) => ({ ...row, wav })), startMs });
  const out = await ensureOut();
  return Promise.all(rendered.map(async image => {
    const bytes = Buffer.from(image.png, 'base64'); await writeFile(resolve(out, image.file), bytes);
    return { file: image.file, sha256: sha(bytes), bytes: bytes.length };
  }));
}

function summarizeCorrelations(rows) {
  return [100, 250, 500].map(windowMs => {
    const eligible = rows.filter(row => row.windows[windowMs]);
    const l = eligible.map(row => row.distanceToPickupL.solverGridCells);
    const r = eligible.map(row => row.distanceToPickupR.solverGridCells);
    const near = eligible.map(row => Math.min(row.distanceToPickupL.solverGridCells,
      row.distanceToPickupR.solverGridCells));
    const values = key => eligible.map(row => row.windows[windowMs][key]);
    const correlate = (x, y) => ({ pearsonR: pearson(x, y), spearmanRho: spearman(x, y) });
    return { windowMs, eligibleStrikes: eligible.length,
      pickupL: { distanceVsLeftRms: correlate(l, values('leftRms')),
        distanceVsLeftPeak: correlate(l, values('leftPeak')),
        distanceVsPooledRms: correlate(l, values('pooledRms')),
        distanceVsPeakMax: correlate(l, values('peakMax')) },
      pickupR: { distanceVsRightRms: correlate(r, values('rightRms')),
        distanceVsRightPeak: correlate(r, values('rightPeak')),
        distanceVsPooledRms: correlate(r, values('pooledRms')),
        distanceVsPeakMax: correlate(r, values('peakMax')) },
      nearest: { distanceVsPooledRms: correlate(near, values('pooledRms')),
        distanceVsPeakMax: correlate(near, values('peakMax')) } };
  });
}

function measureWindow(pcm, start, length) {
  const left = pcm.channels.left, right = pcm.channels.right;
  let leftPeak = 0, rightPeak = 0, leftSum = 0, rightSum = 0, nonFiniteSamples = 0;
  for (let i = start; i < start + length; i++) {
    const l = left[i], r = right[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { nonFiniteSamples++; continue; }
    leftPeak = Math.max(leftPeak, Math.abs(l)); rightPeak = Math.max(rightPeak, Math.abs(r));
    leftSum += l * l; rightSum += r * r;
  }
  const leftRms = Math.sqrt(leftSum / length), rightRms = Math.sqrt(rightSum / length);
  return { startFrame: start, samplesPerChannel: length, leftRms, rightRms,
    pooledRms: Math.sqrt((leftSum + rightSum) / (2 * length)), leftPeak, rightPeak,
    peakMax: Math.max(leftPeak, rightPeak), nonFiniteSamples };
}

function pearson(x, y) {
  if (x.length !== y.length || x.length < 2) return null;
  const mx = average(x), my = average(y);
  let numerator = 0, xx = 0, yy = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; numerator += dx * dy; xx += dx * dx; yy += dy * dy; }
  return xx && yy ? numerator / Math.sqrt(xx * yy) : null;
}

function spearman(x, y) { return pearson(ranks(x), ranks(y)); }
function ranks(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const output = new Array(values.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value) end++;
    const rank = (start + 1 + end) / 2;
    for (let i = start; i < end; i++) output[sorted[i].index] = rank;
    start = end;
  }
  return output;
}

function routeLayer(topology, position) {
  const x = Math.round(position.x * (SURFACE_SOURCE_GRID - 1));
  const y = Math.round(position.y * (SURFACE_SOURCE_GRID - 1));
  return topology.routingTopLayerByCell96[y * SURFACE_SOURCE_GRID + x];
}

function sourceGridPosition(index) {
  return { x: (index % SURFACE_SOURCE_GRID) / (SURFACE_SOURCE_GRID - 1),
    y: Math.floor(index / SURFACE_SOURCE_GRID) / (SURFACE_SOURCE_GRID - 1) };
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function distanceRecord(value) { return { normalized: value, solverGridCells: value * (SURFACE_SOLVER_GRID - 1) }; }
function toFrame(timeMs, startMs) { return Math.max(0, Math.min(480000 - 1, Math.round((timeMs - startMs) * 48))); }
function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
async function ensureOut() { const out = resolve(audioRoot, 'pickup-distance-readout'); await mkdir(out, { recursive: true }); return out; }
