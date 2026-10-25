import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';
import {
  CHECKPOINTS, DOSE_SCALE, DT, createController, executeScenario, initialFingerprint, stateFingerprint
} from './ant-316-gaussian-dose-unit-movement-shadow.js';

export const SEEDS = Object.freeze([20261005, 20261006, 20261007]);
export const SECONDS = 600;
export const TICK_RATE = 60;
export const AMOUNT_PER_DISTANCE = 4.5;
export const BASELINE_FACTOR = 0.5;
export const REINFORCEMENT_GAIN = 5;
export const ADHERENCE_EXPONENT = 2;
export const HISTOGRAM_BINS = 40;
export const HIGH_ADHERENCE = 0.75;
export const OCCUPANCY_SIZE = 64;
const OCCUPANCY_WINDOW = 30;
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-25-ant-g-adherence-coupling-control';
const G_PARENT = 'docs/ant/evidence/2026-10-24-ant-316-gaussian-dose-unit-movement-shadow';
const R0_PARENT = 'docs/ant/evidence/2026-10-25-ant-g-reinforcement-ablation';
const SOURCE_FILES = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/GaitController.js',
  'src/lib/agents/ant/BodyPoseController.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'scripts/ant-founder-evidence.js',
  'scripts/ant-316-gaussian-dose-unit-movement-shadow.js',
  'scripts/ant-g-reinforcement-ablation.js',
  'tests/ant-316-gaussian-dose-unit-movement-shadow.test.js'
];

const original = {
  init: AntController.prototype.init,
  tick: AntController.prototype.tick,
  updateIntention: AntController.prototype.updateIntention,
  destroy: AntController.prototype.destroy,
  advance: GasterDeposition.prototype.advance
};
const runByController = new WeakMap();
const ownerByDeposition = new WeakMap();
let activeRun = null;

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function fileHash(path) { return hash(await readFile(path)); }
function clone(value) { return structuredClone(value); }
function sum(values) { let out = 0; for (const value of values) out += value; return out; }
function kahan(values) {
  let total = 0, correction = 0;
  for (const value of values) {
    const adjusted = value - correction, next = total + adjusted;
    correction = (next - total) - adjusted; total = next;
  }
  return total;
}

export async function auditTickOrder() {
  const controller = (await readFile(resolve(ROOT, 'src/lib/agents/ant/AntController.js'), 'utf8')).replaceAll('\r\n', '\n');
  const occupancy = (await readFile(resolve(ROOT, 'src/lib/agents/ant/LocalOccupancy.js'), 'utf8')).replaceAll('\r\n', '\n');
  const positions = [
    controller.indexOf('const localTrails = current.map'),
    controller.indexOf('this.updateIntention(current[index]'),
    controller.indexOf('const displacements = current.map'),
    controller.indexOf('const collisionScales = this.occupancy.constrainDisplacements(current, displacements)'),
    controller.indexOf('this.applyDeposits(this.gasterDeposition.advance('),
    controller.indexOf('const births = this.trailPlateBirth.advance({'),
    controller.indexOf('this.colonyActivation.advance(this.field, dt)'),
    controller.indexOf('this.syncRecruitment();', controller.indexOf('this.colonyActivation.advance(this.field, dt)'))
  ];
  assert(positions.every(position => position >= 0));
  assert(positions.every((position, index) => index === 0 || positions[index - 1] < position),
    'all sensing/intent and movement constraints precede writes; birth/activation/recruitment follow');
  const start = occupancy.indexOf('constrainDisplacements(agents, displacements) {');
  const end = occupancy.indexOf('\n  }\n}', start);
  assert(start >= 0 && end > start);
  const body = occupancy.slice(start, end);
  assert(!body.includes('depositionMultiplier') && !body.includes('field.sample'),
    'collision scaling does not consume allocation or pheromone values');
  return { controllerSourceSha256: hash(controller), occupancySourceSha256: hash(occupancy),
    orderedStages: ['all local field reads', 'all intentions/wide reads', 'all displacements', 'collision scales',
      'original movement/deposition/contact loop', 'Plate birth', 'colony activation', 'recruitment'],
    collisionConstraintReadsDepositionMultiplier: false, collisionConstraintReadsField: false,
    observedEndpointFormulaCopiedFromController: true };
}

export function baselineMultiplier(E) { return BASELINE_FACTOR * (0.75 + 0.25 * E); }
export function reinforcementMultiplier(A) { return REINFORCEMENT_GAIN * A ** ADHERENCE_EXPONENT; }
export function sourceSecondIndex(tick) { return Math.floor((tick - 1) / TICK_RATE); }
export function computeTickBudget(chunks) {
  const moving = chunks.filter(({ distance }) => distance > 0);
  const travel = kahan(moving.map(item => item.distance));
  const budget = kahan(moving.map(item => item.distance * AMOUNT_PER_DISTANCE
    * reinforcementMultiplier(item.A)));
  const uniform = travel > 0 && budget > 0 ? budget / (AMOUNT_PER_DISTANCE * travel) : 0;
  const delivered = kahan(moving.map(item => item.distance * AMOUNT_PER_DISTANCE * uniform));
  const operationCount = moving.length * 12 + 20;
  const unitRoundoff = Number.EPSILON / 2;
  const gamma = operationCount * unitRoundoff / (1 - operationCount * unitRoundoff);
  const bound = gamma * (Math.abs(budget) + Math.abs(delivered));
  return { travel, budget, uniform, delivered, residual: delivered - budget, bound,
    movingAnts: moving.length, operationCount };
}

export function observedSegmentEnd(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  let fraction = 1;
  if (to.x < 0) fraction = Math.min(fraction, -from.x / dx);
  else if (to.x > 1) fraction = Math.min(fraction, (1 - from.x) / dx);
  if (to.y < 0) fraction = Math.min(fraction, -from.y / dy);
  else if (to.y > 1) fraction = Math.min(fraction, (1 - from.y) / dy);
  return { x: Math.max(0, Math.min(1, from.x + dx * fraction)),
    y: Math.max(0, Math.min(1, from.y + dy * fraction)) };
}

