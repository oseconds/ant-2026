import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';
import { neighbors8 } from './ant-opportunity-core.js';

const BASE = 'docs/ant/evidence/2026-10-29-opportunity-landscape-audit';
const REF = '0d5096a920e1ebb2086fa1dae782c5d4e871b590:docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz';
const RAW_SHA = '909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc';
const TRAIL_SHA = 'cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67';
const SURFACE_SHA = '182b70f589bec7de427a97a4f14f3823b2bd474f6c49c90c59b17c306990c096';
const N = 96, COUNT = N * N, WINDOW_MS = 20000, FOOT_CONTEXT_RADIUS = .037;
const sha = x => createHash('sha256').update(x).digest('hex');
const lf = s => s.replace(/\r\n?/g, '\n');
const ids = m => Array.from(m, (v, i) => v ? i : -1).filter(i => i >= 0);
function fullMaximum(a, S) {
  let index = 0;
  for (let i = 1; i < a.length; i += 1) if (a[i] > a[index]) index = i;
  return { index, value: a[index], inS: Boolean(S[index]) };
}
function contactCells(x, y) {
  const result = [], r = FOOT_CONTEXT_RADIUS;
  for (let cy = Math.max(0, Math.ceil((y - r) * 95)); cy <= Math.min(95, Math.floor((y + r) * 95)); cy += 1) {
    for (let cx = Math.max(0, Math.ceil((x - r) * 95)); cx <= Math.min(95, Math.floor((x + r) * 95)); cx += 1) {
      if (Math.hypot(cx / 95 - x, cy / 95 - y) <= r) result.push(cy * N + cx);
    }
  }
  return result;
}
function buildInput() {
  const central = 48 / 95, stencil = contactCells(central, central);
  assert.ok(stencil.includes(48 * N + 48) && stencil.includes(48 * N + 51));
  assert.ok(!stencil.includes(48 * N + 52) && !stencil.includes(51 * N + 51));
  assert.ok(contactCells(0, 0).every(i => i >= 0 && i < COUNT));
  const source = lf(readFileSync('src/lib/agents/ant/TrailPlateBirth.js', 'utf8'));
  assert.equal(sha(source), TRAIL_SHA);
  assert.equal(sha(lf(readFileSync('src/lib/agents/ant/SurfaceField.js', 'utf8'))), SURFACE_SHA);
  const math = Object.create(Math); math.random = () => { throw new Error('RNG forbidden'); };
  const { zhangSuen } = runInNewContext(source.replace(/^export /gm, '') + '\n({zhangSuen})', { Math: math });
  const bytes = execFileSync('git', ['show', REF], { maxBuffer: 90e6 }); assert.equal(sha(bytes), RAW_SHA);
  const raw = JSON.parse(gunzipSync(bytes));
  assert.equal(raw.seed, 20261005); assert.equal(raw.audio, 'Off'); assert.equal(raw.grid, N);
  const births = raw.births.map(b => ({ id: b.payload.id, timeMs: b.payload.bornAtSimulationTimeMs, cells: ids(b.payload.mask) }));
  const feet = [];
  let rawFeet = 0;
  for (const event of raw.contacts) for (const foot of event.contacts) {
    rawFeet += 1;
    const { x, y } = foot.position;
    if (!foot.legId || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) continue;
    feet.push({ t: event.simulationTimeMs, exact: Math.round(y * 95) * N + Math.round(x * 95), nearby: contactCells(x, y) });
  }
  feet.sort((a, b) => a.t - b.t);
  const nearby = new Uint32Array(COUNT), exact = new Uint32Array(COUNT), lastNearby = new Float64Array(COUNT).fill(-Infinity);
  let add = 0, remove = 0, comparedSupportValues = 0;
  const surface = new SurfaceField();
  const frames = raw.analyses.map(row => {
    const t = row.simulationTimeMs, m = row.maps, F = Uint8Array.from(m.F_skeleton);
    assert.deepEqual(ids(zhangSuen(Uint8Array.from(m.E_qualified))), ids(F));
    const S = new Uint8Array(COUNT);
    for (const i of ids(F)) if (neighbors8(i).some(j => F[j])) S[i] = 1;
    while (add < feet.length && feet[add].t <= t) {
      const foot = feet[add++]; exact[foot.exact] += 1;
      for (const i of foot.nearby) { nearby[i] += 1; lastNearby[i] = foot.t; }
    }
    while (remove < add && feet[remove].t <= t - WINDOW_MS) {
      const foot = feet[remove++]; assert.ok(exact[foot.exact] > 0); exact[foot.exact] -= 1;
      for (const i of foot.nearby) { assert.ok(nearby[i] > 0); nearby[i] -= 1; }
    }
    // Independent timestamp filtering checks the rolling window at three fixed anchors.
    if ([20, 84, 119].includes(Math.floor(t / 1000))) {
      const exactDirect = new Uint32Array(COUNT), nearbyDirect = new Uint32Array(COUNT);
      for (const foot of feet.filter(foot => foot.t > t - WINDOW_MS && foot.t <= t)) {
        exactDirect[foot.exact] += 1;
        for (const i of foot.nearby) nearbyDirect[i] += 1;
      }
      assert.deepEqual(exact, exactDirect); assert.deepEqual(nearby, nearbyDirect);
    }
    const s = ids(S); surface.values.set(m.C_surface);
    for (const i of s) {
      const value = Math.fround(surface.sampleSupport(i % N / 95, Math.floor(i / N) / 95, .025));
      assert.equal(value, m.D_support[i], 'current pure C→D readout matches frozen diagnostic support'); comparedSupportValues += 1;
    }
    const before = new Uint8Array(COUNT), after = new Uint8Array(COUNT);
    for (const b of births) {
      if (b.timeMs < t) for (const i of b.cells) before[i] += 1;
      if (b.timeMs <= t) for (const i of b.cells) after[i] = 1;
    }
    assert.deepEqual(ids(after), ids(m.J_frozen_material_union), 'actual descriptor union matches saved post-analysis material');
    return { timeMs: t, tick: row.tick, E: ids(m.E_qualified), F: ids(F), S: s,
      channels: { D: s.map(i => m.D_support[i]), B: s.map(i => m.B_memory[i]), C: s.map(i => m.C_surface[i]), recent: s.map(i => nearby[i]) },
      exactFeet20s: s.map(i => exact[i]), lastNearbyFootAgeSeconds: s.map(i => Number.isFinite(lastNearby[i]) ? (t - lastNearby[i]) / 1000 : null),
      preMaterialLayers: s.map(i => before[i]), exposureSeconds: Math.min(20, t / 1000), windowFeet: add - remove,
      globalMaxima: { D: fullMaximum(m.D_support, S), B: fullMaximum(m.B_memory, S), C: fullMaximum(m.C_surface, S),
        recent: fullMaximum(nearby, S), exactFeet: fullMaximum(exact, S) } };
  });
  const checkpointBase = 'docs/ant/evidence/2026-10-25-g-production-candidate-review/data/';
  const checksumsFile = checkpointBase + 'SHA256SUMS.json', checksumsBytes = readFileSync(checksumsFile);
  const checksums = JSON.parse(checksumsBytes), checkpoints = [];
  for (const seed of [20261005, 20261006, 20261007]) for (const seconds of [30, 60, 120, 300, 600]) {
    const name = `seed${seed}-G-${seconds}s.json.gz`, path = checkpointBase + name, b = readFileSync(path);
    assert.equal(sha(b), checksums[name]); const d = JSON.parse(gunzipSync(b));
    assert.equal(d.seed, seed); assert.equal(d.arm, 'G'); assert.equal(d.seconds, seconds);
    assert.equal(d.surface.width, N); assert.equal(d.surface.height, N); assert.equal(d.surface.values.length, COUNT);
    checkpoints.push({ seed, seconds, path, sha256: sha(b), available: Object.keys(d) });
  }
  const strataPath = 'docs/ant/evidence/2026-10-29-stratigraphy-signal-audit/data/reconstructed-commit-context.json.gz';
  const strataBytes = readFileSync(strataPath);
  assert.equal(sha(strataBytes), 'a62ad65b772db8d040ed9bebf636e8af32d2d185ea65fead4a431262964df0e5');
  const strata = JSON.parse(gunzipSync(strataBytes));
  const raw600Path = checkpointBase + 'seed20261005-G-raw.json.gz', raw600Bytes = readFileSync(raw600Path);
  assert.equal(sha(raw600Bytes), 'a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414');
  const receipts = JSON.parse(gunzipSync(raw600Bytes)).births;
  assert.equal(strata.commits.length, receipts.length); assert.equal(receipts.length, 36);
  const actualBirths600 = strata.commits.map((c, i) => {
    const r = receipts[i]; assert.equal(c.id, r.id); assert.equal(c.bornAtSimulationTimeMs, r.bornAtSimulationTimeMs);
    assert.equal(sha(Uint8Array.from(c.descriptor.mask)), r.maskSha256);
    return { id: c.id, timeMs: c.bornAtSimulationTimeMs, cells: ids(c.descriptor.mask) };
  });
  for (let i = 0; i < births.length; i += 1) assert.deepEqual(actualBirths600[i], births[i]);
  return { schema: 'ant-opportunity-input-v1', main: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785',
    researchParent: 'b0ecad708bff8421cd01c384e4a3dad34203a3f2', seed: raw.seed, heading: 'H0', originalHz: 60, audio: raw.audio,
    primaryRawRef: REF, primaryGzipSha256: RAW_SHA, primaryJsonSha256: sha(gunzipSync(bytes)), sourceProvenance: raw.provenance,
    sourceSha256LF: { TrailPlateBirth: TRAIL_SHA, SurfaceField: SURFACE_SHA }, contactWindowSeconds: 20,
    footContextRadius: FOOT_CONTEXT_RADIUS, contacts: { groups: raw.contacts.length, rawFeet, inDomainFeet: feet.length },
    validation: { thinningFrames: frames.length, supportReadoutValues: comparedSupportValues, supportReadoutExact: true,
      materialPostUnionsExact: frames.length }, births, frames,
    secondary: { description: 'Unconditioned mechanical checkpoints only; no E/F/B-memory or actual material masks inferred',
      checksumsFile, checksumsSha256: sha(checksumsBytes), checkpoints,
      actualMaterial: { seed: 20261005, path: strataPath, sha256: sha(strataBytes), receiptPath: raw600Path,
        receiptSha256: sha(raw600Bytes), verification: '36/36 IDs, timestamps and mask-byte SHA match original actual birth receipts',
        caveat: 'Only descriptor masks used; replay field samples/source-version caveat are not imported', births: actualBirths600 } } };
}
const oldRandom = Math.random; Math.random = () => { throw new Error('No RNG in frozen extraction'); };
let input;
try { input = buildInput(); } finally { Math.random = oldRandom; }
const text = JSON.stringify(input) + '\n', destination = BASE + '/data/frozen-input.json.gz';
if (process.argv.includes('--check')) assert.equal(gunzipSync(readFileSync(destination)).toString(), text);
else { mkdirSync(BASE + '/data', { recursive: true }); writeFileSync(destination, gzipSync(text, { level: 9 })); }
console.log('Opportunity extract ' + (process.argv.includes('--check') ? 'deterministic check passed' : 'written')
  + '; gzip SHA-256 ' + sha(readFileSync(destination)) + '; ' + input.frames.length + ' exact states');
