import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serialize, deserialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { countedLcg } from './ant-material-causal-tail.js';
import { AntPheromoneProvenanceObserver } from './lib/antPheromoneProvenanceObserver.js';
import { freezeWorld, thawWorld, makeAuthorSampler } from './lib/antMotorFrozenWorld.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASE = resolve(ROOT, 'docs/ant/evidence/2026-10-28-retired-pheromone-motor-inscription');
const DT = 1 / 60;
const sha = b => createHash('sha256').update(b).digest('hex');
const exact = v => JSON.stringify(v, (_k, x) => Object.is(x, -0) ? { $negativeZero: true } : x);
const hash = v => sha(exact(canonical(v)));
const copy = v => structuredClone(v);
const sourcePaths = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/LocalOccupancy.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/ColonyActivation.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'scripts/ant-material-causal-tail.js',
  'scripts/lib/antPheromoneProvenanceObserver.js', 'scripts/lib/antMotorFrozenWorld.js'];

await mkdir(resolve(BASE, 'data'), { recursive: true });
const packetPath = resolve(BASE, 'data/fork.v8.gz');
let packet;
if (process.argv.includes('--check') || process.argv.includes('--analyze')) {
  const zipped = await readFile(packetPath);
  const receipt = JSON.parse(await readFile(resolve(BASE, 'data/capture.json'), 'utf8'));
  assert.equal(sha(zipped), receipt.packetSha256);
  packet = deserialize(gunzipSync(zipped));
} else {
  await assert.rejects(readFile(packetPath), { code: 'ENOENT' });
  try { packet = await acquire(); }
  catch (error) {
    await writeFile(resolve(BASE, 'data/acquisition-failure.json'), JSON.stringify({ status: 'INCONCLUSIVE', error: error.stack }, null, 2));
    throw error;
  }
  const raw = serialize(packet), zipped = gzipSync(raw, { level: 9 });
  await writeFile(packetPath, zipped);
  await writeFile(resolve(BASE, 'data/capture.json'), JSON.stringify({ ...packet.capture,
    packetSha256: sha(zipped), rawSha256: sha(raw), compressedBytes: zipped.length,
    nodeVersion: process.version, sourceHashes: packet.sourceHashes }, null, 2) + '\n');
}
const replayCorrections = [];
for (const [p, h] of Object.entries(packet.sourceHashes)) {
  const executed = await readFile(resolve(ROOT, p));
  if (sha(executed) !== h) {
    assert.equal(p, 'scripts/lib/antMotorFrozenWorld.js', 'unexpected source drift');
    const old = await readFile(resolve(BASE, 'data/attempts/v8-alias-01/antMotorFrozenWorld.js.txt'));
    assert.equal(sha(old), h);
    assert.equal(executed.toString(), old.toString()
      .replace('deserialize(buffer)', 'deserialize(Buffer.from(buffer))')
      .replace('return serialize(state);', 'return Buffer.from(serialize(state));'),
    'only explicit frozen-buffer isolation may differ from captured helper');
    replayCorrections.push({ path: p, capturedSha256: h, executedSha256: sha(executed),
      correction: 'Independent buffers on freeze/thaw; original disk input unchanged' });
  }
}
const inputBefore = sha(serialize(packet));
const semanticBefore = hash(packet);
const snapshotBefore = deserialize(Buffer.from(serialize(packet)));
const buffersBefore = Object.fromEntries([['world', packet.world], ['alive', packet.inputs.alive],
  ['retired', packet.inputs.retired], ['full', packet.inputs.full]].map(([k, v]) =>
  [k, Buffer.from(Buffer.from(v.buffer, v.byteOffset, v.byteLength))]));
