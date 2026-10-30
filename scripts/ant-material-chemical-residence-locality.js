import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-30-material-chemical-residence-locality';
const INPUT = 'docs/ant/evidence/2026-10-30-material-pheromone-attenuation-screen/data';
const PROBE = 'docs/ant/evidence/2026-10-30-material-chemical-residence-probe';
const WIDTH = 316, MATERIAL_SIZE = 96, TICKS = 36000, DT = 1 / 60;
const HALF_LIFE = 15, MAX_VALUE = 8, RADIUS = 0.0045, LN2 = Math.LN2;
const CHECKPOINTS = [30, 60, 120, 300, 600];
const WIDE_OFFSETS = [-0.92, -0.47, 0, 0.47, 0.92];
const SENSOR_DISTANCE = 0.042, SENSOR_WIDTH = 0.014;
const WIDE_HALF_SATURATION = 0.035, RESPONSE_EXPONENT = 3;

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonGz = bytes => JSON.parse(gunzipSync(bytes));
const gzipJson = value => gzipSync(Buffer.from(JSON.stringify(value) + '\n'), { level: 9, mtime: 0 });

function pResidence(layerCount) { return 1 - 0.5 * (1 - Math.exp(-layerCount / 4)); }
function field() { return new PheromoneField({ width: WIDTH, height: WIDTH, decayHalfLifeSeconds: HALF_LIFE, maxValue: MAX_VALUE }); }
function nodeSum(values) { let sum = 0; for (const value of values) sum += value; return sum; }
function describe(values) {
  if (!values.length) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { count: values.length, min: sorted[0], p10: q(.1), p25: q(.25), median: q(.5), p75: q(.75),
    p90: q(.9), p95: q(.95), p99: q(.99), max: sorted.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length };
}
function fieldStats(values) {
  const hx = 1 / (WIDTH - 1), hy = 1 / (WIDTH - 1);
  let sum = 0, weighted = 0, max = 0, positive = 0;
  for (let y = 0; y < WIDTH; y += 1) for (let x = 0; x < WIDTH; x += 1) {
    const value = values[y * WIDTH + x];
    sum += value;
    if (value > max) max = value;
    if (value > 0) positive += 1;
    weighted += value * ((x === 0 || x === WIDTH - 1 ? 0.5 : 1) * (y === 0 || y === WIDTH - 1 ? 0.5 : 1));
  }
  return { nodeSum: sum, reconstructedIntegral: weighted * hx * hy, max, positiveNodes: positive };
}
function project96(values) {
  const probe = field(); probe.values = values;
  const projected = new Array(MATERIAL_SIZE * MATERIAL_SIZE);
  for (let y = 0; y < MATERIAL_SIZE; y += 1) for (let x = 0; x < MATERIAL_SIZE; x += 1) {
    projected[y * MATERIAL_SIZE + x] = probe.sample(x / 95, y / 95);
  }
  return projected;
}

function solveMassMatchedNull(nativeValues, targetSum, maxValue = MAX_VALUE) {
  if (!(targetSum >= 0) || !Number.isFinite(targetSum)) throw new RangeError('targetSum must be finite and nonnegative.');
  let nativeSum = 0, nativeMax = 0, positiveNodes = 0;
  for (const value of nativeValues) {
    if (!(value >= 0) || !Number.isFinite(value)) throw new RangeError('native values must be finite and nonnegative.');
    nativeSum += value;
    if (value > nativeMax) nativeMax = value;
    if (value > 0) positiveNodes += 1;
  }
  const maximumFeasibleSum = maxValue * positiveNodes;
  if (targetSum > maximumFeasibleSum) {
    return { feasible: false, targetSum, nativeSum, positiveNodes, maximumFeasibleSum, values: null };
  }
  let k = 0;
  if (targetSum > 0) {
    if (nativeSum === 0) return { feasible: false, targetSum, nativeSum, positiveNodes, maximumFeasibleSum, values: null };
    k = targetSum / nativeSum;
    if (k * nativeMax > maxValue) {
      let low = 0, high = Math.max(1, k);
      const massAt = scale => {
        let sum = 0;
        for (const value of nativeValues) sum += Math.fround(Math.min(maxValue, scale * value));
        return sum;
      };
      while (massAt(high) < targetSum && high < Number.MAX_VALUE / 2) high *= 2;
      if (massAt(high) < targetSum) return { feasible: false, targetSum, nativeSum, positiveNodes, maximumFeasibleSum, values: null };
      for (let iteration = 0; iteration < 64; iteration += 1) {
        const middle = (low + high) * 0.5;
        if (middle === low || middle === high) break;
        if (massAt(middle) < targetSum) low = middle;
        else high = middle;
      }
      const candidates = [low, high, (low + high) * 0.5];
      let best = null;
      for (const candidate of candidates) {
        const sum = massAt(candidate), residual = Math.abs(sum - targetSum);
        if (best === null || residual < best.residual || (residual === best.residual && candidate < best.k)) best = { k: candidate, residual };
      }
      k = best.k;
    }
  }

  const values = new Float32Array(nativeValues.length);
  let outputSum = 0, cappedNodes = 0, requestedSum = 0, capRemovedSum = 0;
  for (let index = 0; index < nativeValues.length; index += 1) {
    const request = k * nativeValues[index];
    requestedSum += request;
    if (request > maxValue) { cappedNodes += 1; capRemovedSum += request - maxValue; }
    values[index] = Math.min(maxValue, request);
    outputSum += values[index];
  }
  return { feasible: true, k, targetSum, nativeSum, outputSum, absoluteResidual: Math.abs(outputSum - targetSum),
    relativeResidual: targetSum === 0 ? 0 : Math.abs(outputSum - targetSum) / targetSum, positiveNodes, maximumFeasibleSum,
    cappedNodes, cappedFractionOfPositive: positiveNodes ? cappedNodes / positiveNodes : 0,
    uncappedRequestedSum: requestedSum, capRemovedSum, capRemovedFractionOfTarget: targetSum ? capRemovedSum / targetSum : 0, values };
}

