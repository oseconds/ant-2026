import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';

export const FIELD = Object.freeze({
  width: 96,
  height: 96,
  pitch: 1 / 95,
  radius: 0.0045,
  sigma: 0.00225,
  rate: 4.5,
  halfLifeSeconds: 15,
  maxValue: 8,
  dabSpacing: 0.006,
  cellArea: (1 / 95) ** 2,
  minimumStation: -0.12,
  maximumStation: 0.34,
  stationStep: 0.002
});

export const PHASES = Object.freeze([
  { id: 'p00', dx: 0, dy: 0 },
  { id: 'p10', dx: 0.5 / 95, dy: 0 },
  { id: 'p01', dx: 0, dy: 0.5 / 95 },
  { id: 'p11', dx: 0.5 / 95, dy: 0.5 / 95 }
]);

export const SHAPES = Object.freeze([
  'straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve'
]);

const START = Object.freeze({ x: 0.35, y: 0.5 });
const SINE_AMPLITUDE = 0.018;
const SINE_WAVELENGTH = 0.32;
const LOCAL_DISTANCES = [0.016, 0.028];
const LOCAL_SENSOR_HALF_WIDTH = 0.009;
const LOCAL_BAND_HALF_WIDTH = 0.003;
const SENSOR_DISTANCE = 0.042;
const SENSOR_WIDTH = 0.014;
const WIDE_OFFSETS = [-0.92, -0.47, 0, 0.47, 0.92];
const TRANSVERSE_OFFSETS = [-1, -0.5, 0, 0.5, 1];
const LOCAL_HALF_SATURATION = 0.018;
const WIDE_HALF_SATURATION = 0.035;
const STEERING_LIMIT = 0.45;
const TRAIL_SCORE_GAIN = 2.8;
const NORMALIZATION = 2 * Math.PI * FIELD.sigma ** 2
  * (1 - Math.exp(-(FIELD.radius ** 2) / (2 * FIELD.sigma ** 2)));
const QUADRATURE_NODES = [
  -0.9894009349916499, -0.9445750230732326, -0.8656312023878318, -0.755404408355003,
  -0.6178762444026438, -0.4580167776572274, -0.2816035507792589, -0.09501250983763744,
  0.09501250983763744, 0.2816035507792589, 0.4580167776572274, 0.6178762444026438,
  0.755404408355003, 0.8656312023878318, 0.9445750230732326, 0.9894009349916499
];
const QUADRATURE_WEIGHTS = [
  0.027152459411754095, 0.06225352393864789, 0.09515851168249278, 0.12462897125553387,
  0.14959598881657673, 0.16915651939500254, 0.1826034150449236, 0.1894506104550685,
  0.1894506104550685, 0.1826034150449236, 0.16915651939500254, 0.14959598881657673,
  0.12462897125553387, 0.09515851168249278, 0.06225352393864789, 0.027152459411754095
];

const sineArcTable = buildSineArcTable();

export function makeRouteStations() {
  const stations = new Set();
  for (let station = FIELD.minimumStation; station < FIELD.maximumStation; station += FIELD.stationStep) {
    stations.add(Number(station.toFixed(9)));
  }
  stations.add(Number(FIELD.minimumStation.toFixed(9)));
  stations.add(Number(FIELD.maximumStation.toFixed(9)));
  return [...stations].sort((a, b) => a - b);
}

export function routeAt(shape, station) {
  if (!SHAPES.includes(shape) || !Number.isFinite(station)) {
    throw new TypeError('Expected a known controlled route and finite station.');
  }
  if (shape === 'straight') return { x: START.x + station, y: START.y };
  if (shape !== 'sCurve') {
    const radius = shape.startsWith('gentle') ? 0.25 : 0.1;
    const orientation = shape.endsWith('Mirror') ? -1 : 1;
    return {
      x: START.x + radius * Math.sin(station / radius),
      y: START.y + orientation * radius * (1 - Math.cos(station / radius))
    };
  }
  const u = interpolateBy(sineArcTable, 'station', station).u;
  return {
    x: START.x + u,
    y: START.y + SINE_AMPLITUDE * Math.sin(2 * Math.PI * u / SINE_WAVELENGTH)
  };
}

export function routeTangent(shape, station) {
  if (!SHAPES.includes(shape) || !Number.isFinite(station)) {
    throw new TypeError('Expected a known controlled route and finite station.');
  }
  if (shape === 'straight') return 0;
  if (shape !== 'sCurve') {
    const radius = shape.startsWith('gentle') ? 0.25 : 0.1;
    return (shape.endsWith('Mirror') ? -1 : 1) * station / radius;
  }
  const u = interpolateBy(sineArcTable, 'station', station).u;
  return Math.atan2(SINE_AMPLITUDE * (2 * Math.PI / SINE_WAVELENGTH)
    * Math.cos(2 * Math.PI * u / SINE_WAVELENGTH), 1);
}

