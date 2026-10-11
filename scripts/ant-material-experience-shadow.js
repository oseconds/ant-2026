import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DT = 1 / 60;
const FIELDS = ['agentTrajectory', 'lifecycle', 'rng', 'pheromone', 'surfaceField', 'gait', 'bodyPose',
  'gasterDeposition', 'colonyActivation', 'localOccupancy', 'footContacts', 'materialBirthEvents',
  'trailPlateBirth', 'materialStratigraphy'];
const SOURCE_PATHS = ['AGENTS.md', 'docs/ant/README.md', 'docs/ant/world-model.md',
  'scripts/ant-morphology-replay.js', 'tests/ant-social-invariance.test.js',
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/GaitController.js',
  'src/lib/agents/ant/BodyPoseController.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/ColonyActivation.js'];
const CLI = new Map(process.argv.slice(2).map(arg => {
  const i = arg.indexOf('=');
  return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
}));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export function createMaterialExperienceObserver({ dtSeconds = DT } = {}) {
  assert.ok(Number.isFinite(dtSeconds) && dtSeconds > 0);
  const ants = new Map(), bins = new Map();
  let samples = 0, lastTimeMs = null, endTimeMs = null, finished = false;
  return Object.freeze({
    observe({ simulationTimeMs, agents, stratigraphySnapshot }) {
      assert.ok(!finished && Number.isFinite(simulationTimeMs) && simulationTimeMs >= 0);
      assert.ok(Array.isArray(agents));
      if (lastTimeMs !== null) assert.ok(Math.abs(simulationTimeMs - lastTimeMs - dtSeconds * 1000) <= 1e-6,
        'samples must follow fixed ticks');
      const live = new Set();
      let exposed = 0;
      for (const agent of agents) {
        assert.ok(agent && typeof agent.id === 'string' && Number.isFinite(agent.x) && Number.isFinite(agent.y));
        assert.ok(!live.has(agent.id), 'duplicate agent id in sample');
        live.add(agent.id);
        let ant = ants.get(agent.id);
        if (!ant) { ant = makeAnt(agent.id, simulationTimeMs); ants.set(agent.id, ant); }
        assert.ok(ant.active, 'retired ant id reappeared');
        ant.activeTicks += 1;
        const material = materialAt(stratigraphySnapshot, agent.x, agent.y);
        if (!material) {
          closeEpisode(ant, simulationTimeMs, false, dtSeconds);
          ant.lastTopId = null;
          continue;
        }
        exposed += 1;
        ant.exposureTicks += 1;
        ant.layerTicks[material.layerCount] = (ant.layerTicks[material.layerCount] || 0) + 1;
        if (material.bornAtSimulationTimeMs <= ant.firstObservedTimeMs + 1e-9) ant.preEntryTicks += 1;
        if (!ant.currentEpisode) ant.currentEpisode = { startTimeSeconds: simulationTimeMs / 1000,
          ticks: 0, topIds: new Set(), layerTicks: {} };
        const episode = ant.currentEpisode;
        episode.ticks += 1;
        episode.topIds.add(material.id);
        episode.layerTicks[material.layerCount] = (episode.layerTicks[material.layerCount] || 0) + 1;
        if (ant.lastTopId !== material.id) {
          ant.topPlateBouts += 1;
          if (ant.seenTopIds.has(material.id)) ant.repeatTopPlateBouts += 1;
          ant.seenTopIds.add(material.id);
          ant.lastTopId = material.id;
        }
      }
      for (const ant of ants.values()) if (ant.active && !live.has(ant.id)) {
        closeEpisode(ant, simulationTimeMs, false, dtSeconds);
        ant.active = false;
        ant.retiredAtTimeSeconds = simulationTimeMs / 1000;
        ant.lastTopId = null;
      }
      const second = Math.floor((simulationTimeMs + 1e-6) / 1000);
      let bin = bins.get(second);
      if (!bin) { bin = { second, samples: 0, activeSamples: 0, population: 0, exposed: 0, share: 0 }; bins.set(second, bin); }
      bin.samples += 1;
      bin.population += agents.length;
      bin.exposed += exposed;
      if (agents.length) { bin.activeSamples += 1; bin.share += exposed / agents.length; }
      samples += 1;
      lastTimeMs = simulationTimeMs;
    },
    finish(horizonMs) {
      assert.ok(!finished && Number.isFinite(horizonMs) && horizonMs >= 0);
      if (lastTimeMs !== null) assert.ok(Math.abs(horizonMs - lastTimeMs - dtSeconds * 1000) <= 1e-6,
        'horizon must close the final sampled tick');
      for (const ant of ants.values()) closeEpisode(ant, horizonMs, ant.active, dtSeconds);
      endTimeMs = horizonMs;
      finished = true;
    },
    summarize() {
      assert.ok(finished, 'finish before summarize');
      const antRows = [...ants.values()].sort((a, b) => a.id.localeCompare(b.id)).map(ant => ({
        id: ant.id, firstObservedTimeSeconds: ant.firstObservedTimeMs / 1000,
        retiredAtTimeSeconds: ant.retiredAtTimeSeconds,
        activeTimeSeconds: ant.activeTicks * dtSeconds, exposureSeconds: ant.exposureTicks * dtSeconds,
        exposureFraction: ant.activeTicks ? ant.exposureTicks / ant.activeTicks : null,
        episodeCount: ant.episodes.length, repeatedExposureEpisodes: ant.episodes.length > 1,
        topPlateBouts: ant.topPlateBouts, repeatTopPlateBouts: ant.repeatTopPlateBouts,
        distinctTopPlateCount: ant.seenTopIds.size, topPlateIds: [...ant.seenTopIds],
        preEntryExposureSeconds: ant.preEntryTicks * dtSeconds,
        layerCountTicks: sortedCounts(ant.layerTicks), episodes: ant.episodes
      }));
      const episodes = antRows.flatMap(ant => ant.episodes);
      const activeTicks = sum([...ants.values()].map(ant => ant.activeTicks));
      const exposureTicks = sum([...ants.values()].map(ant => ant.exposureTicks));
      const preEntryTicks = sum([...ants.values()].map(ant => ant.preEntryTicks));
      const layerTicks = {};
      for (const ant of ants.values()) for (const [count, ticks] of Object.entries(ant.layerTicks))
        layerTicks[count] = (layerTicks[count] || 0) + ticks;
      const layerCountDistribution = Object.fromEntries(Object.entries(sortedCounts(layerTicks)).map(([count, ticks]) =>
        [count, { ticks, exposureSeconds: ticks * dtSeconds,
          fractionOfExposureTicks: exposureTicks ? ticks / exposureTicks : 0 }]));
      const populationTimeline = [...bins.values()].sort((a, b) => a.second - b.second).map(bin => ({
        second: bin.second, samples: bin.samples, meanPopulation: bin.population / bin.samples,
        meanOnPlateAnts: bin.exposed / bin.samples,
        meanOnPlateFraction: bin.activeSamples ? bin.share / bin.activeSamples : null
      }));
      return {
        metrics: {
          sampleCount: samples, simulationSeconds: endTimeMs / 1000, activeAntCount: antRows.length,
          exposedAntCount: antRows.filter(ant => ant.exposureSeconds > 0).length,
          totalActiveAntTicks: activeTicks, totalExposureAntTicks: exposureTicks,
          activeAntTimeSeconds: activeTicks * dtSeconds, anyPlateExposureSeconds: exposureTicks * dtSeconds,
          anyPlateExposureFractionOfActiveTime: activeTicks ? exposureTicks / activeTicks : 0,
          antsWithRepeatedExposureEpisodes: antRows.filter(ant => ant.repeatedExposureEpisodes).length,
          antsWithRepeatedTopPlateEncounter: antRows.filter(ant => ant.repeatTopPlateBouts > 0).length,
          repeatedTopPlateBouts: sum(antRows.map(ant => ant.repeatTopPlateBouts)),
          uniqueTopPlateCount: new Set(antRows.flatMap(ant => ant.topPlateIds)).size,
          preEntryMaterialAntCount: antRows.filter(ant => ant.preEntryExposureSeconds > 0).length,
          preEntryExposureAntTicks: preEntryTicks, preEntryExposureSeconds: preEntryTicks * dtSeconds,
          episodeCount: episodes.length
        },
        episodeDurationDistribution: durationDistribution(episodes, dtSeconds),
        layerCountDistribution, ants: antRows, populationTimeline
      };
    }
  });
}

