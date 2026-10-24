import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { GasterDeposition } from '../src/lib/agents/ant/GasterDeposition.js';
import {
  ARMS, CHECKPOINTS, DOSE_SCALE, DT, createController, executeScenario,
  initialFingerprint, stateFingerprint
} from './ant-316-gaussian-dose-unit-movement-shadow.js';

export const BASELINE_FACTOR = 0.5;
export const ADHERENCE_EXPONENT = 2;
export const HISTOGRAM_BINS = 40;
export const HIGH_ADHERENCE = 0.75;
export const SEEDS = Object.freeze([20261005, 20261006, 20261007]);
export const ARMS_ORDER = Object.freeze(['C', 'F', 'G']);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-25-ant-g-deposition-source-decomposition';
const PARENT = 'docs/ant/evidence/2026-10-24-ant-316-gaussian-dose-unit-movement-shadow';
const EXPECTED_PARENT_SUMMARY = 'e624166267e275dd03044f88cfa480e96d7744b0c32844492a1a822ea03c8e8d';
const EXPECTED_PARENT_MANIFEST = 'adc2095bdbebb45d18732c2d16b3b465a2ed7b14f9965d4e954e1aeec349b2d4';
const EPSILON = Number.EPSILON;
let activeCapture = null;
const depositionOwners = new WeakMap();

export function decomposeDose({ travelled, amountPerUnitDistance, trailStrength, adherence, amount = 4.5,
  gain = 5, baselineFactor = BASELINE_FACTOR, exponent = ADHERENCE_EXPONENT, scale = 1 }) {
  for (const [name, value] of Object.entries({ travelled, amountPerUnitDistance, trailStrength, adherence,
    amount, gain, baselineFactor, exponent, scale })) {
    if (!Number.isFinite(value)) throw new TypeError(name + ' must be finite.');
  }
  const baselineMultiplier = baselineFactor * (0.75 + 0.25 * trailStrength);
  const reinforcementMultiplier = gain * adherence ** exponent;
  const totalMultiplier = baselineMultiplier + reinforcementMultiplier;
  const expectedRate = amount * totalMultiplier;
  const baselineDose = travelled * amount * baselineMultiplier;
  const reinforcementDose = travelled * amount * reinforcementMultiplier;
  const totalDose = baselineDose + reinforcementDose;
  const actualDose = travelled * amountPerUnitDistance;
  const scaled = { baseline: baselineDose * scale, reinforcement: reinforcementDose * scale,
    total: totalDose * scale };
  return { baselineMultiplier, reinforcementMultiplier, totalMultiplier, expectedRate,
    baselineDose, reinforcementDose, totalDose, actualDose, sourceResidual: totalDose - actualDose,
    scaled, normalized: { baseline: scaled.baseline / scale, reinforcement: scaled.reinforcement / scale,
      total: scaled.total / scale } };
}

function kahan() { return { sum: 0, correction: 0 }; }
function add(sum, value) {
  const adjusted = value - sum.correction;
  const next = sum.sum + adjusted;
  sum.correction = (next - sum.sum) - adjusted;
  sum.sum = next;
}
function emptySecond(second) {
  return { second, chunks: 0, travelled: kahan(), baseline: kahan(), reinforcement: kahan(), total: kahan(),
    rateMismatchCount: 0, missingTrailStateCount: 0, maxRateError: 0, maxChunkClosureError: 0,
    e: sampleBucket(), a: sampleBucket(), a2: sampleBucket(), far: farBucket(),
    travelByA: Array.from({ length: HISTOGRAM_BINS }, kahan),
    reinforcementByA: Array.from({ length: HISTOGRAM_BINS }, kahan),
    baselineByA: Array.from({ length: HISTOGRAM_BINS }, kahan) };
}
function sampleBucket() { return { count: 0, sum: kahan(), bins: new Uint32Array(HISTOGRAM_BINS) }; }
function farBucket() { return { count: 0, raw: kahan(), hill: kahan(), rawBins: new Uint32Array(HISTOGRAM_BINS),
  hillBins: new Uint32Array(HISTOGRAM_BINS) }; }
function histogramIndex(value) { return Math.max(0, Math.min(HISTOGRAM_BINS - 1, Math.floor(value * HISTOGRAM_BINS))); }
function addSample(bucket, value) {
  assert(Number.isFinite(value));
  bucket.count += 1; add(bucket.sum, value); bucket.bins[histogramIndex(value)] += 1;
}
function hill(value, half = 0.035, exponent = 3) {
  const power = Math.max(0, value) ** exponent, base = half ** exponent;
  return power / (power + base);
}

