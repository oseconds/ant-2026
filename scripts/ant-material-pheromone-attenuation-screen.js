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
import { executeScenario } from './ant-g-production-candidate-natural.js';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-30-material-pheromone-attenuation-screen';
const BASE = 'docs/ant/evidence/2026-10-25-g-production-candidate-review/data';
const SOURCE_FILES = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js'];
const CHECKPOINTS = [30, 60, 120, 300, 600];
const WINDOWS = [{ start: 280, end: 300 }, { start: 580, end: 600 }];
const EXPECTED_SOURCE_HASHES = {
  'src/lib/agents/ant/AntController.js': 'b5a6344ebed52962a1749d612b0140b6a4249817f159758e13f166877078e9f4',
  'src/lib/agents/ant/AntAgent.js': 'ed72c33fb26f269c77853b7aa98da9e2b8a07f196bbea114583dedcd52110411',
  'src/lib/agents/ant/PheromoneField.js': 'b68e98b5d916950487da67237a0d0277451d3b930971c1d8a35e92fd7d6f9837',
  'src/lib/agents/ant/GasterDeposition.js': '0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41',
  'src/lib/agents/ant/GaitController.js': '8fb744ee696d80ad2d9c81313a0632b8e0723a56face77ebef4d799f5b51433e',
  'src/lib/agents/ant/BodyPoseController.js': '2ec4cc12c12ae301ea07056889c3be9255b1b1e155b7724cd3366278d60ace8e',
  'src/lib/agents/ant/LocalOccupancy.js': 'df22dd38e9af8078ebcb1d225ca2a5eaf579e994d2d4a00ce9ceeefa2403ff16',
  'src/lib/agents/ant/ColonyActivation.js': '3f04b44fe81f692ea295b33ce311f239083c5db01a8400e35c0bb6fb9d685abd',
  'src/lib/agents/ant/SurfaceField.js': '182b70f589bec7de427a97a4f14f3823b2bd474f6c49c90c59b17c306990c096',
  'src/lib/agents/ant/TrailPlateBirth.js': '283de374bc38cd8baae47d99d253d43b71b800edbf4747d19d06299986c12860',
  'src/lib/agents/ant/MaterialStratigraphy.js': '5cf272663ac2afb61ca94857f3636916f528d4cfb9d419e4d727c46f8c028be7'
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const p = layers => 1 - 0.50 * (1 - Math.exp(-layers / 4));
const indexAt = (x, y, width = 96, height = 96) => Math.round(y * (height - 1)) * width + Math.round(x * (width - 1));
const depositGeometry = ({ amount, amountPerUnitDistance, ...geometry }) => geometry;

function loadZhangSuen(source) {
  const math = Object.create(Math);
  math.random = () => { throw new Error('Observer must not consume RNG.'); };
  return runInNewContext(source.replace(/^export /gm, '') + '\n({ zhangSuen })', { Math: math }).zhangSuen;
}

function edgeMask(mask) {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) if (mask[i] && neighbors8(i).some(j => mask[j])) out[i] = 1;
  return out;
}

