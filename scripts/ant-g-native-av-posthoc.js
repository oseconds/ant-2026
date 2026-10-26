import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const dir = resolve('docs/ant/evidence/2026-10-26-g-native-av-observation/attempt-02');
const capture = JSON.parse(await readFile(resolve(dir, 'capture.json')));
const mediaIndex = JSON.parse(await readFile(resolve(dir, 'MEDIA-INDEX.json')));
const validation = JSON.parse(await readFile(resolve(dir, 'VALIDATION.json')));
const browserParity = JSON.parse(await readFile(resolve(dir, 'BROWSER-PARITY.json')));
for (const key of ['sameChromeVersion', 'sameCompiledBundle', 'worldFingerprintExact', 'rngExact', 'contactOrderAndValuesExact', 'actualStrikePayloadOrderExact']) {
  assert.equal(browserParity[key], true, `Required retained parity receipt: ${key}`);
}
const sidecar = JSON.parse(gunzipSync(await readFile(resolve(dir, 'sidecar.json.gz'))));
const world = JSON.parse(gunzipSync(await readFile(resolve(dir, 'world-final.json.gz'))));
const wav = gunzipSync(await readFile(resolve(dir, 'native-stereo-f32.wav.gz')));
assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
assert.equal(wav.toString('ascii', 36, 40), 'data');
assert.equal(wav.readUInt16LE(20), 3, 'WAV must contain IEEE Float32 PCM');
const channels = wav.readUInt16LE(22), sampleRate = wav.readUInt32LE(24), dataBytes = wav.readUInt32LE(40);
assert.equal(channels, 2); assert.equal(sampleRate, capture.conditions.sampleRate);
assert.equal(dataBytes, wav.length - 44);

const startFrame = capture.pcmStop.firstFrame;
const mediaZero = capture.recorderStartAnchor.performanceMs;
const pcmMediaZeroFrame = Math.round(capture.recorderStartAnchor.audioSeconds * sampleRate);
const mediaDuration = mediaIndex.containerDurationSeconds;
const binSeconds = 5;
const binCount = Math.ceil(mediaDuration / binSeconds);
const bins = Array.from({ length: binCount }, (_, i) => ({
  startMediaSeconds: i * binSeconds, endMediaSeconds: Math.min((i + 1) * binSeconds, mediaDuration),
  contactEvents: 0, actualStrikePosts: 0, exposedContactEvents: 0,
  localL: [], compaction: [], rawPheromone: [], audioFrames: 0, audioSumSquares: 0, audioPeak: 0,
}));
const binAt = seconds => seconds >= 0 && seconds < mediaDuration ? bins[Math.floor(seconds / binSeconds)] : null;
for (const event of sidecar.events) {
  const b = binAt((event.performanceTimeMs - mediaZero) / 1000);
  if (!b) continue;
  b.contactEvents++;
  if (event.exposedPlateId != null) b.exposedContactEvents++;
  b.localL.push(event.localL);
  b.compaction.push(event.preContactCompaction);
  b.rawPheromone.push(event.rawPheromonePostGasterPreNextTick);
}
for (const post of sidecar.posts) {
  const mediaSeconds = (post.performanceTimeMs - mediaZero) / 1000;
  const b = binAt(mediaSeconds);
  if (b) b.actualStrikePosts++;
}

