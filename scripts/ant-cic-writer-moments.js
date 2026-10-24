import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { CicPheromoneField } from './ant-cic-writer.js';

const U32 = 2 ** -24;
const ALPHA32 = 2 ** -150;
const EPS64 = Number.EPSILON;
const PROTOCOL = 'docs/ant/evidence/2026-10-24-ant-cic-writer-qualification/PROTOCOL.md';
const FIXTURE = 'docs/ant/evidence/2026-10-24-ant-cic-writer-qualification/inputs/raster-fixture';

export async function runMomentGate({ streams, outputDir }) {
  const started = performance.now();
  const first = await measureGates(streams);
  const replay = await measureGates(streams);
  const deterministic = JSON.stringify(first) === JSON.stringify(replay);
  const { checks, pointSummary, boundarySummary, routeSummary } = first;
  checks.push({ id: 'deterministic Gate 1 replay', passed: deterministic });
  const passed = checks.every((check) => check.passed);
  const summary = {
    schema: 'ant-cic-writer-moment-gate/v1', gate: 'Gate 1',
    status: passed ? 'PASS' : 'FAIL', passed, scope: 'dose and first spatial moment only',
    input: { streamSchema: streams?.schema, protocolPath: PROTOCOL },
    pointWrites: pointSummary.writes, routeArms: routeSummary.arms.length,
    routeWriteCount: routeSummary.writeCount, cappedTargetArms: routeSummary.cappedTargetArms,
    point: pointSummary, boundaries: boundarySummary, routes: routeSummary.arms,
    capStress: first.capStress, checks,
    maxima: maxima([...pointSummary.cases.flatMap((c) => c.records), ...routeSummary.arms]),
  };
  await mkdir(outputDir, { recursive: true });
  const compressed = gzipSync(Buffer.from(JSON.stringify(summary)));
  await writeFile(join(outputDir, 'gate1.json.gz'), compressed);
  await writeFile(join(outputDir, 'run-metadata.json'), `${JSON.stringify({ schema: 'ant-cic-gate1-run-metadata/v1', elapsedMs: performance.now() - started, scientificArtifactSha256: sha(compressed), deterministicReplayPassed: deterministic }, null, 2)}\n`);
  return summary;
}

async function measureGates(streams) {
  const checks = [];
  const pointSummary = runPointLattice(checks);
  const boundarySummary = runBoundaries(checks);
  const routeSummary = await runRoutes(streams, checks);
  const capStress = runCapStress();
  checks.push({ id: 'cap stress records accepted request, physical loss, and no redistribution', passed: capStress.passed });
  return { checks, pointSummary, boundarySummary, routeSummary, capStress };
}

function runPointLattice(checks) {
  const h = 1 / 95;
  const phases = [['p00', 0, 0], ['p10', h / 2, 0], ['p01', 0, h / 2], ['p11', h / 2, h / 2]];
  const cases = [];
  for (const [phase, dx, dy] of phases) for (const amount of [0.000001, 0.027, 1]) {
    const field = new CicPheromoneField({ width: 96, height: 96 });
    const records = [];
    for (let row = 0; row < 64; row++) for (let column = 0; column < 64; column++) {
      const x = (48 + (column + 0.5) / 64 - 0.5) / 95 + dx;
      const y = (48 + (row + 0.5) / 64 - 0.5) / 95 + dy;
      field.clear();
      const gx = x * 95, gy = y * 95;
      const weights = barycentric(gx, gy, 96);
      assertIdentity(weights, gx, gy, 96);
      const before = new Map(weights.map(([index]) => [index, field.values[index]]));
      const accepted = field.depositPoint({ x, y }, { amount });
      const report = measureSingle(field, weights, before, amount, x, y, 96);
      records.push({ x, y, gridX: gx, gridY: gy, accepted, ...report });
    }
    const failures = records.filter((r) => !r.withinBounds).length;
    cases.push({ phase, requestedAmount: amount, writes: records.length, acceptedWrites: records.filter((r) => r.accepted === amount).length, failedWrites: failures, xRange: [Math.min(...records.map((r) => r.x)), Math.max(...records.map((r) => r.x))], yRange: [Math.min(...records.map((r) => r.y)), Math.max(...records.map((r) => r.y))], gridPitchSpanX: (Math.max(...records.map((r) => r.x)) - Math.min(...records.map((r) => r.x))) / h, gridPitchSpanY: (Math.max(...records.map((r) => r.y)) - Math.min(...records.map((r) => r.y))) / h, maxima: maxima(records), records });
  }
  const pass = cases.every((c) => c.writes === 4096 && c.acceptedWrites === 4096 && c.failedWrites === 0 && c.gridPitchSpanX < 1 && c.gridPitchSpanY < 1 && c.maxima.storedMassResidualWithinBound && c.maxima.rawXMomentResidualWithinBound && c.maxima.rawYMomentResidualWithinBound && c.maxima.centroidXResidualWithinBound && c.maxima.centroidYResidualWithinBound);
  checks.push({ id: '49,152 point writes; mass, raw moments, centroids within derived bounds', passed: pass });
  return { writes: 49152, phases: phases.map(([id]) => id), doses: [0.000001, 0.027, 1], cases };
}