export function fixedSensorGeometry(shape, station, phase) {
  const point = routeAt(shape, station);
  const heading = routeTangent(shape, station);
  const body = { x: point.x + phase.dx, y: point.y + phase.dy };
  const dx = Math.cos(heading), dy = Math.sin(heading);
  const nx = -dy, ny = dx;
  const localReads = [];
  for (const distance of LOCAL_DISTANCES) {
    for (const side of [-1, 0, 1]) {
      const x = body.x + dx * distance + nx * LOCAL_SENSOR_HALF_WIDTH * side;
      const y = body.y + dy * distance + ny * LOCAL_SENSOR_HALF_WIDTH * side;
      for (const bandOffset of [-1, 0, 1]) {
        localReads.push({
          x: x + nx * LOCAL_BAND_HALF_WIDTH * bandOffset,
          y: y + ny * LOCAL_BAND_HALF_WIDTH * bandOffset,
          distance, side, bandOffset
        });
      }
    }
  }
  const wideCandidates = WIDE_OFFSETS.map(offset => {
    const candidateHeading = heading + offset;
    const cx = body.x + Math.cos(candidateHeading) * SENSOR_DISTANCE;
    const cy = body.y + Math.sin(candidateHeading) * SENSOR_DISTANCE;
    const cnx = -Math.sin(candidateHeading), cny = Math.cos(candidateHeading);
    const reads = TRANSVERSE_OFFSETS.map(transverseOffset => ({
      x: cx + cnx * SENSOR_WIDTH * transverseOffset,
      y: cy + cny * SENSOR_WIDTH * transverseOffset,
      transverseOffset,
      weight: 1 - Math.abs(transverseOffset) * 0.45
    }));
    return { offset, heading: candidateHeading, reads };
  });
  return { station, point, phase: phase.id, body, heading, localReads, wideCandidates };
}

export function aggregateLocalSamples(samples) {
  if (!Array.isArray(samples) || samples.length !== 18 || !samples.every(Number.isFinite)) {
    throw new TypeError('Local aggregation requires 18 finite samples in production call order.');
  }
  const profiles = [0, 1].map(distanceIndex => [0, 1, 2].map(sideIndex => {
    const start = distanceIndex * 9 + sideIndex * 3;
    return samples.slice(start, start + 3).reduce((sum, value, index) =>
      sum + value * (index === 1 ? 0.5 : 0.25), 0);
  }));
  const [left, center, right] = profiles[0].map((value, index) => (value + profiles[1][index]) * 0.5);
  const peaks = profiles.map(profile => Math.max(...profile));
  const strength = hillResponse(Math.sqrt(peaks[0] * peaks[1]), LOCAL_HALF_SATURATION);
  const coherence = Math.min(...profiles.map(profile => {
    const peak = Math.max(...profile), floor = Math.min(...profile);
    const split = Math.max(0, Math.min(profile[0], profile[2]) - profile[1]);
    return (peak - floor) / (peak + 1e-9) * (1 - split / (peak + 1e-9));
  }));
  const balance = (right - left) / (left + center + right + 1e-9);
  return { left, center, right, strength, coherence, balance, steering: STEERING_LIMIT * balance * strength };
}

export function makeContinuousSampler(routePoints) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) {
    throw new TypeError('Continuous route reference requires at least two points.');
  }
  const segments = [];
  for (let index = 1; index < routePoints.length; index += 1) {
    const a = routePoints[index - 1], b = routePoints[index];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length > 0) segments.push({ ax: a.x, ay: a.y, dx, dy, length, ux: dx / length, uy: dy / length });
  }
  const buckets = new Map();
  const bucketSize = 0.01;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const x0 = Math.floor((Math.min(segment.ax, segment.ax + segment.dx) - FIELD.radius) / bucketSize);
    const x1 = Math.floor((Math.max(segment.ax, segment.ax + segment.dx) + FIELD.radius) / bucketSize);
    const y0 = Math.floor((Math.min(segment.ay, segment.ay + segment.dy) - FIELD.radius) / bucketSize);
    const y1 = Math.floor((Math.max(segment.ay, segment.ay + segment.dy) + FIELD.radius) / bucketSize);
    for (let by = y0; by <= y1; by += 1) for (let bx = x0; bx <= x1; bx += 1) {
      const key = bucketKey(bx, by);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(index);
    }
  }
  return (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Reference coordinates must be finite.');
    if (x < 0 || x > 1 || y < 0 || y > 1) return 0;
    const nearby = buckets.get(bucketKey(Math.floor(x / bucketSize), Math.floor(y / bucketSize))) || [];
    let lineIntegral = 0;
    for (const index of nearby) lineIntegral += segmentKernelIntegral(segments[index], x, y);
    return FIELD.cellArea * FIELD.rate * lineIntegral / NORMALIZATION;
  };
}

export function buildProductionField(shape, phase) {
  const field = new PheromoneField({
    width: FIELD.width, height: FIELD.height,
    decayHalfLifeSeconds: FIELD.halfLifeSeconds, maxValue: FIELD.maxValue
  });
  const deposition = new GasterDeposition({ mode: 'dab', spacing: FIELD.dabSpacing });
  const stations = makeRouteStations();
  const points = stations.map(station => routeAt(shape, station));
  let sourceDistance = 0, requestedDose = 0, pointDeposits = 0;
  const apply = deposits => {
    for (const deposit of deposits) {
      assert.equal(deposit.type, 'point', 'production default arm uses dab point writes');
      pointDeposits += 1;
      field.depositPoint(
        { x: deposit.position.x + phase.dx, y: deposit.position.y + phase.dy },
        { amount: deposit.amount, radius: FIELD.radius }
      );
      requestedDose += deposit.amount;
    }
  };
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1], to = points[index];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    sourceDistance += distance;
    apply(deposition.advance('controlled-route', distance,
      from, to, FIELD.rate));
  }
  apply(deposition.retire('controlled-route', {
    x: points.at(-1).x, y: points.at(-1).y
  }));
  const snapshot = field.getSnapshot();
  const capCells = [...field.values].filter(value => value >= FIELD.maxValue).length;
  assert.equal(capCells, 0, 'controlled fixtures must not exercise the production cap');
  assert.ok([...field.values].every(Number.isFinite), 'production fixture contains only finite values');
  return {
    field, points, stations, sourceDistance, requestedDose, pointDeposits,
    rasterMass: snapshot.totalMass, capCells,
    nonzeroCells: [...field.values].filter(value => value > 0).length,
    peakCell: Math.max(...field.values)
  };
}

