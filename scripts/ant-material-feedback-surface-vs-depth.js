import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { ANT_MAX_TURN_RATE } from '../src/lib/agents/ant/AntAgent.js';
import { DT, executeScenario } from './ant-g-production-candidate-natural.js';
import { attachFlowVelocity } from './ant-material-flow-velocity-probes.js';
import { descriptiveSpacing, enumeratePlateauMaxima, neighbors8 } from './ant-opportunity-core.js';
import { captureStructuralPackets } from './ant-authored-capture-core.js';
import { verifyBaselineInputs, verifySourceAuthority } from './ant-material-organism-feedback-screen.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-30-material-feedback-surface-vs-depth';
const DATA = `${PACKAGE}/data/ad-s`;
const MAIN = '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785';
const PARENT = '10b1cbd877f4130924be83daa37fe8c40e9b230c';
const BRANCH = 'codex/ant-material-feedback-surface-vs-depth-20261030';
const N = 96, CELLS = N * N, DT_MS = 1000 / 60, TURN_EPS = 1e-12, TARGET_EPS = 1e-12;
const HEADWAY_SECONDS = 0.4, FOLLOWING_RESPONSE_SECONDS = 0.9;
const N_DATA = 'docs/ant/evidence/2026-10-30-material-organism-feedback-discovery/data/control';
const AD_DATA = 'docs/ant/evidence/2026-10-30-material-feedback-ad-composition/data/ad';
const AD_PACKAGE = 'docs/ant/evidence/2026-10-30-material-feedback-ad-composition';
const SOURCES = [
  'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/AntController.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'scripts/ant-g-production-candidate-natural.js', 'scripts/ant-material-turning-probe.js',
  'scripts/ant-material-flow-velocity-probes.js', 'scripts/ant-authored-capture-core.js',
  'scripts/ant-opportunity-core.js', 'scripts/ant-material-organism-feedback-screen.js',
  'scripts/ant-material-feedback-ad-composition.js', 'docs/ant/README.md'
];
const hash = data => createHash('sha256').update(data).digest('hex');
const hashFile = async path => hash(await readFile(resolve(ROOT, path)));
const readJson = async path => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
const readGzip = async path => JSON.parse(gunzipSync(await readFile(resolve(ROOT, path))));
const writeNew = (path, data) => writeFile(path, data, { flag: 'wx' });
const qA = layers => 1 - 0.50 * (1 - Math.exp(-layers / 4));
const hD = layers => 1 + 0.50 * (1 - Math.exp(-layers / 4));
const headway = layers => HEADWAY_SECONDS * hD(layers);
const qSurface = surface => surface ? qA(1) : 1;
const hSurface = surface => surface ? hD(1) : 1;
const angleDelta = (a, b) => ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const point = index => ({ x: (index % N) / 95, y: Math.floor(index / N) / 95 });
const binName = layers => layers === 0 ? '0' : layers === 1 ? '1' : layers <= 4 ? '2-4' : '>=5';

function distribution(values) {
  if (!values.length) return { n: 0 };
  const sorted = values.slice().sort((a, b) => a - b);
  const at = p => sorted[Math.round((sorted.length - 1) * p)];
  return { n: values.length, min: sorted[0], p10: at(.1), p25: at(.25), median: at(.5),
    p75: at(.75), p90: at(.9), p95: at(.95), p99: at(.99), max: sorted.at(-1),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length };
}

function bucket(table, layer) {
  const key = String(layer);
  return table[key] ||= { calls: 0, materialCalls: 0, byBin: binName(layer),
    nativeBinding: 0, depthBinding: 0, surfaceBinding: 0,
    depthChanged: 0, surfaceChanged: 0, depthRate: [], surfaceRate: [], nativeRate: [],
    depthSuppression: [], surfaceSuppression: [], depthMinusSurfaceRate: [],
    requestedHeading: [], requestedHeadingError: [], beforeHeading: [],
    depthHeadingDifference: [], surfaceHeadingDifference: [], depthMinusSurfaceHeading: [] };
}

function simulateTurn(agent, original, targetHeading, dtSeconds, factor) {
  const copy = { ...agent };
  original.call(copy, targetHeading, dtSeconds * factor);
  const applied = factor === 1 ? copy.angularVelocity
    : dtSeconds > 0 ? angleDelta(agent.heading, copy.heading) / dtSeconds : 0;
  return { heading: copy.heading, rate: applied };
}

function targetSpeed(agent, info, followingLimit) {
  let speed = agent.personality.preferredSpeed * (0.58 + 0.34 * (Math.sin(agent.speedPhase) + 1) * 0.5);
  speed *= (1 - info.frontCrowding) ** 2;
  speed *= 1 - Math.min(0.45, Math.hypot(info.separationX, info.separationY) * 0.1);
  speed = Math.min(speed, followingLimit);
  if (agent.hesitationRemaining > 0) speed *= 0.05;
  return speed;
}

function readSurfaceCount(snapshot, ant) {
  const { width, height, stratigraphy } = snapshot;
  const column = Math.max(0, Math.min(width - 1, Math.round(ant.x * (width - 1))));
  const row = Math.max(0, Math.min(height - 1, Math.round(ant.y * (height - 1))));
  const index = row * width + column;
  const layers = stratigraphy.layerCountByCell[index] || 0;
  const surface = Number(stratigraphy.topLayerByCell[index] >= 0);
  assert.equal(Number(layers > 0), surface, 'exposed top-layer and positive column count agree');
  return { index, layers, surface };
}

function newARecord() {
  return { calls: 0, materialCalls: 0, surfaceCalls: 0, nativeBinding: 0,
    depthBinding: 0, surfaceBinding: 0, depthChanged: 0, surfaceChanged: 0,
    l1ConformanceChecks: 0, l1ConformanceMismatches: 0, byLayer: Object.create(null) };
}

function newDLayer() {
  return { senseCalls: 0, finalTargetCalls: 0, materialCalls: 0, finiteSameFlow: 0,
    depthHeadwayExpanded: 0, surfaceHeadwayExpanded: 0, depthBinding: 0, surfaceBinding: 0,
    depthChangedTargets: 0, surfaceChangedTargets: 0, l1ConformanceChecks: 0,
    l1ConformanceMismatches: 0, nativeHeadway: [], depthHeadway: [], surfaceHeadway: [],
    depthHeadwayIncrease: [], surfaceHeadwayIncrease: [], speed: [], personalSpacingFloor: [],
    nativeFollowingLimit: [], depthFollowingLimit: [], surfaceFollowingLimit: [],
    nativeTarget: [], depthTarget: [], surfaceTarget: [], depthTargetReduction: [],
    surfaceTargetReduction: [], depthMinusSurfaceTarget: [], neighborCount: [], frontCrowding: [] };
}

function makeDRecord() {
  return { senseCalls: 0, materialSenseCalls: 0, finiteSameFlow: 0, materialFiniteSameFlow: 0,
    depthHeadwayExpanded: 0, surfaceHeadwayExpanded: 0, finalTargetCalls: 0,
    materialFinalTargetCalls: 0, depthChangedTargets: 0, surfaceChangedTargets: 0,
    depthTargetBinding: 0, surfaceTargetBinding: 0, l1ConformanceChecks: 0,
    l1ConformanceMismatches: 0, byLayer: Object.create(null), senseByLayer: Object.create(null),
    targetByLayer: Object.create(null) };
}

