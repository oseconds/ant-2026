import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { AntController, materialLayerCountAtSnapshot, materialLocomotionMultiplier } from '../src/lib/agents/ant/AntController.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DT = 1 / 60;
const DEFAULT_SEEDS = [20261005, 20261006, 20261007];
const DEFAULT_AGES = [200, 350, 500];
const SOURCE_PATHS = ['AGENTS.md', 'docs/ant/README.md', 'docs/ant/world-model.md',
  'scripts/ant-material-causal-tail.js', 'src/lib/agents/ant/AntController.js',
  'tests/ant-material-causal-tail.test.js',
  'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/LocalOccupancy.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/ColonyActivation.js'];
const BASELINE = '37131e0c408a9692ecc364ef7298a71c5e7182ad';
const PROTECTED_PATHS = ['AGENTS.md', 'package.json', 'package-lock.json',
  ...SOURCE_PATHS.filter(path => path.startsWith('src/lib/agents/ant/'))];
const CLI = new Map(process.argv.slice(2).map(arg => {
  const i = arg.indexOf('='); return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
}));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export function countedLcg(state, calls = 0) {
  let value = state >>> 0;
  const random = () => { random.calls += 1; value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 0x100000000; };
  random.calls = calls;
  random.state = () => value;
  return random;
}

export function forkController(source) {
  assert.equal(typeof source.random?.state, 'function', 'fork requires the counted LCG used by this runner');
  const random = countedLcg(source.random.state(), source.random.calls);
  const copy = cloneGraph(source, new Map(), new Set(['listeners', 'random', 'audioBridge', '_events']));
  copy.listeners = new Set();
  copy.random = random;
  copy.audioBridge = null;
  return copy;
}

export function installAccelerationProbe(controller, antId, { factor = 1, divisor = null, onCall = () => {} } = {}) {
  assert.ok(Number.isFinite(factor) && factor > 0);
  if (divisor !== null) assert.ok(Number.isFinite(divisor) && divisor > 0);
  const ant = controller.agents.find(item => item.id === antId);
  assert.ok(ant, 'focal ant must be active at intervention entry');
  const descriptor = Object.getOwnPropertyDescriptor(ant, 'accelerateToward');
  const original = ant.accelerateToward;
  let calls = 0;
  ant.accelerateToward = function (speed, dt) {
    calls += 1;
    onCall({ ant: this, speed, dt, calls });
    this.targetSpeed = divisor === null ? speed * factor : speed / divisor;
    return original.call(this, this.targetSpeed, dt);
  };
  return () => {
    if (descriptor) Object.defineProperty(ant, 'accelerateToward', descriptor);
    else delete ant.accelerateToward;
    assert.equal(calls, 1, 'focal acceleration intervention must run once');
  };
}

async function main() {
  const started = performance.now();
  const head = git(['rev-parse', 'HEAD']);
  git(['merge-base', '--is-ancestor', BASELINE, 'HEAD']);
  for (const path of PROTECTED_PATHS)
    assert.equal((await readFile(resolve(ROOT, path), 'utf8')).replaceAll('\r\n', '\n'),
      gitBytes([BASELINE + ':' + path]).toString('utf8').replaceAll('\r\n', '\n'), `baseline source changed: ${path}`);
  const seeds = listArg('--seeds', DEFAULT_SEEDS);
  const ages = listArg('--ages', DEFAULT_AGES);
  const seconds = Number(CLI.get('--seconds') || 600);
  const out = resolve(ROOT, String(CLI.get('--output') || 'docs/ant/evidence/2026-10-12-material-causal-tail/data'));
  assert.ok(seeds.length && seeds.every(Number.isInteger));
  assert.ok(ages.length && ages.every(age => Number.isFinite(age) && age >= 0 && age < seconds));
  assert.ok(Number.isInteger(seconds) && seconds > 0 && seconds <= 600);
  await mkdir(out, { recursive: true });
  assert.equal((await readdir(out)).length, 0, 'evidence output directory must be empty');
  const sourceHashes = await hashSources();
  const baselineSourceHashes = Object.fromEntries(await Promise.all(SOURCE_PATHS
    .filter(path => !['scripts/ant-material-causal-tail.js', 'tests/ant-material-causal-tail.test.js'].includes(path))
    .map(async path => [path, rawHash(gitBytes([BASELINE + ':' + path]))])));
  const runs = [];
  for (const seed of seeds) {
    const result = await runSeed({ seed, ages, seconds });
    runs.push(result);
    await writeFile(resolve(out, `seed-${seed}-focal-ticks.csv`), csv(result.focalRows));
    await writeFile(resolve(out, `seed-${seed}-world-seconds.csv`), csv(result.worldRows));
    console.log(JSON.stringify({ seed, selected: result.trials.map(t => ({ ageSeconds: t.requestedAgeSeconds,
      selectedAtSeconds: t.selectedAtSeconds, focalAntId: t.focalAntId })), naturalEnd: seconds,
    wallSeconds: Number(((performance.now() - started) / 1000).toFixed(1)) }));
  }
  assert.deepEqual(await hashSources(), sourceHashes, 'source files changed during evidence run');
  const manifest = {
    schemaVersion: 1, baselineCommit: BASELINE, baselineHead: head,
    baselineComparison: 'Protected text matches Git baseline after CRLF-to-LF comparison; exact executed working bytes and Git blob bytes are hashed separately.',
    node: process.version, seeds, requestedAgesSeconds: ages, seconds, hz: 60, dtSeconds: DT,
    selection: 'For each requested age, first tick at or after that age with L>0; lowest numeric ant ID among eligible active ants. No post-selection conditions.',
    intervention: 'One focal AntAgent.accelerateToward call has its speed argument divided by tick-entry m(L); original method executes once. Heading, intent, all other ants and controller law are unchanged. All runs use natural default-On production law.',
    fork: 'Prototype-preserving graph clone of initialized controller, preserving Map/Set/typed-array state and graph aliases; listeners/audioBridge excluded; counted LCG state and call count copied into an independent closure; no constructor or init rerun.',
    rng: 'LCG (Math.imul(state,1664525)+1013904223)>>>0, fixed 1/60 tick, no audio bridge.',
    spliceLabels: { mobileOnly: 'mobile/RNG/lifecycle block sufficiency probe', worldOnly: 'environment/material block sufficiency probe',
      pheromoneOnly: 'pheromone instance sufficiency probe', fullRestore: 'complete control restore negative control' },
    spliceBoundary: 'At first joint L=0 tick entry after the one-tick impulse. Branches run 10 seconds; no additive or percent/path decomposition claim.',
    thresholds: { numeric: 1e-12, position: 1e-5, speed: 1e-5, heading: 1e-4, displacement: 1e-7,
      interpretation: 'Descriptive coordinate-scale cutoffs, not perceptual or biological significance.' },
    baselineSourceHashes, workingSourceHashes: sourceHashes,
    reproduction: `node scripts/ant-material-causal-tail.js --seeds=${seeds.join(',')} --ages=${ages.join(',')} --seconds=${seconds} --output=${CLI.get('--output') || 'docs/ant/evidence/2026-10-12-material-causal-tail/data'}`,
    files: ['manifest.json', 'trials.json', ...seeds.flatMap(seed => [`seed-${seed}-focal-ticks.csv`, `seed-${seed}-world-seconds.csv`])]
  };
  await writeJson(out, 'trials.json', { runs: runs.map(run => ({ seed: run.seed, naturalOn: run.naturalOn,
    trials: run.trials.map(summarizeTrial) })) });
  manifest.files.push('source-hashes.json');
  await writeJson(out, 'source-hashes.json', { baselineSourceHashes, workingSourceHashes: sourceHashes });
  await writeJson(out, 'manifest.json', manifest);
  assert.deepEqual(await hashSources(), sourceHashes, 'source files changed during evidence run');
}

