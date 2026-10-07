import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';
import { SURFACE_SOLVER_GRID } from '../src/lib/audio/compileSurfaceTopology.js';
import { decodeStereoFloatWav } from './stratigraphy-audio-overview.js';

const root = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/audio');
const out = resolve(root, 'p1-pickup-aperture-ab');
const mixReport = JSON.parse(await readFile(resolve(root, 'mix-audibility/mix-ab-report.json')));
const sourceReport = JSON.parse(await readFile(resolve(root, 'audio-ab-report.json')));
const map = JSON.parse(await readFile(resolve(root, 'p1-node-observability/p1-node-observability.json')));
const apertureReport = JSON.parse(await readFile(resolve(out, 'p1-pickup-aperture-ab.json')));
const mapDir = resolve(root, 'p1-node-observability');
const frozenBytes = await readFile(resolve(root, mixReport.sourceRun.inputFile));
assert.equal(sha(frozenBytes), mixReport.sourceRun.inputGzipSha256, 'frozen input hash');
const frozen = JSON.parse(gunzipSync(frozenBytes));
const scheduleA = sourceReport.sourceEvents.schedules.postbirthBorn;
assert.equal(scheduleA.length, 63);
assert.equal(frozen.bornStrikes.length, 63);
assert.equal(map.nodes.length, 48);
assert.equal(map.source.inputGzipSha256, sha(frozenBytes), 'A sweep input provenance');
assert.equal(map.source.workletSha256, mixReport.comparison.A.workletSha256, 'A sweep uses production point pickup source');
assert.equal(map.source.priorFrozenStrikeScheduleSha256, mixReport.scheduleEquality.scheduleSha256, 'A sweep schedule provenance');
for (const row of map.nodes) {
  const bytes = await readFile(resolve(mapDir, row.pcm.file));
  assert.equal(sha(bytes), row.pcm.sha256, `frozen A node WAV hash ${row.nodeIndex}`);
}

const aPcmPath = resolve(root, `mix-audibility/${mixReport.comparison.A.pcm}`);
const aPcmBytes = await readFile(aPcmPath);
assert.equal(sha(aPcmBytes), mixReport.comparison.A.pcmSha256, 'frozen natural A PCM hash');
assert.equal(sha(aPcmBytes), '7616551f36bf2dcc3f770ed7d07c3da7f7c55d559d58dddbf9409af254e46c48');
const aNatural = decodeStereoFloatWav(aPcmBytes);
assert.equal(aNatural.sampleRate, 48000);
assert.equal(aNatural.sampleCount, 480000);

