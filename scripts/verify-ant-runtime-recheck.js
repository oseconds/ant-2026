import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

// Independent, read-only verifier for one completed natural Chrome capture.
// Usage: node scripts/verify-ant-runtime-recheck.js <capture-run-directory>
// It writes analysis.json only inside the explicitly supplied run directory.
const EXPECTED_HEAD = '51f576061991745858429749a034c9ea586ac318';
const EXPECTED_WORKLET_SHA256 = '166268f95706db8c5a462dc7cdfb32e981da821b5ad7a42b89414901f752c3a4';
const runDirArg = process.argv[2];
assert.ok(runDirArg, 'Pass the completed capture directory explicitly.');
const runDir = resolve(runDirArg);
const digest = value => createHash('sha256').update(value).digest('hex');
const readJson = async file => JSON.parse(await readFile(join(runDir, file), 'utf8'));
const readJsonLines = async file => (await readFile(join(runDir, file), 'utf8'))
  .split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const currentWorklet = await readFile(resolve('static/worklets/surface-plate.worklet.js'));
const baseWorklet = currentWorklet;
const baseWorkletHash = EXPECTED_WORKLET_SHA256;
const currentWorkletHash = digest(currentWorklet);
assert.equal(currentWorkletHash, baseWorkletHash, 'Current worklet differs from the requested starting HEAD.');
execFileSync('git', ['diff', '--quiet', EXPECTED_HEAD, 'HEAD', '--', 'src', 'static', 'tests']);
execFileSync('git', ['diff', '--quiet', EXPECTED_HEAD, '--', 'src', 'static', 'tests']);

const summary = await readJson('summary.json');
const capture = await readJson('capture-state.json');
const polls = await readJsonLines('polls.jsonl');
const diagnosticRecords = await readJsonLines('processor-diagnostics.jsonl');
const savedWindows = await readJsonLines('windows.jsonl');
assert.ok(polls.length >= 2, 'Capture has too few clock samples.');
assert.equal(summary.head, capture.head, 'Capture and summary starting HEAD must match.');
// Later evidence-only commits may have the same pinned production source.
execFileSync('git', ['diff', '--quiet', EXPECTED_HEAD, capture.head, '--', 'src', 'static']);
assert.equal(capture.originalWorkletSha256, baseWorkletHash, 'Capture source worklet hash mismatch.');
assert.equal(summary.originalWorkletSha256, baseWorkletHash, 'Summary source worklet hash mismatch.');
assert.equal(capture.servedTransform.workletOriginalSha256, baseWorkletHash, 'Served source worklet hash mismatch.');
assert.equal(capture.volume, 0.35, 'Expected 35% Volume.');
assert.equal(capture.start.mode, 'bornSurface', 'Expected natural bornSurface mode.');
assert.equal(capture.start.contextState, 'running', 'AudioContext was not running at capture start.');
assert.equal(summary.final.audioContextState, 'running', 'AudioContext was not running at capture end.');
assert.ok(polls.every(poll => poll.contextState === 'running'), 'AudioContext was not running for every recorded poll.');
const registrationAnchor = "registerProcessor('surface-plate-processor', SurfacePlateProcessor);";
const diagnosticExtension = capture.servedTransform.workletDiagnosticExtension;
assert.ok(diagnosticExtension, 'Capture has no recorded diagnostics extension.');
assert.equal(baseWorklet.toString('utf8').split(registrationAnchor).length - 1, 1,
  'Pinned worklet has an unexpected processor registration anchor.');
assert.ok(diagnosticExtension.includes('SurfacePlateProcessor.prototype.getDiagnostics')
  && diagnosticExtension.includes('runtimeLayerActivity'), 'Served extension is not diagnostics-only instrumentation.');
assert.notEqual(capture.servedTransform.workletServedSha256, baseWorkletHash,
  'Expected the browser-served worklet to contain the recorded diagnostics instrumentation.');
const reconstructedServedWorklet = baseWorklet.toString('utf8').replace(registrationAnchor,
  `${diagnosticExtension}${registrationAnchor}`);
