import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { basename, relative, resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { decodeStereoFloatWav, STRATIGRAPHY_AUDIO_OVERVIEW_PRESET } from './stratigraphy-audio-overview.js';
import { buildAudioPlateTimeline, renderAudioPlateTimeline, renderAudioPlateTimelineZooms } from './ant-audio-plate-timeline.js';

const inputDirectory = resolve(process.argv[2] || 'test-results/ant-audio-plate-timeline-20261024-primary');
const name = process.argv[3] || 'continuous-natural-0-180s';
const outputDirectory = resolve(process.argv[4] || 'docs/ant/evidence/2026-10-24-audio-plate-timeline');
const evidencePath = resolve(inputDirectory, `${name}.json`);
const wavPath = resolve(inputDirectory, `${name}.wav`);
const audioWebmPath = resolve(inputDirectory, `${name}-audio.webm`);
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
if (evidence.status !== 'completed' || evidence.simulationDurationSeconds < 180) {
  throw new Error(`Expected a completed 180-second capture; got ${evidence.status}, ${evidence.simulationDurationSeconds}s.`);
}
const [wavBytes, webmBytes] = await Promise.all([readFile(wavPath), readFile(audioWebmPath)]);
const decoded = decodeStereoFloatWav(wavBytes);
const timeline = buildAudioPlateTimeline({ evidence, channels: decoded.channels, sampleRate: decoded.sampleRate });
assert.equal(timeline.validation.status, 'passed', `Capture validation failed: ${JSON.stringify(timeline.validation.checks)}`);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const currentSourceHashes = {};
for (const [path, expected] of Object.entries(evidence.sourceHashes || {})) {
  const actual = sha256(await readFile(resolve(path)));
  currentSourceHashes[path] = actual;
  assert.equal(actual, expected, `Capture source changed since recording: ${path}`);
}
const researchToolHashes = {};
for (const path of ['scripts/ant-audio-plate-timeline.js', 'scripts/ant-audio-plate-timeline-render.js']) {
  researchToolHashes[path] = sha256(await readFile(resolve(path)));
}

await mkdir(resolve(outputDirectory, 'capture'), { recursive: true });
await mkdir(resolve(outputDirectory, 'spatial'), { recursive: true });
await mkdir(resolve(outputDirectory, 'validation'), { recursive: true });
await mkdir(resolve(outputDirectory, 'audio'), { recursive: true });
const toPlain = value => {
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(toPlain);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlain(item)]));
};
const payload = JSON.stringify(toPlain(timeline));
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
let browser;
let rendered;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.httpServer.address()?.port}`, { waitUntil: 'domcontentloaded' });
  rendered = await page.evaluate(async json => {
    const { renderAudioPlateTimeline, renderAudioPlateTimelineZooms } = await import('/scripts/ant-audio-plate-timeline.js');
    const data = JSON.parse(json);
    const png = draw => {
      const canvas = document.createElement('canvas');
      draw(canvas);
      return canvas.toDataURL('image/png').split(',')[1];
    };
    return { overview: png(canvas => renderAudioPlateTimeline(canvas, data)),
      zooms: data.zooms.length ? png(canvas => renderAudioPlateTimelineZooms(canvas, data)) : null };
  }, payload);
} finally {
  await browser?.close();
  await server.close();
}
const outputNames = {
  overview: 'timeline-overview.png',
  zooms: rendered.zooms ? 'zoom-details.png' : null,
  audio: 'audio/continuous-final-gain.webm',
  snapshots: { A: 'spatial/A-early.png', B: 'spatial/B-formation.png', C: 'spatial/C-late.png' },
  capture: 'capture/events-and-timeline.json.gz',
  validation: 'validation/capture-validation.json',
  audioMetrics: 'audio-metrics.json',
  clockHealth: 'clock-health.json'
};
await writeFile(resolve(outputDirectory, outputNames.overview), Buffer.from(rendered.overview, 'base64'));
if (rendered.zooms) await writeFile(resolve(outputDirectory, outputNames.zooms), Buffer.from(rendered.zooms, 'base64'));
await copyFile(audioWebmPath, resolve(outputDirectory, outputNames.audio));
for (const snapshot of evidence.spatialSnapshots) {
  const key = snapshot.label;
  const target = resolve(outputDirectory, outputNames.snapshots[key]);
  await copyFile(resolve(inputDirectory, snapshot.image), target);
}
const capturedRecords = {
  seed: evidence.seed, simulationStartMs: evidence.end.simulationStartMs,
  simulationEndMs: evidence.end.simulationEndMs, eventCounts: evidence.eventCounts,
  spatialSnapshots: evidence.spatialSnapshots, clockAnchors: evidence.clockAnchors,
  events: evidence.events, timeline: evidence.timeline,
  finalState: evidence.finalState, captureSettings: evidence.captureSettings,
  sourceHashes: evidence.sourceHashes, provenance: evidence.provenance
};
await writeFile(resolve(outputDirectory, outputNames.capture), gzipSync(Buffer.from(JSON.stringify(capturedRecords))));
await writeFile(resolve(outputDirectory, outputNames.validation), JSON.stringify({
  status: timeline.validation.status,
  checks: timeline.validation.checks,
  eventCounts: evidence.eventCounts,
  timelineRows: evidence.timeline.length,
  anchors: evidence.clockAnchors.length,
  decodedPcm: { sampleRate: decoded.sampleRate, frames: decoded.sampleCount,
    durationSeconds: decoded.sampleCount / decoded.sampleRate, format: 'IEEE float32 stereo' },
  observerRngCalls: evidence.end.rng.observerCallDelta
}, null, 2));
await writeFile(resolve(outputDirectory, outputNames.audioMetrics), JSON.stringify(timeline.audioMetrics, null, 2));
await writeFile(resolve(outputDirectory, outputNames.clockHealth), JSON.stringify(timeline.clockHealth, null, 2));

const hashPath = async path => sha256(await readFile(path));
const outputHashes = {};
for (const [label, path] of Object.entries({
  overview: resolve(outputDirectory, outputNames.overview),
  ...(outputNames.zooms ? { zooms: resolve(outputDirectory, outputNames.zooms) } : {}),
  audio: resolve(outputDirectory, outputNames.audio),
  snapshotA: resolve(outputDirectory, outputNames.snapshots.A),
  snapshotB: resolve(outputDirectory, outputNames.snapshots.B),
  snapshotC: resolve(outputDirectory, outputNames.snapshots.C),
  capture: resolve(outputDirectory, outputNames.capture),
  validation: resolve(outputDirectory, outputNames.validation),
  audioMetrics: resolve(outputDirectory, outputNames.audioMetrics),
  clockHealth: resolve(outputDirectory, outputNames.clockHealth)
})) outputHashes[label] = { path: relative(resolve(outputDirectory), path).replaceAll('\\', '/'), sha256: await hashPath(path) };
const manifest = {
  status: 'rendered',
  presetId: timeline.presetId,
  input: { captureFile: basename(evidencePath), sourcePcm: basename(wavPath), sourceAudio: basename(audioWebmPath),
    captureJsonSha256: sha256(await readFile(evidencePath)),
    floatWavSha256: sha256(wavBytes), finalGainWebmSha256: sha256(webmBytes),
    decoded: { sampleRate: decoded.sampleRate, frames: decoded.sampleCount,
      durationSeconds: decoded.sampleCount / decoded.sampleRate, format: 'IEEE float32 stereo' } },
  sourceHashes: currentSourceHashes,
  researchToolHashes,
  fixedAudioPreset: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET,
  capture: { seed: evidence.seed, simulationStartMs: evidence.end.simulationStartMs,
    simulationEndMs: evidence.end.simulationEndMs, simulationSeconds: evidence.simulationDurationSeconds,
    wallSeconds: evidence.wallDurationSeconds, audioContextSeconds: evidence.end.audioContextDurationSeconds,
    clockAnchorCount: evidence.clockAnchors.length, eventCounts: evidence.eventCounts,
    rngObserverCallDelta: evidence.end.rng.observerCallDelta },
  zooms: timeline.zooms.map((zoom, index) => ({ index, reason: zoom.reason,
    audioDurationSeconds: zoom.audioDurationSeconds,
    baseStartSeconds: zoom.baseStartSeconds, collisionOffsetSeconds: zoom.collisionOffsetSeconds,
    requestedStartSeconds: zoom.requestedStartSeconds,
    simulationStartSeconds: zoom.actualSimulationStartSeconds,
    simulationEndSeconds: zoom.actualSimulationEndSeconds,
    plateCountStart: zoom.stateStart.plateCount, plateCountEnd: zoom.stateEnd.plateCount,
    contactGroups: zoom.contactGroupCount, individualFeet: zoom.individualFootCount,
    plateBirths: zoom.birthCount, sampleRange: [zoom.startSampleIndex, zoom.endSampleIndex] })),
  renderHashes: outputHashes
};
await writeFile(resolve(outputDirectory, 'render-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ outputDirectory, validation: timeline.validation,
  eventCounts: evidence.eventCounts, clockHealth: timeline.clockHealth,
  wholeRunAudio: timeline.audioMetrics.wholeRun, zooms: manifest.zooms, renderHashes: outputHashes }, null, 2));