if (process.env.ANT_APERTURE_RENDER_ONLY === '1') {
  await renderExistingEvidence();
} else if (process.env.ANT_APERTURE_CANCELLATION_ONLY === '1') {
  await diagnoseCancellation();
} else {
const fresh = await captureP1();
let browser, server;
try {
  const { firstBirth, topology, surfaceGain } = fresh;
  assert.equal(sha(JSON.stringify(firstBirth)), mixReport.sourceRun.firstPlateDescriptorSha256);
  assert.equal(firstBirth.id, 'trail-plate-1');
  assert.equal(firstBirth.bornAtSimulationTimeMs / 1000, 103.01666666667376);
  assert.deepEqual(topology.layerIds, [firstBirth.id]);
  assert.equal(topology.nodeOffsets[1] - topology.nodeOffsets[0], 48);
  assert.equal(surfaceGain, mixReport.settings.surfaceGain);
  assert.equal(sha(await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8')),
    mixReport.comparison.A.workletSha256, 'production A worklet hash');

  const aperture = makeAperture(topology);
  const strikeTemplate = frozen.bornStrikes[0].payload;
  const naturalStrikes = frozen.bornStrikes
    .filter(row => row.simulationTimeMs >= firstBirth.bornAtSimulationTimeMs
      && row.simulationTimeMs < firstBirth.bornAtSimulationTimeMs + 10000)
    .map((row, index) => ({ frame: toFrame(row.simulationTimeMs, firstBirth.bornAtSimulationTimeMs),
      payload: row.payload, index }))
    .sort((a, b) => a.frame - b.frame || a.index - b.index)
    .map(({ frame, payload }) => ({ frame, payload }));
  assert.equal(naturalStrikes.length, 63);
  assert.deepEqual(naturalStrikes, scheduleA, 'natural schedule preserves exact payloads, frames and equal-frame order');
  assert.equal(sha(JSON.stringify(naturalStrikes)), mixReport.scheduleEquality.scheduleSha256);

  const nodes = map.nodes.map(row => ({ ...row, payload: { ...strikeTemplate,
    plateId: firstBirth.id, layerId: firstBirth.id, position: row.strikePosition } }));
  assert.ok(nodes.every(row => row.payload.strength === strikeTemplate.strength
    && row.payload.footprintRadius === strikeTemplate.footprintRadius
    && row.payload.hardness === strikeTemplate.hardness));

  await mkdir(out, { recursive: true });
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>P1 aperture PCM</title>'); return; }
      const file = resolve(process.cwd(), `.${pathname}`), rel = relative(process.cwd(), file);
      if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) { response.writeHead(403); response.end(); return; }
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); response.end(body);
    } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
  const productionSource = await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');
  const candidateSource = instrumentWorklet(addApertureReadout(productionSource));

  const bRows = [];
  for (const row of nodes) {
    const captured = await capture(page, { source: candidateSource, topology, aperture: aperture.nodeWeights,
      events: [{ frame: 480, payload: row.payload }], frames: 24480, surfaceGain, expectedStrikes: 1 });
    const bytes = Buffer.from(captured.wav, 'base64'), pcm = decodeStereoFloatWav(bytes);
    assert.equal(pcm.sampleRate, 48000);
    assert.equal(pcm.sampleCount, 24480);
    const fullPcm = measure(pcm, 0, pcm.sampleCount);
    const windows = Object.fromEntries([100, 250, 500].map(ms => [ms, measure(pcm, 480, ms * 48)]));
    assert.equal(captured.ready.frame, 0);
    assert.equal(captured.ready.scheduled, 1);
    assert.equal(captured.done.strikes, 1);
    assert.equal(captured.done.diagnostics?.droppedRoutes, 0);
    assert.equal(captured.done.diagnostics?.clipped, 0);
    assert.equal(captured.done.diagnostics?.nonFinite, 0);
    assert.equal(fullPcm.nonFiniteSamples, 0);
    assert.equal(fullPcm.clippingSamples, 0);
    assert.deepEqual(compareDiagnostics(captured.done.diagnostics),
      compareDiagnostics(row.diagnostics), `readout must not change solver state at node ${row.nodeIndex}`);
    assert.equal(windows[500].nonFiniteSamples, 0);
    const file = `node-${String(row.nodeIndex).padStart(2, '0')}-510ms-f32.wav`;
    await writeFile(resolve(out, file), bytes);
    bRows.push({ nodeIndex: row.nodeIndex, gridCell: row.gridCell, gridX: row.gridX, gridY: row.gridY,
      degree: row.degree, boundary: row.boundary, windows,
      fullPcm,
      peak500ms: { left: windows[500].peakLeft, right: windows[500].peakRight, pooled: windows[500].peakPooled },
      acceptedStrikes: captured.done.strikes, diagnostics: captured.done.diagnostics,
      pcm: { file, sha256: sha(bytes), bytes: bytes.length } });
  }

  const naturalCapture = await capture(page, { source: candidateSource, topology, aperture: aperture.nodeWeights,
    events: naturalStrikes, frames: 480000, surfaceGain, expectedStrikes: 63 });
  const bNaturalBytes = Buffer.from(naturalCapture.wav, 'base64');
  const bNatural = decodeStereoFloatWav(bNaturalBytes);
  assert.equal(bNatural.sampleRate, 48000);
  assert.equal(bNatural.sampleCount, 480000);
  assert.equal(naturalCapture.ready.frame, 0);
  assert.equal(naturalCapture.ready.scheduled, 63);
  assert.equal(naturalCapture.done.renderedFrames, 480000);
  assert.equal(naturalCapture.done.scheduled, 63);
  assert.equal(naturalCapture.done.strikes, 63);
  assert.equal(naturalCapture.done.diagnostics?.droppedRoutes, 0);
  assert.equal(naturalCapture.done.diagnostics?.clipped, 0);
  assert.equal(naturalCapture.done.diagnostics?.nonFinite, 0);
  assert.deepEqual(compareDiagnostics(naturalCapture.done.diagnostics),
    Object.fromEntries(mixReport.pcmChecks.comparedDiagnosticFields.map(key => [key,
      mixReport.pcmChecks.preLimiterProcessor.A[key]])), 'readout leaves frozen Plate solver diagnostics unchanged');
  await writeFile(resolve(out, 'B-1hop-gaussian-born-only-10s-48khz-f32.wav'), bNaturalBytes);

  const nodeComparisons = summarizeSweep(map.nodes, bRows);
  const aNaturalMetrics = summarizeNatural(aNatural), bNaturalMetrics = summarizeNatural(bNatural);
  const naturalEventWindows = summarizeNaturalEventWindows(aNatural, bNatural, naturalStrikes);
  const contacts = frozen.contacts.filter(row => row.simulationTimeMs >= firstBirth.bornAtSimulationTimeMs
    && row.simulationTimeMs < firstBirth.bornAtSimulationTimeMs + 10000)
    .map((row, groupIndex) => ({ type: 'FOOT_CONTACT', simulationTimeMs: row.simulationTimeMs - firstBirth.bornAtSimulationTimeMs,
      payload: row.payload, groupIndex }))
    .concat([{ type: 'PLATE_BIRTH', simulationTimeMs: 0, payload: { id: firstBirth.id }, label: 'P1' }]);
  const visuals = await renderVisuals(page, { aPcmBytes, bNaturalBytes, contacts, map: map.nodes, bRows });
  const report = {
    status: 'frozen-P1-one-hop-pickup-aperture-A-B',
    decisionScope: 'One predetermined graph-local finite-aperture candidate. No production DSP, Plate/material/birth/routing/substrate/simulation change.',
    candidate: { rule: 'pickup node plus direct same-layer compiled neighborIndices only',
      kernel: 'Gaussian exp(-d^2 / (2 sigma^2))', sigmaSolverCells: 1,
      rawCenterWeight: 1, rawOneHopWeight: Math.exp(-0.5), normalization: 'divide each pickup neighborhood by its own positive weight sum',
      audioPath: 'signed next-displacement weighted sum; no abs, RMS or rectification; existing MIX then existing limiter',
      uniformDisplacementResponse: { left: 1, right: 1, asserted: true },
      pickups: aperture.pickups, noCrossLayerOrDisconnectedEdges: true, targetPositionsChanged: false },
    source: { seed: 20261005, inputFile: mixReport.sourceRun.inputFile,
      inputGzipSha256: sha(frozenBytes), firstPlateId: firstBirth.id,
      firstPlateBirthSeconds: firstBirth.bornAtSimulationTimeMs / 1000,
      firstPlateDescriptorSha256: sha(JSON.stringify(firstBirth)), descriptorMatchesFrozen: true,
      acceptedNaturalP1Strikes: naturalStrikes.length, scheduleSha256: sha(JSON.stringify(naturalStrikes)),
      scheduleExactlyMatchesFrozenA: true, aWorkletSha256: sha(productionSource),
      aPcm: { file: '../mix-audibility/' + mixReport.comparison.A.pcm,
        sha256: sha(aPcmBytes), exactFrozenProductionA: true },
      baseSubstrateStemTouched: false },
    capture: { browser: browser.version(), engine: 'Chrome OfflineAudioContext + production worklet with in-memory scheduler/readout instrumentation',
      sampleRateHz: 48000, surfaceGain, sweepNodeCount: 48, controlStrikeFrame: 480,
      preStrikeMs: 10, sweepCaptureFrames: 24480, sweepWindowMs: [100, 250, 500],
      naturalCaptureFrames: 480000, naturalCaptureSeconds: 10,
      naturalClockMapping: 'requestedFrame = round((strikeSimulationTimeMs - firstPlateBirthMs) * 48)',
      scheduleReady: { nodeSweep: 'frame 0, one event per run', natural: naturalCapture.ready },
      naturalWorklet: naturalCapture.done },
    sweepComparison: nodeComparisons,
    natural63Strikes: { A: aNaturalMetrics,
      B: { ...bNaturalMetrics, pcm: { file: 'B-1hop-gaussian-born-only-10s-48khz-f32.wav', sha256: sha(bNaturalBytes) } },
      pooledRmsChangeDbAtoB: dbRatio(bNaturalMetrics.rms.pooled, aNaturalMetrics.rms.pooled),
      leftRmsChangeDbAtoB: dbRatio(bNaturalMetrics.rms.left, aNaturalMetrics.rms.left),
      rightRmsChangeDbAtoB: dbRatio(bNaturalMetrics.rms.right, aNaturalMetrics.rms.right),
      channelBalanceDbA: dbRatio(aNaturalMetrics.rms.left, aNaturalMetrics.rms.right),
      channelBalanceDbB: dbRatio(bNaturalMetrics.rms.left, bNaturalMetrics.rms.right),
      stereoCorrelationA: aNaturalMetrics.stereoCorrelation, stereoCorrelationB: bNaturalMetrics.stereoCorrelation,
      eventAlignedWindows: naturalEventWindows,
      note: 'Full-run RMS includes all overlapping natural strike responses. Event windows can overlap/coincide and describe the shared runtime output, not isolated impulses.' },
    pcmChecks: { clippingThreshold: '|sample| >= 1', A: { clippingSamples: aNaturalMetrics.clippingSamples,
      nonFiniteSamples: aNaturalMetrics.nonFiniteSamples }, B: { clippingSamples: bNaturalMetrics.clippingSamples,
      nonFiniteSamples: bNaturalMetrics.nonFiniteSamples },
      sweepB: { clippingSamples: bRows.reduce((sum, row) => sum + row.fullPcm.clippingSamples, 0),
        nonFiniteSamples: bRows.reduce((sum, row) => sum + row.fullPcm.nonFiniteSamples, 0) },
      internalSolverDiagnosticsMatchA: true, comparedDiagnosticFields: mixReport.pcmChecks.comparedDiagnosticFields,
      productionFilesChanged: false },
    settings: { unchanged: true, substrateOutputRatio: mixReport.settings.substrateOutputRatio,
      substrateDamping: mixReport.settings.substrateDamping, contactPulseMs: 3, recoveryMs: 75,
      plateDampingMultiplier: 50, mix: '1/sqrt(12)', softLimiter: 'unchanged', masterGain: sourceReport.settings.masterVolume },
    renderer: visuals.renderer, images: visuals.images,
    conclusion: decide(nodeComparisons, aNaturalMetrics, bNaturalMetrics)
  };
  await writeFile(resolve(out, 'p1-pickup-aperture-ab.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(resolve(out, 'p1-pickup-aperture-ab.csv'), toCsv(map.nodes, bRows));
  console.log(JSON.stringify({ out, browser: report.capture.browser, aperture: aperture.pickups,
    windows: nodeComparisons.windows.map(row => ({ windowMs: row.windowMs,
      pooledA: row.channels.pooled.A, pooledB: row.channels.pooled.B,
      pooledRank: row.spatialRank.pooled })),
    natural: { rmsA: aNaturalMetrics.rms, rmsB: bNaturalMetrics.rms,
      peakA: aNaturalMetrics.peak, peakB: bNaturalMetrics.peak,
      pooledChangeDb: report.natural63Strikes.pooledRmsChangeDbAtoB,
      clippingB: bNaturalMetrics.clippingSamples, nonFiniteB: bNaturalMetrics.nonFiniteSamples },
    conclusion: report.conclusion, images: visuals.images.map(row => row.file) }, null, 2));
} finally {
  await fresh.controller.destroy();
  await browser?.close();
  if (server?.listening) await new Promise(resolveClose => { server.close(resolveClose); server.closeAllConnections(); });
}
}

async function renderExistingEvidence() {
  const reportPath = resolve(out, 'p1-pickup-aperture-ab.json');
  const report = JSON.parse(await readFile(reportPath));
  const aPcmBytes = await readFile(aPcmPath);
  const bNaturalBytes = await readFile(resolve(out, report.natural63Strikes.B.pcm?.file
    ?? 'B-1hop-gaussian-born-only-10s-48khz-f32.wav'));
  if (report.natural63Strikes.B.pcm?.sha256) assert.equal(sha(bNaturalBytes), report.natural63Strikes.B.pcm.sha256, 'stored B natural PCM hash');
  const bRows = await Promise.all(map.nodes.map(async row => {
    const bytes = await readFile(resolve(out, `node-${String(row.nodeIndex).padStart(2, '0')}-510ms-f32.wav`));
    const pcm = decodeStereoFloatWav(bytes);
    const windows = Object.fromEntries([100, 250, 500].map(ms => [ms, measure(pcm, 480, ms * 48)]));
    return { nodeIndex: row.nodeIndex, windows, fullPcm: measure(pcm, 0, pcm.sampleCount), peak500ms: { left: windows[500].peakLeft,
      right: windows[500].peakRight, pooled: windows[500].peakPooled } };
  }));
  const birthMs = mixReport.sourceRun.firstPlateBirthSeconds * 1000;
  const contacts = frozen.contacts.filter(row => row.simulationTimeMs >= birthMs && row.simulationTimeMs < birthMs + 10000)
    .map((row, groupIndex) => ({ type: 'FOOT_CONTACT', simulationTimeMs: row.simulationTimeMs - birthMs,
      payload: row.payload, groupIndex }))
    .concat([{ type: 'PLATE_BIRTH', simulationTimeMs: 0, payload: { id: 'trail-plate-1' }, label: 'P1' }]);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>P1 aperture visuals</title>'); return; }
      const file = resolve(process.cwd(), `.${pathname}`), rel = relative(process.cwd(), file);
      if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) { response.writeHead(403); response.end(); return; }
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); response.end(await readFile(file));
    } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
    const visuals = await renderVisuals(page, { aPcmBytes, bNaturalBytes, contacts, map: map.nodes, bRows });
    report.renderer = visuals.renderer; report.images = visuals.images;
    report.pcmChecks.sweepB = { clippingSamples: bRows.reduce((sum, row) => sum + row.fullPcm.clippingSamples, 0),
      nonFiniteSamples: bRows.reduce((sum, row) => sum + row.fullPcm.nonFiniteSamples, 0) };
    report.natural63Strikes.B.pcm = { file: 'B-1hop-gaussian-born-only-10s-48khz-f32.wav', sha256: sha(bNaturalBytes) };
    report.conclusion = decide(report.sweepComparison, report.natural63Strikes.A, report.natural63Strikes.B);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ renderOnly: true, images: visuals.images.map(row => row.file),
      decision: report.conclusion.decision }, null, 2));
  } finally {
    await browser?.close(); await new Promise(resolveClose => { server.close(resolveClose); server.closeAllConnections(); });
  }
}

