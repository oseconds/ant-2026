import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';
import {
  ARMS, CHECKPOINTS, DOSE_SCALE, DT, createController, executeScenario,
  initialFingerprint, stateFingerprint
} from './ant-316-gaussian-dose-unit-movement-shadow.js';
export { DOSE_SCALE };

export const SEEDS = Object.freeze([20261005, 20261006, 20261007]);
export const SECONDS = 600;
export const BASELINE_FACTOR = 0.5;
export const ADHERENCE_EXPONENT = 2;
export const AMOUNT_PER_DISTANCE = 4.5;
export const HISTOGRAM_BINS = 40;
export const HIGH_ADHERENCE = 0.75;
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OCCUPANCY_SIZE = 64;
const OCCUPANCY_WINDOW_SECONDS = 30;
const PACKAGE = 'docs/ant/evidence/2026-10-25-ant-g-reinforcement-ablation';
const PARENT = 'docs/ant/evidence/2026-10-24-ant-316-gaussian-dose-unit-movement-shadow';
const SOURCE_PARENT = 'docs/ant/evidence/2026-10-25-ant-g-deposition-source-decomposition';
const SOURCE_FILES = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'scripts/ant-founder-evidence.js',
  'tests/ant-316-gaussian-dose-unit-movement-shadow.test.js'
];
let activeArm = 'G';
let activeCapture = null;
const depositionOwners = new WeakMap();

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function fileHash(path) { return hash(await readFile(path)); }
function newSum() { return { sum: 0, correction: 0 }; }
function add(bucket, value) {
  const adjusted = value - bucket.correction;
  const next = bucket.sum + adjusted;
  bucket.correction = (next - bucket.sum) - adjusted;
  bucket.sum = next;
}
function histogram() { return { count: 0, sum: newSum(), bins: new Uint32Array(HISTOGRAM_BINS) }; }
function addHistogram(bucket, value) {
  assert(Number.isFinite(value), 'finite source observation');
  bucket.count += 1;
  add(bucket.sum, value);
  bucket.bins[Math.max(0, Math.min(HISTOGRAM_BINS - 1, Math.floor(value * HISTOGRAM_BINS)))] += 1;
}
function farHistogram() {
  return { count: 0, raw: newSum(), hill: newSum(), rawBins: new Uint32Array(HISTOGRAM_BINS),
    hillBins: new Uint32Array(HISTOGRAM_BINS) };
}
function emptySecond(second) {
  return { second, chunks: 0, travelled: newSum(), baseline: newSum(), reinforcement: newSum(), total: newSum(),
    E: histogram(), A: histogram(), A2: histogram(), far: farHistogram(),
    travelByA: Array.from({ length: HISTOGRAM_BINS }, newSum),
    baselineByA: Array.from({ length: HISTOGRAM_BINS }, newSum),
    reinforcementByA: Array.from({ length: HISTOGRAM_BINS }, newSum),
    rateMismatchCount: 0, missingTrailStateCount: 0, maxRateError: 0, maxChunkClosureError: 0 };
}
function captureFor(seed, arm, seconds = SECONDS) {
  return { seed, arm, seconds, secondsData: Array.from({ length: seconds }, (_, index) => emptySecond(index + 1)),
    controller: null, context: null, tick: 0, ablation: null, pending: null,
    sourceMismatchCount: 0, missingTrailStateCount: 0, maxRateError: 0, maxChunkClosureError: 0,
    occupancy: createOccupancyObserver(), occupancyPerSecond: [], occupancyCheckpoints: [] };
}
function activeSecond(capture) { return capture?.context ? capture.secondsData[capture.context.second - 1] : null; }

export function createOccupancyObserver() {
  return { tick: 0, cumulative: new Uint32Array(OCCUPANCY_SIZE ** 2), currentSecond: new Uint32Array(OCCUPANCY_SIZE ** 2),
    recent: new Uint32Array(OCCUPANCY_SIZE ** 2), buckets: [] };
}
export function occupancyStats(values) {
  let total = 0, entropy = 0, occupied = 0;
  for (const value of values) { total += value; if (value > 0) occupied += 1; }
  if (total > 0) for (const value of values) if (value > 0) { const p = value / total; entropy -= p * Math.log(p); }
  const sorted = Array.from(values).sort((a, b) => b - a);
  const topCount = Math.ceil(sorted.length * 0.1);
  let topMass = 0;
  for (let i = 0; i < topCount; i += 1) topMass += sorted[i];
  return { coverage: occupied / values.length, normalizedEntropy: total > 0 ? entropy / Math.log(values.length) : null,
    top10PercentMassShare: total > 0 ? topMass / total : null };
}
export function observeOccupancyTick(observer, agents) {
  for (const agent of agents) {
    const x = Math.max(0, Math.min(1, agent.x)), y = Math.max(0, Math.min(1, agent.y));
    const index = Math.round(y * (OCCUPANCY_SIZE - 1)) * OCCUPANCY_SIZE
      + Math.round(x * (OCCUPANCY_SIZE - 1));
    observer.cumulative[index] += 1;
    observer.currentSecond[index] += 1;
  }
  observer.tick += 1;
  if (observer.tick % 60 !== 0) return null;
  const second = observer.tick / 60, bucket = observer.currentSecond.slice();
  observer.buckets.push(bucket);
  for (let i = 0; i < observer.recent.length; i += 1) observer.recent[i] += bucket[i];
  if (observer.buckets.length > OCCUPANCY_WINDOW_SECONDS) {
    const expired = observer.buckets.shift();
    for (let i = 0; i < observer.recent.length; i += 1) observer.recent[i] -= expired[i];
  }
  const snapshot = { second, cumulative: occupancyStats(observer.cumulative),
    recent30s: observer.buckets.length === OCCUPANCY_WINDOW_SECONDS ? occupancyStats(observer.recent) : null };
  observer.currentSecond.fill(0);
  return snapshot;
}

