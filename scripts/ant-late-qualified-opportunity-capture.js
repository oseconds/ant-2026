import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { gzipSync, gunzipSync } from 'node:zlib';
import { executeScenario } from './ant-g-production-candidate-natural.js';
import { neighbors8 } from './ant-opportunity-core.js';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-29-late-qualified-opportunity-capture';
const DATA = `${PACKAGE}/data`;
const EXISTING = 'docs/ant/evidence/2026-10-25-g-production-candidate-review/data';
const STRATA = 'docs/ant/evidence/2026-10-29-stratigraphy-signal-audit/data/reconstructed-commit-context.json.gz';
const N = 96, COUNT = N * N, FOOT_RADIUS = 0.037, FOOT_WINDOW_MS = 20000;
const WINDOWS = [{ label: '300s', startSeconds: 280, endSeconds: 300 },
  { label: '600s', startSeconds: 580, endSeconds: 600 }];
const SOURCE_NAMES = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'scripts/ant-founder-evidence.js', 'docs/ant/README.md'
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value);
const digestTyped = value => sha(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
const indices = mask => Array.from(mask, (value, i) => value ? i : -1).filter(i => i >= 0);
const point = i => ({ x: (i % N) / 95, y: Math.floor(i / N) / 95 });
const distance = (a, b) => Math.hypot(a % N - b % N, Math.floor(a / N) - Math.floor(b / N)) / 95;

function loadProductionThinner(sourceText) {
  const math = Object.create(Math);
  math.random = () => { throw new Error('RNG use is forbidden in the production-thinning observer.'); };
  return runInNewContext(sourceText.replace(/^export /gm, '') + '\n({ zhangSuen })', { Math: math }).zhangSuen;
}

function isTargetTime(timeMs) {
  return WINDOWS.some(({ startSeconds, endSeconds }) =>
    timeMs >= (startSeconds - 1) * 1000 && timeMs < endSeconds * 1000);
}

function targetWindow(timeMs) {
  return WINDOWS.find(({ startSeconds, endSeconds }) =>
    timeMs >= (startSeconds - 1) * 1000 && timeMs < endSeconds * 1000);
}

function nearbyContactCells(x, y) {
  const cells = [];
  const minX = Math.max(0, Math.ceil((x - FOOT_RADIUS) * 95));
  const maxX = Math.min(95, Math.floor((x + FOOT_RADIUS) * 95));
  const minY = Math.max(0, Math.ceil((y - FOOT_RADIUS) * 95));
  const maxY = Math.min(95, Math.floor((y + FOOT_RADIUS) * 95));
  for (let cy = minY; cy <= maxY; cy += 1) for (let cx = minX; cx <= maxX; cx += 1) {
    if (Math.hypot(cx / 95 - x, cy / 95 - y) <= FOOT_RADIUS) cells.push(cy * N + cx);
  }
  return cells;
}

function attachReadOnlyObserver(controller, zhangSuen, captures, captureCounts, feet) {
  const birth = controller.trailPlateBirth;
  const build = birth.buildSupportedMask.bind(birth);
  birth.buildSupportedMask = surface => {
    const result = build(surface);
    const timeMs = controller.simulationTimeMs;
    if (!isTargetTime(timeMs)) return result;
    const B = birth.chemicalMemory.slice();
    const C = surface.values.slice();
    const D = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i += 1) D[i] = Math.fround(surface.sampleSupport(i % N / 95, Math.floor(i / N) / 95, 0.025));
    const E = result.mask.slice();
    const F = zhangSuen(E);
    const S = new Uint8Array(COUNT);
    for (let i = 0; i < COUNT; i += 1) if (F[i] && neighbors8(i).some(j => F[j])) S[i] = 1;
    for (const i of indices(S)) assert.equal(result.supports[i], D[i], `production support mismatch at ${timeMs}/${i}`);
    const priorPlates = birth.getPlates().filter(plate => plate.bornAtSimulationTimeMs < timeMs);
    const preMaterialLayers = new Uint8Array(COUNT);
    for (const plate of priorPlates) for (let i = 0; i < COUNT; i += 1) if (plate.mask[i]) preMaterialLayers[i] += 1;
    const window = targetWindow(timeMs);
    const rows = captures[window.label];
    rows.push({
      timeMs, tick: Math.round(timeMs / (1000 / 60)),
      B, C, D, E: indices(E), F: indices(F), S: indices(S),
      preMaterialLayers, preexistingPlateIds: priorPlates.map(plate => plate.id)
    });
    captureCounts[window.label] += 1;
    if (rows.length > 20) rows.shift();
    return result;
  };
  controller.subscribe(event => {
    if (event.type !== 'foot-contact') return;
    const payload = event.payload;
    if (payload?.type !== 'FOOT_CONTACT' || !Array.isArray(payload.contacts)) return;
    const timeMs = payload.simulationTimeMs;
    if (!Number.isFinite(timeMs)) return;
    for (const contact of payload.contacts) {
      const position = contact?.position;
      if (typeof contact?.legId !== 'string' || !contact.legId || !Number.isFinite(position?.x)
        || !Number.isFinite(position?.y) || position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) continue;
      feet.push({ timeMs, x: position.x, y: position.y,
        exact: Math.round(position.y * 95) * N + Math.round(position.x * 95) });
    }
  });
}

