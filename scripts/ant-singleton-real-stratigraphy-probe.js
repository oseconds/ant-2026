import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntController, materialLocomotionMultiplier, materialTurnRateMultiplier,
  materialFollowingHeadwayMultiplier, materialLayerCountAtSnapshot } from '../src/lib/agents/ant/AntController.js';
import { productionOps } from './ant-local-opportunity-capture.js';
import { CELL_COUNT, OPPORTUNITY_GRID_SIZE, point, xCapture } from './ant-local-opportunity-core.js';
import { readJson, readRun, sha256, unpack, writeJson, writeRun } from './ant-local-opportunity-io.js';
import { createSingletonLayerOverlay, SingletonFeedbackObserver } from './ant-singleton-feedback-observer.js';
import { createResearchLocalPlate } from './ant-singleton-real-plate.js';
import { MATERIAL_STRATIGRAPHY_NODULE_QUALIFICATION as NODULE_RULE } from '../src/lib/agents/ant/MaterialStratigraphy.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const AUTHORITY = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const EXPECTED_PARENT = '9b03a392588429643cf43b386706d58bbfb66418';
const BRANCH = 'codex/ant-singleton-real-stratigraphy-probe-20261101';
const SEED = '20261005', SECONDS = 300, DT = 1 / 60, TICKS = SECONDS * 60, GRID = 96;
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-singleton-real-stratigraphy-probe');
const PRIOR_EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-singleton-feedback-sensitivity/analysis');
const FROZEN_SIGNALS = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis/seed-20261005.signals.json.gz');
const FROZEN_OPPORTUNITIES = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis/seed-20261005.opportunities.json.gz');
const FROZEN_EVENTS = resolve(ROOT, 'docs/ant/evidence/2026-10-31-bc-dual-material-shadow/analysis/events-20261005.json.gz');
const SOURCE_PATHS = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js'
];
const normalizeText = value => value.replace(/\r\n?/g, '\n');
const bytes = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength);
const digest = value => createHash('sha256').update(value).digest('hex');
const pack = value => ({ type: value.constructor.name, length: value.length, data: bytes(value).toString('base64') });
const indices = values => { const rows = []; for (let i = 0; i < values.length; i++) if (values[i]) rows.push(i); return rows; };
const gridIndex = (x, y) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1
  ? -1 : Math.round(x * (GRID - 1)) + Math.round(y * (GRID - 1)) * GRID;
const clamp01 = value => Math.min(1, Math.max(0, value));

function countedLcg(seed) {
  let state = Number(seed) >>> 0, calls = 0;
  return { random() { calls++; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; },
    get calls() { return calls; }, state() { return state; } };
}

function fingerprint(controller, rng) {
  const agents = controller.agents.map(agent => ({ ...agent,
    gait: controller.gaitController.getSnapshot(agent), bodyPose: controller.bodyPoseController.getSnapshot(agent) }));
  const candidate = controller.trailPlateBirth.candidate;
  const state = { time: controller.simulationTimeMs, nextSpawn: controller.nextSpawnTimeMs,
    spawned: controller.totalSpawned, retired: controller.totalRetired, rngCalls: rng.calls, rngState: rng.state(),
    lastAnalysis: controller.trailPlateBirth.lastAnalysisTimeMs, agents,
    candidate: candidate ? { startedAtMs: candidate.startedAtMs, stableSeconds: candidate.stableSeconds,
      similarity: candidate.similarity, source: candidate.source, target: candidate.target, path: candidate.path,
      skeletonIndices: candidate.skeletonIndices, mask: digest(bytes(candidate.mask)),
      supportedMask: digest(bytes(candidate.supportedMask)) } : null,
    plates: controller.trailPlateBirth.getPlates().map(p => [p.id, p.bornAtSimulationTimeMs]),
    activation: controller.colonyActivation.getSnapshot() };
  const material = controller.materialStratigraphy.getSnapshot();
  state.fields = [controller.field.values, controller.surfaceField.values,
    controller.trailPlateBirth.chemicalMemory, controller.trailPlateBirth.footContactCounts,
    material.stratigraphy.layerCountByCell, material.stratigraphy.topLayerByCell,
    material.stratigraphy.totalDepthByCellMeters]
    .map(value => digest(bytes(value)));
  state.materialRevision = [material.revision, material.noduleRevision];
  return digest(JSON.stringify(state));
}

function environmentMovementFingerprint(controller, rng) {
  const state = { time: controller.simulationTimeMs, nextSpawn: controller.nextSpawnTimeMs,
    spawned: controller.totalSpawned, retired: controller.totalRetired, rngCalls: rng.calls,
    rngState: rng.state(), agents: controller.agents.map(agent => ({ ...agent,
      gait: controller.gaitController.getSnapshot(agent), bodyPose: controller.bodyPoseController.getSnapshot(agent) })),
    candidate: controller.trailPlateBirth.candidate ? {
      startedAtMs: controller.trailPlateBirth.candidate.startedAtMs,
      stableSeconds: controller.trailPlateBirth.candidate.stableSeconds,
      similarity: controller.trailPlateBirth.candidate.similarity,
      source: controller.trailPlateBirth.candidate.source, target: controller.trailPlateBirth.candidate.target,
      path: controller.trailPlateBirth.candidate.path,
      mask: digest(bytes(controller.trailPlateBirth.candidate.mask)),
      supportedMask: digest(bytes(controller.trailPlateBirth.candidate.supportedMask)) } : null,
    plates: controller.trailPlateBirth.getPlates().map(p => [p.id, p.bornAtSimulationTimeMs]),
    activation: controller.colonyActivation.getSnapshot(),
    fields: [controller.field.values, controller.surfaceField.values,
      controller.trailPlateBirth.chemicalMemory, controller.trailPlateBirth.footContactCounts]
      .map(value => digest(bytes(value))) };
  return digest(JSON.stringify(state));
}

export function armConformanceProjection(run) {
  const projection = structuredClone(run);
  delete projection.experimentBranch;
  return projection;
}

export function assertArmReplicatesPrior(actual, expected, exposure = null, expectedExposure = null) {
  assert.deepEqual(armConformanceProjection(actual), armConformanceProjection(expected),
    `${actual.arm} run must replicate saved seed-05 arm (branch metadata only may differ)`);
  if (exposure || expectedExposure) assert.deepEqual(exposure, expectedExposure,
    `${actual.arm} exposure tuples and summaries must replicate saved seed-05 exposure`);
  return { arm: actual.arm, allRunFieldsExactExceptBranch: true,
    tickStateHashes: actual.tickStateHashes.length, anchors: actual.anchors.length,
    tickMetrics: actual.tickMetrics.length, checkpoints: actual.checkpoints.length };
}

export function actualPlateCapacityReached(material, capacity = 256) {
  return Array.isArray(material?.plates) && Number.isInteger(capacity) && capacity > 0
    && material.plates.length >= capacity;
}

export function nativeColumnDepthMeters(strata, column) {
  let depth = 0;
  for (let index = column.length - 1; index >= 1; index--) {
    depth = Math.fround(depth + strata.plateThicknessMeters[column[index]]);
  }
  return depth;
}

export function assertFrozenAuthorityMetadata(frozen, actualSourceHashes) {
  assert.equal(frozen.authority, AUTHORITY, 'frozen authority commit');
  assert.equal(frozen.validation?.authorityHead, AUTHORITY, 'frozen authority HEAD');
  assert.equal(frozen.audio, 'Off', 'frozen run audio is Off');
  assert.equal(frozen.hz, 60, 'frozen run frequency');
  assert.equal(frozen.seconds, 600, 'frozen run horizon');
  assert.deepEqual(Object.keys(frozen.sourceHashes ?? {}).sort(), Object.keys(actualSourceHashes).sort(),
    'frozen source hash path set');
  assert.deepEqual(frozen.sourceHashes, actualSourceHashes, 'frozen source hashes match authority commit bytes');
  return { authority: AUTHORITY, authorityHead: AUTHORITY, audio: frozen.audio,
    hz: frozen.hz, seconds: frozen.seconds, sourceHashesExact: true,
    sourceHashPaths: Object.keys(actualSourceHashes).sort() };
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export async function authoritySourceHashes() {
  return Object.fromEntries(SOURCE_PATHS.map(path => [path,
    sha256(Buffer.from(normalizeText(execFileSync('git', ['show', `${AUTHORITY}:${path}`], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }))))]));
}

async function verifyAuthority() {
  assert.equal(git('branch', '--show-current'), BRANCH, 'experiment branch');
  assert.equal(git('rev-parse', AUTHORITY), AUTHORITY, 'exact production authority exists');
  assert.equal(git('merge-base', '--is-ancestor', EXPECTED_PARENT, 'HEAD'), '', 'expected experiment parent is an ancestor');
  const sourceHashes = {};
  for (const path of SOURCE_PATHS) {
    sourceHashes[path] = sha256(await readFile(resolve(ROOT, path)));
  }
  const productionFiles = git('diff', '--name-only', AUTHORITY, '--', 'src', 'static').split(/\r?\n/).filter(Boolean);
  assert.deepEqual(productionFiles, ['src/lib/agents/ant/AntController.js'], 'only the authorized default-off hook changes source');
  const controllerChanges = git('diff', '--unified=0', AUTHORITY, '--', 'src/lib/agents/ant/AntController.js')
    .split(/\r?\n/).filter(line => /^[+-]/.test(line) && !line.startsWith('+++') && !line.startsWith('---'));
  assert.deepEqual(controllerChanges, [
    '-        materialLocomotionResistance = true, audioBridge = null } = {}) {',
    '+        materialLocomotionResistance = true, researchLayerCountProvider = null, audioBridge = null } = {}) {',
    '+        this.researchLayerCountProvider = typeof researchLayerCountProvider === \'function\'',
    '+            ? researchLayerCountProvider : null;',
    '+        if (this.researchLayerCountProvider) {',
    '+            for (let index = 0; index < current.length; index += 1) {',
    '+                const addend = this.researchLayerCountProvider(current[index], materialLayers[index], this.simulationTimeMs);',
    '+                if (!Number.isInteger(addend) || addend < 0) throw new RangeError(\'research layer count must be a nonnegative integer\');',
    '+                materialLayers[index] += addend;',
    '+            }',
    '+        }'
  ], 'production-source diff is exactly the default-off tick-entry research addend hook');
  return { branch: BRANCH, currentHead: git('rev-parse', 'HEAD'), expectedParent: EXPECTED_PARENT,
    productionAuthority: AUTHORITY,
    productionSourcePaths: SOURCE_PATHS, workingSourceHashes: sourceHashes,
    sourceDiff: git('diff', '--unified=0', AUTHORITY, '--', 'src/lib/agents/ant/AntController.js') };
}

