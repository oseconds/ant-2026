import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { buildAudioSnapshot } from './audio-snapshot-renderer.js';
import { encodeStereoFloatWav, sha256 } from './ant-sonic-shadow-render.js';

const key = '20261005-trail-plate-24';
const root = 'test-results/ant-base-born-loss-distribution-20261014';
const evidence = 'docs/ant/evidence/2026-10-14-base-born-loss-distribution';
const index = JSON.parse(await readFile(`${root}/render-index.json`, 'utf8'));
const report = JSON.parse(await readFile(`${evidence}/analysis.json`, 'utf8'));
const series = JSON.parse(gunzipSync(await readFile(`${evidence}/erb-time-series.json.gz`)));
const pair = report.pairs.find(item => item.key === key);
assert.ok(pair, 'P24 must exist in the frozen geometry trio');
assert.equal(report.fixedScaleStft.fftSize, 1024);
assert.equal(report.fixedScaleStft.hopSize, 256);
assert.equal(report.fixedScaleStft.frameCount, 279);

const byCondition = Object.fromEntries(index.rows.filter(row => row.plateKey === key).map(row => [row.condition, row]));
assert.ok(byCondition.flat && byCondition.frequency);
async function pcm(row) {
  const bytes = await readFile(`${root}/${row.files.pcm}`);
  assert.equal(bytes.length, row.frames * 8);
  const left = new Float32Array(row.frames), right = new Float32Array(row.frames);
  for (let i = 0; i < row.frames; i++) { left[i] = bytes.readFloatLE(i * 8); right[i] = bytes.readFloatLE(i * 8 + 4); }
  return { left, right, bytes };
}

const stft = {};
for (const condition of ['flat', 'frequency']) {
  const source = await pcm(byCondition[condition]);
  stft[condition] = {};
  for (const channel of ['left', 'right']) {
    const snapshot = buildAudioSnapshot(source[channel], { sampleRate: 48_000, maxFrequencyHz: 8_000 });
    assert.equal(snapshot.spectrogram.frameCount, report.fixedScaleStft.frameCount);
    assert.equal(snapshot.spectrogram.frequencyBins, report.fixedScaleStft.displayedFrequencyBins);
    stft[condition][channel] = Array.from(snapshot.spectrogram.dbfs);
  }
}
const erb = series.plates[key];
for (const condition of ['flat', 'frequency']) for (const channel of ['left', 'right']) {
  assert.equal(erb[condition][channel].length, report.fixedScaleStft.frameCount);
  assert.equal(erb[condition][channel][0].length, report.erb.bands);
}

