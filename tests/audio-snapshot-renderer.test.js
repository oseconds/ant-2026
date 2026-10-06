import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAudioSnapshot, buildStratigraphyAudioSnapshot, renderStratigraphyAudioSnapshot,
  renderStratigraphyAudioComparison, STRATIGRAPHY_AUDIO_PRESET, stratigraphyLuminanceForDbfs }
  from '../scripts/audio-snapshot-renderer.js';

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

test('frozen stratigraphy preset fixes duration, dimensions, stereo separation and analysis axes', () => {
  const sampleRate = 16_000, sourceCount = 16_000;
  const source = {
    left: tone(.2, 125, sampleRate, sourceCount),
    right: tone(.7, 250, sampleRate, sourceCount)
  };
  const beforeLeft = [...source.left], beforeRight = [...source.right];
  const snapshot = buildStratigraphyAudioSnapshot(source, { sampleRate, sourceDurationSeconds: 1 });

  assert.ok(Object.isFrozen(STRATIGRAPHY_AUDIO_PRESET));
  assert.equal(snapshot.presetId, STRATIGRAPHY_AUDIO_PRESET.id);
  assert.equal(STRATIGRAPHY_AUDIO_PRESET.width, 1200);
  assert.equal(STRATIGRAPHY_AUDIO_PRESET.height, 1000);
  assert.equal(STRATIGRAPHY_AUDIO_PRESET.imageWidth, 1200);
  assert.equal(STRATIGRAPHY_AUDIO_PRESET.imageHeight, 1000);
  assert.equal(STRATIGRAPHY_AUDIO_PRESET.frequencyMinHz, 0);
  assert.equal(STRATIGRAPHY_AUDIO_PRESET.frequencyMaxHz, 8000);
  assert.equal(STRATIGRAPHY_AUDIO_PRESET.channelMode, 'separate L/R');
  assert.equal(STRATIGRAPHY_AUDIO_PRESET.durationSeconds, 10);
  assert.equal(STRATIGRAPHY_AUDIO_PRESET.padding, 'zero-pad both channels at the end to exactly 10 seconds; trim longer input');
  assert.equal(STRATIGRAPHY_AUDIO_PRESET.waveformLineLuminance, 24);
  assert.equal(STRATIGRAPHY_AUDIO_PRESET.waveformAxisLuminance, 180);
  assert.equal(STRATIGRAPHY_AUDIO_PRESET.waveformLineWidth, 1);
  assert.equal(snapshot.durationSeconds, 10);
  assert.equal(snapshot.sampleCount, 160_000);
  assert.equal(snapshot.sourceDurationSeconds, 1);
  assert.equal(snapshot.paddingSeconds, 9);
  assert.equal(snapshot.channels.left.durationSeconds, 10);
  assert.equal(snapshot.channels.right.durationSeconds, 10);
  assert.equal(snapshot.channels.left.spectrogram.fftSize, 1024);
  assert.equal(snapshot.channels.left.spectrogram.hopSize, 256);
  assert.deepEqual(snapshot.channels.left.spectrogram.rangeDbfs, [-100, 0]);
  assert.equal(snapshot.channels.left.spectrogram.maxFrequencyHz, 8000);
  assert.notDeepEqual(snapshot.channels.left.waveform.bins, snapshot.channels.right.waveform.bins,
    'left and right waveform data remain separate');
  assert.deepEqual([...source.left], beforeLeft);
  assert.deepEqual([...source.right], beforeRight);
  assert.ok(snapshot.channels.left.waveform.bins.slice(-1080).every(bin => bin.min === 0 && bin.max === 0),
    'the final nine seconds are a visible, explicit zero pad');
});

test('frozen grayscale transfer has deterministic linear-luminance dBFS landmarks', () => {
  const values = [-100, -80, -60, -40, -20, 0];
  assert.deepEqual(values.map(stratigraphyLuminanceForDbfs), [0, 51, 102, 153, 204, 255]);
  assert.equal(stratigraphyLuminanceForDbfs(-120), 0);
  assert.equal(stratigraphyLuminanceForDbfs(6), 255);
});

test('frozen preset rejects FFT, hop, frequency and range overrides', () => {
  const stereo = { left: new Float32Array(100), right: new Float32Array(100) };
  for (const override of [{ fftSize: 512 }, { hopSize: 128 }, { minDbfs: -90 }, { maxDbfs: -3 }, { maxFrequencyHz: 6000 }]) {
    assert.throws(() => buildStratigraphyAudioSnapshot(stereo, { sampleRate: 100, ...override }), /does not accept overrides/);
  }
  assert.throws(() => buildStratigraphyAudioSnapshot({ left: new Float32Array(1), right: new Float32Array(2) }, { sampleRate: 100 }), /equal sample counts/);
});

test('frozen renderers use a fixed canvas, grayscale pixels and aligned comparison rows', () => {
  const canvases = [];
  const makeCanvas = () => {
    const canvas = { width: 0, height: 0, draws: [], imageData: [],
      getContext() { return context; } };
    const context = {
      createImageData(width, height) { const data = new Uint8ClampedArray(width * height * 4); canvas.imageData.push({ width, height, data }); return { width, height, data }; },
      fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, strokeRect() {},
      drawImage(...args) { canvas.draws.push(args); }, putImageData() {}
    };
    canvas.context = context;
    canvases.push(canvas);
    return canvas;
  };
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => makeCanvas() };
  try {
    const snapshot = buildStratigraphyAudioSnapshot({ left: new Float32Array(100), right: new Float32Array(100) }, { sampleRate: 100 });
    const canvas = makeCanvas();
    renderStratigraphyAudioSnapshot(canvas, snapshot);
    assert.equal(canvas.width, 1200);
    assert.equal(canvas.height, 1000);
    assert.ok(canvas.context.imageSmoothingEnabled === false);
    const image = canvases[0].imageData[0];
    assert.equal(image.data[0], 0, 'silence floor is black, not adaptive blue/gray');
    assert.equal(image.data[1], 0);
    assert.equal(image.data[2], 0);
    assert.equal(image.data[3], 255, 'pixel opacity is fixed and fully opaque');
    const comparison = makeCanvas();
    renderStratigraphyAudioComparison(comparison, [{ label: 'pre-birth', snapshot }, { label: 'first birth', snapshot }]);
    assert.equal(comparison.width, 1200);
    assert.equal(comparison.height, 1200);
    assert.throws(() => renderStratigraphyAudioComparison(makeCanvas(), Array(7).fill({ snapshot })), /between 1 and 6/);
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});
