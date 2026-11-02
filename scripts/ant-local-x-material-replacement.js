import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntController, materialLayerCountAtSnapshot, materialLocomotionMultiplier,
  materialTurnRateMultiplier, materialFollowingHeadwayMultiplier } from '../src/lib/agents/ant/AntController.js';
import { productionOps } from './ant-local-opportunity-capture.js';
import { xCapture } from './ant-local-opportunity-core.js';
import { readJson, readRun, sha256, unpack, writeJson, writeRun } from './ant-local-opportunity-io.js';
import { SingletonFeedbackObserver } from './ant-singleton-feedback-observer.js';
import { createResearchLocalPlate } from './ant-singleton-real-plate.js';
import { MATERIAL_STRATIGRAPHY_MAX_NODULES, MATERIAL_STRATIGRAPHY_MAX_PLATES }
  from '../src/lib/agents/ant/MaterialStratigraphy.js';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const AUTHORITY = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const BASE = '7c96c128bd32bea33f69d8a1c1d08cf85d4421f8';
const BRANCH = 'codex/ant-local-x-replacement-20261101';
const SEEDS = ['20261005', '20261006', '20261007'];
const SECONDS = 300, DT = 1 / 60, TICKS = SECONDS * 60, GRID = 96, CELLS = GRID ** 2;
const ENTRY = { x: 0.5, y: 0.72 }, ENTRY_RADIUS = 0.15, BOUNDARY_BAND = 0.05;
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-material-replacement');
const PRIOR = resolve(ROOT, 'docs/ant/evidence/2026-11-01-singleton-real-stratigraphy-probe');
const FROZEN_ROOT = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis');
const FROZEN_EVENTS_ROOT = resolve(ROOT, 'docs/ant/evidence/2026-10-31-bc-dual-material-shadow/analysis');
const PRIOR_AUTHORITY = resolve(PRIOR, 'analysis/authority.json');
const SOURCE_PATHS = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js'
];
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength);
const pack = value => ({ type: value.constructor.name, length: value.length,
  data: bytes(value).toString('base64') });
const indices = values => { const out = []; for (let i = 0; i < values.length; i++) if (values[i]) out.push(i); return out; };
const gridIndex = (x, y) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1
  ? -1 : Math.round(x * (GRID - 1)) + Math.round(y * (GRID - 1)) * GRID;