function footprintIndices(position) {
  if (position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) return [];
  const gx = position.x * (WIDTH - 1), gy = position.y * (WIDTH - 1);
  const radius = Math.ceil(RADIUS * (WIDTH - 1)), indices = [];
  for (let y = Math.max(0, Math.floor(gy - radius)); y <= Math.min(WIDTH - 1, Math.ceil(gy + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(gx - radius)); x <= Math.min(WIDTH - 1, Math.ceil(gx + radius)); x += 1) {
      if (Math.hypot(x / (WIDTH - 1) - position.x, y / (WIDTH - 1) - position.y) <= RADIUS) indices.push(y * WIDTH + x);
    }
  }
  return indices;
}

function addMaterialMask(layerMap, mask) {
  for (let index = 0; index < layerMap.length; index += 1) {
    const x = index % WIDTH, y = Math.floor(index / WIDTH);
    const materialIndex = Math.round(y / (WIDTH - 1) * 95) * MATERIAL_SIZE + Math.round(x / (WIDTH - 1) * 95);
    if (mask[materialIndex]) layerMap[index] += 1;
  }
}

function activate(active, flags, indices, values) {
  for (const index of indices) if (values[index] > 0 && flags[index] === 0) {
    flags[index] = 1;
    active.push(index);
  }
}
function decayActive(fieldValue, active, flags, factorForIndex) {
  const values = fieldValue.values;
  let retained = 0;
  for (let i = 0; i < active.length; i += 1) {
    const index = active[i];
    values[index] = Math.min(MAX_VALUE, values[index] * factorForIndex(index));
    if (values[index] > 0) active[retained++] = index;
    else flags[index] = 0;
  }
  active.length = retained;
}

function pearsonMetrics(a, b, layerMap) {
  let sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0, abs = 0;
  let materialDelta = 0, bareDelta = 0, materialCount = 0, bareCount = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i], y = b[i], delta = x - y;
    sumA += x; sumB += y; sumAA += x * x; sumBB += y * y; sumAB += x * y; abs += Math.abs(delta);
    if (layerMap[i] > 0) { materialDelta += delta; materialCount += 1; }
    else { bareDelta += delta; bareCount += 1; }
  }
  const n = a.length, covariance = sumAB - sumA * sumB / n;
  const varianceA = sumAA - sumA * sumA / n, varianceB = sumBB - sumB * sumB / n;
  return { pearsonCorrelation: varianceA > 0 && varianceB > 0 ? covariance / Math.sqrt(varianceA * varianceB) : null,
    normalizedL1: sumA ? abs / sumA : 0, absL1: abs,
    material: { fieldNodes: materialCount, meanResidenceMinusNull: materialCount ? materialDelta / materialCount : null },
    bare: { fieldNodes: bareCount, meanResidenceMinusNull: bareCount ? bareDelta / bareCount : null } };
}

function hillResponse(signal, halfSaturation) {
  const normalized = (signal / halfSaturation) ** RESPONSE_EXPONENT;
  return normalized / (1 + normalized);
}
function readLocal(controller, fieldValue, ant) {
  controller.field = fieldValue;
  return controller.senseLocalTrail(ant);
}
function readWide(controller, fieldValue, ant) {
  controller.field = fieldValue;
  return WIDE_OFFSETS.map(offset => {
    const signal = controller.senseTrail(ant, ant.heading + offset);
    return { offset, signal, productionResponse: hillResponse(signal, WIDE_HALF_SATURATION) };
  });
}

