import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { materialLocomotionMultiplier as m10 } from '../src/lib/agents/ant/AntController.js';
import { executeScenario as execute10 } from './ant-g-production-candidate-natural.js';
import { descriptiveSpacing, enumeratePlateauMaxima, neighbors8 } from './ant-opportunity-core.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-29-retained-material-locomotion-20pct-screen';
const DATA = `${PACKAGE}/data`;
const G_DATA = 'docs/ant/evidence/2026-10-25-g-production-candidate-review/data';
const LATE_INPUT = 'docs/ant/evidence/2026-10-29-late-qualified-opportunity-capture/data/late-input.json.gz';
const N = 96, COUNT = N * N, MAP24 = 24, CONTACT_RADIUS = 0.037;
const SEED = 20261005, SECONDS = 600, DT = 1 / 60;
const MAIN_SHA = '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785';
const RESEARCH_PARENT = 'afea7ecc076734a6c9fe8b3ccad7efb11c08c36a';
const BASELINE_RAW_SHA = 'a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414';
const BASELINE_MASK_SHA = 'a62ad65b772db8d040ed9bebf636e8af32d2d185ea65fead4a431262964df0e5';
const WINDOWS = [{ label: '300s', startMs: 279000, endMs: 300000 },
  { label: '600s', startMs: 579000, endMs: 600000 }];