function lcgStateAsUint32(rng) { return rng.state(); }

function fieldSample(controller) {
  const C = new Float32Array(CELL_COUNT);
  assert.equal(controller.surfaceField.width, GRID); assert.equal(controller.surfaceField.height, GRID);
  for (let i = 0; i < CELL_COUNT; i++) C[i] = controller.surfaceField.sample((i % GRID) / (GRID - 1), Math.floor(i / GRID) / (GRID - 1));
  return C;
}

function summarizeArray(values) {
  let min = Infinity, max = -Infinity, sum = 0, nonzero = 0;
  const histogram = {};
  for (const value of values) {
    min = Math.min(min, value); max = Math.max(max, value); sum += value;
    nonzero += Number(value > 0); histogram[value] = (histogram[value] ?? 0) + 1;
  }
  return { sha256: digest(bytes(values)), count: values.length, min: values.length ? min : null,
    max: values.length ? max : null, mean: values.length ? sum / values.length : null,
    sum, nonzero, histogram: Object.fromEntries(Object.entries(histogram).sort((a, b) => Number(a[0]) - Number(b[0]))) };
}

function checkpoint(controller, overlay, movement) {
  const material = controller.materialStratigraphy.getSnapshot();
  const pheromone = controller.field.getSnapshot();
  const occupancy = new Uint16Array(CELL_COUNT);
  for (const agent of controller.agents) {
    const cell = gridIndex(agent.x, agent.y);
    if (cell >= 0 && occupancy[cell] < 0xffff) occupancy[cell]++;
  }
  const materialLayers = material.stratigraphy.layerCountByCell;
  return { timeMs: controller.simulationTimeMs, livingPopulation: controller.agents.length,
    cumulativeSpawned: controller.totalSpawned, cumulativeRetired: controller.totalRetired,
    realizedTravel: movement.realizedTravel, blockedAntTicks: movement.blockedAntTicks,
    ticksWithBlockedAnts: movement.ticksWithBlockedAnts,
    pheromone: { ...summarizeArray(pheromone.values), nodeSum: pheromone.nodeSum,
      reconstructedIntegral: pheromone.reconstructedIntegral },
    surfaceField: summarizeArray(controller.surfaceField.values),
    chemicalMemoryB: summarizeArray(controller.trailPlateBirth.chemicalMemory),
    agentOccupancy: { ...summarizeArray(occupancy), occupiedCells: occupancy.reduce((sum, n) => sum + Number(n > 0), 0) },
    productionPlateCount: controller.trailPlateBirth.getPlates().length,
    productionPlateBirthTimesMs: controller.trailPlateBirth.getPlates().map(plate => plate.bornAtSimulationTimeMs),
    productionMaterial: { revision: material.revision, noduleRevision: material.noduleRevision,
      layers: summarizeArray(materialLayers), topPlateIdentity: summarizeArray(material.stratigraphy.topLayerByCell),
      coverageCells: materialLayers.reduce((sum, n) => sum + Number(n > 0), 0),
      noduleCount: material.nodules?.length ?? null },
    researchOverlay: overlay ? { ...summarizeArray(overlay), coverageCells: overlay.reduce((sum, n) => sum + Number(n > 0), 0) }
      : { sha256: null, count: 0, coverageCells: 0, histogram: { 0: CELL_COUNT } },
    audioBridgePresent: Boolean(controller.audioBridge), maxPlateCeilingReached:
      controller.trailPlateBirth.getPlates().length >= controller.trailPlateBirth.maxBirths };
}

function checkWorldInvariants(controller, newlySpawnedIds, allowCapacityReached = false) {
  for (const agent of controller.agents) {
    for (const [name, value] of [['x', agent.x], ['y', agent.y], ['vx', agent.vx], ['vy', agent.vy], ['heading', agent.heading]]) {
      assert.ok(Number.isFinite(value), `finite ant ${agent.id} ${name}`);
    }
    assert.ok(agent.x >= 0 && agent.x <= 1 && agent.y >= 0 && agent.y <= 1, `ant ${agent.id} is in domain`);
  }
  for (const id of newlySpawnedIds) {
    const spawned = controller.agents.find(agent => agent.id === id);
    if (!spawned) continue;
    for (const other of controller.agents) if (other !== spawned) {
      assert.ok(Math.hypot(spawned.x - other.x, spawned.y - other.y) + 1e-10 >= spawned.radius + other.radius,
        `new spawn ${id} clears existing agents`);
    }
  }
  const productionCount = controller.trailPlateBirth.getPlates().length;
  assert.ok(productionCount < controller.trailPlateBirth.maxBirths
    || (productionCount === controller.trailPlateBirth.maxBirths && allowCapacityReached
      && actualPlateCapacityReached(controller.materialStratigraphy)),
  'production Plate count stays at or below its safety ceiling');
  return true;
}

function shaOverlayHistory(overlayHistory) {
  const byCell = new Map();
  for (const layer of overlayHistory) for (const cell of layer.xCells) {
    const rows = byCell.get(cell) ?? [];
    rows.push({ eventId: layer.eventId, timeMs: layer.timeMs, provenance: layer.provenance });
    byCell.set(cell, rows);
  }
  return [...byCell].sort((a, b) => a[0] - b[0]).map(([cell, layers]) => ({ cell, layers }));
}

function attachProductionObserver(controller, ctx, ops) {
  const birth = controller.trailPlateBirth;
  const build = birth.buildSupportedMask.bind(birth);
  birth.buildSupportedMask = (...args) => {
    const result = build(...args);
    ctx.built = { E: result.mask.slice(), D: result.supports.slice() };
    return result;
  };
  const advance = birth.advance.bind(birth);
  birth.advance = (options = {}) => {
    const priorTime = birth.lastAnalysisTimeMs;
    const shouldAnalyze = priorTime === null || options.simulationTimeMs - priorTime >= 1000 - 1e-9;
    ctx.built = null;
    const priorMaterial = shouldAnalyze ? controller.materialStratigraphy.getSnapshot().stratigraphy : null;
    const beforeLayers = shouldAnalyze ? priorMaterial.layerCountByCell.slice() : null;
    const beforeTop = shouldAnalyze ? priorMaterial.topLayerByCell.slice() : null;
    const result = advance(options);
    if (birth.lastAnalysisTimeMs !== priorTime) {
      assert.ok(ctx.built, 'native E/D builder ran at analysis boundary');
      const timeMs = birth.lastAnalysisTimeMs;
      ctx.pendingBoundary = { timeMs, E: ctx.built.E, D: ctx.built.D, F: ops.zhangSuen(ctx.built.E),
        B: birth.chemicalMemory.slice(), C: fieldSample(controller),
        materialBefore: { layers: beforeLayers, top: beforeTop },
        rngCallsBeforeObserver: ctx.rng.calls, rngStateBeforeObserver: ctx.rng.state() };
    }
    return result;
  };
}

function attachExposureInstrumentation(controller, ctx, overlay) {
  const provider = (agent, productionLayers, timeMs) => {
    const cell = gridIndex(agent.x, agent.y);
    const researchLayers = cell < 0 ? 0 : overlay[cell];
    const effectiveLayers = productionLayers + researchLayers;
    const row = { antId: agent.id, cell, timeMs, productionLayers, researchLayers, effectiveLayers,
      mProduction: materialLocomotionMultiplier(productionLayers), mEffective: materialLocomotionMultiplier(effectiveLayers),
      qAProduction: materialTurnRateMultiplier(productionLayers), qAEffective: materialTurnRateMultiplier(effectiveLayers),
      hDProduction: materialFollowingHeadwayMultiplier(productionLayers), hDEffective: materialFollowingHeadwayMultiplier(effectiveLayers),
      speedMultiplierChanged: materialLocomotionMultiplier(productionLayers) !== materialLocomotionMultiplier(effectiveLayers),
      speedEffectApplicable: controller.materialLocomotionResistance,
      aTurnRateChanged: materialTurnRateMultiplier(productionLayers) !== materialTurnRateMultiplier(effectiveLayers),
      dHeadwayChanged: materialFollowingHeadwayMultiplier(productionLayers) !== materialFollowingHeadwayMultiplier(effectiveLayers),
      dSameFlowOpportunity: false };
    ctx.currentExposure.set(agent.id, row);
    ctx.currentLayerReads.push([agent.id, productionLayers, researchLayers, effectiveLayers]);
    const key = `${productionLayers}/${researchLayers}/${effectiveLayers}`;
    ctx.currentLayerHistogram[key] = (ctx.currentLayerHistogram[key] ?? 0) + 1;
    return researchLayers;
  };
  controller.researchLayerCountProvider = provider;
  const occupancy = controller.occupancy, sense = occupancy.sense.bind(occupancy);
  occupancy.sense = (agent, agents, multiplier) => {
    const result = sense(agent, agents, multiplier), row = ctx.currentExposure.get(agent.id);
    if (row?.researchLayers > 0 && row.dHeadwayChanged && Number.isFinite(result.followingSpeedLimit)) {
      row.dSameFlowOpportunity = true;
      ctx.currentDHeadwayChanges++;
    }
    return result;
  };
}

function attachNativeExposureObserver(controller, ctx) {
  const occupancy = controller.occupancy, sense = occupancy.sense.bind(occupancy);
  occupancy.sense = (agent, agents, multiplier) => {
    const result = sense(agent, agents, multiplier), row = ctx.currentExposure.get(agent.id);
    if (row?.researchLayers > 0 && row.dHeadwayChanged && Number.isFinite(result.followingSpeedLimit)) {
      row.dSameFlowOpportunity = true;
      ctx.currentDHeadwayChanges++;
    }
    return result;
  };
}

function nativeExposureRow(controller, agent, snapshot, timeMs) {
  const cell = gridIndex(agent.x, agent.y);
  const totalLayers = materialLayerCountAtSnapshot(snapshot, agent.x, agent.y);
  const column = cell < 0 ? [] : controller.materialStratigraphy.columns[cell] || [];
  const researchLayers = column.filter(index => controller.materialStratigraphy.plates[index]?.provenance?.kind
    === 'research-local-singleton-X').length;
  const productionLayers = totalLayers - researchLayers;
  const effectiveLayers = totalLayers;
  return { antId: agent.id, cell, timeMs, productionLayers, researchLayers, effectiveLayers,
    mProduction: materialLocomotionMultiplier(productionLayers), mEffective: materialLocomotionMultiplier(effectiveLayers),
    qAProduction: materialTurnRateMultiplier(productionLayers), qAEffective: materialTurnRateMultiplier(effectiveLayers),
    hDProduction: materialFollowingHeadwayMultiplier(productionLayers), hDEffective: materialFollowingHeadwayMultiplier(effectiveLayers),
    speedMultiplierChanged: materialLocomotionMultiplier(productionLayers) !== materialLocomotionMultiplier(effectiveLayers),
    speedEffectApplicable: controller.materialLocomotionResistance,
    aTurnRateChanged: materialTurnRateMultiplier(productionLayers) !== materialTurnRateMultiplier(effectiveLayers),
    dHeadwayChanged: materialFollowingHeadwayMultiplier(productionLayers) !== materialFollowingHeadwayMultiplier(effectiveLayers),
    dSameFlowOpportunity: false };
}

