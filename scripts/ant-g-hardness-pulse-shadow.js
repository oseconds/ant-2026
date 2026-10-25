import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { deserialize, serialize } from 'node:v8';
import vm from 'node:vm';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';
import { DT, createController, initialFingerprint } from './ant-g-production-candidate-natural.js';
import { instrumentSurfaceSchedule, reconstructSurfaceReadout, renderSurface, sha256, verifySurfaceRateParity } from './ant-sonic-shadow-render.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-26-g-hardness-pulse-shadow');
const PRIOR = resolve(ROOT, 'docs/ant/evidence/2026-10-26-g-natural-hardness-distribution');
const G_REVIEW = resolve(ROOT, 'docs/ant/evidence/2026-10-25-g-production-candidate-review');
const WORKLET = 'static/worklets/surface-plate.worklet.js';
const METRICS = 'scripts/ant-sonic-response-metrics.py';
const SEEDS = Object.freeze([20261005, 20261006, 20261007]);
const WINDOWS = Object.freeze([
  Object.freeze({ name: 'early', startSeconds: 120, endSeconds: 130 }),
  Object.freeze({ name: 'mid', startSeconds: 300, endSeconds: 310 }),
  Object.freeze({ name: 'late', startSeconds: 540, endSeconds: 550 })
]);
const RATE = 48000, PHYSICS_RATE = 6000, GAIN = 0.7;
const EXPECTED_MAIN = '4f0f8624c47ed310d7a6a4a37d43e3d0e7756b4b';
const OLD_LOOP = [
  '    for (let step = 0; step < CONTACT_PULSE_STEPS; step++) {',
  '      const slot = (proc.contactCursor + step) % CONTACT_PULSE_STEPS;',
  '      proc.contactForces[slot * proc.current.length + node] += delivered * CONTACT_ENVELOPE[step];',
  '    }'
].join('\n');
const NEW_LOOP = [
  '    for (let step = 0; step < pulseSteps; step++) {',
  '      const slot = (proc.contactCursor + step) % CONTACT_PULSE_STEPS;',
  '      proc.contactForces[slot * proc.current.length + node] += delivered * pulseEnvelope[step];',
  '    }'
].join('\n');
const PULSE_TABLE = [
  'const HARDNESS_PULSE_ENVELOPES = Array.from({ length: 13 }, (_, index) => {',
  '  const steps = index + 6, values = new Float64Array(steps);',
  '  let sum = 0;',
  '  for (let step = 0; step < steps; step++) { values[step] = Math.sin(Math.PI * (step + 0.5) / steps); sum += values[step]; }',
  '  for (let step = 0; step < steps; step++) values[step] /= sum;',
  '  return values;',
  '});',
  ''
].join('\n');
const PULSE_VARS = [
  '  const pulseSteps = Math.max(6, Math.min(18, Math.round(18 - 12 * p.hardness)));',
  '  const pulseEnvelope = HARDNESS_PULSE_ENVELOPES[pulseSteps - 6];',
  '  proc.__hardnessPulseReceipts?.push({ hardness: p.hardness, pulseSteps,',
  '    envelopeSum: pulseEnvelope.reduce((sum, value) => sum + value, 0) });'
].join('\n');
const RAW_SHA = Object.freeze({
  20261005: 'a6a7e1e36fd719f66d046acbe3f145158c24abb4a2fba3e386bd02b90d3b091e',
  20261006: '4c1c7869cd70ccd2b00dbef2b109ded9776c09d5380c6a332b3d3597d8a1e4c6',
  20261007: 'e2fc2116f98e86f7cde5ca69a109351536727b7a68b491f80266146477e247fc'
});
const SOURCE_PATHS = Object.freeze([
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/audio/SurfaceAudioBridge.js',
  'src/lib/audio/AntEnvironmentAudioBridge.js', 'src/lib/audio/compileSurfaceTopology.js', WORKLET
]);
const hash = value => createHash('sha256').update(value).digest('hex');
const quantile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), x = p * (sorted.length - 1);
  const lo = Math.floor(x), hi = Math.ceil(x);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
};
const quantiles = values => Object.fromEntries([5, 50, 95].map(p =>
  ['p' + String(p).padStart(2, '0'), quantile(values, p / 100)]));
const eventBirthRow = plate => ({ id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
  source: plate.source, target: plate.target, geodesicLength: plate.geodesicLength,
  grid: plate.grid ? { width: plate.grid.width, height: plate.grid.height } : null,
  maskSha256: plate.mask ? hash(ArrayBuffer.isView(plate.mask)
    ? Buffer.from(plate.mask.buffer, plate.mask.byteOffset, plate.mask.byteLength) : Buffer.from(plate.mask)) : null });

