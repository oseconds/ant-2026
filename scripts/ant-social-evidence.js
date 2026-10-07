import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createGzip, gzipSync, gunzipSync } from 'node:zlib';
import { finished } from 'node:stream/promises';

const args = new Map(process.argv.slice(2).map(value => {
  const at = value.indexOf('=');
  return at < 0 ? [value, true] : [value.slice(0, at), value.slice(at + 1)];
}));
const DT = 1 / 60;
const MULTIPLIERS = [1, 1.25, 1.5, 2];
const WINDOWS = [0.25, 1, 5, 20];
const CHECKPOINTS = [30, 60, 120, 300, 600];
const CHECKPOINT_SET = new Set(CHECKPOINTS);
const TIMELINE_SECONDS = 1;
const TOPOLOGY_EVERY_TICKS = 3;
const CLOSE_RANGE = 0.022;
const SENSE_RADIUS = 0.085;
const OCCUPANCY_SIZE = 8;
const HASH_FIELDS = ['agents', 'rng', 'chemical', 'surface', 'contacts', 'births', 'lifecycle', 'material'];
const SOURCE_FILES = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/GaitController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/ColonyActivation.js', 'src/lib/agents/ant/DynamicSocialGraph.js',
  'src/lib/agents/ant/TemporalSocialTopology.js', 'scripts/ant-social-evidence.js'
];
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(String(args.get('--output') || resolve(root, 'test-results/social-evidence')));
const seconds = Number(args.get('--seconds') || 600);
const seeds = String(args.get('--seeds') || '20261005,20261006,20261007').split(',').map(Number);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (args.has('--selfcheck')) selfcheck();
  else if (args.has('--verify')) await verifyArchive();
  else await main();
}

async function main() {
  assert.ok(Number.isInteger(seconds) && seconds > 0, '--seconds must be a positive integer');
  assert.ok(seeds.length && seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff),
    '--seeds must contain unsigned 32-bit integers');
  const { AntController } = await import(pathToFileURL(resolve(root, 'src/lib/agents/ant/AntController.js')).href);
  const { DynamicSocialGraph } = await import(pathToFileURL(resolve(root, 'src/lib/agents/ant/DynamicSocialGraph.js')).href);
  const { TemporalSocialTopology } = await import(pathToFileURL(resolve(root, 'src/lib/agents/ant/TemporalSocialTopology.js')).href);
  await mkdir(output, { recursive: true });
  const sourceHashes = {};
  for (const path of SOURCE_FILES) sourceHashes[path] = sha256(await readFile(resolve(root, path)));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const manifest = { schemaVersion: 1, commit, node: process.version, sourceHashes,
    seeds, seconds, dtSeconds: DT, graphEnabledCondition: 'DynamicSocialGraph and TemporalSocialTopology observe copied snapshots only',
    graphDisabledCondition: 'No graph objects or observations are created', initialConditions: 'Fresh natural default controller per run; injected LCG; AudioBridge absent and Audio Off.',
    trajectory: 'Gzip file starts ANTTRJ01, uint32 schemaVersion=1, uint32 ticksPerSecond=60, uint32 recordBytes=52; each little-endian frame is Float64 timeSeconds, Uint32 agentCount, then sorted records Uint32 ID index and Float64 x,y,vx,vy,heading,radius. IDs map to strings in summary. Model is 2D; no z coordinate is fabricated. Includes t=0 after init.',
    hashCadence: 'Agent state, RNG state/calls, full chemical bytes, full surface bytes, contacts, births, and lifecycle are SHA-256 digested at every tick. Material snapshots are SHA-256 digested at t=0 and 1 Hz. Paired per-tick digests contain eight OFF hashes then eight ON hashes in HASH_FIELDS order; the first row is t=0.',
    hashFields: HASH_FIELDS, pairedTickHashBytesPerFrame: HASH_FIELDS.length * 64,
    encounter: 'Four normalized center-distance thresholds: distance <= k * (radiusA + radiusB), k in [1,1.25,1.5,2].',
    topology: 'TemporalSocialTopology observes each current graph snapshot every 3 ticks (20 Hz), with rolling-duration windows [0.25,1,5,20] seconds. Windows are exposure duration, not minimum episode cutoffs.',
    sampling: { checkpointSeconds: CHECKPOINTS, timelineSeconds: TIMELINE_SECONDS, topologyHz: 20 },
    files: [] };
  for (const seed of seeds) {
    const pair = await runPair({ AntController, DynamicSocialGraph, TemporalSocialTopology, seed, seconds, output });
    manifest.files.push(pair.files);
    console.log(JSON.stringify({ seed, seconds, parity: pair.parity, activeAgentsAtEnd: pair.summary.activeAgentsAtEnd,
      encounterCounts: pair.summary.graph.map(graph => ({ k: graph.distanceMultiplier, encounters: graph.encounters,
        intervals: graph.intervalCount })), files: pair.files }));
  }
  manifest.createdAt = new Date().toISOString();
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function runPair({ AntController, DynamicSocialGraph, TemporalSocialTopology, seed, seconds, output }) {
  const off = await runScenario({ AntController, DynamicSocialGraph, TemporalSocialTopology, seed, seconds,
    output, enabled: false });
  const on = await runScenario({ AntController, DynamicSocialGraph, TemporalSocialTopology, seed, seconds,
    output, enabled: true });
  const parity = compareDigests(off.tickDigestRows, on.tickDigestRows);
  const fields = Object.fromEntries(HASH_FIELDS.map((name, index) => [name, {
    off: off.finalHashes[name], on: on.finalHashes[name], match: off.finalHashes[name] === on.finalHashes[name],
    firstMismatchingTick: parity.firstMismatch[name]
  }]));
  const trajectoryMatch = off.trajectoryHash === on.trajectoryHash;
  const summary = { schemaVersion: 1, seed, seconds, graphEnabledParity: fields,
    trajectory: { enabledHash: on.trajectoryHash, disabledHash: off.trajectoryHash, match: trajectoryMatch,
      file: `seed${seed}-trajectory.f64.gz` }, activeAgentsAtEnd: on.activeAgentsAtEnd,
    runs: { off: off.provenance, on: on.provenance }, graph: on.graphSummary,
    correlations: on.correlations, checkpoints: on.checkpoints,
    files: { timeline: `seed${seed}-on-timeline.json.gz`, rawEvents: `seed${seed}-on-raw-events.json.gz`,
      tickHashes: `seed${seed}-paired-tick-hashes.bin.gz`, trajectory: `seed${seed}-trajectory.f64.gz` },
    limitations: ['MaterialStratigraphy and Plate/nodule material snapshot hashes are sampled at 1 Hz.',
      'Timeline spatial-density correlations are descriptive, not causal.', 'Graph-disabled run has no duplicate trajectory archive.'] };
  const summaryPath = resolve(output, `seed${seed}-summary.json`);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const hashesWriter = await openGzipWriter(resolve(output, summary.files.tickHashes));
  for (let index = 0; index < off.tickDigestRows.length; index += 1) {
    await hashesWriter.write(Buffer.concat([off.tickDigestRows[index], on.tickDigestRows[index]]));
  }
  await hashesWriter.close();
  const parityOk = trajectoryMatch && Object.values(fields).every(item => item.match)
    && Object.keys(parity.firstMismatch).every(key => parity.firstMismatch[key] === null);
  if (!parityOk) throw new Error(`Graph ON/OFF invariant mismatch for seed ${seed}: ${JSON.stringify(fields)}`);
  return { parity: { allHashesMatch: true, trajectoryMatch, perTickDigestsMatch: true }, summary,
    files: { summary: `seed${seed}-summary.json`, timeline: summary.files.timeline,
      rawEvents: summary.files.rawEvents, tickHashes: summary.files.tickHashes, trajectory: summary.files.trajectory } };
}

