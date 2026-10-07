import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { ANT_BASE_SUBSTRATE_DAMPING, ANT_BASE_SUBSTRATE_OUTPUT_RATIO } from '../src/lib/audio/AntEnvironmentAudioBridge.js';
import { decodeStereoFloatWav } from './stratigraphy-audio-overview.js';

const audioRoot = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/audio');
const output = resolve(audioRoot, 'calibration-0.015');
const ratioA = 0.22, ratioB = ANT_BASE_SUBSTRATE_OUTPUT_RATIO;
const ratioScale = ratioB / ratioA;
const masterVolume = 0.35;
const baseReport = JSON.parse(await readFile(resolve(audioRoot, 'audio-ab-report.json'), 'utf8'));
const mixReport = JSON.parse(await readFile(resolve(audioRoot, 'mix-audibility/mix-ab-report.json'), 'utf8'));
const eventReport = JSON.parse(await readFile(resolve(audioRoot, 'event-count-matched-substrate/event-count-matched-report.json'), 'utf8'));
const candidateBReport = JSON.parse(await readFile(resolve(audioRoot, 'calibration-0.025/calibration-report.json'), 'utf8'));
const candidateCReport = JSON.parse(await readFile(resolve(audioRoot, 'calibration-0.010/calibration-report.json'), 'utf8'));
const scheduleReport = eventReport.scheduleHashes;
assert.equal(ratioB, 0.015);
assert.equal(ANT_BASE_SUBSTRATE_DAMPING, 1);
assert.equal(eventReport.settings.substrateOutputRatio, ratioA);

const sha = value => createHash('sha256').update(value).digest('hex');
const dbfs = value => value > 0 ? 20 * Math.log10(value) : null;
const dbRatio = (a, b) => a > 0 && b > 0 ? 20 * Math.log10(a / b) : null;
const readChecked = async (file, expectedSha) => {
  const bytes = await readFile(resolve(audioRoot, file));
  assert.equal(sha(bytes), expectedSha, `frozen PCM SHA: ${file}`);
  const wav = decodeStereoFloatWav(bytes);
  assert.equal(wav.sampleRate, 48000);
  assert.equal(wav.sampleCount, 480000);
  return { bytes, wav };
};
const readPrior = (directory, report, key) => readChecked(`${directory}/${report.outputs[key].path}`, report.outputs[key].sha256);
const reportPcm = (file, report) => report.outputs[file]?.sha256;
const preOff = await readChecked('prebirth-off-silence-10s-48khz-f32.wav', reportPcm('prebirth-off-silence-10s-48khz-f32.wav', baseReport));
const preOnA = await readChecked('prebirth-on-substrate-10s-48khz-f32.wav', reportPcm('prebirth-on-substrate-10s-48khz-f32.wav', baseReport));
const postOffA = await readChecked('postbirth-off-born-only-10s-48khz-f32.wav', reportPcm('postbirth-off-born-only-10s-48khz-f32.wav', baseReport));
const postOnA = await readChecked('postbirth-on-summed-10s-48khz-f32.wav', reportPcm('postbirth-on-summed-10s-48khz-f32.wav', baseReport));
const postBaseA = await readChecked('postbirth-substrate-only-10s-48khz-f32.wav', reportPcm('postbirth-substrate-only-10s-48khz-f32.wav', baseReport));
const bPreOn = await readPrior('calibration-0.025', candidateBReport, 'prebirthOnB');
const bSum = await readPrior('calibration-0.025', candidateBReport, 'firstBirthSumB');
const cPreOn = await readPrior('calibration-0.010', candidateCReport, 'prebirthOnC');
const cSum = await readPrior('calibration-0.010', candidateCReport, 'firstBirthSumC');
const bornA = await readChecked('mix-audibility/A-baseline-born-only-10s-48khz-f32.wav', mixReport.comparison.A.pcmSha256);
const bornB = await readChecked('mix-audibility/B-plate-unscaled-born-only-10s-48khz-f32.wav', mixReport.comparison.B.pcmSha256);
const matchedSubstrateA = await readChecked('event-count-matched-substrate/substrate-matched-parent-groups-configured-10s-48khz-f32.wav',
  eventReport.outputs['substrate-matched-parent-groups-configured-10s-48khz-f32.wav'].sha256);