export function candidatePulseSteps(hardness) {
  assert(Number.isFinite(hardness) && hardness >= 0 && hardness <= 1);
  return Math.max(6, Math.min(18, Math.round(18 - 12 * hardness)));
}
export function normalizedHalfSine(steps) {
  assert(Number.isInteger(steps) && steps >= 6 && steps <= 18);
  const values = Array.from({ length: steps }, (_, i) => Math.sin(Math.PI * (i + 0.5) / steps));
  const sum = values.reduce((a, b) => a + b, 0);
  return values.map(value => value / sum);
}
export function transformHardnessPulseWorklet(source) {
  assert.equal(source.split(OLD_LOOP).length, 2, 'production pulse loop must be unique');
  let output = source.replace(OLD_LOOP, NEW_LOOP);
  const reach = '  const reach = 4 * sigma + 0.5;';
  assert.equal(output.split(reach).length, 2, 'strike support anchor must be unique');
  output = output.replace(reach, reach + '\n' + PULSE_VARS);
  const anchor = 'function applyStrike(proc, p) {';
  assert.equal(output.split(anchor).length, 2, 'applyStrike anchor must be unique');
  return output.replace(anchor, PULSE_TABLE + anchor);
}
function makeCapture(seed) {
  const messages = [];
  let timeSource = () => 0, timeOverride = null, enabled = true;
  const audioEngine = { context: { currentTime: 0 }, async createWorklet(name) {
    assert.equal(name, 'surface-plate-processor');
    const gain = { value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; },
      linearRampToValueAtTime(value) { this.value = value; } };
    return { node: { port: { onmessage: null, postMessage(message) {
      if (!enabled) return;
      const postSimulationTimeMs = timeSource();
      messages.push({ seed, sequence: messages.length, simulationTimeMs: timeOverride ?? postSimulationTimeMs,
        postSimulationTimeMs,
        workletName: name, message: structuredClone(message) });
    }, close() {} }, addEventListener() {}, removeEventListener() {} }, gainNode: { gain }, disconnect() {} };
  } };
  return { bridge: new AntEnvironmentAudioBridge({ audioEngine }), messages,
    setTimeSource: source => { timeSource = source; },
    withStrikeTime: (time, callback) => {
      timeOverride = time;
      try { return callback(); } finally { timeOverride = null; }
    }, stop: () => { enabled = false; } };
}
async function captureNatural(seed, frozenSummary, frozenWorldRaw, frozenStrikeRaw) {
  const run = createController(seed, 'G');
  const { controller, ledger } = run, capture = makeCapture(seed);
  controller.audioBridge = capture.bridge;
  capture.setTimeSource(() => controller.simulationTimeMs);
  const positions = [], contactsBySecond = [], births = [], nodules = [];
  const contactHash = createHash('sha256'), birthHash = createHash('sha256');
  let currentContacts = { groups: 0, feet: 0 };
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') {
      currentContacts.groups++;
      currentContacts.feet += Array.isArray(payload?.contacts) ? payload.contacts.length : 0;
      contactHash.update(JSON.stringify(payload) + '\n');
    } else if (type === 'plate-birth') {
      const row = eventBirthRow(payload); births.push(row); birthHash.update(JSON.stringify(row) + '\n');
    } else if (type === 'sphere-birth') {
      nodules.push({ id: payload.id, bornAtSimulationTimeMs: payload.bornAtSimulationTimeMs,
        position: payload.position, coupledPlateId: payload.coupledPlateId });
    }
  });
  const originalHandle = capture.bridge.handleFootContact.bind(capture.bridge);
  capture.bridge.handleFootContact = (event, context) => capture.withStrikeTime(
    event.simulationTimeMs, () => originalHandle(event, context));
  try {
    await controller.init();
    const initialStateSha256 = initialFingerprint(run);
    assert.equal(await controller.setAudioEnabled(true), true);
    assert.equal(capture.bridge.surface.enabled, true);
    for (let tick = 1; tick <= 600 * 60; tick++) {
      controller.tick(DT);
      if (tick % 60 !== 0) continue;
      const second = tick / 60;
      positions.push({ seconds: second, simulationTimeSeconds: controller.simulationTimeMs / 1000,
        agents: controller.agents.map(agent => ({ id: agent.id, x: agent.x, y: agent.y,
          vx: agent.vx, vy: agent.vy, heading: agent.heading, angularVelocity: agent.angularVelocity,
          adherence: agent.trailAdherence, confidence: agent.trailConfidence,
          local: ledger.localById.get(agent.id) || null, decisionRemaining: agent.decisionRemaining,
          committedRemaining: agent.committedRemaining, blocked: agent.wasBlocked })) });
      contactsBySecond.push({ seconds: second, ...currentContacts });
      currentContacts = { groups: 0, feet: 0 };
    }
    assert(Math.abs(controller.simulationTimeMs - 600000) <= 1e-6);
    const events = { contactStreamSha256: contactHash.digest('hex'), plateBirthStreamSha256: birthHash.digest('hex') };
    const priorSeed = frozenSummary.scenarios.find(row => row.seed === seed);
    const priorArm = priorSeed?.arms.find(row => row.arm === 'G');
    assert(priorArm);
    const traceChecks = {
      initialFingerprint: initialStateSha256 === priorArm.initialStateSha256,
      perSecondAgentState: JSON.stringify(positions) === JSON.stringify(frozenWorldRaw.positions),
      perSecondContactBuckets: JSON.stringify(contactsBySecond) === JSON.stringify(frozenWorldRaw.contactsBySecond),
      plateBirthRows: JSON.stringify(births) === JSON.stringify(frozenWorldRaw.births),
      noduleBirthRows: JSON.stringify(nodules) === JSON.stringify(frozenWorldRaw.nodules),
      eventStreamHashes: JSON.stringify(events) === JSON.stringify(frozenWorldRaw.events),
      individualContactCount: contactsBySecond.reduce((sum, row) => sum + row.feet, 0) === priorArm.events.individualFeet,
      plateBirthCount: births.length === priorArm.events.plateBirths,
      firstPlateTime: births[0]?.bornAtSimulationTimeMs / 1000 === priorArm.events.firstPlateSeconds
    };
    traceChecks.finalRngState = run.rngState === priorArm.finalRng.state;
    traceChecks.finalRngCalls = run.rngCalls === priorArm.finalRng.calls;
    for (const [key, valid] of Object.entries(traceChecks)) assert.equal(valid, true, seed + ': ' + key);
    const strikePosts = capture.messages.filter(row => row.message.type === 'strike');
    const strikes = strikePosts.map(row => ({ seed, simulationTimeMs: row.simulationTimeMs,
      workletName: row.workletName, message: row.message }));
    assert.equal(strikes.length, frozenStrikeRaw.routedStrikes.length);
    assert.equal(JSON.stringify(strikes), JSON.stringify(frozenStrikeRaw.routedStrikes),
      seed + ': exact actual SurfaceAudioBridge strikes match frozen capture');
    assert(capture.messages.every(row => Number.isFinite(row.postSimulationTimeMs)));
    assert(capture.messages.every((row, index) => index === 0
      || row.postSimulationTimeMs >= capture.messages[index - 1].postSimulationTimeMs),
    seed + ': actual port-post simulation clock is monotonic');
    assert.equal(strikes.length, capture.bridge.surface.diagnostics.directExposedStrikes);
    assert.equal(strikes.length, capture.bridge.surface.diagnostics.strikeRoutes);
    assert(capture.messages[0]?.message?.type === 'topology');
    assert.equal(capture.messages[0].simulationTimeMs, 0);
    assert.equal(capture.messages[0].postSimulationTimeMs, 0);
    const topologyCount = capture.messages.filter(row => row.message.type === 'topology').length;
    capture.stop();
    const windowHardness = Object.fromEntries(WINDOWS.map(window => [window.name,
      strikePosts.filter(row => row.postSimulationTimeMs >= window.startSeconds * 1000
        && row.postSimulationTimeMs < window.endSeconds * 1000).map(row => row.message.payload.hardness)]));
    const routedHardnessRows = strikePosts.map(row => ({ simulationTimeMs: row.simulationTimeMs,
      postSimulationTimeMs: row.postSimulationTimeMs, plateId: row.message.payload.plateId,
      hardness: row.message.payload.hardness }));
    return { seed, messages: capture.messages, routedHardnessRows, traceChecks, initialStateSha256,
      strikeCount: strikes.length, topologyCount, contacts: contactsBySecond.reduce((sum, row) => sum + row.feet, 0),
      births: births.length, firstPlateTimeSeconds: births[0]?.bornAtSimulationTimeMs / 1000,
      finalPopulation: positions.at(-1)?.agents.length, rngState: run.rngState, rngCalls: run.rngCalls,
      windowHardness };
  } finally {
    capture.stop(); unsubscribe(); await controller.destroy();
  }
}

function json(value) { return JSON.stringify(value); }

async function loadJson(path) { return JSON.parse(await readFile(path, 'utf8')); }

async function verifyInputs() {
  const originMain = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(originMain, EXPECTED_MAIN, 'fresh main must match the pre-registered source authority');
  const sourceHashes = {}, sourceBlobHashes = {};
  for (const path of SOURCE_PATHS) {
    const local = await readFile(resolve(ROOT, path));
    const main = execFileSync('git', ['show', `origin/main:${path}`], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 });
    const normalizeEol = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    assert.equal(hash(normalizeEol(local)), hash(normalizeEol(main)), `${path} differs from fresh main beyond checkout line endings`);
    sourceHashes[path] = hash(local);
    sourceBlobHashes[path] = hash(main);
  }
  const hardness = await loadJson(resolve(PRIOR, 'summary.json'));
  const G = await loadJson(resolve(G_REVIEW, 'data/SUMMARY.json'));
  const rawBySeed = new Map(), worldRawBySeed = new Map();
  for (const seed of SEEDS) {
    const rawPath = resolve(PRIOR, `data/seed-${seed}.json.gz`);
    const packed = await readFile(rawPath);
    assert.equal(hash(packed), RAW_SHA[seed], `${seed} reused routed-strike evidence hash`);
    rawBySeed.set(seed, JSON.parse(gunzipSync(packed).toString('utf8')));
    const worldPath = resolve(G_REVIEW, `data/seed${seed}-G-raw.json.gz`);
    const worldPacked = await readFile(worldPath);
    const expectedWorldHash = hardness.perSeed.find(row => row.seed === seed).provenance.baselineRawSha256;
    assert.equal(hash(worldPacked), expectedWorldHash, `${seed} frozen G world trace receipt`);
    worldRawBySeed.set(seed, JSON.parse(gunzipSync(worldPacked).toString('utf8')));
  }
  assert.equal(hardness.productionBaseline.sourceFiles[WORKLET], sourceHashes[WORKLET]);
  return { originMain, sourceHashes, sourceBlobHashes, hardness, G, rawBySeed, worldRawBySeed };
}

export function runPulseSelfCheck(worklet) {
  assert.equal(typeof worklet, 'string');
  const candidate = transformHardnessPulseWorklet(worklet);
  assert.notEqual(hash(candidate), hash(worklet));
  assert.equal(candidate.split(OLD_LOOP).length, 1);
  assert.equal(candidate.split(NEW_LOOP).length, 2, 'candidate pulse loop appears exactly once');
  const steps = Array.from({ length: 101 }, (_, index) => candidatePulseSteps(index / 100));
  assert.equal(steps[0], 18); assert.equal(steps.at(-1), 6);
  assert(steps.every((value, index) => index === 0 || value <= steps[index - 1]));
  for (let count = 6; count <= 18; count += 1) {
    const envelope = normalizedHalfSine(count);
    assert(Math.abs(envelope.reduce((sum, value) => sum + value, 0) - 1) < 1e-14);
  }
  return { pass: true, testedHardnessPoints: steps.length, pulseSteps: [6, 18],
    envelopeCounts: 13, allEnvelopeSumsUnity: true, monotoneShortening: true };
}

function verifyExactRateOutput(worklet, BWorklet) {
  const mask = new Array(96 * 96).fill(0);
  for (let y = 45; y <= 51; y++) for (let x = 42; x <= 54; x++) mask[y * 96 + x] = 1;
  const plate = { id: 'rate-parity-fixture', grid: { width: 96, height: 96 }, mask, edges: [],
    pickups: [{ x: 42 / 95, y: 48 / 95 }, { x: 54 / 95, y: 48 / 95 }],
    material: { stiffness: .9, density: 1.1, damping: .35 } };
  const topology = compileSurfaceTopology({ plates: [plate], stratigraphy: { layerOrder: [plate.id] } });
  const message = { type: 'strike', payload: { plateId: plate.id,
    position: { x: .5, y: 48 / 95 }, strength: .035, footprintRadius: .012, hardness: .5 } };
  const events = [{ frame: 0, message }, { frame: 800, message }, { frame: 2048, message }];
  return { A: verifySurfaceRateParity({ source: worklet, topology, events, frames: 4096 }),
    B: verifySurfaceRateParity({ source: BWorklet, topology, events, frames: 4096 }) };
}

