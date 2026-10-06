import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodeStereoFloatWav } from './stratigraphy-audio-overview.js';

const runDir = resolve(process.argv[2] || 'test-results/stratigraphy-motion-2026-10-06T05-30-53-880Z');
const motionDir = resolve('docs/ant/evidence/2026-10-06-stratigraphy-runtime/motion');
const stem = 'continuous-natural-0-600s';
const run = JSON.parse(await readFile(resolve(runDir, `${stem}.json`), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(motionDir, `${stem}-curated-manifest.json`), 'utf8'));

function pcmMetrics(decoded) {
  const result = { sampleRate: decoded.sampleRate, channels: {}, nativeFrameCount: decoded.sampleCount,
    durationSeconds: decoded.sampleCount / decoded.sampleRate, stereoSumSquares: 0, stereoRms: 0,
    pcmPeakAbsolute: 0, pcmSamplesAtOrAboveUnity: 0, nonFiniteSamples: 0, nearDigitalSilenceFrames: 0,
    nearDigitalSilenceThreshold: 1e-6 };
  let totalSquares = 0;
  for (const side of ['left', 'right']) {
    const samples = decoded.channels[side];
    let squares = 0, peak = 0, atOrAboveUnity = 0, nonFinite = 0, silent = 0;
    for (let i = 0; i < samples.length; i++) {
      const value = samples[i];
      if (!Number.isFinite(value)) { nonFinite++; continue; }
      const absolute = Math.abs(value);
      squares += value * value;
      if (absolute > peak) peak = absolute;
      if (absolute >= 1) atOrAboveUnity++;
      if (absolute < result.nearDigitalSilenceThreshold) silent++;
    }
    totalSquares += squares;
    result.channels[side] = { sampleCount: samples.length, sumSquares: squares,
      rms: Math.sqrt(squares / samples.length), peakAbsolute: peak,
      samplesAtOrAboveUnity: atOrAboveUnity, nonFiniteSamples: nonFinite,
      nearDigitalSilenceSamples: silent, nearDigitalSilenceFraction: silent / samples.length };
    result.pcmPeakAbsolute = Math.max(result.pcmPeakAbsolute, peak);
    result.pcmSamplesAtOrAboveUnity += atOrAboveUnity;
    result.nonFiniteSamples += nonFinite;
    result.nearDigitalSilenceFrames += silent;
  }
  result.stereoSumSquares = totalSquares;
  result.stereoRms = Math.sqrt(totalSquares / (decoded.sampleCount * 2));
  result.nearDigitalSilenceFraction = result.nearDigitalSilenceFrames / (decoded.sampleCount * 2);
  return result;
}

