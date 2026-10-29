import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { components, distances, sleeve } from './ant-body-generation-exploration.js';
import { TRAIL_PLATE_HALF_WIDTH_RANGE } from '../src/lib/agents/ant/TrailPlateBirth.js';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { MaterialStratigraphy } from '../src/lib/agents/ant/MaterialStratigraphy.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = resolve(ROOT, 'docs/ant/evidence/2026-10-29-material-body-design-space');
const OLD = resolve(ROOT, 'docs/ant/evidence/2026-10-28-plate-body-generation-exploration/data');
const INPUT = resolve(BASE, 'data/frozen-body-inputs.json.gz');
const R = TRAIL_PLATE_HALF_WIDTH_RANGE[0], N = 96;
const ids = ['P', 'K', 'Q', 'U', 'W', 'S'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const maskSha = mask => sha(JSON.stringify(mask) + '\n');
const count = a => a.reduce((s, v) => s + v, 0);
const xy = i => [i % N / 95, Math.floor(i / N) / 95];

function segmentDistanceSquared(x, y, a, b) {
  const [ax, ay] = xy(a), [bx, by] = xy(b), dx = bx - ax, dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
  return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
}

function edgeSleeve(nodes, edges, radius) {
  const segments = edges.concat(nodes.map(i => [i, i]));
  const mask = Array(N * N).fill(0);
  for (const [a, b] of segments) {
    const [ax, ay] = xy(a), [bx, by] = xy(b);
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - radius) * 95));
    const x1 = Math.min(95, Math.ceil((Math.max(ax, bx) + radius) * 95));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - radius) * 95));
    const y1 = Math.min(95, Math.ceil((Math.max(ay, by) + radius) * 95));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (segmentDistanceSquared(x / 95, y / 95, a, b) <= radius ** 2) mask[y * N + x] = 1;
    }
  }
  return mask;
}

function compare(a, b) {
  let shared = 0, union = 0, xor = 0;
  for (let i = 0; i < a.length; i++) { shared += +(a[i] && b[i]); union += +(a[i] || b[i]); xor += +(a[i] !== b[i]); }
  return { shared, union, xor, jaccard: shared / union };
}

function convexLamina(mask) {
  const points = mask.flatMap((v, i) => v ? [[i % N, Math.floor(i / N)]] : []).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const half = list => {
    const h = [];
    for (const p of list) { while (h.length >= 2 && cross(h.at(-2), h.at(-1), p) <= 0) h.pop(); h.push(p); }
    return h.slice(0, -1);
  };
  assert(points.length >= 3);
  const hull = half(points).concat(half([...points].reverse()));
  assert(hull.length >= 3);
  return Array.from({ length: N * N }, (_, i) => +hull.every((p, j) => cross(p, hull[(j + 1) % hull.length], [i % N, Math.floor(i / N)]) >= 0));
}

async function extract() {
  await assert.rejects(readFile(INPUT), { code: 'ENOENT' });
  const atlasBytes = await readFile(resolve(OLD, 'atlas.json')), resultBytes = await readFile(resolve(OLD, 'results.json'));
  const atlas = JSON.parse(atlasBytes), results = JSON.parse(resultBytes);
  const events = atlas.events.map((e, ordinal) => ({ id: e.id, timeSeconds: e.timeSeconds,
    scope: e.scaffolds.selected, plate: e.plate,
    cases: ids.map(id => {
      const c = e.cases.find(c => c.id === id), receipt = results.events[ordinal].cases.find(c => c.id === id);
      assert.equal(maskSha(c.mask), receipt.maskSha256);
      return { id, mask: c.mask, material: c.material, priorMetrics: c.metrics };
    }) }));
  assert.deepEqual(events.map(e => e.scope.length), [122, 181]);
  await mkdir(resolve(BASE, 'data'), { recursive: true });
  await writeFile(INPUT, gzipSync(json({ schema: 'ant-fixed-scope-body-inputs-v1',
    main: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785', parent: '2c5b0be686bec5eab854b33cd3a473bea2cf908e',
    seed: 20261005, hz: 60, heading: 'H0', audio: 'Off', naturalReplays: 0,
    inputs: [{ path: 'docs/ant/evidence/2026-10-28-plate-body-generation-exploration/data/atlas.json', sha256: sha(atlasBytes) },
      { path: 'docs/ant/evidence/2026-10-28-plate-body-generation-exploration/data/results.json', sha256: sha(resultBytes) }], events }), { level: 9 }));
}

