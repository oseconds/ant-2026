import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { BodyPoseController } from '../src/lib/agents/ant/BodyPoseController.js';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const WIDTH = 96;
const HEIGHT = 96;
const PITCH = 1 / (WIDTH - 1);
const HALF_LIFE_SECONDS = 15;
const RATE = 4.5;
const RADIUS = 0.0045;
const DAB_SPACING = 0.006;
const PATH_START = -0.12;
const PATH_END = 0.34;
const PATH_STEP = 0.002;
const PATH_SPEED = 0.12;
const BASE_REVISION = '8c60e4b';
const READOUT_STATIONS = [-0.04, 0.08, 0.20];
const SENSOR_OFFSETS = [-0.92, -0.47, 0, 0.47, 0.92];
const SOURCE_FILES = [
  '../src/lib/agents/ant/PheromoneField.js',
  '../src/lib/agents/ant/GasterDeposition.js',
  '../src/lib/agents/ant/BodyPoseController.js',
  '../src/lib/agents/ant/AntController.js'
];
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT = fileURLToPath(new URL('../docs/ant/evidence/2026-10-22-spatial-dynamics/field/field-results.json', import.meta.url));
const SCRIPT_URL = new URL(import.meta.url);
const HASH = value => createHash('sha256').update(value).digest('hex');

const START = { x: 32 * PITCH, y: 48 * PITCH };
const PHASES = [
  { name: 'grid-node', x: 0, y: 0 },
  { name: 'half-cell-both-axes', x: PITCH / 2, y: PITCH / 2 }
];
const GEOMETRIES = [
  { name: 'straight-x', family: 'straight', kind: 'line', angle: 0 },
  { name: 'straight-y', family: 'straight', kind: 'line', angle: Math.PI / 2 },
  { name: 'gentle-positive', family: 'gentle', kind: 'circle', radius: 0.25, orientation: 1 },
  { name: 'gentle-mirror', family: 'gentle', kind: 'circle', radius: 0.25, orientation: -1 },
  { name: 'tight-positive', family: 'tight', kind: 'circle', radius: 0.10, orientation: 1 },
  { name: 'tight-mirror', family: 'tight', kind: 'circle', radius: 0.10, orientation: -1 },
  { name: 's-curve', family: 's-curve', kind: 'sine', amplitude: 0.018, wavelength: 0.32 },
  { name: 's-curve-mirror', family: 's-curve', kind: 'sine', amplitude: -0.018, wavelength: 0.32 }
];
const PATH_MODES = ['thorax-continuous', 'gaster-continuous', 'gaster-dab'];

/** Diagnostic alternative only; the splat replaces the Gaussian brush kernel. */
export class CloudInCellPheromoneField extends PheromoneField {
  depositBrush(x, y, amount) {
    const gx = clamp01(x) * (this.width - 1);
    const gy = clamp01(y) * (this.height - 1);
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const x1 = Math.min(this.width - 1, x0 + 1), y1 = Math.min(this.height - 1, y0 + 1);
    const tx = gx - x0, ty = gy - y0;
    for (const [column, row, weight] of [
      [x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)],
      [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]
    ]) {
      const index = row * this.width + column;
      this.values[index] = Math.min(this.maxValue, this.values[index] + amount * weight);
    }
  }
}

export function routePoint(geometry, station, phase = { x: 0, y: 0 }) {
  if (![station, phase.x, phase.y].every(Number.isFinite)) throw new TypeError('Route inputs must be finite.');
  let x, y;
  if (geometry.kind === 'line') {
    x = START.x + Math.cos(geometry.angle) * station;
    y = START.y + Math.sin(geometry.angle) * station;
  } else if (geometry.kind === 'circle') {
    x = START.x + geometry.radius * Math.sin(station / geometry.radius);
    y = START.y + geometry.orientation * geometry.radius * (1 - Math.cos(station / geometry.radius));
  } else {
    x = START.x + station;
    y = geometry.amplitude * Math.sin(2 * Math.PI * station / geometry.wavelength);
    const originY = geometry.amplitude * Math.sin(0);
    y += START.y - originY;
  }
  return { x: x + phase.x, y: y + phase.y };
}