async function runSeed({ seed, ages, seconds }) {
  const random = countedLcg(seed);
  const natural = new AntController({ random });
      const naturalEvents = attachEvents(natural);
  await natural.init();
  const trials = ages.map(requestedAgeSeconds => ({ requestedAgeSeconds, phase: 'seeking', startedAtTick: null,
    selectedAtSeconds: null, focalAntId: null, selectedL: null, initialExposureTicks: 0, control: null,
    treatment: null, treatmentWindow: null, firstJointExitSeconds: null, offBouts: [], branches: null,
    branchTicks: 0, censored: null, jointReentries: 0, metrics: newMetrics(),
    firstDivergence: { rng: null, contacts: null, material: null } }));
  const exposureTicks = new Map();
  const naturalEventCounts = { contactGroups: 0, contactPoints: 0, plateBirths: 0, nodules: 0, errors: 0 };
  const naturalEventWindow = emptyEvents();
  const focalRows = [], worldRows = [];
  try {
    for (let tick = 0; tick < seconds * 60; tick += 1) {
      const time = natural.simulationTimeMs / 1000;
      const snap = natural.materialStratigraphy.getSnapshot();
      for (const trial of trials) if (trial.phase === 'seeking' && tick >= Math.ceil(trial.requestedAgeSeconds * 60)) {
        const eligible = natural.agents.map(ant => ({ ant, L: materialLayerCountAtSnapshot(snap, ant.x, ant.y) }))
          .filter(item => item.L > 0).sort((a, b) => antNumber(a.ant.id) - antNumber(b.ant.id));
        if (eligible.length) startTrial(trial, natural, eligible[0], tick, time, exposureTicks);
      }
      for (const ant of natural.agents) {
        const L = materialLayerCountAtSnapshot(snap, ant.x, ant.y);
        exposureTicks.set(ant.id, L ? (exposureTicks.get(ant.id) || 0) + 1 : 0);
      }
      clearEvents(naturalEvents);
      natural.tick(DT);
      const natEventSnapshot = cloneGraph(naturalEvents);
      naturalEventCounts.contactGroups += natEventSnapshot.contacts.length;
      naturalEventCounts.contactPoints += natEventSnapshot.contacts.reduce((n, event) => n + (event.contacts?.length || 0), 0);
      naturalEventCounts.plateBirths += natEventSnapshot.plates.length;
      naturalEventCounts.nodules += natEventSnapshot.nodules.length;
      naturalEventCounts.errors += natEventSnapshot.errors.length;
      appendEvents(naturalEventWindow, natEventSnapshot);
      if (tick % 60 === 59 || tick === seconds * 60 - 1) worldRows.push(worldRow({ seed, branch: 'natural-On', time: (tick + 1) / 60,
        controller: natural, events: naturalEventWindow, random, baseline: null }));
      if (tick % 60 === 59 || tick === seconds * 60 - 1) clearEvents(naturalEventWindow);
      for (const trial of trials) if (trial.phase === 'running') {
        const entryTime = trial.control.simulationTimeMs / 1000;
        const controlL = focalLayer(trial.control, trial.focalAntId);
        const treatmentL = focalLayer(trial.treatment, trial.focalAntId);
        const controlAliveAtEntry = trial.control.agents.some(a => a.id === trial.focalAntId);
        const treatmentAliveAtEntry = trial.treatment.agents.some(a => a.id === trial.focalAntId);
        if ((trial.control.random.state() !== trial.treatment.random.state()
          || trial.control.random.calls !== trial.treatment.random.calls) && !trial.firstDivergence.rng)
          trial.firstDivergence.rng = { timeSeconds: entryTime, controlState: trial.control.random.state(), treatmentState: trial.treatment.random.state(),
            controlCalls: trial.control.random.calls, treatmentCalls: trial.treatment.random.calls };
        if (controlAliveAtEntry && controlL === 0 && !trial.firstControlExitSeconds) trial.firstControlExitSeconds = entryTime;
        if (treatmentAliveAtEntry && treatmentL === 0 && !trial.firstTreatmentExitSeconds) trial.firstTreatmentExitSeconds = entryTime;
        if (!trial.firstJointExitSeconds && tick > trial.interventionTick && controlAliveAtEntry
          && treatmentAliveAtEntry && controlL === 0 && treatmentL === 0) {
          trial.firstJointExitSeconds = entryTime;
          trial.branches = await runSpliceProbes(trial, entryTime);
          trial.spliceDone = true;
        }
        if (controlAliveAtEntry && treatmentAliveAtEntry && controlL === 0 && treatmentL === 0) {
          const last = trial.offBouts.at(-1);
          if (last?.endTick === tick) last.endTick = tick + 1;
          else trial.offBouts.push({ startTick: tick, endTick: tick + 1, durationSeconds: DT });
          trial.wasJointOff = true;
        } else if (trial.wasJointOff && (controlL > 0 || treatmentL > 0)) {
          trial.jointReentries += 1; trial.wasJointOff = false;
        }
        const cc = captureEvents(trial.control, trial.controlEvents);
        const tt = captureEvents(trial.treatment, trial.treatmentEvents);
        const eventDiff = !same(cc.contacts, tt.contacts);
        if (eventDiff && !trial.firstDivergence.contacts) trial.firstDivergence.contacts = { timeSeconds: entryTime, control: cc, treatment: tt };
        const cb = trial.control.trailPlateBirth, tb = trial.treatment.trailPlateBirth;
        if (!trial.firstDivergence.material && (cc.plates.length || tt.plates.length || cb.plates.length !== tb.plates.length
          || cb.birthRecords.length !== tb.birthRecords.length)
          && !same([cb.plates, cb.birthRecords], [tb.plates, tb.birthRecords]))
          trial.firstDivergence.material = { timeSeconds: entryTime, controlPlates: cb.plates.length,
            treatmentPlates: tb.plates.length, controlBirths: cb.birthRecords.length, treatmentBirths: tb.birthRecords.length };
        clearEvents(trial.controlEvents); clearEvents(trial.treatmentEvents);
        const beforeC = trial.control.agents.find(a => a.id === trial.focalAntId);
        const beforeT = trial.treatment.agents.find(a => a.id === trial.focalAntId);
        const controlOccupancy = beforeC ? trial.control.occupancy.sense(beforeC, trial.control.agents) : null;
        const treatmentOccupancy = beforeT ? trial.treatment.occupancy.sense(beforeT, trial.treatment.agents) : null;
        const cPre = beforeC && { ...antRow(beforeC), topPlateId: topPlateId(trial.control, beforeC) };
        const tPre = beforeT && { ...antRow(beforeT), topPlateId: topPlateId(trial.treatment, beforeT) };
        if (tick === trial.interventionTick) {
          let shamCalls = 0, probeState = null, shamState = null;
          const removeControlProbe = installAccelerationProbe(trial.control, trial.focalAntId, {
            onCall: info => { shamCalls += 1; shamState = { heading: info.ant.heading, intentHeading: info.ant.intentHeading }; }
          });
          const removeTreatmentProbe = installAccelerationProbe(trial.treatment, trial.focalAntId, {
            divisor: materialLocomotionMultiplier(trial.selectedL),
            onCall: info => { trial.intendedSpeed = info.speed; trial.actualSpeed = info.speed / materialLocomotionMultiplier(trial.selectedL);
              probeState = { heading: info.ant.heading, intentHeading: info.ant.intentHeading }; }
          });
          try { trial.control.tick(DT); trial.treatment.tick(DT); }
          finally { removeControlProbe(); removeTreatmentProbe(); }
          assert.equal(shamCalls, 1); assert.ok(probeState && shamState);
          assert.equal(probeState.heading, shamState.heading, 'heading remains equal before acceleration');
          assert.equal(probeState.intentHeading, shamState.intentHeading, 'intent remains equal before acceleration');
          assert.equal(trial.control.random.state(), trial.treatment.random.state());
          assert.equal(trial.control.random.calls, trial.treatment.random.calls);
          assert.equal(trial.treatment.agents.find(a => a.id === trial.focalAntId)?.targetSpeed,
            trial.intendedSpeed / materialLocomotionMultiplier(trial.selectedL));
          trial.treatmentWindow = { endTick: tick + 1, treatmentSeconds: DT, factor: trial.interventionFactor,
            intendedSpeed: trial.intendedSpeed, actualSpeed: trial.actualSpeed, before: trial.interventionBefore };
        } else { trial.control.tick(DT); trial.treatment.tick(DT); }
        const cPost = trial.control.agents.find(a => a.id === trial.focalAntId);
        const tPost = trial.treatment.agents.find(a => a.id === trial.focalAntId);
        const row = focalRow({ seed, trial, tick, timeSeconds: entryTime, controlL, treatmentL,
          cPre, tPre, cPost: cPost && antRow(cPost), tPost: tPost && antRow(tPost),
          controlOccupancy, treatmentOccupancy,
          controlEvents: captureEvents(trial.control, trial.controlEvents), treatmentEvents: captureEvents(trial.treatment, trial.treatmentEvents) });
        appendEvents(trial.controlEventWindow, captureEvents(trial.control, trial.controlEvents));
        appendEvents(trial.treatmentEventWindow, captureEvents(trial.treatment, trial.treatmentEvents));
        row.controlRngState = trial.control.random.state(); row.treatmentRngState = trial.treatment.random.state();
        row.controlRngCalls = trial.control.random.calls; row.treatmentRngCalls = trial.treatment.random.calls;
        row.jointlyUnexposedAtEntry = controlAliveAtEntry && treatmentAliveAtEntry && controlL === 0 && treatmentL === 0;
        if (controlAliveAtEntry && treatmentAliveAtEntry) focalRows.push(row);
        updateMetrics(trial.metrics, row);
        trial.controlTicks = (trial.controlTicks || 0) + 1;
        if (tick % 60 === 59 || tick === seconds * 60 - 1) {
          for (const [label, branch, eventWindow] of [['control', trial.control, trial.controlEventWindow],
            ['treatment', trial.treatment, trial.treatmentEventWindow]]) {
            worldRows.push(worldRow({ seed, branch: `${trial.requestedAgeSeconds}-${label}`, time: (tick + 1) / 60,
              controller: branch, events: eventWindow, random: branch.random, baseline: trial.control,
              focalAntId: trial.focalAntId }));
            clearEvents(eventWindow);
          }
        }
        if (trial.spliceDone && trial.branchTicks < 600) trial.branchTicks += 1;
        if ((!cPost || !tPost) && !trial.censored) trial.censored = { timeSeconds: (tick + 1) / 60,
          controlAlive: Boolean(cPost), treatmentAlive: Boolean(tPost), reason: 'focal retirement' };
      }
    }
    for (const trial of trials) if (trial.phase === 'seeking') trial.censored = { reason: 'no eligible L>0 ant at or after requested age' };
    for (const trial of trials) if (trial.control) assert.ok(same(auditState(natural), auditState(trial.control)),
      'full natural replay and no-op control fork must match at run end');
    return { seed, trials, focalRows, worldRows, naturalOn: naturalSummary(natural, naturalEventCounts, seconds) };
  } finally {
    for (const trial of trials) { if (trial.control) await trial.control.destroy(); if (trial.treatment) await trial.treatment.destroy(); }
    await natural.destroy();
  }
}