function emptySourceSecond(second) {
  return { second, chunks: 0, movingAnts: 0, travel: 0, baselineDose: 0,
    reinforcementDose: 0, totalDose: 0, highATravel: 0, highAReinforcementDose: 0,
    travelByABin: Array(HISTOGRAM_BINS).fill(0), reinforcementByABin: Array(HISTOGRAM_BINS).fill(0),
    E: { count: 0, sum: 0, bins: Array(HISTOGRAM_BINS).fill(0) },
    A: { count: 0, sum: 0, bins: Array(HISTOGRAM_BINS).fill(0) },
    A2: { count: 0, sum: 0, bins: Array(HISTOGRAM_BINS).fill(0) }, uniforms: [], ticks: [] };
}

function addHistogram(histogram, value) {
  histogram.count += 1; histogram.sum += value;
  histogram.bins[Math.min(HISTOGRAM_BINS - 1, Math.floor(value * HISTOGRAM_BINS))] += 1;
}

function createOccupancyObserver() {
  return { tick: 0, cumulative: new Uint32Array(OCCUPANCY_SIZE ** 2),
    current: new Uint32Array(OCCUPANCY_SIZE ** 2), recent: new Uint32Array(OCCUPANCY_SIZE ** 2), buckets: [] };
}

export function occupancyStats(values) {
  let total = 0, entropy = 0, occupied = 0;
  for (const value of values) { total += value; if (value > 0) occupied += 1; }
  if (total > 0) for (const value of values) if (value > 0) {
    const p = value / total; entropy -= p * Math.log(p);
  }
  const sorted = Array.from(values).sort((a, b) => b - a);
  const topCount = Math.ceil(sorted.length * 0.1);
  let topMass = 0;
  for (let i = 0; i < topCount; i += 1) topMass += sorted[i];
  return { coverage: occupied / values.length,
    normalizedEntropy: total > 0 ? entropy / Math.log(values.length) : null,
    top10PercentMassShare: total > 0 ? topMass / total : null };
}

function observeOccupancy(run, agents) {
  const observer = run.occupancy;
  for (const agent of agents) {
    const x = Math.max(0, Math.min(1, agent.x)), y = Math.max(0, Math.min(1, agent.y));
    const index = Math.round(y * (OCCUPANCY_SIZE - 1)) * OCCUPANCY_SIZE
      + Math.round(x * (OCCUPANCY_SIZE - 1));
    observer.cumulative[index] += 1; observer.current[index] += 1;
  }
  observer.tick += 1;
  if (observer.tick % TICK_RATE !== 0) return null;
  const second = observer.tick / TICK_RATE, bucket = observer.current.slice();
  observer.buckets.push(bucket);
  for (let i = 0; i < observer.recent.length; i += 1) observer.recent[i] += bucket[i];
  if (observer.buckets.length > OCCUPANCY_WINDOW) {
    const expired = observer.buckets.shift();
    for (let i = 0; i < observer.recent.length; i += 1) observer.recent[i] -= expired[i];
  }
  const entry = { second, cumulative: occupancyStats(observer.cumulative),
    recent30s: observer.buckets.length === OCCUPANCY_WINDOW ? occupancyStats(observer.recent) : null };
  run.occupancyPerSecond.push(entry);
  if (CHECKPOINTS.includes(second)) run.occupancyCheckpoints.push({ ...entry,
    cumulativeAntSeconds: Array.from(observer.cumulative, value => value * DT),
    recent30sAntSeconds: Array.from(observer.recent, value => value * DT) });
  observer.current.fill(0);
  return entry;
}

