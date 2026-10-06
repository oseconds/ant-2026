import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStratigraphyAudioOverview,
  decodeStereoFloatWav,
  renderStratigraphyAudioOverview,
  renderStratigraphyAudioZooms,
  selectStratigraphyAudioZoomWindows,
  STRATIGRAPHY_AUDIO_OVERVIEW_PRESET
} from '../scripts/stratigraphy-audio-overview.js';
import { stratigraphyLuminanceForDbfs } from '../scripts/audio-snapshot-renderer.js';

function anchors(durationSeconds, sampleCount) {
  return [
    { simulationTimeMs: 0, audioSampleIndex: 0 },
    { simulationTimeMs: durationSeconds * 500, audioSampleIndex: sampleCount / 2 },
    { simulationTimeMs: durationSeconds * 1000, audioSampleIndex: sampleCount }
  ];
}

test('full-run preset is immutable and keeps fixed FFT, dBFS, gamma, overview, and detail axes', () => {
  const preset = STRATIGRAPHY_AUDIO_OVERVIEW_PRESET;
  assert.ok(Object.isFrozen(preset));
  assert.ok(Object.isFrozen(preset.zoom));
  assert.equal(preset.width, 1800);
  assert.equal(preset.height, 1200);
  assert.deepEqual([preset.fftSize, preset.window, preset.hopSize], [1024, 'Hann', 256]);
  assert.deepEqual([preset.minDbfs, preset.maxDbfs, preset.gamma], [-100, 0, 1]);
  assert.equal(preset.zoom.durationSeconds, 10);
  assert.equal(preset.zoom.width, 1200);
  assert.equal(preset.zoom.height, 1000);
  assert.deepEqual([-100, -50, 0].map(stratigraphyLuminanceForDbfs), [0, 128, 255]);
});

test('zoom selection gives stable representative windows for 180s and 600s runs', () => {
  const events = [
    { type: 'PLATE_BIRTH', simulationTimeMs: 105_000 },
    { type: 'FOOT_CONTACT', simulationTimeMs: 251_000, payload: { contacts: Array(80).fill({}) } },
    { type: 'FOOT_CONTACT', simulationTimeMs: 252_000, payload: { contacts: Array(40).fill({}) } }
  ];
  const short = selectStratigraphyAudioZoomWindows({ simulationDurationSeconds: 180, events });
  assert.deepEqual(short.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]), [[0, 10], [85, 95], [170, 180]]);
  const long = selectStratigraphyAudioZoomWindows({ simulationDurationSeconds: 600, events });
  assert.equal(long.length, 4);
  assert.deepEqual(long.map(window => window.reason), ['early', 'first plate birth', 'densest FOOT_CONTACT bucket', 'late']);
  assert.deepEqual([long[0].startSeconds, long[3].endSeconds], [0, 600]);
  assert.equal(long[2].startSeconds, 250);
});

test('detail selection rejects short runs and does not duplicate the only complete ten-second window', () => {
  assert.throws(() => selectStratigraphyAudioZoomWindows({ simulationDurationSeconds: 5 }), /at least 10/);
  const windows = selectStratigraphyAudioZoomWindows({ simulationDurationSeconds: 10 });
  assert.equal(windows.length, 1);
  assert.deepEqual([windows[0].startSeconds, windows[0].endSeconds], [0, 10]);
});