function startTrial(trial, source, chosen, tick, time, exposureTicks) {
  trial.focalAntId = chosen.ant.id; trial.selectedL = chosen.L; trial.selectedAtSeconds = time;
  trial.startedAtTick = tick; trial.initialExposureTicks = exposureTicks.get(chosen.ant.id) || 0;
  trial.control = forkController(source); trial.treatment = forkController(source);
  trial.controlEvents = attachEvents(trial.control); trial.treatmentEvents = attachEvents(trial.treatment);
  trial.controlEventWindow = emptyEvents(); trial.treatmentEventWindow = emptyEvents();
  assert.ok(same(auditState(source), auditState(trial.control)), 'fork must exactly preserve production state');
  assert.ok(same(auditState(source), auditState(trial.treatment)), 'treatment fork must exactly preserve production state');
  trial.interventionFactor = 1 / materialLocomotionMultiplier(chosen.L);
  const before = trial.treatment.agents.find(a => a.id === chosen.ant.id);
  trial.interventionBefore = antRow(before); trial.interventionTick = tick;
  trial.phase = 'running';
}

async function runSpliceProbes(trial, startTimeSeconds) {
  const sourceC = trial.control, sourceT = trial.treatment;
  const branches = [
    ['mobileOnly', ['agents', 'gaitController', 'bodyPoseController', 'gasterDeposition', 'random',
      'simulationTimeMs', 'nextSpawnTimeMs', 'nextAgentId', 'totalSpawned', 'totalRetired', 'accumulatorMs']],
    ['worldOnly', ['field', 'surfaceField', 'trailPlateBirth', 'materialStratigraphy', 'colonyActivation']],
    ['pheromoneOnly', ['field']],
    ['fullRestore', null]
  ];
  const result = {};
  for (const [name, keys] of branches) {
    const base = forkController(sourceC);
    if (keys) copyBlock(sourceT, base, keys);
    result[name] = await runProbeBranch(base, sourceC, trial.focalAntId, 600, name, startTimeSeconds);
    await base.destroy();
  }
  return result;
}

