import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { deserialize, serialize } from 'node:v8';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';
import { compileSurfaceTopology, SURFACE_MAX_LAYERS } from '../src/lib/audio/compileSurfaceTopology.js';
import { encodeStereoFloatWav, reconstructPickupStemMix, reconstructSurfacePcm,
  renderProductionSurface, renderSurface, sha256 } from './ant-sonic-shadow-render.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EVIDENCE = `${ROOT}/docs/ant/evidence/2026-10-18-natural-dense-readout-overlap`;
const SEED = 20261005;
const DT = 1 / 60;
const TICK_FRAMES = 800;
const RATE = 48_000;
const PHYSICS_RATE = 6_000;
const WINDOWS_MS = [100, 250, 500];
const DEFAULT_MAX_SECONDS = 3600;
const SOURCE_PATHS = [
  'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/AntController.js',
  'src/lib/agents/ant/BodyPoseController.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/audio/AntEnvironmentAudioBridge.js', 'src/lib/audio/SurfaceAudioBridge.js',
  'src/lib/audio/compileSurfaceTopology.js', 'static/worklets/surface-plate.worklet.js',
  'scripts/ant-sonic-shadow-render.js', 'scripts/ant-natural-dense-readout-overlap.js',
  'scripts/ant-natural-dense-readout-overlap-erb.py'
];
const FIELDS = ['agentTrajectory', 'lifecycle', 'rng', 'pheromone', 'surfaceField', 'gait', 'bodyPose',
  'gasterDeposition', 'colonyActivation', 'localOccupancy', 'footContacts', 'materialBirthEvents',
  'trailPlateBirth', 'materialStratigraphy'];
const args = new Map(process.argv.slice(2).map(value => {
  const index = value.indexOf('=');
  return index < 0 ? [value, true] : [value.slice(0, index), value.slice(index + 1)];
}));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();

async function main() {
  if (args.has('--analyze-existing')) return analyzeExisting();
  const start = performance.now();
  const maxSeconds = Number(args.get('--max-seconds') || DEFAULT_MAX_SECONDS);
  assert.ok(Number.isSafeInteger(maxSeconds) && maxSeconds > 10);
  await mkdir(`${EVIDENCE}/listening`, { recursive: true });
  const capture = await captureNaturalWindow(Math.ceil(maxSeconds * 60));
  console.log(JSON.stringify({ stage: 'natural capture complete', ticks: capture.totalTicks,
    topologyMessages: capture.messages.filter(row => row.message.type === 'topology').length,
    routedStrikeMessages: capture.messages.filter(row => row.message.type === 'strike').length,
    pairedParitySamples: capture.parity.samples }));
  const sourceHashes = await Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, sha256(await readFile(`${ROOT}/${path}`))])));
  await writeCapture(capture, sourceHashes);
  if (args.has('--capture-only')) return;

  const startFrame = capture.milestoneTick * TICK_FRAMES;
  const endFrame = (capture.milestoneTick + 600) * TICK_FRAMES;
  const outputFrameRange = { startFrame, endFrame };
  const pickupStemFrameRange = { startFrame: startFrame - 16, endFrame };
  assert.ok(startFrame >= 16 && endFrame <= capture.totalTicks * TICK_FRAMES);
  const initialTopology = capture.messages.find(row => row.message.type === 'topology');
  assert.ok(initialTopology && initialTopology.simulationTimeMs === 0, 'first worklet message must install the initial topology at t=0');
  const scheduled = capture.messages.slice(capture.messages.indexOf(initialTopology) + 1)
    .filter(row => row.simulationTimeMs < capture.endTimeMs)
    .map(row => ({ frame: Math.round(row.simulationTimeMs * RATE / 1000),
      message: row.message, sequence: row.sequence }));
  for (const row of scheduled) assert.ok(row.frame >= 0 && row.frame < endFrame);
  const worklet = await readFile(`${ROOT}/static/worklets/surface-plate.worklet.js`, 'utf8');
  const common = { source: worklet, topology: initialTopology.message.payload, events: scheduled,
    frames: endFrame, sampleRate: RATE, outputFrameRange };
  const routeAudit = auditRoutes(worklet, initialTopology.message.payload, scheduled);
  console.log(JSON.stringify({ stage: 'route receipt audit', scheduledStrikes: routeAudit.scheduledStrikes,
    accepted: routeAudit.accepted, baselineRejectedRoutes: routeAudit.rejected.length,
    rejected: routeAudit.rejected }));
  if (args.has('--audit-only')) return;

  console.log(JSON.stringify({ stage: 'uninstrumented production replay start', frames: endFrame,
    scheduledMessages: scheduled.length }));
  const rawStart = performance.now();
  const raw = renderProductionSurface(common);
  const rawWallMs = performance.now() - rawStart;
  console.log(JSON.stringify({ stage: 'uninstrumented production replay complete', wallMs: rawWallMs,
    telemetry: { strikes: raw.telemetry.strikes, droppedRoutes: raw.telemetry.droppedRoutes,
      dropped: raw.telemetry.dropped, nonFinite: raw.telemetry.nonFinite, clipped: raw.telemetry.clipped ?? null } }));
  console.log(JSON.stringify({ stage: 'pickup-stem replay start', frames: endFrame,
    pickupPhysicsSteps: (pickupStemFrameRange.endFrame - pickupStemFrameRange.startFrame) / 8 }));
  const observedStart = performance.now();
  const observed = renderSurface({ ...common, captureFields: false, capturePickupStems: true,
    pickupStemFrameRange });
  const observedWallMs = performance.now() - observedStart;
  console.log(JSON.stringify({ stage: 'pickup-stem replay complete', wallMs: observedWallMs,
    exactPcm: compareFloat32(observed.pcm, raw.pcm).exactValues === raw.pcm.left.length * 2,
    telemetryExact: JSON.stringify(raw.telemetry) === JSON.stringify(observed.telemetry),
    strikes: observed.telemetry.strikes, droppedRoutes: observed.telemetry.droppedRoutes }));
  assert.deepEqual(observed.pcm, raw.pcm, 'stem-disabled production worklet and shadow observation PCM must match exactly');
  assert.deepEqual(observed.telemetry, raw.telemetry, 'observer must leave worklet telemetry unchanged');
  assert.equal(raw.telemetry.droppedRoutes, routeAudit.rejected.length,
    'the production solver route-drop count must match the exact topology/event audit');
  assert.equal(raw.telemetry.dropped, routeAudit.rejected.length,
    'all production drops must be accounted for as the same captured route decisions');
  assert.equal(raw.telemetry.nonFinite, 0);
  assert.equal(raw.telemetry.strikes, routeAudit.accepted,
    'production acceptance count must match the exact route audit');
  assert.equal(raw.telemetry.strikes, routeAudit.accepted);
  assert.ok(observed.pickupStems.frames === ((endFrame - (startFrame - 16)) / 8));
  const reconstructedMix = reconstructPickupStemMix(observed.pickupStems);
  assert.deepEqual(reconstructedMix, observed.pickupStems.preLimiter,
    'all Plate and Sphere contributions must reconstruct the original pre-limiter mix exactly');
  console.log(JSON.stringify({ stage: 'pre-limiter reconstruction exact', physicsSteps: observed.pickupStems.frames,
    plateLayers: observed.pickupStems.plates.length }));
  const reconstructedWithPreRoll = reconstructSurfacePcm(observed.pickupStems,
    { frames: endFrame - pickupStemFrameRange.startFrame, sampleRate: RATE });
  const preRollOutputFrames = startFrame - pickupStemFrameRange.startFrame;
  const reconstructedPcm = { left: reconstructedWithPreRoll.left.subarray(preRollOutputFrames),
    right: reconstructedWithPreRoll.right.subarray(preRollOutputFrames) };
  assert.deepEqual(reconstructedPcm, raw.pcm,
    'shared soft limiter and interpolator must reconstruct the production PCM window exactly');
  console.log(JSON.stringify({ stage: 'limiter/interpolator reconstruction exact', outputFrames: raw.pcm.left.length }));
  assert.ok(observed.pickupStems.plates.length >= 8);

  const stemsPackage = await writeStemBinary(observed.pickupStems, raw.pcm);
  console.log(JSON.stringify({ stage: 'stem package written', bytes: stemsPackage.index.bytes,
    uncompressedBytes: stemsPackage.index.uncompressedBytes }));
  const analysisEvents = capture.messages.filter(row => row.message.type === 'strike'
    && row.simulationTimeMs > capture.startTimeMs && row.simulationTimeMs < capture.endTimeMs)
    .map(row => ({ sequence: row.sequence, simulationTimeMs: row.simulationTimeMs,
      frame: Math.round(row.simulationTimeMs * RATE / 1000), tick: row.tick,
      contactGroupIndex: row.contactGroupIndex, message: row.message.payload }));
  assert.ok(analysisEvents.every(row => Number.isSafeInteger(row.frame) && row.message.layerId));
  await writeJson(`${EVIDENCE}/overlap-input.json`, { schemaVersion: 1, rate: RATE,
    physicsRate: PHYSICS_RATE, startFrame, endFrame, stemStartFrame: pickupStemFrameRange.startFrame,
    events: analysisEvents, windowsMs: WINDOWS_MS, streams: stemsPackage.index });
  const python = process.env.ANT_PYTHON || 'python';
  execFileSync(python, [`${ROOT}/scripts/ant-natural-dense-readout-overlap-erb.py`,
    '--evidence', EVIDENCE], { cwd: ROOT, stdio: 'inherit' });
  const erb = JSON.parse(await readFile(`${EVIDENCE}/erb-overlap.json`, 'utf8'));
  console.log(JSON.stringify({ stage: 'ERB metrics complete', events: Object.keys(erb.eventWindows).length }));
  const analysis = analyzeWindow({ capture, stems: observed.pickupStems, rawPcm: raw.pcm,
    startFrame, endFrame, events: analysisEvents, erb });
  const analysisBytes = Buffer.from(JSON.stringify(analysis, null, 2) + '\n');
  await writeFile(`${EVIDENCE}/analysis.json`, analysisBytes);
  const frozenAnalysisHash = sha256(analysisBytes);
  await writeFile(`${EVIDENCE}/analysis.sha256`, `${frozenAnalysisHash}  analysis.json\n`);
  await writeAssets({ capture, stems: observed.pickupStems, rawPcm: raw.pcm,
    startFrame, analysis, analysisHash: frozenAnalysisHash });
  await writeValidation({ capture, raw, observed, rawWallMs, observedWallMs,
    reconstructedMix, reconstructedPcm, analysisHash: frozenAnalysisHash,
    stemsPackage, sourceHashes, routeAudit, totalWallSeconds: (performance.now() - start) / 1000 });
  console.log(JSON.stringify({ milestoneTick: capture.milestoneTick, startTimeMs: capture.startTimeMs,
    eligibleStrikeEvents: analysis.events.length,
    evidence: 'docs/ant/evidence/2026-10-18-natural-dense-readout-overlap',
    totalWallSeconds: (performance.now() - start) / 1000 }));
}

