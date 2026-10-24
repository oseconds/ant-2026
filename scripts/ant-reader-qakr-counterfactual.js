import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { basisSanity, qakrRead, QAKR_CONSTANTS } from './ant-reader-qakr.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT_DIR = 'docs/ant/evidence/2026-10-24-ant-raster-backed-fixture';
const OUTPUT_DIR = 'docs/ant/evidence/2026-10-24-ant-reader-qakr-counterfactual';
const BASELINE = '8c60e4bba3bd5b476300e90a2936bfebd1f831c2';
const PRIOR_ATTRIBUTION = 'ea3d382c6c849df7505e1d398cef085ca271c8b9';
const EXPECTED = Object.freeze({
  localQueries: 99_792, wideQueries: 138_600, rows: 5_544,
  analyticDirectional: 4_012, localStableFailures: 546, localReaderTarget: 335,
  localWriterControl: 211, localRestoration: 125, strictUnique: 5_072,
  productionFinalMismatch: 2_378, wideRawFirstWrong: 1_380, wideRawReaderTarget: 993,
  wideRawWriterControl: 328, wideRawBTie: 56, wideRawMixed: 3, wideWeightedFirstWrong: 998,
  wideWeightedReaderTarget: 841, wideWeightedWriterControl: 123, wideWeightedBTie: 34,
  wideFinalReaderSufficient: 2_039, wideFinalWriterSufficient: 249, wideFinalBTie: 90, wideRestoration: 598
});
const PRECISION_FACTOR = 64 * Number.EPSILON;
const LOCAL_HALF_SATURATION = 0.018;
const WIDE_HALF_SATURATION = 0.035;
const SCORE_GAIN = 2.8;
const TRAIL_EXPONENT = 3;
const STEERING_LIMIT = 0.45;
const PHASES = ['p00', 'p10', 'p01', 'p11'];

