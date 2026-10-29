import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { analyzeEmergenceLandscape } from './ant-emergence-landscape.js';

const BASE = 'docs/ant/evidence/2026-10-29-proposal-emergence-exploration';
const INPUT = BASE + '/data/frozen-inputs.json.gz';
const SOURCE = 'src/lib/agents/ant/TrailPlateBirth.js';
const RAW_REF = '0d5096a920e1ebb2086fa1dae782c5d4e871b590:docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz';
const RAW_SHA = '909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc';
const SOURCE_SHA = 'cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67';
const INPUT_SHA = '6ff3ec3d6fb8bc0fa1f323532361ab9d19ecc0e75353b1b9ce3d6875c440842d';
const N = 96, SIZE = N * N;
const sha = value => createHash('sha256').update(value).digest('hex');
const lf = value => value.replace(/\r\n?/g, '\n');
const sorted = values => [...values].sort((a, b) => a - b);
const indices = mask => Array.from(mask, (v, i) => v ? i : -1).filter(i => i >= 0);
const mask = cells => { const m = new Uint8Array(SIZE); for (const i of cells) m[i] = 1; return m; };
const canonical = value => JSON.stringify(value, null, 2) + '\n';
let deadline = Infinity;
function bounded() { assert.ok(performance.now() < deadline, 'Registered 90 s prototype budget exceeded'); }
function sourceFunctions() {
  const code = lf(readFileSync(SOURCE, 'utf8'));
  assert.equal(sha(code), SOURCE_SHA, 'production source hash');
  const protectedMath = Object.create(Math);
  protectedMath.random = () => { throw new Error('RNG forbidden'); };
  return runInNewContext(code.replace(/^export /gm, '')
    + '\n({zhangSuen,skeletonComponents,selectCandidate,neighbors,MinHeap,gridPoint,inSourceAnnulus,nearObservationBoundary})', { Math: protectedMath });
}

function extract() {
  const bytes = execFileSync('git', ['show', RAW_REF], { maxBuffer: 64 * 1024 ** 2 });
  assert.equal(sha(bytes), RAW_SHA);
  const raw = JSON.parse(gunzipSync(bytes));
  assert.equal(raw.seed, 20261005); assert.equal(raw.audio, 'Off'); assert.equal(raw.grid, N);
  const events = [[1, 64, 84], [2, 86, 106]].map(([id, start, end]) => {
    const rows = raw.analyses.filter(r => r.simulationTimeMs / 1000 >= start - 0.01
      && r.simulationTimeMs / 1000 < end + 0.1);
    assert.equal(rows.length, 21);
    const anchors = [0, 10, 18, 19, 20].map(k => {
      const row = rows[k];
      const names = ['B_memory', 'D_support', 'E_qualified', 'F_skeleton', 'G_source_connected',
        'H_boundary_length_eligible', 'I_retained_network'];
      const maps = Object.fromEntries(names.map(name => [name, row.maps[name]]));
      for (const [name, a] of Object.entries(maps)) {
        assert.equal(a.length, SIZE, name); assert.ok(a.every(Number.isFinite));
      }
      return { timeMs: row.simulationTimeMs, candidate: row.candidate, maps, components: row.components };
    });
    const commitIndex = raw.analyses.indexOf(rows.at(-1));
    const tenure = Array.from({ length: SIZE }, (_, i) => {
      let k = commitIndex;
      while (k >= 0 && raw.analyses[k].maps.E_qualified[i]) k -= 1;
      return k === commitIndex ? 0 : (raw.analyses[commitIndex].simulationTimeMs
        - raw.analyses[k + 1].simulationTimeMs) / 1000;
    });
    const meanAbsBChange = Array.from({ length: SIZE }, (_, i) => rows.slice(1)
      .reduce((sum, row, j) => sum + Math.abs(row.maps.B_memory[i] - rows[j].maps.B_memory[i]), 0) / 20);
    return { id, anchors, consolidation: { tenure, meanAbsBChange } };
  });
  return { schema: 'ant-emergence-frozen-v1', main: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785',
    parent: '66e1b9812fc160910f60b18f17e49e8d3b674ee9', seed: raw.seed, heading: 'H0', hz: 60,
    audio: raw.audio, rawRef: RAW_REF, rawGzipSha256: RAW_SHA, rawJsonSha256: sha(gunzipSync(bytes)),
    sourceSha256LF: SOURCE_SHA, events };
}