async function runProbeBranch(controller, controlSource, focalId, ticks, label, startTimeSeconds) {
  const control = forkController(controlSource), focalStats = [], eventHistory = { a: [], b: [] };
  attachEvents(controller); attachEvents(control);
  const entryLayerCount = focalLayer(controller, focalId), entryControlLayerCount = focalLayer(control, focalId);
  let previousLayerCount = entryLayerCount, reentries = 0, bothAliveSamples = 0, jointlyUnexposedSamples = 0;
  let firstRngDivergenceSeconds = null, firstFocalDifference = null, maxPositionBeforeRngDivergence = 0;
  for (let i = 0; i < ticks; i += 1) {
    const c = controller.agents.find(a => a.id === focalId), b = control.agents.find(a => a.id === focalId);
    const currentLayerCount = focalLayer(controller, focalId);
    const controlLayerCount = focalLayer(control, focalId);
    const rngAligned = controller.random.state() === control.random.state() && controller.random.calls === control.random.calls;
    if (!rngAligned && firstRngDivergenceSeconds === null) firstRngDivergenceSeconds = {
      secondsFromRestart: i * DT, branchState: controller.random.state(), controlState: control.random.state(),
      branchCalls: controller.random.calls, controlCalls: control.random.calls };
    const before = c && b ? { position: Math.hypot(c.x - b.x, c.y - b.y), speed: Math.abs(speed(c) - speed(b)),
      heading: Math.abs(angleDiff(c.heading, b.heading)) } : null;
    if (c && b) {
      bothAliveSamples += 1;
      if (currentLayerCount === 0 && controlLayerCount === 0) jointlyUnexposedSamples += 1;
      if (rngAligned) maxPositionBeforeRngDivergence = Math.max(maxPositionBeforeRngDivergence, before.position);
      if (!firstFocalDifference && Math.max(before.position, before.speed, before.heading) > 1e-12)
        firstFocalDifference = { secondsFromRestart: i * DT, position: before.position, speed: before.speed, headingRadians: before.heading,
          branchLayerCount: currentLayerCount, controlLayerCount };
    }
    if (previousLayerCount === 0 && currentLayerCount > 0) reentries += 1;
    clearEvents(controller._events); clearEvents(control._events);
    controller.tick(DT); control.tick(DT);
    eventHistory.a.push(captureEvents(controller, controller._events));
    eventHistory.b.push(captureEvents(control, control._events));
    if (before) focalStats.push({ ...before, contacts: controller._events?.contacts?.length || 0 });
    previousLayerCount = currentLayerCount;
  }
  const final = compareControllers(controller, control);
  const flatA = eventHistory.a.flatMap(t => t.contacts), flatB = eventHistory.b.flatMap(t => t.contacts);
  final.contactEvents = { a: flatA.length, b: flatB.length, payloadsEqual: same(flatA, flatB),
    aHash: hash(flatA), bHash: hash(flatB) };
  await control.destroy();
  return { label, startTimeSeconds, horizonSeconds: ticks * DT, comparedTicks: ticks, entryLayerCount, entryControlLayerCount,
    entryInterpretation: entryLayerCount === 0 ? 'jointly unexposed entry' : 'hybrid begins exposed; production law remains active',
    bothAliveSamples, jointlyUnexposedSamples, firstRngDivergenceSeconds, firstFocalDifference,
    maxFocalPositionBeforeRngDivergence: maxPositionBeforeRngDivergence,
    focalReentries: reentries, finalLayerCount: focalLayer(controller, focalId),
    focalPositionMax: max(focalStats.map(x => x.position)), focalSpeedMax: max(focalStats.map(x => x.speed)),
    finalComparison: final };
}

