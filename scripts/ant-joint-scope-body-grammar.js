import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { components, distances, sleeve } from './ant-body-generation-exploration.js';
import { TRAIL_PLATE_TARGET_EDGE_DISTANCE, TRAIL_PLATE_MIN_GEODESIC_LENGTH } from '../src/lib/agents/ant/TrailPlateBirth.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = resolve(ROOT, 'docs/ant/evidence/2026-10-29-joint-scope-body-grammar');
const FILES = {
  early: 'docs/ant/evidence/2026-10-29-material-body-design-space/data/frozen-body-inputs.json.gz',
  history: 'docs/ant/evidence/2026-10-29-materialization-scope-exploration/data/frozen-structures.json.gz',
  later: 'docs/ant/evidence/2026-10-29-stratigraphy-signal-audit/data/reconstructed-commit-context.json.gz',
  prior: 'docs/ant/evidence/2026-10-29-body-diverse-scope-atlas/atlas-data.json'
};
const N = 96, CELLS = N * N, key = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const lf = text => text.replace(/\r\n/g, '\n');
const xy = i => [i % N, Math.floor(i / N)];
const mask = nodes => { const m = Array(CELLS).fill(0); nodes.forEach(i => { m[i] = 1; }); return m; };
const count = m => m.reduce((a, b) => a + b, 0);
const sorted = values => [...values].sort((a, b) => a - b);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function near(i, diagonal = true) {
  const [x, y] = xy(i), a = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
    if (x + dx >= 0 && x + dx < N && y + dy >= 0 && y + dy < N) a.push((y + dy) * N + x + dx);
  }
  return a;
}
function graph(nodes, removeShortcuts = false) {
  assert(nodes.every(i => Number.isInteger(i) && i >= 0 && i < CELLS), '96-grid node domain');
  const S = new Set(nodes), edges = [], adj = new Map(sorted(S).map(i => [i, []]));
  assert.equal(S.size, nodes.length);
  for (const a of adj.keys()) for (const b of near(a)) if (b > a && S.has(b)) {
    const [ax, ay] = xy(a), [bx, by] = xy(b), diagonal = ax !== bx && ay !== by;
    if (removeShortcuts && diagonal && (S.has(ay * N + bx) || S.has(by * N + ax))) continue;
    edges.push([a, b]); adj.get(a).push(b); adj.get(b).push(a);
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const list of adj.values()) list.sort((a, b) => a - b);
  return { nodes: sorted(S), edges, adj };
}
function fromEdges(nodes, edges) {
  const adj = new Map(sorted(nodes).map(i => [i, []]));
  for (const [a, b] of edges) { assert(adj.has(a) && adj.has(b)); adj.get(a).push(b); adj.get(b).push(a); }
  for (const list of adj.values()) list.sort((a, b) => a - b);
  return { nodes: sorted(nodes), edges, adj };
}
function selectorTree(frame) {
  const source = frame.candidate.source.index, g = graph(frame.H), component = parts(g).find(p => p.includes(source));
  assert(component, 'saved source must belong to frozen H');
  const allowed = new Set(component), remaining = new Set(component), distance = new Map(component.map(i => [i, Infinity])), parent = new Map();
  distance.set(source, 0); parent.set(source, -1);
  // shortcut: O(V^2) is deliberate for the bounded frozen early graph; no live selector or new heap abstraction.
  while (remaining.size) {
    const current = [...remaining].sort((a, b) => distance.get(a) - distance.get(b) || a - b)[0];
    remaining.delete(current);
    for (const adjacent of g.adj.get(current)) if (allowed.has(adjacent)) {
      const diagonal = current % N !== adjacent % N && Math.floor(current / N) !== Math.floor(adjacent / N);
      const next = distance.get(current) + (diagonal ? Math.SQRT2 : 1), old = distance.get(adjacent);
      if (next < old - 1e-12 || (Math.abs(next - old) <= 1e-12 && (parent.get(adjacent) === undefined || current < parent.get(adjacent)))) {
        distance.set(adjacent, next); parent.set(adjacent, current);
      }
    }
  }
  const trace = endpoint => { const path = []; for (let i = endpoint; i >= 0; i = parent.get(i)) { assert(!path.includes(i)); path.push(i); } return path.reverse(); };
  const selected = new Set();
  for (const i of component) {
    const [x, y] = xy(i), boundary = Math.min(x, y, 95 - x, 95 - y) / 95 <= TRAIL_PLATE_TARGET_EDGE_DISTANCE;
    if (boundary && distance.get(i) / 95 >= TRAIL_PLATE_MIN_GEODESIC_LENGTH) trace(i).forEach(j => selected.add(j));
  }
  assert.deepEqual(sorted(selected), frame.I, 'frozen-input parent-tree I parity');
  assert.deepEqual(sorted(trace(frame.candidate.target.index)), frame.pathCells, 'principal-path-set parity');
  const edges = sorted(selected).filter(i => i !== source).map(i => [Math.min(i, parent.get(i)), Math.max(i, parent.get(i))]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const tree = fromEdges(sorted(selected), edges);
  assert.equal(edges.length, selected.size - 1); assert.equal(parts(tree).length, 1);
  return tree;
}
function parts(g, subset = g.nodes) {
  const allowed = new Set(subset), seen = new Set(), out = [];
  for (const i of sorted(allowed)) if (!seen.has(i)) {
    const q = [i]; seen.add(i);
    for (let h = 0; h < q.length; h++) for (const j of g.adj.get(q[h])) if (allowed.has(j) && !seen.has(j)) { seen.add(j); q.push(j); }
    out.push(sorted(q));
  }
  return out.sort((a, b) => b.length - a.length || a[0] - b[0]);
}
function units(g) {
  const junctions = g.nodes.filter(i => g.adj.get(i).length >= 3);
  const regions = parts(g, junctions), seen = new Set(), chains = [];
  const walk = (a, b) => {
    const path = [a]; let previous = a, current = b;
    while (true) {
      seen.add(key(previous, current)); path.push(current);
      if (current === a || g.adj.get(current).length !== 2) break;
      const next = g.adj.get(current).find(i => i !== previous);
      if (seen.has(key(current, next))) break;
      previous = current; current = next;
    }
    let length = 0;
    for (let i = 1; i < path.length; i++) { const [x, y] = xy(path[i - 1]), [xx, yy] = xy(path[i]); length += Math.hypot(xx - x, yy - y) / 95; }
    chains.push({ nodes: path, lengthWorld: length });
  };
  for (const i of g.nodes) if (g.adj.get(i).length !== 2) for (const j of g.adj.get(i)) if (!seen.has(key(i, j))) walk(i, j);
  for (const [i, j] of g.edges) if (!seen.has(key(i, j))) walk(i, j);
  assert.equal(seen.size, g.edges.length, 'chain partition must exhaust edges exactly once');
  assert.equal(chains.reduce((a, c) => a + c.nodes.length - 1, 0), g.edges.length);
  chains.sort((a, b) => b.lengthWorld - a.lengthWorld || a.nodes[0] - b.nodes[0] || a.nodes.at(-1) - b.nodes.at(-1));
  const isolated = g.nodes.filter(i => !g.adj.get(i).length);
  assert.deepEqual(sorted(new Set([...chains.flatMap(c => c.nodes), ...isolated])), g.nodes);
  return { junctions, regions, chains, isolated };
}
function holes(m, diagonal) {
  const bg = m.map(v => +!v);
  return components(bg, diagonal).filter(p => !p.some(i => i % N === 0 || i % N === 95 || i < N || i >= CELLS - N)).map(sorted);
}
function summary(g, u) {
  const p = parts(g);
  return { nodes: g.nodes.length, edges: g.edges.length, components: p.map(c => c.length),
    cycleRank: g.edges.length - g.nodes.length + p.length,
    terminals: g.nodes.filter(i => g.adj.get(i).length === 1).length,
    junctionNodes: u.junctions.length, junctionRegions: u.regions.map(c => c.length),
    chainCount: u.chains.length, chainNodeCounts: u.chains.map(c => c.nodes.length),
    chainLengthsWorld: u.chains.map(c => c.lengthWorld) };
}
function audit(nodes) {
  const g = graph(nodes), reduced = graph(nodes, true), u = units(g), v = units(reduced);
  assert.deepEqual(parts(g), parts(reduced), 'shortcut diagnostic must preserve node components');
  const e = new Set(g.edges.map(([a, b]) => key(a, b)));
  assert(reduced.edges.every(([a, b]) => e.has(key(a, b))));
  const m = mask(nodes), h4 = holes(m, false), h8 = holes(m, true);
  return { raw: summary(g, u), noAxialShortcuts: summary(reduced, v), removedDiagonalEdges: g.edges.length - reduced.edges.length,
    degreeChangedNodes: nodes.filter(i => g.adj.get(i).length !== reduced.adj.get(i).length).length,
    junctionClassChangedNodes: nodes.filter(i => (g.adj.get(i).length >= 3) !== (reduced.adj.get(i).length >= 3)).length,
    enclosedBackground4: h4.map(c => c.length), enclosedBackground8: h8.map(c => c.length),
    exactlySharedHoleRegions: h8.filter(p => h4.some(q => same(p, q))).length };
}
function convexLamina(m) {
  const points = m.flatMap((v, i) => v ? [xy(i)] : []).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const half = list => { const h = []; for (const p of list) { while (h.length >= 2 && cross(h.at(-2), h.at(-1), p) <= 0) h.pop(); h.push(p); } return h.slice(0, -1); };
  const hull = half(points).concat(half([...points].reverse())); assert(hull.length >= 3);
  return Array.from({ length: CELLS }, (_, i) => +hull.every((p, j) => cross(p, hull[(j + 1) % hull.length], xy(i)) >= 0));
}
const makeBody = nodes => sleeve(distances(nodes));
function pair(label, source, nodes, includeHull = false) {
  const scope = sorted(new Set(nodes)), K = makeBody(scope);
  const body = { label, source, scope, K, cellsK: count(K), componentsK4: components(K).map(c => c.length),
    enclosedKBackground4: holes(K, false).map(p => p.length), enclosedKBackground8: holes(K, true).map(p => p.length) };
  if (includeHull) { body.H = convexLamina(K); body.cellsH = count(body.H); assert(K.every((v, i) => !v || body.H[i])); }
  return body;
}
function examples(nodes, g = graph(nodes, true)) {
  const u = units(g), region = u.regions[0] ?? [], R = new Set(region);
  const incident = u.chains.filter(c => R.has(c.nodes[0]) || R.has(c.nodes.at(-1)));
  const motif = sorted(new Set([...region, ...incident.flatMap(c => c.nodes)]));
  const union = Array(CELLS).fill(0);
  for (const c of [...u.chains.map(c => c.nodes), ...u.isolated.map(i => [i])]) {
    makeBody(c).forEach((v, i) => { if (v) union[i] = 1; });
  }
  assert.deepEqual(union, makeBody(nodes), 'same-primitive composition must equal direct union');
  return { full: pair('Full representative', 'COMMIT I', nodes, true),
    chain: u.chains.length ? pair('Maximal chain', 'longest degree-two chain in declared graph basis; length then cell-order ties', u.chains[0].nodes) : null,
    motif: region.length ? pair('Junction motif', 'largest junction region in declared graph basis plus every incident maximal chain; no distance cap', motif, true) : null,
    region, incidentChains: incident.length, compositionExactlyEqualsK: true };
}
async function run() {
  const inputs = {};
  for (const [name, path] of Object.entries(FILES)) { const bytes = await readFile(resolve(ROOT, path)); inputs[name] = { path, sha256: sha(path.endsWith('.gz') ? bytes : lf(bytes.toString('utf8'))), value: JSON.parse(path.endsWith('.gz') ? gunzipSync(bytes) : bytes) }; }
  const early = inputs.early.value, history = inputs.history.value, context = inputs.later.value, prior = inputs.prior.value;
  const ids = [...early.events.map(e => e.id), ...prior.selection.map(e => e.id)];
  const descriptors = ids.map(id => context.commits.find(e => e.id === id).descriptor);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(descriptors[i], early.events[i].plate);
    assert.deepEqual(history.events[i].frames.at(-1).I, sorted(descriptors[i].centerline.map(n => n.index)));
  }
  const measurements = descriptors.map(d => {
    const nodes = d.centerline.map(n => n.index), g = graph(nodes);
    assert.deepEqual(g.edges, d.edges, `${d.id} induced-edge equality`);
    return { id: d.id, commitSeconds: d.bornAtSimulationTimeMs / 1000, ...audit(nodes), compositionExactlyEqualsK: examples(nodes).compositionExactlyEqualsK };
  });
  const trees = history.events.map(e => e.frames.map(selectorTree));
  const time = history.events.map((e, eventIndex) => {
    const frames = e.frames.map((f, j) => ({ seconds: f.timeMs / 1000, nodes: f.I, ...audit(f.I), selectorTree: summary(trees[eventIndex][j], units(trees[eventIndex][j])) }));
    const transitions = frames.slice(1).map((f, i) => {
      const a = units(graph(frames[i].nodes, true)), b = units(graph(f.nodes, true)), A = new Set(a.junctions), B = new Set(b.junctions);
      const shared = [...A].filter(j => B.has(j)).length;
      return { seconds: f.seconds, junctionExactJaccard: A.size + B.size - shared ? shared / (A.size + B.size - shared) : null,
        exactRepeatedJunctionRegions: b.regions.filter(p => a.regions.some(q => same(p, q))).length,
        currentJunctionRegions: b.regions.length };
    });
    const treeTransitions = trees[eventIndex].slice(1).map((tree, j) => {
      const a = units(trees[eventIndex][j]), b = units(tree), A = new Set(a.junctions), B = new Set(b.junctions), shared = [...A].filter(i => B.has(i)).length;
      return { seconds: frames[j + 1].seconds, junctionExactJaccard: A.size + B.size - shared ? shared / (A.size + B.size - shared) : null,
        exactRepeatedJunctionRegions: b.regions.filter(p => a.regions.some(q => same(p, q))).length, currentJunctionRegions: b.regions.length };
    });
    return { id: e.id, frames, transitions, treeTransitions, HAtCommit: audit(e.frames.at(-1).H) };
  });
  const events = descriptors.slice(0, 2).map((d, i) => {
    const nodes = d.centerline.map(n => n.index), cases = examples(nodes, trees[i].at(-1)), H = history.events[i].frames.at(-1).H;
    const adjacencyCases = examples(nodes);
    const h8 = holes(mask(H), true), region = h8[0] ?? [];
    const boundary = sorted(new Set(region.flatMap(i => near(i)).filter(i => H.includes(i))));
    // shortcut: this is only a sampled closure-availability view, not persistent loop genealogy or a mode router.
    let closure = null;
    if (region.length) {
      const candidate = pair('Closed-support boundary', 'largest enclosed eight-neighbor background region of COMMIT H; size then cell-order ties', boundary);
      const R = new Set(region), fillable = holes(candidate.K, true).filter(p => p.every(i => R.has(i)));
      const L = candidate.K.slice(); fillable.flat().forEach(i => { L[i] = 1; });
      const availability = history.events[i].frames.map(f => {
        const earlier = holes(mask(f.H), true), present = new Set(earlier.flat());
        return { seconds: f.timeMs / 1000, chosenFaceCellsStillInAnyEnclosedRegion: region.filter(j => present.has(j)).length,
          maximumSingleRegionIntersection: Math.max(0, ...earlier.map(p => p.filter(j => R.has(j)).length)),
          exactSameFacePresent: earlier.some(p => same(p, region)) };
      });
      closure = { ...candidate, hole: region, holeCells: region.length, boundary,
        boundaryComponents8: components(mask(boundary), true).map(c => c.length),
        boundaryInCommitI: boundary.filter(j => d.centerline.some(n => n.index === j)).length,
        face4SubregionSizes: holes(mask(H), false).map(p => p.filter(j => R.has(j)).length).filter(Boolean).sort((a, b) => b - a),
        exactFaceAlsoEnclosedUnder4: holes(mask(H), false).some(p => same(p, region)),
        L, cellsL: count(L), filledCells: count(L) - count(candidate.K),
        componentsL4: components(L).map(c => c.length), availability };
      assert(candidate.K.every((v, j) => !v || L[j]));
      assert(L.every((v, j) => !v || candidate.K[j] || R.has(j)));
    }
    return { id: d.id, commitSeconds: d.bornAtSimulationTimeMs / 1000, context: nodes,
      localUnitBasis: 'deterministic original-parent-tree reconstruction; all42 I/path sets matched', selectorTreeEdges: trees[i].at(-1).edges,
      adjacencyOnlyReferences: { chainNodes: adjacencyCases.chain.scope.length, chainCellsK: adjacencyCases.chain.cellsK,
        motifNodes: adjacencyCases.motif.scope.length, motifCellsK: adjacencyCases.motif.cellsK, motifCellsH: adjacencyCases.motif.cellsH },
      ...cases, closure };
  });
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(events[i].full.K, early.events[i].cases.find(c => c.id === 'K').mask);
  }
  const result = { schema: 'ant-joint-scope-body-grammar-v1',
    baseline: { main: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785', parent: '94e1db2dcc66ecef4cc146272c29477bd6b32830', seed: 20261005, heading: 'H0', originalHz: 60, audio: 'Off', newNaturalRuns: 0 },
    inputs: Object.fromEntries(Object.entries(inputs).map(([name, { path, sha256 }]) => [name, { path, sha256 }])),
    representation: 'induced8 vs diagonal-shortcut-only contrast; no source nodes moved/deleted; no physical branch IDs',
    measurements, time, events };
  const text = JSON.stringify(result) + '\n', target = resolve(BASE, 'analysis.json');
  if (process.argv.includes('--check')) assert.equal(lf(await readFile(target, 'utf8')), text);
  else { await mkdir(BASE, { recursive: true }); await writeFile(target, text); }
  console.log(JSON.stringify({ measurements: measurements.map(m => ({ id: m.id, raw: { edges: m.raw.edges, junctions: m.raw.junctionNodes, cycles: m.raw.cycleRank }, diagnostic: { edges: m.noAxialShortcuts.edges, junctions: m.noAxialShortcuts.junctionNodes, cycles: m.noAxialShortcuts.cycleRank, regions: m.noAxialShortcuts.junctionRegions }, holes8: m.enclosedBackground8 })),
    examples: events.map(e => ({ id: e.id, full: e.full.cellsK, chain: e.chain?.cellsK, chainNodes: e.chain?.scope.length, motif: e.motif?.cellsK, motifNodes: e.motif?.scope.length, motifHull: e.motif?.cellsH, closure: e.closure && { cells: e.closure.holeCells, boundaryNodes: e.closure.boundary.length, components: e.closure.boundaryComponents8, cellsK: e.closure.cellsK, cellsL: e.closure.cellsL, filledCells: e.closure.filledCells } })) }));
}
function selfTest() {
  assert.equal(lf('a\r\nb\r\n'), 'a\nb\n');
  const triangle = [0, 1, 96], a = audit(triangle);
  assert.equal(a.raw.cycleRank, 1); assert.equal(a.noAxialShortcuts.cycleRank, 0); assert.equal(a.removedDiagonalEdges, 1);
  assert.equal(graph([95, 96]).edges.length, 0);
  assert.equal(audit([0, 97, 194]).noAxialShortcuts.edges, 2);
  const square = [0, 1, 96, 97]; assert.equal(audit(square).noAxialShortcuts.cycleRank, 1); assert.deepEqual(audit(square).enclosedBackground8, []);
  const ring = [97, 98, 99, 193, 195, 289, 290, 291]; assert.deepEqual(holes(mask(ring), true).map(p => p.length), [1]);
  assert.equal(units(graph(ring, true)).chains.length, 1);
  const cross = [96, 97, 98, 1, 193]; const u = units(graph(cross, true));
  assert.equal(u.regions.length, 1); assert.equal(u.chains.length, 4); assert.equal(u.junctions.length, 1);
  assert(examples(cross).compositionExactlyEqualsK);
  assert.deepEqual(convexLamina(mask([0, 2, 192, 194])).filter(Boolean).length, 9);
  const line = Array.from({ length: 60 }, (_, i) => 48 * N + i + 1);
  const t = selectorTree({ H: line, I: line, pathCells: line, candidate: { source: { index: line.at(-1) }, target: { index: line[0] } } });
  assert.equal(t.edges.length, 59); assert.equal(units(t).junctions.length, 0);
  assert.throws(() => graph([-1]), /node domain/);
  console.log('PASS: node domain, diagonal shortcut, connectivity, row wrap, pure diagonal, filled square versus hole, cycle chain, junction partition, identical-primitive union, convex fill, selector-tree I/path fixture');
}
const originalRandom = Math.random;
Math.random = () => { throw new Error('Research must not consume RNG'); };
try { if (process.argv.includes('--self-test')) selfTest(); else await run(); }
finally { Math.random = originalRandom; }
