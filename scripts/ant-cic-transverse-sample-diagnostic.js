import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { evaluateWide, loadFrozenRows } from './ant-field-writer-reader-failure-attribution.js';

const ROOT = process.cwd();
const PRIOR = 'docs/ant/evidence/2026-10-24-cic-wide-stage-attribution';
const GATE = 'docs/ant/evidence/2026-10-24-ant-cic-writer-qualification';
export const PACKAGE = 'docs/ant/evidence/2026-10-24-cic-transverse-sample-diagnostic';
const MAIN_SHA = '8c60e4bba3bd5b476300e90a2936bfebd1f831c2';
const PREVIOUS_SHA = '05c855cac06dd3659abfc1502e91071980ecc00b';
const QUALIFICATION_SHA = '1fbfec5943c41ad6c8b3828fb48c47828d9be817';
const GATE_ROWS_SHA = '550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f';
const FROZEN_ROWS_SHA = '50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29';
const PREVIOUS_CENSUS_SHA = '384e4ec7982e336db432ea98ea8006934cf6b2276ac145b9a3e84b0ae8645d25';
const PREVIOUS_FOCAL_SHA = 'd15db82408c08819956218c472192e3dffeebe084a081d8720e63b2af696291c';
const EXPECTED_PRODUCTION_HASHES = {
  'src/lib/agents/ant/AntController.js': 'e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04',
  'scripts/ant-field-writer-reader-failure-attribution.js': '72c020cb2abb8dd42a6c56fa277ff9ef4bcbff26c949f45c994c001998779864'
};
const CANDIDATE_OFFSETS = [-0.92, -0.47, 0, 0.47, 0.92];
const SENSOR_OFFSETS = [-1, -0.5, 0, 0.5, 1];
const ARMS = ['A', 'C', 'D'];
const STAGES = ['rawMaximum', 'weightedMaximum', 'hillResponse', 'fieldOnlyScore'];
const ROUTES = ['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve'];
const PHASES = ['p00', 'p10', 'p01', 'p11'];

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const jsonGz = path => JSON.parse(gunzipSync(readFileSync(resolve(ROOT, path))).toString('utf8'));
const stableJson = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const rowKey = row => `${row.shape}|${row.phase}|${String(row.station)}`;
const stage = (arm, id) => arm.stages.find(value => value.id === id);
const sameArray = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const setsEqual = (a, b) => sameArray([...a].sort((x, y) => x - y), [...b].sort((x, y) => x - y));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function argmaxIndices(values) {
  if (!values.length || values.some(value => !Number.isFinite(value))) throw new TypeError('Expected finite non-empty values.');
  const maximum = Math.max(...values);
  return values.flatMap((value, index) => value === maximum ? [index] : []);
}

export function classifyTransition({ targetRawSet, targetWeightedSet, rivalRawSet, rivalWeightedSet, rawLead, weightedLead }) {
  const targetChanged = !setsEqual(targetRawSet, targetWeightedSet);
  const rivalChanged = !setsEqual(rivalRawSet, rivalWeightedSet);
  const exactTie = [targetRawSet, targetWeightedSet, rivalRawSet, rivalWeightedSet].some(set => set.length > 1);
  const targetLost = rawLead > 0 && weightedLead < 0;
  const targetRestored = rawLead < 0 && weightedLead > 0;
  const targetCrossing = targetLost || targetRestored;
  const stableReordering = targetCrossing && !targetChanged && !rivalChanged && !exactTie;
  let type = 'no-candidate-order-crossing';
  if (exactTie || (targetChanged && rivalChanged)) type = 'mixed-or-exact-tie';
  else if (targetChanged) type = 'target-sample-switch';
  else if (rivalChanged) type = 'rival-sample-switch';
  else if (stableReordering) type = 'stable-sample-weighting-reorder';
  return { type, targetChanged, rivalChanged, exactTie, targetLost, targetRestored, targetCrossing, stableReordering };
}

function readBytes(path) { return readFileSync(resolve(ROOT, path)); }

