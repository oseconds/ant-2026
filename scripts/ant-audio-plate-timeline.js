import {
  buildAudioSnapshot,
  STRATIGRAPHY_AUDIO_PRESET,
  stratigraphyLuminanceForDbfs
} from './audio-snapshot-renderer.js';
import { STRATIGRAPHY_AUDIO_OVERVIEW_PRESET } from './stratigraphy-audio-overview.js';

const freeze = value => Object.freeze(value);

/** Separate research layout. The locked audio and overview presets remain unchanged. */
export const ANT_AUDIO_PLATE_TIMELINE_PRESET = freeze({
  id: 'ant-audio-plate-timeline-research-v1',
  width: 2400,
  height: 1510,
  waveformBins: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.spectrogramWidth,
  spectrogramWidth: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.spectrogramWidth,
  spectrogramHeight: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.spectrogramHeightPerChannel,
  bucketSeconds: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.contactBucketSeconds,
  zoomDurationAudioSeconds: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.durationSeconds,
  fftSize: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.fftSize,
  hopSize: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.hopSize,
  minDbfs: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.minDbfs,
  maxDbfs: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.maxDbfs,
  waveformAmplitude: freeze([-1, 1]),
  channelMode: 'separate L/R',
  grayscaleGamma: 1,
  noAudioNormalization: true
});

export function validateAudioPlateCapture(evidence, sampleRate, sampleCount) {
  const anchors = evidence?.clockAnchors;
  if (!Array.isArray(anchors) || anchors.length < 2) throw new TypeError('Capture needs at least two clock anchors.');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isInteger(sampleCount) || sampleCount < 1) {
    throw new RangeError('PCM sample rate and frame count must be valid.');
  }
  const simulationStrict = isStrictlyIncreasing(anchors, 'simulationTimeMs');
  const wallStrict = isStrictlyIncreasing(anchors, 'wallElapsedMs');
  const audioContextMonotonic = isNondecreasing(anchors, 'audioContextTimeSeconds');
  const sampleMonotonic = isNondecreasing(anchors, 'audioSampleIndex');
  const endSample = anchors.at(-1).audioSampleIndex;
  const codecEndOffsetSamples = endSample - sampleCount;
  const terminalPcmOffsetValid = Math.abs(codecEndOffsetSamples) <= sampleRate * 0.1;
  const sampleRangeValid = anchors.every(anchor => Number.isFinite(anchor.audioSampleIndex)
    && anchor.audioSampleIndex >= 0 && anchor.audioSampleIndex <= sampleCount + sampleRate * 0.1);
  const events = Array.isArray(evidence.events) ? evidence.events : [];
  const simulationStartMs = evidence.end?.simulationStartMs;
  const simulationEndMs = evidence.end?.simulationEndMs;
  const eventTimestampsValid = events.every(event => Number.isFinite(eventTime(event))
    && eventTime(event) >= simulationStartMs && eventTime(event) <= simulationEndMs);
  const eventTimestampInversions = events.slice(1).reduce((count, event, index) =>
    count + (eventTime(event) < eventTime(events[index]) ? 1 : 0), 0);
  const births = events.filter(event => eventType(event) === 'PLATE_BIRTH');
  const footContacts = events.filter(event => eventType(event) === 'FOOT_CONTACT');
  const individualFootCount = footContacts.reduce((sum, event) => sum
    + (Array.isArray(event.payload?.contacts) ? event.payload.contacts.length : 0), 0);
  const footGroupCountMatchesSummary = evidence.eventCounts?.footContactGroups === footContacts.length;
  const individualFeetMatchControllerCounter = evidence.end?.contacts === individualFootCount;
  const birthCountMatchesSummary = evidence.eventCounts?.plateBirths === births.length;
  const startPlateCount = statePlateCount(evidence.startState);
  const finalPlateCount = statePlateCount(evidence.finalState);
  const plateCountMatchesBirths = startPlateCount !== null && finalPlateCount !== null
    && finalPlateCount - startPlateCount === births.length;
  const timeline = [
    { simulationTimeMs: evidence.startState?.simulationTimeMs, plateCount: startPlateCount },
    ...(Array.isArray(evidence.timeline) ? evidence.timeline.map(point => ({
      simulationTimeMs: point.simulationTimeMs,
      plateCount: point.plateCount
    })) : []),
    { simulationTimeMs: evidence.end?.simulationEndMs, plateCount: finalPlateCount }
  ].filter(point => Number.isFinite(point.simulationTimeMs) && Number.isFinite(point.plateCount));
  const timelineMonotonic = timeline.every((point, index) => index === 0
    || point.simulationTimeMs >= timeline[index - 1].simulationTimeMs);
  const timelineBirthCountsMatch = timeline.every(point => startPlateCount
    + births.filter(event => eventTime(event) <= point.simulationTimeMs).length === point.plateCount);
  const rngObservationCalls = Number(evidence.end?.rng?.observerCallDelta ?? 0);
  return freeze({
    status: simulationStrict && wallStrict && audioContextMonotonic && sampleMonotonic && sampleRangeValid
      && eventTimestampsValid && footGroupCountMatchesSummary && individualFeetMatchControllerCounter
      && birthCountMatchesSummary && plateCountMatchesBirths && timelineMonotonic && timelineBirthCountsMatch
      && terminalPcmOffsetValid && rngObservationCalls === 0
      ? 'passed' : 'failed',
    checks: freeze({ simulationAnchorsStrictlyIncreasing: simulationStrict,
      wallAnchorsStrictlyIncreasing: wallStrict, audioContextAnchorsNondecreasing: audioContextMonotonic,
      sampleAnchorsNondecreasing: sampleMonotonic, audioSampleRangesValid: sampleRangeValid,
      terminalPcmOffsetWithin100ms: terminalPcmOffsetValid,
      controllerEventTimestampsWithinRun: eventTimestampsValid,
      rawEventTimestampInversions: eventTimestampInversions,
      footGroupsMatchCapturedEventSummary: footGroupCountMatchesSummary,
      individualFootEventsMatchControllerCounter: individualFeetMatchControllerCounter,
      plateBirthsMatchCapturedEventSummary: birthCountMatchesSummary,
      finalPlateCountEqualsAccumulatedBirths: plateCountMatchesBirths,
      timelinePlateCountsMatchBirthEvents: timelineBirthCountsMatch, timelineMonotonic,
      observerLcgCallsZero: rngObservationCalls === 0 }),
    sampleRate, sampleCount, decodedPcmDurationSeconds: sampleCount / sampleRate,
    terminalAnchorSampleIndex: endSample, codecEndOffsetSamples,
    codecEndOffsetSeconds: codecEndOffsetSamples / sampleRate,
    eventCount: events.length, footContactGroupCount: footContacts.length,
    individualFootCount, plateBirthCount: births.length, eventTimestampInversions,
    startPlateCount, finalPlateCount, observerLcgCalls: rngObservationCalls
  });
}

