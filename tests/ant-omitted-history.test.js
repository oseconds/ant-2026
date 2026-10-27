import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePacket } from '../scripts/lib/antOmittedHistory.js';

const keys = ['B_memory', 'C_surface', 'D_support', 'E_qualified', 'F_skeleton', 'H_boundary_length_eligible',
  'I_retained_network', 'J_candidate_ribbon', 'J_frozen_birth_union'];
function packet(size, frames, births = []) {
  return { analyses: frames.map((flags, i) => {
    const maps = Object.fromEntries(keys.map(k => [k, new Float64Array(size * size)]));
    for (const [key, cell] of Object.entries(flags)) for (const c of cell) maps[key][c] = 1;
    return { tick: i, simulationTimeMs: i * 1000, birthsThisTick: births.includes(i) ? 1 : 0, maps };
  }), contacts: [] };
}
const at = (key, ...cells) => [key, cells];

test('separates omitted H history from E qualification and records sampled absence and return', () => {
  const p = packet(4, [
    Object.fromEntries([at('H_boundary_length_eligible', 0), at('E_qualified', 2)]),
    Object.fromEntries([at('H_boundary_length_eligible', 0)]),
    Object.fromEntries([at('E_qualified', 2), at('H_boundary_length_eligible', 1)])
  ]);
  const out = analyzePacket(p, { size: 4 });
  assert.equal(out.firstBirthOCells.length, 0);
  assert.equal(out.summary.sampledReturns.H, 0);
  assert.equal(out.summary.sampledReturns.O, 0);
  assert.equal(out.summary.sampledReturns.E, 1, 'present, absent, present is one sampled return');
  assert.deepEqual(out.summary.omittedCellsByAnalysis.map(x => x.count), [1, 1, 1]);
});

test('tracks first-birth omitted cells separately from later I incorporation and frozen coverage', () => {
  const p = packet(4, [
    Object.fromEntries([at('H_boundary_length_eligible', 5)]),
    Object.fromEntries([at('H_boundary_length_eligible', 5), at('J_candidate_ribbon', 5)]),
    Object.fromEntries([at('H_boundary_length_eligible', 5), at('I_retained_network', 5)]),
    Object.fromEntries([at('H_boundary_length_eligible', 5), at('I_retained_network', 5), at('J_frozen_birth_union', 5)])
  ], [1]);
  const out = analyzePacket(p, { size: 4 });
  assert.equal(out.summary.firstBirthO, 1);
  assert.deepEqual(out.summary.firstBirthCoverage, { omitted: 1, inCandidateRibbon: 1, outsideCandidateRibbon: 0, inFrozenBirthUnion: 0, outsideFrozenBirthUnion: 1 });
  assert.equal(out.firstBirthOCells[0].birth.laterIFirstAt, 2000);
  assert.equal(out.firstBirthOCells[0].birth.laterIFirstDelayMs, 1000);
  assert.equal(out.firstBirthOCells[0].birth.laterFrozenMaskFirstAt, 3000);
  assert.equal(out.firstBirthOCells[0].birth.alreadyInFrozenBirthUnionAtBirth, false);
  assert.equal(out.firstBirthOCells[0].birth.laterNewFrozenCoverageFirstAt, 3000);
});

test('records every positive component overlap across split and merge without stable identities', () => {
  const p = packet(5, [
    Object.fromEntries([at('H_boundary_length_eligible', 5, 6, 7)]),
    Object.fromEntries([at('H_boundary_length_eligible', 5, 7)]),
    Object.fromEntries([at('H_boundary_length_eligible', 5, 6, 7)])
  ]);
  const out = analyzePacket(p, { size: 5 });
  const timeline = out.componentTimeline.map(x => x.production8.length);
  assert.deepEqual(timeline, [1, 2, 1]);
  assert.equal(out.overlapLinks.production8.filter(x => x.fromTime === 0).length, 2, 'one-to-many split');
  assert.equal(out.overlapLinks.production8.filter(x => x.fromTime === 1000).length, 2, 'many-to-one merge');
});

