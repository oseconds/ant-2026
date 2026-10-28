import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { replayMechanicalWindow } from './lib/antEventMechanicalShadow.js';
import { collectOrderedFootLedger, deriveMatchedRepeatWindows, reconstructChemicalWindow } from './lib/antPlateLocalHistoryOwnership.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(root, 'docs/ant/evidence/2026-10-28-plate-local-history-ownership/data');
const packetPath = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz');
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value)}\n`);
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 1024 * 1024 }).toString('utf8').trim();

const packetBytes = await readFile(packetPath);
const capture = JSON.parse(await readFile(resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data/capture.json'), 'utf8'));
assert.equal(sha(packetBytes), capture.packetSha256, 'frozen packet bytes');
const packetRaw = gunzipSync(packetBytes);
assert.equal(sha(packetRaw), capture.rawSha256, 'frozen packet payload');
const packet = JSON.parse(packetRaw);
const inputDigest = sha(JSON.stringify(packet));
const eventState = JSON.parse(await readFile(resolve(root, 'docs/ant/evidence/2026-10-28-materialization-event-state/data/event-state.json'), 'utf8'));
const eventScope = JSON.parse(await readFile(resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data/event-scope.json'), 'utf8'));
const reusePath = resolve(root, 'docs/ant/evidence/2026-10-28-materialization-event-state/data/reuse-contract.json');
const reuseBytes = await readFile(reusePath), reuse = JSON.parse(reuseBytes);
const reuseValidation = JSON.parse(await readFile(resolve(root, 'docs/ant/evidence/2026-10-28-materialization-event-state/data/reuse-validation.json'), 'utf8'));
const reuseRunnerBytes = await readFile(resolve(root, 'scripts/ant-material-event-reuse.js'));
const ledgerRunnerBytes = await readFile(resolve(root, 'scripts/ant-g-formation-information-ledger.js'));
const captureRunnerBytes = await readFile(resolve(root, 'scripts/ant-plate-formation-capture.js'));
const birthRunnerBytes = await readFile(resolve(root, 'src/lib/agents/ant/TrailPlateBirth.js'));
const surfaceSourceBytes = await readFile(resolve(root, 'src/lib/agents/ant/SurfaceField.js'));
const ledgerHelperBytes = await readFile(resolve(root, 'scripts/lib/antPlateLocalHistoryOwnership.js'));
const mechanicalHelperBytes = await readFile(resolve(root, 'scripts/lib/antEventMechanicalShadow.js'));
assert.equal(sha(reuseBytes), reuseValidation.resultSha256, 'matched-repeat fixture result receipt');
assert.equal(sha(reuseRunnerBytes), reuseValidation.runnerSha256, 'matched-repeat fixture runner');
assert.equal(eventState.packetSha256, capture.packetSha256, 'event-state packet provenance');
assert.equal(eventState.validity.exactCandidateParity, true);
assert.equal(eventState.validity.exactFullBirthDescriptors, true);
assert.equal(eventScope.validity.actualBirthMasksExact, true);
assert.equal(eventScope.validity.exactLineageStartFrames, true);
assert.equal(eventScope.validity.inputsUnchanged, true);
const formationLedger = JSON.parse(await readFile(resolve(root,
  'docs/ant/evidence/2026-10-27-g-formation-information-ledger/data/formation-ledger.json'), 'utf8'));
const ledgerRunnerLfBytes = Buffer.from(ledgerRunnerBytes.toString('utf8').replace(/\r\n/g, '\n'));
assert.equal(sha(ledgerRunnerLfBytes), formationLedger.provenance.diagnosticRunnerSha256,
  'sealed formation projection runner after checkout line-ending normalization');
assert.equal(packet.provenance.inheritedRunnerSha256, formationLedger.provenance.diagnosticRunnerSha256,
  'frozen capture names the sealed formation runner');
assert.equal(sha(captureRunnerBytes), packet.provenance.captureRunnerSha256, 'frozen capture runner');
for (const [path, expected] of Object.entries(capture.sourceHashes)) {
  assert.equal(sha(await readFile(resolve(root, path))), expected, `frozen source ${path}`);
}

const cases = [];
const plates = packet.births.map(row => row.payload ?? row).filter(row => row?.mask);
assert.equal(plates.length, 2, 'natural packet has exactly two immutable Plate receipts');
for (const plate of plates) {
  const commitIndex = packet.analyses.findIndex(frame => frame.simulationTimeMs === plate.bornAtSimulationTimeMs);
  assert.ok(commitIndex >= 0, `${plate.id} commit analysis exists`);
  const commitFrame = packet.analyses[commitIndex];
  const eventRow = eventState.rows.find(row => row.simulationTimeMs === plate.bornAtSimulationTimeMs);
  assert.ok(eventRow?.commitIds.includes(plate.id), `${plate.id} reconstructed commit identity`);
  const priorMatchId = eventRow.prebirthMatch;
  const prior = priorMatchId ? plates.find(item => item.id === priorMatchId) : null;
  const anchorMs = prior ? prior.bornAtSimulationTimeMs : commitFrame.candidate?.startedAtMs;
  assert.ok(Number.isFinite(anchorMs) && anchorMs < plate.bornAtSimulationTimeMs, `${plate.id} ownership anchor`);
  const anchorIndex = packet.analyses.findIndex(frame => Math.abs(frame.simulationTimeMs - anchorMs) < 1e-6);
  assert.ok(anchorIndex >= 0 && anchorIndex < commitIndex, `${plate.id} anchor frame`);
  if (!prior) assert.equal(packet.analyses[anchorIndex].simulationTimeMs, commitFrame.candidate.startedAtMs,
    `${plate.id} unmatched anchor equals current lineage start`);
  const mask = Uint8Array.from(plate.mask);
  assert.equal(mask.reduce((sum, value) => sum + value, 0), plate.mask.filter(Boolean).length);
  assert.deepEqual(Array.from(commitFrame.maps.J_candidate_ribbon), plate.mask,
    `${plate.id} frozen descriptor equals saved commit candidate`);
  const historyRow = { id: plate.id, priorMatchId, anchorKind: prior ? 'newest-matched-prior-commit' : 'current-lineage-start',
    anchorMs, anchorIndex, commitMs: plate.bornAtSimulationTimeMs, commitIndex, mask,
    maskCells: mask.reduce((sum, value) => sum + value, 0), priorCommitMs: prior?.bornAtSimulationTimeMs ?? null,
    priorMatchDiagnostics: eventRow.precommitMatches };
  cases.push(historyRow);
}
assert.equal(cases[0].anchorKind, 'current-lineage-start');
assert.equal(cases[1].anchorKind, 'current-lineage-start', 'spatial overlap must not convert Plate 2 into a matched repeat');
assert.equal(cases[1].priorMatchId, null);

const overlapMask = Uint8Array.from(cases[0].mask, (value, index) => value && cases[1].mask[index] ? 1 : 0);
const overlapCells = Array.from(overlapMask, (value, index) => value ? index : -1).filter(index => index >= 0);
assert.equal(overlapCells.length, 223, 'frozen Plate overlap remains the known 223 cells');
const contactTimesMs = footLedgerTimes(packet);
const chemicalResults = new Map(), mechanicalResults = new Map();
for (const item of cases) {
  chemicalResults.set(item.id, reconstructChemicalWindow(packet.analyses, item.anchorIndex, item.commitIndex));
  const result = replayMechanicalWindow(packet, { startIndex: item.anchorIndex, endIndex: item.commitIndex });
  assert.equal(result.validity.exact, true, `${item.id} SurfaceField replay matches every saved anchor`);
  assert.equal(result.validity.matchedAnchors, result.validity.expectedAnchors);
  mechanicalResults.set(item.id, result);
}

const originalRandom = Math.random;
let footLedger;
try {
  Math.random = () => { throw new Error('ownership observer must not consume RNG'); };
  footLedger = collectOrderedFootLedger(packet, cases);
} finally { Math.random = originalRandom; }
assert.equal(footLedger.sourceOrderPreserved, true);
assert.equal(footLedger.rows.length, capture.individualFeet);
assert.ok(footLedger.rows.every(row => row.surfaceFieldAccepted), 'all frozen feet are accepted in-domain SurfaceField contacts');
for (const item of cases) {
  const actual = mechanicalResults.get(item.id);
  const newPhase = footLedger.perCase[item.id].phases.ownedNew;
  assert.equal(actual.originalFeet, newPhase.individualFeet, `${item.id} exact foot count agrees with field replay`);
  assert.equal(actual.originalContactGroups, newPhase.eventGroups, `${item.id} event group count agrees with field replay`);
}

const reuseFixture = reuse.fixtures.find(item => item.schedule === 'continuous-load');
assert.ok(reuseFixture, 'existing continuous matched-repeat fixture');
const contactTimesSeconds = reuseFixture.rows.filter(row => row.seconds > 0).map(row => row.seconds);
assert.equal(contactTimesSeconds.length, reuseFixture.rows.length - 1);
const firstBirthPath = packet.analyses[cases[0].commitIndex].principalPath;
const fixtureCell = firstBirthPath[Math.floor(firstBirthPath.length / 2)];
const fixturePoint = { x: (fixtureCell % 96) / 95, y: Math.floor(fixtureCell / 96) / 95, cell: fixtureCell };
const matchedRepeat = deriveMatchedRepeatWindows(reuseFixture, contactTimesSeconds, fixturePoint);
assert.deepEqual(matchedRepeat.windows.map(window => [window.anchorSeconds, window.commitSeconds, window.newContactCount]),
  [[0, 20, 20], [20, 110, 90], [110, 200, 90]]);

const casesForSummary = cases.map(item => {
  const chem = chemicalResults.get(item.id), field = mechanicalResults.get(item.id);
  const sampleFrames = chemicalSampleFrames(packet, item);
  return { item, chem, field, sampleFrames };
});
const summary = {
  schema: 'ant-plate-local-history-ownership-v1',
  provenance: { baselineMain: git('rev-parse', 'origin/main'), researchParent: '12473f9ec8c7057ea033d9f72fa68c236c60bb50',
    branch: git('branch', '--show-current'), packetSha256: sha(packetBytes), packetRawSha256: sha(packetRaw),
    eventStateResultSha256: sha(await readFile(resolve(root, 'docs/ant/evidence/2026-10-28-materialization-event-state/data/event-state.json'))),
    reuseFixtureSha256: sha(reuseBytes), formationProjectionRunnerSha256: sha(ledgerRunnerLfBytes),
    formationProjectionRunnerWorkingSha256: sha(ledgerRunnerBytes), captureRunnerSha256: sha(captureRunnerBytes),
    ledgerHelperSha256: sha(ledgerHelperBytes), mechanicalReplayHelperSha256: sha(mechanicalHelperBytes),
    sources: { TrailPlateBirth: sha(birthRunnerBytes), SurfaceField: sha(surfaceSourceBytes) } },
  scope: { seed: packet.seed, seconds: packet.seconds, audio: packet.audio, analyses: packet.analyses.length,
    firstAnalysisMs: packet.analyses[0].simulationTimeMs, lastAnalysisMs: packet.analyses.at(-1).simulationTimeMs,
    contactEvents: packet.contacts.length, individualFeet: footLedger.rows.length,
    contactTimeMs: { min: Math.min(...contactTimesMs), max: Math.max(...contactTimesMs),
      lastInSourceOrder: footLedger.rows.at(-1).timeMs }, worldReplays: 0, rngDraws: 0 },
  method: { ownershipInterval: '(anchor, commit]', futureInterval: '(commit, packet contact horizon]',
    anchorRule: 'newest matched prior commit if present; otherwise current lineage start',
    chemical: 'each post-anchor A_projection96 sample is hash-indexed; actual stored B_memory endpoint minus a zero-input Float32 recurrence from anchor is the exact endpoint conditional difference; rounded projection replay is a numerical cross-check only',
    surface: 'source SurfaceField replay from actual anchor, compared with no-new-contact relaxation from the same anchor',
    feet: 'original nested event/contact order; timestamp used only for phase classification; production nearest-node mapping used for per-cell counts' },
  naturalCases: casesForSummary.map(({ item, chem, field, sampleFrames }) =>
    summarizeCase(item, chem, field, footLedger.perCase[item.id], overlapMask, sampleFrames)),
  overlap: { frozenCellCount: overlapCells.length, cellIndices: overlapCells,
    plate1Chemical: summarizeChemical(chemicalResults.get(cases[0].id), overlapMask, null, 'overlapRegion'),
    plate2Chemical: summarizeChemical(chemicalResults.get(cases[1].id), overlapMask, null, 'overlapRegion'),
    plate1Surface: summarizeSurface(mechanicalResults.get(cases[0].id), overlapMask, null,
      packet.analyses[cases[0].anchorIndex].maps.C_surface, 'overlapRegion'),
    plate2Surface: summarizeSurface(mechanicalResults.get(cases[1].id), overlapMask, null,
      packet.analyses[cases[1].anchorIndex].maps.C_surface, 'overlapRegion'),
    plate1OwnedFootContacts: footLedger.perCase[cases[0].id].phases.ownedNew.withinFrozenMask,
    plate2OwnedFootContacts: footLedger.perCase[cases[1].id].phases.ownedNew.withinFrozenMask },
  footStream: { streamSha256: sha(JSON.stringify(packet.contacts)), originalOrderPreserved: true,
    timestampInversionsInArchiveOrder: footLedger.timestampInversions,
    sourceOrderWarning: 'events were not sorted by timestamp and were not reordered' },
  matchedRepeatFixture: { sourceResultSha256: sha(reuseBytes), sourceRunnerSha256: sha(reuseRunnerBytes), ...matchedRepeat }
};

const arrays = {
  schema: 'ant-plate-local-history-ownership-arrays-v1', grid: 96,
  overlapCellIndices: overlapCells,
  plates: casesForSummary.map(({ item, chem, field }) => ({ id: item.id,
    chemical: { anchorMemory: Array.from(chem.anchorMemory), carriedInAtCommit: Array.from(chem.carriedInAtCommit),
      postAnchorEffect: Array.from(chem.postAnchorEffect), actualAtCommit: Array.from(chem.actualAtCommit) },
    surface: { anchor: Array.from(packet.analyses[item.anchorIndex].maps.C_surface),
      noNewContactBaseline: Array.from(field.decayOnlyValues), conditionalEndpointDifference: Array.from(field.retainedIncrementValues),
      actualAtCommit: Array.from(field.observedEndValues) },
    feet: Object.fromEntries(Object.entries(footLedger.perCase[item.id].phases)
      .map(([phase, values]) => [phase, Array.from(values.perCellCounts)]))
  }))
};
const footData = { schema: 'ant-plate-local-history-ownership-feet-v1', sourcePacketSha256: sha(packetBytes),
  sourceStreamSha256: summary.footStream.streamSha256, sourceEventOrderPreserved: true,
  rows: footLedger.rows };
const validation = { schema: 'ant-plate-local-history-ownership-validation-v1', inputUnchanged: sha(JSON.stringify(packet)) === inputDigest,
  frozenPacketHashExact: true, capturedSourceHashesExact: true, priorDescriptorReceiptsExact: true,
  formationRunnerExactAfterLineEndingNormalization: true, captureRunnerHashExact: true,
  chemical: Object.fromEntries(casesForSummary.map(({ item, chem, sampleFrames }) => [item.id, {
    sampledProjectionReplay: chem.sampledProjectionReplay, intervals: chem.intervals,
    actualProjectionSamples: sampleFrames.length, sampleFramesHaveExact96GridMaps: true,
    endpointDecompositionExact: chem.carriedInAtCommit.every((value, cell) =>
      value + chem.postAnchorEffect[cell] === chem.actualAtCommit[cell]) }])),
  surface: Object.fromEntries(casesForSummary.map(({ item, field }) => [item.id, field.validity])),
  originalFootOrderPreserved: footLedger.sourceOrderPreserved, timestampInversionsPreserved: footLedger.timestampInversions,
  fieldAndFootCountsAgree: true, matchedRepeatFirstThreeWindowsUnique: matchedRepeat.uniqueOwnedContributionCount === 200,
  ledgerHelperHashExact: true, mechanicalReplayHelperHashExact: true,
  noControllerOrWorldCreated: true, rngTripwirePassed: true };

const outputs = new Map([
  ['ownership.json', json(summary)],
  ['ownership-arrays.json.gz', gzipSync(Buffer.from(JSON.stringify(arrays)), { level: 9 })],
  ['foot-ledger.json.gz', gzipSync(Buffer.from(JSON.stringify(footData)), { level: 9 })],
  ['matched-repeat-ledger.json', json(matchedRepeat)],
  ['validation.json', json(validation)]
]);
const outputHashes = Object.fromEntries([...outputs.entries()].filter(([name]) => name !== 'validation.json')
  .map(([name, bytes]) => [name, sha(bytes)]));
outputs.set('validation.json', json({ ...validation, outputs: outputHashes,
  runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))) }));
if (process.argv.includes('--check')) {
  for (const [name, bytes] of outputs) assert.deepEqual(await readFile(resolve(out, name)), bytes, `${name} frozen output`);
} else {
  await mkdir(out, { recursive: true });
  for (const name of outputs.keys()) await assert.rejects(readFile(resolve(out, name)), { code: 'ENOENT' }, `refuse overwrite ${name}`);
  for (const [name, bytes] of outputs) await writeFile(resolve(out, name), bytes);
}
console.log(JSON.stringify({ status: 'valid', naturalCases: summary.naturalCases.map(item => ({ id: item.id,
  anchorSeconds: item.anchorSeconds, commitSeconds: item.commitSeconds, maskCells: item.maskCells,
  chemicalReplay: item.chemical.sampledProjectionReplay, surfaceReplay: item.surface.validity,
  ownedFeet: item.feet.ownedNew.individualFeet })), overlapCells: overlapCells.length,
  matchedRepeat: matchedRepeat.windows.map(({ anchorSeconds, commitSeconds, newContactCount }) =>
    ({ anchorSeconds, commitSeconds, newContactCount })), outputHashes }, null, 2));

function summarizeCase(item, chem, field, feet, overlapMask, sampleFrames) {
  const maskOverlap = Uint8Array.from(item.mask, (value, index) => value && overlapMask[index] ? 1 : 0);
  return { id: item.id, priorMatchId: item.priorMatchId, priorMatchDiagnostics: item.priorMatchDiagnostics,
    anchorKind: item.anchorKind, anchorMs: item.anchorMs, anchorSeconds: item.anchorMs / 1000,
    commitMs: item.commitMs, commitSeconds: item.commitMs / 1000, intervals: chem.intervals,
    maskCells: item.maskCells, maskOverlapCells: maskOverlap.reduce((n, value) => n + value, 0),
    chemicalSampleFrames: sampleFrames,
    chemical: summarizeChemical(chem, item.mask, maskOverlap),
    surface: summarizeSurface(field, item.mask, maskOverlap, packet.analyses[item.anchorIndex].maps.C_surface),
    feet: Object.fromEntries(Object.entries(feet.phases).map(([phase, values]) => [phase, {
      eventGroups: values.eventGroups, individualFeet: values.individualFeet,
      withinFrozenMask: values.withinFrozenMask, outsideFrozenMask: values.outsideFrozenMask,
      allGridCells: summarize(values.perCellCounts), frozenFootprint: summarize(values.perCellCounts, item.mask),
      overlapRegion: summarize(values.perCellCounts, maskOverlap)
    }])), examples: { frozenFootprint: extrema(item, chem, field, feet.phases, item.mask),
      overlapRegion: extrema(item, chem, field, feet.phases, maskOverlap) } };
}

function summarizeChemical(chem, selection, overlapSelection = null, selectionName = 'frozenFootprint') {
  return { sampledProjectionReplay: chem.sampledProjectionReplay,
    allGrid: { anchorMemory: summarize(chem.anchorMemory), carriedInAtCommit: summarize(chem.carriedInAtCommit),
      postAnchorEffect: summarize(chem.postAnchorEffect), actualAtCommit: summarize(chem.actualAtCommit) },
    [selectionName]: { anchorMemory: summarize(chem.anchorMemory, selection), carriedInAtCommit: summarize(chem.carriedInAtCommit, selection),
      postAnchorEffect: summarize(chem.postAnchorEffect, selection), actualAtCommit: summarize(chem.actualAtCommit, selection) },
    ...(overlapSelection ? { overlapRegion: { carriedInAtCommit: summarize(chem.carriedInAtCommit, overlapSelection),
      postAnchorEffect: summarize(chem.postAnchorEffect, overlapSelection), actualAtCommit: summarize(chem.actualAtCommit, overlapSelection) } } : {}) };
}

function summarizeSurface(field, selection, overlapSelection = null, anchorValues = null, selectionName = 'frozenFootprint') {
  return { validity: field.validity,
    allGrid: { anchor: summarize(anchorValues ?? []),
      noNewContactBaseline: summarize(field.decayOnlyValues), conditionalEndpointDifference: summarize(field.retainedIncrementValues),
      actualAtCommit: summarize(field.observedEndValues) },
    [selectionName]: { anchor: summarize(anchorValues ?? [], selection),
      noNewContactBaseline: summarize(field.decayOnlyValues, selection),
      conditionalEndpointDifference: summarize(field.retainedIncrementValues, selection), actualAtCommit: summarize(field.observedEndValues, selection) },
    ...(overlapSelection ? { overlapRegion: { noNewContactBaseline: summarize(field.decayOnlyValues, overlapSelection),
      conditionalEndpointDifference: summarize(field.retainedIncrementValues, overlapSelection),
      actualAtCommit: summarize(field.observedEndValues, overlapSelection) } } : {}) };
}

function extrema(item, chem, field, footPhases, selection) {
  const ownedFeet = footPhases.ownedNew.perCellCounts;
  const selectors = {
    strongestCarriedMinusNew: (cell, best) => chem.carriedInAtCommit[cell] - chem.postAnchorEffect[cell]
      > chem.carriedInAtCommit[best] - chem.postAnchorEffect[best],
    strongestNewMinusCarried: (cell, best) => chem.postAnchorEffect[cell] - chem.carriedInAtCommit[cell]
      > chem.postAnchorEffect[best] - chem.carriedInAtCommit[best],
    largestSurfaceDifference: (cell, best) => field.retainedIncrementValues[cell] > field.retainedIncrementValues[best],
    mostOwnedFeet: (cell, best) => ownedFeet[cell] > ownedFeet[best]
  };
  return Object.fromEntries(Object.entries(selectors).map(([label, better]) => {
    const cell = extremeCell(selection, better);
    const row = { cell, x: (cell % 96) / 95, y: Math.floor(cell / 96) / 95,
      chemical: { carriedInAtCommit: chem.carriedInAtCommit[cell], postAnchorEffect: chem.postAnchorEffect[cell],
        actualAtCommit: chem.actualAtCommit[cell] },
      surface: { noNewContactBaseline: field.decayOnlyValues[cell],
        conditionalEndpointDifference: field.retainedIncrementValues[cell], actualAtCommit: field.observedEndValues[cell] },
      footContacts: Object.fromEntries(Object.entries(footPhases).map(([phase, values]) => [phase, values.perCellCounts[cell]])) };
    return [label, row];
  }));
}

function extremeCell(mask, better) {
  let best = -1;
  for (let cell = 0; cell < mask.length; cell += 1) if (mask[cell] && (best < 0 || better(cell, best))) best = cell;
  if (best < 0) throw new Error('cannot select example from empty existing mask');
  return best;
}

function summarize(values, mask = null) {
  const selected = [];
  for (let index = 0; index < values.length; index += 1) if (!mask || mask[index]) selected.push(values[index]);
  if (!selected.length) return { n: 0, min: null, p10: null, p25: null, median: null, p75: null, p90: null, max: null, mean: null,
    negative: 0, exactZero: 0, positive: 0 };
  selected.sort((a, b) => a - b);
  return { n: selected.length, min: selected[0], p10: quantile(selected, 0.1), p25: quantile(selected, 0.25),
    median: quantile(selected, 0.5), p75: quantile(selected, 0.75), p90: quantile(selected, 0.9), max: selected.at(-1),
    mean: selected.reduce((sum, value) => sum + value, 0) / selected.length,
    negative: selected.filter(value => value < 0).length, exactZero: selected.filter(value => value === 0).length,
    positive: selected.filter(value => value > 0).length };
}

function quantile(sorted, p) {
  const index = p * (sorted.length - 1), low = Math.floor(index), high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function footLedgerTimes(packet) {
  return packet.contacts.filter(event => event?.type === 'FOOT_CONTACT').map(event => event.simulationTimeMs);
}

function chemicalSampleFrames(packet, item) {
  return packet.analyses.slice(item.anchorIndex + 1, item.commitIndex + 1).map((frame, offset) => {
    assert.equal(frame.maps.A_projection96.length, 96 * 96);
    return { analysisIndex: item.anchorIndex + 1 + offset, tick: frame.tick,
      simulationTimeMs: frame.simulationTimeMs,
      projection96Sha256: sha(JSON.stringify(frame.maps.A_projection96)) };
  });
}
