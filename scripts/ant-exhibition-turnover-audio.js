import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { deserialize, serialize } from 'node:v8';
import { gunzipSync, gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { projectAcousticSuffix } from './ant-exhibition-residency-inputs.js';
import { serializable } from './ant-exhibition-variants.js';
import { encodeStereoFloatWav, sha256 } from './ant-sonic-shadow-render.js';

const CAPTURE = 'docs/ant/evidence/2026-10-21-exhibition-audio-runtime/capture-inputs.v8.gz';
const SNAPSHOT = 'docs/ant/evidence/2026-10-21-long-run-exhibition/visual-capacity-1024/snapshot-00900s.json';
const SNAPSHOT_MANIFEST = 'docs/ant/evidence/2026-10-21-long-run-exhibition/visual-capacity-1024/run-manifest.json';
const OUT = 'docs/ant/evidence/2026-10-21-long-run-exhibition/audio/turnover';
const INPUTS = `${OUT}/turnover-inputs.v8.gz`;
const WORKLET = 'static/worklets/surface-plate.worklet.js';
const RATE = 48000;

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

async function buildInputs() {
  const captureBytes = await readFile(CAPTURE), capture = deserialize(gunzipSync(captureBytes));
  const item = capture.cases.find(row => row.plateCount === 8);
  assert.ok(item, 'frozen eight-Plate capture is required');
  assert.equal(item.naturalStrikes.length, 1503, 'use all natural strike messages, not the prefiltered event list');
  assert.equal(item.events.length, 1401, 'the frozen-topology replay subset is a different input');
  const snapshotBytes = await readFile(SNAPSHOT), snapshot = JSON.parse(snapshotBytes);
  const manifestBytes = await readFile(SNAPSHOT_MANIFEST), manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.provenance.seed, capture.provenance.seed, 'long-run descriptors must share the capture seed');
  assert.equal(manifest.provenance.seed, 20261005);
  const material = snapshot.stratigraphy, order = material.stratigraphy.layerOrder;
  assert.equal(material.plates.length, 49);
  const birth = item.naturalTopologyMessages.find(row => row.layerIds.includes('trail-plate-9'));
  assert.ok(birth, 'natural topology metadata must identify Plate 9 birth');
  const birthFrame = Math.round(birth.simulationTimeMs * RATE / 1000) - item.startFrame;
  const birthRevision = item.topology.revision + 1;
  assert.ok(Number.isSafeInteger(birthFrame) && birthFrame > 0 && birthFrame < item.frames);
  const plateById = new Map(material.plates.map(plate => [plate.id, plate]));
  assert.equal(plateById.get('trail-plate-9')?.bornAtSimulationTimeMs, birth.simulationTimeMs,
    'Plate 9 immutable descriptor must carry the captured birth timestamp');
  const descriptors = ids => ids.map(id => {
    const plate = plateById.get(id);
    assert.ok(plate, `snapshot descriptor missing ${id}`);
    return plate;
  });
  const nodulesAt = timeMs => material.nodules.filter(nodule => nodule.bornAtSimulationTimeMs <= timeMs
    && order.slice(0, 9).includes(nodule.coupling?.plateId ?? nodule.burial?.foundationPlateId
      ?? nodule.coupledPlateId));
  const makeFull = (count, timeMs, generation, revision) => compileSurfaceTopology({
    plates: descriptors(order.slice(0, count)), nodules: nodulesAt(timeMs), generation,
    maxLayers: item.topology.maxLayers, stratigraphy: { revision, layerOrder: order.slice(0, count) }
  });

  const initialFull = makeFull(8, item.startTimeMs, item.topology.generation, item.topology.revision);
  assert.deepEqual(initialFull, item.topology, '900 s immutable descriptors must reconstruct captured full-8 topology');
  const initialTwo = projectAcousticSuffix(item.topology, 2);
  const initialDirect = compileSurfaceTopology({ plates: descriptors(order.slice(6, 8)), generation: item.topology.generation,
    maxLayers: item.topology.maxLayers,
    stratigraphy: { revision: item.topology.revision, layerOrder: order.slice(6, 8) } });
  assert.deepEqual(initialDirect, initialTwo, 'initial direct [7,8] compile must equal parent full-8 suffix');

  const fullNine = makeFull(9, birth.simulationTimeMs, birth.generation, birthRevision);
  const turnoverTopology = projectAcousticSuffix(fullNine, 2);
  const turnoverDirect = compileSurfaceTopology({ plates: descriptors(order.slice(7, 9)), generation: birth.generation,
    maxLayers: item.topology.maxLayers,
    stratigraphy: { revision: birthRevision, layerOrder: order.slice(7, 9) } });
  assert.deepEqual(turnoverTopology, turnoverDirect, 'post-birth direct [8,9] compile must equal full-9 suffix');
  const controlTopology = projectAcousticSuffix(fullNine, 3);
  const controlDirect = compileSurfaceTopology({ plates: descriptors(order.slice(6, 9)), generation: birth.generation,
    maxLayers: item.topology.maxLayers,
    stratigraphy: { revision: birthRevision, layerOrder: order.slice(6, 9) } });
  assert.deepEqual(controlTopology, controlDirect, 'no-retirement direct [7,8,9] compile must equal full-9 suffix');
  assert.deepEqual(initialTwo.layerIds, ['trail-plate-7', 'trail-plate-8']);
  assert.deepEqual(turnoverTopology.layerIds, ['trail-plate-8', 'trail-plate-9']);
  assert.deepEqual(controlTopology.layerIds, ['trail-plate-7', 'trail-plate-8', 'trail-plate-9']);
  assert.equal(initialTwo.noduleIds.length, 0);
  assert.equal(turnoverTopology.noduleIds.length, 0);
  assert.equal(controlTopology.noduleIds.length, 0);

  const strikes = item.naturalStrikes.map(row => ({
    frame: row.absoluteFrame - item.startFrame,
    sequence: row.sequence,
    absoluteFrame: row.absoluteFrame,
    tick: row.tick,
    simulationTimeMs: row.simulationTimeMs,
    message: row.message
  })).sort((a, b) => a.frame - b.frame || a.sequence - b.sequence);
  assert.ok(strikes.every((row, index) => row.frame >= 0 && row.frame < item.frames
    && (!index || row.frame > strikes[index - 1].frame
      || row.sequence >= strikes[index - 1].sequence)));
  const boundaryRows = strikes.filter(row => row.frame === birthFrame);

  return {
    schemaVersion: 1,
    sampleRate: RATE,
    frames: item.frames,
    capture: { path: CAPTURE, sha256: hash(captureBytes), case: item.plateCount,
      startTimeMs: item.startTimeMs, startFrame: item.startFrame, naturalStrikes: strikes.length,
      frozenSubsetEvents: item.events.length },
    snapshot: { path: SNAPSHOT, sha256: hash(snapshotBytes), manifestPath: SNAPSHOT_MANIFEST,
      manifestSha256: hash(manifestBytes), seed: manifest.provenance.seed, sourceCommit: manifest.provenance.sourceCommit,
      plateCount: material.plates.length, firstNineIds: order.slice(0, 9) },
    boundary: { frame: birthFrame, absoluteFrame: birthFrame + item.startFrame,
      simulationTimeMs: birth.simulationTimeMs, tick: birth.tick, layerIds: birth.layerIds,
      generation: birth.generation, revision: birthRevision,
      revisionBasis: 'inferred as captured full-8 material revision plus the Plate-9 birth; only metadata, not DSP input',
      sameFrameNaturalStrikes: boundaryRows.length,
      ordering: 'At the boundary, any same-frame captured strikes use pre-birth [7,8] routing and dispatch before the topology install.' },
    topologies: { initialFull, postBirthFull: fullNine,
      initialResident: initialTwo, turnoverResident: turnoverTopology, controlResident: controlTopology },
    strikes
  };
}