const currentWorklet = await readFile(resolve('static/worklets/surface-plate.worklet.js'));
assert.equal(sha(currentWorklet), mixReport.comparison.B.workletSha256,
  'production worklet must match the previously frozen Plate-unscaled B capture');
assert.equal(mixReport.scheduleEquality.scheduleSha256, scheduleReport.p1AcceptedScheduleSha256);

const inputBytes = await readFile(resolve(audioRoot, baseReport.sourceRun.eventStreamFile));
assert.equal(sha(inputBytes), baseReport.sourceRun.gzipSha256, 'frozen seed input hash');
const recording = JSON.parse(gunzipSync(inputBytes).toString('utf8'));
const birthMs = baseReport.sourceRun.firstPlateBirthSeconds * 1000;
assert.equal(birthMs, 103016.66666667376);
assert.equal(baseReport.sourceRun.seed, 20261005);
assert.equal(mixReport.sourceRun.acceptedP1Strikes, 63);
const p1Events = baseReport.sourceEvents.schedules.postbirthBorn;
assert.equal(sha(JSON.stringify(p1Events)), scheduleReport.p1AcceptedScheduleSha256);
const matchedRows = eventReport.eventMapping.matchedContactGroupRows;
const matchedEvents = matchedRows.map(row => ({
  frame: Math.round((row.simulationTimeMs - birthMs) * 48),
  payload: recording.legacyStrikes[row.contactIndex].payload
})).sort((a, b) => a.frame - b.frame);
assert.equal(matchedEvents.length, 44);
assert.equal(sha(JSON.stringify(matchedEvents)), scheduleReport.matchedSubstrateScheduleSha256);
assert.equal(p1Events.length, 63);

function encodeWav(left, right) {
  assert.equal(left.length, right.length);
  const bytes = Buffer.alloc(44 + left.length * 8), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  bytes.write('RIFF', 0); view.setUint32(4, bytes.length - 8, true); bytes.write('WAVEfmt ', 8);
  view.setUint32(16, 16, true); view.setUint16(20, 3, true); view.setUint16(22, 2, true);
  view.setUint32(24, 48000, true); view.setUint32(28, 48000 * 8, true); view.setUint16(32, 8, true);
  view.setUint16(34, 32, true); bytes.write('data', 36); view.setUint32(40, left.length * 8, true);
  for (let i = 0, offset = 44; i < left.length; i++, offset += 8) {
    view.setFloat32(offset, left[i], true); view.setFloat32(offset + 4, right[i], true);
  }
  return bytes;
}
function rescale(wav, factor) {
  return encodeWav(wav.channels.left.map(value => Math.fround(value * factor)),
    wav.channels.right.map(value => Math.fround(value * factor)));
}
function sumWavs(a, b) {
  const left = new Float32Array(a.sampleCount), right = new Float32Array(a.sampleCount);
  for (let i = 0; i < a.sampleCount; i++) {
    left[i] = Math.fround(a.channels.left[i] + b.channels.left[i]);
    right[i] = Math.fround(a.channels.right[i] + b.channels.right[i]);
  }
  return encodeWav(left, right);
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
  return { sampleRate: wav.sampleRate, samplesPerChannel: wav.sampleCount, durationSeconds: wav.sampleCount / wav.sampleRate,
    left, right, peak, peakDbfs: dbfs(peak), pooledRms, pooledRmsDbfs: dbfs(pooledRms),
    nonFiniteSamples: left.nonFiniteSamples + right.nonFiniteSamples,
    clippingSamples: left.clippingSamples + right.clippingSamples };
}
function eventWindows(wav, frames, durationMs) {
  const length = durationMs * 48;
  const pooled = [], left = [], right = [];
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
    return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  };
  return { eligibleWindows: pooled.length, excludedIncompleteTailWindows: frames.length - pooled.length,
    pooledMedianRms: median(pooled), pooledMedianRmsDbfs: dbfs(median(pooled)),
    leftMedianRms: median(left), rightMedianRms: median(right) };
}
async function writeCandidate(name, bytes) {
  await writeFile(resolve(output, name), bytes);
  return { bytes, sha256: sha(bytes), path: name, wav: decodeStereoFloatWav(bytes) };
}

