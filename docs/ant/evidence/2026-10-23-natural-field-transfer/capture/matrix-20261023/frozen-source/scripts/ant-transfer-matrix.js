import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { AntController as ProductionAntController } from '../src/lib/agents/ant/AntController.js';
import {
  ANT_MODEL_FILES, assertCapturesEqual, canonicalCapture, loadInstrumentedAntController,
  loadPlainAntController, readGitHead, replayFieldWrites
} from './ant-transfer-capture.js';
import {
  captureControllerState, cloneStateGraph, createSeededRandom, restoreControllerState,
  rngCheckpoint, serializeStateGraph
} from './ant-transfer-state.js';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ALL_MODES = ['production', 'dtFeedback', 'dampingOff'];
const ORIGIN_MODES = ['production', 'dtFeedback'];
const HISTORY_TRACE_TYPES = new Set(['displacement', 'field-decay', 'field-deposit-write']);
const TRACE_TYPES = new Set([
  'intention-input', 'intention-updated', 'intention-no-choice', 'wide-options', 'intention-chosen',
  'local-turn', 'target-heading-base', 'target-turn', 'target-turn-applied', 'desired-speed',
  'accelerate-before', 'accelerate-after', 'collision-scales', 'displacement', 'field-decay',
  'field-deposit-write', 'gait-advance', 'foot-contact-write'
]);
const DEFAULT_SEEDS = [20261005, 20261006, 20261007];
const DEFAULT_SAMPLE_SECONDS = [30, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600];
const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
const DEFAULT_OUTPUT = 'docs/ant/evidence/2026-10-23-natural-field-transfer/capture/matrix-20261023';

export async function runTransferMatrix({
  seeds = DEFAULT_SEEDS,
  sampleSeconds = DEFAULT_SAMPLE_SECONDS,
  dtSeconds = 1 / 60,
  totalSeconds = 600,
  outputDir = DEFAULT_OUTPUT,
  progress = () => {}
} = {}) {
  validateProtocol(seeds, sampleSeconds, dtSeconds, totalSeconds);
  const outputRoot = path.resolve(PROJECT_ROOT, outputDir);
  await mkdir(outputRoot, { recursive: false });
  const sourceReceipt = await freezeSources(outputRoot);
  const gitHead = await readGitHead();
  const plainModules = Object.fromEntries(await Promise.all(ALL_MODES.map(async mode =>
    [mode, await loadPlainAntController(mode)])));
  const instrumentedModules = Object.fromEntries(await Promise.all(ALL_MODES.map(async mode =>
    [mode, await loadInstrumentedAntController({ movementMode: mode })])));
  for (const mode of ALL_MODES) {
    const plainPath = path.join(outputRoot, 'frozen-source', 'controller', `${mode}.plain.mjs`);
    const instrumentedPath = path.join(outputRoot, 'frozen-source', 'controller', `${mode}.instrumented.mjs`);
    sourceReceipt.generated[`controller/${mode}.plain.mjs`] = await writeFrozenBytes(
      plainPath, Buffer.from(plainModules[mode].transformedSource));
    sourceReceipt.generated[`controller/${mode}.instrumented.mjs`] = await writeFrozenBytes(
      instrumentedPath, Buffer.from(instrumentedModules[mode].transformedSource));
  }

  const stateReceipts = [];
  const historyReceipts = [];
  for (const originPolicy of ORIGIN_MODES) {
    for (const seed of seeds) {
      progress({ event: 'history-start', originPolicy, seed });
      const history = await captureHistory({
        outputRoot, originPolicy, seed, sampleSeconds, dtSeconds, totalSeconds,
        plainModules, instrumentedModules, sourceReceipt
      });
      stateReceipts.push(...history.stateReceipts);
      historyReceipts.push(history.writeStreamReceipt);
      progress({ event: 'history-complete', originPolicy, seed,
        captures: history.stateReceipts.length, writeStreamBytes: history.writeStreamReceipt.compressedBytes });
    }
  }

  const manifest = {
    schema: 'ant-natural-field-transfer-matrix-manifest/v1',
    scope: 'complete-state matched one-tick read-side replays from two natural histories; field operation streams retained for separately qualified fixed-write diagnostics',
    interpretationLimit: 'The matched P/dtFeedback/dampingOff arms isolate conditional controller read-side contrasts from each frozen history; they do not identify the total contribution of field representation across divergent write/read histories.',
    protocol: { gitHead, seeds: [...seeds], originPolicies: ORIGIN_MODES,
      movementModes: ALL_MODES, sampleSeconds: [...sampleSeconds], totalSeconds, dtSeconds,
      captureConvention: 'after each listed number of completed seconds and immediately before the next tick',
      timestepTicks: Math.round(totalSeconds / dtSeconds),
      statesExpected: ORIGIN_MODES.length * seeds.length * sampleSeconds.length,
      loggingRngNeutral: true, sourceMutation: false },
    sources: sourceReceipt,
    histories: historyReceipts,
    captures: stateReceipts
  };
  const manifestPath = path.join(outputRoot, 'matrix-manifest.json');
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  assertArtifactSize(manifestPath, manifestBytes.byteLength, manifestBytes.byteLength);
  await writeFile(manifestPath, manifestBytes, { flag: 'wx' });
  return { outputDir: path.relative(PROJECT_ROOT, outputRoot).replaceAll(path.sep, '/'),
    manifestPath: path.relative(PROJECT_ROOT, manifestPath).replaceAll(path.sep, '/'),
    manifestSha256: sha256(manifestBytes), stateCount: stateReceipts.length,
    historyCount: historyReceipts.length };
}

