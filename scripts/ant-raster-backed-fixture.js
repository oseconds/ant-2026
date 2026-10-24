import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

export const FIELD = Object.freeze({
  width: 96,
  height: 96,
  radius: 0.0045,
  rate: 4.5,
  halfLifeSeconds: 15,
  maxValue: 8,
  dabSpacing: 0.006,
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

const EVIDENCE_NAME = '2026-10-24-ant-raster-backed-fixture';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence', EVIDENCE_NAME);
const INPUT_PATH = resolve(EVIDENCE, 'inputs/station-raw.json.gz');
const EXPECTED_MAIN = '8c60e4bba3bd5b476300e90a2936bfebd1f831c2';
const EXPECTED_INPUT_GZIP_SHA256 = '50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29';
const EXPECTED_INPUT_JSON_SHA256 = 'bdab38fd13ccb8bae6689cdb7af134c52265969849d4cbfdd5c528677628e13d';
const EXPECTED_PRODUCTION_SOURCE_SHA256 = Object.freeze({
  'src/lib/agents/ant/PheromoneField.js': '412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd',
  'src/lib/agents/ant/GasterDeposition.js': '0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41',
  'src/lib/agents/ant/AntController.js': 'e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04'
});
const HISTORICAL_ROUTE_SOURCE = Object.freeze({
  commit: '2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa',
  path: 'scripts/ant-field-analytic-reference.js',
  gitBlob: 'd401a3ffacbb79f25e85cf53043c4c95e0e04791',
  sha256: '1a9ba25d6e128a67c3795f6cb1b97bf1ee3e62ee38c8d71d893141ccce9fea2e'
});
const LOCAL_DISTANCES = [0.016, 0.028];
const LOCAL_SENSOR_HALF_WIDTH = 0.009;
const LOCAL_BAND_HALF_WIDTH = 0.003;
const SENSOR_DISTANCE = 0.042;
const SENSOR_WIDTH = 0.014;
const WIDE_OFFSETS = [-0.92, -0.47, 0, 0.47, 0.92];
const TRANSVERSE_OFFSETS = [-1, -0.5, 0, 0.5, 1];
const WIDE_HALF_SATURATION = 0.035;
const TRAIL_SCORE_GAIN = 2.8;
const START = Object.freeze({ x: 0.35, y: 0.5 });
const SINE_AMPLITUDE = 0.018;
const SINE_WAVELENGTH = 0.32;
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

function fixedSensorGeometry(shape, station, phase) {
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
  return { point, body, heading, localReads, wideCandidates };
}

function buildWriteStreams() {
  const stations = makeRouteStations();
  assert.equal(stations.length, 231);
  const routePlans = SHAPES.map(shape => {
    const points = stations.map(station => routeAt(shape, station));
    const deposition = new GasterDeposition({ mode: 'dab', spacing: FIELD.dabSpacing });
    const writes = [];
    let sourceDistance = 0;
    const append = (deposits, segmentIndex) => {
      for (const deposit of deposits) {
        assert.equal(deposit.type, 'point', 'default dab mode must emit point writes');
        writes.push({
          order: writes.length,
          sourceSegment: segmentIndex,
          routePosition: { x: deposit.position.x, y: deposit.position.y },
          requestedAmount: deposit.amount
        });
      }
    };
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1], to = points[index];
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      sourceDistance += distance;
      append(deposition.advance('controlled-route', distance, from, to, FIELD.rate), index - 1);
    }
    append(deposition.retire('controlled-route', points.at(-1)), stations.length - 1);
    assert.equal(writes.length, 77, `${shape} write count changed`);
    return { shape, stations, points, writes, sourceDistance };
  });

  return routePlans.flatMap(route => PHASES.map(phase => {
    const writes = route.writes.map(write => ({
      order: write.order,
      sourceSegment: write.sourceSegment,
      routePosition: write.routePosition,
      gridPosition: { x: write.routePosition.x + phase.dx, y: write.routePosition.y + phase.dy },
      requestedAmount: write.requestedAmount
    }));
    return {
      id: `${route.shape}|${phase.id}`,
      shape: route.shape,
      phase,
      stationCount: route.stations.length,
      sourceDistance: route.sourceDistance,
      eventCount: writes.length,
      totalRequestedDose: writes.reduce((sum, event) => sum + event.requestedAmount, 0),
      writeStreamSha256: sha256(Buffer.from(JSON.stringify(writes))),
      writes
    };
  }));
}

