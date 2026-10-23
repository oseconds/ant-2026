import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  ANT_MODEL_FILES, TRACE_TYPES, canonicalCapture, loadInstrumentedAntController,
  readGitHead, replayFieldWrites
} from './ant-transfer-capture.js';
import {
  captureControllerState, restoreControllerState, restoreStateGraph, rngCheckpoint,
  serializeStateGraph
} from './ant-transfer-state.js';
import {
  createTranslatedFieldView, instrumentControllerSensorSamples, phaseOffsets,
  phaseRasterMatches, qualifyPhaseSamples, replayPhaseHistory
} from './ant-transfer-phase.js';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const MOVEMENT_MODES = ['production', 'dtFeedback', 'dampingOff'];
const SOURCE_HASH_FILES = [...ANT_MODEL_FILES, 'scripts/ant-transfer-state.js',
  'scripts/ant-transfer-capture.js', 'scripts/ant-transfer-matrix.js'];
const DEFAULT_MATRIX_DIR = 'docs/ant/evidence/2026-10-23-natural-field-transfer/capture/matrix-20261023';
const DEFAULT_OUTPUT_ROOT = 'docs/ant/evidence/2026-10-23-natural-field-transfer/phase/runs';
const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
const DEFAULT_FIELD_PARAMETERS = { width: 96, height: 96,
  decayHalfLifeSeconds: 15, maxValue: 8 };

/**
 * Qualify one captured pre-tick state before running any nonzero grid phase.
 * Phase-zero p/dt/off trace, complete-state, snapshot and RNG comparisons are
 * all required before the three conditional read/write phase arms are allowed.
 */
