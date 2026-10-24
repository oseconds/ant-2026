import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

// Geometry certificates only: this script does not implement a replacement field.
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = 'docs/ant/evidence/2026-10-24-pheromone-representation-contract';
const R = 0.0045;
const h = 1 / 95;
const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12, `${a} != ${b}`);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function availableNodes(p, size) {
  const pitch = 1 / (size - 1);
  const nodes = [];
  for (let j = Math.max(0, Math.floor((p.y - R) / pitch)); j <= Math.min(size - 1, Math.ceil((p.y + R) / pitch)); j++) {
    for (let i = Math.max(0, Math.floor((p.x - R) / pitch)); i <= Math.min(size - 1, Math.ceil((p.x + R) / pitch)); i++) {
      const q = { x: i * pitch, y: j * pitch };
      if (Math.hypot(q.x - p.x, q.y - p.y) <= R) nodes.push(q);
    }
  }
  return nodes;
}

function productionPoint(p) {
  const field = new PheromoneField();
  const returnedAmount = field.depositPoint(p, { amount: 1, radius: R });
  let mass = 0, mx = 0, my = 0;
  const active = [];
  for (let j = 0; j < field.height; j++) for (let i = 0; i < field.width; i++) {
    const value = field.values[j * field.width + i];
    if (!value) continue;
    const x = i / (field.width - 1), y = j / (field.height - 1);
    mass += value; mx += value * x; my += value * y;
    active.push({ x, y, value, distance: Math.hypot(x - p.x, y - p.y) });
  }
  return { p, inRadiusNodes: availableNodes(p, 96).length, returnedAmount, mass,
    centroid: { x: mx / mass, y: my / mass }, active };
}

const points = [
  productionPoint({ x: 48 * h, y: 48 * h }),
  productionPoint({ x: 48.25 * h, y: 48 * h }),
  productionPoint({ x: 48.5 * h, y: 48.5 * h })
];
assert.deepEqual(points.map(p => p.inRadiusNodes), [1, 1, 0]);
points.forEach(p => { close(p.mass, 1); assert.equal(p.active.length, 1); });
close(points[0].centroid.x, points[0].p.x);
close(Math.hypot(points[1].centroid.x - points[1].p.x, points[1].centroid.y - points[1].p.y), h / 4);
assert.ok(points[2].active[0].distance > R);
assert.ok(2 * R < h);

const coefficients = { coverage: 1 / Math.SQRT2, centroid: Math.sqrt(5) / 2,
  cicWriter: Math.SQRT2, cicWriterAndBilinearRead: 2 * Math.SQRT2 };
const thresholds = Object.fromEntries(Object.entries(coefficients).map(([name, coefficient]) => {
  const minimumSize = Math.ceil(coefficient / R) + 1;
  assert.ok(coefficient / (minimumSize - 1) <= R);
  assert.ok(coefficient / (minimumSize - 2) > R);
  return [name, { coefficient, minimumSize }];
}));
assert.deepEqual(Object.values(thresholds).map(x => x.minimumSize), [159, 250, 316, 630]);

// A point just right of a grid line needs positive mass in the right column.
const lineWitnesses = [159, 249, 250].map(size => {
  const pitch = 1 / (size - 1);
  const p = { x: (40 + 1e-4) * pitch, y: 40.5 * pitch };
  const nodes = availableNodes(p, size);
  const hasRightColumn = nodes.some(q => q.x > p.x);
  assert.equal(hasRightColumn, size === 250);
  return { size, p, nodes, hasRightColumn };
});

// Unit-cell certificate: nearest node plus two axis neighbors toward the point.
let certificates = 0, maxActiveDistanceInPitches = 0;
for (let i = 0; i <= 100; i++) for (let j = 0; j <= 100; j++) {
  const p = [i / 100, j / 100];
  const q = p.map(Math.round);
  const a = Math.abs(p[0] - q[0]), b = Math.abs(p[1] - q[1]);
  const triangle = [q, [q[0] + Math.sign(p[0] - q[0]), q[1]], [q[0], q[1] + Math.sign(p[1] - q[1])]];
  const weights = [1 - a - b, a, b];
  assert.ok(weights.every(w => w >= 0));
  close(weights.reduce((s, w) => s + w, 0), 1);
  for (let axis = 0; axis < 2; axis++) close(weights.reduce((s, w, k) => s + w * triangle[k][axis], 0), p[axis]);
  triangle.forEach((v, k) => {
    if (weights[k] === 0) return;
    const distance = Math.hypot(v[0] - p[0], v[1] - p[1]);
    assert.ok(distance <= Math.sqrt(5) / 2 + 1e-12);
    maxActiveDistanceInPitches = Math.max(maxActiveDistanceInPitches, distance);
  });
  certificates++;
}