function verifyPriorInputs() {
  const priorManifest = json(`${PRIOR}/manifest.json`);
  for (const [name, record] of Object.entries(priorManifest.files)) {
    const bytes = readBytes(`${PRIOR}/${name}`);
    assert.equal(bytes.length, record.bytes, `prior artifact byte length: ${name}`);
    assert.equal(sha(bytes), record.sha256, `prior artifact SHA: ${name}`);
  }
  const gateRowsBytes = readBytes(`${GATE}/gate2/rows.json.gz`);
  const frozenRowsBytes = readBytes(`${GATE}/inputs/station-raw.json.gz`);
  const censusBytes = readBytes(`${PRIOR}/stage-census.json.gz`);
  const focalBytes = readBytes(`${PRIOR}/focal-rows.json.gz`);
  assert.equal(sha(gateRowsBytes), GATE_ROWS_SHA, 'Gate 2 rows SHA');
  assert.equal(sha(frozenRowsBytes), FROZEN_ROWS_SHA, 'frozen query rows SHA');
  assert.equal(sha(censusBytes), PREVIOUS_CENSUS_SHA, 'prior stage census SHA');
  assert.equal(sha(focalBytes), PREVIOUS_FOCAL_SHA, 'prior focal rows SHA');

  const priorSummary = json(`${PRIOR}/summary.json`);
  const priorValidation = json(`${PRIOR}/validation.json`);
  assert.equal(priorValidation.passed, true);
  assert.equal(priorSummary.startingCommits.originMain, MAIN_SHA);
  assert.equal(priorSummary.startingCommits.qualificationTip, QUALIFICATION_SHA);
  assert.equal(priorSummary.startingCommits.attributionBranchBase, QUALIFICATION_SHA);
  assert.equal(priorSummary.parity.gate2RowsSha256, GATE_ROWS_SHA);
  assert.equal(priorSummary.parity.frozenStationRowsSha256, FROZEN_ROWS_SHA);
  for (const [path, expected] of Object.entries(EXPECTED_PRODUCTION_HASHES)) {
    assert.equal(sha(readBytes(path)), expected, `production/helper source hash: ${path}`);
  }

  const gateRows = JSON.parse(gunzipSync(gateRowsBytes));
  const frozenRows = loadFrozenRows(resolve(ROOT, `${GATE}/inputs/station-raw.json.gz`));
  const census = JSON.parse(gunzipSync(censusBytes));
  const focal = JSON.parse(gunzipSync(focalBytes));
  assert.equal(gateRows.length, 5544);
  assert.equal(frozenRows.length, 5544);
  assert.equal(census.length, 5072);
  assert.equal(priorSummary.global.analyticUniqueRows, 5072);
  assert.equal(priorSummary.global.productionErrors, 2378);
  assert.equal(priorSummary.global.cicErrors, 2378);
  assert.equal(priorSummary.global.recovered, 92);
  assert.equal(priorSummary.global.newErrors, 92);

  const gateByKey = new Map(gateRows.map(row => [rowKey(row), row]));
  const sourceByKey = new Map(frozenRows.map(row => [rowKey(row), row]));
  const censusByKey = new Map(census.map(row => [row.rowKey, row]));
  assert.equal(gateByKey.size, 5544);
  assert.equal(sourceByKey.size, 5544);
  assert.equal(censusByKey.size, 5072);
  assert.equal(focal.length, 184);

  const uniqueGate = gateRows.filter(row => row.uniqueWinner);
  const gateRecovered = uniqueGate.filter(row => row.baseline.winner !== row.referenceWinner
    && row.candidate.winner === row.referenceWinner);
  const gateNew = uniqueGate.filter(row => row.baseline.winner === row.referenceWinner
    && row.candidate.winner !== row.referenceWinner);
  assert.equal(uniqueGate.length, 5072);
  assert.equal(uniqueGate.filter(row => row.baseline.winner !== row.referenceWinner).length, 2378);
  assert.equal(uniqueGate.filter(row => row.candidate.winner !== row.referenceWinner).length, 2378);
  assert.equal(gateRecovered.length, 92);
  assert.equal(gateNew.length, 92);

  const priorRowsByKey = new Map(focal.map(row => [row.key, row]));
  const sourceIndexByKey = new Map(frozenRows.map((row, index) => [rowKey(row), index]));
  assert.equal(priorRowsByKey.size, 184);
  for (const row of focal) {
    const source = sourceByKey.get(row.key);
    const gate = gateByKey.get(row.key);
    const censusRow = censusByKey.get(row.key);
    assert(source && gate && censusRow, `prior row identity: ${row.key}`);
    assert.equal(row.sourceInputIndex, sourceIndexByKey.get(row.key));
    assert.equal(row.sourceGeometrySha256, sha(Buffer.from(JSON.stringify(source.wideGeometry))));
    assert.equal(row.referenceWinner, source.referenceWinner);
    assert.equal(row.referenceWinner, gate.referenceWinner);
    assert.equal(row.outcome, censusRow.outcome);
    assert.equal(row.referenceWinner, censusRow.referenceWinner);
    assert.equal(row.productionWinner, censusRow.productionWinner);
    assert.equal(row.candidateWinner, censusRow.candidateWinner);
  }
  const orderedAllKeys = gateRows.map(rowKey);
  const identityHash = sha(Buffer.from(`${orderedAllKeys.join('\n')}\n`));
  assert.equal(identityHash, priorValidation.rowIdentity.orderedAllRowsSha256);

  const counts = {
    gateRowsBytes: gateRowsBytes.length,
    gateRowsSha256: sha(gateRowsBytes),
    frozenRowsSha256: sha(frozenRowsBytes),
    priorCensusSha256: sha(censusBytes),
    priorFocalSha256: sha(focalBytes),
    rowJoin: { gateRows: gateRows.length, frozenRows: frozenRows.length, strictUnique: uniqueGate.length,
      orderedIdentitySha256: identityHash },
    global: { productionErrors: 2378, cicErrors: 2378, recovered: 92, newErrors: 92 }
  };
  return { priorManifest, priorSummary, priorValidation, gateRows, frozenRows, gateByKey, sourceByKey,
    census, censusByKey, focal, priorRowsByKey, counts };
}

