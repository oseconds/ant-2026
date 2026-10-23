import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoreStateGraph } from './ant-transfer-state.js';
import { replayFieldWrites } from './ant-transfer-capture.js';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARMS = ['production', 'dtFeedback', 'dampingOff'];
const ARM_PAIRS = [
  ['production', 'dtFeedback'],
  ['production', 'dampingOff'],
  ['dtFeedback', 'dampingOff']
];
const ANGLE_EPSILON = 1e-9;
const OMEGA_DEADBAND = 1e-4;
const TAU = Math.PI * 2;
const ANALYSIS_SCHEMA = 'ant-natural-field-transfer-analysis/v1';

/** Pure analysis of paired one-tick replay receipts. It never changes or simulates a world. */
export function analyzeTransferMatrix({ manifest = null, captures }) {
  if (!Array.isArray(captures) || captures.length === 0) {
    throw new TypeError('Transfer analysis requires at least one frozen-state capture.');
  }

  const captureResults = captures.map(analyzeCapture);
  const antRows = captureResults.flatMap(result => result.ants);
  const pairRows = captureResults.flatMap(result => result.pairs);
  const strataSummaries = summarizePairs(pairRows);
  return {
    schema: ANALYSIS_SCHEMA,
    protocol: {
      movementModes: ARMS,
      pairings: ARM_PAIRS.map(([left, right]) => `${left} vs ${right}`),
      angleEpsilonRad: ANGLE_EPSILON,
      omegaDeadbandRadPerSecond: OMEGA_DEADBAND,
      adherenceBins: ['low [0,0.3)', 'middle [0.3,0.7)', 'high [0.7,1]'],
      coherenceBins: ['low [0,1/3)', 'middle [1/3,2/3)', 'high [2/3,1]'],
      omegaBins: ['negative < -1e-4 rad/s', 'near-zero [-1e-4,+1e-4] rad/s', 'positive > +1e-4 rad/s'],
      headingBins: 8,
      rasterPhaseBins: 'halves of fractional (95*x,95*y)',
      crowdBins: 'authored separation/front branch entry; raw occupancy terms retained',
      units: 'Angles are radians; omega is rad/s; position and travel are normalized world units; elapsed time is seconds.',
      interpretation: 'A paired result is conditional one-tick read-side transfer on one frozen natural field and world state. It does not identify field representation dominance or compare independently grown origin histories causally.',
      independence: 'Ant-by-frozen-world rows and repeated captures are descriptive observations, not independent replicates.'
    },
    inputReceipts: manifest?.receipts ?? null,
    manifest: manifest ? {
      schema: manifest.schema ?? null,
      gitHead: manifest.gitHead ?? manifest.protocol?.gitHead ?? manifest.provenance?.gitHead ?? null,
      stateCount: manifest.captures?.length ?? captures.length,
      historyCount: manifest.histories?.length ?? null
    } : null,
    coverage: {
      frozenWorldStates: captureResults.length,
      validFrozenWorldStates: captureResults.filter(result => result.validation.causalEligible).length,
      invalidFrozenWorldStates: captureResults.filter(result => !result.validation.causalEligible).length,
      antObservations: antRows.length,
      completeThreeArmAntObservations: antRows.filter(row => row.completeThreeArm).length,
      pairObservations: pairRows.length
    },
    captureResults,
    summaries: strataSummaries
  };
}