assert.equal(digest(reconstructedServedWorklet), capture.servedTransform.workletServedSha256,
  'Served AudioWorklet differs beyond the recorded diagnostics extension.');

const dspText = baseWorklet.toString('utf8');
const dsp = {
  plateDampingMultiplier: Number(dspText.match(/PLATE_DAMPING_MULTIPLIER\s*=\s*([\d.]+)/)?.[1]),
  contactPulseSteps: Number(dspText.match(/CONTACT_PULSE_STEPS\s*=\s*Math\.round\(RATE\s*\*\s*([\d.]+)\)/)?.[1]) * 6000,
  contactRecoverySeconds: Number(dspText.match(/CONTACT_RECOVERY_STEPS\s*=\s*RATE\s*\*\s*([\d.]+)/)?.[1]),
  contactMaximumComplianceLoss: Number(dspText.match(/CONTACT_MAX_COMPLIANCE_LOSS\s*=\s*([\d.]+)/)?.[1]),
  sleepEnergyThreshold: Number(dspText.match(/SLEEP_ENERGY\s*=\s*([\deE+.-]+)/)?.[1]),
  sleepQuietSeconds: Number(dspText.match(/SLEEP_STEPS\s*=\s*RATE\s*\*\s*([\d.]+)/)?.[1]),
  limiterSourcePreserved: dspText.includes('this.outputL = mixL / (1 + Math.abs(mixL));')
    && dspText.includes('this.outputR = mixR / (1 + Math.abs(mixR));')
};
assert.equal(dsp.plateDampingMultiplier, 50);
assert.ok(Math.abs(dsp.contactPulseSteps - 18) < 1e-9);
assert.ok(Math.abs(dsp.contactRecoverySeconds - 0.075) < 1e-9);
assert.equal(dsp.contactMaximumComplianceLoss, 0.25);
assert.equal(dsp.sleepEnergyThreshold, 1e-10);
assert.equal(dsp.sleepQuietSeconds, 2);
assert.equal(dsp.limiterSourcePreserved, true);