const timeline = run.timeline;
function nearestCheckpoint(seconds) {
  return timeline.reduce((best, item) => Math.abs(item.simulationTimeMs / 1000 - seconds) < Math.abs(best.simulationTimeMs / 1000 - seconds) ? item : best, timeline[0]);
}
function timelineMeasure(seconds) {
  const item = nearestCheckpoint(seconds);
  const proc = item.processorDiagnosticsObserved || {};
  return { simulationTimeSeconds: item.simulationTimeMs / 1000, audioContextTimeSeconds: item.processorDiagnosticsRequestedAt,
    population: item.population, activation: item.activation, plateCount: item.plateCount,
    exposedCellCount: item.exposedCellCount, buriedLayerCellCount: item.buriedLayerCellCount,
    maxColumnLayerCount: item.maxColumnLayerCount, noduleCount: item.noduleCount,
    meanBurialDepthMeters: item.depth?.mean, maxBurialDepthMeters: item.depth?.max,
    bridgeDiagnostics: item.bridgeDiagnostics,
    processorDiagnosticsObserved: { layers: proc.layers, awakeLayers: proc.awakeLayers, sleepingLayers: proc.sleepingLayers,
      activeNodes: proc.activeNodes, strikes: proc.strikes, maxOutputAbs: proc.maxOutputAbs,
      clipped: proc.clipped, nonFinite: proc.nonFinite, physicsSteps: proc.physicsSteps } };
}
function contactSummary(startSeconds, endSeconds) {
  const events = run.events.filter(e => e.type === 'FOOT_CONTACT' && e.simulationTimeMs >= startSeconds * 1000 && e.simulationTimeMs < endSeconds * 1000);
  return { contactGroups: events.length, individualFeet: events.reduce((sum, e) => sum + (e.payload?.contacts?.length || 0), 0),
    support: { routedContactGroups: null, routedIndividualFeet: null, supportedFeet: null, unsupportedFeet: null, injectedImpulseEnergy: null,
      note: 'Support and energy values are cumulative bridge telemetry deltas between the nearest timeline snapshots; these bridge diagnostics are asynchronous and can lag the exact clip boundaries.' } };
}
function withBridgeDeltas(summary, startSeconds, endSeconds) {
  const a = nearestCheckpoint(startSeconds), b = nearestCheckpoint(endSeconds);
  const da = a.bridgeDiagnostics || {}, db = b.bridgeDiagnostics || {};
  summary.support = { routedContactGroups: (db.routedFootEvents || 0) - (da.routedFootEvents || 0),
    routedIndividualFeet: (db.routedFeet || 0) - (da.routedFeet || 0),
    supportedFeet: (db.supportedFeet || 0) - (da.supportedFeet || 0),
    unsupportedFeet: (db.unsupportedFeet || 0) - (da.unsupportedFeet || 0),
    injectedImpulseEnergy: (db.injectedImpulseEnergy || 0) - (da.injectedImpulseEnergy || 0),
    startCheckpointSimulationSeconds: a.simulationTimeMs / 1000, endCheckpointSimulationSeconds: b.simulationTimeMs / 1000,
    startCheckpointAudioContextSeconds: a.processorDiagnosticsRequestedAt, endCheckpointAudioContextSeconds: b.processorDiagnosticsRequestedAt,
    observedBridgeTotalsAtStart: { routedContactGroups: da.routedFootEvents || 0, routedIndividualFeet: da.routedFeet || 0,
      supportedFeet: da.supportedFeet || 0, unsupportedFeet: da.unsupportedFeet || 0, injectedImpulseEnergy: da.injectedImpulseEnergy || 0 },
    observedBridgeTotalsAtEnd: { routedContactGroups: db.routedFootEvents || 0, routedIndividualFeet: db.routedFeet || 0,
      supportedFeet: db.supportedFeet || 0, unsupportedFeet: db.unsupportedFeet || 0, injectedImpulseEnergy: db.injectedImpulseEnergy || 0 },
    note: 'Cumulative bridge diagnostics sampled at nearest 10 s simulation timeline checkpoints; these asynchronous telemetry snapshots may lag and do not assign support to each individual contact.' };
  return summary;
}
function replaySupport(startSeconds, endSeconds) {
  const plateCells = new Uint8Array(96 * 96);
  const result = { supportedFeet: 0, unsupportedFeet: 0, supportedContactGroups: 0, unsupportedContactGroups: 0 };
  for (const event of run.events) {
    const seconds = event.simulationTimeMs / 1000;
    if (seconds > endSeconds) break;
    if (event.type === 'plate-birth') {
      const mask = event.payload?.mask;
      if (Array.isArray(mask) && mask.length === plateCells.length) {
        for (let i = 0; i < mask.length; i++) if (mask[i]) plateCells[i] = 1;
      }
    } else if (event.type === 'FOOT_CONTACT' && seconds >= startSeconds && seconds < endSeconds) {
      let supportedInGroup = false;
      for (const foot of event.payload?.contacts || []) {
        const x = Math.max(0, Math.min(95, Math.round(foot.position.x * 95)));
        const y = Math.max(0, Math.min(95, Math.round(foot.position.y * 95)));
        if (plateCells[y * 96 + x]) { result.supportedFeet++; supportedInGroup = true; }
        else result.unsupportedFeet++;
      }
      if (supportedInGroup) result.supportedContactGroups++;
      else result.unsupportedContactGroups++;
    }
  }
  return result;
}