async function runScenario({ AntController, DynamicSocialGraph, TemporalSocialTopology, seed, seconds, output, enabled }) {
  const started = performance.now();
  let rngState = seed >>> 0, rngCalls = 0;
  const controller = new AntController({ random: () => {
    rngCalls += 1;
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 0x100000000;
  } });
  const graphs = enabled ? MULTIPLIERS.map(distanceMultiplier => ({ distanceMultiplier,
    graph: new DynamicSocialGraph({ distanceMultiplier }), topologies: WINDOWS.map(windowSeconds => ({
      windowSeconds, topology: new TemporalSocialTopology({ windowSeconds }), lastSnapshot: null,
      lastEventCount: 0, timelineEventCounts: {}, previousEdgeKeys: new Set(),
      jaccardSum: 0, jaccardCount: 0, emptyUnionTicks: 0, emptyGraphTicks: 0, topologyTicks: 0,
      componentCounts: [], largestRatios: [], persistentConnectorIds: new Set() })) })) : [];
  const rawEvents = { schemaVersion: 1, seed, graphEnabled: enabled, contacts: [], births: [], lifecycle: [],
    graph: [], topology: [] };
  const summaryGraph = [], checkpoints = [], tickDigestRows = [], correlationRows = [];
  const finalHashes = Object.fromEntries(HASH_FIELDS.map(name => [name, createHash('sha256')]));
  const writer = enabled ? await openGzipWriter(resolve(output, `seed${seed}-trajectory.f64.gz`)) : null;
  const timelineWriter = enabled ? await openGzipWriter(resolve(output, `seed${seed}-on-timeline.json.gz`)) : null;
  const ids = new Map(), active = new Set();
  const trajectoryHasher = createHash('sha256');
  let pendingContacts = [], pendingBirths = [], pendingLifecycle = [];
  controller.subscribe(event => {
    if (event.type === 'foot-contact') pendingContacts.push(event.payload);
    if (event.type === 'plate-birth' || event.type === 'sphere-birth') pendingBirths.push({ type: event.type, payload: event.payload });
  });
  await controller.init();
  const defaults = controller.getState();
  const materialHash0 = hashMaterial(controller);
  const header = trajectoryHeader();
  if (writer) await writer.write(header);
  trajectoryHasher.update(header);
  const frame0 = trajectoryFrame(0, controller.agents, ids);
  pendingLifecycle = lifecycleDelta(active, new Set(frame0.agents.map(agent => agent.id)), 0, new Map(), controller.agents);
  rawEvents.lifecycle.push(...pendingLifecycle);
  await recordFrame(frame0, controller, 0, null, true);
  const initialGraphs = enabled ? await observeGraphs(graphs, 0, controller.agents) : null;
  const totalTicks = seconds * 60;
  try {
    for (let tick = 1; tick <= totalTicks; tick += 1) {
      const before = new Map(controller.agents.map(agent => [agent.id, agent]));
      controller.tick(DT);
      const timeSeconds = controller.simulationTimeMs / 1000;
      const frame = trajectoryFrame(timeSeconds, controller.agents, ids);
      const nextIds = new Set(frame.agents.map(agent => agent.id));
      pendingLifecycle = lifecycleDelta(active, nextIds, timeSeconds, before, controller.agents);
      rawEvents.lifecycle.push(...pendingLifecycle);
      await recordFrame(frame, controller, tick, timeSeconds, tick % 60 === 0);
      if (enabled) {
        const updates = await observeGraphs(graphs, timeSeconds, controller.agents, tick % TOPOLOGY_EVERY_TICKS === 0);
      }
      if (tick % 60 === 0) {
        const second = tick / 60;
        const snapshot = controller.getSnapshot();
        const density = densityMetrics(controller.agents);
        const instant = enabled ? graphs.map(({ distanceMultiplier, graph }, index) => ({
          distanceMultiplier, population: controller.agents.length,
          edgeCount: graph.getSnapshot(0).activeEncounterCount,
          edgeDensity: ratio(graph.getSnapshot(0).activeEncounterCount, choose2(controller.agents.length)),
          meanNeighborsCloseRange: density.meanNeighborsCloseRange,
          meanNeighborsSenseRadius: density.meanNeighborsSenseRadius,
          occupancy: density.occupancy,
          persistentConnectorDensity: graphs[index].topologies.map(state => ({
            windowSeconds: state.windowSeconds, ...connectorDensity(state, controller.agents)
          }))
        })) : [];
        const timelineRow = { seconds: second, population: controller.agents.length, instant,
          topologies: enabled ? graphTopologyRows(graphs, true) : [] };
        if (timelineWriter) await timelineWriter.write(`${JSON.stringify(timelineRow)}\n`);
        if (enabled) correlationRows.push(timelineRow);
        if (CHECKPOINT_SET.has(second)) checkpoints.push({ seconds: second, tick, population: controller.agents.length,
          totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
          totalFootContacts: controller.surfaceField.totalFootContacts,
          instantaneous: instant.map(({ distanceMultiplier, population, edgeCount, edgeDensity }) => ({
            distanceMultiplier, population, edgeCount, edgeDensity })), topologies: enabled ? graphTopologyRows(graphs) : [] });
      }
      if (tick % 600 === 0) console.log(JSON.stringify({ seed, mode: enabled ? 'on' : 'off', seconds: timeSeconds,
        wallSeconds: (performance.now() - started) / 1000, population: controller.agents.length }));
    }
    // Checkpoints are retained before finish() marks open histories right-censored.
    if (enabled) {
      for (const { graph, topologies } of graphs) {
        for (const { topology } of topologies) topology.finish();
        graph.finish();
      }
      for (const item of graphs) {
        const graphEvents = item.graph.getEvents();
        const encounters = item.graph.getEncounters();
        rawEvents.graph.push({ distanceMultiplier: item.distanceMultiplier, events: graphEvents, encounters });
        const graphSummary = { distanceMultiplier: item.distanceMultiplier, events: graphEvents.length,
          encounters: encounters.length, intervalCount: encounters.length,
          rightCensored: encounters.filter(encounter => encounter.endReason === 'right-censored').length,
          exactEnds: encounters.filter(encounter => encounter.endReason !== 'right-censored').length,
          topologies: [] };
        item.topologies.forEach(state => {
          const { windowSeconds, topology } = state;
          const events = topology.getEvents(), lifetimes = topology.getEdgeLifetimes();
          rawEvents.topology.push({ distanceMultiplier: item.distanceMultiplier, windowSeconds, events, edgeLifetimes: lifetimes });
          graphSummary.topologies.push({ windowSeconds, stability: topologyStability(state), eventCounts: countEventTypes(events),
            rawEncounterLifetimes: durationSummary(encounters, item => item.endReason === 'right-censored'),
            windowEdgeLifetimes: durationSummary(lifetimes, item => item.rightCensored)
          });
        });
        summaryGraph.push(graphSummary);
      }
    }
    const finalFrame = trajectoryFrame(seconds, controller.agents, ids);
    const hashes = finalHashValues(finalHashes);
    const provenance = { seed, graphEnabled: enabled, state: defaults, stateSha256: sha256(JSON.stringify(defaults)),
      controllerSha256: sha256(await readFile(resolve(root, 'src/lib/agents/ant/AntController.js'))),
      rngState, rngCalls, simulationTimeMs: controller.simulationTimeMs,
      audio: 'AudioBridge absent; controller snapshot reports disabled.',
      fieldDimensions: { chemical: [controller.field.width, controller.field.height], surface: [controller.surfaceField.width, controller.surfaceField.height] },
      initialMaterialHash: materialHash0, frameCount: tickDigestRows.length,
      tickCount: seconds * 60, wallSeconds: (performance.now() - started) / 1000,
      idDictionary: [...ids.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id) };
    const summaryCorrelations = enabled ? summarizeCorrelations(correlationRows) : [];
    if (writer) await writer.close();
    if (timelineWriter) await timelineWriter.close();
    if (enabled) {
      const file = resolve(output, `seed${seed}-on-raw-events.json.gz`);
      await writeFile(file, gzipJson(rawEvents));
    }
    return { seed, graphEnabled: enabled, trajectoryHash: trajectoryHasher.digest('hex'),
      finalHashes: hashes, tickDigestRows, activeAgentsAtEnd: finalFrame.agents.length,
      provenance, checkpoints, graphSummary: summaryGraph, correlations: summaryCorrelations };
  } finally {
    if (writer) await writer.close().catch(() => {});
    if (timelineWriter) await timelineWriter.close().catch(() => {});
    await controller.destroy();
  }

  async function recordFrame(frame, controller, tick, timeSeconds, materialDue) {
    const binary = encodeFrame(frame, ids);
    if (writer) await writer.write(binary);
    trajectoryHasher.update(binary);
    const agentsBytes = Buffer.from(JSON.stringify(controller.agents.slice().sort((a, b) => compareIds(a.id, b.id)).map(fullState)) + '\n');
    const digests = {
      agents: digestBuffer(agentsBytes),
      rng: digestBuffer(Buffer.from(`${rngState},${rngCalls}\n`)),
      chemical: digestBuffer(floatBytes(controller.field.values)),
      surface: digestBuffer(floatBytes(controller.surfaceField.values)),
      contacts: digestBuffer(Buffer.from(JSON.stringify(pendingContacts) + '\n')),
      births: digestBuffer(Buffer.from(JSON.stringify(pendingBirths) + '\n')),
      lifecycle: digestBuffer(Buffer.from(JSON.stringify(pendingLifecycle) + '\n')),
      material: materialDue ? digestBuffer(Buffer.from(hashMaterial(controller) + '\n')) : Buffer.alloc(32)
    };
    const row = Buffer.concat(HASH_FIELDS.map(name => digests[name]));
    for (const name of HASH_FIELDS) finalHashes[name].update(digests[name]);
    tickDigestRows.push(row);
    if (pendingContacts.length) rawEvents.contacts.push(...pendingContacts);
    if (pendingBirths.length) rawEvents.births.push(...pendingBirths);
    pendingContacts = []; pendingBirths = []; pendingLifecycle = [];
    active.clear(); for (const agent of frame.agents) active.add(agent.id);
    return row;
  }
}

