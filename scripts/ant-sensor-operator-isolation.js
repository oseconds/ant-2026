import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const INPUT_SHA256 = '50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29';
const SOURCE_FILES = [
  'src/lib/agents/ant/AntController.js',
  'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/GasterDeposition.js'
];
const EXPECTED_SOURCE_HASHES = {
  'src/lib/agents/ant/AntController.js': 'e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04',
  'src/lib/agents/ant/PheromoneField.js': '412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd',
  'src/lib/agents/ant/GasterDeposition.js': '0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41'
};
const LOCAL_WEIGHTS = [0.25, 0.5, 0.25];
const WIDE_HALF_SATURATION = 0.035;
const WIDE_RESPONSE_EXPONENT = 3;
const TRAIL_SCORE_GAIN = 2.8;
const LOCAL_STEERING_LIMIT = 0.45;
const LOCAL_HALF_SATURATION = 0.018;
const LOCAL_RESPONSE_EXPONENT = 3;
const SENSOR_RANK_PENALTY = 0.55;
const WIDE_OFFSETS = [-0.92, -0.47, 0, 0.47, 0.92];
const TIE_EPSILON = 64 * Number.EPSILON;

export function localStages(samples) {
  if (!Array.isArray(samples) || samples.length !== 18 || !samples.every(Number.isFinite)) {
    throw new TypeError('Local sensor requires 18 finite raw samples in production call order.');
  }
  const profiles = [0, 1].map(distanceIndex => [0, 1, 2].map(sideIndex => {
    const start = distanceIndex * 9 + sideIndex * 3;
    return samples.slice(start, start + 3).reduce((sum, value, index) =>
      sum + value * LOCAL_WEIGHTS[index], 0);
  }));
  const [left, center, right] = profiles[0].map((value, index) =>
    (value + profiles[1][index]) * 0.5);
  const peaks = profiles.map(profile => Math.max(...profile));
  const strengthInput = Math.sqrt(peaks[0] * peaks[1]);
  const strength = hillResponse(strengthInput, LOCAL_HALF_SATURATION, LOCAL_RESPONSE_EXPONENT);
  const coherence = Math.min(...profiles.map(profile => {
    const peak = Math.max(...profile), floor = Math.min(...profile);
    const split = Math.max(0, Math.min(profile[0], profile[2]) - profile[1]);
    return (peak - floor) / (peak + 1e-9) * (1 - split / (peak + 1e-9));
  }));
  const balanceNumerator = right - left;
  const balanceDenominator = left + center + right + 1e-9;
  const balance = balanceNumerator / balanceDenominator;
  return {
    profiles, peaks, strengthInput, left, center, right,
    strength, coherence, balanceNumerator, balanceDenominator, balance,
    steering: LOCAL_STEERING_LIMIT * balance * strength
  };
}

export function evaluateWide(candidates, geometries) {
  if (!Array.isArray(candidates) || candidates.length !== WIDE_OFFSETS.length
    || !Array.isArray(geometries) || geometries.length !== candidates.length) {
    throw new TypeError('Wide sensor requires the five frozen production candidates.');
  }
  const stages = candidates.map((candidate, index) => {
    const geometry = geometries[index];
    if (candidate.offset !== WIDE_OFFSETS[index] || geometry.offset !== candidate.offset
      || candidate.raw.length !== 5 || geometry.reads.length !== 5) {
      throw new TypeError('Wide candidate order or five-sample query geometry changed.');
    }
    const rawMaximum = Math.max(...candidate.raw);
    const weighted = candidate.raw.map((value, sampleIndex) =>
      value * geometry.reads[sampleIndex].weight);
    const maximum = Math.max(...weighted);
    const response = hillResponse(maximum, WIDE_HALF_SATURATION, WIDE_RESPONSE_EXPONENT);
    const rawWinner = argMax(candidate.raw);
    const weightedWinner = argMax(weighted);
    return {
      offset: candidate.offset,
      raw: candidate.raw,
      rawMaximum,
      rawWinner,
      weights: geometry.reads.map(read => read.weight),
      weighted,
      maximum,
      weightedWinner,
      response,
      trailScore: response * TRAIL_SCORE_GAIN
    };
  });
  const responses = stages.map(candidate => candidate.response);
  const confidence = Math.max(...responses) - Math.min(...responses);
  for (const candidate of stages) {
    candidate.directionalPenalty = (Math.cos(candidate.offset) - 1)
      * confidence * SENSOR_RANK_PENALTY;
    candidate.score = candidate.trailScore + candidate.directionalPenalty;
  }
  return stages;
}

export function rank(values) {
  const ordered = values.map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index);
  return ordered.map(entry => entry.index);
}