const fullPcm = decodeStereoFloatWav(await readFile(resolve(runDir, `${stem}.wav`)));
const full = pcmMetrics(fullPcm);
const clipMetrics = [];
for (const clip of manifest.clips) {
  const decoded = decodeStereoFloatWav(await readFile(resolve(clip.audioFile)));
  const pcm = pcmMetrics(decoded);
  const contacts = withBridgeDeltas(contactSummary(clip.videoSimulationStart, clip.videoSimulationEnd), clip.videoSimulationStart, clip.videoSimulationEnd);
  const bridgeDelta = contacts.support;
  const replayedSupport = replaySupport(clip.videoSimulationStart, clip.videoSimulationEnd);
  contacts.support = { ...replayedSupport, method: 'Replay captured immutable Plate birth masks and recorded FOOT_CONTACT positions; nearest grid cell is round(x*95), round(y*95).', bridgeObservedDelta: bridgeDelta };
  const supported = replayedSupport.supportedFeet;
  clipMetrics.push({ key: clip.key, motionVideoDurationSeconds: clip.videoDurationSeconds,
    motionSimulationStartSeconds: clip.videoSimulationStart, motionSimulationEndSeconds: clip.videoSimulationEnd,
    audioSimulationStartSeconds: clip.audioMappedSimulationStart, audioSimulationEndSeconds: clip.audioMappedSimulationEnd,
    audioStartSampleIndex: clip.audioStartSample, audioEndSampleIndex: clip.audioEndSample,
    audioNativeFrameCount: decoded.sampleCount, audioNativeDurationSeconds: pcm.durationSeconds,
    pcm, ...contacts,
    timelineMaterialAndWorklet: { start: timelineMeasure(clip.videoSimulationStart), end: timelineMeasure(clip.videoSimulationEnd),
      note: 'Nearest captured 10-second simulation checkpoint; processor diagnostics are asynchronous and may lag the video interval.' },
    derived: { pcmSumSquares: pcm.stereoSumSquares,
      pcmSumSquaresDividedBySampleRate: pcm.stereoSumSquares / pcm.sampleRate,
      pcmSumSquaresPerReplayedSupportedFoot: supported > 0 ? pcm.stereoSumSquares / pcm.sampleRate / supported : null,
      note: 'PCM squared-sample energy divided by sample rate is an aggregate comparison proxy; it is not perceptual loudness or causal per-foot attribution.' } });
}

