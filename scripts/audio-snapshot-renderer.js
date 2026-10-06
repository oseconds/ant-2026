const DEFAULT_FFT_SIZE = 1024;
const DEFAULT_HOP_SIZE = 256;
const DEFAULT_MAX_FREQUENCY_HZ = 8000;
const DEFAULT_MIN_DBFS = -100;
const DEFAULT_MAX_DBFS = 0;

/** Versioned, immutable display contract for ANT surface-audio evidence. */
export const STRATIGRAPHY_AUDIO_PRESET = Object.freeze({
  id: 'ant-surface-stratigraphy-v1',
  rendererVersion: 'ant-surface-stratigraphy-v1',
  width: 1200,
  height: 1000,
  imageWidth: 1200,
  imageHeight: 1000,
  comparisonWidth: 1200,
  comparisonHeight: 1200,
  comparisonMaxRows: 6,
  durationSeconds: 10,
  fftSize: 1024,
  window: 'Hann',
  hopSize: 256,
  frequencyMinHz: 0,
  frequencyMaxHz: 8000,
  maxFrequencyHz: 8000,
  spectrogramMinDb: -100,
  spectrogramMaxDb: 0,
  spectrogramGamma: 1,
  minDbfs: -100,
  maxDbfs: 0,
  amplitudeRange: Object.freeze([-1, 1]),
  waveformAmplitudeMin: -1,
  waveformAmplitudeMax: 1,
  grayscaleGamma: 1,
  gamma: 1,
  padding: 'zero-pad both channels at the end to exactly 10 seconds; trim longer input',
  colors: Object.freeze({ background: 255, waveform: 24, axis: 180 }),
  waveformBackgroundLuminance: 255,
  waveformLineLuminance: 24,
  waveformAxisLuminance: 180,
  waveformLineWidth: 1,
  lineLuminance: 24,
  axisLuminance: 180,
  lineWidth: 1,
  channelMode: 'separate L/R',
  opacity: 1
});


/** Build fixed-scale waveform and Hann-windowed magnitude spectrogram data. */
export function buildAudioSnapshot(samples, {
  sampleRate,
  fftSize = DEFAULT_FFT_SIZE,
  hopSize = DEFAULT_HOP_SIZE,
  maxFrequencyHz = DEFAULT_MAX_FREQUENCY_HZ,
  minDbfs = DEFAULT_MIN_DBFS,
  maxDbfs = DEFAULT_MAX_DBFS,
  waveformBins = 1200
} = {}) {
  if (!samples || typeof samples.length !== 'number') throw new TypeError('Audio samples are required.');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be positive.');
  if (!isPowerOfTwo(fftSize) || fftSize < 2) throw new RangeError('fftSize must be a power of two greater than one.');
  if (!Number.isInteger(hopSize) || hopSize < 1) throw new RangeError('hopSize must be a positive integer.');
  if (!Number.isFinite(maxFrequencyHz) || maxFrequencyHz <= 0) throw new RangeError('maxFrequencyHz must be positive.');
  if (!Number.isFinite(minDbfs) || !Number.isFinite(maxDbfs) || minDbfs >= maxDbfs) {
    throw new RangeError('dBFS limits must be finite and minDbfs must be below maxDbfs.');
  }
  if (!Number.isInteger(waveformBins) || waveformBins < 1) throw new RangeError('waveformBins must be a positive integer.');

  const sampleCount = samples.length;
  const waveform = buildWaveformEnvelope(samples, Math.min(waveformBins, Math.max(1, sampleCount)));
  const binHz = sampleRate / fftSize;
  const frequencyBins = Math.min(Math.floor(maxFrequencyHz / binHz), Math.floor(fftSize / 2)) + 1;
  const frameCount = Math.max(1, Math.ceil(Math.max(0, sampleCount - fftSize) / hopSize) + 1);
  const dbfs = new Float32Array(frameCount * frequencyBins);
  const fft = makeFftPlan(fftSize);
  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);
  const windowSum = fft.window.reduce((sum, value) => sum + value, 0);
  const floor = minDbfs;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hopSize;
    real.fill(0);
    imaginary.fill(0);
    for (let index = 0; index < fftSize; index += 1) {
      const sample = start + index < sampleCount ? finiteSample(samples[start + index]) : 0;
      real[index] = sample * fft.window[index];
    }
    runFft(real, imaginary, fft.bitReversed);
    for (let frequency = 0; frequency < frequencyBins; frequency += 1) {
      const magnitude = Math.hypot(real[frequency], imaginary[frequency]);
      const amplitude = magnitude * 2 / windowSum;
      const decibels = amplitude > 0 ? Math.max(floor, Math.min(maxDbfs, 20 * Math.log10(amplitude))) : floor;
      dbfs[frame * frequencyBins + frequency] = decibels;
    }
  }

  return {
    sampleRate,
    sampleCount,
    durationSeconds: sampleCount / sampleRate,
    waveform: { bins: waveform, amplitudeRange: [-1, 1], timePerBinSeconds: sampleCount ? sampleCount / sampleRate / waveform.length : 0 },
    spectrogram: { dbfs, frameCount, frequencyBins, fftSize, hopSize, binHz,
      framePeriodSeconds: hopSize / sampleRate, maxFrequencyHz: (frequencyBins - 1) * binHz,
      rangeDbfs: [minDbfs, maxDbfs], scale: 'fixed; no peak normalization' }
  };
}