const originalInit = AntController.prototype.init;
AntController.prototype.init = async function ablationInit(...args) {
  const before = this.state.pheromone.reinforcementGain;
  const result = await originalInit.apply(this, args);
  let after = before;
  if (activeArm === 'G-R0') {
    assert.equal(before, 5, 'G-R0 starts from the production gain before the declared override');
    this.state.pheromone.reinforcementGain = 0;
    after = this.state.pheromone.reinforcementGain;
  }
  if (activeCapture) activeCapture.ablation = { before, after, overrideApplied: activeArm === 'G-R0',
    afterNormalInitializationBeforeFirstTick: true };
  return result;
};

const originalTick = AntController.prototype.tick;
AntController.prototype.tick = function observedTick(dt) {
  const capture = activeCapture;
  if (!capture || (capture.controller && capture.controller !== this)) return originalTick.call(this, dt);
  if (!capture.controller) capture.controller = this;
  depositionOwners.set(this.gasterDeposition, this);
  capture.tick += 1;
  capture.context = { second: Math.ceil(capture.tick / 60), trailByAnt: new Map() };
  assert(capture.context.second <= capture.seconds, 'observer remains inside the frozen replay');
  try {
    const result = originalTick.call(this, dt);
    const occupancy = observeOccupancyTick(capture.occupancy, this.agents);
    if (occupancy) {
      capture.occupancyPerSecond.push(occupancy);
      if (CHECKPOINTS.includes(occupancy.second)) capture.occupancyCheckpoints.push(occupancy);
    }
    return result;
  }
  finally { capture.context = null; }
};

const originalIntention = AntController.prototype.updateIntention;
AntController.prototype.updateIntention = function observedIntention(agent, agents, occupancy, dt, localTrail) {
  const result = originalIntention.call(this, agent, agents, occupancy, dt, localTrail);
  const capture = activeCapture, bucket = activeSecond(capture);
  if (capture && capture.controller === this && bucket) {
    const E = localTrail?.strength, A = agent.trailAdherence;
    assert(Number.isFinite(E) && Number.isFinite(A) && E >= 0 && E <= 1 && A >= 0 && A <= 1);
    capture.context.trailByAnt.set(agent.id, { E, A });
    addHistogram(bucket.E, E); addHistogram(bucket.A, A); addHistogram(bucket.A2, A * A);
  }
  return result;
};

const originalSenseTrail = AntController.prototype.senseTrail;
AntController.prototype.senseTrail = function observedFarSensor(...args) {
  const value = originalSenseTrail.apply(this, args);
  const capture = activeCapture, bucket = activeSecond(capture);
  if (capture && capture.controller === this && bucket) {
    const response = hill(value);
    assert(Number.isFinite(value) && Number.isFinite(response));
    bucket.far.count += 1; add(bucket.far.raw, value); add(bucket.far.hill, response);
    bucket.far.rawBins[histogramIndex(value / 8)] += 1;
    bucket.far.hillBins[histogramIndex(response)] += 1;
  }
  return value;
};

const originalAdvance = GasterDeposition.prototype.advance;
GasterDeposition.prototype.advance = function observedAdvance(antId, travelledDistance, fromRear, toRear,
  amountPerUnitDistance) {
  const owner = depositionOwners.get(this), capture = activeCapture;
  if (capture && owner && capture.controller === owner && capture.context && travelledDistance > 0) {
    const trail = capture.context.trailByAnt.get(antId), bucket = activeSecond(capture);
    if (!trail) {
      capture.missingTrailStateCount += 1; bucket.missingTrailStateCount += 1;
    } else {
      const p = owner.state.pheromone;
      const baselineMultiplier = BASELINE_FACTOR * (0.75 + 0.25 * trail.E);
      const reinforcementMultiplier = p.reinforcementGain * trail.A ** ADHERENCE_EXPONENT;
      const expectedRate = p.amountPerUnitDistance * (baselineMultiplier + reinforcementMultiplier);
      const baselineDose = travelledDistance * p.amountPerUnitDistance * baselineMultiplier;
      const reinforcementDose = travelledDistance * p.amountPerUnitDistance * reinforcementMultiplier;
      const totalDose = baselineDose + reinforcementDose;
      const rateError = Math.abs(expectedRate - amountPerUnitDistance);
      const chunkError = Math.abs(totalDose - travelledDistance * amountPerUnitDistance);
      if (expectedRate !== amountPerUnitDistance) {
        capture.sourceMismatchCount += 1; bucket.rateMismatchCount += 1;
      }
      capture.maxRateError = Math.max(capture.maxRateError, rateError);
      capture.maxChunkClosureError = Math.max(capture.maxChunkClosureError, chunkError);
      bucket.maxRateError = Math.max(bucket.maxRateError, rateError);
      bucket.maxChunkClosureError = Math.max(bucket.maxChunkClosureError, chunkError);
      bucket.chunks += 1; add(bucket.travelled, travelledDistance); add(bucket.baseline, baselineDose);
      add(bucket.reinforcement, reinforcementDose); add(bucket.total, totalDose);
      const index = histogramIndex(trail.A);
      add(bucket.travelByA[index], travelledDistance); add(bucket.baselineByA[index], baselineDose);
      add(bucket.reinforcementByA[index], reinforcementDose);
    }
  }
  return originalAdvance.call(this, antId, travelledDistance, fromRear, toRear, amountPerUnitDistance);
};

