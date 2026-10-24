import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { CicPheromoneField } from './ant-cic-writer.js';
import { evaluateCueGate, preflight } from './ant-cic-writer-qualification.js';
import {
  INPUT_SHA256, SOURCE_HASHES, evaluateWide, localStages
} from './ant-field-writer-reader-failure-attribution.js';

export const SIZE = 316;
export const RADIUS = 0.0045;
export const PITCH = 1 / (SIZE - 1);
export const PACKAGE = 'docs/ant/evidence/2026-10-24-cic-316-grid-fixed-cue-qualification';
const BASE = 'docs/ant/evidence/2026-10-24-ant-cic-writer-qualification';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILIES = ['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve'];
const PHASES = ['p00', 'p10', 'p01', 'p11'];
const OFFSETS = [-0.92, -0.47, 0, 0.47, 0.92];
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
const rowKey = row => `${row.shape}|${row.phase}|${row.station}`;
const sign = value => Math.abs(value) <= 64 * Number.EPSILON * Math.max(1, Math.abs(value)) ? 0 : Math.sign(value);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function activeNodes(x, y, width = SIZE) {
  const gx = Math.max(0, Math.min(1, x)) * (width - 1);
  const gy = Math.max(0, Math.min(1, y)) * (width - 1);
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(width - 1, y0 + 1);
  const tx = gx - x0, ty = gy - y0;
  return [
    [x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)],
    [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]
  ].filter(([, , weight]) => weight > 0).map(([xIndex, yIndex, weight]) => ({
    index: yIndex * width + xIndex, xIndex, yIndex, weight,
    x: xIndex / (width - 1), y: yIndex / (width - 1)
  }));
}

function quantiles(values) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const at = q => sorted[Math.round(q * (sorted.length - 1))];
  return { count: sorted.length, mean: mean(values), min: at(0), p50: at(0.5), p90: at(0.9), max: at(1) };
}

export function geometryAudit(lattice = 1001) {
  const derivedSize = Math.ceil(1 + Math.SQRT2 / RADIUS);
  assert.equal(derivedSize, SIZE);
  assert(Math.SQRT2 * PITCH <= RADIUS);
  const field = new CicPheromoneField({ width: SIZE, height: SIZE });
  const supportCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const pointCount = lattice * lattice;
  const radiiSquared = new Float64Array(pointCount), sourceValues = new Float64Array(pointCount), nodePeaks = new Float64Array(pointCount);
  const touched = new Set();
  const baseX = 157, baseY = 157;
  let maxPositiveNodeDistance = 0, minRadiusMargin = Infinity, pointIndex = 0;
  for (let iy = 0; iy < lattice; iy += 1) for (let ix = 0; ix < lattice; ix += 1) {
    const fx = ix / (lattice - 1), fy = iy / (lattice - 1);
    const x = (baseX + fx) * PITCH, y = (baseY + fy) * PITCH;
    const nodes = activeNodes(x, y);
    supportCounts[nodes.length] += 1;
    let sum = 0, mx = 0, my = 0, second = 0;
    for (const node of nodes) {
      const distance = Math.hypot(node.x - x, node.y - y);
      assert(distance <= RADIUS, `positive CIC node outside R: ${distance}`);
      maxPositiveNodeDistance = Math.max(maxPositiveNodeDistance, distance);
      minRadiusMargin = Math.min(minRadiusMargin, RADIUS - distance);
      sum += node.weight;
      mx += node.weight * node.x;
      my += node.weight * node.y;
      second += node.weight * ((node.x - x) ** 2 + (node.y - y) ** 2);
    }
    assert(Math.abs(sum - 1) <= 64 * Number.EPSILON);
    assert(Math.abs(mx - x) <= 64 * Number.EPSILON);
    assert(Math.abs(my - y) <= 64 * Number.EPSILON);
    radiiSquared[pointIndex] = second;
    for (const index of touched) field.values[index] = 0;
    touched.clear();
    field.depositPoint({ x, y }, { amount: 1, radius: RADIUS });
    let peak = 0;
    for (const node of nodes) {
      touched.add(node.index);
      peak = Math.max(peak, field.values[node.index]);
    }
    sourceValues[pointIndex] = field.sample(x, y);
    nodePeaks[pointIndex] = peak;
    pointIndex += 1;
  }
  const epsilon = 2 ** -30;
  const cornerNear = [[epsilon, epsilon], [1 - epsilon, epsilon], [epsilon, 1 - epsilon], [1 - epsilon, 1 - epsilon]];
  for (const [fx, fy] of cornerNear) for (const node of activeNodes((baseX + fx) * PITCH, (baseY + fy) * PITCH)) {
    const distance = Math.hypot(node.x - (baseX + fx) * PITCH, node.y - (baseY + fy) * PITCH);
    assert(distance <= RADIUS);
    maxPositiveNodeDistance = Math.max(maxPositiveNodeDistance, distance);
    minRadiusMargin = Math.min(minRadiusMargin, RADIUS - distance);
  }
  const readSource = { x: (baseX + epsilon) * PITCH, y: (baseY + epsilon) * PITCH };
  field.clear();
  field.depositPoint(readSource, { amount: 1, radius: RADIUS });
  let readSupportSamples = 0, readTailDistance = 0, readTailValue = 0;
  const readSteps = 256;
  for (let iy = 0; iy <= readSteps; iy += 1) for (let ix = 0; ix <= readSteps; ix += 1) {
    const qx = (baseX - 1 + 3 * ix / readSteps) * PITCH;
    const qy = (baseY - 1 + 3 * iy / readSteps) * PITCH;
    const value = field.sample(qx, qy);
    if (value > 0) {
      readSupportSamples += 1;
      const distance = Math.hypot(qx - readSource.x, qy - readSource.y);
      if (distance > readTailDistance) { readTailDistance = distance; readTailValue = value; }
    }
  }
  assert(readTailDistance > RADIUS);
  return {
    formula: { radius: RADIUS, size: derivedSize, pitch: PITCH, maximumCornerDistanceBound: Math.SQRT2 * PITCH },
    construction: {
      fractionalLatticePerAxis: lattice, positionCount: lattice * lattice,
      representativeCell: [baseX, baseY], cornerNearEpsilon: epsilon,
      cornerNearAllFourSupportChecked: true, supportNodeCount: supportCounts,
      maximumPositiveNodeDistance: maxPositiveNodeDistance,
      minimumObservedRadiusMargin: minRadiusMargin,
      nodalSecondMomentTrace: quantiles(radiiSquared),
      sourceReadValue: quantiles(sourceValues), nodePeak: quantiles(nodePeaks),
      bilinearReadSupport: { method: '257 × 257 query lattice over the active CIC node rectangle plus one grid pitch in each direction',
        nonzeroSamples: readSupportSamples, maximumSampledSourceDistance: readTailDistance,
        valueAtMaximumSampledDistance: readTailValue, exceedsWriterRadius: readTailDistance > RADIUS }
    },
    check: 'PASS'
  };
}