function loadThinner(source) {
  const math = Object.create(Math);
  math.random = () => { throw new Error('F observer must not consume RNG'); };
  return runInNewContext(source.replace(/^export /gm, '') + '\n({ zhangSuen })', { Math: math }).zhangSuen;
}

function connectedComponents(F) {
  const labels = new Int32Array(CELLS).fill(-1), sizes = [];
  let id = 0;
  for (let start = 0; start < CELLS; start += 1) if (F[start] && labels[start] < 0) {
    labels[start] = id;
    const queue = [start];
    for (let head = 0; head < queue.length; head += 1) for (const next of neighbors8(queue[head]))
      if (F[next] && labels[next] < 0) { labels[next] = id; queue.push(next); }
    sizes.push(queue.length); id += 1;
  }
  return { labels, sizes };
}

function captureFrame(controller, tick, thinner) {
  const timeMs = controller.simulationTimeMs;
  const { mask: E } = controller.trailPlateBirth.buildSupportedMask(controller.surfaceField);
  const F = thinner(E), S = new Uint8Array(CELLS), D = new Float32Array(CELLS);
  for (let i = 0; i < CELLS; i += 1) {
    if (F[i] && neighbors8(i).some(j => F[j])) S[i] = 1;
    D[i] = Math.fround(controller.surfaceField.sampleSupport(i % N / 95, Math.floor(i / N) / 95, 0.025));
  }
  const plates = controller.trailPlateBirth.getPlates().filter(plate => plate.bornAtSimulationTimeMs < timeMs);
  const preMaterialLayers = new Uint8Array(CELLS);
  for (const plate of plates) for (let i = 0; i < CELLS; i += 1) if (plate.mask[i]) preMaterialLayers[i] += 1;
  return { tick, timeMs, E, F, S, D, preMaterialLayers };
}

function analyzeFrame(frame) {
  const F = Uint8Array.from(frame.F), S = Uint8Array.from(frame.S), D = Float64Array.from(frame.D);
  const { labels, sizes } = connectedComponents(F);
  const { peaks, zeroMaxContextCount } = enumeratePlateauMaxima({ S, values: D });
  const centers = descriptiveSpacing(peaks, labels, 0.15).representatives;
  const top = centers.slice(0, 3).map((row, index) => ({ rank: index + 1, index: row.index, value: row.value,
    component: labels[row.index], entryDistance: Math.hypot(point(row.index).x - 0.5, point(row.index).y - 0.72),
    materialLayers: frame.preMaterialLayers[row.index] }));
  const winner = top[0] ?? null;
  let X = null;
  if (winner) {
    const packet = captureStructuralPackets({ F, nucleus: winner.index, radius: 0.15 });
    const materialCells = packet.X.filter(index => frame.preMaterialLayers[index] > 0).length;
    X = { cells: packet.X.length, materialCells, materialFraction: packet.X.length ? materialCells / packet.X.length : null };
  }
  return { tick: frame.tick, timeMs: frame.timeMs, sizes: { E: frame.E.reduce((n, value) => n + value, 0),
    F: F.reduce((n, value) => n + value, 0), S: S.reduce((n, value) => n + value, 0), FComponents: sizes.length },
    D: { finitePeaks: peaks.length, zeroMaxContexts: zeroMaxContextCount, spacedCenters: centers.length,
      top2ToTop1: centers[0]?.value > 0 && centers[1] ? centers[1].value / centers[0].value : null,
      winner, top, winnerX: X } };
}

function mapDifference(left, right) {
  let l1 = 0, leftSum = 0, rightSum = 0, normalizedL1 = 0;
  for (let i = 0; i < left.length; i += 1) {
    l1 += Math.abs(left[i] - right[i]); leftSum += left[i]; rightSum += right[i];
  }
  if (leftSum > 0 && rightSum > 0) for (let i = 0; i < left.length; i += 1)
    normalizedL1 += Math.abs(left[i] / leftSum - right[i] / rightSum);
  return { normalizedL1: leftSum > 0 && rightSum > 0 ? normalizedL1 : null, l1, leftSum, rightSum };
}

function positionMap(raw) {
  const map = new Float64Array(CELLS);
  for (const row of raw.positions) for (const ant of row.agents || []) {
    const x = Math.max(0, Math.min(95, Math.round(ant.x * 95)));
    const y = Math.max(0, Math.min(95, Math.round(ant.y * 95)));
    map[y * N + x] += 1;
  }
  return map;
}

function footMap(grid) { return Float64Array.from(grid); }

function footGridFromFeet(feet) {
  const grid = new Uint32Array(CELLS);
  for (const foot of feet || []) grid[Math.round(foot.y * 95) * N + Math.round(foot.x * 95)] += 1;
  return grid;
}

function displacementAudit(raw) {
  let pairs = 0, exactZero = 0, minPositive = Infinity, maxConsecutiveZero = 0;
  const prior = new Map(), zeroRuns = new Map();
  for (const row of raw.positions) {
    const currentIds = new Set();
    for (const ant of row.agents || []) {
      currentIds.add(ant.id);
      const old = prior.get(ant.id);
      if (old) {
        pairs += 1;
        const distance = Math.hypot(ant.x - old.x, ant.y - old.y);
        if (distance === 0) {
          exactZero += 1;
          const count = (zeroRuns.get(ant.id) || 0) + 1;
          zeroRuns.set(ant.id, count); maxConsecutiveZero = Math.max(maxConsecutiveZero, count);
        } else { minPositive = Math.min(minPositive, distance); zeroRuns.set(ant.id, 0); }
      }
      prior.set(ant.id, { x: ant.x, y: ant.y });
    }
    for (const id of [...prior.keys()]) if (!currentIds.has(id)) { prior.delete(id); zeroRuns.delete(id); }
  }
  return { consecutivePositionPairs: pairs, exactZeroDisplacements: exactZero,
    minimumPositiveDisplacement: Number.isFinite(minPositive) ? minPositive : null,
    maxConsecutiveExactZeroSamples: maxConsecutiveZero };
}

function summarizeRun(run, raw, auxiliary, frames) {
  const end = run.checkpoints.at(-1), checkpoint300 = run.checkpoints.find(row => row.seconds === 300);
  const late = frames.map(analyzeFrame);
  const footCounts = Array.from(auxiliary.footGrid);
  const route = positionMap(raw);
  const displacement = displacementAudit(raw);
  return { arm: 'AD-S', initialStateSha256: run.initialStateSha256, finalRng: run.finalRng,
    movement: { totalDistance: run.movement.totalDistance, activeAntSeconds: run.movement.activeAntSeconds,
      travelPerActiveAntSecond: run.movement.travelPerActiveAntSecond,
      blockedFrames: run.movement.blockedFrames, maximumSpeed: run.movement.maximumSpeed,
      maximumTurnRate: run.movement.maximumTurnRate, oneSecondDisplacement: displacement },
    events: { contactGroups: run.events.contactGroups, individualFeet: run.events.individualFeet,
      plateBirths: run.events.plateBirths, firstPlateSeconds: run.events.firstPlateSeconds,
      sphereBirths: run.events.sphereBirths, contactStreamSha256: run.events.contactStreamSha256,
      plateBirthStreamSha256: run.events.plateBirthStreamSha256 },
    checkpoint300: checkpoint300 ? { activePopulation: checkpoint300.activePopulation,
      contacts: checkpoint300.contacts, field: checkpoint300.field, surface: checkpoint300.surface,
      material: checkpoint300.material, occupancy: checkpoint300.occupancy } : null,
    checkpoint600: { activePopulation: end.activePopulation, contacts: end.contacts,
      field: end.field, surface: end.surface, material: end.material, occupancy: end.occupancy },
    population: { recruited: run.movement.recruited, retired: run.movement.retired,
      final: end.activePopulation, maximum: Math.max(...run.checkpoints.map(row => row.activePopulation)) },
    invariants: run.invariants,
    footGrid: { total: auxiliary.footTotal, normalizedL1VsN: null, cells: footCounts },
    routeGrid: { samples: route.reduce((sum, value) => sum + value, 0), normalizedL1VsN: null,
      cells: Array.from(route) },
    lateOpportunityFrames: late,
    A: summarizeA(auxiliary.A), D: summarizeD(auxiliary.D),
    parity: auxiliary.parity };
}