export function runAnalyticAttribution() {
  const outputRows = [];
  const fixtureSummaries = [];
  const raw = { local: [], wide: [] };
  const readDecomposition = { local: [], wide: [] };
  const nodeSummary = [];
  const stationPairs = new Map();

  for (const shape of SHAPES) {
    const points = makeRoutePoints(shape);
    const reference = makeContinuousSampler(points);
    for (const phase of PHASES) {
      const production = buildProductionField(shape, phase);
      const referenceGrid = buildReferenceGrid(reference, phase);
      const nodeErrors = [];
      let unionSupportCount = 0, productionOnlyCount = 0, referenceOnlyCount = 0;
      for (let index = 0; index < production.field.values.length; index += 1) {
        const productionValue = production.field.values[index];
        const referenceValue = referenceGrid[index];
        const error = productionValue - referenceValue;
        nodeErrors.push(error);
        if (productionValue > 0 || referenceValue > 0) {
          unionSupportCount += 1;
          if (productionValue > 0 && referenceValue === 0) productionOnlyCount += 1;
          if (productionValue === 0 && referenceValue > 0) referenceOnlyCount += 1;
        }
      }
      nodeSummary.push({
        shape, phase: phase.id, nodeCount: production.field.values.length,
        unionSupportCount, productionOnlyCount, referenceOnlyCount,
        allNodes: stats(nodeErrors),
        unionSupport: stats(nodeErrors.filter((_, index) =>
          production.field.values[index] > 0 || referenceGrid[index] > 0)),
        ...productionSummary(production)
      });

      for (const station of production.stations) {
        const geometry = fixedSensorGeometry(shape, station, phase);
        const localReferenceRaw = geometry.localReads.map(point =>
          reference(point.x - phase.dx, point.y - phase.dy));
        const localProductionRaw = geometry.localReads.map(point => production.field.sample(point.x, point.y));
        const localReference = aggregateLocalSamples(localReferenceRaw);
        const localProduction = aggregateLocalSamples(localProductionRaw);
        const localDecomposition = geometry.localReads.map((point, index) => ({
          ...decomposeRead(production.field, referenceGrid, reference, point.x, point.y, phase),
          fixture: shape, phase: phase.id, station, sample: index,
          query: { x: point.x, y: point.y }
        }));
        const localRow = makeRawResult(localReferenceRaw, localProductionRaw, localDecomposition);
        raw.local.push(...localRow.raw.map((row, sample) => ({
          ...row, fixture: shape, phase: phase.id, station, sample
        })));
        readDecomposition.local.push(...localRow.decomposition);

        const wideReference = [], wideProduction = [], wideDecomposition = [];
        for (let candidateIndex = 0; candidateIndex < geometry.wideCandidates.length; candidateIndex += 1) {
          const candidate = geometry.wideCandidates[candidateIndex];
          const referenceValues = candidate.reads.map(point =>
            reference(point.x - phase.dx, point.y - phase.dy));
          const productionValues = candidate.reads.map(point => production.field.sample(point.x, point.y));
          const decompositions = candidate.reads.map((point, sample) => ({
            ...decomposeRead(production.field, referenceGrid, reference, point.x, point.y, phase),
            fixture: shape, phase: phase.id, station,
            sample: candidateIndex + ':' + sample, candidateOffset: candidate.offset,
            query: { x: point.x, y: point.y }
          }));
          wideReference.push(evaluateWideCandidate(candidate, referenceValues));
          wideProduction.push(evaluateWideCandidate(candidate, productionValues));
          wideDecomposition.push(decompositions);
          raw.wide.push(...makeRawResult(referenceValues, productionValues, decompositions).raw.map((row, sample) => ({
            ...row, fixture: shape, phase: phase.id, station, sample: candidateIndex + ':' + sample
          })));
          readDecomposition.wide.push(...decompositions);
        }
        const localReferenceWide = summarizeWideCandidates(wideReference);
        const localProductionWide = summarizeWideCandidates(wideProduction);
        wideReference.forEach((candidate, index) => { candidate.score = localReferenceWide.scores[index]; });
        wideProduction.forEach((candidate, index) => { candidate.score = localProductionWide.scores[index]; });
        const pair = {
          shape, station, phase: phase.id,
          localReference, localProduction,
          localReferenceRaw, localProductionRaw,
          localDecomposition,
          localGeometry: geometry.localReads.map(point => ({ x: point.x, y: point.y })),
          wideReference, wideProduction, wideDecomposition,
          wideGeometry: geometry.wideCandidates.map(candidate => ({
            offset: candidate.offset, heading: candidate.heading,
            reads: candidate.reads.map(point => ({ x: point.x, y: point.y, weight: point.weight }))
          })),
          referenceWinner: localReferenceWide.winner,
          productionWinner: localProductionWide.winner,
          referenceWinnerUnique: localReferenceWide.uniqueWinner,
          productionWinnerUnique: localProductionWide.uniqueWinner,
          referenceWinnerMargin: localReferenceWide.winnerMargin,
          productionWinnerMargin: localProductionWide.winnerMargin,
          referenceRanks: localReferenceWide.ranks,
          productionRanks: localProductionWide.ranks,
          referenceConfidence: localReferenceWide.confidence,
          productionConfidence: localProductionWide.confidence
        };
        outputRows.push(pair);
        const key = shape + '|' + station;
        if (!stationPairs.has(key)) stationPairs.set(key, []);
        stationPairs.get(key).push(pair);
      }
      fixtureSummaries.push({
        shape, phase: phase.id, routePointCount: production.points.length,
        routeSegmentCount: production.points.length - 1,
        routeStationCount: production.stations.length,
        phase: phase.id, routeStart: routeAt(shape, FIELD.minimumStation),
        routeEnd: routeAt(shape, FIELD.maximumStation),
        routeLength: production.sourceDistance,
        ...productionSummary(production)
      });
    }
  }

  const localOutputs = outputRows.map(row => ({
    reference: row.localReference, production: row.localProduction,
    rawReference: row.localReferenceRaw, rawProduction: row.localProductionRaw
  }));
  const wideOutputRows = outputRows.map(row => ({
    reference: row.wideReference, production: row.wideProduction,
    referenceWinner: row.referenceWinner, productionWinner: row.productionWinner,
    referenceRanks: row.referenceRanks, productionRanks: row.productionRanks
  }));
  const localMetricNames = ['left', 'center', 'right', 'strength', 'coherence', 'balance', 'steering'];
  const localMetrics = Object.fromEntries(localMetricNames.map(name => [name, stats(localOutputs.map(row =>
    row.production[name] - row.reference[name]))]));
  const wideMetrics = {
    candidateResponse: stats(wideOutputRows.flatMap(row => row.production.map((candidate, index) =>
      candidate.response - row.reference[index].response))),
    candidateWeightedMaximum: stats(wideOutputRows.flatMap(row => row.production.map((candidate, index) =>
      candidate.maximum - row.reference[index].maximum))),
    score: stats(wideOutputRows.flatMap(row => row.production.map((candidate, index) =>
      candidate.score - row.reference[index].score))),
    winnerDisagreements: wideOutputRows.filter(row => row.referenceWinner !== row.productionWinner).length,
    referenceNoDirectionalContrast: outputRows.filter(row => row.referenceConfidence === 0).length,
    referenceUniqueWinnerCount: outputRows.filter(row => row.referenceWinnerUnique).length,
    winnerDisagreementsWhenReferenceWinnerUnique: outputRows.filter(row =>
      row.referenceWinnerUnique && row.referenceWinner !== row.productionWinner).length,
    referenceWinnerMarginWhenUnique: stats(outputRows.filter(row => row.referenceWinnerUnique)
      .map(row => row.referenceWinnerMargin)),
    candidateRanksChanged: wideOutputRows.filter(row =>
      row.referenceRanks.some((rank, index) => rank !== row.productionRanks[index])).length,
    candidateRankAbsoluteDisplacement: stats(wideOutputRows.flatMap(row =>
      row.productionRanks.map((rank, index) => Math.abs(rank - row.referenceRanks[index]))))
  };
  const stationPhase = summarizeStationPhases(stationPairs);
  const mirror = summarizeMirrors(stationPairs);
  const straight = summarizeStraight(stationPairs);
  const sCurve = summarizeSCurve(stationPairs);
  const reconstruction = summarizeDecomposition(readDecomposition);
  return {
    schema: 'ant-field-analytic-reference/v1',
    protocol: {
      shapes: SHAPES, phaseCount: PHASES.length,
      routeStationCount: makeRouteStations().length,
      routeStationRange: [FIELD.minimumStation, FIELD.maximumStation],
      routeStationStep: FIELD.stationStep,
      reference: {
        expression: 'cellArea * rate * integral_route K(distance(query, route(s))) ds',
        kernel: 'K(d)=exp(-d^2/(2*sigma^2))/Z for d<=radius, else 0',
        normalization: 'Z=2*pi*sigma^2*(1-exp(-radius^2/(2*sigma^2)))',
        units: 'per-grid-cell dose-equivalent; continuous dose density multiplied by normalized grid-cell area',
        sigma: FIELD.sigma, radius: FIELD.radius, rate: FIELD.rate, cellArea: FIELD.cellArea,
        quadrature: '16-point Gauss-Legendre on the exact segment interval clipped by the compact support disk',
        doseMapping: 'continuous line dose is rate times polyline arclength; the reference and production arm request the same total dose. Production default dab writes are generated by GasterDeposition and finalized with retire.'
      },
      production: {
        grid: [FIELD.width, FIELD.height], storage: 'Float32Array',
        radius: FIELD.radius, rate: FIELD.rate, defaultMode: 'dab',
        dabSpacing: FIELD.dabSpacing, halfLifeSeconds: FIELD.halfLifeSeconds,
        maxValue: FIELD.maxValue, reader: 'PheromoneField.sample bilinear'
      },
      sensor: {
        localRawCalls: 18, localOrder: '2 distances x 3 sides x 3 transverse band samples',
        wideCandidateOffsets: WIDE_OFFSETS, wideTransverseOffsets: TRANSVERSE_OFFSETS,
        wideWeights: TRANSVERSE_OFFSETS.map(offset => 1 - Math.abs(offset) * 0.45),
        localHalfSaturation: LOCAL_HALF_SATURATION, wideHalfSaturation: WIDE_HALF_SATURATION,
        localSteeringLimit: STEERING_LIMIT,
        wideScore: 'trailResponse*2.8 + (cos(offset)-1)*confidence*0.55; unit pheromone sensitivity, zero adherence/crowding, no jitter or RNG; diagnostic rank only'
      }
    },
    provenance: {
      productionBase: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2',
      reusedRouteCommit: 'd0e07d089c82d29409c7dd067e17cdeb9a5ecf7f',
      reusedPhaseProtocolCommit: '9e197ca3e7495a01dbcfdd0927dcbd4c974acf31'
    },
    counts: {
      fixtures: fixtureSummaries.length,
      routeShapes: SHAPES.length,
      phases: PHASES.length,
      stationEvaluations: outputRows.length,
      localRawSamples: raw.local.length,
      wideRawSamples: raw.wide.length,
      totalRawSamples: raw.local.length + raw.wide.length,
      nodeComparisons: nodeSummary.reduce((sum, row) => sum + row.nodeCount, 0)
    },
    writerStorage: summarizeNodes(nodeSummary),
    reader: reconstruction,
    sensor: {
      local: {
        outputErrors: localMetrics,
        steeringSignDisagreements: outputRows.filter(row =>
          Math.sign(row.localReference.steering) !== Math.sign(row.localProduction.steering)).length,
        zeroReferenceSteeringCount: outputRows.filter(row => row.localReference.steering === 0).length,
        nonzeroReferenceSignDisagreements: outputRows.filter(row =>
          row.localReference.steering !== 0
          && Math.sign(row.localReference.steering) !== Math.sign(row.localProduction.steering)).length,
        strictlyOppositeSteeringSigns: outputRows.filter(row =>
          row.localReference.steering * row.localProduction.steering < 0).length,
        productionZeroWhenReferenceNonzero: outputRows.filter(row =>
          row.localReference.steering !== 0 && row.localProduction.steering === 0).length,
        operatorGainRadPerRawL2: stats(localOutputs.map(row => {
          const input = Math.hypot(...row.rawProduction.map((value, index) => value - row.rawReference[index]));
          return input === 0 ? null : Math.abs(row.production.steering - row.reference.steering) / input;
        }))
      },
      wide: wideMetrics,
      phase: stationPhase,
      mirror,
      straight,
      sCurve,
      byShape: summarizeByShape(outputRows, stationPairs)
    },
    fixtures: fixtureSummaries,
    nodeByFixturePhase: nodeSummary,
    rawSamples: summarizeRaw(raw),
    rows: outputRows
  };
}

