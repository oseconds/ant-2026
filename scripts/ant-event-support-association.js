import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replayMechanicalWindow } from './lib/antEventMechanicalShadow.js';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const prior = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data');
const out = resolve(root, 'docs/ant/evidence/2026-10-28-event-scoped-material-support/data');
const sha = b => createHash('sha256').update(b).digest('hex');
const bytes = await readFile(resolve(prior, 'history-packet.json.gz'));
assert.equal(sha(bytes), JSON.parse(await readFile(resolve(prior, 'capture.json'), 'utf8')).packetSha256);
const packet = JSON.parse(gunzipSync(bytes));
const atlasBytes = await readFile(resolve(out, 'atlas.json.gz'));
assert.equal(sha(atlasBytes), JSON.parse(await readFile(resolve(out, 'atlas-validation.json'), 'utf8')).resultGzipSha256);
const atlas = JSON.parse(gunzipSync(atlasBytes));

function components(mask, size, diagonal = true) {
  const seen = new Uint8Array(mask.length), result = [];
  for (let c = 0; c < mask.length; c++) if (mask[c] && !seen[c]) {
    const queue = [c]; seen[c] = 1;
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head], x = cell % size, y = Math.floor(cell / size);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
        const xx = x + dx, yy = y + dy, next = yy * size + xx;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size && mask[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    result.push(queue.sort((a, b) => a - b));
  }
  return result;
}
function associated(parts, graph) { return parts.filter(cells => cells.some(c => graph[c])).flat().sort((a, b) => a - b); }
function difference(a, b) { const s = new Set(b); return a.filter(c => !s.has(c)); }
const dist = values => { const a = values.sort((a, b) => a - b), q = p => a[Math.floor((a.length - 1) * p)] ?? null;
  return { n: a.length, min: a[0] ?? null, p25: q(.25), median: q(.5), p75: q(.75), max: a.at(-1) ?? null }; };