function addRecentFootContext(frames, feet) {
  feet.sort((a, b) => a.timeMs - b.timeMs);
  for (const frame of frames) {
    const recent = feet.filter(foot => foot.timeMs > frame.timeMs - FOOT_WINDOW_MS && foot.timeMs <= frame.timeMs);
    const nearby = new Uint32Array(COUNT), exact = new Uint32Array(COUNT), last = new Float64Array(COUNT).fill(-Infinity);
    for (const foot of recent) {
      exact[foot.exact] += 1;
      for (const cell of nearbyContactCells(foot.x, foot.y)) {
        nearby[cell] += 1;
        last[cell] = foot.timeMs;
      }
    }
    frame.channels = {
      B: frame.B,
      C: frame.C,
      D: frame.D,
      recent: nearby
    };
    frame.exactFeet20s = exact;
    frame.lastNearbyFootAgeSeconds = Float32Array.from(last, value => Number.isFinite(value)
      ? (frame.timeMs - value) / 1000 : NaN);
    frame.footWindowCount = recent.length;
    frame.exposureSeconds = 20;
  }
}

function arrayState(frame) {
  return {
    timeMs: frame.timeMs, tick: frame.tick,
    B: Array.from(frame.B), C: Array.from(frame.C), D: Array.from(frame.D),
    E: frame.E, F: frame.F, S: frame.S,
    preMaterialLayers: Array.from(frame.preMaterialLayers), preexistingPlateIds: frame.preexistingPlateIds,
    channels: Object.fromEntries(Object.entries(frame.channels).map(([name, values]) => [name, Array.from(values)])),
    exactFeet20s: Array.from(frame.exactFeet20s),
    lastNearbyFootAgeSeconds: Array.from(frame.lastNearbyFootAgeSeconds, value => Number.isFinite(value) ? value : null),
    footWindowCount: frame.footWindowCount, exposureSeconds: frame.exposureSeconds
  };
}

async function assertSourceAuthority(provenance, sourceHashes) {
  for (const file of SOURCE_NAMES) {
    const actual = sha(await readFile(resolve(ROOT, file)));
    sourceHashes[file] = actual;
  }
}

async function readJson(path) { return JSON.parse(await readFile(resolve(ROOT, path), 'utf8')); }
async function readGzipJson(path) { return JSON.parse(gunzipSync(await readFile(resolve(ROOT, path)))); }
async function writeGzip(path, value) {
  await writeFile(resolve(ROOT, path), gzipSync(json(value) + '\n', { level: 9, mtime: 0 }));
}