function getCohorts(input) {
  const targetTop = (row, arm, id) => stage(row.arms[arm], id).targetTop;
  const focal = [...input.focal].sort((a, b) => a.sourceInputIndex - b.sourceInputIndex);
  const harmful = focal.filter(row => row.outcome === 'new-error'
    && targetTop(row, 'D', 'rawMaximum')
    && !targetTop(row, 'D', 'weightedMaximum')
    && row.candidateWinner !== row.referenceWinner);
  const weightRestored = focal.filter(row => row.outcome === 'recovered'
    && !targetTop(row, 'D', 'rawMaximum')
    && targetTop(row, 'D', 'weightedMaximum')
    && row.candidateWinner === row.referenceWinner);
  const held = focal.filter(row => row.outcome === 'recovered'
    && targetTop(row, 'D', 'rawMaximum')
    && targetTop(row, 'D', 'weightedMaximum')
    && row.candidateWinner === row.referenceWinner);
  const scoreRestored = focal.filter(row => row.outcome === 'recovered'
    && !targetTop(row, 'D', 'weightedMaximum')
    && row.candidateWinner === row.referenceWinner
    && !weightRestored.includes(row));
  assert.equal(harmful.length, 26, 'primary weighted-max-first new errors');
  assert.equal(weightRestored.length, 14, 'weighted-stage recovered comparator');
  assert.equal(held.length, 68, 'held-target recovered comparator');
  assert.equal(scoreRestored.length, 10, 'score-restored recovered control');
  assert.equal(weightRestored.length + held.length + scoreRestored.length, 92, 'recovered partition');

  const harmfulSet = new Set(harmful.map(row => row.key));
  const priorCensusHarmful = input.census.filter(row => row.outcome === 'new-error'
    && row.arms.D.firstTargetDeparture === 'weightedMaximum'
    && stage(row.arms.D, 'rawMaximum').targetTop
    && !stage(row.arms.D, 'weightedMaximum').targetTop).map(row => row.rowKey);
  assert.deepEqual([...harmfulSet].sort(), priorCensusHarmful.sort(), 'primary cohort rows match full prior census');
  return { harmful, weightRestored, held, scoreRestored };
}

