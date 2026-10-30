import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { neighbors8 } from './ant-opportunity-core.js';
import { attachAttenuation } from './ant-material-pheromone-attenuation-screen.js';
import { createController, executeScenario } from './ant-g-production-candidate-natural.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-30-material-chemical-residence-screen';
const BASE = 'docs/ant/evidence/2026-10-25-g-production-candidate-review/data';
const LATE_INPUT = 'docs/ant/evidence/2026-10-29-late-qualified-opportunity-capture/data/late-input.json.gz';
const CHECKPOINTS = [30, 60, 120, 300, 600];
const WIDTH = 316, HEIGHT = 316, MATERIAL_SIZE = 96, LN2 = Math.LN2, HALF_LIFE = 15;
const SOURCE_FILES = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const p = layers => 1 - 0.50 * (1 - Math.exp(-layers / 4));
const probeDecayExponent = layers => -LN2 * (1 / 60) / HALF_LIFE * p(layers);
const indexAt = (x, y, width = 96, height = 96) => Math.round(y * (height - 1)) * width + Math.round(x * (width - 1));
const writeNew = (path, bytes) => writeFile(path, bytes, { flag: 'wx' });
const gzipJson = async path => JSON.parse(gunzipSync(await readFile(path)));

function loadZhangSuen(source) {
  const math = Object.create(Math); math.random = () => { throw new Error('Observer must not consume RNG.'); };
  return runInNewContext(source.replace(/^export /gm, '') + '\n({ zhangSuen })', { Math: math }).zhangSuen;
}
function edgeMask(mask) {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) if (mask[i] && neighbors8(i).some(j => mask[j])) out[i] = 1;
  return out;
}
function attachLateCapture(controller, expectedTicks, frames, feet, zhangSuen, actualBirthMasks) {
  const originalTick = controller.tick.bind(controller);
  controller.tick = (...args) => {
    const result = originalTick(...args), timeMs = controller.simulationTimeMs, tick = Math.round(timeMs / (1000 / 60));
    if (!expectedTicks.has(tick)) return result;
    const surface = controller.surfaceField, B = controller.trailPlateBirth.buildSupportedMask(surface).mask;
    const F = zhangSuen(B), S = edgeMask(F);
    const plates = controller.trailPlateBirth.getPlates().filter(plate => plate.bornAtSimulationTimeMs < timeMs);
    const layers = new Uint8Array(96 * 96);
    for (const plate of plates) for (let i = 0; i < layers.length; i += 1) if (plate.mask[i]) layers[i] += 1;
    frames.push({ timeMs, tick, B: controller.trailPlateBirth.chemicalMemory.slice(), C: surface.values.slice(),
      D: Float32Array.from({ length: 96 * 96 }, (_, i) => Math.fround(surface.sampleSupport(i % 96 / 95,
        Math.floor(i / 96) / 95, .025))), E: B, F, S, preMaterialLayers: layers, materialIds: plates.map(x => x.id) });
    return result;
  };
  controller.subscribe(event => {
    if (event.type === 'plate-birth' && event.payload?.mask) actualBirthMasks.push({ id: event.payload.id,
      bornAtSimulationTimeMs: event.payload.bornAtSimulationTimeMs, mask: Array.from(event.payload.mask) });
    if (event.type === 'foot-contact' && Array.isArray(event.payload?.contacts)) for (const contact of event.payload.contacts)
      if (Number.isFinite(contact.position?.x) && Number.isFinite(contact.position?.y))
        feet.push({ timeMs: event.payload.simulationTimeMs, x: contact.position.x, y: contact.position.y });
  });
}
async function json(path) { return JSON.parse(await readFile(resolve(ROOT, path), 'utf8')); }
async function preserveRun(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const name of ['run-summary.json', 'seed20261005-G-raw.json.gz', ...CHECKPOINTS.map(seconds => `seed20261005-G-${seconds}s.json.gz`)])
    await writeNew(resolve(destination, name), await readFile(resolve(source, name)));
}
async function controlReplay(output, observer) {
  const savedRawBytes = await readFile(resolve(ROOT, `${BASE}/seed20261005-G-raw.json.gz`));
  assert.equal(sha(savedRawBytes), 'a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414');
  const [summary, sums, rawSaved] = await Promise.all([json(`${BASE}/SUMMARY.json`), json(`${BASE}/SHA256SUMS.json`),
    Promise.resolve(JSON.parse(gunzipSync(savedRawBytes)))]);
  const baseline = summary.scenarios.find(x => x.seed === 20261005).arms.find(x => x.arm === 'G');
  assert.equal(sums['seed20261005-G-raw.json.gz'], sha(savedRawBytes));
  const replay = await executeScenario(20261005, 'G', 600, output, null, observer);
  await writeNew(resolve(output, 'run-summary.json'), JSON.stringify(replay, null, 2) + '\n');
  const raw = await gzipJson(resolve(output, 'seed20261005-G-raw.json.gz'));
  assert.equal(replay.initialStateSha256, baseline.initialStateSha256);
  assert.deepEqual(raw.positions, rawSaved.positions); assert.deepEqual(raw.contactsBySecond, rawSaved.contactsBySecond);
  assert.deepEqual(raw.births, rawSaved.births);
  assert.equal(raw.events.contactStreamSha256, rawSaved.events.contactStreamSha256);
  assert.equal(raw.events.plateBirthStreamSha256, rawSaved.events.plateBirthStreamSha256);
  assert.equal(replay.finalRng.state, baseline.finalRng.state); assert.equal(replay.finalRng.calls, baseline.finalRng.calls);
  const maps = [];
  for (const seconds of CHECKPOINTS) {
    const savedPath = `${BASE}/seed20261005-G-${seconds}s.json.gz`;
    const [saved, actual] = await Promise.all([gzipJson(resolve(ROOT, savedPath)), gzipJson(resolve(output, `seed20261005-G-${seconds}s.json.gz`))]);
    assert.equal(sums[`seed20261005-G-${seconds}s.json.gz`], sha(await readFile(resolve(ROOT, savedPath))));
    assert.deepEqual(actual.pheromone, saved.pheromone); assert.deepEqual(actual.surface, saved.surface);
    assert.deepEqual(actual.occupancy, saved.occupancy); assert.deepEqual(actual.persistent30sChemicalMask, saved.persistent30sChemicalMask);
    const a = replay.checkpoints.find(row => row.seconds === seconds), b = baseline.checkpoints.find(row => row.seconds === seconds);
    assert.equal(a.rngState, b.rngState); assert.equal(a.rngCalls, b.rngCalls);
    maps.push({ seconds, fieldSurfaceOccupancyPersistentMaskAndRngExact: true });
  }
  return { baselineRawSha256: sha(savedRawBytes), replay, rawSaved, baseline,
    checkpoints: maps, controlParity: { baselineRawSha256: sha(savedRawBytes), initialState: true, positions600: true,
      contacts600: true, births600: true, contactHash: true, birthHash: true, finalRng: true, checkpoints: maps } };
}
function assertLateReferenceParity(frames, reference) {
  assert.equal(frames.length, reference.frames.length, '40 frozen late analysis anchors');
  const indices = values => Array.from(values, (value, index) => value ? index : -1).filter(index => index >= 0);
  for (let i = 0; i < frames.length; i += 1) {
    const actual = frames[i], saved = reference.frames[i];
    assert.equal(actual.tick, saved.tick); assert(Math.abs(actual.timeMs - saved.timeMs) <= 1e-6);
    for (const key of ['B', 'C', 'D', 'preMaterialLayers']) assert.deepEqual(Array.from(actual[key]), saved[key], `${key} anchor ${actual.tick}`);
    for (const key of ['E', 'F', 'S']) assert.deepEqual(indices(actual[key]), saved[key], `${key} anchor ${actual.tick}`);
  }
}