function thickness(e) { return Math.max(.001, Math.min(.01, .001 + .05 * e.plate.meanHalfWidth)); }
function fixture(e, c, thicknessScale = 1) {
  return { id: e.id, bornAtSimulationTimeMs: e.plate.bornAtSimulationTimeMs,
    grid: { width: N, height: N }, mask: c.mask.slice(), pickups: structuredClone(e.plate.pickups),
    material: { ...e.plate.material }, meanHalfWidth: R, thicknessMeters: thickness(e) * thicknessScale,
    centerline: [], edges: [], principalPath: [],
    provenance: { researchOnly: true, fixedScope: true, candidate: c.id, explicitThicknessHeld: true } };
}

function topology(t) {
  const owner = new Int32Array(t.nodeGridIndices.length).fill(-1), sizes = [];
  for (let i = 0; i < owner.length; i++) if (owner[i] < 0) {
    const q = [i], id = sizes.length; owner[i] = id;
    for (let head = 0; head < q.length; head++) for (let k = 0; k < 4; k++) {
      const j = t.neighborIndices[q[head] * 4 + k];
      if (j >= 0 && owner[j] < 0) { owner[j] = id; q.push(j); }
    }
    sizes.push(q.length);
  }
  const pickups = Array.from(t.pickupNodeIndices);
  return { nodes: owner.length, gridIndices: Array.from(t.nodeGridIndices), components: sizes,
    pickups, pickupComponents: pickups.map(i => owner[i]),
    validPickups: pickups.every(i => i < owner.length), coefficients: Array.from(t.materialCoefficients),
    adjacentLinks: t.adjacentLinkCoefficients.length, zCoefficients: Array.from(t.adjacentLinkCoefficients) };
}

function stack(events, id, scale = 1) {
  const m = new MaterialStratigraphy();
  events.forEach((e, i) => m.addPlate(fixture(e, e.cases.find(c => c.id === id), i ? scale : 1)));
  const t = compileSurfaceTopology(m.getAudioState());
  return { m, t, summary: { layers: m.plates.length, nodes: t.nodeGridIndices.length,
    union: Array.from(m.layerCountByCell).filter(v => v > 0).length,
    overlap: Array.from(m.layerCountByCell).filter(v => v === 2).length,
    zLinks: t.adjacentLinkCoefficients.length, zCoefficients: Array.from(t.adjacentLinkCoefficients),
    thicknessMeters: m.plateThicknessMeters.slice(), maxBuriedDepth: Math.max(...m.totalDepthByCellMeters) } };
}

