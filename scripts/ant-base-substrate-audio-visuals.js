import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { chromium } from 'playwright';
import { buildStratigraphyAudioSnapshot } from './audio-snapshot-renderer.js';
import {
  buildStratigraphyAudioOverview,
  decodeStereoFloatWav,
  renderStratigraphyAudioOverview,
  renderStratigraphyAudioZooms,
  STRATIGRAPHY_AUDIO_OVERVIEW_PRESET
} from './stratigraphy-audio-overview.js';

const audioDir = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/audio');
const report = JSON.parse(await readFile(resolve(audioDir, 'audio-ab-report.json'), 'utf8'));
const recordingPath = resolve(audioDir, report.sourceRun.eventStreamFile);
const recordingBytes = await readFile(recordingPath);
assertHash(recordingBytes, report.sourceRun.gzipSha256, report.sourceRun.eventStreamFile);
const recording = JSON.parse(gunzipSync(recordingBytes).toString('utf8'));
const firstBirthMs = report.sourceRun.firstPlateBirthSeconds * 1000;
const [preStartMs, preEndMs] = report.windows.prebirthSimulationSeconds.map(value => value * 1000);
const [postStartMs, postEndMs] = report.windows.postbirthSimulationSeconds.map(value => value * 1000);
if (Math.abs(preEndMs - firstBirthMs) > 1e-6 || Math.abs(postStartMs - firstBirthMs) > 1e-6
    || Math.abs(preStartMs - (firstBirthMs - 10000)) > 1e-6 || Math.abs(postEndMs - (firstBirthMs + 10000)) > 1e-6) {
  throw new Error('PCM report windows do not match the frozen 10-second prebirth/first-birth windows.');
}