export function routeTangent(geometry, station) {
  if (geometry.kind === 'line') return geometry.angle;
  if (geometry.kind === 'circle') return geometry.orientation * station / geometry.radius;
  const k = 2 * Math.PI / geometry.wavelength;
  return Math.atan2(geometry.amplitude * k * Math.cos(k * station), 1);
}

export function sourcePath(geometry, phase = { x: 0, y: 0 }) {
  const count = Math.round((PATH_END - PATH_START) / PATH_STEP);
  return Array.from({ length: count + 1 }, (_, index) => {
    const station = PATH_START + index * PATH_STEP;
    return { station, ...routePoint(geometry, station, phase) };
  });
}

export function gasterPath(geometry, phase = { x: 0, y: 0 }) {
  const path = sourcePath(geometry, phase);
  const pose = new BodyPoseController();
  const ant = { id: 1, radius: 0.006, x: path[0].x, y: path[0].y,
    heading: routeTangent(geometry, path[0].station), angularVelocity: 0 };
  const rear = [];
  pose.advance(ant, 1 / 60);
  rear.push({ ...pose.getSnapshot(ant).gasterRear });
  for (let index = 1; index < path.length; index += 1) {
    const before = path[index - 1], current = path[index];
    const distance = Math.hypot(current.x - before.x, current.y - before.y);
    const dt = distance / PATH_SPEED;
    const previousHeading = routeTangent(geometry, before.station);
    const heading = routeTangent(geometry, current.station);
    ant.x = current.x; ant.y = current.y; ant.heading = heading;
    ant.angularVelocity = wrapAngle(heading - previousHeading) / dt;
    pose.advance(ant, dt);
    rear.push({ ...pose.getSnapshot(ant).gasterRear });
  }
  return rear;
}

export function phaseDisagreementSummary(records, pathMode = 'thorax-continuous') {
  const pairs = [];
  for (const geometry of GEOMETRIES) {
    for (const station of READOUT_STATIONS) {
      const node = records.find(record => record.geometry === geometry.name
        && record.pathMode === pathMode && record.phase === 'grid-node')?.sensors.find(row => row.station === station);
      const half = records.find(record => record.geometry === geometry.name
        && record.pathMode === pathMode && record.phase === 'half-cell-both-axes')?.sensors.find(row => row.station === station);
      if (!node || !half) continue;
      pairs.push({ geometry: geometry.name, family: geometry.family, station,
        gridNodeOffset: node.scoreWinner.offset, halfCellOffset: half.scoreWinner.offset,
        disagreement: node.scoreWinner.index !== half.scoreWinner.index,
        fallbackDose: records.find(record => record.geometry === geometry.name
          && record.pathMode === pathMode && record.phase === 'grid-node').field.gaussianNearestFallbackDose
          + records.find(record => record.geometry === geometry.name
            && record.pathMode === pathMode && record.phase === 'half-cell-both-axes').field.gaussianNearestFallbackDose });
    }
  }
  const families = [...new Set(pairs.map(pair => pair.family))].map(family => ({
    family,
    disagreementStations: pairs.filter(pair => pair.family === family && pair.disagreement).length,
    fallbackDoseOnDisagreement: pairs.some(pair => pair.family === family && pair.disagreement && pair.fallbackDose > 0)
  }));
  return { pairs, families, disagreementCount: pairs.filter(pair => pair.disagreement).length };
}