const frameCount = dataBytes / 4 / channels;
const firstBirth = capture.births.find(b => b.kind === 'plate');
let firstNonzeroFrame = null;
let nonzeroBeforeMediaZero = 0, nonzeroBeforeFirstBirth = 0;
const firstBirthMediaSeconds = (firstBirth.performanceMs - mediaZero) / 1000;
for (let i = 0; i < frameCount; i++) {
  const frame = startFrame + i;
  const mediaSeconds = (frame - pcmMediaZeroFrame) / sampleRate;
  const b = binAt(mediaSeconds);
  let l = wav.readFloatLE(44 + i * 8), r = wav.readFloatLE(48 + i * 8);
  assert.ok(Number.isFinite(l) && Number.isFinite(r), 'Captured PCM must be finite');
  if (l !== 0 || r !== 0) {
    if (firstNonzeroFrame === null) firstNonzeroFrame = frame;
    if (frame < pcmMediaZeroFrame) nonzeroBeforeMediaZero++;
    if ((frame - pcmMediaZeroFrame) / sampleRate < firstBirthMediaSeconds) nonzeroBeforeFirstBirth++;
  }
  if (!b) continue;
  b.audioFrames++;
  b.audioSumSquares += l * l + r * r;
  b.audioPeak = Math.max(b.audioPeak, Math.abs(l), Math.abs(r));
}
const quantile = (values, q) => {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  return values[Math.floor((values.length - 1) * q)];
};
const outputBins = bins.map(b => ({
  startMediaSeconds: b.startMediaSeconds, endMediaSeconds: b.endMediaSeconds,
  contactEvents: b.contactEvents, actualStrikePosts: b.actualStrikePosts,
  strikePostsPerContactEvent: b.contactEvents ? b.actualStrikePosts / b.contactEvents : null,
  exposedContactEvents: b.exposedContactEvents,
  exposedFraction: b.contactEvents ? b.exposedContactEvents / b.contactEvents : null,
  localL: { p50: quantile(b.localL, .5), p90: quantile(b.localL, .9), max: b.localL.length ? Math.max(...b.localL) : null },
  preContactCompaction: { p50: quantile(b.compaction, .5), p90: quantile(b.compaction, .9) },
  rawPheromonePostGasterPreNextTick: { p50: quantile(b.rawPheromone, .5), p90: quantile(b.rawPheromone, .9) },
  pcm: { frames: b.audioFrames, rmsNativeGain: b.audioFrames ? Math.sqrt(b.audioSumSquares / (b.audioFrames * channels)) : null, peakNativeGain: b.audioFrames ? b.audioPeak : null },
}));
const firstPost = sidecar.posts[0];
const firstFootEvent = sidecar.events.find(e => e.eventId === firstPost.eventId);
assert.ok(firstFootEvent, 'First actual strike post must map to its source foot event');
assert.equal(firstFootEvent.x, firstPost.payload.position.x, 'Strike x must match linked source foot event');
assert.equal(firstFootEvent.y, firstPost.payload.position.y, 'Strike y must match linked source foot event');
assert.equal(firstFootEvent.simulationTimeMs, firstPost.simulationTimeMs, 'Bridge source simulation timestamp must match foot event');
const result = {
  scope: 'descriptive post-hoc measurements from attempt-02 capture only; no replay, render, or causal/perceptual inference',
  parity: { source: 'BROWSER-PARITY.json', exactWorldParity: browserParity.worldFingerprintExact,
    ticks: world.ticks, contactEvents: sidecar.events.length, actualStrikePosts: sidecar.posts.length },
  clocks: {
    mediaZero: 'recorderStartAnchor.performanceMs; approximately aligned to indexed video PTS (native and indexed video PTS are unchanged)',
    recorderStartAnchor: { performanceMs: mediaZero, audioSeconds: capture.recorderStartAnchor.audioSeconds,
      estimatedContextFrame: pcmMediaZeroFrame, outputTimestampContextTimeSeconds: capture.recorderStartAnchor.outputTimestamp.contextTime,
      outputTimestampPerformanceMs: capture.recorderStartAnchor.outputTimestamp.performanceTime,
      anchorPerformancePairDeltaMs: capture.recorderStartAnchor.performanceMs - capture.recorderStartAnchor.outputTimestamp.performanceTime },
    eventToMedia: '(event.performanceTimeMs - recorderStartAnchor.performanceMs) / 1000; source simulationTimeMs is a separate model clock',
    pcmToMedia: '(absolute PCM read-buffer frame - recorder-start currentFrame) / 48000; independent of the WebM Opus render clock',
    pcmCapture: { firstFrame: startFrame, endFrame: capture.pcmStop.endFrame, recorderStartFrame: pcmMediaZeroFrame, frames: frameCount,
      sampleRate, channels, floatFormat: 'IEEE Float32', posthocClockToleranceSeconds: validation.clock.stricterPosthocToleranceSeconds,
      contextFrameQuantizationSeconds: 128 / sampleRate, videoFrameToleranceSeconds: 0.059,
      recorderStartAnchorPairDeltaMs: capture.recorderStartAnchor.performanceMs - capture.recorderStartAnchor.outputTimestamp.performanceTime,
      uncertaintyNote: 'posthoc clock tolerance, video frame tolerance, and recorder-start anchor pairing are separate; no exact millisecond cross-clock ordering claim' },
    recorderLeadSeconds: (capture.start.performanceMs - mediaZero) / 1000,
    sourceVideoDurationSeconds: mediaDuration,
    sourceAudioStartPtsSeconds: mediaIndex.streams.find(s => s.type === 'audio').startPtsMilliseconds / 1000,
  },
  firstPlate: {
    birth: { id: firstBirth.id, modelSeconds: firstBirth.modelMs / 1000, mediaSeconds: (firstBirth.performanceMs - mediaZero) / 1000 },
    firstActualStrikeBridgePost: { eventId: firstPost.eventId, postOrder: firstPost.postOrder,
      sourceEventSimulationSeconds: firstPost.simulationTimeMs / 1000,
      controllerTickEntrySimulationSeconds: firstPost.postSimulationTimeMs / 1000,
      bridgePostMediaSeconds: (firstPost.performanceTimeMs - mediaZero) / 1000, plateId: firstPost.payload.plateId,
      sourceFootEvent: { simulationSeconds: firstFootEvent.simulationTimeMs / 1000,
        performanceMediaSeconds: (firstFootEvent.performanceTimeMs - mediaZero) / 1000,
        antId: firstFootEvent.antId, contactGroup: firstFootEvent.contactGroup, legId: firstFootEvent.legId,
        positionMatchesPayload: firstFootEvent.x === firstPost.payload.position.x && firstFootEvent.y === firstPost.payload.position.y } },
    firstPostHasFootEvent: Boolean(firstFootEvent),
  },
  materialBirths: capture.births.map(b => ({ kind: b.kind, id: b.id, modelSeconds: b.modelMs / 1000,
    estimatedMediaSeconds: (b.performanceMs - mediaZero) / 1000 })),
  pcmOnset: { firstCapturedSampleFrame: startFrame, firstCapturedSampleMediaSeconds: (startFrame - pcmMediaZeroFrame) / sampleRate,
    firstNonzeroSampleFrame: firstNonzeroFrame, firstNonzeroMediaSeconds: (firstNonzeroFrame - pcmMediaZeroFrame) / sampleRate,
    firstNonzeroMinusEstimatedBirthMs: ((firstNonzeroFrame - pcmMediaZeroFrame) / sampleRate - firstBirthMediaSeconds) * 1000,
    exactNonzeroSamplesBeforeMediaZero: nonzeroBeforeMediaZero,
    exactNonzeroSamplesBeforeEstimatedFirstBirthMediaTime: nonzeroBeforeFirstBirth,
    crossClockOrdering: 'unresolved at stated posthoc and video-frame clock tolerances' },
  bins: outputBins,
  finalOnlySnapshot: { activeAgents: world.fingerprint.snapshot.agents.length, limitation: 'single final snapshot; does not establish a temporal population trace' },
  definitions: {
    contactEvents: 'one observed FOOT_CONTACT record per individual foot event',
    actualStrikePosts: 'observed worklet bridge strike messages; not all contacts are strikes',
    exposedFraction: 'contacts whose observed exposedPlateId is non-null divided by contacts',
    strikePostsPerContactEvent: 'timestamp-bin count ratio; post/event causal pairing is separately available by eventId',
    pcmRms: 'raw Float32 samples at captured final gain, no normalization; RMS over both channels',
    nonzero: 'exact floating point nonzero detection, not an audibility threshold',
    quantiles: 'sorted order-statistic at index floor((n - 1) * q), without interpolation; descriptive only',
  },
};
assert.equal(sidecar.events.length, 12042);
assert.equal(sidecar.posts.length, 631);
assert.equal(browserParity.ticks, world.ticks);
assert.equal(browserParity.footResponses, sidecar.events.length);
assert.equal(browserParity.actualStrikes, sidecar.posts.length);
assert.equal(outputBins.reduce((n, b) => n + b.contactEvents, 0), sidecar.events.filter(e => e.performanceTimeMs >= mediaZero && e.performanceTimeMs < mediaZero + mediaDuration * 1000).length);
assert.equal(outputBins.reduce((n, b) => n + b.actualStrikePosts, 0), sidecar.posts.filter(p => p.performanceTimeMs >= mediaZero && p.performanceTimeMs < mediaZero + mediaDuration * 1000).length);
assert.equal(outputBins.reduce((n, b) => n + b.pcm.frames, 0), Math.max(0, Math.min(capture.pcmStop.endFrame, Math.ceil(pcmMediaZeroFrame + mediaDuration * sampleRate)) - Math.max(startFrame, pcmMediaZeroFrame)));
await writeFile(resolve(dir, 'POSTHOC.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ bins: bins.length, contacts: sidecar.events.length, posts: sidecar.posts.length, firstNonzeroFrame, pcmFramesInMediaBins: outputBins.reduce((n, b) => n + b.pcm.frames, 0) }));