const originalDestroy = AntController.prototype.destroy;
AntController.prototype.destroy = async function observePending(...args) {
  const capture = activeCapture;
  if (capture && capture.controller === this && !capture.pending) {
    let amount = 0, distance = 0;
    for (const state of this.gasterDeposition.ants.values()) { amount += state.amount; distance += state.distance; }
    capture.pending = { amount, distance, antCount: this.gasterDeposition.ants.size };
  }
  return originalDestroy.apply(this, args);
};

function histogramIndex(value) { return Math.max(0, Math.min(HISTOGRAM_BINS - 1, Math.floor(value * HISTOGRAM_BINS))); }
function hill(value) {
  const power = Math.max(0, value) ** 3, half = 0.035 ** 3;
  return power / (power + half);
}
function snapshotHistogram(bucket) {
  return { count: bucket.count, sum: bucket.sum.sum, mean: bucket.count ? bucket.sum.sum / bucket.count : null,
    bins: Array.from(bucket.bins) };
}
function snapshotSecond(item) {
  return { second: item.second, chunks: item.chunks, travelled: item.travelled.sum,
    baseline: item.baseline.sum, reinforcement: item.reinforcement.sum, total: item.total.sum,
    reinforcementShare: item.total.sum ? item.reinforcement.sum / item.total.sum : null,
    baselinePerTravel: item.travelled.sum ? item.baseline.sum / item.travelled.sum : null,
    reinforcementPerTravel: item.travelled.sum ? item.reinforcement.sum / item.travelled.sum : null,
    totalPerTravel: item.travelled.sum ? item.total.sum / item.travelled.sum : null,
    scaled: { baseline: item.baseline.sum * DOSE_SCALE, reinforcement: item.reinforcement.sum * DOSE_SCALE,
      total: item.total.sum * DOSE_SCALE },
    normalized: { baseline: item.baseline.sum, reinforcement: item.reinforcement.sum, total: item.total.sum },
    E: snapshotHistogram(item.E), A: snapshotHistogram(item.A), A2: snapshotHistogram(item.A2),
    far: { count: item.far.count, rawMean: item.far.count ? item.far.raw.sum / item.far.count : null,
      hillMean: item.far.count ? item.far.hill.sum / item.far.count : null,
      rawBins: Array.from(item.far.rawBins), hillBins: Array.from(item.far.hillBins) },
    byABin: { travel: item.travelByA.map(value => value.sum), baseline: item.baselineByA.map(value => value.sum),
      reinforcement: item.reinforcementByA.map(value => value.sum) },
    observer: { rateMismatchCount: item.rateMismatchCount, missingTrailStateCount: item.missingTrailStateCount,
      maxRateError: item.maxRateError, maxChunkClosureError: item.maxChunkClosureError } };
}
function through(secondsData, end) {
  const total = emptySecond(0);
  for (const item of secondsData.slice(0, end)) {
    total.chunks += item.chunks;
    add(total.travelled, item.travelled.sum); add(total.baseline, item.baseline.sum);
    add(total.reinforcement, item.reinforcement.sum); add(total.total, item.total.sum);
    for (let i = 0; i < HISTOGRAM_BINS; i += 1) {
      total.travelByA[i].sum += item.travelByA[i].sum;
      total.baselineByA[i].sum += item.baselineByA[i].sum;
      total.reinforcementByA[i].sum += item.reinforcementByA[i].sum;
    }
    for (const key of ['E', 'A', 'A2']) {
      total[key].count += item[key].count; add(total[key].sum, item[key].sum.sum);
      for (let i = 0; i < HISTOGRAM_BINS; i += 1) total[key].bins[i] += item[key].bins[i];
    }
    total.far.count += item.far.count; add(total.far.raw, item.far.raw.sum); add(total.far.hill, item.far.hill.sum);
    for (let i = 0; i < HISTOGRAM_BINS; i += 1) {
      total.far.rawBins[i] += item.far.rawBins[i]; total.far.hillBins[i] += item.far.hillBins[i];
    }
  }
  const highIndex = Math.ceil(HIGH_ADHERENCE * HISTOGRAM_BINS);
  const highTravel = total.travelByA.slice(highIndex).reduce((sum, item) => sum + item.sum, 0);
  const highBaseline = total.baselineByA.slice(highIndex).reduce((sum, item) => sum + item.sum, 0);
  const highReinforcement = total.reinforcementByA.slice(highIndex).reduce((sum, item) => sum + item.sum, 0);
  const baseline = total.baseline.sum, reinforcement = total.reinforcement.sum, dose = baseline + reinforcement;
  return { throughSeconds: end, chunks: total.chunks, travelled: total.travelled.sum,
    baselineDose: baseline, reinforcementDose: reinforcement, totalDose: dose,
    reinforcementShare: dose ? reinforcement / dose : null,
    baselinePerTravel: total.travelled.sum ? baseline / total.travelled.sum : null,
    reinforcementPerTravel: total.travelled.sum ? reinforcement / total.travelled.sum : null,
    totalPerTravel: total.travelled.sum ? dose / total.travelled.sum : null,
    scaled: { baseline: baseline * DOSE_SCALE, reinforcement: reinforcement * DOSE_SCALE, total: dose * DOSE_SCALE },
    normalized: { baseline, reinforcement, total: dose },
    highA: { threshold: HIGH_ADHERENCE, travel: highTravel,
      travelShare: total.travelled.sum ? highTravel / total.travelled.sum : null,
      baselineDose: highBaseline, baselineShare: baseline ? highBaseline / baseline : null,
      reinforcementDose: highReinforcement,
      reinforcementShare: reinforcement ? highReinforcement / reinforcement : null },
    E: snapshotHistogram(total.E), A: snapshotHistogram(total.A), A2: snapshotHistogram(total.A2),
    far: { count: total.far.count, rawMean: total.far.count ? total.far.raw.sum / total.far.count : null,
      hillMean: total.far.count ? total.far.hill.sum / total.far.count : null,
      rawBins: Array.from(total.far.rawBins), hillBins: Array.from(total.far.hillBins) },
    byABin: { travel: total.travelByA.map(value => value.sum), baseline: total.baselineByA.map(value => value.sum),
      reinforcement: total.reinforcementByA.map(value => value.sum) } };
}