function float32Budget(increment, before = 0) {
  return U32 * Math.abs(before + increment) + ALPHA32;
}

function measureRaster(field, expectedDose, expectedXMoment, expectedYMoment, budget) {
  let mass = 0, xMoment = 0, yMoment = 0, massBound = 0, xBound = 0, yBound = 0;
  for (let index = 0; index < field.values.length; index += 1) {
    const value = field.values[index];
    assert(Number.isFinite(value) && value >= 0);
    const x = (index % field.width) / (field.width - 1);
    const y = Math.floor(index / field.width) / (field.height - 1);
    mass += value; xMoment += value * x; yMoment += value * y;
    massBound += budget[index] || 0; xBound += (budget[index] || 0) * x; yBound += (budget[index] || 0) * y;
  }
  const doubleGuard = 64 * Number.EPSILON * Math.max(1, expectedDose);
  const bounds = { mass: massBound + doubleGuard, xMoment: xBound + doubleGuard, yMoment: yBound + doubleGuard };
  const expectedX = expectedXMoment / expectedDose, expectedY = expectedYMoment / expectedDose;
  const centroidBounds = {
    x: (bounds.xMoment + Math.abs(expectedX) * bounds.mass) / Math.max(mass, Number.MIN_VALUE) + 64 * Number.EPSILON * Math.max(1, Math.abs(xMoment / mass)),
    y: (bounds.yMoment + Math.abs(expectedY) * bounds.mass) / Math.max(mass, Number.MIN_VALUE) + 64 * Number.EPSILON * Math.max(1, Math.abs(yMoment / mass))
  };
  const residual = {
    dose: mass - expectedDose, xMoment: xMoment - expectedXMoment, yMoment: yMoment - expectedYMoment,
    centroidX: xMoment / mass - expectedX, centroidY: yMoment / mass - expectedY
  };
  return {
    requestedDose: expectedDose, acceptedDose: expectedDose, storedDose: mass,
    storedDoseResidual: residual.dose, requestedCentroid: { x: expectedX, y: expectedY },
    storedCentroid: { x: xMoment / mass, y: yMoment / mass },
    rawMomentResidual: { x: residual.xMoment, y: residual.yMoment },
    centroidResidual: { x: residual.centroidX, y: residual.centroidY },
    bounds, centroidBounds,
    withinDerivedFloat32Bounds: Math.abs(residual.dose) <= bounds.mass
      && Math.abs(residual.xMoment) <= bounds.xMoment && Math.abs(residual.yMoment) <= bounds.yMoment
      && Math.abs(residual.centroidX) <= centroidBounds.x && Math.abs(residual.centroidY) <= centroidBounds.y
  };
}

function pointMomentAudit() {
  const field = new CicPheromoneField({ width: SIZE, height: SIZE });
  const h = PITCH;
  const phases = [['p00', 0, 0], ['p10', h / 2, 0], ['p01', 0, h / 2], ['p11', h / 2, h / 2]];
  const doses = [0.000001, 0.027, 1];
  const records = [];
  let previous = [];
  for (const [phase, dx, dy] of phases) for (const amount of doses) {
    let maxDoseResidual = 0, maxMomentResidual = 0, maxCentroidResidual = 0, maxBoundRatio = 0;
    let writes = 0;
    for (let row = 0; row < 64; row += 1) for (let column = 0; column < 64; column += 1) {
      const x = (158 + (column + 0.5) / 64 - 0.5) / 315 + dx;
      const y = (158 + (row + 0.5) / 64 - 0.5) / 315 + dy;
      for (const index of previous) field.values[index] = 0;
      const nodes = activeNodes(x, y);
      assert.equal(nodes.length, 4);
      assert.equal(field.depositPoint({ x, y }, { amount, radius: RADIUS }), amount);
      let mass = 0, xMoment = 0, yMoment = 0, massBound = 0, xBound = 0, yBound = 0;
      for (const node of nodes) {
        const value = field.values[node.index];
        const contribution = amount * node.weight;
        assert(Number.isFinite(value) && value >= 0);
        const bound = float32Budget(contribution);
        mass += value; xMoment += value * node.x; yMoment += value * node.y;
        massBound += bound; xBound += bound * node.x; yBound += bound * node.y;
        assert(Math.hypot(node.x - x, node.y - y) <= RADIUS);
      }
      const guard = 64 * Number.EPSILON * Math.max(1, amount);
      const doseError = mass - amount, xError = xMoment - amount * x, yError = yMoment - amount * y;
      const centroidXError = xMoment / mass - x, centroidYError = yMoment / mass - y;
      const bounds = {
        dose: massBound + guard, x: xBound + guard, y: yBound + guard,
        centroidX: (xBound + guard + Math.abs(x) * (massBound + guard)) / mass + 64 * Number.EPSILON,
        centroidY: (yBound + guard + Math.abs(y) * (massBound + guard)) / mass + 64 * Number.EPSILON
      };
      assert(Math.abs(doseError) <= bounds.dose);
      assert(Math.abs(xError) <= bounds.x);
      assert(Math.abs(yError) <= bounds.y);
      assert(Math.abs(centroidXError) <= bounds.centroidX);
      assert(Math.abs(centroidYError) <= bounds.centroidY);
      maxDoseResidual = Math.max(maxDoseResidual, Math.abs(doseError));
      maxMomentResidual = Math.max(maxMomentResidual, Math.abs(xError), Math.abs(yError));
      maxCentroidResidual = Math.max(maxCentroidResidual, Math.abs(centroidXError), Math.abs(centroidYError));
      maxBoundRatio = Math.max(maxBoundRatio, Math.abs(doseError) / bounds.dose, Math.abs(xError) / bounds.x,
        Math.abs(yError) / bounds.y, Math.abs(centroidXError) / bounds.centroidX, Math.abs(centroidYError) / bounds.centroidY);
      previous = nodes.map(node => node.index);
      writes += 1;
    }
    records.push({ phase, amount, writes, maxDoseResidual, maxRawMomentResidual: maxMomentResidual,
      maxCentroidResidual, maxBoundRatio, passed: writes === 4096 });
  }
  return { phases: phases.map(([name]) => name), doses, writeCount: records.reduce((n, r) => n + r.writes, 0), records, passed: records.every(r => r.passed) };
}