function runBoundaries(checks) {
  const field = new CicPheromoneField({ width: 5, height: 5 });
  const edgeCases = [];
  const pts = [
    ['corner00', 0, 0], ['corner10', 1, 0], ['corner01', 0, 1], ['corner11', 1, 1],
    ...[0.125, 0.375, 0.625, 0.875].flatMap((t) => [['top', t, 0], ['bottom', t, 1], ['left', 0, t], ['right', 1, t]]),
    ['node', 0.5, 0.5], ['outside-left', -0.00001, 0.5], ['outside-right', 1.00001, 0.5], ['outside-top', 0.5, -0.00001], ['outside-bottom', 0.5, 1.00001]
  ];
  for (const [id, x, y] of pts) {
    field.clear();
    const accepted = field.depositPoint({ x, y }, { amount: 0.027 });
    const expectedAccepted = x < 0 || x > 1 || y < 0 || y > 1 ? 0 : 0.027;
    const mass = sum(field.values);
    const inside = expectedAccepted > 0;
    const nodes = inside ? barycentric(x * 4, y * 4, 5) : [];
    const before = new Map(nodes.map(([index]) => [index, 0]));
    const stats = inside ? measureSingle(field, nodes, before, expectedAccepted, x, y, 5) : null;
    edgeCases.push({ id, accepted, expectedAccepted, mass, ...(stats ?? {}), passed: accepted === expectedAccepted && (inside ? stats.withinBounds : mass === 0) });
  }
  field.clear();
  const zeroAccepted = field.depositPoint({ x: 0.5, y: 0.5 }, { amount: 0 });
  const apiIdentity = ['depositPoint', 'depositSegment', 'sample', 'decay', 'getSnapshot'].every((name) => field[name] === PheromoneField.prototype[name]);
  let validation = true;
  for (const [position, opts] of [[{ x: NaN, y: 0.5 }, { amount: 1 }], [{ x: 0.5, y: 0.5 }, { amount: -1 }], [{ x: 0.5, y: 0.5 }, { amount: 1, radius: 0 }]]) {
    try { field.depositPoint(position, opts); validation = false; } catch { }
  }
  const clipped = new CicPheromoneField({ width: 96, height: 96 });
  const returned = clipped.depositSegment({ x: -0.1, y: 0.5 }, { x: 0.1, y: 0.5 }, { amountPerUnitDistance: 4.5, radius: 0.0045 });
  const expectedReturned = 0.1 * 4.5;
  const clippedStats = trackedSegment({ x: -0.1, y: 0.5 }, { x: 0.1, y: 0.5 });
  const clippedPass = returned === expectedReturned && clippedStats.massResidualWithinBound && clippedStats.xMomentResidualWithinBound && clippedStats.yMomentResidualWithinBound && clippedStats.centroidXResidualWithinBound && clippedStats.centroidYResidualWithinBound;
  field.clear();
  const binaryX = 0.3125, binaryY = 0.4375, binaryAmount = 0.5;
  const binaryNodes = barycentric(binaryX * 4, binaryY * 4, 5);
  const binaryBefore = new Map(binaryNodes.map(([index]) => [index, field.values[index]]));
  field.depositPoint({ x: binaryX, y: binaryY }, { amount: binaryAmount });
  const binaryFixture = measureSingle(field, binaryNodes, binaryBefore, binaryAmount, binaryX, binaryY, 5);
  const passed = edgeCases.every((c) => c.passed) && zeroAccepted === 0 && apiIdentity && validation && clippedPass && binaryFixture.withinBounds;
  checks.push({ id: 'edge/corner/outdomain/zero/validation/production API/clipped segment', passed });
  return { edgeCases, binaryValued5x5Fixture: binaryFixture, zeroDoseAccepted: zeroAccepted, apiIdentity, validationPreserved: validation, clippedSegment: { returned, expectedReturned, ...clippedStats, passed: clippedPass } };
}