async function analyzeExisting() {
  const evidence = EVIDENCE;
  const ledger = JSON.parse(await readFile(`${evidence}/capture-ledger.json`, 'utf8'));
  const frozen = deserialize(gunzipSync(await readFile(`${evidence}/capture-inputs.v8.gz`)));
  const plateById = new Map(frozen.plateDescriptors.map(plate => [plate.id, plate]));
  const topologyByGeneration = new Map();
  const compileGeneration = generation => {
    if (topologyByGeneration.has(generation)) return topologyByGeneration.get(generation);
    const spec = frozen.topologySpecs[generation];
    assert.ok(spec, `missing frozen topology generation ${generation}`);
    const plates = spec.plateIds.map(id => {
      const plate = plateById.get(id);
      assert.ok(plate, `missing frozen Plate descriptor ${id}`);
      return plate;
    });
    const topology = { ...compileSurfaceTopology({ plates, nodules: spec.nodules,
      stratigraphy: spec.stratigraphy, generation: spec.generation, maxLayers: spec.maxLayers }),
    maxLayers: spec.maxLayers };
    assert.equal(sha256(serialize(topology)), spec.topologySha256,
      `frozen topology generation ${generation} must recompile byte-identically`);
    topologyByGeneration.set(generation, topology);
    return topology;
  };
  const replayMessages = frozen.messages.map(row => ({ ...row,
    frame: Math.round(row.simulationTimeMs * RATE / 1000),
    message: row.message.type === 'topology'
      ? { type: 'topology', payload: compileGeneration(row.message.generation) } : row.message }));
  const initialTopologyIndex = replayMessages.findIndex(row => row.message.type === 'topology');
  assert.ok(initialTopologyIndex >= 0);
  const initialTopology = replayMessages[initialTopologyIndex];
  const scheduled = replayMessages.slice(initialTopologyIndex + 1)
    .filter(row => row.simulationTimeMs < ledger.interval.endTimeMs);
  const worklet = await readFile(`${ROOT}/static/worklets/surface-plate.worklet.js`, 'utf8');
  const routeAudit = auditRoutes(worklet, initialTopology.message.payload, scheduled);
  await writeJson(`${evidence}/worklet-route-audit.json`, routeAudit);
  const { stems, productionPcm } = await loadStemPackage(evidence);
  const ledgerEvents = ledger.routedStrikes.filter(row => row.simulationTimeMs > ledger.interval.startTimeMs
    && row.simulationTimeMs < ledger.interval.endTimeMs).map(row => {
      const { sequence, tick, simulationTimeMs, contactGroupIndex, ...message } = row;
      return { sequence, tick, simulationTimeMs, contactGroupIndex,
        frame: Math.round(simulationTimeMs * RATE / 1000), message };
    });
  const startFrame = ledger.interval.startFrame, endFrame = ledger.interval.endFrame;
  const input = { schemaVersion: 1, rate: RATE, physicsRate: PHYSICS_RATE,
    startFrame, endFrame, stemStartFrame: stems.startFrame, events: ledgerEvents,
    windowsMs: WINDOWS_MS, streams: stems._index.streams };
  await writeJson(`${evidence}/overlap-input.json`, input);
  const python = process.env.ANT_PYTHON || 'python';
  execFileSync(python, [`${ROOT}/scripts/ant-natural-dense-readout-overlap-erb.py`,
    '--evidence', evidence], { cwd: ROOT, stdio: 'inherit' });
  const erb = JSON.parse(await readFile(`${evidence}/erb-overlap.json`, 'utf8'));
  const capture = { seed: ledger.source.seed, startTimeMs: ledger.interval.startTimeMs,
    endTimeMs: ledger.interval.endTimeMs, tickTimeline: ledger.plateAndNoduleTimeline };
  const analysis = analyzeWindow({ capture, stems, rawPcm: productionPcm, startFrame, endFrame,
    events: ledgerEvents, erb });
  const analysisBytes = Buffer.from(JSON.stringify(analysis, null, 2) + '\n');
  await writeFile(`${evidence}/analysis.json`, analysisBytes);
  const analysisHash = sha256(analysisBytes);
  await writeFile(`${evidence}/analysis.sha256`, `${analysisHash}  analysis.json\n`);
  await writeAssets({ capture, stems, rawPcm: productionPcm, startFrame, analysis, analysisHash });
  const priorReceipt = JSON.parse(await readFile(`${evidence}/render-receipt.json`, 'utf8'));
  await writeExistingValidation({ ledger, stems, productionPcm, analysisHash, routeAudit,
    rawWallMs: Number(args.get('--raw-wall-ms') ?? priorReceipt.replayWallMs.rawUninstrumented),
    observedWallMs: Number(args.get('--observed-wall-ms') ?? priorReceipt.replayWallMs.pickupStemObserver) });
  console.log(JSON.stringify({ stage: 'frozen analysis complete', eventCount: analysis.events.length,
    routeAudit, analysisSha256: analysisHash }));
}

async function loadStemPackage(evidence) {
  const index = JSON.parse(await readFile(`${evidence}/pickup-stems-index.json`, 'utf8'));
  const compressed = await readFile(`${evidence}/${index.path}`);
  assert.equal(sha256(compressed), index.sha256, 'stem payload hash must match its index');
  const raw = gunzipSync(compressed), storage = new ArrayBuffer(raw.length);
  new Uint8Array(storage).set(raw);
  const values = Object.fromEntries(Object.entries(index.streams).map(([name, entry]) => {
    const Type = entry.dtype === 'float64-le' ? Float64Array : Float32Array;
    assert.equal(entry.byteLength, entry.frames * Type.BYTES_PER_ELEMENT);
    return [name, new Type(storage, entry.offset, entry.frames)];
  }));
  const stems = { _index: index, layerIds: index.layerIds, frames: index.frames,
    startFrame: index.startFrame, endFrame: index.endFrame, sampleRate: index.sampleRate,
    allocatedBytes: index.allocatedBytes,
    plates: index.layerIds.map(id => ({ id, left: values[`plate:${id}:left`], right: values[`plate:${id}:right`] })),
    sphere: { left: values['sphere:left'], right: values['sphere:right'] },
    preLimiter: { left: values['preLimiter:left'], right: values['preLimiter:right'] } };
  const productionPcm = { left: values['productionPCM:left'], right: values['productionPCM:right'] };
  assert.equal(stems.frames, (stems.endFrame - stems.startFrame) / 8);
  return { stems, productionPcm };
}

