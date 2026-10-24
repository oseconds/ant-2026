import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

export const INPUT_SHA256 = '50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29';
export const SOURCE_HASHES = Object.freeze({
  'src/lib/agents/ant/AntController.js': 'e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04',
  'src/lib/agents/ant/PheromoneField.js': '412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd',
  'src/lib/agents/ant/GasterDeposition.js': '0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41'
});
export const PHASES = Object.freeze({
  p00: [0, 0], p10: [0.5 / 95, 0], p01: [0, 0.5 / 95], p11: [0.5 / 95, 0.5 / 95]
});
export const SHAPES = Object.freeze(['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve']);

const OFFSETS = [-0.92, -0.47, 0, 0.47, 0.92];
const CAUSAL_CLASSES = Object.freeze([
  'READER-SUFFICIENT', 'WRITER/STORAGE-SUFFICIENT',
  'READER-FAILURE PARTLY RESTORED BY WRITER', 'MIXED / COMPOUND',
  'B TOP TIE / AMBIGUOUS'
]);
const LOCAL_WEIGHTS = [0.25, 0.5, 0.25];
const EPSILON = 64 * Number.EPSILON;
const LOCAL_HALF_SATURATION = 0.018;
const WIDE_HALF_SATURATION = 0.035;

export function localStages(samples) {
  if (samples.length !== 18 || samples.some(value => !Number.isFinite(value))) {
    throw new TypeError('Expected 18 finite frozen local samples.');
  }
  const profiles = [0, 1].map(depth => [0, 1, 2].map(side => {
    const start = depth * 9 + side * 3;
    return samples.slice(start, start + 3).reduce((sum, value, index) =>
      sum + value * LOCAL_WEIGHTS[index], 0);
  }));
  const [left, center, right] = profiles[0].map((value, index) =>
    (value + profiles[1][index]) * 0.5);
  const strengthInput = Math.sqrt(Math.max(...profiles[0]) * Math.max(...profiles[1]));
  const strength = hill(strengthInput, LOCAL_HALF_SATURATION);
  const coherence = Math.min(...profiles.map(profile => {
    const peak = Math.max(...profile), floor = Math.min(...profile);
    const split = Math.max(0, Math.min(profile[0], profile[2]) - profile[1]);
    return (peak - floor) / (peak + 1e-9) * (1 - split / (peak + 1e-9));
  }));
  const balanceNumerator = right - left;
  const balanceDenominator = left + center + right + 1e-9;
  const balance = balanceNumerator / balanceDenominator;
  return {
    profiles, left, center, right, strengthInput, strength, coherence,
    balanceNumerator, balanceDenominator, balance,
    steering: 0.45 * balance * strength
  };
}

export function evaluateWide(rawCandidates, geometries) {
  if (rawCandidates.length !== OFFSETS.length || geometries.length !== OFFSETS.length) {
    throw new TypeError('Expected the five frozen wide candidates.');
  }
  const candidates = rawCandidates.map((candidate, index) => {
    const geometry = geometries[index];
    if (candidate.offset !== OFFSETS[index] || geometry.offset !== OFFSETS[index]
      || candidate.raw.length !== 5 || geometry.reads.length !== 5) {
      throw new TypeError('Frozen wide candidate order or query geometry changed.');
    }
    const weighted = candidate.raw.map((value, sample) => value * geometry.reads[sample].weight);
    const maximum = Math.max(...weighted);
    const response = hill(maximum, WIDE_HALF_SATURATION);
    return {
      offset: candidate.offset,
      raw: candidate.raw,
      rawMaximum: Math.max(...candidate.raw),
      weighted,
      maximum,
      response,
      trailScore: response * 2.8
    };
  });
  const responses = candidates.map(candidate => candidate.response);
  const confidence = Math.max(...responses) - Math.min(...responses);
  for (const candidate of candidates) {
    candidate.directionalPenalty = (Math.cos(candidate.offset) - 1) * confidence * 0.55;
    candidate.score = candidate.trailScore + candidate.directionalPenalty;
  }
  return {
    candidates,
    rawOrder: rank(candidates.map(candidate => candidate.rawMaximum)),
    weightedOrder: rank(candidates.map(candidate => candidate.maximum)),
    hillOrder: rank(candidates.map(candidate => candidate.response)),
    scoreOrder: rank(candidates.map(candidate => candidate.score)),
    confidence
  };
}

export function loadFrozenRows(inputPath) {
  const bytes = readFileSync(inputPath);
  const hash = sha(bytes);
  if (hash !== INPUT_SHA256) throw new Error(`Frozen input hash mismatch: ${hash}`);
  const rows = JSON.parse(gunzipSync(bytes));
  if (!Array.isArray(rows) || rows.length !== 5544) throw new Error('Expected 5,544 frozen rows.');
  return rows;
}