export async function writeEvidence(outputDirectory) {
  const output = resolve(outputDirectory);
  const computed = resolve(output, 'computed');
  await mkdir(computed, { recursive: true });
  const result = runAnalyticAttribution();
  const productionSources = [
    'src/lib/agents/ant/PheromoneField.js',
    'src/lib/agents/ant/GasterDeposition.js',
    'src/lib/agents/ant/AntController.js',
    'scripts/ant-field-analytic-reference.js'
  ];
  result.provenance.sourceHashes = {};
  for (const path of productionSources) {
    result.provenance.sourceHashes[path] = hash(await readFile(resolve(process.cwd(), path)));
  }
  const rows = result.rows;
  delete result.rows;
  result.provenance.stationRawSha256 = hash(Buffer.from(JSON.stringify(rows)));
  await writeFile(resolve(computed, 'analytic-attribution.json'), JSON.stringify(result, null, 2) + '\n');
  await writeFile(resolve(computed, 'station-raw.json.gz'),
    gzipSync(Buffer.from(JSON.stringify(rows)), { level: 9 }));
  return result;
}

function summarizeRaw(raw) {
  return Object.fromEntries(Object.entries(raw).map(([kind, rows]) => [kind, {
    sampleCount: rows.length,
    signedError: stats(rows.map(row => row.production - row.reference)),
    phaseSpread: phaseSpread(rows)
  }]));
}