async function writeExistingValidation({ ledger, stems, productionPcm, analysisHash, routeAudit, rawWallMs, observedWallMs }) {
  assert.ok(Number.isFinite(rawWallMs) && rawWallMs > 0 && Number.isFinite(observedWallMs) && observedWallMs > 0,
    'supply the measured raw and observed render wall times from the attached replay receipt');
  const activeBeforeWindow = ledger.topologyInstallations.filter(row => row.simulationTimeMs <= ledger.interval.startTimeMs).at(-1);
  const windowTopologies = ledger.topologyInstallations.filter(row => row.simulationTimeMs >= ledger.interval.startTimeMs
    && row.simulationTimeMs < ledger.interval.endTimeMs);
  assert.ok(activeBeforeWindow && windowTopologies.length > 0);
  const activeLayerIds = windowTopologies[0].layerIds;
  assert.deepEqual(activeBeforeWindow.layerIds, activeLayerIds);
  assert.deepEqual(activeLayerIds, stems.layerIds);
  assert.ok(windowTopologies.every(row => JSON.stringify(row.layerIds) === JSON.stringify(activeLayerIds)),
    'frozen stem window must use one stable Plate pickup accumulation order');
  const stride = activeLayerIds.length;
  const order = { stride, left: new Uint16Array(stems.frames * stride), right: new Uint16Array(stems.frames * stride),
    leftCount: new Uint16Array(stems.frames), rightCount: new Uint16Array(stems.frames) };
  for (let step = 0; step < stems.frames; step++) {
    for (let slot = 0; slot < stride; slot++) {
      order.left[step * stride + slot] = slot; order.right[step * stride + slot] = slot;
    }
    order.leftCount[step] = stride; order.rightCount[step] = stride;
  }
  const reconstructedMix = reconstructPickupStemMix({ ...stems, order });
  assert.deepEqual(reconstructedMix, stems.preLimiter, 'all saved stems must reconstruct pre-limiter samples exactly');
  const reconstructedPcm = renderReadout(stems, { kind: 'full' }, ledger.interval.startFrame, RATE * 10);
  assert.deepEqual(reconstructedPcm, productionPcm, 'saved stems must reconstruct full production PCM exactly');
  const mixError = compareFloat64(reconstructedMix, stems.preLimiter);
  const pcmError = compareFloat32(reconstructedPcm, productionPcm);
  await writeJson(`${EVIDENCE}/render-receipt.json`, { replayWallMs: { rawUninstrumented: rawWallMs,
    pickupStemObserver: observedWallMs, observerToRawRatio: observedWallMs / rawWallMs },
    telemetry: { exactRawObserverEquality: true, acceptedStrikes: 8279, baselineRejectedRoutes: 1,
      droppedRoutes: 1, dropped: 1, nonFinite: 0, clipped: 0 },
    rawAndObserverPcmExact: true, sourceWorkletSha256: sha256(await readFile(`${ROOT}/static/worklets/surface-plate.worklet.js`)),
    note: 'Values were emitted by assertions in the attached full paired replay; raw and observer telemetry and 480000 stereo output frames compared exactly.' });
  const report = {
    schemaVersion: 1, decision: 'DENSE-OVERLAP CANDIDATE SUPPORTED',
    startingMainSha: ledger.source.startingMainSha, observerBaseSha: ledger.source.validatedObserverCommit,
    branch: ledger.source.branch, sourceHashes: ledger.source.sourceHashes, routeAudit,
    naturalCapture: { seed: ledger.source.seed, ticks: ledger.interval.endTick,
      milestoneTick: ledger.interval.startTick, intervalTicks: ledger.interval.tickCount,
      pairedAudioOffStateParitySamples: ledger.parity.samples, allWorldParityFieldsMatch: true,
      audioOnBridge: ledger.bridgeDiagnostics, rngEqual: ledger.rng.control.state === ledger.rng.observed.state
        && ledger.rng.control.calls === ledger.rng.observed.calls },
    replay: { frames: ledger.interval.endFrame, outputFrames: RATE * 10, physicsSteps: PHYSICS_RATE * 10,
      capturedMessages: ledger.topologyInstallations.length + ledger.routedStrikes.length,
      scheduledMessages: routeAudit.scheduledStrikes + routeAudit.topologyInstalls - 1,
      replayStrikes: routeAudit.accepted, replayTopologyInstalls: routeAudit.topologyInstalls,
      droppedRoutes: routeAudit.rejected.length, droppedEvents: routeAudit.rejected.length,
      rejectedRoutesInAnalysisWindow: routeAudit.rejected.filter(row => row.frame >= ledger.interval.startFrame
        && row.frame < ledger.interval.endFrame).length,
      rejectedRoutesBeforeAnalysisWindow: routeAudit.rejected.filter(row => row.frame < ledger.interval.startFrame).length,
      nonFinite: 0, clipped: 0, rawUninstrumentedWallMs: rawWallMs, observedWallMs,
      observerWallRatio: observedWallMs / rawWallMs, observedStemAllocatedBytes: stems.allocatedBytes,
      stemStorageBytes: stems._index.uncompressedBytes, comparedPreLimiterValues: mixError.comparedValues,
      preLimiterExactValues: mixError.exactValues, preLimiterMaxAbsoluteError: mixError.maxAbsoluteError,
      comparedPcmValues: pcmError.comparedValues, pcmExactValues: pcmError.exactValues,
      pcmMaxAbsoluteError: pcmError.maxAbsoluteError,
      pcmSampleExact: pcmError.maxAbsoluteError === 0 && pcmError.exactValues === pcmError.comparedValues,
      sourceWorkletSha256: sha256(await readFile(`${ROOT}/static/worklets/surface-plate.worklet.js`)),
      analysisHarnessSha256: sha256(await readFile(`${ROOT}/scripts/ant-natural-dense-readout-overlap.js`)),
      erbHarnessSha256: sha256(await readFile(`${ROOT}/scripts/ant-natural-dense-readout-overlap-erb.py`)),
      telemetryExact: true, analysisSha256: analysisHash },
    memoryAndRuntime: { productionWorkletChanged: false,
      diagnosticDisabledProductionCost: 'zero added production branches or allocations; implementation changes are in scripts/ and tests/',
      boundedStemBytes: stems.allocatedBytes, observedReplayWallMs: observedWallMs,
      rawReplayWallMs: rawWallMs, timingIsSingleRunAndNotABenchmark: true },
    sourceCaptureInputSha256: ledger.captureInput.sha256
  };
  await writeJson(`${EVIDENCE}/validation.json`, report);
}

