import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { AntPheromoneProvenanceObserver } from './lib/antPheromoneProvenanceObserver.js';
import { runFrozenDecision, runFrozenLocal } from './lib/antPheromoneDecisionShadow.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = resolve(root, 'docs/ant/evidence/2026-10-28-causal-memory-responsibilities');
const sha = b => createHash('sha256').update(b).digest('hex');
const jsonCopy = v => structuredClone(v);
const exactJson = v => JSON.stringify(v, (_key, value) => Object.is(value, -0) ? { $antNegativeZero: true } : value);
const parseExact = text => JSON.parse(text, (_key, value) => value && typeof value === 'object'
  && Object.keys(value).length === 1 && value.$antNegativeZero === true ? -0 : value);
const typedHash = a => sha(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
const priorPath = 'docs/ant/evidence/2026-10-28-pheromone-cross-lifecycle-provenance/RESULTS.json';
const priorBytes = await readFile(resolve(root, priorPath));
const priorText = priorBytes.toString('utf8');
let priorStrictError;
try { JSON.parse(priorText); } catch (error) { priorStrictError = error.message; }
assert.ok(priorStrictError, 'the pinned parent receipt syntax defect must be explicit');
const knownComma = /("observerReadsDidNotChangeSampleReturns": true),(\r?\n\s*\})/g;
assert.equal([...priorText.matchAll(knownComma)].length, 3);
const repairedText = priorText.replace(knownComma, '$1$2');
const prior = JSON.parse(repairedText);
const priorAudit = { path: priorPath, originalSha256: sha(priorBytes), strictError: priorStrictError,
  derivedParseSha256: sha(repairedText), correction: 'Remove exactly three trailing commas after named parity field; no values changed',
  correctionCount: 3, originalUntouched: true, pooled: prior.pooled };

await mkdir(resolve(base, 'data'), { recursive: true });
let packet;
if (process.argv.includes('--check')) {
  const zipped = await readFile(resolve(base, 'data/frozen-cases.json.gz'));
  packet = parseExact(gunzipSync(zipped).toString('utf8'));
  const capture = JSON.parse(await readFile(resolve(base, 'data/capture.json'), 'utf8'));
  assert.equal(sha(zipped), capture.packetSha256);
} else {
  await assert.rejects(readFile(resolve(base, 'data/frozen-cases.json.gz')), { code: 'ENOENT' });
  try { packet = await capturePrefix(); }
  catch (error) {
    await writeFile(resolve(base, 'data/capture-failure.json'), JSON.stringify({ status: 'INCONCLUSIVE',
      stage: 'read-only prefix acquisition', error: error.message }, null, 2) + '\n');
    throw error;
  }
  const raw = Buffer.from(exactJson(packet)), zipped = gzipSync(raw, { level: 9 });
  await writeFile(resolve(base, 'data/frozen-cases.json.gz'), zipped);
  await writeFile(resolve(base, 'data/capture.json'), JSON.stringify({ ...packet.validity,
    packetSha256: sha(zipped), rawSha256: sha(raw), compressedBytes: zipped.length, rawBytes: raw.length,
    sourceHashes: packet.sourceHashes, scope: packet.scope }, null, 2) + '\n');
  await writeFile(resolve(base, 'data/prior-receipt-audit.json'), JSON.stringify(priorAudit, null, 2) + '\n');
}
const before = sha(exactJson(packet));
let first, second; const originalMathRandom = Math.random;
try {
  Math.random = () => { throw Error('Frozen counterfactual consumed global RNG'); };
  first = JSON.stringify(analyze(packet)); second = JSON.stringify(analyze(packet));
} finally { Math.random = originalMathRandom; }
assert.equal(first, second); assert.equal(sha(exactJson(packet)), before);
const target = resolve(base, 'data/decision-summary.json');
if (process.argv.includes('--check')) assert.equal(sha(await readFile(target)), sha(first + '\n'));
else {
  await writeFile(target, first + '\n');
  await writeFile(resolve(base, 'data/analysis-validation.json'), JSON.stringify({ deterministicDuplicate: true,
    inputUnchanged: true, summarySha256: sha(first + '\n'),
    helperSha256: sha(await readFile(resolve(root, 'scripts/lib/antPheromoneDecisionShadow.js'))),
    runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))) }, null, 2) + '\n');
}
console.log(JSON.stringify(JSON.parse(first), null, 2));