function runWriters(plans) {
  const arms = new Map();
  const byteOrder = new Uint8Array(new Uint32Array([0x01020304]).buffer);
  assert.deepEqual([...byteOrder], [4, 3, 2, 1], 'raster export requires little-endian Float32 bytes');
  for (const plan of plans) {
    const field = new PheromoneField({
      width: FIELD.width,
      height: FIELD.height,
      decayHalfLifeSeconds: FIELD.halfLifeSeconds,
      maxValue: FIELD.maxValue
    });
    let acceptedDose = 0;
    for (const event of plan.writes) {
      const accepted = field.depositPoint(event.gridPosition, {
        amount: event.requestedAmount,
        radius: FIELD.radius
      });
      acceptedDose += accepted;
      assert.equal(accepted, event.requestedAmount, `${plan.id} write ${event.order} was clipped`);
    }
    const bytes = Buffer.from(field.values.buffer, field.values.byteOffset, field.values.byteLength);
    let storedMass = 0, nonzeroNodes = 0, cappedCells = 0, peakCell = 0;
    for (const value of field.values) {
      assert.ok(Number.isFinite(value), `${plan.id} raster contains a non-finite node`);
      storedMass += value;
      if (value > 0) nonzeroNodes += 1;
      if (value >= FIELD.maxValue) cappedCells += 1;
      if (value > peakCell) peakCell = value;
    }
    assert.equal(cappedCells, 0, `${plan.id} unexpectedly hit the production cap`);
    arms.set(plan.id, {
      plan,
      field,
      bytes: Buffer.from(bytes),
      rasterSha256: sha256(bytes),
      metadata: {
        id: plan.id,
        shape: plan.shape,
        phase: plan.phase.id,
        width: FIELD.width,
        height: FIELD.height,
        nodeCount: field.values.length,
        byteLength: bytes.length,
        byteOrder: 'little-endian',
        rasterSha256: sha256(bytes),
        nonzeroNodeCount: nonzeroNodes,
        totalStoredMass: storedMass,
        maximumCell: peakCell,
        cappedCellCount: cappedCells,
        writeEventCount: plan.eventCount,
        writeStreamSha256: plan.writeStreamSha256,
        totalRequestedDose: plan.totalRequestedDose,
        totalAcceptedDose: acceptedDose,
        storedMassResidual: storedMass - acceptedDose,
        initialRaster: 'all-zero Float32Array',
        decayCalls: 0
      }
    });
  }
  return arms;
}