export function runAttribution(rows, { mainSha, sourceHashes = {} } = {}) {
  if (!Array.isArray(rows) || rows.length !== 5544) {
    throw new TypeError(`Expected the frozen 5,544-row analytic cohort; got ${rows?.length}.`);
  }
  const localError = Object.fromEntries([
    'raw', 'profiles', 'left', 'center', 'right', 'strengthInput', 'strength',
    'coherence', 'balanceNumerator', 'balanceDenominator', 'balance', 'steering'
  ].map(name => [name, []]));
  const localFailures = [];
  const localStageRows = [];
  const localCueCounts = {};
  const cueCountsByShape = {};
  const signFailuresByShape = {};
  const localByShape = {};
  const localStageDivergence = {
    rawSampleSideMean: 0, profileBandWeighting: 0, twoDepthPooling: 0,
    unexplained: 0
  };
  const rawDirectionAgreement = {
    count: 0, referenceRawSideMeanAgreesWithAnalyticSteering: 0,
    productionRawSideMeanAgreesWithAnalyticSteering: 0
  };
  const steeringComponents = {
    balance: [], strength: [], balanceNumerator: [], balanceDenominator: [], signedNet: []
  };
  const signFailureSupport = { reference: [], production: [] };
  let productionCueLostToZero = 0;
  const exactLocalParity = { branches: 0, comparisons: 0, mismatches: 0, maxAbsError: 0 };
  const cueMedians = Object.fromEntries([...new Set(rows.map(row => row.shape))].map(shape => {
    const values = rows.filter(row => row.shape === shape)
      .map(row => Math.abs(row.localReference.steering))
      .filter(value => value > TIE_EPSILON);
    return [shape, values.length ? stats(values).p50 : 0];
  }));

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const reference = localStages(row.localReferenceRaw);
    const production = localStages(row.localProductionRaw);
    for (const [branch, actual, expected] of [
      ['reference', reference, row.localReference], ['production', production, row.localProduction]
    ]) {
      exactLocalParity.branches += 1;
      for (const key of ['left', 'center', 'right', 'strength', 'coherence', 'balance', 'steering']) {
        const difference = actual[key] - expected[key];
        exactLocalParity.comparisons += 1;
        exactLocalParity.maxAbsError = Math.max(exactLocalParity.maxAbsError, Math.abs(difference));
        if (actual[key] !== expected[key]) exactLocalParity.mismatches += 1;
      }
    }
    const rawDelta = row.localProductionRaw.map((value, i) => value - row.localReferenceRaw[i]);
    localError.raw.push(...rawDelta);
    const shapeErrors = localByShape[row.shape] ||= Object.fromEntries([
      'raw', 'profiles', 'left', 'center', 'right', 'strengthInput', 'strength', 'coherence',
      'balanceNumerator', 'balanceDenominator', 'balance', 'steering'
    ].map(name => [name, []]));
    shapeErrors.raw.push(...rawDelta);
    for (let depth = 0; depth < 2; depth += 1) {
      for (let side = 0; side < 3; side += 1) {
        const difference = production.profiles[depth][side] - reference.profiles[depth][side];
        localError.profiles.push(difference);
        shapeErrors.profiles.push(difference);
      }
    }
    for (const key of ['left', 'center', 'right', 'strengthInput', 'strength', 'coherence',
      'balanceNumerator', 'balanceDenominator', 'balance', 'steering']) {
      localError[key].push(production[key] - reference[key]);
      if (key in shapeErrors) shapeErrors[key].push(production[key] - reference[key]);
    }

    const scale = Math.max(1, ...row.localReferenceRaw.map(Math.abs),
      ...row.localProductionRaw.map(Math.abs));
    const tolerance = TIE_EPSILON * scale;
    const cueClass = cueClassification(row.localReference.steering, tolerance, cueMedians[row.shape]);
    localCueCounts[cueClass] = (localCueCounts[cueClass] || 0) + 1;
    const shapeCueCounts = cueCountsByShape[row.shape] ||= { ambiguous: 0, weak: 0, clear: 0 };
    shapeCueCounts[cueClass] += 1;

    const rawDepthContrasts = [0, 1].map(depth => {
      const start = depth * 9;
      const left = mean(row.localReferenceRaw.slice(start, start + 3));
      const right = mean(row.localReferenceRaw.slice(start + 6, start + 9));
      const productionLeft = mean(row.localProductionRaw.slice(start, start + 3));
      const productionRight = mean(row.localProductionRaw.slice(start + 6, start + 9));
      return { reference: right - left, production: productionRight - productionLeft };
    });
    const rawMeanContrastReference = mean(rawDepthContrasts.map(value => value.reference));
    const rawMeanContrastProduction = mean(rawDepthContrasts.map(value => value.production));
    if (cueClass !== 'ambiguous') {
      rawDirectionAgreement.count += 1;
      if (sign(rawMeanContrastReference, tolerance)
        === sign(row.localReference.steering, tolerance)) {
        rawDirectionAgreement.referenceRawSideMeanAgreesWithAnalyticSteering += 1;
      }
      if (sign(rawMeanContrastProduction, tolerance)
        === sign(row.localReference.steering, tolerance)) {
        rawDirectionAgreement.productionRawSideMeanAgreesWithAnalyticSteering += 1;
      }
    }
    const steeringSignMismatch = Math.sign(row.localReference.steering)
      * Math.sign(row.localProduction.steering) < 0;
    const stableOpposite = sign(row.localReference.steering, tolerance)
      * sign(row.localProduction.steering, tolerance) < 0;
    if (cueClass !== 'ambiguous' && sign(row.localProduction.steering, tolerance) === 0) {
      productionCueLostToZero += 1;
    }
    const localStage = {
      rowIndex, shape: row.shape, phase: row.phase, station: row.station,
      cueClass, steeringSignMismatch, stableOpposite,
      rawSideMeanContrasts: rawDepthContrasts,
      reference: localStageValues(reference), production: localStageValues(production),
      firstDivergence: null
    };
    localStageRows.push(localStage);
    if (!steeringSignMismatch) continue;

    const referenceRawSigns = rawDepthContrasts.map(value => sign(value.reference, tolerance));
    const productionRawSigns = rawDepthContrasts.map(value => sign(value.production, tolerance));
    const referenceProfileContrasts = reference.profiles.map(profile => profile[2] - profile[0]);
    const productionProfileContrasts = production.profiles.map(profile => profile[2] - profile[0]);
    const referenceProfileSigns = referenceProfileContrasts.map(value => sign(value, tolerance));
    const productionProfileSigns = productionProfileContrasts.map(value => sign(value, tolerance));
    let firstDivergence;
    if (!same(referenceRawSigns, productionRawSigns)) firstDivergence = 'rawSampleSideMean';
    else if (!same(referenceProfileSigns, productionProfileSigns)) firstDivergence = 'profileBandWeighting';
    else if (sign(reference.balanceNumerator, tolerance)
      !== sign(production.balanceNumerator, tolerance)) firstDivergence = 'twoDepthPooling';
    else firstDivergence = 'unexplained';
    localStageDivergence[firstDivergence] += 1;

    const meanStrength = (reference.strength + production.strength) * 0.5;
    const meanBalance = (reference.balance + production.balance) * 0.5;
    const balanceContribution = LOCAL_STEERING_LIMIT
      * (production.balance - reference.balance) * meanStrength;
    const strengthContribution = LOCAL_STEERING_LIMIT
      * (production.strength - reference.strength) * meanBalance;
    const meanInverseDenominator = 0.5 * (1 / reference.balanceDenominator + 1 / production.balanceDenominator);
    const meanNumerator = 0.5 * (reference.balanceNumerator + production.balanceNumerator);
    const numeratorContribution = LOCAL_STEERING_LIMIT * meanStrength
      * (production.balanceNumerator - reference.balanceNumerator) * meanInverseDenominator;
    const denominatorContribution = LOCAL_STEERING_LIMIT * meanStrength * meanNumerator
      * (1 / production.balanceDenominator - 1 / reference.balanceDenominator);
    steeringComponents.balance.push(balanceContribution);
    steeringComponents.strength.push(strengthContribution);
    steeringComponents.balanceNumerator.push(numeratorContribution);
    steeringComponents.balanceDenominator.push(denominatorContribution);
    steeringComponents.signedNet.push(production.steering - reference.steering);
    signFailureSupport.reference.push(reference.balanceDenominator);
    signFailureSupport.production.push(production.balanceDenominator);
    localStage.firstDivergence = firstDivergence;
    signFailuresByShape[row.shape] ||= { count: 0, firstDivergence: {} };
    signFailuresByShape[row.shape].count += 1;
    const shapeFirst = signFailuresByShape[row.shape].firstDivergence;
    shapeFirst[firstDivergence] = (shapeFirst[firstDivergence] || 0) + 1;
    localFailures.push({
      shape: row.shape, phase: row.phase, station: row.station,
      referenceSteering: row.localReference.steering,
      productionSteering: row.localProduction.steering,
      referenceRawDepthContrasts: rawDepthContrasts.map(value => value.reference),
      productionRawDepthContrasts: rawDepthContrasts.map(value => value.production),
      referenceProfileContrasts, productionProfileContrasts,
      referenceBalanceNumerator: reference.balanceNumerator,
      productionBalanceNumerator: production.balanceNumerator,
      referenceStrength: reference.strength, productionStrength: production.strength,
      referenceBalanceDenominator: reference.balanceDenominator,
      productionBalanceDenominator: production.balanceDenominator,
      firstDivergence, cueClass,
      productionNearZero: Math.abs(row.localProduction.steering) <= tolerance
    });
  }

  const wide = analyzeWide(rows);
  const mirror = mirrorSummary(rows);
  const straight = straightSummary(rows);
  return {
    schema: 'ant-sensor-operator-isolation/v1',
    metadata: {
      mainSha: mainSha || null,
      analyticReferenceBranch: 'codex/ant-field-analytic-reference-20261023',
      analyticReferenceCommit: '2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa',
      analyticAttributionSha256: '1b60936621c0a2c3fa352763c0d6950615d630ea46bb5f0015284c83d148a6b9',
      analyticScriptSha256: '1a9ba25d6e128a67c3795f6cb1b97bf1ee3e62ee38c8d71d893141ccce9fea2e',
      rawInputSha256: INPUT_SHA256,
      rowCount: rows.length,
      shapes: [...new Set(rows.map(row => row.shape))],
      phases: [...new Set(rows.map(row => row.phase))],
      stationsPerShapePhase: 231,
      sourceHashes,
      sensorConstants: {
        localWeights: LOCAL_WEIGHTS, localHalfSaturation: LOCAL_HALF_SATURATION,
        localResponseExponent: LOCAL_RESPONSE_EXPONENT, localSteeringLimit: LOCAL_STEERING_LIMIT,
        wideHalfSaturation: WIDE_HALF_SATURATION, wideResponseExponent: WIDE_RESPONSE_EXPONENT,
        wideOffsets: WIDE_OFFSETS, trailScoreGain: TRAIL_SCORE_GAIN,
        directionalPenalty: '0.55 * (cos(offset)-1) * responseRange'
      },
      geometry: 'Uses saved analytic-reference raw samples and exact saved local/wide queries. No route, query, RNG or movement is regenerated.'
    },
    local: {
      interpretation: 'Per-sample and stage errors compare production raw samples against continuous-reference raw samples under identical frozen geometry.',
      error: Object.fromEntries(Object.entries(localError).map(([key, values]) => [key, stats(values)])),
      byShape: Object.fromEntries(Object.entries(localByShape).map(([shape, values]) => [shape, {
        errors: Object.fromEntries(Object.entries(values).map(([key, entries]) => [key, stats(entries)])),
        cueCounts: cueCountsByShape[shape],
        signFailures: signFailuresByShape[shape] || { count: 0, firstDivergence: {} }
      }])),
      errorContraction: {
        rawToProfileMaeRatio: safeRatio(mae(localError.profiles), mae(localError.raw)),
        rawToLcrMaeRatio: safeRatio(mean(['left', 'center', 'right'].map(key => mae(localError[key]))), mae(localError.raw)),
        note: 'Raw, profile and L/C/R errors share field-value units. Strength, coherence, balance and steering have distinct units/scales and are reported separately.'
      },
      cueGeometry: {
        classification: 'ambiguous when analytic steering is within 64*Number.EPSILON*max(1, local raw magnitude); weak is above that precision floor and no larger than the shape-local median non-ambiguous analytic |steering|; clear is above that median.',
        precisionMultiplier: 64,
        counts: localCueCounts,
        countsByShape: cueCountsByShape,
        productionCueLostToZero,
        rawSideMeanAgreement: rawDirectionAgreement
      },
      signFailures: {
        count: localFailures.length,
        stableOppositeCount: localFailures.filter(row => !row.productionNearZero).length,
        productionNearZeroCount: localFailures.filter(row => row.productionNearZero).length,
        firstDivergenceCounts: localStageDivergence,
        balanceStrengthExactDeltaContribution: {
          balance: stats(steeringComponents.balance),
          balanceNumerator: stats(steeringComponents.balanceNumerator),
          balanceDenominator: stats(steeringComponents.balanceDenominator),
          strength: stats(steeringComponents.strength),
          signedNet: stats(steeringComponents.signedNet),
          supportDenominator: {
            reference: stats(signFailureSupport.reference),
            production: stats(signFailureSupport.production)
          },
          maxReconstructionResidual: maxAbs(steeringComponents.signedNet.map((value, index) =>
            value - steeringComponents.balance[index] - steeringComponents.strength[index])),
          maxBalanceRatioReconstructionResidual: maxAbs(steeringComponents.balance.map((value, index) =>
            value - steeringComponents.balanceNumerator[index] - steeringComponents.balanceDenominator[index]))
        },
      rows: localFailures
      },
      exactProductionParity: exactLocalParity,
      mirror,
      straight
    },
    wide: wide.summary,
    stageRows: { local: localStageRows, wide: wide.stageRows }
  };
}