export function createCapture(seed, arm, seconds) {
  return { seed, arm, seconds, controller: null, tick: 0, context: null, secondsData: Array.from(
    { length: seconds }, (_, index) => emptySecond(index + 1)),
  total: emptySecond(0), pending: null, closure: null, defaults: null, sourceMismatches: 0,
  rateMismatchCount: 0, missingTrailStateCount: 0, maxRateError: 0, maxChunkClosureError: 0 };
}

function activeSecond(capture) {
  return capture?.context ? capture.secondsData[capture.context.second - 1] : null;
}
function collectTrailState(controller, agent, localTrail) {
  const capture = activeCapture;
  if (!capture || capture.controller !== controller || !capture.context) return;
  const e = localTrail?.strength, a = agent.trailAdherence;
  assert(Number.isFinite(e) && Number.isFinite(a), 'finite E/A at deposition decision');
  assert(e >= 0 && e <= 1 && a >= 0 && a <= 1, 'E/A remain in [0,1]');
  capture.context.trailByAnt.set(agent.id, { e, a });
  const bucket = activeSecond(capture);
  addSample(bucket.e, e); addSample(bucket.a, a); addSample(bucket.a2, a * a);
}

const originalTick = AntController.prototype.tick;
AntController.prototype.tick = function observedTick(dt) {
  const capture = activeCapture;
  if (!capture || (capture.controller && capture.controller !== this)) return originalTick.call(this, dt);
  if (!capture.controller) capture.controller = this;
  depositionOwners.set(this.gasterDeposition, this);
  capture.tick += 1;
  const second = Math.ceil(capture.tick / 60);
  assert(second <= capture.seconds, 'observer tick stays inside the frozen run');
  capture.context = { second, trailByAnt: new Map() };
  try { return originalTick.call(this, dt); }
  finally { capture.context = null; }
};

const originalIntention = AntController.prototype.updateIntention;
AntController.prototype.updateIntention = function observedIntention(agent, agents, occupancy, dt, localTrail) {
  const result = originalIntention.call(this, agent, agents, occupancy, dt, localTrail);
  collectTrailState(this, agent, localTrail);
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
    const trail = capture.context.trailByAnt.get(antId);
    const bucket = activeSecond(capture);
    if (!trail) {
      capture.missingTrailStateCount += 1; bucket.missingTrailStateCount += 1;
    } else {
      const p = owner.state.pheromone;
      const dose = decomposeDose({ travelled: travelledDistance, amountPerUnitDistance, trailStrength: trail.e,
        adherence: trail.a, amount: p.amountPerUnitDistance, gain: p.reinforcementGain, scale: owner.field.doseScale || 1 });
      const rateError = Math.abs(dose.expectedRate - amountPerUnitDistance);
      const chunkError = Math.abs(dose.sourceResidual);
      if (dose.expectedRate !== amountPerUnitDistance) capture.rateMismatchCount += 1;
      if (dose.expectedRate !== amountPerUnitDistance) bucket.rateMismatchCount += 1;
      capture.maxRateError = Math.max(capture.maxRateError, rateError);
      capture.maxChunkClosureError = Math.max(capture.maxChunkClosureError, chunkError);
      bucket.maxRateError = Math.max(bucket.maxRateError, rateError);
      bucket.maxChunkClosureError = Math.max(bucket.maxChunkClosureError, chunkError);
      capture.sourceMismatches += dose.expectedRate === amountPerUnitDistance ? 0 : 1;
      bucket.chunks += 1; add(bucket.travelled, travelledDistance); add(bucket.baseline, dose.baselineDose);
      add(bucket.reinforcement, dose.reinforcementDose); add(bucket.total, dose.totalDose);
      const index = histogramIndex(trail.a);
      add(bucket.travelByA[index], travelledDistance);
      add(bucket.baselineByA[index], dose.baselineDose);
      add(bucket.reinforcementByA[index], dose.reinforcementDose);
    }
  }
  return originalAdvance.call(this, antId, travelledDistance, fromRear, toRear, amountPerUnitDistance);
};

const originalDestroy = AntController.prototype.destroy;
AntController.prototype.destroy = async function observedDestroy(...args) {
  const capture = activeCapture;
  if (capture && capture.controller === this && !capture.pending) {
    let amount = 0, distance = 0;
    for (const state of this.gasterDeposition.ants.values()) { amount += state.amount; distance += state.distance; }
    capture.pending = { amount, distance, antCount: this.gasterDeposition.ants.size };
  }
  return originalDestroy.apply(this, args);
};