function sha256(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function pathInRepo(path) { return resolve(ROOT, path); }
function writeJson(path, value) {
  const target = pathInRepo(path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}
function writeGzipJson(path, value) {
  const target = pathInRepo(path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, gzipSync(Buffer.from(JSON.stringify(value)), { level: 9, mtime: 0 }));
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function exactCount(receipt, key, actual, expected) {
  receipt[key] = { actual, expected, passed: actual === expected };
}
function precisionSign(value) {
  const floor = PRECISION_FACTOR * Math.max(1, Math.abs(value));
  return Math.abs(value) <= floor ? 0 : Math.sign(value);
}
function trailResponse(signal, halfSaturation) {
  const normalized = (signal / halfSaturation) ** TRAIL_EXPONENT;
  return normalized / (1 + normalized);
}
function compareLocal(actual, expected) {
  return ['left', 'center', 'right', 'strength', 'coherence', 'balance', 'steering']
    .every(key => actual[key] === expected[key]);
}
function aggregateLocal(raw) {
  assert(raw.length === 18, `Local input must have 18 reads, got ${raw.length}.`);
  const profiles = [];
  for (let depth = 0; depth < 2; depth += 1) {
    const profile = [];
    for (let side = 0; side < 3; side += 1) {
      const start = depth * 9 + side * 3;
      let signal = 0;
      signal += raw[start] * 0.25;
      signal += raw[start + 1] * 0.5;
      signal += raw[start + 2] * 0.25;
      profile.push(signal);
    }
    profiles.push(profile);
  }
  const [left, center, right] = profiles[0].map((value, index) => (value + profiles[1][index]) * 0.5);
  const peaks = profiles.map(profile => Math.max(...profile));
  const strength = trailResponse(Math.sqrt(peaks[0] * peaks[1]), LOCAL_HALF_SATURATION);
  const coherence = Math.min(...profiles.map(profile => {
    const peak = Math.max(...profile);
    const floor = Math.min(...profile);
    const split = Math.max(0, Math.min(profile[0], profile[2]) - profile[1]);
    return (peak - floor) / (peak + 1e-9) * (1 - split / (peak + 1e-9));
  }));
  const balance = (right - left) / (left + center + right + 1e-9);
  return { left, center, right, strength, coherence, balance, steering: STEERING_LIMIT * balance * strength };
}
function maxInfo(values) {
  const maximum = Math.max(...values);
  const winners = [];
  for (let index = 0; index < values.length; index += 1) if (values[index] === maximum) winners.push(index);
  return { maximum, winners, index: winners[0] };
}
function evaluateWide(rawCandidates, geometry) {
  const candidates = rawCandidates.map((raw, index) => {
    const weighted = raw.map((value, sampleIndex) => value * geometry[index].reads[sampleIndex].weight);
    const rawMax = maxInfo(raw);
    const weightedMax = maxInfo(weighted);
    return {
      offset: geometry[index].offset,
      raw: raw.slice(),
      weighted,
      rawMaximum: rawMax.maximum,
      rawMaxWinnerIndex: rawMax.index,
      rawMaxTies: rawMax.winners,
      weightedMaximum: weightedMax.maximum,
      weightedWinnerIndex: weightedMax.index,
      weightedTies: weightedMax.winners,
      response: trailResponse(weightedMax.maximum, WIDE_HALF_SATURATION)
    };
  });
  const responses = candidates.map(candidate => candidate.response);
  const confidence = Math.max(...responses) - Math.min(...responses);
  for (const candidate of candidates) {
    candidate.score = candidate.response * SCORE_GAIN + (Math.cos(candidate.offset) - 1) * confidence * 0.55;
  }
  const rank = candidates.map((_, index) => index).sort((a, b) => candidates[b].score - candidates[a].score || a - b);
  return {
    candidates,
    confidence,
    rank,
    winnerIndex: rank[0],
    winner: candidates[rank[0]].offset,
    scoreMargin: candidates[rank[0]].score - candidates[rank[1]].score,
    rawWinner: candidates[maxInfo(candidates.map(candidate => candidate.rawMaximum)).index].offset,
    weightedWinner: candidates[maxInfo(candidates.map(candidate => candidate.weightedMaximum)).index].offset
  };
}
function rankVector(rank) {
  const result = new Array(rank.length);
  for (let place = 0; place < rank.length; place += 1) result[rank[place]] = place + 1;
  return result;
}
function qStats(values) {
  if (!values.length) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = q => sorted[Math.floor((sorted.length - 1) * q)];
  return { count: values.length, min: sorted[0], p10: quantile(0.1), median: quantile(0.5), p90: quantile(0.9), max: sorted.at(-1), mean: values.reduce((sum, value) => sum + value, 0) / values.length };
}
function newErrorAccumulator() { return { count: 0, signed: 0, absolute: 0, maximumAbsolute: 0, values: [] }; }
function addError(acc, reference, observed) {
  const error = observed - reference;
  acc.count += 1;
  acc.signed += error;
  acc.absolute += Math.abs(error);
  acc.maximumAbsolute = Math.max(acc.maximumAbsolute, Math.abs(error));
  acc.values.push(error);
}
function finishError(acc) {
  return { count: acc.count, signedMean: acc.count ? acc.signed / acc.count : 0, mae: acc.count ? acc.absolute / acc.count : 0, maxAbsolute: acc.maximumAbsolute };
}
function armMetrics() {
  return { local: newErrorAccumulator(), wide: newErrorAccumulator(), byRoute: {}, byPhase: {}, byRoutePhase: {}, byBoundary: { interior: newErrorAccumulator(), boundaryExposed: newErrorAccumulator() } };
}
function addRawMetric(acc, kind, shape, phase, boundary, a, observed) {
  addError(acc[kind], a, observed);
  addError((acc.byRoute[shape] ||= { local: newErrorAccumulator(), wide: newErrorAccumulator() })[kind], a, observed);
  addError((acc.byPhase[phase] ||= { local: newErrorAccumulator(), wide: newErrorAccumulator() })[kind], a, observed);
  const routePhase = `${shape}|${phase}`;
  addError((acc.byRoutePhase[routePhase] ||= { local: newErrorAccumulator(), wide: newErrorAccumulator() })[kind], a, observed);
  addError(acc.byBoundary[boundary ? 'boundaryExposed' : 'interior'], a, observed);
}
function finishRawMetrics(acc, kind) {
  const finishPair = group => Object.fromEntries(Object.entries(group).map(([key, pair]) => [key, finishError(pair[kind])]));
  return {
    [kind]: finishError(acc[kind]),
    byRoute: finishPair(acc.byRoute), byPhase: finishPair(acc.byPhase),
    byRoutePhase: finishPair(acc.byRoutePhase),
    byBoundary: Object.fromEntries(Object.entries(acc.byBoundary).map(([key, value]) => [key, finishError(value)]))
  };
}
function boundaryExposed(point) {
  const margin = QAKR_CONSTANTS.h / 2 + QAKR_CONSTANTS.radius;
  return point.x < margin || point.y < margin || point.x > 1 - margin || point.y > 1 - margin;
}
function statsForCategory(rows, keyFn) {
  const groups = {};
  for (const row of rows) {
    const key = keyFn(row);
    (groups[key] ||= []).push(row);
  }
  return Object.fromEntries(Object.entries(groups).map(([key, entries]) => [key, entries.length]));
}
function readFixture() {
  const base = pathInRepo(INPUT_DIR);
  const manifestBuffer = readFileSync(resolve(base, 'manifest.json'));
  const manifest = JSON.parse(manifestBuffer.toString('utf8'));
  const gz = readFileSync(resolve(base, 'inputs/station-raw.json.gz'));
  const uncompressed = gunzipSync(gz);
  const rows = JSON.parse(uncompressed.toString('utf8'));
  const sourceAbcsGz = readFileSync(resolve(pathInRepo(OUTPUT_DIR), 'inputs/source-abcs-stage-rows.json.gz'));
  const sourceAbcsUncompressed = gunzipSync(sourceAbcsGz);
  const sourceAbcsRows = JSON.parse(sourceAbcsUncompressed.toString('utf8'));
  const sourceHashes = manifest.provenance.productionSourceSha256;
  const sourceFiles = Object.keys(sourceHashes);
  const sourceCheck = sourceFiles.map(path => ({ path, expected: sourceHashes[path], actual: sha256(readFileSync(pathInRepo(path))) }));
  assert(sha256(gz) === manifest.provenance.inputDatasetSha256, 'Frozen compressed station input SHA does not match manifest.');
  assert(sha256(sourceAbcsGz) === 'a456a10a49445dbd54cd760ad7b371ffbdead6579777d2b05f89b0ddadd5678b', 'Frozen A/B/C stage-row source SHA differs from the cited attribution commit.');
  assert(sha256(uncompressed) === manifest.provenance.inputUncompressedSha256, 'Frozen uncompressed station input SHA does not match manifest.');
  assert(sourceCheck.every(item => item.actual === item.expected), 'Production source SHA differs from qualified raster manifest.');
  assert(rows.length === EXPECTED.rows, `Frozen row count mismatch: ${rows.length}.`);
  assert(sourceAbcsRows.length === rows.length, `Frozen A/B/C row count mismatch: ${sourceAbcsRows.length}.`);
  return { base, manifest, rows, sourceAbcsRows, sourceAbcsSha: sha256(sourceAbcsGz),
    gzSha: sha256(gz), uncompressedSha: sha256(uncompressed), sourceCheck };
}
function loadRasterArm(base, manifestEntry) {
  const bytes = readFileSync(resolve(base, manifestEntry.file));
  const actualSha = sha256(bytes);
  assert(bytes.length === manifestEntry.byteLength, `Raster length mismatch for ${manifestEntry.id}.`);
  assert(actualSha === manifestEntry.rasterSha256, `Raster SHA mismatch for ${manifestEntry.id}: ${actualSha}.`);
  const values = new Float32Array(manifestEntry.nodeCount);
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < values.length; index += 1) values[index] = data.getFloat32(index * 4, true);
  return { bytes, sha256: actualSha, values, width: manifestEntry.width, height: manifestEntry.height };
}
function cSample(raster, x, y) {
  const field = raster.cField;
  return field.sample(x, y);
}
function verifySavedAggregate(actual, expected, label, receipt) {
  for (const key of ['left', 'center', 'right', 'strength', 'coherence', 'balance', 'steering']) {
    receipt.comparisons += 1;
    if (actual[key] !== expected[key]) {
      receipt.nonExact += 1;
      if (!receipt.firstMismatch) receipt.firstMismatch = { label, key, actual: actual[key], expected: expected[key] };
    }
  }
}
function verifySavedWide(actual, expected, label, receipt) {
  for (let candidate = 0; candidate < expected.length; candidate += 1) {
    const a = actual.candidates[candidate];
    const e = expected[candidate];
    for (let sample = 0; sample < e.raw.length; sample += 1) {
      receipt.comparisons += 2;
      if (a.raw[sample] !== e.raw[sample]) {
        receipt.nonExact += 1;
        if (!receipt.firstMismatch) receipt.firstMismatch = { label, candidate, sample, field: 'raw', actual: a.raw[sample], expected: e.raw[sample] };
      }
      if (a.weighted[sample] !== e.weighted[sample]) {
        receipt.nonExact += 1;
        if (!receipt.firstMismatch) receipt.firstMismatch = { label, candidate, sample, field: 'weighted', actual: a.weighted[sample], expected: e.weighted[sample] };
      }
    }
    for (const [field, actualValue, expectedValue] of [
      ['weightedMaximum', a.weightedMaximum, e.maximum],
      ['response', a.response, e.response], ['score', a.score, e.score]
    ]) {
      receipt.comparisons += 1;
      if (actualValue !== expectedValue) {
        receipt.nonExact += 1;
        if (!receipt.firstMismatch) receipt.firstMismatch = { label, candidate, field, actual: actualValue, expected: expectedValue };
      }
    }
  }
}
function verifyPriorWideB(actual, prior, label, receipt) {
  for (let candidate = 0; candidate < 5; candidate += 1) {
    for (const [field, value, expected] of [
      ['rawMaximum', actual.candidates[candidate].rawMaximum, prior.wide.raw.B.values[candidate]],
      ['weightedMaximum', actual.candidates[candidate].weightedMaximum, prior.wide.weighted.B.values[candidate]],
      ['score', actual.candidates[candidate].score, prior.wide.final.B.scores[candidate]]
    ]) {
      receipt.comparisons += 1;
      if (value !== expected) {
        receipt.nonExact += 1;
        if (!receipt.firstMismatch) receipt.firstMismatch = { label, candidate, field, actual: value, expected };
      }
    }
  }
  for (const [field, value, expected] of [
    ['rawWinner', actual.rawWinner, prior.wide.raw.B.winner],
    ['weightedWinner', actual.weightedWinner, prior.wide.weighted.B.winner],
    ['finalWinner', actual.winner, prior.wide.final.B.winner]
  ]) {
    receipt.comparisons += 1;
    if (value !== expected) {
      receipt.nonExact += 1;
      if (!receipt.firstMismatch) receipt.firstMismatch = { label, field, actual: value, expected };
    }
  }
}

function buildABC(rows, sourceAbcsRows, rasters) {
  const queryParity = { local: { exact: 0, total: 0, firstMismatch: null }, wide: { exact: 0, total: 0, firstMismatch: null } };
  const sourceAbcsParity = { rowKeysExact: 0, localAExact: 0, localCExact: 0, wideAExact: 0, wideCExact: 0, firstMismatch: null };
  const sensorParity = { local: { comparisons: 0, nonExact: 0, firstMismatch: null }, wide: { comparisons: 0, nonExact: 0, firstMismatch: null } };
  const output = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const source = rows[rowIndex];
    const prior = sourceAbcsRows[rowIndex];
    const rowKeyExact = source.shape === prior.shape && source.phase === prior.phase && source.station === prior.station;
    sourceAbcsParity.rowKeysExact += rowKeyExact ? 1 : 0;
    if (!rowKeyExact && !sourceAbcsParity.firstMismatch) sourceAbcsParity.firstMismatch = { rowIndex, source: [source.shape, source.phase, source.station], prior: [prior.shape, prior.phase, prior.station] };
    assert(rowKeyExact, `Frozen A/B/C row association differs at ${rowIndex}.`);
    const raster = rasters.get(`${source.shape}|${source.phase}`);
    const localGeometry = source.localGeometry;
    const cLocalRaw = localGeometry.map((point, index) => {
      const value = cSample(raster, point.x, point.y);
      queryParity.local.total += 1;
      if (value === source.localProductionRaw[index]) queryParity.local.exact += 1;
      else if (!queryParity.local.firstMismatch) queryParity.local.firstMismatch = { shape: source.shape, phase: source.phase, station: source.station, index, value, frozen: source.localProductionRaw[index] };
      return value;
    });
    const aLocal = aggregateLocal(source.localReferenceRaw);
    const bLocalRaw = prior.local.raw.B;
    const cLocal = aggregateLocal(cLocalRaw);
    const stageLocalA = prior.local.raw.A;
    const stageLocalB = prior.local.raw.B;
    const stageLocalC = prior.local.raw.C;
    for (let index = 0; index < 18; index += 1) {
      for (const [arm, a, b] of [['A', stageLocalA[index], source.localReferenceRaw[index]], ['C', stageLocalC[index], source.localProductionRaw[index]]]) {
        if (a === b) sourceAbcsParity[arm === 'A' ? 'localAExact' : 'localCExact'] += 1;
        else if (!sourceAbcsParity.firstMismatch) sourceAbcsParity.firstMismatch = { rowIndex, arm: `local${arm}`, index, prior: a, source: b };
      }
    }
    verifySavedAggregate(aLocal, source.localReference, `${source.shape}|${source.phase}|${source.station}|A`, sensorParity.local);
    verifySavedAggregate(cLocal, source.localProduction, `${source.shape}|${source.phase}|${source.station}|C`, sensorParity.local);
    const bLocal = aggregateLocal(bLocalRaw);
    verifySavedAggregate(bLocal, prior.local.features.B, `${source.shape}|${source.phase}|${source.station}|B`, sensorParity.local);

    const wideGeometry = source.wideGeometry;
    const aWideRaw = source.wideReference.map(candidate => candidate.raw.slice());
    const bWideRaw = prior.wide.rawSamples.B.map(candidate => candidate.slice());
    for (let candidate = 0; candidate < 5; candidate += 1) for (let sample = 0; sample < 5; sample += 1) {
      const stageA = prior.wide.rawSamples.A[candidate][sample];
      const stageC = prior.wide.rawSamples.C[candidate][sample];
      if (stageA === source.wideReference[candidate].raw[sample]) sourceAbcsParity.wideAExact += 1;
      else if (!sourceAbcsParity.firstMismatch) sourceAbcsParity.firstMismatch = { rowIndex, arm: 'wideA', candidate, sample };
      if (stageC === source.wideProduction[candidate].raw[sample]) sourceAbcsParity.wideCExact += 1;
      else if (!sourceAbcsParity.firstMismatch) sourceAbcsParity.firstMismatch = { rowIndex, arm: 'wideC', candidate, sample };
    }
    const cWideRaw = wideGeometry.map((candidate, candidateIndex) => candidate.reads.map((point, sampleIndex) => {
      const value = cSample(raster, point.x, point.y);
      queryParity.wide.total += 1;
      const frozen = source.wideProduction[candidateIndex].raw[sampleIndex];
      if (value === frozen) queryParity.wide.exact += 1;
      else if (!queryParity.wide.firstMismatch) queryParity.wide.firstMismatch = { shape: source.shape, phase: source.phase, station: source.station, candidate: candidateIndex, sampleIndex, value, frozen };
      return value;
    }));
    const aWide = evaluateWide(aWideRaw, wideGeometry);
    const bWide = evaluateWide(bWideRaw, wideGeometry);
    const cWide = evaluateWide(cWideRaw, wideGeometry);
    verifySavedWide(aWide, source.wideReference, `${source.shape}|${source.phase}|${source.station}|A`, sensorParity.wide);
    verifySavedWide(cWide, source.wideProduction, `${source.shape}|${source.phase}|${source.station}|C`, sensorParity.wide);
    verifyPriorWideB(bWide, prior, `${source.shape}|${source.phase}|${source.station}|B`, sensorParity.wide);
    sensorParity.wide.comparisons += 4;
    for (const [key, value, expected] of [
      ['A confidence', aWide.confidence, source.referenceConfidence],
      ['C confidence', cWide.confidence, source.productionConfidence],
      ['A winner', aWide.winner, source.referenceWinner],
      ['C winner', cWide.winner, source.productionWinner]
    ]) {
      if (value !== expected) {
        sensorParity.wide.nonExact += 1;
        if (!sensorParity.wide.firstMismatch) sensorParity.wide.firstMismatch = { shape: source.shape, phase: source.phase, station: source.station, key, value, expected };
      }
    }
    output.push({ source, prior, raster, aLocal, bLocal, cLocal, cLocalRaw, bLocalRaw: stageLocalB, aWide, bWide, cWide, aWideRaw, bWideRaw, cWideRaw });
  }
  return { output, queryParity, sensorParity, sourceAbcsParity };
}

function sourceCohortReceipt(abcRows) {
  const localDirectional = abcRows.filter(row => row.prior.local.allDirectionalOutcome !== null);
  const localStable = abcRows.filter(row => row.prior.local.stableFailure);
  const localReader = abcRows.filter(row => row.prior.local.class === 'READER-SUFFICIENT' && row.prior.local.stableFailure);
  const localWriter = abcRows.filter(row => row.prior.local.class === 'WRITER/STORAGE-SUFFICIENT' && row.prior.local.stableFailure);
  const localRestoration = abcRows.filter(row => row.prior.local.allDirectionalOutcome === 'READER-FAILURE PARTLY RESTORED BY WRITER');
  const unique = abcRows.filter(row => row.source.referenceWinnerUnique);
  const productionMismatch = unique.filter(row => row.source.productionWinner !== row.source.referenceWinner);
  const rawFirstWrong = abcRows.filter(row => row.prior.wide.firstProductionWrongStage === 'rawMaximum');
  const rawReader = rawFirstWrong.filter(row => row.prior.wide.raw.class === 'READER-SUFFICIENT');
  const rawTie = rawFirstWrong.filter(row => row.prior.wide.raw.class === 'B TOP TIE / AMBIGUOUS');
  const rawWriter = rawFirstWrong.filter(row => row.prior.wide.raw.class === 'WRITER/STORAGE-SUFFICIENT');
  const rawMixed = rawFirstWrong.filter(row => row.prior.wide.raw.class === 'MIXED / COMPOUND');
  const weightedFirstWrong = abcRows.filter(row => row.prior.wide.firstProductionWrongStage === 'maximum');
  const weightedReader = weightedFirstWrong.filter(row => row.prior.wide.weighted.class === 'READER-SUFFICIENT');
  const weightedTie = weightedFirstWrong.filter(row => row.prior.wide.weighted.class === 'B TOP TIE / AMBIGUOUS');
  const weightedWriter = weightedFirstWrong.filter(row => row.prior.wide.weighted.class === 'WRITER/STORAGE-SUFFICIENT');
  const finalReader = abcRows.filter(row => row.prior.wide.final.class === 'READER-SUFFICIENT');
  const finalWriter = abcRows.filter(row => row.prior.wide.final.class === 'WRITER/STORAGE-SUFFICIENT');
  const finalTie = abcRows.filter(row => row.prior.wide.final.class === 'B TOP TIE / AMBIGUOUS');
  const restoration = abcRows.filter(row => row.prior.wide.final.class === 'READER-FAILURE PARTLY RESTORED BY WRITER');
  const counts = {
    analyticDirectional: localDirectional.length,
    localStableFailures: localStable.length,
    localReaderTarget: localReader.length,
    localWriterControl: localWriter.length,
    localRestoration: localRestoration.length,
    strictUnique: unique.length,
    productionFinalMismatch: productionMismatch.length,
    wideRawFirstWrong: rawFirstWrong.length,
    wideRawReaderTarget: rawReader.length,
    wideRawWriterControl: rawWriter.length,
    wideRawBTie: rawTie.length,
    wideRawMixed: rawMixed.length,
    wideWeightedFirstWrong: weightedFirstWrong.length,
    wideWeightedReaderTarget: weightedReader.length,
    wideWeightedWriterControl: weightedWriter.length,
    wideWeightedBTie: weightedTie.length,
    wideFinalReaderSufficient: finalReader.length,
    wideFinalWriterSufficient: finalWriter.length,
    wideFinalBTie: finalTie.length,
    wideRestoration: restoration.length
  };
  return {
    counts,
    expected: EXPECTED,
    passed: Object.entries(EXPECTED).filter(([key]) => key in counts).every(([key, value]) => counts[key] === value),
    breakdown: {
      localReaderByPhase: statsForCategory(localReader, row => row.source.phase),
      localWriterByPhase: statsForCategory(localWriter, row => row.source.phase),
      rawReaderByPhase: statsForCategory(rawReader, row => row.source.phase),
      rawWriterByPhase: statsForCategory(rawWriter, row => row.source.phase),
      rawMixedByPhase: statsForCategory(rawMixed, row => row.source.phase),
      weightedReaderByPhase: statsForCategory(weightedReader, row => row.source.phase),
      weightedWriterByPhase: statsForCategory(weightedWriter, row => row.source.phase),
      localReaderByRoute: statsForCategory(localReader, row => row.source.shape),
      localWriterByRoute: statsForCategory(localWriter, row => row.source.shape),
      rawReaderByRoute: statsForCategory(rawReader, row => row.source.shape),
      rawWriterByRoute: statsForCategory(rawWriter, row => row.source.shape),
      rawMixedByRoute: statsForCategory(rawMixed, row => row.source.shape),
      weightedReaderByRoute: statsForCategory(weightedReader, row => row.source.shape),
      weightedWriterByRoute: statsForCategory(weightedWriter, row => row.source.shape)
    },
    memberships: Object.fromEntries(Object.entries({ localReader, localWriter, localRestoration, wideRawReader: rawReader,
      wideRawWriter: rawWriter, wideRawTie: rawTie, wideRawMixed: rawMixed, wideWeightedReader: weightedReader, wideWeightedWriter: weightedWriter,
      wideWeightedTie: weightedTie, wideFinalReader: finalReader, wideFinalWriter: finalWriter, wideFinalTie: finalTie,
      wideRestoration: restoration }).map(([name, cohort]) => [name, cohort.map(row => `${row.source.shape}|${row.source.phase}|${row.source.station}`)]))
  };
}

function candidateArm(abcRow, counters) {
  const { source, raster } = abcRow;
  assert(raster.cField.values === raster.values && raster.values === raster.dValues, 'C and D must share the exact same Float32Array object.');
  const dLocalRaw = source.localGeometry.map(point => qakrRead(raster.values, point.x, point.y, { counters }));
  const dLocal = aggregateLocal(dLocalRaw);
  const dWideRaw = source.wideGeometry.map(candidate => candidate.reads.map(point => qakrRead(raster.values, point.x, point.y, { counters })));
  const dWide = evaluateWide(dWideRaw, source.wideGeometry);
  return { dLocalRaw, dLocal, dWideRaw, dWide };
}
function rawMetricSummary(rows) {
  const output = {};
  for (const kind of ['local', 'wide']) {
    const metric = armMetrics();
    const byIndex = new Map();
    for (const row of rows) {
      const length = kind === 'local' ? row.dLocalRaw.length : row.dWideRaw.reduce((sum, candidate) => sum + candidate.length, 0);
      for (let index = 0; index < length; index += 1) {
        const rawFor = armName => {
          if (kind === 'local') return armName === 'A' ? row.source.localReferenceRaw[index]
            : armName === 'C' ? row.cLocalRaw[index] : row.dLocalRaw[index];
          const a = row.aWideRaw.flat()[index];
          const c = row.cWideRaw.flat()[index];
          const d = row.dWideRaw.flat()[index];
          return armName === 'A' ? a : armName === 'C' ? c : d;
        };
        const point = kind === 'local' ? row.source.localGeometry[index]
          : row.source.wideGeometry.flatMap(candidate => candidate.reads)[index];
        const boundary = boundaryExposed(point);
        for (const armName of ['C', 'D']) {
          addRawMetric(metric[armName] ||= armMetrics(), kind, row.source.shape, row.source.phase, boundary,
            rawFor('A'), rawFor(armName));
        }
        const key = `${row.source.shape}|${row.source.station}|${kind}|${index}`;
        const phase = byIndex.get(key) || { A: [], C: [], D: [] };
        phase.A.push(rawFor('A')); phase.C.push(rawFor('C')); phase.D.push(rawFor('D'));
        byIndex.set(key, phase);
      }
    }
    output[kind] = {};
    for (const name of ['C', 'D']) output[kind][name] = finishRawMetrics(metric[name], kind);
    const spreads = { A: [], C: [], D: [] };
    for (const phase of byIndex.values()) {
      for (const arm of ['A', 'C', 'D']) if (phase[arm].length === PHASES.length) spreads[arm].push(Math.max(...phase[arm]) - Math.min(...phase[arm]));
    }
    output[kind].phaseSpread = Object.fromEntries(Object.entries(spreads).map(([arm, values]) => [arm, qStats(values)]));
  }
  return output;
}
function localOutcome(abcRows, dRows) {
  const joined = abcRows.map((row, index) => ({ ...row, ...dRows[index] }));
  const directional = joined.filter(row => row.prior.local.allDirectionalOutcome !== null);
  const stable = joined.filter(row => row.prior.local.stableFailure);
  const targets = joined.filter(row => row.prior.local.class === 'READER-SUFFICIENT' && row.prior.local.stableFailure);
  const writerControls = joined.filter(row => row.prior.local.class === 'WRITER/STORAGE-SUFFICIENT' && row.prior.local.stableFailure);
  const restorations = joined.filter(row => row.prior.local.allDirectionalOutcome === 'READER-FAILURE PARTLY RESTORED BY WRITER');
  const recovered = targets.filter(row => precisionSign(row.dLocal.steering) === precisionSign(row.aLocal.steering));
  const ambiguous = targets.filter(row => precisionSign(row.dLocal.steering) === 0);
  const unchanged = targets.filter(row => precisionSign(row.dLocal.steering) !== 0
    && precisionSign(row.dLocal.steering) !== precisionSign(row.aLocal.steering));
  const newOpposite = directional.filter(row => precisionSign(row.cLocal.steering) === precisionSign(row.aLocal.steering)
    && precisionSign(row.dLocal.steering) !== 0 && precisionSign(row.dLocal.steering) !== precisionSign(row.aLocal.steering));
  const newAmbiguous = directional.filter(row => precisionSign(row.cLocal.steering) === precisionSign(row.aLocal.steering)
    && precisionSign(row.dLocal.steering) === 0);
  const metricByShape = {};
  const metricByPhase = {};
  for (const group of [metricByShape, metricByPhase]) {
    for (const row of directional) {
      const key = group === metricByShape ? row.source.shape : row.source.phase;
      const slot = group[key] ||= { rows: 0, cError: 0, dError: 0, cSignMismatch: 0, dSignMismatch: 0 };
      slot.rows += 1;
      slot.cError += Math.abs(row.cLocal.steering - row.aLocal.steering);
      slot.dError += Math.abs(row.dLocal.steering - row.aLocal.steering);
      slot.cSignMismatch += precisionSign(row.cLocal.steering) !== precisionSign(row.aLocal.steering) ? 1 : 0;
      slot.dSignMismatch += precisionSign(row.dLocal.steering) !== precisionSign(row.aLocal.steering) ? 1 : 0;
    }
  }
  for (const group of [metricByShape, metricByPhase]) for (const slot of Object.values(group)) {
    slot.cSteeringMae = slot.cError / slot.rows;
    slot.dSteeringMae = slot.dError / slot.rows;
    delete slot.cError; delete slot.dError;
  }
  const writerErrorDelta = writerControls.map(row => Math.abs(row.dLocal.steering - row.aLocal.steering) - Math.abs(row.cLocal.steering - row.aLocal.steering));
  const restorationDestroyed = restorations.filter(row => precisionSign(row.dLocal.steering) !== 0
    && precisionSign(row.dLocal.steering) !== precisionSign(row.aLocal.steering));
  const restorationAmbiguous = restorations.filter(row => precisionSign(row.dLocal.steering) === 0);
  const sZero = joined.filter(row => row.source.shape === 'sCurve' && row.aLocal.steering === 0);
  const straight = joined.filter(row => row.source.shape === 'straight');
  const curved = joined.filter(row => ['gentle', 'gentleMirror', 'tight', 'tightMirror'].includes(row.source.shape));
  const straightByPhase = Object.fromEntries(PHASES.map(phase => {
    const subset = straight.filter(row => row.source.phase === phase);
    return [phase, {
      count: subset.length,
      A: qStats(subset.map(row => Math.abs(row.aLocal.steering))),
      C: qStats(subset.map(row => Math.abs(row.cLocal.steering))),
      D: qStats(subset.map(row => Math.abs(row.dLocal.steering)))
    }];
  }));
  const mirrorRows = [];
  for (const pair of [['gentle', 'gentleMirror'], ['tight', 'tightMirror']]) {
    for (const left of joined.filter(row => row.source.shape === pair[0])) {
      const right = joined.find(row => row.source.shape === pair[1] && row.source.phase === left.source.phase && row.source.station === left.source.station);
      if (!right) continue;
      mirrorRows.push({ routePair: pair.join('/'), phase: left.source.phase,
        A: Math.abs(left.aLocal.steering + right.aLocal.steering),
        C: Math.abs(left.cLocal.steering + right.cLocal.steering),
        D: Math.abs(left.dLocal.steering + right.dLocal.steering) });
    }
  }
  return {
    cohort: { analyticDirectional: directional.length, stableProductionFailures: stable.length, readerTarget: targets.length,
      recovered: recovered.length, unchangedFailure: unchanged.length, ambiguous: ambiguous.length,
      writerSufficientControl: writerControls.length, restorationControl: restorations.length,
      newOppositeFailures: newOpposite.length, newAmbiguousOnCControls: newAmbiguous.length,
      writerControlErrorDelta: qStats(writerErrorDelta), writerControlImproved: writerErrorDelta.filter(value => value < 0).length,
      writerControlWorsened: writerErrorDelta.filter(value => value > 0).length,
      restorationDestroyed: restorationDestroyed.length, restorationAmbiguous: restorationAmbiguous.length },
    readerTargetByAnalyticSteeringQuartile: equalCountGroups(targets, row => Math.abs(row.aLocal.steering), row => precisionSign(row.dLocal.steering) === precisionSign(row.aLocal.steering)),
    allDirectional: {
      cSteeringMae: qStats(directional.map(row => Math.abs(row.cLocal.steering - row.aLocal.steering))),
      dSteeringMae: qStats(directional.map(row => Math.abs(row.dLocal.steering - row.aLocal.steering))),
      cSignMismatch: directional.filter(row => precisionSign(row.cLocal.steering) !== precisionSign(row.aLocal.steering)).length,
      dSignMismatch: directional.filter(row => precisionSign(row.dLocal.steering) !== precisionSign(row.aLocal.steering)).length,
      cMagnitude: qStats(directional.map(row => Math.abs(row.cLocal.steering))),
      dMagnitude: qStats(directional.map(row => Math.abs(row.dLocal.steering)))
    },
    byShape: metricByShape, byPhase: metricByPhase,
    straight: { total: straight.length, byPhase: straightByPhase,
      p00Station0122: pickLocal(straight, 'p00', 0.122), p01Station0122: pickLocal(straight, 'p01', 0.122) },
    curved: {
      cSteeringMae: qStats(curved.filter(row => precisionSign(row.aLocal.steering) !== 0).map(row => Math.abs(row.cLocal.steering - row.aLocal.steering))),
      dSteeringMae: qStats(curved.filter(row => precisionSign(row.aLocal.steering) !== 0).map(row => Math.abs(row.dLocal.steering - row.aLocal.steering))),
      cSignMismatch: curved.filter(row => precisionSign(row.aLocal.steering) !== 0 && precisionSign(row.cLocal.steering) !== precisionSign(row.aLocal.steering)).length,
      dSignMismatch: curved.filter(row => precisionSign(row.aLocal.steering) !== 0 && precisionSign(row.dLocal.steering) !== precisionSign(row.aLocal.steering)).length
    },
    mirrorResidual: Object.fromEntries(['A', 'C', 'D'].map(arm => [arm, qStats(mirrorRows.map(row => row[arm]))])),
    sCurveAnalyticZero: { count: sZero.length, expectedPerPhase: 98,
      byPhase: Object.fromEntries(PHASES.map(phase => { const subset = sZero.filter(row => row.source.phase === phase); return [phase, { count: subset.length, cAbsSteering: qStats(subset.map(row => Math.abs(row.cLocal.steering))), dAbsSteering: qStats(subset.map(row => Math.abs(row.dLocal.steering))) }]; })) }
  };
}
function equalCountGroups(rows, valueFn, successFn) {
  const sorted = [...rows].sort((a, b) => valueFn(a) - valueFn(b));
  const output = [];
  for (let group = 0; group < 4; group += 1) {
    const from = Math.floor(sorted.length * group / 4);
    const to = Math.floor(sorted.length * (group + 1) / 4);
    const subset = sorted.slice(from, to);
    output.push({ quartile: group + 1, count: subset.length,
      analyticMagnitude: qStats(subset.map(valueFn)), recovered: subset.filter(successFn).length });
  }
  return output;
}
function pickLocal(rows, phase, station) {
  const row = rows.find(item => item.source.phase === phase && Math.abs(item.source.station - station) < 1e-12);
  if (!row) return null;
  return { station: row.source.station, A: row.aLocal, C: row.cLocal, D: row.dLocal, rasterSha256: row.raster.sha256 };
}
function wideOutcome(abcRows, dRows) {
  const joined = abcRows.map((row, index) => ({ ...row, ...dRows[index] }));
  const unique = joined.filter(row => row.source.referenceWinnerUnique);
  const productionMismatch = unique.filter(row => row.source.productionWinner !== row.source.referenceWinner);
  const dMismatch = unique.filter(row => row.dWide.winner !== row.source.referenceWinner);
  const readerRawTarget = joined.filter(row => row.prior.wide.firstProductionWrongStage === 'rawMaximum'
    && row.prior.wide.raw.class === 'READER-SUFFICIENT');
  const rawTopOffsets = row => {
    const top = Math.max(...row.dWide.candidates.map(candidate => candidate.rawMaximum));
    return row.dWide.candidates.filter(candidate => candidate.rawMaximum === top).map(candidate => candidate.offset);
  };
  const rawTargetTop = row => rawTopOffsets(row).filter(offset => offset === row.source.referenceWinner).length > 0;
  const rawTargetsTie = readerRawTarget.filter(row => rawTargetTop(row) && rawTopOffsets(row).length > 1);
  const rawTargetsRecovered = readerRawTarget.filter(row => rawTargetTop(row) && rawTopOffsets(row).length === 1);
  const weightedTarget = joined.filter(row => row.prior.wide.firstProductionWrongStage === 'maximum'
    && row.prior.wide.weighted.class === 'READER-SUFFICIENT');
  const weightedTopOffsets = row => {
    const top = Math.max(...row.dWide.candidates.map(candidate => candidate.weightedMaximum));
    return row.dWide.candidates.filter(candidate => candidate.weightedMaximum === top).map(candidate => candidate.offset);
  };
  const weightedTargetTop = row => weightedTopOffsets(row).filter(offset => offset === row.source.referenceWinner).length > 0;
  const weightedTies = weightedTarget.filter(row => weightedTargetTop(row) && weightedTopOffsets(row).length > 1);
  const weightedRecovered = weightedTarget.filter(row => weightedTargetTop(row) && weightedTopOffsets(row).length === 1);
  const restoration = joined.filter(row => row.prior.wide.final.class === 'READER-FAILURE PARTLY RESTORED BY WRITER');
  const restorationDestroyed = restoration.filter(row => row.dWide.winner !== row.source.referenceWinner);
  const rawNewWrong = unique.filter(row => row.cWide.rawWinner === row.source.referenceWinner
    && row.dWide.rawWinner !== row.source.referenceWinner);
  const weightedNewWrong = unique.filter(row => row.cWide.weightedWinner === row.source.referenceWinner
    && row.dWide.weightedWinner !== row.source.referenceWinner);
  const margin = row => row.source.referenceWinnerMargin;
  const sortedMargin = [...unique].sort((a, b) => margin(b) - margin(a));
  const topGroups = {};
  for (const [name, fraction] of [['topHalf', 0.5], ['topQuartile', 0.25], ['topDecile', 0.1]]) {
    const count = Math.ceil(unique.length * fraction);
    const subset = sortedMargin.slice(0, count);
    topGroups[name] = { count, marginRange: [margin(subset.at(-1)), margin(subset[0])], cMismatch: subset.filter(row => row.source.productionWinner !== row.source.referenceWinner).length,
      dMismatch: subset.filter(row => row.dWide.winner !== row.source.referenceWinner).length };
  }
  const mismatchSorted = [...productionMismatch].sort((a, b) => margin(b) - margin(a));
  const topFailureDecile = mismatchSorted.slice(0, Math.ceil(productionMismatch.length * 0.1));
  const maximumMargin = sortedMargin[0];
  const candidateMarginStats = unique.map(row => row.dWide.scoreMargin);
  const contrast = {
    analyticScoreTopMargin: qStats(unique.map(row => row.source.referenceWinnerMargin)),
    cScoreTopMargin: qStats(unique.map(row => row.cWide.scoreMargin)),
    dScoreTopMargin: qStats(candidateMarginStats),
    aResponseSpread: qStats(unique.map(row => row.aWide.confidence)),
    cResponseSpread: qStats(unique.map(row => row.cWide.confidence)),
    dResponseSpread: qStats(unique.map(row => row.dWide.confidence)),
    dWinnerOffsets: statsForCategory(dMismatch, row => row.dWide.winner)
  };
  const byShape = {};
  const byPhase = {};
  for (const group of [byShape, byPhase]) {
    const keyFn = group === byShape ? row => row.source.shape : row => row.source.phase;
    for (const row of unique) {
      const key = keyFn(row);
      const slot = group[key] ||= { count: 0, cMismatch: 0, dMismatch: 0, topMarginC: 0, topMarginD: 0 };
      slot.count += 1;
      slot.cMismatch += row.source.productionWinner !== row.source.referenceWinner ? 1 : 0;
      slot.dMismatch += row.dWide.winner !== row.source.referenceWinner ? 1 : 0;
      slot.topMarginC += row.cWide.scoreMargin;
      slot.topMarginD += row.dWide.scoreMargin;
    }
  }
  for (const group of [byShape, byPhase]) for (const slot of Object.values(group)) {
    slot.cScoreMarginMean = slot.topMarginC / slot.count;
    slot.dScoreMarginMean = slot.topMarginD / slot.count;
    delete slot.topMarginC; delete slot.topMarginD;
  }
  return {
    source: { strictUnique: unique.length, currentCFinalMismatch: productionMismatch.length,
      readerRawTarget: readerRawTarget.length, rawTargetRecovered: rawTargetsRecovered.length,
      rawTargetUnchangedWrong: readerRawTarget.length - rawTargetsRecovered.length - rawTargetsTie.length,
      rawTargetTieIncludingTarget: rawTargetsTie.length,
      weightedReaderTarget: weightedTarget.length, weightedTargetRecovered: weightedRecovered.length,
      weightedTargetUnchangedWrong: weightedTarget.length - weightedRecovered.length - weightedTies.length,
      weightedTargetTieIncludingTarget: weightedTies.length,
      currentRestorationControl: restoration.length, cCorrectRestorationsDestroyedByD: restorationDestroyed.length },
    allStrictUnique: { cMismatch: productionMismatch.length, dMismatch: dMismatch.length,
      recoveredByD: productionMismatch.filter(row => row.dWide.winner === row.source.referenceWinner).length,
      newWrongByD: unique.filter(row => row.source.productionWinner === row.source.referenceWinner && row.dWide.winner !== row.source.referenceWinner).length,
      dTieIncludingTarget: dMismatch.filter(row => { const top = Math.max(...row.dWide.candidates.map(candidate => candidate.score)); return row.dWide.candidates.some(candidate => candidate.offset === row.source.referenceWinner && candidate.score === top); }).length,
      deltaMismatch: dMismatch.length - productionMismatch.length },
    newRawMaxFailuresOutsideC: rawNewWrong.length,
    newWeightedMaxFailuresOutsideC: weightedNewWrong.length,
    highMargin: { allStrictUniqueTopGroups: topGroups,
      cMismatchTopFailureDecile: { count: topFailureDecile.length, marginRange: [margin(topFailureDecile.at(-1)), margin(topFailureDecile[0])],
        cMismatch: topFailureDecile.length, dMismatch: topFailureDecile.filter(row => row.dWide.winner !== row.source.referenceWinner).length },
      maximumMarginCase: rowSummary(maximumMargin) },
    contrast,
    byShape, byPhase,
    restorationByD: statsForCategory(restoration, row => row.dWide.winner === row.source.referenceWinner ? 'preserved' : 'destroyed'),
    rawTargetsByPhase: statsForCategory(readerRawTarget, row => {
      const top = rawTopOffsets(row);
      return `${row.source.phase}|${top.length > 1 && top.includes(row.source.referenceWinner) ? 'tie' : top.length === 1 && top[0] === row.source.referenceWinner ? 'recovered' : 'still-wrong'}`;
    }),
    weightedTargetsByPhase: statsForCategory(weightedTarget, row => {
      const top = weightedTopOffsets(row);
      return `${row.source.phase}|${top.length > 1 && top.includes(row.source.referenceWinner) ? 'tie' : top.length === 1 && top[0] === row.source.referenceWinner ? 'recovered' : 'still-wrong'}`;
    })
  };
}
function rowSummary(row) {
  return {
    shape: row.source.shape, phase: row.source.phase, station: row.source.station,
    rasterSha256: row.raster.sha256,
    referenceWinner: row.source.referenceWinner,
    referenceMargin: row.source.referenceWinnerMargin,
    currentWinner: row.cWide.winner, candidateWinner: row.dWide?.winner,
    A: row.aWide.candidates.map(candidate => ({ offset: candidate.offset, rawMaximum: candidate.rawMaximum, weightedMaximum: candidate.weightedMaximum, response: candidate.response, score: candidate.score })),
    C: row.cWide.candidates.map(candidate => ({ offset: candidate.offset, rawMaximum: candidate.rawMaximum, weightedMaximum: candidate.weightedMaximum, response: candidate.response, score: candidate.score })),
    D: row.dWide?.candidates.map(candidate => ({ offset: candidate.offset, rawMaximum: candidate.rawMaximum, weightedMaximum: candidate.weightedMaximum, response: candidate.response, score: candidate.score }))
  };
}
function specialCases(abcRows, dRows) {
  const joined = abcRows.map((row, index) => ({ ...row, ...dRows[index] }));
  const local = (shape, phase, station) => {
    const row = joined.find(item => item.source.shape === shape && item.source.phase === phase && Math.abs(item.source.station - station) < 1e-12);
    return row ? { shape, phase, station: row.source.station, rasterSha256: row.raster.sha256,
      A: { raw: row.source.localReferenceRaw, features: row.aLocal }, C: { raw: row.cLocalRaw, features: row.cLocal }, D: { raw: row.dLocalRaw, features: row.dLocal } } : null;
  };
  const wide = (shape, phase, station) => {
    const row = joined.find(item => item.source.shape === shape && item.source.phase === phase && Math.abs(item.source.station - station) < 1e-12);
    return row ? rowSummary(row) : null;
  };
  return {
    straightP00Station0122: local('straight', 'p00', 0.122),
    straightP01Station0122: local('straight', 'p01', 0.122),
    tightP00Station0294: wide('tight', 'p00', 0.294),
    tightP10Station0066: wide('tight', 'p10', 0.066)
  };
}
function rowOutput(abcRows, dRows) {
  return abcRows.map((row, index) => {
    const d = dRows[index];
    return {
      shape: row.source.shape, phase: row.source.phase, station: row.source.station,
      rasterSha256: row.raster.sha256,
      local: { A: row.aLocal, B: row.bLocal, C: row.cLocal, D: d.dLocal,
        rawA: row.source.localReferenceRaw, rawC: row.cLocalRaw, rawD: d.dLocalRaw },
      wide: {
        referenceWinner: row.source.referenceWinner, referenceUnique: row.source.referenceWinnerUnique,
        referenceMargin: row.source.referenceWinnerMargin,
        A: row.aWide, C: compactWide(row.cWide), D: compactWide(d.dWide),
        rawA: row.aWideRaw, rawC: row.cWideRaw, rawD: d.dWideRaw
      }
    };
  });
}
function compactWide(wide) {
  return { confidence: wide.confidence, rank: wide.rank, winnerIndex: wide.winnerIndex, winner: wide.winner,
    scoreMargin: wide.scoreMargin, rawWinner: wide.rawWinner, weightedWinner: wide.weightedWinner,
    candidates: wide.candidates.map(candidate => ({ offset: candidate.offset, raw: candidate.raw, weighted: candidate.weighted,
      rawMaximum: candidate.rawMaximum, rawMaxTies: candidate.rawMaxTies,
      weightedMaximum: candidate.weightedMaximum, weightedTies: candidate.weightedTies, response: candidate.response, score: candidate.score })) };
}
function runtimeEstimate(counters, elapsedMs) {
  const nodeContributions = counters.nodeContributions;
  return {
    elapsedMs,
    qakrQueries: counters.queryCount,
    averageNodeContributionsPerQuery: nodeContributions / counters.queryCount,
    maximumNodesPerQuery: 4,
    exactFullDiskBasisCalls: counters.fullDisk,
    disjointBasisCalls: counters.disjoint,
    partialBasisCalls: counters.partial,
    gaussLegendreEvaluations: counters.quadratureNodes,
    approximateArithmetic: `about ${counters.quadratureNodes} GL nodes, each using one exp, one cos/sin pair and two 24-term erf series; plus ${nodeContributions} value-weight accumulations`,
    currentBilinearPerQuery: 'four raster node reads, four bilinear weights, three linear blends',
    qakrMemory: 'no LUT; 24-point Gauss-Legendre constants plus one shared 96x96 Float32 raster (36,864 bytes per arm)',
    lutPossibility: 'The cell-phase-dependent basis is 4-fold symmetric and compactly supported; a precomputed table could trade bounded memory for fewer quadratures, but was not used or benchmarked.'
  };
}

async function run({ sanityOnly = false } = {}) {
  const sanity = basisSanity();
  writeJson(`${OUTPUT_DIR}/validation/basis-sanity.json`, sanity);
  assert(sanity.passed, 'QAKR basis sanity gate failed; fixture results were not calculated.');
  if (sanityOnly) return { sanity };

  const fixture = readFixture();
  const rasters = new Map();
  const rasterGate = [];
  for (const entry of fixture.manifest.rasters) {
    const raster = loadRasterArm(fixture.base, entry);
    const cField = new PheromoneField({ width: entry.width, height: entry.height });
    cField.values = raster.values;
    raster.cField = cField;
    raster.dValues = raster.values;
    raster.entry = entry;
    rasterGate.push({ id: entry.id, expectedSha256: entry.rasterSha256, actualSha256: raster.sha256,
      byteLength: raster.bytes.length, sharedArrayIdentity: cField.values === raster.values && raster.values === raster.dValues });
    rasters.set(entry.id, raster);
  }
  const sharedGate = { rasterCount: rasterGate.length, allShaMatch: rasterGate.every(item => item.expectedSha256 === item.actualSha256),
    allSameArrayForCAndD: rasterGate.every(item => item.sharedArrayIdentity), rasters: rasterGate };
  writeJson(`${OUTPUT_DIR}/validation/shared-raster-c-gate.json`, sharedGate);
  assert(sharedGate.rasterCount === 24 && sharedGate.allShaMatch && sharedGate.allSameArrayForCAndD, 'Shared-raster SHA/identity gate failed.');

  const abc = buildABC(fixture.rows, fixture.sourceAbcsRows, rasters);
  const queryParity = {
    baseline: BASELINE,
    inputCompressedSha256: fixture.gzSha,
    local: { ...abc.queryParity.local, expected: EXPECTED.localQueries },
    wide: { ...abc.queryParity.wide, expected: EXPECTED.wideQueries },
    totalExact: abc.queryParity.local.exact + abc.queryParity.wide.exact,
    totalQueries: abc.queryParity.local.total + abc.queryParity.wide.total,
    exact: abc.queryParity.local.exact === EXPECTED.localQueries && abc.queryParity.wide.exact === EXPECTED.wideQueries
  };
  const sensorParity = {
    local: { ...abc.sensorParity.local, passed: abc.sensorParity.local.nonExact === 0 },
    wide: { ...abc.sensorParity.wide, passed: abc.sensorParity.wide.nonExact === 0 }
  };
  const priorAbcsParity = {
    sourceCommit: PRIOR_ATTRIBUTION,
    sourceSha256: fixture.sourceAbcsSha,
    rows: abc.sourceAbcsParity.rowKeysExact,
    localA: { exact: abc.sourceAbcsParity.localAExact, expected: EXPECTED.localQueries },
    localC: { exact: abc.sourceAbcsParity.localCExact, expected: EXPECTED.localQueries },
    wideA: { exact: abc.sourceAbcsParity.wideAExact, expected: EXPECTED.wideQueries },
    wideC: { exact: abc.sourceAbcsParity.wideCExact, expected: EXPECTED.wideQueries },
    firstMismatch: abc.sourceAbcsParity.firstMismatch
  };
  priorAbcsParity.passed = priorAbcsParity.rows === EXPECTED.rows
    && priorAbcsParity.localA.exact === priorAbcsParity.localA.expected
    && priorAbcsParity.localC.exact === priorAbcsParity.localC.expected
    && priorAbcsParity.wideA.exact === priorAbcsParity.wideA.expected
    && priorAbcsParity.wideC.exact === priorAbcsParity.wideC.expected;
  writeJson(`${OUTPUT_DIR}/validation/current-bilinear-parity.json`, queryParity);
  writeJson(`${OUTPUT_DIR}/validation/sensor-parity.json`, sensorParity);
  writeJson(`${OUTPUT_DIR}/validation/prior-abcs-input-parity.json`, priorAbcsParity);
  if (!queryParity.exact || !sensorParity.local.passed || !sensorParity.wide.passed || !priorAbcsParity.passed) {
    writeJson(`${OUTPUT_DIR}/validation/pre-candidate-failure.json`, { stage: 'historical C / A-B-C input parity', queryParity, sensorParity, priorAbcsParity });
    throw new Error('Historical production bilinear/sensor parity or source A/B/C input parity failed; D outcomes were not calculated.');
  }

  const sourceCohorts = sourceCohortReceipt(abc.output);
  writeJson(`${OUTPUT_DIR}/computed/source-cohort-gate.json`, {
    source: { attributionCommit: PRIOR_ATTRIBUTION, compressedInputSha256: fixture.gzSha, uncompressedInputSha256: fixture.uncompressedSha,
      abcsStageRowsSha256: fixture.sourceAbcsSha, abcsStageRowsExactParity: priorAbcsParity.passed },
    counts: sourceCohorts.counts, expected: sourceCohorts.expected, breakdown: sourceCohorts.breakdown, passed: sourceCohorts.passed
  });
  if (!sourceCohorts.passed) throw new Error(`Prior A/B/C cohort counts did not reproduce: ${JSON.stringify(sourceCohorts.counts)}`);

  const counters = { queryCount: 0, nodeContributions: 0, fullDisk: 0, disjoint: 0, partial: 0, quadratureNodes: 0 };
  const start = performance.now();
  const dRows = abc.output.map(row => candidateArm(row, counters));
  const elapsedMs = performance.now() - start;
  const endHashes = fixture.manifest.rasters.map(entry => {
    const current = sha256(readFileSync(resolve(fixture.base, entry.file)));
    return { id: entry.id, expected: entry.rasterSha256, after: current, unchanged: current === entry.rasterSha256 };
  });
  assert(endHashes.every(item => item.unchanged), 'One or more shared raster files changed during C/D evaluation.');

  const local = localOutcome(abc.output, dRows);
  const wide = wideOutcome(abc.output, dRows);
  const rawFidelity = rawMetricSummary(abc.output.map((row, index) => ({ ...row, ...dRows[index] })));
  const allStrictUnique = abc.output.filter(row => row.source.referenceWinnerUnique);
  const marginSorted = [...allStrictUnique].sort((a, b) => b.source.referenceWinnerMargin - a.source.referenceWinnerMargin);
  const marginDistribution = qStats(allStrictUnique.map(row => row.source.referenceWinnerMargin));
  const topMarginGroupSummary = { min: marginSorted.at(-1).source.referenceWinnerMargin, max: marginSorted[0].source.referenceWinnerMargin };
  const data = {
    decision: 'MIXED / RESEARCH-ONLY',
    baseline: { originMain: BASELINE, productionSourceSha256: fixture.sourceCheck, sourceCommit: fixture.manifest.provenance.productionBaselineCommit },
    provenance: { rasterFixtureCommit: '9afcc130f23c85f34cdf64073a2c95c945c0b320', rowCommit: PRIOR_ATTRIBUTION,
      rowCompressedSha256: fixture.gzSha, rowUncompressedSha256: fixture.uncompressedSha,
      abcsStageRowsSha256: fixture.sourceAbcsSha,
      rasterCount: rasterGate.length, rasterBytes: rasterGate.reduce((sum, entry) => sum + entry.byteLength, 0), allRastersShaVerified: sharedGate.allShaMatch },
    candidate: { name: 'QAKR', formulation: QAKR_CONSTANTS, quadratureOrder: 24, boundaryRule: 'full cell for each in-domain raster node; out-of-domain queries return zero', noNormalization: true },
    gates: { basisSanityPassed: sanity.passed, sharedRasterPassed: sharedGate.allShaMatch && sharedGate.allSameArrayForCAndD,
      currentBilinearRawParityExact: queryParity.exact, currentSensorParityExact: sensorParity.local.passed && sensorParity.wide.passed,
      priorAbcsInputParityExact: priorAbcsParity.passed, sourceCohortsReproduced: sourceCohorts.passed,
      rasterFilesUnchanged: endHashes.every(item => item.unchanged), rngCalls: 0 },
    rawFidelity,
    local,
    wide,
    marginDistribution, topMarginAllUniqueBounds: topMarginGroupSummary,
    specialCases: specialCases(abc.output, dRows),
    runtime: runtimeEstimate(counters, elapsedMs),
    validation: { rasterHashesAfterRead: endHashes, localQueryCount: queryParity.local.total, wideQueryCount: queryParity.wide.total,
      cSharedArrayReference: true, dReadOnly: true, productionSourceChanged: false }
  };

  // The complete pattern, not one pooled scalar, governs this preregistered classification.
  data.decisionRationale = {
    qualifyingStrengths: [
      `local reader-target recoveries ${local.cohort.recovered}/${local.cohort.readerTarget}`,
      `wide raw-max reader-target recoveries ${wide.source.rawTargetRecovered}/${wide.source.readerRawTarget}`,
      `wide weighted-max target recoveries ${wide.source.weightedTargetRecovered}/${wide.source.weightedReaderTarget}`
    ],
    limitingCosts: [
      `new local opposite-sign failures ${local.cohort.newOppositeFailures}`,
      `restoration controls lost locally/wide ${local.cohort.restorationDestroyed}/${wide.source.cCorrectRestorationsDestroyedByD}`,
      `wide final mismatch ${wide.allStrictUnique.dMismatch}/${wide.allStrictUnique.cMismatch} current mismatches`,
      `local steering MAE and phase spread worsen despite lower raw-value MAE`,
      `fixed 24-point quadrature is far more expensive than bilinear sampling`
    ],
    movementGate: 'Not qualified for movement shadow: local qualitative errors rise, targeted recoveries are small, and the straight false-steering control worsens. Stop here; do not tune or test another reader.'
  };
  writeJson(`${OUTPUT_DIR}/computed/summary.json`, data);
  writeJson(`${OUTPUT_DIR}/computed/special-cases.json`, data.specialCases);
  writeGzipJson(`${OUTPUT_DIR}/computed/row-results.json.gz`, rowOutput(abc.output, dRows));
  writeGzipJson(`${OUTPUT_DIR}/computed/cohort-membership.json.gz`, sourceCohorts.memberships);
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await run({ sanityOnly: process.argv.includes('--sanity-only') });
    if (process.argv.includes('--sanity-only')) console.log(JSON.stringify(result.sanity, null, 2));
    else console.log(JSON.stringify({ decision: result.decision, gates: result.gates, local: result.local.cohort, wide: result.wide.source, runtime: result.runtime }, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

export { aggregateLocal, evaluateWide, run };