export function eventSchedule(capture, untilSeconds = 550, frameRate = RATE) {
  assert.equal(capture.messages[0]?.message?.type, 'topology', 'first worklet message installs initial topology');
  const topology = capture.messages[0].message.payload;
  const rows = capture.messages.slice(1).filter(row => row.postSimulationTimeMs < untilSeconds * 1000);
  assert(rows.every((row, index) => Number.isFinite(row.postSimulationTimeMs)
    && (!index || row.postSimulationTimeMs >= rows[index - 1].postSimulationTimeMs)),
  'actual worklet post timestamps are finite and nondecreasing in captured message order');
  const framePhases = [];
  const events = rows.map(row => {
    const exact48k = row.postSimulationTimeMs * RATE / 1000, frame48k = Math.round(exact48k);
    assert(Math.abs(exact48k - frame48k) < 0.5, 'post-time to 48 kHz frame mapping is bounded by nearest-frame rounding');
    framePhases.push(frame48k % 8);
    const frame = frameRate === RATE ? frame48k : Math.floor(frame48k / 8);
    return { frame, sequence: row.sequence, message: row.message };
  });
  const maxFrameRoundingError = rows.reduce((max, row) => Math.max(max,
    Math.abs(row.postSimulationTimeMs * RATE / 1000 - Math.round(row.postSimulationTimeMs * RATE / 1000))), 0);
  assert(events.every((event, index) => index === 0 || event.frame >= events[index - 1].frame),
  'post-time mapping preserves captured message order');
  const sourceEventTimeBackstepsMs = rows.slice(1).map((row, index) =>
    rows[index].simulationTimeMs - row.simulationTimeMs).filter(delta => delta > 0);
  const scheduleReceipt = hash(Buffer.from(JSON.stringify({ inputMessageHash: capture.messageHash,
    rows: events.map(event => [event.sequence, event.frame, event.message.type]) })));
  const physicsBlockPhaseCounts = Object.fromEntries(Array.from({ length: 8 }, (_, phase) => [phase,
    framePhases.filter(value => value === phase).length]));
  return { topology, events, expectedCount: rows.length, hash: scheduleReceipt, maxFrameRoundingError,
    sourceEventTimeBacksteps: sourceEventTimeBackstepsMs.length,
    maxSourceEventTimeBackstepMs: Math.max(0, ...sourceEventTimeBackstepsMs),
    frameRate, physicsBlockPhaseCounts, maxPhysicsBlockPhase: Math.max(...Object.entries(physicsBlockPhaseCounts)
      .filter(([, count]) => count > 0).map(([phase]) => Number(phase))) };
}

function pulseReceiptCheck(receipts, strikes) {
  assert.equal(receipts.length, strikes.length, 'every accepted B strike has one pulse receipt');
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index], hardness = strikes[index].message.payload.hardness;
    const expected = candidatePulseSteps(hardness);
    assert.equal(receipt.hardness, hardness);
    assert.equal(receipt.pulseSteps, expected);
    assert(receipt.pulseSteps >= 6 && receipt.pulseSteps <= 18);
    assert(Math.abs(receipt.envelopeSum - 1) < 1e-14);
  }
  return true;
}

function writeF32Stereo(left, right, gain = 1) {
  assert.equal(left.length, right.length);
  const bytes = Buffer.allocUnsafe(left.length * 8);
  for (let index = 0; index < left.length; index += 1) {
    const l = left[index] * gain, r = right[index] * gain;
    assert(Number.isFinite(l) && Number.isFinite(r));
    bytes.writeFloatLE(l, index * 8); bytes.writeFloatLE(r, index * 8 + 4);
  }
  return bytes;
}