export function buildAudioPlateTimeline({ evidence, channels, sampleRate }) {
  const left = channels?.left ?? channels?.[0];
  const right = channels?.right ?? channels?.[1];
  if (!left || !right || left.length !== right.length || left.length < 1) {
    throw new TypeError('Timeline needs equal, non-empty stereo PCM channels.');
  }
  const rawAnchors = evidence.clockAnchors.map(anchor => ({ ...anchor }));
  const simulationStartMs = evidence.end.simulationStartMs;
  const simulationEndMs = evidence.end.simulationEndMs;
  const durationSeconds = (simulationEndMs - simulationStartMs) / 1000;
  if (!(durationSeconds > 0)) throw new RangeError('Capture simulation interval must be positive.');
  const validation = validateAudioPlateCapture(evidence, sampleRate, left.length);
  const renderAnchors = reconcileSmallTerminalCodecOffset(rawAnchors, left.length, sampleRate);
  const events = evidence.events.map((event, index) => normalizeEvent(event, index))
    .sort((a, b) => a.simulationTimeMs - b.simulationTimeMs || a.sourceIndex - b.sourceIndex);
  let birthNumber = 0;
  for (const event of events) if (event.type === 'PLATE_BIRTH') event.label = `P${++birthNumber}`;
  const births = events.filter(event => event.type === 'PLATE_BIRTH');
  const contacts = events.filter(event => event.type === 'FOOT_CONTACT');
  const contactBuckets = buildContactBuckets(contacts, simulationStartMs, simulationEndMs);
  const timeline = buildStateSeries(evidence);
  const clockHealth = buildClockHealth(evidence, rawAnchors, left.length, sampleRate);
  const audioMetrics = buildAudioMetrics({ channels: { left, right }, sampleRate,
    durationSeconds, simulationStartMs, simulationEndMs, anchors: renderAnchors,
    contacts, births, timeline, contactBuckets, startPlateCount: statePlateCount(evidence.startState) ?? 0 });
  const snapshots = (evidence.spatialSnapshots || []).map(snapshot => ({ ...snapshot,
    simulationSeconds: ((snapshot.frameSimulationTimeMs ?? snapshot.simulationTimeMs) - simulationStartMs) / 1000 }));
  const zoomSelections = selectTimelineZoomWindows({ durationSeconds, simulationStartMs,
    events, contactBuckets, anchors: renderAnchors, sampleCount: left.length, sampleRate });
  const channelsOverview = {};
  for (const name of ['left', 'right']) {
    const samples = channels[name] ?? channels[name === 'left' ? 0 : 1];
    const analyzed = buildAudioSnapshot(samples, {
      sampleRate,
      fftSize: ANT_AUDIO_PLATE_TIMELINE_PRESET.fftSize,
      hopSize: ANT_AUDIO_PLATE_TIMELINE_PRESET.hopSize,
      maxFrequencyHz: STRATIGRAPHY_AUDIO_PRESET.maxFrequencyHz,
      minDbfs: ANT_AUDIO_PLATE_TIMELINE_PRESET.minDbfs,
      maxDbfs: ANT_AUDIO_PLATE_TIMELINE_PRESET.maxDbfs,
      waveformBins: ANT_AUDIO_PLATE_TIMELINE_PRESET.waveformBins
    });
    channelsOverview[name] = freeze({
      waveform: freeze({ bins: buildAnchoredWaveform(samples, renderAnchors,
        simulationStartMs, simulationEndMs, ANT_AUDIO_PLATE_TIMELINE_PRESET.waveformBins),
        amplitudeRange: [-1, 1] }),
      spectrogram: compressSpectrogram(analyzed.spectrogram, renderAnchors,
        simulationStartMs, durationSeconds),
      sampleCount: samples.length
    });
  }
  const zooms = zoomSelections.map(window => buildTimelineZoom({ window,
    channels: { left, right }, sampleRate, anchors: renderAnchors, events, timeline, births,
    startPlateCount: statePlateCount(evidence.startState) ?? 0 }));
  return freeze({
    presetId: ANT_AUDIO_PLATE_TIMELINE_PRESET.id,
    seed: evidence.seed,
    simulationStartMs,
    simulationEndMs,
    simulationDurationSeconds: durationSeconds,
    wallDurationSeconds: evidence.wallDurationSeconds,
    audioContextDurationSeconds: evidence.end.audioContextDurationSeconds,
    sampleRate,
    sampleCount: left.length,
    pcmDurationSeconds: left.length / sampleRate,
    clockAnchors: freeze(rawAnchors),
    channels: freeze(channelsOverview),
    events: freeze(events),
    births: freeze(births),
    contacts: freeze(contacts),
    contactBuckets: freeze(contactBuckets),
    timeline: freeze(timeline),
    snapshots: freeze(snapshots),
    zooms: freeze(zooms),
    clockHealth,
    audioMetrics,
    validation,
    rendering: ANT_AUDIO_PLATE_TIMELINE_PRESET
  });
}