function validateFrozenQueries(rows, arms) {
  const receipt = {
    expected: { local: rows.length * 18, wide: rows.length * 5 * 5, total: rows.length * (18 + 25) },
    observed: { local: 0, wide: 0, total: 0 },
    exact: { local: 0, wide: 0 },
    nonExact: { local: 0, wide: 0 },
    maxAbsoluteError: { local: 0, wide: 0 },
    firstMismatch: null,
    geometry: { exactRows: 0, mismatchedRows: 0, firstMismatch: null }
  };
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const phase = PHASES.find(value => value.id === row.phase);
    const arm = arms.get(`${row.shape}|${row.phase}`);
    assert.ok(phase && arm, `missing fixture arm for row ${rowIndex}`);
    const geometry = fixedSensorGeometry(row.shape, row.station, phase);
    const expectedLocalGeometry = geometry.localReads.map(({ x, y }) => ({ x, y }));
    const expectedWideGeometry = geometry.wideCandidates.map(candidate => ({
      offset: candidate.offset,
      heading: candidate.heading,
      reads: candidate.reads.map(({ x, y, weight }) => ({ x, y, weight }))
    }));
    const sameGeometry = JSON.stringify(expectedLocalGeometry) === JSON.stringify(row.localGeometry)
      && JSON.stringify(expectedWideGeometry) === JSON.stringify(row.wideGeometry);
    if (sameGeometry) receipt.geometry.exactRows += 1;
    else {
      receipt.geometry.mismatchedRows += 1;
      if (!receipt.geometry.firstMismatch) receipt.geometry.firstMismatch = {
        rowIndex, shape: row.shape, phase: row.phase, station: row.station,
        expectedLocalGeometry: expectedLocalGeometry.slice(0, 2), savedLocalGeometry: row.localGeometry?.slice(0, 2),
        expectedWideGeometry: expectedWideGeometry[0], savedWideGeometry: row.wideGeometry?.[0]
      };
    }

    const localSamples = row.localGeometry.map(query => arm.field.sample(query.x, query.y));
    for (let sample = 0; sample < localSamples.length; sample += 1) {
      recordParity(receipt, 'local', localSamples[sample], row.localProductionRaw[sample], {
        rowIndex, shape: row.shape, phase: row.phase, station: row.station, sample,
        query: row.localGeometry[sample]
      });
    }
    for (let candidate = 0; candidate < row.wideGeometry.length; candidate += 1) {
      for (let sample = 0; sample < row.wideGeometry[candidate].reads.length; sample += 1) {
        const query = row.wideGeometry[candidate].reads[sample];
        const actual = arm.field.sample(query.x, query.y);
        recordParity(receipt, 'wide', actual, row.wideProduction[candidate].raw[sample], {
          rowIndex, shape: row.shape, phase: row.phase, station: row.station, candidate,
          sample, query: { x: query.x, y: query.y }
        });
      }
    }
  }
  receipt.observed.total = receipt.observed.local + receipt.observed.wide;
  return receipt;
}

function recordParity(receipt, channel, actual, expected, location) {
  receipt.observed[channel] += 1;
  if (actual === expected) {
    receipt.exact[channel] += 1;
    return;
  }
  receipt.nonExact[channel] += 1;
  const error = Math.abs(actual - expected);
  if (error > receipt.maxAbsoluteError[channel]) receipt.maxAbsoluteError[channel] = error;
  if (!receipt.firstMismatch) receipt.firstMismatch = { channel, ...location, expected, actual, absoluteError: error };
}

