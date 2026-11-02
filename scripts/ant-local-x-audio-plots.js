#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { chromium } from 'playwright';
import {
  STRATIGRAPHY_AUDIO_PRESET,
  buildStratigraphyAudioSnapshot,
  renderStratigraphyAudioSnapshot
} from './audio-snapshot-renderer.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(root, process.argv[2] || '.cache/local-x-audio-reassessment/pcm');
const analysisDir = resolve(root, process.argv[3] || 'docs/ant/evidence/2026-11-01-local-x-audio-reassessment/audio-analysis');
const output = resolve(root, process.argv[4] || `${analysisDir}/visual`);
const seeds = ['20261005', '20261006', '20261007'];
const arms = ['control', 'replacement'];
const starts = [50, 110, 170, 230, 290];
const rate = 48_000;
const outputGain = 0.7;
const gainStage = 'post-bridge fixed GainNode after worklet soft limiter and interpolation; direct master gain 1';
const sha = data => createHash('sha256').update(data).digest('hex');
const colors = ['#1b7837', '#5aae61', '#999999', '#d8b365', '#a6611a'];

function chunkedWav(raw, second) {
  if (raw.toString('ascii', 0, 4) !== 'RIFF' || raw.toString('ascii', 8, 12) !== 'WAVE'
      || raw.readUInt16LE(20) !== 3 || raw.readUInt16LE(22) !== 2 || raw.readUInt32LE(24) !== rate
      || raw.readUInt16LE(32) !== 8 || raw.readUInt16LE(34) !== 32) throw new Error('Expected 300 s float32 stereo 48 kHz WAV.');
  const frames = 300 * rate;
  if (raw.length !== 44 + frames * 8 || raw.toString('ascii', 36, 40) !== 'data') throw new Error('Expected canonical 300 s WAV with one data chunk.');
  const out = Buffer.alloc(44 + 10 * rate * 8);
  raw.copy(out, 0, 0, 44);
  out.writeUInt32LE(out.length - 8, 4);
  out.writeUInt32LE(10 * rate * 8, 40);
  raw.copy(out, 44, 44 + second * rate * 8, 44 + (second + 10) * rate * 8);
  return out;
}