function summarizeA(A) {
  const byLayer = {};
  for (const [layers, row] of Object.entries(A.byLayer)) {
    byLayer[layers] = { calls: row.calls, materialCalls: row.materialCalls,
      nativeBinding: row.nativeBinding, depthBinding: row.depthBinding, surfaceBinding: row.surfaceBinding,
      depthChanged: row.depthChanged, surfaceChanged: row.surfaceChanged,
      nativeRate: distribution(row.nativeRate), depthRate: distribution(row.depthRate),
      surfaceRate: distribution(row.surfaceRate), depthSuppression: distribution(row.depthSuppression),
      surfaceSuppression: distribution(row.surfaceSuppression),
      depthMinusSurfaceRate: distribution(row.depthMinusSurfaceRate),
      requestedHeading: distribution(row.requestedHeading),
      requestedHeadingError: distribution(row.requestedHeadingError),
      beforeHeading: distribution(row.beforeHeading),
      depthHeadingDifference: distribution(row.depthHeadingDifference),
      surfaceHeadingDifference: distribution(row.surfaceHeadingDifference),
      depthMinusSurfaceHeading: distribution(row.depthMinusSurfaceHeading) };
  }
  const byBin = {};
  for (const name of ['0', '1', '2-4', '>=5']) {
    const rows = Object.entries(A.byLayer).filter(([, row]) => row.byBin === name).map(([, row]) => row);
    byBin[name] = { calls: rows.reduce((n, row) => n + row.calls, 0),
      materialCalls: rows.reduce((n, row) => n + row.materialCalls, 0),
      depthChanged: rows.reduce((n, row) => n + row.depthChanged, 0),
      surfaceChanged: rows.reduce((n, row) => n + row.surfaceChanged, 0),
      nativeBinding: rows.reduce((n, row) => n + row.nativeBinding, 0),
      depthBinding: rows.reduce((n, row) => n + row.depthBinding, 0),
      surfaceBinding: rows.reduce((n, row) => n + row.surfaceBinding, 0),
      depthMinusSurfaceRate: distribution(rows.flatMap(row => row.depthMinusSurfaceRate)),
      depthMinusSurfaceHeading: distribution(rows.flatMap(row => row.depthMinusSurfaceHeading)) };
  }
  return { calls: A.calls, materialCalls: A.materialCalls, surfaceCalls: A.surfaceCalls,
    nativeBinding: A.nativeBinding, depthBinding: A.depthBinding, surfaceBinding: A.surfaceBinding,
    depthChanged: A.depthChanged, surfaceChanged: A.surfaceChanged,
    l1ConformanceChecks: A.l1ConformanceChecks, l1ConformanceMismatches: A.l1ConformanceMismatches,
    byLayer, byBin };
}

function summarizeD(D) {
  const describe = table => Object.fromEntries(Object.entries(table).map(([layers, row]) => [layers, {
    ...Object.fromEntries(Object.entries(row).filter(([, value]) => typeof value === 'number')),
    nativeHeadway: distribution(row.nativeHeadway), depthHeadway: distribution(row.depthHeadway),
    surfaceHeadway: distribution(row.surfaceHeadway), depthHeadwayIncrease: distribution(row.depthHeadwayIncrease),
    surfaceHeadwayIncrease: distribution(row.surfaceHeadwayIncrease), speed: distribution(row.speed),
    personalSpacingFloor: distribution(row.personalSpacingFloor),
    nativeFollowingLimit: distribution(row.nativeFollowingLimit),
    depthFollowingLimit: distribution(row.depthFollowingLimit),
    surfaceFollowingLimit: distribution(row.surfaceFollowingLimit),
    nativeTarget: distribution(row.nativeTarget), depthTarget: distribution(row.depthTarget),
    surfaceTarget: distribution(row.surfaceTarget), depthTargetReduction: distribution(row.depthTargetReduction),
    surfaceTargetReduction: distribution(row.surfaceTargetReduction),
    depthMinusSurfaceTarget: distribution(row.depthMinusSurfaceTarget),
    neighborCount: distribution(row.neighborCount), frontCrowding: distribution(row.frontCrowding)
  }]));
  const byBin = Object.fromEntries(['0', '1', '2-4', '>=5'].map(bin => {
    const sum = (table, field) => Object.entries(table).reduce((total, [layer, row]) =>
      total + (binName(Number(layer)) === bin ? row[field] || 0 : 0), 0);
    const senses = Object.entries(D.senseByLayer).filter(([layer]) => binName(Number(layer)) === bin).map(([, row]) => row);
    const targets = Object.entries(D.targetByLayer).filter(([layer]) => binName(Number(layer)) === bin).map(([, row]) => row);
    return [bin, { senseCalls: sum(D.senseByLayer, 'senseCalls'), materialCalls: sum(D.senseByLayer, 'materialCalls'),
      finiteSameFlow: sum(D.senseByLayer, 'finiteSameFlow'),
      depthHeadwayExpanded: sum(D.senseByLayer, 'depthHeadwayExpanded'),
      surfaceHeadwayExpanded: sum(D.senseByLayer, 'surfaceHeadwayExpanded'),
      finalTargetCalls: sum(D.targetByLayer, 'finalTargetCalls'),
      depthChangedTargets: sum(D.targetByLayer, 'depthChangedTargets'),
      surfaceChangedTargets: sum(D.targetByLayer, 'surfaceChangedTargets'),
      depthTargetReduction: distribution(targets.flatMap(row => row.depthTargetReduction || [])),
      surfaceTargetReduction: distribution(targets.flatMap(row => row.surfaceTargetReduction || [])) }];
  }));
  const senseByLayer = describe(D.senseByLayer), targetByLayer = describe(D.targetByLayer);
  return { senseCalls: D.senseCalls, materialSenseCalls: D.materialSenseCalls,
    finiteSameFlow: D.finiteSameFlow, materialFiniteSameFlow: D.materialFiniteSameFlow,
    depthHeadwayExpanded: D.depthHeadwayExpanded, surfaceHeadwayExpanded: D.surfaceHeadwayExpanded,
    finalTargetCalls: D.finalTargetCalls, materialFinalTargetCalls: D.materialFinalTargetCalls,
    depthChangedTargets: D.depthChangedTargets, surfaceChangedTargets: D.surfaceChangedTargets,
    depthTargetBinding: D.depthTargetBinding, surfaceTargetBinding: D.surfaceTargetBinding,
    l1ConformanceChecks: D.l1ConformanceChecks, l1ConformanceMismatches: D.l1ConformanceMismatches,
    byLayer: Object.fromEntries(Object.keys(senseByLayer).map(layer => [layer,
      { sense: senseByLayer[layer], finalTarget: targetByLayer[layer] || null }])),
    byBin, senseByLayer, targetByLayer };
}