function analyzeWide(rows) {
  const metricErrors = { rawMaximum: [], weightedMaximum: [], response: [], confidence: [], score: [] };
  const parity = { candidates: 0, fields: 0, mismatches: 0, maxAbsError: 0 };
  const stageRows = [];
  const byShape = {};
  let eligible = 0;
  const firstDivergence = { rawTransverseOrder: 0, weightedMaxOrder: 0,
    hillOrder: 0, confidenceDirectionalScore: 0, unclassified: 0 };
  const firstProductionWrong = { rawMaximum: 0, weightedMax: 0, hillResponse: 0,
    confidenceDirectionalScore: 0, unclassified: 0 };
  const hillErrorGain = [], hillTopGapGain = [];
  let rankChangeRows = 0, transverseArgmaxChanges = 0;
  let scoreChangesReference = 0, scoreChangesProduction = 0;
  const allMargins = [], mismatchMargins = [], productionMargins = [];
  const mismatchRows = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const reference = evaluateWide(row.wideReference, row.wideGeometry);
    const production = evaluateWide(row.wideProduction, row.wideGeometry);
    const referenceScores = reference.map(candidate => candidate.score);
    const productionScores = production.map(candidate => candidate.score);
    const referenceRanks = ranks(referenceScores), productionRanks = ranks(productionScores);
    const referenceOrder = rank(referenceScores), productionOrder = rank(productionScores);
    const referenceWinner = referenceOrder[0];
    const productionWinner = productionOrder[0];
    const referenceMargin = referenceScores[referenceOrder[0]] - referenceScores[referenceOrder[1]];
    const productionMargin = productionScores[productionOrder[0]] - productionScores[productionOrder[1]];

    for (let index = 0; index < 5; index += 1) {
      const savedReference = row.wideReference[index];
      const savedProduction = row.wideProduction[index];
      for (const [actual, saved] of [
        [reference[index].maximum, savedReference.maximum],
        [reference[index].response, savedReference.response],
        [reference[index].score, savedReference.score],
        [production[index].maximum, savedProduction.maximum],
        [production[index].response, savedProduction.response],
        [production[index].score, savedProduction.score]
      ]) {
        const difference = actual - saved;
        parity.fields += 1;
        parity.maxAbsError = Math.max(parity.maxAbsError, Math.abs(difference));
        if (actual !== saved) parity.mismatches += 1;
      }
      parity.candidates += 1;
      if (reference[index].weightedWinner !== production[index].weightedWinner) transverseArgmaxChanges += 1;
      metricErrors.rawMaximum.push(production[index].rawMaximum - reference[index].rawMaximum);
      metricErrors.weightedMaximum.push(production[index].maximum - reference[index].maximum);
      metricErrors.response.push(production[index].response - reference[index].response);
      hillErrorGain.push(hillRelativeGain(reference[index].maximum, production[index].maximum));
    }
    const referenceConfidence = range(reference.map(candidate => candidate.response));
    const productionConfidence = range(production.map(candidate => candidate.response));
    const savedReferenceRanks = row.referenceRanks;
    const savedProductionRanks = row.productionRanks;
    const savedReferenceWinner = WIDE_OFFSETS.indexOf(row.referenceWinner);
    const savedProductionWinner = WIDE_OFFSETS.indexOf(row.productionWinner);
    const referenceScoreOnly = reference.map(candidate => candidate.trailScore);
    const productionScoreOnly = production.map(candidate => candidate.trailScore);
    if (rank(referenceScoreOnly)[0] !== referenceWinner) scoreChangesReference += 1;
    if (rank(productionScoreOnly)[0] !== productionWinner) scoreChangesProduction += 1;
    metricErrors.confidence.push(productionConfidence - referenceConfidence);
    for (let i = 0; i < 5; i += 1) metricErrors.score.push(productionScores[i] - referenceScores[i]);

    const stageRanks = {
      raw: [rank(reference.map(candidate => candidate.rawMaximum)), rank(production.map(candidate => candidate.rawMaximum))],
      weighted: [rank(reference.map(candidate => candidate.maximum)), rank(production.map(candidate => candidate.maximum))],
      hill: [rank(reference.map(candidate => candidate.response)), rank(production.map(candidate => candidate.response))],
      final: [referenceRanks, productionRanks]
    };
    const stageOrder = same(stageRanks.raw[0], stageRanks.raw[1]) ?
      same(stageRanks.weighted[0], stageRanks.weighted[1]) ?
        same(stageRanks.hill[0], stageRanks.hill[1]) ?
          same(stageRanks.final[0], stageRanks.final[1]) ? 'unclassified' : 'confidenceDirectionalScore'
          : 'hillOrder'
        : 'weightedMaxOrder'
      : 'rawTransverseOrder';
    const referenceUnique = row.referenceWinnerUnique === true;
    const winnerMismatch = referenceUnique && referenceWinner !== productionWinner;
    const productionStageWinners = {
      rawMaximum: rank(production.map(candidate => candidate.rawMaximum))[0],
      weightedMax: rank(production.map(candidate => candidate.maximum))[0],
      hillResponse: rank(production.map(candidate => candidate.response))[0],
      confidenceDirectionalScore: productionWinner
    };
    const productionFirstWrong = winnerMismatch
      ? Object.entries(productionStageWinners).find(([, winner]) => winner !== referenceWinner)?.[0]
        || 'unclassified'
      : null;
    const shapeCounts = byShape[row.shape] ||= {
      total: 0, strictUniqueAnalytic: 0, mismatches: 0,
      firstRankOrderDivergence: { rawTransverseOrder: 0, weightedMaxOrder: 0,
        hillOrder: 0, confidenceDirectionalScore: 0, unclassified: 0 },
      firstProductionWrong: { rawMaximum: 0, weightedMax: 0, hillResponse: 0,
        confidenceDirectionalScore: 0, unclassified: 0 }
    };
    shapeCounts.total += 1;
    stageRows.push({
      rowIndex, shape: row.shape, phase: row.phase, station: row.station,
      reference: {
        candidates: serializeWideStages(reference),
        confidence: referenceConfidence,
        ranksByCandidate: {
          rawMaximum: ranks(reference.map(candidate => candidate.rawMaximum)),
          weightedMaximum: ranks(reference.map(candidate => candidate.maximum)),
          hillResponse: ranks(reference.map(candidate => candidate.response)),
          finalScore: referenceRanks
        },
        candidateOrder: [
          { stage: 'rawMaximum', order: stageRanks.raw[0] },
          { stage: 'weightedMaximum', order: stageRanks.weighted[0] },
          { stage: 'hillResponse', order: stageRanks.hill[0] },
          { stage: 'finalScore', order: stageRanks.final[0].map((value, index) => ({ value, index }))
            .sort((a, b) => a.value - b.value).map(entry => entry.index) }
        ]
      },
      production: {
        candidates: serializeWideStages(production),
        confidence: productionConfidence,
        ranksByCandidate: {
          rawMaximum: ranks(production.map(candidate => candidate.rawMaximum)),
          weightedMaximum: ranks(production.map(candidate => candidate.maximum)),
          hillResponse: ranks(production.map(candidate => candidate.response)),
          finalScore: productionRanks
        },
        candidateOrder: [
          { stage: 'rawMaximum', order: stageRanks.raw[1] },
          { stage: 'weightedMaximum', order: stageRanks.weighted[1] },
          { stage: 'hillResponse', order: stageRanks.hill[1] },
          { stage: 'finalScore', order: stageRanks.final[1].map((value, index) => ({ value, index }))
            .sort((a, b) => a.value - b.value).map(entry => entry.index) }
        ]
      },
      firstRankOrderDivergence: stageOrder,
      analyticFinalWinner: WIDE_OFFSETS[referenceWinner],
      productionStageWinners: Object.fromEntries(Object.entries(productionStageWinners)
        .map(([stage, winner]) => [stage, WIDE_OFFSETS[winner]])),
      productionFirstWrongStage: productionFirstWrong,
      strictUniqueAnalyticWinner: referenceUnique,
      winnerMismatch
    });
    if (!same(savedReferenceRanks, referenceRanks)
      || !same(savedProductionRanks, productionRanks)
      || savedReferenceWinner !== referenceWinner || savedProductionWinner !== productionWinner) {
      throw new Error(`Wide saved parity failed at ${row.shape}/${row.phase}/${row.station}.`);
    }
    if (!same(referenceRanks, productionRanks)) rankChangeRows += 1;
    if (referenceUnique) {
      eligible += 1;
      shapeCounts.strictUniqueAnalytic += 1;
      allMargins.push(referenceMargin);
      productionMargins.push(productionMargin);
    }
    if (winnerMismatch) {
      firstDivergence[stageOrder] += 1;
      firstProductionWrong[productionFirstWrong] += 1;
      shapeCounts.mismatches += 1;
      shapeCounts.firstRankOrderDivergence[stageOrder] += 1;
      shapeCounts.firstProductionWrong[productionFirstWrong] += 1;
      mismatchMargins.push(referenceMargin);
      mismatchRows.push({
        shape: row.shape, phase: row.phase, station: row.station,
        analyticWinner: WIDE_OFFSETS[referenceWinner], productionWinner: WIDE_OFFSETS[productionWinner],
        analyticMargin: referenceMargin, productionMargin,
        analyticOrder: referenceOrder,
        productionOrder,
        firstRankOrderDivergence: stageOrder,
        productionFirstWrongStage: productionFirstWrong
      });
    }
    for (const pair of [reference, production]) {
      const top = rank(pair.map(candidate => candidate.maximum));
      const maxGap = pair[top[0]].maximum - pair[top[1]].maximum;
      const responseGap = pair[top[0]].response - pair[top[1]].response;
      if (maxGap > 0) hillTopGapGain.push(responseGap / (maxGap / WIDE_HALF_SATURATION));
    }
  }

  return {
    summary: {
    interpretation: 'Frozen analytic and production raw transverse samples pass through the exact saved five-candidate geometry. The rank score reproduces the prior deterministic field-only research score; it is not a stochastic AntController choice.',
    constants: { halfSaturation: WIDE_HALF_SATURATION, exponent: WIDE_RESPONSE_EXPONENT,
      trailScoreGain: TRAIL_SCORE_GAIN, directionalPenaltyGain: SENSOR_RANK_PENALTY },
    errors: Object.fromEntries(Object.entries(metricErrors).map(([key, values]) => [key, stats(values)])),
    exactProductionParity: parity,
    counts: {
      totalStationPhaseRows: rows.length,
      strictUniqueAnalyticWinners: eligible,
      strictUniqueWinnerMismatches: mismatchRows.length,
      strictUniqueWinnerMismatchRate: mismatchRows.length / eligible,
      fullCandidateOrderChanges: rankChangeRows,
      candidateWeightedTransverseArgmaxChanges: transverseArgmaxChanges,
      confidenceDirectionalPenaltyChangesReferenceWinner: scoreChangesReference,
      confidenceDirectionalPenaltyChangesProductionWinner: scoreChangesProduction
    },
    firstRankOrderDivergenceForStrictUniqueWinnerMismatches: firstDivergence,
    firstProductionWinnerDepartureFromAnalyticFinalWinner: {
      counts: firstProductionWrong,
      definition: 'Within each final strict-unique mismatch, compare the production winner at raw maxima, weighted max, Hill response and final score against the analytic final-score winner; record the first production stage that is already wrong.'
    },
    margins: {
      allStrictUniqueAnalyticWinners: stats(allMargins),
      strictUniqueMismatches: stats(mismatchMargins),
      strictUniqueAnalyticWinnersProductionMargin: stats(productionMargins),
      noPostHocStrata: 'Margins are continuous; exact/tied winners are excluded by the source strict-unique flag.'
    },
    hill: {
      responseErrorGainRelativeToInputNormalizedByHalfSaturation: stats(hillErrorGain),
      topGapGainRelativeToInputGapNormalizedByHalfSaturation: stats(hillTopGapGain),
      orderProperty: 'The positive-exponent Hill response is strictly increasing for nonnegative inputs; it preserves each branch candidate order. Any new rank order can arise only from the later confidence-dependent directional score, not Hill alone.'
    },
    mismatches: mismatchRows,
    byShape
    },
    stageRows
  };
}

