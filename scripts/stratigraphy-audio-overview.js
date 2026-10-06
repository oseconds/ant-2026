import {
  buildAudioSnapshot,
  STRATIGRAPHY_AUDIO_PRESET,
  stratigraphyLuminanceForDbfs
} from './audio-snapshot-renderer.js';

const freeze = value => Object.freeze(value);

/** Fixed canvas and signal-analysis settings for full-run overview and 10 s detail panels. */
export const STRATIGRAPHY_AUDIO_OVERVIEW_PRESET = freeze({
  id: 'ant-stratigraphy-audio-overview-v1',
  width: 1800,
  height: 1200,
  fftSize: STRATIGRAPHY_AUDIO_PRESET.fftSize,
  window: STRATIGRAPHY_AUDIO_PRESET.window,
  hopSize: STRATIGRAPHY_AUDIO_PRESET.hopSize,
  frequencyMinHz: 0,
  frequencyMaxHz: 8000,
  minDbfs: -100,
  maxDbfs: 0,
  gamma: 1,
  waveformAmplitudeMin: -1,
  waveformAmplitudeMax: 1,
  waveformBackgroundLuminance: STRATIGRAPHY_AUDIO_PRESET.waveformBackgroundLuminance,
  waveformLineLuminance: STRATIGRAPHY_AUDIO_PRESET.waveformLineLuminance,
  waveformAxisLuminance: STRATIGRAPHY_AUDIO_PRESET.waveformAxisLuminance,
  waveformLineWidth: STRATIGRAPHY_AUDIO_PRESET.waveformLineWidth,
  channelMode: 'separate L/R',
  contactBucketSeconds: 10,
  contactStripHeightPx: 28,
  contactCountAtFullHeight: 2400,
  spectrogramWidth: 1760,
  spectrogramHeightPerChannel: 326,
  zoom: freeze({
    durationSeconds: 10,
    width: 1200,
    height: 1000,
    waveformAmplitudeMin: -1,
    waveformAmplitudeMax: 1,
    waveformBackgroundLuminance: STRATIGRAPHY_AUDIO_PRESET.waveformBackgroundLuminance,
    waveformLineLuminance: STRATIGRAPHY_AUDIO_PRESET.waveformLineLuminance,
    waveformAxisLuminance: STRATIGRAPHY_AUDIO_PRESET.waveformAxisLuminance,
    waveformLineWidth: STRATIGRAPHY_AUDIO_PRESET.waveformLineWidth,
    minDbfs: -100,
    maxDbfs: 0,
    fftSize: STRATIGRAPHY_AUDIO_PRESET.fftSize,
    window: STRATIGRAPHY_AUDIO_PRESET.window,
    hopSize: STRATIGRAPHY_AUDIO_PRESET.hopSize,
    frequencyMinHz: 0,
    frequencyMaxHz: 8000,
    gamma: 1,
    note: 'Each detail window is analyzed at the same fixed scale; no peak normalization or padding.'
  }),
  spectrogramAggregation: 'maximum fixed-dBFS frame value per overview pixel column and frequency row',
  contactScale: '2400 individual FOOT_CONTACT contacts per 10-second bucket fills the fixed 28-pixel strip',
  grayscale: 'fixed linear mapping from -100..0 dBFS; gamma 1; no content normalization',
  zoomSelection: freeze({
    180: freeze(['0-10 s', '85-95 s', '170-180 s']),
    600: freeze(['0-10 s', 'first plate-birth neighborhood', 'densest contact bucket', '590-600 s'])
  })
});

/**
 * Build a bounded-size overview from one actual continuous stereo recording.
 * PCM must cover the entire simulation; clock anchors map simulation time to sample index.
 */
