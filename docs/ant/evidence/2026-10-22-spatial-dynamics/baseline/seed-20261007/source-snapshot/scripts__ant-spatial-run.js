import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { describeMaterial, describeSnapshot } from './ant-spatial-descriptors.js';
import { analyzeRouteCurvature } from './ant-route-curvature-metrics.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DT = 1 / 60;
const CHECKPOINTS = new Set([30, 120, 300, 600, 1200, 1800, 3600, 7200]);
const SOURCE_PATHS = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/GaitController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/ColonyActivation.js', 'scripts/ant-spatial-core.js',
  'scripts/ant-spatial-recruitment.js', 'scripts/ant-spatial-field.js',
  'scripts/ant-spatial-run.js', 'scripts/ant-spatial-descriptors.js',
  'scripts/ant-route-curvature-metrics.js', 'scripts/ant-recruitment-descriptors.js'];

export async function runSpatialCase({ Controller = AntController, seed = 20261022, seconds = 600,
  output = null, label = 'production', receipt = null, ...controllerOptions } = {}) {
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'seed must be uint32');
  assert.ok(Number.isFinite(seconds) && seconds > 0 && Number.isInteger(seconds), 'seconds must be positive integer');
  const before = await sourceHashes();
  if (output) await freezeSources(output, before);
  const started = performance.now();
  let rngState = seed >>> 0, rngCalls = 0;
  const controller = new Controller({ ...controllerOptions, random: () => {
    rngCalls += 1; rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 0x100000000;
  } });
  const segmentsByTick = new Map();
  const hookTicks = new Map();
  const collisionScalesByTick = new Map();
  const spawnObservations = [];
  const tickFlow = new Map();
  const flowStats = emptyFlowStats();
  const occupancy = controller.occupancy;
  const originalConstrain = occupancy.constrainDisplacements;
  occupancy.constrainDisplacements = function(agents, displacements) {
    const scales = originalConstrain.call(this, agents, displacements);
    collisionScalesByTick.set(Math.round((controller.simulationTimeMs + DT * 1000) / (DT * 1000)),
      new Map(agents.map((agent, index) => [agent.id, scales[index]])));
    return scales;
  };
  const gait = controller.gaitController;
  const originalAdvance = gait.advance;
  controller.spatialObserver = {
    onTick({ tick, flow, segments } = {}) {
      if (Number.isInteger(tick)) {
        if (Array.isArray(segments)) hookTicks.set(tick, segments);
        if (flow !== undefined) { tickFlow.set(tick, flow); recordFlow(flowStats, flow); }
      }
    },
    onSpawn(event = {}) { spawnObservations.push({ ...event }); }
  };
  gait.advance = function(agent, distance, dt, time, segment) {
    const tick = Math.round(time / (DT * 1000));
    const rows = segmentsByTick.get(tick) || [];
    const collisionScale = collisionScalesByTick.get(tick)?.get(agent.id) ?? 1;
    rows.push({ id: agent.id, from: { ...segment.from }, to: { ...segment.to }, distance,
      collisionScale, speed: Math.hypot(agent.vx, agent.vy), heading: agent.heading,
      angularVelocity: agent.angularVelocity });
    segmentsByTick.set(tick, rows);
    return originalAdvance.call(this, agent, distance, dt, time, segment);
  };
  await controller.init();
  const frames = [], checkpoints = [], curvatureSamples = [];
  const trajectory10Hz = [];
  const secondDisplacements = new Map();
  let priorMaterial = null;
  const ticks = seconds * 60;
  for (let tick = 1; tick <= ticks; tick += 1) {
    controller.tick(DT);
    const segments = (hookTicks.get(tick) || segmentsByTick.get(tick) || []).map(row => ({
      ...row, distance: row.distance ?? row.travelled ?? Math.hypot(row.to.x - row.from.x, row.to.y - row.from.y),
      speed: row.speed ?? Math.hypot(row.vx || 0, row.vy || 0),
      collisionScale: row.collisionScale ?? collisionScalesByTick.get(tick)?.get(row.id) ?? 1,
      angularVelocity: row.angularVelocity ?? 0
    }));
    for (const row of segments) {
      const endpoint = row.to;
      curvatureSamples.push({ tick, id: row.id, x: endpoint.x, y: endpoint.y,
        heading: row.heading, speed: row.speed, collisionScale: row.collisionScale,
        turnCapSaturated: Math.abs(row.angularVelocity) >= 4.5 - 1e-9 });
      const prior = secondDisplacements.get(row.id);
      secondDisplacements.set(row.id, { from: prior?.from || row.from, to: row.to });
    }
    if (tick % 6 === 0) trajectory10Hz.push({ tick, agents: controller.agents.map(agent =>
      [agent.id, agent.x, agent.y, agent.heading]) });
    if (tick % 60 === 0) {
      const secondsAt = tick / 60;
      const snap = controller.materialStratigraphy.getSnapshot();
      const material = describeMaterial(snap, priorMaterial); priorMaterial = material.next;
      const agents = controller.agents.map(agent => {
        const displacement = secondDisplacements.get(agent.id);
        return { ...agent, dx: displacement ? displacement.to.x - displacement.from.x : 0,
          dy: displacement ? displacement.to.y - displacement.from.y : 0 };
      });
      const fieldSnapshot = controller.field.getSnapshot();
      const spatial = describeSnapshot(agents, { pheromone: fieldSnapshot, dtSeconds: 1 });
      const frame = { second: secondsAt, ...spatial, material: material.descriptor,
        contactCount: controller.materialStratigraphy.totalAcceptedFootContacts,
        flow: tickFlow.get(tick) ?? null };
      frames.push(frame);
      if (CHECKPOINTS.has(secondsAt)) checkpoints.push({ second: secondsAt,
        publicSnapshot: snapshotJSON(controller.getSnapshot()), material: material.descriptor,
        simulationTimeMs: controller.simulationTimeMs,
        totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired });
      secondDisplacements.clear();
    }
    segmentsByTick.delete(tick);
    hookTicks.delete(tick);
    tickFlow.delete(tick);
    collisionScalesByTick.delete(tick);
  }
  gait.advance = originalAdvance;
  occupancy.constrainDisplacements = originalConstrain;
  const after = await sourceHashes();
  assert.deepEqual(after, before, 'simulation sources changed during run');
  const spawnFlowStats = summarizeSpawns(spawnObservations);
  const result = { schemaVersion: 1, seed, seconds, label, receipt, spawnObservations, dtSeconds: DT,
    modelSeconds: controller.simulationTimeMs / 1000,
    wallSeconds: (performance.now() - started) / 1000, rngCalls,
    final: { population: controller.agents.length, totalSpawned: controller.totalSpawned,
      totalRetired: controller.totalRetired, plateCount: controller.materialStratigraphy.plates.length,
      noduleCount: controller.materialStratigraphy.nodules.length },
    checkpoints, frames, trajectory10Hz, flowStats, spawnFlowStats,
    curvature: analyzeRouteCurvature(curvatureSamples), sourceHashes: before };
  if (output) await writeResult(output, result);
  return result;
}