export function selectTimelineZoomWindows({ durationSeconds, simulationStartMs = 0, events = [],
  contactBuckets = [], anchors, sampleCount, sampleRate } = {}) {
  const durationAudio = ANT_AUDIO_PLATE_TIMELINE_PRESET.zoomDurationAudioSeconds;
  const frameCount = Math.round(durationAudio * sampleRate);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || sampleCount < frameCount || !anchors?.length) return freeze([]);
  const maxSimulationStart = Math.max(0, durationSeconds - 1 / 60);
  const births = events.filter(event => event.type === 'PLATE_BIRTH');
  const firstBirth = births[0];
  const densestBucket = contactBuckets.reduce((best, bucket) => bucket.groups > (best?.groups ?? -1) ? bucket : best, null);
  const candidates = [
    { start: firstBirth ? (eventTime(firstBirth) - simulationStartMs) / 1000 - durationAudio / 2
      : durationSeconds * 0.35, reason: firstBirth ? 'first Plate-birth neighborhood' : 'midpoint fallback; no Plate birth' },
    { start: densestBucket?.startSeconds ?? 0, reason: 'densest FOOT_CONTACT bucket' },
    { start: durationSeconds - durationAudio, reason: 'late window' }
  ];
  const selected = [];
  for (const candidate of candidates) {
    let result = null;
    const offsets = [0];
    for (let step = durationAudio; step <= durationSeconds + durationAudio; step += durationAudio) offsets.push(step, -step);
    for (const offset of offsets) {
      const requestedStartSeconds = clamp(candidate.start + offset, 0, maxSimulationStart);
      const requestedTimeMs = simulationStartMs + requestedStartSeconds * 1000;
      const startSampleIndex = clamp(Math.floor(simulationTimeToSampleIndex(requestedTimeMs, anchors)),
        0, sampleCount - frameCount);
      const endSampleIndex = startSampleIndex + frameCount;
      const actualSimulationStartMs = sampleIndexToSimulationMs(startSampleIndex, anchors);
      const actualSimulationEndMs = sampleIndexToSimulationMs(endSampleIndex, anchors);
      const overlaps = selected.some(item => actualSimulationStartMs < item.actualSimulationEndMs
        && actualSimulationEndMs > item.actualSimulationStartMs);
      if (!overlaps) {
        result = freeze({ reason: offset === 0 ? candidate.reason
          : `${candidate.reason} (shifted ${offset > 0 ? '+' : ''}${offset.toFixed(1)}s to avoid overlap)`,
          baseStartSeconds: candidate.start, collisionOffsetSeconds: offset, requestedStartSeconds,
          startSampleIndex, endSampleIndex, audioDurationSeconds: durationAudio,
          actualSimulationStartMs, actualSimulationEndMs,
          actualSimulationStartSeconds: (actualSimulationStartMs - simulationStartMs) / 1000,
          actualSimulationEndSeconds: (actualSimulationEndMs - simulationStartMs) / 1000 });
        break;
      }
    }
    if (result) selected.push(result);
  }
  return freeze(selected);
}

export function renderAudioPlateTimeline(canvas, data) {
  if (!canvas?.getContext) throw new TypeError('A canvas is required.');
  if (data?.presetId !== ANT_AUDIO_PLATE_TIMELINE_PRESET.id) throw new TypeError('Timeline data must use the research preset.');
  const preset = ANT_AUDIO_PLATE_TIMELINE_PRESET;
  canvas.width = preset.width; canvas.height = preset.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111'; ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`ANT synchronized audio / Plate timeline · seed ${data.seed} · ${data.simulationDurationSeconds.toFixed(2)} simulated s`, 22, 29);
  ctx.font = '12px sans-serif'; ctx.fillStyle = '#333';
  ctx.fillText(`wall ${data.wallDurationSeconds.toFixed(2)} s · AudioContext ${data.audioContextDurationSeconds.toFixed(2)} s · decoded stereo PCM ${data.pcmDurationSeconds.toFixed(2)} s · output at fixed gain`, 22, 49);
  const x = 205, width = preset.width - x - 30;
  const rows = {
    leftWave: { y: 70, h: 70 }, rightWave: { y: 150, h: 70 },
    leftSpec: { y: 242, h: 294 }, rightSpec: { y: 555, h: 294 },
    contacts: { y: 879, h: 72 }, births: { y: 971, h: 38 }, plates: { y: 1019, h: 76 },
    population: { y: 1105, h: 76 }, activation: { y: 1191, h: 76 }
  };
  drawWaveformPanel(ctx, 'L waveform · ±1', data.channels.left.waveform.bins, x, rows.leftWave.y, width, rows.leftWave.h);
  drawWaveformPanel(ctx, 'R waveform · ±1', data.channels.right.waveform.bins, x, rows.rightWave.y, width, rows.rightWave.h);
  drawSpectrogramPanel(ctx, 'L spectrogram · 0–8 kHz · −100..0 dBFS', data.channels.left.spectrogram, x, rows.leftSpec.y, width, rows.leftSpec.h);
  drawSpectrogramPanel(ctx, 'R spectrogram · 0–8 kHz · −100..0 dBFS', data.channels.right.spectrogram, x, rows.rightSpec.y, width, rows.rightSpec.h);
  drawContactGroups(ctx, data.contactBuckets, x, rows.contacts.y, width, rows.contacts.h);
  drawBirths(ctx, data.births, x, rows.births.y, width, rows.births.h,
    data.simulationDurationSeconds, data.simulationStartMs);
  drawNumericTrace(ctx, [{ simulationTimeMs: data.simulationStartMs, value: 0 },
    ...data.births.map((event, index) => ({ simulationTimeMs: event.simulationTimeMs, value: index + 1 }))],
  x, rows.plates.y, width, rows.plates.h,
  'Plate count (step)', 0, Math.max(1, data.births.length), data.simulationDurationSeconds, true, data.simulationStartMs);
  drawNumericTrace(ctx, data.timeline.map(point => ({ simulationTimeMs: point.simulationTimeMs,
    value: point.population })), x, rows.population.y, width, rows.population.h,
  'Population (10 s samples)', 0, Math.max(1, ...data.timeline.map(point => point.population ?? 0)), data.simulationDurationSeconds, true, data.simulationStartMs);
  drawNumericTrace(ctx, data.timeline.map(point => ({ simulationTimeMs: point.simulationTimeMs,
    value: point.activation })), x, rows.activation.y, width, rows.activation.h,
  'Colony activation', 0, 1, data.simulationDurationSeconds, false, data.simulationStartMs);
  drawSnapshotMarkers(ctx, data.snapshots, x, width, rows.leftWave.y, rows.activation.y + rows.activation.h,
    data.simulationDurationSeconds);
  drawTimeAxis(ctx, x, width, rows.activation.y + rows.activation.h + 21, data.simulationDurationSeconds);
  ctx.fillStyle = '#555'; ctx.font = '11px sans-serif';
  ctx.fillText(`Hann FFT ${preset.fftSize} · hop ${preset.hopSize} · separate stereo · grayscale fixed −100..0 dBFS, gamma 1 · no audio normalization · FOOT_CONTACT row counts event groups per ${preset.bucketSeconds} s; individual feet are separate in metrics`, x, preset.height - 11);
  return canvas;
}