function pcm16Wav(left, right, gain = GAIN) {
  assert.equal(left.length, right.length);
  const dataBytes = left.length * 4, out = Buffer.allocUnsafe(44 + dataBytes);
  out.write('RIFF', 0); out.writeUInt32LE(36 + dataBytes, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(RATE, 24); out.writeUInt32LE(RATE * 4, 28); out.writeUInt16LE(4, 32);
  out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(dataBytes, 40);
  let clippedSamples = 0;
  for (let index = 0; index < left.length; index += 1) for (let channel = 0; channel < 2; channel += 1) {
    const value = (channel ? right[index] : left[index]) * gain;
    assert(Number.isFinite(value));
    if (Math.abs(value) > 1) clippedSamples++;
    const bounded = Math.max(-1, Math.min(1, value));
    out.writeInt16LE(Math.round(bounded < 0 ? bounded * 32768 : bounded * 32767), 44 + (index * 2 + channel) * 2);
  }
  return { bytes: out, clippedSamples };
}

function selectedStrikes(messages, window) {
  const rows = Array.isArray(messages) ? messages : messages.windowStrikes?.[window.name] || [];
  const time = row => row.postSimulationTimeMs ?? row.simulationTimeMs;
  return rows.filter(row => row.message.type === 'strike'
    && time(row) >= window.startSeconds * 1000
    && time(row) < window.endSeconds * 1000);
}

function summarizeValues(values) {
  if (!values.length) return { count: 0, p05: null, p50: null, p95: null };
  const ordered = [...values].sort((a, b) => a - b);
  return { count: values.length, p05: quantile(ordered, .05), p50: quantile(ordered, .5), p95: quantile(ordered, .95) };
}

function hardnessDistribution(values) {
  assert(values.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  if (!values.length) return { count: 0, min: null, max: null, mean: null, standardDeviation: null,
    quantiles: Object.fromEntries([1,5,25,50,75,95,99].map(p => ['p' + String(p).padStart(2, '0'), null])),
    histogram: Array(10).fill(0) };
  const ordered = [...values].sort((a,b) => a - b), mean = values.reduce((sum,value) => sum + value, 0) / values.length;
  return { count: values.length, min: ordered[0], max: ordered.at(-1), mean,
    standardDeviation: Math.sqrt(values.reduce((sum,value) => sum + (value - mean) ** 2, 0) / values.length),
    quantiles: Object.fromEntries([1,5,25,50,75,95,99].map(p => ['p' + String(p).padStart(2, '0'), quantile(ordered, p / 100)])),
    histogram: values.reduce((bins, value) => { bins[Math.min(9, Math.floor(value * 10))]++; return bins; }, Array(10).fill(0)) };
}

function hardnessBins(rows) {
  return Array.from({ length: 10 }, (_, index) => {
    const startSeconds = index * 60, endSeconds = startSeconds + 60;
    return { startSeconds, endSeconds, ...hardnessDistribution(rows.filter(row =>
      row.simulationTimeMs >= startSeconds * 1000 && row.simulationTimeMs < endSeconds * 1000)
      .map(row => row.hardness)) };
  });
}

function buildHardnessPopulation(captures, rawBySeed) {
  const perSeed = captures.map(capture => {
    const routed = capture.routedHardnessRows;
    const allFoot = rawBySeed.get(capture.seed).allValidSurfaceFootResponses.map(row => ({
      simulationTimeMs: row.simulationTimeMs, hardness: row.hardness }));
    const byPlate = new Map();
    for (const row of routed) {
      if (!byPlate.has(row.plateId)) byPlate.set(row.plateId, []);
      byPlate.get(row.plateId).push(row.hardness);
    }
    return { seed: capture.seed, routedStrikes: hardnessDistribution(routed.map(row => row.hardness)),
      allValidFootResponses: hardnessDistribution(allFoot.map(row => row.hardness)),
      routedMinusAllMean: hardnessDistribution(routed.map(row => row.hardness)).mean
        - hardnessDistribution(allFoot.map(row => row.hardness)).mean,
      timeBins: { routedStrikes: hardnessBins(routed), allValidFootResponses: hardnessBins(allFoot) },
      byPlate: [...byPlate].sort(([a],[b]) => a.localeCompare(b)).map(([plateId, values]) => ({
        plateId, count: values.length, hardnessMedian: quantile([...values].sort((a,b) => a-b), .5),
        hardnessP25: quantile([...values].sort((a,b) => a-b), .25),
        hardnessP75: quantile([...values].sort((a,b) => a-b), .75) })) };
  });
  const combine = key => perSeed.flatMap(row => key === 'routedStrikes'
    ? row.routedStrikes.count ? captures.find(capture => capture.seed === row.seed).routedHardnessRows.map(item => item.hardness) : []
    : rawBySeed.get(row.seed).allValidSurfaceFootResponses.map(item => item.hardness));
  const pooledRoutedRows = captures.flatMap(capture => capture.routedHardnessRows);
  const pooledFootRows = captures.flatMap(capture => rawBySeed.get(capture.seed).allValidSurfaceFootResponses.map(row => ({
    simulationTimeMs: row.simulationTimeMs, hardness: row.hardness })));
  return { histogramEdges: Array.from({ length: 11 }, (_, index) => index / 10),
    contextSource: 'allValidSurfaceFootResponses reused from hash-validated natural hardness capture; current-run routed strikes were recaptured and exact-matched to that frozen evidence',
    perSeed, pooled: { routedStrikes: hardnessDistribution(combine('routedStrikes')),
      allValidFootResponses: hardnessDistribution(combine('allValidFootResponses')),
      routedMinusAllMean: hardnessDistribution(combine('routedStrikes')).mean
        - hardnessDistribution(combine('allValidFootResponses')).mean,
      timeBins: { routedStrikes: hardnessBins(pooledRoutedRows), allValidFootResponses: hardnessBins(pooledFootRows) } } };
}

function metricCase(metrics, id) {
  const row = metrics.cases.find(item => item.id === id);
  assert(row, `metric case ${id}`);
  return row.metrics;
}

function pairCase(metrics, condition, positionLabel) {
  const row = metrics.pairwise.find(item => item.condition === condition && item.positionLabel === positionLabel);
  assert(row, `pair metrics ${condition}/${positionLabel}`);
  return row.output;
}

function eventCountReceipt(rendered, schedule, strikes) {
  assert.equal(rendered.renderedFrameReceipts.length, schedule.events.length);
  for (let index = 0; index < schedule.events.length; index += 1) {
    assert.equal(rendered.renderedFrameReceipts[index].frame, schedule.events[index].frame,
      `continuous replay event frame ${index}`);
    assert.equal(rendered.renderedFrameReceipts[index].message, schedule.events[index].message,
      `continuous replay event identity/order ${index}`);
  }
  assert.equal(rendered.telemetry.strikes, strikes.length);
  assert.equal(rendered.telemetry.topologies, schedule.events.filter(row => row.message.type === 'topology').length + 1);
  assert.equal(rendered.telemetry.dropped, 0); assert.equal(rendered.telemetry.droppedRoutes, 0);
  assert.equal(rendered.telemetry.nonFinite, 0); assert.equal(rendered.telemetry.clipped, 0);
}

async function renderSeed(seedCapture, worklet, BWorklet, tempRoot, listeningRoot,
  arms = [['A', worklet], ['B', BWorklet]], runSuffix = '') {
  const schedule = eventSchedule(seedCapture, 550, PHYSICS_RATE);
  const endFrame = 550 * PHYSICS_RATE;
  const pickupWindows = WINDOWS.map(window => ({ name: window.name,
    startFrame: window.startSeconds * PHYSICS_RATE, endFrame: window.endSeconds * PHYSICS_RATE }));
  const physicsOutputWindows = WINDOWS.map(window => ({ name: window.name,
    startPhysicsFrame: window.startSeconds * PHYSICS_RATE - 2,
    endPhysicsFrame: window.endSeconds * PHYSICS_RATE }));
  const strikeStream = seedCapture.messages.filter(row => row.message.type === 'strike'
    && row.simulationTimeMs < 550000);
  const scheduledStrikeCount = strikeStream.length;
  const cells = [];
  for (const [arm, source] of arms) {
    const rendered = renderSurface({ source, topology: schedule.topology, events: schedule.events,
      frames: endFrame, sampleRate: PHYSICS_RATE, captureFields: false, pickupWindows, physicsOutputWindows });
    eventCountReceipt(rendered, schedule, strikeStream);
    if (arm === 'A') assert.equal(rendered.hardnessPulseReceipts.length, 0);
    else pulseReceiptCheck(rendered.hardnessPulseReceipts, strikeStream);
    for (const window of WINDOWS) {
      const start = window.startSeconds * RATE, frames = (window.endSeconds - window.startSeconds) * RATE;
      const physics = rendered.physicsOutputWindows.find(row => row.name === window.name);
      assert(physics); assert.equal(physics.left.length, frames / 8 + 2);
      const readout = reconstructSurfaceReadout(physics, { sourceStartPhysicsFrame: physics.startPhysicsFrame,
        outputStartFrame: start, outputFrames: frames });
      const left = readout.left, right = readout.right;
      assert.equal(left.length, (window.endSeconds - window.startSeconds) * RATE);
      const pickup = rendered.pickupWindows.find(row => row.name === window.name);
      assert(pickup); assert.equal(pickup.left.length, (window.endSeconds - window.startSeconds) * PHYSICS_RATE);
      const base = `${seed}-${window.name}-${arm}${runSuffix}`;
      const outputPath = resolve(tempRoot, `${base}-output.f32`);
      const pickupPath = resolve(tempRoot, `${base}-pickup.f32`);
      const outputBytes = writeF32Stereo(left, right, GAIN);
      const pickupBytes = writeF32Stereo(pickup.left, pickup.right, GAIN);
      await writeFile(outputPath, outputBytes);
      await writeFile(pickupPath, pickupBytes);
      const wav = pcm16Wav(left, right);
      await writeFile(resolve(listeningRoot, `${base}.wav`), wav.bytes);
      cells.push({ seed, window: window.name, arm, outputPath, pickupPath,
        outputFrames: left.length, pickupFrames: pickup.left.length,
        inputMessageHash: schedule.hash,
        outputF32Sha256: hash(outputBytes), pickupF32Sha256: hash(pickupBytes),
        wav: { path: `listening/${base}.wav`, sha256: hash(wav.bytes), clippedSamples: wav.clippedSamples },
        sourceSha256: rendered.sourceSha256, telemetry: rendered.telemetry,
        renderedEventCount: rendered.renderedFrameReceipts.length,
        pulseReceipts: arm === 'B' ? rendered.hardnessPulseReceipts.length : 0 });
    }
    rendered.pcm.left = rendered.pcm.right = null;
    if (globalThis.gc) globalThis.gc();
    console.log(`render ${seed} ${arm}: ${rendered.telemetry.strikes} strikes, ${rendered.telemetry.topologies} topologies`);
  }
  return { cells, schedule: { messageHash: schedule.hash, messageCount: schedule.events.length,
    topologyCount: schedule.events.filter(row => row.message.type === 'topology').length + 1,
    strikeCount: scheduledStrikeCount, maxFrameRoundingError: schedule.maxFrameRoundingError } };
}

function metricsIndex(cells) {
  return { rows: cells.flatMap(cell => ['output', 'pickup'].map(kind => ({
    id: `${cell.seed}-${cell.window}-${kind}-${cell.arm}`, condition: kind,
    positionLabel: `${cell.seed}-${cell.window}`, plateKey: cell.arm, strikeFrame: 0,
    sampleRate: kind === 'output' ? RATE : PHYSICS_RATE,
    frames: kind === 'output' ? cell.outputFrames : cell.pickupFrames,
    files: { pcm: relative(ROOT, kind === 'output' ? cell.outputPath : cell.pickupPath).replaceAll('\\', '/') }
  }))) };
}

function summarizePulse(values) {
  return { hardness: summarizeValues(values.map(row => row.hardness)),
    Asteps: summarizeValues(values.map(() => 18)), Ams: summarizeValues(values.map(() => 3)),
    Bsteps: summarizeValues(values.map(row => candidatePulseSteps(row.hardness))),
    Bms: summarizeValues(values.map(row => candidatePulseSteps(row.hardness) / 6)) };
}

function plateWindowSummary(captures) {
  const rows = [];
  for (const capture of captures) for (const window of WINDOWS) {
    const byPlate = new Map();
    for (const strike of selectedStrikes(capture, window)) {
      const id = strike.message.payload.plateId;
      if (!byPlate.has(id)) byPlate.set(id, []);
      byPlate.get(id).push(strike.message.payload.hardness);
    }
    for (const [plateId, values] of [...byPlate].sort(([a], [b]) => a.localeCompare(b))) {
      const q = summarizeValues(values);
      rows.push({ seed: capture.seed, window: window.name, plateId, count: values.length,
        hardnessMedian: q.p50, hardnessP25: quantile([...values].sort((a,b)=>a-b), .25),
        hardnessP75: quantile([...values].sort((a,b)=>a-b), .75),
        hardnessIqr: quantile([...values].sort((a,b)=>a-b), .75) - quantile([...values].sort((a,b)=>a-b), .25) });
    }
  }
  return rows;
}

function buildResults(captures, rendered, metrics) {
  const rawByCell = new Map();
  for (const capture of captures) for (const window of WINDOWS) {
    const strikes = selectedStrikes(capture, window);
    const values = strikes.map(row => ({ hardness: row.message.payload.hardness }));
    for (const row of strikes) {
      const payload = row.message.payload;
      assert(Number.isFinite(payload.hardness) && payload.hardness >= 0 && payload.hardness <= 1);
      assert(Number.isFinite(payload.strength) && Number.isFinite(payload.footprintRadius));
    }
    rawByCell.set(`${capture.seed}-${window.name}`, { strikes, pulse: summarizePulse(values) });
  }
  const cases = new Map(metrics.cases.map(row => [row.id, row.metrics]));
  const rows = [];
  for (const capture of captures) for (const window of WINDOWS) {
    const key = `${capture.seed}-${window.name}`, source = rawByCell.get(key);
    const outputA = cases.get(`${key}-output-A`), outputB = cases.get(`${key}-output-B`);
    const pickupA = cases.get(`${key}-pickup-A`), pickupB = cases.get(`${key}-pickup-B`);
    assert(outputA && outputB && pickupA && pickupB);
    const outDiff = pairCase(metrics, 'output', key), pickupDiff = pairCase(metrics, 'pickup', key);
    rows.push({ seed: capture.seed, window: window.name,
      startSeconds: window.startSeconds, endSeconds: window.endSeconds,
      strikes: source.strikes.length, hardness: source.pulse.hardness,
      pulse: source.pulse,
      output: { A: outputA, B: outputB, comparison: outDiff,
        rmsDelta: outputB.rms - outputA.rms,
        centroidDeltaHz: outputB.spectralCentroidHz - outputA.spectralCentroidHz,
        band300to1000Delta: outputB.bandPowerFractions['300-1000Hz'] - outputA.bandPowerFractions['300-1000Hz'] },
      pickup: { A: pickupA, B: pickupB, comparison: pickupDiff,
        rmsDelta: pickupB.rms - pickupA.rms,
        centroidDeltaHz: pickupB.spectralCentroidHz - pickupA.spectralCentroidHz,
        band300to1000Delta: pickupB.bandPowerFractions['300-1000Hz'] - pickupA.bandPowerFractions['300-1000Hz'] } });
  }
  const selected = captures.flatMap(capture => WINDOWS.flatMap(window =>
    selectedStrikes(capture, window).map(row => ({
      seed: capture.seed, window: window.name, simulationTimeMs: row.simulationTimeMs,
      postSimulationTimeMs: row.postSimulationTimeMs,
      hardness: row.message.payload.hardness, plateId: row.message.payload.plateId,
      pulseSteps: candidatePulseSteps(row.message.payload.hardness) }))));
  const meanMetric = (kind, metric, arm) => {
    const values = rows.map(row => (kind === 'output' ? row.output : row.pickup)[arm][metric]);
    return { mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      min: Math.min(...values), max: Math.max(...values) };
  };
  const pooled = { strikes: selected.length,
    hardness: summarizeValues(selected.map(row => row.hardness)),
    pulseSteps: summarizeValues(selected.map(row => row.pulseSteps)),
    pulseMs: summarizeValues(selected.map(row => row.pulseSteps / 6)),
    output: Object.fromEntries(['rms', 'peakAbs', 'spectralCentroidHz'].map(metric => ['A', 'B'].map(arm =>
      [`${arm}.${metric}`, meanMetric('output', metric, arm)]).flat())),
    pickup: Object.fromEntries(['rms', 'peakAbs', 'spectralCentroidHz'].map(metric => ['A', 'B'].map(arm =>
      [`${arm}.${metric}`, meanMetric('pickup', metric, arm)]).flat())) };
  return { schema: 'ant-g-hardness-pulse-shadow-v1', windows: rows, pooled,
    plateWindows: plateWindowSummary(captures), selectedStrikeRows: selected };
}

function fixedScaleSvg(rows) {
  const width = 1140, height = 580, left = 88, right = 28, plotWidth = width - left - right;
  const panels = [
    { key: 'spectralCentroidHz', y: 65, height: 190, max: 24000, label: 'Stereo output spectral centroid (Hz)', format: value => Math.round(value) },
    { key: 'band300to1000', y: 340, height: 170, max: 1, label: 'Stereo output 300–1000 Hz power share', format: value => value.toFixed(3) }
  ];
  const x = index => left + (index + .5) * plotWidth / rows.length;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#fff"/>',
    '<text x="570" y="28" text-anchor="middle" font-family="Arial" font-size="18">Hardness pulse shadow — fixed-scale stereo output</text>',
    '<text x="900" y="49" font-family="Arial" font-size="11" fill="#555">A fixed 3 ms · B 3−2h ms</text>'];
  panels.forEach(panel => {
    const y = value => panel.y + panel.height - value / panel.max * panel.height;
    parts.push(`<text x="${left}" y="${panel.y - 14}" font-family="Arial" font-size="14">${panel.label}</text>`);
    for (const fraction of [0, .25, .5, .75, 1]) {
      const value = panel.max * fraction, yy = y(value);
      parts.push(`<line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}" stroke="#d5d5d5"/>`);
      parts.push(`<text x="${left - 10}" y="${yy + 4}" text-anchor="end" font-family="Arial" font-size="10">${panel.format(value)}</text>`);
    }
    rows.forEach((row, index) => {
      const metric = panel.key === 'band300to1000' ? 'band300to1000Delta' : 'centroidDeltaHz';
      const a = panel.key === 'band300to1000' ? row.output.A.bandPowerFractions['300-1000Hz'] : row.output.A.spectralCentroidHz;
      const b = panel.key === 'band300to1000' ? row.output.B.bandPowerFractions['300-1000Hz'] : row.output.B.spectralCentroidHz;
      parts.push(`<line x1="${x(index)}" y1="${y(a)}" x2="${x(index)}" y2="${y(b)}" stroke="#444" stroke-width="2"/>`);
      parts.push(`<circle cx="${x(index)}" cy="${y(a)}" r="4" fill="#888"/>`);
      parts.push(`<rect x="${x(index) - 3.5}" y="${y(b) - 3.5}" width="7" height="7" fill="#111"/>`);
      parts.push(`<text x="${x(index)}" y="${panel.y + panel.height + 17}" text-anchor="middle" font-family="Arial" font-size="9">${row.seed}/${row.window}</text>`);
      parts.push(`<title>${row.seed} ${row.window}: A ${panel.format(a)}, B ${panel.format(b)}, Δ ${panel.format(row.output[metric])}</title>`);
    });
  });
  parts.push('<circle cx="455" cy="555" r="4" fill="#888"/><text x="464" y="559" font-family="Arial" font-size="11">A</text><rect x="495" y="551.5" width="7" height="7" fill="#111"/><text x="507" y="559" font-family="Arial" font-size="11">B</text>',
    '<text x="570" y="576" text-anchor="middle" font-family="Arial" font-size="10">Fixed axes across all nine cells; measurements do not imply audibility or preference.</text>', '</svg>');
  return parts.join('\n') + '\n';
}

function markdownTable(rows) {
  const header = '| Seed | Window | Strikes | h p05 / p50 / p95 | B steps p05 / p50 / p95 | A→B RMS Δ | centroid Δ Hz | 300–1000 Hz share Δ | PCM rel. L2 | corr. | pickup centroid Δ Hz |';
  const divider = '|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|';
  return [header, divider, ...rows.map(row => `| ${row.seed} | ${row.window} | ${row.strikes} | ${row.hardness.p05.toFixed(3)} / ${row.hardness.p50.toFixed(3)} / ${row.hardness.p95.toFixed(3)} | ${row.pulse.Bsteps.p05} / ${row.pulse.Bsteps.p50} / ${row.pulse.Bsteps.p95} | ${row.output.rmsDelta.toExponential(3)} | ${row.output.centroidDeltaHz.toFixed(1)} | ${row.output.band300to1000Delta.toFixed(4)} | ${row.output.comparison.relativeL2.toFixed(4)} | ${row.output.comparison.zeroLagCorrelation.toFixed(5)} | ${row.pickup.centroidDeltaHz.toFixed(1)} |`)].join('\n');
}

function hardnessPopulationMarkdown(population) {
  const rows = population.perSeed.map(row => [row.seed, row.routedStrikes, row.allValidFootResponses]);
  rows.push(['Pooled', population.pooled.routedStrikes, population.pooled.allValidFootResponses]);
  const table = ['| Seed | Population | Count | Mean | SD | p01 | p05 | p25 | p50 | p75 | p95 | p99 |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const [seed, populationName, summary] of rows.flatMap(([id, routed, all]) => [
    [id, 'Routed strikes', routed], [id, 'All valid foot responses', all]])) {
    const q = summary.quantiles;
    table.push(`| ${seed} | ${populationName} | ${summary.count} | ${summary.mean.toFixed(3)} | ${summary.standardDeviation.toFixed(3)} | ${q.p01.toFixed(3)} | ${q.p05.toFixed(3)} | ${q.p25.toFixed(3)} | ${q.p50.toFixed(3)} | ${q.p75.toFixed(3)} | ${q.p95.toFixed(3)} | ${q.p99.toFixed(3)} |`);
  }
  return `## Full-run hardness context\n\nAll-foot responses are reused from the hash-validated hardness capture and tied to this rerun by exact world-trace and routed-strike parity. Routed-minus-all mean describes route selection, not a causal mechanism. Histograms use fixed 0.1-wide bins over [0,1]. The full 60 s bins and per-Plate summaries are in [hardness-population.json](data/hardness-population.json) and [hardness-time-bins.csv](hardness-time-bins.csv).\n\n${table.join('\n')}\n\n`;
}