function assertProbeParity(result, expected, expectedReport) {
  assert.equal(result.sourceRows, expected.summary.sourceRows, 'fixed source request count');
  assert.equal(result.readouts.length, expected.summary.readoutRows.length, 'saved recipient rows');
  for (let index = 0; index < result.readouts.length; index += 1) {
    const actual = result.readouts[index], row = expected.summary.readoutRows[index];
    assert.equal(actual.second, row.second, `recipient time at row ${index}`);
    assert.equal(actual.id, row.id, `recipient ID at row ${index}`);
    assert.equal(JSON.stringify(actual.native.local), JSON.stringify(row.control), `native profile parity at row ${index}`);
    assert.equal(JSON.stringify(actual.residence.local), JSON.stringify(row.residence), `residence profile parity at row ${index}`);
    assert.equal(actual.positiveNativeSupportMaterialFraction, row.sourceContext.materialContributingFraction,
      `frozen material-support context at row ${index}`);
    assert.equal(actual.positiveNativeSupportOldMaterialFraction, row.sourceContext.oldMaterialContributingFraction,
      `frozen old-material support context at row ${index}`);
  }
  assert.equal(result.checkpointParity.length, CHECKPOINTS.length);
  for (let index = 0; index < CHECKPOINTS.length; index += 1) {
    assert.equal(result.checkpointParity[index].seconds, CHECKPOINTS[index]);
    assert.equal(result.checkpointParity[index].nativeProjected96, true);
    assert.equal(result.checkpointParity[index].residenceProjected96, true);
    assert.equal(result.checkpointParity[index].nativeNodeSum, expectedReport.summary.maps[index].controlStats.nodeSum);
    assert.equal(result.checkpointParity[index].residenceNodeSum, expectedReport.summary.maps[index].residenceStats.nodeSum);
  }
}