test('overview maps actual continuous PCM and anchored events into fixed-size signal and contact panels', () => {
  const duration = 12, sampleRate = 16_000, sampleCount = duration * sampleRate;
  const left = Float32Array.from({ length: sampleCount }, (_, i) => .5 * Math.sin(2 * Math.PI * 440 * i / sampleRate));
  const right = Float32Array.from({ length: sampleCount }, (_, i) => .25 * Math.sin(2 * Math.PI * 880 * i / sampleRate));
  const eventList = [
    { type: 'PLATE_BIRTH', simulationTimeMs: 4000, payload: { id: 'plate-1' } },
    { type: 'PLATE_BIRTH', simulationTimeMs: 8000, payload: { id: 'plate-2' } },
    { type: 'PLATE_BIRTH', simulationTimeMs: 9000, payload: { id: 'plate-3' } },
    { type: 'PLATE_REMOVAL', simulationTimeMs: 10_000, payload: { id: 'plate-2' } },
    { type: 'FOOT_CONTACT', simulationTimeMs: 2500, payload: { contacts: [{}, {}, {}] } },
    { type: 'FOOT_CONTACT', simulationTimeMs: 11_500, payload: { contacts: [{}] } }
  ];
  const beforeLeft = left[1234], beforeRight = right[1234];
  const overview = buildStratigraphyAudioOverview({ channels: { left, right }, sampleRate,
    simulationDurationSeconds: duration, clockAnchors: anchors(duration, sampleCount), events: eventList });

  assert.equal(overview.presetId, STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.id);
  assert.equal(overview.sourceDurationSeconds, duration);
  assert.equal(overview.channels.left.spectrogram.width, 1760);
  assert.equal(overview.channels.left.spectrogram.height, 326);
  assert.equal(overview.channels.left.spectrogram.luminance.length, 1760 * 326);
  assert.equal(overview.channels.left.waveform.length, 1760);
  assert.equal(overview.contactBuckets.length, 2);
  assert.deepEqual(overview.contactBuckets.map(bucket => bucket.count), [3, 1]);
  assert.equal(overview.contactBuckets[0].fillRatio, 3 / 2400);
  assert.deepEqual(overview.overlays.plateBirths.map(event => [event.label, event.layerChange]), [['P1', '0→1'], ['P2', '1→2'], ['P3', '2→3']]);
  assert.deepEqual(overview.overlays.plateRemovals.map(event => event.layerChange), ['3→2']);
  assert.ok(overview.overlays.zooms.every(zoom => zoom.channels.left.spectrogram.fftSize === 1024
    && zoom.channels.left.spectrogram.hopSize === 256));
  assert.ok(overview.channels.left.spectrogram.luminance.every(value => Number.isInteger(value) && value >= 0 && value <= 255));
  assert.equal(left[1234], beforeLeft);
  assert.equal(right[1234], beforeRight);
});

test('waveform and spectrogram timeline columns follow nonuniform simulation/audio clock anchors', () => {
  const duration = 12, sampleRate = 16_000, sampleCount = duration * sampleRate;
  const left = new Float32Array(sampleCount), right = new Float32Array(sampleCount);
  left[96_000] = .8;
  const overview = buildStratigraphyAudioOverview({ channels: { left, right }, sampleRate,
    simulationDurationSeconds: duration,
    clockAnchors: [
      { simulationTimeMs: 0, audioSampleIndex: 0 },
      { simulationTimeMs: 6000, audioSampleIndex: 144_000 },
      { simulationTimeMs: 12_000, audioSampleIndex: sampleCount }
    ], events: [{ type: 'FOOT_CONTACT', simulationTimeMs: 4000, payload: { contacts: [{}] } }] });
  const waveformPeakBin = overview.channels.left.waveform.findIndex(bin => bin.max > .79);
  assert.ok(waveformPeakBin >= 580 && waveformPeakBin <= 600,
    'the sample at 6 seconds of audio maps to 4 seconds on the anchored simulation axis');
  const zoom = overview.overlays.zooms[0].channels.left;
  const zoomPeakBin = zoom.waveform.findIndex(bin => bin.max > .79);
  assert.ok(zoomPeakBin >= 658 && zoomPeakBin <= 662,
    'detail keeps ten audio seconds so the impulse remains at six audio seconds');
  assert.equal(overview.overlays.zooms[0].audioDurationSeconds, 10);
  assert.equal(overview.overlays.zooms[0].events[0].audioOffsetSeconds, 6);
  const spectrum = zoom.spectrogram;
  const maximum = Math.max(...spectrum.luminance.subarray(0, spectrum.width));
  const peakColumn = spectrum.luminance.subarray(0, spectrum.width).indexOf(maximum);
  assert.ok(peakColumn >= 645 && peakColumn <= 675);
  assert.deepEqual([spectrum.width, spectrum.height], [1100, 350]);
});