function validateProductionSensors(rows, arms) {
  let rngCalls = 0;
  const controller = new AntController({ random: () => { rngCalls += 1; return 0.5; } });
  const result = {
    expectedRows: rows.length,
    exact: {
      geometryRows: 0,
      localRaw: 0,
      localAggregateFields: 0,
      wideRaw: 0,
      wideWeighted: 0,
      wideMaxima: 0,
      wideResponses: 0,
      wideScores: 0,
      wideRanks: 0,
      wideWinners: 0
    },
    nonExact: {},
    nonExactByField: {},
    firstMismatch: null,
    rngCalls
  };
  const fail = (kind, row, location, expected, actual) => {
    result.nonExact[kind] = (result.nonExact[kind] || 0) + 1;
    const fieldKey = location.field || location.candidate?.toString() || kind;
    result.nonExactByField[fieldKey] = (result.nonExactByField[fieldKey] || 0) + 1;
    if (!result.firstMismatch) result.firstMismatch = {
      kind, rowIndex: location.rowIndex, shape: row.shape, phase: row.phase,
      station: row.station, ...location, expected, actual
    };
  };
  const compare = (kind, row, location, expected, actual) => {
    if (expected === actual) result.exact[kind] += 1;
    else fail(kind, row, location, expected, actual);
  };

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const phase = PHASES.find(value => value.id === row.phase);
    const geometry = fixedSensorGeometry(row.shape, row.station, phase);
    const arm = arms.get(`${row.shape}|${row.phase}`);
    controller.field = arm.field;
    const agent = { x: geometry.body.x, y: geometry.body.y, heading: geometry.heading };
    const originalSample = arm.field.sample.bind(arm.field);
    const calls = [];
    arm.field.sample = (x, y) => {
      const value = originalSample(x, y);
      calls.push({ x, y, value });
      return value;
    };

    const local = controller.senseLocalTrail(agent);
    local.balance = (local.right - local.left) / (local.left + local.center + local.right + 1e-9);
    const localExpectedQueries = row.localGeometry;
    const localQueryMatch = calls.length === localExpectedQueries.length && calls.every((call, index) =>
      Object.is(call.x, localExpectedQueries[index].x) && Object.is(call.y, localExpectedQueries[index].y));
    const allQueriesMatch = localQueryMatch
      && JSON.stringify(geometry.localReads.map(({ x, y }) => ({ x, y }))) === JSON.stringify(row.localGeometry);
    if (allQueriesMatch) result.exact.geometryRows += 1;
    else fail('geometryRows', row, { rowIndex }, row.localGeometry, calls.map(({ x, y }) => ({ x, y })));
    for (let index = 0; index < calls.length; index += 1) {
      compare('localRaw', row, { rowIndex, sample: index }, row.localProductionRaw[index], calls[index].value);
    }
    for (const key of ['left', 'center', 'right', 'strength', 'coherence', 'balance', 'steering']) {
      compare('localAggregateFields', row, { rowIndex, field: key }, row.localProduction[key], local[key]);
    }

    const wideResults = [];
    for (let candidateIndex = 0; candidateIndex < geometry.wideCandidates.length; candidateIndex += 1) {
      const candidate = geometry.wideCandidates[candidateIndex];
      calls.length = 0;
      const maximum = controller.senseTrail(agent, candidate.heading);
      const savedGeometry = row.wideGeometry[candidateIndex];
      const queryMatch = calls.length === savedGeometry.reads.length && calls.every((call, index) =>
        Object.is(call.x, savedGeometry.reads[index].x) && Object.is(call.y, savedGeometry.reads[index].y));
      if (!queryMatch) fail('geometryRows', row, { rowIndex, candidate: candidateIndex }, savedGeometry.reads, calls);
      for (let sampleIndex = 0; sampleIndex < calls.length; sampleIndex += 1) {
        const expectedRaw = row.wideProduction[candidateIndex].raw[sampleIndex];
        compare('wideRaw', row, { rowIndex, candidate: candidateIndex, sample: sampleIndex }, expectedRaw, calls[sampleIndex].value);
        const expectedWeighted = row.wideProduction[candidateIndex].weighted[sampleIndex];
        const weighted = calls[sampleIndex].value * savedGeometry.reads[sampleIndex].weight;
        compare('wideWeighted', row, { rowIndex, candidate: candidateIndex, sample: sampleIndex }, expectedWeighted, weighted);
      }
      compare('wideMaxima', row, { rowIndex, candidate: candidateIndex },
        row.wideProduction[candidateIndex].maximum, maximum);
      const response = hillResponse(maximum, WIDE_HALF_SATURATION);
      compare('wideResponses', row, { rowIndex, candidate: candidateIndex },
        row.wideProduction[candidateIndex].response, response);
      wideResults.push({ offset: candidate.offset, response, maximum });
    }
    const confidence = Math.max(...wideResults.map(value => value.response))
      - Math.min(...wideResults.map(value => value.response));
    const scores = wideResults.map(candidate => candidate.response * TRAIL_SCORE_GAIN
      + (Math.cos(candidate.offset) - 1) * confidence * 0.55);
    const ranked = scores.map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const ranks = scores.map((score, index) => ranked.findIndex(value => value.index === index) + 1);
    for (let candidate = 0; candidate < scores.length; candidate += 1) {
      compare('wideScores', row, { rowIndex, candidate }, row.wideProduction[candidate].score, scores[candidate]);
      compare('wideRanks', row, { rowIndex, candidate }, row.productionRanks[candidate], ranks[candidate]);
    }
    compare('wideWinners', row, { rowIndex }, row.productionWinner, wideResults[ranked[0].index].offset);
    delete arm.field.sample;
  }
  result.rngCalls = rngCalls;
  return result;
}

