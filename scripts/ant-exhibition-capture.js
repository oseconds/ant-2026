import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deserialize, serialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}/docs/ant/evidence/2026-10-21-exhibition-audio-runtime`;
const SEED = 20261005, DT = 1 / 60, TICK_MS = 1000 / 60;
const TARGETS = [8, 20, 30], WINDOW_TICKS = 720;
const FIELDS = ['agentTrajectory', 'lifecycle', 'rng', 'pheromone', 'surfaceField', 'gait', 'bodyPose',
  'gasterDeposition', 'colonyActivation', 'localOccupancy', 'footContacts', 'materialBirthEvents',
  'trailPlateBirth', 'materialStratigraphy'];
const SOURCE_PATHS = [
  'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/AntController.js',
  'src/lib/agents/ant/BodyPoseController.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/audio/AntEnvironmentAudioBridge.js',
  'src/lib/audio/SurfaceAudioBridge.js', 'src/lib/audio/compileSurfaceTopology.js',
  'static/worklets/surface-plate.worklet.js'
];

if (process.argv.includes('--normalize-existing')) await normalizeExisting();
else await main();

async function main() {
  const started = performance.now();
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  await mkdir(OUT, { recursive: true });
  const ctrlRng = lcg(SEED), audioRng = lcg(SEED), control = new AntController({ random: ctrlRng.random });
  let audioController, active = null;
  const messages = [], bridge = new AntEnvironmentAudioBridge({ audioEngine: { context: { currentTime: 0 } },
    workletFactory: async () => ({ node: { port: { postMessage(message) {
      messages.push({ tick: active?.tick ?? 0,
        simulationTimeMs: message.type === 'strike' ? active?.lastContactTime ?? audioController?.simulationTimeMs ?? 0
          : audioController?.simulationTimeMs ?? 0,
        message: structuredClone(message) });
    } } }, disconnect() {} }) });
  audioController = new AntController({ random: audioRng.random, audioBridge: bridge });
  const ctrlEvents = events(), audioEvents = events();
  const unsubA = subscribe(control, ctrlEvents), unsubB = subscribe(audioController, audioEvents, row => {
    if (active) active.lastContactTime = row.simulationTimeMs;
  });
  const controlHasher = makeHasher(), audioHasher = makeHasher();
  const controlBirthHasher = makeBirthHasher(), audioBirthHasher = makeBirthHasher();
  const parity = { samples: 0, fields: Object.fromEntries(FIELDS.map(k => [k, createHash('sha256')])), firstMismatch: null };
  const milestones = new Map(), endTimes = new Map();
  await Promise.all([control.init(), audioController.init()]);
  assert.equal(await audioController.setAudioEnabled(true), true);
  const maxTicks = 3600 * 60;
  for (let tick = 0; tick <= maxTicks; tick++) {
    if (tick > 0) {
      clear(ctrlEvents); clear(audioEvents); active = { tick };
      control.tick(DT); audioController.tick(DT); active = null;
    }
    parityTick(control, audioController, ctrlRng, audioRng, ctrlEvents, audioEvents,
      controlHasher, audioHasher, controlBirthHasher, audioBirthHasher, parity, tick);
    const count = control.materialStratigraphy.getSnapshot().stratigraphy.plateHistory.length;
    for (const target of TARGETS) if (!milestones.has(target) && count >= target) {
      const milestone = { tick, time: control.simulationTimeMs,
        plateIds: control.materialStratigraphy.getSnapshot().stratigraphy.plateHistory.map(p => p.id),
        messageIndex: messages.length };
      milestones.set(target, milestone);
      console.log(JSON.stringify({ stage: 'milestone', target, tick, plateCount: count, seconds: tick / 60 }));
    }
    for (const [target, boundary] of milestones) if (tick === boundary.tick + WINDOW_TICKS) endTimes.set(target, control.simulationTimeMs);
    if (TARGETS.every(target => milestones.has(target) && tick >= milestones.get(target).tick + WINDOW_TICKS)) break;
    if (tick === maxTicks) assert.fail(`seed ${SEED} did not reach all milestones and windows`);
  }
  unsubA(); unsubB();
  assert.equal(parity.firstMismatch, null);
  assert.ok(FIELDS.every(name => parity.fields[name]));
  const cases = TARGETS.map(target => makeCase(target, milestones.get(target),
    milestones.get(target).tick + WINDOW_TICKS, endTimes.get(target), messages));
  assert.equal(parity.samples, Math.max(...cases.map(row => row.endTick)) + 1);
  const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, hash(await readFile(`${ROOT}/${path}`))])));
  const capture = { schemaVersion: 1, seed: SEED, sourceCommit, sourceHashes,
    provenance: { model: 'current production ANT simulation plus AntEnvironmentAudioBridge mocked worklet port',
      capture: 'natural current topology; worklet messages captured at exact bridge boundaries',
      replay: 'frozen topology at each milestone; strike events within 12 s retained only when routed Plate remains exposed in that frozen topology',
      preconditioningMs: 2000, measuredMs: 10000, windowMs: 12000 },
    parity: { samples: parity.samples, firstMismatch: parity.firstMismatch,
      fields: Object.fromEntries(FIELDS.map(name => [name, parity.fields[name].digest('hex')])),
      equal: true, rng: { control: { state: ctrlRng.state(), calls: ctrlRng.calls },
        audioBridge: { state: audioRng.state(), calls: audioRng.calls } } },
    cases, simulationWallSeconds: (performance.now() - started) / 1000 };
  const raw = serialize({ cases, provenance: capture });
  const packed = gzipSync(raw, { level: 9 });
  await writeFile(`${OUT}/capture-inputs.v8.gz`, packed);
  const caseSummaries = cases.map(row => ({ plateCount: row.plateCount, tick: row.tick, endTick: row.endTick,
    frames: row.frames, topologySha256: hash(serialize(row.topology)), expectedActivePlateIds: row.expectedActivePlateIds,
    naturalTopologyMessages: row.naturalTopologyMessages.length, naturalStrikes: row.naturalStrikes.length,
    retainedEvents: row.events.length, droppedRoutes: row.droppedRoutes.length,
    firstRelativeFrame: row.events[0]?.frame ?? null, lastRelativeFrame: row.events.at(-1)?.frame ?? null }));
  const receipt = { schemaVersion: 1, seed: SEED, sourceCommit: capture.sourceCommit,
    sourceHashes, provenance: capture.provenance, parity: capture.parity, cases: caseSummaries,
    artifact: 'capture-inputs.v8.gz', bytes: packed.length,
    uncompressedBytes: raw.length, sha256: hash(packed), selfCheck: selfCheck(packed, capture.cases),
    elapsedWallSeconds: (performance.now() - started) / 1000 };
  await writeFile(`${OUT}/capture-receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ stage: 'capture complete', cases: caseSummaries, sha256: receipt.sha256,
    elapsedWallSeconds: receipt.elapsedWallSeconds }));
  await Promise.all([control.destroy(), audioController.destroy()]);
}