async function runRoutes(streams, checks) {
  const manifest = JSON.parse(await readFile(join(FIXTURE, 'manifest.json'), 'utf8'));
  const arms = [];
  let writeCount = 0;
  for (const arm of streams.arms) {
    const original = new PheromoneField();
    const candidate = new CicPheromoneField();
    const expected = blankExpected(96);
    let requestedDose = 0, acceptedDose = 0;
    for (const write of arm.writes) {
      const { x, y } = write.gridPosition;
      const amount = write.requestedAmount;
      requestedDose += amount;
      const nodes = barycentric(x * 95, y * 95, 96);
      const before = new Map(nodes.map(([index]) => [index, candidate.values[index]]));
      acceptedDose += candidate.depositPoint({ x, y }, { amount, radius: 0.0045 });
      original.depositPoint({ x, y }, { amount, radius: 0.0045 });
      addExpected(expected, nodes, amount, 96, before, x, y);
      writeCount++;
    }
    const entry = manifest.rasters.find((r) => r.id.replace('|', '-') === `${arm.shape}-${arm.phase.id}`);
    if (!entry) throw new Error(`Missing source raster metadata for ${arm.id}`);
    const bytes = await readFile(join(FIXTURE, entry.file));
    const originalHash = sha(bytes);
    const rerunHash = sha(Buffer.from(original.values.buffer));
    const candidateBytes = Buffer.from(candidate.values.buffer);
    const candidateHash = sha(candidateBytes);
    const capCount = candidate.values.reduce((n, v) => n + (v >= candidate.maxValue ? 1 : 0), 0);
    const report = measure(candidate, expected, requestedDose, 'route');
    const rasterParity = originalHash === entry.rasterSha256 && rerunHash === entry.rasterSha256 && bytes.equals(Buffer.from(original.values.buffer));
    const uncapped = capCount === 0;
    const acceptedReturn = acceptedDose === requestedDose;
    arms.push({ id: arm.id, writes: arm.writes.length, ...report, acceptedDose, maximumNode: max(candidate.values), cappedNodeCount: capCount, uncapped, sourceRasterSha256: entry.rasterSha256, reproducedProductionRasterSha256: rerunHash, candidateRasterSha256: candidateHash, originalRasterByteParity: rasterParity, passed: rasterParity && uncapped && acceptedReturn && report.withinBounds });
  }
  const cappedTargetArms = arms.filter((a) => !a.uncapped).length;
  const passed = arms.length === 24 && arms.every((a) => a.passed);
  checks.push({ id: '24 ordered 77-write arms: original raster parity, uncapped target, Float32 bounds', passed });
  return { arms, writeCount, cappedTargetArms, passed };
}

function runCapStress() {
  const field = new CicPheromoneField({ width: 5, height: 5 });
  field.values[6] = 7.99;
  const beforeCell = field.values[6];
  const beforeNeighbors = [field.values[7], field.values[11], field.values[12]];
  const before = sum(field.values);
  const accepted = field.depositPoint({ x: 0.375, y: 0.375 }, { amount: 1 });
  const after = sum(field.values);
  const capLoss = 0.25 - (field.values[6] - beforeCell);
  const neighbors = [field.values[7], field.values[11], field.values[12]];
  const passed = accepted === 1 && field.values[6] === 8 && capLoss >= 0 && neighbors.every((v, i) => v === Math.fround(beforeNeighbors[i] + 0.25));
  return { acceptedRequestedAmount: accepted, storedIncrement: after - before, capLoss, cappedNodeValue: field.values[6], neighborValues: neighbors, redistributed: !neighbors.every((v, i) => v === Math.fround(beforeNeighbors[i] + 0.25)), passed };
}