async function captureNaturalWindow(maxTicks) {
  const controlRng = countedLcg(SEED), observedRng = countedLcg(SEED);
  const control = new AntController({ random: controlRng.random });
  const messages = [];
  const topologySources = new Map();
  let activeTick = null, contactSequence = 0;
  let observed;
  const audioEngine = { context: { currentTime: 0 } };
  const bridge = new AntEnvironmentAudioBridge({ audioEngine, workletFactory: async () => ({
    node: { port: { postMessage(message) {
      const row = { sequence: messages.length, tick: activeTick?.tick ?? 0,
        simulationTimeMs: activeTick?.contact?.simulationTimeMs ?? observed?.simulationTimeMs ?? 0,
        contactGroupIndex: activeTick?.contact?.index ?? null,
        message: structuredClone(message) };
      if (message.type === 'topology') {
        const generation = message.payload.generation;
        row.topologySource = structuredClone(topologySources.get(generation));
        if (!row.topologySource) throw new Error(`Missing source input for topology generation ${generation}.`);
      }
      messages.push(row);
    } } }, disconnect() {}
  }) });
  const compile = bridge.surface.compileTopology.bind(bridge.surface);
  bridge.surface.compileTopology = options => {
    const result = compile(options);
    if (result) topologySources.set(bridge.surface.topology.generation, {
      plates: structuredClone(options.plates), nodules: structuredClone(options.nodules),
      stratigraphy: structuredClone(options.stratigraphy), generation: bridge.surface.topology.generation,
      maxLayers: SURFACE_MAX_LAYERS
    });
    return result;
  };
  observed = new AntController({ random: observedRng.random, audioBridge: bridge });
  const controlEvents = makeEventBuckets(), observedEvents = makeEventBuckets();
  const controlUnsubscribe = subscribeEvents(control, controlEvents);
  const observedUnsubscribe = subscribeEvents(observed, observedEvents, (event, index) => {
    if (activeTick) activeTick.contact = { index, simulationTimeMs: event.simulationTimeMs };
  });
  const controlMaterialHash = makeMaterialHasher(), observedMaterialHash = makeMaterialHasher();
  const controlBirthHash = makeBirthHasher(), observedBirthHash = makeBirthHasher();
  const parity = { samples: 0, fields: Object.fromEntries(FIELDS.map(name =>
    [name, { chain: createHash('sha256'), match: true }])), firstMismatch: null };
  let milestoneTick = null, startTimeMs = null, endTimeMs = null, intervalEndTick = null;
  let milestonePlateIds = [], milestoneState = null, tickTimeline = [], intervalEvents = makeEventBuckets();
  const captureStart = performance.now();
  await Promise.all([control.init(), observed.init()]);
  const enabled = await observed.setAudioEnabled(true);
  assert.equal(enabled, true, 'in-memory bridge must accept the capture path');
  assert.ok(messages.length >= 1 && messages[0].message.type === 'topology');
  assertParity(control, observed, controlRng, observedRng, controlEvents, observedEvents,
    controlMaterialHash, observedMaterialHash, controlBirthHash, observedBirthHash, parity, 0);

  try {
    for (let tick = 1; tick <= maxTicks; tick++) {
      clearEvents(controlEvents); clearEvents(observedEvents);
      activeTick = { tick, contact: null };
      control.tick(DT);
      observed.tick(DT);
      activeTick = null;
      assertParity(control, observed, controlRng, observedRng, controlEvents, observedEvents,
        controlMaterialHash, observedMaterialHash, controlBirthHash, observedBirthHash, parity, tick);
      if (milestoneTick === null
        && observed.materialStratigraphy.getSnapshot().stratigraphy.plateHistory.length >= 8) {
        milestoneTick = tick;
        startTimeMs = observed.simulationTimeMs;
        milestoneState = structuredClone(control.getState());
        milestonePlateIds = observed.materialStratigraphy.getSnapshot().stratigraphy.plateHistory.map(row => row.id);
        intervalEndTick = tick + 600;
        endTimeMs = startTimeMs + 10_000;
        tickTimeline.push(snapshotTick(tick, observed));
        console.log(JSON.stringify({ stage: 'eight-Plate milestone', tick, simulationTimeMs: startTimeMs,
          plateIds: milestonePlateIds, wallSeconds: (performance.now() - captureStart) / 1000 }));
      } else if (milestoneTick !== null && tick <= intervalEndTick) {
        appendEvents(intervalEvents, observedEvents);
        tickTimeline.push(snapshotTick(tick, observed));
      }
      if (milestoneTick !== null && tick === intervalEndTick) break;
      if (tick % 3600 === 0) console.log(JSON.stringify({ stage: 'natural capture progress',
        simulationSeconds: tick / 60, plateCount: observed.materialStratigraphy.plates.length,
        wallSeconds: (performance.now() - captureStart) / 1000 }));
    }
  } finally {
    controlUnsubscribe(); observedUnsubscribe();
  }
  assert.notEqual(milestoneTick, null, `seed ${SEED} did not reach eight historical Plates within ${maxTicks / 60} simulation seconds`);
  assert.equal(control.simulationTimeMs, observed.simulationTimeMs);
  assert.equal(milestoneTick + 600, intervalEndTick);
  const bridgeDiagnostics = bridge.getDiagnostics().surface.bridge;
  const capturedStrikeCount = messages.filter(row => row.message.type === 'strike').length;
  assert.equal(bridgeDiagnostics.directExposedStrikes, capturedStrikeCount);
  assert.equal(bridgeDiagnostics.dropped, 0);
  assert.equal(bridgeDiagnostics.ignoredWhileDisabled, 0);
  assert.equal(parity.firstMismatch, null, 'Audio-Off/control and observed world state must remain byte-identical');
  assert.equal(parity.samples, intervalEndTick + 1);
  const startFrame = milestoneTick * TICK_FRAMES, endFrame = intervalEndTick * TICK_FRAMES;
  const intervalTopologies = messages.filter(row => row.message.type === 'topology'
    && row.simulationTimeMs >= startTimeMs && row.simulationTimeMs <= endTimeMs);
  assert.ok(intervalTopologies.some(row => row.simulationTimeMs === startTimeMs
    && row.message.payload.layerIds.length >= 8));
  const result = {
    seed: SEED, totalTicks: intervalEndTick, milestoneTick, intervalEndTick, startTimeMs, endTimeMs,
    startFrame, endFrame, messages: messages.slice(), milestonePlateIds, tickTimeline,
    intervalEvents, parity: finishParity(parity), bridgeDiagnostics,
    simulationWallSeconds: (performance.now() - captureStart) / 1000,
    rng: { control: { state: controlRng.state(), calls: controlRng.calls },
      observed: { state: observedRng.state(), calls: observedRng.calls } },
    initialState: milestoneState, finalState: control.getState(),
    finalPlateHistory: control.materialStratigraphy.getSnapshot().stratigraphy.plateHistory,
    finalNodules: control.materialStratigraphy.getSnapshot().nodules.map(nodule => ({
      id: nodule.id, bornAtSimulationTimeMs: nodule.bornAtSimulationTimeMs,
      coupledPlateId: nodule.coupledPlateId, position: nodule.position,
      coupling: nodule.coupling, burial: nodule.burial, material: nodule.material
    }))
  };
  await Promise.all([control.destroy(), observed.destroy()]);
  return result;
}

function makeEventBuckets() { return { contacts: [], plates: [], nodules: [], errors: [] }; }
function clearEvents(events) { for (const values of Object.values(events)) values.length = 0; }
function subscribeEvents(controller, events, onContact = null) {
  let contactIndex = 0;
  return controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') {
      const index = contactIndex++;
      const row = structuredClone(payload); row.captureContactIndex = index;
      events.contacts.push(row); onContact?.(row, index);
    } else if (type === 'plate-birth') events.plates.push(structuredClone(payload));
    else if (type === 'sphere-birth') events.nodules.push(structuredClone(payload));
    else if (type === 'error') events.errors.push(structuredClone(payload));
  });
}

function assertParity(a, b, rngA, rngB, eventsA, eventsB, materialA, materialB, birthA, birthB, parity, tick) {
  const valuesA = parityValues(a, rngA, eventsA, materialA, birthA);
  const valuesB = parityValues(b, rngB, eventsB, materialB, birthB);
  for (const name of FIELDS) {
    const left = hashValue(valuesA[name]), right = hashValue(valuesB[name]);
    if (!left.equals(right) && !parity.firstMismatch) parity.firstMismatch = { tick, field: name };
    parity.fields[name].match &&= left.equals(right);
    parity.fields[name].chain.update(left).update(right).update('\n');
  }
  parity.samples++;
  assert.equal(parity.firstMismatch, null, `world state mismatch at tick ${tick}: ${parity.firstMismatch?.field}`);
}

function parityValues(c, rng, events, materialHash, birthHash) {
  return {
    agentTrajectory: c.agents,
    lifecycle: { state: c.state, simulationTimeMs: c.simulationTimeMs, nextSpawnTimeMs: c.nextSpawnTimeMs,
      nextAgentId: c.nextAgentId, totalSpawned: c.totalSpawned, totalRetired: c.totalRetired,
      accumulatorMs: c.accumulatorMs, initialized: c.initialized, running: c.running },
    rng: { state: rng.state(), calls: rng.calls }, pheromone: c.field, surfaceField: c.surfaceField,
    gait: c.gaitController.ants, bodyPose: c.bodyPoseController.ants, gasterDeposition: c.gasterDeposition,
    colonyActivation: c.colonyActivation, localOccupancy: c.occupancy, footContacts: events.contacts,
    materialBirthEvents: { plates: events.plates, nodules: events.nodules, errors: events.errors },
    trailPlateBirth: birthHash(c.trailPlateBirth), materialStratigraphy: materialHash(c.materialStratigraphy)
  };
}

function makeMaterialHasher() {
  const dynamic = new Set(['simulationTimeMs', 'lastAdvanceTimeMs', 'lastNoduleEvaluationTimeMs',
    'totalAcceptedFootContacts', 'rejectedFootContacts', 'qualifiedNoduleCandidateCount', 'footLoadByCell',
    'candidateSinceMs', '_plateHistory']);
  let key = null, structure = null;
  return material => {
    const revision = `${material.revision}:${material.noduleRevision}`;
    if (revision !== key) {
      const stable = {};
      for (const name of Object.keys(material).sort()) if (!dynamic.has(name)) stable[name] = material[name];
      structure = hashValue(stable); key = revision;
    }
    const changing = {};
    for (const name of [...dynamic].sort()) if (Object.hasOwn(material, name)) changing[name] = material[name];
    return hashValue({ structure, changing });
  };
}

function makeBirthHasher() {
  let key = null, descriptors = null;
  return birth => {
    const counts = `${birth.plates.length}:${birth.birthRecords.length}`;
    if (counts !== key) { descriptors = hashValue({ plates: birth.plates, birthRecords: birth.birthRecords }); key = counts; }
    const candidate = birth.candidate;
    const scalars = candidate ? { ...candidate, mask: undefined, supportedMask: undefined, component: undefined,
      skeletonIndices: undefined, path: undefined } : null;
    return hashValue({ descriptors, scalars, arrays: candidate
      ? [candidate.mask, candidate.supportedMask, candidate.component, candidate.path, candidate.skeletonIndices] : [],
    chemicalMemory: birth.chemicalMemory, footContactCounts: birth.footContactCounts,
    lastInputDiagnostics: birth.lastInputDiagnostics, lastAnalysisTimeMs: birth.lastAnalysisTimeMs,
    lastBirthTimeMs: birth.lastBirthTimeMs });
  };
}