function copyAnchor(arm, pending, formation, controller, birthsAtBoundary, rng, tick, overlay) {
  const candidate = controller.trailPlateBirth.candidate;
  return { index: arm.anchors.length, tick, timeMs: pending.timeMs,
    E: pack(pending.E), F: pack(pending.F), B: pack(pending.B), C: pack(pending.C), D: pack(pending.D),
    materialBefore: { layers: pack(pending.materialBefore.layers), top: pack(pending.materialBefore.top) },
    rngCalls: rng.calls, rngState: lcgStateAsUint32(rng),
    activeOpportunities: formation.activeOpportunities, newMaturations: formation.newMaturations,
    uniqueMatureXOptions: formation.uniqueMatureXOptions, singletonOptions: formation.singletonOptions,
    contestedOptions: formation.contestedOptions, overlapEdges: formation.overlapEdges,
    overlapComponents: formation.overlapComponents, contestedComponents: formation.contestedComponents,
    provenanceCounts: formation.provenanceCounts, entryCounts: formation.entryCounts,
    productionCandidateAvailable: formation.productionCandidateAvailable,
    productionPlateCount: formation.productionPlateCount, productionBirthIds: formation.productionBirthIds,
    researchOverlayCoverageCells: overlay ? overlay.reduce((sum, value) => sum + Number(value > 0), 0) : 0,
    researchOverlayLayerCellIncidences: overlay ? overlay.reduce((sum, value) => sum + value, 0) : 0,
    researchOverlayMaxLayerCount: overlay ? Math.max(0, ...overlay) : 0,
    opportunities: formation.opportunities, matureOptions: formation.matureOptions,
    productionCandidate: candidate ? { available: true, startedAtMs: candidate.startedAtMs,
      stableSeconds: candidate.stableSeconds, similarity: candidate.similarity,
      source: candidate.source, target: candidate.target,
      maskSha256: digest(bytes(candidate.mask)), supportedMaskSha256: digest(bytes(candidate.supportedMask)) }
      : { available: false },
    productionPlateBirths: birthsAtBoundary.map(row => ({ id: row.id, timeMs: row.timeMs })), formation };
}

function finishExposure(ctx) {
  const windows = Array.from({ length: 5 }, (_, index) => ({ startSeconds: index * 60,
    endSeconds: (index + 1) * 60, antTicks: 0, exposedAntTicks: 0, uniqueAntIds: new Set(),
    layerTupleHistogram: {}, speedEffectApplicable: 0, aTurnRateCallsChanged: 0, dSameFlowHeadwayTargetsChanged: 0 }));
  for (const tick of ctx.exposureTicks) {
    const window = windows[Math.min(4, Math.floor(tick.timeMs / 60_000))];
    window.antTicks += tick.livingAnts; window.exposedAntTicks += tick.exposedAntTicks;
    window.speedEffectApplicable += tick.speedEffectApplicable;
    window.aTurnRateCallsChanged += tick.aTurnRateCallsChanged;
    window.dSameFlowHeadwayTargetsChanged += tick.dSameFlowHeadwayTargetsChanged;
    for (const [key, value] of Object.entries(tick.layerTupleHistogram)) window.layerTupleHistogram[key] = (window.layerTupleHistogram[key] ?? 0) + value;
  }
  for (const row of ctx.exposedAntTicks) windows[Math.min(4, Math.floor(row.timeMs / 60_000))].uniqueAntIds.add(row.antId);
  const toHistogram = rows => {
    const histogram = {};
    for (const value of rows) histogram[value] = (histogram[value] ?? 0) + 1;
    return Object.fromEntries(Object.entries(histogram).sort((a, b) => Number(a[0]) - Number(b[0])));
  };
  const quantiles = values => {
    const sorted = values.slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    return Object.fromEntries([['min', 0], ['median', .5], ['q90', .9], ['max', 1]].map(([name, q]) =>
      [name, sorted[Math.round((sorted.length - 1) * q)]]));
  };
  for (const window of windows) window.uniqueAntIds = window.uniqueAntIds.size;
  return { tickCount: ctx.exposureTicks.length, perTickLayerReadings: ctx.exposureTicks,
    exposedAntTicks: ctx.exposedAntTicks,
    summary: { antTicks: ctx.exposureTicks.reduce((sum, row) => sum + row.livingAnts, 0),
      exposedAntTicks: ctx.exposedAntTicks.length, uniqueAntsExposed: ctx.uniqueAntIds.size,
      LresearchHistogram: toHistogram(ctx.exposedAntTicks.map(row => row.researchLayers)),
      LeffectiveHistogram: toHistogram(ctx.exposedAntTicks.map(row => row.effectiveLayers)),
      LproductionHistogram: toHistogram(ctx.exposedAntTicks.map(row => row.productionLayers)),
      Lresearch: quantiles(ctx.exposedAntTicks.map(row => row.researchLayers)),
      Leffective: quantiles(ctx.exposedAntTicks.map(row => row.effectiveLayers)),
      arithmeticCounterfactuals: Object.fromEntries(['m', 'qA', 'hD'].map(prefix => [prefix, {
        production: quantiles(ctx.exposedAntTicks.map(row => row[prefix + 'Production'])),
        effective: quantiles(ctx.exposedAntTicks.map(row => row[prefix + 'Effective']))
      }])),
      directConsumerOpportunities: { speedEffectApplicable: ctx.exposedAntTicks.filter(row => row.speedEffectApplicable).length,
        aTurnRateCeilingCallChanged: ctx.exposedAntTicks.filter(row => row.aTurnRateChanged).length,
        dSameFlowHeadwayTargetChanged: ctx.currentDTotal,
        } },
    windows };
}

function materialDiagnostics(controller) {
  const strata = controller.materialStratigraphy, snapshot = strata.getSnapshot();
  const counts = snapshot.stratigraphy.layerCountByCell, top = snapshot.stratigraphy.topLayerByCell;
  const hist = {}, provenance = { research: { maskIncidences: 0, topCells: 0, buriedIncidences: 0 },
    production: { maskIncidences: 0, topCells: 0, buriedIncidences: 0 } };
  for (const count of counts) hist[count] = (hist[count] ?? 0) + 1;
  const isResearch = plate => plate?.provenance?.kind === 'research-local-singleton-X'
    || plate?.id?.startsWith('research-local-');
  for (let cell = 0; cell < strata.cellCount; cell++) {
    const column = strata.columns[cell] || [];
    for (let i = 0; i < column.length; i++) {
      const group = isResearch(strata.plates[column[i]]) ? provenance.research : provenance.production;
      group.maskIncidences++;
      if (i < column.length - 1) group.buriedIncidences++;
    }
    if (top[cell] >= 0) (isResearch(strata.plates[top[cell]]) ? provenance.research : provenance.production).topCells++;
  }
  const sorted = Array.from(counts).sort((a, b) => a - b), quantile = p => sorted.length
    ? sorted[Math.round((sorted.length - 1) * p)] : 0;
  return { plateCount: strata.plates.length,
    productionPlateCount: strata.plates.filter(plate => !isResearch(plate)).length,
    researchPlateCount: strata.plates.filter(isResearch).length,
    coverageCells: counts.reduce((sum, value) => sum + Number(value > 0), 0),
    layerCounts: pack(counts), topPlateIdentity: pack(top), depthMeters: pack(snapshot.stratigraphy.totalDepthByCellMeters),
    layerDistribution: Object.fromEntries(Object.entries(hist).sort((a, b) => Number(a[0]) - Number(b[0]))),
    provenance, layerQuantiles: { q50: quantile(.5), q90: quantile(.9), max: sorted.at(-1) ?? 0 },
    plates: strata.plates.map(plate => ({ ...plate, mask: pack(Uint8Array.from(plate.mask)) })),
    plateHistory: snapshot.stratigraphy.plateHistory,
    nodules: strata.getNodules(), diagnostics: snapshot.diagnostics };
}

function actualMaterialCountsAtBoundary(controller) {
  const plates = controller.materialStratigraphy.plates;
  const researchPlateCount = plates.filter(plate => plate.provenance?.kind === 'research-local-singleton-X').length;
  const counts = controller.materialStratigraphy.layerCountByCell;
  return { plateCount: plates.length, researchPlateCount, productionPlateCount: plates.length - researchPlateCount,
    coverageCells: counts.reduce((sum, count) => sum + Number(count > 0), 0),
    layerCellIncidences: counts.reduce((sum, count) => sum + count, 0) };
}

function instrumentMaterialBirths(controller, ctx) {
  const strata = controller.materialStratigraphy, add = strata.addPlate.bind(strata);
  strata.addPlate = descriptor => {
    const research = descriptor?.provenance?.kind === 'research-local-singleton-X'
      || descriptor?.id?.startsWith('research-local-');
    const cells = indices(descriptor.mask), before = cells.map(cell => strata.columns[cell] || []);
    const coveredCellsBefore = before.filter(column => column.length > 0).length;
    const foundationCells = cells.filter((cell, index) => before[index].length >= NODULE_RULE.minimumOverlappingPlates);
    const foundationQualificationSamples = foundationCells.slice(0, 128).map(cell => {
      const x = (cell % GRID) / (GRID - 1), y = Math.floor(cell / GRID) / (GRID - 1);
      const compaction = controller.surfaceField.sample(x, y);
      const localFootLoad = strata._localFootLoad(x, y, NODULE_RULE.radiusRange[1]);
      const layerCount = (strata.columns[cell] || []).length;
      return { cell, layerCount, compaction, localFootLoad, qualified: layerCount >= NODULE_RULE.minimumOverlappingPlates
        && compaction >= NODULE_RULE.minimumCompaction && localFootLoad >= NODULE_RULE.minimumLocalFootLoad };
    });
    const beforeCount = strata.plates.length;
    const result = add.call(strata, descriptor);
    if (result && strata.plates.length > beforeCount) {
      const receipt = birthReceiptFromInserted(controller, descriptor, research, ctx.plateChronology.length);
      receipt.coveredCellsBefore = coveredCellsBefore;
      receipt.foundationCellCount = foundationCells.length;
      receipt.foundationQualificationSamples = foundationQualificationSamples;
      ctx.plateChronology.push(receipt);
      if (research) ctx.localBirthLedger.push(receipt);
    }
    return result;
  };
}