export function attachAttenuation(controller, { enabled = true, chunks = [], retainRows = true, onProgress = null } = {}) {
  const originalTick = controller.tick.bind(controller), originalAdvance = controller.gasterDeposition.advance.bind(controller.gasterDeposition);
  const originalRetire = controller.gasterDeposition.retire.bind(controller.gasterDeposition);
  const pendingDose = new Map(), emissions = [];
  const nominal = new GasterDeposition({ mode: controller.gasterDeposition.mode, spacing: controller.gasterDeposition.spacing });
  let tick = 0, inTick = false, entryLayers = new Uint8Array(96 * 96), entryByAnt = new Map(), seenIds = new Set();
  const audit = { count: 0, attenuatedCount: 0, authoredDose: 0, effectiveDose: 0, emittedDose: 0,
    retireEmittedDose: 0, firstAttenuatedChunk: null, firstPendingDoseDivergence: null,
    firstChangedEmission: null, activeAntTicks: 0, materialExposedAntTicks: 0,
    materialLayerTickHistogram: {}, nominalShadow: 'same realized travel and rear segments at authored rate; dose counterfactual only, not a control world',
    sameTickBirthsAfterAllSourceChunks: 0, sourceGeometryComparisons: 0, sha256: null };
  const chunkHash = createHash('sha256');
  controller.tick = (...args) => {
    tick += 1;
    const snap = controller.materialStratigraphy.getSnapshot();
    entryLayers = snap.stratigraphy.layerCountByCell;
    entryByAnt = new Map(controller.agents.map(ant => [ant.id, entryLayers[indexAt(ant.x, ant.y, snap.width, snap.height)] || 0]));
    assert.equal(entryByAnt.size, controller.agents.length, 'one tick-entry L lookup per active ant');
    audit.activeAntTicks += entryByAnt.size;
    for (const layers of entryByAnt.values()) {
      if (layers > 0) audit.materialExposedAntTicks += 1;
      audit.materialLayerTickHistogram[layers] = (audit.materialLayerTickHistogram[layers] || 0) + 1;
    }
    seenIds = new Set(); inTick = true;
    try {
      const result = originalTick(...args);
      assert.equal(seenIds.size, entryByAnt.size, 'each tick-entry ant advances exactly once');
      if (tick % 3600 === 0) onProgress?.(tick);
      return result;
    } finally { inTick = false; entryByAnt.clear(); }
  };
  controller.gasterDeposition.advance = (...args) => {
    const [id, distance, from, to, rate] = args;
    assert(inTick && entryByAnt.has(id), 'gaster advance must match a tick-entry active ant');
    assert(!seenIds.has(id), 'each active ant has exactly one gaster advance per tick');
    seenIds.add(id);
    const layers = entryByAnt.get(id) ?? 0, factor = enabled ? p(layers) : 1;
    const effectiveRate = rate * factor, beforePending = pendingDose.get(id) || 0;
    const adjusted = args.slice(); adjusted[4] = effectiveRate;
    const result = originalAdvance(...adjusted);
    for (const deposit of result) emissions.push({ tick, id, retirement: false, deposit });
    const nominalResult = nominal.advance(...args);
    assert.deepEqual(result.map(depositGeometry), nominalResult.map(depositGeometry), 'rate does not change native dab schedule or geometry on this realized path');
    audit.sourceGeometryComparisons += 1;
    const authoredDose = distance * rate, effectiveDose = distance * effectiveRate;
    const emittedDose = result.reduce((sum, item) => sum + (item.type === 'point' ? item.amount
      : Math.hypot(item.to.x - item.from.x, item.to.y - item.from.y) * item.amountPerUnitDistance), 0);
    const afterPending = controller.gasterDeposition.ants.get(id)?.amount || 0;
    const nominalPending = nominal.ants.get(id)?.amount || 0;
    const nominalEmittedDose = nominalResult.reduce((sum, item) => sum + (item.type === 'point' ? item.amount
      : Math.hypot(item.to.x - item.from.x, item.to.y - item.from.y) * item.amountPerUnitDistance), 0);
    pendingDose.set(id, afterPending);
    const row = { tick, id, layers, factor, distance, authoredRate: rate, effectiveRate,
      authoredDose, effectiveDose, emittedDose, pendingBefore: beforePending, pendingAfter: afterPending,
      emittedCount: result.length, types: result.map(item => item.type) };
    audit.count += 1; audit.attenuatedCount += factor < 1 ? 1 : 0;
    audit.authoredDose += authoredDose; audit.effectiveDose += effectiveDose; audit.emittedDose += emittedDose;
    audit.firstAttenuatedChunk ||= factor < 1 && authoredDose > 0 ? { tick, id, layers, factor, authoredDose } : null;
    audit.firstPendingDoseDivergence ||= Math.abs(afterPending - nominalPending) > 1e-14
      ? { tick, id, layers, candidatePendingDose: afterPending, nominalPendingDose: nominalPending } : null;
    audit.firstChangedEmission ||= Math.abs(emittedDose - nominalEmittedDose) > 1e-14
      ? { tick, id, layers, candidateEmittedDose: emittedDose, nominalEmittedDose } : null;
    chunkHash.update(JSON.stringify(row) + '\n');
    if (retainRows) chunks.push(row);
    return result;
  };
  controller.gasterDeposition.retire = (...args) => {
    const result = originalRetire(...args);
    for (const deposit of result) emissions.push({ tick, id: args[0], retirement: true, deposit });
    const nominalFlush = nominal.retire(...args);
    assert.deepEqual(result.map(depositGeometry), nominalFlush.map(depositGeometry), 'retirement preserves native release geometry');
    const [id] = args;
    audit.retireEmittedDose += result.reduce((sum, item) => sum + (item.type === 'point' ? item.amount
      : Math.hypot(item.to.x - item.from.x, item.to.y - item.from.y) * item.amountPerUnitDistance), 0);
    audit.firstChangedEmission ||= result.reduce((sum, item) => sum + (item.type === 'point' ? item.amount : 0), 0)
      !== nominalFlush.reduce((sum, item) => sum + (item.type === 'point' ? item.amount : 0), 0)
      ? { tick, id, retirementFlush: true } : null;
    pendingDose.delete(id);
    return result;
  };
  controller.subscribe?.(event => {
    if (event.type !== 'plate-birth') return;
    assert.equal(seenIds.size, entryByAnt.size, 'birth follows every source chunk in the tick');
    assert.notStrictEqual(entryLayers, controller.materialStratigraphy.getSnapshot().stratigraphy.layerCountByCell,
      'later birth replaces the layer map after this tick source reads');
    audit.sameTickBirthsAfterAllSourceChunks += 1;
  });
  return { chunks, audit, emissions, get tick() { return tick; }, get entryLayers() { return entryLayers; },
    get entryByAnt() { return entryByAnt; }, finish() {
      // executeScenario destroys the controller after its last tick; retain that tick's pending dose.
      audit.pendingFinalDose = [...pendingDose.values()].reduce((sum, amount) => sum + amount, 0);
      audit.doseConservationResidual = audit.effectiveDose - audit.emittedDose - audit.retireEmittedDose - audit.pendingFinalDose;
      audit.effectiveToAuthoredDoseRatio = audit.authoredDose ? audit.effectiveDose / audit.authoredDose : null;
      audit.materialExposureFraction = audit.activeAntTicks ? audit.materialExposedAntTicks / audit.activeAntTicks : 0;
      audit.sha256 = chunkHash.copy().digest('hex'); return audit;
    } };
}

