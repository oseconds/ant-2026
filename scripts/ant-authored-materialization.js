import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { captureStructuralPackets } from './ant-authored-capture-core.js';

const BASE = 'docs/ant/evidence/2026-10-29-authored-materialization-law-synthesis';
const INPUT = 'docs/ant/evidence/2026-10-29-proposal-emergence-exploration/data/frozen-inputs.json.gz';
const INPUT_SHA = '6ff3ec3d6fb8bc0fa1f323532361ab9d19ecc0e75353b1b9ce3d6875c440842d';
const SOURCE_SHA = 'cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67';
const N = 96, COUNT = N * N, RADIUS = .15;
const sha = b => createHash('sha256').update(b).digest('hex');
const lf = s => s.replace(/\r\n?/g, '\n');
const sorted = x => [...x].sort((a, b) => a - b);
const cells = m => Array.from(m, (v, i) => v ? i : -1).filter(i => i >= 0);
const mask = a => { const m = new Uint8Array(COUNT); for (const i of a) m[i] = 1; return m; };
const point = i => [i % N / 95, Math.floor(i / N) / 95];
function sourceFunctions() {
  const code = lf(readFileSync('src/lib/agents/ant/TrailPlateBirth.js', 'utf8'));
  assert.equal(sha(code), SOURCE_SHA);
  const math = Object.create(Math); math.random = () => { throw new Error('No RNG'); };
  return runInNewContext(code.replace(/^export /gm, '') + '\n({zhangSuen,neighbors,MinHeap,skeletonComponents})', { Math: math });
}
function chooseNucleus(F, D, f) {
  const eligible = cells(F).filter(i => f.neighbors(i).some(j => F[j]));
  eligible.sort((a, b) => D[b] - D[a] || a - b);
  if (!eligible.length) return null;
  const nucleus = eligible[0], value = D[nucleus];
  return { index: nucleus, point: point(nucleus), D: value, eligibleNodes: eligible.length,
    exactMaxTies: eligible.filter(i => D[i] === value).length,
    runnerUpGap: eligible.length > 1 ? value - D[eligible[1]] : null };
}
function distancesWithin(m, nucleus, f) {
  const d = new Float64Array(COUNT).fill(Infinity); d[nucleus] = 0;
  const heap = new f.MinHeap(); heap.push(0, nucleus);
  while (heap.length) {
    const [distance, i] = heap.pop(); if (distance !== d[i]) continue;
    for (const j of f.neighbors(i)) {
      if (!m[j]) continue;
      const next = distance + Math.hypot(i % N - j % N, Math.floor(i / N) - Math.floor(j / N)) / 95;
      if (next < d[j]) { d[j] = next; heap.push(next, j); }
    }
  }
  return d;
}
function metrics(indices, F, nucleus, f) {
  assert.equal(new Set(indices).size, indices.length);
  for (const i of indices) assert.ok(Number.isInteger(i) && F[i], 'proposal inside F');
  const m = mask(indices), graphDistances = distancesWithin(m, nucleus, f), edges = [], degrees = [];
  for (const i of sorted(indices)) {
    const adjacent = f.neighbors(i).filter(j => m[j]); degrees.push(adjacent.length);
    for (const j of adjacent) if (i < j) edges.push([i, j]);
  }
  const components = f.skeletonComponents(m).length;
  assert.equal(components, 1);
  const [x, y] = point(nucleus), euclidean = indices.map(i => { const p = point(i); return Math.hypot(p[0] - x, p[1] - y); });
  assert.ok(Math.max(...euclidean) <= RADIUS + 1e-12);
  return { nodes: indices.length, inducedEdges: edges.length, components,
    inducedJunctionNodes: degrees.filter(d => d >= 3).length, inducedCycleRank: edges.length - indices.length + components,
    maxEuclidean: Math.max(...euclidean), maxGeodesicWithinProposal: Math.max(...indices.map(i => graphDistances[i])),
    bbox: [Math.min(...indices.map(i => i % N)), Math.min(...indices.map(i => Math.floor(i / N))),
      Math.max(...indices.map(i => i % N)), Math.max(...indices.map(i => Math.floor(i / N)))] };
}
function build(F, D, f) {
  const inputFHash = sha(F);
  const nucleus = chooseNucleus(F, D, f);
  if (!nucleus) return { nucleus: null, candidates: null };
  const cap = captureStructuralPackets({ F, nucleus: nucleus.index, radius: RADIUS });
  assert.ok(cap.G.every(i => cap.X.includes(i)), 'graph ball subset of connected Euclidean capture');
  assert.ok(cap.L.every(i => cap.G.includes(i)), 'limb subset of graph ball');
  const candidates = Object.fromEntries(['G', 'X', 'L'].map(k => [k, { cells: cap[k], ...metrics(cap[k], F, nucleus.index, f) }]));
  assert.ok(candidates.G.maxGeodesicWithinProposal <= RADIUS + 1e-12);
  assert.ok(candidates.L.maxGeodesicWithinProposal <= RADIUS + 1e-12);
  assert.equal(sha(F), inputFHash, 'capture does not mutate its structural input');
  return { nucleus, referencePath: cap.L, graphParentEdges: cap.parentEdges, candidates };
}
function overlap(a, b) {
  const y = new Set(b), shared = a.filter(i => y.has(i)).length;
  return { from: a.length, to: b.length, shared, jaccard: shared / (a.length + b.length - shared || 1) };
}
function synthetic(f) {
  const full = new Uint8Array(COUNT).fill(1), D = new Float32Array(COUNT); D[48 * N + 48] = 1;
  const dense = build(full, D, f);
  const plateau = chooseNucleus(full, new Float32Array(COUNT).fill(1), f);
  assert.equal(plateau.index, 0); assert.equal(plateau.exactMaxTies, COUNT);
  const sparse = new Uint8Array(COUNT); sparse[10] = 1;
  assert.equal(build(sparse, D, f).nucleus, null);
  const ids = [40 * N + 40, 40 * N + 41, 40 * N + 42];
  const F = mask(ids), score = new Float32Array(COUNT); score[ids[1]] = 1;
  const unique = build(F, score, f);
  const translated = ids.map(i => i + N + 1), shiftedScore = new Float32Array(COUNT); shiftedScore[translated[1]] = 1;
  const moved = build(mask(translated), shiftedScore, f);
  for (const k of ['G', 'X', 'L']) assert.deepEqual(moved.candidates[k].cells,
    unique.candidates[k].cells.map(i => i + N + 1));
  return { denseFullF: { nucleus: dense.nucleus, ...Object.fromEntries(['G', 'X', 'L'].map(k => [k,
    { ...dense.candidates[k], cells: undefined }])) }, isolatedPoint: 'no edge-bearing opportunity; no proposal',
    translatedUniqueMaximum: 'exact proposal translation for G/X/L; interior fixture only',
    flatMaximumPlateau: { nucleus: plateau.index, exactMaxTies: plateau.exactMaxTies,
      warning: 'Row-major tie selection chooses a window corner on a flat field; not rotation or translation neutral.' },
    warning: 'Dense F remains area-like within a bounded radius. No total arc, area or branch quota is claimed.' };
}
function analyze(input, f) {
  const events = input.events.map(e => {
    const anchors = e.anchors.map(a => {
      const before = sha(JSON.stringify(a)), F = Uint8Array.from(a.maps.F_skeleton), E = Uint8Array.from(a.maps.E_qualified);
      assert.deepEqual(cells(f.zhangSuen(E)), cells(F), 'saved F parity');
      const result = build(F, a.maps.D_support, f);
      assert.equal(sha(JSON.stringify(a)), before);
      for (const k of ['G', 'X', 'L']) assert.ok(result.candidates[k].cells.every(i => E[i]));
      return { timeMs: a.timeMs, FNodes: cells(F).length, ENodes: cells(E).length, productionINodes: cells(a.maps.I_retained_network).length, ...result };
    });
    const final = anchors.at(-1), F = Uint8Array.from(e.anchors.at(-1).maps.F_skeleton);
    const path = final.referencePath, deleted = path.length > 1 ? path[Math.max(1, Math.floor(path.length / 2))] : null;
    let stress = { skipped: 'no non-nucleus reference-path cell' };
    if (deleted !== null) {
      assert.notEqual(deleted, final.nucleus.index); F[deleted] = 0;
      const result = build(F, e.anchors.at(-1).maps.D_support, f);
      const fromOldNucleus = distancesWithin(F, final.nucleus.index, f);
      const oldG = final.candidates.G.cells, newG = new Set(result.candidates?.G.cells ?? []);
      const dropped = oldG.filter(i => !newG.has(i));
      const dropAudit = { deleted: dropped.filter(i => !F[i]).length,
        disconnectedFromOldNucleus: dropped.filter(i => F[i] && !Number.isFinite(fromOldNucleus[i])).length,
        sameComponentNowBeyondR: dropped.filter(i => F[i] && Number.isFinite(fromOldNucleus[i]) && fromOldNucleus[i] > RADIUS + 1e-12).length,
        stillWithinROfOldNucleus: dropped.filter(i => F[i] && fromOldNucleus[i] <= RADIUS + 1e-12).length };
      assert.equal(Object.values(dropAudit).reduce((a, b) => a + b, 0), dropped.length);
      stress = { deleted, oldNucleus: final.nucleus.index, newNucleus: result.nucleus?.index ?? null,
        relation: 'One F graph-cell removed; original E/D unchanged. Not a natural-world counterfactual.',
        graphPacketDropAudit: dropAudit,
        candidates: Object.fromEntries(['G', 'X', 'L'].map(k => [k,
          { ...overlap(final.candidates[k].cells, result.candidates?.[k]?.cells ?? []), result: result.candidates?.[k] ?? null }])) };
    }
    const transitions = anchors.slice(1).map((a, i) => ({ fromMs: anchors[i].timeMs, toMs: a.timeMs,
      seconds: (a.timeMs - anchors[i].timeMs) / 1000, nucleusMoved: anchors[i].nucleus.index !== a.nucleus.index,
      ...Object.fromEntries(['G', 'X', 'L'].map(k => [k, overlap(anchors[i].candidates[k].cells, a.candidates[k].cells)])) }));
    return { id: e.id, anchors, transitions, stress };
  });
  return { schema: 'ant-authored-materialization-v1', main: input.main,
    researchParent: '9118a9505c57f0ed6ebb50437c87e5c6846f0239', input: INPUT, inputSha256: INPUT_SHA,
    sourceSha256LF: SOURCE_SHA, seed: input.seed, heading: input.heading, audio: input.audio,
    authoredRadius: RADIUS, technicalEpsilon: 1e-12, naturalReplays: 0,
    parity: '10/10 exact saved F from E; all proposal cells in original F and E; no RNG or input mutation', events,
    fixtures: synthetic(f) };
}
const bytes = readFileSync(INPUT); assert.equal(sha(bytes), INPUT_SHA);
const input = JSON.parse(gunzipSync(bytes)), f = sourceFunctions(), originalRandom = Math.random;
Math.random = () => { throw new Error('No RNG in authored capture exploration'); };
let result;
try { result = analyze(input, f); } finally { Math.random = originalRandom; }
const text = JSON.stringify(result, null, 2) + '\n';
if (process.argv.includes('--check')) assert.equal(lf(readFileSync(BASE + '/analysis.json', 'utf8')), text);
else writeFileSync(BASE + '/analysis.json', text);
console.log('Authored frozen capture analysis ' + (process.argv.includes('--check') ? 'deterministic check passed' : 'written'));