function closeAccounting(capture, result) {
  const unscaledField = result.fieldWrites.requestedDose / DOSE_SCALE;
  const pending = capture.pending?.amount || 0;
  const accounted = unscaledField + pending;
  const accrued = capture.secondsData.reduce((sum, item) => sum + item.total.sum, 0);
  const residual = accrued - accounted;
  const operationCount = capture.secondsData.reduce((sum, item) => sum + item.chunks, 0) * 8
    + result.fieldWrites.pointWrites * 4 + (capture.pending?.antCount || 0) * 2 + 32;
  const unitRoundoff = Number.EPSILON / 2;
  const gamma = operationCount * unitRoundoff / (1 - operationCount * unitRoundoff);
  const bound = gamma * (Math.abs(accrued) + Math.abs(accounted));
  return { accruedUnscaledChunkDose: accrued, fieldRequestedDoseScaled: result.fieldWrites.requestedDose,
    fieldRequestedDoseNormalized: unscaledField, pendingUnscaledDabDose: pending,
    accountedUnscaledDose: accounted, residual, derivedFloatingPointBound: bound,
    withinDerivedBound: Math.abs(residual) <= bound,
    boundaryRejectedDoseScaled: result.fieldWrites.boundaryRejectedDose,
    fieldAcceptedDoseScaled: result.fieldWrites.acceptedDose,
    saturationLossScaled: result.fieldWrites.saturationLoss,
    capTouchCount: result.fieldWrites.capTouchCount,
    saturatedUpdateCount: result.fieldWrites.saturatedUpdateCount,
    pointWrites: result.fieldWrites.pointWrites, pendingDistance: capture.pending?.distance || 0,
    pendingAntCount: capture.pending?.antCount || 0 };
}

function normalizeResult(result, arm) {
  const normalized = structuredClone(result);
  normalized.arm = arm;
  normalized.sourceConfig = { width: 316, scale: DOSE_SCALE, reinforcementGainOverride: arm === 'G-R0' ? 0 : null };
  delete normalized.wallSeconds;
  if (arm === 'G-R0') {
    normalized.timelineFile = normalized.timelineFile.replace('-G-', '-G-R0-');
    normalized.checkpointMapFiles = normalized.checkpointMapFiles.map(name => name.replace('-G-', '-G-R0-'));
  }
  return normalized;
}
async function relabelR0Files(result, output) {
  const names = [result.timelineFile, ...result.checkpointMapFiles];
  for (const oldName of names) {
    const oldPath = resolve(output, oldName), bytes = await readFile(oldPath);
    const payload = JSON.parse(gunzipSync(bytes));
    assert.equal(payload.arm, 'G');
    payload.arm = 'G-R0';
    const newName = oldName.replace('-G-', '-G-R0-');
    await writeFile(resolve(output, newName), gzipSync(JSON.stringify(payload), { level: 6, mtime: 0 }));
    await rm(oldPath);
  }
}