function makeCase(target, milestone, endTick, endMs, messages) {
  const startMs = milestone.time;
  // Audio starts after the completed milestone tick: that tick's contacts are pre-boundary history.
  const window = messages.slice(milestone.messageIndex).filter(row => row.simulationTimeMs >= startMs && row.simulationTimeMs < endMs);
  const topoRows = window.filter(row => row.message.type === 'topology');
  const initial = topoRows.find(row => row.simulationTimeMs === startMs) ?? messages.slice(0, milestone.messageIndex)
    .filter(row => row.message.type === 'topology').at(-1);
  assert.ok(initial, `milestone ${target} needs an installed topology`);
  const topology = initial.message.payload;
  const startFrame = Math.round(startMs * 48), endFrame = Math.round(endMs * 48);
  const strikes = window.filter(row => row.message.type === 'strike').map((row, sequence) => ({
    absoluteFrame: Math.round(row.simulationTimeMs * 48), message: row.message, tick: row.tick,
    simulationTimeMs: row.simulationTimeMs, sequence }));
  const routeDecision = row => {
    const p = row.message.payload.position;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)
      return 'invalid source position';
    const cell = Math.round(p.y * 95) * 96 + Math.round(p.x * 95);
    const layer = topology.routingTopLayerByCell96[cell] ?? -1;
    if (layer < 0) return 'no exposed top layer';
    if (topology.layerIds[layer] !== row.message.payload.layerId) return 'routed Plate is not exposed at source position';
    return null;
  };
  const decisions = strikes.map(row => ({ ...row, droppedReason: routeDecision(row) }));
  const events = decisions.filter(row => !row.droppedReason).map(row => ({ ...row,
    frame: row.absoluteFrame - startFrame })).sort((a, b) => a.frame - b.frame || a.sequence - b.sequence);
  const dropped = decisions.filter(row => row.droppedReason);
  const expected = [...new Set(Array.from(topology.routingTopLayerByCell96, layer =>
    layer >= 0 ? topology.layerIds[layer] : null).filter(Boolean))].sort();
  assert.ok(events.length > 0, `milestone ${target} must capture strike events`);
  return { plateCount: target, tick: milestone.tick, startTimeMs: startMs, endTick,
    windowMs: 12000, preconditioningMs: 2000, measurementMs: 10000,
    startFrame, endFrame, frames: endFrame - startFrame,
    topologyMode: 'frozen milestone topology; natural topology events retained as provenance only',
    topology, expectedActivePlateIds: expected,
    naturalTopologyMessages: topoRows.map(({ tick, simulationTimeMs, message }) => ({ tick, simulationTimeMs,
      generation: message.payload.generation, layerIds: message.payload.layerIds })),
    naturalStrikes: strikes, events, droppedRoutes: dropped,
    routeSelection: 'filter with frozen production routingTopLayerByCell96 at the strike source cell; drop invalid, empty-top, or mismatched exposed-layer routes',
    measurement: { startFrame: Math.round((startMs + 2000) * 48) - startFrame,
      endFrame: endFrame - startFrame, startTimeMs: startMs + 2000, endTimeMs: endMs } };
}