export async function runSpatialFieldPass() {
  const gaussianRecords = [];
  for (const geometry of GEOMETRIES) for (const phase of PHASES) for (const pathMode of PATH_MODES) {
    gaussianRecords.push(await runFixture(PheromoneField, geometry, phase, pathMode, 'gaussian'));
  }
  const gaussianDisagreement = phaseDisagreementSummary(gaussianRecords);
  const affectedFamilies = gaussianDisagreement.families.filter(family => family.disagreementStations > 0).length;
  const fallbackGateMet = gaussianDisagreement.pairs.some(pair => pair.disagreement && pair.fallbackDose > 0);
  const defaultRepresentationSensitivityConfirmed = affectedFamilies >= 2 && fallbackGateMet;
  const runCic = defaultRepresentationSensitivityConfirmed;
  const cicRecords = [];
  if (runCic) {
    for (const geometry of GEOMETRIES) for (const phase of PHASES) for (const pathMode of PATH_MODES) {
      cicRecords.push(await runFixture(CloudInCellPheromoneField, geometry, phase, pathMode, 'cic'));
    }
  }

  const cicDisagreement = cicRecords.length ? phaseDisagreementSummary(cicRecords) : null;
  const amplitudeMatch = cicRecords.length ? amplitudeMatchedReadouts(gaussianRecords, cicRecords) : null;
  const result = {
    createdAt: new Date().toISOString(),
    revision: BASE_REVISION,
    sourceHashes: await sourceHashes(),
    protocol: {
      grid: `${WIDTH}x${HEIGHT}`, pitch: PITCH, halfLifeSeconds: HALF_LIFE_SECONDS,
      maxValue: 8, depositionRate: RATE, radius: RADIUS, dabSpacing: DAB_SPACING,
      pathStations: [PATH_START, PATH_END], pathStep: PATH_STEP,
      readoutStations: READOUT_STATIONS, phases: PHASES, routeProfiles: GEOMETRIES.map(({ name, family }) => ({ name, family })),
      pathModes: PATH_MODES,
      selectorReadout: 'unchanged AntController.updateIntention; zero crowding; real local sensor input; deterministic jitter/noise zero; final softmax draw targeted to the highest-score interval',
      alternative: 'diagnostic-only normalized 4-neighbor cloud-in-cell splat; no production source/export'
    },
    defaultRepresentationSensitivityConfirmed,
    decisionGate: { affectedGeometryFamilies: affectedFamilies, requiredGeometryFamilies: 2,
      anyPhasePairHasFallbackDose: fallbackGateMet },
    gaussian: gaussianRecords,
    gaussianPhaseDisagreement: gaussianDisagreement,
    cic: cicRecords.length ? cicRecords : null,
    cicPhaseDisagreement: cicDisagreement,
    amplitudeMatchedReadout: amplitudeMatch,
    cicCandidateOutcome: cicRecords.length
      ? (cicDisagreement.disagreementCount < gaussianDisagreement.disagreementCount ? 'REDUCES_PHASE_WINNER_DISAGREEMENTS' : 'NEGATIVE_NO_REDUCTION')
      : 'NOT_RUN_DEFAULT_GATE_NOT_MET'
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  liveFields.clear();
  return result;
}

async function runFixture(FieldType, geometry, phase, pathMode, representation) {
  const thorax = sourcePath(geometry, phase);
  const rear = pathMode === 'thorax-continuous' ? null : gasterPath(geometry, phase);
  const source = pathMode === 'thorax-continuous' ? thorax.map(({ x, y }) => ({ x, y })) : rear;
  const field = makeMeasuredField(FieldType);
  let intendedDose = 0, fieldRequestedDose = 0, thoraxLength = 0;
  const deposition = pathMode === 'gaster-dab' ? new GasterDeposition({ mode: 'dab', spacing: DAB_SPACING })
    : pathMode === 'gaster-continuous' ? new GasterDeposition({ mode: 'continuous' }) : null;

  for (let index = 1; index < thorax.length; index += 1) {
    const from = thorax[index - 1], to = thorax[index];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    thoraxLength += distance;
    intendedDose += distance * RATE;
    if (!deposition) {
      fieldRequestedDose += field.depositSegment(from, to, { amountPerUnitDistance: RATE, radius: RADIUS });
      continue;
    }
    const deposits = deposition.advance('ant-1', distance, rear[index - 1], rear[index], RATE);
    fieldRequestedDose += applyDeposits(field, deposits);
  }
  if (pathMode === 'gaster-dab') {
    fieldRequestedDose += applyDeposits(field, deposition.retire('ant-1', rear.at(-1)));
  }

  const sensors = READOUT_STATIONS.map(station => measureSensors(field, geometry, phase, station));
  const initial = summarizeField(field, source, { intendedDose, fieldRequestedDose, thoraxLength });
  const readoutCopy = new PheromoneField({ width: field.width, height: field.height,
    decayHalfLifeSeconds: field.decayHalfLifeSeconds, maxValue: field.maxValue });
  readoutCopy.values.set(field.values);
  const key = `${geometry.name}|${phase.name}|${pathMode}|${representation}`;
  liveFields.set(key, readoutCopy);
  const beforeDecayMass = initial.storedMass;
  field.decay(HALF_LIFE_SECONDS);
  const afterDecayMass = sum(field.values);
  return {
    key,
    geometry: geometry.name, family: geometry.family, phase: phase.name, pathMode, representation,
    field: { ...initial, massAfterOneHalfLife: afterDecayMass,
      observedMassRatioAfterOneHalfLife: beforeDecayMass ? afterDecayMass / beforeDecayMass : null },
    sensors
  };
}

function applyDeposits(field, deposits) {
  let returned = 0;
  for (const deposit of deposits) {
    if (deposit.type === 'point') returned += field.depositPoint(deposit.position, { amount: deposit.amount, radius: RADIUS });
    else returned += field.depositSegment(deposit.from, deposit.to, {
      amountPerUnitDistance: deposit.amountPerUnitDistance, radius: RADIUS
    });
  }
  return returned;
}

function makeMeasuredField(FieldType) {
  return new class extends FieldType {
    constructor() {
      super({ width: WIDTH, height: HEIGHT, decayHalfLifeSeconds: HALF_LIFE_SECONDS, maxValue: 8 });
      this.brushCalls = 0;
      this.brushDose = 0;
      this.fallbackBrushCalls = 0;
      this.fallbackDose = 0;
    }
    depositBrush(x, y, amount, radius, sigma, support) {
      this.brushCalls += 1;
      this.brushDose += amount;
      if (FieldType === PheromoneField && !hasGaussianSupportCell(this, x, y, radius)) {
        this.fallbackBrushCalls += 1;
        this.fallbackDose += amount;
      }
      super.depositBrush(x, y, amount, radius, sigma, support);
    }
  }();
}

function hasGaussianSupportCell(field, x, y, radius) {
  const column = Math.round(clamp01(x) * (field.width - 1));
  const row = Math.round(clamp01(y) * (field.height - 1));
  return Math.hypot(column / (field.width - 1) - x, row / (field.height - 1) - y) <= radius;
}

function summarizeField(field, sourcePathPoints, dose) {
  const mass = sum(field.values);
  const cappedCells = field.values.reduce((count, value) => count + Number(value >= field.maxValue - 1e-6), 0);
  const occupiedCells = field.values.reduce((count, value) => count + Number(value > 0), 0);
  const sourceStats = weightedSourceDistance(field, sourcePathPoints);
  return {
    width: field.width, height: field.height, decayHalfLifeSeconds: field.decayHalfLifeSeconds,
    maxValue: field.maxValue, sourcePathLength: pathLength(sourcePathPoints),
    thoraxLength: dose.thoraxLength, intendedThoraxDose: dose.intendedDose,
    fieldRequestedDose: dose.fieldRequestedDose, storedMass: mass,
    preCapMassLossEstimate: Math.max(0, dose.fieldRequestedDose - mass),
    cappedCells, occupiedCells, peak: Math.max(...field.values),
    brushCalls: field.brushCalls, brushDose: field.brushDose,
    gaussianNearestFallbackCalls: field.fallbackBrushCalls,
    gaussianNearestFallbackDose: field.fallbackDose,
    weightedSourceDistance: sourceStats
  };
}

function measureSensors(field, geometry, phase, station) {
  const position = routePoint(geometry, station, phase);
  const heading = routeTangent(geometry, station);
  const controller = Object.create(AntController.prototype);
  controller.field = field;
  controller.state = { behavior: { sensorDistance: 0.042, sensorWidth: 0.014 } };
  controller.occupancy = { crowdingInDirection: () => 0 };
  let randomCalls = 0;
  let signals = [];
  const ant = { id: 1, x: position.x, y: position.y, heading, intentHeading: heading,
    trailConfidence: 0, trailAdherence: 0, decisionRemaining: 0, committedRemaining: 0,
    inspectionRemaining: 100, hesitationRemaining: 0, wasBlocked: false,
    personality: { pheromoneSensitivity: 1.6, exploration: 0.2 } };
  const local = controller.senseLocalTrail(ant);
  controller.senseTrail = (agent, candidateHeading) => {
    const signal = AntController.prototype.senseTrail.call(controller, agent, candidateHeading);
    signals.push(signal);
    return signal;
  };
  const adherence = local.strength * local.coherence * -Math.expm1(-(1 / 60) / 0.25);
  const scoresForCapturedSignals = () => {
    const response = signals.map(value => controllerTrailResponse(value));
    const confidence = Math.max(...response) - Math.min(...response);
    const scores = response.map((value, index) => value * ant.personality.pheromoneSensitivity * 2.8
      + (Math.cos(SENSOR_OFFSETS[index]) - 1) * confidence * 0.55
      + (Math.cos(SENSOR_OFFSETS[index]) - 1) * adherence * 3);
    return { response, confidence, scores, temperature: 0.85 * (1 - 0.4 * confidence) };
  };
  controller.random = () => {
    randomCalls += 1;
    if (randomCalls <= 12) return 0.5;
    if (randomCalls === 13) return 0.99;
    if (randomCalls === 14) {
      const { scores, temperature } = scoresForCapturedSignals();
      const weights = scores.map(score => Math.exp((score - Math.max(...scores)) / temperature));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      const winner = scores.indexOf(Math.max(...scores));
      const before = weights.slice(0, winner).reduce((sum, weight) => sum + weight, 0);
      return (before + weights[winner] / 2) / total;
    }
    throw new Error(`Unexpected controller RNG call ${randomCalls}.`);
  };
  controller.updateIntention(ant, [ant], { frontCrowding: 0 }, 1 / 60, local);
  assert.equal(signals.length, SENSOR_OFFSETS.length, 'the unchanged decision read five sensor offsets');
  assert.equal(randomCalls, 14, 'the deterministic selector fixture followed the unchanged call sequence');
  const scored = scoresForCapturedSignals();
  const winner = scored.scores.indexOf(Math.max(...scored.scores));
  assert.ok(Math.abs(wrapAngle(ant.intentHeading - heading - SENSOR_OFFSETS[winner])) < 1e-9,
    'the unchanged softmax selector was given a draw inside its highest-score interval');
  return {
    station, sensorHeading: heading,
    wideSignals: signals,
    wideResponses: scored.response,
    normalizedWideProfile: normalize(signals),
    scoreOffsets: SENSOR_OFFSETS,
    scores: scored.scores,
    scoreTemperature: scored.temperature,
    confidence: scored.confidence,
    adherenceAfterOneTick: ant.trailAdherence,
    scoreWinner: { index: winner, offset: SENSOR_OFFSETS[winner], score: scored.scores[winner],
      marginOverSecond: scored.scores[winner] - [...scored.scores].sort((a, b) => b - a)[1] },
    local: { left: local.left, center: local.center, right: local.right,
      normalizedLeft: local.left / (local.left + local.center + local.right + 1e-9),
      normalizedCenter: local.center / (local.left + local.center + local.right + 1e-9),
      normalizedRight: local.right / (local.left + local.center + local.right + 1e-9),
      total: local.left + local.center + local.right,
      strength: local.strength, coherence: local.coherence, steering: local.steering },
    farMaximum: Math.max(...signals),
    farToNearTotalRatio: Math.max(...signals) / (local.left + local.center + local.right + 1e-9),
    randomCalls
  };
}

function controllerTrailResponse(signal, halfSaturation = 0.035) {
  const normalized = (signal / halfSaturation) ** 3;
  return normalized / (1 + normalized);
}

function amplitudeMatchedReadouts(gaussianRecords, cicRecords) {
  const baselineFar = [], cicFar = [];
  for (const cic of cicRecords) {
    const baseline = gaussianRecords.find(record => record.geometry === cic.geometry
      && record.phase === cic.phase && record.pathMode === cic.pathMode);
    const baseSensor = baseline?.sensors.find(sensor => sensor.station === 0.08);
    const cicSensor = cic.sensors.find(sensor => sensor.station === 0.08);
    if (!baseSensor || !cicSensor) continue;
    baselineFar.push(Math.max(...baseSensor.wideSignals));
    cicFar.push(Math.max(...cicSensor.wideSignals));
  }
  const scale = mean(baselineFar) / (mean(cicFar) || 1);
  const baselineScaled = gaussianRecords.map(record => withScaledReadout(record, 1));
  const cicScaled = cicRecords.map(record => withScaledReadout(record, scale));
  return {
    method: 'one global CIC query-scale equals pooled baseline/CIC far-sensor maxima at station 0.08; query only, does not alter field storage or cap',
    scale,
    gaussianPhaseDisagreement: phaseDisagreementSummary(baselineScaled).disagreementCount,
    cicPhaseDisagreement: phaseDisagreementSummary(cicScaled).disagreementCount,
    gaussian: baselineScaled.map(compactReadout),
    cic: cicScaled.map(compactReadout)
  };
}

function withScaledReadout(record, scale) {
  const fieldView = { sample: (x, y) => recordField(record).sample(x, y) * scale };
  const geometry = GEOMETRIES.find(item => item.name === record.geometry);
  const phase = PHASES.find(item => item.name === record.phase);
  return { ...record, sensors: READOUT_STATIONS.map(station => measureSensors(fieldView, geometry, phase, station)) };
}

// Records carry no live field reference in JSON output; this map is attached only during the pass.
const liveFields = new Map();
function recordField(record) {
  const field = liveFields.get(record.key);
  if (!field) throw new Error(`Missing live field for amplitude-matched readout: ${record.key}`);
  return field;
}

function compactReadout(record) {
  return { key: record.key, sensors: record.sensors.map(({ station, wideSignals, normalizedWideProfile,
    scoreWinner, local }) => ({ station, wideSignals, normalizedWideProfile, scoreWinner, local })) };
}

function weightedSourceDistance(field, path) {
  const segments = path.slice(1).map((point, index) => ({ from: path[index], to: point }));
  const entries = [];
  let mass = 0, signedOffset = 0, absoluteDistance = 0, squaredDistance = 0;
  for (let row = 0; row < field.height; row += 1) for (let column = 0; column < field.width; column += 1) {
    const weight = field.values[row * field.width + column];
    if (weight <= 0) continue;
    const point = { x: column / (field.width - 1), y: row / (field.height - 1) };
    const nearest = nearestPolylinePoint(point, segments);
    mass += weight; signedOffset += nearest.signedOffset * weight;
    absoluteDistance += nearest.distance * weight; squaredDistance += nearest.distance ** 2 * weight;
    entries.push({ distance: nearest.distance, weight });
  }
  entries.sort((a, b) => a.distance - b.distance);
  return {
    meanSignedCrossTrack: mass ? signedOffset / mass : null,
    meanAbsoluteDistance: mass ? absoluteDistance / mass : null,
    rmsDistance: mass ? Math.sqrt(squaredDistance / mass) : null,
    p90Distance: weightedQuantile(entries, 0.9, mass)
  };
}

function nearestPolylinePoint(point, segments) {
  let best = null;
  for (const { from, to } of segments) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared, 0, 1);
    const ex = point.x - (from.x + t * dx), ey = point.y - (from.y + t * dy);
    const distance = Math.hypot(ex, ey);
    if (!best || distance < best.distance) best = { distance, signedOffset: (dx * ey - dy * ex) / Math.sqrt(lengthSquared) };
  }
  return best;
}

