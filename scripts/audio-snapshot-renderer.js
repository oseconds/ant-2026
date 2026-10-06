const DEFAULT_FFT_SIZE = 1024;
const DEFAULT_HOP_SIZE = 256;
const DEFAULT_MAX_FREQUENCY_HZ = 8000;
const DEFAULT_MIN_DBFS = -100;
const DEFAULT_MAX_DBFS = 0;

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