export function attachResidence(controller, { enabled = true } = {}) {
  const originalTick = controller.tick.bind(controller);
  const audit = { enabled, decayCalls: 0, decaySeconds: 0, conditionedNodeVisits: 0,
    firstConditionedDecay: null, firstArrayReplacement: null, firstEmptyIdentity: null, firstDisabledIdentity: null,
    arrayReplacementCount: 0, tickEntryLayerArrayChanges: 0, nativeBookkeeping: 'original field.decay called once per wrapped decay',
    authoredEffectiveRatio: 1, firstAttenuatedSource: null };
  let tick = 0, field = null, nativeDecay = null, nodeToCell = null, layersRef = null;
  let nodeFactors = null, conditioned = null, beforeDecay = null;
  const installField = () => {
    field = controller.field;
    assert(field, 'residence wrapper installs after controller.init creates the field');
    nativeDecay = field.decay.bind(field);
    nodeToCell = new Uint32Array(field.width * field.height);
    for (let y = 0; y < field.height; y += 1) for (let x = 0; x < field.width; x += 1)
      nodeToCell[y * field.width + x] = Math.round(y / (field.height - 1) * 95) * 96
        + Math.round(x / (field.width - 1) * 95);
    field.decay = dtSeconds => {
      audit.decayCalls += 1;
      audit.decaySeconds += dtSeconds;
      if (!enabled || conditioned.length === 0) {
        if (conditioned.length === 0) audit.firstEmptyIdentity ||= { tick, conditionedNodes: 0 };
        if (!enabled) audit.firstDisabledIdentity ||= { tick, conditionedNodes: conditioned.length, enabled };
        return nativeDecay(dtSeconds);
      }
      const values = field.values;
      for (let j = 0; j < conditioned.length; j += 1) beforeDecay[j] = values[conditioned[j]];
      nativeDecay(dtSeconds);
      for (let j = 0; j < conditioned.length; j += 1) {
        const i = conditioned[j];
        values[i] = Math.fround(beforeDecay[j] * Math.exp(-LN2 * dtSeconds / HALF_LIFE * nodeFactors[i]));
      }
      audit.conditionedNodeVisits += conditioned.length;
      audit.firstConditionedDecay ||= { tick, conditionedNodes: conditioned.length, dtSeconds };
    };
  };
  controller.tick = (...args) => {
    if (!field) installField();
    tick += 1;
    const next = controller.materialStratigraphy.getSnapshot().stratigraphy.layerCountByCell;
    if (next !== layersRef) {
      if (layersRef) {
        audit.firstArrayReplacement ||= { tick, previousLength: layersRef.length, nextLength: next.length };
        audit.arrayReplacementCount += 1;
        audit.tickEntryLayerArrayChanges += 1;
      }
      layersRef = next;
      nodeFactors = new Float64Array(nodeToCell.length);
      const indices = [];
      for (let i = 0; i < nodeToCell.length; i += 1) {
        const layers = next[nodeToCell[i]] || 0;
        nodeFactors[i] = p(layers);
        if (layers > 0) indices.push(i);
      }
      conditioned = Uint32Array.from(indices);
      beforeDecay = new Float32Array(conditioned.length);
    }
    return originalTick(...args);
  };
  return audit;
}