function describeArm(row, armName, source, targetIndex, weightedRivalIndex, finalRivalIndex) {
  const savedArm = row.arms[armName];
  const raw = savedArm.rawSamples;
  const geometry = source.wideGeometry;
  assert.equal(raw.length, 5);
  assert.equal(geometry.length, 5);
  assert.deepEqual(savedArm.candidateOffsets, geometry.map(candidate => candidate.offset));
  const weightedSamples = raw.map((values, candidateIndex) => values.map((value, sampleIndex) => {
    const weight = geometry[candidateIndex].reads[sampleIndex].weight;
    const authoredWeight = 1 - Math.abs(SENSOR_OFFSETS[sampleIndex]) * 0.45;
    assert.equal(weight, authoredWeight, `production weight ${row.key}/${armName}/${candidateIndex}/${sampleIndex}`);
    return value * weight;
  }));
  assert.deepEqual(weightedSamples, savedArm.weightedSamples, `saved weighted reads ${row.key}/${armName}`);

  const candidates = raw.map((values, candidateIndex) => {
    const reads = geometry[candidateIndex].reads;
    const weighted = weightedSamples[candidateIndex];
    return {
      candidateIndex,
      candidateOffset: geometry[candidateIndex].offset,
      candidateHeading: geometry[candidateIndex].heading,
      rawMaximum: Math.max(...values),
      rawArgmaxSampleIndices: argmaxIndices(values),
      weightedMaximum: Math.max(...weighted),
      weightedArgmaxSampleIndices: argmaxIndices(weighted),
      samples: values.map((value, sampleIndex) => ({
        sampleIndex,
        sensorOffset: SENSOR_OFFSETS[sampleIndex],
        query: { x: reads[sampleIndex].x, y: reads[sampleIndex].y },
        weight: reads[sampleIndex].weight,
        raw: value,
        weighted: weighted[sampleIndex]
      }))
    };
  });
  const result = evaluateWide(raw.map((values, candidateIndex) => ({
    offset: geometry[candidateIndex].offset, raw: values
  })), geometry);
  const storedStages = Object.fromEntries(savedArm.stages.map(item => [item.id, item]));
  const computedStages = {
    rawMaximum: { values: result.candidates.map(candidate => candidate.rawMaximum), order: result.rawOrder },
    weightedMaximum: { values: result.candidates.map(candidate => candidate.maximum), order: result.weightedOrder },
    hillResponse: { values: result.candidates.map(candidate => candidate.response), order: result.hillOrder },
    fieldOnlyScore: { values: result.candidates.map(candidate => candidate.score), order: result.scoreOrder }
  };
  for (const id of STAGES) {
    assert.deepEqual(computedStages[id].values, storedStages[id].values, `saved stage values ${row.key}/${armName}/${id}`);
    assert.deepEqual(computedStages[id].order, storedStages[id].order, `saved stage order ${row.key}/${armName}/${id}`);
  }
  const rivalIndex = weightedRivalIndex;
  const targetRival = {
    weightedRivalOffset: geometry[rivalIndex].offset,
    finalRivalOffset: geometry[finalRivalIndex].offset,
    weightedRival: Object.fromEntries(['rawMaximum', 'weightedMaximum', 'hillResponse', 'fieldOnlyScore'].map(id => {
      const values = computedStages[id].values;
      return [id, { target: values[targetIndex], rival: values[rivalIndex], targetMinusRival: values[targetIndex] - values[rivalIndex] }];
    })),
    finalRival: Object.fromEntries(['rawMaximum', 'weightedMaximum', 'hillResponse', 'fieldOnlyScore'].map(id => {
      const values = computedStages[id].values;
      return [id, { target: values[targetIndex], rival: values[finalRivalIndex], targetMinusRival: values[targetIndex] - values[finalRivalIndex] }];
    }))
  };
  return {
    candidates,
    stages: computedStages,
    targetRival,
    confidence: result.confidence,
    finalWinnerOffset: geometry[result.scoreOrder[0]].offset
  };
}

function transitionFor(row, describedD, targetIndex, weightedRivalIndex) {
  const target = describedD.candidates[targetIndex];
  const rival = describedD.candidates[weightedRivalIndex];
  const rawLead = target.rawMaximum - rival.rawMaximum;
  const weightedLead = target.weightedMaximum - rival.weightedMaximum;
  const transition = classifyTransition({
    targetRawSet: target.rawArgmaxSampleIndices,
    targetWeightedSet: target.weightedArgmaxSampleIndices,
    rivalRawSet: rival.rawArgmaxSampleIndices,
    rivalWeightedSet: rival.weightedArgmaxSampleIndices,
    rawLead,
    weightedLead
  });
  return {
    ...transition,
    targetOffset: row.referenceWinner,
    weightedRivalOffset: rival.candidateOffset,
    finalRivalOffset: describedD.finalWinnerOffset,
    rawTargetMinusWeightedRival: rawLead,
    weightedTargetMinusWeightedRival: weightedLead,
    targetRawSamples: target.rawArgmaxSampleIndices,
    targetWeightedSamples: target.weightedArgmaxSampleIndices,
    rivalRawSamples: rival.rawArgmaxSampleIndices,
    rivalWeightedSamples: rival.weightedArgmaxSampleIndices
  };
}