function selfCheck(packed, expected) {
  const rows = deserialize(gunzipSync(packed)).cases;
  assert.equal(rows.length, 3); assert.deepEqual(rows.map(x => x.plateCount), TARGETS);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; assert.equal(row.events.length + row.droppedRoutes.length, row.naturalStrikes.length);
    assert.equal(row.events.length, expected[i].events.length);
    const active = [...new Set(Array.from(row.topology.routingTopLayerByCell96, layer =>
      layer >= 0 ? row.topology.layerIds[layer] : null).filter(Boolean))].sort();
    assert.deepEqual(row.expectedActivePlateIds, active, 'expected active set must match exposed routing cells');
    assert.ok(row.events.every(event => row.expectedActivePlateIds.includes(event.message.payload.layerId)));
    assert.ok(row.events.every(event => event.frame >= 0 && event.frame < row.frames));
    assert.ok(row.events.every((event, index) => index === 0 || event.frame >= row.events[index - 1].frame),
      'relative event frames must remain chronological');
    assert.ok(row.events.every(event => {
      const p = event.message.payload.position;
      const cell = Math.round(p.y * 95) * 96 + Math.round(p.x * 95);
      return row.topology.layerIds[row.topology.routingTopLayerByCell96[cell]] === event.message.payload.layerId;
    }));
    assert.equal(row.endFrame - row.startFrame, row.frames);
  }
  return { passed: true, cases: rows.length, retainedEvents: rows.map(row => row.events.length) };
}