test('reports diagonal microcycle sensitivity between production 8-neighbor and guarded graphs', () => {
  const p = packet(4, [Object.fromEntries([at('H_boundary_length_eligible', 0, 1, 4)])]);
  const out = analyzePacket(p, { size: 4 });
  assert.equal(out.componentTimeline[0].production8[0].cycleRank, 1);
  assert.equal(out.componentTimeline[0].diagonalGuard[0].cycleRank, 0);
});

test('does not count first onset as a return and uses full H to guard diagonal O edges', () => {
  const p = packet(4, [
    Object.fromEntries([at('H_boundary_length_eligible', 0, 1, 5), at('I_retained_network', 1)]),
    Object.fromEntries([at('H_boundary_length_eligible', 0, 1, 5), at('I_retained_network', 1)]),
    Object.fromEntries([at('H_boundary_length_eligible', 1, 5), at('I_retained_network', 1)])
  ]);
  const out = analyzePacket(p, { size: 4 });
  assert.equal(out.summary.sampledReturns.H, 0, 'initial onset is not a return');
  assert.equal(out.summary.sampledReturns.O, 0);
  assert.equal(out.componentTimeline[0].production8.length, 1);
  assert.equal(out.componentTimeline[0].diagonalGuard.length, 2, 'orthogonal I in H prunes the O diagonal');
});

test('bins fractional contacts by analysis interval and conserves the tail after the last analysis', () => {
  const p = packet(4, [Object.fromEntries([at('H_boundary_length_eligible', 5)]),
    Object.fromEntries([at('H_boundary_length_eligible', 5)]), Object.fromEntries([at('H_boundary_length_eligible', 5)])], [0]);
  p.contacts = [
    { simulationTimeMs: 250, antId: 'a', contacts: [{ legId: 0, position: { x: 1 / 3, y: 1 / 3 } }] },
    { simulationTimeMs: 1250, antId: 'a', contacts: [{ legId: 1, position: { x: 1 / 3, y: 1 / 3 } }] },
    { simulationTimeMs: 2500, antId: 'a', contacts: [{ legId: 2, position: { x: 1 / 3, y: 1 / 3 } }] }
  ];
  const out = analyzePacket(p, { size: 4 });
  const exact = out.firstBirthOCells[0].birth.exactContacts;
  assert.deepEqual(exact.timesMs, [250, 1250, 2500]);
  assert.deepEqual(exact.gapsMs, [1000, 1250]);
  assert.deepEqual(exact.perAnalysis.map(x => x.count), [0, 1, 1]);
  assert.equal(exact.tailAfterLastAnalysis.count, 1);
  assert.equal(exact.perAnalysis.reduce((n, x) => n + x.count, 0) + exact.tailAfterLastAnalysis.count, exact.total);
  assert.equal('lifetimeRatePerSecond' in exact, false);
});

test('marks omitted cells already covered by the frozen union at birth', () => {
  const p = packet(4, [
    Object.fromEntries([at('H_boundary_length_eligible', 5), at('J_frozen_birth_union', 5)]),
    Object.fromEntries([at('H_boundary_length_eligible', 5), at('J_frozen_birth_union', 5)])
  ], [0]);
  const out = analyzePacket(p, { size: 4 });
  const birth = out.firstBirthOCells[0].birth;
  assert.equal(birth.alreadyInFrozenBirthUnionAtBirth, true);
  assert.equal(birth.laterNewFrozenCoverageFirstAt, null);
});

test('rejects nonfinite fields and an I cell outside H', () => {
  const invalidField = packet(3, [Object.fromEntries([at('H_boundary_length_eligible', 0)])]);
  invalidField.analyses[0].maps.B_memory[0] = Number.NaN;
  assert.throws(() => analyzePacket(invalidField, { size: 3 }), /nonfinite/);
  const invalidSubset = packet(3, [Object.fromEntries([at('I_retained_network', 0)])]);
  assert.throws(() => analyzePacket(invalidSubset, { size: 3 }), /I is not a subset of H/);
});