function makeRawResult(referenceValues, productionValues, decompositions) {
  return {
    raw: referenceValues.map((reference, index) => ({
      reference, production: productionValues[index], error: productionValues[index] - reference
    })),
    decomposition: decompositions
  };
}

function decomposeRead(field, referenceGrid, reference, x, y, phase) {
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return { writer: 0, reader: 0, total: 0, residual: 0 };
  }
  const gx = x * (FIELD.width - 1), gy = y * (FIELD.height - 1);
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const x1 = Math.min(FIELD.width - 1, x0 + 1), y1 = Math.min(FIELD.height - 1, y0 + 1);
  const tx = gx - x0, ty = gy - y0;
  const indexes = [y0 * FIELD.width + x0, y0 * FIELD.width + x1,
    y1 * FIELD.width + x0, y1 * FIELD.width + x1];
  const writerCorners = indexes.map(index => field.values[index] - referenceGrid[index]);
  const referenceCorners = indexes.map(index => referenceGrid[index]);
  const writerTop = mix(writerCorners[0], writerCorners[1], tx);
  const writerBottom = mix(writerCorners[2], writerCorners[3], tx);
  const writer = mix(writerTop, writerBottom, ty);
  const analyticTop = mix(referenceCorners[0], referenceCorners[1], tx);
  const analyticBottom = mix(referenceCorners[2], referenceCorners[3], tx);
  const interpolatedReference = mix(analyticTop, analyticBottom, ty);
  const continuous = reference(x - phase.dx, y - phase.dy);
  const reader = interpolatedReference - continuous;
  const production = field.sample(x, y);
  const total = production - continuous;
  return { writer, reader, total, residual: total - (writer + reader) };
}

function buildReferenceGrid(reference, phase) {
  const values = new Float64Array(FIELD.width * FIELD.height);
  for (let row = 0; row < FIELD.height; row += 1) {
    for (let column = 0; column < FIELD.width; column += 1) {
      values[row * FIELD.width + column] = reference(
        column / (FIELD.width - 1) - phase.dx,
        row / (FIELD.height - 1) - phase.dy
      );
    }
  }
  return values;
}

function evaluateWideCandidate(candidate, rawValues) {
  const weighted = rawValues.map((value, index) => value * candidate.reads[index].weight);
  const maximum = Math.max(...weighted);
  return {
    offset: candidate.offset,
    raw: rawValues,
    weighted,
    maximum,
    response: hillResponse(maximum, WIDE_HALF_SATURATION)
  };
}