const firstTimeline = timeline[0], lastTimeline = timeline.at(-1);
const finalBridge = run.end.endDiagnostics || {};
const finalProcessor = run.end.processorDiagnosticsEnd || {};
const totalFeet = run.events.filter(e => e.type === 'FOOT_CONTACT').reduce((n, e) => n + (e.payload?.contacts?.length || 0), 0);
const replayedFullSupport = replaySupport(0, run.simulationDurationSeconds);
if (replayedFullSupport.supportedFeet !== finalBridge.supportedFeet || replayedFullSupport.unsupportedFeet !== finalBridge.unsupportedFeet) {
  throw new Error(`Recorded-mask support replay did not match bridge totals: ${JSON.stringify({ replayedFullSupport, bridge: finalBridge })}`);
}
const metrics = { status: 'measured-from-captured-float32-pcm-and-recorded-browser-timeline', source: {
  continuousRun: `${stem}.wav`, compressedRunEvidence: `${stem}-browser-evidence.json.gz`, seed: run.seed,
  simulationDurationSeconds: run.simulationDurationSeconds, wallDurationSeconds: run.wallDurationSeconds,
  audioContextDurationSeconds: run.end.audioContextDurationSeconds, sampleRate: run.browserSampleRate,
  volume: run.end.volume, outputGain: run.end.outputGain, audioVsSimulationClockRatio: run.end.audioContextDurationSeconds / run.simulationDurationSeconds },
  fullPcm: { ...full, sourcePath: resolve(runDir, `${stem}.wav`).replaceAll('\\', '/') },
  naturalRunEvents: { plateBirths: run.eventCounts.plateBirths, noduleBirths: run.eventCounts.noduleBirths,
    footContactGroups: run.eventCounts.footContactGroups, individualFootContacts: totalFeet,
    populationAtEnd: run.end.finalState.population, activationAtEnd: run.end.finalState.colonyActivation.activation },
  materialAndAudioTelemetry: { initialSimulationSeconds: firstTimeline.simulationTimeMs / 1000,
    lastTimelineSimulationSeconds: lastTimeline.simulationTimeMs / 1000,
    observedTimelineMaterial: { plateCount: lastTimeline.plateCount, exposedCellCount: lastTimeline.exposedCellCount,
      buriedLayerCellCount: lastTimeline.buriedLayerCellCount, maxColumnLayerCount: lastTimeline.maxColumnLayerCount,
      noduleCount: lastTimeline.noduleCount, meanBurialDepthMeters: lastTimeline.depth?.mean, maxBurialDepthMeters: lastTimeline.depth?.max,
      activation: lastTimeline.activation },
    bridgeDiagnosticsCumulative: finalBridge,
    processorDiagnosticsEnd: finalProcessor,
    processorTelemetryCaveat: 'Final processor diagnostics are sampled worklet telemetry. Pre-limiter maxOutputAbs > 1 and clipped counter are DSP indicators, separate from the actual post-output PCM peak and PCM samples at/above unity.',
    preLimiter: { maxOutputAbs: finalProcessor.maxOutputAbs, limitThresholdExceeded: finalProcessor.maxOutputAbs > 1,
      threshold: 1, workletClippedCounter: finalProcessor.clipped, nonFiniteCounter: finalProcessor.nonFinite },
    pcmPostOutput: { peakAbsolute: full.pcmPeakAbsolute, samplesAtOrAboveUnity: full.pcmSamplesAtOrAboveUnity,
      nonFiniteSamples: full.nonFiniteSamples } },
  clips: clipMetrics,
  aggregateProxies: { fullPcmStereoSumSquares: full.stereoSumSquares,
    fullPcmStereoSumSquaresDividedBySampleRate: full.stereoSumSquares / full.sampleRate,
    supportedFeetObservedCumulative: finalBridge.supportedFeet,
    replayedFootSupport: replayedFullSupport,
    supportReplayMatchesBridgeCumulative: true,
    pcmSumSquaresPerReplayedSupportedFoot: replayedFullSupport.supportedFeet ? full.stereoSumSquares / full.sampleRate / replayedFullSupport.supportedFeet : null,
    injectedImpulseEnergy: finalBridge.injectedImpulseEnergy,
    injectedImpulseEnergyPerBridgeObservedSupportedFoot: finalBridge.supportedFeet ? finalBridge.injectedImpulseEnergy / finalBridge.supportedFeet : null,
    note: 'PCM energy/support and bridge-injected impulse energy/support are separate complete-run aggregate proxies; neither is causal per-foot attribution, SPL, or perceived loudness.' } };
await writeFile(resolve(motionDir, 'audio-metrics.json'), JSON.stringify(metrics, null, 2));
console.log(JSON.stringify({ output: resolve(motionDir, 'audio-metrics.json'), fullPcm: { duration: full.durationSeconds, rms: full.stereoRms, peak: full.pcmPeakAbsolute, samplesAtOrAboveUnity: full.pcmSamplesAtOrAboveUnity }, preLimiter: metrics.materialAndAudioTelemetry.preLimiter, clips: clipMetrics.map(c => ({ key: c.key, nativeDuration: c.audioNativeDurationSeconds, rms: c.pcm.stereoRms, peak: c.pcm.pcmPeakAbsolute, support: c.support })) }, null, 2));