let first, second;
const originalRandom = Math.random;
try {
  Math.random = () => { throw Error('Frozen motor replay consumed global RNG'); };
  first = exact(analyze(packet)); second = exact(analyze(packet));
} finally { Math.random = originalRandom; }
assert.equal(first, second, 'deterministic frozen full-world duplicate');
assert.equal(hash(packet), semanticBefore, 'frozen packet semantic content unchanged');
assert.deepEqual(packet, snapshotBefore, 'strict frozen packet content unchanged');
for (const [k, before] of Object.entries(buffersBefore)) {
  const v = k === 'world' ? packet.world : packet.inputs[k];
  assert.deepEqual(Buffer.from(v.buffer, v.byteOffset, v.byteLength), before, `frozen ${k} bytes unchanged`);
}
const captureReceipt = JSON.parse(await readFile(resolve(BASE, 'data/capture.json'), 'utf8'));
assert.equal(sha(await readFile(packetPath)), captureReceipt.packetSha256, 'disk packet bytes unchanged');
const target = resolve(BASE, 'data/results.json');
if (process.argv.includes('--check')) assert.equal(sha(await readFile(target)), sha(first + '\n'));
else {
  await assert.rejects(readFile(target), { code: 'ENOENT' });
  await writeFile(target, first + '\n');
  await writeFile(resolve(BASE, 'data/replay-validation.json'), JSON.stringify({ deterministicDuplicate: true,
    frozenInputUnchanged: true, strictDeepAndRawBuffersUnchanged: true, diskPacketUnchanged: true,
    v8ReserializationHashBefore: inputBefore, v8ReserializationHashAfter: sha(serialize(packet)),
    replayCorrections, resultsSha256: sha(first + '\n'),
    runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))) }, null, 2) + '\n');
}
const result = JSON.parse(first);
console.log(JSON.stringify({ status: result.status, selection: result.selection, validity: result.validity,
  oneTick: result.oneTick, firsts: result.firsts, stop: result.stop }, null, 2));

async function acquire() {
  const start = performance.now();
  const plain = new AntController({ random: countedLcg(20261005) });
  const observed = new AntController({ random: countedLcg(20261005) });
  const observer = new AntPheromoneProvenanceObserver().attach(observed);
  await plain.init(); await observed.init();
  let ticks = 0, focal;
  const checkpoints = [];
  function parity(full = false) {
    assert.deepEqual(plain.agents, observed.agents);
    for (const k of ['simulationTimeMs', 'totalSpawned', 'totalRetired', 'nextAgentId', 'nextSpawnTimeMs'])
      assert.equal(plain[k], observed[k], k);
    assert.equal(plain.random.state(), observed.random.state());
    assert.equal(plain.random.calls, observed.random.calls);
    if (full) { assert.equal(worldHash(plain), worldHash(observed)); checkpoints.push({ ticks, worldHash: worldHash(plain) }); }
  }
  parity(true);
  while (ticks < 7200) {
    assert.ok(performance.now() - start < 180000, '180s acquisition boundary');
    assert.ok(process.memoryUsage().rss < 1.5 * 1024 ** 3, '1.5GiB acquisition boundary');
    if (ticks >= 3600) {
      focal = plain.agents.filter(a => a.decisionRemaining <= DT || a.committedRemaining <= DT)
        .sort((a, b) => numericId(a.id) - numericId(b.id))[0];
      if (focal) break;
    }
    plain.tick(DT); observed.tick(DT); ticks++;
    parity(ticks % 1800 === 0);
  }
  assert.ok(focal, 'no prospectively eligible focal before120s');
  parity(true);
  const world = freezeWorld(plain);
  assert.equal(worldHash(thawWorld(world)), worldHash(plain), 'complete world codec roundtrip');
  let inputs;
  const decay = observed.field.decay;
  observed.field.decay = function (dt) {
    const out = decay.call(this, dt);
    const alive = new Float64Array(this.values.length), retired = new Float64Array(this.values.length);
    let maxResidual = 0;
    for (let i = 0; i < alive.length; i++) {
      const node = observer.cellSummary(i);
      alive[i] = node.aliveValue; retired[i] = node.retiredValue;
      maxResidual = Math.max(maxResidual, Math.abs(this.values[i] - alive[i] - retired[i]));
    }
    inputs = { width: this.width, height: this.height, alive, retired, full: this.values.slice(),
      fieldTimeSeconds: observer.fieldTimeSeconds, maxNodeResidual: maxResidual };
    makeAuthorSampler(inputs, 'fullAuthorSum'); makeAuthorSampler(inputs, 'noRetired');
    return out;
  };
  const selection = { tick: ticks + 1, entryModelSeconds: plain.simulationTimeMs / 1000,
    focalId: focal.id, focalIndex: plain.agents.indexOf(focal), population: plain.agents.length,
    decisionRemaining: focal.decisionRemaining, committedRemaining: focal.committedRemaining,
    spawnDue: plain.nextSpawnTimeMs !== null && plain.nextSpawnTimeMs <= plain.simulationTimeMs + DT * 1000 + 1e-9 };
  const natural = step(plain, focal.id, null, 'F', 0);
  observed.tick(DT); ticks++;
  parity(true);
  const receipt = observer.receipt();
  assert.equal(receipt.validity.ok, true); assert.equal(receipt.field.capTouches, 0);
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async p => [p, sha(await readFile(resolve(ROOT, p)))])));
  const packet = { schema: 'ant-retired-pheromone-motor-fork-v1', world, inputs, selection, natural,
    sourceHashes, capture: { main: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785',
      parent: '58382d4075a170b4ca1c63cbd75f0b196067a13b', seed: 20261005, hz: 60,
      heading: 'production H0', audio: 'Off; no bridge', ticks, checkpoints,
      exactAgentScheduleRngPrefixParity: true, fullWorldCheckpointsExact: true,
      provenance: receipt.validity, capTouches: receipt.field.capTouches,
      acquisitionWallSeconds: (performance.now() - start) / 1000 } };
  await plain.destroy(); await observed.destroy();
  return packet;
}