async function diagnoseCancellation() {
  const fresh = await captureP1();
  let browser, server;
  const diagnosisOut = resolve(root, 'p1-aperture-cancellation-diagnosis');
  try {
    const { firstBirth, topology, surfaceGain } = fresh;
    assert.equal(sha(JSON.stringify(firstBirth)), mixReport.sourceRun.firstPlateDescriptorSha256);
    assert.equal(firstBirth.bornAtSimulationTimeMs / 1000, 103.01666666667376);
    assert.equal(topology.nodeOffsets[1] - topology.nodeOffsets[0], 48);
    assert.equal(surfaceGain, mixReport.settings.surfaceGain);
    const aperture = makeAperture(topology);
    const strikeTemplate = frozen.bornStrikes[0].payload;
    const traceNodes = aperture.pickups.flatMap(row => row.neighborhood.map(item => item.node));
    assert.equal(new Set(traceNodes).size, 7);
    const productionSource = await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');
    assert.equal(sha(productionSource), mixReport.comparison.A.workletSha256);
    const tracedCandidate = instrumentWorklet(addApertureReadout(productionSource), { trace: true });
    const csvRows = (await readFile(resolve(out, 'p1-pickup-aperture-ab.csv'), 'utf8')).trim().split(/\r?\n/);
    const csvHeader = csvRows[0].split(',');
    const savedBHashColumn = csvHeader.indexOf('B.wavSha256');
    assert.ok(savedBHashColumn >= 0, 'saved B per-node PCM hashes are present');
    const savedBHashes = new Map(csvRows.slice(1).map(line => {
      const columns = line.split(','); return [Number(columns[0]), columns[savedBHashColumn]];
    }));

    server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
        if (pathname === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>P1 aperture cancellation diagnosis</title>'); return; }
        const file = resolve(process.cwd(), `.${pathname}`), rel = relative(process.cwd(), file);
        if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) { response.writeHead(403); response.end(); return; }
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); response.end(await readFile(file));
      } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
    });
    await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
    await mkdir(diagnosisOut, { recursive: true });

    const rows = [];
    const signedTraces = [];
    for (const mapRow of map.nodes) {
      const payload = { ...strikeTemplate, plateId: firstBirth.id, layerId: firstBirth.id, position: mapRow.strikePosition };
      assert.equal(payload.strength, strikeTemplate.strength);
      const captured = await capture(page, { source: tracedCandidate, topology, aperture: aperture.nodeWeights,
        events: [{ frame: 480, payload }], frames: 5280, surfaceGain, expectedStrikes: 1, traceNodes });
      assert.equal(captured.ready.frame, 0);
      assert.equal(captured.ready.scheduled, 1);
      assert.equal(captured.done.strikes, 1);
      assert.equal(captured.done.diagnostics?.droppedRoutes, 0);
      assert.equal(captured.done.diagnostics?.clipped, 0);
      assert.equal(captured.done.diagnostics?.nonFinite, 0);
      assert.equal(captured.done.trace?.length, traceNodes.length, `signed trace components at node ${mapRow.nodeIndex}`);
      assert.ok(captured.done.trace.every(values => values.length === 600 && values.every(Number.isFinite)),
        `600 finite 6 kHz samples per component at node ${mapRow.nodeIndex}`);

      const outputBytes = Buffer.from(captured.wav, 'base64');
      const outputPcm = decodeStereoFloatWav(outputBytes);
      const previousBBytes = await readFile(resolve(out, `node-${String(mapRow.nodeIndex).padStart(2, '0')}-510ms-f32.wav`));
      assert.equal(sha(previousBBytes), savedBHashes.get(mapRow.nodeIndex), `previous B PCM hash at node ${mapRow.nodeIndex}`);
      const previousBPcm = decodeStereoFloatWav(previousBBytes);
      assert.equal(outputPcm.sampleRate, 48000);
      assert.equal(outputPcm.sampleCount, 5280);
      for (const channel of ['left', 'right']) {
        assert.deepEqual(outputPcm.channels[channel].slice(480, 5280), previousBPcm.channels[channel].slice(480, 5280),
          `100 ms B PCM sample equality, node ${mapRow.nodeIndex}, ${channel}`);
      }

      const aBytes = await readFile(resolve(mapDir, mapRow.pcm.file));
      assert.equal(sha(aBytes), mapRow.pcm.sha256, `saved A PCM hash at node ${mapRow.nodeIndex}`);
      const aPcm = decodeStereoFloatWav(aBytes);
      const a = measure(aPcm, 480, 4800), b = measure(outputPcm, 480, 4800);
      const traceByNode = new Map(traceNodes.map((node, index) => [node, Float64Array.from(captured.done.trace[index])]));
      const sides = aperture.pickups.map(pickup => summarizeApertureReadout(traceByNode, pickup));
      rows.push({ nodeIndex: mapRow.nodeIndex, gridCell: mapRow.gridCell, gridX: mapRow.gridX, gridY: mapRow.gridY,
        aToB: { leftDb: dbRatio(b.rms.left, a.rms.left), rightDb: dbRatio(b.rms.right, a.rms.right),
          pooledDb: dbRatio(b.rms.pooled, a.rms.pooled), A: a.rms, B: b.rms }, sides });
      signedTraces.push({ nodeIndex: mapRow.nodeIndex, strikeFrame: 480, traceFrames: { first: 488, last: 5280, step: 8 },
        components: traceNodes.map((node, index) => ({ nodeIndex: node,
          side: aperture.pickups.find(pickup => pickup.neighborhood.some(item => item.node === node)).side,
          role: aperture.pickups.flatMap(pickup => pickup.neighborhood.map((item, componentIndex) => ({
            side: pickup.side, node: item.node, role: componentIndex === 0 ? 'center' : 'neighbor' })))
            .find(item => item.node === node).role,
          signedNextDisplacement: captured.done.trace[index] })) });
    }

    const summary = summarizeCancellationRows(rows, aperture.pickups);
    const traceJson = Buffer.from(JSON.stringify({ sampleRateHz: 6000, samplesPerStrike: 600, sampleRepresentation: 'float64 values serialized as JSON numbers',
      windowMs: 100, signedReadout: 'raw per-node `next` displacement after the finite check, before weighted pickup summation, MIX, limiter and solver state rotation',
      nodeOrder: traceNodes, nodeOrderByPickup: aperture.pickups.map(pickup => ({ side: pickup.side,
        centerNode: pickup.centerNode, components: pickup.neighborhood.map(item => item.node) })), rows: signedTraces }));
    const traceFile = 'p1-aperture-signed-component-traces.json.gz';
    const compressedTrace = gzipSync(traceJson, { level: 9 });
    await writeFile(resolve(diagnosisOut, traceFile), compressedTrace);
    const csv = cancellationCsv(rows, aperture.pickups);
    await writeFile(resolve(diagnosisOut, 'p1-aperture-cancellation-per-node.csv'), csv);
    const report = {
      status: 'frozen-P1-1hop-aperture-cancellation-diagnosis',
      decisionScope: 'Read-only diagnostic of the already rejected, unchanged sigma-1 1-hop aperture. No new topology tested and no production source changed.',
      source: { seed: 20261005, inputGzipSha256: sha(frozenBytes), firstPlateId: firstBirth.id,
        firstPlateBirthSeconds: firstBirth.bornAtSimulationTimeMs / 1000,
        descriptorSha256: sha(JSON.stringify(firstBirth)), scheduleSha256: apertureReport.source.scheduleSha256,
        acceptedSweepStrikes: rows.length, exactFrozenP1Geometry: true,
        productionWorkletSha256: sha(productionSource), aperture: aperture.pickups },
      capture: { browser: browser.version(), engine: 'Chrome OfflineAudioContext, same production worklet with in-memory scheduler, fixed B readout and signed component taps',
        audioSampleRateHz: 48000, solverRateHz: 6000, surfaceGain, eventFrame: 480,
        pcmWindow: '[frame 480, frame 5280), 100 ms', solverSamplesPerWindow: 600,
        solverTickAudioFrameBoundaries: '[488, 5280], every 8 output frames',
        traceTap: 'each selected node next value after finite validation and assignment; before readout summation, MIX/limiter, and state rotation',
        traceNodeOrder: traceNodes, savedBCaptureExactSampleMatches: { nodes: rows.length, channels: 2,
          samplesPerChannelPerNode: 4800, exact: true },
        savedASweepUsedForAtoB: true, allStrikePayloadsUseFrozenTemplate: true },
      measurement: { componentRms: 'RMS of each raw signed node series across the 600 solver updates',
        pairwise: 'mean-subtracted zero-lag Pearson correlation with the center, plus same-sign fraction when both samples are nonzero',
        rawAperture: 'center weight 1 and each neighbor weight exp(-0.5), before normalization',
        normalizedAperture: 'each raw weight divided by its pickup-specific positive weight sum',
        cancellationRatio: 'RMS(weighted signed sum) / sqrt(sum((normalizedWeight * componentRMS)^2)); denominator excludes cross terms',
        coherenceEfficiency: 'RMS(weighted signed sum) / sum(normalizedWeight * componentRMS); perfect in-phase upper bound',
        energyCrossTerm: 'RMS(sum)^2 minus diagonal-only reference power; negative indicates net cancellation',
        pcmChange: 'measured A-to-B channel RMS dB from the saved A sweep and exact-replayed B PCM; includes output interpolation, surface gain, MIX and limiter' },
      summary, files: { report: 'p1-aperture-cancellation-report.json', perNode: 'p1-aperture-cancellation-per-node.csv',
        signedComponentTraces: { file: traceFile, sha256: sha(compressedTrace), bytes: compressedTrace.length,
          uncompressedBytes: traceJson.length } },
      validation: { all48StrikesCaptured: true, sourcePCMMatchesSavedBExactly: true,
        allComponentSamplesFinite: true, droppedRoutes: 0, clipped: 0, nonFinite: 0,
        productionCodeChanged: false, candidateTopologyTested: false }
    };
    await writeFile(resolve(diagnosisOut, 'p1-aperture-cancellation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ out: diagnosisOut, summary, traceBytes: compressedTrace.length,
      exactSavedBSampleMatches: rows.length, conclusion: summary.interpretation }, null, 2));
  } finally {
    await fresh.controller.destroy();
    await browser?.close();
    if (server?.listening) await new Promise(resolveClose => { server.close(resolveClose); server.closeAllConnections(); });
  }
}

