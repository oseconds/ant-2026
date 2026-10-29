import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(ROOT, 'docs/ant/evidence/2026-10-29-proposal-update-diagnostic');
const FROZEN = join(ROOT, 'docs/ant/evidence/2026-10-29-event-evolved-scope/data/frozen-event-input.json.gz');
const PARENT_ANALYSIS = join(ROOT, 'docs/ant/evidence/2026-10-29-event-evolved-scope/analysis.json');
const SOURCE = join(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js');
const GRID = 96;
const CELL_COUNT = GRID * GRID;
const THRESHOLD = 0.6;
const MATURITY_SECONDS = 20;
const EXPECTED_MAIN = '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785';
const EXPECTED_PARENT = '849f324dfc6ea4c7da89ac7153a7e2a7fa8c4bad';
const EXPECTED_SOURCE_BLOB = '238cc365f2602dc6a22091d69237b88962825a13';
const EXPECTED_SOURCE_SHA256 = 'cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67';
const OUTPUTS = ['analysis.json', 'transition-table.csv', 'transition-cells.json', 'atlas-data.json'];

function lf(value) { return value.replace(/\r\n?/g, '\n'); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function shaText(value) { return sha(Buffer.from(lf(value), 'utf8')); }
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function sorted(values) { return [...values].sort((a, b) => a - b); }
function setIntersection(a, b) { return sorted([...a].filter(value => b.has(value))); }
function setDifference(a, b) { return sorted([...a].filter(value => !b.has(value))); }
function ratio(numerator, denominator) { return denominator ? numerator / denominator : null; }
function assertNear(actual, expected, label, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, label + ': ' + actual + ' != ' + expected);
}
function validCells(values, label) {
  assert.ok(Array.isArray(values), label + ' must be an array');
  const result = new Set();
  for (const value of values) {
    assert.ok(Number.isInteger(value) && value >= 0 && value < CELL_COUNT, label + ' cell out of range: ' + value);
    assert.ok(!result.has(value), label + ' contains duplicate cell: ' + value);
    result.add(value);
  }
  return result;
}
function mask(values) {
  const result = new Uint8Array(CELL_COUNT);
  for (const value of values) result[value] = 1;
  return result;
}
function sourceFunctions(code) {
  const similarityStart = code.indexOf('function corridorSimilarity(');
  const similarityEnd = code.indexOf('function pointOnGridPath(');
  const neighborStart = code.indexOf('function neighbors(');
  const neighborEnd = code.indexOf('function diagonal(');
  assert.ok(similarityStart >= 0 && similarityEnd > similarityStart, 'source continuity functions are available');
  assert.ok(neighborStart >= 0 && neighborEnd > neighborStart, 'source neighbor function is available');
  const source = 'const CELL_COUNT=' + CELL_COUNT + ',TRAIL_PLATE_GRID_SIZE=' + GRID + ';\n'
    + code.slice(neighborStart, neighborEnd) + '\n'
    + code.slice(similarityStart, similarityEnd) + '\n'
    + '({ corridorSimilarity, maskSimilarity, pathSimilarity, neighbors })';
  const protectedMath = Object.create(Math);
  protectedMath.random = () => { throw new Error('No RNG allowed in source-function evaluation'); };
  return runInNewContext(source, { Math: protectedMath });
}
function compare(previous, current, f) {
  const maskJaccard = f.maskSimilarity(mask(previous.ribbonCells), mask(current.ribbonCells));
  const previousPath = previous.principalPath ?? previous.path;
  const currentPath = current.principalPath ?? current.path;
  const pathForward = f.pathSimilarity(previousPath, currentPath);
  const maximum = Math.max(maskJaccard, pathForward);
  assert.equal(f.corridorSimilarity({ mask: mask(previous.ribbonCells), path: previousPath },
    { mask: mask(current.ribbonCells), path: currentPath }), maximum);
  return { maskJaccard, pathForward, maximum, passes: maximum >= THRESHOLD };
}
function componentCount(values, neighbors) {
  const unseen = new Set(values);
  let count = 0;
  for (const start of sorted(unseen)) {
    if (!unseen.delete(start)) continue;
    count += 1;
    const queue = [start];
    for (let head = 0; head < queue.length; head += 1) {
      for (const adjacent of neighbors(queue[head])) if (unseen.delete(adjacent)) queue.push(adjacent);
    }
  }
  return count;
}
function availabilityCounts(values, h, e) {
  const result = { inHAndE: 0, inEOnly: 0, inHOnly: 0, inNeither: 0 };
  for (const cell of values) {
    if (h.has(cell)) result[e.has(cell) ? 'inHAndE' : 'inHOnly'] += 1;
    else result[e.has(cell) ? 'inEOnly' : 'inNeither'] += 1;
  }
  return result;
}
function median(values) {
  if (!values.length) return null;
  const a = sorted(values);
  const middle = Math.floor(a.length / 2);
  return a.length % 2 ? a[middle] : (a[middle - 1] + a[middle]) / 2;
}
function ageForCell(eSets, destinationIndex, cell) {
  let first = destinationIndex;
  while (first > 0 && eSets[first - 1].has(cell)) first -= 1;
  return {
    firstQualifiedAnchorIndex: first,
    consecutiveQualifiedAnchors: destinationIndex - first + 1,
    continuousSavedIntervals: destinationIndex - first
  };
}
function closeInput(input, parent) {
  assert.equal(input.schema, 'ant-event-evolution-frozen-input-v1');
  assert.equal(input.main, EXPECTED_MAIN);
  assert.equal(input.parent, '58ce59fcdb01187cbaf0b6453199556f2c4b5331');
  assert.equal(parent.main, EXPECTED_MAIN);
  assert.equal(parent.parent, input.parent);
  assert.equal(parent.seed, input.seed);
  assert.equal(parent.events.length, 2);
  assert.equal(input.events.length, 2);
  assert.equal(input.events[0].id, 'trail-plate-1');
  assert.equal(input.events[1].id, 'trail-plate-2');
  assert.equal(input.events[0].frames.length, 21);
  assert.equal(input.events[1].frames.length, 21);
  const structureReceipt = input.inputs.find(item => item.path.endsWith('frozen-structures.json.gz'));
  assert.ok(structureReceipt, 'parent frozen structural receipt exists');
  const structureBytes = readFileSync(join(ROOT, structureReceipt.path));
  assert.equal(sha(structureBytes), structureReceipt.sha256, 'frozen structural input receipt');
  for (let eventIndex = 0; eventIndex < input.events.length; eventIndex += 1) {
    const event = input.events[eventIndex];
    const old = parent.events[eventIndex];
    assert.equal(event.id, old.id);
    assert.equal(event.frames.length, old.rows.length);
    for (let i = 0; i < event.frames.length; i += 1) {
      const frame = event.frames[i], oldRow = old.rows[i];
      assert.equal(frame.timeMs / 1000, oldRow.seconds, event.id + ' saved time parity ' + i);
      assert.deepEqual(frame.I, oldRow.I, event.id + ' saved I parity ' + i);
      assert.deepEqual(frame.E, oldRow.E, event.id + ' saved E parity ' + i);
      assert.deepEqual(frame.H, oldRow.H, event.id + ' saved H parity ' + i);
      const I = validCells(frame.I, event.id + ' I[' + i + ']');
      const E = validCells(frame.E, event.id + ' E[' + i + ']');
      validCells(frame.H, event.id + ' H[' + i + ']');
      validCells(frame.principalPath, event.id + ' principalPath[' + i + ']');
      validCells(frame.ribbonCells, event.id + ' ribbonCells[' + i + ']');
      for (const cell of I) assert.ok(E.has(cell), event.id + ' I must be included in E at anchor ' + i + ' cell ' + cell);
      assert.equal(frame.candidate !== null, true);
    }
  }
  return EXPECTED_SOURCE_BLOB;
}
function actualClockParity(event, parentEvent, timerFrames, f) {
  let startMs = null;
  let previous = null;
  return event.frames.map((frame, index) => {
    let similarity = null;
    if (!previous && index === 0) {
      const prior = timerFrames.find(row => Math.abs(row.timeMs - (frame.timeMs - 1000)) < 0.01);
      if (prior?.candidate) similarity = compare(prior, frame, f);
      if (similarity?.passes) startMs = prior.candidate.startedAtMs;
      else startMs = frame.timeMs;
    } else {
      similarity = compare(previous, frame, f);
      if (!similarity.passes) startMs = frame.timeMs;
    }
    const stableSeconds = (frame.timeMs - startMs) / 1000;
    assert.equal(startMs, frame.candidate.startedAtMs, event.id + ' production clock start at ' + index);
    assertNear(stableSeconds, frame.candidate.stableSeconds, event.id + ' production clock age at ' + index);
    const parentSimilarity = parentEvent.rows[index].similarity;
    if (similarity === null) assert.equal(parentSimilarity, null);
    else {
      assertNear(similarity.maskJaccard, parentSimilarity.maskJaccard, event.id + ' source mask parity ' + index);
      assertNear(similarity.pathForward, parentSimilarity.pathForward, event.id + ' source path parity ' + index);
      assertNear(similarity.maximum, parentSimilarity.maximum, event.id + ' source maximum parity ' + index);
    }
    previous = frame;
    return { timeMs: frame.timeMs, stableSeconds, startMs, similarity,
      mature: stableSeconds + 1e-9 >= MATURITY_SECONDS };
  });
}
function analyzeEvent(event, parentEvent, timerFrames, f) {
  const frames = event.frames;
  const eSets = frames.map((frame, i) => validCells(frame.E, event.id + ' E ' + i));
  const iSets = frames.map((frame, i) => validCells(frame.I, event.id + ' I ' + i));
  const hSets = frames.map((frame, i) => validCells(frame.H, event.id + ' H ' + i));
  const pathSets = frames.map((frame, i) => validCells(frame.principalPath, event.id + ' principal path ' + i));
  const clock = actualClockParity(event, parentEvent, timerFrames, f);
  const transitionRows = [];
  const occurrences = [];
  const cellReceipts = [];
  for (let i = 1; i < frames.length; i += 1) {
    const prevI = iSets[i - 1], currentI = iSets[i], currentE = eSets[i], currentH = hSets[i];
    const retained = setIntersection(prevI, currentI);
    const dropped = setDifference(prevI, currentI);
    const invalidated = setDifference(prevI, currentE);
    const survivedInE = setIntersection(prevI, currentE);
    const stillValidDropped = setDifference(new Set(survivedInE), currentI);
    const gained = setDifference(currentI, prevI);
    assert.equal(prevI.size, invalidated.length + retained.length + stillValidDropped.length,
      event.id + ' one-step prior-I partition at ' + i);
    assert.equal(currentI.size, retained.length + gained.length, event.id + ' one-step current-I partition at ' + i);
    assert.equal(survivedInE.length, retained.length + stillValidDropped.length);
    const droppedAvailability = availabilityCounts(dropped, currentH, currentE);
    const stillValidAvailability = availabilityCounts(stillValidDropped, currentH, currentE);
    assert.equal(stillValidAvailability.inEOnly + stillValidAvailability.inHAndE, stillValidDropped.length);
    const prevPath = pathSets[i - 1], currentPath = pathSets[i];
    const droppedOnPreviousPath = setIntersection(dropped, prevPath);
    const droppedOffPreviousPath = setDifference(dropped, prevPath);
    const validOnPreviousPath = setIntersection(stillValidDropped, prevPath);
    const validOffPreviousPath = setDifference(stillValidDropped, prevPath);
    const gainedOnCurrentPath = setIntersection(gained, currentPath);
    const gainedOffCurrentPath = setDifference(gained, currentPath);
    const from = frames[i - 1], to = frames[i];
    const row = {
      transitionIndex: i,
      fromTimeMs: from.timeMs,
      toTimeMs: to.timeMs,
      fromSeconds: from.timeMs / 1000,
      toSeconds: to.timeMs / 1000,
      elapsedSeconds: (to.timeMs - from.timeMs) / 1000,
      previousICells: prevI.size,
      currentECells: currentE.size,
      currentHCells: currentH.size,
      currentICells: currentI.size,
      survivingInCurrentE: survivedInE.length,
      environmentalSurvivalRate: ratio(survivedInE.length, prevI.size),
      genuinelyInvalidated: invalidated.length,
      stillValidButDropped: stillValidDropped.length,
      retainedByProduction: retained.length,
      gainedByProduction: gained.length,
      droppedByProduction: dropped.length,
      stillValidDroppedOfDroppedRate: ratio(stillValidDropped.length, dropped.length),
      stillValidDroppedOfPreviousIRate: ratio(stillValidDropped.length, prevI.size),
      stillValidDroppedOfCurrentERate: ratio(stillValidDropped.length, currentE.size),
      droppedAvailabilityNow: droppedAvailability,
      stillValidAvailabilityNow: stillValidAvailability,
      droppedOnPreviousPrincipalPath: droppedOnPreviousPath.length,
      droppedOffPreviousPrincipalPath: droppedOffPreviousPath.length,
      stillValidDroppedOnPreviousPrincipalPath: validOnPreviousPath.length,
      stillValidDroppedOffPreviousPrincipalPath: validOffPreviousPath.length,
      gainedOnCurrentPrincipalPath: gainedOnCurrentPath.length,
      gainedOffCurrentPrincipalPath: gainedOffCurrentPath.length,
      previousWholeIStillInCurrentE: invalidated.length === 0,
      previousWholePrincipalStillInCurrentE: [...prevPath].every(cell => currentE.has(cell))
    };
    transitionRows.push(row);
    const ages = stillValidDropped.map(cell => {
      const age = ageForCell(eSets, i, cell);
      const occurrence = {
        event: event.id,
        transitionIndex: i,
        timeMs: to.timeMs,
        timeSeconds: to.timeMs / 1000,
        cell,
        previousPrincipalPathMember: prevPath.has(cell),
        currentHMember: currentH.has(cell),
        firstQualifiedAnchorIndex: age.firstQualifiedAnchorIndex,
        consecutiveQualifiedAnchors: age.consecutiveQualifiedAnchors,
        continuousSavedIntervals: age.continuousSavedIntervals
      };
      occurrences.push(occurrence);
      return occurrence;
    });
    cellReceipts.push({
      transitionIndex: i,
      fromTimeMs: from.timeMs,
      toTimeMs: to.timeMs,
      retained,
      gained,
      dropped,
      invalidated,
      stillValidButDropped: stillValidDropped,
      droppedOnPreviousPrincipalPath: droppedOnPreviousPath,
      droppedOffPreviousPrincipalPath: droppedOffPreviousPath,
      stillValidDroppedOnPreviousPrincipalPath: validOnPreviousPath,
      stillValidDroppedOffPreviousPrincipalPath: validOffPreviousPath,
      ageOccurrences: ages
    });
  }
  const startI = iSets[0];
  const startSurvival = frames.map((frame, i) => {
    const supported = setIntersection(startI, eSets[i]);
    return {
      anchorIndex: i,
      timeMs: frame.timeMs,
      seconds: frame.timeMs / 1000,
      secondsSinceStart: (frame.timeMs - frames[0].timeMs) / 1000,
      startICells: startI.size,
      startCellsInCurrentE: supported.length,
      startProposalSurvivalRate: ratio(supported.length, startI.size),
      unsupportedStartCells: setDifference(startI, eSets[i])
    };
  });
  const lostTotal = transitionRows.reduce((sum, row) => sum + row.droppedByProduction, 0);
  const validDroppedTotal = transitionRows.reduce((sum, row) => sum + row.stillValidButDropped, 0);
  const invalidatedTotal = transitionRows.reduce((sum, row) => sum + row.genuinelyInvalidated, 0);
  const previousITransitionTotal = transitionRows.reduce((sum, row) => sum + row.previousICells, 0);
  const currentETotal = transitionRows.reduce((sum, row) => sum + row.currentECells, 0);
  const ageIntervals = occurrences.map(row => row.continuousSavedIntervals);
  const ageHistogram = Object.fromEntries(Array.from({ length: frames.length - 1 }, (_, i) => [String(i + 1), 0]));
  for (const age of ageIntervals) ageHistogram[String(age)] += 1;
  const ageRoleSummary = {};
  for (const [key, selector] of [
    ['previousPrincipalPath', row => row.previousPrincipalPathMember],
    ['previousNonPrincipalSelected', row => !row.previousPrincipalPathMember]
  ]) {
    const values = occurrences.filter(selector).map(row => row.continuousSavedIntervals);
    ageRoleSummary[key] = { occurrences: values.length, histogram: Object.fromEntries(
      Array.from({ length: frames.length - 1 }, (_, i) => [String(i + 1), values.filter(value => value === i + 1).length])),
      medianIntervals: median(values), minIntervals: values.length ? Math.min(...values) : null,
      maxIntervals: values.length ? Math.max(...values) : null };
  }
  const largestTurnover = transitionRows.reduce((best, row) =>
    row.droppedByProduction + row.gainedByProduction > best.droppedByProduction + best.gainedByProduction ? row : best,
    transitionRows[0]);
  const inspected = [largestTurnover];
  if (event.id === 'trail-plate-2') {
    for (const seconds of [94.016666666, 104.016666666]) {
      const row = transitionRows.find(candidate => Math.abs(candidate.toSeconds - seconds) < 0.00001);
      assert.ok(row, 'requested P2 inspection anchor ' + seconds);
      inspected.push(row);
    }
  }
  const uniqueInspected = [...new Map(inspected.map(row => [row.transitionIndex, row])).values()];
  const rowSummary = {
    transitions: transitionRows.length,
    previousICellTransitionOccurrences: previousITransitionTotal,
    currentECellTransitionOccurrences: currentETotal,
    dropped: lostTotal,
    stillValidButDropped: validDroppedTotal,
    genuinelyInvalidated: invalidatedTotal,
    stillValidDroppedOfDroppedRate: ratio(validDroppedTotal, lostTotal),
    stillValidDroppedOfPreviousITransitionRate: ratio(validDroppedTotal, previousITransitionTotal),
    stillValidDroppedOfCurrentETransitionRate: ratio(validDroppedTotal, currentETotal),
    droppedOnPreviousPrincipalPath: transitionRows.reduce((s, r) => s + r.droppedOnPreviousPrincipalPath, 0),
    droppedOffPreviousPrincipalPath: transitionRows.reduce((s, r) => s + r.droppedOffPreviousPrincipalPath, 0),
    stillValidDroppedOnPreviousPrincipalPath: transitionRows.reduce((s, r) => s + r.stillValidDroppedOnPreviousPrincipalPath, 0),
    stillValidDroppedOffPreviousPrincipalPath: transitionRows.reduce((s, r) => s + r.stillValidDroppedOffPreviousPrincipalPath, 0),
    gained: transitionRows.reduce((s, r) => s + r.gainedByProduction, 0),
    gainedOnCurrentPrincipalPath: transitionRows.reduce((s, r) => s + r.gainedOnCurrentPrincipalPath, 0),
    gainedOffCurrentPrincipalPath: transitionRows.reduce((s, r) => s + r.gainedOffCurrentPrincipalPath, 0),
    wholePreviousIStillInETransitions: transitionRows.filter(r => r.previousWholeIStillInCurrentE).length,
    wholePreviousPrincipalStillInETransitions: transitionRows.filter(r => r.previousWholePrincipalStillInCurrentE).length,
    startSurvivalAtCommit: startSurvival.at(-1),
    startProposalFirstUnsupportedAnchor: startSurvival.find(row => row.unsupportedStartCells.length > 0) ?? null,
    droppedValidCellTransitionOccurrences: occurrences.length,
    uniqueStillValidDroppedCoordinates: new Set(occurrences.map(row => row.cell)).size,
    continuousSavedIntervalAgeHistogram: ageHistogram,
    ageMedianIntervals: median(ageIntervals),
    ageMinIntervals: ageIntervals.length ? Math.min(...ageIntervals) : null,
    ageMaxIntervals: ageIntervals.length ? Math.max(...ageIntervals) : null,
    ageByPreviousSelectionRole: ageRoleSummary
  };
  return {
    id: event.id,
    event: event.event,
    anchors: frames.length,
    startTimeMs: frames[0].timeMs,
    commitTimeMs: frames.at(-1).timeMs,
    anchorIntervalSeconds: (frames.at(-1).timeMs - frames[0].timeMs) / 1000 / (frames.length - 1),
    actualMaturityAtCommit: clock.at(-1),
    summary: rowSummary,
    startSurvival,
    transitionRows,
    transitionCellReceipts: cellReceipts,
    inspectedTransitions: uniqueInspected,
    ageOccurrences: occurrences,
    strictRetention: strictRetention(event, eSets, hSets, iSets, f),
    atlasPanels: atlasPanels(event, transitionRows, frames)
  };
}
function strictRetention(event, eSets, hSets, iSets, f) {
  const frames = event.frames;
  let incumbent = frames[0];
  let clockStartMs = frames[0].timeMs;
  let heldTransitions = 0, replacementTransitions = 0, clockResets = 0;
  let differentFromProductionTransitions = 0;
  const startSupport = hSets[0].size
    ? incumbent.I.filter(cell => hSets[0].has(cell)).length / incumbent.I.length
    : null;
  const rows = [{
    anchorIndex: 0, timeMs: frames[0].timeMs, seconds: frames[0].timeMs / 1000,
    action: 'START incumbent', invalidatedCellCount: 0, invalidatingCells: [],
    incumbentICells: incumbent.I.length, incumbentStillInCurrentE: incumbent.I.length,
    incumbentInCurrentH: incumbent.I.filter(cell => hSets[0].has(cell)).length,
    incumbentCurrentHShare: startSupport,
    connectedComponents8: componentCount(incumbent.I, f.neighbors),
    actualICells: frames[0].I.length, incumbentExactlyMatchesActual: true,
    incumbentOnlyComparedWithActual: 0, actualOnlyComparedWithIncumbent: 0, jaccardWithActual: 1,
    similarity: null, clockStartMs, stableSeconds: 0, mature: false
  }];
  for (let i = 1; i < frames.length; i += 1) {
    const before = incumbent;
    const invalidatingCells = before.I.filter(cell => !eSets[i].has(cell));
    const action = invalidatingCells.length ? 'replace with actual current I' : 'hold entire incumbent';
    const next = invalidatingCells.length ? frames[i] : before;
    const similarity = compare(before, next, f);
    if (!similarity.passes) { clockStartMs = frames[i].timeMs; clockResets += 1; }
    if (invalidatingCells.length) replacementTransitions += 1;
    else heldTransitions += 1;
    incumbent = next;
    const stableSeconds = (frames[i].timeMs - clockStartMs) / 1000;
    const actualSet = iSets[i];
    const incumbentOnly = setDifference(new Set(incumbent.I), actualSet);
    const actualOnly = setDifference(actualSet, new Set(incumbent.I));
    const overlap = incumbent.I.length - incumbentOnly.length;
    const union = incumbent.I.length + actualOnly.length;
    if (incumbentOnly.length || actualOnly.length) differentFromProductionTransitions += 1;
    const components = componentCount(incumbent.I, f.neighbors);
    assert.equal(components, 1, event.id + ' strict-retention proposal remains connected at ' + i);
    const inCurrentE = incumbent.I.filter(cell => eSets[i].has(cell)).length;
    assert.equal(inCurrentE, incumbent.I.length, event.id + ' counterfactual incumbent E-admissible after update at ' + i);
    rows.push({
      anchorIndex: i, timeMs: frames[i].timeMs, seconds: frames[i].timeMs / 1000,
      action, invalidatedCellCount: invalidatingCells.length, invalidatingCells,
      incumbentICells: incumbent.I.length, incumbentStillInCurrentE: inCurrentE,
      incumbentInCurrentH: incumbent.I.filter(cell => hSets[i].has(cell)).length,
      incumbentCurrentHShare: incumbent.I.length
        ? incumbent.I.filter(cell => hSets[i].has(cell)).length / incumbent.I.length : null,
      connectedComponents8: components,
      actualICells: frames[i].I.length,
      incumbentExactlyMatchesActual: incumbent.I.length === actualSet.size && incumbent.I.every(cell => actualSet.has(cell)),
      incumbentOnlyComparedWithActual: incumbentOnly.length,
      actualOnlyComparedWithIncumbent: actualOnly.length,
      jaccardWithActual: union ? overlap / union : 1,
      similarity, clockStartMs, stableSeconds,
      mature: stableSeconds + 1e-9 >= MATURITY_SECONDS
    });
  }
  const commit = rows.at(-1);
  return {
    rule: 'hold the entire current incumbent while every incumbent I cell remains in saved current E; otherwise replace with the actual current proposal',
    continuity: 'retained path/ribbon are held with I; on replacement, compare the previous counterfactual candidate to the current actual candidate using production mask/path max and threshold',
    heldTransitions,
    replacementTransitions,
    clockResets,
    differentFromProductionTransitions,
    wholeIncumbentStillInCurrentHTransitions: rows.filter(row => row.incumbentInCurrentH === row.incumbentICells).length,
    meanCurrentHShareAcrossAnchors: rows.reduce((sum, row) => sum + (row.incumbentCurrentHShare ?? 0), 0) / rows.length,
    startIInitialHShare: startSupport,
    firstInvalidation: rows.find(row => row.invalidatedCellCount > 0) ?? null,
    invalidationAnchors: rows.filter(row => row.invalidatedCellCount > 0).map(row => ({
      anchorIndex: row.anchorIndex, timeMs: row.timeMs, seconds: row.seconds,
      count: row.invalidatedCellCount, cells: row.invalidatingCells
    })),
    wholeIncumbentHeldToCommit: rows.every(row =>
      row.anchorIndex === 0 || row.action === 'hold entire incumbent'),
    commitClockStartMs: commit.clockStartMs,
    commitStableSeconds: commit.stableSeconds,
    commitMatureAtOriginalEndpoint: commit.mature,
    commitIncumbentCellCount: commit.incumbentICells,
    commitActualCellCount: commit.actualICells,
    commitIncumbentMatchesActual: commit.incumbentExactlyMatchesActual,
    commitIncumbentOnlyComparedWithActual: commit.incumbentOnlyComparedWithActual,
    commitActualOnlyComparedWithIncumbent: commit.actualOnlyComparedWithIncumbent,
    commitJaccardWithActual: commit.jaccardWithActual,
    rows
  };
}
function atlasPanels(event, transitionRows, frames) {
  const n = frames.length;
  const largest = transitionRows.reduce((best, row) =>
    row.droppedByProduction + row.gainedByProduction > best.droppedByProduction + best.gainedByProduction ? row : best,
    transitionRows[0]);
  const specs = [
    { index: 0, label: 'START' },
    { index: Math.floor((n - 1) / 2), label: 'MIDPOINT' },
    { index: largest.transitionIndex, label: 'MAX TURNOVER' },
    { index: n - 2, label: 'LATE (PRE-COMMIT)' },
    { index: n - 1, label: 'COMMIT' }
  ];
  const unique = new Map();
  for (const spec of specs) {
    const current = unique.get(spec.index);
    if (current) current.labels.push(spec.label);
    else unique.set(spec.index, { index: spec.index, labels: [spec.label] });
  }
  return [...unique.values()].sort((a, b) => a.index - b.index).map(spec => {
    const frame = frames[spec.index];
    const currentI = validCells(frame.I, event.id + ' atlas I ' + spec.index);
    const currentE = validCells(frame.E, event.id + ' atlas E ' + spec.index);
    const cells = { E: sorted(currentE), I: sorted(currentI) };
    if (spec.index > 0) {
      const previousI = validCells(frames[spec.index - 1].I, event.id + ' atlas prev I ' + spec.index);
      cells.retained = setIntersection(previousI, currentI);
      cells.stillValidButDropped = setDifference(new Set(setIntersection(previousI, currentE)), currentI);
      cells.noLongerEQualified = setDifference(previousI, currentE);
      cells.newlySelected = setDifference(currentI, previousI);
      assert.equal(cells.retained.length + cells.stillValidButDropped.length + cells.noLongerEQualified.length, previousI.size);
    } else {
      cells.startSelected = sorted(currentI);
    }
    return { event: event.id, anchorIndex: spec.index, timeMs: frame.timeMs, seconds: frame.timeMs / 1000,
      labels: spec.labels, ICells: currentI.size, ECells: currentE.size,
      transitionIndex: spec.index ? spec.index : null,
      categories: cells };
  });
}
function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && !Number.isInteger(value)) return value.toFixed(9);
  return String(value);
}
function makeCsv(events) {
  const columns = [
    'event','transitionIndex','fromSeconds','toSeconds','previousICells','currentECells','currentHCells','currentICells',
    'survivingInCurrentE','environmentalSurvivalRate','genuinelyInvalidated','stillValidButDropped','retainedByProduction',
    'gainedByProduction','droppedByProduction','stillValidDroppedOfDroppedRate','stillValidDroppedOfPreviousIRate',
    'stillValidDroppedOfCurrentERate','droppedInHAndE','droppedInEOnly','droppedInHOnly','droppedInNeither',
    'stillValidDroppedInHAndE','stillValidDroppedInEOnly','droppedOnPreviousPrincipalPath','droppedOffPreviousPrincipalPath',
    'stillValidDroppedOnPreviousPrincipalPath','stillValidDroppedOffPreviousPrincipalPath',
    'gainedOnCurrentPrincipalPath','gainedOffCurrentPrincipalPath','previousWholeIStillInCurrentE',
    'previousWholePrincipalStillInCurrentE'
  ];
  const lines = [columns.join(',')];
  for (const event of events) {
    for (const row of event.transitionRows) {
      const values = [
        event.id,row.transitionIndex,row.fromSeconds,row.toSeconds,row.previousICells,row.currentECells,row.currentHCells,row.currentICells,
        row.survivingInCurrentE,row.environmentalSurvivalRate,row.genuinelyInvalidated,row.stillValidButDropped,row.retainedByProduction,
        row.gainedByProduction,row.droppedByProduction,row.stillValidDroppedOfDroppedRate,row.stillValidDroppedOfPreviousIRate,
        row.stillValidDroppedOfCurrentERate,row.droppedAvailabilityNow.inHAndE,row.droppedAvailabilityNow.inEOnly,
        row.droppedAvailabilityNow.inHOnly,row.droppedAvailabilityNow.inNeither,row.stillValidAvailabilityNow.inHAndE,
        row.stillValidAvailabilityNow.inEOnly,row.droppedOnPreviousPrincipalPath,row.droppedOffPreviousPrincipalPath,
        row.stillValidDroppedOnPreviousPrincipalPath,row.stillValidDroppedOffPreviousPrincipalPath,
        row.gainedOnCurrentPrincipalPath,row.gainedOffCurrentPrincipalPath,row.previousWholeIStillInCurrentE,
        row.previousWholePrincipalStillInCurrentE
      ];
      lines.push(values.map(csvCell).join(','));
    }
  }
  return lines.join('\n') + '\n';
}
function build() {
  const rawFrozen = readFileSync(FROZEN);
  const input = JSON.parse(gunzipSync(rawFrozen).toString('utf8'));
  const parent = readJson(PARENT_ANALYSIS);
  const sourceText = lf(readFileSync(SOURCE, 'utf8'));
  assert.equal(shaText(sourceText), EXPECTED_SOURCE_SHA256, 'current production source SHA-256');
  const sourceBlob = closeInput(input, parent);
  const f = sourceFunctions(sourceText);
  const events = input.events.map((event, i) => analyzeEvent(event, parent.events[i], input.timerFrames, f));
  const structure = input.inputs.find(item => item.path.endsWith('frozen-structures.json.gz'));
  const history = input.inputs.find(item => item.path.endsWith('history-packet.json.gz'));
  const analysis = {
    schema: 'ant-proposal-update-diagnostic-v1',
    authority: { main: EXPECTED_MAIN, researchParent: EXPECTED_PARENT, researchBranch: 'codex/ant-proposal-update-diagnostic-20261029' },
    frozenPacket: {
      path: 'docs/ant/evidence/2026-10-29-event-evolved-scope/data/frozen-event-input.json.gz',
      sha256: sha(rawFrozen),
      byteCount: rawFrozen.length,
      sourcePacketParent: input.parent,
      sourcePacketSchema: input.schema,
      seed: input.seed,
      audio: input.audio,
      inputReceipts: input.inputs,
      structureReceiptVerified: structure.sha256,
      originalHistoryReceipt: history
    },
    source: {
      path: 'src/lib/agents/ant/TrailPlateBirth.js',
      gitBlob: sourceBlob,
      lfCanonicalSha256: shaText(sourceText),
      eventEvolvedSourceSha256: shaText(readFileSync(join(ROOT, 'scripts/ant-event-evolved-scope.js'), 'utf8')),
      productionRelation: 'fresh current proposal is selected from E; prior candidate is compared afterward for continuity. No previous I is passed into selectCandidate.'
    },
    method: {
      savedAnchorsPerEvent: 21,
      transitionsPerEvent: 20,
      environmentSurvival: 'count(I_prev intersect E_current) / count(I_prev)',
      stillValidDropped: '(I_prev intersect E_current) minus I_current',
      ageResolution: 'consecutive one-second saved intervals in E, ending at a still-valid dropped destination; transition occurrences and unique cell coordinates are separate',
      structuralRole: 'previous principalPath membership versus previous I outside principalPath; saved path is descriptive only, not genealogy',
      productionContinuity: 'max(ribbon-mask Jaccard, neighbor-tolerant forward ordered-path similarity) >= 0.6; exact function slices evaluated from production source',
      strictRetention: 'parent-recommended all-or-replace diagnostic; hold complete incumbent I/path/ribbon while all I cells are in current E, otherwise use the actual current proposal',
      excludedClaims: ['E survival does not prove continued selection is correct', 'no causal attribution beyond saved membership maps', 'no tick-level cell age']
    },
    events,
    outputs: OUTPUTS
  };
  const transitionCells = {
    schema: 'ant-proposal-update-transition-cells-v1',
    inputSha256: sha(rawFrozen),
    events: events.map(event => ({ id: event.id,
      transitions: event.transitionCellReceipts.map(row => ({
        transitionIndex: row.transitionIndex, fromTimeMs: row.fromTimeMs, toTimeMs: row.toTimeMs,
        cells: {
          retained: row.retained,
          gained: row.gained,
          dropped: row.dropped,
          genuinelyInvalidated: row.invalidated,
          stillValidButDropped: row.stillValidButDropped
        }
      })),
      ageOccurrences: event.ageOccurrences
    }))
  };
  const atlas = { schema: 'ant-proposal-update-atlas-data-v1', sourceInputSha256: sha(rawFrozen),
    grid: [GRID, GRID], selectionRule: 'START, midpoint, largest lost+gained destination (earliest tie), last pre-COMMIT, COMMIT; chronological order',
    events: events.map(event => ({ id: event.id, startSurvival: event.startSurvival.map(row => ({
      secondsSinceStart: row.secondsSinceStart, survivalRate: row.startProposalSurvivalRate,
      supportedCells: row.startCellsInCurrentE, denominator: row.startICells })), panels: event.atlasPanels })) };
  return {
    'analysis.json': JSON.stringify(analysis, null, 2) + '\n',
    'transition-table.csv': makeCsv(events),
    'transition-cells.json': JSON.stringify(transitionCells, null, 2) + '\n',
    'atlas-data.json': JSON.stringify(atlas, null, 2) + '\n'
  };
}
function selfTest() {
  const f = sourceFunctions(lf(readFileSync(SOURCE, 'utf8')));
  assert.equal(f.maskSimilarity(mask([0]), mask([0])), 1);
  assert.equal(f.maskSimilarity(mask([0]), mask([1])), 0);
  assert.equal(f.pathSimilarity([0, 96], [1, 97]), 1);
  assert.equal(f.pathSimilarity([95], [96]), 0);
  assert.equal(f.pathSimilarity([0], [0, 1]), 0.5);
  assert.equal(componentCount([0, 1, 96, 97], f.neighbors), 1);
  assert.equal(componentCount([95, 96], f.neighbors), 2);
  assert.equal(ageForCell([new Set([1]), new Set([1]), new Set([1])], 2, 1).continuousSavedIntervals, 2);
  assert.deepEqual(availabilityCounts([1, 2, 3, 4], new Set([1, 3]), new Set([1, 2])),
    { inHAndE: 1, inEOnly: 1, inHOnly: 1, inNeither: 1 });
  const mock = [
    { timeMs: 0, I: [0], principalPath: [0], ribbonCells: [0] },
    { timeMs: 1000, I: [0], principalPath: [0], ribbonCells: [0] }
  ];
  assert.equal(compare(mock[0], mock[1], f).maximum, 1);
  const previous = new Set([0, 1, 2]), currentE = new Set([1, 2]), currentI = new Set([2]);
  const invalid = setDifference(previous, currentE);
  const retained = setIntersection(previous, currentI);
  const validDrop = setDifference(new Set(setIntersection(previous, currentE)), currentI);
  assert.equal(invalid.length + retained.length + validDrop.length, 3);
  console.log('PASS: source continuity functions, row-bounded adjacency, survival partition, saved-interval age, and availability categories');
}
const originalRandom = Math.random;
Math.random = () => { throw new Error('No RNG in proposal-update diagnostic'); };
try {
  if (process.argv.includes('--self-test')) selfTest();
  else {
    const check = process.argv.includes('--check');
    const outputs = build();
    for (const [name, text] of Object.entries(outputs)) {
      const file = join(BASE, name);
      if (check) assert.equal(lf(readFileSync(file, 'utf8')), text, 'stale generated artifact: ' + name);
      else writeFileSync(file, text, 'utf8');
    }
    const analysis = JSON.parse(outputs['analysis.json']);
    console.log(JSON.stringify({
      files: Object.keys(outputs),
      events: analysis.events.map(event => ({
        id: event.id, summary: event.summary, strictRetention: {
          held: event.strictRetention.heldTransitions,
          replacements: event.strictRetention.replacementTransitions,
          clockResets: event.strictRetention.clockResets,
          commitStableSeconds: event.strictRetention.commitStableSeconds,
          commitMatureAtOriginalEndpoint: event.strictRetention.commitMatureAtOriginalEndpoint,
          commitIncumbentMatchesActual: event.strictRetention.commitIncumbentMatchesActual
        },
        inspectedTransitions: event.inspectedTransitions
      }))
    }));
  }
} finally {
  Math.random = originalRandom;
}