export async function runTransferPhaseQualification({ matrixDir, captureId, outputPath = null } = {}) {
  if (typeof captureId !== 'string' || !/^(production|dtFeedback)-seed-\d+-\d+s$/.test(captureId)) {
    throw new TypeError('A matrix capture id such as production-seed-20261005-180s is required.');
  }
  const matrixRoot = path.resolve(PROJECT_ROOT, matrixDir || DEFAULT_MATRIX_DIR);
  const matrixManifest = await readJson(path.join(matrixRoot, 'matrix-manifest.json'));
  assert.equal(matrixManifest.schema, 'ant-natural-field-transfer-matrix-manifest/v1',
    'Unsupported transfer matrix manifest.');

  const stateReceipt = matrixManifest.captures?.find(row => row.captureId === captureId);
  if (!stateReceipt) throw new Error(`Capture ${captureId} is not listed in the matrix manifest.`);
  const state = await readGzipReceipt(matrixRoot, stateReceipt, 'ant-natural-field-transfer-state/v1');
  assert.equal(state.captureId, captureId, 'State receipt and state capture ids differ.');
  assert.equal(state.schema, 'ant-natural-field-transfer-state/v1');

  const streamReceipt = matrixManifest.histories?.find(row => row.originPolicy === state.originPolicy
    && row.seed === state.seed);
  if (!streamReceipt || streamReceipt.path !== state.writeStream?.path) {
    throw new Error('State does not point to its matrix-manifest write stream.');
  }
  const writeStream = await readGzipReceipt(matrixRoot, streamReceipt,
    'ant-natural-field-transfer-write-stream/v1');
  validateStateAndHistory(state, writeStream, matrixManifest);
  await validateFrozenSources(state, matrixManifest);

  const phases = phaseOffsets(state.fieldParameters.width, state.fieldParameters.height);
  const modules = Object.fromEntries(await Promise.all(MOVEMENT_MODES.map(async movementMode =>
    [movementMode, await loadInstrumentedAntController({ movementMode })])));
  const tickEvents = writeStream.events.filter(event => event.tick <= state.tick);
  const sourceController = restoreControllerState(state.frozenInput, {
    extraTypes: [{ Type: modules[state.originPolicy].AntController, id: 'InstrumentedAntController' }]
  });
  let kernelRadius;
  try {
    assert.deepEqual(fieldParameters(sourceController.field), state.fieldParameters,
      'Restored frozen field parameters differ from the receipt.');
    assert.equal(sourceController.state.pheromone.halfLifeSeconds, 15,
      'Qualification is restricted to the default pheromone half-life.');
    assert.equal(sourceController.state.pheromone.amountPerUnitDistance, 4.5,
      'Qualification is restricted to the default pheromone amount-per-distance setting.');
    kernelRadius = maxEventRadius(tickEvents, sourceController.state.pheromone.radius);
    for (const event of tickEvents) if (event.type === 'field-deposit-write') {
      assert.equal(event.radius, sourceController.state.pheromone.radius,
        'Captured history changed radius within the selected fixed-history interval.');
    }
    assert.equal(kernelRadius, sourceController.state.pheromone.radius,
      'Captured history changed radius within the selected fixed-history interval.');
    assert.equal(kernelRadius, 0.0045, 'Qualification is restricted to the default Gaussian brush radius.');
  } finally {
    await sourceController.destroy();
  }
  const phaseHistory = await reconstructPhaseHistory(writeStream, tickEvents, phases[0], state);
  const rasterController = restoreControllerState(state.frozenInput, {
    extraTypes: [{ Type: modules[state.originPolicy].AntController, id: 'InstrumentedAntController' }]
  });
  try {
    assert.ok(phaseRasterMatches(phaseHistory.rawField, rasterController.field.values),
      'Phase-zero history does not bit-exactly reconstruct the captured pre-tick field.');
  } finally {
    await rasterController.destroy();
  }

  const phaseZeroRuns = [];
  for (const movementMode of MOVEMENT_MODES) {
    const result = await runPhaseArm({ state, phase: phases[0], history: phaseHistory,
      module: modules[movementMode], movementMode, phases, tickEvents, kernelRadius });
    result.phaseZeroComparison = comparePhaseZero(result, state, movementMode);
    phaseZeroRuns.push(result);
  }

  const phaseZeroPassed = phaseZeroRuns.every(run => run.phaseZeroComparison.passed);
  const arms = phaseZeroRuns.slice();
  const historyByPhase = { p00: phaseHistory.receipt };
  let shiftedPhasesStatus = 'not-run-phase-zero-rejected';
  if (phaseZeroPassed) {
    shiftedPhasesStatus = 'run-after-phase-zero-gates';
    for (const phase of phases.slice(1)) {
      const history = await reconstructPhaseHistory(writeStream, tickEvents, phase, state);
      historyByPhase[phase.id] = history.receipt;
      for (const movementMode of MOVEMENT_MODES) {
        arms.push(await runPhaseArm({ state, phase, history, module: modules[movementMode],
          movementMode, phases, tickEvents, kernelRadius }));
      }
    }
  }

  const phaseSourceHashes = await hashCurrentFiles(['scripts/ant-transfer-phase.js',
    'scripts/ant-transfer-phase-runs.js']);
  const result = {
    schema: 'ant-natural-field-transfer-phase-qualification/v1',
    status: phaseZeroPassed ? 'qualified-for-conditional-phase-observation' : 'phase-zero-rejected',
    scope: 'default Gaussian fixed-history phase challenge; one tick from one captured complete pre-tick state',
    interpretationLimit: 'Nonzero phases are read/write field interventions conditional on the frozen complete state. Raw field snapshots, TrailPlateBirth and later material consumers are not phase-equivariant; do not treat their post-tick state as a consistent alternative world.',
    sourceAndCapture: {
      matrixManifestSha256: sha256(await readFile(path.join(matrixRoot, 'matrix-manifest.json'))),
      matrixGitHead: matrixManifest.protocol?.gitHead ?? null,
      currentGitHead: await readGitHead(),
      captureId, originPolicy: state.originPolicy, seed: state.seed,
      secondsCompleted: state.secondsCompleted, tick: state.tick,
      sampleTimeBeforeTickMs: state.sampleTimeBeforeTickMs, dtSeconds: state.dtSeconds,
      frozenInputSha256: state.frozenInputSha256,
      writeStreamPath: state.writeStream.path,
      writeStreamSha256: streamReceipt.sha256,
      writeEventCount: tickEvents.length,
      eventCountThroughTick: state.writeStream.eventCountThroughTick,
      lastSequenceThroughTick: state.writeStream.lastSequenceThroughTick,
      sourceHashes: state.sourceHashes,
      phaseSourceHashes
    },
    protocol: { fieldParameters: state.fieldParameters,
      defaultPheromoneSettings: { halfLifeSeconds: 15, amountPerUnitDistance: 4.5, radius: kernelRadius },
      kernelRadius,
      phases: phases.map(phase => ({ ...phase })),
      requiredMovementModes: [...MOVEMENT_MODES],
      rngStart: state.rngBeforeTick,
      fixedHistoryRequestedDose: requestedHistoryDose(tickEvents),
      fixedHistoryElapsedDecaySeconds: elapsedDecay(tickEvents),
      doseReturnSemantics: 'acceptedDose is summed field API returned dose; it is not the cellwise raster mass added after caps',
      boundaryMarginRule: 'max captured compact-kernel radius + maximum normalized grid pitch; all physical and all-phase translated sample coordinates must clear every edge',
      rawSnapshotAndMaterialCaveat: 'Translated sample/write view leaves direct values/getSnapshot consumers unshifted in their world-coordinate interpretation. Post-endpoint material and renderer state is diagnostic only.' },
    phaseZeroPassed,
    shiftedPhasesStatus,
    historyByPhase,
    arms
  };

  if (outputPath) {
    result.output = await writeCompressedResult(outputPath, result);
  }
  return result;
}