const chartData = {
  dimensions: { frames: report.fixedScaleStft.frameCount, stftBins: report.fixedScaleStft.displayedFrequencyBins,
    erbBands: report.erb.bands, framePeriodSeconds: 256 / 48_000, durationSeconds: 1.5 },
  stft, erb: {
    flat: Object.fromEntries(['left', 'right'].map(channel => [channel, erb.flat[channel].flat().map(power => 10 * Math.log10(Math.max(power, 1e-30)))])),
    frequency: Object.fromEntries(['left', 'right'].map(channel => [channel, erb.frequency[channel].flat().map(power => 10 * Math.log10(Math.max(power, 1e-30)))])),
    difference: Object.fromEntries(['left', 'right'].map(channel => [channel, erb.differenceDb[channel].flat()]))
  }
};
const safeJson = JSON.stringify(chartData).replaceAll('<', '\\u003c');
const panels = [
  ['stft', 'left', 'Fixed-scale STFT · pickup L', 'absolute'],
  ['stft', 'right', 'Fixed-scale STFT · pickup R', 'absolute'],
  ['erb', 'left', 'ERB-binned power · pickup L', 'power'],
  ['erb', 'right', 'ERB-binned power · pickup R', 'power']
];
let cards = '';
for (const [kind, channel, label, style] of panels) {
  for (const condition of ['flat', 'frequency', 'difference']) {
    const id = `${kind}-${channel}-${condition}`;
    const values = kind === 'stft' ? (condition === 'difference'
      ? chartData.stft.frequency[channel].map((value, i) => value - chartData.stft.flat[channel][i])
      : chartData.stft[condition][channel]) : chartData.erb[condition][channel];
    const bins = kind === 'stft' ? chartData.dimensions.stftBins : chartData.dimensions.erbBands;
    const colorScale = condition === 'difference' ? 'difference' : 'absolute';
    cards += `<article><h3>${label} · ${condition === 'difference' ? 'frequency − flat' : condition}</h3><canvas id="${id}" width="279" height="${bins}" data-bins="${bins}" data-scale="${colorScale}"></canvas><small>${kind === 'stft' ? '0–7,968.75 Hz; −100…0 dBFS fixed' : '30 equal ERB bands; −100…0 dBFS fixed'}${condition === 'difference' ? '; display ±24 dB' : ''}</small></article>`;
  }
}
const html = `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>P24 matched-loss time-frequency comparison</title>
<style>
body{font:14px/1.45 system-ui,sans-serif;color:#202124;max-width:1280px;margin:1.5rem auto;padding:0 1rem}
h1{font-size:1.5rem;margin:.2rem 0}.note{background:#f3f5f7;padding:.8rem 1rem;margin:.7rem 0}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.6rem}.grid article{border:1px solid #ddd;padding:.35rem;min-width:0}
.grid h3{font-size:.85rem;margin:.1rem 0 .35rem;font-weight:600}.grid canvas{display:block;width:100%;height:190px;image-rendering:pixelated;background:#111}
.grid canvas[data-bins="30"]{height:95px}.grid small{display:block;color:#555;margin-top:.25rem}
table{border-collapse:collapse;margin:1rem 0;width:100%}td,th{border:1px solid #ccc;padding:.45rem;text-align:left}audio{width:18rem;max-width:100%}
@media(max-width:800px){.grid{grid-template-columns:1fr}.grid canvas{height:220px}}
</style>
<div id="evidence-figure"><h1>P24 · Base/Born matched-loss response</h1>
<p class="note">Frozen single p50 contact; fixed-gain PCM, native geometry, Born elastic law, 6 kHz physics, 3 ms pulse, 75 ms recovery and ×50 damping baseline. Columns show flat control, frequency loss and frequency − flat. No per-clip normalization. STFT uses the existing 1024 Hann / 256 hop renderer at fixed −100…0 dBFS. ERB panels aggregate linear STFT power before 10 log10; they are an ERB-binned STFT sidecar, not gammatone or cochleogram output. Difference panels display ±24 dB; metrics retain unclipped values.</p>
<p>STFT time axis is 279 left-aligned frames at 5.333 ms hop over the 1.5 s render. Frequency bins are 46.875 Hz apart; the last displayed bin is 7,968.75 Hz. ERB centers and boundaries are in <a href="analysis.json">analysis.json</a>. The loss comparison and field modal curves are in the machine-readable report.</p>
<div class="grid">${cards}</div>
</div>
<h2>Listening-only level-matched pair</h2>
<p class="note">These 16-bit clips share one RMS target for character comparison. Use fixed-gain measurement WAVs linked below for level comparison. No human assessment is recorded.</p>
<table><thead><tr><th>Arm</th><th>Listening-only, common RMS</th><th>Measurement, fixed gain 1</th></tr></thead><tbody>
<tr><td>Flat-loss control</td><td><audio controls preload="none" src="listening/p24-flat-rms-matched.wav"></audio></td><td><a href="listening/p24-flat-fixed-gain.wav">fixed-gain float WAV</a></td></tr>
<tr><td>Frequency loss</td><td><audio controls preload="none" src="listening/p24-frequency-rms-matched.wav"></audio></td><td><a href="listening/p24-frequency-fixed-gain.wav">fixed-gain float WAV</a></td></tr>
</tbody></table>
<p>Listening manifest: <a href="listening-manifest.json">listening-manifest.json</a>. Data manifest: <a href="report-manifest.json">report-manifest.json</a>.</p>
<script id="spectral-data" type="application/json">${safeJson}</script>
<script>
const data=JSON.parse(document.getElementById('spectral-data').textContent);
const colors=(value,scale)=>{
 if(scale==='absolute'){const t=Math.max(0,Math.min(1,(value+100)/100));const g=Math.round(255*t);return[g,g,g,255];}
 const v=Math.max(-24,Math.min(24,value));
 if(v<0){const t=(v+24)/24;return[Math.round(35+220*t),Math.round(75+180*t),Math.round(205+50*t),255];}
 const t=v/24;return[255,Math.round(255-215*t),Math.round(255-215*t),255];
};
for(const canvas of document.querySelectorAll('canvas')){
 const [kind,channel,condition]=canvas.id.split('-');
 const source=kind==='stft'?data.stft:data.erb;
 const bins=Number(canvas.dataset.bins),frames=data.dimensions.frames,w=frames,h=bins;
 let values;
 if(kind==='stft') values=condition==='difference'?source.frequency[channel].map((v,i)=>v-source.flat[channel][i]):source[condition][channel];
 else values=source[condition][channel];
 const scratch=document.createElement('canvas');scratch.width=w;scratch.height=h;
 const ctx=scratch.getContext('2d'),img=ctx.createImageData(w,h),scale=canvas.dataset.scale;
 for(let x=0;x<w;x++)for(let y=0;y<h;y++){
  const band=h-1-y,offset=(y*w+x)*4,c=colors(values[x*h+band],scale);
  img.data[offset]=c[0];img.data[offset+1]=c[1];img.data[offset+2]=c[2];img.data[offset+3]=255;
 }
 ctx.putImageData(img,0,0);const target=canvas.getContext('2d');target.imageSmoothingEnabled=false;target.drawImage(scratch,0,0,canvas.width,canvas.height);
}
document.documentElement.dataset.chartsReady='true';
</script>`;