function makeAnt(id, firstObservedTimeMs) {
  return { id, firstObservedTimeMs, active: true, activeTicks: 0, exposureTicks: 0, preEntryTicks: 0,
    layerTicks: {}, episodes: [], currentEpisode: null, seenTopIds: new Set(), topPlateBouts: 0,
    repeatTopPlateBouts: 0, lastTopId: null, retiredAtTimeSeconds: null };
}
function closeEpisode(ant, endTimeMs, censored, dtSeconds) {
  if (!ant.currentEpisode) return;
  const e = ant.currentEpisode;
  ant.episodes.push({ index: ant.episodes.length + 1, startTimeSeconds: e.startTimeSeconds,
    endTimeSeconds: endTimeMs / 1000, durationSeconds: e.ticks * dtSeconds, sampledTicks: e.ticks,
    rightCensored: censored, topPlateIds: [...e.topIds], layerCountTicks: sortedCounts(e.layerTicks) });
  ant.currentEpisode = null;
}
function materialAt(snapshot, x, y) {
  assert.ok(snapshot && Number.isInteger(snapshot.width) && Number.isInteger(snapshot.height)
    && Array.isArray(snapshot.plates) && snapshot.stratigraphy, 'invalid public stratigraphy snapshot');
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  const s = snapshot.stratigraphy;
  assert.ok(ArrayBuffer.isView(s.topLayerByCell) && ArrayBuffer.isView(s.layerCountByCell),
    'snapshot lacks public top-layer or layer-count arrays');
  const cell = Math.round(y * (snapshot.height - 1)) * snapshot.width
    + Math.round(x * (snapshot.width - 1));
  const index = s.topLayerByCell[cell];
  if (index < 0) return null;
  const plate = snapshot.plates[index], count = s.layerCountByCell[cell];
  assert.ok(plate && typeof plate.id === 'string' && Number.isInteger(count) && count > 0);
  assert.ok(Number.isFinite(plate.bornAtSimulationTimeMs));
  if (s.layerOrder) assert.equal(s.layerOrder[index], plate.id);
  return { id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs, layerCount: count };
}
function sortedCounts(value) {
  return Object.fromEntries(Object.entries(value).sort((a, b) => Number(a[0]) - Number(b[0])));
}
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function durationDistribution(episodes, dtSeconds) {
  const values = episodes.map(e => e.sampledTicks * dtSeconds).sort((a, b) => a - b);
  if (!values.length) return { count: 0, rightCensoredCount: 0, minSeconds: null, medianSeconds: null,
    p90Seconds: null, p95Seconds: null, maxSeconds: null, meanSeconds: null };
  const middle = Math.floor(values.length / 2);
  return { count: values.length, rightCensoredCount: episodes.filter(e => e.rightCensored).length,
    minSeconds: values[0], medianSeconds: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
    p90Seconds: values[Math.max(0, Math.ceil(values.length * 0.9) - 1)],
    p95Seconds: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)], maxSeconds: values.at(-1),
    meanSeconds: sum(values) / values.length };
}
function rngFor(seed) {
  let state = seed >>> 0;
  const random = () => { random.calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  random.calls = 0;
  random.state = () => state;
  return random;
}

async function main() {
  const seeds = String(CLI.get('--seeds') || '20261005,20261006,20261007').split(',').map(Number);
  const seconds = Number(CLI.get('--seconds') || 600);
  const baselineRef = String(CLI.get('--baseline') || 'origin/main');
  const outputPath = String(CLI.get('--output') || 'docs/ant/evidence/2026-10-11-retained-material-experience-shadow');
  const out = resolve(ROOT, outputPath);
  assert.ok(seeds.length && seeds.every(n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff));
  assert.ok(Number.isInteger(seconds) && seconds > 0);
  const ticks = seconds * 60;
  assert.equal(ticks, seconds / DT, 'seconds must align to 60 Hz');
  await mkdir(out, { recursive: true });
  assert.equal((await readdir(out)).length, 0, 'output directory must be empty');
  const baselineCommit = git(['rev-parse', `${baselineRef}^{commit}`]);
  git(['merge-base', '--is-ancestor', baselineCommit, 'HEAD']);
  git(['diff', '--exit-code', baselineCommit, '--', 'src', 'package.json']);
  const { AntController } = await import(pathToFileURL(resolve(ROOT, 'src/lib/agents/ant/AntController.js')).href);
  const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, sha256(gitBytes(['show', `${baselineCommit}:${path}`]))])));
  const results = [];
  for (const seed of seeds) {
    const off = await run({ AntController, seed, seconds, ticks, observe: false });
    const on = await run({ AntController, seed, seconds, ticks, observe: true });
    const parity = compareRows(off.rows, on.rows, seed);
    if (parity.firstMismatch) {
      await writeJson(out, 'parity-failure-seed-' + seed + '.json', parity);
      throw new Error('parity mismatch at tick ' + parity.firstMismatch.tick + ', field ' + parity.firstMismatch.field);
    }
    results.push({ seed, off: off.run, on: on.run, parity, measurement: on.measurement });
    console.log(JSON.stringify({ seed, parity: 'exact', comparedTicks: parity.comparedTicks,
      exposureFraction: on.measurement.metrics.anyPlateExposureFractionOfActiveTime,
      wallSeconds: { off: off.run.wallSeconds, on: on.run.wallSeconds } }));
  }
  const populationRows = [], episodeRows = [];
  for (const r of results) {
    const prefix = 'seed-' + r.seed;
    await writeJson(out, prefix + '-summary.json', { seed: r.seed, off: r.off, on: r.on,
      metrics: r.measurement.metrics, episodeDurationDistribution: r.measurement.episodeDurationDistribution,
      layerCountDistribution: r.measurement.layerCountDistribution, parity: r.parity,
      antSummaryFile: prefix + '-ants.json' });
    await writeJson(out, prefix + '-ants.json', r.measurement.ants);
    for (const p of r.measurement.populationTimeline) populationRows.push({ seed: r.seed, ...p });
    for (const ant of r.measurement.ants) for (const ep of ant.episodes)
      episodeRows.push({ seed: r.seed, antId: ant.id, ...ep });
  }
  await writeJson(out, 'aggregate-summary.json', aggregateRuns(results));
  await writeJson(out, 'source-hashes.json', sourceHashes);
  await writeCsv(out, 'population-exposure-by-second.csv',
    ['seed', 'second', 'samples', 'meanPopulation', 'meanOnPlateAnts', 'meanOnPlateFraction'], populationRows);
  await writeCsv(out, 'episode-durations.csv',
    ['seed', 'antId', 'index', 'startTimeSeconds', 'endTimeSeconds', 'durationSeconds',
      'sampledTicks', 'rightCensored', 'topPlateIds'], episodeRows);
  const manifest = {
    schemaVersion: 1, baselineRef, baselineCommit, passBranch: git(['branch', '--show-current']),
    node: process.version, seeds, seconds, dtSeconds: DT, totalTicks: ticks, sourceHashes,
    conditions: 'Fresh AntController with materialLocomotionResistance=false; injected LCG matching the existing social and morphology replay harness; AudioBridge absent; no other state overrides.',
    observerTiming: 'At each 60 Hz boundary before AntController.tick, read live ant id/position and one MaterialStratigraphy.getSnapshot(). Only that pre-tick state describes the upcoming interval. Contacts, Plate births, nodule births and topology changes in a tick are visible at the next boundary.',
    entryTime: 'First pre-tick observation; current AntController advances material before spawning at tick end, so a new ant first appears at its creation-time boundary.',
    provenanceRule: 'Pre-entry means top Plate bornAtSimulationTimeMs is at or before the ant first-observed time. No age, depth or quality interpretation.',
    audio: 'AudioBridge absent; production audio source and semantics unchanged.',
    observerHash: sha256(await readFile(fileURLToPath(import.meta.url))),
    parity: 'Per-tick SHA-256 rows compare full agent JSON/lifecycle, RNG, pheromone, SurfaceField, gait, pose, deposition, activation, occupancy, exact contact/birth events, TrailPlateBirth and full MaterialStratigraphy instance state. Same-boundary hashes also verify observer calls leave state unchanged.',
    reproduction: `node scripts/ant-material-experience-shadow.js --baseline=${baselineCommit} --seeds=20261005,20261006,20261007 --seconds=600 --output=${outputPath}`,
    outputFiles: [...(await readdir(out)), 'manifest.json'].sort()
  };
  await writeJson(out, 'manifest.json', manifest);
}