await mkdir(output, { recursive: true });
const preOnB = await writeCandidate('D-prebirth-substrate-on-ratio-0.015-10s-48khz-f32.wav', rescale(preOnA.wav, ratioScale));
const matchedSubstrateB = await writeCandidate('D-matched-44-groups-ratio-0.015-10s-48khz-f32.wav', rescale(matchedSubstrateA.wav, ratioScale));
const postBaseB = await writeCandidate('D-first-birth-substrate-only-ratio-0.015-10s-48khz-f32.wav', rescale(postBaseA.wav, ratioScale));
const bornOnlyB = await writeCandidate('D-first-birth-born-only-10s-48khz-f32.wav', bornB.bytes);
const postOnB = await writeCandidate('D-first-birth-on-summed-10s-48khz-f32.wav', sumWavs(bornOnlyB.wav, postBaseB.wav));
const preOffWav = preOff.wav, bornOnlyA = await readChecked('postbirth-off-born-only-10s-48khz-f32.wav', reportPcm('postbirth-off-born-only-10s-48khz-f32.wav', baseReport));
const postOnBWav = postOnB.wav;

const audioWindows = {
  prebirth: { simulationStartMs: birthMs - 10000, simulationEndMs: birthMs, halfOpen: true,
    clockAnchors: [{ simulationTimeMs: birthMs - 10000, audioSampleIndex: 0 }, { simulationTimeMs: birthMs, audioSampleIndex: 480000 }],
    contacts: recording.contacts.filter(row => row.simulationTimeMs >= birthMs - 10000 && row.simulationTimeMs < birthMs) },
  firstBirth: { simulationStartMs: birthMs, simulationEndMs: birthMs + 10000, halfOpen: true,
    clockAnchors: [{ simulationTimeMs: birthMs, audioSampleIndex: 0 }, { simulationTimeMs: birthMs + 10000, audioSampleIndex: 480000 }],
    contacts: recording.contacts.filter(row => row.simulationTimeMs >= birthMs && row.simulationTimeMs < birthMs + 10000) }
};
const contactFrames = audioWindows.firstBirth.contacts.map(row => Math.round((row.simulationTimeMs - birthMs) * 48));
const eventAligned = Object.fromEntries([100, 250, 500].map(durationMs => [durationMs, {
  p1AcceptedStrikeSchedule: Object.fromEntries([
    ['A born-only (substrate Off)', bornA.wav], ['A base On .22 sum', postOnA.wav],
    ['D born-only (substrate Off)', bornOnlyB.wav], ['D base On .015 sum', postOnBWav],
    ['D matched 44-group substrate', matchedSubstrateB.wav], ['D all-event substrate', postBaseB.wav]
  ].map(([key, wav]) => [key, eventWindows(wav, p1Events.map(item => item.frame), durationMs)])),
  matchedGroupEventSchedule: Object.fromEntries([
    ['A matched 44-group substrate .22', matchedSubstrateA.wav], ['D matched 44-group substrate .015', matchedSubstrateB.wav]
  ].map(([key, wav]) => [key, eventWindows(wav, matchedEvents.map(item => item.frame), durationMs)])),
  allPostbirthContactSchedule: Object.fromEntries([
    ['A all-event substrate .22', postBaseA.wav], ['D all-event substrate .015', postBaseB.wav]
  ].map(([key, wav]) => [key, eventWindows(wav, baseReport.sourceEvents.schedules.postbirthBase.map(item => item.frame), durationMs)]))
} ]));

