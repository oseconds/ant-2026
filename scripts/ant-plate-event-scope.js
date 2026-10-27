import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data');
const sha = value => createHash('sha256').update(value).digest('hex');
const input = await readFile(resolve(base, 'history-packet.json.gz'));
assert.equal(sha(input), JSON.parse(await readFile(resolve(base, 'capture.json'), 'utf8')).packetSha256);
const packet = JSON.parse(gunzipSync(input)), started = performance.now();
function dist(values) {
  const a = values.sort((a, b) => a - b), q = p => a.length ? a[Math.floor((a.length - 1) * p)] : null;
  return { n: a.length, min: a[0] ?? null, p25: q(.25), median: q(.5), p75: q(.75), max: a.at(-1) ?? null };
}
assert.deepEqual(dist([]), { n: 0, min: null, p25: null, median: null, p75: null, max: null });
assert.equal(dist([2, 0, 1]).median, 1);
function run() {
  const before = sha(JSON.stringify(packet)), events = [];
  for (const { payload: plate } of packet.births) {
    assert.ok(performance.now() - started < 30000, '30 s frozen event audit boundary');
    const at = packet.analyses.findIndex(a => a.simulationTimeMs === plate.bornAtSimulationTimeMs);
    const frame = packet.analyses[at], since = packet.analyses.findIndex(a => a.simulationTimeMs === frame.candidate.startedAtMs);
    assert.ok(at >= 0 && since >= 0);
    assert.deepEqual(frame.maps.J_candidate_ribbon, plate.mask);
    const cells = plate.mask.flatMap((v, c) => v ? [c] : []), inE = cells.filter(c => frame.maps.E_qualified[c]);
    const tenures = inE.map(c => { let i = at; while (i > 0 && packet.analyses[i - 1].maps.E_qualified[c]) i--;
      return (frame.simulationTimeMs - packet.analyses[i].simulationTimeMs) / 1000; });
    const startMask = packet.analyses[since].maps.J_candidate_ribbon;
    const overlap = cells.filter(c => startMask[c]).length, startCount = startMask.filter(Boolean).length;
    const priorUnion = at ? packet.analyses[at - 1].maps.J_frozen_birth_union : new Array(96 * 96).fill(0);
    const prior = cells.filter(c => priorUnion[c]).length;
    const event = { id: plate.id, at: frame.simulationTimeMs, lineageStart: frame.candidate.startedAtMs,
      stableSeconds: frame.candidate.stableSeconds, maskCells: cells.length,
      inEAtBirth: inE.length, outsideEAtBirth: cells.length - inE.length,
      currentlyECellPreBirthTenureSeconds: dist(tenures),
      currentlyECellsReachingExisting20Seconds: tenures.filter(t => t + 1e-9 >= 20).length,
      candidateAtLineageStart: { cells: startCount, overlapWithBirth: overlap, IoU: overlap / (cells.length + startCount - overlap) },
      overlapEarlierFrozen: prior, newlyFrozenArea: cells.length - prior,
      lineage: packet.analyses.slice(since, at + 1).map(a => ({ time: a.simulationTimeMs,
        EInFinalFootprint: cells.filter(c => a.maps.E_qualified[c]).length,
        candidateInFinalFootprint: cells.filter(c => a.maps.J_candidate_ribbon[c]).length,
        candidateCells: a.maps.J_candidate_ribbon.filter(Boolean).length })) };
    assert.equal(event.inEAtBirth + event.outsideEAtBirth, event.maskCells);
    assert.equal(event.overlapEarlierFrozen + event.newlyFrozenArea, event.maskCells);
    events.push(event);
  }
  assert.equal(sha(JSON.stringify(packet)), before);
  return { schema: 'ant-materialization-event-scope-v1', packetSha256: sha(input),
    validity: { actualBirthMasksExact: true, exactLineageStartFrames: true, inputsUnchanged: true }, events };
}
let first, second; const random = Math.random;
try { Math.random = () => { throw new Error('event audit RNG use'); }; first = JSON.stringify(run()); second = JSON.stringify(run()); }
finally { Math.random = random; }
assert.equal(first, second);
const target = resolve(base, 'event-scope.json');
if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), first + '\n');
else {
  await assert.rejects(readFile(target), { code: 'ENOENT' });
  await writeFile(target, first + '\n');
  await writeFile(resolve(base, 'event-scope-validation.json'), JSON.stringify({ resultSha256: sha(first + '\n'), deterministicRerun: true,
    rngTripwire: true, runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))) }, null, 2) + '\n');
}
console.log(JSON.stringify(JSON.parse(first).events.map(({ lineage, ...event }) => event), null, 2));