async function capturePrefix() {
  const start = performance.now(), baseline = makeRun(), observed = makeRun(true);
  const eventsA = eventObserver(baseline.controller), eventsB = eventObserver(observed.controller);
  await Promise.all([baseline.controller.init(), observed.controller.init()]);
  const c = observed.controller, observer = observed.observer, cases = [], checkpoints = [];
  const chosenSeconds = new Set();
  let tick = 0, active = null, reading = null;
  const sample = c.field.sample;
  c.field.sample = (x, y) => {
    const full = sample.call(c.field, x, y);
    if (reading) reading.push(componentRead(observer, active.before.id, x, y, full));
    return full;
  };
  const senseWide = c.senseTrail;
  c.senseTrail = (agent, heading) => {
    if (!active) return senseWide.call(c, agent, heading);
    const reads = []; reading = reads;
    let signal;
    try { signal = senseWide.call(c, agent, heading); }
    finally { reading = null; }
    active.wide.push({ heading, reads, fullSignal: signal });
    return signal;
  };
  const intention = c.updateIntention;
  c.updateIntention = (agent, agents, info, dt, local) => {
    const bin = Math.floor((tick - 1) / 60), key = `${agent.id}:${bin}`;
    const gate = !(agent.decisionRemaining - dt > 0 && agent.committedRemaining - dt > 0
      && !(info.frontCrowding > .25 && !agent.wasBlocked));
    const wideCase = gate && !chosenSeconds.has(key), localCase = tick % 60 === 0;
    if (!wideCase && !localCase) return intention.call(c, agent, agents, info, dt, local);
    if (wideCase) chosenSeconds.add(key);
    const before = jsonCopy(agent), localReads = [];
    const localFacade = Object.create(c);
    localFacade.field = { sample(x, y) {
      const full = PheromoneField.prototype.sample.call(c.field, x, y);
      localReads.push(componentRead(observer, before.id, x, y, full)); return full;
    } };
    const repeatedLocal = AntController.prototype.senseLocalTrail.call(localFacade, before);
    assert.deepEqual(repeatedLocal, local, 'same actual local sensor before policy replay');
    const current = { tick, modelTimeBeforeUpdateMs: c.simulationTimeMs, fieldTimeSeconds: observer.fieldTimeSeconds,
      localCase, wideCase, before, info: { frontCrowding: info.frontCrowding }, local: jsonCopy(local), localReads,
      wide: [], crowding: [], randomTape: [] };
    active = current;
    const random = c.random, occupancy = c.occupancy, originalCrowding = occupancy.crowdingInDirection;
    const hadOwn = Object.hasOwn(occupancy, 'crowdingInDirection');
    c.random = () => { const v = random(); current.randomTape.push(v); return v; };
    occupancy.crowdingInDirection = (...args) => {
      const v = originalCrowding.apply(occupancy, args);
      current.crowding.push({ heading: args[2], value: v }); return v;
    };
    try { intention.call(c, agent, agents, info, dt, local); }
    finally {
      c.random = random; active = null;
      if (hadOwn) occupancy.crowdingInDirection = originalCrowding;
      else delete occupancy.crowdingInDirection;
    }
    current.after = jsonCopy(agent);
    if (wideCase) assert.equal(current.wide.length, 5, 'prospective choice gate must match production');
    assert.ok(current.wide.length === 0 || current.wide.length === 5);
    cases.push(current);
  };
  function check(seconds) {
    const a = checkpoint(baseline, eventsA), b = checkpoint(observed, eventsB);
    assert.deepEqual(b, a, `full checkpoint ${seconds}`);
    const old = prior.seeds[0].checkpoints.find(p => p.seconds === seconds);
    assert.ok(old && prior.seeds[0].seed === 20261005);
    for (const k of Object.keys(a)) assert.deepEqual(a[k], old[k], `prior receipt ${seconds} ${k}`);
    const residual = observer.auditField(); assert.ok(residual.residualRatio <= 1e-4);
    checkpoints.push({ seconds, ...a, fieldResidual: residual });
  }
  check(0);
  for (tick = 1; tick <= 7200; tick++) {
    baseline.controller.tick(1 / 60); c.tick(1 / 60);
    assert.equal(signature(c), signature(baseline.controller), `world agent/lifecycle parity at tick${tick}`);
    assert.deepEqual(c.agents, baseline.controller.agents, `IEEE numeric agent parity at tick${tick}`);
    assert.deepEqual(observed.random.snapshot(), baseline.random.snapshot());
    if (tick % 60 === 0) {
      assert.ok(performance.now() - start < 180000, '180 wall second capture boundary');
      assert.ok(process.memoryUsage().rss < 1.5 * 1024 ** 3, '1.5 GiB capture RSS boundary');
    }
    if ([1800, 3600, 7200].includes(tick)) check(tick / 60);
  }
  const receipt = observer.receipt(); assert.equal(receipt.validity.ok, true);
  const sourceHashes = {};
  for (const path of ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/PheromoneField.js',
    'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/SurfaceField.js',
    'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
    'scripts/lib/antPheromoneProvenanceObserver.js', 'scripts/lib/antPheromoneDecisionShadow.js']) {
    sourceHashes[path] = sha(await readFile(resolve(root, path)));
  }
  const packet = { schema: 'ant-pheromone-frozen-decision-cases-v1',
    numericEncoding: 'Sole-key $antNegativeZero=true JSON markers preserve IEEE signed zero', scope: {
    main: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785', parent: 'bbadf7ffd41d9a0f48f803925af75f7fdb23763f',
    seed: 20261005, seconds: 120, hz: 60, heading: 'production H0', audio: 'Off; no bridge',
    sampling: 'first prospective choice per ant-second plus tick-multiple60 local reads' },
    state: c.getState(), sourceHashes, cases, checkpoints,
    validity: { exactTickAgentLifecycleAndRngParity: true, ticks: 7200, exactFullCheckpoints: 4,
      priorProvenanceCheckpointsExact: true, observer: receipt.validity, capTouches: receipt.field.capTouches,
      nodeResidualMaxRatio: Math.max(...checkpoints.map(p => p.fieldResidual.residualRatio)),
      captureNonInterferencePassed: true, counterfactualsOfflineOnly: true, capturedCases: cases.length,
      acquisitionWallSeconds: (performance.now() - start) / 1000 } };
  await Promise.all([baseline.controller.destroy(), c.destroy()]);
  return packet;
}