function predictedTravel(agent, displacement, scale) {
  const from = { x: agent.x, y: agent.y };
  const proposed = { x: from.x + displacement.x * scale, y: from.y + displacement.y * scale };
  const exits = proposed.x < 0 || proposed.x > 1 || proposed.y < 0 || proposed.y > 1;
  const to = exits ? observedSegmentEnd(from, proposed) : proposed;
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function makeRun({ seed, arm, observation = true }) {
  return { seed, arm, observation, controller: null, tick: 0, current: null,
    sourceSeconds: Array.from({ length: SECONDS }, (_, index) => emptySourceSecond(index + 1)),
    occupancy: createOccupancyObserver(), occupancyPerSecond: [], occupancyCheckpoints: [],
    actualTravelMismatchCount: 0, rateMismatchCount: 0,
    maxTravelError: 0, maxRateError: 0, maxBudgetResidual: 0, maxBudgetBound: 0,
    pending: null, sourceChunks: 0 };
}

AntController.prototype.init = async function hControlInit(...args) {
  const result = await original.init.apply(this, args);
  if (!activeRun) return result;
  const run = activeRun;
  assert.equal(this.field.width, 316); assert.equal(this.field.height, 316);
  assert.equal(this.field.doseScale, DOSE_SCALE);
  assert.equal(this.state.pheromone.halfLifeSeconds, 15);
  assert.equal(this.state.pheromone.amountPerUnitDistance, AMOUNT_PER_DISTANCE);
  assert.equal(this.state.pheromone.radius, 0.0045);
  assert.equal(this.state.pheromone.reinforcementGain, REINFORCEMENT_GAIN);
  run.controller = this; runByController.set(this, run); ownerByDeposition.set(this.gasterDeposition, this);
  const constrain = this.occupancy.constrainDisplacements.bind(this.occupancy);
  this.occupancy.constrainDisplacements = (agents, displacements) => {
    const scales = constrain(agents, displacements);
    const tick = run.current;
    assert(tick, 'collision scaling occurs within the active simulation tick');
    assert.equal(tick.constrainCalls, 0, 'one movement constraint pass per tick');
    tick.constrainCalls += 1;
    const chunks = agents.map((agent, index) => {
      const trail = tick.trailByAnt.get(agent.id);
      assert(trail, 'post-intention E/A exists for every current ant');
      const distance = predictedTravel(agent, displacements[index], scales[index]);
      return { id: agent.id, distance, E: trail.E, A: trail.A,
        baseline: distance * AMOUNT_PER_DISTANCE * baselineMultiplier(trail.E),
        intactReinforcement: distance * AMOUNT_PER_DISTANCE * reinforcementMultiplier(trail.A),
        originalMultiplier: displacements[index].depositionMultiplier };
    });
    const budget = computeTickBudget(chunks);
    const source = run.sourceSeconds[sourceSecondIndex(run.tick)];
    assert(source, 'source ledger stays within the frozen replay');
    const baseline = kahan(chunks.map(item => item.baseline));
    const delivered = run.arm === 'H' ? budget.delivered
      : kahan(chunks.map(item => item.intactReinforcement));
    const total = baseline + delivered;
    const ledgerTick = { tick: run.tick, movingAnts: budget.movingAnts, travel: budget.travel,
      baselineBudget: baseline, intactLawReinforcementBudget: budget.budget,
      deliveredReinforcementBudget: delivered, totalBudget: total,
      uniformMultiplier: run.arm === 'H' ? budget.uniform : null,
      residual: delivered - budget.budget, bound: budget.bound };
    source.chunks += budget.movingAnts; source.movingAnts += budget.movingAnts;
    source.travel += budget.travel; source.baselineDose += baseline;
    source.reinforcementDose += delivered; source.totalDose += total;
    source.uniforms.push(run.arm === 'H' ? budget.uniform : null);
    source.ticks.push(ledgerTick);
    run.sourceChunks += budget.movingAnts;
    run.maxBudgetResidual = Math.max(run.maxBudgetResidual, Math.abs(ledgerTick.residual));
    run.maxBudgetBound = Math.max(run.maxBudgetBound, budget.bound);
    if (run.arm === 'H') assert(Math.abs(ledgerTick.residual) <= budget.bound,
      'H reinforcement budget closes within the per-tick derived roundoff bound');

    const highBin = Math.ceil(HIGH_ADHERENCE * HISTOGRAM_BINS);
    for (const item of chunks) {
      if (item.distance <= 0) continue;
      const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor(item.A * HISTOGRAM_BINS));
      source.travelByABin[bin] += item.distance;
      const reinf = run.arm === 'H' ? item.distance * AMOUNT_PER_DISTANCE * budget.uniform
        : item.intactReinforcement;
      source.reinforcementByABin[bin] += reinf;
      if (bin >= highBin) {
        source.highATravel += item.distance;
        source.highAReinforcementDose += reinf;
      }
    }
    tick.expectedByAnt = new Map(chunks.map((item, index) => {
      const multiplier = run.arm === 'H'
        ? baselineMultiplier(item.E) + budget.uniform
        : item.originalMultiplier;
      if (run.arm === 'H') displacements[index].depositionMultiplier = multiplier;
      const expectedRate = this.state.pheromone.amountPerUnitDistance * multiplier;
      return [item.id, { distance: item.distance, expectedRate, seen: false }];
    }));
    tick.budget = budget;
    return scales;
  };
  return result;
};

AntController.prototype.updateIntention = function hControlIntention(agent, agents, occupancy, dt, localTrail) {
  const result = original.updateIntention.call(this, agent, agents, occupancy, dt, localTrail);
  const run = runByController.get(this), tick = run?.current;
  if (tick) {
    assert(Number.isFinite(localTrail?.strength) && Number.isFinite(agent.trailAdherence));
    const trail = { E: localTrail.strength, A: agent.trailAdherence };
    tick.trailByAnt.set(agent.id, trail);
    if (run.observation) {
      const second = run.sourceSeconds[sourceSecondIndex(run.tick)];
      addHistogram(second.E, trail.E); addHistogram(second.A, trail.A); addHistogram(second.A2, trail.A ** 2);
    }
  }
  return result;
};

AntController.prototype.tick = function hControlTick(dt) {
  const run = runByController.get(this);
  if (!run) return original.tick.call(this, dt);
  run.tick += 1;
  const tick = run.current = { trailByAnt: new Map(), expectedByAnt: new Map(), actualByAnt: new Set(), constrainCalls: 0 };
  try {
    const result = original.tick.call(this, dt);
    assert.equal(tick.constrainCalls, 1, 'collision scales were captured once');
    assert.equal(tick.actualByAnt.size, tick.expectedByAnt.size, "each ant's actual deposition call was observed");
    for (const [id, expected] of tick.expectedByAnt) assert(expected.seen, 'actual chunk seen for ' + id);
    observeOccupancy(run, this.agents);
    return result;
  } finally { run.current = null; }
};

GasterDeposition.prototype.advance = function hControlAdvance(antId, travelledDistance, fromRear, toRear, rate) {
  const owner = ownerByDeposition.get(this), run = owner && runByController.get(owner), tick = run?.current;
  if (tick) {
    const expected = tick.expectedByAnt.get(antId);
    assert(expected, 'deposition call matches a current ant');
    assert.equal(expected.seen, false, 'one deposition advance per current ant');
    const travelError = Math.abs(expected.distance - travelledDistance);
    run.maxTravelError = Math.max(run.maxTravelError, travelError);
    if (expected.distance !== travelledDistance) run.actualTravelMismatchCount += 1;
    assert.equal(expected.distance, travelledDistance, 'precomputed post-collision travel exactly matches controller measurement');
    const rateError = Math.abs(expected.expectedRate - rate);
    run.maxRateError = Math.max(run.maxRateError, rateError);
    if (expected.expectedRate !== rate) run.rateMismatchCount += 1;
    assert.equal(expected.expectedRate, rate, 'G/H per-distance source matches the actual deposition call');
    expected.seen = true; tick.actualByAnt.add(antId);
  }
  return original.advance.call(this, antId, travelledDistance, fromRear, toRear, rate);
};