function birthReceiptFromInserted(controller, descriptor, research, sequence) {
  const strata = controller.materialStratigraphy, cells = indices(descriptor.mask), priorIDs = new Set();
  let covered = 0, previousTopCellsBuried = 0, exposed = 0;
  const index = strata.plateIndexById.get(descriptor.id);
  for (const cell of cells) {
    const column = strata.columns[cell] || [];
    const prior = column.filter(plateIndex => plateIndex !== index);
    if (prior.length) covered++;
    if (prior.length) previousTopCellsBuried++;
    if (column.at(-1) === index) exposed++;
    for (const plateIndex of prior) priorIDs.add(strata.plates[plateIndex].id);
  }
  const diagnostics = materialDiagnostics(controller);
  const maskCellColumnsAfter = cells.map(cell => {
    const column = strata.columns[cell] || [], topIndex = column.at(-1);
    return { cell, plateIDsBottomToTop: column.map(plateIndex => strata.plates[plateIndex].id),
      layerCount: column.length, depthMeters: strata.totalDepthByCellMeters[cell],
      topPlateId: topIndex === undefined ? null : strata.plates[topIndex].id,
      topProvenance: topIndex === undefined ? null : strata.plates[topIndex].provenance?.kind ?? 'production' };
  });
  return { sequence, phase: research ? 'research-post-observer' : 'production-native', id: descriptor.id,
    research, timeMs: descriptor.bornAtSimulationTimeMs, provenance: descriptor.provenance ?? null,
    disposition: research ? 'singleton-control-observation' : 'production-native-birth',
    channels: descriptor.provenance?.channels ?? [], eventIds: descriptor.provenance?.eventIds ?? [],
    maskSha256: digest(Buffer.from(Uint8Array.from(descriptor.mask))),
    descriptorSha256: digest(JSON.stringify({ ...descriptor, mask: undefined })), maskIndices: cells, maskCells: cells.length,
    priorOverlapIDs: [...priorIDs].sort(), priorOverlapPlateCount: priorIDs.size,
    coveredCellsBefore: covered, exposedCellsAfter: exposed, previousTopCellsBuried,
    layerIncidencesAdded: cells.length, maskCellColumnsAfter, coverageCellsAfter: diagnostics.coverageCells };
}

function summarizeBirths(controller, records) {
  return records.map(row => ({ ...row, maskIndices: row.maskIndices }));
}