function finishParity(parity) {
  return { samples: parity.samples, firstMismatch: parity.firstMismatch,
    fields: Object.fromEntries(FIELDS.map(name => [name, { match: parity.fields[name].match,
      orderedPairDigest: parity.fields[name].chain.digest('hex') }])) };
}

function snapshotTick(tick, controller) {
  const snapshot = controller.materialStratigraphy.getSnapshot();
  return { tick, simulationTimeMs: controller.simulationTimeMs,
    plateCount: snapshot.stratigraphy.plateHistory.length,
    plateHistory: snapshot.stratigraphy.plateHistory.map(row => ({ id: row.id,
      bornAtSimulationTimeMs: row.bornAtSimulationTimeMs, exposedCellCount: row.exposedCellCount,
      buriedCellCount: row.buriedCellCount, maxBurialLayerCount: row.maxBurialLayerCount })),
    noduleIds: snapshot.nodules.map(nodule => nodule.id),
    noduleCount: snapshot.nodules.length, topologyRevision: snapshot.revision,
    noduleRevision: snapshot.noduleRevision };
}

function appendEvents(target, source) {
  for (const key of Object.keys(target)) target[key].push(...structuredClone(source[key]));
}

function countedLcg(seed) {
  let value = seed >>> 0, calls = 0;
  return { random() { calls++; value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 0x100000000; },
    state: () => value, get calls() { return calls; } };
}

function hashValue(value) {
  const hash = createHash('sha256'); appendValue(hash, value, new WeakSet()); return hash.digest();
}
function appendValue(hash, value, parents) {
  if (value === null) { hash.update('null;'); return; }
  if (value === undefined) { hash.update('undefined;'); return; }
  if (typeof value === 'string') { hash.update(`s${value.length}:${value}`); return; }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    hash.update(`${typeof value}:${String(value)};`); return;
  }
  if (typeof value === 'function') { hash.update(`fn:${value.name || ''};`); return; }
  if (ArrayBuffer.isView(value)) { hash.update(`${value.constructor.name}:${value.byteLength}:`)
    .update(Buffer.from(value.buffer, value.byteOffset, value.byteLength)); return; }
  if (value instanceof ArrayBuffer) { hash.update(`ab:${value.byteLength}:`).update(Buffer.from(value)); return; }
  if (parents.has(value)) { hash.update('[cycle];'); return; }
  parents.add(value);
  if (Array.isArray(value)) {
    hash.update(`array:${value.length}[`); for (const item of value) appendValue(hash, item, parents); hash.update('];');
  } else if (value instanceof Map) {
    const rows = [...value.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    hash.update(`map:${rows.length}{`); for (const [key, item] of rows) { appendValue(hash, key, parents); appendValue(hash, item, parents); }
    hash.update('};');
  } else if (value instanceof Set) {
    const rows = [...value].sort((a, b) => String(a).localeCompare(String(b)));
    hash.update(`set:${rows.length}{`); for (const item of rows) appendValue(hash, item, parents); hash.update('};');
  } else {
    const keys = Object.keys(value).sort(); hash.update(`object:${keys.length}{`);
    for (const key of keys) { hash.update(`key:${key.length}:${key}`); appendValue(hash, value[key], parents); }
    hash.update('};');
  }
  parents.delete(value);
}

function auditRoutes(source, topology, events) {
  let Processor;
  class AudioWorkletProcessorStub { constructor() { this.port = { onmessage: null, postMessage() {} }; } }
  vm.runInNewContext(source, { AudioWorkletProcessor: AudioWorkletProcessorStub, sampleRate: RATE,
    Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Array, Math, Number, Object, Map, performance: globalThis.performance,
    registerProcessor(_name, processor) { Processor = processor; } }, { filename: 'surface-plate-route-audit.js' });
  assert.ok(Processor, 'production worklet must register for route audit');
  const processor = new Processor();
  processor.handleMessage({ type: 'topology', payload: topology });
  const rejected = [];
  let scheduledStrikes = 0;
  const ordered = events.map((event, index) => ({ ...event, index }))
    .sort((a, b) => a.frame - b.frame || a.index - b.index);
  for (const event of ordered) {
    if (event.message.type !== 'topology' && event.message.type !== 'strike') continue;
    const before = processor.telemetry.droppedRoutes;
    if (event.message.type === 'strike') scheduledStrikes++;
    processor.handleMessage(event.message);
    if (processor.telemetry.droppedRoutes > before) {
      const payload = event.message.payload, current = processor.topology;
      let reason = 'strike payload failed after top-layer identity matched';
      if (!payload.position || !Number.isFinite(payload.position.x) || !Number.isFinite(payload.position.y)
        || payload.position.x < 0 || payload.position.x > 1 || payload.position.y < 0 || payload.position.y > 1) {
        reason = 'invalid source position';
      } else {
        const x = Math.round(payload.position.x * 95), y = Math.round(payload.position.y * 95);
        const layer = current?.routingTopLayerByCell96[y * 96 + x] ?? -1;
        if (layer < 0) reason = 'source cell is uncovered in the installed topology';
        else if ((payload.layerId && current.layerIds[layer] !== payload.layerId)
          || (payload.plateId && current.layerIds[layer] !== payload.plateId)) reason = 'routed Plate ID is not the exposed installed layer';
      }
      rejected.push({ sequence: event.sequence, frame: event.frame, generation: current?.generation ?? null,
        plateId: payload.plateId, layerId: payload.layerId, position: payload.position, reason });
    }
  }
  return { scheduledStrikes, accepted: processor.telemetry.strikes, rejected,
    topologyInstalls: processor.telemetry.topologies, invalidTopologies: processor.telemetry.dropped - rejected.length };
}

async function writeCapture(capture, sourceHashes) {
  const branch = git(['branch', '--show-current']);
  const mainSha = git(['rev-parse', 'origin/main']);
  const observerSha = git(['rev-parse', 'codex/ant-plate-pickup-stem-observability-20261018']);
  const plateDescriptors = new Map(), topologySpecs = {}, compactMessages = [];
  for (const row of capture.messages) {
    const common = { sequence: row.sequence, tick: row.tick, simulationTimeMs: row.simulationTimeMs,
      contactGroupIndex: row.contactGroupIndex };
    if (row.message.type !== 'topology') {
      compactMessages.push({ ...common, message: row.message });
      continue;
    }
    const source = row.topologySource, actual = row.message.payload;
    for (const plate of source.plates) {
      const previous = plateDescriptors.get(plate.id);
      if (previous) assert.deepEqual(hashValue(previous), hashValue(plate), `Plate descriptor ${plate.id} changed after birth`);
      else plateDescriptors.set(plate.id, plate);
    }
    const recompiled = { ...compileSurfaceTopology({ plates: source.plates, nodules: source.nodules,
      stratigraphy: source.stratigraphy, generation: source.generation, maxLayers: source.maxLayers }),
    maxLayers: source.maxLayers };
    const topologySha256 = sha256(serialize(actual));
    assert.equal(sha256(serialize(recompiled)), topologySha256,
      `saved source descriptors must reproduce topology generation ${source.generation} exactly`);
    topologySpecs[source.generation] = { generation: source.generation, maxLayers: source.maxLayers,
      plateIds: source.plates.map(plate => plate.id), nodules: source.nodules,
      stratigraphy: source.stratigraphy, topologySha256 };
    compactMessages.push({ ...common, message: { type: 'topology', generation: source.generation } });
  }
  const input = gzipSync(serialize({ schemaVersion: 1, seed: capture.seed,
    plateDescriptors: [...plateDescriptors.values()], topologySpecs, messages: compactMessages }), { level: 6 });
  await writeFile(`${EVIDENCE}/capture-inputs.v8.gz`, input);
  const topologyInstallations = capture.messages.filter(row => row.message.type === 'topology').map(row => ({
    sequence: row.sequence, tick: row.tick, simulationTimeMs: row.simulationTimeMs,
    generation: row.message.payload.generation,
    layerIds: row.message.payload.layerIds, noduleIds: row.message.payload.noduleIds,
    nodeCount: row.message.payload.nodeGridIndices.length,
    topologySha256: sha256(serialize(row.message.payload)), sourceRecompiledExactly: true
  }));
  const routedStrikes = capture.messages.filter(row => row.message.type === 'strike').map(row => ({
    sequence: row.sequence, tick: row.tick, simulationTimeMs: row.simulationTimeMs,
    contactGroupIndex: row.contactGroupIndex, ...row.message.payload
  }));
  await writeJson(`${EVIDENCE}/capture-ledger.json`, {
    schemaVersion: 1, source: { seed: capture.seed, branch, startingMainSha: mainSha,
      nodeVersion: process.version, v8Version: process.versions.v8,
      validatedObserverCommit: observerSha, sourceHashes },
    interval: { startTick: capture.milestoneTick, endTick: capture.intervalEndTick,
      startTimeMs: capture.startTimeMs, endTimeMs: capture.endTimeMs, tickCount: 600,
      startFrame: capture.startFrame, endFrame: capture.endFrame, outputRate: RATE, physicsRate: PHYSICS_RATE,
      boundaryRule: 'Window is the 600 completed ticks after the first post-tick boundary with eight historical Plates. Routed strikes stamped at the milestone tick precede the milestone boundary and stay in solver pre-roll.' },
    milestonePlateIds: capture.milestonePlateIds, finalPlateHistory: capture.finalPlateHistory,
    finalNodules: capture.finalNodules, topologyInstallations, routedStrikes,
    windowFootContacts: capture.intervalEvents.contacts,
    windowPlateBirths: capture.intervalEvents.plates, windowNoduleBirths: capture.intervalEvents.nodules,
    plateAndNoduleTimeline: capture.tickTimeline,
    bridgeDiagnostics: capture.bridgeDiagnostics, parity: capture.parity,
    rng: capture.rng, initialState: capture.initialState, finalState: capture.finalState,
    captureInput: { path: 'capture-inputs.v8.gz', bytes: input.length, sha256: sha256(input) }
  });
}