function cueClassification(steering, tolerance, medianCue) {
  if (Math.abs(steering) <= tolerance) return 'ambiguous';
  return Math.abs(steering) <= medianCue ? 'weak' : 'clear';
}

function localStageValues(stage) {
  return {
    profiles: stage.profiles, peaks: stage.peaks, strengthInput: stage.strengthInput,
    left: stage.left, center: stage.center, right: stage.right,
    strength: stage.strength, coherence: stage.coherence,
    balanceNumerator: stage.balanceNumerator, balanceDenominator: stage.balanceDenominator,
    balance: stage.balance, steering: stage.steering
  };
}

function serializeWideStages(candidates) {
  return candidates.map(({ offset, rawMaximum, rawWinner, weighted, maximum,
    weightedWinner, response, trailScore, directionalPenalty, score }) => ({
    offset, rawMaximum, rawWinner, weighted, maximum, weightedWinner,
    response, trailScore, directionalPenalty, score
  }));
}

function mirrorSummary(rows) {
  const index = new Map(rows.map(row => [`${row.shape}|${row.phase}|${row.station}`, row]));
  const pairs = [];
  for (const [base, mirror] of [['gentle', 'gentleMirror'], ['tight', 'tightMirror']]) {
    for (const row of rows.filter(entry => entry.shape === base)) {
      const other = index.get(`${mirror}|${row.phase}|${row.station}`);
      if (!other) throw new Error(`Missing mirror row ${mirror}/${row.phase}/${row.station}.`);
      pairs.push({
        reference: row.localReference.steering + other.localReference.steering,
        production: row.localProduction.steering + other.localProduction.steering
      });
    }
  }
  return {
    pairCount: pairs.length,
    referenceMirrorSumError: stats(pairs.map(pair => pair.reference)),
    productionMirrorSumError: stats(pairs.map(pair => pair.production))
  };
}