function measure(field, expected, requestedDose, kind) {
  let mass = 0, xMoment = 0, yMoment = 0, massBudget = 0, xBudget = 0, yBudget = 0;
  for (let i = 0; i < field.values.length; i++) {
    const actual = field.values[i];
    mass += actual;
    const x = (i % field.width) / (field.width - 1), y = Math.floor(i / field.width) / (field.height - 1);
    xMoment += actual * x; yMoment += actual * y;
    massBudget += expected.budget[i]; xBudget += expected.budget[i] * x; yBudget += expected.budget[i] * y;
  }
  const doubleGuard = 64 * EPS64 * Math.max(1, requestedDose);
  const bounds = { mass: massBudget + doubleGuard, xMoment: xBudget + doubleGuard, yMoment: yBudget + doubleGuard };
  const massResidual = mass - requestedDose;
  const xResidual = xMoment - expected.xMoment, yResidual = yMoment - expected.yMoment;
  const expectedCx = expected.xMoment / requestedDose, expectedCy = expected.yMoment / requestedDose;
  const centroidBounds = {
    x: (bounds.xMoment + Math.abs(expectedCx) * bounds.mass) / Math.max(mass, Number.MIN_VALUE) + divisionGuard(xMoment / mass),
    y: (bounds.yMoment + Math.abs(expectedCy) * bounds.mass) / Math.max(mass, Number.MIN_VALUE) + divisionGuard(yMoment / mass)
  };
  const cx = xMoment / mass, cy = yMoment / mass;
  return { kind, requestedDose, storedMass: mass, massResidual, xMoment, yMoment, xCentroid: cx, yCentroid: cy, requestedXCentroid: expectedCx, requestedYCentroid: expectedCy, bounds, centroidBounds, withinBounds: Math.abs(massResidual) <= bounds.mass && Math.abs(xResidual) <= bounds.xMoment && Math.abs(yResidual) <= bounds.yMoment && Math.abs(cx - expectedCx) <= centroidBounds.x && Math.abs(cy - expectedCy) <= centroidBounds.y };
}

function measureSingle(field, nodes, before, amount, x, y, size) {
  let mass = 0, xMoment = 0, yMoment = 0, massBudget = 0, xBudget = 0, yBudget = 0;
  for (let i = 0; i < field.values.length; i++) {
    const value = field.values[i];
    mass += value;
    const nx = (i % size) / (size - 1), ny = Math.floor(i / size) / (size - 1);
    xMoment += value * nx; yMoment += value * ny;
  }
  for (const [index, weight] of nodes) {
    const q = amount * weight, b = U32 * Math.abs((before.get(index) ?? 0) + q) + ALPHA32;
    const nx = (index % size) / (size - 1), ny = Math.floor(index / size) / (size - 1);
    massBudget += b; xBudget += b * nx; yBudget += b * ny;
  }
  const doubleGuard = 64 * EPS64 * Math.max(1, amount);
  const bounds = { mass: massBudget + doubleGuard, xMoment: xBudget + doubleGuard, yMoment: yBudget + doubleGuard };
  const centroidBounds = { x: (bounds.xMoment + Math.abs(x) * bounds.mass) / mass + divisionGuard(xMoment / mass), y: (bounds.yMoment + Math.abs(y) * bounds.mass) / mass + divisionGuard(yMoment / mass) };
  const massResidual = mass - amount, xMomentResidual = xMoment - amount * x, yMomentResidual = yMoment - amount * y;
  const centroidXResidual = xMoment / mass - x, centroidYResidual = yMoment / mass - y;
  return { mass, xMoment, yMoment, xCentroid: xMoment / mass, yCentroid: yMoment / mass, requestedDose: amount, requestedXCentroid: x, requestedYCentroid: y, massResidual, xMomentResidual, yMomentResidual, centroidXResidual, centroidYResidual, bounds, centroidBounds, withinBounds: Math.abs(massResidual) <= bounds.mass && Math.abs(xMomentResidual) <= bounds.xMoment && Math.abs(yMomentResidual) <= bounds.yMoment && Math.abs(centroidXResidual) <= centroidBounds.x && Math.abs(centroidYResidual) <= centroidBounds.y };
}

function trackedSegment(from, to) {
  const field = new BudgetCicField();
  const accepted = field.depositSegment(from, to, { amountPerUnitDistance: 4.5, radius: 0.0045 });
  const expectedDose = 0.45, expectedX = expectedDose * 0.05, expectedY = expectedDose * 0.5;
  const stats = measure(field, { budget: field.budget, xMoment: expectedX, yMoment: expectedY }, expectedDose, 'clipped-segment');
  return { acceptedDose: accepted, ...stats, massResidualWithinBound: Math.abs(stats.massResidual) <= stats.bounds.mass, xMomentResidualWithinBound: Math.abs(stats.xMoment - expectedX) <= stats.bounds.xMoment, yMomentResidualWithinBound: Math.abs(stats.yMoment - expectedY) <= stats.bounds.yMoment, centroidXResidualWithinBound: Math.abs(stats.xCentroid - 0.05) <= stats.centroidBounds.x, centroidYResidualWithinBound: Math.abs(stats.yCentroid - 0.5) <= stats.centroidBounds.y };
}