async function run({ AntController, seed, seconds, ticks, observe }) {
  const start = performance.now(), random = rngFor(seed), controller = new AntController({ random,
    materialLocomotionResistance: false });
  const events = { contacts: [], plates: [], nodules: [], errors: [] };
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') events.contacts.push(structuredClone(payload));
    else if (type === 'plate-birth') events.plates.push(structuredClone(payload));
    else if (type === 'sphere-birth') events.nodules.push(structuredClone(payload));
    else if (type === 'error') events.errors.push(structuredClone(payload));
  });
  const materialHash = makeMaterialHasher(), birthHash = makeBirthHasher();
  const observer = observe ? createMaterialExperienceObserver({ dtSeconds: DT }) : null;
  const rows = [], totals = { footContactGroups: 0, footContactPoints: 0, plateBirths: 0, noduleBirths: 0 };
  let boundaryChecks = 0;
  await controller.init();
  try {
    rows.push(parityRow(controller, random, events, materialHash, birthHash));
    for (let tick = 0; tick < ticks; tick += 1) {
      if (observer) {
        observer.observe({ simulationTimeMs: controller.simulationTimeMs, agents: controller.agents,
          stratigraphySnapshot: controller.materialStratigraphy.getSnapshot() });
        assert.ok(parityRow(controller, random, events, materialHash, birthHash).equals(rows.at(-1)),
          'observer changed production state at pre-tick ' + tick);
        boundaryChecks += 1;
      }
      clearEvents(events);
      controller.tick(DT);
      rows.push(parityRow(controller, random, events, materialHash, birthHash));
      totals.footContactGroups += events.contacts.length;
      totals.footContactPoints += events.contacts.reduce((n, e) => n + e.contacts.length, 0);
      totals.plateBirths += events.plates.length;
      totals.noduleBirths += events.nodules.length;
      if ((tick + 1) % 3600 === 0) console.log(JSON.stringify({ seed, mode: observe ? 'ON' : 'OFF',
        seconds: (tick + 1) / 60, population: controller.agents.length,
        wallSeconds: (performance.now() - start) / 1000 }));
    }
    if (observer) observer.finish(seconds * 1000);
    return { rows, measurement: observer ? observer.summarize() : null,
      run: { seed, observer: observe ? 'ON' : 'OFF', seconds, ticks, initialState: controller.getState(),
        finalPopulation: controller.agents.length, totalSpawned: controller.totalSpawned,
        totalRetired: controller.totalRetired, rngState: random.state(), rngCalls: random.calls,
        simulationTimeMs: controller.simulationTimeMs, eventTotals: totals,
        readOnlyBoundaryChecks: boundaryChecks, wallSeconds: (performance.now() - start) / 1000 } };
  } finally { unsubscribe(); await controller.destroy(); }
}