function makeRecorder(expectedTicks, thinner) {
  const record = { protocol: { seed: 20261005, seconds: 600, tickRate: 60, audio: 'Off',
    productionSlowdown: false, residence: false, otherCandidates: 'Off',
    A: 'qA(L)=1-.50*(1-exp(-L/4)); surface uses qA(1) for S=1; multiply native 4.5 rad/s turn cap',
    D: 'hD(L)=1+.50*(1-exp(-L/4)); surface uses hD(1) for S=1; multiply native .4 s same-flow headway',
    surface: 'tick-entry topLayerByCell[round(y*95)*96+round(x*95)] >= 0',
    lBins: ['0', '1', '2-4', '>=5'], directDifferenceEpsilon: TURN_EPS,
    observerRngCalls: 0, pairedCounterfactualsOnSameState: true },
    A: newARecord(), D: makeDRecord(), frames: [], footTotal: 0, footGrid: new Uint32Array(CELLS),
    tickEntrySnapshots: 0, ticks: 0, l1: { AChecks: 0, AMismatches: 0, DChecks: 0, DMismatches: 0 },
    dSenseByLayer: Object.create(null), dTargetByLayer: Object.create(null), perSecond: [] };
  const flowSurfaceByAnt = new Map(), layersByAnt = new Map(), surfaceByAnt = new Map();
  const antById = new Map(), turnWrappers = new Map(), senseByAntId = new Map();
  const bucketA = layer => bucket(record.A.byLayer, layer);
  let current = null, outerTick = null, flow = null, flowTick = null, guard = null;
  const turnWrapper = (ant, original) => function (targetHeading, dtSeconds) {
    assert(current, 'turn callback is inside a registered tick');
    const layers = layersByAnt.get(ant) || 0, surface = surfaceByAnt.get(ant) || 0;
    const qDepth = qA(layers), qSurf = qSurface(surface), before = this.heading;
    const native = simulateTurn(this, original, targetHeading, dtSeconds, 1);
    const depth = simulateTurn(this, original, targetHeading, dtSeconds, qDepth);
    const exposed = simulateTurn(this, original, targetHeading, dtSeconds, qSurf);
    const targetError = Math.abs(angleDelta(before, targetHeading));
    const nativeBinding = targetError > ANT_MAX_TURN_RATE * dtSeconds + TURN_EPS;
    const depthBinding = targetError > ANT_MAX_TURN_RATE * qDepth * dtSeconds + TURN_EPS;
    const surfaceBinding = targetError > ANT_MAX_TURN_RATE * qSurf * dtSeconds + TURN_EPS;
    original.call(this, targetHeading, dtSeconds * qSurf);
    if (qSurf !== 1) this.angularVelocity = dtSeconds > 0 ? angleDelta(before, this.heading) / dtSeconds : 0;
    assert.equal(this.heading, exposed.heading, 'AD-S actual heading equals its same-state surface shadow');
    assert.equal(this.angularVelocity, exposed.rate, 'AD-S actual rate equals its same-state surface shadow');
    const surfaceChanged = Math.abs(angleDelta(native.heading, exposed.heading)) > TURN_EPS;
    const depthChanged = Math.abs(angleDelta(native.heading, depth.heading)) > TURN_EPS;
    const row = bucketA(layers);
    row.calls += 1; record.A.calls += 1;
    if (layers > 0) { row.materialCalls += 1; record.A.materialCalls += 1; }
    if (surface) { record.A.surfaceCalls += 1; }
    row.nativeBinding += Number(nativeBinding); row.depthBinding += Number(depthBinding); row.surfaceBinding += Number(surfaceBinding);
    row.depthChanged += Number(depthChanged); row.surfaceChanged += Number(surfaceChanged);
    record.A.nativeBinding += Number(nativeBinding); record.A.depthBinding += Number(depthBinding);
    record.A.surfaceBinding += Number(surfaceBinding); record.A.depthChanged += Number(depthChanged);
    record.A.surfaceChanged += Number(surfaceChanged);
    row.nativeRate.push(Math.abs(native.rate)); row.depthRate.push(Math.abs(depth.rate)); row.surfaceRate.push(Math.abs(exposed.rate));
    row.depthSuppression.push(Math.max(0, Math.abs(native.rate) - Math.abs(depth.rate)));
    row.surfaceSuppression.push(Math.max(0, Math.abs(native.rate) - Math.abs(exposed.rate)));
    row.depthMinusSurfaceRate.push(Math.abs(depth.rate) - Math.abs(exposed.rate));
    row.requestedHeading.push(targetHeading); row.requestedHeadingError.push(targetError); row.beforeHeading.push(before);
    row.depthHeadingDifference.push(Math.abs(angleDelta(native.heading, depth.heading)));
    row.surfaceHeadingDifference.push(Math.abs(angleDelta(native.heading, exposed.heading)));
    row.depthMinusSurfaceHeading.push(Math.abs(angleDelta(exposed.heading, depth.heading)));
    if (layers === 1) {
      record.A.l1ConformanceChecks += 1; record.l1.AChecks += 1;
      const mismatch = qDepth !== qSurf || depth.heading !== exposed.heading || depth.rate !== exposed.rate;
      record.A.l1ConformanceMismatches += Number(mismatch); record.l1.AMismatches += Number(mismatch);
      assert(!mismatch, 'L=1 A depth and surface candidates are exactly equal');
    }
    if (current) {
      const second = Math.floor(current.timeMs / 1000);
      const rowSec = record.perSecond[second] ||= { second, ACalls: 0, AAtL1: 0, AAtLgt1: 0,
        ADepthChanged: 0, ASurfaceChanged: 0, DFinite: 0, DAtL1: 0, DAtLgt1: 0,
        DDepthChanged: 0, DSurfaceChanged: 0 };
      rowSec.ACalls += 1; rowSec.AAtL1 += Number(layers === 1); rowSec.AAtLgt1 += Number(layers > 1);
      rowSec.ADepthChanged += Number(depthChanged); rowSec.ASurfaceChanged += Number(surfaceChanged);
    }
  };

  const onFlowSample = row => {
    assert(current, 'flow callback is inside a registered tick');
    const ant = antById.get(row.antId);
    assert(ant, `same-tick ant ${row.antId} is present`);
    const layers = layersByAnt.get(ant) || 0, surface = surfaceByAnt.get(ant) || 0;
    const key = String(layers);
    if (row.stage !== 'final-target') {
      const layer = record.D.senseByLayer[key] ||= newDLayer();
      record.D.senseCalls += 1; layer.senseCalls += 1;
      if (layers > 0) { record.D.materialSenseCalls += 1; layer.materialCalls += 1; }
      if (row.eligible) {
        record.D.finiteSameFlow += 1; layer.finiteSameFlow += 1;
        if (layers > 0) record.D.materialFiniteSameFlow += 1;
        const speed = Math.hypot(ant.vx ?? 0, ant.vy ?? 0);
        const spacingFloor = row.personality.personalSpacing * 0.6;
        const nativeTerm = Math.max(spacingFloor, speed * HEADWAY_SECONDS);
        const depthTerm = Math.max(spacingFloor, speed * headway(layers));
        const surfaceTerm = Math.max(spacingFloor, speed * (HEADWAY_SECONDS * hSurface(surface)));
        const depthLimit = Math.max(0, row.nativeFollowingSpeedLimit
          - (depthTerm - nativeTerm) / FOLLOWING_RESPONSE_SECONDS);
        const surfaceLimit = Math.max(0, row.nativeFollowingSpeedLimit
          - (surfaceTerm - nativeTerm) / FOLLOWING_RESPONSE_SECONDS);
        assert.equal(row.nativeHeadwayTerm, nativeTerm, 'native following headway matches the paired calculation');
        assert.equal(row.candidateHeadwayTerm, surfaceTerm, 'surface following headway matches the applied arm');
        assert.equal(row.candidateFollowingSpeedLimit, surfaceLimit, 'surface cap matches the paired calculation');
        const depthExpanded = depthTerm !== nativeTerm, surfaceExpanded = surfaceTerm !== nativeTerm;
        layer.depthHeadwayExpanded += Number(depthExpanded); layer.surfaceHeadwayExpanded += Number(surfaceExpanded);
        record.D.depthHeadwayExpanded += Number(depthExpanded); record.D.surfaceHeadwayExpanded += Number(surfaceExpanded);
        layer.nativeHeadway.push(nativeTerm); layer.depthHeadway.push(depthTerm); layer.surfaceHeadway.push(surfaceTerm);
        layer.depthHeadwayIncrease.push(depthTerm - nativeTerm); layer.surfaceHeadwayIncrease.push(surfaceTerm - nativeTerm);
        layer.speed.push(speed); layer.personalSpacingFloor.push(spacingFloor);
        layer.nativeFollowingLimit.push(row.nativeFollowingSpeedLimit); layer.depthFollowingLimit.push(depthLimit);
        layer.surfaceFollowingLimit.push(surfaceLimit); layer.neighborCount.push(row.info.neighbors);
        layer.frontCrowding.push(row.info.frontCrowding);
        senseByAntId.set(row.antId, { layers, surface, row, depthLimit, surfaceLimit, nativeTerm, depthTerm, surfaceTerm });
        if (layers === 1) {
          record.D.l1ConformanceChecks += 1; record.l1.DChecks += 1;
          const mismatch = depthTerm !== surfaceTerm || depthLimit !== surfaceLimit
            || headway(1) !== HEADWAY_SECONDS * hSurface(1);
          record.D.l1ConformanceMismatches += Number(mismatch); record.l1.DMismatches += Number(mismatch);
          assert(!mismatch, 'L=1 D headway and following cap are exactly equal');
        }
        const second = Math.floor(current.timeMs / 1000);
        const rowSec = record.perSecond[second] ||= { second, ACalls: 0, AAtL1: 0, AAtLgt1: 0,
          ADepthChanged: 0, ASurfaceChanged: 0, DFinite: 0, DAtL1: 0, DAtLgt1: 0,
          DDepthChanged: 0, DSurfaceChanged: 0 };
        rowSec.DFinite += 1; rowSec.DAtL1 += Number(layers === 1); rowSec.DAtLgt1 += Number(layers > 1);
      } else senseByAntId.set(row.antId, { layers, surface, row,
        depthLimit: row.nativeFollowingSpeedLimit, surfaceLimit: row.nativeFollowingSpeedLimit,
        nativeTerm: null, depthTerm: null, surfaceTerm: null });
      return;
    }

    const layer = record.D.targetByLayer[key] ||= newDLayer();
    record.D.finalTargetCalls += 1; layer.finalTargetCalls += 1;
    if (layers > 0) { record.D.materialFinalTargetCalls += 1; layer.materialCalls += 1; }
    assert(row.actualMatchesProspective, 'AD-S actual final target equals the production helper surface candidate');
    const sense = senseByAntId.get(row.antId);
    assert(sense, 'final target has its same-tick native sense row');
    const info = sense.row.info;
    const nativeTarget = targetSpeed(ant, info, row.nativeFollowingSpeedLimit);
    const depthTarget = targetSpeed(ant, info, sense.depthLimit);
    const surfaceTarget = targetSpeed(ant, info, sense.surfaceLimit);
    const unboundedTarget = targetSpeed(ant, info, Infinity);
    assert(Math.abs(nativeTarget - row.nativeDesiredSpeed) <= TARGET_EPS, 'native target matches helper shadow');
    assert(Math.abs(surfaceTarget - row.prospectiveDesiredSpeed) <= TARGET_EPS, 'surface target matches helper shadow');
    assert(Math.abs(surfaceTarget - row.actualFinalTargetSpeed) <= TARGET_EPS, 'surface target equals applied AD-S target');
    const depthBinding = depthTarget < unboundedTarget - TARGET_EPS;
    const surfaceBinding = surfaceTarget < unboundedTarget - TARGET_EPS;
    const depthChanged = sense.row.eligible && Math.abs(depthTarget - nativeTarget) > TARGET_EPS;
    const surfaceChanged = sense.row.eligible && Math.abs(surfaceTarget - nativeTarget) > TARGET_EPS;
    layer.depthBinding += Number(depthBinding); layer.surfaceBinding += Number(surfaceBinding);
    layer.depthChangedTargets += Number(depthChanged); layer.surfaceChangedTargets += Number(surfaceChanged);
    record.D.depthTargetBinding += Number(depthBinding); record.D.surfaceTargetBinding += Number(surfaceBinding);
    record.D.depthChangedTargets += Number(depthChanged); record.D.surfaceChangedTargets += Number(surfaceChanged);
    layer.nativeTarget.push(nativeTarget); layer.depthTarget.push(depthTarget); layer.surfaceTarget.push(surfaceTarget);
    layer.depthTargetReduction.push(nativeTarget - depthTarget); layer.surfaceTargetReduction.push(nativeTarget - surfaceTarget);
    layer.depthMinusSurfaceTarget.push(depthTarget - surfaceTarget);
    if (layers === 1) {
      record.D.l1ConformanceChecks += 1; record.l1.DChecks += 1;
      const mismatch = depthTarget !== surfaceTarget || row.candidateFollowingSpeedLimit !== sense.surfaceLimit;
      record.D.l1ConformanceMismatches += Number(mismatch); record.l1.DMismatches += Number(mismatch);
      assert(!mismatch, 'L=1 D final target is exactly equal under depth and surface conditioning');
    }
    const second = Math.floor(current.timeMs / 1000);
    const rowSec = record.perSecond[second] ||= { second, ACalls: 0, AAtL1: 0, AAtLgt1: 0,
      ADepthChanged: 0, ASurfaceChanged: 0, DFinite: 0, DAtL1: 0, DAtLgt1: 0,
      DDepthChanged: 0, DSurfaceChanged: 0 };
    rowSec.DDepthChanged += Number(depthChanged); rowSec.DSurfaceChanged += Number(surfaceChanged);
    senseByAntId.delete(row.antId);
  };

  return { record, install(controller) {
    controller.materialLocomotionResistance = false;
    guard = controller.occupancy.constrainDisplacements;
    flow = attachFlowVelocity(controller, { kind: 'following', enabled: true, layersByAnt: flowSurfaceByAnt,
      onSample: onFlowSample });
    flowTick = controller.tick;
    outerTick = (...args) => {
      const snapshot = controller.materialStratigraphy.getSnapshot(), agents = controller.agents.slice();
      const live = new Set(agents);
      for (const [ant, row] of turnWrappers) if (!live.has(ant)) {
        if (ant.turnToward === row.wrapper) ant.turnToward = row.original;
        turnWrappers.delete(ant);
      }
      current = { tick: ++record.ticks, timeMs: controller.simulationTimeMs, byId: new Map() };
      layersByAnt.clear(); surfaceByAnt.clear(); flowSurfaceByAnt.clear(); antById.clear(); senseByAntId.clear();
      for (const ant of agents) {
        const cell = readSurfaceCount(snapshot, ant);
        layersByAnt.set(ant, cell.layers); surfaceByAnt.set(ant, cell.surface);
        flowSurfaceByAnt.set(ant, cell.surface); antById.set(ant.id, ant);
        current.byId.set(ant.id, { ...cell, ant });
        if (!turnWrappers.has(ant)) {
          const original = ant.turnToward, wrapper = turnWrapper(ant, original);
          turnWrappers.set(ant, { original, wrapper }); ant.turnToward = wrapper;
        }
      }
      record.tickEntrySnapshots += 1;
      const result = flowTick(...args);
      const afterTick = Math.round(controller.simulationTimeMs / DT_MS);
      if (expectedTicks.has(afterTick)) record.frames.push(captureFrame(controller, afterTick, thinner));
      current = null;
      return result;
    };
    controller.tick = outerTick;
    controller.subscribe(event => {
      if (event.type !== 'foot-contact' || event.payload?.type !== 'FOOT_CONTACT'
        || !Array.isArray(event.payload.contacts)) return;
      for (const contact of event.payload.contacts) {
        const p = contact?.position;
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
        const x = Math.max(0, Math.min(95, Math.round(p.x * 95))), y = Math.max(0, Math.min(95, Math.round(p.y * 95)));
        record.footGrid[y * N + x] += 1; record.footTotal += 1;
      }
    });
    return { finish() {
      if (controller.tick === outerTick) controller.tick = flowTick;
      flow.finish();
      for (const [ant, row] of turnWrappers) if (ant.turnToward === row.wrapper) ant.turnToward = row.original;
      turnWrappers.clear();
      assert.equal(controller.occupancy.constrainDisplacements, guard, 'native swept displacement guard remains unchanged');
      assert.equal(record.ticks, 36000); assert.equal(record.tickEntrySnapshots, 36000);
      assert.deepEqual(record.frames.map(frame => frame.tick), [...expectedTicks]);
    } };
  } };
}