function summarizeApertureReadout(traceByNode, pickup) {
  const components = pickup.neighborhood.map(item => ({ ...item, samples: traceByNode.get(item.node) }));
  assert.ok(components.every(item => item.samples?.length === 600), `${pickup.side} component trace length`);
  const center = components[0].samples;
  const rawSum = new Float64Array(center.length), normalizedSum = new Float64Array(center.length);
  for (const component of components) for (let i = 0; i < center.length; i++) {
    rawSum[i] += component.samples[i] * component.rawWeight;
    normalizedSum[i] += component.samples[i] * component.normalizedWeight;
  }
  const componentMetrics = components.map((item, index) => ({ nodeIndex: item.node, role: index ? 'neighbor' : 'center',
    distanceCells: item.distanceCells, rawWeight: item.rawWeight, normalizedWeight: item.normalizedWeight,
    rms: rmsOf(item.samples), mean: mean(item.samples),
    weightedRmsBeforeNormalization: item.rawWeight * rmsOf(item.samples),
    weightedRmsAfterNormalization: item.normalizedWeight * rmsOf(item.samples),
    ...(index ? { centerCorrelation: pearson(center, item.samples), centerSignAgreement: signAgreement(center, item.samples) } : {}) }));
  const rmsBeforeNormalization = rmsOf(rawSum), rmsAfterNormalization = rmsOf(normalizedSum);
  const diagonalReferenceRms = Math.sqrt(componentMetrics.reduce((sum, item) => sum + item.weightedRmsAfterNormalization ** 2, 0));
  const alignedBoundRms = componentMetrics.reduce((sum, item) => sum + item.weightedRmsAfterNormalization, 0);
  const centerRms = componentMetrics[0].rms;
  return { side: pickup.side, centerNode: pickup.centerNode, components: componentMetrics,
    rawWeightSum: pickup.neighborhood.reduce((sum, item) => sum + item.rawWeight, 0),
    normalizedWeightSum: pickup.neighborhood.reduce((sum, item) => sum + item.normalizedWeight, 0),
    summedApertureRms: { beforeNormalization: rmsBeforeNormalization, afterNormalization: rmsAfterNormalization },
    centerToNormalizedAperture: { ratio: centerRms ? rmsAfterNormalization / centerRms : null,
      changeDb: centerRms && rmsAfterNormalization ? dbRatio(rmsAfterNormalization, centerRms) : null },
    cancellation: { diagonalOnlyReferenceRms: diagonalReferenceRms,
      cancellationRatioVsDiagonal: diagonalReferenceRms ? rmsAfterNormalization / diagonalReferenceRms : null,
      perfectlyAlignedReferenceRms: alignedBoundRms,
      coherenceEfficiency: alignedBoundRms ? rmsAfterNormalization / alignedBoundRms : null,
      crossTermPower: rmsAfterNormalization ** 2 - diagonalReferenceRms ** 2,
      crossTermPowerRelativeToDiagonal: diagonalReferenceRms
        ? (rmsAfterNormalization ** 2 - diagonalReferenceRms ** 2) / diagonalReferenceRms ** 2 : null } };
}

