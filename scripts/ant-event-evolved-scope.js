import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { TRAIL_PLATE_SIMILARITY_THRESHOLD as THRESHOLD, TRAIL_PLATE_PERSISTENCE_SECONDS as MATURITY } from '../src/lib/agents/ant/TrailPlateBirth.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = resolve(ROOT, 'docs/ant/evidence/2026-10-29-event-evolved-scope');
const STRUCT = 'docs/ant/evidence/2026-10-29-materialization-scope-exploration/data/frozen-structures.json.gz';
const INPUT = resolve(BASE, 'data/frozen-event-input.json.gz');
const SOURCE = 'src/lib/agents/ant/TrailPlateBirth.js';
const RAW = { commit: '0d5096a920e1ebb2086fa1dae782c5d4e871b590', path: 'docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz', sha256: '909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc' };
const N = 96, CELLS = N * N, lf = s => s.replace(/\r\n/g, '\n');
const sha = b => createHash('sha256').update(b).digest('hex');
const sorted = a => [...a].sort((a, b) => a - b);
const difference = (a, b) => { const B = new Set(b); return a.filter(i => !B.has(i)); };
const intersection = (a, b) => { const B = new Set(b); return a.filter(i => B.has(i)); };
const cells = m => m.flatMap((v, i) => v ? [i] : []);
const mask = a => { const m = new Uint8Array(CELLS); for (const i of a) { assert(Number.isInteger(i) && i >= 0 && i < CELLS); m[i] = 1; } return m; };
const json = a => JSON.stringify(a) + '\n';
function summary(values) {
  const a = sorted(values.filter(v => v !== null));
  return a.length ? { min: a[0], median: a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2, max: a.at(-1) } : null;
}
async function sourceFunctions() {
  const code = lf(await readFile(resolve(ROOT, SOURCE), 'utf8'));
  const continuity = code.slice(code.indexOf('function corridorSimilarity('), code.indexOf('function pointOnGridPath('));
  const adjacent = code.slice(code.indexOf('function neighbors('), code.indexOf('function diagonal('));
  assert(continuity.startsWith('function corridorSimilarity(')); assert(adjacent.startsWith('function neighbors('));
  const math = Object.create(Math); math.random = () => { throw new Error('No RNG'); };
  const f = runInNewContext(`const CELL_COUNT=${CELLS},TRAIL_PLATE_GRID_SIZE=${N};\n${adjacent}\n${continuity}\n({corridorSimilarity,maskSimilarity,pathSimilarity,neighbors})`, { Math: math });
  return { f, sourceSha256: sha(code), continuitySliceSha256: sha(continuity + adjacent) };
}
function parts(nodes, neighbors) {
  const unseen = new Set(nodes), result = [];
  for (const start of sorted(nodes)) if (unseen.delete(start)) {
    const q = [start];
    for (let h = 0; h < q.length; h++) for (const j of neighbors(q[h])) if (unseen.delete(j)) q.push(j);
    result.push(q.length);
  }
  return result.sort((a, b) => b - a);
}
async function extract() {
  await assert.rejects(readFile(INPUT), { code: 'ENOENT' }, 'never overwrite frozen extraction');
  const bytes = execFileSync('git', ['show', `${RAW.commit}:${RAW.path}`], { cwd: ROOT, maxBuffer: 64 * 1024 ** 2 });
  assert.equal(sha(bytes), RAW.sha256);
  const raw = JSON.parse(gunzipSync(bytes)), compactBytes = await readFile(resolve(ROOT, STRUCT));
  const compact = JSON.parse(gunzipSync(compactBytes));
  const events = compact.events.map(e => ({ id: e.id, event: e.event, frames: e.frames.map(f => {
    const row = raw.analyses.find(r => r.simulationTimeMs === f.timeMs), I = new Set(f.I);
    assert(row); for (const [name, values] of [['E_qualified', f.E], ['H_boundary_length_eligible', f.H], ['I_retained_network', f.I], ['I_principal_path', f.pathCells]]) assert.deepEqual(cells(row.maps[name]), values);
    const chosen = row.components.find(c => c.chosenRoot === f.candidate.source.index && f.I.every(i => c.cells.includes(i)));
    assert(chosen);
    const parentEdges = chosen.parentEdges.filter(([a, b]) => I.has(a) && I.has(b));
    assert.equal(parentEdges.length, f.I.length - 1);
    return { ...f, principalPath: row.principalPath, ribbonCells: cells(row.maps.J_candidate_ribbon), parentEdges,
      diagnosticQualifiedTargets: chosen.qualifiedTargets };
  }) }));
  const timerFrames = raw.analyses.map(r => ({ timeMs: r.simulationTimeMs, candidate: r.candidate,
    path: r.principalPath, ribbonCells: cells(r.maps.J_candidate_ribbon), births: r.birthsThisTick,
    candidates: r.components.map(c => ({ sourceCount: c.sourceCount, chosenRoot: c.chosenRoot, rejection: c.rejection,
      qualifiedTargets: c.qualifiedTargets.length, cells: c.cells.length })) }));
  await mkdir(resolve(BASE, 'data'), { recursive: true });
  await writeFile(INPUT, gzipSync(json({ schema: 'ant-event-evolution-frozen-input-v1', main: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785', parent: '58ce59fcdb01187cbaf0b6453199556f2c4b5331', seed: raw.seed, audio: raw.audio,
    inputs: [RAW, { path: STRUCT, sha256: sha(compactBytes) }], parentEdgeMeaning: 'saved transformed diagnostic selector output, not production-maintained branch IDs', events, timerFrames }), { level: 9 }));
}
function compareCandidates(f, a, b) {
  const A = { mask: mask(a.ribbonCells), path: a.path ?? a.principalPath }, B = { mask: mask(b.ribbonCells), path: b.path ?? b.principalPath };
  const m = f.maskSimilarity(A.mask, B.mask), p = f.pathSimilarity(A.path, B.path), reverse = f.pathSimilarity(B.path, A.path);
  assert.equal(f.corridorSimilarity(A, B), Math.max(m, p));
  return { maskJaccard: m, pathForward: p, pathReverse: reverse, maximum: Math.max(m, p),
    maskPasses: m >= THRESHOLD, pathPasses: p >= THRESHOLD };
}
function clockReplay(frames, f) {
  let previous = null, start = null;
  return frames.map(r => {
    if (!r.candidate) { previous = null; start = null; assert.equal(r.path.length, 0); return { timeMs: r.timeMs, candidate: false }; }
    const similarity = previous ? compareCandidates(f, previous, r) : null;
    if (!previous || similarity.maximum < THRESHOLD) start = r.timeMs;
    const age = (r.timeMs - start) / 1000;
    assert.equal(start, r.candidate.startedAtMs, 'saved production lineage start');
    assert.equal(age, r.candidate.stableSeconds, 'saved production maturity age');
    previous = r;
    return { timeMs: r.timeMs, candidate: true, startMs: start, stableSeconds: age, similarity,
      mature: age + 1e-9 >= MATURITY, actualBirths: r.births };
  });
}
function availability(nodes, H, E) {
  const h = new Set(H), e = new Set(E), out = { inHAndE: 0, inEOnly: 0, inHOnly: 0, inNeither: 0 };
  nodes.forEach(i => { out[h.has(i) ? (e.has(i) ? 'inHAndE' : 'inHOnly') : (e.has(i) ? 'inEOnly' : 'inNeither')]++; });
  return out;
}
function checkParents(nodes, edges, root) {
  const S = new Set(nodes), parent = new Map(); assert(S.has(root)); assert.equal(edges.length, nodes.length - 1);
  for (const [a, b] of edges) {
    assert(S.has(a) && S.has(b) && b !== root && !parent.has(b));
    assert.equal(Math.max(Math.abs(a % N - b % N), Math.abs(Math.floor(a / N) - Math.floor(b / N))), 1);
    parent.set(b, a);
  }
  for (const start of nodes) {
    const seen = new Set(); let i = start;
    while (i !== root) { assert(parent.has(i) && !seen.has(i), 'diagnostic parent path must reach saved root'); seen.add(i); i = parent.get(i); }
  }
}
function eventAnalysis(e, clocks, f) {
  let core = e.frames[0].I.slice();
  const rows = e.frames.map((r, i) => {
    checkParents(r.I, r.parentEdges, r.candidate.source.index);
    const previous = e.frames[i - 1], retained = previous ? intersection(r.I, previous.I) : r.I.slice();
    const gained = previous ? difference(r.I, previous.I) : [], lost = previous ? difference(previous.I, r.I) : [];
    core = intersection(core, r.I);
    const clock = clocks.find(x => x.timeMs === r.timeMs);
    const degree = new Map(r.I.map(j => [j, 0])); for (const [a, b] of r.parentEdges) { degree.set(a, degree.get(a) + 1); degree.set(b, degree.get(b) + 1); }
    const row = { seconds: r.timeMs / 1000, stableSeconds: r.candidate.stableSeconds,
      I: r.I, H: r.H, E: r.E, retained, gained, lost, continuousSelectedCore: core.slice(),
      ICount: r.I.length, HCount: r.H.length, ECount: r.E.length, pathCount: r.pathCells.length,
      source: r.candidate.source.index, target: r.candidate.target.index, similarity: clock.similarity,
      branchVertexCount: [...degree.values()].filter(d => d >= 3).length,
      currentComponents8: parts(r.I, f.neighbors), lostComponents8: parts(lost, f.neighbors), gainedComponents8: parts(gained, f.neighbors) };
    assert.deepEqual(row.currentComponents8, [r.I.length]);
    if (previous) {
      row.lostAvailabilityNow = availability(lost, r.H, r.E); row.gainedAvailabilityBefore = availability(gained, previous.H, previous.E);
      row.lostFromPreviousPrincipal = intersection(lost, previous.pathCells).length;
      row.gainedOnCurrentPrincipal = intersection(gained, r.pathCells).length;
      row.principalRetained = intersection(previous.pathCells, r.pathCells).length;
      row.principalLost = difference(previous.pathCells, r.pathCells).length; row.principalGained = difference(r.pathCells, previous.pathCells).length;
      row.previousWholePrincipalStillInE = previous.pathCells.every(j => r.E.includes(j));
      row.previousWholePrincipalStillInH = previous.pathCells.every(j => r.H.includes(j));
      row.previousWholeIStillInE = previous.I.every(j => r.E.includes(j));
      row.previousWholeIStillInH = previous.I.every(j => r.H.includes(j));
      row.gainedNearPreviousI = gained.filter(j => previous.I.includes(j) || f.neighbors(j).some(k => previous.I.includes(k))).length;
      row.sourceChanged = row.source !== previous.candidate.source.index; row.targetChanged = row.target !== previous.candidate.target.index;
      const edgeKey = ([a, b]) => a < b ? `${a}:${b}` : `${b}:${a}`;
      const old = new Set(previous.parentEdges.map(edgeKey)), next = new Set(r.parentEdges.map(edgeKey));
      row.parentEdgeLost = [...old].filter(k => !next.has(k)).length; row.parentEdgeGained = [...next].filter(k => !old.has(k)).length;
    }
    return row;
  });
  const t = rows.slice(1), sum = key => t.reduce((s, r) => s + r[key], 0), totals = key => Object.fromEntries(Object.keys(t[0][key]).map(k => [k, t.reduce((s, r) => s + r[key][k], 0)]));
  return { id: e.id, rows, summary: { lost: t.reduce((s, r) => s + r.lost.length, 0), gained: t.reduce((s, r) => s + r.gained.length, 0),
    lostFromPreviousPrincipal: sum('lostFromPreviousPrincipal'), gainedOnCurrentPrincipal: sum('gainedOnCurrentPrincipal'),
    lostAvailabilityNow: totals('lostAvailabilityNow'), gainedAvailabilityBefore: totals('gainedAvailabilityBefore'),
    maskOnlyContinuity: t.filter(r => r.similarity.maskPasses && !r.similarity.pathPasses).length,
    pathOnlyContinuity: t.filter(r => !r.similarity.maskPasses && r.similarity.pathPasses).length,
    bothContinuity: t.filter(r => r.similarity.maskPasses && r.similarity.pathPasses).length,
    maskSimilarity: summary(t.map(r => r.similarity.maskJaccard)), pathSimilarity: summary(t.map(r => r.similarity.pathForward)),
    maxOneStepChanged: Math.max(...t.map(r => r.lost.length + r.gained.length)),
    unchangedSteps: t.filter(r => !r.lost.length && !r.gained.length).length,
    maxLostComponent: Math.max(0, ...t.flatMap(r => r.lostComponents8)), maxGainedComponent: Math.max(0, ...t.flatMap(r => r.gainedComponents8)),
    previousWholePrincipalStillInE: t.filter(r => r.previousWholePrincipalStillInE).length,
    previousWholePrincipalStillInH: t.filter(r => r.previousWholePrincipalStillInH).length,
    changedPrincipalWhilePreviousWholePathStillInE: t.filter(r => (r.principalLost || r.principalGained) && r.previousWholePrincipalStillInE).length,
    previousWholeIStillInE: t.filter(r => r.previousWholeIStillInE).length,
    previousWholeIStillInH: t.filter(r => r.previousWholeIStillInH).length,
    sourceChanges: t.filter(r => r.sourceChanged).length, targetChanges: t.filter(r => r.targetChanged).length } };
}
function translatedFixture(first, f) {
  const shift = (a, dx) => a.map(i => { const x = i % N + dx; assert(x >= 0 && x < N, 'no clipping'); return Math.floor(i / N) * N + x; });
  const frames = Array.from({ length: MATURITY + 1 }, (_, seconds) => ({ timeMs: seconds * 1000, path: shift(first.principalPath, -seconds), ribbonCells: shift(first.ribbonCells, -seconds), I: shift(first.I, -seconds),
    candidate: { startedAtMs: 0, stableSeconds: seconds }, births: 0 }));
  const consecutive = frames.slice(1).map((r, i) => compareCandidates(f, frames[i], r));
  assert(consecutive.every(s => s.maximum >= THRESHOLD));
  const clock = clockReplay(frames, f); assert(clock.at(-1).mature);
  const final = frames.at(-1), overlap = intersection(first.I, final.I).length;
  return { meaning: 'non-natural continuity-only interface fixture; copied actual START geometry, no selector or actual birth',
    steps: MATURITY, translationGridCellsPerSecond: -1, noClipping: true, sameMemberCount: first.I.length,
    finalStableSeconds: clock.at(-1).stableSeconds, finalISharedWithStart: overlap,
    startToEnd: compareCandidates(f, frames[0], final), adjacentMaximum: summary(consecutive.map(s => s.maximum)),
    naturalEvent: false, actualBirthSimulated: false };
}
async function main() {
  if (process.argv.includes('--extract')) await extract();
  const bytes = await readFile(INPUT), input = JSON.parse(gunzipSync(bytes)), { f, ...source } = await sourceFunctions();
  assert.equal(input.schema, 'ant-event-evolution-frozen-input-v1'); assert.equal(input.events.length, 2); assert.equal(input.timerFrames.length, 120);
  const clocks = clockReplay(input.timerFrames, f), events = input.events.map(e => eventAnalysis(e, clocks, f));
  const candidateCensus = input.timerFrames.map(r => ({ seconds: r.timeMs / 1000, eligibleComponents: r.candidates.filter(c => c.rejection === null).length,
    sourceComponents: r.candidates.filter(c => c.sourceCount > 0).length, winnerSource: r.candidate?.source.index ?? null }));
  const result = { schema: 'ant-event-evolved-scope-v1', main: input.main, parent: input.parent, seed: input.seed, originalHz: 60, audio: input.audio,
    inputSha256: sha(bytes), source, clocks, candidateCensus, events, fixture: translatedFixture(input.events[0].frames[0], f),
    noNewWorld: true, noBodyGeneration: true };
  const target = resolve(BASE, 'analysis.json'), text = json(result);
  if (process.argv.includes('--check')) assert.equal(lf(await readFile(target, 'utf8')), text);
  else await writeFile(target, text);
  console.log(JSON.stringify({ events: events.map(e => ({ id: e.id, summary: e.summary })), clockAnchorsMatched: clocks.length,
    competition: candidateCensus.reduce((a, r) => { a[r.eligibleComponents] = (a[r.eligibleComponents] ?? 0) + 1; return a; }, {}), fixture: result.fixture }));
}
async function selfTest() {
  const { f } = await sourceFunctions();
  assert.equal(f.maskSimilarity(mask([0]), mask([0])), 1); assert.equal(f.maskSimilarity(mask([0]), mask([1])), 0);
  assert.equal(f.pathSimilarity([0, 96], [1, 97]), 1); assert.equal(f.pathSimilarity([95], [96]), 0);
  assert.equal(f.pathSimilarity([0], [0, 1]), .5); assert.equal(f.pathSimilarity([0, 1], [0]), 1);
  assert.deepEqual(parts([0, 97], f.neighbors), [2]); assert.deepEqual(parts([95, 96], f.neighbors), [1, 1]);
  assert.deepEqual(availability([0, 1, 2], [0], [0, 1]), { inHAndE: 1, inEOnly: 1, inHOnly: 0, inNeither: 1 });
  checkParents([0, 1, 2], [[0, 1], [1, 2]], 0);
  assert.throws(() => checkParents([0, 1, 96, 97], [[97, 1], [1, 96], [96, 97]], 0));
  assert.equal(lf('a\r\nb'), 'a\nb'); assert.throws(() => mask([-1]));
  console.log('PASS: production function slices, binary overlap, asymmetric neighbor path, row bounds, availability partition, LF and input domain');
}
const random = Math.random; Math.random = () => { throw new Error('No research RNG'); };
try { if (process.argv.includes('--self-test')) await selfTest(); else await main(); } finally { Math.random = random; }