function copyBlock(source, target, keys) {
  const selected = Object.fromEntries(keys.map(key => [key, key === 'random'
    ? countedLcg(source.random.state(), source.random.calls) : source[key]]));
  const cloned = cloneGraph(selected);
  for (const key of keys) target[key] = cloned[key];
}

function compareControllers(a, b) {
  const pa = a.field.getSnapshot(), pb = b.field.getSnapshot();
  const sa = a.surfaceField.getSnapshot(), sb = b.surfaceField.getSnapshot();
  const ea = a._events || { contacts: [], plates: [], nodules: [], errors: [] };
  const eb = b._events || { contacts: [], plates: [], nodules: [], errors: [] };
  return { agents: compareAgentMaps(a.agents, b.agents), fullStateExact: same(auditState(a), auditState(b)),
    pheromone: arrayDiff(pa.values, pb.values), surface: arrayDiff(sa.values, sb.values),
    contactEvents: { a: ea.contacts.length, b: eb.contacts.length, payloadsEqual: same(ea.contacts, eb.contacts),
      aHash: hash(ea.contacts), bHash: hash(eb.contacts) },
    plates: { a: a.trailPlateBirth.plates.length, b: b.trailPlateBirth.plates.length,
      descriptorsEqual: same(a.trailPlateBirth.plates, b.trailPlateBirth.plates) },
    nodules: { a: a.materialStratigraphy.nodules.length, b: b.materialStratigraphy.nodules.length },
    rng: { aState: a.random.state(), bState: b.random.state(), aCalls: a.random.calls, bCalls: b.random.calls } };
}

function compareAgentMaps(a, b, excludeId = null) {
  const bm = new Map(b.map(x => [x.id, x])); let matched = 0, maxPosition = 0, maxSpeed = 0, maxHeading = 0;
  for (const x of a) { if (x.id === excludeId) continue; const y = bm.get(x.id); if (!y) continue; matched += 1;
    maxPosition = Math.max(maxPosition, Math.hypot(x.x - y.x, x.y - y.y));
    maxSpeed = Math.max(maxSpeed, Math.abs(speed(x) - speed(y)));
    maxHeading = Math.max(maxHeading, Math.abs(angleDiff(x.heading, y.heading)));
  }
  return { aCount: a.length, bCount: b.length, matched, maxPosition, maxSpeed, maxHeading };
}