const mask = cells => { const m = new Uint8Array(9216); for (const c of cells) m[c] = 1; return m; };
function componentLinks(before, after) {
  const links = [];
  for (let i = 0; i < before.length; i++) for (let j = 0; j < after.length; j++) {
    const old = new Set(before[i]), overlap = after[j].filter(c => old.has(c)).length;
    if (overlap) links.push({ before: i, after: j, overlapCells: overlap });
  }
  return links;
}
assert.deepEqual(components([1, 0, 0, 1], 2, true), [[0, 3]]);
assert.deepEqual(components([1, 0, 0, 1], 2, false), [[0], [3]]);
assert.deepEqual(associated([[0, 1], [3]], [0, 1, 0, 0]), [0, 1]);
assert.deepEqual(componentLinks([[0, 1]], [[0], [1]]), [{ before: 0, after: 0, overlapCells: 1 }, { before: 0, after: 1, overlapCells: 1 }]);
const started = performance.now();
function run() {
  const beforeHash = sha(JSON.stringify(packet));
  const events = atlas.atlases.map(a => {
    let previousParts = null;
    const frames = packet.analyses.slice(a.event.startAnalysisIndex, a.event.endAnalysisIndex + 1).map(frame => {
      assert.ok(performance.now() - started < 60000, '60 s frozen association boundary');
      const E = frame.maps.E_qualified, H = frame.maps.H_boundary_length_eligible, I = frame.maps.I_retained_network;
      const parts8 = components(E, 96), parts4 = components(E, 96, false);
      const H8 = associated(parts8, H), I8 = associated(parts8, I), H4 = associated(parts4, H), I4 = associated(parts4, I);
      const links = previousParts ? componentLinks(previousParts, parts8) : []; previousParts = parts8;
      assert.ok(H8.every(c => E[c])); assert.ok(I8.every(c => E[c]));
      return { tick: frame.tick, time: frame.simulationTimeMs, ECells: E.reduce((n, v) => n + v, 0),
        EComponents8: parts8, EComponents4: parts4, H8, I8, H4, I4, previousE8OverlapLinks: links,
        H8I8Difference: difference(H8, I8).length + difference(I8, H8).length,
        H8H4Difference: difference(H8, H4).length + difference(H4, H8).length };
    });
    const union = [...new Set(frames.flatMap(f => f.H8))].sort((a, b) => a - b);
    const counts = new Map(union.map(c => [c, frames.filter(f => f.H8.includes(c)).length]));
    const intersection = union.filter(c => counts.get(c) === frames.length);
    const closing = frames.at(-1).H8;
    const mechanical = replayMechanicalWindow(packet, { startIndex: a.event.startAnalysisIndex, endIndex: a.event.endAnalysisIndex });
    const records = new Map(a.cells.map(c => [c.cell, c]));
    const cohort = cells => ({ cells, count: cells.length,
      carryIn: cells.filter(c => records.get(c).E.event.leftBoundaryCarryIn).length,
      eventOnsetAfterStart: cells.filter(c => records.get(c).E.event.onsetOffsetMs > 0).length,
      firstLifetimeEInsideEvent: cells.filter(c => records.get(c).E.absoluteAtBirth.firstPresentAtMs >= a.event.startMs).length,
      noExactEventFeet: cells.filter(c => records.get(c).contacts.exact.eventWindowInclusiveCount === 0).length,
      exactEventFeet: dist(cells.map(c => records.get(c).contacts.exact.eventWindowInclusiveCount)),
      representedPositiveMechanicalIncrement: mechanical.validity.exact ? cells.filter(c => mechanical.retainedIncrementValues[c] > 0).length : null,
      mechanicalIncrement: mechanical.validity.exact ? dist(cells.map(c => mechanical.retainedIncrementValues[c])) : null,
      mechanicalIncrementFractionOfEndpoint: mechanical.validity.exact ? dist(cells.filter(c => mechanical.observedEndValues[c] > 0)
        .map(c => mechanical.retainedIncrementValues[c] / mechanical.observedEndValues[c])) : null });
    return { event: a.event, frames, controlsNotCandidateLaws: { associatedUnion: cohort(union), associatedAllAnchors: cohort(intersection),
      closingAssociatedE: cohort(closing) }, mechanical,
      associationOccupancy: Array.from({ length: frames.length }, (_, i) => ({ anchors: i + 1, cells: union.filter(c => counts.get(c) === i + 1).length })),
      HvsIAllFramesIdentical: frames.every(f => f.H8I8Difference === 0) };
  });
  const first = events[0].controlsNotCandidateLaws, second = events[1].controlsNotCandidateLaws;
  const comparison = Object.fromEntries(Object.keys(first).map(key => [key, { first: first[key].count, second: second[key].count,
    overlap: first[key].cells.filter(c => new Set(second[key].cells).has(c)).length,
    secondOutsideFirst: difference(second[key].cells, first[key].cells).length }]));
  assert.equal(sha(JSON.stringify(packet)), beforeHash);
  return { schema: 'ant-event-support-association-v1', packetSha256: sha(bytes), atlasSha256: sha(atlasBytes),
    validity: { inputUnchanged: true, noNewWorld: true }, events, comparison };
}
let first, second; const random = Math.random;
try { Math.random = () => { throw new Error('association RNG use'); }; first = JSON.stringify(run(), (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);
  second = JSON.stringify(run(), (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v); } finally { Math.random = random; }
assert.equal(first, second);
const target = resolve(out, 'association.json');
if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), first + '\n');
else {
  await assert.rejects(readFile(target), { code: 'ENOENT' }); await writeFile(target, first + '\n');
  await writeFile(resolve(out, 'association-validation.json'), JSON.stringify({ resultSha256: sha(first + '\n'), deterministicRerun: true,
    rngTripwire: true, runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))),
    mechanicalHelperSha256: sha(await readFile(resolve(root, 'scripts/lib/antEventMechanicalShadow.js'))) }, null, 2) + '\n');
}
const result = JSON.parse(first);
console.log(JSON.stringify({ comparison: result.comparison, events: result.events.map(e => ({ event: e.event,
  HvsIAllFramesIdentical: e.HvsIAllFramesIdentical, H8H4Differences: e.frames.map(f => f.H8H4Difference), mechanical: e.mechanical.validity,
  controls: Object.fromEntries(Object.entries(e.controlsNotCandidateLaws).map(([name, { cells, ...c }]) => [name, c])) })) }, null, 2));