function analyze(packet) {
  const events = packet.events.map(e => {
    const K = e.cases.find(c => c.id === 'K');
    assert.deepEqual(sleeve(distances(e.scope)), K.mask);
    assert.deepEqual(e.plate.centerline.map(n => n.index).sort((a, b) => a - b), e.scope);
    assert.equal(new Set(e.scope).size, e.scope.length);
    const allowed = new Set(e.scope);
    assert(e.plate.edges.every(edge => edge.every(i => allowed.has(i))));
    const X = { id: 'X', mask: edgeSleeve(e.scope, e.plate.edges, R), material: { ...e.plate.material } };
    assert(X.mask.every((v, i) => v >= K.mask[i])); assert(e.scope.every(i => X.mask[i]));
    const H = { id: 'H', mask: convexLamina(K.mask), material: { ...e.plate.material } };
    assert(H.mask.every((v, i) => v >= K.mask[i]));
    const cases = e.cases.concat(X, H).map(c => ({ ...c, cells: count(c.mask),
      sourceComponents4: components(c.mask).map(a => a.length), sourceComponents8: components(c.mask, true).map(a => a.length),
      maskSha256: maskSha(c.mask) }));
    const singles = ['K', 'X'].map(id => {
      const c = cases.find(c => c.id === id), descriptor = fixture(e, c), before = JSON.stringify(descriptor);
      const t = compileSurfaceTopology({ plates: [descriptor] }); assert.equal(JSON.stringify(descriptor), before);
      return { id, ...topology(t), thicknessHeldMeters: descriptor.thicknessMeters };
    });
    const a = new Set(singles[0].gridIndices), b = new Set(singles[1].gridIndices);
    return { ...e, cases, laminaComparison: { KHsource: compare(K.mask, H.mask), compilerChecked: false,
      interpretation: 'new cohesive spanning assumption, not environmental support or cleanup' }, technical: { singles, KXsource: compare(K.mask, X.mask),
      KXsolver: { shared: [...a].filter(i => b.has(i)).length, union: new Set([...a, ...b]).size,
        sameOccupancy: a.size === b.size && [...a].every(i => b.has(i)) } } };
  });
  const K = stack(events, 'K'), X = stack(events, 'X'), doubled = stack(events, 'K', 2);
  assert.deepEqual(K.t, doubled.t);
  assert(doubled.summary.maxBuriedDepth > K.summary.maxBuriedDepth);
  return { schema: 'ant-body-design-space-v1', radiusWorld: R,
    scopeFixed: true, naturalReplays: 0, events,
    stacks: { K: K.summary, X: X.summary }, thicknessFixture: { manipulation: 'double only explicit P2 thickness in the same K stack',
      baseline: K.summary, doubled: doubled.summary, fullCompiledTopologyIdentical: true,
      noNoduleAdvance: true, interpretation: 'depth metadata is not an input to this Plate solver or overlap-based Z compiler' } };
}

function selfTest() {
  assert.equal(segmentDistanceSquared(.5, 0, 0, 95), 0);
  assert.equal(segmentDistanceSquared(.5, .2, 0, 95), .2 ** 2);
  assert.equal(segmentDistanceSquared(0, 0, 0, 0), 0);
  assert.equal(segmentDistanceSquared(1, 0, 0, 1), (1 - 1 / 95) ** 2);
  const a = edgeSleeve([0, 97], [[0, 97]], R), b = edgeSleeve([0, 97], [[97, 0]], R);
  assert.deepEqual(a, b); assert(a[0] && a[97]); assert.equal(a[9215], 0);
  const square = Array(N * N).fill(0); [0, 2, 192, 194].forEach(i => { square[i] = 1; });
  const filled = convexLamina(square); assert.equal(count(filled), 9); assert(filled[97]); assert.equal(filled[3], 0);
  console.log('PASS: segment interior/end clamps, degenerate edge, reversal symmetry, finite containment, convex interior/boundary');
}

if (process.argv.includes('--self-test')) selfTest();
else {
  if (process.argv.includes('--extract')) await extract();
  const input = await readFile(INPUT), packet = JSON.parse(gunzipSync(input));
  const output = JSON.stringify({ ...analyze(packet), frozenInputSha256: sha(input) }) + '\n';
  assert.equal(sha(await readFile(INPUT)), sha(input));
  const target = resolve(BASE, 'analysis.json');
  if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), output);
  else await writeFile(target, output);
  const result = JSON.parse(output);
  console.log(JSON.stringify({ events: result.events.map(e => ({ id: e.id, KXsource: e.technical.KXsource, KXsolver: e.technical.KXsolver,
    singles: e.technical.singles.map(({ id, nodes, components, validPickups }) => ({ id, nodes, components, validPickups })) })),
    stacks: Object.fromEntries(Object.entries(result.stacks).map(([id, { zCoefficients, ...rest }]) => [id, rest])),
    thicknessIdenticalTopology: result.thicknessFixture.fullCompiledTopologyIdentical }));
}
