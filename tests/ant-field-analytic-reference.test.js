import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import {
  FIELD,
  PHASES,
  SHAPES,
  aggregateLocalSamples,
  buildProductionField,
  fixedSensorGeometry,
  makeContinuousSampler,
  makeRouteStations,
  routeAt,
  summarizeWideCandidates
} from '../scripts/ant-field-analytic-reference.js';

test('continuous line-dose reference has the defined compact Gaussian support and straight symmetry', () => {
  const points = makeRouteStations().map(station => ({ station, ...routeAt('straight', station) }));
  const sample = makeContinuousSampler(points);
  const center = sample(0.5, 0.5);
  assert.ok(center > 0);
  assert.ok(center > sample(0.5, 0.5 + FIELD.radius * 0.25));
  assert.equal(sample(0.5, 0.5 + FIELD.radius * 1.001), 0);
  assert.equal(sample(0.5, 0.5 + FIELD.radius * 1.1), 0);
  const intervals = 8192;
  const step = 2 * FIELD.radius / intervals;
  let sum = Math.exp(-(FIELD.radius ** 2) / (2 * FIELD.sigma ** 2))
    + Math.exp(-(FIELD.radius ** 2) / (2 * FIELD.sigma ** 2));
  for (let index = 1; index < intervals; index += 1) {
    const along = -FIELD.radius + index * step;
    sum += (index % 2 ? 4 : 2) * Math.exp(-(along ** 2) / (2 * FIELD.sigma ** 2));
  }
  const lineIntegral = step * sum / 3;
  const kernelIntegral = 2 * Math.PI * FIELD.sigma ** 2
    * (1 - Math.exp(-(FIELD.radius ** 2) / (2 * FIELD.sigma ** 2)));
  const expectedCenter = FIELD.cellArea * FIELD.rate * lineIntegral / kernelIntegral;
  assert.ok(Math.abs(center - expectedCenter) < 1e-12, 'center matches independent Simpson integral');
  for (const offset of [0.0001, 0.001, 0.003, 0.004]) {
    assert.ok(Math.abs(sample(0.5, 0.5 + offset) - sample(0.5, 0.5 - offset)) < 1e-14);
  }
});

test('continuous reference preserves the established gentle-curve mirror transform', () => {
  const stations = makeRouteStations();
  const forward = makeContinuousSampler(stations.map(station => ({
    station, ...routeAt('gentle', station)
  })));
  const mirrored = makeContinuousSampler(stations.map(station => ({
    station, ...routeAt('gentleMirror', station)
  })));
  for (const [x, y] of [[0.41, 0.48], [0.5, 0.52], [0.62, 0.58], [0.7, 0.45]]) {
    assert.ok(Math.abs(forward(x, y) - mirrored(x, 1 - y)) < 1e-14);
  }
});

test('all four phase arms use the same local and wide query geometry up to the declared translation', () => {
  assert.deepEqual(SHAPES, ['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve']);
  const baseline = fixedSensorGeometry('sCurve', 0.137, PHASES[0]);
  for (const phase of PHASES.slice(1)) {
    const translated = fixedSensorGeometry('sCurve', 0.137, phase);
    assert.equal(translated.localReads.length, 18);
    assert.equal(translated.wideCandidates.length, 5);
    for (let index = 0; index < baseline.localReads.length; index += 1) {
      assert.ok(Math.abs(translated.localReads[index].x - baseline.localReads[index].x - phase.dx) < 1e-14);
      assert.ok(Math.abs(translated.localReads[index].y - baseline.localReads[index].y - phase.dy) < 1e-14);
    }
    for (let candidate = 0; candidate < baseline.wideCandidates.length; candidate += 1) {
      for (let index = 0; index < baseline.wideCandidates[candidate].reads.length; index += 1) {
        const a = baseline.wideCandidates[candidate].reads[index];
        const b = translated.wideCandidates[candidate].reads[index];
        assert.ok(Math.abs(b.x - a.x - phase.dx) < 1e-14);
        assert.ok(Math.abs(b.y - a.y - phase.dy) < 1e-14);
      }
    }
  }
});

test('research local and wide sensor operations reproduce current AntController aggregation', () => {
  const geometry = fixedSensorGeometry('gentle', 0.11, PHASES[0]);
  const analyticLikeField = {
    sample(x, y) { return 0.08 * Math.exp(-((y - 0.51) ** 2) / 0.0001); }
  };
  const localRaw = geometry.localReads.map(point => analyticLikeField.sample(point.x, point.y));
  const expectedLocal = aggregateLocalSamples(localRaw);
  const actualLocal = AntController.prototype.senseLocalTrail.call(
    { field: analyticLikeField }, { x: geometry.body.x, y: geometry.body.y, heading: geometry.heading }
  );
  for (const key of ['left', 'center', 'right', 'strength', 'coherence', 'steering']) {
    assert.equal(actualLocal[key], expectedLocal[key], 'local ' + key);
  }

  const candidate = geometry.wideCandidates[2];
  const behavior = { sensorDistance: 0.042, sensorWidth: 0.014 };
  const actualWide = AntController.prototype.senseTrail.call(
    { field: analyticLikeField, state: { behavior } },
    { x: geometry.body.x, y: geometry.body.y }, candidate.heading
  );
  const expectedWide = Math.max(...candidate.reads.map(point =>
    analyticLikeField.sample(point.x, point.y) * point.weight));
  assert.equal(actualWide, expectedWide);
});

