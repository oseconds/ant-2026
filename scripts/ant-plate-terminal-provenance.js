import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { terminalHull } from './lib/antTerminalHull.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data');
const sha = value => createHash('sha256').update(value).digest('hex');
const input = await readFile(resolve(base, 'history-packet.json.gz'));
const receipt = JSON.parse(await readFile(resolve(base, 'capture.json'), 'utf8'));
assert.equal(sha(input), receipt.packetSha256);
const packet = JSON.parse(gunzipSync(input));
const multBytes = await readFile(resolve(base, 'multiplicity.json'));
const multReceipt = JSON.parse(await readFile(resolve(base, 'multiplicity-validation.json'), 'utf8'));
assert.equal(sha(multBytes), multReceipt.resultSha256);
const mult = JSON.parse(multBytes);
const birthIndex = packet.analyses.findIndex(a => a.birthsThisTick), birth = packet.analyses[birthIndex];
const dist = values => {
  const a = values.sort((a, b) => a - b);
  const q = p => a.length ? a[Math.floor((a.length - 1) * p)] : null;
  return { n: a.length, min: a[0] ?? null, p25: q(.25), median: q(.5), p75: q(.75), max: a.at(-1) ?? null };
};
const tenure = (cell, map) => {
  let first = birthIndex;
  while (first > 0 && packet.analyses[first - 1].maps[map][cell]) first--;
  return (birth.simulationTimeMs - packet.analyses[first].simulationTimeMs) / 1000;
};
const feet = packet.contacts.flatMap(e => e.contacts.filter(c => c.position.x >= 0 && c.position.x <= 1 && c.position.y >= 0 && c.position.y <= 1)
  .map(c => ({ time: e.simulationTimeMs, cell: Math.round(c.position.y * 95) * 96 + Math.round(c.position.x * 95) })));
const hasEReturn = cell => {
  let present = false, absent = false;
  for (const a of packet.analyses) {
    if (a.maps.E_qualified[cell]) { if (absent) return true; present = true; }
    else if (present) absent = true;
  }
  return false;
};
function cohort(cells) {
  const set = new Set(cells);
  return { cells, n: cells.length,
    preBirthETenureSeconds: dist(cells.map(c => tenure(c, 'E_qualified'))),
    preBirthHTenureSeconds: dist(cells.map(c => tenure(c, 'H_boundary_length_eligible'))),
    memory: dist(cells.map(c => birth.maps.B_memory[c])), rawSurface: dist(cells.map(c => birth.maps.C_surface[c])),
    support: dist(cells.map(c => birth.maps.D_support[c])),
    preBirthExactFeetPerCell: dist(cells.map(c => feet.filter(f => f.cell === c && f.time < birth.simulationTimeMs).length)),
    alreadyFrozenAtBirth: cells.filter(c => birth.maps.J_frozen_birth_union[c]).length,
    laterI: cells.filter(c => packet.analyses.slice(birthIndex + 1).some(a => a.maps.I_retained_network[c])).length,
    newlyFrozenLater: cells.filter(c => !birth.maps.J_frozen_birth_union[c] && packet.analyses.slice(birthIndex + 1).some(a => a.maps.J_frozen_birth_union[c])).length,
    sampledEReturnCells: cells.filter(hasEReturn).length,
    footprintTimeline: packet.analyses.map((a, i) => ({ tick: a.tick, time: a.simulationTimeMs,
      E: cells.filter(c => a.maps.E_qualified[c]).length,
      H: cells.filter(c => a.maps.H_boundary_length_eligible[c]).length,
      I: cells.filter(c => a.maps.I_retained_network[c]).length,
      frozen: cells.filter(c => a.maps.J_frozen_birth_union[c]).length,
      feetSincePriorAnalysis: feet.filter(f => set.has(f.cell) && f.time > (i ? packet.analyses[i - 1].simulationTimeMs : -Infinity)
        && f.time <= a.simulationTimeMs).length })) };
}