export function analyze(rows, { mainSha, sourceHashes = hashSources() } = {}) {
  if (!Array.isArray(rows) || rows.length !== 5544) throw new Error('Expected 5,544 frozen rows.');
  for (const [path, expected] of Object.entries(SOURCE_HASHES)) {
    if (sourceHashes[path] !== expected) throw new Error(`Production baseline changed: ${path}`);
  }

  const allRows = [];
  const localSamples = [];
  const wideSamples = [];
  const localSteeringErrors = [];
  const wideRawMaximumErrors = [];
  const wideMaximumErrors = [];
  const bRecovery = { localPairs: 0, widePairs: 0, bMinusAReaderNonExact: 0,
    cMinusBWriterNonExact: 0, totalNonExact: 0, maxBMinusAReader: 0,
    maxCMinusBWriter: 0, maxCMinusATotal: 0, maxDecompositionResidual: 0 };
  const precisionSensitivity = { localRows: 0, localSignChanges: 0, maxLocalRawDifference: 0,
    maxLocalSteeringDifference: 0, wideRows: 0, maxWideRawDifference: 0,
    rawWinnerChanges: 0, rawRankChanges: 0, weightedWinnerChanges: 0,
    weightedRankChanges: 0, finalWinnerChanges: 0, finalRankChanges: 0 };
  const localFailureRows = [];
  const localNearZeroRows = [];
  const allLocalDirectionalRows = [];
  const wideMismatchRows = [];
  const allWideUniqueRows = [];
  let localReplayComparisons = 0, localReplayNonExact = 0, localReplayMax = 0;
  let wideReplayComparisons = 0, wideReplayNonExact = 0, wideReplayMax = 0;
  let weightedReplayComparisons = 0, weightedReplayNonExact = 0;
  let rankReplayComparisons = 0, rankReplayNonExact = 0;
  let winnerReplayComparisons = 0, winnerReplayNonExact = 0;

  for (const row of rows) {
    const bLocalRaw = row.localReferenceRaw.map((value, index) =>
      value + row.localDecomposition[index].reader);
    const bLocalFromWriter = row.localProductionRaw.map((value, index) =>
      value - row.localDecomposition[index].writer);
    const local = {
      A: localStages(row.localReferenceRaw),
      B: localStages(bLocalRaw),
      C: localStages(row.localProductionRaw)
    };
    const localFromWriter = localStages(bLocalFromWriter);
    for (const [arm, actual, saved] of [
      ['A', local.A, row.localReference], ['C', local.C, row.localProduction]
    ]) {
      for (const key of ['left', 'center', 'right', 'strength', 'coherence', 'balance', 'steering']) {
        const error = actual[key] - saved[key];
        localReplayComparisons += 1;
        localReplayMax = Math.max(localReplayMax, Math.abs(error));
        if (actual[key] !== saved[key]) localReplayNonExact += 1;
      }
    }

    const aCandidates = row.wideReference.map(candidate => ({ offset: candidate.offset, raw: candidate.raw }));
    const cCandidates = row.wideProduction.map(candidate => ({ offset: candidate.offset, raw: candidate.raw }));
    const bCandidates = aCandidates.map((candidate, index) => ({
      offset: candidate.offset,
      raw: candidate.raw.map((value, sample) => value + row.wideDecomposition[index][sample].reader)
    }));
    const bFromWriterCandidates = cCandidates.map((candidate, index) => ({
      offset: candidate.offset,
      raw: candidate.raw.map((value, sample) => value - row.wideDecomposition[index][sample].writer)
    }));
    const wide = {
      A: evaluateWide(aCandidates, row.wideGeometry),
      B: evaluateWide(bCandidates, row.wideGeometry),
      C: evaluateWide(cCandidates, row.wideGeometry)
    };
    const wideBFromWriter = evaluateWide(bFromWriterCandidates, row.wideGeometry);
    for (const [arm, actual, saved] of [
      ['A', wide.A, row.wideReference], ['C', wide.C, row.wideProduction]
    ]) {
      for (let index = 0; index < OFFSETS.length; index += 1) {
        for (const key of ['maximum', 'response', 'score']) {
          const error = actual.candidates[index][key] - saved[index][key];
          wideReplayComparisons += 1;
          wideReplayMax = Math.max(wideReplayMax, Math.abs(error));
          if (actual.candidates[index][key] !== saved[index][key]) wideReplayNonExact += 1;
        }
        for (let sample = 0; sample < 5; sample += 1) {
          weightedReplayComparisons += 1;
          if (actual.candidates[index].weighted[sample] !== saved[index].weighted[sample]) {
            weightedReplayNonExact += 1;
          }
        }
      }
      const savedRanks = arm === 'A' ? row.referenceRanks : row.productionRanks;
      const actualRanks = rankPositions(actual.scoreOrder);
      rankReplayComparisons += OFFSETS.length;
      for (let index = 0; index < OFFSETS.length; index += 1) {
        if (actualRanks[index] !== savedRanks[index]) rankReplayNonExact += 1;
      }
      const savedWinner = arm === 'A' ? row.referenceWinner : row.productionWinner;
      winnerReplayComparisons += 1;
      if (OFFSETS[actual.scoreOrder[0]] !== savedWinner) winnerReplayNonExact += 1;
    }

    const scale = Math.max(1, ...row.localReferenceRaw.map(Math.abs), ...row.localProductionRaw.map(Math.abs));
    const tolerance = EPSILON * scale;
    const signA = sign(local.A.steering, tolerance);
    const signB = sign(local.B.steering, tolerance);
    const signC = sign(local.C.steering, tolerance);
    precisionSensitivity.localRows += 1;
    precisionSensitivity.maxLocalRawDifference = Math.max(precisionSensitivity.maxLocalRawDifference,
      ...bLocalRaw.map((value, index) => Math.abs(value - bLocalFromWriter[index])));
    precisionSensitivity.maxLocalSteeringDifference = Math.max(precisionSensitivity.maxLocalSteeringDifference,
      Math.abs(local.B.steering - localFromWriter.steering));
    if (sign(local.B.steering, tolerance) !== sign(localFromWriter.steering, tolerance)) {
      precisionSensitivity.localSignChanges += 1;
    }
    precisionSensitivity.wideRows += 1;
    for (const [orderA, orderB, winnerKey, rankKey] of [
      [wide.B.rawOrder, wideBFromWriter.rawOrder, 'rawWinnerChanges', 'rawRankChanges'],
      [wide.B.weightedOrder, wideBFromWriter.weightedOrder, 'weightedWinnerChanges', 'weightedRankChanges'],
      [wide.B.scoreOrder, wideBFromWriter.scoreOrder, 'finalWinnerChanges', 'finalRankChanges']
    ]) {
      if (orderA[0] !== orderB[0]) precisionSensitivity[winnerKey] += 1;
      if (orderA.some((value, index) => value !== orderB[index])) precisionSensitivity[rankKey] += 1;
    }
    for (let candidate = 0; candidate < OFFSETS.length; candidate += 1) {
      for (let sample = 0; sample < 5; sample += 1) {
        precisionSensitivity.maxWideRawDifference = Math.max(precisionSensitivity.maxWideRawDifference,
          Math.abs(bCandidates[candidate].raw[sample] - bFromWriterCandidates[candidate].raw[sample]));
      }
    }
    const exactSignMismatch = local.A.steering * local.C.steering < 0;
    const localStableFailure = signA * signC < 0;
    const localNearZeroFailure = exactSignMismatch && Math.abs(local.C.steering) <= tolerance;
    const localClass = localStableFailure
      ? classify(signA, signB, signC)
      : localNearZeroFailure ? 'MIXED / COMPOUND' : null;
    const localOutcome = signA === 0 ? null : classifyLocalOutcome(signA, signB, signC);
    const localComponents = {
      readerSteering: local.B.steering - local.A.steering,
      writerSteering: local.C.steering - local.B.steering,
      totalSteering: local.C.steering - local.A.steering,
      relationship: componentRelation(local.B.steering - local.A.steering,
        local.C.steering - local.B.steering, local.C.steering - local.A.steering)
    };
    localSteeringErrors.push(localComponents);
    if (localStableFailure) localFailureRows.push({ row, local, signA, signB, signC, localClass, localComponents });
    if (localNearZeroFailure) localNearZeroRows.push({ row, local, signA, signB, signC, localClass, localComponents });
    if (localOutcome) allLocalDirectionalRows.push({ row, class: localOutcome });

    const rawWinners = Object.fromEntries(['A', 'B', 'C'].map(arm => [arm, wide[arm].rawOrder[0]]));
    const weightedWinners = Object.fromEntries(['A', 'B', 'C'].map(arm => [arm, wide[arm].weightedOrder[0]]));
    const finalWinners = Object.fromEntries(['A', 'B', 'C'].map(arm => [arm, wide[arm].scoreOrder[0]]));
    const aFinalWinner = wide.A.scoreOrder[0];
    const cFinalWinner = wide.C.scoreOrder[0];
    const unique = row.referenceWinnerUnique === true;
    const winnerMismatch = unique && cFinalWinner !== aFinalWinner;
    const cFirstWrongStage = winnerMismatch ? firstWrongStage(wide.C, aFinalWinner) : null;
    const aRawMax = wide.A.candidates.map(candidate => candidate.rawMaximum);
    const bRawMax = wide.B.candidates.map(candidate => candidate.rawMaximum);
    const cRawMax = wide.C.candidates.map(candidate => candidate.rawMaximum);
    const aMaximum = wide.A.candidates.map(candidate => candidate.maximum);
    const bMaximum = wide.B.candidates.map(candidate => candidate.maximum);
    const cMaximum = wide.C.candidates.map(candidate => candidate.maximum);
    const bScores = wide.B.candidates.map(candidate => candidate.score);
    const rawOutcome = unique
      ? classifyStage(aFinalWinner, rawWinners.A, rawWinners.B, rawWinners.C, bRawMax) : null;
    const weightedOutcome = unique
      ? classifyStage(aFinalWinner, weightedWinners.A, weightedWinners.B, weightedWinners.C, bMaximum) : null;
    const finalOutcome = unique
      ? classifyStage(aFinalWinner, finalWinners.A, finalWinners.B, finalWinners.C, bScores) : null;
    const rawClass = winnerMismatch && cFirstWrongStage === 'rawMaximum' ? rawOutcome : null;
    const weightedClass = winnerMismatch && cFirstWrongStage === 'maximum' ? weightedOutcome : null;
    const finalMargin = wide.A.candidates[wide.A.scoreOrder[0]].score
      - wide.A.candidates[wide.A.scoreOrder[1]].score;
    if (winnerMismatch) {
      wideMismatchRows.push({ row, margin: finalMargin, cFirstWrongStage,
        rawClass: rawClass || (cFirstWrongStage === 'rawMaximum' ? 'MIXED / COMPOUND' : null),
        weightedClass: weightedClass || (cFirstWrongStage === 'maximum' ? 'MIXED / COMPOUND' : null) });
    }
    if (unique) allWideUniqueRows.push({ row, margin: finalMargin, rawOutcome, weightedOutcome, finalOutcome });
    for (let candidate = 0; candidate < OFFSETS.length; candidate += 1) {
      const errorRaw = { reader: bRawMax[candidate] - aRawMax[candidate],
        writer: cRawMax[candidate] - bRawMax[candidate], total: cRawMax[candidate] - aRawMax[candidate] };
      const errorWeighted = { reader: bMaximum[candidate] - aMaximum[candidate],
        writer: cMaximum[candidate] - bMaximum[candidate], total: cMaximum[candidate] - aMaximum[candidate] };
      wideRawMaximumErrors.push(errorRaw);
      wideMaximumErrors.push(errorWeighted);
    }

    for (let index = 0; index < 18; index += 1) {
      const a = row.localReferenceRaw[index], d = row.localDecomposition[index];
      const b = a + d.reader, c = row.localProductionRaw[index];
      const bReader = b - a, cWriter = c - b, cTotal = c - a;
      bRecovery.localPairs += 1;
      bRecovery.bMinusAReaderNonExact += bReader !== d.reader ? 1 : 0;
      bRecovery.cMinusBWriterNonExact += cWriter !== d.writer ? 1 : 0;
      bRecovery.totalNonExact += cTotal !== d.total ? 1 : 0;
      bRecovery.maxBMinusAReader = Math.max(bRecovery.maxBMinusAReader, Math.abs(bReader - d.reader));
      bRecovery.maxCMinusBWriter = Math.max(bRecovery.maxCMinusBWriter, Math.abs(cWriter - d.writer));
      bRecovery.maxCMinusATotal = Math.max(bRecovery.maxCMinusATotal, Math.abs(cTotal - d.total));
      bRecovery.maxDecompositionResidual = Math.max(bRecovery.maxDecompositionResidual, Math.abs(d.residual));
      localSamples.push({ reader: bReader, writer: cWriter, total: cTotal });
    }
    for (let candidate = 0; candidate < OFFSETS.length; candidate += 1) {
      for (let sample = 0; sample < 5; sample += 1) {
        const a = row.wideReference[candidate].raw[sample];
        const d = row.wideDecomposition[candidate][sample];
        const b = a + d.reader, c = row.wideProduction[candidate].raw[sample];
        const bReader = b - a, cWriter = c - b, cTotal = c - a;
        bRecovery.widePairs += 1;
        bRecovery.bMinusAReaderNonExact += bReader !== d.reader ? 1 : 0;
        bRecovery.cMinusBWriterNonExact += cWriter !== d.writer ? 1 : 0;
        bRecovery.totalNonExact += cTotal !== d.total ? 1 : 0;
        bRecovery.maxBMinusAReader = Math.max(bRecovery.maxBMinusAReader, Math.abs(bReader - d.reader));
        bRecovery.maxCMinusBWriter = Math.max(bRecovery.maxCMinusBWriter, Math.abs(cWriter - d.writer));
        bRecovery.maxCMinusATotal = Math.max(bRecovery.maxCMinusATotal, Math.abs(cTotal - d.total));
        bRecovery.maxDecompositionResidual = Math.max(bRecovery.maxDecompositionResidual, Math.abs(d.residual));
        wideSamples.push({ reader: bReader, writer: cWriter, total: cTotal });
      }
    }

    allRows.push({
      shape: row.shape, phase: row.phase, station: row.station,
      local: {
        raw: { A: row.localReferenceRaw, B: bLocalRaw, C: row.localProductionRaw },
        sampleErrors: {
          reader: bLocalRaw.map((value, index) => value - row.localReferenceRaw[index]),
          writer: row.localProductionRaw.map((value, index) => value - bLocalRaw[index]),
          total: row.localProductionRaw.map((value, index) => value - row.localReferenceRaw[index])
        },
        features: local,
        signs: { A: signA, B: signB, C: signC },
        stableFailure: localStableFailure, nearZeroFailure: localNearZeroFailure,
        class: localClass, allDirectionalOutcome: localOutcome, components: localComponents
      },
      wide: {
        analyticFinalWinner: OFFSETS[aFinalWinner],
        productionFinalWinner: OFFSETS[finalWinners.C],
        analyticMargin: finalMargin,
        strictUniqueAnalyticWinner: unique,
        winnerMismatch,
        firstProductionWrongStage: cFirstWrongStage,
        rawSamples: {
          A: aCandidates.map(candidate => candidate.raw),
          B: bCandidates.map(candidate => candidate.raw),
          C: cCandidates.map(candidate => candidate.raw)
        },
        sampleErrors: {
          reader: bCandidates.map((candidate, index) => candidate.raw.map((value, sample) =>
            value - aCandidates[index].raw[sample])),
          writer: cCandidates.map((candidate, index) => candidate.raw.map((value, sample) =>
            value - bCandidates[index].raw[sample])),
          total: cCandidates.map((candidate, index) => candidate.raw.map((value, sample) =>
            value - aCandidates[index].raw[sample]))
        },
        raw: { A: { values: aRawMax, winner: OFFSETS[rawWinners.A], order: wide.A.rawOrder.map(i => OFFSETS[i]) },
          B: { values: bRawMax, winner: OFFSETS[rawWinners.B], order: wide.B.rawOrder.map(i => OFFSETS[i]),
            topTie: topTieOffsets(bRawMax), targetInTopTie: topTieIndices(bRawMax).includes(aFinalWinner) },
          C: { values: cRawMax, winner: OFFSETS[rawWinners.C], order: wide.C.rawOrder.map(i => OFFSETS[i]) },
          class: rawOutcome },
        weighted: { A: { values: aMaximum, winner: OFFSETS[weightedWinners.A], order: wide.A.weightedOrder.map(i => OFFSETS[i]) },
          B: { values: bMaximum, winner: OFFSETS[weightedWinners.B], order: wide.B.weightedOrder.map(i => OFFSETS[i]),
            topTie: topTieOffsets(bMaximum), targetInTopTie: topTieIndices(bMaximum).includes(aFinalWinner) },
          C: { values: cMaximum, winner: OFFSETS[weightedWinners.C], order: wide.C.weightedOrder.map(i => OFFSETS[i]) },
          class: weightedOutcome },
        final: { A: { scores: wide.A.candidates.map(candidate => candidate.score),
          winner: OFFSETS[finalWinners.A], order: wide.A.scoreOrder.map(i => OFFSETS[i]) },
          B: { scores: bScores, winner: OFFSETS[finalWinners.B], order: wide.B.scoreOrder.map(i => OFFSETS[i]),
            topTie: topTieOffsets(bScores), targetInTopTie: topTieIndices(bScores).includes(aFinalWinner) },
          C: { scores: wide.C.candidates.map(candidate => candidate.score),
            winner: OFFSETS[finalWinners.C], order: wide.C.scoreOrder.map(i => OFFSETS[i]) },
          class: finalOutcome }
      }
    });
  }

  const localByPhase = categoryTable(localFailureRows, entry => entry.row.phase, entry => entry.localClass);
  const localByShape = categoryTable(localFailureRows, entry => entry.row.shape, entry => entry.localClass);
  const wideRawRows = wideMismatchRows.filter(entry => entry.cFirstWrongStage === 'rawMaximum');
  const wideWeightedRows = wideMismatchRows.filter(entry => entry.cFirstWrongStage === 'maximum');
  const wideByPhase = categoryTable(wideRawRows, entry => entry.row.phase, entry => entry.rawClass);
  const wideByShape = categoryTable(wideRawRows, entry => entry.row.shape, entry => entry.rawClass);
  const weightedByPhase = categoryTable(wideWeightedRows, entry => entry.row.phase, entry => entry.weightedClass);
  const weightedByShape = categoryTable(wideWeightedRows, entry => entry.row.shape, entry => entry.weightedClass);

  const localRawRelationship = relationshipSummary(localSamples);
  const wideRawRelationship = relationshipSummary(wideSamples);
  const localSteeringRelationship = relationshipSummary(localSteeringErrors.map(value => ({
    reader: value.readerSteering, writer: value.writerSteering, total: value.totalSteering
  })));
  const wideRawMaximumRelationship = relationshipSummary(wideRawMaximumErrors);
  const wideMaximumRelationship = relationshipSummary(wideMaximumErrors);

  const straightControl = straightControlRows(allRows);
  const mirror = mirrorSummary(allRows);
  const phaseGeometry = phaseGeometrySummary(rows);
  const margins = marginSummary(wideMismatchRows);
  const representatives = [
    representative(allRows, 'tight', 'p00', 0.294),
    representative(allRows, 'tight', 'p10', 0.066)
  ];

  return {
    schema: 'ant-field-writer-reader-failure-attribution/v1',
    provenance: {
      mainSha: mainSha || null,
      sensorIsolationCommit: 'e0340d21196438ea56cadd178b81b2d8064755e6',
      analyticReferenceCommit: '2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa',
      inputSha256: INPUT_SHA256,
      uncompressedRowsSha256: sha(Buffer.from(JSON.stringify(rows))),
      sourceHashes,
      armDefinitions: {
        A: 'saved continuous analytic query samples',
        B: 'A plus the frozen per-sample analytic-node bilinear residual; recovers analytic node samples through the production bilinear path',
        C: 'saved production Float32 raster query samples'
      },
      BRecovery: bRecovery,
      precisionSensitivityBetweenAPlusC2AndCMinusC1: precisionSensitivity,
      frozenRows: rows.length,
      shapes: SHAPES,
      phases: Object.keys(PHASES),
      stationsPerShapePhase: 231,
      bRepresentationLimitation: 'The frozen row artifact stores C2 residuals rather than raw analytic node arrays; B is reconstructed by A + C2. Round-trip Float64 residuals are measured below; routes and analytic samples were not regenerated.'
    },
    replayParity: {
      local: { comparisons: localReplayComparisons, nonExact: localReplayNonExact, maxAbsError: localReplayMax },
      wide: { comparisons: wideReplayComparisons, nonExact: wideReplayNonExact, maxAbsError: wideReplayMax },
      weightedSamples: { comparisons: weightedReplayComparisons, nonExact: weightedReplayNonExact },
      candidateRanks: { comparisons: rankReplayComparisons, nonExact: rankReplayNonExact },
      finalWinners: { comparisons: winnerReplayComparisons, nonExact: winnerReplayNonExact }
    },
    local: {
      stableSignFailures: {
        count: localFailureRows.length,
        classes: causalCounts(localFailureRows, entry => entry.localClass),
        byPhase: localByPhase,
        byShape: localByShape,
        analyticCueMagnitude: describe(localFailureRows.map(entry => Math.abs(entry.local.A.steering))),
        marginByClass: valueStatsByClass(localFailureRows, entry => entry.localClass,
          entry => Math.abs(entry.local.A.steering))
      },
      nearZeroCases: {
        count: localNearZeroRows.length,
        rows: localNearZeroRows.map(localSummaryRow)
      },
      exactSignMismatchCount: localFailureRows.length + localNearZeroRows.length,
      controlRows: rows.length - localFailureRows.length - localNearZeroRows.length,
      allAnalyticDirectionalRows: {
        count: allLocalDirectionalRows.length,
        classes: causalCountsWithAgreement(allLocalDirectionalRows, entry => entry.class),
        byPhase: categoryTable(allLocalDirectionalRows, entry => entry.row.phase, entry => entry.class),
        byShape: categoryTable(allLocalDirectionalRows, entry => entry.row.shape, entry => entry.class)
      },
      componentError: {
        rawSamples: componentStats(localRawRelationship),
        steering: componentStats(localSteeringRelationship),
        stableFailureSteering: componentStats(relationshipSummary(localFailureRows.map(entry => ({
          reader: entry.localComponents.readerSteering,
          writer: entry.localComponents.writerSteering,
          total: entry.localComponents.totalSteering
        }))))
      },
      straightControl,
      mirror
    },
    wide: {
      strictUniqueAnalyticRows: rows.filter(row => row.referenceWinnerUnique === true).length,
      finalWinnerMismatches: wideMismatchRows.length,
      allStrictUniqueOutcomes: {
        count: allWideUniqueRows.length,
        rawMaximum: {
          classes: causalCountsWithAgreement(allWideUniqueRows, entry => entry.rawOutcome),
          byPhase: categoryTable(allWideUniqueRows, entry => entry.row.phase, entry => entry.rawOutcome),
          byShape: categoryTable(allWideUniqueRows, entry => entry.row.shape, entry => entry.rawOutcome)
        },
        weightedMaximum: {
          classes: causalCountsWithAgreement(allWideUniqueRows, entry => entry.weightedOutcome),
          byPhase: categoryTable(allWideUniqueRows, entry => entry.row.phase, entry => entry.weightedOutcome),
          byShape: categoryTable(allWideUniqueRows, entry => entry.row.shape, entry => entry.weightedOutcome)
        },
        finalWinner: {
          classes: causalCountsWithAgreement(allWideUniqueRows, entry => entry.finalOutcome),
          byPhase: categoryTable(allWideUniqueRows, entry => entry.row.phase, entry => entry.finalOutcome),
          byShape: categoryTable(allWideUniqueRows, entry => entry.row.shape, entry => entry.finalOutcome)
        }
      },
      rawMaximumFirstWrong: {
        count: wideRawRows.length,
        classes: causalCounts(wideRawRows, entry => entry.rawClass),
        byPhase: wideByPhase,
        byShape: wideByShape,
        analyticMargin: describe(wideRawRows.map(entry => entry.margin)),
        marginByClass: valueStatsByClass(wideRawRows, entry => entry.rawClass, entry => entry.margin)
      },
      weightedMaximumFirstWrong: {
        count: wideWeightedRows.length,
        classes: causalCounts(wideWeightedRows, entry => entry.weightedClass),
        byPhase: weightedByPhase,
        byShape: weightedByShape,
        analyticMargin: describe(wideWeightedRows.map(entry => entry.margin)),
        marginByClass: valueStatsByClass(wideWeightedRows, entry => entry.weightedClass, entry => entry.margin)
      },
      allMismatchMargins: margins,
      componentError: {
        rawSamples: componentStats(wideRawRelationship),
        candidateRawMaxima: componentStats(wideRawMaximumRelationship),
        candidateWeightedMaxima: componentStats(wideMaximumRelationship)
      },
      representatives
    },
    phaseGeometry,
    rowCount: allRows.length,
    rows: allRows
  };
}