async function runArm(armName, { ops, controlTickHashes = null } = {}) {
  const isTreatment = armName === 'treatment', isReal = armName === 'real-stratigraphy';
  const rng = countedLcg(SEED), overlay = isTreatment ? createSingletonLayerOverlay() : null;
  const observer = new SingletonFeedbackObserver(SEED);
  const ctx = { rng, built: null, pendingBoundary: null, anchors: [], events: [], decisions: [], births: [],
    checkpoints: [], tickHashes: [], tickMetrics: [], overlayHistory: [], overlayExposureAtBirth: [],
    totalTravel: 0, blockedAntTicks: 0, ticksWithBlockedAnts: 0, spawnedOverlapChecks: 0,
    observerRngCalls: 0, preOverlayParityTicks: 0, firstOverlayTimeMs: null, preFirstLocalLegacyParityTicks: 0,
    currentExposure: new Map(), currentLayerReads: [], currentLayerHistogram: {}, currentDHeadwayChanges: 0,
    currentDTotal: 0, exposureTicks: [], exposedAntTicks: [], uniqueAntIds: new Set(), overlayLayerCellIncidences: 0,
    nativeTickReads: [], environmentMovementHashes: [], materialSnapshots: [], plateChronology: [],
    localBirthLedger: [], localInsertions: [], noduleLineage: [], capacityReached: null, nextResearchSerial: 1 };
  const controller = new AntController({ random: rng.random,
    ...(isTreatment ? { researchLayerCountProvider: () => 0 } : {}) });
  if (isTreatment) attachExposureInstrumentation(controller, ctx, overlay);
  if (isReal) attachNativeExposureObserver(controller, ctx);
  attachProductionObserver(controller, ctx, ops);
  instrumentMaterialBirths(controller, ctx);
  controller.subscribe(({ type, payload }) => {
    if (type === 'plate-birth') ctx.births.push({ id: payload.id,
      timeMs: payload.bornAtSimulationTimeMs, maskIndices: indices(payload.mask) });
    if (type === 'sphere-birth') ctx.noduleLineage.push({ id: payload.id,
      timeMs: payload.bornAtSimulationTimeMs, foundationPlateId: payload.coupledPlateId,
      sourcePlateIDs: payload.sourcePlateIDs,
      researchSourcePlateIDs: payload.sourcePlateIDs.filter(id => id.startsWith('research-local-')),
      sourcePlateProvenance: payload.sourcePlateIDs.map(id => { const plate = controller.materialStratigraphy.plateById.get(id);
        return { id, kind: plate?.provenance?.kind ?? 'production' }; }),
      burial: payload.burial, support: payload.support });
  });
  await controller.init();
  const initialRngCalls = rng.calls;
  assert.ok(initialRngCalls > 0, 'controller initialization consumed expected production RNG');
  try {
    for (let tick = 1; tick <= TICKS; tick++) {
      if (isReal && ctx.capacityReached) break;
      const preAgents = controller.agents.map(agent => ({ agent, from: { x: agent.x, y: agent.y }, wasBlocked: agent.wasBlocked }));
      const beforeSpawned = controller.totalSpawned;
      const timeAtEntry = controller.simulationTimeMs;
      const overlayAtEntry = ctx.overlayLayerCellIncidences;
      const tickEntryMaterial = isReal ? controller.materialStratigraphy.getSnapshot() : null;
      if (isReal) {
        ctx.currentExposure = new Map(); ctx.currentLayerReads = []; ctx.currentLayerHistogram = {}; ctx.currentDHeadwayChanges = 0;
        for (const { agent } of preAgents) {
          const row = nativeExposureRow(controller, agent, tickEntryMaterial, timeAtEntry);
          ctx.currentExposure.set(agent.id, row);
          ctx.currentLayerReads.push([agent.id, row.productionLayers, row.researchLayers, row.effectiveLayers]);
          const key = `${row.productionLayers}/${row.researchLayers}/${row.effectiveLayers}`;
          ctx.currentLayerHistogram[key] = (ctx.currentLayerHistogram[key] ?? 0) + 1;
        }
        ctx.nativeTickReads.push({ tick, timeMs: timeAtEntry, readings: [...ctx.currentExposure.values()].map(row => ({ ...row })) });
      }
      if (armName === 'treatment') {
        ctx.currentExposure = new Map(); ctx.currentLayerReads = []; ctx.currentLayerHistogram = {}; ctx.currentDHeadwayChanges = 0;
      }
      controller.tick(DT);
      const stateHash = fingerprint(controller, rng);
      ctx.tickHashes.push(stateHash);
      ctx.environmentMovementHashes.push(environmentMovementFingerprint(controller, rng));
      if (isReal && ctx.localBirthLedger.length === 0) {
        assert.equal(stateHash, controlTickHashes?.[tick - 1], `pre-first-local-material legacy fingerprint parity at tick ${tick}`);
        ctx.preFirstLocalLegacyParityTicks++;
      }
      if (isReal && actualPlateCapacityReached(controller.materialStratigraphy)) ctx.capacityReached = {
        capacity: 256, timeMs: controller.simulationTimeMs, tick,
        phase: 'native-production-tick' };
      if (isTreatment && overlayAtEntry === 0) {
        assert.equal(stateHash, controlTickHashes?.[tick - 1], `pre-first-overlay paired world parity at tick ${tick}`);
        ctx.preOverlayParityTicks++;
      }
      const currentIds = new Set(controller.agents.map(agent => agent.id));
      const newIds = controller.agents.filter(agent => !preAgents.some(row => row.agent.id === agent.id)).map(agent => agent.id);
      checkWorldInvariants(controller, newIds, isReal);
      ctx.spawnedOverlapChecks += newIds.length;
      for (const row of preAgents) {
        let to;
        if (currentIds.has(row.agent.id)) to = { x: row.agent.x, y: row.agent.y };
        else to = { x: clamp01(row.agent.x), y: clamp01(row.agent.y) };
        ctx.totalTravel += Math.hypot(to.x - row.from.x, to.y - row.from.y);
        if (row.agent.wasBlocked) ctx.blockedAntTicks++;
      }
      const blockedThisTick = preAgents.some(row => row.agent.wasBlocked);
      if (blockedThisTick) ctx.ticksWithBlockedAnts++;
      ctx.tickMetrics.push({ tick, timeAtEntryMs: timeAtEntry, livingAtEntry: preAgents.length,
        livingAtEnd: controller.agents.length, spawned: controller.totalSpawned, retired: controller.totalRetired,
        blockedAnts: preAgents.filter(row => row.agent.wasBlocked).length,
        realizedTravelCumulative: ctx.totalTravel });

      if (isTreatment) {
        assert.equal(ctx.currentLayerReads.length, preAgents.length, 'one ID-bearing L tuple per living ant at tick entry');
        const exposed = [...ctx.currentExposure.values()].filter(row => row.researchLayers > 0);
        for (const row of exposed) ctx.uniqueAntIds.add(row.antId);
        const speedApplicable = exposed.filter(row => row.speedEffectApplicable).length;
        ctx.currentDTotal += ctx.currentDHeadwayChanges;
        for (const row of exposed) ctx.exposedAntTicks.push({ ...row });
        ctx.exposureTicks.push({ tick, timeMs: timeAtEntry, livingAnts: preAgents.length,
          layerReadings: ctx.currentLayerReads,
          layerTupleHistogram: ctx.currentLayerHistogram,
          exposedAntTicks: exposed.length, speedEffectApplicable: speedApplicable,
          speedMultiplierCallsChanged: exposed.filter(row => row.speedMultiplierChanged).length,
          aTurnRateCallsChanged: exposed.filter(row => row.aTurnRateChanged).length,
          dSameFlowHeadwayTargetsChanged: ctx.currentDHeadwayChanges });
      }
      if (isReal) {
        assert.equal(ctx.currentLayerReads.length, preAgents.length, 'one ID-bearing native L tuple per living ant at tick entry');
        const exposed = [...ctx.currentExposure.values()].filter(row => row.researchLayers > 0);
        for (const row of exposed) ctx.uniqueAntIds.add(row.antId);
        const speedApplicable = exposed.filter(row => row.speedEffectApplicable).length;
        ctx.currentDTotal += ctx.currentDHeadwayChanges;
        for (const row of exposed) ctx.exposedAntTicks.push({ ...row });
        ctx.exposureTicks.push({ tick, timeMs: timeAtEntry, livingAnts: preAgents.length,
          layerReadings: ctx.currentLayerReads, layerTupleHistogram: ctx.currentLayerHistogram,
          exposedAntTicks: exposed.length, speedEffectApplicable: speedApplicable,
          speedMultiplierCallsChanged: exposed.filter(row => row.speedMultiplierChanged).length,
          aTurnRateCallsChanged: exposed.filter(row => row.aTurnRateChanged).length,
          dSameFlowHeadwayTargetsChanged: ctx.currentDHeadwayChanges });
      }

      if (ctx.pendingBoundary) {
        const pending = ctx.pendingBoundary; ctx.pendingBoundary = null;
        const birthsAtBoundary = ctx.births.filter(row => row.timeMs === pending.timeMs);
        const snapshotBeforeObserver = fingerprint(controller, rng), callsBeforeObserver = rng.calls;
        const productionMaterialBeforeObserver = controller.materialStratigraphy.getSnapshot();
        const materialBeforeObserverHash = digest(bytes(productionMaterialBeforeObserver.stratigraphy.layerCountByCell));
        const topBeforeObserverHash = digest(bytes(productionMaterialBeforeObserver.stratigraphy.topLayerByCell));
        const materialRevisionBeforeObserver = productionMaterialBeforeObserver.revision;
        const noduleRevisionBeforeObserver = productionMaterialBeforeObserver.noduleRevision;
        const formation = (() => {
          const prior = Math.random;
          Math.random = () => { throw new Error('B/C research observer attempted Math.random'); };
          try { return observer.observe({ anchorIndex: ctx.anchors.length, timeMs: pending.timeMs,
            E: pending.E, F: pending.F, B: pending.B, C: pending.C,
            overlay: isTreatment ? overlay : null, materialize: isTreatment }); }
          finally { Math.random = prior; }
        })();
        assert.equal(rng.calls, callsBeforeObserver, 'B/C observer consumes zero controller RNG');
        ctx.observerRngCalls += rng.calls - callsBeforeObserver;
        assert.equal(fingerprint(controller, rng), snapshotBeforeObserver, 'observer changes no production controller state');
        if (formation.decisions.some(row => row.disposition === 'singleton-overlay-layer') && ctx.firstOverlayTimeMs === null) {
          ctx.firstOverlayTimeMs = pending.timeMs;
        }
        for (const decision of formation.decisions) if (decision.disposition === 'singleton-overlay-layer') {
          const eventId = decision.eventIds.length === 1 ? decision.eventIds[0] : decision.eventIds.join('+');
          ctx.overlayHistory.push({ eventId, timeMs: decision.timeMs,
            provenance: decision.provenance, xCells: decision.xCells.slice() });
          ctx.overlayExposureAtBirth.push({ eventId, timeMs: decision.timeMs, xSha256: decision.xSha256,
            cells: decision.xCells.length, provenance: decision.provenance });
          ctx.overlayLayerCellIncidences += decision.xCells.length;
        }
        const materialAfterObserver = controller.materialStratigraphy.getSnapshot();
        assert.equal(digest(bytes(materialAfterObserver.stratigraphy.layerCountByCell)), materialBeforeObserverHash,
          'observer cannot alter production MaterialStratigraphy layer counts');
        assert.equal(digest(bytes(materialAfterObserver.stratigraphy.topLayerByCell)), topBeforeObserverHash,
          'observer cannot alter production MaterialStratigraphy top identities');
        assert.equal(materialAfterObserver.revision, materialRevisionBeforeObserver,
          'observer cannot alter production material revision');
        assert.equal(materialAfterObserver.noduleRevision, noduleRevisionBeforeObserver,
          'observer cannot alter production nodule revision');
        if (isReal && !ctx.capacityReached) {
          const eligible = formation.decisions.filter(row => row.disposition === 'singleton-control-observation');
          const acceptedCells = new Set();
          for (const decision of eligible) {
            assert.equal(decision.timeMs, pending.timeMs, 'singleton local insertions share current completed analysis time');
            for (const cell of decision.xCells) {
              assert.equal(acceptedCells.has(cell), false, `coeval singleton masks are disjoint at cell ${cell}`);
              acceptedCells.add(cell);
            }
          }
          for (const decision of eligible) {
            const strata = controller.materialStratigraphy;
            if (actualPlateCapacityReached(strata)) {
              ctx.capacityReached ??= { capacity: 256, timeMs: controller.simulationTimeMs,
                tick: Math.round(controller.simulationTimeMs / 1000 * 60), phase: 'before-research-insertion' };
              break;
            }
            const descriptorMathRandom = Math.random;
            let descriptor;
            try { Math.random = () => { throw new Error('local descriptor construction attempted Math.random'); };
              descriptor = createResearchLocalPlate(decision, ctx.nextResearchSerial++); }
            finally { Math.random = descriptorMathRandom; }
            assert.equal(decision.timeMs, controller.simulationTimeMs, 'local decision uses current native analysis clock');
            assert.equal(descriptor.bornAtSimulationTimeMs, controller.simulationTimeMs,
              'local descriptor birth time equals current native simulation clock');
            const cells = indices(descriptor.mask), beforeLayers = strata.layerCountByCell.slice();
            const beforeTop = strata.topLayerByCell.slice(), beforeDepth = strata.totalDepthByCellMeters.slice();
            const beforeEnvironment = environmentMovementFingerprint(controller, rng);
            const beforeCandidateSince = cells.map(cell => strata.candidateSinceMs[cell]);
            const candidateSinceAtEntry = strata.candidateSinceMs.slice();
            const footLoadBefore = digest(bytes(strata.footLoadByCell));
            const qualificationReadings = () => cells.map(cell => {
              const column = strata.columns[cell] || [], x = (cell % GRID) / (GRID - 1), y = Math.floor(cell / GRID) / (GRID - 1);
              const compaction = controller.surfaceField.sample(x, y);
              const localFootLoad = strata._localFootLoad(x, y, NODULE_RULE.radiusRange[1]);
              return { cell, layerCount: column.length, compaction, localFootLoad,
                candidateSinceMs: strata.candidateSinceMs[cell], predicate: column.length >= NODULE_RULE.minimumOverlappingPlates
                  && column.length - 1 >= NODULE_RULE.minimumBuriedLayers
                  && compaction >= NODULE_RULE.minimumCompaction && localFootLoad >= NODULE_RULE.minimumLocalFootLoad,
                engineActive: strata.maxNodules > 0 && strata.nodules.length < strata.maxNodules };
            });
            const qualificationBefore = qualificationReadings();
            const noduleEngineBefore = { lastAdvanceTimeMs: strata.lastAdvanceTimeMs,
              lastNoduleEvaluationTimeMs: strata.lastNoduleEvaluationTimeMs,
              qualifiedNoduleCandidateCount: strata.qualifiedNoduleCandidateCount,
              nodules: strata.nodules.length, noduleIDs: strata.nodules.map(row => row.id), noduleRevision: strata.noduleRevision,
              maxNodulesReached: strata.nodules.length >= strata.maxNodules };
            const materialRevisionBefore = strata.revision;
            const engineState = () => ({ lastBirthTimeMs: controller.trailPlateBirth.lastBirthTimeMs,
              plateCount: controller.trailPlateBirth.getPlates().length,
              maxBirths: controller.trailPlateBirth.maxBirths,
              limitReached: controller.trailPlateBirth.getPlates().length >= controller.trailPlateBirth.maxBirths,
              candidate: controller.trailPlateBirth.candidate ? digest(JSON.stringify({
                ...controller.trailPlateBirth.candidate,
                mask: digest(bytes(controller.trailPlateBirth.candidate.mask)),
                supportedMask: digest(bytes(controller.trailPlateBirth.candidate.supportedMask)) })) : null });
            const beforeEngine = engineState();
            const calls = rng.calls, priorRandom = Math.random;
            let inserted;
            try { Math.random = () => { throw new Error('local descriptor/material insertion attempted Math.random'); };
              inserted = strata.addPlate(descriptor); }
            finally { Math.random = priorRandom; }
            assert.ok(inserted, `research local Plate ${descriptor.id} accepted`);
            assert.equal(rng.calls, calls, 'local Plate insertion consumes zero controller RNG');
            assert.equal(environmentMovementFingerprint(controller, rng), beforeEnvironment,
              'local Plate insertion leaves world/movement fingerprint unchanged');
            for (let cell = 0; cell < strata.cellCount; cell++) assert.equal(
              strata.layerCountByCell[cell] - beforeLayers[cell], descriptor.mask[cell],
              `native layer count changes only by local mask at cell ${cell}`);
            for (let cell = 0; cell < strata.cellCount; cell++) {
              if (descriptor.mask[cell]) assert.equal(strata.candidateSinceMs[cell], -1,
                `native local insertion resets covered nodule timer at ${cell}`);
              else assert.equal(strata.candidateSinceMs[cell], candidateSinceAtEntry[cell],
                `local insertion leaves uncovered nodule timer at ${cell}`);
            }
            assert.equal(digest(bytes(strata.footLoadByCell)), footLoadBefore, 'local insertion leaves native foot load unchanged');
            assert.equal(strata.lastAdvanceTimeMs, noduleEngineBefore.lastAdvanceTimeMs, 'local insertion does not advance native nodule clock');
            assert.equal(strata.lastNoduleEvaluationTimeMs, noduleEngineBefore.lastNoduleEvaluationTimeMs,
              'local insertion does not run native nodule evaluation');
            assert.equal(strata.qualifiedNoduleCandidateCount, noduleEngineBefore.qualifiedNoduleCandidateCount,
              'local insertion leaves last native qualification count unchanged');
            assert.deepEqual(strata.nodules.map(row => row.id), noduleEngineBefore.noduleIDs,
              'local insertion does not create a nodule');
            assert.equal(strata.noduleRevision, noduleEngineBefore.noduleRevision, 'local insertion leaves nodule revision unchanged');
            assert.equal(strata.revision, materialRevisionBefore + 1, 'native insertion adds exactly one material revision');
            for (let cell = 0; cell < strata.cellCount; cell++) if (descriptor.mask[cell]) {
              const topIndex = strata.columns[cell]?.at(-1);
              assert.equal(strata.plates[topIndex]?.id, descriptor.id, `new Plate sits on top through native insertion at ${cell}`);
              assert.equal(strata.totalDepthByCellMeters[cell], nativeColumnDepthMeters(strata, strata.columns[cell]),
                `native Float32 depth excludes bottom Plate and matches column at ${cell}`);
            } else {
              assert.equal(strata.topLayerByCell[cell], beforeTop[cell], `top identity stays unchanged outside local mask at ${cell}`);
              assert.equal(strata.totalDepthByCellMeters[cell], beforeDepth[cell], `depth stays unchanged outside local mask at ${cell}`);
            }
            const qualificationAfter = qualificationReadings();
            const noduleEngineAfter = { lastAdvanceTimeMs: strata.lastAdvanceTimeMs,
              lastNoduleEvaluationTimeMs: strata.lastNoduleEvaluationTimeMs,
              qualifiedNoduleCandidateCount: strata.qualifiedNoduleCandidateCount,
              nodules: strata.nodules.length, noduleIDs: strata.nodules.map(row => row.id), noduleRevision: strata.noduleRevision,
              maxNodulesReached: strata.nodules.length >= strata.maxNodules };
            const afterEngine = engineState();
            ctx.localInsertions.push({ decisionTimeMs: decision.timeMs, descriptorBirthTimeMs: descriptor.bornAtSimulationTimeMs,
              actualInsertionTimeMs: controller.simulationTimeMs,
              tick: Math.round(controller.simulationTimeMs / 1000 * 60), descriptorId: descriptor.id,
              eventIds: decision.eventIds, provenance: descriptor.provenance, xCells: decision.xCells,
              maskSha256: digest(Buffer.from(Uint8Array.from(descriptor.mask))),
              beforeLayers: cells.map(cell => [cell, beforeLayers[cell]]),
              afterLayers: cells.map(cell => [cell, strata.layerCountByCell[cell]]),
              qualificationBefore, qualificationAfter, noduleEngineBefore, noduleEngineAfter,
              candidateSinceBefore: beforeCandidateSince,
              candidateSinceAfter: cells.map(cell => strata.candidateSinceMs[cell]),
              activeEngineBefore: beforeEngine, activeEngineAfter: afterEngine,
              completedTickEnvironmentMovementFingerprint: beforeEnvironment });
            if (actualPlateCapacityReached(strata)) ctx.capacityReached ??= { capacity: 256,
              timeMs: controller.simulationTimeMs, tick: Math.round(controller.simulationTimeMs / 1000 * 60),
              phase: 'after-research-insertion' };
          }
        }
        const tickIndex = Math.round(pending.timeMs / (1000 / 60));
        const anchor = copyAnchor({ anchors: ctx.anchors }, pending, {
          ...formation,
          productionCandidateAvailable: Boolean(controller.trailPlateBirth.candidate),
          productionPlateCount: controller.trailPlateBirth.getPlates().length,
          productionBirthIds: birthsAtBoundary.map(row => row.id)
        }, controller, birthsAtBoundary, rng, tickIndex, overlay);
        if (isReal) anchor.actualMaterial = actualMaterialCountsAtBoundary(controller);
        ctx.anchors.push(anchor); ctx.events.push(...formation.events); ctx.decisions.push(...formation.decisions);
        ctx.lastBoundaryRng = { tick: tickIndex, calls: rng.calls, state: rng.state() };
      }
      if (tick % 3600 === 0 || (isReal && ctx.capacityReached)) {
        const row = checkpoint(controller, overlay, { realizedTravel: ctx.totalTravel,
          blockedAntTicks: ctx.blockedAntTicks, ticksWithBlockedAnts: ctx.ticksWithBlockedAnts });
        row.requestedSeconds = tick / 60;
        if (isReal) { row.tick = tick;
          if (ctx.capacityReached) row.checkpointType = 'capacity-stop';
          row.actualMaterial = materialDiagnostics(controller); ctx.materialSnapshots.push({
          timeMs: controller.simulationTimeMs, tick, material: row.actualMaterial }); }
        ctx.checkpoints.push(row);
      }
      if (tick % 3600 === 0 || (isReal && ctx.capacityReached)) console.log(JSON.stringify({ arm: armName, seed: SEED,
        seconds: controller.simulationTimeMs / 1000, anchors: ctx.anchors.length, events: ctx.events.length,
        overlayCells: overlay?.reduce((sum, n) => sum + Number(n > 0), 0) ?? 0,
        actualPlates: isReal ? controller.materialStratigraphy.plates.length : null }));
    }
    if (!isReal || !ctx.capacityReached) assert.equal(ctx.anchors.length, 300, '300 exact one-second native analysis boundaries');
    assert.equal(ctx.observerRngCalls, 0, 'observer RNG use remains zero');
    if (!ctx.capacityReached) assert.equal(ctx.tickHashes.length, TICKS, 'state fingerprint recorded per tick');
    if (isTreatment) assert.equal(ctx.preOverlayParityTicks,
      ctx.firstOverlayTimeMs === null ? TICKS : Math.round(ctx.firstOverlayTimeMs / (1000 / 60)),
      'paired world parity holds through the first accepted overlay boundary');
    const exposure = isTreatment || isReal ? finishExposure(ctx) : null;
    const firstLocalInsertion = ctx.localInsertions[0] ?? null;
    const firstLocalBirthNextTickExposure = firstLocalInsertion ? {
      descriptorId: firstLocalInsertion.descriptorId, insertionTimeMs: firstLocalInsertion.actualInsertionTimeMs,
      completedTickFingerprint: firstLocalInsertion.completedTickEnvironmentMovementFingerprint,
      nextTick: ctx.nativeTickReads.find(row => row.tick === firstLocalInsertion.tick + 1) ?? null } : null;
    const run = { schema: isReal ? 'ant-singleton-real-stratigraphy-probe-v1' : 'ant-singleton-feedback-sensitivity-v1',
      arm: armName, seed: SEED,
      productionAuthority: AUTHORITY, experimentBranch: BRANCH, hz: 60,
      seconds: isReal ? controller.simulationTimeMs / 1000 : SECONDS,
      audio: 'Off (no AudioBridge constructed)', dt: DT,
      timeConvention: 'Native TrailPlateBirth one-second boundary timestamp; first analysis is at 16.666... ms, then actual saved timestamps; feedback update runs after the completed tick and is first visible at the next tick.',
      observer: { grouping: 'positive exact-equal 8-neighbor maxima grouped strongest-first within same F component at .15',
        track: 'reciprocal-nearest g15 rows, .025 world distance, lower row-major tie, shared-F-component continuity guard',
        capture: '8-neighbor component of F inside Euclidean disk R=.15',
        maturation: '20,000 elapsed model ms; uninterrupted track and adjacent X Jaccard >=.60',
        singleton: 'new mature X has zero positive cell intersections with every other current mature unique-X option; exact X sets collapse; no retries',
        materialization: isReal
          ? 'C records singleton-control-observation, then appends a research-local descriptor through native MaterialStratigraphy.addPlate after the completed tick; no overlay or layer-count provider'
          : 'one integer overlay increment per X cell for each eligible newly matured unique-X group; control only observes' },
      anchors: ctx.anchors, events: ctx.events, decisions: ctx.decisions,
      births: summarizeBirths(controller, ctx.births), checkpoints: ctx.checkpoints,
      tickMetrics: ctx.tickMetrics, tickStateHashes: ctx.tickHashes,
      overlayHistory: ctx.overlayHistory, overlayPerCellHistory: shaOverlayHistory(ctx.overlayHistory),
      overlay: overlay ? pack(overlay) : null,
      exposure: exposure ? { summary: exposure.summary, windows: exposure.windows } : null,
      validation: { observerRngCalls: ctx.observerRngCalls, preFirstOverlayParityTicks: ctx.preOverlayParityTicks,
        firstOverlayTimeMs: ctx.firstOverlayTimeMs, spawnClearanceChecks: ctx.spawnedOverlapChecks,
        finiteAndInDomainCheckedEveryTick: true, maximumPlateHalt: ctx.checkpoints.some(row => row.maxPlateCeilingReached),
        audioBridgePresent: Boolean(controller.audioBridge), ...(isReal ? { researchLayerCountProviderPresent:
          controller.researchLayerCountProvider !== null, overlayAllocated: overlay !== null,
          overlayLayerCellIncidences: ctx.overlayLayerCellIncidences, capacityReached: ctx.capacityReached,
          combinedMaterialPlateCount: controller.materialStratigraphy.plates.length,
          localPlateCount: ctx.localBirthLedger.length, nativeTickReads: ctx.nativeTickReads.length,
          preFirstLocalLegacyParityTicks: ctx.preFirstLocalLegacyParityTicks,
          firstLocalInsertionTimeMs: ctx.localInsertions[0]?.actualInsertionTimeMs ?? null,
          legacyFingerprintScope: 'Existing cross-arm fingerprint omits mutable MaterialStratigraphy candidateSinceMs and native nodule evaluation history.',
          localInsertionRngCalls: 0, finalEnvironmentMovementFingerprint: ctx.environmentMovementHashes.at(-1) } : {}) } };
    if (isReal) {
      run.actualMaterial = materialDiagnostics(controller);
      run.localBirthLedger = ctx.localBirthLedger;
      run.plateChronology = ctx.plateChronology;
      run.noduleLineage = ctx.noduleLineage;
      run.localInsertions = ctx.localInsertions;
      run.firstLocalBirthNextTickExposure = firstLocalBirthNextTickExposure;
      run.finalState = { tickStateHash: ctx.tickHashes.at(-1), environmentMovementFingerprint:
        ctx.environmentMovementHashes.at(-1), material: run.actualMaterial };
    }
    const out = resolve(EVIDENCE, 'analysis');
    await mkdir(out, { recursive: true });
    await writeRun(resolve(out, `${armName}.signals.json.gz`), run, 10);
    if (isTreatment) await writeJson(resolve(out, 'treatment-exposure.json.gz'), exposure);
    if (isReal) await writeJson(resolve(out, 'real-exposure.json.gz'), exposure);
    await writeJson(resolve(out, `${armName}-diagnostics.json.gz`), { seed: SEED, arm: armName,
      environmentMovementHashes: ctx.environmentMovementHashes, nativeTickReads: ctx.nativeTickReads,
      materialSnapshots: ctx.materialSnapshots, localInsertions: ctx.localInsertions,
      firstLocalBirthNextTickExposure,
      plateChronology: ctx.plateChronology, localBirthLedger: ctx.localBirthLedger,
      noduleLineage: ctx.noduleLineage, capacityReached: ctx.capacityReached });
    return run;
  } finally {
    await controller.destroy();
  }
}