function routeAt(topology, message) {
  const payload = message?.payload, position = payload?.position;
  if (message?.type !== 'strike' || !payload || typeof payload.layerId !== 'string'
    || payload.plateId !== payload.layerId || !position || !Number.isFinite(position.x)
    || !Number.isFinite(position.y) || position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1
    || !Number.isFinite(payload.strength) || payload.strength <= 0
    || !Number.isFinite(payload.footprintRadius) || !Number.isFinite(payload.hardness)) return 'malformed';
  const cell = Math.round(position.y * 95) * 96 + Math.round(position.x * 95);
  const layer = topology.routingTopLayerByCell96[cell] ?? -1;
  return layer >= 0 && topology.layerIds[layer] === payload.layerId ? null : 'stale-or-mismatched-route';
}

function prepareCondition(inputs, condition) {
  const { boundary, topologies } = inputs;
  const before = topologies.initialFull, after = topologies.postBirthFull;
  const beforeResidents = topologies.initialResident, afterResidents = condition.after;
  const commonExcluded = { malformed: 0, staleOrMismatched: 0 };
  const nonresident = { before: 0, after: 0 };
  const conditionRouteMismatch = { before: 0, after: 0 };
  const selected = [];
  for (const strike of inputs.strikes) {
    const phase = strike.frame <= boundary.frame ? 'before' : 'after';
    const full = phase === 'before' ? before : after;
    const reason = routeAt(full, strike.message);
    if (reason) {
      commonExcluded[reason === 'malformed' ? 'malformed' : 'staleOrMismatched']++;
      continue;
    }
    const resident = phase === 'before' ? beforeResidents : afterResidents;
    const id = strike.message.payload.layerId;
    if (!resident.layerIds.includes(id)) { nonresident[phase]++; continue; }
    const residentReason = routeAt(resident, strike.message);
    if (residentReason) { conditionRouteMismatch[phase]++; continue; }
    selected.push({ frame: strike.frame, sequence: strike.sequence, message: strike.message });
  }
  assert.deepEqual(conditionRouteMismatch, { before: 0, after: 0 }, `${condition.id}: retained routes must be valid in resident topology`);
  const timeline = selected.concat({ frame: boundary.frame, sequence: Number.MAX_SAFE_INTEGER,
    message: { type: 'topology', payload: condition.after } }).sort((a, b) => a.frame - b.frame || a.sequence - b.sequence);
  assert.ok(timeline.every((row, index) => !index || row.frame > timeline[index - 1].frame
    || row.sequence >= timeline[index - 1].sequence), 'topology install must follow all same-frame contacts');
  return { ...condition, timeline, routeSelection: { inputNaturalStrikes: inputs.strikes.length,
    commonExcluded, nonresident, conditionRouteMismatch,
    scheduledStrikes: selected.length, expectedProcessorDroppedRoutes: 0,
    policy: 'preserve valid captured strike payloads and sequence; omit nonresident routes; do not synthesize or retarget contacts' } };
}