const CHECKPOINTS = [30, 60, 120, 300, 600];
const SOURCE_FILES = [
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/LocalOccupancy.js', 'src/lib/agents/ant/ColonyActivation.js',
  'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'docs/ant/README.md'
];
const AMP_OLD = 'return 1 - 0.10 * (1 - Math.exp(-layerCount / 4));';
const AMP_NEW = 'return 1 - 0.20 * (1 - Math.exp(-layerCount / 4));';
const sha = value => createHash('sha256').update(value).digest('hex');
const indices = mask => Array.from(mask, (value, i) => value ? i : -1).filter(i => i >= 0);
const point = index => ({ x: index % N / (N - 1), y: Math.floor(index / N) / (N - 1) });
const dist = (a, b) => Math.hypot(a % N - b % N, Math.floor(a / N) - Math.floor(b / N)) / (N - 1);
const cli = new Map(process.argv.slice(2).map(arg => {
  const i = arg.indexOf('='); return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (cli.has('--self-test')) await selfTest();
  else if (cli.has('--analyze-only')) await analyzeSaved();
  else await runScreen();
}

async function selfTest() {
  assert.equal(m10(0), 1);
  assert.equal(m10(10000), 0.9);
  const source = await readFile(resolve(ROOT, SOURCE_FILES[0]), 'utf8');
  const at = source.indexOf(AMP_OLD);
  assert.notEqual(at, -1);
  assert.equal(source.indexOf(AMP_OLD, at + 1), -1);
  const shadow = source.replace(AMP_OLD, AMP_NEW);
  assert.equal(shadow.replace(AMP_NEW, AMP_OLD), source, 'only the amplitude expression changes');
  const temporary = await writeShadowModules(source, shadow);
  try {
    const imported = await import(pathToFileURL(temporary.controllerPath).href + '?self-test');
    const values = [0, 1, 4, 10, 10000].map(layer => imported.materialLocomotionMultiplier(layer));
    assert.deepEqual(values, [1, 1 - 0.2 * (1 - Math.exp(-0.25)),
      1 - 0.2 * (1 - Math.exp(-1)), 1 - 0.2 * (1 - Math.exp(-2.5)), 0.8]);
    assert(values.every((value, i) => value <= 1 && value >= 0.8 && (i === 0 || value <= values[i - 1])));
    assert.equal(AMP_NEW.includes('/ 4'), true);
    assert.match(source, /agent\.turnToward\(targetHeading, dt\);\r?\n\s+const cycle/);
    assert.equal(source.includes('if (materialSnapshot) desiredSpeed *= materialLocomotionMultiplier('), true);
    assert.equal(sha(Buffer.from(source)), sha(Buffer.from(source)), 'source is read-only');
  } finally { await cleanupShadow(temporary); }
  console.log('20% manipulation/source self-check passed.');
}

async function runScreen() {
  const authority = await verifyAuthority();
  const baseline = await loadBaseline();
  const thinner = await loadProductionThinner();
  const expectedFrames = baseline.lateInput.frames;
  const controlObserver = createObserver(m10, thinner, expectedFrames);
  const candidateOut = resolve(ROOT, DATA, 'candidate-20pct-run');
  await mkdir(resolve(ROOT, DATA), { recursive: true });
  await ensureEmptyDirectory(candidateOut);
  const controlTemp = await mkdtemp(resolve(ROOT, DATA, '.control-replay-'));
  let temporary;
  try {
    const control = await execute10(SEED, 'G', SECONDS, controlTemp, null,
      controller => controlObserver.attach(controller));
    const controlParity = await verifyControlParity(control, controlTemp, baseline);
    const shadowSource = await readFile(resolve(ROOT, SOURCE_FILES[0]), 'utf8');
    const transformed = shadowSource.replace(AMP_OLD, AMP_NEW);
    temporary = await writeShadowModules(shadowSource, transformed);
    const shadowRunner = await import(pathToFileURL(temporary.runnerPath).href + '?screen');
    const shadowController = await import(pathToFileURL(temporary.controllerPath).href + '?screen');
    const candidateObserver = createObserver(shadowController.materialLocomotionMultiplier,
      thinner, expectedFrames);
    const candidate = await shadowRunner.executeScenario(SEED, 'G', SECONDS, candidateOut, null,
      controller => candidateObserver.attach(controller));
    candidateObserver.finish(SECONDS);
    assert.equal(candidate.seed, SEED);
    assert.equal(candidate.seconds, SECONDS);
    assert.equal(candidate.initialStateSha256, control.initialStateSha256,
      'both arms begin from identical initialized state');
    assert.equal(candidate.invariants.fieldNonfiniteSeconds, 0);
    assert.equal(candidate.invariants.surfaceNonfiniteSeconds, 0);
    assert.equal(candidate.movement.finiteViolations, 0);
    assert.equal(candidate.movement.speedCapViolations, 0);
    assert.equal(candidate.movement.turnCapViolations, 0);
    assert.equal(candidate.movement.overlapViolations, 0);
    assert.equal(candidate.movement.populationCeilingViolations, 0);
    assert.equal(candidate.fieldWrites.writerParityMismatches, 0);
    assert.equal(candidate.fieldWrites.saturatedUpdateCount, 0);

    controlObserver.finish(SECONDS);
    candidateObserver.finish(SECONDS);
    assert.equal(controlObserver.frames.length, 40);
    assert.equal(candidateObserver.frames.length, 40);
    assert.deepEqual(controlObserver.frames.map(frameCore), expectedFrames.map(frameCore),
      '10% replay reproduces frozen current-G B/C/D/E/F/S/material anchors exactly');
    assert.deepEqual(candidateObserver.frames.map(frame => [frame.tick, frame.timeMs]),
      expectedFrames.map(frame => [frame.tick, frame.timeMs]), 'candidate uses same analysis anchors');
    addRecentContext(controlObserver.frames, controlObserver.feet);
    addRecentContext(candidateObserver.frames, candidateObserver.feet);
    assert.deepEqual(controlObserver.frames.map(frameRecent), expectedFrames.map(frameRecent),
      '10% replay reproduces parent recent-contact channels exactly');

    const candidateRaw = JSON.parse(gunzipSync(await readFile(resolve(candidateOut,
      `seed${SEED}-G-raw.json.gz`))));
    const candidateResults = {
      schema: 'ant-retained-material-locomotion-20pct-screen-v1',
      authority,
      baseline: { source: 'frozen current-G production 10% run plus exact read-only control replay',
        seed: SEED, seconds: SECONDS, hz: 60, audio: 'Off',
        rawSha256: baseline.rawSha256, lateInputSha256: baseline.lateInputSha256,
        actualMaskSourceSha256: baseline.strataSha256, controlReplayParity: controlParity },
      manipulation: manipulationTable(),
      control: summarizeRun(control, controlObserver),
      candidate: summarizeRun(candidate, candidateObserver),
      pairedOpportunity: compareOpportunity(controlObserver.frames, candidateObserver.frames),
      pairedCheckpoints: await compareCheckpoints(control, candidate, candidateOut),
      contactSpatial: compareContactMaps(controlObserver, candidateObserver),
      candidateRaw: { file: `data/candidate-20pct-run/seed${SEED}-G-raw.json.gz`,
        sha256: sha(await readFile(resolve(candidateOut, `seed${SEED}-G-raw.json.gz`))),
        positions: candidateRaw.positions.length, contactBuckets: candidateRaw.contactsBySecond.length,
        births: candidateRaw.births.length, contactStreamSha256: candidateRaw.events.contactStreamSha256,
        plateBirthStreamSha256: candidateRaw.events.plateBirthStreamSha256 },
      protocol: { changedOnly: AMP_OLD + ' → ' + AMP_NEW, layerScale: '/4 unchanged',
        scope: 'one matched current-G seed, 600 s at 60 Hz; control replayed and parity-checked; no extra seed',
        noAllocationOrCaptureFeedback: true, noProductionMutation: true,
        opportunityAnchors: expectedFrames.map(frame => ({ tick: frame.tick, timeMs: frame.timeMs })) }
    };
    const pairedFrames = { schema: 'ant-retained-material-locomotion-20pct-paired-anchors-v1',
      provenance: { main: MAIN_SHA, researchParent: RESEARCH_PARENT, seed: SEED, hz: 60, audio: 'Off' },
      protocol: baseline.lateInput.protocol,
      control: controlObserver.frames.map(frameForStorage),
      candidate: candidateObserver.frames.map(frameForStorage) };
    const pairedBytes = gzipSync(JSON.stringify(pairedFrames) + '\n', { level: 9, mtime: 0 });
    await writeFile(resolve(ROOT, DATA, 'paired-anchors.json.gz'), pairedBytes);
    await writeFile(resolve(ROOT, DATA, 'control-replay-parity.json'), JSON.stringify(controlParity, null, 2) + '\n');
    await writeFile(resolve(ROOT, DATA, 'arm-observations.json'), JSON.stringify({
      control: controlObserver.summary(), candidate: candidateObserver.summary()
    }, null, 2) + '\n');
    await writeFile(resolve(ROOT, DATA, 'run-comparison.json'), JSON.stringify(candidateResults, null, 2) + '\n');
    await writeFile(resolve(ROOT, DATA, 'control-run-receipt.json'), JSON.stringify(runReceipt(control), null, 2) + '\n');
    await writeFile(resolve(ROOT, DATA, 'candidate-run-receipt.json'), JSON.stringify(runReceipt(candidate), null, 2) + '\n');
    const measurement = analyzePairedFrames(pairedFrames);
    const rerun = analyzePairedFrames(JSON.parse(gunzipSync(pairedBytes)));
    const measurementText = JSON.stringify(measurement, null, 2) + '\n';
    assert.equal(JSON.stringify(rerun, null, 2) + '\n', measurementText, 'measurement rerun exactness');
    await writeFile(resolve(ROOT, DATA, 'analysis.json'), measurementText);
    await writeFile(resolve(ROOT, DATA, 'manipulation.json'), JSON.stringify(manipulationTable(), null, 2) + '\n');
    console.log(JSON.stringify({ status: 'SCREEN-COMPLETE', candidateWallSeconds: candidate.wallSeconds,
      controlParity: 'EXACT', frames: 40, candidatePlates: candidate.events.plateBirths,
      candidateFeet: candidate.events.individualFeet, pairedAnchorsSha256: sha(pairedBytes) }, null, 2));
  } finally {
    if (temporary) await cleanupShadow(temporary);
    await rm(controlTemp, { recursive: true, force: true });
  }
}

async function analyzeSaved() {
  const bytes = await readFile(resolve(ROOT, DATA, 'paired-anchors.json.gz'));
  const input = JSON.parse(gunzipSync(bytes));
  const result = analyzePairedFrames(input);
  const text = JSON.stringify(result, null, 2) + '\n';
  const destination = resolve(ROOT, DATA, 'analysis.json');
  const existing = await readFile(destination, 'utf8');
  assert.equal(text, existing, 'analysis output matches saved deterministic rerun');
  console.log(JSON.stringify({ status: 'ANALYSIS-RERUN-EXACT', inputSha256: sha(bytes),
    analysisSha256: sha(Buffer.from(text)), windows: Object.keys(result.windows) }, null, 2));
}

async function verifyAuthority() {
  const hashes = {};
  for (const path of SOURCE_FILES) {
    const local = await readFile(resolve(ROOT, path));
    hashes[path] = sha(local);
  }
  return { main: MAIN_SHA, researchParent: RESEARCH_PARENT,
    researchBranch: 'codex/ant-retained-material-locomotion-20pct-screen-20261029',
    sourceSha256: hashes, productionAuthorityPreflight: 'origin/main ref and all listed source files were shell-verified before the run',
    canonicalGuide: 'docs/ant/README.md verified against origin/main' };
}

async function loadBaseline() {
  const checksums = JSON.parse(await readFile(resolve(ROOT, G_DATA, 'SHA256SUMS.json'), 'utf8'));
  const rawBytes = await readFile(resolve(ROOT, G_DATA, `seed${SEED}-G-raw.json.gz`));
  assert.equal(sha(rawBytes), BASELINE_RAW_SHA);
  assert.equal(sha(rawBytes), checksums[`seed${SEED}-G-raw.json.gz`]);
  const summary = JSON.parse(await readFile(resolve(ROOT, G_DATA, 'SUMMARY.json'), 'utf8'));
  const arm = summary.scenarios.find(row => row.seed === SEED)?.arms.find(row => row.arm === 'G');
  assert(arm, 'frozen current-G control summary exists');
  const provenance = JSON.parse(await readFile(resolve(ROOT,
    'docs/ant/evidence/2026-10-25-g-production-candidate-review/data/PROVENANCE.json'), 'utf8'));
  assert.deepEqual(provenance.seeds.includes(SEED), true);
  assert.equal(provenance.seconds, SECONDS);
  assert.equal(provenance.tickRate, 60);
  assert.equal(provenance.audioBridge, null);
  assert.equal(provenance.materialLocomotionResistance, true);
  const lateBytes = await readFile(resolve(ROOT, LATE_INPUT));
  const lateInput = JSON.parse(gunzipSync(lateBytes));
  assert.equal(lateInput.provenance.main, MAIN_SHA);
  assert.equal(lateInput.provenance.sourceRun,
    'docs/ant/evidence/2026-10-25-g-production-candidate-review/data/seed20261005-G-raw.json.gz');
  assert.equal(lateInput.provenance.sourceRunSha256, BASELINE_RAW_SHA);
  assert.equal(lateInput.provenance.deterministicReplay, true);
  assert.equal(lateInput.provenance.observerRngCalls, 0);
  assert.equal(lateInput.provenance.productionBehaviorModified, false);
  assert.equal(lateInput.provenance.newTrajectoryOrSeed, false);
  assert.equal(lateInput.frames.length, 40);
  assert.equal(new Set(lateInput.frames.map(frame => frame.tick)).size, 40);
  const strataBytes = await readFile(resolve(ROOT,
    'docs/ant/evidence/2026-10-29-stratigraphy-signal-audit/data/reconstructed-commit-context.json.gz'));
  assert.equal(sha(strataBytes), BASELINE_MASK_SHA);
  return { checksums, rawSha256: sha(rawBytes), raw: JSON.parse(gunzipSync(rawBytes)),
    arm, summary, lateInput, lateInputSha256: sha(lateBytes), strataSha256: sha(strataBytes) };
}

async function verifyControlParity(run, output, baseline) {
  const replayRawBytes = await readFile(resolve(output, `seed${SEED}-G-raw.json.gz`));
  const replayRaw = JSON.parse(gunzipSync(replayRawBytes));
  assert.deepEqual(replayRaw, baseline.raw, 'full 600-second positions, contact buckets and births match frozen run');
  assert.deepEqual(JSON.parse(JSON.stringify(run.timeline)), baseline.arm.timeline,
    '600 per-second summaries match after omitting undefined optional telemetry');
  assert.deepEqual(JSON.parse(JSON.stringify(run.checkpoints)), baseline.arm.checkpoints,
    'all saved checkpoints match after omitting undefined optional telemetry');
  assert.deepEqual(run.events, baseline.arm.events, 'event counts and ordered stream receipts match');
  assert.deepEqual(run.finalRng, baseline.arm.finalRng, 'RNG state/call count match frozen run');
  const maps = [];
  for (const seconds of CHECKPOINTS) {
    const name = `seed${SEED}-G-${seconds}s.json.gz`;
    assert.equal(sha(await readFile(resolve(output, name))), baseline.checksums[name],
      `${seconds}s frozen checkpoint map bytes match`);
    maps.push({ seconds, path: `${G_DATA}/${name}`, sha256: baseline.checksums[name], exact: true });
  }
  assert.equal(run.initialStateSha256, baseline.arm.initialStateSha256);
  return { exact: true, initialState: true, positions: true, contactCountBuckets: true,
    contactStreamSha256: baseline.raw.events.contactStreamSha256,
    plateBirthStreamSha256: baseline.raw.events.plateBirthStreamSha256,
    eventTotals: true, timeline600: true, checkpointSummaries: true, rngStateAndCalls: true,
    checkpointMaps: maps, observerRngCalls: 0,
    comparedRawSha256: sha(replayRawBytes), frozenRawSha256: baseline.rawSha256 };
}

async function loadProductionThinner() {
  const source = (await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8'));
  const math = Object.create(Math);
  math.random = () => { throw new Error('Randomness is forbidden in the diagnostic thinner.'); };
  return runInNewContext(source.replace(/^export /gm, '') + '\n({ zhangSuen })', { Math: math }).zhangSuen;
}

function createObserver(multiplier, zhangSuen, expectedFrames) {
  const targetTicks = new Set(expectedFrames.map(frame => frame.tick));
  const frames = [], feet = [];
  const contactGroups = [0, 0, 0], contactPoints = [0, 0, 0];
  const contactMaps = Array.from({ length: 3 }, () => new Uint32Array(MAP24 * MAP24));
  const locomotion = createLocomotionAccumulator();
  let contactListener;

  return {
    frames, feet, contactMaps, locomotion,
    attach(controller) {
      const birth = controller.trailPlateBirth;
      const build = birth.buildSupportedMask.bind(birth);
      birth.buildSupportedMask = surface => {
        const result = build(surface), timeMs = controller.simulationTimeMs;
        const tick = Math.round(timeMs / (1000 / 60));
        if (!targetTicks.has(tick)) return result;
        const B = birth.chemicalMemory.slice(), C = surface.values.slice();
        const D = new Float32Array(COUNT);
        for (let i = 0; i < COUNT; i += 1) {
          D[i] = Math.fround(surface.sampleSupport(i % N / 95, Math.floor(i / N) / 95, 0.025));
        }
        const E = result.mask.slice(), F = zhangSuen(E), S = new Uint8Array(COUNT);
        for (let i = 0; i < COUNT; i += 1) if (F[i] && neighbors8(i).some(j => F[j])) S[i] = 1;
        for (const i of indices(S)) assert.equal(result.supports[i], D[i], `production D mismatch ${tick}/${i}`);
        const prior = birth.getPlates().filter(plate => plate.bornAtSimulationTimeMs < timeMs);
        const fromMasks = new Uint16Array(COUNT);
        for (const plate of prior) for (let i = 0; i < COUNT; i += 1) if (plate.mask[i]) fromMasks[i] += 1;
        const material = controller.materialStratigraphy.getSnapshot().stratigraphy.layerCountByCell;
        assert.deepEqual(Array.from(material), Array.from(fromMasks), 'pre-existing plate masks match current column count');
        frames.push({ timeMs, tick, B, C, D, E: indices(E), F: indices(F), S: indices(S),
          preMaterialLayers: fromMasks, preexistingPlateIds: prior.map(plate => plate.id) });
        return result;
      };
      contactListener = controller.subscribe(event => {
        if (event.type !== 'foot-contact' || event.payload?.type !== 'FOOT_CONTACT'
          || !Array.isArray(event.payload.contacts)) return;
        const timeMs = event.payload.simulationTimeMs;
        const window = Math.min(2, Math.max(0, Math.floor(timeMs / 200000)));
        contactGroups[window] += 1;
        for (const contact of event.payload.contacts) {
          const p = contact?.position;
          if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)
            || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
          contactPoints[window] += 1;
          contactMaps[window][Math.round(p.y * (MAP24 - 1)) * MAP24
            + Math.round(p.x * (MAP24 - 1))] += 1;
          if (timeMs >= WINDOWS[0].startMs - 20000 && timeMs < WINDOWS[1].endMs) {
            feet.push({ timeMs, x: p.x, y: p.y,
              exact: Math.round(p.y * 95) * N + Math.round(p.x * 95) });
          }
        }
      });
      const tick = controller.tick.bind(controller);
      controller.tick = dt => {
        const timeMs = controller.simulationTimeMs;
        const materialSnapshot = controller.materialStratigraphy.getSnapshot();
        const before = controller.agents.map(agent => ({ agent, id: agent.id, x: agent.x, y: agent.y,
          vx: agent.vx, vy: agent.vy, layer: materialLayerCountAtSnapshot(materialSnapshot, agent.x, agent.y) }));
        const window = Math.min(2, Math.max(0, Math.floor(timeMs / 200000)));
        const activeAfter = tick(dt);
        const activeIds = new Set(controller.agents.map(agent => agent.id));
        for (const item of before) {
          const agent = item.agent;
          const applied = multiplier(item.layer);
          const speedBefore = Math.hypot(item.vx, item.vy);
          const speedAfter = Math.hypot(agent.vx, agent.vy);
          const travel = clippedSegmentLength(item.x, item.y, agent.x, agent.y);
          locomotion.add({ window, layer: item.layer, multiplier: applied, speedBefore, speedAfter,
            targetSpeed: agent.targetSpeed, travel, zeroDisplacement: agent.x === item.x && agent.y === item.y,
            dt, antId: item.id, timeMs, aliveAfter: activeIds.has(item.id) });
        }
        return activeAfter;
      };
    },
    finish(seconds) {
      locomotion.finish(seconds);
      addRecentContext(frames, feet);
    },
    summary() {
      return { locomotion: locomotion.summary(), contacts: contactGroups.map((groups, i) => ({
        groups,
        validFeet: contactPoints[i], gridSize: MAP24,
        gridCounts: Array.from(contactMaps[i]) })),
        anchorCount: frames.length, capturedFootSamples: feet.length };
    }
  };
}

function materialLayerCountAtSnapshot(snapshot, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return 0;
  const layers = snapshot?.stratigraphy?.layerCountByCell;
  if (!Number.isInteger(snapshot?.width) || !Number.isInteger(snapshot?.height)
    || !ArrayBuffer.isView(layers)) return 0;
  const cell = Math.round(y * (snapshot.height - 1)) * snapshot.width + Math.round(x * (snapshot.width - 1));
  return layers[cell] || 0;
}

function createLocomotionAccumulator() {
  const make = () => ({ antTicks: 0, exposedAntTicks: 0, layerZeroAntTicks: 0,
    multiplierSum: 0, exposedMultiplierSum: 0, speedBeforeSum: 0, exposedSpeedBeforeSum: 0,
    speedAfterSum: 0, exposedSpeedAfterSum: 0, targetSpeedSum: 0, exposedTargetSpeedSum: 0,
    travelSum: 0, exposedTravelSum: 0, zeroDisplacementTicks: 0, exposedZeroDisplacementTicks: 0,
    exposedTravelByLayer: Object.create(null), ticksByLayer: Object.create(null) });
  const all = make(), windows = [make(), make(), make()], episodeByAnt = new Map(), episodes = [];
  let observedMultiplier = null;
  function add(stats, row) {
    stats.antTicks += 1;
    if (row.layer === 0) stats.layerZeroAntTicks += 1;
    else stats.exposedAntTicks += 1;
    stats.multiplierSum += row.multiplier;
    stats.speedBeforeSum += row.speedBefore;
    stats.speedAfterSum += row.speedAfter;
    stats.targetSpeedSum += row.targetSpeed;
    stats.travelSum += row.travel;
    if (row.layer > 0) {
      stats.exposedMultiplierSum += row.multiplier;
      stats.exposedSpeedBeforeSum += row.speedBefore;
      stats.exposedSpeedAfterSum += row.speedAfter;
      stats.exposedTargetSpeedSum += row.targetSpeed;
      stats.exposedTravelSum += row.travel;
    }
    if (row.zeroDisplacement) {
      stats.zeroDisplacementTicks += 1;
      if (row.layer > 0) stats.exposedZeroDisplacementTicks += 1;
    }
    stats.ticksByLayer[row.layer] = (stats.ticksByLayer[row.layer] || 0) + 1;
    if (row.layer > 0) stats.exposedTravelByLayer[row.layer] =
      (stats.exposedTravelByLayer[row.layer] || 0) + row.travel;
  }
  return {
    add({ window, layer, multiplier, speedBefore, speedAfter, targetSpeed, travel,
      zeroDisplacement, dt, antId, timeMs, aliveAfter }) {
      if (observedMultiplier === null) observedMultiplier = multiplier;
      const row = { layer, multiplier, speedBefore, speedAfter, targetSpeed, travel, zeroDisplacement };
      add(all, row); add(windows[window], row);
      const open = episodeByAnt.get(antId);
      if (layer > 0) {
        if (!open) episodeByAnt.set(antId, { antId, startTimeMs: timeMs });
      } else if (open) {
        episodes.push({ ...open, endTimeMs: timeMs, durationSeconds: (timeMs - open.startTimeMs) / 1000,
          endReason: 'left-material' });
        episodeByAnt.delete(antId);
      }
      if (!aliveAfter && episodeByAnt.has(antId)) {
        const current = episodeByAnt.get(antId);
        episodes.push({ ...current, endTimeMs: timeMs + dt * 1000,
          durationSeconds: (timeMs + dt * 1000 - current.startTimeMs) / 1000, endReason: 'retired' });
        episodeByAnt.delete(antId);
      }
    },
    finish(seconds) {
      const endTimeMs = seconds * 1000;
      for (const episode of episodeByAnt.values()) episodes.push({ ...episode, endTimeMs,
        durationSeconds: (endTimeMs - episode.startTimeMs) / 1000, endReason: 'right-censored' });
      episodeByAnt.clear();
    },
    summary() {
      const shape = value => ({ antTicks: value.antTicks, exposedAntTicks: value.exposedAntTicks,
        layerZeroAntTicks: value.layerZeroAntTicks,
        exposedFraction: value.antTicks ? value.exposedAntTicks / value.antTicks : null,
        meanMultiplierAll: mean(value.multiplierSum, value.antTicks),
        meanMultiplierExposed: mean(value.exposedMultiplierSum, value.exposedAntTicks),
        meanSpeedBeforeAll: mean(value.speedBeforeSum, value.antTicks),
        meanSpeedBeforeExposed: mean(value.exposedSpeedBeforeSum, value.exposedAntTicks),
        meanRealizedSpeedAll: mean(value.travelSum, value.antTicks * DT),
        meanRealizedSpeedExposed: mean(value.exposedTravelSum, value.exposedAntTicks * DT),
        meanVelocityMagnitudeAfterAll: mean(value.speedAfterSum, value.antTicks),
        meanVelocityMagnitudeAfterExposed: mean(value.exposedSpeedAfterSum, value.exposedAntTicks),
        meanFinalTargetSpeedAll: mean(value.targetSpeedSum, value.antTicks),
        meanFinalTargetSpeedExposed: mean(value.exposedTargetSpeedSum, value.exposedAntTicks),
        travelAll: value.travelSum, travelExposed: value.exposedTravelSum,
        zeroDisplacementTicks: value.zeroDisplacementTicks,
        zeroDisplacementExposedTicks: value.exposedZeroDisplacementTicks,
        ticksByLayer: value.ticksByLayer, exposedTravelByLayer: value.exposedTravelByLayer });
      const durations = episodes.map(row => row.durationSeconds);
      return { all: shape(all), windows: windows.map(shape),
        exposureEpisodes: { count: episodes.length, durationsSeconds: quantiles(durations),
          endReasons: Object.fromEntries(['left-material', 'retired', 'right-censored'].map(reason =>
            [reason, episodes.filter(row => row.endReason === reason).length])),
          rows: episodes },
        lastObservedMultiplier: observedMultiplier };
    }
  };
}

function addRecentContext(frames, feet) {
  feet.sort((a, b) => a.timeMs - b.timeMs);
  for (const frame of frames) {
    const recentFeet = feet.filter(foot => foot.timeMs > frame.timeMs - 20000 && foot.timeMs <= frame.timeMs);
    const nearby = new Uint32Array(COUNT), exact = new Uint32Array(COUNT), last = new Float64Array(COUNT).fill(-Infinity);
    for (const foot of recentFeet) {
      exact[foot.exact] += 1;
      const cells = contactNeighborhood(foot.x, foot.y);
      for (const cell of cells) { nearby[cell] += 1; last[cell] = foot.timeMs; }
    }
    frame.channels = { B: frame.B, C: frame.C, D: frame.D, recent: nearby };
    frame.exactFeet20s = exact;
    frame.lastNearbyFootAgeSeconds = Float32Array.from(last, value => Number.isFinite(value)
      ? (frame.timeMs - value) / 1000 : NaN);
    frame.footWindowCount = recentFeet.length;
    frame.exposureSeconds = 20;
  }
}

function contactNeighborhood(x, y) {
  const cells = [];
  for (let cy = Math.max(0, Math.ceil((y - CONTACT_RADIUS) * 95));
    cy <= Math.min(95, Math.floor((y + CONTACT_RADIUS) * 95)); cy += 1) {
    for (let cx = Math.max(0, Math.ceil((x - CONTACT_RADIUS) * 95));
      cx <= Math.min(95, Math.floor((x + CONTACT_RADIUS) * 95)); cx += 1) {
      if (Math.hypot(cx / 95 - x, cy / 95 - y) <= CONTACT_RADIUS) cells.push(cy * N + cx);
    }
  }
  return cells;
}

function frameCore(frame) {
  return { timeMs: frame.timeMs, tick: frame.tick, B: Array.from(frame.B), C: Array.from(frame.C),
    D: Array.from(frame.D), E: frame.E, F: frame.F, S: frame.S,
    preMaterialLayers: Array.from(frame.preMaterialLayers), preexistingPlateIds: frame.preexistingPlateIds };
}

function frameRecent(frame) {
  return { channels: { B: Array.from(frame.channels.B), C: Array.from(frame.channels.C),
      D: Array.from(frame.channels.D), recent: Array.from(frame.channels.recent) },
    exactFeet20s: Array.from(frame.exactFeet20s),
    lastNearbyFootAgeSeconds: Array.from(frame.lastNearbyFootAgeSeconds,
      value => Number.isFinite(value) ? value : null), footWindowCount: frame.footWindowCount,
    exposureSeconds: frame.exposureSeconds };
}

function frameForStorage(frame) {
  return { timeMs: frame.timeMs, tick: frame.tick, B: Array.from(frame.B), C: Array.from(frame.C),
    D: Array.from(frame.D), E: frame.E, F: frame.F, S: frame.S,
    preMaterialLayers: Array.from(frame.preMaterialLayers), preexistingPlateIds: frame.preexistingPlateIds,
    channels: Object.fromEntries(Object.entries(frame.channels).map(([key, value]) => [key, Array.from(value)])),
    exactFeet20s: Array.from(frame.exactFeet20s),
    lastNearbyFootAgeSeconds: Array.from(frame.lastNearbyFootAgeSeconds,
      value => Number.isFinite(value) ? value : null), footWindowCount: frame.footWindowCount,
    exposureSeconds: frame.exposureSeconds };
}

function analyzePairedFrames(paired) {
  assert.equal(paired.control.length, 40);
  assert.equal(paired.candidate.length, 40);
  for (let i = 0; i < 40; i += 1) assert.deepEqual(
    [paired.control[i].timeMs, paired.control[i].tick], [paired.candidate[i].timeMs, paired.candidate[i].tick]);
  const arms = { control: paired.control.map(analyzeOpportunityFrame),
    candidate: paired.candidate.map(analyzeOpportunityFrame) };
  const windows = {};
  for (const window of ['300s', '600s']) {
    const rows = Object.fromEntries(Object.entries(arms).map(([arm, values]) =>
      [arm, values.filter(value => value.window === window)]));
    windows[window] = {
      arms: Object.fromEntries(Object.entries(rows).map(([arm, values]) => [arm, summarizeOpportunityWindow(values)])),
      paired: rows.control.map((control, index) => compareOpportunityState(control, rows.candidate[index]))
    };
  }
  return { schema: 'ant-retained-material-locomotion-20pct-measurement-v1',
    anchorCount: paired.control.length, windows,
    conventions: { grid: '96 x 96 production TrailPlateBirth grid', connectivity: '8-neighbor',
      D: 'current SurfaceField sampleSupport(..., 0.025), Float32-rounded; measured on edge-bearing F',
      peak: 'exact-equal 8-neighbor plateau maxima on S',
      spacing: 'parent descriptiveSpacing at 0.15 world units; descriptive only',
      material: 'current pre-commit layerCountByCell; Plate IDs with birth time strictly before anchor',
      contactContext: '(t-20 s,t] individual FOOT_CONTACT within 0.037 world units of each cell',
      entry: { x: 0.5, y: 0.72 }, noSelector: true, noXCapture: true } };
}

function compareOpportunity(controlFrames, candidateFrames) {
  return analyzePairedFrames({ control: controlFrames.map(frameForStorage),
    candidate: candidateFrames.map(frameForStorage) }).windows;
}

function analyzeOpportunityFrame(frame) {
  const F = new Uint8Array(COUNT), S = new Uint8Array(COUNT), values = Float64Array.from(frame.D);
  frame.F.forEach(index => { F[index] = 1; });
  frame.S.forEach(index => { S[index] = 1; });
  const labels = new Int32Array(COUNT).fill(-1), componentSizes = [];
  let component = 0;
  for (const start of frame.F) if (labels[start] < 0) {
    const queue = [start]; labels[start] = component;
    for (let head = 0; head < queue.length; head += 1) for (const next of neighbors8(queue[head])) {
      if (F[next] && labels[next] < 0) { labels[next] = component; queue.push(next); }
    }
    componentSizes.push(queue.length); component += 1;
  }
  const enumerated = enumeratePlateauMaxima({ S, values });
  const spacing = descriptiveSpacing(enumerated.peaks, labels, 0.15);
  const centers = spacing.representatives.map((row, index) => ({
    rank: index + 1, index: row.index, value: row.value, point: point(row.index),
    entryDistance: Math.hypot(point(row.index).x - 0.5, point(row.index).y - 0.72),
    component: labels[row.index], componentSize: componentSizes[labels[row.index]],
    preMaterialLayers: frame.preMaterialLayers[row.index],
    nearbyRecentFeet20: frame.channels.recent[row.index],
    lastNearbyFootAgeSeconds: frame.lastNearbyFootAgeSeconds[row.index]
  }));
  const sortedS = frame.S.slice().sort((a, b) => values[b] - values[a] || a - b);
  const global = maxIndex(values), outside = maxIndex(values, i =>
    Math.hypot(point(i).x - 0.5, point(i).y - 0.72) > 0.15);
  const material = frame.preMaterialLayers;
  return { timeMs: frame.timeMs, tick: frame.tick, window: frame.timeMs < 300000 ? '300s' : '600s',
    counts: { E: frame.E.length, F: frame.F.length, S: frame.S.length,
      fComponents: componentSizes.length, finiteDPeaks: enumerated.peaks.length,
      preexistingPlates: frame.preexistingPlateIds.length,
      materialCells: material.filter(value => value > 0).length,
      materialLayerSum: material.reduce((sum, value) => sum + value, 0),
      maxLayerCount: Math.max(...material) },
    D: { qualifiedMaximum: centers[0] ?? null, separatedCenters: centers.slice(0, 3),
      top2ToTop1: centers.length > 1 && centers[0].value > 0 ? centers[1].value / centers[0].value : null,
      top3ToTop1: centers.length > 2 && centers[0].value > 0 ? centers[2].value / centers[0].value : null,
      globalMaximum: { index: global, value: values[global], point: point(global) },
      outsideEntryMaximum: { index: outside, value: values[outside], point: point(outside),
        ratioToGlobal: values[global] > 0 ? values[outside] / values[global] : null },
      qualifiedNodeCount: sortedS.length } };
}

function summarizeOpportunityWindow(rows) {
  const rank1Cells = rows.map(row => row.D.qualifiedMaximum?.index ?? null);
  const winnerTransitions = rank1Cells.slice(1).map((cell, i) => ({
    from: rank1Cells[i], to: cell, sameCell: rank1Cells[i] === cell,
    distance: rank1Cells[i] === null || cell === null ? null : dist(rank1Cells[i], cell)
  }));
  const mode = modeOf(rank1Cells);
  const values = rows.map(row => row.D.qualifiedMaximum?.value ?? NaN);
  return { states: rows.length,
    qualifiedCounts: Object.fromEntries(['E', 'F', 'S', 'fComponents', 'finiteDPeaks'].map(key =>
      [key, quantiles(rows.map(row => row.counts[key]))])),
    material: { plateCountAtAnchors: quantiles(rows.map(row => row.counts.preexistingPlates)),
      occupiedCells: quantiles(rows.map(row => row.counts.materialCells)),
      layerSum: quantiles(rows.map(row => row.counts.materialLayerSum)),
      maxLayerCount: quantiles(rows.map(row => row.counts.maxLayerCount)) },
    qualifiedD: { value: quantiles(values), top2ToTop1: quantiles(rows.map(row => row.D.top2ToTop1)),
      top3ToTop1: quantiles(rows.map(row => row.D.top3ToTop1)),
      winnerEntryDistance: quantiles(rows.map(row => row.D.qualifiedMaximum?.entryDistance ?? NaN)),
      winnerOutsideEntryCount: rows.filter(row => (row.D.qualifiedMaximum?.entryDistance ?? 0) > 0.15).length,
      rank1ModeCell: mode.cell, rank1ModeCount: mode.count,
      exactCellTransitionsUnchanged: winnerTransitions.filter(row => row.sameCell).length,
      transitionsWithinParent025: winnerTransitions.filter(row => row.distance !== null && row.distance <= 0.025).length,
      centerStrengths: [1, 2, 3].map(rank => ({ rank,
        value: quantiles(rows.map(row => row.D.separatedCenters[rank - 1]?.value ?? NaN)),
        entryDistance: quantiles(rows.map(row => row.D.separatedCenters[rank - 1]?.entryDistance ?? NaN)),
        materialLayerCount: quantiles(rows.map(row => row.D.separatedCenters[rank - 1]?.preMaterialLayers ?? NaN)),
        recentFeet20s: quantiles(rows.map(row => row.D.separatedCenters[rank - 1]?.nearbyRecentFeet20 ?? NaN)),
        materialFreeStates: rows.filter(row => row.D.separatedCenters[rank - 1]?.preMaterialLayers === 0).length })) },
    rawDContext: { outsideEntryToGlobalMaximum: quantiles(rows.map(row => row.D.outsideEntryMaximum.ratioToGlobal)) },
    states: rows };
}

function compareOpportunityState(control, candidate) {
  return { timeMs: control.timeMs, tick: control.tick,
    E: { control: control.counts.E, candidate: candidate.counts.E,
      delta: candidate.counts.E - control.counts.E },
    F: { control: control.counts.F, candidate: candidate.counts.F,
      delta: candidate.counts.F - control.counts.F },
    S: { control: control.counts.S, candidate: candidate.counts.S,
      delta: candidate.counts.S - control.counts.S },
    fComponents: { control: control.counts.fComponents, candidate: candidate.counts.fComponents },
    dWinner: { control: control.D.qualifiedMaximum?.index ?? null,
      candidate: candidate.D.qualifiedMaximum?.index ?? null,
      distance: control.D.qualifiedMaximum && candidate.D.qualifiedMaximum
        ? dist(control.D.qualifiedMaximum.index, candidate.D.qualifiedMaximum.index) : null,
      controlEntryDistance: control.D.qualifiedMaximum?.entryDistance ?? null,
      candidateEntryDistance: candidate.D.qualifiedMaximum?.entryDistance ?? null,
      controlValue: control.D.qualifiedMaximum?.value ?? null,
      candidateValue: candidate.D.qualifiedMaximum?.value ?? null },
    Dtop2ToTop1: { control: control.D.top2ToTop1, candidate: candidate.D.top2ToTop1 },
    materialAtWinner: { control: control.D.qualifiedMaximum?.preMaterialLayers ?? null,
      candidate: candidate.D.qualifiedMaximum?.preMaterialLayers ?? null },
    recentFeet20sAtWinner: { control: control.D.qualifiedMaximum?.nearbyRecentFeet20 ?? null,
      candidate: candidate.D.qualifiedMaximum?.nearbyRecentFeet20 ?? null } };
}

function summarizeRun(run, observer) {
  return { seed: run.seed, seconds: run.seconds, ticks: run.ticks, initialStateSha256: run.initialStateSha256,
    movement: run.movement, trail: run.trail,
    events: run.events, fieldWrites: run.fieldWrites, invariants: run.invariants,
    finalRng: run.finalRng,
    population: { spawned: run.checkpoints.at(-1)?.totalSpawned, retired: run.checkpoints.at(-1)?.totalRetired,
      final: run.checkpoints.at(-1)?.activePopulation,
      minimum: Math.min(...run.timeline.map(row => row.population)),
      maximum: Math.max(...run.timeline.map(row => row.population)),
      recruitmentLimitTicks: run.checkpoints.map(row => ({ seconds: row.seconds,
        totalSpawned: row.totalSpawned, totalRetired: row.totalRetired })) },
    checkpoints: run.checkpoints.map(row => ({ seconds: row.seconds, activePopulation: row.activePopulation,
      totalSpawned: row.totalSpawned, totalRetired: row.totalRetired,
      totalRealizedTravel: row.totalRealizedTravel, contactCount: row.contacts.feet,
      plateCount: row.plateCount, sphereCount: row.sphereCount,
      pheromone: { nodeSum: row.field.sum, max: row.field.max, coverage004: run.timeline[row.seconds - 1].pheromoneCoverageAt004 },
      surface: row.surface, material: row.material, occupancy: row.occupancy,
      rngState: row.rngState, rngCalls: row.rngCalls })),
    timeline: run.timeline.map(row => ({ seconds: row.seconds, population: row.population,
      totalSpawned: row.totalSpawned, totalRetired: row.totalRetired,
      totalRealizedTravel: row.totalRealizedTravel, activeAntSeconds: row.activeAntSeconds,
      contacts: row.individualFeetThisSecond, contactGroups: row.contactGroupsThisSecond,
      plateBirths: row.plateBirthsThisSecond, plateCount: row.plateCount,
      pheromoneNodeSum: row.pheromoneNodeSum, pheromoneMaxNode: row.pheromoneMaxNode,
      pheromoneCoverageAt004: row.pheromoneCoverageAt004, persistent30sCells: row.persistent30sCells,
      persistent30sRegions: row.persistent30sRegions })),
    observer: observer.summary() };
}

function runReceipt(run) {
  return { seed: run.seed, arm: run.arm, seconds: run.seconds, ticks: run.ticks,
    initialStateSha256: run.initialStateSha256, movement: run.movement, events: run.events,
    checkpoints: run.checkpoints, finalRng: run.finalRng, invariants: run.invariants,
    fieldWrites: run.fieldWrites };
}

async function compareCheckpoints(control, candidate, candidateOut) {
  const baselineFiles = [];
  for (const seconds of CHECKPOINTS) {
    const baseName = `seed${SEED}-G-${seconds}s.json.gz`;
    const base = JSON.parse(gunzipSync(await readFile(resolve(ROOT, G_DATA, baseName))));
    const treated = JSON.parse(gunzipSync(await readFile(resolve(candidateOut, baseName))));
    const measure = (left, right) => {
      const differences = left.map((value, index) => Math.abs(value - right[index]));
      return { count: differences.length, sumAbsoluteDifference: differences.reduce((sum, x) => sum + x, 0),
        changedCells: differences.filter(value => value !== 0).length,
        maximumAbsoluteDifference: Math.max(...differences) };
    };
    const occupied = values => values.map(value => value > 0);
    const jaccard = (a, b) => {
      let intersection = 0, union = 0;
      for (let i = 0; i < a.length; i += 1) { if (a[i] || b[i]) union += 1; if (a[i] && b[i]) intersection += 1; }
      return union ? intersection / union : 1;
    };
    baselineFiles.push({ seconds,
      pheromone: { controlSum: sum(base.pheromone.values), candidateSum: sum(treated.pheromone.values),
        sumAbsoluteDifference: measure(base.pheromone.values, treated.pheromone.values).sumAbsoluteDifference,
        changedCells: measure(base.pheromone.values, treated.pheromone.values).changedCells,
        coverage004Control: occupied(base.pheromone.values.map(x => x >= 0.04)).filter(Boolean).length,
        coverage004Candidate: occupied(treated.pheromone.values.map(x => x >= 0.04)).filter(Boolean).length },
      surface: { control: surfaceStats(base.surface.values), candidate: surfaceStats(treated.surface.values),
        difference: measure(base.surface.values, treated.surface.values) },
      occupancy: { controlCoverage: occupied(base.occupancy.cumulativeAntSeconds).filter(Boolean).length,
        candidateCoverage: occupied(treated.occupancy.cumulativeAntSeconds).filter(Boolean).length,
        cumulativeOccupiedJaccard: jaccard(occupied(base.occupancy.cumulativeAntSeconds),
          occupied(treated.occupancy.cumulativeAntSeconds)),
        cumulativeAntSecondsL1: measure(base.occupancy.cumulativeAntSeconds,
          treated.occupancy.cumulativeAntSeconds).sumAbsoluteDifference,
        recent30sOccupiedJaccard: jaccard(occupied(base.occupancy.recent30sAntSeconds),
          occupied(treated.occupancy.recent30sAntSeconds)) },
      persistentChemicalMaskJaccard: jaccard(base.persistent30sChemicalMask || [],
        treated.persistent30sChemicalMask || []),
      files: { control: `${G_DATA}/${baseName}`, candidate: `${DATA}/candidate-20pct-run/${baseName}` } });
  }
  return baselineFiles;
}

function compareContactMaps(control, candidate) {
  return control.contactMaps.map((left, index) => {
    const right = candidate.contactMaps[index];
    let changed = 0, occupiedControl = 0, occupiedCandidate = 0, intersection = 0, union = 0;
    let controlTotal = 0, candidateTotal = 0, absoluteDifference = 0;
    for (let i = 0; i < left.length; i += 1) {
      controlTotal += left[i]; candidateTotal += right[i];
      absoluteDifference += Math.abs(left[i] - right[i]);
      if (left[i] !== right[i]) changed += 1;
      if (left[i] > 0) occupiedControl += 1;
      if (right[i] > 0) occupiedCandidate += 1;
      if (left[i] > 0 || right[i] > 0) union += 1;
      if (left[i] > 0 && right[i] > 0) intersection += 1;
    }
    return { window: ['0-200s', '200-400s', '400-600s'][index], gridSize: MAP24,
      controlGroups: control.summary().contacts[index].groups,
      candidateGroups: candidate.summary().contacts[index].groups,
      controlFeet: controlTotal, candidateFeet: candidateTotal,
      controlOccupiedCells: occupiedControl, candidateOccupiedCells: occupiedCandidate,
      changedGridCells: changed, cellCountAbsoluteDifference: absoluteDifference,
      occupiedCellJaccard: union ? intersection / union : 1,
      controlGridCounts: Array.from(left), candidateGridCounts: Array.from(right) };
  });
}

function manipulationTable() {
  const m20 = layerCount => 1 - 0.20 * (1 - Math.exp(-layerCount / 4));
  return { current: { equation: '1 - 0.10 * (1 - exp(-L / 4))', amplitude: 0.10,
      values: Object.fromEntries([0, 1, 4, 10, 10000].map(layer => [String(layer), m10(layer)])),
      asymptote: 0.9 },
    candidate: { equation: '1 - 0.20 * (1 - exp(-L / 4))', amplitude: 0.20,
      values: Object.fromEntries([0, 1, 4, 10, 10000].map(layer => [String(layer), m20(layer)])),
      asymptote: 0.8 },
    verified: { L0ExactlyOne: m20(0) === 1, bounded: true, monotonic: true,
      sameLayerScale: true, onlyProductionExpressionChanged: true,
      callSiteUnchangedAfterHeadingAndSteeringBeforeTargetSpeed: true } };
}

function summarizeObserverRuns(control, candidate) {
  return { contactWindows: compareContactMaps(control, candidate),
    controlLocomotion: control.locomotion.summary(), candidateLocomotion: candidate.locomotion.summary() };
}

async function writeShadowModules(source, transformed) {
  assert.equal(source.indexOf(AMP_OLD), source.lastIndexOf(AMP_OLD), 'exactly one production amplitude occurrence');
  assert.equal(transformed.replace(AMP_NEW, AMP_OLD), source, 'shadow differs only at the amplitude literal');
  const temp = {
    controllerPath: resolve(ROOT, 'scripts/.ant-controller-20pct-screen-shadow.mjs'),
    runnerPath: resolve(ROOT, 'scripts/.ant-g-20pct-screen-shadow.mjs')
  };
  for (const path of Object.values(temp)) {
    try { await access(path); throw new Error(`Refusing to overwrite a pre-existing temporary file: ${path}`); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  const controller = transformed.replace(/from\s+(['"])(\.\/[^'"]+)\1/g, (_match, _quote, relative) =>
    `from ${JSON.stringify(pathToFileURL(resolve(ROOT, 'src/lib/agents/ant', relative.slice(2))).href)}`);
  const originalRunner = await readFile(resolve(ROOT, 'scripts/ant-g-production-candidate-natural.js'), 'utf8');
  const importLine = "import { AntController } from '../src/lib/agents/ant/AntController.js';";
  assert.equal(originalRunner.split(importLine).length - 1, 1, 'single G runner controller import');
  const runner = originalRunner.replace(importLine,
    "import { AntController } from './.ant-controller-20pct-screen-shadow.mjs';");
  await writeFile(temp.controllerPath, controller);
  await writeFile(temp.runnerPath, runner);
  return temp;
}

async function cleanupShadow(temp) {
  await Promise.all(Object.values(temp).map(path => rm(path, { force: true })));
}

async function ensureEmptyDirectory(path) {
  try { await mkdir(path); }
  catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    assert.equal((await readdir(path)).length, 0, `refusing to overwrite nonempty output directory ${path}`);
  }
}

function maxIndex(values, predicate = () => true) {
  let index = 0;
  while (index < values.length && !predicate(index)) index += 1;
  if (index >= values.length) throw new Error('No cells qualify for maximum.');
  for (let i = index + 1; i < values.length; i += 1) if (predicate(i) && values[i] > values[index]) index = i;
  return index;
}

function surfaceStats(values) {
  const samples = Array.from(values);
  return { sum: sum(samples), max: Math.max(...samples), mean: mean(sum(samples), samples.length),
    positiveCells: samples.filter(value => value > 0).length };
}

function clippedSegmentLength(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, x0], [dx, 1 - x0], [-dy, y0], [dy, 1 - y0]]) {
    if (p === 0) { if (q < 0) return 0; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return 0;
  }
  return Math.hypot(dx, dy) * Math.max(0, t1 - t0);
}

function mean(sumValue, count) { return count > 0 ? sumValue / count : null; }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function quantiles(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const at = p => sorted[Math.round((sorted.length - 1) * p)];
  return { n: sorted.length, min: sorted[0], p25: at(0.25), median: at(0.5),
    p75: at(0.75), p90: at(0.9), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) };
}
function modeOf(values) {
  const counts = new Map();
  for (const value of values) if (value !== null) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([cell, count]) => ({ cell, count }))[0] || { cell: null, count: 0 };
}