function compareControlToFrozen(control, frozen) {
  assert.equal(String(frozen.seed), SEED); assert.equal(frozen.hz, 60);
  assert.equal(frozen.anchors.length >= control.anchors.length, true);
  const fields = ['E', 'F', 'B', 'C', 'D'];
  for (let i = 0; i < control.anchors.length; i++) {
    const actual = control.anchors[i], expected = frozen.anchors[i];
    assert.equal(actual.timeMs, expected.timeMs, `control actual model time anchor ${i}`);
    assert.equal(actual.tick, expected.tick, `control tick anchor ${i}`);
    for (const field of fields) assert.deepEqual(actual[field], expected[field], `control ${field} anchor ${i}`);
    assert.deepEqual(actual.materialBefore.layers, expected.material.layers, `control layer map anchor ${i}`);
    assert.deepEqual(actual.materialBefore.top, expected.material.top, `control top map anchor ${i}`);
    assert.deepEqual(actual.productionBirthIds, expected.birthIds, `control Plate IDs anchor ${i}`);
    const refCheck = frozen.validation.parity.boundaryChecks[i];
    assert.equal(actual.rngCalls, refCheck.observedRngCalls, `control RNG calls anchor ${i}`);
    assert.equal(actual.rngState, refCheck.observedRngState, `control RNG state anchor ${i}`);
  }
  const frozenBirths = frozen.births.filter(row => row.timeMs <= 300_000);
  assert.equal(control.births.length, frozenBirths.length, 'control production Plate birth count through 300 s');
  for (let i = 0; i < control.births.length; i++) {
    assert.equal(control.births[i].id, frozenBirths[i].id);
    assert.equal(control.births[i].timeMs, frozenBirths[i].timeMs);
    assert.deepEqual(control.births[i].maskIndices, frozenBirths[i].maskIndices);
  }
  return { exactAnchorCount: control.anchors.length, fieldsExactAtAllAnchors: fields,
    layerAndTopMapsExact: true, productionPlateIdsTimesMasksExact: control.births.length,
    boundaryRngChecksExact: control.anchors.length, firstTimeMs: control.anchors[0].timeMs,
    lastTimeMs: control.anchors.at(-1).timeMs };
}

