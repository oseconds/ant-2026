import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { executeScenario, createController, CHECKPOINTS } from './ant-g-production-candidate-natural.js';
import { verifyBaselineInputs, verifySourceAuthority } from './ant-material-organism-feedback-screen.js';
import { attachResponseTiming, runProbe as timingProbe, selfTest as timingTest } from './ant-material-response-timing-probes.js';
import { attachFlowVelocity, runProbe as flowProbe, selfTest as flowTest } from './ant-material-flow-velocity-probes.js';
import { attachArticulation, runProbe as articulationProbe, selfTest as articulationTest } from './ant-material-articulation-probe.js';
import { neighbors8 } from './ant-opportunity-core.js';
import { analyzePairedScreen } from './ant-material-feedback-screen-analysis.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const PACKAGE = 'docs/ant/evidence/2026-10-30-organism-feedback-candidate-survey';
const DATA = resolve(ROOT, PACKAGE, 'data');
const PRIOR = resolve(ROOT, 'docs/ant/evidence/2026-10-30-material-organism-feedback-discovery/data/control');
const KINDS = ['adherence', 'following', 'decision', 'articulation', 'velocity'];
const TOOLS = ['scripts/ant-organism-feedback-survey.js', 'scripts/ant-material-response-timing-probes.js',
  'scripts/ant-material-flow-velocity-probes.js', 'scripts/ant-material-articulation-probe.js',
  'scripts/ant-g-production-candidate-natural.js', 'scripts/ant-material-organism-feedback-screen.js',
  'scripts/ant-material-feedback-screen-analysis.js', 'scripts/ant-opportunity-core.js',
  'tests/ant-material-response-timing-probes.test.js', 'tests/ant-material-flow-velocity-probes.test.js',
  'tests/ant-material-articulation-probe.test.js', 'tests/ant-organism-feedback-survey.test.js'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async path => JSON.parse((path.endsWith('.gz') ? gunzipSync(await readFile(path)) : await readFile(path)).toString());
const encoded = x => JSON.stringify(x, (_key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value);
async function save(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const bytes = Buffer.from(encoded(value) + '\n');
  await writeFile(path, path.endsWith('.gz') ? gzipSync(bytes, { level: 9, mtime: 0 }) : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
async function stable(path, value) {
  try { assert.deepEqual(await read(path), JSON.parse(encoded(value)), `deterministic ${path}`); }
  catch (e) { if (e.code !== 'ENOENT') throw e; await save(path, value); }
}
export function aggregate(bucket, row) {
  bucket.calls = (bucket.calls || 0) + 1;
  const exposed = row.layers > 0;
  bucket.materialCalls = (bucket.materialCalls || 0) + Number(exposed);
  bucket.flags ||= {}; bucket.numeric ||= {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'boolean') {
      const b = bucket.flags[key] ||= { true: 0, materialTrue: 0 };
      b.true += Number(value); b.materialTrue += Number(value && exposed);
    }
    if (typeof value === 'number' && !['antId', 'timeMs', 'timeSeconds'].includes(key) && Number.isFinite(value)) {
      const b = bucket.numeric[key] ||= { n: 0, sum: 0, min: value, max: value, materialN: 0, materialSum: 0 };
      b.n++; b.sum += value; b.min = Math.min(b.min, value); b.max = Math.max(b.max, value);
      if (exposed) { b.materialN++; b.materialSum += value; }
    }
  }
}

function attachSurvey(controller, kind, expectedTicks, thin) {
  const layers = new Map(), ids = new Map(), hooks = [], beforeTick = controller.tick, rearSamples = new Map();
  const record = { protocol: { kind, slowdown: false, residence: false }, frames: [], feet: [], actualBirthMasks: [],
    activation: [], candidates: {}, motor: {}, clocks: [], sourceGeometry: { calls: 0, authoredDose: 0, travel: 0 },
    tickEntrySnapshots: 0, social: { observerInstalled: false } };
  const streams = new Map(KINDS.map(k => [k, createHash('sha256')]));
  const sample = k => row => {
    const stage = row.stage || 'response', key = `${k}:${stage}`;
    const group = record.candidates[key] ||= { total: {}, seconds: {}, firstBinding: null, firstChanged: null };
    // F receives the native observed-agent copy; it uses the tick-entry per-ID map.
    row = { ...row, timeMs: controller.simulationTimeMs };
    row.applied = kind === k;
    row.actualChanged = row.applied && Boolean(row.changed || row.rearDelta > 1e-12);
    if (Number.isFinite(row.nativeValue) && Number.isFinite(row.prospectiveValue)) row.prospectiveValueDelta = row.prospectiveValue - row.nativeValue;
    if (k === 'velocity') row.binding = row.prospectiveDeltaV > 1e-12;
    if (k === 'following' && stage === 'final-target') row.binding = Math.abs(row.prospectiveDesiredSpeedDelta) > 1e-12;
    if (k === 'following' && stage === 'final-target')
      assert(row.applied ? row.actualMatchesProspective : row.actualMatchesNative, 'following target shadow matches actual consumer');
    if (k === 'articulation') rearSamples.set(row.antId, row);
    if (k === 'decision') {
      row.prospectiveExpiryDelay = Math.max(0, Math.min(row.prospectiveValue, row.committedAfter) - Math.min(row.nativeValue, row.committedAfter));
      row.potentialClockDelay = row.prospectiveExpiryDelay > 1e-12;
      row.binding = row.potentialClockDelay;
    }
    aggregate(group.total, row);
    const second = Math.floor(controller.simulationTimeMs / 1000);
    aggregate(group.seconds[second] ||= {}, row);
    const prospective = row.binding || row.rearDelta > 1e-12 || row.prospectiveDelta > 1e-12;
    if (row.layers > 0 && prospective && !group.firstBinding) group.firstBinding = row;
    if (row.layers > 0 && row.actualChanged && !group.firstChanged) group.firstChanged = row;
    streams.get(k).update(JSON.stringify(row) + '\n');
  };
  hooks.push(attachResponseTiming(controller, { kind: 'adherence', enabled: kind === 'adherence', layersByAnt: layers, onSample: sample('adherence') }));
  hooks.push(attachResponseTiming(controller, { kind: 'decision', enabled: kind === 'decision', layersByAnt: layers, onSample: sample('decision') }));
  hooks.push(attachFlowVelocity(controller, { kind: 'following', enabled: kind === 'following', layersByAnt: layers, onSample: sample('following') }));
  hooks.push(attachFlowVelocity(controller, { kind: 'velocity', enabled: kind === 'velocity', layersByAnt: layers, onSample: sample('velocity') }));
  hooks.push(attachArticulation(controller.bodyPoseController, { enabled: kind === 'articulation', layersByAnt: ids, onSample: sample('articulation') }));
  controller.subscribe(event => {
    if (event.type === 'foot-contact') for (const c of event.payload.contacts || []) record.feet.push({
      timeMs: event.payload.simulationTimeMs, x: c.position.x, y: c.position.y });
    if (event.type === 'plate-birth') record.actualBirthMasks.push({ id: event.payload.id,
      bornAtSimulationTimeMs: event.payload.bornAtSimulationTimeMs, mask: Array.from(event.payload.mask) });
  });
  const nativeDeposit = controller.gasterDeposition.advance;
  const sourceHash = createHash('sha256');
  controller.gasterDeposition.advance = function (id, distance, from, to, rate) {
    record.sourceGeometry.calls++; record.sourceGeometry.authoredDose += distance * rate; record.sourceGeometry.travel += distance;
    sourceHash.update(JSON.stringify([id, distance, from, to, rate]) + '\n');
    const rear = rearSamples.get(id);
    if (rear && rear.layers > 0) {
      const project = toRear => {
        const copy = Object.assign(Object.create(Object.getPrototypeOf(this)), this, { ants: new Map() });
        if (this.ants.has(id)) copy.ants.set(id, { ...this.ants.get(id) });
        return nativeDeposit.call(copy, id, distance, from, toRear, rate);
      };
      const a = project({ x: rear.nativeRearX, y: rear.nativeRearY });
      const b = project({ x: rear.prospectiveRearX, y: rear.prospectiveRearY });
      assert.equal(a.length, b.length, 'gaster relaxation does not change native emission schedule');
      const pointRows = a.map((a, i) => ({ a, b: b[i] })).filter(({ a }) => a.type === 'point');
      for (const { a, b } of pointRows) assert.equal(a.amount, b.amount, 'gaster relaxation does not change dab dose');
      const changes = pointRows.map(({ a, b }) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y));
      sample('articulation')({ stage: 'actual-dab-shadow', antId: id, layers: rear.layers,
        emitted: a.length > 0, dabs: pointRows.length, changedDabs: changes.filter(x => x > 0).length,
        maxDabDelta: changes.length ? Math.max(...changes) : 0, sumDabDelta: changes.reduce((a, b) => a + b, 0),
        binding: changes.some(x => x > 1e-12), authoredDoseExact: true });
    }
    return nativeDeposit.call(this, id, distance, from, to, rate);
  };
  const native = controller.tick;
  controller.tick = (...args) => {
    const snapshot = controller.materialStratigraphy.getSnapshot(); layers.clear(); ids.clear(); rearSamples.clear();
    const prior = controller.agents.map(a => ({ a, x: a.x, y: a.y, heading: a.heading, vx: a.vx, vy: a.vy }));
    for (const { a } of prior) {
      const i = Math.round(a.y * 95) * 96 + Math.round(a.x * 95);
      const L = snapshot.stratigraphy.layerCountByCell[i] || 0; layers.set(a, L); ids.set(a.id, L);
    }
    record.tickEntrySnapshots++;
    const result = native.apply(controller, args);
    for (const { a, x, y, heading, vx, vy } of prior) {
      const row = { layers: layers.get(a), speed: Math.hypot(a.vx, a.vy), targetSpeed: a.targetSpeed,
        adherence: a.trailAdherence, confidence: a.trailConfidence,
        angularRate: Math.abs(a.angularVelocity), distance: Math.hypot(a.x - x, a.y - y),
        velocityChange: Math.hypot(a.vx - vx, a.vy - vy), decisionRemaining: a.decisionRemaining,
        committedRemaining: a.committedRemaining, hesitation: a.hesitationRemaining > 0, blocked: a.wasBlocked === true };
      aggregate(record.motor, row);
    }
    const tick = Math.round(controller.simulationTimeMs / (1000 / 60));
    if (tick % 60 === 0) record.activation.push({ timeMs: controller.simulationTimeMs,
      ...controller.colonyActivation.getSnapshot(), population: controller.agents.length });
    if (expectedTicks.has(tick)) {
      const surface = controller.surfaceField, E = controller.trailPlateBirth.buildSupportedMask(surface).mask, F = thin(E);
      const S = Uint8Array.from(F, (v, i) => Number(v && neighbors8(i).some(j => F[j])));
      const plates = controller.trailPlateBirth.getPlates().filter(p => p.bornAtSimulationTimeMs < controller.simulationTimeMs);
      const preMaterialLayers = new Uint8Array(96 * 96);
      for (const p of plates) for (let i = 0; i < p.mask.length; i++) if (p.mask[i]) preMaterialLayers[i]++;
      record.frames.push({ tick, timeMs: controller.simulationTimeMs, B: controller.trailPlateBirth.chemicalMemory.slice(),
        C: surface.values.slice(), D: Float32Array.from({ length: 96 * 96 }, (_, i) => Math.fround(surface.sampleSupport(i % 96 / 95,
          Math.floor(i / 96) / 95, .025))), E, F, S, preMaterialLayers, materialIds: plates.map(p => p.id) });
    }
    return result;
  };
  return { record, finish() {
    controller.tick = native;
    for (const hook of hooks.reverse()) hook.finish();
    controller.tick = beforeTick; controller.gasterDeposition.advance = nativeDeposit;
    record.sourceGeometry.requestSha256 = sourceHash.digest('hex');
    record.sampleStreamSha256 = Object.fromEntries([...streams].map(([k, h]) => [k, h.digest('hex')]));
  } };
}

async function pins() {
  const source = await verifySourceAuthority(), baseline = await verifyBaselineInputs();
  for (const file of TOOLS) source[file] = hash(await readFile(resolve(ROOT, file)));
  const prior = {};
  for (const file of ['run-summary.json', 'auxiliary.json.gz', 'seed20261005-G-raw.json.gz',
    ...CHECKPOINTS.map(t => `seed20261005-G-${t}s.json.gz`)]) prior[file] = hash(await readFile(resolve(PRIOR, file)));
  return { productionMain: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785', researchParent: '0ce11a439a6de97110471ab04ca692aa8350c186', source, baseline, prior };
}
function summaryStable(s) { const copy = JSON.parse(JSON.stringify(s)); delete copy.wallSeconds; return copy; }
async function assertNeutral(output, result) {
  for (const file of ['seed20261005-G-raw.json.gz', ...CHECKPOINTS.map(t => `seed20261005-G-${t}s.json.gz`)])
    assert.deepEqual(await readFile(resolve(output, file)), await readFile(resolve(PRIOR, file)), `neutral byte parity ${file}`);
  assert.deepEqual(summaryStable(result), summaryStable(await read(resolve(PRIOR, 'run-summary.json'))), 'neutral full serialized summary');
}
async function run(kind, rerun = false) {
  assert(kind === 'observe' || KINDS.includes(kind));
  const before = await pins(), output = resolve(DATA, rerun ? 'observe-replay' : kind);
  await mkdir(output, { recursive: true });
  assert.equal((await readdir(output)).length, 0, 'refuse overwriting any run');
  if (kind !== 'observe') {
    const gate = await read(resolve(DATA, 'GATES.json'));
    assert.equal(gate[kind]?.decision, 'PROMOTE TO WORLD SCREEN', 'explicit pre-result promotion required');
    const obsPins = await read(resolve(DATA, 'observe/PROVENANCE.json')); assert.deepEqual(before, obsPins, 'stable probe sources since neutral');
    const replay = await read(resolve(DATA, 'observe-replay/PARITY.json')); assert.equal(replay.auxiliaryByteExact, true);
  }
  await save(resolve(output, 'PROVENANCE.json'), before);
  const reference = await read(resolve(PRIOR, 'auxiliary.json.gz'));
  const source = await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
  const thin = runInNewContext(source.replace(/^export /gm, '') + '\nzhangSuen', { Math });
  let hook;
  const result = await executeScenario(20261005, 'G', 600, output, null, controller => {
    controller.materialLocomotionResistance = false;
    hook = attachSurvey(controller, kind, new Set(reference.frames.map(f => f.tick)), thin);
  });
  hook.finish();
  assert.deepEqual(await pins(), before, 'no mid-run source/input changes');
  await save(resolve(output, 'run-summary.json'), result);
  await save(resolve(output, 'auxiliary.json.gz'), hook.record);
  let receipt;
  if (kind === 'observe') {
    await assertNeutral(output, result);
    const serialized = JSON.parse(encoded(hook.record));
    for (const key of ['frames', 'feet', 'actualBirthMasks', 'activation']) assert.deepEqual(serialized[key], reference[key], `prior neutral ${key}`);
    receipt = { status: 'PASS', neutralNativeBytesExact: true, neutralSummaryExactExceptWall: true, priorAuxChannelsExact: true };
    if (rerun) {
      assert.deepEqual(await readFile(resolve(output, 'auxiliary.json.gz')), await readFile(resolve(DATA, 'observe/auxiliary.json.gz')), 'new observer deterministic auxiliary bytes');
      receipt.auxiliaryByteExact = true;
    }
  } else {
    const raw = await read(resolve(output, 'seed20261005-G-raw.json.gz')), baseline = await read(resolve(PRIOR, 'seed20261005-G-raw.json.gz'));
    assert.deepEqual(result.initialStateSha256, (await read(resolve(PRIOR, 'run-summary.json'))).initialStateSha256);
    const first = raw.births[0].bornAtSimulationTimeMs;
    const until = Math.ceil(first / 1000) - 1;
    assert.deepEqual(raw.positions.filter(r => r.seconds <= until), baseline.positions.filter(r => r.seconds <= until));
    receipt = { status: 'PASS', initialStateExact: true, preMaterialPositionParityThroughSecond: until, firstPlateTimeMs: first };
  }
  assert.equal(hook.record.tickEntrySnapshots, 36000); assert.equal(hook.record.frames.length, 40);
  await save(resolve(output, 'PARITY.json'), receipt);
  console.log(JSON.stringify({ kind, output, wallSeconds: result.wallSeconds, ...receipt }));
}

async function analyze(kind) {
  assert(KINDS.includes(kind));
  const output = resolve(DATA, kind), current = await pins();
  assert.deepEqual(await read(resolve(output, 'PROVENANCE.json')), current);
  const loadArm = async dir => ({ aux: await read(resolve(dir, 'auxiliary.json.gz')), summary: await read(resolve(dir, 'run-summary.json')),
    raw: await read(resolve(dir, 'seed20261005-G-raw.json.gz')), maps: await Promise.all(CHECKPOINTS.map(t => read(resolve(dir, `seed20261005-G-${t}s.json.gz`)))) });
  const [c, t] = await Promise.all([loadArm(PRIOR), loadArm(output)]);
  const protocol = { seed: 20261005, seconds: 600, tickHz: 60, audio: 'off', slowdown: false, residence: false,
    kind, lateReferenceTicks: c.aux.frames.map(f => f.tick) };
  const analysis = analyzePairedScreen({ protocol, control: c.aux, candidate: t.aux, controlRaw: c.raw, candidateRaw: t.raw,
    controlCheckpoints: { rows: c.summary.checkpoints, timeline: c.summary.timeline, maps: c.maps },
    candidateCheckpoints: { rows: t.summary.checkpoints, timeline: t.summary.timeline, maps: t.maps } });
  await stable(resolve(output, 'ANALYSIS.json'), analysis);
  console.log(JSON.stringify({ kind, analysis: 'PASS', firstPosition: analysis.locomotionAndPopulation.firstPositionDivergence }));
}
export async function selfTest() {
  const b = {}; aggregate(b, { layers: 4, changed: true, delta: 1 }); aggregate(b, { layers: 0, changed: false, delta: 0 });
  assert.equal(b.calls, 2); assert.equal(b.flags.changed.materialTrue, 1); assert.equal(b.numeric.delta.materialSum, 1);
  const a = createController(20261005, 'G', { observe: false }), c = createController(20261005, 'G', { observe: false });
  a.controller.materialLocomotionResistance = c.controller.materialLocomotionResistance = false;
  const hook = attachSurvey(a.controller, 'observe', new Set(), x => x);
  await a.controller.init(); await c.controller.init();
  for (let i = 0; i < 4; i++) { a.controller.tick(1 / 60); c.controller.tick(1 / 60); }
  assert.equal(a.rngCalls, c.rngCalls); assert.deepEqual(a.controller.agents.map(x => x.getSnapshot()), c.controller.agents.map(x => x.getSnapshot()));
  hook.finish(); await a.controller.destroy(); await c.controller.destroy();
  return { aggregate: true, neutralNoRng: true, preinit: true, ...timingTest(), ...flowTest(), ...articulationTest() };
}
async function main() {
  const [cmd, kind] = process.argv.slice(2);
  if (cmd === '--self-test') { console.log(JSON.stringify(await selfTest())); return; }
  if (cmd === '--probes') { for (const [k, fn] of Object.entries({ timing: timingProbe, flowVelocity: flowProbe, articulation: articulationProbe }))
    await stable(resolve(DATA, 'probes', `${k}.json`), fn()); return; }
  if (cmd === '--observe') return run('observe');
  if (cmd === '--check-observe') return run('observe', true);
  if (cmd === '--run') return run(kind);
  if (cmd === '--analyze') return analyze(kind);
  throw new Error('Use --self-test, --probes, --observe, --check-observe, --run kind or --analyze kind');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
