import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TrailPlateBirth } from '../src/lib/agents/ant/TrailPlateBirth.js';
import { loadEventStateSource, reconstructEventState } from '../scripts/lib/antMaterialEventState.js';

const sourcePath = new URL('../src/lib/agents/ant/TrailPlateBirth.js', import.meta.url);

test('frozen selector reconstruction preserves candidate through commit and reports ordered repeat gates', async () => {
  const sourceText = await readFile(sourcePath, 'utf8');
  const { module, sourceSHA256, transformSHA256 } = await loadEventStateSource(sourceText);
  assert.match(sourceSHA256, /^[a-f0-9]{64}$/);
  assert.match(transformSHA256, /^[a-f0-9]{64}$/);
  const packet = syntheticPacket(module);
  const before = JSON.stringify(packet);
  const originalRandom = Math.random;
  let randomCalls = 0;
  Math.random = () => { randomCalls++; return originalRandom(); };
  try {
    const result = reconstructEventState(packet, module);
    assert.equal(randomCalls, 0);
    assert.equal(JSON.stringify(packet), before, 'reconstruction leaves frozen input untouched');
    assert.equal(result.births.length, 1);
    assert.ok(result.rows[20].candidateMatchesSavedRibbon);
    assert.ok(result.rows[20].candidateMatchesSavedNetwork);
    assert.ok(result.rows[20].candidateMatchesSavedPath);
    assert.equal(result.rows[0].qualifiedCells, 88,
      'saved E stays intact when a qualified cell carries a Float32 support just below 0.015');
    assert.equal(result.rows[20].commitIds[0], result.births[0].id);
    assert.equal(result.rows[20].postCandidateKept, true, 'commit does not close the selected candidate');
    assert.equal(Object.hasOwn(result.rows[20].candidateParity, 'similarity'), false,
      'metadata absent from the saved candidate is not reported as a mismatch');
    assert.equal(result.rows[30].firstBlockingGate, 'refractory');
    assert.equal(result.rows[110].firstBlockingGate, 'newFeet');
    assert.deepEqual(result.births[0], syntheticProductionBirth());

    const repeated = reconstructEventState(syntheticPacket(module, true), module);
    assert.equal(repeated.births.length, 3, JSON.stringify(repeated.rows[200]));
    assert.equal(repeated.rows[110].prebirthMatch, repeated.births[0].id,
      'repeat selection uses the newest prior match before recording this commit');
    assert.equal(repeated.rows[110].newFeet, 30);
    assert.deepEqual(repeated.births[1], syntheticProductionBirth(2));
    assert.equal(repeated.rows[200].prebirthMatch, repeated.births[1].id,
      'a later repeat selects the newest matching commit, not the original');
    assert.equal(repeated.rows[200].newFeet, 30);
    assert.deepEqual(repeated.births[2], syntheticProductionBirth(3));

    const noCandidate = syntheticPacket(module);
    noCandidate.analyses[0].maps.E_qualified.fill(0);
    assert.equal(reconstructEventState(noCandidate, module).rows[0].firstBlockingGate, 'noSelectedCandidate');

    const malformed = syntheticPacket(module);
    malformed.analyses[0].maps.B_memory.pop();
    assert.throws(() => reconstructEventState(malformed, module), /lacks exact 96x96 selector maps/);
    const unordered = syntheticPacket(module, 'unordered');
    const orderedResult = reconstructEventState(unordered, module);
    assert.equal(orderedResult.rows[1].footCount, 1);
    assert.equal(orderedResult.rows[2].footCount, 2,
      'all newly eligible contacts are consumed in archival order despite nonmonotonic timestamps');
    const invalidTime = syntheticPacket(module);
    invalidTime.analyses[1].simulationTimeMs = NaN;
    assert.throws(() => reconstructEventState(invalidTime, module), /finite and chronological/);
  } finally {
    Math.random = originalRandom;
  }
});