/** Read and verify the immutable matrix receipts, then analyze every fixed-state capture. */
export async function loadTransferAnalysis({
  manifestPath = 'docs/ant/evidence/2026-10-23-natural-field-transfer/capture/matrix-20261023/matrix-manifest.json',
  outputDir = 'docs/ant/evidence/2026-10-23-natural-field-transfer/analysis/matrix-20261023'
} = {}) {
  const absoluteManifestPath = path.resolve(PROJECT_ROOT, manifestPath);
  const manifestBytes = await readFile(absoluteManifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assertManifestCoverage(manifest);
  const matrixRoot = path.dirname(absoluteManifestPath);
  const manifestSha256 = sha256(manifestBytes);
  const sourceVerification = await verifyFrozenSources(matrixRoot, manifest.sources);
  const historyVerification = await verifyHistoryStreams(matrixRoot, manifest);
  const captures = [];
  const stateChecks = [];
  for (const receipt of manifest.captures) {
    const { value: state, uncompressedBytes } = await readGzipJsonReceipt(matrixRoot, receipt,
      `state ${receipt.captureId}`);
    assertStateReceipt(state, receipt, manifest, uncompressedBytes);
    const linkedHistory = manifest.histories.find(item => item.originPolicy === receipt.originPolicy
      && item.seed === receipt.seed);
    const checkpoint = linkedHistory?.captureChecks?.find(item => item.tick === receipt.tick);
    if (!checkpoint || checkpoint.valuesSha256 !== state.validation?.reconstructedFieldSha256) {
      throw new Error(`Reconstructed field hash receipt does not match ${receipt.captureId}.`);
    }
    captures.push(state);
    stateChecks.push({ captureId: receipt.captureId, frozenInputSha256: state.frozenInputSha256,
      fieldValuesSha256: checkpoint.valuesSha256, sampleTimeBeforeTickMs: state.sampleTimeBeforeTickMs,
      tick: state.tick, bytes: receipt.compressedBytes });
  }
  const analysis = analyzeTransferMatrix({ manifest, captures });
  analysis.integrity = {
    manifestPath: path.relative(PROJECT_ROOT, absoluteManifestPath).replaceAll(path.sep, '/'),
    manifestSha256,
    sourceFilesVerified: sourceVerification.sourceFilesVerified,
    generatedFilesVerified: sourceVerification.generatedFilesVerified,
    stateFilesVerified: stateChecks.length,
    historyStreamsVerified: historyVerification.streamsVerified,
    fieldCheckpointsVerified: historyVerification.fieldCheckpointsVerified,
    compressedAndUncompressedLengthsVerified: true,
    stateChecks,
    historyChecks: historyVerification.historyChecks
  };
  const outputRoot = path.resolve(PROJECT_ROOT, outputDir);
  await mkdir(outputRoot, { recursive: true });
  const outputPaths = {
    results: path.join(outputRoot, 'results.json'),
    marginals: path.join(outputRoot, 'marginal-summaries.csv'),
    report: path.join(outputRoot, 'REPORT.md')
  };
  analysis.outputs = Object.fromEntries(Object.entries(outputPaths).map(([key, target]) => [key,
    path.relative(PROJECT_ROOT, target).replaceAll(path.sep, '/') ]));
  const resultBytes = Buffer.from(`${JSON.stringify(analysis, null, 2)}\n`);
  const marginalBytes = Buffer.from(summariesToCsv(analysis.summaries));
  const reportBytes = Buffer.from(renderAnalysisReport(analysis));
  for (const [label, target] of Object.entries(outputPaths)) {
    try {
      await readFile(target);
      throw new Error(`Refusing to overwrite existing ${label} output: ${target}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await Promise.all([
    writeFile(outputPaths.results, resultBytes, { flag: 'wx' }),
    writeFile(outputPaths.marginals, marginalBytes, { flag: 'wx' }),
    writeFile(outputPaths.report, reportBytes, { flag: 'wx' })
  ]);
  return { analysis, outputs: analysis.outputs };
}

function assertManifestCoverage(manifest) {
  if (manifest?.schema !== 'ant-natural-field-transfer-matrix-manifest/v1') {
    throw new TypeError(`Unsupported transfer matrix manifest: ${manifest?.schema ?? 'missing schema'}`);
  }
  const protocol = manifest.protocol ?? {};
  const expectedCount = (protocol.seeds?.length ?? 0) * (protocol.originPolicies?.length ?? 0)
    * (protocol.sampleSeconds?.length ?? 0);
  if (expectedCount !== 66 || manifest.captures?.length !== expectedCount
      || protocol.statesExpected !== expectedCount || manifest.histories?.length !== 6) {
    throw new Error(`Matrix coverage mismatch: expected fixed 66-state / 6-history cohort; received ${manifest.captures?.length ?? 0} states and ${manifest.histories?.length ?? 0} histories.`);
  }
  if (JSON.stringify(protocol.seeds) !== JSON.stringify([20261005, 20261006, 20261007])
      || JSON.stringify(protocol.originPolicies) !== JSON.stringify(['production', 'dtFeedback'])
      || JSON.stringify(protocol.movementModes) !== JSON.stringify(ARMS)
      || JSON.stringify(protocol.sampleSeconds) !== JSON.stringify([30, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600])
      || Math.abs(protocol.dtSeconds - 1 / 60) > 1e-15 || protocol.totalSeconds !== 600) {
    throw new Error('Matrix protocol does not match the frozen seeds, origins, modes, times, timestep, and duration.');
  }
  const keys = new Set();
  for (const receipt of manifest.captures) {
    const key = JSON.stringify([receipt.originPolicy, receipt.seed, receipt.secondsCompleted]);
    if (keys.has(key)) throw new Error(`Duplicate state receipt: ${key}`);
    keys.add(key);
  }
  const expectedKeys = new Set(protocol.originPolicies.flatMap(originPolicy => protocol.seeds.flatMap(seed =>
    protocol.sampleSeconds.map(seconds => JSON.stringify([originPolicy, seed, seconds])))));
  if (keys.size !== expectedCount || !same([...keys].sort(), [...expectedKeys].sort())) {
    throw new Error('The manifest does not contain every fixed origin/seed/time state.');
  }
  const expectedHistories = new Set(protocol.originPolicies.flatMap(originPolicy => protocol.seeds.map(seed =>
    JSON.stringify([originPolicy, seed]))));
  const actualHistories = new Set(manifest.histories.map(receipt => JSON.stringify([receipt.originPolicy, receipt.seed])));
  if (actualHistories.size !== manifest.histories.length || !same([...actualHistories].sort(), [...expectedHistories].sort())) {
    throw new Error('The manifest does not contain every unique natural-origin/seed history stream.');
  }
}

async function verifyFrozenSources(matrixRoot, sources = {}) {
  const hashes = sources.sourceHashes ?? {};
  const copies = sources.sourceCopies ?? {};
  const generated = sources.generated ?? {};
  const sourcePaths = Object.keys(hashes).sort();
  if (!sourcePaths.length || !same(sourcePaths, Object.keys(copies).sort())) {
    throw new Error('Frozen source-copy manifest does not match source hash paths.');
  }
  for (const relative of sourcePaths) {
    const record = copies[relative];
    const bytes = await readArtifact(matrixRoot, `frozen-source/${relative}`);
    if (sha256(bytes) !== hashes[relative] || sha256(bytes) !== record.sha256 || bytes.byteLength !== record.bytes) {
      throw new Error(`Frozen source receipt mismatch: ${relative}`);
    }
  }
  for (const [relative, record] of Object.entries(generated)) {
    const bytes = await readArtifact(matrixRoot, `frozen-source/${relative}`);
    if (sha256(bytes) !== record.sha256 || bytes.byteLength !== record.bytes) {
      throw new Error(`Generated source receipt mismatch: ${relative}`);
    }
  }
  return { sourceFilesVerified: sourcePaths.length, generatedFilesVerified: Object.keys(generated).length };
}

async function verifyHistoryStreams(matrixRoot, manifest) {
  const historyChecks = [];
  let fieldCheckpointsVerified = 0;
  for (const receipt of manifest.histories) {
    const { value: stream } = await readGzipJsonReceipt(matrixRoot, receipt,
      `history ${receipt.originPolicy} seed ${receipt.seed}`);
    if (stream?.schema !== 'ant-natural-field-transfer-write-stream/v1'
        || stream.originPolicy !== receipt.originPolicy || stream.seed !== receipt.seed
        || stream.totalSeconds !== manifest.protocol.totalSeconds
        || Math.abs(stream.dtSeconds - manifest.protocol.dtSeconds) > 1e-15
        || stream.events?.length !== receipt.eventCount
        || stream.events.filter(event => event.type === 'field-decay').length !== receipt.decayCount
        || stream.events.filter(event => event.type === 'field-deposit-write').length !== receipt.depositWriteCount) {
      throw new Error(`History stream metadata mismatch: ${receipt.path}`);
    }
    const events = stream.events;
    if (events.some((event, index) => index > 0 && event.sequence <= events[index - 1].sequence)) {
      throw new Error(`Field operation stream sequence is not strictly ordered: ${receipt.path}`);
    }
    if (events.some((event, index) => index > 0 && event.tick < events[index - 1].tick)) {
      throw new Error(`Field operation tick order is not monotonic: ${receipt.path}`);
    }
    const field = restoreStateGraph(stream.initialFieldGraph);
    let eventIndex = 0;
    const checkpoints = [...(stream.captureChecks ?? [])].sort((left, right) => left.tick - right.tick);
    if (checkpoints.length !== manifest.protocol.sampleSeconds.length
        || checkpoints.some((checkpoint, index) => checkpoint.secondsCompleted !== manifest.protocol.sampleSeconds[index]
          || checkpoint.tick !== Math.round(checkpoint.secondsCompleted / manifest.protocol.dtSeconds))) {
      throw new Error(`History stream does not contain every exact fixed-time field checkpoint: ${receipt.path}`);
    }
    if (events.some(event => !Number.isInteger(event.tick) || event.tick < 1
        || event.tick > Math.round(stream.totalSeconds / stream.dtSeconds)
        || (event.type !== 'field-decay' && event.type !== 'field-deposit-write'))) {
      throw new Error(`Field operation event has invalid type/tick: ${receipt.path}`);
    }
    for (const checkpoint of checkpoints) {
      const operations = [];
      while (eventIndex < events.length && events[eventIndex].tick <= checkpoint.tick) {
        operations.push(events[eventIndex]);
        eventIndex += 1;
      }
      replayFieldWrites(field, operations);
      if (fieldValuesSha256(field.values) !== checkpoint.valuesSha256) {
        throw new Error(`Field write replay hash mismatch at tick ${checkpoint.tick}: ${receipt.path}`);
      }
      fieldCheckpointsVerified += 1;
    }
    if (!same(checkpoints, receipt.captureChecks ?? [])) {
      throw new Error(`Manifest/stream capture-check mismatch: ${receipt.path}`);
    }
    historyChecks.push({ originPolicy: receipt.originPolicy, seed: receipt.seed,
      path: receipt.path, sha256: receipt.sha256, eventCount: events.length,
      captureChecks: checkpoints.length, throughTick: stream.totalSeconds / stream.dtSeconds });
  }
  return { streamsVerified: historyChecks.length, fieldCheckpointsVerified, historyChecks };
}

async function readGzipJsonReceipt(matrixRoot, receipt, label) {
  if (!receipt?.path || !/^[0-9a-f]{64}$/i.test(receipt.sha256 ?? '')) {
    throw new TypeError(`Invalid compressed-file receipt for ${label}.`);
  }
  const compressed = await readArtifact(matrixRoot, receipt.path);
  if (sha256(compressed) !== receipt.sha256 || compressed.byteLength !== receipt.compressedBytes) {
    throw new Error(`Compressed bytes/hash mismatch for ${label}: ${receipt.path}`);
  }
  const uncompressed = gunzipSync(compressed);
  if (receipt.uncompressedBytes !== undefined && uncompressed.byteLength !== receipt.uncompressedBytes) {
    throw new Error(`Uncompressed byte-count mismatch for ${label}: ${receipt.path}`);
  }
  return { value: JSON.parse(uncompressed.toString('utf8')), uncompressedBytes: uncompressed.byteLength };
}

async function readArtifact(root, relative) {
  const target = path.resolve(root, relative);
  const relativeCheck = path.relative(root, target);
  if (!relativeCheck || relativeCheck.startsWith(`..${path.sep}`) || path.isAbsolute(relativeCheck)) {
    throw new Error(`Artifact path escapes its evidence directory: ${relative}`);
  }
  return readFile(target);
}

function assertStateReceipt(state, receipt, manifest, uncompressedBytes) {
  if (state?.schema !== 'ant-natural-field-transfer-state/v1'
      || state.captureId !== receipt.captureId || state.originPolicy !== receipt.originPolicy
      || state.seed !== receipt.seed || state.secondsCompleted !== receipt.secondsCompleted
      || state.tick !== receipt.tick || state.frozenInputSha256 !== receipt.frozenInputSha256
      || Math.abs(state.dtSeconds - manifest.protocol.dtSeconds) > 1e-15
      || state.tick !== Math.round(state.secondsCompleted / manifest.protocol.dtSeconds)
      || state.previousSecondTravel?.startTick !== state.tick - 59
      || state.previousSecondTravel?.endTick !== state.tick
      || uncompressedBytes !== receipt.uncompressedBytes
      || !same(state.sourceHashes, manifest.sources.sourceHashes)) {
    throw new Error(`State receipt metadata mismatch: ${receipt.captureId}`);
  }
  const computed = sha256(Buffer.from(JSON.stringify(state.frozenInput)));
  if (computed !== state.frozenInputSha256) throw new Error(`Frozen-input content hash mismatch: ${receipt.captureId}`);
  for (const mode of ARMS) {
    const validation = state.replay?.modes?.[mode]?.validation;
    if (!validation || validation.frozenInputSha256 !== state.frozenInputSha256) {
      throw new Error(`Replay validation is missing/mismatched for ${receipt.captureId} ${mode}.`);
    }
  }
}

function fieldValuesSha256(values) {
  return sha256(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
}

function summariesToCsv(summaries) {
  const columns = ['seed', 'originPolicy', 'leftMode', 'rightMode', 'stratumDimension', 'stratumValue',
    'antWorldObservations', 'frozenWorldStates', 'causalEligibleObservations', 'invalidReplayObservations',
    'allReplayCueEligible', 'localCueEligible', 'feedbackOpposesCue', 'rightFeedbackOpposesCue',
    'leftLocalCanceled', 'leftLocalReversed', 'leftLocalSameSign', 'rightLocalCanceled', 'rightLocalReversed',
    'rightLocalSameSign', 'leftBodyCanceled', 'leftBodyReversed', 'leftBodySameSign', 'rightBodyCanceled',
    'rightBodyReversed', 'rightBodySameSign', 'leftTravelCanceled', 'leftTravelReversed', 'leftTravelSameSign',
    'rightTravelCanceled', 'rightTravelReversed', 'rightTravelSameSign',
    'leftObservedTravelCanceled', 'leftObservedTravelReversed', 'leftObservedTravelSameSign',
    'rightObservedTravelCanceled', 'rightObservedTravelReversed', 'rightObservedTravelSameSign',
    'firstDivergence', 'signedRangesRad',
    'collisionScaleDeltaRange', 'cueEligibleDenominators', 'turnCap'];
  const rows = summaries.map(summary => {
    const transfers = summary.transferCounts ?? {};
    return {
      ...summary,
      leftLocalCanceled: transfers.leftLocal?.['canceled-or-zero'],
      leftLocalReversed: transfers.leftLocal?.reversed,
      leftLocalSameSign: transfers.leftLocal?.['same-sign-survives'],
      rightLocalCanceled: transfers.rightLocal?.['canceled-or-zero'],
      rightLocalReversed: transfers.rightLocal?.reversed,
      rightLocalSameSign: transfers.rightLocal?.['same-sign-survives'],
      leftBodyCanceled: transfers.leftBody?.['canceled-or-zero'],
      leftBodyReversed: transfers.leftBody?.reversed,
      leftBodySameSign: transfers.leftBody?.['same-sign-survives'],
      rightBodyCanceled: transfers.rightBody?.['canceled-or-zero'],
      rightBodyReversed: transfers.rightBody?.reversed,
      rightBodySameSign: transfers.rightBody?.['same-sign-survives'],
      leftTravelCanceled: transfers.leftTravel?.['canceled-or-zero'],
      leftTravelReversed: transfers.leftTravel?.reversed,
      leftTravelSameSign: transfers.leftTravel?.['same-sign-survives'],
      rightTravelCanceled: transfers.rightTravel?.['canceled-or-zero'],
      rightTravelReversed: transfers.rightTravel?.reversed,
      rightTravelSameSign: transfers.rightTravel?.['same-sign-survives'],
      leftObservedTravelCanceled: transfers.leftObservedTravel?.['canceled-or-zero'],
      leftObservedTravelReversed: transfers.leftObservedTravel?.reversed,
      leftObservedTravelSameSign: transfers.leftObservedTravel?.['same-sign-survives'],
      rightObservedTravelCanceled: transfers.rightObservedTravel?.['canceled-or-zero'],
      rightObservedTravelReversed: transfers.rightObservedTravel?.reversed,
      rightObservedTravelSameSign: transfers.rightObservedTravel?.['same-sign-survives']
    };
  });
  return `${columns.join(',')}\n${rows.map(row => columns.map(column => csvCell(row[column])).join(',')).join('\n')}\n`;
}

function csvCell(value) {
  const textValue = value === undefined || value === null ? ''
    : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(textValue) ? `"${textValue.replaceAll('"', '""')}"` : textValue;
}

export function renderAnalysisReport(analysis) {
  const rows = analysis.summaries.filter(summary => summary.stratumDimension === 'all');
  const lines = [
    '# Natural-field transfer analysis',
    '',
    `Manifest SHA-256: \`${analysis.integrity.manifestSha256}\``,
    '',
    'This is a conditional one-tick read-side comparison from paired arms restored from one exact natural state. The production and dtFeedback origin histories are summarized separately and are not matched treatments. It does not establish field-representation dominance, write/read contribution across divergent histories, or an adoption decision.',
    '',
    '## Receipt verification',
    '',
    `Verified ${analysis.integrity.sourceFilesVerified} frozen source copies, ${analysis.integrity.generatedFilesVerified} generated controller copies, ${analysis.integrity.stateFilesVerified} state receipts, and ${analysis.integrity.historyStreamsVerified} field-operation streams. Replayed ${analysis.integrity.fieldCheckpointsVerified} field reconstruction checkpoints and verified compressed/uncompressed byte receipts.`,
    '',
    `Causal gate: ${analysis.coverage.validFrozenWorldStates}/${analysis.coverage.frozenWorldStates} frozen states valid; ${analysis.coverage.invalidFrozenWorldStates} invalid. Complete three-arm ant observations: ${analysis.coverage.completeThreeArmAntObservations}/${analysis.coverage.antObservations}.`,
    '',
    '## Overall paired counts',
    '',
    '| Seed | Natural origin | Arm pair | States | Causal ant-world n | Cue-eligible n | Left feedback opposes cue | Left local cancel / reverse / same-sign | Right local cancel / reverse / same-sign | Left actual-travel cancel / reverse / same-sign | First divergence (sense / choice / local / target / omega / travel / none) |',
    '|---:|---|---|---:|---:|---:|---:|---|---|---|---|'
  ];
  for (const row of rows) {
    const transfers = row.transferCounts;
    const pairCount = stage => `${transfers[`left${capitalize(stage)}`]?.['canceled-or-zero'] ?? 0}/${transfers[`left${capitalize(stage)}`]?.reversed ?? 0}/${transfers[`left${capitalize(stage)}`]?.['same-sign-survives'] ?? 0}`;
    const rightLocal = transfers.rightLocal;
    const divergence = ['sense', 'choice', 'localTurn', 'target', 'omega', 'travel', 'none']
      .map(stage => row.firstDivergence[stage]).join(' / ');
    const actualTravel = transfers.leftTravel;
    lines.push(`| ${row.seed} | ${row.originPolicy} | ${row.leftMode} vs ${row.rightMode} | ${row.frozenWorldStates} | ${row.causalEligibleObservations} | ${row.localCueEligible} | ${row.feedbackOpposesCue}/${row.cueOpposedFeedbackDenominator} | ${pairCount('Local')} | ${rightLocal?.['canceled-or-zero'] ?? 0}/${rightLocal?.reversed ?? 0}/${rightLocal?.['same-sign-survives'] ?? 0} | ${actualTravel?.['canceled-or-zero'] ?? 0}/${actualTravel?.reversed ?? 0}/${actualTravel?.['same-sign-survives'] ?? 0} | ${divergence} |`);
  }
  lines.push('', '### Production vs dtFeedback paired difference ranges', '',
    '| Seed | Natural origin | Cue-eligible n | Local turn Δ (P−dt), rad | Command residual Δ, rad | Body turn Δ, rad | Actual travel angle Δ, rad | Observed travel angle Δ, rad | Collision-scale Δ |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of rows.filter(summary => summary.leftMode === 'production' && summary.rightMode === 'dtFeedback')) {
    lines.push(`| ${row.seed} | ${row.originPolicy} | ${row.localCueEligible} | ${fmtRange(row.signedRangesRad.localTurnDelta)} | ${fmtRange(row.signedRangesRad.commandErrorDelta)} | ${fmtRange(row.signedRangesRad.bodyTurnDelta)} | ${fmtRange(row.signedRangesRad.travelAngleDelta)} | ${fmtRange(row.signedRangesRad.observedTravelAngleDelta)} | ${fmtRange(row.collisionScaleDeltaRange)} |`);
  }
  lines.push('', 'All marginal strata, denominators, sign counts, continuous ranges, body-cap counts and first-divergence counts are in [marginal-summaries.csv](marginal-summaries.csv). The full ant-by-state paired values and fixed-state validation flags are in [results.json.gz](results.json.gz); [RECEIPTS.json](RECEIPTS.json) records its uncompressed SHA-256 and byte count. These repeated observations are dependent within each natural world.', '',
    '## High-adherence production vs dtFeedback', '',
    '| Seed | Natural origin | Cue-eligible n | Left feedback opposes cue | Production local cancel / reverse / same-sign | dtFeedback local cancel / reverse / same-sign | Body-turn cap hits P / dt |',
    '|---:|---|---:|---:|---|---|---:|');
  for (const row of analysis.summaries.filter(summary => summary.stratumDimension === 'adherence'
    && summary.stratumValue === 'high' && summary.leftMode === 'production' && summary.rightMode === 'dtFeedback')) {
    const left = row.transferCounts.leftLocal;
    const right = row.transferCounts.rightLocal;
    lines.push(`| ${row.seed} | ${row.originPolicy} | ${row.localCueEligible} | ${row.feedbackOpposesCue}/${row.cueOpposedFeedbackDenominator} | ${left['canceled-or-zero']}/${left.reversed}/${left['same-sign-survives']} | ${right['canceled-or-zero']}/${right.reversed}/${right['same-sign-survives']} | ${row.turnCap.left}/${row.turnCap.right} of ${row.turnCap.denominator} |`);
  }
  const highPairRows = analysis.summaries.filter(summary => summary.stratumDimension === 'adherence'
    && summary.stratumValue === 'high' && summary.leftMode === 'production' && summary.rightMode === 'dtFeedback');
  const sumHigh = (originPolicy, selector) => highPairRows.filter(row => row.originPolicy === originPolicy)
    .reduce((sum, row) => sum + selector(row), 0);
  const sumHighStatus = (originPolicy, arm, stage, status) => sumHigh(originPolicy,
    row => row.transferCounts[`${arm}${capitalize(stage)}`]?.[status] ?? 0);
  const entrySummary = originPolicy => analysis.captureResults.filter(result => result.originPolicy === originPolicy)
    .flatMap(result => result.ants).filter(ant => ant.completeThreeArm && ant.captureCausalEligible);
  const clampSummary = originPolicy => {
    const ants = entrySummary(originPolicy);
    const clamped = ants.filter(ant => Math.abs(ant.modes.production.local.previousOmega) > 2.2);
    const high = ants.filter(ant => ant.strata.adherence === 'high');
    return { ants, clamped, high, highClamped: high.filter(ant => Math.abs(ant.modes.production.local.previousOmega) > 2.2),
      exactlyAtLimit: ants.filter(ant => Math.abs(ant.modes.production.local.previousOmega) === 2.2).length };
  };
  const productionClamp = clampSummary('production');
  const dtFeedbackClamp = clampSummary('dtFeedback');
  const highProductionCueN = sumHigh('production', row => row.localCueEligible);
  const highDtOriginCueN = sumHigh('dtFeedback', row => row.localCueEligible);
  lines.push('', '## Conditional A1/A2 findings', '',
    `The fixed-state result addresses only conditional read-side transfer. In the high entry-adherence stratum, production feedback opposes the nonzero local cue in ${sumHigh('production', row => row.feedbackOpposesCue)}/${highProductionCueN} cue-eligible observations from production-origin states and ${sumHigh('dtFeedback', row => row.feedbackOpposesCue)}/${highDtOriginCueN} from dtFeedback-origin states. Production local turn reverses the cue in ${sumHighStatus('production', 'left', 'local', 'reversed')}/${highProductionCueN} and ${sumHighStatus('dtFeedback', 'left', 'local', 'reversed')}/${highDtOriginCueN}, respectively; the paired dtFeedback local turn reverses it in ${sumHighStatus('production', 'right', 'local', 'reversed')}/${highProductionCueN} and ${sumHighStatus('dtFeedback', 'right', 'local', 'reversed')}/${highDtOriginCueN}. Canceled-or-zero outcomes are ${sumHighStatus('production', 'left', 'local', 'canceled-or-zero')}/${sumHighStatus('dtFeedback', 'left', 'local', 'canceled-or-zero')} for production local turn and ${sumHighStatus('production', 'right', 'local', 'canceled-or-zero')}/${sumHighStatus('dtFeedback', 'right', 'local', 'canceled-or-zero')} for dtFeedback. This supports the mechanism-level A1 finding that the production feedback term often reverses a natural local cue in this sampled stratum. It does not identify which direction is a correct route or make the independently grown origins matched comparisons.`, '',
    `The downstream body turn still differs from the local correction: production reaches the 4.5 rad/s turn cap in ${sumHigh('production', row => row.turnCap.left)}/${sumHigh('production', row => row.turnCap.denominator)} high-adherence production-origin observations and ${sumHigh('dtFeedback', row => row.turnCap.left)}/${sumHigh('dtFeedback', row => row.turnCap.denominator)} high-adherence dtFeedback-origin observations; the dtFeedback arm reaches it in ${sumHigh('production', row => row.turnCap.right)}/${sumHigh('production', row => row.turnCap.denominator)} and ${sumHigh('dtFeedback', row => row.turnCap.right)}/${sumHigh('dtFeedback', row => row.turnCap.denominator)}. Actual postcollision travel tangent-turn reversals are ${sumHighStatus('production', 'left', 'travel', 'reversed')}/${highProductionCueN} vs ${sumHighStatus('production', 'right', 'travel', 'reversed')}/${highProductionCueN} in production-origin states and ${sumHighStatus('dtFeedback', 'left', 'travel', 'reversed')}/${highDtOriginCueN} vs ${sumHighStatus('dtFeedback', 'right', 'travel', 'reversed')}/${highDtOriginCueN} in dtFeedback-origin states. Tangent-turn sign is measured against the preceding segment; it is descriptive transfer, not route correctness.`, '',
    'A2 remains unidentified here. The P/dt/off arms share each captured raster by design. The six independently grown write streams establish exact history reconstruction, but do not compare field representations or make production and dtFeedback histories matched.', '',
    '## Entry adherence and ±2.2 rad/s clamp exposure', '',
    'Adherence strata use tick-entry adherence as frozen in PLAN.md; the local-cue and feedback expressions use the separately recorded updated adherence. The strict-clamp count is `abs(previousOmega) > 2.2 rad/s`; these are complete, causal-valid ant-by-frozen-state observations, not independent trials.', '',
    '| Seed | Natural origin | Ant-world observations | Mean entry → updated adherence | Updated changed | `abs(previousOmega) > 2.2` | High-entry-adherence n | High adherence with clamp |',
    '|---:|---|---:|---:|---:|---:|---:|---:|');
  for (const originPolicy of ['production', 'dtFeedback']) {
    for (const seed of [20261005, 20261006, 20261007]) {
      const ants = analysis.captureResults.filter(result => result.originPolicy === originPolicy && result.seed === seed)
        .flatMap(result => result.ants).filter(ant => ant.completeThreeArm && ant.captureCausalEligible);
      const meanEntry = ants.reduce((sum, ant) => sum + ant.modes.production.entry.entryAdherence, 0) / ants.length;
      const meanUpdated = ants.reduce((sum, ant) => sum + ant.modes.production.local.updatedAdherence, 0) / ants.length;
      const clamped = ant => Math.abs(ant.modes.production.local.previousOmega) > 2.2;
      const high = ants.filter(ant => ant.strata.adherence === 'high');
      lines.push(`| ${seed} | ${originPolicy} | ${ants.length} | ${fmt(meanEntry)} → ${fmt(meanUpdated)} | ${ants.filter(ant => Math.abs(ant.modes.production.local.updatedAdherence - ant.modes.production.entry.entryAdherence) > 1e-12).length}/${ants.length} | ${ants.filter(clamped).length}/${ants.length} | ${high.length} | ${high.filter(clamped).length}/${high.length} |`);
    }
  }
  lines.push('', '### Clamp exposure by entry-adherence band', '',
    'Pooled over the three seeds; denominators are complete, causal-valid ant-world observations. Each band is the frozen tick-entry adherence value.', '',
    '| Natural origin | Low | Middle | High | All |',
    '|---|---:|---:|---:|---:|');
  for (const originPolicy of ['production', 'dtFeedback']) {
    const ants = entrySummary(originPolicy);
    const cell = subset => `${subset.filter(ant => Math.abs(ant.modes.production.local.previousOmega) > 2.2).length}/${subset.length}`;
    const bins = ['low', 'middle', 'high'].map(bin => ants.filter(ant => ant.strata.adherence === bin));
    lines.push(`| ${originPolicy} | ${cell(bins[0])} | ${cell(bins[1])} | ${cell(bins[2])} | ${cell(ants)} |`);
  }
  lines.push('', '### dtFeedback vs dampingOff: realized body turn and actual travel angle', '',
    'The pooled table counts paired differences above `1e-9 rad` in absolute magnitude, the frozen numerical-zero tolerance. Ranges include all cue-eligible observations, including exact zeros. This measures the fixed-state arm contrast; it does not test the audit-proposed unclipped angular-displacement candidate.', '',
    '| Natural origin | Entry stratum | Cue-eligible n | Body-turn Δ nonzero / n (rad) | Actual travel-angle Δ nonzero / n (rad) | Collision-scale Δ nonzero / n |',
    '|---|---|---:|---|---|---:|');
  for (const originPolicy of ['production', 'dtFeedback']) {
    for (const entryStratum of ['all', 'high']) {
      const pairs = analysis.captureResults.filter(result => result.originPolicy === originPolicy)
        .flatMap(result => result.pairs).filter(pair => pair.leftMode === 'dtFeedback'
          && pair.rightMode === 'dampingOff' && pair.causalEligible && pair.cueEligible
          && (entryStratum === 'all' || pair.strata.adherence === 'high'));
      const deltas = key => pairs.map(pair => pair.delta[key]).filter(finite);
      const body = deltas('bodyTurn');
      const travel = deltas('travelAngle');
      const collision = deltas('collisionScale');
      lines.push(`| ${originPolicy} | ${entryStratum === 'all' ? 'all' : 'high entry adherence'} | ${pairs.length} | ${body.filter(value => Math.abs(value) > ANGLE_EPSILON).length}/${pairs.length} (${fmtRange(range(body))}) | ${travel.filter(value => Math.abs(value) > ANGLE_EPSILON).length}/${pairs.length} (${fmtRange(range(travel))}) | ${collision.filter(value => Math.abs(value) > 1e-12).length}/${pairs.length} |`);
    }
  }
  lines.push('', 'Per-seed counts and ranges:', '',
    '| Seed | Natural origin | Entry stratum | Cue-eligible n | Body-turn Δ nonzero / n (rad) | Actual travel-angle Δ nonzero / n (rad) | Collision-scale Δ nonzero / n |',
    '|---:|---|---|---:|---|---|---:|');
  for (const originPolicy of ['production', 'dtFeedback']) {
    for (const seed of [20261005, 20261006, 20261007]) {
      for (const entryStratum of ['all', 'high']) {
        const pairs = analysis.captureResults.filter(result => result.originPolicy === originPolicy && result.seed === seed)
          .flatMap(result => result.pairs).filter(pair => pair.leftMode === 'dtFeedback'
            && pair.rightMode === 'dampingOff' && pair.causalEligible && pair.cueEligible
            && (entryStratum === 'all' || pair.strata.adherence === 'high'));
        const deltas = key => pairs.map(pair => pair.delta[key]).filter(finite);
        const body = deltas('bodyTurn');
        const travel = deltas('travelAngle');
        const collision = deltas('collisionScale');
        lines.push(`| ${seed} | ${originPolicy} | ${entryStratum === 'all' ? 'all' : 'high entry adherence'} | ${pairs.length} | ${body.filter(value => Math.abs(value) > ANGLE_EPSILON).length}/${pairs.length} (${fmtRange(range(body))}) | ${travel.filter(value => Math.abs(value) > ANGLE_EPSILON).length}/${pairs.length} (${fmtRange(range(travel))}) | ${collision.filter(value => Math.abs(value) > 1e-12).length}/${pairs.length} |`);
      }
    }
  }
  const exactlyAtLimit = productionClamp.exactlyAtLimit + dtFeedbackClamp.exactlyAtLimit;
  lines.push('', `Across complete, causal-valid ant-world observations, strict ±2.2 rad/s clamp exposure was ${productionClamp.clamped.length}/${productionClamp.ants.length} in production-origin histories (${productionClamp.highClamped.length}/${productionClamp.high.length} high-entry-adherence observations) and ${dtFeedbackClamp.clamped.length}/${dtFeedbackClamp.ants.length} in dtFeedback-origin histories (${dtFeedbackClamp.highClamped.length}/${dtFeedbackClamp.high.length} high-entry-adherence observations). ${exactlyAtLimit} samples were exactly at ±2.2. This shows that an unclipped-input contrast would change a frequently clamped input in production-origin states; the matrix does not measure its resulting turn response, so it remains a separate candidate test rather than a finding or selected law.`, '');
  lines.push('', '## Fixed representative traces', '', 'Selection was fixed independently of outcomes: for each origin, seed 20261005 at 30 seconds, then the numerically lowest ant ID with complete three-arm traces. Values below retain entry and updated adherence separately. Command error is defined as requested angular step (heading before turn to post-crowding target) minus realized body turn; wrapped angles use the signed shortest difference.', '');
  for (const originPolicy of ['production', 'dtFeedback']) {
    const capture = analysis.captureResults.find(result => result.originPolicy === originPolicy
      && result.seed === 20261005 && result.secondsCompleted === 30);
    const ant = capture?.ants.filter(row => row.completeThreeArm).sort((left, right) => compareIds(left.agentId, right.agentId))[0];
    lines.push(`### ${originPolicy} origin${ant ? `, ant ${ant.agentId}` : ''}`, '');
    if (!ant) {
      lines.push('No complete three-arm representative was available at the fixed selection point.', '');
      continue;
    }
    lines.push(`Replay gate valid: ${ant.captureCausalEligible}. Entry adherence: ${fmt(ant.modes.production.entry.entryAdherence)}; updated adherence: ${fmt(ant.modes.production.local.updatedAdherence)}; local coherence: ${fmt(ant.modes.production.entry.localTrail?.coherence)}; raw sensor steering: ${fmt(ant.modes.production.entry.localTrail?.steering)}. Prior observed one-second travel: ${JSON.stringify(ant.modes.production.strata.priorTravel)}.`, '',
      '| Arm | Cue u | Feedback v | u+v | Clamped local turn | Requested step | Command residual | Body turn | Omega after | Velocity angle before → after | Actual travel angle | Observed travel angle | Actual tangent turn | Observed tangent turn | Collision scale |',
      '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|');
    for (const mode of ARMS) {
      const arm = ant.modes[mode];
      lines.push(`| ${mode} | ${fmt(arm.local.rawLocalCueU)} | ${fmt(arm.local.feedbackContributionV)} | ${fmt(arm.local.unclampedLocalTurn)} | ${fmt(arm.local.clampedLocalTurn)} | ${fmt(arm.target.requestedTurnRad)} | ${fmt(arm.target.commandErrorRad)} | ${fmt(arm.body.turnRad)} | ${fmt(arm.body.omegaAfterRadPerSecond)} | ${fmt(arm.velocity.beforeAngle)} → ${fmt(arm.velocity.afterAngle)} | ${fmt(arm.travel.angle)} | ${fmt(arm.travel.observedAngle)} | ${fmt(arm.travel.deltaFromPriorSegment)} | ${fmt(arm.travel.observedDeltaFromPriorSegment)} | ${fmt(arm.travel.collisionScale)} |`);
    }
    lines.push('');
  }
  lines.push('## Reading limits', '',
    'Adherence and coherence bins, heading sectors, raster phases and authored crowd branches are descriptive engineering strata. A local cue reversal or same-tick travel difference does not establish a correct route, total pheromone contribution, or a field-representation winner. Body heading, velocity direction and postcollision travel remain separate observables. The reported chord displacement rate is per completed tick; the prior one-second chord rate is not actual path speed.', '');
  return `${lines.join('\n')}\n`;
}

function fmt(value) { return finite(value) ? value.toFixed(6) : '—'; }
function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
function fmtRange(value) { return value ? `${fmt(value.min)}…${fmt(value.max)}` : '—'; }

function analyzeCapture(capture) {
  const identity = {
    captureId: capture.captureId ?? null,
    seed: capture.seed ?? null,
    originPolicy: capture.originPolicy ?? null,
    secondsCompleted: capture.secondsCompleted ?? null,
    tick: capture.tick ?? null,
    simulationTimeMsBeforeTick: numberOrNull(capture.sampleTimeBeforeTickMs ?? capture.simulationTimeMsBeforeTick)
  };
  const traces = Object.fromEntries(ARMS.map(mode => [mode, replayTrace(capture, mode)]));
  const indexed = Object.fromEntries(ARMS.map(mode => [mode, indexTrace(traces[mode])]));
  const validation = validateCapture(capture, indexed);
  const antIds = [...new Set(ARMS.flatMap(mode => [...indexed[mode].byAgent.keys()]))].sort(compareIds);
  const history = summarizePreviousTravel(capture.previousSecondTravel ?? {});
  const ants = antIds.map(agentId => analyzeAnt(capture, identity, history, indexed, agentId, validation));
  const pairs = ants.flatMap(ant => ARM_PAIRS.map(([left, right]) => analyzePair(ant, left, right)));
  return { ...identity, validation, historySummary: history.summary, ants, pairs };
}

function replayTrace(capture, mode) {
  const trace = replayMode(capture, mode)?.trace;
  if (!Array.isArray(trace)) throw new TypeError(`Capture ${capture.captureId ?? '?'} lacks ${mode} replay trace.`);
  return trace;
}

function replayMode(capture, mode) { return capture.replay?.modes?.[mode] ?? capture.replays?.[mode] ?? null; }

function validPreviousTravelWindow(capture) {
  const window = capture.previousSecondTravel;
  if (!window || !Array.isArray(window.trace) || window.startTick !== capture.tick - 59
      || window.endTick !== capture.tick) return false;
  const ticks = new Set();
  const agentTicks = new Set();
  for (const [index, event] of window.trace.entries()) {
    const tick = numeric(event.tick);
    if (event.type !== 'displacement' || !Number.isInteger(tick)
        || tick < window.startTick || tick > window.endTick || !event.from || !event.to) return false;
    if (index > 0 && (event.sequence <= window.trace[index - 1].sequence
        || tick < numeric(window.trace[index - 1].tick))) return false;
    const pair = JSON.stringify([event.agentId, tick]);
    if (event.agentId === undefined || agentTicks.has(pair)) return false;
    agentTicks.add(pair);
    ticks.add(tick);
  }
  return ticks.size === 60;
}

function indexTrace(trace) {
  const byAgent = new Map();
  let collisionScales = new Map();
  for (const event of trace) {
    if (event.type === 'collision-scales') {
      collisionScales = new Map((event.displacements ?? []).map(item => [item.agentId, item.scale]));
    }
    if (event.agentId === undefined) continue;
    if (!byAgent.has(event.agentId)) byAgent.set(event.agentId, new Map());
    const rows = byAgent.get(event.agentId);
    if (!rows.has(event.type)) rows.set(event.type, []);
    rows.get(event.type).push(event);
  }
  for (const rows of byAgent.values()) {
    for (const events of rows.values()) events.sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
  }
  return { byAgent, collisionScales };
}

function validateCapture(capture, indexed) {
  const checks = {
    allArmsPresent: ARMS.every(mode => Array.isArray(replayMode(capture, mode)?.trace)),
    frozenInputHashPresent: typeof capture.frozenInputSha256 === 'string'
      && /^[0-9a-f]{64}$/i.test(capture.frozenInputSha256),
    preStateParity: true,
    preRngParity: true,
    senseParity: true,
    intentionParity: true,
    rngThroughIntentionParity: true,
    sourceFormulaParity: true,
    turnRateCapConformance: true,
    sourceReplayFlags: true,
    observedTravelParity: true,
    collisionScaleParity: true,
    timestepParity: Number.isFinite(capture.dtSeconds) && ARMS.every(mode => {
      const events = indexed[mode].byAgent;
      const checked = ['target-turn', 'target-turn-applied', 'accelerate-before', 'displacement'];
      return [...events.values()].every(rows => checked.every(type => {
        const event = first(rows, type);
        return event && near(numeric(event.dt), capture.dtSeconds);
      }));
    }),
    naturalStateParity: capture.validation?.naturalPlainInstrumentedStateExact === true
      && capture.validation?.naturalPlainInstrumentedRngExact === true
      && capture.validation?.naturalPlainInstrumentedPublicSnapshotEqual === true,
    fieldReconstruction: capture.validation?.reconstructedFieldExact === true
      && typeof capture.validation?.reconstructedFieldSha256 === 'string',
    sampleConvention: capture.validation?.sampleTickMatchesRequestedTime === true
      && Number.isFinite(capture.sampleTimeBeforeTickMs)
      && Math.abs(capture.sampleTimeBeforeTickMs - capture.secondsCompleted * 1000) <= 1e-5,
    previousTravelWindow: validPreviousTravelWindow(capture)
  };
  const inputHashes = ARMS.map(() => capture.frozenInputSha256 ?? null);
  checks.preStateParity = inputHashes.every(hash => hash === inputHashes[0]) && ARMS.every(mode => {
    const receipt = replayMode(capture, mode)?.validation;
    return receipt?.preStateExact === true && receipt?.sameFrozenInput === true
      && receipt?.frozenInputSha256 === capture.frozenInputSha256;
  });
  checks.preRngParity = allSame(ARMS.map(mode => replayMode(capture, mode)?.rngBeforeTick ?? null))
    && ARMS.every(mode => replayMode(capture, mode)?.validation?.preRngExact === true);

  const allAgentIds = new Set(ARMS.flatMap(mode => [...indexed[mode].byAgent.keys()]));
  for (const agentId of allAgentIds) {
    const events = Object.fromEntries(ARMS.map(mode => [mode, indexed[mode].byAgent.get(agentId)]));
    const entryRows = ARMS.map(mode => first(events[mode], 'intention-input'));
    if (!allPresent(entryRows)) {
      checks.senseParity = false;
      checks.rngThroughIntentionParity = false;
      continue;
    }
    const entryProjection = entryRows.map(event => ({
      agent: event.agent,
      entryAdherence: event.entryAdherence,
      localTrail: event.localTrail,
      rngCalls: event.rngCalls
    }));
    if (!allSame(entryProjection)) checks.senseParity = false;
    if (!allSame(entryRows.map(event => event.rngCalls))) checks.rngThroughIntentionParity = false;

    const localRows = ARMS.map(mode => first(events[mode], 'target-heading-base'));
    if (!allPresent(localRows) || !allSame(localRows.map(event => ({
      updatedAdherence: event.updatedAdherence,
      rawLocalCueU: event.rawLocalCueU,
      localTrail: event.localTrail
    })))) checks.senseParity = false;

    const choiceRows = ARMS.map(mode => ({
      noChoice: first(events[mode], 'intention-no-choice'),
      options: first(events[mode], 'wide-options'),
      chosen: first(events[mode], 'intention-chosen'),
      target: first(events[mode], 'target-turn')
    }));
    const updatedRows = ARMS.map(mode => first(events[mode], 'intention-updated'));
    if (!allPresent(updatedRows) || !allSame(updatedRows.map(event => ({
      updatedAdherence: event.updatedAdherence,
      trailConfidence: event.trailConfidence,
      decisionRemaining: event.decisionRemaining,
      committedRemaining: event.committedRemaining,
      inspectionRemaining: event.inspectionRemaining,
      hesitationRemaining: event.hesitationRemaining,
      wasBlocked: event.wasBlocked,
      rngCalls: event.rngCalls
    })))) checks.intentionParity = false;
    const choiceProjection = choiceRows.map(row => {
      const fresh = row.options !== null && row.chosen !== null;
      const held = row.noChoice !== null && row.options === null && row.chosen === null;
      if (!fresh && !held) checks.intentionParity = false;
      return {
        choiceStatus: fresh ? 'fresh' : held ? 'held' : 'incomplete',
        options: row.options ? {
          options: row.options.options,
          confidence: row.options.confidence,
          exploration: row.options.exploration,
          trailConfidence: row.options.trailConfidence,
          trailAdherence: row.options.trailAdherence,
          decisionRemaining: row.options.decisionRemaining,
          committedRemaining: row.options.committedRemaining,
          rngCallsBeforeChoice: row.options.rngCallsBeforeChoice
        } : null,
        chosen: row.chosen ? {
          chosenHeading: row.chosen.chosenHeading,
          chosenOffset: row.chosen.chosenOffset,
          chosenTrail: row.chosen.chosenTrail,
          chosenCrowding: row.chosen.chosenCrowding,
          chosenScore: row.chosen.chosenScore,
          decisionRemaining: row.chosen.decisionRemaining,
          committedRemaining: row.chosen.committedRemaining,
          intentHeading: row.chosen.intentHeading,
          rngCallsAfterChoice: row.chosen.rngCallsAfterChoice
        } : null,
        noChoice: row.noChoice ? {
          blocked: row.noChoice.blocked,
          newlyBlocked: row.noChoice.newlyBlocked,
          decisionRemaining: row.noChoice.decisionRemaining,
          committedRemaining: row.noChoice.committedRemaining,
          inspectionRemaining: row.noChoice.inspectionRemaining,
          hesitationRemaining: row.noChoice.hesitationRemaining,
          wasBlocked: row.noChoice.wasBlocked,
          rngCalls: row.noChoice.rngCalls
        } : null,
        intentHeading: row.target?.intentHeading,
        rngAfterIntention: row.chosen?.rngCallsAfterChoice ?? row.noChoice?.rngCalls ?? null
      };
    });
    if (!allSame(choiceProjection)) checks.intentionParity = false;
    if (choiceProjection.some(row => row.rngAfterIntention === null)
        || !allSame(choiceProjection.map(row => row.rngAfterIntention))) {
      checks.rngThroughIntentionParity = false;
    }
  }

  const receiptChecks = ARMS.map(mode => replayMode(capture, mode)?.validation ?? null);
  checks.sourceReplayFlags = receiptChecks.every(receipt => receipt
    && receipt.preStateExact === true
    && receipt.preRngExact === true
    && receipt.preTickPublicSnapshotEqual === true
    && receipt.instrumentedVsPlainPostStateExact === true
    && receipt.instrumentedVsPlainPostRngExact === true
    && receipt.instrumentedVsPlainPostSnapshotEqual === true
    && receipt.sameFrozenInput === true
    && receipt.frozenInputSha256 === capture.frozenInputSha256);
  if (ARMS.includes(capture.originPolicy)) {
    const originValidation = replayMode(capture, capture.originPolicy)?.validation;
    checks.sourceReplayFlags = checks.sourceReplayFlags
      && originValidation?.originArmPlainReplayEqual === true
      && originValidation?.originArmInstrumentedReplayEqual === true;
  }
  checks.preRngParity = checks.preRngParity && receiptChecks.every(receipt => receipt?.preRngExact === true);
  for (const mode of ARMS) {
    for (const [agentId, events] of indexed[mode].byAgent) {
      const target = first(events, 'target-turn');
      const applied = first(events, 'target-turn-applied');
      const local = first(events, 'target-heading-base');
      const entry = first(events, 'intention-input');
      if (!target || !applied) { checks.turnRateCapConformance = false; continue; }
      const bodyTurn = angleDelta(numeric(target.headingBeforeTurn), numeric(applied.headingAfterTurn));
      const cap = 4.5 * numeric(target.dt);
      if (!finite(bodyTurn) || !finite(cap) || Math.abs(bodyTurn) > cap + 1e-12) {
        checks.turnRateCapConformance = false;
      }
      if (!near(numeric(applied.currentOmega), bodyTurn / numeric(target.dt))) {
        checks.turnRateCapConformance = false;
      }
      if (!local || !entry) { checks.sourceFormulaParity = false; continue; }
      const displacement = first(events, 'displacement');
      const observedEnd = displacement?.observedTo ?? displacement?.to;
      const observedDistance = Math.hypot(numeric(observedEnd?.x) - numeric(displacement?.from?.x),
        numeric(observedEnd?.y) - numeric(displacement?.from?.y));
      if (!near(numeric(displacement?.travelled), observedDistance)) checks.observedTravelParity = false;
      if (!near(numeric(displacement?.scale), numeric(indexed[mode].collisionScales.get(agentId)))) {
        checks.collisionScaleParity = false;
      }
      const adherence = numeric(local.updatedAdherence);
      const steering = numeric(local.localTrail?.steering ?? entry.localTrail?.steering);
      const expectedCue = steering * (0.35 + 0.65 * adherence);
      const previousOmega = numeric(local.clampedPreviousOmega);
      const rawPreviousOmega = numeric(local.previousOmega);
      const expectedClampedOmega = Math.max(-2.2, Math.min(2.2, rawPreviousOmega));
      const baseFeedback = -0.65 * adherence * previousOmega;
      const dtFeedback = baseFeedback * numeric(target.dt);
      const expectedFeedback = mode === 'production' ? baseFeedback
        : mode === 'dtFeedback' ? dtFeedback : 0;
      const expectedUnclamped = expectedCue + expectedFeedback;
      const expectedClamped = Math.max(-0.45, Math.min(0.45, expectedUnclamped));
      if (![expectedCue, expectedFeedback, expectedUnclamped, expectedClamped].every(finite)
          || !near(numeric(local.rawLocalCueU), expectedCue)
          || !near(previousOmega, expectedClampedOmega)
          || !near(numeric(local.clampedLocalTurn), numeric(target.localTurn))
          || !near(numeric(local.feedbackContributionV), expectedFeedback)
          || !near(numeric(local.unclampedLocalTurn), expectedUnclamped)
          || !near(numeric(local.clampedLocalTurn), expectedClamped)) {
        checks.sourceFormulaParity = false;
      }
    }
  }
  const causalEligible = Object.values(checks).every(value => value === true);
  return { checks, causalEligible };
}

function analyzeAnt(capture, identity, history, indexed, agentId, captureValidation) {
  const modes = {};
  for (const mode of ARMS) modes[mode] = armMeasurement(capture, identity, history, indexed[mode], agentId);
  const completeThreeArm = ARMS.every(mode => modes[mode] !== null);
  return {
    ...identity,
    agentId,
    completeThreeArm,
    captureCausalEligible: captureValidation.causalEligible,
    strata: completeThreeArm ? modes.production.strata : null,
    modes,
    missingModes: ARMS.filter(mode => modes[mode] === null)
  };
}

function armMeasurement(capture, identity, history, index, agentId) {
  const events = index.byAgent.get(agentId);
  if (!events) return null;
  const entry = first(events, 'intention-input');
  const local = first(events, 'target-heading-base');
  const target = first(events, 'target-turn');
  const applied = first(events, 'target-turn-applied');
  const beforeAcceleration = first(events, 'accelerate-before');
  const afterAcceleration = first(events, 'accelerate-after');
  const displacement = first(events, 'displacement');
  if (!entry || !local || !target || !applied || !beforeAcceleration || !afterAcceleration || !displacement) return null;

  const position = entry.agent ?? {};
  const travelDx = numeric(displacement.to?.x) - numeric(displacement.from?.x);
  const travelDy = numeric(displacement.to?.y) - numeric(displacement.from?.y);
  const travelDistance = Math.hypot(travelDx, travelDy);
  const travelAngle = travelDistance > 0 ? Math.atan2(travelDy, travelDx) : null;
  const observedTo = displacement.observedTo ?? displacement.to;
  const observedDx = numeric(observedTo?.x) - numeric(displacement.from?.x);
  const observedDy = numeric(observedTo?.y) - numeric(displacement.from?.y);
  const observedTravelDistance = Math.hypot(observedDx, observedDy);
  const observedTravelAngle = observedTravelDistance > 0 ? Math.atan2(observedDy, observedDx) : null;
  const reportedTravelled = numeric(displacement.travelled);
  const bodyTurn = angleDelta(numeric(target.headingBeforeTurn), numeric(applied.headingAfterTurn));
  const previousHistory = history.byAgent.get(agentId) ?? null;
  const previousActualSegmentAngle = previousHistory?.actual.lastTravelAngle ?? null;
  const previousObservedSegmentAngle = previousHistory?.observed.lastTravelAngle ?? null;
  const travelTurn = travelAngle === null || previousActualSegmentAngle === null
    ? null : angleDelta(previousActualSegmentAngle, travelAngle);
  const observedTravelTurn = observedTravelAngle === null || previousObservedSegmentAngle === null
    ? null : angleDelta(previousObservedSegmentAngle, observedTravelAngle);
  const preVelocityX = numeric(beforeAcceleration.vx);
  const preVelocityY = numeric(beforeAcceleration.vy);
  const preVelocitySpeed = Math.hypot(preVelocityX, preVelocityY);
  const preVelocityAngle = preVelocitySpeed > 0 ? Math.atan2(preVelocityY, preVelocityX) : null;
  const updatedAdherence = numeric(local.updatedAdherence);
  const entryAdherence = numeric(entry.entryAdherence);
  const coherence = numeric(entry.localTrail?.coherence);
  const heading = numeric(position.heading);
  const x = numeric(position.x);
  const y = numeric(position.y);
  const frontCrowding = numeric(target.occupancy?.frontCrowding);
  const separationMagnitude = Math.hypot(numeric(target.occupancy?.separationX), numeric(target.occupancy?.separationY));
  const phaseX = finite(x) ? fractional(95 * x) : null;
  const phaseY = finite(y) ? fractional(95 * y) : null;
  const phaseBin = phaseX === null || phaseY === null ? null : `x${phaseX < 0.5 ? 'low' : 'high'}-y${phaseY < 0.5 ? 'low' : 'high'}`;
  const actualOmega = numeric(applied.currentOmega);
  const choiceStatus = first(events, 'wide-options') || first(events, 'intention-chosen')
    ? 'fresh' : first(events, 'intention-no-choice') ? 'held-no-fresh-choice' : 'unrecorded';
  const travelDuration = numeric(displacement.dt);
  return {
    entry: {
      x: nullable(x), y: nullable(y), heading: nullable(heading), entryAdherence: nullable(entryAdherence),
      localTrail: entry.localTrail ?? null,
      rasterPhase: phaseX === null || phaseY === null ? null : { x: phaseX, y: phaseY, bin: phaseBin },
      entryRngCalls: numeric(entry.rngCalls),
      rngCallsAfterIntention: numeric(first(events, 'intention-chosen')?.rngCallsAfterChoice
        ?? first(events, 'intention-no-choice')?.rngCalls)
    },
    choice: {
      status: choiceStatus,
      options: first(events, 'wide-options')?.options ?? null,
      selected: first(events, 'intention-chosen') ? {
        heading: numeric(first(events, 'intention-chosen').chosenHeading),
        offset: numeric(first(events, 'intention-chosen').chosenOffset),
        score: numeric(first(events, 'intention-chosen').chosenScore)
      } : null,
      intentHeading: numeric(target.intentHeading)
    },
    local: {
      updatedAdherence: nullable(updatedAdherence),
      rawLocalCueU: numeric(local.rawLocalCueU),
      feedbackContributionV: numeric(local.feedbackContributionV),
      unclampedLocalTurn: numeric(local.unclampedLocalTurn),
      clampedLocalTurn: numeric(local.clampedLocalTurn),
      previousOmega: numeric(local.previousOmega),
      clampedPreviousOmega: numeric(local.clampedPreviousOmega),
      cueClass: signClass(numeric(local.rawLocalCueU), ANGLE_EPSILON),
      feedbackClass: signClass(numeric(local.feedbackContributionV), ANGLE_EPSILON)
    },
    target: {
      beforeCrowding: numeric(local.targetHeadingBeforeCrowding),
      afterCrowding: numeric(target.targetHeadingAfterCrowding),
      requestedTurnRad: angleDelta(numeric(target.headingBeforeTurn), numeric(target.targetHeadingAfterCrowding)),
      commandErrorRad: angleDelta(bodyTurn,
        angleDelta(numeric(target.headingBeforeTurn), numeric(target.targetHeadingAfterCrowding))),
      frontCrowding: nullable(frontCrowding),
      separationMagnitude,
      separationCrowdBranch: target.separationCrowdBranch === true,
      frontCrowdBranch: target.frontCrowdBranch === true,
      crowdStratum: crowdStratum(target)
    },
    body: {
      headingBefore: numeric(target.headingBeforeTurn),
      headingAfter: numeric(applied.headingAfterTurn),
      turnRad: nullable(bodyTurn),
      omegaBeforeRadPerSecond: numeric(local.previousOmega),
      omegaAfterRadPerSecond: actualOmega,
      turnCapRad: 4.5 * numeric(target.dt),
      atTurnCap: finite(bodyTurn) && Math.abs(Math.abs(bodyTurn) - 4.5 * numeric(target.dt)) <= 1e-12
    },
    velocity: {
      beforeX: preVelocityX, beforeY: preVelocityY, beforeSpeed: preVelocitySpeed,
      beforeAngle: nullable(preVelocityAngle),
      afterX: numeric(afterAcceleration.vx), afterY: numeric(afterAcceleration.vy),
      afterSpeed: Math.hypot(numeric(afterAcceleration.vx), numeric(afterAcceleration.vy)),
      afterAngle: Math.atan2(numeric(afterAcceleration.vy), numeric(afterAcceleration.vx))
    },
    travel: {
      from: displacement.from, to: displacement.to, observedTo,
      dx: travelDx, dy: travelDy, distance: travelDistance, durationSeconds: travelDuration,
      angle: nullable(travelAngle), collisionScale: nullable(numeric(displacement.scale ?? index.collisionScales.get(agentId))),
      observedDx, observedDy, observedDistance: observedTravelDistance,
      observedAngle: nullable(observedTravelAngle), reportedTravelled,
      travelledMatchesObservedDistance: near(reportedTravelled, observedTravelDistance),
      deltaFromPriorSegment: nullable(travelTurn), previousSegmentAngle: nullable(previousActualSegmentAngle),
      observedDeltaFromPriorSegment: nullable(observedTravelTurn),
      previousObservedSegmentAngle: nullable(previousObservedSegmentAngle),
      deltaFromPreVelocity: travelAngle === null || preVelocityAngle === null ? null : angleDelta(preVelocityAngle, travelAngle),
      observedDeltaFromPreVelocity: observedTravelAngle === null || preVelocityAngle === null
        ? null : angleDelta(preVelocityAngle, observedTravelAngle),
      bodyHeadingToTravel: travelAngle === null ? null : angleDelta(numeric(applied.headingAfterTurn), travelAngle),
      bodyHeadingToObservedTravel: observedTravelAngle === null ? null
        : angleDelta(numeric(applied.headingAfterTurn), observedTravelAngle),
      travelTurnMinusBodyTurnRad: finite(travelTurn) && finite(bodyTurn) ? angleDelta(bodyTurn, travelTurn) : null,
      observedTravelTurnMinusBodyTurnRad: finite(observedTravelTurn) && finite(bodyTurn)
        ? angleDelta(bodyTurn, observedTravelTurn) : null,
      chordDisplacementRate: finite(travelDistance) && finite(travelDuration) && travelDuration > 0
        ? travelDistance / travelDuration : null,
      observedChordDisplacementRate: finite(observedTravelDistance) && finite(travelDuration) && travelDuration > 0
        ? observedTravelDistance / travelDuration : null,
      exiting: displacement.exiting === true
    },
    strata: {
      adherence: adherenceBin(entryAdherence),
      coherence: coherenceBin(coherence),
      omega: omegaBin(numeric(local.previousOmega)),
      headingSector: headingSector(heading),
      rasterPhase: phaseBin,
      crowd: crowdStratum(target),
      priorTravel: previousHistory ? {
        completeOneSecond: previousHistory.completeOneSecond,
        exactTickCoverage: previousHistory.exactTickCoverage,
        actual: previousHistory.actual,
        observed: previousHistory.observed
      } : null
    }
  };
}

function analyzePair(ant, leftMode, rightMode) {
  const left = ant.modes[leftMode];
  const right = ant.modes[rightMode];
  const firstDivergence = left && right ? firstDivergenceBetween(left, right) : null;
  const cue = left?.local.rawLocalCueU;
  const cueEligible = finite(cue) && Math.abs(cue) > ANGLE_EPSILON;
  const feedback = left?.local.feedbackContributionV;
  const feedbackOpposes = cueEligible && finite(feedback) && Math.sign(feedback) === -Math.sign(cue);
  const rightFeedbackOpposes = cueEligible && finite(right?.local.feedbackContributionV)
    && Math.sign(right.local.feedbackContributionV) === -Math.sign(cue);
  const leftStatus = cueEligible ? transferStatus(cue, left) : null;
  const rightStatus = cueEligible ? transferStatus(cue, right) : null;
  return {
    captureId: ant.captureId, seed: ant.seed, originPolicy: ant.originPolicy,
    secondsCompleted: ant.secondsCompleted, tick: ant.tick, agentId: ant.agentId,
    leftMode, rightMode, causalEligible: ant.captureCausalEligible && left !== null && right !== null,
    firstDivergence,
    cueEligible,
    eligibleDenominators: {
      localCue: cueEligible ? 1 : 0,
      bodyTurn: cueEligible && finite(left.body.turnRad) && finite(right.body.turnRad) ? 1 : 0,
      travelTurn: cueEligible && finite(left.travel.deltaFromPriorSegment) && finite(right.travel.deltaFromPriorSegment) ? 1 : 0,
      observedTravelTurn: cueEligible && finite(left.travel.observedDeltaFromPriorSegment)
        && finite(right.travel.observedDeltaFromPriorSegment) ? 1 : 0
    },
    cue: nullable(cue),
    leftFeedback: nullable(left?.local.feedbackContributionV),
    rightFeedback: nullable(right?.local.feedbackContributionV),
    leftLocalTurn: nullable(left?.local.clampedLocalTurn),
    rightLocalTurn: nullable(right?.local.clampedLocalTurn),
    leftRequestedTurn: nullable(left?.target.requestedTurnRad),
    rightRequestedTurn: nullable(right?.target.requestedTurnRad),
    leftCommandError: nullable(left?.target.commandErrorRad),
    rightCommandError: nullable(right?.target.commandErrorRad),
    leftBodyTurn: nullable(left?.body.turnRad),
    rightBodyTurn: nullable(right?.body.turnRad),
    leftAtTurnCap: left?.body.atTurnCap ?? false,
    rightAtTurnCap: right?.body.atTurnCap ?? false,
    leftTravelAngle: nullable(left?.travel.angle),
    rightTravelAngle: nullable(right?.travel.angle),
    leftObservedTravelAngle: nullable(left?.travel.observedAngle),
    rightObservedTravelAngle: nullable(right?.travel.observedAngle),
    leftTravelTurn: nullable(left?.travel.deltaFromPriorSegment),
    rightTravelTurn: nullable(right?.travel.deltaFromPriorSegment),
    leftObservedTravelTurn: nullable(left?.travel.observedDeltaFromPriorSegment),
    rightObservedTravelTurn: nullable(right?.travel.observedDeltaFromPriorSegment),
    leftCollisionScale: nullable(left?.travel.collisionScale),
    rightCollisionScale: nullable(right?.travel.collisionScale),
    feedbackOpposesCue: feedbackOpposes,
    rightFeedbackOpposesCue: rightFeedbackOpposes,
    leftTransfer: leftStatus, rightTransfer: rightStatus,
    delta: {
      localTurn: angleDifference(left?.local.clampedLocalTurn, right?.local.clampedLocalTurn),
      requestedTurn: angleDifference(left?.target.requestedTurnRad, right?.target.requestedTurnRad),
      commandError: angleDifference(left?.target.commandErrorRad, right?.target.commandErrorRad),
      bodyTurn: angleDifference(left?.body.turnRad, right?.body.turnRad),
      travelAngle: angleDifference(left?.travel.angle, right?.travel.angle),
      travelTurn: angleDifference(left?.travel.deltaFromPriorSegment, right?.travel.deltaFromPriorSegment),
      observedTravelAngle: angleDifference(left?.travel.observedAngle, right?.travel.observedAngle),
      observedTravelTurn: angleDifference(left?.travel.observedDeltaFromPriorSegment,
        right?.travel.observedDeltaFromPriorSegment),
      collisionScale: numericDifference(left?.travel.collisionScale, right?.travel.collisionScale)
    },
    strata: ant.strata
  };
}

function transferStatus(cue, arm) {
  if (!arm) return null;
  const localTurn = arm.local.clampedLocalTurn;
  const bodyTurn = arm.body.turnRad;
  const travelTurn = arm.travel.deltaFromPriorSegment;
  const observedTravelTurn = arm.travel.observedDeltaFromPriorSegment;
  return {
    local: directionStatus(cue, localTurn),
    body: directionStatus(cue, bodyTurn),
    travel: directionStatus(cue, travelTurn),
    observedTravel: directionStatus(cue, observedTravelTurn)
  };
}

function directionStatus(cue, value) {
  if (!finite(value)) return { eligible: false, status: 'unavailable', amplitude: null };
  const sign = signClass(value, ANGLE_EPSILON);
  const cueSign = Math.sign(cue);
  return {
    eligible: true,
    status: sign === 0 ? 'canceled-or-zero' : sign === cueSign ? 'same-sign-survives' : 'reversed',
    attenuated: Math.abs(value) + ANGLE_EPSILON < Math.abs(cue),
    amplitude: value
  };
}

function firstDivergenceBetween(left, right) {
  const stages = [
    ['sense', [left.entry.localTrail, left.entry.entryAdherence, left.entry.entryRngCalls],
      [right.entry.localTrail, right.entry.entryAdherence, right.entry.entryRngCalls]],
    ['choice', [left.choice.status, left.choice.options, left.choice.selected, left.choice.intentHeading,
      left.entry.rngCallsAfterIntention], [right.choice.status, right.choice.options, right.choice.selected,
      right.choice.intentHeading, right.entry.rngCallsAfterIntention]],
    ['localTurn', [left.local.rawLocalCueU, left.local.feedbackContributionV, left.local.unclampedLocalTurn,
      left.local.clampedLocalTurn], [right.local.rawLocalCueU, right.local.feedbackContributionV,
      right.local.unclampedLocalTurn, right.local.clampedLocalTurn]],
    ['target', [left.target.beforeCrowding, left.target.afterCrowding],
      [right.target.beforeCrowding, right.target.afterCrowding]],
    ['omega', [left.body.turnRad, left.body.omegaAfterRadPerSecond],
      [right.body.turnRad, right.body.omegaAfterRadPerSecond]],
    ['travel', [left.velocity.afterX, left.velocity.afterY, left.travel.from, left.travel.to,
      left.travel.collisionScale, left.travel.angle, left.travel.observedAngle],
      [right.velocity.afterX, right.velocity.afterY, right.travel.from, right.travel.to,
        right.travel.collisionScale, right.travel.angle, right.travel.observedAngle]]
  ];
  for (const [stage, leftValues, rightValues] of stages) {
    if (!same(leftValues, rightValues)) return stage;
  }
  return 'none';
}

function summarizePairs(rows) {
  const dimensions = ['all', 'adherence', 'coherence', 'omega', 'headingSector', 'rasterPhase', 'crowd'];
  const groups = new Map();
  for (const row of rows) {
    for (const dimension of dimensions) {
      const value = dimension === 'all' ? 'all' : row.strata?.[dimension] ?? 'missing';
      const key = JSON.stringify([row.seed, row.originPolicy, row.leftMode, row.rightMode, dimension, value]);
      if (!groups.has(key)) groups.set(key, { seed: row.seed, originPolicy: row.originPolicy,
        leftMode: row.leftMode, rightMode: row.rightMode, stratumDimension: dimension,
        stratumValue: value, observations: [] });
      groups.get(key).observations.push(row);
    }
  }
  const summaries = [...groups.values()].map(group => {
    const observations = group.observations;
    const causalObservations = observations.filter(row => row.causalEligible);
    const eligible = causalObservations.filter(row => row.cueEligible);
    const allCueEligible = observations.filter(row => row.cueEligible);
    const count = predicate => eligible.filter(predicate).length;
    const vals = key => eligible.map(row => row[key]).filter(finite);
    const deltas = key => eligible.map(row => row.delta[key]).filter(finite);
    const transferCounts = stage => Object.fromEntries(['canceled-or-zero', 'reversed', 'same-sign-survives']
      .map(status => [status, count(row => row.leftTransfer?.[stage].status === status)]));
    return {
      seed: group.seed, originPolicy: group.originPolicy, leftMode: group.leftMode, rightMode: group.rightMode,
      stratumDimension: group.stratumDimension, stratumValue: group.stratumValue,
      antWorldObservations: observations.length,
      frozenWorldStates: new Set(observations.map(row => row.captureId)).size,
      sampleSeconds: [...new Set(observations.map(row => row.secondsCompleted))].filter(Number.isFinite).sort((a, b) => a - b),
      causalEligibleObservations: causalObservations.length,
      invalidReplayObservations: observations.length - causalObservations.length,
      allReplayCueEligible: allCueEligible.length,
      localCueEligible: eligible.length,
      feedbackOpposesCue: count(row => row.feedbackOpposesCue === true),
      rightFeedbackOpposesCue: count(row => row.rightFeedbackOpposesCue === true),
      transferCounts: {
        leftLocal: transferCounts('local'), rightLocal: Object.fromEntries(['canceled-or-zero', 'reversed', 'same-sign-survives']
          .map(status => [status, count(row => row.rightTransfer?.local.status === status)])),
        leftBody: transferCounts('body'), rightBody: Object.fromEntries(['canceled-or-zero', 'reversed', 'same-sign-survives']
          .map(status => [status, count(row => row.rightTransfer?.body.status === status)])),
        leftTravel: transferCounts('travel'), rightTravel: Object.fromEntries(['canceled-or-zero', 'reversed', 'same-sign-survives']
          .map(status => [status, count(row => row.rightTransfer?.travel.status === status)])),
        leftObservedTravel: transferCounts('observedTravel'),
        rightObservedTravel: Object.fromEntries(['canceled-or-zero', 'reversed', 'same-sign-survives']
          .map(status => [status, count(row => row.rightTransfer?.observedTravel.status === status)]))
      },
      cueOpposedFeedbackDenominator: eligible.length,
      turnCap: {
        left: causalObservations.filter(row => row.leftAtTurnCap === true).length,
        right: causalObservations.filter(row => row.rightAtTurnCap === true).length,
        denominator: causalObservations.length,
        cueEligibleDenominator: eligible.length
      },
      firstDivergence: Object.fromEntries(['sense', 'choice', 'localTurn', 'target', 'omega', 'travel', 'none']
        .map(stage => [stage, causalObservations.filter(row => row.firstDivergence === stage).length])),
      firstDivergenceObservedIncludingInvalid: Object.fromEntries(['sense', 'choice', 'localTurn', 'target', 'omega', 'travel', 'none']
        .map(stage => [stage, observations.filter(row => row.firstDivergence === stage).length])),
      signedRangesRad: {
        cue: range(vals('cue')),
        leftFeedback: range(vals('leftFeedback')),
        rightFeedback: range(vals('rightFeedback')),
        leftLocalTurn: range(vals('leftLocalTurn')),
        rightLocalTurn: range(vals('rightLocalTurn')),
        localTurnDelta: range(deltas('localTurn')),
        requestedTurnDelta: range(deltas('requestedTurn')),
        commandErrorDelta: range(deltas('commandError')),
        bodyTurnDelta: range(deltas('bodyTurn')),
        travelAngleDelta: range(deltas('travelAngle')),
        travelTurnDelta: range(deltas('travelTurn')),
        observedTravelAngleDelta: range(deltas('observedTravelAngle')),
        observedTravelTurnDelta: range(deltas('observedTravelTurn'))
      },
      collisionScaleDeltaRange: range(deltas('collisionScale')),
      cueEligibleDenominators: {
        localTurn: eligible.length,
        bodyTurn: eligible.filter(row => row.eligibleDenominators.bodyTurn === 1).length,
        travelTurn: eligible.filter(row => row.eligibleDenominators.travelTurn === 1).length,
        observedTravelTurn: eligible.filter(row => row.eligibleDenominators.observedTravelTurn === 1).length
      },
      note: 'Counts are ant-by-frozen-world observations; repeated ants and captures are dependent.'
    };
  });
  const expectedValues = {
    all: ['all'],
    adherence: ['low', 'middle', 'high', 'missing'],
    coherence: ['low', 'middle', 'high', 'missing'],
    omega: ['negative', 'near-zero', 'positive', 'missing'],
    headingSector: [0, 1, 2, 3, 4, 5, 6, 7, 'missing'],
    rasterPhase: ['xlow-ylow', 'xlow-yhigh', 'xhigh-ylow', 'xhigh-yhigh', 'missing'],
    crowd: ['neither', 'separation', 'front', 'separation+front', 'missing']
  };
  const contexts = new Map();
  for (const row of rows) {
    const context = { seed: row.seed, originPolicy: row.originPolicy,
      leftMode: row.leftMode, rightMode: row.rightMode };
    contexts.set(JSON.stringify(context), context);
  }
  const summaryKeys = new Set(summaries.map(summary => JSON.stringify([summary.seed, summary.originPolicy,
    summary.leftMode, summary.rightMode, summary.stratumDimension, summary.stratumValue])));
  for (const context of contexts.values()) {
    for (const [dimension, values] of Object.entries(expectedValues)) {
      for (const value of values) {
        const key = JSON.stringify([context.seed, context.originPolicy, context.leftMode,
          context.rightMode, dimension, value]);
        if (summaryKeys.has(key)) continue;
        summaries.push(emptySummary(context, dimension, value));
      }
    }
  }
  return summaries.sort((left, right) => compareIds(left.seed, right.seed)
    || compareIds(left.originPolicy, right.originPolicy)
    || compareIds(left.leftMode, right.leftMode) || compareIds(left.rightMode, right.rightMode)
    || compareIds(left.stratumDimension, right.stratumDimension)
    || compareIds(left.stratumValue, right.stratumValue));
}

function emptySummary(context, stratumDimension, stratumValue) {
  const statuses = { 'canceled-or-zero': 0, reversed: 0, 'same-sign-survives': 0 };
  const divergence = Object.fromEntries(['sense', 'choice', 'localTurn', 'target', 'omega', 'travel', 'none']
    .map(stage => [stage, 0]));
  const emptyRanges = Object.fromEntries(['cue', 'leftFeedback', 'rightFeedback', 'leftLocalTurn',
    'rightLocalTurn', 'localTurnDelta', 'requestedTurnDelta', 'commandErrorDelta', 'bodyTurnDelta',
    'travelAngleDelta', 'travelTurnDelta', 'observedTravelAngleDelta', 'observedTravelTurnDelta'].map(key => [key, null]));
  return {
    ...context, stratumDimension, stratumValue,
    antWorldObservations: 0, frozenWorldStates: 0, sampleSeconds: [], causalEligibleObservations: 0,
    invalidReplayObservations: 0, allReplayCueEligible: 0, localCueEligible: 0,
    feedbackOpposesCue: 0, rightFeedbackOpposesCue: 0,
    transferCounts: {
      leftLocal: { ...statuses }, rightLocal: { ...statuses },
      leftBody: { ...statuses }, rightBody: { ...statuses },
      leftTravel: { ...statuses }, rightTravel: { ...statuses },
      leftObservedTravel: { ...statuses }, rightObservedTravel: { ...statuses }
    },
    cueOpposedFeedbackDenominator: 0, turnCap: { left: 0, right: 0, denominator: 0, cueEligibleDenominator: 0 },
    firstDivergence: { ...divergence }, firstDivergenceObservedIncludingInvalid: { ...divergence },
    signedRangesRad: emptyRanges, collisionScaleDeltaRange: null,
    cueEligibleDenominators: { localTurn: 0, bodyTurn: 0, travelTurn: 0, observedTravelTurn: 0 },
    note: 'No observations fell in this declared marginal stratum; this zero row is not an independent sample.'
  };
}

function summarizePreviousTravel(window) {
  const trace = Array.isArray(window) ? window : window.trace ?? [];
  const byAgentEvents = new Map();
  for (const event of trace) {
    if (event.type !== 'displacement' || event.agentId === undefined) continue;
    if (!byAgentEvents.has(event.agentId)) byAgentEvents.set(event.agentId, []);
    byAgentEvents.get(event.agentId).push(event);
  }
  const byAgent = new Map();
  for (const [agentId, events] of byAgentEvents) {
    const usable = events.filter(event => event.from && event.to)
      .sort((left, right) => (left.tick ?? left.sequence ?? 0) - (right.tick ?? right.sequence ?? 0));
    const ticks = usable.map(event => numeric(event.tick));
    const exactTickCoverage = ticks.length === usable.length && ticks.every(finite)
      && ticks.every((tick, index) => index === 0 || tick === ticks[index - 1] + 1)
      && ticks[0] === numeric(window.startTick) && ticks.at(-1) === numeric(window.endTick);
    const duration = usable.reduce((sum, event) => sum + numeric(event.dt), 0);
    const completeOneSecond = usable.length === 60 && Math.abs(duration - 1) <= 1e-9 && exactTickCoverage;
    const actual = summarizeTravelPath(usable, event => event.to, duration);
    const observed = summarizeTravelPath(usable, event => event.observedTo ?? event.to, duration);
    byAgent.set(agentId, {
      antId: agentId, segmentCount: usable.length, completeOneSecond, exactTickCoverage,
      actual, observed,
      durationSeconds: duration
    });
  }
  return { byAgent, summary: { antsWithPriorTravel: byAgent.size,
    completeOneSecondTravel: [...byAgent.values()].filter(row => row.completeOneSecond).length } };
}

function summarizeTravelPath(events, endpointFor, duration) {
  const points = events.map(event => ({ x: numeric(event.from.x), y: numeric(event.from.y) }));
  if (events.length) {
    const final = endpointFor(events.at(-1));
    points.push({ x: numeric(final.x), y: numeric(final.y) });
  }
  const lengths = events.map(event => {
    const to = endpointFor(event);
    return Math.hypot(numeric(to.x) - numeric(event.from.x), numeric(to.y) - numeric(event.from.y));
  });
  const segmentAngles = events.map((event, index) => {
    if (!(lengths[index] > 0)) return null;
    const to = endpointFor(event);
    return Math.atan2(numeric(to.y) - numeric(event.from.y), numeric(to.x) - numeric(event.from.x));
  });
  const turns = [];
  for (let index = 1; index < segmentAngles.length; index += 1) {
    if (segmentAngles[index - 1] === null || segmentAngles[index] === null) continue;
    turns.push({ fromSegment: index - 1, toSegment: index,
      value: angleDelta(segmentAngles[index - 1], segmentAngles[index]) });
  }
  const signedTurnRad = turns.reduce((sum, turn) => sum + turn.value, 0);
  const absoluteTurnRad = turns.reduce((sum, turn) => sum + Math.abs(turn.value), 0);
  const adjacentPairs = [];
  for (let index = 1; index < turns.length; index += 1) {
    if (turns[index - 1].toSegment === turns[index].fromSegment) {
      adjacentPairs.push(Math.sign(turns[index - 1].value) === Math.sign(turns[index].value));
    }
  }
  const pathLength = lengths.reduce((sum, value) => sum + value, 0);
  const chordLength = points.length > 1
    ? Math.hypot(points.at(-1).x - points[0].x, points.at(-1).y - points[0].y) : null;
  return {
    lastTravelAngle: segmentAngles.at(-1) ?? null,
    signedTurnRad, absoluteTurnRad,
    adjacentTurnAgreement: adjacentPairs.length ? adjacentPairs.filter(Boolean).length / adjacentPairs.length : null,
    pathLength, chordLength,
    chordToPathRatio: pathLength > 0 ? chordLength / pathLength : null,
    chordDisplacementRate: duration > 0 ? chordLength / duration : null
  };
}

function first(events, type) { return events?.get(type)?.[0] ?? null; }
function allPresent(values) { return values.every(value => value !== null && value !== undefined); }
function allSame(values) { return values.length < 2 || values.slice(1).every(value => same(values[0], value)); }

function same(left, right) {
  return canonical(left) === canonical(right);
}

function canonical(value) {
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'number:NaN';
    if (value === Infinity) return 'number:Infinity';
    if (value === -Infinity) return 'number:-Infinity';
    if (Object.is(value, -0)) return 'number:-0';
    return `number:${value}`;
  }
  if (value === null || typeof value !== 'object') return `${typeof value}:${String(value)}`;
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${canonical(key)}:${canonical(value[key])}`).join(',')}}`;
}

function numeric(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value.$antNumber === 'string') {
    if (value.$antNumber === 'NaN') return NaN;
    if (value.$antNumber === 'Infinity') return Infinity;
    if (value.$antNumber === '-Infinity') return -Infinity;
    if (value.$antNumber === '-0') return -0;
  }
  return NaN;
}

function numberOrNull(value) { const decoded = numeric(value); return Number.isFinite(decoded) ? decoded : null; }
function nullable(value) { return Number.isFinite(value) ? value : null; }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function near(left, right, epsilon = 1e-12) { return finite(left) && finite(right) && Math.abs(left - right) <= epsilon; }
function angleDifference(left, right) { return finite(left) && finite(right) ? angleDelta(left, right) : null; }
function numericDifference(left, right) { return finite(left) && finite(right) ? left - right : null; }
function angleDelta(from, to) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); }
function signClass(value, epsilon = ANGLE_EPSILON) { return !finite(value) || Math.abs(value) <= epsilon ? 0 : Math.sign(value); }
function fractional(value) { return ((value % 1) + 1) % 1; }
function compareIds(left, right) { return String(left).localeCompare(String(right), 'en', { numeric: true }); }

