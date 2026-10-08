import assert from 'node:assert/strict';
import {
  TRAIL_PLATE_GLOBAL_BIRTH_GAP_MS,
  TRAIL_PLATE_MAX_BIRTHS,
  TRAIL_PLATE_PERSISTENCE_SECONDS,
  TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS,
  TRAIL_PLATE_SAME_CORRIDOR_REFRACTORY_MS,
  TRAIL_PLATE_SIMILARITY_THRESHOLD
} from '../src/lib/agents/ant/TrailPlateBirth.js';

const EPSILON = 1e-9;

export function createShadowTemporalQualifier(corridorSimilarity) {
  assert.equal(typeof corridorSimilarity, 'function');
  const state = { candidate: null, birthRecords: [], lastBirthTimeMs: null, lastAnalysisTimeMs: null };

  function advance(candidate, simulationTimeMs, footContactCounts) {
    assert.ok(Number.isFinite(simulationTimeMs) && simulationTimeMs >= 0);
    assert.ok(state.lastAnalysisTimeMs === null || simulationTimeMs >= state.lastAnalysisTimeMs);
    state.lastAnalysisTimeMs = simulationTimeMs;
    if (!candidate) {
      state.candidate = null;
      return { candidateExists: false, persistenceQualified: false, globalGapOpen: false,
        sameCorridorRefractoryOpen: false, enoughNewFootContacts: false, belowBirthCap: true,
        scheduleQualified: false, virtualBirth: false, virtualBirthCount: state.birthRecords.length,
        firstFailedGate: 'no-candidate' };
    }
    assert.ok(candidate.mask?.length && candidate.path?.length);
    assert.equal(footContactCounts?.length, candidate.mask.length);

    const nowCandidate = { ...candidate, mask: Uint8Array.from(candidate.mask), path: [...candidate.path],
      startedAtMs: simulationTimeMs, stableSeconds: 0, similarity: 0 };
    const similarity = state.candidate ? corridorSimilarity(state.candidate, candidate) : 0;
    if (state.candidate && similarity >= TRAIL_PLATE_SIMILARITY_THRESHOLD) {
      nowCandidate.startedAtMs = state.candidate.startedAtMs;
      nowCandidate.stableSeconds = Math.max(0, (simulationTimeMs - nowCandidate.startedAtMs) / 1000);
      nowCandidate.similarity = similarity;
    }
    const priorBirth = findSameCorridorBirth(state.birthRecords, nowCandidate, corridorSimilarity);
    const repeat = priorBirth ? {
      newFootContacts: Math.max(0, countFootContacts(priorBirth.corridorMask, footContactCounts)
        - priorBirth.footContactsAtBirth),
      refractoryRemainingSeconds: Math.max(0, TRAIL_PLATE_SAME_CORRIDOR_REFRACTORY_MS
        - (simulationTimeMs - priorBirth.bornAtSimulationTimeMs)) / 1000
    } : null;
    state.candidate = nowCandidate;

    const persistenceQualified = nowCandidate.stableSeconds + EPSILON >= TRAIL_PLATE_PERSISTENCE_SECONDS;
    const globalGapOpen = state.lastBirthTimeMs === null
      || simulationTimeMs - state.lastBirthTimeMs >= TRAIL_PLATE_GLOBAL_BIRTH_GAP_MS - EPSILON;
    const sameCorridorRefractoryOpen = !repeat
      || repeat.refractoryRemainingSeconds <= EPSILON;
    const enoughNewFootContacts = !repeat
      || repeat.newFootContacts >= TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS;
    const belowBirthCap = state.birthRecords.length < TRAIL_PLATE_MAX_BIRTHS;
    const scheduleQualified = persistenceQualified && globalGapOpen && sameCorridorRefractoryOpen
      && enoughNewFootContacts && belowBirthCap;
    const firstFailedGate = !persistenceQualified ? 'persistence' : !globalGapOpen ? 'global-gap'
      : !sameCorridorRefractoryOpen ? 'same-corridor-refractory'
        : !enoughNewFootContacts ? 'new-foot-contacts' : !belowBirthCap ? 'birth-cap' : null;
    const virtualBirth = scheduleQualified;
    if (virtualBirth) {
      state.birthRecords.push({ corridorMask: Uint8Array.from(nowCandidate.mask),
        principalPath: [...nowCandidate.path], bornAtSimulationTimeMs: simulationTimeMs,
        footContactsAtBirth: countFootContacts(nowCandidate.mask, footContactCounts) });
      state.lastBirthTimeMs = simulationTimeMs;
    }
    return { candidateExists: true, stableSeconds: nowCandidate.stableSeconds, similarity: nowCandidate.similarity,
      persistenceQualified, globalGapOpen, sameCorridorRefractoryOpen, enoughNewFootContacts,
      newFootContacts: repeat?.newFootContacts ?? null, belowBirthCap, scheduleQualified, virtualBirth,
      virtualBirthCount: state.birthRecords.length, firstFailedGate };
  }

  return { advance };
}

function findSameCorridorBirth(records, candidate, corridorSimilarity) {
  let newestMatch = null;
  for (const record of records) {
    const similarity = corridorSimilarity({ mask: record.corridorMask, path: record.principalPath }, candidate);
    if (similarity < TRAIL_PLATE_SIMILARITY_THRESHOLD) continue;
    if (!newestMatch || record.bornAtSimulationTimeMs > newestMatch.bornAtSimulationTimeMs) newestMatch = record;
  }
  return newestMatch;
}

function countFootContacts(mask, counts) {
  let total = 0;
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) total += counts[index];
  return total;
}