async function sourceHashes() {
  return Object.fromEntries(await Promise.all([...SOURCES, 'scripts/ant-material-feedback-surface-vs-depth.js']
    .map(async file => [file, await hashFile(file)])));
}

async function frozenReceipts() {
  const refs = {
    N: { path: N_DATA, names: ['run-summary.json', 'seed20261005-G-raw.json.gz', 'auxiliary.json.gz',
      'INPUT-RECEIPTS.json', 'SOURCE-HASHES.json'] },
    'AD-L': { path: AD_DATA, names: ['run-summary.json', 'seed20261005-G-raw.json.gz', 'auxiliary.json.gz',
      'opportunity-frames.json.gz', 'PROVENANCE.json', 'ANALYSIS.json'] }
  };
  const receipts = {};
  for (const [arm, item] of Object.entries(refs)) receipts[arm] = Object.fromEntries(await Promise.all(item.names.map(async name =>
    [name, await hashFile(`${item.path}/${name}`)])));
  const [nRun, adRun, nRaw, adRaw, adAnalysis, adProvenance] = await Promise.all([
    readJson(`${N_DATA}/run-summary.json`), readJson(`${AD_DATA}/run-summary.json`),
    readGzip(`${N_DATA}/seed20261005-G-raw.json.gz`), readGzip(`${AD_DATA}/seed20261005-G-raw.json.gz`),
    readJson(`${AD_DATA}/ANALYSIS.json`), readJson(`${AD_DATA}/PROVENANCE.json`)
  ]);
  assert.equal(nRun.initialStateSha256, 'f480c2fd61e34c4975539e50bdac3c3511aa4b73192473b317d6760e274f02fd');
  assert.equal(adRun.initialStateSha256, nRun.initialStateSha256);
  assert.equal(adProvenance.productionMain, MAIN);
  assert(adAnalysis.direct.AD, 'AD-L direct consumer measurements exist');
  const [manifestBytes, adRawBytes, adRunBytes, adAuxBytes, nRawBytes, nRunBytes, nAuxBytes] = await Promise.all([
    readFile(resolve(ROOT, `${AD_PACKAGE}/SHA256SUMS.txt`)),
    readFile(resolve(ROOT, `${AD_DATA}/seed20261005-G-raw.json.gz`)),
    readFile(resolve(ROOT, `${AD_DATA}/run-summary.json`)),
    readFile(resolve(ROOT, `${AD_DATA}/auxiliary.json.gz`)),
    readFile(resolve(ROOT, `${N_DATA}/seed20261005-G-raw.json.gz`)),
    readFile(resolve(ROOT, `${N_DATA}/run-summary.json`)),
    readFile(resolve(ROOT, `${N_DATA}/auxiliary.json.gz`))
  ]);
  const manifest = Object.fromEntries(manifestBytes.toString('utf8').split(/\r?\n/)
    .map(line => line.match(/^([a-f0-9]{64})  (.+)$/)).filter(Boolean).map(([, digest, path]) => [path, digest]));
  assert.equal(hash(adRawBytes), manifest[`${AD_DATA}/seed20261005-G-raw.json.gz`]);
  assert.equal(hash(adRunBytes), manifest[`${AD_DATA}/run-summary.json`]);
  assert.equal(hash(adAuxBytes), manifest[`${AD_DATA}/auxiliary.json.gz`]);
  assert.equal(hash(nRawBytes), adProvenance.frozenArmArtifacts.N.rawSha256);
  assert.equal(hash(nRunBytes), adProvenance.frozenArmArtifacts.N.runSummarySha256);
  assert.equal(hash(nAuxBytes), adProvenance.frozenArmArtifacts.N.auxiliarySha256);
  assert.deepEqual(adRaw.positions.filter(row => row.seconds <= 84), nRaw.positions.filter(row => row.seconds <= 84),
    'reused AD-L positions match N through the first material event');
  assert.deepEqual(adRaw.contactsBySecond.filter(row => row.seconds <= 84), nRaw.contactsBySecond.filter(row => row.seconds <= 84),
    'reused AD-L contact buckets match N through the first material event');
  return { artifacts: receipts, initialStateSha256: nRun.initialStateSha256,
    manifests: { parentADL: 'verified against parent SHA256SUMS.txt', neutralN: 'verified against frozen AD-L provenance pins' },
    firstPlateSeconds: nRun.events.firstPlateSeconds, ADLFirstPlateSeconds: adRun.events.firstPlateSeconds,
    ADLDirectCounts: { A: adAnalysis.direct.AD.A, D: adAnalysis.direct.AD.D },
    ADLPositionThroughFirstPlate: adRaw.positions.filter(row => row.seconds <= 84),
    NPositionThroughFirstPlate: nRaw.positions.filter(row => row.seconds <= 84),
    ADLContactsThroughFirstPlate: adRaw.contactsBySecond.filter(row => row.seconds <= 84),
    NContactsThroughFirstPlate: nRaw.contactsBySecond.filter(row => row.seconds <= 84),
    ADLOpportunityTicks: adAnalysis.frozenAnchorTicks };
}

