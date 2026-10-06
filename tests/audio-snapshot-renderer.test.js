import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAudioSnapshot } from '../scripts/audio-snapshot-renderer.js';

function tone(amplitude, frequency, sampleRate, sampleCount) {
  return Float32Array.from({ length: sampleCount }, (_, index) => amplitude * Math.sin(2 * Math.PI * frequency * index / sampleRate));
}

test('snapshot transform uses fixed amplitude and dBFS scales without peak normalization', () => {
  const sampleRate = 48_000;
  const half = buildAudioSnapshot(tone(.5, 750, sampleRate, 2048), { sampleRate, waveformBins: 4 });
  const quarter = buildAudioSnapshot(tone(.25, 750, sampleRate, 2048), { sampleRate, waveformBins: 4 });

  assert.deepEqual(half.waveform.amplitudeRange, [-1, 1]);
  assert.deepEqual(half.spectrogram.rangeDbfs, [-100, 0]);
  assert.equal(half.spectrogram.scale, 'fixed; no peak normalization');
  const maxDb = snapshot => Math.max(...snapshot.spectrogram.dbfs);
  assert.ok(Math.abs(maxDb(half) - 20 * Math.log10(.5)) < .03);
  assert.ok(Math.abs(maxDb(quarter) - 20 * Math.log10(.25)) < .03);
  assert.ok(Math.abs((maxDb(half) - maxDb(quarter)) - 6.0206) < .03,
    'halving source amplitude lowers the fixed-scale spectrogram by about 6 dB');
});

test('spectrogram uses a 1024-point Hann window, 256-sample hop and fixed 8 kHz ceiling', () => {
  const snapshot = buildAudioSnapshot(tone(.4, 750, 48_000, 4096), { sampleRate: 48_000 });
  assert.equal(snapshot.spectrogram.fftSize, 1024);
  assert.equal(snapshot.spectrogram.hopSize, 256);
  assert.equal(snapshot.spectrogram.frameCount, 13);
  assert.equal(snapshot.spectrogram.frequencyBins, 171);
  assert.equal(snapshot.spectrogram.maxFrequencyHz, 7968.75);
  assert.ok(Math.abs(snapshot.spectrogram.dbfs[16] - 20 * Math.log10(.4)) < .03,
    '750 Hz is bin 16 at a 48 kHz sample rate');
});

test('waveform envelopes preserve peak scale, handle short inputs and do not mutate samples', () => {
  const samples = new Float32Array([0, .5, 0, -.5, 0, 1.2, Number.NaN, -.25]);
  const before = [...samples];
  const snapshot = buildAudioSnapshot(samples, { sampleRate: 8, fftSize: 8, hopSize: 4,
    maxFrequencyHz: 4, waveformBins: 4 });
  assert.deepEqual([...samples], before);
  assert.deepEqual(snapshot.waveform.bins, [
    { min: 0, max: .5 }, { min: -.5, max: 0 }, { min: 0, max: 1 }, { min: -.25, max: -.25 }
  ]);
  assert.equal(snapshot.spectrogram.dbfs.length, snapshot.spectrogram.frameCount * snapshot.spectrogram.frequencyBins);
  assert.ok([...snapshot.spectrogram.dbfs].every(Number.isFinite));
});

test('silence is shown at the fixed -100 dBFS floor and invalid inputs are rejected', () => {
  const silent = buildAudioSnapshot(new Float32Array(64), { sampleRate: 44_100 });
  assert.ok([...silent.spectrogram.dbfs].every(value => value === -100));
  assert.throws(() => buildAudioSnapshot(new Float32Array(), { sampleRate: 0 }), /sampleRate/);
  assert.throws(() => buildAudioSnapshot(new Float32Array(), { sampleRate: 48_000, fftSize: 1000 }), /power of two/);
  assert.throws(() => buildAudioSnapshot(new Float32Array(), { sampleRate: 48_000, hopSize: 0 }), /hopSize/);
});