function routeMomentAudit(streams) {
  const arms = [];
  for (const arm of streams.arms) {
    const field = new CicPheromoneField({ width: SIZE, height: SIZE });
    const budget = new Float64Array(field.values.length);
    let requested = 0, accepted = 0, expectedX = 0, expectedY = 0, maxActiveDistance = 0;
    const supportCount = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const event of arm.writes) {
      const { x, y } = event.gridPosition;
      const amount = event.requestedAmount;
      const nodes = activeNodes(x, y);
      supportCount[nodes.length] += 1;
      requested += amount; expectedX += amount * x; expectedY += amount * y;
      for (const node of nodes) {
        const distance = Math.hypot(node.x - x, node.y - y);
        assert(distance <= RADIUS);
        maxActiveDistance = Math.max(maxActiveDistance, distance);
        const contribution = amount * node.weight;
        budget[node.index] += float32Budget(contribution, field.values[node.index]);
      }
      accepted += field.depositPoint({ x, y }, { amount, radius: RADIUS });
    }
    const stats = measureRaster(field, requested, expectedX, expectedY, budget);
    const cappedNodes = field.values.reduce((count, value) => count + (value >= 8 ? 1 : 0), 0);
    const maxNode = Math.max(...field.values);
    assert.equal(accepted, requested);
    assert.equal(cappedNodes, 0, `frozen arm reached cap: ${arm.id}`);
    arms.push({ id: arm.id, writeCount: arm.writes.length, requestedDose: requested, acceptedDose: accepted,
      supportNodeCount: supportCount, maxActiveNodeDistance: maxActiveDistance, ...stats,
      maxNode, cappedNodes, rasterSha256: sha(Buffer.from(field.values.buffer)),
      passed: stats.withinDerivedFloat32Bounds && cappedNodes === 0 });
  }
  return { arms, writeCount: arms.reduce((sum, arm) => sum + arm.writeCount, 0),
    passed: arms.length === 24 && arms.every(arm => arm.passed) };
}

function boundaryAndCapAudit() {
  const field = new CicPheromoneField({ width: SIZE, height: SIZE });
  const edgePositions = [
    [0, 0], [1, 0], [0, 1], [1, 1],
    ...[0.125, 0.375, 0.625, 0.875].flatMap(t => [[0, t], [1, t], [t, 0], [t, 1]])
  ];
  const edges = edgePositions.map(([x, y]) => {
    field.clear();
    const budget = new Float64Array(field.values.length);
    const support = activeNodes(x, y);
    for (const node of support) budget[node.index] = float32Budget(0.027 * node.weight);
    const accepted = field.depositPoint({ x, y }, { amount: 0.027, radius: RADIUS });
    const nodes = [...field.values.entries()].filter(([, value]) => value !== 0);
    const moments = measureRaster(field, 0.027, 0.027 * x, 0.027 * y, budget);
    assert.equal(accepted, 0.027);
    assert(moments.withinDerivedFloat32Bounds);
    assert(nodes.length <= 4 && nodes.every(([index]) => {
      const nx = (index % SIZE) / 315, ny = Math.floor(index / SIZE) / 315;
      return Math.hypot(nx - x, ny - y) <= RADIUS;
    }));
    return { x, y, accepted, storedDose: moments.storedDose, centroid: moments.storedCentroid,
      residual: moments, activeNodes: nodes.length };
  });
  field.clear();
  const outsideAccepted = field.depositPoint({ x: -1e-10, y: 0.5 }, { amount: 1, radius: RADIUS });
  assert.equal(outsideAccepted, 0);
  assert.equal(field.getSnapshot().totalMass, 0);

  field.values.fill(0);
  const gx = 118.5, gy = 118.5, x = gx / 315, y = gy / 315;
  const nodes = activeNodes(x, y);
  const cappedIndex = nodes[0].index;
  field.values[cappedIndex] = 7.99;
  const before = field.getSnapshot().totalMass;
  const accepted = field.depositPoint({ x, y }, { amount: 1, radius: RADIUS });
  const after = field.getSnapshot().totalMass;
  const capLoss = 1 - (after - before);
  const neighborShares = nodes.slice(1).map(node => field.values[node.index]);
  assert.equal(accepted, 1);
  assert.equal(field.values[cappedIndex], 8);
  assert(neighborShares.every(value => value === 0.25));
  assert(capLoss > 0 && Math.abs(capLoss - 0.24) < 1e-6);

  const decayA = new PheromoneField({ width: SIZE, height: SIZE });
  const decayB = new CicPheromoneField({ width: SIZE, height: SIZE });
  for (let i = 0; i < decayA.values.length; i += 1) decayA.values[i] = decayB.values[i] = (i % 31) / 37;
  decayA.decay(3.75); decayB.decay(3.75);
  assert(Buffer.from(decayA.values.buffer).equals(Buffer.from(decayB.values.buffer)));
  return { edges, outside: { accepted: outsideAccepted, storedDose: 0 },
    cap: { accepted, before, storedAfter: after, storedIncrement: after - before, capLoss, redistributed: neighborShares.some(v => v !== 0.25) },
    decay: { elapsedSeconds: 3.75, exactInheritedParity: true }, passed: true };
}

export function runGate1(streams, { lattice = 1001 } = {}) {
  const geometry = geometryAudit(lattice);
  const points = pointMomentAudit();
  const routes = routeMomentAudit(streams);
  const boundaryAndCap = boundaryAndCapAudit();
  const passed = geometry.check === 'PASS' && points.passed && routes.passed && boundaryAndCap.passed;
  return { status: passed ? 'PASS' : 'FAIL', passed, geometry, pointWrites: points, routeWrites: routes, boundaryAndCap };
}

