import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = resolve(ROOT, 'docs/ant/evidence/2026-10-29-materialization-scope-exploration');
const SPEC = { commit: '0d5096a920e1ebb2086fa1dae782c5d4e871b590',
  path: 'docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz',
  sha256: '909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc' };
const BODY = resolve(ROOT, 'docs/ant/evidence/2026-10-28-plate-body-generation-exploration/data/inputs.json.gz');
const INPUT = resolve(BASE, 'data/frozen-structures.json.gz');
const sha = b => createHash('sha256').update(b).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const cells = mask => mask.flatMap((v, i) => v ? [i] : []);
const set = a => new Set(a);
const intersect = (a, b) => { const right = set(b); return a.filter(i => right.has(i)); };

function neighbors(i, diagonal = true) {
  const x = i % 96, y = Math.floor(i / 96), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
    if (x + dx >= 0 && x + dx < 96 && y + dy >= 0 && y + dy < 96) out.push((y + dy) * 96 + x + dx);
  }
  return out;
}

function edges(a) {
  const active = set(a), result = [];
  for (const i of a) for (const j of neighbors(i)) if (j > i && active.has(j)) result.push(`${i}:${j}`);
  return result.sort();
}

function components(a, diagonal = true) {
  const unseen = set(a), sizes = [];
  for (const start of a) if (unseen.delete(start)) {
    const queue = [start];
    for (let head = 0; head < queue.length; head++) for (const j of neighbors(queue[head], diagonal)) {
      if (unseen.delete(j)) queue.push(j);
    }
    sizes.push(queue.length);
  }
  return sizes.sort((a, b) => b - a);
}

function compare(a, b) {
  const shared = intersect(a, b).length, union = a.length + b.length - shared;
  return { previous: a.length, next: b.length, shared, lost: a.length - shared,
    gained: b.length - shared, union, jaccard: union ? shared / union : null };
}

function summary(values) {
  const a = [...values].sort((a, b) => a - b);
  const middle = Math.floor(a.length / 2);
  return { min: a[0], median: a.length % 2 ? a[middle] : (a[middle - 1] + a[middle]) / 2, max: a.at(-1) };
}

async function extract() {
  await assert.rejects(readFile(INPUT), { code: 'ENOENT' });
  const raw = execFileSync('git', ['show', `${SPEC.commit}:${SPEC.path}`], { cwd: ROOT, maxBuffer: 64 * 1024 ** 2 });
  assert.equal(sha(raw), SPEC.sha256);
  const history = JSON.parse(gunzipSync(raw)), bodyBytes = await readFile(BODY);
  const body = JSON.parse(gunzipSync(bodyBytes));
  assert.equal(history.seed, 20261005);
  const events = body.events.map(e => {
    const a = e.event, frames = history.analyses.slice(a.startAnalysisIndex, a.endAnalysisIndex + 1).map(f => ({
      timeMs: f.simulationTimeMs, candidate: f.candidate,
      I: cells(f.maps.I_retained_network), pathCells: cells(f.maps.I_principal_path),
      H: cells(f.maps.H_boundary_length_eligible), E: cells(f.maps.E_qualified)
    }));
    assert.equal(frames.length, 21);
    assert.deepEqual(frames.at(-1).I, e.scaffolds.selected);
    assert.deepEqual(frames.at(-1).pathCells, [...e.plate.principalPath].sort((x, y) => x - y));
    assert.deepEqual(frames.at(-1).H, cells(e.H));
    assert.deepEqual(frames.at(-1).E, cells(e.E));
    const declaredEdges = e.plate.edges.map(([a, b]) => `${Math.min(a, b)}:${Math.max(a, b)}`).sort();
    assert.deepEqual(edges(frames.at(-1).I), declaredEdges);
    return { id: e.id, event: a, frames, commitPrincipalPath: e.plate.principalPath,
      terminalContext: e.scaffolds.terminal };
  });
  await mkdir(resolve(BASE, 'data'), { recursive: true });
  await writeFile(INPUT, gzipSync(json({ schema: 'ant-frozen-scope-structures-v1', grid: 96,
    productionMain: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785', researchParent: '8dfd99028db9d34fc23663e2b4f6ad7f9c9a4fc3',
    seed: 20261005, hz: 60, heading: 'H0', audio: 'Off', naturalReplays: 0,
    inputs: [SPEC, { path: BODY.slice(ROOT.length).replaceAll('\\', '/'), sha256: sha(bodyBytes) }], events }), { level: 9 }));
}

