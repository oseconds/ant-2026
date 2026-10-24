import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { evaluateWide, loadFrozenRows, SOURCE_HASHES } from './ant-field-writer-reader-failure-attribution.js';

const ROOT = process.cwd();
const TRANSVERSE = 'docs/ant/evidence/2026-10-24-cic-transverse-sample-diagnostic';
const ATTRIBUTION = 'docs/ant/evidence/2026-10-24-cic-wide-stage-attribution';
const GATE = 'docs/ant/evidence/2026-10-24-ant-cic-writer-qualification';
export const PACKAGE = 'docs/ant/evidence/2026-10-24-cic-sample-profile-substitution';
const BRANCH = 'codex/ant-cic-wide-stage-attribution-20261024';
const MAIN_SHA = '8c60e4bba3bd5b476300e90a2936bfebd1f831c2';
const RESEARCH_START_SHA = 'fb8f0ce009a96f1f2a8aecb80078de53a0454d56';
const PREREG_SHA = '8211c456d69a00b5d5628c448dee73276ff9a8f9';
const QUALIFICATION_SHA = '1fbfec5943c41ad6c8b3828fb48c47828d9be817';
const GATE_ROWS_SHA = '550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f';
const FROZEN_ROWS_SHA = '50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29';
const STAGE_CENSUS_SHA = '384e4ec7982e336db432ea98ea8006934cf6b2276ac145b9a3e84b0ae8645d25';
const TRANSVERSE_ROW_SHA = '4d0d6da4ebdd201526d52269179c28e38531fa9d72e14318b9c8704d77a141b3';
const PRIMARY_KEYS_SHA = '960def8884a5fee1be4ad0872ae0e66be508388b031a28d2ac4f09bdd8f59085';
const PREVIOUS_FOCAL_SHA = 'd15db82408c08819956218c472192e3dffeebe084a081d8720e63b2af696291c';
const ANT_CONTROLLER_SHA = 'e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04';
const ATTRIBUTION_HELPER_SHA = '72c020cb2abb8dd42a6c56fa277ff9ef4bcbff26c949f45c994c001998779864';
const CANDIDATE_OFFSETS = [-0.92, -0.47, 0, 0.47, 0.92];
const SENSOR_OFFSETS = [-1, -0.5, 0, 0.5, 1];
const STAGES = ['rawMaximum', 'weightedMaximum', 'hillResponse', 'fieldOnlyScore'];
const ARM_SPECS = [
  { label: 'D', source: null, targets: [] },
  { label: 'D[target←C]', source: 'C', targets: ['target'] },
  { label: 'D[rival←C]', source: 'C', targets: ['rival'] },
  { label: 'D[target+rival←C]', source: 'C', targets: ['target', 'rival'] },
  { label: 'D[target←A]', source: 'A', targets: ['target'] },
  { label: 'D[rival←A]', source: 'A', targets: ['rival'] },
  { label: 'D[target+rival←A]', source: 'A', targets: ['target', 'rival'] }
];

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readBytes = path => readFileSync(resolve(ROOT, path));
const readJson = path => JSON.parse(readBytes(path).toString('utf8'));
const readGzipJson = path => JSON.parse(gunzipSync(readBytes(path)).toString('utf8'));
const stableJson = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const rowKey = row => `${row.shape}|${row.phase}|${String(row.station)}`;
const savedVectors = arm => arm.candidates.map(candidate => candidate.samples.map(sample => sample.raw));
const argmax = values => {
  const max = Math.max(...values);
  return values.flatMap((value, index) => value === max ? [index] : []);
};
const stage = (arm, id) => Array.isArray(arm.stages)
  ? arm.stages.find(item => item.id === id)
  : arm.stages[id];
const sameBytes = (a, b) => Buffer.compare(a, b) === 0;

function assertHash(path, expected) {
  const bytes = readBytes(path);
  assert.equal(sha(bytes), expected, `SHA-256 ${path}`);
  return bytes;
}