function assertFiniteTree(value, path) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path} contains a non-finite value.`);
  else if (Array.isArray(value)) value.forEach((item, i) => assertFiniteTree(item, `${path}[${i}]`));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertFiniteTree(item, `${path}.${key}`);
  }
}
for (const [i, poll] of polls.entries()) assertFiniteTree(poll, `polls[${i}]`);
for (const [i, record] of diagnosticRecords.entries()) assertFiniteTree(record, `diagnostics[${i}]`);

const diagChecks = diagnosticRecords.map((record, index) => {
  const d = record.data?.payload;
  assert.ok(d && typeof d === 'object', `Diagnostic ${index} has no payload.`);
  assert.equal(d.dropped, 0, `Processor dropped count at diagnostic ${index}.`);
  assert.equal(d.droppedRoutes, 0, `Dropped route count at diagnostic ${index}.`);
  assert.equal(d.nonFinite, 0, `Non-finite count at diagnostic ${index}.`);
  assert.equal(d.contactPulseSteps, 18, `Pulse steps changed at diagnostic ${index}.`);
  assert.equal(d.contactPulseDurationMs, 3, `Pulse duration changed at diagnostic ${index}.`);
  assert.equal(d.contactRecoveryTimeMs, 75, `Contact recovery changed at diagnostic ${index}.`);
  assert.equal(d.contactMaximumComplianceLoss, 0.25, `Contact compliance changed at diagnostic ${index}.`);
  assert.equal(d.truncatedTailRiskThreshold, 1e-10, `Sleep energy threshold changed at diagnostic ${index}.`);
  assert.equal(d.quietStepsThreshold, 12000, `Sleep quiet-step threshold changed at diagnostic ${index}.`);
  const perLayer = d.runtimeLayerActivity;
  assert.ok(Array.isArray(perLayer), `Diagnostic ${index} lacks per-layer activity.`);
  const activeSum = perLayer.reduce((sum, layer) => sum + layer.activeNodes, 0);
  const nodeSum = perLayer.reduce((sum, layer) => sum + layer.totalNodes, 0);
  assert.equal(activeSum, d.activeNodes, `Per-layer active-node sum differs at diagnostic ${index}.`);
  assert.equal(nodeSum, d.runtimeTotalNodes, `Per-layer node sum differs at diagnostic ${index}.`);
  assert.equal(perLayer.length, d.layers, `Per-layer count differs at diagnostic ${index}.`);
  return { index, record, d, activeSum, nodeSum };
});

const nearestPoll = record => {
  let best = null, distance = Infinity;
  for (const poll of polls) {
    const candidate = Math.abs(poll.performanceMs - record.performanceMs);
    if (candidate < distance) { best = poll; distance = candidate; }
  }
  if (!best || best.topologyGeneration !== record.data.payload.topologyGeneration) return null;
  return { poll: best, ageMs: distance };
};
const matchedLayerSnapshots = diagChecks.map(({ record, d }) => {
  const match = nearestPoll(record);
  if (!match) return { diagnosticPerformanceMs: record.performanceMs, generation: d.topologyGeneration,
    matched: false, reason: 'No nearest main-thread poll with same topology generation.' };
  const histories = match.poll.plateHistory || [];
  const buried = histories.filter(item => item.exposedCellCount === 0 && item.buriedCellCount > 0);
  const partiallyBuried = histories.filter(item => item.exposedCellCount > 0 && item.buriedCellCount > 0);
  const byId = new Map((d.runtimeLayerActivity || []).map(item => [item.id, item]));
  const classify = item => ({ id: item.id, bornAtSimulationTimeMs: item.bornAtSimulationTimeMs,
    exposedCellCount: item.exposedCellCount, buriedCellCount: item.buriedCellCount,
    buriedLayerCount: item.buriedLayerCount ?? null,
    activeNodes: byId.get(item.id)?.activeNodes ?? null,
    totalNodes: byId.get(item.id)?.totalNodes ?? null,
    processorLayerPresent: byId.has(item.id) });
  const classified = buried.map(classify);
  const partialClassified = partiallyBuried.map(classify);
  return { diagnosticPerformanceMs: record.performanceMs, generation: d.topologyGeneration,
    matched: true, ageMs: match.ageMs, pollSimulationTimeMs: match.poll.simulationTimeMs,
    plateCount: match.poll.plates, buriedPlateCount: buried.length,
    fullyBuriedPlateIds: classified, fullyBuriedInactiveCount: classified.filter(item => item.activeNodes === 0).length,
    fullyBuriedActiveCount: classified.filter(item => item.activeNodes > 0).length,
    fullyBuriedUnmappedCount: classified.filter(item => item.activeNodes === null).length,
    partiallyBuriedPlateCount: partiallyBuried.length, partiallyBuriedPlateIds: partialClassified,
    partiallyBuriedInactiveCount: partialClassified.filter(item => item.activeNodes === 0).length,
    partiallyBuriedActiveCount: partialClassified.filter(item => item.activeNodes > 0).length,
    partiallyBuriedUnmappedCount: partialClassified.filter(item => item.activeNodes === null).length };
});

const recomputedWindows = savedWindows.map((window, index) => {
  const start = window.start, end = window.end;
  assert.ok(start && end && Number.isFinite(start.performanceMs) && Number.isFinite(end.performanceMs),
    `Window ${index} lacks sampled monotonic clock endpoints.`);
  const wallDelta = (end.performanceMs - start.performanceMs) / 1000;
  const simDelta = (end.simulationTimeMs - start.simulationTimeMs) / 1000;
  const audioDelta = end.audioTime === null || start.audioTime === null ? null : end.audioTime - start.audioTime;
  assert.ok(wallDelta >= 4.5 && wallDelta <= 10.5, `Window ${index} is outside the 5–10 s target: ${wallDelta}s.`);
  assert.ok(Math.abs(wallDelta - window.wallDelta) < 0.025, `Window ${index} saved wall delta mismatch.`);
  assert.ok(Math.abs(simDelta - window.simDelta) < 0.025, `Window ${index} saved simulation delta mismatch.`);
  if (audioDelta !== null) assert.ok(Math.abs(audioDelta - window.audioDelta) < 0.025, `Window ${index} saved audio delta mismatch.`);
  const diag = window.diagnosticsTiming?.latestReceived;
  const diagnosticAgeMs = diag ? end.performanceMs - diag.performanceMs : null;
  return { label: window.label, wallDelta, simDelta, audioDelta,
    simPerWall: simDelta / wallDelta, audioPerWall: audioDelta === null ? null : audioDelta / wallDelta,
    mainThreadTopology: { plates: window.start.plates, nodules: window.start.nodules,
      endPlates: end.plates, endNodules: end.nodules, totalNodes: end.totalNodes },
    processorTopology: window.processorTopology,
    processorDiagnosticReceivedAtPerformanceMs: diag?.performanceMs ?? null,
    processorDiagnosticAgeAtWindowEndMs: diagnosticAgeMs,
    processorDiagnosticWasRequestedAtWindowEnd: window.diagnosticsTiming?.pendingAtEndMs !== null
      && window.diagnosticsTiming?.pendingAtEndMs !== undefined,
    processorCountersAreAsynchronous: true,
    activeNodes: window.topology.activeNodes, awakeLayers: window.topology.awakeLayers,
    sleepingLayers: window.topology.sleepingLayers, droppedRoutes: window.processor?.droppedRoutes,
    nonFinite: window.processor?.nonFinite, preLimiterThresholdCrossings: window.processor?.clipped,
    maxOutputAbsBeforeLimiter: window.processor?.maxOutputAbs };
});

const firstPollAtPlateCount = target => polls.find(poll => poll.plates >= target) || null;
const milestoneData = [10, 20, 29, 30].map(target => {
  const poll = firstPollAtPlateCount(target);
  if (!poll) return { targetPlateCount: target, reached: false };
  const candidates = diagChecks.filter(({ record, d }) =>
    d.topologyGeneration === poll.topologyGeneration && Math.abs(record.performanceMs - poll.performanceMs) <= 10000);
  const nearest = candidates.sort((a, b) =>
    Math.abs(a.record.performanceMs - poll.performanceMs) - Math.abs(b.record.performanceMs - poll.performanceMs))[0];
  return { targetPlateCount: target, reached: true,
    mainThread: { performanceMs: poll.performanceMs, simulationTimeMs: poll.simulationTimeMs,
      audioTime: poll.audioTime, plates: poll.plates, nodules: poll.nodules, totalNodes: poll.totalNodes,
      topologyGeneration: poll.topologyGeneration },
    nearestProcessorDiagnostic: nearest ? { performanceMs: nearest.record.performanceMs,
      ageMs: Math.abs(nearest.record.performanceMs - poll.performanceMs),
      processorPlateLayers: nearest.d.layers, processorNodules: nearest.d.noduleCount,
      activeNodes: nearest.d.activeNodes, awakeLayers: nearest.d.awakeLayers,
      sleepingLayers: nearest.d.sleepingLayers, activeSphereModes: nearest.d.activeSphereModes,
      integratedSphereModes: nearest.d.integratedSphereModes, couplingLinks: nearest.d.couplingLinks,
      strikes: nearest.d.strikes, droppedRoutes: nearest.d.droppedRoutes,
      nonFinite: nearest.d.nonFinite, clippedPreLimiter: nearest.d.clipped,
      maxOutputAbsBeforeLimiter: nearest.d.maxOutputAbs } : null };
});

const lagSamples = polls.filter(poll => Number.isFinite(poll.offsetAdjustedSimAudioLagSeconds));
const ratios = recomputedWindows.map(item => item.audioPerWall).filter(Number.isFinite);
const firstBySimulationTime = items => [...(items || [])]
  .sort((a, b) => a.simulationTimeMs - b.simulationTimeMs)[0] ?? null;
const historicalEvidencePath = resolve('docs/ant/evidence/2026-10-06-stratigraphy-runtime/motion/continuous-natural-0-600s-browser-evidence.json.gz');
const historical = JSON.parse(gunzipSync(await readFile(historicalEvidencePath)));
const nearestBy = (items, selector, target) => items.reduce((best, item) =>
  Math.abs(selector(item) - target) < Math.abs(selector(best) - target) ? item : best, items[0]);
const oldAnchorStart = nearestBy(historical.clockAnchors, item => item.simulationTimeMs / 1000, 514.9833333335666);
const oldAnchorEnd = nearestBy(historical.clockAnchors, item => item.simulationTimeMs / 1000,
  oldAnchorStart.simulationTimeMs / 1000 + 8);
const currentCompareStart = nearestBy(polls, item => item.simulationTimeMs / 1000,
  oldAnchorStart.simulationTimeMs / 1000);
const currentCompareEnd = nearestBy(polls, item => item.performanceMs,
  currentCompareStart.performanceMs + 8000);
const oldAnchorSimDelta = (oldAnchorEnd.simulationTimeMs - oldAnchorStart.simulationTimeMs) / 1000;
const oldAnchorAudioDelta = oldAnchorEnd.audioContextTimeSeconds - oldAnchorStart.audioContextTimeSeconds;
const currentCompareWallDelta = (currentCompareEnd.performanceMs - currentCompareStart.performanceMs) / 1000;
const currentCompareSimDelta = (currentCompareEnd.simulationTimeMs - currentCompareStart.simulationTimeMs) / 1000;
const currentCompareAudioDelta = currentCompareEnd.audioTime - currentCompareStart.audioTime;
const processorOutput = {
  noDroppedOrNonFiniteProcessorEvents: diagChecks.every(({ d }) => d.dropped === 0 && d.droppedRoutes === 0 && d.nonFinite === 0),
  preLimiterThresholdCrossings: Math.max(0, ...diagChecks.map(({ d }) => d.clipped)),
  maximumPreLimiterOutputAbs: Math.max(0, ...diagChecks.map(({ d }) => d.maxOutputAbs)),
  finalPcmCaptured: false,
  interpretation: 'clipped counts worklet mixed-signal threshold crossings before its existing bounded output mapping; this capture has no PCM tap and therefore does not verify final captured-sample clipping.'
};
const analysis = {
  schema: 'ant-runtime-recheck-independent-analysis-v1',
  capture: { runDirectory: runDir, runId: summary.runId, startingHead: summary.head,
    expectedHead: EXPECTED_HEAD, seed: summary.seed, stopReason: summary.stopReason,
    mode: capture.start.mode, chromeVersion: capture.chromeVersion, chromeMode: capture.chromeMode,
    sampleRate: capture.start.sampleRate, volume: capture.volume, finalGain: summary.final.gain },
  sourceIntegrity: { workletMatchesPinnedStartingHead: currentWorkletHash === EXPECTED_WORKLET_SHA256,
    pinnedStartingHeadWorkletSha256: EXPECTED_WORKLET_SHA256,
    expectedWorkletSha256: baseWorkletHash, currentWorkletSha256: currentWorkletHash,
    summarySourceWorkletSha256: summary.originalWorkletSha256,
    servedOriginalWorkletSha256: capture.servedTransform.workletOriginalSha256,
    diagnosticsOnlyServedExtension: true,
    recordedServedWorkletSha256: capture.servedTransform.workletServedSha256,
    dampingMultiplier: dsp.plateDampingMultiplier, contactPulseSteps: dsp.contactPulseSteps,
    contactPulseDurationMs: 1000 * dsp.contactPulseSteps / 6000,
    contactRecoveryMs: 1000 * dsp.contactRecoverySeconds,
    contactMaxComplianceLoss: dsp.contactMaximumComplianceLoss,
    sleepEnergyThreshold: dsp.sleepEnergyThreshold, sleepQuietSeconds: dsp.sleepQuietSeconds },
  runtime: { wallDurationSeconds: (summary.final.performanceMs - summary.start.performanceMs) / 1000,
    simulationSeconds: summary.final.simulationTimeMs / 1000,
    audioContextSeconds: summary.final.audioTime - summary.start.audioTime,
    overallSimPerWall: ((summary.final.simulationTimeMs - summary.start.simulationTimeMs) / 1000)
      / ((summary.final.performanceMs - summary.start.performanceMs) / 1000),
    overallAudioPerWall: (summary.final.audioTime - summary.start.audioTime)
      / ((summary.final.performanceMs - summary.start.performanceMs) / 1000),
    finalAudioContextState: summary.final.audioContextState,
    firstPlateBirth: firstBySimulationTime(summary.final.plateBirths),
    firstNoduleBirth: firstBySimulationTime(summary.final.noduleBirths),
    finalPlateCount: summary.final.plateCount, finalNoduleCount: summary.final.noduleCount,
    worstCompletedWindowAudioPerWall: ratios.length ? Math.min(...ratios) : null,
    maximumObservedActiveNodes: Math.max(0, ...diagChecks.map(({ d }) => d.activeNodes)),
    maximumObservedAwakeLayers: Math.max(0, ...diagChecks.map(({ d }) => d.awakeLayers)),
    anyObservedSleepingLayers: diagChecks.some(({ d }) => d.sleepingLayers > 0),
    clockLag: { firstOffsetAdjustedSimAudioLagSeconds: lagSamples[0]?.offsetAdjustedSimAudioLagSeconds ?? null,
      finalOffsetAdjustedSimAudioLagSeconds: lagSamples.at(-1)?.offsetAdjustedSimAudioLagSeconds ?? null,
      maximumOffsetAdjustedSimAudioLagSeconds: lagSamples.length
        ? Math.max(...lagSamples.map(poll => poll.offsetAdjustedSimAudioLagSeconds)) : null,
      sampleCount: lagSamples.length } },
  windows: recomputedWindows,
  historicalClockComparison: {
    historicalEvidencePath: 'docs/ant/evidence/2026-10-06-stratigraphy-runtime/motion/continuous-natural-0-600s-browser-evidence.json.gz',
    historicalSeed: historical.seed,
    historicalAnchorFields: Object.keys(historical.clockAnchors[0]),
    historicalLocalWallAnchorAvailable: false,
    historicalAnchors: {
      start: { simulationTimeSeconds: oldAnchorStart.simulationTimeMs / 1000,
        audioContextTimeSeconds: oldAnchorStart.audioContextTimeSeconds,
        audioSampleIndex: oldAnchorStart.audioSampleIndex },
      end: { simulationTimeSeconds: oldAnchorEnd.simulationTimeMs / 1000,
        audioContextTimeSeconds: oldAnchorEnd.audioContextTimeSeconds,
        audioSampleIndex: oldAnchorEnd.audioSampleIndex },
      simulationDeltaSeconds: oldAnchorSimDelta, audioDeltaSeconds: oldAnchorAudioDelta,
      audioPerSimulationSecond: oldAnchorAudioDelta / oldAnchorSimDelta,
      wallDeltaSeconds: null,
      aggregateSimulationSeconds: historical.simulationDurationSeconds,
      aggregateWallSeconds: historical.wallDurationSeconds,
      aggregateSimulationPerWall: historical.simulationDurationSeconds / historical.wallDurationSeconds,
      audioPerWallEstimatedFromAggregateRate: (oldAnchorAudioDelta / oldAnchorSimDelta)
        * (historical.simulationDurationSeconds / historical.wallDurationSeconds),
      caveat: 'The old anchor map contains simulation, audio sample index and AudioContext time, but no local wall/performance timestamp. The audio-per-wall estimate applies the capture-wide simulation/wall ratio to this local interval.'
    },
    currentMatchedPollInterval: {
      start: { performanceMs: currentCompareStart.performanceMs,
        simulationTimeSeconds: currentCompareStart.simulationTimeMs / 1000,
        audioContextTimeSeconds: currentCompareStart.audioTime,
        plateCount: currentCompareStart.plates, noduleCount: currentCompareStart.nodules,
        totalNodes: currentCompareStart.totalNodes },
      end: { performanceMs: currentCompareEnd.performanceMs,
        simulationTimeSeconds: currentCompareEnd.simulationTimeMs / 1000,
        audioContextTimeSeconds: currentCompareEnd.audioTime,
        plateCount: currentCompareEnd.plates, noduleCount: currentCompareEnd.nodules,
        totalNodes: currentCompareEnd.totalNodes },
      wallDeltaSeconds: currentCompareWallDelta, simulationDeltaSeconds: currentCompareSimDelta,
      audioDeltaSeconds: currentCompareAudioDelta,
      simulationPerWall: currentCompareSimDelta / currentCompareWallDelta,
      audioPerWall: currentCompareAudioDelta / currentCompareWallDelta,
      caveat: 'Current interval uses same-callback main-thread performance, simulation and AudioContext poll values; start was selected nearest to the old anchor simulation time, then the end nearest to eight seconds of wall time.'
    }
  },
  plateMilestones: milestoneData,
  asynchronousDiagnostics: { receivedCount: diagChecks.length,
    maxRequestToReceiptLatencyMs: Math.max(0, ...diagChecks.map(({ record }) => record.latencyFromRequestMs ?? 0)),
    maxAgeAtPollMs: Math.max(0, ...polls.map(poll => poll.diagnosticsReceived?.ageAtPollMs ?? 0)),
    generationMatchedPollCount: matchedLayerSnapshots.filter(item => item.matched).length,
    generationMismatchOrNoMatchCount: matchedLayerSnapshots.filter(item => !item.matched).length,
    snapshots: matchedLayerSnapshots },
  layerSleepEvidence: { method: 'For each processor diagnostic, select nearest main-thread poll only if topologyGeneration matches; old material is treated fully buried only when exposedCellCount=0 and buriedCellCount>0.',
    matchedSamples: matchedLayerSnapshots.filter(item => item.matched).length,
    snapshotsWithFullyBuriedMaterial: matchedLayerSnapshots.filter(item => item.matched && item.buriedPlateCount > 0).length,
    fullyBuriedInactiveCounts: matchedLayerSnapshots.filter(item => item.matched && item.buriedPlateCount > 0)
      .map(item => ({ performanceMs: item.diagnosticPerformanceMs, ageMs: item.ageMs,
        generation: item.generation, plateCount: item.plateCount, buriedPlateCount: item.buriedPlateCount,
        inactive: item.fullyBuriedInactiveCount, active: item.fullyBuriedActiveCount,
        unmapped: item.fullyBuriedUnmappedCount })),
    snapshotsWithPartiallyBuriedMaterial: matchedLayerSnapshots.filter(item => item.matched && item.partiallyBuriedPlateCount > 0).length,
    partiallyBuriedPlateActivity: matchedLayerSnapshots.filter(item => item.matched && item.partiallyBuriedPlateCount > 0)
      .map(item => ({ performanceMs: item.diagnosticPerformanceMs, ageMs: item.ageMs,
        generation: item.generation, simulationTimeMs: item.pollSimulationTimeMs, plateCount: item.plateCount,
        partiallyBuriedPlateCount: item.partiallyBuriedPlateCount, plates: item.partiallyBuriedPlateIds })) },
  processorOutput,
  processorValidation: { diagnosticSamples: diagChecks.length,
    perLayerActiveSumsMatchProcessorActiveNodes: true,
    perLayerNodeSumsMatchProcessorTotalNodes: true,
    diagnosticsFinite: true,
    droppedRoutesAndNonFiniteAllZero: processorOutput.noDroppedOrNonFiniteProcessorEvents,
    clippedCounterMeaning: 'pre-limiter threshold crossing counter; not captured PCM clipping' }
};
assert.ok(summary.final.audioTime >= summary.start.audioTime);
assert.ok(recomputedWindows.length > 0, 'No valid runtime windows found.');
const outputPath = join(runDir, 'analysis.json');
await writeFile(outputPath, JSON.stringify(analysis, null, 2));
console.log(JSON.stringify({ output: outputPath, windows: recomputedWindows.length,
  worstAudioPerWall: analysis.runtime.worstCompletedWindowAudioPerWall,
  finalAwakeLayers: summary.finalProcessorDiagnostics?.awakeLayers ?? null,
  finalSleepingLayers: summary.finalProcessorDiagnostics?.sleepingLayers ?? null,
  fullyBuriedChecks: analysis.layerSleepEvidence.snapshotsWithFullyBuriedMaterial }, null, 2));