function erbSvg(analysis, shapeOnly) {
  const windows = analysis.windows;
  const globalMax = shapeOnly
    ? Math.max(...windows.map(row => Math.max(...(row.shapeUnitSumStereoMean || [0])))) || 1
    : analysis.fixedAbsoluteErbPowerRange[1] || 1;
  const width = 1800, height = 1120, panelW = 560, panelH = 500, left = 72, top = 78;
  const title = shapeOnly ? 'Stereo-mean ERB shape · unit-sum · fixed shared vertical scale'
    : `Absolute ERB linear power · fixed shared scale 0–${globalMax.toExponential(4)} · solid L, dashed R`;
  const value = row => shapeOnly ? (row.shapeUnitSumStereoMean ? [row.shapeUnitSumStereoMean] : []) : row.meanBandPowerByChannel;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" fill="#181818"><text x="${left}" y="32" font-size="20">${title}</text><text x="${left}" y="54" font-size="12">30 equal ERB-rate bands · five fixed 10 s windows per stream · post-bridge output gain 0.7 · no RMS matching</text>`;
  if (shapeOnly) svg += '<text x="72" y="72" font-size="11">* = silence; shape undefined; trace omitted</text>';
  for (let si = 0; si < 6; si++) {
    const seed = seeds[Math.floor(si / 2)], arm = arms[si % 2];
    const ox = left + (si % 3) * panelW, oy = top + Math.floor(si / 3) * panelH;
    const px = ox + 48, py = oy + 26, pw = 470, ph = 385;
    svg += `<text x="${ox}" y="${oy + 12}" font-size="14">${seed} · ${arm.toUpperCase()}</text>`;
    for (let tick = 0; tick <= 4; tick++) {
      const val = globalMax * tick / 4, y = py + ph * (1 - tick / 4);
      svg += `<line x1="${px}" x2="${px + pw}" y1="${y}" y2="${y}" stroke="#ddd"/><text x="${px - 7}" y="${y + 4}" text-anchor="end" font-size="9">${val.toExponential(1)}</text>`;
    }
    for (const band of [0, 9, 19, 29]) {
      const x = px + band * pw / 29;
      svg += `<line x1="${x}" x2="${x}" y1="${py}" y2="${py + ph}" stroke="#eee"/><text x="${x}" y="${py + ph + 17}" text-anchor="middle" font-size="9">${band + 1}</text>`;
    }
    svg += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="none" stroke="#333"/>`;
    for (let wi = 0; wi < starts.length; wi++) {
      const row = windows.find(w => w.seed === seed && w.arm === arm && w.startSeconds === starts[wi]);
      const ys = value(row);
      for (let ch = 0; ch < ys.length; ch++) {
        const points = ys[ch].map((v, band) => `${(px + band * pw / 29).toFixed(1)},${(py + ph * (1 - v / globalMax)).toFixed(1)}`).join(' ');
        svg += `<polyline points="${points}" fill="none" stroke="${colors[wi]}" stroke-width="${ch ? 1.3 : 2}"${ch && !shapeOnly ? ' stroke-dasharray="5 3"' : ''}/>`;
      }
      const lx = ox + wi * 98;
      if (ys.length) svg += `<line x1="${lx}" x2="${lx + 17}" y1="${oy + 458}" y2="${oy + 458}" stroke="${colors[wi]}" stroke-width="2"/>`;
      svg += `<text x="${lx + 21}" y="${oy + 462}" font-size="9">${starts[wi]}–${starts[wi] + 10}s${ys.length ? '' : '*'}</text>`;
    }
    svg += `<text x="${px + pw / 2}" y="${py + ph + 37}" text-anchor="middle" font-size="10">ERB band</text>`;
  }
  svg += `</g></svg>`;
  return svg;
}

if (process.argv.includes('--self-check')) {
  const windows = seeds.flatMap(seed => arms.flatMap(arm => starts.map((startSeconds, i) => ({
    seed, arm, startSeconds, meanBandPowerByChannel: [Array(30).fill((i + 1) / 10), Array(30).fill((i + 1) / 20)],
    shapeUnitSumStereoMean: Array(30).fill(1 / 30)
  }))));
  const fixture = { windows, fixedAbsoluteErbPowerRange: [0, 0.5] };
  const absolute = erbSvg(fixture, false), shape = erbSvg(fixture, true);
  assert.equal((absolute.match(/<polyline /g) || []).length, 60);
  assert.equal((shape.match(/<polyline /g) || []).length, 30);
  assert.match(absolute, /shared scale 0–5\.0000e-1/);
  assert.doesNotMatch(`${absolute}${shape}`, /NaN|points="[^"]*undefined/);
  windows[0].shapeUnitSumStereoMean = null;
  const silentShape = erbSvg(fixture, true);
  assert.equal((silentShape.match(/<polyline /g) || []).length, 29);
  assert.match(silentShape, /silence; shape undefined; trace omitted/);
  assert.match(silentShape, /50–60s\*/);
  console.log(JSON.stringify({ passed: true, panels: 6, profilesPerFigure: 30 }));
  process.exit(0);
}

const analysisPath = resolve(analysisDir, 'analysis.json');
const analysisBytes = await readFile(analysisPath);
const analysis = JSON.parse(analysisBytes);
if (analysis.windows?.length !== 30 || analysis.streams?.length !== 6) throw new Error(`${analysisPath}: expected 30 windows and six stream receipts.`);
await mkdir(output, { recursive: true });
const server = await createViteServer({ root, configFile: false, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const port = server.httpServer.address()?.port;
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1040 } });
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
  const outputs = [];
  for (const stream of analysis.streams) {
    const raw = await readFile(resolve(root, stream.path));
    if (sha(raw) !== stream.sha256) throw new Error(`${stream.path}: input SHA-256 differs from Python analysis receipt.`);
    for (const start of starts) {
      const wav = chunkedWav(raw, start);
      const png = await page.evaluate(async ({ encoded, seed, arm, start }) => {
        const { buildStratigraphyAudioSnapshot, renderStratigraphyAudioSnapshot } =
          await import('/scripts/audio-snapshot-renderer.js');
        const { decodeStereoFloatWav } = await import('/scripts/stratigraphy-audio-overview.js');
        const binary = atob(encoded), bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const pcm = decodeStereoFloatWav(bytes);
        const built = buildStratigraphyAudioSnapshot(pcm.channels, { sampleRate: pcm.sampleRate, sourceDurationSeconds: 10 });
        const snapshot = { ...built, label: `ANT ${seed} ${arm.toUpperCase()} · PCM ${start}–${start + 10} s · post-bridge gain 0.7` };
        const canvas = document.createElement('canvas');
        renderStratigraphyAudioSnapshot(canvas, snapshot);
        return canvas.toDataURL('image/png').split(',')[1];
      }, { encoded: wav.toString('base64'), seed: stream.path.match(/seed-(\d+)/)[1], arm: stream.path.includes('-control') ? 'control' : 'replacement', start });
      const name = `seed-${stream.path.match(/seed-(\d+)/)[1]}-${stream.path.includes('-control') ? 'control' : 'replacement'}-${start}-${start + 10}s-fixed.png`;
      const pngBytes = Buffer.from(png, 'base64');
      await writeFile(resolve(output, name), pngBytes);
      outputs.push({ file: name, bytes: pngBytes.length, sha256: sha(pngBytes), preset: STRATIGRAPHY_AUDIO_PRESET.id,
        outputGain, gainStage, noRmsMatching: true,
        source: stream.path, seconds: [start, start + 10] });
    }
  }
  const powerSvg = Buffer.from(erbSvg(analysis, false));
  const shapeSvg = Buffer.from(erbSvg(analysis, true));
  await writeFile(resolve(output, 'erb-absolute-power.svg'), powerSvg);
  await writeFile(resolve(output, 'erb-unit-shape.svg'), shapeSvg);
  const manifest = { status: 'FIXED_FRONTEND_PLOTS_COMPLETE', analysis: analysisPath.replaceAll('\\', '/'),
    analysisSha256: sha(analysisBytes), preset: STRATIGRAPHY_AUDIO_PRESET,
    gain: { outputGain, gainStage, powerScaleRelativeToPreBridge: outputGain ** 2, rmsMatching: false },
    pngs: outputs, svg: [
      { file: 'erb-absolute-power.svg', bytes: powerSvg.length, sha256: sha(powerSvg), commonLinearPowerAxis: analysis.fixedAbsoluteErbPowerRange },
      { file: 'erb-unit-shape.svg', bytes: shapeSvg.length, sha256: sha(shapeSvg), commonAxis: '0..max across all 30 stereo-mean unit-sum profiles' }
    ] };
  await writeFile(resolve(output, 'plot-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ status: manifest.status, pngs: outputs.length, svg: manifest.svg.map(x => x.file), output }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
