import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntPheromoneProvenanceObserver } from './lib/antPheromoneProvenanceObserver.js';

const args = parseArguments(process.argv.slice(2));
const seeds = parseSeeds(args.get('--seeds') || '20261005,20261006,20261007');
const durationSeconds = Number(args.get('--seconds') || 600);
assert.equal(durationSeconds, 600, 'registered natural-run duration is 600 seconds');
const outputPath = resolve(args.get('--output')
  || 'test-results/ant-pheromone-cross-lifecycle-provenance/results.json');
const checkpointSeconds = [0, 30, 60, 120, 300, 600];
const ticks = durationSeconds * 60;
const evidence = {
  schema: 'ant-pheromone-cross-lifecycle-provenance-v1',
  baseline: { main: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785', seeds, durationSeconds,
    hz: 60, audio: 'off', field: 'production G, 316x316 Float32' },
  method: {
    sensorReads: 'raw production field.sample calls inside AntController.senseLocalTrail and senseTrail',
    authorCredit: 'positive stored Float32 node delta from production depositBrush, assigned to its GasterDeposition antId',
    fieldReconstruction: 'bilinear per-author cell contributions plus signed Float32 numeric residual',
    age: 'signal-weighted first/second moments; quantiles summarize per-read mean age in fixed 0.1 s bins',
    spatialGridSize: 32,
    origin: { x: 0.5, y: 0.72 }
  },
  seeds: []
};

await mkdir(dirname(outputPath), { recursive: true });
for (const seed of seeds) {
  const result = await runSeed(seed);
  evidence.seeds.push(result);
  await persist();
  console.log(JSON.stringify({ seed, ticks: result.parity.ticksCompared,
    samples: result.observer.reads.all.rawSampleCalls,
    fractions: Object.fromEntries(Object.entries(result.observer.reads.all.categories)
      .map(([key, value]) => [key, value.fractionOfProductionSamples])),
    capTouches: result.observer.field.capTouches,
    maxResidualRatio: Math.max(...result.checkpoints.map(item => item.fieldResidual.residualRatio)) }, null, 2));
}
evidence.pooled = poolSeeds(evidence.seeds);
await persist();
console.log(JSON.stringify({ output: outputPath, pooled: evidence.pooled,
  seedSummaries: evidence.seeds.map(seed => ({ seed: seed.seed, observerValidity: seed.observer.validity.ok,
    finalResidualRatio: seed.checkpoints.at(-1).fieldResidual.residualRatio,
    retiredReadFrequency: seed.observer.reads.all.retiredAuthorReadFrequency,
    retiredFraction: seed.observer.reads.all.categories.retired.fractionOfProductionSamples })) }, null, 2));