async function writeHardnessPopulationArtifacts(population) {
  const dataDir = resolve(EVIDENCE, 'data');
  await writeFile(resolve(dataDir, 'hardness-population.json'), JSON.stringify(population, null, 2) + '\n');
  const rows = [], pcts = [1,5,25,50,75,95,99];
  for (const entry of population.perSeed) for (const kind of ['routedStrikes','allValidFootResponses'])
    for (const bin of entry.timeBins[kind]) rows.push([entry.seed,kind,bin.startSeconds,bin.endSeconds,bin.count,bin.mean,bin.standardDeviation,
      ...pcts.map(p => bin.quantiles['p' + String(p).padStart(2,'0')])]);
  for (const kind of ['routedStrikes','allValidFootResponses']) for (const bin of population.pooled.timeBins[kind])
    rows.push(['Pooled',kind,bin.startSeconds,bin.endSeconds,bin.count,bin.mean,bin.standardDeviation,
      ...pcts.map(p => bin.quantiles['p' + String(p).padStart(2,'0')])]);
  const header = ['seed','population','startSeconds','endSeconds','count','mean','standardDeviation',...pcts.map(p => 'p'+String(p).padStart(2,'0'))];
  await writeFile(resolve(EVIDENCE, 'hardness-time-bins.csv'), [header,...rows].map(row => row.join(',')).join('\n') + '\n');
}