// Exact graph diameter: all-pairs Dijkstra, not the tree-only two-sweep approximation.
function diameter(skeleton, f) {
  const cells = indices(skeleton), adjacency = new Map(cells.map(i => [i,
    Array.from(f.neighbors(i)).filter(j => skeleton[j]).map(j => [j,
      Math.hypot(i % N - j % N, Math.floor(i / N) - Math.floor(j / N))])]));
  let best = { path: [], lengthGrid: -1, endpoints: [], tiedEndpointPairs: 0 };
  for (const start of cells) {
    bounded();
    const d = new Float64Array(SIZE); d.fill(Infinity); d[start] = 0;
    const parent = new Int32Array(SIZE); parent.fill(-1);
    const heap = new f.MinHeap(); heap.push(0, start);
    while (heap.length) {
      const [distance, i] = heap.pop();
      if (distance !== d[i]) continue;
      for (const [j, cost] of adjacency.get(i)) {
        const next = distance + cost;
        if (next < d[j] - 1e-12 || (Math.abs(next - d[j]) <= 1e-12 && i < parent[j])) {
          d[j] = next; parent[j] = i; heap.push(next, j);
        }
      }
    }
    for (const end of cells) {
      if (end < start || !Number.isFinite(d[end])) continue;
      if (d[end] > best.lengthGrid + 1e-12) {
        const path = [];
        for (let i = end; i >= 0; i = parent[i]) path.push(i);
        path.reverse();
        best = { path, lengthGrid: d[end], endpoints: [start, end], tiedEndpointPairs: 1 };
      } else if (Math.abs(d[end] - best.lengthGrid) <= 1e-12) best.tiedEndpointPairs += 1;
    }
  }
  return best;
}
function line(a, b) {
  let x = a % N, y = Math.floor(a / N);
  const endX = b % N, endY = Math.floor(b / N), dx = Math.abs(endX - x), dy = -Math.abs(endY - y);
  const sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
  let err = dx + dy;
  const result = [];
  while (true) {
    result.push(y * N + x);
    if (x === endX && y === endY) return result;
    const twice = 2 * err;
    if (twice >= dy) { err += dy; x += sx; }
    if (twice <= dx) { err += dx; y += sy; }
  }
}
function chord(E) {
  const cells = indices(E), buckets = new Map();
  for (let a = 0; a < cells.length; a += 1) {
    bounded();
    for (let b = a; b < cells.length; b += 1) {
      const i = cells[a], j = cells[b];
      const d2 = (i % N - j % N) ** 2 + (Math.floor(i / N) - Math.floor(j / N)) ** 2;
      if (!buckets.has(d2)) buckets.set(d2, []);
      buckets.get(d2).push(i * SIZE + j);
    }
  }
  for (const distance of [...buckets.keys()].sort((a, b) => b - a)) {
    bounded();
    let winner = null, ties = 0;
    for (const pair of buckets.get(distance)) {
      const a = Math.floor(pair / SIZE), b = pair % SIZE, path = line(a, b);
      if (!path.every(i => E[i])) continue;
      ties += 1;
      winner ??= { path, endpoints: [a, b], lengthGrid: Math.sqrt(distance) };
    }
    if (winner) return { ...winner, tiedEndpointPairs: ties };
  }
  return { path: [], endpoints: [], lengthGrid: -1, tiedEndpointPairs: 0 };
}
function summary(path, E, B, f) {
  assert.equal(new Set(path).size, path.length, 'simple path/network');
  for (const i of path) assert.ok(Number.isInteger(i) && E[i] === 1, 'proposal contained in E');
  const proposal = mask(path), components = f.skeletonComponents(proposal).length;
  assert.ok(components <= 1, 'finite connected proposal');
  const xs = path.map(i => i % N), ys = path.map(i => Math.floor(i / N));
  return { cells: path.length, components, fractionOfE: path.length / indices(E).length,
    bbox: path.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null,
    bboxDiagonal: path.length ? Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 95 : 0,
    onOuterRim: path.filter(i => i % N === 0 || i % N === 95 || Math.floor(i / N) === 0 || Math.floor(i / N) === 95).length,
    meanB: path.length ? path.reduce((s, i) => s + B[i], 0) / path.length : null };
}
function compare(a, b) {
  const x = new Set(a), y = new Set(b), intersection = a.filter(i => y.has(i)).length;
  return { previous: a.length, next: b.length, intersection, jaccard: intersection / (x.size + y.size - intersection || 1) };
}
function quantiles(values) {
  const a = sorted(values);
  return a.length ? { n: a.length, min: a[0], p25: a[Math.floor((a.length - 1) * .25)],
    median: a[Math.floor((a.length - 1) * .5)], p75: a[Math.floor((a.length - 1) * .75)], max: a.at(-1) } : { n: 0 };
}
function propose(name, E, B, f) {
  if (name === 'A') return diameter(f.zhangSuen(E), f);
  if (name === 'C') return chord(E);
  const landscape = analyzeEmergenceLandscape({ width: N, height: N, E, B });
  const region = landscape.selected?.premergeRegion.cellIndices ?? [];
  return { ...diameter(f.zhangSuen(mask(region)), f), landscape };
}
function run(input) {
  const f = sourceFunctions(), start = performance.now(); deadline = start + 90000;
  const events = [];
  for (const event of input.events) {
    const anchors = [];
    for (const frame of event.anchors) {
      bounded();
      const m = frame.maps, E = Uint8Array.from(m.E_qualified), B = Float32Array.from(m.B_memory);
      const before = sha(JSON.stringify(frame));
      const F = f.zhangSuen(E);
      assert.deepEqual(indices(F), indices(m.F_skeleton), 'production thinning parity');
      const control = f.selectCandidate(E, Float32Array.from(m.D_support), B);
      assert.deepEqual(sorted(Array.from(control.skeletonIndices)), indices(m.I_retained_network), 'production I parity');
      const candidates = {};
      for (const name of ['A', 'B', 'C']) {
        const result = propose(name, E, B, f);
        const landscape = result.landscape;
        candidates[name] = { path: result.path, lengthWorld: Math.max(0, result.lengthGrid) / 95,
          tiedEndpointPairs: result.tiedEndpointPairs, ...summary(result.path, E, B, f),
          ...(landscape ? { landscape } : {}) };
      }
      const stages = Object.fromEntries(['E_qualified', 'F_skeleton', 'G_source_connected',
        'H_boundary_length_eligible', 'I_retained_network'].map(k => [k, {
        cells: indices(m[k]).length, components: f.skeletonComponents(Uint8Array.from(m[k])).length }]));
      const components = f.skeletonComponents(F).map(cells => ({ cells: cells.length,
        sources: cells.filter(i => { const p = f.gridPoint(i); return f.inSourceAnnulus(p.x, p.y); }).length,
        boundaryTargets: cells.filter(i => f.nearObservationBoundary(f.gridPoint(i))).length }));
      const audit = { chemicalQualified: m.B_memory.filter(v => v >= .30).length,
        supportedEComponent: indices(control.supportedMask).length,
        selectedPrincipalPath: control.path.length,
        principalPathLength: control.geodesicLength,
        sourceComponents: components.filter(c => c.sources).length,
        boundaryComponents: components.filter(c => c.boundaryTargets).length,
        bothComponents: components.filter(c => c.sources && c.boundaryTargets).length,
        components,
        winningBoundaryTargets: frame.components.find(c => c.chosenRoot === control.source.index)?.qualifiedTargets.length,
        EOuterRimCells: indices(E).filter(i => i % N === 0 || i % N === 95 || Math.floor(i / N) === 0 || Math.floor(i / N) === 95).length };
      assert.equal(sha(JSON.stringify(frame)), before, 'frozen inputs unchanged');
      anchors.push({ timeMs: frame.timeMs, stages, audit, candidates });
    }
    const frame = event.anchors.at(-1), E = Uint8Array.from(frame.maps.E_qualified), B = Float32Array.from(frame.maps.B_memory);
    const stress = {};
    for (const name of ['A', 'B', 'C']) {
      const original = anchors.at(-1).candidates[name];
      if (!original.path.length) { stress[name] = { skipped: 'empty proposal' }; continue; }
      const deleted = original.path[Math.floor(original.path.length / 2)], changed = E.slice(); changed[deleted] = 0;
      const result = propose(name, changed, B, f);
      summary(result.path, changed, B, f);
      stress[name] = { deleted, path: result.path, ...compare(original.path, result.path),
        lengthWorld: Math.max(0, result.lengthGrid) / 95 };
    }
    const I = new Set(indices(frame.maps.I_retained_network)), H = new Set(indices(frame.maps.H_boundary_length_eligible));
    const groups = { selectedI: [...I], omittedH: [...H].filter(i => !I.has(i)), remainingE: indices(E).filter(i => !H.has(i)) };
    const consolidation = Object.fromEntries(Object.entries(groups).map(([k, cells]) => [k, {
      tenureSeconds: quantiles(cells.map(i => event.consolidation.tenure[i])),
      meanAbsBChangePerAnalysis: quantiles(cells.map(i => event.consolidation.meanAbsBChange[i])) }]));
    const landscapes = Object.fromEntries(['B_memory', 'D_support'].map(k => {
      const l = analyzeEmergenceLandscape({ width: N, height: N, E, B: Float32Array.from(frame.maps[k]) });
      return [k, { localPeaks: l.localPeakCount, finitePeaks: l.finitePeakCount, essentialPeaks: l.essentialPeakCount,
        finiteContrasts: quantiles(l.peaks.filter(p => !p.essential).map(p => p.contrast)), selected: l.selected }];
    }));
    const transitions = anchors.slice(1).map((a, i) => ({ fromMs: anchors[i].timeMs, toMs: a.timeMs,
      seconds: (a.timeMs - anchors[i].timeMs) / 1000,
      E: compare(indices(event.anchors[i].maps.E_qualified), indices(event.anchors[i + 1].maps.E_qualified)),
      I: compare(indices(event.anchors[i].maps.I_retained_network), indices(event.anchors[i + 1].maps.I_retained_network)),
      ...Object.fromEntries(['A', 'B', 'C'].map(k => [k, compare(anchors[i].candidates[k].path, a.candidates[k].path)])) }));
    events.push({ id: event.id, anchors, transitions, stress, consolidation, landscapes });
  }
  bounded();
  return { schema: 'ant-emergence-analysis-v1', inputSha256: sha(readFileSync(INPUT)), sourceSha256LF: SOURCE_SHA,
    productionParity: '10/10 exact E thinning F and actual selector I', noNaturalReplay: true,
    noRNG: true, inputPreservation: '10/10 frame hashes unchanged', events };
}