export function writeEvidence(inputPath, outputPath, mainSha) {
  const rows = loadFrozenRows(inputPath);
  const result = analyze(rows, { mainSha });
  const compressedRows = gzipSync(Buffer.from(JSON.stringify(result.rows)));
  const rowsHash = sha(compressedRows);
  result.provenance.rowsSha256 = rowsHash;
  const rowPath = resolve(dirname(outputPath), 'abcs-stage-rows.json.gz');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(rowPath, compressedRows);
  delete result.rows;
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  return { result, rowPath, rowsHash };
}

function hashSources() {
  return Object.fromEntries(Object.keys(SOURCE_HASHES).map(path =>
    [path, sha(readFileSync(resolve(process.cwd(), path)))]));
}

function localSummaryRow(entry) {
  return {
    shape: entry.row.shape, phase: entry.row.phase, station: entry.row.station,
    steering: { A: entry.local.A.steering, B: entry.local.B.steering, C: entry.local.C.steering },
    sign: { A: entry.signA, B: entry.signB, C: entry.signC },
    class: entry.localClass, components: entry.localComponents
  };
}

function straightControlRows(rows) {
  const straight = rows.filter(row => row.shape === 'straight');
  const phases = Object.fromEntries(Object.keys(PHASES).map(phase => {
    const values = straight.filter(row => row.phase === phase).map(row => row.local.features);
    return [phase, Object.fromEntries(['A', 'B', 'C'].map(arm => [arm,
      describe(values.map(value => Math.abs(value[arm].steering)))]))];
  }));
  const sampleRows = ['p00', 'p01'].map(phase => rows.find(row => row.shape === 'straight'
    && row.phase === phase && row.station === 0.122));
  return {
    analyticSteeringExactlyZero: straight.every(row => row.local.features.A.steering === 0),
    phases,
    p00p01Station0122: sampleRows.map(row => ({
      phase: row.phase, station: row.station,
      raw: row.local.raw,
      steering: Object.fromEntries(['A', 'B', 'C'].map(arm => [arm, row.local.features[arm].steering])),
      balance: Object.fromEntries(['A', 'B', 'C'].map(arm => [arm, row.local.features[arm].balance]))
    }))
  };
}