const trackSpecs = [
  { key: 'preOff', file: 'prebirth-off-silence-10s-48khz-f32.wav', label: 'Pre-birth · substrate Off' },
  { key: 'preOn', file: 'prebirth-on-substrate-10s-48khz-f32.wav', label: 'Pre-birth · substrate On' },
  { key: 'postOff', file: 'postbirth-off-born-only-10s-48khz-f32.wav', label: 'First Plate · substrate Off' },
  { key: 'bornOnly', file: 'postbirth-born-only-10s-48khz-f32.wav', label: 'First Plate · born Plate only' },
  { key: 'substrateOnly', file: 'postbirth-substrate-only-10s-48khz-f32.wav', label: 'First Plate · substrate only' },
  { key: 'postOn', file: 'postbirth-on-summed-10s-48khz-f32.wav', label: 'First Plate · substrate On summed' }
];
const tracks = new Map();
const baseReceipts = {
  preOn: report.sourceEvents.workletReports.preOn?.[0]?.receipts || [],
  postOn: report.sourceEvents.workletReports.post?.[0]?.receipts || []
};
const legacyWindows = {
  preOn: recording.legacyStrikes.filter(event => event.simulationTimeMs >= preStartMs && event.simulationTimeMs < preEndMs),
  postOn: recording.legacyStrikes.filter(event => event.simulationTimeMs >= postStartMs && event.simulationTimeMs < postEndMs)
};
const receiptFrames = {};
for (const key of ['preOn', 'postOn']) {
  if (legacyWindows[key].length !== baseReceipts[key].length) {
    throw new Error(`${key} legacy strike/receipt count mismatch: ${legacyWindows[key].length} vs ${baseReceipts[key].length}.`);
  }
  const byFrame = new Map();
  for (const receipt of baseReceipts[key]) {
    const frames = byFrame.get(receipt.requestedFrame) || [];
    frames.push(receipt);
    byFrame.set(receipt.requestedFrame, frames);
  }
  receiptFrames[key] = byFrame;
}
for (const spec of trackSpecs) {
  const wavBytes = await readFile(resolve(audioDir, spec.file));
  assertHash(wavBytes, report.outputs?.[spec.file]?.sha256, spec.file);
  const wav = decodeStereoFloatWav(wavBytes);
  if (wav.sampleRate !== 48000 || wav.sampleCount !== 480000) {
    throw new Error(`${spec.file} must contain exactly 10 s of 48 kHz stereo PCM.`);
  }
  const postbirth = spec.key.startsWith('post') || spec.key === 'bornOnly' || spec.key === 'substrateOnly';
  const startMs = postbirth ? postStartMs : preStartMs;
  const endMs = postbirth ? postEndMs : preEndMs;
  const events = recording.contacts.flatMap((event, groupIndex) =>
    event.simulationTimeMs >= startMs && event.simulationTimeMs < endMs
      ? [{ type: 'FOOT_CONTACT', simulationTimeMs: event.simulationTimeMs,
        payload: event.payload, groupIndex }]
      : []);
  if (postbirth) events.push({ type: 'PLATE_BIRTH', simulationTimeMs: firstBirthMs,
    payload: { id: report.sourceRun.firstPlateId }, label: 'P1' });
  events.sort((a, b) => a.simulationTimeMs - b.simulationTimeMs);
  const anchors = [
    { simulationTimeMs: startMs, audioSampleIndex: 0 },
    { simulationTimeMs: endMs, audioSampleIndex: wav.sampleCount }
  ];
  const displayAnchors = anchors.map(anchor => ({ ...anchor, simulationTimeMs: anchor.simulationTimeMs - startMs }));
  const displayEvents = events.map(event => ({ ...event, simulationTimeMs: event.simulationTimeMs - startMs }));
  const overview = buildStratigraphyAudioOverview({ channels: wav.channels, sampleRate: wav.sampleRate,
    simulationDurationSeconds: 10, clockAnchors: displayAnchors, events: displayEvents });
  const snapshot = buildStratigraphyAudioSnapshot(wav.channels,
    { sampleRate: wav.sampleRate, sourceDurationSeconds: 10 });
  const receiptKey = spec.key === 'preOn' ? 'preOn'
    : ['preOff', 'postOff', 'bornOnly'].includes(spec.key) ? null : 'postOn';
  const windowLegacy = receiptKey ? legacyWindows[receiptKey] : [];
  const receiptsByFrame = receiptKey ? receiptFrames[receiptKey] : null;
  const contactFrameCounts = new Map();
  for (const event of windowLegacy) {
    const frame = clampFrame(Math.round((event.simulationTimeMs - startMs) * 48));
    contactFrameCounts.set(frame, (contactFrameCounts.get(frame) || 0) + 1);
  }
  if (receiptKey) {
    for (const [frame, count] of contactFrameCounts) {
      if ((receiptsByFrame.get(frame) || []).length !== count) {
        throw new Error(`${spec.key} receipt frame count differs from FOOT_CONTACT at frame ${frame}.`);
      }
    }
  }
  const usedReceiptsByFrame = new Map();
  const contactMarkers = events.filter(event => event.type === 'FOOT_CONTACT').map(event => {
    const contactFrame = clampFrame(Math.round((event.simulationTimeMs - startMs) * 48));
    const used = usedReceiptsByFrame.get(contactFrame) || 0;
    const receipt = receiptKey ? receiptsByFrame.get(contactFrame)?.[used] : undefined;
    if (receiptKey && !receipt) throw new Error(`${spec.key} missing base dispatch receipt at contact frame ${contactFrame}.`);
    if (receipt) {
      usedReceiptsByFrame.set(contactFrame, used + 1);
      const delay = receipt.actualFrame - receipt.requestedFrame;
      if (delay < 0 || delay > 127) {
        throw new Error(`${spec.key} legacy dispatch at ${contactFrame} was ${delay} samples late; expected its 0–127 sample render-quantum range.`);
      }
    }
    return { event, contactFrame, requestedSchedulerFrame: receipt?.requestedFrame ?? contactFrame,
      baseActualDispatchFrame: receipt?.actualFrame ?? null,
      baseDispatchBlockOffsetSamples: receipt ? receipt.actualFrame - receipt.requestedFrame : null };
  });
  if (receiptKey && usedReceiptsByFrame.size && [...contactFrameCounts].some(([frame, count]) => usedReceiptsByFrame.get(frame) !== count)) {
    throw new Error(`${spec.key} did not map every base dispatch receipt to a FOOT_CONTACT group.`);
  }
  tracks.set(spec.key, { ...spec, wav, startMs, endMs, anchors, displayAnchors, events,
    overview, snapshot, groupCount: events.filter(event => event.type === 'FOOT_CONTACT').length,
    footCount: events.filter(event => event.type === 'FOOT_CONTACT')
      .reduce((sum, event) => sum + (event.payload?.contacts?.length || 0), 0), contactMarkers,
    baseReceiptCount: receiptKey ? baseReceipts[receiptKey].length : 0 });
}

const comparisonRows = [
  { name: 'prebirth-off-on.png', title: `Pre-birth · P1 ${report.sourceRun.firstPlateId} at excluded 10 s endpoint · substrate Off / On`, keys: ['preOff', 'preOn'] },
  { name: 'first-birth-off-born-substrate-on.png', title: 'First-birth window · Off / born Plate / substrate / On summed',
    keys: ['postOff', 'bornOnly', 'substrateOnly', 'postOn'] }
];
const comparisons = comparisonRows.map(comparison => ({ ...comparison,
  rows: comparison.keys.map(key => ({ label: key.startsWith('pre')
    ? `${tracks.get(key).label} · P1 birth at exclusive 10.000 s endpoint`
    : tracks.get(key).label,
    snapshot: tracks.get(key).snapshot })) }));
