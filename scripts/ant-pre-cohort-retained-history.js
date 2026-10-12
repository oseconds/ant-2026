import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { AntController, materialLayerCountAtSnapshot, materialLocomotionMultiplier } from '../src/lib/agents/ant/AntController.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DT = 1 / 60;
const FIELDS = ['agentTrajectory', 'lifecycle', 'rng', 'pheromone', 'surfaceField', 'gait', 'bodyPose',
  'gasterDeposition', 'colonyActivation', 'localOccupancy', 'footContacts', 'materialBirthEvents',
  'trailPlateBirth', 'materialStratigraphy'];
const SOURCE_PATHS = ['AGENTS.md', 'docs/ant/README.md', 'docs/ant/world-model.md',
  'scripts/ant-material-experience-shadow.js', 'src/lib/agents/ant/AntController.js',
  'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/LocalOccupancy.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js'];
const CLI = new Map(process.argv.slice(2).map(arg => {
  const i = arg.indexOf('=');
  return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export function createPreCohortHistoryObserver({ dtSeconds = DT } = {}) {
  assert.ok(Number.isFinite(dtSeconds) && dtSeconds > 0);
  const ants = new Map(), windows = [createCounters(), createCounters(), createCounters()];
  const seconds = new Map(), contributionEpisodes = [], allPopulationEpisodes = [];
  const totals = createCounters();
  let samples = 0, lastTimeMs = null, finished = false, allPopulationEpisode = null;
  return Object.freeze({
    observe({ simulationTimeMs, agents, entryTimeByAntId, stratigraphy, snapshot }) {
      assert.ok(!finished && Number.isFinite(simulationTimeMs) && simulationTimeMs >= 0);
      assert.ok(Array.isArray(agents) && entryTimeByAntId instanceof Map);
      assert.ok(typeof stratigraphy?.getColumnAt === 'function' && snapshot?.stratigraphy);
      if (lastTimeMs !== null) assert.ok(Math.abs(simulationTimeMs - lastTimeMs - dtSeconds * 1000) <= 1e-6,
        'samples must follow fixed ticks');
      const live = new Set();
      let oldAnts = 0;
      const entryTimes = agents.map(agent => {
        assert.ok(agent && typeof agent.id === 'string' && Number.isFinite(agent.x) && Number.isFinite(agent.y));
        assert.ok(!live.has(agent.id), 'duplicate agent id in sample');
        live.add(agent.id);
        const entry = entryTimeByAntId.get(agent.id);
        assert.ok(Number.isFinite(entry) && entry <= simulationTimeMs,
          `missing or future entry time for ${agent.id}`);
        return entry;
      });
      const oldestLiveEntryTimeMs = entryTimes.length ? Math.min(...entryTimes) : null;
      const second = Math.floor((simulationTimeMs + 1e-6) / 1000);
      const bin = seconds.get(second) || createSecondBin(second);
      seconds.set(second, bin);
      const window = simulationTimeMs < 200000 ? windows[0] : simulationTimeMs < 400000 ? windows[1] : windows[2];

      for (const agent of agents) {
        let ant = ants.get(agent.id);
        if (!ant) { ant = makeAnt(agent.id, entryTimeByAntId.get(agent.id)); ants.set(agent.id, ant); }
        assert.ok(ant.active, 'retired ant id reappeared');
        assert.equal(ant.entryTimeMs, entryTimeByAntId.get(agent.id), 'entry time changed');
        ant.activeTicks += 1;

        const layerCount = materialLayerCountAtSnapshot(snapshot, agent.x, agent.y);
        const column = stratigraphy.getColumnAt(agent.x, agent.y);
        assert.equal(column.length, layerCount, `public column and production layer count differ at ${agent.id}`);
        if (column.length) {
          const cell = cellIndex(snapshot, agent.x, agent.y);
          const topIndex = snapshot.stratigraphy.topLayerByCell[cell];
          assert.equal(column.at(-1).id, snapshot.plates[topIndex]?.id, 'column order does not match public top layer');
        }
        const preCohortCount = oldestLiveEntryTimeMs === null ? 0 : column.reduce((count, layer) => {
          assert.ok(Number.isFinite(layer.descriptor?.bornAtSimulationTimeMs), 'column layer lacks birth time');
          return count + (layer.descriptor.bornAtSimulationTimeMs < oldestLiveEntryTimeMs ? 1 : 0);
        }, 0);
        const topPreCohort = preCohortCount > 0
          && column.at(-1).descriptor.bornAtSimulationTimeMs < oldestLiveEntryTimeMs;
        const buriedOnly = preCohortCount > 0 && !topPreCohort;
        const multiplier = materialLocomotionMultiplier(layerCount);
        const withoutPreCohort = materialLocomotionMultiplier(layerCount - preCohortCount);
        const delta = withoutPreCohort - multiplier;
        assert.ok(preCohortCount >= 0 && preCohortCount <= layerCount);
        assert.equal(multiplier, materialLocomotionMultiplier(layerCount));
        const row = { id: agent.id, layerCount, preCohortCount, topPreCohort, buriedOnly, multiplier,
          withoutPreCohort, delta };
        recordCounters(totals, row, agent.id);
        recordCounters(window, row, agent.id);
        recordSecond(bin, row, agents.length);
        if (preCohortCount > 0) {
          oldAnts += 1;
          ant.preCohortTicks += 1;
          ant.deltaSum += delta;
          ant.layerCountTicks[layerCount] = (ant.layerCountTicks[layerCount] || 0) + 1;
          ant.preCohortLayerCountTicks[preCohortCount] = (ant.preCohortLayerCountTicks[preCohortCount] || 0) + 1;
          ant.topPreCohortTicks += Number(topPreCohort);
          ant.buriedOnlyTicks += Number(buriedOnly);
          if (!ant.currentEpisode) ant.currentEpisode = { startTimeMs: simulationTimeMs, ticks: 0,
            topPreCohortTicks: 0, buriedOnlyTicks: 0, deltaSum: 0, layerCountTicks: {}, preCohortLayerCountTicks: {} };
          const episode = ant.currentEpisode;
          episode.ticks += 1;
          episode.topPreCohortTicks += Number(topPreCohort);
          episode.buriedOnlyTicks += Number(buriedOnly);
          episode.deltaSum += delta;
          episode.layerCountTicks[layerCount] = (episode.layerCountTicks[layerCount] || 0) + 1;
          episode.preCohortLayerCountTicks[preCohortCount] = (episode.preCohortLayerCountTicks[preCohortCount] || 0) + 1;
        } else closeContributionEpisode(ant, simulationTimeMs, false, dtSeconds, contributionEpisodes);
      }
      for (const ant of ants.values()) if (ant.active && !live.has(ant.id)) {
        closeContributionEpisode(ant, simulationTimeMs, false, dtSeconds, contributionEpisodes);
        ant.active = false;
        ant.retiredAtTimeMs = simulationTimeMs;
      }
      recordPopulation(totals, agents.length, oldAnts);
      recordPopulation(window, agents.length, oldAnts);
      recordPopulation(bin, agents.length, oldAnts);
      const allOld = agents.length > 0 && oldAnts === agents.length;
      if (allOld && !allPopulationEpisode) allPopulationEpisode = { startTimeMs: simulationTimeMs, ticks: 0 };
      if (allOld) allPopulationEpisode.ticks += 1;
      else closeAllPopulationEpisode(simulationTimeMs, false);
      samples += 1;
      lastTimeMs = simulationTimeMs;
    },
    finish(horizonMs) {
      assert.ok(!finished && Number.isFinite(horizonMs) && horizonMs >= 0);
      if (lastTimeMs !== null) assert.ok(Math.abs(horizonMs - lastTimeMs - dtSeconds * 1000) <= 1e-6,
        'horizon must close the final sampled tick');
      for (const ant of ants.values()) closeContributionEpisode(ant, horizonMs, ant.active, dtSeconds, contributionEpisodes);
      closeAllPopulationEpisode(horizonMs, true);
      finished = true;
    },
    summarize() {
      assert.ok(finished, 'finish before summarize');
      const antRows = [...ants.values()].sort((a, b) => a.id.localeCompare(b.id)).map(ant => ({
        id: ant.id, entryTimeSeconds: ant.entryTimeMs / 1000,
        retiredAtTimeSeconds: ant.retiredAtTimeMs === null ? null : ant.retiredAtTimeMs / 1000,
        activeTimeSeconds: ant.activeTicks * dtSeconds,
        preCohortHistorySeconds: ant.preCohortTicks * dtSeconds,
        preCohortHistoryFraction: ant.activeTicks ? ant.preCohortTicks / ant.activeTicks : 0,
        preCohortEpisodes: ant.episodes.length, repeatedPreCohortEncounter: ant.episodes.length > 1,
        topPreCohortSeconds: ant.topPreCohortTicks * dtSeconds,
        buriedOnlyPreCohortSeconds: ant.buriedOnlyTicks * dtSeconds,
        meanDeltaWhenPreCohortPresent: ant.preCohortTicks ? ant.deltaSum / ant.preCohortTicks : 0,
        layerCountTicks: sortedCounts(ant.layerCountTicks),
        preCohortLayerCountTicks: sortedCounts(ant.preCohortLayerCountTicks),
        episodes: ant.episodes
      }));
      const windowRows = windows.map((counts, i) => ({ window: ['0-200', '200-400', '400-600'][i],
        ...summarizeCounters(counts, dtSeconds) }));
      return {
        metrics: summarizeCounters(totals, dtSeconds),
        layerCountDistribution: countDistribution(totals.layerCounts),
        preCohortLayerCountDistribution: countDistribution(totals.preCohortLayerCounts),
        oldHistoryLayerCountDistribution: countDistribution(totals.oldHistoryLayerCounts),
        layerCountByPreCohortCount: pairDistribution(totals.oldHistoryPairs),
        deltaLayerCountByPreCohortCount: pairDistribution(totals.deltas),
        topPreCohortLayerCountByPreCohortCount: pairDistribution(totals.topDeltas),
        buriedOnlyLayerCountByPreCohortCount: pairDistribution(totals.buriedDeltas),
        multiplierDistributions: multiplierDistributions(totals),
        episodeDurationDistribution: durationDistribution(contributionEpisodes, dtSeconds),
        allPopulationEpisodeDurationDistribution: durationDistribution(allPopulationEpisodes, dtSeconds),
        windows: windowRows, ants: antRows, contributionEpisodes,
        allPopulationEpisodes,
        populationTimeline: [...seconds.values()].sort((a, b) => a.second - b.second)
          .map(bin => summarizeSecond(bin, dtSeconds))
      };
    }
  });

  function closeAllPopulationEpisode(endTimeMs, rightCensored) {
    if (!allPopulationEpisode) return;
    allPopulationEpisodes.push({ startTimeSeconds: allPopulationEpisode.startTimeMs / 1000,
      endTimeSeconds: endTimeMs / 1000, durationSeconds: allPopulationEpisode.ticks * dtSeconds,
      sampledTicks: allPopulationEpisode.ticks, rightCensored });
    allPopulationEpisode = null;
  }
}

function createCounters() {
  return { samples: 0, activeAntTicks: 0, materialAntTicks: 0, preCohortAntTicks: 0,
    topPreCohortAntTicks: 0, buriedOnlyAntTicks: 0, allPopulationPreTicks: 0,
    populatedSamples: 0, populationPreShareSum: 0, antIds: new Set(), topAntIds: new Set(), buriedAntIds: new Set(),
    layerCounts: new Map(), preCohortLayerCounts: new Map(), oldHistoryLayerCounts: new Map(),
    oldHistoryPairs: new Map(), deltas: new Map(), topDeltas: new Map(), buriedDeltas: new Map() };
}
function makeAnt(id, entryTimeMs) {
  return { id, entryTimeMs, active: true, activeTicks: 0, preCohortTicks: 0, topPreCohortTicks: 0,
    buriedOnlyTicks: 0, deltaSum: 0, layerCountTicks: {}, preCohortLayerCountTicks: {},
    currentEpisode: null, episodes: [], retiredAtTimeMs: null };
}
function recordCounters(c, row, antId) {
  c.activeAntTicks += 1;
  addCount(c.layerCounts, row.layerCount);
  if (row.layerCount > 0) c.materialAntTicks += 1;
  c.deltas.set(pairKey(row.layerCount, row.preCohortCount), (c.deltas.get(pairKey(row.layerCount, row.preCohortCount)) || 0) + 1);
  if (row.preCohortCount === 0) return;
  c.preCohortAntTicks += 1;
  c.antIds.add(antId);
  addCount(c.preCohortLayerCounts, row.preCohortCount);
  addCount(c.oldHistoryLayerCounts, row.layerCount);
  addCount(c.oldHistoryPairs, pairKey(row.layerCount, row.preCohortCount));
  if (row.topPreCohort) {
    c.topPreCohortAntTicks += 1; c.topAntIds.add(antId);
    c.topDeltas.set(pairKey(row.layerCount, row.preCohortCount), (c.topDeltas.get(pairKey(row.layerCount, row.preCohortCount)) || 0) + 1);
  } else {
    c.buriedOnlyAntTicks += 1; c.buriedAntIds.add(antId);
    c.buriedDeltas.set(pairKey(row.layerCount, row.preCohortCount), (c.buriedDeltas.get(pairKey(row.layerCount, row.preCohortCount)) || 0) + 1);
  }
}
function recordPopulation(c, population, preCohortPopulation) {
  c.samples += 1;
  if (!population) return;
  c.populatedSamples += 1;
  c.populationPreShareSum += preCohortPopulation / population;
  if (preCohortPopulation === population) c.allPopulationPreTicks += 1;
}
function createSecondBin(second) {
  return { second, samples: 0, activeAntTicks: 0, materialAntTicks: 0, preCohortAntTicks: 0,
    topPreCohortAntTicks: 0, buriedOnlyAntTicks: 0, populatedSamples: 0,
    populationPreShareSum: 0, allPopulationPreTicks: 0 };
}
function recordSecond(bin, row) {
  bin.activeAntTicks += 1;
  bin.materialAntTicks += Number(row.layerCount > 0);
  bin.preCohortAntTicks += Number(row.preCohortCount > 0);
  bin.topPreCohortAntTicks += Number(row.topPreCohort);
  bin.buriedOnlyAntTicks += Number(row.buriedOnly);
}
function summarizeSecond(bin, dtSeconds) {
  const populationSamples = Math.max(1, bin.samples);
  const populated = bin.populatedSamples > 0;
  return { second: bin.second, sampledTicks: bin.samples, meanPopulation: bin.activeAntTicks / populationSamples,
    preCohortFractionOfActiveAntTime: bin.activeAntTicks ? bin.preCohortAntTicks / bin.activeAntTicks : 0,
    preCohortFractionOfMaterialAntTime: bin.materialAntTicks ? bin.preCohortAntTicks / bin.materialAntTicks : 0,
    topPreCohortFractionOfPreCohortAntTime: bin.preCohortAntTicks ? bin.topPreCohortAntTicks / bin.preCohortAntTicks : 0,
    buriedOnlyFractionOfPreCohortAntTime: bin.preCohortAntTicks ? bin.buriedOnlyAntTicks / bin.preCohortAntTicks : 0,
    meanCurrentPopulationShareWithPreCohortHistory: populated
      ? bin.populationPreShareSum / bin.populatedSamples : null,
    allCurrentPopulationPreCohortSeconds: bin.allPopulationPreTicks * dtSeconds };
}
function summarizeCounters(c, dtSeconds) {
  return {
    samples: c.samples, populatedSamples: c.populatedSamples, activeAntTicks: c.activeAntTicks,
    activeAntTimeSeconds: c.activeAntTicks * dtSeconds,
    materialAntTicks: c.materialAntTicks,
    materialExposureFractionOfActiveAntTime: c.activeAntTicks ? c.materialAntTicks / c.activeAntTicks : 0,
    preCohortAntTicks: c.preCohortAntTicks,
    preCohortHistoryFractionOfActiveAntTime: c.activeAntTicks ? c.preCohortAntTicks / c.activeAntTicks : 0,
    preCohortFractionOfMaterialAntTime: c.materialAntTicks ? c.preCohortAntTicks / c.materialAntTicks : 0,
    preCohortHistoryAntTimeSeconds: c.preCohortAntTicks * dtSeconds,
    antsWithPreCohortHistory: c.antIds.size,
    topPreCohortAntTicks: c.topPreCohortAntTicks,
    buriedOnlyPreCohortAntTicks: c.buriedOnlyAntTicks,
    topPreCohortFractionOfOldHistoryAntTime: c.preCohortAntTicks ? c.topPreCohortAntTicks / c.preCohortAntTicks : 0,
    buriedOnlyFractionOfOldHistoryAntTime: c.preCohortAntTicks ? c.buriedOnlyAntTicks / c.preCohortAntTicks : 0,
    antsWithTopPreCohortHistory: c.topAntIds.size,
    antsWithBuriedOnlyPreCohortHistory: c.buriedAntIds.size,
    meanCurrentPopulationShareWithPreCohortHistory: c.populatedSamples ? c.populationPreShareSum / c.populatedSamples : null,
    allCurrentPopulationPreCohortTicks: c.allPopulationPreTicks,
    allCurrentPopulationPreCohortSeconds: c.allPopulationPreTicks * dtSeconds,
    fractionOfPopulatedSamplesWithAllCurrentAntsOnPreCohortHistory:
      c.populatedSamples ? c.allPopulationPreTicks / c.populatedSamples : null,
    actualMultiplier: weightedStats(c.layerCounts, layerCount => materialLocomotionMultiplier(Number(layerCount))),
    actualMultiplierWherePreCohortPresent: weightedStats(c.oldHistoryLayerCounts,
      layerCount => materialLocomotionMultiplier(Number(layerCount))),
    multiplierWithoutPreCohortLayers: weightedStats(c.oldHistoryPairs, key => {
      const [layerCount, preCount] = parsePair(key);
      return materialLocomotionMultiplier(layerCount - preCount);
    }),
    deltaWhenPreCohortPresent: weightedStats(c.oldHistoryPairs, key => {
      const [layerCount, preCount] = parsePair(key);
      return materialLocomotionMultiplier(layerCount - preCount) - materialLocomotionMultiplier(layerCount);
    }),
    topPreCohortDelta: weightedStats(c.topDeltas, key => {
      const [layerCount, preCount] = parsePair(key);
      return materialLocomotionMultiplier(layerCount - preCount) - materialLocomotionMultiplier(layerCount);
    }),
    buriedOnlyPreCohortDelta: weightedStats(c.buriedDeltas, key => {
      const [layerCount, preCount] = parsePair(key);
      return materialLocomotionMultiplier(layerCount - preCount) - materialLocomotionMultiplier(layerCount);
    }),
    deltaWhenPreCohortPresent: weightedStats(c.oldHistoryPairs, deltaForPair),
    topPreCohortDeltaDistribution: weightedStats(c.topDeltas, deltaForPair),
    buriedOnlyPreCohortDeltaDistribution: weightedStats(c.buriedDeltas, deltaForPair)
  };
}
function multiplierDistributions(c) {
  const delta = freq => weightedStats(freq, key => {
    const [layerCount, preCount] = parsePair(key);
    return materialLocomotionMultiplier(layerCount - preCount) - materialLocomotionMultiplier(layerCount);
  });
  return { deltaAllActiveAntTime: delta(c.deltas), deltaWhenPreCohortPresent: delta(c.oldHistoryPairs),
    deltaTopPreCohort: delta(c.topDeltas), deltaBuriedOnlyPreCohort: delta(c.buriedDeltas) };
}
function closeContributionEpisode(ant, endTimeMs, rightCensored, dtSeconds, output) {
  if (!ant.currentEpisode) return;
  const e = ant.currentEpisode;
  const row = { antId: ant.id, index: ant.episodes.length + 1, startTimeSeconds: e.startTimeMs / 1000,
    endTimeSeconds: endTimeMs / 1000, durationSeconds: e.ticks * dtSeconds, sampledTicks: e.ticks,
    rightCensored, topPreCohortTicks: e.topPreCohortTicks, buriedOnlyTicks: e.buriedOnlyTicks,
    meanDelta: e.deltaSum / e.ticks, layerCountTicks: sortedCounts(e.layerCountTicks),
    preCohortLayerCountTicks: sortedCounts(e.preCohortLayerCountTicks) };
  ant.episodes.push(row); output.push(row); ant.currentEpisode = null;
}
function closeAllPopulationEpisode(endTimeMs, rightCensored) {
  if (!allPopulationEpisode) return;
  allPopulationEpisodes.push({ startTimeSeconds: allPopulationEpisode.startTimeMs / 1000,
    endTimeSeconds: endTimeMs / 1000, durationSeconds: allPopulationEpisode.ticks * dtSeconds,
    sampledTicks: allPopulationEpisode.ticks, rightCensored });
  allPopulationEpisode = null;
}
function durationDistribution(rows, dtSeconds) {
  const values = rows.map(row => row.sampledTicks * dtSeconds).sort((a, b) => a - b);
  if (!values.length) return { count: 0, rightCensoredCount: 0, minSeconds: null, medianSeconds: null,
    p90Seconds: null, p95Seconds: null, maxSeconds: null, meanSeconds: null };
  return { count: values.length, rightCensoredCount: rows.filter(row => row.rightCensored).length,
    minSeconds: values[0], medianSeconds: quantile(values, 0.5), p90Seconds: quantile(values, 0.9),
    p95Seconds: quantile(values, 0.95), maxSeconds: values.at(-1), meanSeconds: values.reduce((a, b) => a + b, 0) / values.length };
}
function weightedStats(frequencies, valueForKey) {
  const values = [...frequencies].map(([key, count]) => ({ value: valueForKey(key), count }))
    .sort((a, b) => a.value - b.value);
  const count = values.reduce((sum, row) => sum + row.count, 0);
  if (!count) return { count: 0, min: null, median: null, p90: null, p95: null, max: null, mean: null };
  return { count, min: values[0].value, median: weightedQuantile(values, count, 0.5),
    p90: weightedQuantile(values, count, 0.9), p95: weightedQuantile(values, count, 0.95),
    max: values.at(-1).value, mean: values.reduce((sum, row) => sum + row.value * row.count, 0) / count };
}
function weightedQuantile(values, total, q) {
  const target = Math.max(1, Math.ceil(total * q)); let cumulative = 0;
  for (const row of values) { cumulative += row.count; if (cumulative >= target) return row.value; }
  return values.at(-1).value;
}
function quantile(values, q) { return values[Math.max(0, Math.ceil(values.length * q) - 1)]; }
function countDistribution(freq) { return Object.fromEntries([...freq].sort((a, b) => Number(a[0]) - Number(b[0]))); }
function pairDistribution(freq) {
  return Object.fromEntries([...freq].sort((a, b) => {
    const [al, ap] = parsePair(a[0]), [bl, bp] = parsePair(b[0]); return al - bl || ap - bp;
  }));
}
function sortedCounts(value) { return Object.fromEntries(Object.entries(value).sort((a, b) => Number(a[0]) - Number(b[0]))); }
function addCount(map, key) { map.set(key, (map.get(key) || 0) + 1); }
function pairKey(layerCount, preCount) { return `${layerCount}:${preCount}`; }
function parsePair(key) { return key.split(':').map(Number); }
function cellIndex(snapshot, x, y) {
  return Math.round(y * (snapshot.height - 1)) * snapshot.width + Math.round(x * (snapshot.width - 1));
}
function rngFor(seed) {
  let state = seed >>> 0;
  const random = () => { random.calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  random.calls = 0; random.state = () => state;
  return random;
}

async function main() {
  const seeds = String(CLI.get('--seeds') || '20261005,20261006,20261007').split(',').map(Number);
  const seconds = Number(CLI.get('--seconds') || 600), baselineRef = String(CLI.get('--baseline') || 'origin/main');
  const output = resolve(ROOT, String(CLI.get('--output')
    || 'docs/ant/evidence/2026-10-12-pre-cohort-retained-history/data'));
  assert.ok(seeds.length && seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff));
  assert.ok(Number.isInteger(seconds) && seconds > 0 && seconds * 60 === seconds / DT);
  await mkdir(output, { recursive: true });
  assert.equal((await readdir(output)).length, 0, 'output directory must be empty');
  const baselineCommit = git(['rev-parse', `${baselineRef}^{commit}`]);
  git(['merge-base', '--is-ancestor', baselineCommit, 'HEAD']);
  git(['diff', '--exit-code', baselineCommit, '--', 'src', 'package.json']);
  const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, sha256(gitBytes(['show', `${baselineCommit}:${path}`]))])));
  const results = [];
  for (const seed of seeds) {
    const off = await run({ seed, seconds, observe: false });
    const on = await run({ seed, seconds, observe: true });
    const parity = compareRows(off.rows, on.rows, seed);
    if (parity.firstMismatch) {
      await writeJson(output, `parity-failure-seed-${seed}.json`, parity);
      throw new Error(`observer parity mismatch at tick ${parity.firstMismatch.tick}, field ${parity.firstMismatch.field}`);
    }
    results.push({ seed, off: off.run, on: on.run, parity, measurement: on.measurement });
    console.log(JSON.stringify({ seed, parity: 'exact', comparedTicks: parity.comparedTicks,
      preCohortFraction: on.measurement.metrics.preCohortHistoryFractionOfActiveAntTime,
      wallSeconds: { off: off.run.wallSeconds, on: on.run.wallSeconds } }));
  }
  const populationRows = [], episodeRows = [];
  for (const result of results) {
    const prefix = `seed-${result.seed}`;
    await writeJson(output, `${prefix}-summary.json`, { seed: result.seed, off: result.off, on: result.on,
      metrics: result.measurement.metrics, layerCountDistribution: result.measurement.layerCountDistribution,
      preCohortLayerCountDistribution: result.measurement.preCohortLayerCountDistribution,
      oldHistoryLayerCountDistribution: result.measurement.oldHistoryLayerCountDistribution,
      layerCountByPreCohortCount: result.measurement.layerCountByPreCohortCount,
      deltaLayerCountByPreCohortCount: result.measurement.deltaLayerCountByPreCohortCount,
      topPreCohortLayerCountByPreCohortCount: result.measurement.topPreCohortLayerCountByPreCohortCount,
      buriedOnlyLayerCountByPreCohortCount: result.measurement.buriedOnlyLayerCountByPreCohortCount,
      multiplierDistributions: result.measurement.multiplierDistributions,
      episodeDurationDistribution: result.measurement.episodeDurationDistribution,
      allPopulationEpisodeDurationDistribution: result.measurement.allPopulationEpisodeDurationDistribution,
      windows: result.measurement.windows, parity: result.parity,
      antSummaryFile: `${prefix}-ants.json`, episodeFile: `${prefix}-episodes.json` });
    await writeJson(output, `${prefix}-ants.json`, result.measurement.ants);
    await writeJson(output, `${prefix}-episodes.json`, result.measurement.contributionEpisodes);
    for (const row of result.measurement.populationTimeline) populationRows.push({ seed: result.seed, ...row });
    for (const row of result.measurement.contributionEpisodes) episodeRows.push({ seed: result.seed, ...row });
  }
  await writeJson(output, 'aggregate-summary.json', aggregateRuns(results));
  await writeJson(output, 'observer-parity.json', results.map(({ seed, parity }) => ({ seed, ...parity })));
  await writeJson(output, 'source-hashes.json', sourceHashes);
  await writeCsv(output, 'population-pre-cohort-by-second.csv', ['seed', 'second', 'sampledTicks', 'meanPopulation',
    'preCohortFractionOfActiveAntTime', 'preCohortFractionOfMaterialAntTime',
    'topPreCohortFractionOfPreCohortAntTime', 'buriedOnlyFractionOfPreCohortAntTime',
    'meanCurrentPopulationShareWithPreCohortHistory', 'allCurrentPopulationPreCohortSeconds'], populationRows);
  await writeCsv(output, 'pre-cohort-episodes.csv', ['seed', 'antId', 'index', 'startTimeSeconds',
    'endTimeSeconds', 'durationSeconds', 'sampledTicks', 'rightCensored', 'topPreCohortTicks',
    'buriedOnlyTicks', 'meanDelta', 'layerCountTicks', 'preCohortLayerCountTicks'], episodeRows);
  const manifest = { schemaVersion: 1, baselineRef, baselineCommit, passBranch: git(['branch', '--show-current']),
    node: process.version, seeds, seconds, dtSeconds: DT, ticksPerSecond: 60, sourceHashes,
    conditions: 'Fresh AntController with production default materialLocomotionResistance=true; counted LCG; AudioBridge absent; no state overrides.',
    cohortDefinition: 'At each tick, oldestLiveEntryTime is the minimum exact spawn time among currently live agents. A column layer is pre-cohort iff descriptor.bornAtSimulationTimeMs < oldestLiveEntryTime (strict inequality).',
    entryTime: 'A harness-only instance wrapper records successful spawnNextAnt calls at controller.simulationTimeMs; it adds no AntAgent state, emits no callback, reads no RNG and returns the original method result.',
    observerTiming: 'At each fixed-tick boundary before AntController.tick, read one public stratigraphy snapshot, each live ant current-cell production layerCountByCell through materialLayerCountAtSnapshot, and its public bottom-to-top getColumnAt() descriptors. Same-tick movement/contact/birth/topology changes are seen at the next boundary.',
    measurement: 'Ant-time is sampled at tick entry and weighted by 1/60 second. The counterfactual delta is m(L-P)-m(L) from the unchanged production equation; it is diagnostic only, not an intervention or additive mediation decomposition.',
    parity: 'Per-tick SHA-256 chains compare agent trajectory/lifecycle, RNG, pheromone, SurfaceField, gait, pose, deposition, activation, occupancy, exact contact/birth events, TrailPlateBirth and MaterialStratigraphy. Observer-on rows are also hashed immediately before/after each read.',
    audio: 'AudioBridge absent.', observerHash: sha256(await readFile(fileURLToPath(import.meta.url))),
    reproduction: `node scripts/ant-pre-cohort-retained-history.js --baseline=${baselineCommit} --seeds=${seeds.join(',')} --seconds=${seconds} --output=docs/ant/evidence/2026-10-12-pre-cohort-retained-history/replay-REPLAY-ID`,
    files: [...(await readdir(output)), 'manifest.json'].sort() };
  await writeJson(output, 'manifest.json', manifest);
}

