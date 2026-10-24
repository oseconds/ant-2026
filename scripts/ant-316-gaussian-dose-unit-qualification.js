import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { evaluateCueGate, preflight } from './ant-cic-writer-qualification.js';
import {
  compareMetrics, expectedGaussianNodes, metricsForEachArm, verifyFrozenControls, withMathRandomForbidden,
  SIZE, RADIUS, SIGMA, PACKAGE as F_PACKAGE
} from './ant-316-gaussian-fixed-cue-qualification.js';
import { evaluateWide, INPUT_SHA256, localStages, SOURCE_HASHES } from './ant-field-writer-reader-failure-attribution.js';

export const PACKAGE = 'docs/ant/evidence/2026-10-24-cic-316-gaussian-dose-unit-qualification';
export const SCALE_NUMERATOR = 3969;
export const SCALE_DENOMINATOR = 361;
export const DOSE_SCALE = SCALE_NUMERATOR / SCALE_DENOMINATOR;
const SIZE_96 = 96;
const H96 = 1 / (SIZE_96 - 1);
const H316 = 1 / (SIZE - 1);
const MAX_VALUE = 8;
const U32 = 2 ** -24;
const ALPHA32 = 2 ** -150;
const FROZEN_F = 'docs/ant/evidence/2026-10-24-cic-316-gaussian-fixed-cue-qualification';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILIES = ['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve'];
const PHASES = ['p00', 'p10', 'p01', 'p11'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const gzipJson = path => JSON.parse(gunzipSync(readFileSync(resolve(ROOT, path))));
const write = (path, data) => {
  const target = resolve(ROOT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
};
const writeJson = (path, value) => write(path, `${JSON.stringify(value, null, 2)}\n`);
const keyOf = row => `${row.shape}|${row.phase}|${row.station}`;
const winner = wide => wide.candidates[wide.scoreOrder[0]].offset;
const sign = value => Math.abs(value) <= 64 * Number.EPSILON * Math.max(1, Math.abs(value)) ? 0 : Math.sign(value);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function assertSameNumbers(actual, expected, label) {
  if (typeof actual === 'number' || typeof expected === 'number') {
    assert(actual === expected || (actual === 0 && expected === 0), `${label}: number parity`);
    return;
  }
  if (actual === null || expected === null || typeof actual !== 'object' || typeof expected !== 'object') {
    assert.equal(actual, expected, label);
    return;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    assert(Array.isArray(actual) && Array.isArray(expected), `${label}: array shape`);
    assert.equal(actual.length, expected.length, `${label}: array length`);
    for (let index = 0; index < actual.length; index += 1) assertSameNumbers(actual[index], expected[index], `${label}[${index}]`);
    return;
  }
  const aKeys = Object.keys(actual).sort(), eKeys = Object.keys(expected).sort();
  assert.deepEqual(aKeys, eKeys, `${label}: object keys`);
  for (const key of aKeys) assertSameNumbers(actual[key], expected[key], `${label}.${key}`);
}

function distribution(values) {
  if (!values.length) return { count: 0, mean: null, min: null, p50: null, p90: null, max: null };
  const sorted = Float64Array.from(values).sort();
  const at = q => sorted[Math.round(q * (sorted.length - 1))];
  return { count: values.length, mean: mean(values), min: at(0), p50: at(0.5), p90: at(0.9), max: at(1) };
}

function float32Bound(increment, before) {
  return U32 * Math.abs(before + increment) + ALPHA32;
}

export function bilinearIntegral(values, width, height = width) {
  assert.equal(values.length, width * height);
  const hx = 1 / (width - 1), hy = 1 / (height - 1);
  let sum = 0;
  for (let y = 0; y < height; y += 1) {
    const wy = y === 0 || y === height - 1 ? 0.5 : 1;
    for (let x = 0; x < width; x += 1) {
      const wx = x === 0 || x === width - 1 ? 0.5 : 1;
      sum += values[y * width + x] * wx * wy;
    }
  }
  return sum * hx * hy;
}

function fieldStats(field) {
  let mass = 0, peak = 0, support = 0, edgeSupport = 0, xMoment = 0, yMoment = 0;
  for (let index = 0; index < field.values.length; index += 1) {
    const value = field.values[index];
    assert(Number.isFinite(value) && value >= 0, 'finite nonnegative field values');
    mass += value;
    peak = Math.max(peak, value);
    if (value > 0) {
      support += 1;
      const x = index % field.width, y = Math.floor(index / field.width);
      if (x === 0 || y === 0 || x === field.width - 1 || y === field.height - 1) edgeSupport += 1;
      xMoment += value * x / (field.width - 1);
      yMoment += value * y / (field.height - 1);
    }
  }
  const bytes = Buffer.from(field.values.buffer, field.values.byteOffset, field.values.byteLength);
  return { width: field.width, height: field.height, bytes: bytes.length, sha256: sha(bytes), mass, peak, support,
    edgeSupport, centroid: mass > 0 ? { x: xMoment / mass, y: yMoment / mass } : null,
    integral: bilinearIntegral(field.values, field.width, field.height) };
}

export function doseUnitSanity() {
  const derived = ((1 / 95) / (1 / 315)) ** 2;
  assert.equal(DOSE_SCALE, derived, 'fixed factor equals the grid-area ratio');
  const single96 = new Float32Array(96 * 96), single316 = new Float32Array(316 * 316);
  single96[48 * 96 + 47] = 1;
  single316[158 * 316 + 157] = DOSE_SCALE;
  const singleTarget = H96 ** 2;
  const singleLegacy = bilinearIntegral(single96, 96);
  const singleScaled = bilinearIntegral(single316, 316);
  const singleFloatBound = float32Bound(DOSE_SCALE, 0) * H316 ** 2;

  const values = [0.125, 0.75, 1.5, 2.25, 0.0625, 3.125, 0.5];
  const generic96 = new Float32Array(96 * 96), generic316 = new Float32Array(316 * 316);
  const positions96 = [[47, 46], [48, 46], [49, 47], [50, 48], [49, 49], [48, 50], [47, 49]];
  const positions316 = [[157, 156], [158, 156], [159, 157], [160, 158], [159, 159], [158, 160], [157, 159]];
  values.forEach((value, index) => {
    const [x96, y96] = positions96[index], [x316, y316] = positions316[index];
    generic96[y96 * 96 + x96] = value;
    generic316[y316 * 316 + x316] = value * DOSE_SCALE;
  });
  const genericTarget = Array.from(generic96).reduce((sum, value) => sum + value, 0) * H96 ** 2;
  const genericLegacy = bilinearIntegral(generic96, 96);
  const genericScaled = bilinearIntegral(generic316, 316);
  const genericRoundBound = positions316.reduce((sum, [,], index) => {
    const scaled = values[index] * DOSE_SCALE;
    return sum + float32Bound(scaled, 0) * H316 ** 2;
  }, 0);
  const arithmeticGuard = 64 * Number.EPSILON * Math.max(1, genericTarget);
  assert.equal(singleLegacy, singleTarget);
  assert(Math.abs(singleScaled - singleTarget) <= singleFloatBound + 64 * Number.EPSILON * singleTarget);
  assert(Math.abs(genericLegacy - genericTarget) <= arithmeticGuard,
    'generic 96-grid trapezoid agrees with the derived interior nodal integral');
  assert(Math.abs(genericScaled - genericTarget) <= genericRoundBound + arithmeticGuard);

  const f = new PheromoneField({ width: SIZE, height: SIZE });
  const g = new PheromoneField({ width: SIZE, height: SIZE });
  const index = 157 * SIZE + 157;
  f.values[index] = 0.125;
  g.values[index] = f.values[index] * DOSE_SCALE;
  const dt = 2.75, decayFactor = Math.exp(-Math.LN2 * dt / f.decayHalfLifeSeconds);
  const fExpected = Math.fround(f.values[index] * decayFactor);
  const gExpected = Math.fround(g.values[index] * decayFactor);
  f.decay(dt); g.decay(dt);
  assert.equal(f.values[index], fExpected);
  assert.equal(g.values[index], gExpected);
  return {
    scale: { numerator: SCALE_NUMERATOR, denominator: SCALE_DENOMINATOR, value: DOSE_SCALE, derivedValue: derived },
    singleInteriorNode: { legacyIntegral: singleLegacy, scaled316Integral: singleScaled, expected: singleTarget,
      residual: singleScaled - singleTarget },
    genericInteriorNodes: { nodeValues: values, legacyIntegral: genericLegacy, scaled316Integral: genericScaled,
      expected: genericTarget, residual: genericScaled - genericTarget, derivedFloat32Bound: genericRoundBound,
      arithmeticGuard },
    decay: { dtSeconds: dt, halfLifeSeconds: f.decayHalfLifeSeconds, factor: decayFactor,
      unchangedFormulaExact: true, rngCalls: 0 }
  };
}

function prepareFControls(preflightResult) {
  const controls = verifyFrozenControls(preflightResult);
  const oldRowsBytes = readFileSync(resolve(ROOT, `${F_PACKAGE}/gate2/rows.json.gz`));
  const oldRows = JSON.parse(gunzipSync(oldRowsBytes));
  const fResults = json(`${F_PACKAGE}/RESULTS.json`);
  const fHashes = json(`${F_PACKAGE}/generation-hashes.json`);
  const fGate1Bytes = readFileSync(resolve(ROOT, `${F_PACKAGE}/gate1/representation.json`));
  assert.equal(sha(oldRowsBytes), fHashes.gate2Rows, 'F saved row artifact hash');
  assert.equal(sha(fGate1Bytes), fHashes.gate1, 'F saved representation receipt hash');
  assert.equal(oldRows.length, 5544);
  assert.equal(fResults.provenance.frozenRowsSha256, INPUT_SHA256);
  assert.equal(controls.verifiedPrior.receipts.strictUnique, 5072);
  assert.equal(controls.verifiedPrior.receipts.CErrors, 2378);
  assert.equal(controls.verifiedPrior.receipts.DErrors, 2378);
  assert.equal(controls.verifiedPrior.receipts.EErrors, 1017);
  assert.equal(controls.verifiedPrior.receipts.recovered, 92);
  assert.equal(controls.verifiedPrior.receipts.newErrors, 92);
  return { ...controls, oldRows, oldRowsBytes, fResults, fHashes,
    fGate1: JSON.parse(fGate1Bytes), fGate1Sha256: sha(fGate1Bytes) };
}

function rasterBytes(field) {
  return Buffer.from(field.values.buffer, field.values.byteOffset, field.values.byteLength);
}

function integratedErrorBound(roundBounds, width, height) {
  const hx = 1 / (width - 1), hy = 1 / (height - 1);
  let bound = 0;
  for (let index = 0; index < roundBounds.length; index += 1) {
    const x = index % width, y = Math.floor(index / width);
    const edgeWeight = (x === 0 || x === width - 1 ? 0.5 : 1) * (y === 0 || y === height - 1 ? 0.5 : 1);
    bound += roundBounds[index] * edgeWeight * hx * hy;
  }
  return bound;
}

function replayAndAudit(preflightResult, controls) {
  const fFields = new Map(), gFields = new Map(), arms = [];
  const fRasterReceipts = new Map(controls.fGate1.frozenStreams.arms.map(arm => [arm.id, arm.raster]));
  let firstCap = null, cappedWriteNodeCount = 0;
  const supportCountHistogram = {};
  let allSupportIdentical = true, profileComparisons = 0, incrementFractionArithmeticDifferences = 0;
  let maximumIncrementFractionArithmeticDifference = 0;
  let maximumNodeScaleResidual = 0, maximumNodeScaleBoundRatio = 0, maximumCentroidDifference = 0;
  let maximumPositiveNodeDistance = 0, maxCapLossFromClamp = 0;

  for (const arm of preflightResult.streams.arms) {
    const f = new PheromoneField({ width: SIZE, height: SIZE });
    const g = new PheromoneField({ width: SIZE, height: SIZE });
    const fRoundBounds = new Float64Array(f.values.length), gRoundBounds = new Float64Array(g.values.length);
    const idealGByNode = new Float64Array(g.values.length);
    let requestedDose = 0, scaledRequestedDose = 0, fAcceptedDose = 0, gAcceptedDose = 0;
    let maxNodeDistance = 0;
    let armCapHitWriteNodeCount = 0, armCapLossFromClamp = 0;
    const armCappedNodes = new Set();
    const supportCounts = {};

    for (let writeIndex = 0; writeIndex < arm.writes.length; writeIndex += 1) {
      const event = arm.writes[writeIndex];
      const { x, y } = event.gridPosition;
      const amount = event.requestedAmount, scaledAmount = amount * DOSE_SCALE;
      assert(Number.isFinite(scaledAmount) && scaledAmount > 0, `${arm.id} scaled write amount`);
      const stencil = expectedGaussianNodes(x, y, SIZE, SIZE, RADIUS);
      assert(stencil.nodes.length > 0 && stencil.weightTotal > 0, `${arm.id} no fallback in frozen write`);
      supportCounts[stencil.nodes.length] = (supportCounts[stencil.nodes.length] || 0) + 1;
      supportCountHistogram[stencil.nodes.length] = (supportCountHistogram[stencil.nodes.length] || 0) + 1;
      const beforeF = stencil.nodes.map(node => f.values[node.index]);
      const beforeG = stencil.nodes.map(node => g.values[node.index]);
      const acceptedF = f.depositPoint({ x, y }, { amount, radius: RADIUS });
      const acceptedG = g.depositPoint({ x, y }, { amount: scaledAmount, radius: RADIUS });
      assert.equal(acceptedF, amount);
      assert.equal(acceptedG, scaledAmount);
      requestedDose += amount; scaledRequestedDose += scaledAmount;
      fAcceptedDose += acceptedF; gAcceptedDose += acceptedG;

      stencil.nodes.forEach((node, nodeOffset) => {
        maxNodeDistance = Math.max(maxNodeDistance, node.distance);
        const fIncrement = amount * node.weight / stencil.weightTotal;
        const gIncrement = scaledAmount * node.weight / stencil.weightTotal;
        const fAfter = Math.fround(Math.min(MAX_VALUE, beforeF[nodeOffset] + fIncrement));
        const gAfter = Math.fround(Math.min(MAX_VALUE, beforeG[nodeOffset] + gIncrement));
        assert.equal(f.values[node.index], fAfter, `${arm.id} F production update`);
        assert.equal(g.values[node.index], gAfter, `${arm.id} G scaled production update`);
        fRoundBounds[node.index] += float32Bound(fIncrement, beforeF[nodeOffset]);
        gRoundBounds[node.index] += float32Bound(gIncrement, beforeG[nodeOffset]);
        idealGByNode[node.index] += gIncrement;
        const fractionDifference = Math.abs((gIncrement / scaledAmount) - (fIncrement / amount));
        profileComparisons += 1;
        if (fractionDifference !== 0) incrementFractionArithmeticDifferences += 1;
        maximumIncrementFractionArithmeticDifference = Math.max(maximumIncrementFractionArithmeticDifference, fractionDifference);
        if (gAfter >= MAX_VALUE) {
          cappedWriteNodeCount += 1;
          armCapHitWriteNodeCount += 1;
          armCappedNodes.add(node.index);
          if (!firstCap) firstCap = { arm: arm.id, writeIndex, position: { x, y }, nodeIndex: node.index,
            before: beforeG[nodeOffset], requestedIncrement: gIncrement, postWriteValue: gAfter };
        }
        const unclamped = beforeG[nodeOffset] + gIncrement;
        if (unclamped > MAX_VALUE) {
          const loss = unclamped - MAX_VALUE;
          maxCapLossFromClamp += loss;
          armCapLossFromClamp += loss;
        }
      });
      maximumPositiveNodeDistance = Math.max(maximumPositiveNodeDistance, maxNodeDistance);
    }

    assert.equal(arm.writes.length, 77);
    const fStats = fieldStats(f), gStats = fieldStats(g), cField = preflightResult.fields.get(arm.id);
    const cStats = fieldStats(cField);
    const fReceipt = fRasterReceipts.get(arm.id);
    assert(fReceipt, `${arm.id} missing saved F raster receipt`);
    const priorFBytes = readFileSync(resolve(ROOT, fReceipt.file));
    assert.equal(sha(priorFBytes), fReceipt.sha256, `${arm.id} saved F raster`);
    assert.equal(fStats.sha256, fReceipt.sha256, `${arm.id} regenerated F raster`);
    assert(rasterBytes(f).equals(priorFBytes), `${arm.id} F raster bytes`);
    assert.equal(fStats.width, SIZE);
    assert.equal(fStats.edgeSupport, 0, `${arm.id} F frozen writes remain interior`);
    assert.equal(cStats.edgeSupport, 0, `${arm.id} C frozen writes remain interior`);

    let maximumResidual = 0, maximumBoundRatio = 0;
    for (let index = 0; index < f.values.length; index += 1) {
      const residual = Math.abs(g.values[index] - f.values[index] * DOSE_SCALE);
      const bound = gRoundBounds[index] + DOSE_SCALE * fRoundBounds[index]
        + 64 * Number.EPSILON * Math.max(1, Math.abs(f.values[index] * DOSE_SCALE));
      assert(residual <= bound, `${arm.id} scaled raster Float32 accumulation bound`);
      maximumResidual = Math.max(maximumResidual, residual);
      maximumBoundRatio = Math.max(maximumBoundRatio, bound > 0 ? residual / bound : 0);
      if ((f.values[index] > 0) !== (g.values[index] > 0)) allSupportIdentical = false;
    }
    maximumNodeScaleResidual = Math.max(maximumNodeScaleResidual, maximumResidual);
    maximumNodeScaleBoundRatio = Math.max(maximumNodeScaleBoundRatio, maximumBoundRatio);
    if (!allSupportIdentical) assert.fail(`${arm.id} F/G active raster support differs`);
    if (fStats.centroid && gStats.centroid) maximumCentroidDifference = Math.max(maximumCentroidDifference,
      Math.hypot(fStats.centroid.x - gStats.centroid.x, fStats.centroid.y - gStats.centroid.y));

    const expectedLegacyIntegral = requestedDose * H96 ** 2;
    const gStorageBound = integratedErrorBound(gRoundBounds, SIZE, SIZE);
    const integralGuard = 64 * Number.EPSILON * Math.max(1, Math.abs(expectedLegacyIntegral));
    const gIntegralResidual = gStats.integral - expectedLegacyIntegral;
    const idealGIntegral = bilinearIntegral(idealGByNode, SIZE, SIZE);
    assert(Math.abs(idealGIntegral - expectedLegacyIntegral) <= 64 * Number.EPSILON * Math.max(1, expectedLegacyIntegral),
      `${arm.id} ideal G integral maps to legacy 96 convention`);
    assert(Math.abs(gIntegralResidual) <= gStorageBound + integralGuard,
      `${arm.id} G bilinear integral within derived Float32 bound`);

    const gBytes = rasterBytes(g);
    const gFile = `${PACKAGE}/gate1/rasters/${arm.id.replace('|', '-')}.f32le`;
    write(gFile, gBytes);
    arms.push({ id: arm.id, writeCount: arm.writes.length, requestedDose, scaledRequestedDose, fAcceptedDose, gAcceptedDose,
      scaledDoseDifferenceFromExactFactor: scaledRequestedDose - requestedDose * DOSE_SCALE,
      storedNodeSum: gStats.mass, storedMinusAccepted: gStats.mass - gAcceptedDose,
      idealNodalDoseMinusStored: idealGByNode.reduce((sum, value, index) => sum + value - g.values[index], 0),
      capLossFromClampedIncrements: armCapLossFromClamp, capHitWriteNodeCount: armCapHitWriteNodeCount,
      cappedNodes: armCappedNodes.size,
      supportNodeCountPerWrite: supportCounts, maximumActiveNodeDistance: maxNodeDistance,
      fRasterSha256: fStats.sha256, gRaster: { file: gFile.replaceAll('\\', '/'), ...gStats },
      cLegacyBilinearIntegral: cStats.integral, fBilinearIntegral: fStats.integral,
      gBilinearIntegral: gStats.integral, legacy96TargetIntegral: expectedLegacyIntegral,
      gIntegralResidual, gDerivedStorageBound: gStorageBound, integralArithmeticGuard: integralGuard,
      integralInteriorNodesOnly: gStats.edgeSupport === 0 });
    fFields.set(arm.id, f);
    gFields.set(arm.id, g);
  }

  const capRows = arms.map(arm => ({ id: arm.id, requestedDose: arm.scaledRequestedDose,
    acceptedDose: arm.gAcceptedDose, storedNodeSum: arm.storedNodeSum,
    capHitWriteNodeCount: arm.capHitWriteNodeCount, cappedNodes: arm.cappedNodes,
    clampedIncrementLoss: arm.capLossFromClampedIncrements,
    Float32AndAccumulationResidual: arm.idealNodalDoseMinusStored }));
  const capHits = arms.reduce((sum, arm) => sum + arm.capHitWriteNodeCount, 0);
  const capCountFromFields = [...gFields.values()].reduce((sum, field) =>
    sum + field.values.reduce((count, value) => count + (value >= MAX_VALUE ? 1 : 0), 0), 0);
  const result = {
    schema: 'ant-316-gaussian-dose-unit-gate1/v1',
    candidate: { label: 'G', grid: [SIZE, SIZE], h: H316, radius: RADIUS, sigma: SIGMA,
      scale: { numerator: SCALE_NUMERATOR, denominator: SCALE_DENOMINATOR, value: DOSE_SCALE },
      writer: 'unchanged PheromoneField production Gaussian depositPoint/depositBrush; each requested event amount multiplied by scale',
      reader: 'unchanged production bilinear sample', maxValue: MAX_VALUE, decayHalfLifeSeconds: 15 },
    unitSanity: doseUnitSanity(),
    totals: { routePhaseArms: arms.length, writes: arms.reduce((sum, arm) => sum + arm.writeCount, 0),
      unscaledRequestedDose: arms.reduce((sum, arm) => sum + arm.requestedDose, 0),
      scaledRequestedDose: arms.reduce((sum, arm) => sum + arm.scaledRequestedDose, 0),
      acceptedDose: arms.reduce((sum, arm) => sum + arm.gAcceptedDose, 0),
      storedNodeSum: arms.reduce((sum, arm) => sum + arm.storedNodeSum, 0) },
    support: { nodeCountsAcrossWrites: supportCountHistogram, maxActiveNodeDistance: maximumPositiveNodeDistance,
      supportIdenticalFtoG: allSupportIdentical, sharedGaussianWeightFormula: true,
      perWriteNodeProfileComparisons: profileComparisons,
      incrementFractionArithmeticDifferences, maximumIncrementFractionArithmeticDifference },
    float32ScaleParity: { maxAbsNodeResidual: maximumNodeScaleResidual, maxDerivedBoundRatio: maximumNodeScaleBoundRatio,
      maxCentroidDifference: maximumCentroidDifference },
    capAudit: { capValue: MAX_VALUE, anyHit: capHits > 0 || capCountFromFields > 0,
      hitWriteNodeCount: capHits, cappedNodeCount: capCountFromFields, firstCappedWrite: firstCap,
      affectedArms: arms.filter(arm => arm.gRaster.peak >= MAX_VALUE).map(arm => arm.id),
      sumOfPerWriteClampLoss: maxCapLossFromClamp,
      perArm: capRows },
    integral: { definition: 'exact integral of the piecewise-bilinear surface using tensor-product trapezoid weights',
      expectedLegacy96Convention: 'sum(original requested event doses) × (1/95)^2 for uncapped interior writes',
      maximumAbsoluteGResidual: Math.max(...arms.map(arm => Math.abs(arm.gIntegralResidual))),
      maximumAbsoluteFResidualToItsOwn316Legacy: Math.max(...arms.map(arm => Math.abs(arm.fBilinearIntegral - arm.requestedDose * H316 ** 2))),
      allGArmsWithinDerivedFloat32Bounds: arms.every(arm => Math.abs(arm.gIntegralResidual) <= arm.gDerivedStorageBound + arm.integralArithmeticGuard),
      allCAndGSupportInterior: arms.every(arm => arm.integralInteriorNodesOnly),
      edgeBoundaryCaveat: 'boundary node hats have half/quarter bilinear area; this relation is only claimed for these interior route fixtures' },
    arms
  };
  result.status = result.capAudit.anyHit ? 'INCONCLUSIVE — SATURATION' : 'PASS';
  result.frozenF = { arms: fFields.size, allFHashesMatch: true, allFBytesMatch: true };
  result.generatedGFields = gFields;
  result.generatedFFields = fFields;
  return result;
}

export function assertUncappedAudit(audit) {
  assert.equal(audit.status, 'PASS', 'Candidate G stops before cue evaluation if any node hits cap 8');
  assert.equal(audit.capAudit.anyHit, false);
  assert.equal(audit.capAudit.hitWriteNodeCount, 0);
  assert.equal(audit.capAudit.cappedNodeCount, 0);
}

function crossCheckProductionSensors(row, rawLocal, rawWide, local, wide) {
  const heading = row.wideGeometry[2].heading;
  const agent = { heading, x: row.localGeometry[4].x - Math.cos(heading) * 0.016,
    y: row.localGeometry[4].y - Math.sin(heading) * 0.016 };
  const fake = { state: { behavior: { sensorDistance: 0.042, sensorWidth: 0.014 } } };
  const replay = (queries, values) => {
    let index = 0;
    fake.field = { sample(x, y) {
      const query = queries[index];
      assert(query, 'unexpected production sensor query');
      assert(Math.abs(x - query.x) <= 64 * Number.EPSILON && Math.abs(y - query.y) <= 64 * Number.EPSILON,
        'frozen physical query geometry changed');
      return values[index++];
    } };
    return () => assert.equal(index, values.length, 'production sensor query count changed');
  };
  let done = replay(row.localGeometry, rawLocal);
  const localActual = AntController.prototype.senseLocalTrail.call(fake, agent); done();
  for (const name of ['left', 'center', 'right', 'strength', 'coherence', 'steering']) {
    assert.equal(localActual[name], local[name], `production local ${name}`);
  }
  for (let index = 0; index < row.wideGeometry.length; index += 1) {
    const geometry = row.wideGeometry[index];
    done = replay(geometry.reads, rawWide[index]);
    assert.equal(AntController.prototype.senseTrail.call(fake, agent, geometry.heading), wide.candidates[index].maximum,
      `production wide response ${index}`);
    done();
  }
}

function evaluateRaster(row, field) {
  const rawLocal = row.localGeometry.map(query => field.sample(query.x, query.y));
  const rawWide = row.wideGeometry.map(candidate => candidate.reads.map(query => field.sample(query.x, query.y)));
  const local = localStages(rawLocal);
  const wide = evaluateWide(rawWide.map((raw, index) => ({ offset: row.wideGeometry[index].offset, raw })), row.wideGeometry);
  crossCheckProductionSensors(row, rawLocal, rawWide, local, wide);
  return { local, wide, winner: winner(wide), rawLocal, rawWide };
}

function relationSignature(values) {
  const signs = [];
  for (let left = 0; left < values.length; left += 1) for (let right = left + 1; right < values.length; right += 1) {
    signs.push(Math.sign(values[left] - values[right]));
  }
  return signs.join(',');
}

function maxIndices(values) {
  const maximum = Math.max(...values);
  return values.map((value, index) => value === maximum ? index : -1).filter(index => index >= 0);
}

function offsetValues(indices) {
  return indices.map(index => [-1, -0.5, 0, 0.5, 1][index]);
}

function verifyFReplay(preflightResult, controls, audit) {
  const savedRows = controls.oldRows;
  assert.equal(savedRows.length, preflightResult.rows.length);
  const byId = new Map(audit.generatedFFields);
  const gById = new Map(audit.generatedGFields);
  const fullRows = [];
  for (let index = 0; index < preflightResult.rows.length; index += 1) {
    const source = preflightResult.rows[index], saved = savedRows[index];
    const key = keyOf(source);
    assert.equal(saved.key, key, `F saved row identity ${key}`);
    const f = evaluateRaster(source, byId.get(`${source.shape}|${source.phase}`));
    const g = evaluateRaster(source, gById.get(`${source.shape}|${source.phase}`));
    const savedF = saved.F;
    assertSameNumbers({ ...f, rasterSha256: audit.arms.find(arm => arm.id === `${source.shape}|${source.phase}`).fRasterSha256 },
      savedF, `${key} F exact raster/query/sensor replay`);
    fullRows.push({ ...saved, G: { ...g,
      rasterSha256: audit.arms.find(arm => arm.id === `${source.shape}|${source.phase}`).gRaster.sha256 } });
  }
  return fullRows;
}

function fToGOperatorInvariance(rows) {
  const summary = { rows: rows.length, localLcrRelationChanges: 0, localSideProfileRelationChanges: 0,
    localSteeringSignChanges: 0, rawWideCandidateOrderChanges: 0, weightedWideCandidateOrderChanges: 0,
    hillResponseCandidateOrderChanges: 0, finalScoreOrderChanges: 0,
    rawTransverseArgmaxCandidateChanges: 0, weightedTransverseArgmaxCandidateChanges: 0,
    transverseCandidatesCompared: 0, changesByFamily: {}, changesByPhase: {} };
  for (const row of rows) {
    const shapeCounts = summary.changesByFamily[row.shape] ||= { rows: 0, localLcr: 0, localSign: 0, rawWideOrder: 0, weightedWideOrder: 0, scoreOrder: 0 };
    const phaseCounts = summary.changesByPhase[row.phase] ||= { rows: 0, localLcr: 0, localSign: 0, rawWideOrder: 0, weightedWideOrder: 0, scoreOrder: 0 };
    shapeCounts.rows += 1; phaseCounts.rows += 1;
    const localLcrChanged = relationSignature([row.F.local.left, row.F.local.center, row.F.local.right])
      !== relationSignature([row.G.local.left, row.G.local.center, row.G.local.right]);
    if (localLcrChanged) { summary.localLcrRelationChanges += 1; shapeCounts.localLcr += 1; phaseCounts.localLcr += 1; }
    const sideChanged = row.F.local.profiles.some((profile, depth) => relationSignature(profile)
      !== relationSignature(row.G.local.profiles[depth]));
    if (sideChanged) summary.localSideProfileRelationChanges += 1;
    if (sign(row.F.local.steering) !== sign(row.G.local.steering)) {
      summary.localSteeringSignChanges += 1; shapeCounts.localSign += 1; phaseCounts.localSign += 1;
    }
    const orders = [
      ['rawOrder', 'rawWideCandidateOrderChanges', 'rawWideOrder'],
      ['weightedOrder', 'weightedWideCandidateOrderChanges', 'weightedWideOrder'],
      ['hillOrder', 'hillResponseCandidateOrderChanges', null],
      ['scoreOrder', 'finalScoreOrderChanges', 'scoreOrder']
    ];
    for (const [name, totalKey, groupKey] of orders) if (JSON.stringify(row.F.wide[name]) !== JSON.stringify(row.G.wide[name])) {
      summary[totalKey] += 1;
      if (groupKey) { shapeCounts[groupKey] += 1; phaseCounts[groupKey] += 1; }
    }
    for (let candidate = 0; candidate < 5; candidate += 1) {
      const fRaw = maxIndices(row.F.rawWide[candidate]);
      const gRaw = maxIndices(row.G.rawWide[candidate]);
      const fWeighted = maxIndices(row.F.wide.candidates[candidate].weighted);
      const gWeighted = maxIndices(row.G.wide.candidates[candidate].weighted);
      if (JSON.stringify(fRaw) !== JSON.stringify(gRaw)) summary.rawTransverseArgmaxCandidateChanges += 1;
      if (JSON.stringify(fWeighted) !== JSON.stringify(gWeighted)) summary.weightedTransverseArgmaxCandidateChanges += 1;
      summary.transverseCandidatesCompared += 1;
    }
  }
  return summary;
}

function profile26(rows, savedProfileRows) {
  const rowMap = new Map(rows.map(row => [row.key, row]));
  const outputRows = [];
  for (const prior of savedProfileRows) {
    const row = rowMap.get(prior.rowKey);
    assert(row, `missing prior 26 row ${prior.rowKey}`);
    const targetIndex = prior.targetIndex, rivalIndex = prior.rivalIndex;
    const makeProfile = (candidateIndex, label) => {
      const basis = prior.profiles.F[label];
      const raw = row.G.rawWide[candidateIndex];
      const samples = basis.map((sample, index) => ({ ...sample, raw: raw[index], weighted: raw[index] * sample.weight }));
      return { samples, rawArgmaxOffsets: offsetValues(maxIndices(samples.map(sample => sample.raw))),
        weightedArgmaxOffsets: offsetValues(maxIndices(samples.map(sample => sample.weighted))),
        rawMaximum: Math.max(...samples.map(sample => sample.raw)),
        weightedMaximum: Math.max(...samples.map(sample => sample.weighted)) };
    };
    const target = makeProfile(targetIndex, 'target'), rival = makeProfile(rivalIndex, 'rival');
    const targetCandidate = row.G.wide.candidates[targetIndex], rivalCandidate = row.G.wide.candidates[rivalIndex];
    const targetRawMax = target.rawMaximum, rivalRawMax = rival.rawMaximum;
    const targetWeightedMax = target.weightedMaximum, rivalWeightedMax = rival.weightedMaximum;
    const targetRawOffsets = target.rawArgmaxOffsets, targetWeightedOffsets = target.weightedArgmaxOffsets;
    outputRows.push({ ...prior, profiles: { ...prior.profiles, G: {
      target: target.samples, rival: rival.samples,
      targetRawArgmax: targetRawOffsets, targetWeightedArgmax: targetWeightedOffsets,
      rivalRawArgmax: rival.rawArgmaxOffsets, rivalWeightedArgmax: rival.weightedArgmaxOffsets,
      targetMinusRivalRawMargin: targetRawMax - rivalRawMax,
      targetMinusRivalWeightedMargin: targetWeightedMax - rivalWeightedMax,
      targetMinusRivalFinalScore: targetCandidate.score - rivalCandidate.score,
      targetRawWinner: row.G.wide.rawOrder[0] === targetIndex,
      targetWeightedWinner: row.G.wide.weightedOrder[0] === targetIndex,
      targetFinalWinner: row.G.winner === prior.targetOffset,
      targetOuterToInnerSampleSwitch: targetRawOffsets.some(offset => Math.abs(offset) === 1)
        && targetWeightedOffsets.some(offset => Math.abs(offset) === 0.5),
      finalWinnerOffset: row.G.winner
    } } });
  }
  const g = outputRows.map(row => row.profiles.G);
  return { rows: outputRows, summary: { count: outputRows.length,
    targetRawTop: g.filter(row => row.targetRawWinner).length,
    targetWeightedTop: g.filter(row => row.targetWeightedWinner).length,
    targetFinalTop: g.filter(row => row.targetFinalWinner).length,
    targetOuterToInnerSampleSwitch: g.filter(row => row.targetOuterToInnerSampleSwitch).length,
    route: Object.fromEntries(FAMILIES.map(shape => [shape, outputRows.filter(row => row.shape === shape).length])),
    phase: Object.fromEntries(PHASES.map(phase => [phase, outputRows.filter(row => row.phase === phase).length])) } };
}

function cohortTracking(rows) {
  const directional = rows.filter(row => sign(row.reference.steering) !== 0);
  const unique = rows.filter(row => row.uniqueWinner);
  const localWrong = (row, arm) => sign(row[arm].local.steering) !== sign(row.reference.steering);
  const wideWrong = (row, arm) => row[arm].winner !== row.referenceWinner;
  const priorNew = unique.filter(row => row.C.winner === row.referenceWinner && row.D.winner !== row.referenceWinner);
  const priorRecovered = unique.filter(row => row.C.winner !== row.referenceWinner && row.D.winner === row.referenceWinner);
  const eLocal = directional.filter(row => !localWrong(row, 'C') && localWrong(row, 'E'));
  const eWide = unique.filter(row => !wideWrong(row, 'C') && !wideWrong(row, 'D') && wideWrong(row, 'E'));
  const fLocal = directional.filter(row => localWrong(row, 'F'));
  const fWide = unique.filter(row => wideWrong(row, 'F'));
  assert.equal(priorNew.length, 92); assert.equal(priorRecovered.length, 92);
  assert.equal(eLocal.length, 267); assert.equal(eWide.length, 177);
  assert.equal(fLocal.length, 10); assert.equal(fWide.length, 1401);
  return {
    priorDNewErrors: { count: priorNew.length,
      FStillWrong: priorNew.filter(row => wideWrong(row, 'F')).length,
      GRecovered: priorNew.filter(row => !wideWrong(row, 'G')).length,
      GStillWrong: priorNew.filter(row => wideWrong(row, 'G')).length,
      rows: priorNew.map(row => ({ key: row.key, FWrong: wideWrong(row, 'F'), GWrong: wideWrong(row, 'G') })) },
    priorDRecoveries: { count: priorRecovered.length,
      FStillCorrect: priorRecovered.filter(row => !wideWrong(row, 'F')).length,
      GStillCorrect: priorRecovered.filter(row => !wideWrong(row, 'G')).length,
      GRegressed: priorRecovered.filter(row => wideWrong(row, 'G')).length,
      rows: priorRecovered.map(row => ({ key: row.key, FWrong: wideWrong(row, 'F'), GWrong: wideWrong(row, 'G') })) },
    eSpecificLocal: { count: eLocal.length,
      FRecovered: eLocal.filter(row => !localWrong(row, 'F')).length,
      GRecovered: eLocal.filter(row => !localWrong(row, 'G')).length,
      GStillWrong: eLocal.filter(row => localWrong(row, 'G')).length,
      rows: eLocal.map(row => ({ key: row.key, FWrong: localWrong(row, 'F'), GWrong: localWrong(row, 'G') })) },
    eSpecificWide: { count: eWide.length,
      FRecovered: eWide.filter(row => !wideWrong(row, 'F')).length,
      GRecovered: eWide.filter(row => !wideWrong(row, 'G')).length,
      GStillWrong: eWide.filter(row => wideWrong(row, 'G')).length,
      rows: eWide.map(row => ({ key: row.key, FWrong: wideWrong(row, 'F'), GWrong: wideWrong(row, 'G') })) },
    fResidualLocal: { count: fLocal.length,
      GRecovered: fLocal.filter(row => !localWrong(row, 'G')).length,
      stillWrong: fLocal.filter(row => localWrong(row, 'G')).length,
      newVsF: directional.filter(row => !localWrong(row, 'F') && localWrong(row, 'G')).length,
      rows: fLocal.map(row => ({ key: row.key, GWrong: localWrong(row, 'G') })) },
    fResidualWide: { count: fWide.length,
      GRecovered: fWide.filter(row => !wideWrong(row, 'G')).length,
      stillWrong: fWide.filter(row => wideWrong(row, 'G')).length,
      newVsF: unique.filter(row => !wideWrong(row, 'F') && wideWrong(row, 'G')).length,
      rows: fWide.map(row => ({ key: row.key, GWrong: wideWrong(row, 'G') })) }
  };
}

function makeResult(preflightResult, controls, audit, rows) {
  const fResults = controls.fResults;
  const arms = ['C', 'D', 'E', 'F', 'G'];
  const armMetrics = metricsForEachArm(rows, arms);
  for (const arm of ['C', 'D', 'E', 'F']) assertSameNumbers(armMetrics[arm], fResults.primary.arms[arm], `${arm} frozen Gate 2 metrics`);
  for (const [arm, key] of [['D', 'Gate2CvsD'], ['E', 'Gate2CvsE'], ['F', 'Gate2CvsF']]) {
    assertSameNumbers(compareMetrics(rows, arm), fResults.primary[key], `${arm} frozen Gate 2 family/phase comparison`);
  }
  const gMetrics = compareMetrics(rows, 'G');
  const familyComparisons = Object.fromEntries(['D', 'E', 'F', 'G'].map(arm => [arm, compareMetrics(rows, arm)]));
  const gChecks = evaluateCueGate(gMetrics);
  const savedProfiles = gzipJson(`${F_PACKAGE}/gate2/profile-26.json.gz`).rows;
  const profiles = profile26(rows, savedProfiles);
  const cohorts = cohortTracking(rows);
  const operatorInvariance = fToGOperatorInvariance(rows);
  const gateStatus = gChecks.passed ? 'PASS' : 'MIXED / NOT QUALIFIED';
  const decision = gChecks.passed ? 'QUALIFIED FOR LATER MOVEMENT SHADOW'
    : gMetrics.global.candidate.localSignErrors < gMetrics.global.baseline.localSignErrors
      || gMetrics.global.candidate.localSteeringMae < gMetrics.global.baseline.localSteeringMae
      || gMetrics.global.candidate.wideErrors < gMetrics.global.baseline.wideErrors
      ? 'MIXED / NOT QUALIFIED' : 'NEGATIVE';
  return {
    schema: 'ant-316-gaussian-dose-unit-results/v1',
    baseline: { originMain: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2',
      FBranchPoint: 'fcd450885d91b6b1aaec50cf0e9086a1e225e9d1',
      FPreregistrationCommit: '10ba70e3e2dd5577f5598695710c0fdd908fd800',
      FGate2ResultCommit: 'fcd450885d91b6b1aaec50cf0e9086a1e225e9d1',
      representationContractTip: 'c3babbf4811ebede0cc4ef5615bd08317c937664',
      EFixedCueCommit: '4a23ca73d13cd64e7e1afa6604d5b83d7f8dad57' },
    preregistration: { path: `${PACKAGE}/PREREGISTRATION.md`, commit: '9b47601770deb8c8755c2fa47011826979f1a4d7',
      sha256: sha(readFileSync(resolve(ROOT, `${PACKAGE}/PREREGISTRATION.md`))) },
    provenance: { sourceHashes: SOURCE_HASHES, frozenInputSha256: INPUT_SHA256,
      sourceRowCount: preflightResult.rows.length, routePhaseArms: preflightResult.streams.arms.length,
      writeCount: preflightResult.streams.arms.reduce((sum, arm) => sum + arm.writes.length, 0),
      FGate1Sha256: controls.fHashes.gate1, FGate2RowsSha256: controls.fHashes.gate2Rows,
      FGate2ResultsSha256: controls.fHashes.results, inputReceipt: preflightResult.receipt,
      preflightCDEReceipts: controls.verifiedPrior.receipts },
    unitFactor: audit.candidate.scale,
    gate1: { status: audit.status, path: `${PACKAGE}/gate1/unit-audit.json`, result: { ...audit, generatedFFields: undefined, generatedGFields: undefined } },
    denominators: { localRows: 5544, localDirectional: 4012, straightZero: 924, sCurveAnalyticZero: 392,
      strictUniqueWide: 5072, localRawQueries: 99792, wideRawQueries: 138600 },
    exactFrozenArms: { replayed: ['C', 'D', 'E', 'F'], CDEFAggregatesExact: true,
      GUsesSame24WriteStreams: true, sameSensorQueries: true, rngCalls: 0 },
    primary: { arms: armMetrics, comparisons: {
      DvsC: { metrics: compareMetrics(rows, 'D'), checks: evaluateCueGate(compareMetrics(rows, 'D')) },
      EvsC: { metrics: compareMetrics(rows, 'E'), checks: evaluateCueGate(compareMetrics(rows, 'E')) },
      FvsC: { metrics: compareMetrics(rows, 'F'), checks: evaluateCueGate(compareMetrics(rows, 'F')) },
      GvsC: { metrics: gMetrics, checks: gChecks, status: gateStatus }
    }, checks: gChecks, decision },
    FToGOperatorInvariance: operatorInvariance,
    tightFamilies: Object.fromEntries(['tight', 'tightMirror'].map(shape => [shape, {
      C: familyComparisons.D.families[shape].baseline,
      D: familyComparisons.D.families[shape].candidate,
      E: familyComparisons.E.families[shape].candidate,
      F: familyComparisons.F.families[shape].candidate,
      G: familyComparisons.G.families[shape].candidate
    }])),
    priorD26WeightedMaxFirst: profiles.summary,
    cohorts,
    gate3: { status: 'NOT RUN', reason: 'Fixed-cue unit qualification only; no movement evaluation was authorized.' },
    interpretation: decision
  };
}

function writeGate2Artifacts(result, rows, profileRows, cohorts, audit) {
  const rowBytes = gzipSync(Buffer.from(JSON.stringify(rows)), { level: 9 });
  const profileBytes = gzipSync(Buffer.from(JSON.stringify({ schema: 'ant-316-gaussian-dose-profile-26/v1', rows: profileRows })), { level: 9 });
  write(`${PACKAGE}/gate2/rows.json.gz`, rowBytes);
  write(`${PACKAGE}/gate2/profile-26.json.gz`, profileBytes);
  writeJson(`${PACKAGE}/gate2/cohort-tracking.json`, cohorts);
  writeJson(`${PACKAGE}/gate2/operator-invariance.json`, result.FToGOperatorInvariance);
  writeJson(`${PACKAGE}/RESULTS.json`, result);
  const auditBytes = readFileSync(resolve(ROOT, `${PACKAGE}/gate1/unit-audit.json`));
  const resultsBytes = readFileSync(resolve(ROOT, `${PACKAGE}/RESULTS.json`));
  const cohortBytes = readFileSync(resolve(ROOT, `${PACKAGE}/gate2/cohort-tracking.json`));
  const operatorBytes = readFileSync(resolve(ROOT, `${PACKAGE}/gate2/operator-invariance.json`));
  const rasterHashes = Object.fromEntries(audit.arms.map(arm => [arm.id, arm.gRaster.sha256]));
  const generated = { unitAudit: sha(auditBytes), results: sha(resultsBytes), gate2Rows: sha(rowBytes),
    profile26: sha(profileBytes), cohorts: sha(cohortBytes), operatorInvariance: sha(operatorBytes), rasterHashes };
  writeJson(`${PACKAGE}/generation-hashes.json`, generated);
  return generated;
}

export function runDoseOnlyAudit() {
  assert.equal(DOSE_SCALE, 3969 / 361);
  const preflightResult = withMathRandomForbidden(() => preflight());
  const controls = withMathRandomForbidden(() => prepareFControls(preflightResult));
  const audit = withMathRandomForbidden(() => replayAndAudit(preflightResult, controls));
  writeJson(`${PACKAGE}/gate1/unit-audit.json`, { ...audit, generatedFFields: undefined, generatedGFields: undefined });
  return { audit: { ...audit, generatedFFields: undefined, generatedGFields: undefined },
    status: audit.status, capAudit: audit.capAudit };
}

export function runQualification() {
  assert.equal(DOSE_SCALE, 3969 / 361);
  const preflightResult = withMathRandomForbidden(() => preflight());
  const controls = withMathRandomForbidden(() => prepareFControls(preflightResult));
  const audit = withMathRandomForbidden(() => replayAndAudit(preflightResult, controls));
  writeJson(`${PACKAGE}/gate1/unit-audit.json`, { ...audit, generatedFFields: undefined, generatedGFields: undefined });
  assertUncappedAudit(audit);
  const rows = withMathRandomForbidden(() => verifyFReplay(preflightResult, controls, audit));
  const result = makeResult(preflightResult, controls, audit, rows);
  const profileRows = profile26(rows, gzipJson(`${F_PACKAGE}/gate2/profile-26.json.gz`).rows).rows;
  const generated = writeGate2Artifacts(result, rows, profileRows, result.cohorts, audit);
  return { audit: { ...audit, generatedFFields: undefined, generatedGFields: undefined }, result, generated };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.argv.includes('--unit-audit-only') ? runDoseOnlyAudit() : runQualification();
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