export function buildStratigraphyAudioOverview({
  channels,
  sampleRate,
  simulationDurationSeconds,
  clockAnchors,
  events = []
} = {}) {
  const left = channels?.left ?? channels?.[0];
  const right = channels?.right ?? channels?.[1];
  if (!left || !right || typeof left.length !== 'number' || typeof right.length !== 'number') {
    throw new TypeError('A continuous stereo recording with left and right PCM channels is required.');
  }
  if (left.length !== right.length || left.length < 1) throw new RangeError('Stereo channels must have the same non-zero sample count.');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be positive.');
  if (!Number.isFinite(simulationDurationSeconds) || simulationDurationSeconds <= 0) {
    throw new RangeError('simulationDurationSeconds must be positive.');
  }
  validateAnchors(clockAnchors, left.length, simulationDurationSeconds);
  if (!Array.isArray(events)) throw new TypeError('events must be an array.');

  const analysisOptions = {
    sampleRate,
    fftSize: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.fftSize,
    hopSize: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.hopSize,
    maxFrequencyHz: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.frequencyMaxHz,
    minDbfs: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.minDbfs,
    maxDbfs: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.maxDbfs,
    waveformBins: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.spectrogramWidth
  };
  const width = STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.spectrogramWidth;
  const height = STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.spectrogramHeightPerChannel;
  const channelOverview = {};
  for (const [name, samples] of [['left', left], ['right', right]]) {
    const analyzed = buildAudioSnapshot(samples, analysisOptions);
    channelOverview[name] = freeze({
      waveform: buildAnchoredWaveform(samples, clockAnchors, simulationDurationSeconds, width),
      spectrogram: compressSpectrogram(analyzed.spectrogram, width, height, clockAnchors, simulationDurationSeconds),
      sampleCount: samples.length
    });
  }

  const normalizedEvents = events.map(normalizeEvent).sort((a, b) => a.simulationTimeMs - b.simulationTimeMs);
  const contacts = normalizedEvents.filter(event => event.type === 'FOOT_CONTACT');
  let layerCount = 0;
  let plateIndex = 0;
  const layerEvents = normalizedEvents.map(event => {
    if (event.type === 'PLATE_BIRTH') {
      const previous = layerCount++;
      plateIndex += 1;
      return freeze({ ...event, label: event.label || `P${plateIndex}`, layerChange: `${previous}→${layerCount}` });
    }
    if (event.type === 'PLATE_REMOVAL') {
      const previous = layerCount;
      layerCount = Math.max(0, layerCount - 1);
      return freeze({ ...event, layerChange: `${previous}→${layerCount}` });
    }
    return event;
  });
  const plateBirths = layerEvents.filter(event => event.type === 'PLATE_BIRTH');
  const plateRemovals = layerEvents.filter(event => event.type === 'PLATE_REMOVAL');
  const contactBuckets = makeContactBuckets(contacts, simulationDurationSeconds);
  const zoomWindows = selectStratigraphyAudioZoomWindows({ simulationDurationSeconds, events: normalizedEvents });
  const zooms = zoomWindows.map(window => buildZoom(window, { left, right }, sampleRate, clockAnchors, normalizedEvents));

  return freeze({
    presetId: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.id,
    sampleRate,
    sampleCount: left.length,
    sourceDurationSeconds: left.length / sampleRate,
    simulationDurationSeconds,
    clockAnchors: clockAnchors.map(anchor => freeze({ ...anchor })),
    channels: freeze(channelOverview),
    contactBuckets,
    events: freeze(normalizedEvents),
    overlays: freeze({
      plateBirths: freeze(plateBirths),
      plateRemovals: freeze(plateRemovals),
      zoomWindows: freeze(zoomWindows),
      zooms: freeze(zooms)
    }),
    rendering: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET
  });
}