function snapshotBucket(bucket) {
  return { count: bucket.count, sum: bucket.sum.sum, mean: bucket.count ? bucket.sum.sum / bucket.count : null,
    bins: Array.from(bucket.bins) };
}
function snapshotSecond(item, parentTimeline, checkpoint, scale) {
  const timeline = parentTimeline[item.second - 1];
  const chunks = item.chunks, travel = item.travelled.sum, baseline = item.baseline.sum;
  const reinforcement = item.reinforcement.sum, total = item.total.sum;
  return { second: item.second, chunks, travel, source: { baseline, reinforcement, total,
    reinforcementShare: total ? reinforcement / total : null, baselinePerTravel: travel ? baseline / travel : null,
    reinforcementPerTravel: travel ? reinforcement / travel : null, totalPerTravel: travel ? total / travel : null },
  scaled: { baseline: baseline * scale, reinforcement: reinforcement * scale, total: total * scale },
  normalized: { baseline: baseline * scale / scale, reinforcement: reinforcement * scale / scale,
    total: total * scale / scale },
  highA: highAdherence(item), local: { E: snapshotBucket(item.e), A: snapshotBucket(item.a), A2: snapshotBucket(item.a2) },
  far: { count: item.far.count, rawSum: item.far.raw.sum, rawMean: item.far.count ? item.far.raw.sum / item.far.count : null,
    hillSum: item.far.hill.sum, hillMean: item.far.count ? item.far.hill.sum / item.far.count : null,
    rawBins: Array.from(item.far.rawBins), hillBins: Array.from(item.far.hillBins) },
  adherenceBins: { travel: item.travelByA.map(value => value.sum), baseline: item.baselineByA.map(value => value.sum),
    reinforcement: item.reinforcementByA.map(value => value.sum) },
  observer: { rateMismatchCount: item.rateMismatchCount, missingTrailStateCount: item.missingTrailStateCount,
    maxRateError: item.maxRateError, maxChunkClosureError: item.maxChunkClosureError },
  timeline: timeline ? { population: timeline.population, activation: timeline.activation,
    cumulativeTravel: timeline.totalRealizedTravel, localStrengthMean: timeline.localStrengthMean,
    adherenceMean: timeline.adherenceMean, farRawMean: timeline.farRawMean, farHillMean: timeline.farHillMean,
    cumulativeCoverage: checkpoint?.occupancy.cumulativeCoverage ?? null,
    top10OccupancyShare: checkpoint?.occupancy.cumulative.top10PercentMassShare ?? null } : null,
  checkpoint: checkpoint ? { occupancy: checkpoint.occupancy, fieldMax: checkpoint.field.max,
    plateCount: checkpoint.plateCount, totalSpawned: checkpoint.totalSpawned,
    totalRealizedTravel: checkpoint.totalRealizedTravel, activePopulation: checkpoint.activePopulation } : null };
}
function highAdherence(item) {
  const start = Math.ceil(HIGH_ADHERENCE * HISTOGRAM_BINS);
  const travel = item.travelByA.slice(start).reduce((sum, value) => sum + value.sum, 0);
  const baseline = item.baselineByA.slice(start).reduce((sum, value) => sum + value.sum, 0);
  const reinforcement = item.reinforcementByA.slice(start).reduce((sum, value) => sum + value.sum, 0);
  return { threshold: HIGH_ADHERENCE, travel, travelShare: item.travelled.sum ? travel / item.travelled.sum : null,
    baselineDose: baseline, baselineShare: item.baseline.sum ? baseline / item.baseline.sum : null,
    reinforcementDose: reinforcement,
    reinforcementShare: item.reinforcement.sum ? reinforcement / item.reinforcement.sum : null };
}
function aggregateThrough(secondsData, end) {
  const total = emptySecond(0);
  for (const item of secondsData.slice(0, end)) {
    total.chunks += item.chunks;
    add(total.travelled, item.travelled.sum); add(total.baseline, item.baseline.sum);
    add(total.reinforcement, item.reinforcement.sum); add(total.total, item.total.sum);
    for (let i = 0; i < HISTOGRAM_BINS; i += 1) {
      total.e.bins[i] += item.e.bins[i]; total.a.bins[i] += item.a.bins[i]; total.a2.bins[i] += item.a2.bins[i];
      total.travelByA[i].sum += item.travelByA[i].sum;
      total.baselineByA[i].sum += item.baselineByA[i].sum;
      total.reinforcementByA[i].sum += item.reinforcementByA[i].sum;
    }
    total.e.count += item.e.count; add(total.e.sum, item.e.sum.sum);
    total.a.count += item.a.count; add(total.a.sum, item.a.sum.sum);
    total.a2.count += item.a2.count; add(total.a2.sum, item.a2.sum.sum);
    total.far.count += item.far.count; add(total.far.raw, item.far.raw.sum); add(total.far.hill, item.far.hill.sum);
    for (let i = 0; i < HISTOGRAM_BINS; i += 1) {
      total.far.rawBins[i] += item.far.rawBins[i]; total.far.hillBins[i] += item.far.hillBins[i];
    }
  }
  return total;
}
function summaryTotals(item, arm) {
  const travel = item.travelled.sum, baseline = item.baseline.sum, reinforcement = item.reinforcement.sum;
  const total = baseline + reinforcement, identityResidual = item.total.sum - total, scale = ARMS[arm].scale;
  return { chunks: item.chunks, travelled: travel, unscaled: { baseline, reinforcement, total, identityResidual,
    reinforcementShare: total ? reinforcement / total : null, baselinePerTravel: travel ? baseline / travel : null,
    reinforcementPerTravel: travel ? reinforcement / travel : null, totalPerTravel: travel ? total / travel : null },
  scaled: { baseline: baseline * scale, reinforcement: reinforcement * scale, total: total * scale },
  normalized: { baseline: baseline * scale / scale, reinforcement: reinforcement * scale / scale,
    total: total * scale / scale }, highA: highAdherence(item),
  E: { count: item.e.count, mean: item.e.count ? item.e.sum.sum / item.e.count : null, bins: Array.from(item.e.bins) },
  A: { count: item.a.count, mean: item.a.count ? item.a.sum.sum / item.a.count : null, bins: Array.from(item.a.bins) },
  A2: { count: item.a2.count, mean: item.a2.count ? item.a2.sum.sum / item.a2.count : null, bins: Array.from(item.a2.bins) },
  far: { count: item.far.count, rawMean: item.far.count ? item.far.raw.sum / item.far.count : null,
    hillMean: item.far.count ? item.far.hill.sum / item.far.count : null,
    rawBins: Array.from(item.far.rawBins), hillBins: Array.from(item.far.hillBins) },
  byABin: { travel: item.travelByA.map(value => value.sum), baseline: item.baselineByA.map(value => value.sum),
    reinforcement: item.reinforcementByA.map(value => value.sum) } };
}

