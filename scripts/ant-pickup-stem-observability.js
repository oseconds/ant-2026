import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { instrumentSurfaceSchedule, reconstructPickupStemMix, reconstructSurfacePcm,
  renderProductionSurface, renderSurface, sha256 } from './ant-sonic-shadow-render.js';

const mainSha = '8c60e4bba3bd5b476300e90a2936bfebd1f831c2';
const expectedWorkletSha = '14c7461f1412f0d6897a6683d46e582dbb80711f2ba74e8ea53e026895eeea5e';
const inputPath = 'docs/ant/evidence/2026-10-13-plate-sonic-individuality/frozen-inputs.json.gz';
const priorManifestPath = 'docs/ant/evidence/2026-10-13-plate-sonic-individuality/render-manifest.json';
const outputPath = 'docs/ant/evidence/2026-10-18-plate-pickup-stem-observability/validation.json';
const rate = 48_000;

function topologySha(topology) {
  return sha256(JSON.stringify(topology, (_key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value));
}
function pathPosition(plate, fraction) {
  const path = plate.principalPath, lengths = [0];
  for (let i = 1; i < path.length; i++) {
    lengths.push(lengths.at(-1) + Math.hypot(path[i] % 96 - path[i - 1] % 96,
      Math.floor(path[i] / 96) - Math.floor(path[i - 1] / 96)));
  }
  const index = lengths.findIndex(value => value >= lengths.at(-1) * fraction), cell = path[index];
  return { x: (cell % 96) / 95, y: Math.floor(cell / 96) / 95 };
}
function strike(plateId, position, frame = 480) {
  return { frame, message: { type: 'strike', payload: { plateId, layerId: plateId, position,
    strength: .035, footprintRadius: .01, hardness: .5 } } };
}
function sampleComparison(actual, expected) {
  assert.equal(actual.length, expected.length);
  let exact = true, maxAbsoluteError = 0, firstMismatch = null;
  for (let i = 0; i < actual.length; i++) {
    const difference = Math.abs(actual[i] - expected[i]);
    if (!Object.is(actual[i], expected[i])) {
      exact = false;
      if (firstMismatch === null) firstMismatch = i;
      if (difference > maxAbsoluteError) maxAbsoluteError = difference;
    }
  }
  return { exact, samples: actual.length, firstMismatch, maxAbsoluteError };
}
function interleavedPcm(pcm) {
  assert.equal(pcm.left.length, pcm.right.length);
  const bytes = Buffer.allocUnsafe(pcm.left.length * 8);
  for (let i = 0; i < pcm.left.length; i++) {
    bytes.writeFloatLE(pcm.left[i], i * 8);
    bytes.writeFloatLE(pcm.right[i], i * 8 + 4);
  }
  return bytes;
}
function stateHash(state) {
  const hash = createHash('sha256');
  for (const [key, value] of Object.entries(state)) {
    hash.update(`${key}:`);
    if (ArrayBuffer.isView(value)) hash.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    else hash.update(JSON.stringify(value));
    hash.update('\n');
  }
  return hash.digest('hex');
}
function makePlate(id, x0, x1, y0 = 44, y1 = 50) {
  const mask = new Array(96 * 96).fill(0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * 96 + x] = 1;
  return { id, grid: { width: 96, height: 96 }, mask, edges: [],
    pickups: [{ x: x0 / 95, y: 47 / 95 }, { x: x1 / 95, y: 47 / 95 }],
    material: { stiffness: .9, density: 1.1, damping: .35 } };
}

const sourceBytes = await readFile('static/worklets/surface-plate.worklet.js');
const source = sourceBytes.toString('utf8'), workletSha = sha256(sourceBytes);
assert.equal(workletSha, expectedWorkletSha, 'frozen current-main worklet source must remain unchanged');
const frozenInputBytes = await readFile(inputPath);
const inputs = JSON.parse(gunzipSync(frozenInputBytes));
assert.equal(inputs.baseline, 'd45823d40c9a87c1b333fa9872f3c897ee9ab01b');
const priorManifest = JSON.parse(await readFile(priorManifestPath, 'utf8'));

const p24 = inputs.selected.find(row => row.key === '20261005-trail-plate-24');
assert.ok(p24 && sha256(JSON.stringify(p24.plate)) === p24.descriptorSha256);
const p24Topology = compileSurfaceTopology({ plates: [p24.plate] });
assert.equal(topologySha(p24Topology), '054638b345610bff0304662b691343878eab0f9482add24768591e61caaf0f01');
const p24Events = [strike(p24.plate.id, pathPosition(p24.plate, .5))];

const worldTopology = compileSurfaceTopology({ plates: inputs.world.plates });
assert.equal(worldTopology.layerIds.length, 38);
assert.ok(worldTopology.adjacentLinkNodes.length > 0);
const worldPlateIndex = worldTopology.layerIds.indexOf('trail-plate-38');
assert.ok(worldPlateIndex >= 0);
const worldPlate = inputs.world.plates.find(plate => plate.id === 'trail-plate-38');
const worldTarget = pathPosition(worldPlate, .5);
let worldCell = -1, worldDistance = Infinity;
for (let cell = 0; cell < worldTopology.routingTopLayerByCell96.length; cell++) {
  if (worldTopology.routingTopLayerByCell96[cell] !== worldPlateIndex) continue;
  const distance = Math.hypot(cell % 96 / 95 - worldTarget.x,
    Math.floor(cell / 96) / 95 - worldTarget.y);
  if (distance < worldDistance) { worldDistance = distance; worldCell = cell; }
}
assert.ok(worldCell >= 0);
const worldPosition = { x: worldCell % 96 / 95, y: Math.floor(worldCell / 96) / 95 };
assert.equal(topologySha(worldTopology), '229842415a80639434e02a0c2b4859727b696835c01591a90176f14d522ea2cf');
const worldEvents = [strike(worldPlate.id, worldPosition)];

const lower = makePlate('lower', 30, 62), upper = makePlate('upper', 46, 76);
const nodule = { id: 'sphere', position: { x: .5, y: .5 }, physicalRadiusMeters: .024,
  material: { density: 2000, youngModulus: 800000, poisson: .3, damping: .35 },
  burial: { buriedDepthMeters: .04 }, coupling: { plateId: 'lower', weight: .2, position: { x: .5, y: .5 } } };
const sphereTopology = compileSurfaceTopology({ plates: [lower, upper], nodules: [nodule],
  stratigraphy: { layerOrder: ['lower', 'upper'] } });
const sphereEvents = [{ frame: 480, message: { type: 'strike', payload: { plateId: 'lower', layerId: 'lower',
  position: { x: 35 / 95, y: 47 / 95 }, strength: .035, footprintRadius: .012, hardness: .5 } } }];

const cases = [
  { id: 'isolated-p24-p50', provenance: 'frozen native isolated P24 p50 production fixture',
    topology: p24Topology, events: p24Events, frames: 72_000, expectedStrikes: 1,
    frozenPcmPath: 'test-results/ant-plate-sonic-individuality-20261013/20261005-trail-plate-24-p50-native.pcm.f32le' },
  { id: 'frozen-world-z-plate-38', provenance: 'frozen seed-07 38-Plate topology, one Plate-38 strike, existing Z control',
    topology: worldTopology, events: worldEvents, frames: 72_000, expectedStrikes: 1,
    frozenPcmPath: 'test-results/ant-plate-sonic-individuality-20261013/world-trail-plate-38-world-z.pcm.f32le' },
  { id: 'coupled-sphere-test-fixture', provenance: 'existing worklet test geometry with one direct strike and a coupled Nodule',
    topology: sphereTopology, events: sphereEvents, frames: 9_600, expectedStrikes: 1, frozenPcmPath: null }
];

async function renderCase(item) {
  const common = { source, topology: item.topology, events: item.events, frames: item.frames, sampleRate: rate };
  const baseStart = performance.now();
  const baseline = renderProductionSurface({ ...common, captureState: true, captureStateHashes: true });
  const baselineRenderMs = performance.now() - baseStart;
  const stemStart = performance.now();
  const observed = renderSurface({ ...common, captureFields: false, capturePickupStems: true,
    captureState: true, captureStateHashes: true });
  const diagnosticRenderMs = performance.now() - stemStart;
  assert.equal(baseline.telemetry.strikes, item.expectedStrikes, `${item.id}: accepted strikes`);
  assert.deepEqual(observed.telemetry, baseline.telemetry, `${item.id}: telemetry parity`);
  assert.deepEqual(observed.finalState, baseline.finalState, `${item.id}: complete final solver state parity`);
  assert.deepEqual(observed.stateHashes, baseline.stateHashes, `${item.id}: solver state parity at every physics step`);
  assert.deepEqual(observed.pcm, baseline.pcm, `${item.id}: diagnostic-disabled PCM parity`);
  assert.equal(baseline.telemetry.dropped, 0, `${item.id}: no dropped events`);
  assert.equal(baseline.telemetry.droppedRoutes, 0, `${item.id}: no dropped routes`);
  assert.equal(baseline.telemetry.nonFinite, 0, `${item.id}: no nonfinite solver value`);
  assert.equal(baseline.telemetry.clipped, 0, `${item.id}: no solver clipping`);

  const stems = observed.pickupStems;
  const reconstructedMix = reconstructPickupStemMix(stems);
  const preLimiterLeft = sampleComparison(reconstructedMix.left, stems.preLimiter.left);
  const preLimiterRight = sampleComparison(reconstructedMix.right, stems.preLimiter.right);
  assert.equal(preLimiterLeft.exact, true, `${item.id}: exact left pre-limiter reconstruction`);
  assert.equal(preLimiterRight.exact, true, `${item.id}: exact right pre-limiter reconstruction`);
  const reconstructedPcm = reconstructSurfacePcm(stems, { frames: item.frames, sampleRate: rate });
  const pcmLeft = sampleComparison(reconstructedPcm.left, baseline.pcm.left);
  const pcmRight = sampleComparison(reconstructedPcm.right, baseline.pcm.right);
  assert.equal(pcmLeft.exact, true, `${item.id}: exact left PCM reconstruction`);
  assert.equal(pcmRight.exact, true, `${item.id}: exact right PCM reconstruction`);

  const pcm = interleavedPcm(baseline.pcm);
  const exactFloat32StereoBytes = interleavedPcm(reconstructedPcm).equals(pcm);
  assert.equal(exactFloat32StereoBytes, true, `${item.id}: exact stereo PCM bytes`);
  let frozenPcm = { available: false };
  if (item.frozenPcmPath) {
    const expectedArtifact = priorManifest.artifacts.find(artifact => artifact.path === item.frozenPcmPath);
    assert.ok(expectedArtifact, `${item.id}: frozen PCM hash exists in the prior manifest`);
    try {
      const bytes = await readFile(item.frozenPcmPath);
      assert.equal(bytes.length, expectedArtifact.bytes);
      assert.equal(sha256(bytes), expectedArtifact.sha256);
      assert.equal(sha256(bytes), sha256(pcm), `${item.id}: PCM equals existing frozen production artifact`);
      frozenPcm = { available: true, bytes: bytes.length, sha256: expectedArtifact.sha256, exactProductionMatch: true };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      frozenPcm = { available: false, sha256: expectedArtifact.sha256,
        note: 'Ignored frozen PCM is absent; exact uninstrumented current-source PCM comparison still ran.' };
    }
  }
  const spherePeak = Math.max(...stems.sphere.left.map(Math.abs), ...stems.sphere.right.map(Math.abs));
  return {
    id: item.id, provenance: item.provenance, frames: item.frames, sampleRate: rate,
    topology: { generation: item.topology.generation, layers: item.topology.layerIds.length,
      layerIds: item.topology.layerIds, zLinks: item.topology.adjacentLinkCoefficients.length,
      nodules: item.topology.noduleIds.length, sha256: topologySha(item.topology) },
    eventSchedule: item.events, eventScheduleSha256: sha256(JSON.stringify(item.events)),
    acceptedStrikes: baseline.telemetry.strikes,
    telemetryEqual: true,
    counters: { topologies: baseline.telemetry.topologies, dropped: baseline.telemetry.dropped,
      droppedRoutes: baseline.telemetry.droppedRoutes, nonFinite: baseline.telemetry.nonFinite,
      clipped: baseline.telemetry.clipped, physicsSteps: baseline.telemetry.physicsSteps,
      sleeps: baseline.telemetry.sleeps, wakes: baseline.telemetry.wakes },
    state: { exactFinalStateEquality: true, exactEveryPhysicsStep: true,
      finalSha256: stateHash(baseline.finalState), physicsStepHashSha256: sha256(JSON.stringify(baseline.stateHashes)) },
    pickupStems: { layerIds: stems.layerIds, physicsSteps: stems.frames, sampleRate: stems.sampleRate,
      allocatedBytes: stems.allocatedBytes, capacitySteps: stems.maxPhysicsSteps,
      preLimiterReconstruction: { left: preLimiterLeft, right: preLimiterRight },
      spherePeakAbs: spherePeak, pcmSha256: sha256(pcm) },
    finalPcmReconstruction: { left: pcmLeft, right: pcmRight, exactFloat32StereoBytes },
    frozenReference: frozenPcm,
    runtime: { rawWorkletStateAuditMs: baselineRenderMs, stemCaptureStateAuditMs: diagnosticRenderMs,
      measuredDeltaMs: diagnosticRenderMs - baselineRenderMs,
      method: 'Node VM timings; per-step state-hash audit is included equally in both paths and is not a production runtime estimate.' }
  };
}

const results = [];
for (const item of cases) results.push(await renderCase(item));

const offlineModule = instrumentSurfaceSchedule(source).replace('this.__shadowFields = [];', 'this.__shadowFields = null;');
assert.notEqual(offlineModule, instrumentSurfaceSchedule(source));
let browser, server;
const browserChecks = [];
try {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>ANT pickup stem reconstruction</title>');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i], vmResult = renderSurface({ source, topology: item.topology, events: item.events,
      frames: item.frames, sampleRate: rate, captureFields: false, capturePickupStems: true });
    const chromeBase64 = await page.evaluate(async ({ module, topology, events, frames, sampleRate }) => {
      const context = new OfflineAudioContext(2, frames, sampleRate);
      const url = URL.createObjectURL(new Blob([module], { type: 'text/javascript' }));
      await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(context, 'surface-plate-processor', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
        processorOptions: { evidenceTopology: topology, evidenceSchedule: { events } }
      });
      node.connect(context.destination);
      const audio = await context.startRendering(), bytes = new Uint8Array(frames * 8), view = new DataView(bytes.buffer);
      for (let frame = 0; frame < frames; frame++) {
        view.setFloat32(frame * 8, audio.getChannelData(0)[frame], true);
        view.setFloat32(frame * 8 + 4, audio.getChannelData(1)[frame], true);
      }
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32768)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      node.disconnect(); node.port.close();
      return btoa(binary);
    }, { module: offlineModule, topology: item.topology, events: item.events,
      frames: item.frames, sampleRate: rate });
    const chromePcm = Buffer.from(chromeBase64, 'base64');
    const reconstructedPcm = interleavedPcm(reconstructSurfacePcm(vmResult.pickupStems,
      { frames: item.frames, sampleRate: rate }));
    assert.ok(chromePcm.equals(reconstructedPcm), `${item.id}: exact Chrome offline PCM bytes equal reconstructed stems`);
    browserChecks.push({ id: item.id, browser: browser.version(), exactPcmEquality: true,
      samples: item.frames, pcmSha256: sha256(chromePcm) });
  }
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
}