async function validateAndCapture() {
  const provenance = await readJson(`${EXISTING}/PROVENANCE.json`);
  const existingSummary = await readJson(`${EXISTING}/SUMMARY.json`);
  const checksums = await readJson(`${EXISTING}/SHA256SUMS.json`);
  const sourceHashes = {};
  await assertSourceAuthority(provenance, sourceHashes);
  assert.equal(provenance.seeds.join(','), '20261005,20261006,20261007');
  assert.equal(provenance.arms.join(','), 'G');
  assert.equal(provenance.seconds, 600);
  assert.equal(provenance.tickRate, 60);
  assert.equal(provenance.observationRngCalls, 0);
  assert.equal(provenance.audioBridge, null);
  assert.equal(provenance.materialLocomotionResistance, true);

  const baselineRawBytes = await readFile(resolve(ROOT, `${EXISTING}/seed20261005-G-raw.json.gz`));
  const baselineRawSha = sha(baselineRawBytes);
  assert.equal(baselineRawSha, 'a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414');
  assert.equal(baselineRawSha, checksums['seed20261005-G-raw.json.gz']);
  const baselineRaw = JSON.parse(gunzipSync(baselineRawBytes));
  const baselineScenario = existingSummary.scenarios.find(row => row.seed === 20261005);
  const baselineRun = baselineScenario.arms.find(row => row.arm === 'G');
  const storedCheckpoints = new Map(baselineRun.checkpoints.map(row => [row.seconds, row]));
  const maskContextBytes = await readFile(resolve(ROOT, STRATA));
  assert.equal(sha(maskContextBytes), 'a62ad65b772db8d040ed9bebf636e8af32d2d185ea65fead4a431262964df0e5');
  const maskContext = JSON.parse(gunzipSync(maskContextBytes));
  assert.equal(maskContext.commits.length, baselineRaw.births.length);
  for (let i = 0; i < maskContext.commits.length; i += 1) {
    const context = maskContext.commits[i], receipt = baselineRaw.births[i];
    assert.equal(context.id, receipt.id);
    assert.equal(context.bornAtSimulationTimeMs, receipt.bornAtSimulationTimeMs);
    assert.equal(sha(Buffer.from(Uint8Array.from(context.descriptor.mask))), receipt.maskSha256);
  }

  const sourceText = await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
  const zhangSuen = loadProductionThinner(sourceText);
  const captures = Object.fromEntries(WINDOWS.map(window => [window.label, []]));
  const captureCounts = Object.fromEntries(WINDOWS.map(window => [window.label, 0]));
  const feet = [];
  const tempOutput = resolve(tmpdir(), `ant-late-qualified-opportunity-${process.pid}`);
  await mkdir(tempOutput);
  let run;
  try {
    run = await executeScenario(20261005, 'G', 600, tempOutput, null,
      controller => attachReadOnlyObserver(controller, zhangSuen, captures, captureCounts, feet));
    const replayRaw = await readGzipJsonFrom(tempOutput, 'seed20261005-G-raw.json.gz');
    assert.equal(run.initialStateSha256, baselineRun.initialStateSha256, 'initial state fingerprint');
    assert.deepEqual(replayRaw.positions, baselineRaw.positions, 'all 600 stored agent-identity/position snapshots');
    assert.deepEqual(replayRaw.contactsBySecond, baselineRaw.contactsBySecond, 'all 600 per-second contact-count buckets');
    assert.deepEqual(replayRaw.births, baselineRaw.births, 'all actual Plate IDs/times/geometry/mask hashes');
    assert.equal(replayRaw.events.contactStreamSha256, baselineRaw.events.contactStreamSha256,
      'full ordered FOOT_CONTACT payload hash');
    assert.equal(replayRaw.events.plateBirthStreamSha256, baselineRaw.events.plateBirthStreamSha256,
      'full ordered Plate birth payload hash');
    assert.equal(run.events.plateBirths, baselineRun.events.plateBirths);
    assert.equal(run.events.contactGroups, baselineRun.events.contactGroups);
    assert.equal(run.events.individualFeet, baselineRun.events.individualFeet);
    assert.equal(run.finalRng.state, baselineRun.finalRng.state);
    assert.equal(run.finalRng.calls, baselineRun.finalRng.calls);

    const checkpointChecks = [];
    for (const seconds of [30, 60, 120, 300, 600]) {
      const saved = await readGzipJson(`${EXISTING}/seed20261005-G-${seconds}s.json.gz`);
      const replay = await readGzipJsonFrom(tempOutput, `seed20261005-G-${seconds}s.json.gz`);
      const stored = storedCheckpoints.get(seconds);
      assert.deepEqual(replay.pheromone, saved.pheromone, `${seconds}s resampled chemical map`);
      assert.deepEqual(replay.surface, saved.surface, `${seconds}s SurfaceField map`);
      assert.deepEqual(replay.occupancy, saved.occupancy, `${seconds}s occupancy checkpoint`);
      assert.deepEqual(replay.persistent30sChemicalMask, saved.persistent30sChemicalMask,
        `${seconds}s persistent chemical mask`);
      const savedSurface = new SurfaceField(); savedSurface.values.set(saved.surface.values);
      const derivedSupport = new Float32Array(COUNT);
      for (let i = 0; i < COUNT; i += 1) derivedSupport[i] = Math.fround(savedSurface.sampleSupport(i % N / 95,
        Math.floor(i / N) / 95, 0.025));
      const replayCheckpoint = run.checkpoints.find(row => row.seconds === seconds);
      assert.equal(replayCheckpoint.rngState, stored.rngState, `${seconds}s RNG state`);
      assert.equal(replayCheckpoint.rngCalls, stored.rngCalls, `${seconds}s RNG call count`);
      assert.equal(replayCheckpoint.contactStreamSha256, stored.contactStreamSha256,
        `${seconds}s cumulative contact stream`);
      assert.deepEqual(replayCheckpoint.plateBirthTimesSeconds, stored.plateBirthTimesSeconds,
        `${seconds}s actual Plate birth times`);
      checkpointChecks.push({ seconds, pheromoneMapExact: true, surfaceExact: true, occupancyExact: true,
        persistentMaskExact: true, rngStateExact: true, rngCallsExact: true, contactStreamExact: true, birthTimesExact: true,
        savedSurfaceValueHash: digestTyped(savedSurface.values), derivedDsupportSha256: digestTyped(derivedSupport) });
    }
    const selectedFrames = [], selectedByWindow = {};
    for (const window of WINDOWS) {
      const frameSet = captures[window.label];
      assert.equal(frameSet.length, 20, `${window.label} has 20 actual one-second TrailPlateBirth analysis anchors`);
      for (let i = 1; i < frameSet.length; i += 1) {
        assert.ok(frameSet[i].timeMs > frameSet[i - 1].timeMs, `${window.label} timestamps increase`);
      }
      selectedByWindow[window.label] = { observerCallsInBufferWindow: captureCounts[window.label], retainedStates: 20,
        firstTimeMs: frameSet[0].timeMs, lastTimeMs: frameSet.at(-1).timeMs,
        intervalsMs: frameSet.slice(1).map((frame, i) => frame.timeMs - frameSet[i].timeMs) };
      selectedFrames.push(...frameSet);
    }
    addRecentFootContext(selectedFrames, feet);
    return {
      provenance: {
        schema: 'ant-late-qualified-opportunity-replay-v1', main: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785',
        researchParent: '2000d16b361dfeaf4ef915de460ea9c3e0fd0146',
        branch: 'codex/ant-late-qualified-opportunity-capture-20261029',
        sourceRun: `${EXISTING}/seed20261005-G-raw.json.gz`, sourceRunSha256: baselineRawSha,
        sourceCheckpointChecksumsSha256: sha(await readFile(resolve(ROOT, `${EXISTING}/SHA256SUMS.json`))),
        sourceConformanceSha256: sha(await readFile(resolve(ROOT, 'docs/ant/evidence/2026-10-25-g-production-candidate-review/NATURAL-CONFORMANCE.json'))),
        actualMaskSource: STRATA, actualMaskSourceSha256: sha(maskContextBytes), actualMasksMatchedReceipts: 36,
        sourceHashes, storedCaptureSourceHashes: provenance.sourceHashes,
        sourceHashDifferencesFromStoredCapture: SOURCE_NAMES.filter(file => sourceHashes[file] !== provenance.sourceHashes[file])
          .map(file => ({ file, currentMainSha256: sourceHashes[file], storedCaptureSha256: provenance.sourceHashes[file] })),
        replayRunner: 'scripts/ant-g-production-candidate-natural.js',
        replayRunnerSha256: sha(await readFile(resolve(ROOT, 'scripts/ant-g-production-candidate-natural.js'))),
        observer: 'read-only wrapper around production TrailPlateBirth.buildSupportedMask; samples copied after native chemical-memory update',
        observerRngCalls: 0, productionBehaviorModified: false, newTrajectoryOrSeed: false,
        deterministicReplay: true, captureStates: selectedFrames.map(frame => ({ tick: frame.tick, timeMs: frame.timeMs,
          B: digestTyped(frame.B), C: digestTyped(frame.C), D: digestTyped(frame.D), E: sha(Buffer.from(Uint8Array.from(frame.E))),
          F: sha(Buffer.from(Uint8Array.from(frame.F))), S: sha(Buffer.from(Uint8Array.from(frame.S))) })),
        parity: { initialState: true, all600AgentSnapshots: true, all600ContactBuckets: true, fullContactStreamHash: true,
          actualBirthReceipts: true, maskHashes: true, checkpointMaps: checkpointChecks,
          finalRngState: run.finalRng.state, finalRngCalls: run.finalRng.calls,
          actualAnalysisAnchorCounts: Object.fromEntries(WINDOWS.map(w => [w.label, 20])),
          selectedAnchorWindows: selectedByWindow }
      }, frames: selectedFrames, contactsObserved: feet.length,
      masks: baselineRaw.births.map(row => ({ id: row.id, timeMs: row.bornAtSimulationTimeMs, maskSha256: row.maskSha256 }))
    };
  } finally {
    const base = resolve(tmpdir());
    assert.ok(tempOutput.startsWith(base), 'temporary replay output stays inside the system temp folder');
    await rm(tempOutput, { recursive: true, force: true });
  }
}