export async function runObserverParity(arm, seed = 20261005, ticks = 120) {
  const observed = createController(seed, arm, { observe: false });
  const control = createController(seed, arm, { observe: false });
  const capture = createCapture(seed, arm, Math.ceil(ticks / 60));
  try {
    await observed.controller.init(); await control.controller.init();
    assert.equal(initialFingerprint(observed), initialFingerprint(control));
    capture.controller = observed.controller;
    for (let tick = 1; tick <= ticks; tick += 1) {
      activeCapture = capture;
      observed.controller.tick(DT);
      activeCapture = null;
      control.controller.tick(DT);
      assert.equal(stateFingerprint(observed), stateFingerprint(control), arm + ' observer parity tick ' + tick);
      assert.equal(observed.rngCalls, control.rngCalls, arm + ' RNG parity tick ' + tick);
    }
    assert(capture.secondsData.some(item => item.chunks > 0));
    return { arm, seed, ticks, stateAndRngEqualEveryTick: true, observedRngCalls: observed.rngCalls,
      observerChunks: capture.secondsData.reduce((sum, item) => sum + item.chunks, 0),
      sourceRateMismatches: capture.rateMismatchCount, missingTrailStateCount: capture.missingTrailStateCount };
  } finally {
    activeCapture = null;
    await observed.controller.destroy(); await control.controller.destroy();
  }
}

function digest(data) { return createHash('sha256').update(data).digest('hex'); }
async function sha(path) { return digest(await readFile(path)); }
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
function assertSame(expected, actual, label) {
  try { assert.deepEqual(actual, expected); }
  catch (error) { error.message = label + ': ' + error.message; throw error; }
}
function jsonValue(value) { return JSON.parse(JSON.stringify(value)); }
async function writeDeterministicGzip(path, value) {
  const first = gzipSync(JSON.stringify(value), { level: 6, mtime: 0 });
  const second = gzipSync(JSON.stringify(structuredClone(value)), { level: 6, mtime: 0 });
  assert(first.equals(second), 'deterministic one-second accounting generation');
  await writeFile(path, first);
  return { first: digest(first), second: digest(second) };
}

function closeAccounting(capture, result, arm) {
  const scale = ARMS[arm].scale;
  const accrued = capture.total.total.sum;
  const fieldRequested = result.fieldWrites.requestedDose / scale;
  const pending = (capture.pending?.amount || 0);
  const accounted = fieldRequested + pending;
  const residual = accrued - accounted;
  const operationCount = capture.total.chunks * 8 + result.fieldWrites.pointWrites * 4
    + (capture.pending?.antCount || 0) * 2 + 32;
  const unitRoundoff = EPSILON / 2;
  const gamma = operationCount * unitRoundoff / (1 - operationCount * unitRoundoff);
  const derivedBound = gamma * (Math.abs(accrued) + Math.abs(accounted));
  return { accruedUnscaledChunkDose: accrued, fieldRequestedDose: result.fieldWrites.requestedDose,
    fieldRequestedDoseNormalized: fieldRequested, pendingUnscaledDabDose: pending, accountedUnscaledDose: accounted,
    residual, derivedFloatingPointBound: derivedBound, withinDerivedBound: Math.abs(residual) <= derivedBound,
    fieldAcceptedDose: result.fieldWrites.acceptedDose, boundaryRejectedDose: result.fieldWrites.boundaryRejectedDose,
    saturationLoss: result.fieldWrites.saturationLoss, pointWrites: result.fieldWrites.pointWrites,
    pendingDistance: capture.pending?.distance || 0, pendingAntCount: capture.pending?.antCount || 0 };
}