function makeManifest({ rows, plans, arms, sourceHashes, scriptSha256, inputHashes }) {
  const entries = plans.map(plan => {
    const indices = [];
    for (let index = 0; index < rows.length; index += 1) {
      if (rows[index].shape === plan.shape && rows[index].phase === plan.phase.id) indices.push(index);
    }
    return {
      ...arms.get(plan.id).metadata,
      file: `rasters/${plan.shape}-${plan.phase.id}.f32le`,
      byteOffset: 0,
      writeStreamReceiptPath: 'validation/write-streams-preflight.json',
      rowIndices: indices,
      rowCount: indices.length,
      localQueryCount: indices.length * 18,
      wideQueryCount: indices.length * 25
    };
  });
  return {
    schema: 'ant-raster-backed-fixture/v1',
    provenance: {
      productionBaselineCommit: EXPECTED_MAIN,
      inputDatasetCommit: 'ea3d382c6c849df7505e1d398cef085ca271c8b9',
      inputDatasetPath: 'docs/ant/evidence/2026-10-24-ant-field-writer-reader-failure-attribution/inputs/station-raw.json.gz',
      inputDatasetSha256: inputHashes.compressed,
      inputUncompressedSha256: inputHashes.uncompressed,
      historicalRouteSource: HISTORICAL_ROUTE_SOURCE,
      replayScriptSha256: scriptSha256,
      productionSourceSha256: sourceHashes
    },
    fixture: {
      shapes: SHAPES,
      phases: PHASES,
      rows: rows.length,
      stationCountPerShape: 231,
      grid: { width: FIELD.width, height: FIELD.height, storage: 'Float32Array', byteOrder: 'little-endian' },
      writer: {
        radius: FIELD.radius,
        amountPerUnitDistance: FIELD.rate,
        dabSpacing: FIELD.dabSpacing,
        depositionMode: 'dab',
        decayCalls: 0,
        cap: FIELD.maxValue,
        initialState: 'all-zero'
      },
      historySemantics: 'deterministic replay-backed raster capture; not recovered historical raster nodes'
    },
    rasters: entries
  };
}