function describeRow(row, input, cohort) {
  const source = input.sourceByKey.get(row.key);
  const gate = input.gateByKey.get(row.key);
  const targetIndex = source.wideGeometry.findIndex(candidate => candidate.offset === row.referenceWinner);
  assert(targetIndex >= 0, `analytic target candidate ${row.key}`);
  for (const armName of ARMS) {
    const expectedRaw = armName === 'A' ? source.wideReference.map(candidate => candidate.raw)
      : armName === 'C' ? source.wideProduction.map(candidate => candidate.raw)
        : gate.candidate.rawWide;
    assert.deepEqual(row.arms[armName].rawSamples, expectedRaw, `focal raw samples ${row.key}/${armName}`);
  }
  assert.deepEqual(row.arms.A.rawSamples, gate.referenceRawWide, `Gate A raw samples ${row.key}`);
  assert.deepEqual(row.arms.C.rawSamples, gate.baseline.rawWide, `Gate C raw samples ${row.key}`);
  assert.deepEqual(row.arms.D.rawSamples, gate.candidate.rawWide, `Gate D raw samples ${row.key}`);

  const dReplayed = evaluateWide(row.arms.D.rawSamples.map((raw, index) => ({
    offset: source.wideGeometry[index].offset, raw
  })), source.wideGeometry);
  assert.equal(dReplayed.candidates[dReplayed.scoreOrder[0]].offset, row.candidateWinner, `Gate 2 final D winner ${row.key}`);
  const rawTopIndex = dReplayed.rawOrder[0];
  const weightedTopIndex = dReplayed.weightedOrder[0];
  const finalTopIndex = dReplayed.scoreOrder[0];
  const weightedRivalIndex = weightedTopIndex !== targetIndex ? weightedTopIndex
    : rawTopIndex !== targetIndex ? rawTopIndex : dReplayed.weightedOrder.find(index => index !== targetIndex);
  const finalRivalIndex = finalTopIndex !== targetIndex ? finalTopIndex : dReplayed.scoreOrder.find(index => index !== targetIndex);

  const arms = Object.fromEntries(ARMS.map(armName => [armName,
    describeArm(row, armName, source, targetIndex, weightedRivalIndex, finalRivalIndex)]));
  const transition = transitionFor(row, arms.D, targetIndex, weightedRivalIndex);
  if (cohort === 'harmful') assert(transition.targetLost, `primary target loss ${row.key}`);
  if (cohort === 'weight-restored') assert(transition.targetRestored, `weighted comparator restoration ${row.key}`);
  if (cohort === 'held') assert(!transition.targetCrossing, `held comparator has no raw-weighted crossing ${row.key}`);
  const targetMargins = Object.fromEntries(ARMS.map(armName => [armName, {
    raw: arms[armName].stages.rawMaximum.values[targetIndex] - arms[armName].stages.rawMaximum.values[weightedRivalIndex],
    weighted: arms[armName].stages.weightedMaximum.values[targetIndex] - arms[armName].stages.weightedMaximum.values[weightedRivalIndex]
  }]));
  return {
    rowKey: row.key,
    sourceInputIndex: row.sourceInputIndex,
    shape: row.shape,
    phase: row.phase,
    station: row.station,
    analyticTargetOffset: row.referenceWinner,
    productionFinalOffset: row.productionWinner,
    cicFinalOffset: row.candidateWinner,
    cohort,
    analyticWinnerMargin: row.referenceScoreMargin,
    targetIndex,
    weightedRivalIndex,
    weightedRivalOffset: source.wideGeometry[weightedRivalIndex].offset,
    finalRivalIndex,
    finalRivalOffset: source.wideGeometry[finalRivalIndex].offset,
    targetVersusWeightedRivalMargins: targetMargins,
    transition,
    arms
  };
}

function countBy(items, keyFn, order = []) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const keys = [...new Set([...order, ...counts.keys()])];
  return Object.fromEntries(keys.filter(key => counts.has(key)).map(key => [key, counts.get(key)]));
}

function cohortStrata(rows, descriptions) {
  const byKey = new Map(descriptions.map(row => [row.rowKey, row]));
  const full = rows.map(row => byKey.get(row.key));
  return {
    count: full.length,
    byRoute: countBy(full, row => row.shape, ROUTES),
    byPhase: countBy(full, row => row.phase, PHASES),
    byRoutePhase: countBy(full, row => `${row.shape}|${row.phase}`,
      ROUTES.flatMap(route => PHASES.map(phase => `${route}|${phase}`)))
  };
}

function meanFor(values) { return values.length ? mean(values) : null; }

function profileDelta(rows, role) {
  return SENSOR_OFFSETS.map((sensorOffset, sampleIndex) => {
    const records = rows.map(row => {
      const candidateIndex = role === 'target' ? row.targetIndex : row.weightedRivalIndex;
      return {
        weight: row.arms.D.candidates[candidateIndex].samples[sampleIndex].weight,
        A: row.arms.A.candidates[candidateIndex].samples[sampleIndex],
        C: row.arms.C.candidates[candidateIndex].samples[sampleIndex],
        D: row.arms.D.candidates[candidateIndex].samples[sampleIndex]
      };
    });
    const rawDelta = records.map(record => record.D.raw - record.C.raw);
    const weightedDelta = records.map(record => record.D.weighted - record.C.weighted);
    return {
      sampleIndex, sensorOffset, weight: records[0]?.weight ?? (1 - Math.abs(sensorOffset) * 0.45),
      rawMean: Object.fromEntries(ARMS.map(arm => [arm, meanFor(records.map(record => record[arm].raw))])),
      weightedMean: Object.fromEntries(ARMS.map(arm => [arm, meanFor(records.map(record => record[arm].weighted))])),
      rawDMinusC: { mean: meanFor(rawDelta), greater: rawDelta.filter(value => value > 0).length,
        equal: rawDelta.filter(value => value === 0).length, lower: rawDelta.filter(value => value < 0).length },
      weightedDMinusC: { mean: meanFor(weightedDelta), greater: weightedDelta.filter(value => value > 0).length,
        equal: weightedDelta.filter(value => value === 0).length, lower: weightedDelta.filter(value => value < 0).length }
    };
  });
}