export function selfTest() {
  const layers = new Uint16Array(96 * 96);
  layers[0] = 4; layers[indexAt(.5, .5)] = 2;
  let map = layers;
  const field = new PheromoneField({ width: WIDTH, height: HEIGHT, decayHalfLifeSeconds: HALF_LIFE, maxValue: 8 });
  const nativeDecay = field.decay.bind(field), nativeMetrics = { calls: 0, seconds: 0 };
  field.decay = dt => { nativeMetrics.calls += 1; nativeMetrics.seconds += dt; nativeDecay(dt); };
  const mixedNode = 158 * WIDTH + 158, bareNode = field.values.length - 1;
  const dt = 1 / 60;
  field.values[0] = 1; field.values[mixedNode] = .75;
  const expected0 = Math.fround(1 * Math.exp(probeDecayExponent(4)));
  const expected1 = Math.fround(.75 * Math.exp(probeDecayExponent(2)));
  const bareExpected = Math.fround(.5 * Math.exp(-LN2 * dt / HALF_LIFE));
  field.values[bareNode] = .5;
  let replacement = false;
  const controller = { field, materialStratigraphy: { getSnapshot: () => ({ stratigraphy: { layerCountByCell: map } }) },
    tick() { field.decay(dt); if (!replacement) {
      map = Uint16Array.from(map); map[map.length - 1] = 9; replacement = true;
    } } };
  const audit = attachResidence(controller);
  controller.tick();
  assert.equal(field.values[0], expected0);
  assert.equal(field.values[mixedNode], expected1);
  assert.equal(field.values[bareNode], bareExpected);
  const beforeSecond = field.values[0];
  controller.tick();
  assert(field.values[0] < beforeSecond, 'positive material contracts chemical without a source');
  assert.equal(field.values[bareNode], Math.fround(bareExpected * Math.exp(probeDecayExponent(9))),
    'same-tick array replacement affects the next decay only');
  assert.equal(audit.decayCalls, 2);
  assert.equal(nativeMetrics.calls, 2);
  assert.equal(nativeMetrics.seconds, 2 / 60);
  assert.equal(audit.arrayReplacementCount, 1);
  assert(replacement);
  assert.equal(audit.firstAttenuatedSource, null);
  assert.equal(audit.authoredEffectiveRatio, 1);
  const controlField = new PheromoneField({ width: WIDTH, height: HEIGHT, decayHalfLifeSeconds: HALF_LIFE, maxValue: 8 });
  controlField.values[0] = 1;
  const control = { field: controlField, materialStratigraphy: { getSnapshot: () => ({ stratigraphy: { layerCountByCell: layers } }) }, tick() { controlField.decay(1 / 60); } };
  const controlAudit = attachResidence(control, { enabled: false }); control.tick();
  assert.equal(controlField.values[0], Math.fround(Math.exp(-LN2 * dt / HALF_LIFE)));
  assert.equal(controlAudit.firstDisabledIdentity.enabled, false);
  assert.equal(controlAudit.authoredEffectiveRatio, 1);
  return { status: 'PASS', checks: ['native-field-float32-kernel', 'mixed-layer-probe-equivalence', 'bare-native-decay',
    'positive-residence-contraction', 'array-replacement-at-next-tick', 'no-future-birth-leak',
    'disabled-control-source-audit', 'no-rng'] };
}