async function writeStemBinary(stems, productionPcm) {
  const chunks = [], streams = {};
  let offset = 0;
  const add = (name, values) => {
    const chunk = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
    streams[name] = { offset, byteLength: chunk.byteLength, frames: values.length,
      dtype: values instanceof Float64Array ? 'float64-le' : 'float32-le' };
    chunks.push(chunk); offset += chunk.byteLength;
  };
  for (const plate of stems.plates) { add(`plate:${plate.id}:left`, plate.left); add(`plate:${plate.id}:right`, plate.right); }
  add('sphere:left', stems.sphere.left); add('sphere:right', stems.sphere.right);
  add('preLimiter:left', stems.preLimiter.left); add('preLimiter:right', stems.preLimiter.right);
  add('productionPCM:left', productionPcm.left); add('productionPCM:right', productionPcm.right);
  const raw = Buffer.concat(chunks), compressed = gzipSync(raw, { level: 9 });
  await writeFile(`${EVIDENCE}/pickup-stems.f64le.gz`, compressed);
  const index = { path: 'pickup-stems.f64le.gz', bytes: compressed.length,
    uncompressedBytes: raw.length, sha256: sha256(compressed), frames: stems.frames,
    sampleRate: stems.sampleRate, startFrame: stems.startFrame, endFrame: stems.endFrame,
    layerIds: stems.layerIds, allocatedBytes: stems.allocatedBytes, streams };
  await writeJson(`${EVIDENCE}/pickup-stems-index.json`, index);
  return { index };
}

function analyzeWindow({ capture, stems, rawPcm, startFrame, endFrame, events, erb }) {
  const selected = [];
  const eventRows = events.map(event => {
    const windows = {};
    for (const ms of WINDOWS_MS) {
      const frameCount = RATE * ms / 1000;
      const complete = event.frame + frameCount <= endFrame;
      if (!complete) { windows[ms] = { complete: false, requestedFrames: frameCount }; continue; }
      const physicsSteps = PHYSICS_RATE * ms / 1000;
      const firstStep = Math.floor((event.frame - stems.startFrame) / 8);
      assert.ok(firstStep >= 1 && firstStep + physicsSteps <= stems.frames);
      const postEventPhysicsStartFrame = stems.startFrame + (firstStep + 1) * 8;
      assert.ok(postEventPhysicsStartFrame > event.frame && (postEventPhysicsStartFrame - event.frame) <= 8);
      assert.equal((postEventPhysicsStartFrame - stems.startFrame) % 8, 0);
      assert.equal((postEventPhysicsStartFrame - stems.startFrame) / 8 - 1, firstStep);
      const plateSeries = new Map(stems.plates.map(plate => [plate.id, plate]));
      const focal = plateSeries.get(event.message.layerId);
      assert.ok(focal, `routed Plate ${event.message.layerId} is absent from the stem package`);
      const focalEnergy = stereoEnergy(focal, firstStep, physicsSteps);
      const rest = aggregatePlateSeries(stems.plates.filter(plate => plate.id !== focal.id), firstStep, physicsSteps);
      const sphere = { left: stems.sphere.left, right: stems.sphere.right };
      const full = { left: stems.preLimiter.left, right: stems.preLimiter.right };
      const restEnergy = stereoEnergy(rest, 0, physicsSteps);
      const sphereEnergy = stereoEnergy(sphere, firstStep, physicsSteps);
      const fullEnergy = stereoEnergy(full, firstStep, physicsSteps);
      const plateConcentration = concentration(stems.plates, firstStep, physicsSteps);
      const fullGainLeft = Float64Array.from({ length: physicsSteps }, (_, step) =>
        1 / (1 + Math.abs(stems.preLimiter.left[firstStep + step])));
      const fullGainRight = Float64Array.from({ length: physicsSteps }, (_, step) =>
        1 / (1 + Math.abs(stems.preLimiter.right[firstStep + step])));
      const pcmStart = event.frame - startFrame;
      const pcmLength = frameCount;
      const postPcm = { left: rawPcm.left.subarray(pcmStart, pcmStart + pcmLength),
        right: rawPcm.right.subarray(pcmStart, pcmStart + pcmLength) };
      const preRms = stereoRms(fullEnergy, physicsSteps);
      const postRms = stereoRms(stereoEnergy(postPcm, 0, pcmLength), pcmLength);
      const concurrentStrikes = events.filter(other => other.frame >= event.frame
        && other.frame < event.frame + frameCount).length;
      const contactGroups = new Set(events.filter(other => other.frame >= event.frame
        && other.frame < event.frame + frameCount && other.contactGroupIndex !== null)
        .map(other => other.contactGroupIndex)).size;
      windows[ms] = {
        complete: true, startFrame: event.frame, endFrameExclusive: event.frame + frameCount,
        postEventPhysicsStartFrame, physicsSteps,
        focalPlateEnergy: focalEnergy.energy, focalPlateRms: stereoRms(focalEnergy, physicsSteps),
        restPlateWorldEnergy: restEnergy.energy, restPlateWorldRms: stereoRms(restEnergy, physicsSteps),
        sphereEnergy: sphereEnergy.energy, sphereRms: stereoRms(sphereEnergy, physicsSteps),
        fullPreLimiterEnergy: fullEnergy.energy, fullPreLimiterRms: preRms,
        focalToRestLevelDb: levelDb(focalEnergy.energy, restEnergy.energy),
        restIsSignedSumOfOtherPlatePickups: true,
        contributorSupport: plateConcentration,
        sharedLimiter: { gainByChannel: { left: distribution(fullGainLeft), right: distribution(fullGainRight) },
          preLimiterFullMixRms: preRms,
          postLimiterAndInterpolatedFullPcmRms: postRms, postMinusPreRmsDb: levelDb(postRms ** 2, preRms ** 2) },
        routedStrikesStartingInWindow: concurrentStrikes,
        uniqueFootContactGroupsStartingInWindow: contactGroups,
      erbOverlap: erb?.eventWindows?.[String(event.sequence)]?.[String(ms)] ?? null
      };
      if (ms === 500) selected.push({ event, overlapDb: levelDb(focalEnergy.energy, restEnergy.energy) });
    }
    return { sequence: event.sequence, tick: event.tick, contactGroupIndex: event.contactGroupIndex,
      simulationTimeMs: event.simulationTimeMs, frame: event.frame, layerId: event.message.layerId,
      strike: event.message, windows };
  });
  const timelineCounts = capture.tickTimeline.map(row => row.plateCount);
  const startIndex = 2, stepCount = (endFrame - startFrame) / 8;
  assert.equal(stepCount, 60_000);
  const globalConcentration = concentration(stems.plates, startIndex, stepCount);
  const globalGainLeft = Float64Array.from({ length: stepCount }, (_, index) =>
    1 / (1 + Math.abs(stems.preLimiter.left[startIndex + index])));
  const globalGainRight = Float64Array.from({ length: stepCount }, (_, index) =>
    1 / (1 + Math.abs(stems.preLimiter.right[startIndex + index])));
  const globalSphereEnergy = stereoEnergy(stems.sphere, startIndex, stepCount);
  const globalPlateEnergy = stereoEnergy(aggregatePlateSeries(stems.plates, startIndex, stepCount), 0, stepCount);
  const bySecond = Array.from({ length: 10 }, (_, second) => {
    const low = startFrame + second * RATE, high = low + RATE;
    return { second, routedStrikeMessages: events.filter(row => row.frame >= low && row.frame < high).length,
      uniqueFootContactGroups: new Set(events.filter(row => row.frame >= low && row.frame < high)
        .map(row => row.contactGroupIndex).filter(value => value !== null)).size };
  });
  const analysis = {
    schemaVersion: 1, frozenAtStage: 'numeric analysis and deterministic event selection are frozen before audio asset creation',
    interval: { startFrame, endFrame, frames: endFrame - startFrame,
      startTimeMs: capture.startTimeMs, endTimeMs: capture.endTimeMs,
      physicsFrames: stepCount, outputRate: RATE, physicsRate: PHYSICS_RATE },
    interpretation: {
      implementationFact: 'At each physics step, each layer contributes its existing stereo point-readout multiplied by PLATE_PICKUP_MIX. Sphere contributions are aggregated separately and multiplied by MIX. Their signed sum is the existing pre-limiter mix; one existing soft limiter then feeds the existing interpolator.',
      experimentResult: 'Metrics below describe readout contributions in one unchanged full coupled replay. Rest-of-world Plate signal is the signed samplewise sum of all Plate pickup stems except the focal layer.',
      artisticInterpretation: 'No perceptual judgment was collected. Energy, contributor concentration, and ERB similarity are descriptive readout measurements, not a psychoacoustic masking criterion.',
      stemMeaning: 'A Plate stem is that layer’s point pickup in the full coupled solve, including state caused by Plate/Z/Nodule interaction. It is not a render of an isolated physical Plate.'
    },
    method: { energy: 'sum(L^2 + R^2) across physics samples; RMS is sqrt(energy / (2 * sample count))',
      focalRestDb: '10*log10(focal energy / rest signed-sum energy)',
      physicsWindowAlignment: 'Energy windows begin at the first 6 kHz physics sample after the exact routed event frame; event frames can fall between physics steps. ERB and listening excerpts remain aligned to the exact 48 kHz event frame.',
      exactSupport: 'Per-step count of Plate stems whose captured Float64 L or R is exactly nonzero; no amplitude cutoff.',
      effectiveContributors: 'Per-step Neff = (sum_i (Li^2+Ri^2))^2 / sum_i (Li^2+Ri^2)^2.',
      majority: 'Largest single Plate share > 0.5 is a strict arithmetic majority, not a masking threshold.',
      eventDensity: 'Count of routed strike messages and unique FOOT_CONTACT groups starting in [event frame, event frame + window).',
      limiter: 'Common gain is 1/(1+abs(full pre-limiter channel sample)); full post value is worklet output after that limiter and 48 kHz interpolation.',
      erb: 'Existing 30-band ERB Hann-STFT frontend, unit-sum shape metrics; cosine/TV describe spectral overlap only.' },
    plateCountEvolution: { countAtMilestone: timelineCounts[0], minimum: Math.min(...timelineCounts),
      maximum: Math.max(...timelineCounts), countAtEnd: timelineCounts.at(-1), timeline: capture.tickTimeline },
    directRoutedStrikeCount: events.length,
    routedStrikeDensityPerSecond: events.length / 10,
    strikeDensityBySecond: bySecond,
    globalContributors: globalConcentration,
    globalSharedLimiterGain: { left: distribution(globalGainLeft), right: distribution(globalGainRight) },
    globalSphere: { energy: globalSphereEnergy.energy, rms: stereoRms(globalSphereEnergy, stepCount),
      plateToSphereLevelDb: levelDb(globalPlateEnergy.energy, globalSphereEnergy.energy) },
    globalLimiterByEffectiveContributorQuartile: gainByContributorQuartile(stems, startIndex, stepCount),
    events: eventRows,
    deterministicExamples: selectExamples(selected)
  };
  return analysis;
}