/** Select deterministic 10-second windows covering early, birth/dense, and late material. */
export function selectStratigraphyAudioZoomWindows({ simulationDurationSeconds, events = [] } = {}) {
  if (!Number.isFinite(simulationDurationSeconds) || simulationDurationSeconds <= 0) {
    throw new RangeError('simulationDurationSeconds must be positive.');
  }
  const duration = 10;
  const maxStart = Math.max(0, simulationDurationSeconds - duration);
  const clampStart = value => Math.min(maxStart, Math.max(0, value));
  if (simulationDurationSeconds <= 180) {
    return freeze([0, simulationDurationSeconds / 2 - duration / 2, maxStart]
      .map((start, index) => freeze({ startSeconds: clampStart(start), endSeconds: clampStart(start) + duration,
        reason: ['early', 'middle', 'late'][index] })));
  }

  const contacts = events.map(normalizeEvent).filter(event => event.type === 'FOOT_CONTACT');
  const births = events.map(normalizeEvent).filter(event => event.type === 'PLATE_BIRTH');
  const buckets = makeContactBuckets(contacts, simulationDurationSeconds);
  const densest = buckets.reduce((best, current) => current.count > best.count ? current : best,
    buckets[0] || { startSeconds: 0, count: 0 });
  const birthStart = births.length ? clampStart(births[0].simulationTimeMs / 1000 - duration / 2) : clampStart(simulationDurationSeconds * .35);
  let candidates = [
    { startSeconds: 0, reason: 'early' },
    { startSeconds: birthStart, reason: births.length ? 'first plate birth' : 'early-mid fallback' },
    { startSeconds: clampStart(densest.startSeconds + duration / 2 - duration / 2), reason: 'densest FOOT_CONTACT bucket' },
    { startSeconds: maxStart, reason: 'late' }
  ];
  // Keep all four deterministic windows useful when one event neighborhood collides with an endpoint.
  const selected = [];
  for (const candidate of candidates) {
    candidate.startSeconds = clampStart(candidate.startSeconds);
    if (selected.some(item => Math.abs(item.startSeconds - candidate.startSeconds) < duration)) {
      const alternatives = [candidate.startSeconds + duration, candidate.startSeconds - duration]
        .map(clampStart).filter(value => selected.every(item => Math.abs(item.startSeconds - value) >= duration));
      if (alternatives.length) candidate.startSeconds = alternatives[0];
    }
    if (!selected.some(item => item.startSeconds === candidate.startSeconds)) selected.push(candidate);
  }
  return freeze(selected.map(item => freeze({ ...item, endSeconds: item.startSeconds + duration })));
}

/** Render a constant-size overview; the x axis always spans the complete simulation. */
export function renderStratigraphyAudioOverview(canvas, overview) {
  if (!canvas?.getContext) throw new TypeError('A canvas is required.');
  if (overview?.presetId !== STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.id) throw new TypeError('Overview must use the frozen full-run preset.');
  canvas.width = STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.width;
  canvas.height = STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111'; ctx.font = '16px sans-serif';
  ctx.fillText(`ANT stratigraphy audio · continuous ${overview.simulationDurationSeconds.toFixed(1)} s run · fixed dBFS scale`, 20, 24);
  const x0 = 120, plotWidth = 1640;
  const waveTop = 42, waveHeight = 82;
  const leftSpecTop = 154, specHeight = 326;
  const rightSpecTop = 522;
  const contactTop = 900, contactHeight = STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.contactStripHeightPx;
  drawWaveform(ctx, overview.channels.left.waveform, x0, waveTop, plotWidth, waveHeight);
  drawSpectrogram(ctx, overview.channels.left.spectrogram, x0, leftSpecTop, plotWidth, specHeight);
  drawSpectrogram(ctx, overview.channels.right.spectrogram, x0, rightSpecTop, plotWidth, specHeight);
  ctx.fillStyle = '#222'; ctx.font = '12px sans-serif';
  ctx.fillText('L waveform', 20, waveTop + 14); ctx.fillText('L spectrogram', 20, leftSpecTop + 14);
  ctx.fillText('R spectrogram', 20, rightSpecTop + 14); ctx.fillText('FOOT_CONTACT / 10 s', 20, contactTop + 18);
  drawEventOverlays(ctx, overview, x0, plotWidth, leftSpecTop, contactTop + contactHeight,
    overview.simulationDurationSeconds, waveTop + waveHeight + 2);
  drawContactStrip(ctx, overview.contactBuckets, x0, contactTop, plotWidth, contactHeight);
  drawTimeAxis(ctx, x0, plotWidth, contactTop + contactHeight + 12, overview.simulationDurationSeconds);
  ctx.fillStyle = '#555'; ctx.font = '10px sans-serif';
  ctx.fillText('Hann FFT 1024 · hop 256 · 0–8000 Hz · −100..0 dBFS · gamma 1 · fixed scale · no content normalization', x0, 1180);
  return canvas;
}