const bornPlateRoutedStrikes = recording.bornStrikes
  .filter(event => event.simulationTimeMs >= postStartMs && event.simulationTimeMs < postEndMs);
if (bornPlateRoutedStrikes.length !== report.sourceEvents.postbirthBornPlateStrikeMessages
    || bornPlateRoutedStrikes.some(event => event.payload?.plateId !== report.sourceRun.firstPlateId)) {
  throw new Error('First-birth routed strike list does not match the PCM report.');
}

const renderInputs = {
  comparisons: comparisons.map(({ name, rows }) => ({ name, rows: plain(rows) })),
  details: [...tracks.values()].map(track => ({ key: track.key,
    name: `${track.key}-fixed-10s-events.png`, overviewName: `${track.key}-fixed-10s-overview.png`,
    title: track.startMs === preStartMs
      ? `${track.label} · simulation ${(track.startMs / 1000).toFixed(4)}–${(track.endMs / 1000).toFixed(4)} s · P1 ${report.sourceRun.firstPlateId} birth at exclusive endpoint (excluded)`
      : `${track.label} · P1 ${report.sourceRun.firstPlateId} born at ${(firstBirthMs / 1000).toFixed(4)} s / audio 0.000 s · simulation ${(track.startMs / 1000).toFixed(4)}–${(track.endMs / 1000).toFixed(4)} s`,
    overview: plain(track.overview) }))
};
const moduleFiles = new Map([
  ['/scripts/audio-snapshot-renderer.js', resolve('scripts/audio-snapshot-renderer.js')],
  ['/scripts/stratigraphy-audio-overview.js', resolve('scripts/stratigraphy-audio-overview.js')]
]);
const server = createHttpServer(async (request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><meta charset="utf-8"><title>ANT PCM evidence</title>');
    return;
  }
  const path = moduleFiles.get(request.url);
  if (!path) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
  response.end(await readFile(path));
});
let browser;
let images = [];
try {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
  images = await page.evaluate(async inputs => {
    const { renderStratigraphyAudioComparison } = await import('/scripts/audio-snapshot-renderer.js');
    const { renderStratigraphyAudioOverview, renderStratigraphyAudioZooms } = await import('/scripts/stratigraphy-audio-overview.js');
    const encode = canvas => canvas.toDataURL('image/png').split(',')[1];
    const result = [];
    for (const comparison of inputs.comparisons) {
      const canvas = document.createElement('canvas');
      renderStratigraphyAudioComparison(canvas, comparison.rows);
      result.push({ name: comparison.name, png: encode(canvas) });
    }
    for (const detail of inputs.details) {
      const overviewCanvas = document.createElement('canvas');
      renderStratigraphyAudioOverview(overviewCanvas, detail.overview);
      const overviewContext = overviewCanvas.getContext('2d');
      overviewContext.fillStyle = '#fff'; overviewContext.fillRect(0, 0, overviewCanvas.width, 34);
      overviewContext.fillStyle = '#111'; overviewContext.font = '16px sans-serif';
      overviewContext.fillText(detail.title, 20, 24);
      result.push({ name: detail.overviewName, png: encode(overviewCanvas) });
      const canvas = document.createElement('canvas');
      renderStratigraphyAudioZooms(canvas, detail.overview, [0]);
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, 25);
      context.fillStyle = '#111'; context.font = '14px sans-serif'; context.fillText(detail.title, 12, 18);
      result.push({ name: detail.name, png: encode(canvas) });
    }
    return result;
  }, renderInputs);
  for (const image of images) {
    const bytes = Buffer.from(image.png, 'base64');
    await writeFile(resolve(audioDir, image.name), bytes);
    image.sha256 = createHash('sha256').update(bytes).digest('hex');
    image.bytes = bytes.length;
  }
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}