function mirrorSummary(rows) {
  const result = {};
  for (const [base, mirror] of [['gentle', 'gentleMirror'], ['tight', 'tightMirror']]) {
    result[base] = {};
    for (const arm of ['A', 'B', 'C']) {
      const sums = rows.filter(row => row.shape === base).map(row => {
        const opposite = rows.find(candidate => candidate.shape === mirror
          && candidate.phase === row.phase && candidate.station === row.station);
        return row.local.features[arm].steering + opposite.local.features[arm].steering;
      });
      result[base][arm] = { count: sums.length, maxAbsMirrorSum: Math.max(...sums.map(Math.abs)) };
    }
  }
  return result;
}

function phaseGeometrySummary(rows) {
  const map = new Map(rows.map(row => [`${row.shape}|${row.phase}|${row.station}`, row]));
  const residuals = [];
  for (const row of rows.filter(entry => entry.phase === 'p00')) {
    for (const phase of ['p10', 'p01', 'p11']) {
      const translated = map.get(`${row.shape}|${phase}|${row.station}`);
      const [dx, dy] = PHASES[phase];
      for (const [baseGeometry, nextGeometry] of [
        [row.localGeometry, translated.localGeometry],
        ...row.wideGeometry.map((candidate, index) => [candidate.reads, translated.wideGeometry[index].reads])
      ]) {
        for (let index = 0; index < baseGeometry.length; index += 1) {
          residuals.push(Math.abs(nextGeometry[index].x - baseGeometry[index].x - dx));
          residuals.push(Math.abs(nextGeometry[index].y - baseGeometry[index].y - dy));
        }
      }
    }
  }
  return { comparisons: residuals.length,
    maxTranslationResidual: residuals.reduce((max, value) => Math.max(max, value), 0),
    phases: PHASES, frozenQueriesPerStation: { local: 18, wide: 25 } };
}