async function validateAuthority() {
  return { main: MAIN, productionDiffClean: true,
    verification: 'git rev-parse origin/main and git diff origin/main -- src static docs/ant/README.md checked externally before the run' };
}

async function analyzeSaved() {
  const [run, raw, auxiliary, frames, refs, provenance] = await Promise.all([
    readJson(`${DATA}/run-summary.json`), readGzip(`${DATA}/seed20261005-G-raw.json.gz`),
    readGzip(`${DATA}/auxiliary.json.gz`), readGzip(`${DATA}/opportunity-frames.json.gz`), frozenReceipts()
    , readJson(`${DATA}/PROVENANCE.json`)
  ]);
  assert.deepEqual(refs.ADLPositionThroughFirstPlate, refs.NPositionThroughFirstPlate,
    'AD-S positions match frozen N until first Plate at 84 s');
  assert.deepEqual(refs.ADLContactsThroughFirstPlate, refs.NContactsThroughFirstPlate,
    'AD-S contact buckets match frozen N until first Plate at 84 s');
  assert.equal(run.initialStateSha256, refs.initialStateSha256, 'AD-S shares the frozen initial world');
  assert.equal(run.events.firstPlateSeconds, refs.firstPlateSeconds, 'first Plate timing matches neutral and AD-L');
  assert.equal(run.movement.finiteViolations, 0); assert.equal(run.movement.speedCapViolations, 0);
  assert.equal(run.movement.turnCapViolations, 0); assert.equal(run.movement.overlapViolations, 0);
  assert.equal(run.movement.populationCeilingViolations, 0);
  assert.equal(auxiliary.l1.AMismatches, 0); assert.equal(auxiliary.l1.DMismatches, 0);
  assert.equal(auxiliary.A.l1ConformanceMismatches, 0); assert.equal(auxiliary.D.l1ConformanceMismatches, 0);
  assert.equal(auxiliary.A.l1ConformanceChecks, auxiliary.l1.AChecks);
  assert.equal(auxiliary.D.l1ConformanceChecks, auxiliary.l1.DChecks);
  assert.equal(auxiliary.footTotal, run.events.individualFeet);
  assert.deepEqual(frames.map(frame => frame.tick), refs.ADLOpportunityTicks);
  const summary = summarizeRun(run, raw, auxiliary, frames);
  const nRaw = await readGzip(`${N_DATA}/seed20261005-G-raw.json.gz`);
  const nAux = await readGzip(`${N_DATA}/auxiliary.json.gz`);
  const adRun = await readJson(`${AD_DATA}/run-summary.json`), adRaw = await readGzip(`${AD_DATA}/seed20261005-G-raw.json.gz`);
  const adAux = await readGzip(`${AD_DATA}/auxiliary.json.gz`);
  const nFoot = footGridFromFeet(nAux.feet), adLFoot = footGridFromFeet(adAux.feet), adSFoot = footMap(auxiliary.footGrid);
  const nRoute = positionMap(nRaw), adLRoute = positionMap(adRaw), adSRoute = positionMap(raw);
  summary.footGrid.normalizedL1VsN = mapDifference(nFoot, adSFoot).normalizedL1;
  summary.routeGrid.normalizedL1VsN = mapDifference(nRoute, adSRoute).normalizedL1;
  const references = {};
  for (const [arm, row, armRaw, armAux] of [['N', await readJson(`${N_DATA}/run-summary.json`), nRaw, nAux],
    ['AD-L', adRun, adRaw, adAux]]) {
    const end = row.checkpoints.at(-1), routed = positionMap(armRaw), feet = footGridFromFeet(armAux.feet);
    references[arm] = { initialStateSha256: row.initialStateSha256, finalRng: row.finalRng,
      movement: { totalDistance: row.movement.totalDistance, activeAntSeconds: row.movement.activeAntSeconds,
        travelPerActiveAntSecond: row.movement.travelPerActiveAntSecond, blockedFrames: row.movement.blockedFrames },
      events: { contactGroups: row.events.contactGroups, individualFeet: row.events.individualFeet,
        plateBirths: row.events.plateBirths, firstPlateSeconds: row.events.firstPlateSeconds,
        sphereBirths: row.events.sphereBirths },
      checkpoint300: row.checkpoints.find(point => point.seconds === 300),
      checkpoint600: { activePopulation: end.activePopulation, field: end.field, surface: end.surface,
        material: end.material, occupancy: end.occupancy },
      recruitment: { recruited: row.movement.recruited, retired: row.movement.retired },
      footDistributionVsN: arm === 'N' ? null : mapDifference(nFoot, feet),
      routeDistributionVsN: arm === 'N' ? null : mapDifference(nRoute, routed),
      ADLDirectByLayer: arm === 'AD-L' ? adAnalysisDirect(armAux, await readJson(`${AD_DATA}/ANALYSIS.json`)) : null };
  }
  return { schema: 'ant-material-feedback-surface-vs-depth-analysis-v1',
    sourceReceipts: { runInstrumentationSourceSha256:
      provenance.sourceHashes['scripts/ant-material-feedback-surface-vs-depth.js'],
      postprocessingSourceSha256: await hashFile('scripts/ant-material-feedback-surface-vs-depth.js'),
      frozenReferences: refs.artifacts },
    protocol: auxiliary.protocol, replayParity: { initialState: true, firstPlateTiming: true,
      positionsThrough84s: true, contactBucketsThrough84s: true, opportunityAnchorTicks: true,
      productionBehaviorChanged: false, observerRngCalls: 0 },
    direct: { A: summary.A, D: summary.D, depthExposure: exposure(summary.A, summary.D),
      l1Conformance: auxiliary.l1 },
    world: { 'AD-S': summary, frozenReferences: references,
      mapComparisonRule: 'descriptive 96x96 normalized L1 of pooled rounded positions or FOOT_CONTACT cells; never a world ranking' },
    finalRng: run.finalRng,
    invariants: run.invariants, events: run.events };
}