async function reconstructPhaseHistory(writeStream, events, phase, state) {
  const rawField = restoreStateGraph(writeStream.initialFieldGraph);
  const samples = [];
  const writes = [];
  const view = replayPhaseHistory({ field: rawField, events, phase, replayFieldWrites,
    samples, writes });
  const historySummary = view.summarize();
  assert.equal(historySummary.requestedDose, requestedHistoryDose(events),
    'Phase replay changed requested fixed-history source dose.');
  assert.equal(historySummary.elapsedDecaySeconds, elapsedDecay(events),
    'Phase replay changed elapsed fixed-history decay time.');
  const depositEvents = events.filter(event => event.type === 'field-deposit-write');
  assert.equal(writes.length, depositEvents.length, 'Phase history write count differs from source events.');
  const receipt = {
    phaseId: phase.id,
    eventCount: events.length,
    decayCount: events.filter(event => event.type === 'field-decay').length,
    depositWriteCount: events.filter(event => event.type === 'field-deposit-write').length,
    requestedDose: historySummary.requestedDose,
    acceptedDose: historySummary.acceptedDose,
    boundaryClippedDose: historySummary.boundaryClippedDose,
    acceptedAboveRequestDose: historySummary.acceptedAboveRequestDose,
    elapsedDecaySeconds: historySummary.elapsedDecaySeconds,
    storedMass: historySummary.storedMass,
    uncappedShadowMass: historySummary.uncappedShadowMass,
    capStorageLoss: historySummary.capStorageLoss,
    cappedCellCount: historySummary.cappedCellCount,
    peak: historySummary.peak,
    fieldValuesSha256: fieldValuesHash(rawField.values),
    captureFieldValuesSha256: state.validation.reconstructedFieldSha256,
    phaseZeroRasterExact: phase.id === 'p00'
      ? fieldValuesHash(rawField.values) === state.validation.reconstructedFieldSha256 : null,
    translatedWriteConvention: 'source event geometry plus this phase dx/dy; order and original request are referenced by source sequence',
    depositOutcomes: writes.map((write, index) => ({ sourceSequence: depositEvents[index].sequence,
      callIndex: write.callIndex, type: write.type, requestedDose: write.requestedDose,
      returnedDose: write.returnedDose, boundaryClippedDose: write.requestedDose - write.returnedDose }))
  };
  return { rawField, uncappedValues: view.uncappedField.values.slice(),
    doseLedger: { ...view.doseLedger }, receipt };
}

