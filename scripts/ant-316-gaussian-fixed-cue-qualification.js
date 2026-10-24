import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import os from 'node:os';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { CicPheromoneField } from './ant-cic-writer.js';
import { evaluateCueGate, preflight } from './ant-cic-writer-qualification.js';
import {
  INPUT_SHA256, SOURCE_HASHES, evaluateWide, localStages
} from './ant-field-writer-reader-failure-attribution.js';

export const SIZE = 316;
export const RADIUS = 0.0045;
export const SIGMA = RADIUS * 0.5;
export const PITCH = 1 / (SIZE - 1);
export const PACKAGE = 'docs/ant/evidence/2026-10-24-cic-316-gaussian-fixed-cue-qualification';
const PREVIOUS = 'docs/ant/evidence/2026-10-24-cic-316-grid-fixed-cue-qualification';
const ORIGINAL = 'docs/ant/evidence/2026-10-24-ant-cic-writer-qualification';
const WIDE_ATTRIBUTION = 'docs/ant/evidence/2026-10-24-cic-wide-stage-attribution';
const TRANSVERSE = 'docs/ant/evidence/2026-10-24-cic-transverse-sample-diagnostic';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILIES = ['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve'];
const PHASES = ['p00', 'p10', 'p01', 'p11'];
const WIDE_SAMPLE_OFFSETS = [-1, -0.5, 0, 0.5, 1];
const U32 = 2 ** -24, ALPHA32 = 2 ** -150;
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
const sign = value => Math.abs(value) <= 64 * Number.EPSILON * Math.max(1, Math.abs(value)) ? 0 : Math.sign(value);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function assertSameNumbers(actual, expected, label) {
  if (typeof actual === 'number' || typeof expected === 'number') {
    assert(actual === expected || (actual === 0 && expected === 0), `${label}: numeric parity`);
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

export function expectedGaussianNodes(x, y, width = SIZE, height = SIZE, radius = RADIUS) {
  const gx = Math.max(0, Math.min(1, x)) * (width - 1);
  const gy = Math.max(0, Math.min(1, y)) * (height - 1);
  const radiusX = Math.ceil(radius * (width - 1));
  const radiusY = Math.ceil(radius * (height - 1));
  const minX = Math.max(0, Math.floor(gx - radiusX));
  const maxX = Math.min(width - 1, Math.ceil(gx + radiusX));
  const minY = Math.max(0, Math.floor(gy - radiusY));
  const maxY = Math.min(height - 1, Math.ceil(gy + radiusY));
  const sigmaSquared = (radius * 0.5) ** 2;
  const nodes = [];
  let weightTotal = 0;
  for (let row = minY; row <= maxY; row += 1) {
    const ny = row / (height - 1);
    for (let column = minX; column <= maxX; column += 1) {
      const nx = column / (width - 1);
      const distance = Math.hypot(nx - x, ny - y);
      if (distance > radius) continue;
      const weight = Math.exp(-(distance * distance) / (2 * sigmaSquared));
      if (weight <= 0) continue;
      nodes.push({ index: row * width + column, xIndex: column, yIndex: row, x: nx, y: ny, distance, weight });
      weightTotal += weight;
    }
  }
  return { nodes, weightTotal };
}

function expectedStoredValue(before, contribution, maxValue = 8) {
  return Math.fround(Math.min(maxValue, before + contribution));
}

function float32Bound(increment, before = 0) {
  return U32 * Math.abs(before + increment) + ALPHA32;
}

export function pointLatticeAssay(lattice = 1001) {
  assert.equal(os.endianness(), 'LE', 'Raster export expects the host Float32 byte order to be little-endian.');
  const field = new PheromoneField({ width: SIZE, height: SIZE });
  const pointCount = lattice * lattice, baseX = 157, baseY = 157;
  const metrics = Object.fromEntries(['support', 'storedDoseResidual', 'centroidError', 'centroidErrorX', 'centroidErrorY',
    'sourceReadValue', 'peakValue', 'peakOffsetMin', 'peakOffsetMax', 'secondMomentTrace', 'anisotropy', 'maxNodeDistance']
    .map(name => [name, new Float64Array(pointCount)]));
  const supportCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0,
    11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0 };
  let fallbackCount = 0, formulaComparisons = 0, formulaNonExact = 0, pointIndex = 0;
  let maxPositiveDistance = 0, minRadiusMargin = Infinity, maxDoseResidual = 0;
  let selectedPhases = null;
  let previousIndices = [];

  for (let iy = 0; iy < lattice; iy += 1) for (let ix = 0; ix < lattice; ix += 1) {
    const fx = ix / (lattice - 1), fy = iy / (lattice - 1);
    const x = (baseX + fx) * PITCH, y = (baseY + fy) * PITCH;
    for (const index of previousIndices) field.values[index] = 0;
    const expected = expectedGaussianNodes(x, y);
    if (expected.nodes.length === 0 || expected.weightTotal === 0) fallbackCount += 1;
    else supportCounts[expected.nodes.length] = (supportCounts[expected.nodes.length] || 0) + 1;
    const accepted = field.depositPoint({ x, y }, { amount: 1, radius: RADIUS });
    assert.equal(accepted, 1);

    let storedDose = 0, xMoment = 0, yMoment = 0, peak = -Infinity;
    let peakOffsetMin = Infinity, peakOffsetMax = 0, secondMomentTrace = 0;
    let xx = 0, yy = 0, xy = 0, maxNodeDistance = 0, bound = 0;
    for (const node of expected.nodes) {
      const contribution = node.weight / expected.weightTotal;
      const actual = field.values[node.index];
      const expectedValue = Math.fround(contribution);
      formulaComparisons += 1;
      if (actual !== expectedValue) formulaNonExact += 1;
      assert(actual >= 0 && Number.isFinite(actual), 'finite nonnegative Gaussian node value');
      bound += float32Bound(contribution);
      storedDose += actual;
      xMoment += actual * node.x; yMoment += actual * node.y;
      const dx = node.x - x, dy = node.y - y;
      secondMomentTrace += actual * (dx * dx + dy * dy);
      xx += actual * dx * dx; yy += actual * dy * dy; xy += actual * dx * dy;
      maxNodeDistance = Math.max(maxNodeDistance, node.distance);
      if (actual > peak) { peak = actual; peakOffsetMin = node.distance; peakOffsetMax = node.distance; }
      else if (actual === peak) { peakOffsetMin = Math.min(peakOffsetMin, node.distance); peakOffsetMax = Math.max(peakOffsetMax, node.distance); }
    }
    const doseResidual = storedDose - 1;
    const doubleGuard = 64 * Number.EPSILON;
    assert(Math.abs(doseResidual) <= bound + doubleGuard, 'single-dab nodal sum within derived Float32 bound');
    assert(expected.nodes.length > 0, 'production fallback must not be needed on the 316-grid support lattice');
    const centroidX = xMoment / storedDose, centroidY = yMoment / storedDose;
    const centroidErrorX = centroidX - x, centroidErrorY = centroidY - y;
    const trace = secondMomentTrace / storedDose;
    const disc = Math.hypot(xx - yy, 2 * xy) / storedDose;
    metrics.support[pointIndex] = expected.nodes.length;
    metrics.storedDoseResidual[pointIndex] = doseResidual;
    metrics.centroidErrorX[pointIndex] = centroidErrorX;
    metrics.centroidErrorY[pointIndex] = centroidErrorY;
    metrics.centroidError[pointIndex] = Math.hypot(centroidErrorX, centroidErrorY);
    metrics.sourceReadValue[pointIndex] = field.sample(x, y);
    metrics.peakValue[pointIndex] = peak;
    metrics.peakOffsetMin[pointIndex] = peakOffsetMin;
    metrics.peakOffsetMax[pointIndex] = peakOffsetMax;
    metrics.secondMomentTrace[pointIndex] = trace;
    metrics.anisotropy[pointIndex] = trace > 0 ? disc / trace : 0;
    metrics.maxNodeDistance[pointIndex] = maxNodeDistance;
    maxPositiveDistance = Math.max(maxPositiveDistance, maxNodeDistance);
    minRadiusMargin = Math.min(minRadiusMargin, RADIUS - maxNodeDistance);
    maxDoseResidual = Math.max(maxDoseResidual, Math.abs(doseResidual));
    previousIndices = expected.nodes.map(node => node.index);

    if ((ix === 0 || ix === (lattice - 1) / 2) && (iy === 0 || iy === (lattice - 1) / 2)) {
      const phase = ix === 0 ? (iy === 0 ? 'p00' : 'p01') : (iy === 0 ? 'p10' : 'p11');
      (selectedPhases ||= {})[phase] = {
        source: { x, y, fractionX: fx, fractionY: fy },
        supportNodes: expected.nodes.length, sourceReadValue: metrics.sourceReadValue[pointIndex],
        peakValue: peak, peakOffsetRange: [peakOffsetMin, peakOffsetMax],
        centroidError: metrics.centroidError[pointIndex], secondMomentTrace: trace,
        anisotropy: metrics.anisotropy[pointIndex], maximumNodeDistance: maxNodeDistance,
        storedDoseResidual: doseResidual
      };
    }
    pointIndex += 1;
  }
  assert.equal(pointIndex, pointCount);
  assert.equal(formulaNonExact, 0, 'Production Gaussian increments match independent equation exactly.');
  assert.equal(fallbackCount, 0, 'Every scanned point has positive Gaussian support within R.');
  return {
    method: { latticePerAxis: lattice, pointCount, cell: [baseX, baseY], amountPerPoint: 1,
      radius: RADIUS, sigma: SIGMA, equation: 'exp(-distance^2/(2*sigma^2)); support distance <= radius; normalize included nodes' },
    formulaParity: { comparisons: formulaComparisons, nonExact: formulaNonExact },
    fallback: { testedPositions: pointCount, emptySupportCount: fallbackCount,
      theoreticalNearestNodeBound: Math.SQRT2 * PITCH / 2, radius: RADIUS },
    supportNodeCount: supportCounts,
    maximumSourceToPositiveNodeDistance: maxPositiveDistance,
    minimumObservedRadiusMargin: minRadiusMargin,
    maximumAbsoluteStoredDoseResidual: maxDoseResidual,
    distributions: Object.fromEntries(Object.entries(metrics).map(([name, values]) => [name, distribution(values)])),
    namedSubcellPhases: selectedPhases
  };
}

export function doseAndMomentAssay() {
  const field = new PheromoneField({ width: SIZE, height: SIZE });
  const h = PITCH, baseX = 157, baseY = 157;
  const phases = [['p00', 0, 0], ['p10', h / 2, 0], ['p01', 0, h / 2], ['p11', h / 2, h / 2]];
  const doses = [0.000001, 0.027, 1];
  const residuals = [], centroidErrors = [], supportCounts = {};
  let writes = 0, maximumBoundRatio = 0, maximumSourceNodeDistance = 0;
  for (const [phase, dx, dy] of phases) for (let jy = 0; jy < 64; jy += 1) for (let ix = 0; ix < 64; ix += 1) for (const amount of doses) {
    const x = (baseX + (ix + 0.5) / 64 + dx / h) * h;
    const y = (baseY + (jy + 0.5) / 64 + dy / h) * h;
    const expected = expectedGaussianNodes(x, y);
    for (const node of expected.nodes) field.values[node.index] = 0;
    assert(expected.nodes.length > 0);
    const accepted = field.depositPoint({ x, y }, { amount, radius: RADIUS });
    assert.equal(accepted, amount);
    let mass = 0, xMoment = 0, yMoment = 0, bound = 0;
    for (const node of expected.nodes) {
      const increment = amount * node.weight / expected.weightTotal;
      const actual = field.values[node.index];
      assert.equal(actual, expectedStoredValue(0, increment), `${phase} Gaussian dose ${amount} exact store`);
      mass += actual; xMoment += actual * node.x; yMoment += actual * node.y;
      bound += float32Bound(increment);
      maximumSourceNodeDistance = Math.max(maximumSourceNodeDistance, node.distance);
    }
    const residual = mass - amount;
    const totalBound = bound + 64 * Number.EPSILON * Math.max(1, amount);
    assert(Math.abs(residual) <= totalBound, `${phase} dose conservation under derived Float32 bound`);
    residuals.push(residual);
    centroidErrors.push(Math.hypot(xMoment / mass - x, yMoment / mass - y));
    supportCounts[phase] = (supportCounts[phase] || 0) + expected.nodes.length;
    maximumBoundRatio = Math.max(maximumBoundRatio, totalBound > 0 ? Math.abs(residual) / totalBound : 0);
    writes += 1;
  }
  assert.equal(writes, 49152);
  return { doseLevels: doses, phases: phases.map(([name]) => name), writes,
    storedDoseResidual: distribution(residuals), centroidError: distribution(centroidErrors),
    positiveNodeVisitsByPhase: supportCounts, maxSourceToNodeDistance: maximumSourceNodeDistance,
    maximumDerivedBoundRatio: maximumBoundRatio, pass: true };
}

export function boundaryAssay() {
  const epsilon = 2 ** -30;
  const positions = [
    ['corner00', 0, 0], ['corner10', 1, 0], ['corner01', 0, 1], ['corner11', 1, 1],
    ['edgeTop', 0.5, 0], ['edgeBottom', 0.5, 1], ['edgeLeft', 0, 0.5], ['edgeRight', 1, 0.5],
    ['nearCorner00', epsilon, epsilon], ['nearCorner10', 1 - epsilon, epsilon],
    ['nearCorner01', epsilon, 1 - epsilon], ['nearCorner11', 1 - epsilon, 1 - epsilon]
  ];
  const cases = positions.map(([name, x, y]) => {
    const field = new PheromoneField({ width: SIZE, height: SIZE });
    const expected = expectedGaussianNodes(x, y);
    const accepted = field.depositPoint({ x, y }, { amount: 1, radius: RADIUS });
    assert.equal(accepted, 1);
    const stats = fieldStats(field);
    let xMoment = 0, yMoment = 0;
    for (let i = 0; i < field.values.length; i += 1) {
      xMoment += field.values[i] * ((i % SIZE) / (SIZE - 1));
      yMoment += field.values[i] * (Math.floor(i / SIZE) / (SIZE - 1));
    }
    return { name, source: { x, y }, accepted, expectedSupport: expected.nodes.length,
      storedDose: stats.mass, capNodes: stats.cappedNodes,
      centroid: { x: xMoment / stats.mass, y: yMoment / stats.mass },
      centroidError: Math.hypot(xMoment / stats.mass - x, yMoment / stats.mass - y) };
  });
  const outside = new PheromoneField({ width: SIZE, height: SIZE });
  const before = Buffer.from(outside.values.buffer);
  const outsideAccepted = outside.depositPoint({ x: -epsilon, y: 0.5 }, { amount: 1, radius: RADIUS });
  assert.equal(outsideAccepted, 0);
  assert(Buffer.from(outside.values.buffer).equals(before));
  return { cases, outside: { accepted: outsideAccepted, unchanged: true }, claim: 'boundary dose/moment is measured; interior guarantee is not extended to clipping' };
}

function fieldStats(field) {
  let mass = 0, peak = 0, supportNodes = 0, cappedNodes = 0;
  let xMoment = 0, yMoment = 0;
  for (let index = 0; index < field.values.length; index += 1) {
    const value = field.values[index];
    assert(Number.isFinite(value) && value >= 0, 'raster must stay finite and nonnegative');
    mass += value;
    if (value > 0) {
      supportNodes += 1;
      const x = (index % field.width) / (field.width - 1);
      const y = Math.floor(index / field.width) / (field.height - 1);
      xMoment += value * x; yMoment += value * y;
    }
    peak = Math.max(peak, value);
    if (value >= field.maxValue) cappedNodes += 1;
  }
  const bytes = Buffer.from(field.values.buffer, field.values.byteOffset, field.values.byteLength);
  return { width: field.width, height: field.height, byteLength: bytes.length, sha256: sha(bytes),
    mass, peak, supportNodes, cappedNodes,
    centroid: mass > 0 ? { x: xMoment / mass, y: yMoment / mass } : null };
}

function replayStreams(streams) {
  const fields = new Map(), arms = [], destination = `${PACKAGE}/gate1/rasters`;
  for (const arm of streams.arms) {
    const field = new PheromoneField({ width: SIZE, height: SIZE });
    let requested = 0, accepted = 0, expectedSourceXMoment = 0, expectedSourceYMoment = 0;
    let supportCounts = {}, maxNodeDistance = 0, storeComparisons = 0;
    const floatBudgets = new Float64Array(field.values.length);
    for (const event of arm.writes) {
      const { x, y } = event.gridPosition;
      const amount = event.requestedAmount;
      const expected = expectedGaussianNodes(x, y);
      assert(expected.nodes.length > 0, `${arm.id} write needs no fallback`);
      requested += amount; expectedSourceXMoment += amount * x; expectedSourceYMoment += amount * y;
      supportCounts[expected.nodes.length] = (supportCounts[expected.nodes.length] || 0) + 1;
      const beforeValues = expected.nodes.map(node => field.values[node.index]);
      const returned = field.depositPoint({ x, y }, { amount, radius: RADIUS });
      assert.equal(returned, amount);
      for (let index = 0; index < expected.nodes.length; index += 1) {
        const node = expected.nodes[index], before = beforeValues[index];
        const increment = amount * node.weight / expected.weightTotal;
        const bound = float32Bound(increment, before);
        const actualAfter = expectedStoredValue(before, increment, field.maxValue);
        assert.equal(field.values[node.index], actualAfter, `${arm.id} exact Gaussian node update`);
        if (actualAfter < field.maxValue) floatBudgets[node.index] += bound;
        maxNodeDistance = Math.max(maxNodeDistance, node.distance);
        storeComparisons += 1;
      }
      accepted += amount;
    }
    const stats = fieldStats(field);
    assert.equal(arm.writes.length, 77);
    const massResidual = stats.mass - requested;
    const totalStoreBound = floatBudgets.reduce((sum, value) => sum + value, 0)
      + 64 * Number.EPSILON * Math.max(1, requested);
    if (stats.cappedNodes === 0) assert(Math.abs(massResidual) <= totalStoreBound, `${arm.id} stream dose bound`);
    const centroidError = stats.centroid && requested > 0
      ? Math.hypot(stats.centroid.x - expectedSourceXMoment / requested,
        stats.centroid.y - expectedSourceYMoment / requested) : null;
    const bytes = Buffer.from(field.values.buffer, field.values.byteOffset, field.values.byteLength);
    const file = `${destination}/${arm.id.replace('|', '-')}.f32le`;
    write(file, bytes);
    const result = { id: arm.id, writeCount: arm.writes.length, nodeStoreComparisons: storeComparisons,
      supportNodeCountPerWrite: supportCounts, maxSourceToActiveNodeDistance: maxNodeDistance,
      requestedDose: requested, acceptedDose: accepted, storedNodeSum: stats.mass,
      storedMinusAccepted: stats.mass - accepted, derivedUncappedFloat32Bound: totalStoreBound,
      capLossNotRedistributed: stats.cappedNodes > 0, cappedNodes: stats.cappedNodes,
      peak: stats.peak, activeNodes: stats.supportNodes, centroid: stats.centroid,
      requestedDoseCentroid: { x: expectedSourceXMoment / requested, y: expectedSourceYMoment / requested },
      centroidErrorFromPhysicalSource: centroidError, raster: { file: file.replaceAll('\\', '/'), ...stats } };
    arms.push(result); fields.set(arm.id, field);
  }
  return { fields, result: { count: arms.length, totalWrites: arms.reduce((sum, arm) => sum + arm.writeCount, 0), arms } };
}

function readFootprintAssay() {
  const field = new PheromoneField({ width: SIZE, height: SIZE });
  const baseX = 157, baseY = 157, epsilon = 2 ** -30;
  const source = { x: (baseX + epsilon) * PITCH, y: (baseY + epsilon) * PITCH };
  field.depositPoint(source, { amount: 1, radius: RADIUS });
  const extent = RADIUS + 2 * PITCH, steps = 256;
  let nonzero = 0, maximumDistance = 0, valueAtMaximumDistance = 0;
  for (let iy = 0; iy <= steps; iy += 1) for (let ix = 0; ix <= steps; ix += 1) {
    const x = source.x - extent + 2 * extent * ix / steps;
    const y = source.y - extent + 2 * extent * iy / steps;
    const value = field.sample(x, y);
    if (value <= 0) continue;
    nonzero += 1;
    const distance = Math.hypot(x - source.x, y - source.y);
    if (distance > maximumDistance) { maximumDistance = distance; valueAtMaximumDistance = value; }
  }
  return { method: '257 × 257 fixed query lattice over source ±(R + 2h)', source, nonzeroSamples: nonzero,
    maximumSampledDistance: maximumDistance, valueAtMaximumDistance,
    exceedsWriteRadius: maximumDistance > RADIUS };
}

export function capAndDecayAssay() {
  const capField = new PheromoneField({ width: SIZE, height: SIZE });
  const centerIndex = 157 * SIZE + 157;
  capField.values[centerIndex] = 7.99;
  const massBefore = fieldStats(capField).mass;
  const point = { x: 157 / 315, y: 157 / 315 };
  const expected = expectedGaussianNodes(point.x, point.y);
  const before = new Map(expected.nodes.map(node => [node.index, capField.values[node.index]]));
  const expectedAfter = expected.nodes.map(node => {
    const inc = node.weight / expected.weightTotal;
    return { index: node.index, value: expectedStoredValue(before.get(node.index), inc, 8) };
  });
  const accepted = capField.depositPoint(point, { amount: 1, radius: RADIUS });
  for (const item of expectedAfter) assert.equal(capField.values[item.index], item.value);
  const capStats = fieldStats(capField);
  const storedIncrement = capStats.mass - massBefore;
  assert.equal(accepted, 1);
  assert(storedIncrement < accepted, 'partly saturated node loses its original share');

  const decay = new PheromoneField({ width: SIZE, height: SIZE });
  const dt = 3.75, factor = Math.exp(-Math.LN2 * dt / 15);
  const samples = new Map();
  for (let index = 0; index < decay.values.length; index += 97) {
    decay.values[index] = Math.fround((index % 799) / 100);
    samples.set(index, Math.fround(decay.values[index] * factor));
  }
  decay.decay(dt);
  for (const [index, value] of samples) assert.equal(decay.values[index], value);
  return {
    cap: { requested: 1, accepted, storedIncrement, loss: accepted - storedIncrement,
      cappedNodes: capStats.cappedNodes, originalSharesNotRedistributed: true },
    decay: { halfLifeSeconds: 15, elapsedSeconds: dt, exactSamples: samples.size,
      inheritedProductionMethod: decay.decay === PheromoneField.prototype.decay, passed: true }
  };
}

function segmentStats(field, angle) {
  const stats = fieldStats(field);
  let xx = 0, yy = 0, xy = 0;
  for (let index = 0; index < field.values.length; index += 1) {
    const value = field.values[index];
    if (value === 0) continue;
    const dx = (index % field.width) / (field.width - 1) - stats.centroid.x;
    const dy = Math.floor(index / field.width) / (field.height - 1) - stats.centroid.y;
    xx += value * dx * dx; yy += value * dy * dy; xy += value * dx * dy;
  }
  xx /= stats.mass; yy /= stats.mass; xy /= stats.mass;
  const trace = xx + yy, gap = Math.hypot(xx - yy, 2 * xy);
  const numericalFloor = 64 * Number.EPSILON * Math.max(trace, Number.MIN_VALUE);
  const angleOfPrincipalAxis = gap <= numericalFloor ? null : 0.5 * Math.atan2(2 * xy, xx - yy);
  const orientationError = angleOfPrincipalAxis === null ? null
    : Math.min(Math.abs(angleOfPrincipalAxis - angle), Math.PI - Math.abs(angleOfPrincipalAxis - angle));
  return { ...stats, secondMoment: { xx, yy, xy, trace, eigenGap: gap,
    anisotropy: trace > 0 ? gap / trace : 0, principalAxisAngleRad: angleOfPrincipalAxis,
    undefinedAtNumericalFloor: angleOfPrincipalAxis === null, numericalFloor },
  orientationErrorRad: orientationError };
}

export function orientationFixture() {
  const center = { x: 48.5 / 95, y: 48.5 / 95 };
  const length = 0.5 / 95;
  const orientations = [
    { id: 'horizontal', angle: 0 }, { id: 'plus45', angle: Math.PI / 4 },
    { id: 'vertical', angle: Math.PI / 2 }, { id: 'minus45', angle: -Math.PI / 4 }
  ];
  const arms = [
    ['C', 96, PheromoneField], ['D', 96, CicPheromoneField],
    ['E', SIZE, CicPheromoneField], ['F', SIZE, PheromoneField]
  ];
  const rasters = {};
  for (const [arm, size, Field] of arms) {
    rasters[arm] = {};
    for (const orientation of orientations) {
      const field = new Field({ width: size, height: size });
      const dx = Math.cos(orientation.angle) * length / 2;
      const dy = Math.sin(orientation.angle) * length / 2;
      const endpoints = [{ x: center.x - dx, y: center.y - dy }, { x: center.x + dx, y: center.y + dy }];
      for (const position of endpoints) assert.equal(field.depositPoint(position, { amount: 0.5, radius: RADIUS }), 0.5);
      const stats = segmentStats(field, orientation.angle);
      rasters[arm][orientation.id] = { field, endpoints, stats };
    }
  }
  const pairs = {};
  for (const arm of Object.keys(rasters)) {
    const names = orientations.map(item => item.id), entries = [];
    for (let i = 0; i < names.length; i += 1) for (let j = i + 1; j < names.length; j += 1) {
      const a = rasters[arm][names[i]].field.values, b = rasters[arm][names[j]].field.values;
      if (a.length !== b.length) throw new Error(`${arm} raster shape changed within orientation fixture`);
      let l1 = 0, sameSupport = true;
      for (let index = 0; index < a.length; index += 1) {
        l1 += Math.abs(a[index] - b[index]);
        if ((a[index] !== 0) !== (b[index] !== 0)) sameSupport = false;
      }
      const bytesA = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
      const bytesB = Buffer.from(b.buffer, b.byteOffset, b.byteLength);
      entries.push({ first: names[i], second: names[j], exactRasterIdentity: bytesA.equals(bytesB),
        sameSupportSet: sameSupport, rasterL1: l1 });
    }
    pairs[arm] = entries;
  }
  const output = {
    contract: { fixture: 'representation-contract equal two-point orthogonal pair', center,
      physicalSegmentLength: length, totalRequestedDose: 1, dosePerEndpoint: 0.5,
      orientations: orientations.map(({ id, angle }) => ({ id, angleRad: angle })),
      orientationsUseSamePhysicalCoordinatesAcrossArms: true,
      principalAxisUndefinedRule: 'eigen gap <= 64*Number.EPSILON*max(trace, Number.MIN_VALUE) marks angle undefined; numerical descriptor only' },
    arms: Object.fromEntries(Object.entries(rasters).map(([arm, groups]) => [arm,
      Object.fromEntries(Object.entries(groups).map(([orientation, data]) => [orientation,
        { endpoints: data.endpoints, ...data.stats }]))])),
    pairwiseDistinguishability: pairs,
    CIC96OrthogonalAlias: pairs.D.find(pair => pair.first === 'horizontal' && pair.second === 'vertical')
  };
  return output;
}

function gate1(streams, { lattice = 1001 } = {}) {
  const pointLattice = pointLatticeAssay(lattice);
  const dose = doseAndMomentAssay();
  const boundary = boundaryAssay();
  const routeReplay = replayStreams(streams);
  const readFootprint = readFootprintAssay();
  const capDecay = capAndDecayAssay();
  const orientations = orientationFixture();
  const passed = pointLattice.formulaParity.nonExact === 0 && pointLattice.fallback.emptySupportCount === 0
    && pointLattice.maximumSourceToPositiveNodeDistance <= RADIUS && dose.pass
    && routeReplay.result.arms.length === 24 && capDecay.decay.passed
    && capDecay.cap.originalSharesNotRedistributed;
  assert(passed, 'Gate 1 representation checks failed; Gate 2 is blocked.');
  return { fields: routeReplay.fields, report: { schema: 'ant-316-gaussian-gate1/v1', status: 'PASS', passed,
    candidate: { grid: [SIZE, SIZE], pitch: PITCH, radius: RADIUS, sigma: SIGMA,
      writer: 'inherited production PheromoneField.depositPoint/depositBrush', reader: 'inherited production bilinear sample' },
    singleDab: pointLattice, doseAndCentroid: dose, boundary, frozenStreams: routeReplay.result,
    readFootprint, capDecay, shortSegmentOrientation: orientations } };
}

function loadPreviousEvidence(sourceRows) {
  const oldRowsBytes = readFileSync(resolve(ROOT, PREVIOUS, 'gate2/rows.json.gz'));
  const oldProfileBytes = readFileSync(resolve(ROOT, PREVIOUS, 'gate2/target-profile-26.json.gz'));
  const oldRows = JSON.parse(gunzipSync(oldRowsBytes));
  const oldProfiles = JSON.parse(gunzipSync(oldProfileBytes));
  const oldResults = json(`${PREVIOUS}/RESULTS.json`);
  const oldGeneration = json(`${PREVIOUS}/generation-hashes.json`);
  const oldManifest = json(`${PREVIOUS}/manifest.json`);
  assert.equal(sha(oldRowsBytes), oldGeneration.gate2Rows);
  assert.equal(sha(oldRowsBytes), oldManifest.artifacts['gate2/rows.json.gz']);
  assert.equal(sha(oldProfileBytes), oldGeneration.targetProfile26);
  assert.equal(sha(oldProfileBytes), oldManifest.artifacts['gate2/target-profile-26.json.gz']);
  assert.equal(oldRows.length, 5544);
  assert.equal(oldProfiles.rows.length, 26);
  assert.equal(oldRows[0].key, keyOf(sourceRows[0]));
  assertSameNumbers(oldRows.map(row => row.key), sourceRows.map(keyOf), 'frozen C/D/E row keys');
  return { oldRows, oldProfiles, oldResults, oldGeneration, oldRowsSha: sha(oldRowsBytes), oldProfilesSha: sha(oldProfileBytes) };
}

function verifyBaselineAndPriorArms(preflightResult, previous, wideCensus, transverseRows) {
  const { rows, streams, baselineRows } = preflightResult;
  const { oldRows } = previous;
  const priorRasterReceipts = new Map(previous.oldResults.gate2.rasterReceipts.map(item => [item.id, item]));
  const rowIndexByKey = new Map(rows.map((row, index) => [keyOf(row), index]));
  const recovered = [], newErrors = [];
  assert.equal(rows.length, 5544);
  assert.equal(streams.arms.length, 24);
  for (const arm of streams.arms) {
    const d = new CicPheromoneField({ width: 96, height: 96 });
    const e = new CicPheromoneField({ width: SIZE, height: SIZE });
    for (const event of arm.writes) {
      d.depositPoint(event.gridPosition, { amount: event.requestedAmount, radius: RADIUS });
      e.depositPoint(event.gridPosition, { amount: event.requestedAmount, radius: RADIUS });
    }
    const dStats = fieldStats(d), eStats = fieldStats(e);
    const priorRaster = priorRasterReceipts.get(arm.id);
    assert(priorRaster, `missing 316 C/D/E raster receipt ${arm.id}`);
    assert.equal(dStats.sha256, priorRaster.D.rasterSha256);
    assert.equal(eStats.sha256, priorRaster.E.rasterSha256);
    for (const source of rows.filter(row => `${row.shape}|${row.phase}` === arm.id)) {
      const index = rowIndexByKey.get(keyOf(source));
      assert(Number.isInteger(index), `missing source row ${keyOf(source)}`);
      const saved = oldRows[index];
      assert.equal(saved.key, keyOf(source));
      const baseline = baselineRows[index];
      const cRawLocal = source.localProductionRaw;
      const cRawWide = source.wideProduction.map(candidate => candidate.raw);
      assertSameNumbers(saved.C.rawLocal, cRawLocal, `${saved.key} C local raw`);
      assertSameNumbers(saved.C.rawWide, cRawWide, `${saved.key} C wide raw`);
      assertSameNumbers(saved.C.local, baseline.local, `${saved.key} C local stages`);
      assertSameNumbers(saved.C.wide, baseline.wide, `${saved.key} C wide stages`);
      assert.equal(saved.C.winner, source.productionWinner);

      const dRawLocal = source.localGeometry.map(query => d.sample(query.x, query.y));
      const dRawWide = source.wideGeometry.map(candidate => candidate.reads.map(query => d.sample(query.x, query.y)));
      const dLocal = localStages(dRawLocal);
      const dWide = evaluateWide(dRawWide.map((raw, i) => ({ offset: source.wideGeometry[i].offset, raw })), source.wideGeometry);
      assertSameNumbers(saved.D.rawLocal, dRawLocal, `${saved.key} D local raw`);
      assertSameNumbers(saved.D.rawWide, dRawWide, `${saved.key} D wide raw`);
      assertSameNumbers(saved.D.local, dLocal, `${saved.key} D local stages`);
      assertSameNumbers(saved.D.wide, dWide, `${saved.key} D wide stages`);
      assert.equal(saved.D.winner, dWide.candidates[dWide.scoreOrder[0]].offset);

      const eRawLocal = source.localGeometry.map(query => e.sample(query.x, query.y));
      const eRawWide = source.wideGeometry.map(candidate => candidate.reads.map(query => e.sample(query.x, query.y)));
      const eLocal = localStages(eRawLocal);
      const eWide = evaluateWide(eRawWide.map((raw, i) => ({ offset: source.wideGeometry[i].offset, raw })), source.wideGeometry);
      assertSameNumbers(saved.E.rawLocal, eRawLocal, `${saved.key} E local raw`);
      assertSameNumbers(saved.E.rawWide, eRawWide, `${saved.key} E wide raw`);
      assertSameNumbers(saved.E.local, eLocal, `${saved.key} E local stages`);
      assertSameNumbers(saved.E.wide, eWide, `${saved.key} E wide stages`);
      assert.equal(saved.E.winner, eWide.candidates[eWide.scoreOrder[0]].offset);
    }
  }
  const strict = oldRows.filter(row => row.uniqueWinner);
  const wrong = (row, arm) => row[arm].winner !== row.referenceWinner;
  assert.equal(strict.length, 5072);
  assert.equal(strict.filter(row => wrong(row, 'C')).length, 2378);
  assert.equal(strict.filter(row => wrong(row, 'D')).length, 2378);
  assert.equal(strict.filter(row => wrong(row, 'E')).length, 1017);
  recovered.push(...strict.filter(row => wrong(row, 'C') && !wrong(row, 'D')));
  newErrors.push(...strict.filter(row => !wrong(row, 'C') && wrong(row, 'D')));
  assert.equal(recovered.length, 92); assert.equal(newErrors.length, 92);
  const sortedKeys = list => list.map(row => row.key).sort();
  assertSameNumbers(sortedKeys(recovered), wideCensus.filter(row => row.outcome === 'recovered').map(row => row.rowKey).sort(), 'prior recovered membership');
  assertSameNumbers(sortedKeys(newErrors), wideCensus.filter(row => row.outcome === 'new-error').map(row => row.rowKey).sort(), 'prior new-error membership');

  const harmful = transverseRows.filter(row => row.cohort === 'harmful');
  assert.equal(harmful.length, 26);
  const harmfulKeys = harmful.map(row => row.rowKey).sort();
  assert.equal(sha(Buffer.from(`${harmfulKeys.join('\n')}\n`)), '960def8884a5fee1be4ad0872ae0e66be508388b031a28d2ac4f09bdd8f59085');
  const savedProfiles = new Map(previous.oldProfiles.rows.map(row => [row.rowKey, row]));
  assertSameNumbers(harmfulKeys, [...savedProfiles.keys()].sort(), '26 prior weighted-max-first keys');
  let dSwitches = 0, dRivalSwitches = 0;
  for (const profile of harmful) {
    const saved = savedProfiles.get(profile.rowKey);
    const row = oldRows.find(item => item.key === profile.rowKey);
    assert(row && saved, `missing prior profile ${profile.rowKey}`);
    const targetIndex = saved.targetIndex, rivalIndex = saved.rivalIndex;
    for (const arm of ['C', 'D', 'E']) {
      assertSameNumbers(saved.profiles[arm].target.map(sample => sample.raw), row[arm].rawWide[targetIndex], `${profile.rowKey} ${arm} target profile`);
      assertSameNumbers(saved.profiles[arm].rival.map(sample => sample.raw), row[arm].rawWide[rivalIndex], `${profile.rowKey} ${arm} rival profile`);
    }
    const transition = saved.priorDTransition;
    if (transition.targetChanged) dSwitches += 1;
    if (transition.rivalChanged) dRivalSwitches += 1;
    assert.equal(transition.type, 'target-sample-switch');
    assert.deepEqual(transition.targetRawSamples.map(i => Math.abs(WIDE_SAMPLE_OFFSETS[i])), [1]);
    assert.deepEqual(transition.targetWeightedSamples.map(i => Math.abs(WIDE_SAMPLE_OFFSETS[i])), [0.5]);
    assert.equal(transition.targetChanged, true);
    assert.equal(transition.rivalChanged, false);
  }
  assert.equal(dSwitches, 26); assert.equal(dRivalSwitches, 0);
  return { receipts: { strictUnique: strict.length,
    CErrors: 2378, DErrors: 2378, EErrors: 1017, recovered: recovered.length,
    newErrors: newErrors.length, membershipExact: true,
    weightedMaxFirst26: 26, DTargetOuterToInner: dSwitches, DRivalSampleSwitch: dRivalSwitches } };
}

export function withMathRandomForbidden(callback) {
  const original = Math.random;
  let calls = 0;
  try {
    Math.random = () => { calls += 1; throw new Error('Gaussian fixed-cue study consumed RNG'); };
    const result = callback();
    assert.equal(calls, 0);
    return result;
  } finally {
    Math.random = original;
  }
}

function crossCheckProductionSensors(row, rawLocal, rawWide, local, wide) {
  const heading = row.wideGeometry[2].heading;
  const agent = { heading, x: row.localGeometry[4].x - Math.cos(heading) * 0.016,
    y: row.localGeometry[4].y - Math.sin(heading) * 0.016 };
  const fake = { state: { behavior: { sensorDistance: 0.042, sensorWidth: 0.014 } } };
  const replay = (queries, samples) => {
    let index = 0;
    fake.field = { sample(x, y) {
      const query = queries[index];
      assert(query, 'unexpected production sensor query');
      assert(Math.abs(x - query.x) <= 64 * Number.EPSILON && Math.abs(y - query.y) <= 64 * Number.EPSILON,
        'frozen physical query geometry changed');
      return samples[index++];
    } };
    return () => assert.equal(index, samples.length, 'production sensor query count changed');
  };
  let done = replay(row.localGeometry, rawLocal);
  const actualLocal = AntController.prototype.senseLocalTrail.call(fake, agent); done();
  for (const name of ['left', 'center', 'right', 'strength', 'coherence', 'steering']) {
    assert.equal(actualLocal[name], local[name], `production local ${name}`);
  }
  for (let index = 0; index < row.wideGeometry.length; index += 1) {
    const geometry = row.wideGeometry[index];
    done = replay(geometry.reads, rawWide[index]);
    const actualWide = AntController.prototype.senseTrail.call(fake, agent, geometry.heading); done();
    assert.equal(actualWide, wide.candidates[index].maximum, `production wide max ${index}`);
  }
}

function winner(wide) { return wide.candidates[wide.scoreOrder[0]].offset; }
function finalMargin(wide) { return wide.candidates[wide.scoreOrder[0]].score - wide.candidates[wide.scoreOrder[1]].score; }

function armSummary(rows, candidateArm) {
  const directional = rows.filter(row => sign(row.reference.steering) !== 0);
  const unique = rows.filter(row => row.uniqueWinner);
  const measure = name => ({
    localSignErrors: directional.filter(row => sign(row[name].local.steering) !== sign(row.reference.steering)).length,
    localSteeringMae: mean(rows.map(row => Math.abs(row[name].local.steering - row.reference.steering))),
    wideErrors: unique.filter(row => row[name].winner !== row.referenceWinner).length
  });
  const cWrong = row => sign(row.C.local.steering) !== sign(row.reference.steering);
  const candidateWrong = row => sign(row[candidateArm].local.steering) !== sign(row.reference.steering);
  const distributionOfMargin = values => distribution(values);
  return {
    count: rows.length, directionalLocalCount: directional.length, uniqueWideCount: unique.length,
    baseline: measure('C'), candidate: measure(candidateArm),
    directionalLocalSteeringMae: {
      baseline: mean(directional.map(row => Math.abs(row.C.local.steering - row.reference.steering))),
      candidate: mean(directional.map(row => Math.abs(row[candidateArm].local.steering - row.reference.steering)))
    },
    localRecovered: directional.filter(row => cWrong(row) && !candidateWrong(row)).length,
    localNewErrors: directional.filter(row => !cWrong(row) && candidateWrong(row)).length,
    wideRecovered: unique.filter(row => row.C.winner !== row.referenceWinner && row[candidateArm].winner === row.referenceWinner).length,
    wideNewErrors: unique.filter(row => row.C.winner === row.referenceWinner && row[candidateArm].winner !== row.referenceWinner).length,
    rawLocalMae: {
      baseline: mean(rows.flatMap(row => row.C.rawLocal.map((value, i) => Math.abs(value - row.referenceRawLocal[i])))),
      candidate: mean(rows.flatMap(row => row[candidateArm].rawLocal.map((value, i) => Math.abs(value - row.referenceRawLocal[i]))))
    },
    rawWideMae: {
      baseline: mean(rows.flatMap(row => row.C.rawWide.flatMap((candidate, j) => candidate.map((value, i) => Math.abs(value - row.referenceRawWide[j][i]))))),
      candidate: mean(rows.flatMap(row => row[candidateArm].rawWide.flatMap((candidate, j) => candidate.map((value, i) => Math.abs(value - row.referenceRawWide[j][i])))))
    },
    wideAmbiguity: Object.fromEntries(['C', candidateArm].map(name => [name, {
      analyticUniqueRows: unique.length,
      exactFinalTies: unique.filter(row => finalMargin(row[name].wide) === 0).length,
      precisionNearFinalTies: unique.filter(row => sign(finalMargin(row[name].wide)) === 0).length,
      finalMargin: distributionOfMargin(unique.map(row => finalMargin(row[name].wide)))
    }])),
    analyticMarginOfNewWideErrors: distributionOfMargin(unique.filter(row => row.C.winner === row.referenceWinner
      && row[candidateArm].winner !== row.referenceWinner).map(row => row.referenceWinnerMargin)),
    localContrast: Object.fromEntries(['C', candidateArm].map(name => [name, {
      strength: distribution(rows.map(row => row[name].local.strength)),
      coherence: distribution(rows.map(row => row[name].local.coherence)),
      absoluteBalance: distribution(rows.map(row => Math.abs(row[name].local.balance)))
    }]))
  };
}

function zeroControl(rows, candidateArm) {
  const measure = arm => ({
    falseNonzero: rows.filter(row => sign(row[arm].local.steering) !== 0).length,
    falseSteeringMae: mean(rows.map(row => Math.abs(row[arm].local.steering)))
  });
  return { count: rows.length, baseline: measure('C'), candidate: measure(candidateArm) };
}

export function compareMetrics(rows, arm) {
  const by = (kind, values) => Object.fromEntries(values.map(value => [value,
    armSummary(rows.filter(row => row[kind] === value), arm)]));
  const spread = name => distribution(FAMILIES.flatMap(shape => [...new Set(rows.filter(row => row.shape === shape).map(row => row.station))].map(station => {
    const phases = rows.filter(row => row.shape === shape && row.station === station).map(row => row[name].local.steering);
    return Math.max(...phases) - Math.min(...phases);
  })));
  const mirror = name => distribution(rows.filter(row => ['gentle', 'tight'].includes(row.shape)).map(row => {
    const other = rows.find(candidate => candidate.shape === `${row.shape}Mirror` && candidate.phase === row.phase && candidate.station === row.station);
    return Math.abs(row[name].local.steering + other[name].local.steering);
  }));
  return {
    global: armSummary(rows, arm), families: Object.fromEntries(FAMILIES.map(shape => [shape,
      armSummary(rows.filter(row => row.shape === shape), arm)])),
    phases: Object.fromEntries(PHASES.map(phase => [phase, armSummary(rows.filter(row => row.phase === phase), arm)])),
    zeroControls: {
      straight: zeroControl(rows.filter(row => row.shape === 'straight'), arm),
      sCurveAnalyticZero: zeroControl(rows.filter(row => row.shape === 'sCurve' && sign(row.reference.steering) === 0), arm)
    },
    phaseSteeringSpread: { baseline: spread('C'), candidate: spread(arm) },
    mirrorSteeringResidual: { baseline: mirror('C'), candidate: mirror(arm) }
  };
}

export function metricsForEachArm(rows, arms = ['C', 'D', 'E', 'F']) {
  return Object.fromEntries(arms.map(arm => {
    const directional = rows.filter(row => sign(row.reference.steering) !== 0);
    const unique = rows.filter(row => row.uniqueWinner);
    return [arm, {
      localSignErrors: directional.filter(row => sign(row[arm].local.steering) !== sign(row.reference.steering)).length,
      allRowLocalSteeringMae: mean(rows.map(row => Math.abs(row[arm].local.steering - row.reference.steering))),
      directionalLocalSteeringMae: mean(directional.map(row => Math.abs(row[arm].local.steering - row.reference.steering))),
      wideWinnerErrors: unique.filter(row => row[arm].winner !== row.referenceWinner).length,
      rawLocalMae: mean(rows.flatMap(row => row[arm].rawLocal.map((value, i) => Math.abs(value - row.referenceRawLocal[i])))),
      rawWideMae: mean(rows.flatMap(row => row[arm].rawWide.flatMap((candidate, j) => candidate.map((value, i) => Math.abs(value - row.referenceRawWide[j][i]))))),
      straightZero: zeroControl(rows.filter(row => row.shape === 'straight'), arm),
      sCurveAnalyticZero: zeroControl(rows.filter(row => row.shape === 'sCurve' && sign(row.reference.steering) === 0), arm),
      phaseSteeringSpread: distribution(FAMILIES.flatMap(shape => [...new Set(rows.filter(row => row.shape === shape).map(row => row.station))].map(station => {
        const values = rows.filter(row => row.shape === shape && row.station === station).map(row => row[arm].local.steering);
        return Math.max(...values) - Math.min(...values);
      }))),
      mirrorSteeringResidual: distribution(rows.filter(row => ['gentle', 'tight'].includes(row.shape)).map(row => {
        const other = rows.find(candidate => candidate.shape === `${row.shape}Mirror` && candidate.phase === row.phase && candidate.station === row.station);
        return Math.abs(row[arm].local.steering + other[arm].local.steering);
      }))
    }];
  }));
}

export function transitionCensus(rows, from, to, isError) {
  let fromErrors = 0, toErrors = 0, recovered = 0, newErrors = 0, persistentErrors = 0, unchangedCorrect = 0;
  for (const row of rows) {
    const fromError = isError(row, from), toError = isError(row, to);
    if (fromError) fromErrors += 1;
    if (toError) toErrors += 1;
    if (fromError && !toError) recovered += 1;
    else if (!fromError && toError) newErrors += 1;
    else if (fromError) persistentErrors += 1;
    else unchangedCorrect += 1;
  }
  return { count: rows.length, from, to, fromErrors, toErrors, recovered, newErrors,
    persistentErrors, unchangedCorrect };
}

function gate2(preflightResult, gate1Result, previousEvidence, verifiedPrior) {
  const { rows: sourceRows, streams, baselineRows } = preflightResult;
  const { oldRows, oldProfiles, oldResults } = previousEvidence;
  const fieldsF = gate1Result?.fields || loadGaussianFields(json(`${PACKAGE}/gate1/representation.json`));
  const fReceipts = json(`${PACKAGE}/gate1/representation.json`).frozenStreams.arms;
  const fReceiptMap = new Map(fReceipts.map(item => [item.id, item]));
  const fRasterShaByArm = new Map();
  for (const [armId, field] of fieldsF) {
    const receipt = fReceiptMap.get(armId);
    assert(receipt, `missing F raster receipt ${armId}`);
    const stats = fieldStats(field);
    assert.equal(stats.sha256, receipt.raster.sha256, `${armId} F raster hash`);
    fRasterShaByArm.set(armId, stats.sha256);
  }
  const fullRows = [];
  const localRng = withMathRandomForbidden(() => {
    for (let index = 0; index < sourceRows.length; index += 1) {
      const source = sourceRows[index], key = keyOf(source), saved = oldRows[index];
      assert.equal(saved.key, key);
      const armId = `${source.shape}|${source.phase}`;
      const f = fieldsF.get(armId), rasterSha256 = fRasterShaByArm.get(armId);
      assert(f && rasterSha256, `missing F raster ${armId}`);
      const rawLocal = source.localGeometry.map(query => f.sample(query.x, query.y));
      const rawWide = source.wideGeometry.map(candidate => candidate.reads.map(query => f.sample(query.x, query.y)));
      const local = localStages(rawLocal);
      const wide = evaluateWide(rawWide.map((raw, i) => ({ offset: source.wideGeometry[i].offset, raw })), source.wideGeometry);
      crossCheckProductionSensors(source, rawLocal, rawWide, local, wide);
      fullRows.push({ key, shape: source.shape, phase: source.phase, station: source.station,
        reference: source.localReference, referenceRawLocal: source.localReferenceRaw,
        referenceRawWide: source.wideReference.map(candidate => candidate.raw),
        referenceWinner: source.referenceWinner, referenceWinnerMargin: source.referenceWinnerMargin,
        uniqueWinner: source.referenceWinnerUnique,
        C: saved.C, D: saved.D, E: saved.E,
        F: { local, wide, winner: winner(wide), rawLocal, rawWide, rasterSha256 } });
    }
    return true;
  });
  assert.equal(localRng, true);
  assert.equal(fullRows.length, 5544);

  const priorCensus = metricsForEachArm(fullRows);
  const oldMetricsD = compareMetrics(fullRows, 'D');
  const oldMetricsE = compareMetrics(fullRows, 'E');
  const metricsF = compareMetrics(fullRows, 'F');
  assertSameNumbers(oldMetricsD, oldResults.gate2.metrics.CvsD, 'unchanged C/D Gate 2 metric replay');
  assertSameNumbers(oldMetricsE, oldResults.gate2.metrics.CvsE, 'unchanged C/E Gate 2 metric replay');
  const checksD = evaluateCueGate(oldMetricsD), checksE = evaluateCueGate(oldMetricsE), checksF = evaluateCueGate(metricsF);
  assertSameNumbers(checksE, oldResults.gate2.checks, 'unchanged E Gate 2 decision checks');

  const directional = fullRows.filter(row => sign(row.reference.steering) !== 0);
  const unique = fullRows.filter(row => row.uniqueWinner);
  const wrong = (row, arm) => row[arm].winner !== row.referenceWinner;
  const signWrong = (row, arm) => sign(row[arm].local.steering) !== sign(row.reference.steering);
  const pairwiseF = {
    local: Object.fromEntries(['C', 'D', 'E'].map(arm => [arm,
      transitionCensus(directional, arm, 'F', (row, name) => signWrong(row, name))])),
    wide: Object.fromEntries(['C', 'D', 'E'].map(arm => [arm,
      transitionCensus(unique, arm, 'F', (row, name) => wrong(row, name))]))
  };
  const recoveredCD = unique.filter(row => wrong(row, 'C') && !wrong(row, 'D'));
  const newCD = unique.filter(row => !wrong(row, 'C') && wrong(row, 'D'));
  assert.equal(recoveredCD.length, 92); assert.equal(newCD.length, 92);
  const priorDE = { recovered: recoveredCD.map(row => ({ key: row.key, C: row.C.winner, D: row.D.winner,
    E: row.E.winner, F: row.F.winner, FCorrect: !wrong(row, 'F') })),
    newErrors: newCD.map(row => ({ key: row.key, C: row.C.winner, D: row.D.winner,
      E: row.E.winner, F: row.F.winner, FCorrect: !wrong(row, 'F') })) };
  const eSpecificLocal = directional.filter(row => !signWrong(row, 'C') && signWrong(row, 'E'));
  const eSpecificWide = unique.filter(row => !wrong(row, 'C') && !wrong(row, 'D') && wrong(row, 'E'));
  assert.equal(eSpecificLocal.length, 267); assert.equal(eSpecificWide.length, 177);
  const eSpecificErrors = {
    local: { count: eSpecificLocal.length, FRecovers: eSpecificLocal.filter(row => !signWrong(row, 'F')).length,
      FStillWrong: eSpecificLocal.filter(row => signWrong(row, 'F')).length,
      rows: eSpecificLocal.map(row => ({ key: row.key, EWrong: true, FWrong: signWrong(row, 'F') })) },
    wide: { count: eSpecificWide.length, FRecovers: eSpecificWide.filter(row => !wrong(row, 'F')).length,
      FStillWrong: eSpecificWide.filter(row => wrong(row, 'F')).length,
      rows: eSpecificWide.map(row => ({ key: row.key, EWrong: true, FWrong: wrong(row, 'F') })) }
  };
  const fSpecific = {
    localNewVsC: directional.filter(row => !signWrong(row, 'C') && signWrong(row, 'F')).map(row => row.key),
    wideNewVsC: unique.filter(row => !wrong(row, 'C') && wrong(row, 'F')).map(row => row.key)
  };
  const profiles = profileCohort(fullRows, sourceRows, oldProfiles);
  const cDEFCohort = {
    priorDNewErrors: { count: priorDE.newErrors.length, ERepaired: priorDE.newErrors.filter(row => !wrong(fullRows.find(r => r.key === row.key), 'E')).length,
      FRepaired: priorDE.newErrors.filter(row => row.FCorrect).length, FStillWrong: priorDE.newErrors.filter(row => !row.FCorrect).length },
    priorDRecoveries: { count: priorDE.recovered.length, EStillCorrect: priorDE.recovered.filter(row => !wrong(fullRows.find(r => r.key === row.key), 'E')).length,
      FStillCorrect: priorDE.recovered.filter(row => row.FCorrect).length, FRegressed: priorDE.recovered.filter(row => !row.FCorrect).length },
    eSpecificErrors, fSpecific
  };
  const fullWideRows = fullRows.filter(row => row.uniqueWinner);
  const wideErrCount = arm => fullWideRows.filter(row => wrong(row, arm)).length;
  const localErrCount = arm => directional.filter(row => signWrong(row, arm)).length;
  const results = {
    schema: 'ant-316-gaussian-fixed-cue-results/v1',
    baseline: { main: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2',
      researchBranchPoint: '4a23ca73d13cd64e7e1afa6604d5b83d7f8dad57',
      representationContractTip: 'c3babbf4811ebede0cc4ef5615bd08317c937664' },
    preregistration: { commit: '10ba70e', path: `${PACKAGE}/PREREGISTRATION.md` },
    candidate: { label: 'F', grid: [SIZE, SIZE], pitch: PITCH, radius: RADIUS, sigma: SIGMA,
      writer: 'unchanged production compact Gaussian depositBrush', reader: 'unchanged production bilinear sample',
      cap: 8, decayHalfLifeSeconds: 15, doseConvention: 'legacy normalized nodal increments; not final physical units' },
    provenance: { frozenRowsSha256: INPUT_SHA256, oldCDErowSha256: previousEvidence.oldRowsSha,
      oldProfile26Sha256: previousEvidence.oldProfilesSha,
      productionSourceHashes: SOURCE_HASHES,
      writeStreamsSha256: sha(readFileSync(resolve(ROOT, ORIGINAL, 'inputs/raster-fixture/validation/write-streams-preflight.json'))),
      preregistrationSha256: sha(readFileSync(resolve(ROOT, PACKAGE, 'PREREGISTRATION.md'))),
      sourceRows: sourceRows.length, routePhaseArms: streams.arms.length,
      writesPerArm: 77, rowKeysSha256: sha(Buffer.from(`${sourceRows.map(keyOf).join('\n')}\n`)) },
    parityReceipts: { productionPreflight: preflightResult.receipt, replayedCDE: verifiedPrior.receipts,
      cdeSensorStagesAndGateMetricsExact: true, signedZeroNote: 'Saved JSON serializes -0 as 0; comparisons are exact numeric equality with no tolerance and treat signed zeros as equal.' },
    denominators: { localAll: 5544, localDirectional: 4012, straightZero: 924,
      sCurveAnalyticZero: 392, wideStrictUnique: 5072, localRawQueries: 99792, wideRawQueries: 138600 },
    primary: { arms: priorCensus, Gate2CvsD: oldMetricsD, Gate2CvsE: oldMetricsE,
      Gate2CvsF: metricsF, checks: { D: checksD, E: checksE, F: checksF },
      status: checksF.passed ? 'PASS' : 'MIXED / NOT QUALIFIED' },
    pairwiseF,
    priorCICCohorts: cDEFCohort,
    weightedMaxFirst26: profiles.summary,
    gate3: { status: 'NOT RUN', reason: 'Fixed-cue qualification only; movement requires a separate authorized pass.' },
    interpretation: checksF.passed ? 'QUALIFIED FOR LATER MOVEMENT SHADOW'
      : metricsF.global.candidate.localSignErrors < metricsF.global.baseline.localSignErrors
        || metricsF.global.candidate.localSteeringMae < metricsF.global.baseline.localSteeringMae
        || metricsF.global.candidate.wideErrors < metricsF.global.baseline.wideErrors
        ? 'MIXED / NOT QUALIFIED' : 'NEGATIVE'
  };
  const gate2RowsBytes = gzipSync(Buffer.from(JSON.stringify(fullRows)), { level: 9 });
  const profileBytes = gzipSync(Buffer.from(JSON.stringify({ schema: 'ant-316-gaussian-profile-26/v1', rows: profiles.rows })), { level: 9 });
  write(`${PACKAGE}/gate2/rows.json.gz`, gate2RowsBytes);
  write(`${PACKAGE}/gate2/profile-26.json.gz`, profileBytes);
  write(`${PACKAGE}/gate2/cohort-tracking.json`, `${JSON.stringify(cDEFCohort, null, 2)}\n`);
  writeJson(`${PACKAGE}/RESULTS.json`, results);
  return { results, fullRows, profileRows: profiles.rows, cDEFCohort };
}

function profileCohort(rows, sourceRows, savedProfiles) {
  const rowByKey = new Map(rows.map(row => [row.key, row]));
  const sourceByKey = new Map(sourceRows.map(row => [keyOf(row), row]));
  let fTargetRawTop = 0, fTargetWeightedTop = 0, fTargetFinalTop = 0, fOuterToInner = 0;
  const resultRows = savedProfiles.rows.map(saved => {
    const row = rowByKey.get(saved.rowKey), source = sourceByKey.get(saved.rowKey);
    assert(row && source, `missing frozen 26-row profile ${saved.rowKey}`);
    const targetIndex = saved.targetIndex, rivalIndex = saved.rivalIndex;
    const profiles = {};
    for (const arm of ['C', 'D', 'E', 'F']) {
      const targetGeometry = source.wideGeometry[targetIndex].reads;
      const rivalGeometry = source.wideGeometry[rivalIndex].reads;
      const targetRaw = row[arm].rawWide[targetIndex], rivalRaw = row[arm].rawWide[rivalIndex];
      const targetWeighted = targetRaw.map((value, index) => value * targetGeometry[index].weight);
      const rivalWeighted = rivalRaw.map((value, index) => value * rivalGeometry[index].weight);
      const samples = (raw, weighted, geometry) => raw.map((value, index) => ({
        offset: WIDE_SAMPLE_OFFSETS[index], query: { x: geometry[index].x, y: geometry[index].y },
        weight: geometry[index].weight, raw: value, weighted: weighted[index]
      }));
      const armWide = row[arm].wide;
      const targetRawArgmax = maxIndices(targetRaw), targetWeightedArgmax = maxIndices(targetWeighted);
      const rivalRawArgmax = maxIndices(rivalRaw), rivalWeightedArgmax = maxIndices(rivalWeighted);
      const targetScore = armWide.candidates[targetIndex].score, rivalScore = armWide.candidates[rivalIndex].score;
      const targetOuterToInner = targetRawArgmax.some(index => index === 0 || index === 4)
        && targetWeightedArgmax.some(index => index === 1 || index === 3);
      profiles[arm] = {
        target: samples(targetRaw, targetWeighted, targetGeometry), rival: samples(rivalRaw, rivalWeighted, rivalGeometry),
        targetRawArgmax, targetWeightedArgmax, rivalRawArgmax, rivalWeightedArgmax,
        targetMinusRivalRawMargin: Math.max(...targetRaw) - Math.max(...rivalRaw),
        targetMinusRivalWeightedMargin: Math.max(...targetWeighted) - Math.max(...rivalWeighted),
        targetMinusRivalFinalScore: targetScore - rivalScore,
        targetWeightedWinner: armWide.weightedOrder[0] === targetIndex,
        targetFinalWinner: armWide.scoreOrder[0] === targetIndex,
        targetOuterToInnerSampleSwitch: targetOuterToInner,
        finalWinnerOffset: row[arm].winner
      };
      if (arm === 'F') {
        if (armWide.rawOrder[0] === targetIndex) fTargetRawTop += 1;
        if (armWide.weightedOrder[0] === targetIndex) fTargetWeightedTop += 1;
        if (armWide.scoreOrder[0] === targetIndex) fTargetFinalTop += 1;
        if (targetOuterToInner) fOuterToInner += 1;
      }
    }
    return { rowKey: saved.rowKey, shape: saved.shape, phase: saved.phase, station: saved.station,
      targetIndex, targetOffset: saved.targetOffset, rivalIndex: saved.rivalIndex, rivalOffset: saved.rivalOffset,
      priorDTransition: saved.priorDTransition, profiles };
  });
  return { summary: { count: resultRows.length, route: {
      tight: resultRows.filter(row => row.shape === 'tight').length,
      tightMirror: resultRows.filter(row => row.shape === 'tightMirror').length },
    phase: Object.fromEntries(PHASES.map(phase => [phase, resultRows.filter(row => row.phase === phase).length])),
    F: { targetRawTop: fTargetRawTop, targetWeightedTop: fTargetWeightedTop,
      targetFinalTop: fTargetFinalTop, targetOuterToInnerSampleSwitch: fOuterToInner } }, rows: resultRows };
}

function maxIndices(values) {
  const max = Math.max(...values);
  return values.map((value, index) => value === max ? index : -1).filter(index => index >= 0);
}

function loadGaussianFields(gate1Report) {
  assert.equal(gate1Report.status, 'PASS');
  const fields = new Map();
  for (const arm of gate1Report.frozenStreams.arms) {
    const bytes = readFileSync(resolve(ROOT, arm.raster.file));
    assert.equal(bytes.length, SIZE * SIZE * 4);
    assert.equal(sha(bytes), arm.raster.sha256, `${arm.id} F raster bytes`);
    const field = new PheromoneField({ width: SIZE, height: SIZE });
    field.values.set(new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
    fields.set(arm.id, field);
  }
  assert.equal(fields.size, 24);
  return fields;
}

export function verifyFrozenControls(preflightResult) {
  const previousEvidence = loadPreviousEvidence(preflightResult.rows);
  const wideCensus = gzipJson(`${WIDE_ATTRIBUTION}/stage-census.json.gz`);
  const transverseRows = gzipJson(`${TRANSVERSE}/row-decomposition.json.gz`).rows;
  const verifiedPrior = withMathRandomForbidden(() => verifyBaselineAndPriorArms(preflightResult,
    previousEvidence, wideCensus, transverseRows));
  return { previousEvidence, verifiedPrior };
}

export function runGate1Only({ lattice = 1001 } = {}) {
  assert.equal(os.endianness(), 'LE');
  const preflightResult = withMathRandomForbidden(() => preflight());
  verifyFrozenControls(preflightResult);
  const result = withMathRandomForbidden(() => {
    const study = gate1(preflightResult.streams, { lattice });
    writeJson(`${PACKAGE}/gate1/representation.json`, study.report);
    return study.report;
  });
  return result;
}

export function runQualification({ lattice = 1001, gate2Only = false } = {}) {
  assert.equal(os.endianness(), 'LE');
  const preflightResult = withMathRandomForbidden(() => preflight());
  const { previousEvidence, verifiedPrior } = verifyFrozenControls(preflightResult);
  let gate1Result;
  if (gate2Only) {
    gate1Result = { fields: loadGaussianFields(json(`${PACKAGE}/gate1/representation.json`)) };
  } else {
    gate1Result = withMathRandomForbidden(() => {
      const result = gate1(preflightResult.streams, { lattice });
      writeJson(`${PACKAGE}/gate1/representation.json`, result.report);
      return result;
    });
  }
  const gate1Report = gate2Only ? json(`${PACKAGE}/gate1/representation.json`) : gate1Result.report;
  assert.equal(gate1Report.status, 'PASS', 'Gate 1 must pass before Gate 2 outcomes are calculated.');
  if (!gate1Result.fields) gate1Result.fields = loadGaussianFields(gate1Report);

  const gate2Result = gate2(preflightResult, gate1Result, previousEvidence, verifiedPrior);
  const results = {
    schema: 'ant-316-gaussian-fixed-cue-report/v1',
    gate1: { status: gate1Report.status, path: `${PACKAGE}/gate1/representation.json` },
    gate2: { status: gate2Result.results.primary.status,
      decision: gate2Result.results.interpretation, checks: gate2Result.results.primary.checks },
    candidate: gate2Result.results.candidate, denominators: gate2Result.results.denominators,
    priorCicCohorts: gate2Result.results.priorCICCohorts,
    weightedMaxFirst26: gate2Result.results.weightedMaxFirst26
  };
  writeJson(`${PACKAGE}/RESULTS.json`, gate2Result.results);
  const gate1Bytes = readFileSync(resolve(ROOT, PACKAGE, 'gate1/representation.json'));
  const gate2RowsBytes = readFileSync(resolve(ROOT, PACKAGE, 'gate2/rows.json.gz'));
  const profileBytes = readFileSync(resolve(ROOT, PACKAGE, 'gate2/profile-26.json.gz'));
  const cohortBytes = readFileSync(resolve(ROOT, PACKAGE, 'gate2/cohort-tracking.json'));
  const resultsBytes = readFileSync(resolve(ROOT, PACKAGE, 'RESULTS.json'));
  const rasterHashes = Object.fromEntries(gate1Report.frozenStreams.arms.map(arm => [arm.id, arm.raster.sha256]));
  const generated = { gate1: sha(gate1Bytes), results: sha(resultsBytes), gate2Rows: sha(gate2RowsBytes),
    profile26: sha(profileBytes), cohortTracking: sha(cohortBytes), rasterHashes };
  writeJson(`${PACKAGE}/generation-hashes.json`, generated);
  return { results: gate2Result.results, summary: results, generation: generated };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const gate1Only = process.argv.includes('--gate1-only');
  const gate2Only = process.argv.includes('--gate2-only');
  const output = gate1Only ? runGate1Only()
    : runQualification({ gate2Only });
  process.stdout.write(`${JSON.stringify(gate1Only
    ? { gate1: output.status, formulaComparisons: output.singleDab.formulaParity.comparisons,
      fallbackCount: output.singleDab.fallback.emptySupportCount, maxDistance: output.singleDab.maximumSourceToPositiveNodeDistance }
    : { gate1: output.summary.gate1.status, gate2: output.results.primary.status,
      decision: output.results.interpretation, metrics: output.results.primary.arms, generation: output.generation })}\n`);
}