const manifest = {
  status: 'rendered-from-captured-float32-pcm',
  sourceReport: 'audio-ab-report.json',
  sourceEventStream: report.sourceRun.eventStreamFile,
  inputHashes: { eventStreamSha256: report.sourceRun.gzipSha256,
    pcmSha256: Object.fromEntries(trackSpecs.map(spec => [spec.file, report.outputs[spec.file].sha256])) },
  seed: report.sourceRun.seed,
  firstPlate: { id: report.sourceRun.firstPlateId, simulationTimeMs: firstBirthMs, marker: 'P1' },
  windows: {
    prebirth: { simulationStartMs: preStartMs, simulationEndMs: preEndMs,
      halfOpen: true, note: 'No Plate-birth marker; first birth is exactly the exclusive endpoint.' },
    firstBirth: { simulationStartMs: postStartMs, simulationEndMs: postEndMs,
      halfOpen: true, note: 'P1 birth marker is at audio offset zero.' }
  },
  renderer: {
    detail: 'ant-surface-stratigraphy-v1',
    detailPreset: tracks.get('preOff').snapshot.rendering,
    overviewZoomPreset: STRATIGRAPHY_AUDIO_OVERVIEW_PRESET,
    waveformAmplitude: [-1, 1], waveformLuminance: { background: 255, line: 24, guide: 180 },
    spectrogram: { fftSize: 1024, window: 'Hann', hopSize: 256, frequencyHz: [0, 8000],
      dbfs: [-100, 0], grayscaleGamma: 1 },
    normalization: 'none; fixed full-scale waveform and fixed dBFS spectrogram',
    clockMap: 'Each PCM window is one scheduled 10 s render at 48 kHz. Absolute anchors map the recorded simulation endpoints to PCM sample 0 and sampleCount; display-only anchors/events are shifted by the window start because the existing overview API requires zero-relative time.',
    legacyScheduler: 'The legacy Plate handles strikes on its audio render quantum: actual dispatch is 0–127 samples after the requested sample frame. Receipts are matched by requested sample frame because source events may be emitted out of chronological order; requested and actual frames are not interchangeable.',
    bornPlateScheduler: 'Born Plate strike messages use their scheduled sample frame exactly. Their routed-message list is stored separately from FOOT_CONTACT groups; the counts and events are not assumed to be one-to-one.'
  },
  comparisons: comparisonRows.map(({ name, title, keys }) => {
    const image = images.find(item => item.name === name);
    return { name, title, tracks: keys, sha256: image.sha256, bytes: image.bytes };
  }),
  tracks: [...tracks.values()].map(track => ({
    key: track.key, pcm: track.file, image: `${track.key}-fixed-10s-events.png`,
    imageSha256: images.find(image => image.name === `${track.key}-fixed-10s-events.png`).sha256,
    overviewImage: `${track.key}-fixed-10s-overview.png`,
    overviewImageSha256: images.find(image => image.name === `${track.key}-fixed-10s-overview.png`).sha256,
    simulationStartMs: track.startMs, simulationEndMs: track.endMs,
    absoluteClockAnchors: track.anchors,
    displayOffsetSimulationMs: track.startMs,
    displayClockAnchors: track.displayAnchors,
    footContactGroups: track.groupCount, individualFootContacts: track.footCount,
    baseReceiptCount: track.baseReceiptCount,
    markers: track.events.filter(event => event.type === 'PLATE_BIRTH').map(event => ({
      type: event.type, label: event.label, id: event.payload?.id,
      simulationTimeMs: event.simulationTimeMs, audioOffsetMs: event.simulationTimeMs - track.startMs,
      audioSampleIndex: 0
    })).concat(track.contactMarkers.map(({ event, requestedSchedulerFrame, baseActualDispatchFrame,
      baseDispatchBlockOffsetSamples, contactFrame }) => ({
      type: event.type, simulationTimeMs: event.simulationTimeMs,
      audioOffsetMs: event.simulationTimeMs - track.startMs,
      audioSampleIndex: contactFrame,
      requestedSchedulerFrame, baseActualDispatchFrame,
      baseDispatchBlockOffsetSamples,
      contactGroupIndex: event.groupIndex,
      contacts: event.payload?.contacts || []
    })))
  })),
  bornPlateRoutedStrikes: bornPlateRoutedStrikes
    .map(event => ({ simulationTimeMs: event.simulationTimeMs,
      sampleExactScheduledFrame: clampFrame(Math.round((event.simulationTimeMs - postStartMs) * 48)),
      plateId: event.payload?.plateId, payload: event.payload })),
  pcmMetrics: report.outputs
};
await writeFile(resolve(audioDir, 'audio-visual-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ images: images.map(image => resolve(audioDir, image.name)),
  manifest: resolve(audioDir, 'audio-visual-manifest.json'),
  footContactGroups: manifest.tracks.map(track => ({ track: track.key, groups: track.footContactGroups, feet: track.individualFootContacts })) }, null, 2));

function plain(value) {
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

function clampFrame(frame) {
  return Math.max(0, Math.min(479999, frame));
}

function assertHash(bytes, expected, label) {
  if (!expected) throw new Error(`Missing expected SHA-256 for ${label}.`);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`${label} SHA-256 mismatch: ${actual} != ${expected}.`);
}