async function runSeed(seed) {
  const baseline = createRun(seed, false);
  const observed = createRun(seed, true);
  const baselineEvents = observeEvents(baseline.controller);
  const observedEvents = observeEvents(observed.controller);
  await Promise.all([baseline.controller.init(), observed.controller.init()]);
  assert.equal(runSignature(baseline.controller), runSignature(observed.controller), 'initial world parity');
  assert.deepEqual(baseline.random.snapshot(), observed.random.snapshot(), 'initial RNG parity');
  const checkpoints = [compareCheckpoint(0, baseline, observed, baselineEvents, observedEvents)];
  checkpoints[0].fieldResidual = observed.observer.auditField();

  for (let tick = 1; tick <= ticks; tick += 1) {
    baseline.controller.tick(1 / 60);
    observed.controller.tick(1 / 60);
    assert.equal(runSignature(baseline.controller), runSignature(observed.controller),
      `trajectory parity at ${tick}/60 s`);
    assert.deepEqual(baseline.random.snapshot(), observed.random.snapshot(),
      `RNG parity at ${tick}/60 s`);
    const seconds = tick / 60;
    if (!checkpointSeconds.includes(seconds)) continue;
    const checkpoint = compareCheckpoint(seconds, baseline, observed, baselineEvents, observedEvents);
    checkpoint.fieldResidual = observed.observer.auditField();
    checkpoints.push(checkpoint);
  }

  const observerReceipt = observed.observer.receipt();
  const final = checkpoints.at(-1);
  const result = {
    seed,
    parity: { ticksCompared: ticks, exactTrajectoryEveryTick: true, rngEveryTick: true,
      exactWorldCheckpoints: checkpoints.length, eventDigestsEqual: true,
      observerReadsDidNotChangeSampleReturns: true },
    checkpoints,
    observer: observerReceipt,
    run: {
      totalSpawned: observed.controller.totalSpawned,
      totalRetired: observed.controller.totalRetired,
      activeAtEnd: observed.controller.agents.length,
      plateCount: observed.controller.trailPlateBirth.getPlates().length,
      noduleCount: observed.controller.materialStratigraphy.getSnapshot().nodules.length,
      firstPlateSeconds: observedEvents.plateBirthTimes[0] ?? null
    }
  };
  result.validity = {
    observer: observerReceipt.validity.ok,
    noCapTouches: observerReceipt.field.capTouches === 0,
    nodeResidualWithinRegisteredGate: checkpoints.every(item => item.fieldResidual.residualRatio <= 1e-4),
    allSampleReconstructionWithinTolerance: observerReceipt.validity.samplesOutsideReconstructionTolerance === 0
  };
  result.validity.ok = Object.values(result.validity).every(value => value === true);
  assert.equal(result.validity.ok, true, `observer attribution validity for seed ${seed}`);
  assert.equal(final.state.totalSpawned, result.run.totalSpawned);
  await Promise.all([baseline.controller.destroy(), observed.controller.destroy()]);
  return result;
}

function createRun(seed, withObserver) {
  const random = countedLcg(seed);
  const controller = new AntController({ random: random.next });
  const observer = withObserver ? new AntPheromoneProvenanceObserver().attach(controller) : null;
  return { controller, random, observer };
}

function compareCheckpoint(seconds, baseline, observed, baselineEvents, observedEvents) {
  const left = checkpoint(baseline, baselineEvents);
  const right = checkpoint(observed, observedEvents);
  assert.deepEqual(right, left, `full production state parity at ${seconds}s`);
  return { seconds, ...right, equal: true };
}

function checkpoint(run, events) {
  const { controller, random } = run;
  return {
    state: {
      simulationTimeMs: controller.simulationTimeMs,
      totalSpawned: controller.totalSpawned,
      totalRetired: controller.totalRetired,
      activeAgents: controller.agents.length,
      nextAgentId: controller.nextAgentId,
      nextSpawnTimeMs: controller.nextSpawnTimeMs,
      agentsSha256: sha256(JSON.stringify(controller.agents)),
      rng: random.snapshot(),
      activation: controller.colonyActivation.getSnapshot()
    },
    pheromoneSha256: sha256TypedArray(controller.field.values),
    surface: { sha256: sha256TypedArray(controller.surfaceField.values),
      totalFootContacts: controller.surfaceField.totalFootContacts },
    platesSha256: sha256(stableStringify(controller.trailPlateBirth.getSnapshot())),
    materialSha256: sha256(stableStringify(controller.materialStratigraphy.getSnapshot())),
    events: events.snapshot()
  };
}

function observeEvents(controller) {
  const hash = createHash('sha256');
  const counts = {};
  const plateBirthTimes = [];
  controller.subscribe(event => {
    if (!['foot-contact', 'plate-birth', 'sphere-birth'].includes(event.type)) return;
    counts[event.type] = (counts[event.type] || 0) + 1;
    hash.update(`${event.type}\n${stableStringify(event.payload)}\n`);
    if (event.type === 'plate-birth' && Number.isFinite(event.payload?.bornAtSimulationTimeMs)) {
      plateBirthTimes.push(event.payload.bornAtSimulationTimeMs / 1000);
    }
  });
  return { counts, plateBirthTimes,
    snapshot() { return { counts: { ...counts }, digest: hash.copy().digest('hex') }; } };
}