function summarizeCancellationRows(rows, pickups) {
  const channels = Object.fromEntries(pickups.map((pickup, sideIndex) => {
    const side = pickup.side;
    const measuredDb = rows.map(row => row.aToB[`${side}Db`]);
    const cancellations = rows.map(row => row.sides[sideIndex]);
    const correlations = cancellations.flatMap(item => item.components.slice(1).map(component => component.centerCorrelation));
    const weakCount = Math.ceil(rows.length * 0.25);
    const order = rows.map((row, index) => ({ index, measuredDb: measuredDb[index], cancellation: cancellations[index] }))
      .sort((a, b) => a.measuredDb - b.measuredDb);
    const weak = order.slice(0, weakCount), remaining = order.slice(weakCount);
    const weakStats = group => ({ strikes: group.length,
      measuredPcmChangeDbMean: mean(group.map(row => row.measuredDb)),
      meanCenterNeighborCorrelation: mean(group.map(row => mean(row.cancellation.components.slice(1).map(component => component.centerCorrelation ?? 0)))),
      minimumCenterNeighborCorrelation: mean(group.map(row => Math.min(...row.cancellation.components.slice(1).map(component => component.centerCorrelation ?? 0)))),
      cancellationRatioVsDiagonalMedian: median(group.map(row => row.cancellation.cancellation.cancellationRatioVsDiagonal ?? 0)),
      coherenceEfficiencyMedian: median(group.map(row => row.cancellation.cancellation.coherenceEfficiency ?? 0)),
      meanNeighborToCenterRmsRatio: mean(group.map(row => mean(row.cancellation.components.slice(1)
        .map(component => component.rms / Math.max(1e-30, row.cancellation.components[0].rms))))),
      negativeCenterNeighborCorrelationFraction: (() => { const values = group.flatMap(row => row.cancellation.components.slice(1)
        .map(component => component.centerCorrelation).filter(Number.isFinite));
        return values.filter(value => value < 0).length / values.length; })() });
    const predicted = cancellations.map(item => item.centerToNormalizedAperture.changeDb);
    const meanCorrelation = cancellations.map(item => mean(item.components.slice(1).map(component => component.centerCorrelation ?? 0)));
    const minimumCorrelation = cancellations.map(item => Math.min(...item.components.slice(1).map(component => component.centerCorrelation ?? 0)));
    const cancellationRatio = cancellations.map(item => item.cancellation.cancellationRatioVsDiagonal ?? 0);
    const coherence = cancellations.map(item => item.cancellation.coherenceEfficiency ?? 0);
    const neighborRmsRatio = cancellations.map(item => mean(item.components.slice(1)
      .map(component => component.rms / Math.max(1e-30, item.components[0].rms))));
    return [side, { pickupNode: pickup.centerNode, strikes: rows.length,
      measuredPcmAtoBChangeDb: valueSummary(measuredDb),
      predictedSolverReadoutChangeDbBeforeMixLimiter: valueSummary(predicted),
      measuredMinusPredictedDb: valueSummary(measuredDb.map((value, index) => value - predicted[index])),
      centerNeighborCorrelation: valueSummary(correlations.filter(Number.isFinite)),
      perStrikeCancellationRatioVsDiagonal: distribution(cancellationRatio),
      perStrikeCoherenceEfficiency: distribution(coherence),
      perStrikeMeanNeighborToCenterRmsRatio: distribution(neighborRmsRatio),
      negativeCenterNeighborCorrelationFraction: correlations.filter(Number.isFinite).filter(value => value < 0).length
        / correlations.filter(Number.isFinite).length,
      relationships: { pearsonMeasuredDbWithMeanCenterNeighborCorrelation: pearson(measuredDb, meanCorrelation),
        pearsonMeasuredDbWithMinimumCenterNeighborCorrelation: pearson(measuredDb, minimumCorrelation),
        pearsonMeasuredDbWithCancellationRatio: pearson(measuredDb, cancellationRatio),
        pearsonMeasuredDbWithCoherenceEfficiency: pearson(measuredDb, coherence),
        pearsonMeasuredDbWithNeighborToCenterRmsRatio: pearson(measuredDb, neighborRmsRatio) },
      weakTailVsRemaining: { definition: 'lowest 25% of measured channel A-to-B PCM RMS dB changes versus remaining strikes',
        weakTail: weakStats(weak), remaining: weakStats(remaining) },
      allPairwiseCenterNeighborCorrelations: correlations }];
  }));
  const pooled = rows.map(row => row.aToB.pooledDb);
  const pooledWeakRows = [...rows].sort((a, b) => a.aToB.pooledDb - b.aToB.pooledDb).slice(0, Math.ceil(rows.length * 0.25));
  const pooledWeak = pooledWeakRows;
  const pooledCorrelation = pooledWeak.map(row => mean(row.sides.flatMap(side => side.components.slice(1)
    .map(component => component.centerCorrelation ?? 0))));
  const pooledCancellation = pooledWeak.map(row => mean(row.sides.map(side => side.cancellation.cancellationRatioVsDiagonal ?? 0)));
  const pooledCoherence = pooledWeak.map(row => mean(row.sides.map(side => side.cancellation.coherenceEfficiency ?? 0)));
  const allMeanCorrelation = rows.map(row => mean(row.sides.flatMap(side => side.components.slice(1)
    .map(component => component.centerCorrelation ?? 0))));
  const allCancellation = rows.map(row => mean(row.sides.map(side => side.cancellation.cancellationRatioVsDiagonal ?? 0)));
  const allCoherence = rows.map(row => mean(row.sides.map(side => side.cancellation.coherenceEfficiency ?? 0)));
  const fullCorrelation = pearson(pooled, allMeanCorrelation), fullCancellation = pearson(pooled, allCancellation);
  const weakMeanCorrelation = mean(pooledCorrelation), allMeanCorrelationValue = mean(allMeanCorrelation);
  const weakMeanCancellation = mean(pooledCancellation), allMeanCancellation = mean(allCancellation);
  const weakMeanCoherence = mean(pooledCoherence), allMeanCoherenceValue = mean(allCoherence);
  const weakCorrelations = pooledWeakRows.flatMap(row => row.sides.flatMap(side => side.components.slice(1)
    .map(component => component.centerCorrelation).filter(Number.isFinite)));
  const reducedLocalCoherence = weakMeanCorrelation < allMeanCorrelationValue && weakMeanCoherence < allMeanCoherenceValue;
  const netDiagonalCrossTermCancellation = weakMeanCancellation < 1;
  return { byPickupSide: channels, pooledAtoBChangeDb: valueSummary(pooled),
    pooledRelationships: { pearsonPooledMeasuredDbWithMeanCenterNeighborCorrelation: fullCorrelation,
      pearsonPooledMeasuredDbWithCancellationRatio: fullCancellation,
      bottomQuartileVsAllMeanCenterNeighborCorrelation: { bottomQuartile: weakMeanCorrelation, all48: allMeanCorrelationValue },
      bottomQuartileVsAllCancellationRatio: { bottomQuartile: weakMeanCancellation, all48: allMeanCancellation },
      bottomQuartileVsAllCoherenceEfficiency: { bottomQuartile: weakMeanCoherence, all48: allMeanCoherenceValue },
      bottomQuartileNegativePairFraction: weakCorrelations.filter(value => value < 0).length / weakCorrelations.length },
    interpretation: reducedLocalCoherence
      ? `Weak pooled cases have lower local coherence than the rest, but their mean correlation remains ${weakMeanCorrelation.toFixed(3)} and their mean diagonal-reference ratio is ${weakMeanCancellation.toFixed(3)}${netDiagonalCrossTermCancellation ? ' (below 1, net cross-term cancellation)' : ' (above 1, net cross terms remain constructive)'}; this supports reduced coherence as a contributor, not predominantly anti-phase neighbors. The loss is the normalized spatial average of a varying modal field: it lowers the center weight to ${apertureWeight(pickups, 'left').toFixed(3)} (L) / ${apertureWeight(pickups, 'right').toFixed(3)} (R), which preserves uniform displacement but not the point-pickup RMS.`
      : 'Weak pooled cases do not show reduced local coherence versus the rest; local phase cancellation is not supported as the primary explanation. Inspect the center and neighbor amplitude balance in the per-node component records.' };
}

function cancellationCsv(rows, pickups) {
  const columns = ['nodeIndex', 'gridCell', 'gridX', 'gridY', 'AtoB.leftDb', 'AtoB.rightDb', 'AtoB.pooledDb'];
  for (const pickup of pickups) {
    const prefix = pickup.side;
    columns.push(`${prefix}.rawSumRms`, `${prefix}.normalizedSumRms`, `${prefix}.centerRms`,
      `${prefix}.centerToSumDb`, `${prefix}.diagonalReferenceRms`, `${prefix}.cancellationRatio`,
      `${prefix}.coherenceEfficiency`, `${prefix}.crossTermPower`);
    for (let i = 1; i < pickup.neighborhood.length; i++) columns.push(
      `${prefix}.neighbor${i}Node`, `${prefix}.neighbor${i}Rms`, `${prefix}.neighbor${i}CenterCorrelation`,
      `${prefix}.neighbor${i}SignAgreement`);
  }
  const lines = rows.map(row => [row.nodeIndex, row.gridCell, row.gridX, row.gridY,
    row.aToB.leftDb, row.aToB.rightDb, row.aToB.pooledDb,
    ...row.sides.flatMap(side => [side.summedApertureRms.beforeNormalization, side.summedApertureRms.afterNormalization,
      side.components[0].rms, side.centerToNormalizedAperture.changeDb, side.cancellation.diagonalOnlyReferenceRms,
      side.cancellation.cancellationRatioVsDiagonal, side.cancellation.coherenceEfficiency, side.cancellation.crossTermPower,
      ...side.components.slice(1).flatMap(component => [component.nodeIndex, component.rms,
        component.centerCorrelation, component.centerSignAgreement])])].join(','));
  return `${columns.join(',')}\n${lines.join('\n')}\n`;
}

function signAgreement(a, b) {
  let compared = 0, same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== 0 && b[i] !== 0) {
    compared++; if (Math.sign(a[i]) === Math.sign(b[i])) same++;
  }
  return compared ? same / compared : null;
}

function apertureWeight(pickups, side) {
  const pickup = pickups.find(row => row.side === side);
  return pickup?.neighborhood.find(item => item.node === pickup.centerNode)?.normalizedWeight ?? 0;
}

function valueSummary(values) {
  return { count: values.length, minimum: min(values), p10: percentile(values, .1), median: median(values),
    mean: mean(values), maximum: Math.max(...values) };
}

async function captureP1() {
  let rngState = 20261005 >>> 0, firstBirth = null;
  const audioEngine = { context: { currentTime: 0 }, async createWorklet(_name, _url, _config, _onMessage, _onError, output = {}) {
    const gain = { value: output.gain ?? 1, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; },
      linearRampToValueAtTime(value) { this.value = value; } };
    return { node: { port: { onmessage: null, postMessage() {}, close() {} }, addEventListener() {}, removeEventListener() {} },
      gainNode: { gain }, disconnect() {} };
  } };
  const audioBridge = new AntEnvironmentAudioBridge({ audioEngine });
  const controller = new AntController({ random: () => {
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 0x100000000;
  }, audioBridge, state: { audioExperiment: { mode: 'bornSurface', baseSubstrate: true } } });
  const unsubscribe = controller.subscribe(({ type, payload }) => { if (type === 'plate-birth' && !firstBirth) firstBirth = payload; });
  try {
    await controller.init(); controller.setAudioVolume(0.35); await controller.setAudioEnabled(true);
    while (!firstBirth && controller.simulationTimeMs < 120000) controller.tick(1 / 60);
    assert.ok(firstBirth, 'seeded replay reaches P1 birth');
    return { controller, firstBirth, topology: structuredClone(audioBridge.surface.topology),
      surfaceGain: audioBridge.surface.worklet.gainNode.gain.value };
  } catch (error) { unsubscribe(); await controller.destroy(); throw error; }
  finally { unsubscribe(); }
}