/**
 * Build a locked 20-second stereo evidence snapshot. Short source clips are zero-padded;
 * long clips are truncated. No preset dimensions, scales or DSP analysis settings are
 * accepted as overrides.
 */
export function buildStratigraphyAudioSnapshot(channels, options = {}) {
  const { sampleRate, sourceDurationSeconds } = options;
  const unsupportedOverrides = Object.keys(options).filter(key => !['sampleRate', 'sourceDurationSeconds'].includes(key));
  if (unsupportedOverrides.length) throw new RangeError(`Frozen preset does not accept overrides: ${unsupportedOverrides.join(', ')}.`);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be positive.');
  const left = channels?.left ?? channels?.[0];
  const right = channels?.right ?? channels?.[1];
  if (!left || typeof left.length !== 'number' || !right || typeof right.length !== 'number') {
    throw new TypeError('Stratigraphy audio snapshots require left and right sample arrays.');
  }
  if (left.length !== right.length) throw new RangeError('Left and right source channels must have equal sample counts.');
  const actualSourceDuration = sourceDurationSeconds ?? Math.max(left.length, right.length) / sampleRate;
  if (!Number.isFinite(actualSourceDuration) || actualSourceDuration < 0) {
    throw new RangeError('sourceDurationSeconds must be finite and non-negative.');
  }
  if (Math.abs(actualSourceDuration - left.length / sampleRate) > 1 / sampleRate) {
    throw new RangeError('sourceDurationSeconds must match the supplied stereo sample count.');
  }
  const outputCount = Math.round(STRATIGRAPHY_AUDIO_PRESET.durationSeconds * sampleRate);
  const sourceCount = Math.min(outputCount, Math.round(actualSourceDuration * sampleRate));
  const createPadded = source => {
    const output = new Float32Array(outputCount);
    output.set(source.subarray ? source.subarray(0, Math.min(sourceCount, source.length)) : Array.from(source).slice(0, sourceCount));
    return output;
  };
  const fixedChannels = { left: createPadded(left), right: createPadded(right) };
  const analyzerOptions = {
    sampleRate,
    fftSize: STRATIGRAPHY_AUDIO_PRESET.fftSize,
    hopSize: STRATIGRAPHY_AUDIO_PRESET.hopSize,
    maxFrequencyHz: STRATIGRAPHY_AUDIO_PRESET.maxFrequencyHz,
    minDbfs: STRATIGRAPHY_AUDIO_PRESET.minDbfs,
    maxDbfs: STRATIGRAPHY_AUDIO_PRESET.maxDbfs,
    waveformBins: STRATIGRAPHY_AUDIO_PRESET.width
  };
  return Object.freeze({
    presetId: STRATIGRAPHY_AUDIO_PRESET.id,
    sampleRate,
    sampleCount: outputCount,
    durationSeconds: STRATIGRAPHY_AUDIO_PRESET.durationSeconds,
    sourceDurationSeconds: actualSourceDuration,
    includedSourceDurationSeconds: Math.min(actualSourceDuration, STRATIGRAPHY_AUDIO_PRESET.durationSeconds),
    paddingSeconds: Math.max(0, STRATIGRAPHY_AUDIO_PRESET.durationSeconds - actualSourceDuration),
    trimmedSeconds: Math.max(0, actualSourceDuration - STRATIGRAPHY_AUDIO_PRESET.durationSeconds),
    channels: Object.freeze({
      left: buildAudioSnapshot(fixedChannels.left, analyzerOptions),
      right: buildAudioSnapshot(fixedChannels.right, analyzerOptions)
    }),
    rendering: STRATIGRAPHY_AUDIO_PRESET
  });
}