function analyze(packet) {
  const start = performance.now();
  const worlds = Object.fromEntries(['F', 'Fhat', 'Rhat'].map(k => [k, thawWorld(packet.world)]));
  const records = Object.fromEntries(Object.keys(worlds).map(k => [k, []]));
  const firsts = { motor: null, contactLocationOrTime: null, contactPayload: null,
    acceptedPheromone: null, collisionScale: null, otherAgent: null, rngSchedule: null, scheduling: null };
  let stop, oneTick;
  for (let n = 0; n <= 120; n++) {
    assert.ok(performance.now() - start < 30000, '30s frozen replay boundary');
    const rows = Object.fromEntries(Object.entries(worlds).map(([k, c]) => {
      const row = step(c, packet.selection.focalId, n === 0 ? packet.inputs : null, k, n);
      records[k].push(row); return [k, row];
    }));
    const a = rows.Fhat, b = rows.Rhat;
    const motor = motorDiff(a, b), sham = motorDiff(rows.F, a);
    const rngAligned = isDeepStrictEqual(a.randomTrace, b.randomTrace)
      && isDeepStrictEqual(a.rngAfter, b.rngAfter);
    const shamRngAligned = isDeepStrictEqual(rows.F.randomTrace, a.randomTrace)
      && isDeepStrictEqual(rows.F.rngAfter, a.rngAfter);
    if (n === 0) {
      assert.deepEqual(rows.F, packet.natural, 'F must reproduce executed natural full tick exactly');
      assert.ok(shamRngAligned, 'author-sum sham changed random schedule');
      assert.equal(optionIndex(rows.F), optionIndex(a), 'author-sum sham changed selected option family');
      for (const [k, limit] of Object.entries({ position: 1e-8, velocity: 1e-7, heading: 1e-6, angularVelocity: 6e-5 }))
        assert.ok(sham[k] <= limit, `author-sum numeric sham ${k} exceeds preregistered ceiling`);
      if (motor.different) for (const k of ['position', 'velocity', 'heading', 'angularVelocity', 'postCollisionDisplacement'])
        if (motor[k] > 0) assert.ok(motor[k] > sham[k], `primary ${k} is not separated from numeric sham`);
      oneTick = { motor, numericSham: sham, policy: { F: policySummary(rows.F), Fhat: policySummary(a), Rhat: policySummary(b) },
        inputSummary: inputSummary(packet.inputs, a.queries),
        primaryRngAligned: rngAligned, fullShamExact: true };
    }
    if (!rngAligned && firsts.rngSchedule === null) firsts.rngSchedule = n;
    if (!isDeepStrictEqual(a.scheduling, b.scheduling) && firsts.scheduling === null) firsts.scheduling = n;
    if (!isDeepStrictEqual(a.collision, b.collision) && firsts.collisionScale === null
      && !isDeepStrictEqual(a.collision.scales, b.collision.scales)) firsts.collisionScale = n;
    const otherDifferent = a.agents.filter(x => x.id !== packet.selection.focalId)
      .some(x => !isDeepStrictEqual(x, b.agents.find(y => y.id === x.id)));
    if (otherDifferent && firsts.otherAgent === null) firsts.otherAgent = n;
    if (motor.different && firsts.motor === null) firsts.motor = n;
    if (!isDeepStrictEqual(contactGeometry(a.contacts), contactGeometry(b.contacts)) && firsts.contactLocationOrTime === null)
      firsts.contactLocationOrTime = n;
    if (!isDeepStrictEqual(a.contacts, b.contacts) && firsts.contactPayload === null) firsts.contactPayload = n;
    if (!isDeepStrictEqual(a.deposits, b.deposits) && (a.deposits.some(d => d.nodes.length) || b.deposits.some(d => d.nodes.length))
      && firsts.acceptedPheromone === null) firsts.acceptedPheromone = n;
    if (!rngAligned) { stop = { tickOffset: n, reason: 'shared RNG context/count/value divergence; same-tick inscription censored' }; break; }
    if (n === 0 && !motor.different) { stop = { tickOffset: n, reason: 'no one-tick realized motor difference; no continuation' }; break; }
    if (!a.focalAfter || !b.focalAfter) { stop = { tickOffset: n, reason: 'focal retirement' }; break; }
    if (firsts.contactLocationOrTime !== null && firsts.acceptedPheromone !== null) {
      stop = { tickOffset: n, reason: 'contact geometry and accepted pheromone inscription differences observed' }; break;
    }
    if (n === 120) stop = { tickOffset: n, reason: '2s continuation boundary' };
  }
  const cleanInscription = firsts.rngSchedule === null
    && firsts.contactLocationOrTime !== null && firsts.acceptedPheromone !== null;
  const status = !oneTick.primaryRngAligned ? 'INCONCLUSIVE'
    : !oneTick.motor.different ? 'BOUNDED NEGATIVE'
      : cleanInscription ? 'SUPPORTED' : 'PARTIAL / MIXED';
  return { schema: 'ant-retired-pheromone-motor-results-v1', status, selection: packet.selection,
    validity: { exactNaturalFullSham: true, symmetricNonnegativeAuthors: true,
      localAndWideInterceptorsAppliedForOneTick: true,
      localRetiredInputExcited: oneTick.inputSummary.senseLocalTrail.retiredReadSum > 0,
      wideRetiredInputExcited: oneTick.inputSummary.senseTrail.retiredReadSum > 0,
      realStoredFieldUnchangedByIntervention: true,
      noRngReset: true, numericShamAndPrimaryReportedSeparately: true },
    oneTick, firsts, stop, records };
}

