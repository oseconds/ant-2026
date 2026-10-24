import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { evaluateWide, loadFrozenRows, INPUT_SHA256, SOURCE_HASHES } from './ant-field-writer-reader-failure-attribution.js';

export const PACKAGE = 'docs/ant/evidence/2026-10-24-cic-wide-stage-attribution';
export const GATE_PACKAGE = 'docs/ant/evidence/2026-10-24-ant-cic-writer-qualification';
export const MAIN_SHA = '8c60e4bba3bd5b476300e90a2936bfebd1f831c2';
export const QUALIFICATION_SHA = '1fbfec5943c41ad6c8b3828fb48c47828d9be817';
export const GATE2_ROWS_SHA256 = '550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f';
export const OFFSETS = Object.freeze([-0.92, -0.47, 0, 0.47, 0.92]);
export const STAGES = Object.freeze([
  { id: 'rawMaximum', order: 'rawOrder', value: 'rawMaximum' },
  { id: 'weightedMaximum', order: 'weightedOrder', value: 'maximum' },
  { id: 'hillResponse', order: 'hillOrder', value: 'response' },
  { id: 'fieldOnlyScore', order: 'scoreOrder', value: 'score' }
]);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT_SHA = INPUT_SHA256;
const EXPECTED = Object.freeze({ rows: 5544, unique: 5072, baselineErrors: 2378, candidateErrors: 2378, recovered: 92, newErrors: 92 });
const STAGE_IDS = STAGES.map(stage => stage.id);
const ROUTES = Object.freeze(['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve']);
const PHASES = Object.freeze(['p00', 'p10', 'p01', 'p11']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const sign = value => Math.abs(value) <= 64 * Number.EPSILON * Math.max(1, Math.abs(value)) ? 0 : Math.sign(value);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function rowKey(row) {
  return `${row.shape}|${row.phase}|${row.station}`;
}

export function classifyOutcome(referenceWinner, productionWinner, candidateWinner) {
  const productionWrong = productionWinner !== referenceWinner;
  const candidateWrong = candidateWinner !== referenceWinner;
  if (productionWrong && !candidateWrong) return 'recovered';
  if (!productionWrong && candidateWrong) return 'new-error';
  if (productionWrong) return 'both-wrong';
  return 'both-correct';
}

export function stageTrace(wide, referenceWinner) {
  return STAGES.map(stage => {
    const order = [...wide[stage.order]];
    const values = wide.candidates.map(candidate => candidate[stage.value]);
    const top = order[0], second = order[1];
    const targetIndex = OFFSETS.indexOf(referenceWinner);
    assert(targetIndex >= 0, `Unknown analytic winner offset: ${referenceWinner}`);
    return {
      id: stage.id,
      order,
      topIndex: top,
      topOffset: OFFSETS[top],
      topValue: values[top],
      secondValue: values[second],
      margin: values[top] - values[second],
      exactTopTie: values[top] === values[second],
      targetTop: top === targetIndex,
      targetLead: values[targetIndex] - Math.max(...values.filter((_, index) => index !== targetIndex)),
      values
    };
  });
}

export function firstRankDivergence(referenceTrace, armTrace) {
  return STAGES.find(stage => !sameArray(
    referenceTrace.find(item => item.id === stage.id).order,
    armTrace.find(item => item.id === stage.id).order
  ))?.id || null;
}

export function firstTargetDeparture(trace) {
  return trace.find(stage => !stage.targetTop)?.id || null;
}

function sameArray(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameNested(a, b, path) {
  assert(Array.isArray(a) && Array.isArray(b) && a.length === b.length, `${path}: array shape mismatch`);
  for (let index = 0; index < a.length; index += 1) {
    if (Array.isArray(a[index])) sameNested(a[index], b[index], `${path}[${index}]`);
    else assert(a[index] === b[index], `${path}[${index}] numeric mismatch: ${a[index]} !== ${b[index]}`);
  }
}

function assertWideParity(actual, saved, label) {
  for (const key of ['rawOrder', 'weightedOrder', 'hillOrder', 'scoreOrder']) {
    assert.deepEqual(actual[key], saved[key], `${label}.${key}`);
  }
  assert(actual.confidence === saved.confidence, `${label}.confidence`);
  assert.equal(actual.candidates.length, saved.candidates.length, `${label}.candidates`);
  const scalarKeys = ['offset', 'rawMaximum', 'maximum', 'response', 'trailScore', 'directionalPenalty', 'score'];
  for (let index = 0; index < actual.candidates.length; index += 1) {
    const computed = actual.candidates[index], stored = saved.candidates[index];
    for (const key of scalarKeys) assert(computed[key] === stored[key], `${label}.candidates[${index}].${key}`);
    sameNested(computed.raw, stored.raw, `${label}.candidates[${index}].raw`);
    sameNested(computed.weighted, stored.weighted, `${label}.candidates[${index}].weighted`);
  }
}

function assertReferenceParity(actual, sourceRow, gateRow) {
  assert.equal(actual.scoreOrder[0], OFFSETS.indexOf(sourceRow.referenceWinner), `${rowKey(gateRow)} analytic winner`);
  const margin = actual.candidates[actual.scoreOrder[0]].score - actual.candidates[actual.scoreOrder[1]].score;
  assert(margin === sourceRow.referenceWinnerMargin, `${rowKey(gateRow)} analytic margin`);
  assert.equal(sourceRow.wideReference.length, actual.candidates.length);
  for (let index = 0; index < actual.candidates.length; index += 1) {
    const computed = actual.candidates[index], saved = sourceRow.wideReference[index];
    assert.equal(computed.offset, saved.offset, `${rowKey(gateRow)} A offset`);
    for (const key of ['raw', 'weighted']) sameNested(computed[key], saved[key], `${rowKey(gateRow)} A ${key}[${index}]`);
    for (const key of ['maximum', 'response', 'score']) {
      assert(computed[key] === saved[key], `${rowKey(gateRow)} A ${key}[${index}]`);
    }
  }
  assert.equal(gateRow.referenceWinner, sourceRow.referenceWinner, `${rowKey(gateRow)} A winner identity`);
  assert.equal(gateRow.uniqueWinner, sourceRow.referenceWinnerUnique, `${rowKey(gateRow)} A unique flag`);
  assert(gateRow.referenceWinnerMargin === sourceRow.referenceWinnerMargin, `${rowKey(gateRow)} A saved margin`);
}

function rankDistance(a, b) {
  const positionsA = [], positionsB = [];
  a.forEach((index, rank) => { positionsA[index] = rank; });
  b.forEach((index, rank) => { positionsB[index] = rank; });
  let inversions = 0;
  for (let first = 0; first < a.length; first += 1) {
    for (let second = first + 1; second < a.length; second += 1) {
      if ((positionsA[first] - positionsA[second]) * (positionsB[first] - positionsB[second]) < 0) inversions += 1;
    }
  }
  return inversions;
}

function armStages(wide, analyticTrace, targetOffset) {
  const trace = stageTrace(wide, targetOffset);
  return {
    trace,
    firstRankDivergenceFromA: wide === null ? null : firstRankDivergence(analyticTrace, trace),
    firstTargetDeparture: firstTargetDeparture(trace),
    stages: trace.map((stage, index) => ({
      ...stage,
      orderMatchesA: sameArray(stage.order, analyticTrace[index].order),
      kendallInversionsFromA: rankDistance(analyticTrace[index].order, stage.order),
      changedFromPrevious: index > 0 && !sameArray(trace[index - 1].order, stage.order)
    }))
  };
}

function wideFrom(rawWide, geometry) {
  assert.equal(rawWide.length, OFFSETS.length);
  return evaluateWide(rawWide.map((raw, index) => ({ offset: geometry[index].offset, raw })), geometry);
}

function errorMargin(wide) {
  const order = wide.scoreOrder;
  return wide.candidates[order[0]].score - wide.candidates[order[1]].score;
}

function distribution(values) {
  if (!values.length) return { count: 0, mean: null, min: null, p50: null, p90: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = q => sorted[Math.round(q * (sorted.length - 1))];
  return { count: values.length, mean: mean(values), min: at(0), p50: at(0.5), p90: at(0.9), max: at(1) };
}

function countBy(items, getKey, keys = []) {
  const counts = Object.fromEntries(keys.map(key => [key, 0]));
  for (const item of items) {
    const key = getKey(item) ?? 'none';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function intersectionOrderStage(rows, leftArm, rightArm) {
  return rows.map(row => ({ ...row,
    stage: STAGE_IDS.find(id => !sameArray(
      row.arms[leftArm].stages.find(stage => stage.id === id).order,
      row.arms[rightArm].stages.find(stage => stage.id === id).order
    )) || null
  }));
}

function summarizeCohort(rows, affectedArm) {
  const arms = Object.fromEntries(['C', 'D'].map(arm => [arm, {
    firstRankDivergenceFromA: countBy(rows, row => row.arms[arm].firstRankDivergenceFromA, [...STAGE_IDS, 'none']),
    firstTargetDeparture: countBy(rows, row => row.arms[arm].firstTargetDeparture, [...STAGE_IDS, 'none']),
    targetStatusSequences: countBy(rows,
      row => row.arms[arm].stages.map(stage => stage.targetTop ? '1' : '0').join('')),
    targetTransitions: Object.fromEntries(STAGE_IDS.slice(1).map((stageId, index) => {
      const previousId = STAGE_IDS[index];
      const transitions = rows.map(row => {
        const before = row.arms[arm].stages.find(stage => stage.id === previousId).targetTop;
        const after = row.arms[arm].stages.find(stage => stage.id === stageId).targetTop;
        return `${before ? 'target' : 'other'}→${after ? 'target' : 'other'}`;
      });
      return [`${previousId}→${stageId}`, countBy(transitions, value => value,
        ['target→target', 'target→other', 'other→target', 'other→other'])];
    }))
  }]));
  return {
    count: rows.length,
    affectedArm,
    firstRankDivergenceFromA: countBy(rows, row => row.arms[affectedArm].firstRankDivergenceFromA, [...STAGE_IDS, 'none']),
    firstTargetDeparture: countBy(rows, row => row.arms[affectedArm].firstTargetDeparture, [...STAGE_IDS, 'none']),
    arms,
    firstCvsDDivergence: countBy(intersectionOrderStage(rows, 'C', 'D'), row => row.stage, [...STAGE_IDS, 'none']),
    analyticScoreMargin: distribution(rows.map(row => row.referenceScoreMargin))
  };
}

function summarizeGroup(allRows, uniqueRows, recovered, newErrors, predicate) {
  const all = allRows.filter(predicate), unique = uniqueRows.filter(predicate);
  const rec = recovered.filter(predicate), newer = newErrors.filter(predicate);
  return {
    allRows: all.length,
    strictUniqueRows: unique.length,
    productionErrors: unique.filter(row => row.productionWrong).length,
    cicErrors: unique.filter(row => row.candidateWrong).length,
    recovered: rec.length,
    newErrors: newer.length,
    netErrorChange: newer.length - rec.length,
    recoveredStages: summarizeCohort(rec, 'C'),
    newErrorStages: summarizeCohort(newer, 'D')
  };
}

function compactArm(result, analyticTrace, targetOffset) {
  const summary = armStages(result, analyticTrace, targetOffset);
  return {
    firstRankDivergenceFromA: summary.firstRankDivergenceFromA,
    firstTargetDeparture: summary.firstTargetDeparture,
    stages: summary.stages.map(stage => ({
      id: stage.id, values: stage.values, order: stage.order,
      topOffset: stage.topOffset, margin: stage.margin, exactTopTie: stage.exactTopTie,
      targetTop: stage.targetTop, targetLead: stage.targetLead,
      orderMatchesA: stage.orderMatchesA, kendallInversionsFromA: stage.kendallInversionsFromA,
      changedFromPrevious: stage.changedFromPrevious
    }))
  };
}

function fullFocalArm(result, analyticTrace, targetOffset) {
  const summary = compactArm(result, analyticTrace, targetOffset);
  return {
    ...summary,
    confidence: result.confidence,
    rawSamples: result.candidates.map(candidate => [...candidate.raw]),
    weightedSamples: result.candidates.map(candidate => [...candidate.weighted]),
    candidateOffsets: result.candidates.map(candidate => candidate.offset)
  };
}

function validateAndAnalyze() {
  const gateRowsPath = `${GATE_PACKAGE}/gate2/rows.json.gz`;
  const inputRowsPath = `${GATE_PACKAGE}/inputs/station-raw.json.gz`;
  const resultPath = `${GATE_PACKAGE}/RESULTS.json`;
  const gateBytes = readFileSync(resolve(ROOT, gateRowsPath));
  const inputBytes = readFileSync(resolve(ROOT, inputRowsPath));
  const results = json(resultPath);
  assert.equal(sha(gateBytes), GATE2_ROWS_SHA256, 'saved Gate 2 rows SHA');
  assert.equal(sha(inputBytes), INPUT_SHA, 'frozen station input SHA');
  assert.equal(results.rowArtifact.sha256, GATE2_ROWS_SHA256, 'RESULTS.json Gate 2 SHA');
  assert.equal(results.rowArtifact.bytes, gateBytes.length, 'Gate 2 byte length');
  assert.equal(results.rowArtifact.rows, EXPECTED.rows, 'Gate 2 saved row count');

  const gateRows = JSON.parse(gunzipSync(gateBytes));
  const sourceRows = loadFrozenRows(resolve(ROOT, inputRowsPath));
  assert.equal(gateRows.length, EXPECTED.rows);
  assert.equal(sourceRows.length, EXPECTED.rows);

  const liveProductionHashes = Object.fromEntries(Object.entries(SOURCE_HASHES).map(([path, expected]) => {
    const actual = sha(readFileSync(resolve(ROOT, path)));
    assert.equal(actual, expected, `production source hash: ${path}`);
    return [path, actual];
  }));
  const implementationPaths = [
    'scripts/ant-field-writer-reader-failure-attribution.js',
    'scripts/ant-cic-writer-qualification.js',
    'scripts/ant-cic-writer.js',
    'src/lib/agents/ant/AntController.js'
  ];
  const implementationHashes = Object.fromEntries(implementationPaths.map(path => [
    path, sha(readFileSync(resolve(ROOT, path)))
  ]));

  const sourceByKey = new Map(sourceRows.map(row => [rowKey(row), row]));
  const gateKeys = gateRows.map(rowKey), sourceKeys = sourceRows.map(rowKey);
  assert.equal(sourceByKey.size, EXPECTED.rows, 'source keys unique');
  assert.equal(new Set(gateKeys).size, EXPECTED.rows, 'Gate 2 keys unique');
  assert.deepEqual(gateKeys, sourceKeys, 'Gate 2 row order and identity match the frozen source');

  const identityFor = keys => sha(Buffer.from(`${keys.join('\n')}\n`));
  const identityReceipt = {
    rowKeyDefinition: 'shape|phase|station (station is the exact saved numeric value)',
    orderedAllRowsSha256: identityFor(gateKeys),
    sortedAllRowsSha256: identityFor([...gateKeys].sort()),
    orderedStrictUniqueRowsSha256: identityFor(gateRows.filter(row => row.uniqueWinner).map(rowKey)),
    sortedStrictUniqueRowsSha256: identityFor(gateRows.filter(row => row.uniqueWinner).map(rowKey).sort())
  };

  const joined = gateRows.map((row, index) => {
    const key = rowKey(row), source = sourceByKey.get(key);
    assert(source, `missing frozen source row ${key}`);
    assert.equal(source.shape, row.shape);
    assert.equal(source.phase, row.phase);
    assert.equal(source.station, row.station);
    assert.equal(row.referenceWinner, source.referenceWinner, `${key} analytic winner`);
    assert.equal(row.uniqueWinner, source.referenceWinnerUnique, `${key} analytic uniqueness`);
    assert(row.referenceWinnerMargin === source.referenceWinnerMargin, `${key} analytic margin`);
    sameNested(row.referenceRawWide, source.wideReference.map(candidate => candidate.raw), `${key} A raw reads`);
    sameNested(row.baseline.rawWide, source.wideProduction.map(candidate => candidate.raw), `${key} C raw reads`);

    const analytic = wideFrom(row.referenceRawWide, source.wideGeometry);
    const production = wideFrom(row.baseline.rawWide, source.wideGeometry);
    const cic = wideFrom(row.candidate.rawWide, source.wideGeometry);
    assertReferenceParity(analytic, source, row);
    assertWideParity(production, row.baseline.wide, `${key} C`);
    assertWideParity(cic, row.candidate.wide, `${key} D`);
    assert.equal(row.baseline.winner, OFFSETS[production.scoreOrder[0]], `${key} C winner`);
    assert.equal(row.candidate.winner, OFFSETS[cic.scoreOrder[0]], `${key} D winner`);

    const target = row.referenceWinner;
    const traces = {
      A: armStages(analytic, stageTrace(analytic, target), target),
      C: armStages(production, stageTrace(analytic, target), target),
      D: armStages(cic, stageTrace(analytic, target), target)
    };
    const outcome = classifyOutcome(target, row.baseline.winner, row.candidate.winner);
    const record = {
      index, key, shape: row.shape, phase: row.phase, station: row.station,
      referenceWinner: target,
      referenceScoreMargin: errorMargin(analytic),
      productionWinner: row.baseline.winner,
      candidateWinner: row.candidate.winner,
      productionWrong: row.baseline.winner !== target,
      candidateWrong: row.candidate.winner !== target,
      outcome,
      arms: {
        A: compactArm(analytic, stageTrace(analytic, target), target),
        C: compactArm(production, stageTrace(analytic, target), target),
        D: compactArm(cic, stageTrace(analytic, target), target)
      },
      firstCvsDDivergence: firstRankDivergence(traces.C.trace, traces.D.trace)
    };
    if (row.uniqueWinner) {
      record.referenceScoreMargin = errorMargin(analytic);
    }
    return { row, source, analytic, production, cic, record };
  });

  const allRows = joined.map(entry => entry.record);
  const uniqueRows = allRows.filter(row => joined[row.index].row.uniqueWinner);
  const recovered = uniqueRows.filter(row => row.outcome === 'recovered');
  const newErrors = uniqueRows.filter(row => row.outcome === 'new-error');
  const baselineErrors = uniqueRows.filter(row => row.productionWrong);
  const candidateErrors = uniqueRows.filter(row => row.candidateWrong);
  const bothWrong = uniqueRows.filter(row => row.outcome === 'both-wrong');
  const bothCorrect = uniqueRows.filter(row => row.outcome === 'both-correct');
  const analyticExactTies = allRows.filter(row => row.referenceScoreMargin === 0).length;
  const analyticPrecisionNearTies = allRows.filter(row => sign(row.referenceScoreMargin) === 0).length;
  const analyticUniqueFlagDisagreements = allRows.filter(row => row.referenceScoreMargin > 0
    !== joined[row.index].row.uniqueWinner).length;
  assert.equal(uniqueRows.length, EXPECTED.unique, 'strict unique analytic rows');
  assert.equal(allRows.length - uniqueRows.length, 472, 'saved non-strict-unique rows excluded');
  assert.equal(analyticExactTies, 472, 'analytic exact score ties');
  assert.equal(analyticPrecisionNearTies, 472, 'analytic precision near-ties under saved rule');
  assert.equal(analyticUniqueFlagDisagreements, 0, 'analytic strict-unique saved flag parity');
  assert.equal(baselineErrors.length, EXPECTED.baselineErrors, 'production C mismatch count');
  assert.equal(candidateErrors.length, EXPECTED.candidateErrors, 'CIC D mismatch count');
  assert.equal(recovered.length, EXPECTED.recovered, 'recovered membership count');
  assert.equal(newErrors.length, EXPECTED.newErrors, 'new-error membership count');
  assert.equal(results.gate2.metrics.global.baseline.wideErrors, baselineErrors.length);
  assert.equal(results.gate2.metrics.global.candidate.wideErrors, candidateErrors.length);
  assert.equal(results.gate2.metrics.global.wideRecovered, recovered.length);
  assert.equal(results.gate2.metrics.global.wideNewErrors, newErrors.length);

  const expectedAmbiguity = results.gate2.metrics.global.wideAmbiguity;
  for (const [name, rows] of [['baseline', uniqueRows], ['candidate', uniqueRows]]) {
    const margin = row => {
      const entry = joined[row.index];
      return errorMargin(name === 'baseline' ? entry.production : entry.cic);
    };
    const exact = rows.filter(row => margin(row) === 0).length;
    const near = rows.filter(row => sign(margin(row)) === 0).length;
    assert.equal(exact, expectedAmbiguity[name].exactFinalTies, `${name} exact tie count`);
    assert.equal(near, expectedAmbiguity[name].precisionNearFinalTies, `${name} precision near-tie count`);
  }

  const routeOrder = new Map(ROUTES.map((route, index) => [route, index]));
  const phaseOrder = new Map(PHASES.map((phase, index) => [phase, index]));
  const stable = rows => [...rows].sort((a, b) => routeOrder.get(a.shape) - routeOrder.get(b.shape)
    || phaseOrder.get(a.phase) - phaseOrder.get(b.phase) || a.station - b.station);
  const census = stable(uniqueRows).map(row => ({
    rowKey: row.key, shape: row.shape, phase: row.phase, station: row.station,
    referenceWinner: row.referenceWinner, referenceScoreMargin: row.referenceScoreMargin,
    productionWinner: row.productionWinner, candidateWinner: row.candidateWinner,
    outcome: row.outcome, productionWrong: row.productionWrong, candidateWrong: row.candidateWrong,
    firstCvsDDivergence: row.firstCvsDDivergence,
    arms: row.arms
  }));

  const focal = stable([...recovered, ...newErrors]).map(row => {
    const source = joined[row.index].source;
    const entry = joined[row.index];
    const a = entry.analytic, c = entry.production, d = entry.cic;
    const analyticTrace = stageTrace(a, row.referenceWinner);
    return {
      ...row,
      sourceInputIndex: row.index,
      sourceGeometrySha256: sha(Buffer.from(JSON.stringify(source.wideGeometry))),
      arms: {
        A: fullFocalArm(a, analyticTrace, row.referenceWinner),
        C: fullFocalArm(c, analyticTrace, row.referenceWinner),
        D: fullFocalArm(d, analyticTrace, row.referenceWinner)
      }
    };
  });

  const focalByOutcome = Object.fromEntries(['recovered', 'new-error'].map(outcome => {
    const rows = focal.filter(row => row.outcome === outcome);
    const affectedArm = outcome === 'recovered' ? 'C' : 'D';
    return [outcome, summarizeCohort(rows, affectedArm)];
  }));
  const tightGroups = Object.fromEntries([
    ...ROUTES.map(route => [route, row => row.shape === route]),
    ...PHASES.map(phase => [phase, row => row.phase === phase]),
    ...['tight', 'tightMirror'].flatMap(route => ['p01', 'p11'].map(phase =>
      [`${route}∩${phase}`, row => row.shape === route && row.phase === phase]))
  ].map(([name, predicate]) => [name, summarizeGroup(allRows, uniqueRows, recovered, newErrors, predicate)]));

  const stagesAcrossArms = Object.fromEntries(['A', 'C', 'D'].map(arm => [arm, Object.fromEntries(
    STAGE_IDS.slice(1).map((stageId, index) => {
      const previousId = STAGE_IDS[index];
      const changed = uniqueRows.filter(row => !sameArray(
        row.arms[arm].stages.find(stage => stage.id === previousId).order,
        row.arms[arm].stages.find(stage => stage.id === stageId).order
      )).length;
      return [`${previousId}→${stageId}`, changed];
    })
  )]));

  const sZero = allRows.map(record => joined[record.index]).filter(entry => entry.row.shape === 'sCurve'
    && sign(entry.row.reference.steering) === 0);
  const zeroSummary = {
    count: sZero.length,
    baseline: {
      falseNonzero: sZero.filter(entry => sign(entry.row.baseline.local.steering) !== 0).length,
      meanAbsoluteSteering: mean(sZero.map(entry => Math.abs(entry.row.baseline.local.steering)))
    },
    cic: {
      falseNonzero: sZero.filter(entry => sign(entry.row.candidate.local.steering) !== 0).length,
      meanAbsoluteSteering: mean(sZero.map(entry => Math.abs(entry.row.candidate.local.steering)))
    },
    scope: 'local analytic-zero control only; excluded from strict-unique wide-winner cohort'
  };
  assert.equal(zeroSummary.count, 392);
  const savedZero = results.gate2.metrics.zeroControls.sCurveAnalyticZero;
  assert.equal(zeroSummary.baseline.falseNonzero, savedZero.baseline.falseNonzero);
  assert.equal(zeroSummary.cic.falseNonzero, savedZero.candidate.falseNonzero);
  assert(zeroSummary.baseline.meanAbsoluteSteering === savedZero.baseline.falseSteeringMae);
  assert(zeroSummary.cic.meanAbsoluteSteering === savedZero.candidate.falseSteeringMae);

  const groupSummary = {
    routesAndPhases: tightGroups,
    focalStages: focalByOutcome,
    outcomeCounts: { bothCorrect: bothCorrect.length, bothWrong: bothWrong.length,
      recovered: recovered.length, newErrors: newErrors.length }
  };
  const expectedGroups = {
    tight: [844, 301, 303, 44, 46], tightMirror: [844, 301, 303, 44, 46],
    p01: [1268, 534, 535, 27, 28], p11: [1268, 540, 551, 17, 28]
  };
  for (const [name, expected] of Object.entries(expectedGroups)) {
    const group = groupSummary.routesAndPhases[name];
    assert.deepEqual([group.strictUniqueRows, group.productionErrors, group.cicErrors,
      group.recovered, group.newErrors], expected, `${name} subgroup parity`);
  }

  const focalIdHashes = {
    recoveredSortedSha256: sha(Buffer.from(`${recovered.map(row => row.key).sort().join('\n')}\n`)),
    newErrorsSortedSha256: sha(Buffer.from(`${newErrors.map(row => row.key).sort().join('\n')}\n`))
  };
  const examples = [];
  for (const [outcome, affectedArm] of [['recovered', 'C'], ['new-error', 'D']]) {
    const rows = focal.filter(row => row.outcome === outcome).sort((a, b) => a.sourceInputIndex - b.sourceInputIndex);
    const byStage = new Map();
    for (const row of rows) {
      const stage = row.arms[affectedArm].firstRankDivergenceFromA || 'none';
      if (!byStage.has(stage)) byStage.set(stage, row);
    }
    for (const stage of [...STAGE_IDS, 'none']) {
      const row = byStage.get(stage);
      if (row) examples.push({ outcome, affectedArm, firstRankDivergenceFromA: stage === 'none' ? null : stage, row });
    }
  }

  const hasExactTopScoreTie = wide => wide.candidates[wide.scoreOrder[0]].score
    === wide.candidates[wide.scoreOrder[1]].score;
  const baselineScoreTies = uniqueRows.filter(row => hasExactTopScoreTie(joined[row.index].production)).length;
  const candidateScoreTies = uniqueRows.filter(row => hasExactTopScoreTie(joined[row.index].cic)).length;
  const summary = {
    schema: 'ant-cic-wide-stage-attribution/v1',
    startingCommits: {
      originMain: MAIN_SHA,
      qualificationTip: QUALIFICATION_SHA,
      qualificationBranch: 'codex/ant-cic-writer-qualification-20261024',
      mergeBase: MAIN_SHA,
      commitsAheadOfMain: 2,
      attributionBranchBase: QUALIFICATION_SHA,
      attributionBranchName: 'codex/ant-cic-wide-stage-attribution-20261024'
    },
    implementationBoundary: {
      productionSourceChanged: false,
      arms: { A: 'frozen analytic reference raw reads', C: 'saved production raw reads and wide output',
        D: 'saved CIC raw reads and wide output' },
      shared: 'same frozen candidate geometry, unchanged production weights/max and deterministic Gate 2 helper',
      operatorScope: 'Gate 2 field-only diagnostic; not full stochastic controller choice'
    },
    parity: {
      gate2RowsSha256: GATE2_ROWS_SHA256,
      frozenStationRowsSha256: INPUT_SHA,
      gate2Rows: gateRows.length,
      frozenRows: sourceRows.length,
      joinedKeysExactAndOrdered: true,
      allRows: allRows.length,
      strictUniqueAnalyticRows: uniqueRows.length,
      savedNonStrictUniqueRowsExcluded: allRows.length - uniqueRows.length,
      sourceHashes: liveProductionHashes,
      implementationHashes,
      rowIdentity: identityReceipt
    },
    global: {
      analyticUniqueRows: uniqueRows.length,
      productionErrors: baselineErrors.length,
      cicErrors: candidateErrors.length,
      bothCorrect: bothCorrect.length,
      bothWrong: bothWrong.length,
      recovered: recovered.length,
      newErrors: newErrors.length,
      exactFinalScoreTies: { production: baselineScoreTies, cic: candidateScoreTies },
      analyticTieAccounting: { exactTies: analyticExactTies,
        precisionNearTiesByExistingRule: analyticPrecisionNearTies,
        savedStrictUniqueRows: uniqueRows.length, savedFlagDisagreements: analyticUniqueFlagDisagreements,
        rule: 'saved unique flag equals exact positive analytic score margin; precision sign uses 64*EPSILON*max(1,abs(value))' },
      precisionNearFinalTies: {
        production: results.gate2.metrics.global.wideAmbiguity.baseline.precisionNearFinalTies,
        cic: results.gate2.metrics.global.wideAmbiguity.candidate.precisionNearFinalTies,
        method: 'reused qualification sign(value) rule: 64*Number.EPSILON*max(1,abs(value))'
      },
      analyticScoreMargins: { recovered: distribution(recovered.map(row => row.referenceScoreMargin)),
        newErrors: distribution(newErrors.map(row => row.referenceScoreMargin)) },
      firstRankDivergenceFromA: {
        production: countBy(uniqueRows, row => row.arms.C.firstRankDivergenceFromA, [...STAGE_IDS, 'none']),
        cic: countBy(uniqueRows, row => row.arms.D.firstRankDivergenceFromA, [...STAGE_IDS, 'none'])
      },
      firstTargetDepartureFromAnalyticFinalWinner: {
        production: countBy(uniqueRows, row => row.arms.C.firstTargetDeparture, [...STAGE_IDS, 'none']),
        cic: countBy(uniqueRows, row => row.arms.D.firstTargetDeparture, [...STAGE_IDS, 'none'])
      },
      cVsDFirstRankDivergence: countBy(intersectionOrderStage(uniqueRows, 'C', 'D'), row => row.stage, [...STAGE_IDS, 'none']),
      orderChangesBetweenConsecutiveStages: stagesAcrossArms,
      focalMembershipHashes: focalIdHashes
    },
    subgroups: groupSummary,
    sCurveAnalyticZeroControl: zeroSummary,
    examples: examples.map(({ outcome, affectedArm, firstRankDivergenceFromA, row }) => ({
      outcome, affectedArm, firstRankDivergenceFromA, rowKey: row.key
    })),
    decisionBoundary: 'Attribution only. Gate 2 remains MIXED / NOT QUALIFIED; Gate 3 remains NOT RUN.'
  };

  const validation = {
    passed: true,
    checked: [
      'Gate 2 file SHA, byte length, and row count',
      'frozen station input SHA and 5,544 ordered row identities',
      'current production source hashes match saved attribution helper guards',
      'A reference raw reads, winner, strict-unique flag, and margin parity',
      'C production raw reads and all saved wide stage outputs exact parity',
      'D CIC raw reads and all saved wide stage outputs exact parity',
      '5,072 strict-unique rows, 2,378 C errors, 2,378 D errors, 92 recoveries, 92 new errors',
      '472 analytic exact/precision ties, strict-unique flag parity, and saved C/D exact and precision-near tie counts',
      'tight/tightMirror and p01/p11 subgroup membership',
      '392 S analytic-zero local rows and saved 364→377/steering-MAE parity'
    ],
    rowIdentity: identityReceipt,
    focalMembershipHashes: focalIdHashes,
    analyticTieAccounting: { exactTies: analyticExactTies,
      precisionNearTiesByExistingRule: analyticPrecisionNearTies,
      savedStrictUniqueRows: uniqueRows.length, savedFlagDisagreements: analyticUniqueFlagDisagreements },
    wideFinalTieCounts: { production: baselineScoreTies, cic: candidateScoreTies }
  };

  return { summary, validation, census, focal, examples };
}

function writeBytes(path, bytes) {
  const absolute = resolve(ROOT, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
}

function stableJson(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }

export function runAttribution(outputDir = PACKAGE) {
  const output = outputDir.replaceAll('\\', '/').replace(/^\.\//, '');
  const result = validateAndAnalyze();
  const files = new Map([
    ['summary.json', stableJson(result.summary)],
    ['validation.json', stableJson(result.validation)],
    ['stage-census.json.gz', gzipSync(Buffer.from(JSON.stringify(result.census)), { level: 9, mtime: 0 })],
    ['focal-rows.json.gz', gzipSync(Buffer.from(JSON.stringify(result.focal)), { level: 9, mtime: 0 })],
    ['representative-traces.json', stableJson(result.examples)]
  ]);
  for (const [name, bytes] of files) writeBytes(`${output}/${name}`, bytes);

  const analysisScriptPath = 'scripts/ant-cic-wide-stage-attribution.js';
  const preregPath = `${PACKAGE}/PREREGISTRATION.md`;
  const manifest = {
    schema: 'ant-cic-wide-stage-attribution-manifest/v1',
    analysisSourceSha256: sha(readFileSync(resolve(ROOT, analysisScriptPath))),
    preregistrationSha256: sha(readFileSync(resolve(ROOT, preregPath))),
    files: Object.fromEntries([...files].map(([name, bytes]) => [name, { bytes: bytes.length, sha256: sha(bytes) }]))
  };
  writeBytes(`${output}/manifest.json`, stableJson(manifest));
  return { summary: result.summary, validation: result.validation, manifest };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = runAttribution(process.argv[2] || PACKAGE);
  process.stdout.write(`${JSON.stringify({ summary: result.summary, validation: result.validation, manifest: result.manifest }, null, 2)}\n`);
}