async function captureHistory({ outputRoot, originPolicy, seed, sampleSeconds, dtSeconds,
  totalSeconds, plainModules, instrumentedModules, sourceReceipt }) {
  const plainModule = plainModules[originPolicy];
  const instrumentedModule = instrumentedModules[originPolicy];
  const plain = new plainModule.AntController({ random: createSeededRandom(seed) });
  const observed = new instrumentedModule.AntController({ random: createSeededRandom(seed) });
  await Promise.all([plain.init(), observed.init()]);

  const plainOriginTypes = dynamicControllerTypes(plainModule, 'VariantAntController');
  const instrumentedTypes = dynamicControllerTypes(instrumentedModule, 'InstrumentedAntController');
  const initialPlain = captureControllerState(plain, { extraTypes: plainOriginTypes });
  const initialObserved = captureControllerState(observed, { extraTypes: instrumentedTypes });
  assertCapturesEqual(initialPlain, initialObserved, [...plainOriginTypes, ...instrumentedTypes]);

  const initialFieldGraph = serializeStateGraph(observed.field);
  const fieldParameters = { width: observed.field.width, height: observed.field.height,
    decayHalfLifeSeconds: observed.field.decayHalfLifeSeconds, maxValue: observed.field.maxValue };
  const reconstructedField = cloneStateGraph(observed.field);
  const fieldEvents = [];
  const recentTravel = [];
  const stateReceipts = [];
  const captureChecks = [];
  let completedTicks = 0;
  instrumentedModule.watchTransferTrace(observed, event => {
    const row = { ...event, tick: completedTicks, originPolicy, movementMode: originPolicy };
    if (HISTORY_TRACE_TYPES.has(event.type)) {
      if (event.type === 'field-decay' || event.type === 'field-deposit-write') {
        fieldEvents.push(row);
        replayFieldWrites(reconstructedField, [row]);
      } else if (event.type === 'displacement') {
        recentTravel.push(row);
      }
    }
  }, HISTORY_TRACE_TYPES);

  for (const seconds of sampleSeconds) {
    const targetTick = Math.round(seconds / dtSeconds);
    while (completedTicks < targetTick) {
      completedTicks += 1;
      plain.tick(dtSeconds);
      observed.tick(dtSeconds);
    }
    const plainSnapshot = plain.getSnapshot();
    const observedSnapshot = observed.getSnapshot();
    assert.deepEqual(plainSnapshot, observedSnapshot,
      `natural ${originPolicy} snapshot mismatch at ${seconds}s for seed ${seed}`);
    const plainCapture = captureControllerState(plain, { extraTypes: plainOriginTypes });
    const observedCapture = captureControllerState(observed, { extraTypes: instrumentedTypes });
    assertCapturesEqual(plainCapture, observedCapture, [...plainOriginTypes, ...instrumentedTypes]);
    assert.deepEqual(reconstructedField.values, observed.field.values,
      `field operation replay mismatch at ${seconds}s for seed ${seed} (${originPolicy})`);

    const sampleTimeBeforeTickMs = observed.simulationTimeMs;
    const rngBeforeTick = rngCheckpoint(observed.random);
    const preTickPublicSnapshotSha256 = snapshotHash(observedSnapshot);
    const frozenInputSha256 = sha256(Buffer.from(JSON.stringify(observedCapture)));
    const travel = recentTravel.filter(event => event.tick > completedTicks - Math.round(1 / dtSeconds)
      && event.tick <= completedTicks);
    const replayModes = {};
    for (const movementMode of ALL_MODES) {
      replayModes[movementMode] = await runMatchedArm({
        capture: observedCapture, frozenInputSha256, preTickPublicSnapshotSha256,
        movementMode, originPolicy, seed, dtSeconds, sampleTick: completedTicks,
        sampleTimeBeforeTickMs, rngBeforeTick, plainModules, instrumentedModules
      });
    }

    const captureId = `${originPolicy}-seed-${seed}-${seconds}s`;
    const streamRelativePath = `histories/${originPolicy}-seed-${seed}-write-stream.json.gz`;
    const state = {
      schema: 'ant-natural-field-transfer-state/v1',
      captureId,
      originPolicy,
      seed: seed >>> 0,
      secondsCompleted: seconds,
      tick: completedTicks,
      dtSeconds,
      sampleTimeBeforeTickMs,
      rngBeforeTick,
      fieldParameters,
      frozenInputSha256,
      preTickPublicSnapshotSha256,
      sourceHashes: { ...sourceReceipt.sourceHashes },
      validation: {
        naturalPlainInstrumentedStateExact: true,
        naturalPlainInstrumentedRngExact: true,
        naturalPlainInstrumentedPublicSnapshotEqual: true,
        reconstructedFieldExact: true,
        reconstructedFieldSha256: fieldValuesHash(reconstructedField.values),
        sampleTickMatchesRequestedTime: completedTicks === Math.round(seconds / dtSeconds),
        allReplayArmsPreStateAndRngExact: ALL_MODES.every(mode => replayModes[mode].validation.preStateExact
          && replayModes[mode].validation.preRngExact)
      },
      frozenInput: observedCapture,
      previousSecondTravel: { startTick: Math.max(1, completedTicks - Math.round(1 / dtSeconds) + 1),
        endTick: completedTicks, trace: travel },
      writeStream: { path: streamRelativePath, schema: 'ant-natural-field-transfer-write-stream/v1',
        throughTick: completedTicks,
        eventCountThroughTick: fieldEvents.filter(event => event.tick <= completedTicks).length,
        lastSequenceThroughTick: fieldEvents.filter(event => event.tick <= completedTicks).at(-1)?.sequence ?? null },
      replay: { modes: replayModes }
    };
    const relativeStatePath = `states/${captureId}.json.gz`;
    captureChecks.push({ secondsCompleted: seconds, tick: completedTicks,
      simulationTimeMs: sampleTimeBeforeTickMs,
      valuesSha256: fieldValuesHash(reconstructedField.values) });

    {
      if (seconds >= totalSeconds) instrumentedModule.clearTransferTrace(observed);
      completedTicks += 1;
      plain.tick(dtSeconds);
      observed.tick(dtSeconds);
      const afterPlain = captureControllerState(plain, { extraTypes: plainOriginTypes });
      const afterObserved = captureControllerState(observed, { extraTypes: instrumentedTypes });
      assertCapturesEqual(afterPlain, afterObserved, [...plainOriginTypes, ...instrumentedTypes]);
      assert.deepEqual(plain.getSnapshot(), observed.getSnapshot(),
        `natural ${originPolicy} next-tick snapshot mismatch after ${seconds}s`);
      const originArm = replayModes[originPolicy];
      originArm.validation.originArmPlainReplayEqual = equivalentCaptures(
        afterPlain, originArm._plainPost, [...plainOriginTypes, ...instrumentedTypes]);
      originArm.validation.originArmInstrumentedReplayEqual = equivalentCaptures(
        afterObserved, originArm._instrumentedPost, [...plainOriginTypes, ...instrumentedTypes]);
      assert.equal(originArm.validation.originArmPlainReplayEqual, true,
        `origin plain arm did not match natural ${originPolicy} tick after ${seconds}s`);
      assert.equal(originArm.validation.originArmInstrumentedReplayEqual, true,
        `origin instrumented arm did not match natural ${originPolicy} tick after ${seconds}s`);
    }
    const stateReceipt = await writeJsonGzip(outputRoot, relativeStatePath, state);
    stateReceipts.push({ captureId, originPolicy, seed: seed >>> 0, secondsCompleted: seconds,
      tick: state.tick, path: relativeStatePath, sha256: stateReceipt.sha256,
      compressedBytes: stateReceipt.compressedBytes, uncompressedBytes: stateReceipt.uncompressedBytes,
      frozenInputSha256 });
    if (recentTravel.length > Math.round(2 / dtSeconds) * Math.max(1, observed.agents.length)) {
      const oldestTick = completedTicks - Math.round(2 / dtSeconds);
      while (recentTravel.length && recentTravel[0].tick <= oldestTick) recentTravel.shift();
    }
  }

  instrumentedModule.clearTransferTrace(observed);
  await Promise.all([plain.destroy(), observed.destroy()]);
  const writeStream = {
    schema: 'ant-natural-field-transfer-write-stream/v1',
    originPolicy,
    seed: seed >>> 0,
    dtSeconds,
    totalSeconds,
    fieldParameters,
    initialFieldGraph,
    events: fieldEvents,
    captureChecks
  };
  const writeStreamRelativePath = `histories/${originPolicy}-seed-${seed}-write-stream.json.gz`;
  const writeStreamReceipt = await writeJsonGzip(outputRoot, writeStreamRelativePath, writeStream);
  return { stateReceipts,
    writeStreamReceipt: { originPolicy, seed: seed >>> 0, path: writeStreamRelativePath,
      sha256: writeStreamReceipt.sha256, compressedBytes: writeStreamReceipt.compressedBytes,
      uncompressedBytes: writeStreamReceipt.uncompressedBytes, eventCount: fieldEvents.length,
      decayCount: fieldEvents.filter(event => event.type === 'field-decay').length,
      depositWriteCount: fieldEvents.filter(event => event.type === 'field-deposit-write').length,
      captureChecks } };
}