AntController.prototype.destroy = async function hControlDestroy(...args) {
  const run = runByController.get(this);
  if (run && !run.pending) {
    let amount = 0, distance = 0;
    for (const state of this.gasterDeposition.ants.values()) { amount += state.amount; distance += state.distance; }
    run.pending = { amount, distance, antCount: this.gasterDeposition.ants.size };
  }
  return original.destroy.apply(this, args);
};

function sourceThrough(secondsData, end) {
  const records = secondsData.slice(0, end);
  const baseline = kahan(records.map(item => item.baselineDose));
  const reinforcement = kahan(records.map(item => item.reinforcementDose));
  const total = baseline + reinforcement;
  const travel = kahan(records.map(item => item.travel));
  const travelByA = Array(HISTOGRAM_BINS).fill(0), reinforcementByA = Array(HISTOGRAM_BINS).fill(0);
  for (const record of records) for (let bin = 0; bin < HISTOGRAM_BINS; bin += 1) {
    travelByA[bin] += record.travelByABin[bin];
    reinforcementByA[bin] += record.reinforcementByABin[bin];
  }
  const firstHighBin = Math.ceil(HIGH_ADHERENCE * HISTOGRAM_BINS);
  const highTravel = sum(travelByA.slice(firstHighBin));
  const highReinforcement = sum(reinforcementByA.slice(firstHighBin));
  return { throughSeconds: end, chunks: records.reduce((n, item) => n + item.chunks, 0), travel,
    baselineDose: baseline, reinforcementDose: reinforcement, totalDose: total,
    reinforcementShare: total ? reinforcement / total : null,
    baselineDosePerTravel: travel ? baseline / travel : null,
    reinforcementDosePerTravel: travel ? reinforcement / travel : null,
    totalDosePerTravel: travel ? total / travel : null,
    scaled: { baseline: baseline * DOSE_SCALE, reinforcement: reinforcement * DOSE_SCALE,
      total: total * DOSE_SCALE },
    highAdherence: { threshold: HIGH_ADHERENCE, travel: highTravel,
      travelShare: travel ? highTravel / travel : null,
      reinforcementDose: highReinforcement,
      reinforcementShare: reinforcement ? highReinforcement / reinforcement : null },
    travelByA, reinforcementByA,
    E: mergeHistograms(records.map(item => item.E)), A: mergeHistograms(records.map(item => item.A)),
    A2: mergeHistograms(records.map(item => item.A2)) };
}

function mergeHistograms(histograms) {
  const result = { count: 0, sum: 0, bins: Array(HISTOGRAM_BINS).fill(0) };
  for (const histogram of histograms) {
    result.count += histogram.count; result.sum += histogram.sum;
    for (let i = 0; i < HISTOGRAM_BINS; i += 1) result.bins[i] += histogram.bins[i];
  }
  return { ...result, mean: result.count ? result.sum / result.count : null };
}

function makeSourceArtifact(run, result) {
  const checkpoints = CHECKPOINTS.map(seconds => sourceThrough(run.sourceSeconds, seconds));
  const total = sourceThrough(run.sourceSeconds, SECONDS);
  const pendingUnscaled = run.pending?.amount || 0;
  const fieldRequestedScaled = result.fieldWrites.requestedDose;
  const accounted = fieldRequestedScaled / DOSE_SCALE + pendingUnscaled;
  const residual = total.totalDose - accounted;
  const terms = total.chunks * 8 + result.fieldWrites.pointWrites * 4 + (run.pending?.antCount || 0) * 2 + 32;
  const u = Number.EPSILON / 2, gamma = terms * u / (1 - terms * u);
  const closureBound = gamma * (Math.abs(total.totalDose) + Math.abs(accounted));
  assert(Math.abs(residual) <= closureBound, 'accrued source dose closes against emitted field requests plus pending dabs');
  return { seed: run.seed, arm: run.arm, seconds: SECONDS, tickRate: TICK_RATE,
    highAdherenceRule: 'A >= 0.75; 40 bins over [0,1]', doseScale: DOSE_SCALE,
    total, checkpoints, perSecond: run.sourceSeconds,
    uniformMultiplier: run.arm === 'H' ? summarizeUniform(run.sourceSeconds) : null,
    chunkAccounting: { accruedUnscaledChunkDose: total.totalDose, baselineDose: total.baselineDose,
      reinforcementDose: total.reinforcementDose, fieldRequestedDoseScaled: fieldRequestedScaled,
      fieldRequestedDoseNormalized: fieldRequestedScaled / DOSE_SCALE, pendingUnscaledDabDose: pendingUnscaled,
      accountedUnscaledDose: accounted, residual, derivedFloatingPointBound: closureBound,
      withinDerivedBound: Math.abs(residual) <= closureBound,
      boundaryRejectedDoseScaled: result.fieldWrites.boundaryRejectedDose,
      fieldAcceptedDoseScaled: result.fieldWrites.acceptedDose,
      saturationLossScaled: result.fieldWrites.saturationLoss,
      capTouchCount: result.fieldWrites.capTouchCount, saturatedUpdateCount: result.fieldWrites.saturatedUpdateCount,
      pendingDab: run.pending },
    occupancyPerSecond: run.occupancyPerSecond, occupancyCheckpoints: run.occupancyCheckpoints,
    observer: { addedRngCalls: 0, actualTravelMismatchCount: run.actualTravelMismatchCount,
      maxTravelError: run.maxTravelError, rateMismatchCount: run.rateMismatchCount,
      maxRateError: run.maxRateError, maxBudgetResidual: run.maxBudgetResidual,
      maxBudgetBound: run.maxBudgetBound, sourceChunks: run.sourceChunks } };
}