async function analyzeAndStore() {
  const analysis = await analyzeSaved();
  const path = resolve(ROOT, `${DATA}/ANALYSIS.json`), bytes = Buffer.from(JSON.stringify(analysis, null, 2) + '\n');
  try { assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), analysis, 'saved analysis matches deterministic output'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeNew(path, bytes);
  }
  assert.deepEqual(await analyzeSaved(), analysis, 'analysis rerun from frozen outputs is exact');
  return analysis;
}

function adAnalysisDirect(aux, analysis) {
  return analysis.direct.AD;
}

function exposure(A, D) {
  return Object.fromEntries(['0', '1', '2-4', '>=5'].map(bin => [bin, {
    ACalls: A.byBin[bin].calls, AMaterialCalls: A.byBin[bin].materialCalls,
    ADepthChanged: A.byBin[bin].depthChanged, ASurfaceChanged: A.byBin[bin].surfaceChanged,
    DSenseCalls: D.byBin[bin].senseCalls, DMaterialCalls: D.byBin[bin].materialCalls,
    DFiniteSameFlow: D.byBin[bin].finiteSameFlow,
    DDepthHeadwayExpanded: D.byBin[bin].depthHeadwayExpanded,
    DSurfaceHeadwayExpanded: D.byBin[bin].surfaceHeadwayExpanded,
    DFinalTargetCalls: D.byBin[bin].finalTargetCalls,
    DDepthChangedTargets: D.byBin[bin].depthChangedTargets,
    DSurfaceChangedTargets: D.byBin[bin].surfaceChangedTargets
  }]));
}

