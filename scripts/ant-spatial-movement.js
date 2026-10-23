import { routeTangent, projectRoute } from './ant-route-curvature-probes.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { makeSpatialController } from './ant-spatial-core.js';
import { runSpatialCase } from './ant-spatial-run.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const TAU = Math.PI * 2;
const DT = 1 / 60;
const TURN_DAMPING = 0.65;
const OMEGA_LIMIT = 2.2;
const TURN_LIMIT = 4.5;
const LOCAL_TURN_LIMIT = 0.45;
const FIELD_RANGE = [-0.12, 0.34];
const SHAPES = ['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve'];
const FIELD_MODES = ['analytic', 'deposited96'];
const SEEDS = [19, 61, 193];
const MOVEMENTS = ['production', 'dtFeedback', 'dampingOff'];
const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PRIOR_CONTROL = resolve(ROOT, 'docs/ant/evidence/2026-10-22-route-curvature-survey/controlled/controlled-results.json');
const PRIOR_SHA256 = '9615a86610e651753e89b3abea0a2a15527f26af6a12b63d86dc21f348b19578';
const DEFAULT_CONTROLLED_OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-22-spatial-dynamics/movement/controlled-results.json');
const DEFAULT_NATURAL_DIR = resolve(ROOT, 'docs/ant/evidence/2026-10-22-spatial-dynamics/movement/natural');

export function measureSpatialMovement(shapeName, samples, { dtSeconds = 1 / 60, lowSpeed = 0.01 } = {}) {
  if (!Array.isArray(samples) || samples.length < 2 || !(dtSeconds > 0) || !Number.isFinite(dtSeconds)) {
    throw new TypeError('Expected at least two movement samples and a positive finite timestep.');
  }
  const projected = samples.map(sample => {
    if (!sample || ![sample.x, sample.y].every(Number.isFinite)) {
      throw new TypeError('Each movement sample needs finite x/y.');
    }
    return { ...sample, route: projectRoute(shapeName, sample.x, sample.y) };
  });
  let pathLength = 0, signedPathTurn = 0, absolutePathTurn = 0;
  let signedRouteTurn = 0, absoluteRouteTurn = 0, matchingTurnSignPairs = 0, eligibleTurnPairs = 0;
  let previousTravelHeading = null, previousTurnSign = 0, sameSignPairs = 0, turnSignPairs = 0;
  let sameSignRun = 0, longestSameSignRun = 0, bodyReversals = 0, bodySignPairs = 0;
  const bodyOmega = [];
  let omegaCount = 0, capSamples = 0, speedSamples = 0, lowSpeedSamples = 0;
  let speedTotal = 0, headingErrorTotal = 0, headingSamples = 0;
  const crossTrack = [], routeStations = [];

  for (let index = 0; index < projected.length; index += 1) {
    const sample = projected[index];
    crossTrack.push(sample.route.crossTrack);
    routeStations.push(sample.route.station);
    if (Number.isFinite(sample.heading)) {
      headingErrorTotal += Math.abs(signedAngle(sample.heading - sample.route.tangent));
      headingSamples += 1;
    }
    const speed = Number.isFinite(sample.speed) ? sample.speed
      : Number.isFinite(sample.vx) && Number.isFinite(sample.vy) ? Math.hypot(sample.vx, sample.vy) : null;
    if (speed !== null) {
      speedSamples += 1;
      speedTotal += speed;
      if (speed < lowSpeed) lowSpeedSamples += 1;
    }
    const omega = sample.angularVelocity;
    if (index > 0 && Number.isFinite(omega)) {
      omegaCount += 1;
      if (Math.abs(omega) >= 4.5 - 1e-9) capSamples += 1;
      bodyOmega.push(omega);
    }
  }
  for (let index = 1; index < bodyOmega.length; index += 1) {
    const before = bodyOmega[index - 1], after = bodyOmega[index];
    if (before && after) {
      bodySignPairs += 1;
      if (Math.sign(before) !== Math.sign(after)) bodyReversals += 1;
    }
  }

  for (let index = 1; index < projected.length; index += 1) {
    const before = projected[index - 1], after = projected[index];
    const dx = after.x - before.x, dy = after.y - before.y;
    const distance = Math.hypot(dx, dy);
    pathLength += distance;
    const routeTurn = signedAngle(after.route.tangent - before.route.tangent);
    signedRouteTurn += routeTurn;
    absoluteRouteTurn += Math.abs(routeTurn);
    if (distance <= 1e-12) {
      previousTravelHeading = null;
      previousTurnSign = 0;
      sameSignRun = 0;
      continue;
    }
    const travelHeading = Math.atan2(dy, dx);
    if (previousTravelHeading !== null) {
      const turn = signedAngle(travelHeading - previousTravelHeading);
      const sign = Math.sign(turn);
      signedPathTurn += turn;
      absolutePathTurn += Math.abs(turn);
      if (sign && previousTurnSign) {
        turnSignPairs += 1;
        if (sign === previousTurnSign) sameSignPairs += 1;
      }
      sameSignRun = sign && sign === previousTurnSign ? sameSignRun + 1 : sign ? 1 : 0;
      longestSameSignRun = Math.max(longestSameSignRun, sameSignRun);
      if (sign && Math.abs(routeTurn) > 1e-8) {
        eligibleTurnPairs += 1;
        if (sign === Math.sign(routeTurn)) matchingTurnSignPairs += 1;
      }
      previousTurnSign = sign;
    }
    previousTravelHeading = travelHeading;
  }

  const first = projected[0], last = projected.at(-1);
  const chordLength = Math.hypot(last.x - first.x, last.y - first.y);
  const sortedAbsoluteCrossTrack = crossTrack.map(Math.abs).sort((a, b) => a - b);
  return {
    sampleCount: projected.length,
    pathLength,
    chordLength,
    chordToPath: pathLength > 1e-12 ? chordLength / pathLength : null,
    signedPathTurnRadians: signedPathTurn,
    absolutePathTurnRadians: absolutePathTurn,
    signedPathTurnPerDistance: pathLength > 1e-12 ? signedPathTurn / pathLength : null,
    absolutePathTurnPerDistance: pathLength > 1e-12 ? absolutePathTurn / pathLength : null,
    signedRouteTangentTurnRadians: signedRouteTurn,
    absoluteRouteTangentTurnRadians: absoluteRouteTurn,
    routeTurnSignAgreement: eligibleTurnPairs ? matchingTurnSignPairs / eligibleTurnPairs : null,
    sameSignTurnPairFraction: turnSignPairs ? sameSignPairs / turnSignPairs : null,
    longestSameSignTurnRunSeconds: longestSameSignRun * dtSeconds,
    bodyOmegaReversalFraction: bodySignPairs ? bodyReversals / bodySignPairs : null,
    bodyOmegaLag1Correlation: lagCorrelation(bodyOmega, 1),
    bodyTurnCapFraction: omegaCount ? capSamples / omegaCount : null,
    meanSignedCrossTrack: mean(crossTrack),
    meanAbsoluteCrossTrack: mean(sortedAbsoluteCrossTrack),
    p90AbsoluteCrossTrack: quantile(sortedAbsoluteCrossTrack, 0.9),
    maximumAbsoluteCrossTrack: sortedAbsoluteCrossTrack.at(-1) ?? null,
    routeProgress: last.route.station - first.route.station,
    minimumRouteStation: Math.min(...routeStations),
    maximumRouteStation: Math.max(...routeStations),
    meanAbsoluteHeadingToRouteTangent: headingSamples ? headingErrorTotal / headingSamples : null,
    meanSpeed: speedSamples ? speedTotal / speedSamples : null,
    lowSpeedFraction: speedSamples ? lowSpeedSamples / speedSamples : null,
    lowSpeedThreshold: lowSpeed
  };
}

export function angularFeedbackTerm(movement, previousOmega, adherence, dtSeconds = DT) {
  if (!MOVEMENTS.includes(movement) || ![previousOmega, adherence, dtSeconds].every(Number.isFinite)
    || dtSeconds <= 0) throw new TypeError('Expected a movement mode and finite rate, adherence and timestep.');
  if (movement === 'dampingOff') return 0;
  const rate = Math.max(-OMEGA_LIMIT, Math.min(OMEGA_LIMIT, previousOmega));
  return -rate * TURN_DAMPING * adherence * (movement === 'dtFeedback' ? dtSeconds : 1);
}

/** Unforced one-tick recurrence only; it omits intention, sensing, collisions and speed response. */
export function unforcedFeedbackRecurrence(movement, { initialTurn = TURN_LIMIT * DT, adherence = 1,
  dtSeconds = DT, ticks = 12 } = {}) {
  if (!Number.isInteger(ticks) || ticks < 1) throw new TypeError('Expected a positive integer tick count.');
  let previousTurn = initialTurn;
  return Array.from({ length: ticks }, (_, index) => {
    const previousOmega = previousTurn / dtSeconds;
    const feedback = angularFeedbackTerm(movement, previousOmega, adherence, dtSeconds);
    const localTurn = Math.max(-LOCAL_TURN_LIMIT, Math.min(LOCAL_TURN_LIMIT, feedback));
    const realizedTurn = Math.max(-TURN_LIMIT * dtSeconds, Math.min(TURN_LIMIT * dtSeconds, localTurn));
    previousTurn = realizedTurn;
    return { tick: index + 1, previousOmega, feedbackRadians: feedback, realizedTurnRadians: realizedTurn };
  });
}

export async function runControlledMovement({ output = DEFAULT_CONTROLLED_OUTPUT } = {}) {
  const helpers = await loadCurvatureHelpers();
  const prior = await loadPriorControls();
  const compatibility = prior ? await checkPriorCompatibility(prior, helpers) : { reusable: false, checks: [], reason: 'prior raw capture unavailable or hash mismatch' };
  const reusable = compatibility.reusable;
  const modes = reusable ? ['dtFeedback'] : MOVEMENTS;
  const receipts = {};
  const cases = [];
  for (const movement of modes) {
    const definition = await makeSpatialController({ movement, field: 'production', recruitment: 'north' });
    receipts[movement] = definition.receipt;
    for (const shape of SHAPES) for (const fieldMode of FIELD_MODES) for (const seed of SEEDS) {
      cases.push(await runControlledCase(helpers, definition, movement, shape, fieldMode, seed, prior, reusable));
    }
  }
  const result = { schemaVersion: 1, createdAt: new Date().toISOString(), baselineRevision: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2',
    protocol: { durationSeconds: 3, dtSeconds: DT, shapes: SHAPES, fieldModes: FIELD_MODES, seeds: SEEDS,
      movementModes: modes, oneAntAfterInit: true, controllerTick: 'exact AntController.tick(1/60); no sensor or field-kernel replacement',
      entry: { x: 0.35, y: 0.5, normalOffset: 0.004, station: 0, initialSpeed: 0.08 },
      analytic: { peak: 0.5, gaussianSigma: 0.0025 }, deposited96: { amountPerUnitDistance: 4.5, radius: 0.0045, range: FIELD_RANGE, sampleStep: 0.002 },
      feedbackTerm: 'production: -clamp(previousOmega,-2.2,+2.2)*0.65*A; dtFeedback multiplies this exact term by dt; dampingOff sets only this term to zero',
      interpretation: 'Synthetic route tracking is an engineering capability probe, not natural route choice or biological curvature sensing.' },
    priorControls: reusable ? { path: '2026-10-22-route-curvature-survey/controlled/controlled-results.json', sha256: PRIOR_SHA256,
      revision: prior.revision, executionProbeSha256: prior.sourceHashes['scripts\\ant-route-curvature-probes.js'], compatibility } : { reused: false, compatibility },
    sourceHashes: await sourceHashes(), controllerReceipts: receipts,
    recurrenceDiagnostic: Object.fromEntries(MOVEMENTS.map(mode => [mode, unforcedFeedbackRecurrence(mode)])), cases };
  await writeJsonOnce(output, result);
  return { output, cases: cases.length, reusedHistoricalControls: reusable, compatibility };
}

export async function runNaturalMovementScreen({ seconds = 600, outputDir = DEFAULT_NATURAL_DIR } = {}) {
  assert.equal(seconds, 600, 'the preregistered natural screen is fixed at 600 model seconds');
  const files = [];
  const runs = [
    ...[20261005, 20261006, 20261007].map(seed => ({ movement: 'dtFeedback', seed })),
    { movement: 'dampingOff', seed: 20261005 }
  ];
  for (const { movement, seed } of runs) {
    const { Controller, receipt } = await makeSpatialController({ movement, field: 'production', recruitment: 'north' });
    const output = resolve(outputDir, `${movement}-${seed}`, 'result.json');
    const result = await runSpatialCase({ Controller, receipt, seed, seconds, output, label: movement });
    files.push({ output, seed, movement, wallSeconds: result.wallSeconds, final: result.final });
  }
  return { files };
}

async function runControlledCase(helpers, definition, movement, shape, fieldMode, seed, prior, reusable) {
  const fixture = await helpers.createFixture({ Controller: definition.Controller,
    variant: movement === 'production' ? 'baseline' : movement }, seed, shape);
  const source = fieldMode === 'analytic'
    ? { mode: 'analytic', peak: 0.5, sigma: 0.0025 }
    : { mode: 'deposited96', ...helpers.seedField(fixture.controller.field, shape, 'preserve') };
  let frozenGridHash = null;
  if (fieldMode === 'analytic') {
    fixture.controller.field.sample = (x, y) => helpers.smoothRouteSample(shape, x, y);
  } else {
    assert.equal(fixture.controller.field.width, 96);
    assert.equal(fixture.controller.field.height, 96);
    const frozen = new PheromoneField({ width: fixture.controller.field.width, height: fixture.controller.field.height,
      decayHalfLifeSeconds: fixture.controller.field.decayHalfLifeSeconds, maxValue: fixture.controller.field.maxValue });
    frozen.values.set(fixture.controller.field.values);
    frozenGridHash = sha256(Buffer.from(frozen.values.buffer, frozen.values.byteOffset, frozen.values.byteLength));
    fixture.controller.field.sample = frozen.sample.bind(frozen);
  }
  fixture.feedbackTrace = [];
  const tick = fixture.controller.tick.bind(fixture.controller);
  fixture.controller.tick = dt => {
    const previousOmega = fixture.ant.angularVelocity;
    tick(dt);
    fixture.feedbackTrace.push({ previousOmega, angularVelocity: fixture.ant.angularVelocity,
      adherence: fixture.ant.trailAdherence, dtSeconds: dt,
      feedbackRadians: angularFeedbackTerm(movement, previousOmega, fixture.ant.trailAdherence, dt) });
  };
  const run = await helpers.runPass(fixture, shape, 3, seed);
  assert.equal(run.ticks, 180);
  assert.equal(fixture.feedbackTrace.length, run.ticks);
  assert.ok(fixture.controller.agents.length <= 1, 'fixture stays at one agent after normalization floor is corrected');
  const historical = reusable && (movement === 'dtFeedback' ? null
    : findPrior(prior, shape, fieldMode, seed, movement));
  if (historical) assert.deepEqual(run.samples, historical.samples, 'historical production/damping-off per-tick samples match');
  const samples = run.samples.map((sample, index) => {
    if (!index) return { ...sample, angularVelocity: 0, previousAngularVelocity: 0, trailAdherence: 0 };
    const feedback = fixture.feedbackTrace[index - 1];
    return { ...sample, angularVelocity: feedback.angularVelocity, previousAngularVelocity: feedback.previousOmega,
      trailAdherence: feedback.adherence, feedbackTermRadians: feedback.feedbackRadians,
      unconstrainedLocalTurn: sample.localSteeringTerm + feedback.feedbackRadians };
  });
  const summary = measureSpatialMovement(shape, samples, { dtSeconds: DT });
  const controlReference = reusable && movement === 'dtFeedback'
    ? Object.fromEntries(['production', 'dampingOff'].map(mode => [mode, summarizePrior(findPrior(prior, shape, fieldMode, seed, mode))]))
    : null;
  const material = fixture.controller.materialStratigraphy.getSnapshot();
  const result = { shape, fieldMode, seed, movement, durationSeconds: run.durationSeconds,
    ticks: run.ticks, survived: run.survived, survivalFraction: run.survivalFraction,
    randomDraws: run.randomDraws, source, frozenGridHash,
    meanAdherence: run.meanAdherence, meanLocalStrength: run.meanLocalStrength,
    meanLocalCoherence: run.meanLocalCoherence, meanSenseTrail: run.meanSenseTrail,
    feedback: summarizeFeedback(fixture.feedbackTrace), summary,
    legacyWindows: run.pathCurvatureWindows,
    materialOutcome: { acceptedFootContacts: fixture.controller.materialStratigraphy.totalAcceptedFootContacts,
      plates: material.plates.length, nodules: material.nodules.length, pheromoneMass: fixture.controller.field.getSnapshot().totalMass },
    historicalControls: controlReference, samples };
  await fixture.controller.destroy();
  return result;
}

async function loadCurvatureHelpers() {
  const url = new URL('./ant-route-curvature-probes.js', import.meta.url);
  const source = await readFile(url, 'utf8');
  const guard = source.lastIndexOf('\nconst mainPath');
  assert.ok(guard > 0, 'route probe CLI guard is present');
  const moduleSource = source.slice(0, guard)
    .replaceAll('import.meta.url', JSON.stringify(url.href))
    .replace(/from '(\.{1,2}\/[^']+)'/g, (_, path) => `from '${new URL(path, url).href}'`)
    + '\nexport { createFixture, runPass, seedField, smoothRouteSample };\n';
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`;
  return { ...(await import(moduleUrl)), sourceSha256: sha256(source) };
}

async function loadPriorControls() {
  try {
    const bytes = await readFile(PRIOR_CONTROL);
    if (sha256(bytes) !== PRIOR_SHA256) return null;
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function checkPriorCompatibility(prior, helpers) {
  const checks = [];
  const baseFiles = [
    ['src\\lib\\agents\\ant\\AntController.js', '../src/lib/agents/ant/AntController.js'],
    ['src\\lib\\agents\\ant\\AntAgent.js', '../src/lib/agents/ant/AntAgent.js'],
    ['src\\lib\\agents\\ant\\PheromoneField.js', '../src/lib/agents/ant/PheromoneField.js'],
    ['src\\lib\\agents\\ant\\GasterDeposition.js', '../src/lib/agents/ant/GasterDeposition.js']
  ];
  for (const [evidencePath, currentPath] of baseFiles) {
    const current = sha256(await readFile(new URL(currentPath, import.meta.url)));
    checks.push({ kind: 'production-source', path: evidencePath, match: current === prior.sourceHashes[evidencePath] });
  }
  const representative = ['gentle', 'gentleMirror', 'sCurve'];
  for (const shape of representative) for (const fieldMode of FIELD_MODES) for (const movement of ['production', 'dampingOff']) {
    const seed = 19, { Controller } = await makeSpatialController({ movement, field: 'production', recruitment: 'north' });
    const fixture = await helpers.createFixture({ Controller, variant: movement === 'production' ? 'baseline' : movement }, seed, shape);
    if (fieldMode === 'analytic') fixture.controller.field.sample = (x, y) => helpers.smoothRouteSample(shape, x, y);
    else {
      helpers.seedField(fixture.controller.field, shape, 'preserve');
      const frozen = new PheromoneField({ width: fixture.controller.field.width, height: fixture.controller.field.height,
        decayHalfLifeSeconds: fixture.controller.field.decayHalfLifeSeconds, maxValue: fixture.controller.field.maxValue });
      frozen.values.set(fixture.controller.field.values);
      fixture.controller.field.sample = frozen.sample.bind(frozen);
    }
    const fresh = await helpers.runPass(fixture, shape, 3, seed);
    const historical = findPrior(prior, shape, fieldMode, seed, movement);
    const match = !!historical && isDeepStrictEqual(fresh.samples, historical.samples);
    checks.push({ kind: 'sample-replay', shape, fieldMode, seed, movement, match,
      freshSamples: fresh.samples.length, historicalSamples: historical?.samples.length ?? 0 });
    await fixture.controller.destroy();
  }
  return { reusable: checks.every(check => check.match), checks,
    reason: checks.every(check => check.match) ? 'production sources and representative complete per-tick fixtures matched' : 'at least one source or per-tick fixture differed; rerun all modes fresh' };
}

function findPrior(prior, shape, fieldMode, seed, movement) {
  const historicalField = fieldMode === 'analytic' ? 'smooth' : 'depositedFrozen';
  const historicalMovement = movement === 'production' ? 'baseline' : movement;
  return prior?.capability.find(item => item.shape === shape && item.fieldMode === historicalField
    && item.seed === seed && item.variant === historicalMovement) ?? null;
}

function summarizePrior(item) {
  if (!item) throw new Error('Missing matched historical control case.');
  return { revision: 'd0e07d0', fieldMode: item.fieldMode, seed: item.seed, variant: item.variant,
    survived: item.survived, meanSpeed: item.meanSpeed, meanAbsoluteCrossTrack: item.meanAbsoluteCrossTrack,
    p90AbsoluteCrossTrack: item.p90AbsoluteCrossTrack, turnCapFraction: item.turnCapFraction,
    bodyTurnDynamics: item.bodyTurnDynamics, pathCurvatureWindows: item.pathCurvatureWindows };
}

function summarizeFeedback(trace) {
  const values = trace.map(item => item.feedbackRadians);
  const abs = values.map(Math.abs);
  return { samples: trace.length, meanSignedRadians: mean(values), meanAbsoluteRadians: mean(abs),
    maxAbsoluteRadians: Math.max(...abs), feedbackTermExceedsLocalTurnLimitFraction: trace.filter(item => Math.abs(item.feedbackRadians) > LOCAL_TURN_LIMIT).length / Math.max(1, trace.length),
    first12: trace.slice(0, 12) };
}

async function sourceHashes() {
  const paths = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
    'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GasterDeposition.js',
    'scripts/ant-route-curvature-probes.js', 'scripts/ant-route-curvature-metrics.js',
    'scripts/ant-route-curvature-shadows.js', 'scripts/ant-spatial-core.js', 'scripts/ant-spatial-movement.js'];
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, sha256(await readFile(resolve(ROOT, path)))])));
}

async function writeJsonOnce(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, { flag: 'wx' });
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function quantile(sorted, p) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p, lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * (index - lower);
}
function lagCorrelation(values, lag) {
  if (values.length <= lag) return null;
  const left = values.slice(lag), right = values.slice(0, -lag);
  const leftMean = mean(left), rightMean = mean(right);
  let numerator = 0, leftSquares = 0, rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] - leftMean, b = right[index] - rightMean;
    numerator += a * b;
    leftSquares += a * a;
    rightSquares += b * b;
  }
  const denominator = Math.sqrt(leftSquares * rightSquares);
  return denominator ? numerator / denominator : null;
}
function signedAngle(angle) { return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI; }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = process.argv.includes('--natural')
    ? await runNaturalMovementScreen()
    : await runControlledMovement();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