function straightSummary(rows) {
  const selected = rows.filter(row => row.shape === 'straight');
  return {
    rows: selected.length,
    referenceSteering: stats(selected.map(row => row.localReference.steering)),
    productionSteeringByPhase: Object.fromEntries([...new Set(selected.map(row => row.phase))].map(phase => {
      const values = selected.filter(row => row.phase === phase).map(row => row.localProduction.steering);
      return [phase, stats(values)];
    }))
  };
}

function ranks(scores) {
  const order = rank(scores);
  return Array.from({ length: scores.length }, (_, index) => order.indexOf(index) + 1);
}

function hillResponse(signal, halfSaturation, exponent) {
  const normalized = (signal / halfSaturation) ** exponent;
  return normalized / (1 + normalized);
}

function hillRelativeGain(reference, production) {
  const inputDifference = Math.abs(production - reference) / WIDE_HALF_SATURATION;
  if (inputDifference === 0) return 0;
  return Math.abs(hillResponse(production, WIDE_HALF_SATURATION, WIDE_RESPONSE_EXPONENT)
    - hillResponse(reference, WIDE_HALF_SATURATION, WIDE_RESPONSE_EXPONENT)) / inputDifference;
}

function argMax(values) {
  let index = 0;
  for (let i = 1; i < values.length; i += 1) if (values[i] > values[index]) index = i;
  return index;
}