/** Render one or more fixed-scale 10-second details, all with identical dimensions and axes. */
export function renderStratigraphyAudioZooms(canvas, overview, zoomIndices = null) {
  if (!canvas?.getContext) throw new TypeError('A canvas is required.');
  if (overview?.presetId !== STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.id) throw new TypeError('Overview must use the frozen full-run preset.');
  const chosen = zoomIndices ? zoomIndices.map(index => overview.overlays.zooms[index]).filter(Boolean) : overview.overlays.zooms;
  if (!chosen.length) throw new RangeError('At least one zoom window is required.');
  const width = STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.width;
  const rowHeight = STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.height;
  canvas.width = width;
  canvas.height = rowHeight * chosen.length;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < chosen.length; row += 1) {
    const zoom = chosen[row];
    const top = row * rowHeight;
    ctx.fillStyle = '#111'; ctx.font = '14px sans-serif';
    ctx.fillText(`${zoom.reason} · ${zoom.startSeconds.toFixed(2)}–${zoom.endSeconds.toFixed(2)} s`, 12, top + 18);
    const specW = width - 100, specH = 350;
    drawSpectrogram(ctx, zoom.channels.left.spectrogram, 78, top + 32, specW, specH);
    drawSpectrogram(ctx, zoom.channels.right.spectrogram, 78, top + 405, specW, specH);
    drawWaveform(ctx, zoom.channels.left.waveform, 78, top + 770, specW, 74);
    drawWaveform(ctx, zoom.channels.right.waveform, 78, top + 862, specW, 74);
    ctx.fillStyle = '#333'; ctx.font = '11px sans-serif';
    ctx.fillText('L 0–8000 Hz', 8, top + 50); ctx.fillText('R 0–8000 Hz', 8, top + 423);
    ctx.fillText('L waveform ±1', 8, top + 786); ctx.fillText('R waveform ±1', 8, top + 878);
    drawZoomEventTicks(ctx, zoom.events, 78, top + 32, specW, 10, zoom.startSeconds);
    drawTimeAxis(ctx, 78, specW, top + 962, 10, zoom.startSeconds);
  }
  return canvas;
}

/** Decode uncompressed IEEE-float32 stereo WAV PCM into planar channels. */
export function decodeStereoFloatWav(input) {
  const bytes = input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : null;
  if (!bytes || bytes.byteLength < 44) throw new TypeError('A complete WAV byte buffer is required.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readTag = offset => String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  if (readTag(0) !== 'RIFF' || readTag(8) !== 'WAVE') throw new TypeError('Expected a RIFF/WAVE file.');
  let format = null, dataOffset = -1, dataSize = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const tag = readTag(offset), size = view.getUint32(offset + 4, true), body = offset + 8;
    if (body + size > bytes.byteLength) throw new RangeError('WAV chunk extends beyond its byte buffer.');
    if (tag === 'fmt ') {
      if (size < 16) throw new RangeError('WAV format chunk is incomplete.');
      format = {
        audioFormat: view.getUint16(body, true), channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true), blockAlign: view.getUint16(body + 12, true),
        bitsPerSample: view.getUint16(body + 14, true)
      };
    } else if (tag === 'data' && dataOffset < 0) {
      dataOffset = body; dataSize = size;
    }
    offset = body + size + (size & 1);
  }
  if (!format || dataOffset < 0) throw new TypeError('WAV needs fmt and data chunks.');
  if (format.audioFormat !== 3 || format.channels !== 2 || format.bitsPerSample !== 32 || format.blockAlign !== 8
      || !Number.isFinite(format.sampleRate) || format.sampleRate <= 0) {
    throw new RangeError('Only IEEE float32 stereo WAV files are supported.');
  }
  if (dataSize % format.blockAlign !== 0) throw new RangeError('WAV data size is not aligned to stereo float frames.');
  const sampleCount = dataSize / format.blockAlign;
  const left = new Float32Array(sampleCount), right = new Float32Array(sampleCount);
  for (let frame = 0; frame < sampleCount; frame += 1) {
    left[frame] = view.getFloat32(dataOffset + frame * 8, true);
    right[frame] = view.getFloat32(dataOffset + frame * 8 + 4, true);
  }
  return freeze({ sampleRate: format.sampleRate, sampleCount, channels: freeze({ left, right }) });
}