function makeAperture(topology) {
  const sigma = 1, start = topology.nodeOffsets[0], end = topology.nodeOffsets[1];
  const nodeWeights = { left: Array(topology.nodeGridIndices.length).fill(0), right: Array(topology.nodeGridIndices.length).fill(0) };
  const pickups = [0, 1].map(side => {
    const center = topology.pickupNodeIndices[side];
    assert.ok(center >= start && center < end, 'pickup center belongs to P1 layer');
    const candidates = [{ node: center, distanceCells: 0 }];
    for (let slot = center * 4; slot < center * 4 + 4; slot++) {
      const node = topology.neighborIndices[slot];
      if (node < 0) continue;
      assert.ok(node >= start && node < end, 'compiled edge remains within same Plate layer');
      assert.ok(!candidates.some(row => row.node === node), 'graph neighbors are unique');
      const a = topology.nodeGridIndices[center], b = topology.nodeGridIndices[node];
      const distanceCells = Math.hypot(a % SURFACE_SOLVER_GRID - b % SURFACE_SOLVER_GRID,
        Math.floor(a / SURFACE_SOLVER_GRID) - Math.floor(b / SURFACE_SOLVER_GRID));
      assert.equal(distanceCells, 1, 'compiled 1-hop neighbors are cardinally adjacent');
      candidates.push({ node, distanceCells });
    }
    const raw = candidates.map(row => Math.exp(-(row.distanceCells ** 2) / (2 * sigma ** 2)));
    const total = raw.reduce((sum, value) => sum + value, 0);
    const weights = raw.map(value => value / total);
    const sideName = side === 0 ? 'left' : 'right';
    candidates.forEach((row, index) => { nodeWeights[sideName][row.node] = weights[index]; });
    const sum = weights.reduce((value, weight) => value + weight, 0);
    assert.ok(Math.abs(sum - 1) < 1e-12, `${sideName} weights sum to unity`);
    assert.equal(weights.reduce((value, weight) => value + weight * 1, 0), sum, 'uniform signed displacement preserves unity');
    return { side: sideName, centerNode: center, centerCell: topology.nodeGridIndices[center],
      neighborhood: candidates.map((row, index) => ({ ...row, rawWeight: raw[index], normalizedWeight: weights[index] })),
      weightSum: sum, uniformDisplacementResponse: sum };
  });
  assert.notDeepEqual(nodeWeights.left, nodeWeights.right, 'L/R apertures remain independently centered');
  return { nodeWeights, pickups };
}

function addApertureReadout(source) {
  source = source.replace(/\r\n/g, '\n');
  const before = '      if (node === t.pickupNodeIndices[layer * 2]) outL += next;\n      if (node === t.pickupNodeIndices[layer * 2 + 1]) outR += next;';
  assert.equal(source.split(before).length - 1, 1, 'one production pickup readout anchor');
  const after = '      outL += next * (this.__evAperture.left[node] || 0);\n      outR += next * (this.__evAperture.right[node] || 0);';
  const candidate = source.replace(before, after);
  assert.notEqual(candidate, source);
  assert.ok(candidate.includes('outL += next * (this.__evAperture.left[node] || 0)'));
  assert.ok(candidate.includes('outR += next * (this.__evAperture.right[node] || 0)'));
  return candidate;
}

function instrumentWorklet(source, { trace = false } = {}) {
  source = source.replace(/\r\n/g, '\n');
  const replaceOnce = (before, after) => {
    assert.equal(source.split(before).length - 1, 1, `scheduler anchor: ${before.slice(0, 42)}`);
    source = source.replace(before, after);
  };
  replaceOnce('  constructor() {', '  constructor(options) {');
  replaceOnce('    super();', '    super(); const schedule=options.processorOptions.evidenceSchedule; this.__evFrame=0; this.__evEnd=schedule.endFrame; this.__evEvents=schedule.events; this.__evCursor=0; this.__evDone=false; this.__evReady=false; this.__evAperture=options.processorOptions.evidenceAperture;');
  replaceOnce('    this.port.onmessage = (event) => this.handleMessage(event.data);',
    "    this.port.onmessage = (event) => this.handleMessage(event.data);\n    this.handleMessage({type:'topology',payload:options.processorOptions.evidenceTopology});");
  if (trace) {
    replaceOnce("    this.handleMessage({type:'topology',payload:options.processorOptions.evidenceTopology});",
      "    this.handleMessage({type:'topology',payload:options.processorOptions.evidenceTopology});\n    this.__evTrace=options.processorOptions.evidenceTrace; this.__evTraceLookup=new Int32Array(this.current.length); this.__evTraceLookup.fill(-1); this.__evTrace.nodes.forEach((node,index)=>this.__evTraceLookup[node]=index); this.__evTraceData=this.__evTrace.nodes.map(()=>new Float64Array(this.__evTrace.sampleCount)); this.__evTraceAt=-1;");
    replaceOnce('    const t = this.topology, N = this.current.length;',
      '    this.__evTraceAt=-1; if(this.__evTrace && this.__evFrame>this.__evTrace.startFrame && this.__evFrame<=this.__evTrace.endFrame) { const step=(this.__evFrame-this.__evTrace.startFrame)/8-1; if(Number.isInteger(step) && step>=0 && step<this.__evTrace.sampleCount) { this.__evTraceAt=step; for(let i=0;i<this.__evTraceData.length;i++)this.__evTraceData[i][step]=0; } }\n    const t = this.topology, N = this.current.length;');
    replaceOnce('      this.next[node] = next;',
      '      this.next[node] = next; if(this.__evTraceAt>=0) { const traceIndex=this.__evTraceLookup[node]; if(traceIndex>=0)this.__evTraceData[traceIndex][this.__evTraceAt]=next; }');
  }
  replaceOnce('    if (this.destroyed) return false;',
    "    if (this.destroyed) return false;\n    if (!this.__evReady) { this.__evReady=true; this.port.postMessage({type:'evidence-ready',frame:this.__evFrame,endFrame:this.__evEnd,scheduled:this.__evEvents.length}); }");
  replaceOnce('    for (let frame = 0; frame < left.length; frame++) {',
    '    for (let frame = 0; frame < left.length; frame++) {\n      while(this.__evCursor<this.__evEvents.length && this.__evEvents[this.__evCursor].frame<=this.__evFrame)this.handleMessage(this.__evEvents[this.__evCursor++].message); this.__evFrame++;');
  replaceOnce('    return true;\n  }\n\n  advancePhysics()',
    "    if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',strikes:this.telemetry.strikes,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,diagnostics:this.getDiagnostics?.()||null}); }\n    return true;\n  }\n\n  advancePhysics()");
  if (trace) replaceOnce("diagnostics:this.getDiagnostics?.()||null}); }",
    "diagnostics:this.getDiagnostics?.()||null,trace:this.__evTraceData.map(row=>Array.from(row))}); }");
  return source;
}