const listing = `${evidence}/listening`;
await mkdir(listing, { recursive: true });
function stats(signal) {
  let square = 0, peak = 0;
  for (let i = 0; i < signal.left.length; i++) {
    square += (signal.left[i] ** 2 + signal.right[i] ** 2) / 2;
    peak = Math.max(peak, Math.abs(signal.left[i]), Math.abs(signal.right[i]));
  }
  const rms = Math.sqrt(square / signal.left.length);
  return { rms, peak, crest: peak / rms };
}
function encodePcm16(signal, gain) {
  const dataBytes = signal.left.length * 4, out = Buffer.alloc(44 + dataBytes);
  out.write('RIFF', 0); out.writeUInt32LE(36 + dataBytes, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(48_000, 24); out.writeUInt32LE(48_000 * 4, 28);
  out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(dataBytes, 40);
  let sum = 0, peak = 0;
  for (let i = 0, offset = 44; i < signal.left.length; i++, offset += 4) {
    const l = Math.round(signal.left[i] * gain * 32767), r = Math.round(signal.right[i] * gain * 32767);
    assert.ok(Math.abs(l) < 32767 && Math.abs(r) < 32767, 'RMS-matched listening export remains unclipped');
    out.writeInt16LE(l, offset); out.writeInt16LE(r, offset + 2);
    sum += (l * l + r * r) / (2 * 32767 ** 2); peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  return { bytes: out, rms: Math.sqrt(sum / signal.left.length), peak: peak / 32767 };
}
const clips = [];
for (const condition of ['flat', 'frequency']) clips.push({ condition, signal: await pcm(byCondition[condition]) });
const crest = Math.max(...clips.map(clip => stats(clip.signal).crest));
const targetRms = Math.min(0.02, 0.8 / crest);
const listeningArtifacts = [];
for (const clip of clips) {
  const sourceStats = stats(clip.signal);
  const fixed = encodeStereoFloatWav({ left: clip.signal.left, right: clip.signal.right }, { sampleRate: 48_000, gain: 1 });
  const gain = targetRms / sourceStats.rms;
  const matched = encodePcm16(clip.signal, gain);
  const fixedName = `p24-${clip.condition}-fixed-gain.wav`;
  const matchedName = `p24-${clip.condition}-rms-matched.wav`;
  await writeFile(`${listing}/${fixedName}`, fixed);
  await writeFile(`${listing}/${matchedName}`, matched.bytes);
  listeningArtifacts.push({ path: `listening/${fixedName}`, role: '32-bit float fixed gain 1 measurement WAV',
    bytes: fixed.length, sha256: sha256(fixed), sourcePcmSha256: sha256(clip.signal.bytes),
    rms: sourceStats.rms, peak: sourceStats.peak, gain: 1 });
  listeningArtifacts.push({ path: `listening/${matchedName}`, role: '16-bit common-RMS listening-only WAV',
    bytes: matched.bytes.length, sha256: sha256(matched.bytes), sourcePcmSha256: sha256(clip.signal.bytes),
    appliedGain: gain, rms: matched.rms, peak: matched.peak, targetRms });
}
const listeningManifest = { schemaVersion: 1, comparison: 'P24 q=4-matched flat vs frequency-loss; p50 single contact',
  assessment: 'No human listening assessment performed.', normalization: { type: 'shared target RMS for listening-only files',
    targetRms, clipCount: clips.length, maximumPeak: Math.max(...listeningArtifacts.filter(a => a.role.includes('listening-only')).map(a => a.peak)) },
  measurement: { type: 'stereo 32-bit float, fixed gain 1', clipCount: clips.length }, artifacts: listeningArtifacts };
const listenBytes = Buffer.from(JSON.stringify(listeningManifest, null, 2) + '\n');
await writeFile(`${evidence}/listening-manifest.json`, listenBytes);
const htmlBytes = Buffer.from(html + '\n');
await writeFile(`${evidence}/p24-time-frequency.html`, htmlBytes);
const browser = await chromium.launch({ headless: true });
let pngBytes, pngDimensions, browserVersion;
try {
  const page = await browser.newPage({ viewport: { width: 1312, height: 900 }, deviceScaleFactor: 2 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.chartsReady === 'true');
  assert.equal(await page.locator('#evidence-figure canvas').count(), 12, 'P24 export contains all STFT and ERB comparison panels');
  const figure = page.locator('#evidence-figure');
  const bounds = await figure.boundingBox();
  assert.ok(bounds && bounds.width >= 1280, 'P24 static figure keeps the HTML desktop layout');
  pngBytes = await figure.screenshot({ type: 'png', scale: 'device' });
  assert.deepEqual(pageErrors, [], 'P24 chart rendering has no browser errors');
  assert.equal(pngBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'static visual is a PNG');
  pngDimensions = { width: pngBytes.readUInt32BE(16), height: pngBytes.readUInt32BE(20) };
  assert.equal(pngDimensions.width, Math.round(bounds.width * 2), 'PNG width matches the captured HTML figure at 2x');
  assert.equal(pngDimensions.height, Math.round(bounds.height * 2), 'PNG height matches the captured HTML figure at 2x');
  assert.ok(pngDimensions.width > 0 && pngDimensions.height > 0 && pngBytes.length > 1000, 'static visual is non-empty');
  browserVersion = browser.version();
} finally {
  await browser.close();
}
await writeFile(`${evidence}/p24-time-frequency.png`, pngBytes);
const artifacts = [];
for (const path of ['docs/ant/evidence/2026-10-14-base-born-loss-distribution/analysis.json',
  'docs/ant/evidence/2026-10-14-base-born-loss-distribution/erb-time-series.json.gz',
  'docs/ant/evidence/2026-10-14-base-born-loss-distribution/listening-manifest.json',
  'docs/ant/evidence/2026-10-14-base-born-loss-distribution/p24-time-frequency.html',
  'docs/ant/evidence/2026-10-14-base-born-loss-distribution/p24-time-frequency.png',
  ...listeningArtifacts.map(item => `docs/ant/evidence/2026-10-14-base-born-loss-distribution/${item.path}`)]) {
  const bytes = await readFile(path);
  artifacts.push({ path: path.replace(`${evidence}/`, ''), bytes: bytes.length, sha256: sha256(bytes) });
}
const toolHashes = {};
for (const path of ['scripts/ant-base-born-loss-visuals.js', 'scripts/ant-base-born-loss-analysis.py',
  'scripts/audio-snapshot-renderer.js', 'scripts/ant-sonic-shadow-render.js'])
  toolHashes[path] = sha256(await readFile(path));
await writeFile(`${evidence}/report-manifest.json`, JSON.stringify({
  command: 'python scripts/ant-base-born-metrics.py test-results/ant-base-born-loss-distribution-20261014/render-index.json test-results/ant-base-born-loss-distribution-20261014/metrics.json; python scripts/ant-base-born-loss-analysis.py; node scripts/ant-base-born-loss-visuals.js',
  renderIndexSha256: sha256(await readFile(`${root}/render-index.json`)),
  fixedGainMetricsSha256: sha256(await readFile(`${root}/metrics.json`)),
  analysisSha256: sha256(await readFile(`${evidence}/analysis.json`)),
  erbTimeSeriesSha256: sha256(await readFile(`${evidence}/erb-time-series.json.gz`)),
  visualExport: { path: 'p24-time-frequency.png', tool: 'Playwright Chromium locator screenshot', browserVersion,
    viewport: { width: 1312, height: 900 }, deviceScaleFactor: 2, capturedCssTarget: '#evidence-figure',
    sharedSource: 'same chartData object embedded in p24-time-frequency.html', dimensions: pngDimensions },
  sourceToolHashes: toolHashes, artifacts }, null, 2) + '\n');
console.log(JSON.stringify({ p24Frames: chartData.dimensions.frames, stftBins: chartData.dimensions.stftBins,
  erbBands: chartData.dimensions.erbBands, listeningTargetRms: targetRms, artifacts: artifacts.length,
  pageBytes: htmlBytes.length, pngBytes: pngBytes.length, pngDimensions, report: `${evidence}/report-manifest.json` }, null, 2));