function trajectoryFrame(timeSeconds, agents, idMap) {
  const sorted = [...agents].sort((a, b) => compareIds(a.id, b.id));
  for (const agent of sorted) if (!idMap.has(agent.id)) idMap.set(agent.id, idMap.size);
  return { timeSeconds, agents: sorted.map(agent => ({ id: agent.id, idIndex: idMap.get(agent.id), x: agent.x, y: agent.y,
    vx: agent.vx, vy: agent.vy, heading: agent.heading, radius: agent.radius })) };
}

export function encodeFrame(frame) {
  const recordBytes = 4 + 6 * 8;
  const buffer = Buffer.allocUnsafe(12 + frame.agents.length * recordBytes);
  buffer.writeDoubleLE(frame.timeSeconds, 0); buffer.writeUInt32LE(frame.agents.length, 8);
  let offset = 12;
  for (const agent of frame.agents) {
    buffer.writeUInt32LE(agent.idIndex, offset); offset += 4;
    for (const value of [agent.x, agent.y, agent.vx, agent.vy, agent.heading, agent.radius]) {
      buffer.writeDoubleLE(value, offset); offset += 8;
    }
  }
  return buffer;
}

export function decodeFrame(buffer, idStrings) {
  const timeSeconds = buffer.readDoubleLE(0), count = buffer.readUInt32LE(8), agents = [];
  assert.equal(buffer.length, 12 + count * 52);
  let offset = 12;
  for (let i = 0; i < count; i += 1) {
    const idIndex = buffer.readUInt32LE(offset); offset += 4;
    const values = Array.from({ length: 6 }, () => { const value = buffer.readDoubleLE(offset); offset += 8; return value; });
    agents.push({ id: idStrings[idIndex], idIndex, x: values[0], y: values[1], vx: values[2], vy: values[3], heading: values[4], radius: values[5] });
  }
  return { timeSeconds, agents };
}