function summarizeUniform(secondsData) {
  const values = secondsData.flatMap(second => second.uniforms).filter(Number.isFinite).sort((a, b) => a - b);
  const at = p => values.length ? values[Math.floor((values.length - 1) * p)] : null;
  return { count: values.length, min: values[0] ?? null, p50: at(0.5), p90: at(0.9), p99: at(0.99),
    max: values.at(-1) ?? null, mean: values.length ? kahan(values) / values.length : null };
}

function deterministicGzip(value) { return gzipSync(JSON.stringify(value), { level: 6, mtime: 0 }); }
async function writeGzip(path, value) { const bytes = deterministicGzip(value); await writeFile(path, bytes); return hash(bytes); }
async function readGzip(path) { return JSON.parse(gunzipSync(await readFile(path))); }
function sourceBin(value) { return Math.min(HISTOGRAM_BINS - 1, Math.floor(value * HISTOGRAM_BINS)); }

function normalizeResult(result) { const value = JSON.parse(JSON.stringify(result)); delete value.wallSeconds; return value; }

function withinDerivedRoundoff(a, b, operationCount) {
  const unitRoundoff = Number.EPSILON / 2;
  const gamma = operationCount * unitRoundoff / (1 - operationCount * unitRoundoff);
  return Math.abs(a - b) <= gamma * (Math.abs(a) + Math.abs(b));
}

async function verifyManifest(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'SHA256SUMS.json'), 'utf8'));
  for (const [name, expected] of Object.entries(manifest)) assert.equal(await fileHash(join(directory, name)), expected, name + ' manifest SHA');
  return { entries: Object.keys(manifest).length, manifestSha256: await fileHash(join(directory, 'SHA256SUMS.json')) };
}

async function parentInputs() {
  const movementData = resolve(ROOT, G_PARENT, 'data');
  const r0Data = resolve(ROOT, R0_PARENT, 'data');
  const movementManifest = await verifyManifest(movementData);
  const r0Manifest = await verifyManifest(r0Data);
  const movementSummary = JSON.parse(await readFile(join(movementData, 'SUMMARY.json'), 'utf8'));
  const r0Summary = JSON.parse(await readFile(join(r0Data, 'SUMMARY.json'), 'utf8'));
  assert.equal(movementSummary.freshMain, '8c60e4bba3bd5b476300e90a2936bfebd1f831c2');
  assert.deepEqual(movementSummary.seeds, SEEDS); assert.deepEqual(movementSummary.arms, ['C', 'F', 'G']);
  assert.equal(movementSummary.seconds, SECONDS); assert.equal(movementSummary.tickRate, TICK_RATE);
  assert.deepEqual(r0Summary.seeds, SEEDS); assert.equal(r0Summary.seconds, SECONDS);
  const gBySeed = new Map(movementSummary.scenarios.map(item => [item.seed, item.arms.find(arm => arm.arm === 'G')]));
  const cRaw = new Map();
  for (const seed of SEEDS) {
    const c = movementSummary.scenarios.find(item => item.seed === seed).arms.find(arm => arm.arm === 'C');
    const raw = await readGzip(join(movementData, c.timelineFile));
    assert(Array.isArray(raw.earlyRouteMask) && raw.earlyRouteMask.length === 96 * 96);
    cRaw.set(seed, Uint8Array.from(raw.earlyRouteMask));
    const priorG = await readGzip(join(r0Data, 'seed' + seed + '-G-source-accounting.json.gz'));
    assert.equal(priorG.arm, 'G');
  }
  return { movementData, r0Data, movementSummary, r0Summary, gBySeed, cEarlyMasks: cRaw,
    manifests: { movement: movementManifest, gR0: r0Manifest } };
}

async function runOne(seed, kind, output, earlyMask, seconds = SECONDS, observation = true) {
  const run = makeRun({ seed, arm: kind, observation });
  activeRun = run;
  try {
    const result = await executeScenario(seed, 'G', seconds, output, earlyMask);
    assert.equal(run.tick, seconds * TICK_RATE);
    assert.equal(run.actualTravelMismatchCount, 0);
    assert.equal(run.rateMismatchCount, 0);
    assert.equal(run.maxTravelError, 0); assert.equal(run.maxRateError, 0);
    assert.equal(run.occupancy.tick, seconds * TICK_RATE);
    const source = makeSourceArtifact(run, result);
    activeRun = null;
    return { run, result, source };
  } catch (error) {
    activeRun = null;
    throw error;
  }
}

async function relabelHFiles(result, output, source) {
  const names = [result.timelineFile, ...result.checkpointMapFiles];
  const renamed = [];
  for (const oldName of names) {
    const oldPath = join(output, oldName), payload = JSON.parse(gunzipSync(await readFile(oldPath)));
    assert.equal(payload.arm, 'G'); payload.arm = 'H';
    if (payload.occupancy) {
      const corrected = source.occupancyCheckpoints.find(item => item.second === payload.seconds);
      assert(corrected, 'independent 60 Hz occupancy map exists at each checkpoint');
      payload.occupancy.cumulativeAntSeconds = corrected.cumulativeAntSeconds;
      payload.occupancy.recent30sAntSeconds = corrected.recent30sAntSeconds;
    }
    const newName = oldName.replaceAll('-G-', '-H-');
    await writeGzip(join(output, newName), payload);
    await rm(oldPath);
    renamed.push(newName);
  }
  result.arm = 'H';
  result.timelineFile = result.timelineFile.replaceAll('-G-', '-H-');
  result.checkpointMapFiles = result.checkpointMapFiles.map(name => name.replaceAll('-G-', '-H-'));
  for (const point of result.checkpoints) point.maps = point.maps.replaceAll('-G-', '-H-');
  result.sourceConfig = { ...result.sourceConfig, reinforcementAllocation: 'tick-total-preserving uniform by actual travel' };
  return renamed;
}