async function run({ seed, seconds, observe }) {
  const start = performance.now(), random = rngFor(seed), controller = new AntController({ random });
  const entryTimeByAntId = new Map();
  if (observe) {
    const spawnNextAnt = controller.spawnNextAnt;
    controller.spawnNextAnt = function (...args) {
      const spawned = spawnNextAnt.apply(this, args);
      if (spawned) entryTimeByAntId.set(this.agents.at(-1).id, this.simulationTimeMs);
      return spawned;
    };
  }
  const events = { contacts: [], plates: [], nodules: [], errors: [] };
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') events.contacts.push(structuredClone(payload));
    else if (type === 'plate-birth') events.plates.push(structuredClone(payload));
    else if (type === 'sphere-birth') events.nodules.push(structuredClone(payload));
    else if (type === 'error') events.errors.push(structuredClone(payload));
  });
  const materialHash = makeMaterialHasher(), birthHash = makeBirthHasher();
  const observer = observe ? createPreCohortHistoryObserver({ dtSeconds: DT }) : null;
  const rows = [], totals = { footContactGroups: 0, footContactPoints: 0, plateBirths: 0, noduleBirths: 0 };
  let boundaryChecks = 0;
  await controller.init();
  try {
    rows.push(parityRow(controller, random, events, materialHash, birthHash));
    for (let tick = 0; tick < seconds * 60; tick += 1) {
      if (observer) {
        const before = parityRow(controller, random, events, materialHash, birthHash);
        observer.observe({ simulationTimeMs: controller.simulationTimeMs, agents: controller.agents,
          entryTimeByAntId, stratigraphy: controller.materialStratigraphy,
          snapshot: controller.materialStratigraphy.getSnapshot() });
        assert.ok(parityRow(controller, random, events, materialHash, birthHash).equals(before),
          `observer changed production state at pre-tick ${tick}`);
        assert.equal(entryTimeByAntId.size, controller.totalSpawned, 'spawn recorder missed an ant entry');
        boundaryChecks += 1;
      }
      clearEvents(events);
      controller.tick(DT);
      rows.push(parityRow(controller, random, events, materialHash, birthHash));
      totals.footContactGroups += events.contacts.length;
      totals.footContactPoints += events.contacts.reduce((count, event) => count + event.contacts.length, 0);
      totals.plateBirths += events.plates.length;
      totals.noduleBirths += events.nodules.length;
      if ((tick + 1) % 3600 === 0) console.log(JSON.stringify({ seed, mode: observe ? 'observer-on' : 'observer-off',
        seconds: (tick + 1) / 60, population: controller.agents.length,
        wallSeconds: (performance.now() - start) / 1000 }));
    }
    if (observer) observer.finish(seconds * 1000);
    return { rows, measurement: observer?.summarize() ?? null,
      run: { seed, observer: observe ? 'ON' : 'OFF', productionMaterialLaw: 'default-on', seconds,
        ticks: seconds * 60, initialState: controller.getState(), finalPopulation: controller.agents.length,
        totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
        rngState: random.state(), rngCalls: random.calls, simulationTimeMs: controller.simulationTimeMs,
        eventTotals: totals, readOnlyBoundaryChecks: boundaryChecks,
        wallSeconds: (performance.now() - start) / 1000 } };
  } finally { unsubscribe(); await controller.destroy(); }
}