function analyze(packet) {
  assert.equal(packet.events.length, 2);
  return { schema: 'ant-scope-structural-observation-v1', seed: packet.seed, naturalReplays: 0,
    adjacency: '8-neighbor source grid; 4-neighbor sensitivity; no physical branch IDs', events: packet.events.map(e => {
      const first = e.frames[0], last = e.frames.at(-1), previous = { frame: null };
      const rows = e.frames.map(f => {
        for (const a of [f.I, f.H, f.E, f.pathCells]) {
          assert(a.every(i => Number.isInteger(i) && i >= 0 && i < 9216));
          assert.equal(new Set(a).size, a.length);
        }
        assert(f.pathCells.every(i => set(f.I).has(i)));
        assert(f.I.every(i => set(f.H).has(i) && set(f.E).has(i)));
        assert(f.I.includes(f.candidate.source.index)); assert(f.I.includes(f.candidate.target.index));
        assert(Math.abs(f.candidate.startedAtMs - e.event.startMs) < 1e-6);
        const row = { timeSeconds: f.timeMs / 1000, lineageStartSeconds: f.candidate.startedAtMs / 1000,
          stableSeconds: f.candidate.stableSeconds, I: f.I.length, path: f.pathCells.length,
          H: f.H.length, components8: components(f.I), components4: components(f.I, false),
          source: f.candidate.source.index, target: f.candidate.target.index };
        if (previous.frame) {
          row.cells = compare(previous.frame.I, f.I); row.edges = compare(edges(previous.frame.I), edges(f.I));
          const near = set(previous.frame.I.flatMap(i => [i, ...neighbors(i)]));
          row.currentNodesNearPrevious = f.I.filter(i => near.has(i)).length;
          row.sourceChanged = previous.frame.candidate.source.index !== f.candidate.source.index;
          row.targetChanged = previous.frame.candidate.target.index !== f.candidate.target.index;
        }
        previous.frame = f; return row;
      });
      const refs = { L_commit: last.I, F_first: first.I, P_principal: last.pathCells };
      const union = [...new Set(e.frames.flatMap(f => f.I))].sort((a, b) => a - b);
      const all = first.I.filter(i => e.frames.every(f => f.I.includes(i)));
      const transitions = rows.slice(1);
      return { id: e.id, startSeconds: first.timeMs / 1000, commitSeconds: last.timeMs / 1000, rows,
        references: Object.fromEntries(Object.entries(refs).map(([name, a]) => [name, {
          cells: a.length, components8: components(a), components4: components(a, false),
          outsideCommitH: a.length - intersect(a, last.H).length,
          outsideCommitE: a.length - intersect(a, last.E).length, relationToCommitI: compare(a, last.I)
        }])),
        firstToCommit: compare(first.I, last.I), sourceChanges: transitions.filter(r => r.sourceChanged).length,
        targetChanges: transitions.filter(r => r.targetChanged).length,
        transitionCellJaccard: summary(transitions.map(r => r.cells.jaccard)),
        transitionEdgeJaccard: summary(transitions.map(r => r.edges.jaccard)),
        transitionNearFraction: summary(transitions.map(r => r.currentNodesNearPrevious / r.I)),
        diagnosticOnly: { selectedAtLeastOnce: union.length, selectedAtEveryAnchor: all.length,
          alwaysSelectedComponents8: components(all), unionComponents8: components(union) }
      };
    }) };
}

function selfTest() {
  assert.deepEqual(components([0, 97]), [2]); assert.deepEqual(components([0, 97], false), [1, 1]);
  assert.deepEqual(components([95, 96]), [1, 1]);
  assert.deepEqual(edges([0, 1, 96]), ['0:1', '0:96', '1:96']);
  assert.deepEqual(compare([1, 2], [2, 3]), { previous: 2, next: 2, shared: 1, lost: 1, gained: 1, union: 3, jaccard: 1 / 3 });
  assert.deepEqual(components([]), []); assert.equal(compare([], []).jaccard, null);
  assert.equal(summary([1, 2, 3, 4]).median, 2.5); assert.equal(summary([3, 1, 2]).median, 2);
  console.log('PASS: diagonal sensitivity, row-wrap exclusion, induced edges, membership change, empty sets, even/odd medians');
}

if (process.argv.includes('--self-test')) selfTest();
else {
  if (process.argv.includes('--extract')) await extract();
  const bytes = await readFile(INPUT), packet = JSON.parse(gunzipSync(bytes));
  const output = json({ ...analyze(packet), frozenInputSha256: sha(bytes) });
  const target = resolve(BASE, 'analysis.json');
  if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), output);
  else await writeFile(target, output);
  const result = JSON.parse(output);
  console.log(JSON.stringify(result.events.map(({ id, firstToCommit, transitionCellJaccard, diagnosticOnly, sourceChanges, targetChanges }) =>
    ({ id, firstToCommit, transitionCellJaccard, diagnosticOnly, sourceChanges, targetChanges }))));
}