const epsilon = 1e-4;
const supportWitnesses = [315, 316, 629, 630].map(size => {
  const pitch = 1 / (size - 1);
  const writerDistance = Math.SQRT2 * (1 - epsilon) * pitch;
  const sourceToQueryDistance = 2 * Math.SQRT2 * (1 - epsilon) * pitch;
  return { size, writerDistance, sourceToQueryDistance, sharedCornerReadValue: epsilon ** 4 };
});
assert.ok(supportWitnesses[0].writerDistance > R);
assert.ok(supportWitnesses[1].writerDistance < R);
assert.ok(supportWitnesses[2].sourceToQueryDistance > R);
assert.ok(supportWitnesses[3].sourceToQueryDistance < R);
assert.throws(() => new PheromoneField({ width: 630 }), /between 2 and 512/);

const tailField = new PheromoneField();
const tailSource = { x: 48 * h, y: 48 * h };
tailField.depositPoint(tailSource, { amount: 1, radius: R });
const tailQuery = { x: tailSource.x + 0.6 * h, y: tailSource.y };
const tail = { source: tailSource, query: tailQuery, distance: 0.6 * h, value: tailField.sample(tailQuery.x, tailQuery.y) };
assert.ok(tail.distance > R); close(tail.value, 0.4);

const capped = new PheromoneField();
capped.values[48 * 96 + 48] = 7.875;
const capReturn = capped.depositPoint(tailSource, { amount: 1 });
const actualCapIncrement = capped.values[48 * 96 + 48] - 7.875;
close(capReturn, 1); close(actualCapIncrement, 0.125);
const capGeometry = { nodes: [0, 1], source: 0.5, amount: 1, headrooms: [0.125, 1], requiredWeights: [0.5, 0.5] };
assert.ok(capGeometry.headrooms.reduce((a, b) => a + b) > capGeometry.amount);
assert.ok(capGeometry.requiredWeights[0] > capGeometry.headrooms[0]);

// Opposite horizontal and vertical pairs have identical four bilinear weights.
const shape = (x, y) => [(1 - x) * (1 - y), x * (1 - y), (1 - x) * y, x * y];
const horizontal = shape(0.25, 0.5).map((w, i) => (w + shape(0.75, 0.5)[i]) / 2);
const vertical = shape(0.5, 0.25).map((w, i) => (w + shape(0.5, 0.75)[i]) / 2);
assert.deepEqual(horizontal, vertical);
assert.deepEqual(horizontal, [0.25, 0.25, 0.25, 0.25]);

const result = {
  scope: 'Geometry and isolated production storage only; no replacement field, cue gate or movement.',
  radius: R, productionPitch: h, radiusInPitches: R / h, points, thresholds, lineWitnesses,
  triangleCertificate: { count: certificates, maxActiveDistanceInPitches }, supportWitnesses,
  productionReadTail: tail,
  cap: { returnedRequestedAmount: capReturn, actualStoredIncrement: actualCapIncrement, infeasibleMomentExample: capGeometry },
  bilinearBasis: { interiorIntegralPerUnitNode: h ** 2, edgeIntegralPerUnitNode: h ** 2 / 2,
    cornerIntegralPerUnitNode: h ** 2 / 4, boundaryBasisCentroidInwardShift: h / 3 },
  directionAmbiguity: { horizontal, vertical, distinctPairOrientation: true },
  derivedGridCosts: [96, 159, 250, 316, 512, 630].map(size => ({ size, float32Bytes: 4 * size ** 2,
    scalarSlotsPerDecay: size ** 2, interiorBilinearIntegralPerUnitNode: 1 / (size - 1) ** 2 }))
};
const bytes = `${JSON.stringify(result, null, 2)}\n`;
writeFileSync(resolve(root, destination, 'probe-results.json'), bytes);
const inputs = ['scripts/ant-pheromone-representation-feasibility.js', `${destination}/PROBE-SCOPE.md`,
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/ColonyActivation.js', 'src/lib/renderers/AntRenderer.js'];
const receipts = inputs.map(path => { const data = readFileSync(resolve(root, path)); return { path, bytes: data.length, sha256: sha256(data) }; });
writeFileSync(resolve(root, destination, 'probe-receipt.json'), `${JSON.stringify({ inputs: receipts, resultSha256: sha256(bytes) }, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', productionCases: points.length, certificates, thresholds,
  resultSha256: sha256(bytes), output: `${destination}/probe-results.json` }));