function attachLateCapture(controller, expectedTicks, frames, feet, zhangSuen, actualBirthMasks = []) {
  const tick = controller.tick.bind(controller);
  controller.tick = (...args) => {
    const result = tick(...args), timeMs = controller.simulationTimeMs, frameTick = Math.round(timeMs / (1000 / 60));
    if (!expectedTicks.has(frameTick)) return result;
    const surface = controller.surfaceField, resultMask = controller.trailPlateBirth.buildSupportedMask(surface);
    const f = zhangSuen(resultMask.mask), s = edgeMask(f);
    const mats = controller.trailPlateBirth.getPlates().filter(plate => plate.bornAtSimulationTimeMs < timeMs);
    const layers = new Uint8Array(96 * 96);
    for (const plate of mats) for (let i = 0; i < layers.length; i += 1) if (plate.mask[i]) layers[i] += 1;
    frames.push({ timeMs, tick: frameTick, B: controller.trailPlateBirth.chemicalMemory.slice(), C: surface.values.slice(),
      D: Float32Array.from({ length: 96 * 96 }, (_, i) => Math.fround(surface.sampleSupport(i % 96 / 95,
        Math.floor(i / 96) / 95, .025))), E: resultMask.mask.slice(), F: f, S: s,
      preMaterialLayers: layers, materialIds: mats.map(x => x.id) });
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

function selfTest() {
  assert.equal(p(0), 1);
  for (let l = 0; l <= 100; l += 1) assert(p(l) >= 0.5 && p(l) <= 1 && (l === 0 || p(l) <= p(l - 1)));
  assert(Math.abs(p(4) - (1 - 0.5 * (1 - Math.exp(-1)))) < 1e-15);
  const controller = { agents: [{ id: 4, x: 0.25, y: 0.25 }],
    materialStratigraphy: { getSnapshot: () => ({ width: 96, height: 96,
      stratigraphy: { layerCountByCell: Uint8Array.from({ length: 96 * 96 }, (_, i) => i === indexAt(.25, .25) ? 4 : 0) } }) },
    tick() { const i = this.steps++; const from = { x: .2 + i * .004, y: .2 }, to = { x: .204 + i * .004, y: .2 };
      this.gasterDeposition.advance(4, .004, from, to, 10); return 17; }, steps: 0,
    gasterDeposition: new GasterDeposition({ mode: 'dab', spacing: .006 }) };
  const chunks = []; attachAttenuation(controller, { chunks });
  assert.equal(controller.tick(1 / 60), 17); controller.tick(1 / 60);
  const fixed = { x: .25, y: .25 };
  assert.equal(chunks[0].effectiveRate, 10 * p(4));
  assert.equal(chunks[1].pendingAfter + chunks[1].emittedDose, chunks[0].effectiveDose + chunks[1].effectiveDose);
  assert.equal(chunks[1].emittedCount, 1);
  assert.equal(chunks[1].types.length, 1);
  assert(Math.abs(chunks[1].pendingAfter - .002 * 10 * p(4)) < 1e-15);
  const flushed = controller.gasterDeposition.retire(4, fixed);
  assert.equal(flushed.length, 1);
  assert.equal(chunks.length, 2);
  return { attenuationBounds: true, L0Identity: true, fixedPathDoseConservation: true,
    nativeDabThresholdAndPositionPath: true, retirementUnwrapped: true, RNGCallsAdded: 0 };
}

async function json(path) { return JSON.parse(await readFile(resolve(ROOT, path), 'utf8')); }
async function gzipJson(path) { return JSON.parse(gunzipSync(await readFile(resolve(ROOT, path)))); }
async function writeNew(path, bytes) { await writeFile(path, bytes, { flag: 'wx' }); }
async function controlReplay(output, observer = null) {
  const savedRawBytes = await readFile(resolve(ROOT, `${BASE}/seed20261005-G-raw.json.gz`));
  assert.equal(sha(savedRawBytes), 'a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414');
  const [summary, sums, rawSaved] = await Promise.all([json(`${BASE}/SUMMARY.json`), json(`${BASE}/SHA256SUMS.json`),
    Promise.resolve(JSON.parse(gunzipSync(savedRawBytes)))]);
  const baseline = summary.scenarios.find(x => x.seed === 20261005).arms.find(x => x.arm === 'G');
  assert.equal(sums['seed20261005-G-raw.json.gz'], sha(savedRawBytes));
  const replay = await executeScenario(20261005, 'G', 600, output, null, observer);
  await writeNew(resolve(output, 'run-summary.json'), JSON.stringify(replay, null, 2) + '\n');
  const raw = await gzipJson(`${output}/seed20261005-G-raw.json.gz`);
  assert.equal(replay.initialStateSha256, baseline.initialStateSha256);
  assert.deepEqual(raw.positions, rawSaved.positions);
  assert.deepEqual(raw.contactsBySecond, rawSaved.contactsBySecond);
  assert.deepEqual(raw.births, rawSaved.births);
  assert.equal(raw.events.contactStreamSha256, rawSaved.events.contactStreamSha256);
  assert.equal(raw.events.plateBirthStreamSha256, rawSaved.events.plateBirthStreamSha256);
  assert.equal(replay.finalRng.state, baseline.finalRng.state);
  assert.equal(replay.finalRng.calls, baseline.finalRng.calls);
  const maps = [];
  for (const seconds of CHECKPOINTS) {
    const savedPath = `${BASE}/seed20261005-G-${seconds}s.json.gz`;
    const [saved, actual] = await Promise.all([gzipJson(savedPath), gzipJson(`${output}/seed20261005-G-${seconds}s.json.gz`)]);
    assert.equal(sums[`seed20261005-G-${seconds}s.json.gz`], sha(await readFile(resolve(ROOT, savedPath))),
      `${seconds}s checkpoint source hash`);
    assert.deepEqual(actual.pheromone, saved.pheromone); assert.deepEqual(actual.surface, saved.surface);
    assert.deepEqual(actual.occupancy, saved.occupancy);
    assert.deepEqual(actual.persistent30sChemicalMask, saved.persistent30sChemicalMask);
    const a = replay.checkpoints.find(row => row.seconds === seconds), b = baseline.checkpoints.find(row => row.seconds === seconds);
    assert.equal(a.rngState, b.rngState); assert.equal(a.rngCalls, b.rngCalls);
    maps.push({ seconds, fieldSurfaceOccupancyPersistentMaskAndRngExact: true });
  }
  return { baselineRawSha256: sha(savedRawBytes), initialState: true, positions600: true, contacts600: true,
    births600: true, contactHash: true, birthHash: true, finalRng: true, checkpoints: maps, replay, rawSaved, baseline };
}

function observedLifetimes(positionRows) {
  const seen = new Map();
  for (const row of positionRows) for (const agent of row.agents) {
    const prior = seen.get(agent.id);
    seen.set(agent.id, prior ? { ...prior, lastObservedSecond: row.seconds }
      : { id: agent.id, firstObservedSecond: row.seconds, lastObservedSecond: row.seconds });
  }
  const finalSecond = positionRows.at(-1)?.seconds ?? 0;
  return [...seen.values()].map(item => ({ ...item,
    leftCensored: item.firstObservedSecond === positionRows[0]?.seconds,
    rightCensored: item.lastObservedSecond === finalSecond,
    observedSpanSeconds: item.lastObservedSecond - item.firstObservedSecond }));
}

async function preserveRun(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const name of ['run-summary.json', 'seed20261005-G-raw.json.gz', ...CHECKPOINTS.map(seconds => `seed20261005-G-${seconds}s.json.gz`)])
    await writeNew(resolve(destination, name), await readFile(resolve(source, name)));
}

function assertLateReferenceParity(frames, reference) {
  assert.equal(frames.length, reference.frames.length, '40 frozen late analysis anchors');
  const indices = values => Array.from(values, (value, index) => value ? index : -1).filter(index => index >= 0);
  for (let i = 0; i < frames.length; i += 1) {
    const actual = frames[i], saved = reference.frames[i];
    assert.equal(actual.tick, saved.tick, `late anchor tick ${i}`);
    assert(Math.abs(actual.timeMs - saved.timeMs) <= 1e-6, `late anchor time ${i}`);
    for (const key of ['B', 'C', 'D', 'preMaterialLayers']) assert.deepEqual(Array.from(actual[key]), saved[key], `${key} anchor ${actual.tick}`);
    for (const key of ['E', 'F', 'S']) assert.deepEqual(indices(actual[key]), saved[key], `${key} anchor ${actual.tick}`);
  }
  return true;
}

async function run() {
  const data = resolve(ROOT, PACKAGE, 'data'); await mkdir(data, { recursive: true });
  const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_FILES.map(async file => [file, sha(await readFile(resolve(ROOT, file)))])));
  sourceHashes['scripts/ant-g-production-candidate-natural.js'] = sha(await readFile(resolve(ROOT, 'scripts/ant-g-production-candidate-natural.js')));
  sourceHashes['scripts/ant-late-qualified-opportunity-capture.js'] = sha(await readFile(resolve(ROOT, 'scripts/ant-late-qualified-opportunity-capture.js')));
  sourceHashes['scripts/ant-opportunity-core.js'] = sha(await readFile(resolve(ROOT, 'scripts/ant-opportunity-core.js')));
  sourceHashes['scripts/ant-material-pheromone-attenuation-screen.js'] = sha(await readFile(resolve(ROOT,
    'scripts/ant-material-pheromone-attenuation-screen.js')));
  sourceHashes['scripts/ant-material-feedback-screen-analysis.js'] = sha(await readFile(resolve(ROOT,
    'scripts/ant-material-feedback-screen-analysis.js')));
  sourceHashes['tests/ant-material-pheromone-attenuation-screen.test.js'] = sha(await readFile(resolve(ROOT,
    'tests/ant-material-pheromone-attenuation-screen.test.js')));
  for (const [file, expected] of Object.entries(EXPECTED_SOURCE_HASHES)) assert.equal(sourceHashes[file], expected, `${file} main source guard`);
  const temp = await mkdtemp(resolve(tmpdir(), 'ant-pheromone-attenuation-'));
  let complete = false;
  try {
    const controlDir = resolve(temp, 'control'), candidateDir = resolve(temp, 'candidate');
    await Promise.all([mkdir(controlDir), mkdir(candidateDir)]);
    const sourceText = await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
    const zhangSuen = loadZhangSuen(sourceText);
    const baselineInput = JSON.parse(gunzipSync(await readFile(resolve(ROOT,
      'docs/ant/evidence/2026-10-29-late-qualified-opportunity-capture/data/late-input.json.gz'))));
    const expectedTicks = new Set(baselineInput.frames.map(frame => frame.tick));
    const controlFrames = [], controlFeet = [], controlBirthMasks = [];
    let controlInstrumentation;
    console.log('control parity replay: start');
    const control = await controlReplay(controlDir, controller => {
      assert.equal(controller.materialLocomotionResistance, true, 'production 10% locomotion stays On');
      controlInstrumentation = attachAttenuation(controller, { enabled: false, retainRows: false,
        onProgress: ticks => console.log(`control progress ${ticks / 60}s`) });
      attachLateCapture(controller, expectedTicks, controlFrames, controlFeet, zhangSuen, controlBirthMasks);
    });
    const controlAudit = controlInstrumentation.finish();
    assert(Math.abs(controlAudit.doseConservationResidual) <= 1e-6, 'control chunk dose conservation');
    assert.equal(controlAudit.effectiveToAuthoredDoseRatio, 1, 'control source dose is unchanged');
    assertLateReferenceParity(controlFrames, baselineInput);
    assert.equal(controlAudit.firstPendingDoseDivergence, null, 'sham pending-dose parity');
    assert.equal(controlAudit.firstChangedEmission, null, 'sham emission parity');
    await preserveRun(controlDir, resolve(data, 'control'));
    console.log('control parity replay: PASS; candidate: start');
    const frames = [], feet = [], actualBirthMasks = [];
    let instrumentation;
    const candidate = await executeScenario(20261005, 'G', 600, candidateDir, null, controller => {
      assert.equal(controller.materialLocomotionResistance, true, 'production 10% locomotion stays On');
      instrumentation = attachAttenuation(controller, { retainRows: false,
        onProgress: ticks => console.log(`candidate progress ${ticks / 60}s`) });
      attachLateCapture(controller, expectedTicks, frames, feet, zhangSuen, actualBirthMasks);
    });
    await writeNew(resolve(candidateDir, 'run-summary.json'), JSON.stringify(candidate, null, 2) + '\n');
    assert.equal(frames.length, expectedTicks.size, 'candidate captured all baseline reference anchors');
    assert.deepEqual(frames.map(frame => frame.tick), controlFrames.map(frame => frame.tick), 'candidate and control anchor ticks match');
    for (let i = 0; i < frames.length; i += 1)
      assert(Math.abs(frames[i].timeMs - controlFrames[i].timeMs) <= 1e-6, `paired anchor time ${frames[i].tick}`);
    assert.equal(candidate.initialStateSha256, control.replay.initialStateSha256, 'candidate begins from control initial state');
    await preserveRun(candidateDir, resolve(data, 'candidate'));
    const raw = await gzipJson(`${candidateDir}/seed20261005-G-raw.json.gz`);
    const stateCounts = { ...instrumentation.finish(), retirementRateUnmodified: true };
    assert(Math.abs(stateCounts.doseConservationResidual) <= 1e-6, 'candidate chunk dose conservation');
    const analysis = { candidateActualBirths: raw.births.map(b => ({ id: b.id, timeMs: b.bornAtSimulationTimeMs, maskSha256: b.maskSha256 })),
      lateFrames: frames.map(f => ({ tick: f.tick, timeMs: f.timeMs, B: sha(Buffer.from(f.B.buffer)), C: sha(Buffer.from(f.C.buffer)),
        D: sha(Buffer.from(f.D.buffer)), E: sha(Buffer.from(f.E.buffer)), F: sha(Buffer.from(f.F.buffer)), S: sha(Buffer.from(f.S.buffer)),
        preMaterialLayers: sha(Buffer.from(f.preMaterialLayers.buffer)), materialIds: f.materialIds })),
      expectedBaselineLateAnchors: 40, candidateLateAnchorsAvailable: frames.length,
      sameAnalysisTimesAsBaseline: frames.length === expectedTicks.size && frames.every(frame => expectedTicks.has(frame.tick)),
      missingBaselineTicks: [...expectedTicks].filter(tick => !frames.some(frame => frame.tick === tick)),
      candidateActualTimesReported: true, footContacts: feet.length,
      actualBirthMaskCount: actualBirthMasks.length,
      analyzedInput: 'data/paired-input.json.gz', readOnlyAnalysis: 'run --analyze-only after capture' };
    const provenance = { schema: 'ant-material-pheromone-attenuation-screen-v1', seed: 20261005, seconds: 600,
      tickHz: 60, audio: 'off', production: 'unchanged', treatment: 'gaster rate multiplied by p(L) at tick entry; L is count at ant position',
      p: '1 - 0.50 * (1 - exp(-L/4))', L0Identity: true, lowerBound: .5,
      lookupBoundary: 'body-position cell at tick entry; fixed for that travel chunk; no cross-cell absorption or output-location multiplier',
      retirement: 'flushes only previously attenuated pending chunk dose; no second multiplier is applied at retirement',
      initialStateSha256: candidate.initialStateSha256, candidateDefaults: candidate.defaults,
      baseline: 'frozen G replay, seed20261005, 600s', sourceHashes, controlParity: {
        baselineRawSha256: control.baselineRawSha256, initialState: true, positions600: true, contacts600: true,
        births600: true, contactHash: true, birthHash: true, finalRng: true, checkpoints: control.checkpoints },
      candidate: { ...stateCounts, finalRng: { state: candidate.finalRng.state, calls: candidate.finalRng.calls },
        events: candidate.events, movement: candidate.movement,
        trailAdherence: candidate.trail.adherence,
        perSecond: candidate.timeline.map(row => ({ seconds: row.seconds, activePopulation: row.population,
          totalSpawned: row.totalSpawned, totalRetired: row.totalRetired, recruited: row.recruitedThisSecond,
          totalRealizedTravel: row.totalRealizedTravel, travelPerActiveAntSecond: row.travelPerActiveAntSecond,
          adherenceMean: row.adherenceMean, contactFeet: row.individualFeetThisSecond, plateBirths: row.plateBirthsThisSecond })),
        observedLifetimes: observedLifetimes(raw.positions),
        fieldWrites: { ...candidate.fieldWrites, authoredChunkDose: stateCounts.authoredDose,
          attenuatedChunkDose: stateCounts.effectiveDose,
          candidatePathDoseRatio: stateCounts.effectiveToAuthoredDoseRatio },
        controlSourceAcceptedDose: control.baseline.fieldWrites.acceptedDose,
        candidateSourceAcceptedDose: candidate.fieldWrites.acceptedDose,
        candidateBoundaryRejectedDose: candidate.fieldWrites.boundaryRejectedDose,
        firstObservedPositionDivergenceSecond: candidate.timeline.find((row, i) => {
          const positions = agents => agents.map(({ id, x, y }) => ({ id, x, y }));
          return JSON.stringify(positions(control.rawSaved.positions[i].agents)) !== JSON.stringify(positions(raw.positions[i].agents));
        })?.seconds ?? null,
        firstObservedContactDivergenceSecond: candidate.timeline.find((row, i) =>
          JSON.stringify(control.rawSaved.contactsBySecond[i]) !== JSON.stringify(raw.contactsBySecond[i]))?.seconds ?? null,
        checkpoints: candidate.checkpoints.map(x => ({ seconds: x.seconds, activePopulation: x.activePopulation,
          pheromoneNodeSum: x.field.sum, reconstructedIntegral: x.field.bilinearIntegral,
          material: x.material, plateCount: x.plateCount, sphereCount: x.sphereCount })) }, analysis };
    const lateInput = { baselineReferenceTicks: [...expectedTicks], frames: frames.map(frame => Object.fromEntries(
      Object.entries(frame).map(([key, value]) => [key, ArrayBuffer.isView(value) ? Array.from(value) : value]))),
      feet, actualBirthMasks };
    const pairedInput = { schema: 'ant-material-pheromone-attenuation-paired-input-v1',
      protocol: { seed: 20261005, seconds: 600, tickHz: 60, lateReferenceTicks: [...expectedTicks],
        baselineLateInputSha256: sha(await readFile(resolve(ROOT,
          'docs/ant/evidence/2026-10-29-late-qualified-opportunity-capture/data/late-input.json.gz'))) },
      controlCheckpoints: { rows: control.replay.checkpoints, timeline: control.replay.timeline },
      candidateCheckpoints: { rows: candidate.checkpoints, timeline: candidate.timeline },
      control: { frames: controlFrames.map(frame => Object.fromEntries(Object.entries(frame)
        .map(([key, value]) => [key, ArrayBuffer.isView(value) ? Array.from(value) : value]))), feet: controlFeet,
        actualBirthMasks: controlBirthMasks },
      candidate: lateInput, controlAudit, candidateAudit: stateCounts };
    await writeNew(resolve(data, 'source-emissions.json.gz'), gzipSync(JSON.stringify({
      schema: 'ant-native-gaster-emissions-v1', tickHz: 60,
      meaning: 'Native deposit requests after per-chunk accumulation; retirement already includes its attenuated residual. Boundary acceptance belongs to PheromoneField.',
      control: controlInstrumentation.emissions, candidate: instrumentation.emissions
    }) + '\n', { level: 9 }));
    await writeNew(resolve(data, 'paired-input.json.gz'), gzipSync(JSON.stringify(pairedInput) + '\n', { level: 9, mtime: 0 }));
    await writeNew(resolve(data, 'RESULTS.json'), JSON.stringify({ provenance, analysis, candidate: provenance.candidate }, null, 2) + '\n');
    await writeNew(resolve(data, 'SOURCE-HASHES.json'), JSON.stringify(sourceHashes, null, 2) + '\n');
    complete = true;
    console.log(JSON.stringify({ status: 'CANDIDATE-COMPLETE', ticks: 36000, candidateChunks: stateCounts.count, lateFrames: frames.length }));
  } finally {
    const tempRoot = resolve(tmpdir()), tempPath = resolve(temp);
    assert(tempPath.startsWith(tempRoot + '\\'), 'temporary replay cleanup remains inside the system temp folder');
    if (complete) await rm(tempPath, { recursive: true, force: true });
    else console.error(`Incomplete attempt preserved for diagnosis: ${tempPath}`);
  }
}

