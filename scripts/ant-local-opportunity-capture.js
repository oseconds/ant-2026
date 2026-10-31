import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { writeRun } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const AUTHORITY = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const BRANCH = 'codex/ant-local-opportunity-competition-audit-20261031';
const GRID = 96, COUNT = GRID * GRID, DT = 1 / 60, CAPTURE_SECONDS = [60, 120, 300, 600];
const DATA = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis');
const SOURCES = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js'
];

export function parseArgs(args) {
  const values = new Map(args.map(arg => { const i = arg.indexOf('='); return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)]; }));
  const seed = values.get('--seed') ?? '20261005', seconds = Number(values.get('--seconds') ?? 600);
  assert.ok(/^\d+$/.test(String(seed)), '--seed must be an integer');
  assert.ok(Number.isInteger(seconds) && seconds > 0, '--seconds must be a positive integer');
  return { seed: String(seed), seconds, out: resolve(ROOT, String(values.get('--out') ?? DATA)) };
}

export function gridIndex(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return -1;
  return Math.round(x * (GRID - 1)) + Math.round(y * (GRID - 1)) * GRID;
}

export function eventWindow(events, endMs, durationMs) {
  const start = endMs - durationMs, selected = events.filter(event => event.timeMs > start && event.timeMs <= endMs);
  return selected;
}

export function lastBirthMap(priorPlates, currentBirths = []) {
  const excluded = new Set(currentBirths.map(plate => plate.id));
  const values = new Float64Array(COUNT); values.fill(-1);
  for (const plate of priorPlates) {
    if (excluded.has(plate.id)) continue;
    for (let i = 0; i < COUNT; i++) if (plate.mask[i]) values[i] = plate.bornAtSimulationTimeMs;
  }
  return values;
}

// Split a clipped segment at nearest-grid Voronoi boundaries; each cell gets exact time and distance shares.
export function rasterizeSegment(from, to, dtSeconds) {
  assert.ok(Number.isFinite(dtSeconds) && dtSeconds >= 0, 'segment duration must be finite and nonnegative');
  const dx = to.x - from.x, dy = to.y - from.y;
  let lo = 0, hi = 1;
  for (const [p, q] of [[-dx, from.x], [dx, 1 - from.x], [-dy, from.y], [dy, 1 - from.y]]) {
    if (p === 0) { if (q < 0) return []; continue; }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
    if (lo > hi) return [];
  }
  if (dx === 0 && dy === 0) {
    const cell = gridIndex(from.x, from.y);
    return cell < 0 ? [] : [{ cell, fraction: 1, travel: 0, occupancySeconds: dtSeconds }];
  }
  const cuts = [lo, hi];
  const addCuts = (start, delta) => {
    if (!delta) return;
    for (let boundary = 0.5 / (GRID - 1); boundary < 1; boundary += 1 / (GRID - 1)) {
      const t = (boundary - start) / delta;
      if (t > lo && t < hi) cuts.push(t);
    }
  };
  addCuts(from.x, dx); addCuts(from.y, dy); cuts.sort((a, b) => a - b);
  const rows = [];
  for (let i = 1; i < cuts.length; i += 1) {
    const a = cuts[i - 1], b = cuts[i], fraction = b - a;
    if (!(fraction > 0)) continue;
    const cell = gridIndex(from.x + dx * (a + b) / 2, from.y + dy * (a + b) / 2);
    if (cell < 0) continue;
    rows.push({ cell, fraction, travel: Math.hypot(dx, dy) * fraction, occupancySeconds: dtSeconds * fraction });
  }
  assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.fraction, 0) - (hi - lo)) < 1e-10,
    'segment raster shares conserve clipped fraction');
  return rows;
}

function countedLcg(seed) { let state = Number(seed) >>> 0, calls = 0; return {
  random() { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; },
  get calls() { return calls; }, state() { return state; }
}; }
const bytes = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength);
const digest = value => createHash('sha256').update(value).digest('hex');
const pack = value => ({ type: value.constructor.name, length: value.length, data: bytes(value).toString('base64') });
const forbiddenRandom = callback => { const prior = Math.random; Math.random = () => { throw Error('observer used Math.random'); }; try { return callback(); } finally { Math.random = prior; } };
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const normalizeText = value => value.replace(/\r\n?/g, '\n');

