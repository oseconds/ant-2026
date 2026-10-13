import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { encodeStereoFloatWav } from './ant-sonic-shadow-render.js';

const indexPath = 'test-results/ant-base-born-causal-decomposition-20261014/render-index.json';
const evidence = 'docs/ant/evidence/2026-10-14-base-born-causal-decomposition';
const listening = `${evidence}/listening`;
const command = 'node scripts/ant-base-born-listening.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const middle = '20261005-trail-plate-24';
const small = '20261005-trail-plate-1';
const large = '20261007-trail-plate-26';
const middleConditions = ['baseline', 'instant', 'spatial-grid', 'spatial-world-width', 'jitter', 'loss-frequency',
  'loss-uniform', 'rate-aware-48', 'base-elastic-48', 'base-elastic-instant-48', 'pulse-1ms', 'base-reference'];
const otherConditions = ['baseline', 'base-elastic-instant-48', 'loss-frequency'];
const measurementConditions = ['baseline', 'instant', 'loss-frequency', 'rate-aware-48', 'base-elastic-48',
  'base-elastic-instant-48', 'base-reference'];

function pcm(row) {
  const bytes = readFileSync(row.files.pcm);
  assert.equal(bytes.length, row.frames * 2 * 4, `${row.id} PCM byte length`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const left = new Float32Array(row.frames), right = new Float32Array(row.frames);
  let sum = 0, peak = 0;
  for (let i = 0; i < row.frames; i++) {
    const l = view.getFloat32(i * 8, true), r = view.getFloat32(i * 8 + 4, true);
    assert.ok(Number.isFinite(l) && Number.isFinite(r), `${row.id} finite PCM`);
    assert.ok(Math.abs(l) <= 1 && Math.abs(r) <= 1, `${row.id} unclipped source PCM`);
    left[i] = l; right[i] = r;
    sum += (l * l + r * r) / 2;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  return { left, right, rms: Math.sqrt(sum / row.frames), peak };
}

function encodePcm16({ left, right }, gain) {
  const dataBytes = left.length * 4;
  const out = Buffer.alloc(44 + dataBytes);
  out.write('RIFF', 0); out.writeUInt32LE(36 + dataBytes, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(48000, 24); out.writeUInt32LE(48000 * 4, 28);
  out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(dataBytes, 40);
  let sum = 0, peak = 0;
  for (let i = 0, offset = 44; i < left.length; i++, offset += 4) {
    const l = Math.round(left[i] * gain * 32767), r = Math.round(right[i] * gain * 32767);
    assert.ok(Math.abs(l) < 32767 && Math.abs(r) < 32767, 'listening render remains unclipped');
    out.writeInt16LE(l, offset); out.writeInt16LE(r, offset + 2);
    sum += (l * l + r * r) / (2 * 32767 ** 2); peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  return { bytes: out, rms: Math.sqrt(sum / left.length), peak: peak / 32767 };
}

const indexBytes = await readFile(indexPath);
const index = JSON.parse(indexBytes);
const inputHash = hash(indexBytes);
const byId = new Map(index.rows.map(row => [row.id, row]));
const requests = [
  ...middleConditions.map(condition => ({ key: middle, condition, size: 'middle' })),
  ...[...otherConditions.map(condition => ({ key: small, condition, size: 'small' })),
    ...otherConditions.map(condition => ({ key: large, condition, size: 'large' }))]
];
const clips = requests.map(request => {
  const id = `${request.key}-${request.condition}`;
  const row = byId.get(id);
  assert.ok(row, `missing frozen render ${id}`);
  assert.equal(row.positionLabel, request.condition === 'base-reference' ? 'p50-mapped' : 'p50');
  assert.equal(row.frames, index.frames);
  return { ...request, id, row, audio: pcm(row) };
});
assert.equal(clips.length, 18);
const crest = Math.max(...clips.map(clip => clip.audio.peak / clip.audio.rms));
const targetRms = Math.min(.02, .8 / crest);
assert.ok(Number.isFinite(targetRms) && targetRms > 0);
await mkdir(listening, { recursive: true });
const artifacts = [];
const writeArtifact = async (name, bytes, role) => {
  const path = `${listening}/${name}`;
  await writeFile(path, bytes);
  artifacts.push({ path: `${evidence}/listening/${name}`, role, bytes: bytes.length, sha256: hash(bytes) });
};

for (const clip of clips) {
  const gain = targetRms / clip.audio.rms;
  const encoded = encodePcm16(clip.audio, gain);
  assert.ok(encoded.peak <= .8 + 1 / 32767, `${clip.id} common-gain peak`);
  assert.ok(Math.abs(encoded.rms - targetRms) <= 2 / 32767, `${clip.id} quantized common RMS`);
  assert.deepEqual(encoded.bytes, encodePcm16(clip.audio, gain).bytes, `${clip.id} deterministic listening WAV`);
  clip.listening = { name: `${clip.id}.listen.wav`, gain, rms: encoded.rms, peak: encoded.peak };
  await writeArtifact(clip.listening.name, encoded.bytes, '16-bit PCM listening-only common-RMS version');
}

for (const clip of clips.filter(c => c.size === 'middle' && measurementConditions.includes(c.condition))) {
  const encoded = encodeStereoFloatWav(clip.audio, { sampleRate: 48000, gain: 1 });
  assert.deepEqual(encoded, encodeStereoFloatWav(clip.audio, { sampleRate: 48000, gain: 1 }), `${clip.id} deterministic measurement WAV`);
  clip.measurement = { name: `${clip.id}.measurement.wav`, gain: 1, rms: clip.audio.rms, peak: clip.audio.peak };
  await writeArtifact(clip.measurement.name, encoded, '32-bit float measurement WAV, fixed gain 1');
}

const rows = clips.map(clip => ({ id: clip.id, size: clip.size, condition: clip.condition, sourcePCM: clip.row.files.pcm,
  sourcePCMBytes: clip.row.frames * 8, sourcePCMSha256: hash(readFileSync(clip.row.files.pcm)),
  frames: clip.row.frames, sampleRate: 48000, sourceRms: clip.audio.rms, sourcePeak: clip.audio.peak,
  listening: clip.listening, ...(clip.measurement ? { measurement: clip.measurement } : {}) }));
const manifest = { schemaVersion: 1, command, node: process.version, indexPath, indexSha256: inputHash,
  baseline: index.baseline, productionMain: index.productionMain, frozenInputs: { path: index.inputPath, sha256: index.inputSha256 },
  sourceTool: { path: 'scripts/ant-base-born-listening.js', sha256: hash(await readFile('scripts/ant-base-born-listening.js')) },
  encodeTool: { path: 'scripts/ant-sonic-shadow-render.js', sha256: hash(await readFile('scripts/ant-sonic-shadow-render.js')) },
  listeningNormalization: { type: 'per-clip RMS normalization for listening only', targetRms,
    maxPeak: Math.max(...clips.map(c => c.listening.peak)), clips: clips.length },
  measurement: { type: '32-bit float stereo, gain 1, amplitude comparable across clips', clips: rows.filter(r => r.measurement).length },
  clips: rows, artifacts };
await writeFile(`${evidence}/listening-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');

const audioHTML = clip => `<audio controls preload="none" src="listening/${clip.listening.name}"></audio>${clip.measurement ? `<br><a href="listening/${clip.measurement.name}">fixed gain 1 measurement WAV</a>` : ''}`;
const bodyRows = clips.map(clip => `<tr><td>${clip.size}</td><td>${clip.condition}</td><td>${clip.row.physicsRate} Hz</td><td>${clip.row.positionLabel}</td><td>${clip.row.row ?? ''}${clip.row.schedule?.length ?? ''}</td><td>${audioHTML(clip)}</td><td><code>${clip.id}</code></td></tr>`).join('\n');
const html = `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Base/Born causal decomposition listening</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:1200px;margin:2rem auto;padding:0 1rem;color:#202124}table{border-collapse:collapse;width:100%;margin:1rem 0 2rem}th,td{border:1px solid #bbb;padding:.45rem;text-align:left}audio{width:20rem;max-width:100%}code{font-size:.85em}.note{background:#f3f3f3;padding:1rem}</style>
<h1>Base/Born causal decomposition listening</h1>
<p class="note">This page provides controlled renders for listening and amplitude inspection. Listening-only files receive per-clip RMS normalization to one shared target (${targetRms.toFixed(6)}), so their playback loudness is not an amplitude comparison. The linked 32-bit float measurement files use fixed gain 1 and preserve cross-clip amplitude differences. No subjective or perceptual state is asserted.</p>
<p>Frozen setup: ${index.frames} source frames at 48 kHz; normally one p50 strike at frame ${index.strikeFrame}, strength 0.035, with a 3 ms Born pulse. Condition labels identify the alternate pulse settings, including instant and 1 ms cases. The mapped Base reference uses its recorded p50-mapped schedule. Middle uses P24. Small uses P1 and large uses P26. The 48 kHz rows are rate-aware diagnostic renders; the Born baseline is 6 kHz physics interpolated to 48 kHz. Raw source PCM and full schedules remain in the ignored render index.</p>
<p>Manifest: <a href="listening-manifest.json">listening-manifest.json</a>. One audio player per listening clip; measurement links appear only for the seven selected P24 cases.</p>
<table><thead><tr><th>Size</th><th>Condition</th><th>Physics rate</th><th>Strike</th><th>Schedule events</th><th>Audio</th><th>Render ID</th></tr></thead><tbody>${bodyRows}</tbody></table>
`;
await writeFile(`${evidence}/listening.html`, html);
const htmlBytes = Buffer.from(html);
manifest.html = { path: `${evidence}/listening.html`, bytes: htmlBytes.length, sha256: hash(htmlBytes) };
await writeFile(`${evidence}/listening-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
const manifestBytes = await readFile(`${evidence}/listening-manifest.json`);
console.log(JSON.stringify({ clips: clips.length, measurements: rows.filter(r => r.measurement).length,
  targetRms, artifacts: artifacts.length, listeningBytes: artifacts.filter(a => a.role.includes('listening-only')).reduce((s,a)=>s+a.bytes,0),
  measurementBytes: artifacts.filter(a => a.role.includes('measurement')).reduce((s,a)=>s+a.bytes,0),
  manifestSha256: hash(manifestBytes), htmlSha256: hash(htmlBytes) }, null, 2));