/** Linear, fixed dBFS-to-grayscale mapping used by the locked evidence renderer. */
export function stratigraphyLuminanceForDbfs(value) {
  const bounded = clamp(finiteSample(value), STRATIGRAPHY_AUDIO_PRESET.minDbfs, STRATIGRAPHY_AUDIO_PRESET.maxDbfs);
  return Math.round(255 * (bounded - STRATIGRAPHY_AUDIO_PRESET.minDbfs)
    / (STRATIGRAPHY_AUDIO_PRESET.maxDbfs - STRATIGRAPHY_AUDIO_PRESET.minDbfs));
}

/** Render stereo waveforms and channel-specific spectrograms with the frozen preset. */
export function renderStratigraphyAudioSnapshot(canvas, snapshot) {
  if (!canvas?.getContext) throw new TypeError('A canvas is required.');
  if (snapshot?.presetId !== STRATIGRAPHY_AUDIO_PRESET.id) throw new TypeError('Snapshot must use the frozen stratigraphy preset.');
  canvas.width = STRATIGRAPHY_AUDIO_PRESET.width;
  canvas.height = STRATIGRAPHY_AUDIO_PRESET.height;
  const context = canvas.getContext('2d');
  context.globalAlpha = STRATIGRAPHY_AUDIO_PRESET.opacity;
  context.fillStyle = 'rgb(255,255,255)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgb(24,24,24)';
  context.font = '16px sans-serif';
  context.fillText(`${snapshot.label || 'ANT surface audio'} · frozen evidence preset ${STRATIGRAPHY_AUDIO_PRESET.id}`, 88, 25);
  context.font = '12px sans-serif';
  context.fillText(`Source ${snapshot.sourceDurationSeconds.toFixed(2)} s · included ${snapshot.includedSourceDurationSeconds.toFixed(2)} s · zero-padded ${snapshot.paddingSeconds.toFixed(2)} s · fixed axis ${STRATIGRAPHY_AUDIO_PRESET.durationSeconds.toFixed(2)} s`, 88, 43);
  const left = 88, right = canvas.width - 20, plotWidth = right - left;
  const waveformRows = [
    { channel: 'left', label: 'Waveform L', top: 58, bottom: 176 },
    { channel: 'right', label: 'Waveform R', top: 202, bottom: 320 }
  ];
  for (const row of waveformRows) {
    context.fillStyle = 'rgb(24,24,24)';
    context.fillText(row.label, 20, row.top + 12);
    drawFrozenWaveform(context, snapshot.channels[row.channel].waveform.bins, left, row.top + 18, plotWidth, row.bottom - row.top - 25);
    drawFixedTimeAxis(context, left, right, row.bottom, STRATIGRAPHY_AUDIO_PRESET.durationSeconds);
  }
  drawFrozenSpectrogramPanel(context, snapshot.channels.left.spectrogram, 'Spectrogram L', left, 366, plotWidth, 254);
  drawFrozenSpectrogramPanel(context, snapshot.channels.right.spectrogram, 'Spectrogram R', left, 672, plotWidth, 254);
  context.fillStyle = 'rgb(24,24,24)';
  context.font = '11px sans-serif';
  context.fillText('FFT 1024 · Hann · hop 256 · 0–8 kHz · grayscale luminance linear −100 to 0 dBFS · no auto-contrast', 88, 974);
  return snapshot;
}