function observeTopologyInstall(processor, nextTopology, frame) {
  const old = processor.topology, layer = old?.layerIds.indexOf('trail-plate-7') ?? -1;
  if (layer < 0) return { frame, retiredPlatePresent: false, oldLayerIds: old?.layerIds || [],
    newLayerIds: nextTopology.layerIds };
  const start = old.nodeOffsets[layer], end = old.nodeOffsets[layer + 1], nodeCount = processor.current.length;
  const mi = layer * 4, mats = old.materialCoefficients, u = processor.current, p = processor.previous;
  let kinetic = 0, bending = 0, tension = 0, queuedL1 = 0, queuedL2 = 0;
  let queuedPeak = 0, queuedNodeSlots = 0, queuedNodeCount = 0, memorySum = 0, memoryPeak = 0, memoryNodes = 0;
  for (let node = start; node < end; node++) {
    const velocity = u[node] - p[node];
    kinetic += 0.5 * mats[mi + 2] * velocity * velocity;
    let lap = -4 * u[node];
    for (let d = 0; d < 4; d++) {
      const other = old.neighborIndices[node * 4 + d];
      if (other < 0) continue;
      lap += u[other];
      if (other > node && other >= start && other < end) tension += 0.5 * mats[mi + 1] * (u[node] - u[other]) ** 2;
    }
    bending += 0.5 * mats[mi + 2] * mats[mi] * lap * lap;
    const memory = processor.contactMemory[node];
    if (memory !== 0) { memoryNodes++; memorySum += memory; memoryPeak = Math.max(memoryPeak, Math.abs(memory)); }
    let nodeHasQueuedForce = false;
    for (let slot = 0; slot < processor.contactForces.length / nodeCount; slot++) {
      const force = processor.contactForces[slot * nodeCount + node];
      if (force === 0) continue;
      queuedNodeSlots++; queuedL1 += Math.abs(force); queuedL2 += force * force;
      queuedPeak = Math.max(queuedPeak, Math.abs(force));
      nodeHasQueuedForce = true;
    }
    if (nodeHasQueuedForce) queuedNodeCount++;
  }
  let zSpring = 0, zLinks = 0;
  for (let q = 0; q < old.adjacentLinkCoefficients.length; q++) {
    const a = old.adjacentLinkNodes[q * 2], b = old.adjacentLinkNodes[q * 2 + 1];
    if ((a >= start && a < end) || (b >= start && b < end)) {
      zSpring += 0.5 * old.adjacentLinkCoefficients[q] * (u[a] - u[b]) ** 2;
      zLinks++;
    }
  }
  return { frame, oldLayerIds: old.layerIds, newLayerIds: nextTopology.layerIds,
    retiredPlatePresent: !nextTopology.layerIds.includes('trail-plate-7'), retiredPlateId: 'trail-plate-7',
    nodeCount: end - start, energyProxy: { kinetic, bending, inPlateTension: tension, incidentZSpring: zSpring,
      total: kinetic + bending + tension + zSpring,
      definition: 'state-energy proxy in solver units; same kinetic, discrete bending/tension and incident Z-spring terms as the scaling evidence observer, not joules' },
    pendingContactPulse: { nonzeroNodeSlots: queuedNodeSlots, nodesWithQueuedSlots: queuedNodeCount,
      absoluteForceSum: queuedL1, forceL2: Math.sqrt(queuedL2), peakAbsForce: queuedPeak,
      queuedSlotCount: processor.contactForces.length / nodeCount },
    recentContactMemory: { nodes: memoryNodes, sum: memorySum, peak: memoryPeak,
      definition: 'worklet 75 ms local contact recovery state; separate from queued 3 ms pulse' },
    incidentZLinks: zLinks };
}

