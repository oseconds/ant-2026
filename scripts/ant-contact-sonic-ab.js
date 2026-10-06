import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';
import { buildStratigraphyAudioSnapshot } from './audio-snapshot-renderer.js';

const mode = process.argv[2];
if (!['baseline', 'candidate'].includes(mode)) throw new Error('Usage: node scripts/ant-contact-sonic-ab.js baseline|candidate');
const root = process.cwd();
const runDir = resolve('test-results/stratigraphy-motion-2026-10-06T05-30-53-880Z');
const evidenceDir = resolve('docs/ant/evidence/2026-10-06-contact-sonic-baseline');
await mkdir(evidenceDir, { recursive: true });
const compressed = await readFile(resolve('docs/ant/evidence/2026-10-06-stratigraphy-runtime/motion/continuous-natural-0-600s-browser-evidence.json.gz'));
const recording = JSON.parse(gunzipSync(compressed));
const events = recording.events;
const firstBirth = events.find(event => event.type === 'plate-birth');
if (!firstBirth) throw new Error('The recorded run has no frozen Plate birth.');
const startSeconds = 154, endSeconds = 164;
const startMs = startSeconds * 1000, endMs = endSeconds * 1000;
const sourceGroups = events.filter(event => event.type === 'FOOT_CONTACT'
  && event.simulationTimeMs >= startMs && event.simulationTimeMs < endMs);
if (!sourceGroups.length) throw new Error('No natural FOOT_CONTACT groups in the selected window.');

// Recreate contact-conditioned local material responses from the exact recorded history.
const field = new SurfaceField();
let previousMs = 0;
const responseByTime = new Map();
for (const event of events) {
  if (event.type !== 'FOOT_CONTACT' || event.simulationTimeMs > endMs) continue;
  const eventMs = event.simulationTimeMs;
  field.relax(Math.max(0, eventMs - previousMs) / 1000);
  previousMs = eventMs;
  if (eventMs >= startMs) responseByTime.set(event, field.applyFootContact(event.payload));
  else field.applyFootContact(event.payload);
}

const denseEvents = [];
const toFrame = timeMs => Math.max(0, Math.min(480000 - 1, Math.round((timeMs - startMs) * 48)));
const duplicateContactCount = sourceGroups.reduce((sum, event) => sum + (event.payload.contacts?.length || 0), 0);
const sparseSelected = [];
let sparseLastMs = -Infinity;
for (const event of sourceGroups) {
  if (event.simulationTimeMs - sparseLastMs < 1000) continue;
  sparseSelected.push(event);
  sparseLastMs = event.simulationTimeMs;
}

function bridgeInputs(groups) {
  const routed = [];
  let validGroups = 0, individualFeet = 0;
  const bridgeEvents = [];
  for (const event of groups) {
    const source = event.payload;
    const responses = responseByTime.get(event) || [];
    validGroups++;
    individualFeet += source.contacts?.length || 0;
    bridgeEvents.push({
      type: 'FOOT_CONTACT', contacts: source.contacts, strength: source.strength,
      simulationTimeMs: event.simulationTimeMs,
      responses
    });
  }
  return { bridgeEvents, validGroups, individualFeet };
}