function worldRow({ seed, branch, time, controller, events, random, baseline, focalAntId = null }) {
  const pheromone = controller.field.getSnapshot(), surface = controller.surfaceField.getSnapshot();
  const material = controller.materialStratigraphy.getSnapshot(), p = pheromone.values, s = surface.values;
  const baseP = baseline?.field.getSnapshot(), baseS = baseline?.surfaceField.getSnapshot();
  return { seed, branch, timeSeconds: time, population: controller.agents.length,
    spawned: controller.totalSpawned, retired: controller.totalRetired,
    matchedAgentDivergence: baseline ? JSON.stringify(compareAgentMaps(controller.agents, baseline.agents)) : '',
    matchedOtherAntDivergence: baseline ? JSON.stringify(compareAgentMaps(controller.agents, baseline.agents, focalAntId)) : '',
    pheromoneMass: pheromone.totalMass, surfaceMass: sum(s), plateCount: controller.trailPlateBirth.plates.length,
    noduleCount: controller.materialStratigraphy.nodules.length, contactGroups: events.contacts?.length || 0,
    contactPoints: (events.contacts || []).reduce((n, event) => n + (event.contacts?.length || 0), 0),
    contactPayloadHash: hash(events.contacts || []), rngState: random.state(), rngCalls: random.calls,
    pheromoneChecksum: hash(p), surfaceChecksum: hash(s),
    pheromoneL1: baseP ? arrayDiff(p, baseP.values).l1 : 0, pheromoneMaxAbs: baseP ? arrayDiff(p, baseP.values).maxAbs : 0,
    surfaceL1: baseS ? arrayDiff(s, baseS.values).l1 : 0, surfaceMaxAbs: baseS ? arrayDiff(s, baseS.values).maxAbs : 0,
    plateDescriptorsHash: hash(controller.trailPlateBirth.plates), noduleDescriptorsHash: hash(material.nodules) };
}

function focalRow({ seed, trial, tick, timeSeconds, controlL, treatmentL, cPre, tPre, cPost, tPost,
  controlOccupancy, treatmentOccupancy, controlEvents, treatmentEvents }) {
  const cFocalContacts = controlEvents.contacts.filter(event => event.antId === trial.focalAntId);
  const tFocalContacts = treatmentEvents.contacts.filter(event => event.antId === trial.focalAntId);
  const cGait = trial.control.gaitController.ants.get(trial.focalAntId) || null;
  const tGait = trial.treatment.gaitController.ants.get(trial.focalAntId) || null;
  const row = { seed, requestedAgeSeconds: trial.requestedAgeSeconds, selectedAtSeconds: trial.selectedAtSeconds,
    focalAntId: trial.focalAntId, tick, timeSeconds, controlL, treatmentL, controlTopId: cPre?.topPlateId,
    treatmentTopId: tPre?.topPlateId, controlOccupancy: stable(controlOccupancy),
    treatmentOccupancy: stable(treatmentOccupancy), occupancyEqual: same(controlOccupancy, treatmentOccupancy),
    controlGait: stable(cGait), treatmentGait: stable(tGait),
    focalContactPayloadEqual: same(cFocalContacts, tFocalContacts),
    controlFocalContactGroups: cFocalContacts.length,
    treatmentFocalContactGroups: tFocalContacts.length,
    controlFocalContactPoints: cFocalContacts.reduce((n, e) => n + (e.contacts?.length || 0), 0),
    treatmentFocalContactPoints: tFocalContacts.reduce((n, e) => n + (e.contacts?.length || 0), 0),
    controlFocalContactPayload: stable(cFocalContacts), treatmentFocalContactPayload: stable(tFocalContacts),
    colonyContactPayloadEqual: same(controlEvents.contacts, treatmentEvents.contacts),
    controlColonyContactGroups: controlEvents.contacts.length, treatmentColonyContactGroups: treatmentEvents.contacts.length,
    controlColonyContactPayloadHash: hash(controlEvents.contacts), treatmentColonyContactPayloadHash: hash(treatmentEvents.contacts),
    controlAlive: Boolean(cPre), treatmentAlive: Boolean(tPre) };
  for (const [key, c, t] of [['pre', cPre, tPre], ['post', cPost, tPost]]) {
    for (const k of ['x', 'y', 'vx', 'vy', 'heading', 'intentHeading', 'targetSpeed']) {
      row[`control${key}${cap(k)}`] = c?.[k] ?? ''; row[`treatment${key}${cap(k)}`] = t?.[k] ?? '';
      row[`${key}${cap(k)}Diff`] = c && t ? (k === 'heading' || k === 'intentHeading' ? angleDiff(c[k], t[k]) : c[k] - t[k]) : '';
    }
  }
  if (cPre && tPre && cPost && tPost) {
    row.controlDisplacement = Math.hypot(cPost.x - cPre.x, cPost.y - cPre.y);
    row.treatmentDisplacement = Math.hypot(tPost.x - tPre.x, tPost.y - tPre.y);
    row.displacementDiff = row.controlDisplacement - row.treatmentDisplacement;
    trial.cumulativeTravelDifference = (trial.cumulativeTravelDifference || 0)
      + row.controlDisplacement - row.treatmentDisplacement;
    row.cumulativeTravelDifference = trial.cumulativeTravelDifference;
    row.positionDifference = Math.hypot(cPost.x - tPost.x, cPost.y - tPost.y);
    row.speedDifference = speed(cPost) - speed(tPost);
    row.velocityDifference = Math.hypot(cPost.vx - tPost.vx, cPost.vy - tPost.vy);
  }
  return row;
}