export async function initialPairReceipt(seed) {
  activeArm = 'G';
  const intact = createController(seed, 'G', { observe: false });
  activeArm = 'G-R0';
  const ablated = createController(seed, 'G', { observe: false });
  try {
    activeArm = 'G'; await intact.controller.init();
    activeArm = 'G-R0'; await ablated.controller.init();
    assert.equal(ablated.controller.state.pheromone.reinforcementGain, 0);
    const observedG = intact.controller.getState(), observedR0 = ablated.controller.getState();
    assert.equal(observedG.pheromone.reinforcementGain, 5);
    observedR0.pheromone.reinforcementGain = 5;
    assert.deepEqual(observedR0, observedG, 'initial config differs only by declared gain override');
    assert.equal(intact.rngState, ablated.rngState); assert.equal(intact.rngCalls, ablated.rngCalls);
    const normalizedInitial = initialFingerprint(ablated);
    ablated.controller.state.pheromone.reinforcementGain = 5;
    const baselineFingerprint = initialFingerprint(ablated);
    assert.equal(baselineFingerprint, initialFingerprint(intact), 'initial world/RNG fingerprints match after gain normalization');
    ablated.controller.state.pheromone.reinforcementGain = 0;
    return { seed, normalizedInitialStateSha256: baselineFingerprint,
      ablationNativeInitialStateSha256: normalizedInitial,
      rngState: intact.rngState, rngCalls: intact.rngCalls,
      gainBeforeOverride: 5, gainAfterOverride: 0,
      equalAfterNormalizingOnlyGain: true, field: { widthG: intact.controller.field.width,
        widthR0: ablated.controller.field.width, doseScaleG: intact.controller.field.doseScale,
        doseScaleR0: ablated.controller.field.doseScale, bothEmpty: intact.controller.field.values.every(v => v === 0)
          && ablated.controller.field.values.every(v => v === 0) } };
  } finally {
    activeArm = 'G'; await intact.controller.destroy(); activeArm = 'G-R0'; await ablated.controller.destroy();
    activeArm = 'G';
  }
}

export async function observerParity(arm, seed, ticks = 120) {
  const observed = createController(seed, 'G', { observe: true });
  const control = createController(seed, 'G', { observe: false });
  const observerCapture = captureFor(seed, arm, Math.ceil(ticks / 60));
  try {
    activeCapture = observerCapture; activeArm = arm; await observed.controller.init();
    activeCapture = null; activeArm = arm; await control.controller.init();
    assert.equal(initialFingerprint(observed), initialFingerprint(control));
    for (let tick = 0; tick < ticks; tick += 1) {
      activeCapture = observerCapture; activeArm = arm; observed.controller.tick(DT);
      activeCapture = null; activeArm = arm; control.controller.tick(DT);
      assert.equal(stateFingerprint(observed), stateFingerprint(control), arm + ' observer parity tick ' + (tick + 1));
      assert.equal(observed.rngCalls, control.rngCalls, arm + ' observer RNG parity tick ' + (tick + 1));
    }
    assert(observed.ledger.calls.local > 0 && observed.ledger.calls.far > 0 && observed.ledger.calls.intention > 0);
    assert.equal(observerCapture.tick, ticks);
    return { arm, seed, ticks, equalEveryTick: true, rngCalls: observed.rngCalls,
      observerCalls: { ...observed.ledger.calls }, observerAddedRngCalls: 0 };
  } finally {
    activeCapture = null; activeArm = arm; await observed.controller.destroy(); activeArm = arm;
    await control.controller.destroy(); activeArm = 'G';
  }
}