export function summarizeWideCandidates(candidates) {
  const confidence = Math.max(...candidates.map(candidate => candidate.response))
    - Math.min(...candidates.map(candidate => candidate.response));
  const scored = candidates.map(candidate => ({
    offset: candidate.offset,
    score: candidate.response * TRAIL_SCORE_GAIN
      + (Math.cos(candidate.offset) - 1) * confidence * 0.55
  }));
  const ranked = scored.map((candidate, index) => ({ ...candidate, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return {
    confidence,
    winner: ranked[0].offset,
    uniqueWinner: ranked[0].score > ranked[1].score,
    winnerMargin: ranked[0].score - ranked[1].score,
    ranks: scored.map(candidate => ranked.findIndex(row => row.offset === candidate.offset) + 1),
    scores: scored.map(candidate => candidate.score)
  };
}

function summarizeStationPhases(stationPairs) {
  const steeringRanges = [], strengthRanges = [], rawRanges = [], wideRanges = [];
  let wideWinnerStationDisagreements = 0, candidateRankingStationDisagreements = 0;
  for (const [key, rows] of stationPairs) {
    if (rows.length !== PHASES.length) throw new Error('Incomplete phase group: ' + key);
    const steering = rows.map(row => row.localProduction.steering);
    const strength = rows.map(row => row.localProduction.strength);
    steeringRanges.push(Math.max(...steering) - Math.min(...steering));
    strengthRanges.push(Math.max(...strength) - Math.min(...strength));
    for (let index = 0; index < 18; index += 1) {
      const values = rows.map(row => row.localProductionRaw[index]);
      rawRanges.push(Math.max(...values) - Math.min(...values));
    }
    for (let candidate = 0; candidate < WIDE_OFFSETS.length; candidate += 1) {
      const values = rows.map(row => row.wideProduction[candidate].response);
      wideRanges.push(Math.max(...values) - Math.min(...values));
    }
    if (new Set(rows.map(row => row.productionWinner)).size > 1) wideWinnerStationDisagreements += 1;
    if (rows.some(row => row.referenceRanks.some((rank, index) =>
      rank !== row.productionRanks[index]))) candidateRankingStationDisagreements += 1;
  }
  return {
    stationGroups: stationPairs.size,
    productionLocalSteeringRange: stats(steeringRanges),
    productionLocalStrengthRange: stats(strengthRanges),
    productionRawLocalRange: stats(rawRanges),
    productionWideCandidateResponseRange: stats(wideRanges),
    stationsWithPhaseDependentWideWinner: wideWinnerStationDisagreements,
    stationsWithReferenceVsProductionRankingChange: candidateRankingStationDisagreements
  };
}

function summarizeMirrors(stationPairs) {
  const result = {};
  for (const baseShape of ['gentle', 'tight']) {
    const mirrorShape = baseShape + 'Mirror';
    const analyticErrors = [], productionErrors = [], productionAgainstReference = [];
    for (const station of makeRouteStations()) {
      const baseRows = stationPairs.get(baseShape + '|' + station) || [];
      const mirrorRows = stationPairs.get(mirrorShape + '|' + station) || [];
      for (const phase of PHASES) {
        const base = baseRows.find(row => row.phase === phase.id);
        const mirror = mirrorRows.find(row => row.phase === phase.id);
        if (!base || !mirror) throw new Error('Missing mirrored fixture pair.');
        analyticErrors.push(base.localReference.steering + mirror.localReference.steering);
        productionErrors.push(base.localProduction.steering + mirror.localProduction.steering);
        productionAgainstReference.push(
          Math.abs(base.localProduction.steering - base.localReference.steering),
          Math.abs(mirror.localProduction.steering - mirror.localReference.steering)
        );
      }
    }
    result[baseShape] = {
      analyticOppositeSignError: stats(analyticErrors),
      productionOppositeSignError: stats(productionErrors),
      productionVsAnalyticSteeringError: stats(productionAgainstReference)
    };
  }
  return result;
}

function summarizeStraight(stationPairs) {
  const rows = [...stationPairs.entries()].filter(([key]) => key.startsWith('straight|')).flatMap(([, value]) => value);
  const byPhase = Object.fromEntries(PHASES.map(phase => {
    const phaseRows = rows.filter(row => row.phase === phase.id);
    return [phase.id, {
      stationCount: phaseRows.length,
      analyticSteering: stats(phaseRows.map(row => row.localReference.steering)),
      productionSteering: stats(phaseRows.map(row => row.localProduction.steering)),
      writerComponent: stats(phaseRows.flatMap(row => row.localDecomposition.map(value => value.writer))),
      readerComponent: stats(phaseRows.flatMap(row => row.localDecomposition.map(value => value.reader))),
      totalRawError: stats(phaseRows.flatMap(row => row.localDecomposition.map(value => value.total)))
    }];
  }));
  return {
    analyticSymmetryMaximumAbsoluteSteering: Math.max(...rows.map(row => Math.abs(row.localReference.steering))),
    productionByPhase: byPhase
  };
}

function summarizeSCurve(stationPairs) {
  const rows = makeRouteStations().map(station => {
    const group = stationPairs.get('sCurve|' + station) || [];
    const analytic = group.find(row => row.phase === 'p00')?.localReference.steering ?? null;
    return { station, analytic };
  });
  const crossings = [];
  const zeroIntervals = [];
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1].analytic * rows[index].analytic < 0) {
      crossings.push({ from: rows[index - 1].station, to: rows[index].station,
        fromSteering: rows[index - 1].analytic, toSteering: rows[index].analytic });
    }
  }
  let zeroStart = null, zeroEnd = null, zeroCount = 0;
  for (const row of rows) {
    if (row.analytic === 0) {
      if (zeroStart === null) zeroStart = row.station;
      zeroEnd = row.station;
      zeroCount += 1;
    } else if (zeroStart !== null) {
      zeroIntervals.push({ from: zeroStart, to: zeroEnd, stationCount: zeroCount });
      zeroStart = null;
      zeroEnd = null;
      zeroCount = 0;
    }
  }
  if (zeroStart !== null) zeroIntervals.push({ from: zeroStart, to: zeroEnd, stationCount: zeroCount });
  const absolute = rows.filter(row => row.analytic !== null)
    .sort((a, b) => Math.abs(a.analytic) - Math.abs(b.analytic));
  return {
    analyticSteeringZeroCrossings: crossings,
    exactZeroAnalyticSteeringIntervals: zeroIntervals,
    nearestNonzeroAnalyticSteeringStations: absolute.filter(row => row.analytic !== 0).slice(0, 8),
    phaseGroups: Object.fromEntries(PHASES.map(phase => {
      const phaseRows = [...stationPairs.entries()].filter(([key]) => key.startsWith('sCurve|'))
        .flatMap(([, values]) => values.filter(row => row.phase === phase.id));
      return [phase.id, {
        analyticProductionSignDisagreements: phaseRows.filter(row =>
          Math.sign(row.localReference.steering) !== Math.sign(row.localProduction.steering)).length,
        nonzeroReferenceSignDisagreements: phaseRows.filter(row =>
          row.localReference.steering !== 0
          && Math.sign(row.localReference.steering) !== Math.sign(row.localProduction.steering)).length,
        oppositeSignPairs: phaseRows.filter(row =>
          row.localReference.steering * row.localProduction.steering < 0).length,
        exactZeroReferenceCount: phaseRows.filter(row => row.localReference.steering === 0).length,
        stationCount: phaseRows.length
      }];
    }))
  };
}