function sign(value, tolerance) { return value > tolerance ? 1 : value < -tolerance ? -1 : 0; }
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function range(values) { return Math.max(...values) - Math.min(...values); }
function mae(values) { return mean(values.map(Math.abs)); }
function maxAbs(values) { return Math.max(0, ...values.map(Math.abs)); }
function safeRatio(a, b) { return b === 0 ? null : a / b; }
function same(a, b) { return a.length === b.length && a.every((value, i) => value === b[i]); }

function stats(values) {
  if (!values.length) return { count: 0, mean: null, signedMean: null, mae: null, rms: null,
    min: null, p50: null, p95: null, p99: null, max: null, maxAbs: null };
  const sorted = [...values].sort((a, b) => a - b);
  const average = mean(values);
  return {
    count: values.length, mean: average, signedMean: average,
    mae: mean(values.map(Math.abs)), rms: Math.sqrt(mean(values.map(value => value * value))),
    min: sorted[0], p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99), max: sorted.at(-1), maxAbs: maxAbs(values)
  };
}

function quantile(sorted, probability) { return sorted[Math.round((sorted.length - 1) * probability)]; }
function fileHash(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

export function loadRows(inputPath) {
  const bytes = readFileSync(inputPath);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== INPUT_SHA256) throw new Error(`Frozen input SHA-256 mismatch: ${hash}.`);
  const rows = JSON.parse(gunzipSync(bytes));
  if (!Array.isArray(rows) || rows.length !== 5544) throw new Error('Frozen row count mismatch.');
  return rows;
}