function summarizeReadouts(readouts) {
  const names = ['left', 'center', 'right', 'strength', 'coherence', 'steering'];
  const summaries = { local: {}, wide: {}, nativeHeadroomByStrengthQuartile: [] };
  const matched = readouts.filter(row => row.null !== null);
  for (const name of names) {
    summaries.local[name] = {};
    for (const pair of ['residenceMinusNative', 'nullMinusNative', 'residenceMinusNull']) {
      const [left, right] = pair === 'residenceMinusNative' ? ['residence', 'native']
        : pair === 'nullMinusNative' ? ['null', 'native'] : ['residence', 'null'];
      const rows = pair === 'residenceMinusNative' ? readouts : matched;
      summaries.local[name][pair] = describe(rows.map(row => row[left].local[name] - row[right].local[name]));
    }
  }
  for (const pair of ['residenceMinusNative', 'nullMinusNative', 'residenceMinusNull']) {
    const [left, right] = pair === 'residenceMinusNative' ? ['residence', 'native']
      : pair === 'nullMinusNative' ? ['null', 'native'] : ['residence', 'null'];
    summaries.wide[pair] = {};
    for (const metric of ['signal', 'productionResponse']) {
      summaries.wide[pair][metric] = describe(matched.flatMap(row => row[left].wide.map((entry, index) => entry[metric] - row[right].wide[index][metric])));
    }
  }
  const sortedStrength = readouts.map(row => row.native.local.strength).sort((a, b) => a - b);
  const cuts = [0.25, 0.5, 0.75].map(p => sortedStrength[Math.min(sortedStrength.length - 1, Math.floor(p * sortedStrength.length))]);
  const groups = [[], [], [], []], steeringGroups = [[], [], [], []], materialGroups = [[], [], [], []];
  for (const row of matched) {
    const s = row.native.local.strength;
    const index = s <= cuts[0] ? 0 : s <= cuts[1] ? 1 : s <= cuts[2] ? 2 : 3;
    groups[index].push(row.residence.local.strength - row.null.local.strength);
    steeringGroups[index].push(row.residence.local.steering - row.null.local.steering);
    if (Number.isFinite(row.positiveNativeSupportMaterialFraction)) materialGroups[index].push(row);
  }
  summaries.nativeHeadroomByStrengthQuartile = groups.map((values, index) => ({
    label: ['Q1', 'Q2', 'Q3', 'Q4'][index],
    nativeStrengthRange: index === 0 ? [0, cuts[0]] : index === 3 ? [cuts[2], 1] : [cuts[index - 1], cuts[index]],
    count: values.length, residenceMinusNullStrength: describe(values),
    residenceMinusNullSteering: describe(steeringGroups[index]),
    positiveNativeSupportCount: materialGroups[index].length,
    positiveNativeSupportMaterialFraction: describe(materialGroups[index].map(row => row.positiveNativeSupportMaterialFraction)),
    materialSupportVsResidenceMinusNullStrengthPearson: correlation(
      materialGroups[index].map(row => row.positiveNativeSupportMaterialFraction),
      materialGroups[index].map(row => row.residence.local.strength - row.null.local.strength))
  }));
  summaries.nativeLocalStrength = describe(readouts.map(row => row.native.local.strength));
  summaries.nativeLocalHeadroom = describe(readouts.map(row => 1 - row.native.local.strength));
  summaries.nativeWideMaxResponse = describe(readouts.map(row => Math.max(...row.native.wide.map(entry => entry.productionResponse))));
  summaries.nativeWideMaxHeadroom = describe(readouts.map(row => 1 - Math.max(...row.native.wide.map(entry => entry.productionResponse))));
  const localAbsDelta = matched.map(row => Math.abs(row.residence.local.strength - row.null.local.strength));
  summaries.localHeadroomVsAbsoluteResidenceNullStrengthDifferencePearson = correlation(
    matched.map(row => 1 - row.native.local.strength), localAbsDelta);
  const materialContext = matched.filter(row => Number.isFinite(row.positiveNativeSupportMaterialFraction));
  summaries.positiveNativeSupportMaterialFraction = describe(materialContext.map(row => row.positiveNativeSupportMaterialFraction));
  summaries.positiveNativeSupportOldMaterialFraction = describe(materialContext.map(row => row.positiveNativeSupportOldMaterialFraction).filter(Number.isFinite));
  summaries.materialSupportVsResidenceMinusNullStrengthPearson = correlation(
    materialContext.map(row => row.positiveNativeSupportMaterialFraction),
    materialContext.map(row => row.residence.local.strength - row.null.local.strength));
  summaries.materialSupportVsAbsoluteResidenceNullStrengthDifferencePearson = correlation(
    materialContext.map(row => row.positiveNativeSupportMaterialFraction),
    materialContext.map(row => Math.abs(row.residence.local.strength - row.null.local.strength)));
  summaries.materialSupportVsAbsoluteResidenceNullSteeringDifferencePearson = correlation(
    materialContext.map(row => row.positiveNativeSupportMaterialFraction),
    materialContext.map(row => Math.abs(row.residence.local.steering - row.null.local.steering)));
  summaries.positiveNativeSupportContextCount = materialContext.length;
  summaries.massMatchedRecipientCount = matched.length;
  const wideMaxDifference = matched.map(row => Math.max(...row.residence.wide.map((entry, index) =>
    Math.abs(entry.productionResponse - row.null.wide[index].productionResponse))));
  summaries.maxAbsoluteWideResponseResidenceMinusNull = describe(wideMaxDifference);
  summaries.nativeWideHeadroomVsMaxAbsoluteResidenceNullResponseDifferencePearson = correlation(
    matched.map(row => 1 - Math.max(...row.native.wide.map(entry => entry.productionResponse))), wideMaxDifference);
  return summaries;
}
function correlation(a, b) {
  const n = a.length;
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < n; i += 1) { sa += a[i]; sb += b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i]; }
  const va = saa - sa * sa / n, vb = sbb - sb * sb / n;
  return va > 0 && vb > 0 ? (sab - sa * sb / n) / Math.sqrt(va * vb) : null;
}

function selfTest() {
  const exact = solveMassMatchedNull(Float32Array.from([0, 0.25, 1]), 2.5);
  assert.equal(exact.feasible, true);
  assert.equal(exact.k, 2);
  assert.ok(exact.relativeResidual < 1e-7);
  const capped = solveMassMatchedNull(Float32Array.from([10, 1]), 10, 8);
  assert.equal(capped.feasible, true);
  assert.equal(capped.cappedNodes, 1);
  assert.equal(capped.outputSum, 10);
  const impossible = solveMassMatchedNull(Float32Array.from([1, 1]), 16.01, 8);
  assert.equal(impossible.feasible, false);
  assert.equal(solveMassMatchedNull(new Float32Array(2), 0).k, 0);
  assert.equal(hillResponse(0.035, WIDE_HALF_SATURATION), 0.5);
  return { status: 'PASS', checks: ['mass-sum scale', 'cap response', 'capacity infeasibility', 'zero field', 'native wide Hill response'] };
}

