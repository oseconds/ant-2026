import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer as createViteServer } from 'vite';
import { chromium } from 'playwright';
import {
  buildStratigraphyAudioSnapshot,
  renderStratigraphyAudioComparison,
  STRATIGRAPHY_AUDIO_PRESET
} from './audio-snapshot-renderer.js';
import { decodeStereoFloatWav } from './stratigraphy-audio-overview.js';

const runDirectory = resolve(process.argv[2] || 'test-results/stratigraphy-motion-2026-10-06T05-30-53-880Z');
const outputDirectory = resolve('docs/ant/evidence/2026-10-06-stratigraphy-runtime/overview');
await mkdir(outputDirectory, { recursive: true });
const runName = 'continuous-natural-0-600s';
const currentEvidence = JSON.parse(await readFile(resolve(runDirectory, `${runName}.json`), 'utf8'));
const overviewManifest = JSON.parse(await readFile(resolve(outputDirectory, `${runName}-audio-overview-manifest.json`), 'utf8'));
const firstPlateZoom = overviewManifest.details.find(zoom => zoom.reason === 'first plate birth');
if (!firstPlateZoom || firstPlateZoom.audioDurationSeconds !== STRATIGRAPHY_AUDIO_PRESET.durationSeconds) {
  throw new Error('A complete fixed-duration first-plate comparison window is required.');
}

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const runExecFile = promisify(execFile);
const historicalWebm = resolve('docs/ant/evidence/2026-10-05-surface-plates/bornsurface-mature-single.webm');
const historicalJsonPath = resolve('docs/ant/evidence/2026-10-05-surface-plates/bornsurface-mature-single.json');
const historicalMetadata = JSON.parse(await readFile(historicalJsonPath, 'utf8'));
const historicalWav = resolve(runDirectory, 'historical-mature-single-source-pcm.wav');
await runExecFile(ffmpeg, ['-y', '-i', historicalWebm, '-map', '0:a:0', '-vn', '-ac', '2',
  '-ar', String(currentEvidence.browserSampleRate), '-c:a', 'pcm_f32le', historicalWav], { maxBuffer: 8 * 1024 * 1024 });
const currentWavBytes = await readFile(resolve(runDirectory, `${runName}.wav`));
const currentDecoded = decodeStereoFloatWav(currentWavBytes);
const historicalBytes = await readFile(historicalWav);
const historicalDecoded = decodeStereoFloatWav(historicalBytes);
const start = firstPlateZoom.audioStartSampleIndex, end = firstPlateZoom.audioEndSampleIndex;
const currentSample = buildStratigraphyAudioSnapshot({
  left: currentDecoded.channels.left.subarray(start, end),
  right: currentDecoded.channels.right.subarray(start, end)
}, { sampleRate: currentDecoded.sampleRate,
  sourceDurationSeconds: (end - start) / currentDecoded.sampleRate });
const historicalSample = buildStratigraphyAudioSnapshot(historicalDecoded.channels, {
  sampleRate: historicalDecoded.sampleRate,
  sourceDurationSeconds: historicalDecoded.sampleCount / historicalDecoded.sampleRate
});
const currentContactGroups = currentEvidence.events.filter(event => event.type === 'FOOT_CONTACT'
  && event.simulationTimeMs >= firstPlateZoom.actualSimulationStartSeconds * 1000
  && event.simulationTimeMs <= firstPlateZoom.actualSimulationEndSeconds * 1000);
const currentIndividualContacts = currentContactGroups.reduce((sum, event) => sum
  + (Array.isArray(event.payload?.contacts) ? event.payload.contacts.length : 0), 0);
const currentLabel = `Current 600 s Chrome run · 10 s audio at simulation ${firstPlateZoom.actualSimulationStartSeconds.toFixed(2)}–${firstPlateZoom.actualSimulationEndSeconds.toFixed(2)} s · ${currentContactGroups.length} groups / ${currentIndividualContacts} feet`;
const historicalLabel = `Historical mature-single · ${historicalMetadata.recording.durationSeconds.toFixed(2)} s source, fixed first ${STRATIGRAPHY_AUDIO_PRESET.durationSeconds.toFixed(0)} s · ${historicalMetadata.recording.footContactEvents} groups / ${historicalMetadata.recording.footContacts} feet`;

const toPlain = value => {
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(toPlain);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlain(item)]));
};
const rows = JSON.stringify(toPlain([
  { label: historicalLabel, snapshot: historicalSample },
  { label: currentLabel, snapshot: currentSample }
]));
const server = await createViteServer({ server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const port = server.httpServer.address()?.port;
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
  const png = await page.evaluate(async rowsJson => {
    const { renderStratigraphyAudioComparison } = await import('/scripts/audio-snapshot-renderer.js');
    const canvas = document.createElement('canvas');
    renderStratigraphyAudioComparison(canvas, JSON.parse(rowsJson));
    return canvas.toDataURL('image/png').split(',')[1];
  }, rows);
  const imageName = 'historical-mature-single-vs-natural-first-plate-fixed-10s.png';
  await writeFile(resolve(outputDirectory, imageName), Buffer.from(png, 'base64'));
  const metadata = { status: 'rendered', image: imageName,
    preset: STRATIGRAPHY_AUDIO_PRESET,
    historical: { sourceAudio: historicalWebm.replaceAll('\\', '/'), sourceMetadata: historicalJsonPath.replaceAll('\\', '/'),
      sourceDurationSeconds: historicalDecoded.sampleCount / historicalDecoded.sampleRate,
      includedDurationSeconds: historicalSample.includedSourceDurationSeconds,
      paddedSeconds: historicalSample.paddingSeconds, trimmedSeconds: historicalSample.trimmedSeconds,
      simulationStartSeconds: historicalMetadata.recording.simulationStartMs / 1000,
      simulationEndSeconds: historicalMetadata.recording.simulationEndMs / 1000,
      footContactGroups: historicalMetadata.recording.footContactEvents,
      individualFootContacts: historicalMetadata.recording.footContacts,
      outputGain: historicalMetadata.recording.finalGain },
    current: { sourceAudio: resolve(runDirectory, `${runName}-audio.webm`).replaceAll('\\', '/'),
      sampleRate: currentDecoded.sampleRate, sourceDurationSeconds: currentSample.sourceDurationSeconds,
      includedDurationSeconds: currentSample.includedSourceDurationSeconds,
      simulationStartSeconds: firstPlateZoom.actualSimulationStartSeconds,
      simulationEndSeconds: firstPlateZoom.actualSimulationEndSeconds,
      audioStartSampleIndex: start, audioEndSampleIndex: end,
      footContactGroups: currentContactGroups.length, individualFootContacts: currentIndividualContacts,
      volume: currentEvidence.end.volume, outputGain: currentEvidence.end.outputGain },
    provenance: 'Both input audio sources were decoded to float32 stereo and rendered on the unchanged fixed 10-second ±1 / 1024-Hann / hop-256 / 0..8000Hz / −100..0dBFS / gamma-1 grayscale preset. Historical source files were read only.' };
  await writeFile(resolve(outputDirectory, 'historical-mature-single-vs-natural-first-plate-fixed-10s.json'),
    JSON.stringify(metadata, null, 2));
  console.log(JSON.stringify({ image: resolve(outputDirectory, imageName), historical: metadata.historical,
    current: metadata.current, preset: STRATIGRAPHY_AUDIO_PRESET.id }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