function syntheticPacket(selector, repeat = false) {
  const size = 96, cells = size * size, qualified = new Uint8Array(cells), memory = new Float32Array(cells);
  const support = new Float32Array(cells);
  for (let y = 4; y <= 90; y++) {
    const index = y * size + 48;
    qualified[index] = 1; memory[index] = 0.8; support[index] = 0.02;
  }
  qualified[0] = 1; memory[0] = 0.8;
  const mask = Uint8Array.from(qualified);
  support[0] = 0.014999999664;
  const candidate = selector.selectCandidate(mask, support, memory);
  assert.ok(candidate, 'synthetic stripe is a qualified source-to-boundary route');
  const principal = new Uint8Array(cells);
  for (const index of candidate.path) principal[index] = 1;
  const ribbon = Array.from(candidate.mask);
  const analyses = Array.from({ length: repeat ? 201 : 111 }, (_, second) => ({
    simulationTimeMs: second * 1000,
    maps: { B_memory: Array.from(memory), D_support: Array.from(support),
      E_qualified: Array.from(qualified), I_retained_network: Array.from(candidate.component),
      I_principal_path: Array.from(principal), J_candidate_ribbon: ribbon },
    candidate: { source: candidate.source, target: candidate.target,
      geodesicLength: candidate.geodesicLength, meanChemical: candidate.meanChemical,
      meanSupport: candidate.meanSupport, startedAtMs: 0, stableSeconds: second }
  }));
  const contacts = repeat === 'unordered' ? [2000, 1000].map(simulationTimeMs => ({ simulationTimeMs,
    type: 'FOOT_CONTACT', contacts: [{ position: { x: 48 / 95, y: 20 / 95 } }] }))
    : repeat ? [110000, 200000].map(simulationTimeMs => ({ simulationTimeMs,
    type: 'FOOT_CONTACT', contacts: Array.from({ length: 30 }, (_, index) => ({
      position: { x: 48 / 95, y: (5 + index) / 95 } })) })) : [];
  return { analyses, contacts };
}

function syntheticProductionBirth(maxBirths = 1) {
  const size = 96, cells = size * size;
  const chemical = { sample: (x, y) => Math.abs(x - 48 / 95) < 1e-7 && y >= 4 / 95 && y <= 90 / 95 ? 0.8 : 0 };
  const surface = { sampleSupport: (x, y) => Math.abs(x - 48 / 95) < 1e-7 && y >= 4 / 95 && y <= 90 / 95 ? 0.02 : 0 };
  const system = new TrailPlateBirth({ maxBirths });
  const born = [];
  for (let second = 0; second <= 20; second++) {
    system.chemicalMemory.fill(0);
    for (let y = 4; y <= 90; y++) system.chemicalMemory[y * size + 48] = 0.8;
    system.updateChemicalMemory = () => {};
    born.push(...system.advance({ pheromone: chemical, surface, simulationTimeMs: second * 1000 }));
  }
  if (maxBirths > 1) {
    system.observeFootContact({ type: 'FOOT_CONTACT', contacts:
      Array.from({ length: 30 }, (_, index) => ({ position: { x: 48 / 95, y: (5 + index) / 95 } })) });
    for (let second = 21; second <= 110; second++) {
      system.chemicalMemory.fill(0);
      for (let y = 4; y <= 90; y++) system.chemicalMemory[y * size + 48] = 0.8;
      born.push(...system.advance({ pheromone: chemical, surface, simulationTimeMs: second * 1000 }));
    }
  }
  if (maxBirths > 2) {
    system.observeFootContact({ type: 'FOOT_CONTACT', contacts:
      Array.from({ length: 30 }, (_, index) => ({ position: { x: 48 / 95, y: (5 + index) / 95 } })) });
    for (let second = 111; second <= 200; second++) {
      system.chemicalMemory.fill(0);
      for (let y = 4; y <= 90; y++) system.chemicalMemory[y * size + 48] = 0.8;
      born.push(...system.advance({ pheromone: chemical, surface, simulationTimeMs: second * 1000 }));
    }
  }
  assert.equal(cells, 9216);
  return maxBirths > 2 ? born[2] : maxBirths > 1 ? born[1] : born[0];
}
