import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEventSupport } from '../scripts/lib/antEventSupportAtlas.js';

const C = 96 * 96;
function frame(time, patch = {}) {
  const maps = Object.fromEntries(['E_qualified', 'H_boundary_length_eligible', 'I_retained_network', 'J_candidate_ribbon',
    'B_memory', 'C_surface', 'D_support'].map(key => [key, new Float32Array(C)]));
  return { simulationTimeMs: time, candidate: { startedAtMs: 10 }, birthsThisTick: 0, maps, ...patch };
}
function packet(frames, contacts = []) { return { analyses: frames, contacts }; }
function provenance(longer = [], pendant = [], birthIndex = 0) {
  return { rows: Array.from({ length: birthIndex + 1 }, (_, i) => i === birthIndex
    ? { classification: { groups: { selected: [], equalShortest: [], longerAlternative: longer, pendant } } }
    : { classification: { groups: { selected: [], equalShortest: [], longerAlternative: [], pendant: [] } } }) };
}
function set(f, key, cells, value = 1) { for (const c of cells) f.maps[key][c] = value; }

test('event window reports continuous presence and an already-carried onset without treating it as a return', () => {
  const a = frame(0), b = frame(10), c = frame(30); set(a, 'E_qualified', [4]); set(b, 'E_qualified', [4]); set(c, 'E_qualified', [4]);
  set(b, 'H_boundary_length_eligible', [4]);
  const input = packet([a, b, c]); input.analyses[2].candidate.startedAtMs = 5; input.analyses[2].birthsThisTick = 1;
  const result = analyzeEventSupport(input, provenance([], [], 2));
  const row = result.cells.find(x => x.cell === 4);
  assert.equal(result.event.startAnalysisIndex, 1); assert.equal(result.event.endAnalysisIndex, 2);
  assert.equal(row.E.event.leftBoundaryCarryIn, true); assert.equal(row.E.event.onsetOffsetMs, 5);
  assert.equal(row.E.event.endpointIntervalEstimatesMs.bothEndpointsPresent, 20);
  assert.equal(row.E.event.endpointIntervalEstimatesMs.eitherEndpointPresent, 20);
  assert.equal(row.E.event.longestSpanStartOffsetMs, 5); assert.equal(row.E.event.longestSpanEndOffsetMs, 25);
  assert.equal(row.E.event.absenceReturnCount, 0);
});

test('late E onset and reappearance count only the post-absence return', () => {
  const fs = [frame(0), frame(10), frame(25), frame(60)];
  set(fs[1], 'E_qualified', [8]); set(fs[3], 'E_qualified', [8]);
  fs[3].candidate.startedAtMs = 0; fs[3].birthsThisTick = 1;
  const row = analyzeEventSupport(packet(fs), provenance([], [], 3)).cells.find(x => x.cell === 8);
  assert.equal(row.E.event.leftBoundaryCarryIn, false); assert.equal(row.E.event.onsetOffsetMs, 10);
  assert.equal(row.E.event.lastPresentOffsetMs, 60); assert.equal(row.E.event.absenceReturnCount, 1);
});

test('irregular sample gaps produce bounded endpoint duration estimates', () => {
  const fs = [frame(0), frame(7), frame(31), frame(80)];
  set(fs[0], 'E_qualified', [9]); set(fs[1], 'E_qualified', [9]); set(fs[3], 'E_qualified', [9]);
  fs[3].candidate.startedAtMs = 0; fs[3].birthsThisTick = 1;
  const row = analyzeEventSupport(packet(fs), provenance([], [], 3)).cells.find(x => x.cell === 9);
  assert.deepEqual(row.E.event.endpointIntervalEstimatesMs, { bothEndpointsPresent: 7, eitherEndpointPresent: 80,
    interpretation: 'sampled endpoint convention; not continuous-presence bounds or proof' });
});