async function compareControlObserverToFrozen(control) {
  const metadataBytes = await readFile(FROZEN_OPPORTUNITIES), meta = await readJson(FROZEN_OPPORTUNITIES);
  assert.equal(meta.seed, SEED);
  const trackMap = { B: new Map(), C: new Map() }, reverseMap = { B: new Map(), C: new Map() };
  let checkedRows = 0, checkedCells = 0, checkedAnchors = 0;
  for (const file of meta.anchorsFiles) {
    const chunkPath = resolve(dirname(FROZEN_OPPORTUNITIES), file), data = await readFile(chunkPath);
    assert.equal(sha256(data), meta.chunkHashes[file], `frozen opportunity chunk ${file} hash`);
    const chunk = await readJson(chunkPath);
    for (const expected of chunk.anchors) {
      if (expected.index >= control.anchors.length) break;
      const actual = control.anchors[expected.index], time = actual.timeMs;
      assert.equal(time, expected.timeMs, `B/C observer reference time ${expected.index}`);
      for (const channel of ['B', 'C']) {
        const actualRows = actual.formation.opportunities[channel], expectedRows = expected.channels[channel]?.g15 ?? [];
        assert.equal(actualRows.length, expectedRows.length, `${channel} g15 row count at anchor ${expected.index}`);
        const captures = new Map(expected.captures.map(row => [row.id, row]));
        const F = unpack(actual.F);
        for (let rowIndex = 0; rowIndex < expectedRows.length; rowIndex++) {
          const a = actualRows[rowIndex], e = expectedRows[rowIndex];
          assert.equal(a.index, e.index); assert.equal(a.value, e.value); assert.equal(a.rank, e.rank);
          assert.equal(a.component, e.component); assert.equal(a.entryDistance, e.entryDistance);
          const xCells = xCapture(F, e.index, .15).cells;
          assert.deepEqual(xCells, captures.get(e.captureId).cells, `locked X membership at ${expected.index}/${channel}/${rowIndex}`);
          const eTrack = e.trackIds['0.025'], prior = trackMap[channel].get(a.trackId);
          assert.ok(prior === undefined || prior === eTrack, `live ${channel} track mapping stays one-to-one`);
          const reverse = reverseMap[channel].get(eTrack);
          assert.ok(reverse === undefined || reverse === a.trackId, `frozen ${channel} track mapping stays one-to-one`);
          trackMap[channel].set(a.trackId, eTrack); reverseMap[channel].set(eTrack, a.trackId);
          checkedRows++; checkedCells += xCells.length;
        }
      }
      checkedAnchors++;
    }
    if (checkedAnchors >= control.anchors.length) break;
  }
  assert.equal(checkedAnchors, control.anchors.length, 'all 300 control B/C observer anchors checked');

  const eventsPacket = await readJson(FROZEN_EVENTS);
  assert.equal(eventsPacket.seed, SEED);
  const expectedEvents = eventsPacket.events.filter(event => event.timeMs <= control.anchors.at(-1).timeMs);
  assert.equal(control.events.length, expectedEvents.length, 'control maturation event count matches frozen dual-history stream');
  const eventKey = (channel, trackId, intervalNumber) => `${channel}:${trackId}:I${String(intervalNumber).padStart(3, '0')}`;
  const expectedByKey = new Map(expectedEvents.map(event => [eventKey(event.channel, event.trackId, event.intervalNumber), event]));
  assert.equal(expectedByKey.size, expectedEvents.length, 'frozen maturation event identities are unique');
  const matchedEventKeys = new Set();
  for (const a of control.events) {
    const frozenTrackId = trackMap[a.channel].get(a.trackId);
    const key = eventKey(a.channel, frozenTrackId, a.intervalNumber), e = expectedByKey.get(key);
    assert.ok(e, `live maturity maps to a frozen event ${key}`);
    assert.equal(matchedEventKeys.has(key), false, `live maturity is unique ${key}`);
    matchedEventKeys.add(key);
    assert.equal(a.channel, e.channel); assert.equal(a.timeMs, e.timeMs);
    assert.equal(a.anchorIndex, e.anchorIndex); assert.equal(a.intervalNumber, e.intervalNumber);
    assert.equal(a.stabilityStartAnchor, e.stabilityStartAnchor);
    assert.equal(a.stabilityStartTimeMs, e.stabilityStartTimeMs);
    assert.equal(a.stableElapsedMs, e.stableElapsedMs);
    assert.equal(a.centerIndex, e.centerIndex); assert.deepEqual(a.xCells, e.xCells);
    assert.equal(frozenTrackId, e.trackId, 'maturation source track maps to frozen ID');
  }
  assert.equal(matchedEventKeys.size, expectedEvents.length, 'all frozen maturation event identities matched');
  return { frozenMetadataSha256: sha256(metadataBytes), exactAnchorCount: checkedAnchors,
    opportunityRows: checkedRows, recapturedXCellCount: checkedCells,
    channelTrackIds: Object.fromEntries(['B', 'C'].map(channel => [channel, trackMap[channel].size])),
    exactFirstMaturationEvents: expectedEvents.length, maturationEventMembershipExact: true };
}

function pairedWindows(control, treatment) {
  const rows = [];
  for (let window = 0; window < 5; window++) {
    const start = window * 60_000, end = start + 60_000;
    const summarize = run => {
      const anchors = run.anchors.filter(row => row.timeMs >= start && row.timeMs < end);
      const dist = key => anchors.map(row => row[key]);
      const events = run.events.filter(row => row.timeMs >= start && row.timeMs < end);
      const decisions = run.decisions.filter(row => row.timeMs >= start && row.timeMs < end);
      return { anchorCount: anchors.length,
        activeB: anchors.map(row => row.activeOpportunities.B), activeC: anchors.map(row => row.activeOpportunities.C),
        newB: anchors.map(row => row.newMaturations.B), newC: anchors.map(row => row.newMaturations.C),
        uniqueMatureX: dist('uniqueMatureXOptions'), singletonOptions: dist('singletonOptions'),
        contestedOptions: dist('contestedOptions'), overlapEdges: dist('overlapEdges'),
        overlapComponents: dist('overlapComponents'), contestedComponents: dist('contestedComponents'),
        provenanceCounts: anchors.map(row => row.provenanceCounts), entryCounts: anchors.map(row => row.entryCounts),
        newMaturationEvents: events.length,
        singletonOverlayEpisodes: decisions.filter(row => row.disposition === 'singleton-overlay-layer').length,
        overlayLayerCellIncidences: decisions.filter(row => row.disposition === 'singleton-overlay-layer')
          .reduce((sum, row) => sum + row.xCells.length, 0),
        contestedMatureEpisodes: decisions.filter(row => row.disposition === 'contested-no-commit').length,
        productionBirths: run.births.filter(row => row.timeMs >= start && row.timeMs < end).map(row => row.timeMs),
        productionCandidateAvailable: anchors.filter(row => row.productionCandidateAvailable).length,
        productionPlateCount: anchors.at(-1)?.productionPlateCount ?? null };
    };
    rows.push({ startSeconds: window * 60, endSeconds: window * 60 + 60,
      control: summarize(control), treatment: summarize(treatment) });
  }
  return rows;
}