export function renderAudioPlateTimelineZooms(canvas, data) {
  if (!canvas?.getContext) throw new TypeError('A canvas is required.');
  if (data?.presetId !== ANT_AUDIO_PLATE_TIMELINE_PRESET.id) throw new TypeError('Timeline data must use the research preset.');
  const rowHeight = 920, width = 1800;
  if (!data.zooms.length) throw new RangeError('No complete 10-second audio zoom window is available.');
  canvas.width = width; canvas.height = rowHeight * data.zooms.length;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  data.zooms.forEach((zoom, index) => {
    const top = index * rowHeight, x = 125, plotWidth = width - x - 28;
    ctx.fillStyle = '#111'; ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`${zoom.reason} · 10 decoded-audio seconds · simulation ${zoom.actualSimulationStartSeconds.toFixed(2)}–${zoom.actualSimulationEndSeconds.toFixed(2)} s`, 18, top + 23);
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#333';
    ctx.fillText(`FOOT_CONTACT groups ${zoom.contactGroupCount} · individual feet ${zoom.individualFootCount} · Plate births ${zoom.birthCount} · latest 10 s state samples: population ${zoom.stateStart.population}→${zoom.stateEnd.population}, activation ${formatNumber(zoom.stateStart.activation)}→${formatNumber(zoom.stateEnd.activation)} · Plates ${zoom.stateStart.plateCount}→${zoom.stateEnd.plateCount}`, 18, top + 43);
    drawSpectrogramPanel(ctx, 'L', zoom.channels.left.spectrogram, x, top + 60, plotWidth, 270);
    drawSpectrogramPanel(ctx, 'R', zoom.channels.right.spectrogram, x, top + 350, plotWidth, 270);
    drawWaveformPanel(ctx, 'L waveform · ±1', zoom.channels.left.waveform.bins, x, top + 640, plotWidth, 82);
    drawWaveformPanel(ctx, 'R waveform · ±1', zoom.channels.right.waveform.bins, x, top + 733, plotWidth, 82);
    const simStart = zoom.actualSimulationStartMs, simEnd = zoom.actualSimulationEndMs;
    drawZoomEventStrip(ctx, zoom.events, x, plotWidth, top + 826, 20, simStart, simEnd);
    drawTimeAxis(ctx, x, plotWidth, top + 856, zoom.actualSimulationEndSeconds - zoom.actualSimulationStartSeconds,
      zoom.actualSimulationStartSeconds);
  });
  return canvas;
}

function buildContactBuckets(contacts, startMs, endMs) {
  const duration = (endMs - startMs) / 1000;
  const count = Math.ceil(duration / ANT_AUDIO_PLATE_TIMELINE_PRESET.bucketSeconds);
  const buckets = Array.from({ length: count }, (_, index) => ({
    startSeconds: index * ANT_AUDIO_PLATE_TIMELINE_PRESET.bucketSeconds,
    endSeconds: Math.min(duration, (index + 1) * ANT_AUDIO_PLATE_TIMELINE_PRESET.bucketSeconds),
    groups: 0, individualFeet: 0, births: 0
  }));
  for (const event of contacts) {
    const elapsed = (event.simulationTimeMs - startMs) / 1000;
    const index = Math.floor(elapsed / ANT_AUDIO_PLATE_TIMELINE_PRESET.bucketSeconds);
    if (index < 0 || index >= buckets.length) continue;
    buckets[index].groups += 1;
    buckets[index].individualFeet += event.contactCount;
  }
  return buckets;
}

function buildStateSeries(evidence) {
  const rows = [evidence.startState, ...(evidence.timeline || []), evidence.finalState]
    .filter(row => Number.isFinite(row?.simulationTimeMs)).map(row => ({
      simulationTimeMs: row.simulationTimeMs,
      population: Number(row.population ?? row.analysis?.population ?? 0),
      activation: activationValue(row.activation ?? row.analysis?.colonyActivation),
      plateCount: statePlateCount(row) ?? 0,
      exposedPlateCount: row.exposedPlateCount ?? null,
      exposedCellCount: row.layerSummary?.exposedCellCount ?? row.exposedCellCount ?? null,
      buriedLayerCellCount: row.layerSummary?.buriedLayerCellCount ?? row.buriedLayerCellCount ?? null,
      maxColumnLayerCount: row.layerSummary?.maxColumnLayerCount ?? row.maxColumnLayerCount ?? null,
      sampleTimeLabel: row === evidence.startState ? 'run start' : row === evidence.finalState ? 'run end' : '10 s cadence'
    })).sort((a, b) => a.simulationTimeMs - b.simulationTimeMs);
  const byTime = new Map();
  for (const row of rows) byTime.set(row.simulationTimeMs, row);
  return Array.from(byTime.values());
}