const started = performance.now();
function run() {
  const before = sha(JSON.stringify(packet)), rows = [];
  for (const [i, frame] of packet.analyses.entries()) {
    assert.ok(performance.now() - started < 60000, '60 s frozen provenance boundary');
    if (!frame.candidate) { rows.push({ tick: frame.tick, time: frame.simulationTimeMs, classification: null }); continue; }
    const selected = frame.components.find(c => c.chosenRoot === frame.candidate.source.index && c.cells.includes(frame.candidate.target.index));
    assert.ok(selected);
    const hull = terminalHull({ cells: selected.cells, root: selected.chosenRoot, targets: selected.qualifiedTargets });
    const guarded = terminalHull({ cells: selected.cells, root: selected.chosenRoot, targets: selected.qualifiedTargets, diagonalGuard: true });
    const H = new Set(hull.hullCells), G = new Set(guarded.hullCells), I = new Set(mult.rows[i].candidates.production.network);
    const all = new Set(mult.rows[i].candidates.allShortest.network);
    assert.ok([...I].every(c => all.has(c)));
    assert.ok([...all].every(c => H.has(c)));
    const groups = { selected: [...I].sort((a, b) => a - b), equalShortest: [...all].filter(c => !I.has(c)).sort((a, b) => a - b),
      longerAlternative: hull.hullCells.filter(c => !all.has(c)), pendant: selected.cells.filter(c => !H.has(c)).sort((a, b) => a - b) };
    assert.equal(Object.values(groups).reduce((n, a) => n + a.length, 0), selected.cells.length);
    rows.push({ tick: frame.tick, time: frame.simulationTimeMs, classification: {
      winnerCells: selected.cells.length, otherHCells: frame.maps.H_boundary_length_eligible.reduce((n, v) => n + Boolean(v), 0) - selected.cells.length,
      root: selected.chosenRoot, targets: selected.qualifiedTargets, groups,
      pendantComponents: hull.pendantComponents,
      diagonalGuard: { hullCells: guarded.hullCells, pendantComponents: guarded.pendantComponents,
        productionIOutsideHull: [...I].filter(c => !G.has(c)).length,
        allShortestOutsideHull: [...all].filter(c => !G.has(c)).length,
        hullSymmetricDifference: [...H].filter(c => !G.has(c)).length + [...G].filter(c => !H.has(c)).length } } });
  }
  assert.equal(sha(JSON.stringify(packet)), before, 'frozen packet unchanged');
  const first = rows[birthIndex].classification;
  return { schema: 'ant-terminal-provenance-v1', packetSha256: sha(input), multiplicitySha256: sha(multBytes),
    validity: { partitionConservation: true, productionAndAllShortestInsideHull: true, inputsUnchanged: true, frames: rows.length },
    rows, firstBirthCohorts: Object.fromEntries(Object.entries(first.groups).map(([name, cells]) => [name, cohort(cells)])),
    firstBirthPendantCohorts: first.pendantComponents.map(cells => cohort(cells)),
    firstBirthGuardedPendantCohorts: first.diagonalGuard.pendantComponents.map(cells => cohort(cells)) };
}
let first, second; const random = Math.random;
try { Math.random = () => { throw new Error('provenance RNG use'); }; first = JSON.stringify(run()); second = JSON.stringify(run()); }
finally { Math.random = random; }
assert.equal(first, second);
const target = resolve(base, 'terminal-provenance.json');
if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), first + '\n');
else {
  await assert.rejects(readFile(target), { code: 'ENOENT' });
  await writeFile(target, first + '\n');
  await writeFile(resolve(base, 'terminal-provenance-validation.json'), JSON.stringify({ resultSha256: sha(first + '\n'), deterministicRerun: true,
    rngTripwire: true, helperSha256: sha(await readFile(resolve(root, 'scripts/lib/antTerminalHull.js'))),
    runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))) }, null, 2) + '\n');
}
const result = JSON.parse(first);
const cls = result.rows[birthIndex].classification;
console.log(JSON.stringify({ validity: result.validity, firstBirth: { winnerCells: cls.winnerCells,
  groups: Object.fromEntries(Object.entries(cls.groups).map(([name, cells]) => [name, cells.length])),
  pendantSizes: cls.pendantComponents.map(c => c.length).sort((a, b) => b - a),
  guardedHull: cls.diagonalGuard.hullCells.length,
  guardedPendantSizes: cls.diagonalGuard.pendantComponents.map(c => c.length).sort((a, b) => b - a),
  guardedHullDifference: cls.diagonalGuard.hullSymmetricDifference },
  cohorts: Object.fromEntries(Object.entries(result.firstBirthCohorts).map(([name, c]) => { const { cells, footprintTimeline, ...brief } = c; return [name, brief]; })) }, null, 2));