async function copyFiles(names, from, to) {
  for (const name of names) await writeFile(join(to, name), await readFile(join(from, name)));
}

function compareCorrectedOccupancy(result, source) {
  for (const point of result.checkpoints) {
    const independent = source.occupancyCheckpoints.find(item => item.second === point.seconds);
    assert(independent, 'corrected checkpoint');
    assert.equal(point.occupancy.cumulativeCoverage, independent.cumulative.coverage,
      'cumulative coverage matches independent 60 Hz observer');
    assert.equal(point.occupancy.cumulative.normalizedEntropy, independent.cumulative.normalizedEntropy,
      'cumulative entropy matches independent 60 Hz observer');
  }
}

async function observerParity(seed, arm, ticks = 120) {
  const enabled = createController(seed, 'G', { observe: true });
  const disabled = createController(seed, 'G', { observe: false });
  const first = makeRun({ seed, arm, observation: true }), second = makeRun({ seed, arm, observation: false });
  try {
    activeRun = first; await enabled.controller.init();
    activeRun = second; await disabled.controller.init();
    assert.equal(initialFingerprint(enabled), initialFingerprint(disabled));
    for (let i = 0; i < ticks; i += 1) {
      activeRun = first; enabled.controller.tick(DT);
      activeRun = second; disabled.controller.tick(DT);
      assert.equal(stateFingerprint(enabled), stateFingerprint(disabled), arm + ' observer parity tick ' + (i + 1));
      assert.equal(enabled.rngCalls, disabled.rngCalls, arm + ' observer RNG parity');
      assert.equal(first.sourceSeconds[0].reinforcementDose, second.sourceSeconds[0].reinforcementDose);
    }
    assert.equal(first.actualTravelMismatchCount + second.actualTravelMismatchCount, 0);
    return { seed, arm, ticks, equalEveryTick: true, initialStateEqual: true,
      rngCalls: enabled.rngCalls, observerAddedRngCalls: 0,
      observedCounters: { enabled: first.sourceChunks, disabled: second.sourceChunks } };
  } finally {
    activeRun = null;
    await enabled.controller.destroy(); await disabled.controller.destroy();
  }
}

export async function selfChecks() {
  const chunks = [{ distance: 0.02, A: 0.2 }, { distance: 0.03, A: 0.8 }, { distance: 0, A: 1 }];
  const budget = computeTickBudget(chunks);
  assert(budget.budget > 0 && budget.uniform > 0);
  assert(Math.abs(budget.residual) <= budget.bound);
  assert.equal(computeTickBudget([{ distance: 0, A: 1 }]).uniform, 0);
  assert.equal(computeTickBudget([{ distance: 0.1, A: 0 }]).uniform, 0);
  assert.deepEqual(observedSegmentEnd({ x: 0.9, y: 0.2 }, { x: 1.1, y: 0.2 }), { x: 1, y: 0.2 });
  assert.equal(occupancyStats(new Uint32Array(16)).coverage, 0);
  assert.equal(sourceBin(0.75), 30);
  return { derivedUniformBudget: { budget: budget.budget, delivered: budget.delivered,
      residual: budget.residual, bound: budget.bound }, zeroTravelAndBudget: true,
    exitClip: 'passed', highAdherenceBin: sourceBin(0.75), observerRngCalls: 0 };
}