test('ten-second zoom renderer accepts actual builder output with fixed grayscale pixel panels', () => {
  const samples = new Float32Array(16_000 * 10);
  const overview = buildStratigraphyAudioOverview({ channels: { left: samples, right: samples },
    sampleRate: 16_000, simulationDurationSeconds: 10, clockAnchors: anchors(10, samples.length) });
  const context = { fillRect() {}, fillText() {}, drawImage() {}, strokeRect() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    putImageData() {}, createImageData(width, height) {
      assert.ok(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0);
      return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    } };
  const canvas = { getContext: () => context };
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  try {
    renderStratigraphyAudioZooms(canvas, overview);
    assert.deepEqual([canvas.width, canvas.height], [1200, 1000]);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('WAV decoder accepts little-endian IEEE float32 stereo and rejects incompatible layouts', () => {
  const bytes = new ArrayBuffer(52), view = new DataView(bytes);
  const tag = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  tag(0, 'RIFF'); view.setUint32(4, 44, true); tag(8, 'WAVE');
  tag(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, 2, true);
  view.setUint32(24, 48_000, true); view.setUint32(28, 48_000 * 8, true); view.setUint16(32, 8, true); view.setUint16(34, 32, true);
  tag(36, 'data'); view.setUint32(40, 8, true); view.setFloat32(44, .25, true); view.setFloat32(48, -.5, true);
  const decoded = decodeStereoFloatWav(bytes);
  assert.equal(decoded.sampleRate, 48_000);
  assert.equal(decoded.sampleCount, 1);
  assert.equal(decoded.channels.left[0], .25);
  assert.equal(decoded.channels.right[0], -.5);
  view.setUint16(20, 1, true);
  assert.throws(() => decodeStereoFloatWav(bytes), /IEEE float32 stereo/);
});

test('overview renderer keeps event and waveform styling grayscale, fixed-weight, and clear of spectra', () => {
  const styles = [], labelRows = [], lineWidths = [];
  const makeCanvas = () => {
    const context = {
      createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
      fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
      fillText(text, x, y) { if (String(text).startsWith('P1 ')) labelRows.push(y); },
      putImageData() {}, drawImage() {}, setLineDash() {}
    };
    for (const property of ['fillStyle', 'strokeStyle', 'lineWidth']) {
      let value;
      Object.defineProperty(context, property, { get: () => value, set: next => {
        value = next;
        if (property === 'lineWidth') lineWidths.push(next);
        else styles.push(next);
      } });
    }
    return { width: 0, height: 0, getContext: () => context };
  };
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => makeCanvas() };
  try {
    const spec = { width: 1, height: 1, luminance: new Uint8Array([0]) };
    const waveform = [{ min: -.5, max: .5 }];
    const overview = {
      presetId: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET.id,
      simulationDurationSeconds: 180,
      channels: { left: { waveform, spectrogram: spec }, right: { waveform, spectrogram: spec } },
      contactBuckets: [{ count: 1, fillRatio: .1 }],
      overlays: {
        plateBirths: [{ type: 'PLATE_BIRTH', simulationTimeMs: 5000, label: 'P1', layerChange: '0→1' }],
        plateRemovals: []
      }
    };
    const canvas = makeCanvas();
    renderStratigraphyAudioOverview(canvas, overview);
    assert.deepEqual([canvas.width, canvas.height], [1800, 1200]);
    assert.deepEqual(labelRows, [133]);
    assert.ok(styles.every(isGrayscaleStyle), `expected grayscale CSS colors only, got ${styles.join(', ')}`);
    assert.ok(styles.includes('rgb(100,100,100)'), 'event marks use a fixed neutral grayscale');
    assert.ok(styles.includes('rgb(24,24,24)'), 'waveform uses the frozen luminance 24');
    assert.ok(styles.includes('rgb(180,180,180)'), 'waveform axis uses the frozen luminance 180');
    assert.ok(lineWidths.every(width => width === 1), 'waveform and markers remain one pixel wide');
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});

function isGrayscaleStyle(style) {
  const rgb = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(style);
  if (rgb) return rgb[1] === rgb[2] && rgb[2] === rgb[3];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(style);
  if (!hex) return false;
  const value = hex[1].length === 3 ? [...hex[1]].map(char => char + char) : [hex[1].slice(0, 2), hex[1].slice(2, 4), hex[1].slice(4, 6)];
  return value[0] === value[1] && value[1] === value[2];
}

test('overview rejects unanchored, mismatched, or non-continuous input contracts', () => {
  const channel = new Float32Array(2048);
  const common = { channels: { left: channel, right: channel }, sampleRate: 16_000,
    simulationDurationSeconds: 1, clockAnchors: anchors(1, channel.length), events: [] };
  assert.throws(() => buildStratigraphyAudioOverview({ ...common, clockAnchors: [] }), /anchors/);
  assert.throws(() => buildStratigraphyAudioOverview({ ...common, channels: { left: channel, right: new Float32Array(4) } }), /same non-zero/);
  assert.throws(() => buildStratigraphyAudioOverview({ ...common, clockAnchors: [{ simulationTimeMs: 0, audioSampleIndex: 0 }, { simulationTimeMs: 900, audioSampleIndex: 2048 }] }), /span simulation start\/end/);
});