async function runPhaseArm({ state, phase, history, module, movementMode, phases, kernelRadius }) {
  const extraTypes = [{ Type: module.AntController, id: 'InstrumentedAntController' }];
  const controller = restoreControllerState(state.frozenInput, { extraTypes });
  const originalField = controller.field;
  const samples = [];
  const writes = [];
  const trace = [];
  let restoreSensors = () => {};
  try {
    const preCapture = captureControllerState(controller, { extraTypes });
    const preStateSha256 = sha256(Buffer.from(JSON.stringify(preCapture)));
    const preSnapshotSha256 = snapshotHash(controller.getSnapshot());
    const rngBeforeTick = rngCheckpoint(controller.random);
    assert.equal(preStateSha256, state.frozenInputSha256,
      `${movementMode}/${phase.id}: restored pre-state differs from captured complete state.`);
    assert.equal(preSnapshotSha256, state.preTickPublicSnapshotSha256,
      `${movementMode}/${phase.id}: restored pre-tick public snapshot differs.`);
    assert.deepEqual(rngBeforeTick, state.rngBeforeTick,
      `${movementMode}/${phase.id}: restored RNG differs from captured checkpoint.`);

    originalField.values.set(history.rawField.values);
    const fieldView = createTranslatedFieldView(originalField, phase, { samples, writes,
      uncappedValues: history.uncappedValues, initialLedger: history.doseLedger });
    controller.field = fieldView.field;
    restoreSensors = instrumentControllerSensorSamples(controller, fieldView);
    module.watchTransferTrace(controller, event => trace.push({ ...event,
      tick: state.tick + 1, originPolicy: state.originPolicy }), TRACE_TYPES);
    controller.tick(state.dtSeconds);
    module.clearTransferTrace(controller);
    restoreSensors();
    restoreSensors = () => {};
    controller.field = originalField;

    let postStateSha256 = null, postSnapshotSha256 = null;
    if (phase.id === 'p00') {
      const postCapture = captureControllerState(controller, { extraTypes });
      postStateSha256 = sha256(Buffer.from(JSON.stringify(canonicalCapture(postCapture))));
      postSnapshotSha256 = snapshotHash(controller.getSnapshot());
    }
    const rngAfterTick = rngCheckpoint(controller.random);
    const qualifiedSamples = qualifyPhaseSamples(samples, phases, {
      width: state.fieldParameters.width,
      height: state.fieldParameters.height,
      radius: kernelRadius
    }).map((sample, callIndex) => ({ ...sample, callIndex }));
    const summary = fieldView.summarize();
    const historyDose = history.receipt;
    const oneTickDose = doseDelta(summary, historyDose);
    return {
      movementMode,
      phase: { ...phase },
      sameFrozenInputSha256: state.frozenInputSha256,
      preStateSha256,
      preSnapshotSha256,
      rngBeforeTick,
      rngAfterTick,
      postStateSha256,
      postSnapshotSha256,
      postWorldStateInterpretation: phase.id === 'p00'
        ? 'complete-state phase-zero parity gate'
        : 'not captured; raw snapshot and later material consumers are not phase-equivariant',
      trace,
      samples: qualifiedSamples,
      agentObservations: joinAgentObservations(trace, qualifiedSamples),
      oneTickWrites: writes,
      phaseDoseLedger: summary,
      oneTickDoseLedger: oneTickDose,
      primaryMovementTraceTypes: trace.filter(row => PRIMARY_TRACE_TYPES.has(row.type)),
      expectedPhaseZero: phase.id === 'p00'
    };
  } finally {
    module.clearTransferTrace(controller);
    restoreSensors();
    controller.field = originalField;
    await controller.destroy();
  }
}

const PRIMARY_TRACE_TYPES = new Set(['intention-input', 'intention-updated', 'wide-options',
  'intention-chosen', 'intention-no-choice', 'local-turn', 'target-heading-base', 'target-turn',
  'target-turn-applied', 'desired-speed', 'accelerate-before', 'accelerate-after',
  'collision-scales', 'displacement']);