async function sourceHashes() {
  const hashes = {};
  for (const path of SOURCE_FILES) hashes[path] = await fileHash(resolve(ROOT, path));
  hashes['docs/ant/README.md'] = await fileHash(resolve(ROOT, 'docs/ant/README.md'));
  hashes['scripts/ant-316-gaussian-dose-unit-movement-shadow.js'] =
    await fileHash(resolve(ROOT, 'scripts/ant-316-gaussian-dose-unit-movement-shadow.js'));
  return hashes;
}
async function verifyParentEvidence() {
  const path = resolve(ROOT, PARENT, 'data');
  const manifest = JSON.parse(await readFile(resolve(path, 'SHA256SUMS.json'), 'utf8'));
  for (const [name, expected] of Object.entries(manifest)) assert.equal(await fileHash(resolve(path, name)), expected, 'parent artifact ' + name);
  const summary = JSON.parse(await readFile(resolve(path, 'SUMMARY.json'), 'utf8'));
  assert.equal(summary.freshMain, '8c60e4bba3bd5b476300e90a2936bfebd1f831c2');
  assert.deepEqual(summary.seeds, SEEDS); assert.deepEqual(summary.arms, ['C', 'F', 'G']);
  assert.equal(summary.seconds, SECONDS); assert.equal(summary.tickRate, 60);
  const source = JSON.parse(await readFile(resolve(ROOT, SOURCE_PARENT, 'data/SUMMARY.json'), 'utf8'));
  const sourceData = resolve(ROOT, SOURCE_PARENT, 'data');
  const sourceManifest = JSON.parse(await readFile(resolve(sourceData, 'SHA256SUMS.json'), 'utf8'));
  for (const [name, expected] of Object.entries(sourceManifest)) {
    assert.equal(await fileHash(resolve(sourceData, name)), expected, 'source-decomposition artifact ' + name);
  }
  assert.equal(source.provenance.seeds.length, 3); assert.deepEqual(source.provenance.seeds, SEEDS);
  return { movementSummarySha256: await fileHash(resolve(path, 'SUMMARY.json')),
    movementManifestSha256: await fileHash(resolve(path, 'SHA256SUMS.json')),
    sourceDecompositionSummarySha256: await fileHash(resolve(ROOT, SOURCE_PARENT, 'data/SUMMARY.json')),
    sourceDecompositionManifestSha256: await fileHash(resolve(ROOT, SOURCE_PARENT, 'data/SHA256SUMS.json')),
    productionSourceHashes: summary.sourceHashes,
    parentSourceHashes: source.provenance.sourceHashes,
    priorGSource: source.results.scenarios.map(scenario => ({ seed: scenario.seed,
      arm: scenario.arms.find(arm => arm.arm === 'G') })),
    movementFilesVerified: Object.keys(manifest).length, sourceLaw: {
      baselineFactor: BASELINE_FACTOR, exponent: ADHERENCE_EXPONENT, amountPerUnitDistance: AMOUNT_PER_DISTANCE,
      gainG: 5, scale: DOSE_SCALE, gridWidth: ARMS.G.width, radius: 0.0045, sigma: 0.00225 } };
}
async function runOne(seed, arm, output, priorG, priorSourceG, earlyMask) {
  const capture = captureFor(seed, arm);
  activeArm = arm; activeCapture = capture;
  let result;
  try { result = await executeScenario(seed, 'G', SECONDS, output, earlyMask); }
  finally { activeCapture = null; activeArm = 'G'; }
  assert.equal(capture.tick, SECONDS * 60);
  assert(capture.ablation, 'initialization records the declared ablation');
  if (arm === 'G-R0') {
    assert.equal(capture.ablation.before, 5); assert.equal(capture.ablation.after, 0);
    await relabelR0Files(result, output);
  }
  const closure = closeAccounting(capture, result);
  assert.equal(capture.sourceMismatchCount, 0, 'chunk source rate matches the actual rate supplied to deposition');
  assert.equal(capture.missingTrailStateCount, 0, 'every moving chunk has the just-updated E/A state');
  assert.equal(closure.withinDerivedBound, true, 'chunk dose reconciles to emitted and pending deposition');
  assert.equal(result.invariants.fieldNonfiniteSeconds, 0);
  assert.equal(result.movement.finiteViolations, 0);
  assert.equal(result.movement.speedCapViolations, 0); assert.equal(result.movement.turnCapViolations, 0);
  assert.equal(result.movement.overlapViolations, 0); assert.equal(result.movement.populationCeilingViolations, 0);
  if (arm === 'G-R0') {
    assert.equal(capture.secondsData.reduce((sum, row) => sum + row.reinforcement.sum, 0), 0,
      'G-R0 reinforcement requested dose is exactly zero');
  } else {
    assert(priorG, 'G parent summary supplied for exact reproduction');
    const actual = JSON.parse(JSON.stringify(result)), expected = JSON.parse(JSON.stringify(priorG));
    delete actual.wallSeconds; delete expected.wallSeconds;
    const actualJson = JSON.stringify(actual), expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
      let offset = 0;
      while (offset < actualJson.length && actualJson[offset] === expectedJson[offset]) offset += 1;
      throw new Error('parent G result mismatch at serialized byte ' + offset + ' (actual ' + hash(actualJson)
        + ', parent ' + hash(expectedJson) + ')');
    }
    assert(priorSourceG, 'parent G source decomposition supplied for exact source-ledger reproduction');
    const now = through(capture.secondsData, SECONDS);
    assert.equal(now.chunks, priorSourceG.sourceTotals.chunks, 'parent G source chunk total');
    assert.equal(now.travelled, priorSourceG.sourceTotals.travelled, 'parent G source travel total');
    for (const [nowKey, sourceKey] of [['baselineDose', 'baseline'], ['reinforcementDose', 'reinforcement'],
      ['totalDose', 'total']]) assert.equal(now[nowKey], priorSourceG.sourceTotals.unscaled[sourceKey],
      'parent G source dose ' + sourceKey);
    for (const checkpoint of priorSourceG.checkpoints) {
      const replayed = through(capture.secondsData, checkpoint.seconds);
      for (const key of ['baselineDose', 'reinforcementDose', 'totalDose']) {
        const sourceKey = key === 'baselineDose' ? 'baseline' : key === 'reinforcementDose' ? 'reinforcement' : 'total';
        assert.equal(replayed[key], checkpoint.unscaled[sourceKey],
          'parent G source checkpoint ' + checkpoint.seconds + ' ' + sourceKey);
      }
    }
  }
  const sourceRows = capture.secondsData.map(snapshotSecond);
  const sourceCheckpoints = CHECKPOINTS.map(seconds => through(capture.secondsData, seconds));
  const source = { seed, arm, seconds: SECONDS, tickRate: 60, highAdherenceRule: 'A >= 0.75; existing 40 bins over [0,1]',
    doseScale: DOSE_SCALE, chunkAccounting: { closure, sourceMismatchCount: capture.sourceMismatchCount,
      missingTrailStateCount: capture.missingTrailStateCount, maxRateError: capture.maxRateError,
      maxChunkClosureError: capture.maxChunkClosureError },
    pendingDab: capture.pending, checkpoints: sourceCheckpoints, perSecond: sourceRows,
    occupancyPerSecond: capture.occupancyPerSecond, occupancyCheckpoints: capture.occupancyCheckpoints };
  const normalized = normalizeResult(result, arm);
  for (const point of capture.occupancyCheckpoints) {
    const runnerPoint = normalized.checkpoints.find(item => item.seconds === point.second);
    assert.equal(point.cumulative.coverage, runnerPoint.occupancy.cumulativeCoverage,
      'independent tick observer cumulative occupancy matches the frozen runner');
    assert.equal(point.cumulative.top10PercentMassShare, runnerPoint.occupancy.cumulative.top10PercentMassShare,
      'independent tick observer cumulative top-10 share matches the frozen runner');
    assert.equal(point.cumulative.normalizedEntropy, runnerPoint.occupancy.cumulative.normalizedEntropy,
      'independent tick observer cumulative entropy matches the frozen runner');
  }
  normalized.correctedOccupancyCheckpoints = capture.occupancyCheckpoints;
  return { result: normalized, source, rawFiles: [normalized.timelineFile, ...normalized.checkpointMapFiles] };
}

