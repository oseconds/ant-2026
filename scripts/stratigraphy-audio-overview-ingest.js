import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { chromium } from 'playwright';
import {
  buildStratigraphyAudioOverview,
  decodeStereoFloatWav,
  renderStratigraphyAudioOverview,
  renderStratigraphyAudioZooms,
  STRATIGRAPHY_AUDIO_OVERVIEW_PRESET
} from './stratigraphy-audio-overview.js';

const inputDirectory = resolve(process.argv[2] || 'test-results/stratigraphy-motion-2026-10-06T05-30-53-880Z');
const name = 'continuous-natural-0-600s';
const evidencePath = resolve(inputDirectory, `${name}.json`);
const wavPath = resolve(inputDirectory, `${name}.wav`);
const outputDirectory = resolve('docs/ant/evidence/2026-10-06-stratigraphy-runtime/overview');
await mkdir(outputDirectory, { recursive: true });

const [metadataText, wavBytes] = await Promise.all([readFile(evidencePath, 'utf8'), readFile(wavPath)]);
const evidence = JSON.parse(metadataText);
const decoded = decodeStereoFloatWav(wavBytes);
const simulationDurationSeconds = evidence.simulationDurationSeconds;
const anchors = evidence.clockAnchors.map(anchor => ({
  simulationTimeMs: anchor.simulationTimeMs,
  audioSampleIndex: anchor.audioSampleIndex
}));
const sourceFrames = decoded.sampleCount;
const finalAnchor = anchors.at(-1);
const codecEndOffsetSamples = finalAnchor.audioSampleIndex - sourceFrames;
if (sourceFrames < 10 * decoded.sampleRate) throw new Error('The full capture has less than 10 decoded-audio seconds.');
if (Math.abs(codecEndOffsetSamples) > decoded.sampleRate * 0.1) {
  throw new Error(`Decoded PCM end differs from its last browser clock anchor by ${codecEndOffsetSamples} samples.`);
}
// Opus pre-skip/end padding makes the decoded PCM end differ slightly from the
// AudioContext endpoint. Keep all measured intermediate anchors and reconcile
// only the terminal mapping to the actual decoded PCM frame count.
anchors[anchors.length - 1] = { ...finalAnchor, audioSampleIndex: sourceFrames };

const fullOverview = buildStratigraphyAudioOverview({ channels: decoded.channels,
  sampleRate: decoded.sampleRate, simulationDurationSeconds,
  clockAnchors: anchors, events: evidence.events });

const prefixSimulationDuration = Math.min(180, simulationDurationSeconds);
const prefixTimeMs = prefixSimulationDuration * 1000;
const simulationToSample = (timeMs, points) => {
  if (timeMs <= points[0].simulationTimeMs) return points[0].audioSampleIndex;
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index], left = points[index - 1];
    if (timeMs <= right.simulationTimeMs) {
      const ratio = (timeMs - left.simulationTimeMs) / (right.simulationTimeMs - left.simulationTimeMs);
      return left.audioSampleIndex + ratio * (right.audioSampleIndex - left.audioSampleIndex);
    }
  }
  return points.at(-1).audioSampleIndex;
};
const prefixSampleCount = Math.max(1, Math.min(sourceFrames, Math.round(simulationToSample(prefixTimeMs, anchors))));
const prefixAnchors = anchors.filter(anchor => anchor.simulationTimeMs < prefixTimeMs);
prefixAnchors.push({ simulationTimeMs: prefixTimeMs, audioSampleIndex: prefixSampleCount });
const prefixOverview = buildStratigraphyAudioOverview({ channels: {
  left: decoded.channels.left.subarray(0, prefixSampleCount),
  right: decoded.channels.right.subarray(0, prefixSampleCount)
}, sampleRate: decoded.sampleRate, simulationDurationSeconds: prefixSimulationDuration,
clockAnchors: prefixAnchors, events: evidence.events.filter(event => event.simulationTimeMs <= prefixTimeMs) });