async function augmentContextFromFrozenStreams() {
  const inputs = await verifyInputs();
  const validationPath = resolve(EVIDENCE, 'validation.json');
  const validation = await loadJson(validationPath), captures = [];
  for (const seed of SEEDS) {
    const packed = await readFile(resolve(EVIDENCE, `data/seed-${seed}-messages.v8.gz`));
    assert.equal(hash(packed), validation.replayBySeed[seed].sha256, `${seed} captured message stream hash`);
    const messages = deserialize(gunzipSync(packed));
    captures.push({ seed, routedHardnessRows: messages.filter(row => row.message.type === 'strike').map(row => ({
      simulationTimeMs: row.simulationTimeMs, postSimulationTimeMs: row.postSimulationTimeMs,
      plateId: row.message.payload.plateId, hardness: row.message.payload.hardness })) });
  }
  const resultsPath = resolve(EVIDENCE, 'results.json'), results = await loadJson(resultsPath);
  results.hardnessPopulation = buildHardnessPopulation(captures, inputs.rawBySeed);
  await writeFile(resultsPath, JSON.stringify(results, null, 2) + '\n');
  await writeHardnessPopulationArtifacts(results.hardnessPopulation);
  const readmePath = resolve(EVIDENCE, 'README.md'), readme = await readFile(readmePath, 'utf8');
  const withoutOld = readme.replace(/## Full-run hardness context\n[\s\S]*?(?=## Nine matched windows)/, '');
  assert(withoutOld.includes('## Nine matched windows'));
  await writeFile(readmePath, withoutOld.replace('## Nine matched windows', `${hardnessPopulationMarkdown(results.hardnessPopulation)}## Nine matched windows`));
}

function runRenderWorker(seed, arm, suffix = '') {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [resolve(ROOT, 'scripts/ant-g-hardness-pulse-shadow.js'),
      '--render-worker', String(seed), arm, suffix], { cwd: ROOT, stdio: 'inherit', windowsHide: true });
    child.once('error', rejectPromise);
    child.once('close', code => code === 0 ? resolvePromise() : rejectPromise(
      new Error(`render worker ${seed}/${arm}${suffix} exited ${code}`)));
  });
}

async function renderWorker(seed, arm, runSuffix = '') {
  assert(SEEDS.includes(seed)); assert(['A', 'B'].includes(arm));
  const originMain = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(originMain, EXPECTED_MAIN);
  const source = await readFile(resolve(ROOT, WORKLET), 'utf8');
  const mainSource = execFileSync('git', ['show', `origin/main:${WORKLET}`], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 });
  const normalizeEol = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
  assert.equal(hash(normalizeEol(Buffer.from(source))), hash(normalizeEol(mainSource)), 'production worklet matches fresh main');
  const streamPath = resolve(EVIDENCE, `data/seed-${seed}-messages.v8.gz`);
  const packed = await readFile(streamPath);
  const streamManifest = await loadJson(resolve(EVIDENCE, 'data/message-stream-manifest.json'));
  assert.equal(hash(packed), streamManifest[seed].sha256, `${seed} message stream hash`);
  const messages = deserialize(gunzipSync(packed));
  const BWorklet = transformHardnessPulseWorklet(source);
  const tempRoot = resolve(ROOT, 'test-results/ant-g-hardness-pulse-shadow');
  const listeningRoot = resolve(EVIDENCE, 'listening');
  await mkdir(tempRoot, { recursive: true }); await mkdir(listeningRoot, { recursive: true });
  const arms = arm === 'A' ? [['A', source]] : [['B', BWorklet]];
  const rendered = await renderSeed({ seed, messages }, source, BWorklet, tempRoot, listeningRoot, arms, runSuffix);
  await writeFile(resolve(tempRoot, `worker-${seed}-${arm}${runSuffix}.json`), JSON.stringify(rendered.cells, null, 2) + '\n');
}

