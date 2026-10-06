import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { chromium } from 'playwright';
import { decodeStereoFloatWav } from './stratigraphy-audio-overview.js';
import { buildStratigraphyAudioSnapshot, STRATIGRAPHY_AUDIO_PRESET } from './audio-snapshot-renderer.js';

const runDir = resolve(process.argv[2] || 'test-results/stratigraphy-motion-2026-10-06T05-30-53-880Z');
const outDir = resolve('docs/ant/evidence/2026-10-06-stratigraphy-runtime/overview');
await mkdir(outDir, { recursive: true });
const run = JSON.parse(await readFile(resolve(runDir, 'continuous-natural-0-600s.json'), 'utf8'));
const wav = decodeStereoFloatWav(await readFile(resolve(runDir, 'continuous-natural-0-600s.wav')));
const historicalMeta = JSON.parse(await readFile(resolve('docs/ant/evidence/2026-10-05-surface-plates/bornsurface-mature-single.json'), 'utf8'));
const historical = decodeStereoFloatWav(await readFile(resolve(runDir, 'historical-mature-single-source-pcm.wav')));
const anchors = run.clockAnchors;
function sampleAt(simMs) {
  for (let i = 1; i < anchors.length; i++) {
    const b = anchors[i], a = anchors[i - 1];
    if (simMs <= b.simulationTimeMs) return Math.round(a.audioSampleIndex + (simMs - a.simulationTimeMs) * (b.audioSampleIndex - a.audioSampleIndex) / (b.simulationTimeMs - a.simulationTimeMs));
  }
  return wav.sampleCount;
}
function simAt(sampleIndex) {
  for (let i = 1; i < anchors.length; i++) {
    const b = anchors[i], a = anchors[i - 1];
    if (sampleIndex <= b.audioSampleIndex) return (a.simulationTimeMs + (sampleIndex - a.audioSampleIndex) * (b.simulationTimeMs - a.simulationTimeMs) / (b.audioSampleIndex - a.audioSampleIndex)) / 1000;
  }
  return run.simulationDurationSeconds;
}
const plateEvents = run.events.filter(e => e.type === 'plate-birth');
const sphereEvents = run.events.filter(e => e.type === 'sphere-birth');
function plateExposureAt(seconds) {
  const masks = [];
  for (const event of plateEvents) {
    if (event.simulationTimeMs / 1000 > seconds) break;
    const mask = event.payload?.mask;
    if (Array.isArray(mask) && mask.length === 96 * 96) masks.push({ id: event.payload.id, mask });
  }
  const top = new Int16Array(96 * 96);
  top.fill(-1);
  masks.forEach((plate, index) => { for (let cell = 0; cell < plate.mask.length; cell++) if (plate.mask[cell]) top[cell] = index; });
  const exposedPlateIDs = [], buriedPlateIDs = [];
  masks.forEach((plate, index) => {
    let exposed = false, buried = false;
    for (let cell = 0; cell < plate.mask.length; cell++) if (plate.mask[cell]) {
      if (top[cell] === index) exposed = true; else buried = true;
      if (exposed && buried) break;
    }
    if (exposed) exposedPlateIDs.push(plate.id);
    if (buried) buriedPlateIDs.push(plate.id);
  });
  return { plateCount: masks.length, exposedPlateCount: exposedPlateIDs.length, buriedPlateCount: buriedPlateIDs.length, exposedPlateIDs, buriedPlateIDs };
}
const plate24 = plateEvents[23];
const six = [
  { key: 'first', sim: plateEvents[0].simulationTimeMs / 1000, title: 'First natural Plate' },
  { key: 'multi-z', sim: plateEvents[2].simulationTimeMs / 1000 + 4, title: 'Natural multi-Z overlap' },
  { key: 'deep-burial', sim: plateEvents[15].simulationTimeMs / 1000 + 4, title: 'Later burial / exposed-to-buried' },
  { key: 'plate-24', sim: plate24.simulationTimeMs / 1000 + 4, title: '24th natural Plate birth' },
  { key: 'sphere', sim: sphereEvents[0].simulationTimeMs / 1000 + 1, title: 'First natural Sphere nodule' }
];
const duration = STRATIGRAPHY_AUDIO_PRESET.durationSeconds;
const rows = [];
const metadataRows = [];
for (const milestone of six) {
  let start = sampleAt(milestone.sim * 1000);
  const n = Math.round(duration * wav.sampleRate);
  if (start + n > wav.sampleCount) start = wav.sampleCount - n;
  const end = start + n;
  const simStart = simAt(start), simEnd = simAt(end);
  const events = run.events.filter(e => e.type === 'FOOT_CONTACT' && e.simulationTimeMs >= simStart * 1000 && e.simulationTimeMs <= simEnd * 1000);
  const feet = events.reduce((sum, e) => sum + (e.payload?.contacts?.length || 0), 0);
  const before = run.timeline.filter(c => c.simulationTimeMs / 1000 <= simStart).at(-1);
  const after = run.timeline.find(c => c.simulationTimeMs / 1000 >= simEnd) || run.timeline.at(-1);
  const checkpoints = [before, after].filter(Boolean);
  const range = key => `${checkpoints[0]?.[key] ?? '—'}–${checkpoints.at(-1)?.[key] ?? '—'}`;
  const diag = key => `${checkpoints[0]?.processorDiagnosticsObserved?.[key] ?? '—'}–${checkpoints.at(-1)?.processorDiagnosticsObserved?.[key] ?? '—'}`;
  const plateStart = plateExposureAt(simStart), plateEnd = plateExposureAt(simEnd);
  const label = `${milestone.title} | SIM ${simStart.toFixed(1)}–${simEnd.toFixed(1)}s | Ant ${range('population')} | Act ${checkpoints[0]?.activation?.toFixed(2) ?? '—'}→${checkpoints.at(-1)?.activation?.toFixed(2) ?? '—'} | Plate ${plateStart.plateCount}→${plateEnd.plateCount} (exposed ${plateStart.exposedPlateCount}→${plateEnd.exposedPlateCount}) | Awake ${diag('awakeLayers')} / asleep ${diag('sleepingLayers')} | Sphere ${range('noduleCount')}`;
  const snapshot = buildStratigraphyAudioSnapshot({ left: wav.channels.left.subarray(start, end), right: wav.channels.right.subarray(start, end) }, { sampleRate: wav.sampleRate, sourceDurationSeconds: duration });
  rows.push({ label, snapshot });
  metadataRows.push({ ...milestone, label, simulationStartSeconds: simStart, simulationEndSeconds: simEnd, audioStartSampleIndex: start, audioEndSampleIndex: end, audioDurationSeconds: duration, footContactGroups: events.length, individualFootContacts: feet,
    antPopulationRange: [checkpoints[0]?.population, checkpoints.at(-1)?.population], activationRange: [checkpoints[0]?.activation, checkpoints.at(-1)?.activation],
    plateExposureAtAudioStart: plateStart, plateExposureAtAudioEnd: plateEnd,
    exposedCellCountRange: [checkpoints[0]?.exposedCellCount, checkpoints.at(-1)?.exposedCellCount], buriedLayerCellCountRange: [checkpoints[0]?.buriedLayerCellCount, checkpoints.at(-1)?.buriedLayerCellCount],
    awakePlateLayerRange: [checkpoints[0]?.processorDiagnosticsObserved?.awakeLayers, checkpoints.at(-1)?.processorDiagnosticsObserved?.awakeLayers],
    sleepingPlateLayerRange: [checkpoints[0]?.processorDiagnosticsObserved?.sleepingLayers, checkpoints.at(-1)?.processorDiagnosticsObserved?.sleepingLayers],
    sphereNoduleRange: [checkpoints[0]?.noduleCount, checkpoints.at(-1)?.noduleCount], timelineStart: checkpoints[0], timelineEnd: checkpoints.at(-1) });
}
const historicalPlateCount = historicalMeta.platesAtStart.count;
if (historicalPlateCount !== 1 || historicalMeta.platesAtEnd.count !== 1) throw new Error('Historical single-Plate comparison requires one frozen Plate throughout the clip');
const historicalLabel = `Historical d281 | SIM 154.0–164.1s | Ant ${historicalMeta.recording.activeAntMin}–${historicalMeta.recording.activeAntMax} | Act ${historicalMeta.recording.colonyActivationMin.toFixed(2)}–${historicalMeta.recording.colonyActivationMax.toFixed(2)} | Plate 1 (single exposed layer) | Awake/asleep/Sphere not recorded`;
rows.splice(0, 0, { label: historicalLabel, snapshot: buildStratigraphyAudioSnapshot(historical.channels, { sampleRate: historical.sampleRate, sourceDurationSeconds: historical.sampleCount / historical.sampleRate }) });
const plain = value => ArrayBuffer.isView(value) ? Array.from(value) : Array.isArray(value) ? value.map(plain) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)])) : value;
const server = await createViteServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const data = JSON.stringify(plain(rows));
  const png = await page.evaluate(async json => {
    const { renderStratigraphyAudioComparison } = await import('/scripts/audio-snapshot-renderer.js');
    const canvas = document.createElement('canvas');
    renderStratigraphyAudioComparison(canvas, JSON.parse(json));
    return canvas.toDataURL('image/png').split(',')[1];
  }, data);
  const name = 'historical-plus-five-natural-milestones-fixed-10s.png';
  await writeFile(resolve(outDir, name), Buffer.from(png, 'base64'));
  const metadata = { image: name, preset: STRATIGRAPHY_AUDIO_PRESET, historical: { source: 'docs/ant/evidence/2026-10-05-surface-plates/bornsurface-mature-single.webm', sourceDurationSeconds: historical.sampleCount / historical.sampleRate, simulationStartSeconds: historicalMeta.recording.simulationStartMs / 1000, simulationEndSeconds: historicalMeta.recording.simulationEndMs / 1000, antPopulationRange: [historicalMeta.recording.activeAntMin, historicalMeta.recording.activeAntMax], activationRange: [historicalMeta.recording.colonyActivationMin, historicalMeta.recording.colonyActivationMax], plateBirths: historicalMeta.recording.numberBornPlates, awakeSleepingSphereDiagnosticsRecorded: false, footContactGroups: historicalMeta.recording.footContactEvents, individualFootContacts: historicalMeta.recording.footContacts }, currentSource: 'continuous-natural-0-600s.wav', rows: metadataRows, note: 'Every row uses exactly 10 decoded audio seconds with unchanged fixed display scales. Natural milestones are selected through captured nonuniform simulation/audio anchors; each row shows its actual simulation-time span, population, activation, total/exposed Plate counts, awake/sleeping layer counts, and Sphere nodule count. Historical awake/sleeping and Sphere diagnostics were not recorded and are labeled accordingly. Exposed Plates are those with at least one mask cell not covered by a later natural Plate mask; plates can be partly exposed and partly buried. The historical source is read-only.' };
  metadata.historical.plateCountStart = historicalPlateCount;
  metadata.historical.plateCountEnd = historicalMeta.platesAtEnd.count;
  metadata.historical.exposedPlateCount = 1;
  metadata.historical.exposureRule = 'The one retained historical Plate has no overlying material; birth count during this clip is separate from historical Plate count.';
  await writeFile(resolve(outDir, 'historical-plus-five-natural-milestones-fixed-10s.json'), JSON.stringify(metadata, null, 2));
  console.log(JSON.stringify({ image: resolve(outDir, name), rows: metadataRows.map(({ key, simulationStartSeconds, simulationEndSeconds, footContactGroups, individualFootContacts }) => ({ key, simulationStartSeconds, simulationEndSeconds, footContactGroups, individualFootContacts })) }, null, 2));
} finally { await browser?.close(); await server.close(); }