function runSignature(controller) {
  return JSON.stringify({ simulationTimeMs: controller.simulationTimeMs,
    totalSpawned: controller.totalSpawned, totalRetired: controller.totalRetired,
    nextAgentId: controller.nextAgentId, nextSpawnTimeMs: controller.nextSpawnTimeMs,
    agents: controller.agents });
}

function poolSeeds(seedResults) {
  const allReads = seedResults.map(seed => seed.observer.reads.all);
  const fieldSignal = sum(allReads.map(item => item.sampledProductionSignal));
  const pooledCategories = {};
  for (const name of ['self', 'aliveOther', 'retired']) {
    const categories = allReads.map(item => item.categories[name]);
    const sampledSignal = sum(categories.map(item => item.sampledSignal));
    const weightedMeanAge = categories.reduce((total, item) => total
      + (item.sampledSignal || 0) * (item.signalWeightedMeanAgeSeconds || 0), 0);
    const weightedSecond = categories.reduce((total, item) => total + (item.sampledSignal || 0)
      * ((item.signalWeightedAgeSdSeconds || 0) ** 2 + (item.signalWeightedMeanAgeSeconds || 0) ** 2), 0);
    const meanAge = sampledSignal ? weightedMeanAge / sampledSignal : null;
    pooledCategories[name] = {
      sampledSignal,
      fractionOfProductionSamples: fieldSignal ? sampledSignal / fieldSignal : null,
      signalWeightedMeanAgeSeconds: meanAge,
      signalWeightedAgeSdSeconds: sampledSignal
        ? Math.sqrt(Math.max(0, weightedSecond / sampledSignal - meanAge ** 2)) : null
    };
  }
  return {
    seedCount: seedResults.length,
    rawSampleCalls: sum(allReads.map(item => item.rawSampleCalls)),
    positiveProductionSampleReads: sum(allReads.map(item => item.positiveProductionSampleReads)),
    sampledProductionSignal: fieldSignal,
    signalFractions: pooledCategories,
    retiredAuthorReadFrequency: sum(allReads.map(item => item.retiredAuthorReadCount))
      / Math.max(1, sum(allReads.map(item => item.positiveProductionSampleReads))),
    retiredReadCount: sum(allReads.map(item => item.retiredAuthorReadCount)),
    caveat: 'Pooled signal fractions and age moments sum raw production sample reads across seeds; this is not a unique-location or behavioral-causality estimate.'
  };
}

function countedLcg(seed) {
  let state = seed >>> 0;
  let calls = 0;
  return {
    next() { state = (1664525 * state + 1013904223) >>> 0; calls += 1; return state / 0x100000000; },
    snapshot() { return { state, calls }; }
  };
}

function sha256(text) { return createHash('sha256').update(text).digest('hex'); }
function sha256TypedArray(values) {
  return createHash('sha256').update(Buffer.from(values.buffer, values.byteOffset, values.byteLength)).digest('hex');
}
function stableStringify(value) { return JSON.stringify(canonical(value)); }
function canonical(value) {
  if (ArrayBuffer.isView(value)) return { type: value.constructor.name, values: Array.from(value) };
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Map) return [...value.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([key, item]) => [canonical(key), canonical(item)]);
  if (value instanceof Set) return [...value].map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonical(value[key])]));
  return value;
}
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function parseArguments(values) {
  const result = new Map();
  for (const item of values) {
    const split = item.indexOf('=');
    if (split > 0) result.set(item.slice(0, split), item.slice(split + 1));
  }
  return result;
}
function parseSeeds(value) {
  const parsed = value.split(',').map(item => Number(item.trim()));
  if (!parsed.length || parsed.some(seed => !Number.isSafeInteger(seed) || seed < 0)) {
    throw new TypeError('--seeds requires comma-separated non-negative integers.');
  }
  return parsed;
}

async function persist() { await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`); }