export async function runFullPass({ tempOutput, seconds = 600, evidenceDir = resolve(ROOT, PACKAGE, 'data') }) {
  assert(Number.isInteger(seconds) && seconds > 0);
  const parentData = resolve(ROOT, PARENT, 'data');
  const parentSummaryPath = resolve(parentData, 'SUMMARY.json'), parentManifestPath = resolve(parentData, 'SHA256SUMS.json');
  assert.equal(await sha(parentSummaryPath), EXPECTED_PARENT_SUMMARY, 'parent movement summary hash');
  assert.equal(await sha(parentManifestPath), EXPECTED_PARENT_MANIFEST, 'parent movement manifest hash');
  const parentManifest = await readJson(parentManifestPath);
  for (const [file, expected] of Object.entries(parentManifest)) assert.equal(await sha(resolve(parentData, file)), expected, file + ' parent hash');
  const parentSummary = await readJson(parentSummaryPath);
  assert.deepEqual(parentSummary.arms, [...ARMS_ORDER]); assert.deepEqual(parentSummary.seeds, [...SEEDS]);
  assert.equal(parentSummary.seconds, 600); assert.equal(parentSummary.tickRate, 60);
  assert.equal(parentSummary.sourceHashes['src/lib/agents/ant/AntController.js'],
    'e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04');
  assert.equal(parentSummary.sourceHashes['src/lib/agents/ant/GasterDeposition.js'],
    '0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41');
  const controllerSource = await readFile(resolve(ROOT, 'src/lib/agents/ant/AntController.js'), 'utf8');
  assert.equal(Number(controllerSource.match(/const DEPOSITION_BASELINE = ([0-9.]+);/)?.[1]), BASELINE_FACTOR);
  assert.equal(Number(controllerSource.match(/const DEPOSITION_ADHERENCE_EXPONENT = ([0-9.]+);/)?.[1]), ADHERENCE_EXPONENT);
  assert.match(controllerSource, /amountPerUnitDistance:\s*4\.5,\s*radius:\s*0\.0045,\s*reinforcementGain:\s*5,\s*depositionMode:\s*'dab'/);
  assert.match(controllerSource, /DEPOSITION_BASELINE \* \(0\.75 \+ 0\.25 \* localTrails\[index\]\.strength\)[\s\S]*?agent\.trailAdherence \*\* DEPOSITION_ADHERENCE_EXPONENT/);
  assert.deepEqual(ARMS, { C: { width: 96, scale: 1 }, F: { width: 316, scale: 1 }, G: { width: 316, scale: DOSE_SCALE } });
  assert.equal(DOSE_SCALE, 3969 / 361);
  assert.equal(BASELINE_FACTOR, 0.5); assert.equal(ADHERENCE_EXPONENT, 2);
  assert.equal(seconds, 600, 'full frozen movement parity uses 600 seconds');
  const evidenceEntries = await readdir(evidenceDir).catch(() => []);
  assert.equal(evidenceEntries.length, 0, 'new evidence data directory must start empty');
  const tempEntries = await readdir(tempOutput).catch(() => []);
  assert.equal(tempEntries.length, 0, 'temporary runner output directory must start empty');
  await mkdir(tempOutput, { recursive: true }); await mkdir(evidenceDir, { recursive: true });
  const parity = [];
  for (const arm of ARMS_ORDER) parity.push(await runObserverParity(arm));
  const scenarios = [];
  const generatedHashes = {};
  const accountingHashes = {};
  for (const seed of SEEDS) {
    const expectedScenario = parentSummary.scenarios.find(item => item.seed === seed);
    assert(expectedScenario, 'saved seed scenario exists');
    let commonInit = null, earlyMask = null;
    const scenario = { seed, arms: [] };
    for (const arm of ARMS_ORDER) {
      const capture = createCapture(seed, arm, seconds);
      activeCapture = capture;
      let result;
      try { result = await executeScenario(seed, arm, seconds, tempOutput, arm === 'C' ? null : earlyMask); }
      finally { activeCapture = null; }
      capture.total = aggregateThrough(capture.secondsData, seconds);
      assert.equal(capture.tick, seconds * 60, seed + '-' + arm + ' observed tick count');
      assert.equal(capture.rateMismatchCount, 0, seed + '-' + arm + ' exact production rate formula');
      assert.equal(capture.missingTrailStateCount, 0, seed + '-' + arm + ' source E/A available for every positive chunk');
      assert.equal(capture.total.chunks, capture.secondsData.reduce((sum, item) => sum + item.chunks, 0));
      assert.equal(result.initialStateSha256, expectedScenario.initialStateSha256, seed + '-' + arm + ' initial fingerprint');
      if (commonInit === null) commonInit = result.initialStateSha256;
      assert.equal(result.initialStateSha256, commonInit, seed + ' matched initial fingerprint');
      assert.equal(result.sourceConfig.width, ARMS[arm].width); assert.equal(result.sourceConfig.scale, ARMS[arm].scale);
      assert.equal(result.defaults.pheromone.reinforcementGain, 5);
      assert.equal(result.defaults.pheromone.amountPerUnitDistance, 4.5);
      assert.equal(result.defaults.pheromone.depositionMode, 'dab');
      const expectedArm = expectedScenario.arms.find(item => item.arm === arm);
      assert(expectedArm, 'saved arm result exists');
      const { wallSeconds, ...scientificResult } = result;
      assertSame(expectedArm, jsonValue(scientificResult), seed + '-' + arm + ' complete prior summary parity');
      const rawPath = resolve(tempOutput, result.timelineFile);
      const oldRawPath = resolve(parentData, expectedArm.timelineFile);
      generatedHashes[result.timelineFile] = await sha(rawPath);
      assert.equal(generatedHashes[result.timelineFile], await sha(oldRawPath), seed + '-' + arm + ' raw archive bytes');
      for (const mapFile of result.checkpointMapFiles) {
        generatedHashes[mapFile] = await sha(resolve(tempOutput, mapFile));
        assert.equal(generatedHashes[mapFile], await sha(resolve(parentData, mapFile)), seed + '-' + arm + ' map bytes ' + mapFile);
      }
      if (arm === 'C' && seconds >= 30) {
        const raw = JSON.parse(gunzipSync(await readFile(rawPath)).toString('utf8'));
        earlyMask = Uint8Array.from(raw.earlyRouteMask);
        assert(earlyMask.length > 0, 'C early route mask reproduced');
      }
      const secondsRows = capture.secondsData.map(item => snapshotSecond(item, result.timeline,
        result.checkpoints.find(point => point.seconds === item.second) || null, ARMS[arm].scale));
      const checkpoints = CHECKPOINTS.map(point => ({ seconds: point, ...summaryTotals(aggregateThrough(capture.secondsData, point), arm),
        population: result.checkpoints.find(value => value.seconds === point).activePopulation,
        activation: result.timeline[point - 1].activation,
        totalRealizedTravel: result.checkpoints.find(value => value.seconds === point).totalRealizedTravel,
        occupancy: result.checkpoints.find(value => value.seconds === point).occupancy,
        farHillMean: result.checkpoints.find(value => value.seconds === point).farHill.mean,
        localStrengthMean: result.checkpoints.find(value => value.seconds === point).localStrength.mean,
        parentAdherenceMean: result.checkpoints.find(value => value.seconds === point).adherence.mean }));
      const summary = { seed, arm, seconds, ticks: capture.tick, initialStateSha256: result.initialStateSha256,
        sourceConfig: result.sourceConfig, defaults: { pheromone: result.defaults.pheromone, audio: result.defaults.audioExperiment,
          population: result.defaults.population }, sourceTotals: summaryTotals(aggregateThrough(capture.secondsData, seconds), arm),
        checkpoints, observer: { rateMismatchCount: capture.rateMismatchCount, missingTrailStateCount: capture.missingTrailStateCount,
          maxRateError: capture.maxRateError, maxChunkClosureError: capture.maxChunkClosureError,
          positiveMovementChunks: capture.total.chunks, localReadCount: capture.total.e.count,
          farReadCount: capture.total.far.count },
        closure: closeAccounting(capture, result, arm), existingMovement: { totalTravel: result.movement.totalDistance,
          travelPerActiveAntSecond: result.movement.travelPerActiveAntSecond, contacts: result.events.contactGroups,
          births: result.events.plateBirths, fieldMax: result.checkpoints.at(-1).field.max,
          occupancy: result.checkpoints.at(-1).occupancy }, timelineFile: result.timelineFile };
      assert(summary.closure.withinDerivedBound, seed + '-' + arm + ' requested-dose closure');
      assert.equal(summary.observer.rateMismatchCount, 0); assert.equal(summary.observer.missingTrailStateCount, 0);
      assert.equal(summary.observer.localReadCount, result.trail.calls.intention);
      const accountingFile = 'seed' + seed + '-' + arm + '-source-accounting.json.gz';
      accountingHashes[accountingFile] = await writeDeterministicGzip(resolve(evidenceDir, accountingFile),
        { schemaVersion: 1, seed, arm, seconds,
          highAdherenceDefinition: 'A >= 0.75; upper ten of forty bins on [0,1]', rows: secondsRows });
      scenario.arms.push(summary);
      console.log(JSON.stringify({ seed, arm, wallSeconds, chunks: summary.observer.positiveMovementChunks,
        baseline: summary.sourceTotals.unscaled.baseline, reinforcement: summary.sourceTotals.unscaled.reinforcement,
        total: summary.sourceTotals.unscaled.total, closureResidual: summary.closure.residual }));
    }
    scenario.initialStateSha256 = commonInit; scenarios.push(scenario);
  }
  const sourceFiles = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
    'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GasterDeposition.js',
    'scripts/ant-316-gaussian-dose-unit-movement-shadow.js',
    'tests/ant-316-gaussian-dose-unit-movement-shadow.test.js',
    'scripts/ant-g-deposition-source-decomposition.js', 'tests/ant-g-deposition-source-decomposition.test.js',
    'docs/ant/README.md'];
  const sourceHashes = {};
  for (const path of sourceFiles) sourceHashes[path] = digest(await readFile(resolve(ROOT, path)));
  const prov = { schemaVersion: 1, freshMain: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2',
    parentBranch: 'codex/ant-316-gaussian-dose-unit-movement-shadow-20261024',
    parentCommit: '6c44253f7f1d6bb99653afe791bf257577a94e78',
    preregistrationCommit: '2526facfcf0feb4287964769c205123d1189109c',
    preregistrationSha256: await sha(resolve(ROOT, PACKAGE, 'PREREGISTRATION.md')),
    parentInputs: { summarySha256: await sha(parentSummaryPath), manifestSha256: await sha(parentManifestPath),
      manifestFileCount: Object.keys(parentManifest).length, verifiedFileCount: Object.keys(parentManifest).length },
    sourceHashes, arms: ARMS_ORDER, seeds: SEEDS, seconds, tickRate: 60, doseScale: DOSE_SCALE,
    productionLaw: { baselineFactor: BASELINE_FACTOR, reinforcementGain: 5, adherenceExponent: ADHERENCE_EXPONENT,
      amountPerUnitDistance: 4.5, mode: 'dab', fieldHalfLifeSeconds: 15, cap: 8 },
    observation: { methodsWrapped: ['AntController.tick', 'AntController.updateIntention', 'AntController.senseTrail',
      'GasterDeposition.advance', 'AntController.destroy'], originalCallCountPerInvocation: 1,
      observerRngCalls: 0, stateMutations: 0 },
    observerParity: parity, parentRunExactParity: { summaryArms: 9, rawArchives: 9,
      checkpointMaps: Object.keys(generatedHashes).length - 9, generatedHashes },
    runArtifacts: generatedHashes };
  const results = { schemaVersion: 1, decision: null, scenarios };
  const pooled = pooledExcess(scenarios);
  results.pooled = pooled;
  results.temporalAssociation = temporalAssociation(scenarios);
  results.decision = decide(scenarios, pooled);
  const summary = { provenance: prov, results };
  const generatedOnce = JSON.stringify(summary, null, 2) + '\n';
  const generatedTwice = JSON.stringify(structuredClone(summary), null, 2) + '\n';
  assert.equal(digest(generatedOnce), digest(generatedTwice), 'deterministic scientific summary generation');
  await writeFile(resolve(evidenceDir, 'SUMMARY.json'), generatedOnce, 'utf8');
  await writeFile(resolve(evidenceDir, 'DETERMINISM-RECEIPT.json'), JSON.stringify({
    scientificSummarySha256First: digest(generatedOnce), scientificSummarySha256Second: digest(generatedTwice),
    sourceAccountingSha256: Object.fromEntries(await Promise.all(SEEDS.flatMap(seed => ARMS_ORDER.map(async arm => {
      const file = 'seed' + seed + '-' + arm + '-source-accounting.json.gz';
      return [file, { ...accountingHashes[file], written: await sha(resolve(evidenceDir, file)) }];
    })))), repeatedScientificSerializationIdentical: true,
    fullMovementReplayParity: true, parentRawAndMapBytesMatched: true }, null, 2) + '\n');
  const manifest = {};
  for (const file of await readdir(evidenceDir)) {
    if (file === 'SHA256SUMS.json') continue;
    manifest[file] = await sha(resolve(evidenceDir, file));
  }
  await writeFile(resolve(evidenceDir, 'SHA256SUMS.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return summary;
}

function pooledExcess(scenarios) {
  const c = { baseline: 0, reinforcement: 0, total: 0 }, g = { baseline: 0, reinforcement: 0, total: 0 };
  const perSeed = [];
  for (const scenario of scenarios) {
    const cTotals = scenario.arms.find(item => item.arm === 'C').sourceTotals.unscaled;
    const gTotals = scenario.arms.find(item => item.arm === 'G').sourceTotals.normalized;
    const delta = { baseline: gTotals.baseline - cTotals.baseline,
      reinforcement: gTotals.reinforcement - cTotals.reinforcement, total: gTotals.total - cTotals.total };
    perSeed.push({ seed: scenario.seed, C: cTotals, Gnormalized: gTotals, delta,
      signedShare: { baseline: delta.baseline / delta.total, reinforcement: delta.reinforcement / delta.total } });
    for (const key of Object.keys(c)) { c[key] += cTotals[key]; g[key] += gTotals[key]; }
  }
  const delta = { baseline: g.baseline - c.baseline, reinforcement: g.reinforcement - c.reinforcement,
    total: g.total - c.total };
  return { C: c, Gnormalized: g, delta,
    signedShare: { baseline: delta.baseline / delta.total, reinforcement: delta.reinforcement / delta.total }, perSeed };
}
function temporalAssociation(scenarios) {
  return scenarios.map(scenario => ({ seed: scenario.seed, arms: scenario.arms.map(arm => ({ arm: arm.arm,
    checkpoints: arm.checkpoints.map(point => ({ seconds: point.seconds, baseline: point.unscaled.baseline,
      reinforcement: point.unscaled.reinforcement, total: point.unscaled.total,
      reinforcementShare: point.unscaled.reinforcementShare, meanE: point.E.mean, meanA: point.A.mean,
      meanA2: point.A2.mean, highATravelShare: point.highA.travelShare,
      highAReinforcementShare: point.highA.reinforcementShare, farHillMean: point.far.hillMean,
      population: point.population, totalTravel: point.totalRealizedTravel,
      cumulativeCoverage: point.occupancy.cumulativeCoverage,
      top10OccupancyShare: point.occupancy.cumulative.top10PercentMassShare })) })) }));
}
function decide(scenarios, pooled) {
  if (scenarios.length !== 3 || scenarios.some(item => item.arms.length !== 3
    || item.arms.some(arm => !arm.closure.withinDerivedBound || arm.observer.rateMismatchCount
      || arm.observer.missingTrailStateCount))) return 'INCONCLUSIVE';
  if (!(pooled.delta.total > 0)) return 'NO MATERIAL EXCESS AFTER ACCOUNTING';
  const seedSigns = pooled.perSeed.map(item => Math.sign(item.delta.total));
  if (!seedSigns.every(sign => sign > 0)) return 'MIXED SOURCE AMPLIFICATION';
  const baselineShare = pooled.signedShare.baseline, reinforcementShare = pooled.signedShare.reinforcement;
  if (baselineShare > 0 && reinforcementShare > 0) {
    if (reinforcementShare > baselineShare && pooled.perSeed.every(item => item.delta.reinforcement > 0)) {
      return 'REINFORCEMENT-DOMINATED EXCESS';
    }
    if (baselineShare > reinforcementShare && pooled.perSeed.every(item => item.delta.baseline > 0)) {
      return 'BASELINE-DOMINATED EXCESS';
    }
    return 'MIXED SOURCE AMPLIFICATION';
  }
  if (reinforcementShare > 1 && pooled.perSeed.every(item => item.delta.reinforcement > 0)) return 'REINFORCEMENT-DOMINATED EXCESS';
  if (baselineShare > 1 && pooled.perSeed.every(item => item.delta.baseline > 0)) return 'BASELINE-DOMINATED EXCESS';
  return 'MIXED SOURCE AMPLIFICATION';
}

function parseArgs() {
  return new Map(process.argv.slice(2).map(arg => {
    const i = arg.indexOf('='); return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
  }));
}
async function main() {
  const args = parseArgs();
  if (args.has('--selfcheck')) {
    assert.equal(decomposeDose({ travelled: 1, amountPerUnitDistance: 4.5 * (0.5 * 0.75 + 5 * 0.25 ** 2),
      trailStrength: 0, adherence: 0.25 }).sourceResidual, 0);
    const parity = [];
    for (const arm of ARMS_ORDER) parity.push(await runObserverParity(arm));
    console.log(JSON.stringify({ formula: 'pass', observerParity: parity }, null, 2)); return;
  }
  const output = args.get('--run-output');
  if (!output) throw new Error('Pass an empty --run-output directory under the approved temporary workspace.');
  const evidenceOutput = args.get('--evidence-output') || resolve(ROOT, PACKAGE, 'data');
  const summary = await runFullPass({ tempOutput: resolve(output), evidenceDir: resolve(evidenceOutput) });
  console.log(JSON.stringify({ decision: summary.results.decision, pooled: summary.results.pooled,
    evidence: resolve(ROOT, PACKAGE, 'data') }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