async function writeSvgPlots(control, treatment, exposure) {
  const dir = resolve(EVIDENCE, 'visual'); await mkdir(dir, { recursive: true });
  const series = [
    ['mature-options.svg', 'Mature unique-X options', [
      { name: 'Control', values: control.anchors.map(row => row.uniqueMatureXOptions), color: '#1f4e79' },
      { name: 'Treatment', values: treatment.anchors.map(row => row.uniqueMatureXOptions), color: '#b45309' }]],
    ['singleton-contested.svg', 'Singleton and contested mature options', [
      { name: 'Control singleton', values: control.anchors.map(row => row.singletonOptions), color: '#3b82f6' },
      { name: 'Control contested', values: control.anchors.map(row => row.contestedOptions), color: '#93c5fd' },
      { name: 'Treatment singleton', values: treatment.anchors.map(row => row.singletonOptions), color: '#dc2626' },
      { name: 'Treatment contested', values: treatment.anchors.map(row => row.contestedOptions), color: '#fca5a5' }]],
    ['research-overlay-coverage.svg', 'Research overlay coverage cells', [
      { name: 'Control', values: control.anchors.map(row => row.researchOverlayCoverageCells), color: '#1f4e79' },
      { name: 'Treatment', values: treatment.anchors.map(row => row.researchOverlayCoverageCells), color: '#b45309' }]],
    ['research-overlay-layer-cell-incidences.svg', 'Research overlay layer-cell incidences', [
      { name: 'Control', values: control.anchors.map(row => row.researchOverlayLayerCellIncidences), color: '#1f4e79' },
      { name: 'Treatment', values: treatment.anchors.map(row => row.researchOverlayLayerCellIncidences), color: '#b45309' }]],
    ['research-overlay-max-layer-count.svg', 'Maximum research overlay layer count', [
      { name: 'Control', values: control.anchors.map(row => row.researchOverlayMaxLayerCount), color: '#1f4e79' },
      { name: 'Treatment', values: treatment.anchors.map(row => row.researchOverlayMaxLayerCount), color: '#b45309' }]],
    ['direct-ant-exposure.svg', 'Exposed ant-ticks by fixed 60 s window', [
      { name: 'Exposed ant-ticks', values: exposure.windows.map(row => row.exposedAntTicks), color: '#7c3aed' }]],
    ['production-plate-births.svg', 'Production Plate births (unchanged selector)', [
      { name: 'Control', values: control.checkpoints.map(row => row.productionPlateCount), color: '#1f4e79' },
      { name: 'Treatment', values: treatment.checkpoints.map(row => row.productionPlateCount), color: '#b45309' }]]
  ];
  for (const [file, title, rows] of series) {
    const width = 840, height = 300, left = 52, top = 42, plotW = 748, plotH = 190;
    const values = rows.flatMap(row => row.values), max = Math.max(1, ...values), count = Math.max(1, ...rows.map(row => row.values.length));
    const line = row => row.values.map((value, index) => {
      const x = left + (count <= 1 ? 0 : index * plotW / (count - 1));
      const y = top + plotH - value / max * plotH;
      return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const legend = rows.map((row, index) => `<g transform="translate(${left + index * 180},264)"><line x1="0" y1="0" x2="22" y2="0" stroke="${row.color}" stroke-width="3"/><text x="28" y="4" font-size="12">${row.name}</text></g>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="${left}" y="24" font-family="Arial" font-size="16" font-weight="700">${title}</text><path d="M${left},${top}V${top + plotH}H${left + plotW}" fill="none" stroke="#777"/><text x="8" y="${top + 6}" font-family="Arial" font-size="11">${max}</text><text x="8" y="${top + plotH}" font-family="Arial" font-size="11">0</text>${rows.map(row => `<path d="${line(row)}" fill="none" stroke="${row.color}" stroke-width="2"/>`).join('')}${legend}<text x="${left}" y="250" font-family="Arial" font-size="11">0 s</text><text x="${left + plotW - 34}" y="250" font-family="Arial" font-size="11">300 s</text></svg>`;
    await writeFile(resolve(dir, file), svg);
  }
}

async function main() {
  const out = resolve(EVIDENCE, 'analysis'); await mkdir(out, { recursive: true });
  const recordInvalid = (gate, error, extra = {}) => writeJson(resolve(out, 'conformance.json.gz'), {
    schema: 'ant-singleton-real-stratigraphy-conformance-v1', status: 'INVALID', seed: SEED,
    branch: BRANCH, gate, error: error.message, researchArmStarted: false, ...extra });
  let authority, frozen, frozenAuthorityConformance;
  try {
    authority = await verifyAuthority();
    frozen = await readRun(FROZEN_SIGNALS);
    frozenAuthorityConformance = assertFrozenAuthorityMetadata(frozen, await authoritySourceHashes());
  } catch (error) {
    await recordInvalid('frozen-authority-and-source-hashes', error);
    throw error;
  }
  const sourceText = await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
  const ops = productionOps(sourceText);
  let priorControl;
  try { priorControl = await readRun(resolve(PRIOR_EVIDENCE, 'control.signals.json.gz')); }
  catch (error) { await recordInvalid('saved-control-load', error, { frozenAuthorityConformance }); throw error; }
  let control = await runArm('control', { ops });
  control = await readRun(resolve(out, 'control.signals.json.gz'));
  let baselineConformance, observerConformance, controlReplication, gate = 'control-frozen-signal-conformance';
  try {
    baselineConformance = compareControlToFrozen(control, frozen);
    gate = 'control-frozen-observer-conformance';
    observerConformance = await compareControlObserverToFrozen(control);
    control.validation = { ...control.validation, baselineConformance, observerConformance };
    await writeRun(resolve(out, 'control.signals.json.gz'), control, 10);
    control = await readRun(resolve(out, 'control.signals.json.gz'));
    gate = 'control-saved-run-replication';
    controlReplication = assertArmReplicatesPrior(control, priorControl);
  } catch (error) {
    await recordInvalid(gate, error, { frozenAuthorityConformance,
      baselineConformance: baselineConformance ?? null, observerConformance: observerConformance ?? null });
    throw error;
  }
  await writeJson(resolve(out, 'conformance.json.gz'), { schema: 'ant-singleton-real-stratigraphy-conformance-v1',
    status: 'CONTROL-PASS', seed: SEED, branch: BRANCH, productionAuthority: AUTHORITY,
    frozenAuthorityConformance, baselineConformance, observerConformance,
    replication: { control: controlReplication }, researchArmStarted: false });
  let priorTreatment, priorExposure;
  try {
    priorTreatment = await readRun(resolve(PRIOR_EVIDENCE, 'treatment.signals.json.gz'));
    priorExposure = await readJson(resolve(PRIOR_EVIDENCE, 'treatment-exposure.json.gz'));
  } catch (error) { await recordInvalid('saved-overlay-load', error, { frozenAuthorityConformance,
    baselineConformance, observerConformance, replication: { control: controlReplication } }); throw error; }
  let treatment = await runArm('treatment', { ops, controlTickHashes: control.tickStateHashes });
  treatment = await readRun(resolve(out, 'treatment.signals.json.gz'));
  const exposure = await readJson(resolve(out, 'treatment-exposure.json.gz'));
  let treatmentReplication;
  try { treatmentReplication = assertArmReplicatesPrior(treatment, priorTreatment, exposure, priorExposure); }
  catch (error) { await recordInvalid('overlay-saved-run-and-exposure-replication', error, {
    frozenAuthorityConformance, baselineConformance, observerConformance,
    replication: { control: controlReplication } }); throw error; }
  const conformance = { schema: 'ant-singleton-real-stratigraphy-conformance-v1', status: 'PASS',
    seed: SEED, branch: BRANCH, productionAuthority: AUTHORITY, frozenAuthorityConformance,
    baselineConformance, observerConformance,
    replication: { control: controlReplication, treatment: treatmentReplication }, researchArmStarted: false };
  await writeJson(resolve(out, 'conformance.json.gz'), conformance);
  const real = await runArm('real-stratigraphy', { ops, controlTickHashes: control.tickStateHashes });
  conformance.researchArmStarted = true;
  conformance.realArmAnchors = real.anchors.length;
  conformance.realArmCapacityReached = real.validation.capacityReached;
  await writeJson(resolve(out, 'conformance.json.gz'), conformance);
  const arms = { control, treatment, real };
  const pairedFormationWindows = Array.from({ length: 5 }, (_, window) => {
    const start = window * 60_000, end = start + 60_000;
    return { startSeconds: window * 60, endSeconds: window * 60 + 60,
      arms: Object.fromEntries(Object.entries(arms).map(([name, run]) => {
        const anchors = run.anchors.filter(row => row.timeMs >= start && row.timeMs < end);
        const decisions = run.decisions.filter(row => row.timeMs >= start && row.timeMs < end);
        return [name, { anchors: anchors.length, events: run.events.filter(row => row.timeMs >= start && row.timeMs < end).length,
          singletonDecisions: decisions.filter(row => row.disposition !== 'contested-no-commit').length,
          contestedDecisions: decisions.filter(row => row.disposition === 'contested-no-commit').length,
          localPlateBirths: run.localBirthLedger?.filter(row => row.timeMs >= start && row.timeMs < end).length ?? 0,
          productionBirths: run.births.filter(row => row.timeMs >= start && row.timeMs < end).map(row => [row.id, row.timeMs]),
          productionPlateCountAtLastAnchor: anchors.at(-1)?.productionPlateCount ?? null,
          actualMaterialPlateCountAtLastAnchor: anchors.at(-1)?.actualMaterial?.plateCount ?? null }];
      })) };
  });
  const diagnostics = await Promise.all(['control', 'treatment', 'real-stratigraphy'].map(arm =>
    readJson(resolve(out, `${arm}-diagnostics.json.gz`))));
  const worldWindows = pairedFormationWindows.map(window => {
    const startTick = window.startSeconds * 60, endTick = window.endSeconds * 60;
    const byArm = Object.fromEntries(diagnostics.map(row => [row.arm, row.environmentMovementHashes.slice(startTick, endTick)]));
    const compare = (a, b) => { const length = Math.min(a.length, b.length);
      return { comparedTicks: length, identicalTicks: a.slice(0, length).reduce((sum, hash, i) => sum + Number(hash === b[i]), 0) }; };
    return { startSeconds: window.startSeconds, endSeconds: window.endSeconds, controlVsOverlay: compare(byArm.control, byArm.treatment),
      controlVsReal: compare(byArm.control, byArm['real-stratigraphy']), overlayVsReal: compare(byArm.treatment, byArm['real-stratigraphy']) };
  });
  const summary = { schema: 'ant-singleton-real-stratigraphy-three-arm-summary-v1', seed: SEED,
    durationSeconds: real.seconds, hz: 60, productionAuthority: AUTHORITY, branch: BRANCH,
    conformance, arms: Object.fromEntries(Object.entries(arms).map(([name, run]) => [name, {
      anchors: run.anchors.length, events: run.events.length, decisions: run.decisions.length,
      productionBirths: run.births.map(row => ({ id: row.id, timeMs: row.timeMs })),
      localBirths: run.localBirthLedger?.length ?? 0,
      checkpoints: run.checkpoints, finalState: run.finalState ?? { tickStateHash: run.tickStateHashes.at(-1) } } ])),
    treatmentExposure: exposure.summary, realExposure: real.exposure.summary, actualMaterial: real.actualMaterial,
    localBirthLedger: real.localBirthLedger, plateChronology: real.plateChronology,
    noduleLineage: real.noduleLineage, firstLocalBirthNextTickExposure: real.firstLocalBirthNextTickExposure,
    materialSnapshots: real.checkpoints.map(row => ({
      timeMs: row.timeMs, requestedSeconds: row.requestedSeconds, material: row.actualMaterial })),
    pairedFormationWindows, worldMovementWindows: worldWindows,
    productionBirthComparison: { control: control.births, overlay: treatment.births, realMaterial: real.births },
    invariants: { audioOff: true, observerAndDescriptorMathRandomCalls: 0,
      realResearchLayerCountProviderAbsent: real.validation.researchLayerCountProviderPresent === false,
      realOverlayAllocated: real.validation.overlayAllocated, nativeMaterialInsertion: true,
      nativeMaterialAdvanceNotSuppressed: true, actualCapacityStop: real.validation.capacityReached,
      productionAuthorityUnchanged: true } };
  await writeJson(resolve(out, 'three-arm-summary.json.gz'), summary);
  await writeJson(resolve(out, 'authority.json'), authority);
  console.log(JSON.stringify({ complete: true, branch: BRANCH, conformance: conformance.status,
    controlAnchors: control.anchors.length, overlayAnchors: treatment.anchors.length,
    realAnchors: real.anchors.length, localBirths: real.localBirthLedger.length,
    actualPlates: real.actualMaterial.plateCount, capacityReached: real.validation.capacityReached }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