function summarizeDecomposition(groups) {
  return Object.fromEntries(Object.entries(groups).map(([kind, rows]) => {
    const writer = rows.map(row => row.writer);
    const reader = rows.map(row => row.reader);
    const total = rows.map(row => row.total);
    let reduced = 0, enlarged = 0, equal = 0;
    for (const row of rows) {
      if (Math.abs(row.total) < Math.abs(row.writer)) reduced += 1;
      else if (Math.abs(row.total) > Math.abs(row.writer)) enlarged += 1;
      else equal += 1;
    }
    return [kind, {
      sampleCount: rows.length,
      writerStorageComponent: stats(writer),
      bilinearReconstructionComponent: stats(reader),
      totalProductionReadError: stats(total),
      componentsOppositeSign: rows.filter(row => row.writer * row.reader < 0).length,
      bilinearEffectOnNodalStorageError: { reduced, enlarged, equal },
      maximumReconstructionResidual: rows.reduce((maximum, row) =>
        Math.max(maximum, Math.abs(row.residual)), 0),
      maximumAbsoluteWriterComponent: extreme(rows, 'writer'),
      maximumAbsoluteReaderComponent: extreme(rows, 'reader'),
      maximumAbsoluteTotalError: extreme(rows, 'total')
    }];
  }));
}

function summarizeByShape(outputRows, stationPairs) {
  return Object.fromEntries(SHAPES.map(shape => {
    const rows = outputRows.filter(row => row.shape === shape);
    const rawLocalErrors = rows.flatMap(row => row.localProductionRaw.map((value, index) =>
      value - row.localReferenceRaw[index]));
    const nonzeroReference = rows.filter(row => row.localReference.steering !== 0);
    const stationSteeringRanges = [...stationPairs.entries()]
      .filter(([key]) => key.startsWith(shape + '|'))
      .map(([, values]) => {
        const steering = values.map(row => row.localProduction.steering);
        return Math.max(...steering) - Math.min(...steering);
      });
    return [shape, {
      stationPhaseCount: rows.length,
      localRawReadError: stats(rawLocalErrors),
      localSteeringError: stats(rows.map(row =>
        row.localProduction.steering - row.localReference.steering)),
      zeroReferenceSteeringCount: rows.filter(row => row.localReference.steering === 0).length,
      nonzeroReferenceSteeringCount: nonzeroReference.length,
      nonzeroReferenceSteeringSignDisagreements: nonzeroReference.filter(row =>
        Math.sign(row.localReference.steering) !== Math.sign(row.localProduction.steering)).length,
      oppositeSteeringSigns: nonzeroReference.filter(row =>
        row.localReference.steering * row.localProduction.steering < 0).length,
      wideWinnerDisagreements: rows.filter(row => row.referenceWinner !== row.productionWinner).length,
      referenceNoDirectionalContrast: rows.filter(row => row.referenceConfidence === 0).length,
      referenceUniqueWinnerCount: rows.filter(row => row.referenceWinnerUnique).length,
      winnerDisagreementsWhenReferenceWinnerUnique: rows.filter(row =>
        row.referenceWinnerUnique && row.referenceWinner !== row.productionWinner).length,
      wideCandidateRankingChanges: rows.filter(row => row.referenceRanks.some((rank, index) =>
        rank !== row.productionRanks[index])).length,
      productionPhaseSteeringRange: stats(stationSteeringRanges)
    }];
  }));
}

function extreme(rows, key) {
  const row = rows.reduce((maximum, candidate) =>
    Math.abs(candidate[key]) > Math.abs(maximum[key]) ? candidate : maximum, rows[0]);
  return {
    fixture: row?.fixture ?? null, phase: row?.phase ?? null,
    station: row?.station ?? null, sample: row?.sample ?? null,
    candidateOffset: row?.candidateOffset ?? null, query: row?.query ?? null,
    signedValue: row?.[key] ?? null,
    absoluteValue: row ? Math.abs(row[key]) : null,
    writer: row?.writer ?? null, reader: row?.reader ?? null,
    total: row?.total ?? null, residual: row?.residual ?? null
  };
}