export function comparePhaseZero(run, state, movementMode) {
  const baseline = state.replay?.modes?.[movementMode];
  if (!baseline) throw new Error(`Matrix is missing ${movementMode} replay for ${state.captureId}.`);
  const validation = baseline.validation || {};
  const traceExactIgnoringSequence = isDeepStrictEqual(stripTraceSequence(run.trace),
    stripTraceSequence(baseline.trace));
  const postStateExact = run.postStateSha256 === baseline.instrumentedPostSha256
    && run.postStateSha256 === baseline.plainPostSha256;
  const postRngExact = isDeepStrictEqual(run.rngAfterTick, baseline.rngAfterTick);
  const postSnapshotExact = run.postSnapshotSha256 === baseline.publicSnapshotAfterSha256;
  const passed = validation.preStateExact === true && validation.preRngExact === true
    && validation.preTickPublicSnapshotEqual === true
    && validation.instrumentedVsPlainPostStateExact === true
    && validation.instrumentedVsPlainPostRngExact === true
    && validation.instrumentedVsPlainPostSnapshotEqual === true
    && traceExactIgnoringSequence && postStateExact && postRngExact && postSnapshotExact;
  return { passed, traceExactIgnoringSequence, postStateExact, postRngExact,
    postSnapshotExact, matrixBaselineValidation: { ...validation },
    matrixExpected: { instrumentedPostSha256: baseline.instrumentedPostSha256,
      plainPostSha256: baseline.plainPostSha256,
      publicSnapshotAfterSha256: baseline.publicSnapshotAfterSha256,
      rngAfterTick: baseline.rngAfterTick } };
}

function stripTraceSequence(trace) {
  return trace.map(({ sequence, ...row }) => row);
}

function joinAgentObservations(trace, samples) {
  const rows = new Map();
  const get = antId => {
    if (!rows.has(antId)) rows.set(antId, { antId, samples: [], trace: [] });
    return rows.get(antId);
  };
  for (const sample of samples) {
    if (sample.context?.antId !== undefined) get(sample.context.antId).samples.push(sample);
  }
  for (const event of trace) {
    if (event.agentId !== undefined) get(event.agentId).trace.push(event);
  }
  return [...rows.values()].sort((left, right) => String(left.antId).localeCompare(String(right.antId)));
}

function doseDelta(total, history) {
  return Object.fromEntries(['requestedDose', 'acceptedDose', 'boundaryClippedDose',
    'acceptedAboveRequestDose', 'elapsedDecaySeconds'].map(key => [key, total[key] - history[key]]));
}

function requestedHistoryDose(events) {
  return events.reduce((total, event) => {
    if (event.type !== 'field-deposit-write') return total;
    const deposit = event.deposit;
    return total + (deposit.type === 'point' ? deposit.amount
      : Math.hypot(deposit.to.x - deposit.from.x, deposit.to.y - deposit.from.y)
        * deposit.amountPerUnitDistance);
  }, 0);
}

function elapsedDecay(events) {
  return events.reduce((total, event) => total + (event.type === 'field-decay' ? event.dt : 0), 0);
}

function maxEventRadius(events, capturedRadius) {
  if (!Number.isFinite(capturedRadius) || capturedRadius <= 0) {
    throw new RangeError('Frozen capture has no valid pheromone radius.');
  }
  return events.reduce((maximum, event) => event.type === 'field-deposit-write'
    ? Math.max(maximum, event.radius) : maximum, capturedRadius);
}