function naturalSummary(c, events, seconds) {
  const pheromone = c.field.getSnapshot().values, surface = c.surfaceField.getSnapshot().values;
  return { seconds, totalTicks: seconds * 60, population: c.agents.length, totalSpawned: c.totalSpawned,
    totalRetired: c.totalRetired, rngState: c.random.state(), rngCalls: c.random.calls,
    plateCount: c.trailPlateBirth.plates.length, noduleCount: c.materialStratigraphy.nodules.length,
    maxLayerCount: Math.max(...c.materialStratigraphy.layerCountByCell), ...events,
    pheromoneSha256: rawHash(pheromone), surfaceSha256: rawHash(surface), agentsJsonSha256: rawHash(JSON.stringify(c.agents)) };
}

function summarizeTrial(t) {
  return { requestedAgeSeconds: t.requestedAgeSeconds, selectedAtSeconds: t.selectedAtSeconds,
    focalAntId: t.focalAntId, selectedL: t.selectedL, initialExposureSeconds: t.initialExposureTicks * DT,
    treatmentEndSeconds: t.interventionTick === undefined ? null : (t.interventionTick + 1) * DT,
    intervention: t.intendedSpeed === undefined ? null : { factor: t.interventionFactor,
      mL: materialLocomotionMultiplier(t.selectedL), intendedSpeed: t.intendedSpeed, actualSpeed: t.actualSpeed },
    firstControlExitSeconds: t.firstControlExitSeconds, firstTreatmentExitSeconds: t.firstTreatmentExitSeconds,
    firstJointExitSeconds: t.firstJointExitSeconds, jointOffBoutCount: t.offBouts.length, jointReentries: t.jointReentries,
    jointOffBouts: t.offBouts.map(b => ({ ...b, durationSeconds: (b.endTick - b.startTick) * DT })),
    firstDivergence: t.firstDivergence, branchProbes: t.branches, rightCensored: t.censored,
    jointlyUnexposedMetrics: t.metrics,
    note: 'Tail extrema and threshold bouts use only jointly unexposed ticks while both focal ants live; no last-difference duration is interpreted as uninterrupted persistence.' };
}

function newMetrics() {
  return { jointlyUnexposedSamples: 0, firstTimeSeconds: null, lastTimeSeconds: null,
    maxPosition: 0, maxSpeed: 0, maxVelocity: 0, maxHeadingRadians: 0, maxDisplacement: 0,
    thresholds: { position1e5: thresholdMetric(), speed1e5: thresholdMetric(),
      heading1e4: thresholdMetric(), displacement1e7: thresholdMetric(), numeric1e12: thresholdMetric() } };
}
function thresholdMetric() { return { samples: 0, bouts: 0, currentBoutTicks: 0, longestBoutTicks: 0 }; }
function updateMetrics(metrics, row) {
  if (!row.jointlyUnexposedAtEntry || !Number.isFinite(row.positionDifference)) {
    for (const metric of Object.values(metrics.thresholds)) metric.currentBoutTicks = 0;
    return;
  }
  metrics.jointlyUnexposedSamples += 1;
  metrics.firstTimeSeconds ??= row.timeSeconds; metrics.lastTimeSeconds = row.timeSeconds;
  const values = { position: row.positionDifference, speed: Math.abs(row.speedDifference),
    velocity: Math.abs(row.velocityDifference), heading: Math.abs(row.postHeadingDiff),
    displacement: Math.abs(row.displacementDiff) };
  metrics.maxPosition = Math.max(metrics.maxPosition, values.position);
  metrics.maxSpeed = Math.max(metrics.maxSpeed, values.speed);
  metrics.maxVelocity = Math.max(metrics.maxVelocity, values.velocity);
  metrics.maxHeadingRadians = Math.max(metrics.maxHeadingRadians, values.heading);
  metrics.maxDisplacement = Math.max(metrics.maxDisplacement, values.displacement);
  const tests = [['position1e5', values.position, 1e-5], ['speed1e5', values.speed, 1e-5],
    ['heading1e4', values.heading, 1e-4], ['displacement1e7', values.displacement, 1e-7],
    ['numeric1e12', Math.max(...Object.values(values)), 1e-12]];
  for (const [name, value, threshold] of tests) {
    const metric = metrics.thresholds[name];
    if (value > threshold) {
      metric.samples += 1;
      if (!metric.currentBoutTicks) metric.bouts += 1;
      metric.currentBoutTicks += 1;
      metric.longestBoutTicks = Math.max(metric.longestBoutTicks, metric.currentBoutTicks);
    } else metric.currentBoutTicks = 0;
  }
}

function attachEvents(controller) {
  const events = { contacts: [], plates: [], nodules: [], errors: [] };
  controller._events = events;
  controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') events.contacts.push(cloneGraph(payload));
    else if (type === 'plate-birth') events.plates.push(cloneGraph(payload));
    else if (type === 'sphere-birth') events.nodules.push(cloneGraph(payload));
    else if (type === 'error') events.errors.push(cloneGraph(payload));
  });
  return events;
}