async function runMatchedArm({ capture, frozenInputSha256, preTickPublicSnapshotSha256,
  movementMode, originPolicy, seed, dtSeconds, sampleTick, sampleTimeBeforeTickMs,
  rngBeforeTick, plainModules, instrumentedModules }) {
  const traceModule = instrumentedModules[movementMode];
  const plainModule = plainModules[movementMode];
  const traceTypes = dynamicControllerTypes(traceModule, 'InstrumentedAntController');
  const plainAsCapturedTypes = [{ Type: plainModule.AntController, id: 'InstrumentedAntController' }];
  const traced = restoreControllerState(capture, { extraTypes: traceTypes });
  const plain = restoreControllerState(capture, { extraTypes: plainAsCapturedTypes });

  const tracePre = captureControllerState(traced, { extraTypes: traceTypes });
  const plainPre = captureControllerState(plain, { extraTypes: plainAsCapturedTypes });
  const preStateExact = equivalentCaptures(tracePre, capture, traceTypes)
    && equivalentCaptures(plainPre, capture, plainAsCapturedTypes);
  const preRngExact = JSON.stringify(rngCheckpoint(traced.random)) === JSON.stringify(rngBeforeTick)
    && JSON.stringify(rngCheckpoint(plain.random)) === JSON.stringify(rngBeforeTick);
  const snapshotBeforeEqual = deepEqual(traced.getSnapshot(), plain.getSnapshot())
    && snapshotHash(traced.getSnapshot()) === preTickPublicSnapshotSha256
    && snapshotHash(plain.getSnapshot()) === preTickPublicSnapshotSha256;
  assert.ok(preStateExact, `${movementMode} did not restore the exact frozen state`);
  assert.ok(preRngExact, `${movementMode} did not restore the exact RNG checkpoint`);
  assert.ok(snapshotBeforeEqual, `${movementMode} frozen-input public snapshot differs`);

  const trace = [];
  traceModule.watchTransferTrace(traced, event => trace.push({ ...event,
    tick: sampleTick + 1, originPolicy }), TRACE_TYPES);
  traced.tick(dtSeconds);
  traceModule.clearTransferTrace(traced);
  plain.tick(dtSeconds);

  const instrumentedPost = captureControllerState(traced, { extraTypes: traceTypes });
  const plainPost = captureControllerState(plain, { extraTypes: plainAsCapturedTypes });
  const instrumentedVsPlainPostStateExact = equivalentCaptures(instrumentedPost, plainPost,
    [...traceTypes, ...plainAsCapturedTypes]);
  const instrumentedVsPlainPostRngExact = JSON.stringify(rngCheckpoint(traced.random))
    === JSON.stringify(rngCheckpoint(plain.random));
  const instrumentedVsPlainPostSnapshotEqual = deepEqual(traced.getSnapshot(), plain.getSnapshot());
  assert.ok(instrumentedVsPlainPostStateExact, `${movementMode} trace changed post-tick controller state`);
  assert.ok(instrumentedVsPlainPostRngExact, `${movementMode} trace changed post-tick RNG`);
  assert.ok(instrumentedVsPlainPostSnapshotEqual, `${movementMode} trace changed public snapshot`);

  const validation = {
    frozenInputSha256,
    sameFrozenInput: true,
    preStateExact,
    preRngExact,
    preTickPublicSnapshotEqual: snapshotBeforeEqual,
    instrumentedVsPlainPostStateExact,
    instrumentedVsPlainPostRngExact,
    instrumentedVsPlainPostSnapshotEqual,
    originArmPlainReplayEqual: null,
    originArmInstrumentedReplayEqual: null
  };
  if (movementMode === originPolicy) {
    validation.originArmPlainReplayEqual = null;
    validation.originArmInstrumentedReplayEqual = null;
  }
  const result = {
    movementMode,
    validation,
    rngBeforeTick,
    rngAfterTick: rngCheckpoint(traced.random),
    instrumentedPostSha256: sha256(Buffer.from(JSON.stringify(canonicalCapture(instrumentedPost)))),
    plainPostSha256: sha256(Buffer.from(JSON.stringify(canonicalCapture(plainPost)))),
    publicSnapshotAfterSha256: snapshotHash(traced.getSnapshot()),
    trace
  };
  Object.defineProperties(result, {
    _plainPost: { value: plainPost, enumerable: false },
    _instrumentedPost: { value: instrumentedPost, enumerable: false }
  });
  await Promise.all([plain.destroy(), traced.destroy()]);
  return result;
}