async function run(save) {
  const inputDir = resolve(ROOT, INPUT), probeDir = resolve(ROOT, PROBE), outputDir = resolve(ROOT, PACKAGE, 'data');
  const read = async path => readFile(path);
  const [pairedBytes, emissionsBytes, sourceHashBytes, rawBytes, runSummaryBytes, probeBytes, probeReportBytes] = await Promise.all([
    read(resolve(inputDir, 'paired-input.json.gz')), read(resolve(inputDir, 'source-emissions.json.gz')),
    read(resolve(inputDir, 'SOURCE-HASHES.json')), read(resolve(inputDir, 'control/seed20261005-G-raw.json.gz')),
    read(resolve(inputDir, 'control/run-summary.json')), read(resolve(probeDir, 'data/replay.json.gz')),
    read(resolve(probeDir, 'results.json'))
  ]);
  const paired = jsonGz(pairedBytes), emissions = jsonGz(emissionsBytes), expectedProbe = jsonGz(probeBytes);
  const sourceHashes = JSON.parse(sourceHashBytes), raw = jsonGz(rawBytes), runSummary = JSON.parse(runSummaryBytes), probeReport = JSON.parse(probeReportBytes);
  assert.equal(paired.protocol.seconds, 600); assert.equal(paired.protocol.tickHz, 60);
  assert.equal(paired.control.actualBirthMasks.length, 36); assert.equal(raw.positions.length, 600);
  assert.equal(emissions.tickHz, 60); assert.equal(emissions.control.length, 100882); assert.equal(runSummary.ticks, TICKS);
  assert.equal(expectedProbe.summary.status, 'COMPLETE');
  assert.equal(sha(probeBytes), probeReport.outputSha256, 'prior exact probe gzip receipt');
  for (const [path, expected] of Object.entries(sourceHashes)) {
    assert.equal(sha(await read(resolve(ROOT, path))), expected, `frozen source hash ${path}`);
  }
  assert.equal(sha(pairedBytes), probeReport.inputs.pairedInputSha256, 'prior frozen paired-input receipt');
  assert.equal(sha(emissionsBytes), probeReport.inputs.emissionsSha256, 'prior frozen source-stream receipt');
  assert.deepEqual(sourceHashes, probeReport.inputs.sourceHashes, 'source pins agree with prior probe');
  const birthMasks = paired.control.actualBirthMasks;
  assert.ok(birthMasks.every((entry, index) => index === 0 || entry.bornAtSimulationTimeMs >= birthMasks[index - 1].bornAtSimulationTimeMs), 'actual masks ordered by birth time');
  assert.ok(emissions.control.every(row => row.deposit.type === 'point'), 'frozen source stream contains only registered point requests');

  const native = field(), residence = field(), nullField = field();
  const controller = Object.create(AntController.prototype);
  controller.state = { behavior: { sensorDistance: SENSOR_DISTANCE, sensorWidth: SENSOR_WIDTH } };
  const nativeActive = [], residenceActive = [];
  const nativeFlags = new Uint8Array(WIDTH * WIDTH), residenceFlags = new Uint8Array(WIDTH * WIDTH);
  const residenceFactors = new Float64Array(256);
  for (let layers = 0; layers < residenceFactors.length; layers += 1) {
    residenceFactors[layers] = Math.exp(-LN2 * DT / HALF_LIFE * pResidence(layers));
  }
  const layerMap = new Uint8Array(WIDTH * WIDTH);
  let birthIndex = 0, clockMs = 0, emissionIndex = 0, tick = 0, positionCount = 0;
  const checkpoints = [], timeseries = [], readouts = [];
  const parityMaps = new Map(expectedProbe.summary.maps.map(row => [row.seconds, row]));
  const directStats = new Map();
  for (const seconds of CHECKPOINTS) {
    const map = jsonGz(await read(resolve(inputDir, `control/seed20261005-G-${seconds}s.json.gz`)));
    directStats.set(seconds, map.pheromone.values);
  }
  const decayFactor = Math.exp(-LN2 * DT / HALF_LIFE);

  for (tick = 1; tick <= TICKS; tick += 1) {
    const startMs = clockMs;
    while (birthIndex < birthMasks.length && birthMasks[birthIndex].bornAtSimulationTimeMs <= startMs) {
      addMaterialMask(layerMap, birthMasks[birthIndex].mask);
      birthIndex += 1;
    }
    decayActive(native, nativeActive, nativeFlags, () => decayFactor);
    decayActive(residence, residenceActive, residenceFlags, index => residenceFactors[layerMap[index]]);
    while (emissionIndex < emissions.control.length && emissions.control[emissionIndex].tick === tick) {
      const request = emissions.control[emissionIndex++].deposit;
      native.depositPoint(request.position, { amount: request.amount, radius: RADIUS });
      residence.depositPoint(request.position, { amount: request.amount, radius: RADIUS });
      if (request.amount > 0) {
        const touched = footprintIndices(request.position);
        activate(nativeActive, nativeFlags, touched, native.values);
        activate(residenceActive, residenceFlags, touched, residence.values);
      }
    }
    clockMs += DT * 1000;
    if (tick % 60 !== 0) continue;

    const second = tick / 60, nativeStats = fieldStats(native.values), residenceStats = fieldStats(residence.values);
    if (CHECKPOINTS.includes(second)) {
      const expected = parityMaps.get(second);
      const nativeProjection = project96(native.values), residenceProjection = project96(residence.values);
      assert.deepEqual(nativeProjection, expected.control, `native projected96 parity ${second}s`);
      assert.deepEqual(residenceProjection, expected.residence, `residence projected96 parity ${second}s`);
      assert.deepEqual(nativeProjection, directStats.get(second), `native saved checkpoint map ${second}s`);
      const prior = probeReport.summary.maps.find(row => row.seconds === second);
      assert.equal(nativeStats.nodeSum, prior.controlStats.nodeSum, `native nodeSum ${second}s`);
      assert.equal(residenceStats.nodeSum, prior.residenceStats.nodeSum, `residence nodeSum ${second}s`);
      checkpoints.push({ seconds: second, nativeProjected96: true, residenceProjected96: true,
        nativeNodeSum: nativeStats.nodeSum, residenceNodeSum: residenceStats.nodeSum,
        nativeReconstructedIntegral: nativeStats.reconstructedIntegral,
        residenceReconstructedIntegral: residenceStats.reconstructedIntegral });
    }
    const matched = solveMassMatchedNull(native.values, residenceStats.nodeSum, MAX_VALUE);
    if (!matched.feasible) {
      timeseries.push({ second, native: nativeStats, residence: residenceStats, null: { feasible: false,
        targetSum: matched.targetSum, maximumFeasibleSum: matched.maximumFeasibleSum, positiveNodes: matched.positiveNodes } });
      const positions = raw.positions[second - 1];
      for (const agent of positions.agents) {
        const sourceContext = expectedProbe.summary.readoutRows[readouts.length]?.sourceContext;
        const pose = { x: agent.x, y: agent.y, heading: agent.heading };
        const aLocal = readLocal(controller, native, pose), bLocal = readLocal(controller, residence, pose);
        const aWide = readWide(controller, native, pose), bWide = readWide(controller, residence, pose);
        readouts.push({ second, id: agent.id, x: agent.x, y: agent.y, heading: agent.heading,
          native: { local: aLocal, wide: aWide }, residence: { local: bLocal, wide: bWide }, null: null,
          positiveNativeSupportMaterialFraction: sourceContext?.materialContributingFraction ?? null,
          positiveNativeSupportOldMaterialFraction: sourceContext?.oldMaterialContributingFraction ?? null,
          paired: { localStrengthResidenceMinusNative: bLocal.strength - aLocal.strength,
            localStrengthNullMinusNative: null, localStrengthResidenceMinusNull: null, localSteeringResidenceMinusNull: null,
            localCoherenceResidenceMinusNull: null, wideResponseResidenceMinusNull: null } });
      }
      positionCount += positions.agents.length;
      continue;
    }
    nullField.values = matched.values;
    const spatial = pearsonMetrics(residence.values, nullField.values, layerMap);
    const timeRow = { second, native: nativeStats, residence: residenceStats,
      null: { ...matched, values: undefined }, spatial };
    timeseries.push(timeRow);

    const positions = raw.positions[second - 1];
    for (const agent of positions.agents) {
      const sourceContext = expectedProbe.summary.readoutRows[readouts.length]?.sourceContext;
      const pose = { x: agent.x, y: agent.y, heading: agent.heading };
      const aLocal = readLocal(controller, native, pose);
      const bLocal = readLocal(controller, residence, pose);
      const cLocal = readLocal(controller, nullField, pose);
      const aWide = readWide(controller, native, pose);
      const bWide = readWide(controller, residence, pose);
      const cWide = readWide(controller, nullField, pose);
      readouts.push({ second, id: agent.id, x: agent.x, y: agent.y, heading: agent.heading,
        native: { local: aLocal, wide: aWide }, residence: { local: bLocal, wide: bWide }, null: { local: cLocal, wide: cWide },
        positiveNativeSupportMaterialFraction: sourceContext?.materialContributingFraction ?? null,
        positiveNativeSupportOldMaterialFraction: sourceContext?.oldMaterialContributingFraction ?? null,
        paired: { localStrengthResidenceMinusNative: bLocal.strength - aLocal.strength,
          localStrengthNullMinusNative: cLocal.strength - aLocal.strength,
          localStrengthResidenceMinusNull: bLocal.strength - cLocal.strength,
          localSteeringResidenceMinusNull: bLocal.steering - cLocal.steering,
          localCoherenceResidenceMinusNull: bLocal.coherence - cLocal.coherence,
          wideResponseResidenceMinusNull: bWide.map((value, index) => value.productionResponse - cWide[index].productionResponse) } });
    }
    positionCount += positions.agents.length;
  }
  assert.equal(emissionIndex, emissions.control.length, 'all frozen writes consumed');
  assert.equal(timeseries.length, 600, 'one mass-match receipt for every saved time');
  assert.equal(readouts.length, positionCount);

  const parity = { sourceRows: emissionIndex, readouts, checkpointParity: checkpoints };
  assertProbeParity(parity, expectedProbe, probeReport);
  const localSummaries = summarizeReadouts(readouts);
  const feasibleTimes = timeseries.filter(row => row.null.feasible);
  const fieldSummary = {
    nodeSumRatioResidenceToNative: describe(timeseries.map(row => row.residence.nodeSum / row.native.nodeSum)),
    massMatchAbsoluteResidual: describe(feasibleTimes.map(row => row.null.absoluteResidual)),
    massMatchRelativeResidual: describe(feasibleTimes.map(row => row.null.relativeResidual)),
    k: describe(feasibleTimes.map(row => row.null.k)),
    cappedNodes: describe(feasibleTimes.map(row => row.null.cappedNodes)),
    cappedFractionOfPositive: describe(feasibleTimes.map(row => row.null.cappedFractionOfPositive)),
    capRemovedSum: describe(feasibleTimes.map(row => row.null.capRemovedSum)),
    capRemovedFractionOfTarget: describe(feasibleTimes.map(row => row.null.capRemovedFractionOfTarget)),
    residenceNullPearson: describe(feasibleTimes.map(row => row.spatial.pearsonCorrelation)),
    normalizedL1ResidenceNull: describe(feasibleTimes.map(row => row.spatial.normalizedL1)),
    materialMeanResidenceMinusNull: describe(feasibleTimes.map(row => row.spatial.material.meanResidenceMinusNull)),
    bareMeanResidenceMinusNull: describe(feasibleTimes.map(row => row.spatial.bare.meanResidenceMinusNull))
  };
  const inputs = {
    pairedInputSha256: sha(pairedBytes), emissionsSha256: sha(emissionsBytes), sourceHashManifestSha256: sha(sourceHashBytes),
    savedRawPositionsSha256: sha(rawBytes), controlRunSummarySha256: sha(runSummaryBytes),
    residenceProbeReplaySha256: sha(probeBytes), residenceProbeResultsSha256: sha(probeReportBytes),
    sourceHashes
  };
  const artifact = {
    schema: 'ant-material-chemical-residence-locality-v1',
    authority: { productionMain: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785',
      researchBase: '3b61f995c8e514e848b1d4133812fa855db92c04', branch: 'codex/ant-material-feedback-space-20261030' },
    inputs,
    protocol: { seconds: 600, tickHz: 60, savedReadTimes: 'post-tick at each integer model second, 1..600',
      recipients: 'all saved production-control positions/headings; no agents tick or respond', sourceRequestRows: emissionIndex,
      fields: { native: 'PheromoneField production 15s decay then frozen requests in recorded order',
        residence: 'exact prior probe 15..30s material-conditioned decay; tick-entry actual masks on nearest 96-grid; decay before writes',
        null: 'independent per-time Float32 snapshot C_i=min(8,k*A_i); deterministic nonnegative scalar k minimizes node-sum residual to B' },
      nullSolver: 'use target/native node-sum scale if uncapped; otherwise bracket and bisect up to 64 times against Float32 node sums; compare bracket endpoints and midpoint, tie toward lower k',
      sensor: { local: 'production senseLocalTrail at saved pose/heading', wide: 'production senseTrail at fixed source-defined offsets [-.92,-.47,0,.47,.92] from saved heading; these are prospective probes, not the jittered headings actually selected in world ticks',
        wideResponse: 'production Hill response formula (signal/.035)^3 / (1+(signal/.035)^3)',
        nativeLocalHeadroom: '1 - native senseLocalTrail strength; continuous',
        nativeWideHeadroom: '1 - maximum of five native wide Hill responses; continuous' },
      headroomGroups: 'four ranges cut from native local strength at pooled empirical p25/p50/p75 before computing B-C summaries; ties remain in the lower inclusive range; material support is the prior probe geometric fraction of positive native bilinear support, not signal attribution',
      nodeSumMeaning: 'native storage coefficient sum, not a resolution-independent physical mass',
      noRng: true, noAgentTick: true, noCounterfactualWorld: true },
    validation: { exactNativeResidenceProbeReadoutParity: true, exactNativeResidenceCheckpointMapParity: true,
      sourceRequestsConsumed: emissionIndex, savedRecipients: readouts.length, checkpointParity: checkpoints,
      noRandomCalls: true, productionUnchanged: true },
    summary: { native: localSummaries.nativeLocalStrength, residenceVsNull: {
      local: localSummaries.local, wide: localSummaries.wide,
      localHeadroom: { nativeStrength: localSummaries.nativeLocalStrength, nativeHeadroom: localSummaries.nativeLocalHeadroom,
        bMinusCByAHeadroomQuartile: localSummaries.nativeHeadroomByStrengthQuartile,
        headroomVsAbsoluteStrengthDifferencePearson: localSummaries.localHeadroomVsAbsoluteResidenceNullStrengthDifferencePearson,
        positiveNativeSupportContextCount: localSummaries.positiveNativeSupportContextCount,
        positiveNativeSupportMaterialFraction: localSummaries.positiveNativeSupportMaterialFraction,
        positiveNativeSupportOldMaterialFraction: localSummaries.positiveNativeSupportOldMaterialFraction,
        materialSupportVsResidenceMinusNullStrengthPearson: localSummaries.materialSupportVsResidenceMinusNullStrengthPearson,
        materialSupportVsAbsoluteResidenceNullStrengthDifferencePearson: localSummaries.materialSupportVsAbsoluteResidenceNullStrengthDifferencePearson,
        materialSupportVsAbsoluteResidenceNullSteeringDifferencePearson: localSummaries.materialSupportVsAbsoluteResidenceNullSteeringDifferencePearson },
      wide: { nativeMaxResponse: localSummaries.nativeWideMaxResponse, nativeMaxHeadroom: localSummaries.nativeWideMaxHeadroom,
        maxAbsoluteResidenceMinusNullResponse: localSummaries.maxAbsoluteWideResponseResidenceMinusNull,
        nativeHeadroomVsMaxAbsoluteResponseDifferencePearson: localSummaries.nativeWideHeadroomVsMaxAbsoluteResidenceNullResponseDifferencePearson } },
      fields: fieldSummary, feasibleAtEveryReadTime: timeseries.every(row => row.null.feasible), feasibleTimeCount: feasibleTimes.length,
      infeasibleTimes: timeseries.filter(row => !row.null.feasible).map(row => row.second),
      timeCount: timeseries.length, recipientCount: readouts.length,
      interpretationLimit: 'Single frozen history and serial recipient snapshots; profile differences are matched-state readouts, not ant behavior or independent trials.' },
    timeseries, readouts
  };
  const bytes = gzipJson(artifact), report = { ...artifact };
  delete report.readouts; delete report.timeseries;
  report.data = 'data/locality-results.json.gz'; report.dataSha256 = sha(bytes);
  if (save) {
    await mkdir(outputDir, { recursive: true });
    await writeFile(resolve(outputDir, 'locality-results.json.gz'), bytes);
    await writeFile(resolve(ROOT, PACKAGE, 'results.json'), Buffer.from(JSON.stringify(report, null, 2) + '\n'));
  } else {
    const oldBytes = await readFile(resolve(outputDir, 'locality-results.json.gz'));
    const oldReport = JSON.parse(await readFile(resolve(ROOT, PACKAGE, 'results.json'), 'utf8'));
    assert.equal(sha(bytes), sha(oldBytes), 'deterministic compressed analysis');
    assert.deepEqual(report, oldReport, 'deterministic compact analysis report');
  }
  console.log(JSON.stringify({ status: 'COMPLETE', dataSha256: report.dataSha256, times: timeseries.length, recipients: readouts.length,
    allMassMatchesFeasible: artifact.summary.feasibleAtEveryReadTime, medianRelativeResidual: fieldSummary.massMatchRelativeResidual.median,
    maxCappedFraction: fieldSummary.cappedFractionOfPositive.max }));
  return { bytes, report };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--self-test')) { console.log(JSON.stringify(selfTest())); return; }
  if (args.has('--run')) { await run(true); return; }
  if (args.has('--check')) {
    selfTest();
    const actual = await run(false);
    console.log(JSON.stringify({ status: 'CHECK-PASS', dataSha256: sha(actual.bytes) }));
    return;
  }
  throw new Error('Use --self-test, --run, or --check.');
}

export { solveMassMatchedNull, hillResponse, summarizeReadouts };
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
