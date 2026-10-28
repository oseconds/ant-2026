import { createHash } from 'node:crypto';
import { TRAIL_PLATE_GRID_SIZE } from '../../src/lib/agents/ant/TrailPlateBirth.js';
import { TRAIL_PLATE_CHEMICAL_THRESHOLD,
  TRAIL_PLATE_SIMILARITY_THRESHOLD, TRAIL_PLATE_SAME_CORRIDOR_REFRACTORY_MS,
  TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS, TRAIL_PLATE_GLOBAL_BIRTH_GAP_MS,
  TRAIL_PLATE_PERSISTENCE_SECONDS } from '../../src/lib/agents/ant/TrailPlateBirth.js';
import { TrailPlateBirth } from '../../src/lib/agents/ant/TrailPlateBirth.js';

const sha256 = value => createHash('sha256').update(value).digest('hex');

export async function loadEventStateSource(sourceText) {
  const source = String(sourceText);
  const transformed = `${source}\nexport { selectCandidate, maskSimilarity, pathSimilarity, corridorSimilarity };\n`;
  const module = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`);
  return { module, sourceSHA256: sha256(source), transformSHA256: sha256(transformed) };
}

export function reconstructEventState(packet, selector) {
  if (!packet || !Array.isArray(packet.analyses) || !selector) throw new TypeError('packet analyses and selector module are required');
  const system = new TrailPlateBirth();
  system.updateChemicalMemory = () => {};
  const contacts = packet.contacts || packet.contactStream || packet.events?.contacts || [];
  if (!Array.isArray(contacts)) throw new TypeError('contact stream must be an array');
  contacts.forEach((item, index) => {
    if (!Number.isFinite(contactTime(item))) throw new TypeError(`contact ${index} has no finite simulation time`);
  });
  const consumedContacts = new Uint8Array(contacts.length);
  let acceptedFeet = 0, previousTime = -Infinity;
  const rows = [], births = [];
  for (const frame of packet.analyses) {
    const time = frame.simulationTimeMs;
    if (!Number.isFinite(time) || time < previousTime) throw new TypeError('analysis times must be finite and chronological');
    previousTime = time;
    for (let index = 0; index < contacts.length; index++) {
      if (consumedContacts[index] || contactTime(contacts[index]) > time) continue;
      acceptedFeet += system.observeFootContact(contactPayload(contacts[index]));
      consumedContacts[index] = 1;
    }
    const maps = frame.maps;
    const memory = frame.chemicalMemory || maps?.B_memory;
    const savedSupports = frame.supports || maps?.D_support;
    if (!maps || !memory || !savedSupports || !maps.E_qualified
      || [memory, savedSupports, maps.E_qualified].some(values => values.length !== TRAIL_PLATE_GRID_SIZE ** 2)) {
      throw new TypeError(`analysis ${time} lacks exact ${TRAIL_PLATE_GRID_SIZE}x${TRAIL_PLATE_GRID_SIZE} selector maps`);
    }
    if (![memory, savedSupports, maps.E_qualified].every(values => Array.from(values).every(Number.isFinite))
      || Array.from(maps.E_qualified).some(value => value !== 0 && value !== 1)) {
      throw new TypeError(`analysis ${time} has malformed selector map values`);
    }
    system.chemicalMemory.set(memory);
    const supports = Float32Array.from(savedSupports);
    for (let i = 0; i < supports.length; i++) {
      supports[i] = system.chemicalMemory[i] < TRAIL_PLATE_CHEMICAL_THRESHOLD ? 0 : Math.max(0, supports[i]);
    }
    system.buildSupportedMask = () => {
      const mask = Uint8Array.from(maps.E_qualified);
      let maxChemical = 0, maxSupport = 0, chemicalQualifiedCells = 0, supportedCells = 0;
      for (let i = 0; i < mask.length; i++) {
        maxChemical = Math.max(maxChemical, system.chemicalMemory[i]);
        if (system.chemicalMemory[i] >= TRAIL_PLATE_CHEMICAL_THRESHOLD) {
          chemicalQualifiedCells++;
          maxSupport = Math.max(maxSupport, supports[i]);
        }
        if (mask[i]) supportedCells++;
      }
      return { mask, supports, diagnostics: { maxChemical, maxSupport, chemicalQualifiedCells, supportedCells } };
    };
    const { mask, supports: selectedSupports } = system.buildSupportedMask();
    const current = selector.selectCandidate(mask, selectedSupports, system.chemicalMemory);
    const previousCandidate = system.candidate;
    const continuity = current && previousCandidate ? {
      mask: selector.maskSimilarity(previousCandidate.mask, current.mask),
      path: selector.pathSimilarity(previousCandidate.path, current.path)
    } : null;
    if (continuity) continuity.max = Math.max(continuity.mask, continuity.path);
    const sourceCandidate = current && previousCandidate && continuity.max >= TRAIL_PLATE_SIMILARITY_THRESHOLD
      ? { ...current, startedAtMs: previousCandidate.startedAtMs,
        stableSeconds: Math.max(0, (time - previousCandidate.startedAtMs) / 1000), similarity: continuity.max }
      : current ? { ...current, startedAtMs: time, stableSeconds: 0, similarity: 0 } : null;
    const precommitMatches = sourceCandidate ? system.birthRecords.map(record => ({
      id: record.id,
      mask: selector.maskSimilarity(record.corridorMask, sourceCandidate.mask),
      path: selector.pathSimilarity(record.principalPath, sourceCandidate.path),
      similarity: Math.max(selector.maskSimilarity(record.corridorMask, sourceCandidate.mask),
        selector.pathSimilarity(record.principalPath, sourceCandidate.path)),
      bornAtSimulationTimeMs: record.bornAtSimulationTimeMs
    })) : [];
    const prebirthMatch = sourceCandidate ? system.findSameCorridorBirth(sourceCandidate) : null;
    const priorRecord = prebirthMatch && system.birthRecords.find(record => record.id === prebirthMatch.id);
    const newFeet = priorRecord && sourceCandidate
      ? Math.max(0, system.countFootContacts(priorRecord.corridorMask) - priorRecord.footContactsAtBirth) : null;
    const ageMs = priorRecord ? time - priorRecord.bornAtSimulationTimeMs : null;
    const gapMs = Number.isFinite(system.lastBirthTimeMs) ? time - system.lastBirthTimeMs : Infinity;
    const gateFlags = sourceCandidate ? {
      persistence: sourceCandidate.stableSeconds + 1e-9 >= TRAIL_PLATE_PERSISTENCE_SECONDS,
      globalGap: gapMs >= TRAIL_PLATE_GLOBAL_BIRTH_GAP_MS - 1e-9,
      refractory: !priorRecord || ageMs >= TRAIL_PLATE_SAME_CORRIDOR_REFRACTORY_MS - 1e-9,
      newFeet: !priorRecord || newFeet >= TRAIL_PLATE_REQUIRED_NEW_FOOT_CONTACTS,
      capacity: system.plates.length < system.maxBirths
    } : null;
    const preCommitIds = system.plates.map(plate => plate.id);
    const made = system.advance({ pheromone: null, surface: null, simulationTimeMs: time });
    births.push(...made);
    const candidate = system.candidate;
    const pathMask = candidate && maps.I_principal_path
      ? Uint8Array.from({ length: maps.I_principal_path.length }, (_, index) => candidate.path.includes(index) ? 1 : 0)
      : null;
    rows.push({ simulationTimeMs: time, source: candidate?.source || null, target: candidate?.target || null,
      qualifiedCells: count(mask), networkCells: count(candidate?.component), supportedCells: count(candidate?.supportedMask),
      ribbonCells: count(candidate?.mask), pathLength: candidate?.geodesicLength ?? null,
      startedAtMs: candidate?.startedAtMs ?? null, stableSeconds: candidate?.stableSeconds ?? null,
      similarity: candidate?.similarity ?? null,
      transition: !candidate ? 'none' : !previousCandidate ? 'open'
        : continuity?.max >= TRAIL_PLATE_SIMILARITY_THRESHOLD ? 'continue' : 'restart',
      continuity, gateFlags, firstBlockingGate: !sourceCandidate ? 'noSelectedCandidate'
        : Object.keys(gateFlags).find(key => !gateFlags[key]) || null,
      precommitMatches, prebirthMatch: prebirthMatch?.id ?? null, newFeet, ageMs,
      refractoryRemainingMs: priorRecord ? Math.max(0, TRAIL_PLATE_SAME_CORRIDOR_REFRACTORY_MS - ageMs) : null,
      globalGapRemainingMs: Number.isFinite(gapMs) ? Math.max(0, TRAIL_PLATE_GLOBAL_BIRTH_GAP_MS - gapMs) : 0,
      commitIds: made.map(plate => plate.id), preCommitIds, postCandidateKept: Boolean(candidate && system.candidate),
      candidateFootContacts: candidate?.footContacts ?? null, footCount: acceptedFeet,
      candidateMatchesSavedRibbon: !candidate || !maps.J_candidate_ribbon
        || arraysEqual(candidate.mask, maps.J_candidate_ribbon),
      candidateMatchesSavedNetwork: !candidate || !maps.I_retained_network
        || arraysEqual(candidate.component, maps.I_retained_network),
      candidateMatchesSavedPath: !candidate || !maps.I_principal_path
        || arraysEqual(pathMask, maps.I_principal_path),
      candidateParity: savedCandidateParity(frame.candidate, candidate, pathMask) });
  }
  const receiptBirths = (packet.births || []).map(item => item.payload || item).filter(item => item?.type !== 'FOOT_CONTACT');
  return { rows, births, acceptedFeet, finalFootCounts: Array.from(system.footContactCounts),
    birthParity: receiptBirths.length ? {
      compared: receiptBirths.length,
      exact: receiptBirths.length === births.length && receiptBirths.every((receipt, index) =>
        JSON.stringify(receipt) === JSON.stringify(births[index]))
    } : null };
}

function contactPayload(item) { return item.event || item.payload || item; }
function contactTime(item) { return item.simulationTimeMs ?? item.timeMs ?? item.time ?? Infinity; }
function count(values) { return values ? values.reduce((n, value) => n + (value ? 1 : 0), 0) : 0; }
function arraysEqual(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
function savedCandidateParity(saved, actual, pathMask) {
  if (saved === undefined) return null;
  if (!saved || !actual) return null;
  const checks = {};
  for (const key of ['source', 'target', 'geodesicLength', 'meanChemical', 'meanSupport', 'startedAtMs',
    'stableSeconds', 'similarity', 'path', 'mask', 'pathMask']) {
    if (saved[key] == null) continue;
    checks[key] = key === 'mask' ? arraysEqual(saved[key], actual.mask)
      : key === 'pathMask' ? arraysEqual(saved[key], pathMask)
        : JSON.stringify(saved[key]) === JSON.stringify(actual[key]);
  }
  return checks;
}