async function writeEvidence(results, validation, cells, metrics) {
  const dataDir = resolve(EVIDENCE, 'data'), listeningDir = resolve(EVIDENCE, 'listening');
  await mkdir(dataDir, { recursive: true }); await mkdir(listeningDir, { recursive: true });
  await writeFile(resolve(EVIDENCE, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  await writeHardnessPopulationArtifacts(results.hardnessPopulation);
  await writeFile(resolve(EVIDENCE, 'analysis-metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  await writeFile(resolve(EVIDENCE, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
  await writeFile(resolve(EVIDENCE, 'overview.svg'), fixedScaleSvg(results.windows));
  const csvHeader = ['seed','window','startSeconds','endSeconds','strikes','hardnessP05','hardnessP50','hardnessP95',
    'BstepsP05','BstepsP50','BstepsP95','rmsA','rmsB','peakA','peakB','AcentroidHz','BcentroidHz',
    'A300to1000Share','B300to1000Share','pcmRelativeL2','pcmZeroLagCorrelation','pcmPowerSpectrumCosine',
    'pcm50HzBinCosine','pcm25msEnvelopeCosine','pickupARms','pickupBRms','pickupACentroidHz','pickupBCentroidHz'];
  const quote = value => `"${String(value ?? '').replaceAll('"','""')}"`;
  const csvRows = results.windows.map(row => [row.seed,row.window,row.startSeconds,row.endSeconds,row.strikes,
    row.hardness.p05,row.hardness.p50,row.hardness.p95,row.pulse.Bsteps.p05,row.pulse.Bsteps.p50,row.pulse.Bsteps.p95,
    row.output.A.rms,row.output.B.rms,row.output.A.peakAbs,row.output.B.peakAbs,row.output.A.spectralCentroidHz,
    row.output.B.spectralCentroidHz,row.output.A.bandPowerFractions['300-1000Hz'],row.output.B.bandPowerFractions['300-1000Hz'],
    row.output.comparison.relativeL2,row.output.comparison.zeroLagCorrelation,row.output.comparison.powerSpectrumCosine,
    row.output.comparison.powerCosine50HzBins,row.output.comparison.envelope25msRmsCosine,row.pickup.A.rms,row.pickup.B.rms,
    row.pickup.A.spectralCentroidHz,row.pickup.B.spectralCentroidHz].map(quote).join(','));
  await writeFile(resolve(EVIDENCE, 'results.csv'), csvHeader.join(',') + '\n' + csvRows.join('\n') + '\n');
  const audioRows = cells.filter(cell => cell.arm === 'A').map(cell => {
    const aPath = cell.wav.path.split('/').at(-1), bPath = aPath.replace(/-A\.wav$/, '-B.wav');
    return `<section><h3>${cell.seed} / ${cell.window}</h3><p>Fixed gain 0.7, stereo PCM16.</p><p>A <audio controls preload="none" src="${aPath}"></audio></p><p>B <audio controls preload="none" src="${bPath}"></audio></p></section>`;
  });
  await writeFile(resolve(listeningDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>G hardness pulse shadow</title><h1>Fixed-gain A/B listening</h1><p>No normalization. A is fixed 3 ms; B is 3−2h ms. No listening judgment is encoded here.</p>${audioRows.join('\n')}\n`);
  const table = markdownTable(results.windows);
  const pooled = results.pooled;
  const readme = `# G Natural Hardness → Contact Pulse Shadow\n\n## Status\n\nResearch-only offline replay. Production remains at the fixed 3 ms pulse. No perceptual judgment was collected.\n\n## Provenance and method\n\nFresh production baseline: \`origin/main ${validation.originMain}\`. Hardness inputs came from the validated G capture at \`6149a4b43764ef582df32e85765b98e588ec3505\`; its three raw captures were hash-verified. The natural world was rerun once per seed with the actual \`SurfaceAudioBridge\` and inert worklet post capture. Initial fingerprints, 600 s world trace, all actual strike payloads, Plate/Nodule births and contact event hashes were checked against the validated G evidence. Captured topology and strike posts are saved as compressed V8 message streams in \`data/\`.\n\nA uses the unmodified main worklet. B uses a separate transformed source with only the pulse envelope length changed: \`n=clamp(round(18−12h),6,18)\` at 6 kHz. Every half-sine envelope is sum-normalized. Both arms receive the same continuous ordered topology/strike stream from time zero through 550 s; no window starts from reset state. The fixed 10 s windows are 120–130, 300–310, and 540–550 s for each seed.\n\nStereo output is measured at fixed bridge gain 0.7. Pickup values are the pre-readout left/right sums at the worklet pickup nodes at 6 kHz. Spectra use the existing project whole-window rectangular FFT metrics. No level normalization or threshold was applied. WAV files are fixed-gain PCM16 listening copies; metrics use fixed-gain Float32 captures.\n\n## Nine matched windows\n\n${table}\n\n## Pooled selected-strike and response summary\n\n- Selected routed strikes: ${pooled.strikes}.\n- Hardness p05 / p50 / p95: ${pooled.hardness.p05.toFixed(3)} / ${pooled.hardness.p50.toFixed(3)} / ${pooled.hardness.p95.toFixed(3)}.\n- B duration p05 / p50 / p95: ${pooled.pulseMs.p05.toFixed(3)} / ${pooled.pulseMs.p50.toFixed(3)} / ${pooled.pulseMs.p95.toFixed(3)} ms (${pooled.pulseSteps.p05} / ${pooled.pulseSteps.p50} / ${pooled.pulseSteps.p95} steps).\n- Mean across nine cells, A/B spectral centroid: ${pooled.output['A.spectralCentroidHz'].mean.toFixed(1)} / ${pooled.output['B.spectralCentroidHz'].mean.toFixed(1)} Hz.\n- Mean across nine cells, fixed-gain A/B stereo RMS: ${pooled.output['A.rms'].mean.toExponential(3)} / ${pooled.output['B.rms'].mean.toExponential(3)}.\n\n## Interpretation boundary\n\nThe exact duration intervention produced the descriptive output deltas in the table. Cross-window or cross-seed variation also includes different topology and strike density. It does not establish that hardness alone explains temporal differences, nor that the change is audible, preferred, artistically better, or suitable for production. The 3 ms baseline and production worklet are unchanged.\n\nVerdict: **${validation.verdict}**.\n\nReproduce with \`node scripts/ant-g-hardness-pulse-shadow.js\`; the script runs self-checks, recaptures and parity-checks the natural input, continuously renders both arms, writes listening copies and invokes the existing Python metric helper. Use \`ANT_PYTHON\` to point at a Python runtime with NumPy if needed.\n`;
  await writeFile(resolve(EVIDENCE, 'README.md'), readme.replace('## Nine matched windows',
    `${hardnessPopulationMarkdown(results.hardnessPopulation)}## Nine matched windows`));
}

async function main() {
  const worklet = await readFile(resolve(ROOT, WORKLET), 'utf8');
  const selfCheck = runPulseSelfCheck(worklet);
  const BWorklet = transformHardnessPulseWorklet(worklet);
  const exactRateParity = verifyExactRateOutput(worklet, BWorklet);
  const inputs = await verifyInputs();
  const python = process.env.ANT_PYTHON
    || 'C:/Users/5dudt/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
  execFileSync(python, [resolve(ROOT, METRICS), '--self-check'], { cwd: ROOT, stdio: 'inherit' });
  const tempRoot = resolve(ROOT, 'test-results/ant-g-hardness-pulse-shadow');
  const listeningRoot = resolve(EVIDENCE, 'listening');
  const inputDir = resolve(EVIDENCE, 'data');
  await mkdir(tempRoot, { recursive: true }); await mkdir(listeningRoot, { recursive: true });
  await mkdir(inputDir, { recursive: true });
  const captureSummaries = [], replayBySeed = {}, streamManifest = {};
  for (const seed of SEEDS) {
    console.log(`capture natural G ${seed}: starting 600 s / 60 Hz run`);
    const frozenStrikeRaw = inputs.rawBySeed.get(seed);
    const frozenWorldRaw = inputs.worldRawBySeed.get(seed);
    const capture = await captureNatural(seed, inputs.G, frozenWorldRaw, frozenStrikeRaw);
    console.log(`capture natural G ${seed}: ${capture.strikeCount} exact strikes; trace parity passed`);
    let serializedMessages = serialize(capture.messages);
    const messageHash = hash(serializedMessages);
    const packed = gzipSync(serializedMessages, { level: 6 });
    const inputPath = resolve(inputDir, `seed-${seed}-messages.v8.gz`);
    await writeFile(inputPath, packed);
    serializedMessages = null;
    if (globalThis.gc) globalThis.gc();
    const streamReceipt = { path: `data/seed-${seed}-messages.v8.gz`, sha256: hash(packed),
      messageSha256: messageHash, messageCount: capture.messages.length,
      strikeCount: capture.strikeCount, topologyCount: capture.topologyCount };
    const schedule = eventSchedule(capture, 550, PHYSICS_RATE);
    streamManifest[seed] = { ...streamReceipt, messageCount: capture.messages.length };
    replayBySeed[seed] = { messageHash: schedule.hash, messageCount: schedule.events.length,
      topologyCount: schedule.events.filter(row => row.message.type === 'topology').length + 1,
      strikeCount: capture.messages.filter(row => row.message.type === 'strike' && row.postSimulationTimeMs < 550000).length,
      maxFrameRoundingError: schedule.maxFrameRoundingError, ...streamReceipt,
      allNaturalTraceChecks: capture.traceChecks, initialStateSha256: capture.initialStateSha256,
      finalRngState: capture.rngState, finalRngCalls: capture.rngCalls };
    captureSummaries.push({ seed, routedHardnessRows: capture.routedHardnessRows,
      traceChecks: capture.traceChecks, initialStateSha256: capture.initialStateSha256,
      strikeCount: capture.strikeCount, topologyCount: capture.topologyCount, contacts: capture.contacts,
      births: capture.births, firstPlateTimeSeconds: capture.firstPlateTimeSeconds,
      finalPopulation: capture.finalPopulation, rngState: capture.rngState, rngCalls: capture.rngCalls });
    capture.messages = null;
  }
  await writeFile(resolve(inputDir, 'message-stream-manifest.json'), JSON.stringify(streamManifest, null, 2) + '\n');
  const jobs = SEEDS.flatMap(seed => ['A', 'B'].map(arm => ({ seed, arm, suffix: '' })));
  jobs.push({ seed: SEEDS[0], arm: 'A', suffix: '-repeat' }, { seed: SEEDS[0], arm: 'B', suffix: '-repeat' });
  console.log(`starting ${jobs.length} independent continuous 0–550 s replay jobs`);
  let completed = 0;
  const heartbeat = setInterval(() => console.log(`continuous replay jobs complete: ${completed}/${jobs.length}`), 60_000);
  try {
    await Promise.all(jobs.map(async job => {
      await runRenderWorker(job.seed, job.arm, job.suffix);
      completed += 1;
    }));
  } finally { clearInterval(heartbeat); }
  const readWorker = async ({ seed, arm, suffix }) => JSON.parse(await readFile(resolve(tempRoot,
    `worker-${seed}-${arm}${suffix}.json`), 'utf8'));
  const cells = [];
  for (const seed of SEEDS) for (const arm of ['A', 'B']) cells.push(...await readWorker({ seed, arm }));
  const repeatA = await readWorker({ seed: SEEDS[0], arm: 'A', suffix: '-repeat' });
  const repeatB = await readWorker({ seed: SEEDS[0], arm: 'B', suffix: '-repeat' });
  const firstA = cells.filter(row => row.seed === SEEDS[0] && row.arm === 'A');
  const firstB = cells.filter(row => row.seed === SEEDS[0] && row.arm === 'B');
  const hashes = rows => rows.map(row => [row.window, row.outputF32Sha256, row.pickupF32Sha256, row.wav.sha256]);
  assert.deepEqual(hashes(repeatA), hashes(firstA));
  assert.deepEqual(hashes(repeatB), hashes(firstB));
  const repeatDeterminism = { seed: SEEDS[0], fullContinuousAandB: true, byteIdenticalPcmWindows: true,
    byteIdenticalPickupWindows: true, byteIdenticalWav: true,
    messageStreamHash: replayBySeed[SEEDS[0]].messageHash };
  const captures = [];
  for (const summary of captureSummaries) {
    const packed = await readFile(resolve(inputDir, `seed-${summary.seed}-messages.v8.gz`));
    assert.equal(hash(packed), streamManifest[summary.seed].sha256);
    const messages = deserialize(gunzipSync(packed));
    captures.push({ ...summary, messages });
  }
  const indexPath = resolve(tempRoot, 'metrics-index.json');
  const metricsPath = resolve(tempRoot, 'analysis-metrics.json');
  await writeFile(indexPath, JSON.stringify(metricsIndex(cells), null, 2));
  execFileSync(python, [resolve(ROOT, METRICS), indexPath, metricsPath], { cwd: ROOT, stdio: 'inherit' });
  const metrics = JSON.parse(await readFile(metricsPath, 'utf8'));
  const results = buildResults(captures, { cells }, metrics);
  results.hardnessPopulation = buildHardnessPopulation(captures, inputs.rawBySeed);
  const acousticCells = results.windows.filter(row => !row.output.comparison.exactPCMMatch
    && (row.output.centroidDeltaHz !== 0 || row.output.band300to1000Delta !== 0 || row.output.rmsDelta !== 0));
  const directions = new Set(results.windows.map(row => Math.sign(row.output.centroidDeltaHz)).filter(value => value !== 0));
  const pickupCells = results.windows.filter(row => !row.pickup.comparison.exactPCMMatch);
  const verdict = acousticCells.length === results.windows.length && pickupCells.length > 0
    ? 'SUPPORTED FOR LISTENING'
    : acousticCells.length > 0 ? 'MIXED' : 'NEGATIVE';
  results.verdict = verdict;
  results.interpretation = {
    technicalOutputChangeCells: acousticCells.length,
    pickupChangeCells: pickupCells.length,
    centroidDeltaDirectionsObserved: [...directions],
    claim: verdict === 'SUPPORTED FOR LISTENING'
      ? 'The frozen hardness-driven pulse-width intervention produced repeatable measurable changes in all nine fixed natural windows; no human audibility or preference claim.'
      : verdict === 'MIXED'
        ? 'The frozen pulse-width intervention changed measured output in some fixed windows, with window-dependent response; no human audibility or preference claim.'
        : 'The frozen pulse-width intervention produced no material measured difference in these fixed windows.'
  };
  const validation = { verdict, originMain: inputs.originMain,
    reusedHardnessBranch: 'codex/ant-g-natural-hardness-distribution-20261026',
    reusedHardnessCommit: '6149a4b43764ef582df32e85765b98e588ec3505',
    preregistrationCommits: ['3125ef9a20c3c4c839756d1e17ad4ad6055b1fab', 'ac72ee4', '1cd6eee', 'f31720c'],
    preregistrationBeforeOutcomes: true, selfCheck, exactRateParity,
    sourceWorkletAudit: { matchesFreshMain: true, files: inputs.sourceHashes, gitBlobSha256: inputs.sourceBlobHashes,
      productionDiffAfterRun: true },
    reusedRawSha256: RAW_SHA, naturalTraceParity: Object.fromEntries(captures.map(capture =>
      [capture.seed, capture.traceChecks])), replayBySeed, repeatDeterminism,
    fixedWindowCounts: results.windows.map(row => ({ seed: row.seed, window: row.window,
      routedStrikes: row.strikes, pcmFrames: cells.find(cell => cell.seed === row.seed && cell.window === row.window && cell.arm === 'A').outputFrames,
      pickupFrames: cells.find(cell => cell.seed === row.seed && cell.window === row.window && cell.arm === 'A').pickupFrames })),
    manipulation: { AWorkletSha256: hash(worklet), BWorkletSha256: hash(BWorklet),
      candidateSteps: 'clamp(round(18 - 12*h), 6, 18)', candidateEnvelope: 'sum-normalized half-sine',
      BPulseReceiptsPerSeed: Object.fromEntries(SEEDS.map(seed => [seed,
        cells.find(cell => cell.seed === seed && cell.arm === 'B').pulseReceipts])),
      BPulseReceiptsMatchAcceptedStrikes: SEEDS.every(seed =>
        cells.find(cell => cell.seed === seed && cell.arm === 'B').pulseReceipts === replayBySeed[seed].strikeCount),
      AOutputStillProduction18Steps: worklet.includes('const CONTACT_PULSE_STEPS = Math.round(RATE * 0.003);')
        && worklet.includes('proc.contactForces[slot * proc.current.length + node] += delivered * CONTACT_ENVELOPE[step];'),
      sameTopologyStrikeInputHashForArms: SEEDS.every(seed => {
        const pair = cells.filter(cell => cell.seed === seed);
        return pair.every(cell => replayBySeed[seed].messageHash === pair[0].inputMessageHash);
      }),
      worldChangedByAudioShadow: false },
    workletDiagnostics: cells.map(cell => ({ seed: cell.seed, window: cell.window, arm: cell.arm,
      strikes: cell.telemetry.strikes, topologies: cell.telemetry.topologies, dropped: cell.telemetry.dropped,
      droppedRoutes: cell.telemetry.droppedRoutes, nonFinite: cell.telemetry.nonFinite,
      clipped: cell.telemetry.clipped, maxOutputAbs: cell.telemetry.maxOutputAbs })),
    validationBoundary: 'Acoustic change is measured in this offline replay; no listener result, preference, artistic value, or production mapping claim.' };
  const diffOutput = execFileSync('git', ['diff', '--name-only', 'origin/main', '--', 'src', 'static/worklets'],
    { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(diffOutput, '', 'production src and worklet are untouched');
  await writeEvidence(results, validation, cells, metrics);
  const daily = `# G Natural Hardness → Contact Pulse Shadow — 2026-10-26\n\n- Question: does the one preregistered \`3−2h ms\` duration rule change natural G Born Surface output against fixed 3 ms?\n- Reused the hash-validated actual \`SurfaceAudioBridge\` strike evidence and freshly replayed the three 600 s G worlds; initial state, contacts, births, per-second state, event hashes, final RNG and actual strike payloads matched saved G evidence. Captured the topology posts needed for full 0–550 s continuous replay.\n- A kept the current worklet unchanged. B changed only the sum-normalized half-sine pulse length from 18 steps to \`clamp(round(18−12h),6,18)\`; all nine preregistered windows were rendered at fixed gain with no resets or per-window normalization.\n- Decision: **${verdict}**. ${results.interpretation.claim}\n- No listener judgment was collected; no production worklet, audio law or canonical status changed.\n- Evidence and reproduction: [package](../evidence/2026-10-26-g-hardness-pulse-shadow/README.md).\n`;
  await writeFile(resolve(ROOT, 'docs/ant/daily/2026-10-26-g-hardness-pulse-shadow.md'), daily);
  const dailyIndex = await readFile(resolve(ROOT, 'docs/ant/daily/README.md'), 'utf8');
  const marker = '### 2026-10-26 — G natural hardness distribution\n';
  assert.equal(dailyIndex.split(marker).length, 2, 'daily index has one current-day insertion point');
  const entry = `### 2026-10-26 — G hardness-driven contact pulse shadow\n\n[Process log](./2026-10-26-g-hardness-pulse-shadow.md) · [Evidence package](../evidence/2026-10-26-g-hardness-pulse-shadow/README.md)\n\n- Replayed identical production-G topology/strike streams through fixed 3 ms and the one frozen \`3−2h ms\` shadow for early/mid/late 10 s windows\n- ${verdict}; no human listening judgment and no production audio-law change\n\n`;
  await writeFile(resolve(ROOT, 'docs/ant/daily/README.md'), dailyIndex.replace(marker, entry + marker));
  const diffAfter = execFileSync('git', ['diff', '--name-only', 'origin/main', '--', 'src', 'static/worklets'],
    { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(diffAfter, '');
  console.log(JSON.stringify({ evidence: relative(ROOT, EVIDENCE), verdict,
    selectedStrikes: results.pooled.strikes, windowCount: results.windows.length,
    pooledHardness: results.pooled.hardness, pooledBMilliseconds: results.pooled.pulseMs,
    centroidDelta: results.windows.map(row => [row.seed, row.window, row.output.centroidDeltaHz]),
    sourceDiff: diffAfter }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--self-check')) {
    const source = await readFile(resolve(ROOT, WORKLET), 'utf8');
    const BWorklet = transformHardnessPulseWorklet(source);
    console.log(JSON.stringify({ pulse: runPulseSelfCheck(source), exactRateParity: verifyExactRateOutput(source, BWorklet) }, null, 2));
  } else if (process.argv.includes('--render-worker')) {
    const index = process.argv.indexOf('--render-worker');
    await renderWorker(Number(process.argv[index + 1]), process.argv[index + 2], process.argv[index + 3] ?? '');
  } else if (process.argv.includes('--augment-context')) await augmentContextFromFrozenStreams();
  else await main();
}