const tracks = [
  { id: 'pre-off', label: 'Pre-birth A · Base Off', file: '../prebirth-off-silence-10s-48khz-f32.wav', wav: preOffWav, window: 'prebirth' },
  { id: 'pre-on-b', label: 'Pre-birth B · Base On .025', file: '../calibration-0.025/' + candidateBReport.outputs.prebirthOnB.path, wav: bPreOn.wav, window: 'prebirth' },
  { id: 'pre-on-c', label: 'Pre-birth C · Base On .010', file: '../calibration-0.010/' + candidateCReport.outputs.prebirthOnC.path, wav: cPreOn.wav, window: 'prebirth' },
  { id: 'pre-on-d', label: 'Pre-birth D · Base On .015', file: './' + preOnB.path, wav: preOnB.wav, window: 'prebirth' },
  { id: 'post-off-a', label: 'First P1 A · Base Off / legacy Plate readout', file: '../postbirth-off-born-only-10s-48khz-f32.wav', wav: bornOnlyA.wav, window: 'firstBirth' },
  { id: 'post-on-b', label: 'First P1 B · Base On .025 / Plate ×1', file: '../calibration-0.025/' + candidateBReport.outputs.firstBirthSumB.path, wav: bSum.wav, window: 'firstBirth' },
  { id: 'post-on-c', label: 'First P1 C · Base On .010 / Plate ×1', file: '../calibration-0.010/' + candidateCReport.outputs.firstBirthSumC.path, wav: cSum.wav, window: 'firstBirth' },
  { id: 'post-on-d', label: 'First P1 D · Base On .015 / Plate ×1', file: './' + postOnB.path, wav: postOnB.wav, window: 'firstBirth' },
  { id: 'post-born-d', label: 'First P1 D · born Plate only', file: './' + bornOnlyB.path, wav: bornOnlyB.wav, window: 'firstBirth' },
  { id: 'post-base-d', label: 'First P1 D · substrate only .015', file: './' + postBaseB.path, wav: postBaseB.wav, window: 'firstBirth' }
];
const playerTracks = tracks.map(({ id, label, file, window }) => ({ id, label, file, window }));
const listeningHtml = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANT frozen substrate calibration .015</title>
<style>body{font:16px system-ui,sans-serif;max-width:1080px;margin:32px auto;padding:0 20px;color:#18202a}h1{font-size:1.6rem}section{border-top:1px solid #ccd2da;padding:16px 0}article{display:grid;grid-template-columns:minmax(220px,1fr) minmax(300px,2fr) auto;gap:12px;align-items:center;padding:10px 0}audio{width:100%}button{padding:7px 10px}small{color:#52606d}</style>
<h1>Frozen P1 / substrate calibration A/D</h1>
<p>Native 48 kHz float32 PCM; no normalization. Each file spans 10 seconds. Compare A/Base Off with B .025, C .010, and D .015.</p>
${['prebirth','firstBirth'].map((window, i) => `<section><h2>${i ? 'After first P1 birth' : 'Before first P1 birth'}</h2>${playerTracks.filter(t => t.window === window).map(t => `<article><strong>${t.label}</strong><audio id="${t.id}" controls preload="metadata" src="${t.file}"></audio><button data-play="${t.id}">Play check</button></article>`).join('')}</section>`).join('')}
<p><small>Browser play check starts the selected local PCM file for 0.7 seconds. Playback is at native file level; browser volume control remains available.</small></p>
<script>for(const button of document.querySelectorAll('[data-play]'))button.addEventListener('click',async()=>{const audio=document.getElementById(button.dataset.play);const status=document.getElementById(button.dataset.play+'-status');audio.currentTime=0;await audio.play();button.textContent='Playing';setTimeout(()=>{audio.pause();button.textContent='Play check'},700)})</script>
</html>`;
await writeFile(resolve(output, 'listening.html'), listeningHtml);

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
  } catch {
    response.writeHead(404); response.end();
  }
});
let browser;
const images = [];
const browserCheck = { playerLoaded: false, tracks: [], playbackStarted: [] };
try {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen);
  });
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 980 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/docs/ant/evidence/2026-10-07-base-substrate-debug/audio/calibration-0.015/listening.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('audio')]
    .every(audio => audio.readyState >= 1 && Number.isFinite(audio.duration)), undefined, { timeout: 12000 });
  browserCheck.playerLoaded = true;
  browserCheck.tracks = await page.locator('audio').evaluateAll(audios => audios.map(audio => ({ id: audio.id,
    durationSeconds: audio.duration, readyState: audio.readyState, source: new URL(audio.currentSrc).pathname })));

  const eventInputs = Object.fromEntries(Object.entries(audioWindows).map(([key, window]) => [key, {
    events: window.contacts.map(row => ({ type: 'FOOT_CONTACT', simulationTimeMs: row.simulationTimeMs - window.simulationStartMs,
      payload: row.payload })),
    durationSeconds: 10
  }]));
  eventInputs.firstBirth.events.push({ type: 'PLATE_BIRTH', label: 'P1', simulationTimeMs: 0,
    payload: { id: baseReport.sourceRun.firstPlateId } });
  const imageData = await page.evaluate(async ({ tracks, eventInputs }) => {
    const { buildStratigraphyAudioOverview, renderStratigraphyAudioOverview } = await import('/scripts/stratigraphy-audio-overview.js');
    const result = [];
    for (const track of tracks) {
      const response = await fetch(track.file);
      if (!response.ok) throw new Error(`Could not load ${track.file}: ${response.status}`);
      const bytes = await response.arrayBuffer();
      const view = new DataView(bytes), count = view.getUint32(40, true) / 8;
      const left = new Float32Array(count), right = new Float32Array(count);
      for (let i = 0, offset = 44; i < count; i++, offset += 8) { left[i] = view.getFloat32(offset, true); right[i] = view.getFloat32(offset + 4, true); }
      const timing = eventInputs[track.window];
      const overview = buildStratigraphyAudioOverview({ channels: { left, right }, sampleRate: 48000,
        simulationDurationSeconds: 10, clockAnchors: [{ simulationTimeMs: 0, audioSampleIndex: 0 },
          { simulationTimeMs: 10000, audioSampleIndex: count }], events: timing.events });
      const canvas = document.createElement('canvas'); renderStratigraphyAudioOverview(canvas, overview);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, 28);
      ctx.fillStyle = '#111'; ctx.font = '16px sans-serif'; ctx.fillText(`${track.label} · fixed scale · 0–10 s audio`, 16, 20);
      result.push({ name: `${track.id}-fixed-scale-waveform-spectrogram.png`, png: canvas.toDataURL('image/png').split(',')[1] });
    }
    return result;
  }, { tracks: playerTracks, eventInputs });
  for (const image of imageData) {
    const bytes = Buffer.from(image.png, 'base64');
    const file = resolve(output, image.name);
    await writeFile(file, bytes);
    images.push({ file: image.name, sha256: sha(bytes), bytes: bytes.length });
  }
  for (const id of ['pre-off', 'pre-on-b', 'pre-on-c', 'pre-on-d', 'post-off-a', 'post-on-b', 'post-on-c', 'post-on-d']) {
    await page.locator(`[data-play="${id}"]`).click();
    await page.waitForFunction(idValue => !document.getElementById(idValue).paused
      && document.getElementById(idValue).currentTime > 0, id, { timeout: 5000 });
    browserCheck.playbackStarted.push(id);
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: resolve(output, 'browser-listening-check.png'), fullPage: true });
  assert.deepEqual(errors, [], 'browser player and fixed-scale renderer page errors');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolveClose => server.close(resolveClose));
}

const metrics = {
  prebirth: { A_baseOff: measure(preOffWav), A_baseOn_0_22_reference: measure(preOnA.wav),
    D_baseOn_0_015: measure(preOnB.wav) },
  matchedEvents: { A_substrate_44_groups_0_22: measure(matchedSubstrateA.wav),
    D_substrate_44_groups_0_015: measure(matchedSubstrateB.wav),
    A_bornP1_63: measure(bornA.wav), D_bornP1_63: measure(bornB.wav) },
  firstBirth10s: { A_baseOff_bornP1: measure(bornOnlyA.wav), A_baseOn_0_22_sum: measure(postOnA.wav),
    A_baseOn_0_22_substrateOnly: measure(postBaseA.wav), D_baseOff_bornP1: measure(bornOnlyB.wav),
    D_baseOn_0_015_substrateOnly: measure(postBaseB.wav), D_baseOn_0_015_sum: measure(postOnBWav) }
};
function candidateSummary(report, letter, ratio, keys, eventLabels) {
  const first = report.metrics.firstBirth10s;
  const bornOnly = first[keys.born];
  const matched44 = report.metrics.matchedEvents[keys.matched];
  const allEvent = first[keys.substrate];
  const sum = first[keys.sum];
  const eventAligned = Object.fromEntries([100, 250, 500].map(ms => {
    const windows = report.eventAlignedRms[ms];
    return [ms, {
      bornOnlyP1StrikeMedian: windows.p1AcceptedStrikeSchedule[eventLabels.born].pooledMedianRms,
      matched44AtP1StrikesMedian: windows.p1AcceptedStrikeSchedule[eventLabels.matched].pooledMedianRms,
      allEventAtP1StrikesMedian: windows.p1AcceptedStrikeSchedule[eventLabels.allEvent].pooledMedianRms,
      sumAtP1StrikesMedian: windows.p1AcceptedStrikeSchedule[eventLabels.sum].pooledMedianRms,
      matched44OwnEventsMedian: windows.matchedGroupEventSchedule[eventLabels.matchedOwn].pooledMedianRms,
      allEventOwnContactsMedian: windows.allPostbirthContactSchedule[eventLabels.allEventOwn].pooledMedianRms
    }];
  }));
  return { ratio, prebirth: report.metrics.prebirth[keys.prebirth], firstBirth10s: {
    bornOnly, matched44, allEvent, sum,
    matched44VsBornP1Db: dbRatio(matched44.pooledRms, bornOnly.pooledRms),
    allEventVsBornP1Db: dbRatio(allEvent.pooledRms, bornOnly.pooledRms),
    sumVsBornP1Db: dbRatio(sum.pooledRms, bornOnly.pooledRms)
  }, eventAligned };
}
const bSummary = candidateSummary(candidateBReport, 'B', 0.025, {
  prebirth: 'B_baseOn_0_025', born: 'B_baseOff_bornP1', matched: 'B_substrate_44_groups_0_025',
  substrate: 'B_baseOn_0_025_substrateOnly', sum: 'B_baseOn_0_025_sum'
}, { born: 'B born-only (substrate Off)', matched: 'B matched 44-group substrate', allEvent: 'B all-event substrate',
  sum: 'B base On .025 sum', matchedOwn: 'B matched 44-group substrate .025', allEventOwn: 'B all-event substrate .025' });
const cSummary = candidateSummary(candidateCReport, 'C', 0.01, {
  prebirth: 'C_baseOn_0_010', born: 'C_baseOff_bornP1', matched: 'C_substrate_44_groups_0_010',
  substrate: 'C_baseOn_0_010_substrateOnly', sum: 'C_baseOn_0_010_sum'
}, { born: 'C born-only (substrate Off)', matched: 'C matched 44-group substrate', allEvent: 'C all-event substrate',
  sum: 'C base On .010 sum', matchedOwn: 'C matched 44-group substrate .010', allEventOwn: 'C all-event substrate .010' });
const dSummary = candidateSummary({ metrics, eventAlignedRms: eventAligned }, 'D', ratioB, {
  prebirth: 'D_baseOn_0_015', born: 'D_baseOff_bornP1', matched: 'D_substrate_44_groups_0_015',
  substrate: 'D_baseOn_0_015_substrateOnly', sum: 'D_baseOn_0_015_sum'
}, { born: 'D born-only (substrate Off)', matched: 'D matched 44-group substrate', allEvent: 'D all-event substrate',
  sum: 'D base On .015 sum', matchedOwn: 'D matched 44-group substrate .015', allEventOwn: 'D all-event substrate .015' });
const directLevelChangeDb = (candidate, reference) => ({
  prebirthPooledRms: dbRatio(candidate.prebirth.pooledRms, reference.prebirth.pooledRms),
  bornOnlyP1PooledRms: dbRatio(candidate.firstBirth10s.bornOnly.pooledRms, reference.firstBirth10s.bornOnly.pooledRms),
  matched44SubstratePooledRms: dbRatio(candidate.firstBirth10s.matched44.pooledRms, reference.firstBirth10s.matched44.pooledRms),
  allEventSubstratePooledRms: dbRatio(candidate.firstBirth10s.allEvent.pooledRms, reference.firstBirth10s.allEvent.pooledRms),
  sumPooledRms: dbRatio(candidate.firstBirth10s.sum.pooledRms, reference.firstBirth10s.sum.pooledRms),
  p1StrikeAlignedMedianRms: Object.fromEntries([100, 250, 500].map(ms => [ms, {
    bornOnly: dbRatio(candidate.eventAligned[ms].bornOnlyP1StrikeMedian, reference.eventAligned[ms].bornOnlyP1StrikeMedian),
    matched44: dbRatio(candidate.eventAligned[ms].matched44AtP1StrikesMedian, reference.eventAligned[ms].matched44AtP1StrikesMedian),
    allEvent: dbRatio(candidate.eventAligned[ms].allEventAtP1StrikesMedian, reference.eventAligned[ms].allEventAtP1StrikesMedian),
    sum: dbRatio(candidate.eventAligned[ms].sumAtP1StrikesMedian, reference.eventAligned[ms].sumAtP1StrikesMedian)
  }]))
});
const report = {
  status: 'frozen-p1-one-pass-candidate-d-substrate-calibration',
  decisionScope: 'One calibration only: same Candidate B readout split, substrate output ratio changed to 0.015. No further tuning.',
  settings: { A: { plateReadoutMix: '1/sqrt(12)', sphereReadoutMix: '1/sqrt(12)', substrateOutputRatio: ratioA },
    D: { plateReadoutMix: 1, sphereReadoutMix: '1/sqrt(12)', substrateOutputRatio: ratioB,
      substrateInternalReadout: 8, substrateDamping: 1, masterVolume, existingLimiter: 'unchanged' },
    ratioScaleFromCapturedSubstrateA: ratioScale, ratioChangeDb: dbRatio(ratioB, ratioA),
    retainedPlateBaseline: { contactPulseMs: 3, recoveryMs: 75, dampingMultiplier: 50 } },
  frozenInput: { seed: baseReport.sourceRun.seed, inputFile: baseReport.sourceRun.eventStreamFile,
    inputGzipSha256: baseReport.sourceRun.gzipSha256, firstPlateId: baseReport.sourceRun.firstPlateId,
    firstPlateBirthSeconds: baseReport.sourceRun.firstPlateBirthSeconds,
    descriptorSha256: baseReport.sourceRun.firstPlateDescriptorSha256,
    p1AcceptedStrikes: p1Events.length, p1ScheduleSha256: sha(JSON.stringify(p1Events)),
    matchedUniqueParentGroups: matchedEvents.length, matchedSubstrateScheduleSha256: sha(JSON.stringify(matchedEvents)),
    allPostbirthGenericGroups: eventReport.eventMapping.allPostbirthContactGroups,
    inputAndStrikeScheduleReused: true },
  clockMapping: { sampleRateHz: 48000, prebirth: audioWindows.prebirth.clockAnchors,
    firstBirth10s: audioWindows.firstBirth.clockAnchors,
    conversion: 'sampleFrame = round((simulationTimeMs - windowStartMs) * 48); each 10 s PCM maps its simulation endpoints to samples 0 and 480000',
    prebirthFootContactMarkers: audioWindows.prebirth.contacts.length,
    postbirthFootContactMarkers: audioWindows.firstBirth.contacts.length,
    firstBirthMarker: { type: 'PLATE_BIRTH', id: baseReport.sourceRun.firstPlateId, simulationTimeMs: birthMs, audioSampleIndex: 0 } },
  outputs: { prebirthOnD: { path: preOnB.path, sha256: preOnB.sha256 },
    matchedSubstrateD: { path: matchedSubstrateB.path, sha256: matchedSubstrateB.sha256 },
    firstBirthSubstrateD: { path: postBaseB.path, sha256: postBaseB.sha256 },
    firstBirthBornD: { path: bornOnlyB.path, sha256: bornOnlyB.sha256,
      reusedFrozenPcm: true, sourceSha256: mixReport.comparison.B.pcmSha256 },
    firstBirthSumD: { path: postOnB.path, sha256: postOnB.sha256 }, images },
  sourcePcm: { A_p1: mixReport.comparison.A.pcmSha256, frozenCandidateB_p1: mixReport.comparison.B.pcmSha256,
    frozenSubstrateA_prebirth: sha(preOnA.bytes), frozenSubstrateA_postbirth: sha(postBaseA.bytes),
    frozenMatchedSubstrateA: sha(matchedSubstrateA.bytes), frozenAllEventsSubstrateA: sha(postBaseA.bytes) },
  metrics, eventAlignedRms: eventAligned,
  candidateComparison: { B: bSummary, C: cSummary, D: dSummary,
    DvsB_dB: directLevelChangeDb(dSummary, bSummary), DvsC_dB: directLevelChangeDb(dSummary, cSummary),
    frozenBornP1PcmEqualAcrossCandidates: bornOnlyB.sha256 === candidateBReport.outputs.firstBirthBornB.sha256
      && bornOnlyB.sha256 === candidateCReport.outputs.firstBirthBornC.sha256 },
  levelChanges: { bornP1PooledAtoD_dB: dbRatio(metrics.matchedEvents.D_bornP1_63.pooledRms, metrics.matchedEvents.A_bornP1_63.pooledRms),
    matchedSubstratePooledAtoD_dB: dbRatio(metrics.matchedEvents.D_substrate_44_groups_0_015.pooledRms,
      metrics.matchedEvents.A_substrate_44_groups_0_22.pooledRms),
    firstBirthSubstrateDToBornD_dB: dbRatio(metrics.firstBirth10s.D_baseOn_0_015_substrateOnly.pooledRms,
      metrics.firstBirth10s.D_baseOff_bornP1.pooledRms),
    firstBirthDOnSumToBornOnly_dB: dbRatio(metrics.firstBirth10s.D_baseOn_0_015_sum.pooledRms,
      metrics.firstBirth10s.D_baseOff_bornP1.pooledRms) },
  pcmChecks: { clippingThreshold: '|sample| >= 1', allMetricsIncludePerChannelAndPooledPeakRms: true,
    nonFiniteSamples: Object.fromEntries(Object.entries(metrics.firstBirth10s).map(([key, value]) => [key, value.nonFiniteSamples])),
    clippingSamples: Object.fromEntries(Object.entries(metrics.firstBirth10s).map(([key, value]) => [key, value.clippingSamples])) },
  browserCheck: { ...browserCheck, screenshot: 'browser-listening-check.png', listeningPage: 'listening.html',
    interpretation: 'Native-rate browser decode/playback state verified. Perceptual quality remains a human listening judgment.' },
  renderer: { source: 'stratigraphy-audio-overview.js / ANT existing audio snapshot renderer', waveformAmplitude: [-1, 1],
    channelMode: 'separate L/R', fftSize: 1024, window: 'Hann', hopSize: 256,
    frequencyHz: [0, 8000], dbfs: [-100, 0], grayscaleGamma: 1,
    normalization: 'none; fixed scale', overlayMarkers: ['FOOT_CONTACT', 'PLATE_BIRTH'] }
};
await writeFile(resolve(output, 'calibration-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: resolve(output, 'calibration-report.json'), metrics,
  eventAlignedRms: eventAligned, browserCheck, images }, null, 2));