function assertWideProductionParity(row, actual, saved, arm) {
  for (const key of ['rawOrder', 'weightedOrder', 'hillOrder', 'scoreOrder']) assert.deepEqual(actual[key], saved[key], `${rowKey(row)} ${arm}.${key}`);
  assert(actual.confidence === saved.confidence);
  for (let i = 0; i < 5; i += 1) {
    const a = actual.candidates[i], b = saved.candidates[i];
    for (const key of ['offset', 'rawMaximum', 'maximum', 'response', 'trailScore', 'directionalPenalty', 'score']) assert(a[key] === b[key]);
    assertNumericParity(a.raw, b.raw, `${rowKey(row)} ${arm}.raw`);
    assertNumericParity(a.weighted, b.weighted, `${rowKey(row)} ${arm}.weighted`);
  }
}

function assertNumericParity(actual, saved, label) {
  if (Array.isArray(actual)) {
    assert(Array.isArray(saved) && actual.length === saved.length, `${label}: array shape`);
    actual.forEach((value, index) => assertNumericParity(value, saved[index], `${label}[${index}]`));
  } else if (actual && typeof actual === 'object') {
    assert(saved && typeof saved === 'object', `${label}: object shape`);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(saved).sort(), `${label}: object keys`);
    for (const key of Object.keys(actual)) assertNumericParity(actual[key], saved[key], `${label}.${key}`);
  } else if (typeof actual === 'number' && typeof saved === 'number') {
    assert(actual === saved, `${label}: ${actual} !== ${saved}`);
  } else assert.equal(actual, saved, label);
}

function crossCheckProductionSensors(row, rawLocal, rawWide, local, wide) {
  const heading = row.wideGeometry[2].heading;
  const agent = { heading, x: row.localGeometry[4].x - Math.cos(heading) * 0.016,
    y: row.localGeometry[4].y - Math.sin(heading) * 0.016 };
  const fake = { state: { behavior: { sensorDistance: 0.042, sensorWidth: 0.014 } } };
  const replay = (queries, samples) => {
    let index = 0;
    fake.field = { sample(x, y) {
      const q = queries[index];
      assert(q, 'unexpected extra production sensor query');
      assert(Math.abs(x - q.x) <= 64 * Number.EPSILON && Math.abs(y - q.y) <= 64 * Number.EPSILON, 'physical query changed');
      return samples[index++];
    } };
    return () => assert.equal(index, samples.length, 'missing production sensor query');
  };
  let done = replay(row.localGeometry, rawLocal);
  const actual = AntController.prototype.senseLocalTrail.call(fake, agent); done();
  for (const key of ['left', 'center', 'right', 'strength', 'coherence', 'steering']) assert.equal(actual[key], local[key]);
  for (let i = 0; i < row.wideGeometry.length; i += 1) {
    const geometry = row.wideGeometry[i];
    done = replay(geometry.reads, rawWide[i]);
    const signal = AntController.prototype.senseTrail.call(fake, agent, geometry.heading); done();
    assert.equal(signal, wide.candidates[i].maximum);
  }
}

function rasterStats(field) {
  let mass = 0, capped = 0, nonzero = 0;
  let peak = 0;
  for (const value of field.values) {
    assert(Number.isFinite(value) && value >= 0);
    mass += value; peak = Math.max(peak, value);
    if (value >= 8) capped += 1;
    if (value !== 0) nonzero += 1;
  }
  return { width: field.width, height: field.height, byteLength: field.values.byteLength,
    rasterSha256: sha(Buffer.from(field.values.buffer)), mass, peak, nonzeroNodes: nonzero, cappedNodes: capped };
}

function compareWide(rawWide, geometry) {
  return evaluateWide(rawWide.map((raw, index) => ({ offset: geometry[index].offset, raw })), geometry);
}