function buildAudioMetrics({ channels, sampleRate, durationSeconds, simulationStartMs, simulationEndMs,
  anchors, contacts, births, timeline, contactBuckets, startPlateCount }) {
  const overall = scanStereo(channels.left, channels.right, 0, channels.left.length);
  const buckets = contactBuckets.map((bucket, index) => {
    const startMs = simulationStartMs + bucket.startSeconds * 1000;
    const endMs = simulationStartMs + bucket.endSeconds * 1000;
    const startSampleIndex = clamp(Math.floor(simulationTimeToSampleIndex(startMs, anchors)), 0, channels.left.length);
    const endSampleIndex = clamp(Math.ceil(simulationTimeToSampleIndex(endMs, anchors)), startSampleIndex, channels.left.length);
    const audio = scanStereo(channels.left, channels.right, startSampleIndex, endSampleIndex);
    const bucketEvents = births.filter(event => event.simulationTimeMs >= startMs && event.simulationTimeMs < endMs);
    const state = stateAt(timeline, endMs);
    return freeze({ index, startSeconds: bucket.startSeconds, endSeconds: bucket.endSeconds,
      footContactGroups: bucket.groups, individualFootContacts: bucket.individualFeet,
      plateBirths: bucketEvents.length,
      plateCount: startPlateCount + births.filter(event => event.simulationTimeMs <= endMs).length,
      population: state.population, activation: state.activation, stateSampleTimeMs: state.simulationTimeMs,
      audioSampleRange: [startSampleIndex, endSampleIndex], audioDurationSeconds: (endSampleIndex - startSampleIndex) / sampleRate,
      stereoRms: audio.stereoRms, stereoPeak: audio.stereoPeak,
      leftRms: audio.leftRms, rightRms: audio.rightRms,
      leftPeak: audio.leftPeak, rightPeak: audio.rightPeak,
      nonFiniteSamples: audio.nonFiniteSamples });
  });
  const noBirthBuckets = buckets.filter(bucket => bucket.plateBirths === 0);
  const firstBirth = births[0] ?? null;
  const firstBirthBucket = firstBirth ? buckets.find(bucket => firstBirth.simulationTimeMs >= simulationStartMs + bucket.startSeconds * 1000
    && firstBirth.simulationTimeMs < simulationStartMs + bucket.endSeconds * 1000) : null;
  const priorBucket = firstBirthBucket ? buckets[firstBirthBucket.index - 1] ?? null : null;
  const nextBucket = firstBirthBucket ? buckets[firstBirthBucket.index + 1] ?? null : null;
  return freeze({
    wholeRun: freeze({
      frameCount: overall.frameCount, durationSeconds: overall.frameCount / sampleRate,
      stereoRms: overall.stereoRms, stereoPeak: overall.stereoPeak,
      leftRms: overall.leftRms, rightRms: overall.rightRms,
      leftPeak: overall.leftPeak, rightPeak: overall.rightPeak,
      nonFiniteSamples: overall.nonFiniteSamples,
      samplesAtOrAboveUnity: overall.samplesAtOrAboveUnity
    }),
    tenSecondBuckets: freeze(buckets),
    descriptiveCorrespondence: freeze({
      bucketCount: buckets.length,
      pearsonContactGroupsVsStereoRms: pearson(buckets.map(row => row.footContactGroups), buckets.map(row => row.stereoRms)),
      pearsonPlateCountVsStereoRms: pearson(buckets.map(row => row.plateCount), buckets.map(row => row.stereoRms)),
      pearsonPopulationVsStereoRms: pearson(buckets.map(row => row.population), buckets.map(row => row.stereoRms)),
      noBirthBucketCount: noBirthBuckets.length,
      noBirthBucketsWithAudio: noBirthBuckets.filter(bucket => (bucket.stereoRms ?? 0) > 0).length,
      firstBirthBucket: firstBirthBucket ? { startSeconds: firstBirthBucket.startSeconds,
        footContactGroups: firstBirthBucket.footContactGroups,
        individualFootContacts: firstBirthBucket.individualFootContacts,
        stereoRms: firstBirthBucket.stereoRms } : null,
      adjacentFirstBirthBuckets: { preceding: priorBucket, following: nextBucket },
      note: 'Descriptive bucket associations only. Plate count is not treated as a causal audio variable.'
    })
  });
}

function buildClockHealth(evidence, anchors, sampleCount, sampleRate) {
  const simSeconds = (evidence.end.simulationEndMs - evidence.end.simulationStartMs) / 1000;
  const wallSeconds = evidence.wallDurationSeconds;
  const contextSeconds = evidence.end.audioContextDurationSeconds;
  const pcmSeconds = sampleCount / sampleRate;
  const intervals = anchors.slice(1).map((right, index) => {
    const left = anchors[index];
    const ds = (right.simulationTimeMs - left.simulationTimeMs) / 1000;
    const dw = (right.wallElapsedMs - left.wallElapsedMs) / 1000;
    const da = right.audioContextTimeSeconds - left.audioContextTimeSeconds;
    const dn = (right.audioSampleIndex - left.audioSampleIndex) / sampleRate;
    return { startSimulationTimeMs: left.simulationTimeMs, endSimulationTimeMs: right.simulationTimeMs,
      simulationSeconds: ds, wallSeconds: dw, audioContextSeconds: da, sampleSeconds: dn,
      simulationPerWall: dw > 0 ? ds / dw : null,
      audioPerSimulation: ds > 0 ? da / ds : null,
      audioPerWall: dw > 0 ? da / dw : null,
      noAudioAdvance: da === 0 || right.audioSampleIndex === left.audioSampleIndex };
  });
  const tenSecond = [];
  for (let start = evidence.end.simulationStartMs; start < evidence.end.simulationEndMs; start += 10000) {
    const end = Math.min(evidence.end.simulationEndMs, start + 10000);
    const audioStart = simulationTimeToSampleIndex(start, anchors) / sampleRate;
    const audioEnd = simulationTimeToSampleIndex(end, anchors) / sampleRate;
    const wallStart = interpolateAnchors(anchors, 'simulationTimeMs', 'wallElapsedMs', start) / 1000;
    const wallEnd = interpolateAnchors(anchors, 'simulationTimeMs', 'wallElapsedMs', end) / 1000;
    tenSecond.push({ simulationStartSeconds: (start - evidence.end.simulationStartMs) / 1000,
      simulationEndSeconds: (end - evidence.end.simulationStartMs) / 1000,
      wallSeconds: wallEnd - wallStart, audioContextSeconds: audioEnd - audioStart,
      audioSampleRange: [Math.round(audioStart * sampleRate), Math.round(audioEnd * sampleRate)],
      audioContextPerSimulation: (audioEnd - audioStart) / ((end - start) / 1000) });
  }
  return freeze({ simulationElapsedSeconds: simSeconds, wallElapsedSeconds: wallSeconds,
    audioContextElapsedSeconds: contextSeconds, decodedPcmDurationSeconds: pcmSeconds,
    simulationPerWallRatio: wallSeconds ? simSeconds / wallSeconds : null,
    audioContextPerSimulationRatio: simSeconds ? contextSeconds / simSeconds : null,
    audioContextPerWallRatio: wallSeconds ? contextSeconds / wallSeconds : null,
    simulationMinusWallSeconds: simSeconds - wallSeconds,
    simulationMinusAudioContextSeconds: simSeconds - contextSeconds,
    audioContextMinusPcmSeconds: contextSeconds - pcmSeconds,
    noAudioAdvanceIntervals: freeze(intervals.filter(interval => interval.noAudioAdvance)),
    tenSecondClockIntervals: freeze(tenSecond),
    maximumSimulationAnchorGapSeconds: Math.max(0, ...intervals.map(interval => interval.simulationSeconds)),
    maximumWallAnchorGapSeconds: Math.max(0, ...intervals.map(interval => interval.wallSeconds)),
    maximumAudioContextAnchorGapSeconds: Math.max(0, ...intervals.map(interval => interval.audioContextSeconds)),
    terminalSampleOffsetSamples: anchors.at(-1).audioSampleIndex - sampleCount,
    interpretation: 'All clocks remain in native units. PCM is not stretched or retimed; ratios and intervals describe clock divergence.' });
}