export async function lifecycleTest() {
  const run = createController(20261005, 'G', { observe: false }), { controller, fieldStats } = run;
  const residence = attachResidence(controller), source = attachAttenuation(controller, { enabled: false, retainRows: false });
  assert.equal(controller.field, null, 'observer attaches before init creates its field');
  try {
    await controller.init();
    const dt = 1 / 60, field = controller.field;
    controller.materialStratigraphy.layerCountByCell[0] = 4;
    field.values[0] = 1;
    controller.tick(dt);
    assert.equal(residence.decayCalls, 1);
    assert.equal(residence.firstConditionedDecay.tick, 1);
    assert.equal(field.values[0], Math.fround(Math.exp(probeDecayExponent(4))));
    assert.equal(fieldStats.decayCalls, 1, 'production observer still sees the native decay call');
    assert.equal(fieldStats.decaySeconds, dt);
    const sourceAudit = source.finish();
    assert.equal(sourceAudit.effectiveToAuthoredDoseRatio, 1);
    assert.equal(sourceAudit.firstAttenuatedChunk, null);
    return { status: 'PASS', checks: ['attach-before-init', 'lazy-native-field-install',
      'native-decay-observer-preserved', 'unattenuated-source-audit'] };
  } finally { controller.destroy(); }
}

export async function verifySourceAuthority() {
  const p3Source = await readFile(resolve(ROOT, 'scripts/ant-material-pheromone-attenuation-screen.js'), 'utf8');
  const pinBlock = p3Source.match(/const EXPECTED_SOURCE_HASHES = \{([\s\S]*?)\n\};/);
  assert(pinBlock, 'Pass 3 source authority pins must exist');
  const pinnedSources = Object.fromEntries([...pinBlock[1].matchAll(/'([^']+)': '([a-f0-9]{64})'/g)]
    .map(([, file, hash]) => [file, hash]));
  assert.equal(Object.keys(pinnedSources).length, SOURCE_FILES.length, 'all native source files must have Pass 3 pins');
  const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_FILES.map(async file => [file, sha(await readFile(resolve(ROOT, file)))])));
  for (const file of SOURCE_FILES) assert.equal(sourceHashes[file], pinnedSources[file], `${file} must match Pass 3 source authority`);
  return sourceHashes;
}