function fullState(agent) {
  return { id: agent.id, x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy, heading: agent.heading,
    angularVelocity: agent.angularVelocity, radius: agent.radius, personality: agent.personality,
    targetSpeed: agent.targetSpeed, speedPhase: agent.speedPhase, speedCycle: agent.speedCycle,
    hesitationRemaining: agent.hesitationRemaining, inspectionRemaining: agent.inspectionRemaining,
    decisionRemaining: agent.decisionRemaining, intentHeading: agent.intentHeading,
    trailConfidence: agent.trailConfidence, trailAdherence: agent.trailAdherence,
    committedRemaining: agent.committedRemaining };
}

function lifecycleDelta(previous, next, timeSeconds, before, after) {
  const events = [];
  for (const id of [...next].filter(id => !previous.has(id)).sort(compareIds)) events.push({ type: 'NODE_ENTER', timeSeconds, antId: id });
  for (const id of [...previous].filter(id => !next.has(id)).sort(compareIds)) {
    const agent = before.get(id), outOfBounds = agent && (agent.x < 0 || agent.x > 1 || agent.y < 0 || agent.y > 1);
    events.push({ type: 'NODE_EXIT', timeSeconds, antId: id, reason: outOfBounds ? 'out-of-bounds' : 'retired' });
  }
  return events;
}

