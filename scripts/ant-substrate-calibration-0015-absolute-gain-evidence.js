import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { gunzipSync } from 'node:zlib';
import { decodeStereoFloatWav } from './stratigraphy-audio-overview.js';

const sourceDir = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/audio/calibration-0.015');
const outputDir = resolve('docs/ant/evidence/2026-10-08-candidate-d-absolute-level');
const dReport = JSON.parse(await readFile(resolve(sourceDir, 'calibration-report.json'), 'utf8'));
const audioRoot = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/audio');
const baseReport = JSON.parse(await readFile(resolve(audioRoot, 'audio-ab-report.json'), 'utf8'));
assert.equal(dReport.settings.D.substrateOutputRatio, 0.015);
assert.equal(dReport.settings.D.plateReadoutMix, 1);
assert.equal(dReport.settings.D.sphereReadoutMix, '1/sqrt(12)');
assert.equal(dReport.settings.D.substrateInternalReadout, 8);
assert.equal(dReport.settings.D.substrateDamping, 1);
assert.equal(dReport.settings.retainedPlateBaseline.contactPulseMs, 3);
assert.equal(dReport.settings.retainedPlateBaseline.recoveryMs, 75);
assert.equal(dReport.settings.retainedPlateBaseline.dampingMultiplier, 50);
assert.equal(dReport.frozenInput.seed, 20261005);
assert.equal(dReport.frozenInput.p1AcceptedStrikes, 63);
assert.equal(dReport.frozenInput.matchedUniqueParentGroups, 44);

const sha = value => createHash('sha256').update(value).digest('hex');
const dbfs = value => value > 0 ? 20 * Math.log10(value) : null;
const dbRatio = (a, b) => a > 0 && b > 0 ? 20 * Math.log10(a / b) : null;
const readSource = async key => {
  const source = dReport.outputs[key];
  const bytes = await readFile(resolve(sourceDir, source.path));
  assert.equal(sha(bytes), source.sha256, `${key} frozen D source WAV hash`);
  const wav = decodeStereoFloatWav(bytes);
  assert.equal(wav.sampleRate, 48000);
  assert.equal(wav.sampleCount, 480000);
  return { bytes, wav, sha256: source.sha256, path: source.path };
};
const sourceStems = {
  p1: await readSource('firstBirthBornD'),
  substrate: await readSource('firstBirthSubstrateD'),
  sum: await readSource('firstBirthSumD')
};
const sameLength = Object.values(sourceStems).every(({ wav }) => wav.sampleCount === sourceStems.p1.wav.sampleCount);
assert.equal(sameLength, true);
let sourceSumMismatchSamples = 0;
for (let i = 0; i < sourceStems.p1.wav.sampleCount; i++) {
  if (Math.fround(sourceStems.p1.wav.channels.left[i] + sourceStems.substrate.wav.channels.left[i]) !== sourceStems.sum.wav.channels.left[i]
    || Math.fround(sourceStems.p1.wav.channels.right[i] + sourceStems.substrate.wav.channels.right[i]) !== sourceStems.sum.wav.channels.right[i]) {
    sourceSumMismatchSamples++;
  }
}
assert.equal(sourceSumMismatchSamples, 0, 'frozen D sum must equal the exact frozen P1 + substrate samplewise sum');

const inputBytes = await readFile(resolve(audioRoot, dReport.frozenInput.inputFile));
assert.equal(sha(inputBytes), dReport.frozenInput.inputGzipSha256);
const recording = JSON.parse(gunzipSync(inputBytes).toString('utf8'));
const birthMs = dReport.frozenInput.firstPlateBirthSeconds * 1000;
assert.equal(birthMs, 103016.66666667376);
const p1Events = baseReport.sourceEvents.schedules.postbirthBorn;
assert.equal(p1Events.length, 63);
assert.equal(sha(JSON.stringify(p1Events)), dReport.frozenInput.p1ScheduleSha256);
const p1Frames = p1Events.map(event => event.frame);
const contactMarkers = recording.contacts
  .filter(row => row.simulationTimeMs >= birthMs && row.simulationTimeMs < birthMs + 10000)
  .map(row => ({ type: 'FOOT_CONTACT', simulationTimeMs: row.simulationTimeMs - birthMs, payload: row.payload }));