function makeSpecialControls(rows, arms, queryReceipt) {
  const find = (shape, phase, station) => {
    const rowIndex = rows.findIndex(row => row.shape === shape && row.phase === phase && row.station === station);
    assert.notEqual(rowIndex, -1, `missing special row ${shape}/${phase}/${station}`);
    return { row: rows[rowIndex], rowIndex };
  };
  const straightP00 = arms.get('straight|p00');
  const straightP01 = arms.get('straight|p01');
  const straightP00At122 = find('straight', 'p00', 0.122);
  const straightP01At122 = find('straight', 'p01', 0.122);
  const tightP00At294 = find('tight', 'p00', 0.294);
  const tightP10At066 = find('tight', 'p10', 0.066);
  const replayLocal = ({ row, rowIndex }) => {
    const phase = PHASES.find(value => value.id === row.phase);
    const geometry = fixedSensorGeometry(row.shape, row.station, phase);
    const arm = arms.get(`${row.shape}|${row.phase}`);
    const controller = new AntController({ random: () => 0.5 });
    controller.field = arm.field;
    const localRaw = row.localGeometry.map(query => arm.field.sample(query.x, query.y));
    const local = controller.senseLocalTrail({ x: geometry.body.x, y: geometry.body.y, heading: geometry.heading });
    const balance = (local.right - local.left) / (local.left + local.center + local.right + 1e-9);
    const exactFrozenParity = localRaw.every((value, index) => value === row.localProductionRaw[index])
      && ['left', 'center', 'right', 'strength', 'coherence', 'steering']
        .every(key => local[key] === row.localProduction[key])
      && balance === row.localProduction.balance
      && queryReceipt.nonExact.local === 0;
    return {
      phase: row.phase,
      rowIndex,
      cLocalRaw: localRaw,
      cSteering: local.steering,
      exactFrozenParity
    };
  };
  const replayWide = ({ row, rowIndex }) => {
    const phase = PHASES.find(value => value.id === row.phase);
    const geometry = fixedSensorGeometry(row.shape, row.station, phase);
    const arm = arms.get(`${row.shape}|${row.phase}`);
    const controller = new AntController({ random: () => 0.5 });
    controller.field = arm.field;
    const cCandidateRaw = row.wideGeometry.map(candidate => candidate.reads
      .map(query => arm.field.sample(query.x, query.y)));
    const cCandidateWeighted = cCandidateRaw.map((raw, candidate) => raw.map((value, sample) =>
      value * row.wideGeometry[candidate].reads[sample].weight));
    const cCandidateMaxima = geometry.wideCandidates.map(candidate =>
      controller.senseTrail({ x: geometry.body.x, y: geometry.body.y }, candidate.heading));
    const responses = cCandidateMaxima.map(value => hillResponse(value, WIDE_HALF_SATURATION));
    const confidence = Math.max(...responses) - Math.min(...responses);
    const scores = responses.map((response, index) => response * TRAIL_SCORE_GAIN
      + (Math.cos(geometry.wideCandidates[index].offset) - 1) * confidence * 0.55);
    const ranked = scores.map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const ranks = scores.map((score, index) => ranked.findIndex(value => value.index === index) + 1);
    const winner = geometry.wideCandidates[ranked[0].index].offset;
    const historical = row.wideProduction;
    const exactFrozenParity = sameJson(cCandidateRaw, historical.map(candidate => candidate.raw))
      && sameJson(cCandidateWeighted, historical.map(candidate => candidate.weighted))
      && cCandidateMaxima.every((value, index) => value === historical[index].maximum)
      && responses.every((value, index) => value === historical[index].response)
      && scores.every((value, index) => value === historical[index].score)
      && sameJson(ranks, row.productionRanks)
      && winner === row.productionWinner
      && queryReceipt.nonExact.wide === 0;
    return {
      rowIndex,
      cCandidateRaw,
      cCandidateWeighted,
      cCandidateMaxima,
      cWinner: winner,
      analyticWinner: row.referenceWinner,
      exactFrozenParity
    };
  };
  return {
    straightP00P01RasterBytes: {
      byteIdentical: straightP00.bytes.equals(straightP01.bytes),
      p00Sha256: straightP00.rasterSha256,
      p01Sha256: straightP01.rasterSha256
    },
    straightStation0122: [replayLocal(straightP00At122), replayLocal(straightP01At122)],
    tightP00Station0294: replayWide(tightP00At294),
    tightP10Station0066: replayWide(tightP10At066)
  };
}

function makeQuerySummary(query, sensors, arms, writeStreams) {
  return {
    rasterSha256: [...arms.values()].map(arm => [arm.plan.id, arm.rasterSha256]),
    writeStreamSha256: writeStreams.map(plan => [plan.id, plan.writeStreamSha256]),
    queryParity: query,
    sensorParity: sensors,
    acceptedWrites: [...arms.values()].map(arm => [arm.plan.id, arm.metadata.totalAcceptedDose]),
    nonFiniteNodes: 0,
    cappedCells: 0,
    rngCalls: sensors.rngCalls
  };
}