function representative(rows, shape, phase, station) {
  const row = rows.find(entry => entry.shape === shape && entry.phase === phase && entry.station === station);
  if (!row) return null;
  return {
    selectionRule: 'Named in task before this attribution run; retained without listening or outcome-based selection.',
    shape, phase, station,
    analyticWinner: row.wide.analyticFinalWinner,
    productionWinner: row.wide.productionFinalWinner,
    analyticMargin: row.wide.analyticMargin,
    firstProductionWrongStage: row.wide.firstProductionWrongStage,
    raw: row.wide.raw,
    weighted: row.wide.weighted,
    final: row.wide.final
  };
}

function marginSummary(entries) {
  const ordered = [...entries].sort((a, b) => a.margin - b.margin);
  const values = ordered.map(entry => entry.margin);
  const bins = Array.from({ length: 10 }, (_, index) => {
    const start = Math.floor(index * ordered.length / 10);
    const end = Math.floor((index + 1) * ordered.length / 10);
    const items = ordered.slice(start, end);
    return { decile: index + 1, count: items.length,
      margin: { min: items[0]?.margin ?? null, max: items.at(-1)?.margin ?? null },
      firstWrongStage: counts(items, entry => entry.cFirstWrongStage),
      attribution: counts(items, entry => entry.rawClass || entry.weightedClass || 'MIXED / COMPOUND') };
  });
  return {
    count: values.length,
    all: describe(values),
    byAttribution: valueStatsByClass(entries, entry => entry.rawClass || entry.weightedClass
      || 'MIXED / COMPOUND', entry => entry.margin),
    byFirstWrongStage: valueStatsByClass(entries, entry => entry.cFirstWrongStage, entry => entry.margin),
    equalCountDecilesAscending: bins,
    maximumMarginCase: ordered.at(-1) ? {
      shape: ordered.at(-1).row.shape, phase: ordered.at(-1).row.phase,
      station: ordered.at(-1).row.station, margin: ordered.at(-1).margin,
      firstWrongStage: ordered.at(-1).cFirstWrongStage,
      class: ordered.at(-1).rawClass || ordered.at(-1).weightedClass
    } : null
  };
}