const plotEvents = [...contactMarkers, { type: 'PLATE_BIRTH', label: 'P1', simulationTimeMs: 0,
  payload: { id: dReport.frozenInput.firstPlateId } }];

function encodeWav(left, right) {
  assert.equal(left.length, right.length);
  const bytes = Buffer.alloc(44 + left.length * 8);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  bytes.write('RIFF', 0); view.setUint32(4, bytes.length - 8, true); bytes.write('WAVEfmt ', 8);
  view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, 2, true);
  view.setUint32(24, 48000, true); view.setUint32(28, 48000 * 8, true); view.setUint16(32, 8, true);
  view.setUint16(34, 32, true); bytes.write('data', 36); view.setUint32(40, left.length * 8, true);
  for (let i = 0, offset = 44; i < left.length; i++, offset += 8) {
    view.setFloat32(offset, left[i], true); view.setFloat32(offset + 4, right[i], true);
  }
  return bytes;
}
function gainWav(wav, gain) {
  return encodeWav(
    wav.channels.left.map(sample => Math.fround(sample * gain)),
    wav.channels.right.map(sample => Math.fround(sample * gain))
  );
}
function measure(wav) {
  const channel = samples => {
    let squareSum = 0, peak = 0, nonFiniteSamples = 0, clippingSamples = 0;
    for (const sample of samples) {
      if (!Number.isFinite(sample)) { nonFiniteSamples++; continue; }
      peak = Math.max(peak, Math.abs(sample)); squareSum += sample * sample;
      if (Math.abs(sample) >= 1) clippingSamples++;
    }
    const rms = Math.sqrt(squareSum / samples.length);
    return { peak, peakDbfs: dbfs(peak), rms, rmsDbfs: dbfs(rms), nonFiniteSamples, clippingSamples };
  };
  const left = channel(wav.channels.left), right = channel(wav.channels.right);
  const pooledRms = Math.sqrt((left.rms ** 2 + right.rms ** 2) / 2);
  const peak = Math.max(left.peak, right.peak);
  return { sampleRate: wav.sampleRate, sampleFormat: 'WAV IEEE float32 stereo', samplesPerChannel: wav.sampleCount,
    durationSeconds: wav.sampleCount / wav.sampleRate, left, right, peak, peakDbfs: dbfs(peak),
    pooledRms, pooledRmsDbfs: dbfs(pooledRms), nonFiniteSamples: left.nonFiniteSamples + right.nonFiniteSamples,
    clippingSamples: left.clippingSamples + right.clippingSamples };
}
function eventWindows(wav, frames, durationMs) {
  const length = durationMs * 48, pooled = [], left = [], right = [];
  for (const frame of frames) {
    if (frame < 0 || frame + length > wav.sampleCount) continue;
    let sumL = 0, sumR = 0;
    for (let i = frame; i < frame + length; i++) {
      sumL += wav.channels.left[i] ** 2; sumR += wav.channels.right[i] ** 2;
    }
    left.push(Math.sqrt(sumL / length)); right.push(Math.sqrt(sumR / length));
    pooled.push(Math.sqrt((sumL + sumR) / (length * 2)));
  }
  const median = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  };
  const pooledMedianRms = median(pooled);
  return { eligibleWindows: pooled.length, excludedIncompleteTailWindows: frames.length - pooled.length,
    pooledMedianRms, pooledMedianRmsDbfs: dbfs(pooledMedianRms),
    leftMedianRms: median(left), rightMedianRms: median(right) };
}