function step(c, focalId, inputs, condition, offset) {
  const restores = [], events = [], contacts = [], deposits = [], randomTrace = [], policy = [], queries = [];
  const rngBefore = { state: c.random.state(), calls: c.random.calls };
  const focalBefore = copy(c.agents.find(a => a.id === focalId));
  let context = null, collision, inputAligned = false;
  const replace = (object, key, value) => {
    const d = Object.getOwnPropertyDescriptor(object, key);
    restores.push(() => d ? Object.defineProperty(object, key, d) : delete object[key]);
    object[key] = value;
  };
  const random = c.random;
  const tracedRandom = () => { const value = random(); randomTrace.push({ context, value }); return value; };
  tracedRandom.state = random.state;
  Object.defineProperty(tracedRandom, 'calls', { get: () => random.calls });
  replace(c, 'random', tracedRandom);
  const sampler = inputs && condition !== 'F' ? makeAuthorSampler(inputs,
    condition === 'Fhat' ? 'fullAuthorSum' : 'noRetired') : null;
  for (const key of ['senseLocalTrail', 'senseTrail']) {
    const original = c[key];
    replace(c, key, function (agent, ...args) {
      if (agent.id !== focalId) return original.call(this, agent, ...args);
      if (inputs && !inputAligned) {
        assert.deepEqual(this.field.values, inputs.full, 'frozen post-decay input aligns with actual replay scalar nodes');
        inputAligned = true;
      }
      const facade = Object.create(this);
      facade.field = { sample: (x, y) => {
        const value = sampler ? sampler.sample(x, y) : this.field.sample(x, y);
        assert.ok(Number.isFinite(value) && value >= 0);
        queries.push({ kind: key, x, y, value }); return value;
      } };
      return AntController.prototype[key].call(facade, agent, ...args);
    });
  }
  const intention = c.updateIntention;
  replace(c, 'updateIntention', function (agent, agents, info, dt, local) {
    context = `intention:${agent.id}`;
    const before = agent.id === focalId ? copy(agent) : null;
    try { return intention.call(this, agent, agents, info, dt, local); }
    finally {
      if (before) policy.push({ before, after: copy(agent), local: copy(local), occupancy: copy(info) });
      context = null;
    }
  });
  const constrain = c.occupancy.constrainDisplacements;
  replace(c.occupancy, 'constrainDisplacements', function (agents, moves) {
    const scales = constrain.call(this, agents, moves);
    collision = { ids: agents.map(a => a.id), moves: copy(moves), scales: [...scales],
      preCollision: agents.map(a => ({ id: a.id, x: a.x, y: a.y, vx: a.vx, vy: a.vy, heading: a.heading })) };
    return scales;
  });
  const owners = new WeakMap();
  for (const key of ['advance', 'retire']) {
    const original = c.gasterDeposition[key];
    replace(c.gasterDeposition, key, function (id, ...args) { const batch = original.call(this, id, ...args); owners.set(batch, id); return batch; });
  }
  const apply = c.applyDeposits;
  replace(c, 'applyDeposits', function (batch) {
    const focal = owners.get(batch) === focalId && batch.length > 0;
    const before = focal ? this.field.values.slice() : null;
    const out = apply.call(this, batch);
    if (focal) {
      const nodes = [];
      for (let i = 0; i < before.length; i++) if (!Object.is(before[i], this.field.values[i]))
        nodes.push({ index: i, before: before[i], after: this.field.values[i], delta: this.field.values[i] - before[i] });
      assert.ok(nodes.every(n => n.delta >= 0), 'focal deposition must not subtract field');
      deposits.push({ requests: copy(batch), nodes, acceptedNodeSumIncrement: nodes.reduce((s, n) => s + n.delta, 0) });
    }
    return out;
  });
  const unsubscribe = c.subscribe(e => {
    if (e.type === 'foot-contact' && e.payload.antId === focalId) contacts.push(copy(e.payload));
    if (['foot-contact', 'plate-birth', 'sphere-birth', 'error'].includes(e.type)) events.push({ type: e.type, payload: copy(e.payload) });
  });
  try { c.tick(DT); }
  finally { unsubscribe(); for (const restore of restores.reverse()) restore(); }
  return { offset, timeSeconds: c.simulationTimeMs / 1000, focalBefore,
    focalAfter: copy(c.agents.find(a => a.id === focalId)) ?? null, agents: copy(c.agents),
    policy, queries, collision, contacts, deposits, allEventsHash: hash(events),
    gasterState: copy(c.gasterDeposition.ants.get(focalId)) ?? null,
    rngBefore, rngAfter: { state: c.random.state(), calls: c.random.calls }, randomTrace,
    scheduling: { totalSpawned: c.totalSpawned, totalRetired: c.totalRetired,
      nextAgentId: c.nextAgentId, nextSpawnTimeMs: c.nextSpawnTimeMs },
    pheromoneSha256: sha(Buffer.from(c.field.values.buffer)), surfaceSha256: sha(Buffer.from(c.surfaceField.values.buffer)),
    worldHash: worldHash(c) };
}