function equivalentCaptures(left, right, extraTypes = []) {
  return deepEqual(canonicalCapture(left), canonicalCapture(right));
}

function dynamicControllerTypes(module, id) {
  if (module.AntController === ProductionAntController) return [];
  return [{ Type: module.AntController, id }];
}

function snapshotHash(snapshot) {
  return sha256(Buffer.from(JSON.stringify(serializeStateGraph(snapshot))));
}

function fieldValuesHash(values) {
  return sha256(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
}

async function freezeSources(outputRoot) {
  const sourcePaths = [...ANT_MODEL_FILES, 'scripts/ant-transfer-state.js',
    'scripts/ant-transfer-capture.js', 'scripts/ant-transfer-matrix.js'];
  const sourceHashes = {};
  const sourceCopies = {};
  for (const relative of sourcePaths) {
    const bytes = await readFile(path.join(PROJECT_ROOT, relative));
    const digest = sha256(bytes);
    sourceHashes[relative] = digest;
    sourceCopies[relative] = await writeFrozenBytes(path.join(outputRoot, 'frozen-source', relative), bytes);
  }
  return { sourceHashes, sourceCopies, generated: {} };
}

async function writeFrozenBytes(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' });
  return { sha256: sha256(bytes), bytes: bytes.byteLength };
}

async function writeJsonGzip(outputRoot, relativePath, value) {
  const target = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const json = Buffer.from(`${JSON.stringify(value)}\n`);
  const compressed = gzipSync(json, { level: 9 });
  assertArtifactSize(target, compressed.byteLength, json.byteLength);
  await writeFile(target, compressed, { flag: 'wx' });
  return { path: relativePath, sha256: sha256(compressed),
    compressedBytes: compressed.byteLength, uncompressedBytes: json.byteLength };
}

function assertArtifactSize(target, compressedBytes, uncompressedBytes) {
  if (compressedBytes >= MAX_ARTIFACT_BYTES) {
    throw new RangeError(`Artifact exceeds the 100 MiB bound: ${target} (${compressedBytes} compressed, ${uncompressedBytes} uncompressed).`);
  }
}

function validateProtocol(seeds, sampleSeconds, dtSeconds, totalSeconds) {
  if (!Array.isArray(seeds) || !seeds.length || seeds.some(seed => !Number.isInteger(seed) || seed < 0)) {
    throw new TypeError('At least one non-negative integer seed is required.');
  }
  if (!Array.isArray(sampleSeconds) || !sampleSeconds.length
      || sampleSeconds.some((seconds, index) => !Number.isFinite(seconds) || seconds <= 0
        || seconds > totalSeconds || (index > 0 && seconds <= sampleSeconds[index - 1]))) {
    throw new RangeError('Capture seconds must be an increasing list within the history duration.');
  }
  if (!(dtSeconds > 0) || !(totalSeconds > 0)
      || !Number.isInteger(totalSeconds / dtSeconds)) {
    throw new RangeError('The fixed timestep must divide the requested history duration exactly.');
  }
  for (const seconds of sampleSeconds) {
    if (!Number.isInteger(seconds / dtSeconds)) {
      throw new RangeError(`Capture time ${seconds}s does not align with the fixed timestep.`);
    }
  }
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function deepEqual(left, right) { return isDeepStrictEqual(left, right); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputDir = process.argv[2] || DEFAULT_OUTPUT;
  runTransferMatrix({ outputDir, progress: event => {
    if (event.event === 'history-start') process.stdout.write(`history ${event.originPolicy} seed ${event.seed} started\n`);
    else process.stdout.write(`history ${event.originPolicy} seed ${event.seed}: ${event.captures} states, write stream ${event.writeStreamBytes} bytes\n`);
  } }).then(receipt => {
    process.stdout.write(`transfer matrix: ${receipt.manifestPath} (${receipt.manifestSha256}); ${receipt.stateCount} states across ${receipt.historyCount} histories\n`);
  }).catch(error => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