async function observeGraphs(graphs, timeSeconds, agents, topologyDue = true) {
  const antStates = agents.map(({ id, x, y, radius }) => ({ id, x, y, radius }));
  const all = [];
  for (const item of graphs) {
    item.graph.observe(timeSeconds, antStates);
    if (!topologyDue && timeSeconds !== 0) continue;
    const updates = [];
    for (const topologyState of item.topologies) {
      const { windowSeconds, topology } = topologyState;
      topology.observe(item.graph.getSnapshot(windowSeconds));
      const snapshot = topology.getSnapshot();
      topologyState.lastSnapshot = snapshot;
      updateStabilityState(topologyState, snapshot, topology);
      updates.push({ windowSeconds, snapshot });
    }
    all.push({ distanceMultiplier: item.distanceMultiplier, updates });
  }
  return all.length ? all : null;
}

function graphTopologyRows(graphs, drainEvents = false) {
  return graphs.flatMap(({ distanceMultiplier, topologies }) => topologies.map(state => {
    const eventsSinceLastSecond = { ...state.timelineEventCounts };
    if (drainEvents) state.timelineEventCounts = {};
    return { distanceMultiplier, windowSeconds: state.windowSeconds, topology: state.lastSnapshot,
      stability: topologyStability(state), eventsSinceLastSecond };
  }));
}

function updateStabilityState(state, snapshot, topology) {
  const events = topology.getEvents();
  for (const event of events.slice(state.lastEventCount)) {
    state.timelineEventCounts[event.type] = (state.timelineEventCounts[event.type] || 0) + 1;
    if (event.type === 'CONNECTOR_PERSIST') state.persistentConnectorIds.add(event.antId);
    if (event.type === 'CONNECTOR_END') state.persistentConnectorIds.delete(event.antId);
  }
  state.lastEventCount = events.length;
  const nextKeys = new Set(snapshot.edges.map(edge => edge.key));
  if (!nextKeys.size) state.emptyGraphTicks += 1;
  const union = new Set([...state.previousEdgeKeys, ...nextKeys]);
  if (!union.size) state.emptyUnionTicks += 1;
  else {
    let intersection = 0;
    for (const key of nextKeys) if (state.previousEdgeKeys.has(key)) intersection += 1;
    state.jaccardSum += intersection / union.size;
    state.jaccardCount += 1;
  }
  state.previousEdgeKeys = nextKeys;
  state.topologyTicks += 1;
  state.componentCounts.push(snapshot.metrics.componentCount);
  state.largestRatios.push(snapshot.metrics.largestComponentRatio);
}

function topologyStability(state) {
  const range = values => values.length ? { minimum: Math.min(...values), maximum: Math.max(...values) } : null;
  return { adjacent20HzEdgeJaccardMean: state.jaccardCount ? state.jaccardSum / state.jaccardCount : null,
    comparableAdjacentTransitions: state.jaccardCount,
    emptyGraphFraction: state.topologyTicks ? state.emptyGraphTicks / state.topologyTicks : null,
    emptyAdjacentUnionCount: state.emptyUnionTicks,
    componentCountRange: range(state.componentCounts), largestComponentRatioRange: range(state.largestRatios),
    persistentConnectorCount: state.persistentConnectorIds.size };
}

function countEventTypes(events) {
  return events.reduce((counts, event) => { counts[event.type] = (counts[event.type] || 0) + 1; return counts; }, {});
}