async function run() {
  const sourceHashes = await verifySourceAuthority();
  const data = resolve(ROOT, PACKAGE, 'data'); await mkdir(data, { recursive: true });
  for (const file of ['scripts/ant-g-production-candidate-natural.js', 'scripts/ant-late-qualified-opportunity-capture.js',
    'scripts/ant-opportunity-core.js', 'scripts/ant-material-feedback-screen-analysis.js',
    'scripts/ant-material-pheromone-attenuation-screen.js', 'scripts/ant-material-chemical-residence-screen.js',
    'scripts/ant-material-chemical-residence-probe.js', 'tests/ant-material-chemical-residence-screen.test.js'])
    sourceHashes[file] = sha(await readFile(resolve(ROOT, file)));
  const temp = await mkdtemp(resolve(tmpdir(), 'ant-chemical-residence-')); let complete = false;
  try {
    const controlDir = resolve(temp, 'control'), candidateDir = resolve(temp, 'candidate');
    await Promise.all([mkdir(controlDir), mkdir(candidateDir)]);
    const baseInput = JSON.parse(gunzipSync(await readFile(resolve(ROOT, LATE_INPUT))));
    const expectedTicks = new Set(baseInput.frames.map(frame => frame.tick));
    const sourceText = await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
    const zhangSuen = loadZhangSuen(sourceText);
    const controlFrames = [], controlFeet = [], controlBirthMasks = [];
    let sourceControlAudit, controlResidenceAudit;
    console.log('control parity replay: start');
    const control = await controlReplay(controlDir, controller => {
      assert.equal(controller.materialLocomotionResistance, true);
      controlResidenceAudit = attachResidence(controller, { enabled: false });
      sourceControlAudit = attachAttenuation(controller, { enabled: false, retainRows: false });
      attachLateCapture(controller, expectedTicks, controlFrames, controlFeet, zhangSuen, controlBirthMasks);
    });
    const sourceAudit = sourceControlAudit.finish();
    assertLateReferenceParity(controlFrames, baseInput);
    assert.equal(sourceAudit.effectiveToAuthoredDoseRatio, 1);
    assert.equal(sourceAudit.firstAttenuatedChunk, null);
    assert.equal(controlResidenceAudit.decayCalls, 36000);
    await preserveRun(controlDir, resolve(data, 'control'));
    const frames = [], feet = [], actualBirthMasks = [];
    let residenceAudit, candidateSourceAudit;
    console.log('control parity replay: PASS; residence candidate: start');
    const candidate = await executeScenario(20261005, 'G', 600, candidateDir, null, controller => {
      assert.equal(controller.materialLocomotionResistance, true);
      residenceAudit = attachResidence(controller);
      candidateSourceAudit = attachAttenuation(controller, { enabled: false, retainRows: false });
      attachLateCapture(controller, expectedTicks, frames, feet, zhangSuen, actualBirthMasks);
    });
    await writeNew(resolve(candidateDir, 'run-summary.json'), JSON.stringify(candidate, null, 2) + '\n');
    assert.equal(frames.length, expectedTicks.size, 'all 40 baseline late anchors captured');
    assert.deepEqual(frames.map(frame => frame.tick), controlFrames.map(frame => frame.tick));
    for (let i = 0; i < frames.length; i += 1) assert(Math.abs(frames[i].timeMs - controlFrames[i].timeMs) <= 1e-6);
    assert.equal(candidate.initialStateSha256, control.replay.initialStateSha256);
    await preserveRun(candidateDir, resolve(data, 'candidate'));
    const raw = await gzipJson(resolve(candidateDir, 'seed20261005-G-raw.json.gz'));
    const candidateSourceAuditResult = candidateSourceAudit.finish();
    assert.equal(residenceAudit.decayCalls, 36000);
    assert(Math.abs(residenceAudit.decaySeconds - 600) < 1e-8);
    assert.equal(candidate.fieldWrites.decayCalls, 36000);
    assert(Math.abs(candidate.fieldWrites.decaySeconds - 600) < 1e-8);
    assert.equal(candidateSourceAuditResult.effectiveToAuthoredDoseRatio, 1);
    assert.equal(candidateSourceAuditResult.firstAttenuatedChunk, null);
    assert.equal(residenceAudit.authoredEffectiveRatio, 1);
    assert.equal(residenceAudit.firstAttenuatedSource, null);
    const analysis = { candidateActualBirths: raw.births.map(b => ({ id: b.id, timeMs: b.bornAtSimulationTimeMs, maskSha256: b.maskSha256 })),
      lateFrames: frames.map(f => ({ tick: f.tick, timeMs: f.timeMs, B: sha(Buffer.from(f.B.buffer)), C: sha(Buffer.from(f.C.buffer)),
        D: sha(Buffer.from(f.D.buffer)), E: sha(Buffer.from(f.E.buffer)), F: sha(Buffer.from(f.F.buffer)), S: sha(Buffer.from(f.S.buffer)),
        preMaterialLayers: sha(Buffer.from(f.preMaterialLayers.buffer)), materialIds: f.materialIds })),
      expectedBaselineLateAnchors: 40, candidateLateAnchorsAvailable: frames.length, actualBirthMaskCount: actualBirthMasks.length };
    const protocol = { seed: 20261005, model: 'current-G/H0', seconds: 600, tickHz: 60, audio: 'off',
      lateReferenceTicks: [...expectedTicks], baselineRawSha256: control.baselineRawSha256,
      baselineLateInputSha256: sha(await readFile(resolve(ROOT, LATE_INPUT))) };
    const encodeFrames = rows => rows.map(frame => Object.fromEntries(Object.entries(frame)
      .map(([key, value]) => [key, ArrayBuffer.isView(value) ? Array.from(value) : value])));
    const pairedInput = { schema: 'ant-material-chemical-residence-screen-paired-input-v1', protocol,
      controlCheckpoints: { rows: control.replay.checkpoints, timeline: control.replay.timeline },
      candidateCheckpoints: { rows: candidate.checkpoints, timeline: candidate.timeline },
      control: { frames: encodeFrames(controlFrames), feet: controlFeet, actualBirthMasks: controlBirthMasks },
      candidate: { frames: encodeFrames(frames), feet, actualBirthMasks }, sourceControlAudit: sourceAudit,
      candidateSourceAudit: candidateSourceAuditResult, controlResidenceAudit, residenceAudit, analysis };
    await writeNew(resolve(data, 'paired-input.json.gz'), gzipSync(JSON.stringify(pairedInput) + '\n', { level: 9, mtime: 0 }));
    const provenance = { schema: 'ant-material-chemical-residence-screen-v1', ...protocol, production: 'unchanged',
      treatment: 'material-conditioned decay of existing field chemistry at tick entry',
      p: '1 - 0.50 * (1 - exp(-L/4))', halfLife: '15/p(L) seconds', maximumHalfLifeSeconds: 30,
      materialLookup: 'each 316 field node maps to nearest 96 material cell, captured at tick entry',
      sourceAudit: { enabled: false, authoredEffectiveRatio: 1, firstAttenuatedSource: null,
        control: sourceAudit, candidate: candidateSourceAuditResult },
      controlDecayObserver: controlResidenceAudit, decay: residenceAudit, initialStateSha256: candidate.initialStateSha256,
      controlParity: { baselineRawSha256: control.baselineRawSha256, initialState: true, positions600: true, contacts600: true,
        births600: true, contactHash: true, birthHash: true, finalRng: true, checkpoints: control.checkpoints },
      candidate: { finalRng: candidate.finalRng, events: candidate.events, movement: candidate.movement,
        fieldWrites: candidate.fieldWrites, timeline: candidate.timeline,
        checkpoints: candidate.checkpoints.map(row => ({ seconds: row.seconds, activePopulation: row.activePopulation,
          pheromoneNodeSum: row.field.sum, reconstructedIntegral: row.field.bilinearIntegral,
          material: row.material, plateCount: row.plateCount, sphereCount: row.sphereCount })) }, analysis, sourceHashes };
    await writeNew(resolve(data, 'RESULTS.json'), JSON.stringify({ provenance, analysis }, null, 2) + '\n');
    await writeNew(resolve(data, 'SOURCE-HASHES.json'), JSON.stringify(sourceHashes, null, 2) + '\n');
    complete = true;
    console.log(JSON.stringify({ status: 'CANDIDATE-COMPLETE', ticks: 36000, lateFrames: frames.length }));
  } finally {
    const tempRoot = resolve(tmpdir()), tempPath = resolve(temp);
    assert(tempPath.startsWith(tempRoot + '\\'), 'temporary replay cleanup remains inside system temp');
    if (complete) await rm(tempPath, { recursive: true, force: true });
    else console.error(`Incomplete attempt preserved for diagnosis: ${tempPath}`);
  }
}