function contributorCounts(rows, armName, role) {
  const result = {};
  for (const stageId of ['rawMaximum', 'weightedMaximum']) {
    const buckets = SENSOR_OFFSETS.map((sensorOffset, sampleIndex) => ({ sensorOffset, sampleIndex, count: 0 }));
    let tiedRows = 0;
    for (const row of rows) {
      const candidateIndex = role === 'target' ? row.targetIndex : row.weightedRivalIndex;
      const candidate = row.arms[armName].candidates[candidateIndex];
      const indices = stageId === 'rawMaximum' ? candidate.rawArgmaxSampleIndices : candidate.weightedArgmaxSampleIndices;
      if (indices.length > 1) tiedRows += 1;
      for (const index of indices) buckets[index].count += 1;
    }
    result[stageId] = { buckets, rowsWithExactSampleTies: tiedRows };
  }
  return result;
}

function transitionSummary(primaryRows) {
  const types = ['target-sample-switch', 'rival-sample-switch', 'stable-sample-weighting-reorder', 'mixed-or-exact-tie', 'no-candidate-order-crossing'];
  return {
    exclusiveTypeCounts: countBy(primaryRows, row => row.transition.type, types),
    targetSampleSetChanged: primaryRows.filter(row => row.transition.targetChanged).length,
    rivalSampleSetChanged: primaryRows.filter(row => row.transition.rivalChanged).length,
    targetAndRivalChanged: primaryRows.filter(row => row.transition.targetChanged && row.transition.rivalChanged).length,
    neitherChanged: primaryRows.filter(row => !row.transition.targetChanged && !row.transition.rivalChanged).length,
    exactMaxSampleTieRows: primaryRows.filter(row => row.transition.exactTie).length,
    rawToWeightedTargetLeadCrossing: primaryRows.filter(row => row.transition.targetCrossing).length,
    rawToWeightedTargetLosses: primaryRows.filter(row => row.transition.targetLost).length,
    rawToWeightedTargetRestorations: primaryRows.filter(row => row.transition.targetRestored).length
  };
}

function representativeRows(primary, weightRestored, scoreRestored, held) {
  const selected = [];
  const seen = new Set();
  const choose = (rows, rule) => {
    const item = rows[0];
    if (item && !seen.has(item.rowKey)) {
      selected.push({ selectionRule: rule, ...item });
      seen.add(item.rowKey);
    }
  };
  const primaryTypes = [...new Set(primary.map(row => row.transition.type))].sort();
  for (const type of primaryTypes) choose(primary.filter(row => row.transition.type === type), `first source-order row in primary transition class ${type}`);
  choose(weightRestored, 'first source-order row in all D weighted-stage restorations');
  choose(scoreRestored, 'first source-order row in all D score-stage restorations');
  choose(held, 'first source-order row in all D held-target recoveries');
  return selected;
}