function buildTimelineZoom({ window, channels, sampleRate, anchors, events, timeline, births, startPlateCount }) {
  const start = window.startSampleIndex, end = window.endSampleIndex;
  const actualStart = window.actualSimulationStartMs, actualEnd = window.actualSimulationEndMs;
  const zoomChannels = {};
  for (const name of ['left', 'right']) {
    const samples = channels[name].subarray(start, end);
    const analyzed = buildAudioSnapshot(samples, {
      sampleRate,
      fftSize: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.fftSize,
      hopSize: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.hopSize,
      maxFrequencyHz: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.frequencyMaxHz,
      minDbfs: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.minDbfs,
      maxDbfs: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.maxDbfs,
      waveformBins: 1100
    });
    zoomChannels[name] = freeze({
      waveform: freeze({ bins: buildAnchoredWaveform(samples,
        anchors.map(anchor => ({ ...anchor, audioSampleIndex: anchor.audioSampleIndex - start })),
        actualStart, actualEnd, 1100), amplitudeRange: [-1, 1] }),
      spectrogram: compressSpectrogram(analyzed.spectrogram,
        anchors.map(anchor => ({ ...anchor, audioSampleIndex: anchor.audioSampleIndex - start })),
        actualStart, (actualEnd - actualStart) / 1000, 1100, 270)
    });
  }
  const zoomEvents = events.filter(event => event.simulationTimeMs >= actualStart && event.simulationTimeMs <= actualEnd);
  const contacts = zoomEvents.filter(event => event.type === 'FOOT_CONTACT');
  const zoomBirths = zoomEvents.filter(event => event.type === 'PLATE_BIRTH');
  const stateAtWindow = timeMs => ({ ...stateAt(timeline, timeMs), plateCount: startPlateCount
    + births.filter(event => event.simulationTimeMs <= timeMs).length });
  return freeze({ ...window, channels: freeze(zoomChannels), events: freeze(zoomEvents),
    actualSimulationStartSeconds: window.actualSimulationStartSeconds,
    actualSimulationEndSeconds: window.actualSimulationEndSeconds,
    contactGroupCount: contacts.length,
    individualFootCount: contacts.reduce((sum, event) => sum + event.contactCount, 0),
    birthCount: zoomBirths.length,
    stateStart: stateAtWindow(actualStart), stateEnd: stateAtWindow(actualEnd) });
}

function buildAnchoredWaveform(samples, anchors, startMs, endMs, binCount) {
  const bins = [];
  for (let bin = 0; bin < binCount; bin += 1) {
    const fromMs = startMs + (endMs - startMs) * bin / binCount;
    const toMs = startMs + (endMs - startMs) * (bin + 1) / binCount;
    const from = clamp(Math.floor(simulationTimeToSampleIndex(fromMs, anchors)), 0, samples.length);
    const to = clamp(Math.ceil(simulationTimeToSampleIndex(toMs, anchors)), from, samples.length);
    let min = Infinity, max = -Infinity;
    for (let index = from; index < to; index += 1) {
      const value = samples[index];
      if (!Number.isFinite(value)) continue;
      min = Math.min(min, value); max = Math.max(max, value);
    }
    bins.push(freeze({ min: min === Infinity ? null : min, max: max === -Infinity ? null : max }));
  }
  return freeze(bins);
}

function compressSpectrogram(spectrogram, anchors, simulationStartMs, durationSeconds,
  width = ANT_AUDIO_PLATE_TIMELINE_PRESET.spectrogramWidth,
  height = ANT_AUDIO_PLATE_TIMELINE_PRESET.spectrogramHeight) {
  const { frameCount, frequencyBins, dbfs, hopSize, fftSize } = spectrogram;
  const pixels = new Uint8Array(width * height);
  pixels.fill(stratigraphyLuminanceForDbfs(ANT_AUDIO_PLATE_TIMELINE_PRESET.minDbfs));
  for (let frame = 0; frame < frameCount; frame += 1) {
    const sampleIndex = frame * hopSize + fftSize / 2;
    const simulationTimeMs = sampleIndexToSimulationMs(sampleIndex, anchors);
    const x = Math.floor((simulationTimeMs - simulationStartMs) / (durationSeconds * 1000) * width);
    if (x < 0 || x >= width) continue;
    for (let y = 0; y < height; y += 1) {
      const high = Math.max(1, Math.floor((height - y) * frequencyBins / height));
      const low = Math.floor((height - y - 1) * frequencyBins / height);
      let peak = ANT_AUDIO_PLATE_TIMELINE_PRESET.minDbfs;
      for (let frequency = low; frequency < high; frequency += 1) {
        peak = Math.max(peak, dbfs[frame * frequencyBins + frequency]);
      }
      const index = y * width + x;
      const luminance = stratigraphyLuminanceForDbfs(peak);
      if (luminance > pixels[index]) pixels[index] = luminance;
    }
  }
  return freeze({ width, height, luminance: pixels, rangeDbfs: [-100, 0],
    aggregation: 'maximum fixed-dBFS FFT frame value per simulation-time pixel column and frequency row' });
}

function reconcileSmallTerminalCodecOffset(anchors, sampleCount, sampleRate) {
  const output = anchors.map(anchor => ({ ...anchor }));
  const last = output.at(-1), previous = output.at(-2);
  if (Math.abs(last.audioSampleIndex - sampleCount) <= sampleRate * 0.1
      && sampleCount >= previous.audioSampleIndex) last.audioSampleIndex = sampleCount;
  return output;
}

function scanStereo(left, right, start, end) {
  let leftSquare = 0, rightSquare = 0, leftPeak = 0, rightPeak = 0;
  let nonFiniteSamples = 0, samplesAtOrAboveUnity = 0, frames = 0;
  for (let index = start; index < end; index += 1) {
    const l = left[index], r = right[index];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { nonFiniteSamples += (!Number.isFinite(l) ? 1 : 0) + (!Number.isFinite(r) ? 1 : 0); continue; }
    leftSquare += l * l; rightSquare += r * r;
    leftPeak = Math.max(leftPeak, Math.abs(l)); rightPeak = Math.max(rightPeak, Math.abs(r));
    if (Math.abs(l) >= 1) samplesAtOrAboveUnity += 1;
    if (Math.abs(r) >= 1) samplesAtOrAboveUnity += 1;
    frames += 1;
  }
  const leftRms = frames ? Math.sqrt(leftSquare / frames) : null;
  const rightRms = frames ? Math.sqrt(rightSquare / frames) : null;
  return { frameCount: frames, leftRms, rightRms,
    stereoRms: frames ? Math.sqrt((leftSquare + rightSquare) / (2 * frames)) : null,
    leftPeak: frames ? leftPeak : null, rightPeak: frames ? rightPeak : null,
    stereoPeak: frames ? Math.max(leftPeak, rightPeak) : null,
    nonFiniteSamples, samplesAtOrAboveUnity };
}