function countBy(items, getKey) {
  const result = {};
  for (const item of items) {
    const key = getKey(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function topIndices(values) {
  const max = Math.max(...values);
  return values.flatMap((value, index) => value === max ? [index] : []);
}

function orderRecord(indices) {
  return indices.map(index => ({ candidateIndex: index, offset: CANDIDATE_OFFSETS[index] }));
}

function summarizeNumbers(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = q => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
  return sorted.length ? {
    n: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    min: sorted[0],
    p10: quantile(0.1),
    median: quantile(0.5),
    p90: quantile(0.9),
    max: sorted.at(-1)
  } : { n: 0, mean: null, min: null, p10: null, median: null, p90: null, max: null };
}

function validateInputs() {
  const priorManifest = readJson(`${TRANSVERSE}/manifest.json`);
  for (const [name, record] of Object.entries(priorManifest.files)) {
    const bytes = readBytes(`${TRANSVERSE}/${name}`);
    assert.equal(bytes.length, record.bytes, `prior artifact bytes ${name}`);
    assert.equal(sha(bytes), record.sha256, `prior artifact SHA ${name}`);
  }
  const rowBytes = assertHash(`${TRANSVERSE}/row-decomposition.json.gz`, TRANSVERSE_ROW_SHA);
  const gateBytes = assertHash(`${GATE}/gate2/rows.json.gz`, GATE_ROWS_SHA);
  const stationBytes = assertHash(`${GATE}/inputs/station-raw.json.gz`, FROZEN_ROWS_SHA);
  const stageBytes = assertHash(`${ATTRIBUTION}/stage-census.json.gz`, STAGE_CENSUS_SHA);
  const focalBytes = assertHash(`${ATTRIBUTION}/focal-rows.json.gz`, PREVIOUS_FOCAL_SHA);

  const sourceHashes = Object.fromEntries(Object.keys(SOURCE_HASHES).map(path => [path, sha(readBytes(path))]));
  for (const [path, expected] of Object.entries(SOURCE_HASHES)) {
    assert.equal(sourceHashes[path], expected, `production source ${path}`);
  }
  assert.equal(sha(readBytes('src/lib/agents/ant/AntController.js')), ANT_CONTROLLER_SHA, 'senseTrail source');
  assert.equal(sha(readBytes('scripts/ant-field-writer-reader-failure-attribution.js')),
    ATTRIBUTION_HELPER_SHA, 'unchanged wide helper source');

  const transverse = JSON.parse(gunzipSync(rowBytes));
  const gateRows = JSON.parse(gunzipSync(gateBytes));
  const stationRows = loadFrozenRows(resolve(ROOT, `${GATE}/inputs/station-raw.json.gz`));
  const stageCensus = JSON.parse(gunzipSync(stageBytes));
  const previousFocal = JSON.parse(gunzipSync(focalBytes));
  assert.equal(transverse.rows.length, 118);
  assert.equal(gateRows.length, 5544);
  assert.equal(stationRows.length, 5544);
  assert.equal(stageCensus.length, 5072);
  assert.equal(previousFocal.length, 184);

  const gateByKey = new Map(gateRows.map(row => [rowKey(row), row]));
  const stationByKey = new Map(stationRows.map(row => [rowKey(row), row]));
  const focalByKey = new Map(previousFocal.map(row => [row.key, row]));
  const stageByKey = new Map(stageCensus.map(row => [row.rowKey, row]));
  assert.equal(gateByKey.size, 5544);
  assert.equal(stationByKey.size, 5544);
  assert.equal(stageByKey.size, 5072);

  const uniqueGate = gateRows.filter(row => row.uniqueWinner);
  const recovered = uniqueGate.filter(row => row.baseline.winner !== row.referenceWinner
    && row.candidate.winner === row.referenceWinner);
  const newErrors = uniqueGate.filter(row => row.baseline.winner === row.referenceWinner
    && row.candidate.winner !== row.referenceWinner);
  assert.equal(uniqueGate.length, 5072);
  assert.equal(uniqueGate.filter(row => row.baseline.winner !== row.referenceWinner).length, 2378);
  assert.equal(uniqueGate.filter(row => row.candidate.winner !== row.referenceWinner).length, 2378);
  assert.equal(recovered.length, 92);
  assert.equal(newErrors.length, 92);

  const harmfulFromCensus = stageCensus.filter(row => row.outcome === 'new-error'
    && row.arms.D.firstTargetDeparture === 'weightedMaximum'
    && stage(row.arms.D, 'rawMaximum').targetTop
    && !stage(row.arms.D, 'weightedMaximum').targetTop).map(row => row.rowKey).sort();
  const primary = transverse.rows.filter(row => row.cohort === 'harmful')
    .sort((a, b) => a.sourceInputIndex - b.sourceInputIndex);
  const primaryKeys = primary.map(row => row.rowKey).sort();
  assert.equal(primary.length, 26);
  assert.deepEqual(primaryKeys, harmfulFromCensus, 'prior stage-census membership');
  assert.equal(sha(Buffer.from(`${primaryKeys.join('\n')}\n`)), PRIMARY_KEYS_SHA, 'primary key hash');

  const byRoute = countBy(primary, row => row.shape);
  const byPhase = countBy(primary, row => row.phase);
  assert.deepEqual(byRoute, { tight: 13, tightMirror: 13 });
  assert.deepEqual(byPhase, { p00: 8, p10: 2, p01: 10, p11: 6 });

  let targetSwitches = 0, rivalSwitches = 0, sameSampleReorders = 0, relevantTies = 0;
  for (const row of primary) {
    const key = row.rowKey;
    const gate = gateByKey.get(key), station = stationByKey.get(key), focal = focalByKey.get(key);
    assert(gate && station && focal, `frozen row join ${key}`);
    assert.equal(gate.referenceWinner, row.analyticTargetOffset, `analytic target ${key}`);
    assert.equal(gate.candidate.winner, row.cicFinalOffset, `CIC final ${key}`);
    assert.equal(gate.baseline.winner, row.productionFinalOffset, `production final ${key}`);
    assert.equal(focal.sourceInputIndex, row.sourceInputIndex, `source input index ${key}`);

    const vectors = {
      A: savedVectors(row.arms.A),
      C: savedVectors(row.arms.C),
      D: savedVectors(row.arms.D)
    };
    assert.deepEqual(vectors.A, gate.referenceRawWide, `saved A vectors ${key}`);
    assert.deepEqual(vectors.C, gate.baseline.rawWide, `saved C vectors ${key}`);
    assert.deepEqual(vectors.D, gate.candidate.rawWide, `saved D vectors ${key}`);
    assert.deepEqual(vectors.A, station.wideReference.map(candidate => candidate.raw), `station A vectors ${key}`);
    assert.deepEqual(vectors.C, station.wideProduction.map(candidate => candidate.raw), `station C vectors ${key}`);
    assert.deepEqual(station.wideGeometry.map(candidate => candidate.offset), CANDIDATE_OFFSETS);
    for (const armName of ['A', 'C', 'D']) {
      for (let candidateIndex = 0; candidateIndex < 5; candidateIndex++) {
        const saved = row.arms[armName].candidates[candidateIndex];
        const geometry = station.wideGeometry[candidateIndex];
        assert.equal(saved.candidateOffset, geometry.offset, `candidate offset ${key}/${armName}/${candidateIndex}`);
        assert.equal(saved.candidateHeading, geometry.heading, `candidate heading ${key}/${armName}/${candidateIndex}`);
        for (let sampleIndex = 0; sampleIndex < 5; sampleIndex++) {
          const read = saved.samples[sampleIndex], expected = geometry.reads[sampleIndex];
          assert.equal(read.sampleIndex, sampleIndex);
          assert.equal(read.sensorOffset, SENSOR_OFFSETS[sampleIndex]);
          assert.equal(read.query.x, expected.x, `query x ${key}/${armName}/${candidateIndex}/${sampleIndex}`);
          assert.equal(read.query.y, expected.y, `query y ${key}/${armName}/${candidateIndex}/${sampleIndex}`);
          assert.equal(read.weight, expected.weight, `weight ${key}/${armName}/${candidateIndex}/${sampleIndex}`);
        }
      }
    }

    const targetIndex = station.wideGeometry.findIndex(candidate => candidate.offset === row.analyticTargetOffset);
    assert.equal(targetIndex, row.targetIndex);
    assert.equal(row.weightedRivalIndex, row.finalRivalIndex, `frozen rival is final D winner ${key}`);
    const rivalIndex = row.weightedRivalIndex;
    assert.notEqual(targetIndex, rivalIndex, `analytic target and D rival are distinct ${key}`);
    const target = row.arms.D.candidates[targetIndex];
    const rival = row.arms.D.candidates[rivalIndex];
    assert.equal(row.arms.D.finalWinnerOffset, row.cicFinalOffset);
    assert.notEqual(row.cicFinalOffset, row.analyticTargetOffset);
    assert.equal(stage(row.arms.D, 'rawMaximum').order[0], targetIndex, `D raw target top ${key}`);
    assert.equal(stage(row.arms.D, 'weightedMaximum').order[0], rivalIndex,
      `D weighted rival top ${key}`);
    assert.equal(stage(row.arms.D, 'fieldOnlyScore').order[0], rivalIndex,
      `D final wrong winner ${key}`);
    assert.equal(target.rawArgmaxSampleIndices.length, 1);
    assert([0, 4].includes(target.rawArgmaxSampleIndices[0]), `D target raw max is outer ${key}`);
    assert.equal(target.weightedArgmaxSampleIndices.length, 1);
    assert([1, 3].includes(target.weightedArgmaxSampleIndices[0]), `D target weighted max is inner ${key}`);
    assert.deepEqual(rival.rawArgmaxSampleIndices, rival.weightedArgmaxSampleIndices);
    assert.equal(row.transition.targetChanged, true);
    assert.equal(row.transition.rivalChanged, false);
    assert.equal(row.transition.stableReordering, false);
    assert.equal(row.transition.exactTie, false);
    if (!target.rawArgmaxSampleIndices.every(index => target.weightedArgmaxSampleIndices.includes(index))) targetSwitches++;
    if (!rival.rawArgmaxSampleIndices.every(index => rival.weightedArgmaxSampleIndices.includes(index))) rivalSwitches++;
    if (row.transition.stableReordering) sameSampleReorders++;
    if (row.transition.exactTie) relevantTies++;
  }
  assert.equal(targetSwitches, 26);
  assert.equal(rivalSwitches, 0);
  assert.equal(sameSampleReorders, 0);
  assert.equal(relevantTies, 0);

  return {
    transverse, gateRows, stationRows, stageCensus, previousFocal, primary,
    gateByKey, stationByKey,
    provenance: {
      priorRowBytes: rowBytes.length, priorRowSha256: sha(rowBytes), gateRowsSha256: sha(gateBytes),
      stationRowsSha256: sha(stationBytes), stageCensusSha256: sha(stageBytes), focalRowsSha256: sha(focalBytes),
      productionSourceHashes: { ...sourceHashes, 'src/lib/agents/ant/AntController.js': ANT_CONTROLLER_SHA,
        'scripts/ant-field-writer-reader-failure-attribution.js': ATTRIBUTION_HELPER_SHA }
    },
    reproduction: {
      strictUniqueRows: uniqueGate.length, productionMismatchRows: 2378, cicMismatchRows: 2378,
      recoveredRows: recovered.length, newErrorRows: newErrors.length, primaryRows: primary.length,
      primarySortedKeysSha256: sha(Buffer.from(`${primaryKeys.join('\n')}\n`)),
      byRoute, byPhase, targetSampleSwitches: targetSwitches, rivalSampleSwitches: rivalSwitches,
      sameSampleReorders, relevantExactTies: relevantTies
    }
  };
}

function armInputs(row, spec) {
  const baseline = savedVectors(row.arms.D).map(vector => [...vector]);
  const vectors = baseline.map(vector => [...vector]);
  const targetIndex = row.targetIndex;
  const rivalIndex = row.weightedRivalIndex;
  const replacements = [];
  for (const role of spec.targets) {
    const candidateIndex = role === 'target' ? targetIndex : rivalIndex;
    const replacement = savedVectors(row.arms[spec.source])[candidateIndex];
    vectors[candidateIndex] = [...replacement];
    replacements.push({ role, candidateIndex, source: spec.source, values: [...replacement] });
  }
  for (let index = 0; index < vectors.length; index++) {
    const shouldChange = replacements.some(item => item.candidateIndex === index);
    assert.deepEqual(vectors[index], shouldChange
      ? savedVectors(row.arms[spec.source])[index]
      : baseline[index], `declared vector substitution ${row.rowKey}/${spec.label}/${index}`);
  }
  return { baseline, vectors, replacements };
}

function resultFor(row, spec, station) {
  const { baseline, vectors, replacements } = armInputs(row, spec);
  const geometry = station.wideGeometry;
  const geometryBefore = JSON.stringify(geometry);
  const result = evaluateWide(vectors.map((raw, index) => ({ offset: geometry[index].offset, raw })), geometry);
  assert.equal(JSON.stringify(geometry), geometryBefore, `geometry unchanged ${row.rowKey}/${spec.label}`);

  const sourceArm = spec.source ? row.arms[spec.source] : null;
  const vectorAudit = vectors.map((values, candidateIndex) => {
    const replacement = replacements.find(item => item.candidateIndex === candidateIndex);
    const expected = replacement ? savedVectors(row.arms[replacement.source])[candidateIndex] : baseline[candidateIndex];
    assert.deepEqual(values, expected, `only declared vectors differ ${row.rowKey}/${spec.label}/${candidateIndex}`);
    return {
      candidateIndex, offset: geometry[candidateIndex].offset,
      declaredChanged: Boolean(replacement), matchesDeclaredSource: replacement ? values.every((v, i) => v === expected[i]) : null,
      unchangedFromD: replacement ? null : values.every((v, i) => v === baseline[candidateIndex])
    };
  });
  if (spec.source) {
    for (const replacement of replacements) {
      assert.deepEqual(vectors[replacement.candidateIndex],
        savedVectors(sourceArm)[replacement.candidateIndex], `source vector exact ${row.rowKey}/${spec.label}`);
    }
  }

  const stages = {
    rawMaximum: { values: result.candidates.map(candidate => candidate.rawMaximum), order: result.rawOrder },
    weightedMaximum: { values: result.candidates.map(candidate => candidate.maximum), order: result.weightedOrder },
    hillResponse: { values: result.candidates.map(candidate => candidate.response), order: result.hillOrder },
    fieldOnlyScore: { values: result.candidates.map(candidate => candidate.score), order: result.scoreOrder }
  };
  if (spec.label === 'D') {
    for (const id of STAGES) {
      assert.deepEqual(stages[id].values, stage(row.arms.D, id).values, `unchanged D values ${row.rowKey}/${id}`);
      assert.deepEqual(stages[id].order, stage(row.arms.D, id).order, `unchanged D order ${row.rowKey}/${id}`);
    }
    assert.equal(geometry[result.scoreOrder[0]].offset, row.cicFinalOffset, `unchanged D winner ${row.rowKey}`);
  }
  const targetIndex = row.targetIndex, rivalIndex = row.weightedRivalIndex;
  const weightedWinner = result.weightedOrder[0], finalWinner = result.scoreOrder[0];
  const targetRaw = result.candidates[targetIndex], targetWeighted = result.candidates[targetIndex];
  const rival = result.candidates[rivalIndex];
  const stageWinner = id => {
    const values = stages[id].values, order = stages[id].order;
    return {
      candidateIndex: order[0], offset: geometry[order[0]].offset,
      exactTopIndices: topIndices(values), exactTopOffsets: topIndices(values).map(index => geometry[index].offset),
      order: orderRecord(order)
    };
  };
  return {
    label: spec.label,
    source: spec.source,
    replacedRoles: [...spec.targets],
    replacedCandidateIndices: replacements.map(item => item.candidateIndex),
    rawSamples: vectors,
    vectorAudit,
    stages,
    candidates: result.candidates.map((candidate, index) => ({
      candidateIndex: index,
      offset: candidate.offset,
      rawSamples: candidate.raw,
      weightedSamples: candidate.weighted,
      rawMaximum: candidate.rawMaximum,
      rawArgmaxSampleIndices: argmax(candidate.raw),
      rawArgmaxSensorOffsets: argmax(candidate.raw).map(sample => SENSOR_OFFSETS[sample]),
      weightedMaximum: candidate.maximum,
      weightedArgmaxSampleIndices: argmax(candidate.weighted),
      weightedArgmaxSensorOffsets: argmax(candidate.weighted).map(sample => SENSOR_OFFSETS[sample]),
      hillResponse: candidate.response,
      fieldOnlyScore: candidate.score
    })),
    winners: {
      rawMaximum: stageWinner('rawMaximum'),
      weightedMaximum: stageWinner('weightedMaximum'),
      fieldOnlyScore: stageWinner('fieldOnlyScore')
    },
    targetAndFrozenRival: {
      targetIndex, targetOffset: geometry[targetIndex].offset,
      rivalIndex, rivalOffset: geometry[rivalIndex].offset,
      targetRawArgmaxSampleIndices: argmax(targetRaw.raw),
      targetRawArgmaxSensorOffsets: argmax(targetRaw.raw).map(index => SENSOR_OFFSETS[index]),
      targetWeightedArgmaxSampleIndices: argmax(targetWeighted.weighted),
      targetWeightedArgmaxSensorOffsets: argmax(targetWeighted.weighted).map(index => SENSOR_OFFSETS[index]),
      rivalRawArgmaxSampleIndices: argmax(rival.raw),
      rivalRawArgmaxSensorOffsets: argmax(rival.raw).map(index => SENSOR_OFFSETS[index]),
      rivalWeightedArgmaxSampleIndices: argmax(rival.weighted),
      rivalWeightedArgmaxSensorOffsets: argmax(rival.weighted).map(index => SENSOR_OFFSETS[index]),
      targetMinusOriginalDRival: {
        rawMaximum: targetRaw.rawMaximum - rival.rawMaximum,
        weightedMaximum: targetWeighted.maximum - rival.maximum,
        finalFieldOnlyScore: targetRaw.score - rival.score
      }
    },
    outcome: {
      targetWeightedWinner: weightedWinner === targetIndex,
      targetFinalWinner: finalWinner === targetIndex,
      weightedWinnerIndex: weightedWinner,
      finalWinnerIndex: finalWinner,
      thirdWeightedWinnerIndex: weightedWinner !== targetIndex && weightedWinner !== rivalIndex ? weightedWinner : null,
      thirdFinalWinnerIndex: finalWinner !== targetIndex && finalWinner !== rivalIndex ? finalWinner : null
    }
  };
}

function geometryRecord(row, station) {
  return station.wideGeometry.map((candidate, candidateIndex) => ({
    candidateIndex, offset: candidate.offset, heading: candidate.heading,
    reads: candidate.reads.map((read, sampleIndex) => ({
      sampleIndex, sensorOffset: SENSOR_OFFSETS[sampleIndex], x: read.x, y: read.y, weight: read.weight
    }))
  }));
}

function patternFor(targetSingle, rivalSingle, pair) {
  if (targetSingle && rivalSingle) return pair ? 'both-singles-and-pair' : 'both-singles-pair-fails';
  if (targetSingle) return `target-only${pair ? '-plus-pair' : ''}`;
  if (rivalSingle) return `rival-only${pair ? '-plus-pair' : ''}`;
  return pair ? 'joint-only' : 'none';
}

function compactRepresentative(row, selectionRule) {
  return {
    selectionRule: `first saved sourceInputIndex matching: ${selectionRule}`,
    row: {
      rowKey: row.rowKey, route: row.route, phase: row.phase, station: row.station,
      analyticTargetOffset: row.analyticTargetOffset, frozenDRivalOffset: row.frozenDRivalOffset
    },
    arms: Object.fromEntries(ARM_SPECS.map(spec => {
      const arm = row.arms[spec.label];
      const trace = arm.targetAndFrozenRival;
      return [spec.label, {
        replacedRoles: arm.replacedRoles,
        winners: {
          rawMaximum: arm.winners.rawMaximum.offset,
          weightedMaximum: arm.winners.weightedMaximum.offset,
          finalFieldOnlyScore: arm.winners.fieldOnlyScore.offset
        },
        targetMinusFrozenDRival: trace.targetMinusOriginalDRival,
        targetArgmaxSamples: {
          raw: trace.targetRawArgmaxSensorOffsets,
          weighted: trace.targetWeightedArgmaxSensorOffsets
        },
        rivalArgmaxSamples: {
          raw: trace.rivalRawArgmaxSensorOffsets,
          weighted: trace.rivalWeightedArgmaxSensorOffsets
        },
        thirdWinner: {
          weighted: arm.outcome.thirdWeightedWinnerIndex,
          final: arm.outcome.thirdFinalWinnerIndex
        }
      }];
    }))
  };
}

export function buildDiagnostic() {
  const input = validateInputs();
  const outputRows = input.primary.map(row => {
    const station = input.stationByKey.get(row.rowKey);
    const geometry = geometryRecord(row, station);
    const arms = Object.fromEntries(ARM_SPECS.map(spec => [spec.label, resultFor(row, spec, station)]));
    return {
      rowKey: row.rowKey,
      sourceInputIndex: row.sourceInputIndex,
      route: row.shape,
      phase: row.phase,
      station: row.station,
      analyticTargetOffset: row.analyticTargetOffset,
      productionFinalOffset: row.productionFinalOffset,
      cicOriginalFinalOffset: row.cicFinalOffset,
      targetIndex: row.targetIndex,
      frozenDRivalIndex: row.weightedRivalIndex,
      frozenDRivalOffset: row.weightedRivalOffset,
      dWeightedRivalEqualsFinalWrongWinner: row.weightedRivalIndex === row.finalRivalIndex,
      analyticWinnerMargin: row.analyticWinnerMargin,
      geometry,
      sourceVectors: { A: savedVectors(row.arms.A), C: savedVectors(row.arms.C), D: savedVectors(row.arms.D) },
      arms
    };
  });
  const routePhase = (items, predicate) => ({
    byRoute: countBy(items.filter(predicate), row => row.route),
    byPhase: countBy(items.filter(predicate), row => row.phase),
    byRoutePhase: countBy(items.filter(predicate), row => `${row.route}|${row.phase}`)
  });
  const arms = {};
  for (const spec of ARM_SPECS) {
    const label = spec.label;
    const resultRows = outputRows.map(row => ({ ...row, result: row.arms[label] }));
    const weightedRestores = resultRows.filter(row => row.result.outcome.targetWeightedWinner);
    const finalRestores = resultRows.filter(row => row.result.outcome.targetFinalWinner);
    const margins = stageName => resultRows.map(row => row.result.targetAndFrozenRival.targetMinusOriginalDRival[stageName]);
    arms[label] = {
      source: spec.source,
      replacedRoles: spec.targets,
      weightedTargetWins: weightedRestores.length,
      finalTargetWins: finalRestores.length,
      weightedWrong: outputRows.length - weightedRestores.length,
      finalWrong: outputRows.length - finalRestores.length,
      weightedExactTopTiesContainingTarget: resultRows.filter(row => row.result.winners.weightedMaximum.exactTopIndices.length > 1
        && row.result.winners.weightedMaximum.exactTopIndices.includes(row.targetIndex)).length,
      finalExactTopTiesContainingTarget: resultRows.filter(row => row.result.winners.fieldOnlyScore.exactTopIndices.length > 1
        && row.result.winners.fieldOnlyScore.exactTopIndices.includes(row.targetIndex)).length,
      exactTopTieRows: {
        rawMaximum: resultRows.filter(row => row.result.winners.rawMaximum.exactTopIndices.length > 1).map(row => row.rowKey),
        weightedMaximum: resultRows.filter(row => row.result.winners.weightedMaximum.exactTopIndices.length > 1).map(row => row.rowKey),
        finalFieldOnlyScore: resultRows.filter(row => row.result.winners.fieldOnlyScore.exactTopIndices.length > 1).map(row => row.rowKey)
      },
      thirdWeightedWinnerCount: resultRows.filter(row => row.result.outcome.thirdWeightedWinnerIndex !== null).length,
      thirdFinalWinnerCount: resultRows.filter(row => row.result.outcome.thirdFinalWinnerIndex !== null).length,
      thirdWeightedWinnerByOffset: countBy(resultRows.filter(row => row.result.outcome.thirdWeightedWinnerIndex !== null),
        row => CANDIDATE_OFFSETS[row.result.outcome.thirdWeightedWinnerIndex]),
      thirdFinalWinnerByOffset: countBy(resultRows.filter(row => row.result.outcome.thirdFinalWinnerIndex !== null),
        row => CANDIDATE_OFFSETS[row.result.outcome.thirdFinalWinnerIndex]),
      restorationByRoutePhase: {
        weighted: routePhase(resultRows, row => row.result.outcome.targetWeightedWinner),
        final: routePhase(resultRows, row => row.result.outcome.targetFinalWinner)
      },
      marginDistributions: {
        rawMaximum: summarizeNumbers(margins('rawMaximum')),
        weightedMaximum: summarizeNumbers(margins('weightedMaximum')),
        finalFieldOnlyScore: summarizeNumbers(margins('finalFieldOnlyScore'))
      }
    };
  }

  const sufficiency = {};
  for (const source of ['C', 'A']) {
    const targetLabel = `D[target←${source}]`, rivalLabel = `D[rival←${source}]`, pairLabel = `D[target+rival←${source}]`;
    sufficiency[source] = {};
    for (const stageName of ['weighted', 'final']) {
      const outcomeField = stageName === 'weighted' ? 'targetWeightedWinner' : 'targetFinalWinner';
      const targetSingle = row => row.arms[targetLabel].outcome[outcomeField];
      const rivalSingle = row => row.arms[rivalLabel].outcome[outcomeField];
      const pair = row => row.arms[pairLabel].outcome[outcomeField];
      const counts = {
        targetSingleRestores: outputRows.filter(targetSingle).length,
        rivalSingleRestores: outputRows.filter(rivalSingle).length,
        bothSingleRestores: outputRows.filter(row => targetSingle(row) && rivalSingle(row)).length,
        pairedReplacementRestores: outputRows.filter(pair).length,
        jointOnlyRestores: outputRows.filter(row => !targetSingle(row) && !rivalSingle(row) && pair(row)).length,
        neitherSingleNorPairRestores: outputRows.filter(row => !targetSingle(row) && !rivalSingle(row) && !pair(row)).length,
        bothSinglesRestoreButPairDoesNot: outputRows.filter(row => targetSingle(row) && rivalSingle(row) && !pair(row)).length
      };
      counts.rowPattern = countBy(outputRows, row => patternFor(targetSingle(row), rivalSingle(row), pair(row)));
      sufficiency[source][stageName] = counts;
    }
  }
  const sourceContrast = {};
  for (const role of ['target', 'rival', 'target+rival']) {
    const sourceContrastForRole = {};
    for (const stageName of ['weighted', 'final']) {
      const field = stageName === 'weighted' ? 'targetWeightedWinner' : 'targetFinalWinner';
      const c = `D[${role}←C]`, a = `D[${role}←A]`;
      sourceContrastForRole[stageName] = {
        bothRestore: outputRows.filter(row => row.arms[c].outcome[field] && row.arms[a].outcome[field]).length,
        COnly: outputRows.filter(row => row.arms[c].outcome[field] && !row.arms[a].outcome[field]).length,
        AOnly: outputRows.filter(row => !row.arms[c].outcome[field] && row.arms[a].outcome[field]).length,
        neither: outputRows.filter(row => !row.arms[c].outcome[field] && !row.arms[a].outcome[field]).length
      };
    }
    sourceContrast[role] = sourceContrastForRole;
  }

  const primaryTargets = outputRows.map(row => row.rowKey);
  const validation = {
    passed: true,
    baseline: { originMainSha: MAIN_SHA, researchBranch: BRANCH, researchStartSha: RESEARCH_START_SHA,
      preregistrationCommit: PREREG_SHA, qualificationCommit: QUALIFICATION_SHA },
    inputHashes: input.provenance,
    previousCensusReproduced: input.reproduction,
    interventionChecks: {
      rows: outputRows.length,
      armsPerRow: ARM_SPECS.length,
      evaluations: outputRows.length * ARM_SPECS.length,
      sourceVectorsMatchedSavedAorC: outputRows.length * 8,
      untouchedCandidateVectorsMatchedD: outputRows.length * ARM_SPECS.reduce((sum, spec) => sum + (5 - spec.targets.length), 0),
      queryGeometryAndWeightsShared: true,
      unchangedDStageAndWinnerParity: true,
      evaluationHelper: 'evaluateWide from scripts/ant-field-writer-reader-failure-attribution.js'
    },
    outputRows: outputRows.length,
    outputRowKeysSha256: sha(Buffer.from(`${primaryTargets.join('\n')}\n`)),
    scope: { productionSourceChanged: false, fieldRegenerated: false, worldAdvanced: false,
      writerOrSensorCandidateTested: false, movementRun: false }
  };

  const summary = {
    schema: 'ant-cic-sample-profile-substitution-census/v1',
    primaryRows: outputRows.length,
    reproduction: input.reproduction,
    arms,
    sufficiencyPatterns: sufficiency,
    CvsAContrast: sourceContrast,
    routePhase: {
      byRoute: countBy(outputRows, row => row.route),
      byPhase: countBy(outputRows, row => row.phase),
      byRoutePhase: countBy(outputRows, row => `${row.route}|${row.phase}`)
    },
    interpretationRules: {
      targetRestoration: 'candidate index equals the frozen analytic target at the specified helper stage',
      thirdWinner: 'winner is neither the frozen analytic target nor the original D weighted/final rival',
      exactTies: 'all candidate indices with value exactly equal to the stage maximum are retained; no tolerance added',
      noSuccessThreshold: true
    }
  };

  const representatives = [];
  const repRules = [
    ['C target-only weighted restore', row => row.arms['D[target←C]'].outcome.targetWeightedWinner
      && !row.arms['D[rival←C]'].outcome.targetWeightedWinner],
    ['C rival-only weighted restore', row => row.arms['D[rival←C]'].outcome.targetWeightedWinner
      && !row.arms['D[target←C]'].outcome.targetWeightedWinner],
    ['C joint-only weighted restore', row => !row.arms['D[target←C]'].outcome.targetWeightedWinner
      && !row.arms['D[rival←C]'].outcome.targetWeightedWinner
      && row.arms['D[target+rival←C]'].outcome.targetWeightedWinner],
    ['C no weighted restoration', row => !row.arms['D[target←C]'].outcome.targetWeightedWinner
      && !row.arms['D[rival←C]'].outcome.targetWeightedWinner
      && !row.arms['D[target+rival←C]'].outcome.targetWeightedWinner],
    ['A/C restoration contrast', row => ['target', 'rival', 'target+rival'].some(role =>
      row.arms[`D[${role}←C]`].outcome.targetFinalWinner !== row.arms[`D[${role}←A]`].outcome.targetFinalWinner)]
  ];
  for (const [label, predicate] of repRules) {
    const match = outputRows.find(predicate);
    if (match) representatives.push(compactRepresentative(match, label));
  }
  return { rows: outputRows, summary, validation, representatives };
}

function createFiles(data) {
  const files = new Map([
    ['substitution-rows.json.gz', gzipSync(stableJson({ schema: 'ant-cic-sample-profile-substitution-rows/v1', rows: data.rows }), { level: 9 })],
    ['arm-census.json', stableJson(data.summary)],
    ['representative-traces.json', stableJson({ schema: 'ant-cic-sample-profile-representatives/v1', selection: 'first input-order row for each listed pattern', rows: data.representatives })],
    ['validation.json', stableJson(data.validation)]
  ]);
  const manifest = {
    schema: 'ant-cic-sample-profile-substitution-manifest/v1',
    inputs: data.validation.inputHashes,
    preregistrationSha256: sha(readBytes(`${PACKAGE}/PREREGISTRATION.md`)),
    analysisSourceSha256: sha(readBytes('scripts/ant-cic-sample-profile-substitution.js')),
    files: Object.fromEntries([...files].map(([name, bytes]) => [name, { bytes: bytes.length, sha256: sha(bytes) }]))
  };
  files.set('manifest.json', stableJson(manifest));
  return files;
}

function sortedFileHashes(files) {
  return Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => [name, sha(bytes)]));
}

export function runDeterministicDiagnostic(outputDir = resolve(ROOT, PACKAGE)) {
  const first = createFiles(buildDiagnostic());
  const second = createFiles(buildDiagnostic());
  assert.deepEqual([...second.keys()], [...first.keys()]);
  for (const [name, bytes] of first) {
    assert(sameBytes(bytes, second.get(name)), `second generation differs: ${name}`);
  }
  const hashes = sortedFileHashes(first);
  const receipt = stableJson({
    schema: 'ant-cic-sample-profile-substitution-determinism/v1',
    identical: true,
    completeGenerations: 2,
    outputHashes: hashes
  });
  const all = new Map(first);
  all.set('determinism.json', receipt);
  mkdirSync(outputDir, { recursive: true });
  for (const [name, bytes] of all) writeFileSync(resolve(outputDir, name), bytes);
  return { files: sortedFileHashes(all), generationHashes: hashes };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/ant-cic-sample-profile-substitution.js')) {
  try {
    const receipt = runDeterministicDiagnostic();
    process.stdout.write(`${JSON.stringify({ passed: true, package: PACKAGE, ...receipt }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