function pcmMetrics(pcm, frames, anchorFrame) {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let finiteSamples = 0, peak = 0, totalSquares = 0, preSquares = 0, postSquares = 0;
  let edgeLeft = null, edgeRight = null;
  const localDeltas = [];
  for (let frame = 0; frame < frames; frame++) {
    const left = view.getFloat32(frame * 8, true), right = view.getFloat32(frame * 8 + 4, true);
    if (Number.isFinite(left) && Number.isFinite(right)) finiteSamples += 2;
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
    totalSquares += left * left + right * right;
    if (frame < anchorFrame) preSquares += left * left + right * right;
    else postSquares += left * left + right * right;
    if (frame === anchorFrame) {
      edgeLeft = left - view.getFloat32((frame - 1) * 8, true);
      edgeRight = right - view.getFloat32((frame - 1) * 8 + 4, true);
    }
    if (frame >= anchorFrame - RATE / 2 && frame < anchorFrame) {
      localDeltas.push(Math.abs(left - view.getFloat32((frame - 1) * 8, true)),
        Math.abs(right - view.getFloat32((frame - 1) * 8 + 4, true)));
    }
  }
  localDeltas.sort((a, b) => a - b);
  const quantile = q => localDeltas[Math.min(localDeltas.length - 1, Math.floor(q * (localDeltas.length - 1)))];
  return { finiteSamples, sampleCount: frames * 2, nonFiniteSamples: frames * 2 - finiteSamples,
    peak, rms: Math.sqrt(totalSquares / (frames * 2)),
    preTurnoverRms: Math.sqrt(preSquares / (anchorFrame * 2)),
    postTurnoverRms: Math.sqrt(postSquares / ((frames - anchorFrame) * 2)),
    edgeDelta: { frame: anchorFrame, left: edgeLeft, right: edgeRight, maxAbs: Math.max(Math.abs(edgeLeft), Math.abs(edgeRight)) },
    preceding500msAdjacentDelta: { p50: quantile(0.5), p95: quantile(0.95), p99: quantile(0.99), max: localDeltas.at(-1) } };
}