await mkdir(outputDir, { recursive: true });
const sourceMetrics = Object.fromEntries(Object.entries(sourceStems).map(([stem, source]) => [stem, measure(source.wav)]));
const gains = [18, 20].map(decibels => ({ decibels, linear: 10 ** (decibels / 20), tag: `plus${decibels}` }));
const outputs = {};
const outputWavs = {};
const plotTracks = [];
for (const gain of gains) {
  outputs[gain.tag] = {};
  outputWavs[gain.tag] = {};
  for (const stem of ['p1', 'substrate', 'sum']) {
    const source = sourceStems[stem];
    const filename = `candidate-d_gain-${gain.tag}_${stem}.wav`;
    const bytes = gainWav(source.wav, gain.linear);
    await writeFile(resolve(outputDir, filename), bytes);
    const wav = decodeStereoFloatWav(bytes);
    outputWavs[gain.tag][stem] = wav;
    outputs[gain.tag][stem] = { path: filename, sha256: sha(bytes), gainDb: gain.decibels,
      linearGain: gain.linear, sourcePath: source.path, sourceSha256: source.sha256, metrics: measure(wav) };
    plotTracks.push({ id: `${gain.tag}-${stem}`, label: `+${gain.decibels} dB shared gain · ${stem}`,
      file: `./${filename}`, window: 'firstBirth' });
  }
}
const eventAlignedRms = Object.fromEntries(gains.map(gain => [gain.tag,
  Object.fromEntries([100, 250, 500].map(durationMs => [durationMs, Object.fromEntries(['p1', 'substrate', 'sum'].map(stem => {
    return [stem, eventWindows(outputWavs[gain.tag][stem], p1Frames, durationMs)];
  }))]))]));
const relativeLevelCheck = Object.fromEntries(gains.map(gain => {
  const p1 = outputs[gain.tag].p1.metrics.pooledRms;
  const substrate = outputs[gain.tag].substrate.metrics.pooledRms;
  const sum = outputs[gain.tag].sum.metrics.pooledRms;
  const sourceSubstrateVsP1Db = dbRatio(sourceMetrics.substrate.pooledRms, sourceMetrics.p1.pooledRms);
  const sourceSumVsP1Db = dbRatio(sourceMetrics.sum.pooledRms, sourceMetrics.p1.pooledRms);
  const outputSubstrateVsP1Db = dbRatio(substrate, p1);
  const outputSumVsP1Db = dbRatio(sum, p1);
  assert.ok(Math.abs(outputSubstrateVsP1Db - sourceSubstrateVsP1Db) < 1e-4);
  assert.ok(Math.abs(outputSumVsP1Db - sourceSumVsP1Db) < 1e-4);
  return [gain.tag, { sourceSubstrateVsP1Db, outputSubstrateVsP1Db,
    substrateRelativeLevelDeltaDb: outputSubstrateVsP1Db - sourceSubstrateVsP1Db,
    sourceSumVsP1Db, outputSumVsP1Db, sumRelativeLevelDeltaDb: outputSumVsP1Db - sourceSumVsP1Db }];
}));

const listeningHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Candidate D shared post-gain listening</title>
<style>body{font:16px system-ui,sans-serif;max-width:1120px;margin:32px auto;padding:0 20px;color:#18202a}h1{font-size:1.6rem}section{border-top:1px solid #ccd2da;padding:16px 0}article{display:grid;grid-template-columns:minmax(240px,1fr) minmax(320px,2fr) auto;gap:12px;align-items:center;padding:10px 0}audio{width:100%}button{padding:7px 10px}small{color:#52606d}</style>
<h1>Candidate D · shared absolute-level gain</h1><p>Same first-birth 10 s PCM range. All stems use the same fixed post-gain within each version; no normalization or extra mastering.</p>
<section><h2>+18 dB · linear ×${gains[0].linear.toFixed(6)}</h2>${plotTracks.filter(t=>t.id.startsWith('plus18')).map(track=>`<article><strong>${track.label}</strong><audio id="${track.id}" controls preload="metadata" src="${track.file}"></audio><button data-play="${track.id}">Play check</button></article>`).join('')}</section>
<section><h2>+20 dB · linear ×${gains[1].linear.toFixed(6)}</h2>${plotTracks.filter(t=>t.id.startsWith('plus20')).map(track=>`<article><strong>${track.label}</strong><audio id="${track.id}" controls preload="metadata" src="${track.file}"></audio><button data-play="${track.id}">Play check</button></article>`).join('')}</section>
<p><small>Browser Play check starts a file for 0.7 seconds at native file level. Download the separate WAV links for remote direct listening.</small></p>
<script>for(const button of document.querySelectorAll('[data-play]'))button.addEventListener('click',async()=>{const audio=document.getElementById(button.dataset.play);audio.currentTime=0;await audio.play();button.textContent='Playing';setTimeout(()=>{audio.pause();button.textContent='Play check'},700)})</script></html>`;
await writeFile(resolve(outputDir, 'listening.html'), listeningHtml);

const repoRoot = resolve('.');
const server = createServer(async (request, response) => {
  try {
    const target = resolve(repoRoot, `.${decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)}`);
    if (!target.startsWith(`${repoRoot}${sep}`)) { response.writeHead(403); response.end(); return; }
    const bytes = await readFile(target);
    const type = target.endsWith('.js') ? 'text/javascript; charset=utf-8'
      : target.endsWith('.html') ? 'text/html; charset=utf-8'
      : target.endsWith('.wav') ? 'audio/wav'
      : target.endsWith('.png') ? 'image/png' : 'application/octet-stream';
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]), end = Math.min(Number(range[2] || bytes.length - 1), bytes.length - 1);
      if (start > end || start >= bytes.length) { response.writeHead(416); response.end(); return; }
      response.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': end - start + 1 });
      response.end(bytes.subarray(start, end + 1)); return;
    }
    response.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': bytes.length });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
let browser;
const browserCheck = { loaded: [], playbackStarted: [], pageErrors: [] };
const images = [];
try {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen);
  });
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 980 } });
  page.on('pageerror', error => browserCheck.pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/docs/ant/evidence/2026-10-08-candidate-d-absolute-level/listening.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('audio')]
    .every(audio => audio.readyState >= 1 && Number.isFinite(audio.duration) && Math.abs(audio.duration - 10) < 1e-6), undefined, { timeout: 12000 });
  browserCheck.loaded = await page.locator('audio').evaluateAll(audios => audios.map(audio => ({ id: audio.id,
    durationSeconds: audio.duration, readyState: audio.readyState, source: new URL(audio.currentSrc).pathname })));

  const imageData = await page.evaluate(async ({ tracks, events }) => {
    const { buildStratigraphyAudioOverview, renderStratigraphyAudioOverview } = await import('/scripts/stratigraphy-audio-overview.js');
    const result = [];
    for (const track of tracks) {
      const response = await fetch(track.file);
      if (!response.ok) throw new Error(`Could not load ${track.file}: ${response.status}`);
      const bytes = await response.arrayBuffer(), view = new DataView(bytes), count = view.getUint32(40, true) / 8;
      const left = new Float32Array(count), right = new Float32Array(count);
      for (let i = 0, offset = 44; i < count; i++, offset += 8) {
        left[i] = view.getFloat32(offset, true); right[i] = view.getFloat32(offset + 4, true);
      }
      const overview = buildStratigraphyAudioOverview({ channels: { left, right }, sampleRate: 48000,
        simulationDurationSeconds: 10, clockAnchors: [{ simulationTimeMs: 0, audioSampleIndex: 0 },
          { simulationTimeMs: 10000, audioSampleIndex: count }], events });
      const canvas = document.createElement('canvas'); renderStratigraphyAudioOverview(canvas, overview);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, 28);
      ctx.fillStyle = '#111'; ctx.font = '16px sans-serif'; ctx.fillText(`${track.label} · fixed scale · 0–10 s`, 16, 20);
      result.push({ name: `${track.id}-fixed-scale-waveform-spectrogram.png`, png: canvas.toDataURL('image/png').split(',')[1] });
    }
    return result;
  }, { tracks: plotTracks, events: plotEvents });
  for (const image of imageData) {
    const bytes = Buffer.from(image.png, 'base64');
    await writeFile(resolve(outputDir, image.name), bytes);
    images.push({ file: image.name, sha256: sha(bytes), bytes: bytes.length });
  }
  for (const track of plotTracks) {
    await page.locator(`[data-play="${track.id}"]`).click();
    await page.waitForFunction(id => !document.getElementById(id).paused
      && document.getElementById(id).currentTime > 0, track.id, { timeout: 5000 });
    browserCheck.playbackStarted.push(track.id);
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: resolve(outputDir, 'browser-listening-check.png'), fullPage: true });
  assert.deepEqual(browserCheck.pageErrors, []);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolveClose => server.close(resolveClose));
}

const report = {
  status: 'completed-frozen-candidate-d-shared-absolute-level-gain',
  purpose: 'Absolute-level listening and fixed-scale readability only; no relative calibration or production behavior change.',
  candidateD: { reportPath: 'docs/ant/evidence/2026-10-07-base-substrate-debug/audio/calibration-0.015/calibration-report.json',
    substrateOutputRatio: dReport.settings.D.substrateOutputRatio, plateReadoutMix: dReport.settings.D.plateReadoutMix,
    sphereReadoutMix: dReport.settings.D.sphereReadoutMix, substrateInternalReadout: dReport.settings.D.substrateInternalReadout,
    substrateDamping: dReport.settings.D.substrateDamping, masterVolume: dReport.settings.D.masterVolume,
    limiter: dReport.settings.D.existingLimiter, contactPulseMs: dReport.settings.retainedPlateBaseline.contactPulseMs,
    recoveryMs: dReport.settings.retainedPlateBaseline.recoveryMs, plateDampingMultiplier: dReport.settings.retainedPlateBaseline.dampingMultiplier },
  frozenInput: { seed: dReport.frozenInput.seed, firstPlateId: dReport.frozenInput.firstPlateId,
    firstPlateBirthSeconds: dReport.frozenInput.firstPlateBirthSeconds, descriptorSha256: dReport.frozenInput.descriptorSha256,
    inputFile: dReport.frozenInput.inputFile, inputGzipSha256: dReport.frozenInput.inputGzipSha256,
    acceptedP1Strikes: p1Events.length, p1ScheduleSha256: sha(JSON.stringify(p1Events)),
    matchedParentGroups: dReport.frozenInput.matchedUniqueParentGroups,
    matchedParentGroupScheduleSha256: dReport.frozenInput.matchedSubstrateScheduleSha256 },
  window: { sampleRateHz: 48000, samplesPerChannel: 480000, durationSeconds: 10,
    simulationStartMs: birthMs, simulationEndMs: birthMs + 10000, halfOpen: true,
    clockAnchors: [{ simulationTimeMs: birthMs, audioSampleIndex: 0 }, { simulationTimeMs: birthMs + 10000, audioSampleIndex: 480000 }],
    footContactMarkers: contactMarkers.length, firstPlateBirthMarker: { type: 'PLATE_BIRTH', simulationTimeMs: birthMs, audioSampleIndex: 0 } },
  sourceStems: Object.fromEntries(Object.entries(sourceStems).map(([key, value]) => [key, { path: value.path, sha256: value.sha256 }])),
  gainPolicy: { appliedAfterFrozenCandidateDStem: true, appliedEquallyToP1SubstrateAndSum: true,
    independentlyNormalized: false, extraLimiterOrMastering: false, sourceSumMismatchSamples,
    thresholds: { clipping: '|sample| >= 1' }, gains },
  outputs, sourceMetrics, eventAlignedRms, relativeLevelCheck, images, browserCheck: { ...browserCheck, screenshot: 'browser-listening-check.png',
    listeningPage: 'listening.html', interpretation: 'Playback path checked; human listening judgment is external.' },
  renderer: dReport.renderer
};
await writeFile(resolve(outputDir, 'absolute-gain-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: resolve(outputDir, 'absolute-gain-report.json'), outputs, eventAlignedRms,
  browserCheck, images }, null, 2));