async function normalizeExisting() {
  const path = `${OUT}/capture-inputs.v8.gz`, packed = await readFile(path);
  const decoded = deserialize(gunzipSync(packed));
  const cases = decoded.cases;
  for (const row of cases) {
    row.expectedActivePlateIds = [...new Set(Array.from(row.topology.routingTopLayerByCell96, layer =>
      layer >= 0 ? row.topology.layerIds[layer] : null).filter(Boolean))].sort();
    row.events.sort((a, b) => a.frame - b.frame || a.sequence - b.sequence);
    assert.ok(row.events.every((event, index) => index === 0 || event.frame >= row.events[index - 1].frame));
  }
  const provenance = { ...decoded.provenance }; delete provenance.cases;
  const normalized = gzipSync(serialize({ cases, provenance }), { level: 9 });
  const check = selfCheck(normalized, cases);
  await writeFile(path, normalized);
  const summaries = cases.map(row => ({ plateCount: row.plateCount, tick: row.tick, endTick: row.endTick,
    frames: row.frames, topologySha256: hash(serialize(row.topology)), expectedActivePlateIds: row.expectedActivePlateIds,
    naturalTopologyMessages: row.naturalTopologyMessages.length, naturalStrikes: row.naturalStrikes.length,
    retainedEvents: row.events.length, droppedRoutes: row.droppedRoutes.length,
    firstRelativeFrame: row.events[0]?.frame ?? null, lastRelativeFrame: row.events.at(-1)?.frame ?? null }));
  const receipt = { schemaVersion: 1, seed: provenance.seed, sourceCommit: provenance.sourceCommit,
    sourceHashes: provenance.sourceHashes, provenance: provenance.provenance, parity: provenance.parity,
    cases: summaries, artifact: 'capture-inputs.v8.gz', bytes: normalized.length,
    uncompressedBytes: gunzipSync(normalized).length, sha256: hash(normalized), selfCheck: check,
    normalizedExistingCapture: true };
  await writeFile(`${OUT}/capture-receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ stage: 'cached capture normalized', cases: summaries, sha256: receipt.sha256,
    selfCheck: check }));
}

function events() { return { contacts: [], births: [], errors: [] }; }
function clear(e) { for (const list of Object.values(e)) list.length = 0; }
function subscribe(c, e, onContact) { return c.subscribe(({ type, payload }) => {
  if (type === 'foot-contact') { e.contacts.push(structuredClone(payload)); onContact?.(payload); }
  else if (type === 'plate-birth' || type === 'sphere-birth') e.births.push({ type, payload: structuredClone(payload) });
  else if (type === 'error') e.errors.push(structuredClone(payload));
}); }
function parityTick(a, b, ra, rb, ea, eb, ha, hb, birthA, birthB, p, tick) {
  const values = [parityValues(a, ra, ea, ha, birthA), parityValues(b, rb, eb, hb, birthB)];
  for (const name of FIELDS) {
    const left = hashValue(values[0][name]), right = hashValue(values[1][name]);
    if (left !== right && !p.firstMismatch) p.firstMismatch = { tick, field: name };
    p.fields[name].update(left).update(right).update('\n');
  }
  p.samples++; assert.equal(p.firstMismatch, null, `audio-on/off mismatch at tick ${tick}`);
}
function parityValues(c, rng, e, materialHash, birthHash) {
  return {
    agentTrajectory: c.agents,
    lifecycle: { state: c.state, simulationTimeMs: c.simulationTimeMs, nextSpawnTimeMs: c.nextSpawnTimeMs,
      nextAgentId: c.nextAgentId, totalSpawned: c.totalSpawned, totalRetired: c.totalRetired,
      accumulatorMs: c.accumulatorMs, initialized: c.initialized, running: c.running },
    rng: { state: rng.state(), calls: rng.calls }, pheromone: c.field, surfaceField: c.surfaceField,
    gait: c.gaitController.ants, bodyPose: c.bodyPoseController.ants, gasterDeposition: c.gasterDeposition,
    colonyActivation: c.colonyActivation, localOccupancy: c.occupancy, footContacts: e.contacts,
    materialBirthEvents: { births: e.births, errors: e.errors },
    trailPlateBirth: birthHash(c.trailPlateBirth), materialStratigraphy: materialHash(c.materialStratigraphy)
  };
}
function makeHasher() {
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
  let key = null, descriptorHash = null;
  return birth => {
    const counts = `${birth.plates.length}:${birth.birthRecords.length}`;
    if (counts !== key) { descriptorHash = hashValue({ plates: birth.plates, birthRecords: birth.birthRecords }); key = counts; }
    const candidate = birth.candidate;
    const scalars = candidate ? { ...candidate, mask: undefined, supportedMask: undefined, component: undefined,
      skeletonIndices: undefined, path: undefined } : null;
    return hashValue({ descriptorHash, scalars, arrays: candidate
      ? [candidate.mask, candidate.supportedMask, candidate.component, candidate.path, candidate.skeletonIndices] : [],
    chemicalMemory: birth.chemicalMemory, footContactCounts: birth.footContactCounts,
    lastInputDiagnostics: birth.lastInputDiagnostics, lastAnalysisTimeMs: birth.lastAnalysisTimeMs,
    lastBirthTimeMs: birth.lastBirthTimeMs });
  };
}
function lcg(seed) { let state = seed >>> 0, calls = 0; return { random() { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; calls++; return state / 2 ** 32; }, state: () => state, get calls() { return calls; } }; }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function hashValue(value) { const digest = createHash('sha256'); appendValue(digest, value, new WeakSet()); return digest.digest('hex'); }
function appendValue(digest, value, parents) {
  if (value === null) { digest.update('null;'); return; }
  if (value === undefined) { digest.update('undefined;'); return; }
  if (typeof value === 'string') { digest.update(`s${value.length}:${value}`); return; }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') { digest.update(`${typeof value}:${String(value)};`); return; }
  if (typeof value === 'function') { digest.update(`fn:${value.name || ''};`); return; }
  if (ArrayBuffer.isView(value)) { digest.update(`${value.constructor.name}:${value.byteLength}:`).update(Buffer.from(value.buffer, value.byteOffset, value.byteLength)); return; }
  if (value instanceof ArrayBuffer) { digest.update(`ab:${value.byteLength}:`).update(Buffer.from(value)); return; }
  if (parents.has(value)) { digest.update('[cycle];'); return; }
  parents.add(value);
  if (Array.isArray(value)) { digest.update(`array:${value.length}[`); for (const item of value) appendValue(digest, item, parents); digest.update(']'); }
  else if (value instanceof Map) { digest.update(`map:${value.size}{`); for (const [key, item] of value) { appendValue(digest, key, parents); appendValue(digest, item, parents); } digest.update('}'); }
  else if (value instanceof Set) { digest.update(`set:${value.size}{`); for (const item of value) appendValue(digest, item, parents); digest.update('}'); }
  else { const keys = Object.keys(value).sort(); digest.update(`object:${keys.length}{`); for (const key of keys) { digest.update(`${key.length}:${key}`); appendValue(digest, value[key], parents); } digest.update('}'); }
  parents.delete(value);
}