const toPlain = value => {
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(toPlain);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlain(item)]));
};
const fullPayload = JSON.stringify(toPlain(fullOverview));
const prefixPayload = JSON.stringify(toPlain(prefixOverview));
const server = await createViteServer({
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  logLevel: 'error'
});
let browser;
try {
  await server.listen();
  const port = server.httpServer.address()?.port;
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
  const rendered = await page.evaluate(async ({ fullJson, prefixJson }) => {
    const { renderStratigraphyAudioOverview, renderStratigraphyAudioZooms } = await import('/scripts/stratigraphy-audio-overview.js');
    const full = JSON.parse(fullJson), prefix = JSON.parse(prefixJson);
    const draw = (overview, zooms = false) => {
      const canvas = document.createElement('canvas');
      if (zooms) renderStratigraphyAudioZooms(canvas, overview);
      else renderStratigraphyAudioOverview(canvas, overview);
      return canvas.toDataURL('image/png').split(',')[1];
    };
    return { full: draw(full), prefix: draw(prefix), details: draw(full, true) };
  }, { fullJson: fullPayload, prefixJson: prefixPayload });

  const outputNames = {
    full: `${name}-600s-overview.png`,
    prefix: `${name}-180s-prefix-overview.png`,
    details: `${name}-auto-selected-10s-details.png`
  };
  await Promise.all([
    writeFile(resolve(outputDirectory, outputNames.full), Buffer.from(rendered.full, 'base64')),
    writeFile(resolve(outputDirectory, outputNames.prefix), Buffer.from(rendered.prefix, 'base64')),
    writeFile(resolve(outputDirectory, outputNames.details), Buffer.from(rendered.details, 'base64'))
  ]);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const manifest = {
    status: 'rendered',
    sourceEvidence: evidencePath.replaceAll('\\', '/'),
    sourcePcm: wavPath.replaceAll('\\', '/'),
    sourceAudioWebm: resolve(inputDirectory, `${name}-audio.webm`).replaceAll('\\', '/'),
    sourceAudioSha256: hash(await readFile(resolve(inputDirectory, `${name}-audio.webm`))),
    sourcePcmSha256: hash(wavBytes),
    decoded: { sampleRate: decoded.sampleRate, channels: 2, sampleCount: sourceFrames,
      durationSeconds: sourceFrames / decoded.sampleRate, wavFormat: 'IEEE float32',
      codecEndOffsetSamples, codecEndOffsetSeconds: codecEndOffsetSamples / decoded.sampleRate },
    simulation: { targetSeconds: simulationDurationSeconds,
      wallDurationSeconds: evidence.wallDurationSeconds,
      audioContextDurationSeconds: evidence.end.audioContextDurationSeconds,
      anchors: anchors.length, anchorIntervalMs: evidence.clockAnchorIntervalMs,
      mapping: 'The 600-second simulation axis uses sampled AudioContext sample-index anchors. Only the terminal anchor is reconciled to the decoded PCM frame count to account for measured Opus end padding/pre-skip.' },
    eventCounts: evidence.eventCounts,
    fixedPreset: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET,
    outputs: outputNames,
    prefix: { simulationSeconds: prefixSimulationDuration,
      pcmFrames: prefixSampleCount, audioSeconds: prefixSampleCount / decoded.sampleRate },
    details: fullOverview.overlays.zooms.map((zoom, index) => ({ index, reason: zoom.reason,
      audioDurationSeconds: zoom.audioDurationSeconds,
      audioStartSampleIndex: zoom.audioStartSampleIndex, audioEndSampleIndex: zoom.audioEndSampleIndex,
      actualSimulationStartSeconds: zoom.actualSimulationStartSeconds,
      actualSimulationEndSeconds: zoom.actualSimulationEndSeconds,
      footContactTicks: zoom.events.filter(event => event.type === 'FOOT_CONTACT').map(event => ({
        simulationTimeMs: event.simulationTimeMs, audioOffsetSeconds: event.audioOffsetSeconds,
        contactCount: event.contactCount
      })),
      plateBirthTicks: zoom.events.filter(event => event.type === 'PLATE_BIRTH').map(event => ({
        simulationTimeMs: event.simulationTimeMs, audioOffsetSeconds: event.audioOffsetSeconds,
        label: event.label, layerChange: event.layerChange
      })) })),
    renderFiles: Object.fromEntries(Object.entries(outputNames).map(([key, path]) => [key,
      { path, bytes: Buffer.byteLength(rendered[key], 'base64') }]))
  };
  await writeFile(resolve(outputDirectory, `${name}-audio-overview-manifest.json`), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ outputDirectory, outputs: manifest.renderFiles,
    decoded: manifest.decoded, eventCounts: manifest.eventCounts,
    details: manifest.details.map(({ index, reason, audioDurationSeconds, actualSimulationStartSeconds,
      actualSimulationEndSeconds, footContactTicks }) => ({ index, reason, audioDurationSeconds,
      actualSimulationStartSeconds, actualSimulationEndSeconds, footContactTickCount: footContactTicks.length })) }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