/** Fixed-size timeline comparison with identical 20-second axes and per-channel rows. */
export function renderStratigraphyAudioComparison(canvas, rows) {
  if (!canvas?.getContext) throw new TypeError('A canvas is required.');
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > STRATIGRAPHY_AUDIO_PRESET.comparisonMaxRows) {
    throw new RangeError(`Comparison needs between 1 and ${STRATIGRAPHY_AUDIO_PRESET.comparisonMaxRows} rows.`);
  }
  for (const row of rows) if (row?.snapshot?.presetId !== STRATIGRAPHY_AUDIO_PRESET.id) {
    throw new TypeError('Every comparison row must use the frozen stratigraphy preset.');
  }
  canvas.width = STRATIGRAPHY_AUDIO_PRESET.comparisonWidth;
  canvas.height = STRATIGRAPHY_AUDIO_PRESET.comparisonHeight;
  const context = canvas.getContext('2d');
  context.globalAlpha = STRATIGRAPHY_AUDIO_PRESET.opacity;
  context.fillStyle = 'rgb(255,255,255)'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgb(24,24,24)'; context.font = '16px sans-serif';
  context.fillText(`ANT surface audio · aligned comparison · fixed ${STRATIGRAPHY_AUDIO_PRESET.durationSeconds.toFixed(2)} s axes · ${STRATIGRAPHY_AUDIO_PRESET.id}`, 20, 24);
  const top = 38, rowHeight = (canvas.height - top - 18) / STRATIGRAPHY_AUDIO_PRESET.comparisonMaxRows;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index], y = top + index * rowHeight;
    context.fillStyle = 'rgb(24,24,24)'; context.font = '13px sans-serif';
    context.fillText(row.label || `Stage ${index + 1}`, 20, y + 14);
    const x = 88, width = canvas.width - 108;
    drawFrozenWaveform(context, row.snapshot.channels.left.waveform.bins, x, y + 20, width, 18);
    drawFrozenWaveform(context, row.snapshot.channels.right.waveform.bins, x, y + 42, width, 18);
    context.font = '10px sans-serif'; context.fillText('L', 66, y + 33); context.fillText('R', 66, y + 55);
    drawFrozenSpectrogramPanel(context, row.snapshot.channels.left.spectrogram, '', x, y + 64, width, 38, false);
    drawFrozenSpectrogramPanel(context, row.snapshot.channels.right.spectrogram, '', x, y + 108, width, 38, false);
    drawFixedTimeAxis(context, x, x + width, y + 151, STRATIGRAPHY_AUDIO_PRESET.durationSeconds, index === rows.length - 1);
    context.strokeStyle = 'rgb(180,180,180)'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(20, y + rowHeight - 2); context.lineTo(canvas.width - 20, y + rowHeight - 2); context.stroke();
  }
  return rows;
}

function drawFrozenWaveform(context, bins, left, top, width, height) {
  const center = top + height / 2;
  context.strokeStyle = 'rgb(180,180,180)'; context.lineWidth = 1; context.globalAlpha = 1;
  context.beginPath(); context.moveTo(left, center); context.lineTo(left + width, center); context.stroke();
  context.strokeStyle = 'rgb(24,24,24)'; context.lineWidth = 1; context.globalAlpha = 1;
  context.beginPath();
  for (let index = 0; index < bins.length; index += 1) {
    const x = left + index / Math.max(1, bins.length - 1) * width;
    const high = top + (1 - clamp(bins[index].max, -1, 1)) * height / 2;
    const low = top + (1 - clamp(bins[index].min, -1, 1)) * height / 2;
    context.moveTo(x, high); context.lineTo(x, low);
  }
  context.stroke();
}