function classifyStage(target, a, b, c, bValues) {
  if (a !== target) return 'MIXED / COMPOUND';
  if (b === target && c !== target) return 'WRITER/STORAGE-SUFFICIENT';
  if (b !== target && c === target) return 'READER-FAILURE PARTLY RESTORED BY WRITER';
  if (b !== target && c !== target && topTieIndices(bValues).includes(target)) {
    return 'B TOP TIE / AMBIGUOUS';
  }
  if (b !== target && c !== target) return 'READER-SUFFICIENT';
  return 'NO QUALITATIVE FAILURE';
}

function topTieIndices(values) {
  const maximum = Math.max(...values);
  return values.flatMap((value, index) => value === maximum ? [index] : []);
}

function topTieOffsets(values) {
  return topTieIndices(values).map(index => OFFSETS[index]);
}

function classify(signA, signB, signC) {
  if (signB === signA && signC === -signA) return 'WRITER/STORAGE-SUFFICIENT';
  if (signB === -signA && signC === signA) return 'READER-FAILURE PARTLY RESTORED BY WRITER';
  if (signB === -signA && signC === -signA) return 'READER-SUFFICIENT';
  return 'MIXED / COMPOUND';
}

function classifyLocalOutcome(signA, signB, signC) {
  if (signB === signA && signC === signA) return 'NO QUALITATIVE FAILURE';
  if (signB === signA && signC === -signA) return 'WRITER/STORAGE-SUFFICIENT';
  if (signB === -signA && signC === signA) return 'READER-FAILURE PARTLY RESTORED BY WRITER';
  if (signB === -signA && signC === -signA) return 'READER-SUFFICIENT';
  return 'MIXED / COMPOUND';
}