function validateAnchors(anchors, sampleCount, durationSeconds) {
  if (!Array.isArray(anchors) || anchors.length < 2) throw new TypeError('At least two simulation/audio clock anchors are required.');
  let previousTime = -Infinity, previousIndex = -Infinity;
  for (const anchor of anchors) {
    if (!Number.isFinite(anchor?.simulationTimeMs) || !Number.isFinite(anchor?.audioSampleIndex)
        || anchor.simulationTimeMs <= previousTime || anchor.audioSampleIndex <= previousIndex) {
      throw new RangeError('Clock anchors must be finite and strictly increasing in simulation time and sample index.');
    }
    previousTime = anchor.simulationTimeMs;
    previousIndex = anchor.audioSampleIndex;
  }
  if (Math.abs(anchors[0].simulationTimeMs) > 1e-6 || anchors[0].audioSampleIndex !== 0
      || Math.abs(anchors.at(-1).simulationTimeMs - durationSeconds * 1000) > 1
      || Math.abs(anchors.at(-1).audioSampleIndex - sampleCount) > 1) {
    throw new RangeError('Clock anchors must span simulation start/end and PCM start/end.');
  }
}

function normalizeEvent(event) {
  const typeRaw = String(event?.type || event?.eventType || '').toUpperCase().replaceAll('-', '_');
  let type = typeRaw;
  if (typeRaw.includes('FOOT_CONTACT')) type = 'FOOT_CONTACT';
  else if (typeRaw.includes('PLATE') && (typeRaw.includes('REMOVE') || typeRaw.includes('ERODE'))) type = 'PLATE_REMOVAL';
  else if (typeRaw.includes('PLATE') && (typeRaw.includes('BIRTH') || typeRaw.includes('ADD'))) type = 'PLATE_BIRTH';
  const simulationTimeMs = Number(event?.simulationTimeMs ?? event?.timeMs ?? event?.simulationTime * 1000);
  if (!Number.isFinite(simulationTimeMs) || simulationTimeMs < 0) throw new RangeError('Events need a non-negative simulationTimeMs.');
  const payload = event?.payload ?? event;
  const count = type === 'FOOT_CONTACT'
    ? (Array.isArray(payload?.contacts) ? payload.contacts.length : Number(payload?.contactCount ?? 1)) : undefined;
  if (type === 'FOOT_CONTACT' && (!Number.isFinite(count) || count < 0)) throw new RangeError('FOOT_CONTACT count must be non-negative.');
  return freeze({ ...event, type, simulationTimeMs, payload, ...(count === undefined ? {} : { contactCount: count }) });
}

function makeContactBuckets(contacts, durationSeconds) {
  const count = Math.ceil(durationSeconds / STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.contactBucketSeconds);
  const buckets = Array.from({ length: count }, (_, index) => ({
    startSeconds: index * STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.contactBucketSeconds,
    endSeconds: Math.min(durationSeconds, (index + 1) * STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.contactBucketSeconds),
    count: 0
  }));
  for (const event of contacts) {
    const index = Math.floor(event.simulationTimeMs / 1000 / STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.contactBucketSeconds);
    if (index >= 0 && index < buckets.length) buckets[index].count += event.contactCount;
  }
  return freeze(buckets.map(bucket => freeze({ ...bucket,
    fillRatio: Math.min(1, bucket.count / STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.contactCountAtFullHeight) })));
}