function comparePcm(a, b, frames, anchorFrame) {
  let firstDifferentFrame = null, sumSquares = 0, maxAbs = 0, comparedValues = 0;
  for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < 2; channel++) {
    const offset = frame * 8 + channel * 4, left = a.readFloatLE(offset), right = b.readFloatLE(offset);
    if (left !== right && firstDifferentFrame === null) firstDifferentFrame = frame;
    const delta = left - right;
    sumSquares += delta * delta; maxAbs = Math.max(maxAbs, Math.abs(delta)); comparedValues++;
  }
  const prefixBytes = anchorFrame * 8;
  assert.ok(a.subarray(0, prefixBytes).equals(b.subarray(0, prefixBytes)), 'PCM must be bit-exact before turnover');
  assert.ok(firstDifferentFrame === null || firstDifferentFrame >= anchorFrame, 'PCM cannot diverge before topology boundary');
  return { firstDifferentFrame, anchorFrame, prefixBitExact: true, maxAbs,
    rms: Math.sqrt(sumSquares / comparedValues), differenceEnergyRatioPostAnchor: (() => {
      let diff = 0, base = 0;
      for (let i = prefixBytes; i < a.length; i += 4) { const x = a.readFloatLE(i), y = b.readFloatLE(i); diff += (x - y) ** 2; base += y ** 2; }
      return base > 0 ? diff / base : null;
    })() };
}

async function renderOne(page, source, frames, condition) {
  return page.evaluate(async ({ source, frames, input, observerSource }) => {
    const revive = value => {
      if (!value || typeof value !== 'object') return value;
      if (value.__typedArray) return new globalThis[value.__typedArray](value.data);
      if (Array.isArray(value)) return value.map(revive);
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
    };
    const topology = revive(input.initial), events = revive(input.timeline);
    const anchor = '    for (let frame = 0; frame < left.length; frame++) {';
    if (source.split(anchor).length !== 2) throw Error('worklet sample-loop anchor changed');
    const schedule = `\n      while (this.cursor < this.events.length && this.events[this.cursor].frame === this.frame) {\n        const row = this.events[this.cursor++];\n        if (row.message.type === 'topology') this.installObservations.push(observeTopologyInstall(this, row.message.payload, this.frame));\n        this.handleMessage(row.message);\n      }\n      this.frame++;`;
    let module = source.replace(anchor, `${anchor}${schedule}`);
    const extension = `\nclass TurnoverBench extends SurfacePlateProcessor {\n  constructor(options) { super(); this.events = options.processorOptions.events; this.frame = 0; this.cursor = 0; this.installObservations = []; this.handleMessage({type:'topology',payload:options.processorOptions.topology}); }\n  process(inputs, outputs) { const live = super.process(inputs, outputs); if (this.frame >= ${frames} && !this.sent) { this.sent = true; this.port.postMessage({done:true,diagnostics:this.getDiagnostics(),installObservations:this.installObservations}); } return live; }\n}\n`;
    module = module.replace("registerProcessor('surface-plate-processor', SurfacePlateProcessor);",
      `${observerSource}\n${extension}registerProcessor('surface-plate-processor', TurnoverBench);`);
    const context = new OfflineAudioContext(2, frames, 48000);
    const url = URL.createObjectURL(new Blob([module], { type: 'text/javascript' }));
    await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(context, 'surface-plate-processor', { numberOfInputs: 0,
      numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { topology, events } });
    const receipt = new Promise(resolve => { node.port.onmessage = event => { if (event.data.done) resolve(event.data); }; });
    node.connect(context.destination);
    const audio = await context.startRendering(), result = await receipt;
    const pcm = new Uint8Array(frames * 8), view = new DataView(pcm.buffer);
    for (let frame = 0; frame < frames; frame++) {
      view.setFloat32(frame * 8, audio.getChannelData(0)[frame], true);
      view.setFloat32(frame * 8 + 4, audio.getChannelData(1)[frame], true);
    }
    let binary = '';
    for (let at = 0; at < pcm.length; at += 32768) binary += String.fromCharCode(...pcm.subarray(at, at + 32768));
    node.disconnect(); node.port.close();
    return { pcm: btoa(binary), sampleRate: audio.sampleRate, diagnostics: result.diagnostics,
      installObservations: result.installObservations };
  }, { source, frames, input: { initial: serializable(condition.initial), timeline: serializable(condition.timeline) },
    observerSource: observeTopologyInstall.toString() });
}