function firstWrongStage(wide, target) {
  for (const [name, order] of [
    ['rawMaximum', wide.rawOrder], ['maximum', wide.weightedOrder],
    ['hillResponse', wide.hillOrder], ['confidenceDirectionalScore', wide.scoreOrder]
  ]) if (order[0] !== target) return name;
  return null;
}

function categoryTable(entries, group, classifyEntry) {
  const groups = new Map();
  for (const entry of entries) {
    const key = group(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return Object.fromEntries([...groups].sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([key, values]) => [key, { count: values.length, classes: causalCounts(values, classifyEntry) }]));
}

function causalCounts(entries, group) {
  const result = Object.fromEntries(CAUSAL_CLASSES.map(name => [name, 0]));
  for (const entry of entries) {
    const key = group(entry);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function causalCountsWithAgreement(entries, group) {
  const result = Object.fromEntries([...CAUSAL_CLASSES, 'NO QUALITATIVE FAILURE'].map(name => [name, 0]));
  for (const entry of entries) {
    const key = group(entry);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function valueStatsByClass(entries, group, value) {
  const groups = new Map();
  for (const entry of entries) {
    const key = String(group(entry));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value(entry));
  }
  return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => [key, describe(values)]));
}

function relationshipSummary(entries) {
  const reader = entries.map(entry => entry.reader);
  const writer = entries.map(entry => entry.writer);
  const total = entries.map(entry => entry.total);
  let opposing = 0, reinforcing = 0, oneZero = 0, writerReducesReaderError = 0;
  for (const entry of entries) {
    if (entry.reader * entry.writer < 0) opposing += 1;
    else if (entry.reader * entry.writer > 0) reinforcing += 1;
    else oneZero += 1;
    if (Math.abs(entry.total) < Math.abs(entry.reader)) writerReducesReaderError += 1;
  }
  return { count: entries.length, reader, writer, total, opposing, reinforcing, oneZero,
    writerReducesReaderError, writerEnlargesReaderError: entries.length - writerReducesReaderError };
}

function componentStats(relationship) {
  return {
    count: relationship.count,
    readerError: describe(relationship.reader),
    writerError: describe(relationship.writer),
    totalError: describe(relationship.total),
    pairedDirection: {
      bothNonzero: relationship.opposing + relationship.reinforcing,
      opposing: relationship.opposing,
      reinforcing: relationship.reinforcing,
      eitherZero: relationship.oneZero
    },
    writerReducesReaderError: relationship.writerReducesReaderError,
    writerEnlargesReaderError: relationship.writerEnlargesReaderError
  };
}

function counts(entries, group) {
  const result = {};
  for (const entry of entries) {
    const key = String(group(entry));
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function componentRelation(reader, writer, total) {
  return {
    direction: reader * writer < 0 ? 'opposing' : reader * writer > 0 ? 'reinforcing' : 'one-zero',
    writerReducesReaderError: Math.abs(total) < Math.abs(reader)
  };
}

function sign(value, tolerance) { return value > tolerance ? 1 : value < -tolerance ? -1 : 0; }
function rank(values) {
  return values.map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index).map(entry => entry.index);
}
function rankPositions(order) {
  return order.reduce((positions, index, rankIndex) => {
    positions[index] = rankIndex + 1;
    return positions;
  }, []);
}
function hill(value, halfSaturation) {
  const normalized = (value / halfSaturation) ** 3;
  return normalized / (1 + normalized);
}
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function describe(values) {
  if (!values.length) return { count: 0, signedMean: null, mae: null, rms: null,
    min: null, p50: null, p90: null, p95: null, p99: null, max: null, maxAbs: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const at = probability => sorted[Math.round((sorted.length - 1) * probability)];
  return { count: values.length, signedMean: mean,
    mae: values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length,
    rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length),
    min: sorted[0], p50: at(0.5), p90: at(0.9), p95: at(0.95), p99: at(0.99),
    max: sorted.at(-1), maxAbs: values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const input = process.argv[2] || 'docs/ant/evidence/2026-10-24-ant-field-writer-reader-failure-attribution/inputs/station-raw.json.gz';
  const output = process.argv[3] || 'docs/ant/evidence/2026-10-24-ant-field-writer-reader-failure-attribution/computed/abcs-attribution.json';
  const mainSha = process.argv[4] || '8c60e4bba3bd5b476300e90a2936bfebd1f831c2';
  const { result, rowPath, rowsHash } = writeEvidence(input, output, mainSha);
  console.log(JSON.stringify({ output: resolve(output), stageRows: rowPath, stageRowsSha256: rowsHash,
    localStable: result.local.stableSignFailures, localNearZero: result.local.nearZeroCases.count,
    wideRawMaximum: result.wide.rawMaximumFirstWrong, wideWeightedMaximum: result.wide.weightedMaximumFirstWrong,
    highMargin: result.wide.allMismatchMargins.all }, null, 2));
}