function durationSummary(items, censored) {
  const completed = items.filter(item => !censored(item)).map(item => item.durationSeconds).sort((a, b) => a - b);
  const rightCensored = items.filter(censored);
  const quantile = p => completed.length ? completed[Math.floor((completed.length - 1) * p)] : null;
  return { count: items.length, completedCount: completed.length, meanCompletedSeconds: mean(completed),
    p10CompletedSeconds: quantile(0.1), p50CompletedSeconds: quantile(0.5), p90CompletedSeconds: quantile(0.9),
    rightCensoredCount: rightCensored.length,
    rightCensoredElapsedSeconds: sum(rightCensored, item => item.durationSeconds) };
}

function summarizeCorrelations(rows) {
  const result = [];
  for (const { distanceMultiplier } of rows[0]?.instant || []) for (const windowSeconds of WINDOWS) {
    const samples = rows.map(row => ({
      population: row.population,
      instantaneousPairCount: row.instant.find(item => item.distanceMultiplier === distanceMultiplier)?.edgeCount,
      topology: row.topologies.find(item => item.distanceMultiplier === distanceMultiplier
        && item.windowSeconds === windowSeconds)
    })).filter(sample => sample.topology?.topology?.metrics);
    const values = key => samples.map(sample => sample[key]);
    const metric = key => samples.map(sample => sample.topology.topology.metrics[key]);
    const event = type => samples.map(sample => sample.topology.eventsSinceLastSecond[type] || 0);
    result.push({ distanceMultiplier, windowSeconds, sampleCount: samples.length,
      correlations: {
        componentCountVsInstantaneousPairCount: pearson(metric('componentCount'), values('instantaneousPairCount')),
        largestComponentRatioVsInstantaneousPairCount: pearson(metric('largestComponentRatio'), values('instantaneousPairCount')),
        componentCountVsPopulation: pearson(metric('componentCount'), values('population')),
        largestComponentRatioVsPopulation: pearson(metric('largestComponentRatio'), values('population')),
        componentMergeEventsVsInstantaneousPairCount: pearson(event('COMPONENT_MERGE'), values('instantaneousPairCount')),
        componentSplitEventsVsInstantaneousPairCount: pearson(event('COMPONENT_SPLIT'), values('instantaneousPairCount'))
      } });
  }
  return result;
}

function pearson(xs, ys) {
  if (xs.length < 2 || ys.length !== xs.length) return null;
  const mx = mean(xs), my = mean(ys);
  const covariance = xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i] - my), 0);
  const vx = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
  const vy = ys.reduce((sum, y) => sum + (y - my) ** 2, 0);
  return vx && vy ? covariance / Math.sqrt(vx * vy) : null;
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function sum(values, select) { return values.reduce((total, value) => total + select(value), 0); }

export function trajectoryHeader() {
  const header = Buffer.alloc(20);
  Buffer.from('ANTTRJ01').copy(header, 0);
  header.writeUInt32LE(1, 8);
  header.writeUInt32LE(60, 12);
  header.writeUInt32LE(52, 16);
  return header;
}

function densityMetrics(agents) {
  let closeTotal = 0, senseTotal = 0;
  const counts = new Uint32Array(OCCUPANCY_SIZE ** 2);
  for (const agent of agents) {
    const x = Math.min(OCCUPANCY_SIZE - 1, Math.max(0, Math.floor(agent.x * OCCUPANCY_SIZE)));
    const y = Math.min(OCCUPANCY_SIZE - 1, Math.max(0, Math.floor(agent.y * OCCUPANCY_SIZE)));
    counts[y * OCCUPANCY_SIZE + x] += 1;
  }
  for (let i = 0; i < agents.length; i += 1) for (let j = i + 1; j < agents.length; j += 1) {
    const distance = Math.hypot(agents[i].x - agents[j].x, agents[i].y - agents[j].y);
    if (distance < CLOSE_RANGE) closeTotal += 2;
    if (distance < SENSE_RADIUS) senseTotal += 2;
  }
  const total = agents.length, sorted = [...counts].sort((a, b) => b - a);
  const entropy = counts.reduce((sum, count) => count ? sum - (count / total) * Math.log(count / total) : sum, 0);
  return { meanNeighborsCloseRange: total ? closeTotal / total : 0, meanNeighborsSenseRadius: total ? senseTotal / total : 0,
    occupancy: { grid: OCCUPANCY_SIZE, cellWidth: 1 / OCCUPANCY_SIZE,
      normalizedEntropy: total > 1 ? entropy / Math.log(counts.length) : 0,
      top10PercentAntShare: total ? sorted.slice(0, Math.ceil(counts.length * 0.1)).reduce((sum, value) => sum + value, 0) / total : 0 } };
}

function connectorDensity(state, agents) {
  const ids = state.persistentConnectorIds;
  const nodes = agents.filter(agent => ids.has(agent.id));
  const meanWithin = radius => nodes.length ? nodes.reduce((sum, agent) => sum + agents.reduce((count, other) =>
    count + (other.id !== agent.id && Math.hypot(other.x - agent.x, other.y - agent.y) < radius ? 1 : 0), 0), 0) / nodes.length : null;
  return { connectorCount: nodes.length, meanNeighborsCloseRange: meanWithin(CLOSE_RANGE), meanNeighborsSenseRadius: meanWithin(SENSE_RADIUS) };
}