async function run() {
  const packed = deserialize(gunzipSync(await readFile(INPUTS)));
  const workletSource = await readFile(WORKLET, 'utf8'), sourceSha256 = sha256(Buffer.from(workletSource));
  const conditions = [
    prepareCondition(packed, { id: 'retire-7', initial: packed.topologies.initialResident,
      after: packed.topologies.turnoverResident }),
    prepareCondition(packed, { id: 'retain-7-control', initial: packed.topologies.initialResident,
      after: packed.topologies.controlResident })
  ];
  const server = createServer((_, response) => { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<title>ANT turnover PCM</title>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH
      || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const rows = [];
    for (const condition of conditions) {
      const result = await renderOne(page, workletSource, packed.frames, condition);
      const pcm = Buffer.from(result.pcm, 'base64'); delete result.pcm;
      assert.equal(result.sampleRate, RATE);
      assert.equal(result.diagnostics.droppedRoutes, 0, `${condition.id}: worklet route drops`);
      assert.equal(result.diagnostics.dropped, 0, `${condition.id}: worklet message drops`);
      assert.equal(result.diagnostics.strikes, condition.routeSelection.scheduledStrikes,
        `${condition.id}: every scheduled strike must be delivered once`);
      assert.equal(result.diagnostics.topologies, 2, `${condition.id}: initial install plus one turnover install`);
      assert.equal(result.installObservations.length, 1);
      assert.equal(result.installObservations[0].frame, packed.boundary.frame);
      rows.push({ id: condition.id, topologyAtStart: condition.initial.layerIds,
        topologyAfterBirth: condition.after.layerIds, routeSelection: condition.routeSelection,
        sourceSha256, pcmSha256: sha256(pcm), wavPath: `${OUT}/${condition.id}.wav`,
        excerptPath: `${OUT}/${condition.id}-turnover-window.wav`,
        metrics: pcmMetrics(pcm, packed.frames, packed.boundary.frame),
        diagnostics: result.diagnostics, installObservation: result.installObservations[0], pcm });
      console.log(JSON.stringify({ stage: 'complete', id: condition.id,
        strikes: condition.routeSelection.scheduledStrikes, pcmSha256: rows.at(-1).pcmSha256,
        edgeDelta: rows.at(-1).metrics.edgeDelta, installObservation: rows.at(-1).installObservation }));
    }
    const [retirement, control] = rows.map(row => row.installObservation);
    assert.deepEqual(retirement.energyProxy, control.energyProxy, 'both candidates must have identical Plate-7 state at turnover');
    assert.deepEqual(retirement.pendingContactPulse, control.pendingContactPulse,
      'both candidates must have identical queued Plate-7 contact at turnover');
    assert.deepEqual(retirement.recentContactMemory, control.recentContactMemory,
      'both candidates must have identical local contact memory at turnover');
    assert.equal(retirement.retiredPlatePresent, true);
    assert.equal(control.retiredPlatePresent, false);
    const differential = comparePcm(rows[0].pcm, rows[1].pcm, packed.frames, packed.boundary.frame);
    const metrics = rows.map(({ pcm, ...row }) => row);
    for (let index = 0; index < rows.length; index++) {
      const pcm = rows[index].pcm, left = new Float32Array(packed.frames), right = new Float32Array(packed.frames);
      for (let frame = 0; frame < packed.frames; frame++) { left[frame] = pcm.readFloatLE(frame * 8); right[frame] = pcm.readFloatLE(frame * 8 + 4); }
      await writeFile(rows[index].wavPath, encodeStereoFloatWav({ left, right }, { sampleRate: RATE }));
      const halfSecond = RATE / 2, start = packed.boundary.frame - halfSecond, end = packed.boundary.frame + halfSecond;
      await writeFile(rows[index].excerptPath, encodeStereoFloatWav({ left: left.slice(start, end), right: right.slice(start, end) }, { sampleRate: RATE }));
    }
    const report = { schemaVersion: 1, date: new Date().toISOString(), browser: browser.version(),
      node: process.version, sampleRate: RATE, frames: packed.frames,
      gain: 'Raw worklet output at its existing fixed mix; no normalization or additional gain.',
      audioState: 'Cold 12 s solver replay from the recorded natural strike stream; the ANT world itself is unchanged and is not replayed by this harness.',
      source: { worklet: WORKLET, sha256: sourceSha256 }, inputSha256: sha256(await readFile(INPUTS)),
      boundary: packed.boundary, orderingAssumption: 'Natural topology payload was reduced to metadata in capture. Birth install is placed at its rounded sample frame after any same-frame strike payloads. Capture contains zero strikes on that exact frame; original controller foot-before-birth ordering is therefore a reconstruction assumption with no same-frame PCM effect in this window.',
      interpretationLimit: 'PCM and solver-state measurements only; no human clarity, audibility, preference or production fade claim.',
      conditions: metrics, differential };
    for (const row of report.conditions) {
      row.wavSha256 = sha256(await readFile(row.wavPath));
      row.excerptSha256 = sha256(await readFile(row.excerptPath));
    }
    await writeFile(`${OUT}/turnover-pcm.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ stage: 'verified', differential,
      reportPath: `${OUT}/turnover-pcm.json` }));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}

if (process.argv.includes('--prepare') || process.argv.includes('--self-check')) {
  const data = await buildInputs();
  const conditions = [
    prepareCondition(data, { id: 'retire-7', initial: data.topologies.initialResident, after: data.topologies.turnoverResident }),
    prepareCondition(data, { id: 'retain-7-control', initial: data.topologies.initialResident, after: data.topologies.controlResident })
  ];
  assert.equal(data.strikes.length, 1503);
  assert.equal(data.boundary.frame, 480000);
  assert.equal(data.boundary.sameFrameNaturalStrikes, 0);
  assert.deepEqual(conditions[0].timeline.filter(row => row.message.type === 'topology').map(row => row.frame), [480000]);
  assert.deepEqual(conditions[1].timeline.filter(row => row.message.type === 'topology').map(row => row.frame), [480000]);
  assert.deepEqual(conditions[0].timeline.filter(row => row.message.type === 'strike' && row.frame < data.boundary.frame),
    conditions[1].timeline.filter(row => row.message.type === 'strike' && row.frame < data.boundary.frame));
  assert.equal(conditions[0].routeSelection.commonExcluded.malformed, conditions[1].routeSelection.commonExcluded.malformed);
  assert.equal(conditions[0].routeSelection.commonExcluded.staleOrMismatched, conditions[1].routeSelection.commonExcluded.staleOrMismatched);
  assert.equal(conditions[0].routeSelection.nonresident.before, conditions[1].routeSelection.nonresident.before);
  assert.equal(conditions[0].routeSelection.commonExcluded.malformed, 0);
  assert.equal(conditions[0].routeSelection.commonExcluded.staleOrMismatched, 0);
  assert.equal(conditions[1].routeSelection.commonExcluded.malformed, 0);
  assert.equal(conditions[1].routeSelection.commonExcluded.staleOrMismatched, 0);
  assert.equal(conditions[0].routeSelection.scheduledStrikes,
    conditions[1].routeSelection.scheduledStrikes + conditions[1].routeSelection.nonresident.after
      - conditions[0].routeSelection.nonresident.after);
  assert.equal(conditions[0].routeSelection.scheduledStrikes, 841);
  assert.equal(conditions[1].routeSelection.scheduledStrikes, 855);
  if (process.argv.includes('--prepare')) {
    await mkdir(OUT, { recursive: true });
    const bytes = gzipSync(serialize(data), { level: 9 });
    assert.deepEqual(deserialize(gunzipSync(bytes)), data, 'prepared replay input must survive its V8/gzip round trip');
    await writeFile(INPUTS, bytes);
    const receipt = { schemaVersion: 1, artifact: INPUTS, sha256: hash(bytes), bytes: bytes.length,
      captureSha256: data.capture.sha256, snapshotSha256: data.snapshot.sha256,
      snapshotManifestSha256: data.snapshot.manifestSha256,
      naturalStrikes: data.strikes.length, boundary: data.boundary,
      topologyParity: { reconstructedParent8: 'exact', initialResident78: 'exact projected/compiler parity',
        turnoverResident89: 'exact projected/compiler parity', controlResident789: 'exact projected/compiler parity' },
      conditions: conditions.map(({ id, routeSelection, initial, after }) => ({ id,
        initial: initial.layerIds, after: after.layerIds, routeSelection })) };
    await writeFile(`${OUT}/turnover-inputs-receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify(receipt, null, 2));
  } else console.log(JSON.stringify({ selfCheck: 'passed', naturalStrikes: data.strikes.length,
    boundaryFrame: data.boundary.frame, sameFrameStrikes: data.boundary.sameFrameNaturalStrikes,
    conditions: conditions.map(({ id, routeSelection }) => ({ id, routeSelection })) }, null, 2));
} else await run();