function summarizeNodes(rows) {
  return {
    fixturePhaseCount: rows.length,
    meanAbsoluteErrorAcrossFixturePhases: mean(rows.map(row => row.allNodes.meanAbsoluteError)),
    maximumAbsoluteError: Math.max(...rows.map(row => row.allNodes.maximumAbsoluteError)),
    unionSupportMeanAbsoluteError: mean(rows.map(row => row.unionSupport.meanAbsoluteError)),
    unionSupportMaximumAbsoluteError: Math.max(...rows.map(row => row.unionSupport.maximumAbsoluteError)),
    unionSupportNodeCount: rows.reduce((sum, row) => sum + row.unionSupportCount, 0),
    productionOnlyNodeCount: rows.reduce((sum, row) => sum + row.productionOnlyCount, 0),
    referenceOnlyNodeCount: rows.reduce((sum, row) => sum + row.referenceOnlyCount, 0),
    perFixturePhase: rows.map(row => ({
      shape: row.shape, phase: row.phase, unionSupportCount: row.unionSupportCount,
      productionOnlyCount: row.productionOnlyCount, referenceOnlyCount: row.referenceOnlyCount,
      allNodes: row.allNodes, unionSupport: row.unionSupport,
      requestedDose: row.requestedDose, rasterMass: row.rasterMass,
      float32MassResidual: row.rasterMass - row.requestedDose,
      pointDeposits: row.pointDeposits, peakCell: row.peakCell, capCells: row.capCells
    }))
  };
}

function productionSummary(production) {
  return {
    sourceDistance: production.sourceDistance,
    requestedDose: production.requestedDose,
    rasterMass: production.rasterMass,
    float32MassResidual: production.rasterMass - production.requestedDose,
    pointDeposits: production.pointDeposits,
    nonzeroCells: production.nonzeroCells,
    peakCell: production.peakCell,
    capCells: production.capCells
  };
}

function stats(values) {
  const finite = values.filter(Number.isFinite);
  const absolute = finite.map(Math.abs);
  const sorted = [...finite].sort((a, b) => a - b);
  const absoluteSorted = [...absolute].sort((a, b) => a - b);
  return {
    count: finite.length,
    meanSigned: mean(finite),
    meanAbsoluteError: mean(absolute),
    rootMeanSquare: Math.sqrt(mean(finite.map(value => value * value))),
    maximumAbsoluteError: absolute.reduce((maximum, value) => Math.max(maximum, value), 0),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    p99: quantile(sorted, 0.99),
    p50AbsoluteError: quantile(absoluteSorted, 0.5),
    p90AbsoluteError: quantile(absoluteSorted, 0.9),
    p99AbsoluteError: quantile(absoluteSorted, 0.99)
  };
}

function phaseSpread(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.fixture + '|' + row.station + '|' + row.sample;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row.production);
  }
  const ranges = [...groups.values()].filter(values => values.length === PHASES.length)
    .map(values => Math.max(...values) - Math.min(...values));
  return stats(ranges);
}

function makeRoutePoints(shape) {
  return makeRouteStations().map(station => ({ station, ...routeAt(shape, station) }));
}

function segmentKernelIntegral(segment, x, y) {
  const qx = x - segment.ax, qy = y - segment.ay;
  const along = qx * segment.ux + qy * segment.uy;
  const perpendicular = qx * segment.uy - qy * segment.ux;
  const perpendicularSquared = perpendicular * perpendicular;
  const radiusSquared = FIELD.radius ** 2;
  if (perpendicularSquared >= radiusSquared) return 0;
  const halfChord = Math.sqrt(radiusSquared - perpendicularSquared);
  const lower = Math.max(0, along - halfChord);
  const upper = Math.min(segment.length, along + halfChord);
  if (upper <= lower) return 0;
  const midpoint = (lower + upper) * 0.5;
  const halfLength = (upper - lower) * 0.5;
  let integral = 0;
  for (let index = 0; index < QUADRATURE_NODES.length; index += 1) {
    const alongDistance = midpoint + halfLength * QUADRATURE_NODES[index] - along;
    const squared = perpendicularSquared + alongDistance * alongDistance;
    integral += QUADRATURE_WEIGHTS[index] * Math.exp(-squared / (2 * FIELD.sigma ** 2));
  }
  return integral * halfLength;
}

function buildSineArcTable() {
  const rows = [];
  let previous = null, length = 0;
  for (let u = -0.5; u <= 0.5 + 0.000125; u += 0.00025) {
    const current = {
      x: START.x + u,
      y: START.y + SINE_AMPLITUDE * Math.sin(2 * Math.PI * u / SINE_WAVELENGTH)
    };
    if (previous) length += Math.hypot(current.x - previous.x, current.y - previous.y);
    rows.push({ u, cumulative: length });
    previous = current;
  }
  let zero = 0;
  for (let index = 1; index < rows.length; index += 1) {
    if (Math.abs(rows[index].u) < Math.abs(rows[zero].u)) zero = index;
  }
  const originLength = rows[zero].cumulative;
  return rows.map(row => ({ ...row, station: row.cumulative - originLength }));
}

function interpolateBy(rows, key, value) {
  const clamped = Math.max(rows[0][key], Math.min(rows.at(-1)[key], value));
  let low = 0, high = rows.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle][key] <= clamped) low = middle;
    else high = middle;
  }
  const a = rows[low], b = rows[high];
  const ratio = (clamped - a[key]) / (b[key] - a[key] || 1);
  return { u: a.u + (b.u - a.u) * ratio, station: a.station + (b.station - a.station) * ratio };
}

function hillResponse(signal, halfSaturation) {
  const normalized = (signal / halfSaturation) ** 3;
  return normalized / (1 + normalized);
}

function mix(a, b, t) { return a + (b - a) * t; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function quantile(sorted, probability) {
  return sorted.length ? sorted[Math.round((sorted.length - 1) * probability)] : null;
}
function bucketKey(x, y) { return x + ':' + y; }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const outputDirectory = process.argv[2]
    || 'docs/ant/evidence/2026-10-24-field-analytic-reference';
  const result = await writeEvidence(outputDirectory);
  console.log(JSON.stringify({
    schema: result.schema,
    outputDirectory: resolve(outputDirectory),
    counts: result.counts,
    local: result.sensor.local,
    wide: result.sensor.wide,
    reader: result.reader,
    straight: result.sensor.straight,
    mirror: result.sensor.mirror
  }, null, 2));
}