function outputFiles() {
  const input = verifyPriorInputs();
  const cohorts = getCohorts(input);
  const descriptionGroups = [
    ['harmful', cohorts.harmful],
    ['weight-restored', cohorts.weightRestored],
    ['held', cohorts.held],
    ['score-restored', cohorts.scoreRestored]
  ];
  const descriptions = descriptionGroups.flatMap(([cohortName, rows]) => rows.map(row => describeRow(row, input, cohortName)));
  const byKey = new Map(descriptions.map(row => [row.rowKey, row]));
  assert.equal(byKey.size, descriptions.length);
  const primary = cohorts.harmful.map(row => byKey.get(row.key));
  const weightRestored = cohorts.weightRestored.map(row => byKey.get(row.key));
  const held = cohorts.held.map(row => byKey.get(row.key));
  const scoreRestored = cohorts.scoreRestored.map(row => byKey.get(row.key));
  const allRecoveredDescriptions = [...weightRestored, ...held, ...scoreRestored].sort((a, b) => a.sourceInputIndex - b.sourceInputIndex);
  assert.equal(allRecoveredDescriptions.length, 92, 'all recovered comparator rows retained');

  const primaryKeys = primary.map(row => row.rowKey).sort();
  const recoveredKeys = allRecoveredDescriptions.map(row => row.rowKey).sort();
  const hashKeys = keys => sha(Buffer.from(`${keys.join('\n')}\n`));
  const transition = transitionSummary(primary);
  const routePhase = {
    harmful: cohortStrata(cohorts.harmful, primary),
    weightRestored: cohortStrata(cohorts.weightRestored, weightRestored),
    held: cohortStrata(cohorts.held, held),
    scoreRestored: cohortStrata(cohorts.scoreRestored, scoreRestored)
  };
  const contributorFrequencies = Object.fromEntries(ARMS.map(arm => [arm, {
    target: contributorCounts(primary, arm, 'target'),
    weightedRival: contributorCounts(primary, arm, 'weightedRival')
  }]));
  const profileComparison = {
    primaryTargetCandidate: profileDelta(primary, 'target'),
    primaryWeightedRivalCandidate: profileDelta(primary, 'weightedRival')
  };
  const recoveredTransitions = {
    weightRestored: transitionSummary(weightRestored),
    held: transitionSummary(held),
    scoreRestored: transitionSummary(scoreRestored)
  };
  const examples = representativeRows(primary, weightRestored, scoreRestored, held);

  const sampleValueComparisons = descriptions.reduce((sum, row) => sum + ARMS.length * CANDIDATE_OFFSETS.length * SENSOR_OFFSETS.length, 0);
  assert.equal(sampleValueComparisons, 118 * 3 * 5 * 5);
  const summary = {
    schema: 'ant-cic-transverse-sample-diagnostic/v1',
    baseline: { main: MAIN_SHA, previousAttributionCommit: PREVIOUS_SHA, qualificationCommit: QUALIFICATION_SHA },
    inputs: {
      priorGate2RowsSha256: input.counts.gateRowsSha256,
      frozenStationRowsSha256: input.counts.frozenRowsSha256,
      previousStageCensusSha256: input.counts.priorCensusSha256,
      previousFocalRowsSha256: input.counts.priorFocalSha256,
      rowJoin: input.counts.rowJoin,
      previousGlobalCounts: input.counts.global
    },
    cohorts: {
      primary: { count: primary.length, sortedKeysSha256: hashKeys(primaryKeys), ...routePhase.harmful },
      recoveredWeightRestored: { count: weightRestored.length, sortedKeysSha256: hashKeys(weightRestored.map(row => row.rowKey).sort()), ...routePhase.weightRestored },
      recoveredHeld: { count: held.length, sortedKeysSha256: hashKeys(held.map(row => row.rowKey).sort()), ...routePhase.held },
      recoveredScoreRestored: { count: scoreRestored.length, sortedKeysSha256: hashKeys(scoreRestored.map(row => row.rowKey).sort()), ...routePhase.scoreRestored },
      allRecovered: { count: allRecoveredDescriptions.length, sortedKeysSha256: hashKeys(recoveredKeys) }
    },
    productionSampling: {
      candidateOffsets: CANDIDATE_OFFSETS,
      transverseSampleOffsets: SENSOR_OFFSETS,
      weights: SENSOR_OFFSETS.map(offset => 1 - Math.abs(offset) * 0.45),
      weightingFormula: 'weighted[s] = raw[s] × (1 − abs(SENSOR_OFFSETS[s]) × 0.45)',
      weightedMax: 'maximum of the five weighted values per candidate, matching AntController.senseTrail()',
      rawMaximumScope: 'diagnostic only; not a production choice'
    },
    transition: {
      classification: transition,
      recoveredCohorts: recoveredTransitions,
      byRoute: Object.fromEntries(ROUTES.map(route => [route, countBy(primary.filter(row => row.shape === route), row => row.transition.type)])),
      byPhase: Object.fromEntries(PHASES.map(phase => [phase, countBy(primary.filter(row => row.phase === phase), row => row.transition.type)])),
      byRoutePhase: Object.fromEntries(ROUTES.flatMap(route => PHASES.map(phase => {
        const rows = primary.filter(row => row.shape === route && row.phase === phase);
        return [`${route}|${phase}`, { count: rows.length, types: countBy(rows, row => row.transition.type) }];
      })))
    },
    maxContributors: contributorFrequencies,
    cicVsProductionProfile: {
      primaryHarmful: profileComparison,
      recoveredWeightRestored: { target: profileDelta(weightRestored, 'target'), rival: profileDelta(weightRestored, 'weightedRival') },
      recoveredHeld: { target: profileDelta(held, 'target'), rival: profileDelta(held, 'weightedRival') },
      recoveredScoreRestored: { target: profileDelta(scoreRestored, 'target'), rival: profileDelta(scoreRestored, 'weightedRival') }
    },
    savedRowValidation: {
      priorFocalRows: input.focal.length,
      analyzedFocalRows: descriptions.length,
      exactRawSampleValuesCompared: sampleValueComparisons,
      exactWeightedSampleValuesCompared: sampleValueComparisons,
      exactGeometryReadRecordsCompared: descriptions.length * CANDIDATE_OFFSETS.length * SENSOR_OFFSETS.length,
      helperStageOutputsRecomputedPerArm: descriptions.length * ARMS.length * STAGES.length
    },
    interpretationBoundary: 'Saved-data decomposition only. It locates the first target departure in existing stages; it does not isolate independent causal contributions of CIC representation, query geometry, weighting, or max.'
  };
  const validation = {
    passed: true,
    checks: [
      'fresh origin/main and previous commit provenance pinned',
      'Gate 2 rows, frozen station inputs, prior census, and prior focal artifact byte hashes match receipts',
      '5,544 row identity join, 5,072 strict-unique denominator, C/D 2,378 mismatches, 92 recoveries, 92 new errors',
      'all 26 primary keys match the full prior census target-departure rule',
      'all 118 analyzed primary/recovered A/C/D raw and weighted sample vectors match frozen geometry and source outputs exactly',
      'production AntController source and existing attribution helper hashes match pinned values',
      'saved helper raw/weighted/Hill/score values and candidate orders recompute exactly',
      'recovered 14 weighted-restored, 68 held, and 10 score-restored cohorts partition all 92 recovery rows'
    ],
    counts: input.counts,
    focalMembership: {
      primaryCount: primary.length,
      primarySortedKeysSha256: hashKeys(primaryKeys),
      allRecoveredCount: allRecoveredDescriptions.length,
      allRecoveredSortedKeysSha256: hashKeys(recoveredKeys),
      recoveredPartition: { weightRestored: weightRestored.length, held: held.length, scoreRestored: scoreRestored.length }
    }
  };
  const rowArtifact = {
    schema: 'ant-cic-transverse-sample-rows/v1',
    armDefinitions: { A: 'saved analytic-reference raw queries', C: 'saved production raw queries', D: 'saved CIC raw queries' },
    sampleIdentity: 'within each candidate, five stored read slots use AntController SENSOR_OFFSETS order; exact physical x/y come from frozen wideGeometry',
    rows: [...primary, ...allRecoveredDescriptions].sort((a, b) => a.sourceInputIndex - b.sourceInputIndex)
  };
  return new Map([
    ['summary.json', stableJson(summary)],
    ['validation.json', stableJson(validation)],
    ['transition-census.json', stableJson({ schema: 'ant-cic-transverse-transition-census/v1', transition, routePhase, contributorFrequencies })],
    ['row-decomposition.json.gz', gzipSync(Buffer.from(`${JSON.stringify(rowArtifact)}\n`), { level: 9, mtime: 0 })],
    ['representative-traces.json', stableJson({ selection: 'first input-order row for each observed primary transition type, then first row for each recovered comparator class', rows: examples })]
  ]);
}