async function assertAuthorityAndSources() {
  const head = git('rev-parse', 'HEAD'), branch = git('branch', '--show-current');
  assert.equal(branch, BRANCH, 'runner branch');
  assert.equal(git('rev-parse', AUTHORITY), AUTHORITY, 'registered authority exists');
  execFileSync('git', ['merge-base', '--is-ancestor', AUTHORITY, 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
  const sourceHashes = {};
  for (const path of SOURCES) {
    const expected = normalizeText(execFileSync('git', ['show', `${AUTHORITY}:${path}`], { cwd: ROOT, encoding: 'utf8' }));
    const actual = normalizeText(await readFile(resolve(ROOT, path), 'utf8'));
    assert.equal(actual, expected, `production source matches authority: ${path}`);
    sourceHashes[path] = digest(Buffer.from(actual));
  }
  return { head, branch, sourceHashes };
}

function fingerprint(controller, rng) {
  const agents = controller.agents.map(agent => ({ ...agent,
    gait: controller.gaitController.getSnapshot(agent), bodyPose: controller.bodyPoseController.getSnapshot(agent) }));
  const candidate = controller.trailPlateBirth.candidate;
  const state = { time: controller.simulationTimeMs, nextSpawn: controller.nextSpawnTimeMs,
    spawned: controller.totalSpawned, retired: controller.totalRetired, rngCalls: rng.calls, rngState: rng.state(),
    lastAnalysis: controller.trailPlateBirth.lastAnalysisTimeMs, agents,
    candidate: candidate ? { startedAtMs: candidate.startedAtMs, stableSeconds: candidate.stableSeconds,
      similarity: candidate.similarity, source: candidate.source, target: candidate.target, path: candidate.path,
      skeletonIndices: candidate.skeletonIndices, mask: digest(bytes(candidate.mask)),
      supportedMask: digest(bytes(candidate.supportedMask)) } : null,
    plates: controller.trailPlateBirth.getPlates().map(p => [p.id, p.bornAtSimulationTimeMs]),
    activation: controller.colonyActivation.getSnapshot() };
  const material = controller.materialStratigraphy.getSnapshot();
  state.fields = [controller.field.values, controller.surfaceField.values,
    controller.trailPlateBirth.chemicalMemory, controller.trailPlateBirth.footContactCounts,
    material.stratigraphy.layerCountByCell, material.stratigraphy.topLayerByCell,
    material.stratigraphy.totalDepthByCellMeters]
    .map(value => digest(bytes(value)));
  state.materialRevision = [material.revision, material.noduleRevision];
  return digest(JSON.stringify(state));
}

function productionOps(text) {
  const start = text.indexOf('function neighborValues('), end = text.indexOf('function createPheromoneSampler(', start);
  const thin = text.indexOf('function zhangSuen('), thinEnd = text.indexOf('function skeletonComponents(', thin);
  assert.ok(start >= 0 && end > start && thin >= 0 && thinEnd > thin, 'production mask helpers found');
  const math = Object.create(Math); math.random = () => { throw Error('production mask helper used Math.random'); };
  return runInNewContext('const TRAIL_PLATE_GRID_SIZE=96;\n' + text.slice(start, end)
    + text.slice(thin, thinEnd) + '({zhangSuen})', { Math: math });
}

function tickHook(controller, ctx, ops) {
  const birth = controller.trailPlateBirth, advance = birth.advance, build = birth.buildSupportedMask;
  birth.buildSupportedMask = function (...args) {
    const result = build.apply(this, args), callsBeforeObserver = ctx.rng.calls;
    ctx.built = { E: result.mask.slice(), D: result.supports.slice() };
    assert.equal(ctx.rng.calls, callsBeforeObserver, 'mask observer consumes no controller RNG');
    ctx.observerRngCalls += ctx.rng.calls - callsBeforeObserver;
    return result;
  };
  birth.advance = function (...args) {
    const prior = this.lastAnalysisTimeMs, callsBeforeRead = ctx.rng.calls;
    const priorPlates = birthArray(controller); ctx.built = null;
    assert.equal(ctx.rng.calls, callsBeforeRead, 'prior material read consumes no controller RNG');
    const result = advance.apply(this, args);
    const callsBeforeObserver = ctx.rng.calls;
    for (const item of ctx.pendingTraffic || []) {
      const rows = rasterizeSegment(item.from, { x: item.agent.x, y: item.agent.y }, DT);
      ctx.traffic.push({ timeMs: controller.simulationTimeMs, antId: item.agent.id, rows });
      const travel = rows.reduce((sum, row) => sum + row.travel, 0);
      const occupied = rows.reduce((sum, row) => sum + row.occupancySeconds, 0);
      const fraction = rows.reduce((sum, row) => sum + row.fraction, 0);
      const fullLength = Math.hypot(item.agent.x - item.from.x, item.agent.y - item.from.y);
      ctx.trafficConservation.expectedTravel += fullLength * fraction;
      ctx.trafficConservation.observedTravel += travel;
      ctx.trafficConservation.expectedOccupancy += DT * fraction;
      ctx.trafficConservation.observedOccupancy += occupied;
      ctx.trafficConservation.segmentCount++;
    }
    ctx.pendingTraffic = null;
    if (this.lastAnalysisTimeMs !== prior) {
      assert.ok(ctx.built, 'actual analysis built production masks');
      const material = controller.materialStratigraphy.getSnapshot().stratigraphy;
      forbiddenRandom(() => {
        const E = ctx.built.E, F = ops.zhangSuen(E), D = ctx.built.D;
        for (let i = 0; i < COUNT; i++) assert.ok(!F[i] || E[i]);
        const B = this.chemicalMemory.slice(), C = new Float32Array(COUNT);
        assert.equal(controller.surfaceField.width, GRID); assert.equal(controller.surfaceField.height, GRID);
        for (let i = 0; i < COUNT; i++) C[i] = controller.surfaceField.sample((i % GRID) / (GRID - 1), Math.floor(i / GRID) / (GRID - 1));
        const lastBirthMs = lastBirthMap(priorPlates, result);
        const tick = Math.round(this.lastAnalysisTimeMs / (1000 / 60));
        const anchor = { index: ctx.anchors.length, tick, timeMs: this.lastAnalysisTimeMs,
          E: pack(E), F: pack(F), B: pack(B), C: pack(C), D: pack(D),
          material: { layers: pack(material.layerCountByCell.slice()),
            top: pack(material.topLayerByCell.slice()), lastBirthMs: pack(lastBirthMs) },
          feet: {}, traffic: {}, birthIds: [], diagnostics: { observerRandomCalls: 0, ...this.lastInputDiagnostics } };
        for (const w of [1, 5, 20]) { anchor.feet[String(w)] = summarizeFeet(ctx.contacts, ctx.latestFoot, this.lastAnalysisTimeMs, w);
          anchor.traffic[String(w)] = summarizeTraffic(ctx.traffic, this.lastAnalysisTimeMs, w); }
        ctx.anchors.push(anchor);
      });
    }
    assert.equal(ctx.rng.calls, callsBeforeObserver, 'observer callbacks consume no controller RNG');
    ctx.observerRngCalls += ctx.rng.calls - callsBeforeObserver;
    return result;
  };
  controller.subscribe(({ type, payload }) => {
    const callsBeforeObserver = ctx.rng.calls;
    if (type === 'foot-contact') {
      assert.equal(payload?.type, 'FOOT_CONTACT');
      assert.ok((Number.isInteger(payload.antId) && payload.antId > 0)
        || (typeof payload.antId === 'string' && payload.antId.length > 0));
      assert.ok(typeof payload.contactGroup === 'string' && Array.isArray(payload.contacts)
        && Number.isFinite(payload.simulationTimeMs));
      const event = { timeMs: payload.simulationTimeMs, antId: payload.antId,
        group: payload.contactGroup, contacts: payload.contacts.map(c => ({ legId: c.legId, x: c.position.x, y: c.position.y })) };
      for (const contact of payload.contacts) assert.ok(typeof contact?.legId === 'string' && contact.legId
        && gridIndex(contact.position?.x, contact.position?.y) >= 0, 'actual FOOT_CONTACT positions and leg IDs valid');
      ctx.footContactEvents++;
      ctx.footContactPoints += event.contacts.length;
      ctx.contacts.push(event);
      for (const foot of event.contacts) { const cell = gridIndex(foot.x, foot.y); if (cell >= 0) ctx.latestFoot[cell] = event.timeMs; }
    }
    if (type === 'plate-birth') { ctx.births.push({ id: payload.id, timeMs: payload.bornAtSimulationTimeMs,
      maskIndices: indices(payload.mask) }); ctx.anchors.at(-1)?.birthIds.push(payload.id); }
    assert.equal(ctx.rng.calls, callsBeforeObserver, 'event observer consumes no controller RNG');
    ctx.observerRngCalls += ctx.rng.calls - callsBeforeObserver;
  });
}
function capturePlainBoundaryInputs(controller, ctx) {
  const birth = controller.trailPlateBirth, build = birth.buildSupportedMask;
  birth.buildSupportedMask = function (...args) {
    const result = build.apply(this, args);
    ctx.plainBuilt = { E: result.mask.slice(), D: result.supports.slice() };
    return result;
  };
}
function birthArray(controller) { return controller.trailPlateBirth.getPlates(); }
function indices(mask) { const out = []; for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(i); return out; }

export function summarizeFeet(events, latestFoot, endMs, seconds) {
  const counts = new Uint16Array(COUNT), groupSets = Array.from({ length: COUNT }, () => new Set()), antSets = Array.from({ length: COUNT }, () => new Set()), age = new Float32Array(COUNT); age.fill(-1);
  for (const event of events) {
    if (event.timeMs <= endMs - seconds * 1000 || event.timeMs > endMs) continue;
    for (const foot of event.contacts) { const cell = gridIndex(foot.x, foot.y); if (cell < 0) continue;
      if (counts[cell] < 0xffff) counts[cell]++;
      groupSets[cell].add(event.timeMs + ':' + event.antId + ':' + event.group); antSets[cell].add(event.antId); }
  }
  for (let i = 0; i < COUNT; i++) if (latestFoot[i] >= 0 && latestFoot[i] <= endMs) age[i] = (endMs - latestFoot[i]) / 1000;
  const groups = new Uint16Array(COUNT), ants = new Uint16Array(COUNT);
  for (let i = 0; i < COUNT; i++) { groups[i] = groupSets[i].size; ants[i] = antSets[i].size; }
  return { count: pack(counts), groups: pack(groups), ants: pack(ants), ageSeconds: pack(age) };
}
function summarizeTraffic(events, endMs, seconds) {
  const travel = new Float32Array(COUNT), occupancy = new Float32Array(COUNT), ants = Array.from({ length: COUNT }, () => new Set()), segments = new Uint16Array(COUNT);
  for (const event of events) {
    if (event.timeMs <= endMs - seconds * 1000 || event.timeMs > endMs) continue;
    for (const cell of event.rows) { travel[cell.cell] += cell.travel; occupancy[cell.cell] += cell.occupancySeconds;
      ants[cell.cell].add(event.antId); segments[cell.cell]++; }
  }
  const antCounts = new Uint16Array(COUNT); for (let i = 0; i < COUNT; i++) antCounts[i] = ants[i].size;
  return { travel: pack(travel), ants: pack(antCounts), occupancySeconds: pack(occupancy), segments: pack(segments) };
}

async function runSeed(seed, seconds, out, authorityCheck, ops) {
  const { sourceHashes } = authorityCheck;
  const observedRng = countedLcg(seed), plainRng = countedLcg(seed);
  const observed = new AntController({ random: observedRng.random }), plain = new AntController({ random: plainRng.random });
  const ctx = { rng: observedRng, anchors: [], births: [], contacts: [], traffic: [], built: null,
    latestFoot: new Float64Array(COUNT).fill(-1), pendingTraffic: null, footContactEvents: 0,
    observerRngCalls: 0,
    footContactPoints: 0, boundaryChecks: [], trafficConservation: {
      segmentCount: 0, expectedTravel: 0, observedTravel: 0,
      expectedOccupancy: 0, observedOccupancy: 0
    } };
  tickHook(observed, ctx, ops);
  capturePlainBoundaryInputs(plain, ctx);
  const parity = { ticks: 0, equalEveryTick: true, equalEveryAnalysisBoundary: true, mismatches: [] };
  await observed.init(); await plain.init();
  assert.equal(fingerprint(observed, observedRng), fingerprint(plain, plainRng), 'initial observer parity');
  const start = performance.now();
  for (let tick = 1; tick <= seconds * 60; tick++) {
    const before = observed.agents.map(agent => ({ agent, from: { x: agent.x, y: agent.y } }));
    ctx.pendingTraffic = before; ctx.plainBuilt = null;
    observed.tick(DT); plain.tick(DT); parity.ticks++;
    assert.equal(fingerprint(observed, observedRng), fingerprint(plain, plainRng), 'observer parity tick ' + tick);
    if (ctx.anchors.length && ctx.anchors.at(-1).tick === tick) {
      assert.ok(ctx.plainBuilt, 'plain controller reached production boundary');
      assert.equal(digest(bytes(ctx.built.E)), digest(bytes(ctx.plainBuilt.E)), 'production E parity at boundary ' + tick);
      assert.equal(digest(bytes(ctx.built.D)), digest(bytes(ctx.plainBuilt.D)), 'production D parity at boundary ' + tick);
      assert.equal(fingerprint(observed, observedRng), fingerprint(plain, plainRng),
        'full environment parity at analysis boundary ' + tick);
      parity.exactEnvironmentBoundaries = (parity.exactEnvironmentBoundaries || 0) + 1;
      ctx.boundaryChecks.push({ tick, E: digest(bytes(ctx.built.E)), D: digest(bytes(ctx.built.D)),
        observedRngCalls: observedRng.calls, observedRngState: observedRng.state(),
        plainRngCalls: plainRng.calls, plainRngState: plainRng.state() });
    }
    const atMs = observed.simulationTimeMs;
    if (tick % 60 === 0) {
      ctx.contacts = ctx.contacts.filter(event => event.timeMs > atMs - 20000);
      ctx.traffic = ctx.traffic.filter(event => event.timeMs > atMs - 20000);
    }
    if (tick % 60 === 0) {
      const anchor = ctx.anchors.at(-1); assert.ok(anchor, 'real analysis anchor exists');
      if (CAPTURE_SECONDS.includes(tick / 60)) {
        ctx.captures ??= [];
        ctx.captures.push({ requestedSeconds: tick / 60,
          anchorIndex: anchor.index, analysisTimeMs: anchor.timeMs, frameTimeMs: atMs });
      }
      if (tick % 3600 === 0) console.log(JSON.stringify({ seed, seconds: tick / 60, anchors: ctx.anchors.length,
        elapsedWallSeconds: (performance.now() - start) / 1000 }));
    }
  }
  assert.equal(parity.ticks, seconds * 60);
  assert.equal(ctx.observerRngCalls, 0, 'observers consume no controller RNG');
  assert.equal(observedRng.calls, plainRng.calls, 'final controller RNG call counts match');
  assert.equal(observedRng.state(), plainRng.state(), 'final controller RNG states match');
  assert.ok(ctx.anchors.length >= seconds - 1 && ctx.anchors.length <= seconds,
    'observed production anchors match the fixed run duration');
  assert.equal(parity.exactEnvironmentBoundaries, ctx.anchors.length);
  const retainedFootContactPoints = ctx.contacts.reduce((sum, event) => sum + event.contacts.length, 0);
  assert.ok(retainedFootContactPoints <= ctx.footContactPoints);
  const trafficTolerance = Math.max(1e-9, ctx.trafficConservation.segmentCount * 1e-10);
  assert.ok(Math.abs(ctx.trafficConservation.expectedTravel - ctx.trafficConservation.observedTravel) <= trafficTolerance,
    'rasterized travel conservation');
  assert.ok(Math.abs(ctx.trafficConservation.expectedOccupancy - ctx.trafficConservation.observedOccupancy) <= trafficTolerance,
    'rasterized occupancy conservation');
  assert.deepEqual((ctx.captures || []).map(capture => capture.requestedSeconds), CAPTURE_SECONDS.filter(value => value <= seconds));
  parity.rngCalls = { observed: observedRng.calls, plain: plainRng.calls };
  parity.finalRngState = { observed: observedRng.state(), plain: plainRng.state() };
  parity.boundaryChecks = ctx.boundaryChecks;
  parity.stateHashEveryTick = true;
  const run = { schema: 'ant-local-opportunity-capture-v1', authority: AUTHORITY, branch: BRANCH,
    sourceHashes, seed, hz: 60, seconds, audio: 'Off',
    timeConvention: {
      footContacts: 'Use FOOT_CONTACT.simulationTimeMs; rolling windows are (t-w,t].',
      trafficSegments: 'Assign each realized tick segment to its tick-end time. Clip segment geometry to the unit square and scale occupancy by the in-domain segment fraction. Windows include the whole segment when its tick-end time is in (t-w,t]; they do not fractionally trim a segment at the window start.',
      trafficPackedFloat32AggregateRelativeTolerance: 1e-4
    },
    validation: { parity, branch: authorityCheck.branch, authorityHead: AUTHORITY,
      observerRandomCalls: ctx.observerRngCalls, footContactEvents: ctx.footContactEvents,
      validFootContactPoints: ctx.footContactPoints, retainedFootContactEvents: ctx.contacts.length,
      retainedFootContactPoints, trafficConservation: ctx.trafficConservation,
      trafficConservationAbsoluteTolerance: trafficTolerance }, births: ctx.births,
    anchors: ctx.anchors, captures: ctx.captures ?? [] };
  await writeRun(resolve(out, 'seed-' + seed + '.signals.json.gz'), run);
  return run;
}

async function main() {
  const { seed, seconds, out } = parseArgs(process.argv.slice(2));
  const authorityCheck = await assertAuthorityAndSources();
  const sourceText = await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
  const ops = productionOps(sourceText); await mkdir(out, { recursive: true });
  const run = await runSeed(seed, seconds, out, authorityCheck, ops);
  const after = await assertAuthorityAndSources();
  assert.deepEqual(after.sourceHashes, authorityCheck.sourceHashes, 'production source hashes unchanged');
  console.log(JSON.stringify({ complete: true, seed, seconds, anchors: run.anchors.length, captures: run.captures, output: out }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