async function sourceHashes() {
  return Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, sha256(await readFile(resolve(root, path)))])));
}
async function freezeSources(output, hashes) {
  const folder = resolve(dirname(output), 'source-snapshot');
  await mkdir(folder, { recursive: true });
  for (const path of SOURCE_PATHS) {
    const target = resolve(folder, path.replaceAll('/', '__'));
    await copyFile(resolve(root, path), target, constants.COPYFILE_EXCL);
  }
  const recorded = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, sha256(await readFile(resolve(folder, path.replaceAll('/', '__'))))])));
  assert.deepEqual(recorded, hashes, 'frozen source copy differs from execution source');
}
async function writeResult(path, result) {
  const target = resolve(path);
  try { await access(target); throw new Error(`Refusing to overwrite ${target}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(result)}\n`, { flag: 'wx' });
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function emptyFlowStats() { return { totalTicks: 0, validTicks: 0, invalidTicks: 0,
  invalidReasons: {}, countBins: { '0': 0, '1-2': 0, '3-4': 0, '5-8': 0, '9+': 0 },
  resultantBins: { '0-.2': 0, '.2-.4': 0, '.4-.6': 0, '.6-.8': 0, '.8-1': 0 } }; }
function recordFlow(stats, flow) {
  stats.totalTicks += 1;
  if (flow?.valid === true) stats.validTicks += 1;
  else { stats.invalidTicks += 1; const reason = flow?.reason || 'missing-or-invalid';
    stats.invalidReasons[reason] = (stats.invalidReasons[reason] || 0) + 1; }
  const count = Number.isFinite(flow?.count) ? flow.count : 0;
  const countBin = count === 0 ? '0' : count <= 2 ? '1-2' : count <= 4 ? '3-4' : count <= 8 ? '5-8' : '9+';
  stats.countBins[countBin] += 1;
  if (Number.isFinite(flow?.R)) {
    const i = Math.min(4, Math.floor(Math.max(0, flow.R) * 5));
    stats.resultantBins[Object.keys(stats.resultantBins)[i]] += 1;
  }
}
function summarizeSpawns(rows) {
  const valid = rows.filter(row => row.flow?.valid === true && Number.isFinite(row.flow.R));
  const postInit = rows.filter(row => row.tick > 0);
  const postInitValid = postInit.filter(row => row.flow?.valid === true && Number.isFinite(row.flow.R));
  const bins = { '0-.2': 0, '.2-.4': 0, '.4-.6': 0, '.6-.8': 0, '.8-1': 0 };
  for (const row of valid) bins[Object.keys(bins)[Math.min(4, Math.floor(row.flow.R * 5))]] += 1;
  const empirical = valid.map(row => {
    const centeredU = Math.abs(2 * row.U - 1);
    return centeredU > 0.2 ? Math.abs(wrapAngle(row.heading - row.flow.phi)) / centeredU : null;
  }).filter(Number.isFinite);
  return { acceptedCount: rows.length, flowValidCount: valid.length,
    flowInvalidCount: rows.length - valid.length,
    postInitAcceptedCount: postInit.length, postInitFlowValidCount: postInitValid.length,
    postInitFlowValidFraction: postInit.length ? postInitValid.length / postInit.length : null,
    meanValidR: valid.length ? valid.reduce((sum, row) => sum + row.flow.R, 0) / valid.length : null,
    validRBins: bins, empiricalHalfSpread: distribution(empirical),
    policyHalfSpread: distribution(valid.map(row => Math.PI - (Math.PI - 0.3) * row.flow.R)) };
}
function distribution(values) {
  if (!values.length) return { count: 0, mean: null, p50: null, p90: null };
  values.sort((a, b) => a - b);
  const q = p => values[Math.round((values.length - 1) * p)];
  return { count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length, p50: q(0.5), p90: q(0.9) };
}
function wrapAngle(value) { return ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }
function snapshotJSON(value) {
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(snapshotJSON);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshotJSON(item)]));
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map(process.argv.slice(2).map(value => { const at = value.indexOf('=');
    return at < 0 ? [value, true] : [value.slice(0, at), value.slice(at + 1)]; }));
  const seed = Number(args.get('--seed') ?? 20261022), seconds = Number(args.get('--seconds') ?? 600);
  const output = resolve(String(args.get('--output') || resolve(root, 'test-results/ant-spatial-run.json')));
  const result = await runSpatialCase({ seed, seconds, output, label: String(args.get('--label') || 'production') });
  console.log(JSON.stringify({ output, seed, seconds, wallSeconds: result.wallSeconds,
    modelSeconds: result.modelSeconds, final: result.final }));
}