function drawFixedTimeAxis(context, left, right, y, seconds, labels = true) {
  context.strokeStyle = 'rgb(180,180,180)'; context.lineWidth = 1; context.globalAlpha = 1;
  context.beginPath(); context.moveTo(left, y); context.lineTo(right, y); context.stroke();
  if (!labels) return;
  context.fillStyle = 'rgb(24,24,24)'; context.font = '10px sans-serif';
  context.fillText('0 s', left, y + 11); context.fillText(`${seconds}.0 s`, right - 32, y + 11);
}

function drawFrozenSpectrogramPanel(context, spectrogram, label, left, top, width, height, labels = true) {
  if (label) { context.fillStyle = 'rgb(24,24,24)'; context.font = '13px sans-serif'; context.fillText(label, 20, top + 12); }
  const imageData = context.createImageData(spectrogram.frameCount, spectrogram.frequencyBins);
  for (let frame = 0; frame < spectrogram.frameCount; frame += 1) {
    for (let frequency = 0; frequency < spectrogram.frequencyBins; frequency += 1) {
      const luminance = stratigraphyLuminanceForDbfs(spectrogram.dbfs[frame * spectrogram.frequencyBins + frequency]);
      const offset = ((spectrogram.frequencyBins - 1 - frequency) * spectrogram.frameCount + frame) * 4;
      imageData.data[offset] = luminance; imageData.data[offset + 1] = luminance; imageData.data[offset + 2] = luminance; imageData.data[offset + 3] = 255;
    }
  }
  const source = document.createElement('canvas'); source.width = spectrogram.frameCount; source.height = spectrogram.frequencyBins;
  source.getContext('2d').putImageData(imageData, 0, 0);
  context.imageSmoothingEnabled = false; context.globalAlpha = 1;
  const actualTop = top + (label ? 18 : 0), actualHeight = height - (label ? 18 : 0);
  context.drawImage(source, left, actualTop, width, actualHeight);
  context.strokeStyle = 'rgb(180,180,180)'; context.lineWidth = 1; context.strokeRect(left, actualTop, width, actualHeight);
  if (labels) {
    context.fillStyle = 'rgb(24,24,24)'; context.font = '10px sans-serif';
    context.fillText('8 kHz', 20, actualTop + 8); context.fillText('0 Hz', 27, actualTop + actualHeight);
    drawFixedTimeAxis(context, left, left + width, actualTop + actualHeight, STRATIGRAPHY_AUDIO_PRESET.durationSeconds);
  }
}