class BudgetCicField extends CicPheromoneField {
  constructor(options) { super(options); this.budget = new Float64Array(this.width * this.height); }
  depositBrush(x, y, amount) {
    const nodes = barycentric(x * (this.width - 1), y * (this.height - 1), this.width);
    for (const [index, weight] of nodes) this.budget[index] += U32 * Math.abs(this.values[index] + amount * weight) + ALPHA32;
    super.depositBrush(x, y, amount);
  }
}

function blankExpected(size) { return { budget: new Float64Array(size * size), xMoment: 0, yMoment: 0 }; }
function addExpected(expected, nodes, amount, size, before = new Map(), x, y) {
  for (const [index, weight] of nodes) {
    const contribution = amount * weight;
    expected.budget[index] += U32 * Math.abs((before.get(index) ?? 0) + contribution) + ALPHA32;
  }
  expected.xMoment += amount * x;
  expected.yMoment += amount * y;
}
function barycentric(gx, gy, size) {
  const x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
  return [[y0 * size + x0, (1 - tx) * (1 - ty)], [y0 * size + x0 + 1, tx * (1 - ty)], [(y0 + 1) * size + x0, (1 - tx) * ty], [(y0 + 1) * size + x0 + 1, tx * ty]].filter(([, w]) => w !== 0);
}
function assertIdentity(nodes, gx, gy, size) {
  const sumWeights = nodes.reduce((s, [, w]) => s + w, 0);
  const x = nodes.reduce((s, [i, w]) => s + ((i % size) * w), 0);
  const y = nodes.reduce((s, [i, w]) => s + (Math.floor(i / size) * w), 0);
  const tol = 64 * EPS64;
  if (nodes.some(([, w]) => w < 0) || Math.abs(sumWeights - 1) > tol || Math.abs(x - gx) > tol * Math.max(1, Math.abs(gx)) || Math.abs(y - gy) > tol * Math.max(1, Math.abs(gy))) throw new Error('CIC weights failed Float64 identity guard');
}
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function sum(values) { let s = 0; for (const value of values) s += value; return s; }
function max(values) { let m = 0; for (const value of values) m = Math.max(m, value); return m; }
function divisionGuard(value) { return EPS64 * Math.abs(value) / (1 - EPS64); }
function maxima(cases) {
  const out = { maxMassResidual: 0, maxRawXMomentResidual: 0, maxRawYMomentResidual: 0, maxCentroidXResidual: 0, maxCentroidYResidual: 0, storedMassResidualWithinBound: true, rawXMomentResidualWithinBound: true, rawYMomentResidualWithinBound: true, centroidXResidualWithinBound: true, centroidYResidualWithinBound: true };
  for (const c of cases) {
    if (!c.bounds) continue;
    out.maxMassResidual = Math.max(out.maxMassResidual, Math.abs(c.massResidual));
    out.maxRawXMomentResidual = Math.max(out.maxRawXMomentResidual, Math.abs(c.xMoment - c.requestedDose * c.requestedXCentroid));
    out.maxRawYMomentResidual = Math.max(out.maxRawYMomentResidual, Math.abs(c.yMoment - c.requestedDose * c.requestedYCentroid));
    out.maxCentroidXResidual = Math.max(out.maxCentroidXResidual, Math.abs(c.xCentroid - c.requestedXCentroid));
    out.maxCentroidYResidual = Math.max(out.maxCentroidYResidual, Math.abs(c.yCentroid - c.requestedYCentroid));
    out.storedMassResidualWithinBound &&= Math.abs(c.massResidual) <= c.bounds.mass;
    out.rawXMomentResidualWithinBound &&= Math.abs(c.xMoment - c.requestedDose * c.requestedXCentroid) <= c.bounds.xMoment;
    out.rawYMomentResidualWithinBound &&= Math.abs(c.yMoment - c.requestedDose * c.requestedYCentroid) <= c.bounds.yMoment;
    out.centroidXResidualWithinBound &&= Math.abs(c.xCentroid - c.requestedXCentroid) <= c.centroidBounds.x;
    out.centroidYResidualWithinBound &&= Math.abs(c.yCentroid - c.requestedYCentroid) <= c.centroidBounds.y;
  }
  return out;
}