const dense = bridgeInputs(sourceGroups);
const sparse = bridgeInputs(sparseSelected);
const workletSource = mode === 'baseline'
  ? execFileSync('git', ['show', '2d9430b:static/worklets/surface-plate.worklet.js'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  : await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');
const sourceWorkletSha256 = createHash('sha256').update(workletSource).digest('hex');
const instrumented = instrumentForFrameReplay(workletSource);

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
  const renders = await page.evaluate(async ({ workletText, plate, denseData, sparseData }) => {
    const [{ SurfaceAudioBridge }, { compileSurfaceTopology }] = await Promise.all([
      import('/src/lib/audio/SurfaceAudioBridge.js'), import('/src/lib/audio/compileSurfaceTopology.js')
    ]);
    const topology = compileSurfaceTopology({ plates: [plate], nodules: [], generation: 1, maxLayers: 1 });
    const blobUrl = URL.createObjectURL(new Blob([workletText], { type: 'text/javascript' }));
    const render = async data => {
      const offline = new OfflineAudioContext(2, 480000, 48000);
      await offline.audioWorklet.addModule(blobUrl);
      const node = new AudioWorkletNode(offline, 'surface-plate-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      const finalGain = offline.createGain(); finalGain.gain.value = 0.245;
      node.connect(finalGain); finalGain.connect(offline.destination);
      let processorReport = null;
      const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('AudioWorklet schedule handshake timed out.')), 10000);
        node.port.onmessage = message => {
          if (message.data?.type === 'ab-ready') { clearTimeout(timer); resolve(); }
          if (message.data?.type === 'ab-done') processorReport = message.data;
        };
      });
      const done = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('AudioWorklet did not finish the fixed ten-second frame schedule.')), 30000);
        const prior = node.port.onmessage;
        node.port.onmessage = message => {
          prior?.(message);
          if (message.data?.type === 'ab-done') { clearTimeout(timer); processorReport = message.data; resolve(message.data); }
        };
      });
      node.port.postMessage({ type: 'topology', payload: topology });
      const routed = [];
      const bridge = new SurfaceAudioBridge({ audioEngine: { context: offline } });
      bridge.storePlates([plate]); bridge.compileTopology({ plates: [plate], nodules: [] }); bridge._enabled = true;
      bridge.worklet = { node: { port: { postMessage: message => { if (message.type === 'strike') routed.push(message.payload); } } } };
      const routedFeet = [];
      const routedFrames = [];
      for (const event of data.groups) {
        const before = routed.length;
        bridge.handleFootContact(event.payload, { responses: event.responses });
        for (let i = before; i < routed.length; i++) { routedFeet.push(routed[i]); routedFrames.push(event.frame); }
      }
      const schedule = routedFeet.map((payload, index) => ({ frame: routedFrames[index], message: { type: 'strike', payload } }));
      const canonicalSchedule = JSON.stringify(schedule.map(item => ({ frame: item.frame,
        plateId: item.message.payload.plateId, position: item.message.payload.position, strength: item.message.payload.strength,
        footprintRadius: item.message.payload.footprintRadius, hardness: item.message.payload.hardness })));
      const scheduleDigest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalSchedule))))
        .map(value => value.toString(16).padStart(2, '0')).join('');
      node.port.postMessage({ type: 'ab-schedule', payload: { events: schedule, endFrame: 480000 } });
      await ready;
      const rendered = await offline.startRendering();
      await done;
      const left = new Float32Array(rendered.getChannelData(0)), right = new Float32Array(rendered.getChannelData(1));
      node.disconnect(); node.port.close();
      return { left: Array.from(left), right: Array.from(right), sampleRate: rendered.sampleRate,
        routedStrikes: routedFeet.length, routedFeet: bridge.diagnostics.routedFeet, groups: data.groups.length, individualFeet: data.individualFeet,
        bridgeDiagnostics: { ...bridge.diagnostics }, processorReport, routedFrames, scheduleDigest };
    };
    return { dense: await render(denseData), sparse: await render(sparseData) };
  }, { workletText: instrumented, plate: firstBirth.payload, denseData: serializePageCondition(dense, sourceGroups, toFrame),
    sparseData: serializePageCondition(sparse, sparseSelected, toFrame) });

  for (const condition of ['dense', 'sparse']) {
    const rendered = renders[condition];
    const raw = { sampleRate: rendered.sampleRate, left: Float32Array.from(rendered.left), right: Float32Array.from(rendered.right),
      routedStrikes: rendered.routedStrikes, routedFeet: rendered.routedFeet, groups: rendered.groups, individualFeet: rendered.individualFeet,
      bridgeDiagnostics: rendered.bridgeDiagnostics, processorReport: rendered.processorReport, routedFrames: rendered.routedFrames,
      scheduleDigest: rendered.scheduleDigest };
    const wav = encodeFloatWav(raw.left, raw.right, raw.sampleRate);
    await writeFile(resolve(evidenceDir, `${mode}-${condition}-10s-48khz-f32.wav`), wav);
    const measured = measurePcm(raw.left, raw.right, raw.sampleRate, raw.routedFrames);
    const manifest = { status: 'real-chrome-offline-audioworklet-render', mode, condition, sampleRate: raw.sampleRate,
      durationSeconds: raw.left.length / raw.sampleRate, volume: 0.35, finalGain: 0.245,
      controlledTopology: { layerCount: 1, noduleCount: 0, adjacentLinkCount: 0, plateId: firstBirth.payload.id },
      sourceFootContactWindowSimulationSeconds: [startSeconds, endSeconds],
      footContactGroups: raw.groups, individualFootContacts: raw.individualFeet,
      routedFeet: raw.routedFeet, routedStrikeMessages: raw.routedStrikes,
      expectedValidFootContactGroups: condition === 'dense' ? dense.validGroups : sparse.validGroups,
      expectedIndividualFeet: condition === 'dense' ? dense.individualFeet : sparse.individualFeet,
      sourceRun: { seed: recording.seed, fullSimulationSeconds: recording.simulationDurationSeconds },
      audioMetrics: measured, bridgeDiagnostics: raw.bridgeDiagnostics,
      sourceEventsSha256: 'to-be-filled-by-final-manifest', outputFile: `${mode}-${condition}-10s-48khz-f32.wav` };
    manifest.sourceEventsSha256 = createHash('sha256').update(compressed).digest('hex');
    manifest.workletSourceSha256 = sourceWorkletSha256;
    manifest.routedPayloadAndFrameScheduleSha256 = raw.scheduleDigest;
    manifest.processorTestReport = raw.processorReport;
    manifest.frameSchedulerAppliedEveryBridgeRoute = raw.processorReport?.injected === raw.routedStrikes
      && raw.processorReport?.rejected === 0 && raw.processorReport?.scheduled === raw.routedStrikes;
    const oppositeMode = mode === 'baseline' ? 'candidate' : 'baseline';
    const peerPath = resolve(evidenceDir, `${oppositeMode}-${condition}-metrics.json`);
    try {
      const peer = JSON.parse(await readFile(peerPath, 'utf8'));
      manifest.sameInputContactAndRoutingCounts = peer.sourceEventsSha256 === manifest.sourceEventsSha256
        && peer.footContactGroups === manifest.footContactGroups
        && peer.individualFootContacts === manifest.individualFootContacts
        && peer.routedFeet === manifest.routedFeet && peer.routedStrikeMessages === manifest.routedStrikeMessages
        && peer.routedPayloadAndFrameScheduleSha256 === manifest.routedPayloadAndFrameScheduleSha256;
      if (mode === 'candidate' && !manifest.sameInputContactAndRoutingCounts) throw new Error(`A/B payload/frame parity mismatch for ${condition}.`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      manifest.sameInputContactAndRoutingCounts = null;
    }
    if (!manifest.frameSchedulerAppliedEveryBridgeRoute) throw new Error(`AudioWorklet event schedule failed for ${mode}/${condition}.`);
    await writeFile(resolve(evidenceDir, `${mode}-${condition}-metrics.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  await writeComparisonImage(browser, server.httpServer.address().port, evidenceDir, mode);
  console.log(JSON.stringify({ mode, dense: renders.dense.groups, sparse: renders.sparse.groups,
    evidenceDir }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}

function instrumentForFrameReplay(source) {
  const constructorMarker = '    super();';
  if (!source.includes(constructorMarker)) throw new Error('Unexpected worklet constructor shape.');
  source = source.replace(constructorMarker, `${constructorMarker}\n    this.__abFrame = 0; this.__abEvents = []; this.__abCursor = 0; this.__abInjected = 0; this.__abRejected = 0;`);
  const handlerMarker = "    if (message.type === 'topology') {";
  source = source.replace(handlerMarker, `    if (message.type === 'ab-schedule') { this.__abEvents = p.events || []; this.__abCursor = 0; this.port.postMessage({ type: 'ab-ready' }); return; }\n${handlerMarker}`);
  const frameMarker = '    for (let frame = 0; frame < left.length; frame++) {';
  source = source.replace(frameMarker, `${frameMarker}\n      while (this.__abCursor < this.__abEvents.length && this.__abEvents[this.__abCursor].frame <= this.__abFrame) { const e = this.__abEvents[this.__abCursor++]; const before = this.telemetry.strikes; this.handleMessage(e.message); if (this.telemetry.strikes > before) this.__abInjected++; else this.__abRejected++; }\n      this.__abFrame++;`);
  source = source.replace("    return true;\n  }\n\n  advancePhysics()", "    if (this.__abFrame >= this.__abEndFrame && !this.__abReported) { this.__abReported = true; this.port.postMessage({ type: 'ab-done', injected: this.__abInjected, rejected: this.__abRejected, scheduled: this.__abEvents.length, diagnostics: this.getDiagnostics?.() || null }); }\n    return true;\n  }\n\n  advancePhysics()");
  source = source.replace("this.__abFrame = 0; this.__abEvents = []; this.__abCursor = 0; this.__abInjected = 0; this.__abRejected = 0;",
    "this.__abFrame = 0; this.__abEndFrame = 0; this.__abEvents = []; this.__abCursor = 0; this.__abInjected = 0; this.__abRejected = 0; this.__abReported = false;");
  source = source.replace("this.__abEvents = p.events || []; this.__abCursor = 0; this.port.postMessage",
    "this.__abEvents = p.events || []; this.__abCursor = 0; this.__abEndFrame = p.endFrame || 0; this.__abReported = false; this.port.postMessage");
  if (source === undefined || !source.includes('__abInjected++')) throw new Error('Failed to instrument deterministic frame scheduler.');
  return source;
}

function serializePageCondition(source, groups, frameFor) {
  const selectedGroups = groups.map((event, index) => ({ payload: { type: 'FOOT_CONTACT', contacts: event.payload.contacts,
    strength: event.payload.strength, simulationTimeMs: event.simulationTimeMs }, responses: source.bridgeEvents[index].responses }));
  selectedGroups.forEach((group, groupIndex) => { group.frame = frameFor(groups[groupIndex].simulationTimeMs); });
  return { groups: selectedGroups,
    individualFeet: source.individualFeet };
}

function serializeCondition(source, groups, frameFor) {
  return serializePageCondition(source, groups, frameFor);
}

function encodeFloatWav(left, right, sampleRate) {
  const bytes = Buffer.alloc(44 + left.length * 8);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(3, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 8, 28);
  bytes.writeUInt16LE(8, 32); bytes.writeUInt16LE(32, 34); bytes.write('data', 36); bytes.writeUInt32LE(left.length * 8, 40);
  for (let i = 0, offset = 44; i < left.length; i++, offset += 8) { bytes.writeFloatLE(left[i], offset); bytes.writeFloatLE(right[i], offset + 4); }
  return bytes;
}

function measurePcm(left, right, sampleRate, eventFrames = []) {
  const m = { sampleRate, samplesPerChannel: left.length, finiteSamples: 0, nonFiniteSamples: 0,
    clippingSamples: 0, clippingChannelSamplesL: 0, clippingChannelSamplesR: 0,
    peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 };
  let sumL = 0, sumR = 0, derivativeL = 0, derivativeR = 0;
  const win = Math.max(1, Math.round(sampleRate * 0.05));
  const blocksL = [], blocksR = [];
  let bL = 0, bR = 0, bN = 0, lastL = 0, lastR = 0;
  for (let i = 0; i < left.length; i++) {
    const l = left[i], r = right[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { m.nonFiniteSamples += 1; continue; }
    m.finiteSamples += 2; const al = Math.abs(l), ar = Math.abs(r);
    m.peakL = Math.max(m.peakL, al); m.peakR = Math.max(m.peakR, ar);
    if (al >= 1) m.clippingChannelSamplesL++;
    if (ar >= 1) m.clippingChannelSamplesR++;
    sumL += l*l; sumR += r*r;
    // First-difference RMS is a frequency-weighted slope proxy; it is not a band-energy estimate.
    if (i) { const dl = l - lastL, dr = r - lastR; derivativeL += dl*dl; derivativeR += dr*dr; }
    lastL = l; lastR = r;
    bL += l*l; bR += r*r; bN++;
    if (bN === win || i === left.length - 1) { blocksL.push(Math.sqrt(bL / bN)); blocksR.push(Math.sqrt(bR / bN)); bL=bR=0; bN=0; }
  }
  const cv = values => { const mean = values.reduce((a,b)=>a+b,0)/Math.max(1,values.length); const variance=values.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,values.length); return mean ? Math.sqrt(variance)/mean : 0; };
  m.rmsL = Math.sqrt(sumL / left.length); m.rmsR = Math.sqrt(sumR / right.length);
  m.clippingSamples = m.clippingChannelSamplesL + m.clippingChannelSamplesR;
  m.firstDifferenceRmsL = Math.sqrt(derivativeL / Math.max(1, left.length - 1));
  m.firstDifferenceRmsR = Math.sqrt(derivativeR / Math.max(1, right.length - 1));
  m.windowRmsCvL = cv(blocksL); m.windowRmsCvR = cv(blocksR);
  const snap = buildStratigraphyAudioSnapshot({ left, right }, { sampleRate, sourceDurationSeconds: left.length / sampleRate });
  const spectral = {};
  for (const channelName of ['left', 'right']) {
    const spec = snap.channels[channelName].spectrogram;
    let all = 0, high = 0, allN = 0, highN = 0;
    for (let f = 0; f < spec.frameCount; f++) for (let b = 0; b < spec.frequencyBins; b++) {
      const db = spec.dbfs[f * spec.frequencyBins + b]; all += db; allN++;
      if (b * sampleRate / 1024 >= 4000) { high += db; highN++; }
    }
    spectral[channelName] = { meanSpectrogramDbfs: all / allN, meanAbove4kDbfs: high / highN };
  }
  m.fixedSpectrogramSummary = spectral;
  const eventWindows = [];
  for (const eventFrame of eventFrames) {
    const start = Math.max(0, eventFrame), attackEnd = Math.min(left.length, eventFrame + Math.round(sampleRate * 0.01));
    const tailEnd = Math.min(left.length, eventFrame + Math.round(sampleRate * 0.05));
    const rms = (a, b, channel) => {
      let sum = 0; const data = channel === 'left' ? left : right;
      for (let i = a; i < b; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / Math.max(1, b - a));
    };
    eventWindows.push({ eventFrame, attack10msL: rms(start, attackEnd, 'left'), attack10msR: rms(start, attackEnd, 'right'),
      decay10to50msL: rms(attackEnd, tailEnd, 'left'), decay10to50msR: rms(attackEnd, tailEnd, 'right') });
  }
  m.routedEventWindows = eventWindows;
  m.routedEventWindowCounts = eventWindows.length;
  return m;
}

async function writeComparisonImage(browser, port, directory, mode) {
  const files = [];
  for (const kind of ['dense', 'sparse']) for (const variant of ['baseline', 'candidate']) {
    const p = resolve(directory, `${variant}-${kind}-10s-48khz-f32.wav`);
    try { await readFile(p); files.push({ variant, kind, p }); } catch { /* other A/B pass has not been rendered yet */ }
  }
  if (files.length !== 4) return;
  const rows = [];
  for (const file of files) {
    const bytes = await readFile(file.p);
    const n = bytes.readUInt32LE(40) / 8, left = new Float32Array(n), right = new Float32Array(n);
    for (let i=0, off=44;i<n;i++,off+=8){left[i]=bytes.readFloatLE(off);right[i]=bytes.readFloatLE(off+4);}
    rows.push({ label: `${file.kind === 'dense' ? 'Dense natural stream' : 'Sparse isolated contacts'} · ${file.variant === 'baseline' ? 'A instant' : 'B pulse + local memory'} · 10.00 s`, left:Array.from(left),right:Array.from(right),sampleRate:48000 });
  }
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${port}`, { waitUntil:'domcontentloaded' });
  const base64 = await page.evaluate(async payload => {
    const { renderStratigraphyAudioComparison, buildStratigraphyAudioSnapshot } = await import('/scripts/audio-snapshot-renderer.js');
    const prepared = payload.map(row => ({ label: row.label, snapshot: buildStratigraphyAudioSnapshot({
      left: Float32Array.from(row.left), right: Float32Array.from(row.right)
    }, { sampleRate: row.sampleRate, sourceDurationSeconds: 10 }) }));
    const canvas = document.createElement('canvas'); renderStratigraphyAudioComparison(canvas, prepared);
    return canvas.toDataURL('image/png').split(',')[1];
  }, rows);
  await writeFile(resolve(directory, 'aligned-ab-10s-fixed-scale.png'), Buffer.from(base64, 'base64'));
  await page.close();
}