export async function runRasterCapture(outputDirectory = EVIDENCE) {
  const inputBytes = await readFile(INPUT_PATH);
  assert.equal(sha256(inputBytes), EXPECTED_INPUT_GZIP_SHA256, 'frozen query input hash changed');
  const inputJsonBytes = gunzipSync(inputBytes);
  assert.equal(sha256(inputJsonBytes), EXPECTED_INPUT_JSON_SHA256, 'frozen query input content hash changed');
  const rows = JSON.parse(inputJsonBytes.toString('utf8'));
  assert.equal(rows.length, 5544);
  for (const shape of SHAPES) for (const phase of PHASES) {
    assert.equal(rows.filter(row => row.shape === shape && row.phase === phase.id).length, 231,
      `frozen cohort row count changed for ${shape}/${phase.id}`);
  }
  const sourceHashes = {};
  for (const [path, expected] of Object.entries(EXPECTED_PRODUCTION_SOURCE_SHA256)) {
    const actual = sha256(await readFile(resolve(ROOT, path)));
    assert.equal(actual, expected, `${path} differs from pinned origin/main production source`);
    sourceHashes[path] = actual;
  }
  const scriptSha256 = sha256(await readFile(fileURLToPath(import.meta.url)));
  const inputHashes = { compressed: sha256(inputBytes), uncompressed: sha256(inputJsonBytes) };

  const firstPlans = buildWriteStreams();
  const plannedDocument = makeWriteStreamDocument(firstPlans, sourceHashes, scriptSha256, inputHashes);
  await mkdir(resolve(outputDirectory, 'inputs'), { recursive: true });
  await mkdir(resolve(outputDirectory, 'rasters'), { recursive: true });
  await mkdir(resolve(outputDirectory, 'validation'), { recursive: true });
  await writeFile(resolve(outputDirectory, 'validation/write-streams-preflight.json'),
    `${JSON.stringify(plannedDocument, null, 2)}\n`);

  const firstArms = runWriters(firstPlans);
  const firstQuery = validateFrozenQueries(rows, firstArms);
  const firstSensors = validateProductionSensors(rows, firstArms);
  const firstSpecial = makeSpecialControls(rows, firstArms, firstQuery);
  const firstSummary = makeQuerySummary(firstQuery, firstSensors, firstArms, firstPlans);
  const firstManifest = makeManifest({ rows, plans: firstPlans, arms: firstArms, sourceHashes, scriptSha256, inputHashes });

  const parityFailure = firstQuery.nonExact.local !== 0 || firstQuery.nonExact.wide !== 0
    || firstQuery.geometry.mismatchedRows !== 0 || !sensorReceiptIsExact(firstSensors)
    || firstSensors.rngCalls !== 0;
  if (parityFailure) {
    await writeFile(resolve(outputDirectory, 'validation/failure.json'), `${JSON.stringify({
      result: 'REPLAY MISMATCH / NOT QUALIFIED',
      queryParity: firstQuery,
      sensorParity: firstSensors,
      note: 'No new raster arrays or canonical manifest were written because an exact parity gate failed. Existing outputs were left untouched.'
    }, null, 2)}\n`);
    throw new Error('Exact historical C-query or sensor parity failed; raster capture is not qualified.');
  }
  assert.equal(firstPlans.length, 24);
  assert.equal(firstQuery.observed.local, 99792);
  assert.equal(firstQuery.observed.wide, 138600);
  assert.equal(firstQuery.observed.total, 238392);
  assert.equal(firstSpecial.straightP00P01RasterBytes.byteIdentical, true,
    'straight p00/p01 replay rasters must retain the established byte identity');

  const secondPlans = buildWriteStreams();
  const secondArms = runWriters(secondPlans);
  const secondQuery = validateFrozenQueries(rows, secondArms);
  const secondSensors = validateProductionSensors(rows, secondArms);
  const secondSpecial = makeSpecialControls(rows, secondArms, secondQuery);
  const secondSummary = makeQuerySummary(secondQuery, secondSensors, secondArms, secondPlans);
  const secondManifest = makeManifest({ rows, plans: secondPlans, arms: secondArms, sourceHashes, scriptSha256, inputHashes });
  const secondWriteStreams = makeWriteStreamDocument(secondPlans, sourceHashes, scriptSha256, inputHashes);
  const determinism = {
    secondGeneration: true,
    all24RasterSha256Identical: sameJson(
      firstPlans.map(plan => [plan.id, firstArms.get(plan.id).rasterSha256]),
      secondPlans.map(plan => [plan.id, secondArms.get(plan.id).rasterSha256])
    ),
    writeStreamsIdentical: sameJson(plannedDocument, secondWriteStreams),
    manifestIdentical: sameJson(firstManifest, secondManifest),
    queryParityReceiptIdentical: sameJson(firstQuery, secondQuery),
    sensorParityReceiptIdentical: sameJson(firstSensors, secondSensors),
    derivedValidationSummaryIdentical: sameJson(firstSummary, secondSummary),
    specialControlsIdentical: sameJson(firstSpecial, secondSpecial)
  };
  determinism.allGatesPass = Object.values(determinism).every(value => value === true);
  if (!determinism.allGatesPass) {
    await writeFile(resolve(outputDirectory, 'validation/failure.json'), `${JSON.stringify({
      result: 'REPLAY MISMATCH / NOT QUALIFIED',
      determinism,
      firstQueryParity: firstQuery,
      secondQueryParity: secondQuery,
      firstSensorParity: firstSensors,
      secondSensorParity: secondSensors,
      note: 'Second-generation comparison failed; no new raster arrays or canonical manifest were written. Existing outputs were left untouched.'
    }, null, 2)}\n`);
    throw new Error('Second generation did not reproduce the exact raster-backed dataset.');
  }

  for (const plan of firstPlans) {
    await writeFile(resolve(outputDirectory, `rasters/${plan.shape}-${plan.phase.id}.f32le`), firstArms.get(plan.id).bytes);
  }
  await rm(resolve(outputDirectory, 'validation/failure.json'), { force: true });
  await writeFile(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(firstManifest, null, 2)}\n`);
  await writeFile(resolve(outputDirectory, 'validation/query-parity.json'), `${JSON.stringify(firstQuery, null, 2)}\n`);
  await writeFile(resolve(outputDirectory, 'validation/sensor-parity.json'), `${JSON.stringify(firstSensors, null, 2)}\n`);
  await writeFile(resolve(outputDirectory, 'validation/special-controls.json'), `${JSON.stringify(firstSpecial, null, 2)}\n`);
  await writeFile(resolve(outputDirectory, 'validation/determinism.json'), `${JSON.stringify(determinism, null, 2)}\n`);
  await writeFile(resolve(outputDirectory, 'validation/summary.json'), `${JSON.stringify(firstSummary, null, 2)}\n`);
  return { manifest: firstManifest, query: firstQuery, sensors: firstSensors, special: firstSpecial, determinism };
}

function makeWriteStreamDocument(plans, sourceHashes, scriptSha256, inputHashes) {
  return {
    schema: 'ant-raster-write-streams/v1',
    phase: 'preflight-before-field-writes',
    provenance: {
      productionBaselineCommit: EXPECTED_MAIN,
      historicalRouteSource: HISTORICAL_ROUTE_SOURCE,
      replayScriptSha256: scriptSha256,
      productionSourceSha256: sourceHashes,
      frozenInputSha256: inputHashes
    },
    settings: {
      grid: `${FIELD.width}x${FIELD.height}`,
      depositMode: 'dab',
      dabSpacing: FIELD.dabSpacing,
      radius: FIELD.radius,
      amountPerUnitDistance: FIELD.rate,
      cap: FIELD.maxValue,
      initialRaster: 'all-zero Float32Array',
      decayCalls: 0,
      rngCalls: 0
    },
    arms: plans.map(plan => ({
      id: plan.id,
      shape: plan.shape,
      phase: plan.phase,
      stationCount: plan.stationCount,
      sourceDistance: plan.sourceDistance,
      eventCount: plan.eventCount,
      eventOrdering: 'order is sequential GasterDeposition output order',
      writeStreamSha256: plan.writeStreamSha256,
      totalRequestedDose: plan.totalRequestedDose,
      writes: plan.writes
    }))
  };
}

function sensorReceiptIsExact(receipt) {
  return Object.values(receipt.nonExact).every(count => count === 0)
    && Object.values(receipt.exact).every(count => count > 0)
    && receipt.firstMismatch === null;
}

function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function hillResponse(signal, halfSaturation) {
  const normalized = (signal / halfSaturation) ** 3;
  return normalized / (1 + normalized);
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const outputDirectory = process.argv[2] ? resolve(process.argv[2]) : EVIDENCE;
    const result = await runRasterCapture(outputDirectory);
    console.log(JSON.stringify({
      result: 'QUALIFIED RASTER-BACKED FIXTURE',
      outputDirectory,
      baseline: EXPECTED_MAIN,
      rasterCount: result.manifest.rasters.length,
      queryParity: result.query,
      sensorParity: result.sensors,
      specialControls: result.special,
      determinism: result.determinism
    }, null, 2));
  } catch (error) {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  }
}