async function capture(page, { source, topology, aperture, events, frames, surfaceGain, expectedStrikes, traceNodes = null }) {
  return page.evaluate(async input => {
    const sampleRate = 48000;
    if (input.traceNodes && ((input.frames - input.events[0].frame) % 8 !== 0
      || (input.frames - input.events[0].frame) / 8 !== 600)) throw new Error('signed trace requires one exact 600-step 100 ms window');
    const schedule = { endFrame: input.frames, events: input.events.map(event => ({ frame: event.frame,
      message: { type: 'strike', payload: event.payload } })) };
    const context = new OfflineAudioContext(2, input.frames, sampleRate);
    const url = URL.createObjectURL(new Blob([input.source], { type: 'text/javascript' }));
    await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(context, 'surface-plate-processor', { numberOfInputs: 0,
      numberOfOutputs: 1, outputChannelCount: [2], processorOptions: {
        evidenceTopology: { ...input.topology, maxLayers: 256 }, evidenceSchedule: schedule,
        evidenceAperture: input.aperture,
        evidenceTrace: input.traceNodes ? { nodes: input.traceNodes, startFrame: input.events[0].frame,
          endFrame: input.frames, sampleCount: 600 } : null } });
    const gain = context.createGain(); gain.gain.value = input.surfaceGain; node.connect(gain); gain.connect(context.destination);
    let resolveReady, resolveDone, rejectDone;
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('aperture scheduler ready timeout')), 10000);
      resolveReady = value => { clearTimeout(timer); resolve(value); };
    });
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('aperture PCM render timeout')), 90000);
      resolveDone = value => { clearTimeout(timer); resolve(value); };
      rejectDone = error => { clearTimeout(timer); reject(error); };
      node.addEventListener('processorerror', () => rejectDone(new Error('aperture AudioWorklet error')), { once: true });
    });
    node.port.onmessage = event => {
      if (event.data?.type === 'evidence-ready') resolveReady(event.data);
      if (event.data?.type === 'evidence-done') resolveDone(event.data);
    };
    let buffer, readyReport, doneReport;
    try { [buffer, readyReport, doneReport] = await Promise.all([context.startRendering(), ready, done]); }
    catch (error) { rejectDone(error); throw error; }
    const excess = doneReport.renderedFrames - input.frames;
    if (readyReport.frame !== 0 || readyReport.endFrame !== input.frames
      || readyReport.scheduled !== input.events.length || excess < 0 || excess >= 128
      || doneReport.scheduled !== input.events.length || doneReport.strikes !== input.expectedStrikes
      || doneReport.diagnostics?.strikes !== input.expectedStrikes || doneReport.diagnostics?.droppedRoutes !== 0) {
      throw new Error(`aperture scheduler mismatch: ${JSON.stringify({ readyReport, doneReport })}`);
    }
    const bytes = new Uint8Array(44 + input.frames * 8), view = new DataView(bytes.buffer);
    bytes.set([82, 73, 70, 70]); view.setUint32(4, bytes.length - 8, true);
    bytes.set([87, 65, 86, 69, 102, 109, 116, 32], 8); view.setUint32(16, 16, true);
    view.setUint16(20, 3, true); view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 8, true); view.setUint16(32, 8, true); view.setUint16(34, 32, true);
    bytes.set([100, 97, 116, 97], 36); view.setUint32(40, input.frames * 8, true);
    for (let i = 0, offset = 44; i < input.frames; i++, offset += 8) {
      view.setFloat32(offset, buffer.getChannelData(0)[i], true);
      view.setFloat32(offset + 4, buffer.getChannelData(1)[i], true);
    }
    node.disconnect(); node.port.close();
    let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { wav: btoa(binary), ready: readyReport, done: doneReport };
  }, { source, topology, aperture, events, frames, surfaceGain, expectedStrikes, traceNodes });
}

async function renderVisuals(page, { aPcmBytes, bNaturalBytes, contacts, map, bRows }) {
  const rendered = await page.evaluate(async input => {
    const { decodeStereoFloatWav, buildStratigraphyAudioOverview, renderStratigraphyAudioOverview } =
      await import('/scripts/stratigraphy-audio-overview.js');
    const { buildStratigraphyAudioSnapshot, renderStratigraphyAudioComparison,
      stratigraphyLuminanceForDbfs } = await import('/scripts/audio-snapshot-renderer.js');
    const tracks = [];
    for (const [key, label, base64] of input.tracks) {
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const pcm = decodeStereoFloatWav(bytes);
      const overview = buildStratigraphyAudioOverview({ channels: pcm.channels, sampleRate: pcm.sampleRate,
        simulationDurationSeconds: 10, clockAnchors: [{ simulationTimeMs: 0, audioSampleIndex: 0 },
          { simulationTimeMs: 10000, audioSampleIndex: pcm.sampleCount }], events: input.contacts });
      const canvas = document.createElement('canvas'); renderStratigraphyAudioOverview(canvas, overview);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, 34);
      ctx.fillStyle = '#111'; ctx.font = '15px sans-serif';
      ctx.fillText(`${label} · P1 birth at 0 s · frozen 63-strike window · fixed ANT scale`, 14, 23);
      const snapshot = buildStratigraphyAudioSnapshot(pcm.channels, { sampleRate: pcm.sampleRate, sourceDurationSeconds: 10 });
      snapshot.label = label; tracks.push({ key, label, canvas, snapshot });
    }
    const comparison = document.createElement('canvas');
    renderStratigraphyAudioComparison(comparison, tracks.map(track => ({ label: track.label, snapshot: track.snapshot })));

    const heat = document.createElement('canvas'); heat.width = 1200; heat.height = 650;
    const ctx = heat.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, heat.width, heat.height);
    ctx.fillStyle = '#111'; ctx.font = '17px sans-serif';
    ctx.fillText('Frozen P1 node sweep · pooled RMS 100 ms · existing fixed −100…0 dBFS scale', 20, 25);
    const cell = 14, grid = 32, size = cell * grid, panelW = 600;
    for (let p = 0; p < 2; p++) {
      const x0 = p * panelW + Math.round((panelW - size) / 2), y0 = 58;
      ctx.fillStyle = '#111'; ctx.font = '15px sans-serif'; ctx.fillText(p ? 'B · 1-hop Gaussian' : 'A · point pickup', p * panelW + 18, 49);
      for (const row of input.map) {
        const value = p ? input.bRows[row.nodeIndex].windows[100].rms.pooled : row.windows[100].rmsPooled;
        const db = Math.max(-100, Math.min(0, 20 * Math.log10(Math.max(1e-30, value))));
        const level = stratigraphyLuminanceForDbfs(db);
        ctx.fillStyle = `rgb(${level},${level},${level})`;
        ctx.fillRect(x0 + row.gridX * cell, y0 + row.gridY * cell, cell, cell);
        ctx.strokeStyle = '#888'; ctx.lineWidth = 0.5;
        ctx.strokeRect(x0 + row.gridX * cell + 0.5, y0 + row.gridY * cell + 0.5, cell - 1, cell - 1);
      }
      for (const row of input.map.filter(row => row.nodeIndex === 34 || row.nodeIndex === 15)) {
        const cx = x0 + (row.gridX + 0.5) * cell, cy = y0 + (row.gridY + 0.5) * cell;
        ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fillStyle = row.nodeIndex === 34 ? '#0072B2' : '#D55E00'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(row.nodeIndex === 34 ? 'L' : 'R', cx, cy); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
      ctx.strokeStyle = '#333'; ctx.strokeRect(x0 - 1, y0 - 1, size + 2, size + 2);
    }
    const legendX = 270, legendY = 520, legendW = 660;
    for (let x = 0; x < legendW; x++) {
      const db = -100 + x / (legendW - 1) * 100;
      const level = stratigraphyLuminanceForDbfs(db); ctx.fillStyle = `rgb(${level},${level},${level})`;
      ctx.fillRect(legendX + x, legendY, 1, 14);
    }
    ctx.strokeStyle = '#333'; ctx.strokeRect(legendX, legendY, legendW, 14); ctx.fillStyle = '#111'; ctx.font = '11px sans-serif';
    for (const db of [-100, -80, -60, -40, -20, 0]) ctx.fillText(`${db} dBFS`, legendX + (db + 100) / 100 * legendW - 18, legendY + 31);
    const dataUrl = canvas => canvas.toDataURL('image/png').split(',')[1];
    return { renderer: { source: 'existing ANT stratigraphy overview/audio snapshot renderer and existing luminance transfer',
      waveformAmplitude: [-1, 1], channelMode: 'separate L/R', fftSize: 1024, window: 'Hann', hopSize: 256,
      frequencyHz: [0, 8000], dbfs: [-100, 0], grayscaleGamma: 1, normalization: 'none; fixed-scale',
      markers: 'frozen FOOT_CONTACT groups and P1 birth at audio sample 0' },
      images: [
        { file: 'A-point-pickup-fixed-overview.png', png: dataUrl(tracks[0].canvas) },
        { file: 'B-1hop-gaussian-fixed-overview.png', png: dataUrl(tracks[1].canvas) },
        { file: 'A-B-fixed-waveform-comparison.png', png: dataUrl(comparison) },
        { file: 'A-B-node-rms100-fixed-dbfs.png', png: dataUrl(heat) }
      ] };
  }, { tracks: [
    ['A-point-pickup', 'A · point pickup', Buffer.from(aPcmBytes).toString('base64')],
    ['B-1hop-gaussian', 'B · 1-hop Gaussian', Buffer.from(bNaturalBytes).toString('base64')]
  ], contacts, map, bRows });
  const images = [];
  for (const image of rendered.images) {
    const bytes = Buffer.from(image.png, 'base64'); await writeFile(resolve(out, image.file), bytes);
    images.push({ file: image.file, sha256: sha(bytes), bytes: bytes.length });
  }
  return { renderer: rendered.renderer, images };
}