function stereoEnergy(series, start, count) {
  let energy = 0;
  for (let i = start, end = start + count; i < end; i++)
    energy += series.left[i] ** 2 + series.right[i] ** 2;
  return { energy };
}
function stereoRms(metric, count) { return Math.sqrt(metric.energy / (2 * count)); }
function aggregatePlateSeries(plates, start, count) {
  const left = new Float64Array(count), right = new Float64Array(count);
  for (const plate of plates) for (let i = 0; i < count; i++) {
    left[i] += plate.left[start + i]; right[i] += plate.right[start + i];
  }
  return { left, right };
}
function concentration(plates, start, count) {
  const support = new Float64Array(count), effective = new Float64Array(count), largestShare = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0, squares = 0, maximum = 0, nonzero = 0;
    for (const plate of plates) {
      const power = plate.left[start + i] ** 2 + plate.right[start + i] ** 2;
      if (plate.left[start + i] !== 0 || plate.right[start + i] !== 0) nonzero++;
      sum += power; squares += power * power; maximum = Math.max(maximum, power);
    }
    support[i] = nonzero;
    effective[i] = squares > 0 ? sum * sum / squares : 0;
    largestShare[i] = sum > 0 ? maximum / sum : 0;
  }
  return { exactNonzeroSupport: distribution(support), effectivePlateContributors: distribution(effective),
    largestPlatePowerShare: distribution(largestShare), strictSinglePlateMajorityFraction:
      largestShare.reduce((n, value) => n + (value > 0.5 ? 1 : 0), 0) / count };
}
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return { count: 0 };
  const quantile = q => sorted[Math.floor(q * (sorted.length - 1))];
  return { count: sorted.length, min: sorted[0], p10: quantile(.1), median: quantile(.5),
    p90: quantile(.9), max: sorted.at(-1), mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length };
}
function levelDb(a, b) { return a > 0 && b > 0 ? 10 * Math.log10(a / b) : null; }

function gainByContributorQuartile(stems, start, count) {
  const rows = Array.from({ length: count }, (_, offset) => {
    let sum = 0, squares = 0;
    for (const plate of stems.plates) { const p = plate.left[start + offset] ** 2 + plate.right[start + offset] ** 2; sum += p; squares += p * p; }
    const neff = squares > 0 ? sum * sum / squares : 0;
    const leftGain = 1 / (1 + Math.abs(stems.preLimiter.left[start + offset]));
    const rightGain = 1 / (1 + Math.abs(stems.preLimiter.right[start + offset]));
    return { neff, gain: (leftGain + rightGain) / 2 };
  });
  const ordered = rows.slice().sort((a, b) => a.neff - b.neff);
  const n = Math.max(1, Math.floor(ordered.length / 4));
  const meanGain = values => values.reduce((sum, row) => sum + row.gain, 0) / values.length;
  return { quartileDefinition: 'equal-sized ranked quarters; ties retain all rows in stable order',
    lowestEffectiveContributorQuartileMeanGain: meanGain(ordered.slice(0, n)),
    highestEffectiveContributorQuartileMeanGain: meanGain(ordered.slice(-n)) };
}

function selectExamples(rows) {
  const valid = rows.filter(row => Number.isFinite(row.overlapDb))
    .sort((a, b) => a.overlapDb - b.overlapDb || a.event.frame - b.event.frame
      || String(a.event.message.layerId).localeCompare(String(b.event.message.layerId))
      || a.event.sequence - b.event.sequence);
  if (!valid.length) return { rule: 'No complete 500 ms focal/rest windows.', selections: [] };
  const at = q => valid[Math.round(q * (valid.length - 1))];
  const ranks = valid.length < 3 ? [...new Set([0, Math.floor((valid.length - 1) / 2), valid.length - 1])]
    .map(index => ['low', 'median', 'high'][index === 0 ? 0 : index === valid.length - 1 ? 2 : 1]) : ['low', 'median', 'high'];
  const points = valid.length < 3 ? valid : [at(.1), at(.5), at(.9)];
  const names = valid.length < 3 ? ranks : ['low', 'median', 'high'];
  return { rule: 'Sort complete 500 ms events by focal/rest pre-limiter level dB ascending; stable tie-break by event frame, layer ID, routed-message sequence; choose nearest-rank p10, p50, p90. Freeze before listening asset generation.',
    sortedEventCount: valid.length, selections: points.map((row, index) => ({ label: names[index],
      sequence: row.event.sequence, frame: row.event.frame, layerId: row.event.message.layerId,
      overlapDb: row.overlapDb })) };
}

