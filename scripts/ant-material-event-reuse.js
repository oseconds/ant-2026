import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrailPlateBirth } from '../src/lib/agents/ant/TrailPlateBirth.js';
import { loadEventStateSource } from './lib/antMaterialEventState.js';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = resolve(root, 'docs/ant/evidence/2026-10-28-materialization-event-state/data');
const prior = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data');
const gData = resolve(root, 'docs/ant/evidence/2026-10-25-g-production-candidate-review/data');
const sha = b => createHash('sha256').update(b).digest('hex');
const input = await readFile(resolve(prior, 'history-packet.json.gz'));
assert.equal(sha(input), JSON.parse(await readFile(resolve(prior, 'capture.json'), 'utf8')).packetSha256);
const packet = JSON.parse(gunzipSync(input)), frame = packet.analyses.find(f => f.birthsThisTick);
const source = await readFile(resolve(root, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
const loaded = await loadEventStateSource(source);
const E = Uint8Array.from(frame.maps.E_qualified), B = Float32Array.from(frame.maps.B_memory);
const S = Float32Array.from(frame.maps.D_support, (v, i) => B[i] >= .30 ? v : 0);
const selected = loaded.module.selectCandidate(E, S, B);
assert.deepEqual(Array.from(selected.mask), packet.births[0].payload.mask);
const middle = selected.path[Math.floor(selected.path.length / 2)];
const point = { x: middle % 96 / 95, y: Math.floor(middle / 96) / 95 };
assert.equal(selected.mask[middle], 1);
const hashCue = () => sha(JSON.stringify([Array.from(E), Array.from(S), Array.from(B)]));
const cueHash = hashCue(), started = performance.now();

function fixture(schedule) {
  const system = new TrailPlateBirth(); system.updateChemicalMemory = () => {};
  system.buildSupportedMask = () => ({ mask: E, supports: S, diagnostics: {} });
  const rows = [], descriptors = [], descriptorHashes = [];
  for (let seconds = 0; seconds <= 600; seconds++) {
    assert.ok(performance.now() - started < 60000, '60 s class-only reuse fixture boundary');
    system.chemicalMemory.set(B);
    const singleFoot = seconds > 0 && (seconds <= 20 || schedule === 'continuous-load');
    if (singleFoot) system.observeFootContact({ type: 'FOOT_CONTACT', simulationTimeMs: seconds * 1000,
      contacts: [{ legId: 'FL', position: point }] });
    if (schedule === 'early-refractory-burst' && seconds === 40) for (let ant = 0; ant < 10; ant++) {
      system.observeFootContact({ type: 'FOOT_CONTACT', simulationTimeMs: 40000, antId: `fixture-${ant}`,
        contacts: ['FL', 'MR', 'RL'].map(legId => ({ legId, position: point })) });
    }
    const priorRecord = system.findSameCorridorBirth(selected);
    const newFeet = priorRecord ? system.countFootContacts(priorRecord.corridorMask) - priorRecord.footContactsAtBirth : null;
    const lastBirthBefore = Number.isFinite(system.lastBirthTimeMs) ? system.lastBirthTimeMs : null;
    const made = system.advance({ simulationTimeMs: seconds * 1000 });
    for (const plate of made) {
      assert.ok(Object.isFrozen(plate) && Object.isFrozen(plate.mask));
      assert.deepEqual(plate.mask, packet.births[0].payload.mask);
      descriptors.push(plate); descriptorHashes.push(sha(JSON.stringify(plate)));
    }
    const c = system.candidate;
    rows.push({ seconds, stableSeconds: c.stableSeconds, lineageStartMs: c.startedAtMs,
      priorMatch: priorRecord?.id ?? null, priorAgeSeconds: priorRecord ? (seconds * 1000 - priorRecord.bornAtSimulationTimeMs) / 1000 : null,
      newFeet, lastBirthBefore, committedIds: made.map(p => p.id),
      selectedCandidateRemainsPresent: Boolean(system.candidate), repeatAfter: c.repeatDiagnostics });
  }
  for (let i = 0; i < descriptors.length; i++) assert.equal(sha(JSON.stringify(descriptors[i])), descriptorHashes[i], 'previous commit never grows');
  assert.equal(hashCue(), cueHash);
  const commitSeconds = rows.filter(r => r.committedIds.length).map(r => r.seconds);
  const expected = schedule === 'continuous-load' ? [20, 110, 200, 290, 380, 470, 560]
    : schedule === 'early-refractory-burst' ? [20, 110] : [20];
  assert.deepEqual(commitSeconds, expected, schedule);
  assert.ok(rows.every(r => r.lineageStartMs === 0));
  return { schedule, scope: 'clamped actual first-birth selector inputs; prescribed feet, no world/field integration',
    commitSeconds, commits: commitSeconds.map(seconds => rows[seconds]),
    finalPlateCount: system.plates.length, capacityReached: system.plates.length === system.maxBirths,
    descriptorsRemainImmutable: true, noSpatialNovelty: true, noCandidateReset: true, rows };
}

const checksums = JSON.parse(await readFile(resolve(gData, 'SHA256SUMS.json'), 'utf8'));
const provenanceBytes = await readFile(resolve(gData, 'PROVENANCE.json'));
const provenanceLfBytes = Buffer.from(provenanceBytes.toString('utf8').replaceAll('\r\n', '\n'));
assert.equal(sha(provenanceLfBytes), checksums['PROVENANCE.json']);
const provenance = JSON.parse(provenanceBytes);
for (const path of ['src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/MaterialStratigraphy.js']) {
  assert.equal(sha(await readFile(resolve(root, path))), provenance.sourceHashes[path], path);
}
const archives = [];
for (const seed of [20261005, 20261006, 20261007]) {
  const name = `seed${seed}-G-raw.json.gz`, data = await readFile(resolve(gData, name));
  assert.equal(sha(data), checksums[name]);
  const raw = JSON.parse(gunzipSync(data));
  const times = raw.births.map(b => b.bornAtSimulationTimeMs / 1000), gaps = times.slice(1).map((t, i) => t - times[i]);
  assert.ok(gaps.every(t => t >= 10 - 1e-7));
  const sorted = [...gaps].sort((a, b) => a - b);
  archives.push({ seed, dataSha256: sha(data), baseline: 'adoption-conformant current-G archive; existing Audio-Off 600 s evidence',
    birthCount: raw.births.length, firstBirthSeconds: times[0], lastBirthSeconds: times.at(-1),
    gapSeconds: { min: sorted[0], median: sorted[Math.floor((sorted.length - 1) / 2)], max: sorted.at(-1) },
    exactUniqueMaskHashes: new Set(raw.births.map(b => b.maskSha256)).size,
    births: raw.births,
    limitation: 'No per-analysis prior-corridor matches or gate states; cannot classify these births as repeats versus unmatched candidates.' });
}
function run() { return { schema: 'ant-material-event-reuse-v1', sourceSha256: loaded.sourceSHA256, packetSha256: sha(input), cueSha256: cueHash,
  archiveProvenance: { workingSha256: sha(provenanceBytes), lfSha256: sha(provenanceLfBytes),
    checksumRepresentation: 'LF archival text; working CRLF left untouched' },
  fixtures: ['no-postcommit-load', 'continuous-load', 'early-refractory-burst'].map(fixture), existingCurrentGArchives: archives,
  bounds: { globalMinimumGapSeconds: 10, sameMatchedPriorMinimumAgeSeconds: 90, requiredPostPriorFootCount: 30,
    boundsRateNotFiniteTotal: true, technical256CeilingNotMaterialLaw: true } }; }
let first, second; const random = Math.random;
try { Math.random = () => { throw new Error('reuse fixture RNG use'); }; first = JSON.stringify(run()); second = JSON.stringify(run()); }
finally { Math.random = random; }
assert.equal(first, second);
const target = resolve(base, 'reuse-contract.json');
if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), first + '\n');
else {
  await assert.rejects(readFile(target), { code: 'ENOENT' }); await writeFile(target, first + '\n');
  await writeFile(resolve(base, 'reuse-validation.json'), JSON.stringify({ resultSha256: sha(first + '\n'), deterministicRerun: true,
    rngTripwire: true, cueUnchanged: true, archivedChecksumsExact: true,
    runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))) }, null, 2) + '\n');
}
const result = JSON.parse(first);
console.log(JSON.stringify({ fixtures: result.fixtures.map(({ rows, commits, ...f }) => f),
  archives: result.existingCurrentGArchives.map(({ births, ...a }) => a), bounds: result.bounds }, null, 2));
