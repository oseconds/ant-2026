import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEventStateSource, reconstructEventState } from './lib/antMaterialEventState.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = resolve(root, 'docs/ant/evidence/2026-10-28-materialization-event-state/data');
const prior = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data');
const sha = b => createHash('sha256').update(b).digest('hex');
const input = await readFile(resolve(prior, 'history-packet.json.gz'));
const receipt = JSON.parse(await readFile(resolve(prior, 'capture.json'), 'utf8'));
assert.equal(sha(input), receipt.packetSha256);
const raw = gunzipSync(input); assert.equal(sha(raw), receipt.rawSha256);
const packet = JSON.parse(raw);
for (const [path, expected] of Object.entries(receipt.sourceHashes)) assert.equal(sha(await readFile(resolve(root, path))), expected, path);
const source = await readFile(resolve(root, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
const loaded = await loadEventStateSource(source);
const started = performance.now();
const sum = mask => mask.reduce((n, v) => n + Boolean(v), 0);
const delta = (a, b) => a.reduce((n, v, i) => n + Boolean(Boolean(v) !== Boolean(b?.[i])), 0);
function run() {
  assert.ok(performance.now() - started < 60000, '60 s frozen state reconstruction boundary');
  const before = sha(JSON.stringify(packet));
  const state = reconstructEventState(packet, loaded.module);
  assert.equal(sha(JSON.stringify(packet)), before);
  assert.deepEqual(state.births, packet.births.map(b => b.payload));
  assert.equal(state.birthParity.exact, true);
  for (const [i, row] of state.rows.entries()) {
    const f = packet.analyses[i], prev = packet.analyses[i - 1];
    assert.equal(Boolean(row.source), Boolean(f.candidate));
    assert.ok(row.candidateMatchesSavedRibbon && row.candidateMatchesSavedPath && row.candidateMatchesSavedNetwork);
    if (row.candidateParity) assert.ok(Object.values(row.candidateParity).every(Boolean), `candidate ${i}`);
    row.tick = f.tick;
    row.qualifiedECells = sum(f.maps.E_qualified);
    row.qualifiedEChangeCells = delta(f.maps.E_qualified, prev?.maps.E_qualified);
    row.selectedNetworkChangeCells = delta(f.maps.I_retained_network, prev?.maps.I_retained_network);
    row.selectedRibbonChangeCells = delta(f.maps.J_candidate_ribbon, prev?.maps.J_candidate_ribbon);
    row.projectedTrackerState = !row.source ? 'NO_SELECTED_CONNECTION' : row.gateFlags.persistence ? 'ESTABLISHED_SELECTED_CANDIDATE' : 'MATURING_SELECTED_CANDIDATE';
    row.action = row.commitIds.length ? 'COMMIT_FROZEN_DESCRIPTOR' : 'WAIT';
  }
  const last = packet.analyses.at(-1).simulationTimeMs;
  const eligibleFeet = packet.contacts.filter(e => e.simulationTimeMs <= last).flatMap(e => e.contacts)
    .filter(c => Number.isFinite(c.position.x) && Number.isFinite(c.position.y) && c.position.x >= 0 && c.position.x <= 1 && c.position.y >= 0 && c.position.y <= 1);
  assert.equal(state.acceptedFeet, eligibleFeet.length);
  assert.equal(state.finalFootCounts.reduce((a, b) => a + b, 0), eligibleFeet.length);
  const firstMask = state.births[0].mask, secondMask = state.births[1].mask;
  const overlap = firstMask.reduce((n, v, i) => n + Boolean(v && secondMask[i]), 0);
  const intervals = [];
  for (const row of state.rows.filter(r => r.source)) {
    const previous = intervals.at(-1);
    if (!previous || previous.startedAtMs !== row.startedAtMs) intervals.push({ startedAtMs: row.startedAtMs,
      firstObservedMs: row.simulationTimeMs, lastObservedMs: row.simulationTimeMs, analyses: 1, commits: [...row.commitIds] });
    else { previous.lastObservedMs = row.simulationTimeMs; previous.analyses++; previous.commits.push(...row.commitIds); }
  }
  return { schema: 'ant-material-event-state-v1', packetSha256: sha(input), sourceSha256: loaded.sourceSHA256,
    sourceTransformSha256: loaded.transformSHA256,
    scope: { seed: 20261005, currentG: true, heading: 'production H0', seconds: 120, audio: 'Off', newNaturalRuns: 0 },
    validity: { analyses: state.rows.length, exactCandidateParity: true, exactFullBirthDescriptors: true,
      birthCount: state.births.length, acceptedFeetAtLastAnalysis: state.acceptedFeet, finalFootCountSumExact: true, inputUnchanged: true },
    rows: state.rows, births: state.births, finalFootCounts: state.finalFootCounts, lineageIntervals: intervals,
    reuse: { firstCells: sum(firstMask), secondCells: sum(secondMask), overlap,
      secondOutsideFirst: sum(secondMask) - overlap, union: sum(firstMask) + sum(secondMask) - overlap } };
}
let first, second; const random = Math.random;
try { Math.random = () => { throw new Error('event reconstruction RNG use'); }; first = JSON.stringify(run()); second = JSON.stringify(run()); }
finally { Math.random = random; }
assert.equal(first, second);
const result = JSON.parse(first);
const cols = ['time_s', 'tracker', 'action', 'start_s', 'stable_s', 'source', 'target', 'E', 'network', 'ribbon', 'prior_match', 'new_feet', 'global_gap_s', 'refractory_s', 'first_blocker'];
const csv = cols.join(',') + '\n' + result.rows.map(r => [r.simulationTimeMs / 1000, r.projectedTrackerState, r.action,
  r.startedAtMs === null ? '' : r.startedAtMs / 1000, r.stableSeconds ?? '', r.source?.index ?? '', r.target?.index ?? '',
  r.qualifiedECells, r.networkCells, r.ribbonCells, r.prebirthMatch ?? '', r.newFeet ?? '', r.globalGapRemainingMs / 1000,
  r.refractoryRemainingMs === null ? '' : r.refractoryRemainingMs / 1000, r.firstBlockingGate ?? ''].join(',')).join('\n') + '\n';
await mkdir(base, { recursive: true });
if (process.argv.includes('--check')) {
  assert.equal(await readFile(resolve(base, 'event-state.json'), 'utf8'), first + '\n');
  assert.equal(await readFile(resolve(base, 'timeline.csv'), 'utf8'), csv);
} else {
  await assert.rejects(readFile(resolve(base, 'event-state.json')), { code: 'ENOENT' });
  await writeFile(resolve(base, 'event-state.json'), first + '\n'); await writeFile(resolve(base, 'timeline.csv'), csv);
  await writeFile(resolve(base, 'state-validation.json'), JSON.stringify({ resultSha256: sha(first + '\n'), timelineSha256: sha(csv),
    deterministicRerun: true, rngTripwire: true, inputSha256: sha(input),
    helperSha256: sha(await readFile(resolve(root, 'scripts/lib/antMaterialEventState.js'))), runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))) }, null, 2) + '\n');
}
console.log(JSON.stringify({ validity: result.validity, intervals: result.lineageIntervals, reuse: result.reuse,
  keyRows: result.rows.filter(r => ['open', 'restart'].includes(r.transition) || r.commitIds.length || [85, 108, 119].includes(Math.round(r.simulationTimeMs / 1000))) }, null, 2));
