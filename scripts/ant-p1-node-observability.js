import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';
import { SURFACE_SOURCE_GRID, SURFACE_SOLVER_GRID } from '../src/lib/audio/compileSurfaceTopology.js';

const root = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/audio');
const out = resolve(root, 'p1-node-observability');
const prior = JSON.parse(await readFile(resolve(root, 'audio-ab-report.json')));
const priorDistance = JSON.parse(await readFile(resolve(root, 'pickup-distance-readout/pickup-distance-report.json')));
const frozenBytes = await readFile(resolve(root, prior.sourceRun.eventStreamFile));
assert.equal(sha(frozenBytes), prior.sourceRun.gzipSha256);
const frozen = JSON.parse(gunzipSync(frozenBytes));
assert.equal(frozen.bornStrikes.length, 63);
assert.ok(frozen.bornStrikes.every(row => row.payload.plateId === 'trail-plate-1'));
const strikeTemplate = frozen.bornStrikes[0].payload;

const fresh = await captureP1();
let browser, server;
try {
  const { plate, firstBirth, topology, surfaceGain } = fresh;
  assert.equal(sha(JSON.stringify(firstBirth)), prior.sourceRun.firstPlateDescriptorSha256);
  assert.equal(sha(JSON.stringify(firstBirth)), priorDistance.source.firstPlateDescriptorSha256);
  assert.equal(firstBirth.id, 'trail-plate-1');
  assert.equal(firstBirth.bornAtSimulationTimeMs / 1000, 103.01666666667376);
  assert.deepEqual(topology.layerIds, ['trail-plate-1']);
  assert.equal(topology.nodeOffsets[1] - topology.nodeOffsets[0], 48);
  assert.equal((topology.noduleIds || []).length, 0);
  assert.equal(surfaceGain, priorDistance.source.baselinePcm.surfaceGain);
  const pickups = [0, 1].map(side => {
    const node = topology.pickupNodeIndices[side], cell = topology.nodeGridIndices[node];
    return { node, cell, x: (cell % SURFACE_SOLVER_GRID) / (SURFACE_SOLVER_GRID - 1),
      y: Math.floor(cell / SURFACE_SOLVER_GRID) / (SURFACE_SOLVER_GRID - 1) };
  });
  assert.deepEqual(pickups.map(pickup => ({ node: pickup.node, cell: pickup.cell })),
    priorDistance.topology.compiledPickups.map(pickup => ({ node: pickup.node, cell: pickup.cell })));
  assert.ok(strikeTemplate.strength > 0 && strikeTemplate.footprintRadius > 0);

  const nodes = makeNodes(plate, topology, pickups);
  await mkdir(out, { recursive: true });
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>P1 evidence</title>'); return; }
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
  const source = await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');
  assert.equal(sha(source), priorDistance.productionState.workletSha256, 'frozen production-A worklet');
  const instrumented = instrumentWorklet(source);
  const rows = [];
  for (const node of nodes) {
    const payload = { ...strikeTemplate, plateId: firstBirth.id, layerId: firstBirth.id, position: node.strikePosition };
    const captured = await captureNode(page, { source: instrumented, topology, payload, surfaceGain });
    const bytes = Buffer.from(captured.wav, 'base64');
    const pcm = decodeWav(bytes);
    const eventFrame = 480, windowFrames = { 100: 4800, 250: 12000, 500: 24000 };
    const windows = Object.fromEntries(Object.entries(windowFrames).map(([duration, length]) =>
      [duration, measure(pcm, eventFrame, length)]));
    assert.equal(captured.done.strikes, 1, `node ${node.nodeIndex} strike accepted`);
    assert.equal(captured.done.diagnostics?.dropped, 0);
    assert.equal(captured.done.diagnostics?.droppedRoutes, 0);
    assert.equal(windows[500].nonFiniteSamples, 0);
    assert.ok(windows[500].peakPooled < 1, `node ${node.nodeIndex} peak below full scale`);
    const wav = `node-${String(node.nodeIndex).padStart(2, '0')}-x${String(node.gridX).padStart(2, '0')}-y${String(node.gridY).padStart(2, '0')}-510ms-f32.wav`;
    try { assert.equal(sha(bytes), sha(await readFile(resolve(out, wav))), `repeat capture matches stored ${wav}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(resolve(out, wav), bytes); }
    rows.push({ ...node, payload: { plateId: payload.plateId, layerId: payload.layerId,
      strength: payload.strength, footprintRadius: payload.footprintRadius, hardness: payload.hardness },
      acceptedStrikes: captured.done.strikes, diagnostics: captured.done.diagnostics, windows,
      peak500ms: { left: windows[500].peakLeft, right: windows[500].peakRight, pooled: windows[500].peakPooled },
      pcm: { file: wav, sha256: sha(bytes), bytes: bytes.length } });
  }
  assert.equal(rows.length, topology.nodeGridIndices.length, 'measure every compiled P1 solver node');
  assert.ok(rows.every(row => row.payload.strength === strikeTemplate.strength
    && row.payload.footprintRadius === strikeTemplate.footprintRadius
    && row.payload.hardness === strikeTemplate.hardness), 'all node strikes share frozen parameters');
  const visuals = await renderHeatmaps(page, { rows, pickups, browserVersion: browser.version() });
  const report = {
    status: 'frozen-P1-full-solver-node-observability-map',
    decisionScope: 'One isolated equal-strength strike per valid frozen P1 solver node. No DSP, routing, Plate, substrate or simulation change.',
    source: { seed: frozen.seed, inputFile: prior.sourceRun.eventStreamFile,
      inputGzipSha256: sha(frozenBytes), inputMatchesFrozen: true, firstPlateId: firstBirth.id,
      firstPlateBirthSeconds: firstBirth.bornAtSimulationTimeMs / 1000,
      firstPlateDescriptorSha256: sha(JSON.stringify(firstBirth)), workletSha256: sha(source),
      priorFrozenStrikeScheduleSha256: priorDistance.source.frozenScheduleSha256,
      acceptedNaturalP1StrikesInSource: frozen.bornStrikes.length },
    capture: { browser: browser.version(), engine: 'Chrome OfflineAudioContext + unchanged production-A AudioWorklet',
      sampleRateHz: 48000, controlStrikeFrame: 480, preStrikeMs: 10, measuredPostStrikeWindowsMs: [100, 250, 500],
      captureFrames: 24480, captureMs: 510, surfaceGain, nodeStrikeCount: rows.length,
      strike: { strength: strikeTemplate.strength, footprintRadius: strikeTemplate.footprintRadius,
        hardness: strikeTemplate.hardness, sourceEventSimulationTimeMs: frozen.bornStrikes[0].simulationTimeMs } },
    topology: { sourceGrid: SURFACE_SOURCE_GRID, solverGrid: SURFACE_SOLVER_GRID,
      layerIds: topology.layerIds, solverNodeCount: rows.length, pickupLNode: pickups[0].node,
      pickupRNode: pickups[1].node, graph: 'P1 compiled neighborIndices; four cardinal solver edges; geodesic distance is unweighted edge count',
      boundary: 'true when degree < 4 because at least one cardinal solver neighbor is absent',
      strikePosition: 'nearest occupied 96x96 P1 source-mask pixel to each target solver-node center; records offset, including edge-only compiled nodes' },
    distanceDefinitions: { euclidean: 'distance between solver-node centers and compiled pickup-node centers; normalized XY and solver-grid-cell units',
      geodesic: 'shortest-path edge count over compiled P1 neighbor graph from each compiled pickup node' },
    metricDefinitions: { peak: 'maximum absolute PCM sample over the 500 ms post-strike window; pooled peak = max(L peak, R peak)',
      rms: 'event-aligned [strike frame, strike frame + duration); pooled RMS = sqrt((sum L^2 + sum R^2)/(2N))',
      amplitudes: 'raw float32 PCM after unchanged output gain and soft limiter; no normalization' },
    summary: summarize(rows), nodes: rows, visuals,
    productionState: { unchanged: true, substrateSettingsChanged: false, contactPulseMs: 3,
      recoveryMs: 75, plateDampingMultiplier: 50, mixer: 'production A unchanged' }
  };
  await writeFile(resolve(out, 'p1-node-observability.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(resolve(out, 'p1-node-observability.csv'), toCsv(rows));
  console.log(JSON.stringify({ out, browser: report.capture.browser, nodes: rows.length,
    degreeDistribution: report.summary.degreeDistribution, boundaryNodes: report.summary.boundaryNodeCount,
    correlations: report.summary.correlations, lowOutput: report.summary.lowOutputNodes,
    highOutput: report.summary.highOutputNodes, heatmaps: visuals.images.map(image => image.file) }, null, 2));
} finally {
  await fresh.controller.destroy();
  await browser?.close();
  if (server?.listening) await new Promise(resolveClose => {
    server.close(resolveClose); server.closeAllConnections();
  });
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
    assert.ok(firstBirth, 'seeded replay must reach P1 birth');
    return { controller, firstBirth, plate: controller.trailPlateBirth.getPlates()[0],
      topology: structuredClone(audioBridge.surface.topology), surfaceGain: audioBridge.surface.worklet.gainNode.gain.value };
  } catch (error) { unsubscribe(); await controller.destroy(); throw error; }
  finally { unsubscribe(); }
}

function makeNodes(plate, topology, pickups) {
  const result = [];
  for (let node = topology.nodeOffsets[0]; node < topology.nodeOffsets[1]; node++) {
    const cell = topology.nodeGridIndices[node], gridX = cell % SURFACE_SOLVER_GRID;
    const gridY = Math.floor(cell / SURFACE_SOLVER_GRID), solverPosition = { x: gridX / 31, y: gridY / 31 };
    const sourceCell = nearestSourceCellForSolverNode(plate.mask, gridX, gridY);
    const strikePosition = { x: (sourceCell % SURFACE_SOURCE_GRID) / 95,
      y: Math.floor(sourceCell / SURFACE_SOURCE_GRID) / 95 };
    const neighbors = Array.from(topology.neighborIndices.subarray(node * 4, node * 4 + 4)).filter(index => index >= 0);
    const degree = neighbors.length;
    assert.equal(routeLayer(topology, strikePosition), 0, `source cell ${sourceCell} routes to P1`);
    result.push({ nodeIndex: node, gridCell: cell, gridX, gridY, solverPosition, strikePosition, strikeSourceCell: sourceCell,
      strikeOffsetSolverCells: Math.hypot(strikePosition.x * 31 - gridX, strikePosition.y * 31 - gridY),
      degree, boundary: degree < 4, neighborNodeIndices: neighbors,
      euclideanToPickupL: distanceRecord(solverPosition, pickups[0]),
      euclideanToPickupR: distanceRecord(solverPosition, pickups[1]),
      geodesicToPickupL: bfs(topology, pickups[0].node)[node],
      geodesicToPickupR: bfs(topology, pickups[1].node)[node] });
  }
  return result;
}

function nearestSourceCellForSolverNode(mask, gridX, gridY) {
  let best = -1, bestDistance = Infinity;
  for (let source = 0; source < mask.length; source++) {
    if (!mask[source]) continue;
    const x = source % SURFACE_SOURCE_GRID, y = Math.floor(source / SURFACE_SOURCE_GRID);
    const d = Math.hypot(x / 95 * 31 - gridX, y / 95 * 31 - gridY);
    if (d < bestDistance) { best = source; bestDistance = d; }
  }
  assert.notEqual(best, -1, `source mask must contribute to solver node ${gridX},${gridY}`);
  return best;
}

function bfs(topology, start) {
  const distances = new Int32Array(topology.nodeGridIndices.length).fill(-1), queue = [start];
  distances[start] = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const node = queue[cursor];
    for (let slot = node * 4; slot < node * 4 + 4; slot++) {
      const neighbor = topology.neighborIndices[slot];
      if (neighbor >= 0 && distances[neighbor] < 0) { distances[neighbor] = distances[node] + 1; queue.push(neighbor); }
    }
  }
  return distances;
}

function instrumentWorklet(source) {
  source = source.replace(/\r\n/g, '\n');
  const replaceOnce = (before, after) => {
    assert.equal(source.split(before).length - 1, 1, `instrumentation anchor: ${before.slice(0, 48)}`);
    source = source.replace(before, after);
  };
  replaceOnce('  constructor() {', '  constructor(options) {');
  replaceOnce('    super();', '    super(); const schedule=options.processorOptions.evidenceSchedule; this.__evFrame=0; this.__evEnd=schedule.endFrame; this.__evEvents=schedule.events; this.__evCursor=0; this.__evDone=false; this.__evReady=false;');
  replaceOnce('    this.port.onmessage = (event) => this.handleMessage(event.data);',
    "    this.port.onmessage = (event) => this.handleMessage(event.data);\n    this.handleMessage({type:'topology',payload:options.processorOptions.evidenceTopology});");
  replaceOnce('    if (this.destroyed) return false;',
    "    if (this.destroyed) return false;\n    if (!this.__evReady) { this.__evReady=true; this.port.postMessage({type:'evidence-ready',frame:this.__evFrame,endFrame:this.__evEnd,scheduled:this.__evEvents.length}); }");
  replaceOnce('    for (let frame = 0; frame < left.length; frame++) {',
    "    for (let frame = 0; frame < left.length; frame++) {\n      while(this.__evCursor<this.__evEvents.length && this.__evEvents[this.__evCursor].frame<=this.__evFrame)this.handleMessage(this.__evEvents[this.__evCursor++].message); this.__evFrame++;");
  replaceOnce('    return true;\n  }\n\n  advancePhysics()',
    "    if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',strikes:this.telemetry.strikes,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,diagnostics:this.getDiagnostics?.()||null}); }\n    return true;\n  }\n\n  advancePhysics()");
  return source;
}

async function captureNode(page, input) {
  return page.evaluate(async ({ source, topology, payload, surfaceGain }) => {
    const rate = 48000, frames = 24480, schedule = { endFrame: frames,
      events: [{ frame: 480, message: { type: 'strike', payload } }] };
    const context = new OfflineAudioContext(2, frames, rate);
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(context, 'surface-plate-processor', { numberOfInputs: 0,
      numberOfOutputs: 1, outputChannelCount: [2], processorOptions: {
        evidenceTopology: { ...topology, maxLayers: 256 }, evidenceSchedule: schedule } });
    const gain = context.createGain(); gain.gain.value = surfaceGain; node.connect(gain); gain.connect(context.destination);
    let readyResolve, doneResolve, doneReject;
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('node scheduler ready timeout')), 10000);
      readyResolve = value => { clearTimeout(timer); resolve(value); };
    });
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('node PCM render timeout')), 30000);
      doneResolve = value => { clearTimeout(timer); resolve(value); };
      doneReject = error => { clearTimeout(timer); reject(error); };
      node.addEventListener('processorerror', () => doneReject(new Error('P1 node AudioWorklet error')), { once: true });
    });
    node.port.onmessage = event => {
      if (event.data?.type === 'evidence-ready') readyResolve(event.data);
      if (event.data?.type === 'evidence-done') doneResolve(event.data);
    };
    let buffer, readyReport, doneReport;
    try { [buffer, readyReport, doneReport] = await Promise.all([context.startRendering(), ready, done]); }
    catch (error) { doneReject(error); throw error; }
    if (readyReport.frame !== 0 || readyReport.scheduled !== 1 || readyReport.endFrame !== frames
      || doneReport.renderedFrames < frames || doneReport.renderedFrames - frames >= 128
      || doneReport.scheduled !== 1 || doneReport.strikes !== 1
      || doneReport.diagnostics?.strikes !== 1 || doneReport.diagnostics?.droppedRoutes !== 0) {
      throw new Error(`node ${payload.position.x},${payload.position.y} scheduler mismatch: ${JSON.stringify({ readyReport, doneReport })}`);
    }
    const bytes = new Uint8Array(44 + frames * 8), view = new DataView(bytes.buffer);
    bytes.set([82, 73, 70, 70]); view.setUint32(4, bytes.length - 8, true);
    bytes.set([87, 65, 86, 69, 102, 109, 116, 32], 8); view.setUint32(16, 16, true);
    view.setUint16(20, 3, true); view.setUint16(22, 2, true); view.setUint32(24, rate, true);
    view.setUint32(28, rate * 8, true); view.setUint16(32, 8, true); view.setUint16(34, 32, true);
    bytes.set([100, 97, 116, 97], 36); view.setUint32(40, frames * 8, true);
    for (let i = 0, offset = 44; i < frames; i++, offset += 8) {
      view.setFloat32(offset, buffer.getChannelData(0)[i], true); view.setFloat32(offset + 4, buffer.getChannelData(1)[i], true);
    }
    node.disconnect(); node.port.close();
    let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { wav: btoa(binary), done: doneReport };
  }, input);
}

async function renderHeatmaps(page, { rows, pickups, browserVersion }) {
  const result = await page.evaluate(async ({ rows, pickups, browserVersion }) => {
    const { stratigraphyLuminanceForDbfs } = await import('/scripts/audio-snapshot-renderer.js');
    const gray = value => `rgb(${value},${value},${value})`;
    const maps = [
      { title: 'Peak L · 500 ms', value: row => row.peak500ms.left },
      { title: 'Peak R · 500 ms', value: row => row.peak500ms.right },
      { title: 'Pooled peak · 500 ms', value: row => row.peak500ms.pooled },
      ...[100, 250, 500].flatMap(ms => [
        { title: `L RMS · ${ms} ms`, value: row => row.windows[ms].rmsLeft },
        { title: `R RMS · ${ms} ms`, value: row => row.windows[ms].rmsRight },
        { title: `Pooled RMS · ${ms} ms`, value: row => row.windows[ms].rmsPooled }
      ])
    ];
    const paint = (ctx, rows, panel) => {
      const cell = 14, grid = 32, gridSize = cell * grid;
      const left = panel.x + Math.round((600 - gridSize) / 2), top = panel.y + 38;
      ctx.fillStyle = '#fff'; ctx.fillRect(panel.x, panel.y, 600, panel.h);
      ctx.fillStyle = '#111'; ctx.font = '15px sans-serif'; ctx.fillText(panel.title, panel.x + 16, panel.y + 23);
      ctx.fillStyle = '#fff'; ctx.fillRect(left - 1, top - 1, gridSize + 2, gridSize + 2);
      for (const row of rows) {
        const db = Math.max(-100, Math.min(0, 20 * Math.log10(Math.max(1e-30, panel.value(row)))));
        ctx.fillStyle = gray(stratigraphyLuminanceForDbfs(db));
        ctx.fillRect(left + row.gridX * cell, top + row.gridY * cell, cell, cell);
        ctx.strokeStyle = row.boundary ? '#555' : '#aaa'; ctx.lineWidth = row.boundary ? 0.9 : 0.45;
        ctx.strokeRect(left + row.gridX * cell + 0.5, top + row.gridY * cell + 0.5, cell - 1, cell - 1);
      }
      markPickups(ctx, left, top, cell, pickups);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.strokeRect(left - 1, top - 1, gridSize + 2, gridSize + 2);
      return { left, top, cell };
    };
    const output = document.createElement('canvas'); output.width = 1800; output.height = 2080;
    const ctx = output.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, output.width, output.height);
    ctx.fillStyle = '#111'; ctx.font = '17px sans-serif';
    ctx.fillText('P1 frozen solver observability · fixed dBFS scale · one identical isolated strike per node', 20, 24);
    ctx.font = '12px sans-serif'; ctx.fillText('Gray = existing ANT linear -100…0 dBFS mapping; blue/orange rings = compiled pickup L/R; heavy cell border = boundary node (degree < 4). No normalization.', 20, 44);
    for (let i = 0; i < maps.length; i++) paint(ctx, rows, { ...maps[i], x: (i % 3) * 600, y: 58 + Math.floor(i / 3) * 492, h: 486 });
    const legendY = 2026, legendX = 570, legendW = 660;
    for (let x = 0; x < legendW; x++) {
      const db = -100 + x / (legendW - 1) * 100;
      ctx.fillStyle = gray(stratigraphyLuminanceForDbfs(db)); ctx.fillRect(legendX + x, legendY, 1, 12);
    }
    ctx.strokeStyle = '#333'; ctx.strokeRect(legendX, legendY, legendW, 12);
    ctx.fillStyle = '#111'; ctx.font = '11px sans-serif';
    for (const db of [-100, -80, -60, -40, -20, 0]) {
      const x = legendX + (db + 100) / 100 * legendW; ctx.fillText(`${db} dBFS`, x - 18, legendY + 28);
    }

    const geometry = document.createElement('canvas'); geometry.width = 1800; geometry.height = 1240;
    const g = geometry.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, geometry.width, geometry.height);
    g.fillStyle = '#111'; g.font = '17px sans-serif'; g.fillText('P1 solver geometry · fixed distance scales · 4-neighbor graph', 20, 24);
    const geometryMaps = [
      { title: 'Euclidean to pickup L · solver cells', max: Math.hypot(31, 31), value: row => row.euclideanToPickupL.solverGridCells },
      { title: 'Euclidean to pickup R · solver cells', max: Math.hypot(31, 31), value: row => row.euclideanToPickupR.solverGridCells },
      { title: 'Geodesic to pickup L · edges', max: 48, value: row => row.geodesicToPickupL },
      { title: 'Geodesic to pickup R · edges', max: 48, value: row => row.geodesicToPickupR }
    ];
    for (let i = 0; i < geometryMaps.length; i++) {
      const panel = { ...geometryMaps[i], x: (i % 2) * 900, y: 42 + Math.floor(i / 2) * 520, h: 510 };
      paintDistance(g, rows, panel, pickups);
    }
    const panel = { x: 900, y: 1082, h: 120 };
    g.fillStyle = '#fff'; g.fillRect(panel.x, panel.y, 900, panel.h); g.fillStyle = '#111';
    g.font = '14px sans-serif'; g.fillText('Node key / degree / boundary', panel.x + 18, panel.y + 22);
    g.font = '12px sans-serif'; g.fillText('Number = local solver-node ID; degree is its count of cardinal P1 neighbors.', panel.x + 18, panel.y + 46);
    g.fillText('Thick outline = boundary (degree < 4). Blue/orange ring = compiled pickup L/R.', panel.x + 18, panel.y + 66);
    g.fillText('Distance scales are fixed to full 32×32 diagonal (Euclidean) and 48 graph edges (geodesic).', panel.x + 18, panel.y + 86);
    const idMap = document.createElement('canvas'); idMap.width = 900; idMap.height = 510;
    const idctx = idMap.getContext('2d'); idctx.fillStyle = '#fff'; idctx.fillRect(0, 0, 900, 510);
    idctx.fillStyle = '#111'; idctx.font = '15px sans-serif'; idctx.fillText('P1 solver node IDs · degree · boundary', 12, 20);
    paintNodeIds(idctx, rows, pickups, { x: 0, y: 26, width: 900, height: 474 });
    function markPickups(ctx, left, top, cell, points) {
      for (let side = 0; side < 2; side++) {
        const p = points[side], x = left + (p.cell % 32 + 0.5) * cell, y = top + (Math.floor(p.cell / 32) + 0.5) * cell;
        ctx.beginPath(); ctx.arc(x, y, cell * 0.38, 0, Math.PI * 2); ctx.fillStyle = side ? '#D55E00' : '#0072B2'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(side ? 'R' : 'L', x, y); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
    }
    function paintDistance(ctx, data, panel, points) {
      const cell = 15, left = panel.x + 210, top = panel.y + 40, size = 32 * cell;
      ctx.fillStyle = '#fff'; ctx.fillRect(panel.x, panel.y, 900, panel.h); ctx.fillStyle = '#111'; ctx.font = '15px sans-serif';
      ctx.fillText(panel.title, panel.x + 18, panel.y + 23);
      for (const row of data) {
        const value = Math.max(0, Math.min(panel.max, panel.value(row))), level = Math.round(255 * value / panel.max);
        ctx.fillStyle = `rgb(${level},${level},${level})`; ctx.fillRect(left + row.gridX * cell, top + row.gridY * cell, cell, cell);
        ctx.strokeStyle = row.boundary ? '#555' : '#aaa'; ctx.lineWidth = row.boundary ? 1 : 0.5;
        ctx.strokeRect(left + row.gridX * cell + 0.5, top + row.gridY * cell + 0.5, cell - 1, cell - 1);
      }
      markPickups(ctx, left, top, cell, points); ctx.strokeStyle = '#333'; ctx.strokeRect(left - 1, top - 1, size + 2, size + 2);
      const legendX = panel.x + 18, legendY = top + 20, legendW = 140;
      for (let x = 0; x < legendW; x++) { const gray = Math.round(255 * x / (legendW - 1)); ctx.fillStyle = `rgb(${gray},${gray},${gray})`; ctx.fillRect(legendX + x, legendY, 1, 12); }
      ctx.strokeStyle = '#333'; ctx.strokeRect(legendX, legendY, legendW, 12); ctx.fillStyle = '#111'; ctx.font = '11px sans-serif';
      ctx.fillText('0', legendX, legendY + 28); ctx.fillText(panel.max.toFixed(1), legendX + legendW - 28, legendY + 28);
    }
    function paintNodeIds(ctx, data, points, box) {
      const cell = 13, left = box.x + Math.round((box.width - 32 * cell) / 2), top = box.y + 20;
      for (const row of data) {
        const x = left + row.gridX * cell, y = top + row.gridY * cell;
        ctx.fillStyle = '#eee'; ctx.fillRect(x, y, cell, cell); ctx.strokeStyle = row.boundary ? '#222' : '#999';
        ctx.lineWidth = row.boundary ? 1.2 : 0.5; ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        ctx.fillStyle = '#111'; ctx.font = '7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(row.nodeIndex).padStart(2, '0'), x + cell / 2, y + cell / 2);
      }
      markPickups(ctx, left, top, cell, points); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
    const files = [
      { file: 'p1-output-heatmaps-fixed-dbfs.png', canvas: output },
      { file: 'p1-distance-heatmaps-fixed-grid-scale.png', canvas: geometry },
      { file: 'p1-node-id-degree-boundary.png', canvas: idMap }
    ];
    return { browserVersion, files: files.map(item => ({ file: item.file,
      png: item.canvas.toDataURL('image/png').split(',')[1] })) };
  }, { rows, pickups, browserVersion });
  const images = [];
  for (const item of result.files) {
    const bytes = Buffer.from(item.png, 'base64');
    try { assert.equal(sha(bytes), sha(await readFile(resolve(out, item.file))), `repeat render matches stored ${item.file}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(resolve(out, item.file), bytes); }
    images.push({ file: item.file, sha256: sha(bytes), bytes: bytes.length });
  }
  return { browser: result.browserVersion, scale: { audio: 'fixed existing ANT linear grayscale -100..0 dBFS, no normalization',
    euclidean: `fixed 0..${Math.hypot(31, 31)} solver cells`, geodesic: 'fixed 0..48 graph edges' }, images };
}

function summarize(rows) {
  const degreeDistribution = Object.fromEntries([0, 1, 2, 3, 4].map(degree => [degree, rows.filter(row => row.degree === degree).length]));
  const correlations = [100, 250, 500].map(ms => ({ windowMs: ms,
    euclideanLToLeftRms: correlation(rows.map(row => row.euclideanToPickupL.solverGridCells), rows.map(row => row.windows[ms].rmsLeft)),
    euclideanRToRightRms: correlation(rows.map(row => row.euclideanToPickupR.solverGridCells), rows.map(row => row.windows[ms].rmsRight)),
    nearestEuclideanToPooledRms: correlation(rows.map(row => Math.min(row.euclideanToPickupL.solverGridCells,
      row.euclideanToPickupR.solverGridCells)), rows.map(row => row.windows[ms].rmsPooled)),
    geodesicLToLeftRms: correlation(rows.map(row => row.geodesicToPickupL), rows.map(row => row.windows[ms].rmsLeft)),
    geodesicRToRightRms: correlation(rows.map(row => row.geodesicToPickupR), rows.map(row => row.windows[ms].rmsRight)),
    nearestGeodesicToPooledRms: correlation(rows.map(row => Math.min(row.geodesicToPickupL, row.geodesicToPickupR)),
      rows.map(row => row.windows[ms].rmsPooled)),
    degreeToPooledRms: correlation(rows.map(row => row.degree), rows.map(row => row.windows[ms].rmsPooled)) }));
  const pooled = rows.map(row => ({ nodeIndex: row.nodeIndex, gridCell: row.gridCell,
    distanceMin: Math.min(row.euclideanToPickupL.solverGridCells, row.euclideanToPickupR.solverGridCells),
    peak: row.peak500ms.pooled, rms100: row.windows[100].rmsPooled, rms250: row.windows[250].rmsPooled,
    rms500: row.windows[500].rmsPooled }));
  const sortedBy = key => [...pooled].sort((a, b) => a[key] - b[key]);
  return { nodeCount: rows.length, boundaryNodeCount: rows.filter(row => row.boundary).length,
    interiorNodeCount: rows.filter(row => !row.boundary).length, degreeDistribution, correlations,
    strikePositionOffsetsSolverCells: { mean: mean(rows.map(row => row.strikeOffsetSolverCells)),
      max: Math.max(...rows.map(row => row.strikeOffsetSolverCells)),
      distinctSourceCells: new Set(rows.map(row => row.strikeSourceCell)).size },
    lowOutputNodes: sortedBy('rms100').slice(0, 5), highOutputNodes: sortedBy('rms100').slice(-5).reverse(),
    nearestVsRms100Spearman: spearman(pooled.map(row => row.distanceMin), pooled.map(row => row.rms100)),
    nearestVsPeakSpearman: spearman(pooled.map(row => row.distanceMin), pooled.map(row => row.peak)) };
}

function measure(pcm, start, length) {
  const { left, right } = pcm; let sumL = 0, sumR = 0, peakL = 0, peakR = 0, nonFiniteSamples = 0;
  for (let i = start; i < start + length; i++) {
    const l = left[i], r = right[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { nonFiniteSamples++; continue; }
    sumL += l * l; sumR += r * r; peakL = Math.max(peakL, Math.abs(l)); peakR = Math.max(peakR, Math.abs(r));
  }
  const rmsLeft = Math.sqrt(sumL / length), rmsRight = Math.sqrt(sumR / length);
  return { startFrame: start, samplesPerChannel: length, rmsLeft, rmsRight,
    rmsPooled: Math.sqrt((sumL + sumR) / (2 * length)), peakLeft: peakL, peakRight: peakR,
    peakPooled: Math.max(peakL, peakR), nonFiniteSamples };
}

function decodeWav(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.readUInt16LE(20), 3);
  assert.equal(bytes.readUInt16LE(22), 2); assert.equal(bytes.readUInt32LE(24), 48000);
  const frames = bytes.readUInt32LE(40) / 8; assert.equal(frames, 24480);
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (let i = 0, offset = 44; i < frames; i++, offset += 8) {
    left[i] = bytes.readFloatLE(offset); right[i] = bytes.readFloatLE(offset + 4);
  }
  return { left, right };
}

function toCsv(rows) {
  const columns = ['nodeIndex', 'gridCell', 'gridX', 'gridY', 'degree', 'boundary', 'strikePosition.x', 'strikePosition.y', 'strikeSourceCell',
    'strikeOffsetSolverCells', 'euclideanToPickupL.solverGridCells', 'euclideanToPickupR.solverGridCells',
    'geodesicToPickupL', 'geodesicToPickupR', 'peak500ms.left', 'peak500ms.right', 'peak500ms.pooled',
    ...[100, 250, 500].flatMap(ms => [`windows.${ms}.rmsLeft`, `windows.${ms}.rmsRight`, `windows.${ms}.rmsPooled`])];
  const value = (row, path) => path.split('.').reduce((item, key) => item[key], row);
  return [columns.join(','), ...rows.map(row => columns.map(column => value(row, column)).join(','))].join('\n') + '\n';
}

function routeLayer(topology, position) {
  const x = Math.round(position.x * 95), y = Math.round(position.y * 95);
  return topology.routingTopLayerByCell96[y * 96 + x];
}
function distanceRecord(a, b) { const value = Math.hypot(a.x - b.x, a.y - b.y); return { normalized: value, solverGridCells: value * 31 }; }
function correlation(x, y) { return { pearsonR: pearson(x, y), spearmanRho: spearman(x, y) }; }
function pearson(x, y) {
  const mx = mean(x), my = mean(y); let sum = 0, xx = 0, yy = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sum += dx * dy; xx += dx * dx; yy += dy * dy; }
  return xx && yy ? sum / Math.sqrt(xx * yy) : null;
}
function spearman(x, y) { return pearson(ranks(x), ranks(y)); }
function ranks(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value), result = new Array(values.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1; while (end < sorted.length && sorted[end].value === sorted[start].value) end++;
    const rank = (start + 1 + end) / 2; for (let i = start; i < end; i++) result[sorted[i].index] = rank; start = end;
  }
  return result;
}
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