function drawWaveformPanel(ctx, label, bins, x, y, width, height) {
  drawRowLabel(ctx, label, y + 15);
  ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1;
  const center = y + height / 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.moveTo(x, center); ctx.lineTo(x + width, center);
  ctx.moveTo(x, y + height); ctx.lineTo(x + width, y + height); ctx.stroke();
  ctx.fillStyle = '#444'; ctx.font = '10px sans-serif'; ctx.fillText('+1', x - 26, y + 8); ctx.fillText('0', x - 18, center + 4); ctx.fillText('−1', x - 27, y + height);
  ctx.strokeStyle = '#181818'; ctx.lineWidth = 1; ctx.beginPath();
  for (let index = 0; index < bins.length; index += 1) {
    const bin = bins[index]; if (bin.min === null || bin.max === null) continue;
    const px = x + index / Math.max(1, bins.length - 1) * width;
    const top = y + (1 - clamp(bin.max, -1, 1)) * height / 2;
    const bottom = y + (1 - clamp(bin.min, -1, 1)) * height / 2;
    ctx.moveTo(px, top); ctx.lineTo(px, bottom);
  }
  ctx.stroke();
}

function drawSpectrogramPanel(ctx, label, data, x, y, width, height) {
  drawRowLabel(ctx, label, y + 15);
  const image = ctx.createImageData(data.width, data.height);
  for (let index = 0; index < data.luminance.length; index += 1) {
    const offset = index * 4, value = data.luminance[index];
    image.data[offset] = value; image.data[offset + 1] = value; image.data[offset + 2] = value; image.data[offset + 3] = 255;
  }
  const scratch = document.createElement('canvas'); scratch.width = data.width; scratch.height = data.height;
  scratch.getContext('2d').putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, x, y + 20, width, height - 20);
  ctx.strokeStyle = '#888'; ctx.strokeRect(x, y + 20, width, height - 20);
  ctx.fillStyle = '#333'; ctx.font = '10px sans-serif';
  ctx.fillText('8 kHz', x - 39, y + 27); ctx.fillText('0 Hz', x - 34, y + height - 1);
}

function drawContactGroups(ctx, buckets, x, y, width, height) {
  drawRowLabel(ctx, 'FOOT_CONTACT groups / 10 s', y + 15);
  const max = Math.max(1, ...buckets.map(bucket => bucket.groups));
  ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.fillText('0', x - 16, y + height - 3); ctx.fillText(String(max), x - 28, y + 26);
  ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(x, y + height); ctx.lineTo(x + width, y + height); ctx.stroke();
  const bucketWidth = width / Math.max(1, buckets.length);
  ctx.fillStyle = '#333';
  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index], barHeight = bucket.groups / max * (height - 12);
    ctx.fillRect(x + index * bucketWidth + 1, y + height - barHeight, Math.max(1, bucketWidth - 2), barHeight);
  }
}

function drawBirths(ctx, births, x, y, width, height, durationSeconds, startMs) {
  drawRowLabel(ctx, 'Plate births', y + 15);
  ctx.strokeStyle = '#999'; ctx.beginPath(); ctx.moveTo(x, y + height - 1); ctx.lineTo(x + width, y + height - 1); ctx.stroke();
  const stride = Math.max(1, Math.ceil(births.length / 12));
  for (let index = 0; index < births.length; index += 1) {
    const birth = births[index];
    const px = x + ((birth.simulationTimeMs - startMs) / 1000) / durationSeconds * width;
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, y + 2); ctx.lineTo(px, y + height - 2); ctx.stroke();
    if (index % stride === 0 || index === births.length - 1) {
      ctx.fillStyle = '#111'; ctx.font = '10px sans-serif'; ctx.fillText(birth.label, px + 2, y + 12);
    }
  }
}

function drawZoomEventStrip(ctx, events, x, width, y, height, startMs, endMs) {
  drawRowLabel(ctx, 'FOOT_CONTACT', y + 14);
  ctx.fillStyle = '#f0f0f0'; ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = '#999'; ctx.beginPath(); ctx.moveTo(x, y + height); ctx.lineTo(x + width, y + height); ctx.stroke();
  for (const event of events) {
    if (event.type !== 'FOOT_CONTACT' && event.type !== 'PLATE_BIRTH') continue;
    const px = x + clamp((event.simulationTimeMs - startMs) / Math.max(1, endMs - startMs), 0, 1) * width;
    ctx.strokeStyle = event.type === 'PLATE_BIRTH' ? '#111' : '#777';
    ctx.lineWidth = event.type === 'PLATE_BIRTH' ? 1.5 : 0.7;
    ctx.setLineDash(event.type === 'PLATE_BIRTH' ? [3, 2] : []);
    ctx.beginPath(); ctx.moveTo(px, y + (event.type === 'PLATE_BIRTH' ? 1 : 8));
    ctx.lineTo(px, y + height); ctx.stroke();
    if (event.type === 'PLATE_BIRTH') {
      ctx.setLineDash([]); ctx.fillStyle = '#111'; ctx.font = '9px sans-serif';
      ctx.fillText(event.label, px + 2, y + 8);
    }
  }
  ctx.setLineDash([]);
}

function drawNumericTrace(ctx, rows, x, y, width, height, label, min, max, durationSeconds, step = false, startMs = 0) {
  drawRowLabel(ctx, `${label} [${formatNumber(min)}, ${formatNumber(max)}]`, y + 15);
  ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(x, y + height); ctx.lineTo(x + width, y + height); ctx.moveTo(x, y + 2); ctx.lineTo(x + width, y + 2); ctx.stroke();
  ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.fillText(formatNumber(max), x - 35, y + 9); ctx.fillText(formatNumber(min), x - 35, y + height);
  if (!rows.length || max <= min) return;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.beginPath();
  let started = false, previousX = 0, previousY = 0;
  for (const row of rows) {
    const px = x + clamp(((row.simulationTimeMs - startMs) / 1000) / durationSeconds, 0, 1) * width;
    const py = y + height - clamp((row.value - min) / (max - min), 0, 1) * (height - 4) - 2;
    if (step && started) { ctx.lineTo(px, previousY); ctx.lineTo(px, py); }
    else if (started) ctx.lineTo(px, py);
    else { ctx.moveTo(px, py); started = true; }
    previousX = px; previousY = py;
  }
  if (step && started) ctx.lineTo(x + width, previousY);
  ctx.stroke();
}

