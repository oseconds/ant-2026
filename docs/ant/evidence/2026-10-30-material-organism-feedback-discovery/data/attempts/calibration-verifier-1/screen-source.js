import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { createController, executeScenario } from './ant-g-production-candidate-natural.js';
import { attachTurningResponse } from './ant-material-turning-probe.js';
import { attachMaterialStride } from './ant-material-stride-probe.js';
import { neighbors8 } from './ant-opportunity-core.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-30-material-organism-feedback-discovery/data';
const BASE = 'docs/ant/evidence/2026-10-25-g-production-candidate-review/data';
const LATE = 'docs/ant/evidence/2026-10-29-late-qualified-opportunity-capture/data/late-input.json.gz';
const CHECKPOINTS = [30, 60, 120, 300, 600];
const hash = data => createHash('sha256').update(data).digest('hex');
const angleDelta = (a, b) => ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const turningFactor = layers => 1 - 0.50 * (1 - Math.exp(-layers / 4));
const gzipJson = async path => JSON.parse(gunzipSync(await readFile(path)));
const writeNew = (path, data) => writeFile(path, data, { flag: 'wx' });
async function writeStable(path, data) {
  try { assert.deepEqual(await readFile(path), data, `${path} rerun output matches saved bytes`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; await writeNew(path, data); }
}

function sourcePins(source) {
  const block = source.match(/const EXPECTED_SOURCE_HASHES = \{([\s\S]*?)\n\};/);
  assert(block, 'Pass 3 source pins exist');
  return Object.fromEntries([...block[1].matchAll(/'([^']+)': '([a-f0-9]{64})'/g)].map(([, file, value]) => [file, value]));
}

export async function verifySourceAuthority() {
  const source = await readFile(resolve(ROOT, 'scripts/ant-material-pheromone-attenuation-screen.js'), 'utf8');
  const pins = sourcePins(source), actual = {};
  assert.equal(Object.keys(pins).length, 11, 'all 11 production sources pinned');
  for (const [file, expected] of Object.entries(pins)) {
    actual[file] = hash(await readFile(resolve(ROOT, file)));
    assert.equal(actual[file], expected, `${file} matches Pass 3 authority`);
  }
  return actual;
}
async function currentSourceHashes() {
  const pins = await verifySourceAuthority(), files = ['scripts/ant-g-production-candidate-natural.js',
    'scripts/ant-material-turning-probe.js', 'scripts/ant-material-stride-probe.js',
    'scripts/ant-material-feedback-screen-analysis.js', 'scripts/ant-material-organism-feedback-screen.js',
    'tests/ant-material-organism-feedback-screen.test.js'];
  return { ...pins, ...Object.fromEntries(await Promise.all(files.map(async file => [file,
    hash(await readFile(resolve(ROOT, file)))]))) };
}

function layerAt(snapshot, x, y) {
  const s = snapshot?.stratigraphy;
  return s?.layerCountByCell?.[Math.round(y * 95) * 96 + Math.round(x * 95)] || 0;
}

function loadZhangSuen(source) {
  const math = Object.create(Math); math.random = () => { throw new Error('Observer must not consume RNG.'); };
  return runInNewContext(source.replace(/^export /gm, '') + '\n({ zhangSuen })', { Math: math }).zhangSuen;
}
function edgeMask(mask) {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) if (mask[i] && neighbors8(i).some(j => mask[j])) out[i] = 1;
  return out;
}
function attachLateCapture(controller, expectedTicks, zhangSuen, record) {
  const native = controller.tick.bind(controller);
  controller.tick = (...args) => {
    const result = native(...args), timeMs = controller.simulationTimeMs, tick = Math.round(timeMs / (1000 / 60));
    if (!expectedTicks.has(tick)) return result;
    const surface = controller.surfaceField, B = controller.trailPlateBirth.buildSupportedMask(surface).mask;
    const F = zhangSuen(B), S = edgeMask(F), plates = controller.trailPlateBirth.getPlates()
      .filter(plate => plate.bornAtSimulationTimeMs < timeMs);
    const preMaterialLayers = new Uint8Array(96 * 96);
    for (const plate of plates) for (let i = 0; i < preMaterialLayers.length; i += 1)
      if (plate.mask[i]) preMaterialLayers[i] += 1;
    record.frames.push({ timeMs, tick, B: controller.trailPlateBirth.chemicalMemory.slice(), C: surface.values.slice(),
      D: Float32Array.from({ length: 96 * 96 }, (_, i) => Math.fround(surface.sampleSupport(i % 96 / 95,
        Math.floor(i / 96) / 95, .025))), E: B, F, S, preMaterialLayers, materialIds: plates.map(plate => plate.id) });
    return result;
  };
  controller.subscribe(event => {
    if (event.type === 'foot-contact') for (const contact of event.payload?.contacts || [])
      if (Number.isFinite(contact.position?.x) && Number.isFinite(contact.position?.y))
        record.feet.push({ timeMs: event.payload.simulationTimeMs, x: contact.position.x, y: contact.position.y });
    if (event.type === 'plate-birth' && event.payload?.mask) record.actualBirthMasks.push({ id: event.payload.id,
      bornAtSimulationTimeMs: event.payload.bornAtSimulationTimeMs, mask: Array.from(event.payload.mask) });
  });
}

function attachTickEntry(controller, stride, record) {
  const native = controller.tick.bind(controller);
  const layersByAnt = new Map();
  record._currentLayers = layersByAnt;
  const turnById = new Map(), senseById = new Map(), guardById = new Map();
  record._turnById = turnById;
  const occupancy = controller.occupancy, nativeSense = occupancy.sense.bind(occupancy);
  occupancy.sense = (ant, agents) => { const row = nativeSense(ant, agents); senseById.set(ant.id, row); return row; };
  const nativeGuard = occupancy.constrainDisplacements.bind(occupancy);
  occupancy.constrainDisplacements = (agents, displacements) => {
    const scales = nativeGuard(agents, displacements);
    for (let i = 0; i < agents.length; i += 1) guardById.set(agents[i].id, scales[i]);
    return scales;
  };
  controller.tick = (...args) => {
    const snapshot = controller.materialStratigraphy.getSnapshot();
    layersByAnt.clear();
    const before = new Map();
    for (const ant of controller.agents) {
      layersByAnt.set(ant.id, layerAt(snapshot, ant.x, ant.y));
      const gait = controller.gaitController.ants.get(ant.id);
      before.set(ant.id, { ant, x: ant.x, y: ant.y, phase: gait?.phase ?? null });
    }
    if (stride) stride.setTickEntryLayerCounts(layersByAnt);
    for (const layers of layersByAnt.values()) record.layers[layers] = (record.layers[layers] || 0) + 1;
    record.tickEntrySnapshots += 1;
    const result = native(...args);
    for (const [id, prior] of before) {
      const ant = prior.ant, layer = String(layersByAnt.get(id) || 0), row = record.motorByLayer[layer] ||= {
        ticks: 0, distance: 0, speedSum: 0, targetSpeedSum: 0, angularTravel: 0,
        targetErrorBeforeAbs: 0, targetErrorAfterAbs: 0, neighbors: 0, frontCrowding: 0,
        followingSpeedLimit: 0, finiteFollowingCalls: 0, finiteSenseCalls: 0, collisionScaleSum: 0, collisionGuardCalls: 0,
        blockedTicks: 0, strideCycleLengthSum: 0, strideSamples: 0, strideCycleLengthMin: Infinity,
        strideCycleLengthMax: -Infinity, phaseResidualAbsSum: 0, phaseResidualSamples: 0 };
      const turn = turnById.get(id), sense = senseById.get(id);
      row.ticks += 1; row.distance += Math.hypot(ant.x - prior.x, ant.y - prior.y);
      row.speedSum += Math.hypot(ant.vx, ant.vy); row.targetSpeedSum += ant.targetSpeed || 0;
      row.blockedTicks += Number(ant.wasBlocked === true);
      const gait = controller.gaitController.ants.get(id);
      if (gait && Number.isFinite(gait.strideCycleLength)) {
        row.strideCycleLengthSum += gait.strideCycleLength; row.strideSamples += 1;
        row.strideCycleLengthMin = Math.min(row.strideCycleLengthMin, gait.strideCycleLength);
        row.strideCycleLengthMax = Math.max(row.strideCycleLengthMax, gait.strideCycleLength);
        if (prior.phase !== null) {
          const expected = (prior.phase + Math.hypot(ant.x - prior.x, ant.y - prior.y) / gait.strideCycleLength) % 1;
          const residual = Math.abs(expected - gait.phase);
          row.phaseResidualAbsSum += Math.min(residual, 1 - residual); row.phaseResidualSamples += 1;
        }
      }
      if (turn) { row.angularTravel += turn.angularTravel; row.targetErrorBeforeAbs += turn.errorBeforeAbs;
        row.targetErrorAfterAbs += turn.errorAfterAbs; turnById.delete(id); }
      if (sense) { row.neighbors += sense.neighbors; row.frontCrowding += sense.frontCrowding;
        if (Number.isFinite(sense.followingSpeedLimit)) { row.followingSpeedLimit += sense.followingSpeedLimit;
          row.finiteFollowingCalls += 1; }
        row.finiteSenseCalls += Number([sense.separationX, sense.separationY, sense.frontCrowding,
          sense.leftCrowding, sense.rightCrowding].every(Number.isFinite)); senseById.delete(id); }
      const scale = guardById.get(id);
      if (Number.isFinite(scale)) { row.collisionScaleSum += scale; row.collisionGuardCalls += 1; guardById.delete(id); }
    }
    return result;
  };
  return () => { controller.tick = native; layersByAnt.clear(); occupancy.sense = nativeSense;
    occupancy.constrainDisplacements = nativeGuard; delete record._turnById; delete record._currentLayers; };
}

function attachAuxiliary(controller, { mode, probeEnabled }) {
  const record = { tickEntrySnapshots: 0, layers: Object.create(null), activation: [],
    social: { observerInstalled: false, samples: [] },
    frames: [], feet: [], actualBirthMasks: [],
    motorByLayer: Object.create(null), contactsByLayer: Object.create(null),
    turning: { calls: 0, changedCalls: 0, angularVelocityAbsSum: 0, maxNativeHeadingDifference: 0,
      byLayer: Object.create(null), firstChanged: null, streamSha256: null },
    prospectiveTurning: { eligibleMaterialCalls: 0, callsBeyondCandidateCap: 0, maxSuppressionRadPerSecond: 0,
      byLayer: Object.create(null), firstSuppressed: null }, probesEnabled: probeEnabled };
  let turnById;
  // The per-tick collector installs this map before the first turn call.
  const turnHash = createHash('sha256');
  controller.subscribe(event => {
    if (event.type !== 'foot-contact') return;
    const antId = event.payload?.antId, layer = String(record._currentLayers?.get(antId) || 0);
    const row = record.contactsByLayer[layer] ||= { groups: 0, feet: 0 };
    row.groups += 1; row.feet += event.payload?.contacts?.length || 0;
  });
  const turning = attachTurningResponse(controller, { enabled: mode === 'turning' && probeEnabled,
    onTurn: row => {
      row = { ...row, layers: record._currentLayers?.get(row.agent.id) ?? row.layers };
      const layer = String(row.layers), bucket = record.turning.byLayer[layer] ||= { calls: 0, dtSeconds: 0,
        angularVelocityAbsSum: 0, changedCalls: 0 };
      const angularVelocity = row.dtSeconds > 0 ? angleDelta(row.beforeHeading, row.afterHeading) / row.dtSeconds : 0;
      const changed = Math.abs(angleDelta(row.nativeHeading, row.afterHeading)) > 1e-12;
      const nativeRate = Math.abs(row.nativeAngularVelocity), cap = 4.5 * turningFactor(row.layers);
      const suppression = Math.max(0, Math.min(nativeRate, 4.5) - Math.min(nativeRate, cap));
      const prediction = record.prospectiveTurning, prospective = prediction.byLayer[layer] ||= {
        calls: 0, callsBeyondCandidateCap: 0, maxSuppressionRadPerSecond: 0 };
      if (row.layers > 0) prediction.eligibleMaterialCalls += 1;
      prospective.calls += 1;
      if (Math.abs(angleDelta(row.beforeHeading, row.targetHeading)) > cap * row.dtSeconds) {
        prediction.callsBeyondCandidateCap += 1; prospective.callsBeyondCandidateCap += 1;
      }
      prediction.maxSuppressionRadPerSecond = Math.max(prediction.maxSuppressionRadPerSecond, suppression);
      prospective.maxSuppressionRadPerSecond = Math.max(prospective.maxSuppressionRadPerSecond, suppression);
      if (suppression > 0 && !prediction.firstSuppressed) prediction.firstSuppressed = {
        id: row.agent.id, layers: row.layers, factor: turningFactor(row.layers), dtSeconds: row.dtSeconds,
        targetHeading: row.targetHeading, beforeHeading: row.beforeHeading, nativeHeading: row.nativeHeading,
        nativeAngularVelocity: row.nativeAngularVelocity, candidateCapRadPerSecond: cap,
        predictedSuppressionRadPerSecond: suppression };
      bucket.calls += 1; bucket.dtSeconds += row.dtSeconds; bucket.angularVelocityAbsSum += Math.abs(angularVelocity);
      bucket.changedCalls += Number(changed);
      const turn = turnById.get(row.agent.id) || { errorBeforeAbs: 0, errorAfterAbs: 0, angularTravel: 0 };
      turn.errorBeforeAbs += Math.abs(angleDelta(row.beforeHeading, row.targetHeading));
      turn.errorAfterAbs += Math.abs(angleDelta(row.afterHeading, row.targetHeading));
      turn.angularTravel += Math.abs(angleDelta(row.beforeHeading, row.afterHeading));
      turnById.set(row.agent.id, turn);
      record.turning.calls += 1; record.turning.angularVelocityAbsSum += Math.abs(angularVelocity);
      record.turning.changedCalls += Number(changed);
      record.turning.maxNativeHeadingDifference = Math.max(record.turning.maxNativeHeadingDifference,
        Math.abs(angleDelta(row.nativeHeading, row.afterHeading)));
      if (changed && !record.turning.firstChanged) record.turning.firstChanged = { id: row.agent.id,
        layers: row.layers, factor: row.factor, dtSeconds: row.dtSeconds, targetHeading: row.targetHeading,
        beforeHeading: row.beforeHeading, afterHeading: row.afterHeading, nativeHeading: row.nativeHeading,
        nativeAngularVelocity: row.nativeAngularVelocity, angularVelocity };
      turnHash.update(JSON.stringify({ id: row.agent.id, layers: row.layers, factor: row.factor,
        dtSeconds: row.dtSeconds, targetHeading: row.targetHeading, beforeHeading: row.beforeHeading,
        afterHeading: row.afterHeading, nativeHeading: row.nativeHeading,
        nativeAngularVelocity: row.nativeAngularVelocity, angularVelocity }) + '\n');
    } });
  const stride = attachMaterialStride(controller.gaitController, { enabled: mode === 'stride' && probeEnabled });
  const detachTick = attachTickEntry(controller, stride, record);
  turnById = record._turnById;
  const native = controller.tick.bind(controller);
  let tick = 0;
  controller.tick = (...args) => {
    const result = native(...args);
    tick += 1;
    if (tick % 60 === 0) {
      const activation = controller.colonyActivation.getSnapshot();
      record.activation.push({ timeMs: controller.simulationTimeMs, ...activation,
        population: controller.agents.length });
      const graph = controller.dynamicSocialGraph?.getSnapshot?.();
      if (graph) { record.social.observerInstalled = true; record.social.samples.push({ timeMs: controller.simulationTimeMs,
        nodes: graph.nodes?.length ?? graph.nodeCount ?? null, edges: graph.edges?.length ?? graph.edgeCount ?? null }); }
    }
    return result;
  };
  return { record, finish() { controller.tick = native; detachTick(); turning.finish(); stride?.detach();
    record.turning.streamSha256 = turnHash.digest('hex'); } };
}

export async function selfTest() {
  for (const mode of ['turning', 'stride']) {
    const run = createController(20261005, 'G', { observe: false }), { controller } = run;
    const referenceRun = createController(20261005, 'G', { observe: false }), reference = referenceRun.controller;
    controller.materialLocomotionResistance = false;
    reference.materialLocomotionResistance = false;
    const hook = attachAuxiliary(controller, { mode, probeEnabled: false });
    try {
      assert.equal(controller.materialLocomotionResistance, false);
      assert.equal(controller.field, null, 'observer wraps pre-init controller');
      await Promise.all([controller.init(), reference.init()]);
      for (let i = 0; i < 3; i += 1) { controller.tick(1 / 60); reference.tick(1 / 60); }
      assert.equal(hook.record.tickEntrySnapshots, 3);
      assert.equal(run.rngCalls, referenceRun.rngCalls, `${mode} observer adds no RNG calls`);
      assert.deepEqual(controller.agents.map(ant => [ant.id, ant.x, ant.y, ant.heading]),
        reference.agents.map(ant => [ant.id, ant.x, ant.y, ant.heading]), `${mode} disabled shim is inert`);
    } finally { hook.finish(); await Promise.all([controller.destroy(), reference.destroy()]); }
  }
  return { status: 'PASS', checks: ['real-controller-preinit-wrap', 'neutral-slowdown-off',
    'both-disabled-candidate-shims', 'disabled-shim-state-parity', 'no-observer-rng'] };
}

async function runScenario(mode, output) {
  const hooks = [];
  const baseline = await gzipJson(resolve(ROOT, LATE));
  const expectedTicks = new Set(baseline.frames.map(frame => frame.tick));
  const sourceText = await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
  const zhangSuen = loadZhangSuen(sourceText);
  const result = await executeScenario(20261005, 'G', 600, output, null, controller => {
    controller.materialLocomotionResistance = mode === 'calibration';
    const hook = attachAuxiliary(controller, { mode: mode === 'calibration' ? 'control' : mode,
      probeEnabled: mode !== 'calibration' && mode !== 'control' });
    attachLateCapture(controller, expectedTicks, zhangSuen, hook.record);
    hooks.push(hook);
  });
  hooks.forEach(hook => hook.finish());
  await writeNew(resolve(output, 'run-summary.json'), JSON.stringify(result, null, 2) + '\n');
  await writeNew(resolve(output, 'auxiliary.json.gz'), gzipSync(JSON.stringify(hooks[0]?.record || {},
    (key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value) + '\n', { level: 9, mtime: 0 }));
  return result;
}

async function assertCalibration(current = null) {
  const path = resolve(ROOT, PACKAGE, 'calibration', 'CALIBRATION.json');
  const calibration = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(calibration.calibration, 'PASS', 'original-G calibration must pass before neutral/candidate runs');
  if (current) assert.deepEqual(calibration.sourceHashes, current, 'calibration applies to current source and tools');
  return calibration;
}

async function assertOriginalParity(output, result) {
  const rawName = 'seed20261005-G-raw.json.gz';
  const savedRawBytes = await readFile(resolve(ROOT, BASE, rawName)), actualRawBytes = await readFile(resolve(output, rawName));
  assert.deepEqual(actualRawBytes, savedRawBytes, 'original G raw gzip bytes');
  const savedSummary = JSON.parse(gunzipSync(savedRawBytes)), raw = JSON.parse(gunzipSync(actualRawBytes));
  const savedExpected = JSON.parse(await readFile(resolve(ROOT, BASE, 'SUMMARY.json'), 'utf8'))
    .scenarios.find(row => row.seed === 20261005).arms.find(row => row.arm === 'G');
  assert.equal(result.initialStateSha256, savedExpected.initialStateSha256);
  for (const key of ['positions', 'contactsBySecond', 'births']) assert.deepEqual(raw[key], savedSummary[key], `${key} original-G parity`);
  assert.equal(raw.events.contactStreamSha256, savedSummary.events.contactStreamSha256);
  assert.equal(raw.events.plateBirthStreamSha256, savedSummary.events.plateBirthStreamSha256);
  assert.deepEqual(result.finalRng, savedExpected.finalRng);
  for (const seconds of CHECKPOINTS) {
    const name = `seed20261005-G-${seconds}s.json.gz`;
    const [savedBytes, actualBytes] = await Promise.all([readFile(resolve(ROOT, BASE, name)), readFile(resolve(output, name))]);
    assert.deepEqual(actualBytes, savedBytes, `${seconds}s original G checkpoint gzip bytes`);
    const saved = JSON.parse(gunzipSync(savedBytes)), actual = JSON.parse(gunzipSync(actualBytes));
    for (const key of ['pheromone', 'surface', 'occupancy', 'persistent30sChemicalMask'])
      assert.deepEqual(actual[key], saved[key], `${seconds}s ${key} original-G parity`);
  }
}
function assertLateParity(actual, reference) {
  assert.equal(actual.frames.length, 40);
  assert.deepEqual(actual.frames.map(frame => frame.tick), reference.frames.map(frame => frame.tick));
  const ids = values => Array.from(values, (value, i) => value ? i : -1).filter(i => i >= 0);
  for (let i = 0; i < 40; i += 1) {
    const a = actual.frames[i], b = reference.frames[i];
    assert(Math.abs(a.timeMs - b.timeMs) <= 1e-6);
    for (const key of ['B', 'C', 'D', 'preMaterialLayers']) assert.deepEqual(a[key], b[key], `${key} late anchor ${a.tick}`);
    for (const key of ['E', 'F', 'S']) assert.deepEqual(ids(a[key]), ids(b[key]), `${key} late anchor ${a.tick}`);
  }
}
async function candidatePreMaterialParity(output, candidateResult, mode) {
  const commonDir = resolve(ROOT, PACKAGE, 'control');
  const common = JSON.parse(await readFile(resolve(commonDir, 'run-summary.json'), 'utf8'));
  assert.equal(candidateResult.initialStateSha256, common.initialStateSha256);
  const [a, b] = await Promise.all([gzipJson(resolve(commonDir, 'seed20261005-G-raw.json.gz')),
    gzipJson(resolve(output, 'seed20261005-G-raw.json.gz'))]);
  const firstBirth = b.births[0]?.bornAtSimulationTimeMs ?? Infinity;
  const throughSecond = Number.isFinite(firstBirth) ? Math.max(1, Math.ceil(firstBirth / 1000) - 1) : 600;
  assert.deepEqual(b.positions.filter(row => row.seconds <= throughSecond),
    a.positions.filter(row => row.seconds <= throughSecond), 'world trajectory before first material must match');
  if (mode === 'stride') {
    assert.deepEqual(b.positions, a.positions, 'stride-only intervention preserves every ant position');
    assert.deepEqual(candidateResult.finalRng, common.finalRng, 'stride-only intervention preserves RNG state');
    const [commonAux, candidateAux] = await Promise.all([gzipJson(resolve(commonDir, 'auxiliary.json.gz')),
      gzipJson(resolve(output, 'auxiliary.json.gz'))]);
    assert.deepEqual(candidateAux.activation, commonAux.activation, 'stride-only activation remains exact');
    for (const seconds of CHECKPOINTS) {
      const [controlMap, candidateMap] = await Promise.all([gzipJson(resolve(commonDir,
        `seed20261005-G-${seconds}s.json.gz`)), gzipJson(resolve(output, `seed20261005-G-${seconds}s.json.gz`))]);
      for (const key of ['pheromone', 'occupancy']) assert.deepEqual(candidateMap[key], controlMap[key],
        `stride-only ${seconds}s ${key} remains exact`);
    }
  }
  return { commonControlInitialState: true, firstMaterialTimeMs: Number.isFinite(firstBirth) ? firstBirth : null,
    preMaterialPositionParityThroughSecond: throughSecond,
    completePositionParity: Number.isFinite(firstBirth) ? null : true };
}

async function execute(mode) {
  const hashes = await currentSourceHashes();
  if (mode !== 'calibration') await assertCalibration(hashes);
  if (mode === 'turning' || mode === 'stride')
    assert(await readFile(resolve(ROOT, PACKAGE, 'control', 'run-summary.json'), 'utf8'), 'neutral common control is required');
  const pins = Object.fromEntries(Object.entries(hashes).filter(([file]) => file.startsWith('src/')));
  if (mode === 'turning' || mode === 'stride')
    assert.deepEqual(JSON.parse(await readFile(resolve(ROOT, PACKAGE, 'control', 'SOURCE-HASHES.json'), 'utf8')),
      hashes, 'candidate uses control generated by identical pinned sources and tools');
  const parent = resolve(ROOT, PACKAGE, mode), output = await mkdtemp(resolve(tmpdir(), `ant-organism-${mode}-`));
  let complete = false;
  try {
    const targets = ['run-summary.json', 'auxiliary.json.gz', 'seed20261005-G-raw.json.gz',
      ...CHECKPOINTS.map(seconds => `seed20261005-G-${seconds}s.json.gz`), 'SOURCE-HASHES.json',
      ...(mode === 'turning' || mode === 'stride' ? ['PARITY.json'] : []),
      ...(mode === 'calibration' ? ['CALIBRATION.json'] : [])];
    const { access } = await import('node:fs/promises');
    for (const file of targets) await assert.rejects(access(resolve(parent, file)), { code: 'ENOENT' }, `${file} must not exist`);
    const result = await runScenario(mode === 'control' ? 'control' : mode, output);
    const record = JSON.parse(gunzipSync(await readFile(resolve(output, 'auxiliary.json.gz'))));
    assert.equal(record.tickEntrySnapshots, 36000);
    assert.equal(result.seconds, 600);
    let parity = null;
    if (mode === 'calibration') {
      await assertOriginalParity(output, result);
      const baseline = await gzipJson(resolve(ROOT, LATE));
      assertLateParity(record, baseline);
    }
    if (mode === 'turning' || mode === 'stride') parity = await candidatePreMaterialParity(output, result, mode);
    await mkdir(parent, { recursive: true });
    for (const file of ['run-summary.json', 'auxiliary.json.gz', 'seed20261005-G-raw.json.gz',
      ...CHECKPOINTS.map(seconds => `seed20261005-G-${seconds}s.json.gz`)])
      await writeNew(resolve(parent, file), await readFile(resolve(output, file)));
    await writeNew(resolve(parent, 'SOURCE-HASHES.json'), JSON.stringify({ ...pins, ...hashes }, null, 2) + '\n');
    if (parity) await writeNew(resolve(parent, 'PARITY.json'), JSON.stringify(parity, null, 2) + '\n');
    if (mode === 'calibration') await writeNew(resolve(parent, 'CALIBRATION.json'), JSON.stringify({ calibration: 'PASS',
      initialStateSha256: result.initialStateSha256, exactRawAndCheckpointParity: true,
      sourceHashes: { ...pins, ...hashes } }, null, 2) + '\n');
    complete = true;
  } finally {
    if (complete) {
      assert(resolve(output).startsWith(resolve(tmpdir()) + '\\'), 'cleanup stays inside the named system temp directory');
      await rm(output, { recursive: true, force: true });
    }
    else console.error(`Incomplete run retained at ${output}`);
  }
}

async function checkControlReplay() {
  const current = await currentSourceHashes();
  await assertCalibration(current);
  const control = resolve(ROOT, PACKAGE, 'control'), savedSummary = JSON.parse(await readFile(resolve(control, 'run-summary.json'), 'utf8'));
  const savedHashes = JSON.parse(await readFile(resolve(control, 'SOURCE-HASHES.json'), 'utf8'));
  assert.deepEqual(current, savedHashes, 'saved neutral control source hashes match current pinned sources');
  const output = await mkdtemp(resolve(tmpdir(), 'ant-organism-control-check-'));
  let complete = false;
  try {
    const replay = await runScenario('control', output);
    assert.equal(replay.initialStateSha256, savedSummary.initialStateSha256);
    assert.deepEqual(replay.finalRng, savedSummary.finalRng);
    for (const file of ['auxiliary.json.gz', 'seed20261005-G-raw.json.gz',
      ...CHECKPOINTS.map(seconds => `seed20261005-G-${seconds}s.json.gz`)])
      assert.deepEqual(await readFile(resolve(output, file)), await readFile(resolve(control, file)), `${file} deterministic replay`);
    const receipt = { status: 'PASS', initialStateSha256: replay.initialStateSha256,
      rawSha256: hash(await readFile(resolve(output, 'seed20261005-G-raw.json.gz'))),
      auxiliarySha256: hash(await readFile(resolve(output, 'auxiliary.json.gz'))),
      checkpointSha256: Object.fromEntries(await Promise.all(CHECKPOINTS.map(async seconds => {
        const file = `seed20261005-G-${seconds}s.json.gz`;
        return [file, hash(await readFile(resolve(output, file)))];
      }))), sourceHashes: current };
    await writeStable(resolve(control, 'CONTROL-REPLAY.json'), Buffer.from(JSON.stringify(receipt, null, 2) + '\n'));
    complete = true;
    console.log(JSON.stringify({ status: 'CONTROL-REPLAY-PASS', initialState: true,
      rawAndCheckpointsByteExact: true, auxiliaryByteExact: true, sourceHashes: true }));
  } finally {
    if (complete) {
      assert(resolve(output).startsWith(resolve(tmpdir()) + '\\'), 'cleanup stays inside the named system temp directory');
      await rm(output, { recursive: true, force: true });
    }
    else console.error(`Incomplete control verification retained at ${output}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) { console.log(JSON.stringify(await selfTest(), null, 2)); return; }
  if (args.includes('--calibrate')) { await execute('calibration'); return; }
  if (args.includes('--control')) { await execute('control'); return; }
  if (args.includes('--check-control')) { await checkControlReplay(); return; }
  if (args.includes('--analyze-only')) {
    const mode = args[args.indexOf('--analyze-only') + 1];
    assert(['turning', 'stride'].includes(mode));
    const current = await currentSourceHashes();
    await assertCalibration(current);
    const data = resolve(ROOT, PACKAGE, mode), controlDir = resolve(ROOT, PACKAGE, 'control');
    const replayReceipt = JSON.parse(await readFile(resolve(controlDir, 'CONTROL-REPLAY.json'), 'utf8'));
    assert.equal(replayReceipt.status, 'PASS', 'neutral control replay must pass before analysis');
    assert.deepEqual(replayReceipt.sourceHashes, JSON.parse(await readFile(resolve(controlDir, 'SOURCE-HASHES.json'), 'utf8')),
      'control replay source authority matches saved control');
    assert.deepEqual(JSON.parse(await readFile(resolve(data, 'SOURCE-HASHES.json'), 'utf8')), current,
      'candidate artifact uses current pinned sources');
    const candidate = await gzipJson(resolve(data, 'auxiliary.json.gz'));
    const control = await gzipJson(resolve(controlDir, 'auxiliary.json.gz'));
    const controlRun = JSON.parse(await readFile(resolve(controlDir, 'run-summary.json'), 'utf8'));
    const candidateRun = JSON.parse(await readFile(resolve(data, 'run-summary.json'), 'utf8'));
    const { analyzePairedScreen } = await import('./ant-material-feedback-screen-analysis.js');
    const readMaps = async dir => Promise.all(CHECKPOINTS.map(seconds => gzipJson(resolve(dir,
      `seed20261005-G-${seconds}s.json.gz`))));
    const [controlMaps, candidateMaps, controlRaw, candidateRaw] = await Promise.all([
      readMaps(controlDir), readMaps(data), gzipJson(resolve(controlDir, 'seed20261005-G-raw.json.gz')),
      gzipJson(resolve(data, 'seed20261005-G-raw.json.gz'))]);
    const protocol = { seed: 20261005, model: 'current-G/H0', seconds: 600, tickHz: 60, audio: 'off',
      lateReferenceTicks: control.frames.map(frame => frame.tick), horizon: {
        tickCount: 36000, lateAnchorCount: 40, lateAnchorTicks: control.frames.map(frame => frame.tick),
        commonControlMode: 'material locomotion resistance off; turning and stride shims disabled' } };
    const report = analyzePairedScreen({ protocol, control, candidate, controlRaw, candidateRaw,
      controlCheckpoints: { rows: controlRun.checkpoints, timeline: controlRun.timeline, maps: controlMaps },
      candidateCheckpoints: { rows: candidateRun.checkpoints, timeline: candidateRun.timeline, maps: candidateMaps },
      controlAudit: { neutralBaseline: true }, candidateAudit: { mode } });
    await writeStable(resolve(data, 'ANALYSIS.json'), Buffer.from(JSON.stringify(report, null, 2) + '\n'));
    console.log(JSON.stringify({ status: 'ANALYSIS-COMPLETE', mode,
      lateAnchors: report.lateFrames.length, firstPositionDivergence: report.locomotionAndPopulation.firstPositionDivergence })); return;
  }
  if (args[0] === '--run' && ['turning', 'stride'].includes(args[1])) { await execute(args[1]); return; }
  throw new Error('Use --calibrate, --control, --check-control, --run turning|stride, --analyze-only turning|stride, or --self-test.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