async function readGzipJsonFrom(directory, name) {
  return JSON.parse(gunzipSync(await readFile(resolve(directory, name))));
}

const captured = await validateAndCapture();
const input = {
  schema: 'ant-late-qualified-opportunity-input-v1',
  provenance: captured.provenance,
  protocol: { windows: WINDOWS.map(window => ({ label: window.label, checkpointSeconds: window.endSeconds,
    definition: 'last 20 actual analysis anchors with time < checkpoint',
    ...captured.provenance.parity.selectedAnchorWindows[window.label],
    endTimeMsExclusive: window.endSeconds * 1000, frames: 20 })), grid: N, channelNames: ['D', 'B', 'C', 'recent'],
    domain: 'edge-bearing 8-neighbor production-thinned F (S)', entry: { x: 0.5, y: 0.72 },
    groupingDistances: [0.15, 0.30], correspondenceDistances: [0.025, 0.075],
    contactWindow: '(t-20s, t]', contactNeighborhoodRadius: FOOT_RADIUS,
    materialPhase: 'actual Plate masks with birth time strictly earlier than the analysis state',
    noAllocationLawOrCompositeScore: true },
  contactsObserved: captured.contactsObserved, actualBirths: captured.masks,
  frames: captured.frames.map(arrayState)
};
await mkdir(resolve(ROOT, DATA), { recursive: true });
await writeGzip(`${DATA}/late-input.json.gz`, input);
await writeFile(resolve(ROOT, `${PACKAGE}/REPLAY-PARITY.json`), json(captured.provenance) + '\n');
console.log(JSON.stringify({ status: 'REPLAY-PARITY-PASS', states: input.frames.length,
  windows: input.provenance.parity.actualAnalysisAnchorCounts, contactsObserved: input.contactsObserved,
  actualBirths: input.actualBirths.length, main: input.provenance.main, parent: input.provenance.researchParent }));
