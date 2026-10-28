import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const prior = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data');
const out = resolve(root, 'docs/ant/evidence/2026-10-28-event-scoped-material-support/data');
const sha = b => createHash('sha256').update(b).digest('hex');
const bytes = await readFile(resolve(prior, 'history-packet.json.gz'));
assert.equal(sha(bytes), JSON.parse(await readFile(resolve(prior, 'capture.json'), 'utf8')).packetSha256);
const packet = JSON.parse(gunzipSync(bytes));
const assocBytes = await readFile(resolve(out, 'association.json'));
assert.equal(sha(assocBytes), JSON.parse(await readFile(resolve(out, 'association-validation.json'), 'utf8')).resultSha256);
const association = JSON.parse(assocBytes), started = performance.now();
const feet = packet.contacts.flatMap(e => e.contacts.filter(c => c.position.x >= 0 && c.position.x <= 1 && c.position.y >= 0 && c.position.y <= 1)
  .map(c => ({ time: e.simulationTimeMs, cell: Math.round(c.position.y * 95) * 96 + Math.round(c.position.x * 95) })));
function run() {
  const before = sha(JSON.stringify(packet));
  const events = association.events.map(e => {
    assert.ok(performance.now() - started < 30000, '30 s closure audit boundary');
    const { startAnalysisIndex: start, endAnalysisIndex: end, startMs } = e.event;
    let lineageEnd = end;
    while (lineageEnd + 1 < packet.analyses.length && packet.analyses[lineageEnd + 1].candidate?.startedAtMs === startMs) lineageEnd++;
    const last = packet.analyses[lineageEnd], next = packet.analyses[lineageEnd + 1];
    const cells = e.controlsNotCandidateLaws.closingAssociatedE.cells, set = new Set(cells), width = end - start;
    const windows = [['preceding', start - width, start], ['event', start, end], ['following', end, end + width]].map(([label, from, to]) => {
      if (from < 0 || to >= packet.analyses.length) return { label, available: false, reason: 'outside saved horizon; not shortened or extended' };
      const fs = packet.analyses.slice(from, to + 1), counts = cells.map(c => fs.filter(f => f.maps.E_qualified[c]).length);
      const first = fs[0], final = fs.at(-1);
      assert.equal(final.tick - first.tick, width * 60);
      return { label, available: true, startMs: first.simulationTimeMs, endMs: final.simulationTimeMs, anchors: fs.length,
        fixedFootprintCells: cells.length,
        EPresentAtFirst: cells.filter(c => first.maps.E_qualified[c]).length,
        EPresentAtLast: cells.filter(c => final.maps.E_qualified[c]).length,
        EAllAnchors: counts.filter(c => c === fs.length).length,
        occupancy: Array.from({ length: fs.length + 1 }, (_, i) => ({ presentAnchors: i, cells: counts.filter(c => c === i).length })),
        exactFootSamples: feet.filter(f => set.has(f.cell) && f.time > first.simulationTimeMs && f.time <= final.simulationTimeMs).length };
    });
    return { event: e.event, exactLineage: { lastObservedMs: last.simulationTimeMs, extendsAfterBirthSeconds: (last.simulationTimeMs - packet.analyses[end].simulationTimeMs) / 1000,
      rightCensored: !next, nextAnalysisMs: next?.simulationTimeMs ?? null,
      nextCandidateStartedAtMs: next?.candidate?.startedAtMs ?? null, nextHasCandidate: Boolean(next?.candidate) }, windows,
      retentionAfterBirth: packet.analyses.slice(end).map((f, i) => ({ time: f.simulationTimeMs,
        ECellsInFixedClosingFootprint: cells.filter(c => f.maps.E_qualified[c]).length,
        exactFootSamplesSincePriorAnchor: feet.filter(p => set.has(p.cell) && p.time > (i ? packet.analyses[end + i - 1].simulationTimeMs : f.simulationTimeMs)
          && p.time <= f.simulationTimeMs).length })) };
  });
  assert.equal(sha(JSON.stringify(packet)), before);
  return { schema: 'ant-event-closure-specificity-v1', packetSha256: sha(bytes), associationSha256: sha(assocBytes),
    semantics: 'fixed-footprint adjacent windows are descriptive and world-age confounded; not a causal null', events };
}
let first, second; const random = Math.random;
try { Math.random = () => { throw new Error('closure RNG use'); }; first = JSON.stringify(run()); second = JSON.stringify(run()); }
finally { Math.random = random; }
assert.equal(first, second);
const target = resolve(out, 'closure.json');
if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), first + '\n');
else {
  await assert.rejects(readFile(target), { code: 'ENOENT' }); await writeFile(target, first + '\n');
  await writeFile(resolve(out, 'closure-validation.json'), JSON.stringify({ resultSha256: sha(first + '\n'), deterministicRerun: true, rngTripwire: true,
    runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))) }, null, 2) + '\n');
}
console.log(JSON.stringify(JSON.parse(first).events.map(({ retentionAfterBirth, windows, ...r }) => ({ ...r,
  windows: windows.map(({ occupancy, ...w }) => w), lastRetention: retentionAfterBirth.at(-1) })), null, 2));