const report = {
  schemaVersion: 1, date: '2026-10-18', decision: 'SUPPORTED',
  startingMainSha: mainSha,
  workletSourceSha256: workletSha,
  frozenInput: { path: inputPath, sha256: sha256(frozenInputBytes), corpusBaseline: inputs.baseline,
    selectedP24DescriptorSha256: p24.descriptorSha256, seed07World: { plates: inputs.world.plates.length,
      nodules: inputs.world.nodules.length, simulationTimeMs: inputs.world.timeMs } },
  implementation: {
    boundary: 'scripts/ant-sonic-shadow-render.js source instrumentation used only by the offline research harness',
    productionSourceChanged: false,
    exposes: 'Float64Array stereo pickup contribution per Plate layer ID, aggregate Sphere contribution, per-step pre-limiter mix, topology generation and exact pickup accumulation order',
    captureMemoryLimitBytes: 256 * 1024 * 1024,
    normalProductionOverhead: 'zero; src/, static/, SurfaceAudioBridge and topology compiler unchanged',
    noPerPlateWebAudioNodes: true,
    soloMuteSemantics: 'select recorded layer arrays after the one full-network solve; no physics rerun or state removal'
  },
  cases: results,
  chromeOfflineAudioContext: browserChecks,
  overall: {
    preLimiterExactEveryPhysicsStep: results.every(row => row.pickupStems.preLimiterReconstruction.left.exact
      && row.pickupStems.preLimiterReconstruction.right.exact),
    finalPcmExactEveryOutputSample: results.every(row => row.finalPcmReconstruction.exactFloat32StereoBytes),
    completeFinalStateExact: results.every(row => row.state.exactFinalStateEquality),
    completeStateHashesExactEveryPhysicsStep: results.every(row => row.state.exactEveryPhysicsStep),
    acceptedStrikesUnchanged: results.every(row => row.telemetryEqual),
    chromeOfflinePcmExact: browserChecks.every(row => row.exactPcmEquality),
    denseEightPlateExperimentRun: false
  }
};
assert.ok(report.overall.preLimiterExactEveryPhysicsStep && report.overall.finalPcmExactEveryOutputSample
  && report.overall.completeFinalStateExact && report.overall.completeStateHashesExactEveryPhysicsStep
  && report.overall.acceptedStrikesUnchanged
  && report.overall.chromeOfflinePcmExact);
await mkdir('docs/ant/evidence/2026-10-18-plate-pickup-stem-observability', { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ decision: report.decision, cases: results.map(row => ({
  id: row.id, physicsSteps: row.pickupStems.physicsSteps, allocatedBytes: row.pickupStems.allocatedBytes,
  preLimiterExact: row.pickupStems.preLimiterReconstruction.left.exact && row.pickupStems.preLimiterReconstruction.right.exact,
  pcmSha256: row.pickupStems.pcmSha256
})), chromeOfflineAudioContext: browserChecks, outputPath }, null, 2));