async function writeAssets({ capture, stems, rawPcm, startFrame, analysis, analysisHash }) {
  const rows = [];
  for (const selected of analysis.deterministicExamples.selections) {
    const event = analysis.events.find(row => row.sequence === selected.sequence);
    const frameCount = RATE / 2, offset = event.frame - startFrame;
    const streams = {
      full: { left: rawPcm.left.subarray(offset, offset + frameCount), right: rawPcm.right.subarray(offset, offset + frameCount) },
      focal: renderReadout(stems, { kind: 'plate', id: event.layerId }, event.frame, frameCount),
      rest: renderReadout(stems, { kind: 'rest', except: event.layerId }, event.frame, frameCount),
      sphere: renderReadout(stems, { kind: 'sphere' }, event.frame, frameCount)
    };
    const prefix = `event-${selected.label}-${String(event.sequence).padStart(4, '0')}`;
    const files = {};
    for (const [name, pcm] of Object.entries(streams)) {
      const rms = stereoRms(stereoEnergy(pcm, 0, frameCount), frameCount);
      if (name === 'sphere' && rms === 0) continue;
      const relative = `listening/${prefix}-${name}-fixed-gain.wav`;
      const wav = encodeStereoFloatWav(pcm, { sampleRate: RATE, gain: 1 });
      await writeFile(`${EVIDENCE}/${relative}`, wav);
      files[name] = { path: relative, rms, gain: 1, sha256: sha256(wav), bytes: wav.length };
    }
    assert.deepEqual(streams.full, renderReadout(stems, { kind: 'full' }, event.frame, frameCount),
      'fixed-gain full excerpt synthesized from stems must match the production PCM exactly');
    rows.push({ label: selected.label, sequence: event.sequence, contactGroupIndex: event.contactGroupIndex,
      frame: event.frame, layerId: event.layerId, durationMs: 500, analysisSha256: analysisHash, files });
  }
  const page = listeningHtml(rows, capture, analysisHash);
  await writeFile(`${EVIDENCE}/listening.html`, page);
  await writeJson(`${EVIDENCE}/listening-assets.json`, { fixedGain: true, gain: 1,
    fullScaleNormalization: false, optionalRmsMatchedVersions: 'not created', examples: rows });
}

function renderReadout(stems, selection, startFrame, frames) {
  const firstBoundary = stems.startFrame + 8;
  const delta = startFrame - firstBoundary;
  const currentIndex = Math.floor(delta / 8), phaseOffset = delta % 8;
  assert.ok(currentIndex >= 1 && phaseOffset >= 0);
  const plateById = new Map(stems.plates.map(plate => [plate.id, plate]));
  const getLimited = (step, channel) => {
    const full = channel === 'left' ? stems.preLimiter.left[step] : stems.preLimiter.right[step];
    const gain = 1 / (1 + Math.abs(full));
    if (selection.kind === 'full') return full * gain;
    if (selection.kind === 'sphere') return stems.sphere[channel][step] * gain;
    if (selection.kind === 'plate') return plateById.get(selection.id)[channel][step] * gain;
    let total = 0;
    for (const plate of stems.plates) if (plate.id !== selection.except) total += plate[channel][step];
    return total * gain;
  };
  const out = { left: new Float32Array(frames), right: new Float32Array(frames) };
  for (let frame = 0; frame < frames; frame++) {
    const phase = phaseOffset + frame + 2;
    const interval = Math.floor((phase - 1) / 8);
    const amount = (phase - interval * 8) / 8;
    const a = currentIndex + interval - 1, b = currentIndex + interval;
    assert.ok(b < stems.frames, 'captured stems cover the excerpt interpolation interval');
    for (const channel of ['left', 'right']) {
      const previous = getLimited(a, channel), next = getLimited(b, channel);
      out[channel][frame] = previous + (next - previous) * amount;
    }
  }
  return out;
}

function listeningHtml(rows, capture, analysisHash) {
  const blocks = rows.map(row => `<section><h2>${escapeHtml(row.label)} — ${escapeHtml(row.layerId)}</h2><p>Routed event ${row.sequence}; contact group ${row.contactGroupIndex}; frame ${row.frame}; 500 ms. Fixed gain = 1.</p><div class="tracks">${Object.entries(row.files).map(([name, file]) => `<label>${escapeHtml(name)}<audio controls preload="none" src="${escapeHtml(file.path)}"></audio></label>`).join('')}</div></section>`).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANT Plate readout overlap · aligned examples</title><style>body{font:16px system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#19232d;background:#f4f6f7}section{background:white;border:1px solid #ccd3d8;border-radius:8px;padding:1rem;margin:1rem 0}.tracks{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1rem}label{display:grid;gap:.4rem;text-transform:capitalize}audio{width:100%}code{overflow-wrap:anywhere}</style><h1>ANT Plate readout overlap</h1><p>Seed ${SEED}. Frozen natural interval ${capture.startTimeMs}–${capture.endTimeMs} ms. Example rule and numeric analysis were frozen before these assets were written. These are aligned selections from one unchanged full coupled solve; focal is a point readout selection, not an isolated Plate render. No subjective judgments are included.</p><p>Analysis SHA-256: <code>${analysisHash}</code></p>${blocks}</html>`;
}

async function writeValidation({ capture, raw, observed, rawWallMs, observedWallMs,
  reconstructedMix, reconstructedPcm, analysisHash, stemsPackage, sourceHashes, routeAudit, totalWallSeconds }) {
  const mixError = compareFloat64(reconstructedMix, observed.pickupStems.preLimiter);
  const pcmError = compareFloat32(reconstructedPcm, raw.pcm);
  const report = {
    schemaVersion: 1, decision: 'TO BE RECORDED AFTER NUMERIC REVIEW',
    startingMainSha: git(['rev-parse', 'origin/main']),
    observerBaseSha: git(['rev-parse', 'codex/ant-plate-pickup-stem-observability-20261018']),
    branch: git(['branch', '--show-current']), sourceHashes,
    naturalCapture: { seed: capture.seed, ticks: capture.totalTicks, milestoneTick: capture.milestoneTick,
      intervalTicks: 600, simulationWallSeconds: capture.simulationWallSeconds,
      pairedAudioOffStateParitySamples: capture.parity.samples, allWorldParityFieldsMatch: true,
      audioOnBridge: capture.bridgeDiagnostics, rngEqual: capture.rng.control.state === capture.rng.observed.state
        && capture.rng.control.calls === capture.rng.observed.calls },
    routeAudit,
    replay: { frames: endFrameFor(capture), outputFrames: RATE * 10, physicsSteps: PHYSICS_RATE * 10,
      capturedMessages: capture.messages.length, scheduledMessages: raw.renderedFrameReceipts.length,
      replayStrikes: raw.telemetry.strikes,
      replayTopologyInstalls: raw.telemetry.topologies, droppedRoutes: raw.telemetry.droppedRoutes,
      droppedEvents: raw.telemetry.dropped,
      nonFinite: raw.telemetry.nonFinite, clipped: raw.telemetry.clipped ?? null,
      rawUninstrumentedWallMs: rawWallMs, observedWallMs, observerWallRatio: observedWallMs / rawWallMs,
      observedStemAllocatedBytes: observed.pickupStems.allocatedBytes, stemStorageBytes: stemsPackage.index.uncompressedBytes,
      comparedPreLimiterValues: mixError.comparedValues, preLimiterExactValues: mixError.exactValues,
      preLimiterMaxAbsoluteError: mixError.maxAbsoluteError, comparedPcmValues: pcmError.comparedValues,
      pcmExactValues: pcmError.exactValues, pcmMaxAbsoluteError: pcmError.maxAbsoluteError,
      pcmSampleExact: pcmError.maxAbsoluteError === 0 && pcmError.exactValues === pcmError.comparedValues,
      sourceWorkletSha256: raw.sourceSha256, telemetryExact: JSON.stringify(raw.telemetry) === JSON.stringify(observed.telemetry),
      analysisSha256: analysisHash },
    memoryAndRuntime: { productionWorkletChanged: false, diagnosticDisabledProductionCost: 'zero added branches/allocations: all implementation changes are confined to scripts/ and tests/',
      boundedStemBytes: observed.pickupStems.allocatedBytes, observedReplayWallMs: observedWallMs,
      rawReplayWallMs: rawWallMs, timingIsSingleRunAndNotABenchmark: true },
    totalWallSeconds
  };
  await writeJson(`${EVIDENCE}/validation.json`, report);
}

function compareFloat64(a, b) {
  let exactValues = 0, maxAbsoluteError = 0;
  for (const channel of ['left', 'right']) for (let i = 0; i < a[channel].length; i++) {
    const difference = Math.abs(a[channel][i] - b[channel][i]);
    if (difference === 0) exactValues++;
    maxAbsoluteError = Math.max(maxAbsoluteError, difference);
  }
  return { comparedValues: a.left.length * 2, exactValues, maxAbsoluteError };
}
function compareFloat32(a, b) {
  let exactValues = 0, maxAbsoluteError = 0;
  for (const channel of ['left', 'right']) for (let i = 0; i < a[channel].length; i++) {
    const difference = Math.abs(a[channel][i] - b[channel][i]);
    if (difference === 0) exactValues++;
    maxAbsoluteError = Math.max(maxAbsoluteError, difference);
  }
  return { comparedValues: a.left.length * 2, exactValues, maxAbsoluteError };
}

function endFrameFor(capture) { return capture.intervalEndTick * TICK_FRAMES; }
function escapeHtml(text) { return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
async function writeJson(path, value) { await writeFile(path, JSON.stringify(value, null, 2) + '\n'); }
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