function clearEvents(e) { for (const values of Object.values(e)) if (Array.isArray(values)) values.length = 0; }
function emptyEvents() { return { contacts: [], plates: [], nodules: [], errors: [] }; }
function appendEvents(target, source) { for (const key of Object.keys(target)) target[key].push(...source[key]); }
function captureEvents(controller, events) { return { contacts: cloneGraph(events.contacts), plates: cloneGraph(events.plates),
  nodules: cloneGraph(events.nodules), errors: cloneGraph(events.errors) }; }
export function auditState(controller) {
  const state = {};
  for (const key of Reflect.ownKeys(controller)) if (!['listeners', 'random', 'audioBridge', '_events'].includes(key)) state[key] = controller[key];
  state.rng = { state: controller.random.state(), calls: controller.random.calls };
  return state;
}
function cloneGraph(value, memo = new Map(), skip = new Set()) {
  if (value === null || typeof value !== 'object') return value;
  if (memo.has(value)) return memo.get(value);
  if (ArrayBuffer.isView(value)) {
    const clonedBuffer = cloneGraph(value.buffer, memo);
    const copy = value instanceof DataView ? new DataView(clonedBuffer, value.byteOffset, value.byteLength)
      : new value.constructor(clonedBuffer, value.byteOffset, value.length);
    memo.set(value, copy); return copy;
  }
  if (value instanceof ArrayBuffer) { const copy = value.slice(0); memo.set(value, copy); return copy; }
  if (value instanceof Map) { const copy = new Map(); memo.set(value, copy);
    for (const [k, v] of value) copy.set(cloneGraph(k, memo), cloneGraph(v, memo)); return copy; }
  if (value instanceof Set) { const copy = new Set(); memo.set(value, copy);
    for (const v of value) copy.add(cloneGraph(v, memo)); return copy; }
  if (value instanceof Date) { const copy = new Date(value); memo.set(value, copy); return copy; }
  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value)); memo.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    if (skip.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if ('value' in descriptor) descriptor.value = cloneGraph(descriptor.value, memo);
    try { Object.defineProperty(copy, key, descriptor); } catch { copy[key] = descriptor.value; }
  }
  return copy;
}

function stable(value, parents = new WeakSet()) {
  if (value === null || typeof value !== 'object') return typeof value === 'function' ? `[Function:${value.name}]` : value;
  if (parents.has(value)) return '[Circular]'; parents.add(value);
  let result;
  if (ArrayBuffer.isView(value)) result = { type: value.constructor.name, values: Array.from(value) };
  else if (value instanceof ArrayBuffer) result = { type: 'ArrayBuffer', bytes: Array.from(new Uint8Array(value)) };
  else if (value instanceof Map) result = { type: 'Map', values: [...value].map(([k, v]) => [stable(k, parents), stable(v, parents)]) };
  else if (value instanceof Set) result = { type: 'Set', values: [...value].map(v => stable(v, parents)) };
  else if (Array.isArray(value)) result = value.map(v => stable(v, parents));
  else result = Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k], parents)]));
  parents.delete(value); return result;
}
function same(a, b) { return isDeepStrictEqual(a, b); }

async function hashSources() {
  return Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path => [path,
    createHash('sha256').update(await readFile(resolve(ROOT, path))).digest('hex')])));
}
function listArg(name, fallback) { return String(CLI.get(name) || fallback.join(',')).split(',').map(Number); }
function antNumber(id) { return Number(String(id).replace(/^ant-/, '')); }
function focalLayer(c, id) { const a = c.agents.find(item => item.id === id); return a
  ? materialLayerCountAtSnapshot(c.materialStratigraphy.getSnapshot(), a.x, a.y) : 0; }
function topPlateId(c, ant) { const s = c.materialStratigraphy.getSnapshot();
  const i = Math.round(ant.y * (s.height - 1)) * s.width + Math.round(ant.x * (s.width - 1));
  const plateIndex = s.stratigraphy.topLayerByCell[i]; return plateIndex >= 0 ? s.plates[plateIndex]?.id || '' : ''; }
function antRow(a) { return { id: a.id, x: a.x, y: a.y, vx: a.vx, vy: a.vy, heading: a.heading,
  intentHeading: a.intentHeading, targetSpeed: a.targetSpeed }; }
function speed(a) { return Math.hypot(a.vx, a.vy); }
function angleDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
function arrayDiff(a, b) { let l1 = 0, maxAbs = 0, count = Math.min(a.length, b.length);
  for (let i = 0; i < count; i += 1) { const d = Math.abs(a[i] - b[i]); l1 += d; maxAbs = Math.max(maxAbs, d); }
  return { l1, maxAbs, aLength: a.length, bLength: b.length }; }
function eventSummary(events) { return { contactGroups: events.contacts.length, plateBirthEvents: events.plates.length,
  noduleBirthEvents: events.nodules.length, errors: events.errors.length }; }
function hash(value) { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function rawHash(value) { return createHash('sha256').update(typeof value === 'string'
  ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength)).digest('hex'); }
function git(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
function gitBytes(args) { return execFileSync('git', ['show', ...args], { cwd: ROOT }); }
function sum(values) { let total = 0; for (const value of values) total += value; return total; }
function max(values) { return values.length ? Math.max(...values) : 0; }
function cap(v) { return v[0].toUpperCase() + v.slice(1); }
function csv(rows) { const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return [keys.join(','), ...rows.map(row => keys.map(k => csvCell(row[k])).join(','))].join('\n') + '\n'; }
function csvCell(value) { if (value === null || value === undefined) return ''; const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
async function writeJson(dir, name, value) { await writeFile(resolve(dir, name), JSON.stringify(value, null, 2) + '\n'); }