async function analyzeOnly() {
  const data = resolve(ROOT, PACKAGE, 'data');
  const { analyzePairedScreen } = await import('./ant-material-feedback-screen-analysis.js');
  const input = JSON.parse(gunzipSync(await readFile(resolve(data, 'paired-input.json.gz'))));
  const readRun = async name => ({ raw: await gzipJson(resolve(data, name, 'seed20261005-G-raw.json.gz')),
    maps: await Promise.all(CHECKPOINTS.map(seconds => gzipJson(resolve(data, name, `seed20261005-G-${seconds}s.json.gz`)))) });
  const [control, candidate] = await Promise.all([readRun('control'), readRun('candidate')]);
  const report = analyzePairedScreen({ protocol: input.protocol, control: input.control, candidate: input.candidate,
    controlRaw: control.raw, candidateRaw: candidate.raw,
    controlCheckpoints: { ...input.controlCheckpoints, maps: control.maps },
    candidateCheckpoints: { ...input.candidateCheckpoints, maps: candidate.maps },
    controlAudit: input.sourceControlAudit, candidateAudit: input.candidateSourceAudit });
  const path = resolve(data, 'ANALYSIS.json'), contents = JSON.stringify(report, null, 2) + '\n';
  try { assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), report); }
  catch (error) { if (error.code !== 'ENOENT') throw error; await writeNew(path, contents); }
  console.log(JSON.stringify({ status: 'ANALYSIS-COMPLETE', frames: report.lateFrames.length,
    firstPositionDivergence: report.locomotionAndPopulation.firstPositionDivergence,
    firstContactDivergence: report.locomotionAndPopulation.firstContactDivergence }));
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--self-test')) { console.log(JSON.stringify(selfTest(), null, 2)); return; }
  if (args.has('--analyze-only')) { await analyzeOnly(); return; }
  if (!args.has('--run') && args.size) throw new Error('Use --self-test, --run, or --analyze-only.');
  await run();
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