const clamp01 = value => Math.min(1, Math.max(0, value));

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export async function verifyAuthorityReceipts(expectedBranch = BRANCH) {
  assert.equal(git('branch', '--show-current'), expectedBranch, 'research branch');
  assert.equal(git('merge-base', '--is-ancestor', BASE, 'HEAD'), '', 'requested base is an ancestor');
  git('cat-file', '-e', AUTHORITY + '^{commit}');
  const changedProductionFiles = git('diff', '--name-only', BASE, '--', 'src', 'static').split(/\r?\n/).filter(Boolean);
  assert.deepEqual(changedProductionFiles, [], 'this pass changes no production source');
  const prior = await readJson(PRIOR_AUTHORITY);
  assert.equal(prior.productionAuthority, AUTHORITY, 'prior receipt binds requested production authority');
  assert.equal(git('diff', '--unified=0', AUTHORITY, '--', 'src', 'static'), prior.sourceDiff,
    'inherited production research hook matches its recorded authority diff');
  const authoritySourceHashes = {};
  const sourceHashes = {};
  for (const path of SOURCE_PATHS) {
    const current = await readFile(resolve(ROOT, path));
    sourceHashes[path] = sha256(current);
    assert.equal(sourceHashes[path], prior.workingSourceHashes[path], 'source matches prior validated checkout: ' + path);
    const normalizedCurrentHash = sha256(Buffer.from(current.toString('utf8').replace(/\r\n?/g, '\n')));
    const authoritySource = execFileSync('git', ['show', AUTHORITY + ':' + path],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    authoritySourceHashes[path] = sha256(Buffer.from(authoritySource.replace(/\r\n?/g, '\n')));
    if (path !== 'src/lib/agents/ant/AntController.js')
      assert.equal(authoritySourceHashes[path], normalizedCurrentHash, 'source matches requested production authority: ' + path);
  }
  assert.deepEqual(Object.keys(prior.workingSourceHashes).sort(), SOURCE_PATHS.slice().sort(),
    'prior validated source path set');
  assert.deepEqual(prior.productionSourcePaths, SOURCE_PATHS, 'prior production source path set');
  assert.equal(prior.sourceDiff.includes('researchLayerCountProvider = null'), true,
    'the only inherited source delta is the recorded default-off diagnostic hook');
  return { requestedAuthority: AUTHORITY, authorityCommitObjectPresent: true,
    priorValidatedExecutionHead: prior.currentHead, priorValidatedSourceHashes: prior.workingSourceHashes,
    authoritySourceHashes, currentSourceHashes: sourceHashes, currentSourcesMatchPriorReceipt: true,
    inheritedSourceDiffMatchesPriorReceipt: true,
    currentProductionDiffFromRequestedBase: changedProductionFiles, researchLayerCountProviderDefault: null };
}

function countedLcg(seed) {
  let state = Number(seed) >>> 0, calls = 0;
  return { random() { calls++; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; },
    get calls() { return calls; }, state() { return state; } };
}

function worldFingerprint(controller, rng) {
  const candidate = controller.trailPlateBirth.candidate;
  const state = { time: controller.simulationTimeMs, nextSpawn: controller.nextSpawnTimeMs,
    spawned: controller.totalSpawned, retired: controller.totalRetired, rngCalls: rng.calls, rngState: rng.state(),
    agents: controller.agents.map(agent => ({ ...agent,
      gait: controller.gaitController.getSnapshot(agent), bodyPose: controller.bodyPoseController.getSnapshot(agent) })),
    candidate: candidate ? { startedAtMs: candidate.startedAtMs, stableSeconds: candidate.stableSeconds,
      similarity: candidate.similarity, source: candidate.source, target: candidate.target, path: candidate.path,
      skeletonIndices: candidate.skeletonIndices, mask: hash(bytes(candidate.mask)),
      supportedMask: hash(bytes(candidate.supportedMask)) } : null,
    plates: controller.trailPlateBirth.getPlates().map(row => [row.id, row.bornAtSimulationTimeMs]),
    activation: controller.colonyActivation.getSnapshot() };
  const material = controller.materialStratigraphy.getSnapshot();
  state.fields = [controller.field.values, controller.surfaceField.values,
    controller.trailPlateBirth.chemicalMemory, controller.trailPlateBirth.footContactCounts,
    material.stratigraphy.layerCountByCell, material.stratigraphy.topLayerByCell,
    material.stratigraphy.totalDepthByCellMeters].map(value => hash(bytes(value)));
  state.materialRevision = [material.revision, material.noduleRevision];
  state.nodules = controller.materialStratigraphy.getNodules().map(row => [row.id, row.bornAtSimulationTimeMs]);
  return hash(JSON.stringify(state));
}

function movementFingerprint(controller, rng) {
  const candidate = controller.trailPlateBirth.candidate;
  return hash(JSON.stringify({ time: controller.simulationTimeMs, nextSpawn: controller.nextSpawnTimeMs,
    spawned: controller.totalSpawned, retired: controller.totalRetired, rngCalls: rng.calls, rngState: rng.state(),
    agents: controller.agents.map(agent => ({ ...agent,
      gait: controller.gaitController.getSnapshot(agent), bodyPose: controller.bodyPoseController.getSnapshot(agent) })),
    candidate: candidate ? { startedAtMs: candidate.startedAtMs, stableSeconds: candidate.stableSeconds,
      similarity: candidate.similarity, source: candidate.source, target: candidate.target,
      path: candidate.path, mask: hash(bytes(candidate.mask)), supportedMask: hash(bytes(candidate.supportedMask)) } : null,
    plates: controller.trailPlateBirth.getPlates().map(row => [row.id, row.bornAtSimulationTimeMs]),
    activation: controller.colonyActivation.getSnapshot(),
    fields: [controller.field.values, controller.surfaceField.values,
      controller.trailPlateBirth.chemicalMemory, controller.trailPlateBirth.footContactCounts]
      .map(value => hash(bytes(value))) }));
}

function fieldSample(controller) {
  const values = new Float32Array(CELLS);
  assert.equal(controller.surfaceField.width, GRID);
  assert.equal(controller.surfaceField.height, GRID);
  for (let i = 0; i < CELLS; i++) values[i] = controller.surfaceField.sample(
    (i % GRID) / (GRID - 1), Math.floor(i / GRID) / (GRID - 1));
  return values;
}

function summarizeArray(values) {
  let min = Infinity, max = -Infinity, sum = 0, nonzero = 0;
  for (const value of values) {
    assert.ok(Number.isFinite(value), 'finite field/material state');
    min = Math.min(min, value); max = Math.max(max, value); sum += value; nonzero += Number(value > 0);
  }
  return { count: values.length, min: values.length ? min : null, max: values.length ? max : null,
    mean: values.length ? sum / values.length : null, sum, nonzero };
}

function checkWorldInvariants(controller, spawnedIds) {
  for (const agent of controller.agents) {
    for (const [name, value] of [['x', agent.x], ['y', agent.y], ['vx', agent.vx], ['vy', agent.vy], ['heading', agent.heading]]) {
      assert.ok(Number.isFinite(value), 'finite ant ' + agent.id + ' ' + name);
    }
    assert.ok(agent.x >= 0 && agent.x <= 1 && agent.y >= 0 && agent.y <= 1, 'ant remains in world');
  }
  for (const id of spawnedIds) {
    const spawned = controller.agents.find(agent => agent.id === id);
    if (!spawned) continue;
    for (const other of controller.agents) if (other !== spawned) assert.ok(
      Math.hypot(spawned.x - other.x, spawned.y - other.y) + 1e-10 >= spawned.radius + other.radius,
      'spawn clearance is preserved');
  }
  assert.ok(controller.materialStratigraphy.plates.length <= MATERIAL_STRATIGRAPHY_MAX_PLATES,
    'native stratigraphy capacity stays 256');
  assert.ok(controller.trailPlateBirth.getPlates().length <= controller.trailPlateBirth.maxBirths,
    'native selector capacity stays unchanged');
}

function assertFiniteFields(controller) {
  for (const [name, values] of [['pheromone', controller.field.values],
    ['SurfaceField', controller.surfaceField.values], ['B chemical memory', controller.trailPlateBirth.chemicalMemory],
    ['foot contact history', controller.trailPlateBirth.footContactCounts]]) {
    for (let i = 0; i < values.length; i++) assert.ok(Number.isFinite(values[i]), name + '[' + i + ']');
  }
  const strata = controller.materialStratigraphy;
  for (let i = 0; i < strata.cellCount; i++) {
    assert.ok(Number.isInteger(strata.layerCountByCell[i]) && strata.layerCountByCell[i] >= 0, 'valid layer count');
    assert.ok(Number.isFinite(strata.totalDepthByCellMeters[i]) && strata.totalDepthByCellMeters[i] >= 0,
      'finite nonnegative material depth');
  }
}

function attachProductionObserver(controller, ctx, ops) {
  const birth = controller.trailPlateBirth, build = birth.buildSupportedMask.bind(birth);
  birth.buildSupportedMask = (...args) => {
    const result = build(...args);
    ctx.built = { E: result.mask.slice(), D: result.supports.slice() };
    return result;
  };
  const advance = birth.advance.bind(birth);
  birth.advance = (options = {}) => {
    const prior = birth.lastAnalysisTimeMs;
    const analyze = prior === null || options.simulationTimeMs - prior >= 1000 - 1e-9;
    ctx.built = null;
    const material = analyze ? controller.materialStratigraphy.getSnapshot().stratigraphy : null;
    const beforeLayers = analyze ? material.layerCountByCell.slice() : null;
    const beforeTop = analyze ? material.topLayerByCell.slice() : null;
    const result = advance(options);
    if (birth.lastAnalysisTimeMs !== prior) {
      assert.ok(ctx.built, 'native E/D masks were built');
      assert.equal(ctx.pendingBoundary, null, 'one pending boundary at a time');
      ctx.pendingBoundary = { timeMs: birth.lastAnalysisTimeMs, E: ctx.built.E,
        D: ctx.built.D, F: ops.zhangSuen(ctx.built.E), B: birth.chemicalMemory.slice(),
        C: fieldSample(controller), materialBefore: { layers: beforeLayers, top: beforeTop } };
    }
    return result;
  };
}

function descriptorCells(descriptor) { return indices(descriptor.mask); }

function descriptorSpatial(descriptor) {
  const cells = descriptorCells(descriptor);
  assert.ok(cells.length > 0, 'material mask has cells');
  let sx = 0, sy = 0, nearestEntry = Infinity, nearestBoundary = Infinity, literalBoundary = false;
  for (const cell of cells) {
    const x = (cell % GRID) / (GRID - 1), y = Math.floor(cell / GRID) / (GRID - 1);
    sx += x; sy += y;
    nearestEntry = Math.min(nearestEntry, Math.hypot(x - ENTRY.x, y - ENTRY.y));
    nearestBoundary = Math.min(nearestBoundary, x, 1 - x, y, 1 - y);
    if (cell % GRID === 0 || cell % GRID === GRID - 1 || cell < GRID || cell >= CELLS - GRID) literalBoundary = true;
  }
  const centroid = { x: sx / cells.length, y: sy / cells.length };
  const centroidEntryDistance = Math.hypot(centroid.x - ENTRY.x, centroid.y - ENTRY.y);
  const nearEntry = nearestEntry <= ENTRY_RADIUS + 1e-12;
  const touchesBoundary = nearestBoundary <= BOUNDARY_BAND + 1e-12;
  return { center: centroid, centroidEntryDistance, nearestEntryDistance: nearestEntry,
    boundaryClearance: nearestBoundary, nearEntry, touchesBoundary,
    touchesLiteralRasterEdge: literalBoundary, touchesNeither: !nearEntry && !touchesBoundary,
    spansEntryAndBoundary: nearEntry && touchesBoundary, maskCells: cells.length };
}

function descriptorSummary(descriptor, sequence, disposition) {
  const cells = descriptorCells(descriptor), spatial = descriptorSpatial(descriptor);
  return { sequence, id: descriptor.id, timeMs: descriptor.bornAtSimulationTimeMs,
    disposition, provenance: descriptor.provenance ?? { kind: 'production' },
    maskIndices: cells, maskCells: cells.length, maskSha256: hash(Buffer.from(Uint8Array.from(descriptor.mask))),
    descriptorSha256: hash(JSON.stringify({ ...descriptor, mask: undefined })),
    source: descriptor.source ?? null, target: descriptor.target ?? null,
    size: cells.length, geodesicSpan: descriptor.metrics?.geodesicLength
      ?? descriptor.provenance?.geodesicLength ?? null,
    material: descriptor.material ?? null, spatial };
}

function instrumentMaterialBirths(controller, ctx, arm) {
  const strata = controller.materialStratigraphy, original = strata.addPlate.bind(strata);
  strata.addPlate = descriptor => {
    const isSelector = descriptor?.id?.startsWith('trail-plate-');
    if (arm === 'replacement' && isSelector) {
      assert.ok(!ctx.shadowBirths.some(row => row.id === descriptor.id), 'one shadow record per native selector birth');
      ctx.shadowBirths.push(descriptorSummary(descriptor, ctx.shadowBirths.length, 'shadow-selector-only'));
      ctx.shadowPlateInsertionsSkipped++;
      return false;
    }
    const beforeCells = descriptorCells(descriptor);
    const priorColumns = beforeCells.map(cell => (strata.columns[cell] || []).slice());
    const priorTop = beforeCells.map(cell => strata.topLayerByCell[cell]);
    const before = strata.plates.length;
    const inserted = original(descriptor);
    if (inserted && strata.plates.length === before + 1) {
      const research = descriptor?.provenance?.kind === 'research-local-singleton-X';
      const receipt = descriptorSummary(inserted, ctx.chronology.length,
        research ? 'local-X-actual' : 'current-production-actual');
      receipt.thicknessMeters = strata.plateThicknessMeters[strata.plateIndexById.get(inserted.id)];
      receipt.coveredCellsBefore = priorColumns.filter(column => column.length).length;
      receipt.priorOverlapIDs = [...new Set(priorColumns.flat().map(index => strata.plates[index]?.id).filter(Boolean))].sort();
      receipt.priorTopPlateIds = [...new Set(priorTop.map(index => index >= 0 ? strata.plates[index]?.id : null).filter(Boolean))].sort();
      receipt.topCellsAfter = 0; receipt.buriedIncidencesAfter = 0;
      for (const cell of beforeCells) {
        const column = strata.columns[cell] || [];
        if (column.at(-1) === strata.plateIndexById.get(inserted.id)) receipt.topCellsAfter++;
        receipt.buriedIncidencesAfter += Math.max(0, column.length - 1);
      }
      ctx.chronology.push(receipt);
      ctx.actualBirths.push(receipt);
      if (research) ctx.localBirths.push(receipt);
    }
    return inserted;
  };
}

function materialStats(strata, timeMs) {
  const counts = strata.layerCountByCell, top = strata.topLayerByCell, plates = strata.plates;
  const sorted = Array.from(counts).sort((a, b) => a - b);
  const quantile = q => sorted.length ? sorted[Math.round((sorted.length - 1) * q)] : 0;
  const hist = {};
  for (const value of counts) hist[value] = (hist[value] ?? 0) + 1;
  const topCellCounts = new Uint32Array(plates.length), buriedPlate = new Uint8Array(plates.length);
  let incidences = 0, buriedIncidences = 0, coverage = 0;
  const bins = Array.from({ length: 64 }, (_, bin) => ({ bin, coveredCells: 0, layerCellIncidences: 0 }));
  let entryCells = 0, boundaryCells = 0, entryBoundaryCells = 0;
  for (let cell = 0; cell < CELLS; cell++) {
    const n = counts[cell], x = (cell % GRID) / (GRID - 1), y = Math.floor(cell / GRID) / (GRID - 1);
    incidences += n;
    if (n > 0) {
      coverage++;
      buriedIncidences += n - 1;
      const bx = Math.min(7, Math.floor(x * 8)), by = Math.min(7, Math.floor(y * 8));
      bins[by * 8 + bx].coveredCells++;
      bins[by * 8 + bx].layerCellIncidences += n;
      const inEntry = Math.hypot(x - ENTRY.x, y - ENTRY.y) <= ENTRY_RADIUS + 1e-12;
      const inBoundary = Math.min(x, 1 - x, y, 1 - y) <= BOUNDARY_BAND + 1e-12;
      entryCells += Number(inEntry); boundaryCells += Number(inBoundary);
      entryBoundaryCells += Number(inEntry && inBoundary);
    }
    if (top[cell] >= 0) topCellCounts[top[cell]]++;
    const column = strata.columns[cell] || [];
    for (let i = 0; i < Math.max(0, column.length - 1); i++) buriedPlate[column[i]] = 1;
  }
  const entropy = values => {
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!total) return { bits: 0, normalized: 0 };
    const bits = -values.reduce((sum, value) => value ? sum + (value / total) * Math.log2(value / total) : sum, 0);
    return { bits, normalized: bits / 6 };
  };
  const coveredBins = bins.filter(row => row.coveredCells > 0).length;
  const body = connectedSizes(counts);
  const plateRows = plates.map((plate, index) => ({ id: plate.id, ...descriptorSpatial(plate),
    topCells: topCellCounts[index], completelyBuried: topCellCounts[index] === 0,
    hasBuriedCells: Boolean(buriedPlate[index]), provenance: plate.provenance ?? { kind: 'production' } }));
  const topPlateCount = topCellCounts.filter(value => value > 0).length;
  const completelyBuriedPlateCount = topCellCounts.filter(value => value === 0).length;
  const partlyBuriedPlateCount = buriedPlate.reduce((sum, value) => sum + value, 0);
  const zoneCount = key => plateRows.filter(row => row[key]).length;
  const depth = Array.from(strata.totalDepthByCellMeters).sort((a, b) => a - b);
  const dq = q => depth.length ? depth[Math.round((depth.length - 1) * q)] : 0;
  return { timeMs, plateCount: plates.length, coverageCells: coverage, layerCellIncidences: incidences,
    buriedLayerCellIncidences: buriedIncidences, layerDistribution: Object.fromEntries(
      Object.entries(hist).sort((a, b) => Number(a[0]) - Number(b[0]))),
    layerQuantiles: { q50: quantile(.5), q90: quantile(.9), max: quantile(1) },
    depthAboveFoundationMeters: { q50: dq(.5), q90: dq(.9), max: dq(1) },
    topCells: coverage, topPlateCount, partlyBuriedPlateCount, completelyBuriedPlateCount,
    noduleCount: strata.nodules.length, noduleCapacity: strata.maxNodules,
    noduleCapacityReached: strata.nodules.length >= strata.maxNodules,
    entryCoverageCells: entryCells, boundaryBandCoverageCells: boundaryCells,
    entryAndBoundaryCoverageCells: entryBoundaryCells,
    entryCoverageFraction: coverage ? entryCells / coverage : 0,
    boundaryBandCoverageFraction: coverage ? boundaryCells / coverage : 0,
    fixedGridBins: { size: 8, occupied: coveredBins, occupiedFraction: coveredBins / 64,
      normalizedCoverageEntropy: entropy(bins.map(row => row.coveredCells)).normalized,
      normalizedLayerIncidenceEntropy: entropy(bins.map(row => row.layerCellIncidences)).normalized, bins },
    connectedBody: body, plateZoneCounts: { nearEntry: zoneCount('nearEntry'),
      touchesBoundaryBand: zoneCount('touchesBoundary'), touchesNeither: zoneCount('touchesNeither'),
      spansEntryAndBoundary: zoneCount('spansEntryAndBoundary'), literalRasterEdge: zoneCount('touchesLiteralRasterEdge') },
    plateZones: plateRows,
    layerCounts: pack(counts), topPlateIdentity: pack(top) };
}