async function selfTest() {
  assert.equal(qA(0), 1); assert.equal(qSurface(0), 1); assert.equal(hD(0), 1); assert.equal(hSurface(0), 1);
  assert.equal(qA(1), qSurface(1)); assert.equal(headway(1), HEADWAY_SECONDS * hSurface(1));
  assert(ANT_MAX_TURN_RATE * qA(1) < ANT_MAX_TURN_RATE);
  for (let layers = 0; layers <= 100; layers += 1) {
    assert(qA(layers + 1) <= qA(layers)); assert(qA(layers) >= 0.5 && qA(layers) <= 1);
    assert(hD(layers + 1) >= hD(layers)); assert(hD(layers) >= 1 && hD(layers) <= 1.5);
  }
  assert.equal(qA(1e9), 0.5); assert.equal(hD(1e9), 1.5);
  return { status: 'PASS', checks: ['L0-native-identity', 'L1-A-exact-conformance',
    'L1-D-headway-exact-conformance', 'depth-law-monotonicity-bounds', 'registered-asymptotes'],
  qA1: qA(1), turnCapL1: ANT_MAX_TURN_RATE * qA(1), hD1: hD(1), headwayL1Seconds: headway(1) };
}

async function run() {
  const selfChecks = await selfTest();
  const authority = await validateAuthority();
  const production = await verifySourceAuthority();
  const inputReceipts = await verifyBaselineInputs();
  const refs = await frozenReceipts();
  const parentAnalysis = await readJson(`${AD_DATA}/ANALYSIS.json`);
  const expectedTicks = new Set(parentAnalysis.frozenAnchorTicks);
  const thinner = loadThinner(await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8'));
  const hashes = await sourceHashes();
  const planSha256 = await hashFile(`${PACKAGE}/PLAN.md`);
  const output = resolve(ROOT, DATA);
  await mkdir(output, { recursive: true });
  for (const name of ['run-summary.json', 'auxiliary.json.gz', 'opportunity-frames.json.gz', 'seed20261005-G-raw.json.gz'])
    await assert.rejects(readFile(resolve(output, name)), { code: 'ENOENT' }, `${name} must not exist before the one AD-S run`);
  const provenance = { schema: 'ant-material-feedback-surface-vs-depth-provenance-v1',
    productionAuthority: MAIN, researchParent: PARENT, branch: BRANCH, authority,
    productionSourceHashes: production, sourceHashes: hashes, preregistrationPlanSha256: planSha256,
    frozenBaseline: { seed: 20261005, arm: 'current-G/H0', tickRate: 60, modelSeconds: 600,
      audio: 'Off', productionSlowdown: 'Off', residence: 'Off', otherCandidates: 'Off',
      initialStateSha256: refs.initialStateSha256, firstPlateSeconds: refs.firstPlateSeconds,
      inputReceipts, frozenArtifacts: refs.artifacts,
      reusedParentADL: 'same AD-L direct response by exact L; paired L/S counterfactuals are computed on each AD-S consumer state; no AD-L replay' },
    laws: { qA: '1 - .50*(1-exp(-L/4))', turnCap: '4.5 rad/s * qA(L)',
      hD: '1 + .50*(1-exp(-L/4))', followingHeadway: '.4 s * hD(L)',
      surface: 'S=0 if topLayerByCell<0 else S=1; qSurface(S)=S? qA(1):1; hSurface(S)=S?hD(1):1',
      qA1: qA(1), turnCapL1: ANT_MAX_TURN_RATE * qA(1), hD1: hD(1), headwayL1Seconds: headway(1),
      layerBins: ['0', '1', '2-4', '>=5'] },
    treatment: { count: 1, arm: 'AD-S', seed: 20261005, seconds: 600, tickRate: 60, audio: 'Off',
      actualAConditioning: 'S', actualDConditioning: 'S', pairedDepthShadow: 'L on the exact same tick-entry consumer state',
      productionLocomotionResistance: false, chemicalResidence: false, productionCodeChanged: false,
      observerRngCalls: 0, exactLateAnchorTicks: parentAnalysis.frozenAnchorTicks, selfChecks },
    limits: ['one seed', 'late cross-arm maps are endogenous descriptions', 'surface presence is not asserted as physical law'] };
  await writeNew(resolve(output, 'PROVENANCE.json'), Buffer.from(JSON.stringify(provenance, null, 2) + '\n'));
  const recorder = makeRecorder(expectedTicks, thinner);
  let recorderHook;
  const result = await executeScenario(20261005, 'G', 600, output, null,
    controller => { recorderHook = recorder.install(controller); });
  recorderHook.finish();
  assert.equal(result.seed, 20261005); assert.equal(result.arm, 'G'); assert.equal(result.seconds, 600);
  assert.equal(result.initialStateSha256, refs.initialStateSha256);
  assert.equal(recorder.record.footTotal, result.events.individualFeet,
    'read-only FOOT_CONTACT raster accounts for all individual feet');
  const runSummary = JSON.stringify(result, null, 2) + '\n';
  await writeNew(resolve(output, 'run-summary.json'), Buffer.from(runSummary));
  const aux = recorder.record;
  const { frames, ...auxiliary } = aux;
  const auxiliaryBytes = gzipSync(JSON.stringify(auxiliary,
    (key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value), { level: 9, mtime: 0 });
  const framesBytes = gzipSync(JSON.stringify(frames, (key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value),
    { level: 9, mtime: 0 });
  await writeNew(resolve(output, 'auxiliary.json.gz'), auxiliaryBytes);
  await writeNew(resolve(output, 'opportunity-frames.json.gz'), framesBytes);
  const analysis = await analyzeAndStore();
  console.log(JSON.stringify({ status: 'AD-S-SURFACE-VS-DEPTH-PASS', output, selfChecks,
    directA: analysis.direct.A.byBin, directD: analysis.direct.D.byLayer,
    exposure: analysis.direct.depthExposure, world: analysis.world['AD-S'].events,
    lateOpportunityCount: analysis.world['AD-S'].lateOpportunityFrames.length }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--self-test')) selfTest().then(result => console.log(JSON.stringify(result, null, 2)));
  else if (process.argv.includes('--run')) run().catch(error => { console.error(error); process.exitCode = 1; });
  else if (process.argv.includes('--analyze')) analyzeAndStore().then(result => console.log(JSON.stringify({
    status: 'ANALYSIS-RERUN-PASS', analysis: `${DATA}/ANALYSIS.json`, sourceReceipts: result.sourceReceipts,
    l1Conformance: result.direct.l1Conformance, exposure: result.direct.depthExposure,
    worldEvents: result.world['AD-S'].events, lateAnchors: result.world['AD-S'].lateOpportunityFrames.length
  }, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}