export async function writeEvidence(inputPath, outputPath, mainSha) {
  const rows = loadRows(inputPath);
  const sourceHashes = Object.fromEntries(SOURCE_FILES.map(path => [path, fileHash(path)]));
  for (const path of SOURCE_FILES) {
    if (sourceHashes[path] !== EXPECTED_SOURCE_HASHES[path]) {
      throw new Error(`Production baseline source hash changed: ${path} ${sourceHashes[path]}.`);
    }
  }
  const result = runAttribution(rows, { mainSha, sourceHashes });
  const stageBytes = gzipSync(Buffer.from(JSON.stringify(result.stageRows)));
  result.metadata.stageRowsSha256 = createHash('sha256').update(stageBytes).digest('hex');
  const stagePath = resolve(dirname(outputPath), 'sensor-stage-rows.json.gz');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(stagePath, stageBytes);
  delete result.stageRows;
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const input = process.argv[2] || 'docs/ant/evidence/2026-10-24-ant-sensor-operator-isolation/inputs/station-raw.json.gz';
  const output = process.argv[3] || 'docs/ant/evidence/2026-10-24-ant-sensor-operator-isolation/computed/sensor-operator-attribution.json';
  const mainSha = process.argv[4] || '8c60e4bba3bd5b476300e90a2936bfebd1f831c2';
  const result = await writeEvidence(input, output, mainSha);
  console.log(JSON.stringify({
    output: resolve(output),
    local: {
      rawMae: result.local.error.raw.mae,
      steeringMae: result.local.error.steering.mae,
      signFailures: result.local.signFailures.count,
      firstDivergence: result.local.signFailures.firstDivergenceCounts
    },
    wide: {
      counts: result.wide.counts,
      firstDivergence: result.wide.firstRankOrderDivergenceForStrictUniqueWinnerMismatches
    }
  }, null, 2));
}