export async function runFullPass(outputDir) {
  const files = await readdir(outputDir).catch(() => []);
  assert.equal(files.length, 0, 'use a fresh evidence data directory');
  await mkdir(outputDir, { recursive: true });
  const parents = await parentInputs();
  const tickOrderAudit = await auditTickOrder();
  const sourceHashes = {};
  for (const path of SOURCE_FILES) sourceHashes[path] = await fileHash(resolve(ROOT, path));
  sourceHashes['docs/ant/README.md'] = await fileHash(resolve(ROOT, 'docs/ant/README.md'));
  sourceHashes['scripts/ant-g-adherence-coupling-control.js'] = await fileHash(resolve(ROOT,
    'scripts/ant-g-adherence-coupling-control.js'));
  sourceHashes['tests/ant-g-adherence-coupling-control.test.js'] = await fileHash(resolve(ROOT,
    'tests/ant-g-adherence-coupling-control.test.js'));
  for (const [path, expected] of Object.entries(parents.movementSummary.sourceHashes)) {
    sourceHashes[path] ??= await fileHash(resolve(ROOT, path));
    assert.equal(sourceHashes[path], expected, 'current source matches validated G parent: ' + path);
  }
  sourceHashes['docs/ant/evidence/2026-10-25-ant-g-adherence-coupling-control/PREREGISTRATION.md'] =
    await fileHash(resolve(ROOT, PACKAGE, 'PREREGISTRATION.md'));
  sourceHashes['docs/ant/evidence/2026-10-25-ant-g-adherence-coupling-control/PREREGISTRATION-AMENDMENT.md'] =
    await fileHash(resolve(ROOT, PACKAGE, 'PREREGISTRATION-AMENDMENT.md'));
  const preregHashes = { preregistration: sourceHashes['docs/ant/evidence/2026-10-25-ant-g-adherence-coupling-control/PREREGISTRATION.md'],
    amendment: sourceHashes['docs/ant/evidence/2026-10-25-ant-g-adherence-coupling-control/PREREGISTRATION-AMENDMENT.md'] };
  const sourceReceipt = JSON.parse(await readFile(resolve(ROOT, R0_PARENT, 'data/SOURCE-LAW-RECEIPT.json'), 'utf8'));
  assert.equal(sourceReceipt.productionGain, REINFORCEMENT_GAIN);
  assert.equal(sourceReceipt.amountPerUnitDistance, AMOUNT_PER_DISTANCE);
  assert.equal(sourceReceipt.scale, DOSE_SCALE);
  const scratch = await mkdtemp(join(tmpdir(), 'ant-g-h-control-'));
  const hScratch = await mkdtemp(join(tmpdir(), 'ant-h-control-'));
  const deterministicScratch = await mkdtemp(join(tmpdir(), 'ant-g-h-repeat-'));
  assert([scratch, hScratch, deterministicScratch].every(path => resolve(path).startsWith(resolve(tmpdir()))));
  const scenarios = [], sourceBySeed = new Map();
  const validation = { parentG: [], H: [], observerParity: [], deterministicRepeat: [] };
  try {
    for (const seed of SEEDS) {
      const earlyMask = parents.cEarlyMasks.get(seed);
      const parent = parents.gBySeed.get(seed);
      const parentG = await runOne(seed, 'G', scratch, earlyMask);
      assert.equal(parentG.result.initialStateSha256, parent.initialStateSha256);
      assert.deepEqual(normalizeResult(parentG.result), parent, 'buffer-equivalent G control result reproduces parent');
      const parentRaw = await readFile(join(parents.movementData, parent.timelineFile));
      const freshRaw = await readFile(join(scratch, parentG.result.timelineFile));
      assert(parentRaw.equals(freshRaw), 'G raw timeline gzip exactly matches parent');
      const mapChecks = [];
      for (const mapName of parentG.result.checkpointMapFiles) {
        const old = await readFile(join(parents.movementData, mapName));
        const fresh = await readFile(join(scratch, mapName));
        assert(old.equals(fresh), 'G checkpoint map gzip exactly matches parent: ' + mapName);
        mapChecks.push({ file: mapName, sha256: hash(old), byteEqual: true });
      }
      await copyFiles([parentG.result.timelineFile, ...parentG.result.checkpointMapFiles], scratch, outputDir);
      compareCorrectedOccupancy(parentG.result, parentG.source);
      const oldSource = await readGzip(join(parents.r0Data, 'seed' + seed + '-G-source-accounting.json.gz'));
      const sourceOperationCount = parentG.source.total.chunks * 16 + 32;
      assert(withinDerivedRoundoff(parentG.source.total.baselineDose,
        oldSource.checkpoints.at(-1).baselineDose, sourceOperationCount),
        'G baseline source total matches prior observer within derived accumulation bound');
      assert(withinDerivedRoundoff(parentG.source.total.reinforcementDose,
        oldSource.checkpoints.at(-1).reinforcementDose, sourceOperationCount),
        'G reinforcement source total matches prior observer within derived accumulation bound');
      assert.deepEqual(parentG.source.occupancyPerSecond, oldSource.occupancyPerSecond,
        'corrected 60 Hz occupancy time series matches G-R0 source observer');
      const gSourceName = 'seed' + seed + '-G-source-accounting.json.gz';
      const gSourceSha = await writeGzip(join(outputDir, gSourceName), parentG.source);
      validation.parentG.push({ seed, resultExact: true, rawTimelineByteEqual: true, checkpointMaps: mapChecks,
        sourceTotalParity: true, correctedOccupancyMatchesR0Parent: true,
        sourceArtifact: { file: gSourceName, sha256: gSourceSha } });
      sourceBySeed.set(seed, { G: parentG.source });
      scenarios.push({ seed, initialStateSha256: parentG.result.initialStateSha256,
        arms: [parentG.result], sourceFiles: [gSourceName] });
    }

    for (const seed of SEEDS) validation.observerParity.push(await observerParity(seed, 'G'));

    for (const seed of SEEDS) {
      const parent = parents.gBySeed.get(seed);
      const scenario = scenarios.find(item => item.seed === seed);
      const H = await runOne(seed, 'H', hScratch, parents.cEarlyMasks.get(seed));
      assert.equal(H.result.initialStateSha256, parent.initialStateSha256, 'H starts at the same seed fingerprint');
      assert.equal(H.source.observer.actualTravelMismatchCount, 0);
      assert.equal(H.source.observer.rateMismatchCount, 0);
      assert.equal(H.source.observer.addedRngCalls, 0);
      compareCorrectedOccupancy(H.result, H.source);
      const hFiles = await relabelHFiles(H.result, hScratch, H.source);
      await copyFiles(hFiles, hScratch, outputDir);
      const hSourceName = 'seed' + seed + '-H-source-accounting.json.gz';
      const hSourceSha = await writeGzip(join(outputDir, hSourceName), H.source);
      sourceBySeed.get(seed).H = H.source;
      const observerChecks = [await observerParity(seed, 'H')];
      validation.H.push({ seed, initialStateSha256: H.result.initialStateSha256,
        ticks: H.result.ticks, perTickBudgetClosure: true, maxBudgetResidual: H.source.observer.maxBudgetResidual,
        maxBudgetBound: H.source.observer.maxBudgetBound,
        exactPostCollisionTravelMatch: true, exactPerDistanceRateMatch: true,
        correctedOccupancyMatchesRunnerCumulative: true, observerAddedRngCalls: 0,
        outputFiles: hFiles, sourceArtifact: { file: hSourceName, sha256: hSourceSha } });
      validation.observerParity.push(...observerChecks);
      scenario.arms.push(H.result); scenario.sourceFiles.push(hSourceName);
    }

    for (const seed of SEEDS) {
      const repeat = await runOne(seed, 'H', deterministicScratch, parents.cEarlyMasks.get(seed));
      await relabelHFiles(repeat.result, deterministicScratch, repeat.source);
      const primary = scenarios.find(item => item.seed === seed).arms.find(item => item.arm === 'H');
      assert.deepEqual(normalizeResult(repeat.result), normalizeResult(primary), 'deterministic H result');
      const repeatFiles = [repeat.result.timelineFile, ...repeat.result.checkpointMapFiles];
      const primaryFiles = [primary.timelineFile, ...primary.checkpointMapFiles];
      for (let i = 0; i < repeatFiles.length; i += 1) {
        const a = await readFile(join(deterministicScratch, repeatFiles[i]));
        const b = await readFile(join(outputDir, primaryFiles[i]));
        assert(a.equals(b), 'deterministic H raw/map bytes: ' + primaryFiles[i]);
      }
      const repeatSource = deterministicGzip(repeat.source);
      const primarySource = await readFile(join(outputDir, 'seed' + seed + '-H-source-accounting.json.gz'));
      assert(repeatSource.equals(primarySource), 'deterministic H source ledger: ' + seed);
      validation.deterministicRepeat.push({ seed, resultEqual: true, rawAndMapsByteEqual: true,
        sourceLedgerByteEqual: true });
    }

    const correctedTables = scenarios.map(scenario => {
      const g = scenario.arms[0], h = scenario.arms[1];
      return { seed: scenario.seed, initialStateSha256: scenario.initialStateSha256,
        checkpoints: CHECKPOINTS.map(seconds => {
          const gPoint = g.checkpoints.find(item => item.seconds === seconds);
          const hPoint = h.checkpoints.find(item => item.seconds === seconds);
          const gOcc = sourceBySeed.get(scenario.seed).G.occupancyCheckpoints
            .find(item => item.second === seconds);
          const hOcc = sourceBySeed.get(scenario.seed).H.occupancyCheckpoints
            .find(item => item.second === seconds);
          const sourceG = sourceBySeed.get(scenario.seed).G.checkpoints.find(item => item.throughSeconds === seconds);
          const sourceH = sourceBySeed.get(scenario.seed).H.checkpoints.find(item => item.throughSeconds === seconds);
          return { seconds, G: { population: gPoint.activePopulation, travel: gPoint.totalRealizedTravel,
            travelPerActiveAntSecond: gPoint.travelPerActiveAntSecond,
            cumulativeCoverage: gPoint.occupancy.cumulativeCoverage,
            cumulativeTop10Share: gPoint.occupancy.cumulative.top10PercentMassShare,
            recent30sCoverage: gOcc?.recent30s?.coverage ?? null,
            recent30sEntropy: gOcc?.recent30s?.normalizedEntropy ?? null,
            baselineDose: sourceG.baselineDose, reinforcementDose: sourceG.reinforcementDose,
            totalDose: sourceG.totalDose },
          H: { population: hPoint.activePopulation, travel: hPoint.totalRealizedTravel,
            travelPerActiveAntSecond: hPoint.travelPerActiveAntSecond,
            cumulativeCoverage: hPoint.occupancy.cumulativeCoverage,
            cumulativeTop10Share: hPoint.occupancy.cumulative.top10PercentMassShare,
            recent30sCoverage: hOcc?.recent30s?.coverage ?? null,
            recent30sEntropy: hOcc?.recent30s?.normalizedEntropy ?? null,
            baselineDose: sourceH.baselineDose, reinforcementDose: sourceH.reinforcementDose,
            totalDose: sourceH.totalDose } };
        }) };
    });
    const scientific = { schemaVersion: 1, freshMain: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2',
      parentTip: 'f1b03e8666f3b920524c458855ff59153156c710', preregistrationCommits: ['9d16d03', '0c2377d'],
      seeds: SEEDS, seconds: SECONDS, tickRate: TICK_RATE, checkpoints: CHECKPOINTS,
      candidate: { kind: 'tick-total-dose-preserving uniform reinforcement', grid: '316x316',
        scale: DOSE_SCALE, radius: 0.0045, sigma: 0.00225, baseline: '0.5*(0.75+0.25E)',
        intactReinforcement: '5*A^2', hReinforcement: 'U=B/(4.5*D)',
        G: 'per-ant amount 4.5*(baselineMultiplier + 5*A^2)',
        H: 'per-ant amount 4.5*(baselineMultiplier + sharedUniformMultiplier)' },
      provenance: { sourceHashes, parentManifests: parents.manifests, preregistrationSha256: preregHashes,
        tickOrderAudit,
        r0ValidationSha256: await fileHash(resolve(ROOT, R0_PARENT, 'data/VALIDATION.json')) },
      validation, correctedCheckpointTables: correctedTables,
      scenarios: scenarios.map(item => ({ seed: item.seed, initialStateSha256: item.initialStateSha256,
        arms: item.arms.map(normalizeResult), sourceFiles: item.sourceFiles })) };
    const summaryBytes = Buffer.from(JSON.stringify(scientific, null, 2) + '\n');
    await writeFile(join(outputDir, 'SUMMARY.json'), summaryBytes);
    const validationBytes = Buffer.from(JSON.stringify({ preregistration: preregHashes,
      tickOrderAudit,
      sourceAudit: 'tick-level uniform allocation was installed after exact collision scaling and before original commit/deposition loop',
      sourceUnchanged: true, scenarios: validation }, null, 2) + '\n');
    await writeFile(join(outputDir, 'VALIDATION.json'), validationBytes);
    return scientific;
  } finally {
    activeRun = null;
    await rm(scratch, { recursive: true, force: true });
    await rm(hScratch, { recursive: true, force: true });
    await rm(deterministicScratch, { recursive: true, force: true });
  }
}

async function main() {
  const args = new Map(process.argv.slice(2).map(arg => {
    const index = arg.indexOf('='); return index < 0 ? [arg, true] : [arg.slice(0, index), arg.slice(index + 1)];
  }));
  if (args.has('--selfcheck')) { console.log(JSON.stringify(await selfChecks(), null, 2)); return; }
  assert(args.has('--run'), 'pass --run to begin the preregistered natural replay');
  const output = resolve(String(args.get('--output') || resolve(ROOT, PACKAGE, 'data')));
  const result = await runFullPass(output);
  console.log(JSON.stringify({ output, scenarios: result.scenarios.length,
    validation: result.validation }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