async function analyzeOnly() {
  const data = resolve(ROOT, PACKAGE, 'data');
  const { analyzePairedScreen } = await import('./ant-material-feedback-screen-analysis.js');
  const input = JSON.parse(gunzipSync(await readFile(resolve(data, 'paired-input.json.gz'))));
  const readRun = async name => ({ raw: await gzipJson(`${data}/${name}/seed20261005-G-raw.json.gz`),
    maps: await Promise.all(CHECKPOINTS.map(seconds => gzipJson(`${data}/${name}/seed20261005-G-${seconds}s.json.gz`))) });
  const [control, candidate] = await Promise.all([readRun('control'), readRun('candidate')]);
  const report = analyzePairedScreen({ protocol: input.protocol, control: input.control, candidate: input.candidate,
    controlRaw: control.raw, candidateRaw: candidate.raw,
    controlCheckpoints: { ...input.controlCheckpoints, maps: control.maps },
    candidateCheckpoints: { ...input.candidateCheckpoints, maps: candidate.maps },
    controlAudit: input.controlAudit, candidateAudit: input.candidateAudit });
  const path = resolve(data, 'ANALYSIS.json'), contents = JSON.stringify(report, null, 2) + '\n';
  try { assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), report, 'existing analysis matches saved-input recomputation'); }
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