function motorDiff(a, b) {
  const x = a.focalAfter, y = b.focalAfter;
  if (!x || !y) return { different: !isDeepStrictEqual(x, y), retired: true };
  const position = Math.hypot(x.x - y.x, x.y - y.y), velocity = Math.hypot(x.vx - y.vx, x.vy - y.vy);
  const heading = Math.abs(angle(x.heading - y.heading));
  const i = a.collision.ids.indexOf(x.id), j = b.collision.ids.indexOf(y.id);
  return { different: !['x', 'y', 'vx', 'vy', 'heading', 'angularVelocity'].every(k => Object.is(x[k], y[k])),
    position, velocity, heading, angularVelocity: Math.abs(x.angularVelocity - y.angularVelocity),
    targetSpeed: Math.abs(x.targetSpeed - y.targetSpeed),
    requestedDisplacement: Math.hypot(a.collision.moves[i].x - b.collision.moves[j].x, a.collision.moves[i].y - b.collision.moves[j].y),
    postCollisionDisplacement: Math.hypot((x.x - a.focalBefore.x) - (y.x - b.focalBefore.x),
      (x.y - a.focalBefore.y) - (y.y - b.focalBefore.y)),
    collisionScale: [a.collision.scales[i], b.collision.scales[j]] };
}
function policySummary(row) {
  const p = row.policy[0];
  return { optionIndex: optionIndex(row), local: p.local, intentHeading: p.after.intentHeading,
    confidence: p.after.trailConfidence, adherence: p.after.trailAdherence,
    decisionRemaining: p.after.decisionRemaining, committedRemaining: p.after.committedRemaining };
}
function optionIndex(row) {
  const p = row.policy[0];
  const d = angle(p.after.intentHeading - p.before.heading), offsets = [-.92, -.47, 0, .47, .92];
  return offsets.map(x => Math.abs(angle(d - x))).indexOf(Math.min(...offsets.map(x => Math.abs(angle(d - x)))));
}
function contactGeometry(events) { return events.map(e => ({ antId: e.antId, time: e.simulationTimeMs,
  contacts: e.contacts.map(c => ({ legId: c.legId, position: c.position })) })); }