test('frozen queries match production coordinates and consume no RNG', () => {
  const geometry = fixedSensorGeometry('tightMirror', 0.137, PHASES[2]);
  const localQueries = [];
  const wideQueries = [];
  const localField = { sample(x, y) { localQueries.push({ x, y }); return 0.1; } };
  const wideField = { sample(x, y) { wideQueries.push({ x, y }); return 0.1; } };
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('frozen representation fixture consumed RNG'); };
  try {
    AntController.prototype.senseLocalTrail.call(
      { field: localField },
      { x: geometry.body.x, y: geometry.body.y, heading: geometry.heading }
    );
    const candidate = geometry.wideCandidates[3];
    AntController.prototype.senseTrail.call(
      { field: wideField, state: { behavior: { sensorDistance: 0.042, sensorWidth: 0.014 } } },
      geometry.body,
      candidate.heading
    );
    buildProductionField('tightMirror', PHASES[2]);
  } finally {
    Math.random = originalRandom;
  }
  assert.deepEqual(localQueries, geometry.localReads.map(({ x, y }) => ({ x, y })));
  assert.deepEqual(wideQueries, candidateReads(geometry, 3));
});

test('wide winner diagnostics distinguish exact analytic ties from unique winners', () => {
  const tied = summarizeWideCandidates([
    { offset: -0.92, response: 0 }, { offset: -0.47, response: 0 },
    { offset: 0, response: 0 }, { offset: 0.47, response: 0 }, { offset: 0.92, response: 0 }
  ]);
  assert.equal(tied.uniqueWinner, false);
  assert.equal(tied.winnerMargin, 0);

  const unique = summarizeWideCandidates([
    { offset: -0.92, response: 0 }, { offset: -0.47, response: 0.1 },
    { offset: 0, response: 0 }, { offset: 0.47, response: 0 }, { offset: 0.92, response: 0 }
  ]);
  assert.equal(unique.uniqueWinner, true);
  assert.ok(unique.winnerMargin > 0);
});

test('production default dab fixture replays to exact Float32 state and conserves uncapped route dose', () => {
  const first = buildProductionField('straight', PHASES[0]);
  const second = buildProductionField('straight', PHASES[0]);
  const translated = buildProductionField('straight', PHASES[1]);
  const verticallyTranslated = buildProductionField('straight', PHASES[2]);
  const firstBytes = Buffer.from(first.field.values.buffer);
  const secondBytes = Buffer.from(second.field.values.buffer);
  const translatedBytes = Buffer.from(translated.field.values.buffer);
  assert.equal(createHash('sha256').update(firstBytes).digest('hex'),
    createHash('sha256').update(secondBytes).digest('hex'));
  assert.deepEqual(firstBytes, secondBytes);
  assert.notDeepEqual(firstBytes, translatedBytes, 'phase translation reaches the production writer');
  assert.deepEqual(occupiedRows(first.field), [48], 'p00 half-cell tie uses the production nearest-node fallback row');
  assert.deepEqual(occupiedRows(verticallyTranslated.field), [48], 'p01 places the line on the same grid row');
  assert.deepEqual(firstBytes, Buffer.from(verticallyTranslated.field.values.buffer),
    'p00 fallback and p01 on-node writes alias to the same stored raster');
  assert.equal(first.pointDeposits, second.pointDeposits);
  assert.equal(first.capCells, 0);
  assert.equal(translated.capCells, 0);
  assert.ok(first.rasterMass > 0);
  assert.ok(Math.abs(first.rasterMass - first.requestedDose) < 1e-5);
  assert.ok(Math.abs(translated.rasterMass - translated.requestedDose) < 1e-5);
  assert.equal(first.field.width, FIELD.width);
  assert.equal(first.field.height, FIELD.height);
});

function candidateReads(geometry, index) {
  return geometry.wideCandidates[index].reads.map(({ x, y }) => ({ x, y }));
}

function occupiedRows(field) {
  const rows = new Set();
  field.values.forEach((value, index) => { if (value > 0) rows.add(Math.floor(index / field.width)); });
  return [...rows].sort((a, b) => a - b);
}