/** Draw the fixed-scale snapshot to a browser canvas. */
export function renderAudioSnapshot(canvas, snapshot) {
  if (!canvas?.getContext) throw new TypeError('A canvas is required.');
  const width = 1200, height = 600;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#222';
  context.font = '16px sans-serif';
  context.fillText(`Waveform${snapshot.waveformLabel ? ` · ${snapshot.waveformLabel}` : ''} · ±1 full scale · ${snapshot.durationSeconds.toFixed(2)} s`, 16, 24);
  context.fillText('Spectrogram · 0–8 kHz · fixed −100 to 0 dBFS', 16, 308);

  const left = 56, right = width - 16;
  const waveTop = 38, waveBottom = 278;
  context.strokeStyle = '#d2d6da';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(left, (waveTop + waveBottom) / 2);
  context.lineTo(right, (waveTop + waveBottom) / 2);
  context.stroke();
  context.strokeStyle = '#27313a';
  context.lineWidth = 1;
  context.beginPath();
  const bins = snapshot.waveform.bins;
  for (let index = 0; index < bins.length; index += 1) {
    const x = left + index / Math.max(1, bins.length - 1) * (right - left);
    const high = waveTop + (1 - clamp(bins[index].max, -1, 1)) * (waveBottom - waveTop) / 2;
    const low = waveTop + (1 - clamp(bins[index].min, -1, 1)) * (waveBottom - waveTop) / 2;
    context.moveTo(x, high);
    context.lineTo(x, low);
  }
  context.stroke();
  context.fillStyle = '#4d555c';
  context.font = '12px sans-serif';
  context.fillText('+1', 16, waveTop + 4);
  context.fillText('0', 28, (waveTop + waveBottom) / 2 + 4);
  context.fillText('−1', 16, waveBottom + 4);

  const spec = snapshot.spectrogram;
  const image = context.createImageData(spec.frameCount, spec.frequencyBins);
  for (let frame = 0; frame < spec.frameCount; frame += 1) {
    for (let frequency = 0; frequency < spec.frequencyBins; frequency += 1) {
      const db = spec.dbfs[frame * spec.frequencyBins + frequency];
      const light = Math.round(clamp((db - spec.rangeDbfs[0]) / (spec.rangeDbfs[1] - spec.rangeDbfs[0]), 0, 1) * 255);
      const offset = ((spec.frequencyBins - 1 - frequency) * spec.frameCount + frame) * 4;
      image.data[offset] = Math.round(15 + light * 0.78);
      image.data[offset + 1] = Math.round(24 + light * 0.68);
      image.data[offset + 2] = Math.round(42 + light * 0.56);
      image.data[offset + 3] = 255;
    }
  }
  const source = document.createElement('canvas');
  source.width = spec.frameCount;
  source.height = spec.frequencyBins;
  source.getContext('2d').putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(source, left, 324, right - left, height - 348);
  context.strokeStyle = '#aeb5ba';
  context.strokeRect(left, 324, right - left, height - 348);
  context.fillStyle = '#4d555c';
  context.fillText('8 kHz', 16, 334);
  context.fillText('0 Hz', 24, height - 22);
  context.fillText('0 s', left, height - 8);
  context.fillText(`${snapshot.durationSeconds.toFixed(1)} s`, right - 42, height - 8);
  return snapshot;
}

function buildWaveformEnvelope(samples, binCount) {
  const bins = [];
  for (let bin = 0; bin < binCount; bin += 1) {
    const start = Math.floor(bin * samples.length / binCount);
    const end = Math.max(start + 1, Math.floor((bin + 1) * samples.length / binCount));
    let min = Infinity, max = -Infinity;
    for (let index = start; index < Math.min(end, samples.length); index += 1) {
      if (!Number.isFinite(samples[index])) continue;
      const sample = clamp(finiteSample(samples[index]), -1, 1);
      min = Math.min(min, sample);
      max = Math.max(max, sample);
    }
    bins.push({ min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 0 });
  }
  return bins;
}

function makeFftPlan(size) {
  const bitReversed = new Uint32Array(size);
  const bits = Math.log2(size);
  for (let index = 0; index < size; index += 1) {
    let source = index, reversed = 0;
    for (let bit = 0; bit < bits; bit += 1) { reversed = (reversed << 1) | (source & 1); source >>>= 1; }
    bitReversed[index] = reversed;
  }
  const window = new Float64Array(size);
  for (let index = 0; index < size; index += 1) window[index] = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (size - 1));
  return { bitReversed, window };
}

function runFft(real, imaginary, bitReversed) {
  const size = real.length;
  for (let index = 0; index < size; index += 1) {
    const reversed = bitReversed[index];
    if (reversed > index) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  for (let length = 2; length <= size; length *= 2) {
    const angle = -2 * Math.PI / length;
    const stepReal = Math.cos(angle), stepImaginary = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let twiddleReal = 1, twiddleImaginary = 0;
      const half = length / 2;
      for (let offset = 0; offset < half; offset += 1) {
        const even = start + offset, odd = even + half;
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
}

function finiteSample(value) { return Number.isFinite(value) ? value : 0; }
function isPowerOfTwo(value) { return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