function armSummary(rows, candidateArm) {
  const directional = rows.filter(row => sign(row.reference.steering) !== 0);
  const unique = rows.filter(row => row.uniqueWinner);
  const measure = name => ({
    localSignErrors: directional.filter(row => sign(row[name].local.steering) !== sign(row.reference.steering)).length,
    localSteeringMae: mean(rows.map(row => Math.abs(row[name].local.steering - row.reference.steering))),
    wideErrors: unique.filter(row => row[name].winner !== row.referenceWinner).length
  });
  const baseWrong = row => sign(row.C.local.steering) !== sign(row.reference.steering);
  const armWrong = row => sign(row[candidateArm].local.steering) !== sign(row.reference.steering);
  const finalMargin = wide => wide.candidates[wide.scoreOrder[0]].score - wide.candidates[wide.scoreOrder[1]].score;
  const distribution = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const at = q => sorted[Math.round(q * (sorted.length - 1))];
    return values.length ? { count: values.length, mean: mean(values), min: at(0), p50: at(0.5), p90: at(0.9), max: at(1) }
      : { count: 0, mean: null, min: null, p50: null, p90: null, max: null };
  };
  return {
    count: rows.length, directionalLocalCount: directional.length, uniqueWideCount: unique.length,
    baseline: measure('C'), candidate: measure(candidateArm),
    directionalLocalSteeringMae: {
      baseline: mean(directional.map(row => Math.abs(row.C.local.steering - row.reference.steering))),
      candidate: mean(directional.map(row => Math.abs(row[candidateArm].local.steering - row.reference.steering)))
    },
    localRecovered: directional.filter(row => baseWrong(row) && !armWrong(row)).length,
    localNewErrors: directional.filter(row => !baseWrong(row) && armWrong(row)).length,
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
      finalMargin: distribution(unique.map(row => finalMargin(row[name].wide)))
    }])),
    analyticMarginOfNewWideErrors: distribution(unique.filter(row => row.C.winner === row.referenceWinner
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

function compareMetrics(rows, candidateArm) {
  const by = (kind, values) => Object.fromEntries(values.map(value => [value,
    armSummary(rows.filter(row => row[kind] === value), candidateArm)]));
  const spread = arm => {
    const values = FAMILIES.flatMap(shape => [...new Set(rows.filter(row => row.shape === shape).map(row => row.station))].map(station => {
      const phases = rows.filter(row => row.shape === shape && row.station === station).map(row => row[arm].local.steering);
      return Math.max(...phases) - Math.min(...phases);
    }));
    return quantiles(values);
  };
  const mirror = arm => quantiles(rows.filter(row => ['gentle', 'tight'].includes(row.shape)).map(row => {
    const other = rows.find(candidate => candidate.shape === `${row.shape}Mirror` && candidate.phase === row.phase && candidate.station === row.station);
    return Math.abs(row[arm].local.steering + other[arm].local.steering);
  }));
  return {
    global: armSummary(rows, candidateArm),
    families: by('shape', FAMILIES), phases: by('phase', PHASES),
    zeroControls: {
      straight: zeroControl(rows.filter(row => row.shape === 'straight'), candidateArm),
      sCurveAnalyticZero: zeroControl(rows.filter(row => row.shape === 'sCurve' && sign(row.reference.steering) === 0), candidateArm)
    },
    phaseSteeringSpread: { baseline: spread('C'), candidate: spread(candidateArm) },
    mirrorSteeringResidual: { baseline: mirror('C'), candidate: mirror(candidateArm) }
  };
}

function winner(wide) { return wide.candidates[wide.scoreOrder[0]].offset; }
function maxIndices(values) { const max = Math.max(...values); return values.map((value, index) => value === max ? index : -1).filter(index => index >= 0); }

function targetProfileRows(compared, transverseRows, sourceRows) {
  const harmful = transverseRows.filter(row => row.cohort === 'harmful');
  assert.equal(harmful.length, 26);
  const keyDigest = sha(Buffer.from(`${harmful.map(row => row.rowKey).sort().join('\n')}\n`));
  assert.equal(keyDigest, '960def8884a5fee1be4ad0872ae0e66be508388b031a28d2ac4f09bdd8f59085');
  const byKey = new Map(compared.map(row => [row.key, row]));
  const sourceByKey = new Map(sourceRows.map(row => [rowKey(row), row]));
  let rawTargetTop = 0, weightedTargetTop = 0, finalTargetTop = 0, targetOuterToInner = 0, rivalSampleChanged = 0;
  const rows = harmful.map(saved => {
    const actual = byKey.get(saved.rowKey);
    const source = sourceByKey.get(saved.rowKey);
    assert(actual, `missing frozen target-switch row ${saved.rowKey}`);
    assert(source, `missing frozen source geometry ${saved.rowKey}`);
    const targetIndex = saved.targetIndex;
    const rivalIndex = saved.weightedRivalIndex;
    const geometry = source.wideGeometry;
    const profiles = {};
    for (const arm of ['A', 'C', 'D']) {
      const candidate = saved.arms[arm].candidates[targetIndex];
      profiles[arm] = {
        target: candidate.samples.map(sample => ({ offset: sample.sensorOffset, query: sample.query, weight: sample.weight, raw: sample.raw, weighted: sample.weighted })),
        rival: saved.arms[arm].candidates[rivalIndex].samples.map(sample => ({ offset: sample.sensorOffset, query: sample.query, weight: sample.weight, raw: sample.raw, weighted: sample.weighted }))
      };
      const actualRaw = arm === 'A' ? actual.referenceRawWide
        : arm === 'C' ? actual.C.rawWide : actual.D.rawWide;
      assert.deepEqual(profiles[arm].target.map(sample => sample.raw), actualRaw[targetIndex], `${saved.rowKey} ${arm} target samples`);
      assert.deepEqual(profiles[arm].rival.map(sample => sample.raw), actualRaw[rivalIndex], `${saved.rowKey} ${arm} rival samples`);
    }
    const eRawTarget = actual.E.rawWide[targetIndex];
    const eRawRival = actual.E.rawWide[rivalIndex];
    const eTargetWeights = geometry[targetIndex].reads.map(read => read.weight);
    const eRivalWeights = geometry[rivalIndex].reads.map(read => read.weight);
    const eWeightedTarget = eRawTarget.map((value, index) => value * eTargetWeights[index]);
    const eWeightedRival = eRawRival.map((value, index) => value * eRivalWeights[index]);
    profiles.E = {
      target: eRawTarget.map((raw, index) => ({ offset: [-1, -0.5, 0, 0.5, 1][index],
        query: geometry[targetIndex].reads[index], weight: eTargetWeights[index], raw, weighted: eWeightedTarget[index] })),
      rival: eRawRival.map((raw, index) => ({ offset: [-1, -0.5, 0, 0.5, 1][index],
        query: geometry[rivalIndex].reads[index], weight: eRivalWeights[index], raw, weighted: eWeightedRival[index] }))
    };
    const rawTargetArgmax = maxIndices(eRawTarget), weightedTargetArgmax = maxIndices(eWeightedTarget);
    const rawRivalArgmax = maxIndices(eRawRival), weightedRivalArgmax = maxIndices(eWeightedRival);
    const targetSwitched = rawTargetArgmax.some(index => index === 0 || index === 4)
      && weightedTargetArgmax.some(index => index === 1 || index === 3);
    if (actual.E.wide.rawOrder[0] === targetIndex) rawTargetTop += 1;
    if (actual.E.wide.weightedOrder[0] === targetIndex) weightedTargetTop += 1;
    if (actual.E.winner === saved.analyticTargetOffset) finalTargetTop += 1;
    if (targetSwitched) targetOuterToInner += 1;
    const priorRivalIndices = saved.transition.rivalRawSamples;
    const eRivalRawChanged = !priorRivalIndices.every(index => rawRivalArgmax.includes(index));
    if (eRivalRawChanged) rivalSampleChanged += 1;
    return {
      rowKey: saved.rowKey, shape: saved.shape, phase: saved.phase, station: saved.station,
      targetIndex, targetOffset: saved.analyticTargetOffset, rivalIndex, rivalOffset: saved.weightedRivalOffset,
      priorDTransition: saved.transition, rasterSha256: actual.rasterSha256,
      profiles, E: { rawOrder: actual.E.wide.rawOrder, weightedOrder: actual.E.wide.weightedOrder,
        finalOrder: actual.E.wide.scoreOrder, rawTargetArgmax, weightedTargetArgmax,
        rawRivalArgmax, weightedRivalArgmax, targetOuterToInnerSwitch: targetSwitched,
        targetRawMaximum: Math.max(...eRawTarget), targetWeightedMaximum: Math.max(...eWeightedTarget),
        rivalRawMaximum: Math.max(...eRawRival), rivalWeightedMaximum: Math.max(...eWeightedRival),
        targetMinusRivalRawMargin: Math.max(...eRawTarget) - Math.max(...eRawRival),
        targetMinusRivalWeightedMargin: Math.max(...eWeightedTarget) - Math.max(...eWeightedRival),
        targetFinalWinner: actual.E.winner === saved.analyticTargetOffset,
        rivalRawSampleChangedFromD: eRivalRawChanged }
    };
  });
  assert.equal(rows.length, 26);
  return { count: rows.length, keySha256: keyDigest,
    route: { tight: rows.filter(row => row.shape === 'tight').length, tightMirror: rows.filter(row => row.shape === 'tightMirror').length },
    phase: Object.fromEntries(PHASES.map(phase => [phase, rows.filter(row => row.phase === phase).length])),
    E: { rawTargetTop, weightedTargetTop, finalTargetTop, targetOuterToInnerSwitch: targetOuterToInner,
      rivalRawSampleChanged: rivalSampleChanged }, rows };
}

function cohortOutcomes(rows) {
  const unique = rows.filter(row => row.uniqueWinner);
  const productionWrong = row => row.C.winner !== row.referenceWinner;
  const dWrong = row => row.D.winner !== row.referenceWinner;
  const eWrong = row => row.E.winner !== row.referenceWinner;
  const recovered = unique.filter(row => productionWrong(row) && !dWrong(row));
  const newErrors = unique.filter(row => !productionWrong(row) && dWrong(row));
  assert.equal(unique.length, 5072); assert.equal(unique.filter(productionWrong).length, 2378);
  assert.equal(unique.filter(dWrong).length, 2378); assert.equal(recovered.length, 92); assert.equal(newErrors.length, 92);
  const census = (items, predicate) => ({ count: items.length, ECorrect: items.filter(row => !eWrong(row)).length,
    EWrong: items.filter(eWrong).length, keys: items.filter(predicate).map(row => row.key) });
  const eSpecific = unique.filter(row => !productionWrong(row) && !dWrong(row) && eWrong(row));
  const eRecoveredFromDNew = newErrors.filter(row => !eWrong(row));
  const eStillNew = newErrors.filter(eWrong);
  const priorRecoveredStillCorrect = recovered.filter(row => !eWrong(row));
  const priorRecoveredRegressed = recovered.filter(eWrong);
  return {
    denominators: { strictUnique: unique.length, CErrors: 2378, DErrors: 2378 },
    recoveredCtoD: census(recovered, eWrong), newErrorCtoD: census(newErrors, eWrong),
    priorDNewErrors: { total: newErrors.length, EStillWrong: eStillNew.length, ERecovered: eRecoveredFromDNew.length,
      EStillWrongKeys: eStillNew.map(row => row.key), ERecoveredKeys: eRecoveredFromDNew.map(row => row.key) },
    priorDRecoveries: { total: recovered.length, EStillCorrect: priorRecoveredStillCorrect.length,
      ERegressed: priorRecoveredRegressed.length, EStillCorrectKeys: priorRecoveredStillCorrect.map(row => row.key),
      ERegressedKeys: priorRecoveredRegressed.map(row => row.key) },
    ESpecificNewErrors: { count: eSpecific.length, keys: eSpecific.map(row => row.key) },
    CvsE: { EErrors: unique.filter(eWrong).length,
      recovered: unique.filter(row => productionWrong(row) && !eWrong(row)).length,
      newErrors: unique.filter(row => !productionWrong(row) && eWrong(row)).length }
  };
}

export function runGate2({ rows, fields, baselineRows, streams }) {
  const oldRows = gzipJson(`${BASE}/gate2/rows.json.gz`);
  const previousResult = json(`${BASE}/RESULTS.json`);
  const savedGateRowsSha = sha(readFileSync(resolve(ROOT, `${BASE}/gate2/rows.json.gz`)));
  assert.equal(savedGateRowsSha, previousResult.rowArtifact.sha256);
  assert.equal(savedGateRowsSha, '550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f');
  assert.equal(oldRows.length, 5544);
  const frozen = new Map(rows.map((row, index) => [rowKey(row), { row, index }]));
  assert.equal(frozen.size, 5544);
  assert.deepEqual(oldRows.map(rowKey), rows.map(rowKey));
  const priorRasterStats = new Map(previousResult.gate2.rasters.map(entry => [entry.id, entry]));
  const transverse = gzipJson('docs/ant/evidence/2026-10-24-cic-transverse-sample-diagnostic/row-decomposition.json.gz');
  const harmful = transverse.rows.filter(row => row.cohort === 'harmful');
  assert.equal(harmful.length, 26);
  assert.equal(sha(Buffer.from(`${harmful.map(row => row.rowKey).sort().join('\n')}\n`)),
    '960def8884a5fee1be4ad0872ae0e66be508388b031a28d2ac4f09bdd8f59085');

  // Reproduce the old C/D result and frozen profile-switch cohort before E is constructed.
  const priorCic = new Map();
  for (const arm of streams.arms) {
    const id = arm.id, [shape, phase] = id.split('|');
    const d = new CicPheromoneField({ width: 96, height: 96 });
    for (const event of arm.writes) d.depositPoint(event.gridPosition, { amount: event.requestedAmount, radius: RADIUS });
    const oldRaster = readFileSync(resolve(ROOT, `${BASE}/gate2/rasters/${shape}-${phase}.f32le`));
    assert(Buffer.from(d.values.buffer).equals(oldRaster), `pre-E D raster bytes changed: ${id}`);
    for (const source of rows.filter(row => row.shape === shape && row.phase === phase)) {
      const key = rowKey(source), index = frozen.get(key).index, saved = oldRows[index];
      assert.equal(rowKey(saved), key);
      assert.deepEqual(saved.baseline.rawLocal, source.localProductionRaw, `${key} pre-E C local raw`);
      assert.deepEqual(saved.baseline.rawWide, source.wideProduction.map(candidate => candidate.raw), `${key} pre-E C wide raw`);
      assertNumericParity(baselineRows[index].local, saved.baseline.local, `${key} pre-E C local`);
      assertWideProductionParity(source, baselineRows[index].wide, saved.baseline.wide, 'pre-E C');
      const dRawLocal = source.localGeometry.map(query => d.sample(query.x, query.y));
      const dRawWide = source.wideGeometry.map(candidate => candidate.reads.map(query => d.sample(query.x, query.y)));
      assert.deepEqual(dRawLocal, saved.candidate.rawLocal, `${key} pre-E D local raw`);
      assert.deepEqual(dRawWide, saved.candidate.rawWide, `${key} pre-E D wide raw`);
      assertNumericParity(localStages(dRawLocal), saved.candidate.local, `${key} pre-E D local`);
      const dWide = compareWide(dRawWide, source.wideGeometry);
      assertWideProductionParity(source, dWide, saved.candidate.wide, 'pre-E D');
      assert.equal(winner(dWide), saved.candidate.winner, `${key} pre-E D winner`);
      priorCic.set(key, { source, saved, dRawWide, dWide });
    }
  }
  assert.equal(priorCic.size, 5544);
  const strictPrior = oldRows.filter(row => row.uniqueWinner);
  const priorCErrors = strictPrior.filter(row => row.baseline.winner !== row.referenceWinner);
  const priorDErrors = strictPrior.filter(row => row.candidate.winner !== row.referenceWinner);
  const priorRecovered = strictPrior.filter(row => row.baseline.winner !== row.referenceWinner
    && row.candidate.winner === row.referenceWinner);
  const priorNewErrors = strictPrior.filter(row => row.baseline.winner === row.referenceWinner
    && row.candidate.winner !== row.referenceWinner);
  assert.equal(strictPrior.length, 5072);
  assert.equal(priorCErrors.length, 2378); assert.equal(priorDErrors.length, 2378);
  assert.equal(priorRecovered.length, 92); assert.equal(priorNewErrors.length, 92);
  const census = gzipJson('docs/ant/evidence/2026-10-24-cic-wide-stage-attribution/stage-census.json.gz');
  assert.deepEqual(priorRecovered.map(row => rowKey(row)).sort(), census.filter(row => row.outcome === 'recovered').map(row => row.rowKey).sort());
  assert.deepEqual(priorNewErrors.map(row => rowKey(row)).sort(), census.filter(row => row.outcome === 'new-error').map(row => row.rowKey).sort());
  const sourceByKey = new Map(rows.map(row => [rowKey(row), row]));
  for (const profile of harmful) {
    const replay = priorCic.get(profile.rowKey), source = sourceByKey.get(profile.rowKey);
    assert(replay && source, `missing pre-E profile row: ${profile.rowKey}`);
    const { targetIndex, weightedRivalIndex } = profile;
    const target = replay.dWide.candidates[targetIndex], rival = replay.dWide.candidates[weightedRivalIndex];
    assert(replay.dWide.rawOrder[0] === targetIndex, `${profile.rowKey} pre-E target not raw top`);
    assert(replay.dWide.weightedOrder[0] !== targetIndex, `${profile.rowKey} pre-E target retained weighted top`);
    assert.equal(replay.dWide.scoreOrder[0], weightedRivalIndex, `${profile.rowKey} pre-E final rival`);
    assert.deepEqual(maxIndices(target.raw), profile.transition.targetRawSamples, `${profile.rowKey} D target raw argmax`);
    assert.deepEqual(maxIndices(target.weighted), profile.transition.targetWeightedSamples, `${profile.rowKey} D target weighted argmax`);
    assert.deepEqual(maxIndices(rival.raw), profile.transition.rivalRawSamples, `${profile.rowKey} D rival raw argmax`);
    assert.deepEqual(maxIndices(rival.weighted), profile.transition.rivalWeightedSamples, `${profile.rowKey} D rival weighted argmax`);
    assert.equal(profile.transition.targetChanged, true);
    assert.equal(profile.transition.rivalChanged, false);
    assert.equal(profile.transition.type, 'target-sample-switch');
    assert.deepEqual(profile.arms.D.candidates[targetIndex].samples.map(sample => sample.raw),
      replay.dRawWide[targetIndex], `${profile.rowKey} saved D target profile`);
    assert.deepEqual(profile.arms.D.candidates[weightedRivalIndex].samples.map(sample => sample.raw),
      replay.dRawWide[weightedRivalIndex], `${profile.rowKey} saved D rival profile`);
  }

  const compared = [];
  const rasterReceipts = [];
  for (const arm of streams.arms) {
    const id = arm.id, [shape, phase] = id.split('|');
    const c = fields.get(id);
    const d = new CicPheromoneField({ width: 96, height: 96 });
    const e = new CicPheromoneField({ width: SIZE, height: SIZE });
    for (const event of arm.writes) {
      d.depositPoint(event.gridPosition, { amount: event.requestedAmount, radius: RADIUS });
      e.depositPoint(event.gridPosition, { amount: event.requestedAmount, radius: RADIUS });
    }
    const dStats = rasterStats(d), eStats = rasterStats(e);
    const oldRaster = readFileSync(resolve(ROOT, `${BASE}/gate2/rasters/${shape}-${phase}.f32le`));
    const oldSummary = priorRasterStats.get(id);
    assert(oldSummary, `missing saved D raster receipt: ${id}`);
    assert.equal(sha(oldRaster), oldSummary.sha256);
    assert(Buffer.from(d.values.buffer).equals(oldRaster), `D raster bytes changed: ${id}`);
    assert.equal(dStats.rasterSha256, oldSummary.sha256);

    for (const source of rows.filter(row => row.shape === shape && row.phase === phase)) {
      const key = rowKey(source), index = frozen.get(key).index;
      const saved = oldRows[index];
      assert.equal(rowKey(saved), key);
      const cRawLocal = source.localProductionRaw;
      const cRawWide = source.wideProduction.map(candidate => candidate.raw);
      const cLocal = baselineRows[index].local, cWide = baselineRows[index].wide;
      assert.deepEqual(saved.baseline.rawLocal, cRawLocal, `${key} saved C local raw`);
      assert.deepEqual(saved.baseline.rawWide, cRawWide, `${key} saved C wide raw`);
      assertNumericParity(cLocal, saved.baseline.local, `${key} C local output`);
      assertWideProductionParity(source, cWide, saved.baseline.wide, 'C');

      const dRawLocal = source.localGeometry.map(query => d.sample(query.x, query.y));
      const dRawWide = source.wideGeometry.map(candidate => candidate.reads.map(query => d.sample(query.x, query.y)));
      const dLocal = localStages(dRawLocal), dWide = compareWide(dRawWide, source.wideGeometry);
      assert.deepEqual(dRawLocal, saved.candidate.rawLocal, `${key} saved D local raw`);
      assert.deepEqual(dRawWide, saved.candidate.rawWide, `${key} saved D wide raw`);
      assertNumericParity(dLocal, saved.candidate.local, `${key} D local output`);
      assertWideProductionParity(source, dWide, saved.candidate.wide, 'D');
      assert.equal(winner(dWide), saved.candidate.winner, `${key} D winner`);

      const eRawLocal = source.localGeometry.map(query => e.sample(query.x, query.y));
      const eRawWide = source.wideGeometry.map(candidate => candidate.reads.map(query => e.sample(query.x, query.y)));
      const eLocal = localStages(eRawLocal), eWide = compareWide(eRawWide, source.wideGeometry);
      crossCheckProductionSensors(source, eRawLocal, eRawWide, eLocal, eWide);
      compared.push({ key, shape, phase, station: source.station,
        reference: source.localReference, referenceRawLocal: source.localReferenceRaw,
        referenceRawWide: source.wideReference.map(candidate => candidate.raw),
        referenceWinner: source.referenceWinner, referenceWinnerMargin: source.referenceWinnerMargin,
        uniqueWinner: source.referenceWinnerUnique,
        C: { local: cLocal, wide: cWide, winner: source.productionWinner, rawLocal: cRawLocal, rawWide: cRawWide },
        D: { local: dLocal, wide: dWide, winner: winner(dWide), rawLocal: dRawLocal, rawWide: dRawWide },
        E: { local: eLocal, wide: eWide, winner: winner(eWide), rawLocal: eRawLocal, rawWide: eRawWide,
          rasterSha256: eStats.rasterSha256 } });
    }
    rasterReceipts.push({ id, writeCount: arm.writes.length, C: rasterStats(c), D: dStats, E: eStats,
      sameEvents: true, noECap: eStats.cappedNodes === 0 });
  }
  assert.equal(compared.length, 5544);
  const priorRows = census.map(row => ({ key: row.rowKey, outcome: row.outcome }));
  const byCensus = new Map(priorRows.map(row => [row.key, row.outcome]));
  const recoveredKeys = compared.filter(row => row.uniqueWinner && row.C.winner !== row.referenceWinner && row.D.winner === row.referenceWinner).map(row => row.key).sort();
  const newErrorKeys = compared.filter(row => row.uniqueWinner && row.C.winner === row.referenceWinner && row.D.winner !== row.referenceWinner).map(row => row.key).sort();
  assert.equal(recoveredKeys.length, 92); assert.equal(newErrorKeys.length, 92);
  assert.deepEqual(recoveredKeys, priorRows.filter(row => row.outcome === 'recovered').map(row => row.key).sort());
  assert.deepEqual(newErrorKeys, priorRows.filter(row => row.outcome === 'new-error').map(row => row.key).sort());
  assert(compared.every(row => byCensus.get(row.key) !== undefined || !row.uniqueWinner));

  const profiles = targetProfileRows(compared, transverse.rows, rows);
  const { rows: profileRows, ...profileSummary } = profiles;
  const CvsD = compareMetrics(compared, 'D');
  const CvsE = compareMetrics(compared, 'E');
  const outcomes = cohortOutcomes(compared);
  const result = {
    status: evaluateCueGate(CvsE).passed ? 'PASS' : 'MIXED / NOT QUALIFIED',
    checks: evaluateCueGate(CvsE), metrics: { CvsD, CvsE },
    reproduction: { rows: compared.length, strictUnique: compared.filter(row => row.uniqueWinner).length,
      CErrors: CvsD.global.baseline.wideErrors, DErrors: CvsD.global.candidate.wideErrors,
      recovered: CvsD.global.wideRecovered, newErrors: CvsD.global.wideNewErrors,
      savedCAndDExact: true, sourceRowIdentityExact: true, EProductionSensorMethodParity: true },
    priorCicCohortsUnderE: outcomes, weightedMaxFirst26: profileSummary,
    rasterReceipts
  };
  return { result, compared, profileRows };
}

export function runQualification() {
  const preflightResult = preflight();
  const gate1 = runGate1(preflightResult.streams);
  writeJson(`${PACKAGE}/gate1.json`, gate1);
  if (!gate1.passed) throw new Error('Gate 1 failed; Gate 2 stopped before E cue evaluation.');
  const gate2 = runGate2(preflightResult);
  const gate3 = { status: 'NOT RUN', reason: gate2.result.status === 'PASS'
    ? 'Movement requires a separate preregistration and is outside this pass.'
    : 'The fixed-cue advancement gate did not pass.' };
  const classification = gate2.result.status === 'PASS' ? 'promising for next gate'
    : gate2.result.metrics.CvsE.global.candidate.localSignErrors < gate2.result.metrics.CvsE.global.baseline.localSignErrors
      && gate2.result.metrics.CvsE.global.candidate.localSteeringMae < gate2.result.metrics.CvsE.global.baseline.localSteeringMae
      ? 'mixed' : 'negative';
  const results = {
    schema: 'ant-cic-316-grid-qualification/v1',
    baseline: { main: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2', branchPoint: 'c3babbf4811ebede0cc4ef5615bd08317c937664' },
    candidate: { size: SIZE, pitch: PITCH, radius: RADIUS, writer: 'four-node CIC', reader: 'unchanged bilinear', temporaryContract: 'node-sum dose and node cap; not final physical units' },
    provenance: { stationInputSha256: INPUT_SHA256, sourceHashes: SOURCE_HASHES,
      writeStreamSha256: sha(readFileSync(resolve(ROOT, `${BASE}/inputs/raster-fixture/validation/write-streams-preflight.json`))),
      priorGate2RowsSha256: sha(readFileSync(resolve(ROOT, `${BASE}/gate2/rows.json.gz`))),
      preregistrationCommit: '4a504ef' },
    gate1, gate2: gate2.result, gate3, classification
  };
  const rowsBytes = gzipSync(Buffer.from(JSON.stringify(gate2.compared)), { level: 9 });
  const profilesBytes = gzipSync(Buffer.from(JSON.stringify({ schema: 'ant-cic-316-target-profile-rows/v1', rows: gate2.profileRows })), { level: 9 });
  writeJson(`${PACKAGE}/RESULTS.json`, results);
  write(`${PACKAGE}/gate2/rows.json.gz`, rowsBytes);
  write(`${PACKAGE}/gate2/target-profile-26.json.gz`, profilesBytes);
  const generation = {
    gate1: sha(Buffer.from(JSON.stringify(gate1))), results: sha(Buffer.from(JSON.stringify(results))),
    gate2Rows: sha(rowsBytes), targetProfile26: sha(profilesBytes)
  };
  writeJson(`${PACKAGE}/generation-hashes.json`, generation);
  return { results, generation };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = runQualification();
  process.stdout.write(`${JSON.stringify({ status: output.results.gate2.status, classification: output.results.classification,
    checksPassed: output.results.gate2.checks.passed, generation: output.generation })}\n`);
}