function adherenceBin(value) {
  if (!finite(value) || value < 0 || value > 1) return null;
  return value < 0.3 ? 'low' : value < 0.7 ? 'middle' : 'high';
}
function coherenceBin(value) {
  if (!finite(value) || value < 0 || value > 1) return null;
  return value < 1 / 3 ? 'low' : value < 2 / 3 ? 'middle' : 'high';
}
function omegaBin(value) {
  if (!finite(value)) return null;
  return value < -OMEGA_DEADBAND ? 'negative' : value > OMEGA_DEADBAND ? 'positive' : 'near-zero';
}
function headingSector(value) {
  if (!finite(value)) return null;
  return Math.floor(fractional(value / TAU) * 8) % 8;
}
function crowdStratum(target) {
  const separation = target?.separationCrowdBranch === true;
  const front = target?.frontCrowdBranch === true;
  return separation && front ? 'separation+front' : separation ? 'separation' : front ? 'front' : 'neither';
}
function range(values) {
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadTransferAnalysis({ manifestPath: process.argv[2], outputDir: process.argv[3] })
    .then(({ analysis, outputs }) => {
      process.stdout.write(`verified ${analysis.integrity.stateFilesVerified} states / ${analysis.integrity.historyStreamsVerified} history streams; ${analysis.coverage.validFrozenWorldStates} causal-eligible states\n`);
      for (const [kind, target] of Object.entries(outputs)) process.stdout.write(`${kind}: ${target}\n`);
    })
    .catch(error => {
      process.stderr.write(`${error.stack || error}\n`);
      process.exitCode = 1;
    });
}