function inputSummary(inputs, queries) {
  const full = makeAuthorSampler(inputs, 'fullAuthorSum'), alive = makeAuthorSampler(inputs, 'noRetired');
  return Object.fromEntries(['senseLocalTrail', 'senseTrail'].map(kind => {
    const q = queries.filter(x => x.kind === kind);
    const fullReadSum = q.reduce((s, x) => s + full.sample(x.x, x.y), 0);
    const aliveReadSum = q.reduce((s, x) => s + alive.sample(x.x, x.y), 0);
    return [kind, { reads: q.length, fullReadSum, retiredReadSum: fullReadSum - aliveReadSum,
      retiredFractionOfReadSum: fullReadSum ? (fullReadSum - aliveReadSum) / fullReadSum : null }];
  }));
}
function worldHash(c) {
  const data = Object.fromEntries(Object.entries(c).filter(([k, v]) => !['listeners', 'random', 'audioBridge'].includes(k) && typeof v !== 'function'));
  data.rng = { state: c.random.state(), calls: c.random.calls };
  return hash(data);
}
function canonical(v) {
  if (ArrayBuffer.isView(v)) return { type: v.constructor.name, values: Array.from(v) };
  if (v instanceof Map) return [...v].map(([k, x]) => [canonical(k), canonical(x)]);
  if (v instanceof Set) return [...v].map(canonical);
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().filter(k => typeof v[k] !== 'function').map(k => [k, canonical(v[k])]));
  return v;
}
function numericId(id) { return Number(String(id).replace(/^ant-/, '')); }
function angle(x) { return ((x + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }
