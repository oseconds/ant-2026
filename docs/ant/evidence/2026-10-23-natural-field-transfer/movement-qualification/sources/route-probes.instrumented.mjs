import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PheromoneField } from 'file:///C:/Users/5dudt/Documents/Github/ant-2026/src/lib/agents/ant/PheromoneField.js';
import { analyzeRouteCurvature } from 'file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-route-curvature-metrics.js';
import { makeCurvatureController } from 'file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-route-curvature-shadows.js';

const DT = 1 / 60;
const MAX_TURN_RATE = 4.5;
const ANGULAR_VELOCITY_CLAMP = 2.2;
const LOCAL_TURN_DAMPING = 0.65;
const LOCAL_STEERING_LIMIT = 0.45;
const TRAIL_STEERING_BASE = 0.35;
const TRAIL_STEERING_ADHERENCE = 0.65;
const START = { x: 0.35, y: 0.5 };
const FIELD_RANGE = [-0.12, 0.34];
const FIELD_STEP = 0.002;
const PHEROMONE_RATE = 4.5;
const DEPOSIT_RADIUS = 0.0045;
const SMOOTH_PEAK = 0.5;
const SMOOTH_SIGMA = 0.0025;
const LOCAL_HALF_SATURATION = 0.018;
const RIDGE_SCAN_HALF_WIDTH = 0.24;
const RIDGE_SCAN_STEP = 0.002;
const SPLIT_GAP = [0.08, 0.15];
const NOISE_AMPLITUDE = DEPOSIT_RADIUS;
const NOISE_WAVELENGTH = 8 * 0.014;
const SEEDS = [19, 61, 193];
const OUTPUT = fileURLToPath(new URL('../docs/ant/evidence/2026-10-22-route-curvature-survey/controlled/controlled-results.json', "file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-route-curvature-probes.js"));
const ROOT = fileURLToPath(new URL('../', "file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-route-curvature-probes.js"));
const HASH = value => createHash('sha256').update(value).digest('hex');
const CONTROLLER_URL = new URL('../src/lib/agents/ant/AntController.js', "file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-route-curvature-probes.js");
const AGENT_URL = new URL('../src/lib/agents/ant/AntAgent.js', "file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-route-curvature-probes.js");
const FIELD_URL = new URL('../src/lib/agents/ant/PheromoneField.js', "file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-route-curvature-probes.js");
const DEPOSITION_URL = new URL('../src/lib/agents/ant/GasterDeposition.js', "file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-route-curvature-probes.js");
const METRICS_URL = new URL('./ant-route-curvature-metrics.js', "file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-route-curvature-probes.js");
const SHADOWS_URL = new URL('./ant-route-curvature-shadows.js', "file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-route-curvature-probes.js");
const SCRIPT_URL = new URL("file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-route-curvature-probes.js");

const shapes = {
  straight: { kind: 'straight' },
  gentle: { kind: 'circle', radius: 0.25 },
  tight: { kind: 'circle', radius: 0.1 },
  gentleMirror: { kind: 'circle', radius: 0.25, orientation: -1 },
  tightMirror: { kind: 'circle', radius: 0.1, orientation: -1 },
  sCurve: { kind: 'sine', amplitude: 0.018, wavelength: 0.32 }
};
const variants = ['baseline', 'dampingOff'];
const stageCVariants = ['baseline', 'dampingOff'];
const treatments = ['preserve', 'straighten', 'split', 'noisy'];

const sineArcTable = buildSineArcTable(shapes.sCurve);

export function routeAt(shapeName, station) {
  const shape = shapes[shapeName];
  if (!shape || !Number.isFinite(station)) throw new TypeError('Expected a named route and finite station.');
  if (shape.kind === 'straight') return { x: START.x + station, y: START.y };
  if (shape.kind === 'circle') {
    const orientation = shape.orientation ?? 1;
    return {
      x: START.x + shape.radius * Math.sin(station / shape.radius),
      y: START.y + orientation * shape.radius * (1 - Math.cos(station / shape.radius))
    };
  }
  const u = sineParameterAtStation(station);
  return { x: START.x + u, y: START.y + shape.amplitude * Math.sin(2 * Math.PI * u / shape.wavelength) };
}

export function routeTangent(shapeName, station) {
  const shape = shapes[shapeName];
  if (shape.kind === 'straight') return 0;
  if (shape.kind === 'circle') return (shape.orientation ?? 1) * station / shape.radius;
  const u = sineParameterAtStation(station), k = 2 * Math.PI / shape.wavelength;
  return Math.atan2(shape.amplitude * k * Math.cos(k * u), 1);
}

export function projectRoute(shapeName, x, y, sMin = FIELD_RANGE[0], sMax = FIELD_RANGE[1]) {
  const shape = shapes[shapeName];
  if (!shape || ![x, y, sMin, sMax].every(Number.isFinite) || sMin > sMax) {
    throw new TypeError('Expected a named route and finite ordered projection bounds.');
  }
  let station;
  if (shape.kind === 'straight') {
    station = clamp(x - START.x, sMin, sMax);
  } else if (shape.kind === 'circle') {
    const orientation = shape.orientation ?? 1;
    const centerY = START.y + orientation * shape.radius;
    const angle = Math.atan2(x - START.x, -orientation * (y - centerY));
    const candidates = [sMin, sMax];
    for (let turn = -2; turn <= 2; turn += 1) {
      const candidate = shape.radius * (angle + turn * Math.PI * 2);
      if (candidate >= sMin && candidate <= sMax) candidates.push(candidate);
    }
    station = candidates.reduce((best, candidate) => distanceToRoutePoint(shapeName, x, y, candidate)
      < distanceToRoutePoint(shapeName, x, y, best) ? candidate : best, candidates[0]);
  } else {
    let u = clamp(x - START.x, sineArcTable[0].u, sineArcTable.at(-1).u);
    const k = 2 * Math.PI / shape.wavelength;
    for (let i = 0; i < 5; i += 1) {
      const curveY = shape.amplitude * Math.sin(k * u);
      const slope = shape.amplitude * k * Math.cos(k * u);
      const second = -shape.amplitude * k * k * Math.sin(k * u);
      const gradient = u - (x - START.x) + (curveY - (y - START.y)) * slope;
      const hessian = 1 + slope * slope + (curveY - (y - START.y)) * second;
      if (!Number.isFinite(hessian) || Math.abs(hessian) < 1e-9) break;
      u = clamp(u - gradient / hessian, sineArcTable[0].u, sineArcTable.at(-1).u);
    }
    const candidates = [sMin, sMax, clamp(stationAtSineParameter(u), sMin, sMax)];
    station = candidates.reduce((best, candidate) => distanceToRoutePoint(shapeName, x, y, candidate)
      < distanceToRoutePoint(shapeName, x, y, best) ? candidate : best, candidates[0]);
  }
  const point = routeAt(shapeName, station), tangent = routeTangent(shapeName, station);
  const dx = x - point.x, dy = y - point.y;
  return {
    station,
    distance: Math.hypot(dx, dy),
    crossTrack: Math.cos(tangent) * dy - Math.sin(tangent) * dx,
    tangent
  };
}

export function makeRoutePoints(shapeName, sMin, sMax, step = FIELD_STEP, treatment = 'preserve') {
  if (!(step > 0) || !Number.isFinite(step) || sMin >= sMax) throw new RangeError('Invalid route sampling range.');
  const stations = new Set();
  for (let station = sMin; station < sMax; station += step) stations.add(Number(station.toFixed(9)));
  stations.add(Number(sMin.toFixed(9)));
  stations.add(Number(sMax.toFixed(9)));
  if (treatment === 'split') for (const station of SPLIT_GAP) {
    if (station > sMin && station < sMax) stations.add(station);
  }
  return [...stations].sort((a, b) => a - b).map(station => ({
    station, ...treatmentPoint(shapeName, station, treatment)
  }));
}

export function measureFieldRidge(sample, shapeName, sMin = FIELD_RANGE[0], sMax = FIELD_RANGE[1]) {
  if (typeof sample !== 'function') throw new TypeError('Field sample must be a function.');
  const stationCount = Math.floor((sMax - sMin) / FIELD_STEP) + 1;
  const offsetCount = Math.floor(2 * RIDGE_SCAN_HALF_WIDTH / RIDGE_SCAN_STEP) + 1;
  const covered = [], ridgeOffsets = [];
  let centerlineCovered = 0, currentGap = 0, maxGap = 0;
  for (let index = 0; index < stationCount; index += 1) {
    const station = Math.min(sMax, sMin + index * FIELD_STEP);
    const point = routeAt(shapeName, station), tangent = routeTangent(shapeName, station);
    const nx = -Math.sin(tangent), ny = Math.cos(tangent);
    let peak = -Infinity, peakOffset = 0;
    for (let offsetIndex = 0; offsetIndex < offsetCount; offsetIndex += 1) {
      const offset = -RIDGE_SCAN_HALF_WIDTH + offsetIndex * RIDGE_SCAN_STEP;
      const value = sample(point.x + nx * offset, point.y + ny * offset);
      if (value > peak) { peak = value; peakOffset = offset; }
    }
    const isCovered = peak >= LOCAL_HALF_SATURATION;
    covered.push(isCovered);
    if (isCovered) {
      ridgeOffsets.push(peakOffset);
      currentGap = 0;
    } else {
      currentGap += FIELD_STEP;
      maxGap = Math.max(maxGap, currentGap);
    }
    if (sample(point.x, point.y) >= LOCAL_HALF_SATURATION) centerlineCovered += 1;
  }
  const absoluteOffsets = ridgeOffsets.map(Math.abs).sort((a, b) => a - b);
  const components = covered.reduce((count, value, index) => count + Number(value && (index === 0 || !covered[index - 1])), 0);
  return {
    threshold: LOCAL_HALF_SATURATION,
    thresholdMeaning: 'production LOCAL_TRAIL_HALF_SATURATION; field ridge is max across a fixed +/-0.24 normalized-unit cross-section',
    stationSamples: stationCount,
    ridgeCoverageFraction: covered.filter(Boolean).length / Math.max(1, stationCount),
    centerlineCoverageFraction: centerlineCovered / Math.max(1, stationCount),
    ridgeComponents: components,
    longestBelowThresholdGap: maxGap,
    meanSignedRidgeOffset: mean(ridgeOffsets),
    meanAbsoluteRidgeOffset: mean(absoluteOffsets),
    p90AbsoluteRidgeOffset: quantile(absoluteOffsets, 0.9),
    maxAbsoluteRidgeOffset: absoluteOffsets.at(-1) ?? null
  };
}

export async function runControlledPass() {
  const pathHashes = new Map([
    [CONTROLLER_URL, await hashFile(CONTROLLER_URL)], [AGENT_URL, await hashFile(AGENT_URL)],
    [FIELD_URL, await hashFile(FIELD_URL)], [DEPOSITION_URL, await hashFile(DEPOSITION_URL)],
    [METRICS_URL, await hashFile(METRICS_URL)], [SHADOWS_URL, await hashFile(SHADOWS_URL)],
    [SCRIPT_URL, await hashFile(SCRIPT_URL)]
  ]);
  const loaded = {};
  for (const variant of ['baseline', 'dampingOff', 'blendOff', 'scoreOff']) {
    loaded[variant] = await makeCurvatureController(variant);
    assert.equal(loaded[variant].sourceSha256, pathHashes.get(CONTROLLER_URL), 'controller source stayed fixed while loading shadows');
  }
  const evidence = {
    createdAt: new Date().toISOString(),
    revision: '8c60e4b',
    sourceHashes: Object.fromEntries([...pathHashes].map(([url, sha256]) => [relativeUrl(url), sha256])),
    controllerVariants: Object.fromEntries(Object.entries(loaded).map(([name, result]) => [name, {
      sourceSha256: result.sourceSha256, shadowSha256: result.shadowSha256 ?? null,
      substitution: result.substitution ?? null
    }])),
    protocol: {
      scope: 'Controlled diagnostic only. No production source changes. One ant; activationFeedback=false and, after production init, the fixture sets the normalized internal population count to 1 because the public normalizer floors it at 8. This suppresses delayed recruitment while leaving the production tick/movement/field path unchanged; the runner asserts one agent during every pass.',
      causalOrder: 'At each 60 Hz tick: decay field; sense local trail; update intention (including wider prospective-heading senseTrail probes); compute local turn and turnToward; accelerate and collision-constrain movement; advance body pose and deposit from observed post-collision travel. A deposit made this tick cannot affect this tick’s sensing; the next tick can read it.',
      exactControllerMechanics: {
        localDamping: 'localTurn = clamp(localTrail.steering*(0.35+0.65*adherence) - clamp(previousAngularVelocity,-2.2,2.2)*0.65*adherence, -0.45, +0.45)',
        headingBlend: 'blend intentHeading toward current heading with weight 0.82*adherence, then add localTurn',
        turnTowardCapRadiansPerSecond: MAX_TURN_RATE,
        depositMultiplier: '0.5*(0.75+0.25*localTrail.strength) + reinforcementGain*adherence^2',
        reinforcementGain: 5,
        sourceReferences: ['src/lib/agents/ant/AntController.js:292-390', 'src/lib/agents/ant/AntController.js:496-606', 'src/lib/agents/ant/AntAgent.js:38-52']
      },
      seeds: SEEDS,
      fixedEntry: { x: START.x, y: START.y, lateralOffset: 0.004, station: 0 },
      timestepSeconds: DT, maxTurnRateRadiansPerSecond: MAX_TURN_RATE,
      durationSeconds: { capability: 3, repeatPass: 2 },
      geometries: { straight: 'zero curvature', gentle: 'circle R=0.25', tight: 'circle R=0.10',
        sCurve: 'synthetic y=0.018*sin(2*pi*u/0.32), no biological claim' },
      analyticField: { mode: 'frozen function sample', peak: SMOOTH_PEAK, gaussianSigma: SMOOTH_SIGMA,
        provenance: 'same fixed smooth-trail amplitude and width used by tests/ant-trail-following.test.js' },
      depositedField: { mode: '96x96 PheromoneField depositSegment source, frozen sample during capability pass; full dynamic deposit/sense feedback during repeat pass',
        amountPerUnitDistance: PHEROMONE_RATE, radius: DEPOSIT_RADIUS,
        gridCellPitch: 1 / 95, decayHalfLifeSeconds: 15, defaultDepositionMode: 'dab' },
      repeatTreatments: {
        preserve: 'base route deposited with production field kernel',
        straighten: 'equal-station straight chord from the same entry point and tangent',
        split: `base route with the fixed station interval ${SPLIT_GAP.join('..')} omitted`,
        noisy: `base route offset by one deposit radius (${NOISE_AMPLITUDE}) at a fixed wavelength of ${NOISE_WAVELENGTH}`
      },
      revisitCount: 3,
      visitReset: 'same agent returns to exact entry, tangent, velocity, adherence=0, confidence=0 and speed phase; seeded RNG resets to the same per-visit seed across paired treatments. This forced re-entry is a probe, not natural revisitation.',
      metrics: {
        fieldThreshold: LOCAL_HALF_SATURATION,
        fieldThresholdSource: 'production LOCAL_TRAIL_HALF_SATURATION (0.018)',
        fieldRouteRange: FIELD_RANGE, fieldStationStep: FIELD_STEP,
        fieldRidgeScan: { halfWidth: RIDGE_SCAN_HALF_WIDTH, step: RIDGE_SCAN_STEP },
        pathWindowsSeconds: [1, 2, 3],
        bodyTurnDynamics: 'per-tick angular-rate lag-1 correlation and adjacent nonzero sign-reversal fraction; also record actual post-collision path-turn signed/absolute totals and path-turn lag correlations',
        headingVsTravel: 'mean absolute angle between body heading and realized post-collision displacement direction',
        lowSpeedThreshold: 0.01
      },
      knownLimits: [
        'Analytic smooth fields are idealized frozen cues with peak 0.5 and sigma 0.0025; they are not calibrated to the deposited grid field.',
        'The 96x96 deposited field has 1/95 normalized-unit cell spacing, coarser than its 0.0045 deposition radius; bilinear reads do not remove source-grid aliasing.',
        'Field ridge metrics are measurement projections onto the specified base route, not biological route classes.',
        'No natural curved trail, colony-scale feedback, long-term cumulative reinforcement, or organismal role claim follows from forced entry/revisits.'
      ]
    },
    capability: [],
    oneEncounterShadows: [],
    repeatedFeedback: []
  };

  for (const [shapeName, shape] of Object.entries(shapes)) {
    for (const fieldMode of ['noTrail', 'smooth', 'depositedFrozen']) {
      for (const seed of SEEDS) {
        for (const variant of fieldMode === 'noTrail' ? ['baseline'] : variants) {
          const fixture = await createFixture(loaded[variant], seed, shapeName);
          let frozenGridHash = null;
          if (fieldMode === 'smooth') {
            fixture.controller.field.sample = (x, y) => smoothRouteSample(shapeName, x, y);
          } else if (fieldMode === 'depositedFrozen') {
            seedField(fixture.controller.field, shapeName, 'preserve');
            const frozen = new PheromoneField({ width: fixture.controller.field.width,
              height: fixture.controller.field.height, decayHalfLifeSeconds: fixture.controller.field.decayHalfLifeSeconds,
              maxValue: fixture.controller.field.maxValue });
            frozen.values.set(fixture.controller.field.values);
            frozenGridHash = hashFloat32(frozen.values);
            fixture.controller.field.sample = frozen.sample.bind(frozen);
          } else {
            fixture.controller.field.sample = () => 0;
          }
          const pass = await runPass(fixture, shapeName, 3, seed);
          evidence.capability.push({ shape: shapeName, fieldMode, variant, seed,
            frozenGridHash,
            ...pass });
          await fixture.controller.destroy();
        }
      }
    }
  }

  for (const shapeName of ['gentle', 'tight']) for (const variant of ['baseline', 'dampingOff', 'blendOff', 'scoreOff']) {
    for (const seed of SEEDS) {
      const fixture = await createFixture(loaded[variant], seed, shapeName);
      const source = seedField(fixture.controller.field, shapeName, 'preserve');
      const frozen = new PheromoneField({ width: fixture.controller.field.width,
        height: fixture.controller.field.height, decayHalfLifeSeconds: fixture.controller.field.decayHalfLifeSeconds,
        maxValue: fixture.controller.field.maxValue });
      frozen.values.set(fixture.controller.field.values);
      const frozenGridHash = hashFloat32(frozen.values);
      fixture.controller.field.sample = frozen.sample.bind(frozen);
      evidence.oneEncounterShadows.push({ shape: shapeName, fieldMode: 'depositedFrozen', variant, seed,
        source, frozenGridHash, initialFieldRidge: measureFieldRidge(frozen.sample.bind(frozen), shapeName),
        ...await runPass(fixture, shapeName, 2, seed) });
      await fixture.controller.destroy();
    }
  }

  for (const shapeName of ['gentleMirror', 'tightMirror']) for (const variant of ['baseline', 'dampingOff']) {
    for (const seed of SEEDS) {
      const fixture = await createFixture(loaded[variant], seed, shapeName);
      const source = seedField(fixture.controller.field, shapeName, 'preserve');
      const frozen = new PheromoneField({ width: fixture.controller.field.width,
        height: fixture.controller.field.height, decayHalfLifeSeconds: fixture.controller.field.decayHalfLifeSeconds,
        maxValue: fixture.controller.field.maxValue });
      frozen.values.set(fixture.controller.field.values);
      const frozenGridHash = hashFloat32(frozen.values);
      fixture.controller.field.sample = frozen.sample.bind(frozen);
      evidence.oneEncounterShadows.push({ shape: shapeName, fieldMode: 'depositedFrozen', variant, seed,
        source, frozenGridHash, mirroredOrientationProbe: true,
        initialFieldRidge: measureFieldRidge(frozen.sample.bind(frozen), shapeName),
        ...await runPass(fixture, shapeName, 2, seed) });
      await fixture.controller.destroy();
    }
  }

  for (const shapeName of ['gentle', 'tight']) for (const treatment of treatments) {
    for (const seed of SEEDS) {
      const passVariants = treatment === 'preserve' ? stageCVariants : ['baseline'];
      for (const variant of passVariants) {
        const fixture = await createFixture(loaded[variant], seed, shapeName);
        const source = seedField(fixture.controller.field, shapeName, treatment);
        const visits = [];
        const initialFieldHash = hashFloat32(fixture.controller.field.values);
        for (let visit = 0; visit < 3; visit += 1) {
          if (visit > 0) resetEntry(fixture, shapeName);
          fixture.random.reset(seed + visit * 1009);
          const before = measureFieldRidge(fixture.controller.field.sample.bind(fixture.controller.field), shapeName);
          const pass = await runPass(fixture, shapeName, 2, seed + visit * 1009);
          finishControlledVisit(fixture);
          const after = measureFieldRidge(fixture.controller.field.sample.bind(fixture.controller.field), shapeName);
          visits.push({ visit: visit + 1, before, pass, after,
            fieldHashAfter: hashFloat32(fixture.controller.field.values) });
          if (!pass.survived) break;
        }
        evidence.repeatedFeedback.push({ shape: shapeName, treatment, variant, seed, source,
          initialFieldHash, visits });
        await fixture.controller.destroy();
      }
    }
  }

  for (const [url, expected] of pathHashes) assert.equal(await hashFile(url), expected,
    `Executed source changed during run: ${relativeUrl(url)}`);
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
  return { output: OUTPUT, capabilityCases: evidence.capability.length,
    oneEncounterShadowCases: evidence.oneEncounterShadows.length,
    repeatedFeedbackCases: evidence.repeatedFeedback.length, sourceHashes: evidence.sourceHashes };
}

async function createFixture(controllerDefinition, seed, shapeName) {
  const { Controller, variant } = controllerDefinition;
  const random = seededRandom(seed);
  const controller = new Controller({ random, state: { population: { count: 1, activationFeedback: false } } });
  await controller.init();
  // Production normalization floors the public population count at 8; keep this explicit probe single-agent after init.
  controller.state.population.count = 1;
  assert.equal(controller.recruitmentLimit, 1, 'controlled fixture recruitment limit');
  const ant = controller.agents[0];
  assert.equal(controller.agents.length, 1);
  const fixture = { controller, ant, random, shapeName, variant, initialSpeedPhase: ant.speedPhase,
    lastLocalTrail: null, lastCollisionScale: 1, senseTrailValues: [] };
  const senseLocal = controller.senseLocalTrail.bind(controller);
  controller.senseLocalTrail = agent => {
    const result = senseLocal(agent);
    if (agent === ant) fixture.lastLocalTrail = result;
    return result;
  };
  const senseTrail = controller.senseTrail.bind(controller);
  controller.senseTrail = (agent, heading) => {
    const result = senseTrail(agent, heading);
    if (agent === ant) fixture.senseTrailValues.push(result);
    return result;
  };
  const constrain = controller.occupancy.constrainDisplacements.bind(controller.occupancy);
  controller.occupancy.constrainDisplacements = (...args) => {
    const scales = constrain(...args);
    fixture.lastCollisionScale = scales[0] ?? 1;
    return scales;
  };
  resetEntry(fixture, shapeName);
  controller.nextSpawnTimeMs = null;
  random.reset(seed);
  return fixture;
}

function resetEntry({ controller, ant, initialSpeedPhase }, shapeName) {
  const tangent = routeTangent(shapeName, 0), nx = -Math.sin(tangent), ny = Math.cos(tangent);
  ant.x = START.x + nx * 0.004;
  ant.y = START.y + ny * 0.004;
  ant.heading = tangent;
  ant.intentHeading = tangent;
  ant.vx = 0.08 * Math.cos(tangent);
  ant.vy = 0.08 * Math.sin(tangent);
  ant.angularVelocity = 0;
  ant.trailAdherence = 0;
  ant.trailConfidence = 0;
  ant.decisionRemaining = 0;
  ant.committedRemaining = 0;
  ant.inspectionRemaining = 1000;
  ant.hesitationRemaining = 0;
  ant.speedPhase = initialSpeedPhase;
  ant.wasBlocked = false;
  controller.bodyPoseController.reset();
  controller.nextSpawnTimeMs = null;
}

async function runPass(fixture, shapeName, durationSeconds, seed) {
  const { controller, ant } = fixture;
  const totalTicks = Math.round(durationSeconds / DT), samples = [];
  fixture.senseTrailValues = [];
  const startPosition = { x: ant.x, y: ant.y };
  let pathLength = 0, bodyTangentError = 0, bodyTravelError = 0, tangentSamples = 0, travelSamples = 0;
  let adherence = 0, localStrength = 0, localCoherence = 0, turnCapTicks = 0, peakTurnRate = 0, minSpeed = Infinity;
  const dampingTerms = [], localTurnClampEvents = [];
  fixture.random.reset(seed);
  samples.push(routeSample(0, ant, fixture, shapeName, 0, Math.hypot(ant.vx, ant.vy), null));
  let elapsedTicks = 0;
  for (let tick = 1; tick <= totalTicks; tick += 1) {
    const before = { x: ant.x, y: ant.y, heading: ant.heading, angularVelocity: ant.angularVelocity };
    fixture.lastLocalTrail = null;
    fixture.lastCollisionScale = 1;
    controller.tick(DT);
    elapsedTicks = tick;
    assert.ok(controller.agents.length <= 1, 'controlled population remains single-agent');
    const dx = ant.x - before.x, dy = ant.y - before.y, distance = Math.hypot(dx, dy);
    pathLength += distance;
    const turn = signedAngle(ant.heading - before.heading), turnRate = turn / DT;
    const cap = Math.abs(turn) >= MAX_TURN_RATE * DT - 1e-9;
    if (cap) turnCapTicks += 1;
    peakTurnRate = Math.max(peakTurnRate, Math.abs(turnRate));
    const speed = Math.hypot(ant.vx, ant.vy);
    const dampingTerm = fixture.feedbackTerm(before.angularVelocity, ant.trailAdherence, DT);
    const localSteeringTerm = (fixture.lastLocalTrail?.steering ?? 0)
      * (TRAIL_STEERING_BASE + TRAIL_STEERING_ADHERENCE * ant.trailAdherence);
    const unconstrainedLocalTurn = localSteeringTerm + dampingTerm;
    dampingTerms.push(dampingTerm);
    localTurnClampEvents.push(Math.abs(unconstrainedLocalTurn) > LOCAL_STEERING_LIMIT);
    minSpeed = Math.min(minSpeed, speed);
    adherence += ant.trailAdherence;
    localStrength += fixture.lastLocalTrail?.strength ?? 0;
    localCoherence += fixture.lastLocalTrail?.coherence ?? 0;
    const projection = projectRoute(shapeName, ant.x, ant.y);
    const headingError = signedAngle(ant.heading - projection.tangent);
    bodyTangentError += Math.abs(headingError);
    tangentSamples += 1;
    let travelHeadingError = null;
    if (distance > 1e-12) {
      travelHeadingError = Math.abs(signedAngle(Math.atan2(dy, dx) - ant.heading));
      bodyTravelError += travelHeadingError;
      travelSamples += 1;
    }
    samples.push(routeSample(tick, ant, fixture, shapeName, fixture.lastCollisionScale, speed, {
      turnCapSaturated: cap, crossTrack: projection.crossTrack, routeStation: projection.station,
      headingError, travelHeadingError, localStrength: fixture.lastLocalTrail?.strength ?? 0,
      localCoherence: fixture.lastLocalTrail?.coherence ?? 0,
      localSteering: fixture.lastLocalTrail?.steering ?? 0, turnRate,
      dampingTerm, localSteeringTerm, unconstrainedLocalTurn
    }));
    assert.ok([ant.x, ant.y, ant.heading, speed, turnRate].every(Number.isFinite), 'finite production movement state');
    assert.ok(Math.abs(turnRate) <= MAX_TURN_RATE + 1e-9, 'production turn cap');
    if (!controller.agents.includes(ant)) break;
  }
  const survived = controller.agents.includes(ant);
  const projections = samples.map(sample => sample.routeStation).filter(Number.isFinite);
  const absCross = samples.map(sample => Math.abs(sample.crossTrack)).filter(Number.isFinite).sort((a, b) => a - b);
  const curvature = analyzeRouteCurvature(samples.map(sample => ({
    id: 'ant-1', tick: sample.tick, x: sample.x, y: sample.y, heading: sample.heading,
    turnCapSaturated: sample.turnCapSaturated, speed: sample.speed, collisionScale: sample.collisionScale
  })), { hz: 60, windowSeconds: [1, 2, 3], lowSpeedThreshold: 0.01 });
  const bodyTurnDynamics = summarizeBodyTurnDynamics(samples.slice(1).map(sample => sample.turnRate));
  return {
    durationSeconds: durationSeconds,
    elapsedSeconds: elapsedTicks * DT,
    ticks: elapsedTicks,
    survived,
    survivalFraction: elapsedTicks / totalTicks,
    start: startPosition,
    end: { x: ant.x, y: ant.y, heading: ant.heading },
    progressAlongReference: projections.length ? projections.at(-1) - projections[0] : null,
    xProgress: ant.x - startPosition.x,
    pathLength,
    randomDraws: fixture.random.draws(),
    meanSpeed: pathLength / Math.max(1e-9, elapsedTicks * DT),
    minimumSpeed: Number.isFinite(minSpeed) ? minSpeed : null,
    meanAbsoluteCrossTrack: mean(absCross),
    p90AbsoluteCrossTrack: quantile(absCross, 0.9),
    maximumAbsoluteCrossTrack: absCross.at(-1) ?? null,
    meanAbsoluteHeadingToReferenceTangent: bodyTangentError / Math.max(1, tangentSamples),
    meanAbsoluteHeadingToRealizedTravel: bodyTravelError / Math.max(1, travelSamples),
    meanAdherence: adherence / Math.max(1, elapsedTicks),
    meanLocalStrength: localStrength / Math.max(1, elapsedTicks),
    meanLocalCoherence: localCoherence / Math.max(1, elapsedTicks),
    senseTrailCallCount: fixture.senseTrailValues.length,
    meanSenseTrail: mean(fixture.senseTrailValues),
    turnCapTicks,
    turnCapFraction: turnCapTicks / Math.max(1, elapsedTicks),
    peakTurnRateRadiansPerSecond: peakTurnRate,
    bodyTurnDynamics,
    localSteeringDynamics: {
      meanSignedDampingTermRadians: mean(dampingTerms),
      meanAbsoluteDampingTermRadians: mean(dampingTerms.map(Math.abs)),
      localTurnClampFraction: localTurnClampEvents.filter(Boolean).length / Math.max(1, localTurnClampEvents.length)
    },
    pathCurvatureWindows: curvature,
    samples
  };
}

function finishControlledVisit({ controller, ant }) {
  const rear = controller.bodyPoseController.getSnapshot(ant)?.gasterRear;
  if (rear) controller.applyDeposits(controller.gasterDeposition.retire(ant.id, rear));
}

function routeSample(tick, ant, fixture, shapeName, collisionScale, speed, extra) {
  const projection = projectRoute(shapeName, ant.x, ant.y);
  return {
    id: 'ant-1', tick, x: ant.x, y: ant.y, heading: ant.heading, speed, collisionScale,
    turnCapSaturated: extra?.turnCapSaturated ?? false,
    routeStation: extra?.routeStation ?? projection.station,
    crossTrack: extra?.crossTrack ?? projection.crossTrack,
    headingError: extra?.headingError ?? signedAngle(ant.heading - projection.tangent),
    travelHeadingError: extra?.travelHeadingError ?? null,
    localStrength: extra?.localStrength ?? fixture.lastLocalTrail?.strength ?? 0,
    localCoherence: extra?.localCoherence ?? fixture.lastLocalTrail?.coherence ?? 0,
    localSteering: extra?.localSteering ?? fixture.lastLocalTrail?.steering ?? 0,
    turnRate: extra?.turnRate ?? 0,
    dampingTerm: extra?.dampingTerm ?? 0,
    localSteeringTerm: extra?.localSteeringTerm ?? 0,
    unconstrainedLocalTurn: extra?.unconstrainedLocalTurn ?? 0
  };
}

function smoothRouteSample(shapeName, x, y) {
  const nearest = projectRoute(shapeName, x, y);
  return SMOOTH_PEAK * Math.exp(-(nearest.distance ** 2) / (2 * SMOOTH_SIGMA ** 2));
}

function seedField(field, shapeName, treatment) {
  assert.equal(field.width, 96, 'production field width');
  assert.equal(field.height, 96, 'production field height');
  const points = makeRoutePoints(shapeName, FIELD_RANGE[0], FIELD_RANGE[1], FIELD_STEP, treatment);
  let depositedLength = 0, depositedDose = 0, depositedSegments = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1], to = points[index], middle = (from.station + to.station) * 0.5;
    if (treatment === 'split' && middle > SPLIT_GAP[0] && middle < SPLIT_GAP[1]) continue;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    field.depositSegment(from, to, { amountPerUnitDistance: PHEROMONE_RATE, radius: DEPOSIT_RADIUS });
    depositedLength += length;
    depositedDose += length * PHEROMONE_RATE;
    depositedSegments += 1;
  }
  return { depositedLength, depositedDose, sourcePolylineSegments: points.length - 1, depositedSegments };
}

function summarizeBodyTurnDynamics(turnRates) {
  const nonzeroSigns = [];
  for (let index = 1; index < turnRates.length; index += 1) {
    if (turnRates[index - 1] && turnRates[index]) nonzeroSigns.push([Math.sign(turnRates[index - 1]), Math.sign(turnRates[index])]);
  }
  const reversals = nonzeroSigns.filter(([before, after]) => before !== after).length;
  return {
    adjacentRateLag1Correlation: correlation(turnRates.slice(1), turnRates.slice(0, -1)),
    adjacentNonzeroSignPairs: nonzeroSigns.length,
    signReversalFraction: nonzeroSigns.length ? reversals / nonzeroSigns.length : null,
    signedTurnRateMean: mean(turnRates),
    absoluteTurnRateMean: mean(turnRates.map(Math.abs))
  };
}

function correlation(left, right) {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = mean(left), rightMean = mean(right);
  let numerator = 0, leftSquares = 0, rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] - leftMean, b = right[index] - rightMean;
    numerator += a * b; leftSquares += a * a; rightSquares += b * b;
  }
  return leftSquares && rightSquares ? numerator / Math.sqrt(leftSquares * rightSquares) : null;
}

function treatmentPoint(shapeName, station, treatment) {
  const point = routeAt(shapeName, station);
  if (treatment === 'preserve' || treatment === 'split') return point;
  if (treatment === 'straighten') {
    const tangent = routeTangent(shapeName, 0);
    return { x: START.x + Math.cos(tangent) * station, y: START.y + Math.sin(tangent) * station };
  }
  if (treatment === 'noisy') {
    const tangent = routeTangent(shapeName, station), offset = NOISE_AMPLITUDE * Math.sin(2 * Math.PI * station / NOISE_WAVELENGTH);
    return { x: point.x - Math.sin(tangent) * offset, y: point.y + Math.cos(tangent) * offset };
  }
  throw new TypeError(`Unknown field treatment: ${treatment}`);
}

function buildSineArcTable(shape) {
  const uMin = -0.5, uMax = 0.5, step = 0.00025, rows = [];
  const position = u => ({ x: START.x + u, y: START.y + shape.amplitude * Math.sin(2 * Math.PI * u / shape.wavelength) });
  let previous = position(uMin), length = 0;
  for (let u = uMin; u <= uMax + step * 0.5; u += step) {
    const current = position(u);
    if (rows.length) length += Math.hypot(current.x - previous.x, current.y - previous.y);
    rows.push({ u, cumulative: length });
    previous = current;
  }
  const zero = rows.reduce((best, row, index) => Math.abs(row.u) < Math.abs(rows[best].u) ? index : best, 0);
  const originLength = rows[zero].cumulative;
  return rows.map(row => ({ ...row, station: row.cumulative - originLength }));
}

function sineParameterAtStation(station) {
  const row = interpolateBy(sineArcTable, 'station', station);
  return row.u;
}

function stationAtSineParameter(u) { return interpolateBy(sineArcTable, 'u', u).station; }

function interpolateBy(rows, key, value) {
  const clamped = clamp(value, rows[0][key], rows.at(-1)[key]);
  let low = 0, high = rows.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle][key] <= clamped) low = middle; else high = middle;
  }
  const a = rows[low], b = rows[high], amount = (clamped - a[key]) / (b[key] - a[key] || 1);
  return Object.fromEntries(Object.keys(a).map(column => [column, a[column] + (b[column] - a[column]) * amount]));
}

function distanceToRoutePoint(shapeName, x, y, station) {
  const point = routeAt(shapeName, station);
  return Math.hypot(x - point.x, y - point.y);
}

function seededRandom(seed) {
  let value = seed >>> 0, draws = 0;
  const random = () => { draws += 1; value = (1664525 * value + 1013904223) >>> 0; return value / 0x100000000; };
  random.reset = nextSeed => { value = nextSeed >>> 0; draws = 0; };
  random.draws = () => draws;
  return random;
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function quantile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const index = (sortedValues.length - 1) * p, lower = Math.floor(index);
  return sortedValues[lower] + (sortedValues[Math.min(lower + 1, sortedValues.length - 1)] - sortedValues[lower]) * (index - lower);
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function signedAngle(angle) { return Math.atan2(Math.sin(angle), Math.cos(angle)); }
function hashFloat32(values) { return HASH(Buffer.from(values.buffer, values.byteOffset, values.byteLength)); }
async function hashFile(url) { return HASH(await readFile(url)); }
function relativeUrl(url) { return relative(ROOT, fileURLToPath(url)).replaceAll('/', '\\'); }

export { createFixture, runPass, seedField, smoothRouteSample };