function deterministicJson(value) {
  const first = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  const second = Buffer.from(JSON.stringify(structuredClone(value), null, 2) + '\n');
  assert(first.equals(second), 'deterministic scientific summary serialization');
  return { bytes: first, sha256: hash(first) };
}
async function writeGzip(path, value) {
  const first = gzipSync(JSON.stringify(value), { level: 6, mtime: 0 });
  const second = gzipSync(JSON.stringify(structuredClone(value)), { level: 6, mtime: 0 });
  assert(first.equals(second), 'deterministic gzip scientific artifact');
  await writeFile(path, first);
  return { sha256: hash(first), deterministic: true };
}

export async function runFullPass(outputDir) {
  const parent = await verifyParentEvidence();
  const sources = await sourceHashes();
  for (const [path, expected] of Object.entries(parent.productionSourceHashes)) {
    assert.equal(sources[path], expected, 'production baseline source hash ' + path);
  }
  for (const [path, expected] of Object.entries(parent.parentSourceHashes)) {
    if (sources[path]) assert.equal(sources[path], expected, 'prior source decomposition source hash ' + path);
  }
  const controllerSource = await readFile(resolve(ROOT, 'src/lib/agents/ant/AntController.js'), 'utf8');
  assert.match(controllerSource, /const DEPOSITION_BASELINE = 0\.5;/);
  assert.match(controllerSource, /const DEPOSITION_ADHERENCE_EXPONENT = 2;/);
  assert.match(controllerSource, /reinforcementGain\s*\*\s*agent\.trailAdherence\s*\*\*\s*DEPOSITION_ADHERENCE_EXPONENT/);
  const preregistrationSha256 = await fileHash(resolve(ROOT, PACKAGE, 'PREREGISTRATION.md'));
  const movementRunnerSource = await readFile(resolve(ROOT, 'scripts/ant-316-gaussian-dose-unit-movement-shadow.js'), 'utf8');
  assert.equal((movementRunnerSource.match(/currentOccupancy\s*=\s*new Uint32Array/g) || []).length, 1,
    'the inherited recent-occupancy ring does not reset its per-second source buffer');
  const sourceLawReceipt = { baseline: '0.5 * (0.75 + 0.25 * E)', reinforcement: 'gain * A^2',
    productionGain: 5, amountPerUnitDistance: 4.5, scale: DOSE_SCALE,
    controllerSourceSha256: sources['src/lib/agents/ant/AntController.js'],
    gasterDepositionSourceSha256: sources['src/lib/agents/ant/GasterDeposition.js'],
    parentMovementRunnerSha256: await fileHash(resolve(ROOT, 'scripts/ant-316-gaussian-dose-unit-movement-shadow.js')),
    recentOccupancyCorrection: 'independent read-only 60 Hz occupancy counter; reset each second and roll a 30-second bucket; cumulative values must match the frozen runner exactly',
    preregistrationSha256, parent };
  const files = await readdir(outputDir).catch(() => []);
  assert.equal(files.length, 0, 'use a fresh empty evidence data directory');
  await mkdir(outputDir, { recursive: true });
  const scratch = await import('node:fs/promises').then(fs => fs.mkdtemp(join(tmpdir(), 'ant-g-ablation-parent-')));
  await mkdir(scratch, { recursive: true });
  const priorSummary = JSON.parse(await readFile(resolve(ROOT, PARENT, 'data/SUMMARY.json'), 'utf8'));
  const earlyMasks = new Map();
  for (const seed of SEEDS) {
    const cRawBytes = await readFile(resolve(ROOT, PARENT, 'data/seed' + seed + '-C-raw.json.gz'));
    const cRaw = JSON.parse(gunzipSync(cRawBytes));
    assert(Array.isArray(cRaw.earlyRouteMask) && cRaw.earlyRouteMask.length === 96 * 96,
      'reuse the exact prior C 30-second route mask for matched G/G-R0 measurements');
    earlyMasks.set(seed, Uint8Array.from(cRaw.earlyRouteMask));
  }
  const scenarios = [];
  const validations = [];
  try {
    for (const seed of SEEDS) {
      const initialPair = await initialPairReceipt(seed);
      const observerChecks = [await observerParity('G', seed), await observerParity('G-R0', seed)];
      const priorG = priorSummary.scenarios.find(item => item.seed === seed).arms.find(item => item.arm === 'G');
      const priorSourceG = parent.priorGSource.find(item => item.seed === seed).arm;
      const earlyMask = earlyMasks.get(seed);
      const intact = await runOne(seed, 'G', scratch, priorG, priorSourceG, earlyMask);
      const ablated = await runOne(seed, 'G-R0', outputDir, null, null, earlyMask);
      const initialParentMatches = initialPair.normalizedInitialStateSha256 === priorG.initialStateSha256;
      assert.equal(initialParentMatches, true, 'seed initial fingerprint matches the saved G parent');
      scenarios.push({ seed, normalizedInitialStateSha256: initialPair.normalizedInitialStateSha256,
        initialPair, arms: [intact.result, ablated.result] });
      validations.push({ seed, initialPair, observerChecks,
        parentG: { resultEqual: true, rawTimelineSha256: await fileHash(resolve(scratch, 'seed' + seed + '-G-raw.json.gz')),
          rawTimelineParentSha256: await fileHash(resolve(ROOT, PARENT, 'data/seed' + seed + '-G-raw.json.gz')),
          checkpointMapsEqual: false },
        sourceClosure: { G: intact.source.chunkAccounting, 'G-R0': ablated.source.chunkAccounting } });
      const sourceGName = 'seed' + seed + '-G-source-accounting.json.gz';
      const sourceR0Name = 'seed' + seed + '-G-R0-source-accounting.json.gz';
      const gReceipt = await writeGzip(resolve(outputDir, sourceGName), intact.source);
      const r0Receipt = await writeGzip(resolve(outputDir, sourceR0Name), ablated.source);
      validations.at(-1).sourceArtifacts = { G: { file: sourceGName, ...gReceipt },
        'G-R0': { file: sourceR0Name, ...r0Receipt } };
      for (const [i, name] of intact.rawFiles.entries()) {
        const parentName = name;
        assert((await fileHash(resolve(scratch, parentName))) === (await fileHash(resolve(ROOT, PARENT, 'data', parentName))),
          'parent G raw/map byte parity: ' + parentName);
        if (i === 0) validations.at(-1).parentG.rawTimelineByteEqual = true;
        else validations.at(-1).parentG.checkpointMapsEqual = true;
      }
      await rm(scratch, { recursive: true, force: true });
      await mkdir(scratch, { recursive: true });
      console.log(JSON.stringify({ seed, G: { travel: intact.result.movement.totalDistance,
        coverage: intact.result.checkpoints.at(-1).occupancy.cumulativeCoverage,
        top10: intact.result.checkpoints.at(-1).occupancy.cumulative.top10PercentMassShare },
      'G-R0': { travel: ablated.result.movement.totalDistance,
        coverage: ablated.result.checkpoints.at(-1).occupancy.cumulativeCoverage,
        top10: ablated.result.checkpoints.at(-1).occupancy.cumulative.top10PercentMassShare } }));
      scenarios.at(-1).arms[0].sourceAccounting = { file: sourceGName, sha256: gReceipt.sha256 };
      scenarios.at(-1).arms[1].sourceAccounting = { file: sourceR0Name, sha256: r0Receipt.sha256 };
    }
  } finally { await rm(scratch, { recursive: true, force: true }); }

  const scientific = { schemaVersion: 1, baseline: 'origin/main 8c60e4bba3bd5b476300e90a2936bfebd1f831c2',
    branchPoint: 'a4bed839b2775e774e075324c176213ccbae6dae', preregistrationCommit: 'f53a127bbf7408a8235f1468d8fc223b6592ad75',
    preregistrationSha256, sourceLawReceipt, seeds: [...SEEDS], seconds: SECONDS, tickRate: 60,
    checkpoints: [...CHECKPOINTS], arms: ['G', 'G-R0'], scenarios };
  const summary = deterministicJson(scientific);
  await writeFile(resolve(outputDir, 'SUMMARY.json'), summary.bytes);
  await writeFile(resolve(outputDir, 'SOURCE-LAW-RECEIPT.json'), JSON.stringify(sourceLawReceipt, null, 2) + '\n');
  const validation = { schemaVersion: 1, deterministicScientificSummary: { firstSha256: summary.sha256,
    secondSha256: hash(Buffer.from(JSON.stringify(structuredClone(scientific), null, 2) + '\n')), byteEqual: true },
    scenarios: validations, productionSourceUnchanged: true };
  const validationBytes = deterministicJson(validation);
  await writeFile(resolve(outputDir, 'VALIDATION.json'), validationBytes.bytes);
  const manifest = {};
  for (const name of (await readdir(outputDir)).sort()) manifest[name] = await fileHash(resolve(outputDir, name));
  const manifestBytes = deterministicJson(manifest);
  await writeFile(resolve(outputDir, 'SHA256SUMS.json'), manifestBytes.bytes);
  return { summarySha256: summary.sha256, validationSha256: validationBytes.sha256,
    manifestSha256: manifestBytes.sha256, artifacts: Object.keys(manifest).length, scenarios: scenarios.length };
}

async function main() {
  const args = new Map(process.argv.slice(2).map(arg => {
    const i = arg.indexOf('='); return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
  }));
  if (args.has('--selfcheck')) {
    const source = await readFile(resolve(ROOT, 'src/lib/agents/ant/AntController.js'), 'utf8');
    assert.match(source, /reinforcementGain\s*\*\s*agent\.trailAdherence\s*\*\*\s*DEPOSITION_ADHERENCE_EXPONENT/);
    const gain = 0, E = 0.7, A = 0.9;
    assert.equal(BASELINE_FACTOR * (0.75 + 0.25 * E) + gain * A ** ADHERENCE_EXPONENT,
      BASELINE_FACTOR * (0.75 + 0.25 * E));
    assert.equal(gain * A ** ADHERENCE_EXPONENT, 0);
    console.log(JSON.stringify({ sourceLaw: true, ablationExact: true, doseScale: DOSE_SCALE }));
    return;
  }
  const output = resolve(String(args.get('--output') || resolve(ROOT, PACKAGE, 'data')));
  console.log(JSON.stringify(await runFullPass(output)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