function compressSpectrogram(spectrogram, width, height, anchors, durationSeconds) {
  const { frameCount, frequencyBins, dbfs } = spectrogram;
  const peakDbfs = new Float32Array(width * height);
  peakDbfs.fill(STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.minDbfs);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const sampleIndex = Math.min(anchors.at(-1).audioSampleIndex,
      frame * spectrogram.hopSize + spectrogram.fftSize / 2);
    const simulationSeconds = sampleIndexToSimulationMs(sampleIndex, anchors) / 1000;
    const x = Math.min(width - 1, Math.max(0, Math.floor(simulationSeconds / durationSeconds * width)));
    const frameOffset = frame * frequencyBins;
    for (let y = 0; y < height; y += 1) {
      const high = Math.max(1, Math.floor((height - y) * frequencyBins / height));
      const low = Math.floor((height - y - 1) * frequencyBins / height);
      let peak = STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.minDbfs;
      for (let frequency = low; frequency < high; frequency += 1) {
        peak = Math.max(peak, dbfs[frameOffset + frequency]);
      }
      const position = y * width + x;
      if (peak > peakDbfs[position]) peakDbfs[position] = peak;
    }
  }
  const pixels = new Uint8Array(peakDbfs.length);
  for (let index = 0; index < peakDbfs.length; index += 1) pixels[index] = stratigraphyLuminanceForDbfs(peakDbfs[index]);
  return freeze({ width, height, luminance: pixels, rangeDbfs: [-100, 0], aggregation: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.spectrogramAggregation });
}

function buildAnchoredWaveform(samples, anchors, durationSeconds, binCount) {
  const waveform = new Array(binCount);
  for (let bin = 0; bin < binCount; bin += 1) {
    const start = Math.max(0, Math.floor(simulationTimeToSampleIndex(bin / binCount * durationSeconds * 1000, anchors)));
    const end = Math.min(samples.length, Math.max(start + 1,
      Math.floor(simulationTimeToSampleIndex((bin + 1) / binCount * durationSeconds * 1000, anchors))));
    let min = Infinity, max = -Infinity;
    for (let index = start; index < end; index += 1) {
      const value = Number.isFinite(samples[index]) ? samples[index] : 0;
      min = Math.min(min, value); max = Math.max(max, value);
    }
    waveform[bin] = freeze({ min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max });
  }
  return freeze(waveform);
}

function buildZoom(window, channels, sampleRate, anchors, events) {
  const startIndex = Math.max(0, Math.floor(simulationTimeToSampleIndex(window.startSeconds * 1000, anchors)));
  const endIndex = Math.min(channels.left.length, Math.floor(simulationTimeToSampleIndex(window.endSeconds * 1000, anchors)));
  const zoomChannels = {};
  for (const name of ['left', 'right']) {
    const samples = channels[name].subarray(startIndex, endIndex);
    const result = buildAudioSnapshot(samples, {
      sampleRate,
      fftSize: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.fftSize,
      hopSize: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.hopSize,
      maxFrequencyHz: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.frequencyMaxHz,
      minDbfs: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.minDbfs,
      maxDbfs: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.zoom.maxDbfs,
      waveformBins: 1100
    });
    zoomChannels[name] = freeze(result);
  }
  return freeze({ ...window, channels: freeze(zoomChannels), windowStartSeconds: window.startSeconds, events: freeze(events.filter(event => {
    const seconds = event.simulationTimeMs / 1000;
    return seconds >= window.startSeconds && seconds <= window.endSeconds;
  })) });
}

function simulationTimeToSampleIndex(timeMs, anchors) {
  if (timeMs <= anchors[0].simulationTimeMs) return anchors[0].audioSampleIndex;
  for (let index = 1; index < anchors.length; index += 1) {
    const right = anchors[index], left = anchors[index - 1];
    if (timeMs <= right.simulationTimeMs) {
      const proportion = (timeMs - left.simulationTimeMs) / (right.simulationTimeMs - left.simulationTimeMs);
      return left.audioSampleIndex + proportion * (right.audioSampleIndex - left.audioSampleIndex);
    }
  }
  return anchors.at(-1).audioSampleIndex;
}

function sampleIndexToSimulationMs(sampleIndex, anchors) {
  if (sampleIndex <= anchors[0].audioSampleIndex) return anchors[0].simulationTimeMs;
  for (let index = 1; index < anchors.length; index += 1) {
    const right = anchors[index], left = anchors[index - 1];
    if (sampleIndex <= right.audioSampleIndex) {
      const proportion = (sampleIndex - left.audioSampleIndex) / (right.audioSampleIndex - left.audioSampleIndex);
      return left.simulationTimeMs + proportion * (right.simulationTimeMs - left.simulationTimeMs);
    }
  }
  return anchors.at(-1).simulationTimeMs;
}