function weightedQuantile(entries, q, totalMass) {
  if (!entries.length || totalMass <= 0) return null;
  const target = totalMass * q;
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (cumulative >= target) return entry.distance;
  }
  return entries.at(-1).distance;
}

async function sourceHashes() {
  const files = [...SOURCE_FILES.map(path => new URL(path, import.meta.url)), SCRIPT_URL];
  return Object.fromEntries(await Promise.all(files.map(async url => [relative(ROOT, fileURLToPath(url)).replaceAll('\\', '/'),
    HASH(await readFile(url))])));
}

function pathLength(path) {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) total += Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
  return total;
}
function sum(values) { let total = 0; for (const value of values) total += value; return total; }
function mean(values) { return values.length ? sum(values) / values.length : 0; }
function normalize(values) {
  const max = Math.max(...values);
  return max > 0 ? values.map(value => value / max) : values.map(() => 0);
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function clamp01(value) { return clamp(value, 0, 1); }
function wrapAngle(value) { return Math.atan2(Math.sin(value), Math.cos(value)); }

const mainPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (mainPath === fileURLToPath(import.meta.url)) {
  liveFields.clear();
  const result = await runSpatialFieldPass();
  process.stdout.write(`${JSON.stringify({ output: relative(ROOT, OUTPUT),
    defaultRepresentationSensitivityConfirmed: result.defaultRepresentationSensitivityConfirmed,
    gaussianDisagreements: result.gaussianPhaseDisagreement.disagreementCount,
    cicCandidateOutcome: result.cicCandidateOutcome })}\n`);
}
