import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const NATURAL_COMMIT = '1dab083b640dbe73bc00f97a59c27568c8ba7866';
const ROUTE_COMMIT = 'd0e07d089c82d29409c7dd067e17cdeb9a5ecf7f';
const NATURAL_ROOT = 'docs/ant/evidence/2026-10-23-natural-field-transfer';
const ROUTE_ROOT = 'docs/ant/evidence/2026-10-22-route-curvature-survey';
const PHASES = [
  { id: 'p00', dx: 0, dy: 0 },
  { id: 'p10', dx: 0.5 / 95, dy: 0 },
  { id: 'p01', dx: 0, dy: 0.5 / 95 },
  { id: 'p11', dx: 0.5 / 95, dy: 0.5 / 95 }
];
const WIDTH = 96;
const HEIGHT = 96;
const RADIUS = 0.0045;
const RATE = 4.5;
const START = { x: 0.35, y: 0.5 };
const FIELD_RANGE = [-0.12, 0.34];
const FIELD_STEP = 0.002;
const SENSOR_DISTANCE = 0.042;
const SENSOR_WIDTH = 0.014;
const LOCAL_DISTANCES = [0.016, 0.028];
const LOCAL_SENSOR_HALF_WIDTH = 0.009;
const LOCAL_BAND_HALF_WIDTH = 0.003;
const LOCAL_HALF_SATURATION = 0.018;
const LOCAL_STEERING_LIMIT = 0.45;
const WIDE_OFFSETS = [-0.92, -0.47, 0, 0.47, 0.92];
const WIDE_TRANSVERSE_OFFSETS = [-1, -0.5, 0, 0.5, 1];

export function fieldPhases(width = WIDTH, height = HEIGHT) {
  return [
    { id: 'p00', dx: 0, dy: 0 },
    { id: 'p10', dx: 0.5 / (width - 1), dy: 0 },
    { id: 'p01', dx: 0, dy: 0.5 / (height - 1) },
    { id: 'p11', dx: 0.5 / (width - 1), dy: 0.5 / (height - 1) }
  ];
}