test('exact feet and 3x3 feet remain separate; window endpoints inclusive, prestart counted separately, invalid domain excluded', () => {
  const fs = [frame(5), frame(10), frame(20)]; fs[2].candidate.startedAtMs = 10; fs[2].birthsThisTick = 1; set(fs[2], 'E_qualified', [0]);
  const pos = cell => ({ x: (cell % 96) / 95, y: Math.floor(cell / 96) / 95 });
  const result = analyzeEventSupport(packet(fs, [
    { simulationTimeMs: 9, contacts: [{ position: pos(0) }] },
    { simulationTimeMs: 10, contacts: [{ position: pos(0) }, { position: pos(1) }] },
    { simulationTimeMs: 20, contacts: [{ position: pos(0) }] },
    { simulationTimeMs: 21, contacts: [{ position: pos(0) }] },
    { simulationTimeMs: 15, contacts: [{ position: { x: 1.01, y: 0.5 } }] }
  ]), provenance([], [], 2));
  const cell = result.cells.find(x => x.cell === 0);
  assert.deepEqual(cell.contacts.exact.timestampsOffsetMs, [0, 10]);
  assert.equal(cell.contacts.exact.cumulativePreStartCount, 1);
  assert.deepEqual(cell.contacts.neighborhood3x3.timestampsOffsetMs, [0, 0, 10]);
  assert.equal(result.unmappedContacts, 1);
});

test('later frozen coverage is not reported as already frozen at birth', () => {
  const fs = [frame(0), frame(10), frame(20)]; fs[1].birthsThisTick = 1; fs[2].candidate.startedAtMs = 0;
  set(fs[1], 'E_qualified', [14]);
  fs[1].maps.J_frozen_birth_union = new Uint8Array(C); set(fs[1], 'J_frozen_birth_union', [14]);
  fs[2].maps.J_frozen_birth_union = new Uint8Array(C); set(fs[2], 'J_frozen_birth_union', [14]);
  set(fs[2], 'I_retained_network', [14]);
  const row = analyzeEventSupport(packet(fs), provenance([14], [], 1)).cells.find(x => x.cell === 14);
  assert.equal(row.ribbon.laterI, true); assert.equal(row.ribbon.frozenAtBirth, true);
  assert.equal(row.ribbon.laterFrozen, true); assert.equal(row.ribbon.laterNewFrozen, false);
  assert.equal(row.classification.longerAlternativeFraction, 1);
});

test('birth ribbon, rather than the packet final frame, defines final ribbon membership', () => {
  const fs = [frame(0), frame(10), frame(20)]; fs[1].birthsThisTick = 1; fs[1].candidate.startedAtMs = 0;
  set(fs[1], 'J_candidate_ribbon', [16]); set(fs[2], 'J_candidate_ribbon', [17]);
  const result = analyzeEventSupport(packet(fs), provenance([], [], 1));
  assert.equal(result.cells.some(x => x.cell === 16 && x.ribbon.final), true);
  assert.equal(result.cells.some(x => x.cell === 17), false);
});

test('birth ordinal resolves its own saved frame and keeps absolute E tenure from packet start', () => {
  const fs = [frame(0), frame(10), frame(20), frame(40)];
  fs[1].birthsThisTick = 1; fs[1].candidate.startedAtMs = 0;
  fs[3].birthsThisTick = 1; fs[3].candidate.startedAtMs = 20;
  set(fs[0], 'E_qualified', [21]); set(fs[1], 'E_qualified', [21]); set(fs[3], 'E_qualified', [21]);
  const row = analyzeEventSupport(packet(fs), provenance([], [], 3), { eventBirthIndex: 1 }).cells.find(x => x.cell === 21);
  assert.equal(row.E.event.onsetOffsetMs, 20);
  assert.equal(row.E.absoluteAtBirth.sampledPresentAnchors, 3);
  assert.equal(row.E.absoluteAtBirth.cumulativeSampledDurationMs, 10);
  assert.equal(row.E.absoluteAtBirth.currentEAtBirth, true);
  assert.equal(row.E.absoluteAtBirth.continuousTenureEndingAtBirthMs, 0);
  assert.equal(row.E.absoluteAtBirth.longestConsecutivePresentAnchorSpanMs, 10);
});

test('analysis does not mutate packet or consume RNG', () => {
  const fs = [frame(0), frame(10)]; set(fs[1], 'E_qualified', [2]); fs[1].birthsThisTick = 1;
  const input = packet(fs, [{ simulationTimeMs: 4, contacts: [{ position: { x: 0, y: 0 } }] }]);
  const before = structuredClone(input), random = Math.random;
  try { Math.random = () => { throw new Error('RNG called'); }; analyzeEventSupport(input, provenance([], [], 1)); }
  finally { Math.random = random; }
  assert.deepEqual(input, before);
});