function summarizeSweep(aRows, bRows) {
  const windows = [...[100, 250, 500], 'peak500'].map(windowMs => {
    const channels = {};
    for (const channel of ['left', 'right', 'pooled']) {
      const field = windowMs === 'peak500' ? channel : `rms${channel === 'left' ? 'Left' : channel === 'right' ? 'Right' : 'Pooled'}`;
      const av = aRows.map(row => windowMs === 'peak500' ? row.peak500ms[channel] : row.windows[windowMs][field]);
      const bv = bRows.map(row => windowMs === 'peak500' ? row.peak500ms[channel] : row.windows[windowMs].rms[channel]);
      channels[channel] = { A: distribution(av), B: distribution(bv),
        bToA: { minimumRatio: min(av) ? min(bv) / min(av) : null,
          p10Ratio: percentile(bv, .1) / percentile(av, .1), medianRatio: median(bv) / median(av),
          medianChangeDb: dbRatio(median(bv), median(av)) } };
    }
    return { windowMs, channels, spatialRank: Object.fromEntries(['left', 'right', 'pooled'].map(channel => {
      const field = windowMs === 'peak500' ? channel : `rms${channel === 'left' ? 'Left' : channel === 'right' ? 'Right' : 'Pooled'}`;
      const av = aRows.map(row => windowMs === 'peak500' ? row.peak500ms[channel] : row.windows[windowMs][field]);
      const bv = bRows.map(row => windowMs === 'peak500' ? row.peak500ms[channel] : row.windows[windowMs].rms[channel]);
      return [channel, rankAgreement(av, bv)];
    })) };
  });
  return { aNodeCount: aRows.length, bNodeCount: bRows.length, windows,
    candidateVsPointPoolNodeMetric: 'same 48 source-mask strike positions and frozen strike strength/footprint/hardness' };
}

function distribution(values) {
  return { minimum: min(values), p10: percentile(values, .1), median: median(values), maximum: Math.max(...values),
    maxMinRatio: max(values) / min(values), maxMinDb: dbRatio(max(values), min(values)) };
}

function rankAgreement(a, b) {
  let concordant = 0, discordant = 0, tiedByA = 0, tiedByB = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    const da = Math.sign(a[i] - a[j]), db = Math.sign(b[i] - b[j]);
    if (!da) tiedByA++;
    if (!db) tiedByB++;
    if (da && db) da === db ? concordant++ : discordant++;
  }
  return { spearmanRho: pearson(ranks(a), ranks(b)), concordantPairs: concordant,
    discordantPairs: discordant, tiesA: tiedByA, tiesB: tiedByB,
    pairwiseOrderPreservation: concordant / (concordant + discordant) };
}

function summarizeNatural(pcm) {
  const left = pcm.channels.left, right = pcm.channels.right;
  const rms = { left: rmsOf(left), right: rmsOf(right), pooled: Math.sqrt((sumSquares(left) + sumSquares(right)) / (left.length * 2)) };
  let peakLeft = 0, peakRight = 0, clippingSamples = 0, nonFiniteSamples = 0;
  for (let i = 0; i < left.length; i++) {
    for (const [sample, side] of [[left[i], 'left'], [right[i], 'right']]) {
      if (!Number.isFinite(sample)) { nonFiniteSamples++; continue; }
      if (side === 'left') peakLeft = Math.max(peakLeft, Math.abs(sample));
      else peakRight = Math.max(peakRight, Math.abs(sample));
      if (Math.abs(sample) >= 1) clippingSamples++;
    }
  }
  return { sampleRateHz: pcm.sampleRate, samplesPerChannel: left.length, rms,
    peak: { left: peakLeft, right: peakRight, maximum: Math.max(peakLeft, peakRight) },
    clippingSamples, nonFiniteSamples, stereoCorrelation: pearson(left, right) };
}

function summarizeNaturalEventWindows(a, b, events) {
  return [100, 250, 500].map(windowMs => {
    const length = windowMs * 48;
    const summaries = [a, b].map(pcm => {
      const rows = events.filter(event => event.frame + length <= pcm.sampleCount)
        .map(event => measure(pcm, event.frame, length));
      return { eligibleEvents: rows.length, excludedIncompleteTailEvents: events.length - rows.length,
        interval: '[strike frame, strike frame + duration)',
        meanRms: Object.fromEntries(['left', 'right', 'pooled'].map(channel => [channel, mean(rows.map(row => row.rms[channel]))])),
        medianRms: Object.fromEntries(['left', 'right', 'pooled'].map(channel => [channel, median(rows.map(row => row.rms[channel]))])),
        peakMaximum: { left: Math.max(...rows.map(row => row.peakLeft)), right: Math.max(...rows.map(row => row.peakRight)) } };
    });
    return { windowMs, A: summaries[0], B: summaries[1],
      medianPooledChangeDbAtoB: dbRatio(summaries[1].medianRms.pooled, summaries[0].medianRms.pooled) };
  });
}

function measure(pcm, start, length) {
  const left = pcm.channels.left, right = pcm.channels.right;
  let leftPeak = 0, rightPeak = 0, leftSum = 0, rightSum = 0, clippingSamples = 0, nonFiniteSamples = 0;
  for (let i = start; i < start + length; i++) {
    const l = left[i], r = right[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { nonFiniteSamples++; continue; }
    leftPeak = Math.max(leftPeak, Math.abs(l)); rightPeak = Math.max(rightPeak, Math.abs(r));
    leftSum += l * l; rightSum += r * r;
    clippingSamples += Number(Math.abs(l) >= 1) + Number(Math.abs(r) >= 1);
  }
  return { rms: { left: Math.sqrt(leftSum / length), right: Math.sqrt(rightSum / length),
    pooled: Math.sqrt((leftSum + rightSum) / (2 * length)) },
    peakLeft: leftPeak, peakRight: rightPeak, peakPooled: Math.max(leftPeak, rightPeak), clippingSamples, nonFiniteSamples };
}

function compareDiagnostics(diagnostics) {
  return Object.fromEntries(mixReport.pcmChecks.comparedDiagnosticFields.map(key => [key, diagnostics[key]]));
}

function toCsv(aRows, bRows) {
  const columns = ['nodeIndex', 'gridCell', 'gridX', 'gridY', 'degree', 'boundary',
    ...[100, 250, 500].flatMap(ms => [`A.rmsL${ms}`, `A.rmsR${ms}`, `A.rmsPooled${ms}`, `B.rmsL${ms}`, `B.rmsR${ms}`, `B.rmsPooled${ms}`]),
    'A.peakL', 'A.peakR', 'A.peakPooled', 'B.peakL', 'B.peakR', 'B.peakPooled', 'B.wavSha256'];
  const rows = aRows.map((a, index) => {
    const b = bRows[index];
    return [a.nodeIndex, a.gridCell, a.gridX, a.gridY, a.degree, a.boundary,
      ...[100, 250, 500].flatMap(ms => [a.windows[ms].rmsLeft, a.windows[ms].rmsRight, a.windows[ms].rmsPooled,
        b.windows[ms].rms.left, b.windows[ms].rms.right, b.windows[ms].rms.pooled]),
      a.peak500ms.left, a.peak500ms.right, a.peak500ms.pooled, b.peak500ms.left, b.peak500ms.right,
      b.peak500ms.pooled, b.pcm.sha256].join(',');
  });
  return `${columns.join(',')}\n${rows.join('\n')}\n`;
}

function decide(comparison, a, b) {
  const weakTail = comparison.windows.filter(row => [100, 250, 500].includes(row.windowMs))
    .map(row => ({ windowMs: row.windowMs, p10Ratio: row.channels.pooled.bToA.p10Ratio,
      minRatio: row.channels.pooled.bToA.minimumRatio, maxMinRatioA: row.channels.pooled.A.maxMinRatio,
      maxMinRatioB: row.channels.pooled.B.maxMinRatio, order: row.spatialRank.pooled.pairwiseOrderPreservation }));
  return { decision: 'reject', retainAsCandidate: false, productionApplied: false, weakTail,
    naturalPooledRmsRatio: b.rms.pooled / a.rms.pooled,
    basis: 'Pooled P10 and minimum are both lower than A in all three windows; weak-tail observability did not improve. Stop without testing alternate aperture size or weights.' };
}

function ranks(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = Array(values.length);
  for (let i = 0; i < sorted.length;) {
    let end = i + 1;
    while (end < sorted.length && sorted[end].value === sorted[i].value) end++;
    const rank = (i + end - 1) / 2 + 1;
    for (let j = i; j < end; j++) result[sorted[j].index] = rank;
    i = end;
  }
  return result;
}

function pearson(a, b) {
  const meanA = mean(a), meanB = mean(b); let numerator = 0, sumA = 0, sumB = 0;
  for (let i = 0; i < a.length; i++) { const da = a[i] - meanA, db = b[i] - meanB; numerator += da * db; sumA += da * da; sumB += db * db; }
  return sumA && sumB ? numerator / Math.sqrt(sumA * sumB) : null;
}
function rmsOf(values) { return Math.sqrt(sumSquares(values) / values.length); }
function sumSquares(values) { let sum = 0; for (const value of values) sum += value * value; return sum; }
function percentile(values, q) { const sorted = [...values].sort((a, b) => a - b), at = (sorted.length - 1) * q;
  const lo = Math.floor(at), hi = Math.ceil(at); return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo); }
function median(values) { return percentile(values, .5); }
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function min(values) { return Math.min(...values); }
function max(values) { return Math.max(...values); }
function dbRatio(a, b) { return 20 * Math.log10(a / b); }
function toFrame(timeMs, startMs) { return Math.max(0, Math.min(479999, Math.round((timeMs - startMs) * 48))); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