function aggregateRuns(results) {
  const runRows = results.map(row => row.measurement);
  const activeAntTicks = runRows.reduce((sum, row) => sum + row.metrics.activeAntTicks, 0);
  const materialAntTicks = runRows.reduce((sum, row) => sum + row.metrics.materialAntTicks, 0);
  const preCohortAntTicks = runRows.reduce((sum, row) => sum + row.metrics.preCohortAntTicks, 0);
  const ants = runRows.flatMap(row => row.ants);
  const episodes = runRows.flatMap(row => row.contributionEpisodes);
  const allPopulationEpisodes = runRows.flatMap(row => row.allPopulationEpisodes);
  const layerCounts = new Map();
  const preCounts = new Map();
  const oldLayerCounts = new Map();
  const oldPairs = new Map();
  const deltas = new Map(), topDeltas = new Map(), buriedDeltas = new Map();
  for (const result of results) {
    mergeCounts(layerCounts, result.measurement.layerCountDistribution);
    mergeCounts(preCounts, result.measurement.preCohortLayerCountDistribution);
    mergeCounts(oldLayerCounts, result.measurement.oldHistoryLayerCountDistribution);
    mergeCounts(oldPairs, result.measurement.layerCountByPreCohortCount);
    mergeCounts(deltas, result.measurement.deltaLayerCountByPreCohortCount);
    mergeCounts(topDeltas, result.measurement.topPreCohortLayerCountByPreCohortCount);
    mergeCounts(buriedDeltas, result.measurement.buriedOnlyLayerCountByPreCohortCount);
  }
  const aggCounters = createCounters();
  aggCounters.activeAntTicks = activeAntTicks; aggCounters.materialAntTicks = materialAntTicks;
  aggCounters.preCohortAntTicks = preCohortAntTicks;
  aggCounters.layerCounts = layerCounts; aggCounters.preCohortLayerCounts = preCounts;
  aggCounters.oldHistoryLayerCounts = oldLayerCounts; aggCounters.oldHistoryPairs = oldPairs;
  aggCounters.deltas = deltas; aggCounters.topDeltas = topDeltas; aggCounters.buriedDeltas = buriedDeltas;
  aggCounters.topPreCohortAntTicks = runRows.reduce((sum, row) => sum + row.metrics.topPreCohortAntTicks, 0);
  aggCounters.buriedOnlyAntTicks = runRows.reduce((sum, row) => sum + row.metrics.buriedOnlyPreCohortAntTicks, 0);
  aggCounters.samples = runRows.reduce((sum, row) => sum + row.metrics.samples, 0);
  aggCounters.populatedSamples = runRows.reduce((sum, row) => sum + row.metrics.populatedSamples, 0);
  aggCounters.populationPreShareSum = runRows.reduce((sum, row) => sum +
    row.metrics.meanCurrentPopulationShareWithPreCohortHistory * row.metrics.populatedSamples, 0);
  aggCounters.allPopulationPreTicks = runRows.reduce((sum, row) => sum + row.metrics.allCurrentPopulationPreCohortTicks, 0);
  for (const [index, row] of runRows.entries()) {
    const seed = results[index].seed;
    for (const ant of row.ants) if (ant.preCohortHistorySeconds > 0) aggCounters.antIds.add(`${seed}:${ant.id}`);
    for (const ant of row.ants) {
      if (ant.topPreCohortSeconds > 0) aggCounters.topAntIds.add(`${seed}:${ant.id}`);
      if (ant.buriedOnlyPreCohortSeconds > 0) aggCounters.buriedAntIds.add(`${seed}:${ant.id}`);
    }
  }
  return { seedCount: results.length, simulatedSeedSeconds: results.reduce((sum, row) => sum + row.on.seconds, 0),
    antCount: ants.length, metrics: summarizeCounters(aggCounters, DT),
    layerCountDistribution: countDistribution(layerCounts), preCohortLayerCountDistribution: countDistribution(preCounts),
    oldHistoryLayerCountDistribution: countDistribution(oldLayerCounts), layerCountByPreCohortCount: pairDistribution(oldPairs),
    multiplierDistributions: { deltaAllActiveAntTime: weightedStats(deltas, key => deltaForPair(key)),
      deltaWhenPreCohortPresent: weightedStats(oldPairs, key => deltaForPair(key)),
      deltaTopPreCohort: weightedStats(topDeltas, key => deltaForPair(key)),
      deltaBuriedOnlyPreCohort: weightedStats(buriedDeltas, key => deltaForPair(key)) },
    episodeDurationDistribution: durationDistribution(episodes, DT),
    allPopulationEpisodeDurationDistribution: durationDistribution(allPopulationEpisodes, DT),
    windows: ['0-200', '200-400', '400-600'].map((window, index) => {
      return { window, ...mergeWindowSummary(results.map(row => row.measurement.windows[index]), DT) };
    }), seeds: results.map(row => ({ seed: row.seed, ...row.measurement.metrics })) };
}
function mergeWindowSummary(rows) {
  const activeAntTicks = rows.reduce((s, row) => s + row.activeAntTicks, 0);
  const materialAntTicks = rows.reduce((s, row) => s + row.materialAntTicks, 0);
  const preCohortAntTicks = rows.reduce((s, row) => s + row.preCohortAntTicks, 0);
  const top = rows.reduce((s, row) => s + row.topPreCohortAntTicks, 0);
  const buried = rows.reduce((s, row) => s + row.buriedOnlyPreCohortAntTicks, 0);
  const samples = rows.reduce((s, row) => s + row.samples, 0);
  const populatedSamples = rows.reduce((s, row) => s + row.populatedSamples, 0);
  const all = rows.reduce((s, row) => s + row.allCurrentPopulationPreCohortTicks, 0);
  const deltas = rows.map(row => row.deltaWhenPreCohortPresent).filter(row => row.count);
  const deltaCount = deltas.reduce((s, row) => s + row.count, 0);
  return { samples, activeAntTicks, activeAntTimeSeconds: activeAntTicks * DT,
    materialExposureFractionOfActiveAntTime: activeAntTicks ? materialAntTicks / activeAntTicks : 0,
    preCohortHistoryFractionOfActiveAntTime: activeAntTicks ? preCohortAntTicks / activeAntTicks : 0,
    preCohortFractionOfMaterialAntTime: materialAntTicks ? preCohortAntTicks / materialAntTicks : 0,
    preCohortHistoryAntTimeSeconds: preCohortAntTicks * DT,
    topPreCohortFractionOfOldHistoryAntTime: preCohortAntTicks ? top / preCohortAntTicks : 0,
    buriedOnlyFractionOfOldHistoryAntTime: preCohortAntTicks ? buried / preCohortAntTicks : 0,
    meanCurrentPopulationShareWithPreCohortHistory: populatedSamples ? rows.reduce((s, row) => s +
      row.meanCurrentPopulationShareWithPreCohortHistory * row.populatedSamples, 0) / populatedSamples : null,
    allCurrentPopulationPreCohortTicks: all, allCurrentPopulationPreCohortSeconds: all * DT,
    fractionOfPopulatedSamplesWithAllCurrentAntsOnPreCohortHistory: populatedSamples ? all / populatedSamples : null,
    deltaWhenPreCohortPresent: { count: deltaCount,
      min: deltas.length ? Math.min(...deltas.map(row => row.min)) : null,
      mean: deltaCount ? deltas.reduce((s, row) => s + row.mean * row.count, 0) / deltaCount : null,
      max: deltas.length ? Math.max(...deltas.map(row => row.max)) : null } };
}
function deltaForPair(key) {
  const [layerCount, preCount] = parsePair(key);
  return materialLocomotionMultiplier(layerCount - preCount) - materialLocomotionMultiplier(layerCount);
}
function mergeCounts(target, source) { for (const [key, count] of Object.entries(source)) target.set(key, (target.get(key) || 0) + count); }
function parityRow(c, random, events, materialHash, birthHash) {
  const lifecycle = { state: c.state, simulationTimeMs: c.simulationTimeMs, nextSpawnTimeMs: c.nextSpawnTimeMs,
    nextAgentId: c.nextAgentId, totalSpawned: c.totalSpawned, totalRetired: c.totalRetired,
    accumulatorMs: c.accumulatorMs, initialized: c.initialized, running: c.running };
  const value = { agentTrajectory: JSON.stringify(c.agents), lifecycle, rng: { state: random.state(), calls: random.calls },
    pheromone: c.field, surfaceField: c.surfaceField, gait: c.gaitController.ants, bodyPose: c.bodyPoseController.ants,
    gasterDeposition: c.gasterDeposition, colonyActivation: c.colonyActivation, localOccupancy: c.occupancy,
    footContacts: events.contacts, materialBirthEvents: { plates: events.plates, nodules: events.nodules, errors: events.errors },
    trailPlateBirth: birthHash(c.trailPlateBirth), materialStratigraphy: materialHash(c.materialStratigraphy) };
  return Buffer.concat(FIELDS.map(name => hashValue(value[name])));
}
function makeMaterialHasher() {
  const dynamic = new Set(['simulationTimeMs', 'lastAdvanceTimeMs', 'lastNoduleEvaluationTimeMs',
    'totalAcceptedFootContacts', 'rejectedFootContacts', 'qualifiedNoduleCandidateCount',
    'footLoadByCell', 'candidateSinceMs', '_plateHistory']);
  let key = null, structure = null;
  return material => {
    const revision = material.revision + ':' + material.noduleRevision;
    if (revision !== key) {
      const stable = {};
      for (const name of Object.keys(material).sort()) if (!dynamic.has(name)) stable[name] = material[name];
      structure = hashValue(stable); key = revision;
    }
    const changing = {};
    for (const name of [...dynamic].sort()) if (Object.hasOwn(material, name)) changing[name] = material[name];
    return hashValue({ structure, changing });
  };
}
function makeBirthHasher() {
  let key = null, descriptors = null;
  return birth => {
    const counts = birth.plates.length + ':' + birth.birthRecords.length;
    if (counts !== key) { descriptors = hashValue({ plates: birth.plates, birthRecords: birth.birthRecords }); key = counts; }
    const candidate = birth.candidate;
    const scalars = candidate ? { ...candidate, mask: undefined, supportedMask: undefined, component: undefined,
      skeletonIndices: undefined, path: undefined } : null;
    return hashValue({ descriptors, scalars, arrays: candidate
      ? [candidate.mask, candidate.supportedMask, candidate.component, candidate.path, candidate.skeletonIndices] : [],
    chemicalMemory: birth.chemicalMemory, footContactCounts: birth.footContactCounts,
    lastInputDiagnostics: birth.lastInputDiagnostics, lastAnalysisTimeMs: birth.lastAnalysisTimeMs,
    lastBirthTimeMs: birth.lastBirthTimeMs });
  };
}
function compareRows(off, on, seed) {
  if (off.length !== on.length) return { seed, comparedTicks: Math.min(off.length, on.length),
    firstMismatch: { tick: null, field: 'rowCount' }, fields: {} };
  const chains = Object.fromEntries(FIELDS.map(name => [name,
    { off: createHash('sha256'), on: createHash('sha256'), match: true }]));
  let firstMismatch = null;
  for (let tick = 0; tick < off.length; tick += 1) for (let i = 0; i < FIELDS.length; i += 1) {
    const name = FIELDS[i], offset = i * 32, left = off[tick].subarray(offset, offset + 32),
      right = on[tick].subarray(offset, offset + 32);
    chains[name].off.update(left); chains[name].on.update(right);
    if (!left.equals(right)) {
      chains[name].match = false;
      if (!firstMismatch) firstMismatch = { tick, field: name, simulationTimeSeconds: tick / 60 };
    }
  }
  return { seed, comparedTicks: off.length, observerReadOnlyChecks: off.length - 1, firstMismatch,
    fields: Object.fromEntries(FIELDS.map(name => [name, { observerOffSha256: chains[name].off.digest('hex'),
      observerOnSha256: chains[name].on.digest('hex'), match: chains[name].match }])) };
}
function clearEvents(events) { events.contacts.length = 0; events.plates.length = 0; events.nodules.length = 0; events.errors.length = 0; }
function hashValue(value) { const hash = createHash('sha256'); appendValue(hash, value, new WeakSet()); return hash.digest(); }
function appendValue(hash, value, parents) {
  if (value === null) { hash.update('null;'); return; }
  if (value === undefined) { hash.update('undefined;'); return; }
  if (typeof value === 'string') { hash.update(`s${value.length}:${value}`); return; }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') { hash.update(`${typeof value}:${String(value)};`); return; }
  if (typeof value === 'function') { hash.update(`fn:${value.name || ''};`); return; }
  if (ArrayBuffer.isView(value)) { hash.update(`${value.constructor.name}:${value.byteLength}:`).update(Buffer.from(value.buffer, value.byteOffset, value.byteLength)); return; }
  if (value instanceof ArrayBuffer) { hash.update(`ab:${value.byteLength}:`).update(Buffer.from(value)); return; }
  if (parents.has(value)) { hash.update('[cycle];'); return; }
  parents.add(value);
  if (Array.isArray(value)) { hash.update(`array:${value.length}[`); for (const item of value) appendValue(hash, item, parents); hash.update('];'); }
  else if (value instanceof Map) {
    const entries = [...value.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    hash.update(`map:${entries.length}{`); for (const [key, item] of entries) { appendValue(hash, key, parents); appendValue(hash, item, parents); } hash.update('};');
  } else if (value instanceof Set) {
    const entries = [...value].sort((a, b) => String(a).localeCompare(String(b)));
    hash.update(`set:${entries.length}{`); for (const item of entries) appendValue(hash, item, parents); hash.update('};');
  } else {
    const keys = Object.keys(value).sort(); hash.update(`object:${keys.length}{`);
    for (const key of keys) { hash.update(`key:${key.length}:${key}`); appendValue(hash, value[key], parents); }
    hash.update('};');
  }
  parents.delete(value);
}
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
function gitBytes(args) { return execFileSync('git', args, { cwd: ROOT }); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
async function writeJson(dir, name, value) { await writeFile(resolve(dir, name), `${JSON.stringify(value, null, 2)}\n`); }
async function writeCsv(dir, name, headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(key => csvCell(row[key])).join(','));
  await writeFile(resolve(dir, name), `${lines.join('\n')}\n`);
}
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(Number(value.toFixed(8))) : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}