function selfTest() {
  const f = sourceFunctions();
  const path = [2 * N + 2, 2 * N + 3, 3 * N + 4];
  const d = diameter(mask(path), f); assert.deepEqual(d.path, path); assert.ok(Math.abs(d.lengthGrid - 1 - Math.SQRT2) < 1e-12);
  const loop = [N + 1, N + 2, N + 3, 2 * N + 1, 2 * N + 3, 3 * N + 1, 3 * N + 2, 3 * N + 3];
  // Independent Floyd-Warshall oracle includes cycles, diagonals and disconnected vertices.
  const fixture = [...loop, 20 * N + 20];
  const distances = fixture.map((i, a) => fixture.map((j, b) => a === b ? 0
    : f.neighbors(i).includes(j) ? Math.hypot(i % N - j % N, Math.floor(i / N) - Math.floor(j / N)) : Infinity));
  for (let k = 0; k < fixture.length; k += 1) for (let i = 0; i < fixture.length; i += 1) {
    for (let j = 0; j < fixture.length; j += 1) distances[i][j] = Math.min(distances[i][j], distances[i][k] + distances[k][j]);
  }
  assert.ok(Math.abs(diameter(mask(fixture), f).lengthGrid - Math.max(...distances.flat().filter(Number.isFinite))) < 1e-12);
  assert.deepEqual(diameter(mask([]), f).path, []);
  assert.deepEqual(line(N + 1, 4 * N + 4), [N + 1, 2 * N + 2, 3 * N + 3, 4 * N + 4]);
  const c = chord(mask([N + 1, N + 2, N + 3])); assert.equal(c.lengthGrid, 2); assert.equal(c.tiedEndpointPairs, 1);
  assert.deepEqual(chord(mask([])).path, []);
  assert.deepEqual(compare([1, 2], [2, 3]), { previous: 2, next: 2, intersection: 1, jaccard: 1 / 3 });
  console.log('ant-proposal-emergence self-test passed');
}

const mode = process.argv[2];
if (mode === '--extract') {
  const value = canonical(extract());
  if (process.argv.includes('--check')) assert.equal(gunzipSync(readFileSync(INPUT)).toString(), value);
  else { mkdirSync(BASE + '/data', { recursive: true }); writeFileSync(INPUT, gzipSync(value, { level: 9 })); }
  console.log('exact frozen input extraction verified');
} else if (mode === '--self-test') selfTest();
else if (mode === '--run' || mode === '--check') {
  const bytes = readFileSync(INPUT); assert.equal(sha(bytes), INPUT_SHA, 'compact frozen input hash');
  const input = JSON.parse(gunzipSync(bytes)), originalRandom = Math.random;
  Math.random = () => { throw new Error('No RNG in frozen exploration'); };
  let result;
  try { result = run(input); } finally { Math.random = originalRandom; }
  const output = canonical(result);
  if (mode === '--check') assert.equal(lf(readFileSync(BASE + '/analysis.json', 'utf8')), output);
  else writeFileSync(BASE + '/analysis.json', output);
  console.log('frozen emergence analysis ' + (mode === '--check' ? 'deterministic rerun verified' : 'written'));
} else throw new Error('Use --extract [--check], --self-test, --run or --check');