function parityRow(c, random, events, materialHash, birthHash) {
  const lifecycle = { state: c.state, simulationTimeMs: c.simulationTimeMs, nextSpawnTimeMs: c.nextSpawnTimeMs,
    nextAgentId: c.nextAgentId, totalSpawned: c.totalSpawned, totalRetired: c.totalRetired,
    accumulatorMs: c.accumulatorMs, initialized: c.initialized, running: c.running };
  const value = {
    agentTrajectory: JSON.stringify(c.agents), lifecycle, rng: { state: random.state(), calls: random.calls },
    pheromone: c.field, surfaceField: c.surfaceField, gait: c.gaitController.ants,
    bodyPose: c.bodyPoseController.ants, gasterDeposition: c.gasterDeposition,
    colonyActivation: c.colonyActivation, localOccupancy: c.occupancy, footContacts: events.contacts,
    materialBirthEvents: { plates: events.plates, nodules: events.nodules, errors: events.errors },
    trailPlateBirth: birthHash(c.trailPlateBirth), materialStratigraphy: materialHash(c.materialStratigraphy)
  };
  return Buffer.concat(FIELDS.map(name => hashValue(value[name])));
}
function makeMaterialHasher() {
  const dynamic = new Set(['simulationTimeMs', 'lastAdvanceTimeMs', 'lastNoduleEvaluationTimeMs',
    'totalAcceptedFootContacts', 'rejectedFootContacts', 'qualifiedNoduleCandidateCount',
    'footLoadByCell', 'candidateSinceMs', '_plateHistory']);
  let key = null, structure = null;
  return m => {
    const revision = m.revision + ':' + m.noduleRevision;
    if (revision !== key) {
      const stable = {};
      for (const name of Object.keys(m).sort()) if (!dynamic.has(name)) stable[name] = m[name];
      structure = hashValue(stable);
      key = revision;
    }
    const changing = {};
    for (const name of [...dynamic].sort()) if (Object.hasOwn(m, name)) changing[name] = m[name];
    return hashValue({ structure, changing });
  };
}
function makeBirthHasher() {
  let key = null, descriptors = null;
  return b => {
    const counts = b.plates.length + ':' + b.birthRecords.length;
    if (counts !== key) { descriptors = hashValue({ plates: b.plates, birthRecords: b.birthRecords }); key = counts; }
    const c = b.candidate;
    const scalars = c ? { ...c, mask: undefined, supportedMask: undefined, component: undefined,
      skeletonIndices: undefined, path: undefined } : null;
    return hashValue({ descriptors, scalars, arrays: c ? [c.mask, c.supportedMask, c.component, c.path, c.skeletonIndices] : [],
      chemicalMemory: b.chemicalMemory, footContactCounts: b.footContactCounts,
      lastInputDiagnostics: b.lastInputDiagnostics, lastAnalysisTimeMs: b.lastAnalysisTimeMs,
      lastBirthTimeMs: b.lastBirthTimeMs });
  };
}
function compareRows(a, b, seed) {
  if (a.length !== b.length) return { seed, comparedTicks: Math.min(a.length, b.length),
    firstMismatch: { tick: null, field: 'rowCount' }, fields: {} };
  const chains = Object.fromEntries(FIELDS.map(name => [name,
    { off: createHash('sha256'), on: createHash('sha256'), match: true }]));
  let firstMismatch = null;
  for (let tick = 0; tick < a.length; tick += 1) for (let i = 0; i < FIELDS.length; i += 1) {
    const name = FIELDS[i], offset = i * 32, off = a[tick].subarray(offset, offset + 32),
      on = b[tick].subarray(offset, offset + 32);
    chains[name].off.update(off); chains[name].on.update(on);
    if (!off.equals(on)) {
      chains[name].match = false;
      if (!firstMismatch) firstMismatch = { tick, field: name, simulationTimeSeconds: tick / 60 };
    }
  }
  return { seed, comparedTicks: a.length, observerSamples: a.length - 1, readOnlyBoundaryChecks: a.length - 1,
    firstMismatch, fields: Object.fromEntries(FIELDS.map(name => [name, {
      baselineSha256: chains[name].off.digest('hex'), observerSha256: chains[name].on.digest('hex'),
      match: chains[name].match
    }])) };
}
function aggregateRuns(results) {
  const runs = results.map(item => item.measurement), ants = runs.flatMap(run => run.ants);
  const episodes = ants.flatMap(ant => ant.episodes);
  const active = sum(runs.map(run => run.metrics.totalActiveAntTicks));
  const exposure = sum(runs.map(run => run.metrics.totalExposureAntTicks));
  const pre = sum(runs.map(run => run.metrics.preEntryExposureAntTicks));
  const layers = {};
  for (const run of runs) for (const [key, val] of Object.entries(run.layerCountDistribution))
    layers[key] = (layers[key] || 0) + val.ticks;
  return {
    seedCount: runs.length, simulatedSeedSeconds: sum(runs.map(run => run.metrics.simulationSeconds)),
    antCount: ants.length, exposedAntCount: ants.filter(ant => ant.exposureSeconds > 0).length,
    totalActiveAntTicks: active, totalExposureAntTicks: exposure, activeAntTimeSeconds: active * DT,
    anyPlateExposureSeconds: exposure * DT, anyPlateExposureFractionOfActiveTime: active ? exposure / active : 0,
    antsWithRepeatedExposureEpisodes: ants.filter(ant => ant.repeatedExposureEpisodes).length,
    antsWithRepeatedTopPlateEncounter: ants.filter(ant => ant.repeatTopPlateBouts > 0).length,
    repeatedTopPlateBouts: sum(ants.map(ant => ant.repeatTopPlateBouts)),
    uniqueTopPlateCountBySeed: results.map(item => ({ seed: item.seed, count: item.measurement.metrics.uniqueTopPlateCount })),
    preEntryMaterialAntCount: ants.filter(ant => ant.preEntryExposureSeconds > 0).length,
    preEntryExposureAntTicks: pre, preEntryExposureSeconds: pre * DT, episodeCount: episodes.length,
    episodeDurationDistribution: durationDistribution(episodes, DT),
    layerCountDistribution: Object.fromEntries(Object.entries(sortedCounts(layers)).map(([count, ticks]) =>
      [count, { ticks, exposureSeconds: ticks * DT, fractionOfExposureTicks: exposure ? ticks / exposure : 0 }])),
    seeds: results.map(item => ({ seed: item.seed, ...item.measurement.metrics }))
  };
}
function clearEvents(e) { e.contacts.length = 0; e.plates.length = 0; e.nodules.length = 0; e.errors.length = 0; }
function hashValue(value) {
  const h = createHash('sha256');
  appendValue(h, value, new WeakSet());
  return h.digest();
}
function appendValue(h, v, parents) {
  if (v === null) { h.update('null;'); return; }
  if (v === undefined) { h.update('undefined;'); return; }
  if (typeof v === 'string') { h.update('s' + v.length + ':' + v); return; }
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') { h.update(typeof v + ':' + String(v) + ';'); return; }
  if (typeof v === 'function') { h.update('fn:' + (v.name || '') + ';'); return; }
  if (ArrayBuffer.isView(v)) { h.update(v.constructor.name + ':' + v.byteLength + ':')
    .update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); return; }
  if (v instanceof ArrayBuffer) { h.update('ab:' + v.byteLength + ':').update(Buffer.from(v)); return; }
  if (parents.has(v)) { h.update('[cycle];'); return; }
  parents.add(v);
  if (Array.isArray(v)) {
    h.update('array:' + v.length + '['); for (const item of v) appendValue(h, item, parents); h.update('];');
  } else if (v instanceof Map) {
    const entries = [...v.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    h.update('map:' + entries.length + '{');
    for (const [key, item] of entries) { appendValue(h, key, parents); appendValue(h, item, parents); }
    h.update('};');
  } else if (v instanceof Set) {
    const entries = [...v].sort((a, b) => String(a).localeCompare(String(b)));
    h.update('set:' + entries.length + '{'); for (const item of entries) appendValue(h, item, parents); h.update('};');
  } else {
    const keys = Object.keys(v).sort();
    h.update('object:' + keys.length + '{');
    for (const key of keys) { h.update('key:' + key.length + ':' + key); appendValue(h, v[key], parents); }
    h.update('};');
  }
  parents.delete(v);
}
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
function gitBytes(args) { return execFileSync('git', args, { cwd: ROOT }); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
async function writeJson(dir, name, value) {
  await writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n');
}
async function writeCsv(dir, name, headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(key => csvCell(row[key])).join(','));
  await writeFile(resolve(dir, name), lines.join('\n') + '\n');
}
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(Number(value.toFixed(6))) : String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) text = '"' + text.replaceAll('"', '""') + '"';
  return text;
}