function writeBytes(path, bytes) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
}

export function generateDiagnostic(outputDir = PACKAGE) {
  const files = outputFiles();
  const fileRecords = Object.fromEntries([...files].map(([name, bytes]) => [name, { bytes: bytes.length, sha256: sha(bytes) }]));
  const manifest = {
    schema: 'ant-cic-transverse-sample-diagnostic-manifest/v1',
    analysisSourceSha256: sha(readBytes('scripts/ant-cic-transverse-sample-diagnostic.js')),
    preregistrationSha256: sha(readBytes(`${PACKAGE}/PREREGISTRATION.md`)),
    previousManifestSha256: sha(readBytes(`${PRIOR}/manifest.json`)),
    files: fileRecords
  };
  files.set('manifest.json', stableJson(manifest));
  for (const [name, bytes] of files) writeBytes(resolve(ROOT, outputDir, name), bytes);
  return files;
}

export function runDeterministicDiagnostic(outputDir = PACKAGE) {
  const tempDir = mkdtempSync(resolve(tmpdir(), 'ant-cic-transverse-repeat-'));
  try {
    const primaryFiles = generateDiagnostic(outputDir);
    const repeatFiles = generateDiagnostic(tempDir);
    assert.deepEqual([...primaryFiles.keys()], [...repeatFiles.keys()]);
    for (const [name, bytes] of primaryFiles) assert.deepEqual(bytes, repeatFiles.get(name), `repeat artifact ${name}`);
    const receipt = {
      schema: 'ant-cic-transverse-sample-repeat-receipt/v1',
      identical: true,
      filesCompared: [...primaryFiles].map(([file, bytes]) => ({ file, bytes: bytes.length, sha256: sha(bytes) })),
      inputHashes: {
        gate2Rows: GATE_ROWS_SHA,
        frozenStationRows: FROZEN_ROWS_SHA,
        previousCensus: PREVIOUS_CENSUS_SHA,
        previousFocalRows: PREVIOUS_FOCAL_SHA
      },
      analysisSourceSha256: sha(readBytes('scripts/ant-cic-transverse-sample-diagnostic.js'))
    };
    writeBytes(resolve(ROOT, outputDir, 'determinism.json'), stableJson(receipt));
    return { files: primaryFiles, receipt };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/ant-cic-transverse-sample-diagnostic.js')) {
  const result = runDeterministicDiagnostic();
  process.stdout.write(`${JSON.stringify({ summary: JSON.parse(result.files.get('summary.json')), receipt: result.receipt }, null, 2)}\n`);
}