function componentRead(observer, reader, x, y, full) {
  const p = observer.interpolateComponents(x, y, reader, full);
  return { x, y, full, self: p.self, aliveOther: p.aliveOther, retired: p.retired, residual: p.residual };
}

function analyze(packet) {
  const details = [], numericLocal = [];
  for (const item of packet.cases) {
    const facade = { state: packet.state, updateTrailAdherence: AntController.prototype.updateTrailAdherence,
      occupancy: { crowdingInDirection(_a, _others, heading) {
        const value = item.crowding.find(p => Math.abs(p.heading - heading) < 1e-10);
        assert.ok(value, 'captured crowding matches fixed candidate heading'); return value.value;
      } } };
    const local = {};
    for (const condition of ['full', 'removeRetired', 'flatRetired']) {
      try { local[condition] = runFrozenLocal(facade, item.before, item.localReads, 1 / 60, condition); }
      catch (e) {
        if (condition === 'full' || !(e instanceof RangeError)) throw e;
        local[condition] = { numericallyUndefined: true, reason: e.message };
      }
    }
    assert.deepEqual(local.full.profile, item.local);
    assert.equal(local.full.trailAdherenceAfter, item.after.trailAdherence);
    if (item.localCase) numericLocal.push({ seconds: item.fieldTimeSeconds, ...local });
    if (!item.wideCase) continue;
    const wide = runFrozenDecision(facade, item.before, [item.before], item.info, 1 / 60,
      item.local, item.wide, item.randomTape);
    assert.deepEqual(jsonCopy(wide.conditions.full.agentAfter), item.after, 'full shadow must equal executed policy');
    assert.ok(wide.rawBudget.relativeError <= 1e-12);
    for (const p of Object.values(wide.conditions)) assert.ok(p.selectedOptionIndex !== null);
    const distance = Math.hypot(item.before.x - .5, item.before.y - .72);
    const band = distance <= .05 ? '0-.05' : distance <= .15 ? '.05-.15' : distance <= .30 ? '.15-.30' : '>.30';
    const full = wide.conditions.full;
    const reduced = p => ({ choice: p.selectedOptionIndex, intentHeading: p.agentAfter.intentHeading,
      confidence: p.agentAfter.trailConfidence, decisionRemaining: p.agentAfter.decisionRemaining,
      committedRemaining: p.agentAfter.committedRemaining,
      sensoryArgmax: argmax(p.wideSignals.map(s => s.signal)), signals: p.wideSignals.map(s => s.signal) });
    details.push({ seconds: item.fieldTimeSeconds, antId: item.before.id, band,
      retiredRawReadShare: wide.rawBudget.retiredRawSum / Math.max(Number.MIN_VALUE,
        item.wide.flatMap(p => p.reads).reduce((n, p) => n + p.full, 0)),
      rawBudget: wide.rawBudget, full: reduced(full),
      removeRetired: reduced(wide.conditions.removeRetired), flatRetired: reduced(wide.conditions.flatRetired) });
  }
  const group = rows => ({ choices: rows.length,
    removeRetired: difference(rows, 'removeRetired'), flatRetired: difference(rows, 'flatRetired') });
  return { schema: 'ant-pheromone-decision-responsibility-v1', scope: packet.scope, validity: packet.validity,
    wide: group(details), local: localSummary(numericLocal),
    byTime: [0, 30, 60, 90].map(start => ({ start, end: start + 30,
      ...group(details.filter(d => d.seconds > start && d.seconds <= start + 30)) })),
    byAgentCenterBand: ['0-.05', '.05-.15', '.15-.30', '>.30'].map(band => ({ band,
      ...group(details.filter(d => d.band === band)) })),
    wideDetails: details };
}
function difference(rows, condition) {
  return { choiceChanged: rows.filter(r => r.full.choice !== r[condition].choice).length,
    sensoryArgmaxChanged: rows.filter(r => r.full.sensoryArgmax !== r[condition].sensoryArgmax).length,
    absConfidenceDelta: distribution(rows.map(r => Math.abs(r.full.confidence - r[condition].confidence))),
    absIntentDeltaRadians: distribution(rows.map(r => Math.abs(angle(r.full.intentHeading - r[condition].intentHeading)))),
    absDecisionClockDeltaSeconds: distribution(rows.map(r => Math.abs(r.full.decisionRemaining - r[condition].decisionRemaining))) };
}
function localSummary(rows) {
  return { oneHzSamples: rows.length, ...Object.fromEntries(['removeRetired', 'flatRetired'].map(condition => {
    const finite = rows.filter(r => !r[condition].numericallyUndefined);
    return [condition, { numericallyUndefined: rows.length - finite.length,
      absStrengthDelta: distribution(finite.map(r => Math.abs(r.full.profile.strength - r[condition].profile.strength))),
      absCoherenceDelta: distribution(finite.map(r => Math.abs(r.full.profile.coherence - r[condition].profile.coherence))),
      absSteeringDelta: distribution(finite.map(r => Math.abs(r.full.profile.steering - r[condition].profile.steering))),
      absNextAdherenceDelta: distribution(finite.map(r => Math.abs(r.full.trailAdherenceAfter - r[condition].trailAdherenceAfter))) }];
  })) };
}
function distribution(values) {
  assert.ok(values.every(Number.isFinite)); const a = [...values].sort((x, y) => x - y);
  return { n: a.length, aboveNumeric1e9: a.filter(v => v > 1e-9).length,
    mean: a.length ? a.reduce((s, x) => s + x, 0) / a.length : null,
    median: a.length ? a[Math.floor((a.length - 1) / 2)] : null,
    p95: a.length ? a[Math.floor((a.length - 1) * .95)] : null, max: a.at(-1) ?? null };
}
function argmax(a) { return a.indexOf(Math.max(...a)); }
function angle(a) { return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; }
function makeRun(observe = false) {
  let state = 20261005, calls = 0;
  const random = { next() { state = (1664525 * state + 1013904223) >>> 0; calls++; return state / 0x100000000; },
    snapshot: () => ({ state, calls }) };
  const controller = new AntController({ random: random.next });
  return { random, controller, observer: observe ? new AntPheromoneProvenanceObserver().attach(controller) : null };
}
function signature(c) {
  return JSON.stringify({ simulationTimeMs: c.simulationTimeMs, totalSpawned: c.totalSpawned,
    totalRetired: c.totalRetired, nextAgentId: c.nextAgentId, nextSpawnTimeMs: c.nextSpawnTimeMs, agents: c.agents });
}
function checkpoint(run, events) {
  const c = run.controller;
  return { state: { simulationTimeMs: c.simulationTimeMs, totalSpawned: c.totalSpawned,
    totalRetired: c.totalRetired, activeAgents: c.agents.length, nextAgentId: c.nextAgentId,
    nextSpawnTimeMs: c.nextSpawnTimeMs, agentsSha256: sha(JSON.stringify(c.agents)),
    rng: run.random.snapshot(), activation: c.colonyActivation.getSnapshot() },
    pheromoneSha256: typedHash(c.field.values), surface: { sha256: typedHash(c.surfaceField.values),
      totalFootContacts: c.surfaceField.totalFootContacts },
    platesSha256: sha(stable(c.trailPlateBirth.getSnapshot())),
    materialSha256: sha(stable(c.materialStratigraphy.getSnapshot())), events: events() };
}
function eventObserver(c) {
  const hash = createHash('sha256'), counts = {};
  c.subscribe(e => { if (!['foot-contact', 'plate-birth', 'sphere-birth'].includes(e.type)) return;
    counts[e.type] = (counts[e.type] || 0) + 1; hash.update(`${e.type}\n${stable(e.payload)}\n`); });
  return () => ({ counts: { ...counts }, digest: hash.copy().digest('hex') });
}
function stable(value) { return JSON.stringify(canonical(value)); }
function canonical(v) {
  if (ArrayBuffer.isView(v)) return { type: v.constructor.name, values: Array.from(v) };
  if (Array.isArray(v)) return v.map(canonical);
  if (v instanceof Map) return [...v.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([a, b]) => [canonical(a), canonical(b)]);
  if (v instanceof Set) return [...v].map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
  return v;
}