function connectedSizes(counts) {
  const seen = new Uint8Array(CELLS), sizes = [];
  for (let start = 0; start < CELLS; start++) {
    if (!counts[start] || seen[start]) continue;
    const queue = [start]; seen[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const cell = queue[cursor], x = cell % GRID, y = Math.floor(cell / GRID);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
        const next = ny * GRID + nx;
        if (counts[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    sizes.push(queue.length);
  }
  sizes.sort((a, b) => b - a);
  const covered = sizes.reduce((sum, size) => sum + size, 0);
  return { connectivity: 8, componentCount: sizes.length, largestComponentCells: sizes[0] ?? 0,
    largestComponentFraction: covered ? (sizes[0] ?? 0) / covered : 0,
    componentSizesDescending: sizes };
}

function checkpoint(controller, ctx, requestedSeconds) {
  const material = materialStats(controller.materialStratigraphy, controller.simulationTimeMs);
  const population = controller.agents.length;
  const pheromone = controller.field.getSnapshot();
  return { requestedSeconds, tick: Math.round(requestedSeconds * 60), timeMs: controller.simulationTimeMs,
    livingPopulation: population, cumulativeSpawned: controller.totalSpawned, cumulativeRetired: controller.totalRetired,
    realizedTravel: ctx.totalTravel, blockedAntTicks: ctx.blockedAntTicks, ticksWithBlockedAnts: ctx.ticksWithBlockedAnts,
    material, pheromone: { ...summarizeArray(pheromone.values), nodeSum: pheromone.nodeSum,
      reconstructedIntegral: pheromone.reconstructedIntegral },
    surfaceField: summarizeArray(controller.surfaceField.values),
    chemicalMemoryB: summarizeArray(controller.trailPlateBirth.chemicalMemory),
    researchRngCalls: ctx.researchRngCalls, shadowSelectorBirths: ctx.shadowBirths.length,
    localXBirths: ctx.localBirths.length, noduleCapacityReached: controller.materialStratigraphy.nodules.length
      >= controller.materialStratigraphy.maxNodules };
}

function attachExposureObserver(controller, ctx) {
  const occupancy = controller.occupancy, sense = occupancy.sense.bind(occupancy);
  occupancy.sense = (agent, agents, multiplier) => {
    const result = sense(agent, agents, multiplier), row = ctx.currentExposure.get(agent.id);
    if (row && row.layers > 0 && row.hDChanged && Number.isFinite(result.followingSpeedLimit)) {
      row.dSameFlowOpportunity = true;
      ctx.currentDOpportunities++;
    }
    return result;
  };
}

function exposureRow(controller, agent, snapshot, timeMs) {
  const cell = gridIndex(agent.x, agent.y), layers = materialLayerCountAtSnapshot(snapshot, agent.x, agent.y);
  return { antId: agent.id, cell, timeMs, layers,
    m: materialLocomotionMultiplier(layers), qA: materialTurnRateMultiplier(layers),
    hD: materialFollowingHeadwayMultiplier(layers),
    speedEffectApplicable: controller.materialLocomotionResistance && layers > 0,
    mChanged: layers > 0 && materialLocomotionMultiplier(layers) !== 1,
    aTurnRateChanged: layers > 0 && materialTurnRateMultiplier(layers) !== 1,
    hDChanged: layers > 0 && materialFollowingHeadwayMultiplier(layers) !== 1,
    dSameFlowOpportunity: false };
}

function checkObserverNoRng(controller, rng, callback, ctx, label) {
  const calls = rng.calls, before = worldFingerprint(controller, rng), priorRandom = Math.random;
  Math.random = () => { throw new Error(label + ' attempted Math.random'); };
  try {
    const result = callback();
    assert.equal(rng.calls, calls, label + ' consumes zero controller RNG');
    assert.equal(worldFingerprint(controller, rng), before, label + ' leaves controller state unchanged');
    ctx.researchRngCalls += rng.calls - calls;
    return result;
  } finally { Math.random = priorRandom; }
}

export async function runArm(seed, arm, ops, { outDir = resolve(EVIDENCE, 'analysis/runs'), avCapture = null } = {}) {
  const isReplacement = arm === 'replacement', rng = countedLcg(seed), observer = new SingletonFeedbackObserver(seed);
  const controller = new AntController({ random: rng.random });
  const ctx = { rng, built: null, pendingBoundary: null, anchors: [], events: [], decisions: [],
    nativeBirthEvents: [], shadowBirths: [], actualBirths: [], localBirths: [], chronology: [],
    checkpoints: [], tickMetrics: [], tickFeedback: [], exposureTicks: [], currentExposure: new Map(),
    currentDOpportunities: 0, totalTravel: 0, blockedAntTicks: 0, ticksWithBlockedAnts: 0,
    researchRngCalls: 0, shadowPlateInsertionsSkipped: 0, spawnClearanceChecks: 0,
    finiteAgentChecks: 0, finiteFieldChecks: 0, firstCapacityTimeMs: null, firstNoduleCapacityTimeMs: null };
  assert.equal(controller.materialStratigraphy.maxPlates, 256, 'native material capacity is 256');
  assert.equal(controller.materialStratigraphy.maxNodules, MATERIAL_STRATIGRAPHY_MAX_NODULES,
    'native Nodule capacity is unchanged');
  assert.equal(controller.materialLocomotionResistance, true, 'native material feedback remains enabled');
  assert.equal(controller.researchLayerCountProvider, null, 'no research layer provider enters production tick');
  attachProductionObserver(controller, ctx, ops);
  attachExposureObserver(controller, ctx);
  instrumentMaterialBirths(controller, ctx, arm);
  controller.subscribe(({ type, payload }) => {
    if (type === 'plate-birth') ctx.nativeBirthEvents.push({ id: payload.id,
      timeMs: payload.bornAtSimulationTimeMs, maskIndices: descriptorCells(payload) });
    if (type === 'sphere-birth') ctx.noduleLineage.push({ id: payload.id,
      timeMs: payload.bornAtSimulationTimeMs, foundationPlateId: payload.coupledPlateId,
      sourcePlateIDs: [...payload.sourcePlateIDs],
      researchSourcePlateIDs: payload.sourcePlateIDs.filter(id => id.startsWith('research-local-X-')),
      sourcePlateProvenance: payload.sourcePlateIDs.map(id => {
        const plate = controller.materialStratigraphy.plateById.get(id);
        return { id, provenance: plate?.provenance ?? { kind: 'production' } };
      }), burial: payload.burial, support: payload.support });
  });
  ctx.noduleLineage = [];
  avCapture?.attach?.(controller, { seed, arm });
  await controller.init();
  const initialRngCalls = rng.calls;
  assert.ok(initialRngCalls > 0, 'normal controller initialization consumes production RNG');
  try {
    for (let tick = 1; tick <= TICKS; tick++) {
      if (isReplacement && ctx.firstCapacityTimeMs !== null) break;
      const before = controller.agents.map(agent => ({ agent, from: { x: agent.x, y: agent.y } }));
      const beforeSpawned = controller.totalSpawned, beforeRetired = controller.totalRetired;
      const timeAtEntry = controller.simulationTimeMs;
      const tickMaterial = controller.materialStratigraphy.getSnapshot();
      ctx.currentExposure = new Map();
      const lHistogram = {};
      let exposed = 0, speedCalls = 0, aCalls = 0;
      for (const row of before) {
        const sample = exposureRow(controller, row.agent, tickMaterial, timeAtEntry);
        ctx.currentExposure.set(row.agent.id, sample);
        lHistogram[sample.layers] = (lHistogram[sample.layers] ?? 0) + 1;
        exposed += Number(sample.layers > 0);
        speedCalls += Number(sample.speedEffectApplicable && sample.mChanged);
        aCalls += Number(sample.aTurnRateChanged);
      }
      ctx.currentDOpportunities = 0;
      avCapture?.beforeTick?.(controller, tick, timeAtEntry);
      controller.tick(DT);
      const stateTime = controller.simulationTimeMs;
      const idsAfter = new Set(controller.agents.map(agent => agent.id));
      const priorIds = new Set(before.map(row => row.agent.id));
      const newIds = controller.agents.filter(agent => !priorIds.has(agent.id)).map(agent => agent.id);
      checkWorldInvariants(controller, newIds);
      ctx.spawnClearanceChecks += newIds.length;
      ctx.finiteAgentChecks += controller.agents.length;
      for (const row of before) {
        const to = idsAfter.has(row.agent.id) ? { x: row.agent.x, y: row.agent.y }
          : { x: clamp01(row.agent.x), y: clamp01(row.agent.y) };
        ctx.totalTravel += Math.hypot(to.x - row.from.x, to.y - row.from.y);
        if (row.agent.wasBlocked) ctx.blockedAntTicks++;
      }
      const blocked = before.filter(row => row.agent.wasBlocked).length;
      if (blocked) ctx.ticksWithBlockedAnts++;
      ctx.tickMetrics.push({ tick, timeAtEntryMs: timeAtEntry, livingAtEntry: before.length,
        livingAtEnd: controller.agents.length, spawned: controller.totalSpawned, retired: controller.totalRetired,
        spawnedThisTick: controller.totalSpawned - beforeSpawned,
        retiredThisTick: controller.totalRetired - beforeRetired, blockedAnts: blocked,
        realizedTravelCumulative: ctx.totalTravel });
      ctx.tickFeedback.push({ tick, timeAtEntryMs: timeAtEntry, livingAnts: before.length,
        exposedAntTicks: exposed, LHistogram: lHistogram, speedCallsChanged: speedCalls,
        aTurnRateCallsChanged: aCalls, dSameFlowHeadwayOpportunities: ctx.currentDOpportunities });
      if (ctx.pendingBoundary) {
        const pending = ctx.pendingBoundary; ctx.pendingBoundary = null;
        const birthsAtBoundary = ctx.nativeBirthEvents.filter(row => row.timeMs === pending.timeMs);
        const formation = checkObserverNoRng(controller, rng, () => observer.observe({
          anchorIndex: ctx.anchors.length, timeMs: pending.timeMs, E: pending.E, F: pending.F, B: pending.B, C: pending.C
        }), ctx, 'locked local B/C observer');
        for (const event of formation.events) ctx.events.push(event);
        for (const decision of formation.decisions) ctx.decisions.push(decision);
        if (isReplacement) {
          for (const decision of formation.decisions) {
            if (decision.disposition !== 'singleton-control-observation') continue;
            assert.equal(decision.timeMs, pending.timeMs, 'local X birth time is maturation time');
            assert.equal(decision.timeMs, controller.simulationTimeMs, 'local X is inserted at current completed tick');
            const eventsById = new Map(formation.events.map(event => [event.eventId, event]));
            for (const id of decision.eventIds) {
              const event = eventsById.get(id);
              assert.ok(event, 'accepted X event is a current maturation');
              assert.deepEqual(xCapture(pending.F, event.centerIndex, ENTRY_RADIUS).cells, decision.xCells,
                'local descriptor retains exact F-intersected Euclidean-disk X mask');
            }
            const calls = rng.calls, beforeWorld = movementFingerprint(controller, rng), priorRandom = Math.random;
            let descriptor, inserted;
            try {
              Math.random = () => { throw new Error('local X descriptor/insertion attempted Math.random'); };
              descriptor = createResearchLocalPlate(decision, ctx.localBirths.length + 1);
              for (const field of ['source', 'target', 'corridor', 'principalPath', 'centerline', 'path']) {
                assert.equal(Object.hasOwn(descriptor, field), false, 'local descriptor has no fabricated ' + field);
              }
              assert.equal(descriptor.bornAtSimulationTimeMs, controller.simulationTimeMs, 'birth clock is actual matured X time');
              inserted = controller.materialStratigraphy.addPlate(descriptor);
            } finally { Math.random = priorRandom; }
            assert.ok(inserted, 'accepted singleton local X enters native stratigraphy');
            assert.equal(rng.calls, calls, 'local materialization consumes zero controller RNG');
            assert.equal(movementFingerprint(controller, rng), beforeWorld,
              'post-tick local insertion does not retroactively change completed movement/environment');
            assert.deepEqual(descriptorCells(inserted), decision.xCells, 'stored Plate mask is exact X');
            assert.equal(Object.isFrozen(inserted), true, 'stored local Plate descriptor is immutable');
            assert.equal(Object.isFrozen(inserted.mask), true, 'stored local X mask is immutable');
            assert.deepEqual(inserted.provenance?.channels, decision.provenance, 'stored local provenance is B, C, or {B,C}');
            for (const field of ['source', 'target', 'corridor', 'principalPath', 'centerline', 'path']) {
              assert.equal(Object.hasOwn(inserted, field), false, 'stored local Plate has no fabricated ' + field);
            }
            const receipt = ctx.localBirths.at(-1);
            assert.ok(receipt && receipt.id === descriptor.id, 'one actual insertion receipt per accepted X');
            if (controller.materialStratigraphy.plates.length === MATERIAL_STRATIGRAPHY_MAX_PLATES) {
              ctx.firstCapacityTimeMs ??= controller.simulationTimeMs;
            }
          }
        }
        assert.equal(ctx.pendingBoundary, null);
        assertFiniteFields(controller); ctx.finiteFieldChecks++;
        const candidate = controller.trailPlateBirth.candidate;
        const strata = controller.materialStratigraphy;
        ctx.anchors.push({ index: ctx.anchors.length,
          tick: Math.round(pending.timeMs / (1000 / 60)), timeMs: pending.timeMs,
          E: pack(pending.E), F: pack(pending.F), B: pack(pending.B), C: pack(pending.C), D: pack(pending.D),
          materialBefore: { layers: pack(pending.materialBefore.layers), top: pack(pending.materialBefore.top) },
          rngCalls: rng.calls, rngState: rng.state(),
          nativeSelectorBirthIds: birthsAtBoundary.map(row => row.id),
          productionCandidate: candidate ? { available: true, startedAtMs: candidate.startedAtMs,
            stableSeconds: candidate.stableSeconds, similarity: candidate.similarity,
            source: candidate.source, target: candidate.target, geodesicLength: candidate.geodesicLength,
            maskSha256: hash(bytes(candidate.mask)), supportedMaskSha256: hash(bytes(candidate.supportedMask)) }
            : { available: false },
          formation: { activeOpportunities: formation.activeOpportunities,
            newMaturations: formation.newMaturations, uniqueMatureXOptions: formation.uniqueMatureXOptions,
            singletonOptions: formation.singletonOptions, contestedOptions: formation.contestedOptions,
            overlapEdges: formation.overlapEdges, overlapComponents: formation.overlapComponents,
            contestedComponents: formation.contestedComponents, provenanceCounts: formation.provenanceCounts,
            entryCounts: formation.entryCounts, opportunities: formation.opportunities,
            matureOptions: formation.matureOptions } });
      }
      avCapture?.afterTick?.(controller, tick, stateTime);
      if (ctx.nativeBirthEvents.length && ctx.nativeBirthEvents.at(-1).timeMs === stateTime
        && ctx.firstNativeSelectorTimeMs === undefined) ctx.firstNativeSelectorTimeMs = stateTime;
      if (strataNoduleCapacityReached(controller) && ctx.firstNoduleCapacityTimeMs === null) {
        ctx.firstNoduleCapacityTimeMs = controller.simulationTimeMs;
      }
      if (tick % 3600 === 0 || (isReplacement && ctx.firstCapacityTimeMs !== null)) {
        ctx.checkpoints.push(checkpoint(controller, ctx, tick / 60));
      }
      if (tick % 3600 === 0) console.log(JSON.stringify({ seed, arm, seconds: controller.simulationTimeMs / 1000,
        anchors: ctx.anchors.length, localBirths: ctx.localBirths.length, shadowBirths: ctx.shadowBirths.length,
        actualPlates: controller.materialStratigraphy.plates.length, nodules: controller.materialStratigraphy.nodules.length }));
    }
    assert.equal(ctx.pendingBoundary, null, 'no unprocessed formation boundary');
    if (ctx.firstCapacityTimeMs === null) assert.equal(ctx.anchors.length, 300, 'complete 300 native analyses');
    assert.equal(ctx.researchRngCalls, 0, 'research observer RNG count is zero');
    if (isReplacement) {
      assert.equal(ctx.shadowPlateInsertionsSkipped, ctx.shadowBirths.length, 'every native selector Plate is shadow-only');
      assert.ok(controller.materialStratigraphy.plates.every(plate => plate.id.startsWith('research-local-X-')),
        'replacement stratigraphy contains no source-to-boundary Plate');
      assert.equal(controller.materialStratigraphy.plates.length, ctx.localBirths.length,
        'every local material Plate appears once in stratigraphy');
    } else {
      assert.equal(controller.materialStratigraphy.plates.length, ctx.actualBirths.length,
        'CONTROL actual chronology covers every inserted native Plate');
    }
    assert.ok(ctx.chronology.every((row, index) => row.sequence === index
      && (index === 0 || row.timeMs >= ctx.chronology[index - 1].timeMs)),
    'actual insertion chronology is exact and nondecreasing');
    const snapshot = controller.materialStratigraphy.getSnapshot();
    const topology = compileSurfaceTopology({ plates: controller.materialStratigraphy.plates,
      nodules: controller.materialStratigraphy.getNodules(), stratigraphy: snapshot.stratigraphy,
      generation: 1, maxLayers: 256 });
    assert.equal(topology.version, 1, 'native topology version');
    assert.equal(topology.sourceGrid, GRID, 'native topology source grid');
    assert.equal(topology.solverGrid, 32, 'native topology solver grid');
    assert.equal(topology.layerIds.length, controller.materialStratigraphy.plates.length,
      'every actual Plate compiles into topology');
    ctx.topology = { valid: true, version: topology.version, sourceGrid: topology.sourceGrid,
      solverGrid: topology.solverGrid, layerCount: topology.layerIds.length,
      nodeCount: topology.nodeGridIndices.length, layerIds: topology.layerIds,
      routingTopCellCount: topology.routingTopLayerByCell96.length };
    ctx.finalMaterial = materialStats(controller.materialStratigraphy, controller.simulationTimeMs);
    ctx.finalMaterial.noduleLineage = ctx.noduleLineage;
    ctx.finalMaterial.capacityReachedAtMs = ctx.firstCapacityTimeMs;
    ctx.finalMaterial.noduleCapacityReachedAtMs = ctx.firstNoduleCapacityTimeMs;
    const run = { schema: 'ant-local-x-material-replacement-v1', arm, seed, authority: AUTHORITY,
      base: BASE, branch: BRANCH, hz: 60, seconds: controller.simulationTimeMs / 1000, dt: DT,
      audio: 'Off (no AudioBridge constructed)', observer: {
        B: 'native TrailPlateBirth.chemicalMemory', C: 'native SurfaceField compaction',
        X: '8-neighbor component of native F intersect Euclidean disk R=0.15',
        maturation: '20 s uninterrupted; adjacent X Jaccard >= 0.60',
        singleton: 'exact same-X coeval B/C events collapse; degree zero in current exact mature-X overlap graph; contested events receive no retry or queue',
        materialization: isReplacement ? 'only accepted singleton X descriptors enter native MaterialStratigraphy after completed tick'
          : 'read-only observer; unchanged native source-to-boundary births enter native MaterialStratigraphy' },
      anchors: ctx.anchors, events: ctx.events, decisions: ctx.decisions,
      nativeSelectorBirthEvents: ctx.nativeBirthEvents, shadowProductionBirths: ctx.shadowBirths,
      actualBirths: ctx.actualBirths, localXBirths: ctx.localBirths,
      chronology: ctx.chronology, noduleLineage: ctx.noduleLineage,
      tickMetrics: ctx.tickMetrics, tickFeedback: ctx.tickFeedback, checkpoints: ctx.checkpoints,
      firstNativeSelectorTimeMs: ctx.firstNativeSelectorTimeMs ?? null,
      firstActualPlateTimeMs: ctx.actualBirths[0]?.timeMs ?? null,
      firstCapacityTimeMs: ctx.firstCapacityTimeMs, firstNoduleCapacityTimeMs: ctx.firstNoduleCapacityTimeMs,
      finalMaterial: ctx.finalMaterial, topology: ctx.topology,
      validation: { finiteAntStateEveryTick: true, finiteFieldChecks: ctx.finiteFieldChecks,
      finiteAgentChecks: ctx.finiteAgentChecks, finiteFieldsEveryNativeBoundary: ctx.finiteFieldChecks,
      spawnClearancePairs: ctx.spawnClearanceChecks,
        researchRngCalls: ctx.researchRngCalls, audioBridgePresent: Boolean(controller.audioBridge),
        researchLayerCountProviderPresent: controller.researchLayerCountProvider !== null,
        actualChronologyNondecreasing: true, sourceShadowInsertionsSkipped: ctx.shadowPlateInsertionsSkipped,
        replacementPreInterventionParityTicks: null,
        localBirthCountEqualsActualStratigraphyResearchPlates: isReplacement
          ? ctx.localBirths.length === controller.materialStratigraphy.plates.length : null,
        capacityReachedAtMs: ctx.firstCapacityTimeMs, noduleCapacityReachedAtMs: ctx.firstNoduleCapacityTimeMs },
      controlConformance: null };
    await mkdir(outDir, { recursive: true });
    await writeRun(resolve(outDir, 'seed-' + seed + '-' + arm + '.signals.json.gz'), run, 20);
    return { run, av: avCapture?.data ?? null };
  } finally {
    await controller.destroy();
  }
}

function strataNoduleCapacityReached(controller) {
  return controller.materialStratigraphy.nodules.length >= controller.materialStratigraphy.maxNodules;
}

export async function validateControlAgainstFrozen(run, authorityReceipt) {
  const seed = String(run.seed);
  const frozen = await readRun(resolve(FROZEN_ROOT, 'seed-' + seed + '.signals.json.gz'));
  assert.equal(frozen.authority, AUTHORITY, 'frozen signal authority');
  assert.equal(frozen.hz, 60, 'frozen signal frequency');
  assert.equal(frozen.seconds, 600, 'frozen signal reference duration');
  assert.equal(frozen.audio, 'Off', 'frozen signal audio state');
  assert.deepEqual(Object.keys(frozen.sourceHashes ?? {}).sort(), SOURCE_PATHS.slice().sort(),
    'frozen authority source path set');
  assert.deepEqual(frozen.sourceHashes, authorityReceipt.authoritySourceHashes,
    'frozen source hashes bind the exact requested authority');
  assert.equal(frozen.anchors.length >= 300, true, 'frozen first 300 anchors available');
  const fields = ['E', 'F', 'B', 'C', 'D'];
  for (let i = 0; i < 300; i++) {
    const actual = run.anchors[i], expected = frozen.anchors[i];
    assert.equal(actual.timeMs, expected.timeMs, 'CONTROL time anchor ' + i);
    assert.equal(actual.tick, expected.tick, 'CONTROL tick anchor ' + i);
    for (const field of fields) assert.deepEqual(actual[field], expected[field], 'CONTROL ' + field + ' anchor ' + i);
    assert.deepEqual(actual.materialBefore.layers, expected.material.layers, 'CONTROL layer map anchor ' + i);
    assert.deepEqual(actual.materialBefore.top, expected.material.top, 'CONTROL top map anchor ' + i);
    assert.deepEqual(actual.nativeSelectorBirthIds, expected.birthIds, 'CONTROL native birth IDs anchor ' + i);
    const ref = frozen.validation.parity.boundaryChecks[i];
    assert.equal(actual.rngCalls, ref.observedRngCalls, 'CONTROL RNG calls anchor ' + i);
    assert.equal(actual.rngState, ref.observedRngState, 'CONTROL RNG state anchor ' + i);
  }
  const expectedBirths = frozen.births.filter(row => row.timeMs <= 300_000);
  assert.equal(run.nativeSelectorBirthEvents.length, expectedBirths.length, 'CONTROL source-to-boundary birth count');
  for (let i = 0; i < expectedBirths.length; i++) {
    assert.equal(run.nativeSelectorBirthEvents[i].id, expectedBirths[i].id);
    assert.equal(run.nativeSelectorBirthEvents[i].timeMs, expectedBirths[i].timeMs);
    assert.deepEqual(run.nativeSelectorBirthEvents[i].maskIndices, expectedBirths[i].maskIndices);
  }
  const opportunitiesPath = resolve(FROZEN_ROOT, 'seed-' + seed + '.opportunities.json.gz');
  const opportunities = await readJson(opportunitiesPath);
  assert.equal(opportunities.seed, seed, 'frozen opportunity seed');
  const trackMap = { B: new Map(), C: new Map() }, reverseMap = { B: new Map(), C: new Map() };
  let checkedAnchors = 0, checkedRows = 0, checkedCells = 0;
  for (const file of opportunities.anchorsFiles) {
    const chunkPath = resolve(FROZEN_ROOT, file), chunkBytes = await readFile(chunkPath);
    assert.equal(sha256(chunkBytes), opportunities.chunkHashes[file], 'frozen opportunity chunk hash ' + file);
    const chunk = await readJson(chunkPath);
    for (const expected of chunk.anchors) {
      if (expected.index >= run.anchors.length) break;
      const actual = run.anchors[expected.index];
      assert.equal(actual.timeMs, expected.timeMs, 'CONTROL B/C observer time ' + expected.index);
      for (const channel of ['B', 'C']) {
        const actualRows = actual.formation.opportunities[channel], expectedRows = expected.channels[channel]?.g15 ?? [];
        assert.equal(actualRows.length, expectedRows.length, 'CONTROL ' + channel + ' opportunity rows ' + expected.index);
        const captures = new Map(expected.captures.map(row => [row.id, row.cells]));
        const F = unpack(actual.F);
        for (let rowIndex = 0; rowIndex < expectedRows.length; rowIndex++) {
          const a = actualRows[rowIndex], e = expectedRows[rowIndex];
          for (const field of ['index', 'value', 'rank', 'component', 'entryDistance'])
            assert.equal(a[field], e[field], 'CONTROL ' + channel + ' opportunity ' + field);
          const xCells = xCapture(F, e.index, .15).cells;
          assert.deepEqual(xCells, captures.get(e.captureId), 'CONTROL exact local-X capture membership');
          const frozenTrackId = e.trackIds['0.025'], mapped = trackMap[channel].get(a.trackId);
          assert.ok(mapped === undefined || mapped === frozenTrackId, 'CONTROL live/frozen track mapping is stable');
          const reverse = reverseMap[channel].get(frozenTrackId);
          assert.ok(reverse === undefined || reverse === a.trackId, 'CONTROL live/frozen track mapping is one-to-one');
          trackMap[channel].set(a.trackId, frozenTrackId);
          reverseMap[channel].set(frozenTrackId, a.trackId);
          checkedRows++; checkedCells += xCells.length;
        }
      }
      checkedAnchors++;
    }
    if (checkedAnchors >= run.anchors.length) break;
  }
  assert.equal(checkedAnchors, run.anchors.length, 'CONTROL observer rows checked at all 300 anchors');
  const eventsPacket = await readJson(resolve(FROZEN_EVENTS_ROOT, 'events-' + seed + '.json.gz'));
  assert.equal(eventsPacket.seed, seed, 'frozen B/C event seed');
  const expectedEvents = eventsPacket.events.filter(event => event.timeMs <= run.anchors[299].timeMs);
  assert.equal(run.events.length, expectedEvents.length, 'CONTROL B/C maturations');
  const key = event => event.channel + ':' + event.trackId + ':I' + String(event.intervalNumber).padStart(3, '0');
  const expectedByKey = new Map(expectedEvents.map(event => [key(event), event]));
  const matched = new Set();
  for (const actual of run.events) {
    const frozenTrackId = trackMap[actual.channel].get(actual.trackId);
    const identity = { ...actual, trackId: frozenTrackId };
    const eventKey = key(identity), expected = expectedByKey.get(eventKey);
    assert.ok(expected, 'CONTROL maturity identity exists in frozen receipt');
    assert.equal(matched.has(eventKey), false, 'CONTROL maturity identity is unique');
    for (const field of ['timeMs', 'anchorIndex', 'stabilityStartAnchor', 'stabilityStartTimeMs',
      'stableElapsedMs', 'centerIndex', 'xCells']) assert.deepEqual(actual[field], expected[field],
      'CONTROL frozen maturity ' + field);
    assert.equal(actual.intervalNumber, expected.intervalNumber);
    matched.add(eventKey);
  }
  assert.equal(matched.size, expectedEvents.length, 'every frozen maturity identity matched');
  return { status: 'PASS', authority: AUTHORITY, frozenAuthoritySourceHashes: frozen.sourceHashes,
    AntControllerHashExplanation: 'The exact authority commit and source diff were verified; the current checkout inherits only the validated default-off researchLayerCountProvider hook. Frozen source hashes match the requested authority.',
    frozenReceipt: '2026-10-31-local-opportunity-competition-audit',
    exactNativeAnchors: 300, exactFields: fields, exactLayerAndTopMaps: 300,
    exactBoundaryRngChecks: 300, exactProductionBirths: expectedBirths.length,
    exactBCObserverAnchors: checkedAnchors, exactBCOpportunityRows: checkedRows,
    exactCapturedXCells: checkedCells, exactBCMaturations: expectedEvents.length,
    exactMaturityTrackMapping: true };
}

async function main() {
  await mkdir(resolve(EVIDENCE, 'analysis'), { recursive: true });
  const authorityReceipt = await verifyAuthorityReceipts();
  await writeJson(resolve(EVIDENCE, 'analysis/authority-receipts.json'), authorityReceipt);
  const ops = productionOps(await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8'));
  const results = [];
  for (const seed of SEEDS) {
    let controlResult;
    try {
      controlResult = await runArm(seed, 'control', ops);
      const controlReceipt = await validateControlAgainstFrozen(controlResult.run, authorityReceipt);
      controlResult.run.controlConformance = controlReceipt;
      await writeRun(resolve(EVIDENCE, 'analysis/runs/seed-' + seed + '-control.signals.json.gz'),
        controlResult.run, 20);
      results.push({ seed, control: controlReceipt, replacement: null,
        controlFile: 'runs/seed-' + seed + '-control.signals.json.gz',
        replacementFile: 'runs/seed-' + seed + '-replacement.signals.json.gz',
        status: 'CONTROL PASS; REPLACEMENT PENDING' });
      controlResult = null;
    } catch (error) {
      results.push({ seed, control: { status: 'FAIL', message: error.message }, replacement: null,
        controlFile: 'runs/seed-' + seed + '-control.signals.json.gz',
        replacementFile: null, status: 'INVALID / BASELINE MISMATCH' });
      console.error(JSON.stringify({ seed, arm: 'control', status: 'INVALID / BASELINE MISMATCH', error: error.message }));
      controlResult = null;
      await writeJson(resolve(EVIDENCE, 'analysis/campaign-runs.json'), results);
      continue;
    }
    try {
      const replacementResult = await runArm(seed, 'replacement', ops);
      results.at(-1).replacement = { status: 'PASS',
        actualLocalBirths: replacementResult.run.localXBirths.length,
        shadowProductionBirths: replacementResult.run.shadowProductionBirths.length,
        firstLocalPlateTimeMs: replacementResult.run.firstActualPlateTimeMs,
        capacityReachedAtMs: replacementResult.run.firstCapacityTimeMs,
        noduleCapacityReachedAtMs: replacementResult.run.firstNoduleCapacityTimeMs };
      results.at(-1).status = replacementResult.run.firstCapacityTimeMs !== null
        && replacementResult.run.firstCapacityTimeMs < 300_000 ? 'CAPACITY BLOCKED' : 'PAIR COMPLETE';
    } catch (error) {
      results.at(-1).replacement = { status: 'INVALID', message: error.message };
      results.at(-1).replacementFile = null;
      results.at(-1).status = 'INVALID';
      console.error(JSON.stringify({ seed, arm: 'replacement', status: 'INVALID', error: error.message }));
    }
    await writeJson(resolve(EVIDENCE, 'analysis/campaign-runs.json'), results);
  }
  await writeJson(resolve(EVIDENCE, 'analysis/authority-receipts.json'), authorityReceipt);
  await writeJson(resolve(EVIDENCE, 'analysis/campaign-runs.json'), results);
  console.log(JSON.stringify({ branch: BRANCH, authorityObjectPresent: authorityReceipt.authorityCommitObjectPresent,
    seeds: results.map(row => ({ seed: row.seed, status: row.status,
      controlConformance: row.control?.status,
      replacementBirths: row.replacement?.actualLocalBirths ?? null,
      shadowBirths: row.replacement?.shadowProductionBirths ?? null,
      capacity: row.replacement?.capacityReachedAtMs ?? null })) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