function validateStateAndHistory(state, stream, manifest) {
  assert.equal(stream.schema, 'ant-natural-field-transfer-write-stream/v1');
  assert.equal(stream.originPolicy, state.originPolicy);
  assert.equal(stream.seed, state.seed);
  assert.equal(state.writeStream.schema, stream.schema);
  assert.equal(state.writeStream.throughTick, state.tick);
  assert.deepEqual(stream.fieldParameters, state.fieldParameters);
  assert.deepEqual(state.fieldParameters, DEFAULT_FIELD_PARAMETERS,
    'This qualification is limited to the unchanged default pheromone field parameters.');
  for (const key of ['naturalPlainInstrumentedStateExact', 'naturalPlainInstrumentedRngExact',
    'naturalPlainInstrumentedPublicSnapshotEqual', 'reconstructedFieldExact', 'sampleTickMatchesRequestedTime',
    'allReplayArmsPreStateAndRngExact']) assert.equal(state.validation?.[key], true,
    `Matrix state has not passed ${key}.`);
  assert.equal(state.frozenInput?.format, 'ant-transfer-state/v1');
  assert.equal(state.frozenInputSha256, sha256(Buffer.from(JSON.stringify(state.frozenInput))));
  assert.ok(Number.isInteger(state.tick) && state.tick > 0);
  assert.ok(Number.isFinite(state.dtSeconds) && state.dtSeconds > 0);
  assert.ok(Number.isFinite(state.sampleTimeBeforeTickMs));
  assert.equal(state.tick, Math.round(state.secondsCompleted / state.dtSeconds));
  assert.equal(state.writeStream.eventCountThroughTick,
    stream.events.filter(event => event.tick <= state.tick).length);
  const throughTick = stream.events.filter(event => event.tick <= state.tick);
  assert.equal(state.writeStream.lastSequenceThroughTick, throughTick.at(-1)?.sequence ?? null);
  const fieldCheck = stream.captureChecks?.find(check => check.tick === state.tick
    && check.secondsCompleted === state.secondsCompleted);
  assert.ok(fieldCheck, 'Write stream has no exact field hash for this captured pre-tick state.');
  assert.equal(fieldCheck.valuesSha256, state.validation.reconstructedFieldSha256,
    'Write-stream field hash differs from the matrix state receipt.');
  assert.deepEqual(state.sourceHashes, manifest.sources?.sourceHashes,
    'State source receipt differs from its matrix manifest.');
  for (const movementMode of MOVEMENT_MODES) {
    const replay = state.replay?.modes?.[movementMode];
    if (!replay) throw new Error(`Matrix lacks ${movementMode} replay arm.`);
    for (const key of ['preStateExact', 'preRngExact', 'preTickPublicSnapshotEqual',
      'instrumentedVsPlainPostStateExact', 'instrumentedVsPlainPostRngExact',
      'instrumentedVsPlainPostSnapshotEqual']) assert.equal(replay.validation?.[key], true,
      `${movementMode} matrix replay has not passed ${key}.`);
    if (!Array.isArray(replay.trace) || !replay.rngAfterTick || !replay.instrumentedPostSha256
      || !replay.plainPostSha256 || !replay.publicSnapshotAfterSha256) {
      throw new Error(`Matrix ${movementMode} replay is missing phase-zero parity receipts.`);
    }
  }
}

async function validateFrozenSources(state, manifest) {
  for (const relative of SOURCE_HASH_FILES) {
    const expected = state.sourceHashes?.[relative];
    if (!expected) throw new Error(`Matrix is missing the frozen source hash for ${relative}.`);
    const current = sha256(await readFile(path.join(PROJECT_ROOT, relative)));
    assert.equal(current, expected, `Frozen source changed since matrix capture: ${relative}`);
  }
  assert.equal(state.sourceHashes['scripts/ant-transfer-state.js'], manifest.sources.sourceHashes['scripts/ant-transfer-state.js']);
}