export function aggregateLocalSamples(samples) {
  if (!Array.isArray(samples) || samples.length !== 18 || samples.some(value => !Number.isFinite(value))) {
    throw new TypeError('Local aggregation requires 18 finite samples in production call order.');
  }
  const profiles = [0, 1].map(distanceIndex => [0, 1, 2].map(sideIndex => {
    const start = distanceIndex * 9 + sideIndex * 3;
    return samples.slice(start, start + 3).reduce((signal, value, index) =>
      signal + value * (index === 1 ? 0.5 : 0.25), 0);
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
  return { left, center, right, strength, coherence, steering: LOCAL_STEERING_LIMIT * balance * strength };
}

export function aggregateWideSamples(samples) {
  if (!Array.isArray(samples) || samples.length !== 5 || samples.some(value => !Number.isFinite(value))) {
    throw new TypeError('Wide aggregation requires five finite transverse samples in production call order.');
  }
  return Math.max(...samples.map((value, index) => value * (1 - Math.abs(WIDE_TRANSVERSE_OFFSETS[index]) * 0.45)));
}

export function hillResponse(signal, halfSaturation = 0.035) {
  const normalized = (signal / halfSaturation) ** 3;
  return normalized / (1 + normalized);
}

export function inspectBrushGeometry(field, x, y, amount, radius, sigma, support) {
  const gx = Math.max(0, Math.min(1, x)) * (field.width - 1);
  const gy = Math.max(0, Math.min(1, y)) * (field.height - 1);
  const nearestX = Math.round(gx), nearestY = Math.round(gy);
  const nearestDistance = Math.hypot(nearestX / (field.width - 1) - x, nearestY / (field.height - 1) - y);
  const radiusX = Math.ceil(support * (field.width - 1));
  const radiusY = Math.ceil(support * (field.height - 1));
  const minX = Math.max(0, Math.floor(gx - radiusX));
  const maxX = Math.min(field.width - 1, Math.ceil(gx + radiusX));
  const minY = Math.max(0, Math.floor(gy - radiusY));
  const maxY = Math.min(field.height - 1, Math.ceil(gy + radiusY));
  const sigmaSquared = sigma * sigma;
  const candidates = [];
  for (let row = minY; row <= maxY; row += 1) {
    const ny = row / (field.height - 1);
    for (let column = minX; column <= maxX; column += 1) {
      const nx = column / (field.width - 1);
      const distance = Math.hypot(nx - x, ny - y);
      if (distance > radius) continue;
      const weight = Math.exp(-(distance * distance) / (2 * sigmaSquared));
      if (weight > 0) candidates.push({ index: row * field.width + column, x: nx, y: ny, weight });
    }
  }
  const fallback = candidates.length === 0;
  if (fallback) {
    const index = nearestY * field.width + nearestX;
    candidates.push({ index, x: nearestX / (field.width - 1), y: nearestY / (field.height - 1), weight: 1 });
  }
  const weightTotal = candidates.reduce((sum, item) => sum + item.weight, 0);
  const proposals = candidates.map(item => ({ ...item, proposed: amount * item.weight / weightTotal }));
  return { supportNodes: fallback ? 0 : candidates.length, fallback, nearestDistance, proposals };
}

function instrumentBrushes(field) {
  const original = field.depositBrush;
  let active = null;
  const touched = new Set();
  field.depositBrush = function observedDepositBrush(x, y, amount, radius, sigma, support) {
    if (!active) throw new Error('Writer observer was not started for this physical write.');
    const geometry = inspectBrushGeometry(this, x, y, amount, radius, sigma, support);
    const before = new Map();
    for (const proposal of geometry.proposals) {
      if (!before.has(proposal.index)) before.set(proposal.index, this.values[proposal.index]);
      touched.add(proposal.index);
    }
    original.call(this, x, y, amount, radius, sigma, support);
    const cells = geometry.proposals.map(proposal => {
      const prior = before.get(proposal.index);
      const after = this.values[proposal.index];
      const storedDelta = after - prior;
      return {
        index: proposal.index,
        proposed: proposal.proposed,
        storedDelta,
        capLoss: Math.max(0, prior + proposal.proposed - this.maxValue),
        capInteracted: prior + proposal.proposed > this.maxValue,
        x: proposal.x,
        y: proposal.y
      };
    });
    active.brushes.push(brushMetrics({ x, y, amount, geometry, cells }));
  };
  return {
    begin() { active = { brushes: [], before: new Map() }; return active; },
    end({ clear = true } = {}) {
      const result = active;
      result.nodes = [...touched].map(index => ({ index, value: field.values[index] }));
      if (clear) for (const index of touched) field.values[index] = 0;
      touched.clear();
      active = null;
      return result;
    },
    restore() { field.depositBrush = original; }
  };
}

export function brushMetrics({ x, y, amount, geometry, cells }) {
  const actualMass = cells.reduce((sum, cell) => sum + cell.storedDelta, 0);
  const positive = cells.filter(cell => cell.storedDelta > 0);
  const mass = positive.reduce((sum, cell) => sum + cell.storedDelta, 0);
  const centroid = mass > 0 ? {
    x: positive.length === 1 ? positive[0].x : positive.reduce((sum, cell) => sum + cell.x * cell.storedDelta, 0) / mass,
    y: positive.length === 1 ? positive[0].y : positive.reduce((sum, cell) => sum + cell.y * cell.storedDelta, 0) / mass
  } : null;
  let xx = null, yy = null, xy = null, anisotropy = null;
  if (centroid) {
    xx = positive.reduce((sum, cell) => sum + (cell.x - centroid.x) ** 2 * cell.storedDelta, 0) / mass;
    yy = positive.reduce((sum, cell) => sum + (cell.y - centroid.y) ** 2 * cell.storedDelta, 0) / mass;
    xy = positive.reduce((sum, cell) => sum + (cell.x - centroid.x) * (cell.y - centroid.y) * cell.storedDelta, 0) / mass;
    const trace = xx + yy;
    const gap = Math.sqrt((xx - yy) ** 2 + 4 * xy ** 2);
    anisotropy = trace > 0 ? gap / trace : 0;
  }
  return {
    x, y, amount, supportNodes: geometry.supportNodes, fallback: geometry.fallback,
    nearestDistance: geometry.nearestDistance,
    cells,
    actualMass,
    centroid,
    centroidDisplacement: centroid ? Math.hypot(centroid.x - x, centroid.y - y) : null,
    secondMoment: { xx, yy, xy, anisotropy },
    capCells: cells.filter(cell => cell.capInteracted).length,
    capLoss: cells.reduce((sum, cell) => sum + cell.capLoss, 0),
    float32Residual: actualMass - cells.reduce((sum, cell) => sum + cell.proposed - cell.capLoss, 0)
  };
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

function valueAtProps(node, key) {
  return node.props.find(item => item.key === key)?.descriptor?.value;
}

function valuesFromFieldGraph(graph) {
  const root = graph.nodes[graph.root.ref];
  if (root.prototype !== 'PheromoneField') throw new Error('Expected a frozen PheromoneField graph root.');
  const valuesRef = valueAtProps(root, 'values')?.ref;
  const valuesNode = graph.nodes[valuesRef];
  if (valuesNode.kind !== 'typed-array' || valuesNode.prototype !== 'Float32Array') {
    throw new Error('Expected frozen Float32Array field values.');
  }
  const bufferNode = graph.nodes[valuesNode.buffer.ref];
  const bytes = Buffer.from(bufferNode.bytes, 'base64');
  if (bytes.byteLength !== valuesNode.length * Float32Array.BYTES_PER_ELEMENT) {
    throw new Error('Frozen Float32Array buffer length mismatch.');
  }
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
function summarize(values) {
  if (!values.length) return { n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  return { n: values.length, mean, median: percentile(0.5), p90: percentile(0.9), max: sorted.at(-1) };
}
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function distanceToEdge(x, y) { return Math.min(x, y, 1 - x, 1 - y); }

function translateDeposit(deposit, dx, dy) {
  return deposit.type === 'point'
    ? { ...deposit, position: { x: deposit.position.x + dx, y: deposit.position.y + dy } }
    : { ...deposit,
      from: { x: deposit.from.x + dx, y: deposit.from.y + dy },
      to: { x: deposit.to.x + dx, y: deposit.to.y + dy } };
}

function requestedDose(deposit) {
  return deposit.type === 'point' ? deposit.amount
    : Math.hypot(deposit.to.x - deposit.from.x, deposit.to.y - deposit.from.y) * deposit.amountPerUnitDistance;
}

function applyDeposit(field, deposit) {
  return deposit.type === 'point'
    ? field.depositPoint(deposit.position, { amount: deposit.amount, radius: RADIUS })
    : field.depositSegment(deposit.from, deposit.to, { amountPerUnitDistance: deposit.amountPerUnitDistance, radius: RADIUS });
}

function writerMetricGroup() {
  return { events: 0, brushes: 0, fallbacks: 0, supportNodes: { zero: 0, one: 0, moreThanOne: 0 },
    nearest: [], centroidError: [], anisotropy: [], actualMass: 0, requestedBrushMass: 0, capBrushes: 0,
    capLoss: 0, float32Residual: 0, boundaryWrites: 0, acceptedDose: 0, requestedDose: 0,
    clippedDose: 0, changedFootprintEvents: 0 };
}

function addBrushSummary(group, brush, boundary) {
  group.brushes += 1;
  group.fallbacks += Number(brush.fallback);
  group.supportNodes[brush.supportNodes === 0 ? 'zero' : brush.supportNodes === 1 ? 'one' : 'moreThanOne'] += 1;
  group.nearest.push(brush.nearestDistance);
  if (brush.centroidDisplacement !== null) group.centroidError.push(brush.centroidDisplacement);
  if (brush.secondMoment.anisotropy !== null) group.anisotropy.push(brush.secondMoment.anisotropy);
  group.actualMass += brush.actualMass;
  group.requestedBrushMass += brush.amount;
  group.capBrushes += Number(brush.capCells > 0);
  group.capLoss += brush.capLoss;
  group.float32Residual += brush.float32Residual;
  group.boundaryWrites += Number(boundary);
}

async function writeChunk(stream, text) {
  if (!stream.write(text)) await once(stream, 'drain');
}

async function openGzipText(filePath) {
  const file = createWriteStream(filePath);
  const gzip = createGzip({ level: 9 });
  gzip.pipe(file);
  return {
    write: text => writeChunk(gzip, text),
    async close() { gzip.end(); await once(file, 'close'); }
  };
}

function routeAt(shape, station, sineArcTable) {
  if (shape === 'straight') return { x: START.x + station, y: START.y };
  if (shape === 'gentle' || shape === 'gentleMirror' || shape === 'tight' || shape === 'tightMirror') {
    const radius = shape.startsWith('gentle') ? 0.25 : 0.1;
    const orientation = shape.endsWith('Mirror') ? -1 : 1;
    return { x: START.x + radius * Math.sin(station / radius),
      y: START.y + orientation * radius * (1 - Math.cos(station / radius)) };
  }
  const u = interpolateBy(sineArcTable, 'station', station).u;
  return { x: START.x + u, y: START.y + 0.018 * Math.sin(2 * Math.PI * u / 0.32) };
}

function routeTangent(shape, station, sineArcTable) {
  if (shape === 'straight') return 0;
  if (shape === 'gentle' || shape === 'gentleMirror' || shape === 'tight' || shape === 'tightMirror') {
    const radius = shape.startsWith('gentle') ? 0.25 : 0.1;
    return (shape.endsWith('Mirror') ? -1 : 1) * station / radius;
  }
  const u = interpolateBy(sineArcTable, 'station', station).u;
  return Math.atan2(0.018 * (2 * Math.PI / 0.32) * Math.cos(2 * Math.PI * u / 0.32), 1);
}

function buildSineArcTable() {
  const rows = [];
  let previous = null, length = 0;
  for (let u = -0.5; u <= 0.5 + 0.000125; u += 0.00025) {
    const current = { x: START.x + u, y: START.y + 0.018 * Math.sin(2 * Math.PI * u / 0.32) };
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
    if (rows[middle][key] <= clamped) low = middle; else high = middle;
  }
  const a = rows[low], b = rows[high];
  const ratio = (clamped - a[key]) / (b[key] - a[key] || 1);
  return { u: a.u + (b.u - a.u) * ratio, station: a.station + (b.station - a.station) * ratio };
}

function makeRouteStations() {
  const stations = new Set();
  for (let station = FIELD_RANGE[0]; station < FIELD_RANGE[1]; station += FIELD_STEP) stations.add(Number(station.toFixed(9)));
  stations.add(Number(FIELD_RANGE[0].toFixed(9)));
  stations.add(Number(FIELD_RANGE[1].toFixed(9)));
  return [...stations].sort((a, b) => a - b);
}

function localAt(field, position, heading) {
  const dx = Math.cos(heading), dy = Math.sin(heading), nx = -dy, ny = dx;
  const raw = [];
  for (const distance of LOCAL_DISTANCES) {
    for (const side of [-1, 0, 1]) {
      const x = position.x + dx * distance + nx * LOCAL_SENSOR_HALF_WIDTH * side;
      const y = position.y + dy * distance + ny * LOCAL_SENSOR_HALF_WIDTH * side;
      for (const offset of [-1, 0, 1]) {
        const sx = x + nx * LOCAL_BAND_HALF_WIDTH * offset;
        const sy = y + ny * LOCAL_BAND_HALF_WIDTH * offset;
        raw.push(sx < 0 || sx > 1 || sy < 0 || sy > 1 ? 0 : field.sample(sx, sy));
      }
    }
  }
  return aggregateLocalSamples(raw);
}

function wideAt(field, position, heading) {
  const x = position.x + Math.cos(heading) * SENSOR_DISTANCE;
  const y = position.y + Math.sin(heading) * SENSOR_DISTANCE;
  const nx = -Math.sin(heading), ny = Math.cos(heading);
  const raw = [];
  for (const offset of WIDE_TRANSVERSE_OFFSETS) {
    const sx = x + nx * SENSOR_WIDTH * offset;
    const sy = y + ny * SENSOR_WIDTH * offset;
    raw.push(sx < 0 || sx > 1 || sy < 0 || sy > 1 ? 0 : field.sample(sx, sy));
  }
  const max = aggregateWideSamples(raw);
  return hillResponse(max);
}

function summarizeFixturePhase(field, shape, phase, stations, sineArcTable) {
  const localSteering = [], localStrength = [], localCoherence = [],
    wideWinners = [], wideMargins = [], routeMeans = [];
  for (const station of stations) {
    const point = routeAt(shape, station, sineArcTable);
    const tangent = routeTangent(shape, station, sineArcTable);
    const position = { x: point.x + phase.dx, y: point.y + phase.dy };
    const local = localAt(field, position, tangent);
    localSteering.push(local.steering);
    localStrength.push(local.strength);
    localCoherence.push(local.coherence);
    const options = WIDE_OFFSETS.map(offset => wideAt(field, position, tangent + offset));
    const ranked = options.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value);
    wideWinners.push(WIDE_OFFSETS[ranked[0].index]);
    wideMargins.push(ranked[0].value - ranked[1].value);
    routeMeans.push(local.center);
  }
  const snapshot = field.getSnapshot();
  return {
    phase: phase.id,
    depositEvents: stations.length - 1,
    requestedDose: (stations.at(-1) - stations[0]) * RATE,
    rasterMass: snapshot.totalMass,
    nonzeroCells: snapshot.values.reduce((count, value) => count + Number(value > 0), 0),
    peakCell: snapshot.values.reduce((peak, value) => Math.max(peak, value), 0),
    localSteering: summarize(localSteering.map(Math.abs)),
    localStrength: summarize(localStrength),
    localCoherence: summarize(localCoherence),
    wideWinnerOffsetCounts: WIDE_OFFSETS.map(offset => ({ offset, count: wideWinners.filter(value => value === offset).length })),
    wideWinnerChangesFromForward: wideWinners.filter(offset => offset !== 0).length,
    wideMargin: summarize(wideMargins),
    centerReadout: summarize(routeMeans)
  };
}

function csvBrushRow(history, phase, event, brush, boundary) {
  assert.equal(brush.cells.length, 1, 'compact per-write receipt expects the current one-node footprint');
  const cellPayload = brush.cells.map(cell => `${cell.index}:${cell.proposed}:${cell.storedDelta}`).join('|');
  return [history.originPolicy, history.seed, event.sequence, event.tick, phase.id, brush.x, brush.y,
    brush.amount, brush.supportNodes, Number(brush.fallback), brush.nearestDistance, cellPayload,
    Number(boundary)].join(',') + '\n';
}

async function analyzeNaturalWrites(matrixRoot, routeResultsPath, outputDir) {
  const manifestBytes = await readFile(path.join(matrixRoot, 'matrix-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.captures.length, 66, 'expected the frozen 66-state natural cohort');
  const controlledBytes = await readFile(routeResultsPath);
  assert.equal(sha256(controlledBytes), '56378c7dc975bc6e5ea0c42a57acfc27369f6eb52458c3096a3be46022bb9bd6',
    'route-curvature controlled-results source hash');
  const controlled = JSON.parse((await import('node:zlib')).gunzipSync(controlledBytes));
  assert.equal(controlled.revision, '8c60e4b', 'route-curvature fixture baseline');
  const routeSourceProtocol = controlled.protocol;
  assert.equal(routeSourceProtocol.depositedField.radius, RADIUS);
  assert.equal(routeSourceProtocol.depositedField.amountPerUnitDistance, RATE);
  assert.equal(routeSourceProtocol.depositedField.gridCellPitch, 1 / 95);

  await mkdir(outputDir, { recursive: true });
  const detailPath = path.join(outputDir, 'writer-per-brush.csv.gz');
  const detail = await openGzipText(detailPath);
  await detail.write('origin,seed,sequence,tick,phase,x,y,requestedDose,supportNodes,nearestNodeFallback,nearestNodeDistance,nodeIndex:proposedDose:storedDelta,boundaryExposed\n');

  const natural = [];
  const phaseGroups = new Map();
  const streams = manifest.histories.filter(history => history.originPolicy === 'production' || history.originPolicy === 'dtFeedback');
  let outputBuffer = '';
  for (const historyRecord of streams) {
    const historyPath = path.join(matrixRoot, historyRecord.path);
    const historyBytes = await readFile(historyPath);
    assert.equal(sha256(historyBytes), historyRecord.sha256, `${historyRecord.originPolicy}/${historyRecord.seed} history hash`);
    const history = JSON.parse((await import('node:zlib')).gunzipSync(historyBytes));
    const initialValues = valuesFromFieldGraph(history.initialFieldGraph);
    assert.equal(initialValues.length, WIDTH * HEIGHT, 'initial field shape');
    assert.ok(initialValues.every(value => value === 0), 'frozen natural histories start from an empty field');
    const groups = new Map(PHASES.map(phase => [phase.id, writerMetricGroup()]));
    const fields = PHASES.map(() => new PheromoneField({ width: WIDTH, height: HEIGHT, maxValue: history.fieldParameters.maxValue,
      decayHalfLifeSeconds: history.fieldParameters.decayHalfLifeSeconds }));
    const observers = fields.map(instrumentBrushes);
    let depositEvents = 0, segmentEvents = 0, pointEvents = 0;
    for (const event of history.events) {
      if (event.type !== 'field-deposit-write') continue;
      depositEvents += 1;
      if (event.deposit.type === 'segment') segmentEvents += 1; else pointEvents += 1;
      const eventMetrics = [];
      const rawRequestedDose = requestedDose(event.deposit);
      for (let index = 0; index < PHASES.length; index += 1) {
        const phase = PHASES[index], field = fields[index], observer = observers[index];
        const shifted = translateDeposit(event.deposit, phase.dx, phase.dy);
        const observed = observer.begin();
        const accepted = applyDeposit(field, shifted);
        const finished = observer.end();
        const boundary = event.deposit.type === 'point'
          ? distanceToEdge(shifted.position.x, shifted.position.y) < RADIUS
          : [shifted.from, shifted.to].some(point => distanceToEdge(point.x, point.y) < RADIUS);
        const group = groups.get(phase.id);
        group.events += 1;
        group.requestedDose += rawRequestedDose;
        group.acceptedDose += accepted;
        group.clippedDose += rawRequestedDose - accepted;
        const brushRows = observed.brushes;
        for (let brushIndex = 0; brushIndex < brushRows.length; brushIndex += 1) {
          const brush = brushRows[brushIndex];
          assert.ok(brush.supportNodes <= 1, 'default support cannot contain more than one grid node');
          addBrushSummary(group, brush, boundary || distanceToEdge(brush.x, brush.y) < RADIUS);
          outputBuffer += csvBrushRow(history, phase, event, brush, boundary || distanceToEdge(brush.x, brush.y) < RADIUS);
          if (outputBuffer.length > 1024 * 1024) {
            await detail.write(outputBuffer);
            outputBuffer = '';
          }
        }
        eventMetrics.push({ phase: phase.id, accepted, nodes: finished.nodes.map(node => node.index).sort((a, b) => a - b),
          fallbackCount: brushRows.filter(brush => brush.fallback).length, brushCount: brushRows.length });
      }
      const baseNodes = eventMetrics[0].nodes.join(',');
      for (const metric of eventMetrics.slice(1)) {
        if (metric.nodes.join(',') !== baseNodes) groups.get(metric.phase).changedFootprintEvents += 1;
      }
    }
    if (outputBuffer) { await detail.write(outputBuffer); outputBuffer = ''; }
    observers.forEach(observer => observer.restore());
    for (const phase of PHASES) {
      const group = groups.get(phase.id);
      group.nearest = summarize(group.nearest);
      group.centroidError = summarize(group.centroidError);
      group.anisotropy = summarize(group.anisotropy);
      group.requestedDose = Number(group.requestedDose.toPrecision(12));
      group.acceptedDose = Number(group.acceptedDose.toPrecision(12));
      group.clippedDose = Number(group.clippedDose.toPrecision(12));
    }
    natural.push({ originPolicy: history.originPolicy, seed: history.seed, historyPath: historyRecord.path,
      historySha256: historyRecord.sha256, fieldParameters: history.fieldParameters,
      eventCount: history.events.length, depositEvents, pointEvents, segmentEvents, phases: Object.fromEntries(groups) });
  }
  await detail.close();

  const controlledFixtures = await analyzeControlledFixtures(routeSourceProtocol);
  return {
    schema: 'ant-field-write-read-isolation-writer/v1',
    provenance: {
      naturalBranchCommit: NATURAL_COMMIT,
      routeCurvatureBranchCommit: ROUTE_COMMIT,
      matrixManifestSha256: sha256(manifestBytes),
      controlledResultsGzipSha256: sha256(controlledBytes),
      controlledResultsRawSha256: '9615a86610e651753e89b3abea0a2a15527f26af6a12b63d86dc21f348b19578',
      currentFieldSha256: sha256(await readFile(new URL('../src/lib/agents/ant/PheromoneField.js', import.meta.url))),
      detailCsvGzip: path.basename(detailPath)
    },
    protocol: { phases: PHASES, writerOnlyIsolation: 'each natural physical write was applied to an otherwise-empty raster through the production depositPoint/depositSegment/depositBrush code; each translated phase is a separate empty raster',
      boundaryRule: 'write is boundary-exposed when the physical write or any brush center lies within deposit radius of an edge; excluded from interior-only tallies when summarized',
      cellPitch: 1 / 95, radius: RADIUS, maximumSupportCellsAtDefaultRadius: 1 },
    naturalHistories: natural,
    controlledFixtures
  };
}

async function analyzeControlledFixtures(protocol) {
  const sineArcTable = buildSineArcTable();
  const stations = makeRouteStations();
  const shapes = ['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve'];
  const fixtures = [];
  const localByPoint = new Map();
  for (const shape of shapes) {
    const routePoints = stations.map(station => ({ station, ...routeAt(shape, station, sineArcTable) }));
    const byPhase = [];
    for (const phase of PHASES) {
      const field = new PheromoneField({ width: WIDTH, height: HEIGHT, decayHalfLifeSeconds: 15 });
      let requestedDoseSum = 0, acceptedDoseSum = 0, brushFallbacks = 0, brushCalls = 0;
      const observer = instrumentBrushes(field);
      for (let index = 1; index < routePoints.length; index += 1) {
        const from = routePoints[index - 1], to = routePoints[index];
        const shiftedFrom = { x: from.x + phase.dx, y: from.y + phase.dy };
        const shiftedTo = { x: to.x + phase.dx, y: to.y + phase.dy };
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        requestedDoseSum += length * RATE;
        const observed = observer.begin();
        acceptedDoseSum += field.depositSegment(shiftedFrom, shiftedTo, { amountPerUnitDistance: RATE, radius: RADIUS });
        observer.end({ clear: false });
        brushCalls += observed.brushes.length;
        brushFallbacks += observed.brushes.filter(brush => brush.fallback).length;
      }
      observer.restore();
      assert.equal(brushCalls, stations.length - 1, 'each .002 route segment should produce one current writer brush');
      const summary = summarizeFixturePhase(field, shape, phase, stations, sineArcTable);
      summary.requestedDose = requestedDoseSum;
      summary.acceptedDose = acceptedDoseSum;
      summary.fallbackBrushes = brushFallbacks;
      summary.fallbackFraction = brushFallbacks / brushCalls;
      byPhase.push(summary);
      for (let index = 0; index < stations.length; index += 1) {
        const point = routeAt(shape, stations[index], sineArcTable);
        const key = `${shape}|${stations[index]}`;
        const position = { x: point.x + phase.dx, y: point.y + phase.dy };
        const local = localAt(field, position, routeTangent(shape, stations[index], sineArcTable));
        const wide = WIDE_OFFSETS.map(offset => wideAt(field, position,
          routeTangent(shape, stations[index], sineArcTable) + offset));
        const row = localByPoint.get(key) || [];
        row.push({ phase: phase.id, steering: local.steering, strength: local.strength, coherence: local.coherence,
          wideWinnerOffset: WIDE_OFFSETS[wide.indexOf(Math.max(...wide))], wideMargin: [...wide].sort((a, b) => b - a)[0] - [...wide].sort((a, b) => b - a)[1] });
        localByPoint.set(key, row);
      }
    }
    fixtures.push({ shape, source: { start: START, stationRange: FIELD_RANGE, step: FIELD_STEP,
      representation: protocol.depositedField.mode, sourcePolylineSegments: stations.length - 1 }, phases: byPhase });
  }
  const phaseSpreads = [];
  for (const [key, rows] of localByPoint) {
    if (rows.length !== 4) throw new Error(`Expected four phases for ${key}.`);
    const values = getter => rows.map(getter);
    phaseSpreads.push({ key, steeringRange: Math.max(...values(row => row.steering)) - Math.min(...values(row => row.steering)),
      strengthRange: Math.max(...values(row => row.strength)) - Math.min(...values(row => row.strength)),
      coherenceRange: Math.max(...values(row => row.coherence)) - Math.min(...values(row => row.coherence)),
      wideWinnerCount: new Set(values(row => row.wideWinnerOffset)).size,
      wideWinnerOffsets: values(row => row.wideWinnerOffset) });
  }
  const mirrorConsistency = [];
  for (const base of ['gentle', 'tight']) {
    for (const phase of PHASES) {
      const errors = [];
      for (const station of stations) {
        const left = localByPoint.get(`${base}|${station}`)?.find(row => row.phase === phase.id);
        const right = localByPoint.get(`${base}Mirror|${station}`)?.find(row => row.phase === phase.id);
        if (left && right) errors.push(Math.abs(left.steering + right.steering));
      }
      mirrorConsistency.push({ shape: base, phase: phase.id, steeringMirrorError: summarize(errors) });
    }
  }
  return {
    provenance: { sourceBranchCommit: ROUTE_COMMIT, sourceResultsGzipSha256: '56378c7dc975bc6e5ea0c42a57acfc27369f6eb52458c3096a3be46022bb9bd6',
      fixtureProtocol: 'reused six route geometries, start, [-0.12,0.34] station window, 0.002 station spacing, 4.5 dose rate and 0.0045 radius from route-curvature pass' },
    fixtures,
    phaseSpread: {
      stationCount: phaseSpreads.length,
      byShape: Object.fromEntries(['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve'].map(shape => {
        const rows = phaseSpreads.filter(row => row.key.startsWith(`${shape}|`));
        return [shape, { steeringRange: summarize(rows.map(row => row.steeringRange)),
          strengthRange: summarize(rows.map(row => row.strengthRange)),
          coherenceRange: summarize(rows.map(row => row.coherenceRange)),
          anyWideWinnerChange: rows.filter(row => row.wideWinnerCount > 1).length,
          stationCount: rows.length }];
      }))
    },
    mirrorConsistency
  };
}

async function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--data-root', '--route-root', '--output-dir'].includes(key)) throw new Error(`Unknown argument ${key}.`);
    args[key.slice(2)] = argv[++index];
  }
  if (!args['data-root'] || !args['route-root'] || !args['output-dir']) {
    throw new Error('Usage: node scripts/ant-field-write-read-isolation.js --data-root <natural archive root> --route-root <route archive root> --output-dir <new output directory>');
  }
  return args;
}

async function main() {
  const args = await parseArgs(process.argv);
  const matrixRoot = path.join(args['data-root'], NATURAL_ROOT, 'capture/matrix-20261023');
  const routeResultsPath = path.join(args['route-root'], ROUTE_ROOT, 'controlled/controlled-results.json.gz');
  const outputDir = path.resolve(args['output-dir']);
  const writer = await analyzeNaturalWrites(matrixRoot, routeResultsPath, outputDir);
  const jsonPath = path.join(outputDir, 'writer-summary.json');
  await writeFile(jsonPath, `${JSON.stringify(writer, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ jsonPath, writerDetail: path.join(outputDir, 'writer-per-brush.csv.gz'),
    naturalHistories: writer.naturalHistories.length, controlledFixtures: writer.controlledFixtures.fixtures.length,
    currentFieldSha256: writer.provenance.currentFieldSha256 }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