function drawSpectrogram(ctx, data, x, y, width, height) {
  const image = ctx.createImageData(data.width, data.height);
  for (let index = 0; index < data.luminance.length; index += 1) {
    const value = data.luminance[index], output = index * 4;
    image.data[output] = value; image.data[output + 1] = value; image.data[output + 2] = value; image.data[output + 3] = 255;
  }
  const scratch = document.createElement('canvas');
  scratch.width = data.width; scratch.height = data.height;
  scratch.getContext('2d').putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, x, y, width, height);
  ctx.strokeStyle = '#aaa'; ctx.strokeRect(x, y, width, height);
}

function drawWaveform(ctx, bins, x, y, width, height) {
  const preset = STRATIGRAPHY_AUDIO_OVERVIEW_PRESET;
  ctx.strokeStyle = gray(preset.waveformAxisLuminance); ctx.lineWidth = preset.waveformLineWidth; ctx.strokeRect(x, y, width, height);
  const center = y + height / 2, scale = height / 2;
  ctx.beginPath(); ctx.strokeStyle = gray(preset.waveformLineLuminance); ctx.lineWidth = preset.waveformLineWidth;
  for (let i = 0; i < bins.length; i += 1) {
    const px = x + (i + .5) * width / bins.length;
    ctx.moveTo(px, center - Math.max(-1, Math.min(1, bins[i].max)) * scale);
    ctx.lineTo(px, center - Math.max(-1, Math.min(1, bins[i].min)) * scale);
  }
  ctx.stroke();
}

function drawEventOverlays(ctx, overview, x, width, top, bottom, duration, labelTop) {
  const events = [...overview.overlays.plateBirths, ...overview.overlays.plateRemovals]
    .sort((a, b) => a.simulationTimeMs - b.simulationTimeMs);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const px = x + event.simulationTimeMs / 1000 / duration * width;
    ctx.strokeStyle = gray(100); ctx.lineWidth = 1;
    if (event.type === 'PLATE_REMOVAL') ctx.setLineDash?.([3, 3]);
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke(); ctx.setLineDash?.([]);
    if (event.type === 'PLATE_BIRTH') {
      const shortLabel = `${event.label} ${event.layerChange}`;
      ctx.fillStyle = gray(80); ctx.font = '8px sans-serif';
      ctx.fillText(shortLabel, px + 2, labelTop + 7 + (index % 3) * 7);
    }
  }
}

function drawContactStrip(ctx, buckets, x, y, width, height) {
  ctx.fillStyle = '#f5f5f5'; ctx.fillRect(x, y, width, height);
  const slot = width / buckets.length;
  for (let i = 0; i < buckets.length; i += 1) {
    const bucket = buckets[i], barHeight = Math.round(height * bucket.fillRatio);
    ctx.fillStyle = '#555'; ctx.fillRect(x + i * slot, y + height - barHeight, Math.max(1, slot - 1), barHeight);
  }
  ctx.strokeStyle = '#aaa'; ctx.strokeRect(x, y, width, height);
}

function drawTimeAxis(ctx, x, width, y, duration, offsetSeconds = 0) {
  ctx.strokeStyle = '#888'; ctx.fillStyle = '#333'; ctx.font = '10px sans-serif';
  const divisions = 6;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.stroke();
  for (let index = 0; index <= divisions; index += 1) {
    const px = x + width * index / divisions;
    ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + 4); ctx.stroke();
    ctx.fillText(`${(offsetSeconds + duration * index / divisions).toFixed(1)} s`, px - 12, y + 15);
  }
}

function drawZoomEventTicks(ctx, events, x, y, width, duration, windowStartSeconds) {
  for (const event of events) {
    if (event.type !== 'FOOT_CONTACT' && event.type !== 'PLATE_BIRTH' && event.type !== 'PLATE_REMOVAL') continue;
    const offset = event.simulationTimeMs / 1000;
    const px = x + (offset - windowStartSeconds) / duration * width;
    if (px < x || px > x + width) continue;
    ctx.strokeStyle = gray(100); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + 7); ctx.stroke();
  }
}

function gray(luminance) {
  const channel = Math.max(0, Math.min(255, Math.round(luminance)));
  return `rgb(${channel},${channel},${channel})`;
}