function drawSnapshotMarkers(ctx, snapshots, x, width, top, bottom, durationSeconds) {
  const styles = [{ dash: [] }, { dash: [5, 3] }, { dash: [2, 3] }];
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];
    const px = x + clamp(snapshot.simulationSeconds / durationSeconds, 0, 1) * width;
    ctx.save(); ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.setLineDash(styles[index]?.dash || []);
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#111'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(snapshot.label, px + 3, top - 3);
  }
}

function drawTimeAxis(ctx, x, width, y, durationSeconds, offsetSeconds = 0) {
  ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.stroke();
  const step = durationSeconds > 60 ? 30 : 10;
  for (let seconds = 0; seconds <= durationSeconds + 1e-6; seconds += step) {
    const px = x + seconds / durationSeconds * width;
    ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + 5); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.font = '10px sans-serif'; ctx.fillText(`${(offsetSeconds + seconds).toFixed(0)} s`, px - 10, y + 16);
  }
}

function drawRowLabel(ctx, text, y) { ctx.fillStyle = '#222'; ctx.font = '12px sans-serif'; ctx.fillText(text, 20, y); }
function normalizeEvent(event, sourceIndex) {
  const type = eventType(event);
  const simulationTimeMs = eventTime(event);
  const payload = event.payload ?? event;
  return { ...event, sourceIndex, type, simulationTimeMs, payload,
    contactCount: type === 'FOOT_CONTACT'
      ? (Array.isArray(payload.contacts) ? payload.contacts.length : Number(payload.contactCount ?? 1)) : 0 };
}
function eventType(event) {
  const raw = String(event?.type ?? event?.eventType ?? '').toUpperCase().replaceAll('-', '_');
  if (raw.includes('FOOT_CONTACT')) return 'FOOT_CONTACT';
  if (raw.includes('PLATE') && (raw.includes('BIRTH') || raw.includes('ADD'))) return 'PLATE_BIRTH';
  if (raw.includes('PLATE') && (raw.includes('REMOVE') || raw.includes('ERODE'))) return 'PLATE_REMOVAL';
  if (raw.includes('SPHERE') || raw.includes('NODULE')) return 'SPHERE_BIRTH';
  return raw;
}
function eventTime(event) { return Number(event?.simulationTimeMs ?? event?.timeMs ?? event?.simulationTime * 1000); }
function statePlateCount(row) { return Number.isFinite(row?.layerCount) ? row.layerCount
  : Number.isFinite(row?.plateCount) ? row.plateCount
    : Number.isFinite(row?.layerSummary?.plateCount) ? row.layerSummary.plateCount : null; }
function activationValue(value) { return Number.isFinite(value) ? value
  : Number.isFinite(value?.activation) ? value.activation : null; }
function stateAt(rows, timeMs) {
  let best = rows[0] || { simulationTimeMs: timeMs, population: 0, activation: 0, plateCount: 0 };
  for (const row of rows) { if (row.simulationTimeMs > timeMs) break; best = row; }
  return best;
}
function simulationTimeToSampleIndex(timeMs, anchors) {
  if (timeMs <= anchors[0].simulationTimeMs) return anchors[0].audioSampleIndex;
  for (let index = 1; index < anchors.length; index += 1) {
    const left = anchors[index - 1], right = anchors[index];
    if (timeMs <= right.simulationTimeMs) {
      const portion = (timeMs - left.simulationTimeMs) / (right.simulationTimeMs - left.simulationTimeMs);
      return left.audioSampleIndex + portion * (right.audioSampleIndex - left.audioSampleIndex);
    }
  }
  return anchors.at(-1).audioSampleIndex;
}
function sampleIndexToSimulationMs(sampleIndex, anchors) {
  if (sampleIndex <= anchors[0].audioSampleIndex) return anchors[0].simulationTimeMs;
  for (let index = 1; index < anchors.length; index += 1) {
    const left = anchors[index - 1], right = anchors[index];
    if (right.audioSampleIndex === left.audioSampleIndex) continue;
    if (sampleIndex <= right.audioSampleIndex) {
      const portion = (sampleIndex - left.audioSampleIndex) / (right.audioSampleIndex - left.audioSampleIndex);
      return left.simulationTimeMs + portion * (right.simulationTimeMs - left.simulationTimeMs);
    }
  }
  return anchors.at(-1).simulationTimeMs;
}
function interpolateAnchors(anchors, fromKey, toKey, value) {
  if (value <= anchors[0][fromKey]) return anchors[0][toKey];
  for (let index = 1; index < anchors.length; index += 1) {
    const left = anchors[index - 1], right = anchors[index];
    if (value <= right[fromKey]) {
      const portion = (value - left[fromKey]) / (right[fromKey] - left[fromKey]);
      return left[toKey] + portion * (right[toKey] - left[toKey]);
    }
  }
  return anchors.at(-1)[toKey];
}
function isStrictlyIncreasing(rows, key) { return rows.every((row, index) => Number.isFinite(row[key])
  && (index === 0 || row[key] > rows[index - 1][key])); }
function isNondecreasing(rows, key) { return rows.every((row, index) => Number.isFinite(row[key])
  && (index === 0 || row[key] >= rows[index - 1][key])); }
function pearson(a, b) {
  const pairs = a.map((value, index) => [value, b[index]]).filter(pair => pair.every(Number.isFinite));
  if (pairs.length < 2) return null;
  const meanA = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const meanB = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let numerator = 0, aa = 0, bb = 0;
  for (const [left, right] of pairs) { const da = left - meanA, db = right - meanB; numerator += da * db; aa += da * da; bb += db * db; }
  return aa && bb ? numerator / Math.sqrt(aa * bb) : null;
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function formatNumber(value) { return Number.isFinite(value) ? Number(value).toFixed(value < 1 && value !== 0 ? 3 : 0) : 'n/a'; }