function compareDigests(offRows, onRows) {
  assert.equal(offRows.length, onRows.length, 'paired runs have equal tick count');
  const firstMismatch = Object.fromEntries(HASH_FIELDS.map(name => [name, null]));
  for (let tick = 0; tick < offRows.length; tick += 1) for (let field = 0; field < HASH_FIELDS.length; field += 1) {
    const offset = field * 32;
    if (!offRows[tick].subarray(offset, offset + 32).equals(onRows[tick].subarray(offset, offset + 32))
      && firstMismatch[HASH_FIELDS[field]] === null) firstMismatch[HASH_FIELDS[field]] = tick;
  }
  return { firstMismatch };
}

function finalHashValues(hashes) { return Object.fromEntries(Object.entries(hashes).map(([key, value]) => [key, value.digest('hex')])); }
function hashMaterial(controller) { return sha256(Buffer.from(JSON.stringify(controller.materialStratigraphy.getSnapshot()))); }
function floatBytes(values) { return Buffer.from(values.buffer, values.byteOffset, values.byteLength); }
function digestBuffer(buffer) { return createHash('sha256').update(buffer).digest(); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function gzipJson(value) { return gzipSync(Buffer.from(JSON.stringify(value))); }
function choose2(count) { return count * (count - 1) / 2; }
function ratio(numerator, denominator) { return denominator ? numerator / denominator : 0; }
function compareIds(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

async function openGzipWriter(path) {
  const stream = createWriteStream(path), gzip = createGzip();
  const done = finished(stream);
  gzip.pipe(stream);
  return { write: async value => { if (!gzip.write(value)) await once(gzip, 'drain'); },
    close: async () => { if (!gzip.destroyed && !gzip.writableEnded) gzip.end(); await done; } };
}

function selfcheck() {
  const strings = ['ant-1', 'ant-2'];
  const ids = new Map(strings.map((id, index) => [id, index]));
  const input = { timeSeconds: 0.125, agents: [{ id: 'ant-1', idIndex: 0, x: 0.25, y: 0.5, vx: -0.1, vy: 0.2, heading: -Math.PI, radius: 0.006 }] };
  const output = decodeFrame(encodeFrame(input), strings);
  assert.equal(output.timeSeconds, input.timeSeconds);
  assert.deepEqual(output.agents, input.agents);
  assert.equal(ids.size, 2);
  assert.equal(metricBin(0.2, 0, 1, 5), 1);
  assert.equal(metricBin(1, 0, 1, 5), 4);
  assert.equal(metricBin(-1, 0, 1, 5), 0);
  assert.equal(metricBin(0.5, 0, 1, 8), 4);
  console.log('ANT social evidence binary roundtrip and metric bin selfcheck passed.');
}

function metricBin(value, minimum, maximum, bins) {
  return Math.max(0, Math.min(bins - 1, Math.floor((value - minimum) / (maximum - minimum) * bins)));
}

async function verifyArchive() {
  const manifest = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
  const { DynamicSocialGraph } = await import('../src/lib/agents/ant/DynamicSocialGraph.js');
  const { TemporalSocialTopology } = await import('../src/lib/agents/ant/TemporalSocialTopology.js');
  const graphSource = await readFile(resolve(root, 'src/lib/agents/ant/DynamicSocialGraph.js'));
  assert.equal(sha256(graphSource), manifest.sourceHashes['src/lib/agents/ant/DynamicSocialGraph.js'],
    'Replay requires the recorded graph source revision');
  assert.equal(sha256(await readFile(resolve(root, 'src/lib/agents/ant/TemporalSocialTopology.js'))),
    manifest.sourceHashes['src/lib/agents/ant/TemporalSocialTopology.js'],
    'Replay requires the recorded topology source revision');
  const verified = [];
  for (const files of manifest.files) {
    const summary = JSON.parse(await readFile(resolve(output, files.summary), 'utf8'));
    const raw = JSON.parse(gunzipSync(await readFile(resolve(output, files.rawEvents))));
    const timeline = gunzipSync(await readFile(resolve(output, files.timeline))).toString('utf8')
      .trim().split('\n').map(line => JSON.parse(line));
    assert.equal(timeline.length, manifest.seconds);
    const trajectory = gunzipSync(await readFile(resolve(output, files.trajectory)));
    const hashes = gunzipSync(await readFile(resolve(output, files.tickHashes)));
    assert.deepEqual(trajectory.subarray(0, 20), trajectoryHeader());
    assert.equal(sha256(trajectory), summary.trajectory.enabledHash);
    assert.equal(summary.trajectory.enabledHash, summary.trajectory.disabledHash);
    const ids = summary.runs.on.idDictionary;
    assert.equal(new Set(ids).size, ids.length, 'Stable ID dictionary contains no duplicates');
    const graphs = MULTIPLIERS.map(distanceMultiplier => new DynamicSocialGraph({ distanceMultiplier }));
    const topologies = graphs.map(() => WINDOWS.map(windowSeconds => new TemporalSocialTopology({ windowSeconds })));
    let offset = 20, frames = 0, finalTime = 0;
    while (offset < trajectory.length) {
      const bytes = 12 + trajectory.readUInt32LE(offset + 8) * 52;
      const frame = decodeFrame(trajectory.subarray(offset, offset + bytes), ids);
      assert.ok(frame.agents.every(ant => typeof ant.id === 'string'
        && [ant.x, ant.y, ant.vx, ant.vy, ant.heading, ant.radius].every(Number.isFinite)));
      assert.ok(frame.timeSeconds >= finalTime);
      for (const graph of graphs) graph.observe(frame.timeSeconds, frame.agents);
      if (frames % TOPOLOGY_EVERY_TICKS === 0) graphs.forEach((graph, index) =>
        topologies[index].forEach(topology => topology.observe(graph.getSnapshot(topology.windowSeconds))));
      if (frames > 0 && frames % 60 === 0) {
        for (const saved of timeline[frames / 60 - 1].topologies) {
          const replayed = topologies[MULTIPLIERS.indexOf(saved.distanceMultiplier)]
            [WINDOWS.indexOf(saved.windowSeconds)].getSnapshot();
          assert.deepEqual(replayed, saved.topology, 'Every saved 1 Hz S1 snapshot reconstructs');
        }
      }
      const checkpoint = summary.checkpoints.find(item => item.tick === frames);
      if (checkpoint) {
        for (const saved of checkpoint.topologies) {
          const snapshot = graphs[MULTIPLIERS.indexOf(saved.distanceMultiplier)].getSnapshot(saved.windowSeconds);
          assert.deepEqual(snapshot.nodes, saved.topology.nodes);
          assert.deepEqual(snapshot.edges, saved.topology.edges);
          assert.deepEqual(componentMembers(snapshot.nodes, snapshot.edges),
            saved.topology.components.map(component => component.members));
        }
      }
      finalTime = frame.timeSeconds;
      offset += bytes;
      frames += 1;
    }
    assert.equal(offset, trajectory.length);
    assert.equal(frames, manifest.seconds * 60 + 1, 'All fixed-tick frames including t=0 are present');
    assert.equal(hashes.length, frames * HASH_FIELDS.length * 32 * 2);
    for (let row = 0; row < frames; row += 1) {
      const start = row * 512;
      assert.ok(hashes.subarray(start, start + 256).equals(hashes.subarray(start + 256, start + 512)),
        `ON/OFF digests differ at tick ${row}`);
    }
    for (const [index, graph] of graphs.entries()) {
      graph.finish();
      const saved = raw.graph.find(item => item.distanceMultiplier === graph.distanceMultiplier);
      assert.deepEqual(graph.getEvents(), saved.events, 'Raw temporal events reconstruct from trajectories');
      assert.deepEqual(graph.getEncounters(), saved.encounters, 'Complete sampled encounter intervals reconstruct');
      for (const topology of topologies[index]) {
        topology.finish();
        const savedTopology = raw.topology.find(item => item.distanceMultiplier === graph.distanceMultiplier
          && item.windowSeconds === topology.windowSeconds);
        assert.deepEqual(topology.getEvents(), savedTopology.events, 'All S1 events reconstruct from trajectory samples');
        assert.deepEqual(topology.getEdgeLifetimes(), savedTopology.edgeLifetimes, 'Window-edge lifetimes reconstruct');
      }
    }
    verified.push({ seed: summary.seed, frames, finalTime, stableIds: ids.length,
      rawContactGroups: raw.contacts.length, rawFootPoints: raw.contacts.reduce((sum, event) => sum + event.contacts.length, 0),
      parity: true, encounterReplay: true, topologyEventAndLifetimeReplay: true,
      allTimelineTopologySnapshots: true, checkpointEdgesAndComponents: true });
  }
  await writeFile(resolve(output, 'archive-verification.json'), `${JSON.stringify(verified, null, 2)}\n`);
  console.log(JSON.stringify(verified));
}

// Independent breadth-first component oracle checks the saved DFS topology at checkpoints.
function componentMembers(nodes, edges) {
  const adjacent = new Map(nodes.map(node => [node.id, []]));
  for (const { antA, antB } of edges) {
    adjacent.get(antA).push(antB);
    adjacent.get(antB).push(antA);
  }
  const unseen = new Set([...adjacent.keys()].sort(compareIds)), components = [];
  while (unseen.size) {
    const queue = [unseen.values().next().value], members = [];
    unseen.delete(queue[0]);
    for (const id of queue) {
      members.push(id);
      for (const neighbor of adjacent.get(id)) if (unseen.delete(neighbor)) queue.push(neighbor);
    }
    components.push(members.sort(compareIds));
  }
  return components;
}