async function readGzipReceipt(root, receipt, expectedSchema) {
  if (!receipt || typeof receipt.path !== 'string' || !/^[a-f0-9]{64}$/i.test(receipt.sha256 || '')) {
    throw new TypeError('Matrix artifact receipt is malformed.');
  }
  if (!Number.isSafeInteger(receipt.compressedBytes) || receipt.compressedBytes <= 0
    || !Number.isSafeInteger(receipt.uncompressedBytes) || receipt.uncompressedBytes <= 0) {
    throw new TypeError('Matrix artifact receipt sizes must be positive safe integers.');
  }
  const relative = receipt.path.replaceAll('\\', '/');
  if (relative.startsWith('/') || relative.split('/').includes('..')) {
    throw new RangeError('Matrix artifact path must stay within the matrix directory.');
  }
  const compressed = await readFile(path.join(root, relative));
  assert.equal(compressed.byteLength, receipt.compressedBytes,
    `Matrix artifact compressed size mismatch: ${relative}`);
  if (compressed.byteLength >= MAX_ARTIFACT_BYTES) {
    throw new RangeError(`Compressed matrix artifact exceeds 100 MiB: ${relative}`);
  }
  assert.equal(sha256(compressed), receipt.sha256, `Matrix artifact hash mismatch: ${relative}`);
  const bytes = gunzipSync(compressed, { maxOutputLength: receipt.uncompressedBytes });
  assert.equal(bytes.byteLength, receipt.uncompressedBytes,
    `Matrix artifact uncompressed size mismatch: ${relative}`);
  const value = JSON.parse(bytes.toString('utf8'));
  assert.equal(value.schema, expectedSchema, `Unexpected schema in ${relative}.`);
  return value;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function fieldParameters(field) {
  return { width: field.width, height: field.height,
    decayHalfLifeSeconds: field.decayHalfLifeSeconds, maxValue: field.maxValue };
}

function snapshotHash(snapshot) {
  return sha256(Buffer.from(JSON.stringify(serializeStateGraph(snapshot))));
}

function fieldValuesHash(values) {
  if (!(values instanceof Float32Array) || !values.every(Number.isFinite)) {
    throw new TypeError('Field raster must be a finite Float32Array.');
  }
  return sha256(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
}

async function hashCurrentFiles(paths) {
  return Object.fromEntries(await Promise.all(paths.map(async relative =>
    [relative, sha256(await readFile(path.join(PROJECT_ROOT, relative)))])));
}

async function writeCompressedResult(outputPath, result) {
  const target = path.resolve(PROJECT_ROOT, outputPath);
  const relative = path.relative(PROJECT_ROOT, target).replaceAll(path.sep, '/');
  if (relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new RangeError('Phase qualification output must stay within this repository.');
  }
  await mkdir(path.dirname(target), { recursive: true });
  const json = Buffer.from(`${JSON.stringify(result, null, 2)}\n`);
  const compressed = gzipSync(json, { level: 9 });
  if (compressed.byteLength >= MAX_ARTIFACT_BYTES) {
    throw new RangeError('Compressed phase qualification artifact exceeds the 100 MiB evidence bound.');
  }
  await writeFile(target, compressed, { flag: 'wx' });
  return { path: relative, sha256: sha256(compressed), compressedBytes: compressed.byteLength,
    uncompressedBytes: json.byteLength };
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function parseCliArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--help' || key === '-h') return { help: true };
    if (!['--matrix-dir', '--capture-id', '--output'].includes(key)) {
      throw new Error(`Unknown argument: ${key}`);
    }
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    values[key.slice(2).replaceAll('-', '')] = value;
  }
  if (!values.captureid) throw new Error('Usage requires --capture-id <matrix capture id>.');
  return { matrixDir: values.matrixdir || DEFAULT_MATRIX_DIR, captureId: values.captureid,
    outputPath: values.output || path.join(DEFAULT_OUTPUT_ROOT,
      `${values.captureid}-default-gaussian-phase-qualification.json.gz`) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseCliArguments(process.argv.slice(2));
    if (args.help) {
      process.stdout.write('Run only after the parent accepts Stage A complete-state/RNG qualification.\n'
        + 'node scripts/ant-transfer-phase-runs.js --capture-id <origin-seed-time> '
        + '[--matrix-dir <matrix-directory>] [--output <evidence-gzip-path>]\n');
    } else {
      const result = await runTransferPhaseQualification(args);
      process.stdout.write(`phase qualification: ${result.status}; capture ${result.sourceAndCapture.captureId}`
        + `; ${result.arms.length} one-tick arms; ${result.output.path} (${result.output.sha256})\n`);
      if (!result.phaseZeroPassed) process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}
